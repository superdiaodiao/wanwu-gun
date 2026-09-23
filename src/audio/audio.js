// 万物皆可滚 · 女娲补天 — procedural sound engine (Web Audio API only, no audio files).
//
//   import { audio } from './audio/audio.js';
//   button.onclick = () => audio.init();           // from a user gesture (autoplay policy)
//   audio.music('game'); audio.setIntensity(0.4);   // looping music with intensity layers
//   every frame: audio.roll(speed01, ballDiameterMeters); audio.squareDance(proximity01);
//   events: audio.pickup('meow', rel, objectSizeMeters), audio.bump(0.7), audio.milestone(3) ...
//
// Every method is a safe no-op before init() and never throws.
// Mix: music / sfx / square-dance buses -> gentle compressor -> limiter -> master -> mute -> out,
// plus one generated convolution reverb fed by per-sound sends.
import { mkBus, busTarget, busKill, reverbIR, clipCurve, clamp, rnd, smoothstep, pentaRange } from './core.js';
import { ksBuffer } from './instruments.js';
import * as S from './sfx.js';
import { VOICES, babble as babbleSyllable } from './voices.js';
import { getSong } from './songs.js';
import { Track, Roller } from './sequencer.js';

export const DEFAULT_VOLUME = { master: 0.85, music: 0.6, sfx: 0.9 };
const LOOKAHEAD = 0.15, TIMER_MS = 25, HURRY_TEMPO = 1.07, DANCE_LEVEL = 0.9;
const MUSIC_TRACKS = ['title', 'game', 'finale'];
const wallNow = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

// ------------------------------------------------------------------ mixer
// Cheap outdoor loudspeaker: band-limited (HP 350 Hz / LP 3.5 kHz, 24 dB/oct), honky mids, a touch
// of waveshaper grit and a slapback echo. `out` is the proximity gain.
export function createSpeaker(ctx, dest, wetDest) {
  const G = v => { const g = ctx.createGain(); g.gain.value = v; return g; };
  const F = (type, f, q, gain = 0) => { const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; b.gain.value = gain; return b; };
  const s = { in: G(1), hp: F('highpass', 350, 0.7), hp2: F('highpass', 350, 0.7), honk: F('peaking', 1700, 1.1, 5),
    pre: G(1.3), shaper: ctx.createWaveShaper(), lp: F('lowpass', 3500, 0.9), lp2: F('lowpass', 3500, 0.7),
    post: G(0.5), echo: ctx.createDelay(0.5), fb: G(0.25), echoG: G(0.33), out: G(0) };
  s.shaper.curve = clipCurve(0.2);
  s.shaper.oversample = '2x';
  s.echo.delayTime.value = 0.11;
  s.in.connect(s.hp); s.hp.connect(s.hp2); s.hp2.connect(s.honk); s.honk.connect(s.pre); s.pre.connect(s.shaper);
  s.shaper.connect(s.lp); s.lp.connect(s.lp2); s.lp2.connect(s.post);
  s.post.connect(s.out); s.post.connect(s.echo); s.echo.connect(s.echoG); s.echoG.connect(s.out);
  s.echo.connect(s.fb); s.fb.connect(s.echo);
  s.out.connect(dest);
  if (wetDest) { s.wet = G(0.2); s.out.connect(s.wet); s.wet.connect(wetDest); }
  return s;
}
export function createMixer(ctx, dest = ctx.destination, vol = DEFAULT_VOLUME) {
  const G = v => { const g = ctx.createGain(); g.gain.value = v; return g; };
  const set = (c, o) => { for (const k in o) c[k].value = o[k]; };
  const m = {};
  m.comp = ctx.createDynamicsCompressor();
  set(m.comp, { threshold: -16, knee: 12, ratio: 2.5, attack: 0.01, release: 0.25 });
  m.limiter = ctx.createDynamicsCompressor();
  set(m.limiter, { threshold: -2.5, knee: 0, ratio: 20, attack: 0.002, release: 0.1 });
  m.master = G(vol.master);
  m.mute = G(1);
  m.comp.connect(m.limiter); m.limiter.connect(m.master); m.master.connect(m.mute); m.mute.connect(dest);
  m.reverb = ctx.createConvolver();
  m.reverb.normalize = false;
  m.reverb.buffer = reverbIR(ctx);
  m.reverbIn = G(1);
  m.reverbIn.connect(m.reverb); m.reverb.connect(m.comp);
  m.duck = G(1); m.duck.connect(m.comp);
  m.duckWet = G(1); m.duckWet.connect(m.reverbIn);
  m.music = G(vol.music); m.music.connect(m.duck);
  m.music._wet = G(vol.music); m.music._wet.connect(m.duckWet);
  m.sfx = G(vol.sfx); m.sfx.connect(m.comp);
  m.sfx._wet = G(vol.sfx); m.sfx._wet.connect(m.reverbIn);
  m.dance = createSpeaker(ctx, m.comp, m.reverbIn);
  return m;
}

// ------------------------------------------------------------------ engine
class AudioEngine {
  constructor() {
    this.ctx = null; this.m = null;
    this._vol = { ...DEFAULT_VOLUME }; this._musicOn = true; this._muted = false;
    this._want = null; this._trackName = null; this._track = null; this._old = [];
    this._intensity = 0; this._hurry = false;
    this._roller = null;
    this._dance = null; this._danceDead = false; this._danceG = 0; this._danceLoudAt = 0; this._danceSet = -1;
    this._fanfareDuck = 1; this._duckSet = -1; this._duckTimer = null;
    this._pickWin = []; this._combo = 0; this._lastPick = -9; this._nextPickT = 0;
    this._last = {}; this._groups = {}; this._lastTick = null;
    this._timer = null; this._userSuspended = false; this._initP = null; this._initAt = 0; this._errs = 0;
  }

  // ---------------------------------------------------------------- state
  get ready() { return !!(this.ctx && this.m); }
  get musicOn() { return this._musicOn; }
  get muted() { return this._muted; }
  get intensity() { return this._intensity; }
  get track() { return this._trackName; }

  init() {
    if (this._initP) { this._unlock(); return this._initP; }
    this._initP = new Promise(resolve => {
      try {
        const AC = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);
        if (!AC) { resolve(false); return; }
        let ctx;
        try { ctx = new AC({ latencyHint: 'interactive' }); } catch (e) { ctx = new AC(); }
        this.ctx = ctx;
        this.m = createMixer(ctx, ctx.destination, this._vol);
        this._initAt = wallNow();
        this._applyVolumes(0.005);
        this._installUnlock();
        this._unlock();
        this._loop();
        if (this._want) { const w = this._want; this._want = null; this.music(w, { fade: 0.6 }); }
        this._warm();
        let settled = false;
        const done = () => { if (!settled) { settled = true; resolve(true); } };
        if (ctx.state === 'running') done();
        else { ctx.resume().then(done, done); setTimeout(done, 1500); }
      } catch (e) { this._err(e); resolve(false); }
    });
    return this._initP;
  }
  setVolume(kind, v) {
    try {
      if (!(kind in this._vol)) return;
      const x = clamp(+v);
      if (Number.isNaN(x)) return;
      this._vol[kind] = x;
      this._applyVolumes();
    } catch (e) { this._err(e); }
  }
  toggleMusic() {
    this._musicOn = !this._musicOn;
    try { this._applyVolumes(); } catch (e) { this._err(e); }
    return this._musicOn;
  }
  toggleMute() {
    this._muted = !this._muted;
    try { this._applyVolumes(); } catch (e) { this._err(e); }
    return this._muted;
  }
  suspend() {
    if (!this.ctx) return Promise.resolve();
    try { this._userSuspended = true; return this.ctx.suspend().catch(() => {}); } catch (e) { this._err(e); return Promise.resolve(); }
  }
  resume() {
    if (!this.ctx) return Promise.resolve();
    try { this._userSuspended = false; return this.ctx.resume().catch(() => {}); } catch (e) { this._err(e); return Promise.resolve(); }
  }

  // ---------------------------------------------------------------- music
  music(track, { fade = 1.5 } = {}) {
    try {
      const name = MUSIC_TRACKS.includes(track) ? track : null;
      this._want = name;
      if (!this.ready || name === this._trackName) return;
      const ctx = this.ctx, t = ctx.currentTime + 0.05, f = clamp(+fade || 0, 0, 30);
      if (this._track) { this._track.fadeOut(t, Math.max(f, 0.05)); this._old.push(this._track); }
      this._track = null;
      this._trackName = name;
      if (!name) return;
      const tr = new Track(ctx, this.m.music, getSong(name));
      this._track = tr;
      this._applyLayers(true);
      tr.tempo = name === 'game' && this._hurry ? HURRY_TEMPO : 1;
      tr.silent = !this._musicOn;
      tr.start(t, f);
      tr.schedule(ctx.currentTime + LOOKAHEAD);
    } catch (e) { this._err(e); }
  }
  setIntensity(x) {
    try { this._intensity = clamp(+x || 0); this._applyLayers(); } catch (e) { this._err(e); }
  }
  setHurry(on) {
    try {
      this._hurry = !!on;
      if (this._track && this._trackName === 'game') this._track.tempo = this._hurry ? HURRY_TEMPO : 1;
      this._applyLayers();
    } catch (e) { this._err(e); }
  }
  _applyLayers(immediate = false) {
    const tr = this._track;
    if (!tr || !this.ready) return;
    const x = this._intensity, now = this.ctx.currentTime, tau = immediate ? 0.005 : 0.5;
    const g = { L0: 1, L1: smoothstep(0.12, 0.28, x), L2: smoothstep(0.37, 0.53, x), L3: smoothstep(0.62, 0.78, x), hurry: this._hurry ? 1 : 0 };
    for (const k in tr.lay) tr.setLayer(k, g[k] ?? 1, now, tau);
  }

  // ---------------------------------------------------------------- continuous
  roll(speed01, sizeMeters) {
    if (!this.ready) return;
    try {
      const s = clamp(+speed01 || 0);
      if (!this._roller) {
        if (s < 0.02) return;
        this._roller = new Roller(this.ctx, this.m.sfx);
      }
      this._roller.update(s, +sizeMeters || 0.3);
    } catch (e) { this._err(e); }
  }
  squareDance(gain01) {
    if (!this.ready || this._danceDead) return;
    try {
      const g = clamp(+gain01 || 0);
      this._danceG = g;
      if (!this._dance && g > 0.001) {
        const tr = new Track(this.ctx, this.m.dance.in, getSong('dance'));
        tr.start(this.ctx.currentTime + 0.05, 0);
        this._dance = tr;
        this._danceLoudAt = this.ctx.currentTime;
      }
      this._applyDance(this.ctx.currentTime);
    } catch (e) { this._err(e); }
  }
  squareDanceStop() {
    if (!this.ready || this._danceDead) return;
    try {
      this._danceDead = true;
      const ctx = this.ctx, now = ctx.currentTime, m = this.m, g = this._danceG;
      if (this._dance) {
        const tr = this._dance;
        this._dance = null;
        tr.done = true;
        m.dance.lp.frequency.setTargetAtTime(160, now, 0.12); // tape-stop: the speaker dies
        m.dance.lp2.frequency.setTargetAtTime(160, now, 0.12);
        setTimeout(() => tr.dispose(), 3000);
      }
      this._danceSet = -1;
      this._applyDance(now);
      if (this._live()) S.scratch(ctx, this._group('sfx', 0.55 + 0.45 * Math.max(g, 0.4), 1, 12), now + 0.01);
    } catch (e) { this._err(e); }
  }
  // Test-page helper: bring the loudspeaker back after squareDanceStop() (not part of the game API).
  _reviveDance() {
    if (!this.ready) return;
    const now = this.ctx.currentTime;
    this._danceDead = false;
    this.m.dance.lp.frequency.setTargetAtTime(3500, now, 0.02);
    this.m.dance.lp2.frequency.setTargetAtTime(3500, now, 0.02);
  }
  _applyDance(now) {
    const m = this.m;
    if (!m) return;
    const target = this._danceDead ? 0 : this._danceG * DANCE_LEVEL * this._vol.sfx;
    if (Math.abs(target - this._danceSet) > 0.004) { this._danceSet = target; m.dance.out.gain.setTargetAtTime(target, now, 0.12); }
    const duck = (1 - 0.65 * (this._danceDead ? 0 : this._danceG)) * this._fanfareDuck;
    if (Math.abs(duck - this._duckSet) > 0.004) {
      this._duckSet = duck;
      m.duck.gain.setTargetAtTime(duck, now, 0.25);
      m.duckWet.gain.setTargetAtTime(duck, now, 0.25);
    }
  }

  // ---------------------------------------------------------------- one-shots
  /** combo: the game's pickup streak (1, 2, 3…); each step climbs the scale */
  pickup(sfx, rel = 0.1, sizeMeters = 0.5, combo = 0) {
    const ctx = this._live();
    if (!ctx) return;
    try {
      const now = ctx.currentTime, win = this._pickWin;
      while (win.length && now - win[0] > 0.3) win.shift();
      if (win.length >= 12) return; // > 40 pickups per second: drop the excess
      win.push(now);
      const burst = win.length;
      this._combo = combo > 0 ? combo - 1 : now - this._lastPick < 0.45 ? this._combo + 1 : 0;
      this._lastPick = now;
      const t = Math.max(now + 0.005, this._nextPickT);
      this._nextPickT = t + 0.022; // stagger simultaneous pickups
      const key = typeof sfx === 'string' ? sfx : 'hard';
      const cd = VOICES[key] ? 0.35 : key === 'gong' ? 1.5 : key === 'crash' || key === 'rumble' ? 0.25 : 0.06;
      const character = (burst <= 6 || Math.random() < 0.3) && this._cool('pk:' + key, cd);
      const lvl = burst <= 3 ? 1 : 1.7 / Math.sqrt(burst);
      const grp = this._group('pickup', lvl, key === 'gong' && character ? 3.2 : 1.4, 8);
      S.pickupSound(ctx, grp, t, { key, rel: +rel || 0.1, size: +sizeMeters || 0.5, combo: this._combo, character });
    } catch (e) { this._err(e); }
  }
  voice(key, gain = 1) {
    const ctx = this._live();
    if (!ctx) return;
    try {
      const g = clamp(+gain, 0, 1.5);
      if (!(g > 0.01) || !S.CALL_KEYS.includes(key)) return;
      if (!this._cool('voice:' + key, 0.45) || !this._cool('voice:any', 0.1)) return;
      S.characterVoice(ctx, this._group('voice', g, 1.4, 3), ctx.currentTime + 0.01, key, { vel: 0.85, pitch: rnd(0.94, 1.06), pan: rnd(-0.3, 0.3) });
    } catch (e) { this._err(e); }
  }
  bump(strength01 = 0.5) {
    this._fire('bump', 0.09, 0.8, (ctx, d, t) => S.bump(ctx, d, t, { strength: clamp(+strength01 || 0), pan: rnd(-0.2, 0.2) }));
  }
  knock(count = 1) {
    this._fire('knock', 0.15, 1, (ctx, d, t) => S.knock(ctx, d, t, { count: +count || 1 }));
  }
  dash() {
    this._fire('dash', 0.2, 0.8, (ctx, d, t) => S.dash(ctx, d, t));
  }
  /** every tenth step of a pickup streak: a bright little run, higher the longer the streak */
  comboChime(level = 1) {
    this._fire('combo', 0.15, 1.2, (ctx, d, t) => S.comboChime(ctx, d, t, { level: +level || 1 }));
  }
  milestone(level = 1) {
    this._fire('milestone', 0.4, 3.5, (ctx, d, t) => S.milestone(ctx, d, t, { level: +level || 1 }));
    this._duckMusic(0.55, 1.3);
  }
  tick(secondsLeft) {
    const s = Math.ceil(+secondsLeft);
    if (!(s >= 1 && s <= 10)) { if (s > 10) this._lastTick = null; return; }
    if (s === this._lastTick) return;
    this._lastTick = s;
    this._fire('tick', 0.05, 0.5, (ctx, d, t) => S.tick(ctx, d, t, { secondsLeft: s }));
  }
  timeUp() {
    this._lastTick = null;
    this._fire('timeUp', 1, 2.6, (ctx, d, t) => S.timeUp(ctx, d, t));
    this._duckMusic(0.4, 2);
  }
  ui(kind = 'click') {
    const k = ['click', 'hover', 'open', 'close', 'start', 'pause'].includes(kind) ? kind : 'click';
    this._fire('ui:' + k, k === 'hover' ? 0.05 : 0.04, 1.4, (ctx, d, t) => S.ui(ctx, d, t, k));
  }
  babble(voice = 'nuwa') {
    this._fire('babble', 0.035, 0.3, (ctx, d, t) => babbleSyllable(ctx, d, t, { voice, vel: 0.7 }), 'babble', 3);
  }
  launch() {
    this._fire('launch', 0.5, 4.5, (ctx, d, t) => S.launch(ctx, d, t), 'finale', 4);
  }
  patch() {
    this._fire('patch', 0.5, 5.5, (ctx, d, t) => S.patch(ctx, d, t), 'finale', 4);
  }
  fireworks() {
    this._fire('fireworks', 0.25, 2, (ctx, d, t) => S.fireworks(ctx, d, t), 'fireworks', 4);
  }

  // ---------------------------------------------------------------- internals
  _fire(key, cooldown, life, play, group = 'sfx', max = 12) {
    const ctx = this._live();
    if (!ctx) return;
    try {
      if (!this._cool(key, cooldown)) return;
      play(ctx, this._group(group, 1, life, max), ctx.currentTime + 0.005);
    } catch (e) { this._err(e); }
  }
  // Sounds are allowed while running, or in the first moments after init() while the context resumes.
  _live() {
    const ctx = this.ctx;
    if (!ctx || !this.m || this._userSuspended || ctx.state === 'closed') return null;
    if (ctx.state === 'running' || wallNow() - this._initAt < 1200) return ctx;
    return null;
  }
  _cool(key, sec) {
    const t = this.ctx.currentTime, last = this._last[key];
    if (last !== undefined && t >= last && t - last < sec) return false;
    this._last[key] = t;
    return true;
  }
  // Per-sound group bus (voice stealing + cleanup): the oldest group is faded out when full.
  _group(kind, gain, life, max) {
    const now = this.ctx.currentTime, list = this._groups[kind] || (this._groups[kind] = []);
    while (list.length >= max) {
      const old = list.shift();
      busTarget(old.bus, 0, now, 0.008);
      setTimeout(() => busKill(old.bus), 120);
    }
    const bus = mkBus(this.ctx, this.m.sfx, gain);
    list.push({ bus, end: now + life });
    return bus;
  }
  _prune(now) {
    for (const k in this._groups) {
      const list = this._groups[k];
      if (list.some(g => g.end < now)) this._groups[k] = list.filter(g => (g.end < now ? (busKill(g.bus), false) : true));
    }
  }
  _duckMusic(amount, seconds) {
    if (!this.ready) return;
    try {
      this._fanfareDuck = amount;
      this._applyDance(this.ctx.currentTime);
      clearTimeout(this._duckTimer);
      this._duckTimer = setTimeout(() => { this._fanfareDuck = 1; if (this.ready) this._applyDance(this.ctx.currentTime); }, seconds * 1000);
    } catch (e) { this._err(e); }
  }
  _applyVolumes(tau = 0.05) {
    const m = this.m;
    if (!m) return;
    const now = this.ctx.currentTime, v = this._vol;
    m.master.gain.setTargetAtTime(v.master, now, tau);
    m.mute.gain.setTargetAtTime(this._muted ? 0 : 1, now, 0.02);
    busTarget(m.music, this._musicOn ? v.music : 0, now, this._musicOn ? tau : 0.12);
    busTarget(m.sfx, v.sfx, now, tau);
    if (this._track) this._track.silent = !this._musicOn;
    this._danceSet = -1;
    this._applyDance(now);
  }
  _loop() {
    clearTimeout(this._timer);
    this._timer = setTimeout(() => this._loop(), TIMER_MS);
    const ctx = this.ctx;
    if (!ctx || !this.m || ctx.state !== 'running') return;
    try {
      const now = ctx.currentTime;
      const ahead = now + (typeof document !== 'undefined' && document.hidden ? 1.3 : LOOKAHEAD);
      for (const tr of [this._track, this._dance, ...this._old]) {
        if (!tr || tr.done) continue;
        if (tr.t < now - 0.1) tr.resync(now + 0.02);
        tr.schedule(ahead);
      }
      if (this._old.length) this._old = this._old.filter(tr => { if (!tr.done) return true; setTimeout(() => tr.dispose(), 4000); return false; });
      if (this._roller) this._roller.tick(now, ahead);
      if (this._dance) {
        if (this._danceG > 0.002) this._danceLoudAt = now;
        this._dance.silent = now - this._danceLoudAt > 2; // far away: keep time, skip notes
      }
      this._prune(now);
    } catch (e) { this._err(e); }
  }
  _installUnlock() {
    if (this._unlockInstalled || typeof window === 'undefined') return;
    this._unlockInstalled = true;
    const h = () => this._unlock();
    for (const ev of ['pointerdown', 'touchend', 'keydown', 'mousedown']) window.addEventListener(ev, h, { capture: true, passive: true });
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', () => { if (!document.hidden) this._loop(); });
  }
  _unlock() {
    const ctx = this.ctx;
    if (!ctx || this._userSuspended || ctx.state === 'running' || ctx.state === 'closed') return;
    try {
      ctx.resume().catch(() => {});
      const s = ctx.createBufferSource(); // iOS: play something inside the gesture
      s.buffer = ctx.createBuffer(1, 1, ctx.sampleRate);
      s.connect(ctx.destination);
      s.start(0);
    } catch (e) { /* ignore */ }
  }
  // Pre-render the most used plucked-string pitches in small idle chunks.
  _warm() {
    const ctx = this.ctx, jobs = [];
    for (const k of ['zheng', 'pipa']) for (const m of pentaRange(2, 50, 98)) jobs.push([k, m]);
    const step = () => {
      if (this.ctx !== ctx) return;
      try { for (let i = 0; i < 3 && jobs.length; i++) { const [k, m] = jobs.shift(); ksBuffer(ctx, k, m); } } catch (e) { this._err(e); return; }
      if (jobs.length) setTimeout(step, 20);
    };
    setTimeout(() => { try { getSong('game'); getSong('title'); } catch (e) { this._err(e); } step(); }, 30);
  }
  _err(e) {
    if (this._errs++ < 8) console.warn('[audio]', e);
  }
}

export const audio = new AudioEngine();
export default audio;
