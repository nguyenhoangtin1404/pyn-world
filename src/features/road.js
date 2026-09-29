// @ts-check
import * as THREE from 'three';
import { WATER_Y } from '../config.js';
import { box, lam } from '../world/lowpoly.js';
import { LoopPath, roundedRect } from '../world/vehicles/path.js';

const RAIL_CLEAR = 6; // road edge to the middle of the track: clear of the ballast and the trains

// A ring road round the houses by a stop: a rounded rectangle inside the stop's flat zone (its
// `zone` in cfg.stops), `margin` in from the zone's edges and never closer than 14 to the railway.
// Put it BEFORE the features that build houses there ("village", "halt"): it keeps them off the
// road. Vehicles drive on it ("traffic"); people just cross it. Registers { id, path, width, heightAt } in
// world.roads. Options: stop (id; default the first stop with a zone), margin (6: from every edge of
// the zone), inset ({ a0, a1, b }: a different margin for the track side, the far side, or the
// two ends — e.g. to keep off a river at the far side), width (5), id.
/** @type {import('../types').Feature} */
export default {
  label: 'Đang làm đường',
  build(world, { stop: stopId, margin = 6, inset = {}, width = 5, id = `road ${world.roads.length + 1}` }) {
    const { terrain, site, batch } = world;
    // On the ground as drawn (see terrain.meshHeightAt), a little above it.
    const surfaceAt = (x, z) => terrain.meshHeightAt(x, z) + 0.06;
    const stop = stopId ? world.stop(stopId, 'road') : world.stops.find((s) => terrain.zones[s.id]);
    const zone = stop && terrain.zones[stop.id];
    world.need(`một điểm dừng có zone trong cfg.stops${stopId ? ` ("${stopId}")` : ''}`, 'road', zone);
    const { origin, inward, along } = zone;
    /** @type {(a: number, b: number) => [number, number]} */
    const toWorld = (a, b) => [origin.x + inward.x * a + along.x * b, origin.z + inward.z * a + along.z * b];
    const path = new LoopPath(
      roundedRect({
        a0: Math.max(zone.A0 + (inset.a0 ?? margin), 14),
        a1: zone.A1 - (inset.a1 ?? margin),
        b0: -zone.HALF_B + (inset.b ?? margin),
        b1: zone.HALF_B - (inset.b ?? margin),
        radius: 10,
        step: 2,
        toWorld,
      }),
    );

    // Asphalt: a ribbon on the ground, 1 unit long × a quarter of the width per quad so it follows
    // the ground's triangles, every point checked for water and the railway (crossing either would
    // need a bridge or a level crossing — move the road with margin / inset instead).
    const half = width / 2;
    const ACROSS = 4;
    const n = Math.ceil(path.length);
    const row = (s) => {
      const [x, z] = path.pointAt(s);
      const h = path.headingAt(s);
      const pts = [];
      for (let k = 0; k <= ACROSS; k++) {
        const off = -half + (width * k) / ACROSS;
        const ex = x + Math.cos(h) * off, ez = z - Math.sin(h) * off;
        const wet = terrain.heightAt(ex, ez) < WATER_Y + 0.4;
        if (wet || world.track.distanceTo(ex, ez, RAIL_CLEAR) < RAIL_CLEAR) {
          const { a, b } = zone.local(ex, ez);
          const what = wet ? 'cắt qua nước' : 'đè lên đường ray';
          throw new Error(`Đường "${id}" ${what} ở a = ${a.toFixed(0)}, b = ${b.toFixed(0)} (zone của "${stop.id}"): cho nó nhỏ lại bằng margin / inset`);
        }
        pts.push([ex, surfaceAt(ex, ez), ez]);
      }
      return pts;
    };
    const pos = [];
    let prev = row(0);
    for (let i = 1; i <= n; i++) {
      const cur = row((i / n) * path.length);
      for (let k = 0; k < ACROSS; k++) pos.push(...prev[k], ...prev[k + 1], ...cur[k + 1], ...prev[k], ...cur[k + 1], ...cur[k]);
      prev = cur;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.computeVertexNormals();
    const asphalt = new THREE.Mesh(geo, lam('#5a5c61', { side: THREE.DoubleSide }));
    asphalt.receiveShadow = true;

    // Dashed centre line, baked with the other static parts; and keep houses and trees off the road.
    for (let s = 0; s < path.length; s += 6) {
      const [x, z] = path.pointAt(s);
      batch.at(x, surfaceAt(x, z) + 0.01, z, path.headingAt(s));
      batch.add(box(0.15, 0.02, 2.4, '#f2e6c0'));
      site.obstacles.push([x, z, half + 4]);
    }

    world.roads.push({ id, path, width, heightAt: surfaceAt });
    return { group: new THREE.Group().add(asphalt) };
  },
};
