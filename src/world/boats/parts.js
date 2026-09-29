import { box, ball, segment } from '../lowpoly.js';

// What both boats are made of.

export const WHITE = '#f4f1ea';
export const RED = '#c8453a';
export const WOOD = '#a8744a';
export const DARK = '#2b2522';

// Rail posts + top rail following an outline between two z limits.
export function railing(points, scale, zMin, zMax, y0, h) {
  const parts = [];
  const pts = points.map(([x, z]) => [x * scale, z * scale]);
  for (let i = 0; i < pts.length; i++) {
    const [ax, az] = pts[i];
    const [bx, bz] = pts[(i + 1) % pts.length];
    if (Math.min(az, bz) < zMin || Math.max(az, bz) > zMax) continue;
    const len = Math.hypot(bx - ax, bz - az);
    const n = Math.max(1, Math.round(len / 0.8));
    for (let k = 0; k < n; k++) {
      const t = k / n;
      parts.push(box(0.06, h, 0.06, WHITE, [ax + (bx - ax) * t, y0 + h / 2, az + (bz - az) * t]));
    }
    parts.push(box(0.07, 0.07, len, WHITE, [(ax + bx) / 2, y0 + h, (az + bz) / 2], { ry: Math.atan2(bx - ax, bz - az) }));
  }
  return parts;
}

// A little fish (in the bucket, on the hook).
export function smallFish(color) {
  return segment([
    ball(0.12, color, [0, 0, 0], { sx: 0.55, sy: 0.8, sz: 1.6 }, 0),
    box(0.02, 0.18, 0.14, color, [0, 0, -0.24]),
    ball(0.025, DARK, [0.05, 0.03, 0.12], {}, 0),
    ball(0.025, DARK, [-0.05, 0.03, 0.12], {}, 0),
  ]);
}
