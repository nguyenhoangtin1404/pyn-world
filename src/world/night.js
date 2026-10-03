// @ts-check
import * as THREE from 'three';
import { STEP_LENGTH } from './walker.js';

// Who is out at this hour. By day everyone; from 22:00 fewer and fewer, after midnight everyone goes home,
// and from 1:00 to 5:00 only the night owls (two of the people on the pavements) are about; from 5:00 they
// come back. The people, the vehicles and the boats on the water each have a rank (0..1, spread evenly,
// no random numbers — so adding this changed no world as built) and are out while it is under the share
// for the hour. Going home is the features' to show: someone on screen walks a few steps to a door (a
// house, the edge of the square, up the beach) and is gone there; a vehicle goes where nobody sees it
// (off screen, or at the end of its street); they come back the same ways. The clock runs fast (a day in
// 4 minutes): a way home is a few strides, never a walk to the end of the street, and they hurry (HURRY).
//
// By day it ebbs and flows too (RHYTHM, how many of each lot are about, times the night's share): the
// morning and evening rush on the roads, an empty noon (the town naps, the sand is too hot), the beach and
// the tower's square full in the late afternoon and evening. Everyone is out from 7:00 to 9:30 — the
// morning swim and coffee, the rush to work — which is also when the app opens (9:00): the worlds' goldens
// and the 300 s run are taken with all of them about.

export const HURRY = 2; // how much faster than they stroll people walk home

const smooth = (/** @type {number} */ t) => {
  const u = Math.max(0, Math.min(1, t));
  return u * u * (3 - 2 * u);
};

/** The share of people and traffic out at hour h (0..24). @param {number} h */
export function outShare(h) {
  h = ((h % 24) + 24) % 24;
  if (h >= 6.5 && h < 22) return 1;
  if (h >= 22) return 1 - 0.8 * smooth((h - 22) / 2); // 22:00 → 24:00: fewer and fewer
  if (h < 1) return 0.2 * (1 - smooth(h / 0.6)); // after midnight: everyone home (the last by 0:36, home by 1:00)
  if (h < 5) return 0; // the night owls only
  return smooth((h - 5) / 1.5); // 5:00 → 6:30: back
}

/** Out on the water (swimmers, jet skis and their parasails): by day only. @param {number} h */
export function waterShare(h) {
  h = ((h % 24) + 24) % 24;
  return smooth((h - 7.5) / 1) * (1 - smooth((h - 17.5) / 1));
}

/**
 * How many of each lot are about by day (0..1, times outShare), as [hour, share] points with straight lines
 * between; 1 before the first and after the last. `town`: people on the pavements, cafés and street
 * carts; `traffic`: vehicles on the streets; `beach`: on the sand (and in the sea); `square`: visitors at
 * the landmark.
 * @type {Record<'town' | 'traffic' | 'beach' | 'square', [number, number][]>}
 */
export const RHYTHM = {
  town: [[9.5, 1], [11, 0.6], [12, 0.45], [14, 0.45], [15.5, 0.75], [17, 1]],
  traffic: [[5, 0.7], [7, 1], [9.5, 1], [11, 0.6], [11.75, 0.45], [13.5, 0.45], [15, 0.7], [16.5, 1], [18.5, 1], [20, 0.75], [22, 0.7]],
  beach: [[9.5, 1], [10.5, 0.5], [11.5, 0.25], [14, 0.25], [15.5, 0.6], [16.5, 1]],
  square: [[9.5, 1], [11, 0.55], [12, 0.4], [14.5, 0.4], [16, 0.75], [17.5, 1]],
};

/** The share of a lot about by day at hour h (RHYTHM). @param {keyof typeof RHYTHM} who @param {number} h */
export function busy(who, h) {
  h = ((h % 24) + 24) % 24;
  const pts = RHYTHM[who];
  if (h <= pts[0][0] || h >= pts[pts.length - 1][0]) return h <= pts[0][0] ? pts[0][1] : pts[pts.length - 1][1];
  let i = 1;
  while (pts[i][0] < h) i++;
  const [h0, v0] = pts[i - 1], [h1, v1] = pts[i];
  return v0 + ((v1 - v0) * (h - h0)) / (h1 - h0);
}

/**
 * Out at hour h: the night's share (an hour `lead` early) times the day's (RHYTHM; `water`: the beach's,
 * and only in daylight — waterShare).
 * @param {keyof typeof RHYTHM | 'water'} who @param {number} h @param {number} [lead]
 */
export function shareOf(who, h, lead = 0) {
  return who === 'water' ? waterShare(h + lead) * busy('beach', h) : outShare(h + lead) * busy(who, h);
}

const GOLDEN = 0.6180339887498949;

/** The hour, what the camera sees, and everyone's rank (World keeps it up to date each frame). */
export class Curfew {
  constructor() {
    this.hour = 12;
    this.n = 0;
    /** @type {THREE.Vector3 | null} */
    this.eye = null;
    this.frustum = new THREE.Frustum();
    this.sphere = new THREE.Sphere();
    this.m = new THREE.Matrix4();
  }

  /** A rank for one more of them: spread evenly over 0..1 (a night owl is always out). @param {boolean} [owl] */
  rank(owl = false) {
    return owl ? -1 : 0.01 + ((this.n++ * GOLDEN) % 1) * 0.98;
  }

  /**
   * Out at this hour? `lead`: hours early these go home (visitors before the people who live here: they've
   * further to go, and the beach and the square empty first). `who`: which lot (shareOf).
   * @param {number} rank @param {keyof typeof RHYTHM | 'water'} [who] @param {number} [lead]
   */
  out(rank, who = 'town', lead = 0) {
    return rank < shareOf(who, this.hour, lead);
  }

  /** @param {THREE.Camera} camera */
  look(camera) {
    camera.updateMatrixWorld();
    this.m.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.m);
    this.eye = camera.position;
  }

  /** Could the camera see something of radius r at p? (true before the first frame) @param {{ x: number, y: number, z: number }} p @param {number} [r] */
  seen(p, r = 2) {
    if (!this.eye) return true;
    this.sphere.center.set(p.x, p.y, p.z);
    this.sphere.radius = r;
    return this.frustum.intersectsSphere(this.sphere) && this.eye.distanceTo(this.sphere.center) < 260;
  }
}

/** @param {any} world @returns {Curfew} */
export const curfewOf = (world) => world.service('curfew', () => new Curfew());

/**
 * One step of a person on foot towards `to` (on the ground `heightAt`), the legs going with the ground
 * covered as a Walker's do — for someone who wasn't walking (sitting at a café, selling at a cart) and now
 * gets up and goes. True on arrival.
 * @param {import('./people.js').Person} person @param {THREE.Vector3} to @param {number} speed units/s
 * @param {number} dt @param {(x: number, z: number) => number} heightAt
 */
export function stepTo(person, to, speed, dt, heightAt) {
  const g = person.group, dx = to.x - g.position.x, dz = to.z - g.position.z, d = Math.hypot(dx, dz);
  const s = Math.min(d, speed * dt);
  g.position.x += (dx / (d || 1)) * s;
  g.position.z += (dz / (d || 1)) * s;
  g.position.y = heightAt(g.position.x, g.position.z) - 0.05;
  if (d > 1e-6) g.rotation.y = Math.atan2(dx, dz);
  g.userData.gait = (g.userData.gait ?? 0) + (s * Math.PI) / (STEP_LENGTH * g.scale.x);
  person.walk(g.userData.gait + person.phase);
  return d < 0.05;
}

/** The point of a footprint's edge nearest (x, z), just outside it: its door. @param {{ x: number, z: number, length: number, width: number, angle: number }} b @param {number} x @param {number} z @param {number} [out] */
export function doorOf(b, x, z, out = 0.1) {
  const c = Math.cos(b.angle), s = Math.sin(b.angle), dx = x - b.x, dz = z - b.z;
  // In the footprint's frame: u along its length (c, −s), v along its width (s, c).
  let u = dx * c - dz * s, v = dx * s + dz * c;
  const hu = b.length / 2, hv = b.width / 2;
  u = Math.max(-hu, Math.min(hu, u));
  v = Math.max(-hv, Math.min(hv, v));
  // (inside: out by the nearer side)
  if (Math.abs(u) < hu && Math.abs(v) < hv) {
    if (hu - Math.abs(u) < hv - Math.abs(v)) u = Math.sign(u || 1) * hu;
    else v = Math.sign(v || 1) * hv;
  }
  const lu = u + Math.sign(Math.abs(u) >= hu ? u : 0) * out, lv = v + Math.sign(Math.abs(v) >= hv ? v : 0) * out;
  return new THREE.Vector3(b.x + lu * c + lv * s, 0, b.z - lu * s + lv * c);
}

/**
 * Home for someone at (x, z): the door (doorOf) of the nearest building within `reach` they can walk to in a
 * straight line without setting foot on a carriageway (`strict`; else any: late at night there's no traffic)
 * — or null: none near.
 * @param {any} world @param {number} x @param {number} z @param {number} reach @param {boolean} [strict]
 */
export function homeFor(world, x, z, reach, strict = true) {
  let best = null, bestD = reach;
  for (const b of world.buildings) {
    if (Math.abs(b.x - x) > reach + b.length || Math.abs(b.z - z) > reach + b.length) continue;
    const door = doorOf(b, x, z, 0.15);
    const d = Math.hypot(door.x - x, door.z - z);
    if (d >= bestD || (strict && !clearWalk(world, x, z, door.x, door.z))) continue;
    [best, bestD] = [door, d];
  }
  return best;
}

/** No carriageway between a and b (CLAIM.CARRIAGEWAY = 3). @param {any} world @param {number} ax @param {number} az @param {number} bx @param {number} bz */
function clearWalk(world, ax, az, bx, bz) {
  const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / 0.25));
  for (let i = 0; i <= n; i++) if (world.site.claimAt(ax + ((bx - ax) * i) / n, az + ((bz - az) * i) / n) === 3) return false;
  return true;
}
