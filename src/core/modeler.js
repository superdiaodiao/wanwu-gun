// Procedural low-poly modeler. A Model accumulates transformed primitives into one flat-shaded,
// vertex-coloured BufferGeometry (one draw call per object type, instanced across the world).
//
// Conventions (every catalog model follows them):
//   * units are metres, +Y is up, the model stands on y = 0 (build() lifts it if needed)
//   * the model is centred on x = z = 0 and its FRONT faces +Z (faces, headlights, shop fronts)
//   * positions passed to primitives are the CENTRE of that primitive
//   * angles are radians; D = Math.PI / 180, so 30 * D is thirty degrees
//
// Example:
//   const m = new Model(seed);
//   m.box(0.4, 0.3, 0.2, 0xff8800, 0, 0.15, 0);        // body, centre at y = 0.15
//   m.sym(s => m.sphere(0.02, 0x000000, s * 0.08, 0.25, 0.1)); // two eyes, mirrored on x
//   m.push(0, 0.3, 0, 0, 45 * D, 0).box(...).pop();    // transform stack for sub-assemblies
//   m.tint().box(...).tint(0);                          // parts recoloured per instance (cars, clothes)
//   m.glow().sphere(...).glow(0);                       // parts that light up at dusk (lanterns, windows)
//   const geometry = m.build();
import * as THREE from 'three';
import { getUV, WHITE } from './atlas.js';
import { RNG } from './rng.js';

export const D = Math.PI / 180;

const _m = new THREE.Matrix4();
const _local = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _v = new THREE.Vector3();
const _n = new THREE.Vector3();
const _nm = new THREE.Matrix3();
const _c = new THREE.Color();

// ---- colour helpers (operate on sRGB hex ints, e.g. 0xff8800) -------------------------------

/** Multiply an sRGB hex colour's brightness by k (k < 1 darker, k > 1 lighter). */
export function shade(hex, k) {
  const r = Math.max(0, Math.min(255, Math.round(((hex >> 16) & 255) * k)));
  const g = Math.max(0, Math.min(255, Math.round(((hex >> 8) & 255) * k)));
  const b = Math.max(0, Math.min(255, Math.round((hex & 255) * k)));
  return (r << 16) | (g << 8) | b;
}

/** Blend two sRGB hex colours. */
export function mix(a, b, t) {
  const ch = (x, s) => (x >> s) & 255;
  const r = Math.round(ch(a, 16) + (ch(b, 16) - ch(a, 16)) * t);
  const g = Math.round(ch(a, 8) + (ch(b, 8) - ch(a, 8)) * t);
  const bl = Math.round(ch(a, 0) + (ch(b, 0) - ch(a, 0)) * t);
  return (r << 16) | (g << 8) | bl;
}

// ---- primitive cache (unit-sized, non-indexed) ----------------------------------------------

const cache = new Map();
function prim(key, make) {
  let g = cache.get(key);
  if (!g) {
    g = make();
    if (g.index) g = g.toNonIndexed();
    if (!g.attributes.normal) g.computeVertexNormals();
    cache.set(key, g);
  }
  return g;
}

function unitPrism(kind) {
  return prim('prism:' + kind, () => {
    const pts = kind === 'wedge'
      ? [[-0.5, -0.5], [0.5, -0.5], [-0.5, 0.5]]
      : [[-0.5, -0.5], [0.5, -0.5], [0, 0.5]];
    const shape = new THREE.Shape(pts.map(p => new THREE.Vector2(p[0], p[1])));
    const g = new THREE.ExtrudeGeometry(shape, { depth: 1, bevelEnabled: false });
    g.translate(0, 0, -0.5);
    return g;
  });
}

// geometries with a lighter equivalent for LOD builds (e.g. a finer icosphere → a coarser one);
// coarse builds take the lighter one's lighter one, then its coarse swap if it has one
const LOD_SWAP = new Map();
export function lodSwap(g, lighter) { LOD_SWAP.set(g, lighter); }
const COARSE_SWAP = new Map();
export function coarseSwap(g, lighter) { COARSE_SWAP.set(g, lighter); }

// bounding-box size of each (cached, unit) primitive geometry
const boxSize = new WeakMap();
function sizeOf(g) {
  let s = boxSize.get(g);
  if (!s) {
    g.computeBoundingBox();
    s = new THREE.Vector3();
    g.boundingBox.getSize(s);
    boxSize.set(g, s);
  }
  return s;
}
const _ext = [0, 0, 0];

export class Model {
  /**
   * lod: build a lighter stand-in for far away — { minPart, replay } drops parts that would shrink
   * below a pixel or two at the distance it is used from (tiny blobs, thin short bars) and halves the
   * segment counts of round things. Colour functions draw random numbers per vertex, so fewer
   * vertices would shift everything built after them: `replay` (the full build's `draws`) puts the
   * random stream back where the full build had it after every part, so colours and layout match.
   * `coarse` (for things down to a few pixels): round things get a third of their segments and
   * spheres the next coarser stand-in again.
   */
  constructor(seed = 1, lod = null) {
    this.P = []; this.N = []; this.C = []; this.U = []; this.G = []; this.T = [];
    this.stack = [new THREE.Matrix4()];
    this._glow = 0;
    this._tint = 0;
    this._jitter = 0;
    this.rng = new RNG(seed);
    this.tris = 0;
    this.minPart = lod ? lod.minPart : 0;
    this.coarse = !!(lod && lod.coarse);
    this.replay = lod ? lod.replay : null;
    this.draws = []; // random numbers drawn inside each geo() call
    this._decal = false;
  }

  /** segment count for round primitives (halved in a LOD build, a third in a coarse one) */
  seg(n, min = 4) {
    if (!this.minPart) return n;
    return this.coarse ? Math.max(Math.min(min, 4), Math.ceil(n / 3)) : Math.max(min, Math.ceil(n / 2));
  }

  /** in a LOD build: is this part (unit geometry g under matrix m) too small to keep? */
  tooSmall(g, m) {
    const s = sizeOf(g), e = m.elements;
    _ext[0] = Math.hypot(e[0], e[1], e[2]) * s.x;
    _ext[1] = Math.hypot(e[4], e[5], e[6]) * s.y;
    _ext[2] = Math.hypot(e[8], e[9], e[10]) * s.z;
    _ext.sort((a, b) => b - a);
    const mp = this.minPart, big = _ext[0], mid = _ext[1];
    if (this._decal) return mid < mp * 2; // lettering is unreadable long before it vanishes
    return big < mp || (mid < mp * 0.5 && big < mp * 2.5);
  }

  get matrix() { return this.stack[this.stack.length - 1]; }

  // ---- state ------------------------------------------------------------------------------

  /** Push a transform (translate, rotate XYZ, uniform or [sx,sy,sz] scale) onto the stack. */
  push(x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, s = 1) {
    const sc = Array.isArray(s) ? s : [s, s, s];
    _local.compose(_p.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz)), _s.set(sc[0], sc[1], sc[2]));
    this.stack.push(this.matrix.clone().multiply(_local));
    return this;
  }
  pop() { if (this.stack.length > 1) this.stack.pop(); return this; }
  /** Following parts emit light at dusk (0..1). Call glow(0) to stop. */
  glow(v = 1) { this._glow = v; return this; }
  /** Following parts take the per-instance tint colour (paint them white/light). tint(0) stops. */
  tint(v = 1) { this._tint = v; return this; }
  /** Random brightness variation per following part (e.g. 0.08). */
  jitter(v = 0.06) { this._jitter = v; return this; }
  /** Run fn(+1) and fn(-1): build mirrored pairs with x * s. */
  sym(fn) { fn(1); fn(-1); return this; }

  // ---- low level ---------------------------------------------------------------------------

  /**
   * Append any THREE.BufferGeometry, transformed by local TRS then the stack.
   * col: hex, css string, THREE.Color, or a function (x, y, z, nx, ny, nz) => colour evaluated
   * per vertex in model space (height gradients, snow caps…).
   * uvRect: optional atlas rectangle (from getUV) to map the geometry's own 0..1 uvs into.
   */
  geo(g, col, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1, uvRect = null) {
    const rng = this.rng, a0 = rng.a, c0 = rng.calls;
    this.addGeo(g, col, x, y, z, rx, ry, rz, sx, sy, sz, uvRect);
    if (this.replay) rng.seek(a0, this.replay[this.draws.length] || 0);
    this.draws.push(rng.calls - c0);
    return this;
  }

  addGeo(g, col, x, y, z, rx, ry, rz, sx, sy, sz, uvRect) {
    if (this.minPart && LOD_SWAP.has(g)) g = LOD_SWAP.get(g);
    if (this.coarse) {
      if (LOD_SWAP.has(g)) g = LOD_SWAP.get(g);
      if (COARSE_SWAP.has(g)) g = COARSE_SWAP.get(g);
    }
    if (g.index) g = g.toNonIndexed();
    _local.compose(_p.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz)), _s.set(sx, sy, sz));
    _m.multiplyMatrices(this.matrix, _local);
    _nm.getNormalMatrix(_m);
    const flip = _m.determinant() < 0;
    const pos = g.attributes.position;
    const nor = g.attributes.normal;
    const uv = g.attributes.uv;
    const n = pos.count - (pos.count % 3);
    const isFn = typeof col === 'function';
    let cr = 1, cg = 1, cb = 1;
    if (!isFn) {
      _c.set(col);
      cr = _c.r; cg = _c.g; cb = _c.b;
      if (this._jitter) {
        const k = 1 + (this.rng.r() * 2 - 1) * this._jitter;
        cr *= k; cg *= k; cb *= k;
      }
    }
    if (this.minPart && this.tooSmall(g, _m)) return this;
    const white = WHITE();
    for (let t = 0; t < n; t += 3) {
      for (let k = 0; k < 3; k++) {
        const i = t + (flip ? (k === 0 ? 0 : 3 - k) : k);
        _v.fromBufferAttribute(pos, i).applyMatrix4(_m);
        this.P.push(_v.x, _v.y, _v.z);
        if (nor) _n.fromBufferAttribute(nor, i).applyMatrix3(_nm).normalize();
        else _n.set(0, 1, 0);
        this.N.push(_n.x, _n.y, _n.z);
        if (isFn) {
          _c.set(col(_v.x, _v.y, _v.z, _n.x, _n.y, _n.z));
          this.C.push(_c.r, _c.g, _c.b);
        } else {
          this.C.push(cr, cg, cb);
        }
        if (uvRect && uv) {
          this.U.push(uvRect[0] + (uvRect[2] - uvRect[0]) * uv.getX(i), uvRect[1] + (uvRect[3] - uvRect[1]) * uv.getY(i));
        } else {
          this.U.push(white[0], white[1]);
        }
        this.G.push(this._glow);
        this.T.push(this._tint);
      }
    }
    this.tris += n / 3;
    return this;
  }

  // ---- primitives (position = centre) -------------------------------------------------------

  box(w, h, d, col, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
    return this.geo(prim('box', () => new THREE.BoxGeometry(1, 1, 1)), col, x, y, z, rx, ry, rz, w, h, d);
  }

  /** Box with rounded edges (toy look). More triangles: use for hero objects only. */
  rbox(w, h, d, radius, col, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
    if (this.minPart) return this.box(w, h, d, col, x, y, z, rx, ry, rz);
    const r = Math.min(radius, w / 2, h / 2, d / 2) * 0.999;
    const key = `rbox:${w.toFixed(4)}:${h.toFixed(4)}:${d.toFixed(4)}:${r.toFixed(4)}`;
    const g = prim(key, () => roundedBox(w, h, d, r));
    return this.geo(g, col, x, y, z, rx, ry, rz);
  }

  /** Cylinder / truncated cone along local Y. */
  cyl(rTop, rBot, h, col, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, seg = 8) {
    seg = this.seg(seg);
    const R = Math.max(rTop, rBot, 1e-6);
    const a = (rTop / R).toFixed(3), b = (rBot / R).toFixed(3);
    const g = prim(`cyl:${seg}:${a}:${b}`, () => new THREE.CylinderGeometry(+a, +b, 1, seg, 1, false));
    return this.geo(g, col, x, y, z, rx, ry, rz, R, h, R);
  }

  /** Open tube wall (no caps), e.g. cups seen from above, pipes. */
  pipe(r, h, col, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, seg = 10) {
    seg = this.seg(seg);
    const g = prim(`pipe:${seg}`, () => {
      const outer = new THREE.CylinderGeometry(1, 1, 1, seg, 1, true);
      const inner = new THREE.CylinderGeometry(1, 1, 1, seg, 1, true).scale(-1, 1, 1);
      return mergeTwo(outer, inner);
    });
    return this.geo(g, col, x, y, z, rx, ry, rz, r, h, r);
  }

  cone(r, h, col, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, seg = 8) {
    seg = this.seg(seg);
    const g = prim(`cone:${seg}`, () => new THREE.CylinderGeometry(0, 1, 1, seg, 1, false));
    return this.geo(g, col, x, y, z, rx, ry, rz, r, h, r);
  }

  /** Sphere of radius r, optionally stretched (sx, sy, sz) and rotated. */
  sphere(r, col, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1, rx = 0, ry = 0, rz = 0, seg = 8) {
    seg = this.seg(seg, 5);
    const rings = Math.max(3, Math.round(seg * 0.75));
    const g = prim(`sph:${seg}:${rings}`, () => new THREE.SphereGeometry(1, seg, rings));
    return this.geo(g, col, x, y, z, rx, ry, rz, r * sx, r * sy, r * sz);
  }

  /** Ellipsoid by radii. */
  ellipsoid(ax, ay, az, col, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, seg = 8) {
    return this.sphere(1, col, x, y, z, ax, ay, az, rx, ry, rz, seg);
  }

  /** Upper half sphere (flat side down at the given centre y). */
  dome(r, col, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1, rx = 0, ry = 0, rz = 0, seg = 8) {
    seg = this.seg(seg, 5);
    const rings = Math.max(2, Math.round(seg * 0.4));
    const g = prim(`dome:${seg}:${rings}`, () => new THREE.SphereGeometry(1, seg, rings, 0, Math.PI * 2, 0, Math.PI / 2));
    return this.geo(g, col, x, y, z, rx, ry, rz, r * sx, r * sy, r * sz);
  }

  /** Capsule along local Y; total height = len + 2r. */
  capsule(r, len, col, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, seg = 8) {
    seg = this.seg(seg);
    const caps = this.minPart ? 1 : 2;
    const key = `cap:${seg}:${caps}:${(len / r).toFixed(3)}`;
    const g = prim(key, () => new THREE.CapsuleGeometry(1, len / r, caps, seg));
    return this.geo(g, col, x, y, z, rx, ry, rz, r, r, r);
  }

  /** Torus: ring radius R, tube radius t; lies in the local XY plane (rotate x by 90° to lay flat). */
  torus(R, t, col, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, arc = Math.PI * 2, radSeg = 6, tubSeg = 14) {
    radSeg = this.seg(radSeg, 3);
    tubSeg = this.seg(tubSeg, 6);
    const key = `tor:${(t / R).toFixed(3)}:${arc.toFixed(3)}:${radSeg}:${tubSeg}`;
    const g = prim(key, () => new THREE.TorusGeometry(1, t / R, radSeg, tubSeg, arc));
    return this.geo(g, col, x, y, z, rx, ry, rz, R, R, R);
  }

  /** Lathe: profile [[radius, y], ...] from bottom to top, revolved around local Y. */
  lathe(profile, col, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, seg = 10) {
    seg = this.seg(seg, 5);
    const g = new THREE.LatheGeometry(profile.map(p => new THREE.Vector2(Math.max(0, p[0]), p[1])), seg);
    return this.geo(g, col, x, y, z, rx, ry, rz);
  }

  /** Extrude a 2D polygon [[x, y], ...] (in local XY) by depth along Z, centred on z. */
  extrude(points, depth, col, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, bevel = 0) {
    const shape = new THREE.Shape(points.map(p => new THREE.Vector2(p[0], p[1])));
    const g = new THREE.ExtrudeGeometry(shape, {
      depth: Math.max(1e-4, depth - bevel * 2),
      bevelEnabled: bevel > 0,
      bevelSize: bevel,
      bevelThickness: bevel,
      bevelSegments: 1,
      curveSegments: 6,
    });
    g.translate(0, 0, -depth / 2 + bevel);
    return this.geo(g, col, x, y, z, rx, ry, rz);
  }

  /** Smooth tube through 3D points [[x,y,z], ...] (handles, tails, hoses, strings). */
  tube(points, r, col, seg = 6, closed = false, tubular = 0) {
    seg = this.seg(seg, 3);
    if (this.minPart) tubular = Math.max(2, Math.ceil((tubular || Math.max(4, points.length * 4)) / 2));
    const curve = new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(p[0], p[1], p[2])), closed);
    const g = new THREE.TubeGeometry(curve, tubular || Math.max(4, points.length * 4), r, seg, closed);
    return this.geo(g, col);
  }

  /** Triangular prism (gable roof): base w on the bottom, apex on top, length d along Z. */
  prism(w, h, d, col, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
    return this.geo(unitPrism('gable'), col, x, y, z, rx, ry, rz, w, h, d);
  }

  /** Right-angle wedge (ramp / windscreen): vertical side at -x, slope rising towards -x. */
  wedge(w, h, d, col, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
    return this.geo(unitPrism('wedge'), col, x, y, z, rx, ry, rz, w, h, d);
  }

  /** Flat double-sided rectangle facing ±Z (leaves, flags, paper, cloth). */
  plane(w, h, col, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
    const g = prim('plane2', () => {
      const a = new THREE.PlaneGeometry(1, 1);
      const b = new THREE.PlaneGeometry(1, 1).rotateY(Math.PI);
      return mergeTwo(a, b);
    });
    return this.geo(g, col, x, y, z, rx, ry, rz, w, h, 1);
  }

  /** Flat disc (double-sided) facing ±Y — puddles, plates, lily pads. */
  disc(r, col, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, seg = 12) {
    seg = this.seg(seg, 5);
    const g = prim(`disc:${seg}`, () => {
      const a = new THREE.CircleGeometry(1, seg).rotateX(-Math.PI / 2);
      const b = new THREE.CircleGeometry(1, seg).rotateX(Math.PI / 2);
      return mergeTwo(a, b);
    });
    return this.geo(g, col, x, y, z, rx, ry, rz, r, 1, r);
  }

  /**
   * Textured quad showing an atlas decal, facing +Z (front side only unless double = true).
   * Place it ~1–2 mm in front of the surface it sits on. col multiplies the picture (usually white).
   */
  decal(w, h, key, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, col = 0xffffff, double = false) {
    const uvr = getUV(key);
    this._decal = true;
    this.geo(prim('quad', () => new THREE.PlaneGeometry(1, 1)), col, x, y, z, rx, ry, rz, w, h, 1, uvr);
    if (double) this.geo(prim('quadback', () => new THREE.PlaneGeometry(1, 1).rotateY(Math.PI)), col, x, y, z, rx, ry, rz, w, h, 1, uvr);
    this._decal = false;
    return this;
  }

  /**
   * Box whose faces show atlas decals: faces = { px, nx, py, ny, pz, nz } → decal key.
   * Faces without a key use col.
   */
  tbox(w, h, d, col, faces, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
    const g = prim('box', () => new THREE.BoxGeometry(1, 1, 1));
    // BoxGeometry groups: 0 +x, 1 -x, 2 +y, 3 -y, 4 +z, 5 -z (6 vertices each once non-indexed)
    const names = ['px', 'nx', 'py', 'ny', 'pz', 'nz'];
    for (let f = 0; f < 6; f++) {
      const sub = sliceTris(g, f * 6, 6);
      const key = faces && faces[names[f]];
      this.geo(sub, key ? 0xffffff : col, x, y, z, rx, ry, rz, w, h, d, key ? getUV(key) : null);
    }
    return this;
  }

  // ---- output ------------------------------------------------------------------------------

  /**
   * Finish: one BufferGeometry (position, normal, color, uv, aGlow, aTint).
   * By default the result is lifted so its lowest point sits on y = 0; pass { lift: false } to keep
   * the modelled origin (used for animated body parts whose origin is a joint pivot).
   */
  build({ lift = true } = {}) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.P, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.N, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.C, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.U, 2));
    g.setAttribute('aGlow', new THREE.Float32BufferAttribute(this.G, 1));
    g.setAttribute('aTint', new THREE.Float32BufferAttribute(this.T, 1));
    g.computeBoundingBox();
    const minY = g.boundingBox.min.y;
    if (lift && this.P.length && Math.abs(minY) > 1e-5) {
      g.translate(0, -minY, 0);
      g.userData.liftedBy = -minY;
      g.computeBoundingBox();
    }
    g.computeBoundingSphere();
    g.userData.tris = this.tris;
    g.userData.tinted = this.T.some(v => v > 0);
    g.userData.glows = this.G.some(v => v > 0);
    return g;
  }
}

// ---- helpers ---------------------------------------------------------------------------------

function mergeTwo(a, b) {
  const A = a.index ? a.toNonIndexed() : a;
  const B = b.index ? b.toNonIndexed() : b;
  const out = new THREE.BufferGeometry();
  for (const name of ['position', 'normal', 'uv']) {
    const x = A.attributes[name], y = B.attributes[name];
    if (!x || !y) continue;
    const arr = new Float32Array(x.array.length + y.array.length);
    arr.set(x.array, 0);
    arr.set(y.array, x.array.length);
    out.setAttribute(name, new THREE.BufferAttribute(arr, x.itemSize));
  }
  return out;
}

function sliceTris(g, start, count) {
  const out = new THREE.BufferGeometry();
  for (const name of ['position', 'normal', 'uv']) {
    const a = g.attributes[name];
    out.setAttribute(name, new THREE.BufferAttribute(a.array.slice(start * a.itemSize, (start + count) * a.itemSize), a.itemSize));
  }
  return out;
}

// Rounded box built from a subdivided box whose vertices are pushed onto rounded corners.
function roundedBox(w, h, d, r) {
  const seg = 3;
  const g = new THREE.BoxGeometry(w, h, d, seg, seg, seg);
  const pos = g.attributes.position;
  const hw = w / 2 - r, hh = h / 2 - r, hd = d / 2 - r;
  const v = new THREE.Vector3(), c = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    c.set(Math.max(-hw, Math.min(hw, v.x)), Math.max(-hh, Math.min(hh, v.y)), Math.max(-hd, Math.min(hd, v.z)));
    v.sub(c);
    if (v.lengthSq() > 1e-12) v.setLength(r);
    v.add(c);
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}
