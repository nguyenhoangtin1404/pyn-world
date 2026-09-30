// @ts-check
import * as THREE from 'three';
import { Fleet } from '../world/vehicles/fleet.js';
import { LoopPath } from '../world/vehicles/path.js';
import { Vehicle } from '../world/vehicles/vehicle.js';
import { KINDS } from '../world/vehicles/kinds.js';
import { updateTraffic } from '../world/vehicles/traffic.js';
import { SIZES } from '../world/scale.js';

// Traffic on a town's real streets (world.streets, from features/streets.js): motorbikes above all
// (it's Vietnam), bicycles, cars, pickups and lorries, each up and down one of the longer main
// streets — along it on the right, a U-turn at the end, and back. Drawn at world.scale: the
// vehicles are k times their size and live in the model's units (world / k), so the traffic rules
// (world/vehicles/traffic.js — keeping their distance, the first of two at a crossing goes) and
// their speeds are the same as anywhere. They stop for people on foot in the street
// (world.pedestrians). Lights at dusk and in the rain, brake lights when braking; key 8 follows
// them. Options: vehicles ({ kind: count }), routes (how many streets, 10), min (shortest street,
// 60 units).
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

/** @type {import('../types').Feature} */
export default {
  label: 'Đang cho xe ra phố',
  needs: ['streets'],
  build(world, { rng, vehicles = { motorbike: 12, bicycle: 3, car: 5, pickup: 1, truck: 2 }, routes: routeCount = 10, min = 60 }) {
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
      return { path: new LoopPath(loop), heightAt: st.heightAt, name: st.name };
    });

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
      const { path, heightAt } = routes[r];
      return new Vehicle({ kind, fleet, path, s: ((n + rng() * 0.5) / onRoute[r]) * path.length, rng, heightAt, k });
    });
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
