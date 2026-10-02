import { describe, expect, it } from 'vitest';
import { alignToCrossStreet, auditRoads, mergeDualCarriageways, prepareRoads, reachesOut } from '../../src/world/streetnet.js';

const line = (x0, z0, x1, z1, n = 20) => Array.from({ length: n + 1 }, (_, i) => [x0 + ((x1 - x0) * i) / n, z0 + ((z1 - z0) * i) / n]);
const road = (name, points, kind = 'tertiary') => ({ kind, name, width: 2, points });

describe('mergeDualCarriageways', () => {
  it('turns two roads side by side into one along their middle', () => {
    const a = road('Lê Duẩn', line(0, 1, 100, 1)), b = road('Lê Duẩn', line(100, -1, 0, -1));
    const { roads, merged } = mergeDualCarriageways([a, b]);
    expect(roads).toHaveLength(1);
    expect(merged.has(roads[0])).toBe(true);
    expect(roads[0].points.every(([, z]) => Math.abs(z) < 1e-9)).toBe(true);
    expect(roads[0].points[0][0]).toBeCloseTo(0, 6);
    expect(roads[0].points.at(-1)[0]).toBeCloseTo(100, 6);
  });

  it('merges a road that goes out along one carriageway and back along the other', () => {
    const out = [...line(0, 2, 100, 2, 20), ...line(100, -2, 0, -2, 20)];
    const { roads, merged } = mergeDualCarriageways([road('Độc Lập', out)]);
    expect(roads).toHaveLength(1);
    expect(merged.has(roads[0])).toBe(true);
    expect(roads[0].points.every(([, z]) => Math.abs(z) < 0.3)).toBe(true);
  });

  it('leaves alone roads that merely meet, roads of another name, and side streets', () => {
    const a = road('A', line(0, 0, 100, 0)), b = road('A', line(100, 0, 100, 100)), c = road('B', line(0, 2, 100, 2));
    const res = mergeDualCarriageways([a, b, c, road('A', line(0, 1, 100, 1), 'residential')]);
    expect(res.roads).toHaveLength(4);
    expect(res.merged.size).toBe(0);
  });

  it('drops the short crossovers drawn between the carriageways', () => {
    const a = road('A', line(0, 1, 100, 1)), b = road('A', line(0, -1, 100, -1));
    const cross = road('', [[50, -1], [50, 1]]), side = road('', [[50, 1], [50, 30]]);
    const { roads } = mergeDualCarriageways([a, b, cross, side]);
    expect(roads).toContain(side);
    expect(roads).not.toContain(cross);
  });
});

describe('boulevards (prepareRoads)', () => {
  it('gives the big roads four lanes and a median, the rest as they were', () => {
    const big = road('Hùng Vương', line(0, 0, 50, 0), 'primary'), small = road('', line(0, 10, 50, 10), 'residential');
    const long = road('Dài', line(0, 20, 150, 20)), short = road('Ngắn', line(0, 30, 50, 30));
    const out = prepareRoads([big, small, long, short], { lane: 2, median: 1.5 }).roads;
    expect(out.find((r) => r.name === 'Hùng Vương')).toMatchObject({ width: 9.5, median: 1.5 });
    expect(out.find((r) => r.name === 'Dài')).toMatchObject({ width: 9.5, median: 1.5 });
    expect(out.find((r) => r.name === 'Ngắn').median).toBeUndefined();
    expect(out.find((r) => r.kind === 'residential')).toBe(small);
  });
});

describe('alignToCrossStreet', () => {
  // The street along x at z = 0 (its line at q, n pointing to +z), the landmark across it at z = 10.
  const frame = { q: [0, 0], n: [0, 1] };
  it('puts the centre on the centre line of the street that ends at it from the far side, along its axis', () => {
    const cross = road('X', line(3, -2, 3, -40));
    const a = alignToCrossStreet([cross], frame, [0, 10], 10);
    expect(a.p[0]).toBeCloseTo(3, 6);
    expect(a.p[1]).toBeCloseTo(10, 6);
    expect(a.n[0]).toBeCloseTo(0, 6);
    expect(a.n[1]).toBeCloseTo(1, 6);
  });

  it('turns the axis to a street a few degrees off square, and keeps it for one further off', () => {
    const slight = road('X', line(3, -2, 3 + 4, -40)); // ~6°
    const a = alignToCrossStreet([slight], frame, [0, 10], 10);
    expect(Math.abs(a.n[0])).toBeGreaterThan(0.05);
    expect(a.p[1]).toBeCloseTo(10, 6);
    const askew = road('X', line(3, -2, 3 + 20, -40)); // ~27°
    const b = alignToCrossStreet([askew], frame, [0, 10], 10);
    expect(b.n).toEqual([0, 1]);
    expect(b.p[1]).toBeCloseTo(10, 6);
  });

  it('does nothing when no street meets that one square on', () => {
    expect(alignToCrossStreet([road('along', line(-20, 2, 20, 2))], frame, [0, 10], 10)).toBeNull();
    expect(alignToCrossStreet([road('far', line(60, -2, 60, -40))], frame, [0, 10], 10)).toBeNull();
  });
});

describe('prepareRoads and auditRoads', () => {
  const circle = (cx, cz, r, n = 12) => Array.from({ length: n + 1 }, (_, i) => [cx + Math.cos((i / n) * Math.PI * 2) * r, cz + Math.sin((i / n) * Math.PI * 2) * r]);
  const raw = () => [
    road('Lê Duẩn', line(0, 2, 100, 2)), road('Lê Duẩn', line(100, -2, 0, -2)), // a divided road, two roads
    road('Độc Lập', [...line(0, 40, 100, 40, 20), ...line(100, 44, 0, 44, 20)]), // out and back
    { kind: 'tertiary', name: '', width: 2, points: circle(50, 0, 3) }, // a roundabout on the first
    road('Ngõ', line(0, 80, 60, 80), 'residential'),
  ];

  it('mends them all in one go, and reports what it did', () => {
    const { roads, report } = prepareRoads(raw(), { lane: 2, median: 1.5 });
    expect(report).toMatchObject({ merged: 2, rings: 1, boulevards: 2 });
    expect(roads.find((r) => r.ring).ring.r).toBeCloseTo(3, 1);
    expect(roads.filter((r) => r.name === 'Lê Duẩn')).toHaveLength(1);
    expect(roads.filter((r) => r.name === 'Độc Lập')).toHaveLength(1);
    expect(auditRoads(roads)).toEqual([]);
  });

  it('audits what is still wrong with the raw data', () => {
    const problems = auditRoads(raw());
    expect(problems.some((p) => p.includes('Lê Duẩn') && p.includes('side by side'))).toBe(true);
    expect(problems.some((p) => p.includes('Độc Lập') && p.includes('folds back'))).toBe(true);
    expect(problems.some((p) => p.includes('not a roundabout'))).toBe(true);
  });
});

describe('reachesOut', () => {
  it('tells a street that comes out from under a boulevard from a lane lying wholly under it', () => {
    const boulevard = line(0, 0, 100, 0);
    expect(reachesOut(boulevard, 4.5, 1, line(50, -2, 50, 20))).toBe(true); // a side street
    expect(reachesOut(boulevard, 4.5, 1, line(40, 1, 50, 2))).toBe(false); // a driveway under it
  });
});
