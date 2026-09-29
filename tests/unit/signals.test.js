import { describe, expect, it } from 'vitest';
import { CrossingGate, SignalCycle, trainNear } from '../../src/world/roads/signals.js';

describe('SignalCycle', () => {
  it('goes green, yellow, red and round again', () => {
    const s = new SignalCycle({ green: 10, yellow: 2, red: 5 });
    const seen = [];
    for (let t = 0; t < 34; t += 1) {
      seen.push(s.state[0]);
      s.update(1);
    }
    expect(seen.join('')).toBe('ggggggggggyyrrrrrggggggggggyyrrrrr');
  });

  it('offset starts it part-way through', () => {
    expect(new SignalCycle({ green: 10, yellow: 2, red: 5, offset: 11 }).state).toBe('yellow');
  });

  it('stops cars on red, and on yellow only those that can stop in time', () => {
    const s = new SignalCycle({ green: 1, yellow: 2, red: 5, offset: 4 });
    expect(s.state).toBe('red');
    expect(s.stops(0.1, 10)).toBe(true);
    s.t = 2; // yellow
    expect(s.stops(20, 10)).toBe(true); // 20 to go at 10: plenty of room to stop
    expect(s.stops(3, 10)).toBe(false); // too close to stop: go through
    s.t = 0; // green
    expect(s.stops(20, 10)).toBe(false);
  });
});

describe('CrossingGate', () => {
  it('flashes, then lowers the arms, and raises them once the train has gone', () => {
    const g = new CrossingGate();
    expect(g.active).toBe(false);
    expect(g.lamp).toBe(-1);
    const run = (seconds, near) => {
      for (let t = 0; t < seconds; t += 0.1) g.update(0.1, near);
    };
    run(2, true);
    expect(g.active).toBe(true);
    expect(g.arm).toBe(0); // still warning
    expect([0, 1]).toContain(g.lamp);
    run(8, true);
    expect(g.arm).toBe(1); // down
    run(2, false);
    expect(g.arm).toBeGreaterThan(0);
    expect(g.active).toBe(true); // cars wait until the arms are all the way up
    run(4, false);
    expect(g.arm).toBe(0);
    expect(g.active).toBe(false);
  });

  it('the two lamps take turns', () => {
    const g = new CrossingGate();
    const lamps = new Set();
    for (let t = 0; t < 3; t += 0.1) {
      g.update(0.1, true);
      lamps.add(g.lamp);
    }
    expect([...lamps].sort()).toEqual([0, 1]);
  });
});

describe('trainNear', () => {
  const L = 700, len = 30;
  it('is true while the train is coming soon or still over the crossing', () => {
    expect(trainNear({ s: 100, v: 0 }, len, 110, L)).toBe(true); // 10 away, even standing
    expect(trainNear({ s: 100, v: 0 }, len, 160, L)).toBe(false); // standing 60 away (at a station)
    expect(trainNear({ s: 100, v: 10 }, len, 160, L)).toBe(true); // 6 s away
    expect(trainNear({ s: 100, v: 10 }, len, 300, L)).toBe(false); // 20 s away
    expect(trainNear({ s: 120, v: 10 }, len, 100, L)).toBe(true); // front 20 past: cars still on it
    expect(trainNear({ s: 140, v: 10 }, len, 100, L)).toBe(false); // gone
  });

  it('works across the end of the loop', () => {
    expect(trainNear({ s: 690, v: 10 }, len, 20, L)).toBe(true);
    expect(trainNear({ s: 10, v: 10 }, len, 690, L)).toBe(true);
  });
});
