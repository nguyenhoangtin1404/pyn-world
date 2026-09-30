// @ts-check
import * as THREE from 'three';
import { turnToward } from '../utils.js';
import { Walker } from '../world/walker.js';
import { buildAreas, planner } from './villagers/areas.js';
import { createRiding } from './villagers/riding.js';
import { stepChild } from './villagers/kids.js';

// People living around each stop (world.stations): they walk between their homes and the platform,
// routed around obstacles on a nav grid per stop (villagers/areas.js), and ride the train to another
// stop, where they then go about their day (villagers/riding.js). Children tag along beside a
// grown-up (villagers/kids.js). Umbrellas go up when it rains, except indoors. They keep off the
// carriageway except at crosswalks (the nav grid knows the roads), and wait at the kerb until the
// crosswalk's lights say walk (or the level crossing is clear).
// Options: perStop (grown-ups at each stop; the last number counts for the stops after it: [12, 10]),
// kids (children, same way: [4, 3]).

/**
 * A Walker living around a stop, with its plans (areas.js) and its train journey (riding.js).
 * @typedef {Walker & { area: any, stop: any, path: THREE.Vector3[] | null, pi: number, plan: (w: Villager) => void,
 *   mode?: string | null, door?: any, car?: THREE.Object3D, fixedY?: number | null, waiting?: boolean }} Villager
 * A child following a grown-up (kids.js).
 * @typedef {Walker & { parent: Villager, side: number, spot: THREE.Vector3, path?: THREE.Vector3[] | null, pi?: number,
 *   moving?: boolean, replan?: number, fixedY?: number | null }} Child
 */
/** @type {import('../types').Feature} */
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

    /** @type {Villager[]} */
    const villagers = [];
    /** @type {Child[]} */
    const kids = [];
    areas.forEach((area, ai) => {
      const n = countAt(perStop, ai);
      const first = villagers.length;
      for (let i = 0; i < n; i++) {
        const w = /** @type {Villager} */ (new Walker(rng, site.walkHeight));
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
        const k = /** @type {Child} */ (new Walker(rng, site.walkHeight, { kind: 'child', speed: 1.4 })); // pace set by stepChild()
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
    // A crosswalk just ahead, that someone not on it yet may not start across now?
    const ahead = new THREE.Vector3();
    const mustWait = (/** @type {Villager} */ w, /** @type {THREE.Vector3} */ target) => {
      const nav = w.area.nav;
      if (!site.crossings.length || nav.crossingAt(w.pos.x, w.pos.z) >= 0) return false;
      const d = Math.hypot(target.x - w.pos.x, target.z - w.pos.z) || 1;
      for (const k of [0.5, 1, 1.5]) {
        ahead.set(w.pos.x + ((target.x - w.pos.x) / d) * Math.min(k, d), 0, w.pos.z + ((target.z - w.pos.z) / d) * Math.min(k, d));
        const c = nav.crossingAt(ahead.x, ahead.z);
        if (c >= 0) return !site.crossings[c].walk();
      }
      return false;
    };

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
          w.waiting = mustWait(w, w.path[w.pi]);
          if (w.waiting) {
            // At the kerb, facing the way across, until the lights say walk.
            const to = w.path[w.pi];
            w.heading = turnToward(w.heading, Math.atan2(to.x - w.pos.x, to.z - w.pos.z), Math.min(1, dt * 4));
            w.sync();
            w.idle(t);
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
