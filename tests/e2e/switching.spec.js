import { WORLDS } from '../../src/worlds/index.js';
import { test, expect, openWorld, waitForWorld } from './helpers.js';

// Switching worlds (key N) frees the old one: coming back to a world, the GPU holds the same number
// of geometries, textures and shader programs as the first time.
test('switching worlds frees the old one', async ({ page }) => {
  test.skip(WORLDS.length < 2, 'only one world');
  await openWorld(page, WORLDS[0].id);
  const gpu = () =>
    page.evaluate(() => {
      const { memory, programs } = window.__pyn.renderer.info;
      return { geometries: memory.geometries, textures: memory.textures, programs: programs.length };
    });
  const first = {};
  for (let round = 0; round < 2; round++) {
    for (let i = 1; i <= WORLDS.length; i++) {
      const { id } = WORLDS[i % WORLDS.length];
      await page.keyboard.press('KeyN');
      await waitForWorld(page, id);
      await page.waitForTimeout(500);
      const now = await gpu();
      if (round === 0) first[id] = now;
      else expect(now, `${id}, second time`).toEqual(first[id]);
    }
  }
  expect(page.errors).toEqual([]);
});
