import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createBirds } from '../../src/world/birds.js';
import { mulberry32 } from '../../src/utils.js';

// A 20 × 4 platform at y = 4 along x, a canopy above it; no nav grid (anywhere on it is free).
const scenery = {
  platformPoint: (u, v) => new THREE.Vector3(-10 + u * 20, 4, -2 + v * 4),
  canopyPoint: (u, v) => new THREE.Vector3(-10 + u * 20, 8, -2 + v * 4),
};
const make = (train = null) => createBirds({ rng: mulberry32(3), scenery, nav: null, train });
const pigeons = (b) => b.followables.filter((f) => f.label.startsWith('Bồ câu')).map((f) => f.anchor());
// Flock groups hold one Group per bird; a pigeon's group holds plain anchors (head, wings).
const flocks = (b) => b.group.children.filter((g) => g.isGroup && g.children.length > 2 && g.children.every((c) => c.isGroup));

describe('birds', () => {
  it('pigeons start on the platform', () => {
    const b = make();
    const ps = pigeons(b);
    expect(ps.length).toBe(9);
    for (const p of ps) {
      expect(p.position.y).toBe(4);
      expect(Math.abs(p.position.x)).toBeLessThanOrEqual(10);
    }
  });

  it('a pigeon flies off when someone walks up to it, and lands again', () => {
    const b = make();
    const p = pigeons(b)[0];
    const start = p.position.clone();
    const walker = start.clone(); // standing right on it
    b.update(0.1, 0, [walker], 0);
    for (let t = 0.1; t < 1; t += 0.1) b.update(0.1, t, [], 0);
    expect(p.position.y).toBeGreaterThan(4.5); // in the air
    for (let t = 1; t < 12; t += 0.1) b.update(0.1, t, [], 0);
    expect([4, 8]).toContain(+p.position.y.toFixed(3)); // on the platform or the canopy
    expect(p.position.distanceTo(start)).toBeGreaterThan(0.5);
  });

  it('the train rolling in scares them too, a standing train does not', () => {
    const still = { v: 0, locoPos: new THREE.Vector3(0, 4, 0) };
    const b = make(still);
    const heights = () => pigeons(b).map((p) => p.position.y);
    b.update(0.1, 0, [], 0);
    for (let t = 0.1; t < 0.6; t += 0.1) b.update(0.1, t, [], 0);
    const flying = () => heights().filter((y) => y > 4.2 && y < 7.9).length;
    const before = flying();
    still.v = 5; // now moving, next to the pigeons around x = 0
    for (let t = 0.6; t < 1.2; t += 0.1) b.update(0.1, t, [], 0);
    expect(flying()).toBeGreaterThan(before);
  });

  it('flocks fly by day and roost at night', () => {
    const b = make();
    expect(flocks(b).length).toBe(3); // starlings, swallows, gulls
    const [f] = flocks(b);
    b.update(0.1, 0, [], 0);
    const p0 = f.children[0].position.clone();
    b.update(0.1, 1, [], 0);
    expect(f.visible).toBe(true);
    expect(f.children[0].position.distanceTo(p0)).toBeGreaterThan(0);
    b.update(0.1, 2, [], 1); // night
    expect(f.visible).toBe(false);
  });
});
