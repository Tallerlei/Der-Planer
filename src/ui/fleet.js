import { $, fmt } from '../utils.js';
import { DATA } from '../data.js';
import { GS, cityById } from '../state.js';
import { TIME_COSTS } from '../constants.js';
import { addTransaction } from '../game/finance.js';
import { createVehicle, updatePositionForVehicle, getVehicleEffectiveCapacity } from '../game/vehicles.js';
import { advanceGameTime, getVehicleActiveOrderId } from '../game/engine.js';
import { getDistance, findShortestPath, routeDistance } from '../routing.js';
import { showToast } from './notifications.js';
import { navigateToScreen } from './screens.js';

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
 * Finds the next stop (after current position) whose action is
 * pickup, delivery, or return (i.e. not transit / depart).
 * Returns { stop, stopIndex } or null.
 */
function _nextMeaningfulStop(v) {
  if (v.status !== 'driving' || !v.route?.stops) return null;
  const stops = v.route.stops;
  const idx = v.route.currentStopIndex;
  for (let i = idx + 1; i < stops.length; i++) {
    const s = stops[i];
    if (s.action && s.action !== 'transit' && s.action !== 'depart') {
      return { stop: s, stopIndex: i };
    }
  }
  return null;
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

  const order = GS.orders.active.find(o => o.id === activeOrderId);
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
    const order = GS.orders.active.find(o => o.id === orderId);
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

export function renderFleet() {
  const listEl = $('fleet-list');
  if (!listEl) return;

  if (GS.vehicles.length === 0) {
    listEl.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">🚛</div>
        <h3>Keine Fahrzeuge</h3>
        <p>Kaufen Sie Ihr erstes Fahrzeug im Fahrzeugkatalog.</p>
      </div>`;
    return;
  }

  listEl.innerHTML = GS.vehicles.map(v => {
    const cat    = DATA.VEHICLES.find(c => c.id === v.catalogId);
    const driver = GS.staff.find(s => s.id === v.driverId);
    const statusInfo = {
      idle:        { badge: 'badge-success',  label: 'Bereit' },
      driving:     { badge: 'badge-info',     label: 'Unterwegs' },
      maintenance: { badge: 'badge-warning',  label: 'Wartung' },
      broken:      { badge: 'badge-danger',   label: 'Defekt' },
    }[v.status] || { badge: 'badge-neutral', label: v.status };

    const healthColor = v.health > 60 ? 'green' : v.health > 30 ? 'yellow' : 'red';
    const fuelColor   = (v.fuel / cat.fuelCapacity * 100) > 30 ? 'green' : 'red';
    const currentLoc  = v.status === 'driving' && v.route.stops.length > 0
      ? `→ ${_getCityName(v.route.stops[v.route.stops.length - 1].cityId)}`
      : _getCityName(v.currentCity);

    const freeDrivers = GS.staff.filter(s => s.role === 'driver' && !s.vehicleId);
    const driverOpts  = freeDrivers.map(d => `<option value="${d.id}">${d.name}</option>`).join('');

    const cargoInfo      = _getCargoInfo(v);
    const nextMeaningful = _nextMeaningfulStop(v);
    const etaMins        = nextMeaningful ? _minsToStopIdx(v, cat, nextMeaningful.stopIndex) : null;
    const queueTiming    = _getQueueTiming(v, cat);
    const nextActionLabels = { pickup: 'Abholung', delivery: 'Lieferung', return: 'Rückkehr' };
    const nextActionLabel = nextMeaningful
      ? (nextActionLabels[nextMeaningful.stop.action] || nextMeaningful.stop.action)
      : null;

    return `
    <div class="vehicle-card">
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
            const tr = DATA.TRAILERS.find(t => t.id === v.trailerId);
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
          const trailer = DATA.TRAILERS.find(t => t.id === v.trailerId);
          return trailer ? `
        <div class="vehicle-stat">
          <span class="stat-label">Anhänger</span>
          <span class="stat-value">${trailer.icon} ${trailer.name}</span>
        </div>` : '';
        })() : ''}
        ${v.status === 'driving' && nextMeaningful ? `
        <div class="vehicle-stat" style="grid-column: span 2">
          <span class="stat-label">Nächstes Ziel</span>
          <span class="stat-value">${nextActionLabel}: ${_getCityName(nextMeaningful.stop.cityId)} <span class="text-muted" style="font-weight:400;font-size:0.7rem">(ca. ${_fmtMinutes(etaMins)})</span></span>
        </div>` : ''}
        ${(v.orderQueue && v.orderQueue.length > 0) ? `
        <div class="vehicle-stat" style="align-items:flex-start">
          <span class="stat-label">Warteschlange</span>
          <div class="stat-value" style="width:100%">
            ${v.orderQueue.map((oid, idx) => {
              const qOrder = GS.orders.active.find(o => o.id === oid);
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

      <div class="vehicle-actions">
        ${v.status === 'idle' ? `<button class="btn btn-secondary btn-sm" title="Route planen: +${TIME_COSTS.navigate} Min" onclick="openRouteForVehicle('${v.id}')">🗺️ Route planen</button>` : ''}
        ${v.status === 'idle' && v.health < 70 ? `<button class="btn btn-warning btn-sm" title="Wartung: +${TIME_COSTS.maintenance} Min" onclick="sendToMaintenance('${v.id}')">🔧 Wartung</button>` : ''}
        ${v.status === 'broken' ? `<button class="btn btn-danger btn-sm" title="Reparieren: +${TIME_COSTS.repair} Min" onclick="repairVehicle('${v.id}')">🔧 Reparieren</button>` : ''}
        ${v.status === 'idle' ? `<button class="btn btn-danger btn-sm" title="Verkaufen: +${TIME_COSTS.sellVehicle} Min" onclick="sellVehicle('${v.id}')">💰 Verkaufen</button>` : ''}
      </div>
    </div>`;
  }).join('');
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
  const vehicle = GS.vehicles.find(v => v.id === vehicleId);
  const driver  = GS.staff.find(s => s.id === driverId);
  if (!vehicle || !driver) return;
  if (driver.vehicleId) {
    const old = GS.vehicles.find(v => v.id === driver.vehicleId);
    if (old) old.driverId = null;
  }
  vehicle.driverId = driverId;
  driver.vehicleId = vehicleId;
  showToast(`${driver.name} fährt jetzt ${vehicle.name}`, 'success');
  advanceGameTime(TIME_COSTS.assignDriver, 'Fahrerzuweisung');
  renderFleet();
}

export function removeDriver(vehicleId) {
  const vehicle = GS.vehicles.find(v => v.id === vehicleId);
  if (!vehicle || !vehicle.driverId) return;
  if (vehicle.status !== 'idle') { showToast('Fahrzeug ist gerade nicht verfügbar.', 'warning'); return; }
  if (vehicle.currentCity !== GS.company.hqCity) { showToast('Fahrzeug befindet sich nicht am Firmensitz.', 'warning'); return; }
  const driver = GS.staff.find(s => s.id === vehicle.driverId);
  if (driver) driver.vehicleId = null;
  vehicle.driverId = null;
  showToast(`${driver ? driver.name : 'Fahrer'} wurde vom Fahrzeug entfernt.`, 'success');
  advanceGameTime(TIME_COSTS.removeDriver, 'Fahrerentfernung');
  renderFleet();
}

export function sendToMaintenance(vehicleId) {
  const v = GS.vehicles.find(v => v.id === vehicleId);
  if (!v) return;
  const cat = DATA.VEHICLES.find(c => c.id === v.catalogId);
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
  const v = GS.vehicles.find(v => v.id === vehicleId);
  if (!v) return;
  const cat = DATA.VEHICLES.find(c => c.id === v.catalogId);
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
  const v = GS.vehicles.find(v => v.id === vehicleId);
  if (!v) return;
  if (v.status !== 'idle') { showToast('Fahrzeug ist gerade nicht verfügbar.', 'warning'); return; }
  const cat = DATA.VEHICLES.find(c => c.id === v.catalogId);
  const salePrice = Math.round(cat.purchasePrice * 0.55 * (v.health / 100));
  if (confirm(`${v.name} für ${fmt.money(salePrice)} verkaufen?`)) {
    if (v.driverId) {
      const drv = GS.staff.find(s => s.id === v.driverId);
      if (drv) drv.vehicleId = null;
    }
    GS.vehicles = GS.vehicles.filter(x => x.id !== vehicleId);
    addTransaction(`Fahrzeugverkauf: ${v.name}`, salePrice);
    showToast(`${v.name} verkauft für ${fmt.money(salePrice)}`, 'success');
    advanceGameTime(TIME_COSTS.sellVehicle, 'Fahrzeugverkauf');
    renderFleet();
  }
}

export function buyVehicle(catalogId) {
  const cat = DATA.VEHICLES.find(c => c.id === catalogId);
  if (!cat) return;

  let trailerId = null;
  let selectedTrailer = null;
  if (cat.trailerSlot) {
    const trailerSel = $('trailer-sel-' + catalogId);
    if (trailerSel && trailerSel.value) {
      trailerId = trailerSel.value;
      selectedTrailer = DATA.TRAILERS.find(t => t.id === trailerId) || null;
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
  $('catalog-list') && ($('catalog-list').style.display = 'none');
  $('fleet-list')   && ($('fleet-list').style.display   = '');
  renderFleet();
}

export function openRouteForVehicle(vehicleId) {
  GS.ui.routeVehicleId = vehicleId;
  GS.ui.routeStops = [];
  navigateToScreen('routes');
}
