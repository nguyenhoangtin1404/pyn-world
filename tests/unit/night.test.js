import { describe, it, expect } from 'vitest';
import { outShare, waterShare, busy, shareOf, RHYTHM, Curfew, doorOf } from '../../src/world/night.js';

describe('outShare', () => {
  it('has everyone out by day, fewer after 22:00, nobody but the night owls from 1:00 to 5:00, all back by 6:30', () => {
    for (const h of [7, 12, 18, 21.9]) expect(outShare(h)).toBe(1);
    expect(outShare(23)).toBeLessThan(outShare(22.5));
    expect(outShare(22.5)).toBeLessThan(1);
    expect(outShare(0)).toBeLessThan(0.3);
    for (const h of [0.7, 1, 3, 4.9]) expect(outShare(h)).toBe(0);
    expect(outShare(5.75)).toBeGreaterThan(0);
    expect(outShare(6.5)).toBe(1);
    expect(outShare(25)).toBe(outShare(1)); // (any hour, round the clock)
  });

  it('keeps the water for the daytime', () => {
    expect(waterShare(12)).toBe(1);
    for (const h of [5, 20, 23, 2]) expect(waterShare(h)).toBe(0);
  });
});

describe('the day (RHYTHM)', () => {
  it('has everyone out from 7:00 to 9:30 (the app opens at 9:00: goldens and the 300 s run see them all)', () => {
    for (const who of Object.keys(RHYTHM)) for (const h of [7, 8, 9, 9.5]) expect(shareOf(who, h)).toBe(1);
  });

  it('rushes on the roads morning and evening, with a quiet noon', () => {
    expect(busy('traffic', 12.5)).toBeLessThan(0.5);
    expect(busy('traffic', 8)).toBe(1);
    expect(busy('traffic', 17.5)).toBe(1);
    expect(busy('traffic', 20.5)).toBeLessThan(1);
  });

  it('empties the town, the beach and the square at noon and fills them again in the late afternoon', () => {
    for (const who of ['town', 'beach', 'square']) {
      expect(busy(who, 13)).toBeLessThan(0.5);
      expect(busy(who, 18)).toBe(1);
    }
    expect(busy('beach', 13)).toBeLessThan(busy('town', 13)); // (the sand is too hot)
    expect(shareOf('water', 13)).toBeLessThan(shareOf('water', 16.5));
  });

  it('goes straight between the points, round the clock', () => {
    expect(busy('town', 11.5)).toBeCloseTo((0.6 + 0.45) / 2);
    expect(busy('town', 36)).toBe(busy('town', 12));
  });
});

describe('Curfew', () => {
  it('spreads the ranks evenly, so as many go as the share says, and the night owls never', () => {
    const c = new Curfew();
    const ranks = Array.from({ length: 200 }, () => c.rank());
    for (const share of [0.25, 0.5, 0.8]) expect(ranks.filter((r) => r < share).length / 200).toBeCloseTo(share, 1);
    const owl = c.rank(true);
    c.hour = 3;
    expect(c.out(owl)).toBe(true);
    expect(ranks.some((r) => c.out(r))).toBe(false);
    c.hour = 9;
    expect(ranks.every((r) => c.out(r))).toBe(true);
    // a lead: these go home earlier
    c.hour = 23;
    expect(ranks.filter((r) => c.out(r, undefined, 1)).length).toBeLessThan(ranks.filter((r) => c.out(r)).length);
  });
});

describe('doorOf', () => {
  it('is the nearest point of the footprint, just outside it, whatever its turn', () => {
    const b = { x: 10, z: 5, length: 4, width: 2, angle: 0 };
    const d = doorOf(b, 10, 20, 0.1); // (north of it… +z: its width side)
    expect([d.x, d.z]).toEqual([10, expect.closeTo(6.1)]);
    const turned = { ...b, angle: Math.PI / 2 };
    const e = doorOf(turned, 10, 20, 0.1);
    expect(e.x).toBeCloseTo(10);
    expect(e.z).toBeCloseTo(7.1);
    const inside = doorOf(b, 11.8, 5, 0.1); // (from inside: out by the nearer side)
    expect(inside.x).toBeCloseTo(12.1);
  });
});
