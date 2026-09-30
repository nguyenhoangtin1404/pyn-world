import { describe, expect, it } from 'vitest';
import { createProjection } from '../../src/world/geo.js';
import { checkWorldData, decodeHeights, encodeHeights, prepareWorldData } from '../../src/world/geodata.js';
import { createRivers } from '../../src/world/rivers.js';
import { clipToSquare, fractionAlong } from '../../src/worlds/define.js';
import { build, heightGrid } from '../../tools/import/build.mjs';
import { joinLines, osmToVectors } from '../../tools/import/osm.mjs';
import { WATER_Y } from '../../src/config.js';

describe('createProjection', () => {
  const p = createProjection({ center: [13.088, 109.312], metersPerUnit: 9, verticalScale: 3 });

  it('puts the centre at the origin, north at -z and east at +x', () => {
    expect(p.toWorld(13.088, 109.312)).toEqual([0, 0]);
    const [x, z] = p.toWorld(13.088 + 0.01, 109.312 + 0.01);
    expect(z).toBeLessThan(0);
    expect(x).toBeGreaterThan(0);
    // 0.01° of latitude ≈ 1112 m ≈ 124 units at 9 m each.
    expect(-z).toBeCloseTo(1111.95 / 9, 0);
    expect(x).toBeLessThan(-z); // a degree of longitude is shorter this far from the equator
  });

  it('goes back and forth', () => {
    const [lat, lon] = p.toLatLon(...p.toWorld(13.1, 109.3));
    expect(lat).toBeCloseTo(13.1, 9);
    expect(lon).toBeCloseTo(109.3, 9);
  });

  it('scales heights by the vertical exaggeration and lengths by metres per unit', () => {
    expect(p.height(90)).toBe(30);
    expect(p.length(90)).toBe(10);
  });
});

// A tiny made-up place: 2 km across, a hill in the middle, the sea along the east edge, a river
// and a railway — built by the importer from made-up elevation, no network.
const recipe = {
  id: 'tiny', name: 'TINY', center: [10, 106], halfExtent: 1000, size: 200, verticalScale: 2, grid: 21, sea: ['east'],
  rivers: [{ id: 'r', name: 'Sông', width: 200, points: [[9.995, 105.99], [9.995, 106.01]] }],
  rails: [{ id: 'l', name: 'Ray', points: [[10.02, 105.998], [9.98, 105.998]] }],
  places: [{ id: 'ga', name: 'Ga', kind: 'station', at: [10.002, 105.998] }],
};
const fakeElevation = (lat, lon) => (lon > 106.006 ? -3 : 5 + 40 * Math.max(0, 1 - Math.hypot(lat - 10, lon - 106) / 0.004));

describe('importer (tools/import)', () => {
  it('marks the sea from the open edge, and only low ground joined to it', () => {
    const box = { south: 0, west: 0, north: 1, east: 1 };
    // A dip below 0 m inland (west) stays land; the low east edge becomes the sea bed.
    const h = heightGrid(box, 5, (lat, lon) => (lon > 0.7 ? -2 : lon < 0.3 && lat > 0.4 && lat < 0.6 ? -1 : 3), ['east']);
    expect(h[2 * 5 + 4]).toBe(-10);
    expect(h[2 * 5 + 0]).toBe(0);
    expect(h[2 * 5 + 2]).toBe(3);
  });

  it('builds a data file that passes the checks', async () => {
    const data = await build(recipe, { elevationAt: fakeElevation });
    expect(checkWorldData(data)).toEqual([]);
    expect(data.frame.metersPerUnit).toBe(10);
    expect(data.heights.rows).toBe(21);
  });
});

describe('world data', () => {
  it('encodes and decodes heights, negatives included', () => {
    const v = [0, 1, -1, 32767, -32768, 1234, -10];
    expect([...decodeHeights(encodeHeights(v))]).toEqual(v);
  });

  it('says exactly what is wrong with a bad file', () => {
    const errs = checkWorldData({ version: 2, name: 'x', frame: { center: [100, 0], metersPerUnit: 0 }, heights: { south: 1, west: 0, north: 0, east: 1, rows: 2, cols: 2, data: 'AAAA' }, rivers: [{ id: 'r', width: 0, points: [[0, 0]] }], rails: [], places: [{ id: 'p' }] });
    expect(errs.join('\n')).toMatch(/version phải là 1/);
    expect(errs.join('\n')).toMatch(/frame.center/);
    expect(errs.join('\n')).toMatch(/metersPerUnit/);
    expect(errs.join('\n')).toMatch(/north > south/);
    expect(errs.join('\n')).toMatch(/rows × cols/);
    expect(errs.join('\n')).toMatch(/rivers\[0\] \("r"\): points/);
    expect(errs.join('\n')).toMatch(/rivers\[0\] \("r"\): width/);
    expect(errs.join('\n')).toMatch(/places\[0\]/);
    expect(() => prepareWorldData({ name: 'bad' })).toThrow(/Dữ liệu world "bad" sai/);
  });

  it('projects everything into world units: ground, sea, rivers, rails, places', async () => {
    const d = prepareWorldData(await build(recipe, { elevationAt: fakeElevation }));
    expect(d.heightAt(0, 0)).toBeCloseTo(WATER_Y + 0.6 + 9, 1); // the hilltop: 45 m × 2 (exaggerated) / 10 m per unit
    expect(d.heightAt(90, 0)).toBeLessThan(WATER_Y); // the sea bed
    expect(d.heightAt(-90, 60)).toBeCloseTo(WATER_Y + 0.6 + 1, 1); // flat land at 5 m
    expect(d.rivers[0].width).toBe(20);
    expect(d.rails[0].points).toHaveLength(2);
    const [x, z] = d.places.ga.p;
    expect(x).toBeLessThan(0);
    expect(z).toBeLessThan(0);
  });
});

describe('rivers', () => {
  it('for a riverX world: the plain distance to the river, as before', () => {
    const r = createRivers({ riverX: (z) => z * 0.5, riverGLSL: 'g' });
    expect(r.distance(13, 10)).toBe(Math.abs(13 - 5));
    expect(r.glsl).toBe('g');
  });

  it('for polylines: 0–5 inside the river whatever its width, 16 where the bank is up', () => {
    const r = createRivers({ riverX: null, rivers: [{ id: 'a', name: 'a', width: 100, points: [[-200, 0], [200, 0]] }] });
    expect(r.distance(0, 0)).toBe(0);
    expect(r.distance(0, 45)).toBe(5); // 5 in from the edge
    expect(r.distance(0, 56)).toBeCloseTo(16); // 6 out: the bank
    expect(r.distance(0, 500)).toBe(Infinity); // nowhere near
    expect(r.riverX).toBeNull();
  });
});

describe('OpenStreetMap → vectors', () => {
  const way = (id, tags, pts) => ({ type: 'way', id, tags, geometry: pts.map(([lat, lon]) => ({ lat, lon })) });
  it('joins railway pieces, takes river widths and named places', () => {
    const v = osmToVectors({
      elements: [
        way(1, { railway: 'rail' }, [[1, 1], [1, 2]]),
        way(2, { railway: 'rail' }, [[1, 3], [1, 2]]), // drawn the other way
        way(3, { waterway: 'river', name: 'Sông Đà Rằng', width: '800' }, [[0, 0], [0, 5]]),
        way(4, { highway: 'primary' }, [[2, 2], [3, 3]]),
        { type: 'node', id: 9, lat: 1.5, lon: 1.5, tags: { name: 'Tháp Nghinh Phong', tourism: 'attraction' } },
        { type: 'node', id: 8, lat: 1, lon: 2, tags: { railway: 'station', name: 'Ga Tuy Hòa' } },
        { type: 'node', id: 7, lat: 1, lon: 2, tags: { amenity: 'cafe', name: 'Cà phê' } },
      ],
    });
    expect(v.rails).toHaveLength(1);
    expect(v.rails[0].points).toEqual([[1, 1], [1, 2], [1, 3]]);
    expect(v.rivers[0]).toMatchObject({ name: 'Sông Đà Rằng', width: 800 });
    expect(v.places.map((p) => [p.id, p.kind])).toEqual([['thap-nghinh-phong', 'landmark'], ['ga-tuy-hoa', 'station']]);
  });

  it('joinLines leaves apart what does not touch', () => {
    expect(joinLines([[[0, 0], [0, 1]], [[5, 5], [5, 6]]])).toHaveLength(2);
  });
});

describe('placing a map railway on the diorama', () => {
  it('clipToSquare keeps the part inside, cut at the edge', () => {
    const out = clipToSquare([[0, -200], [0, 0], [0, 200]], 100);
    expect(out[0][1]).toBeCloseTo(-100, 3);
    expect(out.at(-1)[1]).toBeCloseTo(100, 3);
    expect(out[1]).toEqual([0, 0]);
  });

  it('fractionAlong finds where a place is along the line', () => {
    expect(fractionAlong([[0, 0], [0, 100]], [5, 25])).toBeCloseTo(0.25);
  });
});
