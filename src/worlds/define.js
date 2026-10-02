// @ts-check
import { prepareWorldData } from '../world/geodata.js';
import { NO_RIVER_GLSL } from '../world/rivers.js';
import { createLandCover } from '../world/landcover.js';
import { LANDMARKS } from '../landmarks/index.js';
import { createScale, SIZES } from '../world/scale.js';
import { PAVEMENT } from '../features/streets.js';
import { alignToCrossStreet, prepareRoads, streetFrame } from '../world/streetnet.js';

const MEDIAN_M = 3; // metres across a boulevard's median
const STREETS = new Set(['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'unclassified', 'residential', 'living_street', 'road']); // streets a landmark can lie along

// A WorldConfig is the recipe for one world: everything that differs between worlds (layout,
// names, seed). The builders in src/world/ read it instead of module constants, so a new world is
// a new config file — see pyn.js for the fields.

/** @param {number} v */
const glslFloat = (v) => (Number.isInteger(v) ? v.toFixed(1) : String(v));

// Adds what is derived from the plain data: the river as a JS function and as the same function in
// GLSL (the water shader draws the current along it).
/**
 * @param {import('../types').WorldRecipe} cfg
 * @returns {import('../types').WorldConfig}
 */
export function defineWorld(cfg) {
  const { x0, waves } = cfg.river;
  const riverX = (z) => waves.reduce((x, [a, f, p]) => x + a * Math.sin(z * f + p), x0);
  const terms = waves.map(([a, f, p]) => ` + (${glslFloat(a)}) * sin(z * ${glslFloat(f)} + (${glslFloat(p)}))`).join('');
  return {
    ...cfg,
    riverX,
    riverGLSL: `float riverX(float z) { return ${glslFloat(x0)}${terms}; }`,
  };
}

/**
 * A world from real map data (src/worlds/data/<id>.json, made by tools/import/). Until load() it
 * has no track or stops; load() fetches the data (only when the world is about to be shown), checks
 * it, projects it onto the diorama (world/geodata.js) and fills in what every world has: the track
 * (the railway `rail`, a line with two ends), the ground's heights, the rivers, the stops (each at
 * the point of the railway nearest its place) and the named places for the features.
 * @param {import('../types').GeoRecipe} recipe
 * @returns {import('../types').WorldConfig}
 */
export function defineGeoWorld(recipe) {
  // (The recipe's landmarks and landcover are resolved by load() into the config's own.)
  const { landmarks: _landmarks, landcover: _landcover, boulevards: _boulevards, ...rest } = recipe;
  /** @type {import('../types').WorldConfig} */
  const cfg = {
    ...rest,
    chunk: 100, // the ground and the static batch in pieces of 100 units: the ones out of sight (the camera's, the sun's shadow) aren't drawn
    riverX: null,
    riverGLSL: NO_RIVER_GLSL,
    trackClosed: false,
    track() {
      throw new Error(`World "${recipe.id}": gọi load() trước khi dựng`);
    },
    stops: [],
    async load() {
      if (cfg.heights) return;
      const mod = await recipe.data();
      const d = prepareWorldData(mod.default ?? mod);
      // rail: null — no railway (a town away from the line): no train, no stops.
      const rail = recipe.rail === null ? null : recipe.rail ? d.rails.find((r) => r.id === recipe.rail) : d.rails[0];
      if (!rail && recipe.rail !== null) throw new Error(`World "${recipe.id}": dữ liệu không có đường ray${recipe.rail ? ` "${recipe.rail}"` : ''}`);
      cfg.heights = d.heightAt;
      cfg.rivers = d.rivers;
      cfg.places = d.places;
      const scale = createScale({ metersPerUnit: d.projection.metersPerUnit, scale: recipe.scale });
      // Boulevards: the big roads with four lanes round a median (units at the world's scale).
      cfg.roads = recipe.boulevards ? prepareRoads(d.roads, { lane: scale.fit(SIZES.lane), median: scale.fit(MEDIAN_M) }).roads : d.roads;
      cfg.buildings = d.buildings;
      cfg.metersPerUnit = d.projection.metersPerUnit;
      const line = rail ? clipToSquare(rail.points, recipe.size / 2 - 12) : []; // ends a little inside the edge
      if (rail && line.length < 2) throw new Error(`World "${recipe.id}": đường ray không đi qua sa bàn`);
      if (!rail && recipe.stops.length) throw new Error(`World "${recipe.id}": không có đường ray (rail: null) thì không có điểm dừng`);
      cfg.track = rail ? () => line : null;
      cfg.stops = recipe.stops.map(({ place, ...st }) => {
        const p = d.places[place];
        if (!p) throw new Error(`World "${recipe.id}": điểm dừng "${st.id}" cần nơi "${place}" trong dữ liệu`);
        return { ...st, at: fractionAlong(line, p.p) };
      });
      // Landmarks at their places (or on the highest ground near them), each on a flat pad.
      cfg.pads = [];
      cfg.landmarks = (recipe.landmarks ?? []).map(({ model, place, rotation: turn = 0, peak = 0 }) => {
        const pl = d.places[place];
        if (!pl) throw new Error(`World "${recipe.id}": công trình "${model}" cần nơi "${place}" trong dữ liệu`);
        if (!LANDMARKS[model]) throw new Error(`World "${recipe.id}": không có công trình "${model}" (src/landmarks/index.js)`);
        let p = pl.p;
        for (let dx = -peak; dx <= peak; dx++) {
          for (let dz = -peak; dz <= peak; dz++) {
            if (dx * dx + dz * dz <= peak * peak && d.heightAt(pl.p[0] + dx, pl.p[1] + dz) > d.heightAt(p[0], p[1])) p = [pl.p[0] + dx, pl.p[1] + dz];
          }
        }
        const { radius, back = 0, along = 12 } = LANDMARKS[model];
        // 'street': its straight side (local −x, `back` from its centre) along the nearest street, flush
        // with its pavement, its front (local +x) away from the street.
        let rotation = 0;
        const frame = turn === 'street' ? streetFrame(cfg.roads ?? [], p, STREETS, along * scale.map) : null;
        let axis = null; // (the way it faces, if the street that meets that one has it lined up)
        if (frame) {
          const lane = Math.max(frame.half, scale.fit(SIZES.lane)); // (streets.js: at least two lanes wide)
          const edge = lane + 0.4 * PAVEMENT * scale.props; // its side over the outer part of the pavement: no gap, the kerb still shows
          const dist = edge + back * scale.map;
          p = [frame.q[0] + frame.n[0] * dist, frame.q[1] + frame.n[1] * dist];
          axis = frame.n;
          // The street that meets this one square on: the centres of the tower and of its half circle on its centre line.
          const aligned = recipe.boulevards ? alignToCrossStreet((cfg.roads ?? []).filter((r) => STREETS.has(r.kind)), frame, p, dist, { reach: along * scale.map, mouth: frame.half + 3 }) : null;
          if (aligned) [p, axis] = [aligned.p, aligned.n];
          rotation = Math.atan2(-axis[1], axis[0]);
        }
        const h = d.heightAt(p[0], p[1]);
        cfg.pads.push({ x: p[0], z: p[1], r: typeof radius === 'function' ? radius(scale) : radius, h });
        // 'sea': its front (local +x) to the sea — down the slope of the distance to it.
        const s = 10, gx = d.seaDistanceAt(p[0] + s, p[1]) - d.seaDistanceAt(p[0] - s, p[1]), gz = d.seaDistanceAt(p[0], p[1] + s) - d.seaDistanceAt(p[0], p[1] - s);
        if (turn === 'sea') rotation = Number.isFinite(gx + gz) ? Math.atan2(gz, -gx) : 0;
        else if (turn !== 'street') rotation = turn;
        return { id: place, name: pl.name, model, p, h, rotation };
      });
      const town = (recipe.landcover?.town ?? []).map(({ at, radius }) => ({ p: d.projection.toWorld(at[0], at[1]), r: d.projection.length(radius) }));
      cfg.landcover = createLandCover(d, { town, buildings: d.buildings, size: recipe.size, fields: recipe.landcover?.fields ?? true });
      cfg.latitude = d.projection.center[0];
      cfg.sunDay = recipe.sunDay ?? 80;
    },
  };
  return cfg;
}

/**
 * How far along a polyline (0 at its start, 1 at its end) the point nearest p is.
 * @param {[number, number][]} pts @param {[number, number]} p
 */
export function fractionAlong(pts, [x, z]) {
  let total = 0, best = Infinity, at = 0;
  for (let i = 1; i < pts.length; i++) {
    const [ax, az] = pts[i - 1], [bx, bz] = pts[i];
    const dx = bx - ax, dz = bz - az, len = Math.hypot(dx, dz);
    const t = len > 0 ? Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (len * len))) : 0;
    const d = Math.hypot(x - ax - dx * t, z - az - dz * t);
    if (d < best) [best, at] = [d, total + t * len];
    total += len;
  }
  return total > 0 ? at / total : 0;
}

/**
 * The part of a polyline inside the square |x|, |z| ≤ half (the first stretch that is), cut where it
 * crosses the edge — also a segment that passes right through with both ends outside.
 * @param {[number, number][]} pts @param {number} half
 * @returns {[number, number][]}
 */
export function clipToSquare(pts, half) {
  /** @type {[number, number][]} */
  const out = [];
  for (let i = 1; i < pts.length; i++) {
    const [ax, az] = pts[i - 1], [bx, bz] = pts[i];
    const dx = bx - ax, dz = bz - az;
    // Liang–Barsky: the part t0..t1 of a→b inside the square.
    let t0 = 0, t1 = 1;
    for (const [p, q] of [[-dx, ax + half], [dx, half - ax], [-dz, az + half], [dz, half - az]]) {
      if (p === 0) {
        if (q < 0) t1 = -1;
        continue;
      }
      const t = q / p;
      if (p < 0) t0 = Math.max(t0, t);
      else t1 = Math.min(t1, t);
    }
    if (t0 > t1) {
      if (out.length) break; // left the square: the first stretch inside is done
      continue;
    }
    const a = /** @type {[number, number]} */ ([ax + dx * t0, az + dz * t0]), b = /** @type {[number, number]} */ ([ax + dx * t1, az + dz * t1]);
    if (!out.length) out.push(a);
    out.push(b);
    if (t1 < 1) break; // leaves the square here
  }
  return out;
}
