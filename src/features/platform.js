// @ts-check
import * as THREE from 'three';
import { TRACK_Y } from '../config.js';
import { sweep } from '../world/track.js';
import { lam } from '../world/lowpoly.js';
import { shadowed } from './common.js';

// A platform runs along the track on one side (sgn = ±1 along frame.side) of frame k0, with a ramp
// at each end so people can walk up. Offsets are in track frames (~1 unit each). Its surface is
// registered with the site, so people (and their nav grids) walk on it.
const PLAT_HALF = 18;
const RAMP = 6;
const PLAT_IN = 2.2;
export const PLAT_TOP = 1.0; // relative to TRACK_Y
const GROUND = -0.4;

export function buildPlatform(world, group, k0, sgn, pout) {
  const { track } = world;
  const M = track.frames.length;
  const platMat = lam('#d8c7a6', { side: THREE.DoubleSide });
  const edgeMat = lam('#f2c14e', { side: THREE.DoubleSide });
  const a0 = PLAT_IN * sgn, a1 = pout * sgn;
  const slabAt = (top) => [[a0, -0.6], [a1, -0.6], [a1, top], [a0, top]];
  const start = (k) => (((k0 + k) % M) + M) % M;
  group.add(shadowed(new THREE.Mesh(sweep(track.frames, start(-PLAT_HALF), PLAT_HALF * 2 + 1, slabAt(PLAT_TOP), TRACK_Y), platMat)));
  group.add(new THREE.Mesh(sweep(track.frames, start(-PLAT_HALF), PLAT_HALF * 2 + 1, [[a0, 1.0], [2.7 * sgn, 1.0], [2.7 * sgn, 1.04], [a0, 1.04]], TRACK_Y), edgeMat));
  const rampTop = (k) => PLAT_TOP + (GROUND - PLAT_TOP) * (k / RAMP);
  group.add(shadowed(new THREE.Mesh(sweep(track.frames, start(PLAT_HALF), RAMP + 1, (i) => slabAt(rampTop(i)), TRACK_Y), platMat)));
  group.add(shadowed(new THREE.Mesh(sweep(track.frames, start(-PLAT_HALF - RAMP), RAMP + 1, (i) => slabAt(rampTop(RAMP - i)), TRACK_Y), platMat)));

  const fc = track.frame(k0);
  const frames = [];
  for (let k = -PLAT_HALF - RAMP; k <= PLAT_HALF + RAMP; k++) frames.push({ k, f: track.frame(k0 + k) });
  const reach = PLAT_HALF + RAMP + pout + 2;
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
    if (s < PLAT_IN || s > pout) return -Infinity;
    // Continuous position along the platform (frames are ~1 unit apart) so the ramp is smooth.
    const along = best.k + ((x - f.p.x) * f.t.x + (z - f.p.z) * f.t.z) * (M / track.length);
    const ak = Math.abs(along);
    if (ak <= PLAT_HALF) return TRACK_Y + PLAT_TOP;
    if (ak <= PLAT_HALF + RAMP) return TRACK_Y + rampTop(ak - PLAT_HALF);
    return -Infinity;
  }
  world.site.addSurface(height);
  return {
    frame: fc,
    out: fc.side.clone().multiplyScalar(sgn), // horizontal direction from the track to the platform
    height,
    // Random spot on the platform floor (u along, v across, both 0..1).
    point: (u, v) => {
      const f = track.frame(k0 + Math.round(-15 + u * 30));
      return f.p.clone().addScaledVector(f.side, (2.9 + v * (pout - 3.35)) * sgn).setY(TRACK_Y + PLAT_TOP);
    },
    // Places where people wait for the train (between benches and posts).
    spots: (ks, off) => ks.map((k) => {
      const f = track.frame(k0 + k);
      return f.p.clone().addScaledVector(f.side, off * sgn).setY(TRACK_Y + PLAT_TOP);
    }),
  };
}

// Track frame index nearest to a frame (stations are given as frames).
export const frameIndex = (track, frame) => Math.round((frame.s / track.length) * track.frames.length);
