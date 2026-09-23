// Formant-synthesis voices: human exclamations, animal calls, Animal-Crossing-style babble, choir.
// Source (glottal pulse / saw) with pitch contour, vibrato, jitter, optional grit -> four parallel
// band-pass formants whose frequencies glide between vowels -> amplitude contour.
import { Voice, mtof, clamp, wave, rnd, pick, pts, perc } from './core.js';

// Formants [Hz, relative amplitude] for an adult vocal tract; `shift` scales frequencies
// (woman ≈ 1.17, child ≈ 1.35, cat ≈ 1.55). The last three are animal "vowels".
const VF = {
  a: [[750, 1], [1180, 0.55], [2600, 0.28], [3500, 0.12]],
  o: [[480, 1], [820, 0.5], [2550, 0.12], [3400, 0.05]],
  e: [[500, 1], [1250, 0.4], [2550, 0.18], [3500, 0.08]], // Mandarin e [ɤ]
  i: [[290, 1], [2250, 0.3], [2950, 0.25], [3700, 0.1]],
  u: [[330, 1], [740, 0.35], [2400, 0.06], [3350, 0.03]],
  n: [[260, 1], [1100, 0.06], [2300, 0.05], [3300, 0.02]], // nasal murmur (m / n)
  quack: [[900, 0.55], [1500, 1], [2600, 0.8], [3600, 0.35]],
  honk: [[620, 0.8], [1300, 1], [2400, 0.7], [3300, 0.3]],
};
const BW = [90, 110, 170, 250];

// P: dur, f0 [[t,hz]..], vow [[t,'a']..], amp [[t,level]..], shift, breath, vib [rate, cents],
//    jitter (cents), drive (grit), gain, pan, send, src ('glottal'|'reed'|'soft'|'sawtooth'|...), open (s)
export function formant(ctx, dest, t, P) {
  const { dur, f0, vow, amp, shift = 1, breath = 0.06, vib = null, jitter = 0, drive = 0, gain = 1,
    pan = 0, send = 0.12, src = 'glottal', open = 0 } = P;
  const v = new Voice(ctx, dest, t, send, pan);
  const end = t + dur + 0.03;
  const o = v.osc(['glottal', 'reed', 'soft'].includes(src) ? wave(ctx, src) : src, f0[0][1], t, end);
  o.frequency.setValueAtTime(f0[0][1], t);
  for (let i = 1; i < f0.length; i++) o.frequency.exponentialRampToValueAtTime(f0[i][1], t + f0[i][0]);
  if (vib) v.lfo(o.detune, vib[0], vib[1], t, end);
  if (jitter) { const j = v.noise(t, end, 'brown', 0.6), jg = v.gain(jitter / 0.3); j.connect(jg); jg.connect(o.detune); }
  const exc = v.gain(1);
  if (drive) { const pre = v.gain(1 + drive * 2.5), sh = v.shaper(drive); v.conn(o, pre, sh, exc); } else o.connect(exc);
  if (breath > 0) { const n = v.noise(t, end), hp = v.filter('highpass', 900, 0.5), ng = v.gain(breath * 2); v.conn(n, hp, ng, exc); }
  let avg = 0;
  for (const p of f0) avg += p[1];
  avg /= f0.length;
  const bank = v.gain(1);
  for (let k = 0; k < 4; k++) {
    const F = vow.map(([tt, name]) => [tt, VF[name][k][0] * shift, VF[name][k][1]]);
    const bw = Math.max(BW[k] * shift, avg * 0.9);
    const bp = v.filter('bandpass', F[0][1], clamp(F[0][1] / bw, 0.7, 30));
    bp.frequency.setValueAtTime(F[0][1], t);
    const g = v.gain(F[0][2]);
    g.gain.setValueAtTime(F[0][2], t);
    for (let i = 1; i < F.length; i++) {
      bp.frequency.linearRampToValueAtTime(F[i][1], t + F[i][0]);
      g.gain.linearRampToValueAtTime(F[i][2], t + F[i][0]);
    }
    v.conn(exc, bp, g, bank);
  }
  const lp = v.filter('lowpass', open ? 400 : 12000, 0.7);
  if (open) { lp.frequency.setValueAtTime(400, t); lp.frequency.exponentialRampToValueAtTime(10000, t + open); }
  const a = v.gain(0);
  pts(a.gain, t, amp, gain * 0.45);
  v.conn(bank, lp, a, v.out);
  return v.done();
}

// ------------------------------------------------------------------ character voices
// o: { vel (0..1), pitch (factor), pan }
const S = (o, k = 1) => (o.vel ?? 0.8) * k;
export const VOICES = {
  // auntie's "啊——!" — high, trembling, falling
  scream_f(ctx, d, t, o = {}) {
    const p = o.pitch || 1;
    return formant(ctx, d, t, {
      dur: 0.9, f0: [[0, 560 * p], [0.07, 650 * p], [0.45, 500 * p], [0.9, 330 * p]],
      vow: [[0, 'a'], [0.6, 'a'], [0.9, 'o']], amp: [[0, 0], [0.04, 1], [0.5, 0.85], [0.8, 0.35], [0.9, 0]],
      shift: 1.18, breath: 0.2, vib: [6.8, 38], jitter: 14, drive: 0.45, gain: S(o), pan: o.pan || 0, send: 0.14,
    });
  },
  // uncle's "哎哟!" — ai (rising) then yo (up and down)
  scream_m(ctx, d, t, o = {}) {
    const p = o.pitch || 1;
    return formant(ctx, d, t, {
      dur: 0.6, f0: [[0, 170 * p], [0.08, 215 * p], [0.2, 198 * p], [0.3, 245 * p], [0.4, 258 * p], [0.6, 160 * p]],
      vow: [[0, 'a'], [0.16, 'a'], [0.26, 'i'], [0.33, 'i'], [0.43, 'o'], [0.6, 'u']],
      amp: [[0, 0], [0.025, 1], [0.2, 0.85], [0.26, 0.35], [0.31, 1], [0.46, 0.8], [0.6, 0]],
      shift: 1, breath: 0.12, vib: [5.5, 20], jitter: 10, drive: 0.25, gain: S(o, 1.4), pan: o.pan || 0, send: 0.12,
    });
  },
  // kid's squeaky "咿呀!"
  scream_kid(ctx, d, t, o = {}) {
    const p = o.pitch || 1;
    return formant(ctx, d, t, {
      dur: 0.42, f0: [[0, 720 * p], [0.09, 990 * p], [0.25, 900 * p], [0.42, 690 * p]],
      vow: [[0, 'i'], [0.12, 'i'], [0.22, 'a'], [0.42, 'a']], amp: [[0, 0], [0.02, 1], [0.3, 0.8], [0.42, 0]],
      shift: 1.38, breath: 0.15, vib: [8, 45], drive: 0.3, gain: S(o), pan: o.pan || 0, send: 0.12,
    });
  },
  // "mi-a-ow": nasal onset, formant sweep i -> a -> u, pitch arc
  meow(ctx, d, t, o = {}) {
    const p = o.pitch || 1;
    return formant(ctx, d, t, {
      dur: 0.55, f0: [[0, 520 * p], [0.14, 790 * p], [0.34, 720 * p], [0.55, 460 * p]],
      vow: [[0, 'i'], [0.16, 'e'], [0.28, 'a'], [0.42, 'a'], [0.55, 'u']],
      amp: [[0, 0], [0.06, 0.7], [0.2, 1], [0.42, 0.75], [0.55, 0]],
      shift: 1.55, open: 0.09, breath: 0.08, vib: [7, 18], gain: S(o, 1.1), pan: o.pan || 0, send: 0.12,
    });
  },
  // "woof woof": noisy, gritty, falling
  bark(ctx, d, t, o = {}) {
    const p = o.pitch || 1;
    const one = (tt, q, k) => formant(ctx, d, tt, {
      dur: 0.14, f0: [[0, 330 * q], [0.03, 410 * q], [0.14, 240 * q]],
      vow: [[0, 'o'], [0.04, 'a'], [0.14, 'o']], amp: [[0, 0], [0.012, 1], [0.07, 0.6], [0.14, 0]],
      shift: 1.1, breath: 0.45, drive: 0.6, jitter: 30, gain: S(o, k), pan: o.pan || 0, send: 0.1,
    });
    one(t, p, 1);
    return one(t + 0.2, p * 0.94, 0.85);
  },
  // "bok bok bok ba-GAWK"
  cluck(ctx, d, t, o = {}) {
    const p = o.pitch || 1;
    [0, 0.1, 0.18].forEach((dt, i) => formant(ctx, d, t + dt, {
      dur: 0.07, f0: [[0, (460 + i * 20) * p], [0.07, 380 * p]], vow: [[0, 'o'], [0.07, 'u']],
      amp: [[0, 0], [0.008, 1], [0.04, 0.5], [0.07, 0]], shift: 1.3, breath: 0.3, drive: 0.3, gain: S(o, 0.9), pan: o.pan || 0,
    }));
    return formant(ctx, d, t + 0.3, {
      dur: 0.24, f0: [[0, 520 * p], [0.05, 720 * p], [0.24, 560 * p]], vow: [[0, 'a'], [0.24, 'o']],
      amp: [[0, 0], [0.02, 1], [0.18, 0.7], [0.24, 0]], shift: 1.3, breath: 0.25, drive: 0.4, gain: S(o), pan: o.pan || 0,
    });
  },
  // nasal buzzy "quack quack"
  quack(ctx, d, t, o = {}) {
    const p = o.pitch || 1;
    const one = (tt, q, k) => formant(ctx, d, tt, {
      dur: 0.2, src: 'sawtooth', f0: [[0, 250 * q], [0.06, 272 * q], [0.2, 190 * q]],
      vow: [[0, 'quack'], [0.2, 'quack']], amp: [[0, 0], [0.015, 1], [0.12, 0.8], [0.2, 0]],
      breath: 0.1, drive: 0.35, gain: S(o, 2 * k), pan: o.pan || 0, send: 0.1,
    });
    one(t, p, 1);
    return one(t + 0.24, p * 0.95, 0.8);
  },
  // pigeon "coo-roo-coo": soft, warbling
  coo(ctx, d, t, o = {}) {
    const p = o.pitch || 1;
    const seg = (dt, f, vib, k) => formant(ctx, d, t + dt, {
      dur: f.dur, src: 'soft', f0: f.f0.map(([a, b]) => [a, b * p]), vow: [[0, 'u'], [f.dur, 'u']],
      amp: [[0, 0], [0.06, 1], [f.dur * 0.7, 0.7], [f.dur, 0]], shift: 1.1, breath: 0.04, vib, gain: S(o, k), pan: o.pan || 0, send: 0.15,
    });
    seg(0, { dur: 0.26, f0: [[0, 380], [0.1, 440], [0.26, 400]] }, null, 1.1);
    seg(0.3, { dur: 0.3, f0: [[0, 440], [0.12, 470], [0.3, 390]] }, [11, 70], 1.1);
    return seg(0.64, { dur: 0.24, f0: [[0, 400], [0.24, 350]] }, null, 0.9);
  },
  // goose "HONK honk": harsh, distorted
  honk(ctx, d, t, o = {}) {
    const p = o.pitch || 1;
    const one = (tt, q, k) => formant(ctx, d, tt, {
      dur: 0.3, src: 'sawtooth', f0: [[0, 330 * q], [0.05, 405 * q], [0.3, 350 * q]],
      vow: [[0, 'honk'], [0.3, 'honk']], amp: [[0, 0], [0.02, 1], [0.22, 0.8], [0.3, 0]],
      breath: 0.25, drive: 0.85, jitter: 25, gain: S(o, 0.9 * k), pan: o.pan || 0, send: 0.1,
    });
    one(t, p, 1);
    return one(t + 0.36, p * 1.08, 0.8);
  },
  // pig "oink-oink": gritty nasal grunt, o -> i -> n, up-down pitch
  oink(ctx, d, t, o = {}) {
    const p = o.pitch || 1;
    const one = (tt, q, k) => formant(ctx, d, tt, {
      dur: 0.24, src: 'sawtooth', f0: [[0, 175 * q], [0.06, 235 * q], [0.18, 175 * q], [0.24, 150 * q]],
      vow: [[0, 'o'], [0.09, 'o'], [0.17, 'i'], [0.24, 'n']], amp: [[0, 0], [0.02, 1], [0.15, 0.8], [0.24, 0]],
      shift: 1.1, breath: 0.35, drive: 0.7, jitter: 40, gain: S(o, 1.8 * k), pan: o.pan || 0, send: 0.1,
    });
    one(t, p, 1);
    return one(t + 0.29, p * 1.08, 0.85);
  },
  // cow "mooo": nasal onset, u -> o -> u, rising then sagging pitch
  moo(ctx, d, t, o = {}) {
    const p = o.pitch || 1;
    return formant(ctx, d, t, {
      dur: 1.05, f0: [[0, 105 * p], [0.3, 142 * p], [0.75, 128 * p], [1.05, 92 * p]],
      vow: [[0, 'n'], [0.18, 'u'], [0.45, 'o'], [0.8, 'o'], [1.05, 'u']],
      amp: [[0, 0], [0.1, 0.6], [0.35, 1], [0.8, 0.8], [1.05, 0]],
      shift: 0.82, breath: 0.1, drive: 0.15, vib: [4, 10], jitter: 12, gain: S(o, 1.3), pan: o.pan || 0, send: 0.12,
    });
  },
};
export const VOICE_KEYS = Object.keys(VOICES);

// ------------------------------------------------------------------ babble
// One syllable per typed character: random pentatonic pitch, random vowel, optional consonant tick.
const BABBLE = {
  nuwa: { base: 392, shift: 1.22, send: 0.14, k: 1 }, // gentle goddess
  auntie: { base: 330, shift: 1.15, send: 0.08, k: 1 },
  uncle: { base: 150, shift: 0.95, send: 0.08, k: 1.9 },
  kid: { base: 520, shift: 1.36, send: 0.08, k: 1 },
  cat: { base: 620, shift: 1.55, send: 0.08, k: 1.2 },
  narrator: { base: 220, shift: 1.05, send: 0.1, k: 1.5 },
};
export const BABBLE_VOICES = Object.keys(BABBLE);
export function babble(ctx, dest, t, { voice = 'nuwa', vel = 0.7 } = {}) {
  const V = BABBLE[voice] || BABBLE.nuwa;
  const f = V.base * Math.pow(2, pick([0, 2, 4, 7, 9, 12, 7, 4, 2]) / 12) * rnd(0.99, 1.01);
  const dur = rnd(0.065, 0.1), vw = pick(['a', 'i', 'u', 'e', 'o', 'a', 'o']), up = Math.random() < 0.5;
  const hasC = Math.random() < 0.55, tv = t + (hasC ? 0.014 : 0);
  if (hasC) {
    const v = new Voice(ctx, dest, t, 0.05);
    const n = v.noise(t, t + 0.04), bp = v.filter('bandpass', rnd(2500, 6500), 1.4), g = v.gain(0);
    perc(g.gain, t, vel * 0.3, 0.002, 0.025);
    v.conn(n, bp, g, v.out);
    v.done();
  }
  return formant(ctx, dest, tv, {
    dur, f0: [[0, f * (up ? 0.94 : 1.05)], [dur, f * (up ? 1.04 : 0.93)]], vow: [[0, vw], [dur, vw]],
    amp: [[0, 0], [0.008, 1], [dur * 0.6, 0.75], [dur, 0]], shift: V.shift, breath: 0.05, gain: vel * V.k,
    send: V.send, pan: rnd(-0.1, 0.1),
  });
}

// ------------------------------------------------------------------ choir
// Sustained "aah"/"ooh" chord: detuned glottal pairs, shared vibrato and formant bank.
export function choir(ctx, dest, t, { midis = [62, 69, 74], dur = 2, vel = 0.5, vowel = 'a', toVowel = null,
  attack = 0.8, release = 1, shift = 1.12, send = 0.45, pan = 0 } = {}) {
  const v = new Voice(ctx, dest, t, send, pan);
  const end = t + dur + release + 0.05;
  const exc = v.gain(1 / Math.sqrt(midis.length * 2));
  const l = v.osc('sine', 5.1, t, end), lg = v.gain(10);
  l.connect(lg);
  let avg = 0;
  for (const m of midis) {
    avg += mtof(m);
    for (const det of [-7, 6]) {
      const o = v.osc(wave(ctx, 'glottal'), mtof(m), t, end);
      o.detune.value = det + rnd(-3, 3);
      lg.connect(o.detune); o.connect(exc);
    }
  }
  avg /= midis.length;
  const n = v.noise(t, end), hp = v.filter('highpass', 1200), ng = v.gain(0.12);
  v.conn(n, hp, ng, exc);
  const bank = v.gain(1);
  for (let k = 0; k < 4; k++) {
    const f0 = VF[vowel][k][0] * shift, f1 = VF[toVowel || vowel][k][0] * shift;
    const bp = v.filter('bandpass', f0, clamp(f0 / Math.max(BW[k] * shift * 1.3, avg * 0.6), 0.7, 20));
    bp.frequency.setValueAtTime(f0, t);
    if (toVowel) bp.frequency.linearRampToValueAtTime(f1, t + dur);
    const g = v.gain(VF[vowel][k][1]);
    if (toVowel) { g.gain.setValueAtTime(VF[vowel][k][1], t); g.gain.linearRampToValueAtTime(VF[toVowel][k][1], t + dur); }
    v.conn(exc, bp, g, bank);
  }
  const amp = v.gain(0);
  amp.gain.setValueAtTime(0, t);
  amp.gain.linearRampToValueAtTime(vel * 0.5, t + attack);
  amp.gain.setValueAtTime(vel * 0.5, t + Math.max(dur, attack));
  amp.gain.setTargetAtTime(0, t + Math.max(dur, attack), release / 5);
  v.conn(bank, amp, v.out);
  return v.done();
}
