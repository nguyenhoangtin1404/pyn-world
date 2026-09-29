import { defineWorld } from './define.js';

// The original valley: a wobbly loop round a river, the station and village on the +x side, a
// halt with a small town on the far side, and the tunnel hill opposite the station.
export default defineWorld({
  id: 'pyn',
  name: 'PYN WORLD', // brass nameplate on the plinth
  seed: 20260929, // scenery uses seed, life seed + 7
  size: 600, // side of the square diorama

  // Closed loop through these (x, z) points (CatmullRom, centripetal). The station is at the first
  // point's end of the curve (u = 0).
  track() {
    const pts = [];
    const N = 18;
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2;
      const r = 120 + 13 * Math.sin(3 * a + 0.6) + 7 * Math.cos(2 * a);
      pts.push([Math.cos(a) * r * 1.08, Math.sin(a) * r * 0.86]);
    }
    return pts;
  },

  // riverX(z) = x0 + Σ amp·sin(z·freq + phase): winds north–south and crosses the loop twice.
  river: { x0: -25, waves: [[42, 0.011, 0.9], [10, 0.034, 2.0]] },

  terrain: {
    hills: 22, // height of the rolling hills inside the valley
    rim: [165, 280], // mountains rise between these distances from the centre
    mountains: [38, 50], // base height + noise height of the rim
    offset: [0, 0], // shifts the noise field: same shapes of hills, different place
  },

  // Stops: fraction of the loop, the name on the sign, and the flat plateau for the houses beside
  // it (a inward from the track, from A0 to A1; b along the track, ±HALF_B).
  station: { at: 0, name: 'PYN WORLD', zone: { A0: 30, A1: 95, HALF_B: 66 } },
  halt: { at: 0.385, name: 'PYN TOWN', zone: { A0: 2, A1: 64, HALF_B: 34 } },
  tunnel: { at: 0.5 }, // the hill with the tunnel, right opposite the station
});
