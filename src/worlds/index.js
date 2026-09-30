// @ts-check
import pyn from './pyn.js';
import maple from './maple.js';
import tuyhoa from './tuyhoa.js';

// Every world the app can show, in the order N cycles through them. Open one directly with
// ?world=<id>.
/** @type {import('../types').WorldConfig[]} */
export const WORLDS = [pyn, maple, tuyhoa];

/** @param {string | null} id */
export const worldById = (id) => WORLDS.find((w) => w.id === id) ?? WORLDS[0];
