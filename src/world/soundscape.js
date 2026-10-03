// @ts-check

// How loud each kind of sound around the camera is, 0..1 (src/audio.js plays them): the sea (the
// nearest point of the shore), the wind (stronger by the sea and higher up), the traffic's engines and
// the people's voices (everyone near, nearer counting more). Distances are in metres as drawn — the
// map's for the sea, the props' for vehicles and people (a car drawn three times its size on a small map
// sounds as near as it looks). Plain numbers, no Web Audio: tested in tests/unit/soundscape.test.js.

/**
 * @typedef {{ x: number, z: number }} XZ
 * @typedef {{ sea: number, wind: number, traffic: number, crowd: number, horn: { x: number, y: number, z: number, level: number } | null }} Levels
 *   horn: the vehicle a horn would come from now (the nearest that is moving, weighted by chance), and how loud
 */

const clamp01 = (/** @type {number} */ v) => Math.max(0, Math.min(1, v));

export const SEA_REACH = 500; // metres: the surf is heard up to about here
export const HEIGHT_COUNTS = 0.3; // how much of the camera's height over the water counts as distance from the sea
// (a diorama: from the overview, high over the town, the beach in view is heard, softly)
export const VEHICLE_NEAR = 18; // metres: a vehicle this far counts half
export const PERSON_NEAR = 8; // metres: someone this far counts half

/**
 * @param {{ x: number, y: number, z: number }} ear the camera
 * @param {{ shore: XZ[], waterY: number, vehicles: { x: number, y: number, z: number, moving: boolean }[],
 *   people: { x: number, y: number, z: number }[], map: number, props: number, pick?: number }} w
 *   map: units per metre of the map, props: of things; pick: 0..1, which near vehicle sounds its horn
 * @returns {Levels}
 */
export function soundLevels(ear, { shore, waterY, vehicles, people, map, props, pick = Math.random() }) {
  // The sea: by the nearest shore point (and some of the height over the water), fading out at SEA_REACH.
  let d2 = Infinity;
  for (const p of shore) {
    const dx = p.x - ear.x, dz = p.z - ear.z;
    d2 = Math.min(d2, dx * dx + dz * dz);
  }
  const up = Math.max(0, ear.y - waterY);
  const seaM = Math.sqrt(d2 + (up * HEIGHT_COUNTS) ** 2) / map;
  const sea = shore.length ? clamp01(1 - seaM / SEA_REACH) ** 1.5 : 0;
  // Engines and voices: each source 1 / (1 + (d / near)²), together 1 − e^(−sum) (a crowd is loud, not endless).
  const near = (/** @type {{ x: number, y: number, z: number }} */ s, /** @type {number} */ ref) => {
    const r = ref * props, dx = s.x - ear.x, dy = s.y - ear.y, dz = s.z - ear.z;
    return 1 / (1 + (dx * dx + dy * dy + dz * dz) / (r * r));
  };
  let engines = 0, horn = null, hornW = 0;
  /** @type {number[]} */
  const weights = [];
  for (const v of vehicles) {
    const w = near(v, VEHICLE_NEAR);
    engines += v.moving ? w : w * 0.3; // (idling at the lights: quieter)
    weights.push(v.moving ? w : 0);
    hornW += v.moving ? w : 0;
  }
  // The horn: one of the moving vehicles, the nearer the likelier.
  if (hornW > 0) {
    let r = pick * hornW;
    for (let i = 0; i < vehicles.length; i++) {
      if (!weights[i] || (r -= weights[i]) > 0) continue;
      horn = { x: vehicles[i].x, y: vehicles[i].y, z: vehicles[i].z, level: weights[i] };
      break;
    }
    if (!horn) { // (rounding: the last moving one)
      const i = weights.findLastIndex((w) => w > 0);
      horn = { x: vehicles[i].x, y: vehicles[i].y, z: vehicles[i].z, level: weights[i] };
    }
  }
  let voices = 0;
  for (const p of people) voices += near(p, PERSON_NEAR);
  const wind = clamp01(0.25 + 0.5 * sea + (up / props / 120) * 0.25);
  return { sea, wind, traffic: 1 - Math.exp(-engines), crowd: 1 - Math.exp(-voices), horn };
}
