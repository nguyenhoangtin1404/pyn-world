import { createBirds } from '../world/birds.js';

// Pigeons on the first stop's platform and canopy — they scatter when people or the train come
// close — and flocks of birds in the sky, which roost at night. Comes after "villagers" (the
// pigeons walk on their nav grid).
export default {
  label: 'Đang gọi chim',
  build(world, { rng }) {
    const st = world.stations[0];
    world.need('một ga có mái che ("station")', 'birds', st?.canopyPoint);
    const scenery = { platformPoint: st.point, canopyPoint: st.canopyPoint };
    const birds = createBirds({ rng, scenery, nav: st.nav ?? null, train: world.train });
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
