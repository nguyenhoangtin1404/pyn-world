// @ts-check
import * as THREE from 'three';
import { WATER_Y } from '../config.js';
import { Ripples } from '../world/particles.js';

// Shared by everything living on the water (fish, boats): spots on deep water, and the ripples on
// its surface — which raindrops dimple too.
//   const { spots, ripples } = waterLife(world, rng);
export const waterLife = (world, rng) => world.service('waterLife', () => createWaterLife(world, rng));

function createWaterLife(world, rng) {
  const { heightAt, size } = world;
  const group = new THREE.Group();
  const ripples = new Ripples();
  group.add(ripples.group);
  const spots = [];
  for (let i = 0; i < 6000 && spots.length < 200; i++) {
    const x = (rng() - 0.5) * (size - 20);
    const z = (rng() - 0.5) * (size - 20);
    if (heightAt(x, z) < WATER_Y - 1.2) spots.push({ x, z });
  }
  let rainRipple = 0;
  return world.add({
    group,
    spots,
    ripples,
    update({ dt, rain }) {
      // Raindrops dimple the water.
      if (rain > 0.2 && dt > 0 && spots.length) {
        rainRipple += dt * 40 * rain;
        while (rainRipple > 1) {
          rainRipple--;
          const s = spots[Math.floor(Math.random() * spots.length)];
          ripples.spawn(s.x + (Math.random() - 0.5) * 30, s.z + (Math.random() - 0.5) * 30, 0.35, 0.6);
        }
      }
      ripples.update(dt);
    },
  });
}
