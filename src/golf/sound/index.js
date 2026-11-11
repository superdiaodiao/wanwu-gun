// The yards' own sounds, for 小区高尔夫 only (src/audio, shared with 万物皆可滚, stays as it is):
//   - an ambience bed per look (beds.js): the duck pond's breeze, birds and ducks; the pool's lapping
//     water, crickets and a far sprinkler; the pumpkin patch's leaves, hens and crow; the snow day's
//     soft wind and a dog far off. Quiet, under the music and the effects; crossfaded when the yard's
//     look changes, and left running from one hole of a yard to the next.
//   - the ball rolling (roll.js): with its speed, duller on mud, a hiss on ice; silent once it stops.
//   - a music layer per look over the golf song (layer.js): a soft vibraphone at the duck pond,
//     electric-piano off-beats and bongos at the pool party, strings and claps in the pumpkin patch, a
//     glockenspiel and a pad on the snow day.
//   - two one-shots of the game's own (stings.js): sound.letOff() as the card of a hole the game lets
//     the player off comes up, sound.medal(isNew, finale) on a yard's results (the fanfare, and fireworks
//     after it for a new medal or the last yard finished).
// The golf song plays 3 dB under the level src/audio gives its music (MUSIC below), so the roll and the
// yard can be heard through it.
// They hang off the game's mixer (audio.m): the bed and the roll off the effects bus, so the sound
// switch, CrazyGames' mute and a hidden tab (the context suspended) silence them just as they do the
// effects (and under the mute the bed is let go altogether, to come back when the sound does); the
// layer off the music bus, so the music switch does too. Nothing starts before the game's sound has
// (audio.init, on the first tap). main.js: sound.yard(look) when a hole loads, sound.frame(G) every
// frame. Nothing here throws.
import { audio } from '../../audio/audio.js';
import { makeBed, liveEvents } from './beds.js';
import { makeRoll } from './roll.js';
import { makeLayer, stringBuf, STRING_NOTES } from './layer.js';
import { letOff, medal, hush, stingStats } from './stings.js';

// the music bus's level for golf (src/audio's own is 0.6: this is 3 dB under it). Set before the mixer
// is made (audio.init, on the first tap), which then starts at it.
const MUSIC = 0.42;
try { audio.setVolume('music', MUSIC); } catch { /* as it was */ }

const AHEAD = 0.5; // s: how far ahead the bed's sounds are put in
const XFADE = 3; // s: one yard's bed into the next
let fxOn = true; // (the menu's effects switch: off, no bed and no roll, as under the mute)
let look = null, bed = null, fading = [], roll = null, layer = null, last = 0, beds = 0, hushed = false, errs = 0;
const warm = [...STRING_NOTES];

export const sound = {
  /** the yard being played looks like this (looks/: pond, pool, autumn, winter) */
  yard(name) { look = name || null; },
  /** every frame: the bed's next sounds, the roll from the ball (G: main.js) */
  frame(G) {
    const ctx = audio.ctx, m = audio.m;
    if (!ctx || !m || ctx.state !== 'running') return;
    try {
      const now = ctx.currentTime, dt = Math.min(0.1, Math.max(0, now - last));
      last = now;
      // the bed: the look's, unless the sound is off
      const want = audio.muted || !fxOn ? null : look;
      if (bed && bed.look !== want) { bed.stop(now, want ? XFADE : 0.05); fading.push(bed); bed = null; }
      // (in over 4 s the first time, 3 s from one yard to the next, 1 s when the sound comes back on)
      if (!bed && want) bed = makeBed(ctx, m.sfx, want, now, !beds++ ? 4 : hushed ? 1 : XFADE);
      hushed = !want;
      if (bed) bed.tick(now + AHEAD, now);
      if (fading.length) {
        if (fading.length > 3) fading.shift().dispose(); // (yards flicked through: the oldest, already faded, goes)
        fading = fading.filter(b => { b.tick(now + AHEAD, now); if (!b.dead(now)) return true; b.dispose(); return false; });
      }
      // the ball rolling (not while it waits, under the menu, or once it drops; nor with the sound off)
      const b = G.ball, on = G.course && !G.paused && !audio.muted && fxOn && (G.state === 'roll' || G.state === 'aim');
      const sp = on ? Math.hypot(b.vx, b.vz) : 0;
      if (!roll && sp > 0.12) roll = makeRoll(ctx, m.sfx);
      if (roll) roll.set(sp, sp > 0 && G.course.surfAt ? G.course.surfAt(b.x, b.z) : null, now, dt, G.state === 'sink');
      if (bed) bed.duck(sp, now); // (the bed dips while it rolls)
      // the yard's music layer
      if (!layer) layer = makeLayer(ctx, m.music, audio);
      layer.tick(look, now);
      // (the pumpkin patch's strings made ahead, one a frame, from the pool party on)
      if (warm.length && (look === 'pool' || look === 'autumn')) stringBuf(ctx, warm.pop());
    } catch (e) { if (errs++ < 5) console.warn('[golf sound]', e); }
  },
  /** the menu's effects switch (main.js; the effects bus itself is set by audio.setVolume('sfx')) */
  fx(on) { fxOn = !!on; },
  /** the card of a hole not sunk (given up for the player, or skipped) has come up: two soft notes */
  letOff,
  /** a yard's results are shown: the fanfare; isNew (a medal better than the one held) or finale (the
   *  last yard played through): fireworks after it */
  medal,
  /** the fireworks and notes still to come are dropped (not needed between holes: they are short) */
  hush,
  /** for the tests: what is playing */
  stats() {
    return {
      look, bed: bed && bed.look, fading: fading.length, bedNodes: (bed ? bed.nodes() : 0) + fading.reduce((n, b) => n + b.nodes(), 0),
      events: liveEvents(), roll: !!(roll && roll.on), layer: layer && layer.tr ? Object.fromEntries(Object.entries(layer.tr.lay).map(([k, L]) => [k, L.g])) : null,
      inStep: layer ? layer.inStep() : null, layerOff: layer ? layer.off() : null, stings: stingStats(),
    };
  },
};
