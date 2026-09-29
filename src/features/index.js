import station from './station.js';
import village from './village.js';
import halt from './halt.js';
import windmill from './windmill.js';
import sheep from './sheep.js';
import trees from './trees.js';
import clouds from './clouds.js';
import train from './train.js';
import fish from './fish.js';
import boats from './boats.js';
import balloons from './balloons.js';
import villagers from './villagers.js';
import birds from './birds.js';
import hikers from './hikers.js';

// Everything a WorldConfig can put in its world, by id (cfg.features). A feature is
//   { label, build(world, { rng, ...options }) → system | undefined }
// where a system is { group?, update?(f), lateUpdate?(f), finish?(), dispose?() } — see World.js.
// Features are built in the order the config lists them; later ones may use what earlier ones
// added to the world (stops, the train, people, colliders…) — each file says what it needs.
export const FEATURES = { station, village, halt, windmill, sheep, trees, clouds, train, fish, boats, balloons, villagers, birds, hikers };
