import * as THREE from 'three';
import { Person } from './people.js';

// Interiors for the passenger carriage and the locomotive cab. They are only made visible while the
// camera sits inside, so the outside view pays nothing for them.
// All coordinates are in the car's local space (+z = forward, y = 0 at rail top).

// A little self-illumination stands in for the light bouncing around inside, since the car body
// shadows the interior from the sun.
const inner = (color, glow = 0.3, extra = {}) =>
  new THREE.MeshLambertMaterial({ color, emissive: color, emissiveIntensity: glow, flatShading: true, ...extra });

function part(parent, w, h, d, mat, x, y, z) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.receiveShadow = true;
  parent.add(m);
  return m;
}

// Window layout shared with the carriage exterior (5 panes per side).
export const CARRIAGE_WINDOWS = [-2.6, -1.3, 0, 1.3, 2.6];
const WIN_BOTTOM = 2.14;
const WIN_TOP = 2.76;
const WIN_HALF = 0.425;

export function buildCarriageInterior(rng) {
  const g = new THREE.Group();
  const wood = inner('#7a4a2e', 0.25);
  const woodLight = inner('#a8744a', 0.25);
  const cream = inner('#f4ead2', 0.35);
  const velvet = inner('#8e3b35', 0.25);
  const brass = inner('#c9a24a', 0.3);
  const dark = inner('#3a302b', 0.2);

  part(g, 2.2, 0.04, 6.9, woodLight, 0, 0.95, 0); // floor
  part(g, 0.5, 0.01, 6.8, inner('#6b2f2a', 0.25), 0, 0.975, 0); // aisle carpet
  part(g, 2.2, 0.04, 6.9, cream, 0, 2.88, 0); // ceiling
  part(g, 0.3, 0.03, 5.8, inner('#fff1c8', 0.9), 0, 2.85, 0); // lamp strip

  for (const sx of [-1, 1]) {
    const x = sx * 1.1;
    // Wall below and above the windows
    part(g, 0.04, WIN_BOTTOM - 0.95, 6.9, wood, x, (0.95 + WIN_BOTTOM) / 2, 0);
    part(g, 0.04, 2.88 - WIN_TOP, 6.9, cream, x, (WIN_TOP + 2.88) / 2, 0);
    // Pillars between the window openings
    const edges = [-3.45, ...CARRIAGE_WINDOWS.flatMap((c) => [c - WIN_HALF, c + WIN_HALF]), 3.45];
    for (let i = 0; i < edges.length; i += 2) {
      const z0 = edges[i], z1 = edges[i + 1];
      part(g, 0.04, WIN_TOP - WIN_BOTTOM, z1 - z0, cream, x, (WIN_BOTTOM + WIN_TOP) / 2, (z0 + z1) / 2);
    }
    part(g, 0.14, 0.04, 6.9, wood, sx * 1.05, WIN_BOTTOM, 0); // window sill
    for (const c of CARRIAGE_WINDOWS) part(g, 0.05, 0.03, 0.85, brass, sx * 1.07, WIN_TOP - 0.12, c); // transom bar
  }

  // End walls with doors
  for (const sz of [-1, 1]) {
    part(g, 2.2, 1.93, 0.04, wood, 0, 1.915, sz * 3.45);
    part(g, 0.7, 1.7, 0.02, dark, 0, 1.8, sz * 3.42);
    part(g, 0.06, 0.06, 0.06, brass, 0.25, 1.75, sz * 3.4);
  }

  // Back-to-back benches with a small table at every window
  for (const c of CARRIAGE_WINDOWS) {
    for (const sx of [-1, 1]) {
      const x = sx * 0.68;
      for (const f of [-1, 1]) {
        const z = c - f * 0.4; // f = +1 → bench faces forward
        part(g, 0.75, 0.45, 0.4, dark, x, 1.18, z);
        part(g, 0.75, 0.14, 0.45, velvet, x, 1.46, z);
        part(g, 0.75, 0.62, 0.1, velvet, x, 1.84, z - f * 0.24);
      }
      part(g, 0.5, 0.05, 0.42, woodLight, sx * 0.8, 1.74, c);
      part(g, 0.05, 0.75, 0.05, dark, sx * 0.8, 1.35, c);
    }
  }

  // Fellow passengers: [side, window index, facing]
  const heads = [];
  const passengers = [[-1, 2, -1, true], [-1, 1, 1], [-1, 3, -1], [1, 4, -1, true], [1, 0, 1], [-1, 4, 1]];
  for (const [sx, k, f, reading] of passengers) {
    const p = new Person(rng, { kind: 'passenger', indoor: true });
    p.group.scale.setScalar(0.9);
    p.sit({ reading });
    // Hips (0.92 × 0.9 above the soles) rest on the cushion, backs against the backrest.
    p.group.position.set(sx * 0.68, 1.55 - 0.92 * 0.9, CARRIAGE_WINDOWS[k] - f * 0.52);
    p.group.rotation.y = f > 0 ? 0 : Math.PI;
    g.add(p.group);
    if (!reading) heads.push(p.head);
  }

  g.visible = false;
  return {
    group: g,
    update(t) {
      heads.forEach((h, i) => (h.rotation.y = Math.sin(t * 0.4 + i * 1.7) * 0.35));
    },
  };
}

// Where the passenger camera sits: the window seat facing forward, right side, middle window.
export const PASSENGER_SEAT = new THREE.Vector3(0.7, 2.32, CARRIAGE_WINDOWS[2] - 0.5);

export function buildCabInterior() {
  const g = new THREE.Group();
  const plate = inner('#24503b', 0.25);
  const wood = inner('#8a6038', 0.25);
  const iron = inner('#2b2522', 0.2);
  const brass = inner('#d9a441', 0.35);
  const roof = inner('#3a302b', 0.2);
  const zc = -1.9; // cab centre

  part(g, 2.1, 0.05, 2.1, wood, 0, 1.22, zc); // floor
  part(g, 2.2, 0.04, 2.2, roof, 0, 3.38, zc); // roof lining

  // Front plate with two "spectacle" windows: x ∈ ±[0.25, 0.95], y ∈ [2.6, 3.2]
  const zf = -0.84;
  part(g, 2.2, 1.4, 0.04, plate, 0, 1.9, zf);
  part(g, 2.2, 0.2, 0.04, plate, 0, 3.3, zf);
  part(g, 0.5, 0.6, 0.04, plate, 0, 2.9, zf);
  for (const sx of [-1, 1]) {
    part(g, 0.15, 0.6, 0.04, plate, sx * 1.025, 2.9, zf);
    // brass window rims
    part(g, 0.72, 0.04, 0.06, brass, sx * 0.6, 2.6, zf);
    part(g, 0.72, 0.04, 0.06, brass, sx * 0.6, 3.2, zf);
    part(g, 0.04, 0.64, 0.06, brass, sx * 0.25, 2.9, zf);
    part(g, 0.04, 0.64, 0.06, brass, sx * 0.95, 2.9, zf);
  }

  // Side walls with a window each: z ∈ [-2.2, -1.1], y ∈ [2.3, 3.2]
  for (const sx of [-1, 1]) {
    const x = sx * 1.08;
    part(g, 0.04, 1.1, 2.2, plate, x, 1.75, zc);
    part(g, 0.04, 0.2, 2.2, plate, x, 3.3, zc);
    part(g, 0.04, 0.9, 0.3, plate, x, 2.75, -0.95);
    part(g, 0.04, 0.9, 0.8, plate, x, 2.75, -2.6);
    part(g, 0.08, 0.05, 1.1, brass, x, 2.3, -1.65);
  }

  // Boiler backhead: firebox door, gauges, regulator, pipes
  part(g, 1.7, 1.3, 0.06, iron, 0, 1.95, -1.13);
  const fireMat = new THREE.MeshLambertMaterial({ color: '#ff8a3d', emissive: '#ff6a1a', emissiveIntensity: 1.2 });
  part(g, 0.5, 0.36, 0.05, fireMat, 0, 1.62, -1.18);
  part(g, 0.62, 0.06, 0.06, brass, 0, 1.84, -1.18);
  for (const x of [-0.3, 0.3]) {
    const bezel = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.05, 16).rotateX(Math.PI / 2), brass);
    bezel.position.set(x, 2.42, -1.18);
    const face = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.02, 16).rotateX(Math.PI / 2), inner('#f7f1e1', 0.6));
    face.position.set(x, 2.42, -1.21);
    const needle = part(g, 0.015, 0.09, 0.01, iron, x, 2.44, -1.225);
    needle.rotation.z = x > 0 ? -0.6 : 0.4;
    g.add(bezel, face);
  }
  const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 1.4, 8).rotateZ(Math.PI / 2), brass);
  pipe.position.set(0, 2.2, -1.19);
  g.add(pipe);
  const lever = part(g, 0.06, 0.55, 0.06, brass, 0.5, 2.3, -1.22);
  lever.rotation.z = -0.5;
  const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.025, 6, 16), inner('#c8453a', 0.3));
  wheel.position.set(0.72, 1.75, -1.3);
  wheel.rotation.y = Math.PI / 2;
  g.add(wheel);

  // Seats for driver (right) and fireman (left)
  for (const sx of [-1, 1]) {
    part(g, 0.45, 0.08, 0.45, inner('#6b2f2a', 0.25), sx * 0.7, 1.95, -2.5);
    part(g, 0.08, 0.7, 0.08, iron, sx * 0.7, 1.6, -2.5);
    part(g, 0.45, 0.4, 0.06, inner('#6b2f2a', 0.25), sx * 0.7, 2.2, -2.72);
  }

  // Heap of coal and a shovel near the back
  const coal = inner('#1f1b19', 0.15);
  for (let i = 0; i < 9; i++) {
    const lump = new THREE.Mesh(new THREE.IcosahedronGeometry(0.18 + (i % 3) * 0.05, 0), coal);
    lump.position.set(-0.2 + (i % 3) * 0.2, 1.33 + Math.floor(i / 3) * 0.08, -2.75 + ((i * 7) % 3) * 0.12);
    g.add(lump);
  }
  const shovel = part(g, 0.05, 0.9, 0.05, wood, -0.55, 1.7, -1.4);
  shovel.rotation.x = 0.35;
  part(g, 0.28, 0.03, 0.3, iron, -0.55, 1.28, -1.22);

  g.visible = false;
  return {
    group: g,
    update(t) {
      fireMat.emissiveIntensity = 1.1 + Math.sin(t * 13) * 0.2 + Math.sin(t * 29) * 0.15;
    },
  };
}

// Driver stands behind the right-hand spectacle window.
export const DRIVER_SEAT = new THREE.Vector3(0.6, 2.97, -2.25);
