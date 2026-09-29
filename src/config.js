export const SEED = 20260929;

export const WORLD_SIZE = 600;
export const TERRAIN_SEGMENTS = 200;

export const TRACK_Y = 3;
export const WATER_Y = -2;
export const RIVER_BED = -5;
export const BASE_Y = -16; // bottom of the soil cut-away; the wooden plinth sits below this

// Track cross-section, relative to TRACK_Y: ballast top 0.30, sleeper top 0.44, rail top 0.62.
export const GAUGE = 1.5;
export const RAIL_TOP = TRACK_Y + 0.62;

// Second stop on the far side of the loop (fraction of the track; the main station is at 0). Just
// short of the tunnel hill, which sits right opposite the station at 0.5.
export const HALT_AT = 0.385;
