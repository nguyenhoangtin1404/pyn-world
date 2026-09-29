import * as THREE from 'three';
import { Smoke } from './particles.js';
import { createSteamer } from './boats/steamer.js';
import { createRowboat } from './boats/rowboat.js';

// The boats: a paddle steamer cruising the river (boats/steamer.js) and a rowboat with a fisherman
// on the lake (boats/rowboat.js). Spots "steamer" and "fisherman" follow them (keys L and J).
export function createBoats({ heightAt, riverX, ripples, waterSpots, rng }) {
  const group = new THREE.Group();
  // Funnel smoke: the same pool as the locomotive's, just softer and slower.
  const puffs = new Smoke({ n: 18, color: '#e9e6e0', rise: 1.6, drift: 0.6, grow: 1.4, fade: 0.7 });
  group.add(puffs.group);
  const steamer = createSteamer({ riverX, ripples, puffs, rng });
  const rowboat = createRowboat({ heightAt, riverX, ripples, waterSpots, rng });
  group.add(steamer.group, rowboat.group);
  return {
    group,
    spots: { fisherman: rowboat.boat.position, steamer: steamer.group.position },
    update(dt, t) {
      steamer.update(dt, t);
      rowboat.update(dt, t);
      puffs.update(dt);
    },
  };
}
