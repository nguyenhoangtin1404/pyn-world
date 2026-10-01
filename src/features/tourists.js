// @ts-check
import * as THREE from 'three';
import { PERSON_HEIGHT } from '../world/people.js';
import { Party, Tourist, createSpeech, partySizes } from '../world/tourist.js';
import { squareLoop } from './strollers.js';

// Tourists at each landmark (world.landmarks): they walk slowly (not like the strollers, who keep
// going), stop at viewpoints scattered round the landmark to look, take photos with a camera and
// say how lovely it is in a speech bubble with emoji; alone or in parties of two or three who walk
// together, stand in a row and talk (world/tourist.js). Drawn at world.scale like the strollers; in
// the rain they put their umbrellas up and stop taking photos. Like them they are world.pedestrians
// and key 6 follows them. Options: count (tourists at each landmark, 14), speed (m/s, 0.6).

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
      const pts = loop.route.slice(0, -1);
      const inside = { x: pts.reduce((t, p) => t + p.x, 0) / pts.length, z: pts.reduce((t, p) => t + p.z, 0) / pts.length };
      const area = { pts, center: lm.spot, inside, parties, rng, k };
      for (const size of partySizes(rng, count)) {
        const members = Array.from({ length: size }, () => {
          const t = new Tourist(rng, loop.floor, { speed: speed * k, k, speech });
          t.group.scale.multiplyScalar(k);
          group.add(t.group, t.sprite);
          return t;
        });
        const party = new Party(members, area, Math.floor(rng() * area.pts.length));
        parties.push(party);
        for (const t of members) {
          tourists.push(t);
          world.pedestrians.push(t);
          world.followables.people.push({ label: `Du khách ${lm.name} ${tourists.length}`, anchor: () => t.group });
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
