// @ts-check
import * as THREE from 'three';
import { Walker } from '../world/walker.js';
import { PERSON_HEIGHT } from '../world/people.js';

// People out and about in a town from map data: walking the pavements of its streets
// (world.streets, from features/streets.js) — along one side, a pause at the end, then back — and
// strolling round the landmarks' squares. Drawn at world.scale (figures, pace and the way they
// walk × k); umbrellas up in the rain. They don't take the train, so they are world.pedestrians
// (the traffic stops for them where they cross a street), not world.people; the person camera
// (key 6) follows them too. Options: count (on the streets, 24), square (at each landmark, 4).

/** @type {import('../types').Feature} */
export default {
  label: 'Đang cho người đi dạo',
  needs: ['streets'],
  build(world, { rng, count = 24, square = 4 }) {
    const k = world.scale.props;
    const streets = world.streets.filter((s) => s.length >= 15 && s.kind !== 'track');
    world.need('phố từ dữ liệu bản đồ (world.streets)', 'strollers', streets.length);
    const group = new THREE.Group();
    const ground = world.terrain.meshHeightAt;
    /** @type {{ w: Walker, route: THREE.Vector3[], i: number, dir: number }[]} */
    const walkers = [];
    const add = (/** @type {THREE.Vector3[]} */ route, /** @type {(x: number, z: number) => number} */ heightAt, /** @type {string} */ label) => {
      const w = new Walker(rng, heightAt, { speed: 1.3 * k });
      w.group.scale.multiplyScalar(k);
      const i = Math.floor(rng() * (route.length - 1));
      w.place(route[i]);
      group.add(w.group);
      walkers.push({ w, route, i, dir: rng() < 0.5 ? 1 : -1 });
      world.pedestrians.push(w);
      world.followables.people.push({ label: `${label} ${walkers.length}`, anchor: () => w.group });
      if (walkers.length === 1) world.scale.note('person', PERSON_HEIGHT * w.group.scale.y, 'strollers');
    };

    // On the pavement: a street chosen by length (longer ones have more people), one side of it.
    const total = streets.reduce((sum, s) => sum + s.length, 0);
    for (let n = 0; n < count; n++) {
      let r = rng() * total, st = streets[0];
      for (const s of streets) if ((r -= s.length) < 0) {
        st = s;
        break;
      }
      const side = rng() < 0.5 ? 1 : -1, off = side * (st.width / 2 + 0.35 * k);
      const pts = st.points;
      const route = pts.map((p, i) => {
        const [ax, az] = pts[Math.max(0, i - 1)], [bx, bz] = pts[Math.min(pts.length - 1, i + 1)];
        const len = Math.hypot(bx - ax, bz - az) || 1;
        return new THREE.Vector3(p[0] - ((bz - az) / len) * off, 0, p[1] + ((bx - ax) / len) * off);
      });
      add(route, st.heightAt, 'Người đi dạo');
    }
    // Round each landmark's square.
    for (const lm of world.landmarks) {
      const pad = world.cfg.pads?.find((p) => Math.hypot(p.x - lm.spot.x, p.z - lm.spot.z) < p.r);
      if (!pad || pad.r < 10) continue; // a square to walk round, not a hilltop
      const r = pad.r * 0.62;
      const route = Array.from({ length: 25 }, (_, i) => new THREE.Vector3(pad.x + Math.sin((i / 24) * Math.PI * 2) * r, 0, pad.z + Math.cos((i / 24) * Math.PI * 2) * r));
      for (let n = 0; n < square; n++) add(route, ground, `Khách thăm ${lm.name}`);
    }

    return {
      group,
      update({ dt, t, rain }) {
        if (dt === 0) return;
        for (const s of walkers) {
          const { w } = s;
          w.person.setUmbrella(rain > 0.3);
          if (w.pause > 0) {
            w.pause -= dt;
            w.idle(t);
            continue;
          }
          if (w.step(s.route[s.i], dt, t)) {
            const next = s.i + s.dir;
            if (next < 0 || next >= s.route.length) {
              s.dir = -s.dir; // the end of the street: a look round, and back
              w.pause = 1 + rng() * 4;
            } else s.i = next;
          }
        }
      },
    };
  },
};
