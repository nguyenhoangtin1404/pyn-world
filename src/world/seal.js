// @ts-check
import * as THREE from 'three';

// The sea sign of Nghinh Phong — HOÀNG SA, TRƯỜNG SA LÀ CỦA VIỆT NAM — is sealed: the words are not
// in the source as text (scrambled, unscrambled only here), they are checked against a checksum
// every time they are read, the texture records what was really drawn, and the world checks, while
// it is built and every second or so after, that the sign is there, unchanged and in the scene.
// If anything is changed, taken out or switched off the app stops with an error and does not load.
// (This makes tampering hard, not impossible: anything that runs in a browser can be rewritten by
// whoever holds a copy of it. A guard no one can get round would have to be on a server.)
const SCRAMBLED = '79019877b7e7d658f54213d432b0519370ed8f90aecbcddcedd215b02a15490d6819877ba656c526e3b9022421f3408141577ee19dafbc28db24e49a191f381a57677659954a';
const SUM = 4666600527238800;

const key = (/** @type {number} */ i) => (Math.imul(i + 1, 7919) + 0x5a5a) & 0xffff;

/** cyrb53: a small, quick 53-bit string hash. @param {string} str */
export function hash(str, seed = 0x9e37) {
  let h1 = 0xdeadbeef ^ seed, h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}

/** The app does not load, or stops: an error on the page and an exception. @param {string} why @returns {never} */
export function tamper(why) {
  const msg = `Ứng dụng đã bị chỉnh sửa nên không thể tải (mã ${why}). Hãy dùng bản gốc.`;
  try {
    // A calm card rather than an alarm: most who see it did nothing wrong (an extension, a cached copy) — a reload
    // from the original site is the way out.
    document.body.innerHTML = `<div id="tampered" role="alert" style="position:fixed;inset:0;display:grid;place-items:center;padding:24px;background:#1b2a3a;font:500 17px/1.5 Arial,sans-serif">
      <div style="max-width:26rem;padding:24px 26px;border-radius:18px;background:#fbf4e2;color:#3f2a1f;text-align:center;box-shadow:0 12px 36px rgba(0,0,0,.35)">
        <p style="margin:0 0 16px"></p>
        <button type="button" style="padding:10px 22px;min-height:44px;border:0;border-radius:999px;background:#2f5d7c;color:#fff;font:600 16px Arial,sans-serif;cursor:pointer">↻ Tải lại</button>
      </div></div>`;
    const card = document.getElementById('tampered');
    card.querySelector('p').textContent = msg;
    card.querySelector('button').addEventListener('click', () => location.reload());
  } catch {
    /* (no page: the exception below still stops whatever was running) */
  }
  throw new Error(msg);
}

/** The words, unscrambled and checked. */
export function sealText() {
  let s = '';
  for (let i = 0; i < SCRAMBLED.length; i += 4) s += String.fromCharCode(parseInt(SCRAMBLED.slice(i, i + 4), 16) ^ key(i / 4));
  if (hash(s) !== SUM) tamper('T1');
  return s;
}

/** The sign's texture: one line, bold Arial, red with a white edge. Notes on it what was drawn. */
export function sealTexture() {
  const text = sealText();
  const c = document.createElement('canvas');
  c.width = 2048;
  c.height = 256;
  const g = /** @type {CanvasRenderingContext2D} */ (c.getContext('2d'));
  g.font = 'bold 120px Arial, Helvetica, sans-serif';
  const size = Math.min(120, (120 * 1960) / g.measureText(text).width); // (all on one line: shrunk to fit if need be)
  g.font = `bold ${size}px Arial, Helvetica, sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineJoin = 'round';
  g.lineWidth = size * 0.13;
  g.strokeStyle = '#ffffff';
  g.fillStyle = '#e60012';
  g.strokeText(text, 1024, 128);
  g.fillText(text, 1024, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  t.userData.seal = hash(text, 7); // what was drawn
  return t;
}

// Checks in a row that an ancestor of the sign may be switched off before it counts: the app never hides the
// sign's group, but a check may land in the middle of something that hides groups for a moment (a test hiding
// what moves for a screenshot, a step that switches things off and on).
const GRACE = 3;

/**
 * Watches the sign's mesh: `check()` stops the app if the sign is gone, hidden, moved off the
 * water, resized, drawn from another texture or with other words.
 * What counts is what decides whether it is drawn: the mesh itself switched on, on the camera's layer, inside a
 * scene, its group and every one above it switched on (an ancestor off is let pass for GRACE checks), its
 * material and texture. Not whether it is on screen this frame: the camera looking elsewhere (frustum
 * culling), the tour, the HUD hidden or other groups hidden are all fine.
 * @param {THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>} mesh
 */
export function guard(mesh) {
  let hiddenChecks = 0; // checks in a row with an ancestor switched off
  return {
    check() {
      const map = mesh.material?.map;
      if (hash(sealText(), 7) !== map?.userData.seal) tamper('T2');
      if (!mesh.visible || !mesh.parent || !mesh.layers.isEnabled(0)) tamper('T3');
      /** @type {THREE.Object3D} */
      let root = mesh;
      let shown = true;
      while (root.parent) {
        root = root.parent;
        if (!root.visible) shown = false;
      }
      if (!(/** @type {THREE.Scene} */ (root).isScene)) tamper('T3'); // (taken out, into a group of its own)
      hiddenChecks = shown ? 0 : hiddenChecks + 1;
      if (hiddenChecks >= GRACE) tamper('T3');
      const { scale, material, geometry } = mesh;
      if (scale.x !== 1 || scale.y !== 1 || scale.z !== 1 || material.opacity !== 1 || material.colorWrite === false || material.visible === false) tamper('T4');
      if (!(geometry.parameters.width > 20) || !(geometry.parameters.height > 2) || !Number.isFinite(mesh.position.y)) tamper('T5');
      if (!(map?.image instanceof HTMLCanvasElement) || map.image.width !== 2048) tamper('T6');
    },
  };
}

/** @typedef {ReturnType<typeof guard>} Seal */
