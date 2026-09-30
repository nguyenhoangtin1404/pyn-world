import { beforeAll, describe, expect, it } from 'vitest';
import { defineWorld } from '../../src/worlds/define.js';
import { WORLDS, worldById } from '../../src/worlds/index.js';
import pyn from '../../src/worlds/pyn.js';
import { World } from '../../src/World.js';
import { FEATURES } from '../../src/features/index.js';

describe('defineWorld', () => {
  it('builds riverX from the waves', () => {
    // The formula PYN's river always had.
    const original = (z) => -25 + 42 * Math.sin(z * 0.011 + 0.9) + 10 * Math.sin(z * 0.034 + 2.0);
    for (let z = -300; z <= 300; z += 17) expect(pyn.riverX(z)).toBe(original(z));
  });

  it('writes the same river as GLSL, with float literals', () => {
    const cfg = defineWorld({ ...pyn, river: { x0: 3, waves: [[-2, 0.5, 1]] } });
    expect(cfg.riverGLSL).toBe('float riverX(float z) { return 3.0 + (-2.0) * sin(z * 0.5 + (1.0)); }');
  });
});

describe('world configs', () => {
  for (const cfg of WORLDS) {
    describe(cfg.id, () => {
      beforeAll(() => cfg.load?.()); // worlds from map data: as the app does before building

      it('has unique stops on the loop, each with a name', () => {
        const ids = cfg.stops.map((s) => s.id);
        expect(new Set(ids).size).toBe(ids.length);
        for (const s of cfg.stops) {
          expect(s.at >= 0 && s.at < 1).toBe(true);
          expect(s.name).toBeTruthy();
        }
      });

      it('lists known features in an order that satisfies their needs', () => {
        for (const f of cfg.features) expect(FEATURES[typeof f === 'string' ? f : f.id]).toBeDefined();
        expect(() => new World(cfg).steps()).not.toThrow();
      });

      it('has a track of (x, z) points inside the diorama', () => {
        const pts = cfg.track();
        expect(pts.length).toBeGreaterThanOrEqual(4);
        for (const [x, z] of pts) expect(Math.max(Math.abs(x), Math.abs(z))).toBeLessThan(cfg.size / 2);
      });
    });
  }

  it('worldById falls back to the first world', () => {
    expect(worldById('maple').id).toBe('maple');
    expect(worldById('nope')).toBe(WORLDS[0]);
    expect(worldById(null)).toBe(WORLDS[0]);
  });
});

describe('feature list checks (before building)', () => {
  const steps = (features) => () => new World({ ...pyn, features }).steps();

  it('rejects an unknown feature', () => {
    expect(steps(['station', 'dragons', 'train'])).toThrow(/"dragons"/);
  });

  it('needs a train', () => {
    expect(steps(['station'])).toThrow(/"train"/);
  });

  it('checks the order of needs', () => {
    expect(steps(['station', 'villagers', 'train'])).toThrow(/"villagers" cần "train"/);
    expect(steps(['station', 'train', 'villagers'])).not.toThrow();
  });

  it('accepts any one of alternative needs', () => {
    expect(steps(['village', 'station', 'train'])).toThrow(/"station" hoặc "halt"/);
    expect(steps(['halt', 'village', 'train'])).not.toThrow();
  });
});

describe('random streams', () => {
  it('gives each feature its own stream unless they share one', () => {
    const a = new World(pyn), b = new World(pyn);
    expect(a.rngFor({ id: 'sheep' })()).toBe(b.rngFor({ id: 'sheep' })());
    expect(a.rngFor({ id: 'sheep' })()).not.toBe(a.rngFor({ id: 'trees' })());
    // A shared stream is one sequence: the second feature continues where the first stopped.
    const s1 = a.rngFor({ id: 'x', stream: 3 }), s2 = a.rngFor({ id: 'y', stream: 3 });
    expect(s1).toBe(s2);
  });
});
