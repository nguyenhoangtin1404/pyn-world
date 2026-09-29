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
      if (life.road) {
        const r = life.road;
        expect(r.overlaps, 'no two vehicles ever overlap').toBe(0);
        expect(r.longestStop, 'nothing waits for ever (no gridlock)').toBeLessThan(60);
        if (r.gates) expect(r.gateClosings, 'level-crossing barriers come down for the train').toBeGreaterThan(0);
        if (r.gates) expect(r.carsAtGate, '…and cars wait at them').toBeGreaterThan(0);
        if (r.signals) expect(r.carsAtRed, 'cars stop at red lights').toBeGreaterThan(0);
        if (r.branches) expect(r.carsOnBranch, 'cars take the branch off the roundabout').toBeGreaterThan(0);
      }
      expect(page.errors).toEqual([]);
    });
  });
}
