// @ts-check
import * as THREE from 'three';
import { WATER_Y } from '../config.js';
import { lam } from '../world/lowpoly.js';
import { SIZES } from '../world/scale.js';
import { CLAIM } from '../world/site.js';

// A town's real buildings (cfg.buildings, from the map data): each footprint's rectangle as a
// block standing on the ground, as tall as its floors (from the map, or a likely number for a
// Vietnamese town: narrow tube houses of 2–4 floors, big sheds and schools lower), each storey as
// tall as the people and props are drawn (world.scale.fit: taller than the map scale on a small map,
// or a storey would be shorter than a person) — but never taller than 2.5 times its narrower side
// (drawnHeight: a small house would stand like a stick). Walls in the pale colours of the street, schools yellow; some of the low houses
// get a tiled hip roof, the rest the flat roof terrace. Every building of a kind shares an InstancedMesh: 3 draw
// calls (and their shadows) for the whole town.
// The walls are detailed in their shader (no geometry): floor lines and, on every storey, windows
// with frames (a few with shutters, some blank, about half of them lit after dark); a door with an awning
// on one side and a balcony slab over it. Flat roofs get a cornice, and now and then a water tank. Buildings on a street, in the water, on the
// railway, in a station yard or a landmark's square are left out; the ground under the rest is
// claimed (site.claimRect) so trees keep off it.
// Options: roofs (0.35, the share of low houses with a tiled roof).
const WALLS = ['#f3ead8', '#efe2c4', '#f4d9a8', '#e6ecee', '#f2cdbb', '#dfe8d6', '#f7f2e8', '#d6dde4', '#f0e0a8'];
const KIND_WALLS = { school: ['#f2cf5b', '#efc84e'], public: ['#ece6da', '#e3ddd0'], commercial: ['#d3dae0', '#c9d1d8', '#e9ecee'], shelter: ['#a3aaae'] };
const ROOFS = ['#b5563a', '#a84c33', '#c0663f', '#9a4a36'];
const TANKS = ['#4a86a8', '#c8ccd0', '#2f6f9a', '#e8ebee'];

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
    for (const data of all) {
      const reach = Math.hypot(data.length, data.width) / 2;
      if (Math.abs(data.x) + reach > half || Math.abs(data.z) + reach > half) continue;
      if (site.yards.some((p) => Math.hypot(data.x - p.x, data.z - p.z) < 26 * track.k + reach)) continue;
      if (pads.some((p) => Math.hypot(data.x - p.x, data.z - p.z) < p.r + 2 + reach)) continue;
      if (track.distanceTo(data.x, data.z, 4 + reach) < 3.5 + reach) continue;
      // Off the streets and their pavements (drawn wider than life): cut back from the street side
      // if it has to be, or left out.
      const b = fitOffStreets(data, (x, z) => site.claimAt(x, z) >= CLAIM.PAVEMENT);
      if (!b) continue;
      const { x, z, length, width, angle } = b;
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
      const height = drawnHeight(b.kind === 'shelter' ? shed : floors * storey + parapet, Math.min(length, width), storey);
      // (the walls are windowed from the highest corner's ground up: `slack` below the first floor)
      const storeys = Math.max(1, Math.round((height - 0.1 - parapet) / storey));
      kept.push({ b, foot: foot - 0.1, height: height + (head - foot), floors, storeys, slack: head - foot + 0.1, seed: rng() });
      site.claimRect(x, z, length, width, angle, 0.4);
    }
    world.buildings = kept.map((k) => ({ x: k.b.x, z: k.b.z, length: k.b.length, width: k.b.width, angle: k.b.angle, foot: k.foot, height: k.height }));

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
    // Blocks: a unit box standing on y = 0, stretched to each footprint, its walls drawn with windows.
    const blockGeo = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
    blockGeo.setAttribute('aInfo', new THREE.InstancedBufferAttribute(new Float32Array(kept.flatMap((k) => [k.storeys, k.slack, k.seed, parapet])), 4));
    const facade = facadeMaterial(storey);
    const blocks = instanced(blockGeo, facade, kept.length);
    const hipped = kept.filter((k) => k.floors <= 2 && k.b.kind === 'house' && k.b.length * k.b.width * mpu * mpu < 220 && rng() < roofShare);
    const roofs = instanced(new THREE.ConeGeometry(Math.SQRT1_2, 1, 4, 1).rotateY(Math.PI / 4).translate(0, 0.5, 0), lam('#ffffff'), hipped.length);
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
    // Flat roofs: a cornice round the edge, and on the taller ones now and then a water tank.
    const flat = kept.filter((k) => !hipped.includes(k) && k.b.kind !== 'shelter');
    const cornice = instanced(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), lam('#ffffff'), flat.length);
    const tanked = flat.filter((k) => k.floors >= 2 && rng() < 0.5);
    const tanks = instanced(new THREE.CylinderGeometry(1, 1, 1, 10).translate(0, 0.5, 0), lam('#ffffff'), tanked.length);
    flat.forEach((k, i) => {
      const { b } = k;
      dummy.position.set(b.x, k.foot + k.height - parapet * 0.6, b.z);
      dummy.rotation.set(0, b.angle, 0);
      dummy.scale.set(b.length * 1.05, parapet * 0.6, b.width * 1.05);
      dummy.updateMatrix();
      cornice.setMatrixAt(i, dummy.matrix);
      cornice.setColorAt(i, color.set('#d9d4c8'));
    });
    tanked.forEach((k, i) => {
      const { b } = k;
      const r = Math.min(b.length, b.width) * 0.16, u = (rng() < 0.5 ? -1 : 1) * b.length * 0.25, v = (rng() < 0.5 ? -1 : 1) * b.width * 0.25;
      dummy.position.set(b.x + Math.cos(b.angle) * u + Math.sin(b.angle) * v, k.foot + k.height, b.z - Math.sin(b.angle) * u + Math.cos(b.angle) * v);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(r, Math.max(parapet * 1.6, r * 1.8), r);
      dummy.updateMatrix();
      tanks.setMatrixAt(i, dummy.matrix);
      tanks.setColorAt(i, color.set(pickFrom(TANKS)));
    });
    return {
      group,
      lateUpdate({ lights }) {
        facade.userData.night.value = Math.max(0, Math.min(1, (lights - 0.1) * 1.6));
      },
      dispose: () => facade.dispose(),
    };
  },
};

/**
 * The walls' material: a white Lambert (each building's colour is its instance colour) whose
 * fragment shader draws what the walls have on them — see the file's header. The box is a unit cube
 * stretched by its instance matrix, so the pattern works in metres' worth of drawn units from the
 * stretch; per instance `aInfo` is (storeys drawn, ground slack below the first floor, a random seed,
 * the parapet's height). Lit windows follow `userData.night` (0 by day, 1 at night).
 * @param {number} storey a storey's height, units
 */
function facadeMaterial(storey) {
  const mat = new THREE.MeshLambertMaterial({ color: '#ffffff' });
  const night = { value: 0 };
  mat.userData.night = night;
  mat.customProgramCacheKey = () => 'facade';
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uNight = night;
    shader.uniforms.uStorey = { value: storey };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec4 aInfo;\nvarying vec3 vFPos;\nvarying vec3 vFN;\nvarying vec3 vFSc;\nvarying vec4 vFInfo;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vFSc = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
        vFPos = position * vFSc;
        vFN = normal;
        vFInfo = aInfo;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform float uNight;
        uniform float uStorey;
        varying vec3 vFPos;
        varying vec3 vFN;
        varying vec3 vFSc;
        varying vec4 vFInfo;
        float fHash(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        vec3 facadeGlow = vec3(0.0);
        if (abs(vFN.y) < 0.5) {
          bool wide = abs(vFN.z) > 0.5; // the face spans x (its normal is along z)
          float along = wide ? vFPos.x : vFPos.z;
          float faceLen = wide ? vFSc.x : vFSc.z;
          float faceId = wide ? (vFN.z > 0.0 ? 0.0 : 1.0) : (vFN.x > 0.0 ? 2.0 : 3.0);
          float nf = floor(vFInfo.x + 0.5);
          float seed = floor(vFInfo.z * 4096.0 + 0.5) / 4096.0; // (a constant per building, but interpolated: rounded, or the hashes flicker)
          float sh = max(0.01, (vFSc.y - vFInfo.y - vFInfo.w) / nf);
          float y = vFPos.y - vFInfo.y;
          if (y > 0.0 && y < nf * sh) {
            float fl = floor(y / sh);
            float v = y / sh - fl;
            float cols = max(1.0, floor(faceLen / (0.95 * sh)));
            float w = faceLen / cols;
            float cf = (along + faceLen * 0.5) / w;
            float ci = floor(cf);
            float u = cf - ci;
            bool front = floor(seed * 4.0) == faceId; // the side with the door
            float h1 = fHash(vec3(ci, fl, seed * 37.0 + faceId));
            float x = abs(u - 0.5) * w; // sideways from the middle of its bay, units
            if (v < 0.045) diffuseColor.rgb *= 0.88; // the floor's edge
            if (front && fl > 0.5 && x < 0.4 * sh * min(1.0, w / sh) + 0.15 * sh && v < 0.075) diffuseColor.rgb = vec3(0.9, 0.88, 0.82); // a balcony's slab
            bool door = front && fl < 0.5 && ci == floor(cols * 0.5);
            if (door) {
              float dw = min(0.3 * sh, 0.4 * w);
              if (x < dw && v < 0.78) diffuseColor.rgb = vec3(0.42, 0.29, 0.19);
              else if (x < dw + 0.05 * sh && v < 0.8) diffuseColor.rgb = vec3(0.95, 0.93, 0.88);
              float awn = 0.5 + 0.5 * fHash(vec3(seed, 3.0, 5.0));
              if (x < min(dw * 1.4, 0.46 * w) && v > 0.8 && v < 0.9) diffuseColor.rgb = mix(vec3(0.71, 0.34, 0.23), vec3(0.25, 0.49, 0.55), awn);
            } else if (h1 < (front ? 0.92 : 0.6)) {
              float hw = min(0.31 * sh, 0.34 * w);
              float edge = min(hw - x, min(v - 0.3, 0.82 - v) * sh);
              if (edge > 0.0) {
                if (edge > 0.035 * sh) {
                  diffuseColor.rgb = vec3(0.25, 0.3, 0.36);
                  float lit = fHash(vec3(ci + 7.0, fl, seed * 91.0 + faceId));
                  if (lit < 0.5) facadeGlow = vec3(1.0, 0.78, 0.42) * uNight * (0.8 + 0.5 * lit);
                } else diffuseColor.rgb = vec3(0.96, 0.95, 0.9);
              } else if (h1 > 0.7 && x < hw + 0.22 * sh && v > 0.3 && v < 0.82) {
                diffuseColor.rgb = vec3(0.31, 0.48, 0.29) * (0.7 + 0.6 * fHash(vec3(seed, 1.0, 2.0))); // shutters
              }
            }
          }
        }`)
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n        totalEmissiveRadiance += facadeGlow;');
  };
  return mat;
}

/**
 * A footprint kept off the streets: as it is if no part of it is on one (`onStreet`, tested over a
 * grid of points across it), else cut back — to 75 % or 55 % of its length or width, keeping the
 * side away from the street — or null if even that is on one (or too small to be a house).
 * @template {{ x: number, z: number, length: number, width: number, angle: number }} B
 * @param {B} b @param {(x: number, z: number) => boolean} onStreet
 * @returns {B | null}
 */
export function fitOffStreets(b, onStreet) {
  const c = Math.cos(b.angle), s = Math.sin(b.angle);
  // Local u along the length (c, -s), v across it (s, c).
  const at = (/** @type {number} */ u, /** @type {number} */ v) => /** @type {[number, number]} */ ([b.x + c * u + s * v, b.z - s * u + c * v]);
  const clear = (/** @type {number} */ cu, /** @type {number} */ cv, /** @type {number} */ l, /** @type {number} */ w) => {
    for (let i = 0; i <= 4; i++) {
      for (let j = 0; j <= 2; j++) {
        const [px, pz] = at(cu + (i / 4 - 0.5) * l, cv + (j / 2 - 0.5) * w);
        if (onStreet(px, pz)) return false;
      }
    }
    return true;
  };
  if (clear(0, 0, b.length, b.width)) return b;
  for (const f of [0.75, 0.55]) {
    const dl = ((1 - f) * b.length) / 2, dw = ((1 - f) * b.width) / 2;
    for (const [cu, cv, l, w] of [[dl, 0, b.length * f, b.width], [-dl, 0, b.length * f, b.width], [0, dw, b.length, b.width * f], [0, -dw, b.length, b.width * f]]) {
      if (Math.min(l, w) < 0.25 || !clear(cu, cv, l, w)) continue;
      const [x, z] = at(cu, cv);
      return { ...b, x, z, length: l, width: w };
    }
  }
  return null;
}

const SLENDER = 2.5; // tallest a building is drawn, times its narrower side: a tower, not a needle

/**
 * How tall a building is drawn. Its storeys are at the props scale (people fit through the doors),
 * its footprint at the map's (it stands where it does): on a small map (Tuy Hòa: props 3 × map) a
 * narrow town house would stand three times as tall for its width as it is — a stick. No taller
 * than SLENDER × its narrower side, then, and fewer storeys it seems to have; but never lower than
 * most of a storey.
 * @param {number} want its floors' height @param {number} narrow its narrower side @param {number} storey
 */
export function drawnHeight(want, narrow, storey) {
  return Math.min(want, Math.max(SLENDER * narrow, 0.6 * storey));
}

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
