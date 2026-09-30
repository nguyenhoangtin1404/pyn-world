// OpenStreetMap → the vectors of a world data file. Input: an Overpass API answer in JSON with
// geometry (`[out:json]; … ; out geom;`) or anything with the same `elements` shape (Overture Maps
// through tools/import/overture.py). Keeps, within `box` when given:
// - rivers: ways tagged waterway=river (width from the `width` tag, metres, else `defaultWidth`)
// - rails: ways tagged railway=rail, joined end to end into as few lines as possible, named after
//   their `name` tag (Đường sắt Bắc–Nam → duong-sat-bac-nam)
// - roads: ways tagged highway=<a kind in ROAD_WIDTH> (footways, paths and steps left out), joined
//   by kind and name, simplified to within a metre
// - buildings: closed ways tagged building=…, each as its smallest enclosing rectangle, with its
//   floors (building:levels) and kind (school, public, commercial, shelter or house)
// - water: areas tagged natural=water (closed ways, or multipolygon relations with their islands as
//   inner members) — rivers, lakes, ponds; build.mjs sinks the ground under them
// - places: nodes with a name and tourism / historic / railway=station / natural=peak
// The sea comes from the elevation data (the coastline).
import { ROAD_WIDTH } from '../../src/world/geodata.js';

const EARTH = 6371008.8, RAD = Math.PI / 180;

const latlon = (g) => [+g.lat.toFixed(6), +g.lon.toFixed(6)];
const slug = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/** Join polylines that share end points into longer ones (end points found through a map). */
export function joinLines(lines) {
  const out = lines.map((l) => [...l]);
  const dead = new Uint8Array(out.length);
  const key = (p) => `${p[0]},${p[1]}`;
  /** @type {Map<string, Set<number>>} */
  const ends = new Map();
  const add = (i) => {
    for (const p of [out[i][0], out[i].at(-1)]) {
      if (!ends.has(key(p))) ends.set(key(p), new Set());
      ends.get(key(p)).add(i);
    }
  };
  const remove = (i) => {
    for (const p of [out[i][0], out[i].at(-1)]) ends.get(key(p))?.delete(i);
  };
  out.forEach((_, i) => add(i));
  const same = (a, b) => a[0] === b[0] && a[1] === b[1];
  for (let i = 0; i < out.length; i++) {
    if (dead[i]) continue;
    for (let grown = true; grown; ) {
      grown = false;
      const a = out[i];
      for (const p of [a.at(-1), a[0]]) {
        const j = [...(ends.get(key(p)) ?? [])].find((n) => n !== i);
        if (j === undefined) continue;
        const b = out[j];
        let joined;
        if (same(a.at(-1), b[0])) joined = [...a, ...b.slice(1)];
        else if (same(a.at(-1), b.at(-1))) joined = [...a, ...[...b].reverse().slice(1)];
        else if (same(a[0], b.at(-1))) joined = [...b, ...a.slice(1)];
        else joined = [...[...b].reverse(), ...a.slice(1)];
        remove(i);
        remove(j);
        dead[j] = 1;
        out[i] = joined;
        add(i);
        grown = true;
        break;
      }
    }
  }
  return out.filter((_, i) => !dead[i]);
}

/**
 * The parts of a polyline inside a box (every stretch that is, cut at the edges).
 * @param {[number, number][]} pts [lat, lon] @param {{ south: number, west: number, north: number, east: number }} box
 * @returns {[number, number][][]}
 */
export function clipToBox(pts, { south, west, north, east }) {
  const out = [];
  let cur = [];
  for (let i = 1; i < pts.length; i++) {
    const [ay, ax] = pts[i - 1], [by, bx] = pts[i];
    const dx = bx - ax, dy = by - ay;
    let t0 = 0, t1 = 1;
    for (const [p, q] of [[-dx, ax - west], [dx, east - ax], [-dy, ay - south], [dy, north - ay]]) {
      if (p === 0) {
        if (q < 0) t1 = -1;
        continue;
      }
      if (p < 0) t0 = Math.max(t0, q / p);
      else t1 = Math.min(t1, q / p);
    }
    if (t0 > t1) continue;
    const a = [+(ay + dy * t0).toFixed(6), +(ax + dx * t0).toFixed(6)], b = [+(ay + dy * t1).toFixed(6), +(ax + dx * t1).toFixed(6)];
    if (!cur.length) cur.push(a);
    cur.push(b);
    if (t1 < 1) {
      out.push(cur);
      cur = [];
    }
  }
  if (cur.length > 1) out.push(cur);
  return out.filter((l) => l.length > 1);
}

/**
 * Douglas–Peucker: drop points within `tol` metres of the line through their neighbours.
 * @param {[number, number][]} pts [lat, lon] @param {number} tol
 */
export function simplify(pts, tol) {
  if (pts.length < 3) return pts;
  const k = Math.cos(pts[0][0] * RAD);
  const m = pts.map(([lat, lon]) => [lon * k * EARTH * RAD, lat * EARTH * RAD]);
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [i, j] = stack.pop();
    const [ax, ay] = m[i], [bx, by] = m[j], dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy);
    let far = -1, best = tol;
    for (let n = i + 1; n < j; n++) {
      const d = len > 0 ? Math.abs((m[n][0] - ax) * dy - (m[n][1] - ay) * dx) / len : Math.hypot(m[n][0] - ax, m[n][1] - ay);
      if (d > best) [far, best] = [n, d];
    }
    if (far >= 0) {
      keep[far] = 1;
      stack.push([i, far], [far, j]);
    }
  }
  return pts.filter((_, i) => keep[i]);
}

/**
 * The smallest rectangle round a footprint (it has a side along an edge of the convex hull):
 * centre, length ≥ width in metres, the length's direction in degrees from east towards north.
 * @param {[number, number][]} ring [lat, lon]
 */
export function footprintRect(ring) {
  const lat0 = ring[0][0], lon0 = ring[0][1], k = Math.cos(lat0 * RAD) * EARTH * RAD, n = EARTH * RAD;
  const pts = ring.map(([lat, lon]) => [(lon - lon0) * k, (lat - lat0) * n]);
  // Convex hull (monotone chain).
  const sorted = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const half = (list) => {
    const h = [];
    for (const p of list) {
      while (h.length >= 2 && cross(h.at(-2), h.at(-1), p) <= 0) h.pop();
      h.push(p);
    }
    return h.slice(0, -1);
  };
  const hull = [...half(sorted), ...half([...sorted].reverse())];
  let best = null;
  for (let i = 0; i < hull.length; i++) {
    const [ax, ay] = hull[i], [bx, by] = hull[(i + 1) % hull.length];
    const a = Math.atan2(by - ay, bx - ax), c = Math.cos(a), s = Math.sin(a);
    let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
    for (const [x, y] of hull) {
      const u = x * c + y * s, v = -x * s + y * c;
      u0 = Math.min(u0, u), u1 = Math.max(u1, u), v0 = Math.min(v0, v), v1 = Math.max(v1, v);
    }
    const area = (u1 - u0) * (v1 - v0);
    if (!best || area < best.area - 1e-9) best = { area, a, u: (u0 + u1) / 2, v: (v0 + v1) / 2, l: u1 - u0, w: v1 - v0 };
  }
  if (!best) return null;
  const { a, u, v } = best;
  const cx = u * Math.cos(a) - v * Math.sin(a), cy = u * Math.sin(a) + v * Math.cos(a);
  const long = best.l >= best.w;
  const deg = ((((a + (long ? 0 : Math.PI / 2)) * 180) / Math.PI) % 180 + 180) % 180;
  return { at: [+(lat0 + cy / n).toFixed(6), +(lon0 + cx / k).toFixed(6)], length: Math.max(best.l, best.w), width: Math.min(best.l, best.w), angle: deg };
}

const SCHOOL = new Set(['school', 'university', 'college', 'kindergarten', 'dormitory']);
const PUBLIC = new Set(['hospital', 'library', 'post_office', 'government', 'civic', 'public', 'train_station', 'transportation', 'church', 'temple', 'pagoda', 'religious', 'stadium', 'sports_hall', 'museum']);
const COMMERCIAL = new Set(['commercial', 'retail', 'hotel', 'office', 'industrial', 'warehouse', 'supermarket', 'factory', 'service']);
const buildingKind = (/** @type {string} */ b) => (SCHOOL.has(b) ? 'school' : PUBLIC.has(b) ? 'public' : COMMERCIAL.has(b) ? 'commercial' : b === 'roof' ? 'shelter' : 'house');

export function osmToVectors(osm, { defaultWidth = 60, box = null } = {}) {
  const ways = (osm.elements ?? []).filter((e) => e.type === 'way' && Array.isArray(e.geometry));
  const clip = (/** @type {[number, number][]} */ pts) => (box ? clipToBox(pts, box) : [pts]);
  const inBox = ([lat, lon]) => !box || (lat >= box.south && lat <= box.north && lon >= box.west && lon <= box.east);
  const rivers = ways
    .filter((w) => w.tags?.waterway === 'river')
    .map((w) => ({ id: `river-${w.id}`, name: w.tags.name ?? `river ${w.id}`, width: parseFloat(w.tags.width) || defaultWidth, points: w.geometry.map(latlon) }));
  const railWays = ways.filter((w) => w.tags?.railway === 'rail');
  const railName = (/** @type {[number, number][]} */ line) => {
    const on = railWays.find((w) => w.tags.name && line.some((p) => w.geometry.some((g) => Math.abs(g.lat - p[0]) < 1e-6 && Math.abs(g.lon - p[1]) < 1e-6)));
    return on?.tags.name;
  };
  const rails = joinLines(railWays.map((w) => w.geometry.map(latlon)))
    .map((line) => ({ line, name: railName(line) }))
    .flatMap(({ line, name }) => clip(line).map((points) => ({ points, name })))
    .sort((a, b) => b.points.length - a.points.length)
    .map(({ points, name }, i) => ({ id: name ? slug(name) : `rail-${i + 1}`, name: name ?? `rail ${i + 1}`, points }))
    .filter((r, i, all) => all.findIndex((o) => o.id === r.id) === i); // the longest piece of each line
  const byRoad = new Map();
  for (const w of ways) {
    const kind = w.tags?.highway;
    if (!(kind in ROAD_WIDTH)) continue;
    const key = `${kind}|${w.tags.name ?? ''}`;
    if (!byRoad.has(key)) byRoad.set(key, []);
    byRoad.get(key).push(w.geometry.map(latlon));
  }
  const roads = [...byRoad].flatMap(([key, lines]) => {
    const [kind, name] = key.split('|');
    return joinLines(lines)
      .flatMap(clip)
      .map((pts) => simplify(pts, 1).map(([lat, lon]) => [+lat.toFixed(5), +lon.toFixed(5)]))
      .map((points) => (name ? { kind, name, points } : { kind, points }));
  });
  const buildings = ways
    .filter((w) => w.tags?.building && w.geometry.length >= 4)
    .map((w) => {
      const r = footprintRect(w.geometry.map(latlon));
      if (!r || r.width < 2 || r.length * r.width < 12 || !inBox(r.at)) return null; // too small to be a building
      const floors = Math.round(parseFloat(w.tags['building:levels'])) || 0;
      return { ...r, floors: Math.min(floors, 80), kind: buildingKind(w.tags.building) };
    })
    .filter(Boolean);
  const water = [];
  for (const e of osm.elements ?? []) {
    if (e.tags?.natural !== 'water') continue;
    const ring = (/** @type {{ lat: number, lon: number }[]} */ g) => simplify(g.map(latlon), 3);
    if (e.type === 'way' && Array.isArray(e.geometry) && e.geometry.length >= 4) water.push({ kind: e.tags.water ?? 'water', name: e.tags.name, outer: [ring(e.geometry)], inner: [] });
    if (e.type === 'relation' && Array.isArray(e.members)) {
      const rings = (/** @type {string} */ role) => joinLines(e.members.filter((m) => m.role === role && Array.isArray(m.geometry)).map((m) => m.geometry.map(latlon))).filter((r) => r.length >= 4).map((r) => simplify(r, 3));
      const outer = rings('outer');
      if (outer.length) water.push({ kind: e.tags.water ?? 'water', name: e.tags.name, outer, inner: rings('inner') });
    }
  }
  const places = (osm.elements ?? [])
    .filter((e) => e.type === 'node' && e.tags?.name && (e.tags.tourism || e.tags.historic || e.tags.railway === 'station' || e.tags.natural === 'peak'))
    .map((n) => ({
      id: slug(n.tags.name),
      name: n.tags.name,
      kind: n.tags.railway === 'station' ? 'station' : n.tags.natural === 'peak' ? 'peak' : 'landmark',
      at: latlon(n),
    }));
  const seen = new Set(); // one place per id (the first)
  const unique = places.filter((p) => inBox(p.at) && !seen.has(p.id) && seen.add(p.id));
  return { rivers, rails, roads, buildings, water, places: unique };
}
