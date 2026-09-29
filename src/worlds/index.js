import pyn from './pyn.js';
import maple from './maple.js';

// Every world the app can show, in the order N cycles through them. Open one directly with
// ?world=<id>.
export const WORLDS = [pyn, maple];

export const worldById = (id) => WORLDS.find((w) => w.id === id) ?? WORLDS[0];
