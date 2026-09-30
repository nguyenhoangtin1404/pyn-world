// @ts-check
import { smoothstep } from '../utils.js';

// Streets graded into the ground, as road builders do: along each street the height is the ground's
// averaged over a stretch either side (the bumps of the elevation data — a few metres, exaggerated
// three times — ironed out, the lie of the land kept), and across it level, blending back into the
// ground beside it. The terrain (world/terrain.js) lerps its ground towards this, so the streets
// laid on it (features/streets.js) come out smooth and flat across. Water is left alone: a bridge
// crosses it, the ground under it isn't filled in.

/**
 * @param {{ width: number, points: [number, number][] }[]} roads in world units
 * @param {(x: number, z: number) => number} ground the ground before grading
 * @param {object} o
 * @param {number} o.size of the diorama
 * @param {number} o.dry heights at or below this are water (not graded, not averaged in)
 * @param {number} [o.cell] raster cell (units)
 * @param {number} [o.along] how far either side the height is averaged over (units)
 * @param {number} [o.flat] level this far beyond the street's half width,
 * @param {number} [o.blend] then back to the ground over this much more
 * @returns {((x: number, z: number, h: number) => number) | null} graded height at (x, z) for ground height h
 */
export function createGrade(roads, ground, { size, dry, cell = 1.5, along = 9, flat = 1.5, blend = 2.5 }) {
  if (!roads.length) return null;
  const n = Math.ceil(size / cell) + 1;
  const sumH = new Float32Array(n * n), sumW = new Float32Array(n * n), most = new Float32Array(n * n);
  const index = (/** @type {number} */ v) => (v + size / 2) / cell;
  for (const road of roads) {
    // Samples every `cell` along the street, and their ground.
    const xs = [], zs = [], hs = [];
    const pts = road.points;
    for (let i = 1; i < pts.length; i++) {
      const [ax, az] = pts[i - 1], [bx, bz] = pts[i];
      const m = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / cell));
      for (let k = i === 1 ? 0 : 1; k <= m; k++) {
        const x = ax + ((bx - ax) * k) / m, z = az + ((bz - az) * k) / m;
        xs.push(x);
        zs.push(z);
        hs.push(ground(x, z));
      }
    }
    const win = Math.round(along / cell);
    const inner = Math.max(road.width / 2, 1) + flat, outer = inner + blend;
    for (let i = 0; i < xs.length; i++) {
      if (hs[i] <= dry) continue;
      // Averaged along the street, over the dry ground only.
      let sum = 0, count = 0;
      for (let j = Math.max(0, i - win); j <= Math.min(xs.length - 1, i + win); j++) {
        if (hs[j] <= dry) continue;
        sum += hs[j];
        count++;
      }
      const h = sum / count;
      const i0 = Math.max(0, Math.floor(index(zs[i] - outer))), i1 = Math.min(n - 1, Math.ceil(index(zs[i] + outer)));
      const j0 = Math.max(0, Math.floor(index(xs[i] - outer))), j1 = Math.min(n - 1, Math.ceil(index(xs[i] + outer)));
      for (let r = i0; r <= i1; r++) {
        for (let c = j0; c <= j1; c++) {
          const d = Math.hypot(c * cell - size / 2 - xs[i], r * cell - size / 2 - zs[i]);
          const w = 1 - smoothstep(inner, outer, d);
          if (w <= 0) continue;
          const k = r * n + c;
          sumH[k] += h * w;
          sumW[k] += w;
          if (w > most[k]) most[k] = w;
        }
      }
    }
  }
  return (x, z, h) => {
    if (h <= dry) return h;
    const gx = index(x), gz = index(z);
    const c = Math.min(n - 2, Math.max(0, Math.floor(gx))), r = Math.min(n - 2, Math.max(0, Math.floor(gz)));
    const u = gx - c, v = gz - r;
    let target = 0, weight = 0, wsum = 0;
    for (const [dr, dc, f] of [[0, 0, (1 - u) * (1 - v)], [0, 1, u * (1 - v)], [1, 0, (1 - u) * v], [1, 1, u * v]]) {
      const k = (r + dr) * n + c + dc;
      if (sumW[k] > 0) {
        target += (sumH[k] / sumW[k]) * f;
        wsum += f;
      }
      weight += most[k] * f;
    }
    if (wsum === 0) return h;
    return h + (target / wsum - h) * Math.min(1, weight);
  };
}
