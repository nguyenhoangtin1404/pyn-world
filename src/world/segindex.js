// @ts-check

// Line segments (each with a half width: a strip, a lane, a walk) filed in a grid of square cells, for
// "how close is (x, z) to the nearest of them" without going through them all. Used to keep what stands
// on a town's pavements out of the way of the people walking them and the traffic (features/streetlife.js).

const cellKey = (/** @type {number} */ i, /** @type {number} */ j) => (i + 32768) * 65536 + (j + 32768);

export class SegIndex {
  /** @param {number} [cell] the cells' side, in units */
  constructor(cell = 4) {
    this.cell = cell;
    /** @type {Map<number, number[]>} cell → segment ids */
    this.cells = new Map();
    /** @type {number[]} ax, az, bx, bz, half width, tag — six numbers a segment */
    this.segs = [];
  }

  /**
   * @param {number} ax @param {number} az @param {number} bx @param {number} bz
   * @param {number} [w] half width: clearance is measured from the strip's edge
   * @param {number} [tag] what it belongs to (a street's index…), for clearance(…, skip)
   */
  add(ax, az, bx, bz, w = 0, tag = -1) {
    const id = this.segs.length / 6, c = this.cell;
    this.segs.push(ax, az, bx, bz, w, tag);
    const i0 = Math.floor((Math.min(ax, bx) - w) / c), i1 = Math.floor((Math.max(ax, bx) + w) / c);
    const j0 = Math.floor((Math.min(az, bz) - w) / c), j1 = Math.floor((Math.max(az, bz) + w) / c);
    for (let i = i0; i <= i1; i++) {
      for (let j = j0; j <= j1; j++) {
        const key = cellKey(i, j);
        const list = this.cells.get(key);
        if (list) list.push(id);
        else this.cells.set(key, [id]);
      }
    }
    return this;
  }

  /**
   * A polyline as segments.
   * @param {{ x: number, z: number }[] | [number, number][]} pts @param {number} [w] @param {number} [tag]
   */
  addLine(pts, w = 0, tag = -1) {
    const xz = (/** @type {any} */ p) => (Array.isArray(p) ? p : [p.x, p.z]);
    for (let i = 1; i < pts.length; i++) {
      const [ax, az] = xz(pts[i - 1]), [bx, bz] = xz(pts[i]);
      this.add(ax, az, bx, bz, w, tag);
    }
    return this;
  }

  /**
   * From (x, z) to the edge of the nearest segment's strip (negative inside it). Exact up to `max`;
   * beyond that it may be Infinity, or more than the true value — compare it with thresholds ≤ max.
   * @param {number} x @param {number} z @param {number} [max] @param {number} [skip] a tag to ignore
   */
  clearance(x, z, max = this.cell, skip = -2) {
    return this.nearest(x, z, max, skip).d;
  }

  /**
   * clearance() and the tag of the segment it is to (-1 with none within reach).
   * @param {number} x @param {number} z @param {number} [max] @param {number} [skip]
   */
  nearest(x, z, max = this.cell, skip = -2) {
    const c = this.cell, s = this.segs;
    let best = Infinity, tag = -1;
    const i0 = Math.floor((x - max) / c), i1 = Math.floor((x + max) / c);
    const j0 = Math.floor((z - max) / c), j1 = Math.floor((z + max) / c);
    for (let i = i0; i <= i1; i++) {
      for (let j = j0; j <= j1; j++) {
        const list = this.cells.get(cellKey(i, j));
        if (!list) continue;
        for (const id of list) {
          const o = id * 6;
          if (s[o + 5] === skip) continue;
          const d = segmentDistance(x, z, s[o], s[o + 1], s[o + 2], s[o + 3]) - s[o + 4];
          if (d < best) [best, tag] = [d, s[o + 5]];
        }
      }
    }
    return { d: best, tag };
  }
}

/** From (x, z) to the segment a–b. @param {number} x @param {number} z @param {number} ax @param {number} az @param {number} bx @param {number} bz */
export function segmentDistance(x, z, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az, len2 = dx * dx + dz * dz;
  const t = len2 > 1e-12 ? Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / len2)) : 0;
  return Math.hypot(x - ax - dx * t, z - az - dz * t);
}
