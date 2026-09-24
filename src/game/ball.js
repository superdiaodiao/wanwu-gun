// The katamari: a five-coloured 补天石 core that rolls, sticks what it touches, grows, and sheds
// items when it slams into something too big.
import * as THREE from 'three';
import { Model } from '../core/modeler.js';
import { noise2 } from '../core/rng.js';
import { wantCoarse } from '../core/assets.js';

export const PICK_RATIO = 0.6; // roll up things smaller than 0.6 × diameter
// growth: S^P accumulates C × (0.3 + fill) × size^P per item. With P ≈ 2 an item a third of the
// ball's size adds ~3 % to the diameter, one at the pick limit ~12 %, a speck ~0.3 %.
// Growth first lands in a `pending` pool that the ball absorbs at most `rate` (fraction of its
// diameter) per second, so a burst of pickups snowballs smoothly instead of all at once.
// The rate eases off as the ball grows: quick early, a steady ~×2 per 40 s late.
export const GROW = { P: 1.5, C: 1.0, cap: 0.1, rate: S => 0.02 + 0.035 / (1 + S / 3), speed: 3.4 };
// handling: the heading swings to where the player points at TURN rad/s, and the velocity eases
// towards the wanted one at ACC (pushing) / BRAKE (let go) per second — brisk, so the ball goes
// where it is pointed instead of sailing past what the player was aiming for
const TURN = 10, ACC = 8, BRAKE = 5;
// 连滚: pickups less than `window` s apart form a streak; each step adds `step` to the growth of the
// next pickup, up to +`max` — rolling through a cluster pays off right away
export const COMBO = { window: 1, step: 0.02, max: 0.4 };
// most stuck items drawn at once (the smallest go first); set per quality (engine.js QUALITY.stuck)
export const STUCK = { max: 1400 };
// The visible stone core shrinks relative to the ball as items pile up (0.9 → 0.7 of the radius),
// so recent pickups stay on the surface for a long while instead of sinking straight in.
const ATTACH_K = 0.9; // stuck item centres sit at this × (S / 2)

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _qi = new THREE.Quaternion();
const _qw = new THREE.Quaternion();
const _m = new THREE.Matrix4();
const _s = new THREE.Vector3();
const _off = new THREE.Matrix4();
const _c = new THREE.Color();
const UP = new THREE.Vector3(0, 1, 0);
const _ct = {};
const _a = new THREE.Vector3();

function buildCoreGeometry() {
  const m = new Model(5);
  const pal = [0x2aa198, 0xd8342c, 0xf2c14e, 0xf4efe2, 0x2b2733];
  const agate = (x, y, z) => {
    const t = y * 2.1 + 0.55 * Math.sin(x * 3.1 + z * 2.3) + 0.6 * noise2(x * 2.2 + 7.1, z * 2.2 - 3.3) + 0.3 * noise2(y * 3 + 1, x * 3);
    return pal[(((Math.floor((t + 10) * 1.55)) % 5) + 5) % 5];
  };
  m.geo(new THREE.IcosahedronGeometry(1, 3), agate);
  const N = 26;
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  for (let i = 0; i < N; i++) {
    const y = 1 - ((i + 0.5) / N) * 2;
    const rr = Math.sqrt(1 - y * y);
    const phi = i * 2.399963;
    const n = new THREE.Vector3(Math.cos(phi) * rr, y, Math.sin(phi) * rr);
    q.setFromUnitVectors(UP, n);
    e.setFromQuaternion(q);
    m.push(n.x * 0.98, n.y * 0.98, n.z * 0.98, e.x, e.y, e.z);
    m.cyl(0.06, 0.1, 0.1, 0xd9a432, 0, 0.03, 0, 0, 0, 0, 6);
    m.sphere(0.065, 0xf6d06a, 0, 0.09, 0, 1, 0.75, 1, 0, 0, 0, 6);
    m.pop();
  }
  return m.build({ lift: false });
}

const levelGeometry = (spec, level) => (level === 2 ? spec.coarse : level === 1 ? spec.lod : spec.geometry);

export class Ball {
  constructor(scene, world, material, startSize = 0.12) {
    this.scene = scene;
    this.world = world;
    this.material = material;
    // outer group: position + squash (world vertical); inner root: the rolling rotation
    this.group = new THREE.Group();
    this.root = new THREE.Group();
    this.group.add(this.root);
    scene.add(this.group);
    this.core = new THREE.Mesh(buildCoreGeometry(), material);
    this.core.castShadow = true;
    this.core.receiveShadow = true;
    this.core.layers.enable(1); // layer 1 = the results-screen portrait of the ball
    this.root.add(this.core);
    this.stuckTypes = new Map();
    this.visible = [];
    this.buried = 0;
    this.reset(startSize, 0, 0, 0);
  }

  reset(size, x, z, heading) {
    this.S0 = size;
    this.S = size;
    this.Sp = size ** GROW.P;
    this.pending = 0;
    this.displayS = size;
    this.expand = 1;
    this.lodK = 12;
    this.coarseK = 60;
    this.lodDist = 0;
    this.pos = new THREE.Vector3(x, 0, z);
    this.vel = new THREE.Vector3();
    this.heading = heading;
    this.q = new THREE.Quaternion();
    this.dashT = 0;
    this.dashReady = 0;
    this.bumpCd = 0;
    this.squash = 0;
    this.lastPick = null;
    this.stats = { count: 0, byCat: {}, byType: {}, biggest: null, lost: 0, bestCombo: 0 };
    this.combo = { n: 0, t: -9, extra: 0 }; // extra: growth (in Sp units) the streak has added
    for (const st of this.stuckTypes.values()) {
      st.entries.length = 0;
      st.mesh.count = 0;
    }
    this.visible.length = 0;
    this.cleanT = 0;
    this.updateVisual(0);
  }

  get r() { return this.S / 2; }
  /** the size the ball is growing towards (what it has taken in, absorbed or not) */
  get futureS() { return (this.Sp + this.pending) ** (1 / GROW.P); }
  /** extra diameter the current streak has earned */
  get comboExtra() {
    const f = this.Sp + this.pending;
    return f ** (1 / GROW.P) - Math.max(1e-9, f - this.combo.extra) ** (1 / GROW.P);
  }
  /** 0 with a bare core, → 1 once the ball is covered in stuff */
  get covered() { return 1 - Math.exp(-this.stats.count / 18); }
  get rCore() { return (this.displayS / 2) * (0.9 - 0.2 * this.covered); }
  /** height of the ball's centre: the bare core sits on the ground, a full ball rides on its items */
  get centerY() {
    const rc = this.rCore;
    return rc + (this.displayS / 2 - rc) * 0.55 * this.covered;
  }
  forward(out = _v) { return out.set(Math.sin(this.heading), 0, -Math.cos(this.heading)); }
  maxSpeed() { return GROW.speed * Math.pow(this.S, 0.93) + 0.12; }
  pickLimit() { return this.S * PICK_RATIO; }
  speed() { return Math.hypot(this.vel.x, this.vel.z); }

  /**
   * input: { dir: world heading to roll towards (null: let go), m: 0..1 how hard, dash bool }
   * events: array receiving { type: 'pickup' | 'bump' | 'knock', ... }
   */
  update(dt, input, now, events) {
    const vmax = this.maxSpeed();
    const m = input.dir === null || input.dir === undefined ? 0 : input.m;
    if (m > 0) {
      let d = (input.dir - this.heading) % (Math.PI * 2);
      if (d > Math.PI) d -= Math.PI * 2;
      if (d < -Math.PI) d += Math.PI * 2;
      const step = TURN * dt;
      this.heading += Math.max(-step, Math.min(step, d));
    }
    const fx = Math.sin(this.heading), fz = -Math.cos(this.heading);
    if (input.dash && now >= this.dashReady) {
      this.dashT = 0.55;
      this.dashReady = now + 1.4;
      this.vel.x += fx * vmax * 1.1;
      this.vel.z += fz * vmax * 1.1;
      events.push({ type: 'dash' });
    }
    const dashing = this.dashT > 0;
    this.dashT -= dt;
    // a dash carries on for its half second even if the stick is let go
    const want = dashing ? Math.max(m, 0.6) * vmax * 1.85 : m * vmax;
    const k = 1 - Math.exp(-(m > 0 || dashing ? ACC : BRAKE) * dt);
    this.vel.x += (fx * want - this.vel.x) * k;
    this.vel.z += (fz * want - this.vel.z) * k;

    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;

    // contacts
    this.pos.y = this.r;
    // things small enough to take are grabbed from a little way off, so near misses still count
    const MAGNET = 1.15;
    const cands = this.world.grid.query(this.pos.x, this.pos.z, this.r * MAGNET, this._cands || (this._cands = []), this.S / 90);
    const limit = this.pickLimit();
    for (let i = 0; i < cands.length; i++) {
      const o = cands[i];
      if (o.state !== 0) continue;
      const pickable = o.size <= limit && now >= o.noPickUntil;
      const ct = this.world.contact(o, this.pos, pickable ? this.r * MAGNET : this.r, _ct);
      if (!ct) continue;
      if (pickable) this.pick(o, now, events);
      else this.collide(o, ct, now, events);
    }

    // rolling
    const d = Math.hypot(this.vel.x, this.vel.z) * dt;
    if (d > 1e-7) {
      _v.set(this.vel.z, 0, -this.vel.x).normalize();
      _q.setFromAxisAngle(_v, d / Math.max(1e-4, this.centerY));
      this.q.premultiply(_q);
    }

    // absorb pending growth, at most GROW.rate of the diameter per second
    if (this.pending > 0) {
      const rate = typeof GROW.rate === 'function' ? GROW.rate(this.S) : GROW.rate;
      const room = ((1 + rate * dt) ** GROW.P - 1) * this.Sp;
      const a = Math.min(this.pending, Math.max(room, this.Sp * 1e-6));
      this.Sp += a;
      this.pending -= a;
      this.S = this.Sp ** (1 / GROW.P);
    }
    // grow smoothly toward the true size; stuck items ride outward with the surface (in steps of
    // half a percent, so the whole ball isn't rewritten every frame)
    const prevDisp = this.displayS;
    this.displayS += (this.S - this.displayS) * Math.min(1, dt * 5);
    if (prevDisp > 0) this.expand *= this.displayS / prevDisp;
    if (Math.abs(this.expand - 1) > 0.005) {
      const f = this.expand;
      this.expand = 1;
      for (let i = 0; i < this.visible.length; i++) {
        const e = this.visible[i];
        e.pos.multiplyScalar(f);
        e.from.multiplyScalar(f);
        e.moved = true;
      }
    }
    this.squash *= Math.exp(-dt * 9);
    this.updateVisual(dt);

    this.cleanT -= dt;
    if (this.cleanT <= 0) {
      this.cleanT = 0.3;
      this.cleanup();
    }
  }

  pick(o, now, events) {
    const w = this.world;
    // centre of the object in world space
    const cx = o.centerX(), cz = o.centerZ(), cy = o.y + o.h * 0.5 + o.bob;
    w.detach(o);
    o.state = 1;
    // base orientation of the object in world space
    _q.setFromAxisAngle(UP, o.yaw);
    if (o.pitch || o.roll) {
      const e = new THREE.Euler(o.pitch, 0, o.roll);
      _q.multiply(new THREE.Quaternion().setFromEuler(e));
    }
    _qi.copy(this.q).invert();
    const localQuat = _qi.clone().multiply(_q);
    // direction from the ball centre, in ball space
    _v.set(cx - this.pos.x, cy - this.centerY, cz - this.pos.z);
    const startLocal = _v.clone().applyQuaternion(_qi);
    if (_v.lengthSq() < 1e-10) _v.set(0, 1, 0);
    _v.normalize();
    const target = _v.clone().applyQuaternion(_qi).multiplyScalar(this.r * ATTACH_K);
    this.addStuck(o, target, localQuat, startLocal);

    // streak (see COMBO)
    const c = this.combo;
    if (now - c.t < COMBO.window) c.n++;
    else {
      c.n = 1;
      c.extra = 0;
    }
    c.t = now;
    const mult = 1 + Math.min(COMBO.max, (c.n - 1) * COMBO.step);
    // one item can add at most `cap` to the diameter, so a lucky chain can't snowball out of control
    const maxGain = ((1 + GROW.cap) ** GROW.P - 1) * this.Sp;
    const base = GROW.C * (0.3 + (o.spec.fill ?? 0.45)) * o.size ** GROW.P;
    o.growth = Math.min(maxGain, base * mult);
    c.extra += Math.max(0, o.growth - Math.min(maxGain, base));
    // how much this adds to the diameter once absorbed (shown straight away)
    const before = (this.Sp + this.pending) ** (1 / GROW.P);
    this.pending += o.growth;
    const gain = (this.Sp + this.pending) ** (1 / GROW.P) - before;
    this.squash = Math.min(0.12, this.squash + 0.02 + 0.3 * (o.size / this.S));

    const st = this.stats;
    const first = !st.byType[o.spec.id];
    st.count++;
    st.byType[o.spec.id] = (st.byType[o.spec.id] || 0) + 1;
    st.byCat[o.spec.cat] = (st.byCat[o.spec.cat] || 0) + 1;
    if (!st.biggest || o.size > st.biggest.size) st.biggest = { id: o.spec.id, name: o.spec.name, size: o.size };
    st.bestCombo = Math.max(st.bestCombo, c.n);
    this.lastPick = o;
    events.push({ type: 'pickup', o, first, rel: o.size / this.S, combo: c.n, mult, gain });

    // things that belong together (a rotor on its tower, a rider on a bike) go together
    if (o.links) for (const l of o.links) if (l.state === 0) this.pick(l, now, events);
  }

  /**
   * What the ball would run into (or brush past) rolling `dist` further towards the world heading
   * `dir` — only things it can't take, and not low ledges it rolls over: swept as overlapping spheres
   * a little wider than the ball, each thing once, nearest first, into hits[] as
   * { o, dist, x, y, z } (the point on it that would be hit). Returns how many (at most max).
   */
  ahead(dir, dist, hits, max = 3) {
    const dx = Math.sin(dir), dz = -Math.cos(dir);
    const r = this.r * 1.2, limit = this.pickLimit(), step = this.r * 0.6;
    const cands = this._aheadC || (this._aheadC = []);
    let n = 0;
    for (let t = step; t <= dist && n < max; t += step) {
      _a.set(this.pos.x + dx * t, this.pos.y, this.pos.z + dz * t);
      // (only things bigger than it can take matter here: skip the grid levels of small stuff)
      for (const o of this.world.grid.query(_a.x, _a.z, r, cands, limit * 0.5)) {
        if (o.state !== 0 || o.size <= limit || n >= max) continue;
        let seen = false;
        for (let i = 0; i < n; i++) if (hits[i].o === o) seen = true;
        if (seen) continue;
        const ct = this.world.contact(o, _a, r, _ct);
        if (!ct || (ct.low && o.h < this.r * 0.5)) continue;
        const h = hits[n] || (hits[n] = {});
        h.o = o;
        h.dist = t;
        h.x = ct.px;
        h.y = ct.py;
        h.z = ct.pz;
        n++;
      }
    }
    return n;
  }

  collide(o, ct, now, events) {
    if (ct.low && o.h < this.r * 0.5) return;
    this.pos.x += ct.nx * ct.depth;
    this.pos.z += ct.nz * ct.depth;
    // still leaning on it from the last few frames: slide along, it's not a fresh crash (the ball
    // keeps being pushed into a wall, which mustn't count as hitting it again and again)
    const leaning = now - (o.touchT ?? -9) < 0.25;
    o.touchT = now;
    let vn = this.vel.x * ct.nx + this.vel.z * ct.nz;
    if (leaning) {
      if (vn < 0) {
        this.vel.x -= vn * ct.nx;
        this.vel.z -= vn * ct.nz;
      }
      return;
    }
    // moving vehicles shove the ball
    const mv = o.mover;
    let shove = 0;
    if (mv && mv.vx !== undefined) {
      const cvn = mv.vx * ct.nx + mv.vz * ct.nz;
      if (cvn > 0) {
        shove = cvn;
        vn -= cvn;
      }
    }
    if (vn < 0) {
      // a soft bounce: plain rolling into something just stops you, it doesn't cost anything; only
      // crashing in at dash speed (or being rammed by a car) knocks things off the ball
      this.vel.x -= 1.2 * vn * ct.nx;
      this.vel.z -= 1.2 * vn * ct.nz;
      const impact = -vn / this.maxSpeed();
      if (impact > 0.22 && now > this.bumpCd) {
        this.bumpCd = now + 0.3;
        const hardShove = shove > this.maxSpeed() * 0.5;
        const knock = (impact > 1.15 || hardShove) && now > (this.knockCd || 0);
        events.push({ type: 'bump', strength: Math.min(1, impact), o, shove });
        if (knock) {
          this.knockCd = now + 1.5;
          this.knockOff(Math.min(4, 1 + Math.floor(Math.max(0, impact - 1.15) * 4)), now, events);
        }
      }
    }
  }

  // ---- stuck items ----------------------------------------------------------------------

  stuckType(o) {
    const id = o.spec.id;
    let st = this.stuckTypes.get(id);
    if (!st) {
      st = { spec: o.spec, cap: 8, mesh: null, entries: [], hasTint: o.type.hasTint, dirty: false, level: 0 };
      st.mesh = this.makeStuckMesh(st, st.cap);
      this.stuckTypes.set(id, st);
    }
    if (st.entries.length >= st.cap) {
      const old = st.mesh;
      st.cap *= 2;
      st.mesh = this.makeStuckMesh(st, st.cap);
      for (let i = 0; i < st.entries.length; i++) {
        old.getMatrixAt(i, _m);
        st.mesh.setMatrixAt(i, _m);
        if (st.hasTint) {
          old.getColorAt(i, _c);
          st.mesh.setColorAt(i, _c);
        }
      }
      st.mesh.count = st.entries.length;
      this.root.remove(old);
      old.dispose();
    }
    return st;
  }

  makeStuckMesh(st, cap) {
    const mesh = new THREE.InstancedMesh(levelGeometry(st.spec, st.level), this.material, cap);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    if (st.hasTint) mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3).fill(1), 3);
    mesh.count = 0;
    mesh.frustumCulled = false;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.layers.enable(1);
    this.root.add(mesh);
    return mesh;
  }

  addStuck(o, pos, quat, from) {
    const st = this.stuckType(o);
    const cat = o.spec.cat;
    const e = {
      o, st, pos, quat, from, t: 0,
      idx: st.entries.length,
      wiggle: cat === 'person' || cat === 'animal',
      phase: Math.random() * 6.28,
      born: performance.now(),
    };
    st.entries.push(e);
    st.mesh.count = st.entries.length;
    if (st.hasTint && o.tint != null) {
      _c.setHex(o.tint);
      st.mesh.setColorAt(e.idx, _c);
      st.mesh.instanceColor.needsUpdate = true;
    }
    e.vi = this.visible.length;
    this.visible.push(e);
    this.writeStuck(e, 0);
  }

  writeStuck(e, time) {
    const o = e.o;
    let p = e.pos;
    if (e.t < 1) {
      const k = e.t;
      const ease = 1 + 2.2 * (k - 1) ** 3 + 1.2 * (k - 1) ** 2; // ease-out-back
      p = _v2.copy(e.from).lerp(e.pos, Math.min(1.05, ease));
    }
    _q.copy(e.quat);
    if (e.wiggle) {
      _v.copy(e.pos).normalize();
      _qw.setFromAxisAngle(_v, Math.sin(time * 11 + e.phase) * 0.22);
      _q.premultiply(_qw);
    }
    _s.setScalar(o.scale);
    _m.compose(p, _q, _s);
    const c = o.spec.center;
    _off.makeTranslation(-c.x, -c.y, -c.z);
    _m.multiply(_off);
    e.st.mesh.setMatrixAt(e.idx, _m);
    e.st.dirty = true;
  }

  removeStuck(e) {
    const st = e.st;
    const last = st.entries.pop();
    if (last !== e) {
      st.entries[e.idx] = last;
      last.idx = e.idx;
      st.mesh.getMatrixAt(st.entries.length, _m);
      st.mesh.setMatrixAt(e.idx, _m);
      if (st.hasTint) {
        st.mesh.getColorAt(st.entries.length, _c);
        st.mesh.setColorAt(e.idx, _c);
        st.mesh.instanceColor.needsUpdate = true;
      }
    }
    st.mesh.count = st.entries.length;
    st.dirty = true;
    const vl = this.visible.pop();
    if (vl !== e) {
      this.visible[e.vi] = vl;
      vl.vi = e.vi;
    }
    e.idx = -1;
  }

  cleanup() {
    // things that have become small next to the ball switch to their far-away stand-ins, then to
    // their coarse ones (lodDist, lodK and coarseK come from the camera, see main.js updateView)
    for (const st of this.stuckTypes.values()) {
      const sp = st.spec;
      let level = 0;
      if (sp.maxDim * this.coarseK < this.lodDist) {
        wantCoarse(sp);
        if (sp.coarse) level = 2;
      }
      if (!level && sp.lod && sp.maxDim * this.lodK < this.lodDist) level = 1;
      if (level !== st.level) {
        st.level = level;
        st.mesh.geometry = levelGeometry(sp, level);
      }
    }
    // items keep riding on the surface; only drop what has become a speck next to the ball
    const speck = this.S * 0.012;
    for (let i = this.visible.length - 1; i >= 0; i--) {
      const e = this.visible[i];
      if (e.t < 1) continue;
      if (e.o.radius < speck) {
        this.removeStuck(e);
        this.buried++;
      }
    }
    if (this.visible.length > STUCK.max) {
      const sorted = [...this.visible].sort((a, b) => a.o.radius - b.o.radius || a.born - b.born);
      const n = this.visible.length - STUCK.max;
      for (let i = 0; i < n; i++) {
        this.removeStuck(sorted[i]);
        this.buried++;
      }
    }
  }

  knockOff(n, now, events) {
    if (!this.visible.length) return;
    // shake loose some of the smaller things (never the prize pieces), losing at most ~4 % of the size
    const small = this.visible.filter(e => e.t >= 1 && e.o.size < this.S * 0.3);
    for (let i = small.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [small[i], small[j]] = [small[j], small[i]];
    }
    const budget = ((1.04 ** GROW.P) - 1) * this.Sp;
    let spent = 0;
    const recent = [];
    for (const e of small) {
      if (recent.length >= n) break;
      const g = e.o.growth || 0;
      if (spent + g > budget && recent.length) break;
      spent += g;
      recent.push(e);
    }
    if (!recent.length) return;
    this.group.updateMatrixWorld(true);
    const lost = [];
    for (const e of recent) {
      const o = e.o;
      _v.copy(e.pos).applyMatrix4(this.root.matrixWorld);
      const out = _v2.copy(_v).sub(this.group.position).setY(0).normalize();
      const sc = Math.sqrt(Math.max(0.05, this.S));
      const vel = new THREE.Vector3(
        out.x * (1.5 + Math.random() * 2) * sc,
        (2.5 + Math.random() * 2.5) * sc,
        out.z * (1.5 + Math.random() * 2) * sc
      );
      this.removeStuck(e);
      o.yaw = Math.random() * Math.PI * 2;
      this.world.throwObject(o, _v, vel, new THREE.Vector3(Math.random() - 0.5, 0, Math.random() - 0.5), now);
      if (o.mover) {
        o.mover.home = null;
        o.mover.flee = 0;
      }
      const g = o.growth || 0;
      const fromPending = Math.min(this.pending, g);
      this.pending -= fromPending;
      this.Sp = Math.max(this.S0 ** GROW.P, this.Sp - (g - fromPending));
      this.stats.lost++;
      lost.push(o);
    }
    this.S = this.Sp ** (1 / GROW.P);
    events.push({ type: 'knock', count: lost.length, lost });
  }

  /** results screen: show the ball only in its portrait (layer 1), not in the main view */
  portraitOnly(on) {
    this.root.traverse(o => {
      if (!o.isMesh) return;
      if (on) o.layers.set(1);
      else {
        o.layers.set(0);
        o.layers.enable(1);
      }
    });
  }

  // ---- visuals -------------------------------------------------------------------------

  updateVisual(dt, time = performance.now() / 1000) {
    const rc = this.rCore;
    const sq = this.squash;
    this.group.position.set(this.pos.x, this.centerY * (1 - sq), this.pos.z);
    this.group.scale.set(1 + sq * 0.7, 1 - sq, 1 + sq * 0.7);
    this.root.quaternion.copy(this.q);
    this.core.scale.setScalar(rc);
    for (let i = 0; i < this.visible.length; i++) {
      const e = this.visible[i];
      if (e.t < 1) {
        e.t = Math.min(1, e.t + dt / 0.16);
        this.writeStuck(e, time);
      } else if (e.moved || (e.wiggle && e.o.radius > this.r * 0.08)) {
        // (people and animals too small to see among the clutter stop wriggling)
        this.writeStuck(e, time);
      }
      e.moved = false;
    }
    for (const st of this.stuckTypes.values()) {
      if (st.dirty) {
        st.mesh.instanceMatrix.needsUpdate = true;
        st.dirty = false;
      }
    }
  }
}
