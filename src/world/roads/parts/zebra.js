// @ts-check
import { SignalCycle } from '../signals.js';

/**
 * A zebra crossing on the ring at p, with traffic lights: cars stop at a line before it on red
 * (and on yellow if they can), people cross while the cars have red. Lights both sides of the
 * one-way ring.
 * @param {import('../builder.js').RoadBuilder} b
 * @param {[number, number]} p
 * @param {() => number} rng
 */
export function zebra(b, p, rng) {
  const { half } = b;
  const r0 = b.routes[0].path, sz = r0.nearest(p[0], p[1]).s;
  const signal = new SignalCycle({ offset: rng() * 26 });
  b.crosswalk(r0, sz - 1.5, sz + 1.5, half, () => signal.walk());
  const at = r0.pointAt(sz - 3.2);
  const h = b.stopLine(at, half, (car, d) => signal.stops(d, car.v));
  if (h === null) return;
  const lx = Math.cos(h), lz = -Math.sin(h), k = half + 0.8;
  const heads = [1, -1].map((side) => b.trafficLight([at[0] + lx * k * side, at[1] + lz * k * side], h));
  b.signals.push({ signal, heads });
}
