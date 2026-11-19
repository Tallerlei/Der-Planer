/**
 * Lightweight facade for the three.js powered assets.
 * Does NOT import three itself – the heavy modules are loaded lazily via
 * dynamic import(), so the main bundle stays small and tests stay DOM-free.
 */

const _thumbs = new Map();
const _readyListeners = [];
let _thumbPromise = null;
let _webglOk = null;

export function supportsWebGL() {
  if (_webglOk !== null) return _webglOk;
  try {
    const c = document.createElement('canvas');
    _webglOk = !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl')));
  } catch {
    _webglOk = false;
  }
  return _webglOk;
}

export function thumbKey(catalogId, trailerId = null) {
  return trailerId ? `${catalogId}+${trailerId}` : catalogId;
}

/** Returns a cached object-URL for a rendered vehicle image, or null if not (yet) available. */
export function getVehicleThumb(catalogId, trailerId = null) {
  return _thumbs.get(thumbKey(catalogId, trailerId)) || _thumbs.get(catalogId) || null;
}

/** Returns an <img> tag for the vehicle thumbnail, or the fallback (emoji) when unavailable. */
export function vehicleThumbHtml(catalogId, fallback, cls = 'vehicle-thumb', trailerId = null) {
  const url = getVehicleThumb(catalogId, trailerId);
  return url ? `<img class="${cls}" src="${url}" alt="" draggable="false">` : fallback;
}

export function onThumbsReady(fn) { _readyListeners.push(fn); }

/** Renders all vehicle thumbnails once (lazy-loads three.js). */
export function ensureVehicleThumbs() {
  if (_thumbPromise) return _thumbPromise;
  if (!supportsWebGL()) return Promise.resolve(false);
  _thumbPromise = import('./thumbnail_renderer.js')
    .then(m => m.renderAllThumbnails())
    .then(entries => {
      for (const [key, url] of entries) _thumbs.set(key, url);
      _readyListeners.forEach(fn => { try { fn(); } catch (e) { console.warn(e); } });
      return true;
    })
    .catch(err => { console.warn('3D-Thumbnails nicht verfügbar:', err); return false; });
  return _thumbPromise;
}

// ── Scenes ───────────────────────────────────────────────────
let _depot = null;
let _depotLoading = false;
let _menu = null;
let _menuLoading = false;

/** Mounts the live 3D depot into the given element (idempotent). */
export function ensureDepotScene(container, getState) {
  if (!container) return;
  if (!supportsWebGL()) { container.classList.add('depot-unavailable'); return; }
  if (_depot && _depot.container === container) return;
  if (_depotLoading) return;
  _depotLoading = true;
  import('./depot_scene.js')
    .then(m => { _depot = m.createDepotScene(container, getState); })
    .catch(err => { console.warn('3D-Depot nicht verfügbar:', err); container.classList.add('depot-unavailable'); })
    .finally(() => { _depotLoading = false; });
}

/** Starts the animated main-menu background scene. */
export function startMenuScene(container) {
  if (!container || _menu || _menuLoading || !supportsWebGL()) return;
  _menuLoading = true;
  import('./menu_scene.js')
    .then(m => { _menu = m.createMenuScene(container); })
    .catch(err => console.warn('Menü-Szene nicht verfügbar:', err))
    .finally(() => { _menuLoading = false; });
}

export function stopMenuScene() {
  if (_menu) { _menu.dispose(); _menu = null; }
}
