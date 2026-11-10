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
//   aside (a bike's: flicks a resting ball out of its way; a walker's unless false; 'in': always towards
//   the green's middle, for one beside a rail), mode and face (a
//   goose's: 'chase' | 'nudge'; where it looks at home, deg, 180 = up the hole), e, wobble, near, call
//   and pop (an obj's: near, metres: a ball going by that close rocks it, once a stroke; call: the
//   sound it makes then, and when hit, in place of a thud: 'squeak'; pop, the id of a model of its
//   own that a hard hit knocks off its top; long, its length to look at, times its own): see props.js
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
    // (six metres from the tee to the cup: a new player's first pull, however timid, gets most of the way,
    // and on easy the dotted guide reaches the flag. At ten metres any pull under four fifths stopped short)
    name: '热身', tip: '', par: 2,
    map: [
      '.....',
      '..H..',
      '.....',
      '.....',
      '.....',
      '.....',
      '.....',
      '..T..',
      '.....',
    ],
    // (both on the line from the tee to the cup, the ducks between them. The nearer one last: the words
    // "Get them all" go under it (main.js), and two and a half metres from the tee leave room for them
    // between the coin and the ball on a phone held sideways; at two they were left out)
    coins: [[2, 2], [2, 4.5]],
    props: [
      // (face to face: from the tee the ball meets a duck's round side. A putt between them rocks
      // them and they squeak; the goose by the cup hops as the ball comes up, and cheers it in)
      { t: 'obj', id: 'rubber_duck', at: [1.1, 3.5], rot: 90, s: 6, wobble: true, near: 1.0, call: 'squeak' },
      { t: 'obj', id: 'rubber_duck', at: [2.9, 3.5], rot: -90, s: 6, wobble: true, near: 1.0, call: 'squeak' },
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
      '....        ',
      '....        ',
      '....        ',
      '....        ',
      '....        ',
      '.T..        ',
      '....        ',
    ],
    coins: [[1, 7.5]], // (on the way up the leg: a ball played for the seesaw takes it)
    props: [
      // (the seesaw lies across the far corner, a bank that gives the ball all its speed back: up the
      // leg, off it, along the bar to the cup. The hydrants stand in the corners behind the cup)
      { t: 'obj', id: 'seesaw', at: [0.56, 0.56], rot: 45, s: 1.35, e: 1.0, wobble: true, long: 0.84 }, // (its ends on the rails)
      { t: 'obj', id: 'fire_hydrant', at: [2.6, 3.6] },
      { t: 'obj', id: 'fire_hydrant', at: [11.15, -0.15] },
      { t: 'obj', id: 'fire_hydrant', at: [11.15, 2.15] },
    ],
  },
  {
    // (a Z: up the right-hand bed, left along a band across the hole, up the left-hand bed to the cup.
    // The fan at the band's end blows along it, carrying the ball round towards the cup's bed, and
    // leaves a ball that stops in the band against the far rail, under the cup; the second blows across
    // the cup's bed below the cup, so the putt up to it goes through the wind. Both on the rail)
    name: '电风扇', tip: '往上风那边瞄', par: 3,
    map: [
      '.....     ',
      '.H...     ',
      '.....     ',
      '.....     ',
      '.....     ',
      '..........',
      '..........',
      '.....o....',
      '     .....',
      '     .....',
      '     .....',
      '     .....',
      '     ..T..',
      '     .....',
    ],
    props: [
      { t: 'fan', at: [9.85, 6], dir: [-1, 0], len: 11.05, w: 2.6, a: 5.5 },
      { t: 'fan', at: [-0.85, 3.5], dir: [1, 0], len: 6.05, w: 2.6, a: 5.5 },
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
    name: '大鹅', tip: '用力打，冲过大鹅', par: 3,
    map: [
      '.......',
      '...H...',
      '.......',
      '.......',
      '.......',
      '.......',
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
    // (up the left-hand leg into a wide lawn: the tyres piled in its far corner send the ball back
    // across it, harder than it came, towards the cup tucked against the right-hand rail. Straight off
    // the tyres goes along the top: the bank has to be played at an angle, or the ball left short)
    name: '弹弹轮胎', tip: '轮胎比墙还弹，借它拐弯', par: 3,
    map: [
      '..........',
      '..........',
      '..........',
      '..........',
      '.........H',
      '..........',
      '....      ',
      '....      ',
      '....      ',
      '....      ',
      '....      ',
      '.T..      ',
      '....      ',
    ],
    props: [{ t: 'tires', corner: [-0.5, -0.5], leg: 2.5 }],
    coins: [[0.5, 2.2]], // (where the ball goes into the tyres: on the way, played off them)
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
    // (Duck Pond's finale: a zebra crossing over the road where the ball goes, with a pedestrian light
    // that shows the green man while a putt hit now would get past the cars, and the goose with its
    // goslings in a line beside it. The light and the goslings only show: the hole plays as it did)
    name: '早高峰', tip: '绿灯亮了再打，再绕开大鹅', par: 4,
    map: [
      '.........  ',
      '.......H.  ',
      '.........  ',
      '.........  ',
      '.........  ',
      '.........  ',
      'rrrrrrrrrrr',
      'rrrrrrrrrrr',
      '  .....    ',
      '  .....    ',
      '  .....    ',
      '  .....    ',
      '  ..T..    ',
      '  .....    ',
    ],
    props: [
      { t: 'bike', id: 'cab', len: 1.7, from: [0.6, 6.05], to: [9.4, 6.05], speed: 2.2, phase: 0.2 },
      { t: 'bike', id: 'toy_car', len: 1.5, from: [9.4, 7.0], to: [0.6, 7.0], speed: 1.7, phase: 0.7 },
      { t: 'goose', at: [4.8, 3.4], aggro: 1.7, leash: 2 },
      { t: 'obj', id: 'traffic_cone', at: [8.1, 4.2] },
      { t: 'crossing', at: [4.5, 6.5], w: 2.6, zone: 0.4, ahead: [0.35, 1.3], light: [1, 8.2], goslings: 3, trail: [1, -1] }, // (the goslings in a line up to the goose's right)
    ],
    coins: [[5.3, 8.5]], // (on the line from the tee to the cup, before the road)
  },

  // ---- the pool party: slopes, and things that turn ----
  {
    // (a dogleg: up the ramp in the tee's leg, then left round the corner to the cup, on flat ground and
    // with no bowl round it. A beach ball lies by the far rail, where a hard bank off the rail came back
    // down into the cup)
    name: '上坡', tip: '坡道会把慢球送回来，打够劲', par: 3,
    map: [
      '......   ',
      '.H....   ',
      '......   ',
      '.........',
      '   ......',
      '   ......',
      '   ......',
      '   ......',
      '   ......',
      '   ......',
      '   ...T..',
      '   ......',
    ],
    ground: [{ t: 'ramp', from: [5.5, 8.6], to: [5.5, 5.6], h: 0.5 }],
    props: [{ t: 'watch', id: 'dog_shiba', at: [3.3, -1.25] }, { t: 'obj', id: 'beach_ball', at: [1.8, 0], s: 1.0 }],
    coins: [[5, 7.5]], // (on the line up the ramp to the corner)
  },
  {
    // (two ways round a little pool in the middle, a mound across each: no straight line from the tee to
    // the cup, so it takes a putt round and a putt in; the cup's bowl only shallow. One coin, on the way
    // round the right-hand mound, where a good first putt goes: a coin on each mound's top took a putt
    // of its own each)
    name: '小土包', tip: '土包会把球拐开，绕过去或冲过去', par: 3,
    map: [
      '.........',
      '....H....',
      '.........',
      '.........',
      '...   ...',
      '...   ...',
      '...   ...',
      '.........',
      '.........',
      '.........',
      '....T....',
      '.........',
    ],
    ground: [
      { t: 'hill', at: [1.1, 5], r: 1.4, h: 0.3 },
      { t: 'hill', at: [6.9, 5], r: 1.4, h: 0.3 },
      { t: 'hill', at: [4, 1], r: 1.2, h: -0.08 },
    ],
    props: [{ t: 'obj', id: 'garden_gnome', at: [8.2, -0.1], rot: -30, s: 1.2 }],
    coins: [[6.5, 8]],
  },
  {
    name: '风车', tip: '穿过风车，或从旁边绕', par: 3,
    // (the cup off to one side behind it: the windmill never stands in front of it, so the camera can look
    // along the hole as low as on any other. Past the water on its right a path goes round it, the way
    // without sails; the ground falls gently from the windmill's side to the path's, all down the hole
    // (the tee and the windmill on the high flat, the path at the foot), the cup on the slope behind, no
    // bowl: a ball through the door runs on downhill past the cup, one up the path has to climb to it)
    map: [
      '  ........',
      '  ....H...',
      '  ........',
      '  ...   ..',
      '  ...   ..',
      '..........',
      '..........',
      '..........',
      '..........',
      '...T......',
      '..........',
    ],
    ground: [{ t: 'ramp', from: [8.5, 1], to: [3.5, 1], h: 0.15 }],
    props: [{ t: 'windmill', at: [3, 3.7], fill: 1.5, speed: 0.6 }],
    coins: [[8.5, 3.5]],
  },
  {
    // (an L: up the tee's leg, then left along the far one, which slopes down towards the near rail, so
    // the ball curls towards it; tyres in the corner turn the ball round it. The slope is a long rise
    // along the far rail that dies away before the corner: a corner pile of tyres always stands at the
    // height of flat ground, and a slope under it buried it)
    name: '斜坡', tip: '球会往低处拐，往高处瞄', par: 3,
    map: [
      '...........',
      '.H.........',
      '...........',
      '...........',
      '       ....',
      '       ....',
      '       ....',
      '       ....',
      '       ....',
      '       ....',
      '       ..T.',
      '       ....',
    ],
    ground: [{ t: 'ridge', from: [-1, -0.5], to: [5.5, -0.5], w: 8, h: 0.36 }, { t: 'hill', at: [1, 1], r: 1.2, h: -0.08 }],
    props: [
      { t: 'obj', id: 'lawn_flamingo', at: [5.2, 2.6], rot: 20, s: 1 },
      { t: 'tires', corner: [10.5, -0.5], leg: 2, tag: false },
    ],
    coins: [[9, 7]], // (on the way up the tee's leg to the tyres)
  },
  {
    name: '洒水器', tip: '看准空当再打', par: 3,
    // (an S: up the tee's leg, left along the middle, up the cup's leg. A sprinkler in each bend's outer
    // corner, turning opposite ways: they sweep a ball that runs on too far, not one that takes the bend
    // on the inside; the coin lies on that line, in the middle. No tee shot reaches the cup, so a shallow
    // bowl round it takes in a putt that is nearly there: the second shot is the one that counts)
    map: [
      '....      ',
      '.H..      ',
      '....      ',
      '....      ',
      '..........',
      '..........',
      '..........',
      '..........',
      '      ....',
      '      ....',
      '      ....',
      '      ....',
      '      ..T.',
      '      ....',
    ],
    ground: [{ t: 'hill', at: [1, 1], r: 1.3, h: -0.08 }],
    props: [
      { t: 'spinner', at: [8.2, 4.8], len: 2, speed: 1.0 },
      { t: 'spinner', at: [1.2, 6.4], len: 2, speed: -1.0, phase: 0.5 }, // (its arm's ends 0.1 m short of the near rail, not through it)
    ],
    coins: [[3.5, 4.5]],
  },
  {
    name: '割草机', tip: '等割草机开过去', par: 4,
    // (a U round the pool's inlet: up the tee's leg, across the top, down to the cup. One mower crosses
    // the top, where every ball goes by, flicking a ball that lies in its way off to the side; the other two
    // mow up and down the legs by their outer rails, flicking a ball that lies in their way back into the
    // middle. They keep a ball's width off the rail, so they turn round at the ends without going through it.
    // None of them carries a ball along while the player aims)
    map: [
      '..........',
      '..........',
      '..........',
      '....  ....',
      '....  ....',
      '....  ....',
      '....  ....',
      '....  ....',
      '....  ....',
      '.H..  ....',
      '....  ..T.',
      '....  ....',
    ],
    props: [
      { t: 'bike', id: 'mower', s: 1.3, from: [0.4, 1], to: [8.6, 1], speed: 1.0, phase: 0.3, aside: true },
      { t: 'bike', id: 'mower', s: 1.3, from: [8.85, 9.6], to: [8.85, 3.6], speed: 0.8, aside: 'in' },
      { t: 'bike', id: 'mower', s: 1.3, from: [0.15, 3.6], to: [0.15, 9.6], speed: 0.8, phase: 0.5, aside: 'in' },
    ],
    coins: [[5, 1.6]],
  },
  {
    name: '大碗', tip: '洞在碗底再过去一点', par: 2,
    // (the yard's breather: the cup a metre past the bowl's bottom, up its far side, so a putt that only
    // just gets there settles in the bottom and one too firm runs on up, and comes back)
    map: [
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
      '...........',
      '.....T.....',
      '...........',
    ],
    ground: [{ t: 'hill', at: [5, 3.1], r: 3.2, h: -0.5 }, { t: 'hill', at: [5, 7.8], r: 1.1, h: 0.22 }],
    props: [{ t: 'obj', id: 'beach_ball', at: [1, 9.5], s: 1.2 }, { t: 'obj', id: 'beach_ball', at: [9.2, 8.8], s: 1.2 }],
    coins: [[5, 5.5]], // (on the line from the tee to the cup, past the mound)
  },
  {
    name: '过山车', tip: '冲上坡顶，再拐弯进洞', par: 3,
    // (an L: up the long side over a hump and up a slope (too soft rolls back, too firm comes back off the
    // far rail), then left along the top to the cup in its corner)
    map: [
      '..........',
      '.H........',
      '..........',
      '..........',
      '      ....',
      '      ....',
      '      ....',
      '      ....',
      '      ....',
      '      ....',
      '      ....',
      '      ....',
      '      ....',
      '      ..T.',
      '      ....',
    ],
    ground: [
      { t: 'ridge', from: [5.5, 9.4], to: [9.5, 9.4], w: 2, h: 0.2 },
      { t: 'ramp', from: [7.5, 6.2], to: [7.5, 4.2], h: 0.25 },
      { t: 'hill', at: [1, 1], r: 1.2, h: -0.06 },
    ],
    props: [{ t: 'watch', id: 'dog_shiba', at: [10.25, 7] }],
    coins: [[4, 1.6]],
  },
  {
    name: '大风车', tip: '直直穿过大风车', par: 3,
    // (the yard's finale: a long lane up a slope to the big windmill (1.35 times hole 12's), and behind it
    // a terrace with the cup off to the side, so the windmill never stands between the tee and the cup; a
    // shallow bowl beside the cup brings a ball through the door round to it)
    map: [
      '.........',
      '......H..',
      '.........',
      '   ...   ',
      '   ...   ',
      '   ...   ',
      '   ...   ',
      '   ...   ',
      '   ...   ',
      '   ...   ',
      '   ...   ',
      '   ...   ',
      '   .T.   ',
      '   ...   ',
    ],
    ground: [{ t: 'ramp', from: [4, 9.6], to: [4, 7.4], h: 0.25 }, { t: 'hill', at: [5.6, 1.2], r: 2.8, h: -0.24 }],
    props: [
      { t: 'windmill', at: [4, 3.555], s: 1.35, speed: 0.75 }, // (its front on the lane's end, its back on the terrace's)
      // (a pot of roses in the corner of its front and the right-hand rail: the house is wider than the lane, so
      // a sail sweeping a ball along the front would end a little short of that rail and squeeze the ball out
      // through it; it meets the pot instead and comes away)
      { t: 'obj', id: 'rose_pot', at: [5.42, 4.68], s: 1.4 },
    ],
    coins: [[4, 6.2], [4.6, 1.4]],
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
