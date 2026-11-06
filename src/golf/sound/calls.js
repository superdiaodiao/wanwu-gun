// The ambience's one-shot sounds (beds.js plays them now and then): birds, a far-off duck, hen, crow and
// dog, a leaf rustle, a sprinkler across the gardens, a drip in the pool, snow sliding off a branch.
// Each is (ctx, dest, t, r, o) and works in an OfflineAudioContext too: dest a bus (core.js mkBus: its
// `_wet` twin is the reverb send), t when it starts, r() a random number 0..1 (seeded in a test render),
// o { vel 0..1, pan -1..1 }. Every one is built on core.js Voice, which lets its nodes go once it ends.
import { Voice, perc, clamp } from '../../audio/core.js';
import { VOICES, formant } from '../../audio/voices.js';

const span = (r, a, b) => a + r() * (b - a);

/** a songbird far off in a tree: a short phrase on one whistle (kind 'chirp' | 'warble' | 'whistle') */
export function bird(ctx, dest, t, r, { vel = 0.5, pan = 0, kind = 'chirp', pitch = 1 } = {}) {
  const v = new Voice(ctx, dest, t, 0.25, pan);
  const o = v.osc('sine', 4000, t, t + 3), g = v.gain(0), f = o.frequency;
  g.gain.setValueAtTime(0, t);
  let tt = t;
  if (kind === 'warble') {
    // a quick run of notes, each with a little scoop
    const n = 5 + Math.floor(r() * 7);
    for (let i = 0; i < n; i++) {
      const a = span(r, 2600, 4800) * pitch, d = span(r, 0.045, 0.075);
      f.setValueAtTime(a * 0.9, tt);
      f.exponentialRampToValueAtTime(a * span(r, 1.02, 1.15), tt + d * 0.6);
      f.exponentialRampToValueAtTime(a * 0.95, tt + d);
      g.gain.setValueAtTime(0, tt);
      g.gain.linearRampToValueAtTime(vel * span(r, 0.5, 1), tt + 0.008);
      g.gain.linearRampToValueAtTime(0, tt + d);
      tt += d + span(r, 0.008, 0.03);
    }
  } else if (kind === 'whistle') {
    // two clear notes, the second lower ("fee-bee"), once or twice
    const a = span(r, 3500, 4100) * pitch, times = r() < 0.4 ? 2 : 1;
    for (let k = 0; k < times; k++) {
      for (const [ff, d] of [[a, 0.26], [a * 0.84, 0.3]]) {
        f.setValueAtTime(ff * 0.98, tt);
        f.linearRampToValueAtTime(ff, tt + d);
        g.gain.setValueAtTime(0, tt);
        g.gain.linearRampToValueAtTime(vel * 0.8, tt + 0.03);
        g.gain.setValueAtTime(vel * 0.8, tt + d - 0.05);
        g.gain.linearRampToValueAtTime(0, tt + d);
        tt += d + 0.07;
      }
      tt += 0.5;
    }
  } else {
    // chirp chirp chirp: quick falling sweeps
    const n = 2 + Math.floor(r() * 3), a = span(r, 3800, 5200) * pitch, gap = span(r, 0.09, 0.15);
    for (let i = 0; i < n; i++) {
      f.setValueAtTime(a, tt);
      f.exponentialRampToValueAtTime(a * 0.62, tt + 0.05);
      g.gain.setValueAtTime(0, tt);
      g.gain.linearRampToValueAtTime(vel, tt + 0.005);
      g.gain.exponentialRampToValueAtTime(vel * 0.01, tt + 0.055);
      g.gain.setValueAtTime(0, tt + 0.056);
      tt += gap;
    }
  }
  o.stop(tt + 0.05);
  o._t1 = tt + 0.05; v.end = tt + 0.05;
  v.conn(o, g, v.out);
  return v.done();
}

/** a duck on the far side of the pond */
export function duck(ctx, dest, t, r, { vel = 0.5, pan = 0 } = {}) {
  return VOICES.quack(ctx, dest, t, { vel, pitch: span(r, 0.9, 1.12), pan });
}

/** a hen in the next garden */
export function hen(ctx, dest, t, r, { vel = 0.5, pan = 0 } = {}) {
  return VOICES.cluck(ctx, dest, t, { vel, pitch: span(r, 0.92, 1.1), pan });
}

/** a dog a few streets away (one bark or two) */
export function dog(ctx, dest, t, r, { vel = 0.5, pan = 0 } = {}) {
  const v = VOICES.bark(ctx, dest, t, { vel, pitch: span(r, 0.85, 1.05), pan });
  return r() < 0.4 ? VOICES.bark(ctx, dest, t + span(r, 0.9, 1.4), { vel: vel * 0.8, pitch: span(r, 0.85, 1.05), pan }) : v;
}

/** a crow up in a tree: caw, caw (two to four), rough and falling */
export function crow(ctx, dest, t, r, { vel = 0.5, pan = 0 } = {}) {
  const n = 2 + Math.floor(r() * 3), p = span(r, 0.9, 1.08);
  let last;
  for (let i = 0; i < n; i++) {
    const tt = t + i * span(r, 0.42, 0.55), q = p * (1 - i * 0.02);
    last = formant(ctx, dest, tt, {
      dur: 0.3, src: 'sawtooth', f0: [[0, 560 * q], [0.05, 640 * q], [0.3, 470 * q]],
      vow: [[0, 'a'], [0.18, 'a'], [0.3, 'o']], amp: [[0, 0], [0.025, 1], [0.18, 0.75], [0.3, 0]],
      shift: 1.2, breath: 0.45, drive: 0.9, jitter: 45, gain: vel * (1 - i * 0.12), pan, send: 0.25,
    });
  }
  return last;
}

/** dry leaves stirred by a gust: a patter of tiny ticks, swelling and dying away over `dur` seconds */
export function rustle(ctx, dest, t, r, { vel = 0.5, pan = 0, dur = 1.2, f = 3200 } = {}) {
  const v = new Voice(ctx, dest, t, 0.1, pan);
  const n = v.noise(t, t + dur + 0.05), bp = v.filter('bandpass', f, 0.6), hp = v.filter('highpass', 1400, 0.7), g = v.gain(0);
  g.gain.setValueAtTime(0, t);
  let tt = t;
  while (tt < t + dur) {
    const x = (tt - t) / dur, env = Math.sin(Math.PI * x) ** 1.5, pk = vel * env * span(r, 0.25, 1), len = span(r, 0.006, 0.025);
    g.gain.setValueAtTime(0.0001, tt);
    g.gain.linearRampToValueAtTime(pk, tt + 0.002);
    g.gain.linearRampToValueAtTime(pk * 0.08, tt + len);
    tt += len + span(r, 0.004, 0.04);
  }
  g.gain.linearRampToValueAtTime(0, tt + 0.01);
  v.conn(n, bp, hp, g, v.out);
  return v.done();
}

/** an impact sprinkler a couple of gardens away: tick... tick... as it turns, then the quick ratchet back */
export function sprinkler(ctx, dest, t, r, { vel = 0.5, pan = 0 } = {}) {
  const v = new Voice(ctx, dest, t, 0.3, pan);
  const ticks = 14 + Math.floor(r() * 10), gap = span(r, 0.13, 0.17), back = span(r, 0.9, 1.4), end = t + ticks * gap + back + 0.2;
  const n = v.noise(t, end), bp = v.filter('bandpass', span(r, 3200, 4200), 1.6), g = v.gain(0);
  g.gain.setValueAtTime(0, t);
  let tt = t;
  // (louder as it turns towards us and quieter as it turns away)
  for (let i = 0; i < ticks; i++) {
    const face = 0.45 + 0.55 * Math.sin(Math.PI * (i / ticks)), pk = vel * face * span(r, 0.8, 1);
    g.gain.setValueAtTime(0.0001, tt);
    g.gain.linearRampToValueAtTime(pk, tt + 0.002);
    g.gain.exponentialRampToValueAtTime(pk * 0.02, tt + 0.03);
    tt += gap * span(r, 0.94, 1.06);
  }
  for (let e = tt + back; tt < e; tt += 0.034) {
    const pk = vel * 0.45 * span(r, 0.7, 1);
    g.gain.setValueAtTime(0.0001, tt);
    g.gain.linearRampToValueAtTime(pk, tt + 0.002);
    g.gain.exponentialRampToValueAtTime(pk * 0.05, tt + 0.02);
  }
  g.gain.setValueAtTime(0, tt + 0.03);
  v.conn(n, bp, g, v.out);
  // the spray's hiss under the ticks
  const h = v.noise(t, end), hp = v.filter('highpass', 5500, 0.7), hg = v.gain(0);
  hg.gain.setValueAtTime(0, t);
  hg.gain.linearRampToValueAtTime(vel * 0.12, t + 0.4);
  hg.gain.setValueAtTime(vel * 0.12, end - 0.6);
  hg.gain.linearRampToValueAtTime(0, end - 0.1);
  v.conn(h, hp, hg, v.out);
  return v.done();
}

/** a drip into the pool: a tiny rising bloop */
export function drip(ctx, dest, t, r, { vel = 0.5, pan = 0 } = {}) {
  const v = new Voice(ctx, dest, t, 0.3, pan);
  const f0 = span(r, 700, 1100), o = v.osc('sine', f0, t, t + 0.1), g = v.gain(0);
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(f0 * span(r, 1.8, 2.4), t + 0.03);
  perc(g.gain, t, vel, 0.002, 0.06);
  v.conn(o, g, v.out);
  return v.done();
}

/** snow slipping off a branch: a soft shush and a muffled flump */
export function snowfall(ctx, dest, t, r, { vel = 0.5, pan = 0 } = {}) {
  const v = new Voice(ctx, dest, t, 0.2, pan);
  const d = span(r, 0.5, 0.9);
  const n = v.noise(t, t + d + 0.3, 'pink'), lp = v.filter('lowpass', 2400, 0.6), g = v.gain(0);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vel * 0.5, t + d * 0.6);
  g.gain.setTargetAtTime(0, t + d * 0.6, d * 0.25);
  v.conn(n, lp, g, v.out);
  const th = v.osc('sine', 90, t + d, t + d + 0.25), tg = v.gain(0);
  th.frequency.setValueAtTime(110, t + d);
  th.frequency.exponentialRampToValueAtTime(60, t + d + 0.15);
  perc(tg.gain, t + d, clamp(vel * 0.9, 0, 1), 0.01, 0.18);
  v.conn(th, tg, v.out);
  return v.done();
}
