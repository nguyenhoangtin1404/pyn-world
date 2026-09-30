// @ts-check
import { RAIL_TOP, WATER_Y } from '../config.js';
import { box } from '../world/lowpoly.js';
import { Paint } from '../world/roads/paint.js';
import { SIZES } from '../world/scale.js';

// A town's real streets (cfg.roads, from the map data): every street painted on the ground as it
// is drawn (terrain.meshHeightAt), a little wider than life so the small ones still show, busier
// ones darker and over the quieter ones where they meet, a dashed centre line on the main roads.
// Where a street crosses the river it runs on a deck at bridge height, on piers; where it crosses
// the railway it rises to the rails. Streets stop short of the station yards and the landmarks'
// squares. All of it is vertex-coloured triangles in the world's batch: no draw call of its own.
// The ground under the streets is claimed (site.claimRect) so houses and trees keep off it.
// Wide enough for the traffic drawn at world.scale: the real width, or its lanes at the props
// scale if that is wider (on a small map, a real street would be narrower than a car).

const RANK = ['track', 'service', 'pedestrian', 'living_street', 'residential', 'unclassified', 'road', 'tertiary', 'secondary', 'primary', 'trunk', 'motorway'];
/** Traffic lanes by kind (alleys: one and a half — room to pass a motorbike). */
const LANES = { motorway: 4, trunk: 4, primary: 4, secondary: 2, tertiary: 2, unclassified: 2, road: 2, residential: 1.5, living_street: 1, pedestrian: 1, service: 1, track: 1 };
const MAIN = new Set(['secondary', 'primary', 'trunk', 'motorway']);
/** @param {string} kind */
const colorOf = (kind) => (kind === 'track' ? '#a48d6a' : MAIN.has(kind) ? '#55575c' : kind === 'tertiary' ? '#65676b' : '#8e8b85');
const STEP = 1.2; // units between the points a street is laid through

/**
 * An open polyline walked by distance (Paint's `Line`).
 * @param {[number, number][]} pts
 */
function openLine(pts) {
  const at = [0];
  for (let i = 1; i < pts.length; i++) at.push(at[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const length = at.at(-1) ?? 0;
  const locate = (/** @type {number} */ s) => {
    s = Math.max(0, Math.min(length, s));
    let lo = 1, hi = pts.length - 1; // first i with at[i] >= s
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (at[mid] < s) lo = mid + 1;
      else hi = mid;
    }
    const len = at[lo] - at[lo - 1];
    return { i: lo, k: len > 0 ? (s - at[lo - 1]) / len : 0 };
  };
  return {
    length,
    /** @param {number} s @returns {[number, number]} */
    pointAt(s) {
      const { i, k } = locate(s);
      const [ax, az] = pts[i - 1], [bx, bz] = pts[i];
      return [ax + (bx - ax) * k, az + (bz - az) * k];
    },
    /** @param {number} s */
    headingAt(s) {
      const [ax, az] = this.pointAt(Math.max(0, s - 1)), [bx, bz] = this.pointAt(Math.min(length, s + 1));
      return Math.atan2(bx - ax, bz - az);
    },
  };
}

/** @type {import('../types').Feature} */
export default {
  label: 'Đang trải đường phố',
  build(world) {
    const { cfg, site, terrain, track, batch } = world;
    world.need('đường phố từ dữ liệu bản đồ (cfg.roads)', 'streets', cfg.roads?.length);
    const roads = /** @type {NonNullable<typeof cfg.roads>} */ (cfg.roads);
    const ground = terrain.meshHeightAt;
    const deck = WATER_Y + 0.9; // bridges: over the water, level with the banks
    const half = world.size / 2 - 2;
    const pads = cfg.pads ?? [];
    // Where no street goes: off the diorama, the station yards, the landmarks' squares.
    const keepOff = (/** @type {number} */ x, /** @type {number} */ z) =>
      Math.abs(x) > half || Math.abs(z) > half || site.yards.some((p) => Math.hypot(x - p.x, z - p.z) < 24) || pads.some((p) => Math.hypot(x - p.x, z - p.z) < p.r + 1);
    const paint = new Paint();
    const piers = [];
    const lane = world.scale.fit(SIZES.lane);
    const ordered = [...roads].sort((a, b) => RANK.indexOf(a.kind) - RANK.indexOf(b.kind));
    for (const road of ordered) {
      const rank = Math.max(0, RANK.indexOf(road.kind));
      const lanes = LANES[road.kind] ?? 2;
      const w = Math.max(road.width, lanes * lane), hw = w / 2;
      if (lanes === 2) world.scale.note('lane', w / 2, 'streets');
      // Over the rails: up to the rail tops, ramping down either side (like a level crossing).
      const surface = (/** @type {number} */ lift) => (/** @type {number} */ x, /** @type {number} */ z) => {
        let h = Math.max(ground(x, z), deck);
        const d = track.distanceTo(x, z, 12);
        if (d < 12) h = Math.max(h, RAIL_TOP - 0.09 - Math.max(0, d - 2.8) * 0.22);
        return h + lift;
      };
      const top = surface(0.06 + rank * 0.012);
      const color = colorOf(road.kind);
      // Resample every STEP units and cut out the stretches that must stay clear.
      /** @type {[number, number][][]} */
      const runs = [[]];
      const pts = road.points;
      for (let i = 1; i < pts.length; i++) {
        const [ax, az] = pts[i - 1], [bx, bz] = pts[i];
        const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / STEP));
        for (let k = i === 1 ? 0 : 1; k <= n; k++) {
          const x = ax + ((bx - ax) * k) / n, z = az + ((bz - az) * k) / n;
          if (keepOff(x, z)) {
            if (runs.at(-1)?.length) runs.push([]);
          } else runs.at(-1)?.push([x, z]);
        }
      }
      for (const run of runs) {
        if (run.length < 2) continue;
        const line = openLine(run);
        paint.strip(line, 0, line.length, -hw, hw, top, color);
        // Round ends, so streets meet without gaps.
        for (const s of [0, line.length]) paint.ring(line.pointAt(s), 0, hw, 0, 0, top, color);
        if (MAIN.has(road.kind) && line.length > 6) paint.dashes(line, 1, line.length - 1, -0.07, 0.07, surface(0.075 + rank * 0.012), '#ecebe4', 1.2, 2.8);
        for (let i = 1; i < run.length; i++) {
          const [ax, az] = run[i - 1], [bx, bz] = run[i];
          site.claimRect((ax + bx) / 2, (az + bz) / 2, Math.hypot(bx - ax, bz - az) + 0.2, w, Math.atan2(bx - ax, bz - az) - Math.PI / 2, 0.3);
        }
        // Over water: the deck's edge, and a pier every few units.
        if (!run.some(([x, z]) => ground(x, z) < deck - 0.3)) continue;
        const under = (/** @type {number} */ x, /** @type {number} */ z) => (ground(x, z) < deck - 0.3 ? Math.max(ground(x, z), top(x, z) - 0.5) : top(x, z));
        paint.wall(line, 0, line.length, hw, top, under, '#9c978d');
        paint.wall(line, 0, line.length, -hw, top, under, '#9c978d');
        for (let s = 3; s < line.length; s += 7) {
          const [x, z] = line.pointAt(s);
          const g = ground(x, z);
          if (g < WATER_Y - 0.3) piers.push({ x, z, y0: g, y1: top(x, z) - 0.4, w: w * 0.8, ry: line.headingAt(s) });
        }
      }
    }
    batch.at(0, 0, 0, 0).add(paint.geometry() ?? []);
    for (const p of piers) batch.at(p.x, p.y0, p.z, p.ry).add([box(p.w, p.y1 - p.y0, 0.7, '#8f8a80', [0, (p.y1 - p.y0) / 2, 0])]);
    return {};
  },
};
