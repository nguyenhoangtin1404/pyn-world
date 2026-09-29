import { describe, expect, it } from 'vitest';
import { approach, clamp, hash2, lerp, mulberry32, smoothstep } from '../../src/utils.js';

describe('utils', () => {
  it('clamp, lerp and smoothstep stay in range', () => {
    expect(clamp(5, 0, 1)).toBe(1);
    expect(clamp(-5, 0, 1)).toBe(0);
    expect(lerp(2, 4, 0.5)).toBe(3);
    expect(smoothstep(0, 10, -1)).toBe(0);
    expect(smoothstep(0, 10, 11)).toBe(1);
    expect(smoothstep(0, 10, 5)).toBeCloseTo(0.5);
  });

  it('approach moves towards the target without overshooting', () => {
    expect(approach(0, 10, 3)).toBe(3);
    expect(approach(9, 10, 3)).toBe(10);
    expect(approach(10, 0, 4)).toBe(6);
  });

  it('mulberry32 is deterministic and in [0, 1)', () => {
    const a = mulberry32(42), b = mulberry32(42);
    const xs = Array.from({ length: 1000 }, () => a());
    expect(Array.from({ length: 1000 }, () => b())).toEqual(xs);
    for (const x of xs) expect(x >= 0 && x < 1).toBe(true);
    expect(mulberry32(43)()).not.toBe(xs[0]);
  });

  it('hash2 is in [0, 1)', () => {
    for (let i = 0; i < 200; i++) {
      const h = hash2(i * 3.7 - 100, i * -1.3 + 50);
      expect(h >= 0 && h < 1).toBe(true);
    }
  });
});
