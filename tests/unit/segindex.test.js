import { describe, it, expect } from 'vitest';
import { SegIndex, segmentDistance } from '../../src/world/segindex.js';

describe('segmentDistance', () => {
  it('measures to the nearest point, ends included', () => {
    expect(segmentDistance(5, 3, 0, 0, 10, 0)).toBeCloseTo(3);
    expect(segmentDistance(-4, 3, 0, 0, 10, 0)).toBeCloseTo(5);
    expect(segmentDistance(2, 2, 1, 1, 1, 1)).toBeCloseTo(Math.SQRT2);
  });
});

describe('SegIndex', () => {
  it('gives the clearance to the nearest strip, from its edge', () => {
    const idx = new SegIndex(4).add(0, 0, 20, 0, 1).add(0, 10, 20, 10, 0);
    expect(idx.clearance(5, 3, 8)).toBeCloseTo(2);
    expect(idx.clearance(5, 8, 8)).toBeCloseTo(2);
    expect(idx.clearance(5, 0.5, 8)).toBeCloseTo(-0.5); // inside the strip
  });

  it('finds a segment that crosses many cells, from any of them', () => {
    const idx = new SegIndex(2).add(-50, -50, 50, 50);
    for (const t of [-40, -3, 0, 17, 49]) expect(idx.clearance(t + 1, t - 1, 3)).toBeCloseTo(Math.SQRT2);
  });

  it('skips a tag, and is Infinity with nothing within reach', () => {
    const idx = new SegIndex(4).addLine([[0, 0], [10, 0], [10, 10]], 0, 7).add(0, 5, 10, 5, 0, 3);
    expect(idx.clearance(5, 1, 6)).toBeCloseTo(1);
    expect(idx.clearance(5, 1, 6, 7)).toBeCloseTo(4);
    expect(idx.clearance(100, 100, 6)).toBe(Infinity);
    expect(idx.nearest(5, 4, 6)).toEqual({ d: 1, tag: 3 });
    expect(idx.nearest(100, 100, 6).tag).toBe(-1);
  });
});
