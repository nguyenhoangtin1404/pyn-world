import * as THREE from 'three';
import { WATER_Y } from '../config.js';

// A walkability grid over part of the valley plus A* path finding, so people walk around houses,
// trees and posts instead of through them, and only climb onto the platform via its ramps.

const SQRT2 = Math.SQRT2;
const MAX_STEP = 0.7; // largest height change allowed between neighbouring cells (≈ 35° slope)

class MinHeap {
  constructor() {
    this.items = [];
    this.keys = [];
  }

  get size() {
    return this.items.length;
  }

  push(item, key) {
    const { items, keys } = this;
    let i = items.length;
    items.push(item);
    keys.push(key);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (keys[p] <= key) break;
      items[i] = items[p];
      keys[i] = keys[p];
      i = p;
    }
    items[i] = item;
    keys[i] = key;
  }

  pop() {
    const { items, keys } = this;
    const top = items[0];
    const lastItem = items.pop();
    const lastKey = keys.pop();
    if (items.length) {
      let i = 0;
      const n = items.length;
      for (;;) {
        const l = 2 * i + 1;
        if (l >= n) break;
        const r = l + 1;
        const c = r < n && keys[r] < keys[l] ? r : l;
        if (keys[c] >= lastKey) break;
        items[i] = items[c];
        keys[i] = keys[c];
        i = c;
      }
      items[i] = lastItem;
      keys[i] = lastKey;
    }
    return top;
  }
}

export class NavGrid {
  /**
   * @param bounds {minX, minZ, maxX, maxZ} area covered by the grid
   * @param walkHeight (x, z) → ground height people stand on
   * @param colliders circles {x, z, r} and boxes {x, z, w, d, rot}
   * @param radius clearance kept around obstacles (a person's half-width)
   * @param site if given, its roads: carriageways are off limits, crosswalks are remembered
   *   (`crossing` per cell, see crossingAt) so walkers can wait for the lights
   */
  constructor(bounds, walkHeight, colliders, { cell = 1, radius = 0.3, site = null } = {}) {
    this.cell = cell;
    this.minX = bounds.minX;
    this.minZ = bounds.minZ;
    this.nx = Math.ceil((bounds.maxX - bounds.minX) / cell);
    this.nz = Math.ceil((bounds.maxZ - bounds.minZ) / cell);
    const n = this.nx * this.nz;
    this.height = new Float32Array(n);
    this.blocked = new Uint8Array(n);

    // Sample heights on a grid twice as fine as the cells (odd samples are the cell centres).
    const fx = this.nx * 2 + 1, fz = this.nz * 2 + 1;
    const fine = new Float32Array(fx * fz);
    for (let b = 0; b < fz; b++) {
      for (let a = 0; a < fx; a++) fine[b * fx + a] = walkHeight(this.minX + (a * cell) / 2, this.minZ + (b * cell) / 2);
    }
    for (let j = 0; j < this.nz; j++) {
      for (let i = 0; i < this.nx; i++) {
        const k = j * this.nx + i;
        const h = fine[(2 * j + 1) * fx + (2 * i + 1)];
        this.height[k] = h;
        if (h < WATER_Y + 0.4) this.blocked[k] = 1;
      }
    }
    // Cells containing a ledge (platform and ramp edges, anything steeper than ~30°) are off-limits,
    // otherwise someone walking along the edge would pop up and down it.
    const ledge = new Uint8Array(n);
    const mark = (a, b) => {
      const i = Math.min(this.nx - 1, a >> 1), j = Math.min(this.nz - 1, b >> 1);
      ledge[j * this.nx + i] = 1;
    };
    for (let b = 0; b < fz; b++) {
      for (let a = 0; a < fx; a++) {
        const h = fine[b * fx + a];
        if (a + 1 < fx && Math.abs(fine[b * fx + a + 1] - h) > 0.3) {
          mark(a, b);
          mark(a + 1, b);
        }
        if (b + 1 < fz && Math.abs(fine[(b + 1) * fx + a] - h) > 0.3) {
          mark(a, b);
          mark(a, b + 1);
        }
      }
    }
    for (let k = 0; k < n; k++) if (ledge[k]) this.blocked[k] = 1;
    for (const c of colliders) this.rasterize(c, radius);
    this.crossing = new Int16Array(n).fill(-1);
    if (site?.walkMaps.length) {
      for (let k = 0; k < n; k++) {
        const i = k % this.nx, j = (k - i) / this.nx;
        // Nine points across the cell (people walk anywhere in it): a cell wholly on a crosswalk is
        // that crosswalk; otherwise one that touches the carriageway is off limits.
        let road = false, cross = -2;
        for (const u of [0.1, 0.5, 0.9]) {
          for (const v of [0.1, 0.5, 0.9]) {
            const x = this.minX + (i + u) * cell, z = this.minZ + (j + v) * cell;
            const c = site.crossingAt(x, z);
            cross = cross === -2 || cross === c ? c : -1;
            if (c < 0 && site.roadAt(x, z) === 2) road = true; // CARRIAGEWAY (world/roads/walkmap.js)
          }
        }
        this.crossing[k] = cross;
        if (road) this.blocked[k] = 1;
      }
    }
    this.labelRegions();
  }

  // Connected-component id per free cell (same move rules as A*), so we can avoid picking
  // destinations that can't be reached.
  labelRegions() {
    const { nx, nz, blocked, height } = this;
    this.region = new Int32Array(nx * nz).fill(-1);
    let id = 0;
    const stack = [];
    for (let s = 0; s < nx * nz; s++) {
      if (blocked[s] || this.region[s] >= 0) continue;
      this.region[s] = id;
      stack.push(s);
      while (stack.length) {
        const k = stack.pop();
        const i = k % nx, j = (k - i) / nx;
        for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const ni = i + di, nj = j + dj;
          if (ni < 0 || nj < 0 || ni >= nx || nj >= nz) continue;
          const nk = nj * nx + ni;
          if (blocked[nk] || this.region[nk] >= 0 || Math.abs(height[nk] - height[k]) > MAX_STEP) continue;
          this.region[nk] = id;
          stack.push(nk);
        }
      }
      id++;
    }
  }

  regionAt(x, z) {
    const k = this.index(x, z);
    return k < 0 ? -1 : this.region[k];
  }

  rasterize(c, pad) {
    const reach = (c.r !== undefined ? c.r : Math.hypot(c.w, c.d) / 2) + pad;
    const i0 = Math.max(0, Math.floor((c.x - reach - this.minX) / this.cell));
    const i1 = Math.min(this.nx - 1, Math.floor((c.x + reach - this.minX) / this.cell));
    const j0 = Math.max(0, Math.floor((c.z - reach - this.minZ) / this.cell));
    const j1 = Math.min(this.nz - 1, Math.floor((c.z + reach - this.minZ) / this.cell));
    const cos = Math.cos(c.rot || 0), sin = Math.sin(c.rot || 0);
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const dx = this.minX + (i + 0.5) * this.cell - c.x;
        const dz = this.minZ + (j + 0.5) * this.cell - c.z;
        let inside;
        if (c.r !== undefined) inside = dx * dx + dz * dz < (c.r + pad) ** 2;
        else {
          // Into the box's local frame (three.js rotation.y convention).
          const lx = dx * cos - dz * sin;
          const lz = dx * sin + dz * cos;
          inside = Math.abs(lx) < c.w / 2 + pad && Math.abs(lz) < c.d / 2 + pad;
        }
        if (inside) this.blocked[j * this.nx + i] = 1;
      }
    }
  }

  index(x, z) {
    const i = Math.floor((x - this.minX) / this.cell);
    const j = Math.floor((z - this.minZ) / this.cell);
    if (i < 0 || j < 0 || i >= this.nx || j >= this.nz) return -1;
    return j * this.nx + i;
  }

  centre(k, out = new THREE.Vector3()) {
    const i = k % this.nx;
    const j = (k - i) / this.nx;
    return out.set(this.minX + (i + 0.5) * this.cell, this.height[k], this.minZ + (j + 0.5) * this.cell);
  }

  // The crosswalk under (x, z) (index in site.crossings), -1 for none.
  crossingAt(x, z) {
    const k = this.index(x, z);
    return k < 0 ? -1 : this.crossing[k];
  }

  isFree(x, z) {
    const k = this.index(x, z);
    return k >= 0 && !this.blocked[k];
  }

  // Nearest free cell to (x, z) by a small ring search, as a world point.
  nearestFree(x, z, maxRing = 8) {
    const k0 = this.index(x, z);
    if (k0 >= 0 && !this.blocked[k0]) return new THREE.Vector3(x, this.height[k0], z);
    const i0 = Math.floor((x - this.minX) / this.cell);
    const j0 = Math.floor((z - this.minZ) / this.cell);
    for (let r = 1; r <= maxRing; r++) {
      for (let dj = -r; dj <= r; dj++) {
        for (let di = -r; di <= r; di++) {
          if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
          const i = i0 + di, j = j0 + dj;
          if (i < 0 || j < 0 || i >= this.nx || j >= this.nz) continue;
          const k = j * this.nx + i;
          if (!this.blocked[k]) return this.centre(k);
        }
      }
    }
    return null;
  }

  // Straight segment a→b stays on free cells without big steps?
  clearLine(a, b) {
    const d = Math.hypot(b.x - a.x, b.z - a.z);
    const n = Math.max(1, Math.ceil(d / (this.cell * 0.4)));
    let prev = this.index(a.x, a.z);
    if (prev < 0 || this.blocked[prev]) return false;
    for (let s = 1; s <= n; s++) {
      const t = s / n;
      const k = this.index(a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t);
      if (k < 0 || this.blocked[k]) return false;
      if (k !== prev && Math.abs(this.height[k] - this.height[prev]) > MAX_STEP) return false;
      prev = k;
    }
    return true;
  }

  // A* over 8-connected cells; returns a smoothed list of world points (excluding the start).
  findPath(from, to, maxNodes = 60000) {
    const start = this.nearestFree(from.x, from.z, 3);
    const goal = this.nearestFree(to.x, to.z, 6);
    if (!start || !goal) return null;
    const s = this.index(start.x, start.z);
    const g = this.index(goal.x, goal.z);
    const { nx, nz, blocked, height } = this;
    const gi = g % nx, gj = (g - gi) / nx;
    const h = (k) => {
      const i = k % nx, j = (k - i) / nx;
      const dx = Math.abs(i - gi), dz = Math.abs(j - gj);
      return dx + dz + (SQRT2 - 2) * Math.min(dx, dz);
    };
    const cost = new Map([[s, 0]]);
    const came = new Map();
    const open = new MinHeap();
    open.push(s, h(s));
    const closed = new Set();
    let found = false;
    while (open.size && closed.size < maxNodes) {
      const k = open.pop();
      if (k === g) {
        found = true;
        break;
      }
      if (closed.has(k)) continue;
      closed.add(k);
      const i = k % nx, j = (k - i) / nx;
      for (let dj = -1; dj <= 1; dj++) {
        for (let di = -1; di <= 1; di++) {
          if (!di && !dj) continue;
          const ni = i + di, nj = j + dj;
          if (ni < 0 || nj < 0 || ni >= nx || nj >= nz) continue;
          const nk = nj * nx + ni;
          if (blocked[nk] || closed.has(nk)) continue;
          if (Math.abs(height[nk] - height[k]) > MAX_STEP) continue;
          // No cutting corners past obstacles.
          if (di && dj && (blocked[j * nx + ni] || blocked[nj * nx + i])) continue;
          const c = cost.get(k) + (di && dj ? SQRT2 : 1) + Math.abs(height[nk] - height[k]) * 2;
          if (c < (cost.get(nk) ?? Infinity)) {
            cost.set(nk, c);
            came.set(nk, k);
            open.push(nk, c + h(nk));
          }
        }
      }
    }
    if (!found) return null;

    const cells = [];
    for (let k = g; k !== s; k = came.get(k)) cells.push(k);
    cells.reverse();
    const raw = cells.map((k) => this.centre(k));
    raw[raw.length - 1] = goal;

    // String-pulling: skip intermediate points while the straight line stays clear.
    const path = [];
    let anchor = start;
    let i = 0;
    while (i < raw.length) {
      let far = i;
      for (let t = raw.length - 1; t > i; t--) {
        if (this.clearLine(anchor, raw[t])) {
          far = t;
          break;
        }
      }
      path.push(raw[far]);
      anchor = raw[far];
      i = far + 1;
    }
    return path;
  }
}
