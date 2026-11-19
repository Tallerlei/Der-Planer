import * as THREE from 'three';
import { buildVehicleModel, spinWheels } from './vehicle_models.js';

const SPEED = 22;          // m/s the world scrolls past the truck
const SPAN  = 240;         // length of the recycled world strip

function _skyTexture() {
  const c = document.createElement('canvas');
  c.width = 4; c.height = 256;
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0.0, '#0f1630');
  g.addColorStop(0.45, '#4a2f6b');
  g.addColorStop(0.72, '#e2617a');
  g.addColorStop(0.9, '#ffb36b');
  g.addColorStop(1.0, '#ffd9a0');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 4, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function _flat(geo, color, opts = {}) {
  const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.9, ...opts }));
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

/** Creates the animated main-menu background scene inside `container`. */
export function createMenuScene(container) {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.shadowMap.enabled = true;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.domElement.className = 'menu-scene-canvas';
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = _skyTexture();
  scene.fog = new THREE.Fog('#c86a7a', 60, 220);

  const camera = new THREE.PerspectiveCamera(40, 1, 0.5, 600);

  scene.add(new THREE.HemisphereLight(0xffc9a8, 0x2b2140, 1.3));
  const sun = new THREE.DirectionalLight(0xffb070, 2.6);
  sun.position.set(70, 35, 55);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -30, right: 30, top: 20, bottom: -20, near: 1, far: 250 });
  scene.add(sun);

  const sunDisc = new THREE.Mesh(new THREE.CircleGeometry(18, 40), new THREE.MeshBasicMaterial({ color: '#ffd59a', fog: false }));
  sunDisc.position.set(260, 30, -420);
  sunDisc.lookAt(0, 0, 0);
  scene.add(sunDisc);

  const ground = _flat(new THREE.PlaneGeometry(1200, 600), '#3d5a3a');
  ground.rotation.x = -Math.PI / 2;
  ground.castShadow = false;
  scene.add(ground);
  const road = _flat(new THREE.PlaneGeometry(1200, 9), '#2c2e33');
  road.rotation.x = -Math.PI / 2;
  road.position.y = 0.02;
  road.castShadow = false;
  scene.add(road);

  // Recycled world objects (move toward −X)
  const movers = [];
  const dashMat = new THREE.MeshBasicMaterial({ color: '#f0f0f0' });
  for (let x = -SPAN / 2; x < SPAN / 2; x += 8) {
    const d = new THREE.Mesh(new THREE.PlaneGeometry(4, 0.25), dashMat);
    d.rotation.x = -Math.PI / 2;
    d.position.set(x, 0.04, 0);
    scene.add(d);
    movers.push({ obj: d, factor: 1 });
  }
  for (const side of [-1, 1]) {
    for (let x = -SPAN / 2; x < SPAN / 2; x += 6) {
      const post = _flat(new THREE.BoxGeometry(0.2, 0.9, 0.2), '#d9d9d9');
      post.position.set(x, 0.45, side * 5.6);
      scene.add(post);
      movers.push({ obj: post, factor: 1 });
    }
  }
  for (let i = 0; i < 70; i++) {
    const s = 0.8 + Math.random() * 1.2;
    const g = new THREE.Group();
    const trunk = _flat(new THREE.CylinderGeometry(0.25 * s, 0.35 * s, 1.6 * s, 6), '#4a3423');
    trunk.position.y = 0.8 * s;
    const crown = _flat(new THREE.ConeGeometry(1.7 * s, 4 * s, 7), Math.random() < 0.5 ? '#2b5d35' : '#36703f');
    crown.position.y = 3.6 * s;
    g.add(trunk, crown);
    // Far side of the road only, so nothing blocks the camera
    g.position.set(-SPAN / 2 + Math.random() * SPAN, 0, -(9 + Math.random() * 45));
    scene.add(g);
    movers.push({ obj: g, factor: 1 });
  }
  for (let i = 0; i < 14; i++) {
    const h = 30 + Math.random() * 50;
    const m = _flat(new THREE.ConeGeometry(30 + Math.random() * 30, h, 5), '#3b2f55');
    m.position.set(-SPAN + Math.random() * SPAN * 2, h / 2 - 2, -150 - Math.random() * 80);
    scene.add(m);
    movers.push({ obj: m, factor: 0.08, span: SPAN * 2 });
  }

  const hero = buildVehicleModel('semi', { color: '#e93a55', trailerId: 'curtainsider' });
  hero.position.set(0, 0, 2.2);
  scene.add(hero);

  const oncoming = buildVehicleModel('reefer', { color: '#3b82f6' });
  oncoming.rotation.y = Math.PI;
  oncoming.position.set(200, 0, -2.2);
  scene.add(oncoming);
  let oncomingWait = 3;

  function resize() {
    const w = container.clientWidth || window.innerWidth;
    const h = container.clientHeight || window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  const ro = new ResizeObserver(resize);
  ro.observe(container);
  resize();

  let last = performance.now();
  let t = 0;
  let raf = 0;
  let disposed = false;
  const reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function frame(now) {
    if (disposed) return;
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    if (document.hidden) return;
    const speed = reduced ? SPEED * 0.15 : SPEED;
    t += dt;

    const step = speed * dt;
    for (const m of movers) {
      const span = m.span || SPAN;
      m.obj.position.x -= step * m.factor;
      if (m.obj.position.x < -span / 2) m.obj.position.x += span;
    }
    spinWheels(hero, step);
    hero.position.y = Math.sin(t * 9) * 0.015;

    if (oncomingWait > 0) oncomingWait -= dt;
    else {
      const s2 = (speed + 20) * dt;
      oncoming.position.x -= s2;
      spinWheels(oncoming, s2);
      if (oncoming.position.x < -160) { oncoming.position.x = 200; oncomingWait = 5 + Math.random() * 8; }
    }

    // Wide screens: keep the truck left of the centred menu panel
    const wide = camera.aspect > 1.2;
    camera.position.set((wide ? 4 : -10) + Math.sin(t * 0.15) * 3, 5 + Math.sin(t * 0.11) * 0.6, wide ? 27 : 30);
    camera.lookAt(wide ? 20 : 2, 3, -3);
    renderer.render(scene, camera);
  }
  raf = requestAnimationFrame(frame);

  return {
    dispose() {
      disposed = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
