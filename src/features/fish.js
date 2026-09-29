import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { WATER_Y } from '../config.js';
import { ball, cone, Instancer } from '../world/lowpoly.js';
import { waterLife } from './waterlife.js';

// Fish swimming in the river and the lakes, jumping now and then (with ripples). Options: count (26).
const FISH_COLORS = ['#ff8a3d', '#f2b632', '#c9d3db', '#e0603f', '#8fb8d8', '#f4efe6', '#9fc26a'];

// All fish are drawn with one InstancedMesh per part (body, tail) and kind (plain, striped), with a
// colour per fish. Parts are white/grey vertex colours, so the per-fish tint shows as a darker back
// and a pale belly. They glow a little in their own colour so they read through the water: the
// emissive is tinted by the vertex × instance colour.
function fishParts(striped) {
  const body = [
    ball(0.35, '#b4b4b4', [0, 0.02, 0], { sx: 0.55, sy: 0.7, sz: 1.5 }), // back
    ball(0.33, '#ffffff', [0, -0.07, 0.03], { sx: 0.5, sy: 0.5, sz: 1.35 }), // pale belly
    cone(0.16, 0.34, '#8c8c8c', [0, 0.27, -0.06], { sx: 0.18, sz: 1.7, rx: -0.35 }, 4), // dorsal fin
    cone(0.1, 0.24, '#d0d0d0', [0.17, -0.08, 0.14], { sx: 0.2, rz: -1.2, rx: 0.5 }, 4), // pectoral fins
    cone(0.1, 0.24, '#d0d0d0', [-0.17, -0.08, 0.14], { sx: 0.2, rz: 1.2, rx: 0.5 }, 4),
    ball(0.055, '#1b1b22', [0.12, 0.07, 0.33], {}, 0), // eyes
    ball(0.055, '#1b1b22', [-0.12, 0.07, 0.33], {}, 0),
    ball(0.035, '#ffffff', [0.14, 0.09, 0.36], {}, 0), // catch-lights
    ball(0.035, '#ffffff', [-0.14, 0.09, 0.36], {}, 0),
  ];
  // Perch-like bars: thin dark bands, only on the upper half of the body.
  if (striped) for (const z of [0.12, -0.1]) body.push(ball(0.35, '#555555', [0, 0.06, z], { sx: 0.53, sy: 0.64, sz: 0.1 }));
  // Forked tail, hinged at the end of the body.
  const tail = [
    cone(0.13, 0.42, '#9a9a9a', [0, 0.1, -0.18], { sx: 0.2, rx: -Math.PI / 2 - 0.45 }, 4),
    cone(0.13, 0.42, '#9a9a9a', [0, -0.1, -0.18], { sx: 0.2, rx: -Math.PI / 2 + 0.45 }, 4),
    ball(0.07, '#9a9a9a', [0, 0, 0.02], { sx: 0.6 }, 0),
  ];
  return { body: mergeGeometries(body), tail: mergeGeometries(tail) };
}

function createSchool(capacity) {
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, emissive: '#ffffff', emissiveIntensity: 0.3 });
  mat.onBeforeCompile = (s) => {
    s.fragmentShader = s.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n#ifdef USE_COLOR\ntotalEmissiveRadiance *= vColor.rgb;\n#endif');
  };
  const opt = { castShadow: false };
  const kinds = [false, true].map((striped) => {
    const g = fishParts(striped);
    return { body: new Instancer(g.body, mat, capacity, opt), tail: new Instancer(g.tail, mat, capacity, opt) };
  });
  return { kinds, meshes: kinds.flatMap((k) => [k.body.mesh, k.tail.mesh]) };
}

class Fish {
  constructor(spot, rng, heightAt, ripples, school, size) {
    this.rng = rng;
    this.half = size / 2;
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
    const kind = school.kinds[rng() < 0.35 ? 1 : 0];
    kind.body.add(g, color);
    kind.tail.add(this.tail, color);
    g.scale.setScalar(1.4 + rng() * 0.6);
  }

  isWater(x, z) {
    return Math.abs(x) < this.half - 4 && Math.abs(z) < this.half - 4 && this.heightAt(x, z) < WATER_Y - 0.9;
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

export default {
  label: 'Đang thả cá',
  build(world, { rng, count = 26 }) {
    const { heightAt, size } = world;
    const { spots, ripples } = waterLife(world, rng);
    const group = new THREE.Group();
    const fish = [];
    const school = createSchool(count);
    group.add(...school.meshes);
    for (let i = 0; i < count && spots.length; i++) {
      const f = new Fish(spots[Math.floor(rng() * spots.length)], rng, heightAt, ripples, school, size);
      fish.push(f);
      group.add(f.group);
    }
    return { group, update: ({ dt, t }) => fish.forEach((f) => f.update(dt, t)) };
  },
};
