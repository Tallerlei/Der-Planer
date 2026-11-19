import * as THREE from 'three';
import { buildVehicleModel, spinWheels } from './vehicle_models.js';

const ROAD_Z   = 17;
const PARK_Z   = -11;   // nose position of parked vehicles (facing the hall)
const SLOT_W   = 4.9;
const MAX_SLOTS = 12;
const DRIVE_SPEED = 14;  // m/s in scene time
const TRAFFIC_IDS = ['transit', 'truck_small', 'semi', 'tanker', 'reefer', 'truck_medium'];

function _slotX(i) { return (i - (MAX_SLOTS - 1) / 2) * SLOT_W; }

function _signTexture(text) {
  const c = document.createElement('canvas');
  c.width = 1024; c.height = 160;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#e93a55';
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 84px Inter, Segoe UI, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  let size = 84;
  while (ctx.measureText(text).width > c.width - 60 && size > 30) {
    size -= 4;
    ctx.font = `bold ${size}px Inter, Segoe UI, sans-serif`;
  }
  ctx.fillText(text, c.width / 2, c.height / 2 + 4);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function _mesh(geo, color, opts = {}) {
  const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color, roughness: 0.8, flatShading: true, ...opts }));
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

function _tree(x, z, s = 1) {
  const g = new THREE.Group();
  const trunk = _mesh(new THREE.CylinderGeometry(0.25 * s, 0.35 * s, 1.6 * s, 6), '#6b4a2b');
  trunk.position.y = 0.8 * s;
  const crown = _mesh(new THREE.ConeGeometry(1.6 * s, 3.6 * s, 7), '#2f7d3b');
  crown.position.y = 3.2 * s;
  const crown2 = _mesh(new THREE.ConeGeometry(1.2 * s, 2.6 * s, 7), '#3a9147');
  crown2.position.y = 4.4 * s;
  g.add(trunk, crown, crown2);
  g.position.set(x, 0, z);
  g.rotation.y = Math.random() * Math.PI;
  return g;
}

/** Sky/sun parameters for the given hour (0–24). */
function _daylight(hour) {
  const sunUp = Math.max(0, Math.sin(((hour - 6) / 12) * Math.PI)); // 0 at 6h/18h, 1 at noon
  const night = new THREE.Color('#0b1426');
  const dusk  = new THREE.Color('#e9895a');
  const day   = new THREE.Color('#8ec9ff');
  const sky = sunUp > 0.25
    ? dusk.clone().lerp(day, Math.min(1, (sunUp - 0.25) / 0.5))
    : night.clone().lerp(dusk, sunUp / 0.25);
  return { sunUp, sky, isNight: sunUp < 0.12 };
}

/**
 * Creates the live depot scene.
 * @param {HTMLElement} container
 * @param {() => {companyName:string, hour:number, vehicles:Array<{id,catalogId,trailerId,atDepot}>}} getState
 */
export function createDepotScene(container, getState) {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.domElement.className = 'depot-canvas';
  container.prepend(renderer.domElement);

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog('#8ec9ff', 70, 150);

  const camera = new THREE.PerspectiveCamera(38, 2, 0.5, 400);

  const hemi = new THREE.HemisphereLight(0xcfe3ff, 0x4a5a3a, 1.0);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffffff, 2.2);
  sun.position.set(30, 45, 25);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -45, right: 45, top: 30, bottom: -30, near: 1, far: 140 });
  scene.add(sun);

  // ── Static environment ──
  const grass = _mesh(new THREE.PlaneGeometry(260, 160), '#55803f');
  grass.rotation.x = -Math.PI / 2;
  grass.castShadow = false;
  scene.add(grass);

  const yard = _mesh(new THREE.PlaneGeometry(66, 26), '#474c53');
  yard.rotation.x = -Math.PI / 2;
  yard.position.set(0, 0.02, -1);
  yard.castShadow = false;
  scene.add(yard);

  const road = _mesh(new THREE.PlaneGeometry(260, 8), '#2f3237');
  road.rotation.x = -Math.PI / 2;
  road.position.set(0, 0.03, ROAD_Z);
  road.castShadow = false;
  scene.add(road);
  const access = _mesh(new THREE.PlaneGeometry(66, 5), '#474c53');
  access.rotation.x = -Math.PI / 2;
  access.position.set(0, 0.025, 13.5);
  access.castShadow = false;
  scene.add(access);

  const lineMat = new THREE.MeshBasicMaterial({ color: '#e8e8e8' });
  for (let x = -128; x < 128; x += 6) {
    const dash = new THREE.Mesh(new THREE.PlaneGeometry(3, 0.25), lineMat);
    dash.rotation.x = -Math.PI / 2;
    dash.position.set(x, 0.05, ROAD_Z);
    scene.add(dash);
  }
  for (let i = 0; i <= MAX_SLOTS; i++) {
    const line = new THREE.Mesh(new THREE.PlaneGeometry(0.18, 14), lineMat);
    line.rotation.x = -Math.PI / 2;
    line.position.set(_slotX(i) - SLOT_W / 2, 0.05, -5);
    scene.add(line);
  }

  // Warehouse hall
  const hall = new THREE.Group();
  const hallBody = _mesh(new THREE.BoxGeometry(58, 9, 14), '#c9cfd6');
  hallBody.position.y = 4.5;
  const roof = _mesh(new THREE.BoxGeometry(59, 0.8, 15), '#6c7580');
  roof.position.y = 9.3;
  hall.add(hallBody, roof);
  for (let i = 0; i < 8; i++) {
    const door = _mesh(new THREE.BoxGeometry(4.2, 5, 0.2), '#59616b');
    door.position.set(-24.5 + i * 7, 2.5, 7.05);
    hall.add(door);
    for (let k = 0; k < 6; k++) {
      const rib = _mesh(new THREE.BoxGeometry(4.2, 0.08, 0.25), '#6e7782');
      rib.position.set(-24.5 + i * 7, 0.6 + k * 0.8, 7.1);
      hall.add(rib);
    }
  }
  const signMat = new THREE.MeshBasicMaterial({ map: _signTexture(getState().companyName || 'Spedition') });
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(24, 3.75), signMat);
  sign.position.set(0, 7.2, 7.12);
  hall.add(sign);
  hall.position.set(0, 0, -20);
  scene.add(hall);
  let signText = getState().companyName;

  // Office building with windows that light up at night
  const office = new THREE.Group();
  const officeBody = _mesh(new THREE.BoxGeometry(12, 10, 10), '#e7e2d6');
  officeBody.position.y = 5;
  office.add(officeBody);
  const winMat = new THREE.MeshStandardMaterial({ color: '#2a3a4f', emissive: '#ffcc66', emissiveIntensity: 0 });
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 4; col++) {
      const w = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.6, 0.1), winMat);
      w.position.set(-4.2 + col * 2.8, 2 + row * 3, 5.05);
      office.add(w);
    }
  }
  office.position.set(40, 0, -10);
  scene.add(office);

  // Street lamps
  const lampMat = new THREE.MeshStandardMaterial({ color: '#fff3c4', emissive: '#ffd36b', emissiveIntensity: 0 });
  const lampLights = [];
  for (let x = -36; x <= 36; x += 18) {
    const pole = _mesh(new THREE.CylinderGeometry(0.12, 0.15, 7, 6), '#3a3f45');
    pole.position.set(x, 3.5, 12);
    const head = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.3, 0.6), lampMat);
    head.position.set(x, 7, 12.5);
    scene.add(pole, head);
    const pl = new THREE.PointLight(0xffd38a, 0, 22, 1.6);
    pl.position.set(x, 6.5, 12.5);
    scene.add(pl);
    lampLights.push(pl);
  }

  // Trees & fence
  const rng = (() => { let s = 7; return () => (s = (s * 9301 + 49297) % 233280) / 233280; })();
  for (let i = 0; i < 26; i++) {
    const side = i % 2 ? 1 : -1;
    scene.add(_tree(side * (36 + rng() * 30), -40 + rng() * 48, 0.9 + rng() * 0.6));
  }
  for (let i = 0; i < 18; i++) scene.add(_tree(-90 + i * 10 + rng() * 4, 28 + rng() * 10, 0.8 + rng() * 0.6));
  for (let x = -32; x <= 32; x += 4) {
    const post = _mesh(new THREE.BoxGeometry(0.15, 1.4, 0.15), '#7a828c');
    post.position.set(x, 0.7, -28);
    scene.add(post);
  }

  // ── Dynamic vehicles ──
  const actors = new Map();        // vehicle id → actor
  const slotOf = new Map();        // vehicle id → slot index

  // Fill parking slots from the centre outwards
  const slotOrder = Array.from({ length: MAX_SLOTS }, (_, i) => i)
    .sort((a, b) => Math.abs(a - (MAX_SLOTS - 1) / 2) - Math.abs(b - (MAX_SLOTS - 1) / 2) || a - b);
  function _freeSlot() {
    const used = new Set(slotOf.values());
    for (const i of slotOrder) if (!used.has(i)) return i;
    return -1;
  }

  function _parkPos(actor, slot) {
    const len = actor.model.userData.length;
    return new THREE.Vector3(_slotX(slot), 0, PARK_Z + len / 2);
  }

  function _addActor(v, animate) {
    const slot = _freeSlot();
    if (slot < 0) return;
    const model = buildVehicleModel(v.catalogId, { trailerId: v.trailerId });
    const actor = { id: v.id, model, key: `${v.catalogId}|${v.trailerId || ''}`, path: [], heading: Math.PI / 2, leaving: false };
    slotOf.set(v.id, slot);
    const park = _parkPos(actor, slot);
    if (animate) {
      model.position.set(-75, 0, ROAD_Z - 2);
      actor.heading = 0;
      actor.path = [
        { to: new THREE.Vector3(park.x - 8, 0, ROAD_Z - 2) },
        { to: new THREE.Vector3(park.x, 0, ROAD_Z - 8) },
        { to: park },
      ];
    } else {
      model.position.copy(park);
    }
    model.rotation.y = actor.heading;
    scene.add(model);
    actors.set(v.id, actor);
  }

  function _removeActor(id, animate = true) {
    const actor = actors.get(id);
    if (!actor) return;
    if (!animate) {
      scene.remove(actor.model);
      actors.delete(id);
      slotOf.delete(id);
      return;
    }
    if (actor.leaving) return;
    actor.leaving = true;
    slotOf.delete(id);
    const p = actor.model.position;
    actor.path = [
      { to: new THREE.Vector3(p.x, 0, ROAD_Z - 7), reverse: true },
      { to: new THREE.Vector3(p.x + 10, 0, ROAD_Z + 2) },
      { to: new THREE.Vector3(140, 0, ROAD_Z + 2) },
    ];
  }

  function sync(animate = true) {
    const state = getState();
    const atDepot = state.vehicles.filter(v => v.atDepot);
    const ids = new Set(atDepot.map(v => v.id));
    for (const [id, actor] of actors) {
      const v = atDepot.find(x => x.id === id);
      if (!ids.has(id) || (v && `${v.catalogId}|${v.trailerId || ''}` !== actor.key)) _removeActor(id, animate);
    }
    for (const v of atDepot) {
      const a = actors.get(v.id);
      if (!a || a.leaving) {
        if (a && a.leaving) continue;
        _addActor(v, animate);
      }
    }
    if (state.companyName !== signText) {
      signText = state.companyName;
      signMat.map.dispose();
      signMat.map = _signTexture(signText);
      signMat.needsUpdate = true;
    }
    return state;
  }

  // Passing traffic on the public road
  const traffic = [];
  for (let i = 0; i < 2; i++) {
    const m = buildVehicleModel(TRAFFIC_IDS[i], { color: i ? '#3b82f6' : '#f5a524' });
    m.position.set(i ? 130 : -130, 0, ROAD_Z + (i ? 2 : -2));
    m.rotation.y = i ? Math.PI : 0;
    scene.add(m);
    traffic.push({ model: m, dir: i ? -1 : 1, speed: 16 + i * 4, wait: i * 6 });
  }

  function _stepActor(actor, dt) {
    let travel = DRIVE_SPEED * dt;
    while (travel > 0 && actor.path.length) {
      const seg = actor.path[0];
      const pos = actor.model.position;
      const d = seg.to.clone().sub(pos);
      d.y = 0;
      const dist = d.length();
      if (dist < 1e-3) { actor.path.shift(); continue; }
      const step = Math.min(dist, travel);
      const dir = d.normalize();
      let targetHeading = Math.atan2(-dir.z, dir.x);
      if (seg.reverse) targetHeading += Math.PI;
      let diff = targetHeading - actor.heading;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      actor.heading += diff * Math.min(1, dt * 4);
      pos.addScaledVector(dir, step);
      spinWheels(actor.model, seg.reverse ? -step : step);
      travel -= step;
      if (step >= dist) actor.path.shift();
    }
    actor.model.rotation.y = actor.heading;
    if (!actor.path.length && !actor.leaving) {
      let diff = Math.PI / 2 - actor.heading;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      actor.heading += diff * Math.min(1, dt * 3);
      actor.model.rotation.y = actor.heading;
    }
  }

  // ── Loop ──
  function resize() {
    const w = container.clientWidth || 600;
    const h = container.clientHeight || 220;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  const ro = new ResizeObserver(resize);
  ro.observe(container);
  resize();
  sync(false);

  let last = performance.now();
  let syncTimer = 0;
  let t = 0;
  let raf = 0;
  let disposed = false;
  let wasHidden = false;

  function frame(now) {
    if (disposed) return;
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    if (document.hidden || !container.isConnected || container.offsetParent === null) { wasHidden = true; return; }
    t += dt;

    // After being hidden (other screen / tab), jump straight to the current fleet state
    syncTimer += dt;
    let state = null;
    if (wasHidden) { wasHidden = false; syncTimer = 0; state = sync(false); }
    else if (syncTimer > 0.5) { syncTimer = 0; state = sync(true); }

    for (const [id, actor] of actors) {
      _stepActor(actor, dt);
      if (actor.leaving && !actor.path.length) {
        scene.remove(actor.model);
        actors.delete(id);
      }
    }

    for (const car of traffic) {
      if (car.wait > 0) { car.wait -= dt; continue; }
      const step = car.speed * dt;
      car.model.position.x += car.dir * step;
      spinWheels(car.model, step);
      if (Math.abs(car.model.position.x) > 135) {
        car.model.position.x = -135 * car.dir;
        car.wait = 4 + Math.random() * 10;
      }
    }

    const hour = (state || getState()).hour;
    const { sunUp, sky, isNight } = _daylight(hour);
    scene.background = sky;
    scene.fog.color.copy(sky);
    sun.intensity = 0.15 + sunUp * 2.3;
    hemi.intensity = 0.25 + sunUp * 0.9;
    const sunAngle = ((hour - 6) / 12) * Math.PI;
    sun.position.set(Math.cos(sunAngle) * 50, 10 + Math.max(0, Math.sin(sunAngle)) * 40, 25);
    winMat.emissiveIntensity = isNight ? 1.2 : 0;
    lampMat.emissiveIntensity = isNight ? 2 : 0;
    lampLights.forEach(l => { l.intensity = isNight ? 60 : 0; });

    camera.position.set(Math.sin(t * 0.06) * 12, 17, 40);
    camera.lookAt(0, 1, -5);
    renderer.render(scene, camera);
  }
  raf = requestAnimationFrame(frame);

  return {
    container,
    refresh: () => sync(true),
    dispose() {
      disposed = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
