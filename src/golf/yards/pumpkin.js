// 南瓜地 — the pumpkin patch, holes 19–27 (yard 3): a crisp autumn morning in a back-garden vegetable
// patch. Its own thing is mud (the map's m), which slows the ball hard and holds it where it stops:
// power control. Then steps down between the beds, hens crossing, wobbling pumpkins, a pig in its
// wallow, crows, a wheelbarrow, muddy leaf piles and, last, the giant prize pumpkin the ball rolls
// through (its lid pops off when the ball drops). Each new thing comes alone first, with its word over
// it, then with the others; see holes.js for how a hole is written.
export default {
  name: '南瓜地',
  season: '秋',
  look: 'autumn',
  holes: [
    // 1: mud alone — an L: up the tee's leg through a two-row band of mud, then left along the far bed to
    // the cup at its end (straight up to the cup, an easy putt went in from the tee more often than not).
    // The pond in the L's corner holds a mud wallow (corner: 'wallow', see looks/autumn.js), not the
    // raised beds that stand in hole 2's
    {
      name: '泥巴路', tip: '打重一点穿过泥地', par: 3, corner: 'wallow',
      map: [
        '.......',
        '.......',
        'H......',
        '.......',
        '    ...',
        '    mmm',
        '    mmm',
        '    ...',
        '    ...',
        '    ...',
        '    .T.',
        '    ...',
      ],
      props: [{ t: 'watch', id: 'goose', at: [-1.25, 2.2] }],
      coins: [[4, 5.5]],
    },
    // 2: a step down into the next bed (an L): the step sends the ball on, and holds it in the low bed
    {
      name: '菜畦', tip: '下了台阶再拐弯', par: 3, surfTags: false,
      map: [
        '.........',
        '......H..',
        '.........',
        '....     ',
        '....     ',
        '....     ',
        '....     ',
        '....     ',
        '....     ',
        '....     ',
        '.T..     ',
        '....     ',
      ],
      ground: [{ t: 'ramp', from: [1.5, 3.2], to: [1.5, 4.6], h: 0.4 }],
      props: [
        { t: 'obj', id: 'crate_apples', at: [8.1, 2.3], rot: 10, s: 1.2 },
        { t: 'obj', id: 'watering_can', at: [2.9, 0.2], rot: 200, s: 1.4 },
      ],
      coins: [[3, 2]], // (at the corner, where the ball turns for the cup)
    },
    // 3: hens cross the middle of a zigzag; a step down into the cup's bed, mud at its foot
    {
      name: '母鸡过路', tip: '等母鸡走过去再打', par: 3, surfTags: false,
      map: [
        '.....  ',
        '.H...  ',
        '.....  ',
        '.mm..  ',
        '.......',
        '  .....',
        '  .....',
        '  .....',
        '  .....',
        '.......',
        '.....  ',
        '..o..  ',
        '..T..  ',
        '.....  ',
      ],
      ground: [{ t: 'ramp', from: [2, 3.4], to: [2, 4.4], h: 0.35 }],
      props: [
        { t: 'bike', id: 'chicken', walk: true, len: 0.7, from: [2.7, 6], to: [5.6, 6], speed: 0.55, phase: 0, call: 'cluck', tag: '母鸡会挡路' },
        { t: 'bike', id: 'chicken', walk: true, len: 0.7, from: [5.6, 7.6], to: [2.7, 7.6], speed: 0.7, phase: 0.5, call: 'cluck', tag: '母鸡会挡路' },
      ],
    },
    // 4: a slalom up a staircase of beds through wobbling pumpkins; a coin in a muddy gap between two
    // of them (the risky way). Three levels: the tee's bed, the middle bed 0.35 m up, the cup's bed 0.8 m up,
    // their earth fronts stepping up the left edge; a little hollow round the cup holds a ball that climbs
    // the last step
    {
      name: '南瓜阵', tip: '绕着南瓜走', par: 3, surfTags: false,
      map: [
        '.....     ',
        '.H....    ',
        '......    ',
        '.......   ',
        '  ........',
        '  ........',
        '   .......',
        '   ..mm...',
        '    ......',
        '     .....',
        '     .....',
        '     ..T..',
        '     .....',
      ],
      ground: [
        { t: 'ramp', from: [6, 9.6], to: [6, 8.4], h: 0.35 },
        { t: 'ramp', from: [3, 4.6], to: [3, 3.4], h: 0.45 },
        { t: 'hill', at: [1, 0.6], r: 1.6, h: -0.2 },
      ],
      props: [
        { t: 'obj', id: 'pumpkin', at: [6.9, 8.6], s: 1.35, wobble: true },
        { t: 'obj', id: 'pumpkin', at: [4.4, 6.4], s: 1.4, wobble: true },
        { t: 'obj', id: 'pumpkin_white', at: [7.6, 5.4], s: 1.35, wobble: true },
        { t: 'obj', id: 'pumpkin', at: [5.2, 3.6], s: 1.3, wobble: true },
        { t: 'obj', id: 'pumpkin_small', at: [2.5, 2.4], s: 1.5, wobble: true },
      ],
      coins: [[5.5, 7.3]],
    },
    // 5: a long U round the pig's pen, its far end a bank 0.7 m up (its earth face shows across the pen):
    // up the tee's leg, along the top past the pig, down the cup's leg to a hollow round the cup. The pig
    // keeps its wallow in the top corner: a ball left lying in its mud gets nosed out, away from the corner
    {
      name: '猪圈', tip: '球别停在小猪的泥坑里', par: 4, surfTags: false,
      map: [
        'mm.......',
        '.........',
        '.........',
        '...   ...',
        '...   ...',
        '...   ...',
        '...   ...',
        '...   ...',
        '...   ...',
        '...   ...',
        '.H.   ...',
        '...   ...',
        '...   .T.',
        '...   ...',
      ],
      ground: [{ t: 'ramp', from: [4, 4.6], to: [4, 2.6], h: 0.7 }, { t: 'hill', at: [1, 10], r: 1.6, h: -0.22 }],
      props: [
        { t: 'goose', id: 'pig', at: [0, 0], aggro: 2.6, leash: 1.8, s: 1.25, call: 'oink' },
      ],
      coins: [[2.5, 2]], // (at the far bend, where every ball comes round)
    },
    // 6: the breather: two steps funnel down to the cup, crows watching from the posts
    {
      name: '乌鸦窝', tip: '打足劲，台阶会把球送进洞', par: 2,
      map: [
        ' ...   ',
        '..H..  ',
        '...... ',
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
        { t: 'ramp', from: [3, 7], to: [3, 8], h: 0.2 },
        { t: 'ramp', from: [3, 4], to: [3, 5], h: 0.2 },
        { t: 'hill', at: [2, 1], r: 1.7, h: -0.16 },
      ],
      props: [
        { t: 'watch', id: 'bird_crow', at: [-0.95, 5.5], s: 2.1 },
        { t: 'watch', id: 'bird_crow', at: [7.25, 2.5], s: 2.1 },
      ],
      coins: [[2.5, 7]], // (on the line from the tee to the cup)
    },
    // 7: an S down two steps, one at each bend; a wheelbarrow trundles across the middle bed
    {
      name: '独轮车', tip: '等独轮车推过去再打', par: 4, surfTags: false,
      map: [
        '...........',
        '.H.........',
        '...........',
        '...........',
        '    .......',
        '...........',
        '...........',
        '...........',
        '.......    ',
        '...........',
        '...........',
        '...........',
        '.......T...',
        '...........',
      ],
      ground: [
        { t: 'ramp', from: [3, 7.4], to: [3, 8.6], h: 0.25 },
        { t: 'ramp', from: [7, 3.4], to: [7, 4.6], h: 0.25 },
      ],
      props: [
        { t: 'bike', id: 'wheelbarrow', len: 1.4, from: [4.4, 6], to: [9.4, 6], speed: 0.8, pause: 1, call: false, aside: true },
        { t: 'obj', id: 'pumpkin', at: [0.8, 10.6], s: 1.35, wobble: true },
      ],
      coins: [[4.2, 4]], // (in the gap up to the cup's bed, where every ball goes through)
    },
    // 8: leaf piles — round a raised bed in the middle, either side: the left way over a muddy mound,
    // the right way past a cat on the fence by the cup (the way that works: the tip says so, and the coin
    // lies on it)
    {
      name: '落叶堆', tip: '土包上有泥，从右边绕', par: 3, surfTags: false,
      map: [
        '...........',
        '.........H.',
        '...........',
        '...........',
        '...     ...',
        '.m.     ...',
        'mmm     ...',
        '.m.     ...',
        '...     ...',
        '...........',
        '...........',
        '...........',
        '.T.........',
        '...........',
      ],
      ground: [{ t: 'hill', at: [1, 6], r: 1.6, h: 0.3 }, { t: 'hill', at: [5, 10.5], r: 1.5, h: 0.24 }],
      props: [
        { t: 'cat', id: 'cat_orange', at: [10.85, 3.2], face: 270, period: 2.4, tag: false },
        { t: 'obj', id: 'pumpkin', at: [8.4, 6.6], s: 1.35, wobble: true },
        { t: 'obj', id: 'leaf_pile', at: [5, 6], s: 1.4 },
      ],
      coins: [[10, 8]],
    },
    // 9: the finale — up the tee's bed and down a step into the hens' bed, then through the giant
    // pumpkin's door to the cup behind it; its lid pops off when the ball drops
    {
      name: '大南瓜', tip: '穿过大南瓜的门', par: 4, surfTags: false,
      map: [
        ' ......     ',
        ' ....H.     ',
        ' ......     ',
        '  ...       ',
        '  ...       ',
        '............',
        '............',
        '............',
        '.mm.........',
        '       .....',
        '       .....',
        '       .....',
        '       .....',
        '       ...T.',
        '       .....',
      ],
      ground: [
        { t: 'ramp', from: [9, 8.6], to: [9, 9.6], h: 0.3 },
        { t: 'hill', at: [5, 1], r: 2.4, h: -0.28 },
      ],
      props: [
        { t: 'tunnel', id: 'pumpkin_giant', at: [3, 3.7], s: 1.15, fill: 1.5 },
        // (one hen: a second one, across the step's foot, kept the casual player on easy at the floor)
        { t: 'bike', id: 'chicken', walk: true, len: 0.7, from: [0.5, 6], to: [10.5, 6], speed: 0.48, call: 'cluck', tag: false },
        { t: 'obj', id: 'pumpkin', at: [0.6, 5.4], s: 1.35, wobble: true },
        { t: 'obj', id: 'pumpkin_white', at: [6.4, 5.3], s: 1.3, wobble: true },
      ],
      coins: [[10.6, 10.4], [1, 8]], // (the second in the mud by the hens' bed: the risky line)
    },
  ],
  en: {
    '南瓜地': 'Pumpkin Patch',
    '泥巴路': 'Muddy Path',
    '打重一点穿过泥地': 'Putt firmly through the mud',
    '菜畦': 'Raised Beds',
    '下了台阶再拐弯': 'Down the step, then around the corner',
    '母鸡过路': 'Hen Crossing',
    '等母鸡走过去再打': 'Wait for the hens to cross',
    '母鸡会挡路': 'Hens block the way',
    '南瓜阵': 'Slalom',
    '绕着南瓜走': 'Weave past the pumpkins',
    '猪圈': 'Pig Pen',
    '球别停在小猪的泥坑里': "Keep the ball out of the pig's mud",
    '乌鸦窝': "Crow's Nest",
    '打足劲，台阶会把球送进洞': 'Putt firmly: the steps funnel it in',
    '独轮车': 'Wheelbarrow',
    '等独轮车推过去再打': 'Let the wheelbarrow pass',
    '落叶堆': 'Leaf Piles',
    '土包上有泥，从右边绕': 'Muddy mound: go around on the right',
    '大南瓜': 'Giant Pumpkin',
    '穿过大南瓜的门': "Putt through the pumpkin's door",
  },
};
