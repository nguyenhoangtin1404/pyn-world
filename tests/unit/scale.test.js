import { describe, expect, it } from 'vitest';
import { createScale, SIZES, TOLERANCE } from '../../src/world/scale.js';

describe('world scale (world/scale.js)', () => {
  it('draws the hand-made worlds a unit a metre', () => {
    const s = createScale({});
    expect([s.map, s.props]).toEqual([1, 1]);
    expect(s.fit(3.2)).toBe(3.2);
  });

  it('draws props bigger than a small map, by `exaggerate`, never bigger than life', () => {
    const s = createScale({ metersPerUnit: 9 });
    expect(s.map).toBeCloseTo(1 / 9);
    expect(s.props).toBeCloseTo(1 / 3);
    expect(s.m(90)).toBeCloseTo(10); // a street's length: map scale
    expect(s.fit(3)).toBeCloseTo(1); // a lane on it: props scale
    expect(createScale({ metersPerUnit: 2 }).props).toBe(1); // 3 × 1/2 > 1: life size
    expect(createScale({ metersPerUnit: 0.5 }).props).toBe(2); // a close-up map: props at map scale
    expect(createScale({ metersPerUnit: 9, scale: { exaggerate: 2 } }).props).toBeCloseTo(2 / 9);
    expect(createScale({ metersPerUnit: 9, scale: { props: 0.5 } }).props).toBe(0.5);
  });

  it('audits what features drew against SIZES × props', () => {
    const s = createScale({ metersPerUnit: 9 });
    s.note('storey', SIZES.storey / 3, 'buildings'); // right
    s.note('gauge', 1.5, 'track'); // life size on a 1/3 map: 3× too big
    s.note('tree', (SIZES.tree / 3) / (TOLERANCE * 1.01), 'trees'); // just too small
    s.note('storey', SIZES.storey / 3, 'buildings'); // noted twice: once
    expect(s.notes).toHaveLength(3);
    expect(s.audit().map((n) => n.by)).toEqual(['track', 'trees']);
    expect(s.audit()[0].ratio).toBeCloseTo(1.5 / (SIZES.gauge / 3));
  });
});
