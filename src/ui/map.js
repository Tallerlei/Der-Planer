import { $ } from '../utils.js';
import { DATA } from '../data.js';
import { GS, cityById, getCityName } from '../state.js';
import { openModal, closeModal } from './modal.js';

const MAP_ZOOM_MAX = 3;

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

  const statusLabels = { idle: 'Bereit', driving: 'Unterwegs', maintenance: 'Wartung', broken: 'Defekt' };
  const statusLabel = statusLabels[v.status] || v.status;
  const badgeClass = v.status === 'idle' ? 'badge-success' : v.status === 'driving' ? 'badge-info' : 'badge-danger';

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

  ctx.fillStyle = '#0a1628';
  ctx.fillRect(0, 0, W, H);

  ctx.strokeStyle = 'rgba(255,255,255,.02)';
  ctx.lineWidth = 1;
  const gridStep = 50;
  for (let gx = 0; gx <= 800; gx += gridStep) {
    const px = toX(gx);
    if (px < 0 || px > W) continue;
    ctx.beginPath(); ctx.moveTo(px, 0); ctx.lineTo(px, H); ctx.stroke();
  }
  for (let gy = 0; gy <= 520; gy += gridStep) {
    const py = toY(gy);
    if (py < 0 || py > H) continue;
    ctx.beginPath(); ctx.moveTo(0, py); ctx.lineTo(W, py); ctx.stroke();
  }

  const autobahn = DATA.CONNECTIONS.filter(c => c[3] === 'a');
  const national = DATA.CONNECTIONS.filter(c => c[3] === 'b');

  const autoCount = {};
  for (const [a, b] of autobahn) {
    autoCount[a] = (autoCount[a] || 0) + 1;
    autoCount[b] = (autoCount[b] || 0) + 1;
  }

  if (zoom >= 2) {
    ctx.setLineDash([]);
    ctx.strokeStyle = 'rgba(255,190,40,0.45)';
    ctx.lineWidth = Math.max(1, 1.5 * zoom);
    for (const [a, b] of national) {
      const ca = cityById[a], cb = cityById[b];
      if (!ca || !cb) continue;
      ctx.beginPath();
      ctx.moveTo(toX(ca.x), toY(ca.y));
      ctx.lineTo(toX(cb.x), toY(cb.y));
      ctx.stroke();
    }
  }

  ctx.setLineDash([]);
  ctx.strokeStyle = 'rgba(30,100,210,0.75)';
  ctx.lineWidth = Math.max(1.5, 3 * Math.min(zoom, 1.5));
  for (const [a, b] of autobahn) {
    const ca = cityById[a], cb = cityById[b];
    if (!ca || !cb) continue;
    ctx.beginPath();
    ctx.moveTo(toX(ca.x), toY(ca.y));
    ctx.lineTo(toX(cb.x), toY(cb.y));
    ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(200,220,255,0.5)';
  ctx.lineWidth = Math.max(0.5, 0.8 * Math.min(zoom, 1.5));
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

  if (highlightCityIds && highlightCityIds.length > 1) {
    ctx.strokeStyle = '#e94560';
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

  if (vehicles) {
    ctx.strokeStyle = 'rgba(63,185,80,.5)';
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

  for (const city of DATA.CITIES) {
    if ((autoCount[city.id] || 0) < 3) continue;
    const cx = toX(city.x), cy = toY(city.y);
    if (cx < -10 || cx > W + 10 || cy < -10 || cy > H + 10) continue;
    const r = Math.max(3, 4 * Math.min(zoom, 1.5));
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(Math.PI / 4);
    ctx.fillStyle   = 'rgba(30,100,210,0.9)';
    ctx.strokeStyle = 'rgba(200,220,255,0.8)';
    ctx.lineWidth   = 1;
    ctx.beginPath();
    ctx.rect(-r / 2, -r / 2, r, r);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  if (zoom >= 2) {
    const iconR = Math.max(5, 6 * zoom);
    for (const order of GS.orders.active) {
      const targets = [
        { cityId: order.origin,      icon: '📦', bg: 'rgba(88,166,255,0.85)' },
        { cityId: order.destination, icon: '🏁', bg: 'rgba(63,185,80,0.85)'  },
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

  for (const city of DATA.CITIES) {
    const cx = toX(city.x);
    const cy = toY(city.y);
    if (cx < -10 || cx > W + 10 || cy < -10 || cy > H + 10) continue;
    const isHighlit = highlightCityIds && highlightCityIds.includes(city.id);
    const isHub = city.hub;
    const r = isHub ? Math.max(3, 4 * Math.min(zoom, 1.5)) : Math.max(2, 2.5 * Math.min(zoom, 1.5));
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = isHighlit ? '#e94560' : isHub ? '#58a6ff' : 'rgba(255,255,255,.5)';
    ctx.fill();

    const showLabel = isHighlit || isHub || (zoom >= 2);
    if (showLabel) {
      ctx.fillStyle = isHighlit ? '#fff' : isHub ? '#cae3ff' : '#8b949e';
      ctx.font = `${isHighlit ? 700 : isHub ? 500 : 400} ${Math.max(8, Math.round(10 * Math.min(zoom, 1.5)))}px sans-serif`;
      ctx.fillText(city.name, cx + r + 2, cy + 4);
    }
  }

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

  if (vehicles) {
    for (const v of vehicles) {
      if (!v.position) continue;
      const vx = toX(v.position.x);
      const vy = toY(v.position.y);
      if (vx < -20 || vx > W + 20 || vy < -20 || vy > H + 20) continue;

      const cat = DATA.VEHICLES.find(c => c.id === v.catalogId);
      const isSelected = opts && opts.selectedId && opts.selectedId === v.id;
      const vr = Math.max(5, 6 * Math.min(zoom, 1.5));

      // Status circle background
      ctx.beginPath();
      ctx.arc(vx, vy, vr + (isSelected ? 3 : 0), 0, Math.PI * 2);
      ctx.fillStyle = isSelected
        ? 'rgba(240,165,0,0.9)'
        : v.status === 'driving' ? '#3fb950' : v.status === 'broken' ? '#f85149' : '#8b949e';
      ctx.fill();
      ctx.strokeStyle = isSelected ? '#fff' : 'rgba(255,255,255,0.7)';
      ctx.lineWidth = isSelected ? 2 : 1;
      ctx.stroke();

      // Vehicle emoji icon
      const iconSize = Math.max(10, Math.round(11 * Math.min(zoom, 1.5)));
      ctx.font = `${iconSize}px sans-serif`;
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(cat ? cat.icon : '🚛', vx, vy);
      ctx.textAlign    = 'left';
      ctx.textBaseline = 'alphabetic';
    }
  }

  if (highlightCityIds) {
    highlightCityIds.forEach((cityId, i) => {
      const c = cityById[cityId];
      if (!c) return;
      const nr = Math.max(6, 7 * Math.min(zoom, 1.5));
      ctx.beginPath();
      ctx.arc(toX(c.x), toY(c.y), nr, 0, Math.PI * 2);
      ctx.fillStyle = '#e94560';
      ctx.fill();
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
