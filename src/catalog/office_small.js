// 工位开局 (office_small): desk clutter of an open-plan office floor — paperclips → monitors.
// Real sizes in metres, base on y = 0, front faces +Z. Decal keys use the prefix os_.
// Tier 0 (< 5 cm) stay around 60–100 triangles; desk items stay well under 400.
import * as THREE from 'three';
import { def } from './registry.js';
import { D, shade } from '../core/modeler.js';
import { decal, fitText, FONTS, getUV } from '../core/atlas.js';

const TAU = Math.PI * 2;
const INK = 0x2a1d17, BLK = 0x26262c, WHT = 0xf4f2ec, DARK = 0x3a3d45;
const SILVER = 0xc9cdd2, STEEL = 0x9aa0a6, RED = 0xd8342c, GOLD = 0xf2c14e;

// ---- local helpers ---------------------------------------------------------------------------
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const _up = V(0, 1, 0);
/** Euler XYZ turning local +Y towards (dx, dy, dz). */
function aim(dx, dy, dz) {
  const q = new THREE.Quaternion().setFromUnitVectors(_up, V(dx, dy, dz).normalize());
  const e = new THREE.Euler().setFromQuaternion(q, 'XYZ');
  return [e.x, e.y, e.z];
}
/** Euler XYZ turning local +Y along dir, with local +Z as close as possible to `up`. */
function orient(dir, up = [0, 1, 0]) {
  const y = V(...dir).normalize();
  const u = V(...up);
  const z = u.sub(y.clone().multiplyScalar(u.dot(y))).normalize();
  const x = new THREE.Vector3().crossVectors(y, z);
  const e = new THREE.Euler().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z), 'XYZ');
  return [e.x, e.y, e.z];
}
/** Cylinder rod from point a to point b. */
function rod(m, r, col, a, b, seg = 6) {
  const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
  const [rx, ry, rz] = aim(dx, dy, dz);
  m.cyl(r, r, Math.hypot(dx, dy, dz), col, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2, rx, ry, rz, seg);
}
function geoFrom(pos, both = false) {
  const p = pos.slice();
  if (both) for (let i = 0; i < pos.length; i += 9) p.push(...pos.slice(i, i + 3), ...pos.slice(i + 6, i + 9), ...pos.slice(i + 3, i + 6));
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
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

/** Heart-shaped leaf (pothos), notch at the origin, pointing +Y. */
const heartGeo = () => memo('heart', () => {
  const o = [[0, 0.1], [0.32, 0], [0.52, 0.28], [0.44, 0.62], [0, 1], [-0.44, 0.62], [-0.52, 0.28], [-0.32, 0]];
  const pos = [];
  for (let i = 0; i < o.length; i++) {
    const a = o[i], b = o[(i + 1) % o.length];
    pos.push(0, 0.42, 0.12, a[0], a[1], 0, b[0], b[1], 0);
  }
  return geoFrom(pos, true);
});
function leaf(m, len, wid, col, x, y, z, dir, up = [0, 1, 0]) {
  const [rx, ry, rz] = orient(dir, up);
  m.geo(heartGeo(), col, x, y, z, rx, ry, rz, wid, len, wid);
}

// canvas helpers
const rrect = (ctx, x, y, w, h, r, fill) => {
  ctx.fillStyle = fill; ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x, y, w, h, r); else ctx.rect(x, y, w, h);
  ctx.fill();
};
const circle = (ctx, x, y, r, fill) => { ctx.fillStyle = fill; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); };

// =============================================================================================
// Tier 0 (< 5 cm)
// =============================================================================================

// ---- 回形针: classic gem clip lying flat, one bent wire ---------------------------------------------
def('office_paperclip', {
  name: '回形针',
  cat: 'daily',
  sfx: 'tiny',
  fill: 0.25,
  // plastic-coated, so they read on the grey carpet (bare silver ones vanish into it)
  tints: [0xe8554a, 0x5aa9e6, 0xf2c14e, 0x5cae4f, 0xf29aa6, 0xd6dadf],
  build(m) {
    const r = 0.0008, P = (x, z) => [x, r * 0.5, z];
    const arc = (cx, cz, R, a0, a1, n) => {
      const o = [];
      for (let k = 1; k < n; k++) { const a = a0 + ((a1 - a0) * k) / n; o.push(P(cx + Math.cos(a) * R, cz + Math.sin(a) * R)); }
      return o;
    };
    const pts = [
      P(0.001, -0.003), P(0.001, 0.0085), ...arc(-0.0004, 0.0085, 0.0014, 0, Math.PI, 2),
      P(-0.0018, 0.0085), P(-0.0018, -0.0115), ...arc(0.0007, -0.0115, 0.0025, Math.PI, TAU, 3),
      P(0.0032, -0.0115), P(0.0032, 0.0115), ...arc(0, 0.0115, 0.0032, 0, Math.PI, 3),
      P(-0.0032, 0.0115), P(-0.0032, -0.0045),
    ];
    m.tint();
    wire(m, pts, r, 0xffffff);
    m.tint(0);
  },
});

// ---- 长尾夹: black triangular clip, silver wire handles raised in a V -------------------------------
function binderClip(m, s = 1) {
  const W = 0.032 * s, B = 0.0095 * s, J = 0.0016 * s, H = 0.0135 * s, r = 0.0007 * s;
  m.extrude([[-B, 0], [B, 0], [J, H], [-J, H]], W, 0x2b2d33, 0, 0, 0, 0, -90 * D, 0);
  m.sym(z => {
    const x0 = 0.011 * s;
    wire(m, [[-x0, H - 0.0007 * s, z * J], [-x0, 0.021 * s, z * 0.0085 * s], [-x0 + 0.003 * s, 0.0275 * s, z * 0.0135 * s],
      [x0 - 0.003 * s, 0.0275 * s, z * 0.0135 * s], [x0, 0.021 * s, z * 0.0085 * s], [x0, H - 0.0007 * s, z * J]], r, SILVER);
  });
}
def('office_binder_clip', {
  name: '长尾夹',
  cat: 'daily',
  sfx: 'tiny',
  fill: 0.3,
  build(m) { binderClip(m); },
});

// ---- 图钉: push pin lying tilted on its flange and needle tip, tinted head -----------------------------
def('office_pushpin', {
  name: '图钉',
  cat: 'daily',
  sfx: 'tiny',
  fill: 0.3,
  tints: [0xd8342c, 0x2f63c9, 0xf2c14e, 0x5cae4f],
  build(m) {
    m.push(0.002, 0.0046, 0, 0, 0, 56 * D);
    m.tint();
    m.lathe([[0, 0], [0.0055, 0], [0.0052, 0.0014], [0.002, 0.0028], [0.0024, 0.0078], [0.0042, 0.0098], [0, 0.0124]], 0xffffff, 0, 0, 0, 0, 0, 0, 6);
    m.tint(0);
    m.cone(0.0005, 0.008, SILVER, 0, -0.004, 0, Math.PI, 0, 0, 3);
    m.pop();
  },
});

// ---- 咖啡胶囊: little aluminium cup, rim down, dome up (打工人的五色石) -----------------------------------
def('office_capsule', {
  name: '咖啡胶囊',
  cat: 'daily',
  sfx: 'tiny',
  fill: 0.5,
  tints: [0xd8342c, 0xf2c14e, 0x2f63c9, 0x3a9f5c, 0x8a5ad0],
  build(m) {
    m.tint();
    m.lathe([[0, 0], [0.0185, 0], [0.0185, 0.0016], [0.015, 0.0022], [0.0118, 0.022], [0.0072, 0.0265], [0, 0.0272]],
      (x, y) => (y < 0.0018 ? 0xd4d4d4 : y > 0.026 ? 0xf0f0f0 : 0xffffff), 0, 0, 0, 0, 0, 0, 8);
    m.tint(0);
  },
});

// ---- U盘: tinted plastic body with a keyring hole, silver plug at +Z -------------------------------------
decal('os_usb', 40, 64, (ctx, w, h) => {
  circle(ctx, w / 2, h * 0.14, w * 0.12, '#26262c');
  fitText(ctx, '64G', w / 2, h * 0.55, w * 0.8, h * 0.22, FONTS.sans, '#f4f2ec');
  ctx.fillStyle = '#f4f2ec';
  ctx.beginPath(); ctx.moveTo(w / 2, h * 0.74); ctx.lineTo(w * 0.62, h * 0.86); ctx.lineTo(w * 0.38, h * 0.86); ctx.closePath(); ctx.fill();
});

def('office_usb', {
  name: 'U盘',
  cat: 'daily',
  sfx: 'tiny',
  fill: 0.8,
  tints: [0x2f63c9, 0xd8342c, 0x3a3d45, 0x5cae4f, 0xf2a14a],
  build(m) {
    const W = 0.018, H = 0.008;
    m.tint();
    m.box(W, H, 0.034, 0xffffff, 0, H / 2, -0.001);
    m.cyl(W / 2, W / 2, H, 0xffffff, 0, H / 2, -0.018, 0, 0, 0, 10);
    m.tint(0);
    m.box(0.012, 0.0045, 0.013, SILVER, 0, H / 2, 0.022);
    m.sym(s => m.box(0.0026, 0.0006, 0.0026, BLK, s * 0.0027, H / 2 + 0.0023, 0.023));
    m.decal(0.014, 0.0224, 'os_usb', 0, H + 0.0003, -0.012, -90 * D, 0, 0);
  },
});

// =============================================================================================
// Tier 1 (5–30 cm)
// =============================================================================================

// ---- 便利贴: tinted pad, top sheet curling up with a handwritten note --------------------------------
decal('os_sticky', 96, 96, (ctx, w, h) => {
  fitText(ctx, '今天一定', w * 0.48, h * 0.27, w * 0.92, h * 0.36, FONTS.brush, '#1f3f9a');
  fitText(ctx, '写周报!', w * 0.5, h * 0.62, w * 0.9, h * 0.36, FONTS.brush, '#1f3f9a');
  ctx.strokeStyle = '#d8342c'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(w * 0.12, h * 0.86); ctx.quadraticCurveTo(w * 0.5, h * 0.8, w * 0.9, h * 0.88); ctx.stroke();
});
decal('os_sheets', 96, 16, (ctx, w) => {
  ctx.fillStyle = '#fbf8ef';
  for (let y = 1; y < 16; y += 3) ctx.fillRect(0, y, w, 1);
});

def('office_sticky', {
  name: '便利贴',
  cat: 'daily',
  sfx: 'paper',
  fill: 0.95,
  tints: [0xf7d84a, 0xf59ab8, 0x9ad67a, 0x8fc8ef],
  build(m) {
    const S = 0.076, H = 0.011;
    m.tint();
    m.box(S, H, S, 0xffffff, 0, H / 2, 0);
    m.push(0, H, -S / 2, -4 * D, 0, 0); // top sheet peeling up at the front
    m.box(S, 0.0006, S, 0xffffff, 0, 0.0003, S / 2);
    m.tint(0);
    m.decal(S * 0.9, S * 0.9, 'os_sticky', 0, 0.0009, S / 2, -90 * D, 0, 0);
    m.pop();
    for (let k = 0; k < 4; k++) {
      const a = (k * Math.PI) / 2;
      m.decal(S, H * 0.9, 'os_sheets', Math.sin(a) * (S / 2 + 0.0003), H / 2, Math.cos(a) * (S / 2 + 0.0003), 0, a, 0);
    }
  },
});

// ---- 工牌: badge card in a clear holder, lanyard lying in a loop behind it ------------------------------
decal('os_badge', 80, 124, (ctx, w, h) => {
  ctx.fillStyle = '#f7f6f1'; ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#2f63c9'; ctx.fillRect(0, 0, w, h * 0.2);
  fitText(ctx, '幸福科技', w / 2, h * 0.1, w * 0.84, h * 0.13, FONTS.round, '#ffffff');
  rrect(ctx, w * 0.26, h * 0.25, w * 0.48, h * 0.38, 3, '#cfe0f2');
  circle(ctx, w / 2, h * 0.39, w * 0.11, '#7c8796');
  ctx.fillStyle = '#7c8796';
  ctx.beginPath(); ctx.ellipse(w / 2, h * 0.63, w * 0.18, h * 0.1, 0, Math.PI, TAU); ctx.fill();
  fitText(ctx, '工牌', w / 2, h * 0.74, w * 0.6, h * 0.14, FONTS.sans, '#26262c');
  fitText(ctx, '打工人 No.996', w / 2, h * 0.86, w * 0.8, h * 0.07, FONTS.sans, '#6d6457');
  ctx.fillStyle = '#26262c';
  for (let x = w * 0.2; x < w * 0.8; x += 3 + (x % 5 > 2 ? 1 : 0)) ctx.fillRect(x, h * 0.92, (x * 7) % 3 > 1 ? 2 : 1, h * 0.05);
});

def('office_badge', {
  name: '工牌',
  cat: 'daily',
  sfx: 'paper',
  fill: 0.25,
  tints: [0x2f63c9, 0xd8342c, 0x3a3d45, 0x2aa198, 0xf2a14a],
  build(m) {
    const W = 0.056, L = 0.088, T = 0.003, cz = 0.02;
    m.box(W, T, L, 0xdfe8ec, 0, T / 2, cz); // clear holder
    m.decal(W - 0.004, L - 0.004, 'os_badge', 0, T + 0.0003, cz, -90 * D, 0, 0);
    // clip + slot at the top edge
    m.box(0.012, 0.0035, 0.012, SILVER, 0, 0.002, cz - L / 2 - 0.004);
    m.box(0.014, 0.0006, 0.003, BLK, 0, T + 0.0002, cz - L / 2 + 0.004);
    // lanyard ribbon in a loose loop
    const pts = [], R = 0.029, c = -0.064;
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * TAU;
      pts.push([Math.sin(a) * R * 1.15, 0.0009, c + Math.cos(a) * R]);
    }
    m.tint();
    wire(m, pts, 0.0055, 0xffffff, { sides: 4, rh: 0.0007, closed: true });
    m.tint(0);
  },
});

// ---- 耳机: white earbud case standing up, two buds lying in front -----------------------------------
def('office_earbuds', {
  name: '耳机',
  cat: 'daily',
  sfx: 'hard',
  fill: 0.6,
  build(m) {
    const W = 0.05, H = 0.058, Dp = 0.024;
    m.rbox(W, H, Dp, 0.011, WHT, 0, H / 2, 0);
    m.box(W - 0.001, 0.0008, Dp + 0.0004, 0xb8bcc2, 0, H * 0.72, 0); // lid seam
    m.sphere(0.0013, 0x5cd06a, 0, H * 0.5, Dp / 2 + 0.0002, 1, 1, 0.5, 0, 0, 0, 5); // charge LED
    m.box(0.006, 0.0012, 0.0012, SILVER, 0, 0.012, Dp / 2 + 0.0002); // port hint (hinge-like)
    // two buds lying in front, stems pointing outward
    m.sym(s => {
      m.sphere(0.0085, WHT, s * 0.012, 0.0082, 0.03, 1, 0.95, 1, 0, 0, 0, 6);
      m.sphere(0.0042, 0x6d7380, s * 0.008, 0.0105, 0.035, 1, 1, 0.6, 0, 0, 0, 4);
      m.capsule(0.0027, 0.014, WHT, s * 0.025, 0.0039, 0.033, 0, 0, s * 80 * D, 4);
    });
  },
});

// ---- 咖啡杯: paper takeaway cup, dark lid with sip hole, tinted sleeve ---------------------------------
decal('os_sleeve', 96, 40, (ctx, w, h) => {
  ctx.fillStyle = '#fbf7ee';
  ctx.beginPath(); ctx.ellipse(w * 0.22, h * 0.5, w * 0.08, h * 0.32, 0.3, 0, TAU); ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.9)'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(w * 0.2, h * 0.22); ctx.quadraticCurveTo(w * 0.26, h * 0.5, w * 0.22, h * 0.8); ctx.stroke();
  fitText(ctx, '续命', w * 0.62, h * 0.5, w * 0.5, h * 0.7, FONTS.round, '#fbf7ee');
});

def('office_coffee', {
  name: '咖啡杯',
  cat: 'daily',
  sfx: 'paper',
  fill: 0.6,
  tints: [0xc8955a, 0x3a8f5c, 0xd8342c, 0x2c3e66],
  build(m) {
    m.lathe([[0, 0], [0.029, 0], [0.03, 0.002], [0.04, 0.104], [0.0412, 0.105]], WHT, 0, 0, 0, 0, 0, 0, 12);
    // sleeve: a cone band slightly proud of the cup
    const y0 = 0.034, y1 = 0.076, r = y => 0.03 + (0.01 * (y - 0.002)) / 0.102 + 0.0012;
    m.tint();
    m.cyl(r(y1), r(y0), y1 - y0, 0xffffff, 0, (y0 + y1) / 2, 0, 0, 0, 0, 12);
    m.tint(0);
    band(m, 'os_sleeve', r(y1) + 0.0004, r(y0) + 0.0004, (y1 - y0) * 0.8, 1.6, 6, 0, (y0 + y1) / 2, 0);
    // lid
    m.lathe([[0, 0.103], [0.0418, 0.103], [0.0434, 0.106], [0.0434, 0.111], [0.039, 0.113], [0.036, 0.118], [0, 0.1195]], 0x4a4d55, 0, 0, 0, 0, 0, 0, 12);
    m.box(0.009, 0.0016, 0.0035, BLK, 0, 0.1194, 0.025);
  },
});

// ---- 鼠标: egg-shaped dome, centre seam, scroll wheel at the front (+Z) ---------------------------------
def('office_mouse', {
  name: '鼠标',
  cat: 'daily',
  sfx: 'hard',
  fill: 0.6,
  build(m) {
    const ax = 0.031, ay = 0.036, az = 0.055;
    m.dome(1, 0xe6e8ec, 0, 0, -0.002, ax, ay, az, 0, 0, 0, 10);
    m.cyl(ax * 0.98, ax * 0.98, 0.003, 0x6d7380, 0, 0.0015, -0.002, 0, 0, 0, 10); // dark sole edge
    const top = z => ay * Math.sqrt(Math.max(0, 1 - ((z + 0.002) / az) ** 2));
    const seam = [];
    for (const z of [0.052, 0.045, 0.034, 0.02, 0.008]) seam.push([0, top(z) + 0.0002, z]);
    wire(m, seam, 0.0007, 0x7c8494);
    m.cyl(0.0058, 0.0058, 0.0042, DARK, 0, top(0.03) - 0.0005, 0.03, 0, 0, 90 * D, 8);
    m.sphere(0.0018, 0x5aa9e6, 0, top(-0.02) + 0.0002, -0.02, 1, 0.5, 1, 0, 0, 0, 5); // DPI light
  },
});

// ---- 订书机: dark base, tinted top arm, silver magazine, hinge at the back, nose at +Z -----------------
def('office_stapler', {
  name: '订书机',
  cat: 'daily',
  sfx: 'metal',
  fill: 0.5,
  tints: [0xd8342c, 0x2f63c9, 0x3a3d45, 0xf2a14a],
  build(m) {
    // profiles drawn in (z, y), extruded across x
    m.extrude([[-0.075, 0], [0.07, 0], [0.075, 0.004], [0.072, 0.008], [-0.075, 0.008]], 0.036, DARK, 0, 0, 0, 0, -90 * D, 0);
    m.box(0.016, 0.0012, 0.02, SILVER, 0, 0.0084, 0.056); // anvil
    m.box(0.026, 0.007, 0.128, SILVER, 0, 0.0115, 0.002); // magazine
    m.cyl(0.0065, 0.0065, 0.03, DARK, 0, 0.012, -0.068, 0, 0, 90 * D, 8); // hinge
    m.tint();
    m.extrude([[-0.074, 0.013], [0.068, 0.015], [0.075, 0.019], [0.075, 0.027], [0.066, 0.033], [0.03, 0.041], [-0.04, 0.046], [-0.068, 0.043], [-0.076, 0.033]],
      0.034, 0xffffff, 0, 0, 0, 0, -90 * D, 0, 0.002);
    m.tint(0);
    m.box(0.03, 0.002, 0.03, shade(DARK, 1.2), 0, 0.0465, -0.03); // grip pad
  },
});

// ---- 周报: stack of A4 with a bold cover, binder clip on the top edge --------------------------------
decal('os_report', 128, 180, (ctx, w, h) => {
  ctx.fillStyle = '#fbfaf5'; ctx.fillRect(0, 0, w, h);
  fitText(ctx, '2026 · 第41周', w / 2, h * 0.12, w * 0.6, h * 0.06, FONTS.sans, '#7c8796');
  fitText(ctx, '周报', w / 2, h * 0.28, w * 0.74, h * 0.2, FONTS.sans, '#26262c', '900');
  ctx.fillStyle = '#d8342c'; ctx.fillRect(w * 0.2, h * 0.4, w * 0.6, 3);
  const lines = ['本周工作:', '1. 开会', '2. 对齐', '3. 写周报', '下周: 继续开会'];
  lines.forEach((t, i) => {
    ctx.save(); ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.font = `bold ${Math.round(h * 0.05)}px ${FONTS.sans}`; ctx.fillStyle = '#5a5e68';
    ctx.fillText(t, w * 0.14, h * (0.5 + i * 0.08)); ctx.restore();
  });
  ctx.strokeStyle = '#d8342c'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(w * 0.78, h * 0.6, w * 0.12, 0, TAU); ctx.stroke();
  fitText(ctx, '待改', w * 0.78, h * 0.6, w * 0.16, h * 0.06, FONTS.sans, '#d8342c');
});
decal('os_pages', 96, 24, (ctx, w, h) => {
  ctx.fillStyle = '#f4f1e8'; ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#d3cdbd';
  for (let y = 1; y < h; y += 2) ctx.fillRect(0, y, w, 1);
});

def('office_report', {
  name: '周报',
  cat: 'daily',
  sfx: 'paper',
  fill: 0.95,
  build(m) {
    const W = 0.21, L = 0.297, T = 0.03, n = 3, sides = { px: 'os_pages', nx: 'os_pages', pz: 'os_pages', nz: 'os_pages' };
    for (let i = 0; i < n; i++) {
      const yaw = i === n - 1 ? 0 : m.rng.range(-0.035, 0.035);
      m.tbox(W, T / n, L, 0xf6f3ec, sides, m.rng.range(-0.003, 0.003), (i + 0.5) * (T / n), 0, 0, yaw, 0);
    }
    m.decal(W * 0.98, L * 0.98, 'os_report', 0, T + 0.0004, 0, -90 * D, 0, 0);
    // black binder clip biting the back edge, handles folded flat on top
    const zc = -L / 2;
    m.box(0.05, 0.004, 0.02, 0x2b2d33, 0, T + 0.002, zc + 0.008);
    m.box(0.05, T + 0.004, 0.004, 0x2b2d33, 0, (T + 0.004) / 2, zc - 0.002);
    wire(m, [[-0.019, T + 0.0045, zc + 0.016], [-0.019, T + 0.0045, zc + 0.04], [-0.014, T + 0.0045, zc + 0.045], [0.014, T + 0.0045, zc + 0.045], [0.019, T + 0.0045, zc + 0.04], [0.019, T + 0.0045, zc + 0.016]], 0.0012, SILVER);
  },
});

// ---- 键盘: low tilted slab, key rows as strips with key-gap decals --------------------------------------
decal('os_kb_row', 256, 16, (ctx, w, h) => {
  ctx.fillStyle = '#4a4e58';
  const main = w * 0.74;
  for (let k = 1; k < 14; k++) ctx.fillRect((k * main) / 14 - 1, 0, 2, h);
  ctx.fillRect(main - 2, 0, 5, h);
  for (let k = 1; k < 4; k++) ctx.fillRect(main + (k * (w - main)) / 4 - 1, 0, 2, h);
});
decal('os_kb_top', 256, 16, (ctx, w, h) => {
  ctx.fillStyle = '#f2a14a'; ctx.fillRect(0, 0, w * 0.05, h);
  ctx.fillStyle = '#4a4e58';
  const main = w * 0.74;
  for (let k = 1; k < 14; k++) ctx.fillRect((k * main) / 14 - 1, 0, k % 4 === 1 ? 4 : 2, h);
  ctx.fillRect(main - 2, 0, 5, h);
  for (let k = 1; k < 4; k++) ctx.fillRect(main + (k * (w - main)) / 4 - 1, 0, 2, h);
});
decal('os_kb_space', 256, 16, (ctx, w, h) => {
  ctx.fillStyle = '#4a4e58';
  const main = w * 0.74;
  for (const f of [0.08, 0.16, 0.24, 0.68, 0.76, 0.84, 0.92]) ctx.fillRect(f * main - 1, 0, 2, h);
  ctx.fillRect(main - 2, 0, 5, h);
  for (let k = 1; k < 4; k++) ctx.fillRect(main + (k * (w - main)) / 4 - 1, 0, 2, h);
  ctx.fillStyle = '#5aa9e6'; ctx.fillRect(w - (w - main) / 4 + 2, 0, (w - main) / 4 - 2, h); // enter
});

def('office_keyboard', {
  name: '键盘',
  cat: 'daily',
  sfx: 'hard',
  fill: 0.7,
  build(m) {
    const W = 0.44, Ld = 0.145, h0 = 0.012, h1 = 0.026;
    m.extrude([[-Ld / 2, 0], [Ld / 2, 0], [Ld / 2, h0], [-Ld / 2, h1]], W, DARK, 0, 0, 0, 0, -90 * D, 0);
    const ang = Math.atan2(h1 - h0, Ld);
    m.push(0, (h0 + h1) / 2, 0, ang, 0, 0);
    const kw = W - 0.024, rows = [[0.052, 0.012, 'os_kb_top'], [0.031, 0.02, 'os_kb_row'], [0.009, 0.02, 'os_kb_row'], [-0.013, 0.02, 'os_kb_row'], [-0.035, 0.02, 'os_kb_row'], [-0.057, 0.02, 'os_kb_space']];
    for (const [z, d, key] of rows) {
      m.box(kw, 0.007, d, 0xe4e6ea, 0, 0.0035, -z);
      m.decal(kw, d, key, 0, 0.0072, -z, -90 * D, 0, 0);
    }
    m.pop();
    m.sym(s => m.box(0.004, 0.0015, 0.004, 0x5cd06a, -W / 2 + 0.03 + s * 0.006, h1 - 0.0015, -Ld / 2 + 0.006, ang, 0, 0)); // lock LEDs
  },
});

// ---- 工位绿萝: white pot with a happy face, a 升职加薪 stake, vines trailing over the desk -------------
decal('os_pot_face', 64, 40, (ctx, w, h) => {
  circle(ctx, w * 0.34, h * 0.4, w * 0.045, '#2a1d17');
  circle(ctx, w * 0.66, h * 0.4, w * 0.045, '#2a1d17');
  circle(ctx, w * 0.22, h * 0.6, w * 0.07, '#f6b3b9');
  circle(ctx, w * 0.78, h * 0.6, w * 0.07, '#f6b3b9');
  ctx.strokeStyle = '#2a1d17'; ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.arc(w / 2, h * 0.5, w * 0.08, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke();
});
decal('os_stake', 48, 32, (ctx, w, h) => {
  rrect(ctx, 0, 0, w, h, 4, '#f2c14e');
  fitText(ctx, '升职', w / 2, h * 0.3, w * 0.8, h * 0.38, FONTS.round, '#b8322a');
  fitText(ctx, '加薪', w / 2, h * 0.72, w * 0.8, h * 0.38, FONTS.round, '#b8322a');
});

def('office_pothos', {
  name: '工位绿萝',
  cat: 'plant',
  sfx: 'soft',
  fill: 0.3,
  build(m) {
    const rr = 0.058, py = 0.095, sy = py - 0.01;
    m.lathe([[0, 0], [0.044, 0], [0.048, 0.006], [0.056, 0.085], [rr, 0.09], [rr, py], [rr - 0.008, py], [rr - 0.012, sy], [0, sy]],
      (x, y, z) => (y > sy - 0.001 && Math.hypot(x, z) < rr - 0.009 ? 0x5a3e2b : WHT), 0, 0, 0, 0, 0, 0, 10);
    band(m, 'os_pot_face', 0.0569, 0.0539, 0.03, 1.2, 4, 0, 0.05, 0);
    // stake card
    m.box(0.003, 0.08, 0.002, 0xb07a4f, 0.025, sy + 0.035, -0.02);
    m.tbox(0.036, 0.024, 0.002, GOLD, { pz: 'os_stake' }, 0.025, sy + 0.075, -0.018);
    const G = [0x3f8f4a, 0x5cae4f, 0x7cbf4a, 0xa6c94e];
    for (let i = 0; i < 8; i++) { // leaf mound
      const a = i * 2.4, r = 0.012 + (i % 3) * 0.018, up = 0.35 + (i % 4) * 0.25;
      leaf(m, 0.075, 0.068, G[i % 4], Math.cos(a) * r, sy + 0.008 + (i % 3) * 0.022, Math.sin(a) * r, [Math.cos(a), up, Math.sin(a)]);
    }
    for (let v = 0; v < 4; v++) { // vines over the rim and along the desk
      const a = (v + 0.5) * (Math.PI / 2) + 0.3, c = Math.cos(a), s = Math.sin(a), side = v % 2 ? 1 : -1;
      const P = (r, y, off) => [c * r - s * off * side, y, s * r + c * off * side];
      const far = v % 2 ? 0.125 : 0.11;
      const pts = [P(0.035, sy + 0.012, 0), P(0.064, py + 0.002, 0.004), P(0.07, 0.05, 0.01), P(0.08, 0.006, 0.02), P(far, 0.004, 0.035)];
      m.tube(pts, 0.0024, 0x4f8a32, 3, false, 7);
      leaf(m, 0.06, 0.055, G[(v + 1) % 4], pts[2][0], pts[2][1] + 0.01, pts[2][2], [c, -0.4, s]);
      leaf(m, 0.055, 0.05, G[(v + 2) % 4], pts[4][0], 0.004, pts[4][2], [c, 0.15, s]);
    }
  },
});

// =============================================================================================
// Desk items 30 cm+
// =============================================================================================

// ---- 台灯: tinted round base and shade, silver double arms, glowing bulb, head reaching +Z -----------
def('office_lamp', {
  name: '台灯',
  cat: 'daily',
  sfx: 'metal',
  fill: 0.2,
  tints: [0xf4f2ec, 0x2aa198, 0xf2c14e, 0x3a3d45, 0xe8554a],
  build(m) {
    const B = [0, 0.03, -0.05], J = [0, 0.29, -0.11], H = [0, 0.41, 0.09];
    const d = V(0, -0.78, 0.62).normalize();
    m.tint();
    m.cyl(0.068, 0.075, 0.024, 0xffffff, 0, 0.012, -0.04, 0, 0, 0, 12);
    const [rx, ry, rz] = aim(-d.x, -d.y, -d.z);
    const at = t => [H[0] + d.x * t, H[1] + d.y * t, H[2] + d.z * t];
    const sc = at(0.045);
    m.cyl(0.024, 0.066, 0.09, 0xffffff, sc[0], sc[1], sc[2], rx, ry, rz, 12);
    m.tint(0);
    m.box(0.022, 0.008, 0.016, DARK, 0.03, 0.026, 0.0); // switch
    m.sym(s => {
      rod(m, 0.0045, SILVER, [s * 0.009, B[1], B[2]], [s * 0.009, J[1], J[2]], 6);
      rod(m, 0.0045, SILVER, [s * 0.009, J[1], J[2]], [s * 0.009, H[1], H[2]], 6);
    });
    m.cyl(0.012, 0.012, 0.03, DARK, B[0], B[1], B[2], 0, 0, 90 * D, 8);
    m.cyl(0.012, 0.012, 0.03, DARK, J[0], J[1], J[2], 0, 0, 90 * D, 8);
    m.cyl(0.012, 0.012, 0.03, DARK, H[0], H[1], H[2], 0, 0, 90 * D, 8);
    m.glow(1);
    const bc = at(0.0905), bb = at(0.085);
    m.disc(0.061, 0xfff3cc, bc[0], bc[1], bc[2], rx, ry, rz, 12);
    m.sphere(0.024, 0xfff8dc, bb[0], bb[1], bb[2], 1, 1, 1, 0, 0, 0, 8);
    m.glow(0);
  },
});

// ---- U型枕: plump tinted U, opening at the front, snap strap across the gap ---------------------------
def('office_neck_pillow', {
  name: 'U型枕',
  cat: 'daily',
  sfx: 'soft',
  fill: 0.45,
  tints: [0x8fc8ef, 0xf59ab8, 0xf2c14e, 0x9aa0a6, 0x2c3e66],
  build(m) {
    const R = 0.093, t = 0.05, gap = 64 * D, sq = 0.82;
    m.push(0, t * sq, 0, 0, 0, 0, [1, sq, 1]);
    m.tint();
    m.torus(R, t, 0xffffff, 0, 0, 0, -90 * D, 0, -90 * D + gap / 2, TAU - gap, 8, 16);
    for (const a of [-90 * D + gap / 2, 270 * D - gap / 2]) m.sphere(t, 0xffffff, Math.cos(a) * R, 0, -Math.sin(a) * R, 1, 1, 1, 0, 0, 0, 8);
    m.tint(0);
    m.pop();
    // strap with a snap button
    const ez = Math.cos(gap / 2) * R;
    m.box(Math.sin(gap / 2) * R * 2 + 0.02, 0.004, 0.022, 0x6d7380, 0, t * sq * 1.3, ez + 0.012);
    m.cyl(0.006, 0.006, 0.003, SILVER, 0, t * sq * 1.3 + 0.003, ez + 0.012, 0, 0, 0, 8);
    m.box(0.02, 0.0008, 0.012, WHT, -0.06, t * sq * 1.98, -0.06, 0, 0.6, 0); // sewn label
  },
});

// ---- 零食盒: open kraft box, chip bags, 辣条, biscuits sticking out --------------------------------------
decal('os_snack_box', 128, 36, (ctx, w, h) => {
  rrect(ctx, w * 0.08, h * 0.1, w * 0.84, h * 0.8, 8, '#f6efe0');
  fitText(ctx, '摸鱼补给站', w / 2, h / 2, w * 0.74, h * 0.6, FONTS.round, '#b8322a');
});
decal('os_chips', 40, 48, (ctx, w, h) => {
  circle(ctx, w / 2, h * 0.42, w * 0.3, '#f6efe0');
  circle(ctx, w / 2, h * 0.42, w * 0.2, '#f2c14e');
  fitText(ctx, '薯片', w / 2, h * 0.84, w * 0.8, h * 0.2, FONTS.round, '#f6efe0');
});
decal('os_latiao', 48, 24, (ctx, w, h) => {
  ctx.fillStyle = '#d21f26'; ctx.fillRect(0, 0, w, h);
  fitText(ctx, '辣条', w / 2, h / 2, w * 0.8, h * 0.76, FONTS.brush, '#f2c14e');
});

def('office_snack_box', {
  name: '零食盒',
  cat: 'food',
  sfx: 'paper',
  fill: 0.6,
  build(m) {
    const W = 0.25, L = 0.17, H = 0.075, t = 0.004, kraft = 0xc8955a;
    m.box(W, t, L, kraft, 0, t / 2, 0);
    m.sym(s => m.box(t, H, L, shade(kraft, 0.93), s * (W / 2 - t / 2), H / 2, 0));
    m.box(W, H, t, kraft, 0, H / 2, L / 2 - t / 2);
    m.box(W, H, t, kraft, 0, H / 2, -L / 2 + t / 2);
    m.decal(W * 0.7, W * 0.7 * (36 / 128), 'os_snack_box', 0, H * 0.5, L / 2 + 0.0006);
    // puffy chip bags leaning in the back row
    [[-0.07, 0x2f63c9, 0.15], [0.0, RED, -0.08], [0.075, 0x3a9f5c, -0.2]].forEach(([x, col, lean]) => {
      m.push(x, 0.075, -0.035, -0.18, 0, lean);
      m.ellipsoid(0.038, 0.06, 0.016, col, 0, 0, 0, 0, 0, 0, 6);
      m.box(0.066, 0.008, 0.008, shade(col, 0.85), 0, 0.058, 0);
      m.decal(0.036, 0.043, 'os_chips', 0, -0.002, 0.0158);
      m.pop();
    });
    // 辣条 packet leaning on the front wall
    m.tbox(0.06, 0.09, 0.006, RED, { pz: 'os_latiao' }, -0.08, 0.06, 0.05, 0.25, 0, 0.1);
    // biscuit roll lying across the front
    m.cyl(0.022, 0.022, 0.1, GOLD, 0.045, 0.03, 0.045, 0, 0, 90 * D, 8);
    m.cyl(0.023, 0.023, 0.03, 0xd9a35a, 0.045, 0.03, 0.045, 0, 0, 90 * D, 8);
  },
});

// ---- 显示器: 24-inch monitor, glowing slide editor on screen, stand behind ------------------------------
decal('os_monitor', 256, 148, (ctx, w, h) => {
  ctx.fillStyle = '#e9edf3'; ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#c8502e'; ctx.fillRect(0, 0, w, h * 0.12);
  fitText(ctx, '方案_终版_v8.pptx', w * 0.5, h * 0.06, w * 0.6, h * 0.09, FONTS.sans, '#ffffff');
  ctx.fillStyle = '#d4dae3'; ctx.fillRect(0, h * 0.12, w * 0.16, h * 0.88);
  for (let k = 0; k < 4; k++) rrect(ctx, w * 0.02, h * (0.16 + k * 0.2), w * 0.12, h * 0.15, 2, k === 1 ? '#ffffff' : '#f4f6f9');
  ctx.fillStyle = '#ffffff'; ctx.fillRect(w * 0.2, h * 0.17, w * 0.76, h * 0.78);
  fitText(ctx, '赋能 · 抓手 · 闭环', w * 0.58, h * 0.27, w * 0.6, h * 0.1, FONTS.sans, '#26262c');
  const bars = [0.14, 0.24, 0.36, 0.5], cols = ['#5aa9e6', '#5aa9e6', '#5aa9e6', '#e8554a'];
  bars.forEach((b, i) => { ctx.fillStyle = cols[i]; ctx.fillRect(w * (0.3 + i * 0.12), h * (0.88 - b), w * 0.08, h * b); });
  ctx.fillStyle = '#9aa0a6'; ctx.fillRect(w * 0.27, h * 0.88, w * 0.56, 2);
  ctx.strokeStyle = '#e8554a'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(w * 0.32, h * 0.66); ctx.lineTo(w * 0.78, h * 0.4); ctx.stroke();
  ctx.fillStyle = '#e8554a';
  ctx.beginPath(); ctx.moveTo(w * 0.81, h * 0.37); ctx.lineTo(w * 0.74, h * 0.39); ctx.lineTo(w * 0.78, h * 0.45); ctx.closePath(); ctx.fill();
});

def('office_monitor', {
  name: '显示器',
  cat: 'daily',
  sfx: 'glass',
  fill: 0.35,
  build(m) {
    const W = 0.54, H = 0.325, T = 0.018, yb = 0.115, yc = yb + H / 2;
    m.box(W, H, T, BLK, 0, yc, 0);
    m.box(0.3, 0.19, 0.03, 0x34363d, 0, yc - 0.01, -T / 2 - 0.014); // back hump
    m.box(0.05, 0.19, 0.018, 0x5a5e68, 0, 0.1, -0.05); // neck
    m.box(0.24, 0.012, 0.17, 0x5a5e68, 0, 0.006, -0.03); // foot
    m.box(0.06, 0.004, 0.003, 0x44464e, 0, yb + 0.012, T / 2 + 0.001); // chin badge
    m.sphere(0.002, 0x5cd06a, 0.24, yb + 0.012, T / 2 + 0.0005, 1, 1, 0.5, 0, 0, 0, 5);
    m.glow(1);
    m.decal(W - 0.02, H - 0.035, 'os_monitor', 0, yc + 0.006, T / 2 + 0.0008);
    m.glow(0);
  },
});

// ---- 笔记本电脑: open laptop, glowing group-chat screen full of 收到 ------------------------------------
decal('os_laptop', 160, 104, (ctx, w, h) => {
  ctx.fillStyle = '#f1f3f6'; ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#2f63c9'; ctx.fillRect(0, 0, w, h * 0.14);
  fitText(ctx, '项目冲刺群(99+)', w * 0.5, h * 0.07, w * 0.7, h * 0.1, FONTS.sans, '#ffffff');
  const msg = [['收到', 0], ['收到', 0], ['收到!', 0], ['好的', 1], ['收到', 0]];
  msg.forEach(([t, me], i) => {
    const y = h * (0.22 + i * 0.155);
    circle(ctx, me ? w * 0.92 : w * 0.08, y + h * 0.05, h * 0.05, me ? '#f2a14a' : ['#5cae4f', '#e8554a', '#8a5ad0', '', '#5aa9e6'][i]);
    rrect(ctx, me ? w * 0.62 : w * 0.15, y, w * 0.23, h * 0.11, 4, me ? '#9ad67a' : '#ffffff');
    fitText(ctx, t, me ? w * 0.735 : w * 0.265, y + h * 0.055, w * 0.18, h * 0.08, FONTS.sans, '#26262c');
  });
});
decal('os_laptop_kb', 128, 92, (ctx, w, h) => {
  ctx.fillStyle = '#3a3d45'; ctx.fillRect(w * 0.06, h * 0.06, w * 0.88, h * 0.52);
  ctx.fillStyle = '#5a5e68';
  for (let r = 0; r < 5; r++) for (let c = 0; c < 13; c++) {
    if (r === 4 && c > 3 && c < 9) continue;
    ctx.fillRect(w * (0.075 + c * 0.066), h * (0.08 + r * 0.1), w * 0.056, h * 0.08);
  }
  ctx.fillRect(w * (0.075 + 4 * 0.066), h * 0.48, w * 0.32, h * 0.08);
  rrect(ctx, w * 0.33, h * 0.64, w * 0.34, h * 0.3, 3, '#b9bec6');
});
decal('os_lid_sticker', 48, 48, (ctx, w, h) => {
  circle(ctx, w / 2, h / 2, w * 0.46, '#f2c14e');
  fitText(ctx, '摸鱼', w / 2, h / 2, w * 0.7, h * 0.4, FONTS.round, '#b8322a');
});

def('office_laptop', {
  name: '笔记本电脑',
  cat: 'daily',
  sfx: 'hard',
  fill: 0.35,
  build(m) {
    const W = 0.32, T = 0.014, L = 0.22, LH = 0.205, LT = 0.007, al = 0xc9cdd2;
    m.box(W, T, L, al, 0, T / 2, 0);
    m.decal(W * 0.98, L * 0.96, 'os_laptop_kb', 0, T + 0.0003, 0.002, -90 * D, 0, 0);
    m.push(0, T, -L / 2 + 0.004, -16 * D, 0, 0);
    m.box(W, LH, LT, al, 0, LH / 2, -LT / 2);
    m.box(W - 0.006, LH - 0.006, 0.0015, BLK, 0, LH / 2, 0.0006);
    m.decal(0.08, 0.08, 'os_lid_sticker', 0.06, LH * 0.55, -LT - 0.0004, 0, Math.PI, 0);
    m.glow(1);
    m.decal(W - 0.024, LH - 0.03, 'os_laptop', 0, LH / 2 + 0.003, 0.0018);
    m.glow(0);
    m.pop();
  },
});

// ---- 马克杯: white mug, 不想上班 print on the front, handle on +X, coffee inside ---------------------------
decal('os_mug', 96, 64, (ctx, w, h) => {
  fitText(ctx, '不想', w / 2, h * 0.26, w * 0.66, h * 0.46, FONTS.brush, '#26262c');
  fitText(ctx, '上班', w / 2, h * 0.74, w * 0.66, h * 0.46, FONTS.brush, '#26262c');
  ctx.fillStyle = '#5aa9e6';
  ctx.beginPath(); ctx.ellipse(w * 0.12, h * 0.5, 4, 7, 0, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.ellipse(w * 0.88, h * 0.5, 4, 7, 0, 0, TAU); ctx.fill();
});

def('office_mug', {
  name: '马克杯',
  cat: 'daily',
  sfx: 'hard',
  fill: 0.6,
  build(m) {
    const R = 0.042, H = 0.096, ri = 0.039;
    m.lathe([[0, 0], [R - 0.002, 0], [R, 0.004], [R, H], [ri, H], [ri, 0.008], [0, 0.008]],
      (x, y, z) => (Math.hypot(x, z) < ri + 0.001 && y > 0.007 ? 0x8fc8ef : WHT), 0, 0, 0, 0, 0, 0, 14);
    m.disc(ri - 0.0003, 0x5a3a24, 0, 0.078, 0, 0, 0, 0, 14);
    m.torus(0.023, 0.0065, WHT, R - 0.001, 0.05, 0, 0, 0, -90 * D, Math.PI, 5, 8);
    band(m, 'os_mug', R + 0.0004, R + 0.0004, 0.05, 2.0, 7, 0, 0.05, 0);
  },
});
