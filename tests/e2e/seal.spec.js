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
    await expect(page.locator('body')).toContainText('Ứng dụng đã bị chỉnh sửa nên không thể tải');
    await expect(page.getByRole('button', { name: /Tải lại/ })).toBeVisible();
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

// What the app (and the screenshot tests) hide on purpose, and the camera looking away, are not tampering.
test('hiding what moves, a tour, the camera looking away: the sign is still fine', async ({ page }) => {
  test.setTimeout(300_000);
  await openWorld(page, 'nghinhphong');
  const message = await page.evaluate(() => {
    const { W, camera } = window.__pyn;
    for (const g of [W.seacraft?.group, W.beach?.group, W.host?.group]) if (g) g.visible = false;
    for (const w of [...W.people, ...W.pedestrians]) w.group.visible = false;
    W.scene.traverse((o) => { if (o.isSprite) o.visible = false; });
    camera.position.set(0, 400, 0);
    camera.lookAt(0, 400, -1); // (looking at the sky: the sign is culled)
    let sign;
    W.scene.traverse((o) => { if (o.material?.map?.userData?.seal) sign = o; });
    sign.parent.visible = false; // (a moment with its group off: let pass)
    try {
      W.checkSeal();
      sign.parent.visible = true;
      for (let i = 0; i < 6; i++) W.checkSeal();
    } catch (e) { return e.message; }
    return null;
  });
  expect(message).toBeNull();
  await page.keyboard.press('KeyI');
  await page.waitForTimeout(3000); // (the frame loop keeps checking)
  await expect(page.locator('#tampered')).toHaveCount(0);
  expect(page.errors).toEqual([]);
});

test("the sign's group kept switched off: the app stops", async ({ page }) => {
  await openWorld(page, 'nghinhphong');
  const message = await page.evaluate(() => {
    const { W } = window.__pyn;
    let sign;
    W.scene.traverse((o) => { if (o.material?.map?.userData?.seal) sign = o; });
    sign.parent.visible = false;
    try { for (let i = 0; i < 3; i++) W.checkSeal(); } catch (e) { return e.message; }
    return null;
  });
  expect(message).toMatch(/bị chỉnh sửa/);
});
