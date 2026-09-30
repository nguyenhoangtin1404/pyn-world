import { describe, expect, it } from 'vitest';
import { CARRIAGEWAY, CROSSWALK, SIDEWALK, WalkMap } from '../../src/world/roads/walkmap.js';
import { OpenPath } from '../../src/world/vehicles/path.js';
import { NavGrid } from '../../src/world/nav.js';

// A road along x = 0 (z from -20 to 20), 5 wide, sidewalks either side, a crosswalk at z = 0.
const road = new OpenPath([[0, -20], [0, 20]]);
function street() {
  const map = new WalkMap({ minX: -10, minZ: -22, maxX: 10, maxZ: 22 });
  map.strip(road, 0, 40, -2.5, 2.5, CARRIAGEWAY);
  map.strip(road, 0, 40, 2.5, 4.1, SIDEWALK);
  map.strip(road, 0, 40, -4.1, -2.5, SIDEWALK);
  map.strip(road, 18.2, 21.8, -2.5, 2.5, CROSSWALK, 0);
  return map;
}

describe('WalkMap', () => {
  it('knows sidewalk, carriageway and crosswalk apart', () => {
    const map = street();
    expect(map.at(0, 10)).toBe(CARRIAGEWAY);
    expect(map.at(3.3, 10)).toBe(SIDEWALK);
    expect(map.at(-3.3, -10)).toBe(SIDEWALK);
    expect(map.at(8, 0)).toBe(0);
    expect(map.at(0, 0)).toBe(CROSSWALK); // wins over the carriageway under it
    expect(map.crossingAt(1, 0.5)).toBe(0);
    expect(map.crossingAt(1, 10)).toBe(-1);
    expect(map.at(100, 100)).toBe(0); // outside: nothing
  });
});

describe('NavGrid by a road', () => {
  const map = street();
  const site = {
    walkMaps: [map],
    crossings: [{ walk: () => false }],
    roadAt: (x, z) => map.at(x, z),
    crossingAt: (x, z) => map.crossingAt(x, z),
  };
  const nav = new NavGrid({ minX: -10, minZ: -22, maxX: 10, maxZ: 22 }, () => 0, [], { site });

  it('keeps people off the carriageway but lets them over the crosswalk', () => {
    expect(nav.isFree(0, 10)).toBe(false);
    expect(nav.isFree(6, 10)).toBe(true);
    expect(nav.crossingAt(0, 0)).toBe(0);
    const path = nav.findPath({ x: 6, z: 12 }, { x: -6, z: 12 });
    expect(path).not.toBeNull();
    // It goes round by the crosswalk: every point on the road side is on it.
    const pts = [{ x: 6, z: 12 }, ...path];
    for (let i = 1; i < pts.length; i++) {
      for (let t = 0; t <= 1; t += 0.05) {
        const x = pts[i - 1].x + (pts[i].x - pts[i - 1].x) * t, z = pts[i - 1].z + (pts[i].z - pts[i - 1].z) * t;
        if (map.at(x, z) === CARRIAGEWAY) throw new Error(`walks on the road at ${x.toFixed(1)}, ${z.toFixed(1)}`);
      }
    }
  });
});
