import * as THREE from 'three';
import { WORLD_SIZE, WATER_Y, SEED } from '../config.js';
import { clamp, mulberry32 } from '../utils.js';
import { riverX } from './terrain.js';
import { Person } from './people.js';
import { createBoats } from './boats.js';
import { NavGrid } from './nav.js';
import { createBirds } from './birds.js';
import { lam, Instancer } from './lowpoly.js';
import { Ripples } from './particles.js';

// Everything that moves around the valley on its own: hot-air balloons, fish (with ripples),
// villagers and hikers.

const turnToward = (heading, want, k) => heading + Math.atan2(Math.sin(want - heading), Math.cos(want - heading)) * k;

// ---------------------------------------------------------------- fish
const FISH_COLORS = ['#ff8a3d', '#f2b632', '#c9d3db', '#e0603f', '#8fb8d8'];

// All fish are drawn by two InstancedMeshes (body, tail) with a colour per fish. They glow a
// little in their own colour so they read through the water: the emissive is tinted per instance.
function createSchool(capacity) {
  const mat = new THREE.MeshLambertMaterial({ flatShading: true, emissive: '#ffffff', emissiveIntensity: 0.35 });
  mat.onBeforeCompile = (s) => {
    s.fragmentShader = s.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n#ifdef USE_COLOR\ntotalEmissiveRadiance *= vColor.rgb;\n#endif');
  };
  const body = new THREE.IcosahedronGeometry(0.35, 0).scale(0.55, 0.7, 1.5);
  const fin = new THREE.ConeGeometry(0.28, 0.45, 4).rotateX(-Math.PI / 2).translate(0, 0, -0.2).scale(0.3, 1, 1);
  const opt = { castShadow: false };
  return { body: new Instancer(body, mat, capacity, opt), tail: new Instancer(fin, mat, capacity, opt) };
}

class Fish {
  constructor(spot, rng, heightAt, ripples, school) {
    this.rng = rng;
    this.heightAt = heightAt;
    this.ripples = ripples;
    this.pos = new THREE.Vector3(spot.x, WATER_Y - 0.3 - rng() * 0.3, spot.z);
    this.depth = this.pos.y;
    this.heading = rng() * Math.PI * 2;
    this.speed = 1.6 + rng() * 1.6;
    this.wander = rng() * 100;
    this.jumpTimer = 6 + rng() * 20;
    this.rippleTimer = rng() * 3;
    this.vy = 0;
    this.jumping = false;

    // Anchors only — the school draws them (see createSchool).
    const g = (this.group = new THREE.Group());
    const color = FISH_COLORS[Math.floor(rng() * FISH_COLORS.length)];
    this.tail = new THREE.Object3D();
    this.tail.position.z = -0.45;
    g.add(this.tail);
    school.body.add(g, color);
    school.tail.add(this.tail, color);
    g.scale.setScalar(1.4 + rng() * 0.6);
  }

  isWater(x, z) {
    return Math.abs(x) < WORLD_SIZE / 2 - 4 && Math.abs(z) < WORLD_SIZE / 2 - 4 && this.heightAt(x, z) < WATER_Y - 0.9;
  }

  update(dt, t) {
    if (dt === 0) return;
    this.wander += dt;
    this.heading += Math.sin(this.wander * 0.7) * 0.6 * dt;

    // Look ahead; turn back before swimming onto land.
    const ax = this.pos.x + Math.sin(this.heading) * 3;
    const az = this.pos.z + Math.cos(this.heading) * 3;
    if (!this.jumping && !this.isWater(ax, az)) this.heading += Math.PI * (0.5 + this.rng() * 0.5);

    const sp = this.speed * (this.jumping ? 1.6 : 1);
    this.pos.x += Math.sin(this.heading) * sp * dt;
    this.pos.z += Math.cos(this.heading) * sp * dt;

    if (this.jumping) {
      this.vy -= 14 * dt;
      this.pos.y += this.vy * dt;
      if (this.pos.y < WATER_Y && this.vy < 0) {
        this.jumping = false;
        this.pos.y = this.depth;
        this.ripples.spawn(this.pos.x, this.pos.z, 1.3, 1);
      }
    } else {
      this.pos.y = this.depth + Math.sin(t * 2 + this.wander) * 0.08;
      this.jumpTimer -= dt;
      this.rippleTimer -= dt;
      if (this.rippleTimer < 0) {
        this.rippleTimer = 1.5 + this.rng() * 2.5;
        this.ripples.spawn(this.pos.x, this.pos.z, 0.5, 0.5);
      }
      if (this.jumpTimer < 0) {
        this.jumpTimer = 8 + this.rng() * 25;
        this.jumping = true;
        this.vy = 5 + this.rng() * 2;
        this.ripples.spawn(this.pos.x, this.pos.z, 1.0, 0.9);
      }
    }

    this.group.position.copy(this.pos);
    this.group.rotation.set(this.jumping ? -Math.atan2(this.vy, sp) : 0, this.heading, 0, 'YXZ');
    this.tail.rotation.y = Math.sin(t * (this.jumping ? 22 : 10) + this.wander) * 0.5;
  }
}

// ---------------------------------------------------------------- people
// A person walking along waypoints, pausing at stops. The figure itself lives in people.js.
class Walker {
  constructor(rng, heightAt, { kind = 'villager', speed = 1.4 } = {}) {
    this.rng = rng;
    this.heightAt = heightAt;
    this.person = new Person(rng, { kind });
    this.group = this.person.group;
    this.pos = new THREE.Vector3();
    this.heading = 0;
    this.speed = speed * (0.85 + rng() * 0.3);
    this.pause = 0;
    this.waving = false;
  }

  place(p) {
    this.pos.set(p.x, 0, p.z);
    this.sync();
  }

  sync() {
    // fixedY: stepping across the gap between platform and carriage, where the ground doesn't apply.
    this.pos.y = this.fixedY ?? this.heightAt(this.pos.x, this.pos.z) - 0.05;
    this.group.position.copy(this.pos);
    this.group.rotation.y = this.heading;
  }

  // Move toward target; returns true on arrival.
  step(target, dt, t, slowOnSlope = false) {
    const dx = target.x - this.pos.x;
    const dz = target.z - this.pos.z;
    const d = Math.hypot(dx, dz);
    this.heading = turnToward(this.heading, Math.atan2(dx, dz), Math.min(1, dt * 5));
    let sp = this.speed;
    if (slowOnSlope) {
      const rise = Math.abs(this.heightAt(target.x, target.z) - this.pos.y) / Math.max(d, 0.5);
      sp *= clamp(1 - rise * 0.6, 0.4, 1);
    }
    const s = Math.min(d, sp * dt);
    this.pos.x += (dx / (d || 1)) * s;
    this.pos.z += (dz / (d || 1)) * s;
    this.sync();
    this.person.walk(t * 7 * sp + this.person.phase);
    return d < 0.3;
  }

  idle(t) {
    if (this.waving) this.person.wave(t);
    else this.person.idle(t);
  }
}

// ---------------------------------------------------------------- balloons
const BALLOON_STRIPES = [
  ['#c8453a', '#f2c14e'],
  ['#2f5d7c', '#f1e3c3'],
  ['#6d8b3a', '#f4ead2'],
  ['#8e5aa8', '#f2a36b'],
];

function buildBalloon(colors) {
  const g = new THREE.Group();
  const profile = [[0.8, 0], [1.6, 0.8], [3.2, 2.4], [4.0, 4.2], [4.1, 5.6], [3.6, 7.2], [2.5, 8.3], [0.01, 8.8]].map(
    ([r, y]) => new THREE.Vector2(r, y),
  );
  const geo = new THREE.LatheGeometry(profile, 16).toNonIndexed();
  const p = geo.attributes.position;
  const col = [];
  const a = new THREE.Color(colors[0]);
  const b = new THREE.Color(colors[1]);
  for (let i = 0; i < p.count; i += 3) {
    const cx = (p.getX(i) + p.getX(i + 1) + p.getX(i + 2)) / 3;
    const cz = (p.getZ(i) + p.getZ(i + 1) + p.getZ(i + 2)) / 3;
    const seg = Math.floor(((Math.atan2(cz, cx) + Math.PI) / (Math.PI * 2)) * 16);
    const c = seg % 2 ? a : b;
    for (let k = 0; k < 3; k++) col.push(c.r, c.g, c.b);
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.computeVertexNormals();
  // Own material: each balloon glows only while its own burner fires.
  const envMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, emissive: '#ff9a3c', emissiveIntensity: 0 });
  const envelope = new THREE.Mesh(geo, envMat);
  envelope.castShadow = true;

  const basket = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.0, 1.4), lam('#8a6038'));
  basket.position.y = -2.4;
  basket.castShadow = true;
  const rim = new THREE.Mesh(new THREE.BoxGeometry(1.55, 0.15, 1.55), lam('#5a3b2a'));
  rim.position.y = -1.9;
  const ropePts = [];
  for (const [x, z] of [[-0.65, -0.65], [0.65, -0.65], [0.65, 0.65], [-0.65, 0.65]]) ropePts.push(x, -1.9, z, x * 1.3, 0.1, z * 1.3);
  const ropeGeo = new THREE.BufferGeometry();
  ropeGeo.setAttribute('position', new THREE.Float32BufferAttribute(ropePts, 3));
  const ropes = new THREE.LineSegments(ropeGeo, new THREE.LineBasicMaterial({ color: '#3f2a1f' }));
  const flameMat = new THREE.MeshBasicMaterial({ color: '#ffb347', transparent: true, opacity: 0.9 });
  const flame = new THREE.Mesh(new THREE.ConeGeometry(0.28, 1.0, 8), flameMat);
  flame.position.y = -0.9;
  flame.visible = false;
  g.add(envelope, basket, rim, ropes, flame);
  return { group: g, flame, envMat };
}

// ---------------------------------------------------------------- main
export function createLife({ terrain, track, scenery, train }) {
  const rng = mulberry32(SEED + 7);
  const heightAt = terrain.heightAt;
  const group = new THREE.Group();
  const updaters = [];
  let lights = 0;

  // Ripples + fish
  const ripples = new Ripples();
  group.add(ripples.group);
  const waterSpots = [];
  for (let i = 0; i < 6000 && waterSpots.length < 200; i++) {
    const x = (rng() - 0.5) * (WORLD_SIZE - 20);
    const z = (rng() - 0.5) * (WORLD_SIZE - 20);
    if (heightAt(x, z) < WATER_Y - 1.2) waterSpots.push({ x, z });
  }
  const fish = [];
  const school = createSchool(26);
  group.add(school.body.mesh, school.tail.mesh);
  for (let i = 0; i < 26 && waterSpots.length; i++) {
    const f = new Fish(waterSpots[Math.floor(rng() * waterSpots.length)], rng, heightAt, ripples, school);
    fish.push(f);
    group.add(f.group);
  }
  let rainRipple = 0;
  updaters.push((dt, t, env) => {
    fish.forEach((f) => f.update(dt, t));
    // Raindrops dimple the water.
    if (env.rain > 0.2 && dt > 0 && waterSpots.length) {
      rainRipple += dt * 40 * env.rain;
      while (rainRipple > 1) {
        rainRipple--;
        const s = waterSpots[Math.floor(Math.random() * waterSpots.length)];
        ripples.spawn(s.x + (Math.random() - 0.5) * 30, s.z + (Math.random() - 0.5) * 30, 0.35, 0.6);
      }
    }
    ripples.update(dt);
  });

  // Paddle steamer + fisherman's rowboat
  const boats = createBoats({ heightAt, ripples, waterSpots, rng });
  group.add(boats.group);
  updaters.push((dt, t) => boats.update(dt, t));

  // Hot-air balloons
  const balloons = [];
  for (let i = 0; i < 4; i++) {
    const b = buildBalloon(BALLOON_STRIPES[i % BALLOON_STRIPES.length]);
    b.cx = (rng() - 0.5) * 200;
    b.cz = (rng() - 0.5) * 200;
    b.r = 60 + rng() * 90;
    b.w = (0.02 + rng() * 0.02) * (rng() < 0.5 ? -1 : 1);
    b.a = rng() * Math.PI * 2;
    b.base = 55 + rng() * 35;
    b.ph = rng() * 10;
    b.burn = 0;
    b.group.scale.setScalar(1.3);
    balloons.push(b);
    group.add(b.group);
  }
  updaters.push((dt, t) => {
    for (const b of balloons) {
      b.a += b.w * dt;
      const y = b.base + Math.sin(t * 0.15 + b.ph) * 8;
      const rising = Math.cos(t * 0.15 + b.ph) > 0.2;
      b.group.position.set(b.cx + Math.cos(b.a) * b.r, y, b.cz + Math.sin(b.a) * b.r);
      b.group.rotation.set(Math.sin(t * 0.5 + b.ph) * 0.03, t * 0.05 + b.ph, Math.cos(t * 0.4 + b.ph) * 0.03);
      if (dt > 0) {
        b.burn -= dt;
        if (b.burn < -1.5 - Math.random() * 3 && rising) b.burn = 0.6 + Math.random() * 0.8;
      }
      const burning = b.burn > 0;
      b.flame.visible = burning;
      if (burning) b.flame.scale.set(1, 0.8 + Math.random() * 0.5, 1);
      b.envMat.emissiveIntensity = burning ? 0.1 + lights * 0.5 : 0;
    }
  });

  // Villagers walking between houses and the station platform, routed around obstacles.
  const walkHeight = scenery.walkHeight;
  const rawStops = [
    ...scenery.homes.map((p) => ({ p, face: null })),
    ...scenery.platformSpots.map((p) => {
      // Stand facing the track while waiting for the train.
      let best = null, bd = Infinity;
      for (const f of track.frames) {
        const d = (f.p.x - p.x) ** 2 + (f.p.z - p.z) ** 2;
        if (d < bd) {
          bd = d;
          best = f;
        }
      }
      return { p, face: Math.atan2(best.p.x - p.x, best.p.z - p.z) };
    }),
  ];
  const villagers = [];
  const kids = [];
  let nav = null;
  let stops = [];
  if (rawStops.length > 1) {
    const b = { minX: Infinity, minZ: Infinity, maxX: -Infinity, maxZ: -Infinity };
    for (const { p } of rawStops) {
      b.minX = Math.min(b.minX, p.x - 30);
      b.maxX = Math.max(b.maxX, p.x + 30);
      b.minZ = Math.min(b.minZ, p.z - 30);
      b.maxZ = Math.max(b.maxZ, p.z + 30);
    }
    const lim = WORLD_SIZE / 2 - 2;
    b.minX = Math.max(b.minX, -lim);
    b.minZ = Math.max(b.minZ, -lim);
    b.maxX = Math.min(b.maxX, lim);
    b.maxZ = Math.min(b.maxZ, lim);
    nav = new NavGrid(b, walkHeight, scenery.colliders);
    // Snap every stop onto a walkable cell, and keep only stops reachable from the platform.
    stops = rawStops.map((s) => ({ ...s, p: nav.nearestFree(s.p.x, s.p.z) })).filter((s) => s.p);
    const anchor = stops.find((s) => s.face != null) || stops[0];
    const main = nav.regionAt(anchor.p.x, anchor.p.z);
    stops = stops.filter((s) => nav.regionAt(s.p.x, s.p.z) === main);

    // Half of all trips go to the station, the rest to a random house.
    const platformStops = stops.filter((s) => s.face != null);
    const pickStop = (not) => {
      let s;
      do s = platformStops.length && rng() < 0.5 ? platformStops[Math.floor(rng() * platformStops.length)] : stops[Math.floor(rng() * stops.length)];
      while (s === not && stops.length > 1);
      return s;
    };
    // Bedtime: everyone heads for their own front door and goes inside.
    const homeStops = stops.filter((s) => s.face == null);
    const plan = (w) => {
      for (let tries = 0; tries < 4; tries++) {
        const home = w.asleep && w.homeStop;
        const stop = home ? w.homeStop : pickStop(w.stop);
        // Don't all stand on the exact same spot: pick a free place a little around the stop.
        const a = rng() * Math.PI * 2, r = home ? 0 : 0.6 + rng() * 1.6;
        let goal = nav.nearestFree(stop.p.x + Math.cos(a) * r, stop.p.z + Math.sin(a) * r, 2);
        if (!goal || nav.regionAt(goal.x, goal.z) !== nav.regionAt(stop.p.x, stop.p.z)) goal = stop.p;
        const path = nav.findPath(w.pos, goal);
        if (path && (path.length || home)) {
          w.stop = stop;
          w.path = path.length ? path : [goal]; // already on the doorstep
          w.pi = 0;
          return;
        }
      }
      w.path = null;
      w.pause = 3;
    };

    // Each household keeps its own hours (own generator, so the rest of the valley is unchanged).
    const clockRng = mulberry32(SEED + 13);
    for (let i = 0; i < 12; i++) {
      const w = new Walker(rng, walkHeight);
      w.stop = pickStop(null);
      w.place(w.stop.p);
      w.pause = rng() * 4;
      w.plan = plan;
      w.homeStop = homeStops.length ? homeStops[i % homeStops.length] : null;
      w.bed = 20.3 + clockRng() * 2.5;
      w.wake = 5.6 + clockRng() * 1.6;
      w.homeCheck = 0;
      villagers.push(w);
      group.add(w.group);
    }
    // Children tag along beside a grown-up.
    for (let i = 0; i < Math.min(4, villagers.length); i++) {
      const parent = villagers[i * 3];
      const k = new Walker(rng, walkHeight, { kind: 'child', speed: 2.4 });
      k.parent = parent;
      k.side = rng() < 0.5 ? -1 : 1;
      k.spot = new THREE.Vector3();
      k.place(nav.nearestFree(parent.pos.x + 1, parent.pos.z) || parent.pos);
      kids.push(k);
      group.add(k.group);
    }
  }

  // ---- Getting on and off the train
  // Villagers waiting on the platform board when the doors open, ride one lap, and get off at the
  // next stop. The train holds at the station until nobody is still walking to or from a door.
  const platformY = scenery.platformPoint(0.5, 0.5).y;
  const out = scenery.outward;
  const doorPos = new THREE.Vector3();
  const doors = () => {
    const list = [];
    for (let car = 1; car <= 3; car++) {
      for (const end of [-1, 1]) list.push({ car, end, p: train.doorPoint(car, end, out, new THREE.Vector3()) });
    }
    return list;
  };
  // The guard waits for anyone stepping through a door or nearly there; stragglers miss the train.
  const busy = (w) =>
    w.mode === 'boarding' || w.mode === 'waitAlight' || w.mode === 'alighting' || (w.mode === 'toTrain' && w.pos.distanceTo(w.door.p) < 8);
  if (train) train.canDepart = () => !villagers.some(busy);
  let handledStop = 0;

  function onTrainArrived() {
    const ds = doors();
    // Riders from the previous lap get off first, one after another.
    let delay = 0.3;
    for (const w of villagers) {
      if (w.mode !== 'riding' || w.boardedStop >= train.stopId) continue;
      w.mode = 'waitAlight';
      w.alightDelay = delay;
      w.door = ds[Math.floor(rng() * ds.length)];
      delay += 0.9;
    }
    // Then some of the people waiting on the platform get on.
    let aboard = villagers.filter((w) => w.mode === 'riding' || w.mode === 'waitAlight').length;
    for (const w of villagers) {
      // Anyone waiting on — or heading for — the platform may hop on.
      if (w.mode || w.asleep || w.stop?.face == null || aboard >= 6 || rng() > 0.85) continue; // no rides at bedtime
      let best = null;
      for (const d of ds) if (!best || d.p.distanceToSquared(w.pos) < best.p.distanceToSquared(w.pos)) best = d;
      if (best.p.distanceTo(w.pos) > 25) continue; // too far away to make it
      const approach = best.p.clone().addScaledVector(out, 2.1);
      const goal = nav.nearestFree(approach.x, approach.z, 2);
      const path = goal && nav.findPath(w.pos, goal);
      if (!path) continue;
      w.mode = 'toTrain';
      w.door = best;
      w.path = path.length ? path : [goal]; // already standing at the door
      w.pi = 0;
      w.pause = 0;
      aboard++;
    }
  }

  // Returns true when the villager is busy with the train this frame.
  function trainStep(w, dt, t) {
    switch (w.mode) {
      case 'riding':
        return true;
      case 'waitAlight':
        w.alightDelay -= dt;
        if (w.alightDelay > 0) return true;
        // Step out of the door onto the platform.
        train.doorPoint(w.door.car, w.door.end, out, doorPos);
        w.pos.set(doorPos.x, platformY, doorPos.z);
        w.fixedY = platformY - 0.05;
        w.heading = Math.atan2(out.x, out.z);
        w.exit = nav.nearestFree(doorPos.x + out.x * 2.2, doorPos.z + out.z * 2.2, 2) || w.pos.clone().addScaledVector(out, 2.2);
        w.group.visible = true;
        w.mode = 'alighting';
        return true;
      case 'alighting':
        if (w.step(w.exit, dt, t)) {
          w.mode = null;
          w.fixedY = null;
          w.path = null;
          w.pause = 0.5;
          w.stop = null; // next plan() heads home
        }
        return true;
      case 'toTrain':
        if (!train.stopped || train.state === 'closing') {
          w.mode = null; // missed it
          w.plan(w);
          return true;
        }
        if (w.step(w.path[w.pi], dt, t) && ++w.pi >= w.path.length) {
          w.mode = 'boarding';
          w.fixedY = platformY - 0.05;
        }
        return true;
      case 'boarding':
        if (w.step(w.door.p, dt, t) || !train.stopped) {
          w.group.visible = false;
          w.mode = 'riding';
          w.fixedY = null;
          w.car = train.cars[w.door.car].obj;
          w.boardedStop = train.stopId;
        }
        return true;
    }
    return false;
  }

  updaters.push((dt, t, env) => {
    if (dt === 0 || !nav) return;
    const rainy = env.rain > 0.3;
    if (train && train.stopped && train.doorOpen > 0.95 && handledStop !== train.stopId) {
      handledStop = train.stopId;
      onTrainArrived();
    }
    for (const w of villagers) {
      w.asleep = !!w.homeStop && (env.hour >= w.bed || env.hour < w.wake);
      w.person.setUmbrella(rainy);
      if (trainStep(w, dt, t)) continue;
      if (w.atHome) {
        // Indoors (hidden) until morning, then out of the front door.
        if (w.asleep) continue;
        w.atHome = false;
        w.group.visible = true;
        w.pause = 0.5 + rng() * 2;
      } else if (w.asleep && w.stop !== w.homeStop && (w.homeCheck -= dt) <= 0) {
        // Bedtime: drop whatever they were doing and head home (retry every 2 s if there's no path).
        w.homeCheck = 2;
        w.pause = 0;
        w.plan(w);
      }
      if (w.pause > 0) {
        w.pause -= dt;
        if (w.stop?.face != null) w.heading = turnToward(w.heading, w.stop.face, Math.min(1, dt * 3));
        w.sync();
        w.idle(t);
        if (w.pause <= 0) w.plan(w);
        continue;
      }
      if (!w.path) {
        w.plan(w);
        continue;
      }
      if (w.step(w.path[w.pi], dt, t)) {
        w.pi++;
        if (w.pi >= w.path.length) {
          w.path = null;
          if (w.asleep && w.stop === w.homeStop) {
            w.atHome = true; // goes inside
            w.group.visible = false;
            continue;
          }
          w.pause = w.stop.face != null ? 6 + rng() * 10 : 2 + rng() * 6;
        }
      }
    }
    for (const k of kids) {
      const p = k.parent;
      k.person.setUmbrella(rainy);
      // On the train with the parent — or indoors with them at night: hidden, and back out right
      // behind them.
      if (p.mode === 'riding' || p.mode === 'waitAlight' || p.atHome) {
        k.group.visible = false;
        continue;
      }
      if (!k.group.visible) {
        k.pos.copy(p.pos).addScaledVector(out, 0.6);
        k.group.visible = true;
      }
      if (p.mode === 'boarding' || p.mode === 'alighting') {
        k.fixedY = p.fixedY;
        if (Math.hypot(p.pos.x - k.pos.x, p.pos.z - k.pos.z) > 0.9) k.step(p.pos, dt, t);
        else {
          k.sync();
          k.idle(t);
        }
        continue;
      }
      k.fixedY = null;
      // Beside the parent if there is room, otherwise just behind them.
      const sx = Math.cos(p.heading) * 1.1 * k.side, sz = -Math.sin(p.heading) * 1.1 * k.side;
      k.spot.set(p.pos.x + sx, k.pos.y, p.pos.z + sz);
      if (!nav.isFree(k.spot.x, k.spot.z) || !nav.clearLine(p.pos, k.spot)) {
        k.spot.set(p.pos.x - Math.sin(p.heading) * 1.2, k.pos.y, p.pos.z - Math.cos(p.heading) * 1.2);
      }
      let target = k.spot;
      if (!nav.clearLine(k.pos, k.spot)) {
        // Can't cut straight across: follow a proper path to the parent (re-planned every second).
        k.replan = (k.replan ?? 0) - dt;
        if (!k.path || k.replan <= 0) {
          k.path = nav.findPath(k.pos, p.pos, 8000);
          k.pi = 0;
          k.replan = 1;
        }
        if (k.path && k.pi < k.path.length) {
          target = k.path[k.pi];
          if (Math.hypot(target.x - k.pos.x, target.z - k.pos.z) < 0.3) k.pi++;
        } else target = null;
      } else k.path = null;
      if (target && Math.hypot(k.pos.x - target.x, k.pos.z - target.z) > 0.4) k.step(target, dt, t);
      else {
        k.heading = turnToward(k.heading, p.heading, Math.min(1, dt * 4));
        k.sync();
        k.idle(t);
      }
    }
  });

  // Pigeons on the platform (they scatter when people or the train come close) + birds in the sky
  const birds = createBirds({ rng, scenery, nav, train });
  group.add(birds.group);
  updaters.push((dt, t) => {
    const people = [];
    for (const w of villagers) if (w.group.visible) people.push(w.pos); // not the ones indoors or on the train
    for (const k of kids) if (k.group.visible) people.push(k.pos);
    birds.update(dt, t, people, lights);
  });

  // Hikers climbing to mountain summits along zig-zag trails
  const candidates = [];
  for (let i = 0; i < 400; i++) {
    const a = rng() * Math.PI * 2;
    const r = 175 + rng() * 95;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (Math.abs(x) > WORLD_SIZE / 2 - 15 || Math.abs(z) > WORLD_SIZE / 2 - 15) continue;
    if (Math.abs(x - riverX(z)) < 30) continue;
    candidates.push({ x, z, h: heightAt(x, z) });
  }
  candidates.sort((a, b) => b.h - a.h);
  // Highest summits, kept far apart from each other.
  const peaks = [];
  for (const c of candidates) if (peaks.every((p) => Math.hypot(p.x - c.x, p.z - c.z) > 160)) peaks.push(c);
  const trails = [];
  const trailMat = lam('#b89a6a', { side: THREE.DoubleSide });
  for (const peak of peaks.slice(0, 2)) {
    // Walk from the summit toward the valley centre until we reach easy, dry ground.
    const dir = new THREE.Vector3(-peak.x, 0, -peak.z).normalize();
    const side = new THREE.Vector3(-dir.z, 0, dir.x);
    let len = 0;
    for (let d = 10; d < 200; d += 4) {
      const x = peak.x + dir.x * d, z = peak.z + dir.z * d;
      const h = heightAt(x, z);
      len = d;
      if (h < 8 && h > WATER_Y + 1 && track.distanceTo(x, z) > 12) break;
    }
    const pts = [];
    const N = Math.ceil(len / 3);
    for (let i = 0; i <= N; i++) {
      const k = i / N; // 0 = summit
      const zig = Math.sin(k * Math.PI * 5) * 7 * Math.sin(k * Math.PI);
      const x = peak.x + dir.x * len * k + side.x * zig;
      const z = peak.z + dir.z * len * k + side.z * zig;
      pts.push(new THREE.Vector3(x, heightAt(x, z), z));
    }
    pts.reverse(); // 0 = trailhead
    trails.push(pts);
    scenery.clearAround(pts, 1.8); // no trees or boulders standing on the path

    // Dirt ribbon draped on the terrain
    const pos = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      const t = new THREE.Vector3().subVectors(b, a).setY(0).normalize();
      const s = new THREE.Vector3(-t.z, 0, t.x).multiplyScalar(0.7);
      const quad = [a.clone().add(s), a.clone().sub(s), b.clone().sub(s), b.clone().add(s)];
      quad.forEach((q) => (q.y = heightAt(q.x, q.z) + 0.12));
      pos.push(...quad[0].toArray(), ...quad[1].toArray(), ...quad[2].toArray(), ...quad[0].toArray(), ...quad[2].toArray(), ...quad[3].toArray());
    }
    const tg = new THREE.BufferGeometry();
    tg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    tg.computeVertexNormals();
    const trail = new THREE.Mesh(tg, trailMat);
    trail.receiveShadow = true;
    group.add(trail);

    // Summit flag
    const top = pts[pts.length - 1];
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 4, 6), lam('#5a3b2a'));
    pole.position.set(top.x, top.y + 2, top.z);
    const flag = new THREE.Mesh(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, -1.1, 0), new THREE.Vector3(1.8, -0.55, 0)]), new THREE.MeshBasicMaterial({ color: '#c8453a', side: THREE.DoubleSide }));
    flag.position.set(top.x, top.y + 4, top.z);
    group.add(pole, flag);
    updaters.push((dt, t) => (flag.rotation.y = Math.sin(t * 1.3) * 0.5));
  }

  const hikers = [];
  trails.forEach((pts) => {
    for (let i = 0; i < 3; i++) {
      const w = new Walker(rng, heightAt, { kind: 'hiker', speed: 1.5 });
      w.trail = pts;
      w.idx = Math.floor(rng() * (pts.length - 1));
      w.dir = rng() < 0.6 ? 1 : -1;
      w.place(pts[w.idx]);
      hikers.push(w);
      group.add(w.group);
    }
  });
  // Hikers head down before dark and are gone (camping at the trailhead) until morning.
  const hikerNight = (h) => h >= 18.8 || h < 6.5;
  updaters.push((dt, t, env) => {
    if (dt === 0) return;
    const night = hikerNight(env.hour);
    for (const w of hikers) {
      if (w.camping) {
        if (night) continue;
        w.camping = false;
        w.group.visible = true;
        w.dir = 1;
        w.pause = rng() * 6;
      } else if (night && w.dir === 1) {
        w.dir = -1; // turn back down
        w.pause = 0;
        w.waving = false;
      }
      if (w.pause > 0) {
        w.pause -= dt;
        w.idle(t);
        if (w.pause <= 0) w.waving = false;
        continue;
      }
      const target = w.trail[w.idx];
      if (w.step(target, dt, t, true)) {
        const next = w.idx + w.dir;
        if (next < 0 && night) {
          w.camping = true;
          w.group.visible = false;
        } else if (next < 0 || next >= w.trail.length) {
          // Reached summit (wave!) or trailhead (rest), then turn around.
          w.dir *= -1;
          w.waving = next >= w.trail.length;
          w.pause = w.waving ? 5 + rng() * 4 : 4 + rng() * 6;
        } else w.idx = next;
      }
    }
  });

  const summit = trails.length ? trails[0][trails[0].length - 1] : new THREE.Vector3();

  // Who the follow cameras can ride along with. A villager on the train is followed via their carriage.
  const followables = {
    people: [
      ...villagers.map((w, i) => ({ label: `Dân làng ${i + 1}`, anchor: () => (w.group.visible ? w.group : w.car || w.group) })),
      ...kids.map((k, i) => ({ label: `Em bé ${i + 1}`, anchor: () => (k.group.visible ? k.group : k.parent.car || k.group) })),
      ...hikers.map((h, i) => ({ label: `Người leo núi ${i + 1}`, anchor: () => h.group })),
    ],
    birds: [...birds.followables, ...balloons.map((b, i) => ({ label: `Khinh khí cầu ${i + 1}`, anchor: () => b.group }))],
  };

  return {
    group,
    followables,    spots: { summit, ...boats.spots },
    update(dt, t, env) {
      for (const u of updaters) u(dt, t, env);
    },
    setLights(l) {
      lights = l;
    },
  };
}
