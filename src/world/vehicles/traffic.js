// @ts-check
// Vehicles sharing a road network: each keeps its distance from whatever is ahead of it in its lane
// — on its own route or another one sharing the road there — stops for people on the road in front
// of it, and at its route's stop points (a red light, a closed level crossing, a roundabout to give
// way to). Pure logic over what vehicles expose, so it can be tested without drawing anything.

/**
 * @typedef {{ length: number, pointAt(s: number): [number, number], headingAt(s: number): number,
 *   wrap(s: number): number, pointInto?(s: number, out: number[]): unknown }} Path
 * @typedef {{ s: number, blocked(car: Car, d: number, cars: Car[]): boolean }} StopPoint
 * A place on a route to stop at when `blocked` says so: `d` is from the car's front to it.
 * @typedef {{ s: number, v: number, length: number, limit: number, cruise: number, path: Path,
 *   stops?: StopPoint[] }} Car
 * @typedef {{ x: number, z: number }} Walker
 */

const MIN_GAP = 2.5; // bumper to bumper, stopped
const HEADWAY = 1.2; // seconds of travel kept free ahead, moving
const LOOK = 30; // how far ahead anything matters: gapSpeed(LOOK) is faster than any car
const LANE = 2; // any part of another car this close to our path is in the way (lanes are 3 apart)

/**
 * Fastest safe speed with `gap` units of free road ahead: stop at MIN_GAP, then about one
 * HEADWAY-second of travel per unit of extra room.
 * @param {number} gap
 */
export function gapSpeed(gap) {
  return Math.max(0, (gap - MIN_GAP) / HEADWAY);
}

// Scratch kept between frames (grown as needed): where each car is and which way it heads, the
// points ahead of it on its path (made once a frame per car, the first time another route's car is
// near enough to matter — not once per pair) with their bounding box, and the gaps, n × n.
let cap = 0;
let X = new Float64Array(0), Z = new Float64Array(0), H = new Float64Array(0), SIN = new Float64Array(0), COS = new Float64Array(0);
let probed = new Int32Array(0), probes = new Int32Array(0), box = new Float64Array(0);
let PX = new Float64Array(0), PZ = new Float64Array(0), GAP = new Float64Array(0);
const MAX_PROBES = Math.floor(LOOK / 0.5) + 2; // d from half a car (≥ 0) to LOOK, every 0.5
const P = [0, 0];
const MARGIN = 1e-3; // (rounding, many times over: the box test only skips what could never be in the way)

/** @param {number} n */
function room(n) {
  if (n <= cap && GAP.length >= n * n) return;
  cap = Math.max(n, cap * 2, 16);
  X = new Float64Array(cap);
  Z = new Float64Array(cap);
  H = new Float64Array(cap);
  SIN = new Float64Array(cap);
  COS = new Float64Array(cap);
  probed = new Int32Array(cap);
  probes = new Int32Array(cap);
  box = new Float64Array(cap * 4);
  PX = new Float64Array(cap * MAX_PROBES);
  PZ = new Float64Array(cap * MAX_PROBES);
  GAP = new Float64Array(cap * cap);
}

/**
 * A point on `path` at s, into P.
 * @param {Path} path @param {number} s
 */
function pointOn(path, s) {
  if (path.pointInto) path.pointInto(s, P);
  else {
    const q = path.pointAt(s);
    P[0] = q[0];
    P[1] = q[1];
  }
}

/**
 * The points on car i's path ahead of it, every 0.5 from its front to LOOK from its middle (as
 * gapTo walks them), and their bounding box.
 * @param {Car} car @param {number} i
 */
function probe(car, i) {
  probed[i] = 1;
  let n = 0, x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  const o = i * MAX_PROBES;
  for (let d = car.length / 2; d <= LOOK; d += 0.5) {
    pointOn(car.path, car.s + d);
    const px = P[0], pz = P[1];
    PX[o + n] = px;
    PZ[o + n] = pz;
    n++;
    if (px < x0) x0 = px;
    if (px > x1) x1 = px;
    if (pz < z0) z0 = pz;
    if (pz > z1) z1 = pz;
  }
  probes[i] = n;
  box[i * 4] = x0;
  box[i * 4 + 1] = x1;
  box[i * 4 + 2] = z0;
  box[i * 4 + 3] = z1;
}

/**
 * Free road between car i and car j, if j is in the lane ahead within LOOK; Infinity if not.
 * On the same path: the difference in s, less half of each. On another route (routes share the road
 * for part of the way): how far along our path it is to where we would run into any part of it —
 * a long truck on a roundabout can have its back still across the way out of it.
 * @param {Car[]} cars @param {number} i @param {number} j
 */
function gapTo(cars, i, j) {
  const car = cars[i], other = cars[j];
  if (other.path === car.path) {
    const d = car.path.wrap(other.s - car.s);
    return d < LOOK ? d - (car.length + other.length) / 2 : Infinity;
  }
  const x = X[i], z = Z[i], ox = X[j], oz = Z[j];
  const reach = LOOK + other.length / 2;
  if (Math.abs(ox - x) > reach || Math.abs(oz - z) > reach) return Infinity;
  // Behind us, or coming the other way in the other lane (nearly head on, and off to the side): not
  // in our way. (Not every car heading more than a right angle away: one turning across our path,
  // or making a U-turn in a crossroads right in front of us, is.)
  const h = H[i], ho = H[j];
  if ((ox - x) * SIN[i] + (oz - z) * COS[i] < -other.length / 2 - LANE) return Infinity;
  if (Math.cos(h - ho) < -0.7 && Math.abs((ox - x) * COS[i] - (oz - z) * SIN[i]) > LANE / 2) return Infinity;
  const fx = SIN[j], fz = COS[j], half = other.length / 2;
  if (!probed[i]) probe(car, i);
  // Every part of the other is within `half` of its middle, so nothing ahead of us comes within LANE
  // of it when its middle is that much farther than LANE + half from all our points.
  const b = i * 4, far = LANE + half + MARGIN;
  if (ox - box[b + 1] > far || box[b] - ox > far || oz - box[b + 3] > far || box[b + 2] - oz > far) return Infinity;
  const o = i * MAX_PROBES, n = probes[i];
  let d = car.length / 2;
  for (let k = 0; k < n; k++, d += 0.5) {
    const px = PX[o + k], pz = PZ[o + k];
    // Distance from that point on our path to the other's centre line, bumper to bumper.
    const along = Math.max(-half, Math.min(half, (px - ox) * fx + (pz - oz) * fz));
    if (Math.hypot(px - ox - fx * along, pz - oz - fz * along) < LANE) return d - car.length / 2;
  }
  return Infinity;
}

/**
 * Set each car's `limit` for this frame.
 * @param {Car[]} cars
 * @param {Walker[]} people positions of everyone walking about
 * @param {number} halfWidth half the road's width
 */
export function updateTraffic(cars, people, halfWidth) {
  const n = cars.length;
  room(n);
  for (let i = 0; i < n; i++) {
    const c = cars[i];
    pointOn(c.path, c.s);
    X[i] = P[0];
    Z[i] = P[1];
    const h = (H[i] = c.path.headingAt(c.s));
    SIN[i] = Math.sin(h);
    COS[i] = Math.cos(h);
    probed[i] = 0;
  }
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) GAP[i * n + j] = i === j ? Infinity : gapTo(cars, i, j);
  for (let i = 0; i < n; i++) {
    const car = cars[i];
    let limit = Infinity;
    for (let j = 0; j < n; j++) {
      const g = GAP[i * n + j];
      if (g === Infinity) continue;
      // Two cars that each see the other ahead (side by side where routes merge): the first one goes.
      if (GAP[j * n + i] !== Infinity && cars[j].path !== car.path && i < j) continue;
      limit = Math.min(limit, gapSpeed(g));
    }
    // Someone on the road in front: slow down to stop short of them.
    const x = X[i], z = Z[i];
    const fx = SIN[i], fz = COS[i];
    const look = car.length / 2 + MIN_GAP + car.v * HEADWAY * 2;
    for (const p of people) {
      const dx = p.x - x, dz = p.z - z;
      const along = dx * fx + dz * fz;
      if (along < 0 || along > look) continue;
      const across = Math.abs(dx * fz - dz * fx);
      if (across > halfWidth + 0.6) continue;
      limit = Math.min(limit, gapSpeed(along - car.length / 2));
    }
    // Stop lines: the front stops half a unit short of one that says stop.
    for (const stop of car.stops ?? []) {
      const d = car.path.wrap(stop.s - car.s) - car.length / 2;
      if (d < 0 || d > LOOK || !stop.blocked(car, d, cars)) continue;
      limit = Math.min(limit, gapSpeed(d - 0.5 + MIN_GAP));
    }
    car.limit = limit;
  }
}
