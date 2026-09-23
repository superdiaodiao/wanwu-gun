// World objects: instanced meshes per catalog type, a spatial grid for contact queries, swap-remove
// when the ball takes something, and knocked-off items flying back into the world.
//
// Every instance is culled on its own each frame and the survivors packed into their type's GPU
// buffers: each type has a draw distance proportional to its size (a 5 cm dumpling is not drawn
// 300 m away) and a lighter stand-in model for far away; the shadow pass only gets what is near the
// ball, whose surroundings the sun's shadow frustum hugs.
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

const _ct2 = {};
const _frustum = new THREE.Frustum();
const _pv = new THREE.Matrix4();
const _planes = new Float32Array(24);

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
    this.parts = null;
    if (sp.hits) {
      // several boxes (pillars and a beam, so a small ball can roll through a gate); the object's
      // own box becomes their union, used by the grid and the camera
      this.parts = sp.hits.map(p => ({ ox: (p.ox || 0) * scale, oz: (p.oz || 0) * scale, hw: p.hw * scale, hd: p.hd * scale, y0: (p.y0 || 0) * scale, h: p.h * scale }));
      let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity, top = 0;
      for (const p of this.parts) {
        x0 = Math.min(x0, p.ox - p.hw);
        x1 = Math.max(x1, p.ox + p.hw);
        z0 = Math.min(z0, p.oz - p.hd);
        z1 = Math.max(z1, p.oz + p.hd);
        top = Math.max(top, p.y0 + p.h);
      }
      this.ox = (x0 + x1) / 2;
      this.oz = (z0 + z1) / 2;
      this.hw = (x1 - x0) / 2;
      this.hd = (z1 - z0) / 2;
      this.h = top;
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

// Instanced meshes for the shadow pass live on this layer only: the sun's shadow camera renders
// it, the main camera doesn't (see Packed).
export const SHADOW_LAYER = 2;

function instMesh(world, t, geometry, cap, name, color) {
  const mesh = new THREE.InstancedMesh(geometry, world.material, cap);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  if (color) {
    mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3).fill(1), 3);
    mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
  }
  mesh.count = 0;
  mesh.frustumCulled = false; // culled per instance in pack()
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  mesh.name = name;
  mesh.visible = false;
  world.scene.add(mesh);
  return mesh;
}

/**
 * All instances of one type. Matrices live in a CPU-side array; every frame the instances near
 * enough and in view are packed into the GPU buffers — near ones into the full model's, far ones
 * into the far-away stand-in's — and only those are drawn. A third mesh, seen only by the shadow
 * camera, gets the ones close to the ball.
 */
class Packed {
  constructor(world, type, cap) {
    this.world = world;
    this.type = type;
    this.objs = [];
    this.cap = Math.max(4, cap);
    this.mats = new Float32Array(this.cap * 16);
    this.cols = type.hasTint ? new Float32Array(this.cap * 3).fill(1) : null;
    this.sph = new Float32Array(this.cap * 4); // bounding sphere per instance: x, y, z, r
    this.dirty = true; // something moved, came or went since the last pack
    this.lastF = new Int32Array(this.cap).fill(-1);
    this.lastL = new Int32Array(this.cap).fill(-1);
    this.makeMeshes(this.cap);
  }

  makeMeshes(cap) {
    const t = this.type, id = t.spec.id;
    this.mesh = instMesh(this.world, t, t.spec.geometry, cap, id, t.hasTint);
    this.lod = t.spec.lod ? instMesh(this.world, t, t.spec.lod, cap, id + ':lod', t.hasTint) : null;
    this.shadow = null; // made on first use
    // per-instance highlight (see objectMaterial): lives on the geometry, which only these two
    // meshes draw with the highlight material
    const hi = g => {
      const a = new THREE.InstancedBufferAttribute(new Float32Array(cap), 1);
      a.setUsage(THREE.DynamicDrawUsage);
      g.setAttribute('iHi', a);
      return a;
    };
    this.hiF = hi(t.spec.geometry);
    this.hiL = t.spec.lod ? hi(t.spec.lod) : null;
  }

  shadowMesh() {
    if (!this.shadow) {
      const t = this.type;
      const m = (this.shadow = instMesh(this.world, t, t.spec.geometry, this.cap, t.spec.id + ':shadow', false));
      m.castShadow = true;
      m.layers.set(SHADOW_LAYER);
    }
    return this.shadow;
  }

  grow() {
    const old = [this.mesh, this.lod, this.shadow];
    this.cap *= 2;
    const grow = (arr, n, fill = 0) => {
      const out = new arr.constructor(this.cap * n).fill(fill);
      out.set(arr);
      return out;
    };
    this.mats = grow(this.mats, 16);
    if (this.cols) this.cols = grow(this.cols, 3, 1);
    this.sph = grow(this.sph, 4);
    this.lastF = new Int32Array(this.cap).fill(-1);
    this.lastL = new Int32Array(this.cap).fill(-1);
    this.makeMeshes(this.cap);
    for (const m of old) {
      if (!m) continue;
      this.world.scene.remove(m);
      m.dispose();
    }
    this.dirty = true;
  }

  add(o) {
    if (this.objs.length >= this.cap) this.grow();
    o.idx = this.objs.length;
    o.cont = this;
    this.objs.push(o);
    if (this.cols) {
      _c.setHex(o.tint != null ? o.tint : 0xffffff);
      const j = o.idx * 3;
      this.cols[j] = _c.r;
      this.cols[j + 1] = _c.g;
      this.cols[j + 2] = _c.b;
    }
    this.dirty = true;
  }

  remove(o) {
    const i = o.idx;
    const last = this.objs.pop();
    if (last !== o) {
      const n = this.objs.length;
      this.objs[i] = last;
      last.idx = i;
      this.mats.copyWithin(i * 16, n * 16, n * 16 + 16);
      this.sph.copyWithin(i * 4, n * 4, n * 4 + 4);
      if (this.cols) this.cols.copyWithin(i * 3, n * 3, n * 3 + 3);
    }
    o.idx = -1;
    o.cont = null;
    this.dirty = true;
  }

  clear() {
    this.objs.length = 0;
    this.dirty = true;
  }

  setMatrix(o, m) {
    m.toArray(this.mats, o.idx * 16);
    const t = this.type, j = o.idx * 4;
    // generous: pitch, roll and spin can swing parts beyond the upright bounding sphere
    const r = t.vr0 * o.scale * (o.mover || o.state === 2 ? 1.5 : 1.05);
    this.sph[j] = o.x;
    this.sph[j + 1] = o.y + o.bob + t.vcy0 * o.scale;
    this.sph[j + 2] = o.z;
    this.sph[j + 3] = r;
    this.dirty = true;
  }

  /**
   * Pack what is worth drawing this frame: within maxDist of the camera and inside the view planes
   * (stand-in beyond lodDist); and, for the shadow pass, whatever lies within shadowR of `focus`.
   * The GPU buffers are only rewritten when the packed set or any matrix changed.
   */
  pack(cam, planes, maxDist, lodDist, focus, shadowR, hi) {
    const objs = this.objs, t = this.type, n = objs.length;
    const sph = this.sph, lod = this.lod;
    const far = lod ? lodDist : Infinity;
    const cx = cam.x, cy = cam.y, cz = cam.z;
    const lastF = this.lastF, lastL = this.lastL;
    let nf = 0, nl = 0, changed = this.dirty;
    const shadows = shadowR > 0 && t.castShadow && t.visible;
    const sd = shadows ? this.shadowMesh().instanceMatrix.array : null, src = this.mats;
    const fx = focus.x, fz = focus.z;
    let ns = 0;
    if (t.visible) {
      for (let i = 0; i < n; i++) {
        const j = i * 4;
        const x = sph[j], y = sph[j + 1], z = sph[j + 2], r = sph[j + 3];
        if (shadows) {
          const ex = x - fx, ez = z - fz, R = shadowR + r;
          if (ex * ex + ez * ez < R * R) {
            const a = i * 16, b = ns++ * 16;
            for (let k = 0; k < 16; k++) sd[b + k] = src[a + k];
          }
        }
        const dx = x - cx, dy = y - cy, dz = z - cz;
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz) - r;
        if (d > maxDist) continue;
        let p = 0;
        for (; p < 24; p += 4) if (planes[p] * x + planes[p + 1] * y + planes[p + 2] * z + planes[p + 3] < -r) break;
        if (p < 24) continue;
        if (d > far) {
          if (lastL[nl] !== i) { lastL[nl] = i; changed = true; }
          nl++;
        } else {
          if (lastF[nf] !== i) { lastF[nf] = i; changed = true; }
          nf++;
        }
      }
    }
    if (nf !== this.mesh.count || (lod && nl !== lod.count)) changed = true;
    if (changed) {
      this.copyAll(this.mesh.instanceMatrix.array, lastF, nf);
      this.commit(this.mesh, lastF, nf);
      if (lod) {
        this.copyAll(lod.instanceMatrix.array, lastL, nl);
        this.commit(lod, lastL, nl);
      }
    }
    this.dirty = false;
    this.highlight(this.hiF, lastF, nf, hi);
    if (lod) this.highlight(this.hiL, lastL, nl, hi);
    if (this.shadow) {
      const m = this.shadow;
      m.count = ns;
      m.visible = ns > 0;
      if (ns) {
        m.instanceMatrix.clearUpdateRanges();
        m.instanceMatrix.addUpdateRange(0, ns * 16);
        m.instanceMatrix.needsUpdate = true;
      }
    }
    return nf + nl;
  }

  /**
   * Edge glow for what is drawn near the ball: gold for things it can take right now (brighter the
   * closer they are to the most it can take), red for things still just too big. hi = { limit, S, x,
   * z, t } from the ball; limit 0 turns it off.
   */
  highlight(attr, idx, count, hi) {
    const a = attr.array, objs = this.objs;
    const was = attr.lit || 0;
    let lit = 0;
    if (hi && hi.limit > 0) {
      const { limit, S, x, z, t } = hi;
      // both fade in from far enough out to steer for (or round) them: gold from 16 ball widths
      // away, red from 14; red covers what is up to twice too big, fading out by three times
      const g0 = S * 7, g1 = S * 16, r0 = S * 7, r1 = S * 14;
      for (let s = 0; s < count; s++) {
        const o = objs[idx[s]];
        const rel = o.size / limit;
        let v = 0;
        if (rel < 3 && o.state === 0) {
          const d = Math.hypot(o.x - x, o.z - z);
          if (rel <= 1) {
            if (d < g1 && rel > 0.12 && t >= o.noPickUntil) v = Math.min(1, (rel - 0.12) / 0.7) * Math.min(1, (g1 - d) / (g1 - g0));
          } else if (d < r1) {
            v = -Math.min(1, 3 - rel) * Math.min(1, (r1 - d) / (r1 - r0));
          }
        }
        if (v > -0.02 && v < 0.02) v = 0;
        a[s] = v;
        if (v) {
          lit = s + 1;
          if (v < -0.3) hi.red++;
        }
      }
    }
    // zero what was lit last frame beyond this frame's last lit slot
    for (let s = lit; s < was; s++) a[s] = 0;
    const n = Math.max(lit, was);
    attr.lit = lit;
    if (n) {
      attr.clearUpdateRanges();
      attr.addUpdateRange(0, n);
      attr.needsUpdate = true;
    }
  }

  copyAll(dst, idx, count) {
    const src = this.mats;
    for (let s = 0; s < count; s++) {
      const a = idx[s] * 16, b = s * 16;
      for (let k = 0; k < 16; k++) dst[b + k] = src[a + k];
    }
  }

  commit(mesh, idx, count) {
    mesh.count = count;
    mesh.visible = count > 0;
    if (!count) return;
    const im = mesh.instanceMatrix;
    im.clearUpdateRanges();
    im.addUpdateRange(0, count * 16);
    im.needsUpdate = true;
    const ic = mesh.instanceColor;
    if (ic) {
      const src = this.cols, dst = ic.array;
      for (let s = 0; s < count; s++) {
        const a = idx[s] * 3, b = s * 3;
        dst[b] = src[a];
        dst[b + 1] = src[a + 1];
        dst[b + 2] = src[a + 2];
      }
      ic.clearUpdateRanges();
      ic.addUpdateRange(0, count * 3);
      ic.needsUpdate = true;
    }
  }
}

class TypeRec {
  constructor(spec) {
    this.spec = spec;
    this.all = [];
    this.dyn = null; // the Packed container, made in finalize()
    this.visible = true;
    this.castShadow = true;
    this.hasTint = !!(spec.tints && spec.tints.length && spec.geometry.userData.tinted);
    // bounding sphere of the model around its origin's vertical axis (unscaled)
    const g = spec.geometry;
    if (!g.boundingSphere) g.computeBoundingSphere();
    const bs = g.boundingSphere;
    this.vr0 = Math.hypot(bs.center.x, bs.center.z) + bs.radius;
    this.vcy0 = bs.center.y;
    this.size = spec.maxDim; // largest instance's size, from finalize()
    this.dd = Infinity; // current draw distance
  }

  get count() {
    return this.dyn ? this.dyn.objs.length : 0;
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

  /** the container an object belongs in */
  containerFor(o) {
    const t = o.type;
    if (!t.dyn) t.dyn = new Packed(this, t, t.all.length + 4);
    return t.dyn;
  }

  /** Create the instanced meshes once every object is placed. */
  finalize() {
    this.material = objectMaterial(atlasTexture(), { highlight: true });
    for (const t of this.types.values()) {
      for (const o of t.all) t.size = Math.max(t.size, t.spec.maxDim * o.scale);
      t.dyn = new Packed(this, t, t.all.length + 4);
      for (const o of t.all) this.attach(o);
    }
  }

  /** put every object back where the layout placed it (new game) */
  resetAll() {
    this.grid = new SpatialGrid();
    this.flyers.length = 0;
    for (const t of this.types.values()) if (t.dyn) t.dyn.clear();
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
    o.cont.setMatrix(o, this.composeMatrix(o, _m));
  }

  /**
   * Contact between a sphere (c, r) and object o. Returns null or
   * { nx, nz, depth, low } with the horizontal push-out normal (object → ball).
   */
  contact(o, c, r, out) {
    if (o.parts) {
      // deepest contact over the parts
      let best = null, depth = -1;
      const cs = Math.cos(o.yaw), sn = Math.sin(o.yaw);
      for (const p of o.parts) {
        const cx = o.x + p.ox * cs + p.oz * sn, cz = o.z - p.ox * sn + p.oz * cs;
        const y0 = o.y + o.bob + p.y0;
        const ct = this.boxContact(cx, cz, o.yaw, p.hw, p.hd, y0, y0 + p.h, c, r, _ct2);
        if (ct && ct.depth > depth) {
          depth = ct.depth;
          best = Object.assign(out, ct);
        }
      }
      return best;
    }
    if (!o.cyl) return this.boxContact(o.centerX(), o.centerZ(), o.yaw, o.hw, o.hd, o.y + o.bob, o.y + o.bob + o.h, c, r, out);
    const cx = o.centerX(), cz = o.centerZ();
    const y0 = o.y + o.bob, y1 = y0 + o.h;
    let px, pz;
    {
      const dx = c.x - cx, dz = c.z - cz;
      const d = Math.hypot(dx, dz);
      if (d > o.cr) {
        px = cx + (dx / d) * o.cr;
        pz = cz + (dz / d) * o.cr;
      } else {
        px = c.x;
        pz = c.z;
      }
    }
    return this.finishContact(cx, cz, px, pz, y0, y1, c, r, out);
  }

  /** sphere (c, r) against a box centred at (cx, cz), turned by yaw, spanning y0..y1 */
  boxContact(cx, cz, yaw, hw, hd, y0, y1, c, r, out) {
    const cs = Math.cos(yaw), sn = Math.sin(yaw);
    const wx = c.x - cx, wz = c.z - cz;
    let lx = wx * cs - wz * sn;
    let lz = wx * sn + wz * cs;
    lx = Math.max(-hw, Math.min(hw, lx));
    lz = Math.max(-hd, Math.min(hd, lz));
    const px = cx + lx * cs + lz * sn;
    const pz = cz - lx * sn + lz * cs;
    return this.finishContact(cx, cz, px, pz, y0, y1, c, r, out);
  }

  finishContact(cx, cz, px, pz, y0, y1, c, r, out) {
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
      t.visible = t.spec.maxDim > ballDiameter / 220;
      t.castShadow = t.spec.maxDim > ballDiameter / 60;
    }
  }

  /**
   * Decide what gets drawn this frame. Each type is drawn out to `sizeK` × its size (about where it
   * shrinks to a pixel or two) or to `fogDist`, whichever is nearer, and as its stand-in beyond
   * `lodK` × its size. Chunks are switched on or off; packed things are culled one by one.
   * `focus`/`keep`: packed things this close to the ball are drawn even when off screen, so they
   * still cast their shadows into view. Returns how many packed instances were drawn.
   */
  updateVisibility(camera, fogDist, sizeK, lodK, focus, shadowR, hi = null) {
    const cam = camera.position;
    camera.updateMatrixWorld();
    _pv.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    _frustum.setFromProjectionMatrix(_pv, camera.coordinateSystem);
    for (let i = 0; i < 6; i++) {
      const pl = _frustum.planes[i];
      _planes[i * 4] = pl.normal.x;
      _planes[i * 4 + 1] = pl.normal.y;
      _planes[i * 4 + 2] = pl.normal.z;
      _planes[i * 4 + 3] = pl.constant;
    }
    let drawn = 0;
    for (const t of this.types.values()) {
      if (!t.dyn) continue;
      t.dd = Math.min(fogDist, sizeK * t.size);
      drawn += t.dyn.pack(cam, _planes, t.dd, lodK * t.size, focus, shadowR, hi);
    }
    return drawn;
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
    this.containerFor(o).add(o);
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
          // settle upright and rejoin the world
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
