import { test, expect, openWorld } from './helpers.js';

// On a phone (project "mobile" in playwright.config.js: Pixel 7, touch, a coarse pointer): NGHINH PHONG
// builds, the control panel opens with a tap, there is no shortcuts button (no keyboard), a tap on the author
// opens their card, and the narrated tour starts and stops by tapping.
test('NGHINH PHONG on a phone: panel, no shortcuts, the author, the tour', async ({ page }) => {
  test.setTimeout(300_000);
  await page.route('**/tour/*.mp3*', (route) => route.fulfill({ status: 404 })); // (subtitles only)
  await openWorld(page, 'nghinhphong');
  expect(await page.evaluate(() => matchMedia('(pointer: coarse)').matches)).toBe(true);

  // The panel: folded at first, a tap opens it.
  const toggle = page.locator('#panel-toggle');
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await toggle.tap();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('#panel-content')).toBeVisible();

  // No keyboard: the shortcuts button and list stay hidden, even with "Nâng cao" open.
  await page.locator('#advanced summary').tap();
  await expect(page.locator('#advanced')).toHaveAttribute('open', '');
  await expect(page.locator('#help-btn')).toBeHidden();
  await expect(page.locator('#help')).toBeHidden();
  await page.locator('#advanced summary').tap();

  // The author: brought on screen (a phone held upright sees less of the square), then tapped.
  const card = page.locator('#host-card');
  await expect(card).toBeHidden();
  await page.evaluate(() => {
    const { W, rig } = window.__pyn;
    const h = W.host, tall = h.head.y - h.person.group.position.y;
    rig.setMode('overview', { fly: false });
    rig.camera.position.copy(h.head).addScaledVector(h.facing, tall * 8).setY(h.head.y + tall * 2);
    rig.controls.target.copy(h.person.group.position);
    rig.controls.update();
  });
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  const at = await page.evaluate(() => {
    const { W, camera } = window.__pyn;
    const v = W.host.head.clone().lerp(W.host.person.group.position, 0.4).project(camera);
    const x = ((v.x + 1) / 2) * innerWidth, y = ((1 - v.y) / 2) * innerHeight;
    return { x, y, onCanvas: document.elementFromPoint(x, y)?.tagName === 'CANVAS' };
  });
  expect(at.onCanvas, `the author is on screen, not under a panel (${at.x.toFixed(0)}, ${at.y.toFixed(0)})`).toBe(true);
  await page.touchscreen.tap(at.x, at.y);
  await expect(card).toBeVisible();
  await page.locator('#host-close').tap();
  await expect(card).toBeHidden();

  // The tour: a tap on its chip starts it (the panel steps aside), a tap on ✕ stops it.
  const box = page.locator('#narration');
  await expect(box).toBeHidden();
  await page.getByRole('button', { name: /Thuyết minh/ }).first().tap();
  await expect(box).toBeVisible();
  await expect(page.locator('#narration-step')).toHaveText(/^1\//);
  await page.locator('#narration-next').tap();
  await expect(page.locator('#narration-step')).toHaveText(/^2\//);
  await page.locator('#narration-stop').tap();
  await expect(box).toBeHidden();
  expect(page.errors).toEqual([]);
});
