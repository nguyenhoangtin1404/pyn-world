// @ts-check
import { WATER_Y } from '../config.js';
import { createProjection } from './geo.js';

// World data from the real world (src/worlds/data/<id>.json, made by tools/import/): the ground's
// height, rivers, railways and named places, all in latitude/longitude and metres — independent of
// how big the diorama is. `checkWorldData()` says exactly what is wrong with a file;
// `prepareWorldData()` projects it into world units for the builders (terrain, track, water).
//
// Format, version 1 (every coordinate is [lat, lon] in degrees):
//   version: 1, name, sources: { … } (where it came from, licences — shown in the README)
//   frame: { center: [lat, lon], metersPerUnit, verticalScale }  how it maps onto the diorama
//   heights: { south, west, north, east, rows, cols, data }  metres above sea, row 0 = north,
//     data = base64 of Int16 little-endian, rows × cols; water is below 0 (the importer marks it):
//     the sea at SEA_BED, rivers and lakes higher
//   rivers: [{ id, name, width (m), points: [[lat, lon], …] }]
//   rails: [{ id, name, points: [[lat, lon], …] }]
//   places: [{ id, name, kind ('landmark' | 'station' | 'peak' | …), at: [lat, lon] }]
//   roads (optional): [{ kind (ROAD_WIDTH's keys), name?, points: [[lat, lon], …] }]
//   buildings (optional): { count, data } — each building a rectangle (its footprint's smallest
//     enclosing one), BUILDING_FIELDS Int16 little-endian values in base64: centre metres east and
//     north of frame.center and length, width, all in decimetres; the length's direction in
//     hundredths of a degree from east towards north (0–18000); floors (0 = unknown); kind
//     (index in BUILDING_KINDS)

export const DATA_VERSION = 1;
/** Metres the sea bed is given (the importer marks the sea with it; rivers and lakes are higher). */
export const SEA_BED = -10;

/** Roads by kind (OpenStreetMap's highway=…) and how wide they really are, metres. */
export const ROAD_WIDTH = {
  motorway: 22,
  trunk: 20,
  primary: 16,
  secondary: 12,
  tertiary: 10,
  unclassified: 7,
  residential: 6,
  living_street: 5,
  pedestrian: 5,
  service: 4,
  track: 3.5,
  road: 6,
};
export const BUILDING_KINDS = /** @type {const} */ (['house', 'school', 'public', 'commercial', 'shelter']);
export const BUILDING_FIELDS = 7;

/**
 * @typedef {{ x: number, z: number, length: number, width: number, angle: number, floors: number,
 *   kind: typeof BUILDING_KINDS[number] }} Building a footprint in world units, `angle` the
 *   length's direction as a rotation.y
 */

/**
 * @typedef {[number, number]} LatLon
 * @typedef {{ version: number, name: string, sources?: object,
 *   frame: { center: LatLon, metersPerUnit: number, verticalScale?: number },
 *   heights: { south: number, west: number, north: number, east: number, rows: number, cols: number, data: string },
 *   rivers: { id: string, name?: string, width: number, points: LatLon[] }[],
 *   rails: { id: string, name?: string, points: LatLon[] }[],
 *   places: { id: string, name: string, kind: string, at: LatLon }[],
 *   roads?: { kind: string, name?: string, points: LatLon[] }[],
 *   buildings?: { count: number, data: string } }} WorldData
 */

/** @param {string} b64 */
const base64Bytes = (b64) => Math.floor((b64.length * 3) / 4) - (b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0);

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const isLatLon = (p) => Array.isArray(p) && p.length === 2 && isNum(p[0]) && isNum(p[1]) && Math.abs(p[0]) <= 90 && Math.abs(p[1]) <= 180;

/**
 * Everything wrong with a world data file, one line each (empty if it's fine).
 * @param {any} d
 * @returns {string[]}
 */
export function checkWorldData(d) {
  const errs = [];
  if (!d || typeof d !== 'object') return ['không phải object JSON'];
  if (d.version !== DATA_VERSION) errs.push(`version phải là ${DATA_VERSION} (đang là ${d.version})`);
  if (typeof d.name !== 'string') errs.push('thiếu name');
  const f = d.frame;
  if (!f || !isLatLon(f.center)) errs.push('frame.center phải là [lat, lon]');
  if (!f || !(f.metersPerUnit > 0)) errs.push('frame.metersPerUnit phải > 0');
  if (f?.verticalScale !== undefined && !(f.verticalScale > 0)) errs.push('frame.verticalScale phải > 0');
  const h = d.heights;
  if (!h) errs.push('thiếu heights');
  else {
    for (const k of ['south', 'west', 'north', 'east', 'rows', 'cols']) if (!isNum(h[k])) errs.push(`heights.${k} phải là số`);
    if (h.north <= h.south || h.east <= h.west) errs.push('heights: north > south và east > west');
    if (!(h.rows >= 2 && h.cols >= 2)) errs.push('heights: ít nhất 2 × 2 điểm');
    if (typeof h.data !== 'string') errs.push('heights.data phải là base64');
    else if (base64Bytes(h.data) !== h.rows * h.cols * 2) errs.push(`heights.data phải có đúng rows × cols = ${h.rows * h.cols} số Int16`);
  }
  const line = (list, what, needWidth) => {
    if (!Array.isArray(list)) return errs.push(`${what} phải là mảng`);
    list.forEach((l, i) => {
      const name = `${what}[${i}]${l?.id ? ` ("${l.id}")` : ''}`;
      if (typeof l?.id !== 'string') errs.push(`${name}: thiếu id`);
      if (!Array.isArray(l?.points) || l.points.length < 2) errs.push(`${name}: points cần ít nhất 2 điểm`);
      else l.points.forEach((p, k) => isLatLon(p) || errs.push(`${name}.points[${k}] phải là [lat, lon]`));
      if (needWidth && !(l?.width > 0)) errs.push(`${name}: width (mét) phải > 0`);
    });
  };
  line(d.rivers, 'rivers', true);
  line(d.rails, 'rails', false);
  if (d.roads !== undefined) {
    if (!Array.isArray(d.roads)) errs.push('roads phải là mảng');
    else d.roads.forEach((r, i) => {
      if (!(r?.kind in ROAD_WIDTH)) errs.push(`roads[${i}]: kind phải là một trong ${Object.keys(ROAD_WIDTH).join(', ')} (đang là ${r?.kind})`);
      if (!Array.isArray(r?.points) || r.points.length < 2) errs.push(`roads[${i}]: points cần ít nhất 2 điểm`);
      else r.points.forEach((p, k) => isLatLon(p) || errs.push(`roads[${i}].points[${k}] phải là [lat, lon]`));
    });
  }
  const b = d.buildings;
  if (b !== undefined) {
    if (!(Number.isInteger(b?.count) && b.count >= 0)) errs.push('buildings.count phải là số nguyên ≥ 0');
    else if (typeof b.data !== 'string' || base64Bytes(b.data) !== b.count * BUILDING_FIELDS * 2) {
      errs.push(`buildings.data phải có đúng count × ${BUILDING_FIELDS} = ${b.count * BUILDING_FIELDS} số Int16`);
    }
  }
  if (!Array.isArray(d.places)) errs.push('places phải là mảng');
  else d.places.forEach((p, i) => {
    if (typeof p?.id !== 'string' || typeof p?.name !== 'string' || typeof p?.kind !== 'string') errs.push(`places[${i}]: cần id, name, kind`);
    if (!isLatLon(p?.at)) errs.push(`places[${i}]${p?.id ? ` ("${p.id}")` : ''}: at phải là [lat, lon]`);
  });
  return errs;
}

/** @param {string} b64 @returns {Int16Array} little-endian */
export function decodeHeights(b64) {
  const bin = atob(b64);
  const out = new Int16Array(bin.length / 2);
  for (let i = 0; i < out.length; i++) {
    const v = bin.charCodeAt(2 * i) | (bin.charCodeAt(2 * i + 1) << 8);
    out[i] = v >= 0x8000 ? v - 0x10000 : v;
  }
  return out;
}

/** @param {ArrayLike<number>} values Int16 @returns {string} */
export function encodeHeights(values) {
  let bin = '';
  for (let i = 0; i < values.length; i++) {
    const v = values[i] & 0xffff;
    bin += String.fromCharCode(v & 0xff, v >> 8);
  }
  return btoa(bin);
}

/**
 * The data in world units, for the builders.
 * - heightAt(x, z): the ground, sea level a little under the land (the sea bed below WATER_Y),
 *   metres exaggerated by the frame's verticalScale; outside the data, the nearest edge
 * - rivers / rails: polylines in (x, z), river widths in units
 * - places: by id, with their (x, z)
 * @param {WorldData} d
 */
export function prepareWorldData(d) {
  const errs = checkWorldData(d);
  if (errs.length) throw new Error(`Dữ liệu world "${d?.name ?? '?'}" sai:\n- ${errs.join('\n- ')}`);
  const projection = createProjection(d.frame);
  const { south, west, north, east, rows, cols } = d.heights;
  const metres = decodeHeights(d.heights.data);
  const at = (r, c) => metres[Math.min(rows - 1, Math.max(0, r)) * cols + Math.min(cols - 1, Math.max(0, c))];
  // Sea level sits just under the land around it; the sea bed (below 0 m) under the water.
  const shore = WATER_Y + 0.6;
  /** @param {number} x @param {number} z */
  const heightAt = (x, z) => {
    const [lat, lon] = projection.toLatLon(x, z);
    const r = ((north - lat) / (north - south)) * (rows - 1), c = ((lon - west) / (east - west)) * (cols - 1);
    const r0 = Math.floor(r), c0 = Math.floor(c), fr = r - r0, fc = c - c0;
    const m = (at(r0, c0) * (1 - fc) + at(r0, c0 + 1) * fc) * (1 - fr) + (at(r0 + 1, c0) * (1 - fc) + at(r0 + 1, c0 + 1) * fc) * fr;
    return shore + projection.height(m);
  };
  // Metres above sea (the sea bed below 0), nearest grid point; and how far the nearest sea is.
  const cell = (/** @type {number} */ x, /** @type {number} */ z) => {
    const [lat, lon] = projection.toLatLon(x, z);
    const r = Math.round(((north - lat) / (north - south)) * (rows - 1)), c = Math.round(((lon - west) / (east - west)) * (cols - 1));
    return Math.min(rows - 1, Math.max(0, r)) * cols + Math.min(cols - 1, Math.max(0, c));
  };
  const seaDist = seaDistances(metres, rows, cols, ((north - south) * 111195) / (rows - 1));
  const project = (/** @type {LatLon[]} */ pts) => pts.map(([lat, lon]) => projection.toWorld(lat, lon));
  return {
    name: d.name,
    projection,
    heightAt,
    /** Metres above sea at (x, z) (nearest data point; the sea is below 0). */
    elevationAt: (/** @type {number} */ x, /** @type {number} */ z) => metres[cell(x, z)],
    /** Metres to the nearest sea from (x, z) (nearest data point; Infinity with no sea). */
    seaDistanceAt: (/** @type {number} */ x, /** @type {number} */ z) => seaDist[cell(x, z)],
    rivers: d.rivers.map((r) => ({ id: r.id, name: r.name ?? r.id, width: projection.length(r.width), points: project(r.points) })),
    rails: d.rails.map((r) => ({ id: r.id, name: r.name ?? r.id, points: project(r.points) })),
    places: Object.fromEntries(d.places.map((p) => [p.id, { ...p, p: projection.toWorld(p.at[0], p.at[1]) }])),
    /** Streets: polylines in (x, z), their real width in units. */
    roads: (d.roads ?? []).map((r) => ({ kind: r.kind, name: r.name ?? '', width: projection.length(ROAD_WIDTH[r.kind]), points: project(r.points) })),
    buildings: decodeBuildings(d.buildings, projection),
  };
}

/**
 * Buildings (footprints in metres) → the data file's `buildings` (see the format above). Those that
 * don't fit the Int16 fields (centre further than 3.2 km from `center`, sides over 3.2 km) are left out.
 * @param {{ at: LatLon, length: number, width: number, angle: number, floors?: number, kind?: string }[]} list
 *   `angle` in degrees from east towards north
 * @param {LatLon} center
 */
export function encodeBuildings(list, center) {
  const p = createProjection({ center, metersPerUnit: 1 });
  const v = [];
  for (const b of list) {
    const [e, s] = p.toWorld(b.at[0], b.at[1]);
    const f = [Math.round(e * 10), Math.round(-s * 10), Math.round(b.length * 10), Math.round(b.width * 10), Math.round((((b.angle % 180) + 180) % 180) * 100) % 18000, b.floors ?? 0, Math.max(0, BUILDING_KINDS.indexOf(/** @type {any} */ (b.kind ?? 'house')))];
    if (f.every((x) => Math.abs(x) <= 32767)) v.push(...f);
  }
  return { count: v.length / BUILDING_FIELDS, data: encodeHeights(v) };
}

/**
 * The buildings of a data file in world units (see the format above).
 * @param {WorldData['buildings']} b @param {import('./geo.js').Projection} projection
 * @returns {Building[]}
 */
export function decodeBuildings(b, projection) {
  if (!b?.count) return [];
  const v = decodeHeights(b.data), mpu = projection.metersPerUnit;
  const [lat0, lon0] = projection.center;
  const [ox, oz] = projection.toWorld(lat0, lon0);
  /** @type {Building[]} */
  const out = [];
  for (let i = 0; i < b.count; i++) {
    const k = i * BUILDING_FIELDS;
    out.push({
      x: ox + v[k] / 10 / mpu,
      z: oz - v[k + 1] / 10 / mpu, // north is -z
      length: v[k + 2] / 10 / mpu,
      width: v[k + 3] / 10 / mpu,
      angle: (v[k + 4] / 100) * (Math.PI / 180), // east towards north = rotation.y (x east, z south)
      floors: v[k + 5],
      kind: BUILDING_KINDS[v[k + 6]] ?? 'house',
    });
  }
  return out;
}

/**
 * Distance (metres) from every grid point to the nearest sea point (at the sea bed, SEA_BED — not
 * a river or a lake): two chamfer passes.
 * @param {Int16Array} m metres, rows × cols @param {number} rows @param {number} cols @param {number} step metres between points
 */
export function seaDistances(m, rows, cols, step) {
  const d = new Float32Array(rows * cols);
  for (let k = 0; k < d.length; k++) d[k] = m[k] <= SEA_BED ? 0 : Infinity;
  const D = Math.SQRT2 * step;
  const relax = (k, j, w) => {
    if (d[j] + w < d[k]) d[k] = d[j] + w;
  };
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const k = r * cols + c;
      if (c > 0) relax(k, k - 1, step);
      if (r > 0) {
        relax(k, k - cols, step);
        if (c > 0) relax(k, k - cols - 1, D);
        if (c < cols - 1) relax(k, k - cols + 1, D);
      }
    }
  }
  for (let r = rows - 1; r >= 0; r--) {
    for (let c = cols - 1; c >= 0; c--) {
      const k = r * cols + c;
      if (c < cols - 1) relax(k, k + 1, step);
      if (r < rows - 1) {
        relax(k, k + cols, step);
        if (c < cols - 1) relax(k, k + cols + 1, D);
        if (c > 0) relax(k, k + cols - 1, D);
      }
    }
  }
  return d;
}
