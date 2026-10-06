import { CAMERA_MODES } from '../cameras.js';
import { TIME_PRESETS } from '../world/sky.js';
import { PIXEL_LEVELS } from '../hud.js';
import { t, tr } from './i18n.js';

// Keys that fly the camera to a spot in the world (world.spots).
export const SPOT_KEYS = {
  KeyF: { id: 'courting', toast: 'toast.courting' },
  KeyG: { id: 'bridgeSheep', toast: 'toast.bridgeSheep' },
  KeyK: { id: 'summit', toast: 'toast.summit' },
  KeyJ: { id: 'fisherman', toast: 'toast.fisherman' },
  KeyL: { id: 'steamer', toast: 'toast.steamer' },
};

// The keyboard shortcuts (the help panel in index.html lists them). `app` gives what they act on:
// { state, actions, rig, audio, hud(), world(), switchWorld(id), worlds }.
export function createKeyHandler(app) {
  const { state, actions, rig, audio, worlds } = app;
  return function onKey(e) {
    const hud = app.hud(), world = app.world();
    if (e.target.closest?.('input, select, textarea')) return;
    if (document.querySelector('dialog[open]')) return; // (the About dialog: its keys are its own — Esc closes it)
    if (e.repeat) return;
    if (e.code === 'KeyN') {
      const i = worlds.findIndex((w) => w.id === state.world);
      app.switchWorld(worlds[(i + 1) % worlds.length].id);
      return;
    }
    if (!world) return; // the next world is still being built
    audio.init();
    const digit = /^Digit([0-9])$/.exec(e.code);
    const mode = digit && CAMERA_MODES.find((m) => m.key === digit[1]);
    if (mode) {
      const m = mode;
      if (!actions.setMode(m.id)) return; // nothing to follow here (it said so)
      hud.toast(rig.followLabel ? t('toast.following', { label: tr(rig.followLabel) }) : t('toast.camera', { label: t(`cam.${m.id}`) }));
      return;
    }
    const spot = SPOT_KEYS[e.code];
    if (spot) {
      // Features put these spots in the world; a world without sheep has no sheep to fly to.
      actions.stopTour(true);
      const p = world.spots[spot.id];
      if (!p) return hud.toast(t('toast.noSpot'));
      rig.flyToSpot(p);
      state.mode = 'overview';
      hud.sync();
      hud.toast(t(spot.toast));
      return;
    }
    switch (e.code) {
      case 'KeyV':
        actions.flyToLandmark();
        break;
      case 'KeyI':
        actions.toggleTour();
        break;
      case 'Escape':
        actions.stopTour();
        break;
      case 'KeyB':
        actions.stopTour(true);
        rig.nextBridge();
        state.mode = 'bridge';
        hud.sync();
        hud.toast(t('toast.bridge', { n: rig.bridgeIndex + 1 }));
        break;
      case 'KeyP': {
        const i = PIXEL_LEVELS.findIndex((l) => l.v === state.pixel);
        const next = PIXEL_LEVELS[(i + 1) % PIXEL_LEVELS.length];
        actions.setPixel(next.v);
        hud.toast(t('toast.pixel', { label: t(`pixel.${next.v}`) }));
        break;
      }
      case 'KeyO':
        actions.setOutline(!state.outline);
        hud.toast(t(state.outline ? 'toast.outlineOn' : 'toast.outlineOff'));
        break;
      case 'KeyT': {
        const i = TIME_PRESETS.findIndex((p) => p.id === state.timeOfDay);
        const n = TIME_PRESETS.length;
        const next = TIME_PRESETS[(i + (e.shiftKey ? n - 1 : 1)) % n];
        actions.setTime(next.id);
        hud.toast(`${next.icon} ${t(`time.${next.id}`)}`);
        break;
      }
      case 'KeyC':
        actions.setClock(state.clock === 'fast' ? 'real' : 'fast');
        hud.toast(t(state.clock === 'fast' ? 'toast.fast' : 'toast.real'));
        break;
      case 'Space':
        e.preventDefault();
        state.paused = !state.paused;
        hud.sync();
        hud.toast(t(state.paused ? 'toast.paused' : 'toast.resumed'));
        break;
      case 'KeyX':
        actions.setTimeScale(state.timeScale > 0 ? 0 : 1);
        hud.toast(t('toast.timeScale', { n: state.timeScale }));
        break;
      case 'KeyH':
        hud.toggleHud();
        break;
      case 'KeyM':
        actions.toggleMute();
        hud.toast(t(state.muted ? 'toast.muted' : 'toast.unmuted'));
        break;
    }
  };
}
