// @ts-check
import * as THREE from 'three';
import { tamper } from './world/seal.js';
import { Track, createTrackCurve, buildTrackMeshes, noTrack } from './world/track.js';
import { createTerrain } from './world/terrain.js';
import { createTunnel } from './world/tunnel.js';
import { Sky } from './world/sky.js';
import { Weather } from './world/weather.js';
import { Site } from './world/site.js';
import { createRivers } from './world/rivers.js';
import { createScale } from './world/scale.js';
import { PERSON_HEIGHT } from './world/people.js';
import { StaticBatch, isShared } from './world/lowpoly.js';
import { mulberry32 } from './utils.js';
import { coastOf } from './world/coast.js';
import { soundLevels } from './world/soundscape.js';
import { WATER_Y } from './config.js';
import { FEATURE_IDS, featureById, loadFeatures } from './features/index.js';

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
const TMP = { p: new THREE.Vector3(), q: new THREE.Quaternion(), sc: new THREE.Vector3() };

export class World {
  /** @param {WorldConfig} cfg */
  constructor(cfg) {
    this.cfg = cfg;
    this.size = cfg.size;
    /** How big things are drawn here: map and props scales, the size audit (world/scale.js). */
    this.scale = createScale(cfg);
    /** Where the rivers are (world/rivers.js): distance(x, z), riverX for the one-river worlds. */
    this.rivers = createRivers(cfg);
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
    /** @type {any} */ this.train = null; // Train (features/train.js) — in every world with a railway
    this.scene = new THREE.Scene();
    this.time = 0; // simulated seconds (stops while paused)
    /** @type {System[]} */
    this.systems = [];
    /** @type {import('./world/seal.js').Seal | null} the sea sign's guard (landmarks/nghinh-phong.js) */
    this.seal = null;
    this.sealTick = 0;
    /** @type {THREE.Mesh[]} the jointed figures that cast shadows when near (figureShadows) */
    this.figures = [];
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
    // What the features leave here for the ones after them, the app and the tests (types.d.ts WorldOutputs):
    /** @type {Outputs['landmarks']} famous buildings, key V */
    this.landmarks = [];
    /** @type {{ people: Followable[], birds: Followable[], vehicles: Followable[], tourists: Followable[], balloons: Followable[] }} keys 6, 7, 8, 9 and 0 */
    this.followables = { people: [], birds: [], vehicles: [], tourists: [], balloons: [] };
    /** @type {Outputs['roads']} */
    this.roads = [];
    /** @type {import('./world/vehicles/vehicle.js').Vehicle[]} everything with wheels or wings */
    this.vehicles = [];
    /** @type {Outputs['streets']} */
    this.streets = [];
    /** @type {Outputs['buildings']} */
    this.buildings = [];
    /** @type {Outputs['roundabouts']} */
    this.roundabouts = [];
    /** @type {Outputs['crosswalks']} */
    this.crosswalks = [];
    /** @type {Outputs['pedestrians']} */
    this.pedestrians = [];
    /** @type {Outputs['parties']} */
    this.parties = [];
    /** @type {Outputs['cityRoutes']} */
    this.cityRoutes = [];
    /** @type {Outputs['busStop']} */
    this.busStop = null;
    /** @type {Outputs['seacraft']} */
    this.seacraft = null;
    /** @type {Outputs['beach']} */
    this.beach = null;
    /** @type {Outputs['streetLife']} */
    this.streetLife = null;
    /** @type {Outputs['host']} */
    this.host = null;
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
    if (!have) throw new Error(`Feature "${feature}" cần ${what}`);
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

  /** Loads the code of the features the config lists (some are loaded only by the worlds that use them): before steps(). */
  async load() {
    await loadFeatures(this.cfg.features);
  }

  /**
   * The build, as [label, step] pairs run one after the other so the loading screen can paint
   * between them.
   * @returns {[string, () => void][]}
   */
  steps() {
    const { cfg, scene } = this;
    const features = cfg.features.map((entry) => (typeof entry === 'string' ? { id: entry } : entry));
    checkFeatures(features, !!cfg.track);
    // Every object a step adds to the scene remembers which step put it there (userData.builtBy: a core
    // part, a feature id, or 'finish' — the static batch, merged from every feature): the e2e golden
    // (tests/e2e/helpers.js) hashes each one's part apart, so a red run names what changed.
    const seen = new Map();
    /** @type {(label: string, run: () => void, key: string) => [string, () => void]} */
    const step = (label, run, key) => {
      const n = (seen.get(key) ?? 0) + 1;
      seen.set(key, n);
      const by = n > 1 ? `${key}#${n}` : key;
      return [label, () => {
        const before = scene.children.length;
        run();
        for (const o of scene.children.slice(before)) o.userData.builtBy ??= by;
      }];
    };
    return [
      step('Đang trải đường ray', () => {
        // (No railway — cfg.track null: a stand-in nothing is near, and no stops.)
        this.track = cfg.track ? new Track(createTrackCurve(cfg), this.scale.props) : noTrack(this.scale.props);
        const M = this.track.frames.length;
        // Every stop in the config with its place on the track (frame); features build on them.
        this.stops = cfg.stops.map((st) => ({ ...st, frame: this.track.frame(Math.round(M * st.at)) }));
      }, 'track'),
      step('Đang nặn địa hình', () => {
        const terrain = (this.terrain = createTerrain(cfg, this.track, this.stops, this.rivers));
        this.heightAt = terrain.heightAt;
        this.add({
          group: new THREE.Group().add(terrain.mesh, terrain.water, terrain.frame),
          update: (f) => terrain.update(f.t),
          lateUpdate: (f) => terrain.setSnow(f.snow),
        });
      }, 'terrain'),
      ...(cfg.tunnel
        ? [step('Đang đào đường hầm', () => {
          const tunnel = (this.tunnel = createTunnel(this.track, this.heightAt, cfg.tunnel));
          this.add({ group: tunnel.group, lateUpdate: (f) => tunnel.setSnow(f.snow) });
        }, 'tunnel')]
        : []),
      step('Đang dựng cầu và tà vẹt', () => {
        if (cfg.track) {
          const rails = buildTrackMeshes(this.track, this.heightAt, this.rivers.distance);
          this.bridges = rails.bridges;
          this.scale.note('gauge', this.track.gauge, 'track');
          this.add({ group: rails.group });
        } else {
          this.bridges = [];
          // Every other world has the train's headlight (the one real light, world/train/cars.js):
          // the same one here, off, so every world's lights are the same and its materials — shared
          // between worlds — keep the shaders they have instead of getting a second set.
          scene.add(new THREE.SpotLight('#ffe7b0', 0, 90, 0.45, 0.6, 1));
        }
        const yards = this.stops.filter((st) => st.yard).map((st) => st.frame.p);
        this.site = new Site({ cfg, track: this.track, heightAt: this.heightAt, tunnel: this.tunnel, yards, rivers: this.rivers });
      }, 'bridges'),
      ...features.map((entry) => {
        const { id, stream, ...options } = entry;
        const feature = featureById(id);
        return step(feature.label, () => {
          const system = feature.build(this, { ...options, rng: this.rngFor(entry) });
          if (system) this.add(system);
        }, id);
      }),
      step('Đang pha màu bầu trời', () => {
        this.sky = new Sky(scene, { latitude: cfg.latitude ?? null, day: cfg.sunDay ?? 80 });
        const weather = (this.weather = new Weather(scene));
        // Last: everything else reads last frame's rain, as it was when the frame started.
        this.add({ update: (f) => weather.update(f.dt, f.raw, f.camera) });
      }, 'sky'),
      step('Đang hoàn thiện', () => {
        for (const s of this.systems) s.finish?.();
        for (const p of this.people) {
          const person = /** @type {import('./world/people.js').Person} */ ('person' in p ? p.person : p);
          if (!person.child) this.scale.note('person', PERSON_HEIGHT * person.group.scale.y, 'people'); // (not drawn at world.scale yet)
        }
        scene.add(this.batch.build({ chunk: cfg.chunk }));
        // Every jointed figure (people, carriages: SkinnedMesh) and its size, for the shadows (lateUpdate).
        scene.traverse((o) => {
          if (!(/** @type {any} */ (o).isSkinnedMesh) || !(/** @type {THREE.Mesh} */ (o).castShadow)) return;
          const m = /** @type {THREE.Mesh} */ (o);
          if (!m.geometry.boundingSphere) m.geometry.computeBoundingSphere();
          this.figures.push(m);
        });
        // The coast, for the sound of the sea (listen()): worked out now, not in the first frames on screen —
        // on a big map it takes long enough to make a frame stutter and the simulation jump.
        if (cfg.landcover) coastOf(this);
        this.checkSeal();
      }, 'finish'),
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
    // Who's out at this hour, and what the camera sees (world/night.js) — for the features that use it.
    const curfew = this.services.get('curfew');
    if (curfew) {
      curfew.hour = this.sky.hour;
      if (camera) curfew.look(camera);
    }
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
    if (++this.sealTick % 45 === 0) this.checkSeal();
    if (this.sealTick % 15 === 1) this.figureShadows(camera); // (from the first frame on: the same at once)
  }

  // A figure casts a shadow only where it shows: under ~12 px tall on screen (the overview: people
  // 2–6 px, hundreds of units away) its shadow is a speck nobody sees, and each one is a draw call in the
  // shadow pass, every frame — NGHINH PHONG from the start: 98 of them, a quarter of all its draw calls.
  // (Distance against size: 2 r / (2 d tan(fov / 2)) × 800 px ≥ 12, at 45° → d < 160 r.)
  /** @param {THREE.Camera} camera */
  figureShadows(camera) {
    if (!camera) return;
    const { p, q, sc } = TMP;
    for (const m of this.figures) {
      m.matrixWorld.decompose(p, q, sc);
      const r = /** @type {THREE.Sphere} */ (m.geometry.boundingSphere).radius * sc.y;
      m.castShadow = p.distanceTo(camera.position) < 160 * r;
    }
  }

  // What the camera hears from here (world/soundscape.js, played by audio.js): the sea, the wind, the
  // traffic, people's voices, and where a horn would come from.
  /** @param {THREE.Vector3} ear */
  listen(ear) {
    const shore = this.cfg.landcover ? coastOf(this).shore : []; // (worked out while building)
    // (The same arrays and records every time: asked five times a second.)
    const self = /** @type {any} */ (this), ears = (self.ears ??= { vehicles: [], cars: [], people: [] });
    const { vehicles, cars, people } = ears;
    vehicles.length = people.length = 0;
    for (const v of this.vehicles) {
      if (v.spec.flies || v.away) continue;
      const c = (cars[vehicles.length] ??= { x: 0, y: 0, z: 0, moving: false }), at = v.group.position;
      c.x = at.x;
      c.y = at.y;
      c.z = at.z;
      c.moving = v.v > 0.5;
      vehicles.push(c);
    }
    for (const p of this.people) people.push(p.pos ?? p.person.group.position);
    for (const p of /** @type {any[]} */ (this.pedestrians)) if (p.group.visible) people.push(p.pos ?? p.person.group.position);
    for (const p of /** @type {any[]} */ (this.beach?.people ?? [])) if (p.person.group.visible) people.push(p.pos ?? p.person.group.position);
    return soundLevels(ear, { shore, waterY: WATER_Y, vehicles, people, map: this.scale.map, props: this.scale.props });
  }

  // A world with the Nghinh Phong tower carries its sealed sea sign (world/seal.js): without it,
  // or with it changed, the app stops.
  checkSeal() {
    if (this.cfg.landmarks?.some((l) => l.model === 'nghinh-phong')) {
      if (!this.seal) tamper('T0');
      this.seal.check();
    }
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
/** @typedef {import('./types').WorldOutputs} Outputs */

/**
 * @param {{ id: string }[]} features
 * @param {boolean} railway whether the world has one (cfg.track)
 */
// Before anything is built: every feature exists, comes after the features it needs (feature.needs:
// ids, or a list of ids any one of which will do), and a world with a railway has a train on it
// (the cameras ride it); one without has nothing that runs on it.
function checkFeatures(features, railway = true) {
  const before = new Set();
  for (const { id } of features) {
    const feature = featureById(id);
    if (!FEATURE_IDS.includes(id)) throw new Error(`Không có feature "${id}" (src/features/index.js)`);
    if (!feature) throw new Error(`Feature "${id}" chưa được nạp (await world.load() trước world.steps())`);
    for (const need of feature.needs ?? []) {
      const options = [need].flat();
      if (!options.some((n) => before.has(n))) throw new Error(`Feature "${id}" cần ${options.map((n) => `"${n}"`).join(' hoặc ')} đứng trước nó trong cfg.features`);
    }
    before.add(id);
  }
  if (railway && !before.has('train')) throw new Error('WorldConfig cần feature "train" (máy quay đi theo tàu)');
  for (const id of ['train', 'station', 'halt']) if (!railway && before.has(id)) throw new Error(`World không có đường ray (cfg.track null) nên không có feature "${id}"`);
}
