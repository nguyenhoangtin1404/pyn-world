import * as THREE from 'three';
import { Instancer, VERTEX_COLORED, UNLIT, ball, keep } from '../lowpoly.js';
import { KINDS, kindGeometry } from './kinds.js';

// Draws a whole fleet with a few InstancedMeshes per kind of vehicle (body, wheel, and for planes
// the propeller and navigation lights) — however many vehicles there are. A vehicle only moves
// empty anchors; its paint colour is the instance tint. Road vehicles' lamps are two more
// InstancedMeshes for the whole fleet: the lit lamps (unlit material, so they glow at night) and a
// pool of light on the road in front of each at night — lamps are lit by showing their anchors.

const HEAD = '#fff3cf', TAIL = '#ff2a1a';

// Shared by every world (keep()); built on first use.
let lampGeo, beamGeo, beamMat;
function lampParts() {
  if (!lampGeo) {
    lampGeo = keep(ball(0.11, '#ffffff', [0, 0, 0], { sz: 0.4 }, 0));
    beamGeo = keep(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2));
    // A soft oval of light: bright near the lamps (the near end, -z), fading out ahead.
    const N = 32, data = new Uint8Array(N * N * 4);
    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        const u = (i + 0.5) / N - 0.5, v = (j + 0.5) / N;
        const a = Math.max(0, 1 - Math.hypot(u * 2, (v - 0.35) * 1.5)) ** 1.5;
        data.set([255, 255, 255, Math.round(a * 255)], (j * N + i) * 4);
      }
    }
    const tex = keep(new THREE.DataTexture(data, N, N));
    tex.needsUpdate = true;
    beamMat = keep(new THREE.MeshBasicMaterial({ color: '#ffe0a0', map: tex, transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
  }
  return { lampGeo, beamGeo, beamMat };
}

export class Fleet {
  /** @param {Record<string, number>} counts how many of each kind (KINDS id → number) */
  constructor(counts) {
    this.parts = {};
    this.meshes = [];
    for (const [id, n] of Object.entries(counts)) {
      if (!n) continue;
      const k = KINDS[id];
      if (!k) throw new Error(`Không có loại xe "${id}" (vehicles/kinds.js)`);
      const inst = (part, count, mat = VERTEX_COLORED, opt) => {
        const i = new Instancer(kindGeometry(id, part), mat, count, opt);
        this.meshes.push(i.mesh);
        return i;
      };
      this.parts[id] = {
        body: inst('body', n),
        wheel: k.wheels.length ? inst('wheel', n * k.wheels.length) : null,
        prop: k.prop ? inst('prop', n) : null,
        lights: k.lights ? inst('lights', n, UNLIT, { castShadow: false, receiveShadow: false }) : null,
      };
    }
    const lit = Object.entries(counts).filter(([id, n]) => n && KINDS[id].lamps);
    const lamps = lit.reduce((sum, [id, n]) => sum + n * (KINDS[id].lamps.head.length + KINDS[id].lamps.tail.length), 0);
    this.lamps = this.beams = null;
    if (lamps) {
      const { lampGeo, beamGeo, beamMat } = lampParts();
      const flat = { castShadow: false, receiveShadow: false };
      this.lamps = new Instancer(lampGeo, UNLIT, lamps, flat);
      this.beams = new Instancer(beamGeo, beamMat, lit.reduce((sum, [, n]) => sum + n, 0), flat);
      this.beams.mesh.renderOrder = 1;
      this.meshes.push(this.lamps.mesh, this.beams.mesh);
    }
  }

  /** Light pools on the road at all (night): hides the whole mesh by day, not just every pool. */
  set beamsOn(on) {
    if (this.beams) this.beams.mesh.visible = on;
  }

  /**
   * One more vehicle of a kind: its anchor group (place it in the scene), its wheel anchors (they
   * turn about x) and, for planes, the propeller anchor (turns about z).
   * @param {string} id
   * @param {string} color
   */
  add(id, color) {
    const k = KINDS[id], p = this.parts[id];
    const group = new THREE.Group();
    p.body.add(group, color);
    const wheels = k.wheels.map(([x, y, z]) => {
      const w = new THREE.Object3D();
      w.position.set(x, y, z);
      group.add(w);
      p.wheel.add(w, '#ffffff');
      return w;
    });
    let prop = null;
    if (p.prop) {
      prop = new THREE.Object3D();
      prop.position.set(...k.propeller);
      group.add(prop);
      p.prop.add(prop, '#ffffff');
    }
    if (p.lights) p.lights.add(group, '#ffffff');
    // Lamps, dark until lit (see Vehicle.lamps).
    const lamp = (/** @type {number[]} */ [x, y, z], /** @type {string} */ color) => {
      const a = new THREE.Object3D();
      a.position.set(x, y, z);
      a.visible = false;
      group.add(a);
      this.lamps.add(a, color);
      return a;
    };
    let lamps = null;
    if (k.lamps) {
      const beam = new THREE.Object3D();
      const small = k.length < 2.5; // bikes: a narrow short beam
      beam.position.set(0, 0.1, k.length / 2 + (small ? 1.6 : 3.2));
      beam.scale.set(small ? 1.4 : 3.2, 1, small ? 4 : 7.5);
      beam.visible = false;
      group.add(beam);
      this.beams.add(beam, '#ffffff');
      lamps = { head: k.lamps.head.map((p) => lamp(p, HEAD)), tail: k.lamps.tail.map((p) => lamp(p, TAIL)), beam };
    }
    return { group, wheels, prop, lamps };
  }
}
