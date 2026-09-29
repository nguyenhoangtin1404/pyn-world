import * as THREE from 'three';
import { Track, createTrackCurve, buildTrackMeshes } from './world/track.js';
import { createTerrain } from './world/terrain.js';
import { buildScenery } from './world/scenery.js';
import { Train } from './world/train.js';
import { createLife } from './world/life.js';
import { createTunnel } from './world/tunnel.js';
import { Sky } from './world/sky.js';
import { Weather } from './world/weather.js';
import { isShared } from './world/lowpoly.js';

// One complete world built from a WorldConfig (src/worlds/): its own scene — sky, lights and fog
// included — and everything that lives in it. The app (main.js) owns the renderer, the camera, the
// sound and the UI, and shows one world at a time.
//
// Each world needs its own scene: Instancer and ParticlePool draw in world coordinates, so two
// worlds can't share one scene side by side by moving their groups.
export class World {
  constructor(cfg) {
    this.cfg = cfg;
    this.scene = new THREE.Scene();
    this.time = 0; // simulated seconds (stops while paused)
    this.lastSnow = 0;
  }

  // The build, as [label, step] pairs run one after the other so the loading screen can paint
  // between them.
  steps() {
    const { cfg, scene } = this;
    return [
      ['Đang trải đường ray', () => {
        this.track = new Track(createTrackCurve(cfg));
        this.station = this.track.frame(Math.round(this.track.frames.length * cfg.station.at));
        this.halt = this.track.frame(Math.round(this.track.frames.length * cfg.halt.at));
      }],
      ['Đang nặn địa hình', () => {
        this.terrain = createTerrain(cfg, this.track, this.station, this.halt);
        scene.add(this.terrain.mesh, this.terrain.water, this.terrain.frame);
      }],
      ['Đang đào đường hầm', () => {
        this.tunnel = createTunnel(this.track, this.terrain.heightAt, cfg.tunnel);
        scene.add(this.tunnel.group);
      }],
      ['Đang dựng cầu và tà vẹt', () => {
        this.rails = buildTrackMeshes(this.track, this.terrain.heightAt, cfg.riverX);
        scene.add(this.rails.group);
      }],
      ['Đang trồng cây, thả cừu', () => {
        const { track, terrain, station, halt, tunnel } = this;
        this.scenery = buildScenery({ cfg, track, terrain, bridges: this.rails.bridges, station, halt, tunnel });
        scene.add(this.scenery.group);
      }],
      ['Đang lắp đầu máy', () => {
        this.train = new Train(this.track);
        this.train.tunnel = this.tunnel;
        this.train.setStops(this.scenery.stations.map((st) => ({ s: st.frame.s + 14, out: st.out })));
        scene.add(this.train.group);
      }],
      ['Đang thả cá, bơm khinh khí cầu', () => {
        const { terrain, track, scenery, train } = this;
        this.life = createLife({ cfg, terrain, track, scenery, train });
        scene.add(this.life.group);
      }],
      ['Đang pha màu bầu trời', () => {
        this.sky = new Sky(scene);
        this.weather = new Weather(scene);
      }],
    ];
  }

  // What the camera rig needs to move around this world (CameraRig.attach).
  get view() {
    const { terrain, tunnel } = this;
    return {
      train: this.train,
      bridges: this.rails.bridges,
      // Keep the camera above the ground and out of the tunnel hill.
      heightAt: (x, z) => Math.max(terrain.heightAt(x, z), tunnel.surfaceAt(x, z)),
      followables: this.life.followables,
      occludes: this.scenery.occludes,
      size: this.cfg.size,
    };
  }

  // Places the camera can fly to (keys F, G, K, J, L).
  get spots() {
    return { ...this.scenery.spots, ...this.life.spots };
  }

  // Everything that moves on its own. `dt` is simulated time (0 while paused), `raw` real time.
  update({ dt, raw, speed, camera }) {
    this.time += dt;
    const t = this.time;
    const { train, scenery, life, terrain, weather, tunnel } = this;
    train.update(dt, speed);
    scenery.update(dt, t);
    life.update(dt, t, { rain: weather.rain });
    terrain.update(t);
    weather.update(dt, raw, camera);
    const snow = weather.snowCover;
    if (Math.abs(snow - this.lastSnow) > 0.01 || (snow === 0 && this.lastSnow !== 0)) {
      this.lastSnow = snow;
      terrain.setSnow(snow);
      tunnel.setSnow(snow);
    }
  }

  // After the camera has moved: the sun's shadow area follows what the camera looks at, and the
  // lamps and windows follow the sky.
  updateLighting({ raw, camera, focus }) {
    const { sky, weather } = this;
    sky.update(raw, camera, focus, weather);
    this.train.setLights(sky.lights);
    this.scenery.setLights(sky.lights);
    this.life.setLights(sky.lights);
    this.scenery.setOvercast(weather.overcast);
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
