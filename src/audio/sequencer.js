// Step sequencer for the songs (look-ahead scheduling on AudioContext time) and the continuous
// rolling-ball sound engine. Both work in live and offline contexts: call schedule()/tick() with
// a time horizon; the live engine does it every ~25 ms for ~0.15 s ahead.
import { mkBus, busTarget, busRamp, busKill, clamp, lerp, rnd, noiseBuf } from './core.js';
import { thump } from './sfx.js';

export class Track {
  constructor(ctx, dest, song, { level = 1 } = {}) {
    this.ctx = ctx; this.song = song; this.level = level * (song.level || 1);
    this.out = mkBus(ctx, dest, 0);
    this.lay = {};
    for (const name of song.layers) this.lay[name] = { bus: mkBus(ctx, this.out, 1), g: 1 };
    this.tempo = 1; this.silent = false; this.done = false; this.endAt = Infinity; this.errors = 0;
    this.bar = 0; this.step = 0; this.loop = 0; this.beatT = 0; this.t = 0;
  }
  // set a layer's gain (0..1) with a smooth crossfade
  setLayer(name, g, when, tau = 0.4) {
    const L = this.lay[name];
    if (!L || Math.abs(L.g - g) < 1e-3) return;
    L.g = g;
    busTarget(L.bus, g, when, tau);
  }
  start(t, fade = 0, startBar = 0) {
    this.bar = startBar; this.step = 0; this.loop = 0; this.beatT = t; this.t = t;
    busRamp(this.out, fade > 0 ? 0 : this.level, this.level, t, t + Math.max(fade, 0.005));
  }
  fadeOut(t, fade = 1) {
    const f = Math.max(0.03, fade);
    busRamp(this.out, this.out.gain.value, 0, t, t + f);
    this.endAt = t + f;
  }
  schedule(until) {
    let n = 0;
    while (this.t < until && !this.done && n++ < 1024) {
      if (this.t >= this.endAt) { this.done = true; break; }
      if (!this.silent) this._play(this.t);
      this._advance();
    }
  }
  // skip steps that are already in the past (the tab was hidden or the main thread stalled)
  resync(now) {
    let n = 0;
    while (this.t < now && n++ < 100000) this._advance();
  }
  _play(t) {
    const bars = this.song.variants[this.loop % this.song.variants.length];
    const slot = bars[this.bar] && bars[this.bar][this.step];
    if (!slot) return;
    const sps = 15 / (this.song.bpm * this.tempo);
    for (const e of slot) {
      const L = this.lay[e.lay];
      if (!L || L.g < 0.01) continue;
      try {
        e.fn(this.ctx, L.bus, t, e.len ? { ...e.p, dur: e.len * sps } : e.p);
      } catch (err) {
        if (this.errors++ < 3) console.warn('[audio] note failed', err);
      }
    }
  }
  _advance() {
    const spb = 60 / (this.song.bpm * this.tempo);
    this.step++;
    if (this.step % 4 === 0) this.beatT += spb;
    if (this.step >= 16) {
      this.step = 0;
      this.bar++;
      if (this.bar >= this.song.variants[this.loop % this.song.variants.length].length) { this.bar = this.song.loopStart; this.loop++; }
    }
    const r = this.song.swing, k = this.step % 4;
    this.t = this.beatT + (k === 0 ? 0 : k === 1 ? r / 2 : k === 2 ? r : r + (1 - r) / 2) * spb;
  }
  dispose() {
    busKill(this.out);
    for (const k in this.lay) busKill(this.lay[k].bus);
  }
}

// Continuous rolling rumble: low brown-noise rumble (bigger ball = deeper), gritty pink-noise
// crunch for small balls, a rotation-rate tremolo and soft thumps. update() every frame is fine:
// parameters only move when the target changes by more than ~2 %.
export class Roller {
  constructor(ctx, dest) {
    this.ctx = ctx;
    const t = ctx.currentTime;
    const G = v => { const g = ctx.createGain(); g.gain.value = v; return g; };
    const F = (type, f, q) => { const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; return b; };
    this.out = mkBus(ctx, dest, 1);
    this.src = ctx.createBufferSource(); this.src.buffer = noiseBuf(ctx, 'brown'); this.src.loop = true;
    this.lp = F('lowpass', 300, 0.9); this.lowG = G(0);
    this.src2 = ctx.createBufferSource(); this.src2.buffer = noiseBuf(ctx, 'pink'); this.src2.loop = true;
    this.bp = F('bandpass', 1200, 0.8); this.gritG = G(0);
    this.trem = G(1);
    this.lfo = ctx.createOscillator(); this.lfo.frequency.value = 2; this.lfoG = G(0.3);
    this.lfo.connect(this.lfoG); this.lfoG.connect(this.trem.gain);
    this.src.connect(this.lp); this.lp.connect(this.lowG); this.lowG.connect(this.trem);
    this.src2.connect(this.bp); this.bp.connect(this.gritG); this.gritG.connect(this.trem);
    this.trem.connect(this.out);
    this.src.start(t); this.src2.start(t, 0.7); this.lfo.start(t);
    this.nodes = [this.src, this.lp, this.lowG, this.src2, this.bp, this.gritG, this.trem, this.lfo, this.lfoG];
    this.speed = 0; this.z = 0; this.next = 0; this.last = {};
  }
  update(speed, size) {
    const now = this.ctx.currentTime;
    const s = clamp(+speed || 0), z = clamp((Math.log10(Math.max(+size || 0.3, 0.01)) + 1) / 3.5);
    this.speed = s; this.z = z;
    const e = s > 0.02 ? Math.pow(s, 1.3) : 0;
    this._set('low', this.lowG.gain, e * lerp(0.14, 0.3, z), now, 0.08);
    this._set('lpf', this.lp.frequency, lerp(700, 110, z) * (0.6 + 0.6 * s), now, 0.1);
    this._set('grit', this.gritG.gain, e * lerp(0.5, 0.06, z), now, 0.08);
    this._set('bpf', this.bp.frequency, lerp(1800, 500, z) * (0.7 + 0.5 * s), now, 0.1);
    this._set('rot', this.lfo.frequency, clamp((0.6 + 5 * s) / (1 + 3 * z), 0.3, 6), now, 0.2);
  }
  _set(key, param, v, now, tau) {
    const o = this.last[key];
    if (o !== undefined && Math.abs(v - o) <= Math.abs(o) * 0.02 + 1e-4) return;
    this.last[key] = v;
    param.setTargetAtTime(v, now, tau);
  }
  tick(now, until) {
    if (this.speed < 0.05) { this.next = 0; return; }
    const z = this.z, rate = clamp((0.8 + 5 * this.speed) / (1 + 3 * z), 0.4, 7);
    if (!this.next || this.next < now) this.next = now + 0.03;
    while (this.next < until) {
      thump(this.ctx, this.out, this.next, { f: lerp(130, 42, z) * rnd(0.9, 1.1), vel: (0.06 + 0.14 * this.speed) * lerp(0.7, 1.2, z) });
      this.next += (1 / rate) * rnd(0.8, 1.2);
    }
  }
  dispose() {
    try { this.src.stop(); this.src2.stop(); this.lfo.stop(); } catch (e) { /* ok */ }
    for (const n of this.nodes) try { n.disconnect(); } catch (e) { /* ok */ }
    busKill(this.out);
  }
}
