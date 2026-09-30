// @ts-check
import { fbm } from './terrain.js';
// What covers the ground in a world from map data, from what the data knows: the sea, how high the
// ground is, how far the coast is, and where the town is (the recipe's `landcover.town` circles).
//   sea · beach (sand by the sea) · coastal (casuarina belt behind the beach) · town · forest (the
//   hills) · field (low flat land: rice paddies) · grass (the rest)
// The terrain colours the ground by it and the trees grow by it (features/trees.js).

/**
 * @param {{ elevationAt(x: number, z: number): number, seaDistanceAt(x: number, z: number): number }} data
 * @param {{ town?: { p: [number, number], r: number }[] }} [o] town circles in world units
 * @returns {(x: number, z: number) => import('../types').LandCover}
 */
export function createLandCover(data, { town = [] } = {}) {
  return (x, z) => {
    const m = data.elevationAt(x, z);
    if (m < 0) return 'sea';
    const sea = data.seaDistanceAt(x, z);
    if (sea < 150 && m < 8) return 'beach';
    if (sea < 500 && m < 15) return 'coastal';
    // The town's edge wanders (no circle drawn with compasses).
    if (town.some(({ p, r }) => Math.hypot(x - p[0], z - p[1]) < r * (1 + 0.35 * fbm(x, z, 2, 0.012, 7.3)))) return 'town';
    if (m > 25) return 'forest';
    if (m < 12) return 'field';
    return 'grass';
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
