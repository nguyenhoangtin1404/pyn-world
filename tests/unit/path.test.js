import { describe, expect, it } from 'vitest';
import { LoopPath, roundedRect, ellipse } from '../../src/world/vehicles/path.js';

describe('LoopPath', () => {
  const circle = new LoopPath(ellipse({ cx: 0, cz: 0, rx: 50, rz: 50, step: 0.5 }));

  it('measures its length', () => {
    expect(circle.length).toBeCloseTo(2 * Math.PI * 50, 0);
    const square = new LoopPath([[0, 0], [10, 0], [10, 10], [0, 10]]);
    expect(square.length).toBe(40);
  });

  it('walks by distance and wraps round', () => {
    const square = new LoopPath([[0, 0], [10, 0], [10, 10], [0, 10]]);
    expect(square.pointAt(5)).toEqual([5, 0]);
    expect(square.pointAt(15)).toEqual([10, 5]);
    expect(square.pointAt(45)).toEqual([5, 0]);
    expect(square.pointAt(-5)).toEqual([0, 5]);
  });

  it('points along the path, and knows how sharply it turns', () => {
    for (const s of [0, 40, 100, 250]) {
      const [x, z] = circle.pointAt(s);
      const h = circle.headingAt(s);
      // Tangent is perpendicular to the radius.
      expect(Math.sin(h) * x + Math.cos(h) * z).toBeCloseTo(0, 1);
      expect(Math.abs(circle.curvatureAt(s))).toBeCloseTo(1 / 50, 2);
    }
  });
});

describe('roundedRect', () => {
  const toWorld = (a, b) => [a, b];
  const pts = roundedRect({ a0: 0, a1: 40, b0: -20, b1: 20, radius: 6, step: 1, toWorld });

  it('stays inside its rectangle and goes all the way round', () => {
    for (const [a, b] of pts) {
      expect(a).toBeGreaterThanOrEqual(-1e-9);
      expect(a).toBeLessThanOrEqual(40 + 1e-9);
      expect(Math.abs(b)).toBeLessThanOrEqual(20 + 1e-9);
    }
    const path = new LoopPath(pts);
    // Perimeter of the rectangle minus the corners cut by the arcs.
    expect(path.length).toBeCloseTo(2 * (40 + 40) - 8 * 6 + 2 * Math.PI * 6, 0);
  });

  it('has no gaps: every step is about `step` long', () => {
    for (let i = 0; i < pts.length; i++) {
      const [ax, az] = pts[i], [bx, bz] = pts[(i + 1) % pts.length];
      expect(Math.hypot(bx - ax, bz - az)).toBeLessThan(1.6);
    }
  });
});
