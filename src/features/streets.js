// @ts-check
import { WATER_Y } from '../config.js';
import { box } from '../world/lowpoly.js';
import { Paint } from '../world/roads/paint.js';
import { SIZES } from '../world/scale.js';
import { CLAIM } from '../world/site.js';
import { CROSSES, reachesOut } from '../world/streetnet.js';
import { buildRoundabout, plantMedian } from './median.js';

// A town's real streets (cfg.roads, from the map data): every street painted on the ground as it
// is drawn (terrain.meshHeightAt), a little wider than life so the small ones still show, busier
// ones darker and over the quieter ones where they meet, a dashed centre line on the main roads
// (stopping short of the streets across it).
// Where a street crosses the river it runs on a deck at bridge height, on piers; where it crosses
// the railway it rises to the rails. Streets stop short of the station yards and the landmarks'
// squares. All of it is vertex-coloured triangles in the world's batch: no draw call of its own.
// The ground under the streets is claimed (site.claimRect) so houses and trees keep off it. Every
// stretch drawn goes into world.streets (points, width, lanes, its surface) for the traffic and
// the people on foot (features/citytraffic.js, strollers.js).
// Wide enough for the traffic drawn at world.scale: the real width, or its lanes at the props
// scale if that is wider (on a small map, a real street would be narrower than a car).

const RANK = ['track', 'service', 'pedestrian', 'living_street', 'residential', 'unclassified', 'road', 'tertiary', 'secondary', 'primary', 'trunk', 'motorway'];
/** Traffic lanes by kind (alleys: one and a half — room to pass a motorbike). */
const LANES = { motorway: 4, trunk: 4, primary: 4, secondary: 2, tertiary: 2, unclassified: 2, road: 2, residential: 1.5, living_street: 1, pedestrian: 1, service: 1, track: 1 };
const MAIN = new Set(['secondary', 'primary', 'trunk', 'motorway']);
/** @param {string} kind */
const colorOf = (kind) => (kind === 'track' ? '#a48d6a' : MAIN.has(kind) ? '#55575c' : kind === 'tertiary' ? '#65676b' : '#8e8b85');
const STEP = 1.2; // units between the points a street is laid through
export const PAVEMENT = 1.5; // metres of pavement each side of the carriageway (at the props scale)
const PAVEMENT_COLOR = '#c4bfb4';

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
  build(world, { rng }) {
    const { cfg, site, terrain, track, batch } = world;
    world.need('đường phố từ dữ liệu bản đồ (cfg.roads)', 'streets', cfg.roads?.length);
    const allRoads = /** @type {NonNullable<typeof cfg.roads>} */ (cfg.roads);
    // The roundabouts (world/streetnet.js): drawn as such, not as roads; the streets that run into one
    // stop at its island.
    const rings = allRoads.flatMap((r) => (r.ring ? [r.ring] : []));
    const roads = allRoads.filter((r) => !r.ring);
    const ground = terrain.meshHeightAt;
    const deck = WATER_Y + 0.9; // bridges: over the water, level with the banks
    const pads = cfg.pads ?? [];
    // Where no street goes: off the diorama (the whole street and its pavements inside the edge,
    // `margin` in from it), the station yards, the landmarks' squares.
    const keepOff = (/** @type {number} */ x, /** @type {number} */ z, /** @type {number} */ margin) =>
      Math.abs(x) > world.size / 2 - margin || Math.abs(z) > world.size / 2 - margin || site.yards.some((p) => Math.hypot(x - p.x, z - p.z) < 24 * track.k) || pads.some((p) => Math.hypot(x - p.x, z - p.z) < p.r + 1) || rings.some((g) => Math.hypot(x - g.x, z - g.z) < g.ri);
    const paint = new Paint();
    const piers = [];
    const lane = world.scale.fit(SIZES.lane);
    const pavement = PAVEMENT * world.scale.props; // each side of the carriageway, for people on foot
    // Over the rails: up to the rail tops, ramping down either side (like a level crossing).
    const surfaceOf = (/** @type {number} */ lift) => (/** @type {number} */ x, /** @type {number} */ z) => {
      let h = Math.max(ground(x, z), deck);
      const d = track.distanceTo(x, z, 12);
      if (d < 12) h = Math.max(h, track.railTop - 0.09 - Math.max(0, d - 2.8 * track.k) * 0.22);
      return h + lift;
    };
    const ordered = [...roads].sort((a, b) => RANK.indexOf(a.kind) - RANK.indexOf(b.kind));
    const laid = [];
    for (const road of ordered) {
      const rank = Math.max(0, RANK.indexOf(road.kind));
      const median = road.median ?? 0; // a boulevard: four lanes (cfg.roads has the whole width), the median between the carriageways
      const lanes = median ? 4 : LANES[road.kind] ?? 2;
      const w = Math.max(road.width, lanes * lane + median), hw = w / 2;
      if (lanes === 2) world.scale.note('lane', w / 2, 'streets');
      const surface = surfaceOf;
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
          if (keepOff(x, z, hw + pavement + 1)) {
            if (runs.at(-1)?.length) runs.push([]);
          } else runs.at(-1)?.push([x, z]);
        }
      }
      for (const run of runs) if (run.length >= 2) laid.push({ road, rank, lanes, median, w, hw, run, line: openLine(run), top, color, surface });
    }
    // The pavements first, a little lower than any carriageway: where a street meets another, the
    // other's carriageway covers this one's pavement across its mouth.
    for (const { hw, line, surface } of laid) {
      const low = surface(0.04);
      paint.strip(line, 0, line.length, hw, hw + pavement, low, PAVEMENT_COLOR);
      paint.strip(line, 0, line.length, -hw - pavement, -hw, low, PAVEMENT_COLOR);
    }
    // Every stretch's segments in a grid, to tell where another street's carriageway is (the
    // centre line stops where it crosses one).
    const CELL = 4;
    /** @type {Map<number, { id: number, ax: number, az: number, bx: number, bz: number, hw: number, kind: string }[]>} */
    const grid = new Map();
    const cell = (/** @type {number} */ x, /** @type {number} */ z) => Math.floor(x / CELL) * 100003 + Math.floor(z / CELL);
    laid.forEach(({ road: { kind }, run, hw }, id) => {
      for (let i = 1; i < run.length; i++) {
        const [ax, az] = run[i - 1], [bx, bz] = run[i];
        const seg = { id, ax, az, bx, bz, hw, kind };
        for (const x of [ax, bx]) for (const z of [az, bz]) {
          const key = cell(x, z);
          const list = grid.get(key) ?? [];
          if (!list.includes(seg)) list.push(seg);
          grid.set(key, list);
        }
      }
    });
    // The centre line stops short of a street across it, far enough back to leave room for a zebra
    // crossing and a stop line (features/citytraffic.js: the other street's half width, its pavement,
    // 3 m of crossing and 2 m more at the props scale; measured square to that street, so further
    // along one meeting it at an angle, as the crossings are). A street alongside — the other half of
    // a dual carriageway — keeps its line.
    const clearance = pavement + 5 * world.scale.props;
    // Does street `other` come out from under street `id`? (streetnet.js: one that doesn't isn't there to cross it.)
    /** @type {Map<number, boolean>} */
    const comesOut = new Map();
    const reaches = (/** @type {number} */ id, /** @type {number} */ other) => {
      const key = id * 100003 + other;
      let v = comesOut.get(key);
      if (v === undefined) comesOut.set(key, (v = reachesOut(laid[id].run, laid[id].hw, pavement, laid[other].run)));
      return v;
    };
    // `median`: is the median of a boulevard cut here? (Only by a street that crosses it for real, with a
    // crossing and a stop line: not a driveway, a service lane or a path.)
    const onOther = (/** @type {number} */ id, /** @type {number} */ x, /** @type {number} */ z, /** @type {number} */ h, median = false) => {
      for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) {
        for (const g of grid.get(cell(x + dx * CELL, z + dz * CELL)) ?? []) {
          if (g.id === id) continue;
          if (median && (!CROSSES.has(g.kind) || !reaches(id, g.id))) continue;
          const ux = g.bx - g.ax, uz = g.bz - g.az, len2 = ux * ux + uz * uz || 1;
          if (Math.abs(Math.sin(h - Math.atan2(ux, uz))) < 0.5) continue;
          const t = Math.max(0, Math.min(1, ((x - g.ax) * ux + (z - g.az) * uz) / len2));
          if (Math.hypot(g.ax + ux * t - x, g.az + uz * t - z) < g.hw + clearance) return true;
        }
      }
      return false;
    };
    for (const [id, { road, rank, lanes, median, w, hw, run, line, top, color, surface }] of laid.entries()) {
      world.streets.push({ kind: road.kind, name: road.name, width: w, lanes, median, points: run, length: line.length, heightAt: top, pavementAt: surface(0.04) });
      paint.strip(line, 0, line.length, -hw, hw, top, color);
      // Round ends, so streets meet without gaps.
      for (const s of [0, line.length]) paint.ring(line.pointAt(s), 0, hw, 0, 0, top, color);
      const skip = (/** @type {number} */ s) => onOther(id, ...line.pointAt(s), line.headingAt(s)) || onOther(id, ...line.pointAt(s + 1.2), line.headingAt(s + 1.2));
      if (median && line.length > 6) {
        // Dashes between the two lanes of each carriageway; the median, planted and lit, between them.
        const lift = 0.075 + rank * 0.012, between = median / 2 + (w - median) / 4;
        for (const side of [-1, 1]) paint.dashes(line, 1, line.length - 1, side * between - 0.07, side * between + 0.07, surface(lift), '#ecebe4', 1.2, 2.8, skip);
        const medianCut = (/** @type {number} */ s) => onOther(id, ...line.pointAt(s), line.headingAt(s), true) || onOther(id, ...line.pointAt(s + 1.2), line.headingAt(s + 1.2), true);
        const nearRing = (/** @type {number} */ s) => {
          const [x, z] = line.pointAt(s);
          return rings.some((g) => Math.hypot(x - g.x, z - g.z) < g.R + 0.8);
        };
        plantMedian(world, { paint, line, median, lane, surface, lift: 0.06 + rank * 0.012, blocked: (s) => medianCut(s) || nearRing(s), rng });
      } else if (MAIN.has(road.kind) && line.length > 6) {
        paint.dashes(line, 1, line.length - 1, -0.07, 0.07, surface(0.075 + rank * 0.012), '#ecebe4', 1.2, 2.8, skip);
      }
      for (let i = 1; i < run.length; i++) {
        const [ax, az] = run[i - 1], [bx, bz] = run[i];
        const mx = (ax + bx) / 2, mz = (az + bz) / 2, len = Math.hypot(bx - ax, bz - az) + 0.2, ang = Math.atan2(bx - ax, bz - az) - Math.PI / 2;
        site.claimRect(mx, mz, len, w, ang, 0, CLAIM.CARRIAGEWAY);
        site.claimRect(mx, mz, len, w, ang, pavement + 0.1, CLAIM.PAVEMENT); // for people on foot: no houses
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
    // The roundabouts: above every road that runs into them.
    const ringLift = 0.06 + (RANK.length - 1) * 0.012 + 0.004;
    for (const ring of rings) {
      buildRoundabout(world, { paint, ring, lane, pavement, surface: surfaceOf, lift: ringLift, color: colorOf('primary'), rng });
      world.roundabouts.push(ring);
      // Cars and trees keep off it: the road round the island (in pieces along it), the island itself.
      const n = 28, mid = (ring.ri + ring.R) / 2;
      for (let i = 0; i < n; i++) {
        const a = ((i + 0.5) / n) * Math.PI * 2;
        site.claimRect(ring.x + Math.cos(a) * mid, ring.z + Math.sin(a) * mid, ((Math.PI * 2 * mid) / n) * 1.15, ring.R - ring.ri, -a + Math.PI / 2, 0, CLAIM.CARRIAGEWAY);
        site.claimRect(ring.x + Math.cos(a) * mid, ring.z + Math.sin(a) * mid, ((Math.PI * 2 * mid) / n) * 1.15, ring.R - ring.ri, -a + Math.PI / 2, pavement + 0.1, CLAIM.PAVEMENT);
      }
      site.claimRect(ring.x, ring.z, ring.ri * 1.5, ring.ri * 1.5, 0, 0.3);
    }
    batch.at(0, 0, 0, 0).add(paint.geometry() ?? []);
    for (const p of piers) batch.at(p.x, p.y0, p.z, p.ry).add([box(p.w, p.y1 - p.y0, 0.7, '#8f8a80', [0, (p.y1 - p.y0) / 2, 0])]);
    return {};
  },
};
