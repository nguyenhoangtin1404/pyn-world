// Makes a world data file (src/worlds/data/<id>.json, format in src/world/geodata.js) from:
// - a recipe (tools/import/<id>.vectors.json): the place's centre and extent, the diorama's size,
//   how much to exaggerate heights, which map edges are open sea, and the rivers, railways and
//   named places — traced by hand, or
// - an OpenStreetMap extract (--osm file.json, Overpass JSON with `out geom`, or the same from
//   Overture Maps by tools/import/overture.py) for the railways, streets and buildings — and the
//   rivers and places too, where it has them (the recipe's are kept where it hasn't, the recipe's
//   places win over the extract's of the same id)
// - SRTM elevation for the ground (downloaded into .cache/dem the first time).
//
//   node tools/import/build.mjs tools/import/tuyhoa.vectors.json [--osm osm.json] [--out file]
//
// The sea: grid points at or below 0 m joined to an open-sea edge get -10 m (the sea bed), so the
// coast is wherever the land really meets the water. Rivers and lakes that the map has as areas:
// the grid points inside get -4 m (a river bed) — the ground itself then shows where the water
// is, islands and all, and the recipe's hand-traced rivers are left out.
import { readFileSync, writeFileSync } from 'node:fs';
import { elevation } from './srtm.mjs';
import { osmToVectors } from './osm.mjs';
import { checkWorldData, encodeBuildings, encodeHeights, DATA_VERSION, SEA_BED, WATER_BED } from '../../src/world/geodata.js';


/**
 * Is [lat, lon] in a water area (inside an outer ring, not in an island)? Even–odd rule.
 * @param {{ outer: [number, number][][], inner: [number, number][][] }} w @param {number} lat @param {number} lon
 */
export function inWater(w, lat, lon) {
  const inside = (/** @type {[number, number][]} */ ring) => {
    let c = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [ay, ax] = ring[i], [by, bx] = ring[j];
      if (ay > lat !== by > lat && lon < ((bx - ax) * (lat - ay)) / (by - ay) + ax) c = !c;
    }
    return c;
  };
  return w.outer.some(inside) && !w.inner.some(inside);
}
const EARTH = 6371008.8, RAD = Math.PI / 180;

const SPIKE = 12; // metres above every neighbour: not a hill, a glitch (or a tower block the radar saw)

/**
 * Spikes in the elevation (a sample or a small cluster of them far above the ground around — radar
 * noise, a block of tall buildings) brought down to the middle of what is around. A point is one
 * if it stands SPIKE above all but the highest point of the ring round it (so a neighbouring spike
 * sample can't hide it); again until nothing changes, for clusters. A real summit or ridge always
 * has ground nearly as high on two sides, so it stays. `reach`: grid points to an elevation sample
 * (a grid finer than SRTM's 30 m repeats each sample over a block of points: the points `reach`
 * away are the ones round the block).
 * @param {Int16Array} h n × n metres @param {number} n @param {number} [reach]
 */
export function despike(h, n, reach = 1) {
  const R = reach;
  for (let pass = 0; pass < 4; pass++) {
    const src = Int16Array.from(h);
    let changed = false;
    for (let r = R; r < n - R; r++) {
      for (let c = R; c < n - R; c++) {
        const around = []; // the ring R away
        for (let dr = -R; dr <= R; dr++) for (let dc = -R; dc <= R; dc++) if (Math.max(Math.abs(dr), Math.abs(dc)) === R) around.push(src[(r + dr) * n + c + dc]);
        around.sort((a, b) => a - b);
        if (src[r * n + c] > around[around.length - 2] + SPIKE) {
          h[r * n + c] = around[around.length >> 1];
          changed = true;
        }
      }
    }
    if (!changed) break;
  }
}

/**
 * Smoother land: each point of dry land (≥ 0 m) the mean of the dry land within `radius` points of
 * it, `passes` times over (a box blur, rounder each pass). The sea and the water areas stay as they
 * are, and don't pull the shore down.
 * @param {Int16Array} h n × n metres @param {number} n @param {number} radius @param {number} [passes]
 */
export function smoothLand(h, n, radius, passes = 2) {
  for (let pass = 0; pass < passes; pass++) {
    const src = Int16Array.from(h);
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        if (src[r * n + c] < 0) continue;
        let sum = 0, count = 0;
        for (let dr = -radius; dr <= radius; dr++) {
          for (let dc = -radius; dc <= radius; dc++) {
            const rr = r + dr, cc = c + dc;
            if (rr < 0 || rr >= n || cc < 0 || cc >= n || src[rr * n + cc] < 0) continue;
            sum += src[rr * n + cc];
            count++;
          }
        }
        h[r * n + c] = Math.round(sum / count);
      }
    }
  }
}

/**
 * A smooth shore: the sea is marked point by point, so its edge steps along the grid (a staircase
 * of 20–30 m steps). Where land and sea are both within `radius` points, the ground is the mean of
 * what is round it (`passes` box blurs): the waterline then runs along a smooth curve, the beach
 * shelving into the sea. Rivers and lakes (WATER_BED) are left as they are.
 * @param {Int16Array} h n × n metres @param {number} n @param {number} radius @param {number} [passes]
 */
export function smoothCoast(h, n, radius, passes = 2) {
  const band = new Uint8Array(n * n);
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      let sea = false, land = false;
      for (let dr = -radius; dr <= radius; dr++) {
        for (let dc = -radius; dc <= radius; dc++) {
          const rr = r + dr, cc = c + dc;
          if (rr < 0 || rr >= n || cc < 0 || cc >= n) continue;
          const v = h[rr * n + cc];
          if (v <= SEA_BED) sea = true;
          else if (v >= 0) land = true;
        }
      }
      band[r * n + c] = sea && land && h[r * n + c] !== WATER_BED ? 1 : 0;
    }
  }
  for (let pass = 0; pass < passes; pass++) {
    const src = Int16Array.from(h);
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        if (!band[r * n + c]) continue;
        let sum = 0, count = 0;
        for (let dr = -radius; dr <= radius; dr++) {
          for (let dc = -radius; dc <= radius; dc++) {
            const rr = r + dr, cc = c + dc;
            if (rr < 0 || rr >= n || cc < 0 || cc >= n || src[rr * n + cc] === WATER_BED) continue;
            sum += src[rr * n + cc];
            count++;
          }
        }
        h[r * n + c] = Math.round(sum / count);
      }
    }
  }
}

/**
 * The sea further inland by `points` grid points (Euclidean): SRTM counts a beach's dunes and the
 * sand behind them as land, so its shore can lie well out to sea from the real one — a town's
 * landmark "on the beach" hundreds of metres from the water. The shore keeps its shape.
 * @param {Uint8Array} sea n × n, 1 for the sea (changed in place) @param {number} n @param {number} points
 */
export function growSea(sea, n, points) {
  const src = Uint8Array.from(sea), R = Math.ceil(points);
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (src[r * n + c]) continue;
      for (let dr = -R; dr <= R && !sea[r * n + c]; dr++) {
        for (let dc = -R; dc <= R; dc++) {
          const rr = r + dr, cc = c + dc;
          if (rr < 0 || rr >= n || cc < 0 || cc >= n || !src[rr * n + cc] || dr * dr + dc * dc > points * points) continue;
          sea[r * n + c] = 1;
          break;
        }
      }
    }
  }
}

/** The grid of metres (row 0 = north) with the sea marked, from any elevation(lat, lon). */
export function heightGrid({ south, west, north, east }, n, elevationAt, seaEdges = [], water = [], reach = 1, smooth = 0, coast = 0, grow = 0) {
  const h = new Int16Array(n * n);
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) h[r * n + c] = Math.round(elevationAt(north - ((north - south) * r) / (n - 1), west + ((east - west) * c) / (n - 1)));
  }
  despike(h, n, reach);
  // Flood the sea in from the open edges, over everything at or below 0 m.
  const sea = new Uint8Array(n * n);
  const stack = [];
  const edge = { north: (i) => i, south: (i) => (n - 1) * n + i, west: (i) => i * n, east: (i) => i * n + n - 1 };
  for (const e of seaEdges) for (let i = 0; i < n; i++) stack.push(edge[e](i));
  while (stack.length) {
    const k = stack.pop();
    if (sea[k] || h[k] > 0) continue;
    sea[k] = 1;
    const r = Math.floor(k / n), c = k % n;
    if (r > 0) stack.push(k - n);
    if (r < n - 1) stack.push(k + n);
    if (c > 0) stack.push(k - 1);
    if (c < n - 1) stack.push(k + 1);
  }
  if (grow > 0) growSea(sea, n, grow);
  for (let k = 0; k < n * n; k++) h[k] = sea[k] ? SEA_BED : Math.max(0, h[k]); // dry land below 0: bad data
  if (water.length) {
    for (let r = 0; r < n; r++) {
      const lat = north - ((north - south) * r) / (n - 1);
      for (let c = 0; c < n; c++) {
        const k = r * n + c;
        if (!sea[k] && water.some((w) => inWater(w, lat, west + ((east - west) * c) / (n - 1)))) h[k] = WATER_BED;
      }
    }
  }
  if (smooth > 0) smoothLand(h, n, smooth);
  if (coast > 0) smoothCoast(h, n, coast);
  return h;
}

const EARTH_M = (a, b) => Math.hypot((a[0] - b[0]) * EARTH * RAD, (a[1] - b[1]) * EARTH * RAD * Math.cos(a[0] * RAD));
const plain = (/** @type {string} */ s) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/gi, 'd').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/**
 * The recipe's hand-placed places against the map's named places: for each one whose name (or a
 * part of it, "Núi Nhạn – Tháp Nhạn") the map has, how far off the nearest of those is — a line
 * for each more than `tolerance` metres off (or not on the map at all).
 * @param {{ id: string, name: string, at: [number, number] }[]} places
 * @param {{ elements?: any[] }} osm
 */
export function checkPlaces(places, osm, tolerance = 200) {
  const named = (osm.elements ?? []).filter((e) => e.type === 'node' && e.tags?.name).map((e) => ({ name: e.tags.name, key: plain(e.tags.name), at: [e.lat, e.lon] }));
  const out = [];
  for (const p of places) {
    const parts = p.name.split(/\s[–-]\s/).map(plain).filter(Boolean);
    const same = named.filter((n) => parts.some((q) => n.key.includes(q)));
    if (!same.length) {
      out.push(`"${p.id}" (${p.name}): bản đồ không có nơi nào tên như vậy`);
      continue;
    }
    const best = same.map((n) => ({ ...n, d: EARTH_M(p.at, n.at) })).sort((a, b) => a.d - b.d)[0];
    if (best.d > tolerance) out.push(`"${p.id}" (${p.name}) cách "${best.name}" trên bản đồ ${Math.round(best.d)} m — ở [${best.at.map((v) => v.toFixed(5)).join(', ')}]`);
  }
  return out;
}

export async function build(recipe, { osm = null, demDir = '.cache/dem', elevationAt = null } = {}) {
  const [lat0, lon0] = recipe.center;
  const dLat = recipe.halfExtent / (EARTH * RAD), dLon = recipe.halfExtent / (EARTH * RAD * Math.cos(lat0 * RAD));
  const box = { south: lat0 - dLat, west: lon0 - dLon, north: lat0 + dLat, east: lon0 + dLon };
  const at = elevationAt ?? (await elevation(box, demDir));
  const n = recipe.grid;
  const map = osm ? osmToVectors(osm, { box }) : null;
  // (Grid points to an SRTM sample, 30 m: finer grids repeat samples, and spikes are wider.)
  const reach = Math.max(1, Math.round(30 / ((2 * recipe.halfExtent) / (n - 1))));
  // (recipe.smooth: grid points to smooth the land over — a town on flat ground, its bumps ironed out;
  // recipe.coast: grid points to round the shore over; recipe.seaGrow: metres to bring the shore in.)
  const spacing = (2 * recipe.halfExtent) / (n - 1);
  const heights = heightGrid(box, n, at, recipe.sea ?? [], map?.water ?? [], reach, recipe.smooth ?? 0, recipe.coast ?? 0, (recipe.seaGrow ?? 0) / spacing);
  const pick = (/** @type {string} */ k) => (map?.[k]?.length ? map[k] : recipe[k] ?? []);
  const places = [...(recipe.places ?? []), ...(map?.places ?? []).filter((p) => !recipe.places?.some((q) => q.id === p.id))];
  const round = (v) => +v.toFixed(6);
  const data = {
    version: DATA_VERSION,
    name: recipe.name,
    sources: { ...recipe.sources, ...(osm ? { map: `${osm.generator ?? 'OpenStreetMap'} — © OpenStreetMap contributors (ODbL)${/Overture/.test(osm.generator ?? '') ? '; buildings also from other open sources via Overture Maps Foundation' : ''}` } : {}) },
    frame: { center: recipe.center, metersPerUnit: round((2 * recipe.halfExtent) / recipe.size), verticalScale: recipe.verticalScale ?? 1 },
    heights: { south: round(box.south), west: round(box.west), north: round(box.north), east: round(box.east), rows: n, cols: n, data: encodeHeights(heights) },
    rivers: map?.water.length ? map.rivers : pick('rivers'), // the areas are the rivers
    rails: pick('rails'),
    places,
    ...(map ? { roads: map.roads, buildings: encodeBuildings(map.buildings, recipe.center) } : {}),
  };
  const errs = checkWorldData(data);
  if (errs.length) throw new Error(`Dữ liệu sinh ra bị sai:\n- ${errs.join('\n- ')}`);
  return data;
}

// From the command line.
if (import.meta.url === `file://${process.argv[1]}`) {
  const [recipeFile, ...rest] = process.argv.slice(2);
  if (!recipeFile) {
    console.error('node tools/import/build.mjs <recipe.vectors.json> [--osm osm.json] [--out file.json] [--dem dir]');
    process.exit(1);
  }
  const opt = (name) => {
    const i = rest.indexOf(name);
    return i >= 0 ? rest[i + 1] : null;
  };
  const recipe = JSON.parse(readFileSync(recipeFile, 'utf8'));
  const osmFile = opt('--osm');
  const data = await build(recipe, { osm: osmFile ? JSON.parse(readFileSync(osmFile, 'utf8')) : null, demDir: opt('--dem') ?? '.cache/dem' });
  const out = opt('--out') ?? `src/worlds/data/${recipe.id}.json`;
  writeFileSync(out, JSON.stringify(data) + '\n');
  console.log(`${out}: ${data.heights.rows}×${data.heights.cols} độ cao, ${data.rivers.length} sông, ${data.rails.length} đường ray, ${data.roads?.length ?? 0} đường phố, ${data.buildings?.count ?? 0} nhà, ${data.places.length} địa danh`);
  if (osmFile) for (const w of checkPlaces(recipe.places ?? [], JSON.parse(readFileSync(osmFile, 'utf8')))) console.warn(`  ⚠ ${w}`);
  if (osmFile) console.log(`  mặt nước từ bản đồ: ${osmToVectors(JSON.parse(readFileSync(osmFile, 'utf8'))).water.map((w) => w.name ?? w.kind).join(', ') || 'không có'}`);
}
