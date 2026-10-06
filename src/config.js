// Engine constants, the same in every world: heights of the railway and the water, the track gauge.
// What makes one world different from another (seed, size, track, river, stations…) lives in its
// WorldConfig — see src/worlds/.

export const TRACK_Y = 3;
export const WATER_Y = -2;
export const RIVER_BED = -5;
export const BASE_Y = -16; // bottom of the soil cut-away; the wooden plinth sits below this

// Track cross-section, relative to TRACK_Y: ballast top 0.30, sleeper top 0.44, rail top 0.62 (× k: Track.railTop).
export const GAUGE = 1.5;
