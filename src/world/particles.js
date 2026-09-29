import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { WATER_Y } from '../config.js';
import { GLOBALS } from '../render/shaders.js';

// Object pool of short-lived particles drawn as ONE InstancedMesh (one draw call for the whole
// pool). Each item is a plain object: move `pos`, set `scale`/`rot`/`opacity`, then call sync().
// Per-instance opacity is patched into the material's shader.
export class ParticlePool {
  constructor(geo, material, n) {
    material.transparent = true;
    material.depthWrite = false;
    material.onBeforeCompile = (s) => {
      s.vertexShader = s.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float instanceOpacity;\nvarying float vOpacity;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvOpacity = instanceOpacity;');
      s.fragmentShader = s.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying float vOpacity;')
        .replace('#include <alphamap_fragment>', '#include <alphamap_fragment>\ndiffuseColor.a *= vOpacity;');
    };
    this.mesh = new THREE.InstancedMesh(geo, material, n);
    this.mesh.frustumCulled = false; // particles roam the whole valley
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.opacity = new THREE.InstancedBufferAttribute(new Float32Array(n), 1).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('instanceOpacity', this.opacity);
    this.items = Array.from({ length: n }, () => ({ alive: false, life: 0, max: 1, pos: new THREE.Vector3(), rot: new THREE.Euler(), scale: 1, opacity: 0 }));
    this.next = 0;
    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._s = new THREE.Vector3();
    this.sync();
  }

  // Recycles the oldest slot.
  spawn(pos, max) {
    const it = this.items[this.next++ % this.items.length];
    it.alive = true;
    it.life = 0;
    it.max = max;
    it.pos.copy(pos);
    return it;
  }

  // Ages every live particle; `step(it, k, dt)` animates it (k = 0..1 through its life).
  update(dt, step) {
    for (const it of this.items) {
      if (!it.alive) continue;
      it.life += dt;
      const k = it.life / it.max;
      if (k >= 1) it.alive = false;
      else step(it, k, dt);
    }
    this.sync();
  }

  sync() {
    const { mesh, _m, _q, _s } = this;
    this.items.forEach((it, i) => {
      if (it.alive) _m.compose(it.pos, _q.setFromEuler(it.rot), _s.setScalar(it.scale));
      else _m.makeScale(0, 0, 0);
      mesh.setMatrixAt(i, _m);
      this.opacity.array[i] = it.alive ? it.opacity : 0;
    });
    mesh.instanceMatrix.needsUpdate = true;
    this.opacity.needsUpdate = true;
  }
}

// Puffs that rise, grow and fade — locomotive chimney and steamer funnel.
export class Smoke {
  constructor({ n = 48, color = '#f4f1ec', rise = 2.4, drift = 0.8, grow = 2.4, fade = 0.8 } = {}) {
    this.pool = new ParticlePool(new THREE.IcosahedronGeometry(1, 0), new THREE.MeshLambertMaterial({ color, flatShading: true }), n);
    this.group = this.pool.mesh;
    Object.assign(this, { rise, drift, grow, fade });
  }

  emit(pos, strength = 1) {
    const it = this.pool.spawn(pos, 2.2 + Math.random() * 1.2);
    it.s0 = 0.35 + 0.25 * strength;
    (it.vel ||= new THREE.Vector3()).set((Math.random() - 0.5) * 0.6, this.rise + Math.random() * 1.2 * strength, (Math.random() - 0.5) * 0.6);
    it.rot.set(Math.random() * 3, Math.random() * 3, 0);
  }

  update(dt) {
    this.pool.update(dt, (it, k) => {
      it.vel.y *= 1 - 0.6 * dt;
      it.pos.addScaledVector(it.vel, dt);
      it.pos.x += this.drift * GLOBALS.uWind.value * dt; // blown by the shared wind
      it.scale = it.s0 + k * this.grow;
      it.rot.y += dt * 0.4;
      it.opacity = this.fade * Math.pow(1 - k, 1.5);
    });
  }
}

// Expanding rings on the water: fish, boats, raindrops, fishing floats.
export class Ripples {
  constructor(n = 64) {
    // Two concentric rings per ripple read much better than one.
    const geo = mergeGeometries([new THREE.RingGeometry(0.74, 1, 36), new THREE.RingGeometry(0.44, 0.58, 36)]).rotateX(-Math.PI / 2);
    this.pool = new ParticlePool(geo, new THREE.MeshBasicMaterial({ color: '#f4fbff' }), n);
    this.pool.mesh.renderOrder = 2;
    this.group = this.pool.mesh;
    this._p = new THREE.Vector3();
  }

  spawn(x, z, size = 1, strength = 1) {
    const it = this.pool.spawn(this._p.set(x, WATER_Y + 0.28, z), 1.4 + size * 0.5);
    it.size = size;
    it.strength = strength;
  }

  update(dt) {
    this.pool.update(dt, (it, k) => {
      it.scale = 0.4 + k * it.size * 4;
      it.opacity = 0.95 * it.strength * (1 - k);
    });
  }
}
