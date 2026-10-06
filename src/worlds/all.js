// @ts-check
import pyn from './pyn.js';
import maple from './maple.js';
import tuyhoa from './tuyhoa.js';
import nghinhphong from './nghinhphong.js';

// Every world there is, loaded at once — for the tests and tools. The app goes through worlds/index.js
// (loadWorld), which loads the hidden ones only when asked for; the order here is its WORLD_IDS.
/** @type {import('../types').WorldConfig[]} */
export const WORLDS = [pyn, maple, tuyhoa, nghinhphong];
