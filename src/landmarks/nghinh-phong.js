// @ts-check
import * as THREE from 'three';
import { box, cone, cyl, ball, segment } from '../world/lowpoly.js';
import { lamps } from '../features/lamps.js';
import { above, toWorld } from './common.js';

// Tháp Nghinh Phong, Tuy Hòa: the "wind-welcoming" tower on the square by the beach. Stylised: a
// twisting stack of white hexagonal tiers turning like the wind, rising out of a ring of dark basalt
// columns (a nod to Gành Đá Đĩa), with bands of LED light between the tiers that glow and slowly
// change colour at night. Around it a round paved square with lamp posts and a walkway down to the
// sea (local +x). Taller than life (about 5×) so it reads at diorama scale.

const TIERS = 12;
const WHITE = '#f3f1ea', STONE = '#d8d0bf', STONE_DARK = '#b9ad97', BASALT = ['#55595e', '#62666b', '#4b4f54'];

/** @type {import('./common.js').Landmark} */
export default {
  name: 'Tháp Nghinh Phong',
  radius: 12,
  build(site) {
    const { world, rng } = site;
    const { batch, site: worldSite } = world;
    const { lampMat, halos, pools } = lamps(world);
    batch.at(site.x, site.y, site.z, site.ry);

    // The square: paved rings, and a walkway to the beach.
    batch.add([
      cyl(11.5, 12, 0.5, STONE, [0, 0.05, 0], {}, 32),
      cyl(7.2, 7.2, 0.52, STONE_DARK, [0, 0.06, 0], {}, 32),
      cyl(6.6, 6.6, 0.54, '#e8e2d4', [0, 0.07, 0], {}, 32),
      box(14, 0.46, 3.2, STONE, [16, 0.03, 0]),
    ]);
    // Basalt columns in a ring round the foot of the tower, rising in a spiral.
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2, r = 3.9 + (i % 2) * 0.55, h = 0.8 + ((i * 7) % 16) * 0.16;
      batch.add(cyl(0.5, 0.5, h, BASALT[i % 3], [Math.cos(a) * r, 0.3 + h / 2, Math.sin(a) * r], {}, 6));
    }
    // The tower: white hexagonal tiers, each turned a little further and a little narrower.
    const led = [];
    let y = 0.6;
    for (let i = 0; i < TIERS; i++) {
      const r = 2.9 - i * 0.14, h = 1.05, ry = i * 0.21;
      batch.add(cyl(r, r * 1.04, h, WHITE, [0, y + h / 2, 0], { ry }, 6));
      y += h;
      led.push(cyl(r * 0.86, r * 0.86, 0.26, '#ffffff', [0, y + 0.13, 0], { ry: ry + 0.1 }, 6));
      y += 0.26;
    }
    batch.add([cone(1.1, 3.2, WHITE, [0, y + 1.6, 0], {}, 6), ball(0.28, '#ffffff', [0, y + 3.35, 0])]);
    const top = y + 3.5;

    // The LED bands: their own material (it glows at night and changes colour — never a shared one).
    const ledMat = new THREE.MeshLambertMaterial({ color: '#dcdcdc', emissive: '#ffffff', emissiveIntensity: 0, flatShading: true });
    const bands = segment(led, ledMat);
    bands.castShadow = false;
    bands.position.set(site.x, site.y, site.z);
    bands.rotation.y = site.ry;
    halos.push(toWorld(site, 0, top, 0));

    // Lamp posts round the square.
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + 0.2, lx = Math.cos(a) * 10, lz = Math.sin(a) * 10;
      batch.add([cyl(0.08, 0.1, 3, '#3b3f45', [lx, 1.75, lz]), box(0.5, 0.08, 0.5, '#2c2f33', [lx, 3.3, lz])]);
      batch.add(ball(0.22, '#fff4d6', [lx, 3.12, lz]), lampMat);
      halos.push(toWorld(site, lx, 3.12, lz));
      pools.push([...toWorld(site, lx, 0.3, lz), 3.2]);
    }

    // People walk round the tower, the camera can't see through it, trees keep off the square.
    worldSite.colliders.push({ x: site.x, z: site.z, r: 4.6 });
    worldSite.solids.push({ x: site.x, z: site.z, r: 3, y0: site.y, y1: site.y + top });
    worldSite.obstacles.push([site.x, site.z, 15]);

    const hue = rng();
    const color = new THREE.Color();
    return {
      spot: above(site, 6),
      view: 3.2,
      system: {
        group: new THREE.Group().add(bands),
        lateUpdate({ lights, t }) {
          ledMat.emissiveIntensity = 0.15 + lights * 1.6;
          ledMat.emissive.copy(color.setHSL((hue + t * 0.02) % 1, lights > 0.2 ? 0.75 : 0.1, 0.6));
        },
      },
    };
  },
};
