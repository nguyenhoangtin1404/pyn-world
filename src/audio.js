import { clamp } from './utils.js';

// Everything is synthesised with the Web Audio API — no sound files needed.
export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.volume = 0.65;
    this.muted = false;
    this.birdTimer = 3;
    this.hornTimer = 4;
    this.voiceTimer = 1;
  }

  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC());
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : this.volume;
    this.master.connect(ctx.destination);

    const len = ctx.sampleRate * 2;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

    this.trainBus = ctx.createGain();
    this.trainBus.gain.value = 0.5;
    this.trainBus.connect(this.master);
    this.rainGain = this.noiseLoop('lowpass', 1400, 0.4);
    this.windGain = this.noiseLoop('bandpass', 380, 0.6);
    // The sea (a low roar, the hiss of each wave breaking) and the traffic (engines' rumble and whine).
    this.surfGain = this.noiseLoop('lowpass', 520, 0.5);
    this.hissGain = this.noiseLoop('bandpass', 2400, 0.4);
    this.engineGain = this.noiseLoop('bandpass', 115, 0.8);
    this.whineGain = this.noiseLoop('bandpass', 650, 2.5);
  }

  noiseLoop(type, freq, q) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.value = 0;
    src.connect(f).connect(g).connect(this.master);
    src.start();
    return g;
  }

  burst({ type, freq, q = 1, gain, attack = 0.005, decay, when = 0, bus }) {
    const ctx = this.ctx;
    const t = ctx.currentTime + when;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    src.connect(f).connect(g).connect(bus || this.master);
    src.start(t, Math.random() * 1.5, attack + decay + 0.05);
  }

  chuff(k = 1) {
    if (!this.ctx) return;
    const g = 0.5 * Math.min(1.2, 0.5 + k * 0.6);
    this.burst({ type: 'bandpass', freq: 260 + Math.random() * 60, q: 0.9, gain: g, attack: 0.012, decay: 0.2, bus: this.trainBus });
    this.burst({ type: 'highpass', freq: 3000, q: 0.5, gain: 0.05, attack: 0.005, decay: 0.12, bus: this.trainBus });
  }

  clack() {
    if (!this.ctx) return;
    for (const when of [0, 0.11]) this.burst({ type: 'bandpass', freq: 1800, q: 3, gain: 0.22, attack: 0.002, decay: 0.05, when, bus: this.trainBus });
  }

  whistle() {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    for (const [start, dur] of [[0, 1.0], [1.25, 0.45]]) {
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t + start);
      g.gain.exponentialRampToValueAtTime(0.12, t + start + 0.06);
      g.gain.setValueAtTime(0.12, t + start + dur);
      g.gain.exponentialRampToValueAtTime(0.0001, t + start + dur + 0.25);
      g.connect(this.trainBus);
      for (const f of [523, 659, 784]) {
        const o = ctx.createOscillator();
        o.type = 'triangle';
        o.frequency.setValueAtTime(f * 0.96, t + start);
        o.frequency.linearRampToValueAtTime(f, t + start + 0.1);
        o.connect(g);
        o.start(t + start);
        o.stop(t + start + dur + 0.3);
      }
    }
  }

  bird() {
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const n = 2 + Math.floor(Math.random() * 3);
    const base = 2400 + Math.random() * 1400;
    for (let i = 0; i < n; i++) {
      const st = t + i * 0.14;
      const o = ctx.createOscillator();
      o.frequency.setValueAtTime(base, st);
      o.frequency.exponentialRampToValueAtTime(base * 1.35, st + 0.05);
      o.frequency.exponentialRampToValueAtTime(base * 0.9, st + 0.1);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, st);
      g.gain.exponentialRampToValueAtTime(0.035, st + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, st + 0.11);
      o.connect(g).connect(this.master);
      o.start(st);
      o.stop(st + 0.12);
    }
  }

  // A horn: one short beep or two (the town's way of saying "here I come"), a bit flat, through a small speaker.
  horn(level) {
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const gain = 0.02 + 0.1 * Math.min(1, level) ** 0.7;
    const base = 360 + Math.random() * 180;
    const beeps = Math.random() < 0.55 ? [[0, 0.14], [0.2, 0.22]] : [[0, 0.3 + Math.random() * 0.3]];
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 1800;
    f.connect(this.master);
    for (const [start, dur] of beeps) {
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t + start);
      g.gain.exponentialRampToValueAtTime(gain, t + start + 0.015);
      g.gain.setValueAtTime(gain, t + start + dur);
      g.gain.exponentialRampToValueAtTime(0.0001, t + start + dur + 0.04);
      g.connect(f);
      for (const m of [1, 1.26]) {
        const o = ctx.createOscillator();
        o.type = 'square';
        o.frequency.value = base * m;
        o.connect(g);
        o.start(t + start);
        o.stop(t + start + dur + 0.06);
      }
    }
  }

  // A syllable of someone talking: noise through two formants of a vowel, short. Many make a murmur.
  voice(level) {
    const VOWELS = [[730, 1090], [270, 2290], [530, 1840], [570, 840], [440, 1020], [300, 870]];
    const [f1, f2] = VOWELS[Math.floor(Math.random() * VOWELS.length)];
    const pitch = 0.8 + Math.random() * 0.5, decay = 0.07 + Math.random() * 0.12;
    const gain = 0.06 * Math.min(1, level);
    this.burst({ type: 'bandpass', freq: f1 * pitch, q: 7, gain, attack: 0.02, decay });
    this.burst({ type: 'bandpass', freq: f2 * pitch, q: 9, gain: gain * 0.6, attack: 0.02, decay });
  }

  update(dt, { trainDistance, rain, day, paused, sound }) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const { sea = 0, wind = 0, traffic = 0, crowd = 0, horn = null } = sound ?? {};
    this.trainBus.gain.setTargetAtTime(clamp(1 - trainDistance / 320, 0.06, 1), t, 0.15);
    this.rainGain.gain.setTargetAtTime(rain * 0.3, t, 0.4);
    this.windGain.gain.setTargetAtTime(0.02 + wind * 0.05 + rain * 0.03, t, 0.5);
    // Waves come in every 8 s or so: the roar swells, the hiss is the break.
    const swell = Math.sin((t / 8.3) * Math.PI * 2), brk = Math.max(0, Math.sin((t / 8.3) * Math.PI * 2 - 0.6)) ** 3;
    this.surfGain.gain.setTargetAtTime(sea * (0.16 + 0.08 * swell), t, 0.3);
    this.hissGain.gain.setTargetAtTime(sea * (0.015 + 0.09 * brk), t, 0.2);
    this.engineGain.gain.setTargetAtTime(traffic * 0.22, t, 0.3);
    this.whineGain.gain.setTargetAtTime(traffic * (0.025 + 0.012 * Math.sin(t * 0.7)), t, 0.3);
    if (!paused) {
      // A horn now and then where there's traffic, more often the more there is.
      this.hornTimer -= dt * (0.15 + traffic);
      if (this.hornTimer < 0 && horn && traffic > 0.05) {
        this.horn(horn.level);
        this.hornTimer = 3 + Math.random() * 9;
      }
      // People talking: syllables close together in a crowd, now and then with few about.
      this.voiceTimer -= dt;
      if (this.voiceTimer < 0 && crowd > 0.03) {
        this.voice(crowd);
        this.voiceTimer = 0.08 + Math.random() * (0.15 + 1.2 * (1 - crowd));
      }
    }
    if (day && rain < 0.3 && !paused) {
      this.birdTimer -= dt;
      if (this.birdTimer < 0) {
        this.bird();
        this.birdTimer = 2 + Math.random() * 6;
      }
    }
  }

  setVolume(v) {
    this.volume = v;
    this.applyMaster();
  }

  setMuted(m) {
    this.muted = m;
    this.applyMaster();
  }

  // Near silent while the tour's narrator speaks (src/app/tour.js): the voice heard on its own.
  duck(on) {
    this.ducked = on;
    this.applyMaster();
  }

  applyMaster() {
    if (!this.ctx) return;
    this.master.gain.setTargetAtTime(this.muted ? 0 : this.volume * (this.ducked ? 0.06 : 1), this.ctx.currentTime, 0.05);
  }
}
