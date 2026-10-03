// @ts-check
import * as THREE from 'three';
import { box, cyl, cone } from '../world/lowpoly.js';
import { KINDS, PAINT } from '../world/vehicles/kinds.js';
import { CLAIM } from '../world/site.js';
import { SegIndex } from '../world/segindex.js';
import { Person } from '../world/people.js';
import { Walker } from '../world/walker.js';
import { PAVEMENT } from './streets.js';
import { pavementWalks } from './strollers.js';

// Life along a town's streets (world.streets, world.buildings — a world from map data): shop signs and
// striped awnings over the ground floor of some of the buildings facing a street; in front of them
// motorbikes parked on the pavement (nose in, or along it where there is no room), pavement cafés (a
// low table, plastic stools, someone sitting) and food carts with their vendor under a parasol; cars
// parked at the kerb of the side streets (minor ones, with no traffic: citytraffic's routes keep their lanes).
// Everything keeps out of the way: off the walks of the people on the pavements (pavementWalks — the
// strollers' — and the tourists' between the bus stop and the grounds), off the carriageways with traffic,
// the crossings and the landmarks' squares; on the pavement it stands against the building, the walk on
// the kerb side of it. All static, in world.batch (the sitters and the vendors are people). Only within
// `reach` metres (600) of the landmark, where the town is lived in.
// Options: shops (40), cars (14), carts (5), sitters (8), reach (600).
// world.streetLife lists the circles everything takes on the ground (tests/e2e: nobody walks into one).

const AWNINGS = [['#c8453a', '#f4f1ea'], ['#2f8f8b', '#f4f1ea'], ['#e0a64a', '#f4f1ea'], ['#3a7fc4', '#f4f1ea'], ['#6d8b3a', '#f2e6c4']];
const SIGNS = ['#c8453a', '#2a62b8', '#e0a64a', '#2f8f8b', '#8e5aa8', '#d4402f', '#1f6f4a'];
const STOOLS = ['#2a62b8', '#c8453a', '#3f9a4a', '#e0a64a'];
const CARTS = ['#3a7fc4', '#c8453a', '#2f8f8b', '#e0a64a'];
const TYRE = '#1f1d1c', CHROME = '#b9bec4', DARK = '#2b2522';
const ACROSS = { rz: Math.PI / 2 };
const MINOR = new Set(['residential', 'service', 'unclassified', 'living_street', 'road']); // streets cars park in

/** @type {import('../types').Feature} */
export default {
  label: 'Đang cho phố thêm đời sống',
  needs: ['streets', 'buildings', 'citytraffic'],
  build(world, { rng, shops = 40, cars = 14, carts = 5, sitters = 8, reach = 600 }) {
    const k = world.scale.props;
    const { site } = world;
    world.need('nhà từ dữ liệu bản đồ (world.buildings)', 'streetlife', world.buildings.length);
    // (Not in `needs`: a town with no bus stop has street life too. But with one, it comes first, or nothing here
    // knows where its passengers walk and they'd walk through what stands there.)
    const busToo = world.cfg.features.some((f) => (typeof f === 'string' ? f : f.id) === 'busstop');
    world.need('bến xe buýt dựng trước ("busstop" đặt trước "streetlife" trong cfg.features)', 'streetlife', !busToo || world.busStop);
    const ground = world.terrain.meshHeightAt;
    const half = world.size / 2;
    const P = PAVEMENT * k;
    const pick = (/** @type {any[]} */ a) => a[Math.floor(rng() * a.length)];
    const focus = world.landmarks[0]?.spot ?? new THREE.Vector3();
    const R = world.scale.m(reach);
    const near = (/** @type {number} */ x, /** @type {number} */ z) => Math.hypot(x - focus.x, z - focus.z) < R;
    const streets = world.streets.filter((s) => s.kind !== 'track');

    // ---- What has to stay clear.
    // The pavement walks, both sides of every street, both ways: a walker heads straight for the next
    // point once within 0.3 of the one before, so it cuts the corners — those chords too.
    const walks = new SegIndex(4);
    const { streets: walked, walk } = pavementWalks(world);
    for (const st of walked) {
      for (const side of /** @type {const} */ ([1, -1])) {
        const route = walk(st, side);
        walks.addLine(route);
        for (let i = 1; i < route.length - 1; i++) {
          for (const [a, b] of [[i - 1, i + 1], [i + 1, i - 1]]) {
            const p = route[i], q = route[a], d = p.distanceTo(q) || 1, cut = Math.min(0.3, d) / d;
            walks.add(p.x + (q.x - p.x) * cut, p.z + (q.z - p.z) * cut, route[b].x, route[b].z);
          }
        }
      }
    }
    for (const [ax, az, bx, bz] of world.busStop?.walks ?? []) walks.add(ax, az, bx, bz, 1.0 * k);
    // The lanes with traffic (citytraffic's routes, in the model's units), and every street's
    // carriageway and pavements (tag: its index, so a car parked on one can skip its own).
    const lanes = new SegIndex(4);
    for (const rt of world.cityRoutes) {
      const n = Math.ceil(rt.path.length / 2);
      let [px, pz] = rt.path.pointAt(0);
      for (let i = 1; i <= n; i++) {
        const [x, z] = rt.path.pointAt((i / n) * rt.path.length);
        lanes.add(px * k, pz * k, x * k, z * k);
        [px, pz] = [x, z];
      }
    }
    const strips = new SegIndex(4);
    streets.forEach((st, i) => strips.addLine(st.points, st.width / 2 + P, i));
    // Buildings, by cell.
    /** @type {Map<number, typeof world.buildings>} */
    const byCell = new Map();
    const BC = 6, bkey = (/** @type {number} */ i, /** @type {number} */ j) => (i + 32768) * 65536 + (j + 32768);
    for (const b of world.buildings) {
      const r = Math.hypot(b.length, b.width) / 2;
      for (let i = Math.floor((b.x - r) / BC); i <= Math.floor((b.x + r) / BC); i++)
        for (let j = Math.floor((b.z - r) / BC); j <= Math.floor((b.z + r) / BC); j++) {
          const list = byCell.get(bkey(i, j));
          if (list) list.push(b);
          else byCell.set(bkey(i, j), [b]);
        }
    }
    const inBuilding = (/** @type {number} */ x, /** @type {number} */ z, /** @type {number} */ r) =>
      (byCell.get(bkey(Math.floor(x / BC), Math.floor(z / BC))) ?? []).some((b) => {
        const c = Math.cos(b.angle), s = Math.sin(b.angle), dx = x - b.x, dz = z - b.z;
        const u = Math.abs(dx * c - dz * s) - b.length / 2, v = Math.abs(dx * s + dz * c) - b.width / 2;
        return Math.hypot(Math.max(u, 0), Math.max(v, 0)) + Math.min(Math.max(u, v), 0) < r;
      });
    const pads = world.cfg.pads ?? [];
    /** @type {{ x: number, z: number, r: number, kind: string }[]} */
    const props = [];
    const CLEAR = 0.3 * k + 0.08; // a person's half width, and a little
    /**
     * Can these circles stand here? `road`: on a carriageway with no traffic (a parked car), else off
     * every carriageway.
     * @param {{ x: number, z: number, r: number }[]} cs @param {boolean} [road]
     */
    const fits = (cs, road = false, own = -1) =>
      cs.every(({ x, z, r }) => {
        if (Math.abs(x) > half - 2 || Math.abs(z) > half - 2 || !near(x, z)) return false;
        if ((site.claimAt(x, z) === CLAIM.CARRIAGEWAY) !== road) return false;
        if (walks.clearance(x, z, r + CLEAR + 1) < r + CLEAR) return false;
        if (lanes.clearance(x, z, r + 2) < r + 1.5 * k) return false;
        if (road && strips.clearance(x, z, r + 3, own) < r + 1) return false; // (clear of the junctions…)
        if (road && world.roundabouts.some((o) => Math.hypot(x - o.x, z - o.z) < o.R + 3 + r)) return false; // (…and the roundabouts)
        if (inBuilding(x, z, r)) return false;
        if (pads.some((p) => Math.hypot(x - p.x, z - p.z) < p.r + 1 + r)) return false;
        if (world.crosswalks.some((c) => Math.hypot(x - c.x, z - c.z) < c.half + c.depth + 1 + r)) return false;
        if (props.some((o) => Math.hypot(x - o.x, z - o.z) < r + o.r)) return false;
        return !site.colliders.some((c) => Math.abs(c.x - x) < r + c.r && Math.abs(c.z - z) < r + c.r && Math.hypot(c.x - x, c.z - z) < r + c.r * 0.6);
      });
    const take = (/** @type {{ x: number, z: number, r: number }[]} */ cs, /** @type {string} */ kind) => props.push(...cs.map((c) => ({ ...c, kind })));

    const group = new THREE.Group();
    const life = { group, props, shops: 0, bikes: 0, cars: 0, cafes: 0, carts: 0 };
    world.streetLife = life;
    /** @type {Walker[]} */
    const vendors = [];

    // ---- Building sides facing a street: the pavement within a couple of units of the wall.
    /** @type {{ b: typeof world.buildings[number], mx: number, mz: number, nx: number, nz: number, w: number, st: typeof streets[number] }[]} */
    const fronts = [];
    for (const b of world.buildings) {
      if (!near(b.x, b.z)) continue;
      const c = Math.cos(b.angle), s = Math.sin(b.angle);
      for (const [ux, uz, along, across] of [[c, -s, b.length, b.width], [-c, s, b.length, b.width], [s, c, b.width, b.length], [-s, -c, b.width, b.length]]) {
        const mx = b.x + (ux * along) / 2, mz = b.z + (uz * along) / 2;
        let d = 0.1;
        while (d < 2 && site.claimAt(mx + ux * d, mz + uz * d) < CLAIM.PAVEMENT) d += 0.1;
        if (d >= 2) continue;
        const best = strips.nearest(mx + ux * d, mz + uz * d, 3).tag; // (which street: the nearest strip there)
        if (best >= 0) fronts.push({ b, mx, mz, nx: ux, nz: uz, w: across, st: streets[best] });
      }
    }
    fronts.sort(() => rng() - 0.5);

    // Height of what stands at (x, z): the pavement where it is one, else the ground.
    const standAt = (/** @type {typeof streets[number]} */ st, /** @type {number} */ x, /** @type {number} */ z) =>
      site.claimAt(x, z) >= CLAIM.PAVEMENT ? Math.max(ground(x, z), st.pavementAt(x, z)) : ground(x, z);
    const storey = world.scale.fit(3.2);

    // ---- Shops: an awning and a sign over the ground floor; in front, parked bikes or a café.
    let sat = 0;
    for (const f of fronts.slice(0, Math.min(fronts.length, shops * 2))) {
      if (life.shops >= shops) break;
      const { b, mx, mz, nx, nz, w, st } = f;
      if (b.height < storey * 1.3 || w < 0.9) continue;
      const ry = Math.atan2(nx, nz), X = [Math.cos(ry), -Math.sin(ry)];
      const wm = w / k; // the front's width in metres
      const g = standAt(st, mx + nx * 0.2, mz + nz * 0.2);
      const hinge = Math.min((storey / k) * 0.85, 3.2);
      // (no shop where the wall's foot is far below the street: a front yard, a slope)
      if (Math.abs(g - b.foot) > storey * 0.8) continue;
      const parts = [];
      const aw = Math.min(wm * 0.8, 6.5), n = Math.max(3, Math.round(aw / 0.45)), [ca, cb] = pick(AWNINGS);
      for (let i = 0; i < n; i++) parts.push(box(aw / n + 0.002, 0.04, 1.15, i % 2 ? cb : ca, [-aw / 2 + (i + 0.5) * (aw / n), hinge - 0.18, 0.55], { rx: 0.33 }));
      parts.push(box(aw, 0.2, 0.03, ca, [0, hinge - 0.48, 1.1])); // valance
      const sw = Math.min(wm * 0.85, 7), sy = hinge + 0.42, sc = pick(SIGNS);
      parts.push(box(sw, 0.55, 0.08, sc, [0, sy, 0.05]), box(sw * 0.84, 0.24, 0.02, '#fffaf0', [0, sy, 0.1]));
      for (let i = 0, m = Math.max(2, Math.floor(sw / 0.9)); i < m; i++) parts.push(box(0.22 + rng() * 0.3, 0.12, 0.02, i % 3 ? sc : DARK, [(-sw * 0.84) / 2 + ((i + 0.5) * sw * 0.84) / m, sy, 0.115]));
      world.batch.at(mx, g, mz, ry, k).add(parts);
      life.shops++;

      // In front: a café (one shop in three), else a row of parked bikes, or nothing.
      const roll = rng();
      if (roll < 0.33) {
        if (cafe(f, ry, X)) life.cafes++;
      } else if (roll < 0.85) bikes(f, ry, X, 2 + Math.floor(rng() * 4));
    }
    // Bikes in front of some of the other fronts too.
    for (const f of fronts.slice(shops * 2)) {
      if (rng() >= 0.15) continue;
      const ry = Math.atan2(f.nx, f.nz);
      bikes(f, ry, [Math.cos(ry), -Math.sin(ry)], 1 + Math.floor(rng() * 3));
    }

    /**
     * Motorbikes parked against the front: nose in if there's room, else along it.
     * @param {typeof fronts[number]} f @param {number} ry @param {number[]} X @param {number} count
     */
    function bikes(f, ry, X, count) {
      const { mx, mz, nx, nz, w, st } = f;
      const u0 = (rng() - 0.5) * Math.max(0, w - count * 0.8 * k);
      for (let i = 0; i < count; i++) {
        for (const nose of [true, false]) {
          // nose in: 2 m deep, 0.8 m apart; along: 0.7 m deep, 2.2 m apart
          const u = u0 + (i - (count - 1) / 2) * (nose ? 0.8 : 2.2) * k;
          const v = (nose ? 1.0 : 0.38) * k + 0.05;
          const x = mx + X[0] * u + nx * v, z = mz + X[1] * u + nz * v;
          const r = 0.42 * k, dir = nose ? [nx, nz] : [X[0], X[1]];
          const cs = [-0.5, 0.5].map((o) => ({ x: x + dir[0] * o * k, z: z + dir[1] * o * k, r }));
          if (!fits(cs)) continue;
          take(cs, 'bike');
          const heading = nose ? ry + Math.PI + (rng() - 0.5) * 0.3 : ry + (rng() < 0.5 ? 1 : -1) * Math.PI / 2;
          world.batch.at(x, standAt(st, x, z), z, heading, k).add(parkedBike(pick(KINDS.motorbike.colors)));
          life.bikes++;
          break;
        }
      }
    }

    /**
     * A café on the pavement: one or two low tables with stools, someone on a stool now and then.
     * @param {typeof fronts[number]} f @param {number} ry @param {number[]} X
     */
    function cafe(f, ry, X) {
      const { mx, mz, nx, nz, w, st } = f;
      const tables = w > 2.6 * k * 2 ? 2 : 1;
      let placed = 0;
      for (let t = 0; t < tables; t++) {
        const u = (t - (tables - 1) / 2) * 2.4 * k, v = 0.5 * k + 0.05;
        const at = (/** @type {number} */ du) => ({ x: mx + X[0] * (u + du * k) + nx * v, z: mz + X[1] * (u + du * k) + nz * v });
        const cs = [{ ...at(0), r: 0.35 * k }, { ...at(-0.62), r: 0.25 * k }, { ...at(0.62), r: 0.25 * k }];
        if (!fits(cs)) continue;
        take(cs, 'cafe');
        const c = at(0), stool = pick(STOOLS);
        world.batch.at(c.x, standAt(st, c.x, c.z), c.z, ry, k).add([
          box(0.55, 0.04, 0.55, '#c8453a', [0, 0.5, 0]), // table top
          cyl(0.03, 0.03, 0.5, DARK, [0, 0.25, 0], {}, 5),
          box(0.32, 0.02, 0.32, DARK, [0, 0.01, 0]),
          cyl(0.06, 0.07, 0.12, '#f2b632', [0.1, 0.58, 0.05], {}, 6), // glasses of iced coffee
          cyl(0.035, 0.03, 0.12, '#5a3a22', [-0.12, 0.58, -0.06], {}, 6),
          ...[-0.62, 0.62].flatMap((du) => [cyl(0.15, 0.13, 0.04, stool, [du, 0.38, 0], {}, 8), cyl(0.13, 0.16, 0.36, stool, [du, 0.18, 0], {}, 8)]),
        ]);
        // Someone on one of the stools, turned to the table.
        if (sat < sitters && rng() < 0.75) {
          const du = rng() < 0.5 ? -0.62 : 0.62, s = at(du);
          let person;
          do person = new Person(rng, { kind: 'villager' });
          while (person.carry); // (hands free)
          person.sit();
          person.group.scale.multiplyScalar(k);
          person.group.position.set(s.x, standAt(st, s.x, s.z) + (0.4 - 0.92) * k, s.z);
          person.group.rotation.y = ry + (du > 0 ? -Math.PI / 2 : Math.PI / 2);
          group.add(person.group);
          world.followables.people.push({ label: `Quán cóc ${++sat}`, anchor: () => person.group });
        }
        placed++;
      }
      return placed > 0;
    }

    // ---- Food carts with a vendor standing beside, under a parasol.
    for (const f of fronts) {
      if (life.carts >= carts) break;
      if (rng() < 0.6) continue;
      const { mx, mz, nx, nz, w, st } = f;
      const ry = Math.atan2(nx, nz), X = [Math.cos(ry), -Math.sin(ry)];
      const u = (rng() - 0.5) * Math.max(0, w - 2.4 * k), v = 0.42 * k + 0.05;
      const at = (/** @type {number} */ du, /** @type {number} */ dv = v) => ({ x: mx + X[0] * (u + du * k) + nx * dv, z: mz + X[1] * (u + du * k) + nz * dv });
      const vendorAt = at(1.15, 0.3 * k + 0.05);
      const cs = [{ ...at(-0.38), r: 0.42 * k }, { ...at(0.38), r: 0.42 * k }, { ...vendorAt, r: 0.3 * k }];
      if (!fits(cs)) continue;
      take(cs, 'cart');
      const c = at(0), body = pick(CARTS);
      world.batch.at(c.x, standAt(st, c.x, c.z), c.z, ry, k).add([
        box(1.4, 0.5, 0.7, body, [0, 0.72, 0]),
        box(1.25, 0.42, 0.6, '#d9eef2', [0, 1.18, 0]), // glass case
        box(1.32, 0.04, 0.66, '#f4f1ea', [0, 1.41, 0]),
        box(0.6, 0.18, 0.03, '#f4f1ea', [0, 0.78, 0.36]), // the name on its front
        ...[-0.32, 0.32].map((z) => cyl(0.24, 0.24, 0.06, TYRE, [0.42, 0.24, z], { rx: Math.PI / 2 }, 10)),
        box(0.06, 0.48, 0.06, DARK, [-0.6, 0.24, 0.28]),
        box(0.06, 0.48, 0.06, DARK, [-0.6, 0.24, -0.28]),
        cyl(0.025, 0.025, 1.0, CHROME, [-0.75, 0.9, 0], ACROSS, 5), // handle
        cyl(0.025, 0.025, 2.3, '#f4f1ea', [0.7, 1.15, 0.3], {}, 5), // parasol, leaning out over the pavement (clear of the wall)
        cone(0.95, 0.36, pick(AWNINGS)[0], [0.7, 2.42, 0.3], {}, 8),
      ]);
      const vendor = new Walker(rng, (x, z) => standAt(st, x, z), { kind: 'villager' });
      vendor.group.scale.multiplyScalar(k);
      vendor.heading = ry + (rng() - 0.5) * 0.6;
      vendor.place(new THREE.Vector3(vendorAt.x, 0, vendorAt.z));
      group.add(vendor.group);
      vendors.push(vendor);
      world.followables.people.push({ label: `Gánh hàng rong ${vendors.length}`, anchor: () => vendor.group });
      life.carts++;
    }

    // ---- Cars parked at the kerb of the streets with no traffic, on the straight, clear of junctions.
    const quiet = streets.map((_, i) => i).filter((i) => MINOR.has(streets[i].kind) && !streets[i].median && streets[i].width >= 3.4 * k).sort(() => rng() - 0.5);
    for (const si of quiet) {
      if (life.cars >= cars) break;
      const st = streets[si], pts = st.points;
      let here = 0;
      for (let i = 2; i < pts.length - 2 && here < 3 && life.cars < cars; i++) {
        const [ax, az] = pts[i - 2], [bx, bz] = pts[i + 2], [px, pz] = pts[i];
        const len = Math.hypot(bx - ax, bz - az);
        if (len < 4.6 * k) continue;
        const tx = (bx - ax) / len, tz = (bz - az) / len;
        // (straight: the points either side on the line)
        if (Math.abs((px - ax) * tz - (pz - az) * tx) > 0.15) continue;
        const side = rng() < 0.5 ? 1 : -1, off = st.width / 2 - 0.85 * k - 0.15 * k;
        const x = px - tz * off * side, z = pz + tx * off * side;
        const r = 0.95 * k, cs = [-1.4, 0, 1.4].map((o) => ({ x: x + tx * o * k, z: z + tz * o * k, r }));
        if (!fits(cs, true, si)) continue;
        take(cs, 'car');
        const heading = Math.atan2(tx * side, tz * side);
        world.batch.at(x, st.heightAt(x, z), z, heading, k).add(parkedCar(pick(KINDS.car.colors)));
        life.cars++;
        here++;
        i += 4;
      }
    }

    return {
      group,
      update({ dt, t }) {
        if (dt === 0) return;
        for (const v of vendors) v.idle(t);
      },
    };
  },
};

// White (PAINT) parts take `color`.
function paint(/** @type {THREE.BufferGeometry[]} */ parts, /** @type {string} */ color) {
  const white = new THREE.Color(PAINT), c = new THREE.Color(color);
  for (const g of parts) {
    const a = /** @type {THREE.BufferAttribute} */ (g.attributes.color);
    for (let i = 0; i < a.count; i++) if (a.getX(i) === white.r && a.getY(i) === white.g && a.getZ(i) === white.b) a.setXYZ(i, c.r, c.g, c.b);
  }
  return parts;
}

/** A motorbike on its stand (leaning a little), simpler wheels than the moving ones. @param {string} color */
function parkedBike(color) {
  const kind = KINDS.motorbike, r = kind.wheelR;
  const parts = paint([...kind.body(), ...kind.wheels.flatMap(([x, y, z]) => [cyl(r, r, 0.12, TYRE, [x, y, z], ACROSS, 10), cyl(r * 0.55, r * 0.55, 0.14, CHROME, [x, y, z], ACROSS, 8)])], color);
  parts.push(cyl(0.015, 0.015, 0.36, DARK, [-0.12, 0.15, -0.1], { rz: -0.5 }, 4)); // the stand
  for (const g of parts) g.rotateZ(0.1);
  return parts;
}

/** A parked car. @param {string} color */
function parkedCar(color) {
  const kind = KINDS.car, r = kind.wheelR;
  return paint([...kind.body(), ...kind.wheels.map(([x, y, z]) => cyl(r, r, 0.22, TYRE, [x, y, z], ACROSS, 10))], color);
}
