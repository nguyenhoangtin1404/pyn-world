// @ts-check
import { LoopPath, OpenPath } from '../../vehicles/path.js';
import { CARRIAGEWAY, SIDEWALK } from '../walkmap.js';
import { COLORS, SIDE, spans } from '../builder.js';

/**
 * The ring road: asphalt, sidewalks either side (in the walk map), edge lines broken where a street
 * crosses it, a dashed centre line (not across a zebra or a crossroads). Keeps houses and trees off.
 * Returns the ring's centre line (closed, or open where a roundabout cuts it).
 * @param {import('../builder.js').RoadBuilder} b
 * @param {{ points: [number, number][], closed: boolean }} ring
 * @param {{ zebras: [number, number][], streets: { p: [number, number], width: number }[] }} o
 */
export function layRing(b, ring, { zebras, streets }) {
  const { paint, walk, half, h } = b;
  const line = ring.closed ? new LoopPath(ring.points) : new OpenPath(ring.points);
  const L = line.length;
  for (let s = 0; s <= L; s += 1) {
    const [x, z] = line.pointAt(s), hd = line.headingAt(s);
    b.check(x + Math.cos(hd) * half, z - Math.sin(hd) * half);
    b.check(x - Math.cos(hd) * half, z + Math.sin(hd) * half);
  }
  paint.strip(line, 0, L, -half, half, h.ring, COLORS.asphalt);
  walk.strip(line, 0, L, -half, half, CARRIAGEWAY);
  walk.strip(line, 0, L, half, half + SIDE, SIDEWALK);
  walk.strip(line, 0, L, -half - SIDE, -half, SIDEWALK);
  // Edge lines broken where a street crosses (its asphalt lies over the ring's there).
  const crossed = streets.flatMap((st) => {
    const s = line.nearest(st.p[0], st.p[1]).s, w = st.width / 2 + 0.3;
    return [-L, 0, L].map((k) => [s - w + k, s + w + k]);
  });
  for (const [f, t] of spans(0, L, crossed)) {
    paint.strip(line, f, t, half - 0.35, half - 0.2, h.ringMark, COLORS.line);
    paint.strip(line, f, t, -half + 0.2, -half + 0.35, h.ringMark, COLORS.line);
  }
  const near = (/** @type {[number, number]} */ [x, z]) => [...zebras, ...streets.map((st) => st.p)].some((p) => Math.hypot(x - p[0], z - p[1]) < 7.5);
  paint.dashes(line, ring.closed ? 0 : 2, L - 2, -0.08, 0.08, h.ringMark, COLORS.centre, 2.4, 6, (s) => near(line.pointAt(s + 1.2)));
  for (let s = 0; s < L; s += 6) {
    const [x, z] = line.pointAt(s);
    b.site.obstacles.push([x, z, half + 4]); // keep houses and trees off the road
  }
  return line;
}
