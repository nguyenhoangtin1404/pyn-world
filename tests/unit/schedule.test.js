import { describe, expect, it } from 'vitest';
import { Schedule } from '../../src/world/train/schedule.js';

// A 500-unit loop with stops at 100 and 350.
const L = 500;
const wrap = (s) => ((s % L) + L) % L;
const make = (o = {}) => new Schedule({ wrap, stops: [{ s: 100, out: 'A' }, { s: 350, out: 'B' }], s: 0, ...o });

// Step until `until(schedule)` or the time runs out; returns the seconds it took.
function run(sch, until, { dt = 0.1, speed = 1, max = 600 } = {}) {
  for (let t = 0; t < max; t += dt) {
    sch.step(dt, speed);
    if (until(sch)) return t + dt;
  }
  throw new Error('timed out');
}

describe('Schedule', () => {
  it('runs up to the next stop and halts exactly on it', () => {
    const sch = make();
    run(sch, (s) => s.stopped);
    expect(sch.s).toBe(100);
    expect(sch.v).toBe(0);
    expect(sch.stopId).toBe(1);
    expect(sch.stopIndex).toBe(0);
    expect(sch.platformOut).toBe('A');
  });

  it('never goes faster than cruise × speed', () => {
    const sch = make();
    let top = 0;
    run(sch, (s) => ((top = Math.max(top, s.v)), s.stopped));
    expect(top).toBeLessThanOrEqual(13 * 1 + 1e-9);
    const fast = make();
    let top2 = 0;
    run(fast, (s) => ((top2 = Math.max(top2, s.v)), s.stopped), { speed: 2 });
    expect(top2).toBeGreaterThan(13);
  });

  it('opens the doors while stopped, waits at least 12 s, then whistles and leaves', () => {
    const sch = make();
    let whistles = 0;
    sch.onDepart = () => whistles++;
    run(sch, (s) => s.stopped);
    run(sch, (s) => s.doorOpen === 1);
    const waited = run(sch, (s) => s.state === 'run');
    expect(waited).toBeGreaterThan(12 - 1.4); // doors took ~1.4 s of the 12
    expect(whistles).toBe(1);
    run(sch, (s) => s.doorOpen === 0, { max: 5 });
  });

  it('is held by canDepart, but not for more than 30 s', () => {
    const sch = make();
    sch.canDepart = () => false;
    run(sch, (s) => s.stopped);
    const held = run(sch, (s) => s.state === 'closing');
    expect(held).toBeGreaterThan(29.5);
    expect(held).toBeLessThan(31);
  });

  it('calls at every stop in turn round the loop', () => {
    const sch = make();
    const seen = [];
    for (let i = 0; i < 5; i++) {
      run(sch, (s) => s.stopped);
      seen.push(sch.s);
      run(sch, (s) => !s.stopped);
    }
    expect(seen).toEqual([100, 350, 100, 350, 100]);
  });

  it('does not overshoot a stop with long frames', () => {
    const sch = make();
    run(sch, (s) => s.stopped, { dt: 0.5, speed: 2.5 });
    expect(sch.s).toBe(100);
  });

  it('stands still at speed 0, and never leaves a stop', () => {
    const sch = make();
    sch.step(10, 0);
    expect(sch.s).toBe(0);
    run(sch, (s) => s.stopped);
    for (let i = 0; i < 1000; i++) sch.step(0.1, 0);
    expect(sch.state).toBe('stop');
  });
});

describe('Schedule on a line with ends', () => {
  // A 500-unit line (no loop), one stop at 200; the engine may go from 40 to 490.
  const clamp = (s) => Math.min(L, Math.max(0, s));
  const line = () => new Schedule({ wrap: clamp, stops: [{ s: 200, out: 'A' }], s: 60, ends: { min: 40, max: 490 } });

  it('calls at the stop, runs to the end, waits there, and comes back through the stop', () => {
    const sch = line();
    run(sch, (s) => s.state === 'stop');
    expect(sch.s).toBe(200);
    expect(sch.stopId).toBe(1);
    run(sch, (s) => s.state === 'turn');
    expect(sch.s).toBe(490);
    expect(sch.stopId).toBe(1); // the end of the line is not a stop: nobody gets on or off
    expect(sch.doorOpen).toBe(0);
    let whistles = 0;
    sch.onDepart = () => whistles++;
    run(sch, (s) => s.state === 'run');
    expect(sch.dir).toBe(-1);
    expect(whistles).toBe(1);
    run(sch, (s) => s.state === 'stop');
    expect(sch.s).toBe(200); // same place on the way back: the carriages line up with the platform
    expect(sch.stopId).toBe(2);
    run(sch, (s) => s.state === 'turn');
    expect(sch.s).toBe(40);
    run(sch, (s) => s.state === 'run');
    expect(sch.dir).toBe(1);
  });

  it('never leaves the line, and reports the distance it covers going back as negative', () => {
    const sch = line();
    let min = Infinity, max = -Infinity, back = 0;
    for (let t = 0; t < 600; t += 0.1) {
      const ds = sch.step(0.1, 3);
      if (ds < 0) back++;
      min = Math.min(min, sch.s);
      max = Math.max(max, sch.s);
    }
    expect(min).toBeGreaterThanOrEqual(40);
    expect(max).toBeLessThanOrEqual(490);
    expect(back).toBeGreaterThan(0);
  });
});
