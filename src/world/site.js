// @ts-check
import * as THREE from 'three';
import { WATER_Y } from '../config.js';

const HIDDEN = new THREE.Matrix4().makeScale(0, 0, 0); // instance matrix of a cleared tree

// What stands where in a world, shared by every feature while the world is built and queried by
// people and cameras afterwards:
// - obstacles: circles [x, z, r] that keep scenery apart (a house, a meadow, the street…)
// - colliders: static footprints people walk around — circles {x, z, r} and boxes
//   {x, z, w, d, rot}; trees and rocks carry their instances in `item` (see clearAround)
// - solids: what blocks a line of sight (follow cameras): boxes {x, z, w, d, cos, sin, y0, y1}
//   and upright cylinders {x, z, r, y0, y1}; tree crowns and rocks come from `colliders`
// - surfaces: extra ground to walk on — (x, z) → height, or -Infinity (platforms, house floors)
// - walkMaps: sidewalks, carriageways (people keep off) and crosswalks by the roads
//   (world/roads/walkmap.js); crossings: each crosswalk's { walk() } — may people start across?
// - claimed ground (claimRect / claimed): a raster of half-unit cells taken by things too many to
//   keep as obstacles — a town's streets and thousands of houses (features/streets.js, buildings.js)
const CLAIM_CELL = 0.5;

export class Site {
  // `yards`: points kept clear around the stops with a yard (cfg.stops[].yard).
  constructor({ cfg, track, heightAt, tunnel, yards, rivers }) {
    this.size = cfg.size;
    this.rivers = rivers;
    this.track = track;
    this.heightAt = heightAt;
    this.tunnel = tunnel;
    this.yards = yards;
    this.obstacles = [];
    this.colliders = [];
    this.solids = [];
    this.surfaces = [];
    /** @type {import('./roads/walkmap.js').WalkMap[]} */
    this.walkMaps = [];
    /** @type {{ walk(): boolean }[]} */
    this.crossings = [];
    /** @type {Uint8Array | null} made on the first claim */
    this.claims = null;
  }

  /**
   * Take the ground under a rectangle (centre, length along `angle` — a rotation.y — and width),
   * grown by `margin` all round: nothing else is put there (spotOK).
   * @param {number} x @param {number} z @param {number} length @param {number} width @param {number} angle @param {number} [margin]
   */
  claimRect(x, z, length, width, angle, margin = 0) {
    const n = Math.ceil(this.size / CLAIM_CELL);
    this.claims ??= new Uint8Array(n * n);
    const c = Math.cos(angle), s = Math.sin(angle), hl = length / 2 + margin, hw = width / 2 + margin;
    const ex = Math.abs(c) * hl + Math.abs(s) * hw, ez = Math.abs(s) * hl + Math.abs(c) * hw;
    const cell = (v) => Math.floor((v + this.size / 2) / CLAIM_CELL);
    for (let i = Math.max(0, cell(z - ez)); i <= Math.min(n - 1, cell(z + ez)); i++) {
      for (let j = Math.max(0, cell(x - ex)); j <= Math.min(n - 1, cell(x + ex)); j++) {
        const dx = (j + 0.5) * CLAIM_CELL - this.size / 2 - x, dz = (i + 0.5) * CLAIM_CELL - this.size / 2 - z;
        // Local axes: length along (cos, -sin) in (x, z), width across it.
        if (Math.abs(dx * c - dz * s) <= hl && Math.abs(dx * s + dz * c) <= hw) this.claims[i * n + j] = 1;
      }
    }
  }

  /** Is (x, z) claimed ground? @param {number} x @param {number} z */
  claimed(x, z) {
    if (!this.claims) return false;
    const n = Math.ceil(this.size / CLAIM_CELL);
    const i = Math.floor((z + this.size / 2) / CLAIM_CELL), j = Math.floor((x + this.size / 2) / CLAIM_CELL);
    return i >= 0 && j >= 0 && i < n && j < n && this.claims[i * n + j] === 1;
  }

  // What the roads make of (x, z) for someone on foot: 0, SIDEWALK, CARRIAGEWAY or CROSSWALK.
  roadAt(x, z) {
    let k = 0;
    for (const m of this.walkMaps) k = Math.max(k, m.at(x, z));
    return k;
  }

  // The crosswalk at (x, z): its index in `crossings`, -1 for none.
  crossingAt(x, z) {
    for (const m of this.walkMaps) {
      const c = m.crossingAt(x, z);
      if (c >= 0) return c;
    }
    return -1;
  }

  // Ground height at (x, z) if something may be put there, else null: inside the diorama, not
  // under the tunnel hill, dry and not too high, clear of the track, the river, the station yards
  // and every obstacle so far.
  spotOK(x, z, clearTrack = 8) {
    const { size, tunnel, track, yards } = this;
    if (Math.abs(x) > size / 2 - 15 || Math.abs(z) > size / 2 - 15) return null;
    if (tunnel?.footprint(x, z)) return null; // under the tunnel hill
    const h = this.heightAt(x, z);
    if (h < WATER_Y + 0.9 || h > 46) return null;
    if (track.distanceTo(x, z, clearTrack) < clearTrack) return null;
    if (this.rivers.distance(x, z) < 17) return null;
    for (const p of yards) if (Math.hypot(x - p.x, z - p.z) < 30) return null;
    if (this.claimed(x, z)) return null;
    for (const [ox, oz, r] of this.obstacles) if (Math.hypot(x - ox, z - oz) < r) return null;
    return h;
  }

  solidBox(x, z, w, d, rot, y0, y1) {
    this.solids.push({ x, z, w, d, cos: Math.cos(rot), sin: Math.sin(rot), y0, y1, reach: Math.hypot(w, d) / 2 });
  }

  addSurface(heightAt) {
    this.surfaces.push(heightAt);
  }

  // Ground people stand on: terrain, or any surface above it (platform, house floor).
  walkHeight = (x, z) => {
    let h = this.heightAt(x, z);
    for (const s of this.surfaces) {
      const v = s(x, z);
      if (v > h) h = v;
    }
    return h;
  };

  // Does the segment a→b pass through a building, tower, tree crown or rock? Plain geometry
  // instead of raycasting the merged meshes (~28k triangles, plus every tree instance): the ray
  // cost ~3 ms, this is a few µs.
  occludes = (a, b) => {
    const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
    const len2 = dx * dx + dz * dz;
    const midX = (a.x + b.x) / 2, midZ = (a.z + b.z) / 2, half = Math.sqrt(len2) / 2;
    // Upright cylinder: nearest approach in plan, then the height there.
    const cylinder = (cx, cz, r, y0, y1) => {
      if (Math.abs(cx - midX) > half + r || Math.abs(cz - midZ) > half + r) return false;
      const t = len2 > 1e-9 ? Math.min(1, Math.max(0, ((cx - a.x) * dx + (cz - a.z) * dz) / len2)) : 0;
      const px = a.x + dx * t - cx, pz = a.z + dz * t - cz;
      if (px * px + pz * pz > r * r) return false;
      const y = a.y + dy * t;
      return y > y0 && y < y1;
    };
    for (const s of this.solids) {
      if (s.r !== undefined) {
        if (cylinder(s.x, s.z, s.r, s.y0, s.y1)) return true;
        continue;
      }
      if (Math.abs(s.x - midX) > half + s.reach || Math.abs(s.z - midZ) > half + s.reach) continue;
      // Slab test in the box's own frame (same rotation convention as the colliders).
      const ax = a.x - s.x, az = a.z - s.z;
      const o = [ax * s.cos - az * s.sin, a.y, ax * s.sin + az * s.cos];
      const v = [dx * s.cos - dz * s.sin, dy, dx * s.sin + dz * s.cos];
      const lo = [-s.w / 2, s.y0, -s.d / 2], hi = [s.w / 2, s.y1, s.d / 2];
      let t0 = 0, t1 = 1;
      for (let k = 0; k < 3 && t0 <= t1; k++) {
        if (Math.abs(v[k]) < 1e-9) {
          if (o[k] < lo[k] || o[k] > hi[k]) t1 = -1;
          continue;
        }
        let ta = (lo[k] - o[k]) / v[k], tb = (hi[k] - o[k]) / v[k];
        if (ta > tb) [ta, tb] = [tb, ta];
        t0 = Math.max(t0, ta);
        t1 = Math.min(t1, tb);
      }
      if (t0 <= t1) return true;
    }
    for (const c of this.colliders) {
      const it = c.item;
      if (!it) continue;
      // Tree crowns (a little inside the leaves, so peeking past the edge still counts as clear).
      if (it.pine === undefined) {
        if (cylinder(it.x, it.z, 0.8 * it.s, it.h - 0.5, it.h + 0.8 * it.s)) return true; // rock
      } else if (it.pine ? cylinder(it.x, it.z, 1.2 * it.s, it.h + 1.3 * it.s, it.h + 4.5 * it.s) : cylinder(it.x, it.z, 1.4 * it.s, it.h + 1.8 * it.s, it.h + 4.6 * it.s)) return true;
    }
    return false;
  };

  // Hide the trees/rocks (colliders with instances) within `radius` of any of the points — used to
  // clear hiking trails.
  clearAround(points, radius) {
    const touched = new Set();
    const { colliders } = this;
    for (let i = colliders.length - 1; i >= 0; i--) {
      const c = colliders[i];
      if (!c.item?.instances) continue;
      if (!points.some((p) => Math.hypot(p.x - c.x, p.z - c.z) < radius + c.r)) continue;
      for (const [mesh, idx] of c.item.instances) {
        mesh.setMatrixAt(idx, HIDDEN);
        touched.add(mesh);
      }
      colliders.splice(i, 1);
    }
    touched.forEach((m) => (m.instanceMatrix.needsUpdate = true));
  }
}
