import { describe, expect, it } from 'vitest';
import { LoopPath, OpenPath, arc, ellipse, roundedRect, smoothLoop } from '../../src/world/vehicles/path.js';

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

describe('OpenPath, smoothLoop, arc', () => {
  it('an open path stops at its ends', () => {
    const p = new OpenPath([[0, 0], [0, 10], [10, 10]]);
    expect(p.length).toBe(20);
    expect(p.pointAt(-5)).toEqual([0, 0]);
    expect(p.pointAt(25)).toEqual([10, 10]);
    expect(p.pointAt(15)).toEqual([5, 10]);
    expect(p.headingAt(0)).toBeCloseTo(0); // +z
    expect(p.headingAt(20)).toBeCloseTo(Math.PI / 2); // +x
  });

  it('nearest finds the distance along a loop of a point beside it', () => {
    const square = new LoopPath([[0, 0], [10, 0], [10, 10], [0, 10]]);
    expect(square.nearest(10.5, 0.2)).toEqual({ s: 10, d: Math.hypot(0.5, 0.2) });
  });

  it('smoothLoop rounds corners off and leaves straights alone', () => {
    const square = new LoopPath(roundedRect({ a0: 0, a1: 40, b0: 0, b1: 40, radius: 0.01, step: 1, toWorld: (a, b) => [a, b] }));
    const smooth = new LoopPath(smoothLoop(square.points));
    // The middle of a side is where it was; a corner is cut by about a unit.
    expect(smooth.nearest(20, 0).d).toBeLessThan(0.05);
    expect(smooth.nearest(40, 0).d).toBeGreaterThan(0.5);
    expect(smooth.nearest(40, 0).d).toBeLessThan(2);
    // No kinks left: the tightest bend is a few units round (heading turns < 0.25 per half unit).
    for (let s = 0; s < smooth.length; s += 0.5) {
      const d = smooth.headingAt(s + 0.5, 0.25) - smooth.headingAt(s, 0.25);
      expect(Math.abs(Math.atan2(Math.sin(d), Math.cos(d)))).toBeLessThan(0.25);
    }
  });

  it('arc goes the way angles grow (anticlockwise from above), from one angle round to another', () => {
    const pts = arc([0, 0], 10, 0, Math.PI / 2);
    expect(pts[0][0]).toBeCloseTo(0);
    expect(pts[0][1]).toBeCloseTo(10); // angle 0 = +z
    expect(pts.at(-1)[0]).toBeCloseTo(10); // π/2 = +x
    // From π/2 "to" 0 is three quarters of the way round.
    const long = arc([0, 0], 10, Math.PI / 2, 0);
    expect(new OpenPath(long).length).toBeCloseTo((3 / 4) * 2 * Math.PI * 10, 0);
  });
});
