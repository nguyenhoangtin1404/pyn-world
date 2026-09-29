import * as THREE from 'three';
import { Instancer, VERTEX_COLORED, keep } from '../lowpoly.js';
import { KINDS, kindGeometry } from './kinds.js';

// Draws a whole fleet with a few InstancedMeshes per kind of vehicle (body, wheel, and for planes
// the propeller and navigation lights) — however many vehicles there are. A vehicle only moves
// empty anchors; its paint colour is the instance tint.

// Unlit, so navigation lights show at night; shared by every world.
const UNLIT = keep(new THREE.MeshBasicMaterial({ vertexColors: true }));

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
    return { group, wheels, prop };
  }
}
