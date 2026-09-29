// @ts-check
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { box, cyl, cone, shape, VERTEX_COLORED } from '../world/lowpoly.js';
import { shadowed } from './common.js';

// A windmill on the highest free spot near the middle of the valley; only its sails turn.
/** @type {import('../types').Feature} */
export default {
  label: 'Đang dựng cối xay gió',
  build(world, { rng }) {
    const { site, batch } = world;
    const group = new THREE.Group();
    let best = null;
    for (let i = 0; i < 120; i++) {
      const a = rng() * Math.PI * 2;
      const r = 30 + rng() * 70;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      const h = site.spotOK(x, z, 16);
      if (h !== null && (!best || h > best.h)) best = { x, z, h };
    }
    if (best) {
      const rot = Math.atan2(-best.x, -best.z) + 0.6;
      batch.at(best.x, best.h - 0.5, best.z, rot);
      batch.add([
        cyl(1.4, 2.3, 10, '#f1e3c3', [0, 5, 0], {}, 8),
        cone(2.0, 2.6, '#c8453a', [0, 11.3, 0], {}, 8),
        box(1.0, 1.8, 0.1, '#6b4a33', [0, 0.9, 2.05]),
      ]);
      // Only the sails turn: they stay a separate mesh.
      const blades = [0, 1, 2, 3].map((k) => shape(new THREE.BoxGeometry(1.1, 6.5, 0.1).translate(0.3, 3.4, 0), '#efe3c6', [0, 0, 0], { rz: (k * Math.PI) / 2 }));
      const hub = new THREE.Mesh(mergeGeometries([...blades, cyl(0.35, 0.35, 0.6, '#3a302b', [0, 0, 0], { rx: Math.PI / 2 }, 8)]), VERTEX_COLORED);
      hub.position.set(0, 9.6, 2.0);
      const mill = new THREE.Group();
      mill.position.set(best.x, best.h - 0.5, best.z);
      mill.rotation.y = rot;
      mill.add(hub);
      group.add(shadowed(mill));
      site.obstacles.push([best.x, best.z, 7]);
      site.colliders.push({ x: best.x, z: best.z, r: 2.4 });
      site.solids.push({ x: best.x, z: best.z, r: 2.3, y0: best.h - 0.5, y1: best.h + 12.6 });
      return { group, update: ({ dt }) => (hub.rotation.z -= dt * 0.7) };
    }
    return { group };
  },
};
