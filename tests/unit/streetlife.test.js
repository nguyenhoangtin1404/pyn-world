import { describe, expect, it } from 'vitest';
import { createRivers } from '../../src/world/rivers.js';
import { Site, CLAIM } from '../../src/world/site.js';
import { createGrade } from '../../src/world/grade.js';
import { drawnHeight, fitOffStreets } from '../../src/features/buildings.js';
import { crosswalkAt, pavementRoute } from '../../src/features/strollers.js';
import { alongFrom, alongside, crossedAt, findJunctions, overlaps, passes, trimEnds } from '../../src/features/citytraffic.js';
import { LoopPath } from '../../src/world/vehicles/path.js';
import { streetFrame } from '../../src/worlds/define.js';

// A town's houses off its streets, people on its pavements, its streets graded smooth, lights where
// they cross.

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

describe('crossroads for traffic lights (findJunctions, passes)', () => {
  const line = (x0, z0, x1, z1, n = 20) => Array.from({ length: n + 1 }, (_, i) => [x0 + ((x1 - x0) * i) / n, z0 + ((z1 - z0) * i) / n]);
  it('finds where streets cross, not where they run side by side', () => {
    const streets = [
      { points: line(-50, 0, 50, 0) }, // along x
      { points: line(10, -30, 10, 30) }, // across it at x = 10
      { points: line(-50, 2, 50, 2.5) }, // alongside the first: no crossing with it
      { points: line(11, -30, 12, 30) }, // across both, a unit or two from the second: the same crossing
    ];
    const found = findJunctions(streets);
    expect(found).toHaveLength(1);
    const [j] = found;
    expect(j.p[0]).toBeCloseTo(10, 0);
    expect(Math.abs(j.p[1])).toBeLessThan(5);
    expect([...j.streets].sort()).toEqual([0, 1, 2, 3]);
    expect(findJunctions([streets[0], streets[2]])).toEqual([]);
  });
  it('finds each lane of a street loop going past a crossing', () => {
    // A street along x from 0 to 40, as its loop: out on one side (z = -1), back on the other (z = 1).
    const path = new LoopPath([...line(0, -1, 40, -1), ...line(40, 1, 0, 1)]);
    const at = passes(path, [20, 0], 2);
    expect(at).toHaveLength(2);
    expect(path.pointAt(at[0])[0]).toBeCloseTo(20);
    expect(path.pointAt(at[0])[1]).toBeCloseTo(-1);
    expect(path.pointAt(at[1])[1]).toBeCloseTo(1);
    expect(passes(path, [20, 10], 2)).toEqual([]);
  });
});

describe('crosswalks at a crossroads (crosswalkAt)', () => {
  // A street along z (heading 0), 4 wide; a crosswalk across it at z = 10, 1 deep.
  const crosswalks = [{ x: 0, z: 10, h: 0, half: 2, depth: 1, signal: null }];
  it('is on the crosswalk on the carriageway, not on the pavement beside it or further along', () => {
    expect(crosswalkAt(crosswalks, 0, 10)).toBe(0);
    expect(crosswalkAt(crosswalks, -1.9, 10.8)).toBe(0); // at the kerb, within half a unit of the stripes
    expect(crosswalkAt(crosswalks, 2.5, 10)).toBe(-1); // on the pavement
    expect(crosswalkAt(crosswalks, 0, 12)).toBe(-1); // along the street
  });
  it('turns with the street', () => {
    const across = [{ ...crosswalks[0], h: Math.PI / 2 }]; // a street along x: the crosswalk runs along z
    expect(crosswalkAt(across, 0, 11.9)).toBe(0);
    expect(crosswalkAt(across, 1.5, 10)).toBe(-1);
  });
});

describe('crosswalks that would lie on each other (overlaps)', () => {
  const a = { x: 0, z: 0, h: 0, half: 2, depth: 1 };
  it('tells side-by-side crosswalks at a crossroads from ones on top of each other', () => {
    // The next arm round, turned a quarter: its crosswalk beside this one, not on it.
    expect(overlaps({ x: 3.2, z: 3.2, h: Math.PI / 2, half: 2, depth: 1 }, a)).toBe(false);
    expect(overlaps(a, { x: 3.2, z: 3.2, h: Math.PI / 2, half: 2, depth: 1 })).toBe(false);
    // A street meeting at a sharp angle: its crosswalk across this one.
    expect(overlaps({ x: 0.5, z: 0.3, h: 0.5, half: 2, depth: 1 }, a)).toBe(true);
    // A small one inside a big one: seen from the small one.
    expect(overlaps({ x: 0, z: 0, h: 0, half: 0.5, depth: 0.2 }, a)).toBe(true);
  });
});

describe('the same road twice (alongside)', () => {
  const line = (x0, z0, x1, z1, n = 20) => Array.from({ length: n + 1 }, (_, i) => [x0 + ((x1 - x0) * i) / n, z0 + ((z1 - z0) * i) / n]);
  it('tells a road drawn twice, or the other half of a dual carriageway, from a street crossing it', () => {
    const road = { width: 3, points: line(0, 0, 60, 0) };
    expect(alongside({ width: 3, points: line(60, 1, 0, 1) }, road)).toBe(1); // the same road, the other way
    expect(alongside({ width: 3, points: line(0, 4.5, 60, 4.5) }, road)).toBe(1); // the other carriageway
    expect(alongside({ width: 3, points: line(30, -30, 30, 30) }, road)).toBeLessThan(0.3); // across it
    expect(alongside({ width: 3, points: line(0, 20, 60, 20) }, road)).toBe(0); // a street away
  });
});

describe('buildings drawn to a shape (drawnHeight)', () => {
  it('keeps a building no taller than 2.5 times its narrow side, but at least most of a storey', () => {
    expect(drawnHeight(3, 2, 1)).toBe(3); // a block: as tall as its floors
    expect(drawnHeight(4, 0.35, 0.96)).toBeCloseTo(0.875); // a 4 m house of 4 floors on a small map: not a stick
    expect(drawnHeight(4, 0.1, 1)).toBeCloseTo(0.6); // a sliver: still most of a storey
    expect(drawnHeight(0.5, 0.1, 1)).toBe(0.5); // never taller than its floors
  });
});

describe('along a street from a crossing (alongFrom)', () => {
  // A street bending round a corner: east along z = 0 to (10, 0), then north (−z) to (10, −10).
  const pts = [[0, 0], [5, 0], [10, 0], [10, -5], [10, -10]];
  it('follows the street round its bends, both ways, with its heading there', () => {
    const [x, z, h] = alongFrom(pts, [5, 0.3], 7);
    expect(x).toBeCloseTo(10);
    expect(z).toBeCloseTo(-2);
    expect(Math.abs(h - Math.PI)).toBeLessThan(0.01); // heading north (−z)
    const back = alongFrom(pts, [5, 0], -3);
    expect(back[0]).toBeCloseTo(2);
    expect(back[1]).toBeCloseTo(0);
  });
  it('is nothing past the end of the street (a street ending at the crossing has one arm)', () => {
    expect(alongFrom(pts, [5, 0], -6)).toBeNull();
    expect(alongFrom(pts, [5, 0], 16)).toBeNull();
  });
});

describe('turning round before a crossroads, not in it (crossedAt, trimEnds)', () => {
  const line = (x0, z0, x1, z1, n = 20) => Array.from({ length: n + 1 }, (_, i) => [x0 + ((x1 - x0) * i) / n, z0 + ((z1 - z0) * i) / n]);
  // A street along x ending at a street across it at x = 40.
  const st = { kind: 'primary', width: 3, points: line(0, 0, 40, 0) };
  const across = { kind: 'secondary', width: 4, points: line(40, -30, 40, 30) };
  const beside = { kind: 'primary', width: 3, points: line(0, 4, 40, 4) }; // the other half of a dual carriageway
  const streets = [st, across, beside];
  it('knows the end at the crossing street, not the street alongside', () => {
    expect(crossedAt(streets, st, 40, 0, Math.PI / 2)).toBe(true);
    expect(crossedAt(streets, st, 20, 0, Math.PI / 2)).toBe(false);
    expect(crossedAt([st, beside], st, 40, 0, Math.PI / 2)).toBe(false);
  });
  it('cuts the street back from that end only', () => {
    const cut = trimEnds(st.points, (x, z, h) => !crossedAt(streets, st, x, z, h));
    expect(cut[0]).toEqual([0, 0]);
    expect(cut.at(-1)[0]).toBeLessThan(40 - 2 - 3);
  });
});

describe('a landmark along a street (streetFrame)', () => {
  const kinds = new Set(['tertiary', 'residential']);
  // A street running north-west to south-east through (0, 0): x = −z.
  const road = { kind: 'tertiary', width: 4, points: Array.from({ length: 21 }, (_, i) => [-20 + 2 * i, 20 - 2 * i]) };
  it('finds where the street passes, the way from it towards the place, and its half width', () => {
    const f = streetFrame([road, { kind: 'service', width: 1, points: [[9, 9], [12, 12]] }], [10, 10], kinds);
    expect(f.half).toBe(2);
    expect(f.q[0]).toBeCloseTo(0, 5);
    expect(f.q[1]).toBeCloseTo(0, 5);
    expect(f.n[0]).toBeCloseTo(Math.SQRT1_2, 5); // away from the street, towards (10, 10)
    expect(f.n[1]).toBeCloseTo(Math.SQRT1_2, 5);
    expect(streetFrame([road], [-10, -10], kinds).n[0]).toBeLessThan(0); // the other side: the other way
    expect(streetFrame([{ ...road, kind: 'service' }], [10, 10], kinds)).toBeNull(); // a service lane doesn't count
  });
  it('is not turned by a bend a little way along', () => {
    const bent = { kind: 'tertiary', width: 4, points: [[-40, 0], [-20, 0], [0, 0], [20, 0], [24, 8], [26, 20]] };
    const f = streetFrame([bent], [0, 12], kinds);
    expect(Math.abs(f.n[0])).toBeLessThan(0.3); // the street there runs along x: the normal along z
    expect(f.n[1]).toBeGreaterThan(0.9);
  });
  it('lies parallel to a street with coarse points, over the whole length asked for', () => {
    // Points 60 apart, a slight lean (2.4°: 5 in 120) that a couple of vertices near p would hide or exaggerate.
    const coarse = { kind: 'tertiary', width: 4, points: [[-120, -5], [-60, -2.5], [0, 0], [60, 2.5], [120, 5]] };
    const f = streetFrame([coarse], [10, 30], kinds, 30);
    const lean = Math.atan2(5, 120); // the street's true direction from the x axis
    expect(f.n[0]).toBeCloseTo(-Math.sin(lean), 3); // the normal to (cos, sin), on p's side
    expect(f.n[1]).toBeCloseTo(Math.cos(lean), 3);
  });
});
