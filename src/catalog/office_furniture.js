// 工位开局 (office_furniture): desks, chairs, printers, pantry, lobby and façade pieces of the
// 幸福科技 open-plan office. Real sizes in metres, base on y = 0, front faces +Z. Decal prefix of_.
import * as THREE from 'three';
import { def } from './registry.js';
import { D, shade } from '../core/modeler.js';
import { decal, fitText, FONTS } from '../core/atlas.js';

const INK = 0x2a1d17, BLK = 0x26262c, WHT = 0xf4f2ec;
const STEEL = 0xc9cdd2, METAL = 0x8e949b, DARK = 0x3a3d44;
const WOOD = 0xdcc29a, RED = 0xd8342c, ORANGE = 0xf2a14a;
const GLASS = 0xb4ccd8, GLASS_HI = 0xe2eef4, MULL = 0x4a4e56;

// ---- local helpers -----------------------------------------------------------------------------
const OCTA = new THREE.OctahedronGeometry(1, 0);
const _up = new THREE.Vector3(0, 1, 0);
/** cylinder rod from a to b */
function rod(m, r, col, a, b, seg = 6) {
  const v = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const e = new THREE.Euler().setFromQuaternion(new THREE.Quaternion().setFromUnitVectors(_up, v.clone().normalize()), 'XYZ');
  m.cyl(r, r, v.length(), col, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2, e.x, e.y, e.z, seg);
}
/** small caster: fork + wheel */
function caster(m, x, z, r = 0.03, ry = 0) {
  m.box(r * 1.2, r * 1.4, r * 1.6, DARK, x, r * 2.1, z, 0, ry, 0);
  m.cyl(r, r, r * 0.9, BLK, x, r, z, 90 * D, ry, 0, 8);
}
/** two diagonal glare strips on a glass pane (both faces) */
function glare(m, cx, cy, w, h, z, t) {
  for (const s of [1, -1]) {
    m.box(w * 0.07, h * 0.62, 0.003, GLASS_HI, cx - w * 0.12, cy + h * 0.04, z + s * t, 0, 0, -28 * D);
    m.box(w * 0.03, h * 0.42, 0.003, GLASS_HI, cx + w * 0.08, cy - h * 0.06, z + s * t, 0, 0, -28 * D);
  }
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
function arrow(ctx, x1, y1, x2, y2, col, lw = 4) {
  const a = Math.atan2(y2 - y1, x2 - x1);
  ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2);
  ctx.moveTo(x2 - 12 * Math.cos(a - 0.5), y2 - 12 * Math.sin(a - 0.5)); ctx.lineTo(x2, y2);
  ctx.lineTo(x2 - 12 * Math.cos(a + 0.5), y2 - 12 * Math.sin(a + 0.5));
  ctx.stroke();
}
function scribble(ctx, x, y, w, col, seed, lw = 3) {
  let a = seed * 9301 + 49297;
  const rnd = () => ((a = (a * 9301 + 49297) % 233280) / 233280);
  ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(x, y);
  for (let i = 1; i <= 12; i++) ctx.lineTo(x + (w * i) / 12, y + (rnd() - 0.5) * lw * 3);
  ctx.stroke();
}
function qrCode(ctx, x, y, s, seed = 7) {
  const n = 15, c = s / n;
  let a = seed * 9301 + 49297;
  const rnd = () => ((a = (a * 9301 + 49297) % 233280) / 233280);
  ctx.fillStyle = '#fbfbf8'; ctx.fillRect(x - c, y - c, s + 2 * c, s + 2 * c);
  ctx.fillStyle = '#1d1d22';
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) if (rnd() < 0.45) ctx.fillRect(x + i * c, y + j * c, c + 0.3, c + 0.3);
  for (const [fx, fy] of [[0, 0], [n - 5, 0], [0, n - 5]]) {
    ctx.fillStyle = '#1d1d22'; ctx.fillRect(x + fx * c, y + fy * c, 5 * c, 5 * c);
    ctx.fillStyle = '#fbfbf8'; ctx.fillRect(x + (fx + 1) * c, y + (fy + 1) * c, 3 * c, 3 * c);
    ctx.fillStyle = '#1d1d22'; ctx.fillRect(x + (fx + 2) * c, y + (fy + 2) * c, c, c);
  }
}
/** 幸福科技 logo: orange smiling sun + name */
function logo(ctx, w, h, textCol) {
  const r = h * 0.38, cx = r + 6, cy = h / 2;
  ctx.fillStyle = '#f2a14a';
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    ctx.beginPath(); ctx.arc(cx + Math.cos(a) * r * 1.05, cy + Math.sin(a) * r * 1.05, r * 0.22, 0, Math.PI * 2); ctx.fill();
  }
  ctx.beginPath(); ctx.arc(cx, cy, r * 0.82, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#ffffff'; ctx.lineWidth = Math.max(2, r * 0.14); ctx.lineCap = 'round';
  ctx.beginPath(); ctx.arc(cx, cy - r * 0.05, r * 0.45, 0.2 * Math.PI, 0.8 * Math.PI); ctx.stroke();
  fitText(ctx, '幸福科技', (cx + r + w) / 2 + 2, cy, w - cx - r - 12, h * 0.78, FONTS.round, textCol);
}

// ================================================================================================
// decals
// ================================================================================================
decal('of_logo', 256, 64, (ctx, w, h) => logo(ctx, w, h, '#2c3e66'));
decal('of_logo_w', 256, 64, (ctx, w, h) => logo(ctx, w, h, '#f6f4ee'));

decal('of_sticky', 32, 32, (ctx, w, h) => {
  ctx.fillStyle = '#f7dc5a'; ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#e6c63c'; ctx.fillRect(0, 0, w, 5);
  fitText(ctx, 'DDL!', w / 2, h * 0.58, w - 4, h * 0.42, FONTS.round, '#d8342c');
});

decalS('of_pinboard', 192, 144, 0.75, (ctx, w, h) => {
  // printed schedule
  ctx.save(); ctx.translate(14, 10); ctx.rotate(-0.03);
  ctx.fillStyle = '#fbfbf7'; ctx.fillRect(0, 0, 84, 116);
  ctx.fillStyle = '#2c5a9a'; ctx.fillRect(0, 0, 84, 16);
  fitText(ctx, '本周排期', 42, 8, 76, 12, FONTS.sans, '#ffffff');
  const cols = ['#f2a14a', '#5aa9e6', '#7fcf6a', '#e8554a', '#f2c14e'];
  for (let r = 0; r < 6; r++) {
    ctx.fillStyle = '#c9cdd2'; ctx.fillRect(4, 22 + r * 15, 76, 1);
    ctx.fillStyle = '#9aa0a6'; ctx.fillRect(6, 25 + r * 15, 12, 6);
    ctx.fillStyle = cols[(r * 2) % 5]; ctx.fillRect(22 + (r % 3) * 12, 25 + r * 15, 22 + (r % 2) * 14, 8);
  }
  ctx.fillStyle = '#d8342c'; ctx.beginPath(); ctx.arc(42, 4, 3, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  // sticky notes
  const notes = [['#f7dc5a', '周报!', 128, 26, 0.12], ['#f4a3b8', 'DDL 周五', 164, 60, -0.1], ['#9fe0a8', '多喝水', 120, 96, -0.06], ['#9fd0f4', '对齐一下', 162, 118, 0.1]];
  for (const [c, t, x, y, a] of notes) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(a);
    ctx.fillStyle = c; ctx.fillRect(-20, -18, 40, 36);
    ctx.fillStyle = 'rgba(0,0,0,0.08)'; ctx.fillRect(-20, -18, 40, 6);
    fitText(ctx, t, 0, 3, 36, 14, FONTS.round, '#2a2d33');
    ctx.restore();
  }
});

decalS('of_wb', 512, 320, 0.6, (ctx, w, h) => {
  ctx.fillStyle = '#f8f8f4'; ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = 'rgba(150,160,170,0.12)'; rrect(ctx, 300, 200, 180, 70, 30); ctx.fill(); // ghost of old erasing
  const B = '#2457c8', R = '#d8342c', K = '#2a2d33', G = '#2f9a5a';
  // 抓手 → 对齐 → 闭环 → 赋能
  ctx.strokeStyle = B; ctx.lineWidth = 4;
  rrect(ctx, 30, 36, 120, 62, 8); ctx.stroke();
  fitText(ctx, '抓手', 90, 68, 104, 46, FONTS.round, B);
  fitText(ctx, '对齐', 270, 68, 110, 50, FONTS.round, K);
  ctx.strokeStyle = K; ctx.lineWidth = 3; ctx.beginPath(); ctx.ellipse(270, 68, 70, 36, -0.05, 0, Math.PI * 2); ctx.stroke();
  arrow(ctx, 156, 66, 194, 66, K);
  arrow(ctx, 270, 108, 270, 152, K);
  fitText(ctx, '闭环', 270, 196, 90, 42, FONTS.sans, G);
  ctx.strokeStyle = G; ctx.lineWidth = 4;
  ctx.beginPath(); ctx.arc(270, 196, 58, 0.4, Math.PI * 1.85); ctx.stroke();
  arrow(ctx, 306, 154, 316, 172, G);
  arrow(ctx, 214, 200, 170, 214, R);
  fitText(ctx, '赋能', 92, 222, 120, 54, FONTS.round, R);
  scribble(ctx, 34, 256, 116, R, 3, 4);
  for (const [x, y] of [[30, 186], [154, 182]]) fitText(ctx, '★', x, y, 22, 22, FONTS.sans, R);
  // growth chart
  ctx.strokeStyle = K; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(370, 30); ctx.lineTo(370, 150); ctx.lineTo(490, 150); ctx.stroke();
  const bars = [30, 48, 70, 104];
  bars.forEach((b, i) => { ctx.fillStyle = i === 3 ? R : B; ctx.fillRect(382 + i * 26, 148 - b, 16, b); });
  arrow(ctx, 380, 120, 486, 32, R, 4);
  fitText(ctx, 'Q4 冲!!!', 430, 182, 120, 30, FONTS.round, R);
  // notes
  for (let i = 0; i < 3; i++) scribble(ctx, 340, 228 + i * 22, 140 - i * 30, K, 11 + i, 2.5);
  fitText(ctx, 'OKR', 30 + 30, 296, 60, 26, FONTS.sans, B);
  scribble(ctx, 100, 296, 120, B, 21, 2.5);
});

decalS('of_vend_front', 160, 240, 0.75, (ctx, w, h) => {
  ctx.fillStyle = '#e2f0f7'; ctx.fillRect(0, 0, w, h);
  const cols = ['#d8342c', '#2f7fd8', '#f2c14e', '#3fae5a', '#f07a2a', '#f4f2ec', '#8a4fc8', '#26262c'];
  const rows = 6, per = 5, rh = h / rows;
  for (let r = 0; r < rows; r++) {
    const y0 = r * rh;
    for (let i = 0; i < per; i++) {
      const cx = (i + 0.5) * w / per, c = cols[(r * 3 + i * 5 + r * i) % cols.length];
      ctx.fillStyle = c;
      if (r < 2) { // bottles and cans
        if ((r + i) % 2) { rrect(ctx, cx - 7, y0 + 11, 14, rh - 19, 4); ctx.fill(); ctx.fillRect(cx - 3, y0 + 5, 6, 8); }
        else { rrect(ctx, cx - 8, y0 + 14, 16, rh - 22, 3); ctx.fill(); }
        ctx.fillStyle = '#ffffff'; ctx.fillRect(cx - 7, y0 + rh * 0.5, 14, 5);
      } else if (r < 4) { // chip bags
        ctx.beginPath(); ctx.moveTo(cx - 12, y0 + 8); ctx.lineTo(cx + 12, y0 + 6); ctx.lineTo(cx + 13, y0 + rh - 9); ctx.lineTo(cx - 13, y0 + rh - 8); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(cx, y0 + rh / 2, 5, 0, Math.PI * 2); ctx.fill();
      } else { // cup noodles
        ctx.fillStyle = i % 2 ? '#d8342c' : '#f2a14a';
        ctx.beginPath(); ctx.moveTo(cx - 13, y0 + 10); ctx.lineTo(cx + 13, y0 + 10); ctx.lineTo(cx + 9, y0 + rh - 8); ctx.lineTo(cx - 9, y0 + rh - 8); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#f4f2ec'; ctx.fillRect(cx - 13, y0 + 8, 26, 5);
        ctx.fillStyle = '#ffffff'; ctx.fillRect(cx - 8, y0 + 18, 16, 6);
      }
      ctx.fillStyle = '#ffffff'; ctx.fillRect(cx - 8, y0 + rh - 6, 16, 4);
    }
    ctx.fillStyle = '#8fa6b4'; ctx.fillRect(0, y0 + rh - 2, w, 2);
  }
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.beginPath(); ctx.moveTo(20, h); ctx.lineTo(44, h); ctx.lineTo(120, 0); ctx.lineTo(96, 0); ctx.closePath(); ctx.fill();
});
decal('of_vend_head', 256, 40, (ctx, w, h) => {
  ctx.fillStyle = '#f2a14a'; ctx.fillRect(0, 0, w, h);
  fitText(ctx, '加班续命站', w / 2, h / 2, w * 0.7, h * 0.78, FONTS.round, '#ffffff');
  fitText(ctx, '⚡', 24, h / 2, 24, 26, FONTS.sans, '#fff6c8');
  fitText(ctx, '⚡', w - 24, h / 2, 24, 26, FONTS.sans, '#fff6c8');
});
decal('of_vend_panel', 40, 128, (ctx, w, h) => {
  ctx.fillStyle = '#2b2e34'; ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#0f2a1c'; ctx.fillRect(5, 6, w - 10, 16);
  fitText(ctx, '¥4.5', w / 2, 14, w - 14, 11, FONTS.sans, '#48f08a');
  qrCode(ctx, 7, 32, 26, 5);
  for (let r = 0; r < 4; r++) for (let c = 0; c < 3; c++) { ctx.fillStyle = '#c9cdd2'; ctx.fillRect(6 + c * 10, 70 + r * 10, 8, 7); }
  ctx.fillStyle = '#111114'; ctx.fillRect(8, 116, 24, 5);
});

decal('of_print_scr', 48, 28, (ctx, w, h) => {
  ctx.fillStyle = '#1f6fc4'; ctx.fillRect(0, 0, w, h);
  const c = ['#f2c14e', '#7fe08a', '#ffffff', '#f4a3b8'];
  for (let i = 0; i < 4; i++) { ctx.fillStyle = c[i]; rrect(ctx, 4 + i * 11, 8, 8, 8, 2); ctx.fill(); }
  ctx.fillStyle = '#d8ecff'; ctx.fillRect(4, 21, 30, 3);
});
decal('of_print_note', 40, 40, (ctx, w, h) => {
  ctx.fillStyle = '#f4a3b8'; ctx.fillRect(0, 0, w, h);
  fitText(ctx, '卡纸', w / 2, 13, w - 6, 15, FONTS.round, '#2a2d33');
  fitText(ctx, '找行政', w / 2, 29, w - 6, 12, FONTS.round, '#2a2d33');
});

decal('of_water_lbl', 64, 28, (ctx, w, h) => {
  ctx.translate(w, h); ctx.rotate(Math.PI); // bottle is upside down
  ctx.fillStyle = '#2f7fd8'; ctx.fillRect(0, 0, w, h);
  fitText(ctx, '幸福山泉', w / 2, h / 2, w - 6, h - 8, FONTS.round, '#ffffff');
});

decal('of_coffee_scr', 48, 32, (ctx, w, h) => {
  ctx.fillStyle = '#16181c'; ctx.fillRect(0, 0, w, h);
  const c = ['#b07a4f', '#e8c89a', '#6a4028'];
  for (let i = 0; i < 3; i++) {
    ctx.fillStyle = c[i]; rrect(ctx, 5 + i * 14, 6, 10, 10, 2); ctx.fill();
  }
  fitText(ctx, '拿铁 ☕', w / 2, 24, w - 8, 9, FONTS.sans, '#f2c14e');
});

decal('of_tl_door', 48, 40, (ctx, w, h) => {
  ctx.fillStyle = '#c9cdd2'; ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#eef0ee'; ctx.fillRect(2, 2, w - 4, h - 4);
  ctx.fillStyle = '#b8cbd6'; ctx.fillRect(7, 7, w - 14, 18);
  ctx.fillStyle = '#d6e4ec'; ctx.fillRect(9, 9, 6, 14);
  ctx.fillStyle = '#4fd06a'; ctx.beginPath(); ctx.arc(w - 9, h - 8, 3, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#f2a14a'; ctx.fillRect(7, h - 10, 16, 4);
});
decal('of_tl_screen', 64, 96, (ctx, w, h) => {
  ctx.fillStyle = '#20252c'; ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#f2a14a'; ctx.fillRect(4, 4, w - 8, 18);
  fitText(ctx, '扫码取餐', w / 2, 13, w - 12, 12, FONTS.sans, '#ffffff');
  qrCode(ctx, 14, 30, 36, 9);
  fitText(ctx, '取餐码', w / 2, 80, w - 16, 10, FONTS.sans, '#dbe9ff');
  ctx.fillStyle = '#3a4048'; ctx.fillRect(8, 87, w - 16, 5);
});
decal('of_tl_head', 320, 32, (ctx, w, h) => {
  ctx.fillStyle = '#f2a14a'; ctx.fillRect(0, 0, w, h);
  fitText(ctx, '幸福科技 · 外卖取餐柜', w * 0.4, h / 2, w * 0.66, h * 0.72, FONTS.sans, '#ffffff');
  fitText(ctx, '保温 · 消毒', w * 0.86, h / 2, w * 0.24, h * 0.5, FONTS.sans, '#fff2d8');
});

const CAB_LABELS = ['合同', '报销单', '杂物', '机密'];
CAB_LABELS.forEach((t, i) => decal('of_cab_' + i, 48, 20, (ctx, w, h) => {
  ctx.fillStyle = '#f6f4ee'; ctx.fillRect(0, 0, w, h);
  fitText(ctx, t, w / 2, h / 2, w - 6, h - 6, FONTS.sans, '#2a2d33');
}));

decal('of_push', 80, 40, (ctx, w, h) => {
  ctx.fillStyle = '#f6f4ee'; rrect(ctx, 1, 1, w - 2, h - 2, 6); ctx.fill();
  fitText(ctx, '推 PUSH', w / 2, h / 2, w - 10, h - 14, FONTS.sans, '#2a2d33');
});
decal('of_pull', 80, 40, (ctx, w, h) => {
  ctx.fillStyle = '#f6f4ee'; rrect(ctx, 1, 1, w - 2, h - 2, 6); ctx.fill();
  fitText(ctx, '拉 PULL', w / 2, h / 2, w - 10, h - 14, FONTS.sans, '#2a2d33');
});
decal('of_glass_band', 256, 12, (ctx, w, h) => {
  ctx.fillStyle = '#f2f6f8';
  for (let x = 6; x < w; x += 12) { ctx.beginPath(); ctx.arc(x, h / 2, 3.5, 0, Math.PI * 2); ctx.fill(); }
});

decal('of_lift_disp', 96, 40, (ctx, w, h) => {
  ctx.fillStyle = '#16181c'; ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#ff7a2a';
  ctx.beginPath(); ctx.moveTo(14, 12); ctx.lineTo(36, 12); ctx.lineTo(25, 30); ctx.closePath(); ctx.fill();
  fitText(ctx, '1F', 66, h / 2, 46, h - 8, FONTS.sans, '#ff7a2a');
});
decal('of_brushed', 32, 96, (ctx, w, h) => {
  ctx.fillStyle = '#c4c9ce'; ctx.fillRect(0, 0, w, h);
  let a = 77;
  const rnd = () => ((a = (a * 9301 + 49297) % 233280) / 233280);
  for (let i = 0; i < 10; i++) { ctx.fillStyle = rnd() < 0.5 ? '#ccd1d5' : '#bcc2c7'; ctx.fillRect(rnd() * w, 0, 1 + rnd() * 2, h); }
});

decal('of_turn_reader', 32, 32, (ctx, w, h) => {
  ctx.fillStyle = '#16181c'; ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = '#3fe07a'; ctx.lineWidth = 2.5;
  rrect(ctx, 4, 4, w - 8, h - 8, 5); ctx.stroke();
  for (const r of [5, 9]) { ctx.beginPath(); ctx.arc(11, h / 2, r, -0.8, 0.8); ctx.stroke(); }
  ctx.fillStyle = '#3fe07a'; ctx.beginPath(); ctx.arc(11, h / 2, 2.5, 0, Math.PI * 2); ctx.fill();
});
decal('of_turn_go', 32, 32, (ctx, w, h) => {
  ctx.fillStyle = '#16181c'; ctx.fillRect(0, 0, w, h);
  arrow(ctx, 7, h / 2, w - 8, h / 2, '#3fe07a', 4);
});
decal('of_turn_stop', 32, 32, (ctx, w, h) => {
  ctx.fillStyle = '#16181c'; ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = '#ff4a3a'; ctx.lineWidth = 4; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(9, 9); ctx.lineTo(w - 9, h - 9); ctx.moveTo(w - 9, 9); ctx.lineTo(9, h - 9); ctx.stroke();
});

// ================================================================================================
// 工位 · 人体工学椅 · 隔板
// ================================================================================================
def('office_desk', {
  name: '工位',
  cat: 'daily',
  sfx: 'crash',
  fill: 0.3,
  tints: [0x7f97ab, 0x8c9a7c, 0xa88f80, 0x8c8c98],
  build(m) {
    const W = 1.4, Dp = 0.7, H = 0.75;
    // top with darker edge band
    m.box(W, 0.03, Dp, WOOD, 0, H - 0.015, 0);
    m.box(W, 0.02, 0.006, shade(WOOD, 0.85), 0, H - 0.017, Dp / 2);
    // end frames: two posts + foot + top rail
    m.sym(s => {
      const x = s * (W / 2 - 0.06);
      for (const z of [-0.27, 0.27]) m.box(0.05, H - 0.07, 0.05, METAL, x, (H - 0.07) / 2 + 0.03, z);
      m.box(0.06, 0.04, 0.64, METAL, x, 0.03, 0);
      m.box(0.05, 0.04, 0.62, METAL, x, H - 0.05, 0);
      for (const z of [-0.29, 0.29]) m.box(0.05, 0.012, 0.05, DARK, x, 0.006, z);
    });
    m.box(W - 0.14, 0.05, 0.04, METAL, 0, H - 0.055, -0.2);
    // modesty panel and cable tray
    m.box(W - 0.16, 0.32, 0.012, 0xa9aeb4, 0, 0.5, -0.29);
    m.box(0.9, 0.06, 0.12, DARK, 0, H - 0.09, -0.22);
    // fabric privacy screen on the back edge
    const sz = -Dp / 2 + 0.015;
    m.tint();
    m.box(W - 0.04, 0.33, 0.024, 0xffffff, 0, H + 0.175, sz);
    m.tint(0);
    m.box(W, 0.022, 0.034, STEEL, 0, H + 0.35, sz);
    m.sym(s => {
      m.box(0.022, 0.35, 0.034, STEEL, s * (W / 2 - 0.011), H + 0.175, sz);
      m.box(0.05, 0.06, 0.06, DARK, s * 0.45, H - 0.005, sz + 0.005);
    });
    m.decal(0.07, 0.07, 'of_sticky', 0.42, H + 0.23, sz + 0.0135, 0, 0, 0.08);
  },
});

def('office_chair', {
  name: '人体工学椅',
  cat: 'daily',
  sfx: 'crash',
  fill: 0.3,
  tints: [0x3a3f47, 0x2f5f9a, 0xd86a3a, 0x4e8a5a, 0x7a7f88],
  build(m) {
    const frame = 0x2e3136, mesh = 0x4a505a, chrome = 0xc9cdd2;
    // 5-star base with casters
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 + Math.PI / 2;
      const c = Math.cos(a), s = Math.sin(a);
      m.box(0.27, 0.035, 0.05, frame, c * 0.15, 0.09, s * 0.15, 0, -a, -0.1);
      m.box(0.045, 0.02, 0.045, frame, c * 0.28, 0.072, s * 0.28, 0, -a, 0);
      caster(m, c * 0.285, s * 0.285, 0.028, -a);
    }
    m.cyl(0.05, 0.05, 0.06, frame, 0, 0.1, 0, 0, 0, 0, 8);
    // gas lift
    m.cyl(0.035, 0.042, 0.16, frame, 0, 0.2, 0, 0, 0, 0, 8);
    m.cyl(0.022, 0.022, 0.16, chrome, 0, 0.34, 0, 0, 0, 0, 8);
    m.box(0.22, 0.05, 0.24, frame, 0, 0.43, 0);
    m.box(0.12, 0.012, 0.012, frame, 0.15, 0.42, 0.1, 0, 0, -0.2); // height lever
    // seat cushion
    m.tint();
    m.rbox(0.5, 0.08, 0.48, 0.03, 0xffffff, 0, 0.49, 0.03);
    m.tint(0);
    m.box(0.46, 0.02, 0.44, frame, 0, 0.45, 0.03);
    // backrest, tilted back
    m.box(0.08, 0.06, 0.2, frame, 0, 0.44, -0.2);
    m.push(0, 0.48, -0.27, -10 * D, 0, 0);
    m.box(0.07, 0.16, 0.04, frame, 0, 0.06, 0);
    m.sym(s => m.box(0.03, 0.46, 0.035, frame, s * 0.225, 0.33, 0, 0, 0, s * -0.04));
    m.box(0.47, 0.035, 0.04, frame, 0, 0.56, 0);
    m.box(0.42, 0.03, 0.035, frame, 0, 0.11, 0);
    m.plane(0.43, 0.44, mesh, 0, 0.335, 0);
    for (let i = 0; i < 3; i++) m.box(0.42, 0.006, 0.008, shade(mesh, 1.35), 0, 0.22 + i * 0.12, 0.004);
    m.tint();
    m.rbox(0.34, 0.08, 0.035, 0.012, 0xffffff, 0, 0.25, 0.02); // lumbar pad
    m.tint(0);
    // headrest
    m.box(0.04, 0.1, 0.03, frame, 0, 0.6, -0.01);
    m.tint();
    m.rbox(0.3, 0.09, 0.05, 0.02, 0xffffff, 0, 0.66, 0.0);
    m.tint(0);
    m.pop();
    // armrests
    m.sym(s => {
      m.box(0.1, 0.03, 0.05, frame, s * 0.24, 0.44, 0.0);
      m.box(0.035, 0.24, 0.05, frame, s * 0.29, 0.56, -0.01, 0, 0, s * 0.05);
      m.rbox(0.07, 0.035, 0.25, 0.012, frame, s * 0.3, 0.69, 0.0);
    });
  },
});

def('office_partition', {
  name: '工位隔板',
  cat: 'daily',
  sfx: 'soft',
  fill: 0.3,
  tints: [0x8aa0b4, 0x9aa48a, 0xb59a86, 0x8c8c96],
  build(m) {
    const W = 1.6, H = 1.4, T = 0.06;
    m.box(W, 0.07, T, METAL, 0, 0.055, 0);
    m.box(W, 0.035, T, STEEL, 0, H - 0.0175, 0);
    m.sym(s => {
      m.box(0.035, H - 0.02, T, STEEL, s * (W / 2 - 0.0175), H / 2, 0);
      m.box(0.06, 0.02, T, DARK, s * 0.6, 0.01, 0);
    });
    m.tint();
    m.box(W - 0.07, H - 0.125, T - 0.012, 0xffffff, 0, 0.0875 + (H - 0.125) / 2 + 0.002, 0);
    m.tint(0);
    m.decal(0.9, 0.675, 'of_pinboard', -0.15, 0.95, T / 2 - 0.005);
    m.decal(0.08, 0.08, 'of_sticky', 0.4, 1.0, -T / 2 + 0.005, 0, Math.PI, 0.1);
    m.decal(0.08, 0.08, 'of_sticky', 0.25, 0.85, -T / 2 + 0.005, 0, Math.PI, -0.12);
  },
});

// ================================================================================================
// 打印机 · 饮水机 · 白板 · 会议桌
// ================================================================================================
def('office_printer', {
  name: '打印机',
  cat: 'daily',
  sfx: 'crash',
  fill: 0.8,
  build(m) {
    const lg = 0xe6e6e2, mg = 0xc4c6c8, dg = 0x4a4e56, paper = 0xfbfbf7;
    // base cabinet with two paper cassettes
    for (const [x, z] of [[-0.24, -0.2], [0.24, -0.2], [-0.24, 0.2], [0.24, 0.2]]) caster(m, x, z, 0.012);
    m.box(0.58, 0.3, 0.52, mg, 0, 0.19, -0.01);
    for (const y of [0.12, 0.26]) {
      m.box(0.55, 0.12, 0.02, lg, 0, y, 0.26);
      m.box(0.16, 0.022, 0.01, dg, 0, y + 0.03, 0.272);
    }
    // engine body
    m.box(0.6, 0.26, 0.54, lg, 0, 0.47, -0.005);
    m.box(0.58, 0.004, 0.004, mg, 0, 0.46, 0.264);
    m.box(0.004, 0.2, 0.004, mg, 0.12, 0.47, 0.264);
    m.decal(0.07, 0.07, 'of_print_note', -0.17, 0.5, 0.2635, 0, 0, 0.1);
    // output gap with pillar, scanner on top
    m.box(0.18, 0.1, 0.5, mg, 0.21, 0.65, -0.015);
    m.box(0.42, 0.1, 0.02, dg, -0.09, 0.65, -0.25);
    m.box(0.6, 0.08, 0.54, lg, 0, 0.74, -0.005);
    m.box(0.5, 0.025, 0.42, mg, -0.02, 0.79, -0.04); // document feeder
    m.box(0.3, 0.012, 0.3, paper, -0.06, 0.808, -0.06);
    // printed page sticking out of the output gap
    m.box(0.24, 0.006, 0.3, paper, -0.1, 0.606, 0.17, 0.06, 0.05, 0);
    m.box(0.24, 0.004, 0.3, shade(paper, 0.95), -0.11, 0.602, 0.0);
    // control panel
    m.box(0.24, 0.025, 0.12, dg, 0.13, 0.775, 0.26, 25 * D, 0, 0);
    m.glow(1);
    m.decal(0.12, 0.07, 'of_print_scr', 0.11, 0.79, 0.265, -65 * D, 0, 0);
    m.box(0.012, 0.01, 0.012, 0x48f08a, 0.22, 0.79, 0.262);
    m.glow(0);
    // bypass tray on the right side
    m.box(0.012, 0.012, 0.22, mg, 0.33, 0.43, 0, 0, 0, -50 * D);
    m.box(0.12, 0.006, 0.2, mg, 0.35, 0.405, 0, 0, 0, -12 * D);
  },
});

def('office_water', {
  name: '饮水机',
  cat: 'daily',
  sfx: 'glass',
  fill: 0.6,
  build(m) {
    const body = 0xeef0ee, blue = 0x7dbbe6, hi = 0xd2ecfa;
    m.box(0.33, 0.03, 0.33, DARK, 0, 0.015, 0);
    m.box(0.32, 0.76, 0.32, body, 0, 0.41, 0);
    m.box(0.33, 0.02, 0.33, 0xdadcd9, 0, 0.79, 0);
    // dispensing niche, drip tray, taps
    m.box(0.26, 0.22, 0.012, 0x7c848c, 0, 0.55, 0.162);
    m.box(0.22, 0.02, 0.09, 0x9aa0a6, 0, 0.45, 0.19);
    m.box(0.2, 0.004, 0.08, 0x6a7078, 0, 0.462, 0.19);
    for (const [x, c] of [[-0.06, RED], [0.06, 0x2f7fd8]]) {
      m.box(0.05, 0.05, 0.05, c, x, 0.62, 0.185);
      m.box(0.03, 0.015, 0.05, c, x, 0.655, 0.2);
      m.cyl(0.008, 0.008, 0.03, 0xd8dde2, x, 0.585, 0.19, 0, 0, 0, 6);
    }
    m.glow(1);
    m.box(0.016, 0.016, 0.006, 0xff4a3a, -0.04, 0.72, 0.162);
    m.box(0.016, 0.016, 0.006, 0x48f08a, 0.04, 0.72, 0.162);
    m.glow(0);
    // lower cabinet door
    m.box(0.27, 0.34, 0.008, 0xe2e4e2, 0, 0.23, 0.162);
    m.box(0.012, 0.08, 0.016, 0x9aa0a6, 0.1, 0.26, 0.168);
    // upturned bottle
    m.cyl(0.07, 0.08, 0.02, 0x2c5a9a, 0, 0.81, 0, 0, 0, 0, 10);
    m.lathe([[0, 0.8], [0.03, 0.8], [0.03, 0.85], [0.065, 0.88], [0.128, 0.92], [0.135, 0.98], [0.128, 1.04], [0.135, 1.1], [0.128, 1.15], [0.1, 1.19], [0, 1.2]], blue, 0, 0, 0, 0, 0, 0, 10);
    m.box(0.022, 0.2, 0.008, hi, -0.06, 1.04, 0.118, 0, -28 * D, 0);
    m.box(0.012, 0.12, 0.008, hi, -0.1, 1.05, 0.088, 0, -48 * D, 0);
    m.decal(0.085, 0.04, 'of_water_lbl', 0.03, 0.96, 0.135, 0, 12 * D, 0);
  },
});

def('office_whiteboard', {
  name: '会议室白板',
  cat: 'daily',
  sfx: 'crash',
  fill: 0.25,
  build(m) {
    const frame = 0xb8bcc2, board = 0xf6f6f2, stand = 0x8e949b;
    // stand: posts, feet with casters, brace
    m.sym(s => {
      const x = s * 0.88;
      m.box(0.04, 1.84, 0.04, stand, x, 0.98, 0);
      m.box(0.05, 0.04, 0.6, stand, x, 0.08, 0);
      for (const z of [-0.27, 0.27]) caster(m, x, z, 0.03);
      m.cyl(0.028, 0.028, 0.03, DARK, x - s * 0.03, 1.3, 0, 0, 0, 90 * D, 8);
    });
    m.box(1.72, 0.03, 0.03, stand, 0, 0.3, 0);
    // board with aluminium edge
    m.box(1.7, 1.1, 0.03, board, 0, 1.3, 0);
    m.box(1.72, 0.03, 0.04, frame, 0, 1.865, 0);
    m.box(1.72, 0.03, 0.04, frame, 0, 0.735, 0);
    m.sym(s => m.box(0.03, 1.16, 0.04, frame, s * 0.845, 1.3, 0));
    m.decal(1.62, 1.01, 'of_wb', 0, 1.3, 0.0165);
    // marker tray, markers, eraser
    m.box(0.7, 0.02, 0.08, frame, 0.2, 0.73, 0.05);
    m.box(0.7, 0.03, 0.01, frame, 0.2, 0.745, 0.087);
    [[0.02, 0x2457c8], [0.12, RED], [0.2, BLK]].forEach(([x, c]) => m.cyl(0.009, 0.009, 0.13, c, x, 0.75, 0.055, 0, 0, 90 * D, 6));
    m.box(0.12, 0.035, 0.05, 0x2c3e66, 0.42, 0.757, 0.05);
    m.box(0.12, 0.012, 0.05, 0xd8d2c4, 0.42, 0.734 + 0.012, 0.05);
  },
});

def('office_meeting_table', {
  name: '会议桌',
  cat: 'daily',
  sfx: 'crash',
  fill: 0.35,
  build(m) {
    const wood = 0x9c6b46, base = 0x3a3d44;
    m.box(1.9, 0.04, 1.3, wood, 0, 0.73, 0);
    m.sym(s => m.cyl(0.65, 0.65, 0.04, wood, s * 0.95, 0.73, 0, 0, 0, 0, 16));
    m.box(1.9, 0.02, 1.2, shade(wood, 0.8), 0, 0.7, 0);
    // two slab pedestals
    m.sym(s => {
      m.box(0.12, 0.66, 0.7, base, s * 0.85, 0.36, 0);
      m.box(0.5, 0.03, 0.9, base, s * 0.85, 0.015, 0);
    });
    m.box(1.6, 0.08, 0.06, base, 0, 0.64, 0);
    // cable box with outlets + conference speaker
    m.box(0.42, 0.006, 0.16, 0x4a4e56, 0, 0.752, -0.2);
    for (let i = 0; i < 3; i++) m.box(0.06, 0.004, 0.05, 0xd8dde2, -0.12 + i * 0.12, 0.756, -0.2);
    m.cyl(0.08, 0.11, 0.03, 0x2e3136, 0, 0.765, 0.15, 0, 0, 0, 3);
    m.cyl(0.05, 0.05, 0.006, 0x5a6068, 0, 0.782, 0.15, 0, 0, 0, 10);
    m.glow(1);
    m.box(0.02, 0.006, 0.02, 0x48f08a, 0, 0.784, 0.15);
    m.glow(0);
  },
});

// ================================================================================================
// 售货机 · 咖啡机 · 茶水间
// ================================================================================================
def('office_vending', {
  name: '自动售货机',
  cat: 'daily',
  sfx: 'crash',
  fill: 0.9,
  build(m) {
    const body = 0x2c5a9a, dark = 0x2a2c31, white = 0xf2f1ec, zf = 0.39;
    m.box(0.96, 0.06, 0.74, dark, 0, 0.03, 0);
    m.rbox(1.0, 1.84, 0.78, 0.03, body, 0, 0.98, 0);
    m.box(0.72, 1.26, 0.03, white, -0.1, 1.18, zf);
    m.box(0.22, 0.78, 0.03, 0x3a3d44, 0.39, 1.2, zf);
    m.box(0.94, 0.17, 0.03, white, 0, 1.78, zf);
    m.glow(1);
    m.decal(0.66, 1.18, 'of_vend_front', -0.1, 1.18, zf + 0.017);
    m.decal(0.9, 0.15, 'of_vend_head', 0, 1.78, zf + 0.017);
    m.decal(0.16, 0.5, 'of_vend_panel', 0.39, 1.3, zf + 0.017);
    m.glow(0);
    // glass glare, pickup bin, coin flap
    m.box(0.04, 0.9, 0.004, GLASS_HI, -0.3, 1.25, zf + 0.02, 0, 0, -18 * D);
    m.box(0.66, 0.24, 0.03, dark, -0.1, 0.36, zf);
    m.box(0.58, 0.14, 0.02, 0x4a4e56, -0.1, 0.38, zf + 0.02);
    m.box(0.18, 0.28, 0.02, shade(body, 0.85), 0.39, 0.45, zf + 0.005);
    m.box(0.1, 0.04, 0.02, dark, 0.39, 0.82, zf + 0.02);
  },
});

def('office_coffee_machine', {
  name: '咖啡机',
  cat: 'daily',
  sfx: 'metal',
  fill: 0.7,
  build(m) {
    const body = 0x2f3238, steel = 0xb8bcc2, zc = -0.03, zf = 0.175;
    m.rbox(0.38, 0.42, 0.4, 0.03, body, 0, 0.23, zc);
    m.box(0.36, 0.02, 0.38, DARK, 0, 0.01, zc);
    // bean hopper
    m.cyl(0.075, 0.06, 0.07, 0x6a4a34, -0.08, 0.475, -0.1, 0, 0, 0, 10);
    m.cyl(0.08, 0.08, 0.012, body, -0.08, 0.494, -0.1, 0, 0, 0, 10);
    // front: control panel, spout, niche, drip tray
    m.box(0.36, 0.12, 0.02, steel, 0, 0.37, zf);
    m.glow(1);
    m.decal(0.12, 0.08, 'of_coffee_scr', -0.06, 0.37, zf + 0.0105);
    m.glow(0);
    for (let i = 0; i < 2; i++) m.cyl(0.014, 0.014, 0.01, 0x1c1d21, 0.06 + i * 0.05, 0.37, zf + 0.012, 90 * D, 0, 0, 8);
    m.box(0.24, 0.2, 0.006, 0x1c1d21, 0, 0.19, zf + 0.001);
    m.box(0.11, 0.04, 0.07, steel, 0, 0.29, zf + 0.02);
    m.sym(s => m.cyl(0.007, 0.005, 0.03, steel, s * 0.02, 0.26, zf + 0.04, 0, 0, 0, 6));
    m.box(0.26, 0.03, 0.09, steel, 0, 0.04, zf + 0.03);
    for (let i = 0; i < 4; i++) m.box(0.22, 0.004, 0.006, 0x6a7078, 0, 0.056, zf + 0.0 + i * 0.02);
    // cup of latte on the tray
    m.lathe([[0, 0.058], [0.03, 0.058], [0.036, 0.12], [0, 0.12]], WHT, 0, 0, zf + 0.03, 0, 0, 0, 10);
    m.cyl(0.033, 0.033, 0.004, 0xc89a6a, 0, 0.116, zf + 0.03, 0, 0, 0, 10);
    m.torus(0.016, 0.004, WHT, 0.04, 0.09, zf + 0.03, 0, 0, 0, Math.PI * 2, 4, 8);
    // steam wand
    rod(m, 0.006, steel, [0.17, 0.33, zf - 0.05], [0.2, 0.14, zf - 0.02], 6);
  },
});

def('office_pantry', {
  name: '茶水间吧台',
  cat: 'daily',
  sfx: 'crash',
  fill: 0.8,
  build(m) {
    const carcass = 0xeeeae2, door = 0xa8c0b4, top = 0xe6e2da, steel = 0xc9cdd2, zf = 0.272;
    m.box(2.36, 0.08, 0.56, DARK, 0, 0.04, -0.03);
    m.box(2.4, 0.76, 0.6, carcass, 0, 0.46, -0.025);
    m.box(2.4, 0.04, 0.65, top, 0, 0.86, 0);
    // fronts: drawer stack + three doors
    for (let i = 0; i < 3; i++) {
      m.box(0.57, 0.23, 0.02, door, -0.9, 0.205 + i * 0.245, zf);
      m.box(0.2, 0.02, 0.025, steel, -0.9, 0.29 + i * 0.245, zf + 0.012);
    }
    for (const x of [-0.3, 0.3, 0.9]) {
      m.box(0.57, 0.72, 0.02, door, x, 0.45, zf);
      m.box(0.02, 0.18, 0.025, steel, x + (x > 0 ? -0.24 : 0.24), 0.7, zf + 0.012);
    }
    // sink + gooseneck tap + soap
    const sx = 0.45;
    m.box(0.52, 0.006, 0.42, steel, sx, 0.882, 0);
    m.box(0.44, 0.006, 0.34, 0x8a9096, sx, 0.885, 0);
    m.cyl(0.025, 0.025, 0.004, 0x5a6068, sx, 0.889, 0, 0, 0, 0, 8);
    m.cyl(0.025, 0.03, 0.04, steel, sx, 0.9, -0.24, 0, 0, 0, 8);
    m.tube([[sx, 0.9, -0.24], [sx, 1.12, -0.24], [sx, 1.16, -0.18], [sx, 1.1, -0.11]], 0.013, steel, 6);
    m.box(0.012, 0.05, 0.012, steel, sx + 0.03, 0.95, -0.24, 0, 0, -0.5);
    m.cyl(0.025, 0.025, 0.12, 0x5cae4f, sx + 0.33, 0.94, -0.2, 0, 0, 0, 8);
    m.cyl(0.008, 0.008, 0.03, WHT, sx + 0.33, 1.01, -0.2, 0, 0, 0, 6);
    // microwave
    const mx = -0.6;
    m.box(0.5, 0.28, 0.38, 0xe8e8e4, mx, 1.02, -0.08);
    m.box(0.33, 0.2, 0.01, 0x2a2d33, mx - 0.06, 1.02, 0.11);
    m.box(0.25, 0.14, 0.004, 0x5a4a3a, mx - 0.07, 1.02, 0.116);
    m.box(0.02, 0.18, 0.025, 0xb8bcc2, mx + 0.13, 1.02, 0.118);
    m.box(0.07, 0.22, 0.008, 0xd0d2d0, mx + 0.2, 1.02, 0.114);
    m.glow(1);
    m.box(0.05, 0.022, 0.004, 0x48f08a, mx + 0.2, 1.1, 0.119);
    m.glow(0);
    for (let i = 0; i < 3; i++) m.cyl(0.012, 0.012, 0.006, 0x6a7078, mx + 0.2, 1.04 - i * 0.04, 0.12, 90 * D, 0, 0, 8);
  },
});

// ================================================================================================
// 绿植墙 · 前台
// ================================================================================================
def('office_plant_wall', {
  name: '绿植墙',
  cat: 'plant',
  sfx: 'soft',
  fill: 0.6,
  build(m) {
    const frame = 0x5a4636, back = 0x2f5a36;
    const greens = [0x5cae4f, 0x3f8f4a, 0x7cc35a, 0x4a9a58, 0x2f7a45, 0x8fcf6a];
    m.box(2.26, 2.42, 0.04, back, 0, 1.3, -0.12);
    m.box(2.4, 0.08, 0.16, frame, 0, 2.56, -0.07);
    m.box(2.4, 0.18, 0.24, frame, 0, 0.09, -0.03);
    m.sym(s => m.box(0.08, 2.6, 0.16, frame, s * 1.16, 1.3, -0.07));
    // leaf clumps
    m.jitter(0.12);
    const cols = 10, rows = 11;
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const x = -1.0 + (c + (r % 2) * 0.5) * (2.0 / (cols - 0.5)) + m.rng.range(-0.04, 0.04);
      const y = 0.32 + r * (2.1 / (rows - 1)) + m.rng.range(-0.04, 0.04);
      const s = m.rng.range(0.12, 0.17);
      m.geo(OCTA, m.rng.pick(greens), x, y, m.rng.range(-0.06, 0.0), m.rng.range(-0.5, 0.5), m.rng.range(0, 3), m.rng.range(-0.4, 0.4), s, s * 0.8, s * 0.6);
    }
    // a few big leaves poking out, and trailing ones at the bottom
    for (let i = 0; i < 18; i++) {
      const x = m.rng.range(-1.0, 1.0), y = m.rng.range(0.35, 2.4);
      m.plane(0.12, 0.2, m.rng.pick(greens), x, y, 0.04, m.rng.range(-0.9, -0.3), m.rng.range(-0.6, 0.6), m.rng.range(-1, 1));
    }
    for (let i = 0; i < 7; i++) {
      const x = -0.95 + i * 0.32 + m.rng.range(-0.05, 0.05);
      m.plane(0.1, 0.2, m.rng.pick(greens), x, 0.25, 0.07, 0.2, 0, m.rng.range(-0.3, 0.3));
    }
    m.jitter(0);
    // tiny flowers
    for (let i = 0; i < 14; i++) {
      m.box(0.035, 0.035, 0.035, m.rng.pick([0xf4f2ec, 0xf2c14e, 0xf08fb0]), m.rng.range(-1.0, 1.0), m.rng.range(0.4, 2.35), 0.06, 0.4, 0.6, 0);
    }
    // company logo floating over the leaves
    m.box(1.0, 0.27, 0.02, 0xf4f2ec, 0, 1.62, 0.1);
    m.decal(0.96, 0.24, 'of_logo', 0, 1.62, 0.1105);
  },
});

def('office_front_desk', {
  name: '前台',
  cat: 'daily',
  sfx: 'crash',
  fill: 0.6,
  build(m) {
    const panel = 0xf4f2ec, band = 0xb07a4f, quartz = 0xe8e6e0, kick = 0x3a3d44;
    const R = 4.0, zc = 0.5, n = 5, a0 = Math.asin(1.46 / R);
    // faceted curved front: panel, wood band, kick, high counter
    for (let i = 0; i < n; i++) {
      const ta = -a0 + (2 * a0 * i) / n, tb = -a0 + (2 * a0 * (i + 1)) / n, tm = (ta + tb) / 2;
      const len = 2 * R * Math.sin((tb - ta) / 2) + 0.01;
      const k = Math.cos((tb - ta) / 2);
      const at = (inset) => [(R * k - inset) * Math.sin(tm), zc - R + (R * k - inset) * Math.cos(tm)];
      let [x, z] = at(0.03);
      m.box(len, 0.98, 0.06, panel, x, 0.57, z, 0, tm, 0);
      [x, z] = at(0.025);
      m.box(len, 0.1, 0.06, band, x, 0.35, z, 0, tm, 0);
      [x, z] = at(0.06);
      m.box(len, 0.08, 0.06, kick, x, 0.04, z, 0, tm, 0);
      [x, z] = at(0.14);
      m.box(len + 0.02, 0.05, 0.3, quartz, x, 1.125, z, 0, tm, 0);
      m.glow(1);
      [x, z] = at(0.03);
      m.box(len, 0.012, 0.012, 0xfff0c8, x, 1.093, z + 0.005, 0, tm, 0);
      m.glow(0);
    }
    m.decal(1.2, 0.3, 'of_logo', 0, 0.75, zc + 0.002);
    // side returns and back work surface
    const ex = R * Math.sin(a0) - 0.04, ez = zc - R + R * Math.cos(a0);
    m.sym(s => m.box(0.06, 1.1, ez + 0.5, panel, s * ex, 0.55, (ez - 0.5) / 2));
    m.box(2.8, 0.03, 0.55, WOOD, 0, 0.74, -0.2);
    m.box(2.7, 0.7, 0.02, 0xd8d6d0, 0, 0.38, -0.05);
    // staff monitor (facing back) and a call bell on the counter
    m.box(0.2, 0.012, 0.15, DARK, 0.6, 0.76, -0.3);
    m.box(0.04, 0.3, 0.03, DARK, 0.6, 0.9, -0.28);
    m.box(0.55, 0.34, 0.03, BLK, 0.6, 1.0, -0.3);
    m.box(0.5, 0.29, 0.004, 0x2c4057, 0.6, 1.0, -0.317);
    m.cyl(0.04, 0.045, 0.01, 0x8a8f96, -0.5, 1.155, 0.3, 0, 0, 0, 8);
    m.dome(0.035, 0xe0c060, -0.5, 1.16, 0.3, 1, 0.9, 1, 0, 0, 0, 8);
    m.cyl(0.006, 0.006, 0.02, 0xd8dde2, -0.5, 1.2, 0.3, 0, 0, 0, 6);
  },
});

// ================================================================================================
// 玻璃幕墙 · 玻璃门 · 闸机 · 电梯
// ================================================================================================
def('office_glass_wall', {
  name: '玻璃幕墙',
  cat: 'street',
  sfx: 'glass',
  fill: 0.1,
  build(m) {
    const W = 4.0, H = 3.2, T = 0.12;
    // glass, slightly darker spandrel band at the top
    m.box(W - 0.02, 2.5, 0.02, GLASS, 0, 1.35, 0);
    m.box(W - 0.02, 0.5, 0.02, 0x8fa6b4, 0, 2.85, 0);
    // mullions: half-width on both edges so neighbours join into one
    m.sym(s => m.box(0.03, H, T, MULL, s * (W / 2 - 0.015), H / 2, 0));
    m.box(0.06, H, T, MULL, 0, H / 2, 0);
    m.box(W, 0.1, T, MULL, 0, 0.05, 0);
    m.box(W, 0.06, T, MULL, 0, 2.6, 0);
    m.box(W, 0.08, T, MULL, 0, H - 0.04, 0);
    // glare strips and the dotted safety band
    m.sym(s => {
      glare(m, s * 1.0, 1.35, 1.9, 2.4, 0, 0.0115);
      m.decal(1.84, 0.08, 'of_glass_band', s * 1.0, 1.25, 0.0135);
      m.decal(1.84, 0.08, 'of_glass_band', s * 1.0, 1.25, -0.0135, 0, Math.PI, 0);
    });
  },
});

def('office_glass_door', {
  name: '玻璃门',
  cat: 'street',
  sfx: 'glass',
  fill: 0.15,
  build(m) {
    const frame = 0x8e949b, steel = 0xd0d4d8, W = 2.4, H = 2.6, T = 0.15;
    m.sym(s => m.box(0.08, H, T, frame, s * (W / 2 - 0.04), H / 2, 0));
    m.box(W, 0.22, T, frame, 0, H - 0.11, 0);
    m.box(W, 0.02, T, 0x6a7078, 0, 0.01, 0);
    m.glow(1);
    m.decal(0.8, 0.2, 'of_logo_w', 0, H - 0.11, T / 2 + 0.002);
    m.glow(0);
    // two frameless glass leaves with patch fittings
    m.sym(s => {
      const cx = s * 0.56, lw = 1.08;
      m.box(lw, 2.32, 0.012, GLASS, cx, 1.2, 0);
      m.box(lw, 0.08, 0.03, steel, cx, 0.06, 0);
      m.box(lw, 0.08, 0.03, steel, cx, 2.34, 0);
      glare(m, cx, 1.2, lw, 2.2, 0, 0.0075);
      // long bar handles on both faces
      const hx = s * 0.1;
      for (const zs of [1, -1]) {
        m.cyl(0.016, 0.016, 1.0, steel, hx, 1.05, zs * 0.055, 0, 0, 0, 8);
        for (const y of [0.65, 1.45]) m.cyl(0.01, 0.01, 0.05, steel, hx, y, zs * 0.03, 90 * D, 0, 0, 6);
      }
      m.decal(0.22, 0.11, 'of_push', cx + s * 0.18, 1.35, 0.0095);
      m.decal(0.22, 0.11, 'of_pull', cx + s * 0.18, 1.35, -0.0095, 0, Math.PI, 0);
    });
  },
});

def('office_turnstile', {
  name: '闸机',
  cat: 'street',
  sfx: 'metal',
  fill: 0.35,
  build(m) {
    const steel = 0xc9cdd2, top = 0x2a2d33, flapG = 0xc8dde8, zc = -0.12;
    // pedestal with rounded ends and a dark glass top
    m.box(1.0, 0.95, 0.2, steel, 0, 0.475, zc);
    m.sym(s => m.cyl(0.1, 0.1, 0.95, steel, s * 0.5, 0.475, zc, 0, 0, 0, 10));
    m.box(1.0, 0.05, 0.22, top, 0, 0.975, zc);
    m.sym(s => m.cyl(0.11, 0.11, 0.05, top, s * 0.5, 0.975, zc, 0, 0, 0, 10));
    m.box(1.0, 0.04, 0.01, 0x9aa0a6, 0, 0.05, zc + 0.1);
    m.glow(1);
    m.box(1.0, 0.012, 0.012, 0x5ab4ff, 0, 0.94, zc + 0.1);
    m.decal(0.12, 0.12, 'of_turn_reader', 0.38, 1.0005, zc, -90 * D, 0, 0);
    m.decal(0.12, 0.12, 'of_turn_reader', -0.38, 1.0005, zc, -90 * D, 0, 0);
    m.decal(0.1, 0.1, 'of_turn_go', 0.601, 0.8, zc, 0, 90 * D, 0);
    m.decal(0.1, 0.1, 'of_turn_stop', -0.601, 0.8, zc, 0, -90 * D, 0);
    m.glow(0);
    // glass wing flap sticking out into the lane (+Z)
    const z0 = zc + 0.1;
    m.box(0.06, 0.4, 0.02, 0x4a4e56, 0, 0.66, z0 + 0.005);
    m.push(0, 0, z0, 0, -90 * D, 0);
    m.extrude([[0, 0.45], [0.26, 0.48], [0.33, 0.58], [0.33, 0.74], [0.26, 0.86], [0, 0.88]], 0.015, flapG, 0, 0, 0);
    m.box(0.01, 0.36, 0.02, 0x5ab4ff, 0.33, 0.66, 0);
    m.pop();
  },
});

def('office_elevator', {
  name: '电梯',
  cat: 'street',
  sfx: 'crash',
  fill: 0.7,
  build(m) {
    const steel = 0xb8bec4, dk = 0x8e949b, W = 2.2, H = 2.8, Dp = 1.6, zf = Dp / 2 - 0.03;
    // shell
    m.box(W, H, 0.06, steel, 0, H / 2, -Dp / 2 + 0.03);
    m.sym(s => m.box(0.06, H, Dp, steel, s * (W / 2 - 0.03), H / 2, 0));
    m.box(W, 0.08, Dp, steel, 0, H - 0.04, 0);
    m.box(W, 0.09, Dp, dk, 0, 0.045, 0);
    m.box(0.6, 0.012, 0.6, dk, 0.4, H + 0.004, -0.3); // roof hatch
    // front wall with door opening 1.1 × 2.2
    m.sym(s => {
      m.box(0.55, H, 0.06, steel, s * 0.825, H / 2, zf);
      m.box(0.06, 2.26, 0.08, dk, s * 0.58, 1.13, zf + 0.01); // jambs
    });
    m.box(1.22, 0.06, 0.08, dk, 0, 2.23, zf + 0.01);
    m.box(1.1, H - 2.2, 0.06, steel, 0, 2.2 + (H - 2.2) / 2, zf);
    m.box(1.2, 0.02, 0.12, dk, 0, 0.1, zf);
    // half-open door leaves just behind the front wall
    m.sym(s => {
      m.box(0.55, 2.2, 0.03, 0xc9cdd2, s * 0.62, 1.19, zf - 0.05);
      m.decal(0.5, 2.1, 'of_brushed', s * 0.62, 1.19, zf - 0.034);
    });
    // interior: warm walls, mirror, handrail, lit ceiling, button panel
    m.box(W - 0.14, 0.01, Dp - 0.14, 0x5a5e66, 0, 0.095, 0);
    m.box(W - 0.14, 2.2, 0.01, 0xd8d2c4, 0, 1.2, -Dp / 2 + 0.065);
    m.sym(s => m.box(0.01, 2.2, Dp - 0.2, 0xd8d2c4, s * (W / 2 - 0.065), 1.2, 0));
    m.box(1.4, 1.1, 0.012, 0xa9c3cf, 0, 1.45, -Dp / 2 + 0.075);
    m.box(1.6, 0.04, 0.04, STEEL, 0, 0.9, -Dp / 2 + 0.12);
    m.box(0.02, 0.5, 0.18, dk, W / 2 - 0.075, 1.25, 0.45);
    m.glow(1);
    m.box(1.6, 0.02, 1.0, 0xfff2d0, 0, H - 0.09, 0);
    for (let i = 0; i < 4; i++) m.box(0.012, 0.04, 0.04, 0xffd070, W / 2 - 0.088, 1.1 + i * 0.09, 0.45);
    // outside: floor display and call buttons
    m.decal(0.44, 0.18, 'of_lift_disp', 0, 2.5, zf + 0.032);
    m.glow(0);
    m.box(0.1, 0.22, 0.012, STEEL, 0.78, 1.15, zf + 0.035);
    m.glow(1);
    m.cyl(0.022, 0.022, 0.01, 0xffd070, 0.78, 1.2, zf + 0.043, 90 * D, 0, 0, 8);
    m.glow(0);
    m.cyl(0.022, 0.022, 0.01, 0xe8e8e4, 0.78, 1.1, zf + 0.043, 90 * D, 0, 0, 8);
  },
});

// ================================================================================================
// 外卖柜 · 文件柜
// ================================================================================================
def('office_takeout_locker', {
  name: '外卖柜',
  cat: 'street',
  sfx: 'metal',
  fill: 0.7,
  build(m) {
    const body = 0xeef0ee, org = ORANGE, zc = -0.13, Dc = 0.44, zf = zc + Dc / 2;
    m.box(1.56, 0.08, Dc - 0.04, DARK, 0, 0.04, zc);
    m.box(1.6, 1.6, Dc, body, 0, 0.88, zc);
    m.box(1.62, 0.12, Dc + 0.04, org, 0, 1.74, zc);
    m.decal(1.5, 0.11, 'of_tl_head', 0, 1.74, zf + 0.021);
    // grid of doors: 5 columns × 6 rows, screen in the middle column
    const cw = 0.3, rh = 0.235, y0 = 0.12;
    const open = { '0,2': 100, '3,4': 70 };
    for (let c = 0; c < 5; c++) for (let r = 0; r < 6; r++) {
      const x = (c - 2) * cw, y = y0 + rh * (r + 0.5);
      if (c === 2 && (r === 3 || r === 4)) continue;
      const ang = open[c + ',' + r];
      if (!ang) { m.decal(cw - 0.02, rh - 0.02, 'of_tl_door', x, y, zf + 0.002); continue; }
      // open compartment: dark hole, takeout bag, door swung out on its left hinge
      m.box(cw - 0.02, rh - 0.02, 0.006, 0x2a2d33, x, y, zf + 0.002);
      m.box(0.16, 0.13, 0.14, c ? 0xf2c14e : 0x3a8fd8, x, y - 0.04, zf - 0.03);
      m.box(0.14, 0.03, 0.12, WHT, x, y + 0.035, zf - 0.03);
      m.push(x - (cw - 0.02) / 2, y, zf + 0.01, 0, -ang * D, 0);
      m.box(cw - 0.02, rh - 0.02, 0.012, body, (cw - 0.02) / 2, 0, 0);
      m.decal(cw - 0.02, rh - 0.02, 'of_tl_door', (cw - 0.02) / 2, 0, 0.0065);
      m.pop();
    }
    m.box(cw - 0.02, rh * 2 - 0.02, 0.02, 0x3a3d44, 0, y0 + rh * 4, zf + 0.01);
    m.glow(1);
    m.decal(0.18, 0.27, 'of_tl_screen', 0, y0 + rh * 4 + 0.05, zf + 0.0205);
    m.glow(0);
    m.box(0.08, 0.04, 0.03, 0x1c1d21, 0, y0 + rh * 3 + 0.06, zf + 0.025);
  },
});

def('office_cabinet', {
  name: '文件柜',
  cat: 'daily',
  sfx: 'metal',
  fill: 0.9,
  build(m) {
    const metal = 0xb8bec4, front = 0xc9ced3, zc = -0.04, zf = zc + 0.2;
    m.box(0.88, 0.04, 0.38, DARK, 0, 0.02, zc);
    m.box(0.9, 1.26, 0.4, metal, 0, 0.67, zc);
    m.box(0.92, 0.02, 0.42, shade(metal, 0.9), 0, 1.29, zc);
    m.cyl(0.014, 0.014, 0.01, 0xd8b84a, 0.38, 1.24, zf + 0.004, 90 * D, 0, 0, 8);
    // four drawers, the second one pulled open with hanging files
    for (let i = 0; i < 4; i++) {
      const y = 0.2 + i * 0.29, out = i === 2 ? 0.11 : 0;
      const z = zf + 0.01 + out;
      if (out) {
        m.box(0.8, 0.22, out, metal, 0, y - 0.01, zf + out / 2);
        const fc = [0x5aa9e6, 0xf2c14e, 0x5cae4f, 0xe8554a, 0xf2a14a];
        for (let k = 0; k < 5; k++) m.box(0.76, 0.18, 0.006, fc[k], 0, y + 0.04, zf + 0.012 + k * 0.018);
      }
      m.box(0.86, 0.27, 0.02, front, 0, y, z);
      m.box(0.32, 0.03, 0.03, 0x8e949b, 0, y - 0.06, z + 0.02);
      m.box(0.13, 0.06, 0.006, 0x8e949b, 0, y + 0.06, z + 0.012);
      m.decal(0.11, 0.045, 'of_cab_' + (3 - i), 0, y + 0.06, z + 0.016);
    }
  },
});
