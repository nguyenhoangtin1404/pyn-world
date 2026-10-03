// @ts-check
import * as THREE from 'three';
import { inside } from '../world/tourist.js';
import { box, cyl } from '../world/lowpoly.js';
import { CLAIM } from '../world/site.js';
import { curfewOf } from '../world/night.js';

// A bus stop on the street beside a landmark's grounds (world.landmarks): the buses (citytraffic) stop
// there with their doors to the kerb, let their passengers off — tourists, who walk over the pavement
// to the grounds — and take on the parties that have set out for the stop. A party is not made or
// unmade: the same tourists ride off (out of sight, in the bus) and come back with a bus later, so there
// are always as many at the landmark as the tourists feature made, less those away on the bus.
// The stop is about `away` metres (100) from the landmark, on the same side of the street as its grounds; the
// bus eases over to the kerb as it comes in (a lane change on a boulevard) and back to its lane as it leaves.
// Options: away (100), riders (parties on each bus at the start, 1), wait (parties at most on their way to or at the
// stop at once, 2), dwell (least seconds a bus stays, 8). world.busStop counts boardings and alightings.

const CAPACITY = 3; // parties a bus takes

/** @type {import('../types').Feature} */
export default {
  label: 'Đang dựng bến xe buýt',
  needs: ['citytraffic', 'tourists'],
  build(world, { rng, riders = 1, wait = 2, dwell = 8, away = 100 }) {
    const k = world.scale.props;
    const buses = world.vehicles.filter((v) => v.kind === 'bus');
    const curfew = curfewOf(world);
    world.busStop = { boarded: 0, alighted: 0, stops: 0, walks: [] };
    /** @type {any[]} */
    const places = [];
    for (const lm of world.landmarks) {
      const parties = world.parties.filter((p) => p.landmark === lm);
      const bus = buses[0];
      if (!parties.length || !bus) continue;
      const rt = world.cityRoutes[bus.route];
      const plaza = parties[0].area.plaza;
      // Where a bus stopping with its front at `s` has its front door, and the pavement beside it.
      const doorAt = (/** @type {number} */ s) => {
        const sd = rt.path.wrap(s - 0.5 - bus.length / 2 + 3.0);
        const [x, z] = rt.path.pointAt(sd), h = rt.path.headingAt(sd);
        const right = new THREE.Vector2(-Math.cos(h), Math.sin(h));
        return { at: new THREE.Vector3(x * k + right.x * rt.side, 0, z * k + right.y * rt.side), fwd: new THREE.Vector2(Math.sin(h), Math.cos(h)), right };
      };
      // The place on the street about `away` metres from the landmark, on the grounds' side of the street
      // (no crossing the road), on pavement, straight, clear of crosswalks and other stop lines.
      const target = world.scale.m(away);
      let best = null, bestErr = Infinity;
      for (let s = 0; s < rt.path.length; s += 1.5) {
        const { at, right } = doorAt(s);
        const [px, pz] = rt.path.pointAt(s);
        if ((lm.spot.x - px * k) * right.x + (lm.spot.z - pz * k) * right.y <= 0) continue;
        if (inside(plaza, at.x, at.z) || world.site.claimAt(at.x, at.z) === CLAIM.CARRIAGEWAY) continue;
        const err = Math.abs(Math.hypot(at.x - lm.spot.x, at.z - lm.spot.z) - target);
        if (err >= bestErr) continue;
        if ([-10, -5, 0, 4].some((o) => Math.abs(rt.path.curvatureAt(rt.path.wrap(s + o))) > 0.02)) continue;
        if (world.crosswalks.some((c) => Math.hypot(c.x - px * k, c.z - pz * k) < c.half + 9 * k)) continue;
        if (rt.stops.some((o) => { const g = rt.path.wrap(o.s - s + rt.path.length / 2) - rt.path.length / 2; return g > -12 && g < 6; })) continue;
        [best, bestErr] = [s, err];
      }
      if (best === null || bestErr > target * 0.5) continue;
      const door = doorAt(best);
      // Where they go in and out of the grounds: the nearest point of the plaza's straight side (its last edge), a little inside.
      const e0 = plaza[plaza.length - 1], e1 = plaza[0], ex = e1.x - e0.x, ez = e1.z - e0.z, el = Math.hypot(ex, ez) || 1;
      const t = Math.max(0, Math.min(1, ((door.at.x - e0.x) * ex + (door.at.z - e0.z) * ez) / (el * el)));
      const along = new THREE.Vector2(ex / el, ez / el);
      const cx = plaza.reduce((n, p) => n + p.x, 0) / plaza.length, cz = plaza.reduce((n, p) => n + p.z, 0) / plaza.length;
      let nx = -ez / el, nz = ex / el; // across the edge, towards the grounds
      if ((cx - e0.x) * nx + (cz - e0.z) * nz < 0) [nx, nz] = [-nx, -nz];
      const entry = new THREE.Vector3(e0.x + ex * t + nx * 0.8 * k, 0, e0.z + ez * t + nz * 0.8 * k);
      // A bus pulls over to the kerb: sideways by the gap between its side and the carriageway's edge.
      const pull = Math.max(0, rt.kerb / k - bus.spec.width / 2 - 0.35);
      const stop = { s: best, blocked: (/** @type {any} */ car) => car.kind === 'bus' && (car.busState === undefined || car.busState === 'dwell') };
      rt.stops.push(stop);
      // On the pavement they stand at its height, on the grounds at the grounds'.
      for (const p of parties) for (const m of p.members) {
        const floor = m.heightAt;
        m.heightAt = (/** @type {number} */ x, /** @type {number} */ z) => (inside(plaza, x, z) ? floor(x, z) : rt.pavementAt(x, z));
      }
      // A shelter over the pavement where they queue (a roof on four posts: nobody walks through a wall),
      // and the stop's sign on a pole by the kerb just ahead of the door. In metres, drawn at k.
      {
        const { at, fwd } = door, y = rt.pavementAt(at.x, at.z);
        const POST = '#8c9399', ROOF = '#2f8f8b', BLUE = '#2a62b8', WHITE = '#f4f1ea';
        const x0 = 0.65, x1 = -0.9, z0 = -0.2, z1 = -5.4; // across (local +x is to the left, the road's side; the grounds' side is −x), along
        world.batch.at(at.x, y, at.z, Math.atan2(fwd.x, fwd.y), k).add([
          ...[[x0, z0], [x0, z1], [x1, z0], [x1, z1]].map(([x, z]) => cyl(0.04, 0.04, 2.5, POST, [x, 1.25, z], {}, 8)),
          box(1.9, 0.14, 5.5, ROOF, [(x0 + x1) / 2, 2.57, (z0 + z1) / 2]), // roof
          box(1.94, 0.1, 5.54, WHITE, [(x0 + x1) / 2, 2.45, (z0 + z1) / 2]), // its pale underside / fascia
          box(0.04, 0.5, 1.2, BLUE, [x1 - 0.02, 1.5, (z0 + z1) / 2]), // a board on the far posts: the route
          cyl(0.035, 0.035, 2.8, POST, [0.45, 1.4, 1.6], {}, 8), // the sign's pole
          box(0.75, 0.75, 0.05, BLUE, [0.45, 2.55, 1.6]), // plate
          box(0.5, 0.12, 0.07, WHITE, [0.45, 2.78, 1.6]), // …white band
          box(0.46, 0.3, 0.07, WHITE, [0.45, 2.5, 1.6]), // …and a bus on it
          box(0.38, 0.1, 0.08, BLUE, [0.45, 2.55, 1.6]),
        ]);
      }
      // (Where they walk: from the entrance to the door, and the queue along the kerb — kept clear.)
      const { at, fwd } = door, q0 = (-2.4 * wait - 2.5) * k, q1 = 2.5 * k;
      world.busStop.walks.push([entry.x, entry.z, at.x, at.z], [at.x + fwd.x * q0, at.z + fwd.y * q0, at.x + fwd.x * q1, at.z + fwd.y * q1]);
      places.push({ lm, rt, stop, door, entry, along, pull, parties, plaza, timer: 0, queue: /** @type {any[]} */ ([]) });
    }

    /** @type {Map<any, any[]>} the parties on each bus */
    const riding = new Map(buses.map((b) => [b, []]));
    /** @type {Map<any, any>} the parties walking up to a bus's door to board: party → bus */
    const boarding = new Map();
    const slot = (/** @type {any} */ place, /** @type {number} */ along, /** @type {number} */ mi, /** @type {number} */ n) => {
      const { at, fwd } = place.door;
      const o = (along + (mi - (n - 1) / 2) * 1) * k;
      return new THREE.Vector3(at.x + fwd.x * o, 0, at.z + fwd.y * o);
    };
    // The first buses start with a party aboard.
    for (const b of buses) {
      const place = places.find((p) => p.rt.path === b.path);
      if (!place) continue;
      for (let i = 0; i < riders; i++) {
        const party = place.parties.find((p) => p.phase !== 'ride');
        if (!party) break;
        party.phase = 'ride';
        party.hide(true);
        party.setTrip(true);
        party.members.forEach((m, mi) => m.place(slot(place, 0, mi, party.members.length)));
        /** @type {any[]} */ (riding.get(b)).push(party);
      }
    }

    /** Where member `mi` of `n` goes in or out of the grounds: the entrance, spread along the edge. */
    const entryFor = (/** @type {any} */ place, /** @type {number} */ mi, /** @type {number} */ n) => {
      const o = (mi - (n - 1) / 2) * 1 * k;
      return new THREE.Vector3(place.entry.x + place.along.x * o, 0, place.entry.z + place.along.y * o);
    };
    /** Off the bus: appear at the door and walk to a viewpoint on the grounds. */
    const alight = (/** @type {any} */ place, /** @type {any} */ party) => {
      party.hide(false);
      party.members.forEach((/** @type {any} */ m, /** @type {number} */ mi) => m.place(slot(place, 1.6, mi, party.members.length)));
      party.spot = party.pick();
      // Along the pavement to the grounds' entrance, then over the grounds to a viewpoint.
      party.members.forEach((/** @type {any} */ m, /** @type {number} */ mi) => {
        const e = entryFor(place, mi, party.members.length);
        m.route = [e, ...party.way(e, party.slot(party.spot, mi))];
        m.ri = 0;
      });
      party.phase = 'go';
      party.then = 'look';
      world.busStop.alighted++;
    };
    /** A party on the grounds sets out for the stop. */
    const send = (/** @type {any} */ place, /** @type {any} */ party) => {
      const n = party.members.length, q = place.queue.length;
      party.dest = place;
      place.queue.push(party);
      party.setTrip(true);
      party.faceAt = { x: place.door.at.x - place.door.right.x * 4, z: place.door.at.z - place.door.right.y * 4 };
      party.members.forEach((/** @type {any} */ m, /** @type {number} */ mi) => {
        const goal = slot(place, -2.4 * q - 1.5, mi, n);
        const e = entryFor(place, mi, n);
        m.route = [...party.way(new THREE.Vector3(m.pos.x, 0, m.pos.z), e), goal];
        m.ri = 0;
      });
      party.phase = 'go';
      party.then = 'wait';
    };

    return {
      update({ dt }) {
        if (dt === 0) return;
        for (const place of places) {
          const { rt, stop, door, parties } = place;
          // Back from a trip: no longer away once they are looking at the view.
          for (const p of parties) if (p.trip && !p.dest && p.phase === 'look') p.setTrip(false);
          place.timer -= dt;
          if (place.timer <= 0 && place.queue.length < wait) {
            const party = parties.find((p) => p.phase === 'look' && !p.dest && !p.trip && p.timer > 8 && curfew.out(p.rank, undefined, 1.5)); // (not those about to go home: tourists go an hour early)
            if (party) send(place, party);
            place.timer = 20 + rng() * 30;
          }
          for (const bus of buses) {
            if (bus.path !== rt.path) continue;
            const ahead = rt.path.wrap(stop.s - bus.s);
            const d = ahead - bus.length / 2;
            // Over to the kerb on the way in (from 45 units out, done by 15), back to the lane on the way out (from 8 past the stop).
            const u = rt.path.wrap(d + rt.path.length / 2) - rt.path.length / 2; // front to the stop line: + before it
            const ease = (/** @type {number} */ x) => { const c = Math.max(0, Math.min(1, x)); return c * c * (3 - 2 * c); };
            bus.shift = place.pull * (u >= -8 ? ease((45 - u) / 30) : 1 - ease((-u - 8) / 32));
            if (bus.busState === undefined) {
              if (d < 1.3 && d > -2 && bus.v < 0.4) {
                bus.busState = 'dwell';
                bus.dwell = 0;
                world.busStop.stops++;
                bus.alightQ = /** @type {any[]} */ (riding.get(bus)).splice(0).map((party, i) => ({ party, at: 1 + i * 2.5 }));
              }
            } else if (bus.busState === 'dwell') {
              bus.dwell += dt;
              for (const a of bus.alightQ.filter((/** @type {any} */ a) => bus.dwell >= a.at)) {
                alight(place, a.party);
                bus.alightQ.splice(bus.alightQ.indexOf(a), 1);
              }
              // Parties at the stop get on, up to the bus's room.
              const aboard = /** @type {any[]} */ (riding.get(bus)).length + [...boarding.values()].filter((b) => b === bus).length;
              const ready = place.queue.filter((/** @type {any} */ p) => p.phase === 'wait');
              if (!bus.alightQ.length && aboard < CAPACITY && ready.length) {
                const party = ready[0];
                place.queue.splice(place.queue.indexOf(party), 1);
                party.dest = null;
                boarding.set(party, bus);
                party.members.forEach((/** @type {any} */ m, /** @type {number} */ mi) => {
                  m.route = [slot(place, 0.4, mi, party.members.length)];
                  m.ri = 0;
                });
                party.phase = 'go';
                party.then = 'ride';
              }
              // Away when everyone who is coming has got on (or it has waited long enough).
              const coming = place.queue.some((/** @type {any} */ p) => p.members.some((/** @type {any} */ m) => Math.hypot(m.pos.x - door.at.x, m.pos.z - door.at.z) < 12 * k)) || [...boarding.values()].includes(bus);
              if (bus.dwell > 40 || (bus.dwell >= dwell && !bus.alightQ.length && !coming)) bus.busState = 'done';
            } else if (bus.busState === 'done') {
              if (ahead > rt.path.length / 2) bus.busState = 'gone'; // (its front is past the stop)
            } else if (ahead < rt.path.length - 60) bus.busState = undefined; // (well on its way: ready for the next time round)
          }
          for (const [party, bus] of boarding) {
            if (party.phase !== 'ride') continue;
            boarding.delete(party);
            /** @type {any[]} */ (riding.get(bus)).push(party);
            world.busStop.boarded++;
          }
        }
      },
    };
  },
};
