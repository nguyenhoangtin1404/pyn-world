// @ts-check
import nghinhphong from './nghinhphong.js';

// The worlds the app offers — the world picker, N, the one it opens on — are in the app's own chunk.
// The others (all still built and tested, opened with ?world=<id>) are loaded only when asked for, each
// its own chunk, with the features only they use (features/index.js). Every world at once, for the tests
// and tools: worlds/all.js.
/** @type {import('../types').WorldConfig[]} */
export const SHOWN = [nghinhphong];

/** @type {Record<string, () => Promise<{ default: import('../types').WorldConfig }>>} every world there is, in the order the tests go through them */
const LOADERS = {
  pyn: () => import('./pyn.js'),
  maple: () => import('./maple.js'),
  tuyhoa: () => import('./tuyhoa.js'),
  nghinhphong: async () => ({ default: nghinhphong }),
};

/** Every world's id, hidden ones too. */
export const WORLD_IDS = Object.keys(LOADERS);

/** @param {string | null} id any world's id (hidden ones too); anything else: the first one shown */
export const worldId = (id) => (id && Object.hasOwn(LOADERS, id) ? id : SHOWN[0].id);

/** The config of a world (worldId() picks which), loaded if it is a hidden one. @param {string | null} id */
export const loadWorld = async (id) => (await LOADERS[worldId(id)]()).default;
