// Ways to play, and what each keeps from game to game: the classic 6-minute 限时补天, 自由滚, the
// 每日挑战 (the same wishes for everyone on the same day, 4 minutes), five 关卡 with rules of their
// own, and 对手赛 against three other balls. Stars come from wishes that came true, the best result
// of each 关卡 and the best place in 对手赛; they unlock the ball's skins (skins.js).

export const MODES = {
  timed: { name: '限时补天', seconds: 360, wishes: true, countdown: true, ghost: true, finale: true },
  free: { name: '自由滚', seconds: null, wishes: true, countdown: false, ghost: false, finale: true },
  daily: { name: '每日挑战', seconds: 240, wishes: true, countdown: true, ghost: true, finale: true },
  rivals: { name: '对手赛', seconds: 180, wishes: false, countdown: true, ghost: false, finale: false, rivals: 3 },
  level: { name: '关卡', seconds: 180, wishes: false, countdown: true, ghost: false, finale: false },
};

// score: 'time' (seconds to reach the goal, lower is better), 'size' (m), 'cats' (how many rolled up).
// stars: the three thresholds for ★, ★★, ★★★. only: the one kind of thing that can be rolled up.
// goal: ends the level as soon as it's met ({ size } or { dancers: true }). bumps: ends it on that
// many crashes into things too big to take.
export const LEVELS = [
  {
    id: 'rush', name: '速成', text: '越快滚到 1 米越好', seconds: 120, goal: { size: 1 }, score: 'time', stars: [110, 80, 60],
    intro: '热身！看你多快能滚到一米——越快越好。',
  },
  {
    id: 'cats', name: '猫咪大集合', text: '3 分钟，滚起尽量多的猫', seconds: 180, score: 'cats', stars: [5, 10, 16],
    intro: '本宫想撸猫了。三分钟，能滚几只滚几只！',
  },
  {
    id: 'food', name: '吃货专场', text: '只有吃的能滚起来，看能长多大', seconds: 150, only: 'food', score: 'size', stars: [0.8, 1.3, 2],
    intro: '今天只收吃的！别的东西滚不起来，挑着吃。',
  },
  {
    id: 'dance', name: '广场舞清场', text: '把广场上跳舞的 24 位大妈全滚走', seconds: 240, goal: { dancers: true }, score: 'time', stars: [220, 180, 140],
    intro: '广场舞吵得本宫睡不着……去把跳舞的大妈都请走！广场在小区东边。',
  },
  {
    id: 'care', name: '小心轻放', text: '撞 5 下滚不动的东西就结束', seconds: 180, bumps: 5, score: 'size', stars: [3, 8, 20],
    intro: '这回要轻拿轻放：撞上五下滚不动的东西，就算结束。',
  },
];

export const levelById = id => LEVELS.find(l => l.id === id) || null;

/** how many stars a result earns in a level */
export function levelStars(level, score) {
  if (score === null || score === undefined) return 0;
  return level.stars.filter(t => (level.score === 'time' ? score <= t : score >= t)).length;
}

// ---- the day (local time) ------------------------------------------------------------------------

export function dayKey(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
export function dayLabel(d = new Date()) { return `${d.getMonth() + 1}月${d.getDate()}日`; }
const prevDay = key => {
  const [y, m, d] = key.split('-').map(Number);
  return dayKey(new Date(y, m - 1, d - 1));
};

/** a small seeded generator for the day's challenge (mulberry32) */
export function dayRandom(key = dayKey()) {
  let h = 1779033703;
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 3432918353) >>> 0;
  let a = h;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---- what's kept ---------------------------------------------------------------------------------

export class Progress {
  constructor(store) {
    this.store = store;
    this.levels = store.get('levels', {}) || {};
    this.rivalsBest = store.get('rivalsBest', 0) || 0;
  }

  levelBest(id) { return this.levels[id] || null; }
  levelOpen(i) { return i === 0 || (this.levels[LEVELS[i - 1].id]?.stars || 0) > 0; }
  get levelStars() { return LEVELS.reduce((n, l) => n + (this.levels[l.id]?.stars || 0), 0); }

  /** a level's result: returns { stars, best (the kept result), better (a new best) } */
  finishLevel(level, score) {
    const stars = levelStars(level, score);
    const old = this.levels[level.id] || { score: null, stars: 0 };
    const better = score !== null && (old.score === null || (level.score === 'time' ? score < old.score : score > old.score));
    this.levels[level.id] = { score: better ? score : old.score, stars: Math.max(stars, old.stars) };
    this.store.set('levels', this.levels);
    return { stars, best: this.levels[level.id], better };
  }

  finishRivals(place) {
    const stars = Math.max(0, 4 - place);
    const better = stars > this.rivalsBest;
    if (better) {
      this.rivalsBest = stars;
      this.store.set('rivalsBest', stars);
    }
    return { stars, better };
  }

  /** all stars: wishes that came true (every game), plus the best of each level and of 对手赛 */
  total(wishStars) { return wishStars + this.levelStars + this.rivalsBest; }

  // the day's challenge: today's best, and how many days in a row it's been played
  get daily() {
    const d = this.store.get('daily', null);
    return d && d.day === dayKey() ? d : null;
  }
  get streak() {
    const s = this.store.get('streak', null);
    if (!s) return 0;
    const today = dayKey();
    return s.last === today || s.last === prevDay(today) ? s.n : 0;
  }
  /** a finished daily game: returns { best, streak, better } */
  finishDaily(size, stars) {
    const today = dayKey();
    const d = this.daily;
    const better = !d || size > d.size;
    if (better) this.store.set('daily', { day: today, size, stars: Math.max(stars, d?.stars || 0) });
    else if (stars > d.stars) this.store.set('daily', { ...d, stars });
    const s = this.store.get('streak', null);
    let n = 1;
    if (s && s.last === today) n = s.n;
    else if (s && s.last === prevDay(today)) n = s.n + 1;
    this.store.set('streak', { last: today, n });
    return { best: this.daily, streak: n, better };
  }
}
