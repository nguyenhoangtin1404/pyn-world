import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { TRACK_Y, WATER_Y, SEED } from '../config.js';
import { mulberry32 } from '../utils.js';
import { fbm, riverX } from './terrain.js';
import { sweep } from './track.js';
import { lam, box, ball, cyl, cone, prism, shape, Instancer, StaticBatch, VERTEX_COLORED } from './lowpoly.js';
import { Smoke } from './particles.js';

function shadowed(obj) {
  obj.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  return obj;
}

function labelTexture(text) {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#fbf4e2';
  g.fillRect(0, 0, 512, 128);
  g.strokeStyle = '#5a3b2a';
  g.lineWidth = 10;
  g.strokeRect(5, 5, 502, 118);
  g.fillStyle = '#5a3b2a';
  g.font = '600 64px Fredoka, system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, 256, 68);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function heartTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = '#ff5d7a';
  g.beginPath();
  g.moveTo(32, 56);
  g.bezierCurveTo(4, 36, 6, 10, 22, 10);
  g.bezierCurveTo(28, 10, 32, 16, 32, 20);
  g.bezierCurveTo(32, 16, 36, 10, 42, 10);
  g.bezierCurveTo(58, 10, 60, 36, 32, 56);
  g.fill();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const SHEEP_WOOL = '#f4f1ea';
const SHEEP_DARK = '#3a302b';
// The whole flock is drawn with three InstancedMeshes (body, head, leg). Each Sheep only animates
// empty anchors (its group, head pivot and legs); the flock copies their matrices when drawing.
function createFlock(capacity) {
  const part = (geo) => new Instancer(geo, VERTEX_COLORED, capacity * (geo === leg ? 4 : 1));
  const leg = box(0.16, 0.6, 0.16, SHEEP_DARK, [0, -0.3, 0]);
  const flock = {
    body: part(ball(0.8, SHEEP_WOOL, [0, 1.05, 0], { sx: 0.95, sy: 0.85, sz: 1.25 })),
    head: part(mergeGeometries([box(0.42, 0.46, 0.58, SHEEP_DARK, [0, 0, 0.3]), ball(0.26, SHEEP_WOOL, [0, 0.26, 0.15], {}, 0), box(0.8, 0.1, 0.16, SHEEP_DARK, [0, 0.12, 0.12])])),
    leg: part(leg),
  };
  flock.meshes = [flock.body.mesh, flock.head.mesh, flock.leg.mesh];
  return flock;
}

class Sheep {
  constructor(home, rng, heightAt, flock, { fixed = false, heading = 0 } = {}) {
    this.heightAt = heightAt;
    this.rng = rng;
    this.home = home.clone();
    this.pos = home.clone();
    this.heading = fixed ? heading : rng() * Math.PI * 2;
    this.fixed = fixed;
    this.state = 'graze';
    this.timer = rng() * 4;
    this.target = new THREE.Vector3();
    this.phase = rng() * 10;

    // Anchors only — the flock draws them (see createFlock).
    const g = (this.group = new THREE.Group());
    flock.body.add(g);
    this.headPivot = new THREE.Object3D();
    this.headPivot.position.set(0, 1.3, 0.85);
    flock.head.add(this.headPivot);
    this.legs = [];
    for (const [x, z] of [[-0.35, 0.5], [0.35, 0.5], [-0.35, -0.5], [0.35, -0.5]]) {
      const leg = new THREE.Object3D();
      leg.position.set(x, 0.62, z);
      flock.leg.add(leg);
      this.legs.push(leg);
      g.add(leg);
    }
    g.add(this.headPivot);
    this.sync();
  }

  sync() {
    this.pos.y = this.heightAt(this.pos.x, this.pos.z) - 0.05;
    this.group.position.copy(this.pos);
    this.group.rotation.y = this.heading;
  }

  update(dt, time) {
    if (dt === 0) return;
    if (this.fixed) {
      this.headPivot.rotation.x = 0.15 + Math.sin(time * 1.3 + this.phase) * 0.12;
      return;
    }
    this.timer -= dt;
    if (this.state === 'graze') {
      this.headPivot.rotation.x += (0.7 - this.headPivot.rotation.x) * Math.min(1, dt * 3);
      this.legs.forEach((l) => (l.rotation.x = 0));
      if (this.timer < 0) {
        const a = this.rng() * Math.PI * 2;
        const r = this.rng() * 7;
        this.target.set(this.home.x + Math.cos(a) * r, 0, this.home.z + Math.sin(a) * r);
        this.state = 'walk';
      }
    } else {
      this.headPivot.rotation.x += (0 - this.headPivot.rotation.x) * Math.min(1, dt * 3);
      const dx = this.target.x - this.pos.x;
      const dz = this.target.z - this.pos.z;
      const d = Math.hypot(dx, dz);
      const want = Math.atan2(dx, dz);
      let diff = want - this.heading;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      this.heading += diff * Math.min(1, dt * 3);
      const step = Math.min(d, 1.1 * dt);
      this.pos.x += Math.sin(this.heading) * step;
      this.pos.z += Math.cos(this.heading) * step;
      const swing = Math.sin(time * 9 + this.phase) * 0.5;
      this.legs.forEach((l, i) => (l.rotation.x = i % 3 === 0 ? swing : -swing));
      if (d < 0.3) {
        this.state = 'graze';
        this.timer = 2 + this.rng() * 5;
      }
      this.sync();
    }
  }
}

export function buildScenery({ track, terrain, bridges, station, halt, tunnel }) {
  const rng = mulberry32(SEED);
  const heightAt = terrain.heightAt;
  const group = new THREE.Group();
  const updaters = [];
  const obstacles = []; // [x, z, radius]
  const homes = []; // house door positions, used by the villagers

  // Own materials (not the shared cache): they light up at night.
  const windowMat = new THREE.MeshLambertMaterial({ color: '#4a5563', emissive: '#ffcf70', emissiveIntensity: 0, flatShading: true });
  const lampMat = new THREE.MeshLambertMaterial({ color: '#fff4d6', emissive: '#ffd58a', emissiveIntensity: 0, flatShading: true });
  const lamps = [];
  // Station, houses and the windmill tower are baked into one mesh per material.
  const batch = new StaticBatch();

  const f0 = station;
  const sg = Math.sign(f0.side.dot(f0.p)) || 1; // which side of the track faces outward
  const out = f0.side.clone().multiplyScalar(sg);
  const inward = out.clone().negate();

  function spotOK(x, z, clearTrack = 8) {
    if (Math.abs(x) > 285 || Math.abs(z) > 285) return null;
    if (tunnel?.footprint(x, z)) return null; // under the tunnel hill
    const h = heightAt(x, z);
    if (h < WATER_Y + 0.9 || h > 46) return null;
    if (track.distanceTo(x, z) < clearTrack) return null;
    if (Math.abs(x - riverX(z)) < 17) return null;
    if (Math.hypot(x - f0.p.x, z - f0.p.z) < 30) return null;
    for (const [ox, oz, r] of obstacles) if (Math.hypot(x - ox, z - oz) < r) return null;
    return h;
  }

  // ---------- Platforms ----------
  // A platform runs along the track on one side (sgn = ±1 along frame.side) of frame k0, with a
  // ramp at each end so people can walk up. Offsets are in track frames (~1 unit each).
  const M = track.frames.length;
  const PLAT_HALF = 18;
  const RAMP = 6;
  const PLAT_IN = 2.2;
  const PLAT_TOP = 1.0; // relative to TRACK_Y
  const GROUND = -0.4;
  const platMat = lam('#d8c7a6', { side: THREE.DoubleSide });
  const edgeMat = lam('#f2c14e', { side: THREE.DoubleSide });
  const platforms = [];
  function buildPlatform(k0, sgn, pout) {
    const a0 = PLAT_IN * sgn, a1 = pout * sgn;
    const slabAt = (top) => [[a0, -0.6], [a1, -0.6], [a1, top], [a0, top]];
    const start = (k) => (((k0 + k) % M) + M) % M;
    group.add(shadowed(new THREE.Mesh(sweep(track.frames, start(-PLAT_HALF), PLAT_HALF * 2 + 1, slabAt(PLAT_TOP), TRACK_Y), platMat)));
    group.add(new THREE.Mesh(sweep(track.frames, start(-PLAT_HALF), PLAT_HALF * 2 + 1, [[a0, 1.0], [2.7 * sgn, 1.0], [2.7 * sgn, 1.04], [a0, 1.04]], TRACK_Y), edgeMat));
    const rampTop = (k) => PLAT_TOP + (GROUND - PLAT_TOP) * (k / RAMP);
    group.add(shadowed(new THREE.Mesh(sweep(track.frames, start(PLAT_HALF), RAMP + 1, (i) => slabAt(rampTop(i)), TRACK_Y), platMat)));
    group.add(shadowed(new THREE.Mesh(sweep(track.frames, start(-PLAT_HALF - RAMP), RAMP + 1, (i) => slabAt(rampTop(RAMP - i)), TRACK_Y), platMat)));

    const fc = track.frame(k0);
    const frames = [];
    for (let k = -PLAT_HALF - RAMP; k <= PLAT_HALF + RAMP; k++) frames.push({ k, f: track.frame(k0 + k) });
    const reach = PLAT_HALF + RAMP + pout + 2;
    // Walkable height of the platform/ramps at (x, z), or -Infinity when off the platform.
    function height(x, z) {
      if (Math.abs(x - fc.p.x) > reach || Math.abs(z - fc.p.z) > reach) return -Infinity;
      let best = null, bd = Infinity;
      for (const sf of frames) {
        const d = (sf.f.p.x - x) ** 2 + (sf.f.p.z - z) ** 2;
        if (d < bd) {
          bd = d;
          best = sf;
        }
      }
      const f = best.f;
      const s = ((x - f.p.x) * f.side.x + (z - f.p.z) * f.side.z) * sgn;
      if (s < PLAT_IN || s > pout) return -Infinity;
      // Continuous position along the platform (frames are ~1 unit apart) so the ramp is smooth.
      const along = best.k + ((x - f.p.x) * f.t.x + (z - f.p.z) * f.t.z) * (M / track.length);
      const ak = Math.abs(along);
      if (ak <= PLAT_HALF) return TRACK_Y + PLAT_TOP;
      if (ak <= PLAT_HALF + RAMP) return TRACK_Y + rampTop(ak - PLAT_HALF);
      return -Infinity;
    }
    const pl = {
      frame: fc,
      out: fc.side.clone().multiplyScalar(sgn), // horizontal direction from the track to the platform
      height,
      // Random spot on the platform floor (u along, v across, both 0..1).
      point: (u, v) => {
        const f = track.frame(k0 + Math.round(-15 + u * 30));
        return f.p.clone().addScaledVector(f.side, (2.9 + v * (pout - 3.35)) * sgn).setY(TRACK_Y + PLAT_TOP);
      },
      // Places where people wait for the train (between benches and posts).
      spots: (ks, off) => ks.map((k) => {
        const f = track.frame(k0 + k);
        return f.p.clone().addScaledVector(f.side, off * sgn).setY(TRACK_Y + PLAT_TOP);
      }),
    };
    platforms.push(pl);
    return pl;
  }
  const platformHeight = (x, z) => Math.max(...platforms.map((pl) => pl.height(x, z)));

  // ---------- Station ----------
  const PLAT_OUT = 7.95;
  const mainPlat = buildPlatform(0, sg, PLAT_OUT);

  // Static footprints people must walk around: circles {x, z, r} and boxes {x, z, w, d, rot}.
  const colliders = [];

  const st = new THREE.Group();
  st.position.set(f0.p.x, 0, f0.p.z);
  st.rotation.y = Math.atan2(f0.t.x, f0.t.z);
  const ox = -sg; // outward along the station group's local x
  const stRot = st.rotation.y;
  const stWorld = (lx, lz) => ({
    x: f0.p.x + lx * Math.cos(stRot) + lz * Math.sin(stRot),
    z: f0.p.z - lx * Math.sin(stRot) + lz * Math.cos(stRot),
  });
  // The building stands on the platform; its walls reach down to the ground behind it.
  const floor = TRACK_Y + PLAT_TOP;
  batch.at(f0.p.x, 0, f0.p.z, stRot);
  batch.add([
    box(6, 5.8, 13, '#f1e0bf', [ox * 11, floor + 1.5, 0]),
    prism(7.4, 2.4, 14, '#c8453a', [ox * 11, floor + 4.4, 0]),
    box(0.12, 2.4, 1.6, '#6b4a33', [ox * 7.95, floor + 1.2, 0]),
  ]);
  colliders.push({ ...stWorld(ox * 11, 0), w: 6, d: 13, rot: stRot });
  for (const z of [-4.5, -2.2, 2.2, 4.5]) batch.add(box(0.12, 1.2, 1.3, '#4a5563', [ox * 7.95, floor + 2.3, z]), windowMat);
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(5, 1.25), new THREE.MeshLambertMaterial({ map: labelTexture('PYN WORLD') }));
  sign.position.set(ox * 7.9, floor + 3.8, 0);
  sign.rotation.y = -ox * (Math.PI / 2);
  st.add(sign);
  // Canopy over the platform
  batch.add(box(4.6, 0.25, 22, '#c8453a', [ox * 4.3, TRACK_Y + 4.6, 0]));
  for (const z of [-9, -3, 3, 9]) {
    batch.add(cyl(0.12, 0.12, 3.6, '#efe3c6', [ox * 5.8, TRACK_Y + 2.8, z], {}, 6));
    colliders.push({ ...stWorld(ox * 5.8, z), r: 0.2 });
  }
  for (const z of [-6, 6]) {
    // Benches against the station wall, out of the way of people walking along the platform.
    batch.add([box(0.6, 0.5, 2.2, '#7a5236', [ox * 7.5, TRACK_Y + 1.25, z]), box(0.1, 0.5, 2.2, '#7a5236', [ox * 7.82, TRACK_Y + 1.7, z])]);
    colliders.push({ ...stWorld(ox * 7.5, z), w: 0.7, d: 2.2, rot: stRot });
  }
  for (const z of [-15, 0, 15]) {
    const y = z === 0 ? TRACK_Y + 4.2 : TRACK_Y + 4.4;
    if (z !== 0) {
      batch.add(cyl(0.1, 0.14, 3.4, '#3a302b', [ox * 3.2, TRACK_Y + 2.7, z], {}, 6));
      colliders.push({ ...stWorld(ox * 3.2, z), r: 0.2 });
    }
    batch.add(shape(new THREE.SphereGeometry(0.28, 8, 6), '#fff4d6', [ox * 3.2, y, z]), lampMat);
    const light = new THREE.PointLight('#ffd28a', 0, 30, 1.2);
    light.position.set(ox * 3.2, y - 0.4, z);
    st.add(light);
    lamps.push(light);
  }
  shadowed(st);
  group.add(st);

  // Random spots on the platform floor / canopy roof (u along, v across, both 0..1) — for pigeons.
  const platformPoint = mainPlat.point;
  const canopyPoint = (u, v) => {
    const w = stWorld(ox * (2.4 + v * 3.6), -10 + u * 20);
    return new THREE.Vector3(w.x, TRACK_Y + 4.6 + 0.125, w.z);
  };

  // ---------- Village ----------
  // Houses stand on the flat plateau (terrain.village) and are hollow: a doorway in the front wall,
  // a floor, some furniture, and — for two-storey houses — stairs up to the upper floor. The walls
  // are separate colliders, so villagers walk in through the door and out again.
  const walls = ['#f3e6c8', '#e8c9a0', '#f0d8d0', '#d9e4ec', '#efe9d6'];
  const roofs = ['#c8453a', '#8e3b35', '#4f6d8f', '#6b4e3a', '#b0603a'];
  const WOOD = '#8a6038', WOOD_DARK = '#6b4a33', STONE = '#9a9084';
  const STOREY = 3.0; // floor-to-floor height
  const T = 0.2; // wall thickness
  const FLOOR = 0.12; // floor top above the ground outside
  const DOOR_W = 1.8, DOOR_H = 2.3;
  const houseList = []; // {x, z, y, w, d, cos, sin} — for floor height and "indoors"
  // Door leaves swing, so they aren't baked: every leaf in the valley is one instance of the same
  // InstancedMesh, following an anchor on its hinge (rotation.y = how far open).
  const DOOR_COLORS = ['#6b4a33', '#4f6d8f', '#7a3b35', '#3f6b4a', '#8a6038'];
  const doorLeaves = new Instancer(box(DOOR_W / 2 - 0.04, DOOR_H - 0.04, 0.08, '#ffffff', [DOOR_W / 4, (DOOR_H - 0.04) / 2, 0]), VERTEX_COLORED, 96);
  group.add(doorLeaves.mesh);
  const doors = []; // {x, y, z, open, leaves: [left, right]}
  const chimneys = []; // world positions of chimney tops, for the evening smoke
  const houseLocal = (hs, x, z) => {
    const dx = x - hs.x, dz = z - hs.z;
    return { lx: dx * hs.cos - dz * hs.sin, lz: dx * hs.sin + dz * hs.cos };
  };
  const insideHouse = (x, z) => {
    for (const hs of houseList) {
      if (Math.abs(x - hs.x) > hs.r || Math.abs(z - hs.z) > hs.r) continue;
      const { lx, lz } = houseLocal(hs, x, z);
      if (Math.abs(lx) < hs.w / 2 && Math.abs(lz) < hs.d / 2) return hs;
    }
    return null;
  };

  // Adds a house to the batch at (x, h, z) facing +z rotated by `rot`; front (door) is local +z.
  function makeHouse(x, h, z, rot, w, d, floors, { shop = false } = {}) {
    const wall = walls[Math.floor(rng() * walls.length)];
    const roofC = roofs[Math.floor(rng() * roofs.length)];
    const top = FLOOR + floors * STOREY; // top of the walls
    const cos = Math.cos(rot), sin = Math.sin(rot);
    const world = (lx, lz) => ({ x: x + lx * cos + lz * sin, z: z - lx * sin + lz * cos });
    const block = (lx, lz, bw, bd) => colliders.push({ ...world(lx, lz), w: bw, d: bd, rot });
    batch.at(x, h, z, rot);

    // Stone footing (reaches below ground) and a plank floor.
    batch.add([box(w, 0.6, d, STONE, [0, FLOOR - 0.3, 0]), box(w - 2 * T, 0.02, d - 2 * T, '#b58a5a', [0, FLOOR + 0.005, 0])]);
    // Walls: back, sides, and the front split around the doorway.
    const hgt = top - FLOOR, mid = (top + FLOOR) / 2;
    const side = (w - DOOR_W) / 2;
    batch.add([
      box(w, hgt, T, wall, [0, mid, -d / 2 + T / 2]),
      box(T, hgt, d - 2 * T, wall, [-w / 2 + T / 2, mid, 0]),
      box(T, hgt, d - 2 * T, wall, [w / 2 - T / 2, mid, 0]),
      box(side, hgt, T, wall, [-(DOOR_W + side) / 2, mid, d / 2 - T / 2]),
      box(side, hgt, T, wall, [(DOOR_W + side) / 2, mid, d / 2 - T / 2]),
      box(DOOR_W, top - FLOOR - DOOR_H, T, wall, [0, (top + FLOOR + DOOR_H) / 2, d / 2 - T / 2]),
      box(DOOR_W + 0.3, 0.16, T + 0.08, WOOD_DARK, [0, FLOOR + DOOR_H + 0.08, d / 2 - T / 2]), // lintel
      box(DOOR_W + 0.6, 0.06, 1.0, STONE, [0, 0.03, d / 2 + 0.5]), // doorstep
    ]);
    block(0, -d / 2 + T / 2, w, T);
    block(-w / 2 + T / 2, 0, T, d);
    block(w / 2 - T / 2, 0, T, d);
    block(-(DOOR_W + side) / 2, d / 2 - T / 2, side, T);
    block((DOOR_W + side) / 2, d / 2 - T / 2, side, T);
    // Where the leaves end up when open (they swing inward), so nobody walks into them.
    // (Thin on purpose: with the nav padding the doorway must stay over one grid cell wide.)
    block(-DOOR_W / 2 + 0.04, d / 2 - T - 0.45, 0.08, 0.9);
    block(DOOR_W / 2 - 0.04, d / 2 - T - 0.45, 0.08, 0.9);

    // Double door: hinges on the jambs; the right leaf is the left one turned round.
    const hinge = new THREE.Group();
    hinge.position.set(x, h, z);
    hinge.rotation.y = rot;
    group.add(hinge);
    const doorColor = DOOR_COLORS[Math.floor(rng() * DOOR_COLORS.length)];
    const leaves = [-1, 1].map((sd) => {
      const leaf = new THREE.Object3D();
      leaf.position.set((sd * DOOR_W) / 2, FLOOR + 0.02, d / 2 - T / 2);
      leaf.rotation.y = sd < 0 ? 0 : Math.PI;
      hinge.add(leaf);
      doorLeaves.add(leaf, doorColor);
      return leaf;
    });
    const dc = world(0, d / 2);
    doors.push({ x: dc.x, y: h + FLOOR, z: dc.z, cos, sin, open: 0, leaves });

    // Windows go right through the wall, so they show (and glow at night) inside and out.
    for (let k = 0; k < floors; k++) {
      const wy = FLOOR + k * STOREY + 1.55;
      for (const xs of [-1, 1]) {
        batch.add(box(0.9, 0.9, T + 0.08, '#4a5563', [xs * w * 0.3, wy, -d / 2 + T / 2]), windowMat);
        batch.add(box(0.9, 0.9, T + 0.08, '#4a5563', [xs * (DOOR_W / 2 + side / 2), wy, d / 2 - T / 2]), windowMat);
        if (!(floors === 2 && k === 0 && xs < 0)) batch.add(box(T + 0.08, 0.9, 0.9, '#4a5563', [xs * (w / 2 - T / 2), wy, 0]), windowMat); // not behind the stairs
      }
    }
    // Two storeys: a band between the floors outside, the upper floor inside (open over the stairs),
    // and a straight flight of steps along the left wall rising from the front to the back.
    if (floors === 2) {
      const fy = FLOOR + STOREY;
      batch.add([
        box(w + 0.12, 0.2, 0.06, WOOD_DARK, [0, fy, d / 2 + 0.03]),
        box(w + 0.12, 0.2, 0.06, WOOD_DARK, [0, fy, -d / 2 - 0.03]),
        box(0.06, 0.2, d, WOOD_DARK, [w / 2 + 0.03, fy, 0]),
        box(0.06, 0.2, d, WOOD_DARK, [-w / 2 - 0.03, fy, 0]),
      ]);
      const SW = 1.0; // stair width
      const x0 = -w / 2 + T; // left inner face
      batch.add(box(w - 2 * T - SW, 0.2, d - 2 * T, '#b58a5a', [(x0 + SW + w / 2 - T) / 2, fy - 0.1, 0]));
      const n = 10, run = (d - 2 * T - 1.2) / n, rise = STOREY / n;
      const z0 = d / 2 - T - 1.2; // first step (leaves room to turn in from the door)
      const steps = [];
      for (let i = 0; i < n; i++) steps.push(box(SW, (i + 1) * rise, run, WOOD, [x0 + SW / 2, FLOOR + ((i + 1) * rise) / 2, z0 - (i + 0.5) * run]));
      batch.add(steps);
      block(x0 + SW / 2, z0 - (n * run) / 2, SW, n * run);
    }

    // Furniture: a table with two stools in the back right corner, a cupboard or bed on the left.
    const tx = w / 2 - T - 1.0, tz = -d / 2 + T + 0.9;
    batch.add([
      box(1.3, 0.08, 0.9, WOOD, [tx, FLOOR + 0.8, tz]),
      ...[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([a, b]) => box(0.08, 0.76, 0.08, WOOD_DARK, [tx + a * 0.55, FLOOR + 0.38, tz + b * 0.35])),
      cyl(0.22, 0.22, 0.45, WOOD_DARK, [tx - 0.95, FLOOR + 0.225, tz], {}, 6),
      cyl(0.22, 0.22, 0.45, WOOD_DARK, [tx, FLOOR + 0.225, tz + 0.8], {}, 6),
      ball(0.12, '#d9774a', [tx + 0.2, FLOOR + 0.94, tz - 0.1], {}, 0), // a bowl of fruit, more or less
      box(1.6, 0.01, 1.1, roofC, [0.2, FLOOR + 0.01, 0.1]), // rug
    ]);
    block(tx, tz, 1.3, 0.9);
    if (floors === 1) {
      // Bed along the left wall.
      const bx = -w / 2 + T + 0.5, bz = -d / 2 + T + 1.0;
      batch.add([box(1.0, 0.45, 2.0, WOOD, [bx, FLOOR + 0.225, bz]), box(0.9, 0.12, 1.5, '#f1ede3', [bx, FLOOR + 0.5, bz + 0.2]), box(0.7, 0.14, 0.4, '#ffffff', [bx, FLOOR + 0.52, bz - 0.7])]);
      block(bx, bz, 1.0, 2.0);
    }
    // Upstairs gets a bed too (nobody walks there, but it shows through the windows).
    if (floors === 2) {
      const by = FLOOR + STOREY, bx = w / 2 - T - 0.5, bz = 0.2;
      batch.add([box(1.0, 0.45, 2.0, WOOD, [bx, by + 0.225, bz]), box(0.9, 0.12, 1.5, '#f1ede3', [bx, by + 0.5, bz + 0.2])]);
    }

    // Roof and chimney.
    batch.add([
      prism(w + 0.8, 2.0, d + 0.6, roofC, [0, top, 0]),
      box(0.6, 1.6, 0.6, '#8a7a6a', [w * 0.25, top + 1.2, -d * 0.15]),
    ]);
    if (shop) {
      // Shopfront: a striped awning over the door and the windows beside it.
      const awn = [];
      for (let i = 0; i < 6; i++) awn.push(box(w / 6, 0.08, 1.3, i % 2 ? '#f4ead2' : roofC, [-w / 2 + (i + 0.5) * (w / 6), FLOOR + DOOR_H + 0.55, d / 2 + 0.6], { rx: 0.35 }));
      batch.add(awn);
    } else {
      // Lamp over the door.
      batch.add(shape(new THREE.SphereGeometry(0.16, 6, 4), '#fff4d6', [0, FLOOR + DOOR_H + 0.45, d / 2 + 0.2]), lampMat);
    }
    const ch = world(w * 0.25, -d * 0.15);
    chimneys.push({ p: new THREE.Vector3(ch.x, h + top + 2.1, ch.z), acc: rng(), rate: 0.9 + rng() * 0.8 });

    houseList.push({ x, z, y: h + FLOOR, w, d, cos, sin, r: Math.hypot(w, d) / 2 });
    // Where villagers stand when they're "home": inside, a step in from the door.
    // Far enough in that whoever stands there is clear of the door, which then closes behind them.
    const inside = world(0.3, d / 2 - T - 2.5);
    return new THREE.Vector3(inside.x, h + FLOOR, inside.z);
  }

  const village = terrain.village;
  let houses = 0;
  for (let tries = 0; houses < 14 && tries < 800; tries++) {
    const a = village.A0 + 6 + rng() * (village.A1 - village.A0 - 12);
    const b = (rng() - 0.5) * (village.HALF_B - 6) * 2;
    const x = f0.p.x + village.inward.x * a + village.along.x * b;
    const z = f0.p.z + village.inward.z * a + village.along.z * b;
    const h = spotOK(x, z, 12);
    if (h === null) continue;
    if (Math.abs(heightAt(x + 4, z) - h) > 0.15 || Math.abs(heightAt(x - 4, z) - h) > 0.15) continue;
    if (Math.abs(heightAt(x, z + 4) - h) > 0.15 || Math.abs(heightAt(x, z - 4) - h) > 0.15) continue;
    const hw = 5.6 + rng() * 1.6, hd = 5.4 + rng() * 1.4;
    const floors = rng() < 0.5 ? 2 : 1;
    // Square to the world axes, turned towards the station (tidy streets on the flat ground).
    const rot = Math.round(Math.atan2(f0.p.x - x, f0.p.z - z) / (Math.PI / 2)) * (Math.PI / 2);
    homes.push(makeHouse(x, h, z, rot, hw, hd, floors));
    obstacles.push([x, z, 11]);
    houses++;
  }
  // ---------- Halt and town ----------
  // A second stop on the far side of the loop: a short platform with a shelter, and a town street
  // leading inward from it, lined with houses and shops (same houses as the village).
  const hf = halt;
  const sgH = -(Math.sign(hf.side.dot(hf.p)) || 1); // the town side: towards the middle of the loop
  const haltPlat = buildPlatform(Math.round((hf.s / track.length) * M), sgH, 6.5);
  const hRot = Math.atan2(hf.t.x, hf.t.z);
  const oxH = -sgH; // platform side along the halt's local x
  const hWorld = (lx, lz) => ({
    x: hf.p.x + lx * Math.cos(hRot) + lz * Math.sin(hRot),
    z: hf.p.z - lx * Math.sin(hRot) + lz * Math.cos(hRot),
  });
  {
    const floorH = TRACK_Y + PLAT_TOP;
    batch.at(hf.p.x, 0, hf.p.z, hRot);
    batch.add([
      box(0.14, 2.5, 8.4, '#e8d6b0', [oxH * 6.35, floorH + 1.25, 0]), // back wall
      box(2.6, 0.18, 9, '#4f6d8f', [oxH * 5.3, floorH + 2.6, 0], { rz: oxH * 0.12 }), // roof, sloping to the back
      box(0.5, 0.45, 3.2, WOOD, [oxH * 5.95, floorH + 0.225, 0]), // bench
      box(0.08, 0.5, 3.2, WOOD, [oxH * 6.2, floorH + 0.7, 0]),
    ]);
    colliders.push({ ...hWorld(oxH * 6.1, 0), w: 0.9, d: 8.4, rot: hRot });
    for (const z of [-4, 4]) {
      batch.add(cyl(0.1, 0.1, 2.6, '#efe3c6', [oxH * 4.3, floorH + 1.3, z], {}, 6));
      batch.add(shape(new THREE.SphereGeometry(0.22, 8, 6), '#fff4d6', [oxH * 4.3, floorH + 2.35, z]), lampMat);
      colliders.push({ ...hWorld(oxH * 4.3, z), r: 0.2 });
    }
    const hs = new THREE.Group();
    hs.position.set(hf.p.x, 0, hf.p.z);
    hs.rotation.y = hRot;
    const hsign = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 0.9), new THREE.MeshLambertMaterial({ map: labelTexture('PYN TOWN') }));
    hsign.position.set(oxH * 4.2, floorH + 3.3, 0);
    hsign.rotation.y = -oxH * (Math.PI / 2);
    const signPosts = new THREE.Mesh(mergeGeometries([-1.4, 1.4].map((z) => cyl(0.05, 0.05, 0.8, '#3a302b', [oxH * 4.25, floorH + 2.9, z], {}, 5))), VERTEX_COLORED);
    hs.add(hsign, signPosts);
    group.add(shadowed(hs));
  }

  // The street runs inward from the halt, square to the world axes like the village houses.
  const town = terrain.town;
  const U = Math.abs(town.inward.x) > Math.abs(town.inward.z) ? new THREE.Vector3(Math.sign(town.inward.x), 0, 0) : new THREE.Vector3(0, 0, Math.sign(town.inward.z));
  const V = new THREE.Vector3(-U.z, 0, U.x);
  const P0 = hf.p.clone().addScaledVector(town.inward, 13).setY(0);
  const STREET = 58;
  const groundH = heightAt(P0.x, P0.z);
  const cobble = '#b9ab94';
  // Path from the platform to the street, and the street itself.
  batch.at(hf.p.x + town.inward.x * 9.5, groundH, hf.p.z + town.inward.z * 9.5, Math.atan2(town.inward.x, town.inward.z));
  batch.add(box(3.2, 0.04, 7.5, cobble, [0, 0.02, 0]));
  batch.at(P0.x + U.x * (STREET / 2 - 3), groundH, P0.z + U.z * (STREET / 2 - 3), Math.atan2(U.x, U.z));
  batch.add(box(4.6, 0.04, STREET, cobble, [0, 0.02, 0]));
  const townHomes = [];
  for (let i = 0; i < 5; i++) {
    for (const side of [-1, 1]) {
      const c = P0.clone().addScaledVector(U, 5 + i * 11).addScaledVector(V, side * 9.2);
      const h = spotOK(c.x, c.z, 9);
      if (h === null) continue;
      const hw = 5.8 + rng() * 1.2, hd = 5.4 + rng() * 1.0;
      const floors = rng() < 0.75 ? 2 : 1;
      const rot = Math.atan2(-side * V.x, -side * V.z); // front door faces the street
      townHomes.push(makeHouse(c.x, h, c.z, rot, hw, hd, floors, { shop: i < 2 }));
    }
    // Street lamps between the houses.
    for (const side of [-1, 1]) {
      const l = P0.clone().addScaledVector(U, -0.5 + i * 11).addScaledVector(V, side * 3.0);
      batch.at(l.x, groundH, l.z, 0);
      batch.add(cyl(0.07, 0.1, 3.2, '#3a302b', [0, 1.6, 0], {}, 6));
      batch.add(shape(new THREE.SphereGeometry(0.2, 8, 6), '#fff4d6', [0, 3.3, 0]), lampMat);
      colliders.push({ x: l.x, z: l.z, r: 0.2 });
    }
  }
  // Keep trees and rocks off the street and the halt.
  for (let k = 0; k <= STREET; k += 8) {
    const c = P0.clone().addScaledVector(U, k);
    obstacles.push([c.x, c.z, 9]);
  }
  obstacles.push([hf.p.x, hf.p.z, 26]);

  const stations = [
    { frame: f0, out, homes, platformSpots: mainPlat.spots([-12, -3, 3, 12], 4.4), point: mainPlat.point },
    { frame: hf, out: haltPlat.out, homes: townHomes, platformSpots: haltPlat.spots([-13, -8, 8, 13], 3.6), point: haltPlat.point },
  ];

  // Doors swing open while someone is next to them; chimneys smoke in the evening.
  let peopleNear = () => [];
  const lastPos = new WeakMap(); // person position → where it was last frame
  const moving = new Set();
  let evening = 0;
  const chimneySmoke = new Smoke({ n: 200, color: '#e2ddd5', rise: 1.1, drift: 0.5, grow: 1.7, fade: 0.7 });
  group.add(chimneySmoke.group);
  updaters.push((dt) => {
    if (dt === 0) return;
    const people = peopleNear();
    // Who moved this frame: people walking up to (or out of) a door, as opposed to someone
    // standing around just inside.
    moving.clear();
    for (const p of people) {
      const last = lastPos.get(p);
      if (!last || Math.abs(last.x - p.x) + Math.abs(last.z - p.z) > 1e-4) moving.add(p);
      if (last) last.copy(p);
      else lastPos.set(p, p.clone());
    }
    for (const dr of doors) {
      let near = false;
      for (const p of people) {
        const dx = p.x - dr.x, dz = p.z - dr.z;
        if (Math.abs(dx) > 2 || Math.abs(dz) > 2 || Math.abs(p.y - dr.y) > 2) continue;
        // Door-local: lx across the doorway, lz outward (negative = inside the house).
        const lx = dx * dr.cos - dz * dr.sin, lz = dx * dr.sin + dz * dr.cos;
        const approaching = moving.has(p) && Math.abs(lx) < 1.3 && lz > -1.5 && lz < 1.8;
        const inDoorway = Math.abs(lx) < 1 && Math.abs(lz) < 0.8; // never shut the door on anyone
        if (approaching || inDoorway) {
          near = true;
          break;
        }
      }
      const target = near ? 1 : 0;
      if (dr.open === target) continue;
      dr.open = target > dr.open ? Math.min(1, dr.open + dt * 2.8) : Math.max(0, dr.open - dt * 1.4);
      const a = dr.open * 1.45; // swing inward, not quite flat against the wall
      dr.leaves[0].rotation.y = a;
      dr.leaves[1].rotation.y = Math.PI - a;
    }
    if (evening > 0.05) {
      for (const c of chimneys) {
        c.acc += dt * c.rate * evening;
        while (c.acc > 1) {
          c.acc--;
          chimneySmoke.emit(c.p, 0.45);
        }
      }
    }
    chimneySmoke.update(dt);
  });

  // Ground people stand on: terrain, the platform and its ramps, or a house floor.
  const walkHeight = (x, z) => Math.max(heightAt(x, z), platformHeight(x, z), insideHouse(x, z)?.y ?? -Infinity);

  // ---------- Windmill on a hill ----------
  let best = null;
  for (let i = 0; i < 120; i++) {
    const a = rng() * Math.PI * 2;
    const r = 30 + rng() * 70;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    const h = spotOK(x, z, 16);
    if (h !== null && (!best || h > best.h)) best = { x, z, h };
  }
  if (best) {
    const rot = Math.atan2(-best.x, -best.z) + 0.6;
    batch.at(best.x, best.h - 0.5, best.z, rot);
    batch.add([
      cyl(1.4, 2.3, 10, '#f1e3c3', [0, 5, 0], {}, 8),
      cone(2.0, 2.6, '#c8453a', [0, 11.3, 0], {}, 8),
      box(1.0, 1.8, 0.1, '#6b4a33', [0, 0.9, 2.05]),
    ]);
    // Only the sails turn: they stay a separate mesh.
    const blades = [0, 1, 2, 3].map((k) => shape(new THREE.BoxGeometry(1.1, 6.5, 0.1).translate(0.3, 3.4, 0), '#efe3c6', [0, 0, 0], { rz: (k * Math.PI) / 2 }));
    const hub = new THREE.Mesh(mergeGeometries([...blades, cyl(0.35, 0.35, 0.6, '#3a302b', [0, 0, 0], { rx: Math.PI / 2 }, 8)]), VERTEX_COLORED);
    hub.position.set(0, 9.6, 2.0);
    const mill = new THREE.Group();
    mill.position.set(best.x, best.h - 0.5, best.z);
    mill.rotation.y = rot;
    mill.add(hub);
    group.add(shadowed(mill));
    obstacles.push([best.x, best.z, 7]);
    colliders.push({ x: best.x, z: best.z, r: 2.4 });
    updaters.push((dt) => (hub.rotation.z -= dt * 0.7));
  }

  group.add(batch.build());

  // ---------- Sheep ----------
  const sheep = [];
  const flock = createFlock(24);
  group.add(...flock.meshes);
  function meadow(clear = 14) {
    for (let i = 0; i < 400; i++) {
      const a = rng() * Math.PI * 2;
      const r = 20 + rng() * 95;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      const h = spotOK(x, z, clear);
      if (h !== null && h < 16 && fbm(x, z, 3, 0.012, 21.7) < 0) return new THREE.Vector3(x, h, z);
    }
    return null;
  }
  for (let f = 0; f < 3; f++) {
    const home = meadow();
    if (!home) continue;
    obstacles.push([home.x, home.z, 11]);
    for (let k = 0; k < 5; k++) {
      const p = home.clone().add(new THREE.Vector3((rng() - 0.5) * 8, 0, (rng() - 0.5) * 8));
      sheep.push(new Sheep(p, rng, heightAt, flock));
    }
  }

  // Easter egg 1: two sheep in love.
  const courting = meadow(16) || new THREE.Vector3(0, 0, 0);
  obstacles.push([courting.x, courting.z, 8]);
  const aSheep = new Sheep(courting.clone().add(new THREE.Vector3(-0.95, 0, 0)), rng, heightAt, flock, { fixed: true, heading: Math.PI / 2 });
  const bSheep = new Sheep(courting.clone().add(new THREE.Vector3(0.95, 0, 0)), rng, heightAt, flock, { fixed: true, heading: -Math.PI / 2 });
  sheep.push(aSheep, bSheep);
  const heart = new THREE.Sprite(new THREE.SpriteMaterial({ map: heartTexture(), transparent: true }));
  heart.scale.setScalar(1.1);
  group.add(heart);
  updaters.push((dt, t) => {
    heart.position.set(courting.x, heightAt(courting.x, courting.z) + 2.6 + Math.sin(t * 2) * 0.25, courting.z);
    heart.scale.setScalar(1.0 + Math.sin(t * 4) * 0.12);
  });

  // Easter egg 2: a lone sheep watching the river next to the first bridge.
  let bridgeSheepPos = null;
  if (bridges.length) {
    const b = bridges[0];
    search: for (let d = 6; d < 60; d += 2) {
      for (const dir of [1, -1]) {
        for (const sd of [5, -5]) {
          const x = b.center.x + b.tangent.x * d * dir + b.side.x * sd;
          const z = b.center.z + b.tangent.z * d * dir + b.side.z * sd;
          const h = heightAt(x, z);
          if (h > WATER_Y + 1.2 && h < TRACK_Y + 1) {
            bridgeSheepPos = new THREE.Vector3(x, h, z);
            break search;
          }
        }
      }
    }
    if (bridgeSheepPos) {
      const heading = Math.atan2(b.center.x - bridgeSheepPos.x, b.center.z - bridgeSheepPos.z);
      sheep.push(new Sheep(bridgeSheepPos, rng, heightAt, flock, { fixed: true, heading }));
    }
  }
  sheep.forEach((s) => group.add(s.group));
  updaters.push((dt, t) => sheep.forEach((s) => s.update(dt, t)));

  // ---------- Trees ----------
  const trees = [];
  for (let tries = 0; trees.length < 1300 && tries < 24000; tries++) {
    const x = (rng() - 0.5) * 570, z = (rng() - 0.5) * 570;
    if (fbm(x, z, 3, 0.012, 21.7) < -0.05 && rng() > 0.12) continue;
    const h = spotOK(x, z, 7);
    if (h === null) continue;
    trees.push({ x, z, h, pine: h > 12 ? rng() < 0.85 : rng() < 0.45, s: 0.7 + rng() * 0.7, r: rng() * Math.PI * 2 });
  }
  const dummy = new THREE.Object3D();
  function instanced(geo, mat, items, colors) {
    const mesh = new THREE.InstancedMesh(geo, mat, items.length);
    const c = new THREE.Color();
    items.forEach((it, i) => {
      dummy.position.set(it.x, it.h - 0.15, it.z);
      dummy.rotation.set(it.rx || 0, it.r, 0);
      dummy.scale.setScalar(it.s);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      if (colors) mesh.setColorAt(i, c.set(colors[Math.floor(rng() * colors.length)]));
      (it.instances ||= []).push([mesh, i]); // lets clearAround() hide it later
    });
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    return mesh;
  }
  const trunkGeo = new THREE.CylinderGeometry(0.22, 0.34, 1.8, 5).translate(0, 0.9, 0);
  const pineGeo = mergeGeometries([
    new THREE.ConeGeometry(1.7, 3.2, 7).translate(0, 2.9, 0),
    new THREE.ConeGeometry(1.25, 2.6, 7).translate(0, 4.3, 0),
  ]);
  const roundGeo = new THREE.IcosahedronGeometry(1.8, 0).translate(0, 3.2, 0);
  instanced(trunkGeo, lam('#7a5236'), trees);
  instanced(pineGeo, lam('#ffffff'), trees.filter((t) => t.pine), ['#4f8f45', '#5f9e4a', '#3f7d44', '#6c9a3c']);
  instanced(roundGeo, lam('#ffffff'), trees.filter((t) => !t.pine), ['#8cbf55', '#a3c75a', '#7fb34d', '#e0a64a', '#d9774a']);

  // Flowers and rocks
  const flowers = [];
  for (let tries = 0; flowers.length < 900 && tries < 9000; tries++) {
    const x = (rng() - 0.5) * 400, z = (rng() - 0.5) * 400;
    const h = spotOK(x, z, 5);
    if (h === null || h > 18) continue;
    flowers.push({ x, z, h: h + 0.25, s: 0.7 + rng() * 0.6, r: rng() * 6 });
  }
  instanced(new THREE.IcosahedronGeometry(0.2, 0), lam('#ffffff'), flowers, ['#ff8fb1', '#ffd36e', '#ffffff', '#b69cff', '#ff9a5a']).castShadow = false;
  const rocks = [];
  for (let tries = 0; rocks.length < 160 && tries < 4000; tries++) {
    const x = (rng() - 0.5) * 560, z = (rng() - 0.5) * 560;
    const h = spotOK(x, z, 6);
    if (h === null) continue;
    rocks.push({ x, z, h: h + 0.1, s: 0.5 + rng() * 1.6, r: rng() * 6, rx: rng() });
  }
  instanced(new THREE.DodecahedronGeometry(1, 0), lam('#ffffff'), rocks, ['#a79d90', '#978d80', '#b6ab9c']);
  // Low branches and boulders block people too (radius scaled by the instance size).
  for (const t of trees) colliders.push({ x: t.x, z: t.z, r: (t.pine ? 1.1 : 0.8) * t.s, item: t });
  for (const r of rocks) colliders.push({ x: r.x, z: r.z, r: 0.95 * r.s, item: r });

  // Hide trees/rocks within `radius` of any of the points (used to clear hiking trails).
  const hidden = new THREE.Matrix4().makeScale(0, 0, 0);
  function clearAround(points, radius) {
    const touched = new Set();
    for (let i = colliders.length - 1; i >= 0; i--) {
      const c = colliders[i];
      if (!c.item) continue;
      if (!points.some((p) => Math.hypot(p.x - c.x, p.z - c.z) < radius + c.r)) continue;
      for (const [mesh, idx] of c.item.instances) {
        mesh.setMatrixAt(idx, hidden);
        touched.add(mesh);
      }
      colliders.splice(i, 1);
    }
    touched.forEach((m) => (m.instanceMatrix.needsUpdate = true));
  }

  // ---------- Clouds ----------
  // Own material: clouds grey over when it rains. Each cloud is one mesh of merged puffs.
  const cloudMat = new THREE.MeshLambertMaterial({ color: '#ffffff', emissive: '#ffffff', emissiveIntensity: 0.12, flatShading: true });
  const clouds = [];
  for (let i = 0; i < 16; i++) {
    const n = 3 + Math.floor(rng() * 3);
    const puffs = [];
    for (let k = 0; k < n; k++) {
      const x = (k - n / 2) * 4.5 + rng() * 2, y = rng() * 2, z = rng() * 4;
      const s = 3.5 + rng() * 3;
      puffs.push(new THREE.IcosahedronGeometry(1, 1).scale(s, s, s).translate(x, y, z));
    }
    const cg = new THREE.Mesh(mergeGeometries(puffs), cloudMat);
    cg.castShadow = true;
    cg.position.set((rng() - 0.5) * 600, 75 + rng() * 30, (rng() - 0.5) * 600);
    group.add(cg);
    clouds.push(cg);
  }
  updaters.push((dt) => {
    for (const c of clouds) {
      c.position.x += dt * 2.2;
      if (c.position.x > 320) c.position.x -= 640;
    }
  });

  const white = new THREE.Color('#ffffff');
  const grey = new THREE.Color('#8f959c');

  return {
    group,
    spots: { courting, bridgeSheep: bridgeSheepPos || courting },
    homes,
    // Places on the platform where people wait for the train (between benches and posts).
    platformSpots: stations[0].platformSpots,
    // Each stop the train calls at, with the houses around it: the village by the station and the
    // town by the halt. Villagers get off at one and go about their day there.
    stations,
    obstacles,
    colliders,
    walkHeight,
    isIndoors: (x, z) => !!insideHouse(x, z),
    doors, // {x, y, z, open 0..1}
    // Who the doors react to: a function returning current positions (life.js sets it).
    setPeople(fn) {
      peopleNear = fn;
    },
    platformPoint,
    canopyPoint,
    outward: out, // horizontal direction from the track towards the platform
    clearAround,
    update(dt, time) {
      for (const u of updaters) u(dt, time);
    },
    setLights(l) {
      evening = Math.min(1, l * 2);
      windowMat.emissiveIntensity = l * 1.3;
      lampMat.emissiveIntensity = l * 2;
      for (const L of lamps) L.intensity = l * 18;
    },
    setOvercast(o) {
      cloudMat.color.copy(white).lerp(grey, o);
    },
  };
}
