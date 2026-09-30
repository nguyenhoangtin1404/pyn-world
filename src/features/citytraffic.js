// @ts-check
import * as THREE from 'three';
import { Fleet } from '../world/vehicles/fleet.js';
import { LoopPath } from '../world/vehicles/path.js';
import { Vehicle } from '../world/vehicles/vehicle.js';
import { KINDS } from '../world/vehicles/kinds.js';
import { updateTraffic } from '../world/vehicles/traffic.js';
import { SIZES } from '../world/scale.js';
import { SignalProps } from '../world/roads/props.js';
import { crossroads } from '../world/roads/signals.js';
import { PAVEMENT } from './streets.js';
import { CLAIM } from '../world/site.js';
import { box } from '../world/lowpoly.js';

/**
 * Where a loop path goes past point p (within `near`): the distance along it of the nearest point
 * of each pass (a street's loop passes a crossing twice, once in each lane).
 * @param {LoopPath} path @param {[number, number]} p @param {number} near
 * @returns {number[]}
 */
export function passes(path, [x, z], near) {
  const pts = path.points, out = [];
  let best = Infinity, at = -1;
  for (let i = 0; i <= pts.length; i++) {
    const d = i < pts.length ? Math.hypot(pts[i][0] - x, pts[i][1] - z) : Infinity;
    if (d < near && d < best) [best, at] = [d, i];
    else if (d >= near && at >= 0) {
      out.push(path.at[at]);
      [best, at] = [Infinity, -1];
    }
  }
  return out;
}

// Traffic on a town's real streets (world.streets, from features/streets.js): motorbikes above all
// (it's Vietnam), bicycles, cars, pickups and lorries, each up and down one of the longer main
// streets — along it on the right, a U-turn at the end, and back. Drawn at world.scale: the
// vehicles are k times their size and live in the model's units (world / k), so the traffic rules
// (world/vehicles/traffic.js — keeping their distance, the first of two at a crossing goes) and
// their speeds are the same as anywhere. They stop for people on foot in the street
// (world.pedestrians), and at red lights: where two of these streets cross (findJunctions) there
// are traffic lights, two phases (roads/signals.js crossroads), a zebra crossing on each arm where
// the pavements cross it (world.crosswalks: people go over while that street's traffic has red —
// features/strollers.js), a stop line before it in each lane and a light on the pavement beside it. Head lights at dusk and in the rain,
// brake lights when braking; key 8 follows them. Options: vehicles ({ kind: count }), routes (how
// many streets, 10), min (shortest street, 60 units), lights (traffic lights, true).
const CROSSWALK = 3; // metres deep, along the street (at the props scale)
const MAIN = new Set(['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'unclassified']);

/**
 * A street's points up to where it comes back alongside itself (a dual carriageway drawn up one
 * side and down the other as one line): two lanes of the loop would run through each other there.
 * @param {[number, number][]} pts @param {number} near
 */
export function untangle(pts, near) {
  const at = [0];
  for (let i = 1; i < pts.length; i++) at.push(at[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  for (let j = 1; j < pts.length; j++) {
    for (let i = 0; i < j && at[j] - at[i] > near * 4; i++) {
      if (Math.hypot(pts[j][0] - pts[i][0], pts[j][1] - pts[i][1]) < near) return pts.slice(0, Math.max(2, j - Math.ceil(near))); // back off a little
    }
  }
  return pts;
}

/**
 * Where streets cross: every pair of segments of two different streets that cross at a good angle
 * (not two streets running side by side), those within `merge` of each other taken as one.
 * @param {{ points: [number, number][] }[]} streets
 * @param {number} [merge]
 * @returns {{ p: [number, number], streets: number[] }[]}
 */
export function findJunctions(streets, merge = 5) {
  const CELL = 4;
  /** @type {Map<string, [number, number][]>} grid cell → [street, segment] */
  const grid = new Map();
  const key = (/** @type {number} */ i, /** @type {number} */ j) => `${i},${j}`;
  streets.forEach((st, a) => {
    for (let i = 1; i < st.points.length; i++) {
      const [ax, az] = st.points[i - 1], [bx, bz] = st.points[i];
      for (let gx = Math.floor(Math.min(ax, bx) / CELL); gx <= Math.floor(Math.max(ax, bx) / CELL); gx++) {
        for (let gz = Math.floor(Math.min(az, bz) / CELL); gz <= Math.floor(Math.max(az, bz) / CELL); gz++) {
          const k = key(gx, gz);
          if (!grid.has(k)) grid.set(k, []);
          grid.get(k)?.push([a, i]);
        }
      }
    }
  });
  /** @type {{ p: [number, number], streets: number[] }[]} */
  const found = [];
  const seen = new Set();
  for (const list of grid.values()) {
    for (let m = 0; m < list.length; m++) {
      for (let n = m + 1; n < list.length; n++) {
        const [a, i] = list[m], [b, j] = list[n];
        if (a === b || seen.has(`${a}:${i}:${b}:${j}`)) continue;
        seen.add(`${a}:${i}:${b}:${j}`);
        const [p0, p1] = [streets[a].points[i - 1], streets[a].points[i]], [q0, q1] = [streets[b].points[j - 1], streets[b].points[j]];
        const rx = p1[0] - p0[0], rz = p1[1] - p0[1], sx = q1[0] - q0[0], sz = q1[1] - q0[1];
        const cross = rx * sz - rz * sx;
        const lr = Math.hypot(rx, rz), ls = Math.hypot(sx, sz);
        if (!lr || !ls || Math.abs(cross) / (lr * ls) < 0.6) continue; // (nearly) side by side
        const t = ((q0[0] - p0[0]) * sz - (q0[1] - p0[1]) * sx) / cross, u = ((q0[0] - p0[0]) * rz - (q0[1] - p0[1]) * rx) / cross;
        if (t < 0 || t > 1 || u < 0 || u > 1) continue;
        /** @type {[number, number]} */
        const p = [p0[0] + rx * t, p0[1] + rz * t];
        const near = found.find((f) => Math.hypot(f.p[0] - p[0], f.p[1] - p[1]) < merge);
        if (near) {
          for (const s of [a, b]) if (!near.streets.includes(s)) near.streets.push(s);
        } else found.push({ p, streets: [a, b] });
      }
    }
  }
  return found;
}

/**
 * Whether crosswalk `a`, but for its ends (at a crossroads, the ends of the crossings on two arms
 * meet at the corner), lies on `b`: a grid of points over the middle of it.
 * @typedef {{ x: number, z: number, h: number, half: number, depth: number }} Rect
 * @param {Rect} a @param {Rect} b
 */
export function overlaps(a, b) {
  for (const u of [-0.6, 0, 0.6]) {
    for (const v of [-1, 0, 1]) {
      const x = a.x + Math.cos(a.h) * u * a.half + Math.sin(a.h) * (v * a.depth) / 2, z = a.z - Math.sin(a.h) * u * a.half + Math.cos(a.h) * (v * a.depth) / 2;
      const dx = x - b.x, dz = z - b.z;
      if (Math.abs(dx * Math.sin(b.h) + dz * Math.cos(b.h)) < b.depth / 2 && Math.abs(dx * Math.cos(b.h) - dz * Math.sin(b.h)) < b.half) return true;
    }
  }
  return false;
}

/** @type {import('../types').Feature} */
export default {
  label: 'Đang cho xe ra phố',
  needs: ['streets'],
  build(world, { rng, vehicles = { motorbike: 12, bicycle: 3, car: 5, pickup: 1, truck: 2 }, routes: routeCount = 10, min = 60, lights = true }) {
    for (const kind of Object.keys(vehicles)) world.need(`loại xe có bánh (không phải "${kind}")`, 'citytraffic', KINDS[kind] && !KINDS[kind].flies);
    const k = world.scale.props;
    const along = (/** @type {[number, number][]} */ p) => p.reduce((sum, q, i) => sum + (i ? Math.hypot(q[0] - p[i - 1][0], q[1] - p[i - 1][1]) : 0), 0);
    const streets = world.streets
      .filter((s) => MAIN.has(s.kind))
      .map((s) => ({ ...s, points: untangle(s.points, s.width * 1.5) }))
      .map((s) => ({ ...s, length: along(s.points) }))
      .filter((s) => s.length >= min)
      .sort((a, b) => b.length - a.length)
      .slice(0, routeCount);
    world.need(`phố chính dài ít nhất ${min} đơn vị (world.streets)`, 'citytraffic', streets.length);
    if (vehicles.car) world.scale.note('car', KINDS.car.length * k, 'citytraffic');

    // Each street a loop in the model's units: its right-hand lane along it, then back on the other side.
    const routes = streets.map((st) => {
      const off = st.width / 4;
      const pts = st.points;
      /** @param {number} i @returns {[number, number]} the right-hand side going along (the direction
       *  over a few points either side, so the two lanes don't fold into each other at a sharp bend) */
      const right = (i) => {
        const [ax, az] = pts[Math.max(0, i - 3)], [bx, bz] = pts[Math.min(pts.length - 1, i + 3)];
        const len = Math.hypot(bx - ax, bz - az) || 1;
        return [-(bz - az) / len, (bx - ax) / len];
      };
      /** @type {[number, number][]} */
      const loop = [];
      for (let i = 0; i < pts.length; i++) {
        const [rx, rz] = right(i);
        loop.push([(pts[i][0] + rx * off) / k, (pts[i][1] + rz * off) / k]);
      }
      for (let i = pts.length - 1; i >= 0; i--) {
        const [rx, rz] = right(i);
        loop.push([(pts[i][0] - rx * off) / k, (pts[i][1] - rz * off) / k]);
      }
      return { path: new LoopPath(loop), heightAt: st.heightAt, name: st.name, /** @type {import('../world/vehicles/traffic.js').StopPoint[]} */ stops: [] };
    });

    // Traffic lights where the main streets cross: two phases (roads.signals.crossroads), each
    // crossing out of step with the next; on each street, a stop line before the crossing street in
    // both directions and a light on the right-hand pavement.
    const props = new SignalProps(world.batch, k);
    /** @type {{ signal: import('../world/roads/signals.js').SignalCycle, heads: import('../world/roads/props.js').LightHead[] }[]} */
    const signals = [];
    // Where a street with traffic crosses any main street (lights on that one too, though nothing
    // drives it: it's the town's crossroads that have lights).
    const others = world.streets.filter((s) => MAIN.has(s.kind) && s.length >= 10 && !streets.some((r) => r.points[0] === s.points[0]));
    const all = [...streets, ...others];
    const junctions = lights ? findJunctions(all).filter((j) => j.streets.some((si) => si < streets.length)) : [];
    const headingNear = (/** @type {[number, number][]} */ pts, /** @type {[number, number]} */ p) => {
      let best = Infinity, h = 0;
      for (let i = 1; i < pts.length; i++) {
        const d = Math.hypot((pts[i][0] + pts[i - 1][0]) / 2 - p[0], (pts[i][1] + pts[i - 1][1]) / 2 - p[1]);
        if (d < best) [best, h] = [d, Math.atan2(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1])];
      }
      return h;
    };
    for (const j of junctions) {
      const phases = crossroads({ offset: rng() * 40 }).map((signal) => ({ signal, heads: /** @type {import('../world/roads/props.js').LightHead[]} */ ([]) }));
      // A light on the pavement at (x, z) facing traffic along h, moved out (up to a unit) off any
      // carriageway or the railway there; left out if there's no room (the stop line still works).
      const light = (/** @type {number} */ x, /** @type {number} */ z, /** @type {number} */ h, /** @type {typeof all[number]} */ st, /** @type {typeof phases[number]} */ phase) => {
        const clearOf = (/** @type {number} */ px, /** @type {number} */ pz) => world.site.claimAt(px, pz) !== CLAIM.CARRIAGEWAY && world.track.distanceTo(px, pz, 6) > 3.6 * world.track.k + 1;
        for (let d = 0; d <= 1; d += 0.25) {
          const px = x - Math.cos(h) * d, pz = z + Math.sin(h) * d;
          if (!clearOf(px, pz)) continue;
          phase.heads.push(props.trafficLight(px, st.pavementAt(px, pz), pz, h));
          return;
        }
      };
      const h0 = headingNear(all[j.streets[0]].points, j.p);
      for (const si of j.streets) {
        const st = all[si], route = routes[si];
        const hs = headingNear(st.points, j.p);
        const phase = Math.abs(Math.cos(hs - h0)) > 0.7 ? phases[0] : phases[1];
        // A zebra crossing either side, where the other street's pavements cross this one (people
        // walking along it go over here), and the stop line a metre short of it.
        // (At an angle, the other street's edge is further along this one: over sin of the angle.)
        const dc = Math.max(...j.streets.filter((o) => o !== si).map((o) => (all[o].width / 2 + (PAVEMENT * k) / 2) / Math.max(0.6, Math.abs(Math.sin(hs - headingNear(all[o].points, j.p))))));
        // On top of whichever street is highest there (where they meet, the busier one's surface).
        const top = (/** @type {number} */ x, /** @type {number} */ z) => Math.max(...j.streets.map((o) => all[o].heightAt(x, z)));
        const depth = CROSSWALK * k, across = dc + depth / 2 + k;
        for (const dir of [1, -1]) {
          const h = hs + (dir < 0 ? Math.PI : 0), x = j.p[0] - Math.sin(h) * dc, z = j.p[1] - Math.cos(h) * dc, half = st.width / 2;
          // Not over another arm's crossing (streets meeting at a sharp angle, or two crossroads close by).
          const mine = { x, z, h, half, depth };
          if (world.crosswalks.some((c) => overlaps(c, mine) || overlaps(mine, c))) continue;
          for (let off = -half + 0.3 * k; off <= half - 0.3 * k; off += k) {
            const px = x + Math.cos(h) * off, pz = z - Math.sin(h) * off;
            world.batch.at(px, top(px, pz) + 0.012, pz, h).add([box(0.5 * k, 0.02, depth, '#f2f1ea')]);
          }
          world.crosswalks.push({ x, z, h, half, depth, signal: phase.signal });
        }
        if (!route) {
          // A street without traffic: its lights, either way into the crossing.
          for (const dir of [1, -1]) {
            const h = hs + (dir < 0 ? Math.PI : 0), out = st.width / 4 + (PAVEMENT * k) / 2 + st.width / 4;
            const sx = j.p[0] - Math.sin(h) * across, sz = j.p[1] - Math.cos(h) * across;
            const x = sx - Math.cos(h) * out, z = sz + Math.sin(h) * out;
            light(x, z, h, st, phase);
          }
          continue;
        }
        for (const s of passes(route.path, [j.p[0] / k, j.p[1] / k], (st.width / 2 + 0.5) / k)) {
          const stop = route.path.wrap(s - across / k);
          route.stops.push({ s: stop, blocked: (car, d) => phase.signal.stops(d, car.v) });
          const [mx, mz] = route.path.pointAt(stop), h = route.path.headingAt(stop);
          // The stop line across the lane.
          world.batch.at(mx * k, top(mx * k, mz * k) + 0.012, mz * k, h).add([box(st.width / 2 - 0.05, 0.02, 0.4 * k, '#f2f1ea')]);
          const out = st.width / 4 + (PAVEMENT * k) / 2; // from the lane to the middle of the pavement, on the right
          const x = mx * k - Math.cos(h) * out, z = mz * k + Math.sin(h) * out;
          light(x, z, h, st, phase);
        }
      }
      signals.push(...phases); // every phase runs, lit or not (a stop line with no room for its light still changes)
    }

    const group = new THREE.Group();
    const fleet = new Fleet(vehicles);
    group.add(...fleet.meshes);
    const kinds = Object.entries(vehicles).flatMap(([kind, n]) => Array(n).fill(kind));
    for (let i = kinds.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [kinds[i], kinds[j]] = [kinds[j], kinds[i]];
    }
    // Shared out between the streets, spread evenly along each.
    const onRoute = routes.map(() => 0);
    const picks = kinds.map((kind, i) => {
      const r = i % routes.length;
      return { kind, r, n: onRoute[r]++ };
    });
    const cars = picks.map(({ kind, r, n }) => {
      const { path, heightAt, stops } = routes[r];
      const car = new Vehicle({ kind, fleet, path, s: ((n + rng() * 0.5) / onRoute[r]) * path.length, rng, heightAt, k });
      car.stops = stops;
      return car;
    });
    group.add(props.build());
    for (const c of cars) group.add(c.group);
    world.vehicles.push(...cars);
    const count = {};
    world.followables.vehicles.push(
      ...cars.map((c) => {
        count[c.kind] = (count[c.kind] ?? 0) + 1;
        return { label: `${c.spec.label} ${count[c.kind]}`, anchor: () => c.group };
      }),
    );

    const people = [];
    return {
      group,
      update({ dt }) {
        for (const { signal, heads } of signals) {
          signal.update(dt);
          const st = signal.state;
          for (const head of heads) for (const c of /** @type {const} */ (['red', 'yellow', 'green'])) head[c].visible = st === c;
        }
        people.length = 0;
        for (const w of world.pedestrians) people.push({ x: w.pos.x / k, z: w.pos.z / k });
        updateTraffic(cars, people, SIZES.lane / 2);
        for (const c of cars) c.update(dt);
      },
      lateUpdate({ lights, overcast }) {
        const on = lights > 0.3 || overcast > 0.6;
        fleet.beamsOn = on;
        for (const c of cars) c.light(on);
      },
    };
  },
};
