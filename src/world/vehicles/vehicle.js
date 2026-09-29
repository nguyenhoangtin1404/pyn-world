import { approach, clamp, lerp } from '../../utils.js';
import { Person } from '../people.js';
import { KINDS } from './kinds.js';

const G = 9.8; // how far bikes lean and planes bank in a turn: tan(angle) = v² × curvature / G

// One vehicle going round a LoopPath: on the ground (following the terrain) or, for a plane, in the
// air. Wheels turn by the distance covered, bikes lean into the turns and their riders pedal,
// planes bank and climb and dive gently. Speed: towards `cruise`, but never over the `limit` the
// traffic gives it each frame (the car ahead, someone crossing).
export class Vehicle {
  /**
   * @param {object} o
   * @param {string} o.kind KINDS id
   * @param {import('./fleet.js').Fleet} o.fleet draws it
   * @param {import('./path.js').LoopPath} o.path
   * @param {number} o.s starting distance along the path
   * @param {() => number} o.rng
   * @param {(x: number, z: number) => number} [o.heightAt] ground under it (road vehicles)
   * @param {number} [o.altitude] flying height (planes), ±amplitude as it goes round
   * @param {number} [o.amplitude]
   */
  constructor({ kind, fleet, path, s, rng, heightAt, altitude = 90, amplitude = 8 }) {
    this.kind = kind;
    this.spec = KINDS[kind];
    this.path = path;
    this.s = path.wrap(s);
    this.heightAt = heightAt;
    this.altitude = altitude;
    this.amplitude = amplitude;
    const [lo, hi] = this.spec.speed;
    this.cruise = lerp(lo, hi, rng());
    this.v = this.spec.flies ? this.cruise : 0; // planes are already flying
    this.limit = Infinity;
    this.stops = undefined; // stop points on its route (world/vehicles/traffic.js), set by the traffic
    this.color = this.spec.colors[Math.floor(rng() * this.spec.colors.length)];
    const { group, wheels, prop } = fleet.add(kind, this.color);
    this.group = group; // the anchor the fleet draws the body at (in the scene)
    this.wheels = wheels;
    this.prop = prop;
    this.crank = 0;
    this.rider = this.spec.rider ? seat(rider(rng), this.spec.rider, this.group) : null;
    this.place();
  }

  get length() {
    return this.spec.length;
  }

  update(dt) {
    if (dt === 0) return;
    const want = Math.min(this.cruise, this.limit);
    this.v = approach(this.v, want, (want > this.v ? 2.5 : 9) * dt);
    const ds = this.v * dt;
    this.s = this.path.wrap(this.s + ds);
    for (const w of this.wheels) w.rotation.x += ds / this.spec.wheelR;
    if (this.prop) this.prop.rotation.z += dt * 45;
    if (this.rider?.pedal) {
      this.crank += ds / 0.34 / 1.6; // pedals turn slower than the wheels (gearing)
      pedal(this.rider.person, this.crank);
    }
    this.place();
  }

  place() {
    const { path, group, spec } = this;
    const [x, z] = path.pointAt(this.s);
    const heading = path.headingAt(this.s);
    const turn = Math.atan((this.v * this.v * path.curvatureAt(this.s)) / G);
    if (spec.flies) {
      const k = (this.s / path.length) * Math.PI * 2;
      group.position.set(x, this.altitude + Math.sin(k * 2) * this.amplitude, z);
      // Bank into the turn; nose up while climbing.
      group.rotation.set(-Math.cos(k * 2) * 0.08, heading, -clamp(turn, -0.6, 0.6), 'YXZ');
    } else {
      group.position.set(x, this.heightAt(x, z), z);
      // Two wheels lean into the turn; four wheels stay upright.
      group.rotation.set(0, heading, this.rider ? -clamp(turn, -0.45, 0.45) : 0, 'YXZ');
    }
  }
}

// Someone to ride: both hands free (no basket or bag).
function rider(rng) {
  let p;
  do p = new Person(rng, { kind: 'villager' });
  while (p.carry);
  return p;
}

// Sit a person on a saddle: hips at the seat, hands forward on the handlebar, leaning forward.
function seat(person, { seat: [x, y, z], lean, pedal }, parent) {
  const s = person.group.scale.x;
  person.group.position.set(x, y - 0.92 * s, z); // hips are 0.92 above the soles
  person.root.rotation.x = lean;
  person.shoulders.forEach((sh, i) => sh.rotation.set(-1.25 + lean, 0, i ? 0.12 : -0.12));
  person.elbows.forEach((e) => (e.rotation.x = -0.25));
  person.hips.forEach((h) => (h.rotation.x = -1.35));
  person.knees.forEach((k) => (k.rotation.x = 1.45));
  parent.add(person.group);
  return { person, pedal };
}

// Legs going round the cranks: each leg half a turn behind the other.
function pedal(person, crank) {
  person.hips.forEach((h, i) => (h.rotation.x = -1.3 + Math.sin(crank + i * Math.PI) * 0.3));
  person.knees.forEach((k, i) => (k.rotation.x = 1.35 + Math.cos(crank + i * Math.PI) * 0.4));
}
