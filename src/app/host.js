// @ts-check
import * as THREE from 'three';
import { qrSvg } from './qr.js';

// The author's chat bubble (features/host.js puts them in the world as world.host): a tap on them, or on
// the "👋" over their head, flies the camera up to them and opens a bubble with their greeting, a QR code of
// their portfolio and a link to it (a new tab). ✕, Esc, a tap elsewhere on the scene or another world closes it.
// A tap is a press and release that hardly moved (a drag turns the camera); it is tested against where
// the two are on screen — no raycast into the merged meshes (CLAUDE.md).

const TAP = 8; // px a press may move and still be a tap
const MARKER_HIT = 30; // px round the marker
const BODY_HIT = 22; // px at least round the person (more when they are drawn bigger)

/**
 * @param {{ camera: THREE.PerspectiveCamera, rig: import('../cameras.js').CameraRig, canvas: HTMLElement, world: () => import('../World.js').World | null, onOpen?: () => void }} app
 *   `onOpen`: before the camera flies (the app stops the tour, back to its overview camera)
 */
export function createHostCard({ camera, rig, canvas, world, onOpen }) {
  const $ = (/** @type {string} */ id) => /** @type {HTMLElement} */ (document.getElementById(id));
  const card = $('host-card'), title = $('host-title'), text = $('host-text'), qr = $('host-qr');
  const link = /** @type {HTMLAnchorElement} */ ($('host-link'));
  const v = new THREE.Vector3();
  let shownFor = '';

  /** Where `p` is on screen (px from the canvas's top left), or null behind the camera. */
  const screen = (/** @type {THREE.Vector3} */ p) => {
    v.copy(p).project(camera);
    if (v.z > 1) return null;
    const r = canvas.getBoundingClientRect();
    return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height };
  };

  /** Is (x, y) on the author or their marker? */
  const hits = (/** @type {number} */ x, /** @type {number} */ y) => {
    const host = world()?.host;
    if (!host || !host.group.visible) return false;
    const r = canvas.getBoundingClientRect();
    const m = screen(host.marker.position);
    // The marker's tail is at its position; the round bubble is above it, about MARKER of the screen tall.
    if (m && Math.hypot(x - m.x, y - (m.y - host.marker.scale.y * r.height * 0.55)) < Math.max(MARKER_HIT, host.marker.scale.y * r.height * 0.6)) return true;
    const head = screen(host.head), feet = screen(host.person.group.position);
    if (!head || !feet) return false;
    const tall = Math.abs(feet.y - head.y) * 1.25; // (head → soles, plus the hair)
    const cx = (head.x + feet.x) / 2, cy = (head.y + feet.y) / 2;
    return Math.abs(x - cx) < Math.max(BODY_HIT, tall * 0.35) && Math.abs(y - cy) < Math.max(BODY_HIT, tall * 0.65);
  };

  const api = {
    get open() { return !card.hidden; },
    /** Fly up to the author and open the bubble. */
    show() {
      const host = world()?.host;
      if (!host) return false;
      onOpen?.();
      if (shownFor !== host.url) {
        title.textContent = host.title;
        text.textContent = host.greeting;
        qr.innerHTML = qrSvg(host.url, { label: `Mã QR tới ${host.title}` });
        link.href = host.url;
        shownFor = host.url;
      }
      // In front of them and a little above, looking at a point below their feet so that they stand in the top
      // half of the screen, over the bubble (sizes as tall as they are drawn, × a few).
      const tall = host.head.y - host.person.group.position.y;
      const at = host.head.clone().addScaledVector(host.facing, tall * 5).add(new THREE.Vector3(0, tall * 1.2, 0));
      rig.flyTo(at, host.head.clone().add(new THREE.Vector3(0, -tall * 1.5, 0)), 1.4);
      card.hidden = false;
      return true;
    },
    hide() {
      card.hidden = true;
    },
  };

  /** @type {{ x: number, y: number } | null} */
  let press = null;
  canvas.addEventListener('pointerdown', (e) => (press = { x: e.clientX, y: e.clientY }));
  canvas.addEventListener('pointerup', (e) => {
    if (!press || Math.hypot(e.clientX - press.x, e.clientY - press.y) > TAP) return void (press = null);
    press = null;
    if (hits(e.clientX, e.clientY)) api.show();
    else if (api.open) api.hide();
  });
  addEventListener('keydown', (e) => {
    if (e.code === 'Escape' && api.open) api.hide();
  });
  $('host-close').addEventListener('click', () => api.hide());
  return api;
}
