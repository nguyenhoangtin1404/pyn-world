import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Night lighting shared by every feature of a world: window glass and lamp bulbs that glow after
// dark, and for each lamp a soft halo plus (for the bigger ones) a pool of light on the ground.
// Lamps don't use real lights: every light is evaluated for every lit pixel, day and night.
//   const { windowMat, lampMat, halos, pools } = lamps(world);
//   halos.push([x, y, z]); pools.push([x, y, z, radius]);
export const lamps = (world) => world.service('lamps', () => createLamps(world));

// Soft round light: bright centre fading to nothing (lamp halos and pools of light).
function glowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.35, 'rgba(255,255,255,0.45)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createLamps(world) {
  const group = new THREE.Group();
  // Own materials (not the shared cache): they light up at night.
  const windowMat = new THREE.MeshLambertMaterial({ color: '#4a5563', emissive: '#ffcf70', emissiveIntensity: 0, flatShading: true });
  const lampMat = new THREE.MeshLambertMaterial({ color: '#fff4d6', emissive: '#ffd58a', emissiveIntensity: 0, flatShading: true });
  const halos = []; // [x, y, z]
  const pools = []; // [x, y, z, radius]
  let haloMat, poolMat, haloPts, poolMesh;

  return world.add({
    group,
    windowMat,
    lampMat,
    halos,
    pools,
    // Once every feature has placed its lamps: two draw calls for every lamp in the world, skipped
    // altogether in daylight. Own materials: their opacity follows the night.
    finish() {
      const glowTex = glowTexture();
      const haloGeo = new THREE.BufferGeometry();
      haloGeo.setAttribute('position', new THREE.Float32BufferAttribute(halos.flat(), 3));
      haloMat = new THREE.PointsMaterial({ color: '#ffd58a', map: glowTex, size: 2.6, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
      haloPts = new THREE.Points(haloGeo, haloMat);
      poolMat = new THREE.MeshBasicMaterial({ color: '#ffcf80', map: glowTex, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
      poolMesh = new THREE.Mesh(pools.length ? mergeGeometries(pools.map(([x, y, z, r]) => new THREE.PlaneGeometry(r * 2, r * 2).rotateX(-Math.PI / 2).translate(x, y + 0.04, z))) : new THREE.BufferGeometry(), poolMat);
      poolMesh.renderOrder = 1;
      haloPts.renderOrder = 2;
      group.add(haloPts, poolMesh);
    },
    lateUpdate({ lights: l }) {
      windowMat.emissiveIntensity = l * 1.3;
      lampMat.emissiveIntensity = l * 2;
      haloMat.opacity = Math.min(1, l * 1.2);
      poolMat.opacity = Math.min(0.55, l * 0.7);
      haloPts.visible = poolMesh.visible = l > 0.02;
    },
  });
}
