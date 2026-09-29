import * as THREE from 'three';
import './style.css';
import { Track, createTrackCurve, buildTrackMeshes } from './world/track.js';
import { createTerrain } from './world/terrain.js';
import { buildScenery } from './world/scenery.js';
import { Train } from './world/train.js';
import { createLife } from './world/life.js';
import { createTunnel } from './world/tunnel.js';
import { Sky, TIME_PRESETS, presetAtHour } from './world/sky.js';
import { Weather } from './world/weather.js';
import { PostFX } from './render/post.js';
import { CameraRig, CAMERA_MODES } from './cameras.js';
import { AudioEngine } from './audio.js';
import { initHud, PIXEL_LEVELS } from './hud.js';
import { nextFrame } from './utils.js';
import { HALT_AT } from './config.js';

const state = {
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
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
// three.js r186 dropped PCFSoftShadowMap and falls back to PCFShadowMap at the first shadow render,
// which made every shader compiled before that (the whole precompile) compile a second time.
renderer.shadowMap.type = THREE.PCFShadowMap;
document.getElementById('scene').appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 2000);
const audio = new AudioEngine();
const W = {};
if (import.meta.env.DEV) window.__pyn = { W, camera, state };

const steps = [
  ['Đang trải đường ray', () => {
    W.track = new Track(createTrackCurve());
    W.station = W.track.frames[0];
    W.halt = W.track.frame(Math.round(W.track.frames.length * HALT_AT));
  }],
  ['Đang nặn địa hình', () => {
    W.terrain = createTerrain(W.track, W.station, W.halt);
    scene.add(W.terrain.mesh, W.terrain.water, W.terrain.frame);
  }],
  ['Đang đào đường hầm', () => {
    W.tunnel = createTunnel(W.track, W.terrain.heightAt);
    scene.add(W.tunnel.group);
  }],
  ['Đang dựng cầu và tà vẹt', () => {
    W.rails = buildTrackMeshes(W.track, W.terrain.heightAt);
    scene.add(W.rails.group);
  }],
  ['Đang trồng cây, thả cừu', () => {
    W.scenery = buildScenery({ track: W.track, terrain: W.terrain, bridges: W.rails.bridges, station: W.station, halt: W.halt, tunnel: W.tunnel });
    scene.add(W.scenery.group);
  }],
  ['Đang lắp đầu máy', () => {
    W.train = new Train(W.track);
    W.train.tunnel = W.tunnel;
    W.train.setStops(W.scenery.stations.map((st) => ({ s: st.frame.s + 14, out: st.out })));
    scene.add(W.train.group);
  }],
  ['Đang thả cá, bơm khinh khí cầu', () => {
    W.life = createLife({ terrain: W.terrain, track: W.track, scenery: W.scenery, train: W.train });
    scene.add(W.life.group);
  }],
  ['Đang pha màu bầu trời', () => {
    W.sky = new Sky(scene);
    W.weather = new Weather(scene);
  }],
  ['Đang khởi động máy quay', () => {
    W.post = new PostFX(renderer);
    W.rig = new CameraRig(camera, renderer.domElement, {
      train: W.train,
      bridges: W.rails.bridges,
      // Keep the camera above the ground and out of the tunnel hill.
      heightAt: (x, z) => Math.max(W.terrain.heightAt(x, z), W.tunnel.surfaceAt(x, z)),
      followables: W.life.followables,
      occludes: W.scenery.occludes,
    });
    W.sky.setHour(state.hour, true);
    resize();
  }],
];

const HINTS = [
  'Kéo chuột để xoay quanh thung lũng, lăn chuột để zoom.',
  'Bấm 1–7 để đổi góc máy quay — 6 đi theo một người, 7 đi theo một con chim.',
  'Ngày đêm tự trôi; bấm C để dừng/chạy đồng hồ, T để nhảy giờ.',
  'Tàu dừng ở ga PYN WORLD để khách lên xuống.',
  'Bấm F để tìm đôi cừu đang yêu nhau.',
  'Bấm K để bay lên đỉnh núi, nơi dân leo núi vẫy tay chào.',
];

function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  W.post?.setSize(w, h, renderer.getPixelRatio());
}

let hud;
const actions = {
  setMode(id) {
    state.mode = id;
    W.rig.setMode(id);
    hud.sync();
  },
  // Jump the clock to a preset's hour (the automatic cycle keeps running from there).
  setTime(id) {
    state.hour = TIME_PRESETS.find((p) => p.id === id).hour;
    state.timeOfDay = id;
    W.sky.setHour(state.hour);
    hud.sync();
  },
  toggleAutoDay() {
    state.autoDay = !state.autoDay;
    hud.sync();
  },
  setWeather(id) {
    state.weather = id;
    W.weather.set(id);
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
    W.post.setPixel(v);
    hud.sync();
  },
  setOutline(on) {
    state.outline = on;
    W.post.setOutline(on);
    hud.sync();
  },
  setShadows(on) {
    state.shadows = on;
    W.sky.sun.castShadow = on;
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

function onKey(e) {
  if (e.target.closest?.('input, select, textarea')) return;
  if (e.repeat) return;
  audio.init();
  const digit = /^Digit([1-7])$/.exec(e.code);
  if (digit) {
    const m = CAMERA_MODES[+digit[1] - 1];
    actions.setMode(m.id);
    hud.toast(W.rig.followLabel ? `Đang theo: ${W.rig.followLabel}` : `Camera: ${m.label}`);
    return;
  }
  switch (e.code) {
    case 'KeyB':
      W.rig.nextBridge();
      state.mode = 'bridge';
      hud.sync();
      hud.toast(`Cầu số ${W.rig.bridgeIndex + 1}`);
      break;
    case 'KeyF':
      W.rig.flyToSpot(W.scenery.spots.courting);
      state.mode = 'overview';
      hud.sync();
      hud.toast('Bay tới đôi cừu đang yêu 💕');
      break;
    case 'KeyG':
      W.rig.flyToSpot(W.scenery.spots.bridgeSheep);
      state.mode = 'overview';
      hud.sync();
      hud.toast('Bay tới chú cừu ngắm sông');
      break;
    case 'KeyK':
      W.rig.flyToSpot(W.life.spots.summit);
      state.mode = 'overview';
      hud.sync();
      hud.toast('Bay lên đỉnh núi ⛰');
      break;
    case 'KeyJ':
      W.rig.flyToSpot(W.life.spots.fisherman);
      state.mode = 'overview';
      hud.sync();
      hud.toast('Bay tới ông câu cá 🎣');
      break;
    case 'KeyL':
      W.rig.flyToSpot(W.life.spots.steamer);
      state.mode = 'overview';
      hud.sync();
      hud.toast('Bay tới tàu hơi nước ⛴');
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
let simTime = 0;
let lastSnow = 0;

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
  const frameStart = performance.now();
  if (stats) renderer.info.reset();
  const raw = Math.min(clock.getDelta(), 0.1);
  const dt = state.paused ? 0 : raw * state.timeScale;
  simTime += dt;
  if (state.autoDay && dt > 0) {
    // One in-game hour every 10 s at 1× → a full day in 4 minutes.
    state.hour = (state.hour + dt / 10) % 24;
    W.sky.setHour(state.hour);
    const preset = presetAtHour(state.hour);
    if (preset !== state.timeOfDay) {
      state.timeOfDay = preset;
      hud.sync();
    }
  }
  hud.setClock(state.hour, state.autoDay);

  W.train.update(dt, state.speed);
  W.scenery.update(dt, simTime);
  W.life.update(dt, simTime, { rain: W.weather.rain });
  W.terrain.update(simTime);
  W.weather.update(dt, raw, camera);
  if (Math.abs(W.weather.snowCover - lastSnow) > 0.01 || (W.weather.snowCover === 0 && lastSnow !== 0)) {
    lastSnow = W.weather.snowCover;
    W.terrain.setSnow(lastSnow);
    W.tunnel.setSnow(lastSnow);
  }

  W.rig.update(raw);
  W.sky.update(raw, camera, W.rig.focus, W.weather);
  W.train.setLights(W.sky.lights);
  W.scenery.setLights(W.sky.lights);
  W.life.setLights(W.sky.lights);
  W.scenery.setOvercast(W.weather.overcast);

  audio.update(raw, {
    trainDistance: camera.position.distanceTo(W.train.locoPos),
    rain: W.weather.rain,
    day: W.sky.lights < 0.3,
    paused: dt === 0,
  });

  W.post.render(scene, camera);

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

// Compile every shader while the loading screen is up — including those of things hidden at start
// (rain, snow, cabins, balloon flames…), which would otherwise compile, and stall a frame, the
// first time they appear. compileAsync lets the driver compile in parallel where it can.
async function precompile() {
  const hidden = [];
  scene.traverse((o) => {
    if (!o.visible) {
      hidden.push(o);
      o.visible = true;
    }
  });
  try {
    await renderer.compileAsync(scene, camera);
    await renderer.compileAsync(W.post.quadScene, W.post.quadCam); // pixel-art / outline pass
    // Some drivers only really compile on first draw: draw one frame now, behind the loading screen.
    renderer.render(scene, camera);
  } finally {
    hidden.forEach((o) => (o.visible = false));
  }
}

async function boot() {
  const loading = document.getElementById('loading');
  const phase = document.getElementById('load-phase');
  const percent = document.getElementById('load-percent');
  const fill = loading.querySelector('.load-fill');
  const bar = loading.querySelector('[role="progressbar"]');
  const hint = document.getElementById('load-hint');
  let h = 0;
  hint.textContent = HINTS[0];
  const hintTimer = setInterval(() => (hint.textContent = HINTS[++h % HINTS.length]), 2600);

  try {
    for (let i = 0; i < steps.length; i++) {
      phase.textContent = steps[i][0];
      await nextFrame();
      await nextFrame();
      steps[i][1]();
      const pct = Math.round(((i + 1) / steps.length) * 100);
      fill.style.width = `${pct}%`;
      percent.textContent = `${pct}%`;
      bar.setAttribute('aria-valuenow', String(pct));
    }
    phase.textContent = 'Đang chuẩn bị shader';
    await precompile();
  } catch (err) {
    clearInterval(hintTimer);
    phase.textContent = `Lỗi: ${err.message}`;
    console.error(err);
    return;
  }

  // Station departure whistle, chuffs and rail joints drive the synthesised sound.
  W.train.events.chuff = (k) => audio.chuff(k);
  W.train.events.clack = () => audio.clack();
  W.train.events.whistle = () => audio.whistle();

  hud = initHud(state, actions);
  addEventListener('keydown', onKey);
  addEventListener('resize', resize);
  addEventListener('pointerdown', () => audio.init(), { once: true });

  requestAnimationFrame(frame);
  clearInterval(hintTimer);
  loading.classList.add('done');
  loading.setAttribute('aria-busy', 'false');
  setTimeout(() => (loading.hidden = true), 700);
}

boot();
