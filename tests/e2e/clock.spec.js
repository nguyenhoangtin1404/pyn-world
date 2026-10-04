import { test, expect, waitForWorld } from './helpers.js';

// The clock (main.js): by default the time in Vietnam now, at its own pace; a time of day (or C) makes the day run
// fast from there, as it used to; "Giờ thật" (or C again) goes back to the real time.
test('the clock follows the time in Vietnam until asked to run fast', async ({ page }) => {
  test.setTimeout(300_000);
  await page.goto('/?world=nghinhphong');
  await waitForWorld(page, 'nghinhphong');
  const clock = () => page.evaluate(() => {
    const { state } = window.__pyn, now = new Date(), vn = (((now.getTime() / 3_600_000 + 7) % 24) + 24) % 24;
    return { mode: state.clock, hour: state.hour, vn };
  });
  const near = (a, b) => Math.min(Math.abs(a - b), 24 - Math.abs(a - b)); // (round midnight)
  let c = await clock();
  expect(c.mode).toBe('real');
  expect(near(c.hour, c.vn)).toBeLessThan(0.05); // (3 minutes)
  // It keeps to real time: a few seconds later it has hardly moved (fast: a few seconds are ~half an hour).
  await page.waitForTimeout(3000);
  c = await clock();
  expect(near(c.hour, c.vn)).toBeLessThan(0.05);

  // A time of day: there, and then running fast.
  await page.locator('#panel-toggle').click();
  await page.locator('#time-of-day button', { hasText: 'Trưa' }).click();
  c = await clock();
  expect(c.mode).toBe('fast');
  const noon = c.hour;
  await page.waitForFunction((h) => window.__pyn.state.hour - h > 0.1, noon, { timeout: 60_000 });

  // Back to real time with the button, then C for fast and C again for real.
  await page.locator('#time-of-day button', { hasText: 'Giờ thật' }).click();
  c = await clock();
  expect(c.mode).toBe('real');
  expect(near(c.hour, c.vn)).toBeLessThan(0.05);
  await page.keyboard.press('KeyC');
  expect((await clock()).mode).toBe('fast');
  await page.keyboard.press('KeyC');
  expect((await clock()).mode).toBe('real');
  expect(page.errors).toEqual([]);
});
