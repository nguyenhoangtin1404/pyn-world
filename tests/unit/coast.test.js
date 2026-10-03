import { describe, it, expect } from 'vitest';
import { findCoast } from '../../src/world/coast.js';
import { WATER_Y } from '../../src/config.js';

// A beach sloping down into the sea to the east (+x): the waterline at x = 10.
const ground = (x) => WATER_Y - (x - 10) * 0.2;

describe('findCoast', () => {
  const coast = findCoast({ size: 120, ground, isSeaCover: (x) => x > 0 });

  it('tells the sea from the land', () => {
    expect(coast.isSea(40, 0)).toBe(true);
    expect(coast.isSea(-20, 0)).toBe(false);
    expect(coast.isSea(5, 0)).toBe(false); // (dry)
  });

  it('counts cells out from the shore', () => {
    expect(coast.distAt(-20, 0)).toBe(0);
    expect(coast.distAt(10.5, 0)).toBe(1); // (the first cell in the water: 9..12)
    expect(coast.distAt(40, 0)).toBeGreaterThan(coast.distAt(20, 0));
    expect(coast.maxDist).toBe(coast.distAt(58, 0));
  });

  it('finds the waterline, the land to the west of it', () => {
    expect(coast.shore.length).toBeGreaterThan(30);
    for (const p of coast.shore) {
      expect(p.x).toBeCloseTo(10, 0);
      expect(p.nx).toBeCloseTo(-1, 5);
    }
    expect(coast.seaward.x).toBeCloseTo(1, 5);
  });

  it('leaves out water the land cover does not call sea', () => {
    const pond = findCoast({ size: 120, ground, isSeaCover: () => false });
    expect(pond.shore).toEqual([]);
    expect(pond.isSea(40, 0)).toBe(false);
  });
});

describe('findCoast, the shallows', () => {
  it('takes water the land cover calls beach for sea when it joins the sea', () => {
    const coast = findCoast({ size: 120, ground, isSeaCover: (x) => x > 30 });
    expect(coast.isSea(15, 0)).toBe(true);
    expect(coast.shore.length).toBeGreaterThan(30);
    for (const p of coast.shore) expect(p.x).toBeCloseTo(10, 0);
  });
});
