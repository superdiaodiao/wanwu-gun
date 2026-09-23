// World objects: instanced meshes per catalog type, a spatial grid for contact queries, swap-remove
// when the ball takes something, and knocked-off items flying back into the world.
//
// Static instances of big types (buildings, trees, mountains…) are split into spatial chunks so the
// renderer can frustum-cull them — including in the shadow pass, whose frustum hugs the ball.
// Moving things (and anything knocked off the ball) live in one per-type "dynamic" container.
import * as THREE from 'three';
import { CATALOG } from '../catalog/registry.js';
import { buildSpec } from '../core/assets.js';
import { objectMaterial } from '../core/materials.js';
import { atlasTexture } from '../core/atlas.js';
import { SpatialGrid } from './grid.js';

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _c = new THREE.Color();
const _off = new THREE.Matrix4();
const _rot = new THREE.Matrix4();
const _tr = new THREE.Matrix4();
const Y = new THREE.Vector3(0, 1, 0);
const X = new THREE.Vector3(1, 0, 0);
const Z = new THREE.Vector3(0, 0, 1);

const CHUNK = 320; // metres
const CHUNK_MIN_SIZE = 1; // static types bigger than this (m) are chunked; small items stay in one mesh

export class WorldObject {
  constructor(type, x, y, z, yaw, scale, tint) {
    const sp = type.spec;
    this.type = type;
    this.spec = sp;
    this.x = x;
    this.y = y;
    this.z = z;
    this.yaw = yaw;
    this.scale = scale;
    this.tint = tint; // hex or null
    this.idx = -1;
    this.cont = null;
    this.state = 0; // 0 in world, 1 stuck on the ball, 2 flying, 3 gone
    this.size = sp.pickSize * scale;
    this.h = sp.dims.h * scale;
    this.hw = sp.dims.w * 0.5 * scale;
    this.hd = sp.dims.d * 0.5 * scale;
    this.ox = sp.center.x * scale; // bbox centre offset in local space
    this.oz = sp.center.z * scale;
    if (sp.hit) {
      // custom collision volume (e.g. just the pier of a viaduct, so small balls pass under the deck)
      this.hw = sp.hit.hw * scale;
      this.hd = sp.hit.hd * scale;
      this.h = sp.hit.h * scale;
      this.ox = (sp.hit.ox || 0) * scale;
      this.oz = (sp.hit.oz || 0) * scale;
    }
    this.cyl = sp.shape === 'cyl';
    this.cr = Math.max(this.hw, this.hd) * 0.92; // cylinder radius
    this.gridR = Math.hypot(this.hw + Math.abs(this.ox), this.hd + Math.abs(this.oz));
    this.radius = Math.hypot(this.gridR, this.h * 0.5);
    this.mover = null;
    this.bob = 0;
    this.pitch = 0;
    this.roll = 0;
    this.spin = 0;
    this.noPickUntil = 0;
    this.links = null;
    this.tag = null;
  }

  /** ground-plane centre of the bounding box */
  centerX() { return this.x + this.ox * Math.cos(this.yaw) + this.oz * Math.sin(this.yaw); }
  centerZ() { return this.z - this.ox * Math.sin(this.yaw) + this.oz * Math.cos(this.yaw); }
}

/** one InstancedMesh holding some of a type's instances */
class Container {
  constructor(world, type, cap, dynamic) {
    this.world = world;
    this.type = type;
    this.dynamic = dynamic;
    this.objs = [];
    this.cap = Math.max(1, cap);
    this.mesh = this.makeMesh(this.cap);
    this.dirty = false;
    this.colorDirty = false;
  }

  makeMesh(cap) {
    const t = this.type;
    const mesh = new THREE.InstancedMesh(t.spec.geometry, this.world.material, cap);
    mesh.instanceMatrix.setUsage(this.dynamic ? THREE.DynamicDrawUsage : THREE.StaticDrawUsage);
    if (t.hasTint) mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3).fill(1), 3);
    mesh.count = 0;
    mesh.frustumCulled = !this.dynamic;
    mesh.castShadow = t.castShadow;
    mesh.receiveShadow = true;
    mesh.name = t.spec.id;
    mesh.visible = t.visible;
    this.world.scene.add(mesh);
    return mesh;
  }

  grow() {
    const old = this.mesh;
    this.cap *= 2;
    this.mesh = this.makeMesh(this.cap);
    for (let i = 0; i < this.objs.length; i++) {
      old.getMatrixAt(i, _m);
      this.mesh.setMatrixAt(i, _m);
      if (this.type.hasTint) {
        old.getColorAt(i, _c);
        this.mesh.setColorAt(i, _c);
      }
    }
    this.mesh.count = this.objs.length;
    this.world.scene.remove(old);
    old.dispose();
    this.dirty = this.colorDirty = true;
  }

  add(o) {
    if (this.objs.length >= this.cap) this.grow();
    o.idx = this.objs.length;
    o.cont = this;
    this.objs.push(o);
    this.mesh.count = this.objs.length;
    if (o.tint != null) {
      this.mesh.setColorAt(o.idx, _c.setHex(o.tint));
      this.colorDirty = true;
    }
  }

  remove(o) {
    const i = o.idx;
    const last = this.objs.pop();
    if (last !== o) {
      this.objs[i] = last;
      last.idx = i;
      this.mesh.getMatrixAt(this.objs.length, _m);
      this.mesh.setMatrixAt(i, _m);
      if (this.type.hasTint) {
        this.mesh.getColorAt(this.objs.length, _c);
        this.mesh.setColorAt(i, _c);
        this.colorDirty = true;
      }
    }
    this.mesh.count = this.objs.length;
    this.dirty = true;
    o.idx = -1;
    o.cont = null;
  }

  clear() {
    this.objs.length = 0;
    this.mesh.count = 0;
  }
}

class TypeRec {
  constructor(spec) {
    this.spec = spec;
    this.all = [];
    this.chunks = new Map();
    this.dyn = null;
    this.visible = true;
    this.castShadow = true;
    this.chunked = spec.maxDim > CHUNK_MIN_SIZE;
    this.hasTint = !!(spec.tints && spec.tints.length && spec.geometry.userData.tinted);
  }

  *containers() {
    yield* this.chunks.values();
    if (this.dyn) yield this.dyn;
  }

  get count() {
    let n = 0;
    for (const c of this.containers()) n += c.objs.length;
    return n;
  }
}

export class World {
  constructor(scene) {
    this.scene = scene;
    this.types = new Map();
    this.objects = [];
    this.movers = [];
    this.flyers = [];
    this.grid = new SpatialGrid();
    this.missing = new Set();
    this.material = null;
    this.time = 0;
  }

  type(id) {
    let t = this.types.get(id);
    if (t) return t;
    const spec = CATALOG.get(id);
    if (!spec) {
      this.missing.add(id);
      return null;
    }
    try {
      buildSpec(spec);
    } catch (e) {
      console.error('[world] failed to build', id, e);
      this.missing.add(id);
      return null;
    }
    t = new TypeRec(spec);
    this.types.set(id, t);
    return t;
  }

  has(id) { return CATALOG.has(id); }

  /**
   * Place an object. opts: yaw, scale, tint (hex | index into spec.tints | random), y, mover (override
   * object, or false for static), moverState (merged into the mover), rng, tag.
   */
  add(id, x, z, opts = {}) {
    const t = this.type(id);
    if (!t) return null;
    const sp = t.spec;
    let tint = null;
    if (t.hasTint) {
      if (typeof opts.tint === 'number' && opts.tint > 0xff) tint = opts.tint;
      else if (typeof opts.tint === 'number') tint = sp.tints[opts.tint % sp.tints.length];
      else tint = sp.tints[Math.floor((opts.rng ? opts.rng.r() : Math.random()) * sp.tints.length)];
    }
    const o = new WorldObject(t, x, opts.y || 0, z, opts.yaw || 0, opts.scale || 1, tint);
    o.tag = opts.tag || null;
    o.baseY = o.y;
    const mv = opts.mover === false ? null : (opts.mover || sp.mover || null);
    if (mv) {
      o.mover = { ...mv, ...(opts.moverState || {}) };
      this.movers.push(o);
    }
    o.orig = { x: o.x, y: o.y, z: o.z, yaw: o.yaw, mover: o.mover ? JSON.parse(JSON.stringify(o.mover)) : null };
    t.all.push(o);
    this.objects.push(o);
    return o;
  }

  chunkKey(x, z) {
    return (Math.floor(x / CHUNK) + 512) * 1024 + (Math.floor(z / CHUNK) + 512);
  }

  /** the container an object belongs in right now */
  containerFor(o) {
    const t = o.type;
    if (o.mover || o.state === 2 || !t.chunked) {
      if (!t.dyn) t.dyn = new Container(this, t, t._dynCap || 4, !!o.mover || o.state === 2);
      return t.dyn;
    }
    const k = this.chunkKey(o.x, o.z);
    let c = t.chunks.get(k);
    if (!c) {
      c = new Container(this, t, (t._chunkCaps && t._chunkCaps.get(k)) || 4, false);
      t.chunks.set(k, c);
    }
    return c;
  }

  /** Create the instanced meshes once every object is placed. */
  finalize() {
    this.material = objectMaterial(atlasTexture());
    for (const t of this.types.values()) {
      // size containers to their contents up front
      t._chunkCaps = new Map();
      let loose = 0;
      let moving = false;
      for (const o of t.all) {
        if (o.mover || !t.chunked) {
          loose++;
          if (o.mover) moving = true;
        } else {
          const k = this.chunkKey(o.x, o.z);
          t._chunkCaps.set(k, (t._chunkCaps.get(k) || 0) + 1);
        }
      }
      t._dynCap = Math.max(4, loose + 4);
      // the loose container of a type that has movers must never be frustum-culled
      if (moving || t.chunked) t.dyn = new Container(this, t, t._dynCap, true);
      for (const o of t.all) this.attach(o);
    }
    this.refreshBounds();
  }

  refreshBounds() {
    for (const t of this.types.values()) {
      for (const c of t.containers()) {
        if (c.mesh.frustumCulled && c.objs.length) {
          c.mesh.boundingSphere = null;
          c.mesh.computeBoundingSphere();
        }
      }
    }
  }

  /** put every object back where the layout placed it (new game) */
  resetAll() {
    this.grid = new SpatialGrid();
    this.flyers.length = 0;
    for (const t of this.types.values()) for (const c of t.containers()) c.clear();
    for (const o of this.objects) {
      const g = o.orig;
      o.x = g.x;
      o.y = g.y;
      o.z = g.z;
      o.yaw = g.yaw;
      o.bob = o.pitch = o.roll = 0;
      o.spin = 0;
      o.fly = null;
      o.noPickUntil = 0;
      o.growth = 0;
      o.idx = -1;
      o.cont = null;
      o._gl = -1;
      o.state = 0;
      o.mover = g.mover ? JSON.parse(JSON.stringify(g.mover)) : null;
      this.attach(o);
    }
    this.refreshBounds();
  }

  /** put o into its container and the grid */
  attach(o) {
    const c = this.containerFor(o);
    c.add(o);
    this.writeMatrix(o);
    o.state = 0;
    this.grid.insert(o);
  }

  /** remove o from its mesh and the grid (it is being rolled up or thrown) */
  detach(o) {
    if (o.cont) o.cont.remove(o);
    this.grid.remove(o);
  }

  /** world matrix of an object including its animation offsets */
  composeMatrix(o, out) {
    _q.setFromAxisAngle(Y, o.yaw);
    if (o.pitch || o.roll) {
      _q2.setFromAxisAngle(X, o.pitch);
      _q.multiply(_q2);
      _q2.setFromAxisAngle(Z, o.roll);
      _q.multiply(_q2);
    }
    _p.set(o.x, o.y + o.bob, o.z);
    _s.setScalar(o.scale);
    out.compose(_p, _q, _s);
    if (o.spin) {
      // rotate around the bounding-box centre on the given local axis
      const c = o.spec.center;
      const ax = o.mover && o.mover.axis === 'x' ? X : o.mover && o.mover.axis === 'y' ? Y : Z;
      _off.makeTranslation(c.x, c.y, c.z);
      _off.multiply(_rot.makeRotationAxis(ax, o.spin));
      _off.multiply(_tr.makeTranslation(-c.x, -c.y, -c.z));
      out.multiply(_off);
    }
    return out;
  }

  writeMatrix(o) {
    if (!o.cont) return;
    o.cont.mesh.setMatrixAt(o.idx, this.composeMatrix(o, _m));
    o.cont.dirty = true;
  }

  flush() {
    for (const t of this.types.values()) {
      for (const c of t.containers()) {
        if (c.dirty) {
          c.mesh.instanceMatrix.needsUpdate = true;
          c.dirty = false;
        }
        if (c.colorDirty && c.mesh.instanceColor) {
          c.mesh.instanceColor.needsUpdate = true;
          c.colorDirty = false;
        }
      }
    }
  }

  /**
   * Contact between a sphere (c, r) and object o. Returns null or
   * { nx, nz, depth, low } with the horizontal push-out normal (object → ball).
   */
  contact(o, c, r, out) {
    const cx = o.centerX(), cz = o.centerZ();
    const y0 = o.y + o.bob, y1 = y0 + o.h;
    let px, pz;
    if (o.cyl) {
      const dx = c.x - cx, dz = c.z - cz;
      const d = Math.hypot(dx, dz);
      if (d > o.cr) {
        px = cx + (dx / d) * o.cr;
        pz = cz + (dz / d) * o.cr;
      } else {
        px = c.x;
        pz = c.z;
      }
    } else {
      const cs = Math.cos(o.yaw), sn = Math.sin(o.yaw);
      const wx = c.x - cx, wz = c.z - cz;
      let lx = wx * cs - wz * sn;
      let lz = wx * sn + wz * cs;
      lx = Math.max(-o.hw, Math.min(o.hw, lx));
      lz = Math.max(-o.hd, Math.min(o.hd, lz));
      px = cx + lx * cs + lz * sn;
      pz = cz - lx * sn + lz * cs;
    }
    const py = Math.max(y0, Math.min(y1, c.y));
    const dx = c.x - px, dy = c.y - py, dz = c.z - pz;
    const d2 = dx * dx + dy * dy + dz * dz;
    if (d2 >= r * r) return null;
    const d = Math.sqrt(d2);
    let hx = dx, hz = dz;
    let hl = Math.hypot(hx, hz);
    if (hl < 1e-6) {
      hx = c.x - cx;
      hz = c.z - cz;
      hl = Math.hypot(hx, hz) || 1;
    }
    out.nx = hx / hl;
    out.nz = hz / hl;
    out.depth = r - d;
    out.low = py < c.y - r * 0.55; // touching with the underside only (small ledge)
    out.px = px;
    out.py = py;
    out.pz = pz;
    return out;
  }

  /** hide types that became negligible next to the ball (saves GPU) */
  cullTiny(ballDiameter) {
    for (const t of this.types.values()) {
      const vis = t.spec.maxDim > ballDiameter / 220;
      const cast = t.spec.maxDim > ballDiameter / 60;
      if (vis === t.visible && cast === t.castShadow) continue;
      t.visible = vis;
      t.castShadow = cast;
      for (const c of t.containers()) {
        c.mesh.visible = vis && !c.far;
        c.mesh.castShadow = cast;
      }
    }
  }

  /** skip static chunks the fog has already swallowed */
  cullFar(cam, maxDist) {
    for (const t of this.types.values()) {
      for (const c of t.chunks.values()) {
        const bs = c.mesh.boundingSphere;
        if (!bs) continue;
        const d = Math.hypot(bs.center.x - cam.x, bs.center.y - cam.y, bs.center.z - cam.z) - bs.radius;
        c.far = d > maxDist;
        c.mesh.visible = t.visible && !c.far && c.objs.length > 0;
      }
    }
  }

  /** knocked-off items: simple ballistic flight, then they rejoin the world */
  throwObject(o, pos, vel, spinAxis, now) {
    o.x = pos.x;
    o.y = Math.max(0, pos.y - o.h * 0.5);
    o.z = pos.z;
    o.state = 2;
    o.fly = { vx: vel.x, vy: vel.y, vz: vel.z, sx: spinAxis.x, sz: spinAxis.z, t: 0 };
    o.pitch = 0;
    o.roll = 0;
    o.bob = 0;
    const c = this.containerFor(o);
    c.add(o);
    c.mesh.frustumCulled = false; // it may land outside the container's original bounds
    this.writeMatrix(o);
    this.flyers.push(o);
    o.noPickUntil = now + 1.2;
  }

  updateFlyers(dt) {
    for (let i = this.flyers.length - 1; i >= 0; i--) {
      const o = this.flyers[i];
      const f = o.fly;
      f.t += dt;
      f.vy -= 9.8 * Math.max(1, o.size * 0.5) * dt;
      o.x += f.vx * dt;
      o.y += f.vy * dt;
      o.z += f.vz * dt;
      o.pitch += f.sx * dt * 6;
      o.roll += f.sz * dt * 6;
      if (o.y <= 0) {
        o.y = 0;
        if (Math.abs(f.vy) > 1.2 * Math.sqrt(o.size + 0.05) && f.t < 3) {
          f.vy *= -0.35;
          f.vx *= 0.6;
          f.vz *= 0.6;
        } else {
          // settle upright and rejoin the world (it stays in the dynamic container)
          o.pitch = 0;
          o.roll = 0;
          o.y = o.baseY || 0;
          o.fly = null;
          o.state = 0;
          this.flyers.splice(i, 1);
          this.grid.insert(o);
          if (o.mover) {
            // landed somewhere new: amble around here instead of snapping back to a path or lane
            const k = o.mover.kind;
            if (k === 'drive' || k === 'spin' || k === 'swim') o.mover.kind = 'static';
            else if (k !== 'fly') {
              o.mover.kind = 'wander';
              o.mover.home = [o.x, o.z];
              o.mover.radius = 4;
              o.mover.target = null;
              o.mover.wait = 1 + Math.random() * 2;
            } else o.mover.home = [o.x, o.z];
            if (!this.movers.includes(o)) this.movers.push(o);
          }
        }
      }
      this.writeMatrix(o);
    }
  }
}
