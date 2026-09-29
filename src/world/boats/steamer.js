import * as THREE from 'three';
import { WATER_Y } from '../../config.js';
import { turnToward } from '../../utils.js';
import { Person } from '../people.js';
import { box, ball, cyl, torus, slab, segment } from '../lowpoly.js';
import { WHITE, RED, WOOD, DARK, railing } from './parts.js';

// A paddle steamer going up and down the river (following riverX), with a captain at the wheel and
// a passenger at the bow rail. It faces local +z; y = 0 is the waterline. It leaves a wake of
// ripples and puffs smoke from its funnel into `puffs` (a Smoke shared with the rowboat's scene).

const HULL = [[-1.45, -4.3], [1.45, -4.3], [1.6, -3], [1.6, 1.8], [1.0, 3.6], [0, 4.7], [-1.0, 3.6], [-1.6, 1.8], [-1.6, -3]];

function buildSteamer(rng) {
  const g = new THREE.Group();
  const parts = [
    slab(HULL, -0.6, 0.1, '#b5523b', 0.94),
    slab(HULL, 0.1, 0.75, WHITE),
    slab(HULL, 0.35, 0.47, '#2f5d7c', 1.01),
    slab(HULL, 0.72, 0.84, '#2f3a4a', 1.03),
    slab(HULL, 0.75, 0.8, WOOD, 0.97),
    ...railing(HULL, 0.95, -3.4, 4.8, 0.8, 0.55),

    // Cabin with windows, door and roof
    box(2.3, 1.25, 3.2, '#f1e3c3', [0, 1.42, -1.3]),
    box(2.7, 0.12, 3.6, RED, [0, 2.1, -1.3]),
    box(2.5, 0.08, 3.4, WHITE, [0, 2.19, -1.3]),
    box(0.6, 0.95, 0.04, '#7a4a2e', [0, 1.3, 0.32]),
    ball(0.04, '#d9a441', [0.2, 1.3, 0.35], {}, 0),
    // Wheel station on the fore deck
    box(0.6, 0.55, 0.35, '#7a4a2e', [0, 1.08, 1.45]),
    box(0.62, 0.05, 0.37, '#d9a441', [0, 1.37, 1.45]),
    torus(0.3, 0.035, '#7a4a2e', [0, 1.62, 1.25]),
    box(0.04, 0.62, 0.04, '#7a4a2e', [0, 1.62, 1.25]),
    box(0.62, 0.04, 0.04, '#7a4a2e', [0, 1.62, 1.25]),
    cyl(0.05, 0.05, 0.3, '#7a4a2e', [0, 1.62, 1.35], { rx: Math.PI / 2 }),
    // Funnel with a red band
    cyl(0.26, 0.3, 1.0, DARK, [0, 2.7, -1.9], {}, 12),
    cyl(0.31, 0.31, 0.22, RED, [0, 2.85, -1.9], {}, 12),
    cyl(0.32, 0.28, 0.1, DARK, [0, 3.22, -1.9], {}, 12),
    // Bollards, anchor, bow light
    cyl(0.08, 0.1, 0.25, DARK, [0.8, 0.92, 2.8]),
    cyl(0.08, 0.1, 0.25, DARK, [-0.8, 0.92, 2.8]),
    cyl(0.08, 0.1, 0.25, DARK, [0.9, 0.92, -3.8]),
    cyl(0.08, 0.1, 0.25, DARK, [-0.9, 0.92, -3.8]),
    box(0.05, 0.5, 0.05, DARK, [1.55, 0.35, 3.0]),
    box(0.35, 0.05, 0.05, DARK, [1.55, 0.12, 3.0]),
    cyl(0.03, 0.03, 1.0, DARK, [0, 1.3, 4.3]),
    ball(0.08, '#fff1c8', [0, 1.85, 4.3], {}, 0),
    // Paddle-wheel supports and splash guard
    box(0.12, 0.12, 1.2, DARK, [1.0, 0.6, -4.7]),
    box(0.12, 0.12, 1.2, DARK, [-1.0, 0.6, -4.7]),
    box(2.3, 0.08, 1.6, RED, [0, 1.45, -4.85]),
    // Stern flag pole
    cyl(0.03, 0.03, 1.8, DARK, [0, 2.3, -3.9]),
  ];
  for (const z of [-2.35, -1.65, -0.95, -0.25]) {
    for (const sx of [-1, 1]) {
      parts.push(box(0.04, 0.5, 0.5, '#2f4a5f', [sx * 1.16, 1.58, z]), box(0.05, 0.06, 0.56, WHITE, [sx * 1.17, 1.3, z]));
    }
  }
  for (const sx of [-1, 1]) parts.push(torus(0.26, 0.07, '#e0603f', [sx * 1.2, 1.35, -2.75], { ry: Math.PI / 2 }));
  g.add(segment(parts));

  // Paddle wheel (spins)
  const wheel = new THREE.Group();
  wheel.position.set(0, 0.45, -4.85);
  const wparts = [cyl(0.1, 0.1, 2.0, DARK, [0, 0, 0], { rz: Math.PI / 2 })];
  for (const x of [-0.95, 0.95]) wparts.push(torus(0.95, 0.05, RED, [x, 0, 0], { ry: Math.PI / 2 }));
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    wparts.push(box(1.8, 0.08, 0.42, '#7a4a2e', [0, Math.sin(a) * 0.72, Math.cos(a) * 0.72], { rx: a }));
    for (const x of [-0.95, 0.95]) wparts.push(box(0.05, 0.05, 0.95, RED, [x, Math.sin(a) * 0.47, Math.cos(a) * 0.47], { rx: a + Math.PI / 2 }));
  }
  wheel.add(segment(wparts));
  g.add(wheel);

  // Flag (flutters)
  const flag = segment([box(0.02, 0.36, 0.6, RED, [0, 0, -0.3]), box(0.025, 0.12, 0.6, WHITE, [0, 0, -0.3])]);
  flag.position.set(0, 3.0, -3.9);
  g.add(flag);

  // Crew: captain at the wheel, a passenger at the bow rail
  const captain = new Person(rng, { kind: 'villager' });
  captain.group.position.set(0, 0.8, 0.85);
  captain.shoulders.forEach((s) => s.rotation.set(-0.9, 0, 0));
  captain.elbows.forEach((e) => (e.rotation.x = -0.5));
  const guest = new Person(rng, { kind: 'villager' });
  guest.group.position.set(0.5, 0.8, 3.2);
  guest.group.rotation.y = 0.5;
  g.add(captain.group, guest.group);

  return { group: g, wheel, flag, guest };
}

/**
 * @param {{ riverX: (z: number) => number, ripples: any, puffs: any, rng: () => number }} o
 * @returns {{ group: THREE.Group, update(dt: number, t: number): void }}
 */
export function createSteamer({ riverX, ripples, puffs, rng }) {
  const v = new THREE.Vector3();
  const st = buildSteamer(rng);
  const steamer = st.group;
  steamer.scale.setScalar(0.9);
  let boatT = 0.4;
  let heading = 0;
  let wake = 0;
  let smoke = 0;
  const funnelTop = new THREE.Vector3(0, 3.35, -1.9);
  const stern = new THREE.Vector3(0, 0, -5.6);
  const bow = new THREE.Vector3(0, 0, 4.7);
  function update(dt, t) {
    boatT += dt * 0.018;
    const z = Math.sin(boatT) * 210;
    const vz = Math.cos(boatT) * 210 * 0.018; // world units / s
    const dir = vz >= 0 ? 1 : -1;
    const x = riverX(z);
    heading = turnToward(heading, Math.atan2(riverX(z + dir) - x, dir), Math.min(1, dt * 1.5));
    steamer.position.set(x, WATER_Y + 0.05 + Math.sin(t * 1.6) * 0.05, z);
    steamer.rotation.set(Math.sin(t * 1.1) * 0.015, heading, Math.sin(t * 0.9) * 0.02);
    st.wheel.rotation.x += dt * (0.6 + Math.abs(vz) * 0.5);
    st.flag.rotation.y = Math.sin(t * 5) * 0.25;
    st.guest.idle(t);
    if (dt === 0) return;
    wake -= dt;
    if (wake < 0) {
      wake = 0.35;
      steamer.localToWorld(v.copy(stern));
      ripples.spawn(v.x, v.z, 1.4, 0.8);
      steamer.localToWorld(v.copy(bow));
      ripples.spawn(v.x, v.z, 0.6, 0.5);
    }
    smoke -= dt;
    if (smoke < 0) {
      smoke = 0.45;
      puffs.emit(steamer.localToWorld(v.copy(funnelTop)), 0);
    }
  }

  return { group: steamer, update };
}
