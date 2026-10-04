import { CAMERA_MODES } from '../cameras.js';
import { TIME_PRESETS } from '../world/sky.js';
import { PIXEL_LEVELS } from '../hud.js';

// Keys that fly the camera to a spot in the world (world.spots).
export const SPOT_KEYS = {
  KeyF: { id: 'courting', toast: 'Bay tới đôi cừu đang yêu 💕' },
  KeyG: { id: 'bridgeSheep', toast: 'Bay tới chú cừu ngắm sông' },
  KeyK: { id: 'summit', toast: 'Bay lên đỉnh núi ⛰' },
  KeyJ: { id: 'fisherman', toast: 'Bay tới ông câu cá 🎣' },
  KeyL: { id: 'steamer', toast: 'Bay tới tàu hơi nước ⛴' },
};

// The keyboard shortcuts (the help panel in index.html lists them). `app` gives what they act on:
// { state, actions, rig, audio, hud(), world(), switchWorld(id), worlds }.
export function createKeyHandler(app) {
  const { state, actions, rig, audio, worlds } = app;
  return function onKey(e) {
    const hud = app.hud(), world = app.world();
    if (e.target.closest?.('input, select, textarea')) return;
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
      hud.toast(rig.followLabel ? `Đang theo: ${rig.followLabel}` : `Camera: ${m.label}`);
      return;
    }
    const spot = SPOT_KEYS[e.code];
    if (spot) {
      // Features put these spots in the world; a world without sheep has no sheep to fly to.
      actions.stopTour(true);
      const p = world.spots[spot.id];
      if (!p) return hud.toast('Thế giới này không có chỗ đó');
      rig.flyToSpot(p);
      state.mode = 'overview';
      hud.sync();
      hud.toast(spot.toast);
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
        actions.setClock(state.clock === 'fast' ? 'real' : 'fast');
        hud.toast(state.clock === 'fast' ? '⟳ Ngày trôi nhanh (1 ngày = 4 phút)' : '🕒 Giờ thật (giờ Việt Nam)');
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
  };
}
