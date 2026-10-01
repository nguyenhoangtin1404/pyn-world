import { CAMERA_MODES } from './cameras.js';
import { TIME_PRESETS } from './world/sky.js';
import { WEATHER_OPTIONS } from './world/weather.js';

export const PIXEL_LEVELS = [
  { v: 1, label: 'Tắt' },
  { v: 2, label: 'Mịn' },
  { v: 3, label: 'Vừa' },
  { v: 4, label: 'Thô' },
  { v: 6, label: 'Rất thô' },
];

const $ = (id) => document.getElementById(id);

function chip(html, onClick) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'chip';
  b.innerHTML = html;
  b.addEventListener('click', () => {
    onClick();
    b.blur();
  });
  return b;
}

// `worlds`: the WorldConfigs the app can show (one chip each, top left).
export function initHud(state, actions, worlds) {
  const worldBtns = worlds.map((w) => {
    const b = chip(w.name, () => actions.setWorld(w.id));
    b.title = `${w.name} (phím N: thế giới kế tiếp)`;
    $('world-picker').append(b);
    return [w.id, b];
  });

  const camBtns = CAMERA_MODES.map((m) => {
    const b = chip(`<kbd>${m.key}</kbd>${m.label}`, () => actions.setMode(m.id));
    $('camera-modes').append(b);
    return [m.id, b];
  });
  // The famous building: fly to it (V; again for the next one).
  const landmarkBtn = chip('<kbd>V</kbd>Tháp', () => actions.flyToLandmark());
  $('camera-modes').append(landmarkBtn);
  const clockEl = document.createElement('span');
  clockEl.className = 'clock';
  clockEl.setAttribute('aria-label', 'Giờ trong ngày');
  $('time-of-day').append(clockEl);
  const timeBtns = TIME_PRESETS.map((p) => {
    const b = chip(`<span aria-hidden="true">${p.icon}</span>${p.label}`, () => actions.setTime(p.id));
    $('time-of-day').append(b);
    return [p.id, b];
  });
  const autoBtn = chip('<kbd>C</kbd>⟳ Tự động', () => actions.toggleAutoDay());
  autoBtn.title = 'Ngày đêm tự trôi (1 ngày = 4 phút)';
  $('time-of-day').append(autoBtn);

  const weather = $('weather');
  weather.innerHTML = WEATHER_OPTIONS.map((o) => `<option value="${o.id}">${o.label}</option>`).join('');
  weather.addEventListener('change', () => actions.setWeather(weather.value));

  $('sound-toggle').addEventListener('click', (e) => {
    actions.toggleMute();
    e.currentTarget.blur();
  });
  const volume = $('volume');
  volume.addEventListener('input', () => actions.setVolume(+volume.value));

  const speed = $('speed');
  speed.addEventListener('input', () => actions.setSpeed(+speed.value));
  speed.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    actions.setSpeed(1);
  });
  const timeScale = $('time-scale');
  timeScale.addEventListener('input', () => actions.setTimeScale(+timeScale.value));
  timeScale.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    actions.setTimeScale(1);
  });

  const pixel = $('pixel');
  pixel.innerHTML = PIXEL_LEVELS.map((l) => `<option value="${l.v}">${l.label}</option>`).join('');
  pixel.addEventListener('change', () => actions.setPixel(+pixel.value));

  const outlineBtn = chip('✎ Viền mực', () => actions.setOutline(!state.outline));
  const shadowBtn = chip('◐ Bóng đổ', () => actions.setShadows(!state.shadows));
  $('toggles').append(outlineBtn, shadowBtn);

  const helpBtn = $('help-btn');
  const help = $('help');
  const setHelp = (open) => {
    help.hidden = !open;
    helpBtn.setAttribute('aria-expanded', String(open));
  };
  helpBtn.addEventListener('click', () => setHelp(help.hidden));
  $('hide-help').addEventListener('click', () => setHelp(false));

  const panelToggle = $('panel-toggle');
  panelToggle.addEventListener('click', () => {
    const collapsed = $('panel').classList.toggle('collapsed');
    panelToggle.setAttribute('aria-expanded', String(!collapsed));
    $('panel-toggle-label').textContent = collapsed ? 'Mở bảng điều khiển' : 'Thu gọn';
    panelToggle.blur();
  });

  function sync() {
    for (const [id, b] of worldBtns) {
      const on = id === state.world && !state.switchingTo;
      b.classList.toggle('active', on);
      b.setAttribute('aria-pressed', String(on));
      b.classList.toggle('pending', id === state.switchingTo);
      b.disabled = !!state.switchingTo; // one world at a time
    }
    camBtns.forEach(([id, b]) => b.classList.toggle('active', id === state.mode));
    timeBtns.forEach(([id, b]) => b.classList.toggle('active', id === state.timeOfDay));
    autoBtn.classList.toggle('active', state.autoDay);
    weather.value = state.weather;
    volume.value = state.volume;
    $('volume-value').textContent = `${Math.round(state.volume * 100)}%`;
    const snd = $('sound-toggle');
    snd.textContent = state.muted ? '🔇' : '♪';
    snd.setAttribute('aria-pressed', String(state.muted));
    speed.value = state.speed;
    $('speed-value').textContent = `${state.speed.toFixed(2)}×`;
    timeScale.value = state.timeScale;
    $('time-scale-value').textContent = state.paused ? 'Dừng' : `${state.timeScale.toFixed(2)}×`;
    pixel.value = state.pixel;
    outlineBtn.classList.toggle('active', state.outline);
    shadowBtn.classList.toggle('active', state.shadows);
  }

  let toastTimer;
  function toast(msg) {
    const el = $('toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 1400);
  }

  function toggleHud() {
    $('app').classList.toggle('hud-hidden');
  }

  // Called every frame; only touches the DOM when the displayed minute changes.
  let shownMinute = -1;
  function setClock(hour) {
    const minute = Math.floor(hour * 60) % 1440;
    if (minute === shownMinute) return;
    shownMinute = minute;
    clockEl.textContent = `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;
  }

  sync();
  // Only the controls this world has a use for: no train cameras or train speed without a train,
  // no bridge camera without a bridge, no following what isn't there.
  function setWorld(world) {
    const has = {
      train: !!world.train, passenger: !!world.train, driver: !!world.train,
      bridge: world.bridges.length > 0,
      person: world.followables.people.length > 0, bird: world.followables.birds.length > 0, vehicle: world.followables.vehicles.length > 0,
      tourist: world.followables.tourists.length > 0, balloon: world.followables.balloons.length > 0,
    };
    for (const [id, b] of camBtns) b.hidden = has[id] === false;
    landmarkBtn.hidden = world.landmarks.length === 0;
    speed.closest('label').hidden = !world.train;
  }

  return { sync, toast, toggleHud, setClock, setWorld };
}
