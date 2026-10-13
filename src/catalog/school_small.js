// 教室开局 (school_small): desk and floor clutter of a classroom — chalk stubs → the teacher's set square.
// Real sizes in metres, base on y = 0, front faces +Z. Decal keys use the prefix ss_.
// Tier 0 (< 5 cm) stay around 60–120 triangles; desk items stay well under 400.
import * as THREE from 'three';
import { def } from './registry.js';
import { D, shade } from '../core/modeler.js';
import { decal, fitText, FONTS, getUV } from '../core/atlas.js';

const TAU = Math.PI * 2;
const INK = 0x2a1d17, BLK = 0x26262c, WHT = 0xf4f2ec, DARK = 0x3a3d45;
const SILVER = 0xc9cdd2, RED = 0xd8342c, GOLD = 0xf2c14e, PAPER = 0xf6f3ea, WOOD = 0xe2b47c, LEAD = 0x4a4d55;

// ---- local helpers ---------------------------------------------------------------------------
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const _up = V(0, 1, 0);
/** Euler XYZ turning local +Y towards (dx, dy, dz). */
function aim(dx, dy, dz) {
  const q = new THREE.Quaternion().setFromUnitVectors(_up, V(dx, dy, dz).normalize());
  const e = new THREE.Euler().setFromQuaternion(q, 'XYZ');
  return [e.x, e.y, e.z];
}
/** Box bar (w × len × d) from point a to point b. */
function bar(m, w, d, col, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
  const [rx, ry, rz] = aim(dx, dy, dz);
  m.box(w, Math.hypot(dx, dy, dz), d, col, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2, rx, ry, rz);
}
/** Cylinder rod from point a to point b. */
function rod(m, r, col, a, b, seg = 6) {
  const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
  const [rx, ry, rz] = aim(dx, dy, dz);
  m.cyl(r, r, Math.hypot(dx, dy, dz), col, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2, rx, ry, rz, seg);
}
function geoFrom(pos) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}
const _memo = new Map();
const memo = (k, f) => { if (!_memo.has(k)) _memo.set(k, f()); return _memo.get(k); };

/**
 * Polyline sweep with corners only where the points are (cheap bent wire / flat ribbon).
 * sides 3 = wire, 4 = rectangle rw × rh (ribbon lying flat when rh is small). Open ends get caps.
 */
function wire(m, pts, rw, col, { sides = 3, rh = rw, closed = false } = {}) {
  const n = pts.length, rings = [];
  for (let i = 0; i < n; i++) {
    const a = pts[closed ? (i - 1 + n) % n : Math.max(0, i - 1)], b = pts[closed ? (i + 1) % n : Math.min(n - 1, i + 1)];
    const t = V(b[0] - a[0], b[1] - a[1], b[2] - a[2]).normalize();
    const up0 = Math.abs(t.y) > 0.9 ? V(1, 0, 0) : V(0, 1, 0);
    const side = new THREE.Vector3().crossVectors(t, up0).normalize();
    const up = new THREE.Vector3().crossVectors(side, t).normalize();
    const ring = [];
    for (let k = 0; k < sides; k++) {
      const ang = sides === 4 ? (k + 0.5) * (TAU / 4) : (k / sides) * TAU + Math.PI / 2;
      const c = Math.cos(ang) * (sides === 4 ? Math.SQRT2 : 1), s = Math.sin(ang) * (sides === 4 ? Math.SQRT2 : 1);
      ring.push([pts[i][0] + side.x * c * rw + up.x * s * rh, pts[i][1] + side.y * c * rw + up.y * s * rh, pts[i][2] + side.z * c * rw + up.z * s * rh]);
    }
    rings.push(ring);
  }
  const P = [];
  const tri = (a, b, c) => P.push(...a, ...b, ...c);
  const segs = closed ? n : n - 1;
  for (let i = 0; i < segs; i++) {
    const A = rings[i], B = rings[(i + 1) % n];
    for (let k = 0; k < sides; k++) {
      const k1 = (k + 1) % sides;
      tri(A[k], B[k], A[k1]);
      tri(A[k1], B[k], B[k1]);
    }
  }
  if (!closed) {
    for (let k = 1; k < sides - 1; k++) {
      tri(rings[0][0], rings[0][k], rings[0][k + 1]);
      tri(rings[n - 1][0], rings[n - 1][k + 1], rings[n - 1][k]);
    }
  }
  m.geo(geoFrom(P), col);
}

/** Curved label: a band of a cone/cylinder (radius rBot at the bottom, rTop at the top) centred on +Z. */
function band(m, key, rTop, rBot, h, arc, seg, x, y, z, ry = 0) {
  const g = memo(`band:${rTop}:${rBot}:${arc.toFixed(3)}:${seg}`, () => new THREE.CylinderGeometry(rTop, rBot, 1, seg, 1, true, -arc / 2, arc));
  m.geo(g, 0xffffff, x, y, z, 0, ry, 0, 1, h, 1, getUV(key));
}

/**
 * Hexagonal pencil lying along X, tip at −X, flat face down on y = 0, centred on x = 0.
 * Body colour `col` (white under m.tint() for tinted pencils). Returns the y of the top face.
 */
function pencil(m, L, col, { r = 0.0042, eraser = true, tinted = false } = {}) {
  const yc = r * Math.cos(30 * D), tip = 0.004, cone = 0.016, fer = eraser ? 0.008 : 0, er = eraser ? 0.009 : 0;
  const body = L - tip - cone - fer - er, x0 = -L / 2;
  m.cone(0.0011, tip, LEAD, x0 + tip / 2, yc, 0, 0, 0, 90 * D, 6);
  m.cyl(0.0011, r, cone, WOOD, x0 + tip + cone / 2, yc, 0, 0, 0, 90 * D, 6);
  if (tinted) m.tint();
  m.cyl(r, r, body, col, x0 + tip + cone + body / 2, yc, 0, 0, 0, 90 * D, 6);
  if (tinted) m.tint(0);
  if (eraser) {
    const xf = x0 + tip + cone + body;
    m.cyl(r * 0.94, r * 0.94, fer, SILVER, xf + fer / 2, yc, 0, 22.5 * D, 0, 90 * D, 8);
    m.cyl(r * 0.86, r * 0.9, er, 0xf29aa6, xf + fer + er / 2, yc, 0, 22.5 * D, 0, 90 * D, 8);
  }
  return 2 * yc;
}

// canvas helpers
const rrect = (ctx, x, y, w, h, r, fill) => {
  ctx.fillStyle = fill; ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x, y, w, h, r); else ctx.rect(x, y, w, h);
  ctx.fill();
};
const circle = (ctx, x, y, r, fill) => { ctx.fillStyle = fill; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); };
const tick = (ctx, x, y, s, col, lw = 3) => {
  ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(x - s, y); ctx.lineTo(x - s * 0.3, y + s * 0.7); ctx.lineTo(x + s, y - s * 0.8); ctx.stroke();
};
const cross = (ctx, x, y, s, col, lw = 3) => {
  ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(x - s, y - s); ctx.lineTo(x + s, y + s); ctx.moveTo(x + s, y - s); ctx.lineTo(x - s, y + s); ctx.stroke();
};
const leftText = (ctx, t, x, y, px, col, font = FONTS.sans) => {
  ctx.save(); ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  ctx.font = `bold ${px}px ${font}`; ctx.fillStyle = col; ctx.fillText(t, x, y); ctx.restore();
};
const pagesDecal = (key, w, h, bg, line) => decal(key, w, h, (ctx) => {
  ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = line;
  for (let y = 1; y < h; y += 2) ctx.fillRect(0, y, w, 1);
});
pagesDecal('ss_pages', 64, 16, '#f4efe2', '#d6cdb6');

// =============================================================================================
// Tier 0 (< 5 cm)
// =============================================================================================

// ---- 粉笔头: worn-down stub lying on its side, one end rounded by the blackboard, the other snapped -----
def('school_chalk_stub', {
  name: '粉笔头',
  cat: 'daily',
  sfx: 'tiny',
  fill: 0.7,
  tints: [0xf4f2ec, 0xf5a3b5, 0xf2d45e, 0x8cc8ea],
  build(m) {
    const r = 0.0052;
    m.tint();
    m.cyl(r, r, 0.014, 0xffffff, 0.001, r, 0, 0, 0, 90 * D, 8);
    m.cyl(r * 0.62, r, 0.004, 0xf0f0f0, -0.008, r, 0, 0, 0, 90 * D, 8); // worn writing end
    m.cyl(r * 0.92, r * 0.98, 0.003, 0xe6e6e6, 0.0095, r * 1.02, 0.0004, 0.25, 0, 80 * D, 8); // jagged snap
    m.tint(0);
  },
});

// ---- 卷笔刀: chubby bear, tinted body, pencil hole in its side ------------------------------------------
decal('ss_bear_face', 64, 48, (ctx, w, h) => {
  circle(ctx, w * 0.3, h * 0.36, w * 0.06, '#2a1d17');
  circle(ctx, w * 0.7, h * 0.36, w * 0.06, '#2a1d17');
  circle(ctx, w * 0.31, h * 0.33, w * 0.02, '#ffffff');
  circle(ctx, w * 0.71, h * 0.33, w * 0.02, '#ffffff');
  circle(ctx, w * 0.14, h * 0.6, w * 0.08, '#f6a3ad');
  circle(ctx, w * 0.86, h * 0.6, w * 0.08, '#f6a3ad');
});

decal('ss_bear_nose', 16, 12, (ctx, w, h) => {
  ctx.fillStyle = '#2a1d17';
  ctx.beginPath(); ctx.ellipse(w / 2, h * 0.45, w * 0.42, h * 0.38, 0, 0, TAU); ctx.fill();
});

def('school_sharpener', {
  name: '卷笔刀',
  cat: 'daily',
  sfx: 'tiny',
  fill: 0.6,
  tints: [0xf59ab8, 0x8fc8ef, 0xf2c14e, 0x9ad67a, 0xc6a2e8],
  build(m) {
    const W = 0.032, H = 0.026, Dp = 0.022;
    m.tint();
    m.box(W, H, Dp, 0xffffff, 0, H / 2, 0);
    m.sym(s => m.cyl(0.0068, 0.0068, 0.008, 0xffffff, s * 0.012, H + 0.002, -0.002, 90 * D, 0, 0, 6)); // ears
    m.tint(0);
    m.decal(W * 0.94, H * 0.7, 'ss_bear_face', 0, H * 0.6, Dp / 2 + 0.0004);
    m.ellipsoid(0.0062, 0.0045, 0.003, 0xfbe3d0, 0, H * 0.34, Dp / 2, 0, 0, 0, 5); // muzzle
    m.decal(0.004, 0.003, 'ss_bear_nose', 0, H * 0.4, Dp / 2 + 0.0031);
    // pencil hole on +X, a curl of shaving poking out
    m.disc(0.0056, SILVER, W / 2 + 0.0004, H * 0.5, 0, 0, 0, 90 * D, 6);
    m.disc(0.0036, INK, W / 2 + 0.0008, H * 0.5, 0, 0, 0, 90 * D, 6);
  },
});

// =============================================================================================
// Tier 1 (5–30 cm)
// =============================================================================================

// ---- 小纸条: folded note half open, 「放学等我」 peeking out -----------------------------------------------
decal('ss_note_in', 96, 64, (ctx, w, h) => {
  ctx.fillStyle = '#c9dcef';
  for (let y = h * 0.2; y < h; y += h * 0.2) ctx.fillRect(0, y, w, 1);
  fitText(ctx, '放学', w * 0.42, h * 0.3, w * 0.7, h * 0.36, FONTS.brush, '#2f4fae');
  fitText(ctx, '等我', w * 0.42, h * 0.7, w * 0.7, h * 0.36, FONTS.brush, '#2f4fae');
  ctx.fillStyle = '#e8554a';
  const hx = w * 0.84, hy = h * 0.5, s = w * 0.07;
  ctx.beginPath(); ctx.moveTo(hx, hy + s * 1.2);
  ctx.bezierCurveTo(hx - s * 2, hy - s * 0.2, hx - s * 0.7, hy - s * 1.6, hx, hy - s * 0.5);
  ctx.bezierCurveTo(hx + s * 0.7, hy - s * 1.6, hx + s * 2, hy - s * 0.2, hx, hy + s * 1.2);
  ctx.fill();
});
decal('ss_note_out', 48, 48, (ctx, w, h) => {
  fitText(ctx, '给', w * 0.3, h * 0.36, w * 0.4, h * 0.4, FONTS.brush, '#2f4fae');
  ctx.strokeStyle = '#2f4fae'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(w * 0.52, h * 0.52); ctx.lineTo(w * 0.86, h * 0.52); ctx.stroke();
  fitText(ctx, '保密!', w * 0.5, h * 0.78, w * 0.7, h * 0.28, FONTS.round, '#e8554a');
});

def('school_note', {
  name: '小纸条',
  cat: 'daily',
  sfx: 'paper',
  fill: 0.3,
  tints: [0xfbf2d6, 0xfcd6e2, 0xd6ecfb, 0xe2f5d2],
  build(m) {
    const W = 0.05, L = 0.032, T = 0.0006;
    m.push(0, 0, 0, 0, 0.18, 0);
    m.tint();
    m.box(W, T, L, 0xffffff, 0, T / 2, 0);
    m.tint(0);
    m.decal(W * 0.94, L * 0.92, 'ss_note_in', 0, T + 0.0003, 0.0005, -90 * D, 0, 0);
    // top leaf hinged at the back edge, lifted
    m.push(0, T, -L / 2, -24 * D, 0, 0);
    m.tint();
    m.box(W, T, L, 0xffffff, 0, T * 1.5, L / 2);
    m.tint(0);
    m.decal(W * 0.5, L * 0.72, 'ss_note_out', 0.008, T * 2 + 0.0003, L / 2, -90 * D, 0, 0);
    m.pop();
    m.pop();
  },
});

// ---- 铅笔: yellow hexagonal pencil lying on a flat, pink eraser end with chew marks ----------------------
decal('ss_pencil', 128, 12, (ctx, w, h) => {
  fitText(ctx, 'HB · 好好学习', w * 0.35, h / 2, w * 0.5, h * 0.9, FONTS.sans, '#3a2a10');
  ctx.fillStyle = '#3a2a10'; ctx.fillRect(w * 0.7, h * 0.2, w * 0.02, h * 0.6);
});

def('school_pencil', {
  name: '铅笔',
  cat: 'daily',
  sfx: 'tiny',
  fill: 0.7,
  tints: [0xf2c14e, 0xe8554a, 0x5aa9e6, 0x5cae4f, 0xf29aa6],
  build(m) {
    const L = 0.17, r = 0.0042, top = pencil(m, L, 0xffffff, { r, tinted: true });
    m.decal(0.06, r * 0.9, 'ss_pencil', -0.01, top + 0.0003, 0, -90 * D, 0, 0);
    // tooth dents just below the ferrule: bare wood showing through the paint
    const xf = L / 2 - 0.017;
    for (const [dx, a] of [[-0.003, 0], [-0.0085, 60 * D], [-0.005, -60 * D]]) {
      m.push(xf + dx, r * Math.cos(30 * D), 0, a, 0, 0);
      m.box(0.0032, 0.0008, r * 0.75, WOOD, 0, r * Math.cos(30 * D), 0);
      m.pop();
    }
    m.box(0.002, 0.0009, r * 0.6, shade(WOOD, 0.85), xf - 0.012, top, 0.0004);
  },
});

// ---- 修正带: tinted shell lying flat, see-through window over the tape spool, tip at +Z -----------------
decal('ss_ctape', 64, 24, (ctx, w, h) => {
  fitText(ctx, '修正带', w / 2, h * 0.38, w * 0.8, h * 0.56, FONTS.round, '#ffffff');
  fitText(ctx, '5mm×6m', w / 2, h * 0.82, w * 0.6, h * 0.26, FONTS.sans, '#ffffff');
});

def('school_correction_tape', {
  name: '修正带',
  cat: 'daily',
  sfx: 'tiny',
  fill: 0.6,
  tints: [0x5aa9e6, 0xf59ab8, 0x9ad67a, 0xc6a2e8, 0xf2a14a],
  build(m) {
    const T = 0.013, W = 0.031, L = 0.056;
    m.tint();
    m.extrude([[-W / 2, -L / 2 + 0.008], [-W / 2 + 0.008, -L / 2], [W / 2 - 0.008, -L / 2], [W / 2, -L / 2 + 0.008], [W / 2, L / 2 - 0.016], [0.004, L / 2], [-0.006, L / 2], [-W / 2, L / 2 - 0.012]],
      T, 0xffffff, 0, T / 2, 0, 90 * D, 0, 0, 0.0015);
    m.tint(0);
    // window with the white tape roll under it
    m.cyl(0.0105, 0.0105, 0.0008, WHT, 0, T + 0.0002, -0.008, 0, 0, 0, 10);
    m.cyl(0.0045, 0.0045, 0.001, 0x8a8f99, 0, T + 0.0004, -0.008, 0, 0, 0, 8);
    m.decal(W * 0.62, W * 0.23, 'ss_ctape', 0, T + 0.0003, 0.011, -90 * D, 0, 0);
    // applicator tip with a strip of tape
    m.box(0.009, 0.006, 0.014, 0xd6dadf, 0.0, 0.004, L / 2 + 0.005);
    m.box(0.0066, 0.0062, 0.006, WHT, 0.0, 0.004, L / 2 + 0.0105);
  },
});

// ---- 直尺: pale blue see-through ruler, 0–20 cm ticks ----------------------------------------------------
decal('ss_ruler', 384, 48, (ctx, w, h) => {
  const x0 = w * 0.03, x1 = w * 0.97, step = (x1 - x0) / 200;
  ctx.fillStyle = '#1d3a6a';
  for (let k = 0; k <= 200; k += 1) {
    const big = k % 10 === 0, mid = k % 5 === 0;
    if (!big && !mid && k % 2) continue;
    ctx.fillRect(Math.round(x0 + k * step), 0, big ? 2 : 1, h * (big ? 0.42 : mid ? 0.3 : 0.18));
  }
  for (let c = 0; c <= 20; c++) fitText(ctx, String(c), x0 + c * 10 * step, h * 0.58, 16, h * 0.24, FONTS.sans, '#1d3a6a');
  fitText(ctx, '好好学习 · 天天向上', w * 0.5, h * 0.86, w * 0.4, h * 0.2, FONTS.round, '#e8554a');
});

def('school_ruler', {
  name: '直尺',
  cat: 'daily',
  sfx: 'tiny',
  fill: 0.9,
  build(m) {
    const L = 0.2, W = 0.032, T = 0.0022;
    m.box(L, T, W, 0x9fd3ef, 0, T / 2, 0);
    m.box(L, T * 0.7, 0.004, 0x7cbfe4, 0, T * 0.35, -W / 2 + 0.002); // bevelled edge
    m.decal(L * 0.98, W * 0.95, 'ss_ruler', 0, T + 0.0002, 0.0006, -90 * D, 0, 0);
  },
});

// ---- 圆规: standing on its legs, needle leg + lead leg, tinted grip on top -----------------------------
def('school_compass', {
  name: '圆规',
  cat: 'daily',
  sfx: 'metal',
  fill: 0.15,
  tints: [0x2f63c9, 0xe8554a, 0x3a9f5c, 0x8a5ad0],
  build(m) {
    const hy = 0.098;
    // legs: painted upper part, silver lower part
    m.tint();
    bar(m, 0.0052, 0.0034, 0xffffff, [-0.003, hy, 0], [-0.021, 0.055, 0]);
    bar(m, 0.0052, 0.0034, 0xffffff, [0.003, hy, 0], [0.02, 0.06, 0]);
    m.tint(0);
    bar(m, 0.0034, 0.0026, SILVER, [-0.021, 0.056, 0], [-0.036, 0.012, 0]);
    bar(m, 0.0034, 0.0026, SILVER, [0.02, 0.061, 0], [0.032, 0.03, 0]);
    // needle
    m.cyl(0.0012, 0.0012, 0.006, SILVER, -0.0365, 0.009, 0, 0, 0, 0, 6);
    m.cone(0.0009, 0.0065, 0xe6e8ec, -0.0365, 0.003, 0, Math.PI, 0, 0, 5);
    // lead holder: screw clamp + lead
    m.box(0.008, 0.012, 0.006, SILVER, 0.0335, 0.026, 0, 0, 0, 0.35);
    m.cyl(0.0024, 0.0024, 0.006, DARK, 0.039, 0.028, 0.004, 90 * D, 0, 0, 6);
    m.cyl(0.0011, 0.0011, 0.02, LEAD, 0.0375, 0.012, 0, 0, 0, 0.12, 6);
    // hinge head + grip
    m.cyl(0.0085, 0.0085, 0.006, SILVER, 0, hy, 0, 90 * D, 0, 0, 10);
    m.cyl(0.003, 0.003, 0.0068, DARK, 0, hy, 0, 90 * D, 0, 0, 6);
    m.tint();
    m.cyl(0.0042, 0.0046, 0.018, 0xffffff, 0, hy + 0.015, 0, 0, 0, 0, 8);
    m.sphere(0.0042, 0xffffff, 0, hy + 0.024, 0, 1, 0.6, 1, 0, 0, 0, 6);
    m.tint(0);
    m.cyl(0.0048, 0.0048, 0.002, SILVER, 0, hy + 0.0065, 0, 0, 0, 0, 8);
  },
});

// ---- 辣条: red pillow packet from the 小卖部 ---------------------------------------------------------------
decal('ss_latiao', 96, 160, (ctx, w, h) => {
  ctx.fillStyle = '#d21f26'; ctx.fillRect(0, 0, w, h);
  // flames
  ctx.fillStyle = '#f2a14a';
  for (let k = 0; k < 6; k++) {
    const x = (k + 0.5) * (w / 6);
    ctx.beginPath(); ctx.moveTo(x - w * 0.08, h); ctx.quadraticCurveTo(x - w * 0.06, h * 0.84, x, h * (0.74 + (k % 2) * 0.06)); ctx.quadraticCurveTo(x + w * 0.06, h * 0.84, x + w * 0.08, h); ctx.fill();
  }
  rrect(ctx, w * 0.12, h * 0.06, w * 0.76, h * 0.12, 6, '#f2c14e');
  fitText(ctx, '小卖部特供', w / 2, h * 0.12, w * 0.66, h * 0.08, FONTS.round, '#b8161d');
  fitText(ctx, '辣', w / 2, h * 0.32, w * 0.76, h * 0.2, FONTS.brush, '#f2c14e');
  fitText(ctx, '条', w / 2, h * 0.52, w * 0.76, h * 0.2, FONTS.brush, '#f2c14e');
  // chilli
  ctx.fillStyle = '#7cbf4a'; ctx.fillRect(w * 0.76, h * 0.26, w * 0.06, h * 0.04);
  ctx.fillStyle = '#ff6a3a';
  ctx.beginPath(); ctx.ellipse(w * 0.8, h * 0.38, w * 0.05, h * 0.08, 0.3, 0, TAU); ctx.fill();
  fitText(ctx, '五毛钱的快乐', w / 2, h * 0.68, w * 0.84, h * 0.08, FONTS.round, '#ffffff');
});
decal('ss_crimp', 64, 8, (ctx, w, h) => {
  ctx.fillStyle = '#a8141b';
  for (let x = 0; x < w; x += 4) ctx.fillRect(x, 0, 2, h);
});

def('school_spicy_strip', {
  name: '辣条',
  cat: 'food',
  sfx: 'paper',
  fill: 0.8,
  build(m) {
    const W = 0.085, L = 0.15;
    m.push(0, 0, 0, 0, 0.3, 0);
    m.box(W * 0.92, 0.012, L - 0.026, RED, 0, 0.006, 0);
    m.box(W, 0.007, L - 0.02, shade(RED, 0.9), 0, 0.0035, 0);
    m.sym(s => {
      m.box(W, 0.0016, 0.012, 0xc4222a, 0, 0.0008, s * (L / 2 - 0.006));
      m.decal(W * 0.98, 0.01, 'ss_crimp', 0, 0.0019, s * (L / 2 - 0.006), -90 * D, 0, 0);
    });
    m.decal(W * 0.86, L * 0.78, 'ss_latiao', 0, 0.0124, 0, -90 * D, 0, 0);
    m.pop();
  },
});

// ---- 作业本: 暑假作业 lying flat, tinted cover, front-right corner dog-eared ----------------------------
decal('ss_homework', 128, 176, (ctx, w, h) => {
  // sun + rays
  circle(ctx, w * 0.78, h * 0.14, w * 0.1, '#f2c14e');
  ctx.strokeStyle = '#f2c14e'; ctx.lineWidth = 3;
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * TAU;
    ctx.beginPath(); ctx.moveTo(w * 0.78 + Math.cos(a) * w * 0.13, h * 0.14 + Math.sin(a) * w * 0.13); ctx.lineTo(w * 0.78 + Math.cos(a) * w * 0.18, h * 0.14 + Math.sin(a) * w * 0.18); ctx.stroke();
  }
  rrect(ctx, w * 0.1, h * 0.28, w * 0.8, h * 0.3, 10, '#fbf7ee');
  fitText(ctx, '暑假', w / 2, h * 0.36, w * 0.66, h * 0.13, FONTS.brush, '#d8342c');
  fitText(ctx, '作业', w / 2, h * 0.5, w * 0.66, h * 0.13, FONTS.brush, '#d8342c');
  // watermelon slice
  ctx.fillStyle = '#3f8f4a';
  ctx.beginPath(); ctx.arc(w * 0.28, h * 0.66, w * 0.17, 0, Math.PI); ctx.fill();
  ctx.fillStyle = '#f06a6a';
  ctx.beginPath(); ctx.arc(w * 0.28, h * 0.66, w * 0.14, 0, Math.PI); ctx.fill();
  ctx.fillStyle = '#2a1d17';
  for (const [dx, dy] of [[-0.06, 0.03], [0, 0.06], [0.06, 0.03]]) circle(ctx, w * (0.28 + dx), h * (0.66 + dy), 2, '#2a1d17');
  ctx.fillStyle = '#fbf7ee';
  ctx.fillRect(w * 0.12, h * 0.84, w * 0.76, h * 0.11);
  leftText(ctx, '姓名:', w * 0.16, h * 0.895, Math.round(h * 0.06), '#5a5e68');
  ctx.fillStyle = '#5a5e68'; ctx.fillRect(w * 0.42, h * 0.92, w * 0.4, 1.5);
  fitText(ctx, '快乐假期', w * 0.68, h * 0.72, w * 0.36, h * 0.07, FONTS.round, '#fbf7ee');
});

def('school_homework', {
  name: '作业本',
  cat: 'daily',
  sfx: 'paper',
  fill: 0.95,
  tints: [0x5aa9e6, 0x5cae4f, 0xf2a14a, 0xf59ab8, 0x2aa198],
  build(m) {
    const W = 0.18, L = 0.25, T = 0.007, c = 0.0007, dog = 0.04;
    m.tbox(W - 0.004, T - 2 * c, L - 0.004, PAPER, { px: 'ss_pages', pz: 'ss_pages', nz: 'ss_pages' }, 0.001, T / 2, 0);
    m.tint();
    m.box(W, c, L, 0xffffff, 0, c / 2, 0);
    // top cover minus the folded corner: two boxes + the triangle that stays
    m.box(W, c, L - dog, 0xffffff, 0, T - c / 2, -dog / 2);
    m.box(W - dog, c, dog, 0xffffff, -dog / 2, T - c / 2, L / 2 - dog / 2);
    m.extrude([[W / 2 - dog, -L / 2 + dog], [W / 2, -L / 2 + dog], [W / 2 - dog, -L / 2]], c, 0xffffff, 0, T - c / 2, 0, -90 * D, 0, 0);
    m.box(0.004, T, L, 0xe0e0e0, -W / 2 + 0.002, T / 2, 0); // spine
    m.tint(0);
    m.decal(W * 0.84, L * 0.84, 'ss_homework', -0.006, T + 0.0003, -0.008, -90 * D, 0, 0);
    // dog-ear flap folded back over the cover (inner side is paper-white), a little lifted
    m.extrude([[W / 2 - dog, L / 2 - dog], [W / 2, L / 2 - dog], [W / 2 - dog, L / 2]], c, 0xeee8da, 0, T + 0.0012, 0, -90 * D + 4 * D, 0, 0);
    m.box(0.002, 0.0015, 0.002, PAPER, W / 2 - dog + 0.001, T + 0.0006, L / 2 - dog + 0.001);
  },
});

// ---- 错题本: A5 notebook stuffed fat, sticky flags and a folded test poking out, elastic strap ------------
decal('ss_mistakes', 96, 136, (ctx, w, h) => {
  rrect(ctx, w * 0.1, h * 0.12, w * 0.8, h * 0.36, 8, '#fbf7ee');
  fitText(ctx, '错题本', w / 2, h * 0.26, w * 0.72, h * 0.16, FONTS.brush, '#26262c');
  fitText(ctx, '(第 5 本)', w / 2, h * 0.4, w * 0.4, h * 0.06, FONTS.sans, '#6d6457');
  cross(ctx, w * 0.5, h * 0.66, w * 0.14, '#e8554a', 6);
  fitText(ctx, '同一道题不错第三次', w / 2, h * 0.88, w * 0.84, h * 0.07, FONTS.round, '#fbf7ee');
});

def('school_mistakes_book', {
  name: '错题本',
  cat: 'daily',
  sfx: 'paper',
  fill: 0.9,
  tints: [0x2c3e66, 0x8a5ad0, 0xd8342c, 0x3a8f5c],
  build(m) {
    const W = 0.148, L = 0.21, T = 0.045, c = 0.0015;
    const side = { px: 'ss_pages', nx: 'ss_pages', pz: 'ss_pages', nz: 'ss_pages' };
    // fat block of pages, layers fanning a bit
    const n = 4, h = (T - 2 * c) / n;
    for (let i = 0; i < n; i++) {
      const bulge = i === 1 || i === 2 ? 0.006 : 0.002;
      m.tbox(W - 0.006 + bulge, h, L - 0.008 + bulge, PAPER, side, 0.002 + m.rng.range(-0.002, 0.002), c + (i + 0.5) * h, m.rng.range(-0.002, 0.002), 0, m.rng.range(-0.025, 0.025), 0);
    }
    m.tint();
    m.box(W, c, L, 0xffffff, 0, c / 2, 0);
    m.box(W, c, L, 0xffffff, 0, T - c / 2, 0, 0.02, 0, 0);
    m.box(0.006, T, L, 0xe8e8e8, -W / 2 + 0.003, T / 2, 0);
    m.tint(0);
    m.decal(W * 0.8, L * 0.8, 'ss_mistakes', 0.003, T + 0.0018, -0.004, -90 * D + 0.02, 0, 0);
    // sticky flags sticking out of the right edge
    [[0xf2c14e, -0.06], [0xf29aa6, -0.02], [0x8fc8ef, 0.03], [0x9ad67a, 0.07]].forEach(([col, z], i) =>
      m.box(0.022, 0.0008, 0.012, col, W / 2 + 0.006, c + (i % 3 + 1) * h, z));
    // a folded test sheet sticking out of the front
    m.box(0.09, 0.0012, 0.04, WHT, -0.012, c + 2 * h, L / 2 - 0.004, 0, 0.12, 0);
    m.box(0.012, 0.0013, 0.008, RED, 0.016, c + 2 * h + 0.0002, L / 2 + 0.008, 0, 0.12, 0);
    // elastic strap wrapped around, near the right edge
    const x = W / 2 - 0.02, e = 0.0016;
    m.box(0.008, e, L + 0.003, BLK, x, T + e / 2 + 0.0004, 0, 0.02, 0, 0);
    m.box(0.008, T + 0.002, e, BLK, x, (T + 0.002) / 2, L / 2 + e / 2 + 0.001);
    m.box(0.008, T + 0.002, e, BLK, x, (T + 0.002) / 2, -L / 2 - e / 2 - 0.001);
  },
});

// ---- 试卷: 8开 exam lying flat, ends curling up, a big red 59 ----------------------------------------------
decal('ss_test', 320, 224, (ctx, w, h) => {
  ctx.fillStyle = '#fbfaf3'; ctx.fillRect(0, 0, w, h);
  fitText(ctx, '期末考试  数学试卷', w * 0.56, h * 0.08, w * 0.56, h * 0.09, FONTS.sans, '#26262c', '900');
  ctx.fillStyle = '#5a5e68';
  leftText(ctx, '班级: ______   姓名: ______   学号: ____', w * 0.33, h * 0.18, Math.round(h * 0.04), '#5a5e68');
  // score box with the 59
  ctx.strokeStyle = '#8a8f99'; ctx.lineWidth = 1.5;
  ctx.strokeRect(w * 0.03, h * 0.04, w * 0.24, h * 0.22);
  leftText(ctx, '得分', w * 0.045, h * 0.08, Math.round(h * 0.045), '#5a5e68');
  ctx.strokeStyle = '#d8202a'; ctx.lineWidth = 4;
  ctx.beginPath(); ctx.ellipse(w * 0.16, h * 0.16, w * 0.085, h * 0.1, -0.15, 0, TAU); ctx.stroke();
  fitText(ctx, '59', w * 0.16, h * 0.16, w * 0.13, h * 0.16, FONTS.brush, '#d8202a');
  ctx.fillStyle = '#c9c4b8'; ctx.fillRect(w * 0.5, h * 0.3, 1.5, h * 0.66);
  // two columns of questions, red marks
  const marks = ['t', 'x', 't', 't', 'x', 'x', 't', 'x', 't', 'x', 'x', 't'];
  for (let col = 0; col < 2; col++) {
    for (let i = 0; i < 6; i++) {
      const x = w * (0.04 + col * 0.49), y = h * (0.34 + i * 0.105);
      leftText(ctx, `${col * 6 + i + 1}.`, x, y, Math.round(h * 0.042), '#26262c');
      ctx.fillStyle = '#9aa0a6';
      ctx.fillRect(x + w * 0.05, y - 1, w * (0.22 + ((i * 7 + col * 3) % 5) * 0.03), 2);
      ctx.fillRect(x + w * 0.05, y + h * 0.04, w * 0.18, 1.5);
      const mk = marks[col * 6 + i], mx = x + w * 0.42;
      if (mk === 't') tick(ctx, mx, y, h * 0.035, '#d8202a', 3);
      else cross(ctx, mx, y, h * 0.03, '#d8202a', 3);
    }
  }
  fitText(ctx, '家长签字:', w * 0.82, h * 0.95, w * 0.2, h * 0.05, FONTS.sans, '#d8202a');
});

def('school_test_paper', {
  name: '试卷',
  cat: 'daily',
  sfx: 'paper',
  fill: 0.2,
  build(m) {
    const W = 0.37, L = 0.26;
    const lift = (x, z) => {
      const u = Math.max(0, Math.abs(x) / (W / 2) - 0.55) / 0.45, v = Math.max(0, z / (L / 2) - 0.6) / 0.4;
      return u * u * (x > 0 ? 0.03 : 0.018) + v * v * Math.max(0, x / W) * 0.03;
    };
    const mk = (y0, flip) => memo(`ss_sheet:${y0}:${flip}`, () => {
      const g = new THREE.PlaneGeometry(W, L, 10, 4).rotateX(-90 * D);
      if (flip) g.rotateZ(Math.PI);
      const p = g.attributes.position;
      for (let i = 0; i < p.count; i++) p.setY(i, lift(p.getX(i), p.getZ(i)) + y0);
      g.computeVertexNormals();
      return g;
    });
    m.push(0, 0, 0, 0, -0.12, 0);
    m.geo(mk(0, true), 0xe9e5da); // underside
    m.geo(mk(0.0004, false), 0xffffff, 0, 0, 0, 0, 0, 0, 1, 1, 1, getUV('ss_test'));
    m.pop();
  },
});

// ---- 文具盒: double-decker magnetic box, lid flipped open showing pencils + a timetable inside the lid -----
decal('ss_pcase_lid', 160, 64, (ctx, w, h) => {
  ctx.fillStyle = 'rgba(255,255,255,0)';
  // rocket + stars
  ctx.fillStyle = '#fbf7ee';
  ctx.beginPath(); ctx.ellipse(w * 0.2, h * 0.5, w * 0.11, h * 0.16, 0, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.moveTo(w * 0.31, h * 0.5); ctx.lineTo(w * 0.36, h * 0.5); ctx.lineTo(w * 0.3, h * 0.38); ctx.fill();
  circle(ctx, w * 0.22, h * 0.5, h * 0.07, '#5aa9e6');
  ctx.fillStyle = '#f2a14a';
  ctx.beginPath(); ctx.moveTo(w * 0.09, h * 0.42); ctx.lineTo(w * 0.02, h * 0.5); ctx.lineTo(w * 0.09, h * 0.58); ctx.fill();
  for (const [x, y] of [[0.45, 0.25], [0.88, 0.2], [0.92, 0.78]]) fitText(ctx, '★', w * x, h * y, 14, 14, FONTS.sans, '#f2c14e');
  fitText(ctx, '天天向上', w * 0.66, h * 0.52, w * 0.5, h * 0.4, FONTS.round, '#fbf7ee');
});
decal('ss_timetable', 160, 64, (ctx, w, h) => {
  ctx.fillStyle = '#fbfaf3'; ctx.fillRect(0, 0, w, h);
  const days = ['', '一', '二', '三', '四', '五'], subj = ['语', '数', '英', '体', '音', '美', '科'];
  const cw = w / 6, rh = h / 5;
  ctx.fillStyle = '#5aa9e6'; ctx.fillRect(0, 0, w, rh);
  for (let c = 1; c < 6; c++) fitText(ctx, days[c], (c + 0.5) * cw, rh / 2, cw * 0.7, rh * 0.8, FONTS.sans, '#ffffff');
  for (let r = 1; r < 5; r++) {
    fitText(ctx, String(r), cw / 2, (r + 0.5) * rh, cw * 0.5, rh * 0.7, FONTS.sans, '#5a5e68');
    for (let c = 1; c < 6; c++) fitText(ctx, subj[(r * 3 + c * 2) % 7], (c + 0.5) * cw, (r + 0.5) * rh, cw * 0.7, rh * 0.75, FONTS.sans, '#26262c');
  }
  ctx.fillStyle = '#c9c4b8';
  for (let c = 1; c < 6; c++) ctx.fillRect(c * cw, 0, 1, h);
  for (let r = 1; r < 5; r++) ctx.fillRect(0, r * rh, w, 1);
});

def('school_pencil_case', {
  name: '文具盒',
  cat: 'daily',
  sfx: 'hard',
  fill: 0.55,
  tints: [0x5aa9e6, 0xf59ab8, 0x9ad67a, 0xf2a14a, 0x8a5ad0],
  build(m) {
    const W = 0.22, L = 0.075, H = 0.04, y1 = 0.024, t = 0.003, lt = 0.006;
    m.tint();
    m.box(W, y1, L, 0xffffff, 0, y1 / 2, 0); // lower deck
    m.box(W, H - y1, t, 0xffffff, 0, (y1 + H) / 2, L / 2 - t / 2);
    m.box(W, H - y1, t, 0xffffff, 0, (y1 + H) / 2, -L / 2 + t / 2);
    m.sym(s => m.box(t, H - y1, L - 2 * t, 0xffffff, s * (W / 2 - t / 2), (y1 + H) / 2, 0));
    m.tint(0);
    m.box(W + 0.0006, 0.002, L + 0.0006, 0xf4f2ec, 0, y1, 0); // seam between decks
    m.box(W - 2 * t, 0.001, L - 2 * t, 0xf6efe0, 0, y1 + 0.0015, 0); // tray liner
    // buttons for the secret compartments + built-in sharpener hole
    m.sym(s => m.cyl(0.005, 0.005, 0.003, WHT, s * 0.075, y1 * 0.5, L / 2 + 0.001, 90 * D, 0, 0, 6));
    m.disc(0.004, INK, W / 2 + 0.0004, y1 * 0.5, 0.012, 0, 0, 90 * D, 6);
    // contents: pencils, an eraser, a mini ruler
    [[0xe8554a, -0.022, 0.15], [0x3a9f5c, -0.008, 0.16], [GOLD, 0.006, 0.14]].forEach(([col, z, len]) => {
      m.push(-0.01, y1 + 0.002, z, 0, 0.02, 0);
      pencil(m, len, col, { r: 0.0036, eraser: false });
      m.pop();
    });
    m.box(0.03, 0.008, 0.014, 0xf3efe6, 0.082, y1 + 0.006, 0.02);
    m.box(0.018, 0.0084, 0.0144, 0x2f63c9, 0.09, y1 + 0.006, 0.02);
    m.box(0.15, 0.0015, 0.016, 0x9fd3ef, -0.01, y1 + 0.0028, 0.022);
    // lid flipped open on its back hinge, magnet strip
    m.push(0, H, -L / 2, -62 * D, 0, 0);
    m.tint();
    m.box(W, lt, L, 0xffffff, 0, lt / 2, L / 2);
    m.tint(0);
    m.decal(W * 0.84, L * 0.84, 'ss_pcase_lid', 0, lt + 0.0004, L / 2, -90 * D, 0, Math.PI);
    m.decal(W * 0.62, L * 0.8, 'ss_timetable', -0.02, -0.0004, L / 2, 90 * D, 0, 0);
    m.box(0.04, 0.0012, 0.006, SILVER, 0.075, -0.0006, L - 0.006);
    m.pop();
  },
});

// ---- 黑板擦: tinted grip block on a chalk-dusted felt pad --------------------------------------------------
decal('ss_dust', 128, 16, (ctx, w, h) => {
  ctx.fillStyle = '#eef0f2';
  for (let k = 0; k < 70; k++) {
    const x = (k * 37) % w, y = (k * 11) % h, s = 1 + (k % 3);
    ctx.fillRect(x, y, s * 2, s);
  }
  ctx.fillRect(0, h * 0.7, w, h * 0.3);
});
decal('ss_dust_top', 96, 40, (ctx, w, h) => {
  ctx.fillStyle = '#f4f2ec';
  for (let k = 0; k < 26; k++) {
    const x = w * 0.15 + ((k * 29) % (w * 0.7)), y = h * 0.2 + ((k * 13) % (h * 0.6)), r = 1.5 + (k % 3);
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
  }
  fitText(ctx, '值日生专用', w / 2, h / 2, w * 0.7, h * 0.36, FONTS.round, '#fbf7ee');
});

def('school_board_eraser', {
  name: '黑板擦',
  cat: 'daily',
  sfx: 'soft',
  fill: 0.85,
  tints: [0x2f63c9, 0xd8342c, 0x3a8f5c, 0xf2a14a],
  build(m) {
    const L = 0.15, W = 0.055, f = 0.01, H = 0.034;
    m.box(L, f, W, 0x6d7380, 0, f / 2, 0); // felt
    m.decal(L, f * 0.9, 'ss_dust', 0, f / 2, W / 2 + 0.0004);
    m.decal(L, f * 0.9, 'ss_dust', 0, f / 2, -W / 2 - 0.0004, 0, Math.PI, 0);
    m.tint();
    m.box(L, 0.012, W, 0xffffff, 0, f + 0.006, 0);
    m.extrude([[-L / 2 + 0.006, 0], [L / 2 - 0.006, 0], [L / 2 - 0.022, H - f - 0.012], [-L / 2 + 0.022, H - f - 0.012]], W * 0.62, 0xe8e8e8, 0, f + 0.012, 0);
    m.tint(0);
    m.sym(s => m.box(L - 0.03, 0.003, 0.004, shade(0xe8e8e8, 0.5), 0, f + 0.0135, s * (W / 2 - 0.0012))); // grip grooves
    m.decal(L * 0.7, W * 0.52, 'ss_dust_top', 0, H + 0.0004, 0, -90 * D, 0, 0);
  },
});

// ---- 水杯: kids' flip-straw bottle, tinted body, strap looping out on the floor in front ---------------------
decal('ss_bottle', 96, 64, (ctx, w, h) => {
  // smiling raindrop
  ctx.fillStyle = '#fbf7ee';
  ctx.beginPath(); ctx.moveTo(w * 0.3, h * 0.1); ctx.quadraticCurveTo(w * 0.1, h * 0.55, w * 0.3, h * 0.88); ctx.quadraticCurveTo(w * 0.5, h * 0.55, w * 0.3, h * 0.1); ctx.fill();
  circle(ctx, w * 0.25, h * 0.6, 2.5, '#2a1d17');
  circle(ctx, w * 0.35, h * 0.6, 2.5, '#2a1d17');
  ctx.strokeStyle = '#2a1d17'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(w * 0.3, h * 0.66, 4, 0.2 * Math.PI, 0.8 * Math.PI); ctx.stroke();
  fitText(ctx, '多喝水', w * 0.68, h * 0.4, w * 0.4, h * 0.3, FONTS.round, '#fbf7ee');
  ctx.fillStyle = '#fbf7ee';
  for (let k = 0; k < 4; k++) ctx.fillRect(w * 0.56, h * (0.62 + k * 0.08), k % 2 ? w * 0.08 : w * 0.14, 2);
});

def('school_bottle', {
  name: '水杯',
  cat: 'daily',
  sfx: 'hard',
  fill: 0.3,
  tints: [0x5aa9e6, 0xf59ab8, 0x9ad67a, 0xf2a14a, 0xc6a2e8],
  build(m) {
    const R = 0.034, H = 0.155;
    m.push(0, 0, -0.05);
    m.tint();
    m.lathe([[0, 0], [R - 0.004, 0], [R, 0.005], [R, H - 0.01], [R - 0.004, H], [0, H]], 0xffffff, 0, 0, 0, 0, 0, 0, 12);
    m.tint(0);
    band(m, 'ss_bottle', R + 0.0005, R + 0.0005, 0.06, 1.9, 7, 0, 0.075, 0);
    // lid, flip cap, straw
    m.lathe([[0, H - 0.002], [R + 0.002, H - 0.002], [R + 0.002, H + 0.024], [R - 0.004, H + 0.032], [0, H + 0.032]], WHT, 0, 0, 0, 0, 0, 0, 12);
    m.box(0.016, 0.006, 0.03, WHT, 0, H + 0.035, 0.008, -0.2, 0, 0);
    m.cyl(0.004, 0.004, 0.014, 0xf29aa6, 0, H + 0.04, 0.02, 0.5, 0, 0, 6);
    // strap lugs and a ribbon loop lying on the floor in front
    m.sym(s => m.box(0.006, 0.012, 0.01, DARK, s * (R + 0.004), H + 0.012, 0));
    const pts = [[0.04, H + 0.012, 0], [0.058, 0.12, 0.025], [0.066, 0.05, 0.062], [0.06, 0.004, 0.1], [0.03, 0.002, 0.13], [0, 0.002, 0.138],
      [-0.03, 0.002, 0.13], [-0.06, 0.004, 0.1], [-0.066, 0.05, 0.062], [-0.058, 0.12, 0.025], [-0.04, H + 0.012, 0]];
    wire(m, pts, 0.006, DARK, { sides: 4, rh: 0.0012 });
    m.pop();
  },
});

// ---- 跳绳: rope coiled on the floor, two handles lying at the front -------------------------------------
def('school_jump_rope', {
  name: '跳绳',
  cat: 'toy',
  sfx: 'soft',
  fill: 0.2,
  tints: [0xe8554a, 0x5aa9e6, 0xf2c14e, 0x5cae4f, 0xf29aa6],
  build(m) {
    const pts = [], turns = 2.4, n = 52;
    for (let i = 0; i <= n; i++) {
      const t = i / n, a = 0.5 * Math.PI + t * turns * TAU;
      const r = 0.1 + 0.022 * Math.sin(t * 7) + 0.008 * Math.sin(t * 23);
      pts.push([Math.cos(a) * r * 1.2, 0.0016 + 0.004 * Math.max(0, Math.sin(a * 1.5 + 1)), Math.sin(a) * r - 0.02]);
    }
    // tails out to the handles
    const hA = [-0.05, 0.0113, 0.13], hB = [0.06, 0.0113, 0.12];
    const rope = [[hA[0] + 0.06, 0.006, hA[2] - 0.004], [hA[0] + 0.04, 0.004, 0.09], ...pts, [0.08, 0.004, 0.1], [hB[0] - 0.06, 0.006, hB[2] - 0.01]];
    m.tint();
    wire(m, rope, 0.003, 0xffffff);
    m.tint(0);
    // handles: foam grip + tinted cap
    for (const [h, yaw] of [[hA, -0.12], [hB, 0.22]]) {
      m.push(h[0], h[1], h[2], 0, yaw, 0);
      m.cyl(0.011, 0.012, 0.11, WHT, 0, 0, 0, 0, 0, 90 * D, 6);
      m.tint();
      m.cyl(0.013, 0.013, 0.012, 0xffffff, h === hA ? 0.058 : -0.058, 0, 0, 0, 0, 90 * D, 6);
      m.cyl(0.012, 0.012, 0.01, 0xffffff, h === hA ? -0.058 : 0.058, 0, 0, 0, 0, 90 * D, 6);
      m.tint(0);
      m.pop();
    }
  },
});

// =============================================================================================
// 30 cm +
// =============================================================================================

// ---- 一摞课本: 书山 — leaning stack of textbooks and workbooks, titled spines facing +Z ------------------------
const BOOKS = [
  // [title, sub, colour, x size, thickness, z size] — bottom to top
  ['习题集', '期末冲刺', '#2aa198', 0.28, 0.034, 0.205],
  ['语文', '上册', '#d8342c', 0.26, 0.018, 0.185],
  ['练习册', '数学 同步', '#f2a14a', 0.27, 0.026, 0.2],
  ['数学', '上册', '#2f63c9', 0.26, 0.017, 0.185],
  ['试卷', '一百分 全套', '#e8eef5', 0.28, 0.04, 0.2],
  ['英语', 'Book 1', '#3a8f5c', 0.255, 0.015, 0.185],
  ['科学', '上册', '#5aa9e6', 0.26, 0.015, 0.185],
  ['练习册', '语文 同步', '#f2c14e', 0.27, 0.026, 0.2],
  ['历史', '上册', '#b07a4f', 0.26, 0.014, 0.185],
  ['地理', '上册', '#5cae4f', 0.26, 0.014, 0.185],
  ['道德与法治', '上册', '#f08fb0', 0.26, 0.013, 0.185],
  ['物理', '下册', '#2c3e66', 0.26, 0.015, 0.185],
  ['寒假作业', '', '#5aa9e6', 0.25, 0.01, 0.18],
  ['音乐', '', '#c6a2e8', 0.26, 0.011, 0.185],
  ['美术', '', '#f2a14a', 0.26, 0.011, 0.185],
  ['作文选', '满分范文', '#e8554a', 0.21, 0.024, 0.15],
  ['课外书', '', '#3a8f5c', 0.2, 0.03, 0.14],
  ['字典', '学生专用', '#8a5ad0', 0.16, 0.058, 0.12],
];
BOOKS.forEach(([title, sub, bg], i) => decal(`ss_sp${i}`, 128, 16, (ctx, w, h) => {
  ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);
  const light = bg === '#e8eef5' || bg === '#f2c14e';
  const ink = light ? '#26262c' : '#ffffff';
  ctx.fillStyle = light ? '#d8342c' : 'rgba(255,255,255,0.9)';
  ctx.fillRect(w * 0.06, 2, 2, h - 4);
  fitText(ctx, title, w * 0.32, h / 2, w * 0.38, h * 0.82, FONTS.sans, ink);
  if (sub) fitText(ctx, sub, w * 0.74, h / 2, w * 0.34, h * 0.6, FONTS.sans, ink);
}));
const hexInt = s => parseInt(s.slice(1), 16);

def('school_textbooks', {
  name: '一摞课本',
  cat: 'daily',
  sfx: 'paper',
  fill: 0.7,
  build(m) {
    let y = 0, x = -0.04;
    const side = { px: 'ss_pages', nx: 'ss_pages', nz: 'ss_pages' };
    BOOKS.forEach(([, , bg, w, t, d], i) => {
      x += i > 2 ? m.rng.range(0.001, 0.009) : m.rng.range(-0.003, 0.003);
      const yaw = m.rng.range(-0.08, 0.08), col = hexInt(bg);
      // spine on +Z; pages on the other sides
      m.tbox(w, t, d, col, { ...side, pz: `ss_sp${i}` }, x, y + t / 2, (d - 0.185) / 2, 0, yaw, 0);
      y += t;
      // loose sheets poking out here and there
      if (i === 2 || i === 9) m.box(0.12, 0.001, 0.05, WHT, x + 0.08, y - t * 0.4, -0.08, 0, yaw + 0.4, 0);
    });
    // ruler bookmark sticking out the side
    m.box(0.2, 0.0018, 0.03, 0x9fd3ef, 0.06, 0.112, 0.01, 0, -0.25, 0);
  },
});

// ---- 书包: upright backpack, tinted, zipper arch, front pocket patch, chick keychain charm --------------------
decal('ss_patch', 64, 64, (ctx, w, h) => {
  circle(ctx, w / 2, h / 2, w * 0.47, '#fbf7ee');
  circle(ctx, w / 2, h / 2, w * 0.4, '#f2c14e');
  fitText(ctx, '★', w / 2, h * 0.38, w * 0.4, h * 0.34, FONTS.sans, '#e8554a');
  fitText(ctx, '满分', w / 2, h * 0.7, w * 0.54, h * 0.24, FONTS.round, '#b8322a');
});

def('school_bag', {
  name: '书包',
  cat: 'daily',
  sfx: 'soft',
  fill: 0.7,
  tints: [0x2f63c9, 0xd8342c, 0xf59ab8, 0x3a8f5c, 0x8a5ad0, 0xf2a14a],
  build(m) {
    const W = 0.29, H = 0.36, Dp = 0.14, rr = 0.045;
    m.tint();
    m.rbox(W, H, Dp, rr, 0xffffff, 0, H / 2 + 0.006, 0);
    m.rbox(W * 0.8, 0.15, 0.05, 0.022, 0xe4e4e4, 0, 0.1, Dp / 2 + 0.012); // front pocket
    m.sym(s => m.box(0.03, 0.12, 0.09, 0xe4e4e4, s * (W / 2 + 0.006), 0.075, 0)); // side pockets
    m.tint(0);
    m.box(W - 0.02, 0.012, Dp - 0.02, DARK, 0, 0.006, 0); // base
    // zipper arch over the top of the main body
    const zp = [];
    for (let k = 0; k <= 8; k++) {
      const a = Math.PI - (k / 8) * Math.PI, cx = Math.cos(a), cy = Math.sin(a);
      zp.push([cx * (W / 2 + 0.003), 0.21 + cy * (H - 0.21 + 0.009), 0.03]);
    }
    wire(m, zp, 0.003, DARK);
    m.box(0.012, 0.022, 0.004, SILVER, zp[2][0] + 0.01, zp[2][1] - 0.012, 0.032, 0, 0, -0.6);
    // front pocket zip + puller + keychain charm (a little yellow chick)
    m.box(W * 0.7, 0.004, 0.004, DARK, 0, 0.168, Dp / 2 + 0.03);
    m.box(0.008, 0.018, 0.003, SILVER, 0.08, 0.158, Dp / 2 + 0.036);
    wire(m, [[0.08, 0.15, Dp / 2 + 0.038], [0.084, 0.13, Dp / 2 + 0.042], [0.09, 0.11, Dp / 2 + 0.042]], 0.0012, SILVER);
    const cz = Dp / 2 + 0.05, cy = 0.09, cx = 0.092;
    m.sphere(0.02, GOLD, cx, cy, cz, 1, 0.95, 0.9, 0, 0, 0, 8);
    m.cone(0.005, 0.008, 0xf2a14a, cx, cy - 0.002, cz + 0.021, 90 * D, 0, 0, 4);
    m.sym(s => m.sphere(0.0025, INK, cx + s * 0.007, cy + 0.005, cz + 0.017, 1, 1, 0.6, 0, 0, 0, 4));
    m.sym(s => m.sphere(0.003, 0xf6a3ad, cx + s * 0.012, cy - 0.002, cz + 0.014, 1, 0.7, 0.5, 0, 0, 0, 4));
    m.decal(0.06, 0.06, 'ss_patch', -0.05, 0.1, Dp / 2 + 0.0375);
    // carry handle + shoulder straps on the back
    wire(m, [[-0.04, H + 0.004, -0.02], [-0.03, H + 0.03, -0.02], [0.03, H + 0.03, -0.02], [0.04, H + 0.004, -0.02]], 0.007, DARK, { sides: 4, rh: 0.003 });
    m.sym(s => wire(m, [[s * 0.07, H - 0.02, -Dp / 2 + 0.01], [s * 0.075, H - 0.06, -Dp / 2 - 0.02], [s * 0.085, 0.18, -Dp / 2 - 0.03], [s * 0.1, 0.06, -Dp / 2 - 0.012], [s * 0.11, 0.03, -Dp / 2 + 0.01]],
      0.022, DARK, { sides: 4, rh: 0.005 }));
  },
});

// ---- 地球仪: tilted globe on a half meridian, Asia facing the front --------------------------------------
const CONTINENTS = [ // [lat, lon, radius°]
  [52, 95, 28], [45, 50, 20], [32, 85, 18], [20, 78, 10], [14, 102, 9], [52, 15, 13], [62, 130, 18], [36, 118, 10],
  [8, 20, 24], [-14, 26, 16], [20, 10, 14],
  [52, -102, 22], [36, -95, 13], [62, -125, 14], [18, -98, 6],
  [-8, -60, 16], [-28, -64, 11], [-45, -70, 5],
  [-25, 134, 12], [72, -40, 9], [-86, 0, 16], [-82, 120, 14], [-82, -120, 14],
];
const LAND = CONTINENTS.map(([la, lo, r]) => {
  const a = la * D, b = (lo - 105) * D;
  return [Math.cos(a) * Math.sin(b), Math.sin(a), Math.cos(a) * Math.cos(b), Math.cos(r * D)];
});

def('school_globe', {
  name: '地球仪',
  cat: 'daily',
  sfx: 'hard',
  fill: 0.35,
  build(m) {
    const R = 0.14, cy = 0.235, tilt = -23.5 * D, Ra = R + 0.014;
    // per-face colours, computed from face centres in the globe's own frame
    const g = memo('ss_globe', () => new THREE.SphereGeometry(R, 14, 10).toNonIndexed());
    const cols = memo('ss_globe_cols', () => {
      const p = g.attributes.position, out = [];
      for (let i = 0; i < p.count; i += 3) {
        const c = V(0, 0, 0);
        for (let k = 0; k < 3; k++) c.add(V(p.getX(i + k), p.getY(i + k), p.getZ(i + k)));
        c.normalize();
        let land = false;
        for (const [x, y, z, cr] of LAND) if (c.x * x + c.y * y + c.z * z > cr) { land = true; break; }
        out.push(!land ? 0x3d8fd9 : Math.abs(c.y) > 0.86 ? 0xf4f2ec : Math.abs(c.y) < 0.42 && (i / 3) % 3 === 0 ? 0xe2c06a : (i / 3) % 2 ? 0x6cbf5a : 0x8fcb5a);
      }
      return out;
    });
    let idx = 0;
    m.geo(g, () => cols[Math.floor(idx++ / 3)], 0, cy, 0, 0, 0, tilt);
    // axis pins and the half meridian on the −X side
    const ax = [Math.sin(-tilt), Math.cos(-tilt)];
    const top = [ax[0] * Ra, cy + ax[1] * Ra], bot = [-ax[0] * Ra, cy - ax[1] * Ra];
    m.torus(Ra, 0.005, GOLD, 0, cy, 0, 0, 0, 90 * D + tilt, Math.PI, 5, 14);
    rod(m, 0.003, SILVER, [top[0], top[1], 0], [ax[0] * (R - 0.01), cy + ax[1] * (R - 0.01), 0], 6);
    rod(m, 0.003, SILVER, [bot[0], bot[1], 0], [-ax[0] * (R - 0.01), cy - ax[1] * (R - 0.01), 0], 6);
    m.sphere(0.008, GOLD, top[0], top[1], 0, 1, 1, 1, 0, 0, 0, 6);
    // stem down to a round base under the bottom pivot
    const bx = bot[0];
    m.cyl(0.008, 0.01, bot[1] - 0.02, 0xb07a4f, bx, (bot[1] + 0.02) / 2, 0, 0, 0, 0, 8);
    m.lathe([[0, 0], [0.085, 0], [0.085, 0.01], [0.07, 0.022], [0.02, 0.028], [0, 0.03]], 0x8b5a3c, bx, 0, 0, 0, 0, 0, 12);
  },
});

// ---- 教学三角板: the teacher's giant wooden 30°/60° set square with a handle across the hole ------------------
decal('ss_sq_scale', 512, 32, (ctx, w, h) => {
  const n = 50, step = (w - 16) / n;
  ctx.fillStyle = '#4a2f1c';
  for (let k = 0; k <= n; k++) {
    const big = k % 10 === 0, mid = k % 5 === 0;
    ctx.fillRect(Math.round(8 + k * step) - 1, 0, big ? 4 : 3, h * (big ? 0.5 : mid ? 0.4 : 0.28));
  }
  for (let k = 0; k <= 50; k += 10) fitText(ctx, String(k), 8 + k * step, h * 0.76, 30, h * 0.48, FONTS.sans, '#4a2f1c');
});
decal('ss_sq_tag', 96, 32, (ctx, w, h) => {
  fitText(ctx, '三年二班', w / 2, h * 0.32, w * 0.9, h * 0.5, FONTS.brush, '#c8302a');
  fitText(ctx, '教具 请勿玩耍', w / 2, h * 0.78, w * 0.8, h * 0.3, FONTS.sans, '#c8302a');
});

def('school_set_square', {
  name: '教学三角板',
  cat: 'daily',
  sfx: 'wood',
  fill: 0.2,
  build(m) {
    const A = [-0.3, 0.173], B = [0.3, 0.173], C = [-0.3, -0.173], T = 0.012;
    const len = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]);
    const a = len(B, C), b = len(C, A), c = len(A, B), s = a + b + c;
    const I = [(a * A[0] + b * B[0] + c * C[0]) / s, (a * A[1] + b * B[1] + c * C[1]) / s];
    const r = (0.5 * b * c) / (s / 2), k = (r - 0.07) / r;
    const O = [A, B, C], In = O.map(p => [I[0] + k * (p[0] - I[0]), I[1] + k * (p[1] - I[1])]);
    const col = (x, y, z, nx, ny) => (Math.abs(ny) > 0.5 ? WOOD : shade(WOOD, 0.8));
    for (let i = 0; i < 3; i++) {
      const j = (i + 1) % 3, quad = [O[i], O[j], In[j], In[i]];
      m.extrude(quad.map(([x, z]) => [x, -z]), T, col, 0, T / 2, 0, -90 * D, 0, 0);
    }
    // cm scale along the long front edge, class tag near the right angle
    m.decal(0.56, 0.035, 'ss_sq_scale', 0, T + 0.0006, A[1] - 0.02, -90 * D, 0, 0);
    m.decal(0.09, 0.03, 'ss_sq_tag', -0.268, T + 0.0006, 0.03, -90 * D, 0, 90 * D);
    // handle bridging the hole: from the front edge band to the hypotenuse band
    const hx = In[0][0] + 0.1, zf = A[1] - 0.045;
    const zb = C[1] + ((hx - C[0]) / (B[0] - C[0])) * (B[1] - C[1]) + 0.035; // inside the hypotenuse band
    for (const z of [zf, zb]) m.cyl(0.009, 0.011, 0.03, shade(WOOD, 0.75), hx, T + 0.015, z, 0, 0, 0, 8);
    m.cyl(0.013, 0.013, zf - zb + 0.03, 0xc8955a, hx, T + 0.034, (zf + zb) / 2, 90 * D, 0, 0, 8);
  },
});
