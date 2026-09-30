// @ts-check
import { prepareWorldData } from '../world/geodata.js';
import { NO_RIVER_GLSL } from '../world/rivers.js';

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
  /** @type {import('../types').WorldConfig} */
  const cfg = {
    ...recipe,
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
 * crosses the edge.
 * @param {[number, number][]} pts @param {number} half
 * @returns {[number, number][]}
 */
export function clipToSquare(pts, half) {
  const inside = ([x, z]) => Math.abs(x) <= half && Math.abs(z) <= half;
  // Where segment a→b meets the square's edge (a inside, b not, or the other way).
  const cut = (a, b) => {
    let lo = 0, hi = 1;
    const at = (t) => /** @type {[number, number]} */ ([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    const aIn = inside(a);
    for (let k = 0; k < 40; k++) {
      const mid = (lo + hi) / 2;
      if (inside(at(mid)) === aIn) lo = mid;
      else hi = mid;
    }
    return at(aIn ? lo : hi);
  };
  /** @type {[number, number][]} */
  const out = [];
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], prev = pts[i - 1];
    if (inside(p)) {
      if (prev && !inside(prev)) out.push(cut(prev, p));
      out.push(p);
    } else if (prev && inside(prev)) {
      out.push(cut(prev, p));
      break;
    }
  }
  return out;
}
