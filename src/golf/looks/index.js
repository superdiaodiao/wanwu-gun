// The looks: what a yard looks like — its light, its colours, and what stands round its pond. A yard
// names its look (holes.js YARDS, a yard file's `look`); a look is a file of its own here, registered
// below. lookOf(name) gives it with every field filled in (from the defaults, the duck pond's); a name
// that isn't one gives the duck pond, with a warning, and never throws.
//
// A look file exports default an object; every field is optional:
//   sky        the sky behind, top to horizon: [[at 0..1, '#rrggbb'], ...]
//   fog        its colour (0xrrggbb), or [colour, near, far] in metres (45 and 95 unless said)
//   hemi       the light from the sky: [sky colour, ground colour, intensity]
//   sun        the sun: [colour, intensity, [x, y, z] towards it]
//   shadow     how dark its shadows are, 0..1 (1)
//   card       the yard's card on the map: a CSS background (a linear-gradient of its sky)
//   icon       the picture on it: inline SVG, class "ic" (about 34 x 28)
//   turf       the green's colours: { green: [one square, the next], mow: 'checker' | 'rows' (how
//              the two take turns), blade: [light, dark] (strokes of grass), shade (along the
//              rails), road: [two greys], mud: { base, dark, rut, sheen }, ice: { base, sheen,
//              scratch, rim } } — any left out are the duck pond's
//   materials(base)  the materials it has of its own, made once and shared by all its holes (see
//              course.js mats: side, sideLifted, bank (the earth or tiles of the block's sides and
//              the pond's bank: kit.soilSides(colours)), ledge (the strip outside the rail), lawn,
//              rail, post, cap, foam, tee, ...); returns only those it changes, and any extra ones
//              its surroundings use (base: the duck pond's)
//   water      the pond's material: a function returning one (made once), or the options of a
//              rippling one (kit.rippleWater: { color, glint, deep, speed (0: still, as ice) })
//   surroundings(ctx)  builds what is round the block: the pond's edge (foam, a deck) and the yard
//              beyond (trees, houses, a fence). ctx: see course.js (group, model, R, M, pond, ring,
//              put, stand-ins for placing things clear of each other)
//   floaters(ctx)      what moves on the water (ducks, pool floats: kit.ducks, kit.lane)
//   dress(ctx)         optional, per hole, after everything else: meshes of its own over the course
//              (snow on the rails: ctx.rails, ctx.posts; timber along steps: ctx.hole.ground, ctx.Y)
//   particles  one cloud of little things over the yard: { count, color, size, fall, sway, opacity,
//              glow, shape: 'dot' | 'leaf', low, high, spread } (kit.particles)
// Its materials, water and particles are made the first time one of its holes is built (or warmed
// up before, while the last hole of the yard before it is being looked back on: course.js warmLook)
// and kept: the shaders a phone would otherwise stop to compile at every new hole.
import pond from './pond.js';
import pool from './pool.js';
import autumn from './autumn.js';
import winter from './winter.js';

const FILES = { pond, pool, autumn, winter };

const TURF = {
  green: ['#63c94d', '#55bb41'], mow: 'checker', blade: ['rgba(235, 255, 170, 0.22)', 'rgba(20, 80, 10, 0.2)'], shade: 'rgba(20, 60, 10, 0.4)', road: ['#6d737d', '#696f79'],
  mud: { base: '#7b5534', dark: '#5a3b22', rut: 'rgba(48, 30, 15, 0.55)', sheen: 'rgba(205, 225, 235, 0.45)' },
  ice: { base: '#dcefff', sheen: 'rgba(255, 255, 255, 0.75)', scratch: 'rgba(255, 255, 255, 0.85)', rim: 'rgba(255, 255, 255, 0.9)' },
};
const DEFAULTS = { ...pond, shadow: 1, materials: null, water: {}, surroundings: null, floaters: null, dress: null, particles: null };

const done = {};
const warned = new Set();
/** the look called `name`, every field filled in */
export function lookOf(name) {
  if (done[name]) return done[name];
  let L = FILES[name];
  if (!L) {
    if (!warned.has(name)) { warned.add(name); console.warn('[golf] no look', JSON.stringify(name), '- the duck pond instead'); }
    return lookOf('pond');
  }
  const turf = { ...TURF, ...L.turf, mud: { ...TURF.mud, ...L.turf?.mud }, ice: { ...TURF.ice, ...L.turf?.ice } };
  return (done[name] = { ...DEFAULTS, ...L, turf, name });
}
