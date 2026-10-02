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

/** Is (x, z) inside the polygon? @param {{ x: number, z: number }[]} poly @param {number} x @param {number} z */
export function inside(poly, x, z) {
  let in_ = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if (a.z > z !== b.z > z && x < ((b.x - a.x) * (z - a.z)) / (b.z - a.z) + a.x) in_ = !in_;
  }
  return in_;
}

/**
 * Can one walk straight from a to b without going through the polygon (the tower's footprint)?
 * @param {{ x: number, z: number }[]} poly @param {{ x: number, z: number }} a @param {{ x: number, z: number }} b
 */
export function clearOf(poly, a, b) {
  if (inside(poly, a.x, a.z) || inside(poly, b.x, b.z) || inside(poly, (a.x + b.x) / 2, (a.z + b.z) / 2)) return false;
  const side = (/** @type {{ x: number, z: number }} */ p, /** @type {{ x: number, z: number }} */ q, /** @type {{ x: number, z: number }} */ r) => Math.sign((q.x - p.x) * (r.z - p.z) - (q.z - p.z) * (r.x - p.x));
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const c = poly[i], d = poly[j];
    if (side(a, b, c) * side(a, b, d) < 0 && side(c, d, a) * side(c, d, b) < 0) return false;
  }
  return true;
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
    this.trip = false; // away from the grounds on the way to or from the bus, or on it (features/busstop.js)
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
   * @param {{ plaza: { x: number, z: number }[], keepOut: THREE.Vector3[], center: { x: number, z: number }, parties: Party[], rng: () => number, k: number }} area
   *   plaza: the ground they may be on (a polygon), keepOut: the landmark's footprint (a closed loop
   *   round it, which they go round), center: what they look at
   */
  constructor(members, area) {
    this.members = members;
    this.area = area;
    this.phase = 'go'; // go | look | wait (at the bus stop) | ride (on the bus, out of sight)
    this.then = 'look'; // what a 'go' ends in
    this.faceAt = null; // wait: what they look at (the road)
    /** @type {any} the landmark whose grounds they are at, and the bus stop they are bound for (features/busstop.js) */
    this.landmark = null;
    this.dest = null;
    this.timer = 0;
    this.lastLine = '';
    this.spot = this.pick();
    members.forEach((m, mi) => {
      const p = this.slot(this.spot, mi);
      m.place(p);
      m.route = [p];
      m.ri = 0;
    });
  }

  /** Where member `m` stands at a viewpoint: in a row across the way they look, shoulder to shoulder. */
  slot(/** @type {{ x: number, z: number }} */ at, /** @type {number} */ m) {
    const { center, k } = this.area;
    const fx = center.x - at.x, fz = center.z - at.z, len = Math.hypot(fx, fz) || 1;
    const o = (m - (this.members.length - 1) / 2) * 1.15 * k;
    return new THREE.Vector3(at.x - (fz / len) * o, 0, at.z + (fx / len) * o);
  }

  /** Can the whole party stand at `at` (inside the plaza, off the landmark)? */
  fits(/** @type {{ x: number, z: number }} */ at) {
    const { plaza, keepOut } = this.area;
    return this.members.every((_, mi) => {
      const p = this.slot(at, mi);
      return inside(plaza, p.x, p.z) && !inside(keepOut, p.x, p.z);
    });
  }

  /** A viewpoint anywhere on the plaza, away from the other parties and from where this one is. */
  pick() {
    const { plaza, parties, rng, k } = this.area;
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const p of plaza) [x0, x1, z0, z1] = [Math.min(x0, p.x), Math.max(x1, p.x), Math.min(z0, p.z), Math.max(z1, p.z)];
    const here = this.spot;
    for (let tries = 0; tries < 80; tries++) {
      const at = { x: x0 + rng() * (x1 - x0), z: z0 + rng() * (z1 - z0) };
      const apart = 9 * k * (1 - tries / 100); // (less and less choosy)
      if (!this.fits(at)) continue;
      if (parties.some((o) => o !== this && o.spot && Math.hypot(o.spot.x - at.x, o.spot.z - at.z) < apart)) continue;
      if (here && Math.hypot(here.x - at.x, here.z - at.z) < 3 * k) continue;
      return at;
    }
    return here ?? { x: (x0 + x1) / 2, z: (z0 + z1) / 2 };
  }

  /** The way from a to b: straight if the landmark isn't in it, else round it along its loop. */
  way(/** @type {THREE.Vector3} */ a, /** @type {THREE.Vector3} */ b) {
    const { keepOut } = this.area;
    if (clearOf(keepOut, a, b)) return [b];
    const near = (/** @type {THREE.Vector3} */ p) => keepOut.reduce((best, q, i) => (Math.hypot(q.x - p.x, q.z - p.z) < Math.hypot(keepOut[best].x - p.x, keepOut[best].z - p.z) ? i : best), 0);
    const i = near(a), j = near(b);
    return [keepOut[i], ...loopPath(keepOut.length, i, j, false).map((q) => keepOut[q]), b].map((p) => new THREE.Vector3(p.x, 0, p.z));
  }

  /** Everyone's route to viewpoint `to`: straight over the plaza (round the landmark if it is in the way), the party together; now and then by way of a place they fancy looking at. */
  route(/** @type {{ x: number, z: number }} */ to) {
    const { rng, plaza, keepOut, k } = this.area;
    let via = null;
    if (rng() < 0.4) {
      for (let tries = 0; tries < 12 && !via; tries++) {
        const lead = this.members[0].pos, c = { x: (lead.x + to.x) / 2 + (rng() - 0.5) * 10 * k, z: (lead.z + to.z) / 2 + (rng() - 0.5) * 10 * k };
        if (inside(plaza, c.x, c.z) && !inside(keepOut, c.x, c.z) && this.fits(c)) via = c;
      }
    }
    this.members.forEach((m, mi) => {
      const goal = this.slot(to, mi);
      const stops = via ? [this.slot(via, mi), goal] : [goal];
      let from = new THREE.Vector3(m.pos.x, 0, m.pos.z);
      m.route = stops.flatMap((p) => {
        const w = this.way(from, p);
        from = p;
        return w;
      });
      m.ri = 0;
    });
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

  /** On the way to the bus, waiting for it, on it, or on the way back. */
  setTrip(/** @type {boolean} */ on) {
    for (const m of this.members) m.trip = on;
  }

  /** Out of sight (on the bus), or back. */
  hide(/** @type {boolean} */ on) {
    for (const m of this.members) {
      m.group.visible = !on;
      if (on) {
        m.sprite.visible = false;
        m.say_.t = 0;
      }
    }
  }

  update(dt, t, rain) {
    const { center, rng } = this.area;
    const wet = rain > 0.3;
    if (this.phase === 'ride') return;
    for (const m of this.members) m.person.setUmbrella(wet);
    if (this.phase === 'wait') {
      for (const m of this.members) {
        if (this.faceAt) m.face(this.faceAt.x, this.faceAt.z, dt);
        m.idle(t);
      }
      return;
    }
    if (this.phase === 'go') {
      let done = true;
      for (const m of this.members) {
        if (!m.go(dt, t)) done = false;
        else if (m.arrived) {
          m.face(center.x, center.z, dt);
          m.idle(t);
        }
      }
      if (done && this.then !== 'look') {
        this.phase = this.then; // (at the stop, or on the bus)
        this.then = 'look';
        if (this.phase === 'ride') this.hide(true);
        return;
      }
      if (done) {
        this.phase = 'look';
        this.timer = 12 + rng() * 22; // a good look: not on the move all the time
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
      this.spot = this.pick();
      this.route(this.spot);
      this.phase = 'go';
    }
  }
}
