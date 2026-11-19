import * as THREE from 'three';

/**
 * Procedural low-poly vehicle models for all catalog vehicles (and trailer variants).
 * Units ≈ metres. Vehicles face +X, wheels stand on y = 0, and the model is
 * centred on its bounding box along X. Rotating wheels are exposed via
 * `group.userData.wheels` for animation.
 */

const _matCache = new Map();
function mat(color, opts = {}) {
  const key = `${color}|${JSON.stringify(opts)}`;
  if (!_matCache.has(key)) {
    _matCache.set(key, new THREE.MeshStandardMaterial({
      color, roughness: 0.55, metalness: 0.1, flatShading: true, ...opts,
    }));
  }
  return _matCache.get(key);
}

const M = {
  glass:   () => mat('#1d2b3d', { roughness: 0.15, metalness: 0.6 }),
  chrome:  () => mat('#c9d1d9', { roughness: 0.25, metalness: 0.85 }),
  dark:    () => mat('#25292f', { roughness: 0.8 }),
  tire:    () => mat('#141414', { roughness: 0.95 }),
  rim:     () => mat('#a4adb6', { roughness: 0.35, metalness: 0.7 }),
  head:    () => mat('#fff4cc', { emissive: '#ffe9a8', emissiveIntensity: 0.9 }),
  tail:    () => mat('#ff2a2a', { emissive: '#ff1a1a', emissiveIntensity: 0.6 }),
  white:   () => mat('#eef1f4'),
  orange:  () => mat('#ff8c1a', { emissive: '#552200', emissiveIntensity: 0.2 }),
  yellow:  () => mat('#f2b705'),
  steel:   () => mat('#b8c2cc', { roughness: 0.3, metalness: 0.75 }),
  wood:    () => mat('#a8743f'),
};

function box(parent, w, h, d, material, x, y, z, rot = null) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  m.position.set(x, y, z);
  if (rot) m.rotation.set(rot[0] || 0, rot[1] || 0, rot[2] || 0);
  m.castShadow = true;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}

function cyl(parent, rTop, rBot, len, material, x, y, z, rot, seg = 14) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBot, len, seg), material);
  m.position.set(x, y, z);
  if (rot) m.rotation.set(rot[0] || 0, rot[1] || 0, rot[2] || 0);
  m.castShadow = true;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}

/** Adds an axle (two wheels, optionally twin tyres) at position x. */
function axle(g, x, width, r = 0.5, twin = false) {
  const tw = twin ? 0.55 : 0.32;
  for (const side of [-1, 1]) {
    const wheel = new THREE.Group();
    wheel.position.set(x, r, side * (width / 2 - tw / 2 + 0.05));
    cyl(wheel, r, r, tw, M.tire(), 0, 0, 0, [Math.PI / 2, 0, 0], 16);
    cyl(wheel, r * 0.55, r * 0.55, tw + 0.02, M.rim(), 0, 0, 0, [Math.PI / 2, 0, 0], 8);
    g.add(wheel);
    g.userData.wheels.push({ mesh: wheel, r });
  }
}

/** Truck cab whose front face sits at xFront. */
function cab(g, xFront, { len = 2.2, width = 2.5, height = 3.2, color, sleeper = true, base = 1.0 }) {
  const body = mat(color);
  const cx = xFront - len / 2;
  const bodyH = height - base;
  box(g, len, bodyH, width, body, cx, base + bodyH / 2, 0);
  // Windshield & side windows
  box(g, 0.06, bodyH * 0.38, width * 0.86, M.glass(), xFront + 0.02, base + bodyH * 0.68, 0);
  for (const s of [-1, 1]) box(g, len * 0.42, bodyH * 0.3, 0.05, M.glass(), xFront - len * 0.25, base + bodyH * 0.7, s * (width / 2 + 0.01));
  // Grille, bumper, lights
  box(g, 0.06, bodyH * 0.32, width * 0.55, M.chrome(), xFront + 0.03, base + bodyH * 0.25, 0);
  box(g, 0.3, 0.4, width + 0.04, M.dark(), xFront + 0.05, base - 0.05, 0);
  for (const s of [-1, 1]) box(g, 0.06, 0.18, 0.35, M.head(), xFront + 0.21, base, s * (width / 2 - 0.3));
  // Mirrors
  for (const s of [-1, 1]) box(g, 0.12, 0.45, 0.08, M.dark(), xFront - 0.1, base + bodyH * 0.65, s * (width / 2 + 0.25));
  // Accent stripe
  box(g, len + 0.01, 0.12, width + 0.02, M.white(), cx, base + bodyH * 0.42, 0);
  // Sleeper roof spoiler
  if (sleeper) {
    box(g, len * 0.75, 0.55, width * 0.92, body, cx - len * 0.1, height + 0.22, 0, [0, 0, 0.12]);
  }
  // Steps / fuel tank
  for (const s of [-1, 1]) cyl(g, 0.3, 0.3, len * 0.6, M.steel(), cx - 0.1, base - 0.25, s * (width / 2 - 0.25), [0, 0, Math.PI / 2], 10);
}

function chassis(g, x0, x1, width, y = 0.75) {
  box(g, x1 - x0, 0.3, width * 0.55, M.dark(), (x0 + x1) / 2, y, 0);
}

/** Box-shaped cargo body from x0 to x1. */
function cargoBox(g, x0, x1, { height = 2.8, width = 2.5, base = 1.15, color = '#eef1f4', stripe = null, ribs = false }) {
  const len = x1 - x0;
  const cx = (x0 + x1) / 2;
  box(g, len, height, width, mat(color), cx, base + height / 2, 0);
  box(g, len + 0.02, 0.12, width + 0.02, M.dark(), cx, base + 0.06, 0);
  if (stripe) box(g, len * 0.92, 0.35, width + 0.03, mat(stripe), cx, base + height * 0.35, 0);
  if (ribs) {
    const n = Math.max(3, Math.round(len / 1.2));
    for (let i = 0; i <= n; i++) {
      box(g, 0.06, height, width + 0.04, M.steel(), x0 + (len * i) / n, base + height / 2, 0);
    }
  }
  // Rear doors + tail lights
  box(g, 0.05, height * 0.95, width * 0.96, M.steel(), x0 - 0.02, base + height / 2, 0);
  for (const s of [-1, 1]) box(g, 0.06, 0.15, 0.3, M.tail(), x0 - 0.04, base + 0.1, s * (width / 2 - 0.3));
}

function tank(g, x0, x1, { radius = 1.15, base = 1.15, color = '#c9d1d9' }) {
  const len = x1 - x0;
  const cx = (x0 + x1) / 2;
  const y = base + radius;
  cyl(g, radius, radius, len, mat(color, { metalness: 0.75, roughness: 0.25 }), cx, y, 0, [0, 0, Math.PI / 2], 18);
  for (const ex of [x0, x1]) {
    const cap = new THREE.Mesh(new THREE.SphereGeometry(radius, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat(color, { metalness: 0.75, roughness: 0.25 }));
    cap.scale.set(1, 0.25, 1);
    cap.rotation.z = ex === x1 ? -Math.PI / 2 : Math.PI / 2;
    cap.position.set(ex, y, 0);
    cap.castShadow = true;
    g.add(cap);
  }
  box(g, len * 0.85, 0.08, 0.6, M.dark(), cx, y + radius + 0.05, 0);
  for (let i = 0; i < 3; i++) cyl(g, 0.22, 0.22, 0.15, M.steel(), x0 + len * (0.25 + i * 0.25), y + radius + 0.12, 0, null, 10);
  adrPlate(g, x0 - radius * 0.25 - 0.03, base + 0.5, 0);
  box(g, len, 0.25, 1.3, M.dark(), cx, base + 0.05, 0);
}

function adrPlate(g, x, y, z) {
  box(g, 0.04, 0.32, 0.45, M.orange(), x, y, z);
}

function hazardDiamond(g, x, y, z, side) {
  const d = box(g, 0.55, 0.55, 0.04, mat('#ffffff'), x, y, z + side * 0.02, [0, 0, Math.PI / 4]);
  d.castShadow = false;
  box(g, 0.4, 0.4, 0.04, mat('#e53935'), x, y, z + side * 0.04, [0, 0, Math.PI / 4]);
}

// ── Trailer bodies (used by semi-type tractors) ─────────────
function semiTrailer(g, kind, x0, x1, width, color) {
  const deckY = 1.25;
  if (kind === 'tank_trailer') {
    tank(g, x0, x1, { radius: 1.2, base: 1.0 });
  } else if (kind === 'flatbed_trailer') {
    box(g, x1 - x0, 0.25, width, M.dark(), (x0 + x1) / 2, deckY, 0);
    // Steel coils + timber
    for (let i = 0; i < 3; i++) cyl(g, 0.75, 0.75, 1.4, M.steel(), x0 + 2.2 + i * 2.6, deckY + 0.88, 0, [Math.PI / 2, 0, 0], 16);
    for (let i = 0; i < 4; i++) box(g, 2.6, 0.3, width * 0.9, M.wood(), x1 - 1.6, deckY + 0.28 + i * 0.32, 0);
    for (const s of [-1, 1]) for (let i = 0; i < 6; i++) box(g, 0.08, 1.2, 0.08, M.steel(), x0 + 0.5 + i * ((x1 - x0 - 1) / 5), deckY + 0.6, s * (width / 2));
  } else if (kind === 'reefer_trailer') {
    cargoBox(g, x0, x1, { height: 3.0, width, base: deckY, color: '#f4f7fa', stripe: '#2f81f7' });
    box(g, 0.6, 1.6, width * 0.8, M.dark(), x1 + 0.3, deckY + 1.9, 0);
    box(g, 0.05, 1.2, width * 0.6, M.steel(), x1 + 0.62, deckY + 1.9, 0);
  } else if (kind === 'curtainsider') {
    cargoBox(g, x0, x1, { height: 3.0, width, base: deckY, color: '#2f6fd6', ribs: true });
  } else {
    cargoBox(g, x0, x1, { height: 3.0, width, base: deckY, color: '#eef1f4', stripe: color });
  }
  // Landing gear + rear bumper
  for (const s of [-1, 1]) box(g, 0.15, 1.0, 0.15, M.dark(), x1 - 2.5, 0.6, s * (width / 2 - 0.4));
  box(g, 0.2, 0.25, width * 0.9, M.dark(), x0 + 0.05, 0.75, 0);
  axle(g, x0 + 1.2, width, 0.5, true);
  axle(g, x0 + 2.6, width, 0.5, true);
  axle(g, x0 + 4.0, width, 0.5, true);
}

function semiTractor(g, xFront, width, color, { axles = 2 } = {}) {
  const len = 2.4;
  cab(g, xFront, { len, width, height: 3.5, color, sleeper: true });
  chassis(g, xFront - 6.2, xFront, width);
  box(g, 1.2, 0.15, 1.6, M.dark(), xFront - 4.6, 1.05, 0); // fifth wheel
  axle(g, xFront - 1.0, width, 0.52);
  axle(g, xFront - 4.2, width, 0.52, true);
  if (axles >= 3) axle(g, xFront - 5.6, width, 0.52, true);
}

// ── Public builders ──────────────────────────────────────────
const BUILDERS = {
  transit(g, color, trailerId) {
    const W = 2.0;
    box(g, 4.2, 1.9, W, mat(color), -0.5, 0.45 + 0.95 + 0.1, 0);
    box(g, 1.0, 0.9, W, mat(color), 2.1, 0.45 + 0.55, 0);
    box(g, 0.9, 0.06, W * 0.9, M.glass(), 1.65, 1.75, 0, [0, 0, -0.75]);
    for (const s of [-1, 1]) box(g, 0.9, 0.55, 0.04, M.glass(), 1.15, 1.8, s * (W / 2 + 0.01));
    box(g, 0.25, 0.3, W + 0.04, M.dark(), 2.65, 0.55, 0);
    for (const s of [-1, 1]) box(g, 0.05, 0.15, 0.3, M.head(), 2.62, 0.95, s * (W / 2 - 0.25));
    box(g, 4.2, 0.1, W + 0.02, M.white(), -0.5, 1.2, 0);
    for (const s of [-1, 1]) box(g, 0.05, 0.18, 0.2, M.tail(), -2.62, 0.9, s * (W / 2 - 0.2));
    axle(g, 1.75, W, 0.38);
    axle(g, -1.7, W, 0.38);
    if (trailerId) {
      const x1 = -3.3, x0 = -6.3;
      box(g, 0.8, 0.1, 0.12, M.dark(), -2.9, 0.5, 0);
      if (trailerId === 'van_box_trailer') {
        cargoBox(g, x0, x1, { height: 1.6, width: 1.8, base: 0.6, color: '#eef1f4', stripe: color });
      } else {
        box(g, x1 - x0, 0.15, 1.8, M.dark(), (x0 + x1) / 2, 0.65, 0);
        box(g, 1.2, 0.9, 1.2, M.wood(), (x0 + x1) / 2, 1.2, 0);
      }
      axle(g, (x0 + x1) / 2, 1.8, 0.33);
    }
  },
  truck_small(g, color) {
    const W = 2.3;
    cab(g, 3.0, { len: 1.8, width: W, height: 2.9, color, sleeper: false, base: 0.95 });
    chassis(g, -2.6, 3.0, W, 0.7);
    cargoBox(g, -2.8, 1.05, { height: 2.4, width: W, base: 1.0, stripe: color });
    axle(g, 2.2, W, 0.45);
    axle(g, -1.5, W, 0.45, true);
  },
  truck_medium(g, color) {
    const W = 2.5;
    cab(g, 4.2, { len: 2.1, width: W, height: 3.3, color, sleeper: true });
    chassis(g, -3.8, 4.2, W);
    cargoBox(g, -4.0, 1.95, { height: 2.8, width: W, base: 1.15, stripe: color });
    axle(g, 3.2, W, 0.5);
    axle(g, -1.8, W, 0.5, true);
    axle(g, -3.1, W, 0.5, true);
  },
  hazmat(g, color) {
    const W = 2.5;
    cab(g, 4.2, { len: 2.1, width: W, height: 3.3, color, sleeper: true });
    chassis(g, -3.8, 4.2, W);
    cargoBox(g, -4.0, 1.95, { height: 2.7, width: W, base: 1.15, color: '#f5f5f5', stripe: '#ff8c1a' });
    adrPlate(g, 4.45, 0.75, 0);
    adrPlate(g, -4.06, 1.0, 0);
    for (const s of [-1, 1]) hazardDiamond(g, -1.0, 2.6, s * (W / 2 + 0.01), s);
    axle(g, 3.2, W, 0.5);
    axle(g, -1.8, W, 0.5, true);
    axle(g, -3.1, W, 0.5, true);
  },
  semi(g, color, trailerId) {
    const W = 2.55;
    semiTractor(g, 8.0, W, color);
    semiTrailer(g, trailerId || 'box', -8.0, 4.4, W, color);
  },
  reefer(g, color, trailerId) {
    const W = 2.55;
    semiTractor(g, 8.0, W, color);
    semiTrailer(g, trailerId || 'reefer_trailer', -8.0, 4.4, W, color);
  },
  tanker(g, color, trailerId) {
    const W = 2.55;
    semiTractor(g, 8.0, W, color);
    semiTrailer(g, trailerId || 'tank_trailer', -8.0, 4.4, W, color);
    adrPlate(g, 8.28, 0.8, 0);
  },
  heavy(g, color) {
    const W = 2.8;
    semiTractor(g, 9.0, W, color, { axles: 3 });
    // Low-bed trailer
    const x0 = -9.5, x1 = 3.2;
    box(g, x1 - x0, 0.3, W, M.dark(), (x0 + x1) / 2, 0.75, 0);
    box(g, 2.2, 0.35, W * 0.8, M.dark(), x1 + 0.5, 1.15, 0, [0, 0, -0.25]);
    for (let i = 0; i < 4; i++) axle(g, x0 + 0.9 + i * 1.25, W, 0.42, true);
    // Excavator load
    const ex = -3.0;
    box(g, 4.4, 0.7, W * 0.95, M.dark(), ex, 1.3, 0);
    box(g, 3.0, 1.3, W * 0.8, M.yellow(), ex - 0.2, 2.3, 0);
    box(g, 1.1, 1.2, 1.1, M.yellow(), ex + 1.0, 3.5, 0.5);
    box(g, 0.05, 0.8, 0.9, M.glass(), ex + 1.56, 3.6, 0.5);
    box(g, 3.6, 0.35, 0.4, M.yellow(), ex + 2.2, 3.4, -0.4, [0, 0, -0.35]);
    box(g, 0.35, 2.0, 0.4, M.yellow(), ex + 3.8, 2.4, -0.4, [0, 0, 0.2]);
    box(g, 0.7, 0.6, 0.9, M.dark(), ex + 3.9, 1.35, -0.4);
    // Warning flags
    for (const s of [-1, 1]) box(g, 0.05, 0.35, 0.35, M.orange(), x0 + 0.1, 1.1, s * (W / 2 - 0.1));
  },
};

/**
 * Builds a vehicle model.
 * @param {string} catalogId  Vehicle catalog id (e.g. 'semi')
 * @param {{color?:string, trailerId?:string|null}} opts
 */
export function buildVehicleModel(catalogId, { color = '#e5484d', trailerId = null } = {}) {
  const g = new THREE.Group();
  g.userData.wheels = [];
  const builder = BUILDERS[catalogId] || BUILDERS.truck_medium;
  builder(g, color, trailerId);

  const bb = new THREE.Box3().setFromObject(g);
  const cx = (bb.min.x + bb.max.x) / 2;
  g.children.forEach(c => { c.position.x -= cx; });
  g.userData.length = bb.max.x - bb.min.x;
  g.userData.height = bb.max.y;
  return g;
}

/** Spins all wheels of a model for the given travelled distance (metres). */
export function spinWheels(model, distance) {
  for (const w of model.userData.wheels || []) w.mesh.rotation.z -= distance / w.r;
}

export const VEHICLE_MODEL_IDS = Object.keys(BUILDERS);
