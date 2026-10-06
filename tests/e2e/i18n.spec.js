import { test, expect, waitForWorld } from './helpers.js';

// The English version (src/app/i18n.js): ?lang=en and /en/ show the app in English — the panel, About, the
// shortcuts, the tour's subtitles (no Vietnamese recordings played); the EN/VI button switches and is remembered.

test('?lang=en: English panel, About, shortcuts and tour; the toggle goes back to Vietnamese and is remembered', async ({ page }) => {
  test.setTimeout(400_000);
  const mp3 = [];
  await page.route('**/tour/*.mp3*', (route) => {
    mp3.push(route.request().url());
    return route.fulfill({ status: 404 });
  });
  await page.goto('/?world=nghinhphong&clock=fast&lang=en');
  await waitForWorld(page, 'nghinhphong');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.locator('#scene canvas')).toHaveAttribute('aria-label', /^Low-poly 3D diorama NGHINH PHONG around Nghinh Phong Tower/);

  // The panel.
  await expect(page.locator('#panel-toggle-label')).toHaveText('Open the control panel');
  await page.locator('#panel-toggle').click();
  await expect(page.locator('#panel-toggle-label')).toHaveText('Collapse');
  for (const s of ['🗺 Overview', '🏛 Tower', '🎙 Tour', 'ℹ About', '🕒 Real time', 'Morning', '☀ Sunny', '☂ Rain'])
    await expect(page.locator('#panel-content')).toContainText(s);
  await expect(page.locator('#panel-content')).not.toContainText('Toàn cảnh');
  await expect(page.locator('#camera-modes')).toHaveAttribute('aria-label', 'Camera views');
  await expect(page.locator('#lang-btn')).toHaveText('🌐 VI');

  // About.
  await page.locator('#about-btn').click();
  const about = page.locator('#about');
  await expect(about).toBeVisible();
  await expect(about.locator('h1')).toHaveText('Nghinh Phong Tower, Tuy Hòa, in 3D');
  for (const s of ['HUNI architectes', 'completed in 2021', '50 hexagonal stone columns', 'more than 7,000 m²', 'Source code (AGPL-3.0)', 'Overture Maps'])
    await expect(about).toContainText(s);
  await page.screenshot({ path: test.info().outputPath('about-en.png') });
  await page.keyboard.press('Escape');
  await expect(about).toBeHidden();

  // The shortcuts.
  await page.locator('#advanced summary').click();
  await expect(page.locator('#advanced summary')).toHaveText('Advanced');
  await page.locator('#help-btn').click();
  await expect(page.locator('#help')).toContainText('Keyboard shortcuts');
  await expect(page.locator('#help')).toContainText('Narrated tour of the tower');
  await page.screenshot({ path: test.info().outputPath('panel-en.png') });
  await page.locator('#hide-help').click();

  // A toast.
  await page.keyboard.press('KeyO');
  await expect(page.locator('#toast')).toHaveText('Ink outlines: on');
  await page.keyboard.press('KeyO');

  // The tour, in English, with no Vietnamese recording asked for.
  await page.keyboard.press('KeyI');
  await expect(page.locator('#narration')).toBeVisible();
  await expect(page.locator('#narration-title')).toHaveText('Nghinh Phong Tower');
  await expect(page.locator('#narration-text')).toContainText('Welcome to Nghinh Phong Tower');
  await expect(page.locator('#narration-stop')).toHaveText('✕ Stop');
  await page.keyboard.press('KeyM'); // (sound off: it says so, in English)
  await expect(page.locator('#narration-note')).toContainText('The sound is off');
  await page.keyboard.press('KeyM');
  // Back to Vietnamese mid-tour (the panel steps aside while touring: the button is pressed from script): the same
  // stop, in Vietnamese.
  await page.locator('#lang-btn').evaluate((b) => b.click());
  await expect(page.locator('html')).toHaveAttribute('lang', 'vi');
  await expect(page.locator('#narration-title')).toHaveText('Tháp Nghinh Phong');
  await expect(page.locator('#narration-text')).toContainText('Chào mừng bạn');
  await page.keyboard.press('Escape');
  await expect(page.locator('#toast')).toHaveText('Đã dừng thuyết minh');
  expect(mp3.filter((u) => !/welcome/.test(u))).toEqual([]); // (only Vietnamese, after the switch, may ask for one)

  await expect(page.locator('#panel-toggle-label')).toHaveText('Thu gọn');
  await expect(page.locator('#panel-content')).toContainText('🗺 Toàn cảnh');
  await expect(page.locator('#lang-btn')).toHaveText('🌐 EN');
  expect(new URL(page.url()).searchParams.get('lang')).toBeNull(); // (a reload keeps the choice)

  // Remembered: a reload is Vietnamese; switching to English moves to /en/ and a reload stays English.
  await page.reload();
  await waitForWorld(page, 'nghinhphong');
  await expect(page.locator('html')).toHaveAttribute('lang', 'vi');
  await expect(page.locator('#panel-toggle-label')).toHaveText('Mở bảng điều khiển');
  await page.locator('#panel-toggle').click();
  await page.locator('#lang-btn').click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  expect(new URL(page.url()).pathname).toBe('/en/');
  await page.reload();
  await waitForWorld(page, 'nghinhphong');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.locator('#panel-toggle-label')).toHaveText('Open the control panel');
  expect(page.errors).toEqual([]);
});

test('/en/: the English page (its own head) with the English app', async ({ page }) => {
  test.setTimeout(300_000);
  await page.goto('/en/?world=nghinhphong&clock=fast');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page).toHaveTitle(/^Nghinh Phong Tower/);
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', /\/en\/$/);
  await expect(page.locator('link[rel="alternate"][hreflang="vi"]')).toHaveCount(1);
  await expect(page.locator('#load-sub, .load-sub')).toHaveText('TUY HÒA WARD');
  await waitForWorld(page, 'nghinhphong');
  await expect(page.locator('#panel-toggle-label')).toHaveText('Open the control panel');
  expect(page.errors).toEqual([]);
});
