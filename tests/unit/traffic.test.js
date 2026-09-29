import { describe, expect, it } from 'vitest';
import { LoopPath, ellipse } from '../../src/world/vehicles/path.js';
import { gapSpeed, updateTraffic } from '../../src/world/vehicles/traffic.js';
import { approach } from '../../src/utils.js';

// Cars as the traffic sees them, driven the way Vehicle drives (accelerate 2.5, brake 9).
const path = new LoopPath(ellipse({ cx: 0, cz: 0, rx: 60, rz: 40, step: 1 }));
const car = (s, cruise, length = 4.2) => ({ s, v: 0, cruise, length, limit: Infinity, path });
function drive(cars, people, seconds, dt = 0.1) {
  let closest = Infinity;
  for (let t = 0; t < seconds; t += dt) {
    updateTraffic(cars, people, 2.5);
    for (const c of cars) {
      const want = Math.min(c.cruise, c.limit);
      c.v = approach(c.v, want, (want > c.v ? 2.5 : 9) * dt);
      c.s = path.wrap(c.s + c.v * dt);
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
});
