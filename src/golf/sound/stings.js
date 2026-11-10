// Two one-shots of the golf game's own, made from src/audio's instruments and effects (which stay as
// they are) and played on the effects bus, so the sound switch, CrazyGames' mute and a hidden tab
// silence them as they do every effect:
//   letOff()              the card 'Let's call this one done' (or a hole skipped) has come up: two soft
//                         marimba notes falling a third onto the song's home note, a moment after the
//                         card: 'never mind', not a buzzer.
//   medal(isNew, finale)  a yard's results: the fanfare as for three stars; a new medal: three
//                         fireworks after it; the last yard finished: five. Neither: only the fanfare.
// Nothing here throws, and nothing sounds before the game's sound has started or while it is off.
import { audio } from '../../audio/audio.js';
import { mallet } from '../../audio/instruments.js';
import { fireworks } from '../../audio/sfx.js';
import { mkBus, busTarget, busKill } from '../../audio/core.js';

const LET_OFF = { after: 0.3, notes: [[71, 0, 0.42], [67, 0.24, 0.36]], level: 1 }; // [midi, s, velocity]: B4, G4
// fireworks: the first `first` s after the fanfare starts (its chord has rung), then one every `gap` s;
// level: their bus's gain (each is a whistle and three bangs: src/audio/sfx.js)
const FIRE = { first: 0.8, gap: 0.42, n: 3, nFinale: 5, level: 0.8 };

let timers = [], buses = [], played = { letOff: 0, medal: 0, fireworks: 0 };
const live = () => (audio.running && !audio.muted ? audio.ctx : null);
function later(ms, fn) {
  const id = setTimeout(() => {
    timers = timers.filter(x => x !== id);
    try { fn(); } catch (e) { console.warn('[golf sound]', e); }
  }, ms);
  timers.push(id);
}
/** a bus on the effects bus, let go after `life` s (and at once, faded, by hush) */
function bus(ctx, level, life) {
  const b = mkBus(ctx, audio.m.sfx, level);
  buses.push(b);
  setTimeout(() => { buses = buses.filter(x => x !== b); busKill(b); }, life * 1000);
  return b;
}

export function letOff() {
  later(LET_OFF.after * 1000, () => {
    const ctx = live();
    if (!ctx) return;
    const t = ctx.currentTime + 0.01, b = bus(ctx, LET_OFF.level, 3);
    for (const [midi, dt, vel] of LET_OFF.notes) mallet(ctx, b, t + dt, { midi, vel, pan: -0.1, send: 0.3 });
    played.letOff++;
  });
}

export function medal(isNew = false, finale = false) {
  try { audio.fanfare(); played.medal++; } catch { /* no fanfare */ }
  const n = finale ? FIRE.nFinale : isNew ? FIRE.n : 0;
  for (let i = 0; i < n; i++) later((FIRE.first + i * FIRE.gap) * 1000, () => {
    const ctx = live();
    if (!ctx) return;
    fireworks(ctx, bus(ctx, FIRE.level, 2.2), ctx.currentTime + 0.01);
    played.fireworks++;
  });
}

/** drop what is still to come, and fade what is sounding */
export function hush() {
  for (const id of timers) clearTimeout(id);
  timers = [];
  const ctx = audio.ctx;
  if (ctx) for (const b of buses) try { busTarget(b, 0, ctx.currentTime, 0.03); } catch { /* gone */ }
}

/** for the tests: how many were played, and what is still to come or sounding */
export const stingStats = () => ({ ...played, pending: timers.length, buses: buses.length });
