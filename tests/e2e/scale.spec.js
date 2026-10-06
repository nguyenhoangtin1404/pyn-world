import { WORLDS } from '../../src/worlds/all.js';
import { test, expect, openWorld } from './helpers.js';

// Every world's props are the size its scale says (world/scale.js): people, storeys, lanes, cars,
// trees, the track and the train, each within TOLERANCE of SIZES × scale.props. Features note what
// they drew; the audit lists what is off.
// PENDING: what is known to be off, until its feature draws at world.scale — shrink this list, never
// grow it to let a new mismatch through.
const PENDING = {};

for (const { id } of WORLDS) {
  test(`${id}: everything is drawn to the same scale`, async ({ page }) => {
    await openWorld(page, id);
    const { notes, issues } = await page.evaluate(() => {
      const s = window.__pyn.W.scale;
      const row = (n) => `${n.kind}:${n.by} ${n.units.toFixed(2)} (${(n.units / s.want(n.kind)).toFixed(2)}×)`;
      return { notes: s.notes.map(row), issues: s.audit().map((n) => `${n.kind}:${n.by}`).sort() };
    });
    expect(notes.length, 'features note what they drew').toBeGreaterThan(2);
    expect(issues, `sizes off the world's scale:\n${notes.join('\n')}`).toEqual(PENDING[id] ?? []);
    expect(page.errors).toEqual([]);
  });
}
