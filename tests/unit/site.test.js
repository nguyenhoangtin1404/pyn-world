import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { Site } from '../../src/world/site.js';
import { createRivers } from '../../src/world/rivers.js';
import { WATER_Y } from '../../src/config.js';

// A made-up world: flat ground at 1, a lake west of x = -100, the "track" along z = 0, a river at
// x = 150, a yard at (100, 100).
const track = { distanceTo: (x, z) => Math.abs(z) };
const cfg = { size: 600, riverX: () => 150 };
const heightAt = (x) => (x < -100 ? WATER_Y - 2 : 1);
const make = () => new Site({ cfg, track, heightAt, tunnel: null, yards: [new THREE.Vector3(100, 0, 100)], rivers: createRivers(cfg) });

describe('Site.spotOK', () => {
  it('accepts open dry ground and returns its height', () => {
    expect(make().spotOK(0, 50)).toBe(1);
  });

  it('refuses water, the track, the river, the yard, the edge and obstacles', () => {
    const site = make();
    expect(site.spotOK(-150, 50)).toBeNull(); // lake
    expect(site.spotOK(0, 5)).toBeNull(); // on the track
    expect(site.spotOK(0, 5, 3)).toBe(1); // …unless it may come that close
    expect(site.spotOK(145, 50)).toBeNull(); // river
    expect(site.spotOK(110, 110)).toBeNull(); // yard
    expect(site.spotOK(0, 290)).toBeNull(); // edge of the diorama
    site.obstacles.push([0, 50, 5]);
    expect(site.spotOK(0, 52)).toBeNull();
  });

  it('keeps out of the tunnel hill', () => {
    const site = new Site({ cfg, track, heightAt, tunnel: { footprint: (x) => x > 0 && x < 20 }, yards: [], rivers: createRivers(cfg) });
    expect(site.spotOK(10, 50)).toBeNull();
    expect(site.spotOK(30, 50)).toBe(1);
  });
});

describe('Site.walkHeight', () => {
  it('is the highest surface above the ground', () => {
    const site = make();
    expect(site.walkHeight(0, 50)).toBe(1);
    site.addSurface((x, z) => (Math.abs(x) < 5 && Math.abs(z - 50) < 5 ? 4 : -Infinity)); // a platform
    expect(site.walkHeight(0, 50)).toBe(4);
    expect(site.walkHeight(20, 50)).toBe(1);
  });
});

describe('Site.occludes', () => {
  const v = (x, y, z) => new THREE.Vector3(x, y, z);

  it('sees through open air, not through a building', () => {
    const site = make();
    site.solidBox(0, 0, 10, 10, 0.3, 0, 8);
    expect(site.occludes(v(-20, 2, 0), v(20, 2, 0))).toBe(true);
    expect(site.occludes(v(-20, 12, 0), v(20, 12, 0))).toBe(false); // over the roof
    expect(site.occludes(v(-20, 2, 30), v(20, 2, 30))).toBe(false); // beside it
  });

  it('is blocked by a tower and by tree crowns', () => {
    const site = make();
    site.solids.push({ x: 0, z: 40, r: 2, y0: 0, y1: 12 });
    expect(site.occludes(v(-20, 5, 40), v(20, 5, 40))).toBe(true);
    site.colliders.push({ x: 0, z: 80, r: 1, item: { x: 0, z: 80, h: 1, s: 1, pine: false } });
    expect(site.occludes(v(-20, 4, 80), v(20, 4, 80))).toBe(true); // through the crown
    expect(site.occludes(v(-20, 1.5, 80), v(20, 1.5, 80))).toBe(false); // under it
  });
});

describe('Site.clearAround', () => {
  it('hides the trees near the points and stops people walking round them', () => {
    const site = make();
    const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial(), 2);
    const near = { x: 0, z: 0, instances: [[mesh, 0]] }, far = { x: 50, z: 0, instances: [[mesh, 1]] };
    site.colliders.push({ x: 0, z: 0, r: 1, item: near }, { x: 50, z: 0, r: 1, item: far });
    site.clearAround([new THREE.Vector3(1, 0, 0)], 2);
    const m = new THREE.Matrix4();
    mesh.getMatrixAt(0, m);
    expect(m.elements[0]).toBe(0); // scaled to nothing
    mesh.getMatrixAt(1, m);
    expect(m.elements[0]).toBe(1);
    expect(site.colliders.map((c) => c.item)).toEqual([far]);
  });
});
