// Makes a world data file (src/worlds/data/<id>.json, format in src/world/geodata.js) from:
// - a recipe (tools/import/<id>.vectors.json): the place's centre and extent, the diorama's size,
//   how much to exaggerate heights, which map edges are open sea, and the rivers, railways and
//   named places — traced by hand, or
// - an OpenStreetMap extract (--osm file.json, Overpass JSON with `out geom`) for those vectors
// - SRTM elevation for the ground (downloaded into .cache/dem the first time).
//
//   node tools/import/build.mjs tools/import/tuyhoa.vectors.json [--osm osm.json] [--out file]
//
// The sea: grid points at or below 0 m joined to an open-sea edge get -10 m (the sea bed), so the
// coast is wherever the land really meets the water.
import { readFileSync, writeFileSync } from 'node:fs';
import { elevation } from './srtm.mjs';
import { osmToVectors } from './osm.mjs';
import { checkWorldData, encodeHeights, DATA_VERSION } from '../../src/world/geodata.js';

const SEA_BED = -10;
const EARTH = 6371008.8, RAD = Math.PI / 180;

/** The grid of metres (row 0 = north) with the sea marked, from any elevation(lat, lon). */
export function heightGrid({ south, west, north, east }, n, elevationAt, seaEdges = []) {
  const h = new Int16Array(n * n);
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) h[r * n + c] = Math.round(elevationAt(north - ((north - south) * r) / (n - 1), west + ((east - west) * c) / (n - 1)));
  }
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
  for (let k = 0; k < n * n; k++) h[k] = sea[k] ? SEA_BED : Math.max(0, h[k]); // dry land below 0: bad data
  return h;
}

export async function build(recipe, { osm = null, demDir = '.cache/dem', elevationAt = null } = {}) {
  const [lat0, lon0] = recipe.center;
  const dLat = recipe.halfExtent / (EARTH * RAD), dLon = recipe.halfExtent / (EARTH * RAD * Math.cos(lat0 * RAD));
  const box = { south: lat0 - dLat, west: lon0 - dLon, north: lat0 + dLat, east: lon0 + dLon };
  const at = elevationAt ?? (await elevation(box, demDir));
  const n = recipe.grid;
  const heights = heightGrid(box, n, at, recipe.sea ?? []);
  const vectors = osm ? osmToVectors(osm) : recipe;
  const round = (v) => +v.toFixed(6);
  const data = {
    version: DATA_VERSION,
    name: recipe.name,
    sources: { ...recipe.sources, vectors: osm ? 'OpenStreetMap (ODbL)' : recipe.sources?.vectors },
    frame: { center: recipe.center, metersPerUnit: round((2 * recipe.halfExtent) / recipe.size), verticalScale: recipe.verticalScale ?? 1 },
    heights: { south: round(box.south), west: round(box.west), north: round(box.north), east: round(box.east), rows: n, cols: n, data: encodeHeights(heights) },
    rivers: vectors.rivers ?? [],
    rails: vectors.rails ?? [],
    places: [...(vectors.places ?? []), ...(osm ? recipe.places ?? [] : [])],
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
  console.log(`${out}: ${data.heights.rows}×${data.heights.cols} độ cao, ${data.rivers.length} sông, ${data.rails.length} đường ray, ${data.places.length} địa danh`);
}
