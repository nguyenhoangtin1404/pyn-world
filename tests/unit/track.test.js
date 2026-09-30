import { describe, expect, it } from 'vitest';
import { Track, createTrackCurve } from '../../src/world/track.js';
import { mulberry32 } from '../../src/utils.js';
import pyn from '../../src/worlds/pyn.js';
import maple from '../../src/worlds/maple.js';

// The grid search in distanceTo() must give exactly what checking every coarse point gives.
function bruteDistance(track, x, z) {
  let m = Infinity;
  for (let i = 0; i < track.coarse.length; i += 2) m = Math.min(m, (track.coarse[i] - x) ** 2 + (track.coarse[i + 1] - z) ** 2);
  return Math.sqrt(m);
}

describe.each([pyn, maple])('Track ($id)', (cfg) => {
  const track = new Track(createTrackCurve(cfg));

  it('has one frame per ~1 unit, with horizontal unit tangents', () => {
    expect(Math.abs(track.frames.length - track.length)).toBeLessThan(1);
    for (const f of track.frames.slice(0, 50)) {
      expect(f.t.y).toBe(0);
      expect(f.t.length()).toBeCloseTo(1);
      expect(f.side.dot(f.t)).toBeCloseTo(0);
    }
  });

  it('distanceTo matches a brute-force search', () => {
    const rng = mulberry32(7);
    for (let i = 0; i < 300; i++) {
      const x = (rng() - 0.5) * 700, z = (rng() - 0.5) * 700;
      expect(track.distanceTo(x, z)).toBeCloseTo(bruteDistance(track, x, z), 9);
    }
  });

  it('distanceTo with a max is exact below it, and never below it when farther', () => {
    const rng = mulberry32(8);
    for (let i = 0; i < 300; i++) {
      const x = (rng() - 0.5) * 400, z = (rng() - 0.5) * 400;
      const exact = bruteDistance(track, x, z), d = track.distanceTo(x, z, 20);
      if (exact < 20) expect(d).toBeCloseTo(exact, 9);
      else expect(d).toBeGreaterThanOrEqual(20);
    }
  });

  it('wraps distances and frame indices round the loop', () => {
    expect(track.wrap(-1)).toBeCloseTo(track.length - 1);
    expect(track.wrap(track.length + 2)).toBeCloseTo(2);
    expect(track.frame(-1)).toBe(track.frames[track.frames.length - 1]);
    expect(track.frame(track.frames.length)).toBe(track.frames[0]);
  });
});

describe('Track with two ends', () => {
  const line = new Track(createTrackCurve({ track: () => [[0, -100], [10, 0], [0, 100]], trackClosed: false }));
  it('has a frame at each end and holds distances to the line', () => {
    expect(line.closed).toBe(false);
    expect(line.frames.length).toBe(Math.ceil(line.length) + 1);
    expect(line.frames.at(-1).p.z).toBeCloseTo(100, 1);
    expect(line.wrap(-5)).toBe(0);
    expect(line.wrap(line.length + 5)).toBe(line.length);
    expect(line.frame(-3)).toBe(line.frames[0]);
    expect(line.frame(1e6)).toBe(line.frames.at(-1));
  });
});
