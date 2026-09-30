// @ts-check
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Instancer, UNLIT, VERTEX_COLORED, ball, box, cone, cyl } from '../lowpoly.js';

// Street furniture that tells traffic what to do: traffic lights and level-crossing posts with their
// barrier arms. The posts are static parts for the world's StaticBatch; what changes — lit lamps,
// moving arms — are empty anchors drawn by two Instancers (all lamps, all arms), so a whole road's
// worth of signals costs two draw calls. A lamp is lit by showing its anchor (Instancer draws hidden
// anchors at scale 0).

const LIT = { red: '#ff3b2f', yellow: '#ffc21a', green: '#45f06e' };
const DIM = { red: '#4a1714', yellow: '#4a3a10', green: '#123d1f' };
export const ARM_OPEN = 1.45; // radians up from level: the arm stands (nearly) upright

/** @typedef {{ red: THREE.Object3D, yellow: THREE.Object3D, green: THREE.Object3D }} LightHead */

export class SignalProps {
  /**
   * @param {import('../lowpoly.js').StaticBatch} batch
   */
  constructor(batch) {
    this.batch = batch;
    this.group = new THREE.Group();
    /** @type {[THREE.Object3D, string][]} */
    this.lamps = [];
    /** @type {THREE.Object3D[]} */
    this.arms = [];
    this.armLength = 3.4;
  }

  // A frame at (x, y, z) facing traffic that comes along heading h (its +z points at the drivers).
  frame(x, y, z, h) {
    const o = new THREE.Object3D();
    o.position.set(x, y, z);
    o.rotation.y = h + Math.PI;
    this.group.add(o);
    this.batch.at(x, y, z, h + Math.PI);
    return o;
  }

  lamp(parent, x, y, z, color) {
    const a = new THREE.Object3D();
    a.position.set(x, y, z);
    a.visible = false;
    parent.add(a);
    this.lamps.push([a, color]);
    return a;
  }

  /**
   * A traffic light on a pole, for traffic coming along heading h.
   * @param {number} x @param {number} y ground @param {number} z @param {number} h
   * @returns {LightHead}
   */
  trafficLight(x, y, z, h) {
    const o = this.frame(x, y, z, h);
    const Y = 3.2;
    const parts = [
      cyl(0.07, 0.08, Y + 0.2, '#3b3f45', [0, (Y + 0.2) / 2, 0]),
      box(0.44, 1.2, 0.3, '#24272c', [0, Y, 0]),
      box(0.72, 1.46, 0.04, '#303338', [0, Y, -0.17]),
    ];
    /** @type {LightHead} */
    const head = /** @type {any} */ ({});
    [['red', 0.36], ['yellow', 0], ['green', -0.36]].forEach(([name, dy]) => {
      const c = /** @type {'red' | 'yellow' | 'green'} */ (name), yy = Y + /** @type {number} */ (dy);
      parts.push(ball(0.13, DIM[c], [0, yy, 0.15], { sz: 0.4 }), box(0.32, 0.04, 0.16, '#1b1d21', [0, yy + 0.17, 0.22]));
      head[c] = this.lamp(o, 0, yy, 0.18, LIT[c]);
    });
    this.batch.add(parts);
    return head;
  }

  /**
   * A pedestrian light on a short pole: red (don't walk) above green (walk), for people who come
   * along heading h (who look at it from across the road).
   * @param {number} x @param {number} y ground @param {number} z @param {number} h
   */
  walkSignal(x, y, z, h) {
    const o = this.frame(x, y, z, h);
    this.batch.add([
      cyl(0.05, 0.06, 2.5, '#3b3f45', [0, 1.25, 0]),
      box(0.3, 0.62, 0.22, '#24272c', [0, 2.3, 0]),
      ball(0.1, DIM.red, [0, 2.44, 0.1], { sz: 0.4 }),
      ball(0.1, DIM.green, [0, 2.16, 0.1], { sz: 0.4 }),
    ]);
    return { stop: this.lamp(o, 0, 2.44, 0.13, LIT.red), walk: this.lamp(o, 0, 2.16, 0.13, LIT.green) };
  }

  /**
   * A level-crossing post for traffic coming along heading h: a crossbuck, two red lamps that take
   * turns, and a barrier arm that swings down across the lane to the post's left (as the drivers
   * see it), `reach` long.
   * @param {number} x @param {number} y ground @param {number} z @param {number} h @param {number} reach
   */
  crossingPost(x, y, z, h, reach) {
    const o = this.frame(x, y, z, h);
    const red = '#c8322b', white = '#f2f2ee';
    const parts = [
      cyl(0.08, 0.09, 3.3, white, [0, 1.65, 0]),
      cyl(0.095, 0.095, 0.25, red, [0, 0.6, 0]),
      cyl(0.095, 0.095, 0.25, red, [0, 1.5, 0]),
      box(0.4, 0.6, 0.4, '#dcdcd4', [0, 0.95, -0.28]),
      box(1.05, 0.1, 0.08, '#222222', [0, 2.35, 0.1]),
    ];
    for (const rz of [0.62, -0.62]) parts.push(box(1.5, 0.22, 0.04, white, [0, 3.05, 0.1], { rz }), box(1.3, 0.07, 0.05, red, [0, 3.05, 0.11], { rz }));
    const lamps = [-0.4, 0.4].map((lx) => {
      parts.push(cyl(0.2, 0.2, 0.1, '#1c1c1c', [lx, 2.35, 0.14], { rx: Math.PI / 2 }), ball(0.14, DIM.red, [lx, 2.35, 0.2], { sz: 0.4 }));
      return this.lamp(o, lx, 2.35, 0.23, LIT.red);
    });
    this.batch.add(parts);
    // The arm's pivot, just in front of the post: +x along the arm (to the drivers' left), raised
    // about the road's direction.
    const pivot = new THREE.Object3D();
    pivot.position.set(x - Math.sin(h) * 0.3, y + 1.05, z - Math.cos(h) * 0.3);
    pivot.rotation.set(0, h, ARM_OPEN, 'YXZ');
    pivot.scale.x = reach / this.armLength;
    this.group.add(pivot);
    this.arms.push(pivot);
    return { lamps, pivot };
  }

  /** A little tree for a roundabout's island. */
  tree(x, y, z) {
    this.batch.at(x, y, z, 0).add([
      cyl(0.14, 0.2, 1.4, '#6b4a33', [0, 0.7, 0]),
      cone(1.3, 2.6, '#3f7a3a', [0, 2.3, 0], undefined, 7),
      ball(0.5, '#5c9a42', [0.9, 0.3, 0.2]),
      ball(0.45, '#6aa84b', [-0.7, 0.25, -0.6]),
      ball(0.4, '#d9c04a', [-0.2, 0.2, 0.95]),
    ]);
  }

  /** The Instancers drawing every lamp and arm; call once, after the last post. */
  build() {
    if (this.lamps.length) {
      const lamps = new Instancer(ball(0.15, '#ffffff', [0, 0, 0], { sz: 0.45 }), UNLIT, this.lamps.length, { castShadow: false, receiveShadow: false });
      for (const [a, c] of this.lamps) lamps.add(a, c);
      this.group.add(lamps.mesh);
    }
    if (this.arms.length) {
      // Red and white stripes, the pivot at x = 0, a counterweight behind it.
      const stripes = [box(0.5, 0.3, 0.3, '#3a3a3a', [-0.3, 0, 0])];
      for (let i = 0, n = Math.round(this.armLength / 0.5); i < n; i++) stripes.push(box(0.5, 0.12, 0.08, i % 2 ? '#f4f4f0' : '#d0302a', [0.25 + i * 0.5, 0, 0]));
      const arms = new Instancer(mergeGeometries(stripes), VERTEX_COLORED, this.arms.length);
      for (const a of this.arms) arms.add(a, '#ffffff');
      this.group.add(arms.mesh);
    }
    return this.group;
  }
}
