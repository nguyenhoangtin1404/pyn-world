// @ts-check
import * as THREE from 'three';

/**
 * @typedef {{ world: import('../World.js').World, x: number, y: number, z: number, ry: number, rng: () => number }} LandmarkSite
 * Where a landmark stands: world position of its base (on its flat pad), turned by ry about y.
 * @typedef {{ name: string, radius: number | ((scale: { map: number, props: number }) => number), build(site: LandmarkSite): LandmarkBuilt }} Landmark
 * `radius`: the flat ground it needs (and keeps clear of trees), units — or from the world's scale.
 * @typedef {{ spot: THREE.Vector3, view: number, walk?: THREE.Vector3[], system?: import('../types').System }} LandmarkBuilt
 * `spot`: where the camera looks when flying to it; `view`: how far back it stands (× the usual);
 * `walk`: a loop people walk round it on, y the height of what they walk on (default: a circle over
 * most of its pad, on the ground).
 */

/**
 * A point in a landmark's own frame (x, y, z from its base, before turning by ry) in the world.
 * @param {LandmarkSite} site @param {number} lx @param {number} ly @param {number} lz
 * @returns {[number, number, number]}
 */
export function toWorld({ x, y, z, ry }, lx, ly, lz) {
  const c = Math.cos(ry), s = Math.sin(ry);
  return [x + lx * c + lz * s, y + ly, z - lx * s + lz * c];
}

/** @param {LandmarkSite} site @param {number} ly */
export const above = (site, ly) => new THREE.Vector3(site.x, site.y + ly, site.z);
