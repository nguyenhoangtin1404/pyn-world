// @ts-check
// A closed path through (x, z) points, walked by distance: pointAt(s) for any s (it wraps round),
// the direction there, and how sharply it turns. Pure maths, no three.js: roads and flight circuits
// are both LoopPaths. The points are joined by straight lines, so give them densely (every few
// units) for a smooth path — roundedRect() and ellipse() below do.

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
    const { i, k } = this.locate(s);
    const [ax, az] = this.points[i], [bx, bz] = this.points[(i + 1) % this.points.length];
    return [ax + (bx - ax) * k, az + (bz - az) * k];
  }

  /**
   * Heading at distance s (radians; 0 = +z, like rotation.y), smoothed over ±`span` units so it
   * doesn't jump at the corners of the polyline.
   * @param {number} s
   * @param {number} [span]
   */
  headingAt(s, span = 2) {
    const [ax, az] = this.pointAt(s - span), [bx, bz] = this.pointAt(s + span);
    return Math.atan2(bx - ax, bz - az);
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
