// @ts-check
import trees from './trees.js';
import clouds from './clouds.js';
import balloons from './balloons.js';
import birds from './birds.js';
import landmarks from './landmarks.js';
import streets from './streets.js';
import buildings from './buildings.js';
import citytraffic from './citytraffic.js';
import strollers from './strollers.js';
import tourists from './tourists.js';
import busstop from './busstop.js';
import seacraft from './seacraft.js';
import beach from './beach.js';
import streetlife from './streetlife.js';
import host from './host.js';

// Everything a WorldConfig can put in its world, by id (cfg.features). A feature is
//   { label, needs?, after?, build(world, { rng, ...options }) → system | undefined }
// where a system is { group?, update?(f), lateUpdate?(f), finish?(), dispose?() } — see World.js.
// Features are built in the order the config lists them; later ones may use what earlier ones
// added to the world (stations, the train, people, colliders…). `needs` lists the features that
// must come before (an inner list: any one of them), `after` those that must come before if the world
// has them at all — both checked before the world is built.
//
// The features of the worlds the app shows (worlds/index.js SHOWN) are in the app's chunk; those only the
// hidden worlds use (the railway valleys) are loaded with them: loadFeatures(), before World.steps().

/** @typedef {import('../types').Feature} Feature */

/** @type {Record<string, Feature>} loaded features, by id */
const LOADED = { trees, clouds, balloons, birds, landmarks, streets, buildings, citytraffic, strollers, tourists, busstop, seacraft, beach, streetlife, host };

/** @type {Record<string, () => Promise<{ default: Feature }>>} */
const LAZY = {
  station: () => import('./station.js'),
  village: () => import('./village.js'),
  halt: () => import('./halt.js'),
  windmill: () => import('./windmill.js'),
  sheep: () => import('./sheep.js'),
  train: () => import('./train.js'),
  fish: () => import('./fish.js'),
  boats: () => import('./boats.js'),
  villagers: () => import('./villagers.js'),
  hikers: () => import('./hikers.js'),
  road: () => import('./road.js'),
  traffic: () => import('./traffic.js'),
  aircraft: () => import('./aircraft.js'),
};

/** Every feature's id. */
export const FEATURE_IDS = [...Object.keys(LOADED), ...Object.keys(LAZY)];

/**
 * A feature by id — undefined if there is no such feature, or it has not been loaded (loadFeatures).
 * @param {string} id
 * @returns {Feature | undefined}
 */
export const featureById = (id) => (Object.hasOwn(LOADED, id) ? LOADED[id] : undefined);

/**
 * Loads the features a list names (cfg.features; unknown ids are left for the checks to report).
 * @param {(string | { id: string })[]} entries
 */
export async function loadFeatures(entries) {
  const ids = new Set(entries.map((f) => (typeof f === 'string' ? f : f.id)));
  await Promise.all([...ids].filter((id) => !Object.hasOwn(LOADED, id) && Object.hasOwn(LAZY, id)).map(async (id) => {
    LOADED[id] = (await LAZY[id]()).default;
  }));
}
