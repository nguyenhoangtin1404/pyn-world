// @ts-check
import * as THREE from 'three';
import { WATER_Y } from '../config.js';
import { Instancer, VERTEX_COLORED, UNLIT } from '../world/lowpoly.js';
import { curfewOf } from '../world/night.js';
import { coastOf } from '../world/coast.js';
import { waveHeight } from '../world/water.js';
import { jetSki, parasail, towRope, TOW_HOOK, JETSKI_SEAT, FLYER_X, fishingBoat, ship, fishingLamps, shipLamps, squidGlow } from '../world/boats/seacraft.js';
import { Person } from '../world/people.js';
import { seat } from '../world/vehicles/vehicle.js';

// Life on the sea off a coast (a world from map data with a land cover that knows the sea): jet skis
// close in off the beach, each towing a parasail with two tourists flying under it, fishing boats moored
// further out and a few under way,
// coasters crossing far out, all riding the waves of the water sheet (water.js waveHeight); and foam
// washing up and back along the waterline, moved in its shader. Boats keep to open water deep enough
// for them and off the sealed sign on the water (world/seal.js). One InstancedMesh per kind of boat.
// The jet skis and the moored boats off the landmark, where the town's beach is.
// After dark the fishing boats light their squid lamps (a glow on the water round each) and the coasters
// their navigation lights. The jet skis go out by day only (world/night.js): they come and go out of sight.
// Options: parasails (2: jet skis towing one), moored (4), cruising (2) fishing boats, ships (2), foam (true).
// world.seacraft.parasails: each jet ski and where its parasail flies.

const SHIP_COLORS = ['#7a2b2b', '#2b3f5c', '#2f5a3f', '#3a3a3a'];
const BOAT_COLORS = ['#2f6db5', '#3a7fc4', '#2a5d9e', '#4b8fbf', '#1f8a70'];

/** @type {import('../types').Feature} */
export default {
  label: 'Đang thả thuyền ra biển',
  build(world, { rng, parasails = 2, moored = 4, cruising = 2, ships = 2, foam = true }) {
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
      jetski: new Instancer(jetSki(), VERTEX_COLORED, Math.max(1, parasails)),
      sail: new Instancer(parasail(), VERTEX_COLORED, Math.max(1, parasails)),
      rope: new Instancer(towRope(), VERTEX_COLORED, Math.max(1, parasails), { castShadow: false }),
      fishing: new Instancer(fishingBoat(), VERTEX_COLORED, Math.max(1, moored + cruising)),
      ship: new Instancer(ship(), VERTEX_COLORED, Math.max(1, ships)),
    };
    for (const i of Object.values(kinds)) group.add(i.mesh);

    /**
     * @typedef {{ kind: 'jetski' | 'fishing' | 'ship', anchor: THREE.Object3D, x: number, z: number, h: number,
     *   speed: number, cells: number, cx: number, cz: number, phase: number, size: number, turning: number, away?: boolean }} Boat
     */
    /** @type {Boat[]} */
    const boats = [];
    const add = (/** @type {Boat['kind']} */ kind, /** @type {{ x: number, z: number }} */ at, /** @type {number} */ speed, /** @type {number} */ cells, /** @type {number} */ h, /** @type {string} */ color) => {
      const anchor = new THREE.Object3D();
      anchor.scale.setScalar(k);
      group.add(anchor);
      kinds[kind].add(anchor, color);
      /** @type {Boat} */
      const b = { kind, anchor, x: at.x, z: at.z, h, speed, cells, cx: at.x, cz: at.z, phase: rng() * 10, size: kind === 'ship' ? 14 * k : kind === 'fishing' ? 5 * k : 1.6 * k, turning: 0 };
      boats.push(b);
      return b;
    };
    const seaward = Math.atan2(coast.seaward.x, coast.seaward.z);
    const pick = (/** @type {string[]} */ a) => a[Math.floor(rng() * a.length)];
    // Jet skis in the water off the beach (3–12 cells out, within `near` of the landmark), each towing a
    // parasail: the canopy flies `TOW` behind and `LIFT` above it, easing after it as it turns.
    const ground = world.terrain.meshHeightAt;
    // Deep enough to be under way (cells out from the shore aren't enough: off the beach the shallows run out a
    // long way, and a fishing boat turning there ran aground now and then).
    const deep = (/** @type {number} */ x, /** @type {number} */ z) => ground(x, z) < WATER_Y - 0.8;
    const person = () => {
      let p;
      do p = new Person(rng, { kind: 'villager' });
      while (p.carry); // (hands free)
      return p;
    };
    const near = world.scale.m(900), TOW = 40 * k, LIFT = 24 * k;
    /** @type {{ ski: Boat, at: THREE.Vector3, sail: THREE.Object3D, rope: THREE.Object3D }[]} */
    const flights = [];
    for (const at of spread(parasails * 4, 4, 9, 30, near).filter((c) => deep(c.x, c.z)).slice(0, parasails)) {
      const ski = add('jetski', at, 7 * k, 3, rng() * Math.PI * 2, pick(['#e8443a', '#f2b632', '#2f8fd6', '#f4f1ea']));
      const sail = new THREE.Object3D(), rope = new THREE.Object3D();
      sail.scale.setScalar(k);
      group.add(sail, rope);
      kinds.sail.add(sail, '#ffffff');
      // The people are the town's own (Person): the driver astride the jet ski, hands on the bar; the two
      // flyers in their seats under the bar, holding the straps over their heads, legs dangling.
      seat(person(), JETSKI_SEAT, ski.anchor);
      for (const x of [-FLYER_X, FLYER_X]) {
        const p = person(), s = p.group.scale.x;
        p.hips.forEach((h, i) => h.rotation.set(-1.25, 0, i ? 0.08 : -0.08));
        p.knees.forEach((kn, i) => (kn.rotation.x = 1.15 + i * 0.25));
        p.shoulders.forEach((sh, i) => sh.rotation.set(-2.75, 0, i ? -0.12 : 0.12));
        p.elbows.forEach((e) => (e.rotation.x = -0.35));
        p.group.position.set(x, -0.25 - (1.86 * s) / 0.85, 0); // (hands up at the straps, just under the bar)
        p.group.rotation.y = (x < 0 ? 1 : -1) * 0.12;
        sail.add(p.group);
      }
      kinds.rope.add(rope, '#ffffff');
      const flight = { ski, at: new THREE.Vector3(at.x - Math.sin(ski.h) * TOW, WATER_Y + LIFT, at.z - Math.cos(ski.h) * TOW), sail, rope };
      flights.push(flight);
      world.followables.balloons.push({ label: `Dù bay ${flights.length}`, anchor: () => sail });
    }
    for (const at of spread(moored, 4, 14, 14, world.scale.m(1400))) add('fishing', at, 0, 3, seaward + Math.PI + (rng() - 0.5) * 0.6, pick(BOAT_COLORS)); // bows to the shore… (they swing to the wind below)
    for (const at of spread(cruising, 6, 30, 30)) add('fishing', at, 4 * k, 4, rng() * Math.PI * 2, pick(BOAT_COLORS));
    // Coasters far out, going along the coast one way or the other.
    const far = Math.max(8, Math.floor(coast.maxDist * 0.7));
    for (const at of spread(ships, far, coast.maxDist, 60)) add('ship', at, 3 * k, far - 2, seaward + (rng() < 0.5 ? 1 : -1) * Math.PI / 2, pick(SHIP_COLORS));
    world.seacraft = { group, boats, parasails: flights.map((f) => ({ ski: f.ski, at: f.at })) };

    // ---- Lights after dark: the squid lamps (and the glow they cast on the water), the coasters' lights.
    const flat = { castShadow: false, receiveShadow: false };
    const fishers = boats.filter((b) => b.kind === 'fishing'), coasters = boats.filter((b) => b.kind === 'ship');
    const glow = squidGlow();
    const lit = [new Instancer(fishingLamps(), UNLIT, Math.max(1, fishers.length), flat), new Instancer(glow.geo, glow.mat, Math.max(1, fishers.length), flat), new Instancer(shipLamps(), UNLIT, Math.max(1, coasters.length), flat)];
    for (const b of fishers) for (const l of lit.slice(0, 2)) l.add(b.anchor, '#ffffff');
    for (const b of coasters) lit[2].add(b.anchor, '#ffffff');
    for (const l of lit) {
      l.mesh.visible = false;
      group.add(l.mesh);
    }
    lit[1].mesh.renderOrder = 1; // (the glow over the water)
    // The jet skis by day only: gone (and back) where nobody sees them.
    const curfew = curfewOf(world);
    const rankOf = new Map(flights.map((f) => [f, curfew.rank()]));

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
        for (const f of flights) {
          const out = curfew.out(/** @type {number} */ (rankOf.get(f)), 'water');
          if (f.ski.away !== !out && !curfew.seen(f.ski.anchor.position, 3) && !curfew.seen(f.at, 6)) {
            f.ski.away = !out;
            f.ski.anchor.visible = f.sail.visible = f.rope.visible = out;
          }
        }
        for (const b of boats) {
          if (b.away) continue;
          if (dt > 0) move(b, dt, t);
          const y = WATER_Y + waveHeight(b.x, b.z, t) * (b.kind === 'ship' ? 0.4 : 0.9);
          const rock = b.kind === 'ship' ? 0.01 : b.kind === 'fishing' ? 0.05 : 0.09;
          b.anchor.position.set(b.x, y, b.z);
          b.anchor.rotation.set(Math.sin(t * 0.9 + b.phase) * rock * 0.6 - (b.kind === 'jetski' ? 0.08 : 0), b.h, Math.sin(t * 1.1 + b.phase * 1.7) * rock + (b.kind === 'jetski' ? b.turning * 0.25 : 0), 'YXZ');
        }
        for (const f of flights) if (!f.ski.away) fly(f, dt, t);
      },
      lateUpdate({ lights }) {
        for (const l of lit) l.mesh.visible = lights > 0.3;
      },
    };

    /** The parasail eases towards its place behind and above its jet ski; the rope from the hook up to it. */
    function fly(/** @type {typeof flights[number]} */ f, /** @type {number} */ dt, /** @type {number} */ t) {
      const { ski, at, sail, rope } = f;
      if (dt > 0) {
        const e = Math.min(1, dt * 0.6);
        at.x += (ski.x - Math.sin(ski.h) * TOW - at.x) * e;
        at.z += (ski.z - Math.cos(ski.h) * TOW - at.z) * e;
        at.y = WATER_Y + LIFT + Math.sin(t * 0.4 + ski.phase) * 1.5 * k;
      }
      const hx = ski.x - Math.sin(ski.h) * -TOW_HOOK[2] * k, hz = ski.z - Math.cos(ski.h) * -TOW_HOOK[2] * k, hy = ski.anchor.position.y + TOW_HOOK[1] * k;
      const dx = hx - at.x, dy = hy - at.y, dz = hz - at.z, len = Math.hypot(dx, dy, dz);
      sail.position.copy(at);
      sail.rotation.set(-0.35, Math.atan2(dx, dz), Math.sin(t * 0.6 + ski.phase) * 0.08, 'YXZ'); // (leaning back against the pull)
      rope.position.set(at.x + dx / 2, at.y + dy / 2, at.z + dz / 2);
      rope.scale.set(k, k, len);
      rope.lookAt(hx, hy, hz);
    }

    /** Sail on, or (moored) swing and drift about the spot. */
    function move(/** @type {Boat} */ b, /** @type {number} */ dt, /** @type {number} */ t) {
      if (b.speed === 0) {
        const r = 0.6 * k;
        b.x = b.cx + Math.cos(t * 0.05 + b.phase) * r;
        b.z = b.cz + Math.sin(t * 0.04 + b.phase) * r;
        const want = wind + Math.sin(t * 0.08 + b.phase) * 0.3;
        b.h += Math.atan2(Math.sin(want - b.h), Math.cos(want - b.h)) * Math.min(1, dt * 0.2);
        return;
      }
      // Under way: turn away before open water runs out ahead, else wander a little.
      const look = b.size + b.speed * 6;
      // (a jet ski keeps off the beach and out of the open sea: back towards the landmark's beach)
      const ahead = (/** @type {number} */ h) => {
        const x = b.x + Math.sin(h) * look, z = b.z + Math.cos(h) * look;
        return open(x, z, b.cells, b.size) && deep(x, z) && (b.kind !== 'jetski' || (coast.distAt(x, z) <= 12 && Math.hypot(x - focus.x, z - focus.z) < near));
      };
      if (!ahead(b.h)) {
        if (!b.turning) b.turning = ahead(b.h + 0.8) ? 1 : ahead(b.h - 0.8) ? -1 : rng() < 0.5 ? 1 : -1;
        b.h += b.turning * (b.kind === 'jetski' ? 0.45 : 0.25) * dt;
      } else {
        b.turning = 0;
        if (b.kind === 'fishing') b.h += Math.sin(t * 0.07 + b.phase) * 0.02 * dt;
      }
      const v = b.turning ? b.speed * 0.5 : b.speed;
      const nx = b.x + Math.sin(b.h) * v * dt, nz = b.z + Math.cos(b.h) * v * dt;
      if (open(nx, nz, Math.max(1, b.cells - 2), b.size * 0.5) && deep(nx, nz)) {
        b.x = nx;
        b.z = nz;
      }
    }
  },
};
