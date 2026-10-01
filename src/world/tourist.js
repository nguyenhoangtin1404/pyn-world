import * as THREE from 'three';
import { Walker } from './walker.js';
import { turnToward } from '../utils.js';

// Tourists at a landmark: they stroll slowly from one viewpoint to the next, stop to look at it,
// take photos (the camera up in front of the face) and say how lovely it is in a speech bubble full
// of emoji. Alone, or in a party of two or three who walk side by side, stand in a row and talk to
// each other. A Party owns the loop round the landmark and picks viewpoints; a Tourist is one person
// (a Walker with a camera) with a bubble over their head.

export const PRAISE = [
  'Đẹp quá trời! 😍', 'Tháp đẹp thật sự! 🤩', 'Cột đá lục giác ngầu ghê! 😮', 'Gió biển mát quá 🌬️😊',
  'Biển xanh quá đi 🌊💙', 'Check-in nào! ✨📸', 'Hoành tráng quá! 👏', 'Tuyệt vời! 👍😍',
  'Ảnh này đăng là "cháy" luôn 🔥', 'Phú Yên đẹp xỉu 💖', 'Sống ảo thôi! 😎', 'Không uổng công đến đây 🥰',
];
export const CHAT = ['Qua đây chụp chung đi! 👯', 'Cười lên nào! 😁', 'Đứng sang trái chút 👈', 'Được rồi, đẹp lắm! 👌', 'Chụp lại tấm nữa nhé 🔄📸', 'Chụp cho mình tấm nhé 🙏'];
export const RAIN = ['Mưa rồi ☔😅', 'Mưa cũng đẹp mà 🌧️💕'];

/**
 * Speech bubbles: one material per phrase, made when first said and kept by the world that makes
 * the cache (dispose() frees them — not a module cache: that would stay on the GPU across worlds).
 */
export function createSpeech() {
  /** @type {Map<string, { mat: THREE.SpriteMaterial, aspect: number }>} */
  const cache = new Map();
  const font = '600 34px "Segoe UI", Arial, "Noto Color Emoji", "Apple Color Emoji", sans-serif';
  const speech = (/** @type {string} */ text) => {
    let b = cache.get(text);
    if (b) return b;
    const probe = document.createElement('canvas').getContext('2d');
    probe.font = font;
    const w = Math.ceil(probe.measureText(text).width) + 44, h = 96, body = 68;
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const g = c.getContext('2d');
    g.fillStyle = 'rgba(255,255,255,0.94)';
    g.strokeStyle = 'rgba(40,40,60,0.55)';
    g.lineWidth = 3;
    g.beginPath();
    g.roundRect(3, 3, w - 6, body, 24);
    g.moveTo(w / 2 - 10, body + 2);
    g.lineTo(w / 2, h - 4);
    g.lineTo(w / 2 + 10, body + 2);
    g.fill();
    g.stroke();
    g.font = font;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = '#2a2a3a';
    g.fillText(text, w / 2, body / 2 + 4);
    const map = new THREE.CanvasTexture(c);
    map.colorSpace = THREE.SRGBColorSpace;
    b = { mat: new THREE.SpriteMaterial({ map, transparent: true, depthWrite: false }), aspect: w / h };
    cache.set(text, b);
    return b;
  };
  speech.dispose = () => {
    for (const { mat } of cache.values()) {
      mat.map?.dispose();
      mat.dispose();
    }
    cache.clear();
  };
  return speech;
}

/** Indices of a closed loop of `n` points from `from` (left out) to `to`, the shorter way round (`flip`: the other). */
export function loopPath(n, from, to, flip = false) {
  const fwd = (to - from + n) % n;
  const dir = (fwd <= n - fwd) !== flip ? 1 : -1;
  const steps = dir === 1 ? fwd : (n - fwd) % n;
  return Array.from({ length: steps }, (_, i) => (from + dir * (i + 1) + n * 2) % n);
}

/**
 * The point at signed distance `d` along a closed loop from its vertex `i` (so a row of people
 * keeps to the loop's curve instead of leaving it along the tangent).
 * @param {{ x: number, z: number }[]} pts @param {number} i @param {number} d
 * @returns {[number, number]}
 */
export function pointAlong(pts, i, d) {
  const n = pts.length;
  let at = i, left = Math.abs(d);
  const dir = d < 0 ? -1 : 1;
  for (let guard = 0; guard < n * 4; guard++) {
    const a = pts[at], b = pts[(at + dir + n) % n];
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    if (left <= len || len === 0) {
      const u = len ? left / len : 0;
      return [a.x + (b.x - a.x) * u, a.z + (b.z - a.z) * u];
    }
    left -= len;
    at = (at + dir + n) % n;
  }
  return [pts[i].x, pts[i].z];
}

/** How many people in each party, summing to `total`: singles, pairs and threes. */
export function partySizes(rng, total) {
  const sizes = [];
  for (let left = total; left > 0; ) {
    const r = rng();
    const n = Math.min(left, r < 0.3 ? 1 : r < 0.72 ? 2 : 3);
    sizes.push(n);
    left -= n;
  }
  return sizes;
}

export class Tourist extends Walker {
  constructor(rng, heightAt, { speed, k, speech }) {
    super(rng, heightAt, { kind: 'tourist', speed });
    this.k = k;
    this.speech = speech;
    this.route = [];
    this.ri = 0;
    this.act = 'gaze'; // gaze | photo
    this.actT = 0;
    this.photos = 0;
    this.sprite = new THREE.Sprite(speech('📸').mat);
    this.sprite.visible = false;
    this.lift = 0; // the bubble's height over the head: neighbours in a party alternate so they don't overlap
    this.say_ = { t: 0, dur: 1, aspect: 1 };
  }

  get arrived() {
    return this.ri >= this.route.length;
  }

  /** Walk the route; true when it is over. */
  go(dt, t) {
    if (this.arrived) return true;
    if (this.step(this.route[this.ri], dt, t)) this.ri++;
    return this.arrived;
  }

  face(x, z, dt) {
    this.heading = turnToward(this.heading, Math.atan2(x - this.pos.x, z - this.pos.z), Math.min(1, dt * 4));
    this.sync();
  }

  photo(t) {
    this.person.photo(t);
  }

  say(text, dur = 3.2) {
    const b = this.speech(text);
    this.sprite.material = b.mat;
    this.say_ = { t: dur, dur, aspect: b.aspect };
  }

  get talking() {
    return this.say_.t > 0;
  }

  /** The bubble over the head: pops up, stays, shrinks away. */
  updateBubble(dt) {
    const s = this.say_, sp = this.sprite;
    if (s.t <= 0) {
      sp.visible = false;
      return;
    }
    s.t -= dt;
    const size = Math.min(1, (s.dur - s.t) / 0.2, Math.max(0, s.t) / 0.3) * 1.1 * this.k;
    sp.visible = size > 0.001;
    sp.scale.set(size * s.aspect, size, 1);
    sp.position.set(this.pos.x, this.pos.y + 2.2 * this.group.scale.y + size * 0.55 + this.lift, this.pos.z);
  }
}

export class Party {
  /**
   * @param {Tourist[]} members
   * @param {{ pts: THREE.Vector3[], center: { x: number, z: number }, inside: { x: number, z: number }, parties: Party[], rng: () => number, k: number }} area
   *   pts: the loop round the landmark (distinct points, closed), center: what they look at, inside: a point inside the loop
   */
  constructor(members, area, start) {
    this.members = members;
    this.area = area;
    this.i = start; // the viewpoint (loop index) they are at or heading for
    this.phase = 'go';
    this.timer = 0;
    this.lastLine = '';
    members.forEach((m, mi) => (m.lift = (mi % 2) * 1.2 * area.k));
    this.plan(start);
    for (const m of members) m.place(this.slot(start, members.indexOf(m)));
  }

  tangent(i) {
    const { pts } = this.area, n = pts.length;
    const a = pts[(i + n - 1) % n], b = pts[(i + 1) % n];
    const len = Math.hypot(b.x - a.x, b.z - a.z) || 1;
    return [(b.x - a.x) / len, (b.z - a.z) / len];
  }

  /** Where member `m` stands at viewpoint `i`: in a row along the loop, shoulder to shoulder. */
  slot(i, m) {
    const o = (m - (this.members.length - 1) / 2) * 1.15 * this.area.k;
    const [x, z] = pointAlong(this.area.pts, i, o);
    return new THREE.Vector3(x, 0, z);
  }

  /**
   * Everyone's route to viewpoint `to` from where the party is: along the loop, side by side — the
   * others a step further in from the loop (the loop runs just inside the railing: never outwards).
   */
  route(from, to) {
    const { pts, rng, inside } = this.area, n = pts.length;
    const path = loopPath(n, from, to, rng() < 0.15);
    this.members.forEach((m, mi) => {
      const step = mi * 0.6 * this.area.k;
      m.route = path.slice(0, -1).map((idx) => {
        const p = pts[idx], [tx, tz] = this.tangent(idx);
        let nx = -tz, nz = tx;
        if (nx * (inside.x - p.x) + nz * (inside.z - p.z) < 0) [nx, nz] = [-nx, -nz]; // towards the middle of the loop
        return new THREE.Vector3(p.x + nx * step, 0, p.z + nz * step);
      });
      m.route.push(this.slot(to, mi));
      m.ri = 0;
    });
  }

  plan(i) {
    this.route(i, i);
  }

  /** The next viewpoint: a few steps along the loop (they dawdle, not cross the square), not close to another party's. */
  pickSpot() {
    const { pts, parties, rng } = this.area, n = pts.length;
    const gap = (a, b) => Math.min((a - b + n) % n, (b - a + n) % n);
    for (let tries = 0; tries < 12; tries++) {
      const i = (this.i + (rng() < 0.5 ? 1 : -1) * (2 + Math.floor(rng() * 3)) + n * 2) % n;
      if (parties.every((p) => p === this || gap(i, p.i) >= 2)) return i;
    }
    return (this.i + 2) % n;
  }

  /** What they say: now and then to each other, else about the view. */
  line(m, rain) {
    const { rng } = this.area;
    const pool = rain ? RAIN : this.members.length > 1 && rng() < 0.4 ? CHAT : PRAISE;
    let s = pool[Math.floor(rng() * pool.length)];
    if (s === this.lastLine) s = pool[(pool.indexOf(s) + 1) % pool.length];
    this.lastLine = s;
    m.say(s);
  }

  update(dt, t, rain) {
    const { center, rng } = this.area;
    const wet = rain > 0.3;
    for (const m of this.members) m.person.setUmbrella(wet);
    if (this.phase === 'go') {
      let done = true;
      for (const m of this.members) {
        if (!m.go(dt, t)) done = false;
        else if (m.arrived) {
          m.face(center.x, center.z, dt);
          m.idle(t);
        }
      }
      if (done) {
        this.phase = 'look';
        this.timer = 22 + rng() * 14; // a good look: not on the move all the time
        for (const m of this.members) {
          m.act = 'gaze';
          m.actT = 0.8 + rng() * 2.5;
        }
      }
      return;
    }
    this.timer -= dt;
    for (const m of this.members) {
      m.face(center.x, center.z, dt);
      m.actT -= dt;
      if (m.act === 'gaze') {
        m.idle(t);
        if (m.actT <= 0) {
          if (wet) {
            m.actT = 3 + rng() * 3;
            if (!m.talking && rng() < 0.5) this.line(m, true);
          } else {
            m.act = 'photo';
            m.actT = 2 + rng() * 1.5;
            m.say('📸', 1.2);
          }
        }
      } else {
        m.photo(t);
        if (m.actT <= 0) {
          m.act = 'gaze';
          m.actT = 1.5 + rng() * 3.5;
          if (rng() < 0.8) this.line(m, false);
        }
      }
    }
    if (this.timer <= 0) {
      const to = this.pickSpot();
      this.route(this.i, to);
      this.i = to;
      this.phase = 'go';
    }
  }
}
