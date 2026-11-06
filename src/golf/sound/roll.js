// The ball rolling: a soft brush on the grass, louder and a little brighter the faster it goes; duller
// and lower on mud, with a squelchy middle (so it is still heard on a phone's small speaker); a light
// hiss on ice, kept under 6-7 kHz and with a little of the grass's low thrum, so it is a ball sliding and
// not static. One looped noise feeds a filter per surface, and the surface under the ball turns its own
// up and the others down (a quick crossfade, no click). On grass and mud a slow random flutter (a second,
// very low noise, quicker the faster the ball) roughens it, as the ball runs over blades and ruts; the ice
// stays smooth. The noises run only while the ball moves: they are let go a moment after it stops (or
// drops into the cup) and started again on the next putt; the filters and gains stay (idle, they cost
// nothing). Loud enough to be heard over the music (k): re-check with the level test after a change.
// makeRoll(ctx, dest) -> roll.set(speed m/s, surface 'm' | 'i' | null, now, dt, quick) every frame.
import { noiseBuf, clamp } from '../../audio/core.js';

// per surface: its filter, how it follows the speed, and its loudness at full speed
const KG = 0.16, KM = 0.36, KI = 0.065, KMID = 0.48, LO_ICE = 0.35;
const SURF = {
  g: { type: 'bandpass', f: v => 380 + 90 * v, q: 0.6, k: KG },
  m: { type: 'lowpass', f: v => 250 + 40 * v, q: 0.8, k: KM },
  i: { type: 'highpass', f: v => 3200 + 260 * v, q: 0.5, k: KI },
};
// mud's middle (a band from the same noise, moving with the speed) and how loud against mud's lows
const MID = { f: v => 620 + 45 * v, q: 1.5, k: KMID };
const STOP = 0.12; // m/s: slower, it is still

export function makeRoll(ctx, dest) {
  const G = v => { const g = ctx.createGain(); g.gain.value = v; return g; };
  const F = (type, f, q) => { const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; return b; };
  const out = G(1), tex = G(1);
  out.connect(dest);
  tex.connect(out);
  const ch = {};
  for (const k in SURF) {
    const S = SURF[k], f = F(S.type, S.f(0), S.q), g = G(0);
    g.connect(k === 'i' ? out : tex);
    ch[k] = { S, f, g, lvl: 0, hz: S.f(0) };
  }
  // grass: no hiss on top, and a little low thrum under the brush
  const top = F('lowpass', 1600, 0.6), lo = F('lowpass', 200, 0.7), loG = G(0.6);
  ch.g.f.connect(top); top.connect(ch.g.g);
  lo.connect(loG); loG.connect(ch.g.g);
  // mud: its lows and a squelchy middle (nothing bright: still duller than the grass)
  const mid = F('bandpass', MID.f(0), MID.q), midTop = F('lowpass', 1300, 0.7), midG = G(MID.k);
  let midHz = MID.f(0);
  ch.m.f.connect(ch.m.g);
  mid.connect(midTop); midTop.connect(midG); midG.connect(ch.m.g);
  // ice: the hiss no higher than 6-7 kHz, over a third of the grass's thrum
  const iceTop = F('lowpass', 6500, 0.7), loI = G(LO_ICE);
  ch.i.f.connect(iceTop); iceTop.connect(ch.i.g);
  lo.connect(loI); loI.connect(ch.i.g);
  // the flutter: a very low noise moving the grass and mud chains' gain about 1
  const flutLp = F('lowpass', 14, 0.7), flutG = G(2.5);
  flutLp.connect(flutG); flutG.connect(tex.gain);
  let src = null, flut = null, idle = 0, mark = 0, rate = 0;
  return {
    get on() { return !!src; },
    /** speed of the ball (0 when it is still, paused or in the cup); surf what it rolls on */
    set(speed, surf, now, dt = 1 / 60, quick = false) {
      const moving = speed > STOP;
      if (moving && !src) {
        src = ctx.createBufferSource();
        src.buffer = noiseBuf(ctx, 'white');
        src.loop = true;
        for (const k in ch) src.connect(ch[k].f);
        src.connect(lo);
        src.connect(mid);
        src.start(now, Math.random() * 1.9);
        flut = ctx.createBufferSource();
        flut.buffer = noiseBuf(ctx, 'brown');
        flut.loop = true;
        flut.connect(flutLp);
        flut.start(now, Math.random() * 1.9);
        idle = 0;
        rate = 0;
      }
      if (!src) return;
      // loudness: in proportion to the speed (a slow last roll is barely there)
      const x = clamp((speed - STOP) / 7), on = surf === 'm' ? 'm' : surf === 'i' ? 'i' : 'g';
      const tau = quick ? 0.015 : 0.05;
      for (const k in ch) {
        const c = ch[k], want = k === on ? c.S.k * x : 0;
        if (Math.abs(want - c.lvl) > 0.04 * Math.max(want, c.lvl) + 1e-4) { c.lvl = want; c.g.gain.setTargetAtTime(want, now, tau); }
        const hz = c.S.f(speed);
        if (k === on && Math.abs(hz - c.hz) > c.hz * 0.03) { c.hz = hz; c.f.frequency.setTargetAtTime(hz, now, 0.06); }
      }
      const mhz = MID.f(speed);
      if (on === 'm' && Math.abs(mhz - midHz) > midHz * 0.03) { midHz = mhz; mid.frequency.setTargetAtTime(mhz, now, 0.06); }
      const r = 0.6 + 0.35 * Math.min(speed, 8);
      if (Math.abs(r - rate) > 0.05) { rate = r; flut.playbackRate.setTargetAtTime(r, now, 0.1); }
      // still for a moment: let the noises go (after the gains have come down)
      if (moving) idle = 0;
      else if ((idle += dt) > 0.4 && now > mark) {
        for (const s of [src, flut]) {
          s.stop(now + 0.05);
          s.onended = () => { try { s.disconnect(); } catch { /* gone */ } };
        }
        src = flut = null;
        mark = now + 0.1;
      }
    },
  };
}
