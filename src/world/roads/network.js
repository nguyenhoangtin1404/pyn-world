// @ts-check
import { LoopPath, arc, smoothLoop } from '../vehicles/path.js';

// The shape of a road network, as (x, z) points — no drawing, no three.js: a ring road, optionally
// with a roundabout on it, and from the roundabout a two-way branch out to a turning circle. And the
// routes vehicles drive round it: closed LoopPaths, one lane each, right-hand traffic.
//
// Angles round a circle are headings (0 = +z, growing anticlockwise seen from above): a point at
// angle t on a circle of radius r round c is c + r·(sin t, cos t). Roundabouts and turning circles
// go the way angles grow, as they do where traffic keeps right.

const TAU = Math.PI * 2;
/** @param {number} a */
export const wrapAngle = (a) => ((a % TAU) + TAU) % TAU;
/**
 * @param {[number, number]} c
 * @param {[number, number]} p
 */
export const angleOf = ([cx, cz], [x, z]) => Math.atan2(x - cx, z - cz);

/**
 * @typedef {{ id: string, path: LoopPath, entries: { s: number, angle: number }[] }} Route
 * `entries`: where the route drives onto the roundabout (s at its outer edge), and at what angle.
 * @typedef {{ c: [number, number], radius: number, inner: number, outer: number, joins: number[] }} Circle
 * `radius` is the lane; `joins` the angles where roads meet its outer edge.
 * @typedef {{ from: [number, number], to: [number, number], dir: [number, number], right: [number, number],
 *   lane: number, width: number }} Branch
 * Centre line from the roundabout's edge to the middle of the turning circle; lanes `lane` either side.
 */

/**
 * @param {object} o
 * @param {[number, number][]} o.ring the ring road's centre line, closed (points ≤ 2 units apart)
 * @param {number} o.width of the ring road (one lane, one way)
 * @param {{ c: [number, number], out: [number, number], radius?: number }} [o.roundabout] centred on
 *   the ring; `out`: unit direction the branch leaves by (away from the houses). `radius`: of the lane (8)
 * @param {{ length: number, lane?: number, turn?: number }} [o.branch] from the roundabout's centre to
 *   the turning circle's; lanes `lane` (1.5) off the centre line, turning round a circle of `turn` (5)
 */
export function layoutRoads({ ring, width, roundabout, branch }) {
  if (!roundabout) {
    return { ring: { points: ring, closed: true }, circle: null, branch: null, turnaround: null, routes: [route('ring', ring, null, 0)] };
  }
  const { c, out } = roundabout;
  const R = roundabout.radius ?? 8;
  const outer = R + width / 2;
  const dist = (/** @type {[number, number]} */ p) => Math.hypot(p[0] - c[0], p[1] - c[1]);

  // The ring cut open where it runs into the roundabout: from where it comes out to where it goes in.
  /** @param {[number, number][]} pts @param {number} r */
  const cut = (pts, r) => {
    const n = pts.length;
    const inside = pts.map((p) => dist(p) < r);
    const end = inside.findIndex((v, i) => v && !inside[(i + 1) % n]);
    if (end < 0 || inside.filter(Boolean).length === 0) throw new Error('Vòng xoay phải nằm trên đường vòng');
    /** @type {[number, number][]} */
    const open = [];
    for (let i = (end + 1) % n; !inside[i]; i = (i + 1) % n) open.push(pts[i]);
    if (open.length + inside.filter(Boolean).length !== n) throw new Error('Vòng xoay cắt đường vòng ở nhiều chỗ');
    return open;
  };

  const heading = Math.atan2(out[0], out[1]);
  // Drive the ring the way that reaches the branch before the far side of the roundabout.
  let open = cut(ring, R + 1);
  const ends = (/** @type {[number, number][]} */ o) => [angleOf(c, o.at(-1) ?? o[0]), angleOf(c, o[0])]; // in, out
  let [aIn, aOut] = ends(open);
  if (wrapAngle(heading - aIn) > wrapAngle(aOut - aIn)) {
    ring = [...ring].reverse();
    open = cut(ring, R + 1);
    [aIn, aOut] = ends(open);
  }
  const drawn = cut(ring, outer - 0.5); // under the roundabout's asphalt by half a unit
  const joins = [angleOf(c, drawn.at(-1) ?? drawn[0]), angleOf(c, drawn[0])];

  const routes = [route('ring', [...open, ...arc(c, R, aIn, aOut)], c, outer)];
  let br = null, turnaround = null;
  if (branch) {
    const lane = branch.lane ?? 1.5, Rt = branch.turn ?? 5;
    /** @type {[number, number]} */
    const right = [-out[1], out[0]];
    /** @type {(p: [number, number], k: number, side: number) => [number, number]} */
    const at = (p, k, side) => [p[0] + out[0] * k + right[0] * lane * side, p[1] + out[1] * k + right[1] * lane * side];
    /** @type {[number, number]} */
    const T = [c[0] + out[0] * branch.length, c[1] + out[1] * branch.length];
    const kR = Math.sqrt(R * R - lane * lane), kT = Math.sqrt(Rt * Rt - lane * lane);
    const outStart = at(c, kR, 1), outEnd = at(T, -kT, 1);
    const inStart = at(T, -kT, -1), inEnd = at(c, kR, -1);
    routes.push(
      route('branch', [
        ...open,
        ...arc(c, R, aIn, angleOf(c, outStart)),
        ...line(outStart, outEnd),
        ...arc(T, Rt, angleOf(T, outEnd), angleOf(T, inStart)),
        ...line(inStart, inEnd),
        ...arc(c, R, angleOf(c, inEnd), aOut),
      ], c, outer),
    );
    joins.push(heading);
    br = { from: at(c, outer - 0.5, 0), to: T, dir: out, right, lane, width: lane * 2 + 3 };
    turnaround = { c: T, radius: Rt, outer: Rt + lane + 1.5 };
  }
  /** @type {Circle} */
  const circle = { c, radius: R, inner: R - width / 2, outer, joins };
  return { ring: { points: drawn, closed: false }, circle, branch: br, turnaround, routes };
}

/**
 * A route: the points smoothed into a drivable LoopPath (unless it is the plain ring, already
 * smooth), and where it enters the roundabout.
 * @param {string} id
 * @param {[number, number][]} points
 * @param {[number, number] | null} c roundabout centre
 * @param {number} outer its outer radius
 * @returns {Route}
 */
function route(id, points, c, outer) {
  const path = new LoopPath(c ? smoothLoop(points) : points);
  const entries = [];
  if (c) {
    const d = path.points.map(([x, z]) => Math.hypot(x - c[0], z - c[1]));
    const n = d.length;
    for (let i = 0; i < n; i++) {
      if (d[i] > outer && d[(i + 1) % n] <= outer) entries.push({ s: path.at[i], angle: angleOf(c, path.points[(i + 1) % n]) });
    }
  }
  return { id, path, entries };
}

/**
 * Points every unit or so from a to b, both included.
 * @param {[number, number]} a
 * @param {[number, number]} b
 * @returns {[number, number][]}
 */
function line([ax, az], [bx, bz]) {
  const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az)));
  return Array.from({ length: n + 1 }, (_, i) => /** @type {[number, number]} */ ([ax + ((bx - ax) * i) / n, az + ((bz - az) * i) / n]));
}

/**
 * A two-way street straight across the ring at c, `back` units inward and `ahead` units outward
 * (along `dir`) to a turning circle at each end. Its route goes out along the right-hand lane, round
 * the outer circle, back across the ring in the other lane, round the inner circle and out again:
 * through the crossroads both ways.
 * @param {object} o
 * @param {string} o.id
 * @param {[number, number]} o.c where it crosses the ring
 * @param {[number, number]} o.dir unit direction, outward
 * @param {number} o.back to the inner turning circle's centre
 * @param {number} o.ahead to the outer one's
 * @param {number} [o.lane] lanes this far either side of the centre line (1.5)
 * @param {number} [o.turn] radius cars turn round at (5)
 */
export function layoutStreet({ id, c, dir, back, ahead, lane = 1.5, turn = 5 }) {
  /** @type {[number, number]} */
  const right = [-dir[1], dir[0]];
  /** @type {(k: number, side: number) => [number, number]} */
  const at = (k, side) => [c[0] + dir[0] * k + right[0] * lane * side, c[1] + dir[1] * k + right[1] * lane * side];
  /** @type {[number, number]} */
  const Tin = [c[0] - dir[0] * back, c[1] - dir[1] * back];
  /** @type {[number, number]} */
  const Tout = [c[0] + dir[0] * ahead, c[1] + dir[1] * ahead];
  const k = Math.sqrt(turn * turn - lane * lane);
  const outStart = at(-back + k, 1), outEnd = at(ahead - k, 1);
  const inStart = at(ahead - k, -1), inEnd = at(-back + k, -1);
  const path = new LoopPath(smoothLoop([
    ...line(outStart, outEnd),
    ...arc(Tout, turn, angleOf(Tout, outEnd), angleOf(Tout, inStart)),
    ...line(inStart, inEnd),
    ...arc(Tin, turn, angleOf(Tin, inEnd), angleOf(Tin, outStart)),
  ]));
  const outer = turn + lane + 1.5;
  return { route: { id, path, entries: [] }, from: Tin, to: Tout, dir, right, lane, width: lane * 2 + 3, turn: { radius: turn, outer } };
}
