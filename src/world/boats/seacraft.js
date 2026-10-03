import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { box, ball, cyl, slab, keep } from '../lowpoly.js';
import { WHITE, RED, WOOD, DARK } from './parts.js';

// What sails the sea off a coast (features/seacraft.js), one geometry per kind for an Instancer:
// in metres, facing local +z, y = 0 the waterline. Parts painted PAINT take each boat's own colour
// (the Instancer tints them; other colours are darkened by the tint too, so keep them for the hull).

export const PAINT = '#ffffff';
const GLASS = '#2d3a48';
const CHROME = '#b9bec4';
const FISHING = [[-1.2, -4.2], [1.2, -4.2], [1.3, -2], [1.25, 1.5], [0.8, 3.4], [0, 4.6], [-0.8, 3.4], [-1.25, 1.5], [-1.3, -2]];
const SHIP = [[-3, -13], [3, -13], [3.2, -6], [3, 7], [1.8, 11], [0, 13.2], [-1.8, 11], [-3, 7], [-3.2, -6]];

// A jet ski (PAINT body, white deck), facing +z; its driver is a Person (features/seacraft.js, JETSKI_SEAT).
// Tows a parasail from the hook at the back of its seat (TOW_HOOK).
export const TOW_HOOK = [0, 0.75, -1.1];
/** Where the driver sits and holds the bar, as vehicle.js seat() takes it. */
export const JETSKI_SEAT = { seat: /** @type {[number, number, number]} */ ([0, 0.56, -0.4]), lean: 0.3, pedal: false, bar: /** @type {[number, number]} */ ([0.72, 0.42]) };
const JETSKI = [[-0.5, -1.3], [0.5, -1.3], [0.58, -0.4], [0.5, 0.6], [0.25, 1.25], [0, 1.45], [-0.25, 1.25], [-0.5, 0.6], [-0.58, -0.4]];
export function jetSki() {
  return mergeGeometries([
    slab(JETSKI, -0.25, 0.3, PAINT),
    slab(JETSKI, 0.3, 0.38, WHITE, 0.96),
    box(0.42, 0.18, 1.0, DARK, [0, 0.47, -0.45]), // seat
    box(0.5, 0.3, 0.45, PAINT, [0, 0.5, 0.55], { rx: -0.35 }), // the cowl over the handlebar
    cyl(0.02, 0.02, 0.7, DARK, [0, 0.72, 0.42], { rz: Math.PI / 2 }, 5), // handlebar
    cyl(0.03, 0.03, 0.3, CHROME, [0, 0.6, -1.0], {}, 5), // the tow hook's post
  ]);
}

// A parasail in flight: the canopy an arc of cells in stripes, its lines down to the harness bar (y = 0,
// the tow rope's end), and from the bar the straps of two seats side by side (x = ±FLYER_X), down past
// where the two tourists (Persons, features/seacraft.js) hold them. Faces +z (towards what tows it). Not tinted.
export const FLYER_X = 0.45;
export function parasail() {
  const parts = [];
  const R = 4.6, cy = 4.2, cells = 9, span = 2.5; // the arc: radius, centre height, cells over `span` radians
  const STRIPES = ['#e84a3c', '#f2b632', '#3a7fc4', '#f4f1ea'];
  for (let i = 0; i < cells; i++) {
    const th = -span / 2 + ((i + 0.5) * span) / cells;
    parts.push(box((R * span) / cells + 0.03, 0.18, 3.2, STRIPES[i % STRIPES.length], [R * Math.sin(th), cy + R * Math.cos(th), 0], { rz: -th }));
  }
  // Lines: from the canopy's edge, front and back, down to the bar.
  for (let i = 0; i <= cells; i += 3) {
    const th = -span / 2 + (i * span) / cells;
    for (const z of [-1.4, 1.4]) parts.push(stick([R * Math.sin(th), cy + R * Math.cos(th), z], [Math.sign(Math.sin(th)) * 0.7, 0.1, 0], 0.015, '#3a3a3a'));
  }
  parts.push(box(1.7, 0.06, 0.06, DARK, [0, 0, 0])); // the harness bar
  for (const x of [-FLYER_X, FLYER_X]) for (const s of [-0.31, 0.31]) parts.push(stick([x + s, 0, 0], [x + s * 0.5, -1.45, 0.05], 0.015, DARK)); // straps
  return mergeGeometries(parts);
}

// The tow rope: one unit long along z from its middle, stretched and turned into place each frame.
export function towRope() {
  return box(0.04, 0.04, 1, '#e8e2d0');
}

/** A thin rod from a to b (in metres). */
function stick(/** @type {number[]} */ a, /** @type {number[]} */ b, /** @type {number} */ r, /** @type {string} */ color) {
  const from = new THREE.Vector3(...a), d = new THREE.Vector3(...b).sub(from), len = d.length();
  const g = cyl(r, r, len, color, [0, 0, 0], {}, 4);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()));
  return g.translate(from.x + (b[0] - a[0]) / 2, from.y + (b[1] - a[1]) / 2, from.z + (b[2] - a[2]) / 2);
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

// ---- Lights at night (features/seacraft.js shows them after dark): bulbs drawn unlit, so they glow.

// A fishing boat's squid lamps: the row of big bulbs on the line from the mast to the wheelhouse (as on the
// boat by day, fishingBoat), and its mast light.
export function fishingLamps() {
  return mergeGeometries([
    ...[-1.3, -0.5, 0.3, 1.0].map((z) => ball(0.26, '#f4fff2', [0, 2.15, z], {}, 1)),
    ball(0.12, '#ffffff', [0, 3.95, 1.4], {}, 0),
  ]);
}

// A coaster's: the white masthead and stern lights, red to port, green to starboard, and its lit bridge windows.
export function shipLamps() {
  return mergeGeometries([
    ball(0.35, '#ffffff', [0, 8.8, -10.6], {}, 0),
    ball(0.3, '#ffffff', [0, 2.6, -13.1], {}, 0),
    ball(0.3, '#ff3020', [-3.2, 2.4, 9], {}, 0),
    ball(0.3, '#20ff60', [3.2, 2.4, 9], {}, 0),
    box(5.7, 0.4, 3.0, '#ffe7a8', [0, 5.4, -8.6]),
  ]);
}

// The light of a squid boat's lamps on the water round it: a flat disc, bright in the middle, fading out
// (additive: it brightens what's under it). Shared by every world, built once.
let glow = null;
export function squidGlow() {
  if (!glow) {
    const N = 32, data = new Uint8Array(N * N * 4);
    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        const a = Math.max(0, 1 - Math.hypot((i + 0.5) / N - 0.5, (j + 0.5) / N - 0.5) * 2) ** 1.6;
        data.set([255, 255, 255, Math.round(a * 255)], (j * N + i) * 4);
      }
    }
    const tex = keep(new THREE.DataTexture(data, N, N));
    tex.needsUpdate = true;
    glow = {
      geo: keep(new THREE.PlaneGeometry(20, 20).rotateX(-Math.PI / 2).translate(0, 0.7, 0)), // (over the waves round the boat, which may stand higher than where it floats)
      mat: keep(new THREE.MeshBasicMaterial({ color: '#e6ffe8', map: tex, transparent: true, opacity: 1, depthWrite: false, blending: THREE.AdditiveBlending })),
    };
  }
  return glow;
}
