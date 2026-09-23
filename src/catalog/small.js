// 小物件: the tiny and small things the ball rolls up in its first minutes (melon seeds → fans).
// Tier 0 (< 5 cm) are placed by the hundreds, so they stay around 60 triangles; tier 1 (5–30 cm)
// stay well under 400. Crisp two-colour details (seed stripes, pleats, candy bands) come from
// per-face colouring of small hand-built triangle soups instead of extra parts.
import * as THREE from 'three';
import { ConvexGeometry } from 'three/examples/jsm/geometries/ConvexGeometry.js';
import { def } from './registry.js';
import { D, shade, mix } from '../core/modeler.js';
import { decal, fitText, verticalText, FONTS } from '../core/atlas.js';

const TAU = Math.PI * 2;

// ---- local helpers: triangle soups with per-face colour --------------------------------------
// A soup is [{ a, b, c, i, j, cap }] with a/b/c = [x, y, z]; i/j tell the colour function where the
// face sits (ring band / segment around, profile edge / lathe segment, hull face index).

const sub = (u, v) => [u[0] - v[0], u[1] - v[1], u[2] - v[2]];
const cross = (u, v) => [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
const dot = (u, v) => u[0] * v[0] + u[1] * v[1] + u[2] * v[2];
const mid3 = (a, b, c) => [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3, (a[2] + b[2] + c[2]) / 3];
const avg = pts => { const c = [0, 0, 0]; for (const p of pts) { c[0] += p[0]; c[1] += p[1]; c[2] += p[2]; } return c.map(v => v / pts.length); };
const cen = t => mid3(t.a, t.b, t.c);
const nrm = t => { const n = cross(sub(t.b, t.a), sub(t.c, t.a)); const l = Math.hypot(n[0], n[1], n[2]) || 1; return [n[0] / l, n[1] / l, n[2] / l]; };

/** Push a triangle facing away from `inside` (or along out(centre) when given); drops degenerate ones. */
function face(T, a, b, c, inside, i, j, cap, out) {
  const n = cross(sub(b, a), sub(c, a));
  if (dot(n, n) < 1e-26) return;
  const ce = mid3(a, b, c);
  const ref = out ? out(ce, i, j, cap) : sub(ce, inside);
  if (dot(n, ref) < 0) T.push({ a, b: c, c: b, i, j, cap });
  else T.push({ a, b, c, i, j, cap });
}

/**
 * Loft through rings of equal length. start / end: 'flat' (fan to the ring centre), a pole point,
 * or null (open). Faces point away from the ring centres (good for convex-ish sections) unless
 * out(centre, i, j, cap) supplies an outward reference direction.
 */
function loft(rings, { start = 'flat', end = 'flat', closed = true, out = null } = {}) {
  const T = [], n = rings.length, N = rings[0].length, segs = closed ? N : N - 1;
  const cs = rings.map(avg);
  for (let i = 0; i < n - 1; i++) {
    const inside = avg([cs[i], cs[i + 1]]);
    for (let j = 0; j < segs; j++) {
      const j2 = (j + 1) % N;
      face(T, rings[i][j], rings[i + 1][j], rings[i + 1][j2], inside, i, j, 0, out);
      face(T, rings[i][j], rings[i + 1][j2], rings[i][j2], inside, i, j, 0, out);
    }
  }
  const fan = (ring, pole, inside, i, cap) => {
    for (let j = 0; j < segs; j++) face(T, ring[j], ring[(j + 1) % N], pole, inside, i, j, cap, out);
  };
  if (start) fan(rings[0], start === 'flat' ? cs[0] : start, cs[Math.min(1, n - 1)], -1, 1);
  if (end) fan(rings[n - 1], end === 'flat' ? cs[n - 1] : end, cs[Math.max(0, n - 2)], n - 1, 2);
  return T;
}

/** Revolve [[r, y], ...] (bottom → top faces outward, like THREE.LatheGeometry). i = profile edge, j = segment. */
function lathe(profile, seg, phase = 0) {
  const T = [];
  const P = (j, k) => { const a = phase + (j / seg) * TAU; return [Math.sin(a) * profile[k][0], profile[k][1], Math.cos(a) * profile[k][0]]; };
  for (let j = 0; j < seg; j++) {
    for (let k = 0; k < profile.length - 1; k++) {
      const A = P(j, k), B = P(j + 1, k), C = P(j + 1, k + 1), Dd = P(j, k + 1);
      if (profile[k][0] > 1e-9) T.push({ a: A, b: B, c: Dd, i: k, j });
      if (profile[k + 1][0] > 1e-9) T.push({ a: C, b: Dd, c: B, i: k, j });
    }
  }
  return T;
}

/** Any THREE geometry → soup (optionally scaled / offset). */
function soup(g, s = [1, 1, 1], o = [0, 0, 0]) {
  const G = g.index ? g.toNonIndexed() : g, p = G.attributes.position, T = [];
  const v = k => [p.getX(k) * s[0] + o[0], p.getY(k) * s[1] + o[1], p.getZ(k) * s[2] + o[2]];
  for (let k = 0; k + 2 < p.count; k += 3) {
    const t = { a: v(k), b: v(k + 1), c: v(k + 2), i: k / 3, j: 0 };
    const n = cross(sub(t.b, t.a), sub(t.c, t.a));
    if (dot(n, n) > 1e-26) T.push(t);
  }
  return T;
}

/** Convex hull of points → soup. */
const hull = pts => soup(new ConvexGeometry(pts.map(p => new THREE.Vector3(p[0], p[1], p[2]))));

/** Emit a soup into the model, one part per colour. col(t) → hex, or [hex, tint] to set the tint mask. */
function emit(m, T, col) {
  const groups = new Map(), base = m._tint;
  for (const t of T) {
    let c = typeof col === 'function' ? col(t) : col, tv = base;
    if (Array.isArray(c)) { tv = c[1]; c = c[0]; }
    const key = c + ':' + tv;
    let g = groups.get(key);
    if (!g) groups.set(key, (g = { c, tv, P: [] }));
    g.P.push(t.a[0], t.a[1], t.a[2], t.b[0], t.b[1], t.b[2], t.c[0], t.c[1], t.c[2]);
  }
  for (const g of groups.values()) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(g.P, 3));
    geo.computeVertexNormals();
    m.tint(g.tv);
    m.geo(geo, g.c);
  }
  m.tint(base);
  return T;
}

/** Decal lying on a surface point p with normal n (rotated `spin` about the normal). */
const _Z = new THREE.Vector3(0, 0, 1);
function stick(m, w, h, key, p, n, spin = 0, off = 0.0002, col = 0xffffff, dbl = false) {
  const nv = new THREE.Vector3(n[0], n[1], n[2]).normalize();
  const q = new THREE.Quaternion().setFromUnitVectors(_Z, nv);
  if (spin) q.multiply(new THREE.Quaternion().setFromAxisAngle(_Z, spin));
  const e = new THREE.Euler().setFromQuaternion(q, 'XYZ');
  m.decal(w, h, key, p[0] + nv.x * off, p[1] + nv.y * off, p[2] + nv.z * off, e.x, e.y, e.z, col, dbl);
}

/** Ring of N points around the X axis: (x, yc + sin a·ry, cos a·rz), a = phase + k/N·2π. */
function ringX(x, ry, rz, yc, N, phase = 0, f = null) {
  const out = [];
  for (let k = 0; k < N; k++) {
    const a = phase + (k / N) * TAU, s = f ? f(k, a) : 1;
    out.push([x, yc + Math.sin(a) * ry * s, Math.cos(a) * rz * s]);
  }
  return out;
}

/** Transform a soup by a THREE.Matrix4 (rotations / translations / positive scales). */
function xform(T, M) {
  const v = new THREE.Vector3();
  const f = p => { v.set(p[0], p[1], p[2]).applyMatrix4(M); return [v.x, v.y, v.z]; };
  return T.map(t => ({ ...t, a: f(t.a), b: f(t.b), c: f(t.c) }));
}
const rotM = (rx, ry, rz) => new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rx, ry, rz));
const minY = T => Math.min(...T.map(t => Math.min(t.a[1], t.b[1], t.c[1])));

/** Euler (XYZ) of the rotation whose local X / Y axes point along x / (y made orthogonal). */
function basisEuler(x, y) {
  const X = new THREE.Vector3(x[0], x[1], x[2]).normalize();
  const Z = new THREE.Vector3().crossVectors(X, new THREE.Vector3(y[0], y[1], y[2])).normalize();
  const Y = new THREE.Vector3().crossVectors(Z, X);
  return new THREE.Euler().setFromRotationMatrix(new THREE.Matrix4().makeBasis(X, Y, Z), 'XYZ');
}
const _Y = new THREE.Vector3(0, 1, 0);
/** Cylinder from point a (radius r0) to point b (radius r1). */
function rod(m, a, b, r0, r1, col, seg = 6) {
  const d = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]), L = d.length();
  const e = new THREE.Euler().setFromQuaternion(new THREE.Quaternion().setFromUnitVectors(_Y, d.normalize()), 'XYZ');
  m.cyl(r1, r0, L, col, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2, e.x, e.y, e.z, seg);
}
/** Box from a to b (length along a→b), width w, height h measured along `up`. */
function beam(m, a, b, w, h, col, up = [0, 1, 0]) {
  const x = sub(b, a), e = basisEuler(x, up);
  m.box(Math.hypot(x[0], x[1], x[2]), h, w, col, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2, e.x, e.y, e.z);
}
/** Decal on a surface point with normal n whose picture-up points along `up`. */
function stickUp(m, w, h, key, p, n, up, off = 0.0003, col = 0xffffff) {
  const N = new THREE.Vector3(n[0], n[1], n[2]).normalize(), U = new THREE.Vector3(up[0], up[1], up[2]);
  const X = new THREE.Vector3().crossVectors(U, N), e = basisEuler([X.x, X.y, X.z], up);
  m.decal(w, h, key, p[0] + N.x * off, p[1] + N.y * off, p[2] + N.z * off, e.x, e.y, e.z, col);
}
/** Double-sided leaf folded along its midrib (a shallow V opening towards `up`). */
function leaf(m, base, dir, up, len, wid, top = 0x4f9a45, under = 0x7cc466, fold = 0.3) {
  const d = new THREE.Vector3(dir[0], dir[1], dir[2]).normalize(), u = new THREE.Vector3(up[0], up[1], up[2]);
  const s = new THREE.Vector3().crossVectors(d, u).normalize();
  u.crossVectors(s, d).normalize();
  const P = (a, b, c) => [base[0] + d.x * a + s.x * b + u.x * c, base[1] + d.y * a + s.y * b + u.y * c, base[2] + d.z * a + s.z * b + u.z * c];
  const B = P(0, 0, 0), Tp = P(len, 0, len * 0.06), L = P(len * 0.45, wid, wid * fold), R = P(len * 0.45, -wid, wid * fold);
  emit(m, [{ a: B, b: L, c: Tp, col: top }, { a: B, b: Tp, c: R, col: top }, { a: B, b: Tp, c: L, col: under }, { a: B, b: R, c: Tp, col: under }], t => t.col);
}

/**
 * Decal flush on facet k of lathe(profile, seg, π / seg) (facet k is centred at angle k·2π/seg from +z
 * towards +x), on the profile edge pa → pb at fraction t along it.
 */
function facetDecal(m, w, h, key, pa, pb, k, seg, off = 0.0003, t = 0.5) {
  const phi = (k * TAU) / seg, c = Math.cos(Math.PI / seg), sx = Math.sin(phi), sz = Math.cos(phi);
  const r = (pa[0] + (pb[0] - pa[0]) * t) * c, y = pa[1] + (pb[1] - pa[1]) * t, dr = (pb[0] - pa[0]) * c, dy = pb[1] - pa[1];
  stickUp(m, w, h, key, [sx * r, y, sz * r], [sx * dy, -dr, sz * dy], [sx * dr, dy, sz * dr], off);
}
/** Register a picture as n vertical slices (key0 … key{n−1}) so it can wrap across n lathe facets. */
function sliced(key, n, w, h, draw) {
  for (let k = 0; k < n; k++) decal(key + k, w, h, (ctx, sw, sh) => { ctx.translate(-k * sw, 0); draw(ctx, sw * n, sh); });
}
const rrect = (ctx, x, y, w, h, r, fill) => {
  ctx.fillStyle = fill; ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x, y, w, h, r); else ctx.rect(x, y, w, h);
  ctx.fill();
};

/**
 * Rings of N points perpendicular to a polyline path (for lofts along curves). radii[i] is r or
 * [rSide, rUp]; `up` is a reference direction that must not be parallel to the path.
 */
function pathRings(path, radii, N, { phase = 0, up = [0, 1, 0], f = null } = {}) {
  const unit = v => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
  return path.map((p, i) => {
    const t = unit(sub(path[Math.min(path.length - 1, i + 1)], path[Math.max(0, i - 1)]));
    const sd = unit(cross(t, up)), uu = cross(sd, t), r = radii[i], rs = Array.isArray(r) ? r[0] : r, ru = Array.isArray(r) ? r[1] : r;
    const ring = [];
    for (let k = 0; k < N; k++) {
      const a = phase + (k / N) * TAU, q = f ? f(k, i) : 1;
      ring.push([0, 1, 2].map(c => p[c] + sd[c] * Math.cos(a) * rs * q + uu[c] * Math.sin(a) * ru * q));
    }
    return ring;
  });
}

/** Tiny deterministic per-face shade variation. */
const vary = (m, hex, k = 0.06) => shade(hex, 1 + (m.rng.r() * 2 - 1) * k);

const circle = (ctx, x, y, r, fill) => { ctx.fillStyle = fill; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); };
const ring = (ctx, x, y, r, lw, stroke) => { ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.stroke(); };

// =============================================================================================
// Tier 0 (< 5 cm)
// =============================================================================================

// ---- 瓜子 --------------------------------------------------------------------------------------
const SEED_BLACK = 0x2b2a30, SEED_STRIPE = 0xe2ded2, SEED_GREY = 0xb8b4aa;

def('guazi', {
  name: '瓜子',
  cat: 'food',
  sfx: 'tiny',
  fill: 0.5,
  build(m) {
    const L = 0.016, W = 0.0039, H = 0.0019, y0 = 0.8 * H;
    const top = [1, 0.66, 0.5, 0.1, -0.1, -0.5, -0.66, -1], bot = [-0.55, 0, 0.55];
    const sec = (t, ws, hs) => [
      ...top.map(u => [-L / 2 + t * L, y0 + H * hs * Math.pow(1 - u * u, 0.7), u * W * ws]),
      ...bot.map(u => [-L / 2 + t * L, y0 - 0.8 * H * hs * Math.pow(1 - u * u, 0.7), u * W * ws]),
    ];
    const T = loft([sec(0.09, 0.84, 0.82), sec(0.38, 1, 1), sec(0.72, 0.68, 0.8)], {
      start: [-L / 2, y0 + 0.12 * H, 0], end: [L / 2, y0 + 0.05 * H, 0],
    });
    // lengthwise stripes: two light ones and a grey centre line on top, plain black underneath
    emit(m, T, t => (t.j === 1 || t.j === 5 ? SEED_STRIPE : t.j === 3 ? SEED_GREY : SEED_BLACK));
  },
});

// ---- 瓜子壳: two husk halves still joined at the tip, splayed in a V, inner rims lifted --------
def('guazi_shell', {
  name: '瓜子壳',
  cat: 'food',
  sfx: 'tiny',
  fill: 0.25,
  build(m) {
    const L = 0.015, W = 0.0036, H = 0.0015;
    const uo = [1, 0.6, 0.2, -0.2, -0.6, -1], ui = [1, 0.45, -0.45, -1];
    // one half, tip at the origin, extending to −x, open side up
    const rings = (us, k) => [[0.3, 0.95, 0.95], [0.66, 0.78, 0.8]].map(([t, ws, hs]) =>
      us.map(u => [-L + t * L, -k * H * hs * Math.pow(1 - u * u, 0.7), u * W * ws]));
    const poles = { start: [-L, -0.25 * H, 0], end: [0, -0.15 * H, 0], closed: false };
    const outer = loft(rings(uo, 1), { ...poles, out: () => [0, -1, 0] });
    for (const t of outer) t.col = t.j === 1 || t.j === 3 ? SEED_STRIPE : SEED_BLACK;
    const inner = loft(rings(ui, 0.5), { ...poles, out: () => [0, 1, 0] });
    for (const t of inner) t.col = 0xcfc5ad;
    const half = [...outer, ...inner];
    // both halves stripes-up (flipped), rolled so the inner rims lift and show the pale inside
    const T = [];
    for (const s of [1, -1]) T.push(...xform(half, rotM(0, s * 21 * D, 0).multiply(rotM(Math.PI - s * 24 * D, 0, 0))));
    m.push(L * 0.47, -minY(T), 0);
    emit(m, T, t => t.col);
    m.pop();
  },
});

// ---- 花生 ----------------------------------------------------------------------------------------
def('peanut', {
  name: '花生',
  cat: 'food',
  sfx: 'tiny',
  fill: 0.5,
  build(m) {
    const L = 0.03, R1 = 0.0072, Rw = 0.0053, R2 = 0.0066, k = 0.88 * Math.cos(22.5 * D); // k: flat octagon bottom
    const X = t => -L / 2 + t * L;
    const lobe = [[0.08, 0.72 * R1, R1], [0.27, R1, R1], [0.5, Rw, (R1 + R2) / 2], [0.73, R2, R2], [0.92, 0.7 * R2, R2]];
    const rings = lobe.map(([t, r, rb]) => ringX(X(t), r * 0.88, r, rb * k, 8, 22.5 * D));
    const T = loft(rings, { start: [-L / 2, R1 * k * 0.95, 0], end: [L / 2 + 0.0008, R2 * k + 0.0014, 0] });
    emit(m, T, t => (t.cap ? 0xd2a466 : (t.i + t.j) % 2 ? 0xdcb277 : 0xcc9d60));
  },
});

// ---- 硬币 ----------------------------------------------------------------------------------------
decal('sm_coin1', 64, 64, (ctx, w, h) => {
  const g = ctx.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, '#f3f5f7'); g.addColorStop(0.5, '#c9ced4'); g.addColorStop(1, '#9ca3ab');
  circle(ctx, w / 2, h / 2, w * 0.47, g);
  ring(ctx, w / 2, h / 2, w * 0.41, 2, '#eef1f4');
  fitText(ctx, '1', w / 2 - 6 + 1.5, h / 2 + 1.5, 26, 40, FONTS.sans, '#eef1f4');
  fitText(ctx, '1', w / 2 - 6, h / 2, 26, 40, FONTS.sans, '#6d757e');
  fitText(ctx, '元', w / 2 + 13, h / 2 + 8, 15, 15, FONTS.sans, '#7a828b');
});
decal('sm_coin5', 56, 56, (ctx, w, h) => {
  const g = ctx.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, '#fbe6a2'); g.addColorStop(0.5, '#e0b54c'); g.addColorStop(1, '#b8872a');
  circle(ctx, w / 2, h / 2, w * 0.47, g);
  ring(ctx, w / 2, h / 2, w * 0.41, 2, '#f8e3a0');
  fitText(ctx, '5', w / 2 - 6 + 1.2, h / 2 + 1.2, 20, 32, FONTS.sans, '#fbeab4');
  fitText(ctx, '5', w / 2 - 6, h / 2, 20, 32, FONTS.sans, '#8a6118');
  fitText(ctx, '角', w / 2 + 11, h / 2 + 7, 14, 14, FONTS.sans, '#8a6118');
});

def('coin_1yuan', {
  name: '一元硬币',
  cat: 'daily',
  sfx: 'tiny',
  fill: 0.9,
  build(m) {
    const R = 0.0125, T = 0.00185;
    m.cyl(R, R, T, 0xbfc5cc, 0, T / 2, 0, 0, 0, 0, 12);
    m.decal(R * 1.94, R * 1.94, 'sm_coin1', 0, T + 0.0002, 0, -90 * D, 0, 0);
  },
});

def('coin_5jiao', {
  name: '五角硬币',
  cat: 'daily',
  sfx: 'tiny',
  fill: 0.9,
  build(m) {
    const R = 0.01025, T = 0.00165;
    m.cyl(R, R, T, 0xd6a640, 0, T / 2, 0, 0, 0, 0, 12);
    m.decal(R * 1.94, R * 1.94, 'sm_coin5', 0, T + 0.0002, 0, -90 * D, 0, 0);
  },
});

// ---- 奶糖: wrapped body with twisted, fanned ends (wrapper takes the tint) -----------------------
decal('sm_candy', 64, 22, (ctx, w, h) => {
  ctx.fillStyle = '#fbf7ee';
  ctx.beginPath();
  ctx.ellipse(w / 2, h / 2, w * 0.46, h * 0.44, 0, 0, TAU);
  ctx.fill();
  fitText(ctx, '奶糖', w / 2, h / 2, w * 0.6, h * 0.8, FONTS.round, '#3a6fc4');
});

def('candy', {
  name: '奶糖',
  cat: 'food',
  sfx: 'tiny',
  fill: 0.45,
  tints: [0xe8554a, 0x5aa9e6, 0xf2c14e, 0xf08fb0, 0x5cae4f, 0xa27fd6],
  build(m) {
    const r = 0.0055, yc = r * Math.sin(60 * D);
    const flare = x => ringX(x, 0.0019, 0.0056, yc, 6, 0, k => (k % 3 === 0 ? 1.18 : 0.9));
    const rings = [flare(-0.0148), ringX(-0.0108, 0.0012, 0.0012, yc, 6), ringX(-0.0081, r, r, yc, 6),
      ringX(0.0081, r, r, yc, 6), ringX(0.0108, 0.0012, 0.0012, yc, 6), flare(0.0148)];
    const T = loft(rings);
    m.tint();
    emit(m, T, t => (t.i === 2 && !t.cap ? 0xffffff : t.i === 1 || t.i === 3 ? 0xe6e6e6 : 0xf4f4f4));
    m.tint(0);
    m.decal(0.0142, 0.0047, 'sm_candy', 0, yc + r * Math.sin(60 * D) + 0.0002, 0, -90 * D, 0, 0);
  },
});

// ---- 骰子: chamfered cube, Chinese style red 1 and 4 ---------------------------------------------
const PIPS = {
  1: [[0.5, 0.5]],
  2: [[0.28, 0.28], [0.72, 0.72]],
  3: [[0.25, 0.25], [0.5, 0.5], [0.75, 0.75]],
  4: [[0.28, 0.28], [0.72, 0.28], [0.28, 0.72], [0.72, 0.72]],
  5: [[0.26, 0.26], [0.74, 0.26], [0.5, 0.5], [0.26, 0.74], [0.74, 0.74]],
  6: [[0.28, 0.22], [0.28, 0.5], [0.28, 0.78], [0.72, 0.22], [0.72, 0.5], [0.72, 0.78]],
};
for (let n = 1; n <= 6; n++) {
  decal('sm_dice' + n, 40, 40, (ctx, w, h) => {
    const red = n === 1 || n === 4, r = n === 1 ? w * 0.25 : w * 0.1;
    for (const [u, v] of PIPS[n]) {
      circle(ctx, u * w, v * h, r, red ? '#9e1a20' : '#141418');
      circle(ctx, u * w + 0.6, v * h + 0.6, r * 0.86, red ? '#d8262e' : '#2f2f36');
    }
  });
}

def('dice', {
  name: '骰子',
  cat: 'toy',
  sfx: 'tiny',
  fill: 0.95,
  build(m) {
    const h = 0.008, c = 0.0016, a = h - c, pts = [];
    for (const s of [-1, 1]) for (const p of [-a, a]) for (const q of [-a, a]) pts.push([s * h, p, q], [p, s * h, q], [p, q, s * h]);
    m.push(0, h, 0);
    emit(m, hull(pts), 0xf4f1e8);
    const S = 2 * a * 0.97, o = h + 0.0002;
    m.decal(S, S, 'sm_dice1', 0, o, 0, -90 * D, 0, 0);
    m.decal(S, S, 'sm_dice4', 0, 0, o);
    m.decal(S, S, 'sm_dice3', 0, 0, -o, 0, Math.PI, 0);
    m.decal(S, S, 'sm_dice5', o, 0, 0, 0, 90 * D, 0);
    m.decal(S, S, 'sm_dice2', -o, 0, 0, 0, -90 * D, 0);
    m.pop();
  },
});

// ---- 纽扣 (tinted; the dish and four holes are a greyscale decal that takes the tint too) -------
decal('sm_button', 40, 40, (ctx, w, h) => {
  circle(ctx, w / 2, h / 2, w * 0.49, '#ffffff');
  circle(ctx, w / 2, h / 2, w * 0.36, '#c4c4c4');
  circle(ctx, w / 2, h / 2, w * 0.33, '#d9d9d9');
  for (const [u, v] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    circle(ctx, w / 2 + u * w * 0.12, h / 2 + v * h * 0.12, w * 0.07, '#3a3a3a');
  }
});

def('button', {
  name: '纽扣',
  cat: 'daily',
  sfx: 'tiny',
  fill: 0.85,
  tints: [0xd8342c, 0x2c3e66, 0xf2c14e, 0xf4f2ec, 0x8b5a3c, 0x5aa9e6, 0xf08fb0],
  build(m) {
    const R = 0.0075, T = 0.0024;
    m.tint();
    m.cyl(R * 0.9, R, T, 0xf2f2f2, 0, T / 2, 0, 0, 0, 0, 10);
    m.decal(R * 1.7, R * 1.7, 'sm_button', 0, T + 0.0002, 0, -90 * D, 0, 0);
    m.tint(0);
  },
});

// ---- 瓶盖: crimped crown cap lying face up -------------------------------------------------------
decal('sm_cap', 48, 48, (ctx, w, h) => {
  ring(ctx, w / 2, h / 2, w * 0.4, 2.5, '#fbf3dc');
  ctx.fillStyle = '#fbf3dc';
  ctx.beginPath();
  for (let k = 0; k < 10; k++) {
    const a = -Math.PI / 2 + (k / 10) * TAU, r = k % 2 ? w * 0.12 : w * 0.27;
    ctx.lineTo(w / 2 + Math.cos(a) * r, h / 2 + Math.sin(a) * r);
  }
  ctx.fill();
});

def('bottle_cap', {
  name: '瓶盖',
  cat: 'daily',
  sfx: 'metal',
  fill: 0.6,
  tints: [0xd8342c, 0x2f63c9, 0x3a8f5c, 0xf2c14e, 0xb8bcc2],
  build(m) {
    const H = 0.0062, Rt = 0.0128, N = 12, T = [], inside = [0, H / 2, 0];
    const up = [], lo = [];
    for (let k = 0; k < N; k++) {
      const a = (k / N) * TAU;
      up.push([Math.sin(a) * Rt, H, Math.cos(a) * Rt]);
      for (const [da, r] of [[0, 0.0142], [0.5, 0.0156]]) {
        const b = ((k + da) / N) * TAU;
        lo.push([Math.sin(b) * r, 0, Math.cos(b) * r]);
      }
    }
    const top = [0, H + 0.0004, 0];
    for (let k = 0; k < N; k++) {
      const k2 = (k + 1) % N;
      face(T, up[k], up[k2], top, inside, 0, k, 0);
      face(T, up[k], lo[2 * k], lo[2 * k + 1], inside, 1, k, 0);
      face(T, up[k], lo[2 * k + 1], up[k2], inside, 1, k, 0);
      face(T, up[k2], lo[2 * k + 1], lo[(2 * k + 2) % (2 * N)], inside, 1, k, 0);
    }
    m.tint();
    emit(m, T, t => (t.i === 0 ? 0xffffff : 0xe2e2e2));
    m.tint(0);
    m.decal(0.021, 0.021, 'sm_cap', 0, H + 0.0006, 0, -90 * D, 0, 0);
  },
});

// ---- 电池 (AA, lying on its side, flat facet on top for the label) -------------------------------
decal('sm_battery', 128, 20, (ctx, w, h) => {
  fitText(ctx, '5号电池', w * 0.36, h / 2, w * 0.5, h * 0.8, FONTS.sans, '#fff4d6');
  fitText(ctx, 'AA', w * 0.72, h / 2, w * 0.14, h * 0.75, FONTS.sans, '#fff4d6');
  fitText(ctx, '+', w * 0.93, h / 2, w * 0.1, h * 0.9, FONTS.sans, '#7a4a10');
});

def('battery', {
  name: '电池',
  cat: 'daily',
  sfx: 'metal',
  fill: 0.75,
  build(m) {
    const r = 0.00725, yc = r * Math.cos(22.5 * D), L = 0.0496, ph = 22.5 * D;
    const rings = [ringX(-L / 2, r, r, yc, 8, ph), ringX(0.009, r, r, yc, 8, ph), ringX(L / 2 - 0.0012, r, r, yc, 8, ph)];
    const T = loft(rings);
    emit(m, T, t => (t.cap ? 0xc9cdd2 : t.i === 0 ? 0xc8302a : 0xe7b53f));
    m.cyl(0.0026, 0.0028, 0.0014, 0xd4d8dc, L / 2 - 0.0006, yc, 0, 0, 0, -90 * D, 6);
    // the top facet sits at 2·yc (vertices at 67.5° / 112.5°)
    m.decal(0.036, 0.0046, 'sm_battery', 0.002, 2 * yc + 0.0002, 0, -90 * D, 0, 0);
  },
});

// ---- 橡皮 (white block in a printed paper sleeve) ------------------------------------------------
decal('sm_eraser', 64, 48, (ctx, w, h) => {
  ctx.fillStyle = '#2f63c9';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#f2c14e';
  ctx.fillRect(0, h * 0.72, w, h * 0.1);
  fitText(ctx, '橡皮', w / 2, h * 0.38, w * 0.8, h * 0.46, FONTS.round, '#ffffff');
  fitText(ctx, '4B', w * 0.5, h * 0.9, w * 0.3, h * 0.16, FONTS.sans, '#ffffff');
});

def('eraser', {
  name: '橡皮',
  cat: 'daily',
  sfx: 'soft',
  fill: 0.95,
  build(m) {
    const L = 0.04, H = 0.01, W = 0.02, c = 0.0018, pts = [];
    // worn, chamfered end at −x; square end inside the sleeve at +x
    for (const y of [0, H]) for (const z of [-W / 2, W / 2]) {
      pts.push([L / 2, y, z]);
      pts.push([-L / 2 + c, y, z], [-L / 2, y + (y ? -c : c), z], [-L / 2, y, z + (z > 0 ? -c : c)]);
    }
    emit(m, hull(pts), 0xf3efe6);
    const sx = -0.003, sl = 0.0245;
    m.box(sl, H + 0.0006, W + 0.0006, 0x2f63c9, sx + sl / 2, (H + 0.0006) / 2, 0);
    m.decal(sl * 0.96, W * 0.96, 'sm_eraser', sx + sl / 2, H + 0.0008, 0, -90 * D, 0, 0);
  },
});

// ---- 小石子 (random convex hull, per-facet greys) ------------------------------------------------
def('pebble', {
  name: '小石子',
  cat: 'nature',
  sfx: 'tiny',
  fill: 0.6,
  build(m) {
    const pts = [];
    for (let k = 0; k < 18; k++) {
      const u = m.rng.range(-1, 1), a = m.rng.angle(), s = Math.sqrt(1 - u * u), j = m.rng.range(0.82, 1.08);
      const y = u * 0.0068 * j;
      pts.push([Math.cos(a) * s * 0.0152 * j, y < 0 ? y * 0.55 : y, Math.sin(a) * s * 0.0115 * j]);
    }
    const lo = Math.min(...pts.map(p => p[1]));
    m.push(0, -lo, 0);
    emit(m, hull(pts), () => vary(m, 0x9aa0a6, 0.12));
    m.pop();
  },
});

// ---- 饺子: half-moon standing on its belly, frilled accordion seam along the arch ------------------
def('jiaozi', {
  name: '饺子',
  cat: 'food',
  sfx: 'squish',
  fill: 0.55,
  build(m) {
    const L = 0.045, W = 0.0098, H = 0.0185;
    const bend = t => -0.0045 * t * t;                       // horns curl slightly backwards (−z)
    const sz = t => Math.pow(Math.max(0, 1 - t * t), 0.5);   // half-moon silhouette
    const sec = [[0.56, 0], [1, 0.3], [0.72, 0.7], [0, 0.95], [-0.72, 0.7], [-1, 0.3], [-0.56, 0]];
    const ts = [-0.72, -0.38, 0, 0.38, 0.72];
    const pt = (t, u, v) => { const s = sz(t); return [t * L / 2, v * H * Math.pow(s, 0.9), bend(t) + u * W * (0.35 + 0.65 * s)]; };
    const rings = ts.map(t => sec.map(([u, v]) => pt(t, u, v)));
    const tip = t => [t * L / 2, 0.09 * H, bend(t)];
    emit(m, loft(rings, { start: tip(-1.02), end: tip(1.02) }), t => (t.j >= 1 && t.j <= 4 && t.i % 2 ? 0xf2e9d6 : 0xf7f0e2));
    // seam: a double-sided accordion strip; alternating panels catch the light like pinched pleats
    const T = [], n = 11, B = [], U = [];
    for (let k = 0; k < n; k++) {
      const t = -0.84 + (1.68 * k) / (n - 1), o = k % 2 ? 0.2 : -0.2, s = sz(t);
      B.push(pt(t, o, 0.9));
      const b = pt(t, o * 1.2, 0.9);
      U.push([b[0], b[1] + 0.2 * H * (0.55 + 0.45 * s), b[2]]);
    }
    for (let k = 0; k < n - 1; k++) {
      const c = k % 2 ? 0xebdfc6 : 0xf6eedd;
      T.push({ a: B[k], b: B[k + 1], c: U[k + 1], col: c }, { a: B[k], b: U[k + 1], c: U[k], col: c });
      T.push({ a: B[k + 1], b: B[k], c: U[k + 1], col: c }, { a: U[k + 1], b: B[k], c: U[k], col: c });
    }
    emit(m, T, t => t.col);
  },
});

// ---- 小鱼干: slim dried fish lying on its side, slightly curled ------------------------------------
decal('sm_fish_eye', 16, 16, (ctx, w, h) => {
  circle(ctx, w / 2, h / 2, w * 0.46, '#f3ead2');
  circle(ctx, w / 2, h / 2, w * 0.3, '#2a1d17');
});

def('dried_fish', {
  name: '小鱼干',
  cat: 'food',
  sfx: 'tiny',
  fill: 0.35,
  build(m) {
    const yc = 0.0017, curl = x => 0.0025 * (x / 0.02) ** 2;
    // lens section: dorsal edge towards +z, belly towards −z, flat sides up / down
    const sec = (x, hz, ty) => [[hz, 0], [0.5 * hz, 0.85 * ty], [-0.5 * hz, 0.85 * ty], [-hz, 0], [-0.5 * hz, -0.85 * ty], [0.5 * hz, -0.85 * ty]]
      .map(([z, y]) => [x, yc + y, z + curl(x)]);
    const rings = [sec(-0.0165, 0.0021, 0.0011), sec(-0.007, 0.0042, 0.0017), sec(0.0045, 0.0049, 0.002), sec(0.0135, 0.0038, 0.0018)];
    const T = loft(rings, { start: [-0.0182, yc, curl(-0.0182)], end: [0.0212, yc - 0.0003, curl(0.0212) - 0.0008] });
    emit(m, T, t => (t.j === 3 || t.j === 4 ? 0xd9ccb0 : t.j === 0 || t.j === 5 ? 0x9a6a34 : vary(m, 0xb98a4c, 0.05)));
    // forked tail fin
    m.extrude([[-0.017, 0.0014], [-0.0255, 0.0058], [-0.0228, 0.0002], [-0.0255, -0.0054], [-0.017, -0.0014]], 0.0007, 0xa8783e, 0, yc, curl(-0.02), 90 * D, 0, 0);
    m.decal(0.0026, 0.0026, 'sm_fish_eye', 0.0158, yc + 0.0018 + 0.0002, curl(0.0158) + 0.0006, -80 * D, 0, 0);
  },
});

// ---- 象棋: wooden discs with the carved, painted character in a ring ------------------------------
function chessDecal(key, ch, color) {
  decal(key, 64, 64, (ctx, w, h) => {
    circle(ctx, w / 2, h / 2, w * 0.47, '#ecd2a6');
    ring(ctx, w / 2, h / 2, w * 0.4, 2.5, color);
    fitText(ctx, ch, w / 2, h / 2, w * 0.56, h * 0.56, FONTS.serif, color);
  });
}
chessDecal('sm_chess_shuai', '帅', '#c8202a');
chessDecal('sm_chess_jiang', '将', '#26262c');
chessDecal('sm_chess_ma', '马', '#c8202a');

function chessPiece(m, key) {
  const R = 0.015, T = 0.0125, wood = 0xdcb27c;
  m.cyl(R, R, T, wood, 0, T / 2, 0, 0, 0, 0, 12);
  m.decal(R * 1.9, R * 1.9, key, 0, T + 0.0002, 0, -90 * D, 0, 0);
}
def('chess_red', { name: '象棋·帅', cat: 'toy', sfx: 'wood', fill: 0.9, build: m => chessPiece(m, 'sm_chess_shuai') });
def('chess_black', { name: '象棋·将', cat: 'toy', sfx: 'wood', fill: 0.9, build: m => chessPiece(m, 'sm_chess_jiang') });
def('chess_horse', { name: '象棋·马', cat: 'toy', sfx: 'wood', fill: 0.9, build: m => chessPiece(m, 'sm_chess_ma') });

// ---- 麻将 (same tile as mahjong_zhong in examples.js) ---------------------------------------------
decal('sm_mj_fa', 52, 70, (ctx, w, h) => {
  ctx.fillStyle = '#f6f1e2'; ctx.fillRect(0, 0, w, h);
  fitText(ctx, '發', w / 2, h / 2, w * 0.84, h * 0.74, FONTS.serif, '#1f7a44');
});
decal('sm_mj_wan', 52, 70, (ctx, w, h) => {
  ctx.fillStyle = '#f6f1e2'; ctx.fillRect(0, 0, w, h);
  fitText(ctx, '一', w / 2, h * 0.27, w * 0.7, h * 0.3, FONTS.serif, '#1f2a5a');
  fitText(ctx, '萬', w / 2, h * 0.66, w * 0.8, h * 0.46, FONTS.serif, '#c8202a');
});
decal('sm_mj_tong', 52, 70, (ctx, w, h) => {
  ctx.fillStyle = '#f6f1e2'; ctx.fillRect(0, 0, w, h);
  for (let r = 0; r < 4; r++) for (let c = 0; c < 2; c++) {
    const x = w * (0.3 + c * 0.4), y = h * (0.15 + r * 0.233), R = w * 0.16;
    circle(ctx, x, y, R, '#2a5bb0');
    circle(ctx, x, y, R * 0.72, '#f6f1e2');
    circle(ctx, x, y, R * 0.52, '#2f8a5b');
    circle(ctx, x, y, R * 0.2, '#c8202a');
  }
});

function mahjongTile(m, key) {
  const W = 0.026, T = 0.018, L = 0.035; // lying face-up
  m.box(W, T * 0.58, L, 0xf4efe0, 0, T * 0.71, 0);
  m.box(W, T * 0.42, L, 0x2f8a5b, 0, T * 0.21, 0);
  m.decal(W * 0.9, L * 0.9, key, 0, T + 0.0003, 0, -90 * D, 0, 0);
}
def('mahjong_fa', { name: '麻将·发财', cat: 'toy', sfx: 'tiny', fill: 1, build: m => mahjongTile(m, 'sm_mj_fa') });
def('mahjong_wan', { name: '麻将·一万', cat: 'toy', sfx: 'tiny', fill: 1, build: m => mahjongTile(m, 'sm_mj_wan') });
def('mahjong_tong', { name: '麻将·八筒', cat: 'toy', sfx: 'tiny', fill: 1, build: m => mahjongTile(m, 'sm_mj_tong') });

// ---- 玻璃弹珠: faintly tinted glass with a fully tinted cat's-eye swirl -----------------------------
decal('sm_glint', 16, 16, (ctx, w, h) => {
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.ellipse(w / 2, h / 2, w * 0.45, h * 0.3, -0.6, 0, TAU);
  ctx.fill();
});

def('marble', {
  name: '玻璃弹珠',
  cat: 'toy',
  sfx: 'glass',
  fill: 0.52,
  tints: [0x2f63c9, 0xe8554a, 0x3a9f5c, 0xf2c14e, 0x9b6fd1],
  build(m) {
    const r = 0.008;
    const T = soup(new THREE.SphereGeometry(r, 8, 5), [1, 1, 1], [0, r, 0]);
    // SphereGeometry faces come in rows of 8 (first and last row are single triangles)
    const cell = t => { const c = cen(t), a = Math.atan2(c[2], c[0]), b = Math.acos((c[1] - r) / (Math.hypot(c[0], c[1] - r, c[2]) || 1)); return [a, b]; };
    emit(m, T, t => {
      const [a, b] = cell(t), band = Math.abs(Math.sin(a * 1 + b * 1.6));
      return band < 0.34 ? [0xffffff, 1] : [0xe4f0ee, 0.3];
    });
    stick(m, 0.0034, 0.0034, 'sm_glint', [-0.0034, r + 0.0056, 0.0032], [-0.42, 0.7, 0.4]);
  },
});

// ---- 钥匙 (brass key with a steel split ring through the bow) ----------------------------------------
decal('sm_keyhole', 16, 16, (ctx, w, h) => circle(ctx, w / 2, h / 2, w * 0.45, '#4a3a22'));

def('key', {
  name: '钥匙',
  cat: 'daily',
  sfx: 'metal',
  fill: 0.2,
  build(m) {
    const t = 0.0021, hc = [-0.0145, 0], R = 0.0092, pts = [];
    for (const a of [30, 90, 150, 210, 270, 330]) pts.push([hc[0] + Math.cos(a * D) * R, hc[1] + Math.sin(a * D) * R]);
    pts.push([-0.005, -0.0028], [0.007, -0.0028], [0.0095, -0.0056], [0.013, -0.0034], [0.0165, -0.0056], [0.02, -0.0028],
      [0.026, -0.0012], [0.026, 0.0016], [0.023, 0.0028], [-0.005, 0.0028]);
    // outline is drawn in x / y; lay it flat (local y → world −z) with the key's top face up
    const ccw = [pts[5], pts[4], ...pts.slice(6), pts[0], pts[1], pts[2], pts[3]];
    m.push(0, 0, 0, 0, 0, 0, 0.85);
    m.extrude(ccw.map(([x, y]) => [x + 0.004, y]), t, 0xd9ae45, 0, t / 2, 0, -90 * D, 0, 0);
    m.decal(0.0052, 0.0052, 'sm_keyhole', hc[0] - 0.0028 + 0.004, t + 0.0002, 0, -90 * D, 0, 0);
    m.torus(0.0088, 0.0007, 0xb8bcc2, hc[0] - 0.0105 + 0.004, 0.0007, 0, 90 * D, 0, 0, TAU, 3, 8);
    m.pop();
  },
});

// ---- 粉笔 (tinted stick, one end worn round) ---------------------------------------------------------
def('chalk', {
  name: '粉笔',
  cat: 'daily',
  sfx: 'tiny',
  fill: 0.75,
  tints: [0xf4f2ec, 0xf5a3b5, 0xf2d45e, 0x8cc8ea, 0x9bd68a],
  build(m) {
    const ph = 22.5 * D, k = Math.cos(22.5 * D), L = 0.06;
    const rings = [ringX(-L / 2 + 0.0035, 0.0036, 0.0036, 0.0052 * k, 8, ph), ringX(-L / 2 + 0.0075, 0.0048, 0.0048, 0.0052 * k, 8, ph),
      ringX(L / 2, 0.0052, 0.0052, 0.0052 * k, 8, ph)];
    m.tint();
    emit(m, loft(rings, { start: [-L / 2, 0.0052 * k + 0.0004, 0] }), t => (t.i < 1 && !t.cap ? 0xffffff : t.cap === 1 ? 0xffffff : 0xefefef));
    m.tint(0);
  },
});

// ---- 四叶草: a tiny plant, four heart leaflets on a short stalk -------------------------------------
decal('sm_clover', 48, 48, (ctx, w, h) => {
  // heart with its point at the bottom (towards the stalk)
  const heart = (s, fill) => {
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.moveTo(w / 2, h * (1 - 0.06 * s));
    ctx.bezierCurveTo(w * (0.5 - 0.62 * s), h * 0.58, w * (0.5 - 0.5 * s), h * 0.02, w / 2, h * (0.2 + 0.1 * (1 - s)));
    ctx.bezierCurveTo(w * (0.5 + 0.5 * s), h * 0.02, w * (0.5 + 0.62 * s), h * 0.58, w / 2, h * (1 - 0.06 * s));
    ctx.fill();
  };
  heart(1, '#3f8f4a');
  heart(0.86, '#5cae4f');
  ctx.strokeStyle = '#b9e0a0';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(w * 0.28, h * 0.42); ctx.lineTo(w / 2, h * 0.62); ctx.lineTo(w * 0.72, h * 0.42);
  ctx.stroke();
});

def('clover', {
  name: '四叶草',
  cat: 'plant',
  sfx: 'soft',
  fill: 0.15,
  build(m) {
    const top = 0.012, S = 0.0198, tilt = 22 * D;
    m.cyl(0.0007, 0.0009, top + 0.001, 0x4f9a45, 0, (top + 0.001) / 2, 0, 0, 0, 0, 4);
    for (let k = 0; k < 4; k++) {
      m.push(0, top, 0, 0, (k * 90 + 45) * D, 0);
      m.decal(S, S, 'sm_clover', 0, Math.sin(tilt) * S / 2, -Math.cos(tilt) * S / 2 + 0.0004, -90 * D + tilt, 0, 0, 0xffffff, true);
      m.pop();
    }
  },
});

// ---- 瓢虫: two red wing-case halves with a black gap, spots, black head and white eyes --------------
decal('sm_spot', 16, 16, (ctx, w, h) => circle(ctx, w / 2, h / 2, w * 0.46, '#26262c'));
decal('sm_lady_eyes', 32, 16, (ctx, w, h) => {
  for (const x of [0.27, 0.73]) { circle(ctx, w * x, h / 2, h * 0.42, '#fbf7ee'); circle(ctx, w * x + 1, h / 2 + 1, h * 0.2, '#2a1d17'); }
});

def('ladybug', {
  name: '瓢虫',
  cat: 'animal',
  sfx: 'tiny',
  fill: 0.5,
  build(m) {
    const black = 0x2a2a30, red = 0xe03a2e, rx = 0.0043, ry = 0.0034, rz = 0.0048, zc = -0.0006;
    m.dome(1, black, 0, 0, zc - 0.0001, rx * 0.95, ry * 0.95, rz * 1.01, 0, 0, 0, 6);
    m.dome(0.0021, black, 0, 0, 0.0038, 1.1, 1.05, 1, 0, 0, 0, 6);
    m.decal(0.003, 0.0015, 'sm_lady_eyes', 0, 0.0012, 0.0059, -18 * D, 0, 0);
    for (const s of [1, -1]) {
      const half = soup(new THREE.SphereGeometry(1, 4, 3, s > 0 ? Math.PI / 2 : -Math.PI / 2, Math.PI, 0, Math.PI / 2), [rx, ry, rz], [s * 0.00022, 0, zc]);
      emit(m, half, red);
      // spots on the centres of three (planar) quads: front / side / back, mirrored between the halves
      const quad = (row, seg) => { const b = 4 + (row - 1) * 8 + 2 * (s > 0 ? seg : 3 - seg); return [half[b], half[b + 1]]; };
      for (const [row, seg] of [[1, 0], [2, 2], [1, 3]]) {
        const [f, g] = quad(row, seg);
        stick(m, 0.0015, 0.0015, 'sm_spot', avg([f.a, f.b, f.c, g.a, g.b, g.c]), nrm(f), 0, 0.00012);
      }
    }
  },
});

// ---- 蜗牛: soft foot, spiral-painted shell, eye stalks (moves slowly, faces +z) ---------------------
decal('sm_snail', 64, 64, (ctx, w, h) => {
  ctx.strokeStyle = '#6b3f1c';
  ctx.lineWidth = 5;
  ctx.lineCap = 'round';
  ctx.beginPath();
  for (let k = 0; k <= 64; k++) {
    const a = k * 0.2, r = w * (0.02 + 0.0335 * a);
    ctx.lineTo(w / 2 + Math.cos(a) * r, h / 2 + Math.sin(a) * r);
  }
  ctx.stroke();
});

def('snail', {
  name: '蜗牛',
  cat: 'animal',
  sfx: 'squish',
  fill: 0.4,
  mover: { kind: 'wander', speed: 0.01 },
  build(m) {
    const body = 0xcdbf9f, shell = 0xd08a44, dark = 0x2a1d17;
    const sec = (z, s, lift) => [[0.0046, 0], [0.004, 0.0034], [0, 0.0048], [-0.004, 0.0034], [-0.0046, 0]]
      .map(([x, y]) => [x * s, lift + y * s, z]);
    const rings = [sec(-0.013, 0.55, 0), sec(0.001, 1, 0), sec(0.011, 0.92, 0.0022), sec(0.0165, 0.8, 0.0058)];
    emit(m, loft(rings, { start: [0, 0.0006, -0.0195], end: [0, 0.0098, 0.0196] }), body);
    // shell: a flat faceted wheel with a painted spiral on both sides
    const R = 0.011, Wd = 0.0098, cy = 0.0144, cz = -0.0035;
    m.push(0, cy, cz, 0, 0, -90 * D);
    emit(m, lathe([[0, -Wd / 2], [0.8 * R, -Wd / 2], [R, 0], [0.8 * R, Wd / 2], [0, Wd / 2]], 8, Math.PI / 8),
      t => (t.i === 0 || t.i === 3 ? 0xdc9a52 : t.j % 2 ? 0xc47a3a : 0xd08a44));
    m.pop();
    for (const s of [1, -1]) m.decal(R * 1.44, R * 1.44, 'sm_snail', s * (Wd / 2 + 0.0002), cy, cz, 0, s * 90 * D, 0);
    // eye stalks with dark eye balls
    for (const s of [1, -1]) {
      m.cone(0.0009, 0.009, body, s * 0.0019, 0.0132, 0.0178, 0, 0, s * -0.3, 3);
      m.geo(new THREE.OctahedronGeometry(0.0014), dark, s * 0.0033, 0.0176, 0.0178);
    }
  },
});

// =============================================================================================
// Tier 1 (5–30 cm)
// =============================================================================================

// ---- 月饼: fluted golden cake with an embossed 莲蓉 top ----------------------------------------------
decal('sm_mooncake', 128, 128, (ctx, w, h) => {
  const cx = w / 2, cy = h / 2, R = w * 0.48;
  const g = ctx.createRadialGradient(cx - 12, cy - 14, 6, cx, cy, R);
  g.addColorStop(0, '#eab15c'); g.addColorStop(1, '#bf7630');
  circle(ctx, cx, cy, R, g);
  const emboss = draw => { ctx.save(); ctx.translate(1.6, 1.6); draw('#8a4a18'); ctx.restore(); draw('#f6cf8a'); };
  emboss(c => {
    ctx.strokeStyle = c; ctx.lineWidth = 3;
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * TAU;
      ctx.beginPath(); ctx.arc(cx + Math.cos(a) * R * 0.8, cy + Math.sin(a) * R * 0.8, R * 0.13, a - 1.6, a + 1.6); ctx.stroke();
    }
    ring(ctx, cx, cy, R * 0.6, 3, c);
    ring(ctx, cx, cy, R * 0.53, 1.5, c);
    fitText(ctx, '莲蓉', cx, cy, R * 0.9, R * 0.46, FONTS.serif, c);
  });
});

def('mooncake', {
  name: '月饼',
  cat: 'food',
  sfx: 'squish',
  fill: 0.75,
  build(m) {
    const R = 0.04, N = 32;
    const rg = (y, r, fl = true) => {
      const out = [];
      for (let k = 0; k < N; k++) { const a = (k / N) * TAU, s = fl && k % 2 ? 0.955 : 1; out.push([Math.sin(a) * r * s, y, Math.cos(a) * r * s]); }
      return out;
    };
    const T = loft([rg(0, R * 0.93), rg(0.004, R), rg(0.025, R * 0.99), rg(0.0315, R * 0.89, false)]);
    const cols = [0xc27b32, 0xdc9a44, 0xce8a3a];
    emit(m, T, t => (t.cap === 1 ? 0xb8742e : t.cap === 2 ? 0xd08c3a : cols[t.i]));
    m.decal(0.07, 0.07, 'sm_mooncake', 0, 0.0318, 0, -90 * D, 0, 0);
  },
});

// ---- 橘子 -------------------------------------------------------------------------------------------
def('orange', {
  name: '橘子',
  cat: 'food',
  sfx: 'squish',
  fill: 0.55,
  build(m) {
    const T = lathe([[0, 0.0015], [0.016, 0], [0.029, 0.006], [0.035, 0.019], [0.034, 0.031], [0.027, 0.042], [0.014, 0.0485], [0.004, 0.0482], [0, 0.0476]], 12);
    emit(m, T, () => vary(m, 0xf29a2e, 0.07));
    m.cyl(0.0022, 0.0027, 0.004, 0x6b7a2a, 0, 0.0496, 0, 0, 0, 0, 5);
    leaf(m, [0.001, 0.0508, 0.001], [0.85, 0.3, 0.42], [0, 1, 0], 0.034, 0.011);
  },
});

// ---- 苹果 -------------------------------------------------------------------------------------------
def('apple', {
  name: '苹果',
  cat: 'food',
  sfx: 'squish',
  fill: 0.55,
  build(m) {
    const T = lathe([[0, 0.006], [0.01, 0.002], [0.022, 0.0005], [0.033, 0.009], [0.0395, 0.024], [0.039, 0.04], [0.032, 0.054], [0.02, 0.0605], [0.009, 0.059], [0, 0.0545]], 12);
    emit(m, T, t => (t.i <= 1 ? mix(0xe8a040, 0xd8342c, m.rng.r() * 0.6) : t.i >= 7 ? 0xb82a24 : vary(m, m.rng.chance(0.3) ? 0xe25138 : 0xd33530, 0.05)));
    rod(m, [0, 0.055, 0], [0.003, 0.0685, 0.001], 0.0017, 0.0014, 0x6b4a2a, 4);
    leaf(m, [0.0022, 0.064, 0.0005], [0.9, 0.4, -0.25], [0, 1, 0], 0.026, 0.009);
  },
});

// ---- 鸡蛋 (lying on its side, blunt end at −x) ---------------------------------------------------------
def('egg', {
  name: '鸡蛋',
  cat: 'food',
  sfx: 'squish',
  fill: 0.52,
  build(m) {
    const L = 0.058, R = 0.0218, ss = [-0.88, -0.6, -0.25, 0.1, 0.45, 0.75, 0.93];
    const r = s => R * Math.sqrt(1 - s * s) * (1 - 0.12 * s);
    const yc = Math.max(...ss.map(r));
    const rings = ss.map(s => ringX((s * L) / 2, r(s), r(s), yc, 12, 0));
    emit(m, loft(rings, { start: [-L / 2, yc, 0], end: [L / 2, yc, 0] }), 0xf6e6cb);
  },
});

// ---- 粽子: leaf-wrapped tetrahedron tied with string ------------------------------------------------
decal('sm_zongzi', 64, 56, (ctx, w, h) => {
  ctx.save();
  ctx.beginPath(); ctx.moveTo(w / 2, 1); ctx.lineTo(w - 1, h - 1); ctx.lineTo(1, h - 1); ctx.closePath(); ctx.clip();
  const g = ctx.createLinearGradient(0, 0, w * 0.6, h);
  g.addColorStop(0, '#78c060'); g.addColorStop(1, '#3f8a3c');
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = 'rgba(214,240,180,0.55)'; ctx.lineWidth = 1;
  for (let k = -8; k < 12; k++) { ctx.beginPath(); ctx.moveTo(k * 6, h); ctx.lineTo(k * 6 + h * 0.6, 0); ctx.stroke(); }
  ctx.strokeStyle = '#2f6e2e'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(w * 0.16, h - 1); ctx.lineTo(w * 0.6, h * 0.1); ctx.stroke();
  ctx.restore();
});

def('zongzi', {
  name: '粽子',
  cat: 'food',
  sfx: 'soft',
  fill: 0.4,
  build(m) {
    const Rb = 0.058, Ht = 0.083, apex = [0, Ht, 0], leafG = 0x4f9a45, str = 0xf4ecd8;
    const C = [60, 180, 300].map(a => [Math.sin(a * D) * Rb, 0, Math.cos(a * D) * Rb]);
    const V = [...C, apex], pts = [];
    for (const v of V) for (const w of V) if (v !== w) pts.push(v.map((x, k) => x + (w[k] - x) * 0.1));
    emit(m, hull(pts), t => (nrm(t)[1] < -0.9 ? 0x3f7a38 : leafG));
    const lerp = (a, b, t) => a.map((x, k) => x + (b[k] - x) * t);
    for (let k = 0; k < 3; k++) {
      const a = C[k], b = C[(k + 1) % 3], n = nrm({ a, b, c: apex });
      const fn = n[1] < 0 ? n.map(x => -x) : n;                         // outward (up-facing) normal
      const bm = lerp(a, b, 0.5), cen3 = mid3(a, b, apex), up = sub(apex, bm);
      const base = Math.hypot(...sub(b, a)), slant = Math.hypot(...up), S = 0.82;
      stickUp(m, base * S, slant * S, 'sm_zongzi', cen3.map((x, i) => x + (up[i] / slant) * slant * S / 6), fn, up, 0.0004);
      // two turns of string around the waist
      for (const y of [0.024, 0.035]) {
        const p = lerp(a, apex, y / Ht), q = lerp(b, apex, y / Ht), o = fn.map(x => x * 0.0011);
        const e = sub(q, p).map(x => x * 0.04);
        beam(m, sub(p.map((x, i) => x + o[i]), e), q.map((x, i) => x + o[i] + e[i]), 0.0026, 0.0026, str, fn);
      }
    }
    // knot and loose ends at the front edge, a leaf tip sticking up at the top
    const kp = lerp(C[0], apex, 0.36).map((x, i) => x * (i === 1 ? 1 : 1.06));
    m.sphere(0.0036, str, kp[0], kp[1], kp[2], 1, 1, 1, 0, 0, 0, 5);
    beam(m, kp, [kp[0] + 0.012, kp[1] - 0.012, kp[2] + 0.004], 0.0024, 0.0024, str, [0, 0, 1]);
    beam(m, kp, [kp[0] + 0.004, kp[1] - 0.015, kp[2] + 0.01], 0.0024, 0.0024, str, [0, 0, 1]);
    leaf(m, [0, Ht * 0.93, 0], [0.12, 1, 0.3], [0, 0, 1], 0.022, 0.006, 0x5cae4f, 0x7cc466, 0.2);
  },
});

// ---- 冰糖葫芦: six glossy haws on a bamboo stick, lying down ------------------------------------------
def('tanghulu', {
  name: '冰糖葫芦',
  cat: 'food',
  sfx: 'squish',
  fill: 0.2,
  build(m) {
    const r = 0.0158;
    rod(m, [-0.2, r * 0.96, 0], [0.15, r * 0.96, 0], 0.0022, 0.0019, 0xd9b77a, 5);
    for (let k = 0; k < 6; k++) {
      const x = -0.04 + k * 0.0315, z = (k % 2 ? 1 : -1) * 0.0008, rr = r * (k === 5 ? 0.93 : 1);
      m.sphere(rr, 0xd6232b, x, rr * 0.96, z, 1, 0.96, 1, 0, 0, 0, 6);
      stick(m, 0.0085, 0.0085, 'sm_glint', [x - rr * 0.35, rr * 1.75, z + rr * 0.45], [-0.35, 0.75, 0.45]);
    }
  },
});

// ---- 烤串: chunky lamb and fat cubes on a bamboo skewer, dusted with chilli and cumin ----------------
decal('sm_spice', 32, 32, (ctx, w, h) => {
  let seed = 11;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let k = 0; k < 22; k++) {
    ctx.fillStyle = k % 3 === 0 ? '#5a3418' : k % 3 === 1 ? '#d8342c' : '#b0281e';
    ctx.beginPath(); ctx.arc(3 + rnd() * (w - 6), 3 + rnd() * (h - 6), 1.4 + rnd() * 1.2, 0, TAU); ctx.fill();
  }
});

def('skewer', {
  name: '烤串',
  cat: 'food',
  sfx: 'squish',
  fill: 0.3,
  build(m) {
    const S = 0.022, y = S / 2, pieces = [];
    const meat = [0xa0603a, 0x8a4a2b, 0xb86a3c, 0x7a3e24, 0xc2412c];
    let x = -0.036;
    for (let k = 0; k < 7; k++) {
      const fat = k % 2 === 1, sz = S * (fat ? 0.66 : 1), pts = [];
      for (const a of [-1, 1]) for (const b of [-1, 1]) for (const c of [-1, 1]) {
        pts.push([a * sz * 0.5 * m.rng.range(0.8, 1.08), b * sz * 0.5 * m.rng.range(0.8, 1.05), c * sz * 0.5 * m.rng.range(0.8, 1.08)]);
      }
      for (let q = 0; q < 4; q++) pts.push([m.rng.range(-0.3, 0.3) * sz, (m.rng.chance(0.5) ? 0.56 : -0.5) * sz, m.rng.range(-0.3, 0.3) * sz]);
      x += (sz / 2) * 0.92;
      // skewered on the stick: each piece is turned a little around the stick axis
      const M = new THREE.Matrix4().makeTranslation(x, y, 0).multiply(rotM(m.rng.range(-0.35, 0.35), m.rng.range(-0.15, 0.15), 0));
      pieces.push({ T: xform(hull(pts), M), fat, sz });
      x += (sz / 2) * 0.92;
    }
    m.push(0, -Math.min(...pieces.map(p => minY(p.T))), 0);
    rod(m, [-0.125, y, 0], [0.122, y, 0], 0.0018, 0.0008, 0xd9b77a, 4);
    for (const { T, fat, sz } of pieces) {
      emit(m, T, () => (fat ? vary(m, m.rng.chance(0.3) ? 0xe6c08e : 0xf2dcb8, 0.04) : m.rng.pick(meat)));
      if (fat) continue;
      let top = T[0];
      for (const t of T) if (nrm(t)[1] > nrm(top)[1]) top = t;
      stick(m, sz * 0.62, sz * 0.62, 'sm_spice', cen(top), nrm(top), m.rng.angle(), 0.0003);
    }
    m.pop();
  },
});

// ---- 奶茶: tapered cup, pearls showing through, tinted sleeve, foam dome, fat straw ---------------------
decal('sm_pearls', 24, 40, (ctx, w, h) => {
  const P = [[0.24, 0.9], [0.72, 0.9], [0.48, 0.74], [0.18, 0.6], [0.8, 0.64], [0.46, 0.44], [0.2, 0.28], [0.76, 0.32], [0.52, 0.12]];
  for (const [u, v] of P) {
    circle(ctx, u * w, v * h, w * 0.21, '#3b2418');
    circle(ctx, u * w - 1.5, v * h - 1.5, w * 0.06, '#9a7a62');
  }
});
decal('sm_tea_logo', 48, 48, (ctx, w, h) => {
  circle(ctx, w / 2, h / 2, w * 0.46, '#fbf7ee');
  fitText(ctx, '奶茶', w / 2, h * 0.56, w * 0.7, h * 0.36, FONTS.round, '#7a4a2a');
  circle(ctx, w * 0.5, h * 0.27, w * 0.06, '#e8554a');
});

def('milk_tea', {
  name: '奶茶',
  cat: 'food',
  sfx: 'soft',
  fill: 0.6,
  tints: [0xf08fb0, 0x5cae4f, 0xf2a14a, 0x5aa9e6, 0xa27fd6],
  build(m) {
    const r = y => 0.036 + (0.009 * y) / 0.118, ph = Math.PI / 12, slope = 0.009 / 0.118, ap = Math.cos(ph);
    emit(m, lathe([[0, 0], [0.035, 0], [0.036, 0.004], [r(0.118), 0.118]], 12, ph), t => (t.i === 2 ? 0xd6b089 : 0xc9a27a));
    for (let k = 0; k < 12; k++) {
      const a = k * (TAU / 12), y = 0.019, s = [Math.sin(a), 0, Math.cos(a)];
      stickUp(m, 0.017, 0.03, 'sm_pearls', [s[0] * r(y) * ap, y, s[2] * r(y) * ap], [s[0], -slope, s[2]], [s[0] * slope, 1, s[2] * slope]);
    }
    m.tint();
    emit(m, lathe([[r(0.049), 0.049], [r(0.05) + 0.001, 0.05], [r(0.092) + 0.001, 0.092], [r(0.093), 0.093]], 12, ph), 0xffffff);
    m.tint(0);
    stickUp(m, 0.017, 0.017, 'sm_tea_logo', [0, 0.071, r(0.071) * ap + 0.001], [0, -slope, 1], [0, 1, slope]);
    m.cyl(0.0474, 0.047, 0.005, 0xeef2ef, 0, 0.1205, 0, 0, ph, 0, 12);
    m.dome(0.0445, 0xf8efdc, 0, 0.1225, 0, 1, 0.72, 1, 0, ph, 0, 10);
    rod(m, [0.006, 0.11, 0.004], [0.02, 0.19, 0.011], 0.0056, 0.0056, 0xe8607e, 6);
  },
});

// ---- 易拉罐 (tinted body, generic 汽水 label wrapped over three facets) --------------------------------
sliced('sm_can_', 3, 32, 128, (ctx, W, H) => {
  ctx.fillStyle = '#fbf7ee';
  ctx.beginPath();
  ctx.moveTo(0, H * 0.66); ctx.bezierCurveTo(W * 0.35, H * 0.52, W * 0.62, H * 0.8, W, H * 0.62);
  ctx.lineTo(W, H * 0.72); ctx.bezierCurveTo(W * 0.62, H * 0.9, W * 0.35, H * 0.62, 0, H * 0.76);
  ctx.closePath(); ctx.fill();
  for (const [u, v, r] of [[0.14, 0.14, 0.05], [0.84, 0.1, 0.035], [0.78, 0.9, 0.045], [0.2, 0.9, 0.03], [0.88, 0.34, 0.025]]) ring(ctx, u * W, v * H, r * W, 2, '#fbf7ee');
  verticalText(ctx, '汽水', W / 2, H * 0.33, W * 0.3, H * 0.44, FONTS.round, '#fbf7ee');
});

def('soda_can', {
  name: '易拉罐',
  cat: 'daily',
  sfx: 'metal',
  fill: 0.78,
  tints: [0xd8342c, 0x2f63c9, 0x3a8f5c, 0xf2a14a, 0x8a5ad0],
  build(m) {
    const prof = [[0, 0.004], [0.026, 0.0012], [0.0295, 0], [0.033, 0.005], [0.033, 0.106], [0.0272, 0.1175], [0.0272, 0.1212], [0.0258, 0.1212], [0.025, 0.1195], [0, 0.1195]];
    emit(m, lathe(prof, 12, Math.PI / 12), t => (t.i === 3 ? [0xffffff, 1] : [t.i === 8 ? 0xb8bcc2 : 0xcfd3d8, 0]));
    for (let k = 0; k < 3; k++) facetDecal(m, 0.0166, 0.066, 'sm_can_' + k, prof[3], prof[4], k - 1, 12);
    m.box(0.011, 0.0009, 0.019, 0xb8bcc2, 0, 0.1204, 0.004);
    m.decal(0.005, 0.0038, 'sm_keyhole', 0, 0.1210, 0.0095, -90 * D, 0, 0);
  },
});

// ---- 茶杯: blue-and-white porcelain cup with tea -------------------------------------------------------
decal('sm_qh_flower', 40, 48, (ctx, w, h) => {
  const b = '#2c4f9e';
  ctx.strokeStyle = b; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(w * 0.5, h * 0.95); ctx.bezierCurveTo(w * 0.3, h * 0.7, w * 0.7, h * 0.6, w * 0.5, h * 0.42); ctx.stroke();
  for (let k = 0; k < 5; k++) { const a = -Math.PI / 2 + (k / 5) * TAU; circle(ctx, w * 0.5 + Math.cos(a) * w * 0.17, h * 0.32 + Math.sin(a) * w * 0.17, w * 0.12, b); }
  circle(ctx, w * 0.5, h * 0.32, w * 0.08, '#f6f3ee');
  ctx.fillStyle = b;
  for (const s of [-1, 1]) { ctx.beginPath(); ctx.ellipse(w * (0.5 + 0.18 * s), h * 0.72, w * 0.14, h * 0.05, s * 0.5, 0, TAU); ctx.fill(); }
});
decal('sm_qh_scroll', 40, 48, (ctx, w, h) => {
  ctx.strokeStyle = '#2c4f9e'; ctx.lineWidth = 3; ctx.lineCap = 'round';
  ctx.beginPath();
  for (let k = 0; k <= 40; k++) { const a = k * 0.28, r = w * (0.36 - k * 0.0085); ctx.lineTo(w / 2 + Math.cos(a) * r, h / 2 + Math.sin(a) * r); }
  ctx.stroke();
});

def('tea_cup', {
  name: '茶杯',
  cat: 'daily',
  sfx: 'glass',
  fill: 0.5,
  build(m) {
    const prof = [[0, 0.002], [0.015, 0], [0.017, 0.005], [0.027, 0.013], [0.034, 0.038], [0.0352, 0.045], [0.0337, 0.0465], [0.0322, 0.0445], [0.028, 0.026], [0.018, 0.013], [0, 0.0095]];
    const blue = 0x2c4f9e, white = 0xf6f3ee;
    emit(m, lathe(prof, 12, Math.PI / 12), t => (t.i === 1 || t.i === 4 || t.i === 5 ? blue : white));
    for (let k = 0; k < 12; k += 2) facetDecal(m, 0.0142, 0.0205, k % 4 ? 'sm_qh_scroll' : 'sm_qh_flower', prof[3], prof[4], k, 12);
    m.cyl(0.0282, 0.0282, 0.0006, 0xc8943a, 0, 0.032, 0, 0, Math.PI / 12, 0, 12);
  },
});

// ---- 搪瓷缸: white enamel, red rim, red 奖 with a star, a chip near the rim ---------------------------
sliced('sm_mug_', 3, 32, 96, (ctx, W, H) => {
  const red = '#c8202a';
  ctx.fillStyle = red;
  ctx.beginPath();
  for (let k = 0; k < 10; k++) { const a = -Math.PI / 2 + (k / 10) * TAU, r = k % 2 ? W * 0.045 : W * 0.11; ctx.lineTo(W / 2 + Math.cos(a) * r, H * 0.16 + Math.sin(a) * r); }
  ctx.fill();
  fitText(ctx, '奖', W / 2, H * 0.6, W * 0.6, H * 0.54, FONTS.serif, red);
  ctx.strokeStyle = red; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(W / 2, H * 0.5, W * 0.4, 0.25 * Math.PI, 0.75 * Math.PI); ctx.stroke();
});
decal('sm_chip', 16, 16, (ctx, w, h) => {
  ctx.fillStyle = '#2f3a52';
  ctx.beginPath(); ctx.moveTo(3, 5); ctx.lineTo(9, 2); ctx.lineTo(14, 7); ctx.lineTo(11, 13); ctx.lineTo(5, 12); ctx.closePath(); ctx.fill();
});

def('enamel_mug', {
  name: '搪瓷缸',
  cat: 'daily',
  sfx: 'metal',
  fill: 0.55,
  build(m) {
    const seg = 14, white = 0xf4f2ec, red = 0xd8342c;
    const prof = [[0, 0], [0.0405, 0], [0.042, 0.003], [0.042, 0.091], [0.0438, 0.0935], [0.0425, 0.0965], [0.0402, 0.094], [0.0402, 0.006], [0, 0.006]];
    emit(m, lathe(prof, seg, Math.PI / seg), t => (t.i === 1 || (t.i >= 3 && t.i <= 5) ? red : t.i === 0 ? 0xd9d6ce : white));
    for (let k = 0; k < 3; k++) facetDecal(m, 0.0186, 0.056, 'sm_mug_' + k, prof[2], prof[3], k - 1, seg, 0.0003, 0.52);
    facetDecal(m, 0.005, 0.005, 'sm_chip', prof[2], prof[3], 4, seg, 0.0003, 0.93);
    // flat strip handle on +x
    const H = [[0.041, 0.082, 0], [0.058, 0.081, 0], [0.065, 0.066, 0], [0.062, 0.04, 0], [0.041, 0.03, 0]];
    for (let k = 0; k < 4; k++) beam(m, H[k], H[k + 1], 0.0032, 0.013, white, [0, 0, 1]);
  },
});

// ---- 拖鞋: tinted slide slipper, one wide strap over the toes -------------------------------------------
decal('sm_flower', 32, 32, (ctx, w, h) => {
  for (let k = 0; k < 5; k++) { const a = -Math.PI / 2 + (k / 5) * TAU; circle(ctx, w / 2 + Math.cos(a) * w * 0.24, h / 2 + Math.sin(a) * w * 0.24, w * 0.19, '#fbf7ee'); }
  circle(ctx, w / 2, h / 2, w * 0.14, '#f2c14e');
});

def('slipper', {
  name: '拖鞋',
  cat: 'daily',
  sfx: 'soft',
  fill: 0.35,
  tints: [0x5aa9e6, 0xf08fb0, 0x5cae4f, 0xf2c14e, 0x2c3e66],
  build(m) {
    const zs = [-0.115, -0.09, -0.05, -0.01, 0.03, 0.07, 0.1, 0.118], hw = [0.024, 0.034, 0.034, 0.031, 0.038, 0.045, 0.043, 0.03];
    const outline = [[0, -0.125], ...zs.map((z, i) => [hw[i], z]), [0, 0.125], ...zs.map((z, i) => [-hw[i], z]).reverse()];
    const Ts = 0.016, bv = 0.0025;
    const g = new THREE.ExtrudeGeometry(new THREE.Shape(outline.map(([x, y]) => new THREE.Vector2(x, y))),
      { depth: Ts - 2 * bv, bevelEnabled: true, bevelThickness: bv, bevelSize: bv, bevelSegments: 1, curveSegments: 4 });
    const sole = xform(soup(g), new THREE.Matrix4().makeTranslation(0, Ts - bv, 0).multiply(rotM(90 * D, 0, 0)));
    m.tint();
    emit(m, sole, t => { const n = nrm(t)[1]; return n > 0.7 ? 0xeeeeee : n < -0.7 ? 0xb4b4b4 : 0xd2d2d2; });
    // strap: an arch (outer / inner half-ellipse) extruded along z over the forefoot
    const arch = [];
    for (let k = 0; k <= 6; k++) { const a = (k / 6) * Math.PI; arch.push([Math.cos(a) * 0.047, Math.sin(a) * 0.045]); }
    for (let k = 6; k >= 0; k--) { const a = (k / 6) * Math.PI; arch.push([Math.cos(a) * 0.0405, Math.sin(a) * 0.0385]); }
    m.extrude(arch, 0.072, 0xffffff, 0, Ts - 0.002, 0.042);
    m.tint(0);
    m.decal(0.03, 0.03, 'sm_flower', 0, Ts - 0.002 + 0.0453, 0.045, -90 * D, 0, 0);
  },
});

// ---- 筷子: a pair, red lacquered tops, natural wood ------------------------------------------------------
def('chopsticks', {
  name: '筷子',
  cat: 'daily',
  sfx: 'wood',
  fill: 0.15,
  build(m) {
    const q = Math.SQRT2, yc = 0.0034;
    const rings = [ringX(-0.12, 0.0034 * q, 0.0034 * q, yc, 4, 45 * D), ringX(-0.064, 0.0028 * q, 0.0028 * q, yc, 4, 45 * D), ringX(0.12, 0.0015 * q, 0.0015 * q, yc, 4, 45 * D)];
    const T = loft(rings);
    for (const [z, yaw] of [[0.0065, 1.5 * D], [-0.0065, -2.5 * D]]) {
      m.push(0, 0, z, 0, yaw, 0);
      emit(m, T, t => (t.cap === 1 || (t.i === 0 && !t.cap) ? 0xb8322a : 0xdcb680));
      m.pop();
    }
  },
});

// ---- 手机: face up, glowing home screen ------------------------------------------------------------------
decal('sm_phone', 64, 128, (ctx, w, h) => {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#6fb7ff'); g.addColorStop(1, '#f5a6c8');
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  circle(ctx, w / 2, h * 0.035, w * 0.035, '#1b1c20');
  fitText(ctx, '12:00', w / 2, h * 0.14, w * 0.62, h * 0.08, FONTS.sans, '#ffffff');
  const cols = ['#f2c14e', '#5cae4f', '#e8554a', '#ffffff', '#a27fd6', '#f2a14a', '#2aa198', '#f08fb0'];
  for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) rrect(ctx, w * (0.1 + c * 0.215), h * (0.27 + r * 0.12), w * 0.15, w * 0.15, 3, cols[(r * 4 + c * 3) % 8]);
  rrect(ctx, w * 0.06, h * 0.84, w * 0.88, h * 0.1, 6, 'rgba(255,255,255,0.45)');
  for (let c = 0; c < 4; c++) rrect(ctx, w * (0.12 + c * 0.205), h * 0.86, w * 0.14, w * 0.14, 3, cols[(c * 5 + 1) % 8]);
});

def('phone', {
  name: '手机',
  cat: 'daily',
  sfx: 'hard',
  fill: 0.9,
  build(m) {
    const W = 0.072, T = 0.0085, L = 0.15;
    m.rbox(W, T, L, 0.0035, 0x2b2d33, 0, T / 2, 0);
    m.glow(1);
    m.decal(W - 0.006, L - 0.008, 'sm_phone', 0, T + 0.0002, 0, -90 * D, 0, 0);
    m.glow(0);
    m.box(0.0014, 0.003, 0.016, 0x4a4e58, W / 2, T / 2, -0.028);
    m.box(0.0014, 0.003, 0.009, 0x4a4e58, -W / 2, T / 2, -0.034);
  },
});

// ---- 遥控器 (face up, IR end towards +z) ----------------------------------------------------------------
decal('sm_remote', 44, 160, (ctx, w, h) => {
  circle(ctx, w / 2, h * 0.3, w * 0.3, '#5a5e68');
  circle(ctx, w / 2, h * 0.3, w * 0.13, '#8a8f99');
  ctx.fillStyle = '#d6d9de';
  for (const [dx, dy, a] of [[0, -1, 0], [1, 0, 1], [0, 1, 2], [-1, 0, 3]]) {
    ctx.save(); ctx.translate(w / 2 + dx * w * 0.215, h * 0.3 + dy * w * 0.215); ctx.rotate((a * Math.PI) / 2);
    ctx.beginPath(); ctx.moveTo(0, -3); ctx.lineTo(3, 2); ctx.lineTo(-3, 2); ctx.closePath(); ctx.fill(); ctx.restore();
  }
  const nums = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', ''];
  for (let k = 0; k < 12; k++) {
    const x = w * (0.2 + (k % 3) * 0.3), y = h * (0.5 + Math.floor(k / 3) * 0.085);
    if (!nums[k]) continue;
    rrect(ctx, x - w * 0.12, y - h * 0.03, w * 0.24, h * 0.06, 3, '#c9ccd2');
    fitText(ctx, nums[k], x, y, w * 0.2, h * 0.045, FONTS.sans, '#2b2d33');
  }
  ['#d8342c', '#3a9f5c', '#f2c14e', '#2f63c9'].forEach((c, k) => rrect(ctx, w * (0.1 + k * 0.215), h * 0.87, w * 0.16, h * 0.04, 2, c));
});

def('remote', {
  name: '遥控器',
  cat: 'daily',
  sfx: 'hard',
  fill: 0.85,
  build(m) {
    const W = 0.05, T = 0.02, L = 0.18;
    m.rbox(W, T, L, 0.007, 0x3a3d45, 0, T / 2, 0);
    m.decal(W * 0.88, L * 0.89, 'sm_remote', 0, T + 0.0002, 0, -90 * D, 0, Math.PI);
    m.cyl(0.0042, 0.0045, 0.003, 0xd8342c, -0.011, T + 0.001, 0.071, 0, 0, 0, 8);
    m.box(0.012, 0.004, 0.004, 0x2a1d17, 0, T * 0.55, L / 2 - 0.0005);
  },
});

// ---- 书: closed book lying flat, tinted cover, 语文 textbook label ---------------------------------------
decal('sm_pages', 64, 16, (ctx, w, h) => {
  ctx.fillStyle = '#f4ecd6'; ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#d6cbb0';
  for (let y = 1; y < h; y += 3) ctx.fillRect(0, y, w, 1);
});
decal('sm_book', 64, 88, (ctx, w, h) => {
  rrect(ctx, w * 0.1, h * 0.1, w * 0.8, h * 0.38, 4, '#fbf7ee');
  fitText(ctx, '语文', w / 2, h * 0.26, w * 0.62, h * 0.2, FONTS.brush, '#26262c');
  fitText(ctx, '三年级 上册', w / 2, h * 0.41, w * 0.6, h * 0.07, FONTS.sans, '#6d6457');
  circle(ctx, w * 0.72, h * 0.64, w * 0.1, '#fbf7ee');
  ctx.fillStyle = '#fbf7ee';
  ctx.beginPath(); ctx.moveTo(w * 0.1, h * 0.9); ctx.quadraticCurveTo(w * 0.35, h * 0.62, w * 0.6, h * 0.9); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.moveTo(w * 0.42, h * 0.9); ctx.quadraticCurveTo(w * 0.68, h * 0.72, w * 0.9, h * 0.9); ctx.closePath(); ctx.fill();
});

def('book', {
  name: '书',
  cat: 'daily',
  sfx: 'paper',
  fill: 0.95,
  tints: [0xd8342c, 0x2f63c9, 0x3a8f5c, 0xf2a14a, 0x8a5ad0],
  build(m) {
    const W = 0.155, L = 0.22, T = 0.025, c = 0.0025;
    m.tbox(W - 0.008, T - 2 * c, L - 0.008, 0xf4ecd6, { px: 'sm_pages', pz: 'sm_pages', nz: 'sm_pages' }, 0.001, T / 2, 0);
    m.tint();
    m.box(W, c, L, 0xffffff, 0, c / 2, 0);
    m.box(W, c, L, 0xffffff, 0, T - c / 2, 0);
    m.box(0.005, T, L, 0xe6e6e6, -W / 2 + 0.0025, T / 2, 0);
    m.tint(0);
    m.decal(0.11, 0.151, 'sm_book', 0.004, T + 0.0003, 0, -90 * D, 0, 0);
  },
});

// ---- 红包: slightly puffy red envelope, gold 福 ------------------------------------------------------------
decal('sm_hongbao', 64, 120, (ctx, w, h) => {
  const gold = '#f2c14e';
  ctx.fillStyle = '#d21f26'; ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#b8161d';
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(w, 0); ctx.lineTo(w, h * 0.2); ctx.quadraticCurveTo(w / 2, h * 0.36, 0, h * 0.2); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = gold; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(0, h * 0.2); ctx.quadraticCurveTo(w / 2, h * 0.36, w, h * 0.2); ctx.stroke();
  ctx.strokeRect(4, 4, w - 8, h - 8);
  circle(ctx, w / 2, h * 0.6, w * 0.3, gold);
  circle(ctx, w / 2, h * 0.6, w * 0.26, '#d21f26');
  fitText(ctx, '福', w / 2, h * 0.6, w * 0.42, w * 0.42, FONTS.brush, gold);
});

def('red_envelope', {
  name: '红包',
  cat: 'daily',
  sfx: 'paper',
  fill: 0.9,
  build(m) {
    const W = 0.09, T = 0.004, L = 0.17;
    m.box(W, T, L, 0xd21f26, 0, T / 2, 0);
    m.decal(W, L, 'sm_hongbao', 0, T + 0.0002, 0, -90 * D, 0, 0);
  },
});

// ---- 小黄鸭 ----------------------------------------------------------------------------------------------
decal('sm_duck_eye', 16, 20, (ctx, w, h) => {
  ctx.fillStyle = '#2a1d17'; ctx.beginPath(); ctx.ellipse(w / 2, h / 2, w * 0.42, h * 0.44, 0, 0, TAU); ctx.fill();
  circle(ctx, w * 0.62, h * 0.34, w * 0.14, '#ffffff');
});
decal('sm_blush', 16, 12, (ctx, w, h) => { ctx.fillStyle = '#f6a0a6'; ctx.beginPath(); ctx.ellipse(w / 2, h / 2, w * 0.46, h * 0.4, 0, 0, TAU); ctx.fill(); });

def('rubber_duck', {
  name: '小黄鸭',
  cat: 'toy',
  sfx: 'quack',
  fill: 0.5,
  build(m) {
    const yel = 0xf7d23e, wing = 0xefbf2c, beak = 0xf2862a;
    m.ellipsoid(0.042, 0.03, 0.05, yel, 0, 0.03, -0.006, 0, 0, 0, 8);
    m.cone(0.014, 0.03, yel, 0, 0.05, -0.05, -48 * D, 0, 0, 5);
    const hc = [0, 0.074, 0.02], hr = 0.027;
    m.sphere(hr, yel, hc[0], hc[1], hc[2], 1, 1, 1, 0, 0, 0, 8);
    m.ellipsoid(0.013, 0.0055, 0.014, beak, 0, 0.068, 0.047, -0.1, 0, 0, 6);
    m.sym(s => {
      m.ellipsoid(0.008, 0.017, 0.026, wing, s * 0.039, 0.036, -0.01, 0.25, 0, s * -0.25, 5);
      const e = [s * 0.42, 0.34, 0.84], l = Math.hypot(...e), en = e.map(x => x / l);
      stick(m, 0.0075, 0.0095, 'sm_duck_eye', hc.map((x, i) => x + en[i] * hr), en, 0, 0.0004);
      const b = [s * 0.62, -0.05, 0.78], bl = Math.hypot(...b), bn = b.map(x => x / bl);
      stick(m, 0.009, 0.0068, 'sm_blush', hc.map((x, i) => x + bn[i] * hr), bn, 0, 0.0004);
    });
  },
});

// ---- 仙人掌 (potted, ribbed column with one arm and a pink flower) ------------------------------------------
decal('sm_spines', 16, 16, (ctx, w, h) => {
  ctx.strokeStyle = '#fbf7ee'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(3, 3); ctx.lineTo(13, 13); ctx.moveTo(13, 3); ctx.lineTo(3, 13); ctx.stroke();
});
decal('sm_flower_pink', 32, 32, (ctx, w, h) => {
  for (let k = 0; k < 6; k++) { const a = (k / 6) * TAU; circle(ctx, w / 2 + Math.cos(a) * w * 0.25, h / 2 + Math.sin(a) * w * 0.25, w * 0.2, '#f07aa6'); }
  circle(ctx, w / 2, h / 2, w * 0.15, '#f2d45e');
});

def('cactus', {
  name: '仙人掌',
  cat: 'plant',
  sfx: 'hard',
  fill: 0.4,
  build(m) {
    const pot = [[0, 0], [0.026, 0], [0.033, 0.047], [0.037, 0.048], [0.037, 0.058], [0.032, 0.058], [0.031, 0.054], [0, 0.054]];
    const potCols = [0x9e4f2a, 0xc8693a, 0xd87a48, 0xd87a48, 0xd87a48, 0xa8552e, 0x5a3e2a];
    emit(m, lathe(pot, 10), t => potCols[t.i]);
    const rib = (k, a) => (k % 2 ? 0.8 : 1);
    const col = [[0.052, 0.016], [0.074, 0.019], [0.108, 0.018], [0.128, 0.0145]];
    const rings = col.map(([y, r]) => { const out = []; for (let k = 0; k < 16; k++) { const a = (k / 16) * TAU, q = rib(k); out.push([Math.sin(a) * r * q, y, Math.cos(a) * r * q]); } return out; });
    const body = loft(rings, { start: null, end: [0, 0.141, 0] });
    emit(m, body, t => (t.j % 2 ? 0x4f9a45 : 0x5cae4f));
    const arm = pathRings([[0.012, 0.084, 0], [0.029, 0.088, 0], [0.037, 0.1, 0], [0.038, 0.114, 0]], [0.0085, 0.0085, 0.0085, 0.008], 8, { up: [0, 0, 1], f: k => (k % 2 ? 0.82 : 1) });
    emit(m, loft(arm, { start: null, end: [0.038, 0.1215, 0] }), t => (t.j % 2 ? 0x4f9a45 : 0x5cae4f));
    for (const k of [1, 5, 9, 13, 17, 21, 25, 29]) { const f = body[32 + k]; if (f) stick(m, 0.004, 0.004, 'sm_spines', cen(f), nrm(f), 0, 0.0003); }
    m.decal(0.017, 0.017, 'sm_flower_pink', 0, 0.1415, 0.0005, -80 * D, 0, 0, 0xffffff, true);
  },
});

// ---- 大蒜: lobed white bulb with purple streaks and a pointed papery neck ----------------------------------
def('garlic', {
  name: '大蒜',
  cat: 'food',
  sfx: 'squish',
  fill: 0.5,
  build(m) {
    const lv = [[0, 0.012, 1], [0.008, 0.022, 0.9], [0.02, 0.026, 0.88], [0.032, 0.021, 0.9], [0.041, 0.01, 0.95], [0.047, 0.0038, 1]];
    const rings = lv.map(([y, r, q]) => { const out = []; for (let k = 0; k < 16; k++) { const a = (k / 16) * TAU, s = k % 2 ? q : 1; out.push([Math.sin(a) * r * s, y, Math.cos(a) * r * s]); } return out; });
    emit(m, loft(rings, { start: 'flat', end: [0.001, 0.056, 0] }), t =>
      (t.cap === 1 ? 0xc9b08a : t.i >= 4 || t.cap === 2 ? 0xe9dfc9 : t.i <= 1 && t.j % 4 === 1 ? 0xcfa3cc : t.j % 2 ? 0xf0e9dc : 0xf6f1e6));
  },
});

// ---- 西红柿 ------------------------------------------------------------------------------------------------
def('tomato', {
  name: '西红柿',
  cat: 'food',
  sfx: 'squish',
  fill: 0.55,
  build(m) {
    const lv = [[0.0005, 0.018], [0.009, 0.034], [0.025, 0.0405], [0.041, 0.037], [0.051, 0.024], [0.0535, 0.008]];
    const rings = lv.map(([y, r]) => { const out = []; for (let k = 0; k < 12; k++) { const a = (k / 12) * TAU, q = k % 2 ? 0.95 : 1.02; out.push([Math.sin(a) * r * q, y, Math.cos(a) * r * q]); } return out; });
    emit(m, loft(rings, { start: 'flat', end: [0, 0.0515, 0] }), t => vary(m, t.i >= 3 ? 0xe03c2c : 0xd8342c, 0.05));
    const star = [];
    for (let k = 0; k < 12; k++) { const a = (k / 12) * TAU, r = k % 2 ? 0.004 : 0.016; star.push([Math.cos(a) * r, Math.sin(a) * r]); }
    m.extrude(star, 0.0022, 0x4f8f3a, 0, 0.0535, 0, 90 * D, 0.2, 0);
    m.cyl(0.0022, 0.0028, 0.008, 0x5a7a2a, 0, 0.058, 0, 0, 0, 0.15, 5);
  },
});

// ---- 香蕉: a bunch of three, pentagonal ridged fingers fanned from one crown -------------------------------
def('banana', {
  name: '香蕉',
  cat: 'food',
  sfx: 'squish',
  fill: 0.3,
  build(m) {
    const finger = (yaw, lift, bendK) => {
      const path = [], rad = [0.0045, 0.011, 0.0155, 0.0162, 0.0138, 0.0075];
      for (let i = 0; i < 6; i++) {
        const t = i / 5, x = -0.075 + t * 0.155;
        path.push([x, rad[i] + 0.0004 + lift, bendK * 0.05 * Math.pow(t, 1.6)]);
      }
      const rings = pathRings(path, rad, 5, { phase: -Math.PI / 2 });
      const T = loft(rings, { start: [-0.084, rad[0] + lift, 0], end: [0.087, rad[5] + lift + 0.0015, bendK * 0.052] });
      return xform(T, new THREE.Matrix4().makeTranslation(-0.075, 0, 0).multiply(rotM(0, yaw, 0)).multiply(new THREE.Matrix4().makeTranslation(0.075, 0, 0)));
    };
    const T = [...finger(13 * D, 0, 1), ...finger(0, 0.011, 1), ...finger(-13 * D, 0, 1)];
    m.push(0, -minY(T), -0.022);
    emit(m, T, t => (t.cap === 1 || t.i === 0 ? 0x9ab83a : t.cap === 2 ? 0x5a4020 : t.j % 2 ? 0xf2d24a : 0xe9c43a));
    rod(m, [-0.098, 0.016, 0.001], [-0.074, 0.014, 0.002], 0.006, 0.007, 0x7a8a3a, 5);
    m.pop();
  },
});

// ---- 毽子: rubber base, copper cash coin, colourful feather plume -------------------------------------------
decal('sm_cash', 40, 40, (ctx, w, h) => {
  circle(ctx, w / 2, h / 2, w * 0.47, '#c9a24a');
  ring(ctx, w / 2, h / 2, w * 0.43, 2, '#8a6a2a');
  ctx.fillStyle = '#3a2a1a'; ctx.fillRect(w * 0.38, h * 0.38, w * 0.24, h * 0.24);
  ctx.strokeStyle = '#8a6a2a'; ctx.lineWidth = 2; ctx.strokeRect(w * 0.34, h * 0.34, w * 0.32, h * 0.32);
  for (const [x, y, ch] of [[0.5, 0.18, '通'], [0.5, 0.83, '宝'], [0.18, 0.5, '天'], [0.82, 0.5, '下']]) fitText(ctx, ch, w * x, h * y, w * 0.2, h * 0.2, FONTS.serif, '#6b4a1a');
});
decal('sm_feather', 24, 64, (ctx, w, h) => {
  ctx.fillStyle = '#ffffff';
  ctx.beginPath(); ctx.moveTo(w / 2, h); ctx.bezierCurveTo(-w * 0.1, h * 0.55, w * 0.1, h * 0.05, w / 2, 0); ctx.bezierCurveTo(w * 0.9, h * 0.05, w * 1.1, h * 0.55, w / 2, h); ctx.fill();
  ctx.strokeStyle = '#c9c9c9'; ctx.lineWidth = 1;
  for (let k = 1; k < 8; k++) { const y = h * (k / 9); ctx.beginPath(); ctx.moveTo(w / 2, y + 6); ctx.lineTo(w * 0.15, y); ctx.moveTo(w / 2, y + 6); ctx.lineTo(w * 0.85, y); ctx.stroke(); }
  ctx.strokeStyle = '#9a9a9a'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(w / 2, h); ctx.lineTo(w / 2, h * 0.06); ctx.stroke();
});

def('shuttlecock', {
  name: '毽子',
  cat: 'toy',
  sfx: 'soft',
  fill: 0.25,
  build(m) {
    m.cyl(0.0175, 0.0185, 0.008, 0xb03a2e, 0, 0.004, 0, 0, 0, 0, 10);
    m.cyl(0.0125, 0.0125, 0.002, 0xc9a24a, 0, 0.009, 0, 0, 0, 0, 10);
    m.decal(0.0238, 0.0238, 'sm_cash', 0, 0.0102, 0, -90 * D, 0, 0);
    m.cyl(0.0042, 0.005, 0.02, 0xd8342c, 0, 0.02, 0, 0, 0, 0, 6);
    const cols = [0xe8554a, 0xf2a14a, 0xf2d45e, 0x5cae4f, 0x2aa198, 0x5aa9e6, 0x8a5ad0, 0xf08fb0];
    for (let k = 0; k < 8; k++) {
      m.push(0, 0.027, 0, 0, (k / 8) * TAU, 0);
      const h = 0.094, tilt = 24 * D;
      m.decal(0.026, h, 'sm_feather', 0, 0.0 + Math.cos(tilt) * h / 2, 0.002 + Math.sin(tilt) * h / 2, tilt, 0, 0, cols[k], true);
      m.pop();
    }
  },
});

// ---- 陀螺: painted wooden whip top with a steel tip, caught mid-spin (leaning) -------------------------------
def('spinning_top', {
  name: '陀螺',
  cat: 'toy',
  sfx: 'wood',
  fill: 0.45,
  build(m) {
    const prof = [[0, 0], [0.0032, 0.0014], [0.0042, 0.005], [0.006, 0.0082], [0.03, 0.04], [0.036, 0.0505], [0.036, 0.0575], [0.032, 0.0625],
      [0.024, 0.0635], [0.016, 0.0635], [0.0085, 0.0635], [0.005, 0.066], [0.005, 0.0715], [0, 0.0715]];
    const red = 0xd8342c, yel = 0xf2c14e, grn = 0x3f9a4f, blu = 0x2f63c9, wood = 0xe0b98a, steel = 0xb8bcc2;
    const band = [steel, steel, wood, null, red, grn, yel, red, yel, blu, red, red, red];
    m.push(0, 0, 0, 0, 0, 8 * D, 1.1);
    emit(m, lathe(prof, 12), t => band[t.i] ?? (t.j % 2 ? red : yel));
    m.pop();
  },
});

// ---- 折扇: open folding fan lying flat, pleated red paper with gold border and plum blossoms -------------
decal('sm_plum', 24, 72, (ctx, w, h) => {
  const gold = '#f2c14e';
  ctx.strokeStyle = gold; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(w * 0.3, h * 0.95); ctx.quadraticCurveTo(w * 0.75, h * 0.6, w * 0.4, h * 0.1); ctx.stroke();
  for (const [u, v] of [[0.55, 0.28], [0.38, 0.56], [0.62, 0.78]]) {
    for (let k = 0; k < 5; k++) { const a = (k / 5) * TAU; circle(ctx, w * u + Math.cos(a) * w * 0.14, h * v + Math.sin(a) * w * 0.14, w * 0.12, gold); }
    circle(ctx, w * u, h * v, w * 0.07, '#c8202a');
  }
});

def('folding_fan', {
  name: '折扇',
  cat: 'daily',
  sfx: 'paper',
  fill: 0.2,
  build(m) {
    const n = 16, A = 150 * D, pz = -0.085, lift = 0.003, k = 0.052;
    const r0 = 0.07, rs = [0.07, 0.078, 0.143, 0.155];
    const dir = i => { const a = -A / 2 + (i / n) * A; return [Math.sin(a), Math.cos(a)]; };
    const P = (i, r) => { const [sx, cz] = dir(i); return [sx * r, lift + (i % 2 ? k * r : 0), pz + cz * r]; };
    const T = [];
    for (let i = 0; i < n; i++) for (let b = 0; b < 3; b++) {
      const a = P(i, rs[b]), c = P(i + 1, rs[b]), d = P(i + 1, rs[b + 1]), e = P(i, rs[b + 1]);
      const col = b === 1 ? (i % 2 ? 0xc8202a : 0xb81c26) : 0xe0b040;
      for (const [x, y, z] of [[a, d, c], [a, e, d]]) { T.push({ a: x, b: y, c: z, col }); T.push({ a: x, b: z, c: y, col: shade(col, 0.8) }); }
    }
    emit(m, T, t => t.col);
    // gold plum blossoms on every other panel (panels are planar: ridge and valley meet at the pivot)
    for (let i = 0; i < n; i += 2) {
      const a = P(i + 1, 0.11), b = P(i, 0.11), c = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
      const rad = sub(P(i, 0.13), P(i, 0.09)), nn = cross(sub(a, b), rad);
      stickUp(m, 0.012, 0.046, 'sm_plum', c, nn[1] > 0 ? nn : nn.map(x => -x), rad, 0.0004);
    }
    // ribs below the paper: a thin wooden sector with alternating stripes, two dark guard sticks, the rivet
    const R = [];
    for (let i = 0; i <= n; i++) { const [sx, cz] = dir(i); R.push([sx * r0, 0.0022, pz + cz * r0]); }
    const piv = [0, 0.0022, pz], rib = [];
    for (let i = 0; i < n; i++) { rib.push({ a: piv, b: R[i + 1], c: R[i], col: i % 2 ? 0xd9b77a : 0xc49a5c }); rib.push({ a: piv, b: R[i], c: R[i + 1], col: 0xb08a50 }); }
    emit(m, rib, t => t.col);
    for (const i of [0, n]) { const [sx, cz] = dir(i); beam(m, [sx * 0.004, 0.0025, pz + cz * 0.004 - 0.006], [sx * 0.158, 0.0025, pz + cz * 0.158], 0.006, 0.005, 0x6b2a1a); }
    m.cyl(0.0045, 0.0045, 0.007, 0xe0b040, 0, 0.0035, pz, 0, 0, 0, 6);
  },
});

// ---- 蒲扇: palm-leaf fan with radiating veins, bound rim and a short handle --------------------------------
const PALM_R = t => 0.118 * (1 - 0.3 * Math.pow(Math.max(0, -Math.sin(t)), 3));
const palmPts = () => { const out = []; for (let k = 0; k < 18; k++) { const t = -Math.PI / 2 + ((k + 0.5) / 18) * TAU; out.push([Math.cos(t) * PALM_R(t), Math.sin(t) * PALM_R(t) * 0.96]); } return out; };
decal('sm_palm', 128, 128, (ctx, w, h) => {
  const S = w / 0.25, cx = w / 2, cy = h / 2, pts = palmPts().map(([x, y]) => [cx + x * S, cy + y * S]);
  ctx.save();
  ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.closePath(); ctx.clip();
  ctx.fillStyle = '#e2cb8c'; ctx.fillRect(0, 0, w, h);
  const bx = cx, by = cy - 0.1 * S;
  ctx.strokeStyle = '#c4a45e'; ctx.lineWidth = 1.5;
  for (let k = 0; k <= 26; k++) { const a = Math.PI * (0.05 + (0.9 * k) / 26); ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(bx - Math.cos(a) * w, by + Math.sin(a) * w); ctx.stroke(); }
  ctx.restore();
  ctx.strokeStyle = '#8a5a2c'; ctx.lineWidth = 6;
  ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.closePath(); ctx.stroke();
});

def('palm_fan', {
  name: '蒲扇',
  cat: 'daily',
  sfx: 'paper',
  fill: 0.2,
  build(m) {
    const T = 0.003, zc = 0.062, pts = palmPts();
    // outline drawn in x / y; rx = 90° maps local y to +z, so the narrow base (y < 0) points at the handle (−z)
    m.extrude(pts, T, 0xd9c080, 0, T / 2, zc, 90 * D, 0, 0);
    m.decal(0.25, 0.25, 'sm_palm', 0, T + 0.0003, zc, -90 * D, 0, 0);
    beam(m, [0, 0.0035, zc - 0.072], [0, 0.0035, zc - 0.228], 0.013, 0.007, 0xb89a5a);
    beam(m, [0, 0.0045, zc - 0.074], [0, 0.0045, zc - 0.1], 0.016, 0.009, 0xb8322a);
  },
});

// ---- 棒棒糖: big flat rainbow swirl on a white stick, lying down ----------------------------------------------
decal('sm_swirl', 96, 96, (ctx, w, h) => {
  const cols = ['#e8554a', '#f2a14a', '#f2d45e', '#5cae4f', '#5aa9e6', '#a27fd6'];
  circle(ctx, w / 2, h / 2, w * 0.49, '#fbf3f6');
  ctx.lineCap = 'round';
  for (let c = 0; c < 6; c++) {
    ctx.strokeStyle = cols[c]; ctx.lineWidth = 6;
    ctx.beginPath();
    for (let k = 0; k <= 50; k++) { const a = k * 0.25 + (c * TAU) / 6, r = w * (0.02 + 0.0075 * k); ctx.lineTo(w / 2 + Math.cos(a) * r, h / 2 + Math.sin(a) * r); }
    ctx.stroke();
  }
});

def('lollipop', {
  name: '棒棒糖',
  cat: 'food',
  sfx: 'hard',
  fill: 0.35,
  build(m) {
    const R = 0.04, T = 0.012;
    m.cyl(R, R, T, 0xf6d9e4, 0, T / 2, 0.03, 0, 0, 0, 16);
    m.decal(R * 1.95, R * 1.95, 'sm_swirl', 0, T + 0.0003, 0.03, -90 * D, 0, 0);
    rod(m, [0, 0.006, -0.004], [0, 0.0032, -0.078], 0.0032, 0.0032, 0xf4f2ec, 5);
    m.sym(s => m.cone(0.0045, 0.012, 0xd8342c, s * 0.006, 0.006, -0.0135, 0, 0, s * 90 * D, 4));
    m.sphere(0.003, 0xd8342c, 0, 0.006, -0.0135, 1, 1, 1, 0, 0, 0, 5);
  },
});

// ---- 纸巾包: pocket tissue pack with a peel strip and a tissue poking out -------------------------------------
decal('sm_tissue', 64, 96, (ctx, w, h) => {
  ctx.fillStyle = '#bfe0f4'; ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#ffffff';
  for (const [u, v, r] of [[0.2, 0.15, 0.1], [0.3, 0.13, 0.08], [0.78, 0.86, 0.1], [0.68, 0.88, 0.07], [0.85, 0.2, 0.06]]) circle(ctx, u * w, v * h, r * w, '#ffffff');
  rrect(ctx, w * 0.3, h * 0.2, w * 0.4, h * 0.6, 8, '#f6f3ec');
  fitText(ctx, '纸巾', w / 2, h * 0.7, w * 0.3, h * 0.12, FONTS.round, '#5aa9e6');
  ctx.fillStyle = '#f08fb0';
  ctx.beginPath(); ctx.moveTo(w * 0.2, h * 0.62); ctx.bezierCurveTo(w * 0.1, h * 0.52, w * 0.2, h * 0.47, w * 0.2, h * 0.55); ctx.bezierCurveTo(w * 0.2, h * 0.47, w * 0.3, h * 0.52, w * 0.2, h * 0.62); ctx.fill();
});

def('tissue', {
  name: '纸巾包',
  cat: 'daily',
  sfx: 'soft',
  fill: 0.9,
  build(m) {
    const W = 0.075, T = 0.024, L = 0.115;
    m.rbox(W, T, L, 0.009, 0xbfe0f4, 0, T / 2, 0);
    m.decal(W - 0.012, L - 0.012, 'sm_tissue', 0, T + 0.0002, 0, -90 * D, 0, 0);
    // a crumpled tissue corner poking out of the opening
    const c = [0, T + 0.0004, -0.012], P = [[-0.012, 0.004, -0.004], [-0.004, 0.011, 0.006], [0.007, 0.008, 0.009], [0.013, 0.003, -0.002], [0.002, 0.009, -0.009]];
    const tri = [];
    for (let k = 0; k < P.length; k++) {
      const a = P[k].map((x, i) => x + c[i]), b = P[(k + 1) % P.length].map((x, i) => x + c[i]);
      tri.push({ a: c, b: a, c: b }, { a: c, b, c: a });
    }
    emit(m, tri, t => vary(m, 0xf6f5f0, 0.05));
  },
});

// ---- 冰棍: 红豆 ice pop on a wooden stick, a bite taken out of one corner ------------------------------------
const POP = (() => {
  const W = 0.026, L0 = -0.045, L1 = 0.045, rc = 0.012, out = [];
  const arc = (cx, cy, r, a0, a1, n) => { for (let k = 0; k <= n; k++) { const a = a0 + ((a1 - a0) * k) / n; out.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); } };
  arc(W - rc, L0 + rc, rc, -Math.PI / 2, 0, 2);
  out.push([W, L1 - 0.022]);
  // bite: three tooth scallops cutting the +x/+z corner
  const bite = [[W, L1 - 0.022], [W - 0.006, L1 - 0.02], [W - 0.011, L1 - 0.014], [W - 0.012, L1 - 0.008], [W - 0.017, L1 - 0.004], [W - 0.021, L1]];
  out.push(...bite.slice(1));
  arc(-W + rc, L1 - rc, rc, Math.PI / 2, Math.PI, 2);
  arc(-W + rc, L0 + rc, rc, Math.PI, 1.5 * Math.PI, 2);
  return out;
})();
decal('sm_redbean', 64, 112, (ctx, w, h) => {
  const S = w / 0.052;
  ctx.save();
  ctx.beginPath(); POP.forEach(([x, y], i) => { const px = w / 2 + x * S, py = h / 2 - y * S; i ? ctx.lineTo(px, py) : ctx.moveTo(px, py); }); ctx.closePath(); ctx.clip();
  ctx.fillStyle = '#e3aeaa'; ctx.fillRect(0, 0, w, h);
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let k = 0; k < 26; k++) { ctx.fillStyle = k % 3 ? '#8e3a36' : '#a8504a'; ctx.beginPath(); ctx.ellipse(rnd() * w, rnd() * h, 3.2, 2.2, rnd() * 3, 0, TAU); ctx.fill(); }
  ctx.restore();
});

def('ice_pop', {
  name: '冰棍',
  cat: 'food',
  sfx: 'squish',
  fill: 0.5,
  build(m) {
    const T = 0.018, zc = 0.028, g = new THREE.ExtrudeGeometry(new THREE.Shape(POP.map(([x, y]) => new THREE.Vector2(x, y))),
      { depth: T - 0.005, bevelEnabled: true, bevelThickness: 0.0025, bevelSize: 0.0025, bevelSegments: 1, curveSegments: 3 });
    // shape y → world +z, extrusion → world −y; then stand it on the ground
    const bar = xform(soup(g), new THREE.Matrix4().makeTranslation(0, T - 0.0025, zc).multiply(rotM(90 * D, 0, 0)));
    emit(m, bar, t => (nrm(t)[1] > 0.7 ? 0xe3aeaa : 0xd99e9a));
    m.decal(0.052, 0.091, 'sm_redbean', 0, T + 0.0003, zc, -90 * D, 0, 0);
    m.box(0.011, 0.0022, 0.075, 0xe0c290, 0, T / 2, zc - 0.075);
  },
});

// ---- 风车: paper pinwheel on a stick, standing up, facing +z ------------------------------------------------
def('pinwheel', {
  name: '风车',
  cat: 'toy',
  sfx: 'paper',
  fill: 0.12,
  build(m) {
    const cy = 0.235, R = 0.078, cols = [0xe8554a, 0xf2c14e, 0x5aa9e6, 0x5cae4f];
    rod(m, [0, 0, -0.006], [0, cy + 0.004, -0.006], 0.0034, 0.003, 0xd9b77a, 5);
    const T = [], c = [0, cy, 0];
    const Q = k => { const a = (k * TAU) / 4 + 45 * D; return [Math.cos(a) * R, cy + Math.sin(a) * R, 0]; };
    for (let k = 0; k < 4; k++) {
      const q0 = Q(k), q1 = Q(k + 1), mid = q0.map((x, i) => (x + q1[i]) / 2), col = cols[k];
      const curl = [c[0] + (q0[0] - c[0]) * 0.3, c[1] + (q0[1] - c[1]) * 0.3, 0.034];   // corner folded to the pin
      const bend = [(mid[0] + curl[0]) / 2 * 1.1, cy + ((mid[1] - cy) + (curl[1] - cy)) / 2 * 1.1, 0.02];
      T.push({ a: c, b: mid, c: q1, col }, { a: c, b: q1, c: mid, col: 0xf6f3ec });                         // flat half
      T.push({ a: c, b: bend, c: mid, col: shade(col, 1.15) }, { a: c, b: mid, c: bend, col: 0xf6f3ec });  // curled half
      T.push({ a: c, b: curl, c: bend, col: shade(col, 1.25) }, { a: c, b: bend, c: curl, col: 0xf6f3ec });
    }
    emit(m, T, t => t.col);
    m.sphere(0.0055, 0xf2c14e, 0, cy, 0.006, 1, 1, 1, 0, 0, 0, 5);
  },
});

// ---- 玩具车: chunky tinted toy car with a smiling face, big wheels -------------------------------------------
decal('sm_car_face', 64, 32, (ctx, w, h) => {
  for (const x of [0.22, 0.78]) { circle(ctx, w * x, h * 0.42, h * 0.3, '#fff7d6'); circle(ctx, w * x + 1, h * 0.45, h * 0.15, '#2a1d17'); }
  ctx.strokeStyle = '#2a1d17'; ctx.lineWidth = 2.5; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.arc(w / 2, h * 0.5, h * 0.24, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke();
});
decal('sm_car_win', 32, 24, (ctx, w, h) => {
  rrect(ctx, 1, 1, w - 2, h - 2, 5, '#2c4057');
  ctx.fillStyle = '#6f8fb0'; ctx.beginPath(); ctx.moveTo(w * 0.2, h - 3); ctx.lineTo(w * 0.45, 3); ctx.lineTo(w * 0.58, 3); ctx.lineTo(w * 0.33, h - 3); ctx.closePath(); ctx.fill();
});
decal('sm_hub', 24, 24, (ctx, w, h) => { circle(ctx, w / 2, h / 2, w * 0.46, '#e6e8ec'); circle(ctx, w / 2, h / 2, w * 0.16, '#9aa0a8'); });

def('toy_car', {
  name: '玩具车',
  cat: 'toy',
  sfx: 'hard',
  fill: 0.5,
  tints: [0xe8554a, 0xf2c14e, 0x5aa9e6, 0x5cae4f, 0xf08fb0],
  build(m) {
    const wr = 0.0175, W = 0.062, L = 0.12;
    m.tint();
    m.rbox(W, 0.03, L, 0.01, 0xffffff, 0, 0.012 + 0.015, 0);
    m.rbox(W * 0.84, 0.027, 0.062, 0.009, 0xffffff, 0, 0.0405 + 0.0125, -0.01);
    m.tint(0);
    const cz = -0.01, ch = 0.0535;
    m.decal(W * 0.7, 0.017, 'sm_car_win', 0, ch, cz + 0.0312);
    m.decal(W * 0.7, 0.017, 'sm_car_win', 0, ch, cz - 0.0312, 0, Math.PI, 0);
    m.sym(s => m.decal(0.046, 0.017, 'sm_car_win', s * (W * 0.42 + 0.0003), ch, cz, 0, s * 90 * D, 0));
    m.decal(W * 0.8, 0.024, 'sm_car_face', 0, 0.027, L / 2 + 0.0003);
    for (const z of [0.036, -0.036]) m.sym(s => {
      m.cyl(wr, wr, 0.013, 0x2b2b31, s * (W / 2 - 0.002), wr, z, 0, 0, 90 * D, 8);
      m.decal(0.022, 0.022, 'sm_hub', s * (W / 2 + 0.0047), wr, z, 0, s * 90 * D, 0);
    });
  },
});
