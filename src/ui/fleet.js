import { $, fmt } from '../utils.js';
import { DATA } from '../data.js';
import { GS, cityById } from '../state.js';
import { TIME_COSTS } from '../constants.js';
import { addTransaction } from '../game/finance.js';
import { createVehicle, updatePositionForVehicle } from '../game/vehicles.js';
import { advanceGameTime } from '../game/engine.js';
import { showToast } from './notifications.js';
import { navigateToScreen } from './screens.js';

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
          <span class="stat-value">${fmt.weight(cat.capacity)}</span>
        </div>
        <div class="vehicle-stat">
          <span class="stat-label">km-Stand</span>
          <span class="stat-value">${fmt.km(Math.round(v.odometer))}</span>
        </div>
        ${(v.orderQueue && v.orderQueue.length > 0) ? `
        <div class="vehicle-stat">
          <span class="stat-label">Warteschlange</span>
          <span class="stat-value">${v.orderQueue.length} ${v.orderQueue.length !== 1 ? 'Aufträge' : 'Auftrag'}</span>
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

      ${v.status === 'idle' && !v.driverId && freeDrivers.length > 0 ? `
      <div class="flex gap-sm items-center">
        <select class="form-control" id="drv-sel-${v.id}" style="flex:1">
          <option value="">Fahrer auswählen…</option>
          ${driverOpts}
        </select>
        <button class="btn btn-secondary btn-sm" title="Fahrer zuweisen: +${TIME_COSTS.assignDriver} Min" onclick="assignDriver('${v.id}')">Zuweisen</button>
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
  el.innerHTML = DATA.VEHICLES.map(cat => `
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
      </div>
      <div class="catalog-price">${fmt.money(cat.purchasePrice)}</div>
      <button class="btn btn-primary w-full mt-sm" title="Fahrzeug kaufen: +${TIME_COSTS.buyVehicle} Min" onclick="buyVehicle('${cat.id}')">Kaufen</button>
    </div>
  `).join('');
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
  if (GS.finance.balance < cat.purchasePrice) {
    showToast('Nicht genug Geld!', 'danger'); return;
  }
  const v = createVehicle(catalogId, 'frankfurt');
  GS.vehicles.push(v);
  addTransaction(`Fahrzeugkauf: ${cat.name}`, -cat.purchasePrice);
  showToast(`${cat.name} gekauft!`, 'success');
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
