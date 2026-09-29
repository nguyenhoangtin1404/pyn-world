// @ts-check
import * as THREE from 'three';
import { Fleet } from '../world/vehicles/fleet.js';
import { Vehicle } from '../world/vehicles/vehicle.js';
import { LoopPath, ellipse } from '../world/vehicles/path.js';

// Light aircraft flying circuits over the valley, each on its own loop and at its own height,
// banking into the turns, propeller spinning, wing-tip lights on. Followed by the bird camera
// (key 7). Options: count (2).
/** @type {import('../types').Feature} */
export default {
  label: 'Đang cất cánh máy bay',
  build(world, { rng, count = 2 }) {
    const { size } = world;
    const group = new THREE.Group();
    const fleet = new Fleet({ plane: count });
    group.add(...fleet.meshes);
    const planes = [];
    for (let i = 0; i < count; i++) {
      const path = new LoopPath(
        ellipse({
          cx: (rng() - 0.5) * size * 0.2,
          cz: (rng() - 0.5) * size * 0.2,
          rx: size * (0.28 + rng() * 0.1),
          rz: size * (0.2 + rng() * 0.1),
          dir: rng() < 0.5 ? 1 : -1,
        }),
      );
      // Well above the balloons (55–90) and the birds; the loops don't overlap in height.
      const plane = new Vehicle({ kind: 'plane', fleet, path, s: rng() * path.length, rng, altitude: 110 + i * 25, amplitude: 6 });
      group.add(plane.group);
      planes.push(plane);
    }
    world.vehicles.push(...planes);
    world.followables.birds.push(...planes.map((p, i) => ({ label: `Máy bay ${i + 1}`, anchor: () => p.group })));
    return {
      group,
      update({ dt }) {
        for (const p of planes) p.update(dt);
      },
    };
  },
};
