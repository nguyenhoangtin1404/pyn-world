import { SHOWN, WORLDS } from '../../src/worlds/index.js';
import { test, expect, openWorld, waitForWorld } from './helpers.js';

// Switching worlds frees the old one: coming back to a world, the GPU holds the same number of
// geometries, textures and shader programs as the first time. Every world, hidden ones too (the
// app switches as key N does, through __pyn.switchWorld).
test('switching worlds frees the old one', async ({ page }) => {
  test.skip(WORLDS.length < 2, 'only one world');
  await openWorld(page, WORLDS[0].id);
  const gpu = () =>
    page.evaluate(() => {
      const { memory, programs } = window.__pyn.renderer.info;
      return { geometries: memory.geometries, textures: memory.textures, programs: programs.length };
    });
  const first = {};
  // (Round 0 only warms the caches kept across worlds — a vehicle's geometry is made by the first world that has one.)
  for (let round = 0; round < 3; round++) {
    for (let i = 1; i <= WORLDS.length; i++) {
      const { id } = WORLDS[i % WORLDS.length];
      await page.evaluate((id) => window.__pyn.switchWorld(id), id);
      await waitForWorld(page, id);
      await page.waitForTimeout(500);
      const now = await gpu();
      if (round === 1) first[id] = now;
      else if (round === 2) expect(now, `${id}, second time`).toEqual(first[id]);
    }
  }
  expect(page.errors).toEqual([]);
});

// The world picker (top left): one button per world; clicking one switches to it, the button of the
// world on screen is pressed, and all of them wait while a world is being built.
test('the world picker switches worlds', async ({ page }) => {
  test.skip(SHOWN.length < 2, 'only one world shown');
  const [first, second] = SHOWN;
  await openWorld(page, first.id);
  const picker = page.getByRole('group', { name: /Chọn thế giới/ });
  const button = (w) => picker.getByRole('button', { name: w.name, exact: true });
  await expect(picker.getByRole('button')).toHaveCount(SHOWN.length);
  await expect(button(first)).toHaveAttribute('aria-pressed', 'true');
  await expect(button(second)).toHaveAttribute('aria-pressed', 'false');

  await button(second).click();
  await expect(button(first)).toBeDisabled(); // while it is being built
  await waitForWorld(page, second.id);
  await expect(button(second)).toHaveAttribute('aria-pressed', 'true');
  await expect(button(first)).toHaveAttribute('aria-pressed', 'false');
  await expect(button(first)).toBeEnabled();

  await button(second).click(); // already on screen: nothing happens
  await expect(button(second)).toHaveAttribute('aria-pressed', 'true');
  expect(await page.evaluate(() => window.__pyn.state.switchingTo)).toBeNull();
  expect(page.errors).toEqual([]);
});

// The app opens on the first world shown; the picker shows only when there is more than one to pick from.
test('opens on the world shown', async ({ page }) => {
  await page.goto('/');
  await waitForWorld(page, SHOWN[0].id);
  const picker = page.locator('#world-picker');
  if (SHOWN.length < 2) await expect(picker).toBeHidden();
  else await expect(picker.getByRole('button', { name: SHOWN[0].name, exact: true })).toHaveAttribute('aria-pressed', 'true');
  expect(page.errors).toEqual([]);
});
