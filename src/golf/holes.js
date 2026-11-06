// The holes. Each is drawn in characters, one per square metre, the far end at the top (the tee
// near the bottom: the hole is seen from that end, so the ball starts near the player):
//   .  green        r  road (green to the ball, grey to look at)
//   m  mud: slows the ball hard, and holds it where it stops (a 2-row band takes a firm putt to cross)
//   i  ice: the ball runs on and on (drag a third of the green's: aim short)
//   T  the tee      H  the hole      o  a coin lying on the green (more anywhere: coins, below)
//   (anything else is not course: a wall runs along every edge of the green)
// then what stands on it, at (column, row) — fractions allowed, 0 is the first square's middle:
//   { t: 'obj', id, at, rot, s }        something in the way (a catalog model; rot in degrees)
//   { t: 'fan', at, dir, len, w, a }    an electric fan blowing along dir (a [x, z] direction)
//   { t: 'bike', id, from, to, speed, phase, len }   a bike or a car (len metres long) going back
//                                        and forth between two points
//   { t: 'goose', at, aggro, leash }    guards the ground around it: chases the ball, pecks it away
//   { t: 'cat', at, face, period }      sits facing `face` (deg, 0 = up the hole) and swipes
//   { t: 'tires', at, rot, s }          a wall of tyres: the ball bounces off it hard
//   { t: 'tires', corner, leg }         tyres piled into a corner of the green (corner: where its
//                                        rails meet, e.g. [8.5, -0.5]), a bank leg metres along each
//   { t: 'watch', id, at, near, cheer } stands beside the green watching the ball (does nothing to it);
//                                        a ball within `near` metres (1.6) makes it hop and call (with
//                                        near given, it calls on the first stroke only and just hops on
//                                        later ones); cheer: it hops twice and calls when the ball drops in
//   { t: 'goose', id: 'dog_shiba', … }  a dog doing what the goose does
//   { t: 'windmill', at, s, fill, speed, phase }  the ball goes through the tunnel under it (at its
//                                        middle; it is 2.4 s metres across, 1.4 s deep, flower troughs
//                                        filling out to `fill` metres either side), its sails sweeping
//                                        past the door; speed: radians a second
//   { t: 'spinner', at, len, speed, phase } a lawn sprinkler, its arm len metres end to end turning
//   { t: 'tunnel', id, at, s, fill }    the windmill's tunnel without its sails, under any model built to
//                                        the windmill's footprint (a giant pumpkin, a snow fort)
//   and on any of them: tag (what it says over it), tint, call (false: none, a bike just knocks), walk (a bike that is an animal walking),
//   aside (a bike's: flicks a resting ball out of its way; a walker's unless false), mode and face (a
//   goose's: 'chase' | 'nudge'; where it looks at home, deg, 180 = up the hole), e, wobble, near, call
//   and pop (an obj's: near, metres: a ball going by that close rocks it, once a stroke; call: the
//   sound it makes then, and when hit, in place of a thud: 'squeak'; pop, the id of a model of its
//   own that a hard hit knocks off its top): see props.js
// and the shape of the ground, where it isn't flat: ground: [ramps, hills, ridges] (see ground.js);
// coins: more coins, at [c, r] each (on a green square), or 'tops': one on top of every mound. Every
// hole has at least one coin (a warning at the bottom says if not, or if one is off the green).
// surfTags: false: no "Mud slows the ball" / "Ice is slippery" over its mud or ice (say it once, on the
// hole that brings it in, and leave it unsaid after).
// tilt: how low the camera may look along the hole at most (radians from straight down; a windmill in
// front of the cup already keeps the camera high enough to see the cup over it).
// The yards: nine holes each, played one after another, each a round of its own. The first is a duck
// pond in a park at midday, everything flat; the second the pool in a back garden at sundown, where the
// green has slopes and things on it turn. The ones after are files of their own (yards/), appended in
// order at the bottom (a new one: import its file and add it to the list there). A player's records are
// kept by a hole's place, so a yard is only ever added at the end. A yard file:
//   export default {
//     name: '南瓜地',      the yard's name (the Chinese is the key its English is found by)
//     look: 'autumn',     how it looks (looks/: its light and colours, what is round the pond)
//     holes: [ ... ],     its nine holes, written as above
//     en: { '南瓜地': 'Pumpkin Patch', ... },  the English of its own words: its name, its holes'
//                         names and tips, any tags of its own (merged into the game's at start)
//   };
import { UI } from '../i18n/en/ui.js';
import { EN } from './en.js';
import pumpkin from './yards/pumpkin.js';
import snow from './yards/snow.js';

export const PER = 9;
export const YARDS = [
  { name: '鸭子池塘', look: 'pond' },
  { name: '泳池派对', look: 'pool' },
];

export const HOLES = [
  {
    name: '热身', tip: '', par: 2,
    map: [
      '.....',
      '..H..',
      '.....',
      '.....',
      '..o..',
      '.....',
      '.....',
      '.....',
      '..o..',
      '.....',
      '.....',
      '..T..',
      '.....',
    ],
    props: [
      // (face to face: from the tee the ball meets a duck's round side. A putt between them rocks
      // them and they squeak; the goose by the cup hops as the ball comes up, and cheers it in)
      { t: 'obj', id: 'rubber_duck', at: [1.1, 6], rot: 90, s: 6, wobble: true, near: 1.0, call: 'squeak' },
      { t: 'obj', id: 'rubber_duck', at: [2.9, 6], rot: -90, s: 6, wobble: true, near: 1.0, call: 'squeak' },
      { t: 'watch', id: 'goose', at: [-1.25, 2.4], near: 3.6, cheer: true },
    ],
  },
  {
    name: '跷跷板', tip: '借跷跷板拐弯', par: 3,
    map: [
      '............',
      '..........H.',
      '............',
      '....        ',
      '....        ',
      '.o..        ',
      '....        ',
      '....        ',
      '....        ',
      '....        ',
      '.T..        ',
      '....        ',
    ],
    props: [
      // (the seesaw lies across the far corner, a bank that gives the ball all its speed back: up the
      // leg, off it, along the bar to the cup. The hydrants stand in the corners behind the cup)
      { t: 'obj', id: 'seesaw', at: [0.56, 0.56], rot: 45, s: 1.35, e: 1.0, wobble: true },
      { t: 'obj', id: 'fire_hydrant', at: [2.6, 3.6] },
      { t: 'obj', id: 'fire_hydrant', at: [11.15, -0.15] },
      { t: 'obj', id: 'fire_hydrant', at: [11.15, 2.15] },
    ],
  },
  {
    name: '电风扇', tip: '风会把球吹偏，往上风那边打', par: 3,
    map: [
      '......',
      '..H...',
      '......',
      '......',
      '......',
      '......',
      '...o..',
      '......',
      '......',
      '......',
      '.o....',
      '......',
      '......',
      '......',
      '...T..',
      '......',
    ],
    props: [
      { t: 'fan', at: [-0.85, 10], dir: [1, 0], len: 7.05, w: 2.6, a: 5.5 }, // (standing on the rail)
      { t: 'fan', at: [5.85, 4.5], dir: [-1, 0], len: 7.05, w: 2.6, a: 5.5 },
    ],
  },
  {
    name: '过马路', tip: '等车过去再打', par: 3,
    map: [
      '   .....   ',
      '   ..H..   ',
      '   .....   ',
      '   .....   ',
      '   .....   ',
      'rrrrrrrrrrr',
      'rrrrrrrrrrr',
      'rrrrrrrrrrr',
      '   .....   ',
      '   .o...   ',
      '   .....   ',
      '   .....   ',
      '   ..T..   ',
      '   .....   ',
    ],
    props: [
      { t: 'bike', id: 'cab', len: 1.7, from: [0.6, 5.3], to: [9.4, 5.3], speed: 2.4, phase: 0 },
      { t: 'bike', id: 'toy_car', len: 1.5, from: [9.4, 6.7], to: [0.6, 6.7], speed: 1.8, phase: 0.45 },
    ],
  },
  {
    name: '大鹅', tip: '大鹅会追着球啄，打快点冲过去', par: 3,
    map: [
      '.......',
      '...H...',
      '.......',
      '.......',
      '.......',
      '..o....',
      '.......',
      ' ..... ',
      ' ..... ',
      ' ...o. ',
      ' ..... ',
      ' ..... ',
      ' ..T.. ',
      ' ..... ',
    ],
    props: [
      { t: 'goose', at: [4.6, 3.2], aggro: 2.7, leash: 2.6 },
      { t: 'obj', id: 'flower_bed', at: [0.7, 3.4], s: 0.5 },
    ],
  },
  {
    name: '猫和轮胎', tip: '猫爪圈里会被拍，轮胎会把球狠狠弹回来', par: 4,
    map: [
      '.........',
      '.H.......',
      '.........',
      '      ...',
      '      ...',
      '      ...',
      '      .o.',
      '      ...',
      '      ...',
      '.........',
      '.T.......',
      '.........',
    ],
    props: [
      { t: 'tires', corner: [8.5, 11.5], leg: 2 }, // (the bank where the 45° block's front was)
      { t: 'tires', corner: [8.5, -0.5], leg: 2 },
      { t: 'cat', id: 'cat_orange', at: [5.85, 5.2], face: 90, period: 2.4 },
      { t: 'obj', id: 'potted_plant', at: [3.6, -0.1] },
      { t: 'obj', id: 'potted_plant', at: [3.6, 2.1] },
    ],
  },
  {
    name: '弹弹轮胎', tip: '轮胎比墙还弹，借它拐弯', par: 3,
    map: [
      '.........',
      '....H....',
      '.........',
      '.........',
      '.o.....o.',
      '.........',
      '.........',
      '.........',
      '.........',
      '.........',
      '....T....',
      '.........',
    ],
    props: [
      { t: 'tires', at: [4, 6.6], rot: 0, s: 1.5 },
      { t: 'tires', at: [2.2, 3.4], rot: 35, s: 1.3 },
      { t: 'tires', at: [5.8, 3.4], rot: -35, s: 1.3 },
    ],
  },
  {
    name: '两只猫', tip: '猫爪圈里会被拍，看准空当再打', par: 3,
    map: [
      '.....',
      '..H..',
      '.....',
      '.....',
      '.....',
      '.....',
      '.o...',
      '.....',
      '.....',
      '.....',
      '..T..',
      '.....',
    ],
    props: [
      { t: 'obj', id: 'fire_hydrant', at: [2, 5.6] },
      { t: 'cat', id: 'cat_orange', at: [0.15, 6.6], face: 90, period: 2.4 },
      { t: 'cat', id: 'cat_orange', at: [3.85, 3.8], face: 270, period: 2.4, phase: 0.5 },
    ],
  },
  {
    name: '早高峰', tip: '等车过去再打，再绕开大鹅', par: 4,
    map: [
      '.........  ',
      '.......H.  ',
      '.........  ',
      '.........  ',
      '....o....  ',
      '.........  ',
      'rrrrrrrrrrr',
      'rrrrrrrrrrr',
      '  .....    ',
      '  .....    ',
      '  ..o..    ',
      '  .....    ',
      '  ..T..    ',
      '  .....    ',
    ],
    props: [
      { t: 'bike', id: 'cab', len: 1.7, from: [0.6, 6.05], to: [9.4, 6.05], speed: 2.2, phase: 0.2 },
      { t: 'bike', id: 'toy_car', len: 1.5, from: [9.4, 7.0], to: [0.6, 7.0], speed: 1.7, phase: 0.7 },
      { t: 'goose', at: [4.8, 3.4], aggro: 1.7, leash: 2 },
      { t: 'obj', id: 'traffic_cone', at: [8.1, 4.2] },
    ],
  },

  // ---- the pool party: slopes, and things that turn ----
  {
    name: '上坡', tip: '坡道会把慢球送回来，打够劲', par: 2,
    map: [
      '.......',
      '...H...',
      '.......',
      '.......',
      '.......',
      '.......',
      '.......',
      '..o....',
      '.......',
      '.......',
      '.......',
      '...T...',
      '.......',
    ],
    ground: [{ t: 'ramp', from: [3, 8.4], to: [3, 5.4], h: 0.55 }, { t: 'hill', at: [3, 1], r: 1.5, h: -0.16 }],
    props: [{ t: 'watch', id: 'dog_shiba', at: [5.3, -1.25] }],
  },
  {
    name: '小土包', tip: '土包会把球拐开，绕过去或冲过去', par: 3,
    map: [
      '.........',
      '....H....',
      '.........',
      '.........',
      '.........',
      '.........',
      '.........',
      '.........',
      '.........',
      '.........',
      '....T....',
      '.........',
    ],
    ground: [
      { t: 'hill', at: [4, 5.6], r: 1.7, h: 0.34 },
      { t: 'hill', at: [1.4, 3], r: 1.3, h: 0.3 },
      { t: 'hill', at: [6.6, 7.6], r: 1.3, h: 0.3 },
      { t: 'hill', at: [4, 1], r: 1.4, h: -0.14 },
    ],
    props: [{ t: 'obj', id: 'garden_gnome', at: [8.2, 0.3], rot: -30, s: 1.2 }],
    coins: 'tops',
  },
  {
    name: '风车', tip: '等叶片转开再打进风车门', par: 3,
    // (the cup off to one side behind it, in a bowl that brings the ball round to it: the windmill never
    // stands in front of it, so the camera can look along the hole as low as on any other)
    map: [
      '  .....',
      '  ...H.',
      '  .....',
      '  ...  ',
      '  ...  ',
      '.......',
      '.......',
      '..o....',
      '.......',
      '...T...',
      '.......',
    ],
    ground: [{ t: 'hill', at: [5, 1], r: 2.7, h: -0.3 }],
    props: [{ t: 'windmill', at: [3, 3.7], fill: 1.5, speed: 0.6 }],
  },
  {
    name: '斜坡', tip: '球会往低处拐，往高处瞄', par: 3,
    map: [
      '........',
      '.H......',
      '........',
      '........',
      '...o....',
      '........',
      '........',
      '........',
      '........',
      '........',
      '.....o..',
      '........',
      '......T.',
      '........',
    ],
    ground: [{ t: 'ramp', from: [7.5, 6], to: [-0.5, 6], h: 0.55 }, { t: 'hill', at: [1, 1], r: 1.2, h: -0.1 }],
    props: [{ t: 'obj', id: 'lawn_flamingo', at: [5.2, 4.6], rot: 20, s: 1 }],
  },
  {
    name: '洒水器', tip: '转臂会把球扫开，看准空当', par: 3,
    map: [
      '.........',
      '....H....',
      '.........',
      '.........',
      '..o......',
      '.........',
      '.........',
      '.........',
      '.........',
      '.........',
      '.........',
      '....T....',
      '.........',
    ],
    props: [{ t: 'spinner', at: [3.2, 5.6], len: 3.6, speed: 1.1 }],
  },
  {
    name: '割草机', tip: '割草机会撞开球，等它开过去', par: 3,
    map: [
      '.......',
      '...H...',
      '.......',
      '.......',
      '.......',
      '.......',
      '.....o.',
      '.......',
      '.......',
      '.......',
      '.......',
      '...T...',
      '.......',
    ],
    props: [
      { t: 'bike', id: 'mower', from: [0.6, 3.6], to: [5.4, 3.6], speed: 1.1, phase: 0 },
      { t: 'bike', id: 'mower', from: [5.4, 7.6], to: [0.6, 7.6], speed: 0.9, phase: 0.5 },
    ],
  },
  {
    name: '大碗', tip: '球会顺着碗边滚进洞', par: 2,
    map: [
      '...........',
      '...........',
      '...........',
      '.....H.....',
      '...........',
      '...........',
      '...........',
      '...........',
      '...........',
      '...........',
      '...........',
      '.....T.....',
      '...........',
    ],
    ground: [{ t: 'hill', at: [5, 3], r: 3.4, h: -0.65 }, { t: 'hill', at: [5, 7.6], r: 1.1, h: 0.22 }],
    props: [{ t: 'obj', id: 'beach_ball', at: [1, 9.5], s: 1.2 }, { t: 'obj', id: 'beach_ball', at: [9.2, 8.8], s: 1.2 }],
    coins: [[2.6, 3], [7.4, 3]],
  },
  {
    name: '过山车', tip: '一上一下，快了冲过头，慢了滚回来', par: 2,
    map: [
      '.......',
      '...H...',
      '.......',
      '.......',
      '.......',
      '.......',
      '.......',
      '.......',
      '.......',
      '.......',
      '.......',
      '.......',
      '...T...',
      '.......',
    ],
    ground: [
      { t: 'ridge', from: [-0.5, 8.6], to: [6.5, 8.6], w: 2, h: 0.32 },
      { t: 'ramp', from: [3, 5.2], to: [3, 3], h: 0.45 },
      { t: 'hill', at: [3, 1], r: 1.4, h: -0.14 },
    ],
    props: [{ t: 'goose', id: 'dog_shiba', at: [1.4, 6.6], aggro: 2.2, leash: 2.2 }],
    coins: [[5, 6.4]],
  },
  {
    name: '大风车', tip: '先躲转臂，再穿风车', par: 4,
    map: [
      '.....  ',
      '.H...  ',
      '.....  ',
      '  ...  ',
      '  ...  ',
      '.......',
      '.......',
      '.......',
      '.......',
      '.......',
      '...T...',
      '.......',
    ],
    ground: [{ t: 'hill', at: [1, 1], r: 2.7, h: -0.3 }],
    props: [
      { t: 'windmill', at: [3, 3.7], fill: 1.5, speed: 0.75 },
      { t: 'spinner', at: [1.3, 7.4], len: 2.6, speed: 1.0 }, // (off the line to the door: it guards a coin)
    ],
    coins: [[1.3, 6.1], [5, 8.6]],
  },
];

// ---- the yards in files of their own, after these two, in this order ----
Object.assign(UI, EN); // (the golf game's own English, en.js: the shared table stays as the other game has it)
for (const y of [pumpkin, snow]) {
  if (y.holes.length !== PER) console.warn(`[golf] ${y.name}: ${y.holes.length} holes, not ${PER}`);
  for (const h of y.holes) if (h.map.join('').split('T').length !== 2 || h.map.join('').split('H').length !== 2) console.warn(`[golf] ${h.name}: wants one T and one H`);
  YARDS.push({ name: y.name, look: y.look });
  HOLES.push(...y.holes);
  Object.assign(UI, y.en);
}
// (every hole has a coin, each on a green square: on a hole without one the third star is for a birdie
// only (main.js finish), and a coin off the green can't be picked up, so that star and the yard's gold
// can't be had)
for (const h of HOLES) {
  const extra = h.coins === 'tops' ? (h.ground || []).filter(g => g.t === 'hill' && g.h > 0).map(g => g.at) : h.coins || [];
  if (!extra.length && !h.map.join('').includes('o')) console.warn(`[golf] ${h.name}: no coins`);
  for (const [c, r] of extra) if (!'.rTHomi'.includes(h.map[Math.round(r)]?.[Math.round(c)] || ' ')) console.warn(`[golf] ${h.name}: coin [${c}, ${r}] is off the green`);
}
