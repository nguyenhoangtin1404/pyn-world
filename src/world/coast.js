// @ts-check
import { WATER_Y } from '../config.js';

// The sea and its shore, for what lives there (features/seacraft.js, features/beach.js): a grid of
// cells over the world telling open sea (water the land cover calls sea) from the rest, how many cells
// each sea cell is from the nearest land, and points along the waterline with the way up the beach.

export const COAST_CELL = 3; // units

/**
 * @typedef {{ x: number, z: number, nx: number, nz: number }} ShorePoint where the water meets the land,
 *   and the way to the land from there (unit)
 * @typedef {ReturnType<typeof findCoast>} Coast
 */

/**
 * @param {{ size: number, ground: (x: number, z: number) => number, isSeaCover: (x: number, z: number) => boolean, cell?: number }} o
 *   ground: the ground as drawn; isSeaCover: whether the land cover calls (x, z) sea (an inland pond is not)
 */
export function findCoast({ size, ground, isSeaCover, cell = COAST_CELL }) {
  const n = Math.ceil(size / cell);
  const cx = (/** @type {number} */ j) => -size / 2 + (j + 0.5) * cell;
  const index = (/** @type {number} */ x, /** @type {number} */ z) => {
    const i = Math.floor((z + size / 2) / cell), j = Math.floor((x + size / 2) / cell);
    return i < 0 || j < 0 || i >= n || j >= n ? -1 : i * n + j;
  };
  // The sea: water connected to where the land cover says sea at the edge of the world (the land cover goes by
  // the map's coast, the water by the ground as drawn: the shallows by the beach are water the cover may call
  // beach; and the cover calls any ground below 0 m sea, an inland lake too — the sea is the one that reaches
  // the edge, as the importer made it).
  const sea = new Uint8Array(n * n);
  const water = new Uint8Array(n * n);
  const fill = [];
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (!(ground(cx(j), cx(i)) < WATER_Y)) continue;
      water[i * n + j] = 1;
      const edge = i === 0 || j === 0 || i === n - 1 || j === n - 1;
      if (edge && isSeaCover(cx(j), cx(i))) (sea[i * n + j] = 1), fill.push(i * n + j);
    }
  }
  while (fill.length) {
    const c = /** @type {number} */ (fill.pop()), i = Math.floor(c / n), j = c % n;
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const a = i + di, b = j + dj;
      if (a < 0 || b < 0 || a >= n || b >= n || !water[a * n + b] || sea[a * n + b]) continue;
      sea[a * n + b] = 1;
      fill.push(a * n + b);
    }
  }

  // Cells from the nearest land (0 on land), breadth first from every land cell.
  const dist = new Int32Array(n * n).fill(-1);
  const queue = new Int32Array(n * n);
  let head = 0, tail = 0;
  for (let c = 0; c < n * n; c++) if (!sea[c]) (dist[c] = 0), (queue[tail++] = c);
  while (head < tail) {
    const c = queue[head++], i = Math.floor(c / n), j = c % n;
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const a = i + di, b = j + dj;
      if (a < 0 || b < 0 || a >= n || b >= n || dist[a * n + b] >= 0) continue;
      dist[a * n + b] = dist[c] + 1;
      queue[tail++] = a * n + b;
    }
  }
  let maxDist = 0;
  for (let c = 0; c < n * n; c++) maxDist = Math.max(maxDist, dist[c]);

  // The waterline: from each sea cell next to land, up the slope until the ground is out of the water.
  /** @type {ShorePoint[]} */
  const shore = [];
  let sx = 0, sz = 0;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (dist[i * n + j] !== 1) continue;
      const x0 = cx(j), z0 = cx(i);
      let gx = ground(x0 + 1, z0) - ground(x0 - 1, z0), gz = ground(x0, z0 + 1) - ground(x0, z0 - 1);
      const len = Math.hypot(gx, gz);
      if (len < 1e-6) continue;
      gx /= len;
      gz /= len;
      for (let d = 0; d <= cell * 2; d += 0.25) {
        const x = x0 + gx * d, z = z0 + gz * d;
        if (ground(x, z) < WATER_Y) continue;
        shore.push({ x, z, nx: gx, nz: gz });
        sx -= gx;
        sz -= gz;
        break;
      }
    }
  }
  const sl = Math.hypot(sx, sz) || 1;

  return {
    cell,
    maxDist,
    shore,
    /** The way out to sea, on the whole (unit). */
    seaward: { x: sx / sl, z: sz / sl },
    /** Open sea at (x, z)? */
    isSea: (/** @type {number} */ x, /** @type {number} */ z) => {
      const c = index(x, z);
      return c >= 0 && sea[c] === 1;
    },
    /** Cells from (x, z) to the nearest land: 0 on land or off the world. */
    distAt: (/** @type {number} */ x, /** @type {number} */ z) => {
      const c = index(x, z);
      return c < 0 ? 0 : dist[c];
    },
    /** Every sea cell's centre and its distance from land, in cells. */
    cells: () => {
      /** @type {{ x: number, z: number, d: number }[]} */
      const out = [];
      for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) if (sea[i * n + j]) out.push({ x: cx(j), z: cx(i), d: dist[i * n + j] });
      return out;
    },
  };
}

/**
 * The world's coast, worked out once (a world with a land cover that knows the sea: worlds from map data).
 * @param {any} world
 * @returns {Coast}
 */
export const coastOf = (world) =>
  world.service('coast', () =>
    findCoast({
      size: world.size,
      ground: world.terrain.meshHeightAt,
      isSeaCover: (x, z) => world.cfg.landcover?.(x, z) === 'sea',
    }),
  );
