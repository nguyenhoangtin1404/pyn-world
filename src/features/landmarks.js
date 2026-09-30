// @ts-check
import * as THREE from 'three';
import { LANDMARKS } from '../landmarks/index.js';

// The famous buildings of a world from map data (cfg.landmarks, from the recipe's `landmarks`: a
// model from src/landmarks/ at a named place, on the flat pad the terrain made for it). Put it
// before "trees": they keep off. The camera flies to each in turn with V (world.landmarks).
/** @type {import('../types').Feature} */
export default {
  label: 'Đang dựng công trình',
  build(world, { rng }) {
    const list = world.cfg.landmarks ?? [];
    world.need('danh sách công trình (landmarks trong công thức world bản đồ)', 'landmarks', list.length);
    const systems = [];
    for (const lm of list) {
      const model = LANDMARKS[lm.model];
      if (!model) throw new Error(`Không có công trình "${lm.model}" (src/landmarks/index.js)`);
      const built = model.build({ world, x: lm.p[0], y: lm.h, z: lm.p[1], ry: lm.rotation, rng });
      world.landmarks.push({ id: lm.id, name: lm.name, spot: built.spot, view: built.view });
      if (built.system) systems.push(built.system);
    }
    const group = new THREE.Group();
    for (const s of systems) if (s.group) group.add(s.group);
    return {
      group,
      update: (f) => systems.forEach((s) => s.update?.(f)),
      lateUpdate: (f) => systems.forEach((s) => s.lateUpdate?.(f)),
    };
  },
};
