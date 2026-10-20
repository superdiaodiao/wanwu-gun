// 对手赛: three other balls loose in the town, each with a little pilot of its own. They go for the
// best things they can take nearby, run from the player once the player could roll them up, and
// take each other when one gets big enough (the player can't be taken: bumping a bigger one just
// bounces). Each carries what it rolled up like the player's ball does, a few dozen things drawn.
//
// 大乱斗 (start(n, size, { brawl: true })): a dozen of them spread over the town, and now they hunt
// the player too: one big enough rolls the player up (the 'playerEaten' event ends the game). One
// that gets rolled up comes back a few seconds later under a new name, somewhere away from the
// player, about a third the size of the field, so there is always something to chase and to run from.
import * as THREE from 'three';
import { Ball } from './ball.js';
import { skinById } from './skins.js';
import { fmt } from './hud.js';
import { t } from '../i18n/index.js';

export const NAMES = ['秋名山滚神', '广场舞领队', '隔壁小娲', '瓜子收割机', '楼下大黄', '滚王之王', '包子铺老板', '夜の滚神', '五色石本石', '补天小能手',
  // (more for 大乱斗, where they keep coming back)
  '煎饼果子侠', '早高峰', '奶茶续命', '摸鱼达人', '不想上班', '滚滚长江', '球球大作战', '一口一个', '吃瓜群众', '电动车之王', '饭后百步滚', '退休滚神', '小区保安', '快递到了'];
// 大乱斗: the sizes the field starts at, as multiples of the player's (11 rivals)
const BRAWL_SIZES = [1, 1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10];
// 大乱斗 spawns: open ground round the 小区, the street and the plaza, away from walls and trees
const BRAWL_SPAWNS = [
  [-40, -28], [38, -26], [-34, 6], [34, 4], [-12, -30], [12, -32], [-30, 24], [30, 22], [0, 24], [-52, -2], [52, 2],
  [-60, 47], [-25, 47], [25, 47], [60, 47], [110, -40], [130, 10], [160, -50], [120, 30], [-50, -38], [48, -38],
];
const SKINS = ['qinghua', 'xigua', 'xingkong', 'panda', 'yuanbao'];
// where they start, round the player's start square (all in the carpet of seeds)
export const RIVAL_SPAWNS = [[-8.5, 9, 0.6], [8.5, 9, -0.6], [9, -5, -2.4]];

const _f = new THREE.Frustum();
const _pm = new THREE.Matrix4();
const _sp = new THREE.Sphere();
const _v = new THREE.Vector3();

export class Rivals {
  constructor(scene, world, material) {
    this.scene = scene;
    this.world = world;
    this.material = material;
    this.list = [];
    this.pool = [];
    this.cands = [];
    this.active = false;
    this.tags = document.getElementById('rival-tags');
    this.board = document.getElementById('rank-board');
    this.boardT = 0;
  }

  /** a new 对手赛: n rivals at their spots, the size the player starts at; opts.brawl: 大乱斗 */
  start(n, size, opts = {}) {
    this.stop();
    this.brawl = !!opts.brawl;
    this.size0 = size;
    const names = [...NAMES].sort(() => Math.random() - 0.5);
    this.names = names.slice(n);
    this.nameN = 0;
    const skins = [...SKINS].sort(() => Math.random() - 0.5);
    const spots = this.brawl ? [...BRAWL_SPAWNS].sort(() => Math.random() - 0.5) : RIVAL_SPAWNS;
    // (大乱斗: the field is already of all sizes when the player arrives: a few as small, most a bit
    // bigger, a couple to run from and one to fear; they start away from the player's square)
    const sizes = this.brawl ? BRAWL_SIZES.map(k => size * k).sort(() => Math.random() - 0.5) : null;
    for (let i = 0; i < n; i++) {
      let ball = this.pool[i];
      if (!ball) {
        ball = this.pool[i] = new Ball(this.scene, this.world, this.material, size);
        ball.maxStuck = 40;
        // (not the shards: those are the player's to find; nor the square dance's loudspeaker)
        ball.canPick = o => !o.tag;
      }
      const [x, z, h = Math.random() * Math.PI * 2] = spots[i % spots.length];
      ball.reset(sizes ? sizes[i % sizes.length] : size, x, z, h);
      ball.setSkin(skinById(skins[i % skins.length]));
      ball.group.visible = true;
      const el = document.createElement('div');
      el.className = 'rival-tag';
      el.innerHTML = `<b>${names[i]}</b><span></span>`;
      el.hidden = true;
      this.tags.appendChild(el);
      this.list.push({
        name: names[i % names.length], ball, el, sizeEl: el.lastChild, alive: true, out: 0, shown: '', ate: 0,
        // (a touch slower and less sure than the player can be)
        ai: { target: null, retarget: 0, probe: 2.5, px: x, pz: z, escape: 0, escH: 0, skip: new Set(), skill: this.brawl ? 0.86 + Math.random() * 0.14 : 0.78 + i * 0.06, seed: Math.random() * 9, wander: h },
      });
    }
    this.active = true;
    this.board.hidden = false;
  }

  /** 大乱斗: one that was rolled up comes back, new name, away from the player, a third of the field */
  respawn(r, player) {
    const alive = this.list.filter(c => c.alive).map(c => c.ball.S).concat(player.S).sort((a, b) => a - b);
    const S = Math.max(this.size0, alive[Math.floor(alive.length / 2)] * 0.35);
    const far = Math.max(30, player.S * 14);
    let best = null, bd = -1;
    for (const [x, z] of BRAWL_SPAWNS) {
      const d = Math.hypot(x - player.pos.x, z - player.pos.z);
      if (d > far && Math.random() < 0.5) { best = [x, z]; break; }
      if (d > bd) { bd = d; best = [x, z]; }
    }
    const name = this.names.length ? this.names.shift() : `${NAMES[this.nameN % NAMES.length]} ${2 + Math.floor(this.nameN++ / NAMES.length)}`;
    r.ball.reset(S, best[0] + (Math.random() - 0.5) * 4, best[1] + (Math.random() - 0.5) * 4, Math.random() * Math.PI * 2);
    r.ball.group.visible = true;
    r.name = name;
    r.el.firstChild.textContent = name;
    r.alive = true;
    r.ate = 0;
    r.shown = '';
    Object.assign(r.ai, { target: null, retarget: 0, escape: 0, px: r.ball.pos.x, pz: r.ball.pos.z });
    r.ai.skip.clear();
  }

  stop() {
    for (const r of this.list) {
      r.ball.group.visible = false;
      r.el.remove();
    }
    this.list.length = 0;
    this.active = false;
    this.board.hidden = true;
  }

  /**
   * One step while playing: the pilots, the balls, and who runs into whom. Returns what happened:
   * [{ type: 'eaten', r (the rival the player rolled up), gain (Sp) } | { type: 'rivalAte', r, by } |
   * { type: 'bump', r (a bigger one the player ran into) }]
   */
  update(dt, now, player) {
    const out = [];
    if (!this.active) return out;
    const evs = [];
    for (const r of this.list) {
      if (!r.alive) {
        if (this.brawl && dt > 0 && now - r.out > 4) this.respawn(r, player);
        continue;
      }
      evs.length = 0;
      // 大乱斗: rubber band: one far ahead of the player grows slower, one behind a little faster,
      // so the table stays a race (a runaway giant leaves nothing to play for)
      if (this.brawl) r.ball.rateBoost = Math.max(0.3, Math.min(1.3, (player.S * 2.5) / r.ball.S));
      r.ball.update(dt, this.think(r, dt, now, player), now, evs);
    }
    // touching: the player takes a rival small enough; rivals take each other; the rest bounce
    for (const r of this.list) {
      if (!r.alive) continue;
      const b = r.ball;
      const d = Math.hypot(b.pos.x - player.pos.x, b.pos.z - player.pos.z);
      // 大乱斗: one big enough rolls the player up
      if (this.brawl && d < b.r + player.r * 0.85 && player.S <= b.pickLimit() && now >= (player.safeUntil || 0)) {
        b.pending += player.Sp + player.pending;
        r.ate++;
        out.push({ type: 'playerEaten', by: r });
        return out;
      }
      if (d < player.r + b.r * 0.85) {
        if (b.S <= player.pickLimit()) {
          r.alive = false;
          r.out = now;
          b.group.visible = false;
          out.push({ type: 'eaten', r, gain: b.Sp + b.pending });
          continue;
        }
        if (d < player.r + b.r) {
          bounce(player, b, d);
          if (now > (r.bumpT || 0)) {
            r.bumpT = now + 0.6;
            out.push({ type: 'bump', r });
          }
        }
      }
    }
    for (const a of this.list) {
      for (const c of this.list) {
        if (a === c || !a.alive || !c.alive) continue;
        const d = Math.hypot(a.ball.pos.x - c.ball.pos.x, a.ball.pos.z - c.ball.pos.z);
        if (d >= a.ball.r + c.ball.r) continue;
        if (c.ball.S <= a.ball.pickLimit()) {
          c.alive = false;
          c.out = now;
          c.ball.group.visible = false;
          a.ball.pending += c.ball.Sp + c.ball.pending;
          a.ate++;
          out.push({ type: 'rivalAte', r: c, by: a });
        } else if (a.ball.S >= c.ball.S) bounce(a.ball, c.ball, d);
      }
    }
    return out;
  }

  /** where a rival's pilot steers this step */
  think(r, dt, now, player) {
    const b = r.ball, ai = r.ai, S = b.S, limit = b.pickLimit();
    const go = (dir, m = ai.skill) => ({ dir, m, quick: false, turnImpulse: 0, dash: false });
    // hardly moved for a while (pressed against something too big): back off somewhere else
    ai.probe -= dt;
    if (ai.probe <= 0) {
      ai.probe = 2.5;
      if (Math.hypot(b.pos.x - ai.px, b.pos.z - ai.pz) < S && ai.escape <= 0) {
        ai.escape = 1.4;
        ai.escH = b.heading + Math.PI * (0.6 + Math.random() * 0.8);
        if (ai.target) ai.skip.add(ai.target);
        ai.target = null;
      }
      ai.px = b.pos.x;
      ai.pz = b.pos.z;
      if (ai.skip.size > 40) ai.skip.clear();
    }
    if (ai.escape > 0) {
      ai.escape -= dt;
      return go(ai.escH);
    }
    // the player could take it: run (weaving a little)
    const dx = b.pos.x - player.pos.x, dz = b.pos.z - player.pos.z, dp = Math.hypot(dx, dz);
    if (S <= player.pickLimit() && dp < player.S * 5 + S * 6) return go(Math.atan2(dx, -dz) + Math.sin(now * 1.7 + ai.seed) * 0.6, Math.min(1, ai.skill + 0.12));
    // 大乱斗: the player is small enough to take, near, and worth it (one much bigger leaves a crumb
    // be): go for it, but no faster than a hair above the player's own top speed (bigger balls are
    // faster: a full-speed chase couldn't be outrun), so turning, dodging and dashing can get away
    if (this.brawl && player.S <= limit && player.S >= limit * 0.15 && dp < S * 8 + 2) {
      const m = Math.max(0.15, Math.min(ai.skill, (player.maxSpeed() * 1.05) / b.maxSpeed()));
      return go(Math.atan2(-dx, dz) + Math.sin(now * 2.3 + ai.seed) * 0.25, m);
    }
    ai.retarget -= dt;
    const t = ai.target;
    if (ai.retarget <= 0 || !t || (t.ball ? !t.alive : t.state !== 0)) {
      ai.retarget = 0.45 + Math.random() * 0.35;
      ai.target = this.pick(r, now);
    }
    const g = ai.target;
    if (g) {
      const gx = g.ball ? g.ball.pos.x : g.centerX(), gz = g.ball ? g.ball.pos.z : g.centerZ();
      return go(Math.atan2(gx - b.pos.x, -(gz - b.pos.z)));
    }
    // nothing in reach: wander, drifting back towards the middle of the map when far out
    ai.wander += (Math.random() - 0.5) * dt * 2;
    const far = Math.hypot(b.pos.x, b.pos.z);
    if (far > 900) ai.wander = Math.atan2(-b.pos.x, b.pos.z);
    return go(ai.wander, ai.skill * 0.8);
  }

  /** the best thing (or smaller rival) nearby to go for, or null */
  pick(r, now) {
    const b = r.ball, S = b.S, limit = b.pickLimit(), ai = r.ai;
    let best = null, bv = 0;
    for (const R of [Math.max(2, S * 9), Math.max(6, S * 30)]) {
      for (const o of this.world.grid.query(b.pos.x, b.pos.z, R, this.cands, S / 90)) {
        if (o.state !== 0 || o.size > limit || o.size < limit * 0.06 || now < o.noPickUntil || ai.skip.has(o) || !b.canPick(o)) continue;
        const d = Math.hypot(o.x - b.pos.x, o.z - b.pos.z);
        const v = (o.size ** 1.5 / (d + S * 0.5)) * (0.75 + Math.random() * 0.5);
        if (v > bv) {
          bv = v;
          best = o;
        }
      }
      for (const c of this.list) {
        if (c === r || !c.alive || c.ball.S > limit) continue;
        const d = Math.hypot(c.ball.pos.x - b.pos.x, c.ball.pos.z - b.pos.z);
        if (d > R) continue;
        const v = (c.ball.S ** 1.5 * 3) / (d + S * 0.5);
        if (v > bv) {
          bv = v;
          best = c;
        }
      }
      if (best) break;
    }
    return best;
  }

  /** before drawing: detail levels like the player's ball, and not drawn when out of view */
  view(camera, lodK, coarseK) {
    if (!this.active) return;
    _pm.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    _f.setFromProjectionMatrix(_pm);
    for (const r of this.list) {
      const b = r.ball;
      if (!r.alive) continue;
      _sp.center.copy(b.group.position);
      _sp.radius = b.displayS * 0.75;
      b.group.visible = _f.intersectsSphere(_sp);
      b.lodK = lodK;
      b.coarseK = coarseK;
      b.lodDist = camera.position.distanceTo(b.group.position) - b.displayS * 0.25;
    }
  }

  /** name tags over them, and the table of sizes */
  hud(dt, camera, player, W, H, top) {
    if (!this.active) return;
    for (const r of this.list) {
      let show = false;
      if (r.alive && r.ball.group.visible) {
        const b = r.ball;
        _v.set(b.pos.x, b.group.position.y + b.displayS * 0.62, b.pos.z).project(camera);
        const x = ((_v.x + 1) / 2) * W, y = ((1 - _v.y) / 2) * H;
        if (_v.z < 1 && x > 30 && x < W - 30 && y > top && y < H - 30) {
          r.el.style.transform = `translate(${x}px, ${y}px)`;
          const s = fmt(b.S);
          if (s !== r.shown) r.sizeEl.textContent = r.shown = s;
          r.el.classList.toggle('prey', b.S <= player.pickLimit());
          show = true;
        }
      }
      if (r.el.hidden === show) r.el.hidden = !show;
    }
    this.board.classList.toggle('hush', !document.getElementById('stamp').hidden);
    if ((this.boardT -= dt) > 0) return;
    this.boardT = 0.25;
    this.board.innerHTML = this.standings(player)
      .map((e, i) => `<li class="${e.me ? 'me' : ''}${e.alive ? '' : ' out'}"><i>${i + 1}</i><span>${e.name}</span><b>${e.alive ? fmt(e.S) : t('出局')}</b></li>`)
      .join('');
  }

  /** for the minimap */
  dots(player) {
    return this.list.filter(r => r.alive).map(r => ({ x: r.ball.pos.x, z: r.ball.pos.z, S: r.ball.S, prey: r.ball.S <= player.pickLimit() }));
  }

  /** everyone, biggest first; the ones rolled up last, latest out first (playerOut: 大乱斗, rolled up) */
  standings(player, playerOut = 0) {
    const all = [{ name: t('我'), S: player.S, me: true, alive: !playerOut, out: playerOut }, ...this.list.map(r => ({ name: r.name, S: r.ball.S, me: false, alive: r.alive, out: r.out }))];
    return all.sort((a, b) => (a.alive !== b.alive ? (a.alive ? -1 : 1) : a.alive ? b.S - a.S : b.out - a.out));
  }
}

/** push two touching balls apart, trading a little speed (the smaller one moves more) */
function bounce(a, b, d) {
  const nx = (b.pos.x - a.pos.x) / (d || 1), nz = (b.pos.z - a.pos.z) / (d || 1);
  const overlap = a.r + b.r - d;
  const wa = b.S / (a.S + b.S), wb = 1 - wa;
  a.pos.x -= nx * overlap * wa;
  a.pos.z -= nz * overlap * wa;
  b.pos.x += nx * overlap * wb;
  b.pos.z += nz * overlap * wb;
  const rel = (b.vel.x - a.vel.x) * nx + (b.vel.z - a.vel.z) * nz;
  if (rel < 0) {
    a.vel.x += nx * rel * wa * 1.2;
    a.vel.z += nz * rel * wa * 1.2;
    b.vel.x -= nx * rel * wb * 1.2;
    b.vel.z -= nz * rel * wb * 1.2;
  }
}
