import AxeBuilder from '@axe-core/playwright';
import { test, expect, openWorld } from './helpers.js';

// Accessibility (axe-core) of what people use on NGHINH PHONG: the control panel opened, the keyboard
// shortcuts list, and the author's card. A serious or critical violation fails the test, with what and where.
const BLOCKING = ['serious', 'critical'];

// Rules left out, each with its reason (none so far: the three pass every rule at serious and critical).
/** @type {string[]} */
const DISABLED = [];

async function check(page, include) {
  const { violations } = await new AxeBuilder({ page }).include(include).disableRules(DISABLED).analyze();
  const bad = violations.filter((v) => BLOCKING.includes(v.impact));
  const report = bad.map((v) => `${v.impact} ${v.id}: ${v.help}\n${v.nodes.slice(0, 5).map((n) => `  ${n.target.join(' ')} — ${n.failureSummary.split('\n').slice(1).join(' ').trim()}`).join('\n')}`);
  expect(report, `axe in ${include}`).toEqual([]);
}

test('the panel, the shortcuts and the author\'s card pass axe', async ({ page }) => {
  test.setTimeout(300_000);
  await openWorld(page, 'nghinhphong');

  // The control panel, opened, with "Nâng cao" unfolded.
  await page.locator('#panel-toggle').click();
  await page.locator('#advanced summary').click();
  await check(page, '#panel');

  // The keyboard shortcuts.
  await page.locator('#help-btn').click();
  await expect(page.locator('#help')).toBeVisible();
  await check(page, '#help');
  await page.locator('#help-btn').click();

  // The author's card: a click on them (where they are on screen from the default view).
  const at = await page.evaluate(() => {
    const { W, camera } = window.__pyn;
    const v = W.host.head.clone().lerp(W.host.person.group.position, 0.4).project(camera);
    return { x: ((v.x + 1) / 2) * innerWidth, y: ((1 - v.y) / 2) * innerHeight };
  });
  await page.mouse.click(at.x, at.y);
  await expect(page.locator('#host-card')).toBeVisible();
  await check(page, '#host-card');
  expect(page.errors).toEqual([]);
});
