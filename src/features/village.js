import { houses } from './houses.js';

// Houses scattered over the flat plateau inward from a station (its zone in cfg.stops), square to
// the world axes and turned towards the station. Their people belong to that stop.
// Options: stop (id; by default the station built just before), count (houses, 14).
export default {
  label: 'Đang dựng làng',
  build(world, { rng, stop: stopId = world.stations.at(-1)?.id, count = 14 }) {
    const { site, heightAt, terrain } = world;
    const station = world.stationById(stopId);
    world.need(`một ga đã dựng ("station")${stopId ? ` ở điểm dừng "${stopId}"` : ''}`, 'village', station);
    const village = terrain.zones[station.id];
    world.need(`một khu đất phẳng (zone) cho điểm dừng "${station.id}" trong cfg.stops`, 'village', village);
    const f0 = station.frame;
    const { build } = houses(world);
    const { homes } = station;
    let built = 0;
    for (let tries = 0; built < count && tries < 800; tries++) {
      const a = village.A0 + 6 + rng() * (village.A1 - village.A0 - 12);
      const b = (rng() - 0.5) * (village.HALF_B - 6) * 2;
      const x = f0.p.x + village.inward.x * a + village.along.x * b;
      const z = f0.p.z + village.inward.z * a + village.along.z * b;
      const h = site.spotOK(x, z, 12);
      if (h === null) continue;
      if (Math.abs(heightAt(x + 4, z) - h) > 0.15 || Math.abs(heightAt(x - 4, z) - h) > 0.15) continue;
      if (Math.abs(heightAt(x, z + 4) - h) > 0.15 || Math.abs(heightAt(x, z - 4) - h) > 0.15) continue;
      const hw = 5.6 + rng() * 1.6, hd = 5.4 + rng() * 1.4;
      const floors = rng() < 0.5 ? 2 : 1;
      // Square to the world axes, turned towards the station (tidy streets on the flat ground).
      const rot = Math.round(Math.atan2(f0.p.x - x, f0.p.z - z) / (Math.PI / 2)) * (Math.PI / 2);
      homes.push(build(rng, x, h, z, rot, hw, hd, floors));
      site.obstacles.push([x, z, 11]);
      built++;
    }
  },
};
