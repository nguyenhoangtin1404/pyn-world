// @ts-check
// Vehicles sharing a road network: each keeps its distance from whatever is ahead of it in its lane
// — on its own route or another one sharing the road there — stops for people on the road in front
// of it, and at its route's stop points (a red light, a closed level crossing, a roundabout to give
// way to). Pure logic over what vehicles expose, so it can be tested without drawing anything.

/**
 * @typedef {{ length: number, pointAt(s: number): [number, number], headingAt(s: number): number,
 *   wrap(s: number): number }} Path
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

/**
 * Free road between `car` and `other`, if `other` is in the lane ahead within LOOK; Infinity if not.
 * On the same path: the difference in s, less half of each. On another route (routes share the road
 * for part of the way): how far along our path it is to where we would run into any part of it —
 * a long truck on a roundabout can have its back still across the way out of it.
 * @param {Car} car
 * @param {[number, number]} p where car is
 * @param {Car} other
 * @param {[number, number]} q where other is
 */
function gapTo(car, [x, z], other, [ox, oz]) {
  if (other.path === car.path) {
    const d = car.path.wrap(other.s - car.s);
    return d < LOOK ? d - (car.length + other.length) / 2 : Infinity;
  }
  const reach = LOOK + other.length / 2;
  if (Math.abs(ox - x) > reach || Math.abs(oz - z) > reach) return Infinity;
  // Behind us, or coming the other way in the other lane (nearly head on, and off to the side): not
  // in our way. (Not every car heading more than a right angle away: one turning across our path,
  // or making a U-turn in a crossroads right in front of us, is.)
  const h = car.path.headingAt(car.s), ho = other.path.headingAt(other.s);
  if ((ox - x) * Math.sin(h) + (oz - z) * Math.cos(h) < -other.length / 2 - LANE) return Infinity;
  if (Math.cos(h - ho) < -0.7 && Math.abs((ox - x) * Math.cos(h) - (oz - z) * Math.sin(h)) > LANE / 2) return Infinity;
  const fx = Math.sin(ho), fz = Math.cos(ho), half = other.length / 2;
  for (let d = car.length / 2; d <= LOOK; d += 0.5) {
    const [px, pz] = car.path.pointAt(car.s + d);
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
  const pos = cars.map((c) => c.path.pointAt(c.s));
  const gap = cars.map((c, i) => cars.map((o, j) => (i === j ? Infinity : gapTo(c, pos[i], o, pos[j]))));
  cars.forEach((car, i) => {
    let limit = Infinity;
    for (let j = 0; j < n; j++) {
      const g = gap[i][j];
      if (g === Infinity) continue;
      // Two cars that each see the other ahead (side by side where routes merge): the first one goes.
      if (gap[j][i] !== Infinity && cars[j].path !== car.path && i < j) continue;
      limit = Math.min(limit, gapSpeed(g));
    }
    // Someone on the road in front: slow down to stop short of them.
    const [x, z] = pos[i];
    const h = car.path.headingAt(car.s);
    const fx = Math.sin(h), fz = Math.cos(h);
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
  });
}
