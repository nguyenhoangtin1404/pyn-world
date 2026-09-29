import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RAIL_TOP } from '../config.js';
import { approach, mulberry32 } from '../utils.js';
import { buildCarriageInterior, buildCabInterior, CARRIAGE_WINDOWS } from './interiors.js';

const lam = (color, extra = {}) => new THREE.MeshLambertMaterial({ color, flatShading: true, ...extra });

function box(w, h, d, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

// Cylinder whose axis runs along local z (front/back of the train).
function cylZ(r, len, mat, seg = 12) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, seg).rotateX(Math.PI / 2), mat);
  m.castShadow = true;
  return m;
}

const MAT = {
  dark: lam('#2b2522'),
  black: lam('#1f1b19'),
  green: lam('#2f6b4f'),
  red: lam('#c8453a'),
  gold: lam('#d9a441'),
  roof: lam('#6b6461'),
};

class Smoke {
  constructor(n = 48) {
    this.group = new THREE.Group();
    const geo = new THREE.IcosahedronGeometry(1, 0);
    this.items = [];
    this.next = 0;
    for (let i = 0; i < n; i++) {
      const mat = new THREE.MeshLambertMaterial({ color: '#f4f1ec', transparent: true, opacity: 0, depthWrite: false, flatShading: true });
      const m = new THREE.Mesh(geo, mat);
      m.visible = false;
      this.group.add(m);
      this.items.push({ m, life: 0, max: 1, s0: 0.5, vel: new THREE.Vector3() });
    }
  }

  emit(pos, strength = 1) {
    const it = this.items[this.next++ % this.items.length];
    it.life = 0;
    it.max = 2.2 + Math.random() * 1.2;
    it.s0 = 0.35 + 0.25 * strength;
    it.m.position.copy(pos);
    it.vel.set((Math.random() - 0.5) * 0.6, 2.4 + Math.random() * 1.2 * strength, (Math.random() - 0.5) * 0.6);
    it.m.rotation.set(Math.random() * 3, Math.random() * 3, 0);
    it.m.visible = true;
  }

  update(dt) {
    for (const it of this.items) {
      if (!it.m.visible) continue;
      it.life += dt;
      const k = it.life / it.max;
      if (k >= 1) {
        it.m.visible = false;
        continue;
      }
      it.vel.y *= 1 - 0.6 * dt;
      it.m.position.addScaledVector(it.vel, dt);
      it.m.position.x += 0.8 * dt; // light breeze
      it.m.scale.setScalar(it.s0 + k * 2.4);
      it.m.rotation.y += dt * 0.4;
      it.m.material.opacity = 0.8 * Math.pow(1 - k, 1.5);
    }
  }
}

export class Train {
  // stationS: where the locomotive stops — a little past the station centre so all three
  // carriages line up along the platform (which spans roughly s = -18…18).
  constructor(track, { stationS = 14 } = {}) {
    this.track = track;
    this.L = track.length;
    this.stationS = stationS;
    this.group = new THREE.Group();
    this.s = 60;
    this.v = 0;
    this.cruise = 13;
    this.accel = 1.4;
    this.decel = 2.0;
    this.state = 'run';
    this.wait = 0;
    this.chuffAcc = 0;
    this.clackAcc = 0;
    this.idleSmoke = 0;
    this.wheelAngle = 0;
    this.wheels = [];
    this.rods = [];
    this.cars = [];
    this.events = { chuff() {}, clack() {}, whistle() {} };
    this.stopTime = 0;
    this.closeTime = 0;
    this.stopId = 0; // increments on every arrival at the station
    this.doorOpen = 0; // 0 = shut, 1 = fully open
    this.canDepart = () => true; // the station can hold the train while people board
    this.tunnel = null; // { contains(s) } — no smoke puffs inside the tunnel
    this.platformOut = null; // direction from the track to the platform (which doors to open)

    this.windowMat = lam('#3b4a5a', { emissive: '#ffc766', emissiveIntensity: 0 });
    this.lampMat = lam('#fff6d8', { emissive: '#ffd27a', emissiveIntensity: 0.3 });

    this.loco = this.buildLoco();
    this.addCar(this.loco, 0);
    for (let i = 0; i < 3; i++) this.addCar(this.buildCarriage(i), 8.1 * (i + 1));

    // Interiors for the passenger (car 1) and driver views
    this.cabin = buildCarriageInterior(mulberry32(42));
    this.cars[1].obj.add(this.cabin.group);
    this.cab = buildCabInterior();
    this.loco.add(this.cab.group);
    this.time = 0;

    this.smoke = new Smoke();
    this.group.add(this.smoke.group);
    this.locoPos = new THREE.Vector3();
    this._a = new THREE.Vector3();
    this._b = new THREE.Vector3();
    this._chimney = new THREE.Vector3();
    this.place();
  }

  addCar(obj, offset) {
    this.group.add(obj);
    this.cars.push({ obj, offset });
  }

  wheel(r, x, z, parent) {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.18, 14).rotateZ(Math.PI / 2), MAT.black));
    g.add(new THREE.Mesh(new THREE.CylinderGeometry(r * 0.4, r * 0.4, 0.22, 8).rotateZ(Math.PI / 2), MAT.red));
    g.add(new THREE.Mesh(new THREE.BoxGeometry(0.2, r * 1.7, 0.14), MAT.red));
    g.position.set(x, r, z);
    g.userData.r = r;
    g.children.forEach((m) => (m.castShadow = true));
    parent.add(g);
    this.wheels.push(g);
    return g;
  }

  buildLoco() {
    const g = new THREE.Group();
    g.add(box(2.0, 0.5, 7.2, MAT.dark, 0, 0.75, 0));

    const boiler = cylZ(0.95, 4.4, MAT.green);
    boiler.position.set(0, 1.95, 1.1);
    g.add(boiler);
    for (const z of [-0.2, 1.1, 2.4]) {
      const band = cylZ(0.99, 0.14, MAT.gold);
      band.position.set(0, 1.95, z);
      g.add(band);
    }
    const smokebox = cylZ(0.97, 0.8, MAT.black);
    smokebox.position.set(0, 1.95, 3.35);
    g.add(smokebox);

    const chimney = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.26, 1.2, 10), MAT.black);
    chimney.position.set(0, 3.3, 3.2);
    chimney.castShadow = true;
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.44, 0.4, 0.2, 10), MAT.black);
    cap.position.set(0, 3.95, 3.2);
    const dome = new THREE.Mesh(new THREE.SphereGeometry(0.45, 10, 8), MAT.gold);
    dome.position.set(0, 2.85, 1.3);
    g.add(chimney, cap, dome);

    g.add(box(2.2, 2.2, 2.2, MAT.green, 0, 2.3, -1.9));
    g.add(box(2.5, 0.2, 2.6, MAT.red, 0, 3.5, -1.9));
    g.add(box(2.3, 0.45, 0.25, MAT.red, 0, 0.85, 3.7));
    const catcher = box(2.0, 0.2, 0.9, MAT.red, 0, 0.45, 3.95);
    catcher.rotation.x = 0.6;
    g.add(catcher);
    g.add(box(0.45, 0.4, 0.3, this.lampMat, 0, 3.1, 3.6));

    for (const z of [1.9, 0.5, -0.9]) for (const x of [-1.02, 1.02]) this.wheel(0.62, x, z, g);
    for (const x of [-1.16, 1.16]) {
      const rod = box(0.08, 0.12, 2.9, MAT.gold, x, 0.62, 0.5);
      g.add(rod);
      this.rods.push(rod);
    }

    this.chimneyTop = new THREE.Object3D();
    this.chimneyTop.position.set(0, 4.1, 3.2);
    g.add(this.chimneyTop);

    this.headlight = new THREE.SpotLight('#ffe7b0', 0, 90, 0.45, 0.6, 1);
    this.headlight.position.set(0, 3.1, 3.8);
    const hlTarget = new THREE.Object3D();
    hlTarget.position.set(0, 0, 30);
    g.add(this.headlight, hlTarget);
    this.headlight.target = hlTarget;
    return g;
  }

  buildCarriage(i) {
    const [lowerC, upperC] = [
      ['#8e3b35', '#f1e3c3'],
      ['#2f5d7c', '#f1e3c3'],
      ['#6d8b3a', '#f4ead2'],
    ][i % 3];
    const g = new THREE.Group();
    g.add(box(2.0, 0.4, 7.0, MAT.dark, 0, 0.7, 0));
    g.add(box(2.34, 0.95, 7.0, lam(lowerC), 0, 1.4, 0));
    g.add(box(2.3, 1.05, 7.0, lam(upperC), 0, 2.4, 0));
    g.add(box(2.5, 0.22, 7.3, MAT.roof, 0, 3.03, 0));
    g.add(box(2.0, 0.16, 7.1, MAT.roof, 0, 3.2, 0));

    const panes = [];
    for (const side of [-1, 1]) {
      for (const z of CARRIAGE_WINDOWS) panes.push(new THREE.BoxGeometry(0.06, 0.62, 0.85).translate(side * 1.16, 2.45, z));
    }
    const windows = new THREE.Mesh(mergeGeometries(panes), this.windowMat);
    g.add(windows);
    g.userData.windows = windows;

    // Sliding doors at both ends on both sides, with a dark doorway behind them.
    g.userData.doors = [];
    const doorMat = lam(new THREE.Color(lowerC).multiplyScalar(0.7).getStyle());
    for (const side of [-1, 1]) {
      for (const end of [-1, 1]) {
        g.add(box(0.03, 1.6, 0.5, MAT.black, side * 1.165, 1.72, end * 3.22));
        const panel = box(0.05, 1.65, 0.52, doorMat, side * 1.19, 1.72, end * 3.22);
        panel.add(box(0.04, 0.05, 0.12, MAT.gold, side * 0.03, 0, -end * 0.15));
        g.add(panel);
        g.userData.doors.push({ panel, end, side });
      }
    }

    for (const z of [-2.6, 2.6]) g.add(box(2.1, 0.25, 1.8, MAT.dark, 0, 0.45, z));
    for (const z of [-3.15, -2.05, 2.05, 3.15]) for (const x of [-1.0, 1.0]) this.wheel(0.42, x, z, g);
    return g;
  }

  setPassengerView(on) {
    this.cars[1].obj.userData.windows.visible = !on;
    this.cabin.group.visible = on;
  }

  setDriverView(on) {
    this.cab.group.visible = on;
  }

  setLights(l) {
    this.windowMat.emissiveIntensity = l * 1.4;
    this.lampMat.emissiveIntensity = 0.3 + l * 1.8;
    this.headlight.intensity = l * 60;
  }

  get stopped() {
    return this.state !== 'run';
  }

  // World position of a carriage door on the side facing `out` (a horizontal vector pointing at
  // the platform). carIndex 1..3, end ±1.
  doorPoint(carIndex, end, out, target = new THREE.Vector3()) {
    const car = this.cars[carIndex].obj;
    const xAxis = new THREE.Vector3(1, 0, 0).applyQuaternion(car.quaternion);
    const side = xAxis.dot(out) > 0 ? 1 : -1;
    return car.localToWorld(target.set(side * 1.25, 0.9, end * 3.22));
  }

  update(dt, speedMul) {
    const cruise = this.cruise * speedMul;
    if (this.state === 'run') {
      const ahead = this.track.wrap(this.stationS - this.s);
      let target = cruise;
      if (ahead < 70) target = Math.min(cruise, Math.sqrt(2 * this.decel * Math.max(ahead - 0.3, 0)) + 0.4);
      this.v = approach(this.v, target, (target > this.v ? this.accel : this.decel * 1.6) * dt);
      if (ahead < 0.6 && cruise > 0) {
        this.state = 'stop';
        this.v = 0;
        this.stopTime = 0;
        this.stopId++;
        this.s = this.stationS;
      }
    } else if (this.state === 'stop') {
      // Doors open after a moment; leave once everyone is aboard (or after a maximum wait).
      this.v = 0;
      this.stopTime += dt;
      if (cruise > 0 && ((this.stopTime > 12 && this.canDepart()) || this.stopTime > 30)) {
        this.state = 'closing';
        this.closeTime = 0;
      }
    } else {
      this.closeTime += dt;
      if (this.closeTime > 1.6) {
        this.state = 'run';
        this.s = this.stationS + 0.01;
        this.events.whistle();
      }
    }
    const doorTarget = this.state === 'stop' && this.stopTime > 1 ? 1 : 0;
    this.doorOpen = approach(this.doorOpen, doorTarget, dt * 1.4);
    for (let i = 1; i < this.cars.length; i++) {
      const car = this.cars[i].obj;
      // Only the doors facing the platform open.
      const platformSide = this.platformOut ? (this._a.set(1, 0, 0).applyQuaternion(car.quaternion).dot(this.platformOut) > 0 ? 1 : -1) : 0;
      for (const d of car.userData.doors) {
        const open = !platformSide || d.side === platformSide ? this.doorOpen : 0;
        d.panel.position.z = d.end * (3.22 - 0.55 * open);
      }
    }

    this.time += dt;
    if (this.cabin.group.visible) this.cabin.update(this.time);
    if (this.cab.group.visible) this.cab.update(this.time);

    const ds = this.v * dt;
    this.s = this.track.wrap(this.s + ds);
    this.place();

    // Wheels + coupling rods
    for (const w of this.wheels) w.rotation.x += ds / w.userData.r;
    this.wheelAngle += ds / 0.62;
    this.rods.forEach((rod) => {
      rod.position.y = 0.62 + Math.sin(this.wheelAngle) * 0.25;
      rod.position.z = 0.5 + Math.cos(this.wheelAngle) * 0.25;
    });

    // Chuffs, rail joints, smoke
    this.chimneyTop.getWorldPosition(this._chimney);
    const inTunnel = this.tunnel?.contains(this.s);
    this.chuffAcc += ds;
    while (this.chuffAcc > 3.2) {
      this.chuffAcc -= 3.2;
      const k = this.v / this.cruise;
      this.events.chuff(k);
      if (!inTunnel) this.smoke.emit(this._chimney, 0.6 + k * 0.6);
    }
    this.clackAcc += ds;
    while (this.clackAcc > 11) {
      this.clackAcc -= 11;
      this.events.clack();
    }
    if (this.v < 0.5 && dt > 0) {
      this.idleSmoke -= dt;
      if (this.idleSmoke <= 0) {
        this.idleSmoke = 0.9;
        this.smoke.emit(this._chimney, 0.3);
      }
    }
    this.smoke.update(dt);
  }

  place() {
    const a = this._a, b = this._b;
    for (const car of this.cars) {
      const sc = this.s - car.offset;
      this.track.pointAt(sc + 2.6, a);
      this.track.pointAt(sc - 2.6, b);
      car.obj.position.copy(a).add(b).multiplyScalar(0.5);
      car.obj.position.y = RAIL_TOP;
      a.y = RAIL_TOP;
      car.obj.lookAt(a);
    }
    this.loco.getWorldPosition(this.locoPos);
  }
}
