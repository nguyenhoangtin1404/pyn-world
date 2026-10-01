// @ts-check
import { ball, box, cone, cyl } from '../world/lowpoly.js';
import { lamps } from './lamps.js';

// The median of a boulevard (a road with `median` in cfg.roads, world/divided.js): a kerbed strip of
// grass between the two carriageways, planted with bushes (a few in flower), a small tree every so
// often and a street lamp with an arm over each carriageway, lit after dark (lamps(world): bulbs, a
// halo, a pool of light on the road). It is broken where another street crosses (the same `blocked`
// as the centre dashes' — room for the zebra crossing and the stop line). Static parts in the
// world's batch; the bulbs share the lamps' material.

const KERB = '#cfcabc';
const GRASS = '#6f9a4d';
const BUSH = ['#4d8a3c', '#5b9a45', '#3f7a36', '#6aa84f'];
const FLOWER = ['#e8c14a', '#d9577a', '#f2f0e8'];
const STEP = 2.4; // units between plantings
const KERB_W = 0.14;

/**
 * @param {import('../World.js').World} world
 * @param {object} o
 * @param {import('../world/roads/paint.js').Paint} o.paint
 * @param {{ length: number, pointAt(s: number): [number, number], headingAt(s: number): number }} o.line the road's middle
 * @param {number} o.median width of the median, units
 * @param {number} o.lane width of one lane, units
 * @param {(lift: number) => (x: number, z: number) => number} o.surface the road's height, lifted
 * @param {number} o.lift the road's own lift
 * @param {(s: number) => boolean} o.blocked another street's carriageway (and its crossing) here
 * @param {() => number} o.rng
 */
export function plantMedian(world, { paint, line, median, lane, surface, lift, blocked, rng }) {
  const { batch } = world;
  const { lampMat, halos, pools } = lamps(world);
  const raised = surface(lift + 0.09), grassY = surface(lift + 0.12);
  const half = median / 2;
  // Where it runs: not within a unit of the ends (the round caps), not where another street crosses.
  /** @type {[number, number][]} */
  const runs = [];
  let from = -1;
  for (let s = 1; s <= line.length - 1; s += 0.6) {
    const free = !blocked(s);
    if (free && from < 0) from = s;
    if ((!free || s + 0.6 > line.length - 1) && from >= 0) {
      if (s - from >= 3) runs.push([from, s]);
      from = -1;
    }
  }
  for (const [a, b] of runs) {
    paint.strip(line, a, b, -half, half, raised, KERB);
    paint.strip(line, a, b, -half + KERB_W, half - KERB_W, grassY, GRASS);
    let k = 0;
    for (let s = a + 0.8; s < b - 0.8; s += STEP, k++) {
      const [x, z] = line.pointAt(s), h = line.headingAt(s);
      const px = Math.cos(h), pz = -Math.sin(h); // across the road
      const y = grassY(x, z);
      const side = (/** @type {number} */ u) => [x + px * u, z + pz * u];
      if (k % 5 === 2) {
        // A lamp, an arm over each carriageway.
        const height = median * 1.9, arm = half + lane * 0.9, bulbY = height - 0.05;
        batch.at(x, y, z, h).add([
          cyl(0.05, 0.08, height, '#4b4f55', [0, height / 2, 0]),
          box(arm * 2, 0.07, 0.07, '#4b4f55', [0, height, 0]),
          box(0.34, 0.09, 0.22, '#3c4046', [-arm, height - 0.02, 0]),
          box(0.34, 0.09, 0.22, '#3c4046', [arm, height - 0.02, 0]),
        ]);
        batch.at(x, y, z, h).add([box(0.28, 0.05, 0.16, '#fff4d6', [-arm, bulbY - 0.06, 0]), box(0.28, 0.05, 0.16, '#fff4d6', [arm, bulbY - 0.06, 0])], lampMat);
        for (const sgn of [-1, 1]) {
          const [bx, bz] = side(sgn * arm);
          halos.push([bx, y + bulbY - 0.1, bz]);
          pools.push([bx, surface(lift)(bx, bz), bz, lane * 1.7]);
        }
      } else if (k % 3 === 0) {
        // A small tree in the middle.
        const trunk = median * 0.9, r = median * 0.46;
        batch.at(x, y, z, 0).add([
          cyl(0.04, 0.06, trunk, '#6b4a2f', [0, trunk / 2, 0], {}, 6),
          ball(r, BUSH[Math.floor(rng() * BUSH.length)], [0, trunk + r * 0.6, 0], { sy: 1.15 }, 1),
          cone(r * 0.7, r * 1.2, BUSH[Math.floor(rng() * BUSH.length)], [0, trunk + r * 1.6, 0], {}, 6),
        ]);
      } else {
        // Bushes, to either side in turn, a few in flower.
        const u = (k % 2 ? 1 : -1) * rng() * (half - KERB_W - 0.3);
        const [bx, bz] = side(u), r = median * (0.2 + rng() * 0.12);
        const parts = [ball(r, BUSH[Math.floor(rng() * BUSH.length)], [0, r * 0.55, 0], { sy: 0.7 }, 0)];
        if (rng() < 0.25) parts.push(ball(r * 0.35, FLOWER[Math.floor(rng() * FLOWER.length)], [r * 0.2, r * 0.95, 0], {}, 0));
        batch.at(bx, grassY(bx, bz), bz, rng() * 6).add(parts);
      }
    }
  }
}
