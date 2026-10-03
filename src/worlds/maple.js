// @ts-check
import { defineWorld } from './define.js';

// A second valley, built by the same code from a different recipe: a longer, pinched loop, the river
// on the other side, hillier ground, its own names — three stops and no tunnel. Fields: see pyn.js.
export default defineWorld({
  id: 'maple',
  name: 'MAPLE VALE',
  tagline: 'SA BÀN ĐƯỜNG SẮT',
  seed: 7351,
  size: 600,

  track() {
    /** @type {[number, number][]} */
    const pts = [];
    const N = 16;
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2;
      const r = 115 + 16 * Math.sin(2 * a + 1.2) + 6 * Math.cos(3 * a);
      pts.push([Math.cos(a) * r * 1.12, Math.sin(a) * r * 0.82]);
    }
    return pts;
  },

  river: { x0: 30, waves: [[38, 0.012, 2.4], [12, 0.03, 0.5]] },

  terrain: {
    hills: 26,
    rim: [170, 285],
    mountains: [44, 46],
    offset: [173, -91],
  },

  stops: [
    { id: 'vale', at: 0, name: 'MAPLE VALE', zone: { A0: 30, A1: 90, HALF_B: 60 }, yard: true },
    { id: 'mill', at: 0.4, name: 'MAPLE MILL', zone: { A0: 2, A1: 60, HALF_B: 34 } },
    { id: 'peak', at: 0.7, name: 'MAPLE PEAK' }, // a lone halt: no zone, so no town
  ],

  // No windmill here; a smaller village, more balloons and more sheep — and a ring road round the
  // village with traffic on it (before the village, so the houses keep off it), and planes.
  features: [
    'station',
    // Off the river (far side) and the railway (ends); a roundabout at one end with a road out over
    // the railway (a level crossing) to a turning circle; lights at the zebra by the station, and a
    // crossroads with lights further along that side.
    { id: 'road', stop: 'vale', inset: { a1: 22, b: 26 }, roundabout: 'b1', branch: 46, lights: ['a0'], junctions: [{ side: 'a0', at: 0.25 }] },
    { id: 'village', count: 10 },
    'traffic',
    'halt',
    'halt',
    { id: 'sheep', flocks: 5 },
    'trees',
    'clouds',
    'train',
    'fish',
    'boats',
    { id: 'balloons', count: 7 },
    { id: 'villagers', perStop: [12, 10, 3], kids: [4, 3, 0] },
    'birds',
    'hikers',
    'aircraft',
  ],
});
