import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { box, ball, cone, Instancer, VERTEX_COLORED } from './lowpoly.js';

// Pigeons pottering about the station platform, and flocks of birds wheeling across the sky.

const turnToward = (heading, want, k) => heading + Math.atan2(Math.sin(want - heading), Math.cos(want - heading)) * k;
const smooth = (t) => t * t * (3 - 2 * t);

// ------------------------------------------------------------------ pigeons
// Every pigeon is drawn by four InstancedMeshes (body, head, left wing, right wing); a Pigeon only
// moves empty anchors. A light per-bird tint on top of the vertex colours tells them apart.
const PIGEON_TINTS = ['#ffffff', '#e9e5df', '#d9dee6', '#c7ccd6', '#f1e7da', '#b9bec8'];
const P_BODY = '#9aa2b0', P_DARK = '#6c7482', P_NECK = '#5f8a7a', P_FOOT = '#d98a8a';

function createPigeonParts(capacity) {
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

class Pigeon {
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

// ------------------------------------------------------------------ sky birds
// Five InstancedMeshes for all flocks: body (with head, beak, eyes and a forked tail) and each
// wing in two halves, so the outer half can lag behind the inner one and the wing bends as it
// flaps. Colours are for a gull; each flock tints them (dark starlings, brown swallows…).
function createSkyBirdParts(capacity) {
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

class Flock {
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

// ------------------------------------------------------------------ main
export function createBirds({ rng, scenery, nav, train }) {
  const group = new THREE.Group();
  const floorY = scenery.platformPoint(0.5, 0.5).y;
  // On the platform floor and not under a bench or against a post.
  const isFree = (x, z) => !nav || (nav.isFree(x, z) && Math.abs(nav.height[nav.index(x, z)] - floorY) < 0.1);
  const place = {
    ground: () => {
      let p;
      for (let i = 0; i < 12; i++) {
        p = scenery.platformPoint(rng(), rng());
        if (isFree(p.x, p.z)) break;
      }
      return p;
    },
    roof: () => scenery.canopyPoint(rng(), rng()),
    isFree,
  };
  const pigeonParts = createPigeonParts(9);
  const skyParts = createSkyBirdParts(24);
  group.add(...[...Object.values(pigeonParts), ...Object.values(skyParts)].map((p) => p.mesh));
  const pigeons = [];
  for (let i = 0; i < 9; i++) {
    const p = new Pigeon(rng, place, pigeonParts);
    p.foldWings();
    pigeons.push(p);
    group.add(p.group);
  }

  const flocks = [
    new Flock(rng, skyParts, { count: 7, color: '#3a3a44', altitude: 55, radius: 130, speed: 0.05, formation: 'v' }),
    new Flock(rng, skyParts, { count: 5, color: '#5a4a3c', altitude: 70, radius: 90, speed: 0.07, formation: 'v' }),
    new Flock(rng, skyParts, { count: 6, color: '#ffffff', altitude: 38, radius: 70, speed: 0.06, formation: 'loose' }),
  ];
  flocks.forEach((f) => group.add(f.group));

  const trainThreat = { x: 0, y: 0, z: 0, r: 5 };
  const flockNames = ['Chim sáo (đàn chữ V)', 'Chim nhạn (đàn chữ V)', 'Hải âu'];
  const followables = [
    ...flocks.flatMap((f, i) => f.birds.slice(0, 2).map((b) => ({ label: flockNames[i], anchor: () => b.group }))),
    ...pigeons.map((p, i) => ({ label: `Bồ câu ${i + 1}`, anchor: () => p.group })),
  ];
  return {
    group,
    followables,
    update(dt, t, people, lights) {
      // The locomotive rolling in scares them as well.
      const threats = people;
      if (train && train.v > 0.5) {
        trainThreat.x = train.locoPos.x;
        trainThreat.y = train.locoPos.y + 0.4;
        trainThreat.z = train.locoPos.z;
        threats.push(trainThreat);
      }
      for (const p of pigeons) p.update(dt, t, threats);
      // Birds go to roost at night.
      const day = lights < 0.6;
      for (const f of flocks) {
        f.group.visible = day;
        if (day) f.update(dt, t);
      }
    },
  };
}
