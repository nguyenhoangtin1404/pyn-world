import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { turnToward } from '../../utils.js';
import { box, ball, cone, Instancer, VERTEX_COLORED } from '../lowpoly.js';

// Pigeons pottering about a station platform: pecking at crumbs, waddling, head-bobbing, and
// fluttering off — along the platform or up onto the canopy — when someone comes too close.

const smooth = (t) => t * t * (3 - 2 * t);

// Every pigeon is drawn by four InstancedMeshes (body, head, left wing, right wing); a Pigeon only
// moves empty anchors. A light per-bird tint on top of the vertex colours tells them apart.
const PIGEON_TINTS = ['#ffffff', '#e9e5df', '#d9dee6', '#c7ccd6', '#f1e7da', '#b9bec8'];
const P_BODY = '#9aa2b0', P_DARK = '#6c7482', P_NECK = '#5f8a7a', P_FOOT = '#d98a8a';

export function createPigeonParts(capacity) {
  const merge = (parts) => mergeGeometries(parts);
  const body = merge([
    ball(0.22, P_BODY, [0, 0.28, 0], { sx: 0.8, sy: 0.75, sz: 1.15 }),
    ball(0.16, '#b3bac6', [0, 0.23, 0.08], { sx: 0.85, sy: 0.7, sz: 1 }), // paler breast
    ball(0.12, P_NECK, [0, 0.4, 0.15]), // iridescent neck
    ball(0.1, '#8a6fa0', [0, 0.36, 0.2], { sx: 1, sy: 0.7, sz: 0.8 }, 0), // purple sheen
    // Tail fan: three feathers, dark band at the tip.
    box(0.07, 0.025, 0.26, P_DARK, [0, 0.3, -0.33], { rx: -0.2 }),
    box(0.07, 0.025, 0.24, P_DARK, [0.06, 0.3, -0.31], { rx: -0.2, ry: 0.25 }),
    box(0.07, 0.025, 0.24, P_DARK, [-0.06, 0.3, -0.31], { rx: -0.2, ry: -0.25 }),
    box(0.19, 0.03, 0.05, '#3a3f4a', [0, 0.27, -0.45], { rx: -0.2 }),
    // Legs and three-toed feet.
    box(0.03, 0.14, 0.03, P_FOOT, [0.06, 0.07, 0.02]),
    box(0.03, 0.14, 0.03, P_FOOT, [-0.06, 0.07, 0.02]),
    ...[-1, 1].flatMap((sd) => [-0.35, 0, 0.35].map((ry) => box(0.02, 0.02, 0.09, P_FOOT, [sd * 0.06 + Math.sin(ry) * 0.04, 0.01, 0.05 + Math.cos(ry) * 0.02], { ry }))),
  ]);
  const head = merge([
    ball(0.085, P_BODY, [0, 0.04, 0.03]),
    cone(0.025, 0.09, '#3a302b', [0, 0.03, 0.14], { rx: Math.PI / 2 }, 5), // beak
    ball(0.022, '#f1eee6', [0, 0.055, 0.1], { sx: 1.2, sy: 0.7 }, 0), // white cere
    ...[-1, 1].flatMap((sd) => [
      ball(0.022, '#e8752f', [sd * 0.062, 0.06, 0.06], {}, 0), // orange eye
      ball(0.011, '#111111', [sd * 0.078, 0.062, 0.066], {}, 0), // pupil
    ]),
  ]);
  // Wings: grey with two dark bars and dark primaries at the tip.
  const wing = (sd) =>
    merge([
      box(0.46, 0.02, 0.24, P_BODY, [sd * 0.23, 0, -0.02]),
      box(0.3, 0.022, 0.035, '#454b57', [sd * 0.2, 0, -0.05]),
      box(0.3, 0.022, 0.035, '#454b57', [sd * 0.2, 0, -0.11]),
      box(0.16, 0.021, 0.2, P_DARK, [sd * 0.4, 0, -0.04]),
    ]);
  const inst = (geo) => new Instancer(geo, VERTEX_COLORED, capacity);
  return { body: inst(body), head: inst(head), wingL: inst(wing(-1)), wingR: inst(wing(1)) };
}

function buildPigeon(rng, parts) {
  const tint = PIGEON_TINTS[Math.floor(rng() * PIGEON_TINTS.length)];
  const g = new THREE.Group();
  parts.body.add(g, tint);
  const head = new THREE.Object3D();
  head.position.set(0, 0.46, 0.2);
  g.add(head);
  parts.head.add(head, tint);
  const wings = [];
  for (const side of [-1, 1]) {
    const w = new THREE.Object3D();
    w.position.set(side * 0.13, 0.36, 0.0);
    g.add(w);
    (side < 0 ? parts.wingL : parts.wingR).add(w, tint);
    wings.push(w);
  }
  g.scale.setScalar(0.8);
  return { group: g, head, wings };
}

// `place`: { ground(), roof() → a random spot on the platform / canopy, isFree(x, z) }.
export class Pigeon {
  constructor(rng, place, parts) {
    this.rng = rng;
    this.place = place; // { ground(), roof(), isFree(x, z) }
    Object.assign(this, buildPigeon(rng, parts));
    this.pos = place.ground();
    this.heading = rng() * Math.PI * 2;
    this.state = 'peck';
    this.timer = rng() * 3;
    this.target = new THREE.Vector3();
    this.phase = rng() * 10;
    this.fly = null;
    this.onRoof = false;
    this.sync();
  }

  sync() {
    this.group.position.copy(this.pos);
    this.group.rotation.y = this.heading;
  }

  takeOff(to) {
    const from = this.pos.clone();
    const mid = from.clone().lerp(to, 0.5);
    mid.y = Math.max(from.y, to.y) + 2 + from.distanceTo(to) * 0.15;
    this.fly = { from, mid, to, k: 0, dur: Math.max(1.2, from.distanceTo(to) / 5) };
    this.state = 'fly';
  }

  // Folded: each wing swings back (±90° about y) to lie along the bird's back, tips at the tail.
  foldWings() {
    this.wings.forEach((w, i) => {
      const side = i ? 1 : -1;
      w.scale.set(0.62, 1, 0.85);
      w.position.y = 0.4;
      w.rotation.set(0, side * 1.45, 0);
    });
  }

  update(dt, t, threats) {
    if (dt === 0) return;
    const { rng } = this;

    if (this.state === 'fly') {
      const f = this.fly;
      f.k = Math.min(1, f.k + dt / f.dur);
      const k = smooth(f.k);
      // Quadratic Bézier arc
      const a = f.from.clone().lerp(f.mid, k);
      const b = f.mid.clone().lerp(f.to, k);
      const p = a.lerp(b, k);
      const dx = p.x - this.pos.x, dz = p.z - this.pos.z;
      if (dx * dx + dz * dz > 1e-6) this.heading = Math.atan2(dx, dz);
      this.pos.copy(p);
      const flap = Math.sin(t * 28 + this.phase) * 0.9;
      this.wings.forEach((w, i) => {
        w.scale.set(1, 1, 1);
        w.position.y = 0.36;
        w.rotation.set(0, 0, (i ? -1 : 1) * flap);
      });
      this.head.rotation.x = 0;
      if (f.k >= 1) {
        this.state = 'peck';
        this.timer = this.onRoof ? 6 + rng() * 10 : 1 + rng() * 3;
        this.foldWings();
      }
      this.sync();
      return;
    }

    // Startled by someone walking too close (or the train pulling in)?
    if (!this.onRoof) {
      for (const p of threats) {
        if ((p.x - this.pos.x) ** 2 + (p.z - this.pos.z) ** 2 < (p.r || 1.8) ** 2 && Math.abs(p.y - this.pos.y) < 1.5) {
          // Most flutter a few metres along the platform, some go up onto the canopy.
          this.onRoof = rng() < 0.4;
          this.takeOff(this.onRoof ? this.place.roof() : this.place.ground());
          return;
        }
      }
    }

    this.timer -= dt;
    if (this.state === 'peck') {
      // Quick pecks at crumbs
      const peck = Math.max(0, Math.sin(t * 9 + this.phase));
      this.head.rotation.x = peck * 1.1;
      if (this.timer < 0) {
        if (this.onRoof && rng() < 0.5) {
          this.onRoof = false;
          this.takeOff(this.place.ground());
          return;
        }
        // Waddle to a nearby spot
        const a = rng() * Math.PI * 2, r = 0.6 + rng() * 1.6;
        this.target.set(this.pos.x + Math.cos(a) * r, this.pos.y, this.pos.z + Math.sin(a) * r);
        if (this.onRoof || this.place.isFree(this.target.x, this.target.z)) this.state = 'walk';
        this.timer = 1 + rng() * 3;
        if (this.onRoof) this.state = 'peck';
      }
    } else if (this.state === 'walk') {
      const dx = this.target.x - this.pos.x, dz = this.target.z - this.pos.z;
      const d = Math.hypot(dx, dz);
      this.heading = turnToward(this.heading, Math.atan2(dx, dz), Math.min(1, dt * 6));
      const s = Math.min(d, 0.6 * dt);
      this.pos.x += (dx / (d || 1)) * s;
      this.pos.z += (dz / (d || 1)) * s;
      // The famous pigeon head-bob
      this.head.position.z = 0.2 + Math.sin(t * 14 + this.phase) * 0.05;
      this.head.rotation.x = 0;
      if (d < 0.05 || this.timer < 0) {
        this.state = 'peck';
        this.timer = 1.5 + rng() * 4;
        this.head.position.z = 0.2;
      }
    }
    this.sync();
  }
}
