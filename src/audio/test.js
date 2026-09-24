// Audio test bench (dist/audio-test.html): buttons for every API call, then an automatic
// offline self-check that runs without a user gesture and prints a level table to the console.
import { audio } from './audio.js';
import { runSelfCheck, diagSongs, tuningCheck, fullSongs, VOICE_ONLY_KEYS } from './selfcheck.js';
import { PICKUP_KEYS } from './sfx.js';
import { BABBLE_VOICES } from './voices.js';

const $ = (tag, attrs = {}, ...kids) => {
  const el = document.createElement(tag);
  for (const k in attrs) {
    if (k.startsWith('on')) el.addEventListener(k.slice(2), attrs[k]);
    else if (k === 'class') el.className = attrs[k];
    else el.setAttribute(k, attrs[k]);
  }
  el.append(...kids);
  return el;
};
const sleep = ms => new Promise(r => setTimeout(r, ms));
const app = document.getElementById('app');
const section = (title, ...kids) => app.append($('section', {}, $('h2', {}, title), ...kids));
const btn = (label, fn, cls = '') => $('button', { class: cls, onclick: async () => { await audio.init(); fn(); } }, label);
const row = (...kids) => $('div', { class: 'row' }, ...kids);
function slider(label, min, max, step, value, oninput, fmt = v => v) {
  const out = $('output', {}, String(fmt(value)));
  const inp = $('input', { type: 'range', min, max, step, value: String(value) });
  inp.addEventListener('input', () => { out.textContent = String(fmt(+inp.value)); oninput(+inp.value); });
  return $('label', { class: 'slider' }, label, inp, out);
}
function check(label, onchange) {
  const inp = $('input', { type: 'checkbox' });
  inp.addEventListener('change', async () => { await audio.init(); onchange(inp.checked); });
  return $('label', { class: 'check' }, inp, ' ' + label);
}

// ------------------------------------------------------------------ controls
const ui = { rel: 0.15, size: 0.5, dance: 0, strength: 0.6, voiceGain: 1, fade: 1.5, babbleVoice: 'nuwa' };
const muteBtn = btn('静音 mute: off', () => { muteBtn.textContent = '静音 mute: ' + (audio.toggleMute() ? 'ON' : 'off'); });
const musicBtn = btn('音乐 music: on', () => { musicBtn.textContent = '音乐 music: ' + (audio.toggleMusic() ? 'on' : 'OFF'); });
section('引擎 Engine',
  row(btn('init()', () => {}), btn('suspend()', () => audio.suspend()), btn('resume()', () => audio.resume()), muteBtn, musicBtn),
  slider('master', 0, 1, 0.01, 0.85, v => audio.setVolume('master', v)),
  slider('music', 0, 1, 0.01, 0.6, v => audio.setVolume('music', v)),
  slider('sfx', 0, 1, 0.01, 0.9, v => audio.setVolume('sfx', v)));

section('音乐 Music',
  row(...['title', 'game', 'finale'].map(t => btn(t, () => audio.music(t, { fade: ui.fade }))), btn('stop (null)', () => audio.music(null, { fade: ui.fade }))),
  slider('fade s', 0, 4, 0.1, 1.5, v => { ui.fade = v; }),
  slider('intensity', 0, 1, 0.01, 0, v => audio.setIntensity(v)),
  row(check('hurry (last 60 s)', on => audio.setHurry(on))));

section('广场舞 Square dance',
  slider('gain01', 0, 1, 0.01, 0, v => { ui.dance = v; }),
  row(btn('squareDanceStop() — speaker rolled up', () => audio.squareDanceStop(), 'hot'), btn('revive (test only)', () => audio._reviveDance())));

section('拾取 pickup(sfx, rel, size)',
  slider('rel', 0.02, 0.7, 0.01, 0.15, v => { ui.rel = v; }),
  slider('size m', -2, 2.5, 0.01, -0.3, v => { ui.size = Math.pow(10, v); }, v => Math.pow(10, v).toPrecision(2)),
  row(...PICKUP_KEYS.map(k => btn(k, () => audio.pickup(k, ui.rel, ui.size), 'key'))),
  row(btn('burst ×30 (rate limit)', async () => {
    for (let i = 0; i < 30; i++) { audio.pickup(PICKUP_KEYS[(Math.random() * PICKUP_KEYS.length) | 0], 0.03 + Math.random() * 0.3, 0.3); await sleep(15); }
  })));

section('角色声 voice(key, gain)',
  slider('gain', 0, 1, 0.01, 1, v => { ui.voiceGain = v; }),
  row(...VOICE_ONLY_KEYS.map(k => btn(k, () => audio.voice(k, ui.voiceGain), 'key'))));

section('事件 Events',
  slider('bump strength', 0, 1, 0.01, 0.6, v => { ui.strength = v; }),
  row(btn('bump()', () => audio.bump(ui.strength)), btn('dash()', () => audio.dash()), ...[1, 3, 6].map(n => btn(`knock(${n})`, () => audio.knock(n)))),
  row(...[1, 2, 3, 4, 5, 6, 7, 8].map(l => btn(`milestone ${l}`, () => audio.milestone(l)))),
  row(btn('countdown 10→1 + timeUp', async () => {
    for (let s = 10; s >= 1; s--) { audio.tick(s); await sleep(1000); }
    audio.timeUp();
  }), btn('tick(3)', () => { audio.tick(11); audio.tick(3); }), btn('timeUp()', () => audio.timeUp())),
  row(...['click', 'hover', 'open', 'close', 'start', 'pause'].map(k => btn(`ui ${k}`, () => audio.ui(k)))));

section('终章 Finale',
  row(btn('launch()', () => audio.launch()), btn('patch()', () => audio.patch()), btn('fireworks()', () => audio.fireworks())),
  row(btn('▶ whole finale sequence', async () => {
    audio.music(null, { fade: 1 });
    audio.launch(); await sleep(3000);
    audio.patch(); await sleep(1500);
    audio.music('finale', { fade: 1 });
    for (let i = 0; i < 4; i++) { audio.fireworks(); await sleep(1400); }
  })));

const sel = $('select', {}, ...BABBLE_VOICES.map(v => $('option', { value: v }, v)));
sel.addEventListener('change', () => { ui.babbleVoice = sel.value; });
const txt = $('input', { type: 'text', placeholder: '打字试试 type here — one syllable per character' });
let lastLen = 0;
txt.addEventListener('input', async () => {
  await audio.init();
  const n = [...txt.value].length;
  if (n > lastLen) audio.babble(ui.babbleVoice);
  lastLen = n;
});
section('对话 babble(voice)',
  row(sel, ' ', btn('say a line', async () => {
    const line = '补天的石头不够大，快去滚更多东西吧！';
    for (const ch of line) { if (!/[，！。 ]/.test(ch)) audio.babble(ui.babbleVoice); await sleep(55); }
  })),
  row(txt));

// per-frame calls, exactly like the game loop
const stateEl = document.getElementById('state');
function frame() {
  if (audio.ready) {
    audio.squareDance(ui.dance);
    stateEl.textContent = `ctx ${audio.ctx.state} · t=${audio.ctx.currentTime.toFixed(1)}s · track ${audio.track || '-'} · music ${audio.musicOn ? 'on' : 'off'} · ${audio.muted ? 'MUTED' : 'unmuted'}`;
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// ------------------------------------------------------------------ automatic checks
function preInitCheck() {
  const errors = [];
  const calls = [
    () => audio.ready, () => audio.musicOn, () => audio.muted,
    () => audio.setVolume('master', 0.85), () => audio.setVolume('bogus', 7), () => audio.setVolume('sfx', NaN),
    () => audio.toggleMusic(), () => audio.toggleMusic(), () => audio.toggleMute(), () => audio.toggleMute(),
    () => audio.suspend(), () => audio.resume(), () => audio.music('game'), () => audio.music('nope'), () => audio.music(null),
    () => audio.setIntensity(0.5), () => audio.setIntensity('x'), () => audio.setIntensity(0), () => audio.setHurry(true), () => audio.setHurry(false),
    () => audio.squareDance(0.5), () => audio.squareDance(0), () => audio.squareDanceStop(),
    () => audio.pickup('meow', 0.1, 0.4), () => audio.pickup('???', NaN), () => audio.pickup(), () => audio.voice('scream_f'), () => audio.voice('nope', 2),
    () => audio.bump(1), () => audio.knock(3), () => audio.dash(), () => audio.milestone(3), () => audio.milestone(99), () => audio.tick(5), () => audio.timeUp(),
    () => audio.ui('click'), () => audio.ui('weird'), () => audio.babble(), () => audio.babble('martian'), () => audio.launch(), () => audio.patch(), () => audio.fireworks(),
  ];
  for (const f of calls) { try { f(); } catch (e) { errors.push(String(e)); } }
  const state = audio.ready === false && audio.musicOn === true && audio.muted === false;
  return `pre-init no-op check: ${errors.length || !state ? 'FAIL ' + errors.join('; ') : 'OK'} (${calls.length} calls, ready=${audio.ready})`;
}

async function liveCheck() {
  try {
    await Promise.race([audio.init(), sleep(2500)]);
    const ctx = audio.ctx;
    if (!ctx) return 'live check: no AudioContext in this browser';
    if (ctx.state !== 'running') return `live check: AudioContext is "${ctx.state}" (no user gesture yet) — skipped; click any button to start`;
    const an = ctx.createAnalyser();
    an.fftSize = 2048;
    audio.m.mute.connect(an);
    const buf = new Float32Array(an.fftSize);
    let peak = 0;
    const sample = () => { an.getFloatTimeDomainData(buf); for (let i = 0; i < buf.length; i++) peak = Math.max(peak, Math.abs(buf[i])); };
    audio.setIntensity(1);
    audio.music('game', { fade: 0.2 });
    const acts = [() => audio.pickup('meow', 0.2, 0.4), () => audio.pickup('tiny', 0.03, 0.02), () => audio.voice('honk'), () => audio.bump(0.8),
      () => audio.knock(3), () => audio.dash(), () => audio.milestone(2), () => audio.tick(3), () => audio.ui('click'), () => audio.babble('nuwa'),
      () => audio.setHurry(true), () => audio.setHurry(false), () => audio.music('title'), () => audio.music('game')];
    for (const a of acts) { a(); audio.squareDance(0.6); await sleep(70); sample(); }
    for (let i = 0; i < 12; i++) { audio.squareDance(0.6); await sleep(50); sample(); }
    const t = ctx.currentTime;
    audio.squareDance(0); audio.setIntensity(0); audio.music(null, { fade: 0.3 });
    await sleep(300);
    an.disconnect();
    return `live check: ctx running, t=${t.toFixed(2)} s, master-out peak ${(20 * Math.log10(peak || 1e-9)).toFixed(1)} dBFS (${peak > 0.001 ? 'sound OK' : 'SILENT?'})`;
  } catch (e) { return 'live check: ERROR ' + (e && e.stack || e); }
}

(async () => {
  const report = document.getElementById('report');
  if (/[?&]full\b/.test(location.search)) { const d = await fullSongs(); console.log('[full]\n' + d); report.textContent = d; window.__ready = true; return; }
  if (/[?&]diag\b/.test(location.search)) { const d = await diagSongs(); console.log('[diag]\n' + d); report.textContent = d; window.__ready = true; return; }
  const pre = preInitCheck();
  console.log('[selfcheck] ' + pre);
  const tune = tuningCheck();
  console.log('[selfcheck] ' + tune);
  const res = await runSelfCheck((i, n, r) => { report.textContent = `rendering ${i}/${n}: ${r.name}`; });
  console.log('[selfcheck]\n' + res.text);
  const live = await liveCheck();
  console.log('[selfcheck] ' + live);
  report.textContent = `${pre}\n${tune}\n${live}\n\n${res.text}`;
  window.__selfcheck = res;
  window.__ready = true;
})();
