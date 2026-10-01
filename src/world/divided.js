// @ts-check

// Boulevards: the town's big roads laid out as four lanes with a planted median. The map draws a
// divided road as two streets side by side, one per carriageway; here the pair becomes one road along
// the middle (`mergeDualCarriageways`), and every big road — merged, or drawn once — is given its
// width and its median (`boulevards`). features/streets.js paints the median, plants it and lights
// it; features/citytraffic.js keeps the cars to the lanes either side of it.

/** @typedef {{ kind: string, name: string, width: number, points: [number, number][], median?: number }} Road */

const BIG = new Set(['secondary', 'primary', 'trunk', 'motorway']);
/** A named tertiary street at least this long is a main road of the town too (units). */
const MAIN_LENGTH = 100;

/** @param {[number, number][]} pts */
export const lengthOf = (pts) => pts.reduce((s, p, i) => (i ? s + Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]) : 0), 0);

/**
 * The point of a polyline nearest (x, z), and how far it is.
 * @param {[number, number][]} pts @param {number} x @param {number} z
 */
function nearest(pts, x, z) {
  let d = Infinity, p = pts[0];
  for (let i = 1; i < pts.length; i++) {
    const [ax, az] = pts[i - 1], [bx, bz] = pts[i];
    const dx = bx - ax, dz = bz - az, len2 = dx * dx + dz * dz || 1;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / len2));
    const qx = ax + dx * t, qz = az + dz * t, e = Math.hypot(qx - x, qz - z);
    if (e < d) [d, p] = [e, [qx, qz]];
  }
  return { d, p };
}

/** A polyline resampled every `step` units (the last point kept). @param {[number, number][]} pts @param {number} step */
function resample(pts, step) {
  /** @type {[number, number][]} */
  const out = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    const [ax, az] = pts[i - 1], [bx, bz] = pts[i];
    const n = Math.max(1, Math.round(Math.hypot(bx - ax, bz - az) / step));
    for (let k = 1; k <= n; k++) out.push([ax + ((bx - ax) * k) / n, az + ((bz - az) * k) / n]);
  }
  return out;
}

/** Share of the points of `a` within `gap` of `b`. @param {[number, number][]} a @param {[number, number][]} b @param {number} gap */
const shareNear = (a, b, gap) => a.filter(([x, z]) => nearest(b, x, z).d < gap).length / a.length;

/**
 * Two roads of one kind and name running side by side (at most `gap` apart over most of their
 * length) are the two carriageways of one road: replaced by one along their middle, with the short
 * crossovers drawn between them dropped. Everything else is left as it is.
 * @param {Road[]} roads @param {number} [gap] units
 * @returns {{ roads: Road[], merged: Set<Road> }} merged: the roads made from pairs
 */
export function mergeDualCarriageways(roads, gap = 8) {
  const taken = new Set(), merged = new Set(), centres = [];
  /** @type {Road[]} */
  const made = [];
  roads.forEach((a, i) => {
    if (taken.has(a) || !a.name || a.kind === 'residential' || a.kind === 'service') return;
    let best = null, bestShare = 0.8;
    for (let j = i + 1; j < roads.length; j++) {
      const b = roads[j];
      if (taken.has(b) || b.kind !== a.kind || b.name !== a.name) continue;
      const share = Math.min(shareNear(resample(a.points, 1.5), b.points, gap), shareNear(resample(b.points, 1.5), a.points, gap));
      if (share >= bestShare) [best, bestShare] = [b, share];
    }
    if (!best) return;
    const b = best;
    // Along `a`, the middle between it and the other: where the other is near.
    /** @type {[number, number][]} */
    const mid = [];
    for (const [x, z] of resample(a.points, 1.5)) {
      const o = nearest(b.points, x, z);
      if (o.d < gap) mid.push([(x + o.p[0]) / 2, (z + o.p[1]) / 2]);
    }
    if (mid.length < 2) return;
    taken.add(a);
    taken.add(b);
    const road = { kind: a.kind, name: a.name, width: Math.max(a.width, b.width), points: mid };
    made.push(road);
    merged.add(road);
    centres.push(mid);
  });
  // The crossovers between the carriageways: a few units long, all inside a pair's corridor.
  const kept = roads.filter((r) => !taken.has(r) && !(r.points.length <= 3 && lengthOf(r.points) <= 5 && centres.some((c) => r.points.every(([x, z]) => nearest(c, x, z).d <= gap * 0.6))));
  return { roads: [...kept, ...made], merged };
}

/**
 * The big roads given four lanes and a median: `lane` units a lane, `median` between the two
 * carriageways. Merged pairs, primary and bigger roads, and the long named tertiary streets.
 * @param {Road[]} roads @param {{ lane: number, median: number, gap?: number }} o
 * @returns {Road[]}
 */
export function boulevards(roads, { lane, median, gap }) {
  const { roads: all, merged } = mergeDualCarriageways(roads, gap);
  return all.map((r) => {
    const big = merged.has(r) || BIG.has(r.kind) || (r.kind === 'tertiary' && !!r.name && lengthOf(r.points) >= MAIN_LENGTH);
    return big ? { ...r, width: 4 * lane + median, median } : r;
  });
}

/**
 * Where a landmark with a straight side on a street (frame: that street's fitted line `q` / `t`, `n`
 * the unit normal away from it) should stand so that its axis — through its centre and the centre of
 * its half circle, along `n` — lies on the centre line of the street that meets that one square on
 * and comes nearest: the centre moved along the street, and the axis turned to the cross street's
 * direction when that is within `tilt` radians of `n`. `mouth`: how far from the street's line the cross street may end. null when no such street (the frame stands as it is).
 * @param {Road[]} roads @param {{ q: [number, number], n: [number, number] }} frame
 * @param {[number, number]} p the centre as placed from the frame (flush, `dist` from q along n)
 * @param {number} dist @param {{ reach?: number, tilt?: number, mouth?: number }} [o]
 * @returns {{ p: [number, number], n: [number, number] } | null}
 */
export function alignToCrossStreet(roads, frame, p, dist, { reach = 14, tilt = 0.17, mouth = 8 } = {}) {
  const { q, n } = frame;
  /** @type {{ p: [number, number], n: [number, number], off: number } | null} */
  let best = null;
  for (const r of roads) {
    if (r.points.length < 2) continue;
    // The street's end (or point) nearest the frame's line, and its direction away from the line over the next `reach` units.
    const pts = resample(r.points, 1);
    const side = (/** @type {[number, number]} */ s) => (s[0] - q[0]) * n[0] + (s[1] - q[1]) * n[1];
    for (const ends of [pts, [...pts].reverse()]) {
      const near = ends[0];
      if (Math.abs(side(near)) > mouth) continue; // it doesn't come to the street
      const far = ends.find((s) => Math.hypot(s[0] - near[0], s[1] - near[1]) >= reach);
      if (!far) continue;
      const len = Math.hypot(far[0] - near[0], far[1] - near[1]);
      // Its direction, turned to point the way n does (the landmark is across the street from it, or on its side).
      const sign = (far[0] - near[0]) * n[0] + (far[1] - near[1]) * n[1] < 0 ? -1 : 1;
      const d = /** @type {[number, number]} */ ([(sign * (far[0] - near[0])) / len, (sign * (far[1] - near[1])) / len]);
      if (d[0] * n[0] + d[1] * n[1] < Math.cos(0.5)) continue; // not square on to the street
      // The street's own line over those units: its middle at the landmark's distance.
      const along = ends.filter((s) => Math.hypot(s[0] - near[0], s[1] - near[1]) <= reach);
      const mx = along.reduce((t, s) => t + s[0], 0) / along.length, mz = along.reduce((t, s) => t + s[1], 0) / along.length;
      // How far the street's line runs from p (square to it).
      const off = Math.abs((p[0] - mx) * d[1] - (p[1] - mz) * d[0]);
      if (off > reach || (best && off >= best.off)) continue;
      // The centre on that line, at `dist` from the street's line along n; the axis turned to the
      // street's direction too if that is nearly n (the flat side stays nearly flush), else n.
      const cosd = d[0] * n[0] + d[1] * n[1];
      const u = (dist - ((mx - q[0]) * n[0] + (mz - q[1]) * n[1])) / cosd;
      const centre = /** @type {[number, number]} */ ([mx + d[0] * u, mz + d[1] * u]);
      const axis = cosd >= Math.cos(tilt) ? d : n;
      best = { p: centre, n: axis, off };
    }
  }
  return best && { p: best.p, n: best.n };
}
