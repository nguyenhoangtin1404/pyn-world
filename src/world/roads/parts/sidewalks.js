// @ts-check
import { OpenPath, arc } from '../../vehicles/path.js';
import { SIDEWALK } from '../walkmap.js';
import { COLORS, SIDE } from '../builder.js';

/**
 * Sidewalks, wherever the walk map still says sidewalk (not where another road crosses): paving a
 * kerb's height up, with a kerb face on either side. Along the ring and the streets, round the
 * roundabout and the streets' turning circles. Then people stand on them (and on the road, when
 * crossing) instead of on the grass underneath.
 * @param {import('../builder.js').RoadBuilder} b
 * @param {{ ring: import('../builder.js').Line & { length: number }, circle: import('../network.js').Circle | null,
 *   streets: { from: [number, number], to: [number, number], width: number, turn: { outer: number } }[] }} o
 */
export function paveSidewalks(b, { ring, circle, streets }) {
  const { paint, walk, half, ground } = b, top = b.h.sidewalk;
  /** @param {import('../builder.js').Line} line @param {number} len @param {number} l0 @param {number} l1 */
  const pave = (line, len, l0, l1) => {
    for (let s = 0; s < len; s += 1) {
      const e = Math.min(len, s + 1), [x, z] = line.pointAt((s + e) / 2), h = line.headingAt((s + e) / 2), m = (l0 + l1) / 2;
      if (walk.at(x + Math.cos(h) * m, z - Math.sin(h) * m) !== SIDEWALK) continue;
      paint.strip(line, s, e, l0, l1, top, COLORS.pavement);
      const [near, far] = Math.abs(l0) < Math.abs(l1) ? [l0, l1] : [l1, l0];
      paint.wall(line, s, e, near, top, ground, COLORS.kerb, -Math.sign(near));
      paint.wall(line, s, e, far, top, ground, COLORS.kerb, Math.sign(far));
    }
  };
  /** @param {[number, number]} c @param {number} r */
  const paveRound = (c, r) => {
    const n = Math.ceil((Math.PI * 2 * (r + SIDE)) / 1.2);
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * Math.PI * 2, a1 = ((i + 1) / n) * Math.PI * 2, am = (a0 + a1) / 2;
      if (walk.at(c[0] + Math.sin(am) * (r + SIDE / 2), c[1] + Math.cos(am) * (r + SIDE / 2)) !== SIDEWALK) continue;
      paint.ring(c, r, r + SIDE, a0, a1, top, COLORS.pavement);
      // Going round the way angles grow, the centre is to the left.
      const inner = new OpenPath(arc(c, r, a0, a1, 0.3)), outer = new OpenPath(arc(c, r + SIDE, a0, a1, 0.3));
      paint.wall(inner, 0, inner.length, 0, top, ground, COLORS.kerb, 1);
      paint.wall(outer, 0, outer.length, 0, top, ground, COLORS.kerb, -1);
    }
  };
  pave(ring, ring.length, half, half + SIDE);
  pave(ring, ring.length, -half - SIDE, -half);
  if (circle) paveRound(circle.c, circle.outer);
  for (const st of streets) {
    const line = new OpenPath([st.from, st.to]), W = st.width / 2;
    pave(line, line.length, W, W + SIDE);
    pave(line, line.length, -W - SIDE, -W);
    paveRound(st.from, st.turn.outer);
    paveRound(st.to, st.turn.outer);
  }
  b.site.addSurface((x, z) => {
    const k = walk.at(x, z);
    return k === SIDEWALK ? top(x, z) : k ? b.h.circle(x, z) : -Infinity;
  });
}
