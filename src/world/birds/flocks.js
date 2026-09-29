import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { box, ball, cone, Instancer, VERTEX_COLORED } from '../lowpoly.js';

// Flocks of birds wheeling across the sky: starlings and swallows in a V, gulls in a loose cloud.

// Five InstancedMeshes for all flocks: body (with head, beak, eyes and a forked tail) and each
// wing in two halves, so the outer half can lag behind the inner one and the wing bends as it
// flaps. Colours are for a gull; each flock tints them (dark starlings, brown swallows…).
export function createSkyBirdParts(capacity) {
  const body = mergeGeometries([
    ball(0.3, '#ffffff', [0, 0, 0], { sx: 0.6, sy: 0.55, sz: 1.6 }),
    ball(0.17, '#ffffff', [0, 0.06, 0.5], { sx: 0.9, sy: 0.85, sz: 1.1 }), // head
    cone(0.05, 0.22, '#e0a64a', [0, 0.04, 0.72], { rx: Math.PI / 2 }, 4), // beak
    ball(0.03, '#1b1b22', [0.09, 0.1, 0.58], {}, 0),
    ball(0.03, '#1b1b22', [-0.09, 0.1, 0.58], {}, 0),
    box(0.14, 0.03, 0.34, '#d8dce2', [0.07, 0, -0.62], { ry: 0.3 }), // forked tail
    box(0.14, 0.03, 0.34, '#d8dce2', [-0.07, 0, -0.62], { ry: -0.3 }),
  ]);
  const inner = (sd) => mergeGeometries([box(0.8, 0.04, 0.42, '#e6e9ee', [sd * 0.4, 0, 0]), box(0.8, 0.045, 0.1, '#c9ced6', [sd * 0.4, 0.005, 0.14])]);
  const outer = (sd) => mergeGeometries([box(0.42, 0.04, 0.3, '#e6e9ee', [sd * 0.21, 0, -0.04], { ry: sd * 0.2 }), box(0.22, 0.041, 0.22, '#2e2e33', [sd * 0.5, 0, -0.1], { ry: sd * 0.3 })]);
  const inst = (geo) => new Instancer(geo, VERTEX_COLORED, capacity, { castShadow: false, receiveShadow: false });
  return { body: inst(body), innerL: inst(inner(-1)), innerR: inst(inner(1)), outerL: inst(outer(-1)), outerR: inst(outer(1)) };
}

function buildBird(tint, parts) {
  const g = new THREE.Group();
  parts.body.add(g, tint);
  const wings = [];
  for (const side of [-1, 1]) {
    const w = new THREE.Object3D();
    const tip = new THREE.Object3D();
    tip.position.x = side * 0.8; // the "elbow"
    w.add(tip);
    g.add(w);
    (side < 0 ? parts.innerL : parts.innerR).add(w, tint);
    (side < 0 ? parts.outerL : parts.outerR).add(tip, tint);
    wings.push({ w, tip });
  }
  return { group: g, wings };
}

export class Flock {
  constructor(rng, parts, { count, color, altitude, radius, speed, formation }) {
    this.group = new THREE.Group();
    this.birds = [];
    this.altitude = altitude;
    this.radius = radius;
    this.speed = speed;
    this.phase = rng() * Math.PI * 2;
    this.cx = (rng() - 0.5) * 160;
    this.cz = (rng() - 0.5) * 160;
    this.dir = rng() < 0.5 ? 1 : -1;
    for (let i = 0; i < count; i++) {
      const b = buildBird(color, parts);
      // V formation (or a loose cloud for seagulls)
      const row = Math.ceil(i / 2), side = i % 2 ? 1 : -1;
      b.offset = formation === 'v' ? new THREE.Vector3(side * row * 2.2, (rng() - 0.5) * 0.6, -row * 2.0) : new THREE.Vector3((rng() - 0.5) * 14, (rng() - 0.5) * 5, (rng() - 0.5) * 14);
      b.flapPhase = rng() * 10;
      b.glide = formation !== 'v';
      b.group.scale.setScalar(formation === 'v' ? 1.4 : 1.7);
      this.birds.push(b);
      this.group.add(b.group);
    }
    this.head = new THREE.Vector3();
    this.dirV = new THREE.Vector3();
  }

  update(dt, t) {
    this.phase += dt * this.speed * this.dir;
    const a = this.phase;
    // Wandering loop over the valley
    const r = this.radius * (1 + 0.25 * Math.sin(a * 0.7));
    const x = this.cx + Math.cos(a) * r;
    const z = this.cz + Math.sin(a) * r * 0.8;
    const y = this.altitude + Math.sin(a * 1.3) * 6;
    this.dirV.set(x - this.head.x, 0, z - this.head.z);
    this.head.set(x, y, z);
    const heading = this.dirV.lengthSq() > 1e-8 ? Math.atan2(this.dirV.x, this.dirV.z) : 0;
    const cos = Math.cos(heading), sin = Math.sin(heading);
    const bank = -this.dir * 0.35;
    for (const b of this.birds) {
      const o = b.offset;
      b.group.position.set(x + o.x * cos + o.z * sin, y + o.y + Math.sin(t * 1.3 + b.flapPhase) * 0.4, z - o.x * sin + o.z * cos);
      b.group.rotation.set(0, heading, bank);
      // Flap, then glide for a while
      const cycle = (t * 0.4 + b.flapPhase) % 3;
      const flapping = b.glide ? cycle < 1.2 : cycle < 2.2;
      const w = t * (b.glide ? 9 : 13) + b.flapPhase;
      const flap = flapping ? Math.sin(w) * 0.7 : 0.08;
      const bend = flapping ? Math.sin(w - 0.9) * 0.45 : -0.05; // the outer wing trails the stroke
      b.wings[0].w.rotation.z = flap;
      b.wings[1].w.rotation.z = -flap;
      b.wings[0].tip.rotation.z = bend;
      b.wings[1].tip.rotation.z = -bend;
    }
  }
}
