import { describe, expect, it } from 'vitest';
import { loopPath, partySizes, pointAlong } from '../../src/world/tourist.js';

describe('loopPath', () => {
  it('goes the shorter way round a closed loop, leaving the start out', () => {
    expect(loopPath(10, 2, 5)).toEqual([3, 4, 5]);
    expect(loopPath(10, 8, 1)).toEqual([9, 0, 1]);
    expect(loopPath(10, 1, 8)).toEqual([0, 9, 8]);
  });
  it('goes the other way when flipped, and nowhere when already there', () => {
    expect(loopPath(10, 2, 5, true)).toEqual([1, 0, 9, 8, 7, 6, 5]);
    expect(loopPath(10, 4, 4)).toEqual([]);
  });
});

describe('partySizes', () => {
  it('splits the tourists into singles, pairs and threes', () => {
    let seed = 7;
    const rng = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (const total of [1, 2, 5, 14, 40]) {
      const sizes = partySizes(rng, total);
      expect(sizes.reduce((a, b) => a + b, 0)).toBe(total);
      expect(sizes.every((n) => n >= 1 && n <= 3)).toBe(true);
    }
    expect(new Set(partySizes(rng, 300))).toEqual(new Set([1, 2, 3]));
  });
});

describe('pointAlong', () => {
  const square = [{ x: 0, z: 0 }, { x: 10, z: 0 }, { x: 10, z: 10 }, { x: 0, z: 10 }];
  it('follows the loop round its corners, either way', () => {
    expect(pointAlong(square, 0, 4)).toEqual([4, 0]);
    expect(pointAlong(square, 0, 13)).toEqual([10, 3]);
    expect(pointAlong(square, 0, -3)).toEqual([0, 3]);
    expect(pointAlong(square, 2, 0)).toEqual([10, 10]);
  });
});
