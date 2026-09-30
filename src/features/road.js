// @ts-check
import { RAIL_TOP, WATER_Y } from '../config.js';
import { LoopPath, OpenPath, roundedRect } from '../world/vehicles/path.js';
import { angleOf, layoutRoads, layoutStreet, wrapAngle } from '../world/roads/network.js';
import { Paint } from '../world/roads/paint.js';
import { ARM_OPEN, SignalProps } from '../world/roads/props.js';
import { CrossingGate, SignalCycle, crossroads, trainNear } from '../world/roads/signals.js';
import { smoothstep } from '../utils.js';

const RAIL_CLEAR = 6; // road edge to the middle of the track: clear of the ballast and the trains
const GATE_BACK = 7; // a level crossing's stop lines, from the middle of the track along the road
const ASPHALT = '#5a5c61', LINE = '#eeeeea', CENTRE = '#f2e6c0', GRASS = '#6f9a4a', CURB = '#f1f1ec', RED = '#c8322b';
/** @type {Record<string, [number, number]>} */
const SIDES = { a0: [-1, 0], a1: [1, 0], b0: [0, -1], b1: [0, 1] };

// A ring road round the houses by a stop: a rounded rectangle inside the stop's flat zone (its
// `zone` in cfg.stops), `margin` in from the zone's edges and never closer than 14 to the railway.
// Put it BEFORE the features that build houses there ("village", "halt"): it keeps them off the
// road. Vehicles drive on it one way ("traffic"); people just cross it. Painted: edge lines, a
// dashed centre line, zebra crossings.
//
// Options: stop (id; default the first stop with a zone), margin (6: from every edge of the zone),
// inset ({ a0, a1, b }: a different margin for the track side, the far side, or the two ends — e.g.
// to keep off a river), width (5), id, and
// - roundabout: a side of the ring ('a0' track side, 'a1' far side, 'b0' / 'b1' the ends) or
//   { side, at (0..1 along it, 0.5), radius (of the lane, 8) }: a roundabout on the ring there
// - branch: length, or { length, lane, turn }: a two-way road from the roundabout straight out of
//   the zone to a turning circle `length` from the roundabout's centre. Where it crosses the railway
//   it gets a level crossing: barriers that come down, and lamps that flash, when a train is near
// - lights: [{ side, at }] (or just sides): a zebra crossing on the ring with traffic lights
// - junctions: [{ side, at, in, out, cycle }] (or just sides): a crossroads with traffic lights — a
//   two-way street straight across that side of the ring, `in` units (18) into the zone and `out`
//   (16) out of it to a turning circle at each end. The lights let the ring and the street go in turn
//   (cycle: { green 12, yellow 3, clear 2 } seconds, `clear` = red both ways in between)
//
// Registers in world.roads: { id, width, heightAt, routes: [{ id, path, stops, group, start }], shared,
// signals, gates, junctions } — each route a lane vehicles drive round (the ring; the ring out along
// the branch and back; a street across the ring and back), with the places to stop at when told to.
// Routes in the same `group` run on the same road for their first `start` units (`shared`, for the
// ring's): vehicles start spread out along it.
/** @type {import('../types').Feature} */
export default {
  label: 'Đang làm đường',
  build(world, { rng, stop: stopId, margin = 6, inset = {}, width = 5, id = `road ${world.roads.length + 1}`, roundabout, branch, lights = [], junctions = [] }) {
    const { terrain, site, batch, track } = world;
    const stop = stopId ? world.stop(stopId, 'road') : world.stops.find((s) => terrain.zones[s.id]);
    const zone = stop && terrain.zones[stop.id];
    world.need(`một điểm dừng có zone trong cfg.stops${stopId ? ` ("${stopId}")` : ''}`, 'road', zone);
    world.need('một vòng xoay (roundabout) để rẽ nhánh (branch) ra', 'road', !branch || roundabout);
    const { origin, inward, along } = zone;
    /** @type {(a: number, b: number) => [number, number]} */
    const toWorld = (a, b) => [origin.x + inward.x * a + along.x * b, origin.z + inward.z * a + along.z * b];
    const a0 = Math.max(zone.A0 + (inset.a0 ?? margin), 14), a1 = zone.A1 - (inset.a1 ?? margin);
    const b0 = -zone.HALF_B + (inset.b ?? margin), b1 = zone.HALF_B - (inset.b ?? margin);
    // A point on a side of the ring, `at` of the way along it, and the way out of the zone there.
    /** @param {{ side: string, at?: number }} o */
    const onSide = ({ side, at = 0.5 }) => {
      const d = SIDES[side];
      if (!d) throw new Error(`Đường "${id}": không có cạnh "${side}" (a0, a1, b0, b1)`);
      const a = d[0] ? (d[0] < 0 ? a0 : a1) : a0 + (a1 - a0) * at;
      const b = d[1] ? (d[1] < 0 ? b0 : b1) : b0 + (b1 - b0) * at;
      return { p: toWorld(a, b), out: /** @type {[number, number]} */ ([inward.x * d[0] + along.x * d[1], inward.z * d[0] + along.z * d[1]]) };
    };
    const rb = typeof roundabout === 'string' ? { side: roundabout } : roundabout;
    const rbAt = rb && onSide(rb);
    const net = layoutRoads({
      ring: roundedRect({ a0, a1, b0, b1, radius: rb ? 6 : 10, step: rb ? 1 : 2, toWorld }),
      width,
      roundabout: rbAt && { c: rbAt.p, out: rbAt.out, radius: rb.radius },
      branch: typeof branch === 'number' ? { length: branch } : branch,
    });
    const half = width / 2;
    // Streets across the ring, with lights where they cross it.
    const streets = junctions.map((j, i) => {
      const o = typeof j === 'string' ? { side: j } : j;
      const { p, out } = onSide(o);
      return { p, cycle: o.cycle, ...layoutStreet({ id: `street ${i + 1}`, c: p, dir: out, back: o.in ?? 18, ahead: o.out ?? 16 }) };
    });

    // Level crossings: wherever the branch runs over the railway.
    /** @type {{ s: number, p: [number, number], at: number, gate: CrossingGate, posts: ReturnType<SignalProps['crossingPost']>[] }[]} */
    const crossings = [];
    const branchLine = net.branch && new OpenPath([net.branch.from, net.branch.to]);
    if (branchLine) {
      let prev = Infinity, falling = true;
      for (let s = 0; s <= branchLine.length; s += 0.25) {
        const [x, z] = branchLine.pointAt(s);
        const d = track.distanceTo(x, z, 4);
        if (falling && d > prev && prev < 1.5) {
          const p = branchLine.pointAt(s - 0.25);
          let at = 0, best = Infinity;
          for (const f of track.frames) {
            const e = Math.hypot(f.p.x - p[0], f.p.z - p[1]);
            if (e < best) [best, at] = [e, f.s];
          }
          crossings.push({ s: s - 0.25, p, at, gate: new CrossingGate(), posts: [] });
        }
        falling = d <= prev;
        prev = d;
      }
    }
    // The ground under the roads, raised over the rails at a level crossing (flush with the rail
    // tops, sloping down to the ground either side) so wheels roll straight across.
    const deck = (/** @type {number} */ x, /** @type {number} */ z) => {
      let h = -Infinity;
      for (const { p } of crossings) {
        if (Math.abs(x - p[0]) > 14 || Math.abs(z - p[1]) > 14) continue;
        h = Math.max(h, RAIL_TOP - 0.09 - Math.max(0, track.distanceTo(x, z, 12) - 2.8) * 0.22);
      }
      return h;
    };
    const ground = terrain.meshHeightAt; // the ground as drawn (see terrain.meshHeightAt)
    const lift = (/** @type {number} */ dy) => (/** @type {number} */ x, /** @type {number} */ z) => Math.max(ground(x, z), deck(x, z)) + dy;
    // Pieces overlap where they join: each a little higher than the one it covers, marks above that.
    const ringH = lift(0.06), ringMark = lift(0.09), branchH = lift(0.08), branchMark = lift(0.11);
    const circleH = lift(0.1), circleMark = lift(0.13), islandH = lift(0.34);

    // Everything on water or the railway (but for the level crossings) is a mistake in the config.
    const check = (/** @type {number} */ x, /** @type {number} */ z) => {
      const wet = terrain.heightAt(x, z) < WATER_Y + 0.4;
      const onRails = !wet && track.distanceTo(x, z, RAIL_CLEAR) < RAIL_CLEAR && !crossings.some(({ p }) => Math.hypot(x - p[0], z - p[1]) < 12);
      if (!wet && !onRails) return;
      const { a, b } = zone.local(x, z);
      const what = wet ? 'cắt qua nước' : 'đè lên đường ray';
      throw new Error(`Đường "${id}" ${what} ở a = ${a.toFixed(0)}, b = ${b.toFixed(0)} (zone của "${stop.id}"): cho nó nhỏ lại bằng margin / inset`);
    };

    const paint = new Paint();
    const props = new SignalProps(batch);
    // A turning circle at the end of a road that comes from the direction of `from`.
    const turningCircle = (/** @type {[number, number]} */ T, /** @type {number} */ outer, /** @type {[number, number]} */ from) => {
      for (let t = 0; t < Math.PI * 2; t += 0.1) check(T[0] + Math.sin(t) * outer, T[1] + Math.cos(t) * outer);
      paint.ring(T, 0, outer, 0, 0, circleH, ASPHALT);
      edgeWithGaps(paint, T, outer, [angleOf(T, from)], circleMark);
      island(paint, props, T, 2.4, islandH, circleH);
      site.obstacles.push([T[0], T[1], outer + 3]);
    };

    // The ring: asphalt, edge lines, dashed centre line (not across a zebra).
    const ringLine = net.ring.closed ? new LoopPath(net.ring.points) : new OpenPath(net.ring.points);
    const L = ringLine.length;
    for (let s = 0; s <= L; s += 1) {
      const [x, z] = ringLine.pointAt(s), h = ringLine.headingAt(s);
      check(x + Math.cos(h) * half, z - Math.sin(h) * half);
      check(x - Math.cos(h) * half, z + Math.sin(h) * half);
    }
    paint.strip(ringLine, 0, L, -half, half, ringH, ASPHALT);
    // Edge lines broken where a street crosses (its asphalt lies over the ring's there).
    const crossed = streets.flatMap((st) => {
      const s = ringLine.nearest(st.p[0], st.p[1]).s, h = st.width / 2 + 0.3;
      return [-L, 0, L].map((k) => [s - h + k, s + h + k]);
    });
    for (const [f, t] of spans(0, L, crossed)) {
      paint.strip(ringLine, f, t, half - 0.35, half - 0.2, ringMark, LINE);
      paint.strip(ringLine, f, t, -half + 0.2, -half + 0.35, ringMark, LINE);
    }
    const zebras = lights.map((l) => onSide(typeof l === 'string' ? { side: l } : l).p);
    const near = (/** @type {[number, number]} */ [x, z]) => [...zebras, ...streets.map((st) => st.p)].some((p) => Math.hypot(x - p[0], z - p[1]) < 5.5);
    paint.dashes(ringLine, net.ring.closed ? 0 : 2, L - 2, -0.08, 0.08, ringMark, CENTRE, 2.4, 6, (s) => near(ringLine.pointAt(s + 1.2)));
    for (let s = 0; s < L; s += 6) {
      const [x, z] = ringLine.pointAt(s);
      site.obstacles.push([x, z, half + 4]); // keep houses and trees off the road
    }

    // The roundabout: a ring of asphalt round an island with a red and white kerb and a tree.
    const { circle, turnaround } = net;
    if (circle) {
      const { c, inner, outer } = circle;
      for (let t = 0; t < Math.PI * 2; t += 0.1) check(c[0] + Math.sin(t) * outer, c[1] + Math.cos(t) * outer);
      paint.ring(c, inner, outer, 0, 0, circleH, ASPHALT);
      paint.ring(c, inner + 0.2, inner + 0.35, 0, 0, circleMark, LINE);
      edgeWithGaps(paint, c, outer, circle.joins, circleMark);
      island(paint, props, c, inner, islandH, circleH);
      site.obstacles.push([c[0], c[1], outer + 3]);
    }

    // The branch: two lanes out to the turning circle, over the railway on a level crossing.
    if (net.branch && branchLine && turnaround) {
      const { width: bw } = net.branch;
      const W = bw / 2, len = branchLine.length;
      for (let s = 0; s <= len; s += 1) {
        const [x, z] = branchLine.pointAt(s), h = branchLine.headingAt(s);
        check(x + Math.cos(h) * W, z - Math.sin(h) * W);
        check(x - Math.cos(h) * W, z + Math.sin(h) * W);
        if (s % 4 === 0) site.obstacles.push([x, z, W + 4]);
      }
      paint.strip(branchLine, 0, len, -W, W, branchH, ASPHALT);
      paint.wall(branchLine, 0, len, W, branchH, ground, '#77736b');
      paint.wall(branchLine, 0, len, -W, branchH, ground, '#77736b');
      // Markings stop at the rails, and where the turning circle's asphalt starts.
      const end = len - turnaround.outer + 0.2;
      const holes = crossings.map((x) => [x.s - 3, x.s + 3]);
      const solid = crossings.map((x) => [x.s - 14, x.s + 14]);
      for (const [f, t] of spans(0.8, end, holes)) {
        paint.strip(branchLine, f, t, W - 0.35, W - 0.2, branchMark, LINE);
        paint.strip(branchLine, f, t, -W + 0.2, -W + 0.35, branchMark, LINE);
        for (const [f2, t2] of spans(f, t, solid)) paint.dashes(branchLine, f2, t2, -0.08, 0.08, branchMark, CENTRE, 2.4, 6);
        for (const [f2, t2] of solid) if (t2 > f && f2 < t) paint.strip(branchLine, Math.max(f, f2), Math.min(t, t2), -0.08, 0.08, branchMark, CENTRE);
      }
      turningCircle(turnaround.c, turnaround.outer, net.branch.from);
    }

    // The streets: two lanes across the ring, a turning circle at each end.
    for (const st of streets) {
      const line = new OpenPath([st.from, st.to]);
      const W = st.width / 2, len = line.length, mid = Math.hypot(st.p[0] - st.from[0], st.p[1] - st.from[1]);
      for (let s = 0; s <= len; s += 1) {
        const [x, z] = line.pointAt(s), h = line.headingAt(s);
        check(x + Math.cos(h) * W, z - Math.sin(h) * W);
        check(x - Math.cos(h) * W, z + Math.sin(h) * W);
        if (s % 4 === 0) site.obstacles.push([x, z, W + 4]);
      }
      paint.strip(line, 0, len, -W, W, branchH, ASPHALT);
      // Markings: none across the ring; the centre line solid coming up to the lights.
      const solid = [mid - 10, mid + 10];
      for (const [f, t] of spans(st.turn.outer - 0.2, len - st.turn.outer + 0.2, [[mid - half - 0.3, mid + half + 0.3]])) {
        paint.strip(line, f, t, W - 0.35, W - 0.2, branchMark, LINE);
        paint.strip(line, f, t, -W + 0.2, -W + 0.35, branchMark, LINE);
        for (const [f2, t2] of spans(f, t, [solid])) paint.dashes(line, f2, t2, -0.08, 0.08, branchMark, CENTRE, 2.4, 6);
        if (solid[1] > f && solid[0] < t) paint.strip(line, Math.max(f, solid[0]), Math.min(t, solid[1]), -0.08, 0.08, branchMark, CENTRE);
      }
      turningCircle(st.from, st.turn.outer, st.to);
      turningCircle(st.to, st.turn.outer, st.from);
    }

    // What stops the traffic, and where on each route.
    const shared = sharedLength(net.routes);
    const routes = [
      ...net.routes.map((r) => ({ id: r.id, path: r.path, group: 'ring', start: shared })),
      ...streets.map(({ route: r }) => ({ id: r.id, path: r.path, group: r.id, start: r.path.length })),
    ].map((r) => ({ ...r, stops: /** @type {import('../world/vehicles/traffic.js').StopPoint[]} */ ([]) }));
    /**
     * A stop line at p (a lane `hl` either side of it), on every route through it; returns the
     * heading there, or null if no route goes through.
     * @param {[number, number]} p
     * @param {number} hl
     * @param {import('../world/vehicles/traffic.js').StopPoint['blocked']} blocked
     * @param {(path: LoopPath, s: number) => void} [draw] markings, drawn once
     */
    const stopLine = (p, hl, blocked, draw) => {
      let heading = null;
      for (const r of routes) {
        const { s, d } = r.path.nearest(p[0], p[1]);
        if (d > 1) continue;
        r.stops.push({ s, blocked });
        if (heading === null) {
          heading = r.path.headingAt(s);
          (draw ?? ((path, s) => paint.strip(path, s - 0.45, s, -hl + 0.1, hl - 0.1, lift(0.14), LINE)))(r.path, s);
        }
      }
      return heading;
    };

    // Traffic lights at the zebras.
    const signals = [];
    for (const p of zebras) {
      const r0 = routes[0].path, sz = r0.nearest(p[0], p[1]).s;
      for (let off = -half + 0.55; off < half - 0.4; off += 1) paint.strip(r0, sz - 1.5, sz + 1.5, off, off + 0.5, lift(0.14), LINE);
      const signal = new SignalCycle({ offset: rng() * 26 });
      const at = r0.pointAt(sz - 3.2);
      const h = stopLine(at, half, (car, d) => signal.stops(d, car.v));
      if (h === null) continue;
      const lx = Math.cos(h), lz = -Math.sin(h), k = half + 0.8;
      const heads = [1, -1].map((side) => {
        const x = at[0] + lx * k * side, z = at[1] + lz * k * side;
        site.colliders.push({ x, z, r: 0.3 });
        return props.trafficLight(x, ground(x, z), z, h);
      });
      signals.push({ signal, heads });
    }

    // Crossroads: the ring and the street go in turn. Lights at the stop lines, on the right (and on
    // the left of the one-way ring too).
    const crossroadsAt = [];
    for (const st of streets) {
      const [ringSignal, streetSignal] = crossroads({ ...st.cycle, offset: rng() * 34 });
      const ringHeads = [], streetHeads = [];
      const light = (/** @type {[number, number]} */ [x, z], /** @type {number} */ h, /** @type {any[]} */ heads) => {
        site.colliders.push({ x, z, r: 0.3 });
        heads.push(props.trafficLight(x, ground(x, z), z, h));
      };
      const r0 = routes[0].path, sc = r0.nearest(st.p[0], st.p[1]).s;
      const at = r0.pointAt(sc - 4.5);
      const h = stopLine(at, half, (car, d) => ringSignal.stops(d, car.v));
      if (h !== null) for (const side of [1, -1]) light([at[0] + Math.cos(h) * (half + 0.8) * side, at[1] - Math.sin(h) * (half + 0.8) * side], h, ringHeads);
      const { dir, right, lane } = st, W = st.width / 2;
      for (const way of [1, -1]) {
        /** @type {(k: number, side: number) => [number, number]} */
        const pt = (k, side) => [st.p[0] + dir[0] * k * way + right[0] * side * way, st.p[1] + dir[1] * k * way + right[1] * side * way];
        const hs = stopLine(pt(-3.5, lane), lane, (car, d) => streetSignal.stops(d, car.v));
        light(pt(-3.5, W + 0.8), hs ?? Math.atan2(dir[0] * way, dir[1] * way), streetHeads);
      }
      signals.push({ signal: ringSignal, heads: ringHeads }, { signal: streetSignal, heads: streetHeads });
      crossroadsAt.push({ p: st.p, signals: [ringSignal, streetSignal] });
    }

    // Level crossings: a stop line and a post with a half barrier for each lane coming up to it.
    if (net.branch) {
      const { dir, right, lane } = net.branch;
      const W = net.branch.width / 2;
      for (const xing of crossings) {
        xing.posts = [1, -1].map((way) => {
          // way 1: going out (right-hand lane, before the rails), -1: coming back.
          /** @type {(k: number, side: number) => [number, number]} */
          const pt = (k, side) => [xing.p[0] + dir[0] * k * way + right[0] * side * way, xing.p[1] + dir[1] * k * way + right[1] * side * way];
          const h = stopLine(pt(-GATE_BACK, lane), lane, () => xing.gate.active);
          const [px, pz] = pt(-GATE_BACK + 0.6, W + 0.7);
          site.colliders.push({ x: px, z: pz, r: 0.3 });
          return props.crossingPost(px, ground(px, pz), pz, h ?? Math.atan2(dir[0] * way, dir[1] * way), W + 0.4);
        });
      }
    }

    // Give way at the roundabout: wait while anyone on it is coming round towards us.
    if (circle) {
      const { c, radius } = circle;
      const yields = [];
      for (const r of net.routes) {
        for (const e of r.entries) {
          const p = r.path.pointAt(e.s);
          if (yields.some((y) => Math.hypot(y[0] - p[0], y[1] - p[1]) < 1.5)) continue;
          yields.push(p);
          const ring = circle.joins.slice(0, 2).some((j) => Math.abs(Math.atan2(Math.sin(j - e.angle), Math.cos(j - e.angle))) < 0.35);
          const hl = ring ? half : net.branch?.lane ?? half;
          stopLine(p, hl, (car, d, cars) => cars.some((o) => {
            if (o === car) return false;
            const q = o.path.pointAt(o.s);
            if (Math.abs(Math.hypot(q[0] - c[0], q[1] - c[1]) - radius) > 1.8) return false;
            return wrapAngle(e.angle - angleOf(c, q)) < 2.2; // about two seconds away
          }), (path, s) => {
            for (let off = -hl + 0.15; off < hl - 0.3; off += 0.9) paint.strip(path, s - 0.8, s - 0.35, off, off + 0.5, lift(0.14), LINE);
          });
        }
      }
    }

    batch.at(0, 0, 0, 0).add(paint.geometry() ?? []);
    const group = props.build();
    const trainLength = () => (world.train ? world.train.cars.at(-1).offset + 6 : 0);
    world.roads.push({ id, width, heightAt: circleH, routes, shared, signals: signals.map((x) => x.signal), gates: crossings.map((x) => x.gate), junctions: crossroadsAt });

    return {
      group,
      update({ dt }) {
        for (const { signal, heads } of signals) {
          signal.update(dt);
          const st = signal.state;
          for (const head of heads) for (const c of /** @type {const} */ (['red', 'yellow', 'green'])) head[c].visible = st === c;
        }
        for (const xing of crossings) {
          xing.gate.update(dt, !!world.train && trainNear(world.train, trainLength(), xing.at, track.length));
          const lit = xing.gate.lamp;
          const raise = ARM_OPEN * (1 - smoothstep(0, 1, xing.gate.arm));
          for (const post of xing.posts) {
            post.lamps.forEach((l, i) => (l.visible = lit === i));
            post.pivot.rotation.z = raise;
          }
        }
      },
    };
  },
};

// The line round the outside of a circle of asphalt, broken where roads join it.
function edgeWithGaps(paint, c, outer, joins, heightAt) {
  const gap = 3.8 / outer;
  const js = [...joins].map(wrapAngle).sort((a, b) => a - b);
  js.forEach((j, i) => {
    const next = js[(i + 1) % js.length] + (i + 1 === js.length ? Math.PI * 2 : 0);
    if (next - j > 2 * gap) paint.ring(c, outer - 0.35, outer - 0.2, j + gap, next - gap, heightAt, LINE);
  });
}

// Grass in the middle of a circle, a red and white kerb round it, a little tree.
function island(paint, props, c, r, top, base) {
  paint.ring(c, 0, r - 0.35, 0, 0, top, GRASS);
  paint.ring(c, r - 0.35, r, 0, 0, top, (i) => (i % 2 ? CURB : RED));
  const edge = new LoopPath(Array.from({ length: 48 }, (_, i) => {
    const t = (i / 48) * Math.PI * 2;
    return /** @type {[number, number]} */ ([c[0] + Math.sin(t) * r, c[1] + Math.cos(t) * r]);
  }));
  paint.wall(edge, 0, edge.length, 0, top, base, CURB, -1); // going round anticlockwise, outside is to the right
  props.tree(c[0], top(c[0], c[1]), c[1]);
}

// The parts of [from, to] outside the holes.
function spans(from, to, holes) {
  let out = [[from, to]];
  for (const [h0, h1] of holes) out = out.flatMap(([a, b]) => (h1 <= a || h0 >= b ? [[a, b]] : [[a, h0], [h1, b]].filter(([x, y]) => y - x > 0.5)));
  return out;
}

// How far every route runs together from s = 0 (they all start on the ring).
function sharedLength(routes) {
  const [first, ...rest] = routes;
  let s = 0;
  while (s < first.path.length && rest.every((r) => { const [x, z] = r.path.pointAt(s), [fx, fz] = first.path.pointAt(s); return Math.hypot(x - fx, z - fz) < 0.3; })) s += 1;
  return s;
}
