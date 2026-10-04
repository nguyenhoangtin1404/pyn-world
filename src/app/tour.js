// @ts-check
import * as THREE from 'three';

// The narrated tour of a famous building (key I, the "Thuyết minh" chip): the camera flies from stop
// to stop of the landmark's `tour` (src/landmarks/), each one said aloud in Vietnamese (the browser's
// speech synthesis, when it has a Vietnamese voice and the sound is on) and shown as a subtitle.
// Between flights the camera circles slowly round what it looks at. The next stop comes when the
// words are said (or, with no voice, when there has been time to read them); ‹ › step by hand, ✕ or
// Esc ends it, and so does choosing a camera or another world.

const FLY = 2.4; // s, the flight to each stop (in the simulation's time: longer on a slow machine)
const PAUSE = 1.2; // s, a breath after the words before flying on
const DRIFT = 0.035; // rad/s, the slow circling at a stop

/** Seconds to read `text` on screen (about 14 characters a second, at least 5 s). */
export const readingTime = (/** @type {string} */ text) => Math.max(5, text.length / 14);

/** The sentences of `text`, for speaking one at a time (some browsers cut a long utterance short). */
export const sentences = (/** @type {string} */ text) => text.split(/(?<=[.!?:])\s+/).filter(Boolean);

/**
 * @param {{ rig: import('../cameras.js').CameraRig, camera: THREE.PerspectiveCamera, muted: () => boolean, duck: (on: boolean) => void, onEnd?: () => void }} app
 */
export function createTour({ rig, camera, muted, duck, onEnd }) {
  const $ = (/** @type {string} */ id) => /** @type {HTMLElement} */ (document.getElementById(id));
  const box = $('narration'), title = $('narration-title'), text = $('narration-text'), step = $('narration-step');
  const synth = typeof speechSynthesis === 'undefined' ? null : speechSynthesis;
  /** @type {import('../landmarks/common.js').TourStop[]} */
  let stops = [];
  let i = -1, t = 0, wait = 0, speaking = false, spoken = false, said = 0; // t: seconds since the camera got there
  const v = new THREE.Vector3();

  // A Vietnamese voice, the most natural-sounding the device has (Edge's "Online (Natural)" neural
  // voices, Google's, Apple's) before the plainer ones.
  const voice = () => {
    const vi = synth?.getVoices().filter((x) => /^vi/i.test(x.lang)) ?? [];
    return vi.find((x) => /natural|neural|online/i.test(x.name)) ?? vi.find((x) => /google/i.test(x.name)) ?? vi[0] ?? null;
  };

  function speak(/** @type {string} */ words) {
    synth?.cancel();
    speaking = spoken = false;
    const vi = voice();
    if (!synth || !vi || muted()) return;
    const parts = sentences(words), id = ++said;
    speaking = spoken = true;
    duck(true);
    parts.forEach((part, n) => {
      const u = new SpeechSynthesisUtterance(part);
      u.lang = 'vi-VN';
      u.voice = vi;
      if (n === parts.length - 1) u.onend = u.onerror = () => { if (id === said) { speaking = false; duck(false); } };
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
    speak(s.say);
  }

  const tour = {
    get active() { return i >= 0; },
    /** @param {{ name: string, tour?: import('../landmarks/common.js').TourStop[] }} landmark */
    start(landmark) {
      if (!landmark.tour?.length) return false;
      stops = landmark.tour;
      title.textContent = landmark.name;
      box.hidden = false;
      voice(); // (Chrome loads its voices on first asking)
      go(0);
      return true;
    },
    stop() {
      if (i < 0) return;
      i = -1;
      said++;
      synth?.cancel();
      speaking = false;
      duck(false);
      box.hidden = true;
      onEnd?.();
    },
    next() { if (i >= 0) (i + 1 < stops.length ? go(i + 1) : tour.stop()); },
    prev() { if (i >= 0) go(Math.max(0, i - 1)); },
    /** @param {number} dt real seconds */
    update(dt) {
      if (i < 0) return;
      // Not before the camera is there (on a slow machine the flight, in the simulation's time, takes
      // longer than FLY seconds); then circle slowly round what it looks at.
      if (rig.fly) return;
      const target = rig.controls.target;
      v.copy(camera.position).sub(target).applyAxisAngle(THREE.Object3D.DEFAULT_UP, DRIFT * dt);
      camera.position.copy(target).add(v);
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
