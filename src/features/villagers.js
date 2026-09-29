import * as THREE from 'three';
import { Walker, turnToward } from '../world/walker.js';
import { buildAreas, planner } from './villagers/areas.js';
import { createRiding } from './villagers/riding.js';
import { stepChild } from './villagers/kids.js';

// People living around each stop (world.stations): they walk between their homes and the platform,
// routed around obstacles on a nav grid per stop (villagers/areas.js), and ride the train to another
// stop, where they then go about their day (villagers/riding.js). Children tag along beside a
// grown-up (villagers/kids.js). Umbrellas go up when it rains, except indoors.
// Options: perStop (grown-ups at each stop; the last number counts for the stops after it: [12, 10]),
// kids (children, same way: [4, 3]).
export default {
  label: 'Đang đón dân làng',
  needs: ['train'],
  build(world, { rng, perStop = [12, 10], kids: kidsPerStop = [4, 3] }) {
    const { site, train } = world;
    const isIndoors = (x, z) => world.services.get('houses')?.isIndoors(x, z) ?? false;
    const group = new THREE.Group();
    const areas = buildAreas(world);
    const { pickStop, plan } = planner(rng);
    const countAt = (list, i) => list[Math.min(i, list.length - 1)];

    const villagers = [];
    const kids = [];
    areas.forEach((area, ai) => {
      const n = countAt(perStop, ai);
      const first = villagers.length;
      for (let i = 0; i < n; i++) {
        const w = new Walker(rng, site.walkHeight);
        w.area = area;
        w.stop = pickStop(area, null);
        w.place(w.stop.p);
        w.pause = rng() * 4;
        w.plan = plan;
        villagers.push(w);
        group.add(w.group);
      }
      for (let i = 0; i < Math.min(countAt(kidsPerStop, ai), n); i++) {
        const parent = villagers[first + i * 3];
        const k = new Walker(rng, site.walkHeight, { kind: 'child', speed: 1.4 }); // pace set by stepChild()
        k.parent = parent;
        k.side = rng() < 0.5 ? -1 : 1;
        k.spot = new THREE.Vector3();
        k.place(area.nav.nearestFree(parent.pos.x + 1, parent.pos.z) || parent.pos);
        kids.push(k);
        group.add(k.group);
      }
    });
    // Doors open for them (houses.js), pigeons flee from them (birds).
    world.people.push(...villagers, ...kids);
    const riding = createRiding({ train, villagers, areas, rng });

    // Who the follow cameras can ride along with. Someone on the train is followed via their carriage.
    world.followables.people.push(
      ...villagers.map((w, i) => ({ label: `Dân làng ${i + 1}`, anchor: () => (w.group.visible ? w.group : w.car || w.group) })),
      ...kids.map((k, i) => ({ label: `Em bé ${i + 1}`, anchor: () => (k.group.visible ? k.group : k.parent.car || k.group) })),
    );

    return {
      group,
      update({ dt, t, rain }) {
        if (dt === 0 || !areas.length) return;
        const rainy = rain > 0.3;
        riding.update();
        for (const w of villagers) {
          w.person.setUmbrella(rainy && !isIndoors(w.pos.x, w.pos.z));
          if (riding.step(w, dt, t)) continue;
          if (w.pause > 0) {
            // Standing at home, or on the platform facing the track.
            w.pause -= dt;
            if (w.stop?.face != null) w.heading = turnToward(w.heading, w.stop.face, Math.min(1, dt * 3));
            w.sync();
            w.idle(t);
            if (w.pause <= 0) w.plan(w);
            continue;
          }
          if (!w.path) {
            w.plan(w);
            continue;
          }
          if (w.step(w.path[w.pi], dt, t)) {
            w.pi++;
            if (w.pi >= w.path.length) {
              w.path = null;
              w.pause = w.stop.face != null ? 6 + rng() * 10 : 4 + rng() * 8; // a while on the platform or at home
            }
          }
        }
        for (const k of kids) {
          k.person.setUmbrella(rainy && !isIndoors(k.pos.x, k.pos.z));
          stepChild(k, dt, t);
        }
      },
    };
  },
};
