// @ts-check
// Vehicles sharing one road (a loop, all going the same way): each keeps its distance from the one
// ahead and stops for people on the road in front of it. Pure logic over what vehicles expose —
// { s, v, length, limit, path heading at s } — so it can be tested without drawing anything.

/**
 * @typedef {{ s: number, v: number, length: number, limit: number, cruise: number,
 *   path: { length: number, pointAt(s: number): [number, number], headingAt(s: number): number } }} Car
 * @typedef {{ x: number, z: number }} Walker
 */

const MIN_GAP = 2.5; // bumper to bumper, stopped
const HEADWAY = 1.2; // seconds of travel kept free ahead, moving

/**
 * Fastest safe speed with `gap` units of free road ahead: stop at MIN_GAP, then about one
 * HEADWAY-second of travel per unit of extra room.
 * @param {number} gap
 */
export function gapSpeed(gap) {
  return Math.max(0, (gap - MIN_GAP) / HEADWAY);
}

/**
 * Set each car's `limit` for this frame.
 * @param {Car[]} cars all on the same path
 * @param {Walker[]} people positions of everyone walking about
 * @param {number} halfWidth half the road's width
 */
export function updateTraffic(cars, people, halfWidth) {
  if (!cars.length) return;
  const L = cars[0].path.length;
  const order = [...cars].sort((a, b) => a.s - b.s);
  order.forEach((car, i) => {
    let limit = Infinity;
    if (order.length > 1) {
      const ahead = order[(i + 1) % order.length];
      const gap = ((ahead.s - car.s + L) % L) - (ahead.length + car.length) / 2;
      limit = gapSpeed(gap);
    }
    // Someone on the road in front: slow down to stop short of them.
    const [x, z] = car.path.pointAt(car.s);
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
    car.limit = limit;
  });
}
