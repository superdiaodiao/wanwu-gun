// 街道 · 小摊 · 小区设施 — street furniture, food stalls and courtyard fixtures of a lively
// Chinese neighbourhood. Real sizes in metres, base on y = 0, front faces +Z.
import * as THREE from 'three';
import { def } from './registry.js';
import { D, shade, mix } from '../core/modeler.js';
import { decal, fitText, verticalText, FONTS } from '../core/atlas.js';

// ---- local helpers -----------------------------------------------------------------------------
const UP = new THREE.Vector3(0, 1, 0);
const _d = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const ICO = new THREE.IcosahedronGeometry(1, 0);

/** Euler XYZ that turns local +Y towards direction dir [x, y, z]. */
function yTo(dir) {
  _d.set(dir[0], dir[1], dir[2]).normalize();
  _q.setFromUnitVectors(UP, _d);
  _e.setFromQuaternion(_q, 'XYZ');
  return [_e.x, _e.y, _e.z];
}
/** length, midpoint and rotation of the segment a → b */
function seg3(a, b) {
  const v = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const len = Math.hypot(v[0], v[1], v[2]);
  return [len, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2, ...yTo(v)];
}
/** round rod from a to b (radius ra at a, rb at b) */
function rod(m, a, b, ra, col, seg = 8, rb = ra) {
  const [len, x, y, z, rx, ry, rz] = seg3(a, b);
  m.cyl(rb, ra, len, col, x, y, z, rx, ry, rz, seg);
}
/** square bar from a to b */
function bar(m, a, b, w, col, d = w) {
  const [len, x, y, z, rx, ry, rz] = seg3(a, b);
  m.box(w, len, d, col, x, y, z, rx, ry, rz);
}
/** cheap 20-triangle ball */
function ball(m, r, col, x, y, z, sx = 1, sy = 1, sz = 1) {
  m.geo(ICO, col, x, y, z, 0, 0, 0, r * sx, r * sy, r * sz);
}
/** soft puff of smoke / steam */
function puff(m, r, col, x, y, z) {
  m.sphere(r, col, x, y, z, 1, 0.8, 1, 0, 0.4, 0, 7);
}
/** bent pipe through points, with ball elbows */
function pipeLine(m, pts, r, col, seg = 8) {
  for (let i = 0; i < pts.length - 1; i++) rod(m, pts[i], pts[i + 1], r, col, seg);
  for (let i = 1; i < pts.length - 1; i++) ball(m, r * 1.12, col, pts[i][0], pts[i][1], pts[i][2]);
}
/** cone whose tip points along dir, base centre at p */
function coneAt(m, p, dir, r, h, col, seg = 5) {
  const n = Math.hypot(dir[0], dir[1], dir[2]);
  const [rx, ry, rz] = yTo(dir);
  m.cone(r, h, col, p[0] + dir[0] / n * h / 2, p[1] + dir[1] / n * h / 2, p[2] + dir[2] / n * h / 2, rx, ry, rz, seg);
}
const hash3 = (x, y, z) => { const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453; return s - Math.floor(s); };
/** per-vertex mottled colour (granite, concrete) */
const speckle = (hex, amt = 0.14) => (x, y, z) => shade(hex, 1 - amt / 2 + amt * hash3(x, y, z));

// canvas helpers for decals
/** register a decal at a reduced atlas resolution while drawing in its design size */
function decalS(key, w, h, k, draw) {
  decal(key, Math.round(w * k), Math.round(h * k), ctx => { ctx.scale(k, k); draw(ctx, w, h); });
}
function rrect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
function qrCode(ctx, x, y, s, seed = 7) {
  const n = 21, c = s / n;
  let a = seed * 9301 + 49297;
  const rnd = () => ((a = (a * 9301 + 49297) % 233280) / 233280);
  ctx.fillStyle = '#fbfbf8'; ctx.fillRect(x - c, y - c, s + 2 * c, s + 2 * c);
  ctx.fillStyle = '#1d1d22';
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    const f = (i < 8 && j < 8) || (i > n - 9 && j < 8) || (i < 8 && j > n - 9);
    if (!f && rnd() < 0.48) ctx.fillRect(x + i * c, y + j * c, c + 0.3, c + 0.3);
  }
  for (const [fx, fy] of [[0, 0], [n - 7, 0], [0, n - 7]]) {
    ctx.fillRect(x + fx * c, y + fy * c, 7 * c, 7 * c);
    ctx.fillStyle = '#fbfbf8'; ctx.fillRect(x + (fx + 1) * c, y + (fy + 1) * c, 5 * c, 5 * c);
    ctx.fillStyle = '#1d1d22'; ctx.fillRect(x + (fx + 2) * c, y + (fy + 2) * c, 3 * c, 3 * c);
  }
}

// ================================================================================================
// 路灯 · 宫灯 · 红绿灯
// ================================================================================================
decal('st_lamp_flag', 48, 128, (ctx, w, h) => {
  ctx.fillStyle = '#c8282a'; ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = '#f2c14e'; ctx.lineWidth = 3; ctx.strokeRect(4, 4, w - 8, h - 8);
  ctx.fillStyle = '#f2c14e'; ctx.fillRect(4, h - 18, w - 8, 3);
  verticalText(ctx, '幸福里', w / 2, h / 2 - 6, w - 14, h - 34, FONTS.brush, '#ffe08a');
});

def('street_lamp', {
  name: '路灯',
  cat: 'street',
  sfx: 'metal',
  fill: 0.05,
  build(m) {
    const pole = 0x8a9199, dark = 0x4d535b, head = 0xdfe3e7, lamp = 0xfff2c6;
    m.box(0.56, 0.1, 0.56, 0xbdb6a8, 0, 0.05, 0);
    m.cyl(0.13, 0.19, 0.55, dark, 0, 0.375, 0, 0, 0, 0, 8);
    m.cyl(0.075, 0.115, 5.2, pole, 0, 3.2, 0, 0, 0, 0, 8);
    m.cyl(0.1, 0.1, 0.06, dark, 0, 0.67, 0, 0, 0, 0, 8);
    m.sphere(0.085, dark, 0, 5.8, 0, 1, 0.8, 1, 0, 0, 0, 8);
    m.sym(s => {
      m.tube([[0, 5.3, 0], [s * 0.35, 5.7, 0], [s * 0.85, 5.88, 0], [s * 1.3, 5.9, 0]], 0.042, pole, 6, false, 10);
      m.ellipsoid(0.36, 0.075, 0.17, head, s * 1.52, 5.9, 0, 0, 0, 0, 8);
      m.glow(1);
      m.ellipsoid(0.3, 0.035, 0.13, lamp, s * 1.54, 5.845, 0, 0, 0, 0, 8);
      m.glow(0);
      // 道旗 banners on brackets
      m.box(0.46, 0.035, 0.035, dark, s * 0.28, 4.35, 0);
      m.box(0.46, 0.035, 0.035, dark, s * 0.28, 3.27, 0);
      m.tbox(0.4, 1.02, 0.012, 0xc8282a, { pz: 'st_lamp_flag', nz: 'st_lamp_flag' }, s * 0.3, 3.8, 0);
    });
  },
});

decal('st_lantern_fu', 48, 64, (ctx, w, h) => {
  ctx.strokeStyle = '#c21f1f'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(w / 2, h / 2, w / 2 - 3, 0, Math.PI * 2); ctx.stroke();
  fitText(ctx, '福', w / 2, h / 2, w * 0.7, w * 0.7, FONTS.brush, '#c21f1f');
});

def('lamp_palace', {
  name: '宫灯路灯',
  cat: 'street',
  sfx: 'metal',
  fill: 0.1,
  build(m) {
    const maroon = 0x8c2a22, red = 0xc8302a, gold = 0xe2b24c, st = 0xbdb6a9, paper = 0xffe0a0;
    const H6 = Math.PI / 6;
    // stone plinth
    m.box(0.64, 0.12, 0.64, shade(st, 0.92), 0, 0.06, 0);
    m.box(0.5, 0.3, 0.5, st, 0, 0.27, 0);
    m.box(0.6, 0.08, 0.6, shade(st, 0.96), 0, 0.46, 0);
    // pole with gold rings
    m.cyl(0.07, 0.085, 2.56, maroon, 0, 1.78, 0, 0, H6, 0, 6);
    for (const y of [0.56, 1.25, 2.3, 2.98]) m.cyl(0.095, 0.095, 0.05, gold, 0, y, 0, 0, H6, 0, 6);
    // capital
    m.cyl(0.2, 0.09, 0.14, maroon, 0, 3.12, 0, 0, H6, 0, 6);
    m.cyl(0.22, 0.22, 0.04, gold, 0, 3.21, 0, 0, H6, 0, 6);
    // palace lantern
    const ly = 3.47, lh = 0.52, lr = 0.3, ap = lr * Math.cos(H6);
    m.glow(1);
    m.cyl(lr, lr, lh, paper, 0, ly, 0, 0, H6, 0, 6);
    m.decal(0.22, 0.29, 'st_lantern_fu', 0, ly, ap + 0.004);
    m.decal(0.22, 0.29, 'st_lantern_fu', 0, ly, -ap - 0.004, 0, Math.PI, 0);
    m.glow(0);
    m.cyl(lr + 0.04, lr + 0.04, 0.05, red, 0, ly + lh / 2 + 0.02, 0, 0, H6, 0, 6);
    m.cyl(lr + 0.04, lr + 0.04, 0.05, red, 0, ly - lh / 2 - 0.01, 0, 0, H6, 0, 6);
    m.cyl(0.07, lr + 0.14, 0.17, maroon, 0, ly + lh / 2 + 0.13, 0, 0, H6, 0, 6);
    for (let k = 0; k < 6; k++) {
      const t = H6 + k * Math.PI / 3, sx = Math.sin(t), cz = Math.cos(t);
      m.box(0.035, lh + 0.02, 0.035, red, sx * lr, ly, cz * lr, 0, t, 0);
      // tassels hanging from the bottom corners
      ball(m, 0.024, gold, sx * (lr + 0.03), ly - lh / 2 - 0.06, cz * (lr + 0.03));
      m.cone(0.034, 0.2, red, sx * (lr + 0.03), ly - lh / 2 - 0.18, cz * (lr + 0.03), 0, 0, 0, 5);
      // upturned roof corners
      coneAt(m, [sx * (lr + 0.12), ly + lh / 2 + 0.06, cz * (lr + 0.12)], [sx, 1.1, cz], 0.028, 0.13, gold, 4);
    }
    // finial
    ball(m, 0.055, gold, 0, ly + lh / 2 + 0.25, 0);
    m.cone(0.035, 0.16, gold, 0, ly + lh / 2 + 0.36, 0, 0, 0, 0, 6);
  },
});

decal('st_road_sign', 160, 48, (ctx, w, h) => {
  ctx.fillStyle = '#1f5fb4'; ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = '#eef4ff'; ctx.lineWidth = 2; ctx.strokeRect(3, 3, w - 6, h - 6);
  fitText(ctx, '幸福路', w / 2, h * 0.4, w - 30, h * 0.52, FONTS.sans, '#ffffff');
  fitText(ctx, 'XINGFU RD', w / 2, h * 0.8, w - 40, h * 0.22, FONTS.sans, '#dce8ff');
});
decal('st_countdown', 48, 32, (ctx, w, h) => {
  ctx.fillStyle = '#16161a'; ctx.fillRect(0, 0, w, h);
  fitText(ctx, '28', w / 2, h / 2, w - 8, h - 6, FONTS.sans, '#ff3b2f');
});
function pedFigure(ctx, w, h, col, walking) {
  ctx.fillStyle = '#16161a'; ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = col; ctx.strokeStyle = col; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.arc(w / 2, h * 0.2, w * 0.13, 0, Math.PI * 2); ctx.fill();
  ctx.lineWidth = w * 0.16;
  ctx.beginPath(); ctx.moveTo(w / 2, h * 0.34); ctx.lineTo(w / 2, h * 0.6); ctx.stroke();
  ctx.lineWidth = w * 0.11;
  ctx.beginPath();
  if (walking) {
    ctx.moveTo(w / 2, h * 0.6); ctx.lineTo(w * 0.28, h * 0.88);
    ctx.moveTo(w / 2, h * 0.6); ctx.lineTo(w * 0.72, h * 0.86);
    ctx.moveTo(w / 2, h * 0.4); ctx.lineTo(w * 0.28, h * 0.56);
    ctx.moveTo(w / 2, h * 0.4); ctx.lineTo(w * 0.74, h * 0.5);
  } else {
    ctx.moveTo(w * 0.42, h * 0.6); ctx.lineTo(w * 0.42, h * 0.9);
    ctx.moveTo(w * 0.58, h * 0.6); ctx.lineTo(w * 0.58, h * 0.9);
    ctx.moveTo(w * 0.36, h * 0.38); ctx.lineTo(w * 0.34, h * 0.6);
    ctx.moveTo(w * 0.64, h * 0.38); ctx.lineTo(w * 0.66, h * 0.6);
  }
  ctx.stroke();
}
decal('st_ped_green', 32, 48, (ctx, w, h) => pedFigure(ctx, w, h, '#3be07a', true));
decal('st_ped_red', 32, 48, (ctx, w, h) => pedFigure(ctx, w, h, '#6a2420', false));

def('traffic_light', {
  name: '红绿灯',
  cat: 'street',
  sfx: 'metal',
  fill: 0.04,
  build(m) {
    const pole = 0x8e959d, dark = 0x2f3338, px = -1.55;
    const RED = 0xff3b2f, YEL = 0x6e5a1c, GRN = 0x1c5530;
    m.box(0.6, 0.1, 0.6, 0xbdb6a8, px, 0.05, 0);
    m.cyl(0.15, 0.2, 0.3, pole, px, 0.25, 0, 0, 0, 0, 8);
    m.cyl(0.085, 0.125, 4.75, pole, px, 2.72, 0, 0, 0, 0, 8);
    m.sphere(0.095, pole, px, 5.1, 0, 1, 0.7, 1, 0, 0, 0, 8);
    // arm + tie rod
    rod(m, [px, 4.75, 0], [2.05, 4.75, 0], 0.075, pole, 8, 0.045);
    rod(m, [px, 5.05, 0], [0.1, 4.79, 0], 0.02, pole, 6);
    // horizontal signal head hanging under the arm (red · yellow · green, left to right)
    const hx = 1.3, hy = 4.44;
    m.box(0.06, 0.16, 0.06, dark, hx, 4.64, 0);
    m.box(1.0, 0.36, 0.26, dark, hx, hy, 0);
    [[RED, -0.32], [YEL, 0], [GRN, 0.32]].forEach(([c, dx], i) => {
      if (i === 0) m.glow(1);
      m.cyl(0.125, 0.125, 0.04, c, hx + dx, hy, 0.14, 90 * D, 0, 0, 10);
      m.glow(0);
      m.box(0.28, 0.02, 0.13, dark, hx + dx, hy + 0.15, 0.19);
    });
    // countdown box
    m.box(0.06, 0.12, 0.06, dark, 0.55, 4.66, 0);
    m.box(0.4, 0.3, 0.18, dark, 0.55, 4.45, 0);
    m.glow(1);
    m.decal(0.34, 0.24, 'st_countdown', 0.55, 4.45, 0.093);
    m.glow(0);
    // road name sign under the arm
    m.box(0.03, 0.08, 0.03, dark, -0.7, 4.66, 0);
    m.box(0.03, 0.08, 0.03, dark, 0.0, 4.66, 0);
    m.tbox(1.1, 0.34, 0.03, 0x1f5fb4, { pz: 'st_road_sign', nz: 'st_road_sign' }, -0.35, 4.45, 0);
    // vertical head on the pole
    const vx = px + 0.3;
    m.box(0.2, 0.08, 0.08, dark, px + 0.15, 3.35, 0);
    m.box(0.34, 0.96, 0.24, dark, vx, 3.2, 0);
    [[RED, 0.3], [YEL, 0], [GRN, -0.3]].forEach(([c, dy], i) => {
      if (i === 0) m.glow(1);
      m.cyl(0.115, 0.115, 0.04, c, vx, 3.2 + dy, 0.13, 90 * D, 0, 0, 10);
      m.glow(0);
      m.box(0.26, 0.02, 0.12, dark, vx, 3.2 + dy + 0.14, 0.18);
    });
    // pedestrian signal (green man lit)
    const qx = px - 0.25;
    m.box(0.2, 0.08, 0.08, dark, px - 0.12, 2.5, 0);
    m.box(0.28, 0.56, 0.2, dark, qx, 2.5, 0);
    m.decal(0.2, 0.23, 'st_ped_red', qx, 2.64, 0.102);
    m.glow(1);
    m.decal(0.2, 0.23, 'st_ped_green', qx, 2.37, 0.102);
    m.glow(0);
  },
});

// ================================================================================================
// 路锥 · 消防栓 · 石墩
// ================================================================================================
def('traffic_cone', {
  name: '路锥',
  cat: 'street',
  sfx: 'hard',
  fill: 0.3,
  build(m) {
    const or = 0xf26a21, wh = 0xf4f2ec;
    m.box(0.38, 0.035, 0.38, 0x303036, 0, 0.0175, 0);
    m.cyl(0.165, 0.165, 0.025, shade(or, 0.85), 0, 0.045, 0, 0, 0, 0, 12);
    const y0 = 0.055, y1 = 0.7, r0 = 0.145, r1 = 0.024;
    const R = y => r0 + (r1 - r0) * (y - y0) / (y1 - y0);
    const bands = [[y0, 0.3, or], [0.3, 0.4, wh], [0.4, 0.46, or], [0.46, 0.54, wh], [0.54, y1, or]];
    for (const [a, b, c] of bands) m.cyl(R(b), R(a), b - a, c, 0, (a + b) / 2, 0, 0, 0, 0, 12);
  },
});

decal('st_hydrant', 64, 28, (ctx, w, h) => {
  fitText(ctx, '消火栓', w / 2, h / 2, w - 4, h - 4, FONTS.sans, '#f6f1e6');
});

def('fire_hydrant', {
  name: '消防栓',
  cat: 'street',
  sfx: 'metal',
  fill: 0.45,
  build(m) {
    const red = 0xd8342c, dred = 0xa82620;
    const seg = 8, rot = Math.PI / seg;
    m.cyl(0.17, 0.19, 0.05, dred, 0, 0.025, 0, 0, rot, 0, seg);
    m.cyl(0.115, 0.125, 0.56, red, 0, 0.33, 0, 0, rot, 0, seg);
    m.cyl(0.15, 0.15, 0.05, dred, 0, 0.625, 0, 0, rot, 0, seg);
    m.dome(0.13, red, 0, 0.65, 0, 1, 0.95, 1, 0, rot, 0, seg);
    m.cyl(0.035, 0.045, 0.05, dred, 0, 0.8, 0, 0, 0, 0, 5);
    // bolts on the flanges
    for (let k = 0; k < 8; k++) {
      const a = k * Math.PI / 4 + rot;
      m.box(0.025, 0.02, 0.025, dred, Math.sin(a) * 0.16, 0.06, Math.cos(a) * 0.16, 0, a, 0);
      m.box(0.022, 0.018, 0.022, dred, Math.sin(a) * 0.135, 0.66, Math.cos(a) * 0.135, 0, a, 0);
    }
    // side outlets with caps
    m.sym(s => {
      m.cyl(0.045, 0.05, 0.1, red, s * 0.15, 0.5, 0, 0, 0, -s * 90 * D, 8);
      m.cyl(0.056, 0.056, 0.035, dred, s * 0.21, 0.5, 0, 0, 0, 90 * D, 8);
      m.cyl(0.02, 0.02, 0.03, dred, s * 0.24, 0.5, 0, 0, 0, 90 * D, 5);
    });
    // big front outlet
    m.cyl(0.062, 0.066, 0.1, red, 0, 0.34, 0.15, 90 * D, 0, 0, 8);
    m.cyl(0.075, 0.075, 0.04, dred, 0, 0.34, 0.21, 90 * D, 0, 0, 8);
    m.cyl(0.025, 0.025, 0.03, dred, 0, 0.34, 0.24, 90 * D, 0, 0, 5);
    m.decal(0.085, 0.037, 'st_hydrant', 0, 0.52, 0.117);
  },
});

def('bollard', {
  name: '石墩',
  cat: 'street',
  sfx: 'rumble',
  fill: 0.55,
  build(m) {
    const g = 0xc9c5bb;
    m.box(0.44, 0.1, 0.44, speckle(0xb2ada3, 0.1), 0, 0.05, 0);
    m.cyl(0.19, 0.22, 0.07, speckle(0xbcb7ad, 0.1), 0, 0.13, 0, 0, 0, 0, 12);
    m.sphere(0.245, speckle(g, 0.16), 0, 0.355, 0, 1, 1, 1, 0, 0, 0, 12);
  },
});

// ================================================================================================
// 垃圾桶 · 长椅
// ================================================================================================
const iconRecycle = (ctx, s) => {
  ctx.strokeStyle = '#fff'; ctx.fillStyle = '#fff'; ctx.lineWidth = s * 0.22;
  for (let i = 0; i < 3; i++) {
    ctx.save(); ctx.rotate(i * 2 * Math.PI / 3);
    const a0 = -Math.PI / 2 + 0.3, a1 = Math.PI / 6 - 0.25, R = s * 0.72;
    ctx.beginPath(); ctx.arc(0, 0, R, a0, a1); ctx.stroke();
    const x = Math.cos(a1) * R, y = Math.sin(a1) * R;
    ctx.beginPath();
    ctx.moveTo(x - Math.sin(a1) * s * 0.36, y + Math.cos(a1) * s * 0.36);
    ctx.lineTo(x + Math.cos(a1) * s * 0.26, y + Math.sin(a1) * s * 0.26);
    ctx.lineTo(x - Math.cos(a1) * s * 0.26, y - Math.sin(a1) * s * 0.26);
    ctx.closePath(); ctx.fill();
    ctx.restore();
  }
};
const iconBattery = (ctx, s, bg) => {
  ctx.fillStyle = '#fff';
  rrect(ctx, -s * 0.5, -s * 0.75, s, s * 1.5, s * 0.12); ctx.fill();
  ctx.fillRect(-s * 0.2, -s * 0.95, s * 0.4, s * 0.22);
  ctx.fillStyle = bg;
  ctx.fillRect(-s * 0.3, -s * 0.06, s * 0.6, s * 0.14);
  ctx.fillRect(-s * 0.07, -s * 0.3, s * 0.14, s * 0.6);
};
const iconFish = (ctx, s) => {
  ctx.strokeStyle = '#fff'; ctx.fillStyle = '#fff'; ctx.lineWidth = s * 0.14; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(-s * 0.55, 0); ctx.lineTo(s * 0.55, 0); ctx.stroke();
  for (let i = -2; i <= 2; i++) {
    ctx.beginPath(); ctx.moveTo(i * s * 0.2, -s * 0.38); ctx.lineTo(i * s * 0.2 + s * 0.08, 0); ctx.lineTo(i * s * 0.2, s * 0.38); ctx.stroke();
  }
  ctx.beginPath(); ctx.arc(s * 0.72, 0, s * 0.22, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.moveTo(-s * 0.55, 0); ctx.lineTo(-s * 0.9, -s * 0.35); ctx.lineTo(-s * 0.9, s * 0.35); ctx.closePath(); ctx.fill();
};
const iconCup = (ctx, s, bg) => {
  ctx.fillStyle = '#fff';
  ctx.beginPath(); ctx.moveTo(-s * 0.5, -s * 0.6); ctx.lineTo(s * 0.5, -s * 0.6); ctx.lineTo(s * 0.36, s * 0.8); ctx.lineTo(-s * 0.36, s * 0.8); ctx.closePath(); ctx.fill();
  ctx.fillRect(-s * 0.6, -s * 0.82, s * 1.2, s * 0.18);
  ctx.fillStyle = bg; ctx.fillRect(-s * 0.4, -s * 0.1, s * 0.8, s * 0.16);
};
function binLabel(bg, title, icon) {
  return (ctx, w, h) => {
    ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 3; rrect(ctx, 4, 4, w - 8, h - 8, 8); ctx.stroke();
    ctx.save(); ctx.translate(w / 2, h * 0.38); icon(ctx, w * 0.3, bg); ctx.restore();
    fitText(ctx, title, w / 2, h * 0.8, w - 16, h * 0.17, FONTS.sans, '#ffffff');
  };
}
const BINS = [
  ['st_bin_recycle', 0x2f6fd0, '#2f6fd0', '可回收物', iconRecycle],
  ['st_bin_hazard', 0xd8342c, '#d8342c', '有害垃圾', iconBattery],
  ['st_bin_kitchen', 0x3f9a4a, '#3f9a4a', '厨余垃圾', iconFish],
  ['st_bin_other', 0x59636d, '#59636d', '其他垃圾', iconCup],
];
for (const [key, , css, title, icon] of BINS) decal(key, 80, 108, binLabel(css, title, icon));

def('trash_bins', {
  name: '分类垃圾桶',
  cat: 'street',
  sfx: 'hard',
  fill: 0.8,
  build(m) {
    const W = 0.56, Dp = 0.68, dark = 0x2a2c30;
    BINS.forEach(([key, col], i) => {
      const x = -0.9 + i * 0.6;
      m.box(W, 0.86, Dp, col, x, 0.49, 0);
      m.box(W + 0.03, 0.05, Dp + 0.03, shade(col, 0.86), x, 0.925, 0);
      m.box(W + 0.04, 0.045, Dp + 0.05, shade(col, 1.08), x, 0.97, 0.005);
      m.box(0.24, 0.03, 0.04, shade(col, 0.8), x, 0.965, Dp / 2 + 0.035);
      m.box(W - 0.04, 0.05, 0.05, shade(col, 0.8), x, 0.88, -Dp / 2 - 0.02);
      m.box(0.3, 0.06, 0.06, shade(col, 0.85), x, 0.03, Dp / 2 - 0.05);
      m.sym(s => m.cyl(0.085, 0.085, 0.05, dark, x + s * 0.22, 0.085, -Dp / 2 + 0.06, 0, 0, 90 * D, 10));
      m.decal(0.36, 0.49, key, x, 0.52, Dp / 2 + 0.002);
    });
  },
});

decal('st_can_label', 96, 80, (ctx, w, h) => {
  ctx.fillStyle = '#f4f2ec'; rrect(ctx, 2, 2, w - 4, h - 4, 10); ctx.fill();
  ctx.strokeStyle = '#2f8f4e'; ctx.lineWidth = 3; rrect(ctx, 6, 6, w - 12, h - 12, 8); ctx.stroke();
  fitText(ctx, '果皮箱', w / 2, h * 0.42, w - 20, h * 0.36, FONTS.sans, '#23703c');
  fitText(ctx, '请勿乱扔', w / 2, h * 0.74, w - 34, h * 0.17, FONTS.sans, '#4d8a5c');
});

def('trash_can', {
  name: '垃圾桶',
  cat: 'street',
  sfx: 'metal',
  fill: 0.7,
  build(m) {
    const g = 0x2f8f4e, gd = 0x23703c, dark = 0x1f2622;
    m.box(0.64, 0.06, 0.44, 0x5d6268, 0, 0.03, 0);
    m.rbox(0.58, 0.76, 0.38, 0.035, g, 0, 0.44, 0);
    m.cyl(0.2, 0.2, 0.6, gd, 0, 0.8, 0, 0, 0, 90 * D, 12);
    m.box(0.46, 0.17, 0.015, gd, 0, 0.7, 0.19);
    m.box(0.41, 0.12, 0.02, dark, 0, 0.7, 0.194);
    m.cyl(0.09, 0.09, 0.025, 0xc9cdd2, 0, 1.005, 0, 0, 0, 0, 10);
    m.decal(0.36, 0.3, 'st_can_label', 0, 0.37, 0.192);
  },
});

def('bench', {
  name: '长椅',
  cat: 'street',
  sfx: 'wood',
  fill: 0.28,
  build(m) {
    const wood = 0xb07a4f, iron = 0x3a3d44;
    m.jitter(0.08);
    for (let i = 0; i < 4; i++) m.box(1.8, 0.035, 0.085, wood, 0, 0.445, 0.17 - i * 0.1);
    for (let i = 0; i < 3; i++) {
      const y = 0.58 + i * 0.12;
      m.box(1.8, 0.085, 0.03, wood, 0, y, -0.18 - 0.208 * (y - 0.42) + 0.035, -12 * D, 0, 0);
    }
    m.jitter(0);
    m.sym(s => {
      const x = s * 0.72;
      bar(m, [x, 0, 0.22], [x, 0.43, 0.19], 0.05, iron, 0.045);
      bar(m, [x, 0, -0.2], [x, 0.43, -0.16], 0.05, iron, 0.045);
      bar(m, [x, 0.41, 0.24], [x, 0.41, -0.2], 0.05, iron, 0.045);
      bar(m, [x, 0.4, -0.17], [x, 0.9, -0.28], 0.05, iron, 0.045);
      m.tube([[x, 0.64, -0.2], [x, 0.67, -0.02], [x, 0.64, 0.18], [x, 0.45, 0.22]], 0.022, iron, 6, false, 10);
      m.box(0.08, 0.025, 0.1, iron, x, 0.0125, 0.215);
      m.box(0.08, 0.025, 0.1, iron, x, 0.0125, -0.195);
    });
  },
});

// ================================================================================================
// 公交站 · 报刊亭
// ================================================================================================
decalS('st_bus_name', 512, 64, 0.75, (ctx, w, h) => {
  ctx.fillStyle = '#1f5fb4'; ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#f2c14e'; ctx.fillRect(0, h - 6, w, 6);
  ctx.fillStyle = '#ffffff'; rrect(ctx, 16, 12, 60, 34, 7); ctx.fill();
  ctx.fillStyle = '#1f5fb4'; ctx.fillRect(22, 18, 22, 12); ctx.fillRect(48, 18, 22, 12);
  ctx.fillStyle = '#ffffff';
  ctx.beginPath(); ctx.arc(29, 48, 6, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(63, 48, 6, 0, Math.PI * 2); ctx.fill();
  fitText(ctx, '幸福里', 200, h * 0.46, 200, h * 0.72, FONTS.sans, '#ffffff');
  fitText(ctx, '88路 · 101路 · 滚1路', 408, h * 0.46, 180, h * 0.36, FONTS.sans, '#dce8ff');
});
decalS('st_bus_route', 160, 256, 0.75, (ctx, w, h) => {
  ctx.fillStyle = '#f7f7f2'; ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#1f5fb4'; ctx.fillRect(0, 0, w, 44);
  fitText(ctx, '幸福里', w / 2, 20, w - 20, 30, FONTS.sans, '#ffffff');
  fitText(ctx, 'XINGFULI', w / 2, 38, w - 60, 9, FONTS.sans, '#cfe0ff');
  const block = (y, num, col, dest, here) => {
    ctx.fillStyle = col; rrect(ctx, 10, y, 50, 24, 5); ctx.fill();
    fitText(ctx, num, 35, y + 12, 44, 18, FONTS.sans, '#ffffff');
    fitText(ctx, dest, 106, y + 12, 86, 13, FONTS.sans, '#33363c');
    ctx.strokeStyle = '#8a929c'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(14, y + 46); ctx.lineTo(w - 14, y + 46); ctx.stroke();
    for (let i = 0; i < 8; i++) {
      const x = 16 + i * (w - 32) / 7;
      ctx.fillStyle = i === here ? '#d8342c' : '#ffffff';
      ctx.strokeStyle = '#6a727c'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(x, y + 46, i === here ? 6 : 4, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = i === here ? '#d8342c' : '#9aa1a9';
      ctx.fillRect(x - 2, y + 56, 4, 16 + (i % 3) * 4);
    }
  };
  block(56, '88路', '#d8342c', '开往 万物广场', 3);
  block(142, '滚1路', '#2aa198', '开往 女娲山', 5);
  ctx.fillStyle = '#e4e6e2'; ctx.fillRect(0, h - 30, w, 30);
  fitText(ctx, '首班 6:00  末班 22:30', w / 2, h - 15, w - 20, 13, FONTS.sans, '#4a4f56');
});
decalS('st_bus_ad', 128, 192, 0.75, (ctx, w, h) => {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#ffe9a8'); g.addColorStop(1, '#ffb45e');
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  fitText(ctx, '多喝热水', w / 2, 30, w - 14, 32, FONTS.round, '#c8202a');
  ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 4; ctx.lineCap = 'round';
  for (const x of [50, 66, 82]) {
    ctx.beginPath(); ctx.moveTo(x, 70); ctx.bezierCurveTo(x - 8, 62, x + 8, 56, x, 48); ctx.stroke();
  }
  ctx.fillStyle = '#f7f5ef'; rrect(ctx, 36, 76, 58, 66, 6); ctx.fill();
  ctx.fillStyle = '#d8342c'; ctx.fillRect(36, 76, 58, 7); ctx.fillRect(36, 136, 58, 6);
  ctx.strokeStyle = '#f7f5ef'; ctx.lineWidth = 7;
  ctx.beginPath(); ctx.arc(95, 108, 14, -Math.PI / 2, Math.PI / 2); ctx.stroke();
  fitText(ctx, '奖', 65, 110, 34, 34, FONTS.serif, '#d8342c');
  fitText(ctx, '滚滚牌 搪瓷缸', w / 2, h - 24, w - 16, 17, FONTS.sans, '#7a3a10');
});
decal('st_glass', 64, 64, (ctx, w, h) => {
  ctx.fillStyle = '#bcd9e4'; ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#e4f2f7';
  ctx.beginPath(); ctx.moveTo(10, h); ctx.lineTo(24, h); ctx.lineTo(50, 0); ctx.lineTo(36, 0); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.moveTo(30, h); ctx.lineTo(35, h); ctx.lineTo(61, 0); ctx.lineTo(56, 0); ctx.closePath(); ctx.fill();
});

def('bus_stop', {
  name: '公交站',
  cat: 'street',
  sfx: 'crash',
  fill: 0.2,
  build(m) {
    const steel = 0x9aa3ab, blue = 0x1f5fb4, roof = 0xeef0ee, zb = -0.62;
    m.box(5.0, 0.08, 1.6, speckle(0xc2bcae, 0.06), 0, 0.04, 0);
    for (const x of [-2.4, -0.8, 0.8, 2.4]) {
      m.box(0.1, 2.5, 0.1, steel, x, 1.33, zb);
      bar(m, [x, 2.15, zb], [x, 2.52, 0.3], 0.06, steel);
    }
    m.box(5.1, 0.08, 1.64, roof, 0, 2.6, 0);
    m.box(5.1, 0.32, 0.08, blue, 0, 2.52, 0.8);
    m.box(5.1, 0.2, 0.06, blue, 0, 2.5, -0.78);
    m.decal(4.5, 0.29, 'st_bus_name', 0, 2.52, 0.842);
    // left bay: route board lightbox · middle: glass · right: advert lightbox
    m.box(1.44, 1.66, 0.1, 0xe9ebe8, -1.6, 1.3, zb);
    m.box(1.44, 1.66, 0.1, 0x3d434a, 1.6, 1.3, zb);
    m.glow(0.8);
    m.decal(1.26, 1.5, 'st_bus_route', -1.6, 1.3, zb + 0.052);
    m.decal(1.26, 1.5, 'st_bus_ad', 1.6, 1.3, zb + 0.052);
    m.decal(1.26, 1.5, 'st_bus_ad', 1.6, 1.3, zb - 0.052, 0, Math.PI, 0);
    m.glow(0);
    m.tbox(1.5, 1.9, 0.02, 0xbcd9e4, { pz: 'st_glass', nz: 'st_glass' }, 0, 1.3, zb);
    m.tbox(0.02, 1.9, 0.8, 0xbcd9e4, { px: 'st_glass', nx: 'st_glass' }, -2.42, 1.3, zb + 0.44);
    m.box(1.6, 0.05, 0.05, steel, 0, 0.33, zb);
    m.box(1.6, 0.05, 0.05, steel, 0, 2.27, zb);
    // steel bench
    m.box(1.5, 0.05, 0.36, 0xc9cdd2, 0, 0.46, zb + 0.24);
    m.sym(s => m.box(0.05, 0.38, 0.3, steel, s * 0.6, 0.25, zb + 0.22));
  },
});

decalS('st_news_sign', 320, 48, 0.75, (ctx, w, h) => {
  ctx.fillStyle = '#1f6b3b'; ctx.fillRect(0, 0, w, h);
  fitText(ctx, '报刊亭', w * 0.33, h / 2, w * 0.4, h * 0.82, FONTS.brush, '#fffbe8');
  fitText(ctx, '书报 · 杂志 · 饮料', w * 0.74, h / 2 + 2, w * 0.4, h * 0.42, FONTS.sans, '#d9f2e0');
});
decalS('st_mags', 128, 192, 0.75, (ctx, w, h) => {
  ctx.fillStyle = '#2a6b40'; ctx.fillRect(0, 0, w, h);
  const cols = ['#e8554a', '#5aa9e6', '#f2c14e', '#f08fb0', '#2aa198', '#f2a14a', '#8a6fd0', '#f6efe0'];
  const titles = ['漫画', '体育', '时尚', '美食', '电影', '旅游', '健康', '汽车'];
  const cw = w / 2, ch = h / 4;
  for (let r = 0; r < 4; r++) for (let c = 0; c < 2; c++) {
    const i = r * 2 + c, x = c * cw + 5, y = r * ch + 5, ww = cw - 10, hh = ch - 8;
    ctx.fillStyle = cols[i]; ctx.fillRect(x, y, ww, hh);
    ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.fillRect(x, y + 3, ww, 12);
    fitText(ctx, titles[i], x + ww / 2, y + 9, ww - 6, 11, FONTS.sans, '#26262c');
    ctx.fillStyle = i % 2 ? '#fbe3c8' : '#26262c';
    ctx.beginPath(); ctx.arc(x + ww / 2, y + hh * 0.62, hh * 0.2, 0, Math.PI * 2); ctx.fill();
    ctx.fillRect(x + ww / 2 - hh * 0.26, y + hh * 0.8, hh * 0.52, hh * 0.2);
  }
});

def('newsstand', {
  name: '报刊亭',
  cat: 'street',
  sfx: 'crash',
  fill: 0.7,
  build(m) {
    const g = 0x2f8a4e, gd = 0x1f6b3b, gl = 0x4aa86a, dark = 0x2b2f33;
    const W = 2.2, H = 2.3, Dd = 1.4, zf = Dd / 2;
    m.box(W + 0.06, 0.1, Dd + 0.06, 0x55595e, 0, 0.05, 0);
    m.box(W, H - 0.1, Dd, g, 0, 0.1 + (H - 0.1) / 2, 0);
    m.box(W + 0.5, 0.1, Dd + 0.36, gd, 0, H + 0.05, 0);
    m.box(W + 0.24, 0.14, Dd + 0.12, g, 0, H + 0.17, 0);
    m.box(W, 0.3, 0.04, gd, 0, H - 0.17, zf + 0.02);
    m.decal(W - 0.08, 0.28, 'st_news_sign', 0, H - 0.17, zf + 0.042);
    // service window, counter and a stack of newspapers
    m.box(0.86, 0.72, 0.02, dark, 0, 1.46, zf + 0.005);
    m.box(1.0, 0.05, 0.26, gl, 0, 1.06, zf + 0.12);
    m.box(0.34, 0.05, 0.22, 0xefece2, -0.22, 1.11, zf + 0.12);
    m.box(0.3, 0.03, 0.2, 0xe6e1d2, 0.24, 1.1, zf + 0.12, 0, 0.3, 0);
    // magazines all over the front, sides and open wings
    m.sym(s => {
      m.decal(0.62, 0.92, 'st_mags', s * 0.76, 0.62, zf + 0.003);
      m.decal(0.62, 0.92, 'st_mags', s * 0.76, 1.6, zf + 0.003);
      m.decal(1.2, 0.92, 'st_mags', s * (W / 2 + 0.003), 1.1, 0, 0, s * 90 * D, 0);
      const t = 45 * D, L = 0.6;
      const cx = s * (W / 2 + Math.cos(t) * L / 2), cz = zf + Math.sin(t) * L / 2;
      m.box(L, 1.7, 0.04, gd, cx, 1.15, cz, 0, -s * t, 0);
      m.decal(L - 0.06, 0.8, 'st_mags', cx - s * Math.sin(t) * 0.022, 0.72, cz + Math.cos(t) * 0.022, 0, -s * t, 0);
      m.decal(L - 0.06, 0.8, 'st_mags', cx - s * Math.sin(t) * 0.022, 1.58, cz + Math.cos(t) * 0.022, 0, -s * t, 0);
    });
  },
});

// ================================================================================================
// 自动售货机 · 快递柜 · 冰柜
// ================================================================================================
decalS('st_vend_drinks', 160, 224, 0.75, (ctx, w, h) => {
  ctx.fillStyle = '#e3f1f8'; ctx.fillRect(0, 0, w, h);
  const cols = ['#d8342c', '#2f7fd8', '#f2c14e', '#3fae5a', '#f07a2a', '#f4f2ec', '#8a4fc8', '#26262c'];
  const rows = 5, per = 6, rh = h / rows;
  for (let r = 0; r < rows; r++) {
    const y0 = r * rh;
    for (let i = 0; i < per; i++) {
      const cx = (i + 0.5) * w / per, c = cols[(r * 3 + i * 5 + r * i) % cols.length];
      ctx.fillStyle = c;
      if ((r + i) % 3 !== 0) {
        rrect(ctx, cx - 7, y0 + 12, 14, rh - 22, 4); ctx.fill();
        ctx.fillRect(cx - 3, y0 + 6, 6, 8);
        ctx.fillStyle = '#ffffff'; ctx.fillRect(cx - 7, y0 + rh * 0.48, 14, 6);
      } else {
        rrect(ctx, cx - 8, y0 + 16, 16, rh - 26, 3); ctx.fill();
        ctx.fillStyle = '#ffffff'; ctx.fillRect(cx - 5, y0 + 19, 3, rh - 32);
      }
      ctx.fillStyle = '#ffffff'; ctx.fillRect(cx - 8, y0 + rh - 7, 16, 5);
    }
    ctx.fillStyle = '#8fa6b4'; ctx.fillRect(0, y0 + rh - 2, w, 2);
  }
});
decal('st_vend_head', 256, 40, (ctx, w, h) => {
  const g = ctx.createLinearGradient(0, 0, w, 0);
  g.addColorStop(0, '#1f7fd0'); g.addColorStop(1, '#2bb3d8');
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  fitText(ctx, '冰爽饮料', w / 2, h / 2, w * 0.6, h * 0.8, FONTS.round, '#ffffff');
  fitText(ctx, '❄', 26, h / 2, 26, 26, FONTS.sans, '#e8f7ff');
  fitText(ctx, '❄', w - 26, h / 2, 26, 26, FONTS.sans, '#e8f7ff');
});
decal('st_vend_panel', 48, 192, (ctx, w, h) => {
  ctx.fillStyle = '#2b2e34'; ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#0f2a1c'; ctx.fillRect(6, 8, w - 12, 20);
  fitText(ctx, '¥3.0', w / 2, 18, w - 16, 14, FONTS.sans, '#48f08a');
  qrCode(ctx, 9, 40, 30, 11);
  fitText(ctx, '扫码', w / 2, 84, w - 12, 11, FONTS.sans, '#ffffff');
  for (let r = 0; r < 4; r++) for (let c = 0; c < 3; c++) {
    ctx.fillStyle = '#c9cdd2'; ctx.fillRect(7 + c * 12, 98 + r * 12, 9, 8);
  }
  ctx.fillStyle = '#111114'; ctx.fillRect(18, 152, 12, 4); ctx.fillRect(8, 168, 32, 6);
});

def('vending_machine', {
  name: '自动售货机',
  cat: 'street',
  sfx: 'crash',
  fill: 0.9,
  build(m) {
    const body = 0xd8342c, dark = 0x2a2c31, white = 0xf2f1ec, zf = 0.39;
    m.box(1.06, 0.06, 0.74, dark, 0, 0.03, 0);
    m.rbox(1.1, 1.84, 0.78, 0.03, body, 0, 0.98, 0);
    m.box(0.8, 1.24, 0.03, white, -0.1, 1.2, zf);
    m.box(0.26, 0.78, 0.03, 0x3a3d44, 0.41, 1.2, zf);
    m.box(1.0, 0.17, 0.03, white, 0, 1.78, zf);
    m.glow(1);
    m.decal(0.72, 1.14, 'st_vend_drinks', -0.1, 1.2, zf + 0.017);
    m.decal(0.96, 0.15, 'st_vend_head', 0, 1.78, zf + 0.017);
    m.decal(0.18, 0.72, 'st_vend_panel', 0.41, 1.2, zf + 0.017);
    m.glow(0);
    m.box(0.72, 0.24, 0.03, dark, -0.1, 0.36, zf);
    m.box(0.64, 0.14, 0.02, 0x4a4e56, -0.1, 0.38, zf + 0.02);
    m.box(0.2, 0.3, 0.02, shade(body, 0.85), 0.41, 0.4, zf + 0.005);
  },
});

decal('st_locker_door', 48, 40, (ctx, w, h) => {
  ctx.fillStyle = '#23704a'; ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#3a9e66'; ctx.fillRect(2, 2, w - 4, h - 4);
  ctx.fillStyle = '#f4f2ec'; ctx.fillRect(6, 6, 12, 7);
  ctx.fillStyle = '#c9d2cc'; rrect(ctx, w - 12, h / 2 - 6, 5, 12, 2); ctx.fill();
});
decal('st_locker_screen', 96, 96, (ctx, w, h) => {
  ctx.fillStyle = '#20252c'; ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#1b4f8a'; ctx.fillRect(6, 6, w - 12, 50);
  fitText(ctx, '请输入取件码', w / 2, 16, w - 24, 10, FONTS.sans, '#dbe9ff');
  ctx.fillStyle = '#f2a14a'; rrect(ctx, 12, 28, 34, 20, 4); ctx.fill();
  ctx.fillStyle = '#3fae5a'; rrect(ctx, 50, 28, 34, 20, 4); ctx.fill();
  fitText(ctx, '取件', 29, 38, 28, 13, FONTS.sans, '#ffffff');
  fitText(ctx, '寄件', 67, 38, 28, 13, FONTS.sans, '#ffffff');
  for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) {
    ctx.fillStyle = '#c9cdd2'; ctx.fillRect(14 + c * 18, 62 + r * 10, 14, 7);
  }
});
decalS('st_locker_head', 512, 40, 0.75, (ctx, w, h) => {
  ctx.fillStyle = '#1f6b42'; ctx.fillRect(0, 0, w, h);
  fitText(ctx, '幸福里 · 智能快递柜', w * 0.36, h / 2, w * 0.6, h * 0.72, FONTS.sans, '#ffffff');
  fitText(ctx, '24小时自助取件', w * 0.82, h / 2, w * 0.3, h * 0.5, FONTS.sans, '#c8f0d4');
});

def('express_locker', {
  name: '快递柜',
  cat: 'street',
  sfx: 'crash',
  fill: 0.9,
  build(m) {
    const g = 0x2f8f5a, gd = 0x1f6b42, dark = 0x2b2f33, zf = 0.25;
    m.box(4.0, 0.1, 0.5, dark, 0, 0.05, 0);
    m.box(4.0, 1.8, 0.5, g, 0, 1.0, 0);
    m.box(4.1, 0.1, 0.62, gd, 0, 1.95, 0.03);
    m.decal(3.8, 0.15, 'st_locker_head', 0, 1.8, zf + 0.002);
    const y0 = 0.14, AH = 1.56;
    const cols = [[-1.7, [8]], [-1.2, [6]], [-0.7, [8, 8, 8, 8, 4, 4]], [0.7, [4]], [1.2, [8]], [1.7, [3]]];
    for (const [x, pat] of cols) {
      const hs = pat.length === 1 ? Array(pat[0]).fill(AH / pat[0]) : pat.map(n => AH / n);
      let y = y0 + AH;
      for (const hh of hs) {
        m.decal(0.48, hh - 0.02, 'st_locker_door', x, y - hh / 2, zf + 0.002);
        y -= hh;
      }
    }
    // control column
    m.box(0.9, AH, 0.03, 0xe9ece8, 0, y0 + AH / 2, zf + 0.012);
    m.glow(1);
    m.decal(0.52, 0.52, 'st_locker_screen', 0, 1.36, zf + 0.029);
    m.glow(0);
    m.box(0.16, 0.08, 0.05, dark, 0, 1.02, zf + 0.03);
    m.box(0.5, 0.03, 0.14, 0xc9cdd2, 0, 0.94, zf + 0.08);
    m.decal(0.8, 0.36, 'st_locker_door', 0, 0.64, zf + 0.029);
    m.decal(0.8, 0.36, 'st_locker_door', 0, 0.26, zf + 0.029);
  },
});

decalS('st_freezer_top', 256, 128, 0.75, (ctx, w, h) => {
  ctx.fillStyle = '#cfe6ef'; ctx.fillRect(0, 0, w, h);
  const cols = ['#f08fb0', '#5aa9e6', '#f2c14e', '#7fcf6a', '#f2a14a', '#f6efe0', '#b07a4f', '#e8554a'];
  let a = 17;
  const rnd = () => ((a = (a * 9301 + 49297) % 233280) / 233280);
  for (let i = 0; i < 46; i++) {
    const x = 10 + rnd() * (w - 20), y = 10 + rnd() * (h - 20), r = rnd() * Math.PI;
    ctx.save(); ctx.translate(x, y); ctx.rotate(r);
    ctx.fillStyle = cols[i % cols.length]; rrect(ctx, -16, -7, 32, 14, 4); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.fillRect(-10, -2, 14, 4);
    ctx.restore();
  }
  ctx.fillStyle = 'rgba(210,236,246,0.45)'; ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  for (const x0 of [30, 150]) {
    ctx.beginPath(); ctx.moveTo(x0, h); ctx.lineTo(x0 + 26, h); ctx.lineTo(x0 + 70, 0); ctx.lineTo(x0 + 44, 0); ctx.closePath(); ctx.fill();
  }
  ctx.strokeStyle = '#9aa3ab'; ctx.lineWidth = 6; ctx.strokeRect(3, 3, w - 6, h - 6);
  ctx.beginPath(); ctx.moveTo(w / 2, 0); ctx.lineTo(w / 2, h); ctx.stroke();
});
decalS('st_freezer_front', 256, 112, 0.75, (ctx, w, h) => {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#dff2fb'); g.addColorStop(1, '#8fd0f0');
  ctx.fillStyle = g; rrect(ctx, 2, 2, w - 4, h - 4, 12); ctx.fill();
  ctx.fillStyle = '#f2a14a'; rrect(ctx, 22, 16, 34, 60, 14); ctx.fill();
  ctx.fillStyle = '#f08fb0'; rrect(ctx, 22, 16, 34, 22, 12); ctx.fill();
  ctx.fillStyle = '#e8d0a0'; ctx.fillRect(35, 74, 8, 26);
  fitText(ctx, '冰棍', 150, 48, 150, 64, FONTS.round, '#d8342c');
  fitText(ctx, '雪糕 · 冷饮 · 冰镇汽水', 150, 92, 150, 16, FONTS.sans, '#1f5fb4');
  ctx.fillStyle = '#ffffff';
  for (const [x, y] of [[230, 20], [214, 60], [82, 22]]) fitText(ctx, '❄', x, y, 18, 18, FONTS.sans, '#ffffff');
});
decal('st_freezer_card', 96, 64, (ctx, w, h) => {
  ctx.fillStyle = '#c9a06a'; ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = '#a57c48'; ctx.lineWidth = 2; ctx.strokeRect(3, 3, w - 6, h - 6);
  fitText(ctx, '老冰棍', w / 2, h * 0.36, w - 12, h * 0.44, FONTS.brush, '#26221c');
  fitText(ctx, '1元', w / 2, h * 0.76, w - 40, h * 0.34, FONTS.brush, '#c8202a');
});

def('freezer', {
  name: '冰柜',
  cat: 'street',
  sfx: 'crash',
  fill: 0.85,
  build(m) {
    const white = 0xf1f3f2, grey = 0x9aa3ab, dark = 0x3a3f45;
    m.box(1.14, 0.06, 0.6, dark, 0, 0.03, 0);
    m.rbox(1.2, 0.78, 0.65, 0.04, white, 0, 0.45, 0);
    m.box(1.2, 0.04, 0.65, grey, 0, 0.855, 0);
    m.decal(1.14, 0.6, 'st_freezer_top', 0, 0.876, 0, -90 * D, 0, 0);
    m.decal(1.02, 0.45, 'st_freezer_front', 0, 0.46, 0.326);
    m.box(0.16, 0.02, 0.03, dark, -0.12, 0.885, 0.22);
    m.box(0.16, 0.02, 0.03, dark, 0.12, 0.885, -0.22);
    m.box(0.42, 0.26, 0.012, 0xc9a06a, 0.28, 1.005, -0.27, -8 * D, 0, 0);
    m.decal(0.4, 0.25, 'st_freezer_card', 0.28, 1.006, -0.263, -8 * D, 0, 0);
  },
});

// ================================================================================================
// 小吃摊: 煎饼 · 水果 · 烧烤 · 包子 · 糖葫芦
// ================================================================================================
decalS('st_jianbing', 256, 56, 0.75, (ctx, w, h) => {
  ctx.fillStyle = '#fff8e8'; ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = '#d8342c'; ctx.lineWidth = 4; ctx.strokeRect(3, 3, w - 6, h - 6);
  fitText(ctx, '煎饼果子', w / 2, h / 2, w - 30, h - 12, FONTS.brush, '#d02a24');
});
decalS('st_jianbing_box', 256, 96, 0.75, (ctx, w, h) => {
  ctx.fillStyle = '#e9ecef'; ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#f2c46a'; ctx.beginPath(); ctx.arc(46, h / 2, 34, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#f5a623'; ctx.beginPath(); ctx.ellipse(40, h / 2 - 6, 15, 11, 0.4, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#3f9a4a';
  for (const [x, y] of [[58, 36], [30, 60], [60, 62], [50, 50]]) ctx.fillRect(x, y, 5, 3);
  fitText(ctx, '杂粮煎饼', 168, h * 0.38, 160, h * 0.44, FONTS.brush, '#d02a24');
  fitText(ctx, '加蛋 · 加肠 · 加薄脆', 168, h * 0.76, 150, h * 0.2, FONTS.sans, '#4a4f56');
});

def('pancake_cart', {
  name: '煎饼摊',
  cat: 'food',
  sfx: 'crash',
  fill: 0.35,
  build(m) {
    const steel = 0xc9cdd2, dsteel = 0x9aa1a8, frame = 0x2f6fb8, tire = 0x232327, hub = 0xb8bcc2, glass = 0xcfe5ec;
    const wheel = (x, z) => {
      m.cyl(0.22, 0.22, 0.06, tire, x, 0.22, z, 90 * D, 0, 0, 14);
      m.cyl(0.12, 0.12, 0.07, hub, x, 0.22, z, 90 * D, 0, 0, 8);
    };
    wheel(-0.78, 0); wheel(0.35, 0.45); wheel(0.35, -0.45);
    m.cyl(0.02, 0.02, 0.9, dsteel, 0.35, 0.22, 0, 90 * D, 0, 0, 6);
    // rider frame, fork, handlebar, saddle
    rod(m, [-0.68, 0.9, 0], [-0.3, 0.55, 0], 0.025, frame);
    rod(m, [-0.45, 0.3, 0], [-0.5, 0.84, 0], 0.022, frame);
    rod(m, [-0.45, 0.3, 0], [-0.3, 0.46, 0], 0.02, frame);
    m.sym(s => rod(m, [-0.68, 0.9, s * 0.04], [-0.78, 0.22, s * 0.04], 0.015, frame, 6));
    rod(m, [-0.68, 0.9, 0], [-0.66, 1.06, 0], 0.02, dsteel, 6);
    rod(m, [-0.64, 1.06, -0.3], [-0.64, 1.06, 0.3], 0.016, dsteel, 6);
    m.sym(s => m.cyl(0.022, 0.022, 0.1, 0x26262c, -0.64, 1.06, s * 0.27, 90 * D, 0, 0, 6));
    m.ellipsoid(0.13, 0.045, 0.09, 0x2e2a28, -0.5, 0.88, 0, 0, 0, 0, 8);
    m.sym(s => m.box(0.1, 0.02, 0.06, 0x26262c, -0.45, 0.3, s * 0.11));
    // stainless cart box and counter
    m.box(1.25, 0.5, 0.8, steel, 0.325, 0.67, 0);
    m.box(1.29, 0.03, 0.84, 0xdfe2e5, 0.325, 0.935, 0);
    m.decal(1.1, 0.42, 'st_jianbing_box', 0.325, 0.66, 0.402);
    // griddle with a pancake on it
    m.cyl(0.3, 0.3, 0.05, 0x2f3136, 0.1, 0.975, 0, 0, 0, 0, 16);
    m.cyl(0.25, 0.25, 0.008, 0xf2c46a, 0.1, 1.004, 0, 0, 0, 0, 14);
    m.ellipsoid(0.08, 0.008, 0.06, 0xf5a623, 0.06, 1.008, 0.05, 0, 0.5, 0, 8);
    m.ellipsoid(0.05, 0.007, 0.07, 0xfbf3dc, 0.16, 1.008, -0.06, 0, 0.3, 0, 8);
    for (let i = 0; i < 6; i++) m.box(0.025, 0.006, 0.012, 0x3f9a4a, 0.02 + (i % 3) * 0.08, 1.012, -0.08 + (i >> 1) * 0.06, 0, i, 0);
    // ingredients: batter bowl, egg tray, crackers
    m.cyl(0.09, 0.07, 0.08, 0xf4f2ec, 0.72, 0.99, -0.16, 0, 0, 0, 10);
    m.disc(0.08, 0xf3e3b0, 0.72, 1.024, -0.16, 0, 0, 0, 10);
    m.box(0.22, 0.02, 0.15, 0xc9a06a, 0.74, 0.96, 0.17);
    for (let i = 0; i < 6; i++) ball(m, 0.026, 0xf2e2c8, 0.67 + (i % 3) * 0.07, 0.99, 0.13 + (i >> 1 & 1) * 0.07, 1, 1.2, 1);
    m.box(0.16, 0.06, 0.14, 0xe8b85a, -0.14, 0.98, -0.24);
    // glass hood with header sign
    m.tbox(1.21, 0.4, 0.015, glass, { pz: 'st_glass', nz: 'st_glass' }, 0.325, 1.15, 0.41);
    m.sym(s => m.tbox(0.015, 0.4, 0.82, glass, { px: 'st_glass', nx: 'st_glass' }, 0.325 + s * 0.61, 1.15, 0));
    for (const x of [-0.29, 0.94]) for (const z of [-0.41, 0.41]) m.box(0.03, 0.72, 0.03, dsteel, x, 1.31, z);
    m.box(1.26, 0.04, 0.03, dsteel, 0.325, 1.66, -0.41);
    m.sym(s => m.box(0.03, 0.04, 0.84, dsteel, 0.325 + s * 0.615, 1.66, 0));
    m.box(1.26, 0.24, 0.05, 0xfff8e8, 0.325, 1.56, 0.41);
    m.glow(0.8);
    m.decal(1.18, 0.22, 'st_jianbing', 0.325, 1.56, 0.437);
    m.glow(0);
  },
});

// fruit heaps seen from above (crate tops)
function fruitHeap(base, hi, shadow, r, extra) {
  return (ctx, w, h) => {
    ctx.fillStyle = shadow; ctx.fillRect(0, 0, w, h);
    let a = 31;
    const rnd = () => ((a = (a * 9301 + 49297) % 233280) / 233280);
    for (let j = 0; j < 3; j++) for (let y = r * 0.7; y < h; y += r * 1.5) for (let x = r * 0.7; x < w; x += r * 1.6) {
      const cx = x + (rnd() - 0.5) * r * 0.9 + (j % 2) * r * 0.5, cy = y + (rnd() - 0.5) * r * 0.8;
      const g = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.35, r * 0.1, cx, cy, r);
      g.addColorStop(0, hi); g.addColorStop(1, base);
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, r * (0.9 + rnd() * 0.15), 0, Math.PI * 2); ctx.fill();
      if (extra) extra(ctx, cx, cy, r);
    }
  };
}
decal('st_oranges', 96, 80, fruitHeap('#ee8a1e', '#ffc46a', '#a85a12', 11, (ctx, x, y) => {
  ctx.fillStyle = '#5a7a2a'; ctx.fillRect(x - 1, y - 1, 2, 2);
}));
decal('st_apples', 96, 80, fruitHeap('#c8202a', '#ff8a70', '#7a1418', 11, (ctx, x, y, r) => {
  ctx.fillStyle = '#6a4a2a'; ctx.fillRect(x - 1, y - r * 0.5, 2, 4);
}));
decal('st_grapes', 96, 80, fruitHeap('#5a2a78', '#a070c8', '#2e1440', 6));
decal('st_melon_cut', 64, 64, (ctx, w, h) => {
  ctx.fillStyle = '#2f6b2a'; ctx.beginPath(); ctx.arc(w / 2, h / 2, w / 2, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#e8f0c8'; ctx.beginPath(); ctx.arc(w / 2, h / 2, w / 2 - 4, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#e8303a'; ctx.beginPath(); ctx.arc(w / 2, h / 2, w / 2 - 7, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#26221c';
  for (let i = 0; i < 14; i++) {
    const a = i * 2.4, rr = 7 + (i % 4) * 5;
    ctx.beginPath(); ctx.ellipse(w / 2 + Math.cos(a) * rr, h / 2 + Math.sin(a) * rr, 2.2, 1.3, a, 0, Math.PI * 2); ctx.fill();
  }
});
decal('st_stripes', 64, 64, (ctx, w, h) => {
  for (let i = 0; i < 8; i++) { ctx.fillStyle = i % 2 ? '#f4f2ec' : '#d8342c'; ctx.fillRect(i * w / 8, 0, w / 8 + 1, h); }
});
decalS('st_fruit_sign', 256, 40, 0.75, (ctx, w, h) => {
  ctx.fillStyle = '#f2c14e'; ctx.fillRect(0, 0, w, h);
  fitText(ctx, '新鲜水果', w * 0.32, h / 2, w * 0.5, h * 0.84, FONTS.brush, '#c8202a');
  fitText(ctx, '甜过初恋', w * 0.79, h / 2, w * 0.34, h * 0.56, FONTS.brush, '#2f6b2a');
});
const PRICES = [['st_price_orange', '橙子', '4.5'], ['st_price_apple', '苹果', '6.8'], ['st_price_grape', '葡萄', '9.9'],
  ['st_price_melon', '西瓜', '1.8'], ['st_price_banana', '香蕉', '3.5']];
for (const [key, name, p] of PRICES) {
  decal(key, 56, 36, (ctx, w, h) => {
    ctx.fillStyle = '#fbf8ee'; ctx.fillRect(0, 0, w, h);
    fitText(ctx, name, w / 2, h * 0.28, w - 10, h * 0.34, FONTS.brush, '#26221c');
    fitText(ctx, p + '元/斤', w / 2, h * 0.72, w - 6, h * 0.4, FONTS.brush, '#d02a24');
  });
}
decal('st_qr_pay', 48, 64, (ctx, w, h) => {
  ctx.fillStyle = '#2aa198'; ctx.fillRect(0, 0, w, h);
  qrCode(ctx, 8, 8, 32, 5);
  fitText(ctx, '扫码付款', w / 2, h - 11, w - 6, 12, FONTS.sans, '#ffffff');
});

def('fruit_stall', {
  name: '水果摊',
  cat: 'food',
  sfx: 'squish',
  fill: 0.35,
  build(m) {
    const wood = 0xb07a4f, pole = 0x8a9199;
    // table + raised back tier
    m.box(2.8, 0.05, 1.1, wood, 0, 0.7, 0);
    for (const x of [-1.35, 1.35]) for (const z of [-0.5, 0.5]) m.box(0.06, 0.68, 0.06, shade(wood, 0.8), x, 0.34, z);
    m.box(2.8, 0.22, 0.03, shade(wood, 0.9), 0, 0.6, 0.54);
    m.box(2.8, 0.3, 0.4, shade(wood, 0.92), 0, 0.875, -0.33);
    // tilted crates with price cards
    const crate = (x, col, key, price, fruit) => {
      m.push(x, 0.8, 0.2, 12 * D, 0, 0);
      m.box(0.6, 0.15, 0.48, col, 0, 0, 0);
      m.decal(0.56, 0.44, key, 0, 0.076, 0, -90 * D, 0, 0);
      fruit();
      m.box(0.006, 0.2, 0.006, 0xd9c49a, -0.22, 0.14, 0.2);
      m.box(0.12, 0.078, 0.004, 0xfbf8ee, -0.22, 0.24, 0.2);
      m.decal(0.118, 0.076, price, -0.22, 0.24, 0.203);
      m.pop();
    };
    crate(-1.0, 0x3a78c2, 'st_oranges', 'st_price_orange', () => {
      for (const [x, z] of [[-0.12, 0.05], [0.08, -0.08], [0.15, 0.1], [-0.02, -0.12]]) ball(m, 0.045, 0xf08a1e, x, 0.11, z);
    });
    crate(-0.33, 0x4a9a5a, 'st_apples', 'st_price_apple', () => {
      for (const [x, z] of [[-0.1, -0.05], [0.1, 0.06], [0.14, -0.12], [-0.02, 0.12]]) ball(m, 0.048, 0xd02a2a, x, 0.115, z);
    });
    crate(0.33, 0xd8342c, 'st_grapes', 'st_price_grape', () => {
      for (const [x, z] of [[-0.08, 0], [0.1, -0.06]]) {
        for (let i = 0; i < 4; i++) ball(m, 0.03, 0x6a3490, x + (i % 2) * 0.04 - 0.02, 0.1 + (i >> 1) * 0.03, z + (i >> 1) * 0.02);
      }
    });
    // cut watermelon + wedges on a tray
    m.push(1.0, 0.725, 0.2, 0, 0, 0);
    m.box(0.56, 0.02, 0.44, 0x3a78c2, 0, 0.01, 0);
    m.dome(0.17, 0x2f6b2a, -0.08, 0.173, 0.02, 1, 0.9, 1, 180 * D, 0, 0, 8);
    m.pop();
    m.push(1.0, 0.725, 0.2, 0, 0, 0);
    m.decal(0.33, 0.33, 'st_melon_cut', -0.08, 0.176, 0.02, -90 * D, 0, 0);
    m.pop();
    m.sym(s => m.prism(0.14, 0.1, 0.05, 0xe8303a, 1.14 + s * 0.02, 0.8, 0.28 + s * 0.08, 0, s * 0.3, 0));
    // bananas on the back tier
    for (const [bx, rot] of [[-0.95, 0.3], [-0.45, -0.2]]) {
      m.push(bx, 1.03, -0.3, 0, rot, 0);
      m.box(0.03, 0.04, 0.04, 0x6a5a2a, 0, 0.03, -0.08);
      for (let i = 0; i < 5; i++) {
        m.push((i - 2) * 0.055, 0.045, 0.04, 0.25, (i - 2) * 0.12, 0);
        ball(m, 0.042, i % 2 ? 0xf2d33a : 0xecc92e, 0, 0, 0, 0.85, 0.75, 3.0);
        m.pop();
      }
      m.pop();
    }
    m.box(0.12, 0.078, 0.004, 0xfbf8ee, -0.7, 1.12, -0.13);
    m.decal(0.118, 0.076, 'st_price_banana', -0.7, 1.12, -0.127);
    m.box(0.006, 0.12, 0.006, 0xd9c49a, -0.7, 1.05, -0.14);
    // scale, QR code
    m.box(0.3, 0.08, 0.26, 0xf1f3f2, 0.35, 1.065, -0.33);
    m.box(0.26, 0.012, 0.22, 0xc9cdd2, 0.35, 1.11, -0.33);
    m.glow(1); m.box(0.12, 0.035, 0.005, 0x48f08a, 0.35, 1.06, -0.199); m.glow(0);
    m.box(0.16, 0.21, 0.01, 0x2aa198, 0.9, 1.13, -0.3, -10 * D, 0, 0);
    m.decal(0.155, 0.205, 'st_qr_pay', 0.9, 1.131, -0.294, -10 * D, 0, 0);
    // watermelons piled on the ground
    const melon = (x, y, z, r, ry) => {
      // long axis horizontal; stripes run along it (angle measured around that axis)
      const sx = Math.sin(ry), cz = Math.cos(ry);
      const col = (vx, vy, vz) => {
        const a = Math.atan2((vx - x) * sx + (vz - z) * cz, vy - y);
        return mix(0x2c5e22, 0x86b84e, 0.5 + 0.5 * Math.cos(4 * a));
      };
      m.sphere(r, col, x, y, z, 1, 1.25, 1, 0, ry, 90 * D, 8);
    };
    melon(0.95, 0.15, 0.78, 0.15, 0.2);
    melon(1.28, 0.15, 0.74, 0.15, -0.3);
    melon(1.12, 0.14, 1.0, 0.14, 0.5);
    melon(1.1, 0.4, 0.84, 0.14, 0.1);
    // striped canopy on four poles
    for (const x of [-1.45, 1.45]) {
      m.cyl(0.025, 0.025, 2.3, pole, x, 1.15, -0.72, 0, 0, 0, 6);
      m.cyl(0.025, 0.025, 2.05, pole, x, 1.025, 0.82, 0, 0, 0, 6);
    }
    const tilt = Math.atan2(0.25, 1.54);
    m.decal(3.0, 1.58, 'st_stripes', 0, 2.18, 0.05, -90 * D + tilt, 0, 0, 0xffffff, true);
    m.box(3.0, 0.24, 0.012, 0xf2c14e, 0, 1.94, 0.83);
    m.decal(2.9, 0.22, 'st_fruit_sign', 0, 1.94, 0.837);
  },
});

decalS('st_bbq_sign', 256, 48, 0.75, (ctx, w, h) => {
  ctx.fillStyle = '#c8202a'; ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#f2a14a';
  for (const x of [22, w - 22]) {
    ctx.beginPath(); ctx.moveTo(x, 6); ctx.quadraticCurveTo(x + 14, 26, x + 6, 42); ctx.lineTo(x - 6, 42); ctx.quadraticCurveTo(x - 14, 26, x, 6); ctx.fill();
  }
  fitText(ctx, '烧烤', w * 0.3, h / 2, w * 0.3, h * 0.86, FONTS.brush, '#ffe14a');
  fitText(ctx, '羊肉串 · 鸡翅 · 韭菜', w * 0.66, h / 2 + 1, w * 0.4, h * 0.4, FONTS.sans, '#fff4dc');
});
decal('st_bbq_v', 40, 112, (ctx, w, h) => {
  ctx.fillStyle = '#c8202a'; ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = '#ffe14a'; ctx.lineWidth = 2; ctx.strokeRect(3, 3, w - 6, h - 6);
  verticalText(ctx, '烧烤', w / 2, h * 0.4, w - 10, h * 0.6, FONTS.brush, '#ffe14a');
  fitText(ctx, '撸串', w / 2, h * 0.84, w - 12, h * 0.16, FONTS.sans, '#ffffff');
});

def('bbq_stall', {
  name: '烧烤摊',
  cat: 'food',
  sfx: 'metal',
  fill: 0.3,
  build(m) {
    const steel = 0x4a4d52, lsteel = 0x8d949b, stick = 0xe2c894;
    // charcoal trough on legs
    m.box(1.7, 0.02, 0.34, steel, 0, 0.73, 0);
    m.sym(s => {
      m.box(1.7, 0.24, 0.02, steel, 0, 0.84, s * 0.16);
      m.box(0.02, 0.24, 0.34, steel, s * 0.84, 0.84, 0);
      m.box(1.74, 0.02, 0.04, lsteel, 0, 0.965, s * 0.17);
      for (const z of [-0.14, 0.14]) m.box(0.04, 0.73, 0.04, steel, s * 0.8, 0.365, z);
    });
    m.box(1.6, 0.02, 0.3, lsteel, 0, 0.25, 0);
    m.box(0.36, 0.2, 0.22, 0x2a2628, -0.5, 0.36, 0);
    m.box(0.3, 0.12, 0.2, 0xc9a06a, 0.3, 0.32, 0);
    m.glow(1);
    m.box(1.64, 0.04, 0.3, 0xff6a2a, 0, 0.88, 0);
    m.decal(1.5, 0.2, 'st_bbq_sign', 0, 0.84, 0.172);
    m.glow(0);
    // coal lumps
    m.jitter(0.25);
    for (let i = 0; i < 9; i++) m.box(0.06, 0.03, 0.05, 0x3a2e2a, -0.72 + i * 0.18, 0.905, (i % 3 - 1) * 0.08, 0, i, 0);
    m.jitter(0);
    // skewers across the trough
    const kinds = ['lamb', 'lamb', 'wing', 'lamb', 'sausage', 'leek', 'lamb', 'wing', 'lamb', 'sausage', 'lamb'];
    kinds.forEach((k, i) => {
      const x = -0.72 + i * 0.144;
      m.box(0.008, 0.008, 0.54, stick, x, 0.978, 0);
      if (k === 'lamb') {
        for (let j = 0; j < 4; j++) m.box(0.036, 0.03, 0.036, j % 2 ? 0xefd9b4 : 0x8b4a2b, x, 0.985, -0.09 + j * 0.06, 0, j * 0.4, 0);
      } else if (k === 'wing') {
        ball(m, 0.05, 0xd89a40, x, 0.99, 0.0, 0.6, 0.35, 1.3);
      } else if (k === 'sausage') {
        m.capsule(0.022, 0.16, 0xc8503a, x, 0.99, 0, 90 * D, 0, 0, 6);
      } else {
        for (let j = 0; j < 3; j++) m.box(0.03, 0.012, 0.07, 0x5cae4f, x, 0.985, -0.08 + j * 0.08);
      }
    });
    // chilli & cumin shakers
    m.cyl(0.03, 0.03, 0.09, 0xd8342c, -0.78, 1.01, 0.08, 0, 0, 0, 8);
    m.cyl(0.03, 0.03, 0.09, 0xc9a06a, -0.7, 1.01, 0.1, 0, 0, 0, 8);
    // smoke
    puff(m, 0.07, 0xdedcd8, -0.2, 1.1, 0);
    puff(m, 0.09, 0xe9e7e3, -0.1, 1.24, -0.02);
    puff(m, 0.06, 0xf1efec, 0.04, 1.38, 0.01);
    // vertical lightbox sign on a post
    m.box(0.03, 1.0, 0.03, steel, 0.87, 1.43, -0.08);
    m.box(0.22, 0.6, 0.08, 0xc8202a, 0.87, 1.55, -0.08);
    m.glow(1);
    m.decal(0.2, 0.56, 'st_bbq_v', 0.87, 1.55, -0.038);
    m.decal(0.2, 0.56, 'st_bbq_v', 0.87, 1.55, -0.122, 0, Math.PI, 0);
    m.glow(0);
  },
});

decalS('st_baozi_sign', 256, 88, 0.75, (ctx, w, h) => {
  ctx.fillStyle = '#6a3a22'; ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#b8282a'; ctx.fillRect(6, 6, w - 12, h - 12);
  ctx.strokeStyle = '#f2c14e'; ctx.lineWidth = 3; ctx.strokeRect(11, 11, w - 22, h - 22);
  fitText(ctx, '包子', w * 0.36, h * 0.5, w * 0.44, h * 0.72, FONTS.brush, '#ffd24a');
  verticalText(ctx, '鲜肉', w * 0.74, h * 0.5, 22, h * 0.6, FONTS.brush, '#fff1c8');
  verticalText(ctx, '菜包', w * 0.86, h * 0.5, 22, h * 0.6, FONTS.brush, '#fff1c8');
});
decal('st_baozi_menu', 192, 56, (ctx, w, h) => {
  ctx.fillStyle = '#f7f4ea'; ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#5a8ad0';
  for (let i = 0; i < w; i += 12) { ctx.fillRect(i, 0, 6, 5); ctx.fillRect(i + 6, h - 5, 6, 5); }
  fitText(ctx, '鲜肉包 2元  菜包 1.5元', w / 2, h * 0.36, w - 16, h * 0.28, FONTS.brush, '#26221c');
  fitText(ctx, '豆沙包 1.5元  豆浆 2元', w / 2, h * 0.68, w - 16, h * 0.28, FONTS.brush, '#b8282a');
});

def('baozi_stall', {
  name: '包子摊',
  cat: 'food',
  sfx: 'wood',
  fill: 0.4,
  build(m) {
    const bamboo = 0xdcb97a, band = 0xa87a44, cloth = 0xf2efe6, dough = 0xf7f1e3, wood = 0xa06a42;
    m.box(2.0, 0.04, 0.8, wood, 0, 0.76, 0);
    for (const x of [-0.93, 0.93]) for (const z of [-0.34, 0.34]) m.box(0.05, 0.74, 0.05, shade(wood, 0.8), x, 0.37, z);
    m.box(2.04, 0.012, 0.82, cloth, 0, 0.786, 0);
    m.box(2.04, 0.38, 0.012, cloth, 0, 0.6, 0.414);
    m.decal(1.5, 0.36, 'st_baozi_menu', 0, 0.6, 0.421);
    const layer = (x, z, y, r) => {
      m.cyl(r, r, 0.11, bamboo, x, y + 0.055, z, 0, 0, 0, 10);
      m.cyl(r + 0.008, r + 0.008, 0.025, band, x, y + 0.1, z, 0, 0, 0, 10);
    };
    const lid = (x, z, y, r) => {
      m.dome(r + 0.01, bamboo, x, y, z, 1, 0.32, 1, 0, 0, 0, 10);
      ball(m, 0.025, band, x, y + r * 0.32 + 0.01, z);
    };
    // stack of four, stack of two
    for (let i = 0; i < 4; i++) layer(-0.55, -0.05, 0.792 + i * 0.112, 0.27);
    lid(-0.55, -0.05, 0.792 + 4 * 0.112, 0.27);
    for (let i = 0; i < 2; i++) layer(0.05, -0.1, 0.792 + i * 0.112, 0.25);
    lid(0.05, -0.1, 0.792 + 2 * 0.112, 0.25);
    // open steamer full of baozi, its lid leaning behind
    layer(0.62, 0.08, 0.792, 0.27);
    m.disc(0.26, 0xe8dcc0, 0.62, 0.86, 0.08, 0, 0, 0, 10);
    for (const [dx, dz] of [[0, 0], [0.14, 0.05], [-0.13, 0.06], [0.05, -0.14], [-0.08, -0.12], [0.1, 0.16]]) {
      m.dome(0.075, dough, 0.62 + dx, 0.86, 0.08 + dz, 1, 0.75, 1, 0, 0, 0, 8);
      ball(m, 0.016, 0xeadcc0, 0.62 + dx, 0.918, 0.08 + dz);
    }
    // steam
    puff(m, 0.08, 0xf4f4f2, 0.6, 1.02, 0.1);
    puff(m, 0.1, 0xf7f7f5, 0.54, 1.17, 0.05);
    puff(m, 0.065, 0xfafaf8, 0.63, 1.31, 0.02);
    // sign board on two posts
    m.sym(s => m.box(0.04, 1.08, 0.04, shade(wood, 0.75), s * 0.5, 1.32, -0.36));
    m.box(1.2, 0.42, 0.04, 0x6a3a22, 0, 1.64, -0.36);
    m.decal(1.18, 0.4, 'st_baozi_sign', 0, 1.64, -0.338);
  },
});

def('tanghulu_pole', {
  name: '糖葫芦草把子',
  cat: 'food',
  sfx: 'wood',
  fill: 0.15,
  build(m) {
    const straw = 0xe2c46e, rope = 0x9a6a3a, pole = 0xa87a4a, stick = 0xeedfb6, red = 0xd9262a;
    m.box(0.56, 0.06, 0.08, pole, 0, 0.03, 0);
    m.box(0.08, 0.06, 0.56, pole, 0, 0.03, 0);
    m.cyl(0.026, 0.03, 1.5, pole, 0, 0.81, 0, 0, 0, 0, 6);
    const prof = [[0.03, 0.84], [0.1, 0.89], [0.16, 1.01], [0.178, 1.19], [0.165, 1.37], [0.11, 1.49], [0.035, 1.55]];
    const R = y => {
      for (let i = 0; i < prof.length - 1; i++) {
        const [r0, y0] = prof[i], [r1, y1] = prof[i + 1];
        if (y >= y0 && y <= y1) return r0 + (r1 - r0) * (y - y0) / (y1 - y0);
      }
      return 0.03;
    };
    m.lathe(prof, speckle(straw, 0.22), 0, 0, 0, 0, 0, 0, 10);
    m.cone(0.07, 0.14, speckle(0xd8b860, 0.25), 0, 1.6, 0, 0, 0, 0, 6);
    for (const y of [0.96, 1.42]) m.cyl(R(y) + 0.01, R(y) + 0.01, 0.03, rope, 0, y, 0, 0, 0, 0, 10);
    // sticks of candied hawthorn bristling out of the bundle
    const stickAt = (a, y, e, n) => {
      const r0 = R(y) - 0.05, d = [Math.cos(a) * Math.cos(e), Math.sin(e), Math.sin(a) * Math.cos(e)];
      const p0 = [Math.cos(a) * r0, y, Math.sin(a) * r0];
      const L = 0.16 + n * 0.056;
      rod(m, p0, [p0[0] + d[0] * L, p0[1] + d[1] * L, p0[2] + d[2] * L], 0.005, stick, 4);
      m.jitter(0.1);
      for (let k = 0; k < n; k++) {
        const t = 0.14 + k * 0.054;
        ball(m, 0.027, red, p0[0] + d[0] * t, p0[1] + d[1] * t, p0[2] + d[2] * t);
      }
      m.jitter(0);
    };
    for (let i = 0; i < 4; i++) stickAt(i * Math.PI / 2 + 0.3, 1.05, 22 * D, 4);
    for (let i = 0; i < 4; i++) stickAt(i * Math.PI / 2 + 1.1, 1.22, 30 * D, 4);
    for (let i = 0; i < 3; i++) stickAt(i * 2 * Math.PI / 3 + 0.6, 1.38, 40 * D, 4);
    stickAt(2.2, 1.5, 62 * D, 4);
  },
});

// ================================================================================================
// 石狮子 · 石桌石凳 · 麻将桌
// ================================================================================================
decal('st_lion_panel', 128, 32, (ctx, w, h) => {
  ctx.fillStyle = '#b1ab9f'; ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = '#8e887c'; ctx.lineWidth = 2.5; ctx.lineCap = 'round';
  for (let i = 0; i < 4; i++) {
    const x = 16 + i * 32;
    ctx.beginPath(); ctx.arc(x, h / 2, 7, Math.PI * 0.2, Math.PI * 1.9); ctx.stroke();
    ctx.beginPath(); ctx.arc(x, h / 2, 3, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x + 7, h / 2); ctx.bezierCurveTo(x + 12, h / 2 - 9, x + 20, h / 2 + 9, x + 25, h / 2); ctx.stroke();
  }
  ctx.strokeRect(2, 2, w - 4, h - 4);
});

def('stone_lion', {
  name: '石狮子',
  cat: 'street',
  sfx: 'rumble',
  fill: 0.55,
  build(m) {
    const st = 0xc4bfb5, st2 = 0xaaa49a, eye = 0xdcd7cc, dk = 0x3e3832, mouth = 0x6b4640, red = 0xd8342c;
    const S = c => speckle(c, 0.1);
    // 须弥座 pedestal
    m.box(1.0, 0.14, 0.82, S(st2), 0, 0.07, 0);
    m.box(0.82, 0.26, 0.64, S(st), 0, 0.27, 0);
    m.decal(0.74, 0.18, 'st_lion_panel', 0, 0.27, 0.321);
    m.box(1.0, 0.12, 0.82, S(st2), 0, 0.46, 0);
    const B = 0.52;
    // body: haunches, hind feet, chest, front legs
    m.ellipsoid(0.3, 0.25, 0.3, S(st), 0, B + 0.23, -0.12, 0, 0, 0, 8);
    m.sym(s => ball(m, 0.1, S(st), s * 0.25, B + 0.06, 0.06, 1, 0.7, 1.6));
    m.ellipsoid(0.25, 0.38, 0.23, S(st), 0, B + 0.52, 0.0, -0.25, 0, 0, 8);
    m.cyl(0.075, 0.08, 0.46, S(st), -0.13, B + 0.27, 0.17, 0, 0, 0, 8);
    ball(m, 0.095, S(st), -0.13, B + 0.05, 0.22, 1, 0.62, 1.25);
    // right paw rests on the embroidered ball (绣球)
    m.cyl(0.075, 0.08, 0.3, S(st), 0.14, B + 0.42, 0.2, 0.25, 0, 0, 8);
    ball(m, 0.095, S(st), 0.15, B + 0.28, 0.27, 1, 0.62, 1.25);
    m.sphere(0.125, S(st2), 0.16, B + 0.125, 0.28, 1, 1, 1, 0, 0, 0, 8);
    // big head framed by a round curly mane
    const hy = B + 1.12, hz = 0.1;
    m.sphere(0.36, S(st2), 0, hy + 0.02, hz - 0.1, 1.08, 1.02, 0.72, 0, 0, 0, 10);
    m.sphere(0.27, S(st), 0, hy, hz + 0.03, 1.08, 0.95, 0.9, 0, 0, 0, 8);
    for (let i = 0; i < 11; i++) {
      const a = Math.PI / 2 + (i - 5) * 0.52;
      ball(m, 0.085, S(st2), Math.cos(a) * 0.335, hy + 0.02 + Math.sin(a) * 0.32, hz - 0.02);
    }
    for (const x of [-0.12, 0, 0.12]) ball(m, 0.06, S(st2), x, hy + 0.25, hz + 0.1);
    // face: bulging eyes, angry brows, chubby cheeks, broad nose, open grin with fangs
    m.sym(s => {
      ball(m, 0.07, eye, s * 0.1, hy + 0.05, hz + 0.23);
      ball(m, 0.036, dk, s * 0.1, hy + 0.05, hz + 0.29);
      ball(m, 0.06, S(st2), s * 0.11, hy + 0.14, hz + 0.23, 1.5, 0.5, 0.7);
      ball(m, 0.085, S(st), s * 0.13, hy - 0.1, hz + 0.21, 1, 0.9, 0.8);
      m.cone(0.02, 0.06, 0xece6da, s * 0.06, hy - 0.15, hz + 0.3, Math.PI, 0, 0, 4);
    });
    m.sphere(0.07, S(st2), 0, hy - 0.03, hz + 0.3, 1.35, 0.8, 0.8, 0, 0, 0, 6);
    m.ellipsoid(0.12, 0.06, 0.06, mouth, 0, hy - 0.17, hz + 0.24, 0, 0, 0, 8);
    // red silk collar with a big bow
    m.torus(0.18, 0.026, red, 0, B + 0.8, 0.06, 90 * D - 0.2, 0, 0, Math.PI * 2, 3, 12);
    m.sym(s => ball(m, 0.075, red, s * 0.08, B + 0.76, 0.27, 1.1, 0.7, 0.45));
    ball(m, 0.038, 0xb82a24, 0, B + 0.76, 0.285);
    m.sym(s => m.box(0.05, 0.17, 0.012, red, s * 0.04, B + 0.66, 0.27, 0.25, 0, s * 0.25));
    // curly tail
    for (const [y, z] of [[0.32, -0.41], [0.46, -0.4]]) ball(m, 0.07, S(st2), 0, B + y, z);
  },
});

decal('st_xiangqi', 120, 132, (ctx, w, h) => {
  ctx.fillStyle = '#d3cdc0'; ctx.fillRect(0, 0, w, h);
  const x0 = 10, y0 = 10, dx = (w - 20) / 8, dy = (h - 20) / 9;
  ctx.strokeStyle = '#6e685c'; ctx.lineWidth = 1.5;
  ctx.strokeRect(x0 - 4, y0 - 4, dx * 8 + 8, dy * 9 + 8);
  for (let j = 0; j < 10; j++) { ctx.beginPath(); ctx.moveTo(x0, y0 + j * dy); ctx.lineTo(x0 + 8 * dx, y0 + j * dy); ctx.stroke(); }
  for (let i = 0; i < 9; i++) {
    ctx.beginPath();
    if (i === 0 || i === 8) { ctx.moveTo(x0 + i * dx, y0); ctx.lineTo(x0 + i * dx, y0 + 9 * dy); }
    else { ctx.moveTo(x0 + i * dx, y0); ctx.lineTo(x0 + i * dx, y0 + 4 * dy); ctx.moveTo(x0 + i * dx, y0 + 5 * dy); ctx.lineTo(x0 + i * dx, y0 + 9 * dy); }
    ctx.stroke();
  }
  for (const yy of [0, 7]) {
    ctx.beginPath();
    ctx.moveTo(x0 + 3 * dx, y0 + yy * dy); ctx.lineTo(x0 + 5 * dx, y0 + (yy + 2) * dy);
    ctx.moveTo(x0 + 5 * dx, y0 + yy * dy); ctx.lineTo(x0 + 3 * dx, y0 + (yy + 2) * dy);
    ctx.stroke();
  }
  fitText(ctx, '楚河', x0 + 2 * dx, y0 + 4.5 * dy, dx * 3, dy * 0.8, FONTS.serif, '#5a544a');
  fitText(ctx, '漢界', x0 + 6 * dx, y0 + 4.5 * dy, dx * 3, dy * 0.8, FONTS.serif, '#5a544a');
});
const XQ = [['st_xq_shuai', '帅', '#c8202a'], ['st_xq_che', '車', '#26262c'], ['st_xq_pao', '炮', '#c8202a'], ['st_xq_ma', '馬', '#26262c']];
for (const [key, ch, col] of XQ) {
  decal(key, 32, 32, (ctx, w, h) => {
    ctx.fillStyle = '#f0dcae'; ctx.beginPath(); ctx.arc(w / 2, h / 2, w / 2 - 1, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = col; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(w / 2, h / 2, w / 2 - 4, 0, Math.PI * 2); ctx.stroke();
    fitText(ctx, ch, w / 2, h / 2, w * 0.62, h * 0.62, FONTS.serif, col);
  });
}

def('stone_table', {
  name: '石桌石凳',
  cat: 'street',
  sfx: 'rumble',
  fill: 0.3,
  build(m) {
    const st = 0xc0baae, st2 = 0xa8a296;
    m.lathe([[0.24, 0], [0.24, 0.05], [0.15, 0.12], [0.11, 0.35], [0.13, 0.58], [0.22, 0.7], [0, 0.705]], speckle(st2, 0.1), 0, 0, 0, 0, 0, 0, 10);
    m.cyl(0.46, 0.44, 0.08, speckle(st, 0.08), 0, 0.74, 0, 0, 0, 0, 16);
    m.decal(0.5, 0.55, 'st_xiangqi', 0, 0.7805, 0, -90 * D, 0, 0);
    for (const [[key], x, z] of [[XQ[0], 0.06, 0.2], [XQ[1], -0.16, -0.12], [XQ[2], 0.12, -0.04], [XQ[3], -0.06, 0.07]]) {
      m.cyl(0.027, 0.027, 0.016, 0xe8d2a0, x, 0.788, z, 0, 0, 0, 10);
      m.decal(0.048, 0.048, key, x, 0.7965, z, -90 * D, 0, 0);
    }
    // four drum stools (鼓凳) with nail bands
    for (let i = 0; i < 4; i++) {
      const a = i * Math.PI / 2, x = Math.sin(a) * 0.79, z = Math.cos(a) * 0.79;
      m.lathe([[0.15, 0], [0.19, 0.07], [0.205, 0.2], [0.19, 0.34], [0.15, 0.42], [0, 0.425]], speckle(st, 0.1), x, 0, z, 0, 0, 0, 10);
      m.cyl(0.2, 0.2, 0.024, st2, x, 0.085, z, 0, 0, 0, 10);
      m.cyl(0.194, 0.194, 0.024, st2, x, 0.335, z, 0, 0, 0, 10);
    }
  },
});

// mahjong: rows of tiles as textured boxes
function mjTiles(n, draw) {
  return (ctx, w, h) => {
    const tw = w / n;
    let a = 7;
    const rnd = () => ((a = (a * 9301 + 49297) % 233280) / 233280);
    for (let i = 0; i < n; i++) draw(ctx, i * tw, tw, h, rnd);
  };
}
function mjFace(ctx, x, tw, h, rnd) {
  ctx.fillStyle = '#b8b2a2'; ctx.fillRect(x, 0, tw, h);
  ctx.fillStyle = '#f4efe0'; ctx.fillRect(x + 1, 1, tw - 2, h - 2);
  const k = Math.floor(rnd() * 5), cx = x + tw / 2;
  if (k === 0) {
    ctx.fillStyle = '#2f63c9';
    for (let j = 0; j < 3; j++) { ctx.beginPath(); ctx.arc(cx, h * (0.25 + j * 0.25), tw * 0.2, 0, Math.PI * 2); ctx.fill(); }
  } else if (k === 1) {
    ctx.fillStyle = '#2f8a5b';
    for (let j = 0; j < 2; j++) ctx.fillRect(x + tw * (0.25 + j * 0.3), h * 0.2, tw * 0.18, h * 0.6);
  } else if (k === 2) {
    fitText(ctx, '万', cx, h * 0.66, tw - 3, h * 0.4, FONTS.serif, '#c8202a');
    fitText(ctx, '三', cx, h * 0.3, tw - 3, h * 0.3, FONTS.serif, '#26262c');
  } else if (k === 3) {
    fitText(ctx, '中', cx, h / 2, tw - 2, h * 0.6, FONTS.serif, '#c8202a');
  } else {
    fitText(ctx, '發', cx, h / 2, tw - 2, h * 0.6, FONTS.serif, '#2f8a5b');
  }
}
decal('st_mj_faces', 208, 28, mjTiles(13, mjFace));
decal('st_mj_backs', 208, 28, mjTiles(13, (ctx, x, tw, h) => {
  ctx.fillStyle = '#1f6b44'; ctx.fillRect(x, 0, tw, h);
  ctx.fillStyle = '#2f8a5b'; ctx.fillRect(x + 1, 1, tw - 2, h - 2);
}));
decal('st_mj_rowtop', 208, 12, mjTiles(13, (ctx, x, tw, h) => {
  ctx.fillStyle = '#2f8a5b'; ctx.fillRect(x, 0, tw, h / 2);
  ctx.fillStyle = '#f4efe0'; ctx.fillRect(x, h / 2, tw, h / 2);
  ctx.fillStyle = '#9a9484'; ctx.fillRect(x, 0, 1, h);
}));
decal('st_mj_wall', 170, 20, mjTiles(17, (ctx, x, tw, h) => {
  for (let j = 0; j < 2; j++) {
    const y = j * h / 2;
    ctx.fillStyle = '#2f8a5b'; ctx.fillRect(x, y, tw, h / 4);
    ctx.fillStyle = '#f4efe0'; ctx.fillRect(x, y + h / 4, tw, h / 4);
  }
  ctx.fillStyle = '#6a7a6a'; ctx.fillRect(x, 0, 1, h); ctx.fillRect(x, h / 2, tw, 1);
}));
decal('st_mj_walltop', 170, 20, mjTiles(17, (ctx, x, tw, h) => {
  ctx.fillStyle = '#2f8a5b'; ctx.fillRect(x, 0, tw, h);
  ctx.fillStyle = '#1f6b44'; ctx.fillRect(x, 0, 1, h);
}));
decal('st_mj_discards', 128, 128, (ctx, w, h) => {
  let a = 3;
  const rnd = () => ((a = (a * 9301 + 49297) % 233280) / 233280);
  for (let r = 0; r < 4; r++) for (let c = 0; c < 6; c++) {
    if (rnd() < 0.3) continue;
    ctx.save();
    ctx.translate(18 + c * 18 + (rnd() - 0.5) * 4, 20 + r * 28 + (rnd() - 0.5) * 4);
    ctx.rotate((rnd() - 0.5) * 0.4);
    mjFace(ctx, -7, 14, 20, rnd);
    ctx.restore();
  }
});
decal('st_stool_top', 48, 48, (ctx, w, h) => {
  ctx.fillStyle = '#d8342c'; rrect(ctx, 0, 0, w, h, 8); ctx.fill();
  ctx.fillStyle = '#9e1f1a';
  for (let i = 0; i < 6; i++) {
    const a = i * Math.PI / 3;
    ctx.beginPath(); ctx.ellipse(w / 2 + Math.cos(a) * 10, h / 2 + Math.sin(a) * 10, 5, 2.4, a, 0, Math.PI * 2); ctx.fill();
  }
  ctx.beginPath(); ctx.arc(w / 2, h / 2, 3.5, 0, Math.PI * 2); ctx.fill();
});

def('mahjong_table', {
  name: '麻将桌',
  cat: 'street',
  sfx: 'crash',
  fill: 0.3,
  build(m) {
    const wood = 0x8b5a3c, felt = 0x2f8a5b, ivory = 0xf1ead8, red = 0xd8342c;
    m.box(1.0, 0.04, 1.0, wood, 0, 0.74, 0);
    m.box(0.92, 0.012, 0.92, felt, 0, 0.766, 0);
    m.sym(s => {
      m.box(1.0, 0.035, 0.045, wood, 0, 0.775, s * 0.478);
      m.box(0.045, 0.035, 0.91, wood, s * 0.478, 0.775, 0);
    });
    for (const x of [-0.44, 0.44]) for (const z of [-0.44, 0.44]) m.box(0.05, 0.72, 0.05, shade(wood, 0.82), x, 0.36, z);
    const top = 0.772;
    for (let i = 0; i < 4; i++) {
      m.push(0, top, 0, 0, i * Math.PI / 2, 0);
      m.tbox(0.39, 0.042, 0.021, ivory, { pz: 'st_mj_faces', nz: 'st_mj_backs', py: 'st_mj_rowtop' }, 0, 0.021, 0.365);
      m.tbox(0.44, 0.042, 0.042, ivory, { pz: 'st_mj_wall', nz: 'st_mj_wall', py: 'st_mj_walltop' }, -0.02, 0.021, 0.235);
      m.pop();
    }
    m.decal(0.36, 0.36, 'st_mj_discards', 0, top + 0.001, 0, -90 * D, 0, 0);
    // enamel mug of tea on a corner
    m.cyl(0.04, 0.036, 0.085, 0xf4f2ec, 0.38, top + 0.0425, 0.38, 0, 0, 0, 10);
    m.cyl(0.042, 0.042, 0.01, red, 0.38, top + 0.082, 0.38, 0, 0, 0, 10);
    m.disc(0.036, 0x9a6a2a, 0.38, top + 0.07, 0.38, 0, 0, 0, 10);
    m.torus(0.022, 0.006, 0xf4f2ec, 0.38 - 0.045, top + 0.045, 0.38, 0, 0, 0, Math.PI * 2, 3, 8);
    // four red plastic stools
    for (let i = 0; i < 4; i++) {
      const a = i * Math.PI / 2;
      m.push(Math.sin(a) * 0.76, 0, Math.cos(a) * 0.76, 0, a, 0);
      m.box(0.3, 0.035, 0.3, red, 0, 0.432, 0);
      m.box(0.27, 0.05, 0.27, shade(red, 0.9), 0, 0.395, 0);
      m.decal(0.28, 0.28, 'st_stool_top', 0, 0.4505, 0, -90 * D, 0, 0);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) bar(m, [sx * 0.11, 0.4, sz * 0.11], [sx * 0.145, 0, sz * 0.145], 0.036, red);
      m.pop();
    }
  },
});

// ================================================================================================
// 健身器材 · 游乐设施
// ================================================================================================
const FIT_Y = 0xf2c230, FIT_B = 0x2f6fd0, FIT_G = 0x5d6268;

def('fitness_walker', {
  name: '太空漫步机',
  cat: 'street',
  sfx: 'metal',
  fill: 0.12,
  build(m) {
    m.box(0.36, 0.03, 0.36, 0xa9a59c, 0, 0.015, 0);
    m.cyl(0.065, 0.07, 1.5, FIT_B, 0, 0.765, 0, 0, 0, 0, 10);
    m.dome(0.075, FIT_Y, 0, 1.515, 0, 1, 0.8, 1, 0, 0, 0, 8);
    rod(m, [-0.8, 1.36, 0], [0.8, 1.36, 0], 0.05, FIT_B, 10);
    m.sym(s => {
      const px = s * 0.7;
      m.cyl(0.058, 0.058, 0.08, FIT_Y, s * 0.82, 1.36, 0, 0, 0, 90 * D, 10);
      rod(m, [px, 1.36, -0.25], [px, 1.36, 0.25], 0.035, FIT_Y, 8);
      for (const [z, sw] of [[-0.18, 1], [0.18, -1]]) {
        const ang = sw * s * 10 * D, fx = px + Math.sin(ang) * 1.0, fy = 1.36 - Math.cos(ang) * 1.0;
        rod(m, [px, 1.36, z], [fx, fy, z], 0.03, FIT_Y, 8);
        m.box(0.3, 0.035, 0.13, FIT_G, fx, fy - 0.02, z);
        m.box(0.3, 0.02, 0.02, FIT_Y, fx, fy - 0.025, z + 0.07 * Math.sign(z));
      }
      // hand rail from the post towards each station
      pipeLine(m, [[s * 0.06, 1.1, -0.18], [s * 0.4, 1.13, -0.18], [s * 0.4, 1.13, 0.18], [s * 0.06, 1.1, 0.18]], 0.024, FIT_Y, 8);
    });
  },
});

decal('st_feet', 48, 48, (ctx, w, h) => {
  ctx.fillStyle = '#f2c230';
  for (const s of [-1, 1]) {
    const x = w / 2 + s * 10;
    ctx.beginPath(); ctx.ellipse(x, h * 0.58, 6, 13, s * 0.08, 0, Math.PI * 2); ctx.fill();
    for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.arc(x - 5 + i * 3.5 * 1, h * 0.22 - (i === 0 || i === 3 ? -2 : 0), 2.2, 0, Math.PI * 2); ctx.fill(); }
  }
});

def('fitness_twister', {
  name: '扭腰器',
  cat: 'street',
  sfx: 'metal',
  fill: 0.15,
  build(m) {
    m.box(0.3, 0.03, 0.3, 0xa9a59c, 0, 0.015, 0);
    m.cyl(0.06, 0.065, 1.1, FIT_B, 0, 0.58, 0, 0, 0, 0, 10);
    m.sphere(0.075, FIT_Y, 0, 1.15, 0, 1, 1, 1, 0, 0, 0, 8);
    m.torus(0.36, 0.025, FIT_Y, 0, 1.02, 0, 90 * D, 0, 0, Math.PI * 2, 5, 18);
    for (let k = 0; k < 3; k++) {
      const a = k * 2 * Math.PI / 3 + Math.PI / 3, x = Math.sin(a), z = Math.cos(a);
      rod(m, [0, 1.02, 0], [x * 0.36, 1.02, z * 0.36], 0.02, FIT_Y, 6);
    }
    for (let k = 0; k < 3; k++) {
      const a = k * 2 * Math.PI / 3, x = Math.sin(a) * 0.56, z = Math.cos(a) * 0.56;
      rod(m, [0, 0.1, 0], [x, 0.1, z], 0.04, FIT_B, 8);
      m.cyl(0.05, 0.05, 0.1, FIT_B, x, 0.08, z, 0, 0, 0, 8);
      m.cyl(0.21, 0.21, 0.06, FIT_Y, x, 0.15, z, 0, 0, 0, 12);
      m.cyl(0.18, 0.18, 0.012, FIT_G, x, 0.186, z, 0, 0, 0, 12);
      m.decal(0.26, 0.26, 'st_feet', x, 0.1925, z, -90 * D, 0, a);
    }
  },
});

decal('st_slide_face', 64, 64, (ctx, w, h) => {
  ctx.fillStyle = '#f2c230';
  for (let i = 0; i < 12; i++) {
    const a = i * Math.PI / 6;
    ctx.beginPath(); ctx.moveTo(w / 2 + Math.cos(a - 0.2) * 20, h / 2 + Math.sin(a - 0.2) * 20);
    ctx.lineTo(w / 2 + Math.cos(a) * 31, h / 2 + Math.sin(a) * 31);
    ctx.lineTo(w / 2 + Math.cos(a + 0.2) * 20, h / 2 + Math.sin(a + 0.2) * 20); ctx.fill();
  }
  ctx.fillStyle = '#ffd84a'; ctx.beginPath(); ctx.arc(w / 2, h / 2, 21, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#2a1d17';
  ctx.beginPath(); ctx.arc(w / 2 - 7, h / 2 - 3, 2.8, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(w / 2 + 7, h / 2 - 3, 2.8, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#f29aa6';
  ctx.beginPath(); ctx.arc(w / 2 - 12, h / 2 + 4, 3.5, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(w / 2 + 12, h / 2 + 4, 3.5, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#2a1d17'; ctx.lineWidth = 2.2;
  ctx.beginPath(); ctx.arc(w / 2, h / 2 + 3, 6, 0.2, Math.PI - 0.2); ctx.stroke();
});

def('slide', {
  name: '滑梯',
  cat: 'street',
  sfx: 'hard',
  fill: 0.2,
  build(m) {
    const blue = 0x2f6fd0, red = 0xe8554a, yellow = 0xf2c230, green = 0x5cae4f, orange = 0xf2a14a;
    const ox = -0.45;
    for (const dx of [-0.4, 0.4]) for (const dz of [-0.4, 0.4]) m.cyl(0.05, 0.05, 2.25, blue, ox + dx, 1.125, dz, 0, 0, 0, 8);
    m.box(0.88, 0.08, 0.88, green, ox, 1.2, 0);
    m.sym(s => m.box(0.8, 0.5, 0.04, orange, ox, 1.49, s * 0.4));
    m.decal(0.42, 0.42, 'st_slide_face', ox, 1.5, 0.423);
    m.decal(0.42, 0.42, 'st_slide_face', ox, 1.5, -0.423, 0, Math.PI, 0);
    m.box(0.96, 0.06, 0.96, red, ox, 2.25, 0);
    m.cone(0.72, 0.45, red, ox, 2.5, 0, 0, 45 * D, 0, 4);
    ball(m, 0.06, yellow, ox, 2.74, 0);
    // ladder on the -X side
    const lx0 = ox - 0.44, lx1 = ox - 1.25;
    m.sym(s => bar(m, [lx1, 0, s * 0.25], [lx0, 1.26, s * 0.25], 0.05, yellow));
    for (let i = 1; i <= 5; i++) {
      const t = i / 6.2, x = lx1 + (lx0 - lx1) * t;
      rod(m, [x, 1.26 * t, -0.25], [x, 1.26 * t, 0.25], 0.024, blue, 6);
    }
    m.sym(s => pipeLine(m, [[lx0 + 0.02, 1.24, s * 0.25], [lx0 - 0.1, 1.62, s * 0.25], [lx0 + 0.05, 1.7, s * 0.25]], 0.022, yellow, 6));
    // curved chute on the +X side
    const P = [[ox + 0.42, 1.21], [ox + 0.9, 1.0], [ox + 1.36, 0.64], [ox + 1.8, 0.32], [ox + 2.18, 0.24]];
    for (let i = 0; i < P.length - 1; i++) {
      const [x0, y0] = P[i], [x1, y1] = P[i + 1];
      const len = Math.hypot(x1 - x0, y1 - y0) + 0.05, ang = Math.atan2(y1 - y0, x1 - x0);
      const mx = (x0 + x1) / 2, my = (y0 + y1) / 2, nx = -Math.sin(ang), ny = Math.cos(ang);
      m.box(len, 0.04, 0.5, yellow, mx, my, 0, 0, 0, ang);
      m.sym(s => m.box(len, 0.16, 0.04, red, mx + nx * 0.07, my + ny * 0.07, s * 0.27, 0, 0, ang));
    }
    m.sym(s => m.box(0.05, 0.22, 0.05, blue, ox + 2.08, 0.11, s * 0.2));
    m.sym(s => pipeLine(m, [[ox + 0.42, 1.24, s * 0.27], [ox + 0.46, 1.62, s * 0.27], [ox + 0.62, 1.62, s * 0.27], [ox + 0.66, 1.18, s * 0.27]], 0.022, yellow, 6));
  },
});

def('seesaw', {
  name: '跷跷板',
  cat: 'street',
  sfx: 'hard',
  fill: 0.12,
  build(m) {
    const blue = 0x2f6fd0, red = 0xe8554a, yellow = 0xf2c230, tire = 0x2a2a2e;
    const H = 0.55, th = 14 * D;
    m.box(0.6, 0.04, 0.44, 0x9aa0a6, 0, 0.02, 0);
    m.sym(s => m.extrude([[-0.26, 0.04], [0.26, 0.04], [0.06, H], [-0.06, H]], 0.05, yellow, 0, 0, s * 0.15));
    m.cyl(0.05, 0.05, 0.42, blue, 0, H, 0, 90 * D, 0, 0, 10);
    m.push(0, H + 0.05, 0, 0, 0, th);
    m.box(3.0, 0.06, 0.24, blue, 0, 0, 0);
    m.sym(s => {
      m.rbox(0.34, 0.07, 0.3, 0.025, red, s * 1.28, 0.06, 0);
      pipeLine(m, [[s * 1.0, 0.03, -0.13], [s * 1.0, 0.34, -0.13], [s * 1.0, 0.34, 0.13], [s * 1.0, 0.03, 0.13]], 0.022, yellow, 6);
    });
    m.pop();
    m.cyl(0.13, 0.13, 0.11, tire, -1.25, 0.13, 0, 90 * D, 0, 0, 12);
    m.cyl(0.07, 0.07, 0.115, 0x6a6a70, -1.25, 0.13, 0, 90 * D, 0, 0, 8);
  },
});

// ================================================================================================
// 晾衣架 · 道闸 · 保安亭 · 电线杆
// ================================================================================================
decal('st_quilt', 128, 128, (ctx, w, h) => {
  ctx.fillStyle = '#d8342c'; ctx.fillRect(0, 0, w, h);
  const leaf = (x, y, a) => {
    ctx.fillStyle = '#3f9a4a'; ctx.beginPath(); ctx.ellipse(x, y, 11, 5, a, 0, Math.PI * 2); ctx.fill();
  };
  const flower = (x, y, r, c1, c2) => {
    leaf(x + r * 0.9, y + r * 0.5, 0.5); leaf(x - r * 0.9, y + r * 0.6, -0.6); leaf(x + r * 0.2, y - r * 1.05, 1.4);
    for (let i = 0; i < 7; i++) {
      const a = i * Math.PI * 2 / 7;
      ctx.fillStyle = c1; ctx.beginPath(); ctx.ellipse(x + Math.cos(a) * r * 0.55, y + Math.sin(a) * r * 0.55, r * 0.55, r * 0.38, a, 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = c2; ctx.beginPath(); ctx.arc(x, y, r * 0.42, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#f2c14e'; ctx.beginPath(); ctx.arc(x, y, r * 0.15, 0, Math.PI * 2); ctx.fill();
  };
  flower(30, 32, 22, '#f7a6c2', '#e0507a');
  flower(98, 30, 17, '#ffe07a', '#f2a14a');
  flower(66, 76, 24, '#f7a6c2', '#e0507a');
  flower(22, 104, 16, '#8fc8f0', '#3a78c2');
  flower(108, 104, 20, '#ffe07a', '#f2a14a');
  ctx.fillStyle = '#f4f2ec';
  for (const [x, y] of [[60, 16], [8, 64], [118, 64], [60, 120], [92, 56]]) { ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2); ctx.fill(); }
});

def('clothes_rack', {
  name: '晾衣架',
  cat: 'street',
  sfx: 'soft',
  fill: 0.12,
  build(m) {
    const pole = 0xa8adb3, line = 0x6d7278, LY = 1.88, ZF = 0.2, ZB = -0.2;
    m.sym(s => {
      m.cyl(0.17, 0.19, 0.1, speckle(0xbdb6a8, 0.06), s * 1.45, 0.05, 0, 0, 0, 0, 10);
      m.cyl(0.03, 0.032, 1.86, pole, s * 1.45, 1.02, 0, 0, 0, 0, 8);
      m.box(0.05, 0.05, 0.58, pole, s * 1.45, 1.93, 0);
    });
    for (const z of [ZF, ZB]) rod(m, [-1.45, LY + 0.03, z], [1.45, LY + 0.03, z], 0.006, line, 4);
    const pegs = [0xf08fb0, 0x5cae4f, 0xf2c14e, 0x5aa9e6];
    const peg = (x, z, i) => m.box(0.016, 0.06, 0.014, pegs[i % 4], x, LY + 0.01, z);
    // flowery quilt (东北大花被) folded over the front line
    m.tbox(1.22, 0.92, 0.012, 0xd8342c, { pz: 'st_quilt' }, -0.62, LY - 0.43, ZF + 0.03, 0.06, 0, 0);
    m.tbox(1.22, 0.92, 0.012, 0xd8342c, { nz: 'st_quilt' }, -0.62, LY - 0.43, ZF - 0.03, -0.06, 0, 0);
    m.cyl(0.035, 0.035, 1.22, 0xd8342c, -0.62, LY + 0.015, ZF, 0, 0, 90 * D, 8);
    // 老头衫 on the front line
    m.extrude([[-0.16, 0], [-0.09, 0], [0, -0.13], [0.09, 0], [0.16, 0], [0.22, -0.2], [0.22, -0.62], [-0.22, -0.62], [-0.22, -0.2]], 0.012, 0xf4f2ec, 0.3, LY + 0.01, ZF);
    peg(0.18, ZF, 0); peg(0.42, ZF, 1);
    // socks
    m.extrude([[0, 0], [0.07, 0], [0.07, -0.16], [0.13, -0.2], [0.12, -0.25], [0, -0.22]], 0.012, 0xd8342c, 0.68, LY + 0.01, ZF);
    m.extrude([[0, 0], [0.07, 0], [0.07, -0.16], [0.13, -0.2], [0.12, -0.25], [0, -0.22]], 0.012, 0x8a9199, 0.86, LY + 0.01, ZF);
    peg(0.715, ZF, 2); peg(0.895, ZF, 3);
    // shirt on a hanger and trousers on the back line
    const sx = 0.62, top = LY - 0.1;
    m.torus(0.025, 0.004, line, sx, LY + 0.02, ZB, 0, 90 * D, 0, Math.PI * 1.3, 3, 8);
    m.box(0.006, 0.06, 0.006, line, sx, LY - 0.03, ZB);
    m.sym(s => bar(m, [sx, LY - 0.06, ZB], [sx + s * 0.2, top - 0.02, ZB], 0.008, line));
    m.extrude([[-0.08, 0], [-0.22, -0.03], [-0.32, -0.18], [-0.24, -0.25], [-0.18, -0.16], [-0.19, -0.62], [0.19, -0.62], [0.18, -0.16], [0.24, -0.25], [0.32, -0.18], [0.22, -0.03], [0.08, 0], [0, -0.06]], 0.012, 0x5aa9e6, sx, top, ZB);
    m.box(0.07, 0.07, 0.004, 0x3a78c2, sx + 0.1, top - 0.2, ZB + 0.008);
    m.extrude([[-0.19, 0], [0.19, 0], [0.21, -0.95], [0.04, -0.95], [0, -0.32], [-0.04, -0.95], [-0.21, -0.95]], 0.014, 0x2c3e66, 1.12, LY + 0.01, ZB);
    m.box(0.38, 0.05, 0.018, 0x24345a, 1.12, LY - 0.015, ZB);
    peg(0.97, ZB, 0); peg(1.27, ZB, 2);
  },
});

decal('st_stripes_rw', 256, 16, (ctx, w, h) => {
  for (let i = 0; i < 16; i++) { ctx.fillStyle = i % 2 ? '#f4f2ec' : '#d8342c'; ctx.fillRect(i * w / 16, 0, w / 16 + 1, h); }
});
decal('st_gate_led', 128, 32, (ctx, w, h) => {
  ctx.fillStyle = '#141416'; ctx.fillRect(0, 0, w, h);
  fitText(ctx, '欢迎回家', w / 2, h / 2, w - 12, h - 8, FONTS.sans, '#ff4a3a');
});

def('barrier_gate', {
  name: '道闸',
  cat: 'street',
  sfx: 'metal',
  fill: 0.08,
  build(m) {
    const body = 0xeae7e0, dark = 0x3a3d44, red = 0xd8342c, cx = -1.78;
    m.box(0.46, 0.04, 0.42, 0x9aa0a6, cx, 0.02, 0);
    m.rbox(0.36, 1.0, 0.32, 0.03, body, cx, 0.54, 0);
    m.box(0.4, 0.06, 0.36, red, cx, 1.07, 0);
    m.box(0.37, 0.06, 0.33, red, cx, 0.2, 0);
    m.box(0.3, 0.13, 0.01, dark, cx, 0.78, 0.162);
    m.glow(1);
    m.decal(0.28, 0.1, 'st_gate_led', cx, 0.78, 0.168);
    m.glow(0);
    m.cyl(0.09, 0.09, 0.14, dark, cx + 0.21, 0.9, 0, 90 * D, 0, 0, 10);
    const stripes = { pz: 'st_stripes_rw', nz: 'st_stripes_rw', py: 'st_stripes_rw', ny: 'st_stripes_rw' };
    m.tbox(3.8, 0.09, 0.05, 0xf4f2ec, stripes, cx + 0.2 + 1.9, 0.9, 0.0);
    m.box(0.2, 0.03, 0.2, 0x9aa0a6, 1.9, 0.015, 0);
    m.cyl(0.03, 0.03, 0.8, dark, 1.9, 0.43, 0, 0, 0, 0, 8);
    m.sym(s => bar(m, [1.9, 0.8, 0], [1.9, 0.96, s * 0.06], 0.025, dark));
  },
});

decalS('st_booth_sign', 256, 44, 0.75, (ctx, w, h) => {
  ctx.fillStyle = '#2c4e8a'; ctx.fillRect(0, 0, w, h);
  fitText(ctx, '保安亭', w * 0.38, h / 2, w * 0.5, h * 0.78, FONTS.sans, '#ffffff');
  fitText(ctx, 'SECURITY', w * 0.8, h / 2 + 1, w * 0.3, h * 0.4, FONTS.sans, '#cfe0ff');
});
decal('st_booth_notice', 128, 44, (ctx, w, h) => {
  ctx.fillStyle = '#fbfbf6'; ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = '#d8342c'; ctx.lineWidth = 3; ctx.strokeRect(3, 3, w - 6, h - 6);
  fitText(ctx, '外来车辆 请登记', w / 2, h / 2, w - 16, h * 0.5, FONTS.sans, '#c8202a');
});

def('guard_booth', {
  name: '保安亭',
  cat: 'street',
  sfx: 'crash',
  fill: 0.8,
  build(m) {
    const wall = 0xf0ece2, blue = 0x2c4e8a, frame = 0xc9cdd2, glass = 0x9ec3d8, dark = 0x3a3d44, zf = 0.75;
    m.box(1.7, 0.12, 1.7, 0x9aa0a6, 0, 0.06, 0);
    m.box(1.5, 2.06, 1.5, wall, 0, 1.15, 0);
    m.box(1.52, 0.26, 1.52, blue, 0, 2.05, 0);
    m.decal(1.3, 0.22, 'st_booth_sign', 0, 2.05, 0.762);
    m.box(1.9, 0.1, 1.9, blue, 0, 2.23, 0);
    m.cone(1.1, 0.22, shade(blue, 0.85), 0, 2.39, 0, 0, 45 * D, 0, 4);
    // front window with counter
    m.glow(0.5);
    m.box(1.16, 0.84, 0.02, glass, 0, 1.42, zf + 0.002);
    m.box(0.02, 0.84, 1.0, glass, -zf - 0.002, 1.42, 0);
    m.glow(0);
    m.box(1.22, 0.05, 0.04, frame, 0, 1.86, zf + 0.01);
    m.box(1.22, 0.05, 0.04, frame, 0, 0.98, zf + 0.01);
    m.box(0.04, 0.84, 0.04, frame, 0, 1.42, zf + 0.012);
    m.box(0.04, 0.05, 1.06, frame, -zf - 0.01, 1.86, 0);
    m.box(0.04, 0.05, 1.06, frame, -zf - 0.01, 0.98, 0);
    m.box(1.2, 0.04, 0.24, frame, 0, 0.95, zf + 0.12);
    m.decal(0.52, 0.18, 'st_booth_notice', 0, 0.7, zf + 0.002);
    // door on the right side
    m.box(0.02, 1.86, 0.72, 0xdcd8ce, zf + 0.002, 1.05, -0.2);
    m.glow(0.5);
    m.box(0.02, 0.5, 0.44, glass, zf + 0.008, 1.55, -0.2);
    m.glow(0);
    m.box(0.04, 0.03, 0.12, dark, zf + 0.02, 1.0, 0.05);
    // air-conditioner unit on the back
    m.box(0.62, 0.45, 0.24, 0xeeeeea, 0.3, 0.36, -zf - 0.12);
    m.cyl(0.15, 0.15, 0.01, 0x55595e, 0.4, 0.36, -zf - 0.245, 90 * D, 0, 0, 10);
  },
});

decal('st_pole_ads', 36, 96, (ctx, w, h) => {
  const slip = (y, hh, t, col) => {
    ctx.fillStyle = '#f7f5ec'; ctx.fillRect(2, y, w - 4, hh);
    fitText(ctx, t, w / 2, y + hh * 0.3, w - 8, hh * 0.34, FONTS.sans, col);
    ctx.fillStyle = '#6a6e76'; ctx.fillRect(6, y + hh * 0.62, w - 12, 2); ctx.fillRect(6, y + hh * 0.8, w - 16, 2);
  };
  slip(2, 28, '开锁', '#c8202a'); slip(34, 28, '疏通', '#1f5fb4'); slip(66, 28, '搬家', '#26262c');
});
decal('st_pole_warn', 48, 64, (ctx, w, h) => {
  ctx.fillStyle = '#fbfbf6'; ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#f2c230'; ctx.strokeStyle = '#26262c'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(w / 2, 6); ctx.lineTo(w - 8, 34); ctx.lineTo(8, 34); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#26262c';
  ctx.beginPath(); ctx.moveTo(26, 13); ctx.lineTo(19, 24); ctx.lineTo(24, 24); ctx.lineTo(21, 32); ctx.lineTo(29, 21); ctx.lineTo(24, 21); ctx.closePath(); ctx.fill();
  fitText(ctx, '高压危险', w / 2, 46, w - 6, 12, FONTS.sans, '#c8202a');
  fitText(ctx, '禁止攀登', w / 2, 58, w - 10, 9, FONTS.sans, '#26262c');
});

def('power_pole', {
  name: '电线杆',
  cat: 'street',
  sfx: 'crash',
  fill: 0.03,
  build(m) {
    const con = 0xc9c4b8, steel = 0x5d6268, ins = 0xe8e4dc, brown = 0x8b4a2b;
    const seg = 10, rot = Math.PI / seg, R = y => 0.17 - 0.07 * y / 9, ap = y => R(y) * Math.cos(rot);
    m.cyl(0.1, 0.17, 9.0, speckle(con, 0.06), 0, 4.5, 0, 0, rot, 0, seg);
    m.cyl(R(0.5) + 0.004, R(0.3) + 0.004, 0.2, 0xd8342c, 0, 0.4, 0, 0, rot, 0, seg);
    m.cyl(R(0.9) + 0.004, R(0.7) + 0.004, 0.2, 0xd8342c, 0, 0.8, 0, 0, rot, 0, seg);
    // crossarms with braces
    m.box(1.9, 0.08, 0.08, steel, 0, 8.5, 0);
    m.sym(s => bar(m, [0, 8.05, 0], [s * 0.7, 8.47, 0], 0.035, steel));
    m.box(1.4, 0.07, 0.07, steel, 0, 7.75, 0);
    m.sym(s => bar(m, [0, 7.4, 0], [s * 0.5, 7.72, 0], 0.03, steel));
    const pin = (x, y) => {
      m.cyl(0.015, 0.015, 0.08, steel, x, y + 0.04, 0, 0, 0, 0, 5);
      m.cyl(0.055, 0.04, 0.05, ins, x, y + 0.1, 0, 0, 0, 0, 8);
      m.cyl(0.065, 0.05, 0.04, ins, x, y + 0.145, 0, 0, 0, 0, 8);
      m.cyl(0.03, 0.035, 0.05, ins, x, y + 0.19, 0, 0, 0, 0, 8);
    };
    pin(-0.8, 8.54); pin(0.8, 8.54); pin(0, 9.0);
    for (const x of [-0.6, -0.25, 0.25, 0.6]) {
      m.cyl(0.04, 0.04, 0.05, brown, x, 7.81, 0, 0, 0, 0, 8);
      m.cyl(0.028, 0.028, 0.03, brown, x, 7.85, 0, 0, 0, 0, 8);
      m.cyl(0.04, 0.04, 0.04, brown, x, 7.88, 0, 0, 0, 0, 8);
    }
    // coiled spare cable and a junction box
    m.torus(0.28, 0.02, 0x26262c, R(5.2) + 0.02, 5.2, 0, 0, 90 * D, 0, Math.PI * 2, 3, 14);
    m.torus(0.26, 0.02, 0x26262c, R(5.2) + 0.03, 5.18, 0.02, 0.1, 90 * D, 0, Math.PI * 2, 3, 14);
    m.box(0.3, 0.42, 0.14, 0x9aa0a6, 0, 3.3, ap(3.3) + 0.07);
    m.box(0.26, 0.03, 0.16, 0x7d848c, 0, 3.53, ap(3.3) + 0.07);
    // warning sign and 小广告 on the front facet
    m.box(0.22, 0.28, 0.012, 0xfbfbf6, 0, 2.3, ap(2.3) + 0.006);
    m.decal(0.21, 0.27, 'st_pole_warn', 0, 2.3, ap(2.3) + 0.013);
    m.decal(0.09, 0.26, 'st_pole_ads', 0, 1.55, ap(1.55) + 0.002);
  },
});

// ================================================================================================
// 广告牌 · 花坛 · 邮筒 · 充电桩 · 春联门
// ================================================================================================
function outlined(ctx, text, cx, cy, maxW, maxH, font, fill, stroke, lw) {
  let px = maxH;
  ctx.font = `bold ${px}px ${font}`;
  const tw = ctx.measureText(text).width;
  if (tw > maxW) px = Math.floor(px * maxW / tw);
  ctx.font = `bold ${px}px ${font}`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round'; ctx.lineWidth = lw; ctx.strokeStyle = stroke;
  ctx.strokeText(text, cx, cy);
  ctx.fillStyle = fill; ctx.fillText(text, cx, cy);
}
decal('st_billboard', 512, 256, (ctx, w, h) => {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#6cc3f0'); g.addColorStop(1, '#fff2b0');
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  const bx = 128, by = 136;
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  for (let i = 0; i < 12; i++) {
    const a = i * Math.PI / 6;
    ctx.beginPath(); ctx.moveTo(bx, by);
    ctx.lineTo(bx + Math.cos(a - 0.12) * 400, by + Math.sin(a - 0.12) * 400);
    ctx.lineTo(bx + Math.cos(a + 0.12) * 400, by + Math.sin(a + 0.12) * 400); ctx.fill();
  }
  // stuff stuck to the ball
  const stick = (a, len, wd, col) => {
    ctx.save(); ctx.translate(bx, by); ctx.rotate(a);
    ctx.fillStyle = col; ctx.fillRect(70, -wd / 2, len, wd); ctx.restore();
  };
  stick(-2.4, 60, 12, '#f2c230'); stick(-1.2, 52, 10, '#2f63c9'); stick(-0.2, 58, 14, '#3f9a4a'); stick(2.6, 48, 12, '#8b5a3c');
  ctx.fillStyle = '#f26a21';
  ctx.beginPath(); ctx.moveTo(bx - 20, by - 88); ctx.lineTo(bx - 4, by - 132); ctx.lineTo(bx + 12, by - 88); ctx.fill();
  ctx.fillStyle = '#f7f1e3'; ctx.beginPath(); ctx.arc(bx + 84, by + 40, 22, Math.PI, 0); ctx.fill();
  ctx.fillStyle = '#f2a14a'; ctx.beginPath(); ctx.arc(bx - 86, by + 30, 20, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.moveTo(bx - 100, by + 16); ctx.lineTo(bx - 96, by); ctx.lineTo(bx - 86, by + 12); ctx.fill();
  ctx.beginPath(); ctx.moveTo(bx - 72, by + 16); ctx.lineTo(bx - 76, by); ctx.lineTo(bx - 86, by + 12); ctx.fill();
  // the ball with a happy face
  const bg = ctx.createRadialGradient(bx - 30, by - 30, 10, bx, by, 88);
  bg.addColorStop(0, '#ffb3c8'); bg.addColorStop(1, '#e8557a');
  ctx.fillStyle = bg; ctx.beginPath(); ctx.arc(bx, by, 84, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#2a1d17';
  ctx.beginPath(); ctx.arc(bx - 26, by - 12, 8, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(bx + 26, by - 12, 8, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.beginPath(); ctx.arc(bx - 23, by - 15, 3, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(bx + 29, by - 15, 3, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#ff8aa0';
  ctx.beginPath(); ctx.arc(bx - 46, by + 10, 10, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(bx + 46, by + 10, 10, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#8a1f2a';
  ctx.beginPath(); ctx.arc(bx, by + 8, 20, 0.1, Math.PI - 0.1); ctx.fill();
  // headline
  outlined(ctx, '万物皆可滚', 370, 88, 260, 78, FONTS.brush, '#e8302a', '#ffffff', 10);
  outlined(ctx, '今天你滚了吗？', 370, 160, 240, 34, FONTS.round, '#1f5fb4', '#ffffff', 6);
  ctx.fillStyle = '#e8302a'; rrect(ctx, 276, 196, 190, 36, 18); ctx.fill();
  fitText(ctx, '女娲补天 · 全民开滚', 371, 214, 170, 22, FONTS.sans, '#ffffff');
});

def('billboard', {
  name: '广告牌',
  cat: 'street',
  sfx: 'crash',
  fill: 0.12,
  build(m) {
    const steel = 0x8a939c, dark = 0x4d555d, frame = 0x5d666e;
    m.box(1.4, 0.4, 1.4, speckle(0xc2bcae, 0.06), 0, 0.2, 0);
    m.cyl(0.3, 0.38, 6.2, steel, 0, 3.5, 0, 0, 0, 0, 10);
    m.box(2.4, 0.36, 0.5, dark, 0, 6.5, 0);
    m.box(6.8, 3.3, 0.36, frame, 0, 8.3, 0);
    m.glow(0.35);
    m.decal(6.6, 3.1, 'st_billboard', 0, 8.3, 0.182);
    m.decal(6.6, 3.1, 'st_billboard', 0, 8.3, -0.182, 0, Math.PI, 0);
    m.glow(0);
    // catwalk + railing
    m.box(6.8, 0.05, 0.6, 0x9aa3ab, 0, 6.62, 0.45);
    m.box(6.8, 0.03, 0.03, steel, 0, 7.1, 0.74);
    for (let i = 0; i <= 6; i++) m.box(0.03, 0.48, 0.03, steel, -3.3 + i * 1.1, 6.86, 0.74);
    // spotlights on the top edge
    for (const x of [-2.2, 0, 2.2]) {
      bar(m, [x, 9.9, 0.1], [x, 10.0, 0.75], 0.04, dark);
      m.glow(1);
      m.box(0.3, 0.1, 0.2, 0xfff2c6, x, 9.96, 0.82, -0.6, 0, 0);
      m.glow(0);
    }
  },
});

decal('st_grass_sign', 96, 60, (ctx, w, h) => {
  ctx.fillStyle = '#3f8f4a'; rrect(ctx, 0, 0, w, h, 8); ctx.fill();
  ctx.strokeStyle = '#f4f2ec'; ctx.lineWidth = 2; rrect(ctx, 4, 4, w - 8, h - 8, 6); ctx.stroke();
  fitText(ctx, '小草微微笑', w / 2, h * 0.36, w - 14, h * 0.28, FONTS.round, '#ffffff');
  fitText(ctx, '请您绕一绕', w / 2, h * 0.68, w - 14, h * 0.28, FONTS.round, '#fff3b0');
});

def('flower_bed', {
  name: '圆形花坛',
  cat: 'street',
  sfx: 'rumble',
  fill: 0.6,
  build(m) {
    const wall = 0xcfc6b5, cap = 0xe8e2d4, soil = 0x6b4a33, leaf = 0x3f8f4a;
    m.lathe([[1.25, 0], [1.25, 0.39]], speckle(wall, 0.08), 0, 0, 0, 0, 0, 0, 18);
    m.lathe([[1.29, 0.38], [1.29, 0.46], [1.1, 0.46], [1.1, 0.38], [1.29, 0.38]], cap, 0, 0, 0, 0, 0, 0, 18);
    m.lathe([[1.14, 0.39], [1.14, 0.3]], wall, 0, 0, 0, 0, 0, 0, 18);
    m.disc(1.14, soil, 0, 0.32, 0, 0, 0, 0, 18);
    // outer hedge ring with red salvia spikes (一串红)
    m.torus(0.9, 0.13, speckle(leaf, 0.25), 0, 0.4, 0, 90 * D, 0, 0, Math.PI * 2, 4, 18);
    for (let i = 0; i < 18; i++) {
      const a = i * Math.PI / 9 + 0.1, r = 0.9 + (i % 2 ? 0.05 : -0.05);
      m.cone(0.045, 0.2, i % 3 ? 0xe0303a : 0xc82032, Math.cos(a) * r, 0.6, Math.sin(a) * r, 0, 0, 0, 4);
    }
    // middle ring of marigolds
    m.torus(0.52, 0.1, speckle(0x5cae4f, 0.25), 0, 0.42, 0, 90 * D, 0, 0, Math.PI * 2, 4, 12);
    for (let i = 0; i < 10; i++) {
      const a = i * Math.PI / 5;
      ball(m, 0.075, i % 2 ? 0xf2a14a : 0xf7c83a, Math.cos(a) * 0.52, 0.53, Math.sin(a) * 0.52);
    }
    // trimmed shrub ball with pink blossoms
    m.sphere(0.32, speckle(0x3f8f4a, 0.2), 0, 0.6, 0, 1, 0.9, 1, 0, 0, 0, 8);
    for (let i = 0; i < 6; i++) {
      const a = i * Math.PI / 3 + 0.4;
      ball(m, 0.05, 0xf29ab8, Math.cos(a) * 0.24, 0.72 + (i % 2) * 0.08, Math.sin(a) * 0.24);
    }
    // cute little lawn sign
    m.box(0.03, 0.42, 0.03, 0x8b5a3c, 0.35, 0.5, 0.98);
    m.box(0.34, 0.22, 0.02, 0x3f8f4a, 0.35, 0.72, 0.99);
    m.decal(0.33, 0.21, 'st_grass_sign', 0.35, 0.72, 1.002);
  },
});

decal('st_mail_text', 40, 96, (ctx, w, h) => {
  verticalText(ctx, '邮筒', w / 2, h * 0.5, w - 6, h * 0.86, FONTS.brush, '#f2c230');
});
decal('st_mail_plate', 96, 44, (ctx, w, h) => {
  ctx.fillStyle = '#f7f5ec'; ctx.fillRect(0, 0, w, h);
  fitText(ctx, '开箱时间', w / 2, h * 0.3, w - 14, h * 0.32, FONTS.sans, '#1f5a36');
  fitText(ctx, '10:00  15:00', w / 2, h * 0.72, w - 12, h * 0.34, FONTS.sans, '#26262c');
});

def('mailbox', {
  name: '邮筒',
  cat: 'street',
  sfx: 'metal',
  fill: 0.7,
  build(m) {
    const g = 0x1f7a45, gd = 0x16603a, dark = 0x1a211d;
    const seg = 10, rot = Math.PI / seg, R = 0.24, ap = R * Math.cos(rot);
    m.cyl(0.28, 0.3, 0.1, gd, 0, 0.05, 0, 0, rot, 0, seg);
    m.cyl(R, R, 0.95, g, 0, 0.575, 0, 0, rot, 0, seg);
    m.cyl(R + 0.015, R + 0.015, 0.04, gd, 0, 1.05, 0, 0, rot, 0, seg);
    m.dome(R + 0.01, g, 0, 1.07, 0, 1, 0.85, 1, 0, rot, 0, seg);
    ball(m, 0.035, gd, 0, 1.29, 0);
    m.box(0.13, 0.03, 0.02, dark, 0, 0.93, ap + 0.005);
    m.box(0.15, 0.025, 0.05, gd, 0, 0.96, ap + 0.018, -0.3, 0, 0);
    m.decal(0.12, 0.29, 'st_mail_text', 0, 0.7, ap + 0.002);
    m.decal(0.13, 0.06, 'st_mail_plate', 0, 0.46, ap + 0.002);
    m.box(0.02, 0.1, 0.03, gd, 0.07, 0.5, -ap - 0.01);
  },
});

decal('st_charge_screen', 64, 48, (ctx, w, h) => {
  ctx.fillStyle = '#123a6a'; ctx.fillRect(0, 0, w, h);
  fitText(ctx, '充电中', w / 2, 11, w - 14, 11, FONTS.sans, '#dbe9ff');
  ctx.strokeStyle = '#7fe0a0'; ctx.lineWidth = 2; ctx.strokeRect(12, 22, 36, 16); ctx.fillStyle = '#7fe0a0';
  ctx.fillRect(48, 27, 3, 6); ctx.fillRect(15, 25, 22, 10);
  fitText(ctx, '78%', w / 2, h - 5, 30, 8, FONTS.sans, '#ffffff');
});
decal('st_charge_label', 64, 80, (ctx, w, h) => {
  ctx.fillStyle = '#2fb36a';
  ctx.beginPath(); ctx.moveTo(36, 4); ctx.lineTo(18, 36); ctx.lineTo(30, 36); ctx.lineTo(24, 58); ctx.lineTo(46, 24); ctx.lineTo(33, 24); ctx.closePath(); ctx.fill();
  fitText(ctx, '充电桩', w / 2, 68, w - 8, 15, FONTS.sans, '#1f7a45');
});

def('charging_pile', {
  name: '充电桩',
  cat: 'street',
  sfx: 'metal',
  fill: 0.6,
  build(m) {
    const white = 0xf2f3f0, green = 0x2fb36a, dark = 0x2b2f33;
    m.box(0.5, 0.14, 0.4, speckle(0xc2bcae, 0.06), 0, 0.07, 0);
    m.rbox(0.38, 1.3, 0.26, 0.04, white, 0, 0.79, 0);
    m.box(0.44, 0.06, 0.32, dark, 0, 1.47, 0.01);
    m.box(0.24, 0.19, 0.01, dark, 0, 1.18, 0.131);
    m.glow(1);
    m.sym(s => m.box(0.02, 1.1, 0.02, green, s * 0.18, 0.8, 0.122));
    m.decal(0.21, 0.155, 'st_charge_screen', 0, 1.18, 0.137);
    m.glow(0);
    m.decal(0.22, 0.28, 'st_charge_label', 0, 0.74, 0.1315);
    m.cyl(0.04, 0.04, 0.012, 0xf2c230, 0.1, 0.99, 0.134, 90 * D, 0, 0, 10);
    m.cyl(0.028, 0.028, 0.03, 0xd8342c, 0.1, 0.99, 0.145, 90 * D, 0, 0, 8);
    // holster, charging gun and coiled cable on the right side
    m.box(0.06, 0.14, 0.1, dark, 0.2, 0.96, 0.02);
    m.box(0.05, 0.17, 0.06, dark, 0.245, 0.9, 0.02, 0, 0, -0.35);
    m.cyl(0.032, 0.032, 0.1, 0x3a3d44, 0.23, 1.02, 0.02, 0, 0, 0, 8);
    m.tube([[0.19, 0.3, 0.05], [0.3, 0.2, 0.09], [0.37, 0.42, 0.1], [0.33, 0.68, 0.08], [0.27, 0.82, 0.03]], 0.018, 0x26262c, 6, false, 16);
  },
});

decal('st_couplet_up', 40, 240, (ctx, w, h) => {
  ctx.fillStyle = '#d02a24'; ctx.fillRect(0, 0, w, h);
  verticalText(ctx, '财源滚滚随春到', w / 2, h / 2, w - 8, h - 14, FONTS.brush, '#1c1510');
});
decal('st_couplet_down', 40, 240, (ctx, w, h) => {
  ctx.fillStyle = '#d02a24'; ctx.fillRect(0, 0, w, h);
  verticalText(ctx, '喜气洋洋伴福来', w / 2, h / 2, w - 8, h - 14, FONTS.brush, '#1c1510');
});
decal('st_hengpi', 192, 44, (ctx, w, h) => {
  ctx.fillStyle = '#d02a24'; ctx.fillRect(0, 0, w, h);
  fitText(ctx, '万事如意', w / 2, h / 2, w - 20, h - 8, FONTS.brush, '#1c1510');
});
decal('st_fu', 96, 96, (ctx, w, h) => {
  ctx.save(); ctx.translate(w / 2, h / 2); ctx.rotate(Math.PI / 4);
  ctx.fillStyle = '#d8342c'; ctx.fillRect(-33, -33, 66, 66);
  ctx.strokeStyle = '#f2c14e'; ctx.lineWidth = 2.5; ctx.strokeRect(-29, -29, 58, 58);
  ctx.restore();
  ctx.save(); ctx.translate(w / 2, h / 2); ctx.rotate(Math.PI);
  fitText(ctx, '福', 0, 0, 52, 52, FONTS.brush, '#1c1510');
  ctx.restore();
});
decal('st_mat', 128, 48, (ctx, w, h) => {
  ctx.fillStyle = '#b82a24'; rrect(ctx, 0, 0, w, h, 6); ctx.fill();
  ctx.strokeStyle = '#f2c14e'; ctx.lineWidth = 2; rrect(ctx, 4, 4, w - 8, h - 8, 4); ctx.stroke();
  fitText(ctx, '出入平安', w / 2, h / 2, w - 24, h - 16, FONTS.brush, '#f2c14e');
});
decal('st_door_plate', 64, 28, (ctx, w, h) => {
  ctx.fillStyle = '#1f5fb4'; ctx.fillRect(0, 0, w, h);
  fitText(ctx, '3-101', w / 2, h / 2, w - 10, h - 8, FONTS.sans, '#ffffff');
});

def('couplet_door', {
  name: '春联门',
  cat: 'street',
  sfx: 'wood',
  fill: 0.6,
  build(m) {
    const frameC = 0xd8d1c2, door = 0x9a5b3a, brass = 0xe0b04a, zb = -0.24, zf = zb + 0.14;
    m.box(1.5, 0.12, 0.34, speckle(0xbdb6a8, 0.06), 0, 0.06, zf + 0.17);
    m.sym(s => m.box(0.3, 2.0, 0.14, frameC, s * 0.6, 1.0, zb + 0.07));
    m.box(1.5, 0.26, 0.14, frameC, 0, 2.13, zb + 0.07);
    // door leaf with raised panels, handle and peephole
    m.box(0.9, 1.88, 0.05, door, 0, 1.06, zb + 0.04);
    for (const y of [0.6, 1.5]) m.box(0.68, 0.72, 0.02, shade(door, 1.1), 0, y, zb + 0.07);
    m.decal(0.4, 0.4, 'st_fu', 0, 1.5, zb + 0.082);
    m.box(0.04, 0.16, 0.03, brass, 0.34, 1.0, zb + 0.08);
    m.sphere(0.03, brass, 0.34, 1.0, zb + 0.105, 1, 1, 1, 0, 0, 0, 6);
    m.cyl(0.012, 0.012, 0.02, 0x3a3d44, 0, 1.95, zb + 0.07, 90 * D, 0, 0, 6);
    // 春联: 上联 left, 下联 right, 横批 above (read left to right)
    m.decal(0.2, 1.5, 'st_couplet_up', -0.6, 1.1, zf + 0.002);
    m.decal(0.2, 1.5, 'st_couplet_down', 0.6, 1.1, zf + 0.002);
    m.decal(0.9, 0.2, 'st_hengpi', 0, 2.13, zf + 0.002);
    m.decal(0.18, 0.08, 'st_door_plate', 0.6, 2.13, zf + 0.002);
    // doormat on the step
    m.box(0.8, 0.012, 0.28, 0xb82a24, 0, 0.126, zf + 0.16);
    m.decal(0.78, 0.27, 'st_mat', 0, 0.1325, zf + 0.16, -90 * D, 0, 0);
  },
});
