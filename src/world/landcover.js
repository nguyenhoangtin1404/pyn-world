// @ts-check
import { fbm } from './terrain.js';
// What covers the ground in a world from map data, from what the data knows: the sea, how high the
// ground is, how far the coast is, and where the town is — wherever the buildings stand close
// together (a map with buildings), and/or inside the recipe's `landcover.town` circles.
//   sea · beach (sand by the sea) · coastal (casuarina belt behind the beach) · town · forest (the
//   hills) · field (low flat land: rice paddies) · grass (the rest)
// The terrain colours the ground by it and the trees grow by it (features/trees.js).

const TOWN_CELL = 5; // units
const TOWN_DENSITY = 0.05; // of the ground under roofs, round a cell and its neighbours

/**
 * @param {{ elevationAt(x: number, z: number): number, seaDistanceAt(x: number, z: number): number }} data
 * @param {{ town?: { p: [number, number], r: number }[], buildings?: { x: number, z: number, length: number, width: number }[],
 *   size?: number }} [o] town circles and buildings in world units; `size` of the diorama (for the buildings)
 * @returns {(x: number, z: number) => import('../types').LandCover}
 */
export function createLandCover(data, { town = [], buildings = [], size = 0 } = {}) {
  const built = builtUp(buildings, size);
  return (x, z) => {
    const m = data.elevationAt(x, z);
    if (m < 0) return 'sea';
    const sea = data.seaDistanceAt(x, z);
    if (sea < 150 && m < 8) return 'beach';
    if (sea < 500 && m < 15) return 'coastal';
    // The town's edge wanders (no circle drawn with compasses).
    if (built(x, z) || town.some(({ p, r }) => Math.hypot(x - p[0], z - p[1]) < r * (1 + 0.35 * fbm(x, z, 2, 0.012, 7.3)))) return 'town';
    if (m > 25) return 'forest';
    if (m < 12) return 'field';
    return 'grass';
  };
}

/**
 * Where the buildings stand close together: in cells of TOWN_CELL units, the share of the ground
 * under roofs over the cell and its eight neighbours.
 * @param {{ x: number, z: number, length: number, width: number }[]} buildings @param {number} size
 * @returns {(x: number, z: number) => boolean}
 */
export function builtUp(buildings, size) {
  if (!buildings.length || !size) return () => false;
  const n = Math.ceil(size / TOWN_CELL);
  const area = new Float32Array(n * n);
  const cell = (/** @type {number} */ v) => Math.floor((v + size / 2) / TOWN_CELL);
  for (const b of buildings) {
    const i = cell(b.z), j = cell(b.x);
    if (i >= 0 && j >= 0 && i < n && j < n) area[i * n + j] += b.length * b.width;
  }
  const town = new Uint8Array(n * n);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      let sum = 0;
      for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) if (i + di >= 0 && j + dj >= 0 && i + di < n && j + dj < n) sum += area[(i + di) * n + j + dj];
      town[i * n + j] = sum / (9 * TOWN_CELL * TOWN_CELL) > TOWN_DENSITY ? 1 : 0;
    }
  }
  return (x, z) => {
    const i = cell(z), j = cell(x);
    return i >= 0 && j >= 0 && i < n && j < n && town[i * n + j] === 1;
  };
}

/** How many of the trees a spot of each cover keeps (1 = all), and whether they are pines. */
export const TREE_COVER = {
  sea: { keep: 0, pine: 0 },
  beach: { keep: 0, pine: 0 },
  coastal: { keep: 0.9, pine: 1 }, // casuarina: pine-like
  town: { keep: 0.12, pine: 0.2 },
  forest: { keep: 1, pine: 0.5 },
  field: { keep: 0.03, pine: 0 },
  grass: { keep: 0.35, pine: 0.3 },
};
