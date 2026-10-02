// @ts-check
import { LoopPath } from './path.js';

// Turning at a crossing: a vehicle on one street's lane leaves it for another street's lane by a short
// curved connector (a quadratic Bezier through the corner where the two lanes cross), then carries on
// along that street. Pure maths in the model's units, like the paths themselves.

/**
 * A right turn from lane `a` (at `sa`, a distance along it near the crossing) into lane `b` (at `sb`,
 * near the crossing too, heading a quarter turn to the right of `a`'s). The connector starts `reach`
 * before the corner on `a` and ends `reach` after it on `b`.
 * @param {LoopPath} a @param {number} sa @param {LoopPath} b @param {number} sb @param {number} reach
 * @returns {{ s0: number, connector: LoopPath, length: number, s1: number } | null}
 *   s0: where on `a` the turn begins; connector: the path of the turn, a closed LoopPath of which the
 *   first `length` is the way (the vehicle is handed on to `b` at `s1` when it has driven that far)
 */
export function rightTurn(a, sa, b, sb, reach) {
  const [ax, az] = a.pointAt(sa), [bx, bz] = b.pointAt(sb);
  const ha = a.headingAt(sa), hb = b.headingAt(sb);
  // `b` must leave to the right of `a`'s way (heading − 90°), within 30°.
  const quarter = Math.atan2(Math.sin(hb - ha + Math.PI / 2), Math.cos(hb - ha + Math.PI / 2));
  if (Math.abs(quarter) > 0.5) return null;
  const dax = Math.sin(ha), daz = Math.cos(ha), dbx = Math.sin(hb), dbz = Math.cos(hb);
  // Where the two lanes' lines cross: a + da·u = b + db·v.
  const det = -dax * dbz + dbx * daz;
  if (Math.abs(det) < 0.3) return null;
  const px = bx - ax, pz = bz - az;
  const u = (px * -dbz + dbx * pz) / det, v = (dax * pz - daz * px) / det;
  if (Math.abs(u) > 12 || Math.abs(v) > 12) return null; // not at this crossing
  const cx = ax + dax * u, cz = az + daz * u;
  const r = Math.max(reach, 0.5 * (Math.abs(u) + Math.abs(v)));
  /** @type {[number, number]} */
  const p0 = [cx - dax * r, cz - daz * r], p1 = [cx + dbx * r, cz + dbz * r];
  /** @type {[number, number][]} */
  const pts = [];
  const n = 10;
  for (let i = 0; i <= n; i++) {
    const t = i / n, w = 1 - t;
    pts.push([w * w * p0[0] + 2 * w * t * cx + t * t * p1[0], w * w * p0[1] + 2 * w * t * cz + t * t * p1[1]]);
  }
  let length = 0;
  for (let i = 1; i < pts.length; i++) length += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  // (A LoopPath is closed: out along the turn, and back the same way, which is never driven.)
  const connector = new LoopPath([...pts, ...pts.slice(1, -1).reverse()]);
  return { s0: sa + u - r, connector, length, s1: sb + v + r };
}

/**
 * Did a vehicle driving from `before` to `now` on a closed path of `total` pass `at`?
 * @param {number} before @param {number} now @param {number} at @param {number} total
 */
export function passed(before, now, at, total) {
  const wrap = (/** @type {number} */ s) => ((s % total) + total) % total;
  const moved = wrap(now - before);
  return moved < total / 2 && wrap(at - before) <= moved && wrap(at - before) > 0;
}
