// @ts-check
import { box, cone, ball, prism } from '../world/lowpoly.js';
import { lamps } from '../features/lamps.js';
import { above, toWorld } from './common.js';

// Tháp Nhạn, on the top of Núi Nhạn: a Cham brick tower (11th–12th century). A square body with
// pilasters and a false door on each side (the real door faces east, local +x), three stepped tiers
// above it with small towers at their corners, and a bulb-shaped top. Lit from below at night.
// About 4× life size.

const BRICK = '#a4583a', BRICK_DARK = '#8a4630', DOOR = '#6e3522', ENTRANCE = '#2e1c14';

// A face's door: an arched niche (false door) or the real entrance, on a body `half` from the middle.
function door(half, y, h, dark) {
  return [box(0.95, h, 0.3, dark, [0, y + h / 2, half + 0.05]), prism(1.25, 0.8, 0.34, BRICK_DARK, [0, y + h, half + 0.06])];
}

// The four sides: the same parts turned a quarter at a time.
function allSides(make) {
  const parts = [];
  for (let k = 0; k < 4; k++) for (const g of make(k)) parts.push(g.rotateY((k * Math.PI) / 2));
  return parts;
}

/** @type {import('./common.js').Landmark} */
export default {
  name: 'Tháp Nhạn',
  radius: 5,
  build(site) {
    const { world } = site;
    const { batch, site: worldSite } = world;
    const { halos, pools } = lamps(world);
    batch.at(site.x, site.y, site.z, site.ry);
    const parts = [
      box(4.4, 0.7, 4.4, BRICK_DARK, [0, 0.1, 0]), // plinth (sunk a little into the ground)
      box(3.2, 4.3, 3.2, BRICK, [0, 2.6, 0]), // body
      box(3.7, 0.35, 3.7, BRICK_DARK, [0, 4.9, 0]), // cornice
      box(2.5, 1.4, 2.5, BRICK, [0, 5.75, 0]), // tiers
      box(2.8, 0.25, 2.8, BRICK_DARK, [0, 6.55, 0]),
      box(1.85, 1.1, 1.85, BRICK, [0, 7.2, 0]),
      box(2.1, 0.22, 2.1, BRICK_DARK, [0, 7.85, 0]),
      box(1.25, 0.8, 1.25, BRICK, [0, 8.35, 0]),
      ball(0.62, BRICK, [0, 9.2, 0], { sy: 1.25 }), // the top
      cone(0.16, 0.6, BRICK_DARK, [0, 10.1, 0]),
    ];
    // Pilasters, doors (the real one east: +x after the turn below), and corner towers per tier.
    parts.push(
      ...allSides((k) => [
        box(0.34, 4.1, 0.22, BRICK_DARK, [-1.2, 2.55, 1.62]),
        box(0.34, 4.1, 0.22, BRICK_DARK, [1.2, 2.55, 1.62]),
        ...door(1.6, 0.45, 2.3, k === 1 ? ENTRANCE : DOOR),
        cone(0.26, 0.8, BRICK, [1.55, 5.45, 1.55], {}, 4),
        cone(0.2, 0.6, BRICK, [1.1, 7.0, 1.1], {}, 4),
        cone(0.15, 0.45, BRICK, [0.8, 8.2, 0.8], {}, 4),
      ]),
    );
    batch.add(parts);

    // Floodlit at night: pools of light at its foot and a glow on it.
    for (const [lx, lz] of [[3, 0], [-3, 0], [0, 3], [0, -3]]) pools.push([...toWorld(site, lx, 0.3, lz), 3]);
    halos.push(toWorld(site, 0, 5, 0));

    worldSite.colliders.push({ x: site.x, z: site.z, r: 2.6 });
    worldSite.solids.push({ x: site.x, z: site.z, r: 2, y0: site.y, y1: site.y + 10 });
    worldSite.obstacles.push([site.x, site.z, 8]);
    return { spot: above(site, 4), view: 2.2 };
  },
};
