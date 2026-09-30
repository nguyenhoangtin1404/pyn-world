// @ts-check
import { OpenPath, roundedRect } from '../world/vehicles/path.js';
import { layoutRoads, layoutStreet } from '../world/roads/network.js';
import { RoadBuilder } from '../world/roads/builder.js';
import { layRing } from '../world/roads/parts/ring.js';
import { giveWay, layRoundabout } from '../world/roads/parts/roundabout.js';
import { findLevelCrossings, layBranch, levelCrossings } from '../world/roads/parts/branch.js';
import { crossroadsLights, layStreet } from '../world/roads/parts/junction.js';
import { zebra } from '../world/roads/parts/zebra.js';
import { paveSidewalks } from '../world/roads/parts/sidewalks.js';

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
// - sidewalks (1.6 wide, a kerb up from the road) along the ring and the streets and round their
//   circles, and a walk map (world/roads/walkmap.js) for the people: they keep off the carriageway
//   except at the crosswalks, which have their own lights (walk while the cars have red)
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
//
// This file only reads the options and puts the pieces together, in order: the layout
// (world/roads/network.js), then with a RoadBuilder (world/roads/builder.js: paint, props, walk map,
// heights, checks, stop lines) each piece from world/roads/parts/ — ring, roundabout, branch and
// level crossing, streets and crossroads, zebras, sidewalks. The order matters: it is the order
// everything is painted in, and the order of the random numbers the lights take.
/** @type {import('../types').Feature} */
export default {
  label: 'Đang làm đường',
  build(world, { rng, stop: stopId, margin = 6, inset = {}, width = 5, id = `road ${world.roads.length + 1}`, roundabout, branch, lights = [], junctions = [] }) {
    const { terrain, track } = world;
    const stop = stopId ? world.stop(stopId, 'road') : world.stops.find((s) => terrain.zones[s.id]);
    const zone = stop && terrain.zones[stop.id];
    world.need(`một điểm dừng có zone trong cfg.stops${stopId ? ` ("${stopId}")` : ''}`, 'road', zone);
    world.need('một vòng xoay (roundabout) để rẽ nhánh (branch) ra', 'road', !branch || roundabout);

    // The layout, in the zone's (a, b) coordinates mapped to the world.
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
    const streets = junctions.map((j, i) => {
      const o = typeof j === 'string' ? { side: j } : j;
      const { p, out } = onSide(o);
      return { p, cycle: o.cycle, ...layoutStreet({ id: `street ${i + 1}`, c: p, dir: out, back: o.in ?? 18, ahead: o.out ?? 16 }) };
    });
    const zebras = lights.map((l) => onSide(typeof l === 'string' ? { side: l } : l).p);
    const branchLine = net.branch && new OpenPath([net.branch.from, net.branch.to]);
    const crossings = branchLine ? findLevelCrossings(track, branchLine) : [];

    // The pieces: first everything on the ground…
    const b = new RoadBuilder(world, { id, stopId: stop.id, zone, width, net, streets, crossings });
    const ringLine = layRing(b, net.ring, { zebras, streets });
    if (net.circle) layRoundabout(b, net.circle);
    if (net.branch && branchLine && net.turnaround) layBranch(b, branchLine, net.branch, net.turnaround);
    for (const st of streets) layStreet(b, st);

    // …then the routes and what stops the traffic on them…
    const shared = sharedLength(net.routes);
    b.routes = [
      ...net.routes.map((r) => ({ id: r.id, path: r.path, group: 'ring', start: shared })),
      ...streets.map(({ route: r }) => ({ id: r.id, path: r.path, group: r.id, start: r.path.length })),
    ].map((r) => ({ ...r, stops: [] }));
    for (const p of zebras) zebra(b, p, rng);
    const junctionsAt = streets.map((st) => crossroadsLights(b, st, rng));
    if (net.branch) levelCrossings(b, net.branch);
    if (net.circle) giveWay(b, net.circle, net.routes, net.branch?.lane ?? b.half);

    // …and the sidewalks last: where no other road has been laid over them.
    paveSidewalks(b, { ring: ringLine, circle: net.circle, streets });

    const system = b.finish();
    world.roads.push({ id, width, heightAt: b.h.circle, routes: b.routes, shared, signals: b.signals.map((x) => x.signal), gates: crossings.map((x) => x.gate), junctions: junctionsAt });
    return system;
  },
};

// How far every route runs together from s = 0 (they all start on the ring).
function sharedLength(routes) {
  const [first, ...rest] = routes;
  let s = 0;
  while (s < first.path.length && rest.every((r) => { const [x, z] = r.path.pointAt(s), [fx, fz] = first.path.pointAt(s); return Math.hypot(x - fx, z - fz) < 0.3; })) s += 1;
  return s;
}
