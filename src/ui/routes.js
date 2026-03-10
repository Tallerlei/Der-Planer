import { $, fmt } from '../utils.js';
import { DATA } from '../data.js';
import { GS, getCityName, cityById } from '../state.js';
import { TIME_COSTS } from '../constants.js';
import { buildRouteStops, routeDistance } from '../routing.js';
import { updatePositionForVehicle } from '../game/vehicles.js';
import { advanceGameTime } from '../game/engine.js';
import { showToast } from './notifications.js';
import { showScreen } from './screens.js';
import { drawMapOnCanvas } from './map.js';

export function renderRoutePlanner() {
  const panel = $('route-vehicle-panel');
  if (!panel) return;

  const vOpts = GS.vehicles.filter(v => v.status === 'idle' && v.driverId)
    .map(v => `<option value="${v.id}" ${v.id === GS.ui.routeVehicleId ? 'selected' : ''}>${v.name}</option>`)
    .join('');

  panel.innerHTML = `
    <div class="form-group">
      <label class="form-label">Fahrzeug</label>
      <select class="form-control" id="route-vsel" onchange="selectRouteVehicle(this.value)">
        <option value="">Fahrzeug wählen…</option>
        ${vOpts}
      </select>
    </div>`;

  renderRouteStops();
  drawRouteMap();
  renderRouteSummary();
}

export function selectRouteVehicle(id) {
  GS.ui.routeVehicleId = id;
  GS.ui.routeStops = [];
  renderRouteStops();
  renderRouteSummary();
  drawRouteMap();
}

export function renderRouteStops() {
  const el = $('route-stops');
  if (!el) return;
  const stops = GS.ui.routeStops;

  if (stops.length === 0) {
    el.innerHTML = `<div class="text-muted text-sm">Klicken Sie auf die Karte, um Stopps hinzuzufügen.</div>`;
    return;
  }

  el.innerHTML = stops.map((s, i) => {
    const city = cityById[s.cityId];
    const actionLabel = s.action === 'pickup' ? '📦 Abholung' : s.action === 'delivery' ? '📬 Lieferung' : '🏁 Depot';
    return `
    <div class="route-stop">
      <div class="stop-number">${i + 1}</div>
      <div style="flex:1">
        <div class="stop-city">${city ? city.name : s.cityId}</div>
        <div class="stop-action">${actionLabel}</div>
      </div>
      <button class="remove-stop" onclick="removeRouteStop(${i})">✕</button>
    </div>`;
  }).join('');
}

export function addRouteStop(cityId) {
  const city = cityById[cityId];
  if (!city) return;

  const pickupOrders   = GS.orders.available.filter(o => o.origin === cityId);
  const deliveryOrders = GS.orders.available.filter(o => o.destination === cityId);
  let action = 'waypoint';
  let orderId = null;

  if (pickupOrders.length > 0)        { action = 'pickup';   orderId = pickupOrders[0].id; }
  else if (deliveryOrders.length > 0) { action = 'delivery'; orderId = deliveryOrders[0].id; }

  GS.ui.routeStops.push({ cityId, action, orderId });
  renderRouteStops();
  renderRouteSummary();
  drawRouteMap();
}

export function removeRouteStop(index) {
  GS.ui.routeStops.splice(index, 1);
  renderRouteStops();
  renderRouteSummary();
  drawRouteMap();
}

export function renderRouteSummary() {
  const el = $('route-summary');
  if (!el) return;

  const stops = GS.ui.routeStops;
  if (stops.length < 2) { el.innerHTML = '<div class="text-muted text-sm">Mindestens 2 Stopps benötigt.</div>'; return; }

  const v = GS.vehicles.find(v => v.id === GS.ui.routeVehicleId);
  const keyWaypoints = v
    ? [{ cityId: v.currentCity, action: 'depart' }, ...stops]
    : stops;
  const expandedStops = buildRouteStops(keyWaypoints)
    .filter((s, i, arr) => i === 0 || s.cityId !== arr[i - 1].cityId);
  const dist    = routeDistance(expandedStops);
  const cat     = v ? DATA.VEHICLES.find(c => c.id === v.catalogId) : null;
  const hours   = cat ? Math.round(dist / cat.speed) : '?';
  const fuel    = cat ? Math.round(dist / 100 * cat.fuelConsumption) : '?';
  const fuelCost = cat ? Math.round(fuel * GS.market.fuelPrice) : '?';

  el.innerHTML = `
    <div class="route-summary-row"><span class="rs-label">Gesamtstrecke</span><span class="rs-value">${fmt.km(dist)}</span></div>
    <div class="route-summary-row"><span class="rs-label">Fahrzeit (ca.)</span><span class="rs-value">${hours}h</span></div>
    <div class="route-summary-row"><span class="rs-label">Kraftstoffkosten</span><span class="rs-value">${typeof fuelCost === 'number' ? fmt.money(fuelCost) : '?'}</span></div>
    <div class="route-summary-row"><span class="rs-label">Stopps</span><span class="rs-value">${stops.length}</span></div>
    <div class="route-summary-row time-cost-row"><span class="rs-label">⏰ Zeitaufwand</span><span class="rs-value time-cost">+${TIME_COSTS.dispatchRoute} Min</span></div>
  `;
}

export function dispatchRoute() {
  const vehicleId = GS.ui.routeVehicleId;
  const stops     = GS.ui.routeStops;

  if (!vehicleId)       { showToast('Kein Fahrzeug gewählt.', 'warning'); return; }
  if (stops.length < 2) { showToast('Mindestens 2 Stopps benötigt.', 'warning'); return; }

  const v = GS.vehicles.find(v => v.id === vehicleId);
  if (!v || v.status !== 'idle') { showToast('Fahrzeug nicht verfügbar.', 'warning'); return; }
  if (!v.driverId) { showToast('Kein Fahrer zugewiesen.', 'warning'); return; }

  const keyWaypoints = [
    { cityId: v.currentCity, action: 'depart' },
    ...stops,
  ];
  const fullStops = buildRouteStops(keyWaypoints)
    .filter((s, i, arr) => i === 0 || s.cityId !== arr[i - 1].cityId);

  v.status = 'driving';
  v.route  = {
    stops: fullStops,
    currentStopIndex: 0,
    progressPct: 0,
    totalDistance: routeDistance(fullStops),
    coveredDistance: 0,
  };
  updatePositionForVehicle(v);

  GS.ui.routeStops = [];
  showToast(`${v.name} ist losgefahren!`, 'success');
  showScreen('fleet');
  advanceGameTime(TIME_COSTS.dispatchRoute, 'Routendisposition');
}

export function drawRouteMap() {
  const canvas = $('map-canvas');
  if (!canvas) return;
  drawMapOnCanvas(canvas, GS.ui.routeStops.map(s => s.cityId), null);
}

export function handleMapClick(e) {
  const canvas = $('map-canvas');
  if (!canvas) return;
  const rect = canvas.getBoundingClientRect();
  const mx = (e.clientX - rect.left) / canvas.clientWidth * 800;
  const my = (e.clientY - rect.top)  / canvas.clientHeight * 520;

  let closest = null, minDist = 20;
  for (const city of DATA.CITIES) {
    const d = Math.sqrt(Math.pow(city.x - mx, 2) + Math.pow(city.y - my, 2));
    if (d < minDist) { minDist = d; closest = city; }
  }
  if (closest) addRouteStop(closest.id);
}
