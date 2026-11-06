// Each look's ambience bed: what you hear round the yard under the music, quiet enough to be noticed
// only when it stops. A bed is a few sounds that never stop (wind in the trees, the pool lapping,
// crickets: `loops`, a handful of nodes each) and one-shots now and then at random (birds, a duck, a hen,
// a crow, a far-off dog, leaves, a sprinkler: `events`, calls.js). makeBed(ctx, dest, look, t0, fade)
// starts one, fading in over `fade` seconds; bed.tick(until, now) puts in whatever comes before `until`
// (called every frame a little ahead: sound/index.js), bed.duck(speed, now) dips it while the ball
// rolls, bed.stop(t, fade) fades it out and lets its nodes go. A look not listed here gets the duck
// pond's. Works in an OfflineAudioContext too (r: a seeded random, for the test renders).
import { mkBus, busTarget, busKill, noiseBuf, cached, prng, lerp } from '../../audio/core.js';
import * as C from './calls.js';

const span = (r, [a, b]) => a + r() * (b - a);

// ---- the sounds that never stop -----------------------------------------------------------------------
/** wind: looped noise through a filter, swelling and dropping in gusts every few seconds (a louder
 *  gust is a brighter one) */
function wind(ctx, out, t0, r, { color = 'pink', type = 'lowpass', f = [400, 900], q = 0.7, level = 0.1, swell = [0.3, 1], every = [3, 7] }) {
  const src = ctx.createBufferSource(), fl = ctx.createBiquadFilter(), g = ctx.createGain();
  src.buffer = noiseBuf(ctx, color);
  src.loop = true;
  src.playbackRate.value = 0.9 + r() * 0.2;
  fl.type = type; fl.frequency.value = f[0]; fl.Q.value = q;
  g.gain.value = level * swell[0];
  src.connect(fl); fl.connect(g); g.connect(out);
  src.start(t0, r() * 1.9);
  let next = t0;
  return {
    nodes: [src, fl, g],
    tick(until, now) {
      if (next < now - 0.1) next = now; // (after a stall: on from now, not every gust missed at once)
      while (next < until) {
        const d = span(r, every), x = r();
        g.gain.setTargetAtTime(level * lerp(swell[0], swell[1], x), next, d / 3);
        fl.frequency.setTargetAtTime(lerp(f[0], f[1], 0.7 * x + 0.3 * r()), next, d / 3);
        next += d;
      }
    },
    stop(t) { src.stop(t); },
  };
}

/** the pool's water slapping softly at its edge: a swell of filtered noise every second or two */
function lap(ctx, out, t0, r, { level = 0.1, every = [1.1, 2.4] }) {
  const src = ctx.createBufferSource(), bp = ctx.createBiquadFilter(), lp = ctx.createBiquadFilter(), g = ctx.createGain();
  src.buffer = noiseBuf(ctx, 'pink');
  src.loop = true;
  bp.type = 'bandpass'; bp.frequency.value = 520; bp.Q.value = 1.1;
  lp.type = 'lowpass'; lp.frequency.value = 1400; lp.Q.value = 0.5;
  g.gain.value = level * 0.15;
  src.connect(bp); bp.connect(lp); lp.connect(g); g.connect(out);
  src.start(t0, r() * 1.9);
  let next = t0 + 0.3;
  return {
    nodes: [src, bp, lp, g],
    tick(until, now) {
      if (next < now - 0.1) next = now;
      while (next < until) {
        g.gain.setTargetAtTime(level * (0.55 + 0.45 * r()), next, 0.16);
        g.gain.setTargetAtTime(level * 0.12, next + 0.4, 0.45);
        bp.frequency.setTargetAtTime(380 + 340 * r(), next, 0.25);
        next += span(r, every);
      }
    },
    stop(t) { src.stop(t); },
  };
}

// crickets: three of them at their own pitch and pace, made once into a 3 s stereo loop (every pace
// divides 3 s, so it loops without a seam)
function cricketBuf(ctx) {
  return cached(ctx, 'golf:crickets', c => {
    const sr = c.sampleRate, T = 3, len = Math.floor(sr * T), buf = c.createBuffer(2, len, sr);
    const L = buf.getChannelData(0), R = buf.getChannelData(1), r = prng(4242);
    const bugs = [
      { f: 4650, every: 0.5, pulses: 3, pp: 0.022, pan: [0.9, 0.35], k: 1 },
      { f: 4180, every: 0.75, pulses: 4, pp: 0.02, pan: [0.3, 0.85], k: 0.8 },
      { f: 5080, every: 0.375, pulses: 2, pp: 0.024, pan: [0.55, 0.55], k: 0.4 },
    ];
    for (const b of bugs) {
      const phase = r() * (b.every - b.pulses * b.pp - 0.02), w = (2 * Math.PI * b.f) / sr;
      for (let s = phase; s + b.pulses * b.pp < T; s += b.every) {
        const a = b.k * (0.65 + 0.35 * r());
        for (let p = 0; p < b.pulses; p++) {
          const i0 = Math.floor((s + p * b.pp) * sr), n = Math.floor(b.pp * 0.62 * sr);
          for (let i = 0; i < n && i0 + i < len; i++) {
            const v = a * Math.sin((Math.PI * i) / n) ** 2 * Math.sin(w * (i0 + i));
            L[i0 + i] += v * b.pan[0];
            R[i0 + i] += v * b.pan[1];
          }
        }
      }
    }
    return buf;
  });
}
function crickets(ctx, out, t0, r, { level = 0.05 }) {
  const src = ctx.createBufferSource(), g = ctx.createGain();
  src.buffer = cricketBuf(ctx);
  src.loop = true;
  g.gain.value = level;
  src.connect(g); g.connect(out);
  src.start(t0, r() * 2.9);
  return { nodes: [src, g], tick() {}, stop(t) { src.stop(t); } };
}

// ---- the beds -------------------------------------------------------------------------------------------
// level: the whole bed's gain; far: the low-pass (Hz) on things heard from further off (`far: true`);
// loops: [maker, options]; events: { play, every: [s, s] between them, vel: [lo, hi], far, o: options }.
// The loops are just loud enough to come through the music now and then (a gust's floor kept up, so
// they don't drop out between gusts); a bed's loudest 400 ms stays 3 dB or more under a soft putt's, and
// while the ball rolls the whole bed dips (DUCK) so the roll stays on top of the breeze. Calls like the
// hen and the crow come rarely: with the music off they would soon be 'that hen again'.
const birds = kinds => (ctx, d, t, r, o) => C.bird(ctx, d, t, r, { ...o, kind: kinds[Math.floor(r() * kinds.length)] });
export const BEDS = {
  // the duck pond at midday: a light breeze, birds in the trees, a duck now and then
  pond: {
    level: 1, far: 2400,
    loops: [[wind, { color: 'pink', f: [380, 820], q: 0.5, level: 0.062, swell: [0.45, 1], every: [3, 7] }]],
    events: [
      { play: birds(['chirp', 'chirp', 'warble', 'whistle']), every: [2.5, 7], vel: [0.002, 0.0048] },
      { play: C.duck, every: [9, 22], vel: [0.013, 0.023], far: true },
      { play: C.rustle, every: [8, 16], vel: [0.016, 0.032], o: { dur: 1.3, f: 2800 } },
    ],
  },
  // the pool at sundown: water lapping, crickets, a sprinkler across the gardens, a last bird
  pool: {
    level: 1, far: 2400,
    loops: [
      [lap, { level: 0.089 }],
      [crickets, { level: 0.0075 }],
      [wind, { color: 'pink', f: [300, 600], q: 0.5, level: 0.0325, swell: [0.5, 1], every: [4, 8] }],
    ],
    events: [
      { play: C.sprinkler, every: [16, 32], vel: [0.06, 0.1], far: true },
      { play: C.drip, every: [3, 8], vel: [0.005, 0.01] },
      { play: birds(['whistle', 'chirp']), every: [10, 22], vel: [0.0014, 0.0028] },
    ],
  },
  // the pumpkin patch: a breeze in the leaves, hens over the fence, a crow now and then
  autumn: {
    level: 1, far: 2000,
    loops: [[wind, { color: 'pink', f: [420, 1150], q: 0.5, level: 0.061, swell: [0.4, 1], every: [2.5, 6] }]],
    events: [
      { play: C.rustle, every: [2.5, 6.5], vel: [0.025, 0.05], o: { dur: 1.6, f: 3400 } },
      { play: C.hen, every: [14, 30], vel: [0.0063, 0.011], far: true },
      { play: C.crow, every: [30, 60], vel: [0.0088, 0.014], far: true },
      { play: birds(['chirp']), every: [10, 22], vel: [0.0034, 0.0067] },
    ],
  },
  // the snow day: a soft wind and the hush of snow, a dog a few streets off, snow off a branch
  winter: {
    level: 1, far: 900,
    loops: [
      [wind, { color: 'pink', type: 'bandpass', f: [360, 760], q: 3, level: 0.0805, swell: [0.35, 1], every: [3, 7] }],
      [wind, { color: 'brown', f: [180, 320], q: 0.6, level: 0.0537, swell: [0.6, 1], every: [4, 8] }],
    ],
    events: [
      { play: C.dog, every: [28, 60], vel: [0.0126, 0.02], far: true },
      { play: C.snowfall, every: [14, 30], vel: [0.015, 0.025] },
      { play: birds(['whistle']), every: [18, 36], vel: [0.0011, 0.0021] },
    ],
  },
};

// while the ball rolls (faster than DUCK_V m/s) the bed is at DUCK (-4.4 dB): down quickly, back up over
// a second or so once it stops
const DUCK = 0.6, DUCK_V = 0.25;

let live = 0; // one-shots playing now, over every bed (for the leak check: sound.stats())
export const liveEvents = () => live;
const counted = v => {
  const s = v && v.last;
  if (!s) return;
  live++;
  const was = s.onended;
  s.onended = e => { live--; if (was) was.call(s, e); };
};

/** start look's bed at t0, fading in over `fade` s; r: random 0..1 (Math.random, or seeded) */
export function makeBed(ctx, dest, look, t0, fade = 2, r = Math.random) {
  const def = BEDS[look] || BEDS.pond;
  const dk = mkBus(ctx, dest, 1), out = mkBus(ctx, dk, 0); // (dk: the dip under the roll)
  busTarget(out, def.level, t0, Math.max(0.01, fade / 3));
  // things further off: duller, with the bed's own reverb send
  const far = ctx.createBiquadFilter();
  far.type = 'lowpass'; far.frequency.value = def.far; far.Q.value = 0.5;
  far.connect(out);
  far._wet = out._wet;
  const loops = def.loops.map(([make, o]) => make(ctx, out, t0, r, o));
  // (the first of each comes a little way in, so a new yard doesn't open with everything at once)
  const evs = def.events.map(e => ({ ...e, next: t0 + 0.6 + r() * Math.min(e.every[1], 8) }));
  let stopAt = Infinity, dip = 1;
  return {
    look,
    /** the ball's speed now (0 when still or not in play): the bed dips under its roll */
    duck(speed, now) {
      const want = speed > DUCK_V ? DUCK : 1;
      if (want === dip) return;
      busTarget(dk, want, now, want < dip ? 0.05 : 0.45);
      dip = want;
    },
    tick(until, now = -Infinity) {
      if (until > stopAt) until = stopAt;
      for (const l of loops) l.tick(until, now);
      for (const e of evs) {
        if (e.next < now - 0.1) e.next = now + r() * e.every[0]; // (after a stall: not all those missed at once)
        while (e.next < until) {
          const pan = (r() * 2 - 1) * 0.75;
          counted(e.play(ctx, e.far ? far : out, e.next, r, { ...e.o, vel: Math.max(1e-4, span(r, e.vel)), pan }));
          e.next += span(r, e.every);
        }
      }
    },
    /** fade out from t over `fade` s; its nodes go once done (dead(now)) */
    stop(t, fade = 2) {
      if (stopAt !== Infinity) return;
      stopAt = t + fade;
      busTarget(out, 0, t, Math.max(0.005, fade / 5));
      for (const l of loops) l.stop(stopAt + 0.05);
    },
    dead(now) { return now > stopAt + 0.3; },
    dispose() {
      for (const l of loops) for (const n of l.nodes) try { n.disconnect(); } catch { /* gone */ }
      try { far.disconnect(); } catch { /* gone */ }
      busKill(out);
      busKill(dk);
    },
    nodes: () => loops.reduce((n, l) => n + l.nodes.length, 5),
  };
}
