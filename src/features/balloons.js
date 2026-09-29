import * as THREE from 'three';
import { lam } from '../world/lowpoly.js';

// Hot-air balloons circling over the valley, firing their burners as they climb (followed by the
// bird camera, key 7). Options: count (4).
const BALLOON_STRIPES = [
  ['#c8453a', '#f2c14e'],
  ['#2f5d7c', '#f1e3c3'],
  ['#6d8b3a', '#f4ead2'],
  ['#8e5aa8', '#f2a36b'],
];

function buildBalloon(colors) {
  const g = new THREE.Group();
  const profile = [[0.8, 0], [1.6, 0.8], [3.2, 2.4], [4.0, 4.2], [4.1, 5.6], [3.6, 7.2], [2.5, 8.3], [0.01, 8.8]].map(
    ([r, y]) => new THREE.Vector2(r, y),
  );
  const geo = new THREE.LatheGeometry(profile, 16).toNonIndexed();
  const p = geo.attributes.position;
  const col = [];
  const a = new THREE.Color(colors[0]);
  const b = new THREE.Color(colors[1]);
  for (let i = 0; i < p.count; i += 3) {
    const cx = (p.getX(i) + p.getX(i + 1) + p.getX(i + 2)) / 3;
    const cz = (p.getZ(i) + p.getZ(i + 1) + p.getZ(i + 2)) / 3;
    const seg = Math.floor(((Math.atan2(cz, cx) + Math.PI) / (Math.PI * 2)) * 16);
    const c = seg % 2 ? a : b;
    for (let k = 0; k < 3; k++) col.push(c.r, c.g, c.b);
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.computeVertexNormals();
  // Own material: each balloon glows only while its own burner fires.
  const envMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, emissive: '#ff9a3c', emissiveIntensity: 0 });
  const envelope = new THREE.Mesh(geo, envMat);
  envelope.castShadow = true;

  const basket = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.0, 1.4), lam('#8a6038'));
  basket.position.y = -2.4;
  basket.castShadow = true;
  const rim = new THREE.Mesh(new THREE.BoxGeometry(1.55, 0.15, 1.55), lam('#5a3b2a'));
  rim.position.y = -1.9;
  const ropePts = [];
  for (const [x, z] of [[-0.65, -0.65], [0.65, -0.65], [0.65, 0.65], [-0.65, 0.65]]) ropePts.push(x, -1.9, z, x * 1.3, 0.1, z * 1.3);
  const ropeGeo = new THREE.BufferGeometry();
  ropeGeo.setAttribute('position', new THREE.Float32BufferAttribute(ropePts, 3));
  const ropes = new THREE.LineSegments(ropeGeo, new THREE.LineBasicMaterial({ color: '#3f2a1f' }));
  const flameMat = new THREE.MeshBasicMaterial({ color: '#ffb347', transparent: true, opacity: 0.9 });
  const flame = new THREE.Mesh(new THREE.ConeGeometry(0.28, 1.0, 8), flameMat);
  flame.position.y = -0.9;
  flame.visible = false;
  g.add(envelope, basket, rim, ropes, flame);
  return { group: g, flame, envMat };
}

export default {
  label: 'Đang bơm khinh khí cầu',
  build(world, { rng, count = 4 }) {
    const group = new THREE.Group();
      // Hot-air balloons
      const balloons = [];
      for (let i = 0; i < count; i++) {
        const b = buildBalloon(BALLOON_STRIPES[i % BALLOON_STRIPES.length]);
        b.cx = (rng() - 0.5) * 200;
        b.cz = (rng() - 0.5) * 200;
        b.r = 60 + rng() * 90;
        b.w = (0.02 + rng() * 0.02) * (rng() < 0.5 ? -1 : 1);
        b.a = rng() * Math.PI * 2;
        b.base = 55 + rng() * 35;
        b.ph = rng() * 10;
        b.burn = 0;
        b.group.scale.setScalar(1.3);
        balloons.push(b);
        group.add(b.group);
      }
      const update = ({ dt, t, lights }) => {
        for (const b of balloons) {
          b.a += b.w * dt;
          const y = b.base + Math.sin(t * 0.15 + b.ph) * 8;
          const rising = Math.cos(t * 0.15 + b.ph) > 0.2;
          b.group.position.set(b.cx + Math.cos(b.a) * b.r, y, b.cz + Math.sin(b.a) * b.r);
          b.group.rotation.set(Math.sin(t * 0.5 + b.ph) * 0.03, t * 0.05 + b.ph, Math.cos(t * 0.4 + b.ph) * 0.03);
          if (dt > 0) {
            b.burn -= dt;
            if (b.burn < -1.5 - Math.random() * 3 && rising) b.burn = 0.6 + Math.random() * 0.8;
          }
          const burning = b.burn > 0;
          b.flame.visible = burning;
          if (burning) b.flame.scale.set(1, 0.8 + Math.random() * 0.5, 1);
          b.envMat.emissiveIntensity = burning ? 0.1 + lights * 0.5 : 0;
        }
      };
    world.followables.birds.push(...balloons.map((b, i) => ({ label: `Khinh khí cầu ${i + 1}`, anchor: () => b.group })));
    return { group, update };
  },
};
