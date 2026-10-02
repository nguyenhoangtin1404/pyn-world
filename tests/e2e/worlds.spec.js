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
      if (life.train) expect(life.trainStops, 'the train keeps calling at stops').toBeGreaterThanOrEqual(2);
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
        const why = (what) => `${what} — ${JSON.stringify(r)}`; // the numbers, if it ever goes red
        expect(r.overlaps, why('no two vehicles ever overlap')).toBe(0);
        expect(r.longestStop, why('nothing waits for ever (no gridlock)')).toBeLessThan(60);
        if (r.gates) expect(r.gateClosings, why('level-crossing barriers come down for the train')).toBeGreaterThan(0);
        if (r.gates) expect(r.carsAtGate, why('…and cars wait at them')).toBeGreaterThan(0);
        if (r.signals) expect(r.carsAtRed, why('cars stop at red lights')).toBeGreaterThan(0);
        if (r.branches) expect(r.carsOnBranch, why('cars take the branch off the roundabout')).toBeGreaterThan(0);
        if (r.junctions) expect(r.boxConflicts, why('the crossroads lights keep the two roads apart')).toBe(0);
        if (r.junctions) expect(r.junctionCrossings, why('cars on the street go across the crossroads')).toBeGreaterThan(0);
        if (life.zebra && id === 'nghinhphong') expect(r.turned, why('some cars turn into another street')).toBeGreaterThan(0);
        expect(r.brakeLights, why('brake lights come on')).toBeGreaterThan(0);
        expect(r.headlightsInRain, why('head lights come on in the rain')).toBeGreaterThan(0);
      }
      if (life.feet) {
        const f = life.feet;
        const why = (what) => `${what} — ${JSON.stringify(f)}`;
        expect(f.onCarriageway, why('people keep off the carriageway but for the crosswalks')).toBe(0);
        expect(f.redCrossings, why('nobody starts across while the lights say wait')).toBe(0);
        expect(f.waits, why('people wait at the kerb for the lights')).toBeGreaterThan(0);
        expect(f.crossings, why('…and then cross')).toBeGreaterThan(0);
      }
      if (life.zebra) {
        const f = life.zebra;
        const why = (what) => `${what} — ${JSON.stringify(f)}`;
        expect(f.notOnRed, why('nobody steps onto a crossroads crosswalk unless its traffic has red')).toBe(0);
        expect(f.waits, why('people wait at the kerb for the lights')).toBeGreaterThan(0);
        expect(f.crossings, why('…and then cross')).toBeGreaterThan(0);
      }
      if (life.busStop) {
        const b = life.busStop, why = (what) => `${what} — ${JSON.stringify(b)}`;
        expect(b.stops, why('buses stop at the tower\'s stop')).toBeGreaterThan(0);
        expect(b.alighted, why('tourists get off the bus')).toBeGreaterThan(0);
        expect(b.boarded, why('and some get on')).toBeGreaterThan(0);
      }
      if (life.tourists) {
        const t = life.tourists;
        const why = (what) => `${what} — ${JSON.stringify(t)}`;
        expect(t.outside, why('tourists keep inside the railing (no walking through it, no standing on air)')).toBe(0);
        expect(t.intoTower, why('…and out of the tower')).toBe(0);
        expect(t.xs, why('they wander all over the square, not round and round it')).toBeGreaterThan(t.count * 3);
        expect(t.photoing, why('tourists take photos')).toBeGreaterThan(0);
        expect(t.bubbles, why('…and say something nice in a bubble')).toBeGreaterThan(0);
        expect(t.speaking, why('…most of them')).toBeGreaterThan(t.count / 2);
        expect(t.standing, why('they stop to look rather than keep walking')).toBeGreaterThan(t.samples * 0.4);
      }
      expect(page.errors).toEqual([]);
    });
  });
}
