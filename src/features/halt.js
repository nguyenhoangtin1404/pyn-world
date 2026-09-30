// @ts-check
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { TRACK_Y } from '../config.js';
import { box, cyl, shape, VERTEX_COLORED } from '../world/lowpoly.js';
import { shadowed, labelTexture } from './common.js';
import { lamps } from './lamps.js';
import { houses, WOOD } from './houses.js';
import { buildPlatform, frameIndex, PLAT_TOP } from './platform.js';

// A halt at a stop (option `stop`: an id from cfg.stops, by default the first one not built yet): a
// short platform with a shelter — and, if the stop has a zone in cfg.stops, a town street leading
// inward from it, lined with houses and shops. Registers itself in world.stations; the town's
// people belong to it.
/** @type {import('../types').Feature} */
export default {
  label: 'Đang dựng trạm và khu phố',
  build(world, { rng, stop: stopId }) {
    const { track, site, batch, heightAt, terrain } = world;
    const stop = world.stop(stopId, 'halt');
    const { lampMat, halos, pools } = lamps(world);
    const { build } = houses(world);
    const group = new THREE.Group();
    const hf = stop.frame;
    const k = track.k ?? 1; // the platform and shelter at the railway's size (the town street isn't yet)
    const sgH = -(Math.sign(hf.side.dot(hf.p)) || 1); // the town side: towards the middle of the loop
    const haltPlat = buildPlatform(world, group, frameIndex(track, hf), sgH, 6.5);
    const hRot = Math.atan2(hf.t.x, hf.t.z);
    const oxH = -sgH; // platform side along the halt's local x
    const hWorld = (lx, lz) => ({
      x: hf.p.x + lx * Math.cos(hRot) + lz * Math.sin(hRot),
      z: hf.p.z - lx * Math.sin(hRot) + lz * Math.cos(hRot),
    });
    {
      const floorH = TRACK_Y + PLAT_TOP * k;
      batch.at(hf.p.x, 0, hf.p.z, hRot);
      batch.add([
        box(0.14 * k, 2.5 * k, 8.4 * k, '#e8d6b0', [oxH * 6.35 * k, floorH + 1.25 * k, 0]), // back wall
        box(2.6 * k, 0.18 * k, 9 * k, '#4f6d8f', [oxH * 5.3 * k, floorH + 2.6 * k, 0], { rz: oxH * 0.12 }), // roof, sloping to the back
        box(0.5 * k, 0.45 * k, 3.2 * k, WOOD, [oxH * 5.95 * k, floorH + 0.225 * k, 0]), // bench
        box(0.08 * k, 0.5 * k, 3.2 * k, WOOD, [oxH * 6.2 * k, floorH + 0.7 * k, 0]),
      ]);
      site.colliders.push({ ...hWorld(oxH * 6.1 * k, 0), w: 0.9 * k, d: 8.4 * k, rot: hRot });
      const sh = hWorld(oxH * 5.3 * k, 0);
      site.solidBox(sh.x, sh.z, 2.6 * k, 9 * k, hRot, floorH, floorH + 2.8 * k);
      for (const z of [-4, 4]) {
        batch.add(cyl(0.1 * k, 0.1 * k, 2.6 * k, '#efe3c6', [oxH * 4.3 * k, floorH + 1.3 * k, z * k], {}, 6));
        batch.add(shape(new THREE.SphereGeometry(0.22 * k, 8, 6), '#fff4d6', [oxH * 4.3 * k, floorH + 2.35 * k, z * k]), lampMat);
        site.colliders.push({ ...hWorld(oxH * 4.3 * k, z * k), r: 0.2 * k });
        const lw = hWorld(oxH * 4.3 * k, z * k);
        halos.push([lw.x, floorH + 2.35 * k, lw.z]);
        pools.push([lw.x, floorH, lw.z, 4.5 * k]);
      }
      const hs = new THREE.Group();
      hs.position.set(hf.p.x, 0, hf.p.z);
      hs.rotation.y = hRot;
      const hsign = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 0.9), new THREE.MeshLambertMaterial({ map: labelTexture(stop.name) }));
      hsign.position.set(oxH * 4.2 * k, floorH + 3.3 * k, 0);
      hsign.rotation.y = -oxH * (Math.PI / 2);
      hsign.scale.setScalar(k);
      const signPosts = new THREE.Mesh(mergeGeometries([-1.4, 1.4].map((z) => cyl(0.05 * k, 0.05 * k, 0.8 * k, '#3a302b', [oxH * 4.25 * k, floorH + 2.9 * k, z * k], {}, 5))), VERTEX_COLORED);
      hs.add(hsign, signPosts);
      group.add(shadowed(hs));
    }

    // The street runs inward from the halt, square to the world axes like the village houses.
    const townHomes = [];
    const town = terrain.zones[stop.id];
    if (town) {
      const U = Math.abs(town.inward.x) > Math.abs(town.inward.z) ? new THREE.Vector3(Math.sign(town.inward.x), 0, 0) : new THREE.Vector3(0, 0, Math.sign(town.inward.z));
      const V = new THREE.Vector3(-U.z, 0, U.x);
      const P0 = hf.p.clone().addScaledVector(town.inward, 13).setY(0);
      const STREET = 58;
      const groundH = heightAt(P0.x, P0.z);
      const cobble = '#b9ab94';
      // Path from the platform to the street, and the street itself.
      batch.at(hf.p.x + town.inward.x * 9.5, groundH, hf.p.z + town.inward.z * 9.5, Math.atan2(town.inward.x, town.inward.z));
      batch.add(box(3.2, 0.04, 7.5, cobble, [0, 0.02, 0]));
      batch.at(P0.x + U.x * (STREET / 2 - 3), groundH, P0.z + U.z * (STREET / 2 - 3), Math.atan2(U.x, U.z));
      batch.add(box(4.6, 0.04, STREET, cobble, [0, 0.02, 0]));
      for (let i = 0; i < 5; i++) {
        for (const side of [-1, 1]) {
          const c = P0.clone().addScaledVector(U, 5 + i * 11).addScaledVector(V, side * 9.2);
          const h = site.spotOK(c.x, c.z, 9);
          if (h === null) continue;
          const hw = 5.8 + rng() * 1.2, hd = 5.4 + rng() * 1.0;
          const floors = rng() < 0.75 ? 2 : 1;
          const rot = Math.atan2(-side * V.x, -side * V.z); // front door faces the street
          townHomes.push(build(rng, c.x, h, c.z, rot, hw, hd, floors, { shop: i < 2 }));
        }
        // Street lamps between the houses.
        for (const side of [-1, 1]) {
          const l = P0.clone().addScaledVector(U, -0.5 + i * 11).addScaledVector(V, side * 3.0);
          batch.at(l.x, groundH, l.z, 0);
          batch.add(cyl(0.07, 0.1, 3.2, '#3a302b', [0, 1.6, 0], {}, 6));
          batch.add(shape(new THREE.SphereGeometry(0.2, 8, 6), '#fff4d6', [0, 3.3, 0]), lampMat);
          site.colliders.push({ x: l.x, z: l.z, r: 0.2 });
          halos.push([l.x, groundH + 3.3, l.z]);
          pools.push([l.x, groundH, l.z, 5]);
        }
      }
      // Keep trees and rocks off the street and the halt.
      for (let k = 0; k <= STREET; k += 8) {
        const c = P0.clone().addScaledVector(U, k);
        site.obstacles.push([c.x, c.z, 9]);
      }
    }
    site.obstacles.push([hf.p.x, hf.p.z, 26]);

    world.stations.push({ id: stop.id, frame: hf, out: haltPlat.out, homes: townHomes, platformSpots: haltPlat.spots([-13, -8, 8, 13], 3.6), point: haltPlat.point });
    return { group };
  },
};
