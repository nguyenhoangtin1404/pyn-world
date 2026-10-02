// @ts-check
import * as THREE from 'three';
import { PERSON_HEIGHT } from '../world/people.js';
import { Party, Tourist, createSpeech, partySizes } from '../world/tourist.js';
import { squareLoop } from './strollers.js';

// Tourists at each landmark (world.landmarks): they walk slowly (not like the strollers, who keep
// going), stop at places picked at random over the landmark's grounds to look, take photos with a camera and
// say how lovely it is in a speech bubble with emoji; alone or in parties of two or three who walk
// together, stand in a row and talk (world/tourist.js). Drawn at world.scale like the strollers; in
// the rain they put their umbrellas up and stop taking photos. Like them they are world.pedestrians
// and key 9 follows them (6 too). Options: count (tourists at each landmark, 14), speed (m/s, 0.6).

/** @type {import('../types').Feature} */
export default {
  label: 'Đang đón khách du lịch',
  needs: ['landmarks'],
  build(world, { rng, count = 14, speed = 0.6 }) {
    const k = world.scale.props;
    world.need('công trình (world.landmarks)', 'tourists', world.landmarks.length);
    const group = new THREE.Group();
    const speech = createSpeech();
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
    if (tourists.length) world.scale.note('person', PERSON_HEIGHT * tourists[0].group.scale.y, 'tourists');

    return {
      group,
      dispose: () => speech.dispose(),
      update({ dt, t, rain }) {
        if (dt === 0) return;
        for (const p of parties) p.update(dt, t, rain);
        for (const m of tourists) m.updateBubble(dt);
      },
    };
  },
};
