// @ts-check
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { TRACK_Y, WATER_Y } from '../config.js';
import { fbm } from '../world/terrain.js';
import { box, ball, Instancer, VERTEX_COLORED } from '../world/lowpoly.js';

// Flocks of sheep grazing in meadows, plus two easter eggs: a pair of sheep in love (spot
// "courting", key F) and a lone sheep watching the river by the first bridge ("bridgeSheep", key G).
// Options: flocks (3), perFlock (5).

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

/** @type {import('../types').Feature} */
export default {
  label: 'Đang thả cừu',
  build(world, { rng, flocks = 3, perFlock = 5 }) {
    const { site, heightAt, bridges } = world;
    const group = new THREE.Group();
    const sheep = [];
    const flock = createFlock(flocks * perFlock + 3);
    group.add(...flock.meshes);
    function meadow(clear = 14) {
      for (let i = 0; i < 400; i++) {
        const a = rng() * Math.PI * 2;
        const r = 20 + rng() * 95;
        const x = Math.cos(a) * r, z = Math.sin(a) * r;
        const h = site.spotOK(x, z, clear);
        if (h !== null && h < 16 && fbm(x, z, 3, 0.012, 21.7) < 0) return new THREE.Vector3(x, h, z);
      }
      return null;
    }
    for (let f = 0; f < flocks; f++) {
      const home = meadow();
      if (!home) continue;
      site.obstacles.push([home.x, home.z, 11]);
      for (let k = 0; k < perFlock; k++) {
        const p = home.clone().add(new THREE.Vector3((rng() - 0.5) * 8, 0, (rng() - 0.5) * 8));
        sheep.push(new Sheep(p, rng, heightAt, flock));
      }
    }

    // Easter egg 1: two sheep in love.
    const courting = meadow(16) || new THREE.Vector3(0, 0, 0);
    site.obstacles.push([courting.x, courting.z, 8]);
    const aSheep = new Sheep(courting.clone().add(new THREE.Vector3(-0.95, 0, 0)), rng, heightAt, flock, { fixed: true, heading: Math.PI / 2 });
    const bSheep = new Sheep(courting.clone().add(new THREE.Vector3(0.95, 0, 0)), rng, heightAt, flock, { fixed: true, heading: -Math.PI / 2 });
    sheep.push(aSheep, bSheep);
    const heart = new THREE.Sprite(new THREE.SpriteMaterial({ map: heartTexture(), transparent: true }));
    heart.scale.setScalar(1.1);
    group.add(heart);

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
    world.spots.courting = courting;
    world.spots.bridgeSheep = bridgeSheepPos || courting;
    return {
      group,
      update({ dt, t }) {
        heart.position.set(courting.x, heightAt(courting.x, courting.z) + 2.6 + Math.sin(t * 2) * 0.25, courting.z);
        heart.scale.setScalar(1.0 + Math.sin(t * 4) * 0.12);
        sheep.forEach((s) => s.update(dt, t));
      },
    };
  },
};
