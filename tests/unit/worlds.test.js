import { beforeAll, describe, expect, it } from 'vitest';
import { defineWorld } from '../../src/worlds/define.js';
import { SHOWN, WORLD_IDS, loadWorld, worldId } from '../../src/worlds/index.js';
import { WORLDS } from '../../src/worlds/all.js';
import pyn from '../../src/worlds/pyn.js';
import { World } from '../../src/World.js';
import { FEATURE_IDS, loadFeatures } from '../../src/features/index.js';

// (Some features are loaded only by the worlds that use them: all of them here, as World.load() does.)
beforeAll(() => loadFeatures(FEATURE_IDS));

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
        for (const f of cfg.features) expect(FEATURE_IDS).toContain(typeof f === 'string' ? f : f.id);
        expect(() => new World(cfg).steps()).not.toThrow();
      });

      it('has a track of (x, z) points inside the diorama, or none at all (and then no stops)', () => {
        if (!cfg.track) {
          expect(cfg.stops).toEqual([]);
          return;
        }
        const pts = cfg.track();
        expect(pts.length).toBeGreaterThanOrEqual(4);
        for (const [x, z] of pts) expect(Math.max(Math.abs(x), Math.abs(z))).toBeLessThan(cfg.size / 2);
      });
    });
  }

  it('shows only NGHINH PHONG; loadWorld finds any world, hidden ones too, else the first shown', async () => {
    expect(SHOWN.map((w) => w.id)).toEqual(['nghinhphong']);
    expect(WORLD_IDS).toEqual(WORLDS.map((w) => w.id));
    expect(worldId('maple')).toBe('maple');
    expect(worldId('toString')).toBe('nghinhphong');
    expect(await loadWorld('maple')).toBe(WORLDS.find((w) => w.id === 'maple'));
    expect(await loadWorld('nope')).toBe(SHOWN[0]);
    expect(await loadWorld(null)).toBe(SHOWN[0]);
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

  it('without a railway: no train, and nothing that runs on one', () => {
    const noRail = (features) => () => new World({ ...pyn, track: null, stops: [], tunnel: undefined, features }).steps();
    expect(noRail(['trees', 'birds'])).not.toThrow();
    expect(noRail(['trees', 'train'])).toThrow(/đường ray/);
    expect(noRail(['station'])).toThrow(/"station"/);
  });

  it('checks the order of needs', () => {
    expect(steps(['station', 'villagers', 'train'])).toThrow(/"villagers" cần "train"/);
    expect(steps(['station', 'train', 'villagers'])).not.toThrow();
  });

  it('checks `after`: those of its features the world has come first, the others are not needed', () => {
    const town = (features) => () => new World({ ...pyn, track: null, stops: [], tunnel: undefined, features }).steps();
    const base = ['landmarks', 'streets', 'buildings', 'citytraffic', 'tourists'];
    expect(town([...base, 'streetlife', 'busstop'])).toThrow(/"streetlife" phải đứng sau "busstop"/);
    expect(town([...base, 'busstop', 'streetlife'])).not.toThrow();
    expect(town([...base, 'streetlife'])).not.toThrow();
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
