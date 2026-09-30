// @ts-check
import { prepareWorldData } from '../world/geodata.js';
import { NO_RIVER_GLSL } from '../world/rivers.js';
import { createLandCover } from '../world/landcover.js';
import { LANDMARKS } from '../landmarks/index.js';

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
  const { landmarks: _landmarks, landcover: _landcover, ...rest } = recipe;
  /** @type {import('../types').WorldConfig} */
  const cfg = {
    ...rest,
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
      const rail = recipe.rail ? d.rails.find((r) => r.id === recipe.rail) : d.rails[0];
      if (!rail) throw new Error(`World "${recipe.id}": dữ liệu không có đường ray${recipe.rail ? ` "${recipe.rail}"` : ''}`);
      cfg.heights = d.heightAt;
      cfg.rivers = d.rivers;
      cfg.places = d.places;
      const line = clipToSquare(rail.points, recipe.size / 2 - 12); // ends a little inside the edge
      if (line.length < 2) throw new Error(`World "${recipe.id}": đường ray không đi qua sa bàn`);
      cfg.track = () => line;
      cfg.stops = recipe.stops.map(({ place, ...st }) => {
        const p = d.places[place];
        if (!p) throw new Error(`World "${recipe.id}": điểm dừng "${st.id}" cần nơi "${place}" trong dữ liệu`);
        return { ...st, at: fractionAlong(line, p.p) };
      });
      // Landmarks at their places (or on the highest ground near them), each on a flat pad.
      cfg.pads = [];
      cfg.landmarks = (recipe.landmarks ?? []).map(({ model, place, rotation = 0, peak = 0 }) => {
        const pl = d.places[place];
        if (!pl) throw new Error(`World "${recipe.id}": công trình "${model}" cần nơi "${place}" trong dữ liệu`);
        if (!LANDMARKS[model]) throw new Error(`World "${recipe.id}": không có công trình "${model}" (src/landmarks/index.js)`);
        let p = pl.p;
        for (let dx = -peak; dx <= peak; dx++) {
          for (let dz = -peak; dz <= peak; dz++) {
            if (dx * dx + dz * dz <= peak * peak && d.heightAt(pl.p[0] + dx, pl.p[1] + dz) > d.heightAt(p[0], p[1])) p = [pl.p[0] + dx, pl.p[1] + dz];
          }
        }
        const h = d.heightAt(p[0], p[1]);
        cfg.pads.push({ x: p[0], z: p[1], r: LANDMARKS[model].radius, h });
        return { id: place, name: pl.name, model, p, h, rotation };
      });
      const town = (recipe.landcover?.town ?? []).map(({ at, radius }) => ({ p: d.projection.toWorld(at[0], at[1]), r: d.projection.length(radius) }));
      cfg.landcover = createLandCover(d, { town });
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
