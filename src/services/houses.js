// @ts-check
import * as THREE from 'three';
import { box, ball, cyl, prism, shape, Instancer, VERTEX_COLORED } from '../world/lowpoly.js';
import { Smoke } from '../world/particles.js';
import { lamps } from './lamps.js';

// Hollow houses, shared by every feature that builds some (village, town): a doorway in the front
// wall, a floor, some furniture, and — for two-storey houses — stairs up to the upper floor. The
// walls are separate colliders, so people walk in through the door and out again. Doors swing open
// for whoever comes near (world.people); chimneys smoke in the evening.
//   const home = houses(world).build(rng, x, h, z, rot, w, d, floors, { shop });
export const houses = (world) => world.service('houses', () => createHouses(world));

export const WOOD = '#8a6038';

function createHouses(world) {
  const { site, batch } = world;
  const { windowMat, lampMat, halos, pools } = lamps(world);
  const group = new THREE.Group();
  const walls = ['#f3e6c8', '#e8c9a0', '#f0d8d0', '#d9e4ec', '#efe9d6'];
  const roofs = ['#c8453a', '#8e3b35', '#4f6d8f', '#6b4e3a', '#b0603a'];
  const WOOD_DARK = '#6b4a33', STONE = '#9a9084';
  const STOREY = 3.0; // floor-to-floor height
  // (Not drawn at world.scale yet: the village houses are one size — see CLAUDE.md.)
  world.scale.note('storey', STOREY, 'houses');
  const T = 0.2; // wall thickness
  const FLOOR = 0.12; // floor top above the ground outside
  const DOOR_W = 1.8, DOOR_H = 2.3;
  const houseList = []; // {x, z, y, w, d, cos, sin} — for floor height and "indoors"
  // Door leaves swing, so they aren't baked: every leaf in the world is one instance of the same
  // InstancedMesh, following an anchor on its hinge (rotation.y = how far open).
  const DOOR_COLORS = ['#6b4a33', '#4f6d8f', '#7a3b35', '#3f6b4a', '#8a6038'];
  const doorLeaves = new Instancer(box(DOOR_W / 2 - 0.04, DOOR_H - 0.04, 0.08, '#ffffff', [DOOR_W / 4, (DOOR_H - 0.04) / 2, 0]), VERTEX_COLORED, 96);
  group.add(doorLeaves.mesh);
  const doors = []; // {x, y, z, open, leaves: [left, right]}
  const chimneys = []; // world positions of chimney tops, for the evening smoke
  const houseLocal = (hs, x, z) => {
    const dx = x - hs.x, dz = z - hs.z;
    return { lx: dx * hs.cos - dz * hs.sin, lz: dx * hs.sin + dz * hs.cos };
  };
  const insideHouse = (x, z) => {
    for (const hs of houseList) {
      if (Math.abs(x - hs.x) > hs.r || Math.abs(z - hs.z) > hs.r) continue;
      const { lx, lz } = houseLocal(hs, x, z);
      if (Math.abs(lx) < hs.w / 2 && Math.abs(lz) < hs.d / 2) return hs;
    }
    return null;
  };
  site.addSurface((x, z) => insideHouse(x, z)?.y ?? -Infinity); // people walk on the floors

  // Adds a house to the batch at (x, h, z) facing +z rotated by `rot`; front (door) is local +z.
  // Returns where its people stand when they're "home".
  function build(rng, x, h, z, rot, w, d, floors, { shop = false } = {}) {
    const wall = walls[Math.floor(rng() * walls.length)];
    const roofC = roofs[Math.floor(rng() * roofs.length)];
    const top = FLOOR + floors * STOREY; // top of the walls
    const cos = Math.cos(rot), sin = Math.sin(rot);
    const world = (lx, lz) => ({ x: x + lx * cos + lz * sin, z: z - lx * sin + lz * cos });
    const block = (lx, lz, bw, bd) => site.colliders.push({ ...world(lx, lz), w: bw, d: bd, rot });
    batch.at(x, h, z, rot);

    // Stone footing (reaches below ground) and a plank floor.
    batch.add([box(w, 0.6, d, STONE, [0, FLOOR - 0.3, 0]), box(w - 2 * T, 0.02, d - 2 * T, '#b58a5a', [0, FLOOR + 0.005, 0])]);
    // Walls: back, sides, and the front split around the doorway.
    const hgt = top - FLOOR, mid = (top + FLOOR) / 2;
    const side = (w - DOOR_W) / 2;
    batch.add([
      box(w, hgt, T, wall, [0, mid, -d / 2 + T / 2]),
      box(T, hgt, d - 2 * T, wall, [-w / 2 + T / 2, mid, 0]),
      box(T, hgt, d - 2 * T, wall, [w / 2 - T / 2, mid, 0]),
      box(side, hgt, T, wall, [-(DOOR_W + side) / 2, mid, d / 2 - T / 2]),
      box(side, hgt, T, wall, [(DOOR_W + side) / 2, mid, d / 2 - T / 2]),
      box(DOOR_W, top - FLOOR - DOOR_H, T, wall, [0, (top + FLOOR + DOOR_H) / 2, d / 2 - T / 2]),
      box(DOOR_W + 0.3, 0.16, T + 0.08, WOOD_DARK, [0, FLOOR + DOOR_H + 0.08, d / 2 - T / 2]), // lintel
      box(DOOR_W + 0.6, 0.06, 1.0, STONE, [0, 0.03, d / 2 + 0.5]), // doorstep
    ]);
    block(0, -d / 2 + T / 2, w, T);
    block(-w / 2 + T / 2, 0, T, d);
    block(w / 2 - T / 2, 0, T, d);
    block(-(DOOR_W + side) / 2, d / 2 - T / 2, side, T);
    block((DOOR_W + side) / 2, d / 2 - T / 2, side, T);
    // Where the leaves end up when open (they swing inward), so nobody walks into them.
    // (Thin on purpose: with the nav padding the doorway must stay over one grid cell wide.)
    block(-DOOR_W / 2 + 0.04, d / 2 - T - 0.45, 0.08, 0.9);
    block(DOOR_W / 2 - 0.04, d / 2 - T - 0.45, 0.08, 0.9);

    // Double door: hinges on the jambs; the right leaf is the left one turned round.
    const hinge = new THREE.Group();
    hinge.position.set(x, h, z);
    hinge.rotation.y = rot;
    group.add(hinge);
    const doorColor = DOOR_COLORS[Math.floor(rng() * DOOR_COLORS.length)];
    const leaves = [-1, 1].map((sd) => {
      const leaf = new THREE.Object3D();
      leaf.position.set((sd * DOOR_W) / 2, FLOOR + 0.02, d / 2 - T / 2);
      leaf.rotation.y = sd < 0 ? 0 : Math.PI;
      hinge.add(leaf);
      doorLeaves.add(leaf, doorColor);
      return leaf;
    });
    const dc = world(0, d / 2);
    doors.push({ x: dc.x, y: h + FLOOR, z: dc.z, cos, sin, open: 0, leaves });

    // Windows go right through the wall, so they show (and glow at night) inside and out.
    for (let k = 0; k < floors; k++) {
      const wy = FLOOR + k * STOREY + 1.55;
      for (const xs of [-1, 1]) {
        batch.add(box(0.9, 0.9, T + 0.08, '#4a5563', [xs * w * 0.3, wy, -d / 2 + T / 2]), windowMat);
        batch.add(box(0.9, 0.9, T + 0.08, '#4a5563', [xs * (DOOR_W / 2 + side / 2), wy, d / 2 - T / 2]), windowMat);
        if (!(floors === 2 && k === 0 && xs < 0)) batch.add(box(T + 0.08, 0.9, 0.9, '#4a5563', [xs * (w / 2 - T / 2), wy, 0]), windowMat); // not behind the stairs
      }
    }
    // Two storeys: a band between the floors outside, the upper floor inside (open over the stairs),
    // and a straight flight of steps along the left wall rising from the front to the back.
    if (floors === 2) {
      const fy = FLOOR + STOREY;
      batch.add([
        box(w + 0.12, 0.2, 0.06, WOOD_DARK, [0, fy, d / 2 + 0.03]),
        box(w + 0.12, 0.2, 0.06, WOOD_DARK, [0, fy, -d / 2 - 0.03]),
        box(0.06, 0.2, d, WOOD_DARK, [w / 2 + 0.03, fy, 0]),
        box(0.06, 0.2, d, WOOD_DARK, [-w / 2 - 0.03, fy, 0]),
      ]);
      const SW = 1.0; // stair width
      const x0 = -w / 2 + T; // left inner face
      batch.add(box(w - 2 * T - SW, 0.2, d - 2 * T, '#b58a5a', [(x0 + SW + w / 2 - T) / 2, fy - 0.1, 0]));
      const n = 10, run = (d - 2 * T - 1.2) / n, rise = STOREY / n;
      const z0 = d / 2 - T - 1.2; // first step (leaves room to turn in from the door)
      const steps = [];
      for (let i = 0; i < n; i++) steps.push(box(SW, (i + 1) * rise, run, WOOD, [x0 + SW / 2, FLOOR + ((i + 1) * rise) / 2, z0 - (i + 0.5) * run]));
      batch.add(steps);
      block(x0 + SW / 2, z0 - (n * run) / 2, SW, n * run);
    }

    // Furniture: a table with two stools in the back right corner, a cupboard or bed on the left.
    const tx = w / 2 - T - 1.0, tz = -d / 2 + T + 0.9;
    batch.add([
      box(1.3, 0.08, 0.9, WOOD, [tx, FLOOR + 0.8, tz]),
      ...[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([a, b]) => box(0.08, 0.76, 0.08, WOOD_DARK, [tx + a * 0.55, FLOOR + 0.38, tz + b * 0.35])),
      cyl(0.22, 0.22, 0.45, WOOD_DARK, [tx - 0.95, FLOOR + 0.225, tz], {}, 6),
      cyl(0.22, 0.22, 0.45, WOOD_DARK, [tx, FLOOR + 0.225, tz + 0.8], {}, 6),
      ball(0.12, '#d9774a', [tx + 0.2, FLOOR + 0.94, tz - 0.1], {}, 0), // a bowl of fruit, more or less
      box(1.6, 0.01, 1.1, roofC, [0.2, FLOOR + 0.01, 0.1]), // rug
    ]);
    block(tx, tz, 1.3, 0.9);
    if (floors === 1) {
      // Bed along the left wall.
      const bx = -w / 2 + T + 0.5, bz = -d / 2 + T + 1.0;
      batch.add([box(1.0, 0.45, 2.0, WOOD, [bx, FLOOR + 0.225, bz]), box(0.9, 0.12, 1.5, '#f1ede3', [bx, FLOOR + 0.5, bz + 0.2]), box(0.7, 0.14, 0.4, '#ffffff', [bx, FLOOR + 0.52, bz - 0.7])]);
      block(bx, bz, 1.0, 2.0);
    }
    // Upstairs gets a bed too (nobody walks there, but it shows through the windows).
    if (floors === 2) {
      const by = FLOOR + STOREY, bx = w / 2 - T - 0.5, bz = 0.2;
      batch.add([box(1.0, 0.45, 2.0, WOOD, [bx, by + 0.225, bz]), box(0.9, 0.12, 1.5, '#f1ede3', [bx, by + 0.5, bz + 0.2])]);
    }

    // Roof and chimney.
    batch.add([
      prism(w + 0.8, 2.0, d + 0.6, roofC, [0, top, 0]),
      box(0.6, 1.6, 0.6, '#8a7a6a', [w * 0.25, top + 1.2, -d * 0.15]),
    ]);
    if (shop) {
      // Shopfront: a striped awning over the door and the windows beside it.
      const awn = [];
      for (let i = 0; i < 6; i++) awn.push(box(w / 6, 0.08, 1.3, i % 2 ? '#f4ead2' : roofC, [-w / 2 + (i + 0.5) * (w / 6), FLOOR + DOOR_H + 0.55, d / 2 + 0.6], { rx: 0.35 }));
      batch.add(awn);
    } else {
      // Lamp over the door.
      batch.add(shape(new THREE.SphereGeometry(0.16, 6, 4), '#fff4d6', [0, FLOOR + DOOR_H + 0.45, d / 2 + 0.2]), lampMat);
      const lw = world(0, d / 2 + 0.2);
      halos.push([lw.x, h + FLOOR + DOOR_H + 0.45, lw.z]);
      const gw = world(0, d / 2 + 1.2);
      pools.push([gw.x, h, gw.z, 2.6]);
    }
    const ch = world(w * 0.25, -d * 0.15);
    chimneys.push({ p: new THREE.Vector3(ch.x, h + top + 2.1, ch.z), acc: rng(), rate: 0.9 + rng() * 0.8 });

    houseList.push({ x, z, y: h + FLOOR, w, d, cos, sin, r: Math.hypot(w, d) / 2 });
    // Walls, then the gable roof as two boxes narrowing towards the ridge.
    site.solidBox(x, z, w, d, rot, h - 0.4, h + top);
    site.solidBox(x, z, (w + 0.8) * 0.75, d + 0.6, rot, h + top, h + top + 1);
    site.solidBox(x, z, (w + 0.8) * 0.25, d + 0.6, rot, h + top + 1, h + top + 2);
    // Where villagers stand when they're "home": inside, a step in from the door.
    // Far enough in that whoever stands there is clear of the door, which then closes behind them.
    const inside = world(0.3, d / 2 - T - 2.5);
    return new THREE.Vector3(inside.x, h + FLOOR, inside.z);
  }

  const lastPos = new WeakMap(); // person position → where it was last frame
  const moving = new Set();
  let evening = 0;
  const chimneySmoke = new Smoke({ n: 200, color: '#e2ddd5', rise: 1.1, drift: 0.5, grow: 1.7, fade: 0.7 });
  group.add(chimneySmoke.group);

  return world.add({
    group,
    build,
    isIndoors: (x, z) => !!insideHouse(x, z),
    update({ dt }) {
      if (dt === 0) return;
      const people = [];
      for (const w of world.people) if (w.group.visible) people.push(w.pos);
      // Who moved this frame: people walking up to (or out of) a door, as opposed to someone
      // standing around just inside.
      moving.clear();
      for (const p of people) {
        const last = lastPos.get(p);
        if (!last || Math.abs(last.x - p.x) + Math.abs(last.z - p.z) > 1e-4) moving.add(p);
        if (last) last.copy(p);
        else lastPos.set(p, p.clone());
      }
      for (const dr of doors) {
        let near = false;
        for (const p of people) {
          const dx = p.x - dr.x, dz = p.z - dr.z;
          if (Math.abs(dx) > 2 || Math.abs(dz) > 2 || Math.abs(p.y - dr.y) > 2) continue;
          // Door-local: lx across the doorway, lz outward (negative = inside the house).
          const lx = dx * dr.cos - dz * dr.sin, lz = dx * dr.sin + dz * dr.cos;
          const approaching = moving.has(p) && Math.abs(lx) < 1.3 && lz > -1.5 && lz < 1.8;
          const inDoorway = Math.abs(lx) < 1 && Math.abs(lz) < 0.8; // never shut the door on anyone
          if (approaching || inDoorway) {
            near = true;
            break;
          }
        }
        const target = near ? 1 : 0;
        if (dr.open === target) continue;
        dr.open = target > dr.open ? Math.min(1, dr.open + dt * 2.8) : Math.max(0, dr.open - dt * 1.4);
        const a = dr.open * 1.45; // swing inward, not quite flat against the wall
        dr.leaves[0].rotation.y = a;
        dr.leaves[1].rotation.y = Math.PI - a;
      }
      if (evening > 0.05) {
        for (const c of chimneys) {
          c.acc += dt * c.rate * evening;
          while (c.acc > 1) {
            c.acc--;
            chimneySmoke.emit(c.p, 0.45);
          }
        }
      }
      chimneySmoke.update(dt);
    },
    lateUpdate({ lights }) {
      evening = Math.min(1, lights * 2);
    },
  });
}
