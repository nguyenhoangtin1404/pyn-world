// @ts-check
import { createBirds } from '../world/birds.js';

// Pigeons on the first stop's platform and canopy — they scatter when people or the train come
// close — and flocks of birds in the sky, which roost at night. Options (worlds with land cover):
// gulls (flocks over the beach), egrets (flocks low over the rice fields). After "villagers", the pigeons also
// keep off benches and posts (they use the villagers' nav grid for that).
/** @type {import('../types').Feature} */
export default {
  label: 'Đang gọi chim',
  needs: ['station'], // the pigeons live on its platform and canopy
  build(world, { rng, gulls = 0, egrets = 0 }) {
    const st = world.stations.find((s) => s.canopyPoint);
    const scenery = { platformPoint: st.point, canopyPoint: st.canopyPoint };
    // In a world from map data: flocks of gulls over the beach, egrets low over the rice fields.
    const more = [];
    const cover = world.cfg.landcover;
    if (cover && (gulls || egrets)) {
      const where = { beach: [], field: [] };
      const step = world.size / 40;
      for (let x = -world.size / 2 + step; x < world.size / 2; x += step) {
        for (let z = -world.size / 2 + step; z < world.size / 2; z += step) where[cover(x, z)]?.push([x, z]);
      }
      const pick = (/** @type {number[][]} */ list) => list[Math.floor(rng() * list.length)];
      for (let i = 0; i < gulls && where.beach.length; i++) {
        more.push({ name: 'Hải âu trên biển', count: 6, color: '#ffffff', altitude: 26 + rng() * 14, radius: 40 + rng() * 30, speed: 0.07, formation: 'loose', center: pick(where.beach) });
      }
      for (let i = 0; i < egrets && where.field.length; i++) {
        more.push({ name: 'Cò trắng trên đồng', count: 5, color: '#f6f6f2', altitude: 9 + rng() * 5, radius: 25 + rng() * 20, speed: 0.08, formation: 'loose', center: pick(where.field) });
      }
    }
    const birds = createBirds({ rng, scenery, nav: st.nav ?? null, train: world.train, size: world.track.k, more });
    // First in the bird camera's list (key 7 starts on a bird, then the balloons).
    world.followables.birds.unshift(...birds.followables);
    return {
      group: birds.group,
      update({ dt, t, lights }) {
        const people = [];
        for (const w of world.people) people.push(w.pos);
        birds.update(dt, t, people, lights);
      },
    };
  },
};
