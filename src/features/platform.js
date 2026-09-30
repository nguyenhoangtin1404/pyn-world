// @ts-check
import * as THREE from 'three';
import { TRACK_Y } from '../config.js';
import { sweep } from '../world/track.js';
import { lam } from '../world/lowpoly.js';
import { shadowed } from './common.js';

// A platform runs along the track on one side (sgn = ±1 along frame.side) of frame k0, with a ramp
// at each end so people can walk up. Offsets are in track frames (~1 unit each). Its surface is
// registered with the site, so people (and their nav grids) walk on it. Drawn at the railway's size
// (track.k, world.scale.props): lengths, widths and heights × k; `pout` is given at model size.
const PLAT_HALF = 18;
const RAMP = 6;
const PLAT_IN = 2.2;
export const PLAT_TOP = 1.0; // relative to TRACK_Y
const GROUND = -0.4;

export function buildPlatform(world, group, k0, sgn, poutModel) {
  const { track } = world;
  const M = track.frames.length;
  const k = track.k ?? 1;
  const HALF = Math.round(PLAT_HALF * k), RMP = Math.max(1, Math.round(RAMP * k)); // in frames (~1 unit)
  const TOP = PLAT_TOP * k, pin = PLAT_IN * k, pout = poutModel * k;
  const platMat = lam('#d8c7a6', { side: THREE.DoubleSide });
  const edgeMat = lam('#f2c14e', { side: THREE.DoubleSide });
  const a0 = pin * sgn, a1 = pout * sgn;
  const slabAt = (top) => [[a0, -0.6], [a1, -0.6], [a1, top], [a0, top]];
  const start = (i) => (((k0 + i) % M) + M) % M;
  group.add(shadowed(new THREE.Mesh(sweep(track.frames, start(-HALF), HALF * 2 + 1, slabAt(TOP), TRACK_Y), platMat)));
  group.add(new THREE.Mesh(sweep(track.frames, start(-HALF), HALF * 2 + 1, [[a0, 1.0 * k], [2.7 * k * sgn, 1.0 * k], [2.7 * k * sgn, 1.04 * k], [a0, 1.04 * k]], TRACK_Y), edgeMat));
  const rampTop = (i) => TOP + (GROUND - TOP) * (i / RMP);
  group.add(shadowed(new THREE.Mesh(sweep(track.frames, start(HALF), RMP + 1, (i) => slabAt(rampTop(i)), TRACK_Y), platMat)));
  group.add(shadowed(new THREE.Mesh(sweep(track.frames, start(-HALF - RMP), RMP + 1, (i) => slabAt(rampTop(RMP - i)), TRACK_Y), platMat)));

  const fc = track.frame(k0);
  const frames = [];
  for (let i = -HALF - RMP; i <= HALF + RMP; i++) frames.push({ k: i, f: track.frame(k0 + i) });
  const reach = HALF + RMP + pout + 2;
  // Walkable height of the platform/ramps at (x, z), or -Infinity when off the platform.
  function height(x, z) {
    if (Math.abs(x - fc.p.x) > reach || Math.abs(z - fc.p.z) > reach) return -Infinity;
    let best = null, bd = Infinity;
    for (const sf of frames) {
      const d = (sf.f.p.x - x) ** 2 + (sf.f.p.z - z) ** 2;
      if (d < bd) {
        bd = d;
        best = sf;
      }
    }
    const f = best.f;
    const s = ((x - f.p.x) * f.side.x + (z - f.p.z) * f.side.z) * sgn;
    if (s < pin || s > pout) return -Infinity;
    // Continuous position along the platform (frames are ~1 unit apart) so the ramp is smooth.
    const along = best.k + ((x - f.p.x) * f.t.x + (z - f.p.z) * f.t.z) * (M / track.length);
    const ak = Math.abs(along);
    if (ak <= HALF) return TRACK_Y + TOP;
    if (ak <= HALF + RMP) return TRACK_Y + rampTop(ak - HALF);
    return -Infinity;
  }
  world.site.addSurface(height);
  return {
    frame: fc,
    out: fc.side.clone().multiplyScalar(sgn), // horizontal direction from the track to the platform
    height,
    top: TRACK_Y + TOP, // the platform's floor
    // Random spot on the platform floor (u along, v across, both 0..1).
    point: (u, v) => {
      const f = track.frame(k0 + Math.round((-15 + u * 30) * k));
      return f.p.clone().addScaledVector(f.side, (2.9 + v * (poutModel - 3.35)) * k * sgn).setY(TRACK_Y + TOP);
    },
    // Places where people wait for the train (between benches and posts), at model size.
    spots: (ks, off) => ks.map((i) => {
      const f = track.frame(k0 + Math.round(i * k));
      return f.p.clone().addScaledVector(f.side, off * k * sgn).setY(TRACK_Y + TOP);
    }),
  };
}

// Track frame index nearest to a frame (stations are given as frames).
export const frameIndex = (track, frame) => Math.round((frame.s / track.length) * track.frames.length);
