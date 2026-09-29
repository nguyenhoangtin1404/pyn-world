import * as THREE from 'three';
import { box, ball, cone, segment } from './lowpoly.js';

// Pigeons pottering about the station platform, and flocks of birds wheeling across the sky.

const turnToward = (heading, want, k) => heading + Math.atan2(Math.sin(want - heading), Math.cos(want - heading)) * k;
const smooth = (t) => t * t * (3 - 2 * t);

// ------------------------------------------------------------------ pigeons
const PIGEON_BODY = ['#8a93a3', '#9aa2b0', '#7d8696', '#b8b2aa', '#6f7582'];

function buildPigeon(rng) {
  const body = PIGEON_BODY[Math.floor(rng() * PIGEON_BODY.length)];
  const dark = new THREE.Color(body).multiplyScalar(0.7).getStyle();
  const g = new THREE.Group();
  g.add(
    segment([
      ball(0.22, body, [0, 0.28, 0], { sx: 0.8, sy: 0.75, sz: 1.15 }),
      ball(0.12, '#5f8a7a', [0, 0.4, 0.15]), // iridescent neck
      box(0.14, 0.03, 0.24, dark, [0, 0.3, -0.3], { rx: -0.25 }),
      box(0.02, 0.08, 0.2, '#3a3f4a', [0.17, 0.31, -0.04]),
      box(0.02, 0.08, 0.2, '#3a3f4a', [-0.17, 0.31, -0.04]),
      box(0.03, 0.14, 0.03, '#d98a8a', [0.06, 0.07, 0.02]),
      box(0.03, 0.14, 0.03, '#d98a8a', [-0.06, 0.07, 0.02]),
      box(0.05, 0.02, 0.1, '#d98a8a', [0.06, 0.01, 0.05]),
      box(0.05, 0.02, 0.1, '#d98a8a', [-0.06, 0.01, 0.05]),
    ]),
  );
  const head = new THREE.Group();
  head.position.set(0, 0.46, 0.2);
  head.add(
    segment([
      ball(0.085, body, [0, 0.04, 0.03]),
      cone(0.025, 0.09, '#3a302b', [0, 0.03, 0.14], { rx: Math.PI / 2 }, 5),
      ball(0.018, '#e0603f', [0.06, 0.06, 0.07], {}, 0),
      ball(0.018, '#e0603f', [-0.06, 0.06, 0.07], {}, 0),
    ]),
  );
  g.add(head);
  const wings = [];
  for (const side of [-1, 1]) {
    const w = new THREE.Group();
    w.position.set(side * 0.13, 0.36, 0.0);
    w.add(segment([box(0.46, 0.02, 0.24, body, [side * 0.23, 0, -0.02]), box(0.16, 0.021, 0.2, dark, [side * 0.4, 0, -0.04])]));
    g.add(w);
    wings.push(w);
  }
  g.scale.setScalar(0.8);
  return { group: g, head, wings };
}

class Pigeon {
  constructor(rng, place) {
    this.rng = rng;
    this.place = place; // { ground(), roof(), isFree(x, z) }
    Object.assign(this, buildPigeon(rng));
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
function buildBird(color) {
  const g = new THREE.Group();
  g.add(segment([ball(0.3, color, [0, 0, 0], { sx: 0.6, sy: 0.55, sz: 1.6 }), box(0.3, 0.04, 0.35, color, [0, 0, -0.55]), cone(0.06, 0.2, '#e0a64a', [0, 0, 0.55], { rx: Math.PI / 2 }, 4)]));
  const wings = [];
  for (const side of [-1, 1]) {
    const w = new THREE.Group();
    w.add(segment([box(0.8, 0.04, 0.4, color, [side * 0.42, 0, 0]), box(0.5, 0.04, 0.26, color, [side * 1.05, 0, -0.06], { ry: side * 0.25 })]));
    g.add(w);
    wings.push(w);
  }
  g.traverse((o) => o.isMesh && (o.castShadow = false));
  return { group: g, wings };
}

class Flock {
  constructor(rng, { count, color, altitude, radius, speed, formation }) {
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
      const b = buildBird(color);
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
      const flap = flapping ? Math.sin(t * (b.glide ? 9 : 13) + b.flapPhase) * 0.7 : 0.08;
      b.wings[0].rotation.z = flap;
      b.wings[1].rotation.z = -flap;
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
  const pigeons = [];
  for (let i = 0; i < 9; i++) {
    const p = new Pigeon(rng, place);
    p.foldWings();
    pigeons.push(p);
    group.add(p.group);
  }

  const flocks = [
    new Flock(rng, { count: 7, color: '#3a3a44', altitude: 55, radius: 130, speed: 0.05, formation: 'v' }),
    new Flock(rng, { count: 5, color: '#4a4038', altitude: 70, radius: 90, speed: 0.07, formation: 'v' }),
    new Flock(rng, { count: 6, color: '#f4f1ea', altitude: 38, radius: 70, speed: 0.06, formation: 'loose' }),
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
