import { approach, clamp, lerp } from '../../utils.js';
import { Person } from '../people.js';
import { KINDS } from './kinds.js';

const CORNER = 3.5; // sideways acceleration a vehicle takes in a bend: v² × curvature, at most
const G = 9.8; // how far bikes lean and planes bank in a turn: tan(angle) = v² × curvature / G

// One vehicle going round a LoopPath: on the ground (following the terrain) or, for a plane, in the
// air. Wheels turn by the distance covered, bikes lean into the turns and their riders pedal,
// planes bank and climb and dive gently. Speed: towards `cruise`, but never over the `limit` the
// traffic gives it each frame (the car ahead, someone crossing).
// `k`: drawn k times the size it was built at (world.scale.props). Its path, speeds and the traffic
// rules then all work in the model's own units (world / k), like the train's schedule; only where
// it is drawn is multiplied back by k.
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
   * @param {number} [o.k] size (path and speeds in model units = world / k)
   */
  constructor({ kind, fleet, path, s, rng, heightAt, altitude = 90, amplitude = 8, k = 1 }) {
    this.kind = kind;
    this.k = k;
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
    this.route = 0; // which of the traffic's routes it is on (features/citytraffic.js, which turns it into another)
    /** @type {{ length: number, to: number, s1: number } | null} on a connector between two streets: how long it is, where it hands the vehicle on */
    this.turn = null;
    this.turns = 0; // turns made
    /** @type {'dwell' | 'done' | 'gone' | undefined} a bus at its stop (features/busstop.js): stopped to let people on and off, done, past the stop */
    this.busState = undefined;
    this.dwell = 0; // seconds stopped at the stop
    this.shift = 0; // sideways off its lane, to the right, in model units (a bus pulling in to the kerb: features/busstop.js, which sets it)
    this.yawLat = 0; // the turn of its nose while it shifts (eased)
    this.lastShift = 0;
    /** @type {{ party: any, at: number }[]} passengers still to get off, and when (seconds into the stop) */
    this.alightQ = [];
    this.color = this.spec.colors[Math.floor(rng() * this.spec.colors.length)];
    const { group, wheels, prop, lamps } = fleet.add(kind, this.color);
    this.lamps = lamps; // head/tail light anchors and the pool of light ahead (fleet.js), or null
    this.braking = false;
    this.group = group; // the anchor the fleet draws the body at (in the scene)
    group.scale.setScalar(k);
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
    // Slower into a tight bend (a U-turn at a street's end): lean no more than the bike can, as the road allows.
    const bend = this.spec.flies ? 0 : Math.max(Math.abs(this.path.curvatureAt(this.s)), Math.abs(this.path.curvatureAt(this.path.wrap(this.s + 3))));
    const want = Math.min(this.cruise, this.limit, bend > 0 ? Math.max(1.5, Math.sqrt(CORNER / bend)) : Infinity);
    // Brake lights: slowing down hard, or held at a standstill.
    this.braking = want < this.v - 0.5 || (this.v < 0.2 && this.limit < 0.5);
    this.v = approach(this.v, want, (want > this.v ? 2.5 : 9) * dt);
    const ds = this.v * dt;
    this.s = this.path.wrap(this.s + ds);
    // Moving sideways as it goes: the nose turns that way, by the slope of the shift along the road.
    if (ds > 1e-4) this.yawLat += (-Math.atan((this.shift - this.lastShift) / ds) - this.yawLat) * 0.25;
    else this.yawLat *= 0.8;
    this.lastShift = this.shift;
    for (const w of this.wheels) w.rotation.x += ds / this.spec.wheelR;
    if (this.prop) this.prop.rotation.z += dt * 45;
    if (this.rider?.pedal) {
      this.crank += ds / 0.34 / 1.6; // pedals turn slower than the wheels (gearing)
      pedal(this.rider.person, this.crank);
    }
    this.place();
  }

  /**
   * Head lights (and the pool of light they cast) on or off; tail lights on with them, and
   * whenever braking.
   * @param {boolean} on
   */
  light(on) {
    const l = this.lamps;
    if (!l) return;
    for (const a of l.head) a.visible = on;
    for (const a of l.tail) a.visible = on || this.braking;
    l.beam.visible = on;
  }

  place() {
    const { path, group, spec, k } = this;
    let [mx, mz] = path.pointAt(this.s);
    const heading = path.headingAt(this.s);
    if (this.shift) [mx, mz] = [mx - Math.cos(heading) * this.shift, mz + Math.sin(heading) * this.shift]; // (right of the heading)
    const x = mx * k, z = mz * k;
    const turn = Math.atan((this.v * this.v * path.curvatureAt(this.s)) / G);
    if (spec.flies) {
      const k = (this.s / path.length) * Math.PI * 2;
      group.position.set(x, this.altitude + Math.sin(k * 2) * this.amplitude, z);
      // Bank into the turn; nose up while climbing.
      group.rotation.set(-Math.cos(k * 2) * 0.08, heading, -clamp(turn, -0.6, 0.6), 'YXZ');
    } else {
      group.position.set(x, this.heightAt(x, z), z);
      // Two wheels lean into the turn; four wheels stay upright.
      // (Eased, and no more than 0.3 rad: a bike turning round at a street's end flicked to the stop.)
      this.roll = (this.roll ?? 0) + ((this.rider ? -clamp(turn, -0.3, 0.3) : 0) - (this.roll ?? 0)) * 0.12;
      group.rotation.set(0, heading + this.yawLat, this.roll, 'YXZ');
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

// Sit a person on a saddle: hips on the seat, leaning forward, both hands on the handlebar `bar`
// ([height, forward] on the vehicle). The body leans about the soles (the root bone's origin), so the
// figure is put back by as much as the lean carries the hips forward; the arms are then set by two-bone
// reach (upper arm, forearm) from the shoulders to the handlebar.
export function seat(person, { seat: [x, y, z], lean, pedal, bar }, parent) {
  const s = person.group.scale.x;
  person.group.position.set(x, y - 0.92 * s * Math.cos(lean), z - 0.92 * s * Math.sin(lean));
  person.root.rotation.x = lean;
  // Shoulders: 0.61 above the hips in the leaning body.
  const sy = y + 0.61 * s * Math.cos(lean), sz = z + 0.61 * s * Math.sin(lean);
  const a = 0.33 * s, f = 0.37 * s; // upper arm, forearm to the grip
  const [by, bz] = bar;
  const d = Math.min(a + f - 0.01, Math.max(Math.abs(a - f) + 0.01, Math.hypot(bz - sz, by - sy)));
  const toward = Math.atan2(bz - sz, sy - by); // from straight down, forward positive
  const shoulderAngle = Math.acos((a * a + d * d - f * f) / (2 * a * d)); // the elbow hangs below the line
  const upper = toward - shoulderAngle;
  const bend = Math.PI - Math.acos((a * a + f * f - d * d) / (2 * a * f));
  person.shoulders.forEach((sh, i) => sh.rotation.set(-upper - lean, 0, i ? 0.08 : -0.08));
  person.elbows.forEach((e) => (e.rotation.x = -bend));
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
