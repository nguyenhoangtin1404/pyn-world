import { describe, expect, it } from 'vitest';
import { createBoats } from '../../src/world/boats.js';
import { mulberry32 } from '../../src/utils.js';
import { WATER_Y } from '../../src/config.js';

// A lake west of x = -50 and a straight river along x = 20.
const riverX = () => 20;
const heightAt = (x) => (x < -50 || Math.abs(x - 20) < 8 ? WATER_Y - 3 : 2);
const waterSpots = [{ x: 20, z: 0 }, { x: -120, z: 30 }, { x: -60, z: 0 }];

function boats() {
  const spawned = [];
  const b = createBoats({ heightAt, riverX, ripples: { spawn: (x, z) => spawned.push([x, z]) }, waterSpots, rng: mulberry32(1) });
  return { b, spawned };
}

describe('boats', () => {
  it('the steamer follows the river, leaving a wake', () => {
    const { b, spawned } = boats();
    const start = b.spots.steamer.clone();
    for (let t = 0; t < 30; t += 0.1) b.update(0.1, t);
    const p = b.spots.steamer;
    expect(p.x).toBeCloseTo(20);
    expect(Math.abs(p.z - start.z)).toBeGreaterThan(20);
    expect(spawned.length).toBeGreaterThan(0);
  });

  it('the rowboat sits on the calmest open water, off the river', () => {
    const { b } = boats();
    b.update(0.1, 0);
    // (-120, 30) is deep in the lake; (-60, 0) is at its shore, (20, 0) in the steamer's channel.
    expect([b.spots.fisherman.x, b.spots.fisherman.z]).toEqual([-120, 30]);
  });

  it('the fisherman lands fish in his bucket', () => {
    const { b } = boats();
    // The rowboat is the object the "fisherman" spot belongs to; its bucket fish start hidden.
    let boat;
    b.group.traverse((o) => o.position === b.spots.fisherman && (boat = o));
    const bucket = boat.children.filter((c) => c.isMesh && !c.visible);
    expect(bucket.length).toBe(3);
    for (let t = 0; t < 120 && !bucket.some((f) => f.visible); t += 0.1) b.update(0.1, t);
    expect(bucket.some((f) => f.visible)).toBe(true);
  });
});
