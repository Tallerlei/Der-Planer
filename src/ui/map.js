import { $ } from '../utils.js';
import { DATA } from '../data.js';
import { GS, cityById, getCityName } from '../state.js';
import { openModal, closeModal } from './modal.js';
import { VEHICLE_STATUS_INFO } from '../constants.js';

const MAP_ZOOM_MAX = 3;

// ─────────────────────────────────────────────────────────────────────────────
// MAP VISUAL DATA
// Coordinate space: game canvas 800 × 520
// Approx. mapping: x ≈ (lon° + 10) × 20 · y ≈ (65.5 − lat°) × 16.1
// ─────────────────────────────────────────────────────────────────────────────

const MAP_COUNTRIES = [
  // Drawn back-to-front so smaller countries appear on top of large ones.
  // Large eastern / background polygons first
  { code: 'UA', col: '#d8d4b0', pts: [[646,206],[700,214],[764,206],[796,236],[796,294],[750,308],[708,314],[662,312],[634,300],[592,294],[548,296],[548,278],[552,276],[592,266],[618,242],[646,206]] },
  { code: 'BY', col: '#d4d0b4', pts: [[556,188],[616,196],[648,196],[648,210],[618,242],[592,266],[552,276],[548,252],[556,218],[556,188]] },
  // Russia (small visible strip at top-right)
  { code: 'RU', col: '#dcdab8', pts: [[636,80],[700,62],[796,80],[796,214],[764,206],[700,214],[648,206],[636,80]] },
  // Scandinavia — more coastal detail for realistic shapes
  { code: 'NO', col: '#c8d4d2', pts: [[414,66],[414,88],[412,110],[408,130],[398,148],[386,174],[358,168],[332,162],[310,130],[304,100],[308,80],[330,54],[360,42],[396,48],[414,66]] },
  { code: 'SE', col: '#ccd6d2', pts: [[414,88],[444,82],[466,78],[494,78],[524,80],[556,86],[566,90],[568,112],[572,130],[572,144],[566,160],[564,168],[550,182],[480,178],[474,164],[456,150],[438,158],[416,148],[414,88]] },
  { code: 'FI', col: '#c8d6cc', pts: [[566,90],[628,82],[684,108],[668,140],[648,162],[634,180],[608,178],[582,172],[566,168],[564,160],[572,144],[572,130],[568,112],[566,90]] },
  // Baltic States
  { code: 'EE', col: '#c8cccc', pts: [[568,140],[606,136],[638,148],[636,160],[608,164],[568,158],[568,140]] },
  { code: 'LV', col: '#cacece', pts: [[568,158],[608,164],[638,160],[648,178],[614,184],[578,180],[562,170],[568,158]] },
  { code: 'LT', col: '#cccece', pts: [[562,170],[614,184],[648,178],[648,196],[616,196],[578,196],[556,188],[562,170]] },
  // Poland
  { code: 'PL', col: '#ccd6c0', pts: [[464,242],[486,192],[502,188],[606,192],[648,206],[618,242],[582,236],[506,250],[490,252],[464,242]] },
  // Denmark (Jutland peninsula)
  { code: 'DK', col: '#ccd4da', pts: [[386,174],[396,164],[408,148],[438,148],[456,150],[470,162],[452,174],[440,182],[418,178],[386,174]] },
  // Germany — more boundary detail
  { code: 'DE', col: '#d2d0c4', pts: [[384,174],[444,178],[476,176],[486,190],[494,212],[502,232],[462,290],[430,294],[392,294],[354,290],[354,274],[340,262],[322,236],[326,216],[342,208],[384,174]] },
  // Netherlands
  { code: 'NL', col: '#ccdac8', pts: [[282,216],[296,194],[338,194],[342,208],[326,216],[316,236],[290,226],[282,216]] },
  // Belgium + Luxembourg
  { code: 'BE', col: '#d0dcc4', pts: [[248,232],[290,226],[316,236],[318,254],[260,258],[248,232]] },
  { code: 'LU', col: '#ccd8bc', pts: [[316,252],[326,252],[328,264],[316,264],[316,252]] },
  // UK + Ireland (islands — drawn after ocean patches)
  { code: 'IE', col: '#c8d4c0', pts: [[98,182],[120,178],[126,204],[110,226],[88,228],[78,208],[98,182]] },
  { code: 'GB', col: '#ccd2d8', pts: [[202,232],[246,212],[248,196],[216,176],[188,148],[152,128],[130,146],[100,182],[100,210],[118,234],[142,244],[182,242],[202,232]] },
  // France — shares key border nodes with DE/BE/CH
  { code: 'FR', col: '#d4dcc8', pts: [[248,232],[318,254],[354,290],[322,310],[346,350],[256,368],[170,354],[108,274],[130,234],[166,250],[248,232]] },
  // Switzerland + Austria — share Basel corner (354,290) with DE/FR
  { code: 'CH', col: '#c8d4c8', pts: [[354,290],[394,286],[396,300],[382,318],[322,312],[320,296],[354,290]] },
  { code: 'AT', col: '#ccd0c8', pts: [[394,286],[462,288],[488,276],[552,276],[548,298],[520,312],[490,310],[460,298],[396,300],[394,286]] },
  // Czech Republic + Slovakia
  { code: 'CZ', col: '#ccccc4', pts: [[464,242],[500,228],[506,250],[490,252],[474,264],[456,268],[442,254],[464,242]] },
  { code: 'SK', col: '#d0ccc4', pts: [[490,252],[554,276],[548,288],[530,288],[506,280],[490,270],[490,252]] },
  // Hungary
  { code: 'HU', col: '#d2ccbc', pts: [[490,270],[548,288],[548,300],[582,300],[600,312],[570,324],[530,324],[502,312],[490,308],[474,294],[490,270]] },
  // Romania + Moldova
  { code: 'RO', col: '#d0c8b8', pts: [[548,296],[594,294],[636,300],[656,320],[644,350],[618,368],[580,360],[554,346],[546,332],[548,296]] },
  { code: 'MD', col: '#d4c8bc', pts: [[618,298],[636,298],[636,316],[618,322],[612,308],[618,298]] },
  // Balkans
  { code: 'HR', col: '#c8d0c0', pts: [[490,308],[532,324],[546,334],[522,348],[500,344],[478,328],[490,308]] },
  { code: 'RS', col: '#ccc8b8', pts: [[490,308],[546,332],[530,362],[540,382],[510,386],[488,380],[476,358],[474,334],[478,322],[490,308]] },
  { code: 'BG', col: '#ccc4b4', pts: [[546,332],[554,346],[580,360],[618,368],[628,390],[596,404],[564,404],[538,382],[530,362],[546,332]] },
  { code: 'GR', col: '#d4d0b8', pts: [[498,360],[524,352],[550,350],[578,368],[590,414],[582,454],[556,462],[530,460],[510,448],[504,424],[492,402],[498,360]] },
  // Italy
  { code: 'IT', col: '#d8d4bc', pts: [[348,290],[396,294],[460,296],[488,308],[488,316],[520,312],[516,336],[482,362],[460,390],[442,424],[420,434],[404,456],[390,464],[372,458],[366,432],[378,404],[374,372],[352,344],[318,314],[322,312],[382,318],[348,290]] },
  // Iberia
  { code: 'ES', col: '#dcdcc4', pts: [[30,352],[168,348],[236,344],[262,374],[252,396],[198,430],[148,462],[80,470],[58,454],[68,408],[66,376],[30,352]] },
  { code: 'PT', col: '#d0dcc8', pts: [[22,378],[66,376],[68,408],[58,454],[20,462],[12,432],[22,378]] },
  // Turkey (partial)
  { code: 'TR', col: '#d4cca8', pts: [[574,366],[612,360],[700,358],[770,374],[796,404],[796,460],[638,462],[590,462],[566,452],[572,432],[578,412],[574,366]] },
  // North Africa (visual framing at southern edge)
  { code: 'AF', col: '#e0d8a8', pts: [[0,472],[250,472],[280,500],[796,472],[796,520],[0,520],[0,472]] },
];

// Ocean / sea areas — drawn over the land background, before country polygons
// Country polygons will then paint over these wherever there is land.
const OCEAN_POLYS = [
  // Baltic Sea (between Scandinavia and mainland)
  [[418,174],[456,150],[562,148],[604,170],[600,190],[502,190],[456,192],[436,180],[418,174]],
  // Mediterranean, Adriatic, Aegean and Black Sea.
  [[0,358],[796,358],[796,520],[0,520]],
];

// Single connected Europe landmass — drawn on top of ocean, underneath country fills.
// Covers the entire European territory so gaps between country polygons show land, not ocean.
const EUROPE_LANDMASS = [
  // Trace outer boundary clockwise.  Atlantic left edge → north over Scandinavia → Finland/Russia
  // → east edge → south through Turkey/Balkans/Greece → Italy tip → Spain/Portugal
  [0, 440],    // Portugal SW coast
  [0, 280],    // W (Bay of Biscay latitude)
  [0, 0],      // Top-left corner
  [796, 0],    // Top-right (Arctic Russia)
  [796, 350],  // E edge (Turkey/Black Sea)
  [796, 470],  // SE edge
  [640, 470],  // Turkey S
  [580, 470],  // Greece / Aegean
  [520, 470],  // Italy S tip area
  [400, 472],  // Italy SW / Sicilian channel
  [280, 470],  // Spain S / Gibraltar
  [80, 470],   // Spain S (southernmost)
  [0, 460],    // Portugal SW
  [0, 440],    // close
];

// Mountain and topographic regions — drawn as semi-transparent brown overlays
const MOUNTAIN_RANGES = [
  // Alps
  [[316,288],[396,278],[464,284],[530,296],[538,312],[492,320],[420,322],[354,318],[314,306]],
  // Pyrenees
  [[164,352],[264,358],[280,376],[256,392],[190,392],[162,372]],
  // Scandinavian Mountains
  [[302,86],[342,162],[412,174],[414,90],[368,58],[326,62]],
  // Carpathians
  [[490,250],[584,238],[650,264],[636,294],[574,312],[530,324],[490,308],[476,292],[490,250]],
  // Apennines (Italy)
  [[382,328],[424,326],[458,340],[470,372],[452,408],[428,420],[402,412],[380,386],[374,354]],
  // Balkanic highlands
  [[490,340],[548,338],[566,360],[560,390],[524,404],[490,400],[468,376],[474,352]],
];

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

  html += `<div class="qnav-item" onclick="mapJumpTo(${hqCity.x},${hqCity.y})" title="Zur Firmenzentrale zoomen">
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
      html += `<div class="qnav-item" onclick="mapJumpTo(${city.x},${city.y})" title="${label}: ${city.name}">
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
  if (!v || !v.position) return;
  mapJumpTo(v.position.x, v.position.y);
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
    if (!v.position) return false;
    const dx = v.position.x - clickDataX;
    const dy = v.position.y - clickDataY;
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

export function drawMapOnCanvas(canvas, highlightCityIds, vehicles, opts) {
  canvas.width  = canvas.clientWidth  || 800;
  canvas.height = Math.round(canvas.width * 0.65);

  const ctx = canvas.getContext('2d');
  const W = canvas.width;
  const H = canvas.height;

  const zoom    = (opts && opts.zoom)   ? opts.zoom   : 1;
  const center  = (opts && opts.center) ? opts.center : { x: 400, y: 260 };
  const viewW   = 800 / zoom;
  const viewH   = 520 / zoom;
  const offsetX = Math.max(0, Math.min(800 - viewW, center.x - viewW / 2));
  const offsetY = Math.max(0, Math.min(520 - viewH, center.y - viewH / 2));

  function toX(dx) { return (dx - offsetX) / viewW * W; }
  function toY(dy) { return (dy - offsetY) / viewH * H; }

  // ── Ocean background (entire canvas = sea) ───────────────────────────────
  ctx.fillStyle = '#9ec8e8';
  ctx.fillRect(0, 0, W, H);

  // ── Europe landmass base — ensures no ocean gaps between country polygons ─
  ctx.fillStyle = '#dfddd0';
  ctx.beginPath();
  ctx.moveTo(toX(EUROPE_LANDMASS[0][0]), toY(EUROPE_LANDMASS[0][1]));
  for (let i = 1; i < EUROPE_LANDMASS.length; i++) {
    ctx.lineTo(toX(EUROPE_LANDMASS[i][0]), toY(EUROPE_LANDMASS[i][1]));
  }
  ctx.closePath();
  ctx.fill();

  // ── Baltic Sea painted back on top of the landmass ───────────────────────
  ctx.fillStyle = '#9ec8e8';
  for (const pts of OCEAN_POLYS) {
    ctx.beginPath();
    ctx.moveTo(toX(pts[0][0]), toY(pts[0][1]));
    for (let i = 1; i < pts.length; i++) {
      ctx.lineTo(toX(pts[i][0]), toY(pts[i][1]));
    }
    ctx.closePath();
    ctx.fill();
  }

  // ── Country fills ─────────────────────────────────────────────────────────
  for (const country of MAP_COUNTRIES) {
    if (!country.pts || country.pts.length < 3) continue;
    ctx.beginPath();
    ctx.moveTo(toX(country.pts[0][0]), toY(country.pts[0][1]));
    for (let i = 1; i < country.pts.length; i++) {
      ctx.lineTo(toX(country.pts[i][0]), toY(country.pts[i][1]));
    }
    ctx.closePath();
    ctx.fillStyle = country.col;
    ctx.fill();
  }

  // ── Country borders ───────────────────────────────────────────────────────
  ctx.setLineDash([]);
  ctx.lineWidth = Math.max(0.5, 0.9 / zoom);
  for (const country of MAP_COUNTRIES) {
    if (!country.pts || country.pts.length < 3) continue;
    ctx.beginPath();
    ctx.moveTo(toX(country.pts[0][0]), toY(country.pts[0][1]));
    for (let i = 1; i < country.pts.length; i++) {
      ctx.lineTo(toX(country.pts[i][0]), toY(country.pts[i][1]));
    }
    ctx.closePath();
    ctx.strokeStyle = 'rgba(90,75,60,0.45)';
    ctx.stroke();
  }

  // ── Mountain ranges (topographic shading) ────────────────────────────────
  for (const mPts of MOUNTAIN_RANGES) {
    ctx.beginPath();
    ctx.moveTo(toX(mPts[0][0]), toY(mPts[0][1]));
    for (let i = 1; i < mPts.length; i++) {
      ctx.lineTo(toX(mPts[i][0]), toY(mPts[i][1]));
    }
    ctx.closePath();
    ctx.fillStyle = 'rgba(148,118,74,0.16)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(130,100,60,0.22)';
    ctx.lineWidth = Math.max(0.5, 0.6 / zoom);
    ctx.stroke();
  }

  // ── Roads ─────────────────────────────────────────────────────────────────
  const autobahn = DATA.CONNECTIONS.filter(c => c[3] === 'a');
  const national = DATA.CONNECTIONS.filter(c => c[3] === 'b');

  const autoCount = {};
  for (const [a, b] of autobahn) {
    autoCount[a] = (autoCount[a] || 0) + 1;
    autoCount[b] = (autoCount[b] || 0) + 1;
  }

  // National roads (only at zoom >= 2)
  if (zoom >= 2) {
    ctx.setLineDash([5, 4]);
    ctx.strokeStyle = 'rgba(160,90,20,0.65)';
    ctx.lineWidth = Math.max(1, 1.2 * zoom);
    for (const [a, b] of national) {
      const ca = cityById[a], cb = cityById[b];
      if (!ca || !cb) continue;
      ctx.beginPath();
      ctx.moveTo(toX(ca.x), toY(ca.y));
      ctx.lineTo(toX(cb.x), toY(cb.y));
      ctx.stroke();
    }
    ctx.setLineDash([]);
  }

  // Autobahn — blue core
  ctx.setLineDash([]);
  ctx.strokeStyle = 'rgba(20,65,170,0.82)';
  ctx.lineWidth = Math.max(1.5, 2.8 * Math.min(zoom, 1.5));
  for (const [a, b] of autobahn) {
    const ca = cityById[a], cb = cityById[b];
    if (!ca || !cb) continue;
    ctx.beginPath();
    ctx.moveTo(toX(ca.x), toY(ca.y));
    ctx.lineTo(toX(cb.x), toY(cb.y));
    ctx.stroke();
  }
  // Autobahn — white centre dash
  ctx.strokeStyle = 'rgba(255,255,255,0.45)';
  ctx.lineWidth = Math.max(0.4, 0.7 * Math.min(zoom, 1.5));
  ctx.setLineDash([8, 6]);
  for (const [a, b] of autobahn) {
    const ca = cityById[a], cb = cityById[b];
    if (!ca || !cb) continue;
    ctx.beginPath();
    ctx.moveTo(toX(ca.x), toY(ca.y));
    ctx.lineTo(toX(cb.x), toY(cb.y));
    ctx.stroke();
  }
  ctx.setLineDash([]);

  // ── Selected vehicle route highlight ──────────────────────────────────────
  if (highlightCityIds && highlightCityIds.length > 1) {
    ctx.strokeStyle = '#cc2244';
    ctx.lineWidth   = 2.5;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    for (let i = 0; i < highlightCityIds.length; i++) {
      const c = cityById[highlightCityIds[i]];
      if (!c) continue;
      if (i === 0) ctx.moveTo(toX(c.x), toY(c.y));
      else ctx.lineTo(toX(c.x), toY(c.y));
    }
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // ── Vehicle route lines ───────────────────────────────────────────────────
  if (vehicles) {
    ctx.strokeStyle = 'rgba(20,140,60,0.55)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 3]);
    for (const v of vehicles) {
      if (v.status !== 'driving' || !v.route.stops.length) continue;
      ctx.beginPath();
      let started = false;
      for (const stop of v.route.stops) {
        const c = cityById[stop.cityId];
        if (!c) continue;
        if (!started) { ctx.moveTo(toX(c.x), toY(c.y)); started = true; }
        else ctx.lineTo(toX(c.x), toY(c.y));
      }
      ctx.stroke();
    }
    ctx.setLineDash([]);
  }

  // ── Autobahn junction diamonds ────────────────────────────────────────────
  for (const city of DATA.CITIES) {
    if ((autoCount[city.id] || 0) < 3) continue;
    const cx = toX(city.x), cy = toY(city.y);
    if (cx < -10 || cx > W + 10 || cy < -10 || cy > H + 10) continue;
    const r = Math.max(2.5, 3.5 * Math.min(zoom, 1.5));
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(Math.PI / 4);
    ctx.fillStyle   = 'rgba(20,65,170,0.9)';
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth   = 1;
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
        const city = cityById[cityId];
        if (!city) continue;
        const cx = toX(city.x), cy = toY(city.y);
        if (cx < -20 || cx > W + 20 || cy < -20 || cy > H + 20) continue;
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

  // ── City dots + labels ────────────────────────────────────────────────────
  for (const city of DATA.CITIES) {
    const cx = toX(city.x);
    const cy = toY(city.y);
    if (cx < -10 || cx > W + 10 || cy < -10 || cy > H + 10) continue;
    const isHighlit = highlightCityIds && highlightCityIds.includes(city.id);
    const isHub = city.hub;
    const r = isHub ? Math.max(3, 4 * Math.min(zoom, 1.5)) : Math.max(2, 2.5 * Math.min(zoom, 1.5));

    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = isHighlit ? '#cc2244' : isHub ? '#1a3ea8' : 'rgba(50,50,50,0.65)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = 1;
    ctx.stroke();

    const showLabel = isHighlit || isHub || (zoom >= 2);
    if (showLabel) {
      const fs = Math.max(8, Math.round(10 * Math.min(zoom, 1.5)));
      ctx.font = `${isHighlit ? 700 : isHub ? 600 : 400} ${fs}px sans-serif`;
      ctx.shadowColor = 'rgba(255,255,255,0.92)';
      ctx.shadowBlur  = 3;
      ctx.fillStyle   = isHighlit ? '#aa1133' : isHub ? '#192d6e' : '#333';
      ctx.fillText(city.name, cx + r + 3, cy + 4);
      ctx.shadowBlur  = 0;
    }
  }

  // ── Company HQ icon ───────────────────────────────────────────────────────
  if (zoom >= 2) {
    const hqCity = cityById[GS.company.hqCity || 'frankfurt'];
    if (hqCity) {
      const hx = toX(hqCity.x), hy = toY(hqCity.y);
      ctx.font = `${Math.max(12, 14 * Math.min(zoom, 1.5))}px sans-serif`;
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('🏢', hx, hy - Math.max(8, 12 * Math.min(zoom, 1.5)));
      ctx.textAlign    = 'left';
      ctx.textBaseline = 'alphabetic';
    }
  }

  // ── Vehicle circles + icons ───────────────────────────────────────────────
  if (vehicles) {
    for (const v of vehicles) {
      if (!v.position) continue;
      const vx = toX(v.position.x);
      const vy = toY(v.position.y);
      if (vx < -20 || vx > W + 20 || vy < -20 || vy > H + 20) continue;

      const cat = DATA.VEHICLES.find(c => c.id === v.catalogId);
      const isSelected = opts && opts.selectedId && opts.selectedId === v.id;
      const vr = Math.max(5, 6 * Math.min(zoom, 1.5));

      ctx.beginPath();
      ctx.arc(vx, vy, vr + (isSelected ? 3 : 0), 0, Math.PI * 2);
      ctx.fillStyle = isSelected
        ? 'rgba(200,120,0,0.95)'
        : v.status === 'driving' ? '#1a8040' : v.status === 'broken' ? '#c02020' : '#707070';
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = isSelected ? 2 : 1;
      ctx.stroke();

      const iconSize = Math.max(10, Math.round(11 * Math.min(zoom, 1.5)));
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
      const c = cityById[cityId];
      if (!c) return;
      const nr = Math.max(6, 7 * Math.min(zoom, 1.5));
      ctx.beginPath();
      ctx.arc(toX(c.x), toY(c.y), nr, 0, Math.PI * 2);
      ctx.fillStyle = '#cc2244';
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.fillStyle = '#fff';
      ctx.font = `bold ${Math.max(8, 10 * Math.min(zoom, 1.5))}px sans-serif`;
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(i + 1, toX(c.x), toY(c.y));
      ctx.textAlign    = 'left';
      ctx.textBaseline = 'alphabetic';
    });
  }
}
