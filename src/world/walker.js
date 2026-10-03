import * as THREE from 'three';
import { clamp, turnToward } from '../utils.js';
import { Person } from './people.js';

// Step length per unit of figure scale: legs are 0.92 long and swing ±0.55 rad at the hip, so a
// foot travels ~0.95 × scale per step. Half a walk cycle (π) is one step, so the feet don't slide.
// Adult (0.85): ~0.8 m steps, ~1.7 steps/s at walking pace. Child (0.55): ~0.5 m steps.
export const STEP_LENGTH = 0.95;

// A person walking along waypoints, pausing at stops. The figure itself lives in people.js.
export class Walker {
  constructor(rng, heightAt, { kind = 'villager', speed = 1.4 } = {}) {
    this.rng = rng;
    this.heightAt = heightAt;
    this.person = new Person(rng, { kind });
    this.group = this.person.group;
    this.pos = new THREE.Vector3();
    this.heading = 0;
    this.speed = speed * (0.85 + rng() * 0.3);
    this.pace = this.speed; // current speed, eased so slopes don't make it jump at each waypoint
    this.gait = 0; // walk-cycle phase, advanced by distance actually covered
    this.pause = 0;
    this.waving = false;
    this.waiting = false; // at the kerb for the lights
    /** @type {number | null} a height to stand at instead of the ground's (stepping into a carriage, swimming) */
    this.fixedY = null;
  }

  place(p) {
    this.pos.set(p.x, 0, p.z);
    this.sync();
  }

  sync() {
    // fixedY: stepping across the gap between platform and carriage, where the ground doesn't apply.
    this.pos.y = this.fixedY ?? this.heightAt(this.pos.x, this.pos.z) - 0.05;
    this.group.position.copy(this.pos);
    this.group.rotation.y = this.heading;
  }

  // Move toward target; returns true on arrival.
  step(target, dt, t, slowOnSlope = false) {
    const dx = target.x - this.pos.x;
    const dz = target.z - this.pos.z;
    const d = Math.hypot(dx, dz);
    this.heading = turnToward(this.heading, Math.atan2(dx, dz), Math.min(1, dt * 5));
    let want = this.speed;
    if (slowOnSlope) {
      const rise = Math.abs(this.heightAt(target.x, target.z) - this.pos.y) / Math.max(d, 0.5);
      want *= clamp(1 - rise * 0.6, 0.4, 1);
    }
    this.pace += (want - this.pace) * Math.min(1, dt * 2);
    const s = Math.min(d, this.pace * dt);
    this.pos.x += (dx / (d || 1)) * s;
    this.pos.z += (dz / (d || 1)) * s;
    this.sync();
    // The legs follow the ground covered, like real steps: slow when crawling up a slope or
    // edging to a stop, never flailing. (It used to be time × speed, so any speed change made the
    // phase leap by elapsed-seconds × Δspeed.) Smaller people take more steps per metre.
    this.gait += (s * Math.PI) / (STEP_LENGTH * this.group.scale.x);
    this.person.walk(this.gait + this.person.phase);
    return d < 0.3;
  }

  idle(t) {
    if (this.waving) this.person.wave(t);
    else this.person.idle(t);
  }
}
