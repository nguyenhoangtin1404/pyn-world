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

  // Nothing to follow: this world has no vehicles.
  await page.keyboard.press('Digit8');
  await expect(toast).toHaveText('Thế giới này không có gì để theo');
  expect((await state()).mode).toBe('overview');

  // No famous buildings here either (those are in worlds from map data).
  await page.keyboard.press('KeyV');
  await expect(toast).toHaveText('Thế giới này không có công trình nổi tiếng');

  // The controls start folded away (the picture first); the button opens them.
  await expect(page.locator('#weather')).toBeHidden();
  await page.locator('#panel-toggle').click();
  await expect(page.locator('#panel-toggle')).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('#weather')).toBeVisible();

  // Typing in a field is not a shortcut.
  await page.locator('#weather').focus();
  await page.keyboard.press('Digit3');
  expect((await state()).mode).toBe('overview');
  expect(page.errors).toEqual([]);
});

test('V flies to each famous building of a world from map data', async ({ page }) => {
  await openWorld(page, 'tuyhoa');
  const toast = page.locator('#toast');
  await page.keyboard.press('KeyV');
  await expect(toast).toHaveText('Bay tới Tháp Nghinh Phong 🏛');
  await page.keyboard.press('KeyV');
  await expect(toast).toHaveText('Bay tới Núi Nhạn – Tháp Nhạn 🏛');
  await page.keyboard.press('KeyV');
  await expect(toast).toHaveText('Bay tới Tháp Nghinh Phong 🏛'); // round again
  expect(page.errors).toEqual([]);
});

test('quick views: the tower, the tourists, the balloons', async ({ page }) => {
  await openWorld(page, 'nghinhphong');
  const state = () => page.evaluate(() => ({ ...window.__pyn.state }));
  const toast = page.locator('#toast');
  await page.keyboard.press('KeyV');
  await expect(toast).toHaveText('Bay tới Tháp Nghinh Phong 🏛');
  await page.keyboard.press('Digit9');
  expect((await state()).mode).toBe('tourist');
  await expect(toast).toHaveText(/^Đang theo: Du khách /);
  const first = await toast.textContent();
  await page.keyboard.press('Digit9');
  await expect(toast).not.toHaveText(first); // again: the next one
  await page.keyboard.press('Digit0');
  expect((await state()).mode).toBe('balloon');
  await expect(toast).toHaveText(/^Đang theo: Khinh khí cầu /);
  // The chips (in the panel: open it): the tower's; none for 9 and 0 — 6 follows tourists too, 7 the balloons.
  await page.locator('#panel-toggle').click();
  await expect(page.locator('#camera-modes button', { hasText: 'Tháp' })).toBeVisible();
  await expect(page.locator('#camera-modes button', { hasText: 'Du khách' })).toHaveCount(0);
  await expect(page.locator('#camera-modes button', { hasText: 'Khinh khí cầu' })).toHaveCount(0);
  // The shortcuts list only names keys that do something here: no train, bridge, sheep, river or other world.
  await page.locator('#advanced summary').click(); // (the shortcuts list opens from "Nâng cao")
  await page.locator('#help-btn').click();
  const help = page.locator('#help');
  for (const key of ['V', 'I', '6', '9']) await expect(help.locator('div:not([hidden]) > dt', { hasText: new RegExp(`^${key}$`) })).toHaveCount(1);
  for (const key of ['B', 'F', 'G', 'K', 'J', 'L', 'N']) await expect(help.locator('div:not([hidden]) > dt', { hasText: new RegExp(`^${key}$`) })).toHaveCount(0);
  expect(page.errors).toEqual([]);
});
