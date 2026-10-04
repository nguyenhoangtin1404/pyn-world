import { test, expect, openWorld } from './helpers.js';

// The author on the tower's square (features/host.js, src/app/host.js): the "👋" over their head is on screen
// from the default view; a tap on it flies up to them and opens a bubble with a QR code and a link to their
// portfolio; Esc closes it, and a tap elsewhere doesn't open it.
test('the author shows a QR code of their portfolio when tapped', async ({ page }) => {
  test.setTimeout(300_000);
  await openWorld(page, 'nghinhphong');
  const card = page.locator('#host-card');
  await expect(card).toBeHidden();

  // Where the marker's bubble is on screen (its tail is at its position; the round part just above).
  const marker = () => page.evaluate(() => {
    const { W, camera } = window.__pyn;
    const m = W.host.marker, v = m.position.clone().project(camera), h = innerHeight;
    return { x: ((v.x + 1) / 2) * innerWidth, y: ((1 - v.y) / 2) * h - m.scale.y * h * 0.55, behind: v.z > 1 };
  });
  const at = await marker();
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
  const near = await page.evaluate(() => window.__pyn.camera.position.distanceTo(window.__pyn.W.host.head));
  expect(near).toBeLessThan(15);

  await page.keyboard.press('Escape');
  await expect(card).toBeHidden();
  // Tapping them up close opens it again.
  const body = await page.evaluate(() => {
    const { W, camera } = window.__pyn;
    const p = W.host.head.clone().lerp(W.host.person.group.position, 0.4).project(camera);
    return { x: ((p.x + 1) / 2) * innerWidth, y: ((1 - p.y) / 2) * innerHeight };
  });
  await page.mouse.click(body.x, body.y);
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
