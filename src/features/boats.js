import { createBoats } from '../world/boats.js';
import { waterLife } from './waterlife.js';

// A paddle steamer going up and down the river and a fisherman in a rowboat (spots "steamer",
// key L, and "fisherman", key J).
export default {
  label: 'Đang hạ thủy thuyền',
  build(world, { rng }) {
    const { spots, ripples } = waterLife(world, rng);
    const boats = createBoats({ heightAt: world.heightAt, riverX: world.cfg.riverX, ripples, waterSpots: spots, rng });
    Object.assign(world.spots, boats.spots);
    return { group: boats.group, update: ({ dt, t }) => boats.update(dt, t) };
  },
};
