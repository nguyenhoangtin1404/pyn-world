// @ts-check
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { fbm } from '../world/terrain.js';
import { lam } from '../world/lowpoly.js';
import { TREE_COVER } from '../world/landcover.js';

// Trees (pines higher up), flowers and rocks: one InstancedMesh per kind of part. Trees and rocks
// are colliders people walk around, and can be cleared away later (site.clearAround, hiking trails).
// In a world from map data the land cover decides (cfg.landcover): woods on the hills, a casuarina
// belt behind the beach, next to none in the rice fields or the town, none on the sand.
// Options: count (trees, 1300), flowers (900), rocks (160).
/** @type {import('../types').Feature} */
export default {
  label: 'Đang trồng cây',
  build(world, { rng, count = 1300, flowers: flowerCount = 900, rocks: rockCount = 160 }) {
    const { site, size } = world;
    const cover = world.cfg.landcover ?? null;
    const P = world.scale.props; // (1 but for worlds drawn smaller, see world/scale.js)
    const group = new THREE.Group();
      const trees = [];
      for (let tries = 0; trees.length < count && tries < 24000; tries++) {
        const x = (rng() - 0.5) * (size - 30), z = (rng() - 0.5) * (size - 30);
        if (fbm(x, z, 3, 0.012, 21.7) < -0.05 && rng() > 0.12) continue;
        const h = site.spotOK(x, z, 7);
        if (h === null) continue;
        if (cover) {
          const c = TREE_COVER[cover(x, z)];
          if (rng() >= c.keep) continue;
          trees.push({ x, z, h, pine: rng() < c.pine, s: (0.7 + rng() * 0.7) * P, r: rng() * Math.PI * 2 });
          continue;
        }
        trees.push({ x, z, h, pine: h > 12 ? rng() < 0.85 : rng() < 0.45, s: (0.7 + rng() * 0.7) * P, r: rng() * Math.PI * 2 });
      }
      const dummy = new THREE.Object3D();
      function instanced(geo, mat, items, colors) {
        const mesh = new THREE.InstancedMesh(geo, mat, items.length);
        const c = new THREE.Color();
        items.forEach((it, i) => {
          dummy.position.set(it.x, it.h - 0.15 * P, it.z);
          dummy.rotation.set(it.rx || 0, it.r, 0);
          dummy.scale.setScalar(it.s);
          dummy.updateMatrix();
          mesh.setMatrixAt(i, dummy.matrix);
          if (colors) mesh.setColorAt(i, c.set(colors[Math.floor(rng() * colors.length)]));
          (it.instances ||= []).push([mesh, i]); // lets site.clearAround() hide it later
        });
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        group.add(mesh);
        return mesh;
      }
      const trunkGeo = new THREE.CylinderGeometry(0.22, 0.34, 1.8, 5).translate(0, 0.9, 0);
      const pineGeo = mergeGeometries([
        new THREE.ConeGeometry(1.7, 3.2, 7).translate(0, 2.9, 0),
        new THREE.ConeGeometry(1.25, 2.6, 7).translate(0, 4.3, 0),
      ]);
      const roundGeo = new THREE.IcosahedronGeometry(1.8, 0).translate(0, 3.2, 0);
      instanced(trunkGeo, lam('#7a5236'), trees);
      instanced(pineGeo, lam('#ffffff'), trees.filter((t) => t.pine), ['#4f8f45', '#5f9e4a', '#3f7d44', '#6c9a3c']);
      instanced(roundGeo, lam('#ffffff'), trees.filter((t) => !t.pine), ['#8cbf55', '#a3c75a', '#7fb34d', '#e0a64a', '#d9774a']);

      // Flowers and rocks
      const flowers = [];
      for (let tries = 0; flowers.length < flowerCount && tries < 9000; tries++) {
        const x = (rng() - 0.5) * (size * 2 / 3), z = (rng() - 0.5) * (size * 2 / 3);
        const h = site.spotOK(x, z, 5);
        if (h === null || h > 18) continue;
        flowers.push({ x, z, h: h + 0.25 * P, s: (0.7 + rng() * 0.6) * P, r: rng() * 6 });
      }
      instanced(new THREE.IcosahedronGeometry(0.2, 0), lam('#ffffff'), flowers, ['#ff8fb1', '#ffd36e', '#ffffff', '#b69cff', '#ff9a5a']).castShadow = false;
      const rocks = [];
      for (let tries = 0; rocks.length < rockCount && tries < 4000; tries++) {
        const x = (rng() - 0.5) * (size - 40), z = (rng() - 0.5) * (size - 40);
        const h = site.spotOK(x, z, 6);
        if (h === null) continue;
        rocks.push({ x, z, h: h + 0.1 * P, s: (0.5 + rng() * 1.6) * P, r: rng() * 6, rx: rng() });
      }
      instanced(new THREE.DodecahedronGeometry(1, 0), lam('#ffffff'), rocks, ['#a79d90', '#978d80', '#b6ab9c']);
      // Model heights: the round crown's top 5.0, the pine's 5.6, at s = 1.
      if (trees.length) world.scale.note('tree', trees.reduce((sum, t) => sum + t.s * (t.pine ? 5.6 : 5.0), 0) / trees.length, 'trees');
      // Low branches and boulders block people too (radius scaled by the instance size).
      for (const t of trees) site.colliders.push({ x: t.x, z: t.z, r: (t.pine ? 1.1 : 0.8) * t.s, item: t });
      for (const r of rocks) site.colliders.push({ x: r.x, z: r.z, r: 0.95 * r.s, item: r });
    return { group };
  },
};
