import { describe, expect, it } from 'vitest';
import { createRivers } from '../../src/world/rivers.js';
import { Site, CLAIM } from '../../src/world/site.js';
import { createGrade } from '../../src/world/grade.js';
import { fitOffStreets } from '../../src/features/buildings.js';
import { pavementRoute } from '../../src/features/strollers.js';

// A town's houses off its streets, people on its pavements, its streets graded smooth.

describe('claimed ground by kind (Site)', () => {
  const cfg = { size: 100, riverX: () => 500 };
  it('keeps the highest claim of a cell: a house next to a street leaves the street a street', () => {
    const site = new Site({ cfg, track: { distanceTo: () => 100 }, heightAt: () => 1, tunnel: null, yards: [], rivers: createRivers(cfg) });
    site.claimRect(0, 0, 20, 2, 0, 0, CLAIM.CARRIAGEWAY); // along x
    site.claimRect(0, 0, 20, 2, 0, 1, CLAIM.PAVEMENT);
    site.claimRect(0, 3, 4, 4, 0, 0.4); // a house over the pavement's edge
    expect(site.claimAt(0, 0)).toBe(CLAIM.CARRIAGEWAY);
    expect(site.claimAt(0, 1.7)).toBe(CLAIM.PAVEMENT);
    expect(site.claimAt(0, 4)).toBe(CLAIM.TAKEN);
    expect(site.claimAt(30, 30)).toBe(0);
    expect(site.claimed(0, 4)).toBe(true);
  });
});

describe('houses off the streets (fitOffStreets)', () => {
  // A street along z = 0, carriageway and pavement 1.5 either side.
  const onStreet = (x, z) => Math.abs(z) < 1.5;
  it('leaves a house clear of the street as it is', () => {
    const b = { x: 0, z: 4, length: 2, width: 2, angle: 0 };
    expect(fitOffStreets(b, onStreet)).toBe(b);
  });
  it('cuts back the side over the street, keeping the side away from it', () => {
    // 4 deep across the street (width along z for angle 0: v = (sin, cos) = (0, 1)), its near
    // edge at z = 1: over the pavement by half a unit.
    const b = { x: 0, z: 3, length: 3, width: 4, angle: 0, kind: 'house' };
    const f = fitOffStreets(b, onStreet);
    expect(f).not.toBeNull();
    expect(f.width).toBeLessThan(4);
    expect(f.z - f.width / 2).toBeGreaterThanOrEqual(1.5 - 1e-9); // its near edge off the pavement
    expect(f.z + f.width / 2).toBeCloseTo(5); // its far edge where it was
    expect(f.kind).toBe('house');
  });
  it('drops a house standing in the street', () => {
    expect(fitOffStreets({ x: 0, z: 0.5, length: 2, width: 2, angle: 0.3 }, onStreet)).toBeNull();
  });
});

describe('people on the pavement (pavementRoute)', () => {
  const street = Array.from({ length: 21 }, (_, i) => [i, 0]);
  it('walks one side, the middle of the pavement', () => {
    const route = pavementRoute(street, 2, 1, () => false);
    expect(route).toHaveLength(21);
    for (const p of route) expect(Math.abs(p.z)).toBeCloseTo(2);
    const left = pavementRoute(street, 2, -1, () => false);
    expect(Math.sign(left[5].z)).toBe(-Math.sign(route[5].z));
  });
  it('steps out of another street drawn over the pavement, and never starts or ends in one', () => {
    // A wide street crossing at x = 10 (its carriageway 3 wide), and one lying along the first
    // street's end, x > 18.
    const road = (x, z) => Math.abs(x - 10) < 1.5 || x > 18;
    const route = pavementRoute(street, 2, 1, road);
    expect(route.some((p) => Math.abs(p.x - 10) < 1.5)).toBe(true); // crossing it: kept
    expect(road(route.at(-1).x, route.at(-1).z)).toBe(false);
    expect(road(route[0].x, route[0].z)).toBe(false);
    // Another street alongside for a long stretch (x 3–12): not a crossing — the longer piece is kept.
    const along = (x) => x >= 3 && x <= 12;
    const cut = pavementRoute(street, 2, 1, along);
    expect(cut.every((p) => !along(p.x))).toBe(true);
    expect(cut[0].x).toBe(13);
    expect(cut.at(-1).x).toBe(20);
    // Just the pavement's outer edge under a carriageway: pushed out, off it.
    const edge = (x, z) => Math.abs(z) < 2.2 && x > 4 && x < 6;
    const out = pavementRoute(street, 2, 1, edge);
    for (const p of out) expect(edge(p.x, p.z)).toBe(false);
  });
});

describe('streets graded smooth (createGrade)', () => {
  // Bumpy ground: ±0.8 every few units, on a gentle slope.
  const ground = (x, z) => 2 + x * 0.05 + 0.8 * Math.sin(x * 1.3) * Math.cos(z * 0.9);
  const road = { width: 2, points: [[-40, 0], [40, 0]] };
  const grade = createGrade([road], ground, { size: 100, dry: -1 });
  it('irons the bumps out along the street, keeps its slope, and is level across it', () => {
    const along = [];
    for (let x = -20; x <= 20; x += 0.5) along.push(grade(x, 0, ground(x, 0)));
    const steps = along.slice(1).map((h, i) => Math.abs(h - along[i]));
    expect(Math.max(...steps)).toBeLessThan(0.08); // ground: up to 0.5 a step
    expect(along.at(-1) - along[0]).toBeCloseTo(40 * 0.05, 0); // the slope stays
    for (const x of [-10, 0, 10]) expect(Math.abs(grade(x, 1.5, ground(x, 1.5)) - grade(x, 0, ground(x, 0)))).toBeLessThan(0.1);
  });
  it('leaves the ground away from the street, and water, as they are', () => {
    expect(grade(0, 20, ground(0, 20))).toBe(ground(0, 20));
    expect(grade(0, 0, -3)).toBe(-3);
    expect(createGrade([], ground, { size: 100, dry: -1 })).toBeNull();
  });
});
