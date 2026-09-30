// @ts-check
import { OpenPath } from '../../vehicles/path.js';
import { crossroads } from '../signals.js';
import { CARRIAGEWAY, SIDEWALK } from '../walkmap.js';
import { COLORS, SIDE, spans } from '../builder.js';
import { turningCircle } from './circles.js';

/**
 * @typedef {ReturnType<import('../network.js').layoutStreet> & { p: [number, number], cycle?: object }} Street
 */

// Where along the street's centre line it crosses the ring.
const middle = (/** @type {Street} */ st) => Math.hypot(st.p[0] - st.from[0], st.p[1] - st.from[1]);

/**
 * A street across the ring: two lanes, sidewalks either side (in the walk map), a turning circle
 * with a sidewalk round it at each end. No markings across the ring; the centre line solid coming
 * up to the lights.
 * @param {import('../builder.js').RoadBuilder} b
 * @param {Street} st
 */
export function layStreet(b, st) {
  const { paint, walk, h, half } = b;
  const line = new OpenPath([st.from, st.to]);
  const W = st.width / 2, len = line.length, mid = middle(st);
  for (let s = 0; s <= len; s += 1) {
    const [x, z] = line.pointAt(s), hd = line.headingAt(s);
    b.check(x + Math.cos(hd) * W, z - Math.sin(hd) * W);
    b.check(x - Math.cos(hd) * W, z + Math.sin(hd) * W);
    if (s % 4 === 0) b.site.obstacles.push([x, z, W + 4]);
  }
  paint.strip(line, 0, len, -W, W, h.branch, COLORS.asphalt);
  walk.strip(line, 0, len, -W, W, CARRIAGEWAY);
  walk.strip(line, 0, len, W, W + SIDE, SIDEWALK);
  walk.strip(line, 0, len, -W - SIDE, -W, SIDEWALK);
  const solid = [mid - 10, mid + 10];
  for (const [f, t] of spans(st.turn.outer - 0.2, len - st.turn.outer + 0.2, [[mid - half - 0.3, mid + half + 0.3]])) {
    paint.strip(line, f, t, W - 0.35, W - 0.2, h.branchMark, COLORS.line);
    paint.strip(line, f, t, -W + 0.2, -W + 0.35, h.branchMark, COLORS.line);
    for (const [f2, t2] of spans(f, t, [solid])) paint.dashes(line, f2, t2, -0.08, 0.08, h.branchMark, COLORS.centre, 2.4, 6);
    if (solid[1] > f && solid[0] < t) paint.strip(line, Math.max(f, solid[0]), Math.min(t, solid[1]), -0.08, 0.08, h.branchMark, COLORS.centre);
  }
  turningCircle(b, st.from, st.turn.outer, st.to, true);
  turningCircle(b, st.to, st.turn.outer, st.from, true);
}

/**
 * The crossroads where a street crosses the ring: the ring and the street go in turn
 * (signals.crossroads). A crosswalk on each of the four arms, between the stop line and the middle
 * (across the ring while the ring has red, across the street while the street has red); lights at
 * the stop lines, on the right (and on the left of the one-way ring too). Returns where it is and
 * its two signals.
 * @param {import('../builder.js').RoadBuilder} b
 * @param {Street} st
 * @param {() => number} rng
 */
export function crossroadsLights(b, st, rng) {
  const { half } = b;
  const [ringSignal, streetSignal] = crossroads({ ...st.cycle, offset: rng() * 34 });
  /** @type {import('../props.js').LightHead[]} */
  const ringHeads = [], streetHeads = [];
  const r0 = b.routes[0].path, sc = r0.nearest(st.p[0], st.p[1]).s;
  for (const k of [-1, 1]) b.crosswalk(r0, sc + (k < 0 ? -5.7 : 3.2), sc + (k < 0 ? -3.2 : 5.7), half, () => ringSignal.walk());
  const streetLine = new OpenPath([st.from, st.to]), mid = middle(st);
  for (const k of [-1, 1]) b.crosswalk(streetLine, mid + (k < 0 ? -5.2 : 2.7), mid + (k < 0 ? -2.7 : 5.2), st.width / 2, () => streetSignal.walk());
  const at = r0.pointAt(sc - 6.4);
  const h = b.stopLine(at, half, (car, d) => ringSignal.stops(d, car.v));
  if (h !== null) for (const side of [1, -1]) ringHeads.push(b.trafficLight([at[0] + Math.cos(h) * (half + 0.8) * side, at[1] - Math.sin(h) * (half + 0.8) * side], h));
  const { dir, right, lane } = st, W = st.width / 2;
  for (const way of [1, -1]) {
    /** @type {(k: number, side: number) => [number, number]} */
    const pt = (k, side) => [st.p[0] + dir[0] * k * way + right[0] * side * way, st.p[1] + dir[1] * k * way + right[1] * side * way];
    const hs = b.stopLine(pt(-5.9, lane), lane, (car, d) => streetSignal.stops(d, car.v));
    streetHeads.push(b.trafficLight(pt(-5.9, W + 0.8), hs ?? Math.atan2(dir[0] * way, dir[1] * way)));
  }
  b.signals.push({ signal: ringSignal, heads: ringHeads }, { signal: streetSignal, heads: streetHeads });
  return { p: st.p, signals: [ringSignal, streetSignal] };
}
