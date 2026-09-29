import * as THREE from 'three';
import { WATER_Y } from '../config.js';
import { riverX } from './terrain.js';
import { Person } from './people.js';
import { box, ball, cyl, torus, slab, segment } from './lowpoly.js';
import { Smoke } from './particles.js';

// A paddle steamer cruising the river, and a rowboat with a fisherman on the lake.
// Both boats face local +z; y = 0 is the waterline.

const turnToward = (heading, want, k) => heading + Math.atan2(Math.sin(want - heading), Math.cos(want - heading)) * k;
const WHITE = '#f4f1ea';
const RED = '#c8453a';
const WOOD = '#a8744a';
const DARK = '#2b2522';

// Rail posts + top rail following an outline between two z limits.
function railing(points, scale, zMin, zMax, y0, h) {
  const parts = [];
  const pts = points.map(([x, z]) => [x * scale, z * scale]);
  for (let i = 0; i < pts.length; i++) {
    const [ax, az] = pts[i];
    const [bx, bz] = pts[(i + 1) % pts.length];
    if (Math.min(az, bz) < zMin || Math.max(az, bz) > zMax) continue;
    const len = Math.hypot(bx - ax, bz - az);
    const n = Math.max(1, Math.round(len / 0.8));
    for (let k = 0; k < n; k++) {
      const t = k / n;
      parts.push(box(0.06, h, 0.06, WHITE, [ax + (bx - ax) * t, y0 + h / 2, az + (bz - az) * t]));
    }
    parts.push(box(0.07, 0.07, len, WHITE, [(ax + bx) / 2, y0 + h, (az + bz) / 2], { ry: Math.atan2(bx - ax, bz - az) }));
  }
  return parts;
}

// ------------------------------------------------------------------ paddle steamer
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

// ------------------------------------------------------------------ rowboat + fisherman
const ROWBOAT = [[-0.7, -1.7], [0.7, -1.7], [0.8, -0.6], [0.75, 0.8], [0.35, 1.6], [0, 1.9], [-0.35, 1.6], [-0.75, 0.8], [-0.8, -0.6]];

function smallFish(color) {
  return segment([
    ball(0.12, color, [0, 0, 0], { sx: 0.55, sy: 0.8, sz: 1.6 }, 0),
    box(0.02, 0.18, 0.14, color, [0, 0, -0.24]),
    ball(0.025, DARK, [0.05, 0.03, 0.12], {}, 0),
    ball(0.025, DARK, [-0.05, 0.03, 0.12], {}, 0),
  ]);
}

function buildRowboat(rng) {
  const g = new THREE.Group();
  g.add(
    segment([
      slab(ROWBOAT, -0.3, -0.18, '#b8885a', 0.9),
      slab(ROWBOAT, -0.28, 0.4, '#8a5a32', 1, 0.86),
      slab(ROWBOAT, 0.12, 0.22, '#2f5d7c', 1.01, 0.9),
      slab(ROWBOAT, 0.4, 0.46, '#6b4a33', 1.03, 0.84),
      box(1.45, 0.08, 0.3, '#c89a6a', [0, 0.25, -0.1]),
      box(1.3, 0.08, 0.25, '#c89a6a', [0, 0.25, 0.9]),
      box(1.28, 0.08, 0.45, '#c89a6a', [0, 0.25, -1.4]),
      // Oars resting along the sides
      cyl(0.03, 0.03, 2.4, '#c89a6a', [0.5, 0.33, 0.2], { rx: Math.PI / 2 }),
      box(0.16, 0.03, 0.5, '#c89a6a', [0.5, 0.33, 1.55]),
      cyl(0.03, 0.03, 2.4, '#c89a6a', [-0.5, 0.33, 0.2], { rx: Math.PI / 2 }),
      box(0.16, 0.03, 0.5, '#c89a6a', [-0.5, 0.33, 1.55]),
      // Bucket and tackle box
      cyl(0.17, 0.14, 0.3, '#8a9096', [0.35, -0.03, -0.95], {}, 10),
      cyl(0.15, 0.15, 0.02, '#3f6f8f', [0.35, 0.1, -0.95], {}, 10),
      box(0.36, 0.18, 0.22, '#3f7d44', [-0.4, -0.08, -1.0]),
      box(0.37, 0.04, 0.23, '#2f5d34', [-0.4, 0.03, -1.0]),
      // Anchor rope over the bow
      cyl(0.02, 0.02, 0.9, '#c9b48a', [0, -0.05, 1.95], { rx: 0.5 }),
      // Lantern on a little stern pole
      cyl(0.025, 0.025, 1.0, DARK, [-0.5, 0.75, -1.55]),
      box(0.14, 0.18, 0.14, '#fff1c8', [-0.5, 1.28, -1.55]),
    ]),
  );

  // Fisherman on the middle thwart, facing out over the right-hand side (+x)
  let fisher;
  do fisher = new Person(rng, { kind: 'villager' });
  while (fisher.carry);
  fisher.sit();
  fisher.shoulders.forEach((s, i) => s.rotation.set(-1.0, 0, i ? 0.2 : -0.2));
  fisher.elbows.forEach((e) => (e.rotation.x = -0.55));
  fisher.group.position.set(0, 0.29 - 0.92 * 0.85, -0.1);
  fisher.group.rotation.y = Math.PI / 2;
  g.add(fisher.group);

  // Rod held in both hands (child of the fisherman so it follows his pose)
  const rod = new THREE.Group();
  rod.position.set(0, 1.12, 0.5);
  rod.add(
    segment([
      cyl(0.035, 0.035, 0.5, '#6b4a33', [0, 0.1, 0]),
      cyl(0.02, 0.008, 3.0, '#3a302b', [0, 1.8, 0], {}, 6),
      cyl(0.07, 0.07, 0.08, '#8a9096', [0, 0.35, 0.07], { rz: Math.PI / 2 }, 10),
    ]),
  );
  const tip = new THREE.Object3D();
  tip.position.y = 3.3;
  rod.add(tip);
  fisher.root.add(rod);

  // Caught fish in the bucket
  const bucketFish = [];
  for (let i = 0; i < 3; i++) {
    const f = smallFish(['#ff8a3d', '#c9d3db', '#f2b632'][i]);
    f.position.set(0.35 + (i - 1) * 0.07, 0.12, -0.95);
    f.rotation.set(-1.2, i * 1.3, 0);
    f.visible = false;
    g.add(f);
    bucketFish.push(f);
  }
  return { group: g, fisher, rod, tip, bucketFish };
}

// ------------------------------------------------------------------ main
export function createBoats({ heightAt, ripples, waterSpots, rng }) {
  const group = new THREE.Group();
  const updaters = [];
  // Funnel smoke: the same pool as the locomotive's, just softer and slower.
  const puffs = new Smoke({ n: 18, color: '#e9e6e0', rise: 1.6, drift: 0.6, grow: 1.4, fade: 0.7 });
  group.add(puffs.group);
  const v = new THREE.Vector3();

  // ---- Steamer on the river
  const st = buildSteamer(rng);
  const steamer = st.group;
  steamer.scale.setScalar(0.9);
  group.add(steamer);
  let boatT = 0.4;
  let heading = 0;
  let wake = 0;
  let smoke = 0;
  const funnelTop = new THREE.Vector3(0, 3.35, -1.9);
  const stern = new THREE.Vector3(0, 0, -5.6);
  const bow = new THREE.Vector3(0, 0, 4.7);
  updaters.push((dt, t) => {
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
  });

  // ---- Rowboat on the calmest open water (away from the steamer's channel)
  const isWater = (x, z) => heightAt(x, z) < WATER_Y - 0.6;
  let spot = null;
  let best = -1;
  for (const s of waterSpots) {
    if (Math.abs(s.x - riverX(s.z)) < 16) continue;
    let clear = 0;
    for (let r = 4; r <= 16; r += 4) {
      let ok = true;
      for (let a = 0; a < 8 && ok; a++) ok = isWater(s.x + Math.cos(a * 0.785) * r, s.z + Math.sin(a * 0.785) * r);
      if (!ok) break;
      clear = r;
    }
    if (clear > best) {
      best = clear;
      spot = s;
    }
  }
  if (!spot) spot = waterSpots[0];

  const rb = buildRowboat(rng);
  const rowboat = rb.group;
  group.add(rowboat);
  const baseHeading = rng() * Math.PI * 2;

  // Fishing line: rod tip → bobber (or hooked fish), with a little sag.
  const LINE_PTS = 16;
  const lineGeo = new THREE.BufferGeometry();
  lineGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(LINE_PTS * 3), 3));
  const line = new THREE.Line(lineGeo, new THREE.LineBasicMaterial({ color: '#3a302b' }));
  line.frustumCulled = false;
  const bobber = segment([ball(0.1, RED, [0, 0.05, 0], {}, 1), ball(0.1, WHITE, [0, -0.04, 0], { sy: 0.7 }, 1), cyl(0.012, 0.012, 0.2, DARK, [0, 0.2, 0])]);
  const hooked = smallFish('#ff8a3d');
  hooked.visible = false;
  group.add(line, bobber, hooked);

  const castLocal = new THREE.Vector3(4.2, 0, -0.1);
  const tipW = new THREE.Vector3();
  const castW = new THREE.Vector3();
  const bobPos = new THREE.Vector3();
  const from = new THREE.Vector3();
  let state = 'wait';
  let timer = 4;
  let caught = 0;
  let nibble = 1;
  let rodAngle = 1.05;
  const REST = 1.05;
  const LIFT = 0.25;

  updaters.push((dt, t) => {
    rowboat.position.set(spot.x, WATER_Y + 0.02 + Math.sin(t * 1.3) * 0.05, spot.z);
    rowboat.rotation.set(Math.sin(t * 0.9) * 0.03, baseHeading + Math.sin(t * 0.05) * 0.25, Math.sin(t * 1.2) * 0.04);
    rowboat.updateMatrixWorld(true);
    rowboat.localToWorld(castW.copy(castLocal));
    castW.y = WATER_Y + 0.25;

    if (dt > 0) timer -= dt;
    let target = REST;
    let sag = 0.35;
    let showBobber = true;
    switch (state) {
      case 'wait':
        bobPos.copy(castW).setY(castW.y + Math.sin(t * 2.2) * 0.04);
        nibble -= dt;
        if (nibble < 0) {
          nibble = 2 + Math.random() * 2;
          ripples.spawn(bobPos.x, bobPos.z, 0.3, 0.45);
        }
        if (timer <= 0) {
          state = 'bite';
          timer = 1.6;
        }
        break;
      case 'bite': {
        // The bobber gets yanked under in little jerks.
        const jerk = Math.sin(t * 20) > 0.3 ? 0.28 : 0.05;
        bobPos.copy(castW).setY(castW.y - jerk);
        target = REST + 0.12;
        sag = 0.05;
        if (dt > 0 && Math.random() < dt * 4) ripples.spawn(bobPos.x, bobPos.z, 0.5, 0.9);
        if (timer <= 0) {
          state = 'reel';
          timer = 1.2;
          ripples.spawn(bobPos.x, bobPos.z, 1.0, 1);
        }
        break;
      }
      case 'reel':
      case 'show':
        target = LIFT;
        sag = 0.02;
        showBobber = false;
        if (state === 'reel' && timer <= 0) {
          state = 'show';
          timer = 2.2;
        } else if (state === 'show' && timer <= 0) {
          state = 'stow';
          timer = 0.9;
          caught++;
          rb.bucketFish.forEach((f, i) => (f.visible = i < caught % 4));
        }
        break;
      case 'stow':
        target = REST - 0.2;
        showBobber = false;
        if (timer <= 0) {
          state = 'cast';
          timer = 1.0;
        }
        break;
      case 'cast': {
        // Bobber arcs out from the rod tip to the water.
        const k = 1 - Math.max(timer, 0) / 1.0;
        bobPos.lerpVectors(from, castW, k);
        bobPos.y += Math.sin(k * Math.PI) * 2.5;
        target = REST - 0.25 + k * 0.25;
        sag = 0.05;
        if (timer <= 0) {
          state = 'wait';
          timer = 7 + Math.random() * 9;
          ripples.spawn(castW.x, castW.z, 0.9, 1);
        }
        break;
      }
    }

    rodAngle += (target - rodAngle) * Math.min(1, dt * (state === 'bite' ? 12 : 5) || 0);
    if (state === 'bite') rb.rod.rotation.x = rodAngle + Math.sin(t * 25) * 0.03;
    else rb.rod.rotation.x = rodAngle;
    rowboat.updateMatrixWorld(true);
    rb.tip.getWorldPosition(tipW);
    if (state === 'stow') from.copy(tipW);

    // Hooked fish dangles from the tip while reeling / showing.
    hooked.visible = !showBobber;
    if (!showBobber) {
      const k = state === 'reel' ? 1 - Math.max(timer, 0) / 1.2 : 1;
      bobPos.lerpVectors(castW, v.copy(tipW).setY(tipW.y - 1.0), k);
      hooked.position.copy(bobPos).setY(bobPos.y - 0.2);
      hooked.rotation.set(Math.PI / 2 - 0.3, t * 2, Math.sin(t * 14) * 0.6);
      if (state === 'stow') hooked.visible = false;
    }
    bobber.visible = showBobber;
    bobber.position.copy(bobPos);

    const arr = lineGeo.attributes.position.array;
    for (let i = 0; i < LINE_PTS; i++) {
      const k = i / (LINE_PTS - 1);
      arr[i * 3] = tipW.x + (bobPos.x - tipW.x) * k;
      arr[i * 3 + 1] = tipW.y + (bobPos.y - tipW.y) * k - Math.sin(k * Math.PI) * sag;
      arr[i * 3 + 2] = tipW.z + (bobPos.z - tipW.z) * k;
    }
    lineGeo.attributes.position.needsUpdate = true;
    line.visible = state !== 'stow';

    rb.fisher.head.rotation.y = state === 'wait' ? Math.sin(t * 0.3) * 0.3 : 0;
  });

  updaters.push((dt) => puffs.update(dt));

  return {
    group,
    spots: { fisherman: rowboat.position, steamer: steamer.position },
    update(dt, t) {
      for (const u of updaters) u(dt, t);
    },
  };
}
