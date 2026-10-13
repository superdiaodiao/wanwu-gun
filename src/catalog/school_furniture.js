// 教室开局 (school_furniture): desks, boards, walls, doors and playground pieces of 幸福小学's
// roofless classrooms, corridor and sports ground. Real sizes in metres, base on y = 0, front faces +Z.
// Decal prefix sf_.
import * as THREE from 'three';
import { def } from './registry.js';
import { D, shade } from '../core/modeler.js';
import { decal, fitText, FONTS } from '../core/atlas.js';

const INK = 0x2a1d17, BLK = 0x26262c, WHT = 0xf4f2ec;
const STEEL = 0xc9cdd2, METAL = 0x8e949b, DARK = 0x3a3d44;
const RED = 0xd8342c, GOLD = 0xf2c14e, SKY = 0x5aa9e6;
const GLASS = 0xb4ccd8, GLASS_HI = 0xe2eef4;
// school palette (matches 教学楼 in buildings.js)
const CREAM = 0xf4f1ea, GREEN = 0x5f9f72, GREEN_D = 0x3f7a52, SKIRT = 0x4a5a50, CAP = 0xd6d2c8;
const TRACK = 0xc4513d, BOARD = 0x2f5a46, WOODL = 0xe2c596, WOOD = 0xb07a4f, CONC = 0xc9c4b8;

// ---- local helpers -----------------------------------------------------------------------------
const _up = new THREE.Vector3(0, 1, 0);
/** cylinder rod from a to b */
function rod(m, r, col, a, b, seg = 6) {
  const v = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const e = new THREE.Euler().setFromQuaternion(new THREE.Quaternion().setFromUnitVectors(_up, v.clone().normalize()), 'XYZ');
  m.cyl(r, r, v.length(), col, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2, e.x, e.y, e.z, seg);
}
/** square tube from a to b */
function bar(m, s, col, a, b) {
  const v = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const e = new THREE.Euler().setFromQuaternion(new THREE.Quaternion().setFromUnitVectors(_up, v.clone().normalize()), 'XYZ');
  m.box(s, v.length(), s, col, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2, e.x, e.y, e.z);
}
/** two diagonal glare strips on a glass pane (both faces) */
function glare(m, cx, cy, w, h, z, t) {
  for (const s of [1, -1]) {
    m.box(w * 0.07, h * 0.62, 0.003, GLASS_HI, cx - w * 0.12, cy + h * 0.04, z + s * t, 0, 0, -28 * D);
    m.box(w * 0.03, h * 0.42, 0.003, GLASS_HI, cx + w * 0.08, cy - h * 0.06, z + s * t, 0, 0, -28 * D);
  }
}
/** classroom wall slab: cream upper, green dado band, darker trim line, skirting, grey top cap */
function wallSlab(m, w, x, y0, y1, T) {
  const BAND = 1.2, SK = 0.12, cx = x;
  const seg = (a, b, col, t) => { if (b > a + 1e-4) m.box(w, b - a, t, col, cx, (a + b) / 2, 0); };
  seg(Math.max(y0, 0), Math.min(y1, SK), SKIRT, T + 0.016);
  seg(Math.max(y0, SK), Math.min(y1, BAND - 0.03), GREEN, T);
  seg(Math.max(y0, BAND - 0.03), Math.min(y1, BAND + 0.01), GREEN_D, T + 0.012);
  seg(Math.max(y0, BAND + 0.01), y1, CREAM, T);
}

// canvas helpers
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
function lcg(seed) {
  let a = seed * 9301 + 49297;
  return () => ((a = (a * 9301 + 49297) % 233280) / 233280);
}
function scribble(ctx, x, y, w, col, seed, lw = 3) {
  const rnd = lcg(seed);
  ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(x, y);
  for (let i = 1; i <= 12; i++) ctx.lineTo(x + (w * i) / 12, y + (rnd() - 0.5) * lw * 3);
  ctx.stroke();
}
/** dusty chalk look: board-coloured specks over everything + faint eraser smears */
function chalkDust(ctx, w, h, bg, seed) {
  const rnd = lcg(seed);
  ctx.fillStyle = 'rgba(255,255,255,0.06)';
  for (let i = 0; i < 6; i++) { ctx.beginPath(); ctx.ellipse(rnd() * w, rnd() * h, 30 + rnd() * 60, 8 + rnd() * 14, rnd() - 0.5, 0, Math.PI * 2); ctx.fill(); }
  ctx.fillStyle = bg;
  for (let i = 0; i < w * h / 90; i++) ctx.fillRect(rnd() * w, rnd() * h, 1.3, 1.3);
}
function qrCode(ctx, x, y, s, seed = 7) {
  const n = 13, c = s / n, rnd = lcg(seed);
  ctx.fillStyle = '#fbfbf8'; ctx.fillRect(x - c, y - c, s + 2 * c, s + 2 * c);
  ctx.fillStyle = '#1d1d22';
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) if (rnd() < 0.45) ctx.fillRect(x + i * c, y + j * c, c + 0.3, c + 0.3);
  for (const [fx, fy] of [[0, 0], [n - 4, 0], [0, n - 4]]) {
    ctx.fillStyle = '#1d1d22'; ctx.fillRect(x + fx * c, y + fy * c, 4 * c, 4 * c);
    ctx.fillStyle = '#fbfbf8'; ctx.fillRect(x + (fx + 1) * c, y + (fy + 1) * c, 2 * c, 2 * c);
  }
}
function sun(ctx, cx, cy, r, col, face = '#c0502a') {
  ctx.strokeStyle = col; ctx.lineWidth = 3; ctx.lineCap = 'round';
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * r * 1.2, cy + Math.sin(a) * r * 1.2); ctx.lineTo(cx + Math.cos(a) * r * 1.6, cy + Math.sin(a) * r * 1.6); ctx.stroke();
  }
  ctx.fillStyle = col; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = face;
  ctx.beginPath(); ctx.arc(cx - r * 0.35, cy - r * 0.15, r * 0.12, 0, Math.PI * 2); ctx.arc(cx + r * 0.35, cy - r * 0.15, r * 0.12, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = face; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(cx, cy + r * 0.05, r * 0.45, 0.2 * Math.PI, 0.8 * Math.PI); ctx.stroke();
}
function flower(ctx, cx, cy, r, petal, mid = '#f2c14e', stem = '#7fcf6a') {
  ctx.strokeStyle = stem; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(cx, cy + r); ctx.lineTo(cx, cy + r * 3.2); ctx.stroke();
  ctx.fillStyle = stem; ctx.beginPath(); ctx.ellipse(cx + r * 0.7, cy + r * 2.3, r * 0.7, r * 0.3, -0.5, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = petal;
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    ctx.beginPath(); ctx.arc(cx + Math.cos(a) * r * 0.8, cy + Math.sin(a) * r * 0.8, r * 0.6, 0, Math.PI * 2); ctx.fill();
  }
  ctx.fillStyle = mid; ctx.beginPath(); ctx.arc(cx, cy, r * 0.5, 0, Math.PI * 2); ctx.fill();
}
function star(ctx, cx, cy, r, col) {
  ctx.fillStyle = col; ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5, rr = i % 2 ? r * 0.45 : r;
    ctx.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
  }
  ctx.closePath(); ctx.fill();
}

// ================================================================================================
// decals
// ================================================================================================
decal('sf_zao', 32, 32, (ctx, w, h) => {
  // 早, scratched into the desk with a compass point
  fitText(ctx, '早', w / 2, h / 2 + 1, w - 2, h - 2, FONTS.brush, '#6a3a1c');
});

decalS('sf_bb', 512, 166, 0.8, (ctx, w, h) => {
  const bg = '#2f5a46';
  ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);
  const C = '#eef2ea', Y = '#f6e27a', R = '#f49a8a', B = '#9fd4f4';
  // left: countdown
  fitText(ctx, '距离期末考试', 118, 40, 210, 44, FONTS.brush, C);
  fitText(ctx, '还有', 58, 110, 70, 44, FONTS.brush, C);
  fitText(ctx, '3', 128, 106, 60, 84, FONTS.round, Y);
  ctx.strokeStyle = R; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.ellipse(128, 106, 34, 40, 0.1, 0, Math.PI * 2); ctx.stroke();
  fitText(ctx, '天', 196, 110, 50, 44, FONTS.brush, C);
  fitText(ctx, '!!!', 232, 108, 24, 40, FONTS.round, R);
  ctx.fillStyle = 'rgba(238,242,234,0.7)'; ctx.fillRect(254, 14, 2, h - 28);
  // right: maths
  fitText(ctx, '3x + 5 = 20', 330, 30, 130, 28, FONTS.round, C);
  fitText(ctx, 'x = 5', 316, 60, 70, 26, FONTS.round, Y);
  fitText(ctx, '1/2 + 1/3 = 5/6', 344, 92, 160, 26, FONTS.round, C);
  fitText(ctx, '✓', 438, 92, 24, 26, FONTS.sans, R);
  // triangle with height
  ctx.strokeStyle = B; ctx.lineWidth = 2.5; ctx.lineJoin = 'round';
  ctx.beginPath(); ctx.moveTo(420, 66); ctx.lineTo(500, 66); ctx.lineTo(452, 14); ctx.closePath(); ctx.stroke();
  ctx.setLineDash([4, 4]); ctx.beginPath(); ctx.moveTo(452, 14); ctx.lineTo(452, 66); ctx.stroke(); ctx.setLineDash([]);
  fitText(ctx, 'S = ah ÷ 2', 456, 80, 80, 14, FONTS.round, B);
  fitText(ctx, '值日: 小明 小红', 444, 148, 120, 18, FONTS.round, C);
  fitText(ctx, '作业: P.38', 314, 146, 100, 22, FONTS.round, Y);
  chalkDust(ctx, w, h, bg, 3);
});

decalS('sf_news', 384, 192, 0.85, (ctx, w, h) => {
  const bg = '#2b4f40';
  ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);
  // dashed rainbow border
  const cs = ['#f49a8a', '#f6e27a', '#9fe0a8', '#9fd4f4', '#d4b0f4'];
  for (let i = 0; i < 48; i++) {
    const t = i / 48, c = cs[i % 5];
    ctx.fillStyle = c;
    const p = t * 2 * (w + h);
    let x, y;
    if (p < w) { x = p; y = 3; } else if (p < w + h) { x = w - 7; y = p - w; } else if (p < 2 * w + h) { x = 2 * w + h - p; y = h - 7; } else { x = 3; y = 2 * (w + h) - p; }
    ctx.fillRect(x, y, 6, 6);
  }
  sun(ctx, 42, 40, 18, '#f6c84a');
  // title 学习园地, each character in its own bubble
  const T = '学习园地', tc = ['#f49a8a', '#f6e27a', '#9fe0a8', '#9fd4f4'];
  for (let i = 0; i < 4; i++) {
    const cx = 128 + i * 46, cy = 36 + (i % 2) * 6;
    ctx.strokeStyle = tc[i]; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(cx, cy, 20, 0, Math.PI * 2); ctx.stroke();
    fitText(ctx, T[i], cx, cy, 30, 30, FONTS.round, tc[i]);
  }
  // text boxes
  const boxes = [
    [18, 76, 112, 92, '#9fd4f4', '好词好句'],
    [140, 72, 112, 70, '#f6e27a', '本周之星'],
    [262, 76, 104, 92, '#f49a8a', '安全小知识'],
  ];
  boxes.forEach(([x, y, bw, bh, c, t], k) => {
    ctx.strokeStyle = c; ctx.lineWidth = 2.5; rrect(ctx, x, y, bw, bh, 8); ctx.stroke();
    fitText(ctx, t, x + bw / 2, y + 13, bw - 16, 16, FONTS.round, c);
    for (let i = 0; i < 4 && 30 + i * 15 < bh; i++) scribble(ctx, x + 10, y + 34 + i * 15, bw - 20 - (i % 2) * 18, '#e8ece6', 5 + k * 4 + i, 1.8);
  });
  star(ctx, 196, 120, 14, '#f6e27a');
  fitText(ctx, '天天向上', 196, 156, 90, 18, FONTS.brush, '#9fe0a8');
  flower(ctx, 352, 30, 9, '#f49a8a');
  flower(ctx, 326, 42, 7, '#d4b0f4');
  flower(ctx, 290, 34, 8, '#9fd4f4');
  chalkDust(ctx, w, h, bg, 9);
});

decalS('sf_honor', 384, 168, 0.75, (ctx, w, h) => {
  ctx.fillStyle = '#fbf6ea'; ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#d8342c'; ctx.fillRect(0, 0, w, 34);
  fitText(ctx, '光荣榜', w / 2, 18, 140, 28, FONTS.brush, '#f6d24a');
  for (const x of [70, w - 70]) star(ctx, x, 17, 10, '#f6d24a');
  const hair = ['#2a1d17', '#4a2e1e', '#2a1d17', '#5a3a26'];
  const bgc = ['#cfe6f6', '#f6dfe6', '#dff2d6', '#f6ecc8'];
  const rows = [['三好学生', 42], ['进步之星', 106]];
  rows.forEach(([title, y], r) => {
    ctx.fillStyle = '#d8342c'; rrect(ctx, 8, y, 70, 22, 6); ctx.fill();
    fitText(ctx, title, 43, y + 11, 62, 16, FONTS.sans, '#ffffff');
    for (let i = 0; i < 7; i++) {
      const x = 90 + i * 41, k = (i + r * 3) % 4;
      ctx.fillStyle = bgc[k]; ctx.fillRect(x, y - 2, 32, 40);
      ctx.strokeStyle = '#c9b58f'; ctx.lineWidth = 1.5; ctx.strokeRect(x, y - 2, 32, 40);
      // chibi portrait
      ctx.fillStyle = '#d8342c'; ctx.fillRect(x + 6, y + 30, 20, 8);
      ctx.fillStyle = '#f6d8bc'; ctx.beginPath(); ctx.arc(x + 16, y + 18, 10, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = hair[k]; ctx.beginPath(); ctx.arc(x + 16, y + 15, 10.5, Math.PI, 0); ctx.fill();
      if (k % 2) { ctx.fillRect(x + 5, y + 14, 4, 12); ctx.fillRect(x + 23, y + 14, 4, 12); }
      ctx.fillStyle = '#2a1d17'; ctx.fillRect(x + 11, y + 18, 2.5, 3); ctx.fillRect(x + 19, y + 18, 2.5, 3);
      ctx.fillStyle = '#f29aa6'; ctx.fillRect(x + 8, y + 22, 4, 2); ctx.fillRect(x + 21, y + 22, 4, 2);
      ctx.fillStyle = '#5a6068'; ctx.fillRect(x + 6, y + 42, 20, 3);
    }
    // little red flower for the row
    flower(ctx, w - 18, y + 8, 6, '#e8554a', '#f6d24a', '#5cae4f');
  });
});

decal('sf_stk_star', 32, 32, (ctx, w, h) => { star(ctx, w / 2, h / 2 + 1, 14, '#f2c14e'); });
decal('sf_stk_smile', 32, 32, (ctx, w, h) => {
  ctx.fillStyle = '#f6d24a'; ctx.beginPath(); ctx.arc(16, 16, 14, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#2a1d17'; ctx.fillRect(10, 11, 3, 4); ctx.fillRect(19, 11, 3, 4);
  ctx.strokeStyle = '#2a1d17'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(16, 16, 7, 0.2 * Math.PI, 0.8 * Math.PI); ctx.stroke();
});
decal('sf_stk_100', 40, 32, (ctx, w, h) => {
  ctx.fillStyle = '#fbfbf7'; rrect(ctx, 1, 2, w - 2, h - 4, 6); ctx.fill();
  fitText(ctx, '100', w / 2, h / 2, w - 8, h - 10, FONTS.round, '#d8342c');
  ctx.strokeStyle = '#d8342c'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(6, h - 8); ctx.lineTo(w - 6, h - 6); ctx.stroke();
});
decal('sf_stk_snack', 48, 32, (ctx, w, h) => {
  ctx.fillStyle = '#f4a3b8'; rrect(ctx, 1, 1, w - 2, h - 2, 5); ctx.fill();
  fitText(ctx, '零食', w / 2, 11, w - 8, 13, FONTS.round, '#2a2d33');
  fitText(ctx, '勿动!', w / 2, 23, w - 10, 11, FONTS.round, '#d8342c');
});

decal('sf_duty', 48, 24, (ctx, w, h) => {
  ctx.fillStyle = '#d8342c'; rrect(ctx, 1, 1, w - 2, h - 2, 4); ctx.fill();
  fitText(ctx, '值日', w / 2, h / 2, w - 10, h - 6, FONTS.sans, '#ffffff');
});
decal('sf_plate', 128, 44, (ctx, w, h) => {
  ctx.fillStyle = '#2c5a9a'; ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = '#e8eefc'; ctx.lineWidth = 2; ctx.strokeRect(4, 4, w - 8, h - 8);
  fitText(ctx, '三年二班', w / 2, h / 2, w - 20, h - 14, FONTS.sans, '#ffffff');
});
decal('sf_register', 48, 64, (ctx, w, h) => {
  ctx.fillStyle = '#2c5a9a'; ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#f4f2ec'; ctx.fillRect(8, 10, w - 16, 26);
  fitText(ctx, '点名册', w / 2, 23, w - 20, 18, FONTS.sans, '#2a2d33');
  ctx.fillStyle = '#d8342c'; ctx.fillRect(0, h - 10, w, 4);
});
decal('sf_chalk', 48, 20, (ctx, w, h) => {
  ctx.fillStyle = '#f4f2ec'; ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#2f7fd8'; ctx.fillRect(0, h - 5, w, 5);
  fitText(ctx, '无尘粉笔', w / 2, h / 2 - 2, w - 6, h - 9, FONTS.sans, '#2f7fd8');
});

decal('sf_shop_sign', 256, 72, (ctx, w, h) => {
  ctx.fillStyle = '#d8342c'; ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = '#f6d24a'; ctx.lineWidth = 3; ctx.strokeRect(5, 5, w - 10, h - 10);
  fitText(ctx, '小卖部', w / 2, h / 2 + 2, w * 0.66, h - 18, FONTS.brush, '#fff4c8');
  star(ctx, 26, h / 2, 10, '#f6d24a');
  star(ctx, w - 26, h / 2, 10, '#f6d24a');
});
decalS('sf_shelf', 192, 128, 0.75, (ctx, w, h) => {
  ctx.fillStyle = '#e8e2d2'; ctx.fillRect(0, 0, w, h);
  const cols = ['#d8342c', '#2f7fd8', '#f2c14e', '#3fae5a', '#f07a2a', '#e86a9a', '#8a4fc8'];
  const rh = h / 3;
  for (let r = 0; r < 3; r++) {
    const y0 = r * rh;
    for (let i = 0; i < 8; i++) {
      const cx = 12 + i * 24, c = cols[(r * 3 + i * 5) % cols.length];
      ctx.fillStyle = c;
      if (r === 0) { rrect(ctx, cx - 6, y0 + 10, 12, rh - 16, 3); ctx.fill(); ctx.fillRect(cx - 2, y0 + 5, 4, 6); }
      else if (r === 1) { ctx.beginPath(); ctx.moveTo(cx - 10, y0 + 7); ctx.lineTo(cx + 10, y0 + 6); ctx.lineTo(cx + 11, y0 + rh - 6); ctx.lineTo(cx - 11, y0 + rh - 5); ctx.closePath(); ctx.fill(); }
      else { ctx.fillRect(cx - 9, y0 + 10, 18, rh - 16); }
      ctx.fillStyle = '#ffffff'; ctx.fillRect(cx - 5, y0 + rh * 0.45, 10, 4);
    }
    ctx.fillStyle = '#b07a4f'; ctx.fillRect(0, y0 + rh - 3, w, 3);
  }
});
decal('sf_qr', 32, 40, (ctx, w, h) => {
  ctx.fillStyle = '#3fae5a'; ctx.fillRect(0, 0, w, h);
  qrCode(ctx, 6, 6, 20, 4);
  fitText(ctx, '扫码', w / 2, 34, w - 6, 9, FONTS.sans, '#ffffff');
});
decal('sf_freezer', 96, 24, (ctx, w, h) => {
  ctx.fillStyle = '#2f7fd8'; ctx.fillRect(0, 0, w, h);
  fitText(ctx, '冰淇淋 ❄', w / 2, h / 2, w - 12, h - 6, FONTS.round, '#ffffff');
});
decal('sf_spicy', 32, 20, (ctx, w, h) => {
  ctx.fillStyle = '#d8342c'; ctx.fillRect(0, 0, w, h);
  fitText(ctx, '辣条', w / 2, h / 2, w - 4, h - 4, FONTS.sans, '#f6e27a');
});

decal('sf_bus_front', 128, 40, (ctx, w, h) => {
  ctx.fillStyle = '#f4f2ec'; ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = '#d8342c'; ctx.lineWidth = 3; ctx.strokeRect(3, 3, w - 6, h - 6);
  fitText(ctx, '校 车', w / 2, h / 2, w - 24, h - 12, FONTS.sans, '#d8342c');
});
decal('sf_bus_side', 256, 36, (ctx, w, h) => {
  fitText(ctx, '幸福小学 · 校车', w / 2, h / 2, w - 8, h - 6, FONTS.sans, '#26262c');
});
decal('sf_stop', 32, 32, (ctx, w, h) => {
  fitText(ctx, '停', w / 2, h / 2, w - 8, h - 8, FONTS.sans, '#ffffff');
});

decalS('sf_slide', 192, 144, 0.8, (ctx, w, h) => {
  ctx.fillStyle = '#fbfbf7'; ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#2c5a9a'; ctx.fillRect(0, 0, w, 32);
  fitText(ctx, '第三章 · 复习', w / 2, 17, w - 30, 22, FONTS.sans, '#ffffff');
  const K = '#2a2d33';
  ctx.fillStyle = '#f2a14a'; ctx.fillRect(12, 46, 6, 6);
  fitText(ctx, '重点: 全部', 62, 49, 84, 15, FONTS.sans, K);
  ctx.fillStyle = '#f2a14a'; ctx.fillRect(12, 70, 6, 6);
  fitText(ctx, '范围: 这本书', 66, 73, 92, 15, FONTS.sans, K);
  ctx.fillStyle = '#f2a14a'; ctx.fillRect(12, 94, 6, 6);
  scribble(ctx, 24, 97, 84, '#9aa0a6', 4, 3);
  scribble(ctx, 24, 115, 64, '#9aa0a6', 8, 3);
  // little bar chart
  const bars = [22, 36, 30, 58];
  bars.forEach((b, i) => { ctx.fillStyle = i === 3 ? '#d8342c' : '#5aa9e6'; ctx.fillRect(126 + i * 15, 126 - b, 11, b); });
  ctx.fillStyle = K; ctx.fillRect(122, 126, 64, 2);
  fitText(ctx, '1 / 99', w - 20, h - 8, 30, 10, FONTS.sans, '#9aa0a6');
});

// ================================================================================================
// 课桌椅 · 讲台
// ================================================================================================
def('school_desk', {
  name: '课桌椅',
  cat: 'daily',
  sfx: 'crash',
  fill: 0.35,
  tints: [0x4f7fb8, 0x5f9f72, 0x9aa0a6, 0xe0905a, 0x7a8fc8],
  build(m) {
    const top = WOODL, edge = shade(WOODL, 0.82), plate = 0xd8dcd8, cap = 0x2e3136;
    const zd = -0.2, H = 0.75;
    // ---- desk: light wood top with darker edge, open book box towards the student
    m.box(0.6, 0.025, 0.45, top, 0, H - 0.0125, zd);
    m.box(0.6, 0.02, 0.006, edge, 0, H - 0.013, zd + 0.226);
    m.box(0.6, 0.02, 0.006, edge, 0, H - 0.013, zd - 0.226);
    m.box(0.54, 0.012, 0.38, plate, 0, 0.6, zd - 0.01);
    m.box(0.54, 0.13, 0.012, plate, 0, 0.66, zd - 0.2);
    m.sym(s => m.box(0.012, 0.13, 0.38, plate, s * 0.27, 0.66, zd - 0.01));
    m.box(0.2, 0.03, 0.26, 0x5aa9e6, -0.12, 0.622, zd - 0.05); // books inside
    m.box(0.18, 0.025, 0.24, 0xf2c14e, -0.11, 0.649, zd - 0.06, 0, 0.08, 0);
    // tinted steel frame: legs, foot rails, top rails, front stretcher
    m.tint();
    m.sym(s => {
      for (const z of [zd - 0.19, zd + 0.19]) m.box(0.028, H - 0.04, 0.028, 0xffffff, s * 0.285, (H - 0.04) / 2 + 0.01, z);
      m.box(0.026, 0.026, 0.42, 0xffffff, s * 0.285, 0.08, zd);
      m.box(0.026, 0.026, 0.42, 0xffffff, s * 0.285, H - 0.04, zd);
    });
    m.box(0.56, 0.022, 0.022, 0xffffff, 0, 0.12, zd - 0.19);
    m.tint(0);
    m.sym(s => { for (const z of [zd - 0.19, zd + 0.19]) m.box(0.032, 0.012, 0.032, cap, s * 0.285, 0.006, z); });
    // on the top: 早, a textbook and a pencil
    m.decal(0.075, 0.075, 'sf_zao', 0.19, H + 0.0004, zd + 0.13, -90 * D, 0, 0.15);
    m.box(0.17, 0.012, 0.23, 0x3f8f4a, -0.12, H + 0.006, zd - 0.02, 0, 0.12, 0);
    m.box(0.16, 0.01, 0.22, WHT, -0.12, H + 0.006, zd - 0.02, 0, 0.12, 0);
    m.box(0.17, 0.003, 0.23, 0x3f8f4a, -0.12, H + 0.0135, zd - 0.02, 0, 0.12, 0);
    m.cyl(0.004, 0.004, 0.16, GOLD, 0.06, H + 0.004, zd + 0.06, 0, 0.5, 90 * D, 6);
    m.cone(0.004, 0.012, 0xe8c89a, 0.06 + Math.cos(0.5) * 0.086, H + 0.004, zd + 0.06 - Math.sin(0.5) * 0.086, 0, 0.5, -90 * D, 6);
    // ---- chair tucked in, student side (+Z): back at +Z
    const zc = 0.2, SH = 0.42;
    m.box(0.36, 0.022, 0.34, top, 0, SH, zc);
    m.box(0.36, 0.014, 0.005, edge, 0, SH, zc - 0.172);
    m.push(0, 0.66, zc + 0.19, 8 * D, 0, 0);
    m.box(0.36, 0.13, 0.018, top, 0, 0, 0);
    m.box(0.36, 0.01, 0.02, edge, 0, -0.068, 0);
    m.pop();
    m.tint();
    m.sym(s => {
      m.box(0.024, SH - 0.01, 0.024, 0xffffff, s * 0.16, (SH - 0.01) / 2, zc - 0.14);
      bar(m, 0.024, 0xffffff, [s * 0.16, 0, zc + 0.16], [s * 0.16, 0.74, zc + 0.215]);
      m.box(0.022, 0.022, 0.3, 0xffffff, s * 0.16, 0.12, zc + 0.01);
      m.box(0.022, 0.022, 0.32, 0xffffff, s * 0.16, SH - 0.025, zc + 0.01);
    });
    m.box(0.3, 0.02, 0.02, 0xffffff, 0, 0.12, zc - 0.14);
    m.tint(0);
    m.sym(s => {
      m.box(0.028, 0.012, 0.028, cap, s * 0.16, 0.006, zc - 0.14);
      m.box(0.028, 0.012, 0.028, cap, s * 0.16, 0.006, zc + 0.16);
    });
  },
});

def('school_podium', {
  name: '讲台',
  cat: 'daily',
  sfx: 'crash',
  fill: 0.75,
  build(m) {
    const wood = 0xa86e44, light = 0xc89060, dark = 0x4a3426, H = 1.0, zb = 0.0;
    // body: front panel (students' side), sides, top slab
    m.box(1.2, 0.06, 0.58, dark, 0, 0.03, zb);
    m.box(1.2, H - 0.06, 0.58, wood, 0, 0.06 + (H - 0.06) / 2, zb);
    m.box(1.26, 0.05, 0.64, light, 0, H + 0.025, zb);
    // raised panels on the front
    for (const x of [-0.3, 0.3]) {
      m.box(0.48, 0.7, 0.02, light, x, 0.5, 0.29 + 0.01);
      m.box(0.4, 0.62, 0.012, shade(light, 1.06), x, 0.5, 0.29 + 0.024);
    }
    m.box(0.02, 0.86, 0.02, dark, 0, 0.52, 0.3);
    // teacher side (-Z): open cubby with books
    m.box(1.06, 0.36, 0.01, 0x3a2a20, 0, 0.72, -0.295);
    m.box(1.06, 0.02, 0.03, light, 0, 0.53, -0.3);
    [[-0.4, 0x5aa9e6], [-0.34, RED], [-0.28, GOLD], [-0.2, 0x3f8f4a], [0.3, WHT], [0.36, 0x2c3e66]].forEach(([x, c], i) => m.box(0.05, 0.26 - (i % 2) * 0.04, 0.02, c, x, 0.67 - (i % 2) * 0.02, -0.305));
    // on top: register, chalk box, blackboard eraser, enamel mug, triangle ruler
    const yt = H + 0.05;
    m.box(0.21, 0.016, 0.29, 0x2c5a9a, -0.3, yt + 0.008, -0.02, 0, 0.1, 0);
    m.decal(0.15, 0.2, 'sf_register', -0.3, yt + 0.0165, -0.02, -90 * D, 0.1, 0);
    m.box(0.14, 0.06, 0.09, WHT, 0.12, yt + 0.03, 0.05);
    m.decal(0.13, 0.054, 'sf_chalk', 0.12, yt + 0.03, 0.0955);
    const cc = [WHT, WHT, RED, GOLD, SKY, WHT, 0xf08fb0, WHT];
    for (let i = 0; i < 8; i++) m.cyl(0.006, 0.006, 0.03, cc[i], 0.08 + (i % 4) * 0.026, yt + 0.065, 0.03 + Math.floor(i / 4) * 0.035, 0, 0, 0, 5);
    m.box(0.15, 0.035, 0.06, 0x8b5a3c, 0.38, yt + 0.025, -0.08, 0, -0.3, 0);
    m.box(0.15, 0.015, 0.06, 0xd8d2c4, 0.38, yt + 0.0075, -0.08, 0, -0.3, 0);
    m.cyl(0.045, 0.045, 0.1, WHT, 0.3, yt + 0.05, 0.17, 0, 0, 0, 10);
    m.cyl(0.047, 0.047, 0.012, RED, 0.3, yt + 0.096, 0.17, 0, 0, 0, 10);
    m.cyl(0.04, 0.04, 0.004, 0x8a6a3a, 0.3, yt + 0.09, 0.17, 0, 0, 0, 10);
    m.torus(0.026, 0.006, WHT, 0.352, yt + 0.05, 0.17, 0, 0, 0, Math.PI * 2, 4, 8);
    m.push(-0.05, yt + 0.004, -0.18, -90 * D, 0, 0.4);
    m.extrude([[0, 0], [0.32, 0], [0, 0.2]], 0.006, 0xe8c89a, 0, 0, 0);
    m.pop();
  },
});

// ================================================================================================
// 黑板 · 黑板报 · 投影幕
// ================================================================================================
def('school_blackboard', {
  name: '黑板',
  cat: 'daily',
  sfx: 'crash',
  fill: 0.2,
  build(m) {
    const W = 4.0, y0 = 0.9, y1 = 2.2, cy = (y0 + y1) / 2, frame = 0xb8bcc2;
    // board + aluminium frame
    m.box(W, y1 - y0, 0.03, BOARD, 0, cy, 0);
    m.box(W + 0.04, 0.04, 0.05, frame, 0, y1, 0);
    m.box(W + 0.04, 0.03, 0.05, frame, 0, y0, 0);
    m.sym(s => m.box(0.04, y1 - y0 + 0.04, 0.05, frame, s * (W / 2), cy, 0));
    m.decal(W - 0.08, y1 - y0 - 0.06, 'sf_bb', 0, cy, 0.0158);
    m.box(W - 0.04, y1 - y0 - 0.04, 0.006, 0x8e949b, 0, cy, -0.017);
    // stand: posts and feet
    m.sym(s => {
      m.box(0.06, y1 + 0.02, 0.06, METAL, s * (W / 2 + 0.05), (y1 + 0.02) / 2, 0);
      m.box(0.08, 0.05, 0.6, METAL, s * (W / 2 + 0.05), 0.025, 0);
      for (const z of [-0.27, 0.27]) m.box(0.09, 0.012, 0.06, DARK, s * (W / 2 + 0.05), 0.006, z);
    });
    m.box(W, 0.04, 0.03, METAL, 0, 0.3, 0);
    // chalk tray with chalk stubs and an eraser
    m.box(W - 0.2, 0.02, 0.09, frame, 0, y0 - 0.03, 0.05);
    m.box(W - 0.2, 0.03, 0.01, frame, 0, y0 - 0.015, 0.093);
    [[-1.2, WHT], [-1.12, RED], [-0.6, GOLD], [0.5, WHT], [0.58, SKY], [1.4, WHT]].forEach(([x, c], i) => m.cyl(0.006, 0.006, 0.06 - (i % 2) * 0.02, c, x, y0 - 0.014, 0.05, 0, i * 0.4, 90 * D, 5));
    m.box(0.15, 0.04, 0.06, 0x8b5a3c, 1.0, y0, 0.05);
    m.box(0.15, 0.012, 0.06, 0xd8d2c4, 1.0, y0 - 0.026, 0.05);
  },
});

def('school_board_news', {
  name: '黑板报',
  cat: 'daily',
  sfx: 'crash',
  fill: 0.2,
  build(m) {
    const W = 3.0, y0 = 0.5, y1 = 2.0, cy = (y0 + y1) / 2, frame = 0x8b5a3c;
    m.box(W, y1 - y0, 0.03, 0x2b4f40, 0, cy, 0);
    m.box(W + 0.06, 0.05, 0.05, frame, 0, y1, 0);
    m.box(W + 0.06, 0.05, 0.05, frame, 0, y0, 0);
    m.sym(s => m.box(0.05, y1 - y0 + 0.05, 0.05, frame, s * (W / 2 + 0.005), cy, 0));
    m.decal(W - 0.06, y1 - y0 - 0.06, 'sf_news', 0, cy, 0.0158);
    m.box(W - 0.04, y1 - y0 - 0.04, 0.006, 0x9a8a74, 0, cy, -0.017);
    // short legs behind so it stands on its own (normally against the back wall)
    m.sym(s => {
      m.box(0.05, y0 + 0.2, 0.04, frame, s * 1.2, (y0 + 0.2) / 2, -0.035);
      m.box(0.06, 0.03, 0.22, frame, s * 1.2, 0.015, -0.035);
    });
    // a little chalk tray
    m.box(1.0, 0.02, 0.07, frame, 0.6, y0 - 0.02, 0.05);
    m.cyl(0.006, 0.006, 0.05, 0xf49a8a, 0.4, y0 - 0.002, 0.05, 0, 0.3, 90 * D, 5);
    m.cyl(0.006, 0.006, 0.04, 0x9fd4f4, 0.5, y0 - 0.002, 0.05, 0, -0.2, 90 * D, 5);
  },
});

def('school_projector', {
  name: '投影幕',
  cat: 'daily',
  sfx: 'crash',
  fill: 0.2,
  build(m) {
    const W = 1.76, top = 2.12, bot = 0.82, zs = 0.0, zp = -0.05, case_ = 0x3a3d44;
    // tripod: pole + three legs
    m.cyl(0.018, 0.018, 2.2, METAL, 0, 1.1, zp, 0, 0, 0, 6);
    m.cyl(0.03, 0.03, 0.08, DARK, 0, 0.55, zp, 0, 0, 0, 8);
    for (let i = 0; i < 3; i++) {
      const a = Math.PI / 2 + (i * 2 * Math.PI) / 3;
      const x = Math.cos(a) * 0.3, z = zp + Math.sin(a) * 0.3;
      rod(m, 0.012, METAL, [0, 0.55, zp], [x, 0.015, z], 6);
      m.sphere(0.02, DARK, x, 0.012, z, 1, 0.6, 1, 0, 0, 0, 6);
    }
    // case on top with the screen pulled down
    m.cyl(0.05, 0.05, W + 0.08, case_, 0, top + 0.05, zs - 0.01, 0, 0, 90 * D, 8);
    m.sym(s => m.box(0.02, 0.11, 0.11, BLK, s * (W / 2 + 0.05), top + 0.05, zs - 0.01));
    m.box(0.05, 0.12, 0.04, DARK, 0, top + 0.08, zp);
    m.box(W, top - bot, 0.008, 0xeeeeea, 0, (top + bot) / 2, zs);
    m.box(W, 0.06, 0.01, 0x26262c, 0, top - 0.03, zs + 0.002);
    m.cyl(0.015, 0.015, W + 0.02, DARK, 0, bot - 0.01, zs, 0, 0, 90 * D, 6);
    m.box(0.06, 0.03, 0.02, DARK, 0, bot - 0.04, zs);
    m.glow(0.7);
    m.decal(W - 0.12, (W - 0.12) * 0.75, 'sf_slide', 0, (top - 0.06 + bot) / 2, zs + 0.0045);
    m.glow(0);
  },
});

// ================================================================================================
// 储物柜 · 值日工具
// ================================================================================================
def('school_lockers', {
  name: '储物柜',
  cat: 'daily',
  sfx: 'metal',
  fill: 0.85,
  build(m) {
    const body = 0xdfe2de, W = 1.8, H = 1.2, Dp = 0.4, zf = Dp / 2;
    const cols = [0xf4a3b8, 0x9fd4f4, 0xf6e27a, 0x9fe0a8, 0xf2b98a, 0xc9b0f0];
    m.box(W, 0.05, Dp - 0.04, DARK, 0, 0.025, 0);
    m.box(W, H - 0.05, Dp, body, 0, 0.05 + (H - 0.05) / 2, 0);
    m.box(W + 0.02, 0.02, Dp + 0.02, shade(body, 0.9), 0, H - 0.01, 0);
    const stk = { '0,3': 'sf_stk_star', '2,1': 'sf_stk_smile', '3,3': 'sf_stk_100', '5,0': 'sf_stk_snack', '1,0': 'sf_stk_star' };
    const cw = 0.3, rh = 0.285, y0 = 0.06;
    for (let c = 0; c < 6; c++) for (let r = 0; r < 4; r++) {
      const x = (c - 2.5) * cw, y = y0 + rh * (r + 0.5), col = cols[(c + r * 2) % 6];
      if (c === 4 && r === 2) {
        // open locker: dark inside, a ball and books, door swung on its left hinge
        m.box(cw - 0.03, rh - 0.03, 0.006, 0x3a3d44, x, y, zf + 0.001);
        m.sphere(0.09, 0xe8783a, x + 0.04, y - 0.04, zf - 0.12, 1, 1, 1, 0, 0, 0, 8);
        m.box(0.04, 0.2, 0.2, 0x5aa9e6, x - 0.09, y - 0.025, zf - 0.13);
        m.push(x - (cw - 0.03) / 2, y, zf + 0.008, 0, -40 * D, 0);
        m.box(cw - 0.03, rh - 0.03, 0.014, col, (cw - 0.03) / 2, 0, 0);
        m.pop();
        continue;
      }
      m.box(cw - 0.03, rh - 0.03, 0.014, col, x, y, zf + 0.007);
      m.box(0.016, 0.06, 0.02, DARK, x + 0.1, y, zf + 0.018);
      const k = stk[c + ',' + r];
      if (k) m.decal(k === 'sf_stk_snack' ? 0.11 : 0.08, k === 'sf_stk_snack' ? 0.075 : 0.07, k, x - 0.03, y + 0.03, zf + 0.0145, 0, 0, (c % 2 ? 0.15 : -0.12));
    }
  },
});

def('school_cleaning', {
  name: '值日工具',
  cat: 'daily',
  sfx: 'wood',
  fill: 0.3,
  build(m) {
    const handle = 0xd8b07a, apex = [0.0, 1.28, -0.13];
    // broom: plastic bristle fan + handle
    m.push(-0.2, 0.017, -0.02, 0, 0.3, 0.12);
    m.extrude([[-0.13, 0], [0.13, 0], [0.06, 0.26], [-0.06, 0.26]], 0.04, 0x5cae4f, 0, 0, 0);
    m.box(0.13, 0.06, 0.05, RED, 0, 0.27, 0);
    m.pop();
    rod(m, 0.012, handle, [-0.165, 0.29, -0.02], [apex[0] - 0.04, apex[1], apex[2] + 0.01], 6);
    // mop: splayed strands + handle
    const mx = 0.02, mz = -0.12;
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      m.box(0.035, 0.24, 0.012, 0xe6e2d6, mx + Math.cos(a) * 0.05, 0.12, mz + Math.sin(a) * 0.05, Math.sin(a) * 0.35, -a, -Math.cos(a) * 0.35);
    }
    m.cyl(0.04, 0.035, 0.05, 0x2f7fd8, mx, 0.25, mz, 0, 0, 0, 8);
    rod(m, 0.012, handle, [mx, 0.27, mz], [apex[0] + 0.01, apex[1] + 0.02, apex[2] - 0.01], 6);
    // long-handled dustpan
    m.push(0.19, 0, -0.03, 0, -0.35, 0);
    m.box(0.26, 0.012, 0.22, 0x2f7fd8, 0, 0.006, 0.0);
    m.box(0.26, 0.12, 0.012, 0x2f7fd8, 0, 0.06, -0.11);
    m.sym(s => m.box(0.012, 0.1, 0.22, 0x2f7fd8, s * 0.13, 0.05, 0));
    m.box(0.12, 0.03, 0.04, 0x2a5fa8, 0, 0.13, -0.11);
    m.pop();
    rod(m, 0.011, 0x2a5fa8, [0.21, 0.14, -0.08], [apex[0] + 0.04, apex[1] - 0.04, apex[2] + 0.0], 6);
    // red bucket in front with the 值日 sign
    const bx = 0.06, bz = 0.17;
    m.cyl(0.13, 0.105, 0.25, RED, bx, 0.125, bz, 0, 0, 0, 10);
    m.torus(0.13, 0.008, shade(RED, 0.85), bx, 0.25, bz, 90 * D, 0, 0, Math.PI * 2, 4, 12);
    m.cyl(0.12, 0.12, 0.004, 0x6a98b4, bx, 0.2, bz, 0, 0, 0, 10);
    m.torus(0.13, 0.005, METAL, bx, 0.25, bz, 0, 0.3, 0, Math.PI, 4, 8);
    m.decal(0.12, 0.06, 'sf_duty', bx, 0.13, bz + 0.12, -4.7 * D, 0, 0);
  },
});

// ================================================================================================
// 教室墙 · 带窗的墙 · 教室门 · 走廊栏杆
// ================================================================================================
def('school_wall', {
  name: '教室墙',
  cat: 'building',
  sfx: 'rumble',
  fill: 1,
  build(m) {
    const W = 4.0, H = 3.0, T = 0.2;
    wallSlab(m, W, 0, 0, H - 0.04, T);
    m.box(W, 0.04, T + 0.02, CAP, 0, H - 0.02, 0);
  },
});

def('school_window_wall', {
  name: '带窗的墙',
  cat: 'building',
  sfx: 'glass',
  fill: 0.85,
  build(m) {
    const W = 4.0, H = 3.0, T = 0.2, wx = 1.6, wy0 = 1.25, wy1 = 2.65, frame = 0xd8dcd8;
    // wall around the opening
    wallSlab(m, W, 0, 0, wy0, T);
    m.sym(s => m.box(W / 2 - wx, wy1 - wy0, T, CREAM, s * (wx + (W / 2 - wx) / 2), (wy0 + wy1) / 2, 0));
    m.box(W, H - 0.04 - wy1, T, CREAM, 0, (wy1 + H - 0.04) / 2, 0);
    m.box(W, 0.04, T + 0.02, CAP, 0, H - 0.02, 0);
    // sills both sides
    m.box(2 * wx + 0.1, 0.04, T + 0.12, CAP, 0, wy0 + 0.02, 0);
    // outer frame + transom
    m.box(2 * wx, 0.05, 0.08, frame, 0, wy1 - 0.025, 0);
    m.box(2 * wx, 0.04, 0.08, frame, 0, wy0 + 0.06, 0);
    m.sym(s => m.box(0.05, wy1 - wy0, 0.08, frame, s * (wx - 0.025), (wy0 + wy1) / 2, 0));
    const ty = 2.3;
    m.box(2 * wx, 0.05, 0.08, frame, 0, ty, 0);
    // fixed transom panes
    for (let i = 0; i < 4; i++) {
      const cx = -wx + 0.4 + i * 0.8;
      m.box(0.78, wy1 - ty - 0.07, 0.01, GLASS, cx, (ty + wy1) / 2 - 0.01, 0);
      if (i) m.box(0.03, wy1 - ty, 0.06, frame, cx - 0.4, (ty + wy1) / 2, 0);
    }
    // four sliding sashes on two tracks; the second one slid open behind the first
    const sh = ty - wy0 - 0.1, sy = (wy0 + 0.08 + ty - 0.025) / 2, sw = 0.82;
    const sashes = [[-1.2, 0.018], [-0.85, -0.018], [0.4, 0.018], [1.2, -0.018]];
    for (const [cx, z] of sashes) {
      m.box(sw - 0.06, sh - 0.06, 0.008, GLASS, cx, sy, z);
      m.box(sw, 0.035, 0.03, frame, cx, sy + sh / 2 - 0.0175, z);
      m.box(sw, 0.035, 0.03, frame, cx, sy - sh / 2 + 0.0175, z);
      m.sym(s => m.box(0.035, sh, 0.03, frame, cx + s * (sw / 2 - 0.0175), sy, z));
      glare(m, cx, sy, sw * 0.9, sh * 0.85, z, 0.006);
    }
    m.box(0.02, 0.12, 0.012, METAL, -0.85 + sw / 2 - 0.06, sy, -0.04);
  },
});

def('school_door', {
  name: '教室门',
  cat: 'building',
  sfx: 'wood',
  fill: 0.5,
  // the wall either side, the leaf swung in, the header: a small ball rolls through the doorway
  hits: [
    { ox: -0.75, hw: 1.25, hd: 0.11, h: 3.0 },
    { ox: 1.75, hw: 0.25, hd: 0.11, h: 3.0 },
    { ox: 1.46, oz: -0.55, hw: 0.05, hd: 0.45, h: 2.1 },
    { ox: 1.0, hw: 0.5, hd: 0.11, y0: 2.1, h: 0.9 },
  ],
  build(m) {
    const W = 4.0, H = 3.0, T = 0.2, dx0 = 0.5, dx1 = 1.5, DH = 2.1;
    const door = 0xc08a5a, trim = 0x8b5a3c;
    // wall pieces either side of the 1 m doorway + header above
    m.push(-W / 2, 0, 0);
    wallSlab(m, dx0 + W / 2, (dx0 + W / 2) / 2, 0, H - 0.04, T);
    m.pop();
    wallSlab(m, W / 2 - dx1, (dx1 + W / 2) / 2, 0, H - 0.04, T);
    m.box(dx1 - dx0, H - 0.04 - DH, T, CREAM, (dx0 + dx1) / 2, (DH + H - 0.04) / 2, 0);
    m.box(W, 0.04, T + 0.02, CAP, 0, H - 0.02, 0);
    // door frame trim on both faces (jambs + head) and a flat threshold
    for (const z of [1, -1]) {
      m.box(0.06, DH, 0.02, trim, dx0 - 0.03, DH / 2, z * (T / 2 + 0.01));
      m.box(0.06, DH, 0.02, trim, dx1 + 0.03, DH / 2, z * (T / 2 + 0.01));
      m.box(dx1 - dx0 + 0.12, 0.06, 0.02, trim, (dx0 + dx1) / 2, DH + 0.03, z * (T / 2 + 0.01));
    }
    m.sym(s => m.box(0.03, DH, T, trim, s > 0 ? dx1 - 0.015 : dx0 + 0.015, DH / 2, 0));
    m.box(dx1 - dx0 - 0.06, 0.02, T, CONC, (dx0 + dx1) / 2, 0.01, 0);
    // leaf swung ~80° into the classroom (-Z) on its right-hand hinge
    const LW = 0.92, LH = 2.04;
    m.push(dx1 - 0.04, 0, -T / 2 + 0.01, 0, -80 * D, 0);
    m.box(LW, LH, 0.04, door, -LW / 2, LH / 2 + 0.02, -0.02);
    m.box(0.36, 0.42, 0.046, GLASS, -LW / 2, 1.58, -0.02);
    m.box(0.42, 0.05, 0.048, shade(door, 0.85), -LW / 2, 1.34, -0.02);
    m.box(LW - 0.08, 0.2, 0.046, shade(door, 0.88), -LW / 2, 0.14, -0.02);
    for (const z of [0.012, -0.052]) m.box(0.12, 0.025, 0.03, STEEL, -LW + 0.12, 1.0, z);
    m.box(0.03, 0.08, 0.05, METAL, -0.01, 0.4, -0.02); // hinge
    m.box(0.03, 0.08, 0.05, METAL, -0.01, 1.7, -0.02);
    m.pop();
    // projecting class plate above the door, readable along the corridor (+Z side)
    const pz = T / 2 + 0.26;
    m.box(0.03, 0.03, 0.5, METAL, (dx0 + dx1) / 2, 2.6, T / 2 + 0.25);
    m.box(0.03, 0.18, 0.44, 0x2c5a9a, (dx0 + dx1) / 2, 2.48, pz);
    m.decal(0.42, 0.15, 'sf_plate', (dx0 + dx1) / 2 + 0.0155, 2.48, pz, 0, 90 * D, 0);
    m.decal(0.42, 0.15, 'sf_plate', (dx0 + dx1) / 2 - 0.0155, 2.48, pz, 0, -90 * D, 0);
  },
});

def('school_railing', {
  name: '走廊栏杆',
  cat: 'street',
  sfx: 'metal',
  fill: 0.15,
  build(m) {
    const W = 4.0, H = 1.1, kerb = 0.12;
    m.box(W, kerb, 0.2, CONC, 0, kerb / 2, 0);
    m.box(W, 0.02, 0.21, shade(CONC, 0.9), 0, kerb - 0.01, 0);
    // posts every metre, offset so neighbouring segments keep the rhythm
    for (const x of [-1.5, -0.5, 0.5, 1.5]) m.box(0.05, H - kerb, 0.05, GREEN_D, x, kerb + (H - kerb) / 2, 0);
    m.box(W, 0.03, 0.03, GREEN_D, 0, kerb + 0.1, 0);
    m.box(W, 0.03, 0.03, GREEN_D, 0, H - 0.1, 0);
    for (let i = 0; i < 32; i++) {
      const x = -W / 2 + 0.0625 + i * 0.125;
      if (Math.abs(((x + 2) % 1) - 0.5) < 0.03) continue;
      m.box(0.016, H - 0.2 - kerb, 0.016, GREEN, x, kerb + 0.1 + (H - 0.2 - kerb) / 2, 0);
    }
    // stainless handrail
    m.cyl(0.03, 0.03, W, STEEL, 0, H - 0.03, 0, 0, 0, 90 * D, 8);
  },
});

// ================================================================================================
// 宣传栏 · 篮球架 · 乒乓球台
// ================================================================================================
def('school_notice_board', {
  name: '宣传栏',
  cat: 'street',
  sfx: 'glass',
  fill: 0.3,
  build(m) {
    const W = 3.0, y0 = 0.72, y1 = 2.0, frame = 0xb8bcc2, back = 0x3f7a52;
    // legs
    m.sym(s => {
      m.box(0.08, y1, 0.08, back, s * 1.38, y1 / 2, -0.02);
      m.box(0.16, 0.06, 0.3, CONC, s * 1.38, 0.03, -0.02);
    });
    // cabinet with aluminium frame, honour roll behind faked glass
    m.box(W, y1 - y0, 0.16, back, 0, (y0 + y1) / 2, -0.02);
    m.box(W - 0.1, y1 - y0 - 0.1, 0.01, 0xfbf6ea, 0, (y0 + y1) / 2, 0.06);
    m.decal(W - 0.14, (W - 0.14) * 168 / 384, 'sf_honor', 0, (y0 + y1) / 2, 0.0665);
    m.box(W, 0.05, 0.05, frame, 0, y1 - 0.025, 0.07);
    m.box(W, 0.05, 0.05, frame, 0, y0 + 0.025, 0.07);
    m.sym(s => m.box(0.05, y1 - y0, 0.05, frame, s * (W / 2 - 0.025), (y0 + y1) / 2, 0.07));
    m.sym(s => m.box(0.03, 0.6, 0.004, GLASS_HI, s * 0.8 - 0.1, (y0 + y1) / 2, 0.072, 0, 0, -28 * D));
    m.box(0.07, 0.04, 0.03, METAL, 1.38, 1.3, 0.08);
    // little gable roof
    m.prism(0.56, 0.16, W + 0.2, TRACK, 0, y1 + 0.08, -0.02, 0, 90 * D, 0);
    m.box(W + 0.2, 0.03, 0.56, shade(TRACK, 0.8), 0, y1 + 0.015, -0.02);
  },
});

def('school_hoop', {
  name: '篮球架',
  cat: 'street',
  sfx: 'metal',
  fill: 0.15,
  build(m) {
    const blue = 0x2f63c9, pole = 0x2c3e66, zbd = 0.5, rimY = 3.05;
    // weighted base with wheels and a pad
    m.box(1.2, 0.36, 0.8, blue, 0, 0.2, -0.6);
    m.box(1.1, 0.05, 0.7, shade(blue, 0.8), 0, 0.405, -0.6);
    m.sym(s => m.cyl(0.08, 0.08, 0.06, BLK, s * 0.62, 0.08, -0.92, 0, 0, 90 * D, 8));
    m.box(0.5, 0.06, 0.6, blue, 0, 0.03, -0.0);
    // pole and arm
    rod(m, 0.075, pole, [0, 0.4, -0.55], [0, 2.9, -0.35], 8);
    m.cyl(0.11, 0.11, 0.8, 0xf2a14a, 0, 0.85, -0.514, 0.08, 0, 0, 8); // safety pad
    bar(m, 0.08, pole, [0, 2.85, -0.36], [0, 3.15, zbd - 0.05]);
    bar(m, 0.06, pole, [0, 2.4, -0.39], [0, 2.95, zbd - 0.05]);
    // backboard
    const bh = 0.75, by = 2.92 + bh / 2;
    m.box(1.2, bh, 0.04, WHT, 0, by, zbd);
    const red = 0xe8554a, f = 0.03, zf = zbd + 0.021;
    m.box(1.2, f, 0.004, red, 0, by + bh / 2 - f / 2, zf);
    m.box(1.2, f, 0.004, red, 0, by - bh / 2 + f / 2, zf);
    m.sym(s => m.box(f, bh, 0.004, red, s * (0.6 - f / 2), by, zf));
    m.box(0.5, 0.025, 0.004, red, 0, rimY + 0.33, zf);
    m.box(0.5, 0.025, 0.004, red, 0, rimY + 0.03, zf);
    m.sym(s => m.box(0.025, 0.3, 0.004, red, s * 0.2375, rimY + 0.18, zf));
    // rim, bracket and net
    const rz = zbd + 0.02 + 0.15 + 0.225;
    m.box(0.2, 0.03, 0.17, 0xe8783a, 0, rimY, zbd + 0.1);
    m.torus(0.225, 0.012, 0xe8783a, 0, rimY, rz, 90 * D, 0, 0, Math.PI * 2, 4, 14);
    const N = 10;
    for (let i = 0; i < N; i++) {
      const a0 = (i / N) * Math.PI * 2, a1 = ((i + 1.5) / N) * Math.PI * 2;
      m.tube([[Math.cos(a0) * 0.22, rimY - 0.01, rz + Math.sin(a0) * 0.22], [Math.cos(a1) * 0.16, rimY - 0.38, rz + Math.sin(a1) * 0.16]], 0.005, WHT, 3);
      m.tube([[Math.cos(a1) * 0.22, rimY - 0.01, rz + Math.sin(a1) * 0.22], [Math.cos(a0) * 0.16, rimY - 0.38, rz + Math.sin(a0) * 0.16]], 0.005, WHT, 3);
    }
    m.torus(0.16, 0.006, WHT, 0, rimY - 0.38, rz, 90 * D, 0, 0, Math.PI * 2, 3, 10);
  },
});

def('school_pingpong', {
  name: '乒乓球台',
  cat: 'street',
  sfx: 'rumble',
  fill: 0.55,
  build(m) {
    const L = 2.74, Wd = 1.525, H = 0.76, top = 0x2f7f6a, line = 0xf0f0ea, steel = 0x7a8088;
    // concrete pedestals + slab with painted top
    m.sym(s => {
      m.box(0.22, H - 0.08, 1.1, CONC, s * 0.85, (H - 0.08) / 2, 0);
      m.box(0.34, 0.04, 1.2, shade(CONC, 0.9), s * 0.85, 0.02, 0);
    });
    m.box(L, 0.07, Wd, CONC, 0, H - 0.045, 0);
    m.box(L - 0.02, 0.012, Wd - 0.02, top, 0, H - 0.004, 0);
    const ly = H + 0.0035;
    m.box(L - 0.04, 0.003, 0.02, line, 0, ly, Wd / 2 - 0.02);
    m.box(L - 0.04, 0.003, 0.02, line, 0, ly, -Wd / 2 + 0.02);
    m.sym(s => m.box(0.02, 0.003, Wd - 0.04, line, s * (L / 2 - 0.02), ly, 0));
    m.box(L - 0.04, 0.003, 0.006, line, 0, ly, 0);
    // steel net: posts, top bar, bars
    const nh = 0.1525;
    m.sym(s => m.box(0.04, nh + 0.02, 0.04, steel, 0, H + nh / 2, s * (Wd / 2 + 0.02)));
    m.box(0.03, 0.03, Wd + 0.08, steel, 0, H + nh, 0);
    m.box(0.02, 0.02, Wd, steel, 0, H + 0.02, 0);
    for (let i = 0; i < 15; i++) m.box(0.012, nh - 0.02, 0.012, steel, 0, H + nh / 2 + 0.005, -Wd / 2 + 0.05 + i * ((Wd - 0.1) / 14));
    // a paddle and a ball left on the table
    m.cyl(0.075, 0.075, 0.012, RED, 0.7, H + 0.008, 0.25, 0, 0, 0, 10);
    m.box(0.03, 0.02, 0.1, WOOD, 0.7 + Math.cos(0.4) * 0.11, H + 0.012, 0.25 + Math.sin(0.4) * 0.11, 0, -0.4 + 90 * D, 0);
    m.sphere(0.02, 0xf2a14a, -0.5, H + 0.02, -0.3, 1, 1, 1, 0, 0, 0, 6);
  },
});

// ================================================================================================
// 小卖部 · 校车
// ================================================================================================
def('school_shop', {
  name: '小卖部',
  cat: 'building',
  sfx: 'crash',
  fill: 0.7,
  build(m) {
    const x0 = -1.5, x1 = 0.9, zb = -1.1, zf = 0.6, H = 2.35, T = 0.1, cx = (x0 + x1) / 2, cz = (zb + zf) / 2;
    const wx0 = -1.2, wx1 = 0.6, wy0 = 0.95, wy1 = 1.85;
    // walls: back, sides, front around the counter window; cream with the green school band
    const band = (w, x, z, rot, y1) => {
      m.push(x, 0, z, 0, rot, 0);
      wallSlab(m, w, 0, 0, y1, T);
      m.pop();
    };
    band(x1 - x0, cx, zb + T / 2, 0, H);
    band(zf - zb, x0 + T / 2, cz, 90 * D, H);
    band(zf - zb, x1 - T / 2, cz, 90 * D, H);
    band(x1 - x0, cx, zf - T / 2, 0, wy0);
    m.box(wx0 - x0, wy1 - wy0, T, CREAM, (x0 + wx0) / 2, (wy0 + wy1) / 2, zf - T / 2);
    m.box(x1 - wx1, wy1 - wy0, T, CREAM, (x1 + wx1) / 2, (wy0 + wy1) / 2, zf - T / 2);
    m.box(x1 - x0, H - wy1, T, CREAM, cx, (wy1 + H) / 2, zf - T / 2);
    // roof slab with overhang
    m.box(x1 - x0 + 0.2, 0.1, zf - zb + 0.2, 0x8fa89a, cx, H + 0.05, cz);
    // interior: floor, shelves on the back wall
    m.box(x1 - x0 - 0.2, 0.02, zf - zb - 0.2, 0x8a8478, cx, 0.01, cz);
    m.decal(wx1 - wx0 + 0.2, 1.0, 'sf_shelf', (wx0 + wx1) / 2, 1.45, zb + T + 0.002);
    for (const y of [1.12, 1.45, 1.78]) m.box(wx1 - wx0 + 0.2, 0.025, 0.25, WOOD, (wx0 + wx1) / 2, y - 0.15, zb + T + 0.125);
    const sc = [RED, 0x2f7fd8, GOLD, 0x3fae5a, 0xf07a2a, 0xe86a9a];
    for (let i = 0; i < 12; i++) {
      const sx = wx0 + 0.05 + (i % 6) * 0.32, sy = i < 6 ? 0.985 : 1.315;
      m.box(0.2, 0.18, 0.12, sc[(i * 5) % 6], sx + 0.08, sy + 0.09, zb + T + 0.18);
    }
    // counter ledge with goodies
    const cy = wy0;
    m.box(wx1 - wx0 + 0.2, 0.05, 0.5, WOOD, (wx0 + wx1) / 2, cy + 0.025, zf - 0.08);
    m.lathe([[0, 0], [0.09, 0], [0.11, 0.06], [0.11, 0.2], [0.07, 0.24], [0, 0.24]], 0xcfe6ee, -0.85, cy + 0.05, zf, 0, 0, 0, 8);
    m.cyl(0.075, 0.075, 0.04, RED, -0.85, cy + 0.31, zf, 0, 0, 0, 8);
    for (let i = 0; i < 6; i++) m.sphere(0.025, sc[i], -0.85 + Math.cos(i) * 0.06, cy + 0.1 + (i % 3) * 0.04, zf + Math.sin(i) * 0.06, 1, 1, 1, 0, 0, 0, 5);
    for (let i = 0; i < 4; i++) {
      m.box(0.1, 0.02, 0.06, RED, -0.45, cy + 0.06 + i * 0.022, zf + 0.02, 0, i * 0.2, 0);
    }
    m.decal(0.08, 0.05, 'sf_spicy', -0.45, cy + 0.071 + 3 * 0.022, zf + 0.02, -90 * D, 0, 0.6);
    for (let i = 0; i < 4; i++) {
      m.cyl(0.03, 0.03, 0.18, [0x3fae5a, 0xf07a2a, 0x2f7fd8, 0xe86a9a][i], -0.1 + i * 0.075, cy + 0.14, zf + 0.0, 0, 0, 0, 6);
      m.cyl(0.014, 0.014, 0.03, WHT, -0.1 + i * 0.075, cy + 0.245, zf + 0.0, 0, 0, 0, 6);
    }
    m.box(0.1, 0.13, 0.01, 0x3fae5a, 0.4, cy + 0.115, zf + 0.05, -0.15, 0, 0);
    m.decal(0.08, 0.1, 'sf_qr', 0.4, cy + 0.118, zf + 0.0556, -0.15, 0, 0);
    // rolled-up shutter, striped awning, hand-painted sign
    m.cyl(0.07, 0.07, wx1 - wx0, 0x9aa0a6, (wx0 + wx1) / 2, wy1 + 0.02, zf + 0.04, 0, 0, 90 * D, 8);
    for (let i = 0; i < 8; i++) {
      const sw = (wx1 - wx0 + 0.3) / 8;
      m.box(sw, 0.02, 0.62, i % 2 ? WHT : RED, wx0 - 0.15 + sw * (i + 0.5), 1.92, zf + 0.29, 18 * D, 0, 0);
      m.box(sw, 0.12, 0.012, i % 2 ? WHT : RED, wx0 - 0.15 + sw * (i + 0.5), 1.77, zf + 0.59);
    }
    m.box(x1 - x0 - 0.2, 0.46, 0.06, RED, cx, 2.27, zf + 0.13);
    m.decal(x1 - x0 - 0.24, 0.42, 'sf_shop_sign', cx, 2.27, zf + 0.1615);
    m.sym(s => m.box(0.04, 0.3, 0.12, METAL, cx + s * 0.9, 2.2, zf + 0.06));
    // chest freezer for popsicles beside the kiosk
    const fx = 1.22, fz = 0.25;
    m.box(0.56, 0.78, 0.6, WHT, fx, 0.41, fz);
    m.box(0.56, 0.06, 0.6, 0x2f7fd8, fx, 0.06, fz);
    m.box(0.5, 0.03, 0.54, GLASS, fx, 0.81, fz);
    m.box(0.56, 0.02, 0.6, 0x9aa0a6, fx, 0.795, fz);
    m.decal(0.48, 0.12, 'sf_freezer', fx, 0.6, fz + 0.302);
    m.glow(0.4);
    m.box(0.44, 0.012, 0.48, 0xd8ecf6, fx, 0.83, fz);
    m.glow(0);
  },
});

def('school_bus', {
  name: '校车',
  cat: 'vehicle',
  sfx: 'horn',
  fill: 0.65,
  build(m) {
    const YEL = 0xf2b632, glass = 0x2c4057, dark = 0x2f3136, tire = 0x1b1b1d, hub = 0xc9cdd2, lamp = 0xfff3cc;
    const W = 2.44, zR = -5.0, zW = 2.9, bodyL = zW - zR, bz = (zW + zR) / 2;
    // passenger body + rounded hood
    m.rbox(W, 2.35, bodyL, 0.2, YEL, 0, 0.55 + 2.35 / 2, bz);
    m.rbox(2.1, 0.95, 2.0, 0.28, YEL, 0, 1.12, zW + 0.95);
    m.box(2.0, 0.3, 1.9, YEL, 0, 1.45, zW + 0.9);
    m.box(W - 0.2, 0.3, bodyL - 0.2, dark, 0, 0.5, bz);
    // grille, headlights, bumper
    const zn = zW + 1.95;
    m.box(1.0, 0.55, 0.04, 0x4a4e56, 0, 1.12, zn + 0.005);
    for (let i = 0; i < 5; i++) m.box(0.92, 0.03, 0.02, STEEL, 0, 0.92 + i * 0.1, zn + 0.03);
    m.glow(1);
    m.sym(s => m.cyl(0.13, 0.13, 0.06, lamp, s * 0.72, 1.2, zn - 0.05, 90 * D, 0, 0, 10));
    m.glow(0);
    m.box(2.3, 0.2, 0.16, dark, 0, 0.62, zn + 0.05);
    m.decal(0.44, 0.14, 'sf_bus_front', 0, 0.62, zn + 0.132);
    // windscreen + roof sign + warning lamps
    m.box(2.2, 0.9, 0.04, glass, 0, 2.25, zW + 0.005);
    m.box(0.05, 0.9, 0.05, dark, 0, 2.25, zW + 0.02);
    m.sym(s => m.box(0.6, 0.03, 0.03, dark, s * 0.45, 1.86, zW + 0.04, 0, 0, s * 0.3));
    m.box(1.3, 0.34, 0.08, WHT, 0, 3.05, zW - 0.2);
    m.decal(1.24, 0.3, 'sf_bus_front', 0, 3.05, zW - 0.159);
    m.decal(1.24, 0.3, 'sf_bus_front', 0, 3.05, zW - 0.241, 0, Math.PI, 0);
    m.glow(1);
    m.sym(s => {
      m.box(0.16, 0.12, 0.06, 0xe0282e, s * 0.95, 2.82, zW + 0.01);
      m.box(0.16, 0.12, 0.06, 0xf2a14a, s * 0.75, 2.82, zW + 0.01);
      m.box(0.16, 0.12, 0.06, 0xe0282e, s * 0.95, 2.82, zR - 0.01);
    });
    m.glow(0);
    // side windows: one dark band, yellow pillars, black stripes, lettering
    m.sym(s => {
      const x = s * (W / 2 + 0.005);
      m.box(0.02, 0.72, bodyL - 0.9, glass, x, 2.2, bz - 0.15);
      for (let i = 0; i < 9; i++) m.box(0.03, 0.74, 0.12, YEL, s * (W / 2 + 0.012), 2.2, zR + 0.36 + i * ((bodyL - 0.9) / 8));
      for (const y of [1.72, 1.32, 1.02]) m.box(0.03, y === 1.72 ? 0.05 : 0.08, bodyL - 0.2, BLK, s * (W / 2 + 0.01), y, bz);
      m.decal(2.6, 0.32, 'sf_bus_side', s * (W / 2 + 0.03), 1.52, bz - 0.4, 0, s * 90 * D, 0);
      // wheel wells
      m.box(0.04, 0.6, 1.25, dark, s * (W / 2 - 0.0), 0.75, zR + 1.9);
    });
    m.sym(s => m.box(0.04, 0.5, 1.2, dark, s * 1.04, 0.95, zW + 0.95));
    // door at the front kerb side (-X)
    m.box(0.03, 2.0, 0.85, dark, -W / 2 - 0.01, 1.55, zW - 0.6);
    m.box(0.035, 1.8, 0.36, 0x2a3f55, -W / 2 - 0.015, 1.6, zW - 0.4);
    m.box(0.035, 1.8, 0.36, 0x2a3f55, -W / 2 - 0.015, 1.6, zW - 0.8);
    // folded stop arm on the driver side (+X)
    m.cyl(0.2, 0.2, 0.025, 0xe0282e, W / 2 + 0.04, 1.6, zW - 1.4, 0, 22.5 * D, 90 * D, 8);
    m.decal(0.24, 0.24, 'sf_stop', W / 2 + 0.054, 1.6, zW - 1.4, 0, 90 * D, 0);
    // mirrors
    m.sym(s => {
      m.tube([[s * 1.05, 1.6, zW + 1.5], [s * 1.35, 1.75, zW + 1.6], [s * 1.38, 2.0, zW + 1.6]], 0.025, dark, 4);
      m.box(0.08, 0.32, 0.18, dark, s * 1.38, 2.1, zW + 1.6);
    });
    // rear: emergency door, window, tail lamps, bumper
    m.box(0.9, 1.9, 0.03, shade(YEL, 0.9), 0, 1.55, zR - 0.01);
    m.box(0.7, 0.7, 0.04, glass, 0, 2.15, zR - 0.015);
    m.sym(s => m.box(0.6, 0.6, 0.04, glass, s * 0.85, 2.2, zR - 0.015));
    m.glow(1);
    m.sym(s => m.box(0.2, 0.2, 0.05, 0xe0282e, s * 0.9, 1.2, zR - 0.015));
    m.glow(0);
    m.box(W - 0.04, 0.22, 0.14, dark, 0, 0.6, zR - 0.05);
    m.box(0.25, 0.04, 0.04, STEEL, 0, 1.5, zR - 0.04);
    // wheels
    const wheel = (x, z) => {
      m.cyl(0.5, 0.5, 0.3, tire, x, 0.5, z, 0, 0, 90 * D, 12);
      m.cyl(0.26, 0.26, 0.32, hub, x, 0.5, z, 0, 0, 90 * D, 8);
    };
    m.sym(s => { wheel(s * 1.0, zW + 0.95); wheel(s * 1.05, zR + 1.9); });
  },
});
