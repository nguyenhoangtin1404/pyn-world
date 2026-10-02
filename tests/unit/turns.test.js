import { describe, expect, it } from 'vitest';
import { LoopPath } from '../../src/world/vehicles/path.js';
import { passed, rightTurn } from '../../src/world/vehicles/turns.js';

// Two streets crossing at the origin: A runs along +z on x = 1 and back on x = -1; B runs along +x on
// z = -1 and back on z = 1. (Heading 0 is +z, and a right turn is a quarter turn towards −x: the
// map's north is −z, so it is the right of someone driving south.)
// (Points every 2 units: LoopPath.nearest looks at the points only.)
const loop = (pts) => new LoopPath(pts.flatMap(([x, z], i) => {
  const [nx, nz] = pts[(i + 1) % pts.length], n = Math.max(1, Math.round(Math.hypot(nx - x, nz - z) / 2));
  return Array.from({ length: n }, (_, k) => [x + ((nx - x) * k) / n, z + ((nz - z) * k) / n]);
}));
const A = loop([[1, -60], [1, 60], [-1, 60], [-1, -60]]);
const B = loop([[-60, -1], [60, -1], [60, 1], [-60, 1]]);
const at = (path, x, z) => path.nearest(x, z).s;

describe('rightTurn', () => {
  it('curves from one lane into the next street\'s lane to the right, ending along it', () => {
    const t = rightTurn(A, at(A, 1, 0), B, at(B, 0, 1), 1.5); // into the lane heading −x
    expect(t).not.toBeNull();
    const [sx, sz] = A.pointAt(t.s0), end = t.connector.pointAt(t.length);
    expect(sx).toBeCloseTo(1, 0);
    expect(sz).toBeLessThan(0); // it starts before the crossing
    expect(end[0]).toBeLessThan(0); // and ends beyond it, along B's lane heading −x
    expect(end[1]).toBeCloseTo(1, 0);
    const [bx, bz] = B.pointAt(t.s1);
    expect(Math.hypot(bx - end[0], bz - end[1])).toBeLessThan(0.3); // handed on where it ends
    expect(t.length).toBeGreaterThan(2);
  });

  it('has no turn into a lane that leaves to the left', () => {
    expect(rightTurn(A, at(A, 1, 0), B, at(B, 0, -1), 1.5)).toBeNull(); // B's lane heading +x
  });

  it('has none between parallel lanes', () => {
    const C = loop([[3, -60], [3, 60], [5, 60], [5, -60]]);
    expect(rightTurn(A, at(A, 1, 0), C, at(C, 3, 0), 1.5)).toBeNull();
  });
});

describe('passed', () => {
  it('says whether a vehicle drove over a point between two frames, round a closed path', () => {
    expect(passed(10, 12, 11, 100)).toBe(true);
    expect(passed(10, 12, 13, 100)).toBe(false);
    expect(passed(98, 1, 0, 100)).toBe(true); // over the end of the loop
    expect(passed(12, 10, 11, 100)).toBe(false); // (backwards is a lap, not a crossing)
  });
});
