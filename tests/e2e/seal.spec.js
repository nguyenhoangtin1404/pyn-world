import { test, expect, openWorld } from './helpers.js';

// The sea sign is sealed (src/world/seal.js): hiding it, swapping its words or taking it out stops the app.
for (const [what, tamper] of [
  ['hidden', (m) => { m.visible = false; }],
  ['resized', (m) => m.scale.set(2, 2, 2)],
  ['taken out of the scene', (m) => m.removeFromParent()],
  ['texture swapped', (m) => { m.material.map = m.material.map.clone(); m.material.map.userData = {}; }],
]) {
  test(`the sea sign ${what}: the app stops`, async ({ page }) => {
    await openWorld(page, 'nghinhphong');
    const message = await page.evaluate((src) => {
      const { W } = window.__pyn;
      let sign;
      W.scene.traverse((o) => { if (o.material?.map?.userData?.seal) sign = o; });
      new Function('m', `(${src})(m)`)(sign);
      try { W.checkSeal(); } catch (e) { return e.message; }
      return null;
    }, tamper.toString());
    expect(message).toMatch(/bị chỉnh sửa/);
    await expect(page.locator('body')).toContainText('bị chỉnh sửa');
  });
}

test('without the sign the world does not build', async ({ page }) => {
  await openWorld(page, 'nghinhphong');
  const message = await page.evaluate(() => {
    const { W } = window.__pyn;
    W.seal = null;
    try { W.checkSeal(); } catch (e) { return e.message; }
    return null;
  });
  expect(message).toMatch(/bị chỉnh sửa/);
});
