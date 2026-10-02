import * as THREE from 'three';
import { splitByCells } from '../../src/world/lowpoly.js';
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

describe('splitByCells', () => {
  const tri = (x, z) => [x, 0, z, x + 1, 0, z, x, 0, z + 1];
  const geo = (...tris) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(tris.flat(), 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(tris.flatMap(() => Array(9).fill(0.5)), 3));
    return g;
  };
  it('cuts a geometry into one per cell, keeping every triangle and attribute', () => {
    const parts = splitByCells(geo(tri(1, 1), tri(2, 2), tri(25, 3), tri(3, 25)), 10);
    expect(parts).toHaveLength(3);
    expect(parts.reduce((n, g) => n + g.attributes.position.count / 3, 0)).toBe(4);
    for (const g of parts) expect(g.attributes.color.count).toBe(g.attributes.position.count);
  });
  it('leaves a geometry in one cell as it is', () => {
    const g = geo(tri(1, 1), tri(2, 2));
    expect(splitByCells(g, 10)).toEqual([g]);
  });
});
