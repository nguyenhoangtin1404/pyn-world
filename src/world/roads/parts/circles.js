// @ts-check
import { LoopPath } from '../../vehicles/path.js';
import { angleOf, wrapAngle } from '../network.js';
import { CARRIAGEWAY, SIDEWALK } from '../walkmap.js';
import { COLORS, SIDE } from '../builder.js';

// Round pieces shared by the others: the line round a circle of asphalt, the grass island in the
// middle of one, and a whole turning circle at the end of a road.

/**
 * The line round the outside of a circle of asphalt, broken where roads join it.
 * @param {import('../paint.js').Paint} paint
 * @param {[number, number]} c @param {number} outer @param {number[]} joins angles
 * @param {import('../builder.js').HeightFn} heightAt
 */
export function edgeWithGaps(paint, c, outer, joins, heightAt) {
  const gap = 3.8 / outer;
  const js = [...joins].map(wrapAngle).sort((a, b) => a - b);
  js.forEach((j, i) => {
    const next = js[(i + 1) % js.length] + (i + 1 === js.length ? Math.PI * 2 : 0);
    if (next - j > 2 * gap) paint.ring(c, outer - 0.35, outer - 0.2, j + gap, next - gap, heightAt, COLORS.line);
  });
}

/**
 * Grass in the middle of a circle, a red and white kerb round it, a little tree.
 * @param {import('../builder.js').RoadBuilder} b
 * @param {[number, number]} c @param {number} r
 */
export function island(b, c, r) {
  const { paint, props } = b, top = b.h.island;
  paint.ring(c, 0, r - 0.35, 0, 0, top, COLORS.grass);
  paint.ring(c, r - 0.35, r, 0, 0, top, (i) => (i % 2 ? COLORS.curb : COLORS.red));
  const edge = new LoopPath(Array.from({ length: 48 }, (_, i) => {
    const t = (i / 48) * Math.PI * 2;
    return /** @type {[number, number]} */ ([c[0] + Math.sin(t) * r, c[1] + Math.cos(t) * r]);
  }));
  paint.wall(edge, 0, edge.length, 0, top, b.h.circle, COLORS.curb, -1); // going round anticlockwise, outside is to the right
  props.tree(c[0], top(c[0], c[1]), c[1]);
}

/**
 * A turning circle at the end of a road that comes from the direction of `from`: asphalt, an edge
 * line open towards the road, an island; with `pavement`, a sidewalk round it (see sidewalks.js).
 * @param {import('../builder.js').RoadBuilder} b
 * @param {[number, number]} T @param {number} outer @param {[number, number]} from @param {boolean} [pavement]
 */
export function turningCircle(b, T, outer, from, pavement = false) {
  for (let t = 0; t < Math.PI * 2; t += 0.1) b.check(T[0] + Math.sin(t) * outer, T[1] + Math.cos(t) * outer);
  b.walk.ring(T, 0, outer, CARRIAGEWAY);
  if (pavement) b.walk.ring(T, outer, outer + SIDE, SIDEWALK);
  b.paint.ring(T, 0, outer, 0, 0, b.h.circle, COLORS.asphalt);
  edgeWithGaps(b.paint, T, outer, [angleOf(T, from)], b.h.circleMark);
  island(b, T, 2.4);
  b.site.obstacles.push([T[0], T[1], outer + 3]);
}
