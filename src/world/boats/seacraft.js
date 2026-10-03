import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { box, ball, cyl, cone, slab, torus } from '../lowpoly.js';
import { WHITE, RED, WOOD, DARK } from './parts.js';

// What sails the sea off a coast (features/seacraft.js), one geometry per kind for an Instancer:
// in metres, facing local +z, y = 0 the waterline. Parts painted PAINT take each boat's own colour
// (the Instancer tints them; other colours are darkened by the tint too, so keep them for the hull).

export const PAINT = '#ffffff';
const GLASS = '#2d3a48';
const CIRCLE = Array.from({ length: 16 }, (_, i) => [Math.cos((i / 16) * Math.PI * 2), Math.sin((i / 16) * Math.PI * 2)]);
const FISHING = [[-1.2, -4.2], [1.2, -4.2], [1.3, -2], [1.25, 1.5], [0.8, 3.4], [0, 4.6], [-0.8, 3.4], [-1.25, 1.5], [-1.3, -2]];
const SHIP = [[-3, -13], [3, -13], [3.2, -6], [3, 7], [1.8, 11], [0, 13.2], [-1.8, 11], [-3, 7], [-3.2, -6]];

// A round woven basket boat (thúng chai, Phú Yên's own), a fisherman in a conical hat in it, his paddle
// and his net. Not tinted.
export function basketBoat() {
  return mergeGeometries([
    slab(CIRCLE, -0.35, 0.28, '#5b4128', 1.0, 0.9), // the woven wall
    slab(CIRCLE, -0.35, -0.26, '#4a3520', 0.92), // its floor
    torus(1.0, 0.05, '#2f2116', [0, 0.28, 0], { rx: Math.PI / 2 }, 16), // the rim
    box(0.36, 0.5, 0.24, '#2f5d7c', [0, 0.0, -0.15]), // the fisherman, sitting low
    ball(0.13, '#c99a75', [0, 0.36, -0.15]),
    cone(0.34, 0.22, '#e8d9a8', [0, 0.55, -0.15], {}, 10), // nón lá
    box(0.1, 0.1, 0.42, '#2f5d7c', [0.17, 0.08, 0.05], { rx: -0.4 }), // arms to the paddle
    box(0.1, 0.1, 0.42, '#2f5d7c', [-0.17, 0.08, 0.05], { rx: -0.4 }),
    cyl(0.03, 0.03, 1.7, WOOD, [0.3, 0.15, 0.45], { rx: 1.0 }, 5), // the paddle
    box(0.18, 0.02, 0.4, WOOD, [0.3, -0.45, 1.1], { rx: 1.0 }),
    ball(0.28, '#6f7f6a', [-0.4, -0.18, 0.35], { sy: 0.45 }), // the net
  ]);
}

// A wooden fishing boat as they are on this coast: a blue hull (PAINT) with a red band and a white rail,
// the eyes on the bow, a little wheelhouse, a mast with the flag and the lamps for squid fishing.
export function fishingBoat() {
  const eyes = [1, -1].flatMap((s) => [ball(0.13, WHITE, [s * 1.0, 0.18, 3.55], {}, 0), ball(0.07, DARK, [s * 1.06, 0.18, 3.6], {}, 0)]);
  return mergeGeometries([
    slab(FISHING, -0.6, 0.5, PAINT),
    slab(FISHING, 0.3, 0.52, RED, 1.02),
    slab(FISHING, 0.5, 0.56, WOOD, 0.97),
    slab(FISHING, 0.52, 0.85, WHITE, 1.0, 0.94),
    ...eyes,
    box(1.7, 1.2, 2.2, WHITE, [0, 1.15, -1.9]), // wheelhouse
    box(1.74, 0.35, 1.6, GLASS, [0, 1.35, -1.75]),
    box(1.9, 0.1, 2.5, RED, [0, 1.8, -1.9]),
    cyl(0.05, 0.06, 3.4, WOOD, [0, 2.2, 1.4], {}, 6), // mast
    box(0.6, 0.4, 0.02, '#da251d', [0.32, 3.65, 1.4]), // the flag, its star
    box(0.13, 0.13, 0.03, '#ffde00', [0.32, 3.65, 1.4]),
    box(0.04, 0.04, 3.2, DARK, [0, 2.35, 0.0]), // the lamp line, from the mast back to the wheelhouse
    ...[-1.3, -0.5, 0.3, 1.0].map((z) => ball(0.13, '#fff4d6', [0, 2.15, z], {}, 0)),
  ]);
}

// A coaster out at sea: a hull (PAINT) with a white band, a bridge and funnel aft, containers in front.
export function ship() {
  const boxes = [];
  const colors = ['#c8453a', '#2f5d7c', '#e0a64a', '#3f7d44', '#8a9096', '#a8744a'];
  for (let z = -4, n = 0; z <= 8; z += 6) for (const x of [-1.3, 1.3]) for (const y of [3.3, 5.75]) boxes.push(box(2.4, 2.4, 5.8, colors[n++ % colors.length], [x, y, z]));
  return mergeGeometries([
    slab(SHIP, -1.5, 2.0, PAINT),
    slab(SHIP, 1.5, 2.05, WHITE, 1.01),
    slab(SHIP, 2.0, 2.15, '#8f8f8a', 0.97),
    box(5.6, 4, 4, WHITE, [0, 4.1, -9]), // bridge
    box(5.66, 0.6, 3.6, GLASS, [0, 5.4, -8.6]),
    cyl(0.7, 0.8, 2.6, RED, [0, 7.2, -10.6], {}, 10), // funnel
    ...boxes,
  ]);
}
