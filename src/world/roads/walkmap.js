// @ts-check
// Where people may walk by a road network, as a grid of half-unit cells: sidewalk, carriageway
// (off limits) and crosswalk (only when its signal says so — `crossing` is the index of the
// crosswalk in world.site.crossings). Filled by the road feature, read by the nav grids people
// find their way on (world/nav.js) and to lift their feet onto the sidewalks.

export const SIDEWALK = 1;
export const CARRIAGEWAY = 2;
export const CROSSWALK = 3;

/**
 * @typedef {{ pointAt(s: number): [number, number], headingAt(s: number): number }} Line
 */

export class WalkMap {
  /**
   * @param {{ minX: number, minZ: number, maxX: number, maxZ: number }} bounds
   * @param {number} [cell]
   */
  constructor({ minX, minZ, maxX, maxZ }, cell = 0.5) {
    this.cell = cell;
    this.minX = minX;
    this.minZ = minZ;
    this.nx = Math.max(1, Math.ceil((maxX - minX) / cell));
    this.nz = Math.max(1, Math.ceil((maxZ - minZ) / cell));
    this.kind = new Uint8Array(this.nx * this.nz);
    this.crossing = new Int16Array(this.nx * this.nz).fill(-1);
  }

  /** @param {number} x @param {number} z */
  index(x, z) {
    const i = Math.floor((x - this.minX) / this.cell), j = Math.floor((z - this.minZ) / this.cell);
    return i < 0 || j < 0 || i >= this.nx || j >= this.nz ? -1 : j * this.nx + i;
  }

  /** What is at (x, z): 0 (nothing), SIDEWALK, CARRIAGEWAY or CROSSWALK. @param {number} x @param {number} z */
  at(x, z) {
    const k = this.index(x, z);
    return k < 0 ? 0 : this.kind[k];
  }

  /** The crosswalk at (x, z), -1 for none. @param {number} x @param {number} z */
  crossingAt(x, z) {
    const k = this.index(x, z);
    return k < 0 ? -1 : this.crossing[k];
  }

  /**
   * Mark one point. A crosswalk wins over carriageway, carriageway over sidewalk.
   * @param {number} x @param {number} z @param {number} kind @param {number} [crossing]
   */
  mark(x, z, kind, crossing = -1) {
    const k = this.index(x, z);
    if (k < 0 || this.kind[k] > kind) return;
    this.kind[k] = kind;
    if (kind === CROSSWALK) this.crossing[k] = crossing;
  }

  /**
   * Mark a band along a line, s0..s1, between two sideways offsets (+ = left).
   * @param {Line} line @param {number} s0 @param {number} s1 @param {number} left0 @param {number} left1
   * @param {number} kind @param {number} [crossing]
   */
  strip(line, s0, s1, left0, left1, kind, crossing = -1) {
    const step = this.cell / 2;
    for (let s = s0; s <= s1 + 1e-6; s += step) {
      const [x, z] = line.pointAt(s), h = line.headingAt(s);
      const lx = Math.cos(h), lz = -Math.sin(h);
      for (let o = left0; o <= left1 + 1e-6; o += step) this.mark(x + lx * o, z + lz * o, kind, crossing);
    }
  }

  /**
   * Mark a ring (r0 = 0: a disc) round c.
   * @param {[number, number]} c @param {number} r0 @param {number} r1 @param {number} kind
   */
  ring([cx, cz], r0, r1, kind) {
    const step = this.cell / 2;
    for (let r = r0; r <= r1 + 1e-6; r += step) {
      const n = Math.max(6, Math.ceil((Math.PI * 2 * r) / step));
      for (let i = 0; i < n; i++) this.mark(cx + Math.sin((i / n) * Math.PI * 2) * r, cz + Math.cos((i / n) * Math.PI * 2) * r, kind);
    }
  }
}
