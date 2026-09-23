// Automatic self-check: renders every one-shot, voice, loop and ~6 s of each music track into an
// OfflineAudioContext (no user gesture needed) and measures peak / short-term RMS / length.
// One-shots are measured at unity bus gain with the reverb send but without the master
// compressor, i.e. the sounds as designed; "FULL MIX" renders through the real master chain.
import { reverbIR, pick, mtof } from './core.js';
import * as S from './sfx.js';
import * as I from './instruments.js';
import { babble, BABBLE_VOICES, choir } from './voices.js';
import { getSong, strum } from './songs.js';
import { Track, Roller } from './sequencer.js';
import { createMixer, createSpeaker } from './audio.js';

const SR = 44100, T0 = 0.05;
export const VOICE_ONLY_KEYS = S.CALL_KEYS;

function buses(ctx, dry = false) {
  const wet = ctx.createGain();
  if (!dry) {
    const rv = ctx.createConvolver();
    rv.normalize = false; rv.buffer = reverbIR(ctx); rv.connect(ctx.destination);
    wet.connect(rv);
  }
  const sfx = ctx.createGain(); sfx.connect(ctx.destination); sfx._wet = wet;
  const music = ctx.createGain(); music.connect(ctx.destination); music._wet = wet;
  return { sfx, music, wet };
}
function playTrack(ctx, dest, song, { startBar = 0, intensity = 1, hurry = false, until = 6 } = {}) {
  const tr = new Track(ctx, dest, typeof song === 'string' ? getSong(song) : song);
  const g = { L0: 1, L1: intensity >= 0.2 ? 1 : 0, L2: intensity >= 0.45 ? 1 : 0, L3: intensity >= 0.7 ? 1 : 0, hurry: hurry ? 1 : 0 };
  for (const k in tr.lay) tr.setLayer(k, g[k] ?? 1, 0, 0.001);
  if (hurry) tr.tempo = 1.07;
  tr.start(0.02, 0, startBar);
  tr.schedule(until);
  return tr;
}

export function checkList() {
  const L = [];
  const add = (name, dur, fn, kind = 'oneshot', long = false) => L.push({ name, dur, fn, kind, long });
  for (const k of S.PICKUP_KEYS) add(`pickup:${k}`, k === 'gong' ? 3.4 : 1.6, (c, b) => S.pickupSound(c, b.sfx, T0, { key: k, rel: 0.15, size: 0.5 }), 'oneshot', k === 'gong');
  add('pickup:tiny rel=.02', 1, (c, b) => S.pickupSound(c, b.sfx, T0, { key: 'tiny', rel: 0.02, size: 0.02 }));
  add('pickup:hard rel=.7', 1, (c, b) => S.pickupSound(c, b.sfx, T0, { key: 'hard', rel: 0.7, size: 3 }));
  add('pickup:crash rel=.7', 1.6, (c, b) => S.pickupSound(c, b.sfx, T0, { key: 'crash', rel: 0.7, size: 8 }));
  add('pickup:burst x12', 2, (c, b) => {
    for (let i = 0; i < 12; i++) S.pickupSound(c, b.sfx, T0 + i * 0.03, { key: pick(['tiny', 'soft', 'hard', 'paper', 'wood']), rel: 0.08, combo: i, character: i < 5 });
  }, 'mix');
  for (const k of VOICE_ONLY_KEYS) add(`voice:${k}`, 1.6, (c, b) => S.characterVoice(c, b.sfx, T0, k, { vel: 0.85 }));
  add('bump 0.2', 1, (c, b) => S.bump(c, b.sfx, T0, { strength: 0.2 }));
  add('bump 1.0', 1, (c, b) => S.bump(c, b.sfx, T0, { strength: 1 }));
  add('knock 1', 1.2, (c, b) => S.knock(c, b.sfx, T0, { count: 1 }));
  add('knock 6', 1.2, (c, b) => S.knock(c, b.sfx, T0, { count: 6 }));
  add('dash', 1, (c, b) => S.dash(c, b.sfx, T0));
  for (const l of [1, 4, 8]) add(`milestone ${l}`, l === 8 ? 3.6 : 2.4, (c, b) => S.milestone(c, b.sfx, T0, { level: l }), 'oneshot', l >= 6);
  add('tick 9', 0.6, (c, b) => S.tick(c, b.sfx, T0, { secondsLeft: 9 }));
  add('tick 2', 0.6, (c, b) => S.tick(c, b.sfx, T0, { secondsLeft: 2 }));
  add('timeUp', 2.8, (c, b) => S.timeUp(c, b.sfx, T0), 'oneshot', true);
  for (const k of ['click', 'hover', 'open', 'close', 'start', 'pause']) add(`ui:${k}`, 1.6, (c, b) => S.ui(c, b.sfx, T0, k));
  for (const v of BABBLE_VOICES) add(`babble:${v} x4`, 0.6, (c, b) => { for (let i = 0; i < 4; i++) babble(c, b.sfx, T0 + i * 0.09, { voice: v, vel: 0.7 }); });
  add('launch', 4.6, (c, b) => S.launch(c, b.sfx, T0), 'oneshot', true);
  add('patch', 5.6, (c, b) => S.patch(c, b.sfx, T0), 'oneshot', true);
  add('fireworks', 2.4, (c, b) => S.fireworks(c, b.sfx, T0), 'oneshot', true);
  add('squareDanceStop scratch', 1, (c, b) => S.scratch(c, b.sfx, T0));
  add('inst:zheng D5', 2, (c, b) => I.pluck(c, b.music, T0, { midi: 74, vel: 0.8 }), 'inst');
  add('inst:pipa D5', 2, (c, b) => I.pluck(c, b.music, T0, { midi: 74, vel: 0.8, kind: 'pipa' }), 'inst');
  add('inst:dizi D5 1s', 2, (c, b) => I.dizi(c, b.music, T0, { midi: 74, dur: 1, vel: 0.8 }), 'inst');
  add('inst:erhu C5 1s', 2, (c, b) => I.erhu(c, b.music, T0, { midi: 72, dur: 1, vel: 0.8 }), 'inst');
  add('inst:brass C5 1s', 2, (c, b) => I.brass(c, b.music, T0, { midi: 72, dur: 1, vel: 0.8 }), 'inst');
  add('inst:epiano 4-chord', 2, (c, b) => { for (const m of [61, 64, 66, 69]) I.epiano(c, b.music, T0, { midi: m, dur: 1, vel: 0.5 }); }, 'inst');
  add('inst:bass D2', 1, (c, b) => I.bass(c, b.music, T0, { midi: 38, dur: 0.4, vel: 0.8 }), 'inst');
  add('inst:kick', 1, (c, b) => I.kick(c, b.music, T0, { vel: 0.85 }), 'inst');
  add('inst:snare', 1, (c, b) => I.snare(c, b.music, T0, { vel: 0.6 }), 'inst');
  add('inst:hat', 1, (c, b) => I.hat(c, b.music, T0, { vel: 0.34 }), 'inst');
  add('inst:woodblock', 1, (c, b) => I.woodblock(c, b.music, T0, { vel: 0.4 }), 'inst');
  add('inst:gong 110', 4, (c, b) => I.gong(c, b.music, T0, { f: 110, vel: 0.5, dur: 4 }), 'inst');
  add('inst:smallGong', 1.2, (c, b) => I.smallGong(c, b.music, T0, { vel: 0.5 }), 'inst');
  add('inst:cymbal', 1.5, (c, b) => I.cymbal(c, b.music, T0, { vel: 0.45, dur: 1.2 }), 'inst');
  add('inst:pad 4 notes', 3, (c, b) => I.pad(c, b.music, T0, { midis: [55, 59, 62, 69], dur: 2, vel: 0.55 }), 'inst');
  add('inst:choir 4 notes', 3, (c, b) => choir(c, b.music, T0, { midis: [62, 66, 69, 74], dur: 2, vel: 0.4 }), 'inst');
  add('inst:bell E6', 2, (c, b) => I.bell(c, b.music, T0, { midi: 88, vel: 0.2, dur: 2 }), 'inst');
  add('roll small fast', 2, (c, b) => { const r = new Roller(c, b.sfx); r.update(0.9, 0.3); r.tick(0, 2); }, 'loop');
  add('roll big fast', 2, (c, b) => { const r = new Roller(c, b.sfx); r.update(0.9, 80); r.tick(0, 2); }, 'loop');
  add('roll slow mid', 2, (c, b) => { const r = new Roller(c, b.sfx); r.update(0.15, 3); r.tick(0, 2); }, 'loop');
  add('music:title', 6, (c, b) => playTrack(c, b.music, 'title'), 'music');
  add('music:game intro i=0', 6, (c, b) => playTrack(c, b.music, 'game', { intensity: 0 }), 'music');
  add("music:game A' i=1", 6, (c, b) => playTrack(c, b.music, 'game', { startBar: 12, intensity: 1 }), 'music');
  add('music:game B hurry', 6, (c, b) => playTrack(c, b.music, 'game', { startBar: 20, intensity: 1, hurry: true }), 'music');
  add('music:game C->A3 i=.5', 6, (c, b) => playTrack(c, b.music, 'game', { startBar: 34, intensity: 0.5 }), 'music');
  add('music:game luogu', 6, (c, b) => playTrack(c, b.music, 'game', { startBar: 43, intensity: 1 }), 'music');
  add('music:finale', 6, (c, b) => playTrack(c, b.music, 'finale'), 'music');
  add('music:finale B', 6, (c, b) => playTrack(c, b.music, 'finale', { startBar: 8 }), 'music');
  add('music:dance (speaker)', 6, (c, b) => { const sp = createSpeaker(c, c.destination, b.wet); sp.out.gain.value = 0.9; playTrack(c, sp.in, 'dance'); }, 'music');
  add('FULL MIX master chain', 6, c => {
    const m = createMixer(c, c.destination);
    playTrack(c, m.music, 'game', { startBar: 12, intensity: 1 });
    m.dance.out.gain.value = 0.45; m.duck.gain.value = 0.7;
    playTrack(c, m.dance.in, 'dance');
    const r = new Roller(c, m.sfx); r.update(0.8, 2); r.tick(0, 6);
    for (let i = 0; i < 40; i++) S.pickupSound(c, m.sfx, 0.2 + i * 0.13, { key: pick(S.PICKUP_KEYS.filter(k => k !== 'gong')), rel: 0.05 + Math.random() * 0.6, size: 1, combo: i % 5 });
    S.milestone(c, m.sfx, 3, { level: 8 });
    S.bump(c, m.sfx, 4.5, { strength: 1 });
  }, 'mix');
  return L;
}

export function measure(buf) {
  const n = buf.length, sr = buf.sampleRate, chs = [];
  for (let c = 0; c < buf.numberOfChannels; c++) chs.push(buf.getChannelData(c));
  let peak = 0, bad = 0;
  const pw = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) {
    let p = 0;
    for (const d of chs) { const x = d[i]; if (!Number.isFinite(x)) { bad++; continue; } const a = Math.abs(x); if (a > peak) peak = a; p += x * x; }
    pw[i + 1] = pw[i] + p / chs.length;
  }
  const W = Math.min(n, Math.floor(0.3 * sr)), H = Math.floor(0.05 * sr);
  let maxMs = 0;
  for (let s = 0; s + W <= n; s += H) maxMs = Math.max(maxMs, (pw[s + W] - pw[s]) / W);
  const thr = Math.max(peak * 0.01, 0.001); // -40 dB below peak (or -60 dBFS)
  let last = 0;
  for (const d of chs) for (let i = n - 1; i >= 0; i--) if (Math.abs(d[i]) > thr) { last = Math.max(last, i); break; }
  const db = x => (x > 0 ? 20 * Math.log10(x) : -Infinity);
  return { peak: db(peak), rms: maxMs > 0 ? 10 * Math.log10(maxMs) : -Infinity, avg: pw[n] > 0 ? 10 * Math.log10(pw[n] / n) : -Infinity, len: last / sr, bad };
}

// Renders everything; returns { rows, text, silent, clip, errors }.
export async function runSelfCheck(onProgress) {
  const rows = [];
  const list = checkList();
  const t0 = performance.now();
  for (const c of list) {
    const row = { name: c.name, kind: c.kind };
    try {
      const ctx = new OfflineAudioContext(2, Math.ceil(SR * c.dur), SR);
      c.fn(ctx, buses(ctx));
      Object.assign(row, measure(await ctx.startRendering()));
      if (c.kind === 'oneshot') { // length without the reverb tail
        const dctx = new OfflineAudioContext(2, Math.ceil(SR * c.dur), SR);
        c.fn(dctx, buses(dctx, true));
        row.len = measure(await dctx.startRendering()).len;
      }
      const f = [];
      if (row.bad) f.push('NaN');
      if (row.peak < -45) f.push('SILENT');
      if (row.peak > -0.3) f.push('CLIP');
      if (c.kind === 'oneshot' && row.peak > -3) f.push('hot');
      if (c.kind === 'oneshot' && row.peak < -18) f.push('quiet');
      if (c.kind === 'oneshot' && !c.long && row.len > 1.2) f.push('long');
      row.flags = f;
    } catch (e) { row.error = String(e && e.stack || e); row.flags = ['ERROR']; }
    rows.push(row);
    if (onProgress) onProgress(rows.length, list.length, row);
  }
  const ms = performance.now() - t0;
  const fmt = (x, w = 7) => (Number.isFinite(x) ? x.toFixed(1) : '-inf').padStart(w);
  const lines = [`${'sound'.padEnd(26)} ${'peak dB'.padStart(7)} ${'rms300'.padStart(7)} ${'avg dB'.padStart(7)} ${'len s'.padStart(6)}  flags`];
  for (const r of rows) {
    lines.push(r.error ? `${r.name.padEnd(26)} ERROR ${r.error.split('\n')[0]}`
      : `${r.name.padEnd(26)} ${fmt(r.peak)} ${fmt(r.rms)} ${fmt(r.avg)} ${r.len.toFixed(2).padStart(6)}  ${r.flags.join(' ')}`);
  }
  const silent = rows.filter(r => r.flags.includes('SILENT')).length;
  const clip = rows.filter(r => r.flags.includes('CLIP')).length;
  const errors = rows.filter(r => r.error || r.bad).length;
  lines.push(`SELF-CHECK ${silent || clip || errors ? 'FAIL' : 'OK'}: ${rows.length} renders in ${(ms / 1000).toFixed(1)} s, silent=${silent} clip=${clip} errors=${errors}`);
  return { rows, text: lines.join('\n'), silent, clip, errors };
}

// Mixing console: renders each instrument of a song on its own (same bars, same layers) and
// reports its level, so the arrangement can be balanced without listening. test page: ?diag
export async function diagSongs() {
  const names = new Map([...Object.entries(I).filter(([, f]) => typeof f === 'function'), ['choir', choir], ['strum', strum]].map(([k, f]) => [f, k]));
  const cases = [['title', {}], ['game', { startBar: 4, intensity: 0 }], ['game', { startBar: 12, intensity: 1 }], ['game', { startBar: 20, intensity: 1 }],
    ['game', { startBar: 28, intensity: 1 }], ['finale', { startBar: 8 }], ['dance', {}]];
  const fmt = x => (Number.isFinite(x) ? x.toFixed(1) : '-inf').padStart(7);
  const out = [];
  for (const [name, o] of cases) {
    const song = getSong(name), fns = new Set();
    for (const bars of song.variants) for (const bar of bars) for (const slot of bar) if (slot) for (const e of slot) fns.add(e.fn);
    const rows = [];
    for (const fn of [...fns, null]) {
      const only = fn ? { ...song, variants: song.variants.map(bars => bars.map(bar => bar.map(slot => slot && slot.filter(e => e.fn === fn)))) } : song;
      const ctx = new OfflineAudioContext(2, SR * 6, SR), b = buses(ctx);
      let dest = b.music;
      if (name === 'dance') { const sp = createSpeaker(ctx, ctx.destination, b.wet); sp.out.gain.value = 0.9; dest = sp.in; }
      playTrack(ctx, dest, only, o);
      const r = measure(await ctx.startRendering());
      rows.push({ label: fn ? names.get(fn) || '?' : 'ALL', ...r });
    }
    rows.sort((a, b) => b.avg - a.avg);
    out.push(`${name} ${JSON.stringify(o)}   (peak / rms300 / avg dB)\n` + rows.map(r => `  ${r.label.padEnd(11)}${fmt(r.peak)}${fmt(r.rms)}${fmt(r.avg)}`).join('\n'));
  }
  return out.join('\n');
}

// Karplus–Strong tuning: autocorrelation pitch of the cached string buffers vs. equal temperament.
export function tuningCheck() {
  const ctx = new OfflineAudioContext(1, 1, SR);
  const res = [];
  for (const kind of ['zheng', 'pipa', 'harp']) {
    for (const midi of [45, 50, 57, 62, 69, 74, 81, 86, 93, 98]) {
      const d = I.ksBuffer(ctx, kind, midi).getChannelData(0);
      const f = mtof(midi), P = SR / f, a = Math.floor(0.08 * SR), n = Math.min(4096, d.length - a - 2 * Math.ceil(P) - 4);
      const ac = lag => { let s = 0, e1 = 0, e2 = 0; for (let i = 0; i < n; i++) { const x = d[a + i], y = d[a + i + lag]; s += x * y; e1 += x * x; e2 += y * y; } return s / Math.sqrt(e1 * e2 || 1); };
      let best = 0, bl = 0;
      for (let l = Math.floor(P * 0.8); l <= Math.ceil(P * 1.25); l++) { const v = ac(l); if (v > best) { best = v; bl = l; } }
      const y0 = ac(bl - 1), y1 = best, y2 = ac(bl + 1), den = y0 - 2 * y1 + y2;
      const lag = bl + (den ? (0.5 * (y0 - y2)) / den : 0);
      res.push({ kind, midi, cents: 1200 * Math.log2(SR / lag / f) });
    }
  }
  const worst = res.reduce((w, r) => (Math.abs(r.cents) > Math.abs(w.cents) ? r : w));
  return `KS tuning: ${res.length} strings, worst ${worst.cents.toFixed(1)} cents (${worst.kind} midi ${worst.midi}); ` +
    res.filter(r => r.kind === 'zheng').map(r => `${r.midi}:${r.cents.toFixed(1)}`).join(' ');
}

// Renders every song's whole arrangement (intro + both loop variants) offline, scheduling
// incrementally with suspend() like the live look-ahead scheduler: catches errors at section /
// loop boundaries and reports whole-song levels. test page: ?full
export async function fullSongs() {
  const out = [];
  for (const [name, o] of [['title', {}], ['game', { intensity: 0.3 }], ['game', { intensity: 1, hurry: true }], ['finale', {}], ['dance', {}]]) {
    const song = getSong(name);
    const bars = song.variants[0].length + (song.variants[1].length - song.loopStart) + 1;
    const secs = (bars * 240) / (song.bpm * (o.hurry ? 1.07 : 1));
    const t0 = performance.now();
    const ctx = new OfflineAudioContext(2, Math.ceil(SR * secs), SR), b = buses(ctx);
    let dest = b.music;
    if (name === 'dance') { const sp = createSpeaker(ctx, ctx.destination, b.wet); sp.out.gain.value = 0.9; dest = sp.in; }
    const tr = playTrack(ctx, dest, name, { ...o, until: 0.6 });
    for (let t = 0.5; t < secs - 0.5; t += 0.5) {
      const tt = t;
      ctx.suspend(tt).then(() => { tr.schedule(tt + 0.6); ctx.resume(); });
    }
    const r = measure(await ctx.startRendering());
    out.push(`${name.padEnd(7)} ${JSON.stringify(o).padEnd(30)} ${bars} bars ${secs.toFixed(0)} s  peak ${r.peak.toFixed(1)}  rms300 ${r.rms.toFixed(1)}  avg ${r.avg.toFixed(1)} dB  ` +
      `loops=${tr.loop} errors=${tr.errors} nan=${r.bad}  (${((performance.now() - t0) / 1000).toFixed(1)} s)`);
  }
  return out.join('\n');
}
