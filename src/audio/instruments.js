// Synthesized instruments. Each is (ctx, dest, t, params) -> Voice and works offline too.
//   plucked strings (guzheng / pipa / harp) via pre-rendered Karplus–Strong buffers,
//   dizi flute, 木鱼 wood block, 大锣 / 小锣 gongs, 镲 cymbal, drums, electric piano, bass,
//   synth brass, erhu-like lead, warm pad, celesta bell, sine drone.
import { Voice, cached, mtof, clamp, lerp, prng, perc, adsr, wave, rnd, pentaRange } from './core.js';

const TINYG = 1e-5;

// ------------------------------------------------------------------ Karplus–Strong strings
// dur: max buffer seconds; lo/hi: T60 (s) for low/high notes; bright: excitation low-pass (0..1);
// pos: pluck position (comb); S: loop-filter weight (0.5 = classic average, lower = brighter).
const KS = {
  zheng: { dur: 2.8, lo: 3.4, hi: 1.1, bright: 0.55, pos: 0.13, S: 0.38 },
  pipa: { dur: 1.6, lo: 1.6, hi: 0.6, bright: 0.85, pos: 0.09, S: 0.44 },
  harp: { dur: 3.0, lo: 3.0, hi: 1.5, bright: 0.3, pos: 0.23, S: 0.5 },
};
export function ksBuffer(ctx, kind, midi) {
  return cached(ctx, `ks:${kind}:${midi}`, c => renderKS(c, KS[kind] || KS.zheng, midi));
}
function renderKS(ctx, P, midi) {
  const sr = ctx.sampleRate, f = mtof(midi);
  const T60 = lerp(P.lo, P.hi, clamp((midi - 45) / 45));
  const len = Math.floor(Math.min(P.dur, T60 * 1.05 + 0.05) * sr);
  const buf = ctx.createBuffer(1, len, sr), y = buf.getChannelData(0);
  const S = P.S, D = sr / f;
  let N = Math.floor(D - S), frac = D - S - N;
  if (frac < 0.2) { N -= 1; frac += 1; }
  const C = (1 - frac) / (1 + frac); // first-order all-pass: fractional delay for exact tuning
  const w = (2 * Math.PI * f) / sr;
  const gF = Math.sqrt((1 - S) * (1 - S) + S * S + 2 * S * (1 - S) * Math.cos(w));
  const rho = Math.min(0.99995, Math.pow(0.001, 1 / (f * T60)) / gF);
  const r = prng(midi * 7919 + Math.round(P.bright * 1000));
  const ex = new Float32Array(N + 1);
  let s = 0;
  for (let i = 0; i <= N; i++) { s += P.bright * (r() * 2 - 1 - s); ex[i] = s; }
  const off = Math.max(1, Math.round(P.pos * N));
  for (let i = N; i >= off; i--) ex[i] -= 0.9 * ex[i - off];
  let mean = 0;
  for (let i = 0; i <= N; i++) mean += ex[i];
  mean /= N + 1;
  for (let i = 0; i <= N; i++) ex[i] -= mean;
  let x1 = 0, y1 = 0;
  for (let n = 0; n < len; n++) {
    const a = n >= N ? y[n - N] : 0, b = n > N ? y[n - N - 1] : 0;
    const lp = (1 - S) * a + S * b;
    const ap = C * lp + x1 - C * y1; x1 = lp; y1 = ap;
    y[n] = (n <= N ? ex[n] : 0) + rho * ap;
  }
  let pk = 0;
  for (let n = 0; n < len; n++) pk = Math.max(pk, Math.abs(y[n]));
  const g = 0.9 / (pk || 1), fade = Math.floor(0.04 * sr);
  for (let n = 0; n < len; n++) y[n] *= g * (n > len - fade ? (len - n) / fade : 1);
  return buf;
}
// Pre-render a set of pitches (call from idle time so the first notes don't stall).
export function warmStrings(ctx, kinds = ['zheng', 'pipa'], lo = 40, hi = 96) {
  for (const k of kinds) for (let m = lo; m <= hi; m++) ksBuffer(ctx, k, m);
}

// Plucked string. dur > 0 damps the string after dur seconds; bend = semitones (按音 ornament).
export function pluck(ctx, dest, t, { midi = 62, vel = 0.7, kind = 'zheng', dur = 0, pan = 0, send = 0.2, bend = 0 } = {}) {
  const v = new Voice(ctx, dest, t, send, pan);
  const m = Math.round(midi), b = ksBuffer(ctx, kind, clamp(m, 24, 108));
  const end = dur > 0 ? Math.min(t + dur + 0.25, t + b.duration) : t + b.duration;
  const s = v.buffer(b, t, end);
  const r0 = Math.pow(2, (midi - m) / 12);
  s.playbackRate.setValueAtTime(r0 * Math.pow(2, (0.2 * vel) / 12), t); // pluck twang: starts sharp
  s.playbackRate.setTargetAtTime(r0, t, 0.025);
  if (bend) s.playbackRate.setTargetAtTime(r0 * Math.pow(2, bend / 12), t + 0.14, 0.05);
  const pk = vel * 0.55, g = v.gain(pk);
  if (dur > 0) { g.gain.setValueAtTime(pk, t + dur); g.gain.setTargetAtTime(0, t + dur, 0.04); }
  v.conn(s, g, v.out);
  return v.done();
}
// 刮奏 glissando over the pentatonic scale (gongPc = pitch class of 宫) from `from` to `to`.
export function gliss(ctx, dest, t, { from = 62, to = 86, gongPc = 2, span = 0.4, vel = 0.5, kind = 'zheng', send = 0.25, pan = 0 } = {}) {
  const notes = pentaRange(gongPc, Math.min(from, to), Math.max(from, to));
  if (from > to) notes.reverse();
  const n = notes.length;
  notes.forEach((m, i) => {
    const x = i / Math.max(1, n - 1);
    pluck(ctx, dest, t + span * Math.pow(x, 0.9), { midi: m, vel: vel * (0.55 + 0.45 * x), kind, send, pan: pan + (x - 0.5) * 0.4 });
  });
}
// 轮指 tremolo: rapid repeated plucks (pipa / zheng), for long melody notes.
export function tremolo(ctx, dest, t, { midi = 74, dur = 1, vel = 0.5, kind = 'pipa', rate = 12, pan = 0, send = 0.2 } = {}) {
  const n = Math.max(2, Math.round(dur * rate));
  for (let i = 0; i < n; i++) {
    const x = i / n;
    pluck(ctx, dest, t + i / rate + rnd(-0.004, 0.004), { midi, vel: vel * (i % 2 ? 0.72 : 0.9) * (1 - 0.3 * x), kind, dur: 2.5 / rate, pan, send });
  }
}

// ------------------------------------------------------------------ dizi 笛子
// Bright harmonic tone (the membrane buzz), breath noise, scoop into the note, delayed vibrato,
// optional grace note (倚音, semitones above/below).
export function dizi(ctx, dest, t, { midi = 74, dur = 0.5, vel = 0.8, pan = 0, send = 0.3, vib = 1, scoop = 1, grace = 0 } = {}) {
  const v = new Voice(ctx, dest, t, send, pan);
  const f = mtof(midi), end = t + dur + 0.2;
  const o = v.osc(wave(ctx, 'dizi'), f, t, end);
  if (grace) { o.frequency.setValueAtTime(mtof(midi + grace), t); o.frequency.setValueAtTime(f, t + 0.065); }
  if (scoop) { o.detune.setValueAtTime(-55 * scoop, t); o.detune.setTargetAtTime(0, t, 0.022); }
  if (vib && dur > 0.25) {
    const lg = v.lfo(o.detune, 5.3 + rnd(-0.3, 0.3), 0, t, end);
    lg.gain.setValueAtTime(0, t + 0.14);
    lg.gain.linearRampToValueAtTime(15 * vib, t + Math.min(0.55, dur));
  }
  const pk = vel * 0.2, amp = v.gain(0);
  amp.gain.setValueAtTime(0, t);
  amp.gain.linearRampToValueAtTime(pk * 1.12, t + 0.035);
  amp.gain.setTargetAtTime(pk, t + 0.035, 0.07);
  amp.gain.setTargetAtTime(0, t + dur, 0.035);
  const n = v.noise(t, end, 'white'), bp = v.filter('bandpass', clamp(f * 2.5, 1500, 7000), 0.8), ng = v.gain(0);
  ng.gain.setValueAtTime(0, t);
  ng.gain.linearRampToValueAtTime(pk * 1.2, t + 0.012);
  ng.gain.setTargetAtTime(pk * 0.28, t + 0.012, 0.04);
  ng.gain.setTargetAtTime(0, t + dur, 0.03);
  v.conn(o, amp, v.out);
  v.conn(n, bp, ng, v.out);
  return v.done();
}

// ------------------------------------------------------------------ percussion
// 木鱼 wooden fish / wood block: hollow sine knock with a quick pitch drop and a click.
export function woodblock(ctx, dest, t, { pitch = 1, vel = 0.7, pan = 0, send = 0.12 } = {}) {
  const v = new Voice(ctx, dest, t, send, pan);
  const f = 700 * pitch;
  const o = v.osc('sine', f, t, t + 0.16);
  o.frequency.setValueAtTime(f * 1.3, t);
  o.frequency.exponentialRampToValueAtTime(f, t + 0.012);
  const g = v.gain(0); perc(g.gain, t, vel * 0.42, 0.0015, 0.13);
  const o2 = v.osc('sine', f * 2.71, t, t + 0.06), g2 = v.gain(0); perc(g2.gain, t, vel * 0.1, 0.001, 0.045);
  const n = v.noise(t, t + 0.03), bp = v.filter('bandpass', 2400 * pitch, 1.1), ng = v.gain(0);
  perc(ng.gain, t, vel * 0.5, 0.0008, 0.02);
  v.conn(o, g, v.out); v.conn(o2, g2, v.out); v.conn(n, bp, ng, v.out);
  return v.done();
}

// 大锣 big gong: inharmonic partials with beating pairs, downward pitch glide, noise bloom.
const GONG = [[1, 1, 1], [1.51, 0.72, 0.82], [2.02, 0.6, 0.7], [2.46, 0.52, 0.62], [2.94, 0.45, 0.54],
  [3.47, 0.38, 0.46], [3.98, 0.3, 0.4], [4.55, 0.26, 0.34], [5.2, 0.2, 0.28], [6.1, 0.15, 0.22]];
export function gong(ctx, dest, t, { f = 110, vel = 0.8, dur = 4, glide = -0.06, pan = 0, send = 0.45 } = {}) {
  const v = new Voice(ctx, dest, t, send, pan);
  const mix = v.gain(vel * 0.075);
  for (const [r, a, d] of GONG) {
    const fr = f * r;
    if (fr > 9000) continue;
    const end = t + 0.05 + dur * d;
    for (const det of r < 3 ? [1, 1.0042] : [1]) {
      const o = v.osc('sine', fr * det, t, end);
      o.frequency.setValueAtTime(fr * det, t);
      o.frequency.exponentialRampToValueAtTime(fr * det * (1 + glide), t + 0.8);
      const g = v.gain(0);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(a * (det === 1 ? 1 : 0.55), t + 0.003 + r * 0.012);
      g.gain.exponentialRampToValueAtTime(TINYG, end);
      v.conn(o, g, mix);
    }
  }
  // mallet thump + tam-tam bloom
  const n = v.noise(t, t + dur * 0.8, 'pink'), bp = v.filter('bandpass', f * 5, 0.9), ng = v.gain(0);
  ng.gain.setValueAtTime(0, t);
  ng.gain.linearRampToValueAtTime(1.5, t + 0.012);
  ng.gain.setTargetAtTime(3, t + 0.02, 0.12);
  ng.gain.setTargetAtTime(0, t + 0.35, dur * 0.18);
  const th = v.osc('sine', f * 0.55, t, t + 0.3), tg = v.gain(0); perc(tg.gain, t, 0.9, 0.003, 0.25);
  v.conn(n, bp, ng, mix); v.conn(th, tg, mix);
  mix.connect(v.out);
  return v.done();
}
// 小锣 small opera gong: the pitch glides *up* after the strike ("tai!").
export function smallGong(ctx, dest, t, { f = 640, vel = 0.7, dur = 0.9, pan = 0, send = 0.25 } = {}) {
  const v = new Voice(ctx, dest, t, send, pan);
  const mix = v.gain(vel * 0.2);
  for (const [r, a] of [[1, 1], [1.97, 0.3], [2.93, 0.16], [4.12, 0.08]]) {
    const o = v.osc('sine', f * r, t, t + dur + 0.05);
    o.frequency.setValueAtTime(f * r, t);
    o.frequency.setTargetAtTime(f * r * 1.13, t + 0.01, 0.045);
    const g = v.gain(0); perc(g.gain, t, a, 0.002, dur / Math.sqrt(r));
    v.conn(o, g, mix);
  }
  const n = v.noise(t, t + 0.03), bp = v.filter('bandpass', 3200, 1), ng = v.gain(0); perc(ng.gain, t, 0.9, 0.0005, 0.02);
  v.conn(n, bp, ng, mix);
  mix.connect(v.out);
  return v.done();
}

// 镲 / 铙钹 cymbal: metallic square partials + filtered noise; dur small = choked "cha".
export function cymbal(ctx, dest, t, { vel = 0.7, dur = 1.1, tone = 1, pan = 0, send = 0.25 } = {}) {
  const v = new Voice(ctx, dest, t, send, pan);
  const end = t + dur + 0.02, mix = v.gain(0);
  perc(mix.gain, t, vel, 0.001, dur);
  const sq = v.gain(0.045);
  for (const fq of [263, 400, 421, 474, 587, 845]) v.osc('square', fq * 1.7 * tone, t, end).connect(sq);
  const b1 = v.filter('bandpass', 7000 * tone, 0.7), h1 = v.filter('highpass', 4200);
  v.conn(sq, b1, h1, mix);
  const n = v.noise(t, end), h2 = v.filter('highpass', 5500 * tone), ng = v.gain(0.4);
  v.conn(n, h2, ng, mix);
  const n2 = v.noise(t, end), b2 = v.filter('bandpass', 3000 * tone, 0.9), ng2 = v.gain(0);
  perc(ng2.gain, t, 0.55, 0.001, dur * 0.45);
  v.conn(n2, b2, ng2, mix);
  mix.connect(v.out);
  return v.done();
}

export function kick(ctx, dest, t, { vel = 0.8, f0 = 140, f1 = 46, decay = 0.36, click = 0.25 } = {}) {
  const v = new Voice(ctx, dest, t);
  const o = v.osc('sine', f0, t, t + decay + 0.02);
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(f1, t + 0.09);
  const g = v.gain(0); perc(g.gain, t, vel * 0.45, 0.002, decay);
  const n = v.noise(t, t + 0.02), bp = v.filter('bandpass', 3000, 0.8), ng = v.gain(0);
  perc(ng.gain, t, vel * click * 0.6, 0.0005, 0.012);
  v.conn(o, g, v.out); v.conn(n, bp, ng, v.out);
  return v.done();
}
export function snare(ctx, dest, t, { vel = 0.7, tone = 1, decay = 0.18, send = 0.12, pan = 0 } = {}) {
  const v = new Voice(ctx, dest, t, send, pan);
  const o = v.osc('triangle', 190 * tone, t, t + 0.12);
  o.frequency.setValueAtTime(200 * tone, t);
  o.frequency.exponentialRampToValueAtTime(165 * tone, t + 0.05);
  const g = v.gain(0); perc(g.gain, t, vel * 0.3, 0.001, 0.09);
  const n = v.noise(t, t + decay + 0.02), bp = v.filter('bandpass', 1900, 0.7), ng = v.gain(0);
  perc(ng.gain, t, vel * 0.9, 0.001, decay);
  const hp = v.filter('highpass', 6000), hg = v.gain(0); perc(hg.gain, t, vel * 0.4, 0.001, decay * 0.6);
  v.conn(o, g, v.out); v.conn(n, bp, ng, v.out); v.conn(n, hp, hg, v.out);
  return v.done();
}
export function clap(ctx, dest, t, { vel = 0.6, send = 0.15, pan = 0 } = {}) {
  const v = new Voice(ctx, dest, t, send, pan);
  const n = v.noise(t, t + 0.25), bp = v.filter('bandpass', 1150, 1.1), g = v.gain(0), pk = vel * 1.3;
  g.gain.setValueAtTime(0, t);
  for (const k of [0, 0.011, 0.022]) {
    g.gain.setValueAtTime(pk, t + k);
    g.gain.exponentialRampToValueAtTime(pk * 0.1, t + k + 0.009);
  }
  g.gain.setValueAtTime(pk, t + 0.033);
  g.gain.exponentialRampToValueAtTime(pk * TINYG, t + 0.2);
  v.conn(n, bp, g, v.out);
  return v.done();
}
export function hat(ctx, dest, t, { vel = 0.5, open = false, tone = 1, pan = 0, send = 0.05 } = {}) {
  const v = new Voice(ctx, dest, t, send, pan);
  const d = open ? 0.26 : 0.045;
  const n = v.noise(t, t + d + 0.01), hp = v.filter('highpass', 7500 * tone), g = v.gain(0);
  perc(g.gain, t, vel * 0.8, 0.0008, d);
  v.conn(n, hp, g, v.out);
  return v.done();
}
export function shaker(ctx, dest, t, { vel = 0.4, pan = 0 } = {}) {
  const v = new Voice(ctx, dest, t, 0.05, pan);
  const n = v.noise(t, t + 0.08), bp = v.filter('bandpass', 6500, 1.2), g = v.gain(0);
  perc(g.gain, t, vel * 1.6, 0.01, 0.055);
  v.conn(n, bp, g, v.out);
  return v.done();
}
export function tom(ctx, dest, t, { f = 180, vel = 0.7, pan = 0, send = 0.15 } = {}) {
  const v = new Voice(ctx, dest, t, send, pan);
  const o = v.osc('sine', f, t, t + 0.4);
  o.frequency.setValueAtTime(f * 1.6, t);
  o.frequency.exponentialRampToValueAtTime(f, t + 0.06);
  const g = v.gain(0); perc(g.gain, t, vel * 0.45, 0.002, 0.34);
  const n = v.noise(t, t + 0.03), lp = v.filter('lowpass', 2500), ng = v.gain(0); perc(ng.gain, t, vel * 0.25, 0.001, 0.02);
  v.conn(o, g, v.out); v.conn(n, lp, ng, v.out);
  return v.done();
}

// ------------------------------------------------------------------ melodic / harmonic
// Electric piano: 1:1 FM body plus a 14:1 "tine" modulator on the attack.
export function epiano(ctx, dest, t, { midi = 62, dur = 0.5, vel = 0.6, pan = 0, send = 0.18 } = {}) {
  const v = new Voice(ctx, dest, t, send, pan);
  const f = mtof(midi), end = t + dur + 0.35;
  const car = v.osc('sine', f, t, end), mod = v.osc('sine', f, t, end), tine = v.osc('sine', f * 14, t, t + 0.25);
  const mg = v.gain(0);
  mg.gain.setValueAtTime(f * (0.9 + 1.4 * vel), t);
  mg.gain.setTargetAtTime(f * 0.3, t, 0.28);
  const tg = v.gain(0); perc(tg.gain, t, f * 5 * vel, 0.001, 0.07);
  mod.connect(mg); mg.connect(car.frequency);
  tine.connect(tg); tg.connect(car.frequency);
  const amp = v.gain(0);
  amp.gain.setValueAtTime(0, t);
  amp.gain.linearRampToValueAtTime(vel * 0.175, t + 0.003);
  amp.gain.setTargetAtTime(vel * 0.088, t + 0.003, 0.55);
  amp.gain.setTargetAtTime(0, t + dur, 0.07);
  v.conn(car, amp, v.out);
  return v.done();
}
// Round bass: low-passed saw with a plucky filter envelope + sine sub; glide = semitones below.
export function bass(ctx, dest, t, { midi = 38, dur = 0.3, vel = 0.8, glide = 0, send = 0.02, bright = 1 } = {}) {
  const v = new Voice(ctx, dest, t, send);
  const f = mtof(midi), end = t + dur + 0.1;
  const saw = v.osc('sawtooth', f, t, end), sub = v.osc('sine', f, t, end);
  if (glide) for (const o of [saw, sub]) { o.frequency.setValueAtTime(mtof(midi - glide), t); o.frequency.exponentialRampToValueAtTime(f, t + 0.07); }
  const lp = v.filter('lowpass', f * 8, 2.2);
  lp.frequency.setValueAtTime(Math.min(f * 11 * bright, 3200), t);
  lp.frequency.setTargetAtTime(f * 3.2 * bright, t, 0.06);
  const sg = v.gain(0.45), ssub = v.gain(0.75), amp = v.gain(0);
  adsr(amp.gain, t, dur, 0.004, 0.12, 0.8, 0.06, vel * 0.2);
  v.conn(saw, sg, lp, amp); v.conn(sub, ssub, amp); amp.connect(v.out);
  return v.done();
}
// Synth brass: two detuned saws, swelling low-pass, delayed vibrato.
export function brass(ctx, dest, t, { midi = 72, dur = 0.3, vel = 0.7, pan = 0, send = 0.12, glide = 0 } = {}) {
  const v = new Voice(ctx, dest, t, send, pan);
  const f = mtof(midi), end = t + dur + 0.12;
  const a = v.osc('sawtooth', f, t, end), b = v.osc('sawtooth', f, t, end);
  a.detune.value = -9; b.detune.value = 9;
  if (glide) for (const o of [a, b]) { o.frequency.setValueAtTime(mtof(midi - glide), t); o.frequency.setTargetAtTime(f, t, 0.03); }
  if (dur > 0.3) { const lg = v.lfo(a.frequency, 5.6, 0, t, end); lg.connect(b.frequency); lg.gain.setValueAtTime(0, t + 0.22); lg.gain.linearRampToValueAtTime(f * 0.009, t + 0.45); }
  const lp = v.filter('lowpass', f * 1.5, 1.3);
  lp.frequency.setValueAtTime(f * 1.3, t);
  lp.frequency.linearRampToValueAtTime(Math.min(f * 7, 9000), t + 0.05);
  lp.frequency.setTargetAtTime(Math.min(f * 4.5, 7000), t + 0.05, 0.12);
  const amp = v.gain(0);
  adsr(amp.gain, t, dur, 0.022, 0.15, 0.85, 0.08, vel * 0.13);
  a.connect(lp); b.connect(lp); v.conn(lp, amp, v.out);
  return v.done();
}
// Erhu-like bowed lead: saw through body resonances, portamento from `from`, wide late vibrato.
export function erhu(ctx, dest, t, { midi = 72, dur = 0.4, vel = 0.7, from = 0, pan = 0, send = 0.2 } = {}) {
  const v = new Voice(ctx, dest, t, send, pan);
  const f = mtof(midi), end = t + dur + 0.12;
  const o = v.osc('sawtooth', f, t, end);
  if (from) { o.frequency.setValueAtTime(mtof(from), t); o.frequency.setTargetAtTime(f, t, 0.028); }
  if (dur > 0.22) { const lg = v.lfo(o.detune, 6.2, 0, t, end); lg.gain.setValueAtTime(0, t + 0.12); lg.gain.linearRampToValueAtTime(30, t + Math.min(0.4, dur)); }
  const hp = v.filter('highpass', 260, 0.7), p1 = v.filter('peaking', 950, 1.6, 7), p2 = v.filter('peaking', 2500, 2, 5);
  const lp = v.filter('lowpass', 4200, 0.8), amp = v.gain(0);
  adsr(amp.gain, t, dur, from ? 0.02 : 0.05, 0.2, 0.9, 0.08, vel * 0.1);
  v.conn(o, hp, p1, p2, lp, amp, v.out);
  const n = v.noise(t, end), bp = v.filter('bandpass', 3000, 0.8), ng = v.gain(0);
  adsr(ng.gain, t, dur, 0.04, 0.1, 0.6, 0.06, vel * 0.08);
  v.conn(n, bp, ng, v.out);
  return v.done();
}
// Warm pad: detuned saw pairs per note through one slowly opening low-pass.
export function pad(ctx, dest, t, { midis = [62, 66, 69], dur = 2, vel = 0.5, attack = 0.6, release = 0.9, bright = 1, send = 0.35, pan = 0 } = {}) {
  const v = new Voice(ctx, dest, t, send, pan);
  const end = t + dur + release + 0.05;
  const lp = v.filter('lowpass', 400 * bright, 0.6);
  lp.frequency.setValueAtTime(350 * bright, t);
  lp.frequency.setTargetAtTime(1500 * bright, t, attack * 0.8);
  const amp = v.gain(0);
  adsr(amp.gain, t, dur, attack, 0, 1, release, (vel * 0.12) / Math.sqrt(midis.length));
  for (const m of midis) for (const det of [-8, 7]) {
    const o = v.osc('sawtooth', mtof(m), t, end);
    o.detune.value = det + rnd(-2, 2);
    o.connect(lp);
  }
  v.conn(lp, amp, v.out);
  return v.done();
}
// Celesta / temple bell: sine partials with a long shimmer.
export function bell(ctx, dest, t, { midi = 86, vel = 0.4, dur = 1.6, pan = 0, send = 0.45 } = {}) {
  const v = new Voice(ctx, dest, t, send, pan);
  const f = mtof(midi);
  for (const [r, a, d] of [[1, 1, 1], [2.0, 0.28, 0.5], [3.01, 0.12, 0.3], [4.17, 0.08, 0.2]]) {
    if (f * r > 16000) continue;
    const o = v.osc('sine', f * r, t, t + dur * d + 0.05), g = v.gain(0);
    perc(g.gain, t, vel * 0.16 * a, 0.002, dur * d);
    v.conn(o, g, v.out);
  }
  return v.done();
}
// Soft sine drone for the title track's bass.
export function drone(ctx, dest, t, { midi = 40, dur = 2, vel = 0.5, send = 0.1 } = {}) {
  const v = new Voice(ctx, dest, t, send);
  const f = mtof(midi), end = t + dur + 0.8;
  const a = v.osc('sine', f, t, end), b = v.osc('triangle', f * 2, t, end), bg = v.gain(0.22);
  const amp = v.gain(0);
  adsr(amp.gain, t, dur, 0.35, 0, 1, 0.7, vel * 0.3);
  a.connect(amp); v.conn(b, bg, amp); amp.connect(v.out);
  return v.done();
}
