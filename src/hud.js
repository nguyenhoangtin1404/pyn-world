import { CAMERA_MODES } from './cameras.js';
import { TIME_PRESETS } from './world/sky.js';
import { WEATHER_OPTIONS } from './world/weather.js';
import { lang, onLangChange, setLang, t } from './app/i18n.js';

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
  // (Every label in the language on screen — app/i18n.js; labels() sets them again when it changes.)
  const worldBtns = worlds.map((w) => {
    const b = chip(w.name, () => actions.setWorld(w.id));
    $('world-picker').append(b);
    return [w.id, b];
  });
  $('world-picker').hidden = worlds.length < 2; // (one world: nothing to pick)

  // What most people want up front: the whole view, the tower and its tour. The cameras that follow something
  // (and the train's) wait under "Nâng cao"; not 9 (tourists) and 0 (balloons) — 6 follows tourists too, 7 the
  // balloons (their keys still work). Keys are in the tooltips, not on the chips.
  const keyed = (/** @type {HTMLElement} */ b, /** @type {string} */ key, /** @type {string} */ what) => (b.title = t('hud.keyed', { what, key }));
  const camModes = CAMERA_MODES.filter((m) => m.id !== 'tourist' && m.id !== 'balloon');
  const camBtns = camModes.map((m) => {
    const b = chip('', () => actions.setMode(m.id));
    $(m.id === 'overview' ? 'camera-modes' : 'follow-modes').append(b);
    return [m.id, b];
  });
  // The famous building: fly to it (V; again for the next one).
  const landmarkBtn = chip('', () => actions.flyToLandmark());
  $('camera-modes').append(landmarkBtn);
  // Its narrated tour (I; again, or Esc, to stop).
  const tourBtn = chip('', () => actions.toggleTour());
  $('camera-modes').append(tourBtn);
  // About the tower (index.html #about — the same words search engines read), with the credits.
  const about = /** @type {HTMLDialogElement} */ ($('about'));
  const aboutBtn = document.createElement('button');
  aboutBtn.type = 'button';
  aboutBtn.className = 'chip';
  aboutBtn.id = 'about-btn';
  aboutBtn.setAttribute('aria-haspopup', 'dialog');
  aboutBtn.addEventListener('click', () => about.showModal()); // (modal: focus inside, Esc closes, focus back here)
  $('about-close').addEventListener('click', () => about.close());
  about.addEventListener('click', (e) => {
    if (e.target === about) about.close(); // a tap on the backdrop, outside the card
  });
  $('camera-modes').append(aboutBtn);
  // English ⇄ Vietnamese (remembered; app/i18n.js).
  const langBtn = chip('', () => {
    setLang(lang() === 'vi' ? 'en' : 'vi', import.meta.env?.BASE_URL ?? '/');
    toast(t('toast.lang'));
  });
  langBtn.id = 'lang-btn';
  $('camera-modes').append(langBtn);
  const clockEl = document.createElement('span');
  clockEl.className = 'clock';
  $('time-of-day').append(clockEl);
  const timeBtns = TIME_PRESETS.map((p) => {
    const b = chip('', () => actions.setTime(p.id));
    $('time-of-day').append(b);
    return [p.id, b];
  });
  const realBtn = chip('', () => actions.setClock('real'));
  const fastBtn = chip('', () => actions.setClock('fast'));
  $('time-of-day').append(realBtn);

  // The weather as buttons, one tap each (the one on is pressed).
  const weatherBtns = WEATHER_OPTIONS.map((o) => {
    const b = chip('', () => actions.setWeather(o.id));
    $('weather').append(b);
    return [o.id, b];
  });

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
  pixel.innerHTML = PIXEL_LEVELS.map((l) => `<option value="${l.v}"></option>`).join('');
  pixel.addEventListener('change', () => actions.setPixel(+pixel.value));

  const outlineBtn = chip('', () => actions.setOutline(!state.outline));
  const shadowBtn = chip('', () => actions.setShadows(!state.shadows));
  $('toggles').append(fastBtn, outlineBtn, shadowBtn); // (under "Nâng cao")

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
    $('panel-toggle-label').textContent = t(collapsed ? 'panel.open' : 'panel.close');
    panelToggle.blur();
  });

  // Every label made here, in the language on screen (index.html's own text is app/i18n.js applyStatic's).
  function labels() {
    for (const [i, [, b]] of worldBtns.entries()) b.title = t('hud.worldTitle', { name: worlds[i].name });
    for (const [i, [id, b]] of camBtns.entries()) {
      b.textContent = id === 'overview' ? t('hud.overview') : t(`cam.${id}`);
      keyed(b, camModes[i].key, t(`cam.${id}`));
    }
    landmarkBtn.textContent = t('hud.tower');
    keyed(landmarkBtn, 'V', t('hud.towerTitle'));
    tourBtn.textContent = t('hud.tour');
    keyed(tourBtn, 'I', t('hud.tourTitle'));
    aboutBtn.textContent = t('hud.about');
    langBtn.textContent = t('hud.lang');
    langBtn.title = t('hud.langTitle');
    langBtn.lang = lang() === 'vi' ? 'en' : 'vi'; // (what it offers is in the other language)
    clockEl.setAttribute('aria-label', t('aria.time'));
    for (const [i, [id, b]] of timeBtns.entries()) b.innerHTML = `<span aria-hidden="true">${TIME_PRESETS[i].icon}</span>${t(`time.${id}`)}`;
    realBtn.textContent = t('hud.realTime');
    realBtn.title = t('hud.realTimeTitle');
    fastBtn.textContent = t('hud.fast');
    fastBtn.title = t('hud.fastTitle');
    for (const [id, b] of weatherBtns) b.textContent = t(`weather.${id}`);
    for (const o of pixel.querySelectorAll('option')) o.textContent = t(`pixel.${o.value}`);
    outlineBtn.textContent = t('hud.outline');
    shadowBtn.textContent = t('hud.shadows');
    $('panel-toggle-label').textContent = t($('panel').classList.contains('collapsed') ? 'panel.open' : 'panel.close');
  }
  labels();
  onLangChange(() => {
    labels();
    sync();
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
    realBtn.classList.toggle('active', state.clock === 'real');
    fastBtn.classList.toggle('active', state.clock === 'fast');
    // (Real time: the buttons of the times of day are not "on" — the time is what it is.)
    if (state.clock === 'real') timeBtns.forEach(([, b]) => b.classList.remove('active'));
    for (const [id, b] of weatherBtns) {
      b.classList.toggle('active', id === state.weather);
      b.setAttribute('aria-pressed', String(id === state.weather));
    }
    volume.value = state.volume;
    $('volume-value').textContent = `${Math.round(state.volume * 100)}%`;
    const snd = $('sound-toggle');
    snd.textContent = state.muted ? '🔇' : '♪';
    snd.setAttribute('aria-pressed', String(state.muted));
    speed.value = state.speed;
    $('speed-value').textContent = `${state.speed.toFixed(2)}×`;
    timeScale.value = state.timeScale;
    $('time-scale-value').textContent = state.paused ? t('hud.paused') : `${state.timeScale.toFixed(2)}×`;
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
    for (const [id, b] of weatherBtns) if (id === 'snow') b.hidden = world.cfg.snow === false; // (no snow in the tropics)
    tourBtn.hidden = !world.landmarks.some((l) => l.tour?.length);
    speed.closest('label').hidden = !world.train;
    // The shortcuts list too: only the keys that do something here.
    const can = { ...has, landmark: world.landmarks.length > 0, tour: !tourBtn.hidden, worlds: worlds.length > 1 };
    for (const row of document.querySelectorAll('#help [data-needs]')) {
      const need = /** @type {HTMLElement} */ (row).dataset.needs ?? '';
      /** @type {HTMLElement} */ (row).hidden = need.startsWith('spot:') ? !world.spots[need.slice(5)] : can[need] === false;
    }
  }

  return { sync, toast, toggleHud, setClock, setWorld };
}
