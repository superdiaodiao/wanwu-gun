// 五色石碎片: ten crystal shards hidden round the map, from a sandpit you can reach right away to a
// cloud only a ball of a couple of hundred metres can touch. Each one found stays found from game
// to game (it isn't put out again); all ten unlock the 五色神石 skin. Close ones twinkle, so a
// player who comes near notices something shiny.
export const SHARDS = [
  { x: -43.5, z: -33.2, size: 0.04, hint: '小区的沙坑里' },
  { x: -6.5, z: 1, size: 0.05, hint: '麻将桌底下' },
  { x: -26, z: 47.5, size: 0.4, hint: '小吃街上' },
  { x: -160, z: -38, size: 1.2, hint: '公园的池塘中间' },
  { x: 0, z: -130, size: 2.5, hint: '学校操场正中' },
  { x: 138, z: -18, size: 3, hint: '广场舞的正中间' },
  { x: -165, z: -150, size: 4, top: 'pagoda', hint: '宝塔顶上' },
  { x: 470, z: 296, size: 8, hint: '摩天轮脚下' },
  { x: 200, z: -768, size: 15, hint: '高铁高架桥边' },
  { x: -420, z: -280, y: 150, size: 30, hint: '天上的云里' },
];

export class Shards {
  constructor(store) {
    this.store = store;
    this.found = new Set(store.get('shards', []) || []);
    this.objs = [];
  }

  get count() { return this.found.size; }
  get total() { return SHARDS.length; }

  /** put them all into the world (before world.finalize) */
  place(world) {
    const spec = world.type('wuse_shard')?.spec;
    if (!spec) return;
    SHARDS.forEach((s, i) => {
      let y = s.y || 0;
      if (s.top) {
        const t = world.type(s.top);
        if (t) y = t.spec.dims.h * 0.98;
      }
      const o = world.add('wuse_shard', s.x, s.z, { y, yaw: i * 1.3, scale: s.size / spec.maxDim, tag: 'shard:' + i });
      if (o) this.objs[i] = o;
    });
  }

  /** a new game: the ones already found aren't out there */
  hideFound(world) {
    for (const i of this.found) {
      const o = this.objs[i];
      if (o && o.state === 0) {
        world.detach(o);
        o.state = 3;
      }
    }
  }

  /** rolled one up: returns its index if it's a new find, else -1 */
  take(o) {
    if (!o.tag || !o.tag.startsWith('shard:')) return -1;
    const i = +o.tag.slice(6);
    if (this.found.has(i)) return -1;
    this.found.add(i);
    this.store.set('shards', [...this.found]);
    return i;
  }

  /** where the missing ones are said to be */
  hints() { return SHARDS.map((s, i) => ({ hint: s.hint, found: this.found.has(i) })); }
}
