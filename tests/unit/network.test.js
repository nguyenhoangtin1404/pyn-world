import { describe, expect, it } from 'vitest';
import { roundedRect } from '../../src/world/vehicles/path.js';
import { angleOf, layoutRoads, layoutStreet, wrapAngle } from '../../src/world/roads/network.js';

// A 60 × 40 ring (x = a, z = b), a roundabout in the middle of its far end (z = 40) and a branch
// 30 long straight out (+z) from it.
const ring = roundedRect({ a0: 0, a1: 60, b0: 0, b1: 40, radius: 6, step: 1, toWorld: (a, b) => [a, b] });
const c = [30, 40];
const net = layoutRoads({ ring, width: 5, roundabout: { c, out: [0, 1] }, branch: { length: 30 } });
const [around, out] = net.routes;
const dist = ([x, z], p = c) => Math.hypot(x - p[0], z - p[1]);

describe('layoutRoads', () => {
  it('without a roundabout: one route, the ring as it is', () => {
    const plain = layoutRoads({ ring, width: 5 });
    expect(plain.routes).toHaveLength(1);
    expect(plain.routes[0].path.points).toBe(ring);
    expect(plain.ring.closed).toBe(true);
  });

  it('with a roundabout and a branch: a route round the ring and one out along the branch', () => {
    expect(net.routes.map((r) => r.id)).toEqual(['ring', 'branch']);
    expect(around.entries).toHaveLength(1); // onto the roundabout from the ring
    expect(out.entries).toHaveLength(2); // … and again coming back from the branch
    expect(net.ring.closed).toBe(false); // the ring is drawn up to the roundabout
    expect(net.circle.joins).toHaveLength(3);
    // Both routes start the same way round the ring.
    for (let s = 0; s < 100; s += 10) expect(dist(around.path.pointAt(s), out.path.pointAt(s))).toBeLessThan(0.01);
  });

  it('goes round the roundabout anticlockwise seen from above, the way angles grow', () => {
    for (const r of net.routes) {
      let checked = 0;
      for (let s = 0; s < r.path.length; s += 1) {
        const p = r.path.pointAt(s), q = r.path.pointAt(s + 1);
        if (Math.abs(dist(p) - 8) > 0.5 || Math.abs(dist(q) - 8) > 0.5) continue;
        const turn = wrapAngle(angleOf(c, q) - angleOf(c, p));
        expect(turn).toBeGreaterThan(0);
        expect(turn).toBeLessThan(0.5);
        checked++;
      }
      expect(checked).toBeGreaterThan(5);
    }
  });

  it('keeps right on the branch and turns round at the end of it', () => {
    let outward = 0, back = 0;
    for (let s = 0; s < out.path.length; s += 1) {
      const [x, z] = out.path.pointAt(s), [, z2] = out.path.pointAt(s + 1);
      if (z < 52 || z > 59) continue; // the middle of the branch (the ends curve into the circles)
      if (z2 > z) {
        expect(x).toBeCloseTo(28.5, 1); // going out (+z): right is -x
        outward++;
      } else {
        expect(x).toBeCloseTo(31.5, 1);
        back++;
      }
    }
    expect(outward).toBeGreaterThan(3);
    expect(back).toBeGreaterThan(3);
    const T = [30, 70];
    expect(net.turnaround.c).toEqual(T);
    const nearest = Math.min(...out.path.points.map((p) => Math.abs(dist(p, T) - 5)));
    expect(nearest).toBeLessThan(0.3);
    // Nothing on the ring route strays out there.
    expect(Math.max(...around.path.points.map(([, z]) => z))).toBeLessThan(40 + 8.5);
  });

  it('drives the ring whichever way reaches the branch first', () => {
    const reversed = layoutRoads({ ring: [...ring].reverse(), width: 5, roundabout: { c, out: [0, 1] }, branch: { length: 30 } });
    // Same routes, whichever way the ring was given.
    expect(reversed.routes[1].path.length).toBeCloseTo(out.path.length, 0);
    expect(reversed.routes[0].path.length).toBeCloseTo(around.path.length, 0);
  });

  it('says so when the roundabout is not on the ring', () => {
    expect(() => layoutRoads({ ring, width: 5, roundabout: { c: [30, 20], out: [0, 1] } })).toThrow(/nằm trên đường vòng/);
  });
});

describe('layoutStreet', () => {
  // Across the ring's side z = 0 at x = 30, 18 in (-z) and 16 out (+z).
  const st = layoutStreet({ id: 'street 1', c: [30, 0], dir: [0, 1], back: 18, ahead: 16 });
  const { path } = st.route;

  it('has a turning circle at each end', () => {
    expect(st.from).toEqual([30, -18]);
    expect(st.to).toEqual([30, 16]);
    for (const T of [st.from, st.to]) expect(Math.min(...path.points.map((p) => Math.abs(dist(p, T) - 5)))).toBeLessThan(0.3);
  });

  it('crosses the ring both ways, keeping right', () => {
    const crossings = [];
    for (let s = 0; s < path.length; s += 0.5) {
      const [x, z] = path.pointAt(s), [, z2] = path.pointAt(s + 0.5);
      if (Math.sign(z) !== Math.sign(z2) && z !== 0) crossings.push({ x, out: z2 > z });
    }
    expect(crossings).toHaveLength(2);
    for (const { x, out } of crossings) expect(x).toBeCloseTo(out ? 28.5 : 31.5, 1); // going +z, right is -x
  });
});
