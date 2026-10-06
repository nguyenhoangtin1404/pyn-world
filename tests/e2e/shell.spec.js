import { test, expect, openWorld, waitForWorld } from './helpers.js';

// The app around the scene: what a browser without WebGL sees (src/app/fallback.js), the About dialog, the
// canvas's name for screen readers, the quality tier for phones (src/app/perf.js) and a lost GPU context.

test('without WebGL: a photo of the tower, a few words and a retry button — not an endless loading screen', async ({ page }) => {
  await page.addInitScript(() => {
    const get = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, ...rest) {
      return /webgl/.test(type) ? null : get.call(this, type, ...rest);
    };
  });
  await page.goto('/?clock=fast');
  const box = page.locator('#fallback');
  await expect(box).toBeVisible();
  await expect(box).toHaveAttribute('data-reason', 'nogl');
  await expect(box.locator('img')).toHaveAttribute('src', /og\.png$/);
  expect(await box.locator('img').evaluate((img) => img.complete && img.naturalWidth > 0)).toBe(true);
  await expect(box).toContainText('HUNI architectes'); // (the About dialog's own words)
  await expect(page.locator('#loading')).toBeHidden();
  await expect(page.getByRole('button', { name: /Thử lại/ })).toBeFocused();
  expect(await page.evaluate(() => 'THREE' in window || !!window.__pyn)).toBe(false); // (the app itself was never fetched)
  await page.screenshot({ path: test.info().outputPath('fallback.png') });
  await page.getByRole('button', { name: /Thử lại/ }).click(); // (reloads: still no WebGL, the same card)
  await expect(page.locator('#fallback')).toBeVisible();
  expect(page.errors).toEqual([]);
});

test('the tower world: About dialog, canvas name, no snow, and a lost GPU context offers a reload', async ({ page }) => {
  test.setTimeout(300_000);
  await openWorld(page, 'nghinhphong');
  const canvas = page.locator('#scene canvas');
  await expect(canvas).toHaveAttribute('role', 'img');
  await expect(canvas).toHaveAttribute('aria-label', /NGHINH PHONG.*Tháp Nghinh Phong/);
  // Desktop: the high tier, as before.
  expect(await page.evaluate(() => [window.__pyn.W.sky.sun.shadow.mapSize.x, window.__pyn.renderer.getContext().getContextAttributes().antialias])).toEqual([2048, true]);

  await page.locator('#panel-toggle').click();
  // No snow in the tropics.
  await expect(page.locator('#weather button', { hasText: 'Tuyết' })).toBeHidden();
  await expect(page.locator('#weather button', { hasText: 'Mưa' })).toBeVisible();

  // About: opens as a modal with the focus inside, Esc closes it and gives the focus back.
  const about = page.locator('#about');
  await expect(about).toBeHidden();
  const btn = page.locator('#about-btn');
  await btn.focus();
  await page.keyboard.press('Enter');
  await expect(about).toBeVisible();
  await expect(about).toContainText('HUNI architectes');
  await expect(about).toContainText('OpenStreetMap');
  await expect(about).toContainText('Overture Maps');
  expect(await page.evaluate(() => document.getElementById('about').contains(document.activeElement))).toBe(true);
  await page.screenshot({ path: test.info().outputPath('about.png') });
  await page.keyboard.press('KeyV'); // (shortcuts wait while the dialog is open)
  expect(await page.evaluate(() => !!window.__pyn.rig.fly)).toBe(false);
  await page.keyboard.press('Escape');
  await expect(about).toBeHidden();
  await expect(btn).toBeFocused();
  await page.locator('#about-btn').click();
  await page.locator('#about-close').click();
  await expect(about).toBeHidden();

  // The GPU drops the context: the loop stops and the page offers a reload.
  await page.evaluate(() => window.__pyn.renderer.getContext().getExtension('WEBGL_lose_context').loseContext());
  await expect(page.locator('#fallback')).toBeVisible();
  await expect(page.locator('#fallback')).toHaveAttribute('data-reason', 'lost');
  expect(page.errors).toEqual([]);
});

test('?quality=low: no MSAA, a 1024² shadow map (what a phone gets)', async ({ page }) => {
  test.setTimeout(300_000);
  await page.goto('/?world=pyn&clock=fast&quality=low');
  await waitForWorld(page, 'pyn');
  expect(await page.evaluate(() => [window.__pyn.W.sky.sun.shadow.mapSize.x, window.__pyn.renderer.getContext().getContextAttributes().antialias])).toEqual([1024, false]);
  // PYN has snow.
  await page.locator('#panel-toggle').click();
  await expect(page.locator('#weather button', { hasText: 'Tuyết' })).toBeVisible();
  expect(page.errors).toEqual([]);
});

test('reduced motion: the tour does not start by itself, and flights are cuts', async ({ page }) => {
  test.setTimeout(300_000);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/?clock=fast'); // (no ?world: a first visit, which would otherwise start the tour)
  await waitForWorld(page, 'nghinhphong');
  await expect(page.locator('#narration')).toBeHidden();
  await page.keyboard.press('KeyI');
  await expect(page.locator('#narration')).toBeVisible();
  expect(await page.evaluate(() => document.activeElement?.id)).toBe('narration');
  expect(await page.evaluate(() => window.__pyn.rig.fly?.dur ?? 0)).toBeLessThan(0.01);
  await page.keyboard.press('Escape');
  await expect(page.locator('#narration')).toBeHidden();
  expect(page.errors).toEqual([]);
});
