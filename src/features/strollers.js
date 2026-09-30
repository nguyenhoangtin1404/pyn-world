// @ts-check
import * as THREE from 'three';
import { Walker } from '../world/walker.js';
import { PERSON_HEIGHT } from '../world/people.js';
import { CLAIM } from '../world/site.js';
import { PAVEMENT } from './streets.js';

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

    // Anywhere within a person's reach of (x, z) on a carriageway (the claims are half-unit cells:
    // one point alone can read a cell whose middle is just off the street while it stands on it).
    const onCarriageway = (/** @type {number} */ x, /** @type {number} */ z) => {
      const r = 0.3, { site } = world;
      for (const [dx, dz] of [[0, 0], [r, 0], [-r, 0], [0, r], [0, -r]]) if (site.claimAt(x + dx, z + dz) === CLAIM.CARRIAGEWAY) return true;
      return false;
    };
    // On the pavement: a street chosen by length (longer ones have more people), one side of it.
    // (The diorama's edge counts as a street's: nobody walks off it.)
    const edge = world.size / 2 - 3;
    const offLimits = (/** @type {number} */ x, /** @type {number} */ z) => Math.abs(x) > edge || Math.abs(z) > edge || onCarriageway(x, z);
    const total = streets.reduce((sum, s) => sum + s.length, 0);
    for (let n = 0, tries = 0; n < count && tries < count * 5; tries++) {
      let r = rng() * total, st = streets[0];
      for (const s of streets) if ((r -= s.length) < 0) {
        st = s;
        break;
      }
      const side = rng() < 0.5 ? 1 : -1;
      const route = pavementRoute(st.points, st.width / 2 + (PAVEMENT * k) / 2, side, offLimits);
      if (route.length < 8) continue; // a walk worth the name: another street
      add(route, st.pavementAt, 'Người đi dạo');
      n++;
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

/**
 * A walk along one side of a street, `off` from its middle (the middle of the pavement): points
 * that land on a carriageway (another street drawn over this pavement) are pushed further out,
 * up to 0.8 of a unit, and if that isn't enough they are a crossing — kept, unless at the ends: the
 * walk starts and ends on a pavement, not in the middle of the street it meets.
 * @param {[number, number][]} pts @param {number} off @param {1 | -1} side
 * @param {(x: number, z: number) => boolean} onCarriageway
 * @param {number} [maxCrossing] most points in a row a crossing takes
 * @returns {THREE.Vector3[]}
 */
export function pavementRoute(pts, off, side, onCarriageway, maxCrossing = 4) {
  const route = pts.map((p, i) => {
    // The right-hand side (side 1) or left, from the direction over a few points either side.
    const [ax, az] = pts[Math.max(0, i - 3)], [bx, bz] = pts[Math.min(pts.length - 1, i + 3)];
    const len = Math.hypot(bx - ax, bz - az) || 1;
    const nx = (-(bz - az) / len) * side, nz = ((bx - ax) / len) * side;
    let d = off;
    while (d < off + 0.8 && onCarriageway(p[0] + nx * d, p[1] + nz * d)) d += 0.1;
    if (onCarriageway(p[0] + nx * d, p[1] + nz * d)) d = off;
    return new THREE.Vector3(p[0] + nx * d, 0, p[1] + nz * d);
  });
  // A crossing is a few points at most; a longer stretch on a carriageway is another street running
  // alongside (a dual carriageway drawn as two): the walk is cut there, and the longest piece kept.
  const on = route.map((p) => onCarriageway(p.x, p.z));
  /** @type {[number, number][]} */
  const pieces = [];
  let from = -1;
  for (let i = 0; i <= route.length; i++) {
    const end = i === route.length;
    if (!end && !on[i]) {
      if (from < 0) from = i;
      continue;
    }
    // Here a stretch on a carriageway starts (or the route ends): long enough to be a street along?
    let j = i;
    while (j < route.length && on[j]) j++;
    if (end || j - i > maxCrossing || j === route.length) {
      if (from >= 0) pieces.push([from, i]);
      from = -1;
    }
    if (end) break;
    i = j - 1;
  }
  const [a, b] = pieces.reduce((best, p) => (p[1] - p[0] > best[1] - best[0] ? p : best), [0, 0]);
  return route.slice(a, b);
}
