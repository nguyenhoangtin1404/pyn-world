import { WORLDS } from '../../src/worlds/index.js';
import { test, expect, openWorld, fingerprint, simulate } from './helpers.js';

// Every world, built in the browser, is exactly as recorded in tests/e2e/golden/<id>.json — every
// vertex (checksum), every tree/rock/flower, colliders, fly-to spots, draw calls, shader programs.
// A change meant to change a world: `npm run e2e -- --update-snapshots`, check the golden diff, commit.
for (const { id } of WORLDS) {
  test.describe(id, () => {
    test('is built exactly as recorded', async ({ page }) => {
      await openWorld(page, id);
      const print = await page.evaluate(fingerprint);
      expect(`${JSON.stringify(print, null, 2)}\n`).toMatchSnapshot(`${id}.json`);
      expect(page.errors).toEqual([]);
    });

    test('comes alive: train, people, doors, rain, hikers, vehicles', async ({ page }) => {
      await openWorld(page, id);
      const life = await page.evaluate(simulate);
      expect(life.trainStops, 'the train keeps calling at stops').toBeGreaterThanOrEqual(2);
      if (life.people > 0) {
        expect(life.boarding, 'people board the train').toBeGreaterThan(0);
        expect(life.alighting, 'people get off at the next stop').toBeGreaterThan(0);
        expect(life.umbrellas, 'umbrellas go up in the rain').toBeGreaterThan(0);
        if (life.houses) expect(life.doorOpenMax, 'house doors swing open').toBeGreaterThan(1.4);
      }
      if (life.hikers > 0) expect(life.hikersMoved, 'hikers climb').toBeGreaterThan(0);
      // (A vehicle may be waiting for someone crossing, but not all of them for 300 s.)
      if (life.vehicles > 0) expect(life.vehiclesMoved, 'vehicles drive and fly').toBeGreaterThan(life.vehicles / 2);
      expect(page.errors).toEqual([]);
    });
  });
}
