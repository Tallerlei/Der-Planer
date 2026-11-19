import * as THREE from 'three';
import { DATA } from '../data.js';
import { buildVehicleModel } from './vehicle_models.js';

const W = 360;
const H = 220;

function _shadowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d');
  const grd = ctx.createRadialGradient(64, 64, 4, 64, 64, 64);
  grd.addColorStop(0, 'rgba(0,0,0,0.55)');
  grd.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

function _toBlobUrl(canvas) {
  return new Promise(resolve => {
    canvas.toBlob(b => resolve(b ? URL.createObjectURL(b) : null), 'image/png');
  });
}

/**
 * Renders a studio shot of every vehicle (and every compatible trailer combination).
 * @returns {Promise<Array<[string, string]>>} [key, objectUrl] pairs
 */
export async function renderAllThumbnails() {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(W * 2, H * 2, false);
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;

  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xdde8ff, 0x3a3328, 1.6));
  const key = new THREE.DirectionalLight(0xffffff, 2.4);
  key.position.set(8, 12, 10);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0x88aaff, 1.2);
  rim.position.set(-10, 6, -8);
  scene.add(rim);

  const shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({ map: _shadowTexture(), transparent: true, depthWrite: false })
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.01;
  scene.add(shadow);

  const camera = new THREE.PerspectiveCamera(28, W / H, 0.1, 200);

  const jobs = [];
  for (const v of DATA.VEHICLES) {
    jobs.push({ key: v.id, catalogId: v.id, trailerId: null });
    if (v.trailerSlot) {
      for (const t of DATA.TRAILERS.filter(t => t.compatibleWith.includes(v.id))) {
        jobs.push({ key: `${v.id}+${t.id}`, catalogId: v.id, trailerId: t.id });
      }
    }
  }

  const results = [];
  for (const job of jobs) {
    const model = buildVehicleModel(job.catalogId, { trailerId: job.trailerId });
    scene.add(model);
    const len = model.userData.length;
    shadow.scale.set(len * 1.25, 4.5, 1);

    // Frame the model by its bounding sphere so long and short vehicles fill the image alike
    const sphere = new THREE.Box3().setFromObject(model).getBoundingSphere(new THREE.Sphere());
    const dist = Math.max(7.5, sphere.radius * 2.35);
    const dir = new THREE.Vector3(0.62, 0.36, 0.78).normalize();
    camera.position.copy(sphere.center).addScaledVector(dir, dist);
    camera.lookAt(sphere.center);
    renderer.render(scene, camera);

    const url = await _toBlobUrl(renderer.domElement);
    if (url) results.push([job.key, url]);
    scene.remove(model);
  }

  renderer.dispose();
  return results;
}
