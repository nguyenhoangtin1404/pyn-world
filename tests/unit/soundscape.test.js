import { describe, it, expect } from 'vitest';
import { soundLevels, SEA_REACH } from '../../src/world/soundscape.js';

const base = { shore: [], waterY: -2, vehicles: [], people: [], map: 1, props: 1, pick: 0.5 };
const ear = (x, y = -2, z = 0) => ({ x, y, z });

describe('soundLevels', () => {
  it('is silent with nothing around: no sea, no engines, no voices, only a breeze', () => {
    const l = soundLevels(ear(0, 0), base);
    expect([l.sea, l.traffic, l.crowd, l.horn]).toEqual([0, 0, 0, null]);
    expect(l.wind).toBeGreaterThan(0);
  });

  it('hears the sea loudest at the shore, fading out at SEA_REACH metres (on the map)', () => {
    const w = { ...base, shore: [{ x: 0, z: 0 }], map: 0.2 };
    const at = (m) => soundLevels(ear(m * 0.2), w).sea;
    expect(at(0)).toBeCloseTo(1);
    expect(at(100)).toBeGreaterThan(at(200));
    expect(at(SEA_REACH + 1)).toBe(0);
    // height counts, but less than the same distance along the ground (the overview hears the beach it shows)
    expect(soundLevels(ear(0, -2 + 100 * 0.2), w).sea).toBeGreaterThan(at(100));
    expect(soundLevels(ear(0, -2 + 100 * 0.2), w).sea).toBeLessThan(at(0));
    // …and the wind blows harder by the sea
    expect(soundLevels(ear(0), w).wind).toBeGreaterThan(soundLevels(ear(500), w).wind);
  });

  it('adds up the engines near by, nearer louder, idling quieter, never past 1', () => {
    const car = (x, moving = true) => ({ x, y: -2, z: 0, moving });
    const one = soundLevels(ear(0), { ...base, vehicles: [car(10)] }).traffic;
    expect(soundLevels(ear(0), { ...base, vehicles: [car(40)] }).traffic).toBeLessThan(one);
    expect(soundLevels(ear(0), { ...base, vehicles: [car(10, false)] }).traffic).toBeLessThan(one);
    const jam = soundLevels(ear(0), { ...base, vehicles: Array.from({ length: 50 }, () => car(2)) }).traffic;
    expect(jam).toBeGreaterThan(one);
    expect(jam).toBeLessThanOrEqual(1);
  });

  it('measures vehicles and people at the props scale (things drawn bigger sound nearer)', () => {
    const w = { ...base, people: [{ x: 6, y: -2, z: 0 }] };
    expect(soundLevels(ear(0), { ...w, props: 0.3 }).crowd).toBeLessThan(soundLevels(ear(0), w).crowd);
  });

  it('sounds a horn from a moving vehicle, never one standing', () => {
    const vehicles = [{ x: 5, y: -2, z: 0, moving: false }, { x: 30, y: -2, z: 0, moving: true }];
    for (const pick of [0, 0.5, 0.999]) expect(soundLevels(ear(0), { ...base, vehicles, pick }).horn?.x).toBe(30);
    expect(soundLevels(ear(0), { ...base, vehicles: [vehicles[0]] }).horn).toBeNull();
  });
});
