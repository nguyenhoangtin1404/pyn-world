import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CARRIAGE_WINDOWS } from '../interiors.js';
import { box, cyl, ball, segment, skinFigure, keep, VERTEX_COLORED } from '../lowpoly.js';

// The locomotive and the carriages. Every rigid part of a car is baked into one vertex-coloured
// mesh; moving parts (wheels, coupling rods, doors) are bones, and each car ends up as ONE skinned
// mesh (see skinFigure). Parts with their own materials (lamp, windows) stay separate.

export const COLORS = {
  dark: '#2b2522',
  black: '#1f1b19',
  green: '#2f6b4f',
  red: '#c8453a',
  gold: '#d9a441',
  roof: '#6b6461',
};
const C = COLORS;
const ALONG = { rx: Math.PI / 2 }; // cylinder axis along the train (local z)
export const LOCO_WHEEL = 0.62; // driving wheel radius (the coupling rods turn with it)
export const DOOR_Z = 3.22; // carriage doors at ±DOOR_Z along the car

// One geometry per wheel size, shared by every wheel of that size (and every world).
const wheelGeos = new Map();
function wheelGeo(r) {
  if (!wheelGeos.has(r)) {
    const side = { rz: Math.PI / 2 };
    wheelGeos.set(r, keep(mergeGeometries([cyl(r, r, 0.18, C.black, [0, 0, 0], side, 14), cyl(r * 0.4, r * 0.4, 0.22, C.red, [0, 0, 0], side), box(0.2, r * 1.7, 0.14, C.red)])));
  }
  return wheelGeos.get(r);
}

function placed(mesh, x, y, z) {
  mesh.position.set(x, y, z);
  return mesh;
}

// A moving part: a bone holding its mesh.
function joint(mesh, x, y, z, parent) {
  const b = new THREE.Bone();
  b.position.set(x, y, z);
  b.add(mesh);
  parent.add(b);
  return b;
}

// A wheel bone, remembered in `wheels` (the train turns them all by the distance covered).
function wheel(r, x, z, parent, wheels) {
  const w = joint(new THREE.Mesh(wheelGeo(r), VERTEX_COLORED), x, r, z, parent);
  w.userData.r = r;
  wheels.push(w);
  return w;
}

/**
 * The locomotive, facing local +z.
 * @param {{ wheels: THREE.Bone[], rods: THREE.Bone[], lampMat: THREE.Material }} parts the train's
 *   lists of wheels and coupling rods (filled here) and the lamp's glowing material
 */
export function buildLoco({ wheels, rods, lampMat }) {
  const g = new THREE.Group();
  const root = new THREE.Bone();
  g.add(root);
  root.add(
    segment([
      box(2.0, 0.5, 7.2, C.dark, [0, 0.75, 0]),
      cyl(0.95, 0.95, 4.4, C.green, [0, 1.95, 1.1], ALONG, 12), // boiler
      ...[-0.2, 1.1, 2.4].map((z) => cyl(0.99, 0.99, 0.14, C.gold, [0, 1.95, z], ALONG, 12)),
      cyl(0.97, 0.97, 0.8, C.black, [0, 1.95, 3.35], ALONG, 12), // smokebox
      cyl(0.34, 0.26, 1.2, C.black, [0, 3.3, 3.2], {}, 10), // chimney + cap
      cyl(0.44, 0.4, 0.2, C.black, [0, 3.95, 3.2], {}, 10),
      ball(0.45, C.gold, [0, 2.85, 1.3], {}, 2), // steam dome
      box(2.2, 2.2, 2.2, C.green, [0, 2.3, -1.9]), // cab
      box(2.5, 0.2, 2.6, C.red, [0, 3.5, -1.9]),
      box(2.3, 0.45, 0.25, C.red, [0, 0.85, 3.7]), // buffer beam + cowcatcher
      box(2.0, 0.2, 0.9, C.red, [0, 0.45, 3.95], { rx: 0.6 }),
    ]),
  );
  g.add(placed(new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.4, 0.3), lampMat), 0, 3.1, 3.6));

  for (const z of [1.9, 0.5, -0.9]) for (const x of [-1.02, 1.02]) wheel(LOCO_WHEEL, x, z, root, wheels);
  for (const x of [-1.16, 1.16]) rods.push(joint(segment([box(0.08, 0.12, 2.9, C.gold)]), x, LOCO_WHEEL, 0.5, root));
  skinFigure(g, root, VERTEX_COLORED);

  const chimneyTop = new THREE.Object3D();
  chimneyTop.position.set(0, 4.1, 3.2);
  g.add(chimneyTop);

  // The one real light in the valley (see CLAUDE.md): only the headlight lights the track at night.
  const headlight = new THREE.SpotLight('#ffe7b0', 0, 90, 0.45, 0.6, 1);
  headlight.position.set(0, 3.1, 3.8);
  const hlTarget = new THREE.Object3D();
  hlTarget.position.set(0, 0, 30);
  g.add(headlight, hlTarget);
  headlight.target = hlTarget;
  return { group: g, chimneyTop, headlight };
}

/**
 * Carriage i (colours cycle every three), facing local +z. group.userData.windows is its window
 * glass, group.userData.doors its four sliding doors { panel (bone), end ±1, side ±1 }.
 * @param {number} i
 * @param {{ wheels: THREE.Bone[], windowMat: THREE.Material }} parts
 */
export function buildCarriage(i, { wheels, windowMat }) {
  const [lowerC, upperC] = [
    ['#8e3b35', '#f1e3c3'],
    ['#2f5d7c', '#f1e3c3'],
    ['#6d8b3a', '#f4ead2'],
  ][i % 3];
  const g = new THREE.Group();
  const root = new THREE.Bone();
  g.add(root);
  const body = [
    box(2.0, 0.4, 7.0, C.dark, [0, 0.7, 0]),
    box(2.34, 0.95, 7.0, lowerC, [0, 1.4, 0]),
    box(2.3, 1.05, 7.0, upperC, [0, 2.4, 0]),
    box(2.5, 0.22, 7.3, C.roof, [0, 3.03, 0]),
    box(2.0, 0.16, 7.1, C.roof, [0, 3.2, 0]),
    ...[-2.6, 2.6].map((z) => box(2.1, 0.25, 1.8, C.dark, [0, 0.45, z])), // bogies
  ];

  const panes = [];
  for (const side of [-1, 1]) {
    for (const z of CARRIAGE_WINDOWS) panes.push(new THREE.BoxGeometry(0.06, 0.62, 0.85).translate(side * 1.16, 2.45, z));
  }
  const windows = new THREE.Mesh(mergeGeometries(panes), windowMat);
  g.add(windows);
  g.userData.windows = windows;

  // Sliding doors at both ends on both sides, with a dark doorway behind them.
  g.userData.doors = [];
  const doorC = new THREE.Color(lowerC).multiplyScalar(0.7).getStyle();
  for (const side of [-1, 1]) {
    for (const end of [-1, 1]) {
      body.push(box(0.03, 1.6, 0.5, C.black, [side * 1.165, 1.72, end * DOOR_Z]));
      const panel = segment([box(0.05, 1.65, 0.52, doorC), box(0.04, 0.05, 0.12, C.gold, [side * 0.03, 0, -end * 0.15])]);
      g.userData.doors.push({ panel: joint(panel, side * 1.19, 1.72, end * DOOR_Z, root), end, side });
    }
  }
  root.add(segment(body));

  for (const z of [-3.15, -2.05, 2.05, 3.15]) for (const x of [-1.0, 1.0]) wheel(0.42, x, z, root, wheels);
  skinFigure(g, root, VERTEX_COLORED);
  return g;
}
