// 雪地 — snow day, holes 28–36 (yard 4): a bright winter afternoon after fresh snow. Its own thing is
// ice (the map's i), on which the ball runs on and on: touch. Then snowbanks, soft walls that soak up a
// ball's speed (obj with e 0.3); snowmen that wobble and lose their hats; a sled and a snowplow going to
// and fro; a husky that noses away a ball left lying near it; and at the end a snow fort to putt through.
// See holes.js for how a hole is written.
const bank = (at, rot = 0, more) => ({ t: 'obj', id: 'snowbank', at, rot, e: 0.3, ...more });
const short = (at, rot = 0, more) => ({ t: 'obj', id: 'snowbank_short', at, rot, e: 0.3, ...more });
const man = (at, rot = 0, s = 1.1) => ({ t: 'obj', id: 'snowman', at, rot, s, wobble: true });
const kid = (at, rot = 0, s = 1.1) => ({ t: 'obj', id: 'snowman_small', at, rot, s, wobble: true });

export default {
  name: '雪地',
  look: 'winter',
  holes: [
    // 1: round a corner of ice, a snowbank to stop in (the hole that brings in the ice: its tag says so)
    {
      name: '溜冰场', tip: '借雪堆把球停住', par: 3,
      map: [
        'iiiiii....',
        'iiiiii..H.',
        'iiiiii....',
        '....      ',
        '....      ',
        '....      ',
        '....      ',
        '....      ',
        '....      ',
        '.T..      ',
        '....      ',
      ],
      props: [bank([1.5, -0.05])],
      coins: [[0.5, 0.5]],
    },
    // 2: a band of ice across, and a snowbank: the ball slides on and on over the one, and stops dead in the
    // other; a little snowman in the mouth of the cup's corner (so it takes a putt to the corner, then one in)
    {
      name: '初雪', tip: '冰上球会一直滑', par: 3,
      map: [
        '   ...',
        '   H..',
        '   ...',
        'iiiiii',
        'iiiiii',
        '......',
        '......',
        '......',
        '.T....',
        '......',
      ],
      surfTags: false,
      props: [short([4.6, 3.4], 90), kid([3.8, 2.6])],
      coins: [[1, 4]],
    },
    // 3: snowmen to weave between, the cup on a little rink of ice a step down (a par 3: a full-length hole
    // with six snowmen, a step and ice; as a par 2 the casual player's average was exactly par)
    {
      name: '雪人', tip: '绕过雪人', par: 3,
      map: [
        '   ..iii',
        '   ..iHi',
        '   ..iii',
        '........',
        '........',
        '........',
        '...ii...',
        '...ii...',
        '........',
        '........',
        '.....   ',
        '.....   ',
        '.T...   ',
        '.....   ',
      ],
      surfTags: false,
      ground: [{ t: 'ramp', from: [4, 2.6], to: [4, 3.8], h: 0.35 }],
      // (the snowman by the step left of the line from the tee's camera to the cup, so it never hides the cup;
      // a little one at the right of the pocket's mouth, where a ball off the right rail would run in)
      props: [man([1.8, 8.6]), kid([4.6, 9.2]), man([3.6, 6.4], 20), kid([1.6, 4.4], -20), man([4.4, 4], -30), kid([6.8, 2.3], -20)],
      coins: [[6.5, 4.5]],
    },
    // 4: downhill onto ice, a sled sliding across it
    {
      name: '滑雪坡', tip: '用力打下坡，滑过冰面', par: 2,
      map: [
        '.....   ',
        '.H...   ',
        '.....   ',
        'iiiiiiii',
        'iiiiiiii',
        'iiiiiiii',
        '........',
        '........',
        '........',
        '........',
        '........',
        '   .....',
        '   .....',
        '   ..T..',
        '   .....',
      ],
      surfTags: false,
      ground: [{ t: 'ramp', from: [4, 10.6], to: [4, 6.6], h: -0.5 }],
      props: [{ t: 'bike', id: 'sled', s: 1.2, from: [1, 4], to: [6.5, 4], speed: 1.4, aside: true, call: false }],
      coins: [[3.2, 9.4]], // (on the slope, where a good first putt runs)
    },
    // 5: the husky by its patch of ice, at the foot of the bank up to the cup (ice along the bank's top too)
    {
      name: '哈士奇', tip: '球别停在哈士奇旁边', par: 3,
      map: [
        '......   ',
        '.H....   ',
        'iiiiii   ',
        '.........',
        '..iiii...',
        '..iiii...',
        '   ......',
        '    .....',
        '    .....',
        '    .....',
        '    .....',
        '    ..T..',
        '    .....',
      ],
      surfTags: false,
      ground: [{ t: 'ramp', from: [3, 3.8], to: [3, 2.3], h: 0.45 }],
      // (it looks down the hole at home, its white face to the player; the snowbank stands on the straight
      // line from the tee, so the way up goes round it)
      props: [{ t: 'goose', id: 'dog_husky', at: [4.4, 4.2], aggro: 1.8, leash: 1.4, face: 0 }, short([4.5, 8], 30)],
      coins: [[3, 5]],
    },
    // 6: a breather: an icy bowl ringed with snow
    {
      name: '冰碗', tip: '打进冰碗，球会滑进洞', par: 2,
      map: [
        '  .....  ',
        ' ....... ',
        '.....i...',
        '....iHi..',
        '.....i...',
        '.........',
        '.........',
        ' ....... ',
        ' ....... ',
        '  ..T..  ',
        '  .....  ',
      ],
      surfTags: false,
      ground: [{ t: 'hill', at: [5, 3], r: 1.6, h: -0.18 }],
      props: [short([5, 0.6]), short([3, 1.4], 45), short([7, 1.4], -45)],
      coins: [[2, 6]],
    },
    // 7: an icy road with a snowplow on it, a sled on the snow below it, and ice on up to the cup (a snowbank
    // behind it). (Snow, not ice, under the sled: a ball either one knocks aside stops before the other's lane)
    {
      name: '铲雪车', tip: '等铲雪车过去再打', par: 3,
      map: [
        '   .....   ',
        '   ...Hi   ',
        '   iiiii   ',
        '   iiiii   ',
        'iiiiiiiiiii',
        'iiiiiiiiiii',
        '...........',
        '...........',
        '   .....   ',
        '   .....   ',
        '   .....   ',
        '   ...T.   ',
        '   .....   ',
      ],
      surfTags: false,
      props: [
        { t: 'bike', id: 'snowplough', s: 1, from: [1.2, 5], to: [8.8, 5], speed: 0.8, aside: true },
        { t: 'bike', id: 'sled', s: 1.2, from: [9.2, 6.8], to: [0.8, 6.8], speed: 1.8, phase: 0.4, tag: false, aside: true, call: false },
        short([6, -0.1]),
      ],
      coins: [[6, 8]], // (on the line from the tee to the cup, before the sled's track)
    },
    // 8: up one icy lane, round the top, down the other
    {
      name: '冰上折返', tip: '雪堆帮你转弯', par: 4,
      map: [
        '............',
        '............',
        '............',
        '....    ....',
        'iiii    iiii',
        'iiii    iiii',
        'iiii    iiii',
        'iiii    iiii',
        'iiii    iiii',
        '....    ....',
        '....    ....',
        '....    iiii',
        '....    iiHi',
        '.T..    iiii',
        '....    ....',
      ],
      surfTags: false,
      props: [bank([0.5, 0.5], 45), bank([10.5, 0.5], -45), bank([5.5, 2.3])],
      coins: [[5.5, 1.2]],
    },
    // 9: the finale: over the ice past the snowmen, across the sled's track and through the snow fort's gate
    {
      name: '雪堡', tip: '躲开雪橇，穿过雪堡', par: 4,
      map: [
        '   .....   ',
        '   ....H   ',
        '   .....   ',
        '    ...    ',
        '    ...    ',
        '...........',
        '...........',
        '.iiiiiiiii.',
        '.iiiiiiiii.',
        '...........',
        '...........',
        '.......    ',
        '.......    ',
        '..T....    ',
        '.......    ',
      ],
      surfTags: false,
      ground: [{ t: 'hill', at: [6.6, 1.2], r: 2.2, h: -0.3 }], // (a bowl round the cup)
      props: [
        { t: 'tunnel', id: 'snow_fort', at: [5, 3.5], s: 1.25 },
        { t: 'bike', id: 'sled', s: 1.2, from: [1, 6.3], to: [9, 6.3], speed: 0.7, tag: false, aside: true, call: false },
        man([2.6, 8.2], 15), kid([7.6, 7.6], -25),
        { t: 'watch', id: 'dog_husky', at: [8.4, 0.4] },
      ],
      coins: [[6, 10]],
    },
  ],
  en: {
    '雪地': 'Snow Day',
    '溜冰场': 'Ice Rink',
    '借雪堆把球停住': 'Use the snowbank to stop the ball',
    '初雪': 'First Snow',
    '冰上球会一直滑': 'The ball keeps sliding on ice',
    '雪人': 'Snowmen',
    '绕过雪人': 'Weave between the snowmen',
    '滑雪坡': 'Sledding Hill',
    '用力打下坡，滑过冰面': 'Send it down the hill and across the ice',
    '哈士奇': 'Husky',
    '球别停在哈士奇旁边': "Don't stop next to the husky",
    '冰碗': 'Ice Bowl',
    '打进冰碗，球会滑进洞': 'Get the ball into the bowl and it slides in',
    '铲雪车': 'Snowplow',
    '等铲雪车过去再打': 'Let the snowplow pass',
    '冰上折返': 'Switchback',
    '雪堆帮你转弯': 'Bank off the snowbanks to turn',
    '雪堡': 'Snow Fort',
    '躲开雪橇，穿过雪堡': 'Dodge the sled, then through the fort',
  },
};
