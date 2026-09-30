// @ts-check
import * as THREE from 'three';
import { WATER_Y } from '../config.js';
import { lam } from '../world/lowpoly.js';
import { lamps } from './lamps.js';
import { SIZES } from '../world/scale.js';

// A town's real buildings (cfg.buildings, from the map data): each footprint's rectangle as a
// block standing on the ground, as tall as its floors (from the map, or a likely number for a
// Vietnamese town: narrow tube houses of 2–4 floors, big sheds and schools lower), each storey as
// tall as the people and props are drawn (world.scale.fit: taller than the map scale on a small map,
// or a storey would be shorter than a person). Walls in the pale colours of the street, schools yellow; some of the low houses
// get a tiled hip roof, the rest the flat roof terrace. A band of windows on the taller ones glows
// after dark (lamps(world).windowMat). Every building of a kind shares an InstancedMesh: 3 draw
// calls (and their shadows) for the whole town. Buildings on a street, in the water, on the
// railway, in a station yard or a landmark's square are left out; the ground under the rest is
// claimed (site.claimRect) so trees keep off it.
// Options: roofs (0.35, the share of low houses with a tiled roof).
const WALLS = ['#f3ead8', '#efe2c4', '#f4d9a8', '#e6ecee', '#f2cdbb', '#dfe8d6', '#f7f2e8', '#d6dde4', '#f0e0a8'];
const KIND_WALLS = { school: ['#f2cf5b', '#efc84e'], public: ['#ece6da', '#e3ddd0'], commercial: ['#d3dae0', '#c9d1d8', '#e9ecee'], shelter: ['#a3aaae'] };
const ROOFS = ['#b5563a', '#a84c33', '#c0663f', '#9a4a36'];

/** @type {import('../types').Feature} */
export default {
  label: 'Đang xây nhà',
  build(world, { rng, roofs: roofShare = 0.35 }) {
    const { cfg, site, terrain, track } = world;
    world.need('nhà từ dữ liệu bản đồ (cfg.buildings)', 'buildings', cfg.buildings?.length);
    const all = /** @type {NonNullable<typeof cfg.buildings>} */ (cfg.buildings);
    const mpu = cfg.metersPerUnit ?? 1;
    const storey = world.scale.fit(SIZES.storey), parapet = world.scale.fit(0.6), shed = world.scale.fit(4.5);
    world.scale.note('storey', storey, 'buildings');
    const half = world.size / 2 - 2;
    const pads = cfg.pads ?? [];
    const ground = terrain.meshHeightAt;
    const kept = [];
    for (const b of all) {
      const { x, z, length, width, angle } = b;
      const reach = Math.hypot(length, width) / 2;
      if (Math.abs(x) + reach > half || Math.abs(z) + reach > half) continue;
      if (site.yards.some((p) => Math.hypot(x - p.x, z - p.z) < 26 + reach)) continue;
      if (pads.some((p) => Math.hypot(x - p.x, z - p.z) < p.r + 2 + reach)) continue;
      if (track.distanceTo(x, z, 4 + reach) < 3.5 + reach) continue;
      if (site.claimed(x, z)) continue; // on a street
      // Standing on dry ground at every corner; the lowest corner is its foot.
      const c = Math.cos(angle), s = Math.sin(angle);
      let foot = Infinity, head = -Infinity;
      for (const [u, v] of [[-1, -1], [1, -1], [1, 1], [-1, 1], [0, 0]]) {
        const px = x + (c * u * length + s * v * width) / 2, pz = z + (-s * u * length + c * v * width) / 2;
        const h = ground(px, pz);
        foot = Math.min(foot, h);
        head = Math.max(head, h);
      }
      if (foot < WATER_Y + 0.5) continue;
      const floors = b.floors || likelyFloors(b.kind, length * width * mpu * mpu, rng);
      const height = b.kind === 'shelter' ? shed : floors * storey + parapet;
      kept.push({ b, foot: foot - 0.1, height: height + (head - foot), floors });
      site.claimRect(x, z, length, width, angle, 0.4);
    }

    const group = new THREE.Group();
    const dummy = new THREE.Object3D();
    const color = new THREE.Color();
    const pickFrom = (/** @type {string[]} */ list) => list[Math.floor(rng() * list.length)];
    /** @param {THREE.BufferGeometry} geo @param {THREE.Material} mat @param {number} count */
    const instanced = (geo, mat, count) => {
      const mesh = new THREE.InstancedMesh(geo, mat, count);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);
      return mesh;
    };
    // Blocks: a unit box standing on y = 0, stretched to each footprint.
    const blocks = instanced(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), lam('#ffffff'), kept.length);
    const hipped = kept.filter((k) => k.floors <= 2 && k.b.kind === 'house' && k.b.length * k.b.width * mpu * mpu < 220 && rng() < roofShare);
    const roofs = instanced(new THREE.ConeGeometry(Math.SQRT1_2, 1, 4, 1).rotateY(Math.PI / 4).translate(0, 0.5, 0), lam('#ffffff'), hipped.length);
    const lit = kept.filter((k) => k.floors >= 2 && k.b.kind !== 'shelter' && rng() < 0.8); // some houses dark
    const windows = instanced(new THREE.BoxGeometry(1, 1, 1), lamps(world).windowMat, lit.length);
    windows.castShadow = false;
    kept.forEach((k, i) => {
      const { b } = k;
      dummy.position.set(b.x, k.foot, b.z);
      dummy.rotation.set(0, b.angle, 0);
      dummy.scale.set(b.length, k.height, b.width);
      dummy.updateMatrix();
      blocks.setMatrixAt(i, dummy.matrix);
      blocks.setColorAt(i, color.set(pickFrom(KIND_WALLS[b.kind] ?? WALLS)));
    });
    hipped.forEach((k, i) => {
      const { b } = k;
      dummy.position.set(b.x, k.foot + k.height, b.z);
      dummy.rotation.set(0, b.angle, 0);
      dummy.scale.set(b.length * 1.08, Math.min(b.length, b.width) * 0.45, b.width * 1.08);
      dummy.updateMatrix();
      roofs.setMatrixAt(i, dummy.matrix);
      roofs.setColorAt(i, color.set(pickFrom(ROOFS)));
    });
    lit.forEach((k, i) => {
      const { b } = k;
      const band = Math.min(0.35, k.height * 0.12);
      dummy.position.set(b.x, k.foot + k.height * 0.72, b.z);
      dummy.rotation.set(0, b.angle, 0);
      dummy.scale.set(b.length + 0.04, band, b.width + 0.04);
      dummy.updateMatrix();
      windows.setMatrixAt(i, dummy.matrix);
    });
    return { group };
  },
};

/**
 * A likely number of floors for a building the map doesn't say: town houses mostly 2–3 (the
 * narrow tube houses), sheds, factories and big schools low.
 * @param {string} kind @param {number} area m² @param {() => number} rng
 */
export function likelyFloors(kind, area, rng) {
  const r = rng();
  if (kind === 'shelter') return 1;
  if (kind === 'school' || kind === 'public') return area > 1500 ? 2 : 3;
  if (area > 800) return r < 0.7 ? 1 : 2;
  if (area > 250) return r < 0.4 ? 1 : r < 0.8 ? 2 : 3;
  return r < 0.2 ? 1 : r < 0.55 ? 2 : r < 0.85 ? 3 : 4;
}
