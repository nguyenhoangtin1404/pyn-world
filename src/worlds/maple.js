import { defineWorld } from './define.js';

// A second valley, built by the same code from a different recipe: a longer, pinched loop, the river
// on the other side, hillier ground, and its own names. Fields: see pyn.js.
export default defineWorld({
  id: 'maple',
  name: 'MAPLE VALE',
  seed: 7351,
  size: 600,

  track() {
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

  station: { at: 0, name: 'MAPLE VALE', zone: { A0: 30, A1: 90, HALF_B: 60 } },
  halt: { at: 0.4, name: 'MAPLE MILL', zone: { A0: 2, A1: 60, HALF_B: 34 } },
  tunnel: { at: 0.56 },
});
