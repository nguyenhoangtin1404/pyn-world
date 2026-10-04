import * as THREE from 'three';
import './style.css';
import { TIME_PRESETS, presetAtHour } from './world/sky.js';
import { PostFX } from './render/post.js';
import { CameraRig } from './cameras.js';
import { AudioEngine } from './audio.js';
import { initHud } from './hud.js';
import { createLoader } from './app/loader.js';
import { createKeyHandler } from './app/keys.js';
import { createTour } from './app/tour.js';
import { createHostCard } from './app/host.js';
import { createResolutionAdapter, createStats } from './app/perf.js';
import { nextFrame } from './utils.js';
import { World } from './World.js';
import { SHOWN, worldById } from './worlds/index.js';

// The app: renderer, camera, sound, UI and the frame loop. What is on screen is `world` — one
// World (src/World.js) built from a WorldConfig (src/worlds/); the world picker or N switches.
// Around it, in src/app/: the loading screen, the keyboard shortcuts, frame-rate upkeep.

const state = {
  world: worldById(new URLSearchParams(location.search).get('world')).id,
  switchingTo: null, // id of the world being built, while switching
  mode: 'overview',
  timeOfDay: 'day',
  hour: 9, // 0..24, drives the sky
  autoDay: true, // clock advances by itself
  weather: 'clear',
  speed: 1,
  timeScale: 1,
  paused: false,
  pixel: 1,
  outline: false,
  shadows: true,
  volume: 0.65,
  muted: false,
};

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
// Reading shader logs after every compile makes the browser wait for each compile to finish; only
// worth it while developing.
renderer.debug.checkShaderErrors = import.meta.env.DEV;
// Retina / phone screens: rendering at the full device pixel ratio (with MSAA on top) multiplies
// the pixels to shade by up to 4×. Start at most at 1.5 and let adaptResolution() go lower.
const MAX_DPR = Math.min(devicePixelRatio, 1.5);
renderer.setPixelRatio(MAX_DPR);
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
// three.js r186 dropped PCFSoftShadowMap and falls back to PCFShadowMap at the first shadow render,
// which made every shader compiled before that (the whole precompile) compile a second time.
renderer.shadowMap.type = THREE.PCFShadowMap;
document.getElementById('scene').appendChild(renderer.domElement);

const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 2000);
const audio = new AudioEngine();
let sound = null, soundAge = 0; // what the camera hears (world.listen), and how old that is
const post = new PostFX(renderer);
const rig = new CameraRig(camera, renderer.domElement);
let world = null; // the World on screen (null while the next one is being built)
if (import.meta.env.DEV) window.__pyn = { get W() { return world; }, renderer, post, rig, camera, state, switchWorld: (id) => switchWorld(id) };

const adaptResolution = createResolutionAdapter(renderer, MAX_DPR, resize);
const stats = createStats(renderer);
const loader = createLoader();

function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  post.setSize(w, h, renderer.getPixelRatio());
}

let hud;
let landmarkIndex = -1;
const tour = createTour({ rig, camera, muted: () => state.muted, volume: () => state.volume, base: import.meta.env.BASE_URL, duck: (on) => audio.duck(on), onEnd: () => document.getElementById('app').classList.remove('touring') });
const actions = {
  setWorld(id) {
    switchWorld(id);
  },
  // False when there is nothing to follow in this world (no vehicles, say).
  setMode(id) {
    tour.stop();
    if (!rig.setMode(id)) {
      hud.toast('Thế giới này không có gì để theo');
      return false;
    }
    state.mode = id;
    hud.sync();
    return true;
  },
  // Famous buildings (worlds from map data): fly to the next one.
  flyToLandmark() {
    tour.stop();
    const list = world?.landmarks ?? [];
    if (!list.length) {
      hud.toast('Thế giới này không có công trình nổi tiếng');
      return;
    }
    landmarkIndex = (landmarkIndex + 1) % list.length;
    const lm = list[landmarkIndex];
    rig.flyToSpot(lm.spot, lm.view);
    state.mode = 'overview';
    hud.sync();
    hud.toast(`Bay tới ${lm.name} 🏛`);
  },
  // The narrated tour of the (first) landmark that has one: I to start, again (or Esc) to stop.
  toggleTour(auto = false) {
    if (tour.active) return actions.stopTour();
    const lm = world?.landmarks.find((l) => l.tour?.length);
    if (!lm) return hud.toast('Thế giới này không có thuyết minh');
    if (!auto) audio.init(); // (a page that starts it by itself can't make sound yet)
    if (rig.mode !== 'overview') rig.setMode('overview', { fly: false });
    state.mode = 'overview';
    tour.start(lm);
    document.getElementById('app').classList.add('touring'); // (the panel steps aside for the subtitles)
    hud.sync();
  },
  // `quiet`: the camera is going elsewhere anyway (another key), no need to say so.
  stopTour(quiet = false) {
    if (!tour.active) return;
    tour.stop();
    if (!quiet) hud.toast('Đã dừng thuyết minh');
  },
  // Jump the clock to a preset's hour (the automatic cycle keeps running from there).
  setTime(id) {
    state.hour = TIME_PRESETS.find((p) => p.id === id).hour;
    state.timeOfDay = id;
    world?.sky.setHour(state.hour);
    hud.sync();
  },
  toggleAutoDay() {
    state.autoDay = !state.autoDay;
    hud.sync();
  },
  setWeather(id) {
    state.weather = id;
    world?.weather.set(id);
    hud.sync();
  },
  setSpeed(v) {
    state.speed = v;
    hud.sync();
  },
  setTimeScale(v) {
    state.timeScale = v;
    state.paused = false;
    hud.sync();
  },
  setPixel(v) {
    state.pixel = v;
    post.setPixel(v);
    hud.sync();
  },
  setOutline(on) {
    state.outline = on;
    post.setOutline(on);
    hud.sync();
  },
  setShadows(on) {
    state.shadows = on;
    if (world) world.sky.sun.castShadow = on;
    hud.sync();
  },
  toggleMute() {
    audio.init();
    state.muted = !state.muted;
    audio.setMuted(state.muted);
    tour.retell();
    hud.sync();
  },
  setVolume(v) {
    audio.init();
    state.volume = v;
    audio.setVolume(v);
    hud.sync();
  },
};

// The author on the landmark's square: a tap shows their bubble with a QR code (features/host.js).
const hostCard = createHostCard({
  camera,
  rig,
  canvas: renderer.domElement,
  world: () => world,
  onOpen: () => {
    actions.stopTour(true);
    if (rig.mode !== 'overview') rig.setMode('overview', { fly: false });
    state.mode = 'overview';
    hud?.sync();
  },
});

const onKey = createKeyHandler({ state, actions, rig, audio, worlds: SHOWN, hud: () => hud, world: () => world, switchWorld });

const clock = new THREE.Clock();

function frame() {
  requestAnimationFrame(frame);
  const delta = clock.getDelta();
  if (!world) return; // the next world is being built behind the loading screen
  const frameStart = performance.now();
  stats?.begin();
  adaptResolution(delta);
  const raw = Math.min(delta, 0.1);
  const dt = state.paused ? 0 : raw * state.timeScale;
  if (state.autoDay && dt > 0) {
    // One in-game hour every 10 s at 1× → a full day in 4 minutes.
    state.hour = (state.hour + dt / 10) % 24;
    world.sky.setHour(state.hour);
    const preset = presetAtHour(state.hour);
    if (preset !== state.timeOfDay) {
      state.timeOfDay = preset;
      hud.sync();
    }
  }
  hud.setClock(state.hour, state.autoDay);

  world.update({ dt, raw, speed: state.speed, camera });
  tour.update(Math.min(delta, 1)); // (real time: the narrator speaks in it)
  rig.update(raw);
  world.lateUpdate({ raw, camera, focus: rig.focus });

  // What the camera hears around it: 5 times a second is plenty (the sound eases to each new level).
  if ((soundAge += raw) > 0.2 || !sound) [sound, soundAge] = [world.listen(camera.position), 0];
  audio.update(raw, {
    trainDistance: world.train ? camera.position.distanceTo(world.train.locoPos) : Infinity,
    rain: world.weather.rain,
    day: world.sky.lights < 0.3,
    paused: dt === 0,
    sound,
  });

  post.render(world.scene, camera);

  stats?.end(frameStart);
}

// Build a world step by step behind the loading screen, compile its shaders, and return it.
async function buildWorld(cfg) {
  if (cfg.load) {
    // A world from map data: fetch and check its data first (world/geodata.js).
    loader.phase('Đang tải bản đồ');
    await cfg.load();
  }
  const next = new World(cfg);
  const steps = next.steps();
  for (let i = 0; i < steps.length; i++) {
    loader.phase(steps[i][0]);
    // Let the new label paint (rAF, then a task after the paint), then do the step.
    await nextFrame();
    await new Promise((r) => setTimeout(r, 0));
    steps[i][1]();
    loader.progress(Math.round(((i + 1) / steps.length) * 100));
  }
  rig.attach(next.view); // compile from where the camera will start
  loader.phase('Đang chuẩn bị shader');
  await next.precompile(renderer, camera);
  return next;
}

// Hand the sound and the current settings (clock, weather, shadows) to a newly built world.
function show(next) {
  world = next;
  state.mode = 'overview';
  hud?.setWorld(world);
  world.sky.setHour(state.hour, true);
  world.weather.set(state.weather);
  world.sky.sun.castShadow = state.shadows;
  // Station departure whistle, chuffs and rail joints drive the synthesised sound.
  if (world.train) {
    world.train.events.chuff = (k) => audio.chuff(k);
    world.train.events.clack = () => audio.clack();
    world.train.events.whistle = () => audio.whistle();
  }
}

async function switchWorld(id) {
  if (state.switchingTo || id === state.world) return;
  const cfg = worldById(id);
  state.switchingTo = cfg.id; // the world picker shows it pending and waits
  tour.stop();
  hostCard.hide();
  hud.sync();
  loader.show(cfg);
  // Free the old world first: two worlds in memory at once is a lot for a phone.
  world?.dispose();
  world = null;
  state.world = null; // gone: if the build fails, any world (even this one) can be tried again
  try {
    show(await buildWorld(cfg));
    state.world = cfg.id;
    loader.hide();
    hud.toast(`Thế giới: ${cfg.name}`);
  } catch (err) {
    loader.error(err);
  } finally {
    state.switchingTo = null;
    hud.sync();
  }
}

async function boot() {
  const cfg = worldById(state.world);
  loader.show(cfg);
  resize();
  let first;
  try {
    first = await buildWorld(cfg);
    await renderer.compileAsync(post.quadScene, post.quadCam); // pixel-art / outline pass
  } catch (err) {
    loader.error(err);
    return;
  }
  show(first);

  hud = initHud(state, actions, SHOWN);
  hud.setWorld(world);
  addEventListener('keydown', onKey);
  addEventListener('resize', resize);
  addEventListener('pointerdown', () => audio.init(), { once: true });

  requestAnimationFrame(frame);
  loader.hide();
  // A visitor who just arrives (no ?world=, no ?notour) is given the narrated tour of the landmark.
  const params = new URLSearchParams(location.search);
  if (!params.has('world') && !params.has('notour')) actions.toggleTour(true);
}

boot();
