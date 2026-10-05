// @ts-check
import * as THREE from 'three';
import { TRACK_Y } from '../config.js';
import { box, cyl, prism, shape } from '../world/lowpoly.js';
import { shadowed, labelTexture } from './common.js';
import { lamps } from '../services/lamps.js';
import { buildPlatform, frameIndex, PLAT_TOP } from './platform.js';

// A main station at a stop (option `stop`: an id from cfg.stops, by default the first one not built
// yet): platform on the outer side of the loop, the station building behind it, a canopy with lamps
// and benches. Registers itself in world.stations (villagers wait on its platform, pigeons peck on
// it). Drawn at the railway's size (track.k, world.scale.props): every length × k.
/** @type {import('../types').Feature} */
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
    const k = track.k ?? 1;
    const PLAT_OUT = 7.95; // at model size
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
    const floor = TRACK_Y + PLAT_TOP * k;
    batch.at(f0.p.x, 0, f0.p.z, stRot);
    batch.add([
      box(6 * k, 5.8 * k, 13 * k, '#f1e0bf', [ox * 11 * k, floor + 1.5 * k, 0]),
      prism(7.4 * k, 2.4 * k, 14 * k, '#c8453a', [ox * 11 * k, floor + 4.4 * k, 0]),
      box(0.12 * k, 2.4 * k, 1.6 * k, '#6b4a33', [ox * 7.95 * k, floor + 1.2 * k, 0]),
    ]);
    site.colliders.push({ ...stWorld(ox * 11 * k, 0), w: 6 * k, d: 13 * k, rot: stRot });
    {
      const b = stWorld(ox * 11 * k, 0), c = stWorld(ox * 4.3 * k, 0);
      site.solidBox(b.x, b.z, 7.4 * k, 14 * k, stRot, 0, floor + 6.8 * k); // building and roof
      site.solidBox(c.x, c.z, 4.6 * k, 22 * k, stRot, TRACK_Y + 4.45 * k, TRACK_Y + 4.75 * k); // platform canopy
    }
    for (const z of [-4.5, -2.2, 2.2, 4.5]) batch.add(box(0.12 * k, 1.2 * k, 1.3 * k, '#4a5563', [ox * 7.95 * k, floor + 2.3 * k, z * k]), windowMat);
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(5, 1.25), new THREE.MeshLambertMaterial({ map: labelTexture(stop.name) }));
    sign.position.set(ox * 7.9 * k, floor + 3.8 * k, 0);
    sign.rotation.y = -ox * (Math.PI / 2);
    sign.scale.setScalar(k);
    st.add(sign);
    // Canopy over the platform
    batch.add(box(4.6 * k, 0.25 * k, 22 * k, '#c8453a', [ox * 4.3 * k, TRACK_Y + 4.6 * k, 0]));
    for (const z of [-9, -3, 3, 9]) {
      batch.add(cyl(0.12 * k, 0.12 * k, 3.6 * k, '#efe3c6', [ox * 5.8 * k, TRACK_Y + 2.8 * k, z * k], {}, 6));
      site.colliders.push({ ...stWorld(ox * 5.8 * k, z * k), r: 0.2 * k });
    }
    for (const z of [-6, 6]) {
      // Benches against the station wall, out of the way of people walking along the platform.
      batch.add([box(0.6 * k, 0.5 * k, 2.2 * k, '#7a5236', [ox * 7.5 * k, TRACK_Y + 1.25 * k, z * k]), box(0.1 * k, 0.5 * k, 2.2 * k, '#7a5236', [ox * 7.82 * k, TRACK_Y + 1.7 * k, z * k])]);
      site.colliders.push({ ...stWorld(ox * 7.5 * k, z * k), w: 0.7 * k, d: 2.2 * k, rot: stRot });
    }
    for (const z of [-15, 0, 15]) {
      const y = z === 0 ? TRACK_Y + 4.2 * k : TRACK_Y + 4.4 * k;
      if (z !== 0) {
        batch.add(cyl(0.1 * k, 0.14 * k, 3.4 * k, '#3a302b', [ox * 3.2 * k, TRACK_Y + 2.7 * k, z * k], {}, 6));
        site.colliders.push({ ...stWorld(ox * 3.2 * k, z * k), r: 0.2 * k });
      }
      batch.add(shape(new THREE.SphereGeometry(0.28 * k, 8, 6), '#fff4d6', [ox * 3.2 * k, y, z * k]), lampMat);
      const lw = stWorld(ox * 3.2 * k, z * k);
      halos.push([lw.x, y, lw.z]);
      pools.push([lw.x, floor, lw.z, 6.5 * k]);
    }
    shadowed(st);
    group.add(st);

    // Random spots on the platform floor / canopy roof (u along, v across, both 0..1) — for pigeons.
    const platformPoint = mainPlat.point;
    const canopyPoint = (u, v) => {
      const w = stWorld(ox * (2.4 + v * 3.6) * k, (-10 + u * 20) * k);
      return new THREE.Vector3(w.x, TRACK_Y + (4.6 + 0.125) * k, w.z);
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
