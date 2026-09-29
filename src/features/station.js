import * as THREE from 'three';
import { TRACK_Y } from '../config.js';
import { box, cyl, prism, shape } from '../world/lowpoly.js';
import { shadowed, labelTexture } from './common.js';
import { lamps } from './lamps.js';
import { buildPlatform, frameIndex, PLAT_TOP } from './platform.js';

// A main station at a stop (option `stop`: an id from cfg.stops, by default the first one not built
// yet): platform on the outer side of the loop, the station building behind it, a canopy with lamps
// and benches. Registers itself in world.stations (villagers wait on its platform, pigeons peck on
// it).
export default {
  label: 'Đang xây nhà ga',
  build(world, { stop: stopId }) {
    const { track, site, batch } = world;
    const stop = world.stop(stopId, 'station');
    const { windowMat, lampMat, halos, pools } = lamps(world);
    const group = new THREE.Group();
    const f0 = stop.frame;
    const sg = Math.sign(f0.side.dot(f0.p)) || 1; // which side of the track faces outward
    const out = f0.side.clone().multiplyScalar(sg);
    const PLAT_OUT = 7.95;
    const mainPlat = buildPlatform(world, group, frameIndex(track, f0), sg, PLAT_OUT);

    const st = new THREE.Group();
    st.position.set(f0.p.x, 0, f0.p.z);
    st.rotation.y = Math.atan2(f0.t.x, f0.t.z);
    const ox = -sg; // outward along the station group's local x
    const stRot = st.rotation.y;
    const stWorld = (lx, lz) => ({
      x: f0.p.x + lx * Math.cos(stRot) + lz * Math.sin(stRot),
      z: f0.p.z - lx * Math.sin(stRot) + lz * Math.cos(stRot),
    });
    // The building stands on the platform; its walls reach down to the ground behind it.
    const floor = TRACK_Y + PLAT_TOP;
    batch.at(f0.p.x, 0, f0.p.z, stRot);
    batch.add([
      box(6, 5.8, 13, '#f1e0bf', [ox * 11, floor + 1.5, 0]),
      prism(7.4, 2.4, 14, '#c8453a', [ox * 11, floor + 4.4, 0]),
      box(0.12, 2.4, 1.6, '#6b4a33', [ox * 7.95, floor + 1.2, 0]),
    ]);
    site.colliders.push({ ...stWorld(ox * 11, 0), w: 6, d: 13, rot: stRot });
    {
      const b = stWorld(ox * 11, 0), c = stWorld(ox * 4.3, 0);
      site.solidBox(b.x, b.z, 7.4, 14, stRot, 0, floor + 6.8); // building and roof
      site.solidBox(c.x, c.z, 4.6, 22, stRot, TRACK_Y + 4.45, TRACK_Y + 4.75); // platform canopy
    }
    for (const z of [-4.5, -2.2, 2.2, 4.5]) batch.add(box(0.12, 1.2, 1.3, '#4a5563', [ox * 7.95, floor + 2.3, z]), windowMat);
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(5, 1.25), new THREE.MeshLambertMaterial({ map: labelTexture(stop.name) }));
    sign.position.set(ox * 7.9, floor + 3.8, 0);
    sign.rotation.y = -ox * (Math.PI / 2);
    st.add(sign);
    // Canopy over the platform
    batch.add(box(4.6, 0.25, 22, '#c8453a', [ox * 4.3, TRACK_Y + 4.6, 0]));
    for (const z of [-9, -3, 3, 9]) {
      batch.add(cyl(0.12, 0.12, 3.6, '#efe3c6', [ox * 5.8, TRACK_Y + 2.8, z], {}, 6));
      site.colliders.push({ ...stWorld(ox * 5.8, z), r: 0.2 });
    }
    for (const z of [-6, 6]) {
      // Benches against the station wall, out of the way of people walking along the platform.
      batch.add([box(0.6, 0.5, 2.2, '#7a5236', [ox * 7.5, TRACK_Y + 1.25, z]), box(0.1, 0.5, 2.2, '#7a5236', [ox * 7.82, TRACK_Y + 1.7, z])]);
      site.colliders.push({ ...stWorld(ox * 7.5, z), w: 0.7, d: 2.2, rot: stRot });
    }
    for (const z of [-15, 0, 15]) {
      const y = z === 0 ? TRACK_Y + 4.2 : TRACK_Y + 4.4;
      if (z !== 0) {
        batch.add(cyl(0.1, 0.14, 3.4, '#3a302b', [ox * 3.2, TRACK_Y + 2.7, z], {}, 6));
        site.colliders.push({ ...stWorld(ox * 3.2, z), r: 0.2 });
      }
      batch.add(shape(new THREE.SphereGeometry(0.28, 8, 6), '#fff4d6', [ox * 3.2, y, z]), lampMat);
      const lw = stWorld(ox * 3.2, z);
      halos.push([lw.x, y, lw.z]);
      pools.push([lw.x, TRACK_Y + PLAT_TOP, lw.z, 6.5]);
    }
    shadowed(st);
    group.add(st);

    // Random spots on the platform floor / canopy roof (u along, v across, both 0..1) — for pigeons.
    const platformPoint = mainPlat.point;
    const canopyPoint = (u, v) => {
      const w = stWorld(ox * (2.4 + v * 3.6), -10 + u * 20);
      return new THREE.Vector3(w.x, TRACK_Y + 4.6 + 0.125, w.z);
    };

    world.stations.push({
      id: stop.id,
      frame: f0,
      out, // horizontal direction from the track towards the platform
      homes: [], // where the people who live around this stop go home to (village.js)
      // Places on the platform where people wait for the train (between benches and posts).
      platformSpots: mainPlat.spots([-12, -3, 3, 12], 4.4),
      point: platformPoint,
      canopyPoint,
    });
    return { group };
  },
};
