// @ts-check
// What tells vehicles to stop: traffic lights going round their colours, and level-crossing gates
// that come down when a train is near. Pure logic (no three.js), driven by the road feature every
// frame and read by the traffic (world/vehicles/traffic.js) through each route's stop points.

/** @typedef {'green' | 'yellow' | 'red'} Light */

/**
 * A traffic light: green, yellow, red, round and round. `offset` shifts it in the cycle, so two
 * lights built together needn't change at the same moment.
 */
export class SignalCycle {
  /** @param {{ green?: number, yellow?: number, red?: number, offset?: number }} [o] seconds */
  constructor({ green = 14, yellow = 3, red = 9, offset = 0 } = {}) {
    this.green = green;
    this.yellow = yellow;
    this.red = red;
    this.t = offset;
  }

  get period() {
    return this.green + this.yellow + this.red;
  }

  /** @param {number} dt */
  update(dt) {
    this.t = (this.t + dt) % this.period;
  }

  /** @returns {Light} */
  get state() {
    if (this.t < this.green) return 'green';
    return this.t < this.green + this.yellow ? 'yellow' : 'red';
  }

  /**
   * Should a car `d` units before the stop line, going at `v`, stop? On red, yes; on yellow only if
   * it can still stop comfortably (braking at 6 units/s²) — otherwise it goes through.
   * @param {number} d
   * @param {number} v
   */
  stops(d, v) {
    const s = this.state;
    return s === 'red' || (s === 'yellow' && d > (v * v) / 12);
  }
}

const WARN = 2.5; // seconds of flashing lights before the arms start down
const TRAVEL = 4; // seconds for an arm to go all the way down or up

/**
 * A level crossing: lamps flash as soon as a train is near, then the arms come down; once it has
 * gone the arms go up again and the lamps stop when they are up. Cars wait while anything moves.
 */
export class CrossingGate {
  constructor() {
    this.near = false; // a train is near (last update)
    this.warned = 0; // seconds the train has been near
    this.arm = 0; // 0 = up (open), 1 = down (closed)
    this.flash = 0; // clock for the lamps
  }

  /**
   * @param {number} dt
   * @param {boolean} near a train is coming or on the crossing (see trainNear)
   */
  update(dt, near) {
    this.near = near;
    this.warned = near ? this.warned + dt : 0;
    const down = near && this.warned > WARN;
    this.arm = Math.min(1, Math.max(0, this.arm + ((down ? 1 : -1) * dt) / TRAVEL));
    this.flash = this.active ? this.flash + dt : 0;
  }

  /** Lamps flashing, arms moving or down: don't cross. */
  get active() {
    return this.near || this.arm > 0;
  }

  /** Which of the two lamps is lit (they take turns, about once a second): 0 or 1, -1 for none. */
  get lamp() {
    return this.active ? Math.floor(this.flash / 0.5) % 2 : -1;
  }
}

/**
 * Is a train near a level crossing at `at` (distance along a closed track of `length`)? Its front
 * less than `soon` seconds (at its speed) or 25 units away, or any of its `trainLength` still over it.
 * The train only goes forward (s increasing).
 * @param {{ s: number, v: number }} train
 * @param {number} trainLength front of the engine to the back of the last car
 * @param {number} at
 * @param {number} length track length
 * @param {number} [soon]
 */
export function trainNear(train, trainLength, at, length, soon = 9) {
  const ahead = (((at - train.s) % length) + length) % length;
  const behind = length - ahead; // how far the front is past the crossing
  if (behind < trainLength + 3) return true;
  return ahead < 25 || (train.v > 0.3 && ahead < train.v * soon);
}
