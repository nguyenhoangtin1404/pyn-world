// @ts-check
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
import road from './road.js';
import traffic from './traffic.js';
import aircraft from './aircraft.js';
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
//   { label, needs?, build(world, { rng, ...options }) → system | undefined }
// where a system is { group?, update?(f), lateUpdate?(f), finish?(), dispose?() } — see World.js.
// Features are built in the order the config lists them; later ones may use what earlier ones
// added to the world (stations, the train, people, colliders…). `needs` lists the features that
// must come before (an inner list: any one of them), checked before the world is built.
export const FEATURES = { station, village, halt, windmill, sheep, trees, clouds, train, fish, boats, balloons, villagers, birds, hikers, road, traffic, aircraft, landmarks, streets, buildings, citytraffic, strollers, tourists, busstop, seacraft, beach, streetlife, host };
