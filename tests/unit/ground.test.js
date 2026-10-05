import { describe, expect, it, vi } from 'vitest';
import { createTerrain } from '../../src/world/terrain.js';
import { noTrack } from '../../src/world/track.js';
import { createRivers } from '../../src/world/rivers.js';
import { Walker, STEP_LENGTH } from '../../src/world/walker.js';
import { checkWorldData } from '../../src/world/geodata.js';
import { openLine } from '../../src/features/streets.js';
import { mulberry32 } from '../../src/utils.js';

// The terrain draws its name plate on a canvas: in Node, a canvas that draws nothing.
const ctx = new Proxy({}, { get: (o, k) => (k in o ? o[k] : () => ({ addColorStop() {}, width: 10 })), set: (o, k, v) => ((o[k] = v), true) });
vi.stubGlobal('document', { createElement: () => ({ getContext: () => ctx }) });

describe('terrain.meshHeightAt', () => {
  // Small, bumpy ground from "map data" (cfg.heights): no railway, no river, no pads.
  const cfg = { size: 30, cell: 3, name: 'T', heights: (x, z) => 1 + x * 0.3 + Math.sin(z * 0.9) * 2 + Math.cos(x * 0.7) * 1.5 };
  const terrain = createTerrain(cfg, noTrack(), [], createRivers(cfg));
  const pos = terrain.mesh.geometry.attributes.position;

  // The height of the drawn triangle under (x, z): found by brute force among the mesh's triangles.
  const drawnAt = (x, z) => {
    for (let t = 0; t < pos.count; t += 3) {
      const [ax, ay, az, bx, by, bz, cx, cy, cz] = [0, 1, 2].flatMap((k) => [pos.getX(t + k), pos.getY(t + k), pos.getZ(t + k)]);
      const d = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz);
      const u = ((bz - cz) * (x - cx) + (cx - bx) * (z - cz)) / d;
      const v = ((cz - az) * (x - cx) + (ax - cx) * (z - cz)) / d;
      const w = 1 - u - v;
      if (u >= -1e-9 && v >= -1e-9 && w >= -1e-9) return u * ay + v * by + w * cy;
    }
    return NaN;
  };

  it('is heightAt() at the grid corners', () => {
    for (const [x, z] of [[-15, -15], [0, 0], [3, -6], [15, 15], [-9, 12]]) expect(terrain.meshHeightAt(x, z)).toBeCloseTo(terrain.heightAt(x, z), 5);
  });

  it('is the height of the triangle drawn there, on both halves of every cell', () => {
    const rng = mulberry32(7);
    for (let i = 0; i < 300; i++) {
      const x = (rng() - 0.5) * 29.8, z = (rng() - 0.5) * 29.8;
      expect(terrain.meshHeightAt(x, z), `at ${x.toFixed(2)}, ${z.toFixed(2)}`).toBeCloseTo(drawnAt(x, z), 4);
    }
    // Either side of a cell's diagonal, close to it.
    for (const [x, z] of [[1.4, 1.5], [1.6, 1.5], [-4.6, -4.4], [-4.4, -4.6]]) expect(terrain.meshHeightAt(x, z)).toBeCloseTo(drawnAt(x, z), 4);
  });

  it('is not heightAt() between the corners (the ground is bumpy, the triangles flat)', () => {
    const off = [[1.3, 1.1], [4.2, -7.7], [-10.5, 6.2]].map(([x, z]) => Math.abs(terrain.meshHeightAt(x, z) - terrain.heightAt(x, z)));
    expect(Math.max(...off)).toBeGreaterThan(0.01);
  });

  it('holds at the edges of the board (no cell past the last)', () => {
    expect(terrain.meshHeightAt(15, 15)).toBeCloseTo(terrain.heightAt(15, 15), 5);
    expect(terrain.meshHeightAt(-15, 15)).toBeCloseTo(terrain.heightAt(-15, 15), 5);
    expect(Number.isFinite(terrain.meshHeightAt(16, -16))).toBe(true);
  });
});

describe('Walker.step: the walk cycle follows the ground covered, not the time', () => {
  const flat = () => 0;
  const walk = (speed, scale, metres, dt = 0.05, change = null) => {
    const w = new Walker(mulberry32(3), flat, { speed });
    w.group.scale.setScalar(scale);
    w.place({ x: 0, z: 0 });
    const far = { x: 0, z: 1000 };
    let t = 0;
    while (w.pos.z < metres) {
      if (change && w.pos.z > metres / 2) w.speed = change;
      w.step(far, dt, (t += dt));
    }
    return { gait: w.gait, went: w.pos.z };
  };

  it('half a cycle (π) is one step of STEP_LENGTH × scale', () => {
    const { gait, went } = walk(1.4, 0.85, 20);
    expect(gait).toBeCloseTo((went * Math.PI) / (STEP_LENGTH * 0.85), 6);
  });

  it('the same per metre at any speed, or when the speed changes half way', () => {
    const per = ({ gait, went }) => gait / went;
    const slow = per(walk(0.5, 0.85, 20)), fast = per(walk(3, 0.85, 20)), changed = per(walk(0.5, 0.85, 20, 0.05, 3));
    expect(fast).toBeCloseTo(slow, 6);
    expect(changed).toBeCloseTo(slow, 6);
    // …and at any frame rate.
    expect(per(walk(1.4, 0.85, 20, 0.2))).toBeCloseTo(slow, 6);
  });

  it('smaller people take more steps per metre', () => {
    const adult = walk(1.4, 0.85, 10), child = walk(1.4, 0.55, 10);
    expect(child.gait / child.went).toBeCloseTo(((adult.gait / adult.went) * 0.85) / 0.55, 6);
  });

  it('standing still (or paused: dt 0) the legs don\'t move', () => {
    const w = new Walker(mulberry32(3), flat);
    w.place({ x: 0, z: 0 });
    w.step({ x: 0, z: 0 }, 0.1, 0);
    w.step({ x: 0, z: 5 }, 0, 0);
    expect(w.gait).toBe(0);
  });
});

describe('checkWorldData lists every error in a broken file', () => {
  it('one line for each thing wrong, nothing for what is right', () => {
    const errs = checkWorldData({
      version: 0,
      // no name
      frame: { center: [91, 0], metersPerUnit: -1, verticalScale: 0 },
      heights: { south: 2, west: 'w', north: 1, east: 5, rows: 1, cols: 2, data: 7 },
      rivers: [{ id: 'r', width: 0, points: [[0, 0], [0, 200]] }, { points: [[0, 0]] }],
      rails: 'none',
      roads: [{ kind: 'lane', points: [[0, 0], [1, 1]] }, { kind: 'primary', points: [[0, 0], ['a', 1]] }],
      buildings: { count: 1.5, data: '' },
      places: [{ id: 'p', name: 'P', kind: 'peak', at: [0, 0] }, { id: 'q', at: [0] }],
    });
    expect(errs).toEqual([
      'version phải là 1 (đang là 0)',
      'thiếu name',
      'frame.center phải là [lat, lon]',
      'frame.metersPerUnit phải > 0',
      'frame.verticalScale phải > 0',
      'heights.west phải là số',
      'heights: north > south và east > west',
      'heights: ít nhất 2 × 2 điểm',
      'heights.data phải là base64',
      'rivers[0] ("r").points[1] phải là [lat, lon]',
      'rivers[0] ("r"): width (mét) phải > 0',
      'rivers[1]: thiếu id',
      'rivers[1]: points cần ít nhất 2 điểm',
      'rivers[1]: width (mét) phải > 0',
      'rails phải là mảng',
      'roads[0]: kind phải là một trong motorway, trunk, primary, secondary, tertiary, unclassified, residential, living_street, pedestrian, service, track, road (đang là lane)',
      'roads[1].points[1] phải là [lat, lon]',
      'buildings.count phải là số nguyên ≥ 0',
      'places[1]: cần id, name, kind',
      'places[1] ("q"): at phải là [lat, lon]',
    ]);
  });

  it('nothing at all for a good file', () => {
    // 2 × 2 heights (8 bytes) and one building (7 Int16: 14 bytes).
    const ok = {
      version: 1, name: 'T', frame: { center: [13, 109], metersPerUnit: 5 },
      heights: { south: 12.99, west: 108.99, north: 13.01, east: 109.01, rows: 2, cols: 2, data: 'AAAAAAAAAAA=' },
      rivers: [], rails: [{ id: 'rail', points: [[13, 109], [13.001, 109]] }], places: [{ id: 'p', name: 'P', kind: 'peak', at: [13, 109] }],
      roads: [{ kind: 'primary', points: [[13, 109], [13.001, 109]] }],
      buildings: { count: 1, data: Buffer.alloc(14).toString('base64') },
    };
    expect(checkWorldData(ok)).toEqual([]);
  });

  it('not even an object: says so', () => {
    expect(checkWorldData(null)).toEqual(['không phải object JSON']);
  });
});

describe('streets: openLine (a street walked by distance)', () => {
  const line = openLine([[0, 0], [3, 4], [3, 10]]);

  it('is as long as its pieces', () => expect(line.length).toBeCloseTo(11, 9));

  it('finds the point at a distance, piece by piece, held to its ends', () => {
    expect(line.pointAt(0)).toEqual([0, 0]);
    expect(line.pointAt(2.5)[0]).toBeCloseTo(1.5, 9);
    expect(line.pointAt(2.5)[1]).toBeCloseTo(2, 9);
    expect(line.pointAt(5)).toEqual([3, 4]);
    expect(line.pointAt(8)).toEqual([3, 7]);
    expect(line.pointAt(-3)).toEqual([0, 0]);
    expect(line.pointAt(99)).toEqual([3, 10]);
  });

  it('heads along it (a rotation.y: atan2(dx, dz))', () => {
    expect(line.headingAt(9)).toBeCloseTo(0, 9); // up +z
    expect(line.headingAt(2)).toBeCloseTo(Math.atan2(3, 4), 9);
  });

  it('copes with repeated points (a piece of length 0)', () => {
    const l = openLine([[0, 0], [0, 0], [0, 2]]);
    expect(l.length).toBe(2);
    expect(l.pointAt(1)).toEqual([0, 1]);
  });
});
