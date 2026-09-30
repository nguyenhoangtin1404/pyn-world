// @ts-check
import { CrossingGate } from '../signals.js';
import { CARRIAGEWAY } from '../walkmap.js';
import { COLORS, spans } from '../builder.js';
import { turningCircle } from './circles.js';

const GATE_BACK = 7; // a level crossing's stop lines, from the middle of the track along the road

/**
 * Where a road runs over the railway: each nearest approach under 1.5 units, with the distance
 * along the track there (for the barriers to watch the train).
 * @param {import('../../track.js').Track} track
 * @param {import('../../vehicles/path.js').OpenPath} line the road's centre line
 * @returns {import('../builder.js').LevelCrossing[]}
 */
export function findLevelCrossings(track, line) {
  const crossings = [];
  let prev = Infinity, falling = true;
  for (let s = 0; s <= line.length; s += 0.25) {
    const [x, z] = line.pointAt(s);
    const d = track.distanceTo(x, z, 4);
    if (falling && d > prev && prev < 1.5) {
      const p = line.pointAt(s - 0.25);
      let at = 0, best = Infinity;
      for (const f of track.frames) {
        const e = Math.hypot(f.p.x - p[0], f.p.z - p[1]);
        if (e < best) [best, at] = [e, f.s];
      }
      crossings.push({ s: s - 0.25, p, at, gate: new CrossingGate(), posts: [] });
    }
    falling = d <= prev;
    prev = d;
  }
  return crossings;
}

/**
 * The branch: two lanes out to a turning circle, raised over the rails where it crosses them
 * (with a ballast-coloured wall under the raised edges). A country road: no sidewalk. Markings
 * stop at the rails; the centre line is solid near them.
 * @param {import('../builder.js').RoadBuilder} b
 * @param {import('../../vehicles/path.js').OpenPath} line its centre line
 * @param {import('../network.js').Branch} branch
 * @param {{ c: [number, number], outer: number }} turnaround
 */
export function layBranch(b, line, branch, turnaround) {
  const { paint, h } = b;
  const W = branch.width / 2, len = line.length;
  for (let s = 0; s <= len; s += 1) {
    const [x, z] = line.pointAt(s), hd = line.headingAt(s);
    b.check(x + Math.cos(hd) * W, z - Math.sin(hd) * W);
    b.check(x - Math.cos(hd) * W, z + Math.sin(hd) * W);
    if (s % 4 === 0) b.site.obstacles.push([x, z, W + 4]);
  }
  paint.strip(line, 0, len, -W, W, h.branch, COLORS.asphalt);
  b.walk.strip(line, 0, len, -W, W, CARRIAGEWAY);
  paint.wall(line, 0, len, W, h.branch, b.ground, COLORS.ballast);
  paint.wall(line, 0, len, -W, h.branch, b.ground, COLORS.ballast);
  // Markings stop at the rails, and where the turning circle's asphalt starts.
  const end = len - turnaround.outer + 0.2;
  const holes = b.crossings.map((x) => [x.s - 3, x.s + 3]);
  const solid = b.crossings.map((x) => [x.s - 14, x.s + 14]);
  for (const [f, t] of spans(0.8, end, holes)) {
    paint.strip(line, f, t, W - 0.35, W - 0.2, h.branchMark, COLORS.line);
    paint.strip(line, f, t, -W + 0.2, -W + 0.35, h.branchMark, COLORS.line);
    for (const [f2, t2] of spans(f, t, solid)) paint.dashes(line, f2, t2, -0.08, 0.08, h.branchMark, COLORS.centre, 2.4, 6);
    for (const [f2, t2] of solid) if (t2 > f && f2 < t) paint.strip(line, Math.max(f, f2), Math.min(t, t2), -0.08, 0.08, h.branchMark, COLORS.centre);
  }
  turningCircle(b, turnaround.c, turnaround.outer, branch.from);
}

/**
 * Level crossings: for each lane coming up to one, a stop line (held while the barriers are
 * working) and a post with flashing lamps and a half barrier on the right.
 * @param {import('../builder.js').RoadBuilder} b
 * @param {import('../network.js').Branch} branch
 */
export function levelCrossings(b, branch) {
  const { dir, right, lane } = branch;
  const W = branch.width / 2;
  for (const xing of b.crossings) {
    xing.posts = [1, -1].map((way) => {
      // way 1: going out (right-hand lane, before the rails), -1: coming back.
      /** @type {(k: number, side: number) => [number, number]} */
      const pt = (k, side) => [xing.p[0] + dir[0] * k * way + right[0] * side * way, xing.p[1] + dir[1] * k * way + right[1] * side * way];
      const h = b.stopLine(pt(-GATE_BACK, lane), lane, () => xing.gate.active);
      const [px, pz] = pt(-GATE_BACK + 0.6, W + 0.7);
      b.site.colliders.push({ x: px, z: pz, r: 0.3 });
      return b.props.crossingPost(px, b.ground(px, pz), pz, h ?? Math.atan2(dir[0] * way, dir[1] * way), W + 0.4);
    });
  }
}
