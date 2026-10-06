// @ts-check
// A closed path through (x, z) points, walked by distance: pointAt(s) for any s (it wraps round),
// the direction there, and how sharply it turns. Pure maths, no three.js: roads and flight circuits
// are both LoopPaths. The points are joined by straight lines, so give them densely (every few
// units) for a smooth path — roundedRect() and ellipse() below do.

const HA = [0, 0], HB = [0, 0]; // (scratch for headingAt)

export class LoopPath {
  /** @param {[number, number][]} points at least 3, not repeating the first at the end */
  constructor(points) {
    if (points.length < 3) throw new Error('LoopPath needs at least 3 points');
    this.points = points;
    const n = points.length;
    /** @type {number[]} distance along the path at each point */
    this.at = [0];
    for (let i = 0; i < n; i++) {
      const [ax, az] = points[i], [bx, bz] = points[(i + 1) % n];
      this.at.push(this.at[i] + Math.hypot(bx - ax, bz - az));
    }
    this.length = this.at[n];
  }

  /** @param {number} s */
  wrap(s) {
    const L = this.length;
    return ((s % L) + L) % L;
  }

  // Segment index and fraction along it for distance s (binary search).
  /** @param {number} s */
  locate(s) {
    s = this.wrap(s);
    let lo = 0, hi = this.points.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (this.at[mid] <= s) lo = mid;
      else hi = mid - 1;
    }
    const len = this.at[lo + 1] - this.at[lo];
    return { i: lo, k: len > 0 ? (s - this.at[lo]) / len : 0 };
  }

  /**
   * (x, z) at distance s.
   * @param {number} s
   * @returns {[number, number]}
   */
  pointAt(s) {
    /** @type {[number, number]} */
    const out = [0, 0];
    this.pointInto(s, out);
    return out;
  }

  /**
   * pointAt without making an array: (x, z) at distance s written into `out` (the same numbers).
   * @param {number} s
   * @param {[number, number] | Float64Array | number[]} out
   */
  pointInto(s, out) {
    s = this.wrap(s);
    const at = this.at, pts = this.points;
    let lo = 0, hi = pts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (at[mid] <= s) lo = mid;
      else hi = mid - 1;
    }
    const len = at[lo + 1] - at[lo];
    const k = len > 0 ? (s - at[lo]) / len : 0;
    const a = pts[lo], b = pts[(lo + 1) % pts.length];
    const ax = a[0], az = a[1];
    out[0] = ax + (b[0] - ax) * k;
    out[1] = az + (b[1] - az) * k;
    return out;
  }

  /**
   * Heading at distance s (radians; 0 = +z, like rotation.y), smoothed over ±`span` units so it
   * doesn't jump at the corners of the polyline.
   * @param {number} s
   * @param {number} [span]
   */
  headingAt(s, span = 2) {
    this.pointInto(s - span, HA);
    this.pointInto(s + span, HB);
    return Math.atan2(HB[0] - HA[0], HB[1] - HA[1]);
  }

  /**
   * How fast the heading turns at s (radians per unit, + = turning left seen from above); 1 / radius.
   * @param {number} s
   * @param {number} [span]
   */
  curvatureAt(s, span = 4) {
    const d = this.headingAt(s + span, span) - this.headingAt(s - span, span);
    return Math.atan2(Math.sin(d), Math.cos(d)) / (2 * span);
  }

  /**
   * The given point nearest (x, z): its distance along the path and how far it is. Exact enough for
   * a dense path; a scan of every point, so for building things, not every frame.
   * @param {number} x
   * @param {number} z
   */
  nearest(x, z) {
    let best = Infinity, s = 0;
    this.points.forEach(([px, pz], i) => {
      const d = Math.hypot(px - x, pz - z);
      if (d < best) [best, s] = [d, this.at[i]];
    });
    return { s, d: best };
  }
}

/**
 * A path that ends: like LoopPath but s is clamped to 0..length, and the heading at either end is
 * that of the first or last stretch. For drawing roads that stop somewhere (a branch, the ring
 * road cut open by a roundabout).
 */
export class OpenPath {
  /** @param {[number, number][]} points at least 2 */
  constructor(points) {
    if (points.length < 2) throw new Error('OpenPath needs at least 2 points');
    this.points = points;
    /** @type {number[]} */
    this.at = [0];
    for (let i = 1; i < points.length; i++) this.at.push(this.at[i - 1] + Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]));
    this.length = this.at[points.length - 1];
  }

  /**
   * @param {number} s
   * @returns {[number, number]}
   */
  pointAt(s) {
    /** @type {[number, number]} */
    const out = [0, 0];
    this.pointInto(s, out);
    return out;
  }

  /**
   * pointAt without making an array: (x, z) at distance s written into `out`.
   * @param {number} s
   * @param {[number, number] | Float64Array | number[]} out
   */
  pointInto(s, out) {
    s = Math.min(this.length, Math.max(0, s));
    let lo = 0, hi = this.points.length - 2;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (this.at[mid] <= s) lo = mid;
      else hi = mid - 1;
    }
    const len = this.at[lo + 1] - this.at[lo];
    const k = len > 0 ? (s - this.at[lo]) / len : 0;
    const a = this.points[lo], b = this.points[lo + 1];
    const ax = a[0], az = a[1];
    out[0] = ax + (b[0] - ax) * k;
    out[1] = az + (b[1] - az) * k;
    return out;
  }

  /**
   * The given point nearest (x, z): its distance along the path and how far it is.
   * @param {number} x
   * @param {number} z
   */
  nearest(x, z) {
    return LoopPath.prototype.nearest.call(this, x, z);
  }

  /**
   * @param {number} s
   * @param {number} [span]
   */
  headingAt(s, span = 1) {
    const a = Math.max(0, Math.min(this.length - 2 * span, s - span));
    const [ax, az] = this.pointAt(a), [bx, bz] = this.pointAt(a + 2 * span);
    return Math.atan2(bx - ax, bz - az);
  }
}

/**
 * A closed polyline made smooth for driving: resampled every `step` units, then each point
 * averaged with its neighbours `window` units either way (twice). A corner becomes a bend a few
 * units round; long straights and wide curves barely move.
 * @param {[number, number][]} points closed, not repeating the first at the end
 * @param {{ step?: number, window?: number }} [o]
 * @returns {[number, number][]}
 */
export function smoothLoop(points, { step = 0.5, window = 3 } = {}) {
  const path = new LoopPath(points);
  const n = Math.max(3, Math.round(path.length / step));
  let pts = Array.from({ length: n }, (_, i) => path.pointAt((i / n) * path.length));
  const w = Math.max(1, Math.round(window / (path.length / n)));
  for (let pass = 0; pass < 2; pass++) {
    pts = pts.map((_, i) => {
      let x = 0, z = 0;
      for (let k = -w; k <= w; k++) {
        const [px, pz] = pts[(i + k + n) % n];
        x += px;
        z += pz;
      }
      return /** @type {[number, number]} */ ([x / (2 * w + 1), z / (2 * w + 1)]);
    });
  }
  return pts;
}

/**
 * Points on a circle round `c` from angle `from` to `to`, going the way angles grow
 * (anticlockwise seen from above; angle 0 = +z, like a heading), `step` units apart. `to` is
 * reached by going round, so to < from means most of a turn.
 * @param {[number, number]} c
 * @param {number} r
 * @param {number} from
 * @param {number} to
 * @param {number} [step]
 * @returns {[number, number][]}
 */
export function arc([cx, cz], r, from, to, step = 1) {
  const sweep = (((to - from) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  const n = Math.max(1, Math.ceil((sweep * r) / step));
  return Array.from({ length: n + 1 }, (_, i) => {
    const t = from + (sweep * i) / n;
    return /** @type {[number, number]} */ ([cx + Math.sin(t) * r, cz + Math.cos(t) * r]);
  });
}

/**
 * A rectangle with rounded corners, `step` units between points, in local (a, b) coordinates
 * mapped to world (x, z) by `toWorld`. Goes round anticlockwise in (a, b).
 * @param {{ a0: number, a1: number, b0: number, b1: number, radius: number, step?: number,
 *   toWorld: (a: number, b: number) => [number, number] }} o
 * @returns {[number, number][]}
 */
export function roundedRect({ a0, a1, b0, b1, radius, step = 2, toWorld }) {
  const r = Math.min(radius, (a1 - a0) / 2, (b1 - b0) / 2);
  /** @type {[number, number][]} */
  const pts = [];
  // Corner centres, in order, each with the angle its arc starts at.
  const corners = [
    [a1 - r, b0 + r, -Math.PI / 2],
    [a1 - r, b1 - r, 0],
    [a0 + r, b1 - r, Math.PI / 2],
    [a0 + r, b0 + r, Math.PI],
  ];
  corners.forEach(([ca, cb, start], i) => {
    const arcSteps = Math.max(2, Math.ceil((r * Math.PI) / 2 / step));
    for (let k = 0; k <= arcSteps; k++) {
      const t = start + (k / arcSteps) * (Math.PI / 2);
      pts.push(toWorld(ca + Math.cos(t) * r, cb + Math.sin(t) * r));
    }
    // Straight side to the next corner.
    const [na, nb, nstart] = corners[(i + 1) % 4];
    const [ea, eb] = [ca + Math.cos(start + Math.PI / 2) * r, cb + Math.sin(start + Math.PI / 2) * r];
    const [sa, sb] = [na + Math.cos(nstart) * r, nb + Math.sin(nstart) * r];
    const len = Math.hypot(sa - ea, sb - eb);
    const n = Math.floor(len / step);
    for (let k = 1; k < n; k++) pts.push(toWorld(ea + ((sa - ea) * k) / n, eb + ((sb - eb) * k) / n));
  });
  return pts;
}

/**
 * An ellipse round (cx, cz), `step` units between points; dir = 1 anticlockwise seen from above.
 * @param {{ cx: number, cz: number, rx: number, rz: number, step?: number, dir?: number }} o
 * @returns {[number, number][]}
 */
export function ellipse({ cx, cz, rx, rz, step = 4, dir = 1 }) {
  const n = Math.max(12, Math.ceil((Math.PI * (rx + rz)) / step));
  /** @type {[number, number][]} */
  const pts = [];
  for (let i = 0; i < n; i++) {
    const t = (dir * i * Math.PI * 2) / n;
    pts.push([cx + Math.cos(t) * rx, cz + Math.sin(t) * rz]);
  }
  return pts;
}
