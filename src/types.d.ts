// The contracts between the app, a world and its features. JavaScript files use them through JSDoc
// (`@type {import('../types').Feature}`…) and `npm run check` type-checks the files marked
// `// @ts-check` (tsconfig.json). Nothing here exists at run time.

import type { Object3D, Vector3, Camera } from 'three';
import type { World } from './World.js';

// ---------------------------------------------------------------- WorldConfig (src/worlds/)

/** A stop the train calls at. What is built there is up to the features (station, halt, village). */
export interface StopConfig {
  id: string;
  /** Place on the loop, as a fraction of its length (0..1). */
  at: number;
  /** Written on the station sign. */
  name: string;
  /** A flat plateau for houses beside the stop: `a` inward from the track (A0..A1), `b` along it (±HALF_B). */
  zone?: { A0: number; A1: number; HALF_B: number };
  /** A flat yard around the stop, kept clear of trees and houses. */
  yard?: boolean;
}

/** A feature in cfg.features: its id, or { id, ...options }. `stream`: features with the same number share one random stream. */
export type FeatureEntry = string | ({ id: string; stream?: number } & Record<string, unknown>);

/** What a world config file writes (src/worlds/pyn.js documents every field). */
export interface WorldRecipe {
  id: string;
  /** On the plinth and the loading screen. */
  name: string;
  seed: number;
  /** Side of the square diorama. */
  size: number;
  /** The closed loop of the railway, as (x, z) points. */
  track(): [number, number][];
  /** riverX(z) = x0 + Σ amp·sin(z·freq + phase). */
  river: { x0: number; waves: [amp: number, freq: number, phase: number][] };
  terrain: {
    hills: number;
    rim: [from: number, to: number];
    mountains: [base: number, noise: number];
    offset: [x: number, z: number];
  };
  stops: StopConfig[];
  /** The hill with the tunnel; leave out for none. */
  tunnel?: { at: number };
  features: FeatureEntry[];
}

/** A stop on a world from map data: at the point of the railway nearest a named place. */
export interface GeoStopConfig extends Omit<StopConfig, 'at'> {
  /** id of a place in the world's data (places[].id). */
  place: string;
}

/** What a world from real map data writes (src/worlds/tuyhoa.js documents every field). */
export interface GeoRecipe {
  id: string;
  name: string;
  seed: number;
  /** Side of the square diorama, in world units (the data's frame says how many metres one is). */
  size: number;
  /** The ground's grid cells, units (default 3; see WorldConfig.cell). */
  cell?: number;
  /** Loads the data file (world/geodata.js format), e.g. () => import('./data/tuyhoa.json'). */
  data(): Promise<any>;
  /** id of the railway in the data the train runs on (default: the first); null for none — a town
   *  away from the line: no train, no stations, no stops. */
  rail?: string | null;
  stops: GeoStopConfig[];
  /** Landmarks (src/landmarks/) at named places; `peak`: on the highest ground within that many units. */
  landmarks?: { model: string; place: string; rotation?: number; peak?: number }[];
  /** Land cover from the data: extra town circles (the town is also wherever the data's buildings
   *  stand close together; the rest follows height and the coast). */
  landcover?: { town?: { at: [number, number]; radius: number }[] };
  /** Day of the year the sun follows (default 80, the March equinox). */
  sunDay?: number;
  features: FeatureEntry[];
}

/** What covers the ground at a point of a world from map data (world/landcover.js). */
export type LandCover = 'sea' | 'beach' | 'coastal' | 'town' | 'forest' | 'field' | 'grass';

/** A world after defineWorld() / defineGeoWorld(): what the builders read. */
export interface WorldConfig {
  id: string;
  name: string;
  seed: number;
  size: number;
  /** The railway's points — null for a world without one (defineGeoWorld with `rail: null`). */
  track: (() => [number, number][]) | null;
  /** Size of the ground's grid cells, units (default 3): smaller is a smoother ground and shore, more triangles. */
  cell?: number;
  /** false: the railway is a line with two ends (the train goes back and forth). Default true. */
  trackClosed?: boolean;
  stops: StopConfig[];
  tunnel?: { at: number };
  features: FeatureEntry[];
  /** Procedural ground (defineWorld); absent for worlds from map data. */
  terrain?: WorldRecipe['terrain'];
  river?: WorldRecipe['river'];
  /** The one river x = riverX(z), and the same in GLSL — or null / a stub for worlds from map data. */
  riverX: ((z: number) => number) | null;
  riverGLSL: string;
  /** Worlds from map data, after load(): the real ground, the rivers as polylines, named places. */
  heights?: (x: number, z: number) => number;
  rivers?: { id: string; name: string; width: number; points: [number, number][] }[];
  places?: Record<string, { id: string; name: string; kind: string; at: [number, number]; p: [number, number] }>;
  /** Worlds from map data, after load(): the streets (real width in units) and the buildings. */
  roads?: { kind: string; name: string; width: number; points: [number, number][] }[];
  buildings?: import('./world/geodata.js').Building[];
  /** Worlds from map data: metres in one world unit (the map scale; 1 if absent). */
  metersPerUnit?: number;
  /** How big the props are drawn (world/scale.js): outright, or `exaggerate` × the map scale. */
  scale?: { props?: number; exaggerate?: number };
  /** Worlds from map data: fetch, check and project the data; the app awaits it before building. */
  load?(): Promise<void>;
  /** Worlds from map data, after load(): flat ground under the landmarks, and the landmarks. */
  pads?: { x: number; z: number; r: number; h: number }[];
  landmarks?: { id: string; name: string; model: string; p: [number, number]; h: number; rotation: number }[];
  landcover?: (x: number, z: number) => LandCover;
  /** Latitude (degrees) the sun crosses the sky at, and on which day of the year. */
  latitude?: number;
  sunDay?: number;
}

// ---------------------------------------------------------------- systems and features

/** One frame, as systems see it (World.frame — the same object every frame: don't keep it). */
export interface Frame {
  /** Simulated seconds since the last frame (0 while paused). */
  dt: number;
  /** Real seconds since the last frame. */
  raw: number;
  /** The world's simulated clock. */
  t: number;
  /** Train speed factor from the UI. */
  speed: number;
  camera: Camera;
  /** What the camera looks at (lateUpdate only). */
  focus: Vector3 | null;
  /** 0..1, at the start of the frame. */
  rain: number;
  /** How dark it is: 0 by day, 1 at night — lamps and windows glow by it. */
  lights: number;
  /** 0..1 grey sky (rain, snow). */
  overcast: number;
  /** 0..1 snow cover on the ground. */
  snow: number;
}

/** Anything in a world that moves or needs to know the time of day. */
export interface System {
  /** Added to the world's scene. */
  group?: Object3D;
  /** Every frame, before the camera follows. */
  update?(f: Frame): void;
  /** Every frame, after the camera and the sky (f.lights, f.overcast, f.snow are current). */
  lateUpdate?(f: Frame): void;
  /** Once, after every feature has been built. */
  finish?(): void;
  /** Anything World.dispose() can't find in the scene. */
  dispose?(): void;
}

export interface FeatureOptions {
  /** This feature's random stream: 0 ≤ rng() < 1. */
  rng: () => number;
  [option: string]: any;
}

/** Something a WorldConfig can put in its world (src/features/). */
export interface Feature {
  /** Shown on the loading screen while it is built. */
  label: string;
  /** Features that must come before it in cfg.features (an inner list: any one of them). */
  needs?: (string | string[])[];
  build(world: World, options: FeatureOptions): System | void;
}

// ---------------------------------------------------------------- what features share

/** A stop that has been built (world.stations): where its people live and wait. */
export interface Station {
  id: string;
  /** Track frame at the stop: position p, tangent t, sideways side, distance s. */
  frame: TrackFrame;
  /** Horizontal direction from the track to the platform. */
  out: Vector3;
  /** Where the people living around this stop go home to. */
  homes: Vector3[];
  /** Where people wait for the train. */
  platformSpots: Vector3[];
  /** A random spot on the platform floor (u along, v across, both 0..1). */
  point(u: number, v: number): Vector3;
  /** A random spot on the canopy roof, for stations that have one. */
  canopyPoint?(u: number, v: number): Vector3;
  /** Set by "villagers": the nav grid of this stop's area. */
  nav?: any;
}

export interface TrackFrame {
  p: Vector3;
  t: Vector3;
  side: Vector3;
  s: number;
}

/** Something the follow cameras (keys 6, 7, 8) can ride along with. */
export interface Followable {
  label: string;
  anchor(): Object3D;
}
