import { describe, expect, it } from 'vitest';
import { LoopPath, ellipse } from '../../src/world/vehicles/path.js';
import { gapSpeed, updateTraffic } from '../../src/world/vehicles/traffic.js';
import { approach } from '../../src/utils.js';

// Cars as the traffic sees them, driven the way Vehicle drives (accelerate 2.5, brake 9).
const path = new LoopPath(ellipse({ cx: 0, cz: 0, rx: 60, rz: 40, step: 1 }));
const car = (s, cruise, length = 4.2, on = path, stops = undefined) => ({ s, v: 0, cruise, length, limit: Infinity, path: on, stops });
function drive(cars, people, seconds, dt = 0.1) {
  let closest = Infinity;
  for (let t = 0; t < seconds; t += dt) {
    updateTraffic(cars, people, 2.5);
    for (const c of cars) {
      const want = Math.min(c.cruise, c.limit);
      c.v = approach(c.v, want, (want > c.v ? 2.5 : 9) * dt);
      c.s = c.path.wrap(c.s + c.v * dt);
    }
    const byS = [...cars].sort((a, b) => a.s - b.s);
    byS.forEach((c, i) => {
      const n = byS[(i + 1) % byS.length];
      if (n !== c) closest = Math.min(closest, ((n.s - c.s + path.length) % path.length) - (n.length + c.length) / 2);
    });
  }
  return closest;
}

describe('traffic', () => {
  it('gapSpeed stops at the minimum gap and speeds up with room', () => {
    expect(gapSpeed(1)).toBe(0);
    expect(gapSpeed(2.5)).toBe(0);
    expect(gapSpeed(14.5)).toBeCloseTo(10);
  });

  it('a fast car catches up with a slow one and follows it without hitting it', () => {
    const slow = car(20, 4), fast = car(0, 12);
    const closest = drive([slow, fast], [], 120);
    expect(closest).toBeGreaterThan(0.5);
    expect(fast.v).toBeLessThanOrEqual(slow.v + 1); // stuck behind
  });

  it('a busy loop never piles up', () => {
    const cars = [0, 20, 40, 60, 80, 100, 120, 140].map((s, i) => car(s, 6 + (i % 3) * 3, i % 4 ? 4.2 : 7.4));
    expect(drive(cars, [], 180)).toBeGreaterThan(0.5);
  });

  it('stops for someone on the road ahead, and not for someone beside it', () => {
    const c = car(0, 10);
    const [x, z] = path.pointAt(30);
    drive([c], [{ x, z }], 20);
    expect(c.v).toBeLessThan(0.01); // creeping up to the stopping line, i.e. stopped
    expect(c.s).toBeLessThan(30);
    expect(c.s).toBeGreaterThan(20);
    const d = car(0, 10);
    const h = path.headingAt(30);
    // 6 units to the side of the road at s = 30.
    drive([d], [{ x: x + Math.cos(h) * 6, z: z - Math.sin(h) * 6 }], 20);
    expect(d.s).toBeGreaterThan(40);
  });

  it('waits at a stop line while it says stop, then goes on', () => {
    let red = true;
    const c = car(0, 10, 4.2, path, [{ s: 50, blocked: () => red }]);
    drive([c], [], 20);
    expect(c.v).toBeLessThan(0.01);
    expect(c.s + c.length / 2).toBeLessThan(50); // front short of the line…
    expect(c.s + c.length / 2).toBeGreaterThan(48); // …but right up to it
    red = false;
    drive([c], [], 5);
    expect(c.s).toBeGreaterThan(55);
  });

  it('a stop line behind the car does not hold it', () => {
    const c = car(60, 10, 4.2, path, [{ s: 50, blocked: () => true }]);
    drive([c], [], 5);
    expect(c.s).toBeGreaterThan(80);
  });

  it('keeps its distance from a car on another route where the routes share the road', () => {
    const other = new LoopPath(path.points); // same road, another route
    const slow = car(20, 4, 4.2, other), fast = car(0, 12);
    let closest = Infinity;
    for (let t = 0; t < 60; t += 0.1) {
      drive([slow, fast], [], 0.1);
      closest = Math.min(closest, other.wrap(slow.s - fast.s) - 4.2);
    }
    expect(closest).toBeGreaterThan(0.5);
    expect(fast.v).toBeLessThanOrEqual(slow.v + 1);
  });

  it('ignores traffic coming the other way in the other lane', () => {
    // Two straight-ish lanes 3 apart, one each way: a long ellipse and a slightly smaller one reversed.
    const lane2 = new LoopPath(ellipse({ cx: 0, cz: 0, rx: 57, rz: 37, step: 1 }).reverse());
    const a = car(0, 10);
    const [x, z] = path.pointAt(20);
    const b = car(lane2.nearest(x, z).s, 10, 4.2, lane2);
    drive([a, b], [], 3);
    expect(a.v).toBeGreaterThan(6); // never braked for b
  });

  it('stops for a car turning across its lane at a wide angle (a U-turn in a crossroads)', () => {
    // A lorry standing in our lane 16 ahead, on a route crossing it at 110° (more than a right
    // angle: not traffic coming the other way).
    // (Our lane straight along +x, so the angle is the same all the way up to it.)
    const lane = new LoopPath([...Array.from({ length: 101 }, (_, i) => [i, 0]), [100, 40], [0, 40]]);
    const [px, pz] = lane.pointAt(16), h = lane.headingAt(16) + 1.92;
    const fx = Math.sin(h), fz = Math.cos(h);
    const pts = [];
    for (let d = -10; d <= 10; d++) pts.push([px + fx * d, pz + fz * d]);
    pts.push([px + fx * 10 - fz * 30, pz + fz * 10 + fx * 30], [px - fx * 10 - fz * 30, pz - fz * 10 + fx * 30]);
    const across = new LoopPath(pts);
    const lorry = car(across.nearest(px, pz).s, 0, 8, across), a = car(0, 10, 4.2, lane);
    drive([a, lorry], [], 8);
    expect(a.v).toBeLessThan(0.5);
    expect(a.s).toBeLessThan(16 - 4); // stopped short of it
  });

  it('gives exactly the limits of the plain O(n²) version, pair by pair (randomized)', () => {
    // The reference: every pair walks the points ahead with pointAt, as before the per-car caching.
    const LOOK = 30, LANE = 2;
    const gapTo = (car, [x, z], other, [ox, oz]) => {
      if (other.path === car.path) {
        const d = car.path.wrap(other.s - car.s);
        return d < LOOK ? d - (car.length + other.length) / 2 : Infinity;
      }
      const reach = LOOK + other.length / 2;
      if (Math.abs(ox - x) > reach || Math.abs(oz - z) > reach) return Infinity;
      const h = car.path.headingAt(car.s), ho = other.path.headingAt(other.s);
      if ((ox - x) * Math.sin(h) + (oz - z) * Math.cos(h) < -other.length / 2 - LANE) return Infinity;
      if (Math.cos(h - ho) < -0.7 && Math.abs((ox - x) * Math.cos(h) - (oz - z) * Math.sin(h)) > LANE / 2) return Infinity;
      const fx = Math.sin(ho), fz = Math.cos(ho), half = other.length / 2;
      for (let d = car.length / 2; d <= LOOK; d += 0.5) {
        const [px, pz] = car.path.pointAt(car.s + d);
        const along = Math.max(-half, Math.min(half, (px - ox) * fx + (pz - oz) * fz));
        if (Math.hypot(px - ox - fx * along, pz - oz - fz * along) < LANE) return d - car.length / 2;
      }
      return Infinity;
    };
    const reference = (cars, people, halfWidth) => {
      const pos = cars.map((c) => c.path.pointAt(c.s));
      const gap = cars.map((c, i) => cars.map((o, j) => (i === j ? Infinity : gapTo(c, pos[i], o, pos[j]))));
      return cars.map((car, i) => {
        let limit = Infinity;
        cars.forEach((_, j) => {
          const g = gap[i][j];
          if (g === Infinity || (gap[j][i] !== Infinity && cars[j].path !== car.path && i < j)) return;
          limit = Math.min(limit, gapSpeed(g));
        });
        const [x, z] = pos[i], h = car.path.headingAt(car.s), fx = Math.sin(h), fz = Math.cos(h);
        const look = car.length / 2 + 2.5 + car.v * 1.2 * 2;
        for (const p of people) {
          const dx = p.x - x, dz = p.z - z, along = dx * fx + dz * fz;
          if (along < 0 || along > look || Math.abs(dx * fz - dz * fx) > halfWidth + 0.6) continue;
          limit = Math.min(limit, gapSpeed(along - car.length / 2));
        }
        for (const stop of car.stops ?? []) {
          const d = car.path.wrap(stop.s - car.s) - car.length / 2;
          if (d < 0 || d > LOOK || !stop.blocked(car, d, cars)) continue;
          limit = Math.min(limit, gapSpeed(d - 0.5 + 2.5));
        }
        return limit;
      });
    };
    // Streets crossing at all angles near the middle, each an out-and-back loop (two lanes 3 apart).
    let seed = 11;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const street = (a, cx, cz) => {
      const out = [], back = [];
      const dx = Math.sin(a), dz = Math.cos(a), ox = Math.cos(a) * 1.5, oz = -Math.sin(a) * 1.5;
      for (let s = -60; s <= 60; s += 1.7) {
        out.push([cx + dx * s + ox, cz + dz * s + oz]);
        back.unshift([cx + dx * s - ox, cz + dz * s - oz]);
      }
      return new LoopPath([...out, ...back]);
    };
    let compared = 0, finite = 0;
    for (let scene = 0; scene < 40; scene++) {
      const paths = Array.from({ length: 2 + (scene % 5) }, () => street(rnd() * 6.3, rnd() * 20 - 10, rnd() * 20 - 10));
      paths.push(path);
      const cars = Array.from({ length: 3 + Math.floor(rnd() * 40) }, () => {
        const on = paths[Math.floor(rnd() * paths.length)];
        const stops = rnd() < 0.3 ? [{ s: rnd() * on.length, blocked: () => rnd() < 0.5 }] : undefined;
        return car(rnd() * on.length, 10, [1.9, 4.2, 7.4, 10.6][Math.floor(rnd() * 4)], on, stops);
      });
      cars.forEach((c) => (c.v = rnd() * 10));
      const people = Array.from({ length: Math.floor(rnd() * 8) }, () => ({ x: rnd() * 60 - 30, z: rnd() * 60 - 30 }));
      for (let step = 0; step < 30; step++) {
        const s0 = seed;
        const want = reference(cars, people, 1.5);
        seed = s0; // (the same answers from the stop lines' coin)
        updateTraffic(cars, people, 1.5);
        cars.forEach((c, i) => {
          expect(Object.is(c.limit, want[i])).toBe(true);
          compared++;
          if (want[i] !== Infinity) finite++;
        });
        for (const c of cars) c.s = c.path.wrap(c.s + 0.7 + rnd());
      }
    }
    expect(finite).toBeGreaterThan(compared / 10); // (plenty of cars held up, not just free roads)
  });
});
