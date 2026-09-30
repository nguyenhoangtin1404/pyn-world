import * as THREE from 'three';
import { TRACK_Y, GAUGE } from '../config.js';

// The world's railway through its (x, z) points, at track height: a closed loop, or for a world
// whose line runs off the map (cfg.trackClosed === false, e.g. a real railway) a line with two ends.
export function createTrackCurve(cfg) {
  const pts = cfg.track().map(([x, z]) => new THREE.Vector3(x, TRACK_Y, z));
  const curve = new THREE.CatmullRomCurve3(pts, cfg.trackClosed ?? true, 'centripetal');
  curve.arcLengthDivisions = 3000;
  return curve;
}

export class Track {
  // k: how big the railway is drawn (world.scale.props): gauge, ballast, rails, bridges, the train.
  constructor(curve, k = 1) {
    this.curve = curve;
    this.k = k;
    this.gauge = GAUGE * k;
    this.railTop = TRACK_Y + 0.62 * k; // top of the rails
    this.length = curve.getLength();
    this.closed = curve.closed;
    const M = Math.ceil(this.length);
    // One frame per ~1 world unit: position, flat tangent and the sideways vector (a line with ends
    // gets one more, at its far end).
    this.frames = [];
    for (let i = 0; i < (this.closed ? M : M + 1); i++) {
      const u = i / M;
      const p = curve.getPointAt(u);
      const t = curve.getTangentAt(u);
      t.y = 0;
      t.normalize();
      this.frames.push({ p, t, side: new THREE.Vector3(-t.z, 0, t.x), s: u * this.length });
    }
    const step = 2;
    const n = Math.ceil(M / step);
    this.coarse = new Float32Array(n * 2);
    for (let i = 0; i < n; i++) {
      const f = this.frames[i * step];
      this.coarse[i * 2] = f.p.x;
      this.coarse[i * 2 + 1] = f.p.z;
    }
    // Bucket those points into a grid so distanceTo() only looks at nearby cells: it is called
    // hundreds of thousands of times while the world is built (terrain, scenery, nav grids).
    const C = (this.cell = 12);
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
    for (let i = 0; i < n; i++) {
      x0 = Math.min(x0, this.coarse[i * 2]);
      x1 = Math.max(x1, this.coarse[i * 2]);
      z0 = Math.min(z0, this.coarse[i * 2 + 1]);
      z1 = Math.max(z1, this.coarse[i * 2 + 1]);
    }
    this.gx0 = x0;
    this.gz0 = z0;
    this.gnx = Math.floor((x1 - x0) / C) + 1;
    this.gnz = Math.floor((z1 - z0) / C) + 1;
    const cellOf = (i) => Math.floor((this.coarse[i * 2 + 1] - z0) / C) * this.gnx + Math.floor((this.coarse[i * 2] - x0) / C);
    this.cellStart = new Int32Array(this.gnx * this.gnz + 1);
    for (let i = 0; i < n; i++) this.cellStart[cellOf(i) + 1]++;
    for (let c = 0; c < this.gnx * this.gnz; c++) this.cellStart[c + 1] += this.cellStart[c];
    this.cellPts = new Int32Array(n);
    const fill = this.cellStart.slice(0, -1);
    for (let i = 0; i < n; i++) this.cellPts[fill[cellOf(i)]++] = i;
  }

  // Round the loop; on a line with ends, held to them.
  wrap(s) {
    const L = this.length;
    return this.closed ? ((s % L) + L) % L : Math.min(L, Math.max(0, s));
  }

  pointAt(s, target = new THREE.Vector3()) {
    return this.curve.getPointAt(this.wrap(s) / this.length, target);
  }

  frame(i) {
    const M = this.frames.length;
    return this.frames[this.closed ? ((i % M) + M) % M : Math.min(M - 1, Math.max(0, i))];
  }

  // Distance to the nearest (coarse) track point. Searches grid cells in growing rings around
  // (x, z) and stops once no unvisited cell can hold anything closer — same answer as checking
  // every point. With `max`, the search stops at that radius: results below `max` are exact, and
  // anything farther comes back as some value ≥ max (Infinity when nothing was seen).
  distanceTo(x, z, max = Infinity) {
    const { cell: C, gnx, gnz, coarse, cellStart, cellPts } = this;
    const ci = Math.floor((x - this.gx0) / C), cj = Math.floor((z - this.gz0) / C);
    // Rings that can't touch the grid are skipped; from outside, start where the grid begins.
    const r0 = Math.max(0, -ci, ci - gnx + 1, -cj, cj - gnz + 1);
    const rMax = Math.max(ci, gnx - 1 - ci, cj, gnz - 1 - cj);
    let m = Infinity;
    for (let r = r0; r <= rMax; r++) {
      for (let j = cj - r; j <= cj + r; j++) {
        if (j < 0 || j >= gnz) continue;
        const edge = j === cj - r || j === cj + r;
        for (let i = ci - r; i <= ci + r; i += edge ? 1 : 2 * r || 1) {
          if (i < 0 || i >= gnx) continue;
          const c = j * gnx + i;
          for (let k = cellStart[c]; k < cellStart[c + 1]; k++) {
            const p = cellPts[k];
            const dx = coarse[p * 2] - x, dz = coarse[p * 2 + 1] - z;
            const d = dx * dx + dz * dz;
            if (d < m) m = d;
          }
        }
      }
      // Anything in ring r + 1 or beyond is at least r·C away.
      if (m <= (r * C) ** 2 || r * C >= max) break;
    }
    return Math.sqrt(m);
  }

}

// Sweep a 2D profile [[side, up], ...] along a run of track frames. `profile` may also be a
// function of the ring index returning such a list (e.g. for ramps).
/**
 * A world without a railway (a town from map data away from the line): what the core and the
 * features ask of a track, with no track anywhere — everything is infinitely far from it.
 * @param {number} k the props scale (world.scale.props)
 */
export function noTrack(k = 1) {
  return { none: true, k, gauge: GAUGE * k, railTop: TRACK_Y + 0.62 * k, length: 0, closed: false, frames: [], distanceTo: () => Infinity };
}

export function sweep(frames, start, count, profile, baseY, closed = false) {
  const M = frames.length;
  const profileAt = typeof profile === 'function' ? profile : () => profile;
  const K = profileAt(0).length;
  const ring = (i) => {
    const f = frames[(((start + i) % M) + M) % M];
    return profileAt(i).map(([s, y]) => new THREE.Vector3(f.p.x + f.side.x * s, baseY + y, f.p.z + f.side.z * s));
  };
  const out = [];
  const segs = closed ? count : count - 1;
  let a = ring(0);
  for (let i = 1; i <= segs; i++) {
    const b = ring(i);
    for (let k = 0; k < K; k++) {
      const a0 = a[k], a1 = a[(k + 1) % K], b0 = b[k], b1 = b[(k + 1) % K];
      out.push(a0.x, a0.y, a0.z, b0.x, b0.y, b0.z, b1.x, b1.y, b1.z);
      out.push(a0.x, a0.y, a0.z, b1.x, b1.y, b1.z, a1.x, a1.y, a1.z);
    }
    a = b;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(out, 3));
  g.computeVertexNormals();
  return g;
}

// Runs of equal flags: [[startIndex, length], ...] — round the loop (closed), or from end to end.
function runs(flags, value, closed = true) {
  const M = flags.length;
  if (!closed) {
    const out = [];
    for (let i = 0; i < M; i++) {
      if (flags[i] !== value || (i > 0 && flags[i - 1] === value)) continue;
      let len = 0;
      while (i + len < M && flags[i + len] === value) len++;
      out.push([i, len]);
    }
    return out;
  }
  if (flags.every((f) => f === value)) return [[0, M]];
  if (!flags.includes(value)) return [];
  const i0 = flags.findIndex((f) => f !== value);
  const out = [];
  let k = 0;
  while (k < M) {
    const i = (i0 + k) % M;
    if (flags[i] === value) {
      let len = 0;
      while (len < M && flags[(i + len) % M] === value) len++;
      out.push([i, len]);
      k += len;
    } else k++;
  }
  return out;
}

const yaw = (t) => Math.atan2(t.x, t.z);

// `riverDistance(x, z)`: world/rivers.js — no stone piers in the river's navigation channel.
// Every size across the track is × track.k (the railway drawn smaller on a small map).
export function buildTrackMeshes(track, heightAt, riverDistance) {
  const group = new THREE.Group();
  const k = track.k ?? 1;
  const sized = (/** @type {number[][]} */ profile) => profile.map(([x, y]) => [x * k, y * k]);
  const frames = track.frames;
  const M = frames.length;
  const closed = track.closed;
  const ground = frames.map((f) => heightAt(f.p.x, f.p.z));
  const low = ground.map((g) => g < TRACK_Y - 1.5);
  const isBridge = low.map((_, i) => {
    for (let k = -4; k <= 4; k++) if (closed ? low[(i + k + M) % M] : low[i + k]) return true;
    return false;
  });
  // How many frames a run from `start` can be swept over (a line stops at its end).
  const span = (start, count) => (closed ? count : Math.min(count, M - start));

  const mat = (color) => new THREE.MeshLambertMaterial({ color, flatShading: true, side: THREE.DoubleSide });
  const mats = {
    ballast: mat('#9a8e80'),
    rail: mat('#7b7672'),
    sleeper: new THREE.MeshLambertMaterial({ color: '#6b4a33', flatShading: true }),
    deck: mat('#7a5a40'),
    girder: mat('#b5523b'),
    stone: new THREE.MeshLambertMaterial({ color: '#b8ad9c', flatShading: true }),
    railing: mat('#efe3c6'),
  };
  const add = (geo, m, cast = true) => {
    const mesh = new THREE.Mesh(geo, m);
    mesh.castShadow = cast;
    mesh.receiveShadow = true;
    group.add(mesh);
    return mesh;
  };

  // Embankment (wide trapezoid that sinks into the ground so small dips never show a gap).
  const ballastProfile = sized([[-3.6, -2.6], [3.6, -2.6], [1.7, 0.3], [-1.7, 0.3]]);
  for (const [start, len] of runs(isBridge, false, closed)) {
    const full = closed && len === M;
    add(sweep(frames, start, full ? M : span(start, len + 1), ballastProfile, TRACK_Y, full), mats.ballast, false);
  }

  // Bridges: deck, girder, railings, stone piers.
  const bridges = [];
  const posts = [];
  for (const [start, len] of runs(isBridge, true, closed)) {
    const n = span(start, len + 1);
    add(sweep(frames, start, n, sized([[-2.1, -0.35], [2.1, -0.35], [2.1, 0.3], [-2.1, 0.3]]), TRACK_Y), mats.deck);
    add(sweep(frames, start, n, sized([[-1.5, -1.7], [1.5, -1.7], [1.5, -0.35], [-1.5, -0.35]]), TRACK_Y), mats.girder);
    for (const sx of [-2.05, 2.05]) {
      add(sweep(frames, start, n, sized([[sx - 0.09, 1.25], [sx + 0.09, 1.25], [sx + 0.09, 1.4], [sx - 0.09, 1.4]]), TRACK_Y), mats.railing);
    }
    const postStep = Math.max(1, Math.round(2 * k)); // a post every 2 (model) units
    for (let j = 0; j <= len; j += postStep) {
      const f = track.frame(start + j);
      for (const sx of [-2.05 * k, 2.05 * k]) posts.push([f.p.x + f.side.x * sx, TRACK_Y + 0.8 * k, f.p.z + f.side.z * sx, yaw(f.t)]);
    }
    for (let j = 3; j < len - 2; j += 9) {
      const i = (start + j) % M;
      const f = frames[i];
      const g = ground[i];
      if (g > TRACK_Y - 2.2) continue;
      if (riverDistance(f.p.x, f.p.z) < 6) continue; // keep the navigation channel clear for the steamer
      const top = TRACK_Y - 1.7 * k;
      const bottom = g - 1.5;
      const pier = add(new THREE.BoxGeometry(3.8 * k, top - bottom, 1.5 * k), mats.stone);
      pier.position.set(f.p.x, (top + bottom) / 2, f.p.z);
      pier.rotation.y = yaw(f.t);
    }
    const mid = track.frame(start + Math.floor(len / 2));
    bridges.push({ center: mid.p.clone(), side: mid.side.clone(), tangent: mid.t.clone(), index: (start + Math.floor(len / 2)) % M });
  }

  const dummy = new THREE.Object3D();
  if (posts.length) {
    const postMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.14 * k, 1.0 * k, 0.14 * k), mats.railing, posts.length);
    posts.forEach(([x, y, z, r], i) => {
      dummy.position.set(x, y, z);
      dummy.rotation.set(0, r, 0);
      dummy.updateMatrix();
      postMesh.setMatrixAt(i, dummy.matrix);
    });
    postMesh.castShadow = true;
    group.add(postMesh);
  }

  // Rails
  for (const off of [-GAUGE / 2, GAUGE / 2]) {
    add(sweep(frames, 0, M, sized([[off - 0.08, 0.44], [off + 0.08, 0.44], [off + 0.08, 0.62], [off - 0.08, 0.62]]), TRACK_Y, closed), mats.rail, false);
  }

  // A line's two ends: buffer stops (a timber frame with a red beam).
  if (!closed) {
    for (const [i, dir] of [[0, -1], [M - 1, 1]]) {
      const f = frames[i];
      const stop = add(new THREE.BoxGeometry(2.4 * k, 0.9 * k, 0.5 * k), mats.girder);
      stop.position.set(f.p.x + f.t.x * dir * 0.5 * k, TRACK_Y + 1.1 * k, f.p.z + f.t.z * dir * 0.5 * k);
      stop.rotation.y = yaw(f.t);
    }
  }

  // Sleepers: one every frame (~1 unit); a railway drawn smaller has them closer, every k units.
  const at = k === 1 ? frames.map((f) => ({ p: f.p, t: f.t })) : Array.from({ length: Math.floor(track.length / k) + 1 }, (_, i) => {
    const s = i * k;
    return { p: track.pointAt(s), t: track.curve.getTangentAt(track.wrap(s) / track.length) };
  });
  const sleepers = new THREE.InstancedMesh(new THREE.BoxGeometry(2.6 * k, 0.14 * k, 0.42 * k), mats.sleeper, at.length);
  at.forEach((f, i) => {
    dummy.position.set(f.p.x, TRACK_Y + 0.37 * k, f.p.z);
    dummy.rotation.set(0, yaw(f.t), 0);
    dummy.updateMatrix();
    sleepers.setMatrixAt(i, dummy.matrix);
  });
  sleepers.receiveShadow = true;
  group.add(sleepers);

  return { group, bridges, isBridge };
}
