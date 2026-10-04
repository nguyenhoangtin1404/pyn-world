import { test, expect, openWorld } from './helpers.js';

// The author on the tower's square (features/host.js, src/app/host.js): on screen from the default view, a
// few pixels tall and nothing over their head; a tap on them flies up to them and opens a bubble with a QR
// code and a link to their portfolio; Esc closes it, and a tap elsewhere doesn't open it.
test('the author shows a QR code of their portfolio when tapped', async ({ page }) => {
  test.setTimeout(300_000);
  await openWorld(page, 'nghinhphong');
  const card = page.locator('#host-card');
  await expect(card).toBeHidden();

  // Where they are on screen: halfway between their head and their feet.
  const body = () => page.evaluate(() => {
    const { W, camera } = window.__pyn;
    const v = W.host.head.clone().lerp(W.host.person.group.position, 0.4).project(camera);
    return { x: ((v.x + 1) / 2) * innerWidth, y: ((1 - v.y) / 2) * innerHeight, behind: v.z > 1 };
  });
  // Nothing over their head.
  expect(await page.evaluate(() => window.__pyn.W.host.group.children.some((o) => o.isSprite))).toBe(false);
  // From afar they look at the tower, not grinning.
  const turned = () => page.evaluate(() => {
    const { W, camera } = window.__pyn, h = W.host, g = h.person.group;
    const toCam = Math.atan2(camera.position.x - g.position.x, camera.position.z - g.position.z);
    return { facing: h.facingCamera, off: Math.abs(Math.atan2(Math.sin(toCam - g.rotation.y), Math.cos(toCam - g.rotation.y))), grin: h.person.grin.scale.x };
  });
  const far = await turned();
  expect(far.facing).toBe(false);
  expect(far.grin).toBe(0);
  const at = await body();
  expect(at.behind).toBe(false);
  expect(at.x).toBeGreaterThan(0);
  expect(at.x).toBeLessThan(page.viewportSize().width);
  expect(at.y).toBeGreaterThan(0);
  expect(at.y).toBeLessThan(page.viewportSize().height);

  // A tap on the sky does nothing.
  await page.mouse.click(10, 80);
  await expect(card).toBeHidden();

  await page.mouse.click(at.x, at.y);
  await expect(card).toBeVisible();
  await expect(page.locator('#host-title')).toHaveText('nguyenhoangtin.com');
  const link = page.locator('#host-link');
  await expect(link).toHaveAttribute('href', 'https://nguyenhoangtin.com');
  await expect(link).toHaveAttribute('target', '_blank');
  await expect(link).toHaveAttribute('rel', /noopener/);
  await expect(page.locator('#host-qr svg')).toHaveAttribute('aria-label', /nguyenhoangtin\.com/);
  // The camera has come up to them.
  await page.waitForFunction(() => !window.__pyn.rig.fly, null, { timeout: 60_000 });
  const away = await page.evaluate(() => window.__pyn.camera.position.distanceTo(window.__pyn.W.host.head));
  expect(away).toBeLessThan(15);
  // Up close they turn round to the camera, look into it and grin.
  await page.waitForFunction(() => window.__pyn.W.host.facingCamera, null, { timeout: 30_000 });
  const close = await turned();
  expect(close.off).toBeLessThan(0.35);
  expect(close.grin).toBe(1);

  await page.keyboard.press('Escape');
  await expect(card).toBeHidden();
  // Tapping them up close opens it again.
  const near = await body();
  await page.mouse.click(near.x, near.y);
  await expect(card).toBeVisible();
  await page.locator('#host-close').click();
  await expect(card).toBeHidden();
  expect(page.errors).toEqual([]);
});

// Worlds without the feature have no author.
test('no author where the world has none', async ({ page }) => {
  await openWorld(page, 'pyn');
  expect(await page.evaluate(() => window.__pyn.W.host)).toBeNull();
  expect(page.errors).toEqual([]);
});
