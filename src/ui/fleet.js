import { $, fmt, uid, findById, debounce } from '../utils.js';
import { DATA } from '../data.js';
import { GS, cityById } from '../state.js';
import { TIME_COSTS, VEHICLE_STATUS_INFO, NEXT_ACTION_LABELS } from '../constants.js';
import { addTransaction } from '../game/finance.js';
import { createVehicle, updatePositionForVehicle, getVehicleEffectiveCapacity } from '../game/vehicles.js';
import { advanceGameTime, getVehicleActiveOrderId } from '../game/engine.js';
import { getDistance, findShortestPath, routeDistance } from '../routing.js';
import { showToast } from './notifications.js';
import { navigateToScreen } from './screens.js';

/**
 * Checks whether a vehicle is idle (available for operations).
 * Shows a warning toast and returns false if unavailable.
 */
function _checkVehicleAvailable(v) {
  if (v.status !== 'idle') {
    showToast('Fahrzeug ist gerade nicht verfügbar.', 'warning');
    return false;
  }
  return true;
}

/**
 * Checks whether a vehicle is currently at the company HQ.
 * Shows a warning toast and returns false if not at HQ.
 */
function _checkVehicleAtHQ(v) {
  if (v.currentCity !== GS.company.hqCity) {
    showToast('Fahrzeug befindet sich nicht am Firmensitz.', 'warning');
    return false;
  }
  return true;
}

/** Formats a duration in minutes as a German human-readable string. */
function _fmtMinutes(mins) {
  if (mins === null || mins === undefined || mins < 0) return '–';
  const m = Math.round(mins);
  if (m < 60) return `${m} Min`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  if (h < 24) return rem > 0 ? `${h} Std ${rem} Min` : `${h} Std`;
  const days = Math.floor(h / 24);
  const hrs = h % 24;
  return hrs > 0 ? `${days} T ${hrs} Std` : `${days} T`;
}

/**
 * Calculates the estimated driving time (in minutes) from the vehicle's
 * current in-route position to the stop at targetStopIdx.
 * Returns null if the vehicle is not driving or the index is out of range.
 */
function _minsToStopIdx(v, cat, targetStopIdx) {
  if (v.status !== 'driving' || !v.route?.stops) return null;
  const stops = v.route.stops;
  const idx = v.route.currentStopIndex;
  if (targetStopIdx <= idx || targetStopIdx >= stops.length) return null;

  const kmPerMin = (cat.speed * GS.market.speedMod) / 60;
  const legDist = getDistance(stops[idx].cityId, stops[idx + 1].cityId);
  let km = legDist * (1 - v.route.progressPct / 100);
  for (let i = idx + 1; i < targetStopIdx; i++) {
    km += getDistance(stops[i].cityId, stops[i + 1].cityId);
  }
  return (km / kmPerMin) + (v.refuelPauseMinutes || 0);
}

/**
 * Returns all upcoming stops (after current position) whose action is
 * pickup, delivery, or return (i.e. not transit / depart).
 * Returns array of { stop, stopIndex }.
 */
function _allMeaningfulStops(v) {
  if (v.status !== 'driving' || !v.route?.stops) return [];
  const stops = v.route.stops;
  const idx = v.route.currentStopIndex;
  const result = [];
  for (let i = idx + 1; i < stops.length; i++) {
    const s = stops[i];
    if (s.action && s.action !== 'transit' && s.action !== 'depart') {
      result.push({ stop: s, stopIndex: i });
    }
  }
  return result;
}

/**
 * Returns the current cargo state of a vehicle:
 * whether it is loaded, the loaded weight, and the effective capacity.
 */
function _getCargoInfo(v) {
  const capacity = getVehicleEffectiveCapacity(v);
  if (v.status !== 'driving' || !v.route?.stops) return { loaded: false, weight: 0, capacity };
  const activeOrderId = getVehicleActiveOrderId(v);
  if (!activeOrderId) return { loaded: false, weight: 0, capacity };

  const stops = v.route.stops;
  const pickupIdx   = stops.findIndex(s => s.action === 'pickup'   && s.orderId === activeOrderId);
  const deliveryIdx = stops.findIndex(s => s.action === 'delivery' && s.orderId === activeOrderId);
  if (pickupIdx < 0 || deliveryIdx < 0) return { loaded: false, weight: 0, capacity };

  const currentIdx = v.route.currentStopIndex;
  if (currentIdx < pickupIdx || currentIdx >= deliveryIdx) return { loaded: false, weight: 0, capacity };

  const order = findById(GS.orders.active, activeOrderId);
  if (!order) return { loaded: false, weight: 0, capacity };
  const loadedWeight = Math.min(
    capacity,
    order.remainingWeight !== undefined ? order.remainingWeight : order.weight,
  );
  return { loaded: true, weight: loadedWeight, capacity };
}

/**
 * Estimates the minutes until each queued order can be started.
 * Returns an array (same length as v.orderQueue) of { orderId, minsUntilStart }.
 */
function _getQueueTiming(v, cat) {
  if (!v.orderQueue || v.orderQueue.length === 0) return [];

  const kmPerMin = (cat.speed * GS.market.speedMod) / 60;
  let accMins = v.status === 'driving'
    ? (_minsToStopIdx(v, cat, v.route.stops.length - 1) || 0)
    : 0;
  let fromCity = v.homeCity;

  return v.orderQueue.map(orderId => {
    const minsUntilStart = accMins;
    const order = findById(GS.orders.active, orderId);
    if (order) {
      const d1 = routeDistance(findShortestPath(fromCity, order.origin).map(id => ({ cityId: id })));
      const d2 = routeDistance(findShortestPath(order.origin, order.destination).map(id => ({ cityId: id })));
      const d3 = routeDistance(findShortestPath(order.destination, v.homeCity).map(id => ({ cityId: id })));
      accMins += (d1 + d2 + d3) / kmPerMin;
      fromCity = v.homeCity;
    }
    return { orderId, minsUntilStart };
  });
}

/**
 * Builds the HTML string for a single vehicle card.
 * The outer element carries a `data-vid` attribute used for targeted updates.
 */
function _buildVehicleCardHtml(v) {
  const cat    = findById(DATA.VEHICLES, v.catalogId);
  const driver = findById(GS.staff, v.driverId);
  const statusInfo = VEHICLE_STATUS_INFO[v.status] || { badge: 'badge-neutral', label: v.status };

  const healthColor = v.health > 60 ? 'green' : v.health > 30 ? 'yellow' : 'red';
  const fuelColor   = (v.fuel / cat.fuelCapacity * 100) > 30 ? 'green' : 'red';
  const currentLoc  = v.status === 'driving' && v.route.stops.length > 0
    ? `→ ${_getCityName(v.route.stops[v.route.stops.length - 1].cityId)}`
    : _getCityName(v.currentCity);

  const freeDrivers = GS.staff.filter(s => s.role === 'driver' && !s.vehicleId);
  const driverOpts  = freeDrivers.map(d => `<option value="${d.id}">${d.name}</option>`).join('');

  const cargoInfo          = _getCargoInfo(v);
  const allMeaningfulStops = _allMeaningfulStops(v);
  const queueTiming        = _getQueueTiming(v, cat);

  return `
    <div class="vehicle-card" data-vid="${v.id}">
      <div class="vehicle-card-header">
        <div class="vehicle-icon-box">${cat.icon}</div>
        <div class="vehicle-info">
          <div class="vehicle-name">${v.name}</div>
          <div class="vehicle-model">${cat.model}</div>
        </div>
        <span class="badge ${statusInfo.badge}">${statusInfo.label}</span>
      </div>

      <div class="vehicle-stats">
        <div class="vehicle-stat">
          <span class="stat-label">Fahrer</span>
          <span class="stat-value">${driver ? driver.name : '<em>Kein Fahrer</em>'}</span>
        </div>
        <div class="vehicle-stat">
          <span class="stat-label">Standort</span>
          <span class="stat-value">${currentLoc}</span>
        </div>
        <div class="vehicle-stat">
          <span class="stat-label">Nutzlast</span>
          <span class="stat-value">${(() => {
            if (!v.trailerId) return fmt.weight(cat.capacity);
            const tr = findById(DATA.TRAILERS, v.trailerId);
            return tr && tr.capacityBonus
              ? `${fmt.weight(cat.capacity)} + ${fmt.weight(tr.capacityBonus)}`
              : fmt.weight(cat.capacity);
          })()}</span>
        </div>
        <div class="vehicle-stat">
          <span class="stat-label">km-Stand</span>
          <span class="stat-value">${fmt.km(Math.round(v.odometer))}</span>
        </div>
        ${v.trailerId ? (() => {
          const trailer = findById(DATA.TRAILERS, v.trailerId);
          return trailer ? `
        <div class="vehicle-stat">
          <span class="stat-label">Anhänger</span>
          <span class="stat-value">${trailer.icon} ${trailer.name}</span>
        </div>` : '';
        })() : ''}
        ${v.status === 'driving' && allMeaningfulStops.length > 0 ? `
        <div class="vehicle-stat" style="grid-column: span 2; align-items: flex-start">
          <span class="stat-label">Nächste Ziele</span>
          <div class="stat-value" style="width:100%">
            ${allMeaningfulStops.map((ms, i) => {
              const label = NEXT_ACTION_LABELS[ms.stop.action] || ms.stop.action;
              const etaMs = _minsToStopIdx(v, cat, ms.stopIndex);
              return `<div class="text-sm" style="${i > 0 ? 'margin-top:0.2rem;' : ''}">
                ${i + 1}. ${label}: ${_getCityName(ms.stop.cityId)} <span class="text-muted" style="font-weight:400;font-size:0.7rem">(ca. ${_fmtMinutes(etaMs)})</span>
              </div>`;
            }).join('')}
          </div>
        </div>` : ''}
        ${(v.orderQueue && v.orderQueue.length > 0) ? `
        <div class="vehicle-stat" style="align-items:flex-start">
          <span class="stat-label">Warteschlange</span>
          <div class="stat-value" style="width:100%">
            ${v.orderQueue.map((oid, idx) => {
              const qOrder = findById(GS.orders.active, oid);
              const label  = qOrder
                ? `${qOrder.clientName}: ${_getCityName(qOrder.origin)}→${_getCityName(qOrder.destination)}`
                : oid;
              return `
              <div class="queue-item flex items-center gap-sm" style="margin-top:0.25rem">
                <div style="flex:1;min-width:0">
                  <div class="text-sm" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${label}">${idx + 1}. ${label}</div>
                  ${queueTiming[idx] ? `<div class="text-muted" style="font-size:0.7rem">ca. ${_fmtMinutes(queueTiming[idx].minsUntilStart)} bis Start</div>` : ''}
                </div>
                <button class="btn btn-secondary btn-xs" title="Nach oben"
                  ${idx === 0 ? 'disabled' : ''}
                  onclick="moveOrderInQueue('${v.id}', ${idx}, ${idx - 1})">▲</button>
                <button class="btn btn-secondary btn-xs" title="Nach unten"
                  ${idx === v.orderQueue.length - 1 ? 'disabled' : ''}
                  onclick="moveOrderInQueue('${v.id}', ${idx}, ${idx + 1})">▼</button>
              </div>`;
            }).join('')}
          </div>
        </div>` : ''}
      </div>

      <div>
        <div class="flex items-center justify-between text-sm mb-1">
          <span class="text-muted">Zustand</span>
          <span>${Math.round(v.health)} %</span>
        </div>
        <div class="progress">
          <div class="progress-bar ${healthColor}" style="width:${v.health}%"></div>
        </div>
      </div>

      <div>
        <div class="flex items-center justify-between text-sm mb-1">
          <span class="text-muted">Kraftstoff</span>
          <span>${Math.round(v.fuel)} / ${cat.fuelCapacity} L</span>
        </div>
        <div class="progress">
          <div class="progress-bar ${fuelColor}" style="width:${v.fuel / cat.fuelCapacity * 100}%"></div>
        </div>
      </div>

      ${cargoInfo.loaded ? `
      <div>
        <div class="flex items-center justify-between text-sm mb-1">
          <span class="text-muted">Beladung</span>
          <span>${fmt.weight(cargoInfo.weight)} / ${fmt.weight(cargoInfo.capacity)} (${Math.round(cargoInfo.weight / cargoInfo.capacity * 100)} %)</span>
        </div>
        <div class="progress">
          <div class="progress-bar blue" style="width:${Math.round(cargoInfo.weight / cargoInfo.capacity * 100)}%"></div>
        </div>
      </div>` : ''}

      ${v.status === 'idle' && !v.driverId && freeDrivers.length > 0 ? `
      <div class="flex gap-sm items-center">
        <select class="form-control" id="drv-sel-${v.id}" style="flex:1">
          <option value="">Fahrer auswählen…</option>
          ${driverOpts}
        </select>
        <button class="btn btn-secondary btn-sm" title="Fahrer zuweisen: +${TIME_COSTS.assignDriver} Min" onclick="assignDriver('${v.id}')">Zuweisen</button>
      </div>` : ''}

      ${v.status === 'idle' && v.driverId && v.currentCity === GS.company.hqCity ? `
      <div class="flex gap-sm items-center">
        <button class="btn btn-warning btn-sm" title="Fahrer entfernen: +${TIME_COSTS.removeDriver} Min" onclick="removeDriver('${v.id}')">👤 Fahrer entfernen</button>
      </div>` : ''}

      ${(() => {
        if (!cat.trailerSlot || v.status !== 'idle' || v.currentCity !== GS.company.hqCity) return '';
        const compatibleTrailers = DATA.TRAILERS.filter(t => t.compatibleWith.includes(cat.id));
        const poolCompatible = GS.trailers.filter(ti => {
          const tcat = findById(DATA.TRAILERS, ti.catalogId);
          return tcat && tcat.compatibleWith.includes(cat.id);
        });
        if (v.trailerId) {
          const attached = findById(DATA.TRAILERS, v.trailerId);
          return `
      <div class="flex gap-sm items-center">
        <span class="text-sm text-muted" style="flex:1">${attached ? `${attached.icon} ${attached.name}` : ''}</span>
        <button class="btn btn-warning btn-sm" title="Anhänger abkoppeln: +${TIME_COSTS.detachTrailer} Min" onclick="detachTrailerFromVehicle('${v.id}')">🔗 Anhänger abkoppeln</button>
      </div>`;
        }
        let html = '';
        if (compatibleTrailers.length > 0) {
          html += `
      <div class="flex gap-sm items-center">
        <select class="form-control" id="buy-trailer-sel-${v.id}" style="flex:1">
          <option value="">— Anhänger kaufen —</option>
          ${compatibleTrailers.map(t => `<option value="${t.id}">${t.icon} ${t.name} (${fmt.money(t.purchasePrice)})</option>`).join('')}
        </select>
        <button class="btn btn-primary btn-sm" title="Anhänger kaufen: +${TIME_COSTS.buyTrailer} Min" onclick="buyTrailerForVehicle('${v.id}')">Kaufen</button>
      </div>`;
        }
        if (poolCompatible.length > 0) {
          html += `
      <div class="flex gap-sm items-center">
        <select class="form-control" id="attach-trailer-sel-${v.id}" style="flex:1">
          <option value="">— Aus Fuhrpark ankoppeln —</option>
          ${poolCompatible.map(ti => {
            const tcat = findById(DATA.TRAILERS, ti.catalogId);
            return `<option value="${ti.id}">${tcat.icon} ${tcat.name}</option>`;
          }).join('')}
        </select>
        <button class="btn btn-secondary btn-sm" title="Anhänger ankoppeln: +${TIME_COSTS.attachTrailer} Min" onclick="attachTrailerToVehicle('${v.id}')">Ankoppeln</button>
      </div>`;
        }
        return html;
      })()}

      <div class="vehicle-actions">
        ${v.status === 'idle' ? `<button class="btn btn-secondary btn-sm" title="Route planen: +${TIME_COSTS.navigate} Min" onclick="openRouteForVehicle('${v.id}')">🗺️ Route planen</button>` : ''}
        ${v.status === 'idle' && v.health < 70 ? `<button class="btn btn-warning btn-sm" title="Wartung: +${TIME_COSTS.maintenance} Min" onclick="sendToMaintenance('${v.id}')">🔧 Wartung</button>` : ''}
        ${v.status === 'broken' ? `<button class="btn btn-danger btn-sm" title="Reparieren: +${TIME_COSTS.repair} Min" onclick="repairVehicle('${v.id}')">🔧 Reparieren</button>` : ''}
        ${v.status === 'idle' ? `<button class="btn btn-danger btn-sm" title="Verkaufen: +${TIME_COSTS.sellVehicle} Min" onclick="sellVehicle('${v.id}')">💰 Verkaufen</button>` : ''}
      </div>
    </div>`;
}

/** Per-vehicle HTML cache: maps vehicle id → last rendered HTML string. */
const _vehicleCardCache = new Map();

export function renderFleet() {
  const listEl = $('fleet-list');
  if (!listEl) return;

  if (GS.vehicles.length === 0) {
    _vehicleCardCache.clear();
    const emptyHtml = `
      <div class="empty-state">
        <div class="empty-icon">🚛</div>
        <h3>Keine Fahrzeuge</h3>
        <p>Kaufen Sie Ihr erstes Fahrzeug im Fahrzeugkatalog.</p>
      </div>`;
    if (listEl.innerHTML !== emptyHtml) listEl.innerHTML = emptyHtml;
    renderTrailerPool();
    return;
  }

  // Check whether the vehicle list structure (order / membership) has changed.
  const currentIds = GS.vehicles.map(v => v.id).join(',');
  const renderedIds = [...listEl.children]
    .map(el => el.dataset.vid)
    .filter(Boolean)
    .join(',');

  if (currentIds !== renderedIds) {
    // Structure changed: full rebuild and repopulate cache.
    _vehicleCardCache.clear();
    listEl.innerHTML = GS.vehicles.map(v => {
      const html = _buildVehicleCardHtml(v);
      _vehicleCardCache.set(v.id, html);
      return html;
    }).join('');
  } else {
    // Structure unchanged: update only cards whose content has changed.
    const cards = [...listEl.children];
    GS.vehicles.forEach((v, i) => {
      const newHtml = _buildVehicleCardHtml(v);
      if (_vehicleCardCache.get(v.id) !== newHtml) {
        _vehicleCardCache.set(v.id, newHtml);
        if (cards[i]) cards[i].outerHTML = newHtml;
      }
    });
  }

  renderTrailerPool();
}

function _getCityName(id) {
  return cityById[id] ? cityById[id].name : id;
}

export function renderCatalog() {
  const el = $('catalog-list');
  if (!el) return;
  el.innerHTML = DATA.VEHICLES.map(cat => {
    const compatibleTrailers = cat.trailerSlot
      ? DATA.TRAILERS.filter(t => t.compatibleWith.includes(cat.id))
      : [];
    const trailerSelect = compatibleTrailers.length > 0 ? `
      <div class="catalog-trailer-select mt-sm">
        <label class="text-sm text-muted" for="trailer-sel-${cat.id}">Anhänger (optional):</label>
        <select class="form-control mt-xs" id="trailer-sel-${cat.id}">
          <option value="">— Kein Anhänger —</option>
          ${compatibleTrailers.map(t => `<option value="${t.id}">${t.icon} ${t.name} (+${fmt.money(t.purchasePrice)})</option>`).join('')}
        </select>
      </div>` : '';
    return `
    <div class="catalog-card">
      <h3>${cat.icon} ${cat.name}</h3>
      <div class="text-muted text-sm">${cat.model}</div>
      <div class="catalog-desc">${cat.description}</div>
      <div class="catalog-specs">
        <div class="catalog-spec-item"><span class="spec-key">Nutzlast:</span> ${fmt.weight(cat.capacity)}</div>
        <div class="catalog-spec-item"><span class="spec-key">Tempo:</span> ${cat.speed} km/h</div>
        <div class="catalog-spec-item"><span class="spec-key">Tank:</span> ${cat.fuelCapacity} L</div>
        <div class="catalog-spec-item"><span class="spec-key">Verbrauch:</span> ${cat.fuelConsumption} L/100km</div>
        <div class="catalog-spec-item"><span class="spec-key">Wartung:</span> ${fmt.money(cat.maintenanceCostPerMonth)}/Mo</div>
        ${cat.requirements.length ? `<div class="catalog-spec-item"><span class="spec-key">Anforderungen:</span> ${cat.requirements.join(', ')}</div>` : ''}
        ${cat.trailerSlot ? `<div class="catalog-spec-item"><span class="spec-key">Anhänger:</span> ✓ möglich</div>` : ''}
      </div>
      ${trailerSelect}
      <div class="catalog-price">${fmt.money(cat.purchasePrice)}</div>
      <button class="btn btn-primary w-full mt-sm" title="Fahrzeug kaufen: +${TIME_COSTS.buyVehicle} Min" onclick="buyVehicle('${cat.id}')">Kaufen</button>
    </div>
  `;
  }).join('');
}

export function assignDriver(vehicleId) {
  const sel = $('drv-sel-' + vehicleId);
  if (!sel || !sel.value) return;
  const driverId = sel.value;
  const vehicle = findById(GS.vehicles, vehicleId);
  const driver  = findById(GS.staff, driverId);
  if (!vehicle || !driver) return;
  if (driver.vehicleId) {
    const old = findById(GS.vehicles, driver.vehicleId);
    if (old) old.driverId = null;
  }
  vehicle.driverId = driverId;
  driver.vehicleId = vehicleId;
  showToast(`${driver.name} fährt jetzt ${vehicle.name}`, 'success');
  advanceGameTime(TIME_COSTS.assignDriver, 'Fahrerzuweisung');
  renderFleet();
}

export function removeDriver(vehicleId) {
  const vehicle = findById(GS.vehicles, vehicleId);
  if (!vehicle || !vehicle.driverId) return;
  if (!_checkVehicleAvailable(vehicle)) return;
  if (!_checkVehicleAtHQ(vehicle)) return;
  const driver = findById(GS.staff, vehicle.driverId);
  if (driver) driver.vehicleId = null;
  vehicle.driverId = null;
  showToast(`${driver ? driver.name : 'Fahrer'} wurde vom Fahrzeug entfernt.`, 'success');
  advanceGameTime(TIME_COSTS.removeDriver, 'Fahrerentfernung');
  renderFleet();
}

export function sendToMaintenance(vehicleId) {
  const v = findById(GS.vehicles, vehicleId);
  if (!v) return;
  const cat = findById(DATA.VEHICLES, v.catalogId);
  const cost = Math.round((100 - v.health) * cat.purchasePrice * 0.002);
  if (GS.finance.balance < cost) { showToast('Nicht genug Geld für die Wartung.', 'danger'); return; }
  v.status = 'maintenance';
  addTransaction(`Wartung: ${v.name}`, -cost);
  v.health = 100;
  advanceGameTime(TIME_COSTS.maintenance, 'Wartungsauftrag');
  setTimeout(() => {
    v.status = 'idle';
    showToast(`${v.name} ist wieder einsatzbereit.`, 'success');
    if ($('fleet-list')) renderFleet();
  }, 5000);
  renderFleet();
}

export function repairVehicle(vehicleId) {
  const v = findById(GS.vehicles, vehicleId);
  if (!v) return;
  const cat = findById(DATA.VEHICLES, v.catalogId);
  const cost = Math.round(cat.purchasePrice * 0.05);
  if (GS.finance.balance < cost) { showToast('Nicht genug Geld für die Reparatur.', 'danger'); return; }
  addTransaction(`Reparatur: ${v.name}`, -cost);
  v.status = 'idle';
  v.health = 80;
  v.fuel   = cat.fuelCapacity;
  showToast(`${v.name} repariert!`, 'success');
  advanceGameTime(TIME_COSTS.repair, 'Fahrzeugreparatur');
  renderFleet();
}

export function sellVehicle(vehicleId) {
  const v = findById(GS.vehicles, vehicleId);
  if (!v) return;
  if (!_checkVehicleAvailable(v)) return;
  const cat = findById(DATA.VEHICLES, v.catalogId);
  const salePrice = Math.round(cat.purchasePrice * 0.55 * (v.health / 100));
  if (confirm(`${v.name} für ${fmt.money(salePrice)} verkaufen?`)) {
    if (v.driverId) {
      const drv = findById(GS.staff, v.driverId);
      if (drv) drv.vehicleId = null;
    }
    if (v.trailerId) {
      GS.trailers.push({ id: uid(), catalogId: v.trailerId });
    }
    GS.vehicles = GS.vehicles.filter(x => x.id !== vehicleId);
    addTransaction(`Fahrzeugverkauf: ${v.name}`, salePrice);
    showToast(`${v.name} verkauft für ${fmt.money(salePrice)}`, 'success');
    advanceGameTime(TIME_COSTS.sellVehicle, 'Fahrzeugverkauf');
    renderFleet();
  }
}

export function buyVehicle(catalogId) {
  const cat = findById(DATA.VEHICLES, catalogId);
  if (!cat) return;

  let trailerId = null;
  let selectedTrailer = null;
  if (cat.trailerSlot) {
    const trailerSel = $('trailer-sel-' + catalogId);
    if (trailerSel && trailerSel.value) {
      trailerId = trailerSel.value;
      selectedTrailer = findById(DATA.TRAILERS, trailerId) || null;
    }
  }

  const trailerPrice = selectedTrailer ? selectedTrailer.purchasePrice : 0;
  const totalPrice = cat.purchasePrice + trailerPrice;
  if (GS.finance.balance < totalPrice) {
    showToast('Nicht genug Geld!', 'danger'); return;
  }
  const v = createVehicle(catalogId, 'frankfurt', trailerId);
  GS.vehicles.push(v);
  addTransaction(`Fahrzeugkauf: ${cat.name}`, -cat.purchasePrice);
  if (selectedTrailer && trailerPrice > 0) {
    addTransaction(`Anhängerkauf: ${selectedTrailer.name}`, -trailerPrice);
  }
  const displayName = selectedTrailer
    ? `${cat.name} + ${selectedTrailer.name}`
    : cat.name;
  showToast(`${displayName} gekauft!`, 'success');
  advanceGameTime(TIME_COSTS.buyVehicle, 'Fahrzeugkauf');
  document.querySelectorAll('.fleet-tab').forEach(t => t.classList.remove('active'));
  $('fleet-tab-mine') && $('fleet-tab-mine').classList.add('active');
  $('catalog-list')   && ($('catalog-list').style.display   = 'none');
  $('fleet-list')     && ($('fleet-list').style.display     = '');
  $('trailer-pool')   && ($('trailer-pool').style.display   = '');
  renderFleet();
}

export function openRouteForVehicle(vehicleId) {
  GS.ui.routeVehicleId = vehicleId;
  GS.ui.routeStops = [];
  navigateToScreen('routes');
}

export function renderTrailerPool() {
  const el = $('trailer-pool');
  if (!el) return;
  if (GS.trailers.length === 0) {
    el.innerHTML = '';
    el.style.display = 'none';
    return;
  }
  el.style.display = '';
  el.innerHTML = `
    <h3 style="margin-top:1.5rem;margin-bottom:0.75rem">🔗 Anhänger im Fuhrpark</h3>
    <div class="card-grid card-grid-2">
      ${GS.trailers.map(ti => {
        const tcat = findById(DATA.TRAILERS, ti.catalogId);
        if (!tcat) return '';
        const sellPrice = Math.round(tcat.purchasePrice * 0.55);
        return `
      <div class="vehicle-card">
        <div class="vehicle-card-header">
          <div class="vehicle-icon-box">${tcat.icon}</div>
          <div class="vehicle-info">
            <div class="vehicle-name">${tcat.name}</div>
            <div class="vehicle-model">${tcat.description}</div>
          </div>
        </div>
        <div class="vehicle-stats">
          <div class="vehicle-stat">
            <span class="stat-label">Nutzlastzusatz</span>
            <span class="stat-value">${tcat.capacityBonus > 0 ? fmt.weight(tcat.capacityBonus) : '–'}</span>
          </div>
          <div class="vehicle-stat">
            <span class="stat-label">Kompatibel mit</span>
            <span class="stat-value">${tcat.compatibleWith.map(id => {
              const vcat = findById(DATA.VEHICLES, id);
              return vcat ? vcat.name : id;
            }).join(', ')}</span>
          </div>
        </div>
        <div class="vehicle-actions">
          <button class="btn btn-danger btn-sm" title="Anhänger verkaufen: +${TIME_COSTS.sellVehicle} Min" onclick="sellTrailer('${ti.id}')">💰 Verkaufen (${fmt.money(sellPrice)})</button>
        </div>
      </div>`;
      }).join('')}
    </div>`;
}

export function buyTrailerForVehicle(vehicleId) {
  const v = findById(GS.vehicles, vehicleId);
  if (!v) return;
  if (!_checkVehicleAvailable(v)) return;
  if (!_checkVehicleAtHQ(v)) return;
  if (v.trailerId) { showToast('Fahrzeug hat bereits einen Anhänger.', 'warning'); return; }
  const sel = $('buy-trailer-sel-' + vehicleId);
  if (!sel || !sel.value) { showToast('Bitte einen Anhänger auswählen.', 'warning'); return; }
  const trailer = findById(DATA.TRAILERS, sel.value);
  if (!trailer) return;
  if (GS.finance.balance < trailer.purchasePrice) { showToast('Nicht genug Geld!', 'danger'); return; }
  v.trailerId = trailer.id;
  addTransaction(`Anhängerkauf: ${trailer.name}`, -trailer.purchasePrice);
  showToast(`${trailer.icon} ${trailer.name} an ${v.name} angekoppelt!`, 'success');
  advanceGameTime(TIME_COSTS.buyTrailer, 'Anhängerkauf');
  renderFleet();
}

export function detachTrailerFromVehicle(vehicleId) {
  const v = findById(GS.vehicles, vehicleId);
  if (!v) return;
  if (!_checkVehicleAvailable(v)) return;
  if (!_checkVehicleAtHQ(v)) return;
  if (!v.trailerId) { showToast('Fahrzeug hat keinen Anhänger.', 'warning'); return; }
  const trailer = findById(DATA.TRAILERS, v.trailerId);
  GS.trailers.push({ id: uid(), catalogId: v.trailerId });
  v.trailerId = null;
  showToast(`${trailer ? `${trailer.icon} ${trailer.name}` : 'Anhänger'} abgekoppelt und im Fuhrpark eingelagert.`, 'success');
  advanceGameTime(TIME_COSTS.detachTrailer, 'Anhänger abkoppeln');
  renderFleet();
}

export function attachTrailerToVehicle(vehicleId) {
  const v = findById(GS.vehicles, vehicleId);
  if (!v) return;
  if (!_checkVehicleAvailable(v)) return;
  if (!_checkVehicleAtHQ(v)) return;
  if (v.trailerId) { showToast('Fahrzeug hat bereits einen Anhänger.', 'warning'); return; }
  const sel = $('attach-trailer-sel-' + vehicleId);
  if (!sel || !sel.value) { showToast('Bitte einen Anhänger auswählen.', 'warning'); return; }
  const trailerInstance = findById(GS.trailers, sel.value);
  if (!trailerInstance) { showToast('Anhänger nicht gefunden.', 'warning'); return; }
  const tcat = findById(DATA.TRAILERS, trailerInstance.catalogId);
  if (!tcat) return;
  const cat = findById(DATA.VEHICLES, v.catalogId);
  if (!cat || !tcat.compatibleWith.includes(cat.id)) { showToast('Anhänger ist nicht kompatibel mit diesem Fahrzeug.', 'warning'); return; }
  v.trailerId = trailerInstance.catalogId;
  GS.trailers = GS.trailers.filter(ti => ti.id !== trailerInstance.id);
  showToast(`${tcat.icon} ${tcat.name} an ${v.name} angekoppelt!`, 'success');
  advanceGameTime(TIME_COSTS.attachTrailer, 'Anhänger ankoppeln');
  renderFleet();
}

export function sellTrailer(trailerInstanceId) {
  const ti = findById(GS.trailers, trailerInstanceId);
  if (!ti) return;
  const tcat = findById(DATA.TRAILERS, ti.catalogId);
  if (!tcat) return;
  const sellPrice = Math.round(tcat.purchasePrice * 0.55);
  if (confirm(`${tcat.icon} ${tcat.name} für ${fmt.money(sellPrice)} verkaufen?`)) {
    GS.trailers = GS.trailers.filter(x => x.id !== trailerInstanceId);
    addTransaction(`Anhängerverkauf: ${tcat.name}`, sellPrice);
    showToast(`${tcat.icon} ${tcat.name} verkauft für ${fmt.money(sellPrice)}`, 'success');
    advanceGameTime(TIME_COSTS.sellVehicle, 'Anhängerverkauf');
    renderFleet();
  }
}
