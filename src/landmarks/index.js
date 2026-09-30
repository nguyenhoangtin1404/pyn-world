// @ts-check
import nghinhPhong from './nghinh-phong.js';
import thapNhan from './thap-nhan.js';

// Famous buildings and monuments, one file each, for worlds from map data (the recipe's
// `landmarks`, built by features/landmarks.js). A landmark is
//   { name, radius, build(site) → { spot, view, system? } }
// (see common.js): it adds its static parts to the world's batch at site (x, y, z, turned by ry),
// registers its colliders / camera solids / obstacles, and may return a system (night lights).
// Stylised low-poly, taller than life so it reads at diorama scale.
/** @type {Record<string, import('./common.js').Landmark>} */
export const LANDMARKS = { 'nghinh-phong': nghinhPhong, 'thap-nhan': thapNhan };
