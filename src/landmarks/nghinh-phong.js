// @ts-check
import * as THREE from 'three';
import { box, segment } from '../world/lowpoly.js';
import { lamps } from '../features/lamps.js';
import { Paint } from '../world/roads/paint.js';
import { toWorld } from './common.js';

// Tháp Nghinh Phong, Tuy Hòa: two halves of square stone columns, grey-blue like basalt, a narrow
// slot between them looking out to sea, each stepping up from low steps you can sit on to a slender
// spire at the slot (40 m and 33 m) — on a paved square by
// the beach. The square is a D: its straight side along the street (Độc Lập), its round side to the
// sea (local +x), edged by a wall down to the sand and a railing; hexagon tiles over it, and a band
// of steps crossing it on the slant. At night the lower columns glow in colours and the spires carry
// red lights. The square is drawn at the map's scale (it fills the ground between the street and
// the beach), the tower between that and the props scale: next to the people round it, tall; on its
// square, about the share of it that it takes in life.

const R_M = 70; // metres, the square's round side (from the tower)
const CUT_M = 58; // metres, its straight side, landward
const CELL_M = 2.4; // metres, a column's side
const STONE = ['#7c8791', '#86919b', '#727d87', '#8e99a2'];
const PAVE = '#c9c7c1', TILE = '#8f969c', STEP = '#e8e6e0', WALL = '#b3aea4', FASCIA = '#f1efe9', RAIL = '#d9d7d0';
const LED = ['#ff3b5c', '#ffb830', '#3bff7a', '#33c2ff', '#8a5bff', '#ff5bd6'];

/**
 * The tower's columns. It is two halves with a narrow slot between them, running from the land to
 * the sea (you see the sea through it): each half a mass of square columns stepping up towards the
 * slot, where it ends in a slender spire — 40 m on one side, 33 m on the other — with a shorter
 * column beside it. `i` runs along the slot (towards the sea), `j` out from it (0 at the slot),
 * `side` which half (±1); heights in metres.
 * @returns {{ i: number, j: number, side: 1 | -1, h: number, spire: boolean }[]}
 */
export function columns() {
  const out = [];
  for (const side of /** @type {const} */ ([1, -1])) {
    const top = side > 0 ? 33 : 40; // seen from the land, the taller on the left
    for (let i = 0; i < 7; i++) {
      for (let j = 0; j < 6; j++) {
        let h = 0.55 * top - 3.8 * j - 3.4 * Math.abs(i - 3) + (((i * 7 + j * 13 + (side > 0 ? 0 : 3)) % 5) - 2) * 0.6;
        h = Math.round(h / 1.5) * 1.5;
        const spire = i === 3 && j === 0;
        if (spire) h = top;
        else if (i === 2 && j === 0) h = Math.round((top * 0.68) / 1.5) * 1.5; // the column beside the spire
        if (h >= 1.5) out.push({ i, j, side, h, spire });
      }
    }
  }
  return out;
}

/** @type {import('./common.js').Landmark} */
export default {
  name: 'Tháp Nghinh Phong',
  radius: ({ map }) => R_M * map,
  build(site) {
    const { world } = site;
    const { batch, site: worldSite, terrain } = world;
    const { lampMat, halos, pools } = lamps(world);
    const k = (world.scale.props + world.scale.map) / 2, R = R_M * world.scale.map, C = CUT_M * world.scale.map, cell = CELL_M * k;
    const top = site.y + 0.12; // the square's paving
    const W = (/** @type {number} */ lx, /** @type {number} */ lz, y = top) => /** @type {[number, number, number]} */ (toWorld(site, lx, y - site.y, lz));
    const paint = new Paint();

    // The square: a fan over the D (its round side from −θc to θc, the straight side at x = −C).
    const θc = Math.acos(-C / R), n = 64;
    const arc = Array.from({ length: n + 1 }, (_, i) => -θc + (2 * θc * i) / n).map((θ) => [R * Math.cos(θ), R * Math.sin(θ)]);
    for (let i = 0; i < n; i++) paint.tri(W(0, 0), W(arc[i][0], arc[i][1]), W(arc[i + 1][0], arc[i + 1][1]), PAVE);
    paint.tri(W(0, 0), W(arc[n][0], arc[n][1]), W(arc[0][0], arc[0][1]), PAVE);
    // Hexagon tiles, in staggered rows.
    const sp = 2 * k, hr = 0.32 * sp;
    for (let row = 0, z = -R; z <= R; z += sp * 0.87, row++) {
      for (let x = -C + sp + (row % 2) * sp * 0.5; x < R; x += sp) {
        if (Math.hypot(x, z) > R - sp || Math.abs(z) > R * Math.sin(θc) + (x + C) * 10) continue;
        const c = W(x, z, top + 0.01);
        for (let s = 0; s < 6; s++) {
          const a0 = (s / 6) * Math.PI * 2, a1 = ((s + 1) / 6) * Math.PI * 2;
          paint.tri(c, W(x + Math.cos(a0) * hr, z + Math.sin(a0) * hr, top + 0.01), W(x + Math.cos(a1) * hr, z + Math.sin(a1) * hr, top + 0.01), TILE);
        }
      }
    }
    // A band of steps across the square on the slant, from the foot of the tower to its landward corner.
    const A = [-3 * cell, 3.2 * cell], B = [-C + 1.5, R * Math.sin(θc) * 0.8];
    const len = Math.hypot(B[0] - A[0], B[1] - A[1]), ux = (B[0] - A[0]) / len, uz = (B[1] - A[1]) / len, bw = 2.2 * k * 2;
    for (let s = 0, i = 0; s + 0.6 * k < len; s += 1.2 * k, i++) {
      const q = (/** @type {number} */ t, /** @type {number} */ w) => W(A[0] + ux * t - uz * w, A[1] + uz * t + ux * w, top + 0.02);
      paint.quad(q(s, -bw / 2), q(s + 0.6 * k, -bw / 2), q(s + 0.6 * k, bw / 2), q(s, bw / 2), i % 2 ? STEP : TILE);
    }
    // Its round side: a wall down to the sand, a white band along the top, a railing.
    const ground = terrain.meshHeightAt;
    for (let i = 0; i < n; i++) {
      const [ax, az] = arc[i], [bx, bz] = arc[i + 1];
      const a = W(ax, az), b = W(bx, bz), out = [(ax + bx) / 2 / R, 0, (az + bz) / 2 / R];
      const ga = ground(a[0], a[2]) - 0.3, gb = ground(b[0], b[2]) - 0.3;
      const want = /** @type {[number, number, number]} */ ([Math.cos(site.ry) * out[0] + Math.sin(site.ry) * out[2], 0, -Math.sin(site.ry) * out[0] + Math.cos(site.ry) * out[2]]);
      paint.quad([a[0], top - 0.12, a[2]], [b[0], top - 0.12, b[2]], [b[0], Math.min(gb, top - 0.12), b[2]], [a[0], Math.min(ga, top - 0.12), a[2]], WALL, want);
      paint.quad([a[0], top + 0.04, a[2]], [b[0], top + 0.04, b[2]], [b[0], top - 0.12, b[2]], [a[0], top - 0.12, a[2]], FASCIA, want);
      // Railing: a post at each point and a rail between.
      const ang = Math.atan2(bx - ax, bz - az) + site.ry, seg = Math.hypot(bx - ax, bz - az);
      const [px, , pz] = W(ax * 0.995, az * 0.995);
      batch.at(px, top, pz, ang).add([box(0.05 * k * 2, 1.1 * k, 0.05 * k * 2, RAIL, [0, 0.55 * k, 0]), box(0.06 * k * 2, 0.06 * k * 2, seg, RAIL, [0, 1.1 * k, seg / 2])]);
    }
    batch.at(0, 0, 0, 0).add(paint.geometry() ?? []);

    // The tower. Columns, a little apart; the spires slimmer.
    const cols = columns();
    const ox = R * 0.3; // the tower seaward of the square's middle, as in life
    const gap = 1.3 * k; // the slot between the halves (a person's width)
    const at = (/** @type {number} */ i, /** @type {number} */ j, /** @type {number} */ side) => [ox + (i - 3) * cell, side * (gap / 2 + (j + 0.5) * cell)];
    batch.at(site.x, top, site.z, site.ry);
    const led = [];
    let peak = 0;
    for (const { i, j, side, h, spire } of cols) {
      const w = cell * (spire ? 0.74 : 0.96), hy = h * k;
      // (Each column flush with the slot on its inner face, spires too.)
      const [x, z0] = at(i, j, side), z = z0 - side * (cell - w) / 2 * (j === 0 ? 1 : 0);
      batch.add(box(w, hy, w, STONE[(i * 3 + j + (side > 0 ? 0 : 1)) % STONE.length], [x, hy / 2, z]));
      peak = Math.max(peak, hy);
      // At night: the lower columns in colours, the spires' tips red.
      if (!spire && h <= 18) led.push(box(w * 1.03, hy * 0.7, w * 1.03, LED[(i + 2 * j + (side > 0 ? 0 : 3)) % LED.length], [x, hy * 0.35, z]));
      if (spire) led.push(box(w * 1.06, 0.6 * k, w * 1.06, '#ff2b2b', [x, hy - 0.4 * k, z]));
      worldSite.colliders.push({ x: W(x, z)[0], z: W(x, z)[2], r: cell * 0.7 });
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

    // Lamp posts along the street side and round the rail.
    const post = (/** @type {number} */ lx, /** @type {number} */ lz) => {
      const [px, , pz] = W(lx, lz), hy = 6 * k;
      batch.at(px, top, pz, 0).add([box(0.12 * k * 2, hy, 0.12 * k * 2, '#3b3f45', [0, hy / 2, 0]), box(0.5 * k * 2, 0.08, 0.5 * k * 2, '#2c2f33', [0, hy + 0.05, 0])]);
      batch.add(box(0.36 * k * 2, 0.2, 0.36 * k * 2, '#fff4d6', [0, hy - 0.12, 0]), lampMat);
      halos.push([px, top + hy - 0.12, pz]);
      pools.push([px, top + 0.05, pz, 4 * k * 2]);
    };
    for (let z = -R * 0.7; z <= R * 0.7 + 0.01; z += (R * 1.4) / 4) post(-C + 1, z);
    for (let t = -0.8; t <= 0.81; t += 0.4) post((R - 1.5) * Math.cos(t * θc * 0.7), (R - 1.5) * Math.sin(t * θc * 0.7));

    // The camera can't see through the tower; trees keep off the square.
    const [cx, , cz] = W(ox, 0);
    worldSite.solids.push({ x: cx, z: cz, r: 4 * cell, y0: top, y1: top + peak });
    worldSite.obstacles.push([site.x, site.z, R + 1]);

    return {
      spot: new THREE.Vector3(cx, top + peak * 0.4, cz),
      view: 3.2,
      ring: Math.min(R - 2, ox + 5.5 * cell), // round the tower, inside the railing
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


