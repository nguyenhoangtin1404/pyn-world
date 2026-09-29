import * as THREE from 'three';
import './style.css';
import { TIME_PRESETS, presetAtHour } from './world/sky.js';
import { PostFX } from './render/post.js';
import { CameraRig, CAMERA_MODES } from './cameras.js';
import { AudioEngine } from './audio.js';
import { initHud, PIXEL_LEVELS } from './hud.js';
import { nextFrame } from './utils.js';
import { World } from './World.js';
import { WORLDS, worldById } from './worlds/index.js';

// The app: renderer, camera, sound, UI and the frame loop. What is on screen is `world` — one
// World (src/World.js) built from a WorldConfig (src/worlds/); N switches to the next one.

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
const post = new PostFX(renderer);
const rig = new CameraRig(camera, renderer.domElement);
let world = null; // the World on screen (null while the next one is being built)
if (import.meta.env.DEV) window.__pyn = { get W() { return world; }, renderer, post, rig, camera, state };

const HINTS = [
  'Kéo chuột để xoay quanh thung lũng, lăn chuột để zoom.',
  'Bấm 1–7 để đổi góc máy quay — 6 đi theo một người, 7 đi theo một con chim.',
  'Ngày đêm tự trôi; bấm C để dừng/chạy đồng hồ, T để nhảy giờ.',
  'Tàu dừng ở từng ga để khách lên xuống.',
  'Bấm F để tìm đôi cừu đang yêu nhau.',
  'Bấm K để bay lên đỉnh núi, nơi dân leo núi vẫy tay chào.',
  'Bấm N để sang thế giới khác.',
];

// Drop the pixel ratio a step when frames run slow for a couple of seconds, and give it back once
// they are comfortably fast again (not too eagerly, or it would flip back and forth).
const adapt = { t: 0, n: 0, sum: 0, calm: 0 };
function adaptResolution(raw) {
  if (raw > 0.25) return; // a stall (tab switch, loading), not the steady frame rate
  adapt.t += raw;
  adapt.n++;
  adapt.sum += raw;
  if (adapt.t < 2) return;
  const avg = adapt.sum / adapt.n;
  const dpr = renderer.getPixelRatio();
  let next = dpr;
  if (avg > 1 / 40) {
    adapt.calm = 0;
    if (dpr > 1) next = Math.max(1, dpr - 0.25);
  } else if (avg < 1 / 55) {
    if (dpr < MAX_DPR && ++adapt.calm >= 5) next = Math.min(MAX_DPR, dpr + 0.25); // ~10 s of smooth frames
  } else adapt.calm = 0;
  if (next !== dpr) {
    adapt.calm = 0;
    renderer.setPixelRatio(next);
    resize();
  }
  Object.assign(adapt, { t: 0, n: 0, sum: 0 });
}

function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  post.setSize(w, h, renderer.getPixelRatio());
}

let hud;
const actions = {
  setWorld(id) {
    switchWorld(id);
  },
  setMode(id) {
    state.mode = id;
    rig.setMode(id);
    hud.sync();
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
    hud.sync();
  },
  setVolume(v) {
    audio.init();
    state.volume = v;
    audio.setVolume(v);
    hud.sync();
  },
};

// Keys that fly the camera to a spot in the world (world.spots).
const SPOT_KEYS = {
  KeyF: { id: 'courting', toast: 'Bay tới đôi cừu đang yêu 💕' },
  KeyG: { id: 'bridgeSheep', toast: 'Bay tới chú cừu ngắm sông' },
  KeyK: { id: 'summit', toast: 'Bay lên đỉnh núi ⛰' },
  KeyJ: { id: 'fisherman', toast: 'Bay tới ông câu cá 🎣' },
  KeyL: { id: 'steamer', toast: 'Bay tới tàu hơi nước ⛴' },
};

function onKey(e) {
  if (e.target.closest?.('input, select, textarea')) return;
  if (e.repeat) return;
  if (e.code === 'KeyN') {
    const i = WORLDS.findIndex((w) => w.id === state.world);
    switchWorld(WORLDS[(i + 1) % WORLDS.length].id);
    return;
  }
  if (!world) return; // the next world is still being built
  audio.init();
  const digit = /^Digit([1-7])$/.exec(e.code);
  if (digit) {
    const m = CAMERA_MODES[+digit[1] - 1];
    actions.setMode(m.id);
    hud.toast(rig.followLabel ? `Đang theo: ${rig.followLabel}` : `Camera: ${m.label}`);
    return;
  }
  const spot = SPOT_KEYS[e.code];
  if (spot) {
    // Features put these spots in the world; a world without sheep has no sheep to fly to.
    const p = world.spots[spot.id];
    if (!p) return hud.toast('Thế giới này không có chỗ đó');
    rig.flyToSpot(p);
    state.mode = 'overview';
    hud.sync();
    hud.toast(spot.toast);
    return;
  }
  switch (e.code) {
    case 'KeyB':
      rig.nextBridge();
      state.mode = 'bridge';
      hud.sync();
      hud.toast(`Cầu số ${rig.bridgeIndex + 1}`);
      break;
    case 'KeyP': {
      const i = PIXEL_LEVELS.findIndex((l) => l.v === state.pixel);
      const next = PIXEL_LEVELS[(i + 1) % PIXEL_LEVELS.length];
      actions.setPixel(next.v);
      hud.toast(`Pixel art: ${next.label}`);
      break;
    }
    case 'KeyO':
      actions.setOutline(!state.outline);
      hud.toast(state.outline ? 'Viền mực: bật' : 'Viền mực: tắt');
      break;
    case 'KeyT': {
      const i = TIME_PRESETS.findIndex((p) => p.id === state.timeOfDay);
      const n = TIME_PRESETS.length;
      const next = TIME_PRESETS[(i + (e.shiftKey ? n - 1 : 1)) % n];
      actions.setTime(next.id);
      hud.toast(`${next.icon} ${next.label}`);
      break;
    }
    case 'KeyC':
      actions.toggleAutoDay();
      hud.toast(state.autoDay ? 'Ngày đêm tự động: bật' : 'Ngày đêm tự động: tắt');
      break;
    case 'Space':
      e.preventDefault();
      state.paused = !state.paused;
      hud.sync();
      hud.toast(state.paused ? 'Tạm dừng' : 'Tiếp tục');
      break;
    case 'KeyX':
      actions.setTimeScale(state.timeScale > 0 ? 0 : 1);
      hud.toast(`Thời gian ${state.timeScale}×`);
      break;
    case 'KeyH':
      hud.toggleHud();
      break;
    case 'KeyM':
      actions.toggleMute();
      hud.toast(state.muted ? 'Tắt tiếng' : 'Bật tiếng');
      break;
  }
}

const clock = new THREE.Clock();

// Dev only: open with ?stats to see draw calls (incl. the shadow pass), triangles and frame times —
// check these before and after any rendering change (see CLAUDE.md).
const stats = import.meta.env.DEV && new URLSearchParams(location.search).has('stats') ? { el: document.createElement('pre'), n: 0, cpu: 0, t0: performance.now() } : null;
if (stats) {
  stats.el.style.cssText = 'position:fixed;left:8px;bottom:8px;z-index:99;margin:0;padding:6px 8px;font:12px/1.4 monospace;color:#fff;background:#0009;border-radius:6px;pointer-events:none';
  document.body.appendChild(stats.el);
  renderer.info.autoReset = false;
}

function frame() {
  requestAnimationFrame(frame);
  const delta = clock.getDelta();
  if (!world) return; // the next world is being built behind the loading screen
  const frameStart = performance.now();
  if (stats) renderer.info.reset();
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
  rig.update(raw);
  world.lateUpdate({ raw, camera, focus: rig.focus });

  audio.update(raw, {
    trainDistance: camera.position.distanceTo(world.train.locoPos),
    rain: world.weather.rain,
    day: world.sky.lights < 0.3,
    paused: dt === 0,
  });

  post.render(world.scene, camera);

  if (stats) {
    stats.n++;
    stats.cpu += performance.now() - frameStart;
    const now = performance.now();
    if (now - stats.t0 > 500) {
      const { calls, triangles } = renderer.info.render;
      const ms = (now - stats.t0) / stats.n;
      stats.el.textContent = `${(1000 / ms).toFixed(0)} fps · ${ms.toFixed(1)} ms/frame · CPU ${(stats.cpu / stats.n).toFixed(1)} ms\n${calls} draw calls · ${(triangles / 1000).toFixed(0)}k tris · ${renderer.info.programs.length} shaders`;
      Object.assign(stats, { n: 0, cpu: 0, t0: now });
    }
  }
}

// Loading screen: shown at start and while switching worlds.
const loader = (() => {
  const el = document.getElementById('loading');
  const logo = el.querySelector('.load-logo');
  const phase = document.getElementById('load-phase');
  const percent = document.getElementById('load-percent');
  const fill = el.querySelector('.load-fill');
  const bar = el.querySelector('[role="progressbar"]');
  const hint = document.getElementById('load-hint');
  let hintTimer = 0, hideTimer = 0;
  const progress = (pct) => {
    fill.style.width = `${pct}%`;
    percent.textContent = `${pct}%`;
    bar.setAttribute('aria-valuenow', String(pct));
  };
  return {
    show(title) {
      clearTimeout(hideTimer);
      logo.textContent = `🚂 ${title}`;
      progress(0);
      el.hidden = false;
      el.classList.remove('done');
      el.setAttribute('aria-busy', 'true');
      let h = 0;
      hint.textContent = HINTS[0];
      clearInterval(hintTimer);
      hintTimer = setInterval(() => (hint.textContent = HINTS[++h % HINTS.length]), 2600);
    },
    phase: (text) => (phase.textContent = text),
    progress,
    error(err) {
      clearInterval(hintTimer);
      phase.textContent = `Lỗi: ${err.message}`;
      console.error(err);
    },
    hide() {
      clearInterval(hintTimer);
      el.classList.add('done');
      el.setAttribute('aria-busy', 'false');
      hideTimer = setTimeout(() => (el.hidden = true), 700);
    },
  };
})();

// Build a world step by step behind the loading screen, compile its shaders, and return it.
async function buildWorld(cfg) {
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
  world.sky.setHour(state.hour, true);
  world.weather.set(state.weather);
  world.sky.sun.castShadow = state.shadows;
  // Station departure whistle, chuffs and rail joints drive the synthesised sound.
  world.train.events.chuff = (k) => audio.chuff(k);
  world.train.events.clack = () => audio.clack();
  world.train.events.whistle = () => audio.whistle();
}

async function switchWorld(id) {
  if (state.switchingTo || id === state.world) return;
  const cfg = worldById(id);
  state.switchingTo = cfg.id; // the world picker shows it pending and waits
  hud.sync();
  loader.show(cfg.name);
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
  loader.show(cfg.name);
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

  hud = initHud(state, actions, WORLDS);
  addEventListener('keydown', onKey);
  addEventListener('resize', resize);
  addEventListener('pointerdown', () => audio.init(), { once: true });

  requestAnimationFrame(frame);
  loader.hide();
}

boot();
