// @ts-check
// Where the train is along the track and what it is doing: running, stopped at a platform with its
// doors open, closing its doors to leave, or — on a line with ends — waiting at the end of the line
// to go back the other way. Pure logic (no three.js): the Train animates whatever this decides. `s`
// is the distance along the track of the locomotive, which keeps its place in the train: going
// back, it is pushed from behind (dir = -1).

import { approach } from '../../utils.js';

/** @typedef {{ s: number, out: any }} Stop where the locomotive halts, and which side the platform is */

export class Schedule {
  /**
   * @param {object} o
   * @param {(s: number) => number} o.wrap wraps a distance round the loop (Track.wrap)
   * @param {Stop[]} o.stops
   * @param {number} [o.s] starting distance along the track
   * @param {number} [o.cruise] top speed at speed ×1 (units/s)
   * @param {number} [o.accel]
   * @param {number} [o.decel]
   * @param {{ min: number, max: number } | null} [o.ends] on a line with ends, how far the
   *   locomotive may go each way (leaving room for the carriages behind it)
   */
  constructor({ wrap, stops, s = 60, cruise = 13, accel = 1.4, decel = 2.0, ends = null }) {
    this.wrap = wrap;
    this.ends = ends;
    this.dir = 1; // +1 along the track, -1 back (lines with ends only)
    this.turnTime = 0;
    this.stops = stops;
    this.s = s;
    this.v = 0;
    this.cruise = cruise;
    this.accel = accel;
    this.decel = decel;
    /** @type {'run' | 'stop' | 'closing' | 'turn'} */
    this.state = 'run';
    this.stopTime = 0;
    this.closeTime = 0;
    this.stopId = 0; // increments on every arrival at a stop
    this.stopIndex = 0; // which stop the train is at / last left
    this.doorOpen = 0; // 0 = shut, 1 = fully open
    this.canDepart = () => true; // the station can hold the train while people board
    this.onDepart = () => {}; // the whistle
  }

  get stopped() {
    return this.state !== 'run';
  }

  // Direction from the track to the platform of the stop the train is at or last left.
  get platformOut() {
    return this.stops[this.stopIndex]?.out ?? null;
  }

  /**
   * Advance by dt seconds at speed factor speedMul. Returns the distance covered.
   * @param {number} dt
   * @param {number} speedMul
   */
  step(dt, speedMul) {
    const cruise = this.cruise * speedMul;
    if (this.state === 'run') {
      // The next stop ahead (skipping the one just left, which is right behind us); on a line with
      // ends, the end of the line counts as one (next = -1).
      let ahead = Infinity, next = 0;
      const { ends, dir } = this;
      this.stops.forEach((st, i) => {
        const d = ends ? (st.s - this.s) * dir : this.wrap(st.s - this.s);
        if (d >= 0 && d < ahead) {
          ahead = d;
          next = i;
        }
      });
      if (ends) {
        const d = ((dir > 0 ? ends.max : ends.min) - this.s) * dir;
        if (d < ahead) {
          ahead = d;
          next = -1;
        }
      }
      let target = cruise;
      if (ahead < 70) target = Math.min(cruise, Math.sqrt(2 * this.decel * Math.max(ahead - 0.3, 0)) + 0.4);
      this.v = approach(this.v, target, (target > this.v ? this.accel : this.decel * 1.6) * dt);
      // Also stop if this frame's step would carry us past the stop (long frames, fast time).
      if (cruise > 0 && (ahead < 0.6 || (ahead < 6 && this.v * dt >= ahead))) {
        this.v = 0;
        if (next < 0) {
          // The end of the line: wait, then go back.
          this.state = 'turn';
          this.turnTime = 0;
          this.s = dir > 0 ? ends.max : ends.min;
        } else {
          this.state = 'stop';
          this.stopTime = 0;
          this.stopId++;
          this.stopIndex = next;
          this.s = this.stops[next].s;
        }
      }
    } else if (this.state === 'turn') {
      this.v = 0;
      this.turnTime += dt;
      if (cruise > 0 && this.turnTime > 8) {
        this.dir = -this.dir;
        this.state = 'run';
        this.onDepart();
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
        this.s = this.stops[this.stopIndex].s + 0.01 * this.dir;
        this.onDepart();
      }
    }
    const doorTarget = this.state === 'stop' && this.stopTime > 1 ? 1 : 0;
    this.doorOpen = approach(this.doorOpen, doorTarget, dt * 1.4);

    const ds = this.v * dt * this.dir;
    this.s = this.wrap(this.s + ds);
    return ds;
  }
}

