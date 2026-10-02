import { beforeAll, describe, expect, it } from 'vitest';
import cfg from '../../src/worlds/nghinhphong.js';
import { auditRoads } from '../../src/world/streetnet.js';

describe('NGHINH PHONG', () => {
  beforeAll(() => cfg.load());

  it('has the tower and the centre of its half circle on the centre line of the street that meets its square', () => {
    const lm = cfg.landmarks[0];
    const axis = [Math.cos(lm.rotation), -Math.sin(lm.rotation)]; // the tower's front (local +x), and the half circle's centre lies behind it
    const cross = cfg.roads.filter((r) => r.name === 'Nguyễn Hữu Thọ' && r.points.some(([x, z]) => Math.hypot(x - lm.p[0], z - lm.p[1]) < 30));
    expect(cross).toHaveLength(1);
    const pts = cross[0].points.filter(([x, z]) => Math.hypot(x - lm.p[0], z - lm.p[1]) < 40);
    // How far each point of that street's middle lies from the axis (a line through the tower).
    const off = pts.map(([x, z]) => (x - lm.p[0]) * axis[1] - (z - lm.p[1]) * axis[0]);
    expect(Math.max(...off.map(Math.abs))).toBeLessThan(0.3);
  });

  it('has road data with nothing left to mend (streetnet.auditRoads)', () => {
    expect(auditRoads(cfg.roads)).toEqual([]);
  });

  it('has its big roads as boulevards: four lanes and a median', () => {
    const big = cfg.roads.filter((r) => r.median);
    expect(big.length).toBeGreaterThan(5);
    for (const r of big) expect(r.width).toBeGreaterThan(r.median + 4);
    // …and no streetnet road drawn twice side by side
    expect(cfg.roads.filter((r) => r.name === 'Lê Duẩn')).toHaveLength(2);
  });
});
