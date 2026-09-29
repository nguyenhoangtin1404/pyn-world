import * as THREE from 'three';
import { RAIL_TOP } from '../config.js';
import { mulberry32 } from '../utils.js';
import { buildCarriageInterior, buildCabInterior } from './interiors.js';
import { Smoke } from './particles.js';
import { buildLoco, buildCarriage, LOCO_WHEEL, DOOR_Z } from './train/cars.js';
import { Schedule } from './train/schedule.js';

// A steam locomotive and three carriages running round the loop, calling at every stop. What it
// looks like is in train/cars.js, where it is and what it is doing (running, stopped, leaving) in
// train/schedule.js; this puts the cars on the track and animates wheels, rods, doors and smoke.
export class Train {
  // stationS: where the locomotive stops until setStops() — a little past the station centre so all
  // three carriages line up along the platform (which spans roughly s = -18…18).
  constructor(track, { stationS = 14 } = {}) {
    this.track = track;
    this.group = new THREE.Group();
    this.schedule = new Schedule({ wrap: (s) => track.wrap(s), stops: [{ s: stationS, out: null }] });
    this.schedule.onDepart = () => this.events.whistle();
    this.chuffAcc = 0;
    this.clackAcc = 0;
    this.idleSmoke = 0;
    this.wheelAngle = 0;
    this.wheels = [];
    this.rods = [];
    this.cars = [];
    this.events = { chuff() {}, clack() {}, whistle() {} };
    this.tunnel = null; // { contains(s) } — no smoke puffs inside the tunnel

    // Own materials (not the shared cache): their glow follows the time of day.
    this.windowMat = new THREE.MeshLambertMaterial({ color: '#3b4a5a', emissive: '#ffc766', emissiveIntensity: 0, flatShading: true });
    this.lampMat = new THREE.MeshLambertMaterial({ color: '#fff6d8', emissive: '#ffd27a', emissiveIntensity: 0.3, flatShading: true });

    const loco = buildLoco({ wheels: this.wheels, rods: this.rods, lampMat: this.lampMat });
    this.loco = loco.group;
    this.chimneyTop = loco.chimneyTop;
    this.headlight = loco.headlight;
    this.addCar(this.loco, 0);
    for (let i = 0; i < 3; i++) this.addCar(buildCarriage(i, { wheels: this.wheels, windowMat: this.windowMat }), 8.1 * (i + 1));

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

  // ---- the schedule, as the rest of the world sees it
  get s() {
    return this.schedule.s;
  }
  get v() {
    return this.schedule.v;
  }
  get state() {
    return this.schedule.state;
  }
  get stopped() {
    return this.schedule.stopped;
  }
  get stopId() {
    return this.schedule.stopId;
  }
  get stopIndex() {
    return this.schedule.stopIndex;
  }
  get doorOpen() {
    return this.schedule.doorOpen;
  }
  get platformOut() {
    return this.schedule.platformOut;
  }
  // The station can hold the train while people board (villagers set this).
  set canDepart(fn) {
    this.schedule.canDepart = fn;
  }

  // Every place the train calls at: s = where the locomotive halts, out = direction from the track
  // to that platform (which side's doors open).
  setStops(stops) {
    this.schedule.stops = stops;
  }

  addCar(obj, offset) {
    this.group.add(obj);
    this.cars.push({ obj, offset });
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

  // World position of a carriage door on the side facing `out` (a horizontal vector pointing at
  // the platform). carIndex 1..3, end ±1.
  doorPoint(carIndex, end, out, target = new THREE.Vector3()) {
    const car = this.cars[carIndex].obj;
    const xAxis = new THREE.Vector3(1, 0, 0).applyQuaternion(car.quaternion);
    const side = xAxis.dot(out) > 0 ? 1 : -1;
    return car.localToWorld(target.set(side * 1.25, 0.9, end * DOOR_Z));
  }

  update(dt, speedMul) {
    const ds = this.schedule.step(dt, speedMul);

    // Only the doors facing the platform open.
    const { doorOpen, platformOut } = this.schedule;
    for (let i = 1; i < this.cars.length; i++) {
      const car = this.cars[i].obj;
      const platformSide = platformOut ? (this._a.set(1, 0, 0).applyQuaternion(car.quaternion).dot(platformOut) > 0 ? 1 : -1) : 0;
      for (const d of car.userData.doors) {
        const open = !platformSide || d.side === platformSide ? doorOpen : 0;
        d.panel.position.z = d.end * (DOOR_Z - 0.55 * open);
      }
    }

    this.time += dt;
    if (this.cabin.group.visible) this.cabin.update(this.time);
    if (this.cab.group.visible) this.cab.update(this.time);

    this.place();

    // Wheels + coupling rods
    for (const w of this.wheels) w.rotation.x += ds / w.userData.r;
    this.wheelAngle += ds / LOCO_WHEEL;
    this.rods.forEach((rod) => {
      rod.position.y = LOCO_WHEEL + Math.sin(this.wheelAngle) * 0.25;
      rod.position.z = 0.5 + Math.cos(this.wheelAngle) * 0.25;
    });

    // Chuffs, rail joints, smoke
    this.chimneyTop.getWorldPosition(this._chimney);
    const inTunnel = this.tunnel?.contains(this.s);
    this.chuffAcc += ds;
    while (this.chuffAcc > 3.2) {
      this.chuffAcc -= 3.2;
      const k = this.v / this.schedule.cruise;
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

  // Each car sits on the rails between two points 2.6 units either side of its centre.
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
