import { WORLDS } from '../../src/worlds/index.js';
import { test, expect, openWorld } from './helpers.js';

// Small worlds build and run in the browser (textures, shaders, the loop), and a world missing a
// piece says clearly what is missing. (Checking the feature list alone is a unit test.)
const cases = {
  'train only': { features: ['train'] },
  'station and train': { features: ['station', 'train'] },
  'no houses': { features: ['station', 'halt', 'train', 'villagers', 'birds'] },
  'life without scenery': { features: ['station', 'train', 'fish', 'boats', 'balloons', 'hikers'] },
  'three stops, no tunnel': { features: ['station', 'village', 'halt', 'halt', 'train', 'villagers'], stops: 3, tunnel: false },
  'village by a stop without a zone': { features: [{ id: 'halt', stop: 'extra' }, 'village', 'train'], stops: 3, error: /"village".*zone/ },
  'road, traffic and planes': { world: 'maple', features: ['station', { id: 'road', stop: 'vale', inset: { a1: 22, b: 20 } }, 'traffic', 'train', 'aircraft'] },
  'road over the railway': { world: 'maple', features: ['station', { id: 'road', stop: 'vale', inset: { a1: 22 } }, 'train'], error: /Đường .* đè lên đường ray/ },
  'traffic without a road': { features: ['station', 'traffic', 'train'], error: /"traffic".*"road"/ },
  'ring road with traffic lights, no roundabout': { world: 'maple', features: ['station', { id: 'road', stop: 'vale', inset: { a1: 22, b: 20 }, lights: ['a1', { side: 'b0', at: 0.3 }] }, 'traffic', 'train'] },
  'crossroads on a plain ring': { world: 'maple', features: ['station', { id: 'road', stop: 'vale', inset: { a1: 22, b: 20 }, junctions: [{ side: 'a0', at: 0.4 }] }, 'traffic', 'train'] },
  'branch without a roundabout': { world: 'maple', features: ['station', { id: 'road', stop: 'vale', inset: { a1: 22, b: 26 }, branch: 40 }, 'train'], error: /"road" cần một vòng xoay/ },
};

test('small worlds build and run; missing pieces are reported', async ({ page }) => {
  await openWorld(page, WORLDS[0].id);
  const results = await page.evaluate(async (cases) => {
    const { World } = await import('/src/World.js');
    const { WORLDS } = await import('/src/worlds/index.js');
    const { camera, rig } = window.__pyn;
    const out = {};
    for (const [name, { world, features, stops, tunnel }] of Object.entries(cases)) {
      try {
        const cfg = { ...(WORLDS.find((w) => w.id === world) ?? WORLDS[0]), features };
        if (stops === 3) cfg.stops = [...cfg.stops, { id: 'extra', at: 0.75, name: 'EXTRA' }];
        if (tunnel === false) delete cfg.tunnel;
        const w = new World(cfg);
        for (const [, step] of w.steps()) step();
        for (let i = 0; i < 50; i++) {
          w.update({ dt: 0.1, raw: 0.1, speed: 1, camera });
          w.lateUpdate({ raw: 0.1, camera, focus: rig.focus });
        }
        w.dispose();
        out[name] = 'ok';
      } catch (e) {
        out[name] = e.message;
      }
    }
    return out;
  }, Object.fromEntries(Object.entries(cases).map(([k, { error: _, ...rest }]) => [k, rest])));
  for (const [name, { error }] of Object.entries(cases)) {
    if (error) expect(results[name], name).toMatch(error);
    else expect(results[name], name).toBe('ok');
  }
  expect(page.errors).toEqual([]);
});
