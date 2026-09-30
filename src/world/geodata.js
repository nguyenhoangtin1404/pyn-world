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
//     data = base64 of Int16 little-endian, rows × cols; the sea is below 0 (the importer marks it)
//   rivers: [{ id, name, width (m), points: [[lat, lon], …] }]
//   rails: [{ id, name, points: [[lat, lon], …] }]
//   places: [{ id, name, kind ('landmark' | 'station' | 'peak' | …), at: [lat, lon] }]

export const DATA_VERSION = 1;

/**
 * @typedef {[number, number]} LatLon
 * @typedef {{ version: number, name: string, sources?: object,
 *   frame: { center: LatLon, metersPerUnit: number, verticalScale?: number },
 *   heights: { south: number, west: number, north: number, east: number, rows: number, cols: number, data: string },
 *   rivers: { id: string, name?: string, width: number, points: LatLon[] }[],
 *   rails: { id: string, name?: string, points: LatLon[] }[],
 *   places: { id: string, name: string, kind: string, at: LatLon }[] }} WorldData
 */

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
    else if (Math.floor((h.data.length * 3) / 4) - (h.data.endsWith('==') ? 2 : h.data.endsWith('=') ? 1 : 0) !== h.rows * h.cols * 2) {
      errs.push(`heights.data phải có đúng rows × cols = ${h.rows * h.cols} số Int16`);
    }
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
  const project = (/** @type {LatLon[]} */ pts) => pts.map(([lat, lon]) => projection.toWorld(lat, lon));
  return {
    name: d.name,
    projection,
    heightAt,
    rivers: d.rivers.map((r) => ({ id: r.id, name: r.name ?? r.id, width: projection.length(r.width), points: project(r.points) })),
    rails: d.rails.map((r) => ({ id: r.id, name: r.name ?? r.id, points: project(r.points) })),
    places: Object.fromEntries(d.places.map((p) => [p.id, { ...p, p: projection.toWorld(p.at[0], p.at[1]) }])),
  };
}
