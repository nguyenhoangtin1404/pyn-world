import * as THREE from 'three';
import { WATER_Y } from '../../config.js';
import { Person } from '../people.js';
import { box, ball, cyl, slab, segment } from '../lowpoly.js';
import { WHITE, RED, DARK, smallFish } from './parts.js';

// A rowboat on the calmest open water, away from the steamer's channel, with a fisherman going
// round and round: wait (the bobber nods, now and then a nibble) → bite (yanked under) → reel →
// show the fish → stow it in the bucket → cast again. Faces local +z; y = 0 is the waterline.

const ROWBOAT = [[-0.7, -1.7], [0.7, -1.7], [0.8, -0.6], [0.75, 0.8], [0.35, 1.6], [0, 1.9], [-0.35, 1.6], [-0.75, 0.8], [-0.8, -0.6]];

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

/**
 * @param {{ heightAt: (x: number, z: number) => number, riverX: (z: number) => number, ripples: any,
 *   waterSpots: { x: number, z: number }[], rng: () => number }} o
 * @returns {{ group: THREE.Group, boat: THREE.Group, update(dt: number, t: number): void }}
 */
export function createRowboat({ heightAt, riverX, ripples, waterSpots, rng }) {
  const group = new THREE.Group();
  const v = new THREE.Vector3();
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

  function update(dt, t) {
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
  }

  return { group, boat: rowboat, update };
}
