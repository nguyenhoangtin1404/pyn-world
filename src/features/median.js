// @ts-check
import { ball, box, cone, cyl } from '../world/lowpoly.js';
import { lamps } from '../services/lamps.js';

// The median of a boulevard (a road with `median` in cfg.roads, world/streetnet.js): a kerbed strip of
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
 * A street lamp at (x, y, z): a pole, an arm each way (`sides`, ±1 across the road) with a lit head;
 * its bulbs glow after dark (lamps(world)), the road under it lit by a pool.
 * @param {import('../World.js').World} world
 * @param {{ x: number, y: number, z: number, ry: number, arm: number, height: number, sides: number[], across: [number, number], lane: number, ground: (x: number, z: number) => number }} o
 */
function lamp(world, { x, y, z, ry, arm, height, sides, across: [px, pz], lane, ground }) {
  const { batch } = world;
  const { lampMat, halos, pools } = lamps(world);
  const bulbY = height - 0.05;
  const lo = Math.min(0, ...sides), hi = Math.max(0, ...sides);
  batch.at(x, y, z, ry).add([
    cyl(0.05, 0.08, height, '#4b4f55', [0, height / 2, 0], {}, 10),
    box((hi - lo) * arm, 0.07, 0.07, '#4b4f55', [((hi + lo) * arm) / 2, height, 0]),
    ...sides.map((sg) => box(0.34, 0.09, 0.22, '#3c4046', [sg * arm, height - 0.02, 0])),
  ]);
  batch.at(x, y, z, ry).add(sides.map((sg) => box(0.28, 0.05, 0.16, '#fff4d6', [sg * arm, bulbY - 0.06, 0])), lampMat);
  for (const sg of sides) {
    const bx = x + px * sg * arm, bz = z + pz * sg * arm;
    halos.push([bx, y + bulbY - 0.1, bz]);
    pools.push([bx, ground(bx, bz), bz, lane * 1.7]);
  }
}

/**
 * A roundabout (a `ring` of cfg.roads, world/streetnet.js): two lanes round a kerbed island, with a dashed
 * line between the lanes and a pavement outside; the island planted with a tree, a ring of bushes (a few
 * in flower) and three lamps over the road.
 * @param {import('../World.js').World} world
 * @param {object} o
 * @param {import('../world/roads/paint.js').Paint} o.paint
 * @param {import('../world/streetnet.js').Ring} o.ring
 * @param {number} o.lane @param {number} o.pavement
 * @param {(lift: number) => (x: number, z: number) => number} o.surface
 * @param {number} o.lift the road's lift
 * @param {string} o.color the asphalt
 * @param {() => number} o.rng
 */
export function buildRoundabout(world, { paint, ring, lane, pavement, surface, lift, color, rng }) {
  const { batch } = world;
  const c = /** @type {[number, number]} */ ([ring.x, ring.z]);
  const { R, ri } = ring;
  paint.ring(c, ri - 0.2, R, 0, 0, surface(lift), color);
  paint.ring(c, R, R + pavement, 0, 0, surface(0.04), '#c4bfb4');
  // The line between the two lanes, in dashes.
  const rm = (ri + R) / 2, dashes = Math.max(8, Math.round((Math.PI * 2 * rm) / 2.4));
  for (let i = 0; i < dashes; i++) paint.ring(c, rm - 0.07, rm + 0.07, ((i + 0.1) / dashes) * Math.PI * 2, ((i + 0.55) / dashes) * Math.PI * 2, surface(lift + 0.015), '#ecebe4');
  // The island.
  const grass = surface(lift + 0.12);
  paint.ring(c, 0, ri, 0, 0, surface(lift + 0.09), KERB);
  paint.ring(c, 0, ri - KERB_W, 0, 0, grass, GRASS);
  const y = grass(...c);
  const trunk = Math.max(1.2, ri * 0.7), crown = Math.max(0.9, ri * 0.4);
  batch.at(c[0], y, c[1], 0).add([
    cyl(0.05, 0.08, trunk, '#6b4a2f', [0, trunk / 2, 0], {}, 6),
    ball(crown, BUSH[Math.floor(rng() * BUSH.length)], [0, trunk + crown * 0.6, 0], { sy: 1.15 }, 1),
    cone(crown * 0.7, crown * 1.2, BUSH[Math.floor(rng() * BUSH.length)], [0, trunk + crown * 1.6, 0], {}, 6),
  ]);
  const n = Math.max(6, Math.round((Math.PI * 2 * ri * 0.72) / 1.1));
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + rng() * 0.2, d = ri * (0.62 + rng() * 0.12), r = Math.min(0.5, ri * 0.14) * (0.8 + rng() * 0.4);
    const bx = c[0] + Math.cos(a) * d, bz = c[1] + Math.sin(a) * d;
    const parts = [ball(r, BUSH[Math.floor(rng() * BUSH.length)], [0, r * 0.55, 0], { sy: 0.7 }, 0)];
    if (rng() < 0.3) parts.push(ball(r * 0.35, FLOWER[Math.floor(rng() * FLOWER.length)], [r * 0.2, r * 0.95, 0], {}, 0));
    batch.at(bx, grass(bx, bz), bz, rng() * 6).add(parts);
  }
  // Three lamps on the island's rim, an arm out over the road.
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + 0.5, lx = c[0] + Math.cos(a) * (ri - 0.35), lz = c[1] + Math.sin(a) * (ri - 0.35);
    // (local +x of a lamp is across the road: out from the island)
    lamp(world, { x: lx, y: grass(lx, lz), z: lz, ry: -a, arm: lane * 0.9, height: Math.max(2.2, lane * 1.7), sides: [1], across: [Math.cos(a), Math.sin(a)], lane, ground: surface(lift) });
  }
}

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
      if (s - from >= 2) runs.push([from, s]);
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
        lamp(world, { x, y, z, ry: h, arm: half + lane * 0.9, height: median * 1.9, sides: [-1, 1], across: [px, pz], lane, ground: surface(lift) });
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
