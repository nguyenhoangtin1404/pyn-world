// @ts-check
import pyn from './pyn.js';
import maple from './maple.js';
import tuyhoa from './tuyhoa.js';
import nghinhphong from './nghinhphong.js';

// Every world there is (all built and tested), in the order N cycles through the ones shown. Open
// one directly with ?world=<id>.
/** @type {import('../types').WorldConfig[]} */
export const WORLDS = [pyn, maple, tuyhoa, nghinhphong];

// The worlds the app offers — the world picker, N, the one it opens on. The others are hidden but
// still built and tested, and open with ?world=<id>.
/** @type {import('../types').WorldConfig[]} */
export const SHOWN = WORLDS.filter((w) => ['nghinhphong'].includes(w.id));

/** @param {string | null} id any world's id (hidden ones too); anything else: the first one shown */
export const worldById = (id) => WORLDS.find((w) => w.id === id) ?? SHOWN[0];
