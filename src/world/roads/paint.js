// @ts-check
import * as THREE from 'three';

// Flat things laid on the ground — asphalt, road markings, a roundabout's island — as vertex-coloured
// triangles that follow the terrain. Everything goes into one geometry with the same attributes as
// the lowpoly.js parts (position, normal, colour), so it bakes into the world's StaticBatch: a whole
// road network, markings included, costs no draw call of its own.

/**
 * @typedef {{ pointAt(s: number): [number, number], headingAt(s: number): number }} Line
 * @typedef {(x: number, z: number) => number} HeightFn
 * @typedef {[number, number, number]} P3
 */

const col = new THREE.Color();
/** @type {Map<string, [number, number, number]>} colour name → linear r, g, b (parsed once) */
const rgb = new Map();
/** @type {[number, number, number]} */
const UP = [0, 1, 0];

export class Paint {
  constructor() {
    /** @type {number[]} */
    this.pos = [];
    /** @type {number[]} */
    this.col = [];
  }

  /**
   * One triangle, turned to face `want` (up by default).
   * @param {P3} a @param {P3} b @param {P3} c
   * @param {string} color
   * @param {[number, number, number]} [want]
   */
  tri(a, b, c, color, want = UP) {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const flip = nx * want[0] + ny * want[1] + nz * want[2] < 0;
    const p = flip ? c : b, q = flip ? b : c;
    this.pos.push(a[0], a[1], a[2], p[0], p[1], p[2], q[0], q[1], q[2]);
    let v = rgb.get(color);
    if (!v) rgb.set(color, (v = [col.set(color).r, col.g, col.b]));
    this.col.push(v[0], v[1], v[2], v[0], v[1], v[2], v[0], v[1], v[2]);
  }

  /**
   * @param {P3} a @param {P3} b @param {P3} c @param {P3} d corners in order round
   * @param {string} color
   * @param {[number, number, number]} [want]
   */
  quad(a, b, c, d, color, want) {
    this.tri(a, b, c, color, want);
    this.tri(a, c, d, color, want);
  }

  /**
   * A band along a line from s0 to s1, between two sideways offsets (+ = left of the direction of
   * travel), cut into cells of about a unit so it follows the ground.
   * @param {Line} line
   * @param {number} s0
   * @param {number} s1
   * @param {number} left0
   * @param {number} left1
   * @param {HeightFn} heightAt
   * @param {string} color
   */
  strip(line, s0, s1, left0, left1, heightAt, color) {
    const n = Math.max(1, Math.ceil(Math.abs(s1 - s0)));
    const m = Math.max(1, Math.ceil(Math.abs(left1 - left0) / 1.3));
    /** @type {P3[] | null} */
    let prev = null;
    for (let i = 0; i <= n; i++) {
      const s = s0 + ((s1 - s0) * i) / n;
      const [x, z] = line.pointAt(s);
      const h = line.headingAt(s);
      const lx = Math.cos(h), lz = -Math.sin(h);
      /** @type {P3[]} */
      const row = [];
      for (let k = 0; k <= m; k++) {
        const off = left0 + ((left1 - left0) * k) / m;
        const px = x + lx * off, pz = z + lz * off;
        row.push([px, heightAt(px, pz), pz]);
      }
      if (prev) for (let k = 0; k < m; k++) this.quad(prev[k], prev[k + 1], row[k + 1], row[k], color);
      prev = row;
    }
  }

  /**
   * Dashes along a line: `on` units painted every `every`, between two sideways offsets.
   * @param {Line} line
   * @param {number} s0
   * @param {number} s1
   * @param {number} left0
   * @param {number} left1
   * @param {HeightFn} heightAt
   * @param {string} color
   * @param {number} on
   * @param {number} every
   * @param {(s: number) => boolean} [skip] leave out the dash starting at s
   */
  dashes(line, s0, s1, left0, left1, heightAt, color, on, every, skip) {
    for (let s = s0; s + on <= s1; s += every) if (!skip?.(s)) this.strip(line, s, s + on, left0, left1, heightAt, color);
  }

  /**
   * Part of a flat ring round c (r0 = 0 for a disc), from angle a0 round to a1 (headings, the way
   * they grow; a0 = a1 for the whole ring).
   * @param {[number, number]} c
   * @param {number} r0
   * @param {number} r1
   * @param {number} a0
   * @param {number} a1
   * @param {HeightFn} heightAt
   * @param {string | ((i: number) => string)} color by segment round the ring
   */
  ring([cx, cz], r0, r1, a0, a1, heightAt, color) {
    let sweep = (((a1 - a0) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
    if (sweep < 1e-6) sweep = 2 * Math.PI;
    const n = Math.max(3, Math.ceil((sweep * r1) / 1.2));
    const m = Math.max(1, Math.ceil((r1 - r0) / 1.3));
    const at = (/** @type {number} */ i, /** @type {number} */ k) => {
      const t = a0 + (sweep * i) / n, r = r0 + ((r1 - r0) * k) / m;
      const x = cx + Math.sin(t) * r, z = cz + Math.cos(t) * r;
      return /** @type {P3} */ ([x, heightAt(x, z), z]);
    };
    for (let i = 0; i < n; i++) {
      const c = typeof color === 'function' ? color(i) : color;
      for (let k = 0; k < m; k++) {
        if (k === 0 && r0 === 0) this.tri(at(i, 0), at(i, 1), at(i + 1, 1), c);
        else this.quad(at(i, k), at(i + 1, k), at(i + 1, k + 1), at(i, k + 1), c);
      }
    }
  }

  /**
   * An upright wall under the edge of something raised, from its top (`top`) down to `bottom`, where
   * it is more than a few centimetres above it. Faces sideways: `side` = +1 left, -1 right of the
   * direction of travel (by default, away from the middle of the line).
   * @param {Line} line
   * @param {number} s0
   * @param {number} s1
   * @param {number} left offset of the edge
   * @param {HeightFn} top
   * @param {HeightFn} bottom
   * @param {string} color
   * @param {number} [side]
   */
  wall(line, s0, s1, left, top, bottom, color, side = Math.sign(left) || 1) {
    const n = Math.max(1, Math.ceil(Math.abs(s1 - s0) * 2));
    let prev = null;
    for (let i = 0; i <= n; i++) {
      const s = s0 + ((s1 - s0) * i) / n;
      const [x, z] = line.pointAt(s);
      const h = line.headingAt(s);
      const lx = Math.cos(h), lz = -Math.sin(h);
      const px = x + lx * left, pz = z + lz * left;
      const cur = { t: /** @type {P3} */ ([px, top(px, pz), pz]), b: /** @type {P3} */ ([px, bottom(px, pz) - 0.05, pz]) };
      if (prev && prev.t[1] - prev.b[1] > 0.1 && cur.t[1] - cur.b[1] > 0.1) this.quad(prev.t, cur.t, cur.b, prev.b, color, [lx * side, 0, lz * side]);
      prev = cur;
    }
  }

  /** Everything painted so far, as one geometry (null if nothing was). */
  geometry() {
    if (!this.pos.length) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.computeVertexNormals();
    return g;
  }
}
