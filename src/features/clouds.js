// @ts-check
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Clouds drifting across the valley, greying over in rain or snow. Options: count (16).
/** @type {import('../types').Feature} */
export default {
  label: 'Đang thổi mây',
  build(world, { rng, count = 16 }) {
    const { size } = world;
    const group = new THREE.Group();
      // Own material: clouds grey over when it rains. Each cloud is one mesh of merged puffs.
      const cloudMat = new THREE.MeshLambertMaterial({ color: '#ffffff', emissive: '#ffffff', emissiveIntensity: 0.12, flatShading: true });
      const clouds = [];
      for (let i = 0; i < count; i++) {
        const n = 3 + Math.floor(rng() * 3);
        const puffs = [];
        for (let k = 0; k < n; k++) {
          const x = (k - n / 2) * 4.5 + rng() * 2, y = rng() * 2, z = rng() * 4;
          const s = 3.5 + rng() * 3;
          puffs.push(new THREE.IcosahedronGeometry(1, 1).scale(s, s, s).translate(x, y, z));
        }
        const cg = new THREE.Mesh(mergeGeometries(puffs), cloudMat);
        cg.castShadow = false; // 16 extra shadow-pass draws for shadows too soft to notice at that height
        cg.position.set((rng() - 0.5) * size, 75 + rng() * 30, (rng() - 0.5) * size);
        group.add(cg);
        clouds.push(cg);
      }

      const white = new THREE.Color('#ffffff');
      const grey = new THREE.Color('#8f959c');
    return {
      group,
      update({ dt }) {
        for (const c of clouds) {
          c.position.x += dt * 2.2;
          if (c.position.x > size / 2 + 20) c.position.x -= size + 40;
        }
      },
      lateUpdate({ overcast }) {
        cloudMat.color.copy(white).lerp(grey, overcast);
      },
    };
  },
};
