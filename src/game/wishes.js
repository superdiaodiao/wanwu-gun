import { fmt } from './hud.js';

// 女娲的心愿: three wishes a game, picked at random (not the last game's again), one from each tier:
// something for the first minute or two, one for the middle of the game, one for the end. They
// come true through what gets rolled up, the streak or the ball's size; each lights a star, and the
// stars add up from game to game.

const CATS = ['cat_orange', 'cat_tabby', 'cat_cow', 'cat_white', 'cat_black', 'cat_sleeping'];

// ids: any of these counts (n of them); set: one of each; tag: that one thing; combo: a streak this
// long; size: the ball this big (timed: within the 6 minutes). short: for the progress note on the
// HUD. said: what 女娲 says when it comes true. long: out of reach in the 4 minutes of the 每日挑战
export const WISHES = [
  { id: 'coins', short: '硬币', tier: 0, text: '滚起 20 枚硬币', ids: ['coin_1yuan', 'coin_5jiao'], n: 20, said: '叮叮当当，本宫收下了。' },
  { id: 'baozi', short: '包子', tier: 0, text: '滚起 5 个包子', ids: ['baozi'], n: 5, said: '包子管饱，补天才有力气。' },
  { id: 'ducks', short: '小黄鸭', tier: 0, text: '滚起 3 只小黄鸭', ids: ['rubber_duck'], n: 3, said: '小黄鸭……本宫也想要一只。' },
  { id: 'fruit', short: '水果', tier: 0, text: '滚起 6 个水果', ids: ['orange', 'apple', 'banana', 'tomato', 'watermelon', 'watermelon_half'], n: 6, said: '水果也要吃，补天讲究营养均衡。' },
  { id: 'mahjong', short: '麻将', tier: 0, text: '凑齐一万、八筒、红中、发财', set: ['mahjong_wan', 'mahjong_tong', 'mahjong_zhong', 'mahjong_fa'], said: '胡了！本宫手气不错。' },
  { id: 'marbles', short: '弹珠', tier: 0, text: '滚起 10 颗玻璃弹珠', ids: ['marble'], n: 10, said: '弹珠滚进石头里，有意思。' },
  { id: 'envelopes', short: '红包', tier: 0, text: '滚起 3 个红包', ids: ['red_envelope'], n: 3, said: '红包都给本宫？懂事。' },
  { id: 'cats', short: '猫', tier: 1, text: '滚起 3 只猫', ids: CATS, n: 3, said: '猫主子们也来补天了，本宫甚是欣慰。' },
  { id: 'aunties', short: '大妈', tier: 1, text: '滚起 5 位大妈', ids: ['auntie', 'auntie_dance', 'auntie_veg'], n: 5, said: '大妈们一上，天塌不了。' },
  { id: 'uncles', short: '大爷', tier: 1, text: '滚起 3 位大爷', ids: ['uncle', 'uncle_chess', 'uncle_birdcage', 'uncle_taichi', 'fisherman'], n: 3, said: '大爷们的棋，下到天上去吧。' },
  { id: 'speaker', short: '音箱', tier: 1, text: '把广场舞音箱滚走', tag: 'dance_speaker', said: null },
  { id: 'bikes', short: '单车', tier: 1, text: '滚起 5 辆共享单车', ids: ['shared_bike'], n: 5, said: '扫码都不用，直接滚走。' },
  { id: 'lions', short: '石狮子', tier: 1, text: '滚起 2 只石狮子', ids: ['stone_lion'], n: 2, said: '石狮子镇天门，好。' },
  { id: 'bus', short: '公交车', tier: 1, text: '把公交车滚上来', ids: ['bus'], n: 1, said: '一整车人，一起补天。' },
  { id: 'goose', short: '大鹅', tier: 1, text: '滚起一只大鹅', ids: ['goose'], n: 1, said: '大鹅都敢滚，你比本宫还勇。' },
  { id: 'combo', short: '连滚', tier: 1, text: '一口气连滚 ×30', combo: 30, said: '一口气滚这么多，手真稳。' },
  { id: 'pagoda', short: '宝塔', tier: 2, text: '把宝塔滚上来', ids: ['pagoda'], n: 1, said: '宝塔都来了，这天稳了。' },
  { id: 'ferris', short: '摩天轮', tier: 2, text: '把摩天轮滚上来', ids: ['ferris_ring'], n: 1, said: '摩天轮！本宫还没坐过呢。' },
  { id: 'train', short: '高铁', tier: 2, text: '把高铁滚上来', ids: ['bullet_train'], n: 1, long: true, said: '高铁都追上了，你比它还快。' },
  { id: 'tvtower', short: '明珠塔', tier: 2, text: '把明珠塔滚上来', ids: ['tv_tower'], n: 1, long: true, said: '……这也行？本宫服了。' },
  { id: 'mountain', short: '山', tier: 2, text: '滚起一座山', ids: ['mountain_green', 'mountain_rocky', 'mountain_karst'], n: 1, long: true, said: '山都滚得动，快去补天！' },
  { id: 'clouds', short: '云', tier: 2, text: '把 3 朵云滚下来', ids: ['cloud'], n: 3, long: true, said: '连云都滚下来了，天上干干净净。' },
  { id: 'size500', short: '长大', tier: 2, text: '6 分钟内长到 500 米', size: 500, only: 'timed', said: '这么大一块，窟窿够补了。' },
  { id: 'size1k', short: '长大', tier: 2, text: '长到 1 公里', size: 1000, only: 'free', said: '一公里！天上都装不下你了。' },
  { id: 'size100', short: '长大', tier: 2, text: '4 分钟内长到 100 米', size: 100, only: 'daily', said: '一百米！今天的你格外能滚。' },
];

export class Wishes {
  /** whereOf(id): a place name to look near (from the 图鉴), or null */
  constructor(store, whereOf) {
    this.store = store;
    this.whereOf = whereOf;
    this.list = []; // this game's: { w, p (progress), got (set), done }
    this.stars = store.get('wishStars', 0) || 0;
    this.counted = false;
  }

  /** rand: the day's own generator for the 每日挑战 (the same three for everyone that day) */
  start(mode, rand = null) {
    const last = new Set(rand ? [] : this.store.get('wishLast', []) || []);
    this.list = [0, 1, 2].map(tier => {
      const pool = WISHES.filter(w => w.tier === tier && (!w.only || w.only === mode) && !(mode === 'daily' && w.long));
      const fresh = pool.filter(w => !last.has(w.id));
      const from = fresh.length ? fresh : pool;
      const w = from[Math.floor((rand || Math.random)() * from.length)];
      return { w, p: 0, got: new Set(), done: false };
    });
    if (!rand) this.store.set('wishLast', this.list.map(x => x.w.id));
    this.counted = false;
  }

  /** no wishes this game (关卡, 对手赛) */
  clear() {
    this.list = [];
    this.counted = true;
  }

  get doneCount() { return this.list.filter(x => x.done).length; }

  /** whether rolling up o would move wish x on */
  counts(x, o) {
    const w = x.w;
    if (x.done) return false;
    return w.tag ? o.tag === w.tag : w.set ? w.set.includes(o.spec.id) && !x.got.has(o.spec.id) : !!(w.ids && w.ids.includes(o.spec.id));
  }

  /** the first unfinished wish o counts for, or null */
  wants(o) {
    for (const x of this.list) if (this.counts(x, o)) return x;
    return null;
  }

  /** a pickup: [{ x, justDone }] for the wishes it moved on */
  pickup(o) {
    const out = [];
    for (const x of this.list) {
      const w = x.w;
      if (this.counts(x, o)) {
        if (w.set) x.got.add(o.spec.id);
        x.p = w.set ? x.got.size : x.p + 1;
        x.done = x.p >= this.need(w);
        out.push({ x, justDone: x.done });
      }
    }
    return out;
  }

  /** the streak and the ball's size: wishes that came true now */
  check(combo, size) {
    const out = [];
    for (const x of this.list) {
      const w = x.w;
      if (x.done) continue;
      if (w.combo) x.p = Math.max(x.p, combo);
      else if (w.size) x.p = size;
      else continue;
      if ((w.combo && combo >= w.combo) || (w.size && size >= w.size)) {
        x.done = true;
        out.push(x);
      }
    }
    return out;
  }

  need(w) { return w.set ? w.set.length : w.n || 1; }

  /** e.g. "2/3", "现在 120 m", or '' */
  progress(x) {
    const w = x.w;
    if (x.done) return '达成';
    if (w.size) return x.p > 0 ? `现在 ${fmt(x.p)}` : '';
    if (w.combo) return x.p > 1 ? `最多 ×${x.p}` : '';
    const n = this.need(w);
    return n > 1 ? `${x.p}/${n}` : '';
  }

  /** where to look for it, for the one-thing wishes */
  hint(x) {
    const w = x.w;
    if (x.done || !w.ids || w.ids.length !== 1) return '';
    return this.whereOf(w.ids[0]) || '';
  }

  /** at the end of a game: the stars it earned go on the total (once) */
  finish() {
    if (!this.counted) {
      this.counted = true;
      this.stars += this.doneCount;
      this.store.set('wishStars', this.stars);
    }
    return this.doneCount;
  }
}
