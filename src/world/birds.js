import * as THREE from 'three';
import { createPigeonParts, Pigeon } from './birds/pigeons.js';
import { createSkyBirdParts, Flock } from './birds/flocks.js';

// Pigeons pottering about the station platform (birds/pigeons.js), and flocks of birds wheeling
// across the sky (birds/flocks.js) — all drawn with Instancer, a few InstancedMeshes in all.

// size: the pigeons' (the station's size, world.scale.props). more: extra flocks, each
// { name, count, color, altitude, radius, speed, formation, center } (seagulls over a coast…).
export function createBirds({ rng, scenery, nav, train, size = 1, more = [] }) {
  const group = new THREE.Group();
  const floorY = scenery.platformPoint(0.5, 0.5).y;
  // On the platform floor and not under a bench or against a post.
  const isFree = (x, z) => !nav || (nav.isFree(x, z) && Math.abs(nav.height[nav.index(x, z)] - floorY) < 0.1);
  const place = {
    ground: () => {
      let p;
      for (let i = 0; i < 12; i++) {
        p = scenery.platformPoint(rng(), rng());
        if (isFree(p.x, p.z)) break;
      }
      return p;
    },
    roof: () => scenery.canopyPoint(rng(), rng()),
    isFree,
  };
  const pigeonParts = createPigeonParts(9);
  const skyParts = createSkyBirdParts(24 + more.reduce((n, f) => n + f.count, 0));
  group.add(...[...Object.values(pigeonParts), ...Object.values(skyParts)].map((p) => p.mesh));
  const pigeons = [];
  for (let i = 0; i < 9; i++) {
    const p = new Pigeon(rng, place, pigeonParts, size);
    p.foldWings();
    pigeons.push(p);
    group.add(p.group);
  }

  const flocks = [
    new Flock(rng, skyParts, { count: 7, color: '#3a3a44', altitude: 55, radius: 130, speed: 0.05, formation: 'v' }),
    new Flock(rng, skyParts, { count: 5, color: '#5a4a3c', altitude: 70, radius: 90, speed: 0.07, formation: 'v' }),
    new Flock(rng, skyParts, { count: 6, color: '#ffffff', altitude: 38, radius: 70, speed: 0.06, formation: 'loose' }),
    ...more.map((f) => new Flock(rng, skyParts, f)),
  ];
  flocks.forEach((f) => group.add(f.group));

  const trainThreat = { x: 0, y: 0, z: 0, r: 5 * size };
  const flockNames = ['Chim sáo (đàn chữ V)', 'Chim nhạn (đàn chữ V)', 'Hải âu', ...more.map((f) => f.name)];
  const followables = [
    ...flocks.flatMap((f, i) => f.birds.slice(0, 2).map((b) => ({ label: flockNames[i], anchor: () => b.group }))),
    ...pigeons.map((p, i) => ({ label: `Bồ câu ${i + 1}`, anchor: () => p.group })),
  ];
  return {
    group,
    followables,
    update(dt, t, people, lights) {
      // The locomotive rolling in scares them as well.
      const threats = people;
      if (train && train.v > 0.5) {
        trainThreat.x = train.locoPos.x;
        trainThreat.y = train.locoPos.y + 0.4;
        trainThreat.z = train.locoPos.z;
        threats.push(trainThreat);
      }
      for (const p of pigeons) p.update(dt, t, threats);
      // Birds go to roost at night.
      const day = lights < 0.6;
      for (const f of flocks) {
        f.group.visible = day;
        if (day) f.update(dt, t);
      }
    },
  };
}
