// @ts-check
import * as THREE from 'three';
import { box, cyl, segment } from '../world/lowpoly.js';
import { lamps } from '../features/lamps.js';
import { Paint } from '../world/roads/paint.js';
import { CLAIM } from '../world/site.js';
import { toWorld } from './common.js';

// Tháp Nghinh Phong, Tuy Hòa (HUNI architectes, 2021), after Gành Đá Đĩa's basalt columns and the
// legend of Lạc Long Quân and Âu Cơ: two towers of 50 hexagonal stone columns each (basalt-like prisms, as at Gành Đá Đĩa), packed close
// in a honeycomb and
// stepping up from low to high, to a spire of 35 m (Lạc Long Quân) and one of 30 m (Âu Cơ). Between
// them the "wind-welcoming" slot, 2 m wide and 15 m long, open to the sea, reliefs of the legend on
// its walls. It stands on the April 1st square: a half circle of granite (7 190 m²: a radius of
// about 68 m), its straight side towards the town, its round side a wall and railing above the
// beach, hexagon tiles over it and a band of steps across it on the slant. At night the lower
// columns glow in colours and the spires carry red lights.
// The square is drawn at the map's scale; the tower a little bigger than that (TOWER × the map, no
// more than the props scale), so that it still stands tall over the people round it.

const R_M = 68; // metres, the half circle's radius
const BACK_M = 48; // metres from the tower landward to the square's straight side (its centre)
const CELL_M = 2.5; // metres, a column across its flats: 6 of them make the slot's 15 m
const SLOT_M = 2; // metres, the slot's width
const TOWER = 1.5; // the tower drawn this many times the map scale
const STONE = ['#7c8791', '#86919b', '#727d87', '#8e99a2'];
const RELIEF = '#66707a';
const PAVE = '#c9c7c1', TILE = '#8f969c', STEP = '#e8e6e0', WALL = '#b3aea4', FASCIA = '#f1efe9', RAIL = '#d9d7d0';
const LED = ['#ff3b5c', '#ffb830', '#3bff7a', '#33c2ff', '#8a5bff', '#ff5bd6'];

/**
 * The tower's columns. Two halves either side of the slot, which runs from the land to the sea: `i`
 * along it (6 columns, towards the sea), `j` out from it (0 at the slot, 9 columns), `side` which
 * half (+1 on the right seen from the land). Each half is 50 columns — its 6 × 9 less the four
 * outermost corners — stepping up towards the slot and towards the sea, where its spire stands near the seaward end with a
 * shorter column beside it, and down to low steps at the land side (the front); heights in metres.
 * @returns {{ i: number, j: number, side: 1 | -1, h: number, spire: boolean }[]}
 */
export function columns() {
  const out = [];
  for (const side of /** @type {const} */ ([1, -1])) {
    const top = side > 0 ? 30 : 35; // seen from the land: Âu Cơ on the right, Lạc Long Quân on the left
    for (let i = 0; i < 6; i++) {
      for (let j = 0; j < 9; j++) {
        if (j >= 7 && (i === 0 || i === 5)) continue; // the corners stepped off (50 a half)
        // Steps down from the spire in every direction across the tower, and all the way down to the
        // land side, its front: from high to low, one step a column, no two in a row alike.
        const drop = 2.4 * j + 3.1 * Math.max(0, 4 - i) + 2.0 * Math.max(0, i - 4);
        let h = 0.62 * top - drop + (((i * 7 + j * 13 + (side > 0 ? 3 : 0)) % 3) - 1) * 0.4;
        h = Math.max(1.2, Math.round(h / 1.2) * 1.2);
        const spire = i === 4 && j === 0;
        if (spire) h = top;
        else if (i === 3 && j === 0) h = Math.round((top * 0.72) / 1.2) * 1.2; // the column beside the spire
        out.push({ i, j, side, h, spire });
      }
    }
  }
  return out;
}

/** @type {import('./common.js').Landmark} */
export default {
  name: 'Tháp Nghinh Phong',
  // The flat ground under the tower and the seaward part of the square (the rest of it is laid on
  // the ground as it is, a wall where that falls away).
  radius: ({ map }) => 36 * map,
  build(site) {
    const { world } = site;
    const { batch, site: worldSite, terrain } = world;
    const { lampMat, halos, pools } = lamps(world);
    const map = world.scale.map, k = Math.min(world.scale.props, TOWER * map);
    const R = R_M * map, B = BACK_M * map, cell = CELL_M * k, slot = SLOT_M * k;
    const ground = terrain.meshHeightAt;
    const L = (/** @type {number} */ lx, /** @type {number} */ lz) => toWorld(site, lx, 0, lz);
    // The half circle: centre on its straight side, B landward of the tower; round side to the sea.
    const n = 72;
    const arc = Array.from({ length: n + 1 }, (_, i) => -Math.PI / 2 + (Math.PI * i) / n).map((a) => [-B + R * Math.cos(a), R * Math.sin(a)]);
    // Level with the highest ground under it (the ground never shows through the paving).
    let top = site.y;
    for (const [x, z] of [...arc, [-B, 0], [-B, R * 0.5], [-B, -R * 0.5], [0, 0], [-B / 2, R * 0.5], [-B / 2, -R * 0.5]]) {
      const [wx, , wz] = L(x, z);
      top = Math.max(top, ground(wx, wz));
    }
    top += 0.12;
    const W = (/** @type {number} */ lx, /** @type {number} */ lz, y = top) => /** @type {[number, number, number]} */ (toWorld(site, lx, y - site.y, lz));
    const outward = (/** @type {number} */ ox, /** @type {number} */ oz) => /** @type {[number, number, number]} */ ([Math.cos(site.ry) * ox + Math.sin(site.ry) * oz, 0, -Math.sin(site.ry) * ox + Math.cos(site.ry) * oz]);
    const paint = new Paint();

    // Paving: a fan from the centre of the straight side.
    for (let i = 0; i < n; i++) paint.tri(W(-B, 0), W(arc[i][0], arc[i][1]), W(arc[i + 1][0], arc[i + 1][1]), PAVE);
    // Hexagon tiles in staggered rows.
    const sp = 4.4 * map, hr = 0.32 * sp;
    for (let row = 0, z = -R; z <= R; z += sp * 0.87, row++) {
      for (let x = -B + sp / 2 + (row % 2) * sp * 0.5; x < R - B; x += sp) {
        if (Math.hypot(x + B, z) > R - sp * 0.8) continue;
        const c = W(x, z, top + 0.01);
        for (let s = 0; s < 6; s++) {
          const a0 = (s / 6) * Math.PI * 2, a1 = ((s + 1) / 6) * Math.PI * 2;
          paint.tri(c, W(x + Math.cos(a0) * hr, z + Math.sin(a0) * hr, top + 0.01), W(x + Math.cos(a1) * hr, z + Math.sin(a1) * hr, top + 0.01), TILE);
        }
      }
    }
    // A band of steps across the square on the slant, from the foot of the tower towards its landward corner.
    const A = [-3.5 * cell, 4 * cell], E = [-B + 1, R * 0.75];
    const len = Math.hypot(E[0] - A[0], E[1] - A[1]), ux = (E[0] - A[0]) / len, uz = (E[1] - A[1]) / len, bw = 6 * map;
    for (let s = 0, i = 0; s + 1.2 * map < len; s += 2.4 * map, i++) {
      const q = (/** @type {number} */ t, /** @type {number} */ w) => W(A[0] + ux * t - uz * w, A[1] + uz * t + ux * w, top + 0.02);
      paint.quad(q(s, -bw / 2), q(s + 1.2 * map, -bw / 2), q(s + 1.2 * map, bw / 2), q(s, bw / 2), i % 2 ? STEP : TILE);
    }
    // Edges: a wall down to the ground wherever the ground falls away, a white band along the top,
    // a railing along the round side.
    const edge = (/** @type {number[]} */ [ax, az], /** @type {number[]} */ [bx, bz], /** @type {[number, number, number]} */ want, rail = false) => {
      const a = W(ax, az), b = W(bx, bz);
      const ga = ground(a[0], a[2]) - 0.3, gb = ground(b[0], b[2]) - 0.3;
      paint.quad([a[0], top - 0.12, a[2]], [b[0], top - 0.12, b[2]], [b[0], Math.min(gb, top - 0.12), b[2]], [a[0], Math.min(ga, top - 0.12), a[2]], WALL, want);
      paint.quad([a[0], top + 0.04, a[2]], [b[0], top + 0.04, b[2]], [b[0], top - 0.12, b[2]], [a[0], top - 0.12, a[2]], FASCIA, want);
      if (!rail) return;
      const ang = Math.atan2(bx - ax, bz - az) + site.ry, seg = Math.hypot(bx - ax, bz - az), m = Math.max(map, 0.25);
      batch.at(a[0], top, a[2], ang).add([box(0.1 * m, 2.2 * m, 0.1 * m, RAIL, [0, 1.1 * m, 0]), box(0.12 * m, 0.12 * m, seg, RAIL, [0, 2.2 * m, seg / 2])]);
    };
    for (let i = 0; i < n; i++) edge(arc[i], arc[i + 1], outward((arc[i][0] + arc[i + 1][0]) / 2 + B, (arc[i][1] + arc[i + 1][1]) / 2), true);
    edge(arc[n], arc[0], outward(-1, 0)); // the straight side
    batch.at(0, 0, 0, 0).add(paint.geometry() ?? []);
    // Houses and trees keep off it: its ground claimed like a pavement, in strips across the half circle.
    const hx = Math.atan2(Math.cos(site.ry), -Math.sin(site.ry)) - Math.PI / 2; // local x as a street heading
    for (let z = -R; z < R; z += 2) {
      const reach = Math.sqrt(Math.max(0, R * R - (z + 1) * (z + 1)));
      const [cx, , cz] = L(-B + reach / 2, z + 1);
      worldSite.claimRect(cx, cz, reach, 2, hx, 0.5, CLAIM.PAVEMENT);
    }

    // The tower: each column flush with the slot on its inner face; the spires slimmer. On the
    // slot's walls, the reliefs.
    const cols = columns();
    // A honeycomb: rows along the slot, each row out from it offset by half a column and 0.87 of one
    // further out (hexagons, their flats towards their neighbours in the row, a corner to the slot).
    const at = (/** @type {number} */ i, /** @type {number} */ j, /** @type {number} */ side) => [(i - 2.5 + (j % 2) * 0.5) * cell, side * (slot / 2 + (0.58 + j * 0.866) * cell)];
    batch.at(site.x, top, site.z, site.ry);
    const led = [];
    let peak = 0;
    for (const { i, j, side, h, spire } of cols) {
      const w = cell * (spire ? 0.78 : 0.97), hy = h * k, r = w / Math.sqrt(3) * 1.0001; // corner radius of a hexagon w across its flats
      const [x, z0] = at(i, j, side), z = j === 0 ? z0 - side * (cell - w) * 0.58 : z0; // (the slot's edge kept straight)
      batch.add(cyl(r, r, hy, STONE[(i * 3 + j + (side > 0 ? 1 : 0)) % STONE.length], [x, hy / 2, z], {}, 6));
      peak = Math.max(peak, hy);
      if (j === 0 && !spire) {
        const rh = Math.min(hy, 10 * k) * 0.7;
        batch.add(box(w * 0.8, rh, 0.04, RELIEF, [x, rh / 2 + 0.3 * k, side * (slot / 2 - 0.02)]));
      }
      // At night: the lower columns in colours, the spires' tips red.
      if (!spire && h <= 14) led.push(cyl(r * 1.03, r * 1.03, hy * 0.7, LED[(i + 2 * j + (side > 0 ? 3 : 0)) % LED.length], [x, hy * 0.35, z], {}, 6));
      if (spire) led.push(cyl(r * 1.06, r * 1.06, 0.6 * k, '#ff2b2b', [x, hy - 0.4 * k, z], {}, 6));
      const [cx, , cz] = W(x, z);
      worldSite.colliders.push({ x: cx, z: cz, r: cell * 0.7 });
    }
    // The LED glow: its own material (it fades in at dusk — never a shared one), drawn unlit.
    const ledMat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0, depthWrite: false });
    const glow = segment(led, ledMat);
    glow.castShadow = false;
    glow.position.set(site.x, top, site.z);
    glow.rotation.y = site.ry;
    glow.visible = false;
    for (const c of cols.filter((c) => c.spire)) {
      const [x, z] = at(c.i, c.j, c.side);
      halos.push(W(x, z, top + c.h * k));
    }

    // Lamp posts along the straight side and inside the railing.
    const post = (/** @type {number} */ lx, /** @type {number} */ lz) => {
      if (Math.abs(lx) < 3.5 * cell + 1 && Math.abs(lz) < slot / 2 + 8.5 * cell + 1) return; // not in the tower's steps
      const [px, , pz] = W(lx, lz), hy = 7 * Math.max(map, k * 0.6);
      batch.at(px, top, pz, 0).add([box(0.24 * k, hy, 0.24 * k, '#3b3f45', [0, hy / 2, 0]), box(k, 0.08, k, '#2c2f33', [0, hy + 0.05, 0])]);
      batch.add(box(0.72 * k, 0.2, 0.72 * k, '#fff4d6', [0, hy - 0.12, 0]), lampMat);
      halos.push([px, top + hy - 0.12, pz]);
      pools.push([px, top + 0.05, pz, 8 * k]);
    };
    for (let z = -R * 0.8; z <= R * 0.8 + 0.01; z += (R * 1.6) / 5) post(-B + 1, z);
    for (let a = -1.2; a <= 1.21; a += 0.4) post(-B + (R - 1.5) * Math.cos(a), (R - 1.5) * Math.sin(a));

    // The camera can't see through the tower; trees keep off the square.
    const [sx, , sz] = W(0, 0);
    worldSite.solids.push({ x: sx, z: sz, r: 4.5 * cell, y0: top, y1: top + peak });
    const [px, , pz] = W(-B / 2, 0);
    worldSite.obstacles.push([px, pz, R]);

    // People walk round the tower on the square: a rounded box round it, inside the railing.
    const hx2 = 3 * cell + 3 * map, hz = slot / 2 + 9 * cell + 3 * map;
    const walk = Array.from({ length: 32 }, (_, i) => {
      const a = (i / 32) * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
      const lx = Math.sign(c) * Math.abs(c) ** 0.4 * hx2, lz = Math.sign(s) * Math.abs(s) ** 0.4 * hz;
      const [wx, , wz] = W(lx, lz);
      return new THREE.Vector3(wx, top, wz); // (y: the paving they walk on)
    });

    return {
      spot: new THREE.Vector3(sx, top + peak * 0.4, sz),
      view: 3.2,
      walk,
      system: {
        group: new THREE.Group().add(glow),
        lateUpdate({ lights }) {
          const o = Math.max(0, Math.min(0.85, (lights - 0.2) * 2));
          ledMat.opacity = o;
          glow.visible = o > 0;
        },
      },
    };
  },
};
