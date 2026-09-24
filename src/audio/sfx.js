// One-shot sound effects. Each is (ctx, dest, t, params) and works offline too.
import { Voice, mtof, clamp, lerp, rnd, pick, perc, pentaRange, mkBus } from './core.js';
import * as I from './instruments.js';
import { VOICES, choir } from './voices.js';

export const KEY_PC = 2; // D 宫: pickups, fanfares and the game track share one key
const POP_SCALE = pentaRange(KEY_PC, 57, 93); // A3 .. A6
const D69 = [62, 66, 69, 71, 76];

// ------------------------------------------------------------------ helpers
function partials(v, t, f, list, vel) {
  for (const [r, a, d] of list) {
    if (f * r > 18000) continue;
    const o = v.osc('sine', f * r, t, t + d + 0.02), g = v.gain(0);
    perc(g.gain, t, vel * a, 0.001, d);
    v.conn(o, g, v.out);
  }
}
function noiseHit(v, t, type, f, q, vel, a, d, color = 'white') {
  const n = v.noise(t, t + a + d + 0.02, color), fl = v.filter(type, f, q), g = v.gain(0);
  perc(g.gain, t, vel, a, d);
  v.conn(n, fl, g, v.out);
  return fl;
}
// a burst train on one gain param (rustles, crackles, gravel)
function crackle(g, t, n, vel, gap, len) {
  g.gain.setValueAtTime(0, t);
  let tt = t;
  for (let i = 0; i < n; i++) {
    const pk = vel * rnd(0.35, 1);
    g.gain.setValueAtTime(pk, tt);
    g.gain.exponentialRampToValueAtTime(pk * 0.03, tt + rnd(len[0], len[1]));
    tt += rnd(gap[0], gap[1]);
  }
  g.gain.setValueAtTime(0, tt + 0.005);
  return tt;
}

// ------------------------------------------------------------------ pickup core
// Katamari-ish "bloop": a sine that chirps up past the note and settles, an octave shimmer and
// a soft air puff. dir = -1 falls instead (things dropping off).
export function pop(ctx, dest, t, { freq = 600, vel = 0.7, pan = 0, dir = 1, weight = 0 } = {}) {
  const v = new Voice(ctx, dest, t, 0.08, pan);
  const o = v.osc('sine', freq, t, t + 0.27);
  o.frequency.setValueAtTime(freq * (dir > 0 ? 0.5 : 1.6), t);
  o.frequency.exponentialRampToValueAtTime(freq * (dir > 0 ? 1.15 : 0.9), t + 0.028);
  o.frequency.exponentialRampToValueAtTime(freq, t + 0.08);
  const g = v.gain(0); perc(g.gain, t, vel * 0.42, 0.004, 0.24);
  const o2 = v.osc('triangle', freq * 2, t, t + 0.13);
  o2.frequency.setValueAtTime(freq, t);
  o2.frequency.exponentialRampToValueAtTime(freq * 2.2, t + 0.03);
  o2.frequency.exponentialRampToValueAtTime(freq * 2, t + 0.07);
  const g2 = v.gain(0); perc(g2.gain, t, vel * 0.1, 0.003, 0.1);
  v.conn(o, g, v.out); v.conn(o2, g2, v.out);
  noiseHit(v, t, 'lowpass', 1800, 0.7, vel * 0.4, 0.001, 0.025, 'pink');
  if (weight > 0) { // extra low thud for big objects
    const s = v.osc('sine', 110, t, t + 0.25), sg = v.gain(0);
    s.frequency.setValueAtTime(120, t); s.frequency.exponentialRampToValueAtTime(55, t + 0.1);
    perc(sg.gain, t, vel * 0.25 * weight, 0.003, 0.2);
    v.conn(s, sg, v.out);
  }
  return v.done();
}

// ------------------------------------------------------------------ pickup characters
// o: { vel, p (pitch factor: smaller objects higher), pan }
export const CHAR = {
  tiny(ctx, d, t, o) { // glassy tick
    const v = new Voice(ctx, d, t, 0.15, o.pan);
    partials(v, t, 3200 * o.p * rnd(0.94, 1.06), [[1, 0.2, 0.09], [1.59, 0.1, 0.06], [2.37, 0.05, 0.04]], o.vel);
    return v.done();
  },
  soft(ctx, d, t, o) { // fluffy thump
    const v = new Voice(ctx, d, t, 0.08, o.pan);
    noiseHit(v, t, 'lowpass', 900 * o.p, 0.7, o.vel * 0.6, 0.006, 0.09, 'pink');
    partials(v, t, 170 * o.p, [[1, 0.22, 0.08]], o.vel);
    return v.done();
  },
  hard(ctx, d, t, o) { // plastic tock
    const v = new Voice(ctx, d, t, 0.1, o.pan);
    const f = 900 * o.p, s = v.osc('sine', f, t, t + 0.1), g = v.gain(0);
    s.frequency.setValueAtTime(f * 1.25, t); s.frequency.exponentialRampToValueAtTime(f, t + 0.015);
    perc(g.gain, t, o.vel * 0.28, 0.001, 0.07);
    v.conn(s, g, v.out);
    noiseHit(v, t, 'bandpass', 2200 * o.p, 1.5, o.vel * 0.7, 0.0008, 0.02);
    return v.done();
  },
  metal(ctx, d, t, o) { // clang partials
    const v = new Voice(ctx, d, t, 0.2, o.pan);
    partials(v, t, 560 * o.p * rnd(0.95, 1.05), [[1, 0.12, 0.7], [1.007, 0.07, 0.6], [2.76, 0.08, 0.45], [5.4, 0.05, 0.3], [8.93, 0.03, 0.2]], o.vel);
    noiseHit(v, t, 'highpass', 3000, 0.7, o.vel * 0.35, 0.0005, 0.015);
    return v.done();
  },
  glass(ctx, d, t, o) { // clink-clink
    const v = new Voice(ctx, d, t, 0.22, o.pan);
    const f = 2100 * o.p * rnd(0.96, 1.04), L = [[1, 0.13, 0.35], [2.32, 0.07, 0.25], [4.25, 0.04, 0.15], [6.63, 0.025, 0.1]];
    partials(v, t, f, L, o.vel);
    partials(v, t + 0.065, f * 1.07, L, o.vel * 0.5);
    noiseHit(v, t, 'highpass', 5000, 0.7, o.vel * 0.2, 0.0005, 0.01);
    return v.done();
  },
  paper(ctx, d, t, o) { // rustle
    const v = new Voice(ctx, d, t, 0.06, o.pan);
    const n = v.noise(t, t + 0.35), bp = v.filter('bandpass', 3500 * o.p, 0.7), g = v.gain(0);
    crackle(g, t, 6, o.vel * 0.9, [0.03, 0.055], [0.015, 0.028]);
    v.conn(n, bp, g, v.out);
    return v.done();
  },
  wood(ctx, d, t, o) { // knock
    const v = new Voice(ctx, d, t, 0.12, o.pan);
    const f = 420 * o.p, s = v.osc('sine', f, t, t + 0.12), g = v.gain(0);
    s.frequency.setValueAtTime(f * 1.2, t); s.frequency.exponentialRampToValueAtTime(f, t + 0.01);
    perc(g.gain, t, o.vel * 0.38, 0.001, 0.1);
    v.conn(s, g, v.out);
    partials(v, t, f, [[2.41, 0.1, 0.035]], o.vel);
    noiseHit(v, t, 'bandpass', 1300 * o.p, 1, o.vel * 0.45, 0.0008, 0.014);
    return v.done();
  },
  squish(ctx, d, t, o) { // wet blob: falling sine, resonant closing noise, a bubble
    const v = new Voice(ctx, d, t, 0.08, o.pan);
    const f = 480 * o.p, s = v.osc('sine', f, t, t + 0.22), g = v.gain(0);
    s.frequency.setValueAtTime(f, t); s.frequency.exponentialRampToValueAtTime(f * 0.3, t + 0.16);
    perc(g.gain, t, o.vel * 0.35, 0.004, 0.18);
    v.conn(s, g, v.out);
    const n = v.noise(t, t + 0.2, 'pink'), lp = v.filter('lowpass', 2800, 5), ng = v.gain(0);
    lp.frequency.setValueAtTime(2800 * o.p, t); lp.frequency.exponentialRampToValueAtTime(300, t + 0.15);
    perc(ng.gain, t, o.vel * 0.45, 0.005, 0.15);
    v.conn(n, lp, ng, v.out);
    const b = v.osc('sine', 300 * o.p, t + 0.06, t + 0.14), bg = v.gain(0);
    b.frequency.setValueAtTime(300 * o.p, t + 0.06); b.frequency.exponentialRampToValueAtTime(950 * o.p, t + 0.1);
    perc(bg.gain, t + 0.06, o.vel * 0.14, 0.002, 0.05);
    v.conn(b, bg, v.out);
    return v.done();
  },
  crash(ctx, d, t, o) { // noise burst + low thud + debris
    const v = new Voice(ctx, d, t, 0.2, o.pan);
    noiseHit(v, t, 'bandpass', 1400 * o.p, 0.6, o.vel * 0.72, 0.002, 0.45);
    noiseHit(v, t, 'highpass', 4000, 0.7, o.vel * 0.5, 0.001, 0.25);
    const s = v.osc('sine', 95 * o.p, t, t + 0.4), g = v.gain(0);
    s.frequency.setValueAtTime(95 * o.p, t); s.frequency.exponentialRampToValueAtTime(42 * o.p, t + 0.12);
    perc(g.gain, t, o.vel * 0.4, 0.002, 0.35);
    v.conn(s, g, v.out);
    for (let i = 0; i < 4; i++) partials(v, t + rnd(0.05, 0.35), rnd(1500, 4000), [[1, 0.05, 0.08], [2.7, 0.02, 0.05]], o.vel);
    return v.done();
  },
  rumble(ctx, d, t, o) { // low rolling rumble + thud + gravel
    const v = new Voice(ctx, d, t, 0.2, o.pan);
    const n = v.noise(t, t + 0.9, 'brown'), lp = v.filter('lowpass', 240 * o.p, 0.8), trem = v.gain(0.6), g = v.gain(0);
    v.lfo(trem.gain, 7, 0.4, t, t + 0.9);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(o.vel * 0.8, t + 0.05);
    g.gain.setTargetAtTime(0, t + 0.25, 0.12);
    v.conn(n, lp, trem, g, v.out);
    const s = v.osc('sine', 70 * o.p, t, t + 0.6), sg = v.gain(0);
    s.frequency.setValueAtTime(70 * o.p, t); s.frequency.exponentialRampToValueAtTime(34, t + 0.3);
    perc(sg.gain, t, o.vel * 0.4, 0.004, 0.5);
    v.conn(s, sg, v.out);
    const gn = v.noise(t, t + 0.8), gbp = v.filter('bandpass', 900, 0.8), gg = v.gain(0);
    crackle(gg, t + 0.02, 7, o.vel * 0.3, [0.04, 0.08], [0.02, 0.035]);
    v.conn(gn, gbp, gg, v.out);
    return v.done();
  },
  splash(ctx, d, t, o) { // water plop: bubble chirp + splash noise + droplets
    const v = new Voice(ctx, d, t, 0.18, o.pan);
    const f = 520 * o.p, s = v.osc('sine', f, t, t + 0.12), g = v.gain(0);
    s.frequency.setValueAtTime(f, t); s.frequency.exponentialRampToValueAtTime(f * 3, t + 0.035);
    perc(g.gain, t, o.vel * 0.3, 0.002, 0.08);
    v.conn(s, g, v.out);
    const n = v.noise(t, t + 0.3), bp = v.filter('bandpass', 2200, 0.7), ng = v.gain(0);
    bp.frequency.setValueAtTime(3200, t); bp.frequency.exponentialRampToValueAtTime(900, t + 0.2);
    perc(ng.gain, t + 0.005, o.vel * 0.9, 0.004, 0.22);
    v.conn(n, bp, ng, v.out);
    for (let i = 0; i < 3; i++) {
      const tt = t + 0.07 + i * 0.05 + rnd(0, 0.03), ff = rnd(1300, 2600) * o.p, b = v.osc('sine', ff, tt, tt + 0.07), bg = v.gain(0);
      b.frequency.setValueAtTime(ff, tt); b.frequency.exponentialRampToValueAtTime(ff * 1.8, tt + 0.03);
      perc(bg.gain, tt, o.vel * 0.1, 0.001, 0.05);
      v.conn(b, bg, v.out);
    }
    return v.done();
  },
  gong(ctx, d, t, o) { return I.gong(ctx, d, t, { f: clamp(130 * o.p, 70, 200), vel: Math.min(1, o.vel * 1.35), dur: 2.8, pan: o.pan }); },
  horn(ctx, d, t, o) { // two-tone "beep-beep"
    const v = new Voice(ctx, d, t, 0.1, o.pan);
    const mix = v.gain(0.6), lp = v.filter('lowpass', 2400, 0.7), sh = v.shaper(0.4), pk2 = v.filter('peaking', 1100, 1, 5), env = v.gain(0);
    for (const f of [415, 523]) v.osc('square', f * o.p, t, t + 0.5).connect(mix);
    const pk = o.vel * 0.2;
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(pk, t + 0.01); env.gain.setValueAtTime(pk, t + 0.12); env.gain.linearRampToValueAtTime(0, t + 0.135);
    env.gain.setValueAtTime(0, t + 0.19); env.gain.linearRampToValueAtTime(pk, t + 0.2); env.gain.setValueAtTime(pk, t + 0.44); env.gain.linearRampToValueAtTime(0, t + 0.47);
    v.conn(mix, lp, sh, pk2, env, v.out);
    return v.done();
  },
  bell(ctx, d, t, o) { // bicycle bell 叮铃铃: rapid re-strikes then ring-out
    const v = new Voice(ctx, d, t, 0.25, o.pan);
    const f = 2350 * clamp(o.p, 0.8, 1.25), env = v.gain(0), mix = v.gain(1);
    for (const [r, a] of [[1, 1], [1.003, 0.6], [1.46, 0.45], [2.13, 0.3], [2.7, 0.2]]) { const s = v.osc('sine', f * r, t, t + 1.0), g = v.gain(a); v.conn(s, g, mix); }
    const pk = o.vel * 0.16;
    env.gain.setValueAtTime(0, t);
    for (let i = 0; i < 5; i++) { const tt = t + i * 0.045, k = pk * (1 - i * 0.12); env.gain.setValueAtTime(k, tt); env.gain.exponentialRampToValueAtTime(k * 0.4, tt + 0.04); }
    env.gain.exponentialRampToValueAtTime(pk * 1e-4, t + 0.95);
    v.conn(mix, env, v.out);
    return v.done();
  },
};
export const PICKUP_KEYS = [...Object.keys(CHAR), ...Object.keys(VOICES)];
// keys accepted by audio.voice(): the formant voices plus a few non-vocal calls
export const CALL_KEYS = [...Object.keys(VOICES), 'horn', 'bell', 'splash'];

// Voice-only character call (no pop): screams, animals, horn, bell.
export function characterVoice(ctx, dest, t, key, { vel = 0.8, pitch = 1, pan = 0 } = {}) {
  if (VOICES[key]) return VOICES[key](ctx, dest, t, { vel, pitch: clamp(pitch, 0.8, 1.25), pan });
  if (CALL_KEYS.includes(key)) return CHAR[key](ctx, dest, t, { vel, p: pitch, pan });
  return null;
}

// rel = object size / ball diameter (0.02..0.7): smaller -> higher & quieter.
// size = object size in metres (bigger -> lower character layers). combo climbs the scale.
export function pickupSound(ctx, dest, t, { key = 'hard', rel = 0.1, size = 0.5, combo = 0, character = true, pan = rnd(-0.25, 0.25) } = {}) {
  const r = clamp(Math.log(clamp(rel, 0.004, 2) / 0.02) / Math.log(35), 0, 1);
  const vol = lerp(0.4, 1, r);
  // a streak climbs the scale (and stays up there once it's long)
  const idx = clamp(Math.round(lerp(13, 0, r)) + Math.min(combo, 9) + (Math.random() < 0.3 ? 1 : 0), 0, POP_SCALE.length - 1);
  pop(ctx, dest, t, { freq: mtof(POP_SCALE[idx]), vel: 0.85 * vol, pan, weight: clamp((r - 0.55) * 2.2) });
  if (!character) return;
  const p = clamp(Math.pow(0.5 / clamp(size || 0.5, 0.005, 5000), 0.12), 0.55, 1.6);
  if (VOICES[key]) VOICES[key](ctx, dest, t + 0.015, { vel: 0.55 + 0.45 * vol, pitch: clamp(p, 0.85, 1.2), pan });
  else (CHAR[key] || CHAR.hard)(ctx, dest, t + 0.005, { vel: vol, p, pan });
}

// ------------------------------------------------------------------ gameplay
export function bump(ctx, dest, t, { strength = 0.5, pan = 0 } = {}) {
  const s = clamp(strength);
  const v = new Voice(ctx, dest, t, 0.1, pan);
  const o = v.osc('sine', 130, t, t + 0.35), g = v.gain(0);
  o.frequency.setValueAtTime(130, t); o.frequency.exponentialRampToValueAtTime(48, t + 0.12);
  perc(g.gain, t, 0.25 + 0.4 * s, 0.002, 0.3);
  v.conn(o, g, v.out);
  noiseHit(v, t, 'lowpass', 700, 0.7, 0.35 + 0.5 * s, 0.001, 0.07, 'pink');
  if (s > 0.25) { // comedic spring "boyoyoing"
    const b = v.osc('triangle', 150, t + 0.01, t + 0.5), bg = v.gain(0);
    b.frequency.setValueAtTime(150, t + 0.01); b.frequency.linearRampToValueAtTime(240, t + 0.45);
    const w = v.lfo(b.frequency, 16, 0, t, t + 0.5);
    w.gain.setValueAtTime(45 * s, t); w.gain.exponentialRampToValueAtTime(3, t + 0.45);
    perc(bg.gain, t + 0.01, 0.12 + 0.14 * s, 0.005, 0.42);
    v.conn(b, bg, v.out);
  }
  return v.done();
}

// Items knocked off the ball: cartoon "uh-oh" + falling pops.
export function knock(ctx, dest, t, { count = 1 } = {}) {
  const n = clamp(Math.round(count) || 1, 1, 6);
  const v = new Voice(ctx, dest, t, 0.12);
  const o = v.osc('triangle', 520, t, t + 0.5), lp = v.filter('lowpass', 1800, 1), g = v.gain(0);
  o.frequency.setValueAtTime(560, t); o.frequency.exponentialRampToValueAtTime(500, t + 0.12);
  o.frequency.setValueAtTime(430, t + 0.15); o.frequency.exponentialRampToValueAtTime(250, t + 0.42);
  v.lfo(o.detune, 7, 25, t + 0.15, t + 0.5);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(0.3, t + 0.012); g.gain.linearRampToValueAtTime(0.24, t + 0.11); g.gain.linearRampToValueAtTime(0.02, t + 0.135);
  g.gain.linearRampToValueAtTime(0.3, t + 0.16); g.gain.linearRampToValueAtTime(0.18, t + 0.34); g.gain.linearRampToValueAtTime(0, t + 0.45);
  v.conn(o, lp, g, v.out);
  v.done();
  const notes = [81, 78, 76, 74, 71, 69];
  for (let i = 0; i < n; i++) pop(ctx, dest, t + 0.06 + i * 0.065 + rnd(0, 0.02), { freq: mtof(notes[i]), vel: 0.42, pan: rnd(-0.6, 0.6), dir: -1 });
}

export function dash(ctx, dest, t) {
  const v = new Voice(ctx, dest, t, 0.2);
  const n = v.noise(t, t + 0.6, 'pink'), bp = v.filter('bandpass', 500, 1.2), g = v.gain(0), p = v.pan(-0.6);
  bp.frequency.setValueAtTime(400, t); bp.frequency.exponentialRampToValueAtTime(2600, t + 0.18); bp.frequency.exponentialRampToValueAtTime(700, t + 0.5);
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(1.4, t + 0.12); g.gain.setTargetAtTime(0, t + 0.18, 0.1);
  p.pan.setValueAtTime(-0.6, t); p.pan.linearRampToValueAtTime(0.6, t + 0.45);
  v.conn(n, bp, g, p, v.out);
  const o = v.osc('sine', 260, t, t + 0.35), og = v.gain(0);
  o.frequency.setValueAtTime(260, t); o.frequency.exponentialRampToValueAtTime(900, t + 0.15); o.frequency.exponentialRampToValueAtTime(500, t + 0.3);
  perc(og.gain, t, 0.14, 0.05, 0.25);
  v.conn(o, og, v.out);
  return v.done();
}

// Pickup streak, every ten: three quick bright plucks and a woodblock, climbing with the level.
export function comboChime(ctx, out, t, { level = 1 } = {}) {
  const L = clamp(Math.round(level) || 1, 1, 8);
  const dest = mkBus(ctx, out, 0.85);
  const scale = pentaRange(KEY_PC, 72, 106);
  for (let i = 0; i < 3; i++) {
    I.pluck(ctx, dest, t + i * 0.06, { midi: scale[Math.min(scale.length - 1, L - 1 + i * 2)], vel: 0.5 + 0.12 * i, dur: 0.28, pan: -0.25 + 0.25 * i, send: 0.3 });
  }
  I.woodblock(ctx, dest, t, { pitch: 1.35, vel: 0.4 });
  if (L >= 3) I.woodblock(ctx, dest, t + 0.12, { pitch: 1.6, vel: 0.35 });
}

// Size milestone fanfare: quick pentatonic run then a held "ta-da"; grander with level.
export function milestone(ctx, out, t, { level = 1 } = {}) {
  const L = clamp(Math.round(level) || 1, 1, 8);
  const dest = mkBus(ctx, out, 0.95 - 0.05 * L);
  const scale = pentaRange(KEY_PC, 62, 100);
  const n = 3 + Math.floor(L / 2), sp = 0.07;
  for (let i = 0; i < n; i++) I.pluck(ctx, dest, t + i * sp, { midi: scale[L - 1 + i], vel: 0.5 + 0.04 * i, dur: 0.3, pan: -0.3 + (0.6 * i) / n, send: 0.25 });
  const th = t + n * sp + 0.02, top = scale[L - 1 + n], hold = 0.3 + L * 0.05;
  I.pluck(ctx, dest, th, { midi: top, vel: 0.8, dur: hold + 0.1, send: 0.3 });
  I.woodblock(ctx, dest, th, { pitch: 1.2, vel: 0.5 });
  if (L >= 2) for (const m of D69) I.epiano(ctx, dest, th, { midi: m + (L >= 5 ? 12 : 0), dur: hold, vel: 0.45 });
  if (L >= 3) I.dizi(ctx, dest, th, { midi: top, dur: hold, vel: 0.75, scoop: 0.6 });
  if (L >= 3) I.bass(ctx, dest, th, { midi: 38, dur: hold, vel: 0.7 });
  if (L >= 4) I.smallGong(ctx, dest, th, { vel: 0.55, dur: 0.7 });
  if (L >= 5) I.cymbal(ctx, dest, th, { vel: 0.4, dur: 0.9 });
  if (L >= 6) { I.kick(ctx, dest, th, { vel: 0.8 }); I.pluck(ctx, dest, th + 0.2, { midi: top + 12 > 100 ? top : top + 12, vel: 0.6 }); }
  if (L >= 7) I.gliss(ctx, dest, th, { from: 74, to: 98, span: 0.35, vel: 0.35 });
  if (L >= 8) { I.gong(ctx, dest, th, { f: 110, vel: 0.7, dur: 3 }); choir(ctx, dest, th, { midis: [62, 69, 74, 78], dur: 0.9, vel: 0.4, attack: 0.15, release: 0.8 }); }
}

export function tick(ctx, dest, t, { secondsLeft = 5 } = {}) {
  const s = clamp(Math.ceil(secondsLeft), 0, 10), urgent = s <= 3;
  const f = 880 * Math.pow(2, (10 - s) / 12);
  const v = new Voice(ctx, dest, t, 0.08);
  for (const dt of urgent ? [0, 0.11] : [0]) {
    const o = v.osc('square', f, t + dt, t + dt + 0.12), lp = v.filter('lowpass', f * 3, 0.7), g = v.gain(0);
    perc(g.gain, t + dt, urgent ? 0.15 : 0.1, 0.002, urgent ? 0.09 : 0.07);
    v.conn(o, lp, g, v.out);
  }
  v.done();
  I.woodblock(ctx, dest, t, { pitch: urgent ? 1.9 : 1.6, vel: urgent ? 0.6 : 0.4 });
}

export function timeUp(ctx, dest, t) {
  I.cymbal(ctx, dest, t, { vel: 0.6, dur: 1.2 });
  I.gong(ctx, dest, t, { f: 150, vel: 0.6, dur: 2.2, glide: -0.08 });
  I.kick(ctx, dest, t, { vel: 0.9 });
  I.gliss(ctx, dest, t + 0.08, { from: 86, to: 62, span: 0.5, vel: 0.5 });
  I.bass(ctx, dest, t + 0.62, { midi: 38, dur: 0.45, vel: 0.8 });
  I.woodblock(ctx, dest, t + 0.62, { pitch: 0.8, vel: 0.7 });
}

export function ui(ctx, dest, t, kind = 'click') {
  switch (kind) {
    case 'hover': {
      const v = new Voice(ctx, dest, t), o = v.osc('sine', 1900, t, t + 0.05), g = v.gain(0);
      perc(g.gain, t, 0.2, 0.002, 0.035);
      v.conn(o, g, v.out);
      return v.done();
    }
    case 'open':
      I.pluck(ctx, dest, t, { midi: 69, vel: 0.8, dur: 0.35 });
      return I.pluck(ctx, dest, t + 0.06, { midi: 74, vel: 0.9, dur: 0.45 });
    case 'close':
      I.pluck(ctx, dest, t, { midi: 74, vel: 0.8, dur: 0.35 });
      return I.pluck(ctx, dest, t + 0.06, { midi: 69, vel: 0.75, dur: 0.45 });
    case 'start':
      I.gliss(ctx, dest, t, { from: 62, to: 86, span: 0.32, vel: 0.5 });
      I.smallGong(ctx, dest, t + 0.36, { vel: 0.6 });
      I.cymbal(ctx, dest, t + 0.36, { vel: 0.3, dur: 0.8 });
      for (const m of D69) I.pluck(ctx, dest, t + 0.36, { midi: m + 12, vel: 0.35 });
      return null;
    case 'pause':
      I.epiano(ctx, dest, t, { midi: 69, dur: 0.15, vel: 1 });
      return I.epiano(ctx, dest, t + 0.12, { midi: 62, dur: 0.35, vel: 1 });
    default: // click
      pop(ctx, dest, t, { freq: 1175, vel: 0.3 });
      return I.woodblock(ctx, dest, t, { pitch: 1.7, vel: 0.5, send: 0.05 });
  }
}

// ------------------------------------------------------------------ finale
export function launch(ctx, dest, t) {
  const D = 3;
  const v = new Voice(ctx, dest, t, 0.35);
  const n = v.noise(t, t + D + 0.3, 'pink'), bp = v.filter('bandpass', 150, 1), g = v.gain(0);
  bp.frequency.setValueAtTime(150, t); bp.frequency.exponentialRampToValueAtTime(5000, t + D);
  bp.Q.setValueAtTime(0.8, t); bp.Q.linearRampToValueAtTime(3, t + D);
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.5, t + 0.4); g.gain.linearRampToValueAtTime(1.0, t + D - 0.2); g.gain.linearRampToValueAtTime(0, t + D + 0.25);
  v.conn(n, bp, g, v.out);
  const lp = v.filter('lowpass', 400, 1), eg = v.gain(0);
  for (const det of [-10, 10]) {
    const o = v.osc('sawtooth', 70, t, t + D + 0.3);
    o.detune.value = det;
    o.frequency.setValueAtTime(70, t); o.frequency.exponentialRampToValueAtTime(560, t + D);
    o.connect(lp);
  }
  lp.frequency.setValueAtTime(400, t); lp.frequency.exponentialRampToValueAtTime(3500, t + D);
  eg.gain.setValueAtTime(0, t); eg.gain.linearRampToValueAtTime(0.05, t + 0.5); eg.gain.linearRampToValueAtTime(0.09, t + D - 0.1); eg.gain.linearRampToValueAtTime(0, t + D + 0.2);
  v.conn(lp, eg, v.out);
  v.done();
  choir(ctx, dest, t + 0.1, { midis: [50, 62, 69, 74, 78], dur: D - 0.3, vel: 0.55, vowel: 'u', toVowel: 'a', attack: D - 0.4, release: 0.6 });
  pentaRange(KEY_PC, 81, 100).forEach((m, i) => I.bell(ctx, dest, t + D - 1.0 + i * 0.1, { midi: m, vel: 0.25 + 0.03 * i, dur: 0.8, pan: rnd(-0.5, 0.5) }));
  I.cymbal(ctx, dest, t + D, { vel: 0.45, dur: 1.2 });
}

export function patch(ctx, dest, t) {
  I.gong(ctx, dest, t, { f: 98, vel: 1, dur: 4.2, glide: -0.05, send: 0.55 });
  I.gliss(ctx, dest, t + 0.05, { from: 62, to: 93, span: 0.6, vel: 0.45 });
  I.pad(ctx, dest, t + 0.1, { midis: [50, 57, 62, 66, 69, 71, 76, 78], dur: 2.6, vel: 0.7, attack: 0.5, release: 1.2, bright: 1.3 });
  choir(ctx, dest, t + 0.15, { midis: [62, 66, 69, 74], dur: 2.4, vel: 0.45, vowel: 'a', attack: 0.6, release: 1.2 });
  const hi = pentaRange(KEY_PC, 81, 98);
  for (let i = 0; i < 14; i++) I.bell(ctx, dest, t + 0.3 + i * 0.2 + rnd(0, 0.08), { midi: pick(hi), vel: 0.22 + rnd(0, 0.1), dur: 1.2, pan: rnd(-0.7, 0.7) });
}

export function fireworks(ctx, dest, t) {
  const w = new Voice(ctx, dest, t, 0.15, rnd(-0.4, 0.4)); // whistle up
  const o = w.osc('sine', 1400, t, t + 0.34), og = w.gain(0);
  o.frequency.setValueAtTime(1400, t); o.frequency.exponentialRampToValueAtTime(2900, t + 0.3);
  og.gain.setValueAtTime(0, t); og.gain.linearRampToValueAtTime(0.06, t + 0.2); og.gain.linearRampToValueAtTime(0, t + 0.32);
  w.conn(o, og, w.out);
  w.done();
  for (const dt of [0.3, 0.62 + rnd(0, 0.08), 0.95 + rnd(0, 0.1)]) {
    const tt = t + dt, v = new Voice(ctx, dest, tt, 0.3, rnd(-0.6, 0.6));
    const n = v.noise(tt, tt + 0.55, 'pink'), lp = v.filter('lowpass', 1500, 0.8), g = v.gain(0);
    lp.frequency.setValueAtTime(1600, tt); lp.frequency.exponentialRampToValueAtTime(250, tt + 0.4);
    perc(g.gain, tt, 0.7, 0.002, 0.5);
    v.conn(n, lp, g, v.out);
    const s = v.osc('sine', 80, tt, tt + 0.4), sg = v.gain(0);
    s.frequency.setValueAtTime(90, tt); s.frequency.exponentialRampToValueAtTime(40, tt + 0.2);
    perc(sg.gain, tt, 0.3, 0.002, 0.35);
    v.conn(s, sg, v.out);
    const c = v.noise(tt + 0.08, tt + 0.75), hp = v.filter('highpass', 3000, 0.7), cg = v.gain(0);
    crackle(cg, tt + 0.1, 16, 0.35, [0.02, 0.05], [0.004, 0.009]);
    v.conn(c, hp, cg, v.out);
    v.done();
  }
}

// ------------------------------------------------------------------ misc
// "Wikka-wikka" record scratch (the loudspeaker got rolled up).
export function scratch(ctx, dest, t) {
  const v = new Voice(ctx, dest, t, 0.1);
  const o = v.osc('sawtooth', 200, t, t + 0.55), bp = v.filter('bandpass', 1200, 1.5), g = v.gain(0);
  const pts = [[0, 180], [0.07, 620], [0.16, 140], [0.24, 560], [0.45, 90]];
  o.frequency.setValueAtTime(pts[0][1], t);
  bp.frequency.setValueAtTime(pts[0][1] * 4, t);
  for (const [dt, f] of pts.slice(1)) { o.frequency.linearRampToValueAtTime(f, t + dt); bp.frequency.linearRampToValueAtTime(f * 4, t + dt); }
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(0.4, t + 0.01);
  for (const dt of [0.07, 0.16, 0.24]) { g.gain.linearRampToValueAtTime(0.1, t + dt); g.gain.linearRampToValueAtTime(0.4, t + dt + 0.02); }
  g.gain.linearRampToValueAtTime(0, t + 0.5);
  v.conn(o, bp, g, v.out);
  const n = v.noise(t, t + 0.55), nb = v.filter('bandpass', 2500, 1), ng = v.gain(0.6);
  v.conn(n, nb, ng, g);
  return v.done();
}
