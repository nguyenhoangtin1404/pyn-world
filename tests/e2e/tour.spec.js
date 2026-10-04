import { test, expect, openWorld, waitForWorld } from './helpers.js';

// The narrated tour of Tháp Nghinh Phong (key I): the subtitle panel, stop by stop, the camera moving,
// and the ways out (‹ ›, Esc, another camera).
test('narrated tour of the tower', async ({ page }) => {
  test.setTimeout(300_000);
  // The real recordings are in public/tour now; this test is about the no-recording path.
  await page.route('**/tour/*.mp3', (route) => route.fulfill({ status: 404 }));
  await openWorld(page, 'nghinhphong');
  const box = page.locator('#narration'), text = page.locator('#narration-text'), step = page.locator('#narration-step');
  const cam = () => page.evaluate(() => window.__pyn.camera.position.toArray());
  const stops = await page.evaluate(() => window.__pyn.W.landmarks[0].tour.length);
  expect(stops).toBeGreaterThanOrEqual(6);

  await expect(box).toBeHidden();
  const before = await cam();
  await page.keyboard.press('KeyI');
  await expect(box).toBeVisible();
  await expect(page.locator('#narration-title')).toHaveText('Tháp Nghinh Phong');
  await expect(text).toContainText('Tháp Nghinh Phong');
  await expect(step).toHaveText(`1/${stops}`);
  // With no recordings (blocked above) and no Vietnamese voice: it says so, and shows the words.
  await expect(page.locator('#narration-note')).toContainText('chỉ hiện phụ đề');
  await page.keyboard.press('KeyM');
  await expect(page.locator('#narration-note')).toContainText('Đang tắt tiếng');
  await page.keyboard.press('KeyM');
  await expect(page.locator('#narration-note')).toContainText('chỉ hiện phụ đề');
  await expect.poll(async () => Math.hypot(...(await cam()).map((v, i) => v - before[i])), { timeout: 30_000 }).toBeGreaterThan(5);

  // By hand: on, back; every stop says something; the last one ends the tour.
  await page.locator('#narration-next').click();
  await expect(step).toHaveText(`2/${stops}`);
  await page.locator('#narration-prev').click();
  await expect(step).toHaveText(`1/${stops}`);
  for (let i = 2; i <= stops; i++) {
    await page.locator('#narration-next').click();
    await expect(step).toHaveText(`${i}/${stops}`);
    expect((await text.textContent()).length).toBeGreaterThan(20);
  }
  await expect(text).toContainText('Cảm ơn');
  await page.locator('#narration-next').click();
  await expect(box).toBeHidden();

  // Esc, and another camera, stop it.
  await page.keyboard.press('KeyI');
  await expect(box).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(box).toBeHidden();
  await expect(page.locator('#toast')).toHaveText('Đã dừng thuyết minh');
  await page.keyboard.press('KeyI');
  await page.keyboard.press('Digit6');
  await expect(box).toBeHidden();

  // On its own (no voice in a headless browser: the time to read it), it moves on — once the camera
  // is there (the flight runs in the simulation's time: long on a busy software GPU).
  await page.keyboard.press('KeyI');
  await page.waitForFunction(() => !window.__pyn.rig.fly, null, { timeout: 180_000 });
  await expect(step).toHaveText(`2/${stops}`, { timeout: 40_000 });
  await page.keyboard.press('KeyI');
  await expect(box).toBeHidden();
  expect(page.errors).toEqual([]);
});

// Worlds with no tour don't offer one.
test('no tour where there is no landmark', async ({ page }) => {
  await openWorld(page, 'pyn');
  await page.keyboard.press('KeyI');
  await expect(page.locator('#toast')).toHaveText('Thế giới này không có thuyết minh');
  await expect(page.locator('#narration')).toBeHidden();
  expect(page.errors).toEqual([]);
});

// With recordings (public/tour/*.mp3, here a second and a half of silence for each), the tour plays
// them, says nothing about voices, and moves on when each ends.
test('narrated tour plays its recordings', async ({ page }) => {
  test.setTimeout(300_000);
  const played = [];
  await page.route('**/tour/*.mp3', (route) => {
    played.push(route.request().url().split('/').pop());
    return route.fulfill({ path: 'tests/e2e/fixtures/silence.mp3', contentType: 'audio/mpeg' });
  });
  await openWorld(page, 'nghinhphong');
  const stops = await page.evaluate(() => window.__pyn.W.landmarks[0].tour.length);
  await page.keyboard.press('KeyI');
  await expect.poll(() => played[0]).toBe('nghinh-phong-welcome.mp3');
  await expect(page.locator('#narration-note')).toBeHidden();
  await page.waitForFunction(() => !window.__pyn.rig.fly, null, { timeout: 180_000 });
  await expect(page.locator('#narration-step')).toHaveText(`2/${stops}`, { timeout: 30_000 });
  await expect.poll(() => played).toContain('nghinh-phong-design.mp3');
  await page.keyboard.press('Escape');
  expect(page.errors).toEqual([]);
});

// A visitor who just arrives is given the tour by itself (the subtitles at once; the voice at the first
// touch, when the browser would not play it before); ?world= and ?notour leave the app alone.
test('the tour starts by itself on arrival', async ({ page }) => {
  test.setTimeout(300_000);
  await page.route('**/tour/*.mp3', (route) => route.fulfill({ path: 'tests/e2e/fixtures/silence.mp3', contentType: 'audio/mpeg' }));
  await page.goto('/');
  await waitForWorld(page, 'nghinhphong');
  await expect(page.locator('#narration')).toBeVisible();
  await expect(page.locator('#narration-step')).toHaveText(/^1\//);
  await page.keyboard.press('Escape');
  await expect(page.locator('#narration')).toBeHidden();

  await page.goto('/?notour');
  await waitForWorld(page, 'nghinhphong');
  await expect(page.locator('#narration')).toBeHidden();
  expect(page.errors).toEqual([]);
});
