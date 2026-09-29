import { WORLDS } from '../../src/worlds/index.js';
import { test, expect, openWorld } from './helpers.js';

// The keyboard shortcuts (see the help panel): camera modes, fly-to spots, time, pause, HUD, pixels.
test('keyboard shortcuts', async ({ page }) => {
  await openWorld(page, WORLDS[0].id);
  const state = () => page.evaluate(() => ({ ...window.__pyn.state }));
  const toast = page.locator('#toast');

  await page.keyboard.press('Digit2');
  expect((await state()).mode).toBe('train');
  await expect(toast).toHaveText('Camera: Theo tàu');

  await page.keyboard.press('Digit6');
  expect((await state()).mode).toBe('person');
  await expect(toast).toHaveText(/^Đang theo: /);

  await page.keyboard.press('KeyK');
  expect((await state()).mode).toBe('overview');
  await expect(toast).toHaveText('Bay lên đỉnh núi ⛰');

  await page.keyboard.press('KeyT');
  expect((await state()).timeOfDay).not.toBe('day');

  await page.keyboard.press('Space');
  expect((await state()).paused).toBe(true);
  await expect(toast).toHaveText('Tạm dừng');
  await page.keyboard.press('Space');
  expect((await state()).paused).toBe(false);

  await page.keyboard.press('KeyP');
  expect((await state()).pixel).toBe(2);

  await page.keyboard.press('KeyH');
  await expect(page.locator('#app')).toHaveClass(/hud-hidden/);
  await page.keyboard.press('KeyH');
  await expect(page.locator('#app')).not.toHaveClass(/hud-hidden/);

  // Typing in a field is not a shortcut.
  await page.locator('#weather').focus();
  await page.keyboard.press('Digit3');
  expect((await state()).mode).toBe('overview');
  expect(page.errors).toEqual([]);
});
