import { clamp } from './utils.js';

// Everything is synthesised with the Web Audio API — no sound files needed.
export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.volume = 0.65;
    this.muted = false;
    this.birdTimer = 3;
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

  update(dt, { trainDistance, rain, day, paused }) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.trainBus.gain.setTargetAtTime(clamp(1 - trainDistance / 320, 0.06, 1), t, 0.15);
    this.rainGain.gain.setTargetAtTime(rain * 0.3, t, 0.4);
    this.windGain.gain.setTargetAtTime(0.025 + rain * 0.03, t, 0.5);
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

  applyMaster() {
    if (!this.ctx) return;
    this.master.gain.setTargetAtTime(this.muted ? 0 : this.volume, this.ctx.currentTime, 0.05);
  }
}
