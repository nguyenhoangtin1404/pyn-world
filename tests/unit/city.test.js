import { describe, expect, it } from 'vitest';
import { checkWorldData, encodeBuildings, prepareWorldData, seaDistances, SEA_BED } from '../../src/world/geodata.js';
import { builtUp, createLandCover } from '../../src/world/landcover.js';
import { createRivers } from '../../src/world/rivers.js';
import { Site } from '../../src/world/site.js';
import { likelyFloors } from '../../src/features/buildings.js';
import { build, checkPlaces, despike, growSea, heightGrid, inWater, smoothCoast, smoothLand } from '../../tools/import/build.mjs';
import { columns } from '../../src/landmarks/nghinh-phong.js';
import { clipToBox, footprintRect, joinLines, osmToVectors, simplify } from '../../tools/import/osm.mjs';

// Phase 2 of worlds from map data: streets, buildings and water areas from OpenStreetMap / Overture.

const way = (id, tags, pts) => ({ type: 'way', id, tags, geometry: pts.map(([lat, lon]) => ({ lat, lon })) });
const M = 111195; // metres per degree of latitude (and of longitude at the equator)

describe('importer geometry (tools/import/osm.mjs)', () => {
  it('finds the rectangle round a turned footprint: centre, length, width, direction', () => {
    // 20 m × 8 m, its length 30° from east towards north, round (0, 0) at the equator.
    const a = (30 * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
    const corner = (u, v) => [(u * 10 * s + v * 4 * c) / M, (u * 10 * c - v * 4 * s) / M]; // [lat, lon]
    const ring = [corner(-1, -1), corner(1, -1), corner(1, 1), corner(-1, 1), corner(-1, -1)];
    const r = footprintRect(ring);
    expect(r.length).toBeCloseTo(20, 1);
    expect(r.width).toBeCloseTo(8, 1);
    expect(r.angle).toBeCloseTo(30, 0);
    expect(Math.abs(r.at[0]) * M).toBeLessThan(0.2);
    expect(Math.abs(r.at[1]) * M).toBeLessThan(0.2);
  });

  it('clips lines to the box: every stretch inside, cut at the edges', () => {
    const box = { south: 0, west: 0, north: 1, east: 1 };
    expect(clipToBox([[0.5, -1], [0.5, 2]], box)).toEqual([[[0.5, 0], [0.5, 1]]]); // right through
    const out = clipToBox([[0.2, 0.5], [0.2, 1.5], [0.8, 1.5], [0.8, 0.5]], box); // out and back in
    expect(out).toHaveLength(2);
    expect(out[0]).toEqual([[0.2, 0.5], [0.2, 1]]);
    expect(out[1]).toEqual([[0.8, 1], [0.8, 0.5]]);
  });

  it('simplifies away points on the line, keeps the corners', () => {
    const pts = [[0, 0], [0, 0.001], [0, 0.002], [0.001, 0.002]];
    expect(simplify(pts, 1)).toEqual([[0, 0], [0, 0.002], [0.001, 0.002]]);
  });

  it('joins thousands of pieces into one line quickly', () => {
    const pieces = Array.from({ length: 3000 }, (_, i) => (i % 2 ? [[0, i + 1], [0, i]] : [[0, i], [0, i + 1]]));
    pieces.reverse();
    const t = performance.now();
    const out = joinLines(pieces);
    expect(performance.now() - t).toBeLessThan(500);
    expect(out).toHaveLength(1);
    expect(out[0]).toHaveLength(3001);
  });
});

describe('OpenStreetMap / Overture → streets, buildings, water', () => {
  const box = { south: 0, west: 0, north: 0.01, east: 0.01 };
  const square = (lat, lon, m) => [[lat, lon], [lat, lon + m / M], [lat + m / M, lon + m / M], [lat + m / M, lon], [lat, lon]];
  const v = osmToVectors({
    elements: [
      way(1, { highway: 'residential', name: 'Lê Lợi' }, [[0.002, 0.001], [0.002, 0.003]]),
      way(2, { highway: 'residential', name: 'Lê Lợi' }, [[0.002, 0.005], [0.002, 0.003]]),
      way(3, { highway: 'footway' }, [[0.003, 0.001], [0.003, 0.002]]),
      way(4, { highway: 'primary' }, [[0.005, -0.01], [0.005, 0.02]]), // runs off both sides
      way(5, { building: 'yes', 'building:levels': '4' }, square(0.004, 0.004, 12)),
      way(6, { building: 'school' }, square(0.006, 0.006, 30)),
      way(7, { building: 'yes' }, square(0.007, 0.007, 2)), // a 2 m hut: left out
      way(8, { building: 'yes' }, square(0.02, 0.02, 12)), // outside the box
      way(9, { railway: 'rail', name: 'Đường sắt Bắc–Nam' }, [[-0.01, 0.008], [0.02, 0.008]]),
      {
        type: 'relation', id: 10, tags: { type: 'multipolygon', natural: 'water', water: 'river', name: 'Sông' },
        members: [
          { type: 'way', role: 'outer', geometry: square(0.001, 0.001, 600).map(([lat, lon]) => ({ lat, lon })) },
          { type: 'way', role: 'inner', geometry: square(0.003, 0.003, 100).map(([lat, lon]) => ({ lat, lon })) },
        ],
      },
    ],
  }, { box });

  it('keeps roads by kind, joins the pieces of a street, leaves footways out, clips to the box', () => {
    expect(v.roads.map((r) => r.kind).sort()).toEqual(['primary', 'residential']);
    const leLoi = v.roads.find((r) => r.name === 'Lê Lợi');
    expect(leLoi.points).toEqual([[0.002, 0.001], [0.002, 0.005]]); // joined, and the middle point simplified away
    const main = v.roads.find((r) => r.kind === 'primary');
    expect(main.points[0][1]).toBe(0);
    expect(main.points.at(-1)[1]).toBe(0.01);
  });

  it('keeps buildings as rectangles with their floors and kind, not huts or those outside', () => {
    expect(v.buildings).toHaveLength(2);
    const [house, school] = v.buildings;
    expect(house).toMatchObject({ floors: 4, kind: 'house' });
    expect(house.length).toBeCloseTo(12, 0);
    expect(school).toMatchObject({ floors: 0, kind: 'school' });
  });

  it('names railways after their tag, and takes water areas with their islands', () => {
    expect(v.rails.map((r) => r.id)).toEqual(['duong-sat-bac-nam']);
    expect(v.water).toHaveLength(1);
    const [river] = v.water;
    expect(inWater(river, 0.002, 0.002)).toBe(true);
    expect(inWater(river, 0.0035, 0.0035)).toBe(false); // on the island
    expect(inWater(river, 0.009, 0.009)).toBe(false); // outside
  });
});

describe('buildings in a data file', () => {
  it('go through the Int16 fields and come back in world units', () => {
    const center = [10, 106];
    const list = [
      { at: [10 + 90 / M, 106], length: 18, width: 9, angle: 30, floors: 3, kind: 'school' },
      { at: [10, 106 - 45 / (M * Math.cos((10 * Math.PI) / 180))], length: 9, width: 4.5, angle: 170, kind: 'house' },
    ];
    const buildings = encodeBuildings(list, center);
    expect(buildings.count).toBe(2);
    const d = prepareWorldData({
      version: 1, name: 'T', frame: { center, metersPerUnit: 9 },
      heights: { south: 9.99, west: 105.99, north: 10.01, east: 106.01, rows: 2, cols: 2, data: 'AAAAAAAAAAA=' },
      rivers: [], rails: [], places: [], roads: [{ kind: 'primary', points: [[10, 106], [10.001, 106]] }], buildings,
    });
    const [a, b] = d.buildings;
    expect(a.x).toBeCloseTo(0, 2);
    expect(a.z).toBeCloseTo(-10, 2); // 90 m north
    expect(a).toMatchObject({ floors: 3, kind: 'school' });
    expect(a.length).toBeCloseTo(2, 2);
    expect(a.width).toBeCloseTo(1, 2);
    expect(a.angle).toBeCloseTo(Math.PI / 6, 3);
    expect(b.x).toBeCloseTo(-5, 2); // 45 m west
    expect(b).toMatchObject({ floors: 0, kind: 'house' });
    expect(b.angle).toBeCloseTo((170 * Math.PI) / 180, 3);
    expect(d.roads[0]).toMatchObject({ kind: 'primary', name: '' });
    expect(d.roads[0].width).toBeCloseTo(16 / 9);
  });

  it('are checked: unknown road kinds, a wrong number of values', () => {
    const d = {
      version: 1, name: 'T', frame: { center: [10, 106], metersPerUnit: 9 },
      heights: { south: 9.99, west: 105.99, north: 10.01, east: 106.01, rows: 2, cols: 2, data: 'AAAAAAAAAAA=' },
      rivers: [], rails: [], places: [],
      roads: [{ kind: 'highway_to_hell', points: [[10, 106], [10.001, 106]] }],
      buildings: { count: 2, data: 'AAAA' },
    };
    const errs = checkWorldData(d).join('\n');
    expect(errs).toMatch(/roads\[0\]: kind phải là một trong/);
    expect(errs).toMatch(/buildings.data phải có đúng count × 7 = 14 số Int16/);
  });
});

describe('water areas in the ground (tools/import/build.mjs)', () => {
  it('sinks the ground inside rivers and lakes (not their islands), apart from the sea', () => {
    const box = { south: 0, west: 0, north: 1, east: 1 };
    const lake = { outer: [[[0.1, 0.1], [0.1, 0.5], [0.9, 0.5], [0.9, 0.1], [0.1, 0.1]]], inner: [[[0.4, 0.2], [0.4, 0.4], [0.6, 0.4], [0.6, 0.2], [0.4, 0.2]]] };
    const h = heightGrid(box, 11, (lat, lon) => (lon > 0.85 ? -2 : 3), ['east'], [lake]);
    const at = (lat, lon) => h[Math.round((1 - lat) * 10) * 11 + Math.round(lon * 10)];
    expect(at(0.2, 0.2)).toBe(-4); // lake
    expect(at(0.5, 0.3)).toBe(3); // island
    expect(at(0.5, 1)).toBe(SEA_BED); // sea
    expect(at(0.5, 0.7)).toBe(3); // land
    // The coast is the sea's: a lake is no beach.
    const d = seaDistances(h, 11, 11, 100);
    expect(d[5 * 11 + 2]).toBeGreaterThan(500);
  });

  it('with a map extract: streets and buildings, the water areas instead of the hand-drawn river', async () => {
    const recipe = {
      id: 'tiny', name: 'TINY', center: [10, 106], halfExtent: 1000, size: 200, grid: 21, sea: ['east'],
      rivers: [{ id: 'r', name: 'Sông', width: 200, points: [[9.995, 105.99], [9.995, 106.01]] }],
      rails: [{ id: 'hand', name: 'Ray', points: [[10.02, 105.998], [9.98, 105.998]] }],
      places: [{ id: 'ga', name: 'Ga', kind: 'station', at: [10.002, 105.998] }],
    };
    const osm = {
      generator: 'test',
      elements: [
        way(1, { highway: 'tertiary' }, [[10.001, 105.995], [10.001, 106.003]]),
        way(2, { building: 'yes' }, [[10.003, 106], [10.003, 106.0002], [10.0032, 106.0002], [10.0032, 106], [10.003, 106]]),
        way(3, { natural: 'water', water: 'lake' }, [[9.996, 105.995], [9.996, 105.997], [9.998, 105.997], [9.998, 105.995], [9.996, 105.995]]),
      ],
    };
    const data = await build(recipe, { osm, elevationAt: () => 5 });
    expect(checkWorldData(data)).toEqual([]);
    expect(data.rivers).toEqual([]); // the lake is in the heights
    expect(data.rails.map((r) => r.id)).toEqual(['hand']); // the extract has none: the recipe's
    expect(data.roads).toHaveLength(1);
    expect(data.buildings.count).toBe(1);
    expect(data.sources.map).toMatch(/OpenStreetMap/);
  });
});

describe('the town from the buildings (world/landcover.js)', () => {
  it('is where the roofs stand close, not round a lone house', () => {
    const town = [];
    for (let i = 0; i < 12; i++) for (let j = 0; j < 12; j++) town.push({ x: i * 1.5, z: j * 1.5, length: 1, width: 0.8 });
    const built = builtUp([...town, { x: 200, z: 200, length: 1, width: 1 }], 600);
    expect(built(8, 8)).toBe(true);
    expect(built(200, 200)).toBe(false);
    expect(built(-100, 0)).toBe(false);
    const cover = createLandCover({ elevationAt: () => 5, seaDistanceAt: () => Infinity }, { buildings: town, size: 600 });
    expect(cover(8, 8)).toBe('town');
    expect(cover(-100, 0)).toBe('field');
  });
});

describe('claimed ground (Site)', () => {
  const cfg = { size: 600, riverX: () => 250 };
  const site = new Site({ cfg, track: { distanceTo: () => 100 }, heightAt: () => 1, tunnel: null, yards: [], rivers: createRivers(cfg) });

  it('takes a turned rectangle, grown by the margin, and nothing is put there', () => {
    expect(site.claimed(0, 0)).toBe(false);
    site.claimRect(0, 0, 10, 2, Math.PI / 4, 0.5); // length along (1, -1)/√2
    expect(site.claimed(3, -3)).toBe(true);
    expect(site.claimed(3, 3)).toBe(false);
    expect(site.claimed(0.7, 0.7)).toBe(true); // inside the margin (half width 1 + 0.5)
    expect(site.spotOK(3, -3)).toBeNull();
    expect(site.spotOK(20, 20)).toBe(1);
  });
});

describe('floors a building likely has', () => {
  it('town houses 1–4, big sheds low, schools 2–3', () => {
    let seed = 1;
    const rng = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 200; i++) {
      const house = likelyFloors('house', 60, rng);
      expect(house).toBeGreaterThanOrEqual(1);
      expect(house).toBeLessThanOrEqual(4);
      expect(likelyFloors('house', 2000, rng)).toBeLessThanOrEqual(2);
      expect([2, 3]).toContain(likelyFloors('school', 900, rng));
    }
  });
});


describe('hand-placed places against the map (checkPlaces)', () => {
  const osm = {
    elements: [
      { type: 'node', id: 1, lat: 13.11632, lon: 109.30756, tags: { name: 'Tháp Nghinh Phong Tuy Hòa' } },
      { type: 'node', id: 2, lat: 13.10532, lon: 109.31508, tags: { name: 'Tháp Nghinh Phong - Phú Yên' } }, // a shop, further off
      { type: 'node', id: 3, lat: 13.08226, lon: 109.30162, tags: { name: 'Tháp Nhạn Phú Yên' } },
    ],
  };
  it('says which places are off the map’s, by how much and where, by name or part of it', () => {
    const out = checkPlaces([
      { id: 'np', name: 'Tháp Nghinh Phong', at: [13.0917, 109.3262] }, // where it was first put: ~3 km off
      { id: 'tn', name: 'Núi Nhạn – Tháp Nhạn', at: [13.0823, 109.3018] }, // right
      { id: 'x', name: 'Đồi Không Tên', at: [13.1, 109.3] },
    ], osm);
    expect(out).toHaveLength(2);
    expect(out[0]).toMatch(/"np".*Tháp Nghinh Phong - Phú Yên/); // the nearest same-named one
    expect(out[1]).toMatch(/"x".*không có/);
    expect(checkPlaces([{ id: 'np', name: 'Tháp Nghinh Phong', at: [13.1163, 109.3076] }], osm)).toEqual([]);
  });
});

describe('elevation spikes (despike)', () => {
  it('brings down a lone spike, two points wide too, and leaves a real summit', () => {
    const n = 9;
    const h = new Int16Array(n * n).fill(4);
    h[2 * n + 2] = 65; // a glitch…
    h[2 * n + 3] = 33; // …and its shoulder
    // A hill: summit 57 with neighbours close below it.
    for (const [r, c, v] of [[6, 6, 57], [5, 6, 50], [7, 6, 48], [6, 5, 49], [6, 7, 51], [5, 5, 45], [7, 7, 44], [5, 7, 46], [7, 5, 43]]) h[r * n + c] = v;
    despike(h, n);
    expect(h[2 * n + 2]).toBe(4);
    expect(h[2 * n + 3]).toBe(4);
    expect(h[6 * n + 6]).toBe(57);
  });
  it('on a grid finer than the elevation samples: a spike repeated over a block of points', () => {
    const n = 11;
    const h = new Int16Array(n * n).fill(4);
    for (const [r, c] of [[4, 4], [4, 5], [5, 4], [5, 5]]) h[r * n + c] = 72; // one sample, 2 × 2 points
    const once = Int16Array.from(h);
    despike(once, n); // (each point has a neighbour as high: not a spike, seen one point away)
    expect(once[4 * n + 4]).toBe(72);
    despike(h, n, 2);
    for (const [r, c] of [[4, 4], [4, 5], [5, 4], [5, 5]]) expect(h[r * n + c]).toBe(4);
  });
});

describe('smoother land (smoothLand)', () => {
  it('irons out the bumps on land and leaves the sea and the shore where they are', () => {
    const n = 12;
    const h = new Int16Array(n * n);
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) h[r * n + c] = c >= 9 ? -10 : 4 + ((r + c) % 2) * 6; // bumpy land, sea east
    smoothLand(h, n, 2);
    for (let r = 2; r < n - 2; r++) for (let c = 2; c < 7; c++) expect(Math.abs(h[r * n + c] - 7)).toBeLessThanOrEqual(1);
    for (let r = 0; r < n; r++) for (let c = 9; c < n; c++) expect(h[r * n + c]).toBe(-10); // the sea as it was
    for (let r = 0; r < n; r++) expect(h[r * n + 8]).toBeGreaterThanOrEqual(4); // the shore not pulled under
  });
});

describe('a smooth shore (smoothCoast)', () => {
  it('rounds the staircase of a diagonal shore into a slope, and leaves land and sea away from it', () => {
    const n = 16;
    const h = new Int16Array(n * n);
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) h[r * n + c] = c > r ? -10 : 2; // sea above the diagonal, stepwise
    smoothCoast(h, n, 2);
    // Across the shore the ground shelves down in steps of a few metres, not 12 at once.
    for (let c = 4; c < 12; c++) expect(Math.abs(h[8 * n + c + 1] - h[8 * n + c])).toBeLessThan(6);
    expect(h[8 * n + 0]).toBe(2); // land well inland
    expect(h[0 * n + 15]).toBe(-10); // sea well out
  });
});

describe('the shore brought in (growSea)', () => {
  it('moves the edge of the sea inland by as many points, keeping its shape', () => {
    const n = 10;
    const sea = new Uint8Array(n * n);
    for (let r = 0; r < n; r++) for (let c = 7; c < n; c++) sea[r * n + c] = 1; // sea east of column 7
    growSea(sea, n, 3);
    for (let r = 0; r < n; r++) {
      expect(sea[r * n + 4]).toBe(1); // 3 points in
      expect(sea[r * n + 3]).toBe(0);
    }
  });
});

describe('Tháp Nghinh Phong (columns)', () => {
  it('two towers of 50 hexagonal columns in a wedge: a low prow at the front, rising row by row to spires of 35 m and 30 m', () => {
    const cols = columns();
    for (const side of [1, -1]) expect(cols.filter((c) => c.side === side)).toHaveLength(50);
    const spires = cols.filter((c) => c.spire);
    expect(spires.map((c) => c.h).sort((a, b) => b - a)).toEqual([35, 30]);
    expect(spires.find((c) => c.h === 30).side).toBe(1); // the lower on the right, seen from the land
    for (const c of spires) expect(c.j).toBe(0); // at the slot
    for (const s of spires) {
      const half = cols.filter((c) => c.side === s.side);
      const rest = half.filter((c) => !c.spire);
      expect(Math.max(...rest.map((c) => c.h))).toBeLessThan(s.h * 0.75); // each spire stands clear
      const row = (i) => half.filter((c) => c.i === i);
      // The prow: the front row narrow and low; every row further back wider, and higher at the slot.
      expect(row(0).length).toBeLessThan(row(5).length);
      for (let i = 1; i < 6; i++) {
        expect(row(i).length).toBeGreaterThanOrEqual(row(i - 1).length);
        expect(Math.max(...row(i).map((c) => c.h))).toBeGreaterThan(Math.max(...row(i - 1).map((c) => c.h)));
      }
      expect(Math.max(...row(0).map((c) => c.h))).toBeLessThan(s.h * 0.2); // the nose at ground level
      const mean = (j) => half.filter((c) => c.j === j && !c.spire).reduce((t, c) => t + c.h, 0) / half.filter((c) => c.j === j && !c.spire).length;
      expect(mean(0)).toBeGreaterThan(mean(4)); // stepping down away from the slot
    }
    expect(new Set(cols.map((c) => c.i)).size).toBe(6); // 6 columns of 2.5 m: the slot's 15 m
  });
});
