// @ts-check
import * as THREE from 'three';
import { PERSON_HEIGHT } from '../world/people.js';
import { Party, Tourist, createSpeech, partySizes } from '../world/tourist.js';
import { squareLoop } from './strollers.js';
import { curfewOf, HURRY } from '../world/night.js';

const VISITORS = 1; // hours before the town's own people they go (world/night.js)

// Tourists at each landmark (world.landmarks): they walk slowly (not like the strollers, who keep
// going), stop at places picked at random over the landmark's grounds to look, take photos with a camera and
// say how lovely it is in a speech bubble with emoji; alone or in parties of two or three who walk
// together, stand in a row and talk (world/tourist.js). Drawn at world.scale like the strollers; in
// the rain they put their umbrellas up and stop taking photos. Like them they are world.pedestrians
// and key 9 follows them (6 too). Late at night they go home, party by party (world/night.js): out by the
// side of the grounds towards the street, and back that way in the morning.
// Options: count (tourists at each landmark, 14), speed (m/s, 0.6).

/** @type {import('../types').Feature} */
export default {
  label: 'Đang đón khách du lịch',
  needs: ['landmarks'],
  build(world, { rng, count = 14, speed = 0.6 }) {
    const k = world.scale.props;
    world.need('công trình (world.landmarks)', 'tourists', world.landmarks.length);
    const group = new THREE.Group();
    const speech = createSpeech();
    const curfew = curfewOf(world);
    /** @type {Map<Party, THREE.Vector3>} the way out of each party's grounds: off the plaza's straight side (its last edge) */
    const exits = new Map();
    /** @type {Set<Party>} on their way home, walking faster */
    const hurrying = new Set();
    /** @type {Party[]} */
    const parties = [];
    /** @type {Tourist[]} */
    const tourists = [];
    for (const lm of world.landmarks) {
      const loop = squareLoop(world, lm);
      if (!loop) continue;
      // The ground they wander on, and the landmark's footprint (the loop round it) they keep out of:
      // its own, or on a plain pad most of the pad and a small circle in the middle.
      const pad = world.cfg.pads?.find((p) => Math.hypot(p.x - lm.spot.x, p.z - lm.spot.z) < p.r);
      const ring = (/** @type {number} */ r) => Array.from({ length: 24 }, (_, i) => new THREE.Vector3((pad?.x ?? lm.spot.x) + Math.sin((i / 24) * Math.PI * 2) * r, 0, (pad?.z ?? lm.spot.z) + Math.cos((i / 24) * Math.PI * 2) * r));
      const plaza = lm.plaza ?? ring((pad?.r ?? 10) * 0.85);
      const keepOut = lm.walk ? lm.walk : ring((pad?.r ?? 10) * 0.3);
      const area = { plaza, keepOut, center: lm.spot, parties, rng, k };
      for (const size of partySizes(rng, count)) {
        const members = Array.from({ length: size }, () => {
          const t = new Tourist(rng, loop.floor, { speed: speed * k, k, speech });
          t.group.scale.multiplyScalar(k);
          group.add(t.group, t.sprite);
          return t;
        });
        const party = new Party(members, area);
        party.rank = curfew.rank();
        parties.push(party);
        world.parties.push(party);
        party.landmark = lm;
        for (const t of members) {
          tourists.push(t);
          world.pedestrians.push(t);
          const entry = { label: `Du khách ${lm.name} ${tourists.length}`, anchor: () => t.group };
          world.followables.people.push(entry); // (key 6 follows them too)
          world.followables.tourists.push(entry);
        }
      }
    }
    /** Where a party leaves its grounds: the nearest point of the plaza's straight side, a stride outside. */
    const exitFor = (/** @type {Party} */ p) => {
      const { plaza } = p.area, lead = p.members[0].pos;
      const e0 = plaza[plaza.length - 1], e1 = plaza[0], ex = e1.x - e0.x, ez = e1.z - e0.z, el = Math.hypot(ex, ez) || 1;
      const u = Math.max(0.1, Math.min(0.9, ((lead.x - e0.x) * ex + (lead.z - e0.z) * ez) / (el * el)));
      const cx = plaza.reduce((n, q) => n + q.x, 0) / plaza.length, cz = plaza.reduce((n, q) => n + q.z, 0) / plaza.length;
      let nx = ez / el, nz = -ex / el; // across the edge, away from the grounds
      if ((cx - e0.x) * nx + (cz - e0.z) * nz > 0) [nx, nz] = [-nx, -nz];
      return new THREE.Vector3(e0.x + ex * u + nx * 1.2 * p.area.k, 0, e0.z + ez * u + nz * 1.2 * p.area.k);
    };
    /** Late: looking about or waiting for the bus → out of the grounds and gone; in the morning, back in. */
    const home = (/** @type {Party} */ p) => {
      const out = curfew.out(p.rank, undefined, VISITORS);
      if (p.phase === 'home') {
        if (hurrying.delete(p)) for (const m of p.members) m.speed /= HURRY; // (home: no more hurry)
        if (!out) return;
        const at = /** @type {THREE.Vector3} */ (exits.get(p));
        p.members.forEach((m, mi) => m.place(new THREE.Vector3(at.x + (mi - (p.members.length - 1) / 2) * p.area.k, 0, at.z)));
        p.hide(false);
        p.setTrip(true); // (on the way in: still outside)
        p.spot = p.pick();
        p.route(p.spot);
        p.phase = 'go';
        p.then = 'look';
        return;
      }
      if (out) {
        if (p.phase === 'look' && p.members[0].trip && !p.dest) p.setTrip(false); // (back in from the night)
        return;
      }
      if (p.then === 'home' || p.phase === 'ride' || (p.phase === 'go' && p.then === 'ride')) return; // (on the way, or with the bus)
      if (p.phase === 'wait') {
        // (no more waiting for the bus: off the queue)
        const queue = p.dest?.queue;
        if (queue?.includes(p)) queue.splice(queue.indexOf(p), 1);
        p.dest = null;
      }
      const at = exitFor(p);
      exits.set(p, at);
      p.setTrip(true);
      p.members.forEach((m, mi) => {
        const goal = new THREE.Vector3(at.x + (mi - (p.members.length - 1) / 2) * p.area.k, 0, at.z);
        m.route = [...p.way(new THREE.Vector3(m.pos.x, 0, m.pos.z), goal)];
        m.ri = 0;
      });
      for (const m of p.members) m.speed *= HURRY;
      hurrying.add(p);
      p.phase = 'go';
      p.then = 'home';
    };

    if (tourists.length) world.scale.note('person', PERSON_HEIGHT * tourists[0].group.scale.y, 'tourists');

    return {
      group,
      dispose: () => speech.dispose(),
      update({ dt, t, rain }) {
        if (dt === 0) return;
        for (const p of parties) {
          home(p);
          p.update(dt, t, rain);
        }
        for (const m of tourists) m.updateBubble(dt);
      },
    };
  },
};
