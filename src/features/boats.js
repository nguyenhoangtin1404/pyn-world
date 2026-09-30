// @ts-check
import { createBoats } from '../world/boats.js';
import { waterLife } from './waterlife.js';

// A paddle steamer going up and down the river and a fisherman in a rowboat (spots "steamer",
// key L, and "fisherman", key J).
/** @type {import('../types').Feature} */
export default {
  label: 'Đang hạ thủy thuyền',
  build(world, { rng }) {
    const { spots, ripples } = waterLife(world, rng);
    // The steamer sails up and down a river x = riverX(z) (the one-river worlds).
    world.need('một con sông dạng riverX (cfg.river)', 'boats', world.rivers.riverX);
    const boats = createBoats({ heightAt: world.heightAt, riverX: world.rivers.riverX, ripples, waterSpots: spots, rng });
    Object.assign(world.spots, boats.spots);
    return { group: boats.group, update: ({ dt, t }) => boats.update(dt, t) };
  },
};
