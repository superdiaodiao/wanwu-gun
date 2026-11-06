// A music layer per yard over the golf song (src/audio/songs.js 'golf', which stays as it is): the
// pumpkin patch adds picked strings and soft claps, the snow day a glockenspiel and a soft pad;
// the duck pond and the pool party play the song as it is. The layers are a song of their own on the
// same 16 bars and chords, played by a Track (src/audio/sequencer.js) on the music bus (so the music
// switch and the ducking under a fanfare act on it as on the song) and kept in step with the song:
// it starts from the song's own position (audio.js keeps the playing Track as audio._track: only read
// here, never changed) and then counts the same steps; after a stall it skips the steps gone by, as the
// song does. A yard's layer fades in when its look comes and out when it goes. If what it reads of
// src/audio is ever not there, it turns itself off (songTrouble, layerSelfCheck below).
// makeLayer(ctx, dest, audio) -> layer.tick(look, now) every frame.
import { Track } from '../../audio/sequencer.js';
import * as I from '../../audio/instruments.js';
import { chord, getSong } from '../../audio/songs.js';
import { Voice, cached, mtof, prng } from '../../audio/core.js';

// the golf song's chords, a bar each (two: half a bar each), as in songs.js GOLF_CH
const CH = ['G', 'Em7', 'Cmaj7', 'D7', 'G', 'E7', ['Am7', 'D7'], 'G', 'C', 'D7', 'Bm7', 'E7', 'Am7', 'Cm6', 'G', 'D7'];
const halves = c => (Array.isArray(c) ? [[c[0], 0, 8], [c[1], 8, 8]] : [[c, 0, 16]]);
const above = (pc, lo) => lo + ((pc - (lo % 12) + 12) % 12); // lowest midi >= lo with pitch class pc
export const LAYERS = ['autumn', 'winter'];

// The pumpkin patch's plucked string: a bright, twangy Karplus-Strong string picked near the bridge,
// banjo-ish, rendered once per note (0.9 s, kept: STRING_NOTES are warmed up ahead, sound/index.js)
// and tuned exactly by its playback rate.
export const STRING_NOTES = new Set();
const LEN = 0.9;
export function stringBuf(ctx, midi) {
  return cached(ctx, 'golf:string:' + midi, c => {
    const sr = c.sampleRate, f = mtof(midi), N = Math.max(2, Math.round(sr / f - 0.5)), len = Math.floor(sr * LEN);
    const buf = c.createBuffer(1, len, sr), y = buf.getChannelData(0), r = prng(midi * 31 + 7);
    const ex = new Float32Array(N);
    let s = 0, mean = 0;
    for (let i = 0; i < N; i++) { s += 0.8 * (r() * 2 - 1 - s); ex[i] = s; }
    const off = Math.max(1, Math.round(N * 0.12));
    for (let i = N - 1; i >= off; i--) ex[i] -= 0.85 * ex[i - off];
    for (let i = 0; i < N; i++) mean += ex[i] / N;
    const fa = sr / (N + 0.5), T60 = 0.75 - (midi - 55) * 0.012;
    const rho = Math.min(0.9999, Math.pow(0.001, 1 / (fa * T60)) / Math.cos((Math.PI * fa) / sr));
    for (let n = 0; n < len; n++) {
      y[n] = n < N ? ex[n] - mean : rho * 0.5 * (y[n - N] + (n > N ? y[n - N - 1] : 0));
    }
    let pk = 0;
    for (let n = 0; n < len; n++) pk = Math.max(pk, Math.abs(y[n]));
    const fade = Math.floor(0.03 * sr);
    for (let n = 0; n < len; n++) y[n] *= (0.9 / (pk || 1)) * (n > len - fade ? (len - n) / fade : 1);
    buf.rate = f / fa; // (its playback rate: the exact pitch)
    return buf;
  });
}
function string(ctx, dest, t, { midi = 60, vel = 0.5, dur = 0.4, pan = 0, send = 0.15 } = {}) {
  const v = new Voice(ctx, dest, t, send, pan);
  const b = stringBuf(ctx, midi), s = v.buffer(b, t, Math.min(t + dur + 0.2, t + b.duration)), g = v.gain(vel * 1.2);
  s.playbackRate.value = b.rate;
  g.gain.setValueAtTime(vel * 1.2, t + dur);
  g.gain.setTargetAtTime(0, t + dur, 0.04);
  v.conn(s, g, v.out);
  return v.done();
}

function build(variant) {
  const bars = Array.from({ length: CH.length }, () => new Array(16).fill(null));
  const ev = (b, s, lay, fn, p, len = 0) => (bars[b][s] || (bars[b][s] = [])).push({ lay, fn, p, len });
  CH.forEach((c, b) => {
    for (const [sym, s0, len] of halves(c)) {
      const ch = chord(sym), r = above(ch.root, 55);
      // pumpkin patch: broken chords in eighths on the plucked string, under the tune
      const tones = [r, r + ch.ivs[1], r + ch.ivs[2], r + 12, r + 12 + ch.ivs[1]].map(m => (m > 71 ? m - 12 : m));
      const pat = variant ? [0, 3, 2, 4, 1, 3, 2, 4] : [0, 2, 3, 1, 4, 2, 3, 1];
      for (let s = s0; s < s0 + len; s += 2) {
        const m = tones[pat[s / 2]];
        STRING_NOTES.add(m);
        ev(b, s, 'autumn', string, { midi: m, vel: s % 4 ? 0.3 : 0.38, dur: 0.42, pan: -0.35, send: 0.16 });
      }
      // snow day: a soft pad on the chord (root, third and seventh, or the triad), round middle C
      const pick = ch.ivs.length >= 4 ? [0, 1, 3] : [0, 1, 2];
      ev(b, s0, 'winter', I.pad, { midis: pick.map(i => above((ch.root + ch.ivs[i]) % 12, 57)), vel: 0.6, attack: 0.7, release: 1, bright: 0.55, send: 0.4, pan: 0.1 }, len);
    }
    const cur = Array.isArray(c) ? c[1] : c, ch = chord(cur);
    // pumpkin patch: soft claps on the off-beats (the song claps on 2 and 4; not where it fills, bar 16)
    if (b !== 15) {
      ev(b, 6, 'autumn', I.clap, { vel: 0.2, pan: 0.3, send: 0.2 });
      ev(b, 14, 'autumn', I.clap, { vel: variant && b % 2 ? 0.28 : 0.22, pan: -0.25, send: 0.2 });
    }
    // snow day: two glockenspiel notes a bar, high on the chord (not where the song has its own: bars 8, 10, 16)
    if (![7, 9, 15].includes(b)) {
      const hi = ch.pcs.map(pc => above(pc, 84)).sort((x, y) => x - y);
      const [s1, s2] = variant ? [6, 14] : [2, 10];
      ev(b, s1, 'winter', I.mallet, { midi: hi[b % hi.length], vel: 0.2, kind: 'glock', pan: 0.35, send: 0.4 });
      ev(b, s2, 'winter', I.mallet, { midi: hi[(b + 2) % hi.length], vel: 0.15, kind: 'glock', pan: -0.3, send: 0.4 });
    }
  });
  return bars;
}
// (the song's tempo, swing and level: songs.js DEFS.golf)
const SONG = { name: 'golf-yards', bpm: 112, swing: 0.56, loopStart: 0, level: 0.9, layers: LAYERS, variants: [build(0), build(1)] };

// What the layer leans on in src/audio, which is not its own: the engine's playing Track (audio._track)
// and five of that Track's fields, the Track's methods, and the golf song's tempo, swing and length.
// songTrouble(audio, g) lists whatever of that is missing or not as expected ([] when all is well).
// If anything is, the layer turns itself off with one console.warn: no music layer, never one out of
// step or counting in NaN.
const CLOCK = ['bar', 'step', 'loop', 'beatT', 't', 'tempo'];
const num = x => typeof x === 'number' && Number.isFinite(x);
export function songTrouble(audio, g = null) {
  const bad = [];
  if (!audio || typeof audio !== 'object') return ['audio'];
  for (const k of ['_track', 'track', 'musicOn']) if (!(k in audio)) bad.push('audio.' + k);
  for (const k of ['start', 'schedule', 'resync', 'setLayer', '_advance']) if (typeof Track.prototype[k] !== 'function') bad.push('Track.' + k);
  if (g) {
    for (const k of CLOCK) if (!num(g[k])) bad.push('track.' + k);
    if (typeof g.done !== 'boolean') bad.push('track.done');
    const s = g.song, v = s && Array.isArray(s.variants) && s.variants[0];
    if (!s || s.bpm !== SONG.bpm || s.swing !== SONG.swing || (s.loopStart || 0) !== SONG.loopStart || !v || v.length !== CH.length) bad.push('track.song (not the golf song as layer.js knows it)');
  }
  return bad;
}

/** makeLayer(ctx, dest, audio) -> { tick(look, now), inStep(), off() }; never throws, warn: for the tests */
export function makeLayer(ctx, dest, audio, warn = (...a) => console.warn(...a)) {
  let tr = null, off = '', song = null; // song: the golf song's Track we keep in step with
  const quit = (why, now) => {
    if (off) return;
    off = why;
    warn('[golf sound] music layer off: ' + why);
    try { if (tr) for (const k of LAYERS) tr.setLayer(k, 0, now, 0.3); } catch { /* as it can */ }
  };
  const bad = songTrouble(audio);
  if (bad.length) quit(bad.join(', '), 0);
  else {
    try {
      tr = new Track(ctx, dest, SONG);
      const t0 = ctx.currentTime;
      tr.start(t0, 0);
      for (const k of LAYERS) tr.setLayer(k, 0, t0, 0.01);
    } catch (e) { quit(String(e), 0); }
  }
  const copy = g => { tr.bar = g.bar; tr.step = g.step; tr.loop = g.loop; tr.beatT = g.beatT; tr.t = g.t; };
  return {
    tr,
    /** why it is off ('' while it plays) */
    off: () => off,
    /** (for the tests) whether it counts the same steps as the song: both run on to the same time */
    inStep() {
      const g = audio && audio._track;
      if (off || !g || g !== song) return null;
      const a = { ...g, song: g.song }, b = { ...tr, song: tr.song }, adv = Track.prototype._advance;
      for (let n = 0; n < 4096 && Math.abs(a.t - b.t) > 1e-9; n++) adv.call(a.t < b.t ? a : b);
      return a.bar === b.bar && a.step === b.step && a.loop === b.loop && Math.abs(a.t - b.t) < 1e-9;
    },
    tick(look, now) {
      if (off) return;
      try {
        const g = audio._track, golf = !!g && audio.track === 'golf';
        if (g === undefined && !('_track' in audio)) return quit('audio._track', now);
        if (golf && g !== song) { const why = songTrouble(audio, g); if (why.length) return quit(why.join(', '), now); }
        if (!golf || g.done || g.tempo !== 1) {
          if (song) { song = null; for (const k of LAYERS) tr.setLayer(k, 0, now, 0.3); }
          return;
        }
        if (g !== song || !(tr.t >= now - 0.1)) {
          // a new song, or the main thread stalled: from the song's own position, and then (as audio.js
          // does for the song) on past the steps already gone by, whole steps on the song's grid, so the
          // layer stays in step and never plays all it missed at once
          for (const k of CLOCK) if (!num(g[k])) return quit('track.' + k, now);
          song = g;
          copy(g);
          if (tr.t < now) tr.resync(now + 0.02);
        }
        tr.silent = !audio.musicOn;
        for (const k of LAYERS) tr.setLayer(k, k === look ? 1 : 0, now, 1.2);
        tr.schedule(now + 0.3);
        if (!num(tr.t) || !(tr.t >= now)) quit('its clock went wrong (t ' + tr.t + ' at ' + now.toFixed(2) + ')', now);
      } catch (e) { quit(String(e), now); }
    },
  };
}

/** A self-check of the layer against src/audio as it is now, for a test (no sound is made: nothing is
 *  rendered). ctx: an (Offline)AudioContext; audio: the game's engine, to check it still has what the
 *  layer reads. -> { ok, problems: [...] } */
export function layerSelfCheck(ctx, audio = null) {
  const problems = [], fail = s => problems.push(s);
  const sink = ctx.createGain();
  sink.gain.value = 0;
  if (audio) for (const p of songTrouble(audio)) fail('the engine: ' + p);
  const fake = song => ({ _track: song, track: 'golf', musicOn: true });
  try {
    // 1. in step with a golf song Track run as audio.js runs it
    const song = new Track(ctx, sink, getSong('golf'));
    song.silent = true;
    song.start(0.1, 0);
    song.schedule(3.3);
    const warns = [], L = makeLayer(ctx, sink, fake(song), w => warns.push(w));
    for (const p of songTrouble(fake(song), song)) fail('the golf song: ' + p);
    let late = 0, now = 3.2;
    if (L.tr) L.tr._play = t => { if (t < now - 1e-6) late++; }; // (counts the notes, plays none)
    L.tick('autumn', now);
    if (L.off()) fail('off at the start: ' + L.off());
    else if (L.inStep() !== true) fail('not in step with the song');
    // 2. a 3 s stall: the song not moved on yet (audio.js's timer stalled too); no note played late
    now = 6.2;
    L.tick('autumn', now);
    song.resync(now + 0.02); song.schedule(now + 0.15); // (then the song catches up, as audio.js does)
    if (late) fail(late + ' notes played late after a stall');
    if (!L.off() && L.inStep() !== true) fail('out of step after a stall');
    if (!(L.tr && L.tr.t >= now)) fail('behind after a stall');
    // 3. the engine without _track, or a Track field gone: off, quietly, one warning, no NaN
    const w1 = [], L1 = makeLayer(ctx, sink, { track: 'golf', musicOn: true }, w => w1.push(w));
    for (let i = 0; i < 3; i++) L1.tick('autumn', 7 + i);
    if (!L1.off() || w1.length !== 1) fail('no _track: off ' + JSON.stringify(L1.off()) + ', ' + w1.length + ' warnings');
    const g2 = new Track(ctx, sink, getSong('golf'));
    g2.silent = true;
    g2.start(0.1, 0);
    delete g2.beatT;
    const w2 = [], L2 = makeLayer(ctx, sink, fake(g2), w => w2.push(w));
    for (let i = 0; i < 3; i++) L2.tick('winter', 1 + i);
    if (!L2.off() || w2.length !== 1 || !num(L2.tr.t)) fail('no beatT: off ' + JSON.stringify(L2.off()) + ', ' + w2.length + ' warnings, t ' + L2.tr.t);
    const a3 = { ...fake(song), musicOn: false }, w3 = [], L3 = makeLayer(ctx, sink, a3, w => w3.push(w));
    L3.tick('winter', 6.3);
    delete a3._track;
    for (let i = 0; i < 3; i++) L3.tick('winter', 6.4 + i);
    if (!L3.off() || w3.length !== 1) fail('_track gone later: off ' + JSON.stringify(L3.off()) + ', ' + w3.length + ' warnings');
    for (const T of [song, L.tr, g2, L2.tr, L3.tr]) if (T) T.dispose();
  } catch (e) { fail('threw: ' + e); }
  try { sink.disconnect(); } catch { /* gone */ }
  return { ok: !problems.length, problems };
}
