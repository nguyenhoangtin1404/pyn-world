// @ts-check
import * as THREE from 'three';
import { reducedMotion } from './motion.js';

// The narrated tour of a famous building (key I, the "Thuyết minh" chip): the camera flies from stop
// to stop of the landmark's `tour` (src/landmarks/), each one said aloud in Vietnamese and shown as a
// subtitle. Said by the stop's recording (public/tour/*.mp3, made by tools/tour/voice.mjs) where it
// exists, else by the browser's speech synthesis where it has a Vietnamese voice (Chrome on Windows and
// Mac has none); with neither, or the sound off, the panel says so and shows the subtitles alone.
// Between flights the camera circles slowly round what it looks at. The next stop comes when the
// words are said (or, with no voice, when there has been time to read them); ‹ › step by hand, ✕ or
// Esc ends it, and so does choosing a camera or another world. With prefers-reduced-motion the camera cuts
// from stop to stop (CameraRig.flyTo) and stands still at each. The panel takes the focus when it opens
// (a screen reader reads it) and gives it back when it closes.

/* global __TOUR_VERSIONS__ */
// Hash of each recording, set by vite.config.js (absent under Vitest): the URL changes when the file does.
const versions = typeof __TOUR_VERSIONS__ === 'undefined' ? {} : /** @type {Record<string, string>} */ (__TOUR_VERSIONS__);
const recording = (/** @type {string} */ base, /** @type {string} */ path) => base + path + (versions[path] ? `?v=${versions[path]}` : '');

const FLY = 2.4; // s, the flight to each stop (in the simulation's time: longer on a slow machine)
const PAUSE = 1.2; // s, a breath after the words before flying on
const DRIFT = 0.035; // rad/s, the slow circling at a stop

/** Seconds to read `text` on screen (about 14 characters a second, at least 5 s). */
export const readingTime = (/** @type {string} */ text) => Math.max(5, text.length / 14);

/** The sentences of `text`, for speaking one at a time (some browsers cut a long utterance short). */
export const sentences = (/** @type {string} */ text) => text.split(/(?<=[.!?:])\s+/).filter(Boolean);

/**
 * @param {{ rig: import('../cameras.js').CameraRig, camera: THREE.PerspectiveCamera, muted: () => boolean, volume: () => number, duck: (on: boolean) => void, base?: string, onEnd?: () => void }} app
 *   `base`: the site's base URL, for the recordings
 */
export function createTour({ rig, camera, muted, volume, duck, base = '/', onEnd }) {
  const $ = (/** @type {string} */ id) => /** @type {HTMLElement} */ (document.getElementById(id));
  const box = $('narration'), title = $('narration-title'), text = $('narration-text'), step = $('narration-step'), note = $('narration-note');
  const synth = typeof speechSynthesis === 'undefined' ? null : speechSynthesis;
  const player = new Audio();
  let noFiles = false; // a recording failed to load: the others won't be there either
  /** @type {import('../landmarks/common.js').TourStop[]} */
  let stops = [];
  let i = -1, t = 0, wait = 0, speaking = false, spoken = false, said = 0; // t: seconds since the camera got there
  const v = new THREE.Vector3();
  /** @type {HTMLElement | null} */
  let returnFocus = null; // where the focus was before the panel opened

  // A Vietnamese voice, the most natural-sounding the device has (Edge's "Online (Natural)" neural
  // voices, Google's, Apple's) before the plainer ones.
  const voice = () => {
    const vi = synth?.getVoices().filter((x) => /^vi/i.test(x.lang)) ?? [];
    return vi.find((x) => /natural|neural|online/i.test(x.name)) ?? vi.find((x) => /google/i.test(x.name)) ?? vi[0] ?? null;
  };

  const tell = (/** @type {string} */ msg) => { note.textContent = msg; note.hidden = !msg; };
  const finished = (/** @type {number} */ id) => () => { if (id === said) { speaking = false; duck(false); } };

  function hush() {
    synth?.cancel();
    player.pause();
    player.onended = player.onerror = null;
  }

  // The stop's recording if there is one, else the browser's voice.
  function say(/** @type {import('../landmarks/common.js').TourStop} */ s) {
    hush();
    speaking = spoken = false;
    if (muted()) return tell('🔇 Đang tắt tiếng — bấm M để nghe thuyết minh.');
    tell('');
    if (!s.audio || noFiles) return speak(s.say);
    const id = ++said;
    player.src = recording(base, s.audio);
    player.volume = Math.min(1, Math.max(0.2, volume() * 1.4));
    player.onended = finished(id);
    player.onerror = () => { if (id !== said) return; noFiles = true; speaking = false; duck(false); speak(s.say); };
    speaking = spoken = true;
    duck(true);
    player.play().catch((err) => {
      if (id !== said) return;
      if (err?.name === 'NotAllowedError') return awaitGesture();
      player.onerror?.(new Event('error'));
    });
  }

  // A page that starts the tour by itself may not make sound before the visitor touches it (autoplay
  // rules): the subtitles and the flight go on, and the first touch or key says the current stop.
  let waiting = false;
  function awaitGesture() {
    speaking = spoken = false;
    duck(false);
    tell('🔈 Chạm vào màn hình hoặc bấm một phím để nghe thuyết minh.');
    if (waiting) return;
    waiting = true;
    const resume = () => {
      removeEventListener('pointerdown', resume, true);
      removeEventListener('keydown', resume, true);
      waiting = false;
      if (i >= 0) { t = 0; wait = 0; say(stops[i]); }
    };
    addEventListener('pointerdown', resume, true);
    addEventListener('keydown', resume, true);
  }

  function speak(/** @type {string} */ words) {
    synth?.cancel();
    speaking = spoken = false;
    const vi = voice();
    // Chrome hands out its voices a moment after the first asking: the first stop would be silent.
    if (synth && !vi && !synth.getVoices().length) {
      const stop = i;
      synth.addEventListener('voiceschanged', () => { if (i === stop && t === 0) { tell(''); speak(words); } }, { once: true });
    }
    if (!synth || !vi) return tell('🔇 Máy này chưa có giọng đọc tiếng Việt nên chỉ hiện phụ đề.');
    const parts = sentences(words), id = ++said;
    speaking = spoken = true;
    duck(true);
    parts.forEach((part, n) => {
      const u = new SpeechSynthesisUtterance(part);
      u.lang = 'vi-VN';
      u.voice = vi;
      if (n === parts.length - 1) u.onend = u.onerror = finished(id);
      synth.speak(u);
    });
  }

  function go(/** @type {number} */ n) {
    i = n;
    const s = stops[i];
    // A tall screen (a phone) sees less across: stand further back.
    const back = Math.max(1, 1 / camera.aspect) ** 0.6;
    rig.flyTo(v.copy(s.from).sub(s.look).multiplyScalar(back).add(s.look), s.look, FLY);
    text.textContent = s.say;
    step.textContent = `${i + 1}/${stops.length}`;
    t = 0;
    wait = 0;
    say(s);
  }

  const tour = {
    get active() { return i >= 0; },
    /** @param {{ name: string, tour?: import('../landmarks/common.js').TourStop[] }} landmark */
    start(landmark) {
      if (!landmark.tour?.length) return false;
      stops = landmark.tour;
      title.textContent = landmark.name;
      if (box.hidden) {
        const at = document.activeElement;
        returnFocus = at instanceof HTMLElement && at !== document.body ? at : null;
      }
      box.hidden = false;
      box.focus({ preventScroll: true });
      voice(); // (Chrome loads its voices on first asking)
      go(0);
      return true;
    },
    stop() {
      if (i < 0) return;
      i = -1;
      said++;
      hush();
      speaking = false;
      duck(false);
      const inside = box.contains(document.activeElement);
      box.hidden = true;
      if (inside && returnFocus?.isConnected) returnFocus.focus({ preventScroll: true }); // (else it falls back to the page)
      returnFocus = null;
      onEnd?.();
    },
    /** Say the current stop again (the sound was switched on or off). */
    retell() { if (i >= 0) { t = 0; wait = 0; say(stops[i]); } },
    next() { if (i >= 0) (i + 1 < stops.length ? go(i + 1) : tour.stop()); },
    prev() { if (i >= 0) go(Math.max(0, i - 1)); },
    /** @param {number} dt real seconds */
    update(dt) {
      if (i < 0) return;
      // Not before the camera is there (on a slow machine the flight, in the simulation's time, takes
      // longer than FLY seconds); then circle slowly round what it looks at.
      if (rig.fly) return;
      const target = rig.controls.target;
      if (!reducedMotion()) {
        v.copy(camera.position).sub(target).applyAxisAngle(THREE.Object3D.DEFAULT_UP, DRIFT * dt);
        camera.position.copy(target).add(v);
      }
      // On when the words are said (or, unspoken, there has been time to read them), never long after.
      const read = readingTime(stops[i].say);
      t += dt;
      const done = speaking ? t > read * 2.5 : t > (spoken ? 1.5 : read);
      if (done && (wait += dt) > PAUSE) tour.next();
    },
  };

  $('narration-next').addEventListener('click', () => tour.next());
  $('narration-prev').addEventListener('click', () => tour.prev());
  $('narration-stop').addEventListener('click', () => tour.stop());
  return tour;
}
