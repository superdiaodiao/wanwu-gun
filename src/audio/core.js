// Shared building blocks for the procedural audio engine (there are no audio files: everything
// is synthesized with the Web Audio API).
//
// Every sound in src/audio is a function (ctx, dest, t, params) that works in both a live
// AudioContext and an OfflineAudioContext. `dest` is a *bus*: an AudioNode that may carry a
// `_wet` property (a paired node that feeds the reverb) so each sound picks its own reverb send.
// Buffers (noise, reverb impulse, Karplus–Strong strings) are cached per sample rate because an
// AudioBuffer is not tied to the context that made it.

export const clamp = (x, a = 0, b = 1) => (x < a ? a : x > b ? b : x);
export const lerp = (a, b, t) => a + (b - a) * t;
export const mtof = m => 440 * Math.pow(2, (m - 69) / 12);
export const dbToGain = d => Math.pow(10, d / 20);
export const smoothstep = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
export const rnd = (a = 0, b = 1) => a + Math.random() * (b - a);
export const pick = arr => arr[Math.floor(Math.random() * arr.length)];
export const TINY = 1e-4;

// Chinese pentatonic 宫 商 角 徵 羽 as semitones above 宫 (do re mi sol la).
export const PENTA = [0, 2, 4, 7, 9];
export function inPenta(midi, gongPc) { return PENTA.includes((((midi - gongPc) % 12) + 12) % 12); }
export function pentaRange(gongPc, lo, hi) {
  const r = [];
  for (let m = Math.ceil(lo); m <= hi; m++) if (inPenta(m, gongPc)) r.push(m);
  return r;
}

// Small deterministic PRNG (mulberry32) so cached buffers and the self-check are reproducible.
export function prng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ------------------------------------------------------------------ caches
const rateCache = new Map();
export function cached(ctx, key, make) {
  let c = rateCache.get(ctx.sampleRate);
  if (!c) rateCache.set(ctx.sampleRate, (c = new Map()));
  let v = c.get(key);
  if (v === undefined) { v = make(ctx); c.set(key, v); }
  return v;
}
const ctxCache = new WeakMap();
export function perCtx(ctx, key, make) {
  let c = ctxCache.get(ctx);
  if (!c) ctxCache.set(ctx, (c = new Map()));
  let v = c.get(key);
  if (v === undefined) { v = make(ctx); c.set(key, v); }
  return v;
}

// 2 s mono noise loops ('white' | 'pink' | 'brown'), seamless, normalised to RMS 0.3.
export function noiseBuf(ctx, color = 'white') {
  return cached(ctx, 'noise:' + color, c => {
    const sr = c.sampleRate, len = Math.floor(sr * 2), X = Math.floor(sr * 0.05);
    const r = prng(color.length * 7919 + 17);
    const raw = new Float32Array(len + X);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, br = 0;
    for (let i = 0; i < len + X; i++) {
      const w = r() * 2 - 1;
      if (color === 'pink') {
        b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.969 * b2 + w * 0.153852;
        b3 = 0.8665 * b3 + w * 0.3104856; b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
        raw[i] = b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362; b6 = w * 0.115926;
      } else if (color === 'brown') { br = (br + 0.02 * w) / 1.02; raw[i] = br; }
      else raw[i] = w;
    }
    const buf = c.createBuffer(1, len, sr), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = raw[i];
    for (let i = 0; i < X; i++) { const a = i / X; d[i] = raw[i] * Math.sqrt(a) + raw[len + i] * Math.sqrt(1 - a); }
    let mean = 0;
    for (let i = 0; i < len; i++) mean += d[i];
    mean /= len;
    let e = 0;
    for (let i = 0; i < len; i++) { d[i] -= mean; e += d[i] * d[i]; }
    const k = 0.3 / Math.sqrt(e / len || 1);
    for (let i = 0; i < len; i++) d[i] *= k;
    return buf;
  });
}

// Generated stereo reverb impulse: early reflections + exponentially decaying, darkening noise.
// Normalised to unit energy per channel, so a send of 0.2 gives a wet level about 14 dB below dry.
export function reverbIR(ctx, seconds = 2.6) {
  return cached(ctx, 'ir:' + seconds, c => {
    const sr = c.sampleRate, len = Math.floor(sr * seconds), pre = Math.floor(sr * 0.012);
    const buf = c.createBuffer(2, len, sr);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch), r = prng(101 + ch * 977);
      let lp = 0;
      for (let i = pre; i < len; i++) {
        const t = (i - pre) / sr, x = i / len;
        lp += (0.88 - 0.68 * x) * (r() * 2 - 1 - lp);
        let v = lp * Math.exp((-6.9 * t) / (seconds * 0.78));
        if (t < 0.008) v *= t / 0.008;
        d[i] = v;
      }
      for (let k = 0; k < 8; k++) {
        const i = pre + Math.floor(sr * (0.004 + 0.075 * r()));
        if (i < len) d[i] += (r() < 0.5 ? -1 : 1) * (0.45 - k * 0.04);
      }
      let e = 0;
      for (let i = 0; i < len; i++) e += d[i] * d[i];
      const g = 1 / Math.sqrt(e || 1);
      for (let i = 0; i < len; i++) d[i] *= g;
    }
    return buf;
  });
}

// Periodic waves (sine-series harmonic amplitudes), normalised to peak 1 by the browser.
const WAVES = {
  dizi: [1, 0.5, 0.34, 0.22, 0.15, 0.1, 0.07, 0.045, 0.03, 0.02],
  glottal: Array.from({ length: 48 }, (_, i) => Math.pow(i + 1, -1.3)),
  reed: [1, 0.8, 0.6, 0.45, 0.33, 0.25, 0.18, 0.12, 0.08, 0.05],
  soft: [1, 0.25, 0.1, 0.04],
};
export function wave(ctx, name) {
  return perCtx(ctx, 'wave:' + name, c => {
    const h = WAVES[name] || WAVES.soft;
    const re = new Float32Array(h.length + 1), im = new Float32Array(h.length + 1);
    h.forEach((a, i) => { im[i + 1] = a; });
    return c.createPeriodicWave(re, im);
  });
}

// tanh soft-clip curve, normalised so ±1 maps to ±1.
const curves = new Map();
export function clipCurve(drive = 1) {
  const key = Math.round(drive * 100);
  let cv = curves.get(key);
  if (!cv) {
    const n = 2048, k = 1 + drive * 6, norm = Math.tanh(k);
    cv = new Float32Array(n);
    for (let i = 0; i < n; i++) { const x = (i / (n - 1)) * 2 - 1; cv[i] = Math.tanh(k * x) / norm; }
    curves.set(key, cv);
  }
  return cv;
}

// ------------------------------------------------------------------ buses
// A bus is a GainNode whose optional `_wet` twin feeds the reverb with the same gain.
export function mkBus(ctx, dest, g = 1) {
  const dry = ctx.createGain();
  dry.gain.value = g;
  if (dest) {
    dry.connect(dest);
    if (dest._wet) { const wet = ctx.createGain(); wet.gain.value = g; wet.connect(dest._wet); dry._wet = wet; }
  }
  return dry;
}
export function busTarget(b, v, t, tau) {
  b.gain.setTargetAtTime(v, t, tau);
  if (b._wet) b._wet.gain.setTargetAtTime(v, t, tau);
}
export function busRamp(b, from, to, t0, t1) {
  for (const n of b._wet ? [b, b._wet] : [b]) {
    n.gain.cancelScheduledValues(t0);
    n.gain.setValueAtTime(from, t0);
    n.gain.linearRampToValueAtTime(to, t1);
  }
}
export function busKill(b) {
  try { b.disconnect(); } catch (e) { /* already gone */ }
  if (b._wet) try { b._wet.disconnect(); } catch (e) { /* already gone */ }
}

// ------------------------------------------------------------------ envelopes
// Linear attack then exponential decay reaching -80 dB after `d` seconds.
export function perc(p, t, peak, a, d) {
  if (!(peak > 0)) { p.setValueAtTime(0, t); return t; }
  p.setValueAtTime(0, t);
  p.linearRampToValueAtTime(peak, t + a);
  p.exponentialRampToValueAtTime(Math.max(peak * TINY, 1e-7), t + a + d);
  p.setValueAtTime(0, t + a + d + 0.001);
  return t + a + d;
}
// Attack / decay-to-sustain / hold until t+dur / release. Returns the time the sound is silent.
export function adsr(p, t, dur, a, d, s, r, peak = 1) {
  p.setValueAtTime(0, t);
  p.linearRampToValueAtTime(peak, t + a);
  if (d > 0 && s !== 1) p.setTargetAtTime(peak * s, t + a, d / 3);
  const tr = t + Math.max(dur, a);
  p.setTargetAtTime(0, tr, r / 5);
  return tr + r;
}
// Piecewise-linear automation from [[time, value], ...] (times relative to t).
export function pts(p, t, points, scale = 1) {
  p.setValueAtTime(points[0][1] * scale, t + points[0][0]);
  for (let i = 1; i < points.length; i++) p.linearRampToValueAtTime(points[i][1] * scale, t + points[i][0]);
}

// ------------------------------------------------------------------ Voice
// Builds one sound: owns its nodes, disconnects them when the last source ends, can be killed
// (voice stealing). Signal: [your graph] -> out -> (pan) -> dest, with an optional reverb send.
export class Voice {
  constructor(ctx, dest, t, send = 0, pan = 0) {
    this.ctx = ctx; this.t = Math.max(t, 0); this.nodes = []; this.srcs = []; this.end = this.t; this.last = null;
    this.out = this.gain(1);
    let head = this.out;
    if (pan) { const p = this.pan(pan); this.out.connect(p); head = p; }
    head.connect(dest);
    if (send > 0 && dest && dest._wet) { const s = this.gain(send); head.connect(s); s.connect(dest._wet); }
  }
  gain(v = 1) { const g = this.ctx.createGain(); g.gain.value = v; this.nodes.push(g); return g; }
  osc(type, f, t0 = this.t, t1 = t0 + 1) {
    const o = this.ctx.createOscillator();
    if (typeof type === 'string') o.type = type; else o.setPeriodicWave(type);
    o.frequency.value = f;
    o.start(t0); o.stop(t1);
    return this._src(o, t1);
  }
  noise(t0, t1, color = 'white', rate = 1) {
    const s = this.ctx.createBufferSource();
    s.buffer = noiseBuf(this.ctx, color); s.loop = true; s.playbackRate.value = rate;
    s.start(t0, Math.random() * 1.9); s.stop(t1);
    return this._src(s, t1);
  }
  buffer(b, t0, t1 = t0 + b.duration) {
    const s = this.ctx.createBufferSource();
    s.buffer = b; s.start(t0); s.stop(t1);
    return this._src(s, t1);
  }
  filter(type, f, q = 0.707, g = 0) {
    const b = this.ctx.createBiquadFilter();
    b.type = type; b.frequency.value = f; b.Q.value = q; if (g) b.gain.value = g;
    this.nodes.push(b); return b;
  }
  shaper(drive = 1) {
    const w = this.ctx.createWaveShaper(); w.curve = clipCurve(drive); w.oversample = '2x';
    this.nodes.push(w); return w;
  }
  pan(p) {
    if (!this.ctx.createStereoPanner) return this.gain(1);
    const n = this.ctx.createStereoPanner(); n.pan.value = clamp(p, -1, 1);
    this.nodes.push(n); return n;
  }
  delay(time, max = 1) { const d = this.ctx.createDelay(max); d.delayTime.value = time; this.nodes.push(d); return d; }
  // connect a -> b -> c ...; returns the last node
  conn(...chain) { for (let i = 0; i < chain.length - 1; i++) chain[i].connect(chain[i + 1]); return chain[chain.length - 1]; }
  // an LFO (oscillator -> gain) connected into an AudioParam
  lfo(param, rate, depth, t0 = this.t, t1 = this.end, type = 'sine') {
    const o = this.osc(type, rate, t0, t1), g = this.gain(depth);
    o.connect(g); g.connect(param);
    return g;
  }
  _src(s, t1) {
    s._t1 = t1; this.srcs.push(s);
    if (!this.last || t1 >= this.end) { this.end = t1; this.last = s; }
    return s;
  }
  done() {
    const nodes = this.nodes, srcs = this.srcs;
    if (this.last) {
      this.last.onended = () => {
        for (const n of srcs) try { n.disconnect(); } catch (e) { /* ok */ }
        for (const n of nodes) try { n.disconnect(); } catch (e) { /* ok */ }
      };
    }
    return this;
  }
  kill(t, fade = 0.02) {
    try {
      this.out.gain.setTargetAtTime(0, t, fade / 3);
      const stop = t + fade * 2;
      for (const s of this.srcs) if (s._t1 > stop) { s.stop(stop); s._t1 = stop; }
    } catch (e) { /* ignore */ }
  }
}
