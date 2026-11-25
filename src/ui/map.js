import { $ } from '../utils.js';
import { DATA } from '../data.js';
import { GS, cityById, getCityName } from '../state.js';
import { openModal, closeModal } from './modal.js';
import { VEHICLE_STATUS_INFO } from '../constants.js';
import { projectLonLat } from '../map_projection.js';

const MAP_ZOOM_MAX = 3;

// ─────────────────────────────────────────────────────────────────────────────
// MAP GEOMETRY
// Real geography from Natural Earth (public domain), pre-projected into the
// 800 × 520 map space by scripts/build-map-geo.mjs and loaded lazily.
// Game logic keeps using city.x/y; the map only uses projected positions.
// ─────────────────────────────────────────────────────────────────────────────

const WATER = '#a5cde6';
const COAST = '#5f8fb4';

// Muted political-atlas palette; neighbouring countries get different tints.
const PALETTE = ['#f3e6bf', '#dfead0', '#f0dad3', '#dde3f2', '#eadcef', '#f6e1c4'];
const COUNTRY_TINT = {
  DE: 0, FR: 3, NL: 5, BE: 1, LU: 2, CH: 2, LI: 0, AT: 1, IT: 5, SM: 3, VA: 3, MC: 2,
  PL: 2, CZ: 4, SK: 5, HU: 3, SI: 4, HR: 0, BA: 2, RS: 1, ME: 3, XK: 4, AL: 0, MK: 2,
  GR: 3, BG: 4, RO: 0, MD: 1, LT: 1, LV: 3, EE: 2, FI: 3, AX: 3, SE: 1, NO: 2, DK: 1,
  FO: 1, GB: 2, IM: 2, JE: 2, GG: 2, IE: 1, ES: 4, PT: 0, AD: 5, MT: 0,
};
const OUTSIDE_LAND = '#e7e3d8';

// Hand-placed sea labels (lon, lat, German name, size class).
const SEA_LABELS = [
  [-14, 47.5, 'Atlantischer Ozean', 2], [3.4, 56.3, 'Nordsee', 2], [18.8, 56.2, 'Ostsee', 2],
  [4.5, 39.2, 'Mittelmeer', 2], [-5, 45.6, 'Golf von Biskaya', 1], [11.2, 40.2, 'Tyrrhenisches Meer', 1],
  [15.8, 42.9, 'Adria', 1], [18.6, 37.4, 'Ionisches Meer', 1], [25, 39.4, 'Ägäis', 1],
  [32.5, 43.6, 'Schwarzes Meer', 2], [20.6, 61.6, 'Bottnischer Meerbusen', 1], [-1.6, 50.1, 'Ärmelkanal', 1],
  [3.5, 64, 'Europäisches Nordmeer', 2],
];

const MOUNTAIN_NAMES = { 'Ligurischer Apennin': 'Apennin', 'Atlas': 'Atlasgebirge' };

function _ringsWidth(rings) {
  let min = Infinity;
  let max = -Infinity;
  for (const ring of rings) {
    for (let i = 0; i < ring.length; i += 2) {
      if (ring[i] < min) min = ring[i];
      if (ring[i] > max) max = ring[i];
    }
  }
  return max - min;
}

let _geoPaths = null;
let _geoLoading = null;

function _ringPath(path, ring, close) {
  path.moveTo(ring[0], ring[1]);
  for (let i = 2; i < ring.length; i += 2) path.lineTo(ring[i], ring[i + 1]);
  if (close) path.closePath();
}

function _buildGeoPaths(geo) {
  const pathOf = (rings, close = true) => {
    const path = new Path2D();
    rings.forEach(ring => _ringPath(path, ring, close));
    return path;
  };
  const riversOf = test => pathOf(geo.rivers.filter(river => test(river.rank)).map(river => river.line), false);

  const graticule = new Path2D();
  for (let lon = -40; lon <= 50; lon += 5) {
    for (let lat = 25; lat < 72; lat++) {
      const a = projectLonLat(lon, lat);
      const b = projectLonLat(lon, lat + 1);
      graticule.moveTo(a.x, a.y);
      graticule.lineTo(b.x, b.y);
    }
  }
  for (let lat = 30; lat <= 70; lat += 5) {
    for (let lon = -40; lon < 50; lon++) {
      const a = projectLonLat(lon, lat);
      const b = projectLonLat(lon + 1, lat);
      graticule.moveTo(a.x, a.y);
      graticule.lineTo(b.x, b.y);
    }
  }

  return {
    graticule,
    countries: geo.countries.map(country => ({
      ...country,
      width: _ringsWidth(country.rings),
      path: pathOf(country.rings),
      fill: COUNTRY_TINT[country.iso] !== undefined ? PALETTE[COUNTRY_TINT[country.iso]] : OUTSIDE_LAND,
    })),
    coast: pathOf(geo.coast),
    borders: pathOf(geo.borders, false),
    lakes: pathOf(geo.lakes),
    riversMajor: riversOf(rank => rank <= 5),
    riversMedium: riversOf(rank => rank > 5 && rank <= 7),
    riversMinor: riversOf(rank => rank > 7),
    mountains: geo.mountains.map(range => {
      const ring = range.rings.reduce((a, b) => (a.length >= b.length ? a : b));
      let sx = 0;
      let sy = 0;
      for (let i = 0; i < ring.length; i += 2) { sx += ring[i]; sy += ring[i + 1]; }
      return {
        name: MOUNTAIN_NAMES[range.name] || range.name,
        path: pathOf(range.rings),
        label: [sx / (ring.length / 2), sy / (ring.length / 2)],
      };
    }),
    seaLabels: SEA_LABELS.map(([lon, lat, name, size]) => ({ ...projectLonLat(lon, lat), name, size })),
  };
}

function _ensureGeo() {
  if (_geoPaths || _geoLoading) return;
  _geoLoading = import('../map_geo_data.js')
    .then(module => {
      _geoPaths = _buildGeoPaths(module.MAP_GEO);
      if (GS.ui.currentScreen === 'map') renderMapScreen();
    })
    .catch(() => { _geoLoading = null; });
}

const _cityPosCache = new Map();

/** Real-world map position of a city (projected latitude/longitude). */
export function cityMapPos(city) {
  if (!_cityPosCache.has(city.id)) {
    _cityPosCache.set(city.id, Number.isFinite(city.lat) ? projectLonLat(city.lon, city.lat) : { x: city.x, y: city.y });
  }
  return _cityPosCache.get(city.id);
}

function _cityPosById(cityId) {
  const city = cityById[cityId];
  return city ? cityMapPos(city) : null;
}

/** Map position of a vehicle, interpolated along its current route leg. */
export function vehicleMapPos(vehicle) {
  const stops = vehicle.route?.stops || [];
  const index = vehicle.route?.currentStopIndex || 0;
  if (stops.length > 1 && index < stops.length - 1) {
    const from = _cityPosById(stops[index].cityId);
    const to = _cityPosById(stops[index + 1].cityId);
    if (from && to) {
      const pct = (vehicle.route.progressPct || 0) / 100;
      return { x: from.x + (to.x - from.x) * pct, y: from.y + (to.y - from.y) * pct };
    }
  }
  const cityId = stops.length > 0 && index >= stops.length - 1 ? stops[stops.length - 1].cityId : vehicle.currentCity;
  return _cityPosById(cityId) || vehicle.position || null;
}

// Pan drag state
let _panDragging = false;
let _panStartX = 0;
let _panStartY = 0;
let _panStartCenterX = 400;
let _panStartCenterY = 260;
let _panMoved = false;

function getSelectedVehicleRouteIds() {
  if (!GS.ui.selectedVehicleId) return [];
  const v = GS.vehicles.find(x => x.id === GS.ui.selectedVehicleId);
  if (!v || !v.route || !v.route.stops.length) return [];
  return v.route.stops.map(s => s.cityId);
}

export function renderMapScreen() {
  const canvas = $('map-screen-canvas');
  if (!canvas) return;
  const highlightIds = getSelectedVehicleRouteIds();
  drawMapOnCanvas(canvas, highlightIds, GS.vehicles, {
    zoom: GS.ui.mapZoom,
    center: GS.ui.mapCenter,
    selectedId: GS.ui.selectedVehicleId,
  });
  renderFleetOnMap();
  renderQuickNav();
  renderVehicleSidePanel();
  updateZoomButtons();
}

export function updateZoomButtons() {
  const btn1 = $('map-zoom-out');
  const btn2 = $('map-zoom-in');
  if (btn1) btn1.disabled = (GS.ui.mapZoom <= 1);
  if (btn2) btn2.disabled = (GS.ui.mapZoom >= MAP_ZOOM_MAX);
}

export function setMapZoom(level, cx, cy) {
  GS.ui.mapZoom = Math.max(1, Math.min(MAP_ZOOM_MAX, level));
  if (cx !== undefined && cy !== undefined) {
    GS.ui.mapCenter.x = Math.max(0, Math.min(800, cx));
    GS.ui.mapCenter.y = Math.max(0, Math.min(520, cy));
  }
  renderMapScreen();
}

export function mapZoomIn() {
  setMapZoom(GS.ui.mapZoom + 1);
}

export function mapZoomOut() {
  setMapZoom(GS.ui.mapZoom - 1);
}

export function mapJumpTo(dataX, dataY) {
  setMapZoom(2, dataX, dataY);
}

export function renderQuickNav() {
  const el = $('map-quick-nav');
  if (!el) return;

  const hqCityId = GS.company.hqCity || 'frankfurt';
  const hqCity = cityById[hqCityId] || cityById['frankfurt'];

  let html = '';

  const hqPos = cityMapPos(hqCity);
  html += `<div class="qnav-item" onclick="mapJumpTo(${hqPos.x},${hqPos.y})" title="Zur Firmenzentrale zoomen">
    <span class="qnav-icon">🏢</span>
    <span class="qnav-label">Zentrale (${hqCity.name})</span>
  </div>`;

  if (GS.orders.active.length > 0) {
    html += '<div class="qnav-section">Auftragsziele</div>';
    const seen = new Set();
    const targets = [];
    for (const order of GS.orders.active) {
      targets.push({ cityId: order.origin,      icon: '📦', label: 'Abholung'  });
      targets.push({ cityId: order.destination, icon: '🏁', label: 'Lieferung' });
    }
    for (const { cityId, icon, label } of targets) {
      const key = cityId + icon;
      if (seen.has(key)) continue;
      seen.add(key);
      const city = cityById[cityId];
      if (!city) continue;
      const pos = cityMapPos(city);
      html += `<div class="qnav-item" onclick="mapJumpTo(${pos.x},${pos.y})" title="${label}: ${city.name}">
        <span class="qnav-icon">${icon}</span>
        <span class="qnav-label">${city.name}</span>
      </div>`;
    }
  }

  if (GS.vehicles.length > 0) {
    html += '<div class="qnav-section">Flotte</div>';
    for (const v of GS.vehicles) {
      const cat = DATA.VEHICLES.find(c => c.id === v.catalogId);
      const pos = v.position;
      if (!pos) continue;
      const statusDot = v.status === 'driving' ? '🟢' : v.status === 'broken' ? '🔴' : '⚪';
      html += `<div class="qnav-item" onclick="mapJumpToVehicle('${v.id}')" title="${v.name} anzeigen">
        <span class="qnav-icon">${statusDot}</span>
        <span class="qnav-label">${cat.icon} ${v.name}</span>
      </div>`;
    }
  }

  el.innerHTML = html || '<div class="qnav-empty">Keine Einträge</div>';
}

export function mapJumpToVehicle(vehicleId) {
  const v = GS.vehicles.find(x => x.id === vehicleId);
  const pos = v ? vehicleMapPos(v) : null;
  if (!pos) return;
  mapJumpTo(pos.x, pos.y);
}

export function deselectVehicleOnMap() {
  GS.ui.selectedVehicleId = null;
  renderMapScreen();
}

export function renderFleetOnMap() {
  const el = $('fleet-on-map');
  if (!el) return;
  if (GS.vehicles.length === 0) {
    el.innerHTML = '<div class="text-muted text-sm">Keine Fahrzeuge im Fuhrpark.</div>';
    return;
  }
  el.innerHTML = GS.vehicles.map(v => {
    const cat = DATA.VEHICLES.find(c => c.id === v.catalogId);
    const loc = v.status === 'driving' && v.route.stops.length
      ? `→ ${getCityName(v.route.stops[v.route.stops.length - 1].cityId)}`
      : getCityName(v.currentCity);
    const isSelected = GS.ui.selectedVehicleId === v.id;
    return `
    <div class="map-vehicle-row${isSelected ? ' selected' : ''}" onclick="selectVehicleOnMap('${v.id}')" style="cursor:pointer">
      <div class="map-vehicle-name">${cat.icon} ${v.name}</div>
      <div class="map-vehicle-info">${loc}</div>
      <div class="progress mt-sm"><div class="progress-bar blue" style="width:${v.route.stops.length ? v.route.progressPct : 0}%"></div></div>
    </div>`;
  }).join('');
}

export function openVehicleInfoPanel(vehicleId) {
  GS.ui.selectedVehicleId = vehicleId;
  renderMapScreen();
}

export function renderVehicleSidePanel() {
  const el = $('map-vehicle-panel');
  if (!el) return;

  const vehicleId = GS.ui.selectedVehicleId;
  if (!vehicleId) {
    el.style.display = 'none';
    return;
  }

  const v = GS.vehicles.find(x => x.id === vehicleId);
  if (!v) {
    el.style.display = 'none';
    GS.ui.selectedVehicleId = null;
    return;
  }

  el.style.display = '';

  const cat    = DATA.VEHICLES.find(c => c.id === v.catalogId);
  const driver = GS.staff.find(s => s.id === v.driverId);
  const activeOrder = GS.orders.active.find(o => o.vehicleId === v.id);

  const statusInfo = VEHICLE_STATUS_INFO[v.status] || { badge: 'badge-danger', label: v.status };
  const statusLabel = statusInfo.label;
  const badgeClass  = statusInfo.badge;

  let orderHtml = '<div class="text-muted text-sm">Kein aktiver Auftrag</div>';
  if (activeOrder) {
    orderHtml = `
      <div class="vinfo-row"><span class="vinfo-label">Auftrag</span><span>${activeOrder.clientName}</span></div>
      <div class="vinfo-row"><span class="vinfo-label">Fracht</span><span>${activeOrder.cargoDesc}</span></div>
      <div class="vinfo-row"><span class="vinfo-label">Route</span><span>${getCityName(activeOrder.origin)} → ${getCityName(activeOrder.destination)}</span></div>
      <div class="vinfo-row"><span class="vinfo-label">Fortschritt</span><span>${Math.round(v.route.progressPct)}%</span></div>`;
  }

  const assignOpts = GS.orders.available.length > 0 && v.status === 'idle'
    ? `<button class="btn btn-primary btn-sm w-full" onclick="navigateToScreen('orders')" style="margin-top:.5rem">
         📋 Auftrag zuweisen
       </button>`
    : '';

  el.innerHTML = `
    <div class="card-header" style="display:flex;align-items:center;justify-content:space-between">
      <span>${cat.icon} ${v.name}</span>
      <button class="btn btn-secondary btn-sm" onclick="deselectVehicleOnMap()" title="Schließen">✕</button>
    </div>
    <div class="vehicle-info-panel" style="padding:.5rem 0 0">
      <div class="vinfo-header">
        <span class="vinfo-icon">${cat.icon}</span>
        <div>
          <div class="vinfo-name">${v.name}</div>
          <div class="vinfo-model text-muted text-sm">${cat.model}</div>
        </div>
        <span class="badge ${badgeClass}">${statusLabel}</span>
      </div>
      <div class="vinfo-stats">
        <div class="vinfo-row"><span class="vinfo-label">Fahrer</span><span>${driver ? driver.name : '– kein Fahrer –'}</span></div>
        <div class="vinfo-row"><span class="vinfo-label">Standort</span><span>${getCityName(v.currentCity)}</span></div>
        <div class="vinfo-row"><span class="vinfo-label">Gesundheit</span><span>${Math.round(v.health)} %</span></div>
        <div class="vinfo-row"><span class="vinfo-label">Kraftstoff</span><span>${Math.round(v.fuel)} / ${cat.fuelCapacity} L</span></div>
      </div>
      <div class="vinfo-order">${orderHtml}</div>
      ${assignOpts}
    </div>`;
}

export function handleMapScreenMouseDown(e) {
  if (e.button !== 0) return;
  const canvas = $('map-screen-canvas');
  if (!canvas) return;
  _panDragging = true;
  _panMoved = false;
  _panStartX = e.clientX;
  _panStartY = e.clientY;
  _panStartCenterX = GS.ui.mapCenter.x;
  _panStartCenterY = GS.ui.mapCenter.y;
  canvas.style.cursor = 'grabbing';
}

export function handleMapScreenMouseMove(e) {
  if (!_panDragging) return;
  const canvas = $('map-screen-canvas');
  if (!canvas) return;

  const dx = e.clientX - _panStartX;
  const dy = e.clientY - _panStartY;
  if (Math.abs(dx) > 3 || Math.abs(dy) > 3) _panMoved = true;

  const zoom = GS.ui.mapZoom;
  const viewW = 800 / zoom;
  const viewH = 520 / zoom;

  const newCx = _panStartCenterX - (dx / canvas.clientWidth  * viewW);
  const newCy = _panStartCenterY - (dy / canvas.clientHeight * viewH);
  GS.ui.mapCenter.x = Math.max(0, Math.min(800, newCx));
  GS.ui.mapCenter.y = Math.max(0, Math.min(520, newCy));

  const highlightIds = getSelectedVehicleRouteIds();
  drawMapOnCanvas(canvas, highlightIds, GS.vehicles, {
    zoom: GS.ui.mapZoom,
    center: GS.ui.mapCenter,
    selectedId: GS.ui.selectedVehicleId,
  });
}

export function handleMapScreenMouseUp(e) {
  if (!_panDragging) return;
  _panDragging = false;
  const canvas = $('map-screen-canvas');
  if (canvas) canvas.style.cursor = 'grab';
}

export function handleMapScreenClick(e) {
  if (_panMoved) { _panMoved = false; return; }

  const canvas = $('map-screen-canvas');
  if (!canvas) return;
  const rect = canvas.getBoundingClientRect();

  const zoom = GS.ui.mapZoom;
  const viewW = 800 / zoom;
  const viewH = 520 / zoom;
  const cx = GS.ui.mapCenter.x;
  const cy = GS.ui.mapCenter.y;
  const offsetX = Math.max(0, Math.min(800 - viewW, cx - viewW / 2));
  const offsetY = Math.max(0, Math.min(520 - viewH, cy - viewH / 2));

  const clickDataX = (e.clientX - rect.left) / canvas.clientWidth  * viewW + offsetX;
  const clickDataY = (e.clientY - rect.top)  / canvas.clientHeight * viewH + offsetY;
  const threshold = 14 / zoom;

  const hits = GS.vehicles.filter(v => {
    const pos = vehicleMapPos(v);
    if (!pos) return false;
    const dx = pos.x - clickDataX;
    const dy = pos.y - clickDataY;
    return Math.sqrt(dx * dx + dy * dy) < threshold;
  });

  if (hits.length === 0) {
    if (GS.ui.selectedVehicleId) {
      GS.ui.selectedVehicleId = null;
      renderMapScreen();
    }
    return;
  }

  if (hits.length === 1) {
    GS.ui.selectedVehicleId = hits[0].id;
    renderMapScreen();
    return;
  }

  const listHtml = hits.map(v => {
    const cat = DATA.VEHICLES.find(c => c.id === v.catalogId);
    return `<button class="btn btn-secondary w-full" onclick="closeModal();selectVehicleOnMap('${v.id}')">
      ${cat.icon} ${v.name}
    </button>`;
  }).join('');
  openModal('Fahrzeuge auswählen', `<div class="flex flex-col gap-sm">${listHtml}</div>`);
}

export function selectVehicleOnMap(vehicleId) {
  GS.ui.selectedVehicleId = vehicleId;
  renderMapScreen();
}

export function handleMapScreenWheel(e) {
  e.preventDefault();
  if (e.deltaY < 0 && GS.ui.mapZoom < MAP_ZOOM_MAX) setMapZoom(GS.ui.mapZoom + 1);
  else if (e.deltaY > 0 && GS.ui.mapZoom > 1) setMapZoom(GS.ui.mapZoom - 1);
}

function _haloText(ctx, text, x, y, fill, halo = 'rgba(255,255,255,0.92)', haloWidth = 3) {
  ctx.lineJoin = 'round';
  ctx.strokeStyle = halo;
  ctx.lineWidth = haloWidth;
  ctx.strokeText(text, x, y);
  ctx.fillStyle = fill;
  ctx.fillText(text, x, y);
}

/** Greedy label placement: returns false if the text box overlaps an already placed label. */
function _reserveLabel(placed, ctx, text, x, y, align = 'center', pad = 2) {
  const width = ctx.measureText(text).width;
  const size = parseFloat(/(\d+(?:\.\d+)?)px/.exec(ctx.font)?.[1] || 10);
  const left = align === 'center' ? x - width / 2 : align === 'right' ? x - width : x;
  const box = [left - pad, y - size * 0.6 - pad, left + width + pad, y + size * 0.6 + pad];
  if (placed.some(other => box[0] < other[2] && box[2] > other[0] && box[1] < other[3] && box[3] > other[1])) return false;
  placed.push(box);
  return true;
}

function _cityLabelFont(isHub, isHighlit, zf) {
  const size = Math.max(9, Math.round((isHub ? 11 : 10) * zf));
  return `${isHighlit || isHub ? 700 : 500} ${size}px Inter, 'Segoe UI', sans-serif`;
}

function _setLetterSpacing(ctx, value) {
  if ('letterSpacing' in ctx) ctx.letterSpacing = value;
}

export function drawMapOnCanvas(canvas, highlightCityIds, vehicles, opts) {
  _ensureGeo();
  const dpr = window.devicePixelRatio || 1;
  const W = canvas.clientWidth || 800;
  const H = Math.round(W * 0.65);
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);

  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const zoom    = (opts && opts.zoom)   ? opts.zoom   : 1;
  const center  = (opts && opts.center) ? opts.center : { x: 400, y: 260 };
  const viewW   = 800 / zoom;
  const viewH   = 520 / zoom;
  const offsetX = Math.max(0, Math.min(800 - viewW, center.x - viewW / 2));
  const offsetY = Math.max(0, Math.min(520 - viewH, center.y - viewH / 2));
  const scale   = W / viewW;
  const zf      = Math.min(zoom, 1.5);

  function toX(dx) { return (dx - offsetX) * scale; }
  function toY(dy) { return (dy - offsetY) * scale; }
  const visible = (x, y, margin = 20) => x > -margin && x < W + margin && y > -margin && y < H + margin;
  const px = value => value / scale;

  // ── Geography in map space ───────────────────────────────────────────────
  ctx.save();
  ctx.setTransform(dpr * scale, 0, 0, dpr * scale, -offsetX * scale * dpr, -offsetY * scale * dpr);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  const sea = ctx.createLinearGradient(0, 0, 0, 520);
  sea.addColorStop(0, '#93c1e0');
  sea.addColorStop(1, '#a9d2ea');
  ctx.fillStyle = sea;
  ctx.fillRect(-20, -20, 840, 560);

  const geo = _geoPaths;
  if (geo) {
    ctx.strokeStyle = 'rgba(255,255,255,0.32)';
    ctx.lineWidth = px(0.7);
    ctx.stroke(geo.graticule);

    // Shallow-water glow along the coast
    ctx.strokeStyle = 'rgba(205,231,246,0.55)';
    ctx.lineWidth = px(10);
    ctx.stroke(geo.coast);
    ctx.strokeStyle = 'rgba(220,239,250,0.8)';
    ctx.lineWidth = px(4);
    ctx.stroke(geo.coast);

    for (const country of geo.countries) {
      ctx.fillStyle = country.fill;
      ctx.fill(country.path, 'evenodd');
    }

    ctx.fillStyle = 'rgba(141,111,72,0.11)';
    for (const range of geo.mountains) ctx.fill(range.path);

    ctx.fillStyle = WATER;
    ctx.fill(geo.lakes);
    ctx.strokeStyle = COAST;
    ctx.lineWidth = px(0.6);
    ctx.stroke(geo.lakes);

    ctx.strokeStyle = '#6da5d3';
    ctx.lineWidth = px(1.5 * zf);
    ctx.stroke(geo.riversMajor);
    ctx.lineWidth = px(1.0 * zf);
    ctx.stroke(geo.riversMedium);
    if (zoom >= 2) {
      ctx.lineWidth = px(0.8);
      ctx.stroke(geo.riversMinor);
    }

    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.lineWidth = px(3);
    ctx.stroke(geo.borders);
    ctx.strokeStyle = 'rgba(128,92,140,0.85)';
    ctx.lineWidth = px(1);
    ctx.setLineDash([px(4), px(2)]);
    ctx.stroke(geo.borders);
    ctx.setLineDash([]);

    ctx.strokeStyle = COAST;
    ctx.lineWidth = px(0.8);
    ctx.stroke(geo.coast);
  }
  ctx.restore();

  // ── Geographic labels (screen space) ─────────────────────────────────────
  // City labels have priority: reserve their space before placing geography labels.
  const placedLabels = [];
  const cityLabelPos = new Map();
  const showCityLabel = (city, isHighlit) => isHighlit || city.hub || zoom >= 2;
  const cityRadius = city => (city.hub ? Math.max(3.5, 4.5 * zf) : Math.max(2.5, 3 * zf));
  const isRouteCity = city => !!(highlightCityIds && highlightCityIds.includes(city.id));
  for (const city of DATA.CITIES) {
    const p = cityMapPos(city);
    const cx = toX(p.x);
    const cy = toY(p.y);
    const r = cityRadius(city);
    if (visible(cx, cy, 10)) placedLabels.push([cx - r - 1, cy - r - 1, cx + r + 1, cy + r + 1]);
  }
  // Route cities first, then hubs, then the rest; each tries right, left, above and below its dot.
  const labelOrder = [...DATA.CITIES].sort((a, b) =>
    (isRouteCity(b) - isRouteCity(a)) || ((b.hub ? 1 : 0) - (a.hub ? 1 : 0)));
  ctx.textBaseline = 'middle';
  for (const city of labelOrder) {
    const isHighlit = isRouteCity(city);
    if (!showCityLabel(city, isHighlit)) continue;
    const p = cityMapPos(city);
    const cx = toX(p.x);
    const cy = toY(p.y);
    if (!visible(cx, cy, 10)) continue;
    const r = cityRadius(city);
    ctx.font = _cityLabelFont(city.hub, isHighlit, zf);
    const size = Math.max(9, Math.round((city.hub ? 11 : 10) * zf));
    const candidates = [
      [cx + r + 3, cy, 'left'],
      [cx - r - 3, cy, 'right'],
      [cx, cy - r - size * 0.75, 'center'],
      [cx, cy + r + size * 0.75, 'center'],
    ];
    const spot = candidates.find(([x, y, align]) => _reserveLabel(placedLabels, ctx, city.name, x, y, align, 1));
    if (spot) cityLabelPos.set(city.id, spot);
  }

  if (geo) {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    _setLetterSpacing(ctx, '2px');
    for (const label of geo.seaLabels) {
      const x = toX(label.x);
      const y = toY(label.y);
      if (!visible(x, y, 60) || (label.size < 2 && zoom < 2 && W < 900)) continue;
      ctx.font = `italic ${label.size === 2 ? 600 : 500} ${Math.round((label.size === 2 ? 12 : 10) * zf)}px Georgia, 'Times New Roman', serif`;
      if (!_reserveLabel(placedLabels, ctx, label.name, x, y)) continue;
      _haloText(ctx, label.name, x, y, 'rgba(46,96,140,0.85)', 'rgba(200,228,245,0.7)', 2.5);
    }

    _setLetterSpacing(ctx, '3px');
    for (const country of geo.countries) {
      if (!country.label || country.rank > (zoom >= 2 ? 6 : 4)) continue;
      const x = toX(country.label[0]);
      const y = toY(country.label[1]);
      if (!visible(x, y, 40)) continue;
      const size = Math.round(Math.max(8, (country.rank <= 2 ? 13 : country.rank <= 3 ? 11 : 9) * zf));
      ctx.font = `700 ${size}px Inter, 'Segoe UI', sans-serif`;
      const name = country.name.toUpperCase();
      if (ctx.measureText(name).width > country.width * scale * 1.6) continue;
      if (!_reserveLabel(placedLabels, ctx, name, x, y)) continue;
      _haloText(ctx, name, x, y, 'rgba(96,82,72,0.55)', 'rgba(255,255,255,0.5)', 2);
    }

    _setLetterSpacing(ctx, '1px');
    if (zoom >= 2) {
      for (const range of geo.mountains) {
        const x = toX(range.label[0]);
        const y = toY(range.label[1]);
        if (!visible(x, y, 40)) continue;
        ctx.font = `italic 600 ${Math.round(10 * zf)}px Georgia, 'Times New Roman', serif`;
        if (!_reserveLabel(placedLabels, ctx, range.name, x, y)) continue;
        _haloText(ctx, range.name, x, y, 'rgba(110,80,45,0.8)', 'rgba(255,255,255,0.6)', 2);
      }
    }
    _setLetterSpacing(ctx, '0px');
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
  } else {
    ctx.font = '600 14px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(30,60,90,0.7)';
    ctx.fillText('Karte wird geladen …', W / 2, H / 2);
    ctx.textAlign = 'left';
  }

  // ── Roads ─────────────────────────────────────────────────────────────────
  const autobahn = DATA.CONNECTIONS.filter(c => c[3] === 'a');
  const national = DATA.CONNECTIONS.filter(c => c[3] === 'b');

  const autoCount = {};
  for (const [a, b] of autobahn) {
    autoCount[a] = (autoCount[a] || 0) + 1;
    autoCount[b] = (autoCount[b] || 0) + 1;
  }

  const strokeRoads = (connections, width, color) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    for (const [a, b] of connections) {
      const pa = _cityPosById(a);
      const pb = _cityPosById(b);
      if (!pa || !pb) continue;
      ctx.moveTo(toX(pa.x), toY(pa.y));
      ctx.lineTo(toX(pb.x), toY(pb.y));
    }
    ctx.stroke();
  };

  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if (zoom >= 2) {
    strokeRoads(national, 3.2, 'rgba(150,130,90,0.55)');
    strokeRoads(national, 1.8, '#fff6cf');
  }
  const motorway = Math.max(2, 2.6 * zf);
  strokeRoads(autobahn, motorway + 1.8, 'rgba(168,84,20,0.75)');
  strokeRoads(autobahn, motorway, '#f6b25e');

  // ── Selected vehicle route highlight ──────────────────────────────────────
  if (highlightCityIds && highlightCityIds.length > 1) {
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = 5;
    ctx.beginPath();
    highlightCityIds.forEach((cityId, i) => {
      const p = _cityPosById(cityId);
      if (!p) return;
      if (i === 0) ctx.moveTo(toX(p.x), toY(p.y));
      else ctx.lineTo(toX(p.x), toY(p.y));
    });
    ctx.stroke();
    ctx.strokeStyle = '#cc2244';
    ctx.lineWidth = 2.5;
    ctx.setLineDash([6, 4]);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // ── Vehicle route lines ───────────────────────────────────────────────────
  if (vehicles) {
    ctx.strokeStyle = 'rgba(20,120,60,0.75)';
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 3]);
    for (const v of vehicles) {
      if (v.status !== 'driving' || !v.route.stops.length) continue;
      ctx.beginPath();
      let started = false;
      for (const stop of v.route.stops) {
        const p = _cityPosById(stop.cityId);
        if (!p) continue;
        if (!started) { ctx.moveTo(toX(p.x), toY(p.y)); started = true; }
        else ctx.lineTo(toX(p.x), toY(p.y));
      }
      ctx.stroke();
    }
    ctx.setLineDash([]);
  }

  // ── Autobahn junctions ────────────────────────────────────────────────────
  for (const city of DATA.CITIES) {
    if ((autoCount[city.id] || 0) < 3) continue;
    const p = cityMapPos(city);
    const cx = toX(p.x), cy = toY(p.y);
    if (!visible(cx, cy, 10)) continue;
    const r = Math.max(3, 4 * zf);
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(Math.PI / 4);
    ctx.fillStyle   = '#e07b22';
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth   = 1.2;
    ctx.beginPath();
    ctx.rect(-r / 2, -r / 2, r, r);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  // ── Active order icons (zoom >= 2) ────────────────────────────────────────
  if (zoom >= 2) {
    const iconR = Math.max(5, 6 * zoom);
    for (const order of GS.orders.active) {
      const targets = [
        { cityId: order.origin,      icon: '📦', bg: 'rgba(30,90,200,0.88)' },
        { cityId: order.destination, icon: '🏁', bg: 'rgba(20,140,60,0.88)' },
      ];
      for (const { cityId, icon, bg } of targets) {
        const p = _cityPosById(cityId);
        if (!p) continue;
        const cx = toX(p.x), cy = toY(p.y);
        if (!visible(cx, cy)) continue;
        ctx.beginPath();
        ctx.arc(cx, cy - iconR - 2, iconR, 0, Math.PI * 2);
        ctx.fillStyle = bg;
        ctx.fill();
        ctx.font = `${Math.max(8, 10 * zoom)}px sans-serif`;
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(icon, cx, cy - iconR - 2);
        ctx.textAlign    = 'left';
        ctx.textBaseline = 'alphabetic';
      }
    }
  }

  // ── Cities ────────────────────────────────────────────────────────────────
  for (const city of DATA.CITIES) {
    const p = cityMapPos(city);
    const cx = toX(p.x);
    const cy = toY(p.y);
    if (!visible(cx, cy, 10)) continue;
    const isHighlit = highlightCityIds && highlightCityIds.includes(city.id);
    const isHub = city.hub;
    const r = isHub ? Math.max(3.5, 4.5 * zf) : Math.max(2.5, 3 * zf);

    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = isHighlit ? '#cc2244' : '#ffffff';
    ctx.fill();
    ctx.strokeStyle = isHighlit ? '#ffffff' : '#2a2f36';
    ctx.lineWidth = isHub ? 1.6 : 1.2;
    ctx.stroke();
    if (isHub && !isHighlit) {
      ctx.beginPath();
      ctx.arc(cx, cy, r * 0.45, 0, Math.PI * 2);
      ctx.fillStyle = '#2a2f36';
      ctx.fill();
    }

    const spot = cityLabelPos.get(city.id);
    if (spot) {
      ctx.font = _cityLabelFont(isHub, isHighlit, zf);
      ctx.textAlign = spot[2];
      ctx.textBaseline = 'middle';
      _haloText(ctx, city.name, spot[0], spot[1], isHighlit ? '#a5102f' : '#1d2630');
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
    }
  }

  // ── Company HQ icon ───────────────────────────────────────────────────────
  if (zoom >= 2) {
    const hq = _cityPosById(GS.company.hqCity || 'frankfurt');
    if (hq) {
      const hx = toX(hq.x), hy = toY(hq.y);
      ctx.font = `${Math.max(12, 14 * zf)}px sans-serif`;
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('🏢', hx, hy - Math.max(8, 12 * zf));
      ctx.textAlign    = 'left';
      ctx.textBaseline = 'alphabetic';
    }
  }

  // ── Vehicles ──────────────────────────────────────────────────────────────
  if (vehicles) {
    for (const v of vehicles) {
      const pos = vehicleMapPos(v);
      if (!pos) continue;
      const vx = toX(pos.x);
      const vy = toY(pos.y);
      if (!visible(vx, vy)) continue;

      const cat = DATA.VEHICLES.find(c => c.id === v.catalogId);
      const isSelected = opts && opts.selectedId && opts.selectedId === v.id;
      const vr = Math.max(6, 7 * zf);

      ctx.beginPath();
      ctx.arc(vx, vy, vr + (isSelected ? 3 : 0), 0, Math.PI * 2);
      ctx.fillStyle = isSelected
        ? 'rgba(200,120,0,0.95)'
        : v.status === 'driving' ? '#1a8040' : v.status === 'broken' ? '#c02020' : '#707070';
      ctx.shadowColor = 'rgba(0,0,0,0.35)';
      ctx.shadowBlur = 4;
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = isSelected ? 2.5 : 1.5;
      ctx.stroke();

      const iconSize = Math.max(10, Math.round(11 * zf));
      ctx.font = `${iconSize}px sans-serif`;
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(cat ? cat.icon : '🚛', vx, vy);
      ctx.textAlign    = 'left';
      ctx.textBaseline = 'alphabetic';
    }
  }

  // ── Route stop numbered dots ──────────────────────────────────────────────
  if (highlightCityIds) {
    highlightCityIds.forEach((cityId, i) => {
      const p = _cityPosById(cityId);
      if (!p) return;
      const nr = Math.max(6, 7 * zf);
      ctx.beginPath();
      ctx.arc(toX(p.x), toY(p.y), nr, 0, Math.PI * 2);
      ctx.fillStyle = '#cc2244';
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.fillStyle = '#fff';
      ctx.font = `bold ${Math.max(8, 10 * zf)}px sans-serif`;
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(i + 1, toX(p.x), toY(p.y));
      ctx.textAlign    = 'left';
      ctx.textBaseline = 'alphabetic';
    });
  }
}
