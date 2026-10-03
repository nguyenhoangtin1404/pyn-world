// @ts-check
import * as THREE from 'three';
import { WATER_Y } from '../config.js';
import { Instancer, VERTEX_COLORED } from '../world/lowpoly.js';
import { coastOf } from '../world/coast.js';
import { waveHeight } from '../world/water.js';
import { basketBoat, fishingBoat, ship } from '../world/boats/seacraft.js';

// Life on the sea off a coast (a world from map data with a land cover that knows the sea): round
// basket boats close in, each with a fisherman, fishing boats moored further out and a few under way,
// coasters crossing far out, all riding the waves of the water sheet (water.js waveHeight); and foam
// washing up and back along the waterline, moved in its shader. Boats keep to open water deep enough
// for them and off the sealed sign on the water (world/seal.js). One InstancedMesh per kind of boat.
// The basket boats and moored ones off the landmark, where the town's beach is.
// Options: baskets (8), moored (4), cruising (2) fishing boats, ships (2), foam (true).

const SHIP_COLORS = ['#7a2b2b', '#2b3f5c', '#2f5a3f', '#3a3a3a'];
const BOAT_COLORS = ['#2f6db5', '#3a7fc4', '#2a5d9e', '#4b8fbf', '#1f8a70'];

/** @type {import('../types').Feature} */
export default {
  label: 'Đang thả thuyền ra biển',
  build(world, { rng, baskets = 8, moored = 4, cruising = 2, ships = 2, foam = true }) {
    const k = world.scale.props;
    world.need('lớp phủ đất có biển (cfg.landcover)', 'seacraft', world.cfg.landcover);
    const coast = coastOf(world);
    world.need('một bờ biển (biển cạnh đất liền)', 'seacraft', coast.shore.length > 0);
    const half = world.size / 2;

    // The sealed sign lies flat on the water off the tower: no boat on it.
    /** @type {THREE.Mesh | null} */
    let sign = null;
    world.scene.traverse((o) => {
      if (/** @type {any} */ (o).material?.map?.userData?.seal) sign = /** @type {THREE.Mesh} */ (o);
    });
    const offSign = (/** @type {number} */ x, /** @type {number} */ z, /** @type {number} */ margin) => {
      if (!sign) return true;
      const { width, height } = /** @type {any} */ (sign.geometry).parameters;
      const a = sign.rotation.y, dx = x - sign.position.x, dz = z - sign.position.z;
      const lx = dx * Math.cos(a) - dz * Math.sin(a), lz = dx * Math.sin(a) + dz * Math.cos(a);
      return Math.abs(lx) > width / 2 + margin || Math.abs(lz) > height / 2 + margin;
    };
    // Room for a boat at (x, z): open sea, `cells` out from the shore at least, inside the world.
    const open = (/** @type {number} */ x, /** @type {number} */ z, /** @type {number} */ cells, /** @type {number} */ margin) =>
      Math.abs(x) < half - margin && Math.abs(z) < half - margin && coast.distAt(x, z) >= cells && offSign(x, z, margin);

    /** Up to `count` places among the sea cells `from`..`to` cells out, `apart` units from each other. */
    const focus = world.landmarks[0]?.spot ?? new THREE.Vector3();
    const spread = (/** @type {number} */ count, /** @type {number} */ from, /** @type {number} */ to, /** @type {number} */ apart, near = Infinity) => {
      const cells = coast.cells().filter((c) => c.d >= from && c.d <= to && open(c.x, c.z, from, 4) && Math.hypot(c.x - focus.x, c.z - focus.z) < near);
      /** @type {{ x: number, z: number }[]} */
      const picked = [];
      for (let tries = 0; tries < cells.length * 2 && picked.length < count; tries++) {
        const c = cells[Math.floor(rng() * cells.length)];
        if (c && picked.every((p) => Math.hypot(p.x - c.x, p.z - c.z) >= apart)) picked.push(c);
      }
      return picked;
    };

    const group = new THREE.Group();
    const kinds = {
      basket: new Instancer(basketBoat(), VERTEX_COLORED, Math.max(1, baskets)),
      fishing: new Instancer(fishingBoat(), VERTEX_COLORED, Math.max(1, moored + cruising)),
      ship: new Instancer(ship(), VERTEX_COLORED, Math.max(1, ships)),
    };
    for (const i of Object.values(kinds)) group.add(i.mesh);

    /**
     * @typedef {{ kind: 'basket' | 'fishing' | 'ship', anchor: THREE.Object3D, x: number, z: number, h: number,
     *   speed: number, cells: number, cx: number, cz: number, phase: number, size: number, turning: number }} Boat
     */
    /** @type {Boat[]} */
    const boats = [];
    const add = (/** @type {Boat['kind']} */ kind, /** @type {{ x: number, z: number }} */ at, /** @type {number} */ speed, /** @type {number} */ cells, /** @type {number} */ h, /** @type {string} */ color) => {
      const anchor = new THREE.Object3D();
      anchor.scale.setScalar(k);
      group.add(anchor);
      kinds[kind].add(anchor, color);
      /** @type {Boat} */
      const b = { kind, anchor, x: at.x, z: at.z, h, speed, cells, cx: at.x, cz: at.z, phase: rng() * 10, size: kind === 'ship' ? 14 * k : kind === 'fishing' ? 5 * k : 1.2 * k, turning: 0 };
      boats.push(b);
      return b;
    };
    const seaward = Math.atan2(coast.seaward.x, coast.seaward.z);
    for (const at of spread(baskets, 2, 5, 7, world.scale.m(900))) add('basket', at, 0, 2, rng() * Math.PI * 2, '#ffffff');
    const pick = (/** @type {string[]} */ a) => a[Math.floor(rng() * a.length)];
    for (const at of spread(moored, 4, 14, 14, world.scale.m(1400))) add('fishing', at, 0, 3, seaward + Math.PI + (rng() - 0.5) * 0.6, pick(BOAT_COLORS)); // bows to the shore… (they swing to the wind below)
    for (const at of spread(cruising, 6, 30, 30)) add('fishing', at, 4 * k, 4, rng() * Math.PI * 2, pick(BOAT_COLORS));
    // Coasters far out, going along the coast one way or the other.
    const far = Math.max(8, Math.floor(coast.maxDist * 0.7));
    for (const at of spread(ships, far, coast.maxDist, 60)) add('ship', at, 3 * k, far - 2, seaward + (rng() < 0.5 ? 1 : -1) * Math.PI / 2, pick(SHIP_COLORS));
    world.seacraft = { group, boats };

    // ---- Foam along the waterline: at each shore point a strip at the water's edge and a fainter one
    // further out (the next wave), washed up the beach and back.
    if (foam && coast.shore.length) {
      const bands = [[-1, 0.25, 1, 0], [-3.2, -2.0, 0.55, 2.2]]; // [from, to] across (× depth, + towards land), strength, phase lag
      // (Each strip in two halves, clear at both ends so the strips run into each other with no seam.)
      const n = coast.shore.length * bands.length * 2, len = coast.cell * 1.8, depth = 1.4 * k;
      const pos = new Float32Array(n * 18), dir = new Float32Array(n * 12), phase = new Float32Array(n * 6), edge = new Float32Array(n * 6);
      let q = 0;
      for (const p of coast.shore) {
        const tx = -p.nz, tz = p.nx; // along the shore
        const ph = (p.x * tx + p.z * tz) * 0.15 + rng() * 0.8;
        for (const [b0, b1, strength, lag] of bands) {
          const corner = (/** @type {number} */ a, /** @type {number} */ b) => [p.x + tx * a * len * 0.5 + p.nx * b * depth, WATER_Y + 0.05, p.z + tz * a * len * 0.5 + p.nz * b * depth];
          for (const [a0, a1] of [[-1, 0], [0, 1]]) {
            const v = [[a0, b0], [a1, b0], [a1, b1], [a0, b0], [a1, b1], [a0, b1]];
            v.forEach(([a, bb], i) => {
              pos.set(corner(a, bb), (q * 6 + i) * 3);
              dir.set([p.nx, p.nz], (q * 6 + i) * 2);
              phase[q * 6 + i] = ph - lag;
              edge[q * 6 + i] = (bb === b1 ? strength : 0) * (a === 0 ? 1 : 0); // clear seaward and at the ends
            });
            q++;
          }
        }
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geo.setAttribute('aDir', new THREE.BufferAttribute(dir, 2));
      geo.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1));
      geo.setAttribute('aEdge', new THREE.BufferAttribute(edge, 1));
      // (Its own material: it moves in its shader by its own clock.)
      const mat = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, depthWrite: false, opacity: 0.85 });
      const uTime = { value: 0 };
      mat.onBeforeCompile = (s) => {
        s.uniforms.uTime = uTime;
        s.vertexShader = s.vertexShader
          .replace('#include <common>', '#include <common>\nattribute vec2 aDir;\nattribute float aPhase;\nattribute float aEdge;\nuniform float uTime;\nvarying float vFoam;')
          .replace(
            '#include <begin_vertex>',
            `#include <begin_vertex>
            float w = sin(uTime * 0.7 + aPhase);
            transformed.xz += aDir * (w * ${(0.9 * k).toFixed(3)});
            transformed.y += sin(transformed.x * 0.09 + uTime * 1.2) * 0.12 + cos(transformed.z * 0.07 + uTime * 0.9) * 0.12;
            vFoam = (0.5 + 0.5 * smoothstep(-0.6, 0.9, w)) * aEdge;`,
          );
        s.fragmentShader = s.fragmentShader
          .replace('#include <common>', '#include <common>\nvarying float vFoam;')
          .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.a *= vFoam;');
      };
      const mesh = new THREE.Mesh(geo, mat);
      mesh.frustumCulled = false; // (moved in its shader)
      mesh.renderOrder = 2;
      group.add(mesh);
      world.seacraft.foam = { mesh, uTime };
    }

    const wind = seaward + Math.PI; // from the sea: a moored boat swings its bow into it
    return {
      group,
      update({ dt, t }) {
        if (world.seacraft.foam) world.seacraft.foam.uTime.value = t;
        for (const b of boats) {
          if (dt > 0) move(b, dt, t);
          const y = WATER_Y + waveHeight(b.x, b.z, t) * (b.kind === 'ship' ? 0.4 : 0.9);
          const rock = b.kind === 'ship' ? 0.01 : b.kind === 'fishing' ? 0.05 : 0.09;
          b.anchor.position.set(b.x, y, b.z);
          b.anchor.rotation.set(Math.sin(t * 0.9 + b.phase) * rock * 0.6, b.h, Math.sin(t * 1.1 + b.phase * 1.7) * rock, 'YXZ');
        }
      },
    };

    /** Sail on, or (moored, in a basket) swing and drift about the spot. */
    function move(/** @type {Boat} */ b, /** @type {number} */ dt, /** @type {number} */ t) {
      if (b.speed === 0) {
        const r = b.kind === 'basket' ? 1.5 * k : 0.6 * k;
        b.x = b.cx + Math.cos(t * 0.05 + b.phase) * r;
        b.z = b.cz + Math.sin(t * 0.04 + b.phase) * r;
        const want = b.kind === 'basket' ? b.phase + t * 0.03 : wind + Math.sin(t * 0.08 + b.phase) * 0.3;
        b.h += Math.atan2(Math.sin(want - b.h), Math.cos(want - b.h)) * Math.min(1, dt * 0.2);
        return;
      }
      // Under way: turn away before open water runs out ahead, else wander a little.
      const look = b.size + b.speed * 6;
      const ahead = (/** @type {number} */ h) => open(b.x + Math.sin(h) * look, b.z + Math.cos(h) * look, b.cells, b.size);
      if (!ahead(b.h)) {
        if (!b.turning) b.turning = ahead(b.h + 0.8) ? 1 : ahead(b.h - 0.8) ? -1 : rng() < 0.5 ? 1 : -1;
        b.h += b.turning * 0.25 * dt;
      } else {
        b.turning = 0;
        if (b.kind === 'fishing') b.h += Math.sin(t * 0.07 + b.phase) * 0.02 * dt;
      }
      const v = b.turning ? b.speed * 0.5 : b.speed;
      const nx = b.x + Math.sin(b.h) * v * dt, nz = b.z + Math.cos(b.h) * v * dt;
      if (open(nx, nz, Math.max(1, b.cells - 2), b.size * 0.5)) [b.x, b.z] = [nx, nz];
    }
  },
};
