// @ts-check
import { createBirds } from '../world/birds.js';

// Pigeons on the first stop's platform and canopy — they scatter when people or the train come
// close — and flocks of birds in the sky, which roost at night. After "villagers", the pigeons also
// keep off benches and posts (they use the villagers' nav grid for that).
/** @type {import('../types').Feature} */
export default {
  label: 'Đang gọi chim',
  needs: ['station'], // the pigeons live on its platform and canopy
  build(world, { rng }) {
    const st = world.stations.find((s) => s.canopyPoint);
    const scenery = { platformPoint: st.point, canopyPoint: st.canopyPoint };
    const birds = createBirds({ rng, scenery, nav: st.nav ?? null, train: world.train, size: world.track.k });
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
