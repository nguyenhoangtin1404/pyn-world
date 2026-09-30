// @ts-check
import { angleOf, wrapAngle } from '../network.js';
import { CARRIAGEWAY, SIDEWALK } from '../walkmap.js';
import { COLORS, SIDE } from '../builder.js';
import { edgeWithGaps, island } from './circles.js';

/**
 * A roundabout: a ring of asphalt round an island with a red and white kerb and a tree, a sidewalk
 * round the outside (in the walk map).
 * @param {import('../builder.js').RoadBuilder} b
 * @param {import('../network.js').Circle} circle
 */
export function layRoundabout(b, circle) {
  const { paint, walk, h } = b;
  const { c, inner, outer } = circle;
  for (let t = 0; t < Math.PI * 2; t += 0.1) b.check(c[0] + Math.sin(t) * outer, c[1] + Math.cos(t) * outer);
  paint.ring(c, inner, outer, 0, 0, h.circle, COLORS.asphalt);
  walk.ring(c, 0, outer, CARRIAGEWAY); // the island too: nobody goes there
  walk.ring(c, outer, outer + SIDE, SIDEWALK);
  paint.ring(c, inner + 0.2, inner + 0.35, 0, 0, h.circleMark, COLORS.line);
  edgeWithGaps(paint, c, outer, circle.joins, h.circleMark);
  island(b, c, inner);
  b.site.obstacles.push([c[0], c[1], outer + 3]);
}

/**
 * Give way at the roundabout: at every way onto it (from any route) a dashed line, and a stop point
 * that holds while anyone on the roundabout is coming round towards it (about two seconds away).
 * @param {import('../builder.js').RoadBuilder} b
 * @param {import('../network.js').Circle} circle
 * @param {import('../network.js').Route[]} routes the network's routes, with their entries
 * @param {number} lane half-width of a branch lane (a way on from the branch)
 */
export function giveWay(b, circle, routes, lane) {
  const { c, radius } = circle;
  /** @type {[number, number][]} */
  const yields = [];
  for (const r of routes) {
    for (const e of r.entries) {
      const p = r.path.pointAt(e.s);
      if (yields.some((y) => Math.hypot(y[0] - p[0], y[1] - p[1]) < 1.5)) continue;
      yields.push(p);
      const ring = circle.joins.slice(0, 2).some((j) => Math.abs(Math.atan2(Math.sin(j - e.angle), Math.cos(j - e.angle))) < 0.35);
      const hl = ring ? b.half : lane;
      b.stopLine(p, hl, (car, d, cars) => cars.some((o) => {
        if (o === car) return false;
        const q = o.path.pointAt(o.s);
        if (Math.abs(Math.hypot(q[0] - c[0], q[1] - c[1]) - radius) > 1.8) return false;
        return wrapAngle(e.angle - angleOf(c, q)) < 2.2; // about two seconds away
      }), (path, s) => {
        for (let off = -hl + 0.15; off < hl - 0.3; off += 0.9) b.paint.strip(path, s - 0.8, s - 0.35, off, off + 0.5, b.lift(0.14), COLORS.line);
      });
    }
  }
}
