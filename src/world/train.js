import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RAIL_TOP } from '../config.js';
import { approach, mulberry32 } from '../utils.js';
import { buildCarriageInterior, buildCabInterior, CARRIAGE_WINDOWS } from './interiors.js';
import { box, cyl, ball, segment, skinFigure, keep, VERTEX_COLORED } from './lowpoly.js';
import { Smoke } from './particles.js';

// Every rigid part of a car is baked into one vertex-coloured mesh; only moving parts stay separate.
const C = {
  dark: '#2b2522',
  black: '#1f1b19',
  green: '#2f6b4f',
  red: '#c8453a',
  gold: '#d9a441',
  roof: '#6b6461',
};
const ALONG = { rx: Math.PI / 2 }; // cylinder axis along the train (local z)

// One geometry per wheel size, shared by every wheel of that size.
const wheelGeos = new Map();
function wheelGeo(r) {
  if (!wheelGeos.has(r)) {
    const side = { rz: Math.PI / 2 };
    wheelGeos.set(r, keep(mergeGeometries([cyl(r, r, 0.18, C.black, [0, 0, 0], side, 14), cyl(r * 0.4, r * 0.4, 0.22, C.red, [0, 0, 0], side), box(0.2, r * 1.7, 0.14, C.red)])));
  }
  return wheelGeos.get(r);
}

function placed(mesh, x, y, z) {
  mesh.position.set(x, y, z);
  return mesh;
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
    this.stopId = 0; // increments on every arrival at a stop
    this.stops = [{ s: stationS, out: null }]; // see setStops()
    this.stopIndex = 0; // which stop the train is at / last left
    this.doorOpen = 0; // 0 = shut, 1 = fully open
    this.canDepart = () => true; // the station can hold the train while people board
    this.tunnel = null; // { contains(s) } — no smoke puffs inside the tunnel
    this.platformOut = null; // direction from the track to the platform (which doors to open)

    // Own materials (not the shared cache): their glow follows the time of day.
    this.windowMat = new THREE.MeshLambertMaterial({ color: '#3b4a5a', emissive: '#ffc766', emissiveIntensity: 0, flatShading: true });
    this.lampMat = new THREE.MeshLambertMaterial({ color: '#fff6d8', emissive: '#ffd27a', emissiveIntensity: 0.3, flatShading: true });

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

  // Moving parts (wheels, rods, doors) are bones; each car's vertex-coloured parts end up as ONE
  // skinned mesh (see skinFigure). Parts with their own materials (lamp, windows) stay separate.
  joint(mesh, x, y, z, parent) {
    const b = new THREE.Bone();
    b.position.set(x, y, z);
    b.add(mesh);
    parent.add(b);
    return b;
  }

  wheel(r, x, z, parent) {
    const w = this.joint(new THREE.Mesh(wheelGeo(r), VERTEX_COLORED), x, r, z, parent);
    w.userData.r = r;
    this.wheels.push(w);
    return w;
  }

  buildLoco() {
    const g = new THREE.Group();
    const root = new THREE.Bone();
    g.add(root);
    root.add(
      segment([
        box(2.0, 0.5, 7.2, C.dark, [0, 0.75, 0]),
        cyl(0.95, 0.95, 4.4, C.green, [0, 1.95, 1.1], ALONG, 12), // boiler
        ...[-0.2, 1.1, 2.4].map((z) => cyl(0.99, 0.99, 0.14, C.gold, [0, 1.95, z], ALONG, 12)),
        cyl(0.97, 0.97, 0.8, C.black, [0, 1.95, 3.35], ALONG, 12), // smokebox
        cyl(0.34, 0.26, 1.2, C.black, [0, 3.3, 3.2], {}, 10), // chimney + cap
        cyl(0.44, 0.4, 0.2, C.black, [0, 3.95, 3.2], {}, 10),
        ball(0.45, C.gold, [0, 2.85, 1.3], {}, 2), // steam dome
        box(2.2, 2.2, 2.2, C.green, [0, 2.3, -1.9]), // cab
        box(2.5, 0.2, 2.6, C.red, [0, 3.5, -1.9]),
        box(2.3, 0.45, 0.25, C.red, [0, 0.85, 3.7]), // buffer beam + cowcatcher
        box(2.0, 0.2, 0.9, C.red, [0, 0.45, 3.95], { rx: 0.6 }),
      ]),
    );
    g.add(placed(new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.4, 0.3), this.lampMat), 0, 3.1, 3.6));

    for (const z of [1.9, 0.5, -0.9]) for (const x of [-1.02, 1.02]) this.wheel(0.62, x, z, root);
    for (const x of [-1.16, 1.16]) this.rods.push(this.joint(segment([box(0.08, 0.12, 2.9, C.gold)]), x, 0.62, 0.5, root));
    skinFigure(g, root, VERTEX_COLORED);

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
    const root = new THREE.Bone();
    g.add(root);
    const body = [
      box(2.0, 0.4, 7.0, C.dark, [0, 0.7, 0]),
      box(2.34, 0.95, 7.0, lowerC, [0, 1.4, 0]),
      box(2.3, 1.05, 7.0, upperC, [0, 2.4, 0]),
      box(2.5, 0.22, 7.3, C.roof, [0, 3.03, 0]),
      box(2.0, 0.16, 7.1, C.roof, [0, 3.2, 0]),
      ...[-2.6, 2.6].map((z) => box(2.1, 0.25, 1.8, C.dark, [0, 0.45, z])), // bogies
    ];

    const panes = [];
    for (const side of [-1, 1]) {
      for (const z of CARRIAGE_WINDOWS) panes.push(new THREE.BoxGeometry(0.06, 0.62, 0.85).translate(side * 1.16, 2.45, z));
    }
    const windows = new THREE.Mesh(mergeGeometries(panes), this.windowMat);
    g.add(windows);
    g.userData.windows = windows;

    // Sliding doors at both ends on both sides, with a dark doorway behind them.
    g.userData.doors = [];
    const doorC = new THREE.Color(lowerC).multiplyScalar(0.7).getStyle();
    for (const side of [-1, 1]) {
      for (const end of [-1, 1]) {
        body.push(box(0.03, 1.6, 0.5, C.black, [side * 1.165, 1.72, end * 3.22]));
        const panel = segment([box(0.05, 1.65, 0.52, doorC), box(0.04, 0.05, 0.12, C.gold, [side * 0.03, 0, -end * 0.15])]);
        g.userData.doors.push({ panel: this.joint(panel, side * 1.19, 1.72, end * 3.22, root), end, side });
      }
    }
    root.add(segment(body));

    for (const z of [-3.15, -2.05, 2.05, 3.15]) for (const x of [-1.0, 1.0]) this.wheel(0.42, x, z, root);
    skinFigure(g, root, VERTEX_COLORED);
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

  // Every place the train calls at: s = where the locomotive halts, out = direction from the track
  // to that platform (which side's doors open).
  setStops(stops) {
    this.stops = stops;
    this.platformOut = stops[0].out;
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
      // The next stop ahead (skipping the one just left, which is right behind us).
      let ahead = Infinity, next = 0;
      this.stops.forEach((st, i) => {
        const d = this.track.wrap(st.s - this.s);
        if (d < ahead) {
          ahead = d;
          next = i;
        }
      });
      let target = cruise;
      if (ahead < 70) target = Math.min(cruise, Math.sqrt(2 * this.decel * Math.max(ahead - 0.3, 0)) + 0.4);
      this.v = approach(this.v, target, (target > this.v ? this.accel : this.decel * 1.6) * dt);
      // Also stop if this frame's step would carry us past the stop (long frames, fast time).
      if (cruise > 0 && (ahead < 0.6 || (ahead < 6 && this.v * dt >= ahead))) {
        this.state = 'stop';
        this.v = 0;
        this.stopTime = 0;
        this.stopId++;
        this.stopIndex = next;
        this.platformOut = this.stops[next].out;
        this.s = this.stops[next].s;
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
        this.s = this.stops[this.stopIndex].s + 0.01;
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
