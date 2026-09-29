// @ts-check
import * as THREE from 'three';
import { Track, createTrackCurve, buildTrackMeshes } from './world/track.js';
import { createTerrain } from './world/terrain.js';
import { createTunnel } from './world/tunnel.js';
import { Sky } from './world/sky.js';
import { Weather } from './world/weather.js';
import { Site } from './world/site.js';
import { StaticBatch, isShared } from './world/lowpoly.js';
import { mulberry32 } from './utils.js';
import { FEATURES } from './features/index.js';

// One complete world built from a WorldConfig (src/worlds/): its own scene — sky, lights and fog
// included — and everything that lives in it. The app (main.js) owns the renderer, the camera, the
// sound and the UI, and shows one world at a time.
//
// Each world needs its own scene: Instancer and ParticlePool draw in world coordinates, so two
// worlds can't share one scene side by side by moving their groups.
//
// A world is the core (track, terrain, tunnel, bridges, sky, weather) plus the features its config
// lists (src/features/). Everything that moves is a *system*:
//   { group?, update?(f), lateUpdate?(f), finish?(), dispose?() }
// - group: added to the scene
// - update(f): every frame, before the camera moves — f = { dt, raw, t, speed, camera, rain, lights }
// - lateUpdate(f): after the camera and the sky — f also has { focus, lights, overcast, snow }
// - finish(): once, when every feature has been built (lamps.js builds its glow then)
// - dispose(): anything World.dispose() can't find in the scene
// `dt` is simulated time (0 while paused), `raw` real time, `t` the world's simulated clock.
export class World {
  /** @param {WorldConfig} cfg */
  constructor(cfg) {
    this.cfg = cfg;
    this.size = cfg.size;
    // Built by steps() — core:
    /** @type {any} */ this.track = null; // Track: the loop, its frames, distanceTo()
    /** @type {(StopConfig & { frame: TrackFrame })[]} */ this.stops = [];
    /** @type {any} */ this.terrain = null; // heightAt(), zones, water
    /** @type {(x: number, z: number) => number} */ this.heightAt = null;
    /** @type {any} */ this.tunnel = null; // unless cfg.tunnel
    /** @type {{ center: THREE.Vector3, side: THREE.Vector3, tangent: THREE.Vector3, index: number }[]} */ this.bridges = [];
    /** @type {Site} */ this.site = null;
    /** @type {any} */ this.sky = null;
    /** @type {any} */ this.weather = null;
    // …and by the features:
    /** @type {any} */ this.train = null; // Train (features/train.js) — required
    this.scene = new THREE.Scene();
    this.time = 0; // simulated seconds (stops while paused)
    /** @type {System[]} */
    this.systems = [];
    /** @type {Frame} */
    this.frame = { dt: 0, raw: 0, t: 0, speed: 1, camera: null, focus: null, rain: 0, lights: 0, overcast: 0, snow: 0 };
    // Filled in by the features while they are built:
    this.batch = new StaticBatch(); // static parts, baked into one mesh per material at the end
    /** @type {Station[]} stops with a station built on them, in the order the train calls */
    this.stations = [];
    /** @type {import('./world/walker.js').Walker[]} living in the world (doors open for them, pigeons flee from them) */
    this.people = [];
    /** @type {Record<string, THREE.Vector3>} places the camera can fly to (keys F, G, K, J, L) */
    this.spots = {};
    /** @type {{ people: Followable[], birds: Followable[] }} keys 6 and 7 */
    this.followables = { people: [], birds: [] };
    /** @type {Map<string, any>} shared helpers created by the first feature that needs them */
    this.services = new Map();
    /** @type {Map<number, () => number>} random streams, see rngFor() */
    this.streams = new Map();
  }

  /**
   * @template {System} T
   * @param {T} system
   * @returns {T}
   */
  add(system) {
    if (system.group) this.scene.add(system.group);
    this.systems.push(system);
    return system;
  }

  /**
   * One shared helper per world (lamps, houses…), created on first use.
   * @template T
   * @param {string} name
   * @param {() => T} create
   * @returns {T}
   */
  service(name, create) {
    if (!this.services.has(name)) this.services.set(name, create());
    return this.services.get(name);
  }

  /**
   * For what a feature needs from the config (a stop, a zone): fails the build with a clear message.
   * @param {string} what
   * @param {string} feature
   * @param {unknown} have
   */
  need(what, feature, have) {
    if (!have) throw new Error(`Feature "${feature}" cần ${what} (thêm nó vào trước trong cfg.features)`);
  }

  // A stop from cfg.stops (with its track frame): the one named, or by default the first one no
  // feature has built a station on yet.
  /**
   * @param {string | undefined} id
   * @param {string} feature
   */
  stop(id, feature) {
    const st = id === undefined ? this.stops.find((s) => !this.stationById(s.id)) : this.stops.find((s) => s.id === id);
    this.need(id === undefined ? 'một điểm dừng còn trống trong cfg.stops' : `điểm dừng "${id}" trong cfg.stops`, feature, st);
    return st;
  }

  /** @param {string} id */
  stationById(id) {
    return this.stations.find((st) => st.id === id);
  }

  // Each feature draws from its own random stream (seeded from the world's seed and its id), so
  // adding or removing one doesn't reshuffle the others. Features given the same `stream` number in
  // the config share one stream instead, in config order (that is how PYN keeps its original look).
  /**
   * @param {{ id: string, stream?: number }} entry
   * @returns {() => number}
   */
  rngFor({ id, stream }) {
    if (stream === undefined) {
      let h = 0;
      for (const c of id) h = (Math.imul(h, 31) + c.charCodeAt(0)) | 0;
      return mulberry32(this.cfg.seed ^ h);
    }
    if (!this.streams.has(stream)) this.streams.set(stream, mulberry32(this.cfg.seed + stream));
    return this.streams.get(stream);
  }

  /**
   * The build, as [label, step] pairs run one after the other so the loading screen can paint
   * between them.
   * @returns {[string, () => void][]}
   */
  steps() {
    const { cfg, scene } = this;
    const features = cfg.features.map((entry) => (typeof entry === 'string' ? { id: entry } : entry));
    checkFeatures(features);
    /** @type {(label: string, run: () => void) => [string, () => void]} */
    const step = (label, run) => [label, run];
    return [
      step('Đang trải đường ray', () => {
        this.track = new Track(createTrackCurve(cfg));
        const M = this.track.frames.length;
        // Every stop in the config with its place on the track (frame); features build on them.
        this.stops = cfg.stops.map((st) => ({ ...st, frame: this.track.frame(Math.round(M * st.at)) }));
      }),
      step('Đang nặn địa hình', () => {
        const terrain = (this.terrain = createTerrain(cfg, this.track, this.stops));
        this.heightAt = terrain.heightAt;
        this.add({
          group: new THREE.Group().add(terrain.mesh, terrain.water, terrain.frame),
          update: (f) => terrain.update(f.t),
          lateUpdate: (f) => terrain.setSnow(f.snow),
        });
      }),
      ...(cfg.tunnel
        ? [step('Đang đào đường hầm', () => {
          const tunnel = (this.tunnel = createTunnel(this.track, this.heightAt, cfg.tunnel));
          this.add({ group: tunnel.group, lateUpdate: (f) => tunnel.setSnow(f.snow) });
        })]
        : []),
      step('Đang dựng cầu và tà vẹt', () => {
        const rails = buildTrackMeshes(this.track, this.heightAt, cfg.riverX);
        this.bridges = rails.bridges;
        this.add({ group: rails.group });
        const yards = this.stops.filter((st) => st.yard).map((st) => st.frame.p);
        this.site = new Site({ cfg, track: this.track, heightAt: this.heightAt, tunnel: this.tunnel, yards });
      }),
      ...features.map((entry) => {
        const { id, stream, ...options } = entry;
        const feature = FEATURES[id];
        return step(feature.label, () => {
          const system = feature.build(this, { ...options, rng: this.rngFor(entry) });
          if (system) this.add(system);
        });
      }),
      step('Đang pha màu bầu trời', () => {
        this.sky = new Sky(scene);
        const weather = (this.weather = new Weather(scene));
        // Last: everything else reads last frame's rain, as it was when the frame started.
        this.add({ update: (f) => weather.update(f.dt, f.raw, f.camera) });
      }),
      step('Đang hoàn thiện', () => {
        for (const s of this.systems) s.finish?.();
        scene.add(this.batch.build());
      }),
    ];
  }

  // What the camera rig needs to move around this world (CameraRig.attach).
  get view() {
    const { terrain, tunnel } = this;
    return {
      train: this.train,
      bridges: this.bridges,
      // Keep the camera above the ground and out of the tunnel hill.
      heightAt: tunnel ? (x, z) => Math.max(terrain.heightAt(x, z), tunnel.surfaceAt(x, z)) : terrain.heightAt,
      followables: this.followables,
      occludes: this.site.occludes,
      size: this.size,
    };
  }

  // Everything that moves on its own, before the camera follows it.
  /** @param {{ dt: number, raw: number, speed: number, camera: THREE.Camera }} input */
  update({ dt, raw, speed, camera }) {
    this.time += dt;
    const f = Object.assign(this.frame, { dt, raw, speed, camera, t: this.time, rain: this.weather.rain });
    for (const s of this.systems) s.update?.(f);
  }

  // After the camera has moved: the sun's shadow area follows what the camera looks at; lamps,
  // windows, clouds and snow cover follow the sky and the weather.
  /** @param {{ raw: number, camera: THREE.Camera, focus: THREE.Vector3 }} input */
  lateUpdate({ raw, camera, focus }) {
    const { sky, weather } = this;
    sky.update(raw, camera, focus, weather);
    const f = Object.assign(this.frame, { raw, camera, focus, lights: sky.lights, overcast: weather.overcast, snow: weather.snowCover });
    for (const s of this.systems) s.lateUpdate?.(f);
  }

  // Compile every shader while the loading screen is up — including those of things hidden at
  // start (rain, snow, cabins, balloon flames…), which would otherwise compile, and stall a frame,
  // the first time they appear. compileAsync lets the driver compile in parallel where it can.
  async precompile(renderer, camera) {
    const hidden = [];
    this.scene.traverse((o) => {
      if (!o.visible) {
        hidden.push(o);
        o.visible = true;
      }
    });
    try {
      await renderer.compileAsync(this.scene, camera);
      // Some drivers only really compile on first draw: draw one frame now, behind the loading screen.
      renderer.render(this.scene, camera);
    } finally {
      hidden.forEach((o) => (o.visible = false));
    }
  }

  // Free the GPU side of this world: its geometries, materials, textures, bone textures, instance
  // buffers and the sun's shadow map. Resources cached for every world (lowpoly.js keep()) stay.
  dispose() {
    for (const s of this.systems) s.dispose?.();
    const geometries = new Set();
    const materials = new Set();
    const textures = new Set();
    this.scene.traverse((o) => {
      if (o.geometry) geometries.add(o.geometry);
      if (o.material) for (const m of [].concat(o.material)) materials.add(m);
      if (o.isSkinnedMesh) o.skeleton.dispose();
      if (o.isInstancedMesh || o.isLight) o.dispose();
    });
    for (const m of materials) {
      if (isShared(m)) continue;
      for (const v of Object.values(m)) if (v?.isTexture) textures.add(v);
      for (const u of Object.values(m.uniforms ?? {})) if (u.value?.isTexture) textures.add(u.value);
      m.dispose();
    }
    for (const g of geometries) if (!isShared(g)) g.dispose();
    for (const t of textures) t.dispose();
    this.scene.clear();
  }
}

/** @typedef {import('./types').WorldConfig} WorldConfig */
/** @typedef {import('./types').StopConfig} StopConfig */
/** @typedef {import('./types').TrackFrame} TrackFrame */
/** @typedef {import('./types').Station} Station */
/** @typedef {import('./types').System} System */
/** @typedef {import('./types').Frame} Frame */
/** @typedef {import('./types').Followable} Followable */

/**
 * @param {{ id: string }[]} features
 */
// Before anything is built: every feature exists, comes after the features it needs (feature.needs:
// ids, or a list of ids any one of which will do), and there is a train (the cameras ride it).
function checkFeatures(features) {
  const before = new Set();
  for (const { id } of features) {
    const feature = FEATURES[id];
    if (!feature) throw new Error(`Không có feature "${id}" (src/features/index.js)`);
    for (const need of feature.needs ?? []) {
      const options = [need].flat();
      if (!options.some((n) => before.has(n))) throw new Error(`Feature "${id}" cần ${options.map((n) => `"${n}"`).join(' hoặc ')} đứng trước nó trong cfg.features`);
    }
    before.add(id);
  }
  if (!before.has('train')) throw new Error('WorldConfig cần feature "train" (máy quay đi theo tàu)');
}
