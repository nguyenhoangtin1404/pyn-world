// @ts-check
// A world's rivers, as the rest of the code asks about them: how far (x, z) is from a river, with
// the river's width taken off so that the same numbers work for a narrow brook and a wide estuary
// (0–5 is the river bed, the bank rises to the land by 16), and the GLSL the water shader draws the
// current with. Procedural worlds have one river x = riverX(z) (cfg.river); worlds from map data
// have any number of polylines with widths (world/geodata.js). The sea is simply ground below the
// water line — nothing here needs to know about it.

/** A water shader with no river to follow: the current never shows. */
export const NO_RIVER_GLSL = 'float riverX(float z) { return 100000.0; }';

/**
 * @typedef {{ id: string, name: string, width: number, points: [number, number][] }} RiverLine
 * @typedef {{ distance(x: number, z: number): number, riverX: ((z: number) => number) | null, glsl: string }} Rivers
 */

/**
 * @param {{ riverX?: ((z: number) => number) | null, riverGLSL?: string, rivers?: RiverLine[] }} cfg
 * @returns {Rivers}
 */
export function createRivers(cfg) {
  if (cfg.riverX) {
    const riverX = cfg.riverX;
    return { distance: (x, z) => Math.abs(x - riverX(z)), riverX, glsl: cfg.riverGLSL ?? NO_RIVER_GLSL };
  }
  const lines = (cfg.rivers ?? []).map((r) => {
    const xs = r.points.map((p) => p[0]), zs = r.points.map((p) => p[1]);
    const pad = r.width / 2 + 40;
    return { ...r, half: r.width / 2, box: [Math.min(...xs) - pad, Math.min(...zs) - pad, Math.max(...xs) + pad, Math.max(...zs) + pad] };
  });
  return {
    // Distance to the nearest river's edge, shifted so 0–5 is inside it as for riverX worlds (their
    // river is ~20 wide round its centre line): d = distance to the centre line − (half width − 10).
    distance(x, z) {
      let best = Infinity;
      for (const l of lines) {
        const [x0, z0, x1, z1] = l.box;
        if (x < x0 || x > x1 || z < z0 || z > z1) continue;
        const pts = l.points;
        for (let i = 1; i < pts.length; i++) {
          const [ax, az] = pts[i - 1], [bx, bz] = pts[i];
          const dx = bx - ax, dz = bz - az, len2 = dx * dx + dz * dz;
          const t = len2 > 0 ? Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / len2)) : 0;
          const d = Math.hypot(x - ax - dx * t, z - az - dz * t) - (l.half - 10);
          if (d < best) best = d;
        }
      }
      return Math.max(0, best);
    },
    riverX: null,
    glsl: NO_RIVER_GLSL,
  };
}
