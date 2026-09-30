import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { KINDS, kindGeometry } from '../../src/world/vehicles/kinds.js';
import { Fleet } from '../../src/world/vehicles/fleet.js';
import { Vehicle } from '../../src/world/vehicles/vehicle.js';
import { LoopPath, ellipse } from '../../src/world/vehicles/path.js';
import { mulberry32 } from '../../src/utils.js';

// Circles of radius 40, one each way round.
const circle = new LoopPath(ellipse({ cx: 0, cz: 0, rx: 40, rz: 40, step: 1 }));
const circleBack = new LoopPath(ellipse({ cx: 0, cz: 0, rx: 40, rz: 40, step: 1, dir: -1 }));

// Does a vehicle lean (or bank) towards the centre of the circle it is going round? Its local up
// (0, 1, 0) turned by its rotation should point a little inwards, towards (0, y, 0).
function leansInwards(v) {
  v.group.updateMatrixWorld();
  const up = new THREE.Vector3(0, 1, 0).transformDirection(v.group.matrixWorld);
  const { x, z } = v.group.position;
  const inwards = new THREE.Vector3(-x, 0, -z).normalize();
  return up.dot(inwards) > 0.05;
}
const flat = () => 1;

describe('vehicle kinds', () => {
  it.each(Object.keys(KINDS))('%s has a body, wheels where it says, and paint colours', (id) => {
    const k = KINDS[id];
    expect(kindGeometry(id, 'body').attributes.position.count).toBeGreaterThan(0);
    expect(k.colors.length).toBeGreaterThan(0);
    expect(k.speed[0]).toBeLessThanOrEqual(k.speed[1]);
    if (!k.flies) {
      expect(k.wheels.length).toBeGreaterThanOrEqual(2);
      for (const [, y] of k.wheels) expect(y).toBeCloseTo(k.wheelR); // wheels touch the ground
      expect(kindGeometry(id, 'wheel').attributes.position.count).toBeGreaterThan(0);
    }
  });

  it('geometries are shared, not rebuilt', () => {
    expect(kindGeometry('car', 'body')).toBe(kindGeometry('car', 'body'));
  });
});

describe('Fleet', () => {
  it('draws each kind with a few instanced meshes, however many vehicles', () => {
    const fleet = new Fleet({ car: 5, bicycle: 2, plane: 1 });
    // car: body + wheel, bicycle: body + wheel, plane: body + prop + lights; and for the whole fleet
    // the road vehicles' lamps and their pools of light.
    expect(fleet.meshes.length).toBe(9);
    const a = fleet.add('car', '#c8453a');
    expect(a.wheels.length).toBe(4);
    expect(fleet.add('plane', '#ffffff').prop).not.toBeNull();
    expect(fleet.add('plane', '#ffffff').lamps).toBeNull(); // planes have their own lights
  });

  it('gives road vehicles head and tail lamps, dark until lit', () => {
    const fleet = new Fleet({ car: 1, bicycle: 1 });
    const car = fleet.add('car', '#c8453a').lamps, bike = fleet.add('bicycle', '#c8453a').lamps;
    expect(car.head).toHaveLength(2);
    expect(car.tail).toHaveLength(2);
    expect(bike.head).toHaveLength(1);
    for (const a of [...car.head, ...car.tail, car.beam]) expect(a.visible).toBe(false);
    expect(car.head[0].position.z).toBeGreaterThan(0); // at the front (+z)
    expect(car.tail[0].position.z).toBeLessThan(0);
    expect(fleet.lamps.mesh.count).toBe(2 + 2 + 1 + 1);
  });

  it('refuses kinds it does not know', () => {
    expect(() => new Fleet({ hovercraft: 1 })).toThrow(/hovercraft/);
  });
});

describe('Vehicle', () => {
  const make = (kind, o = {}) => new Vehicle({ kind, fleet: new Fleet({ [kind]: 1 }), path: circle, s: 0, rng: mulberry32(5), heightAt: flat, ...o });

  it('drives round its path at its cruising speed, wheels turning with the distance', () => {
    const car = make('car');
    for (let i = 0; i < 100; i++) car.update(0.1);
    expect(car.v).toBeCloseTo(car.cruise);
    expect(car.s).toBeGreaterThan(20);
    const w = car.wheels[0];
    expect(w.rotation.x).toBeCloseTo(car.s / KINDS.car.wheelR, 0);
    expect(car.group.position.y).toBe(1); // on the ground
  });

  it('lights: head lights when told, brake lights when slowing or held', () => {
    const car = make('car');
    for (let i = 0; i < 100; i++) car.update(0.1);
    car.light(false);
    expect(car.lamps.head[0].visible).toBe(false);
    expect(car.lamps.tail[0].visible).toBe(false); // cruising in daylight
    car.limit = 0;
    car.update(0.1);
    car.light(false);
    expect(car.braking).toBe(true);
    expect(car.lamps.tail[0].visible).toBe(true); // braking
    expect(car.lamps.head[0].visible).toBe(false);
    car.light(true);
    expect(car.lamps.head[0].visible).toBe(true);
    expect(car.lamps.beam.visible).toBe(true);
  });

  it('never goes over the limit the traffic gives it', () => {
    const car = make('car');
    car.limit = 2;
    for (let i = 0; i < 100; i++) car.update(0.1);
    expect(car.v).toBeCloseTo(2);
  });

  it('bikes carry a rider and lean into the turn, whichever way round; cars stay upright', () => {
    for (const path of [circle, circleBack]) {
      const bike = make('motorbike', { path });
      expect(bike.rider).not.toBeNull();
      for (let i = 0; i < 50; i++) bike.update(0.1);
      expect(leansInwards(bike)).toBe(true);
    }
    const car = make('car');
    for (let i = 0; i < 50; i++) car.update(0.1);
    expect(car.group.rotation.z).toBe(0);
    expect(car.rider).toBeNull();
  });

  it('a bicycle rider pedals, a motorbike rider does not', () => {
    const bike = make('bicycle');
    const hip = bike.rider.person.hips[0];
    const before = hip.rotation.x;
    for (let i = 0; i < 7; i++) bike.update(0.1);
    expect(hip.rotation.x).not.toBeCloseTo(before);
    expect(make('motorbike').rider.pedal).toBe(false);
  });

  it('planes fly at their altitude (± amplitude), banking into the turn, propeller spinning', () => {
    const plane = make('plane', { heightAt: undefined, altitude: 100, amplitude: 6 });
    let lo = Infinity, hi = -Infinity;
    for (let i = 0; i < 400; i++) {
      plane.update(0.1);
      lo = Math.min(lo, plane.group.position.y);
      hi = Math.max(hi, plane.group.position.y);
    }
    expect(lo).toBeGreaterThanOrEqual(94 - 1e-9);
    expect(hi).toBeLessThanOrEqual(106 + 1e-9);
    expect(leansInwards(plane)).toBe(true);
    const back = make('plane', { path: circleBack, heightAt: undefined, altitude: 100 });
    for (let i = 0; i < 20; i++) back.update(0.1);
    expect(leansInwards(back)).toBe(true);
    expect(plane.prop.rotation.z).toBeGreaterThan(100);
  });
});
