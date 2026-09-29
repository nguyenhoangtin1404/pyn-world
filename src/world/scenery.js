import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { TRACK_Y, WATER_Y, SEED } from '../config.js';
import { mulberry32 } from '../utils.js';
import { fbm, riverX } from './terrain.js';
import { sweep } from './track.js';

const lam = (color, extra = {}) => new THREE.MeshLambertMaterial({ color, flatShading: true, ...extra });

function at(obj, x, y, z) {
  obj.position.set(x, y, z);
  return obj;
}

function shadowed(obj) {
  obj.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  return obj;
}

function prismRoof(w, h, d, mat) {
  const shape = new THREE.Shape();
  shape.moveTo(-w / 2, 0);
  shape.lineTo(w / 2, 0);
  shape.lineTo(0, h);
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, { depth: d, bevelEnabled: false });
  geo.translate(0, 0, -d / 2);
  return new THREE.Mesh(geo, mat);
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

const SHEEP_WOOL = lam('#f4f1ea');
const SHEEP_DARK = lam('#3a302b');

class Sheep {
  constructor(home, rng, heightAt, { fixed = false, heading = 0 } = {}) {
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

    const g = (this.group = new THREE.Group());
    const body = new THREE.Mesh(new THREE.IcosahedronGeometry(0.8, 1), SHEEP_WOOL);
    body.scale.set(0.95, 0.85, 1.25);
    body.position.y = 1.05;
    this.headPivot = new THREE.Group();
    this.headPivot.position.set(0, 1.3, 0.85);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.46, 0.58), SHEEP_DARK);
    head.position.set(0, 0, 0.3);
    const tuft = new THREE.Mesh(new THREE.IcosahedronGeometry(0.26, 0), SHEEP_WOOL);
    tuft.position.set(0, 0.26, 0.15);
    const ears = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.1, 0.16), SHEEP_DARK);
    ears.position.set(0, 0.12, 0.12);
    this.headPivot.add(head, tuft, ears);
    this.legs = [];
    for (const [x, z] of [[-0.35, 0.5], [0.35, 0.5], [-0.35, -0.5], [0.35, -0.5]]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.6, 0.16).translate(0, -0.3, 0), SHEEP_DARK);
      leg.position.set(x, 0.62, z);
      this.legs.push(leg);
      g.add(leg);
    }
    g.add(body, this.headPivot);
    shadowed(g);
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

export function buildScenery({ track, terrain, bridges, station, tunnel }) {
  const rng = mulberry32(SEED);
  const heightAt = terrain.heightAt;
  const group = new THREE.Group();
  const updaters = [];
  const obstacles = []; // [x, z, radius]
  const homes = []; // house door positions, used by the villagers

  const windowMat = lam('#4a5563', { emissive: '#ffcf70', emissiveIntensity: 0 });
  const lampMat = lam('#fff4d6', { emissive: '#ffd58a', emissiveIntensity: 0 });
  const lamps = [];

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

  // ---------- Station ----------
  // The platform runs from the track edge right up to the building, with a ramp at each end so
  // people can walk up. PLAT_* are frame offsets from the station frame.
  const M = track.frames.length;
  const PLAT_HALF = 18;
  const RAMP = 6;
  const PLAT_IN = 2.2, PLAT_OUT = 7.95;
  const PLAT_TOP = 1.0; // relative to TRACK_Y
  const GROUND = -0.4;
  const platMat = lam('#d8c7a6', { side: THREE.DoubleSide });
  const a0 = PLAT_IN * sg, a1 = PLAT_OUT * sg;
  const slabAt = (top) => [[a0, -0.6], [a1, -0.6], [a1, top], [a0, top]];
  group.add(shadowed(new THREE.Mesh(sweep(track.frames, M - PLAT_HALF, PLAT_HALF * 2 + 1, slabAt(PLAT_TOP), TRACK_Y), platMat)));
  group.add(new THREE.Mesh(sweep(track.frames, M - PLAT_HALF, PLAT_HALF * 2 + 1, [[a0, 1.0], [2.7 * sg, 1.0], [2.7 * sg, 1.04], [a0, 1.04]], TRACK_Y), lam('#f2c14e', { side: THREE.DoubleSide })));
  const rampTop = (k) => PLAT_TOP + (GROUND - PLAT_TOP) * (k / RAMP);
  group.add(shadowed(new THREE.Mesh(sweep(track.frames, PLAT_HALF, RAMP + 1, (i) => slabAt(rampTop(i)), TRACK_Y), platMat)));
  group.add(shadowed(new THREE.Mesh(sweep(track.frames, M - PLAT_HALF - RAMP, RAMP + 1, (i) => slabAt(rampTop(RAMP - i)), TRACK_Y), platMat)));

  // Walkable height of the platform/ramps at (x, z), or -Infinity when off the platform.
  const stationFrames = [];
  for (let k = -PLAT_HALF - RAMP; k <= PLAT_HALF + RAMP; k++) stationFrames.push({ k, f: track.frame(k) });
  function platformHeight(x, z) {
    if (Math.hypot(x - f0.p.x, z - f0.p.z) > PLAT_HALF + RAMP + PLAT_OUT + 2) return -Infinity;
    let best = null, bd = Infinity;
    for (const sf of stationFrames) {
      const d = (sf.f.p.x - x) ** 2 + (sf.f.p.z - z) ** 2;
      if (d < bd) {
        bd = d;
        best = sf;
      }
    }
    const f = best.f;
    const s = ((x - f.p.x) * f.side.x + (z - f.p.z) * f.side.z) * sg;
    if (s < PLAT_IN || s > PLAT_OUT) return -Infinity;
    // Continuous position along the platform (frames are ~1 unit apart) so the ramp is smooth.
    const along = best.k + ((x - f.p.x) * f.t.x + (z - f.p.z) * f.t.z) * (M / track.length);
    const ak = Math.abs(along);
    if (ak <= PLAT_HALF) return TRACK_Y + PLAT_TOP;
    if (ak <= PLAT_HALF + RAMP) return TRACK_Y + rampTop(ak - PLAT_HALF);
    return -Infinity;
  }
  const walkHeight = (x, z) => Math.max(heightAt(x, z), platformHeight(x, z));

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
  st.add(at(new THREE.Mesh(new THREE.BoxGeometry(6, 5.8, 13), lam('#f1e0bf')), ox * 11, floor + 1.5, 0));
  colliders.push({ ...stWorld(ox * 11, 0), w: 6, d: 13, rot: stRot });
  const roof = prismRoof(7.4, 2.4, 14, lam('#c8453a'));
  roof.rotation.y = 0;
  roof.position.set(ox * 11, floor + 4.4, 0);
  st.add(roof);
  st.add(at(new THREE.Mesh(new THREE.BoxGeometry(0.12, 2.4, 1.6), lam('#6b4a33')), ox * 7.95, floor + 1.2, 0));
  for (const z of [-4.5, -2.2, 2.2, 4.5]) {
    st.add(at(new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.2, 1.3), windowMat), ox * 7.95, floor + 2.3, z));
  }
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(5, 1.25), new THREE.MeshLambertMaterial({ map: labelTexture('PYN WORLD') }));
  sign.position.set(ox * 7.9, floor + 3.8, 0);
  sign.rotation.y = -ox * (Math.PI / 2);
  st.add(sign);
  // Canopy over the platform
  st.add(at(new THREE.Mesh(new THREE.BoxGeometry(4.6, 0.25, 22), lam('#c8453a')), ox * 4.3, TRACK_Y + 4.6, 0));
  for (const z of [-9, -3, 3, 9]) {
    st.add(at(new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 3.6, 6), lam('#efe3c6')), ox * 5.8, TRACK_Y + 2.8, z));
    colliders.push({ ...stWorld(ox * 5.8, z), r: 0.2 });
  }
  for (const z of [-6, 6]) {
    // Benches against the station wall, out of the way of people walking along the platform.
    st.add(at(new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.5, 2.2), lam('#7a5236')), ox * 7.5, TRACK_Y + 1.25, z));
    st.add(at(new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.5, 2.2), lam('#7a5236')), ox * 7.82, TRACK_Y + 1.7, z));
    colliders.push({ ...stWorld(ox * 7.5, z), w: 0.7, d: 2.2, rot: stRot });
  }
  for (const z of [-15, 0, 15]) {
    const y = z === 0 ? TRACK_Y + 4.2 : TRACK_Y + 4.4;
    if (z !== 0) {
      st.add(at(new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.14, 3.4, 6), lam('#3a302b')), ox * 3.2, TRACK_Y + 2.7, z));
      colliders.push({ ...stWorld(ox * 3.2, z), r: 0.2 });
    }
    st.add(at(new THREE.Mesh(new THREE.SphereGeometry(0.28, 8, 6), lampMat), ox * 3.2, y, z));
    const light = new THREE.PointLight('#ffd28a', 0, 30, 1.2);
    light.position.set(ox * 3.2, y - 0.4, z);
    st.add(light);
    lamps.push(light);
  }
  shadowed(st);
  group.add(st);

  // Random spots on the platform floor / canopy roof (u along, v across, both 0..1) — for pigeons.
  const platformPoint = (u, v) => {
    const f = track.frame(Math.round(-15 + u * 30));
    return f.p.clone().addScaledVector(f.side, (2.9 + v * 4.6) * sg).setY(TRACK_Y + PLAT_TOP);
  };
  const canopyPoint = (u, v) => {
    const w = stWorld(ox * (2.4 + v * 3.6), -10 + u * 20);
    return new THREE.Vector3(w.x, TRACK_Y + 4.6 + 0.125, w.z);
  };

  // ---------- Village ----------
  const walls = ['#f3e6c8', '#e8c9a0', '#f0d8d0', '#d9e4ec', '#efe9d6'];
  const roofs = ['#c8453a', '#8e3b35', '#4f6d8f', '#6b4e3a', '#b0603a'];
  function makeHouse(w, d) {
    const h = new THREE.Group();
    h.add(at(new THREE.Mesh(new THREE.BoxGeometry(w, 3.2, d), lam(walls[Math.floor(rng() * walls.length)])), 0, 1.6, 0));
    const r = prismRoof(w + 0.8, 2.0, d + 0.6, lam(roofs[Math.floor(rng() * roofs.length)]));
    r.position.y = 3.2;
    h.add(r);
    h.add(at(new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.6, 0.6), lam('#8a7a6a')), w * 0.25, 4.4, d * 0.15));
    h.add(at(new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.6, 0.08), lam('#6b4a33')), 0, 0.8, d / 2 + 0.03));
    for (const zs of [1, -1]) {
      for (const xs of [-1, 1]) {
        h.add(at(new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.9, 0.08), windowMat), xs * w * 0.28, 2.0, zs * (d / 2 + 0.03)));
      }
    }
    return shadowed(h);
  }
  let houses = 0;
  for (let tries = 0; houses < 14 && tries < 800; tries++) {
    const a = 34 + rng() * 55;
    const b = (rng() - 0.5) * 120;
    const x = f0.p.x + inward.x * a + f0.t.x * b;
    const z = f0.p.z + inward.z * a + f0.t.z * b;
    const h = spotOK(x, z, 10);
    if (h === null) continue;
    if (Math.abs(heightAt(x + 3, z) - heightAt(x - 3, z)) > 1.6 || Math.abs(heightAt(x, z + 3) - heightAt(x, z - 3)) > 1.6) continue;
    const hw = 4 + rng() * 2, hd = 4 + rng() * 1.5;
    const house = makeHouse(hw, hd);
    house.position.set(x, h - 0.3, z);
    house.rotation.y = Math.atan2(f0.p.x - x, f0.p.z - z);
    group.add(house);
    colliders.push({ x, z, w: hw + 0.8, d: hd + 0.6, rot: house.rotation.y }); // + roof overhang
    obstacles.push([x, z, 8]);
    homes.push(new THREE.Vector3(x, h, z).addScaledVector(new THREE.Vector3(f0.p.x - x, 0, f0.p.z - z).normalize(), 4));
    houses++;
  }

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
    const mill = new THREE.Group();
    mill.add(at(new THREE.Mesh(new THREE.CylinderGeometry(1.4, 2.3, 10, 8), lam('#f1e3c3')), 0, 5, 0));
    mill.add(at(new THREE.Mesh(new THREE.ConeGeometry(2.0, 2.6, 8), lam('#c8453a')), 0, 11.3, 0));
    mill.add(at(new THREE.Mesh(new THREE.BoxGeometry(1.0, 1.8, 0.1), lam('#6b4a33')), 0, 0.9, 2.05));
    const hub = new THREE.Group();
    hub.position.set(0, 9.6, 2.0);
    for (let k = 0; k < 4; k++) {
      const blade = new THREE.Mesh(new THREE.BoxGeometry(1.1, 6.5, 0.1).translate(0.3, 3.4, 0), lam('#efe3c6'));
      blade.rotation.z = (k * Math.PI) / 2;
      hub.add(blade);
    }
    hub.add(new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.6, 8).rotateX(Math.PI / 2), lam('#3a302b')));
    mill.add(hub);
    mill.position.set(best.x, best.h - 0.5, best.z);
    mill.rotation.y = Math.atan2(-best.x, -best.z) + 0.6;
    group.add(shadowed(mill));
    obstacles.push([best.x, best.z, 7]);
    colliders.push({ x: best.x, z: best.z, r: 2.4 });
    updaters.push((dt) => (hub.rotation.z -= dt * 0.7));
  }

  // ---------- Sheep ----------
  const sheep = [];
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
      sheep.push(new Sheep(p, rng, heightAt));
    }
  }

  // Easter egg 1: two sheep in love.
  const courting = meadow(16) || new THREE.Vector3(0, 0, 0);
  obstacles.push([courting.x, courting.z, 8]);
  const aSheep = new Sheep(courting.clone().add(new THREE.Vector3(-0.95, 0, 0)), rng, heightAt, { fixed: true, heading: Math.PI / 2 });
  const bSheep = new Sheep(courting.clone().add(new THREE.Vector3(0.95, 0, 0)), rng, heightAt, { fixed: true, heading: -Math.PI / 2 });
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
      sheep.push(new Sheep(bridgeSheepPos, rng, heightAt, { fixed: true, heading }));
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
  const cloudMat = lam('#ffffff', { emissive: '#ffffff', emissiveIntensity: 0.12 });
  const cloudGeo = new THREE.IcosahedronGeometry(1, 1);
  const clouds = [];
  for (let i = 0; i < 16; i++) {
    const cg = new THREE.Group();
    const n = 3 + Math.floor(rng() * 3);
    for (let k = 0; k < n; k++) {
      const puff = new THREE.Mesh(cloudGeo, cloudMat);
      puff.position.set((k - n / 2) * 4.5 + rng() * 2, rng() * 2, rng() * 4);
      puff.scale.setScalar(3.5 + rng() * 3);
      puff.castShadow = true;
      cg.add(puff);
    }
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
    platformSpots: [-12, -3, 3, 12].map((k) => {
      const f = track.frame(k);
      return f.p.clone().addScaledVector(f.side, 4.4 * sg).setY(TRACK_Y + PLAT_TOP);
    }),
    obstacles,
    colliders,
    walkHeight,
    platformPoint,
    canopyPoint,
    outward: out, // horizontal direction from the track towards the platform
    clearAround,
    update(dt, time) {
      for (const u of updaters) u(dt, time);
    },
    setLights(l) {
      windowMat.emissiveIntensity = l * 1.3;
      lampMat.emissiveIntensity = l * 2;
      for (const L of lamps) L.intensity = l * 18;
    },
    setOvercast(o) {
      cloudMat.color.copy(white).lerp(grey, o);
    },
  };
}
