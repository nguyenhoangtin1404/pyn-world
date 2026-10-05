// @ts-check
import * as THREE from 'three';
import { WATER_Y } from '../config.js';
import { box, cone, cyl } from '../world/lowpoly.js';
import { coastOf } from '../world/coast.js';
import { Person } from '../world/people.js';
import { Walker } from '../world/walker.js';
import { waveHeight } from '../world/water.js';
import { curfewOf, stepTo, HURRY } from '../world/night.js';

// People on the beach of a coast (a world from map data with a land cover that knows the beach):
// sunshades with towels on the sand, someone sitting under some of them, children running about near
// them, swimmers in the water just off the shore, joggers and walkers along the wet sand by the
// waterline. Only on sand nothing else claimed (no street, no square), never out of their depth.
// In the rain the ones on their feet put their umbrellas up. Swimmers are in the water by day only; late
// at night everyone goes home (world/night.js): up the beach and gone (a swimmer walks out of the sea first,
// someone under a sunshade gets up), and back in the morning to where they were. Drawn at world.scale like the strollers;
// key 6 follows them. They are not world.pedestrians: no street runs on the sand.
// Everything within `reach` metres (450) of the landmark, where the town goes to the beach (the run along
// the water twice that). Options: umbrellas (10), sitters (5), kids (3), swimmers (5), joggers (2), walkers (3), reach.

const CANOPY = ['#e84a3c', '#f2b632', '#2f8f8b', '#3a7fc4', '#f4f1ea', '#8e5aa8'];
const TOWEL = ['#f2b632', '#e8697a', '#4fa3d1', '#7ac46b', '#f4f1ea'];

/** @type {import('../types').Feature} */
export default {
  label: 'Đang ra bãi biển',
  needs: ['streets', 'buildings'], // (they claim the ground first: the beach keeps off what they claimed)
  build(world, { rng, umbrellas = 10, sitters = 5, kids = 3, swimmers = 5, joggers = 2, walkers = 3, reach = 450 }) {
    const k = world.scale.props;
    world.need('lớp phủ đất có bãi cát (cfg.landcover)', 'beach', world.cfg.landcover);
    const coast = coastOf(world);
    world.need('một bờ biển (biển cạnh đất liền)', 'beach', coast.shore.length > 0);
    const ground = world.terrain.meshHeightAt;
    const half = world.size / 2;
    const cover = /** @type {(x: number, z: number) => string} */ (world.cfg.landcover);
    const pick = (/** @type {string[]} */ a) => a[Math.floor(rng() * a.length)];
    // Where people go to the beach: by the landmark (the town's beach), within `reach` metres of it.
    const focus = world.landmarks[0]?.spot ?? new THREE.Vector3();
    const R = world.scale.m(reach);
    const nearby = (/** @type {{ x: number, z: number }} */ p, /** @type {number} */ r) => Math.hypot(p.x - focus.x, p.z - focus.z) < r;
    const shuffled = coast.shore.filter((p) => nearby(p, R)).sort(() => rng() - 0.5);
    // Dry sand nothing else has claimed.
    const sand = (/** @type {number} */ x, /** @type {number} */ z) =>
      Math.abs(x) < half - 2 && Math.abs(z) < half - 2 && cover(x, z) === 'beach' && ground(x, z) > WATER_Y + 0.1 && world.site.claimAt(x, z) === 0;
    // Water deep enough to swim in.
    const deep = (/** @type {number} */ x, /** @type {number} */ z) => Math.abs(x) < half - 2 && Math.abs(z) < half - 2 && ground(x, z) < WATER_Y - 0.6;
    const seaward = Math.atan2(coast.seaward.x, coast.seaward.z);

    const group = new THREE.Group();
    /** @type {{ role: string, walker?: Walker, person: Person }[]} */
    const people = [];
    const follow = (/** @type {string} */ label, /** @type {THREE.Object3D} */ g) => world.followables.people.push({ label, anchor: () => g });
    const walker = (/** @type {string} */ kind, /** @type {number} */ speed, /** @type {string} */ role) => {
      const w = new Walker(rng, ground, { kind, speed });
      w.group.scale.multiplyScalar(k);
      group.add(w.group);
      people.push({ role, walker: w, person: w.person });
      follow(`Bãi biển ${people.length}`, w.group);
      return w;
    };

    // ---- Sunshades with towels on the sand, a few strides up from the water; someone sitting under some.
    /** @type {{ x: number, z: number }[]} */
    const shades = [];
    for (const p of shuffled) {
      if (shades.length >= umbrellas) break;
      const d = (4 + rng() * 5) * k / 0.6;
      const x = p.x + p.nx * d, z = p.z + p.nz * d;
      if (!sand(x, z) || shades.some((s) => Math.hypot(s.x - x, s.z - z) < 5)) continue;
      if (![[1.2, 0], [-1.2, 0], [0, 1.2], [0, -1.2]].every(([a, b]) => sand(x + a * k, z + b * k))) continue;
      shades.push({ x, z });
      const ry = seaward + (rng() - 0.5) * 0.6;
      world.batch.at(x, ground(x, z), z, ry, k).add([
        cyl(0.04, 0.04, 2.4, '#f4f1ea', [0, 1.2, 0], { rz: 0.08 }, 6),
        cone(1.25, 0.45, pick(CANOPY), [0.09, 2.45, 0], { rz: 0.08 }, 8),
        box(0.75, 0.03, 1.7, pick(TOWEL), [-0.55, 0.02, 0.2]),
        box(0.75, 0.03, 1.7, pick(TOWEL), [0.55, 0.02, 0.2]),
      ]);
      if (people.filter((q) => q.role === 'sitter').length < sitters && rng() < 0.7) {
        const person = new Person(rng, { kind: 'villager' });
        person.sit();
        person.group.scale.multiplyScalar(k);
        const side = rng() < 0.5 ? -0.55 : 0.55;
        person.group.position.set(x + Math.cos(ry) * side * k, ground(x, z) + 0.03 * k - 0.92 * person.group.scale.y, z - Math.sin(ry) * side * k);
        person.group.rotation.y = ry;
        group.add(person.group);
        people.push({ role: 'sitter', person });
        follow(`Bãi biển ${people.length}`, person.group);
      }
    }

    // ---- Children running about by the sunshades.
    /** @type {{ w: Walker, home: { x: number, z: number }, to: THREE.Vector3, rest: number }[]} */
    const children = [];
    for (let i = 0; i < kids && shades.length; i++) {
      const home = shades[i % shades.length];
      const w = walker('child', 1.6 * k, 'kid');
      const start = new THREE.Vector3(home.x + coast.seaward.x * 2 * k, 0, home.z + coast.seaward.z * 2 * k);
      w.place(sand(start.x, start.z) ? start : new THREE.Vector3(home.x, 0, home.z));
      children.push({ w, home, to: w.pos.clone(), rest: rng() * 2 });
    }

    // ---- Swimmers in the water, a little way out from the shore.
    /** @type {{ w: Walker, home: { x: number, z: number }, to: THREE.Vector3, phase: number }[]} */
    const swimming = [];
    for (const p of shuffled) {
      if (swimming.length >= swimmers) break;
      const d = 2 + rng() * 3;
      const x = p.x - p.nx * d, z = p.z - p.nz * d;
      if (!deep(x, z) || swimming.some((s) => Math.hypot(s.home.x - x, s.home.z - z) < 4)) continue;
      const w = walker('villager', 0.35 * k, 'swimmer');
      w.fixedY = WATER_Y - 1.5 * w.group.scale.y;
      w.place(new THREE.Vector3(x, 0, z));
      swimming.push({ w, home: { x, z }, to: w.pos.clone(), phase: rng() * 6 });
    }

    // ---- Joggers and walkers along the wet sand: the longest unbroken run of the waterline, a few strides up.
    const tx = -coast.seaward.z, tz = coast.seaward.x; // along the coast
    const line = coast.shore
      .filter((p) => nearby(p, R * 2))
      .map((p) => ({ x: p.x + p.nx * 2.5 * k / 0.6, z: p.z + p.nz * 2.5 * k / 0.6 }))
      .filter((q) => sand(q.x, q.z))
      .sort((a, b) => a.x * tx + a.z * tz - (b.x * tx + b.z * tz));
    /** @type {{ x: number, z: number }[][]} */
    const runs = [[]];
    for (const q of line) {
      const run = runs[runs.length - 1], last = run[run.length - 1];
      if (last && Math.hypot(q.x - last.x, q.z - last.z) > 6) runs.push([]);
      runs[runs.length - 1].push(q);
    }
    const run = runs.reduce((a, b) => (b.length > a.length ? b : a)).map((q) => new THREE.Vector3(q.x, 0, q.z));
    /** @type {{ w: Walker, i: number, dir: number, pause: number, jog: boolean }[]} */
    const along = [];
    if (run.length > 4) {
      for (let i = 0; i < joggers + walkers; i++) {
        const jog = i < joggers;
        const w = walker('villager', (jog ? 2.6 : 0.9) * k, jog ? 'jogger' : 'walker');
        const at = Math.floor(rng() * run.length);
        w.place(run[at]);
        along.push({ w, i: at, dir: rng() < 0.5 ? 1 : -1, pause: 0, jog });
      }
    }
    world.beach = { group, people, shades: shades.length };

    // ---- Home at night. Each one: their rank, where they go (up the beach from where they are, past the sand's
    // edge), and for someone sitting where to sit again.
    const curfew = curfewOf(world);
    const inland = { x: -coast.seaward.x, z: -coast.seaward.z };
    /** Off the sand, straight up the beach from (x, z): where they leave it. */
    const upBeach = (/** @type {number} */ x, /** @type {number} */ z) => {
      let d = 0;
      while (d < 40 && (ground(x + inland.x * d, z + inland.z * d) < WATER_Y + 0.1 || cover(x + inland.x * d, z + inland.z * d) === 'beach')) d += 0.5;
      return new THREE.Vector3(x + inland.x * Math.min(d, 6 * k / 0.6 + 4), 0, z + inland.z * Math.min(d, 6 * k / 0.6 + 4));
    };
    const night = new Map(
      people.map((q) => [
        q.person,
        {
          q,
          rank: curfew.rank(),
          who: q.role === 'swimmer' ? 'water' : 'beach',
          state: /** @type {'here' | 'going' | 'home' | 'back'} */ ('here'),
          to: new THREE.Vector3(),
          from: new THREE.Vector3(), // where they were: back there in the morning
          seat: q.role === 'sitter' ? { p: q.person.group.position.clone(), ry: q.person.group.rotation.y } : null,
        },
      ]),
    );
    /** Late (swimmers: at dusk): up the beach and gone; back in the morning to where they were. True while not here. */
    const away = (/** @type {import('../world/people.js').Person} */ person, /** @type {number} */ dt, /** @type {number} */ t) => {
      const n = /** @type {any} */ (night.get(person)), { q } = n, g = person.group, out = curfew.out(n.rank, n.who, 1); // (the beach empties an hour before the town)
      const walk = (/** @type {THREE.Vector3} */ to) => (q.walker ? q.walker.step(to, dt, t) : stepTo(person, to, 0.9 * k * HURRY, dt, ground));
      if (n.state === 'here') {
        if (out) return false;
        n.from.set(g.position.x, 0, g.position.z);
        n.to = upBeach(g.position.x, g.position.z);
        if (q.walker) q.walker.fixedY = null; // (a swimmer walks out of the sea)
        n.state = 'going';
      }
      if (n.state === 'going') {
        if (walk(n.to)) {
          g.visible = false;
          n.state = 'home';
        }
        return true;
      }
      if (n.state === 'home') {
        if (!out) return true;
        g.visible = true;
        n.state = 'back';
      }
      if (!walk(n.from)) return true;
      if (n.seat) {
        person.sit();
        g.position.copy(n.seat.p);
        g.rotation.y = n.seat.ry;
      }
      n.state = 'here';
      return false;
    };
    const sitting = people.filter((q) => q.role === 'sitter');

    return {
      group,
      update({ dt, t, rain }) {
        if (dt === 0) return;
        const wet = rain > 0.3;
        for (const q of sitting) away(q.person, dt, t);
        for (const c of children) {
          if (away(c.w.person, dt, t)) continue;
          c.w.person.setUmbrella(wet);
          if (c.rest > 0) {
            c.rest -= dt;
            c.w.idle(t);
            continue;
          }
          if (c.w.step(c.to, dt, t)) {
            for (let tries = 0; tries < 8; tries++) {
              const x = c.home.x + (rng() - 0.5) * 6 * k, z = c.home.z + (rng() - 0.5) * 6 * k;
              if (sand(x, z)) {
                c.to.set(x, 0, z);
                break;
              }
            }
            c.rest = rng() < 0.3 ? 1 + rng() * 2 : 0;
          }
        }
        for (const s of swimming) {
          if (away(s.w.person, dt, t)) continue;
          s.w.fixedY = WATER_Y + waveHeight(s.w.pos.x, s.w.pos.z, t) - 1.5 * s.w.group.scale.y;
          if (s.w.step(s.to, dt, t)) {
            const x = s.home.x + (rng() - 0.5) * 5 * k, z = s.home.z + (rng() - 0.5) * 5 * k;
            if (deep(x, z)) s.to.set(x, 0, z);
          }
          // Arms over and over, in turn (a slow crawl).
          const arms = s.w.person.shoulders;
          for (let i = 0; i < arms.length; i++) arms[i].rotation.set(-Math.PI / 2 + Math.sin(t * 1.8 + s.phase + i * Math.PI) * 1.4, 0, i ? 0.25 : -0.25);
        }
        for (const a of along) {
          if (away(a.w.person, dt, t)) continue;
          a.w.person.setUmbrella(wet && !a.jog);
          if (a.pause > 0) {
            a.pause -= dt;
            a.w.idle(t);
            continue;
          }
          if (a.w.step(run[a.i], dt, t)) {
            if (a.i + a.dir < 0 || a.i + a.dir >= run.length) a.dir = -a.dir;
            a.i += a.dir;
            if (!a.jog && rng() < 0.04) a.pause = 2 + rng() * 4; // (a look at the sea)
          }
        }
      },
    };
  },
};
