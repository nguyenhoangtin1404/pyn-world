// @ts-check
import * as THREE from 'three';
import { Fleet } from '../world/vehicles/fleet.js';
import { Vehicle } from '../world/vehicles/vehicle.js';
import { KINDS } from '../world/vehicles/kinds.js';
import { updateTraffic } from '../world/vehicles/traffic.js';

// Vehicles going round a road (features/road.js), all one way: cars, pickups, trucks, motorbikes
// and bicycles (with riders pedalling). They keep their distance and stop for people crossing.
// Followed by the vehicle camera (key 8). Options: road (id; default the last road built),
// vehicles ({ kind: count }, kinds in world/vehicles/kinds.js).
/** @type {import('../types').Feature} */
export default {
  label: 'Đang cho xe chạy',
  needs: ['road'],
  build(world, { rng, road: roadId, vehicles = { car: 3, pickup: 1, truck: 1, motorbike: 2, bicycle: 2 } }) {
    const road = roadId ? world.roads.find((r) => r.id === roadId) : world.roads.at(-1);
    world.need(`đường "${roadId}"`, 'traffic', road);
    for (const kind of Object.keys(vehicles)) world.need(`loại xe có bánh (không phải "${kind}")`, 'traffic', KINDS[kind] && !KINDS[kind].flies);
    const group = new THREE.Group();
    const fleet = new Fleet(vehicles);
    group.add(...fleet.meshes);

    // Spread out evenly round the loop, kinds mixed up.
    const kinds = Object.entries(vehicles).flatMap(([kind, n]) => Array(n).fill(kind));
    for (let i = kinds.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [kinds[i], kinds[j]] = [kinds[j], kinds[i]];
    }
    const cars = kinds.map((kind, i) => new Vehicle({ kind, fleet, path: road.path, s: (i / kinds.length) * road.path.length, rng, heightAt: road.heightAt }));
    for (const c of cars) group.add(c.group);
    world.vehicles.push(...cars);
    const count = {};
    world.followables.vehicles.push(
      ...cars.map((c) => {
        count[c.kind] = (count[c.kind] ?? 0) + 1;
        return { label: `${c.spec.label} ${count[c.kind]}`, anchor: () => c.group };
      }),
    );

    const people = [];
    return {
      group,
      update({ dt }) {
        people.length = 0;
        for (const w of world.people) if (w.group.visible) people.push(w.pos);
        updateTraffic(cars, people, road.width / 2);
        for (const c of cars) c.update(dt);
      },
    };
  },
};
