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
  constructor(cfg) {
    this.cfg = cfg;
    this.size = cfg.size;
    this.tunnel = null; // unless cfg.tunnel
    this.scene = new THREE.Scene();
    this.time = 0; // simulated seconds (stops while paused)
    this.systems = [];
    this.frame = { dt: 0, raw: 0, t: 0, speed: 1, camera: null, focus: null, rain: 0, lights: 0, overcast: 0, snow: 0 };
    // Filled in by the features while they are built:
    this.batch = new StaticBatch(); // static parts, baked into one mesh per material at the end
    this.stations = []; // stops the train calls at: { id, frame, out, homes, platformSpots, point, … }
    this.people = []; // Walkers living in the world (doors open for them, pigeons flee from them)
    this.spots = {}; // places the camera can fly to (keys F, G, K, J, L)
    this.followables = { people: [], birds: [] }; // { label, anchor() → Object3D }, keys 6 and 7
    this.services = new Map(); // shared helpers created by the first feature that needs them
    this.streams = new Map(); // random streams, see rngFor()
  }

  add(system) {
    if (system.group) this.scene.add(system.group);
    this.systems.push(system);
    return system;
  }

  // One shared helper per world (lamps, houses…), created on first use.
  service(name, create) {
    if (!this.services.has(name)) this.services.set(name, create());
    return this.services.get(name);
  }

  // For features that build on another one: fails the build with a clear message if it's missing.
  need(what, feature, have) {
    if (!have) throw new Error(`Feature "${feature}" cần ${what} (thêm nó vào trước trong cfg.features)`);
  }

  // A stop from cfg.stops (with its track frame): the one named, or by default the first one no
  // feature has built a station on yet.
  stop(id, feature) {
    const st = id === undefined ? this.stops.find((s) => !this.stationById(s.id)) : this.stops.find((s) => s.id === id);
    this.need(id === undefined ? 'một điểm dừng còn trống trong cfg.stops' : `điểm dừng "${id}" trong cfg.stops`, feature, st);
    return st;
  }

  stationById(id) {
    return this.stations.find((st) => st.id === id);
  }

  // Each feature draws from its own random stream (seeded from the world's seed and its id), so
  // adding or removing one doesn't reshuffle the others. Features given the same `stream` number in
  // the config share one stream instead, in config order (that is how PYN keeps its original look).
  rngFor({ id, stream }) {
    if (stream === undefined) {
      let h = 0;
      for (const c of id) h = (Math.imul(h, 31) + c.charCodeAt(0)) | 0;
      return mulberry32(this.cfg.seed ^ h);
    }
    if (!this.streams.has(stream)) this.streams.set(stream, mulberry32(this.cfg.seed + stream));
    return this.streams.get(stream);
  }

  // The build, as [label, step] pairs run one after the other so the loading screen can paint
  // between them.
  steps() {
    const { cfg, scene } = this;
    const features = cfg.features.map((entry) => (typeof entry === 'string' ? { id: entry } : entry));
    checkFeatures(features);
    return [
      ['Đang trải đường ray', () => {
        this.track = new Track(createTrackCurve(cfg));
        const M = this.track.frames.length;
        // Every stop in the config with its place on the track (frame); features build on them.
        this.stops = cfg.stops.map((st) => ({ ...st, frame: this.track.frame(Math.round(M * st.at)) }));
      }],
      ['Đang nặn địa hình', () => {
        const terrain = (this.terrain = createTerrain(cfg, this.track, this.stops));
        this.heightAt = terrain.heightAt;
        this.add({
          group: new THREE.Group().add(terrain.mesh, terrain.water, terrain.frame),
          update: (f) => terrain.update(f.t),
          lateUpdate: (f) => terrain.setSnow(f.snow),
        });
      }],
      ...(cfg.tunnel
        ? [['Đang đào đường hầm', () => {
          const tunnel = (this.tunnel = createTunnel(this.track, this.heightAt, cfg.tunnel));
          this.add({ group: tunnel.group, lateUpdate: (f) => tunnel.setSnow(f.snow) });
        }]]
        : []),
      ['Đang dựng cầu và tà vẹt', () => {
        const rails = buildTrackMeshes(this.track, this.heightAt, cfg.riverX);
        this.bridges = rails.bridges;
        this.add({ group: rails.group });
        const yards = this.stops.filter((st) => st.yard).map((st) => st.frame.p);
        this.site = new Site({ cfg, track: this.track, heightAt: this.heightAt, tunnel: this.tunnel, yards });
      }],
      ...features.map((entry) => {
        const { id, stream, ...options } = entry;
        const feature = FEATURES[id];
        return [feature.label, () => {
          const system = feature.build(this, { ...options, rng: this.rngFor(entry) });
          if (system) this.add(system);
        }];
      }),
      ['Đang pha màu bầu trời', () => {
        this.sky = new Sky(scene);
        const weather = (this.weather = new Weather(scene));
        // Last: everything else reads last frame's rain, as it was when the frame started.
        this.add({ update: (f) => weather.update(f.dt, f.raw, f.camera) });
      }],
      ['Đang hoàn thiện', () => {
        for (const s of this.systems) s.finish?.();
        scene.add(this.batch.build());
      }],
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
  update({ dt, raw, speed, camera }) {
    this.time += dt;
    const f = Object.assign(this.frame, { dt, raw, speed, camera, t: this.time, rain: this.weather.rain });
    for (const s of this.systems) s.update?.(f);
  }

  // After the camera has moved: the sun's shadow area follows what the camera looks at; lamps,
  // windows, clouds and snow cover follow the sky and the weather.
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
