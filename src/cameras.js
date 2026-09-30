import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TRACK_Y, BASE_Y } from './config.js';
import { clamp, easeInOut } from './utils.js';
import { PASSENGER_SEAT, DRIVER_SEAT } from './world/interiors.js';

export const CAMERA_MODES = [
  { id: 'overview', label: 'Toàn cảnh', key: '1' },
  { id: 'train', label: 'Theo tàu', key: '2' },
  { id: 'bridge', label: 'Cây cầu', key: '3' },
  { id: 'passenger', label: 'Hành khách', key: '4' },
  { id: 'driver', label: 'Lái tàu', key: '5' },
  { id: 'person', label: 'Theo người', key: '6' },
  { id: 'bird', label: 'Theo chim', key: '7' },
  { id: 'vehicle', label: 'Theo xe', key: '8' },
];

// Chase-camera framing for the follow modes: distance behind, height above, and the point looked at.
const FOLLOW = {
  person: { back: 6, up: 2.6, look: 1.3, list: 'people' },
  bird: { back: 7, up: 1.8, look: 0.2, list: 'birds' },
  vehicle: { back: 11, up: 4.5, look: 1.2, list: 'vehicles' },
};

const LOOK_MODES = new Set(['passenger', 'driver']);
const UP = new THREE.Vector3(0, 1, 0);
// Overview camera for a 600-unit world; scaled with the world's size.
const HOME_POS = new THREE.Vector3(250, 190, 290);
const HOME_TARGET = new THREE.Vector3(0, 0, 0);
const HOME_SIZE = 600;

// Where the camera sits inside a car (local space, +z = forward) and which way it looks.
// Base yaw: π looks forward (+z), -π/2 looks out of the right-hand window. Passengers start looking
// diagonally forward so the window and the seats across the table are both in view.
const SEATS = {
  passenger: { car: 1, pos: PASSENGER_SEAT, yaw: Math.PI, startYaw: 0.75, pitch: -0.12, yawLimit: 2.6 },
  driver: { car: 0, pos: DRIVER_SEAT, yaw: Math.PI, startYaw: 0, pitch: -0.12, yawLimit: 2.6 },
};

// One rig for the whole app (it listens to the keyboard and pointer); attach() points it at the
// world being shown.
export class CameraRig {
  constructor(camera, dom) {
    this.camera = camera;
    this.dom = dom;
    this.homePos = HOME_POS.clone();
    this.size = HOME_SIZE;
    this.followIndex = {}; // mode → index in its list of who is followed
    this.followTarget = null;
    this.occludedFor = 0;
    this.mode = 'overview';
    this.bridgeIndex = 0;
    this.keys = new Set();
    this.yaw = 0;
    this.pitch = 0;
    this.fly = null;
    this.focus = new THREE.Vector3();
    this.prevFollow = new THREE.Vector3();
    this._v = new THREE.Vector3();
    this._q = new THREE.Quaternion();
    this._e = new THREE.Euler(0, 0, 0, 'YXZ');

    const c = (this.controls = new OrbitControls(camera, dom));
    c.enableDamping = true;
    c.dampingFactor = 0.08;
    c.zoomToCursor = true;
    c.minDistance = 3;
    c.maxDistance = 460;
    c.maxPolarAngle = Math.PI * 0.49;
    c.screenSpacePanning = false;

    addEventListener('keydown', (e) => {
      if (e.target.closest?.('input, select, textarea')) return;
      this.keys.add(e.code);
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());

    let drag = null;
    dom.addEventListener('pointerdown', (e) => {
      if (!this.isLook) return;
      drag = { x: e.clientX, y: e.clientY };
      dom.setPointerCapture(e.pointerId);
    });
    dom.addEventListener('pointermove', (e) => {
      if (!drag) return;
      const seat = SEATS[this.mode];
      this.yaw = clamp(this.yaw - (e.clientX - drag.x) * 0.0035, -seat.yawLimit, seat.yawLimit);
      this.pitch = clamp(this.pitch - (e.clientY - drag.y) * 0.0035, -1.1, 1.1);
      drag = { x: e.clientX, y: e.clientY };
    });
    const end = () => (drag = null);
    dom.addEventListener('pointerup', end);
    dom.addEventListener('pointercancel', end);
  }

  // What the rig needs from a world. Starts over in the overview, above the new world.
  attach({ train, bridges, heightAt, followables, occludes, size }) {
    this.train = train;
    this.bridges = bridges;
    this.heightAt = heightAt;
    // { people: [...], birds: [...] }, each entry { label, anchor() → Object3D }
    this.followables = followables || { people: [], birds: [], vehicles: [] };
    this.occludes = occludes || (() => false); // (a, b) → is the view blocked by scenery?
    this.size = size;
    this.homePos = HOME_POS.clone().multiplyScalar(size / HOME_SIZE);
    this.followIndex = {}; // mode → index in its list of who is followed
    this.followTarget = null;
    this.bridgeIndex = 0;
    this.setMode('overview', { fly: false });
    this.camera.position.copy(this.homePos);
    this.controls.target.copy(HOME_TARGET);
    this.controls.update();
  }

  get isLook() {
    return LOOK_MODES.has(this.mode);
  }

  get followLabel() {
    return FOLLOW[this.mode] && this.followTarget ? this.followTarget.label : null;
  }

  // Returns false (and changes nothing) for a follow mode with nothing to follow in this world, or
  // a train camera in a world without a train.
  setMode(mode, { fly = true } = {}) {
    if (!this.train && (mode === 'train' || LOOK_MODES.has(mode))) return false;
    // Pressing the same follow key again moves on to the next person / bird / vehicle.
    if (FOLLOW[mode]) {
      const list = this.followables[FOLLOW[mode].list];
      if (!list.length) return false;
      this.followIndex[mode] = ((this.followIndex[mode] ?? -1) + 1) % list.length;
      this.followTarget = list[this.followIndex[mode]];
    }
    this.mode = mode;
    this.fly = null;
    this.train?.setPassengerView(mode === 'passenger');
    this.train?.setDriverView(mode === 'driver');
    this.controls.enabled = !LOOK_MODES.has(mode);
    this.camera.near = LOOK_MODES.has(mode) ? 0.05 : 0.1;
    this.camera.fov = LOOK_MODES.has(mode) ? 75 : 50; // wider lens inside the cramped cabins
    this.camera.updateProjectionMatrix();

    if (LOOK_MODES.has(mode)) {
      this.yaw = SEATS[mode].startYaw;
      this.pitch = SEATS[mode].pitch;
    } else if (mode === 'overview') {
      if (fly) this.flyTo(this.homePos, HOME_TARGET);
    } else if (mode === 'train') {
      const loco = this.train.loco;
      const k = this.train.k ?? 1; // a train drawn smaller: the camera closer
      const p = loco.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 2 * k, 0));
      const fwd = loco.getWorldDirection(new THREE.Vector3());
      const side = new THREE.Vector3().crossVectors(fwd, UP);
      this.camera.position.copy(p).addScaledVector(fwd, -16 * k).addScaledVector(side, 10 * k).add(new THREE.Vector3(0, 8 * k, 0));
      this.controls.target.copy(p);
      this.prevFollow.copy(p);
    } else if (mode === 'bridge') {
      this.showBridge(this.bridgeIndex);
    } else if (FOLLOW[mode]) {
      this.placeFollowCamera();
    }
    return true;
  }

  // Put the chase camera behind the subject — or, if a wall or tree is in the way, at the first
  // angle around them with a clear view. After that the user can orbit freely.
  placeFollowCamera() {
    const f = FOLLOW[this.mode];
    const obj = this.followTarget.anchor();
    const p = obj.getWorldPosition(new THREE.Vector3());
    p.y += f.look;
    const fwd = obj.getWorldDirection(new THREE.Vector3());
    const behind = Math.atan2(-fwd.x, -fwd.z);
    const cand = new THREE.Vector3();
    let found = false;
    for (const d of [0, 0.6, -0.6, 1.2, -1.2, 1.9, -1.9, Math.PI]) {
      cand.set(p.x + Math.sin(behind + d) * f.back, p.y + f.up, p.z + Math.cos(behind + d) * f.back);
      if (cand.y > this.heightAt(cand.x, cand.z) + 1 && this.clearView(p, cand)) {
        found = true;
        break;
      }
    }
    if (!found) cand.set(p.x, p.y + f.back + f.up, p.z + 0.5); // straight overhead
    this.camera.position.copy(cand);
    this.controls.target.copy(p);
    this.prevFollow.copy(p);
    this.occludedFor = 0;
  }

  // Nothing solid (buildings, trees, the ground or the tunnel hill) between a and b?
  clearView(a, b) {
    const n = Math.ceil(a.distanceTo(b) / 1.5);
    for (let i = 1; i < n; i++) {
      const t = i / n;
      const x = a.x + (b.x - a.x) * t, z = a.z + (b.z - a.z) * t;
      if (a.y + (b.y - a.y) * t < this.heightAt(x, z)) return false;
    }
    return !this.occludes(a, b);
  }

  nextBridge() {
    if (!this.bridges.length) return;
    if (this.mode === 'bridge') this.bridgeIndex = (this.bridgeIndex + 1) % this.bridges.length;
    this.setMode('bridge');
  }

  showBridge(i) {
    const b = this.bridges[i];
    if (!b) return;
    const target = b.center.clone().setY(TRACK_Y);
    // Try both sides of the bridge and keep the one with the lowest ground (usually the river).
    let best = null;
    for (const s of [1, -1]) {
      for (const along of [10, -10, 0]) {
        const p = b.center.clone().addScaledVector(b.side, 26 * s).addScaledVector(b.tangent, along);
        const g = this.heightAt(p.x, p.z);
        if (!best || g < best.g) best = { p, g };
      }
    }
    const pos = best.p.setY(Math.max(TRACK_Y + 2, best.g + 3));
    this.camera.position.copy(pos);
    this.controls.target.copy(target);
  }

  flyTo(pos, target, dur = 1.6) {
    this.fly = { p0: this.camera.position.clone(), t0: this.controls.target.clone(), p1: pos.clone(), t1: target.clone(), t: 0, dur };
  }

  // `view`: how far back to stand, × the usual (a tall landmark needs more room than a sheep).
  flyToSpot(spot, view = 1) {
    if (this.mode !== 'overview') this.setMode('overview', { fly: false });
    const target = spot.clone().add(new THREE.Vector3(0, 1.2, 0));
    this.flyTo(target.clone().add(new THREE.Vector3(7 * view, 4 * view, 9 * view)), target, 2.0);
  }

  update(dt) {
    const cam = this.camera;
    const c = this.controls;

    if (this.isLook) {
      const seat = SEATS[this.mode];
      const car = this.train.cars[seat.car].obj;
      cam.position.copy(seat.pos);
      car.localToWorld(cam.position);
      car.getWorldQuaternion(this._q);
      this._e.set(this.pitch, seat.yaw + this.yaw, 0);
      cam.quaternion.copy(this._q).multiply(new THREE.Quaternion().setFromEuler(this._e));
      this.focus.copy(cam.position);
      return;
    }

    if (this.fly) {
      const f = this.fly;
      f.t += dt;
      const k = easeInOut(Math.min(1, f.t / f.dur));
      cam.position.lerpVectors(f.p0, f.p1, k);
      c.target.lerpVectors(f.t0, f.t1, k);
      if (f.t >= f.dur) this.fly = null;
    }

    if (this.mode === 'train') {
      const p = this._v.copy(this.train.locoPos).addScaledVector(UP, 2 * (this.train.k ?? 1));
      const delta = p.clone().sub(this.prevFollow);
      cam.position.add(delta);
      c.target.copy(p);
      this.prevFollow.copy(p);
    }

    if (FOLLOW[this.mode] && this.followTarget) {
      // Carry the camera along with the subject (keeps whatever orbit the user has set).
      const p = this.followTarget.anchor().getWorldPosition(this._v);
      p.y += FOLLOW[this.mode].look;
      cam.position.add(p.clone().sub(this.prevFollow));
      c.target.copy(p);
      this.prevFollow.copy(p);
      // If they walk behind something for a moment, cut to a clear angle.
      this.checkTimer = (this.checkTimer ?? 0) - dt;
      if (this.checkTimer <= 0) {
        this.checkTimer = 0.5;
        this.occludedFor = this.clearView(p, cam.position) ? 0 : this.occludedFor + 0.5;
        if (this.occludedFor >= 1) this.placeFollowCamera();
      }
    }

    if (this.mode === 'overview' && !this.fly) this.move(dt);

    // Keep the orbit pivot on the diorama so the camera can't wander off into the void.
    const lim = this.size / 2 - 10;
    c.target.x = clamp(c.target.x, -lim, lim);
    c.target.z = clamp(c.target.z, -lim, lim);
    c.target.y = clamp(c.target.y, -5, 120);

    c.update();

    // Never go below the ground (or below the plinth when looking at it from outside).
    const half = this.size / 2;
    const inside = Math.abs(cam.position.x) < half && Math.abs(cam.position.z) < half;
    const g = inside ? this.heightAt(cam.position.x, cam.position.z) + 1.2 : BASE_Y - 8;
    if (cam.position.y < g) cam.position.y = g;
    this.focus.copy(c.target);
  }

  move(dt) {
    const k = this.keys;
    const f = (k.has('KeyW') ? 1 : 0) - (k.has('KeyS') ? 1 : 0);
    const r = (k.has('KeyD') ? 1 : 0) - (k.has('KeyA') ? 1 : 0);
    const u = (k.has('KeyE') ? 1 : 0) - (k.has('KeyQ') ? 1 : 0);
    if (!f && !r && !u) return;
    const cam = this.camera;
    const fwd = cam.getWorldDirection(new THREE.Vector3()).setY(0).normalize();
    const right = new THREE.Vector3().crossVectors(fwd, UP);
    const dist = cam.position.distanceTo(this.controls.target);
    const fast = k.has('ShiftLeft') || k.has('ShiftRight') ? 3 : 1;
    const speed = (25 + dist * 0.6) * fast * dt;
    const d = new THREE.Vector3().addScaledVector(fwd, f * speed).addScaledVector(right, r * speed).addScaledVector(UP, u * speed);
    cam.position.add(d);
    this.controls.target.add(d);
  }
}
