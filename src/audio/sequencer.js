// Step sequencer for the songs (look-ahead scheduling on AudioContext time). Works in live and
// offline contexts: call schedule() with a time horizon; the live engine does it every ~25 ms for
// ~0.15 s ahead.
import { mkBus, busTarget, busRamp, busKill } from './core.js';

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
