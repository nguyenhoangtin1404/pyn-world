import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { NavGrid } from '../../src/world/nav.js';
import { WATER_Y } from '../../src/config.js';

// 40 × 40 flat field with a wall across the middle (x = 20, z from 0 to 30) and a pond in one corner.
const bounds = { minX: 0, minZ: 0, maxX: 40, maxZ: 40 };
const ground = (x, z) => (x > 34 && z > 34 ? WATER_Y - 1 : 1);
const wall = { x: 20, z: 15, w: 1, d: 30, rot: 0 };
const grid = () => new NavGrid(bounds, ground, [wall]);

describe('NavGrid', () => {
  it('blocks walls and water, frees open ground', () => {
    const nav = grid();
    expect(nav.isFree(5, 5)).toBe(true);
    expect(nav.isFree(20, 10)).toBe(false); // wall
    expect(nav.isFree(38, 38)).toBe(false); // pond
  });

  it('finds a path round the wall, never through it', () => {
    const nav = grid();
    const path = nav.findPath(new THREE.Vector3(10, 1, 10), new THREE.Vector3(30, 1, 10));
    expect(path).toBeTruthy();
    const last = path[path.length - 1];
    expect(Math.hypot(last.x - 30, last.z - 10)).toBeLessThan(1);
    // Going round means passing the end of the wall (z > 30).
    expect(Math.max(...path.map((p) => p.z))).toBeGreaterThan(30);
    for (const p of path) expect(nav.isFree(p.x, p.z)).toBe(true);
  });

  it('knows when a straight line is clear', () => {
    const nav = grid();
    expect(nav.clearLine(new THREE.Vector3(5, 1, 5), new THREE.Vector3(15, 1, 25))).toBe(true);
    expect(nav.clearLine(new THREE.Vector3(10, 1, 10), new THREE.Vector3(30, 1, 10))).toBe(false);
  });

  it('snaps a blocked point to the nearest free cell', () => {
    const nav = grid();
    const p = nav.nearestFree(20, 10);
    expect(p).toBeTruthy();
    expect(nav.isFree(p.x, p.z)).toBe(true);
    expect(Math.abs(p.x - 20)).toBeLessThan(3);
  });
});
