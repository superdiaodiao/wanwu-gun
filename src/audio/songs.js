// Original compositions for 万物皆可滚 · 女娲补天, written as data. Chinese pentatonic (宫商角徵羽)
// melodies in 简谱 (jianpu), jazzy pentatonic-friendly harmony, arranged into bars of 16 steps.
//
//   title  — 90 BPM, E 羽 (G 宫 system), 16 bars: dizi over zheng arpeggios, pad, temple bells.
//   game   — 116 BPM light shuffle, D 宫, 46 bars: intro 4 | A 8 | A' 8 | B 8 | C 8 | A'' 8 | 锣鼓 2,
//            loops from A. Layers L0 (always) L1 (drums) L2 (counter-melody, bass fills)
//            L3 (claps, extra hats, cymbals, doublings) + 'hurry' (ticking).
//   finale — 96 BPM, D 宫, 16 bars: big chords, strummed zheng, dizi anthem, choir, gong.
//   dance  — 128 BPM four-on-the-floor, A 羽 (C 宫), 16 bars: erhu-like hook + synth brass.
// Each song is built twice (variant 0/1) and the loops alternate for variety.
import * as I from './instruments.js';
import { choir } from './voices.js';
import { pentaRange } from './core.js';

// ------------------------------------------------------------------ theory helpers
const MAJOR = [0, 2, 4, 5, 7, 9, 11];
const NOTE = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const QUAL = {
  '': [0, 4, 7], m: [0, 3, 7], maj7: [0, 4, 7, 11], m7: [0, 3, 7, 10], 7: [0, 4, 7, 10],
  maj9: [0, 4, 7, 11, 14], m9: [0, 3, 7, 10, 14], m11: [0, 3, 7, 10, 17], 6: [0, 4, 7, 9], 69: [0, 4, 7, 9, 14],
  '7sus4': [0, 5, 7, 10], '9sus4': [0, 5, 7, 10, 14], '6sus2': [0, 2, 7, 9], sus2: [0, 2, 7], sus4: [0, 5, 7],
};
const acc = s => (s === '#' ? 1 : s === 'b' ? -1 : 0);
const chordCache = new Map();
export function chord(sym) {
  let c = chordCache.get(sym);
  if (c) return c;
  const m = /^([A-G])([#b]?)([^/]*)(?:\/([A-G])([#b]?))?$/.exec(sym);
  if (!m || !QUAL[m[3]]) throw new Error('bad chord ' + sym);
  const root = (NOTE[m[1]] + acc(m[2]) + 12) % 12, ivs = QUAL[m[3]];
  c = { sym, root, ivs, pcs: ivs.map(i => (root + i) % 12), bass: m[4] ? (NOTE[m[4]] + acc(m[5]) + 12) % 12 : root };
  chordCache.set(sym, c);
  return c;
}
// 简谱: one token per 8th note. 1-7 = major-scale degrees above `tonic` (midi of "1"), ' = octave
// up, , = octave down, #/b accidentals, - = hold, 0 = rest, | ignored.
export function jianpu(str, tonic) {
  const out = [];
  let pos = 0, cur = null;
  for (const tok of str.trim().split(/\s+/)) {
    if (tok === '|' || tok === '') continue;
    if (tok === '-') { if (cur) cur.len++; pos++; continue; }
    if (tok === '0') { cur = null; pos++; continue; }
    const m = /^([#b]?)([1-7])([',]*)$/.exec(tok);
    if (!m) throw new Error('bad jianpu token ' + tok);
    let midi = tonic + MAJOR[+m[2] - 1] + acc(m[1]);
    for (const c of m[3]) midi += c === "'" ? 12 : -12;
    cur = { pos, len: 1, midi };
    out.push(cur);
    pos++;
  }
  return out;
}
// lowest midi >= lo with pitch class pc
const rootIn = (pc, lo) => lo + ((pc - (lo % 12) + 12) % 12);
// a chord slot is 'Sym' (whole bar) or ['Sym1', 'Sym2'] (half bars) -> [[sym, startStep, len]]
const halves = c => (Array.isArray(c) ? [[c[0], 0, 8], [c[1], 8, 8]] : [[c, 0, 16]]);
// pentatonic notes that are not a semitone above a chord tone (avoid notes)
function safe(ch, gongPc, lo, hi) {
  return pentaRange(gongPc, lo, hi).filter(m => !ch.pcs.some(pc => (((m - pc) % 12) + 12) % 12 === 1));
}
// Close-position voicing (rootless for 5-note chords) nearest to the previous one.
function voicing(ch, prev, lo = 53, hi = 74, rootless = true) {
  let ivs = ch.ivs;
  if (rootless && ivs.length > 4) ivs = ivs.slice(1);
  let pcs = [...new Set(ivs.map(i => (ch.root + i) % 12))];
  if (pcs.length === 3) pcs = [...pcs, pcs[0]];
  let best = null, bestCost = Infinity;
  for (let r = 0; r < pcs.length; r++) {
    const order = pcs.slice(r).concat(pcs.slice(0, r));
    for (let base = lo; base < lo + 12; base++) {
      if (base % 12 !== order[0]) continue;
      const notes = [base];
      for (let k = 1; k < order.length; k++) { let n = notes[k - 1] + 1; while (n % 12 !== order[k]) n++; notes.push(n); }
      if (notes[notes.length - 1] > hi) continue;
      let cost = 0;
      if (prev) for (let k = 0; k < notes.length; k++) cost += Math.abs(notes[k] - prev[Math.min(k, prev.length - 1)]);
      else cost = Math.abs(notes[0] + notes[notes.length - 1] - (lo + hi));
      if (cost < bestCost) { bestCost = cost; best = notes; }
    }
  }
  return best || pcs.map(pc => rootIn(pc, lo));
}

// ------------------------------------------------------------------ arrangement container
class Arr {
  constructor() { this.bars = []; }
  at(b) { while (this.bars.length <= b) this.bars.push(new Array(16).fill(null)); return this.bars[b]; }
  // event at bar b, 16th step s (may overflow into later bars); len in steps -> params.dur
  ev(b, s, lay, fn, p, len = 0) {
    b += Math.floor(s / 16); s = ((s % 16) + 16) % 16;
    const bar = this.at(b);
    (bar[s] || (bar[s] = [])).push({ lay, fn, p, len });
  }
}
function mel(A, b, str, tonic, inst, o = {}) {
  const notes = jianpu(str, tonic);
  notes.forEach((n, i) => {
    const bi = Math.floor(n.pos / 8);
    if (o.only && !o.only(bi)) return;
    const p = { midi: n.midi, vel: o.vel ?? 0.8, ...(o.p || {}) };
    if (inst === I.dizi && n.len >= 3 && i % 3 === 0) p.grace = 2;
    if (inst === I.erhu && i > 0) {
      const q = notes[i - 1];
      if (q.pos + q.len === n.pos && q.midi !== n.midi && Math.abs(q.midi - n.midi) <= 5) p.from = q.midi;
    }
    A.ev(b + bi, (n.pos % 8) * 2, o.lay || 'L0', inst, p, n.len * 2);
  });
}
export function strum(ctx, dest, t, { midis = [], vel = 0.4, gap = 0.022, kind = 'zheng' } = {}) {
  midis.forEach((m, i) => I.pluck(ctx, dest, t + i * gap, { midi: m, vel: vel * (0.85 + (0.15 * i) / midis.length), kind, send: 0.25, pan: -0.2 + (0.4 * i) / midis.length }));
}

// ------------------------------------------------------------------ title (90 BPM, E 羽)
const TITLE_MEL = [
  '3 - - - - - 5 6', '6 - - - - - 0 0', '5 - 3 - 2 - 3 5', '3 - - - - - 0 0',
  '2 - - 3 5 - 6 5', '3 - 2 - 1 - 6, -', '2 - - - 3 - 5 -', '6, - - - - - 0 0',
  "6 - 1' - 2' - - 3'", "2' - - - 1' - 6 -", "5 - 6 - 1' - 6 5", '3 - - - - - 0 0',
  '6 - 5 - 3 - 5 6', "1' - - 6 - 5 3 -", '2 - 3 5 3 - 2 1', '6, - - - - - 0 0',
].join(' ');
function buildTitle(variant) {
  const A = new Arr(), G = 7, T = 67;
  const CH = ['Em11', 'Em11', 'Cmaj9', 'Cmaj9', 'Am11', 'Am11', 'D6sus2', 'Em11',
    'Cmaj9', 'D6sus2', 'G69', 'Em11', 'Cmaj9', 'Am11', 'D6sus2', 'Em11'];
  let prevV = null;
  for (let b = 0; b < CH.length;) {
    let n = 1;
    while (b + n < CH.length && CH[b + n] === CH[b]) n++;
    const ch = chord(CH[b]);
    prevV = voicing(ch, prevV, 55, 74);
    A.ev(b, 0, 'L0', I.pad, { midis: prevV, vel: 0.55, attack: 1.0, release: 1.4, bright: 0.8 }, n * 16 - 2);
    A.ev(b, 0, 'L0', I.drone, { midi: rootIn(ch.root, 40), vel: 0.28 }, n * 16 - 2);
    b += n;
  }
  const seq = variant ? [1, 0, 2, 1, 3, 2, 4] : [0, 1, 2, 3, 2, 1, 0];
  CH.forEach((sym, b) => {
    const ch = chord(sym), r3 = rootIn(ch.root, 48), up = safe(ch, G, r3 + 5, r3 + 26);
    for (let i = 0; i < 8; i++) {
      const m = i === 0 ? r3 : up[Math.min(up.length - 1, seq[i - 1])];
      A.ev(b, i * 2, 'L0', I.pluck, { midi: m, vel: i % 2 ? 0.52 : 0.65, pan: -0.3 + 0.07 * i, send: 0.3 });
    }
  });
  if (variant) {
    jianpu(TITLE_MEL, T).forEach(n => {
      const b = Math.floor(n.pos / 8), s = (n.pos % 8) * 2;
      if (n.len >= 4) A.ev(b, s, 'L0', I.tremolo, { midi: n.midi, vel: 0.42, kind: 'zheng', send: 0.35 }, n.len * 2 - 1);
      else A.ev(b, s, 'L0', I.pluck, { midi: n.midi, vel: 0.55, send: 0.35 });
    });
  } else mel(A, 0, TITLE_MEL, T, I.dizi, { vel: 0.72, p: { send: 0.4 } });
  const BELLS = [88, 91, 93, 95, 98];
  for (let b = 0; b < 16; b++) {
    A.ev(b, b % 2 ? 10 : 4, 'L0', I.bell, { midi: BELLS[(b * 3) % 5], vel: 0.36, dur: 2.2, pan: b % 2 ? 0.5 : -0.5, send: 0.6 });
    if (b % 4 === 3) A.ev(b, 13, 'L0', I.bell, { midi: BELLS[(b * 3 + 2) % 5], vel: 0.28, dur: 2, pan: 0.2, send: 0.6 });
    if (b % 2 === 0) A.ev(b, 0, 'L0', I.woodblock, { pitch: 0.72, vel: 0.32, send: 0.35 });
    else { A.ev(b, 12, 'L0', I.woodblock, { pitch: 0.9, vel: 0.18, send: 0.35 }); A.ev(b, 14, 'L0', I.woodblock, { pitch: 0.9, vel: 0.14, send: 0.35 }); }
  }
  A.ev(0, 0, 'L0', I.gong, { f: 98, vel: 0.28, dur: 5, send: 0.6 });
  A.ev(8, 0, 'L0', I.gong, { f: 98, vel: 0.22, dur: 5, send: 0.6 });
  return A.bars;
}

// ------------------------------------------------------------------ game (116 BPM shuffle, D 宫)
const GAME_A = ['1 1 2 3 - 5 3 -', '2 2 3 5 - 6 5 -', "6 6 5 6 1' - 6 5", '3 - 2 3 2 - - 0',
  '1 1 2 3 - 5 3 -', "2 2 3 5 - 6 1' -", "2' - 1' 6 5 - 3 5"];
const MEL_A = [...GAME_A, '1 - - - 0 0 5, 6,'].join(' ');
const MEL_A_END = [...GAME_A, '1 - - - 0 0 0 0'].join(' ');
const MEL_A2 = ['1 1 2 3 - 5 3 -', '2 2 3 5 - 6 5 -', "6 6 5 6 1' - 2' 1'", '6 - 5 6 5 3 2 -',
  '1 1 2 3 - 5 3 -', "2 2 3 5 - 6 1' -", "2' - 3' 2' 1' 6 5 6", "1' - - - 0 0 0 0"].join(' ');
const MEL_B = ['3 - - 5 - 6 - 5', '3 - 2 - 1 2 - -', '6 - - 5 - 3 - 2', '3 - 2 3 5 - - -',
  "1' - - 6 - 5 - 6", '5 - 3 - 2 3 - -', '6, 1 2 3 5 3 2 1', '2 - - - 0 5, 6, 1'].join(' ');
const MEL_C = ["5 6 1' 6 5 - - -", '0 0 3 5 6 5 3 -', "5 6 1' 2' 1' - 6 -", '0 0 2 3 5 3 2 -',
  '3 5 6 5 3 - 2 -', '0 0 6, 1 2 1 6, -', '2 3 5 6 5 - 3 -', '2 - - - 0 0 5, 6,'].join(' ');

function buildGame(variant) {
  const A = new Arr(), G = 2, DZ = 74, ZH = 62;
  const CA = ['Dmaj9', 'Bm7', 'Gmaj7', 'A7sus4', 'Dmaj9', 'Bm7', ['Em7', 'A7sus4'], 'D69'];
  const plan = [
    ['intro', ['Dmaj9', 'Dmaj9', 'Bm7', 'A7sus4']], ['A', CA], ['A2', CA],
    ['B', ['Gmaj7', 'A6', 'F#m7', 'Bm7', 'Gmaj7', 'A6', ['Bm7', 'E9sus4'], 'A7sus4']],
    ['C', ['Gmaj7', 'Gmaj7', 'Em7', 'A7sus4', 'F#m7', 'Bm7', 'Em7', 'A7sus4']],
    ['A3', CA], ['luogu', ['D69', 'D69']],
  ];
  const charts = [], S = {};
  for (const [name, ch] of plan) { S[name] = charts.length; charts.push(...ch); }
  const total = charts.length;
  const nextBassPc = b => chord(halves(charts[b + 1 < total ? b + 1 : S.A])[0][0]).bass;

  let prevV = null;
  const comp = (b, style) => {
    for (const [sym, s0, len] of halves(charts[b])) {
      const v = (prevV = voicing(chord(sym), prevV));
      const hits = style === 'A' ? (len === 16 ? [[0, 4, 0.5], [6, 2, 0.4], [12, 3, 0.45]] : s0 === 0 ? [[0, 4, 0.5], [6, 2, 0.4]] : [[0, 3, 0.5], [4, 3, 0.45]])
        : style === 'B' ? (len === 16 ? [[0, 6, 0.45], [10, 6, 0.4]] : [[0, 6, 0.45]])
          : [[0, len - 1, 0.35]];
      for (const [s, l, vel] of hits) for (const m of v) A.ev(b, s0 + s, 'L0', I.epiano, { midi: m, vel, pan: 0.15 }, l);
    }
  };
  const BASS = {
    A: [[0, 0, 3, 0.85], [6, 0, 2, 0.7], [8, 7, 2, 0.75], [12, 12, 2, 0.7], [14, 7, 2, 0.65]],
    As1: [[0, 0, 3, 0.85], [6, 0, 2, 0.7]], As2: [[0, 0, 3, 0.8], [4, 12, 2, 0.7], [6, 7, 2, 0.65]],
    B: [[0, 0, 2, 0.85], [3, 0, 1, 0.6], [6, 12, 2, 0.7], [10, 0, 2, 0.75], [12, 7, 2, 0.65], [14, 12, 1, 0.6]],
    Bs1: [[0, 0, 2, 0.85], [3, 0, 1, 0.6], [6, 12, 2, 0.7]], Bs2: [[0, 0, 2, 0.8], [3, 7, 1, 0.6], [4, 12, 2, 0.7], [6, 7, 2, 0.6]],
    C: [[0, 0, 7, 0.6], [8, 7, 6, 0.5]], Cs1: [[0, 0, 7, 0.6]], Cs2: [[0, 0, 7, 0.55]],
  };
  const bassBar = (b, style, fill) => {
    for (const [sym, s0, len] of halves(charts[b])) {
      const R = rootIn(chord(sym).bass, 38);
      for (const [s, iv, l, vel] of BASS[style + (len === 16 ? '' : s0 === 0 ? 's1' : 's2')]) {
        if (fill && s0 + s >= 10) continue;
        A.ev(b, s0 + s, 'L0', I.bass, { midi: R + iv, vel }, l);
      }
    }
    if (fill) {
      const N = rootIn(nextBassPc(b), 38);
      for (const [s, iv, l] of [[10, -5, 2], [12, -3, 1], [13, -2, 1], [14, -1, 2]]) A.ev(b, s, 'L2', I.bass, { midi: N + iv < 33 ? N + iv + 12 : N + iv, vel: 0.7 }, l);
    }
  };
  const perc0 = (b, style) => {
    const wb = style === 'C'
      ? [[0, 1, 0.45], [3, 1.25, 0.3], [6, 0.85, 0.4], [8, 1, 0.35], [11, 1.25, 0.3], [12, 0.85, 0.4], [14, 1.4, 0.3]]
      : [[0, 1, 0.4], [6, 1.25, 0.3], [12, 0.85, 0.35]];
    for (const [s, p, v] of wb) A.ev(b, s, 'L0', I.woodblock, { pitch: p, vel: v, pan: 0.2 });
    for (const s of [2, 6, 10, 14]) A.ev(b, s, 'L0', I.shaker, { vel: 0.25, pan: -0.25 });
  };
  const drums = (b, style, { first = false, phraseEnd = false, build = false } = {}) => {
    if (style === 'C') {
      A.ev(b, 0, 'L1', I.kick, { vel: 0.6 });
      if (build) {
        for (let s = 8; s < 16; s++) A.ev(b, s, 'L1', I.snare, { vel: 0.2 + (s - 8) * 0.07 });
        A.ev(b, 14, 'L3', I.smallGong, { vel: 0.35 });
      }
      return;
    }
    const kicks = style === 'B' ? [[0, 0.85], [3, 0.55], [8, 0.75], [11, 0.55]] : [[0, 0.85], [6, 0.6], [8, 0.75]];
    for (const [s, v] of kicks) A.ev(b, s, 'L1', I.kick, { vel: v });
    for (const s of [4, 12]) A.ev(b, s, 'L1', I.snare, { vel: 0.6 });
    for (let s = 0; s < 16; s += 2) A.ev(b, s, 'L1', I.hat, { vel: s % 4 ? 0.34 : 0.26, pan: 0.3 });
    for (const s of [4, 12]) A.ev(b, s, 'L3', I.clap, { vel: 0.4 });
    for (let s = 1; s < 16; s += 2) A.ev(b, s, 'L3', I.hat, { vel: 0.12, pan: -0.3 });
    A.ev(b, 14, 'L3', I.hat, { vel: 0.3, open: true, pan: 0.3 });
    if (first) A.ev(b, 0, 'L3', I.cymbal, { vel: 0.35, dur: 1.2 });
    if (phraseEnd) A.ev(b, 14, 'L3', I.smallGong, { vel: 0.3 });
  };
  const counter = (b, pattern) => {
    for (const [sym, s0, len] of halves(charts[b])) {
      const sf = safe(chord(sym), G, 64, 86), base = Math.max(0, Math.floor(sf.length / 3) - 1);
      const at = i => sf[Math.min(sf.length - 1, i)];
      if (pattern === 1) {
        [2, 3, 6, 7, 10, 11, 14, 15].filter(s => s >= s0 && s < s0 + len).forEach((s, j) => {
          const hi = j % 2;
          A.ev(b, s, 'L2', I.pluck, { midi: at(base + (Math.floor(j / 2) % 3) + hi * 2), vel: hi ? 0.3 : 0.36, kind: 'pipa', pan: -0.35, send: 0.15 }, 1);
        });
      } else {
        const seq = [0, 2, 3, 4, 5, 4, 3, 2];
        [0, 2, 4, 6, 8, 10, 12, 14].filter(s => s >= s0 && s < s0 + len).forEach(s => {
          A.ev(b, s, 'L2', I.pluck, { midi: at(base + seq[s / 2]), vel: 0.3, kind: 'zheng', pan: -0.3, send: 0.2 }, 2);
        });
      }
    }
  };
  const section = (b0, style, cpat) => {
    for (let i = 0; i < 8; i++) {
      const b = b0 + i, fill = style !== 'C' && (i === 3 || i === 7);
      comp(b, style); bassBar(b, style, fill); perc0(b, style);
      drums(b, style, { first: i === 0, phraseEnd: fill, build: style === 'C' && i === 7 });
      if (cpat) counter(b, cpat);
    }
  };
  const glissInto = b => A.ev(b - 1, 13, 'L0', I.gliss, { from: 62, to: 86, span: 0.34, vel: 0.45, gongPc: G });

  // intro
  const s0 = S.intro;
  A.ev(s0, 0, 'L0', I.gliss, { from: 62, to: 86, span: 0.6, vel: 0.5, gongPc: G });
  A.ev(s0, 0, 'L0', I.gong, { f: 110, vel: 0.3, dur: 4, send: 0.5 });
  for (const m of voicing(chord('Dmaj9'), null)) A.ev(s0, 0, 'L0', I.epiano, { midi: m, vel: 0.4 }, 15);
  perc0(s0, 'A');
  for (let b = s0 + 1; b < s0 + 4; b++) { comp(b, 'A'); bassBar(b, 'A', false); perc0(b, 'A'); }
  drums(s0 + 2, 'A');
  drums(s0 + 3, 'A', { phraseEnd: true });
  for (const s of [12, 13, 14, 15]) A.ev(s0 + 3, s, 'L1', I.snare, { vel: 0.3 + (s - 12) * 0.1 });
  mel(A, s0 + 3, '0 0 0 0 0 0 5, 6,', DZ, I.dizi);
  // A
  section(S.A, 'A', variant ? 2 : 1);
  if (variant) { mel(A, S.A, MEL_A, DZ, I.pluck, { vel: 0.72, p: { kind: 'pipa' } }); mel(A, S.A, MEL_A, ZH, I.pluck, { vel: 0.5 }); }
  else mel(A, S.A, MEL_A, DZ, I.dizi, { vel: 0.8 });
  // A'
  section(S.A2, 'A', 1);
  mel(A, S.A2, MEL_A2, DZ, I.dizi, { vel: 0.8 });
  mel(A, S.A2, MEL_A2, ZH, I.pluck, { vel: 0.45, lay: 'L3' });
  // B
  section(S.B, 'B', variant ? 1 : 2);
  glissInto(S.B);
  if (variant) mel(A, S.B, MEL_B, DZ, I.dizi, { vel: 0.8 });
  else mel(A, S.B, MEL_B, DZ, I.pluck, { vel: 0.75 });
  // C: dizi calls, pipa answers, build-up at the end
  section(S.C, 'C', 0);
  mel(A, S.C, MEL_C, DZ, I.dizi, { vel: 0.75, only: bi => bi % 2 === 0 || bi === 7 });
  mel(A, S.C, MEL_C, ZH, I.pluck, { vel: 0.7, p: { kind: 'pipa' }, only: bi => bi % 2 === 1 && bi !== 7 });
  // A''
  section(S.A3, 'A', variant ? 2 : 1);
  glissInto(S.A3);
  mel(A, S.A3, MEL_A_END, DZ, I.dizi, { vel: 0.85 });
  mel(A, S.A3, MEL_A_END, ZH, I.pluck, { vel: 0.5 });
  mel(A, S.A3, MEL_A_END, DZ + 12, I.pluck, { vel: 0.3, lay: 'L3', p: { kind: 'pipa' } });
  // 锣鼓 break: 仓 (gong+cymbal+kick), 才 (choked cymbal), 七 (soft cymbal), 台 (小锣), 大 (板)
  const L = S.luogu;
  const cang = (b, s, k = 1) => {
    A.ev(b, s, 'L0', I.gong, { f: 150, vel: 0.45 * k, dur: 1.4, glide: -0.06, send: 0.3 });
    A.ev(b, s, 'L0', I.cymbal, { vel: 0.5 * k, dur: 0.7 });
    A.ev(b, s, 'L0', I.kick, { vel: 0.8 * k });
    A.ev(b, s, 'L0', I.bass, { midi: 38, vel: 0.75 }, 2);
  };
  const cai = (b, s) => A.ev(b, s, 'L0', I.cymbal, { vel: 0.4, dur: 0.14 });
  const qi = (b, s) => A.ev(b, s, 'L0', I.cymbal, { vel: 0.22, dur: 0.07, tone: 1.3 });
  const tai = (b, s) => A.ev(b, s, 'L0', I.smallGong, { vel: 0.5 });
  const da = (b, s) => A.ev(b, s, 'L0', I.woodblock, { pitch: 1.5, vel: 0.5 });
  cang(L, 0); cai(L, 4); qi(L, 6); cang(L, 8); cai(L, 12); da(L, 14); da(L, 15);
  cang(L + 1, 0); qi(L + 1, 2); tai(L + 1, 4); tai(L + 1, 6); cang(L + 1, 8); qi(L + 1, 10); cang(L + 1, 12, 1.15);
  // hurry: ticking 8ths over everything
  for (let b = 0; b < total; b++) for (let s = 0; s < 16; s += 2) A.ev(b, s, 'hurry', I.woodblock, { pitch: s % 4 ? 2.1 : 2.5, vel: s % 4 ? 0.2 : 0.32, pan: -0.4, send: 0 });
  A.at(total - 1);
  return A.bars;
}

// ------------------------------------------------------------------ finale (96 BPM, D 宫)
const FINALE_MEL = [
  '1 - 2 - 3 - 5 -', '6 - 5 - 3 - 2 -', '3 - - 2 1 - 6, -', '5, - - - - - 6, 1',
  '2 - 3 - 5 - 6 -', "1' - 6 - 5 - 3 -", '2 - 3 5 6 - 5 -', '2 - - - - - 0 0',
  "3 - 5 - 6 - 1' -", "2' - 3' - 2' - 6 -", '3 - 5 - 6 - 5 3', '2 - - 3 - - 1 2',
  "3 - 5 - 6 - 1' 2'", "3' - 2' - 6 - 5 -", "1' - - - - - - -", '0 0 0 0 5, - 6, -',
].join(' ');
function buildFinale(variant) {
  const A = new Arr(), DZ = 74, ZH = 62;
  const CH = ['D', 'A/C#', 'Bm7', 'G', 'D/F#', 'Gmaj7', ['Em7', 'A7sus4'], 'A7', 'G', 'A', 'F#m7', 'Bm7', 'G', 'A', 'D', 'D'];
  const BASS = [50, 49, 47, 43, 42, 43, [40, 45], 45, 43, 45, 42, 47, 43, 45, 38, 38];
  const bassAt = (b, k = 0) => (Array.isArray(BASS[b % 16]) ? BASS[b % 16][k] : BASS[b % 16]);
  let prevP = null, prevC = null;
  CH.forEach((c, b) => {
    halves(c).forEach(([sym, s0, len], k) => {
      const ch = chord(sym);
      prevP = voicing(ch, prevP, 55, 74, false);
      A.ev(b, s0, 'L0', I.pad, { midis: prevP, vel: 0.5, attack: 0.25, release: 0.6 }, len - 1);
      for (const s of len === 16 ? [0, 8] : [0]) A.ev(b, s0 + s, 'L0', strum, { midis: prevP.map(m => m + 12), vel: 0.5, kind: variant ? 'pipa' : 'zheng' });
      for (const s of [2, 6, 10, 14]) if (s >= s0 && s < s0 + len) for (const m of prevP) A.ev(b, s, 'L0', I.epiano, { midi: m, vel: 0.24 }, 1);
      const R = bassAt(b, k);
      for (let s = s0; s < s0 + len; s += 2) {
        if (b % 4 === 3 && s >= 12) continue;
        A.ev(b, s, 'L0', I.bass, { midi: s % 8 === 6 ? R + 12 : R, vel: s % 4 ? 0.55 : 0.75 }, 2);
      }
      if (b >= 8) {
        prevC = voicing(ch, prevC, 62, 79, false);
        A.ev(b, s0, 'L0', choir, { midis: prevC, vel: 0.32, attack: 0.3, release: 0.5, vowel: variant ? 'o' : 'a' }, len - 1);
      }
    });
    if (b % 4 === 3) { const N = bassAt(b + 1); A.ev(b, 12, 'L0', I.bass, { midi: N - 2, vel: 0.7 }, 2); A.ev(b, 14, 'L0', I.bass, { midi: N - 1, vel: 0.7 }, 2); }
    A.ev(b, 0, 'L0', I.kick, { vel: 0.85 });
    A.ev(b, 8, 'L0', I.kick, { vel: 0.75 });
    A.ev(b, 10, 'L0', I.kick, { vel: 0.45 });
    for (const s of [4, 12]) A.ev(b, s, 'L0', I.snare, { vel: 0.65, send: 0.25 });
    for (let s = 0; s < 16; s += 2) A.ev(b, s, 'L0', I.hat, { vel: s % 4 ? 0.3 : 0.2, pan: 0.3 });
    if (b % 8 === 7) [[8, 220], [10, 185], [12, 150], [14, 120]].forEach(([s, f]) => A.ev(b, s, 'L0', I.tom, { f, vel: 0.6 }));
    if (b % 8 === 0) { A.ev(b, 0, 'L0', I.cymbal, { vel: 0.45, dur: 1.6 }); A.ev(b, 0, 'L0', I.gong, { f: 110, vel: 0.5, dur: 4, send: 0.5 }); }
    if (b % 8 === 3) A.ev(b, 14, 'L0', I.smallGong, { vel: 0.35 });
  });
  mel(A, 0, FINALE_MEL, DZ, I.dizi, { vel: 0.85 });
  mel(A, 0, FINALE_MEL, ZH, I.pluck, { vel: 0.55, p: { kind: variant ? 'pipa' : 'zheng' } });
  return A.bars;
}

// ------------------------------------------------------------------ 广场舞 (128 BPM, A 羽)
const DANCE_HOOK = ['6, 1 - 2 3 - 5 3', '2 - 1 - 6, 1 - -', '5, 6, - 1 2 - 3 2', '3 - - - - - 0 0',
  '6, 1 - 2 3 - 5 6', "1' - 6 5 6 - 5 3", '2 3 5 3 2 - 1 2', '6, - - - - - 0 0'].join(' ');
const DANCE_VERSE = ['1 1 1 6, 1 - 2 -', '2 2 2 1 2 - 3 -', '3 3 5 3 2 - 3 -', '6, - - - - - 0 0',
  '1 1 1 6, 1 - 2 -', '2 2 2 3 5 - 6 -', "3 - #5 - 7 - 2' -", '6 - - - 0 0 0 0'].join(' ');
function buildDance(variant) {
  const A = new Arr(), T = 72;
  const CH = ['Am', 'F', 'G', 'Em', 'Am', 'F', 'G', 'Am', 'F', 'G', 'Em', 'Am', 'F', 'G', 'E7', 'Am'];
  let prevV = null;
  CH.forEach((sym, b) => {
    const ch = chord(sym), R = rootIn(ch.root, 40);
    for (const s of [0, 4, 8, 12]) A.ev(b, s, 'L0', I.kick, { vel: 1, f0: 220, f1: 80, decay: 0.22, click: 0.9 });
    for (const s of [4, 12]) A.ev(b, s, 'L0', I.clap, { vel: 0.6 });
    for (const s of [2, 6, 10, 14]) A.ev(b, s, 'L0', I.hat, { vel: 0.5, open: true, tone: 0.4 });
    for (let s = 1; s < 16; s += 2) A.ev(b, s, 'L0', I.hat, { vel: 0.2, tone: 0.45 });
    for (let s = 0; s < 16; s += 2) A.ev(b, s, 'L0', I.bass, { midi: R + (s % 4 ? 12 : 0), vel: s % 4 ? 0.65 : 0.8, bright: 1.4 }, 1.5);
    prevV = voicing(ch, prevV, 60, 72, false);
    for (const s of b >= 8 ? [2, 6, 10, 14] : [6, 14]) for (const m of prevV) A.ev(b, s, 'L0', I.brass, { midi: m, vel: 0.3 }, 1);
    if (b % 8 === 7) [[8, 260], [10, 210], [12, 170], [14, 140]].forEach(([s, f]) => A.ev(b, s, 'L0', I.tom, { f, vel: 0.65 }));
    if (b % 8 === 0) A.ev(b, 0, 'L0', I.cymbal, { vel: 0.4, dur: 1 });
  });
  mel(A, 0, DANCE_HOOK, T, I.erhu, { vel: 0.7 });
  if (variant) mel(A, 0, DANCE_HOOK, T - 12, I.brass, { vel: 0.35 });
  mel(A, 8, DANCE_VERSE, T, variant ? I.erhu : I.brass, { vel: variant ? 0.8 : 0.7 });
  mel(A, 11, '0 0 0 0 3 5 6 -', T, variant ? I.brass : I.erhu, { vel: 0.6 });
  return A.bars;
}

// ------------------------------------------------------------------ registry
const DEFS = {
  title: { bpm: 90, swing: 0.5, loopStart: 0, level: 1, layers: ['L0'], build: buildTitle },
  game: { bpm: 116, swing: 0.58, loopStart: 4, level: 0.7, layers: ['L0', 'L1', 'L2', 'L3', 'hurry'], build: buildGame },
  finale: { bpm: 96, swing: 0.5, loopStart: 0, level: 0.7, layers: ['L0'], build: buildFinale },
  dance: { bpm: 128, swing: 0.5, loopStart: 0, level: 1, layers: ['L0'], build: buildDance },
};
export const SONG_NAMES = Object.keys(DEFS);
const songs = {};
export function getSong(name) {
  const d = DEFS[name];
  if (!d) return null;
  if (!songs[name]) songs[name] = { name, ...d, variants: [d.build(0), d.build(1)] };
  return songs[name];
}
