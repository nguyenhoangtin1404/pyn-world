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
import { Paint } from '../world/roads/paint.js';

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
 * Distance from (x, z) to a polyline.
 * @param {[number, number][]} pts @param {number} x @param {number} z
 */
export function distanceToLine(pts, x, z) {
  let best = Infinity;
  for (let i = 1; i < pts.length; i++) {
    const [ax, az] = pts[i - 1], [bx, bz] = pts[i];
    const dx = bx - ax, dz = bz - az, len2 = dx * dx + dz * dz || 1;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / len2));
    best = Math.min(best, Math.hypot(ax + dx * t - x, az + dz * t - z));
  }
  return best;
}

/**
 * The point `d` along a polyline from where it passes nearest p (d < 0: back towards its start),
 * and its heading there (the way the points run); null if the line ends first.
 * @param {[number, number][]} pts @param {[number, number]} p @param {number} d
 * @returns {[number, number, number] | null}
 */
export function alongFrom(pts, [x, z], d) {
  const at = [0];
  let best = Infinity, s0 = 0;
  for (let i = 1; i < pts.length; i++) {
    const [ax, az] = pts[i - 1], [bx, bz] = pts[i];
    const dx = bx - ax, dz = bz - az, len = Math.hypot(dx, dz);
    at.push(at[i - 1] + len);
    const t = len ? Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (len * len))) : 0;
    const dist = Math.hypot(ax + dx * t - x, az + dz * t - z);
    if (dist < best) [best, s0] = [dist, at[i - 1] + t * len];
  }
  const s = s0 + d, end = at[at.length - 1];
  if (s < 0 || s > end) return null;
  const point = (/** @type {number} */ q) => {
    q = Math.max(0, Math.min(end, q));
    let i = 1;
    while (i < pts.length - 1 && at[i] < q) i++;
    const len = at[i] - at[i - 1], t = len ? (q - at[i - 1]) / len : 0;
    return [pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * t, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * t];
  };
  const [px, pz] = point(s), [ax, az] = point(s - 0.5), [bx, bz] = point(s + 0.5);
  return [px, pz, Math.atan2(bx - ax, bz - az)];
}

/**
 * How much of street `a` runs alongside `b`: the share of its points within their widths (and a
 * little) of one of b's.
 * @param {{ points: [number, number][], width: number }} a @param {{ points: [number, number][], width: number }} b
 */
export function alongside(a, b) {
  const near = (a.width + b.width) / 2 + 2;
  let n = 0;
  for (const [x, z] of a.points) if (b.points.some(([bx, bz]) => Math.abs(bx - x) < near && Math.abs(bz - z) < near && Math.hypot(bx - x, bz - z) < near)) n++;
  return n / a.points.length;
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
 * Whether crosswalk `a`, but for the ends (at a crossroads, the ends of the
 * crossings on two arms meet at the corner), lies on `b`: a grid of points over it.
 * @typedef {{ x: number, z: number, h: number, half: number, depth: number }} Rect
 * @param {Rect} a @param {Rect} b
 */
export function overlaps(a, b) {
  for (const u of [-0.7, -0.35, 0, 0.35, 0.7]) {
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
      // Not the same road again (drawn twice in the map, or a dual carriageway as two streets side
      // by side): its lanes would be the other's, the traffic on them head on.
      .reduce((kept, s) => (kept.length < routeCount && !kept.some((o) => alongside(s, o) > 0.3) ? [...kept, s] : kept), /** @type {typeof world.streets} */ ([]));
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
    // crossing out of step with the next; on each arm of each street, a zebra crossing where the
    // other street's pavements cross it, a stop line before it and, on the right-hand pavement,
    // a pole with the traffic light and, below it, the light for the people crossing.
    // The markings are painted (world/roads/paint.js) on whichever street is on top at each corner,
    // so they lie on the road wherever it tilts.
    const props = new SignalProps(world.batch, k, { square: true });
    const paint = new Paint();
    /** @type {{ signal: import('../world/roads/signals.js').SignalCycle, heads: import('../world/roads/props.js').LightHead[], walks: { stop: THREE.Object3D, walk: THREE.Object3D, margin: number }[] }[]} */
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
    const WHITE = '#f2f1ea';
    /** @type {[number, number, number][]} poles put up: x, z, heading of the traffic they face */
    const poles = [];
    for (const j of junctions) {
      const phases = crossroads({ offset: rng() * 40 }).map((signal) => ({ signal, heads: /** @type {import('../world/roads/props.js').LightHead[]} */ ([]), walks: /** @type {{ stop: THREE.Object3D, walk: THREE.Object3D, margin: number }[]} */ ([]) }));
      const here = j.streets.map((o) => all[o]);
      // The surface on top at (x, z): the highest of the streets there that cover it.
      const top = (/** @type {number} */ x, /** @type {number} */ z) => {
        let y = -Infinity;
        for (const st of here) if (distanceToLine(st.points, x, z) < st.width / 2 + 0.05) y = Math.max(y, st.heightAt(x, z));
        return y > -Infinity ? y : here[0].heightAt(x, z);
      };
      // A flat mark from (x, z) along heading h: `along` either way of it, `across` either side.
      const mark = (/** @type {number} */ x, /** @type {number} */ z, /** @type {number} */ h, /** @type {number} */ along, /** @type {number} */ across) => {
        const fx = Math.sin(h), fz = Math.cos(h), lx = Math.cos(h), lz = -Math.sin(h);
        const n = Math.max(1, Math.ceil((2 * along) / 0.5)), m = Math.max(1, Math.ceil((2 * across) / 0.5));
        const at = (/** @type {number} */ i, /** @type {number} */ q) => {
          const u = -along + (2 * along * i) / n, v = -across + (2 * across * q) / m;
          const px = x + fx * u + lx * v, pz = z + fz * u + lz * v;
          return /** @type {[number, number, number]} */ ([px, top(px, pz) + 0.015, pz]);
        };
        for (let i = 0; i < n; i++) for (let q = 0; q < m; q++) paint.quad(at(i, q), at(i + 1, q), at(i + 1, q + 1), at(i, q + 1), WHITE);
      };
      // A pole on the pavement at (x, z) for traffic along h: its light, and below it the light for
      // people crossing this street (`margin`: seconds of red they need); moved out (up to a unit)
      // off any carriageway or the railway there, left out if there's no room.
      const pole = (/** @type {number} */ x, /** @type {number} */ z, /** @type {number} */ h, /** @type {typeof all[number]} */ st, /** @type {typeof phases[number]} */ phase) => {
        const clearOf = (/** @type {number} */ px, /** @type {number} */ pz) => world.site.claimAt(px, pz) !== CLAIM.CARRIAGEWAY && world.track.distanceTo(px, pz, 6) > 3.6 * world.track.k + 1;
        for (let d = 0; d <= 1; d += 0.25) {
          const px = x - Math.cos(h) * d, pz = z + Math.sin(h) * d;
          if (!clearOf(px, pz)) continue;
          // One pole for the lane (the same road can be two streets in the map: two lanes in one place).
          if (poles.some(([qx, qz, qh]) => Math.hypot(qx - px, qz - pz) < 1.5 && Math.cos(qh - h) > 0.7)) return;
          poles.push([px, pz, h]);
          const y = st.pavementAt(px, pz);
          phase.heads.push(props.trafficLight(px, y, pz, h));
          // Facing across the street, at the people on the far kerb.
          phase.walks.push({ ...props.walkOnPole(px, y, pz, Math.atan2(-Math.cos(h), Math.sin(h))), margin: (st.width + PAVEMENT * k) / (1.3 * k) + 1 });
          return;
        }
      };
      const h0 = headingNear(here[0].points, j.p);
      // Each street at the crossing: its phase, how far back its stop lines are, the arms it has.
      const arms = j.streets.map((si) => {
        const st = all[si];
        const hs = headingNear(st.points, j.p);
        const phase = Math.abs(Math.cos(hs - h0)) > 0.7 ? phases[0] : phases[1];
        // The zebra crossing where the other street's pavements cross this one (people walking
        // along it go over here), and the stop line a metre short of it.
        // (At an angle, the other street's edge is further along this one: over sin of the angle.)
        const dc = Math.max(...j.streets.filter((o) => o !== si).map((o) => (all[o].width / 2 + (PAVEMENT * k) / 2) / Math.max(0.6, Math.abs(Math.sin(hs - headingNear(all[o].points, j.p))))));
        const depth = CROSSWALK * k, across = dc + depth / 2 + k;
        // Along the street itself (not a straight line from the crossing: streets bend); a street
        // ending at the crossing has one arm.
        const dirs = [1, -1].filter((dir) => alongFrom(st.points, j.p, -dir * dc) && alongFrom(st.points, j.p, -dir * (across + k)));
        return { si, st, phase, dc, depth, across, dirs };
      });
      // First the crossings, every arm's…
      for (const { st, phase, dc, depth, dirs } of arms) {
        const half = st.width / 2;
        for (const dir of dirs) {
          const [x, z, hl] = /** @type {[number, number, number]} */ (alongFrom(st.points, j.p, -dir * dc)), h = hl + (dir < 0 ? Math.PI : 0);
          // Not over another arm's crossing (streets meeting at a sharp angle, or two crossroads close by).
          const mine = { x, z, h, half, depth };
          if (world.crosswalks.some((c) => overlaps(c, mine) || overlaps(mine, c))) continue;
          for (let off = -half + 0.55 * k; off <= half - 0.3 * k; off += k) mark(x + Math.cos(h) * off, z - Math.sin(h) * off, h, depth / 2, 0.25 * k);
          world.crosswalks.push({ x, z, h, half, depth, signal: phase.signal });
        }
      }
      // …then the stop lines and the poles.
      for (const { si, st, phase, across, dirs } of arms) {
        const route = routes[si], half = st.width / 2;
        if (!route) {
          // A street without traffic: its poles, on each arm into the crossing.
          for (const dir of dirs) {
            const at = /** @type {[number, number, number]} */ (alongFrom(st.points, j.p, -dir * across));
            const h = at[2] + (dir < 0 ? Math.PI : 0), out = half + (PAVEMENT * k) / 2;
            pole(at[0] - Math.cos(h) * out, at[1] + Math.sin(h) * out, h, st, phase);
          }
          continue;
        }
        for (const s of passes(route.path, [j.p[0] / k, j.p[1] / k], (st.width / 2 + 0.5) / k)) {
          const stop = route.path.wrap(s - across / k);
          route.stops.push({ s: stop, blocked: (car, d) => phase.signal.stops(d, car.v) });
          const [mx, mz] = route.path.pointAt(stop), h = route.path.headingAt(stop);
          const x = mx * k, z = mz * k;
          // The stop line across the lane — unless that is on a crossing or another street (streets
          // meeting at a sharp angle): the cars still stop there.
          const line = { x, z, h, half: half / 2, depth: 0.4 * k };
          const clear = !world.crosswalks.some((c) => overlaps(line, c) || overlaps(c, line)) && !here.some((o) => o !== st && distanceToLine(o.points, x, z) < o.width / 2);
          if (clear) mark(x, z, h, 0.2 * k, half / 2 - 0.05);
          const out = st.width / 4 + (PAVEMENT * k) / 2; // from the lane to the middle of the pavement, on the right
          pole(x - Math.cos(h) * out, z + Math.sin(h) * out, h, st, phase);
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
    world.batch.at(0, 0, 0, 0).add(paint.geometry() ?? []);
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
        for (const { signal, heads, walks } of signals) {
          signal.update(dt);
          const st = signal.state;
          for (const head of heads) for (const c of /** @type {const} */ (['red', 'yellow', 'green'])) head[c].visible = st === c;
          for (const w of walks) w.stop.visible = !(w.walk.visible = signal.walk(w.margin));
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
