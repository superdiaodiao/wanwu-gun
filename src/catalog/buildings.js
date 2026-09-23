// 建筑 · 地标 — residential blocks, shop-houses, public buildings, traditional Chinese architecture and
// big structures (decal prefix bd_). Metres, +Y up, base on y = 0, centred on x = z = 0, entrance faces +Z.
//
// Repeated facade parts (window panes, frames, AC grilles, louvres, bars) are collected per model in
// Quads batches (2 tris each, one geo call per colour) so tall buildings stay inside their budgets.
// Shared helpers: Quads / winKit (window grids, ~1/3 warm lit under glow 0.8), acUnit, laundry, plantPot,
// solarHeater, waterTank, roofLoft (Chinese roofs with concave slopes + upturned, flared corners),
// gableRoof, beam / rod (lattice members between two points), shopHouse (the nine shop-houses).
import * as THREE from 'three';
import { def } from './registry.js';
import { D, shade, mix } from '../core/modeler.js';
import { decal, fitText, verticalText, FONTS, getUV } from '../core/atlas.js';

// the shared font loader only requests a sample of glyphs; ask for the ones our signs use as well
if (typeof document !== 'undefined' && document.fonts && document.fonts.load) {
  const glyphs = '牛肉面幸福广场小学里大厦平安药店便民超市家常饭店包子铺水果奶茶理发五金天增岁月人寿春满乾坤门万象更新雄宝殿安全第一节约用水摩天轮好学习向上卫外来车辆请登记单元';
  document.fonts.load('40px "Ma Shan Zheng"', glyphs).catch(() => {});
  document.fonts.load('40px "ZCOOL KuaiLe"', '欢乐购物节全场五折幸福建工').catch(() => {});
}

// ---- palette ----------------------------------------------------------------------------------
const C = {
  tile: 0xf1ece1, tile2: 0xeadcc4, pinkTile: 0xecc9b5, stone: 0xcdb9a4, base: 0xa99684,
  band: 0xf8f5ee, accent: 0xc8765a, grey: 0x9aa0a6, dgrey: 0x5b6068, concrete: 0xc9c4b8,
  glass: 0x6aa7b4, glass2: 0x4f8b9b, glassL: 0x9fd0d8, lit: 0xffe3a0, lit2: 0xffcf86,
  frame: 0xf4f2ec, void: 0x4a4b52, red: 0xd8342c, dred: 0xa8281f, vermilion: 0xe8554a,
  gold: 0xf2c14e, wood: 0xb07a4f, roofGrey: 0x747c86, glaze: 0xf0b83a, teal: 0x2aa198,
  leaf: 0x5cae4f, deepGreen: 0x3f8f4a, ink: 0x26262c, white: 0xf4f2ec, metal: 0xb8bcc2,
  ac: 0xe9e9e3, navy: 0x2c3e66, sky: 0x5aa9e6, orange: 0xf2a14a, brown: 0x8b5a3c,
};
const CLOTH = [0xe8554a, 0x5aa9e6, 0xf2c14e, 0xf4f2ec, 0xf08fb0, 0x5cae4f, 0x2c3e66, 0xf2a14a, 0x9a6fc0];
const lerp = (a, b, t) => a + (b - a) * t;

// ---- decals -----------------------------------------------------------------------------------
function outlinedText(ctx, text, cx, cy, maxW, maxH, font, fill, stroke, lw) {
  let px = maxH;
  ctx.font = `bold ${px}px ${font}`;
  const tw = ctx.measureText(text).width;
  if (tw > maxW) px = Math.max(6, Math.floor((px * maxW) / tw));
  ctx.font = `bold ${px}px ${font}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = stroke;
  ctx.lineWidth = lw;
  ctx.strokeText(text, cx, cy + px * 0.04);
  ctx.fillStyle = fill;
  ctx.fillText(text, cx, cy + px * 0.04);
}

decal('bd_fu', 64, 64, (ctx, w, h) => {
  ctx.save();
  ctx.translate(w / 2, h / 2);
  ctx.rotate(Math.PI / 4);
  const s = w * 0.66;
  ctx.fillStyle = '#d8342c';
  ctx.fillRect(-s / 2, -s / 2, s, s);
  ctx.strokeStyle = '#f2c14e';
  ctx.lineWidth = 2.5;
  ctx.strokeRect(-s / 2 + 3, -s / 2 + 3, s - 6, s - 6);
  ctx.restore();
  fitText(ctx, '福', w / 2, h / 2, w * 0.5, h * 0.5, FONTS.brush, '#2a1a12');
});
const couplet = (key, text) => decal(key, 24, 132, (ctx, w, h) => {
  ctx.fillStyle = '#d42e28';
  ctx.fillRect(0, 0, w, h);
  verticalText(ctx, text, w / 2, h / 2, w - 5, h - 8, FONTS.brush, '#2a1a12');
});
couplet('bd_cl_r', '天增岁月人增寿'); // 上联 — right of the door
couplet('bd_cl_l', '春满乾坤福满门'); // 下联 — left of the door
decal('bd_hp', 100, 26, (ctx, w, h) => {
  ctx.fillStyle = '#d42e28';
  ctx.fillRect(0, 0, w, h);
  fitText(ctx, '万象更新', w / 2, h / 2, w - 10, h - 6, FONTS.brush, '#2a1a12');
});
for (let i = 1; i <= 3; i++) {
  decal('bd_unit' + i, 56, 24, (ctx, w, h) => {
    ctx.fillStyle = '#2d5ea8';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#e8eefc';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(2, 2, w - 4, h - 4);
    fitText(ctx, i + '单元', w / 2, h / 2, w - 10, h - 8, FONTS.sans, '#f4f7ff');
  });
}
decal('bd_ac', 64, 44, (ctx, w, h) => {
  ctx.fillStyle = '#eeeee8';
  ctx.fillRect(0, 0, w, h);
  const cx = w * 0.37, cy = h / 2, r = h * 0.39;
  ctx.fillStyle = '#8f949c';
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#d9dad6';
  ctx.lineWidth = 1.4;
  for (let i = -3; i <= 3; i++) { ctx.beginPath(); ctx.moveTo(cx - r, cy + i * r * 0.28); ctx.lineTo(cx + r, cy + i * r * 0.28); ctx.stroke(); }
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = '#4a4e56';
  ctx.beginPath(); ctx.arc(cx, cy, 3, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#c4c6c2';
  for (let i = 0; i < 6; i++) ctx.fillRect(w * 0.74, 7 + i * 5.3, w * 0.2, 2.4);
});
decal('bd_solar', 64, 48, (ctx, w, h) => {
  ctx.fillStyle = '#c9cdd3';
  ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 10; i++) {
    const x = 2 + i * 6.1;
    ctx.fillStyle = '#1f2f4f'; ctx.fillRect(x, 2, 4.4, h - 4);
    ctx.fillStyle = '#5a78a6'; ctx.fillRect(x + 1, 3, 1.2, h - 6);
  }
});
decal('bd_bars', 64, 64, (ctx, w, h) => {
  ctx.fillStyle = '#5f646c';
  for (let i = 0; i < 9; i++) ctx.fillRect(1 + i * 7.6, 0, 3, h);
  ctx.fillRect(0, 0, w, 4); ctx.fillRect(0, h - 4, w, 4); ctx.fillRect(0, h * 0.5 - 1.5, w, 3);
});
decal('bd_louver', 32, 32, (ctx, w, h) => {
  ctx.fillStyle = '#c2c5c8';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#7d828a';
  for (let y = 1; y < h; y += 5) ctx.fillRect(0, y, w, 2);
  ctx.fillRect(0, 0, 2, h); ctx.fillRect(w - 2, 0, 2, h);
});
decal('bd_rail', 64, 32, (ctx, w, h) => {
  ctx.fillStyle = '#f4f2ec';
  ctx.fillRect(0, 0, w, 4); ctx.fillRect(0, h - 3, w, 3);
  for (let x = 1; x < w; x += 5.3) ctx.fillRect(x, 0, 1.8, h);
});
decal('bd_shirt', 40, 40, (ctx, w, h) => {
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(w * 0.32, 1); ctx.lineTo(w * 0.68, 1); ctx.lineTo(w - 1, h * 0.24); ctx.lineTo(w * 0.86, h * 0.44);
  ctx.lineTo(w * 0.76, h * 0.38); ctx.lineTo(w * 0.76, h - 1); ctx.lineTo(w * 0.24, h - 1); ctx.lineTo(w * 0.24, h * 0.38);
  ctx.lineTo(w * 0.14, h * 0.44); ctx.lineTo(1, h * 0.24);
  ctx.closePath(); ctx.fill();
});
decal('bd_pants', 32, 48, (ctx, w, h) => {
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(2, 1); ctx.lineTo(w - 2, 1); ctx.lineTo(w - 1, h - 1); ctx.lineTo(w * 0.58, h - 1); ctx.lineTo(w * 0.5, h * 0.3);
  ctx.lineTo(w * 0.42, h - 1); ctx.lineTo(1, h - 1);
  ctx.closePath(); ctx.fill();
});
decal('bd_tiles', 32, 32, (ctx, w, h) => {
  ctx.fillStyle = '#e2e2e2';
  ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 4; i++) {
    ctx.fillStyle = '#ffffff'; ctx.fillRect(i * 8 + 1, 0, 4, h);
    ctx.fillStyle = '#b4b4b4'; ctx.fillRect(i * 8 + 6, 0, 1.6, h);
  }
  ctx.fillStyle = 'rgba(0,0,0,0.10)';
  for (let y = 0; y < h; y += 8) ctx.fillRect(0, y, w, 1);
});
decal('bd_tile_ends', 64, 16, (ctx, w, h) => {
  ctx.fillStyle = '#d4d4d4';
  ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 4; i++) {
    ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(8 + i * 16, h / 2, 6, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#9a9a9a'; ctx.beginPath(); ctx.arc(8 + i * 16, h / 2, 2.4, 0, Math.PI * 2); ctx.fill();
  }
});
decal('bd_lattice', 32, 128, (ctx, w, h) => {
  // one tall 格扇 door leaf: lattice panel on top, carved skirt panel below
  ctx.fillStyle = '#a3291f';
  ctx.fillRect(0, 0, w, h);
  const x0 = 4, y0 = 5, pw = w - 8, ph = h * 0.6;
  ctx.fillStyle = '#4a1712';
  ctx.fillRect(x0, y0, pw, ph);
  ctx.save();
  ctx.beginPath(); ctx.rect(x0, y0, pw, ph); ctx.clip();
  ctx.strokeStyle = '#e0b96a';
  ctx.lineWidth = 1.5;
  for (let i = -20; i < 24; i++) {
    ctx.beginPath(); ctx.moveTo(x0 + i * 5, y0); ctx.lineTo(x0 + i * 5 + ph, y0 + ph); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x0 + i * 5, y0); ctx.lineTo(x0 + i * 5 - ph, y0 + ph); ctx.stroke();
  }
  ctx.restore();
  ctx.fillStyle = '#e0b96a';
  ctx.fillRect(x0, h * 0.66, pw, 2);
  ctx.strokeStyle = '#e0b96a';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(x0 + 2, h * 0.72, pw - 4, h * 0.2);
});
decal('bd_dougong', 128, 24, (ctx, w, h) => {
  // a row of bracket sets (斗拱): green-blue arms, red blocks, gold outlines
  ctx.fillStyle = '#7a1f18';
  ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 4; i++) {
    const cx = 16 + i * 32;
    ctx.fillStyle = '#2f7f86'; ctx.fillRect(cx - 13, 3, 26, 6);
    ctx.fillStyle = '#3f9a64'; ctx.fillRect(cx - 9, 10, 18, 6);
    ctx.fillStyle = '#2f7f86'; ctx.fillRect(cx - 5, 17, 10, 6);
    ctx.strokeStyle = '#f2c14e'; ctx.lineWidth = 1;
    ctx.strokeRect(cx - 13, 3, 26, 6); ctx.strokeRect(cx - 9, 10, 18, 6); ctx.strokeRect(cx - 5, 17, 10, 6);
  }
});
decal('bd_pagoda_door', 32, 48, (ctx, w, h) => {
  ctx.fillStyle = '#e0b96a';
  ctx.beginPath(); ctx.moveTo(1, h); ctx.lineTo(1, w / 2); ctx.arc(w / 2, w / 2, w / 2 - 1, Math.PI, 0); ctx.lineTo(w - 1, h); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#3a1510';
  ctx.beginPath(); ctx.moveTo(5, h); ctx.lineTo(5, w / 2 + 1); ctx.arc(w / 2, w / 2 + 1, w / 2 - 5, Math.PI, 0); ctx.lineTo(w - 5, h); ctx.closePath(); ctx.fill();
});
decal('bd_bridge', 128, 40, (ctx, w, h) => {
  ctx.fillStyle = '#b9b5a8'; ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = '#8f8b80'; ctx.lineWidth = 3; ctx.strokeRect(3, 3, w - 6, h - 6);
  fitText(ctx, '幸福桥', w / 2, h / 2, w - 24, h - 12, FONTS.brush, '#5a3a24');
});
decal('bd_caihua', 128, 24, (ctx, w, h) => {
  ctx.fillStyle = '#1f6f78';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#2b4f9e';
  ctx.fillRect(0, 0, w * 0.2, h); ctx.fillRect(w * 0.8, 0, w * 0.2, h);
  ctx.fillStyle = '#3f9a64';
  ctx.beginPath(); ctx.ellipse(w / 2, h / 2, w * 0.2, h * 0.34, 0, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#f2c14e';
  ctx.lineWidth = 1.6;
  ctx.stroke();
  ctx.strokeRect(1, 1, w - 2, h - 2);
  for (const x of [w * 0.1, w * 0.9]) {
    ctx.beginPath(); ctx.arc(x, h / 2, h * 0.3, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = '#f2c14e'; ctx.beginPath(); ctx.arc(x, h / 2, 2, 0, Math.PI * 2); ctx.fill();
  }
  ctx.beginPath(); ctx.moveTo(w * 0.2, 2); ctx.lineTo(w * 0.26, h / 2); ctx.lineTo(w * 0.2, h - 2); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(w * 0.8, 2); ctx.lineTo(w * 0.74, h / 2); ctx.lineTo(w * 0.8, h - 2); ctx.stroke();
});
const plaque = (key, text, w0, h0, bg, fg, frame) => decal(key, w0, h0, (ctx, w, h) => {
  ctx.fillStyle = frame; ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = bg; ctx.fillRect(6, 6, w - 12, h - 12);
  ctx.strokeStyle = fg; ctx.lineWidth = 2; ctx.strokeRect(10, 10, w - 20, h - 20);
  fitText(ctx, text, w / 2, h / 2, w - 34, h - 26, FONTS.brush, fg);
});
plaque('bd_temple', '大雄宝殿', 224, 72, '#1d3b78', '#f2c94e', '#c9962f');
plaque('bd_arch', '幸福里', 200, 76, '#1d3b78', '#f2c94e', '#b8322a');
plaque('bd_gate', '幸福里', 256, 84, '#7a2a1c', '#f6d36b', '#5a3a24');
decal('bd_guard', 64, 26, (ctx, w, h) => {
  ctx.fillStyle = '#2d5ea8'; ctx.fillRect(0, 0, w, h);
  fitText(ctx, '门卫', w / 2, h / 2, w - 10, h - 6, FONTS.sans, '#ffffff');
});
decal('bd_carsign', 96, 48, (ctx, w, h) => {
  ctx.fillStyle = '#f4f2ec'; ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = '#d8342c'; ctx.lineWidth = 3; ctx.strokeRect(2, 2, w - 4, h - 4);
  fitText(ctx, '外来车辆', w / 2, h * 0.34, w - 16, h * 0.3, FONTS.sans, '#d8342c');
  fitText(ctx, '请登记', w / 2, h * 0.7, w - 16, h * 0.3, FONTS.sans, '#d8342c');
});

// shop signboards (门头) in calligraphy
function signDecal(key, text, sub, bg, fg, edge) {
  decal(key, 336, 80, (ctx, w, h) => {
    ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = edge; ctx.lineWidth = 3.5; ctx.strokeRect(5, 5, w - 10, h - 10);
    fitText(ctx, [...text].join(text.length <= 3 ? ' ' : ''), w / 2, h * 0.4, w * 0.8, h * 0.56, FONTS.brush, fg);
    fitText(ctx, sub, w / 2, h * 0.83, w * 0.7, h * 0.13, FONTS.sans, edge);
  });
}
signDecal('bd_sign_baozi', '包子铺', '鲜肉包 · 豆沙包 · 豆浆油条', '#c62f28', '#ffe9a8', '#ffd36b');
signDecal('bd_sign_fruit', '水果店', '新鲜水果 · 天天特价', '#2f8f3e', '#fff6d6', '#ffe36b');
signDecal('bd_sign_tea', '奶茶店', '珍珠奶茶 · 鲜果茶 · 冰沙', '#f7c3cf', '#7a3b2e', '#b0564a');
signDecal('bd_sign_barber', '理发店', '洗 · 剪 · 吹 · 烫 · 染', '#1f4f9e', '#ffffff', '#9cc4ff');
signDecal('bd_sign_super', '便民超市', '烟酒 · 日用 · 百货 · 24小时', '#e03a2f', '#ffffff', '#ffe36b');
signDecal('bd_sign_pharm', '平安药店', '医保定点 · 24小时售药', '#1f8f56', '#ffffff', '#c8f0d8');
signDecal('bd_sign_hw', '五金店', '水电 · 工具 · 配钥匙', '#f2c14e', '#1d3f7a', '#1d3f7a');
signDecal('bd_sign_noodle', '牛肉面', '拉面 · 刀削面 · 盖浇饭', '#16806f', '#ffffff', '#bff0e4');
signDecal('bd_sign_rest', '幸福饭店', '家常菜 · 宴席 · 外卖', '#b2231d', '#f6d36b', '#f6d36b');

function awningDecal(key, c1, c2) {
  decal(key, 64, 40, (ctx, w, h) => {
    const n = 8, sw = w / n, band = h * 0.72;
    for (let i = 0; i < n; i++) {
      ctx.fillStyle = i % 2 ? c2 : c1;
      ctx.fillRect(i * sw, 0, sw + 0.5, band);
      ctx.beginPath(); ctx.arc(i * sw + sw / 2, band - 0.5, sw / 2, 0, Math.PI); ctx.fill();
    }
  });
}
awningDecal('bd_awn_red', '#d8342c', '#f6efe0');
awningDecal('bd_awn_green', '#3f8f4a', '#f6efe0');
awningDecal('bd_awn_blue', '#2f63c9', '#f6efe0');
awningDecal('bd_awn_orange', '#f2a14a', '#f6efe0');
awningDecal('bd_awn_pink', '#f08fb0', '#fff6f8');
awningDecal('bd_awn_yellow', '#f2c14e', '#2c3e66');
decal('bd_barber', 32, 64, (ctx, w, h) => {
  const cols = ['#d8342c', '#f4f2ec', '#2c5aa0', '#f4f2ec'];
  const b = 8;
  for (let k = -12; k < 12; k++) {
    ctx.fillStyle = cols[((k % 4) + 4) % 4];
    ctx.beginPath();
    ctx.moveTo(0, k * b); ctx.lineTo(w, k * b + w); ctx.lineTo(w, k * b + w + b + 0.5); ctx.lineTo(0, k * b + b + 0.5);
    ctx.closePath(); ctx.fill();
  }
});
decal('bd_mall', 416, 98, (ctx, w, h) => {
  outlinedText(ctx, '幸福广场', w / 2, h / 2, w - 16, h - 12, FONTS.brush, '#e0302a', '#fff4d6', 7);
});
decal('bd_screen', 192, 108, (ctx, w, h) => {
  const g = ctx.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, '#ff6f91'); g.addColorStop(1, '#ffc75f');
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  // the game's own ball, stuck all over with little things
  const bx = w * 0.19, by = h * 0.55;
  ctx.fillStyle = '#5aa9e6'; ctx.beginPath(); ctx.arc(bx, by, 24, 0, Math.PI * 2); ctx.fill();
  const dots = ['#f2c14e', '#e8554a', '#5cae4f', '#f4f2ec', '#9a6fc0'];
  for (let i = 0; i < 9; i++) {
    const a = i * 0.7, r = 21 + (i % 3) * 3;
    ctx.fillStyle = dots[i % 5];
    ctx.beginPath(); ctx.arc(bx + Math.cos(a) * r, by + Math.sin(a) * r, 4 + (i % 3), 0, Math.PI * 2); ctx.fill();
  }
  fitText(ctx, '欢乐购物节', w * 0.68, h * 0.36, w * 0.56, 26, FONTS.round, '#ffffff');
  fitText(ctx, '全场五折', w * 0.68, h * 0.7, w * 0.46, 22, FONTS.round, '#fff6c0');
});
decal('bd_office', 256, 56, (ctx, w, h) => {
  outlinedText(ctx, '幸福大厦', w / 2, h / 2, w - 12, h - 8, FONTS.sans, '#fff2c4', '#8a6a2a', 3);
});
decal('bd_heli', 64, 64, (ctx, w, h) => {
  ctx.fillStyle = '#4a4e56'; ctx.beginPath(); ctx.arc(w / 2, h / 2, w / 2 - 1, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#f2c14e'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(w / 2, h / 2, w / 2 - 6, 0, Math.PI * 2); ctx.stroke();
  fitText(ctx, 'H', w / 2, h / 2, w * 0.5, h * 0.55, FONTS.sans, '#f4f2ec');
});
decal('bd_zigzag', 64, 32, (ctx, w, h) => {
  ctx.strokeStyle = '#d9dde2';
  ctx.lineWidth = 3;
  for (let x = -16; x < w + 16; x += 16) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + 16, h); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x + 16, 0); ctx.lineTo(x, h); ctx.stroke();
  }
  ctx.fillStyle = '#d9dde2';
  ctx.fillRect(0, 0, w, 3); ctx.fillRect(0, h - 3, w, 3);
  for (let x = 0; x < w; x += 16) ctx.fillRect(x, 0, 2.5, h);
});
decal('bd_danger', 64, 44, (ctx, w, h) => {
  ctx.fillStyle = '#f4f2ec'; ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = '#d8342c'; ctx.lineWidth = 3; ctx.strokeRect(2, 2, w - 4, h - 4);
  ctx.fillStyle = '#d8342c';
  ctx.beginPath(); ctx.moveTo(14, 6); ctx.lineTo(8, 22); ctx.lineTo(13, 22); ctx.lineTo(9, 38); ctx.lineTo(19, 18); ctx.lineTo(14, 18); ctx.lineTo(18, 6); ctx.closePath(); ctx.fill();
  fitText(ctx, '高压', 42, h * 0.32, 38, 15, FONTS.sans, '#d8342c');
  fitText(ctx, '危险', 42, h * 0.7, 38, 15, FONTS.sans, '#d8342c');
});
decal('bd_paperwin', 48, 40, (ctx, w, h) => {
  // red window lattice with see-through cells (a lit paper pane sits behind it)
  ctx.fillStyle = '#a3291f';
  ctx.fillRect(0, 0, w, 4); ctx.fillRect(0, h - 4, w, 4); ctx.fillRect(0, 0, 4, h); ctx.fillRect(w - 4, 0, 4, h);
  for (let x = 10; x < w - 4; x += 8) ctx.fillRect(x, 0, 2, h);
  for (let y = 10; y < h - 4; y += 8) ctx.fillRect(0, y, w, 2);
});
decal('bd_quilt', 64, 48, (ctx, w, h) => {
  ctx.fillStyle = '#d8342c'; ctx.fillRect(0, 0, w, h);
  const flower = (x, y, r, c) => {
    ctx.fillStyle = c;
    for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2; ctx.beginPath(); ctx.arc(x + Math.cos(a) * r, y + Math.sin(a) * r, r * 0.75, 0, Math.PI * 2); ctx.fill(); }
    ctx.fillStyle = '#f2c14e'; ctx.beginPath(); ctx.arc(x, y, r * 0.55, 0, Math.PI * 2); ctx.fill();
  };
  flower(16, 14, 6, '#f08fb0'); flower(46, 30, 7, '#f6b3c9'); flower(20, 38, 5, '#f6b3c9'); flower(52, 8, 4, '#f08fb0');
  ctx.fillStyle = '#3f8f4a';
  for (const [x, y] of [[28, 20], [36, 38], [8, 28], [58, 42]]) { ctx.beginPath(); ctx.ellipse(x, y, 4, 2, 0.6, 0, Math.PI * 2); ctx.fill(); }
});
decal('bd_net', 64, 64, (ctx, w, h) => {
  ctx.fillStyle = '#2f8a48'; ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = 'rgba(0,0,0,0.12)';
  for (let y = 0; y < h; y += 3) ctx.fillRect(0, y, w, 1);
  ctx.fillStyle = '#4fae62';
  for (let i = 0; i <= 4; i++) { ctx.fillRect(i * 16 - 1, 0, 2, h); ctx.fillRect(0, i * 16 - 1, w, 2); }
});
decal('bd_school', 320, 70, (ctx, w, h) => {
  outlinedText(ctx, '幸福小学', w / 2, h / 2, w - 14, h - 8, FONTS.brush, '#d8342c', '#fff2c4', 5);
});
decal('bd_slogan', 400, 38, (ctx, w, h) => {
  ctx.fillStyle = '#d8342c'; ctx.fillRect(0, 0, w, h);
  fitText(ctx, '好好学习   天天向上', w / 2, h / 2, w - 30, h - 12, FONTS.sans, '#fff6d6');
});
decal('bd_clock', 48, 48, (ctx, w, h) => {
  ctx.fillStyle = '#f4f2ec'; ctx.beginPath(); ctx.arc(w / 2, h / 2, w / 2 - 1, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#2c3e66'; ctx.lineWidth = 3; ctx.stroke();
  ctx.fillStyle = '#2c3e66';
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    ctx.fillRect(w / 2 + Math.cos(a) * 17 - 1.5, h / 2 + Math.sin(a) * 17 - 1.5, 3, 3);
  }
  ctx.lineWidth = 3; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(w / 2, h / 2); ctx.lineTo(w / 2, h / 2 - 14); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(w / 2, h / 2); ctx.lineTo(w / 2 + 10, h / 2 + 3); ctx.stroke();
});
decal('bd_safety', 224, 48, (ctx, w, h) => {
  ctx.fillStyle = '#d8342c'; ctx.fillRect(0, 0, w, h);
  fitText(ctx, '安全第一', w / 2, h / 2, w - 20, h - 10, FONTS.sans, '#ffe36b');
});
decal('bd_water', 192, 40, (ctx, w, h) => {
  ctx.fillStyle = '#f4f2ec'; ctx.fillRect(0, 0, w, h);
  fitText(ctx, '节约用水', w / 2, h / 2, w - 20, h - 8, FONTS.brush, '#d8342c');
});
decal('bd_ferris', 160, 40, (ctx, w, h) => {
  ctx.fillStyle = '#6a3fa0'; ctx.fillRect(0, 0, w, h);
  fitText(ctx, '摩天轮', w / 2, h / 2, w - 20, h - 8, FONTS.round, '#fff2c4');
});
decal('bd_crane', 128, 32, (ctx, w, h) => {
  ctx.fillStyle = '#2d5ea8'; ctx.fillRect(0, 0, w, h);
  fitText(ctx, '幸福建工', w / 2, h / 2, w - 12, h - 6, FONTS.sans, '#ffffff');
});

// ---- geometry helpers -------------------------------------------------------------------------
const _qv = new THREE.Vector3(), _qn = new THREE.Vector3(), _qnm = new THREE.Matrix3();

/** Batch of single-sided quads (2 tris each) in the current transform frame; flushed as one part. */
class Quads {
  constructor(m) { this.m = m; this.P = []; this.N = []; this.UV = []; }
  /**
   * Quad centred at (x, y, z) facing local +Z (or local +Y when up = true; u along x, v towards −z).
   * uv = [u0, v0, u1, v1] picks part of a decal; flip = true makes it face the other way.
   */
  add(x, y, z, w, h, up = false, uv = null, flip = false) {
    const M = this.m.matrix, hw = w / 2, hh = h / 2;
    const pts = up
      ? [[x - hw, y, z + hh], [x + hw, y, z + hh], [x + hw, y, z - hh], [x - hw, y, z - hh]]
      : [[x - hw, y - hh, z], [x + hw, y - hh, z], [x + hw, y + hh, z], [x - hw, y + hh, z]];
    _qnm.getNormalMatrix(M);
    _qn.set(0, up ? 1 : 0, up ? 0 : 1).applyMatrix3(_qnm).normalize();
    if (flip) _qn.negate();
    const W = pts.map(p => _qv.set(p[0], p[1], p[2]).applyMatrix4(M).toArray());
    const [u0, v0, u1, v1] = uv || [0, 0, 1, 1];
    const T = [[u0, v0], [u1, v0], [u1, v1], [u0, v1]];
    for (const i of flip ? [0, 2, 1, 0, 3, 2] : [0, 1, 2, 0, 2, 3]) {
      this.P.push(W[i][0], W[i][1], W[i][2]);
      this.N.push(_qn.x, _qn.y, _qn.z);
      this.UV.push(T[i][0], T[i][1]);
    }
    return this;
  }
  /** both faces */
  add2(x, y, z, w, h, up = false, uv = null) { this.add(x, y, z, w, h, up, uv); return this.add(x, y, z, w, h, up, uv, true); }
  flush(col, glow = 0, key = null) {
    if (!this.P.length) return;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.P, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.N, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.UV, 2));
    const m = this.m, stack = m.stack, gl = m._glow;
    m.stack = [new THREE.Matrix4()]; // points are already in model space
    m.glow(glow);
    m.geo(g, col, 0, 0, 0, 0, 0, 0, 1, 1, 1, key ? getUV(key) : null);
    m.stack = stack;
    m.glow(gl);
    this.P = []; this.N = []; this.UV = [];
  }
}

/** Window kit: glass (two tones), warm lit panes (glow), frames, open-balcony voids, AC grilles, bars, louvres. */
function winKit(m, lit = 0.33) {
  const k = {
    g1: new Quads(m), g2: new Quads(m), l1: new Quads(m), l2: new Quads(m), fr: new Quads(m),
    dark: new Quads(m), ac: new Quads(m), bars: new Quads(m), louver: new Quads(m), lit,
    /** window at (x, y) on a wall whose outer face is at local z, facing local +Z */
    win(x, y, z, w, h, o = {}) {
      const f = o.frame ?? 0.08, mull = o.mull ?? 1, r = m.rng.r(), L = o.lit ?? k.lit;
      if (o.dark) k.dark.add(x, y, z + 0.03, w, h);
      else if (r < L) (r < L * 0.55 ? k.l1 : k.l2).add(x, y, z + 0.03, w, h);
      else (m.rng.chance(0.5) ? k.g1 : k.g2).add(x, y, z + 0.03, w, h);
      if (f) k.fr.add(x, y, z + 0.015, w + f * 2, h + f * 2);
      for (let i = 1; i <= mull; i++) k.fr.add(x - w / 2 + (w * i) / (mull + 1), y, z + 0.045, 0.06, h);
      if (o.bars) k.bars.add(x, y, z + 0.14, w + 0.12, h + 0.12);
    },
    flush() {
      k.fr.flush(C.frame);
      k.g1.flush(C.glass); k.g2.flush(C.glass2);
      k.l1.flush(C.lit, 0.8); k.l2.flush(C.lit2, 0.8);
      k.dark.flush(C.void);
      k.ac.flush(0xffffff, 0, 'bd_ac');
      k.bars.flush(0xffffff, 0, 'bd_bars');
      k.louver.flush(0xffffff, 0, 'bd_louver');
    },
  };
  return k;
}

/** 空调外机 on a wall whose face is at local z (unit sticks out along +Z). */
function acUnit(m, k, x, y, z, s = 1, bracket = false) {
  m.box(0.82 * s, 0.56 * s, 0.3 * s, C.ac, x, y, z + 0.15 * s);
  k.ac.add(x, y, z + 0.3 * s + 0.012, 0.8 * s, 0.54 * s);
  if (bracket) m.box(0.9 * s, 0.05, 0.36 * s, C.dgrey, x, y - 0.3 * s, z + 0.17 * s);
}

/** Clothes drying rack sticking out of a window: two poles + crossbar with shirts and trousers. */
function laundry(m, x, y, z, w, out = 0.8) {
  m.box(0.04, 0.04, out, C.metal, x - w / 2, y, z + out / 2);
  m.box(0.04, 0.04, out, C.metal, x + w / 2, y, z + out / 2);
  m.box(w + 0.08, 0.04, 0.04, C.metal, x, y, z + out);
  let cx = x - w / 2 + 0.08;
  while (cx < x + w / 2 - 0.3) {
    const shirt = m.rng.chance(0.6), col = m.rng.pick(CLOTH);
    const cw = shirt ? 0.56 : 0.38, ch = shirt ? 0.56 : 0.78;
    if (cx + cw > x + w / 2) break;
    m.decal(cw, ch, shirt ? 'bd_shirt' : 'bd_pants', cx + cw / 2, y - ch / 2 - 0.02, z + out, 0, 0, 0, col, true);
    cx += cw + 0.1;
  }
}

/** Potted plant (terracotta pot + leafy dome). */
function plantPot(m, x, y, z, s = 1) {
  m.box(0.3 * s, 0.26 * s, 0.3 * s, 0xb5653f, x, y + 0.13 * s, z);
  m.dome(0.28 * s, m.rng.pick([C.leaf, C.deepGreen, 0x6fbf5a]), x, y + 0.24 * s, z, 1, 1.35, 1, 0, 0, 0, 6);
}

/** 太阳能热水器: tilted vacuum-tube rack facing +Z with the tank on top (about 60 tris). */
function solarHeater(m, x, y, z, ry = 0, w = 2) {
  const L = 1.6, tilt = 42 * D, top = 0.5 + (L / 2) * Math.sin(tilt), back = -(L / 2) * Math.cos(tilt);
  m.push(x, y, z, 0, ry, 0);
  m.tbox(w, 0.07, L, 0x31415e, { py: 'bd_solar' }, 0, 0.5, 0, tilt, 0, 0);
  m.cyl(0.22, 0.22, w + 0.2, 0xd9dde2, 0, top + 0.17, back, 0, 0, 90 * D, 6);
  m.box(w * 0.86, top, 0.06, C.metal, 0, top / 2, back);
  m.pop();
}

/** Blue plastic / steel rooftop water tank on a small stand. */
function waterTank(m, x, y, z, r = 0.7, col = 0x3d7fc4) {
  m.box(r * 2.1, 0.3, r * 2.1, C.dgrey, x, y + 0.15, z);
  m.cyl(r, r, r * 1.9, col, x, y + 0.3 + r * 0.95, z, 0, 0, 0, 8);
  m.cyl(r * 0.4, r * 0.4, 0.12, shade(col, 0.8), x, y + 0.36 + r * 1.9, z, 0, 0, 0, 6);
}

/** Parapet ring around a flat roof (outer size w × d at y, height h, thickness t). */
function parapet(m, w, d, y, h, t, col, x = 0, z = 0) {
  m.box(w, h, t, col, x, y + h / 2, z + d / 2 - t / 2);
  m.box(w, h, t, col, x, y + h / 2, z - d / 2 + t / 2);
  m.box(t, h, d - 2 * t, col, x + w / 2 - t / 2, y + h / 2, z);
  m.box(t, h, d - 2 * t, col, x - w / 2 + t / 2, y + h / 2, z);
}

const _ba = new THREE.Vector3(), _bup = new THREE.Vector3(0, 1, 0), _bq = new THREE.Quaternion(), _be = new THREE.Euler();
function alignY(a, b) {
  _ba.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const len = _ba.length();
  _bq.setFromUnitVectors(_bup, _ba.normalize());
  _be.setFromQuaternion(_bq, 'XYZ');
  return [len, _be.x, _be.y, _be.z];
}
/** Square member of thickness t between two points (lattice, legs, braces). */
function beam(m, a, b, t, col, t2 = t) {
  const [len, rx, ry, rz] = alignY(a, b);
  m.box(t, len, t2, col, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2, rx, ry, rz);
}
/** Round member between two points; r at a, r2 at b. */
function rod(m, a, b, r, col, seg = 6, r2 = r) {
  const [len, rx, ry, rz] = alignY(a, b);
  m.cyl(r2, r, len, col, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2, rx, ry, rz, seg);
}

/** Raw triangle soup [[x,y,z], ...] (optionally with per-vertex uvs into a decal). */
function addTris(m, pts, col, uv = null, key = null) {
  const pos = new Float32Array(pts.length * 3);
  pts.forEach((p, i) => { pos[i * 3] = p[0]; pos[i * 3 + 1] = p[1]; pos[i * 3 + 2] = p[2]; });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  if (uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(uv), 2));
  g.computeVertexNormals();
  m.geo(g, col, 0, 0, 0, 0, 0, 0, 1, 1, 1, uv && key ? getUV(key) : null);
}

const rectPoly = (hw, hd) => [[-hw, hd], [hw, hd], [hw, -hd], [-hw, -hd]];
/** regular polygon with a flat side facing +Z when rot = −π/n */
const ngon = (n, r, rot = -Math.PI / n) => Array.from({ length: n }, (_, i) => {
  const a = rot + (i / n) * Math.PI * 2;
  return [r * Math.sin(a), r * Math.cos(a)];
});

/**
 * Chinese roof: loft from the eave polygon c0 (at y0) to the top polygon c1 (at y1) — a hip roof when
 * c1 is a ridge line, a pyramid when c1 is a point, an eave skirt when c1 is the wall above.
 * Concave profile (gentle at the eave, steep at the top), corners lifted (lift) and flared (flare).
 * Tiled top (bd_tiles), painted soffit underneath (open eaves can be seen from below), tile-end fascia.
 */
function roofLoft(m, o) {
  const { c0, c1 } = o, N = c0.length;
  const nu = o.nu || 4, nt = o.nt || 3, lift = o.lift || 0, flare = o.flare || 0;
  const th = o.thick ?? 0.3, lin = o.lin ?? 0.4, pw = o.pw ?? 2.2;
  const rings = [];
  for (let k = 0; k <= nt; k++) {
    const t = k / nt, up = (1 - t) * (1 - t);
    const y = o.y0 + (o.y1 - o.y0) * (lin * t + (1 - lin) * t * t);
    const ring = [];
    for (let i = 0; i < N; i++) {
      const a = c0[i], b = c1[i], a2 = c0[(i + 1) % N], b2 = c1[(i + 1) % N];
      const x0 = lerp(a[0], b[0], t), z0 = lerp(a[1], b[1], t), x1 = lerp(a2[0], b2[0], t), z1 = lerp(a2[1], b2[1], t);
      for (let j = 0; j < nu; j++) {
        const s = j / nu, w = Math.pow(Math.abs(2 * s - 1), pw) * up;
        const x = lerp(x0, x1, s), z = lerp(z0, z1, s), r = Math.hypot(x, z) || 1;
        ring.push([x + (flare * w * x) / r, y + lift * w, z + (flare * w * z) / r]);
      }
    }
    rings.push(ring);
  }
  const M = N * nu, P = [], UV = [];
  for (let k = 0; k < nt; k++) {
    for (let i = 0; i < M; i++) {
      const i2 = (i + 1) % M, a = rings[k][i], b = rings[k][i2], c = rings[k + 1][i2], d = rings[k + 1][i];
      P.push(a, b, c, a, c, d);
      UV.push(0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1);
    }
  }
  addTris(m, P, o.col, o.tiles === false ? null : UV, 'bd_tiles');
  if (th > 0) {
    const low = p => [p[0], p[1] - th, p[2]];
    const u0 = rings[0].map(low), u1 = rings[nt].map(low), U = [], E = [], EU = [];
    for (let i = 0; i < M; i++) {
      const i2 = (i + 1) % M;
      U.push(u0[i], u1[i2], u0[i2], u0[i], u1[i], u1[i2]);
      E.push(u0[i], u0[i2], rings[0][i2], u0[i], rings[0][i2], rings[0][i]);
      EU.push(0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1);
    }
    addTris(m, U, o.under ?? shade(o.col, 0.6));
    addTris(m, E, o.edge ?? shade(o.col, 0.85), o.tiles === false ? null : EU, 'bd_tile_ends');
  }
  if (o.ridges || o.tips) {
    const rr = o.ridges || 0.08, rc = o.ridgeCol ?? shade(o.col, 0.78);
    for (let i = 0; i < N; i++) {
      const pts = rings.map(r => [r[i * nu][0], r[i * nu][1] + rr * 0.6, r[i * nu][2]]);
      if (o.ridges) m.tube(pts, rr, rc, 4, false, nt * 2);
      if (o.tips) {
        // flying eave tip, plus an optional wind bell hanging under it
        const p = pts[0], rad = Math.hypot(p[0], p[2]) || 1;
        rod(m, p, [p[0] + (p[0] / rad) * o.tips, p[1] + o.tips * 0.9, p[2] + (p[2] / rad) * o.tips], rr, rc, 4, rr * 0.35);
        if (o.bells) m.cone(o.bells, o.bells * 2, 0xe8b84a, p[0], p[1] - rr - o.bells, p[2], 0, 0, 0, 5);
      }
    }
  }
  return rings;
}

/** Tiled gable roof, ridge along X: w long, d deep (eave to eave), ridge h above y; returns nothing. */
function gableRoof(m, x, y, z, w, d, h, col, o = {}) {
  const Q = new Quads(m), half = d / 2, ang = Math.atan2(h, half), t = o.t ?? 0.18;
  const L = Math.hypot(h, half) + (o.over ?? 0.5), n = Math.max(1, Math.round(w / (o.cell ?? 2.4)));
  for (const s of [1, -1]) {
    const cz = z + s * (half / 2 + ((o.over ?? 0.5) / 2) * Math.cos(ang)) ;
    const cy = y + h / 2 - ((o.over ?? 0.5) / 2) * Math.sin(ang);
    m.push(x, cy, cz, s * ang, s > 0 ? 0 : Math.PI, 0);
    m.box(w, t, L, o.under ?? shade(col, 0.7), 0, 0, 0);
    for (let i = 0; i < n; i++) Q.add(-w / 2 + (w / n) * (i + 0.5), t / 2 + 0.01, 0, w / n, L, true);
    m.pop();
  }
  Q.flush(col, 0, 'bd_tiles');
  const rc = o.ridgeCol ?? shade(col, 0.72);
  m.box(w + 0.2, 0.34, 0.36, rc, x, y + h + 0.08, z);
  if (o.curl) m.sym(s => m.box(0.5, 0.3, 0.3, rc, x + s * (w / 2 + 0.2), y + h + 0.24, z, 0, 0, s * 28 * D));
}

/** Red paper lantern (灯笼) hanging from y (top of its string). */
function lantern(m, x, y, z, r = 0.3) {
  m.box(0.02, 0.25, 0.02, C.ink, x, y - 0.125, z);
  m.cyl(r * 0.45, r * 0.45, r * 0.18, C.gold, x, y - 0.27, z, 0, 0, 0, 6);
  m.glow(0.9);
  m.sphere(r, C.red, x, y - 0.3 - r * 0.85, z, 1, 0.85, 1, 0, 0, 0, 8);
  m.glow(0);
  m.cyl(r * 0.45, r * 0.45, r * 0.18, C.gold, x, y - 0.33 - r * 1.7, z, 0, 0, 0, 6);
  m.box(r * 0.25, r * 0.7, r * 0.25, C.gold, x, y - 0.4 - r * 2.1, z);
}

/** Door dressed for Spring Festival: couplets both sides, 横批 on top, 福 on the door (door plane at z). */
function springDoor(m, x, y, z, w, h) {
  m.decal(0.28, 1.45, 'bd_cl_r', x + w / 2 + 0.25, y + h * 0.55, z + 0.02);
  m.decal(0.28, 1.45, 'bd_cl_l', x - w / 2 - 0.25, y + h * 0.55, z + 0.02);
  m.decal(Math.min(1.2, w * 0.9), 0.3, 'bd_hp', x, y + h + 0.3, z + 0.02);
  m.decal(0.5, 0.5, 'bd_fu', x, y + h * 0.6, z + 0.035);
}

// =============================================================================================
// Residential
// =============================================================================================

// ---- 六层居民楼 (walk-up, 3 units, entrances on the front) ---------------------------------------
def('res_6f', {
  name: '六层居民楼',
  cat: 'building',
  sfx: 'rumble',
  fill: 0.7,
  build(m) {
    const W = 39.6, BD = 9.6, Z0 = -0.6, FH = 2.7, Y0 = 0.3, NF = 6, TOP = Y0 + NF * FH, RY = TOP + 0.21;
    const zf = Z0 + BD / 2, zb = Z0 - BD / 2;
    const k = winKit(m);
    const pink = new Quads(m), slab = new Quads(m), stripe = new Quads(m);
    const stairCol = 0xe6b9a0, groundCol = 0xdcc6ad;
    // plinth, ground floor in warm stone tile, white-tiled upper floors, slab bands, cornice, parapet
    m.box(W + 0.4, Y0, BD + 0.4, C.base, 0, Y0 / 2, Z0);
    m.box(W, FH, BD, groundCol, 0, Y0 + FH / 2, Z0);
    m.box(W, (NF - 1) * FH, BD, C.tile, 0, Y0 + FH + ((NF - 1) * FH) / 2, Z0);
    for (let f = 1; f < NF; f++) m.box(W + 0.12, 0.16, BD + 0.12, f === 1 ? 0xe4d8c8 : C.band, 0, Y0 + f * FH, Z0);
    m.box(W, 0.2, BD, 0xa9a49a, 0, TOP + 0.1, Z0); // roof deck
    parapet(m, W + 0.3, BD + 0.3, TOP - 0.11, 0.32, 0.35, C.accent, 0, Z0); // cornice
    parapet(m, W, BD, RY - 0.02, 0.72, 0.2, C.tile, 0, Z0);
    parapet(m, W + 0.1, BD + 0.1, RY + 0.68, 0.1, 0.3, C.band, 0, Z0);

    const UX = [-13.2, 0, 13.2];
    // ---- front: stair bays with unit entrances, stacked balconies, bedroom windows + AC units
    m.push(0, 0, zf);
    UX.forEach((ux, ui) => {
      const bz = 0.4; // stair bay front face
      m.box(2.8, RY + 1.2, bz, stairCol, ux, (RY + 1.2) / 2, bz / 2);
      m.box(3.1, 0.22, bz + 0.3, C.band, ux, RY + 1.25, bz / 2);
      for (let f = 1; f < NF; f++) k.win(ux, Y0 + (f + 0.5) * FH, bz, 1.1, 0.95, { mull: 1 });
      // entrance: steps, steel door with couplets, canopy, unit plate, intercom
      m.box(2.6, 0.15, 0.95, C.concrete, ux, 0.075, bz + 0.47);
      m.box(2.2, 0.15, 0.5, C.concrete, ux, 0.225, bz + 0.25);
      m.box(1.8, 2.3, 0.06, C.dgrey, ux, Y0 + 1.15, bz + 0.03);
      m.box(1.5, 2.2, 0.08, 0x8a2c22, ux, Y0 + 1.1, bz + 0.06);
      m.box(0.03, 2.15, 0.02, 0x5a1a14, ux + 0.25, Y0 + 1.1, bz + 0.11);
      m.box(0.06, 0.22, 0.05, C.gold, ux + 0.15, Y0 + 1.05, bz + 0.12);
      m.box(0.22, 0.32, 0.06, C.dgrey, ux + 1.12, Y0 + 1.35, bz + 0.03);
      springDoor(m, ux, Y0, bz + 0.1, 1.5, 2.2);
      m.box(2.9, 0.14, 1.2, C.band, ux, Y0 + 2.85, bz + 0.6);
      m.decal(0.72, 0.31, 'bd_unit' + (ui + 1), ux, Y0 + 3.3, bz + 0.02);
      m.sym(s => {
        // bedroom window with its AC unit below
        const wx = ux + s * 2.1;
        for (let f = 0; f < NF; f++) {
          const y = Y0 + f * FH;
          k.win(wx, y + 1.6, 0, 1.0, 1.3, { mull: 1, bars: f < 2 });
          if (m.rng.chance(0.8)) acUnit(m, k, wx, y + 0.52, 0, 1, f < 2);
        }
        // stacked balconies: enclosed glass or open with laundry and a flower pot
        const bx = ux + s * 4.55, bd = 1.2;
        m.box(3.5, NF * FH - 0.1, bd, C.tile, bx, Y0 + (NF * FH - 0.1) / 2, bd / 2);
        for (let f = 0; f < NF; f++) {
          const y = Y0 + f * FH;
          pink.add(bx, y + 0.5, bd + 0.01, 3.5, 0.86);
          slab.add(bx, y + 0.02, bd + 0.02, 3.56, 0.18);
          if (f > 0 && m.rng.chance(0.28)) {
            k.win(bx, y + 1.76, bd, 3.2, 1.46, { dark: true, frame: 0, mull: 0 });
            m.box(3.3, 0.08, 0.26, C.band, bx, y + 0.97, bd + 0.13);
            laundry(m, bx, y + 2.38, bd, 2.8, 0.55);
            plantPot(m, bx + s * 1.2, y + 1.01, bd + 0.13, 0.85);
          } else {
            k.win(bx, y + 1.72, bd, 3.2, 1.3, { frame: 0.07, mull: 3, bars: f === 0 });
          }
        }
      });
    });
    m.pop();

    // ---- back: kitchen / bedroom windows, AC units, the odd laundry pole
    m.push(0, 0, zb, 0, Math.PI, 0);
    for (const ux of UX) {
      for (const [dx, ww] of [[-5.0, 1.7], [-2.1, 1.0], [2.1, 1.0], [5.0, 1.7]]) {
        for (let f = 0; f < NF; f++) {
          const y = Y0 + f * FH;
          k.win(ux + dx, y + 1.6, 0, ww, 1.3, { mull: ww > 1.2 ? 1 : 0, bars: f < 2, frame: 0.07 });
          if (ww > 1.2 && m.rng.chance(0.7)) acUnit(m, k, ux + dx + (dx > 0 ? 1.4 : -1.4), y + 0.9, 0);
          else if (f > 1 && m.rng.chance(0.12)) laundry(m, ux + dx, y + 2.3, 0, ww + 0.3, 0.55);
        }
      }
    }
    m.pop();

    // ---- ends: small windows either side of a vertical terracotta stripe
    for (const s of [1, -1]) {
      m.push((s * W) / 2, 0, Z0, 0, (s * Math.PI) / 2, 0);
      stripe.add(0, Y0 + (NF * FH) / 2, 0.02, 0.7, NF * FH);
      for (let f = 0; f < NF; f++) for (const dx of [-2.4, 2.4]) k.win(dx, Y0 + f * FH + 1.6, 0, 1.0, 1.2, { mull: 0, frame: 0.07, bars: f < 1 });
      m.pop();
    }

    // ---- roof: hatches, solar water heaters, blue water tanks, foam-box vegetable patch, dish
    for (const ux of UX) {
      m.box(1.1, 0.5, 1.1, C.concrete, ux + 1.8, RY + 0.25, zf - 2.2);
      waterTank(m, ux - 2.4, RY, zf - 1.6, 0.62);
    }
    for (const z of [Z0 + 0.4, Z0 - 2.4]) {
      for (let x = -17; x <= 17; x += 3.4) if (m.rng.chance(0.4)) solarHeater(m, x + m.rng.range(-0.3, 0.3), RY, z, 0, 2);
    }
    for (let i = 0; i < 4; i++) {
      const x = -W / 2 + 1.2 + (i % 2) * 0.75, z = zb + 1.2 + Math.floor(i / 2) * 0.55;
      m.box(0.65, 0.34, 0.45, 0xf2f2ee, x, RY + 0.17, z);
      m.box(0.58, 0.12, 0.38, C.leaf, x, RY + 0.38, z);
    }
    m.dome(0.45, 0xe9e9e3, W / 2 - 1.2, RY + 1.0, zf - 1.0, 1, 0.35, 1, 55 * D, 0, 0, 8);
    m.box(0.06, 1.0, 0.06, C.metal, W / 2 - 1.2, RY + 0.5, zf - 1.1);

    pink.flush(0xd3dbe3);
    slab.flush(C.band);
    stripe.flush(C.accent);
    k.flush();
  },
});

/**
 * High-rise residential tower (lobby podium + typical floors). Front bays are { type, x, w, d }:
 * 'balc' (slab + railing + patio door, laundry / plants), 'win' (window + AC unit or louvre),
 * 'core' (glazed stair / lift strip), 'strip' (floor-to-ceiling glass strip, some floors lit).
 * o.refuge lists floors replaced by a louvre band (避难层). Returns key heights for lobby / crown.
 */
function towerBlock(m, o) {
  const { W, Dp, Z0, Y0, LH, FH, NF } = o;
  const k = winKit(m, o.lit ?? 0.33);
  const T0 = Y0 + LH, TOP = T0 + (NF - 1) * FH, zf = Z0 + Dp / 2, zb = Z0 - Dp / 2;
  const railQ = new Quads(m), bandQ = new Quads(m), refuge = new Set(o.refuge || []);
  const fd = Math.max(0.4, ...o.front.map(b => b.d || 0));
  m.box(W + 0.5, Y0, Dp + 0.5, C.base, 0, Y0 / 2, Z0);
  m.box(W, LH, Dp, o.podium, 0, Y0 + LH / 2, Z0);
  m.box(W, TOP - T0, Dp, o.wall, 0, (TOP + T0) / 2, Z0);
  m.box(W + 0.4, 0.45, Dp + 0.4, o.band, 0, T0, Z0);
  for (let f = 2; f < NF; f++) m.box(W + 0.12, 0.2, Dp + 0.12, o.band, 0, T0 + (f - 1) * FH, Z0);
  m.box(W, 0.2, Dp, 0xa9a49a, 0, TOP + 0.1, Z0);
  parapet(m, W + 0.2, Dp + 0.2, TOP, 1.1, 0.25, o.band, 0, Z0);

  // ---- front
  m.push(0, 0, zf);
  for (const b of o.front) {
    if (b.type === 'balc') {
      m.sym(s => m.box(0.24, TOP - T0 + (o.finUp ?? 0.6), b.d, o.fin, b.x + s * (b.w / 2 + 0.12), (TOP + T0 + (o.finUp ?? 0.6)) / 2, b.d / 2));
    } else if (b.type === 'core') {
      m.box(b.w, TOP - T0 + 2.2, 0.36, o.core ?? C.glass2, b.x, (TOP + T0 + 2.2) / 2, 0.18);
    } else if (b.type === 'strip') {
      m.box(b.w, TOP - T0, 0.25, o.stripCol ?? C.glass, b.x, (TOP + T0) / 2, 0.125);
    }
  }
  for (let f = 1; f < NF; f++) {
    const y = T0 + (f - 1) * FH;
    if (refuge.has(f)) {
      k.louver.add(0, y + FH / 2, fd + 0.03, W + 0.64, FH - 0.2);
      continue;
    }
    for (const b of o.front) {
      if (b.type === 'balc') {
        m.box(b.w, 0.2, b.d, o.band, b.x, y + 0.1, b.d / 2);
        railQ.add(b.x, y + 0.72, b.d + 0.01, b.w, 1.05);
        k.win(b.x, y + 1.35, 0, b.w - 0.8, 2.1, { mull: 1, frame: 0.06 });
        const r = m.rng.r();
        if (r < 0.16) laundry(m, b.x, y + 2.5, 0.05, b.w - 1.2, b.d - 0.3);
        else if (r < 0.3 && o.pots !== false) plantPot(m, b.x + m.rng.range(-b.w / 3, b.w / 3), y + 0.2, b.d - 0.35, 1.2);
      } else if (b.type === 'win') {
        k.win(b.x, y + 1.5, 0, b.w, 1.55, { mull: 1, frame: 0.07 });
        if (m.rng.chance(0.35)) acUnit(m, k, b.x, y + 0.42, 0, 1);
        else k.louver.add(b.x, y + 0.42, 0.03, b.w, 0.6);
      } else if (b.type === 'core') {
        bandQ.add(b.x, y + 0.1, 0.37, b.w + 0.02, 0.24);
      } else if (b.type === 'strip') {
        bandQ.add(b.x, y + 0.1, 0.26, b.w + 0.02, 0.3);
        if (m.rng.chance(k.lit)) k.l1.add(b.x, y + 1.45, 0.27, b.w - 0.4, FH - 0.8);
      }
    }
  }
  m.pop();

  // ---- back: windows, AC units (or louvres), a few laundry poles
  m.push(0, 0, zb, 0, Math.PI, 0);
  for (let f = 1; f < NF; f++) {
    const y = T0 + (f - 1) * FH;
    if (refuge.has(f)) { k.louver.add(0, y + FH / 2, 0.35, W + 0.64, FH - 0.2); continue; }
    for (const [x, w] of o.back) {
      k.win(x, y + 1.5, 0, w, 1.45, { mull: w > 1.3 ? 1 : 0, frame: 0 });
      if (w > 1.3) {
        if (m.rng.chance(0.3)) acUnit(m, k, x, y + 0.42, 0, 1);
        else k.louver.add(x, y + 0.42, 0.03, w, 0.6);
      } else if (m.rng.chance(0.08)) laundry(m, x, y + 2.35, 0, w + 0.4, 0.6);
    }
  }
  m.pop();

  // ---- ends (optionally with glass strips wrapping the front corners)
  for (const s of [1, -1]) {
    m.push((s * W) / 2, 0, Z0, 0, (s * Math.PI) / 2, 0);
    const cs = o.cornerStrip, cx = s > 0 ? -Dp / 2 + (cs || 0) / 2 : Dp / 2 - (cs || 0) / 2;
    if (cs) m.box(cs, TOP - T0, 0.25, o.stripCol ?? C.glass, cx, (TOP + T0) / 2, 0.125);
    if (o.sideStripe) bandQ.add(0, (TOP + T0) / 2, 0.02, o.sideStripe, TOP - T0);
    for (let f = 1; f < NF; f++) {
      const y = T0 + (f - 1) * FH;
      if (refuge.has(f)) { k.louver.add((-s * (fd - 0.32)) / 2, y + FH / 2, 0.3, Dp + fd + 0.38, FH - 0.2); continue; }
      for (const x of o.side) k.win(x, y + 1.5, 0, 1.3, 1.4, { mull: 0, frame: 0 });
      if (cs) {
        bandQ.add(cx, y + 0.1, 0.26, cs + 0.02, 0.3);
        if (m.rng.chance(k.lit)) k.l2.add(cx, y + 1.45, 0.27, cs - 0.4, FH - 0.8);
      }
    }
    m.pop();
  }
  railQ.flush(o.rail ?? C.white, 0, o.railKey === undefined ? 'bd_rail' : o.railKey);
  bandQ.flush(o.band);
  return { k, TOP, T0, zf, zb };
}

/** Lobby front of a tower: glass entrance, canopy on two columns, steps, lobby windows, unit plate. */
function towerLobby(m, k, o, zf) {
  const { Y0, LH, W } = o;
  m.push(0, 0, zf);
  m.box(6.4, LH - 0.4, 0.3, C.glass2, 0, Y0 + (LH - 0.4) / 2, 0.15);
  k.win(-1.1, Y0 + 1.3, 0.3, 1.9, 2.5, { lit: 0.9, mull: 1, frame: 0.1 });
  k.win(1.1, Y0 + 1.3, 0.3, 1.9, 2.5, { lit: 0.9, mull: 1, frame: 0.1 });
  m.box(7.6, 0.35, 2.5, o.band, 0, Y0 + LH - 0.55, 1.25);
  m.sym(s => m.box(0.36, LH - 0.7, 0.36, o.band, s * 3.4, Y0 + (LH - 0.7) / 2, 2.25));
  m.box(7.2, 0.15, 2.6, C.concrete, 0, 0.075, 1.3);
  m.box(6.4, 0.15, 1.6, C.concrete, 0, 0.225, 0.8);
  m.decal(0.9, 0.39, 'bd_unit1', 0, Y0 + LH - 0.55, 2.52);
  for (let x = -W / 2 + 2.2; x < W / 2 - 1.5; x += 3.1) {
    if (Math.abs(x) < 4.6) continue;
    k.win(x, Y0 + 1.9, 0, 2.3, 2.3, { mull: 1, frame: 0.1, lit: 0.45 });
  }
  m.sym(s => {
    m.box(3.2, 0.7, 1.1, C.concrete, s * 6.8, 0.35, 0.8);
    m.box(3.0, 0.2, 0.9, C.deepGreen, s * 6.8, 0.78, 0.8);
    for (let i = 0; i < 3; i++) m.dome(0.5, C.leaf, s * (5.8 + i), 0.85, 0.8, 1, 0.9, 1, 0, 0, 0, 6);
  });
  m.pop();
}

// ---- 高层住宅 (18 floors) -----------------------------------------------------------------------
def('res_18f', {
  name: '高层住宅',
  cat: 'building',
  sfx: 'rumble',
  fill: 0.7,
  build(m) {
    const o = {
      W: 30, Dp: 14.8, Z0: -1.1, Y0: 0.3, LH: 4.0, FH: 2.85, NF: 18, lit: 0.33,
      wall: 0xeee1c8, podium: 0xb89a80, band: 0xf8f4ea, fin: 0xc79a7a, core: 0x5d93a3,
      front: [
        { type: 'core', x: 0, w: 3.0 },
        { type: 'win', x: -2.6, w: 1.5 }, { type: 'win', x: 2.6, w: 1.5 },
        { type: 'balc', x: -6.2, w: 4.6, d: 1.5 }, { type: 'balc', x: 6.2, w: 4.6, d: 1.5 },
        { type: 'win', x: -10.0, w: 1.6 }, { type: 'win', x: 10.0, w: 1.6 },
        { type: 'balc', x: -13.1, w: 3.2, d: 1.5 }, { type: 'balc', x: 13.1, w: 3.2, d: 1.5 },
      ],
      back: [[-2.2, 1.1], [2.2, 1.1], [-6.0, 1.8], [6.0, 1.8], [-9.8, 1.3], [9.8, 1.3], [-13.2, 1.8], [13.2, 1.8]],
      side: [-4.6, 0, 4.6],
      sideStripe: 0.9,
    };
    const { k, TOP, zf } = towerBlock(m, o);
    towerLobby(m, k, o, zf);
    // back lobby windows + ends of the podium
    m.push(0, 0, o.Z0 - o.Dp / 2, 0, Math.PI, 0);
    for (let x = -12; x <= 12; x += 4) k.win(x, o.Y0 + 2.0, 0, 2.2, 2.0, { mull: 1, frame: 0.1, bars: true });
    m.pop();
    // roof: machine room, water tanks, and the pitched "hat" frame typical of 2000s towers
    const R = TOP + 0.2, cz = o.Z0, zb = o.Z0 - o.Dp / 2, hatCol = 0x8a5a48, ridgeY = TOP + 2.7;
    m.box(6.5, 1.8, 5.0, o.wall, 0, R + 0.9, cz - 3.4);
    m.box(7.0, 0.22, 5.5, o.band, 0, R + 1.9, cz - 3.4);
    waterTank(m, -9, R, cz - 3.2, 0.9, 0xd9dde2);
    waterTank(m, 9, R, cz - 3.2, 0.9, 0xd9dde2);
    for (let i = 0; i < 8; i++) {
      const x = -13.3 + i * 3.8;
      beam(m, [x, TOP + 1.1, zf - 0.2], [x, ridgeY, cz], 0.3, hatCol);
      beam(m, [x, TOP + 1.1, zb + 0.2], [x, ridgeY, cz], 0.3, hatCol);
    }
    m.box(o.W - 1.6, 0.4, 0.4, hatCol, 0, ridgeY, cz);
    m.box(o.W + 0.3, 0.3, 0.35, hatCol, 0, TOP + 1.2, zf - 0.2);
    m.box(o.W + 0.3, 0.3, 0.35, hatCol, 0, TOP + 1.2, zb + 0.2);
    m.glow(0.6);
    m.box(o.W - 1.6, 0.14, 0.14, C.lit, 0, ridgeY + 0.26, cz);
    m.glow(0);
    k.flush();
  },
});

// ---- 超高层住宅 (32 floors) ----------------------------------------------------------------------
def('res_32f', {
  name: '超高层住宅',
  cat: 'building',
  sfx: 'rumble',
  fill: 0.7,
  build(m) {
    const o = {
      W: 32, Dp: 16.6, Z0: -0.75, Y0: 0.3, LH: 4.8, FH: 2.85, NF: 32, lit: 0.33, finUp: 3.2,
      wall: 0xe8eaec, podium: 0x7f848c, band: 0xf7f7f4, fin: 0x9fb0c2, core: 0x4d8898, stripCol: 0x5f9fb0,
      refuge: [11, 22], pots: false, rail: C.glassL, railKey: null,
      front: [
        { type: 'core', x: 0, w: 3.4 },
        { type: 'win', x: -2.9, w: 1.4 }, { type: 'win', x: 2.9, w: 1.4 },
        { type: 'balc', x: -7.3, w: 5.8, d: 1.6 }, { type: 'balc', x: 7.3, w: 5.8, d: 1.6 },
        { type: 'win', x: -11.6, w: 1.6 }, { type: 'win', x: 11.6, w: 1.6 },
        { type: 'strip', x: -14.6, w: 2.6 }, { type: 'strip', x: 14.6, w: 2.6 },
      ],
      back: [[-2.3, 1.1], [2.3, 1.1], [-6.4, 1.9], [6.4, 1.9], [-10.8, 1.5], [10.8, 1.5]],
      side: [0, 4.2],
      cornerStrip: 2.4,
    };
    const { k, TOP, zf, zb } = towerBlock(m, o);
    towerLobby(m, k, o, zf);
    m.push(0, 0, zb, 0, Math.PI, 0);
    for (let x = -12; x <= 12; x += 4) k.win(x, o.Y0 + 2.2, 0, 2.4, 2.4, { mull: 1, frame: 0.1 });
    m.pop();
    // crown: fins run up into a lit frame, glazed core lantern, machine rooms, water tanks
    const R = TOP + 0.2, cz = o.Z0, H = 3.2;
    for (const z of [zf - 0.3, zb + 0.3]) {
      m.box(o.W + 0.3, 0.35, 0.35, o.band, 0, TOP + H - 0.15, z);
      m.box(o.W + 0.3, 0.25, 0.3, o.band, 0, TOP + 1.9, z);
    }
    m.sym(s => {
      for (const x of [4.3, 10.3, 15.9]) m.box(0.3, H, 0.3, o.band, s * x, TOP + H / 2, zf - 0.3);
      for (const x of [4.3, 10.3, 15.9]) m.box(0.3, H, 0.3, o.band, s * x, TOP + H / 2, zb + 0.3);
      m.box(0.3, 0.35, o.Dp - 0.6, o.band, s * 15.9, TOP + H - 0.15, cz);
    });
    m.glow(0.8);
    for (const z of [zf - 0.12, zb + 0.12]) m.box(o.W + 0.2, 0.12, 0.08, 0xfff1c8, 0, TOP + H + 0.05, z);
    m.glow(0);
    m.box(3.6, 3.4, 2.4, o.core, 0, R + 1.7, zf - 1.3);
    m.glow(0.7);
    m.box(3.0, 0.5, 0.05, 0xcfe8f0, 0, R + 2.7, zf - 0.08);
    m.glow(0);
    m.box(8, 2.4, 6, o.wall, 0, R + 1.2, cz - 2.5);
    m.box(8.4, 0.2, 6.4, o.band, 0, R + 2.5, cz - 2.5);
    waterTank(m, -9.5, R, cz - 2.5, 1.0, 0xd9dde2);
    waterTank(m, 9.5, R, cz - 2.5, 1.0, 0xd9dde2);
    m.cyl(0.08, 0.1, 3, C.metal, 11.5, R + 1.5, cz + 3, 0, 0, 0, 5);
    m.glow(1);
    m.sphere(0.18, C.red, 11.5, R + 3.05, cz + 3, 1, 1, 1, 0, 0, 0, 6);
    m.glow(0);
    k.flush();
  },
});

// =============================================================================================
// Shop-houses (底商): 10 × 8 × 10 m, recessed lit shopfront, calligraphy signboard, striped awning,
// the owner's flat upstairs. One helper, nine shops; each adds its own props on the pavement.
// =============================================================================================
const SH = { W: 9.6, BD: 8.8, Z0: -0.6, Y0: 0.15, OP: 3.4, TOP: 7.05, R: 0.8 };
SH.zf = SH.Z0 + SH.BD / 2; // front of the upper floor / signboard (3.8)
SH.iz = SH.zf - SH.R; // back of the recessed shopfront (3.0)

function shopHouse(m, o) {
  const { W, BD, Z0, Y0, OP, TOP, R, zf, iz } = SH, zb = Z0 - BD / 2;
  const k = winKit(m, 0.35);
  const low = o.low ?? 0xbdb6aa, trim = o.trim ?? C.band;
  const inside = new Quads(m), dark = new Quads(m), awn = new Quads(m);
  m.box(W + 0.4, Y0, BD + 0.3, C.base, 0, Y0 / 2, Z0);
  m.box(W, OP - Y0, BD - R, low, 0, (OP + Y0) / 2, Z0 - R / 2);
  m.box(W, TOP - OP, BD, o.wall, 0, (TOP + OP) / 2, Z0);
  m.sym(s => m.box(0.45, OP - Y0, R, low, s * (W / 2 - 0.225), (OP + Y0) / 2, zf - R / 2));
  m.box(W + 0.14, 0.14, BD + 0.14, trim, 0, 4.76, Z0);
  m.box(W, 0.12, BD, 0xa9a49a, 0, TOP + 0.06, Z0);
  parapet(m, W + 0.14, BD + 0.14, TOP, 0.5, 0.18, trim, 0, Z0);
  // lit shop interior at the back of the recess + storefront frame
  inside.add(0, (OP + Y0) / 2, iz + 0.02, W - 0.9, OP - Y0);
  if (o.glass) {
    // glazing line at the front of the recess, so props placed behind it read as inside the shop
    const gz = zf - 0.1;
    for (const x of o.glass) dark.add(x, (OP + Y0) / 2, gz, 0.1, OP - Y0);
    dark.add(0, OP - 0.55, gz, W - 0.9, 0.1);
    dark.add(0, OP - 0.08, gz, W - 0.9, 0.16);
    dark.add(0, Y0 + 0.16, gz, W - 0.9, 0.3);
  }
  // signboard, lit at dusk
  m.box(W, 1.34, 0.22, o.signBack ?? 0x3a3a40, 0, 4.02, zf + 0.11);
  m.glow(0.35);
  m.decal(W - 0.2, 1.22, o.sign, 0, 4.02, zf + 0.225);
  m.glow(0);
  // striped awning + scalloped valance (both faces, the ball sees it from below)
  const dz = 1.25, dy = 0.5, L = Math.hypot(dz, dy), th = Math.atan2(dz, dy);
  m.push(0, 3.3 - dy / 2, zf + dz / 2, -th, 0, 0);
  awn.add2(0, 0, 0, W - 0.7, L, false, [0, 0.35, 1, 1]);
  m.pop();
  awn.add2(0, 3.3 - dy - 0.15, zf + dz, W - 0.7, 0.3, false, [0, 0, 1, 0.55]);
  m.sym(s => beam(m, [s * (W / 2 - 0.45), 3.3, zf], [s * (W / 2 - 0.45), 3.3 - dy, zf + dz], 0.05, C.dgrey));
  // upstairs flat: two windows, AC unit, sometimes laundry
  m.push(0, 0, zf);
  for (const x of [-2.5, 2.5]) k.win(x, 5.95, 0, 2.2, 1.35, { mull: 2, frame: 0.08 });
  acUnit(m, k, 0, 5.3, 0);
  if (o.laundry ?? m.rng.chance(0.5)) laundry(m, 2.5, 6.8, 0, 2.0, 0.6);
  else { m.box(2.3, 0.08, 0.28, trim, -2.5, 5.2, 0.14); plantPot(m, -3.1, 5.24, 0.14, 0.7); plantPot(m, -2.2, 5.24, 0.14, 0.7); }
  m.pop();
  // back: door, windows, AC; ends: one window each
  m.push(0, 0, zb, 0, Math.PI, 0);
  dark.add(2.8, Y0 + 1.05, 0.02, 1.0, 2.1);
  k.win(-2.2, 1.9, 0, 1.3, 1.0, { mull: 1, bars: true });
  for (const x of [-2.4, 2.4]) k.win(x, 5.95, 0, 1.4, 1.3, { mull: 1 });
  acUnit(m, k, 0, 5.6, 0);
  m.pop();
  for (const s of [1, -1]) {
    m.push((s * W) / 2, 0, Z0, 0, (s * Math.PI) / 2, 0);
    k.win(0, 5.95, 0, 1.2, 1.3, { mull: 1 });
    m.pop();
  }
  // roof: waterproof coating, small steel water tank, styrofoam vegetable box, a clothesline of sheets
  m.box(W - 0.4, 0.02, BD - 0.4, o.roof ?? 0x8f9c90, 0, TOP + 0.13, Z0);
  m.sym(s => m.box(0.06, 0.95, 0.06, C.metal, s * 2.2, TOP + 0.6, Z0 + 0.6));
  m.box(4.4, 0.03, 0.03, C.metal, 0, TOP + 1.05, Z0 + 0.6);
  m.plane(1.2, 0.75, m.rng.pick(CLOTH), -1.0, TOP + 0.66, Z0 + 0.6);
  m.plane(0.9, 0.6, m.rng.pick(CLOTH), 0.6, TOP + 0.73, Z0 + 0.6);
  m.box(1.2, 0.7, 0.8, 0xd9dde2, -2.8, TOP + 0.47, zb + 1.3);
  m.box(1.3, 0.12, 0.9, C.dgrey, -2.8, TOP + 0.18, zb + 1.3);
  m.box(0.7, 0.35, 0.45, 0xf2f2ee, 3.0, TOP + 0.3, zb + 1.2);
  m.box(0.62, 0.12, 0.38, C.leaf, 3.0, TOP + 0.52, zb + 1.2);
  m.box(1.6, 0.85, 1.9, trim, 3.1, TOP + 0.55, Z0 - 1.6);
  m.box(1.8, 0.1, 2.1, C.dgrey, 3.1, TOP + 1.0, Z0 - 1.6);
  for (const x of [-3.9, -3.3]) plantPot(m, x, TOP + 0.12, zf - 0.5, 1.1);
  if (o.extra) o.extra(m, k, { W, zf, iz, Y0, OP });
  inside.flush(o.inside ?? 0xf3dcb0, 0.45);
  dark.flush(0x4a4e56);
  awn.flush(0xffffff, 0, o.awning);
  k.flush();
}

/** Red plastic stool (塑料凳) — street-food staple. */
function redStool(m, x, z, col = C.red) {
  m.box(0.3, 0.05, 0.3, col, x, 0.45, z);
  m.cyl(0.12, 0.16, 0.42, col, x, 0.21, z, 0, 0, 0, 4);
}

def('shop_baozi', {
  name: '包子铺',
  cat: 'building',
  sfx: 'rumble',
  fill: 0.75,
  build(m) {
    shopHouse(m, {
      sign: 'bd_sign_baozi', awning: 'bd_awn_red', wall: 0xf3e7d2, inside: 0xf6dfb0, signBack: 0x7a1c16,
      extra(m, k, { zf }) {
        // steamer tower on a steel cart, steam puffs, counter with trays, folding table + stools
        const x = -2.7, z = zf + 0.35;
        m.box(1.5, 0.8, 0.8, C.metal, x, 0.55, z);
        m.box(1.5, 0.06, 0.8, 0xdfe2e6, x, 0.97, z);
        for (const dx of [-0.36, 0.36]) {
          for (let i = 0; i < 4; i++) {
            m.cyl(0.33, 0.33, 0.16, i % 2 ? 0xd9b073 : 0xe6c48c, x + dx, 1.08 + i * 0.16, z, 0, 0, 0, 10);
          }
          m.dome(0.33, 0xe6c48c, x + dx, 1.64, z, 1, 0.45, 1, 0, 0, 0, 10);
          m.sphere(0.2, 0xf6f3ee, x + dx, 1.95, z, 1.2, 0.8, 1.2, 0, 0, 0, 6);
          m.sphere(0.14, 0xf6f3ee, x + dx + 0.08, 2.22, z - 0.05, 1.2, 0.8, 1.2, 0, 0, 0, 6);
        }
        m.box(2.4, 1.0, 0.6, 0xe9e2d4, 1.9, 0.5, zf - 0.25);
        m.glow(0.4);
        m.box(2.3, 0.35, 0.55, 0xfff1d0, 1.9, 1.18, zf - 0.25);
        m.glow(0);
        for (let i = 0; i < 6; i++) m.dome(0.08, 0xf7f1e3, 1.2 + i * 0.28, 1.36, zf - 0.25, 1, 0.8, 1, 0, 0, 0, 6);
        m.box(0.9, 0.05, 0.6, C.sky, 2.2, 0.72, zf + 1.05);
        m.cyl(0.05, 0.05, 0.7, C.metal, 2.2, 0.36, zf + 1.05, 0, 0, 0, 4);
        redStool(m, 1.5, zf + 1.05);
        redStool(m, 2.9, zf + 1.05, 0x2f63c9);
      },
    });
  },
});

def('shop_fruit', {
  name: '水果店',
  cat: 'building',
  sfx: 'rumble',
  fill: 0.75,
  build(m) {
    shopHouse(m, {
      sign: 'bd_sign_fruit', awning: 'bd_awn_green', wall: 0xdcebd2, inside: 0xf4e6b8, signBack: 0x1f5a2a,
      extra(m, k, { zf }) {
        const fruit = [0xf2a14a, 0xd8342c, 0xf2d04e, 0x8cc152, 0x7a3f8f, 0xf49ac1, 0xe8554a, 0xf6c04a];
        // stepped display stands both sides of the door, fruit heaped in crates
        m.sym(s => {
          for (let t = 0; t < 2; t++) {
            const z = zf + 0.9 - t * 0.55, y = 0.45 + t * 0.35;
            m.box(3.0, 0.1, 0.5, C.wood, s * 2.6, y, z);
            m.box(0.08, y, 0.08, C.brown, s * 2.6 + 1.4, y / 2, z + 0.2);
            m.box(0.08, y, 0.08, C.brown, s * 2.6 - 1.4, y / 2, z + 0.2);
            for (let i = 0; i < 3; i++) {
              const cx = s * 2.6 + (i - 1) * 0.95;
              m.box(0.85, 0.14, 0.45, 0xc8a06a, cx, y + 0.12, z);
              m.dome(0.4, m.rng.pick(fruit), cx, y + 0.18, z, 1, 0.45, 0.55, 0, 0, 0, 6);
            }
          }
        });
        // watermelons on the ground, a hanging bunch of bananas, price board
        for (const [x, z] of [[-0.9, zf + 1.3], [-0.3, zf + 1.45], [-0.6, zf + 0.9], [0.5, zf + 1.3]]) {
          m.sphere(0.26, 0x2f7d32, x, 0.26, z, 1.15, 1, 1, 0, 0, 0, 7);
        }
        m.capsule(0.07, 0.35, 0xf2d04e, 3.5, 2.45, zf + 0.9, 0, 0, 0.5, 5);
        m.capsule(0.07, 0.35, 0xf2d04e, 3.62, 2.45, zf + 0.9, 0, 0, 0.1, 5);
        m.box(0.8, 0.5, 0.04, 0xf4f2ec, 0.9, 1.3, zf + 0.2);
        m.box(0.05, 1.05, 0.05, C.brown, 0.9, 0.53, zf + 0.2);
      },
    });
  },
});

def('shop_tea', {
  name: '奶茶店',
  cat: 'building',
  sfx: 'rumble',
  fill: 0.75,
  build(m) {
    shopHouse(m, {
      sign: 'bd_sign_tea', awning: 'bd_awn_pink', wall: 0xf8dfe4, inside: 0xfbe6d6, signBack: 0xf29ab0, glass: [-1.4, 1.4],
      extra(m, k, { zf }) {
        // giant milk-tea cup mascot: pearls, tea, domed lid, pink straw
        const x = 3.2, z = zf + 0.7;
        m.lathe([[0, 0], [0.42, 0], [0.45, 0.45]], 0x4a2e22, x, 0, z, 0, 0, 0, 12);
        m.lathe([[0.45, 0.45], [0.55, 1.45], [0, 1.45]], 0xd8b088, x, 0, z, 0, 0, 0, 12);
        for (let i = 0; i < 7; i++) {
          const a = i * 0.9;
          m.sphere(0.07, 0x3a2219, x + Math.cos(a) * 0.43, 0.28 + (i % 2) * 0.1, z + Math.sin(a) * 0.43, 1, 1, 1, 0, 0, 0, 5);
        }
        m.cyl(0.58, 0.58, 0.08, 0xf4f2ec, x, 1.48, z, 0, 0, 0, 12);
        m.dome(0.56, 0xf4f2ec, x, 1.52, z, 1, 0.45, 1, 0, 0, 0, 10);
        m.cyl(0.06, 0.06, 1.1, 0xf08fb0, x + 0.12, 2.1, z, 0, 0, -0.25, 6);
        m.sphere(0.06, 0x2a1d17, x - 0.18, 1.0, z + 0.52, 1, 1, 0.5, 0, 0, 0, 5);
        m.sphere(0.06, 0x2a1d17, x + 0.18, 1.0, z + 0.52, 1, 1, 0.5, 0, 0, 0, 5);
        m.sphere(0.07, 0xf6b3b9, x - 0.3, 0.9, z + 0.47, 1, 0.7, 0.5, 0, 0, 0, 5);
        m.sphere(0.07, 0xf6b3b9, x + 0.3, 0.9, z + 0.47, 1, 0.7, 0.5, 0, 0, 0, 5);
        // takeaway counter + lit menu board inside
        m.box(3.0, 1.05, 0.5, 0xf6efe0, -1.6, 0.53, zf - 0.45);
        m.box(3.1, 0.06, 0.6, 0xf08fb0, -1.6, 1.08, zf - 0.45);
        m.glow(0.7);
        m.box(2.6, 0.7, 0.05, 0xfff4e0, -1.6, 2.55, SH.iz + 0.08);
        m.glow(0);
        for (let i = 0; i < 4; i++) m.cyl(0.07, 0.06, 0.2, [0xd8b088, 0xf49ac1, 0x8cc152, 0xf2d04e][i], -2.6 + i * 0.6, 1.21, zf - 0.4, 0, 0, 0, 6);
      },
    });
  },
});

def('shop_barber', {
  name: '理发店',
  cat: 'building',
  sfx: 'rumble',
  fill: 0.75,
  build(m) {
    shopHouse(m, {
      sign: 'bd_sign_barber', awning: 'bd_awn_blue', wall: 0xdce8f4, inside: 0xeef3f6, signBack: 0x173a78, glass: [-1.2, 1.2],
      extra(m, k, { W, zf, iz }) {
        // spinning-stripe barber poles on both pilasters (glass caps, lit at dusk)
        const g = new THREE.CylinderGeometry(1, 1, 1, 12, 1, true);
        m.sym(s => {
          const x = s * (W / 2 - 0.22), z = zf + 0.22;
          m.box(0.12, 0.3, 0.2, C.metal, x, 2.15, zf + 0.08);
          m.box(0.12, 0.3, 0.2, C.metal, x, 0.95, zf + 0.08);
          m.glow(0.6);
          m.geo(g, 0xffffff, x, 1.55, z, 0, 0, 0, 0.14, 1.1, 0.14, getUV('bd_barber'));
          m.glow(0);
          m.cyl(0.18, 0.18, 0.08, C.metal, x, 2.14, z, 0, 0, 0, 10);
          m.dome(0.16, 0xcfe8f0, x, 2.18, z, 1, 1, 1, 0, 0, 0, 8);
          m.cyl(0.18, 0.18, 0.08, C.metal, x, 0.96, z, 0, 0, 0, 10);
          m.cone(0.16, 0.2, C.metal, x, 0.82, z, Math.PI, 0, 0, 8);
        });
        // barber chairs facing mirrors at the back of the shop
        for (const x of [-2.3, 0, 2.3]) {
          m.box(1.4, 1.1, 0.05, 0xd8eef6, x, 1.9, iz + 0.05);
          m.box(0.7, 0.2, 0.55, C.red, x, 0.65, iz + 0.35);
          m.box(0.7, 0.75, 0.14, C.red, x, 1.05, iz + 0.6);
          m.cyl(0.08, 0.2, 0.5, C.metal, x, 0.3, iz + 0.35, 0, 0, 0, 6);
        }
      },
    });
  },
});

def('shop_super', {
  name: '超市',
  cat: 'building',
  sfx: 'rumble',
  fill: 0.75,
  build(m) {
    shopHouse(m, {
      sign: 'bd_sign_super', awning: 'bd_awn_yellow', wall: 0xe8e6e0, inside: 0xf6f1de, signBack: 0x8a1c16, glass: [-3.0, -1.1, 1.1, 3.0],
      extra(m, k, { zf, iz }) {
        // shelves inside, drinks fridge, ice-cream chest, stacked water packs, basket stack
        for (const x of [-3.2, -1.6, 1.6, 3.2]) {
          m.box(1.2, 1.8, 0.4, 0xf4f2ec, x, 0.9, iz + 0.25);
          for (let i = 0; i < 3; i++) m.box(1.1, 0.28, 0.3, m.rng.pick([0xe8554a, 0xf2c14e, 0x5aa9e6, 0x5cae4f, 0xf08fb0]), x, 0.5 + i * 0.52, iz + 0.32);
        }
        m.box(0.85, 1.9, 0.7, 0xd8342c, -3.6, 0.95, zf + 0.45);
        m.glow(0.55);
        m.box(0.7, 1.4, 0.04, 0xdff4ff, -3.6, 1.05, zf + 0.81);
        m.glow(0);
        for (let i = 0; i < 4; i++) m.box(0.6, 0.06, 0.02, 0x9fb8c8, -3.6, 0.55 + i * 0.35, zf + 0.84);
        m.box(1.3, 0.8, 0.65, 0xf4f2ec, -2.2, 0.4, zf + 0.5);
        m.box(1.2, 0.05, 0.55, 0x7fb8e0, -2.2, 0.82, zf + 0.5);
        for (let i = 0; i < 6; i++) {
          m.box(0.55, 0.32, 0.38, 0x9fd0ee, 2.3 + (i % 3) * 0.58, 0.16 + Math.floor(i / 3) * 0.34, zf + 0.6);
        }
        for (let i = 0; i < 4; i++) m.box(0.45, 0.2, 0.32, 0xe8554a, 3.9, 0.1 + i * 0.16, zf + 0.35);
      },
    });
  },
});

def('shop_pharmacy', {
  name: '药店',
  cat: 'building',
  sfx: 'rumble',
  fill: 0.75,
  build(m) {
    shopHouse(m, {
      sign: 'bd_sign_pharm', awning: 'bd_awn_green', wall: 0xf0f2ee, inside: 0xf2f8f2, signBack: 0x145c38, glass: [-1.3, 1.3], roof: 0x9aa39c,
      extra(m, k, { W, zf, iz }) {
        // glowing green cross light box on a bracket, visible along the street from both sides
        const x = W / 2 - 0.35, y = 5.9, z = zf + 0.95;
        m.box(0.1, 0.1, 0.95, C.metal, x, y, zf + 0.45);
        m.box(0.16, 1.25, 1.25, 0xf4f2ec, x, y, z);
        m.glow(0.9);
        m.box(0.2, 0.34, 0.95, 0x22b562, x, y, z);
        m.box(0.2, 0.95, 0.34, 0x22b562, x, y, z);
        m.glow(0);
        // flat cross on the glass + white medicine shelves + counter
        m.glow(0.6);
        m.box(0.7, 0.22, 0.03, 0x22b562, -2.8, 2.3, zf - 0.06);
        m.box(0.22, 0.7, 0.03, 0x22b562, -2.8, 2.3, zf - 0.06);
        m.glow(0);
        for (const sx of [-3.0, -1.0, 1.0, 3.0]) {
          m.box(1.5, 2.3, 0.35, 0xf4f2ec, sx, 1.3, iz + 0.2);
          for (let i = 0; i < 4; i++) m.box(1.35, 0.2, 0.25, m.rng.pick([0x9fd0ee, 0xf4f2ec, 0xf2c14e, 0xe8554a, 0x8cc152]), sx, 0.55 + i * 0.5, iz + 0.28);
        }
        m.box(2.6, 1.0, 0.5, 0xf4f2ec, 1.8, 0.5, zf - 0.5);
        m.box(2.7, 0.05, 0.6, 0x22b562, 1.8, 1.02, zf - 0.5);
      },
    });
  },
});

def('shop_hardware', {
  name: '五金店',
  cat: 'building',
  sfx: 'rumble',
  fill: 0.75,
  build(m) {
    shopHouse(m, {
      sign: 'bd_sign_hw', awning: 'bd_awn_blue', wall: 0xe8dcc4, inside: 0xeadbb8, signBack: 0x1d3f7a, roof: 0x8a8f96,
      extra(m, k, { W, zf, iz }) {
        // goods spill onto the pavement: hanging buckets and brooms, a leaning ladder, pipes, hose coils
        m.box(W - 1.4, 0.06, 0.06, C.dgrey, 0, 2.7, zf + 0.25);
        const cols = [0xd8342c, 0x2f63c9, 0xf2c14e, 0x5cae4f, 0xf4f2ec];
        for (let i = 0; i < 6; i++) {
          const x = -3.6 + i * 0.55;
          m.box(0.02, 0.25, 0.02, C.dgrey, x, 2.55, zf + 0.25);
          m.cyl(0.19, 0.14, 0.34, cols[i % 5], x, 2.25, zf + 0.25, 0, 0, 0, 8);
        }
        for (let i = 0; i < 3; i++) {
          const x = 1.4 + i * 0.3;
          m.cyl(0.02, 0.02, 1.3, C.wood, x, 1.95, zf + 0.25, 0, 0, 0, 4);
          m.box(0.28, 0.35, 0.08, i % 2 ? 0xd8342c : 0x3f8f4a, x, 1.2, zf + 0.25);
        }
        // aluminium ladder leaning on the right pilaster
        const lx = 4.55;
        m.sym(s => beam(m, [lx + s * 0.25, 0, zf + 0.85], [lx + s * 0.25, 3.0, zf + 0.05], 0.06, 0xc4c8cc));
        for (let i = 1; i < 8; i++) {
          const t = i / 8;
          m.box(0.5, 0.05, 0.05, 0xc4c8cc, lx, 3.0 * t, zf + 0.85 - 0.8 * t);
        }
        // PVC pipes on a low rack, hose coils, a stack of paint tins
        for (let i = 0; i < 5; i++) m.cyl(0.06, 0.06, 2.4, 0xf4f2ec, -3.1, 0.07 + (i % 2) * 0.1, zf + 0.75 + (i % 3) * 0.12, 0, 0, 90 * D, 6);
        m.torus(0.3, 0.07, 0x5cae4f, -1.2, 0.08, zf + 0.9, 90 * D, 0, 0, Math.PI * 2, 4, 10);
        m.torus(0.26, 0.07, 0xf2a14a, -1.2, 0.22, zf + 0.9, 90 * D, 0, 0, Math.PI * 2, 4, 10);
        for (let i = 0; i < 4; i++) m.cyl(0.16, 0.16, 0.22, i % 2 ? 0xd9dde2 : 0xe8554a, 0.4 + (i % 2) * 0.36, 0.11 + Math.floor(i / 2) * 0.22, zf + 0.8, 0, 0, 0, 8);
        // crowded shelves inside
        for (const sx of [-2.8, 0, 2.8]) {
          m.box(2.2, 2.4, 0.4, C.wood, sx, 1.35, iz + 0.22);
          for (let i = 0; i < 4; i++) m.box(2.0, 0.24, 0.3, m.rng.pick([0x9aa0a6, 0xd8342c, 0x2f63c9, 0xf2c14e, 0x6b7079]), sx, 0.55 + i * 0.55, iz + 0.3);
        }
      },
    });
  },
});

def('shop_noodle', {
  name: '兰州拉面',
  cat: 'building',
  sfx: 'rumble',
  fill: 0.75,
  build(m) {
    shopHouse(m, {
      sign: 'bd_sign_noodle', awning: 'bd_awn_green', wall: 0xd7ece6, inside: 0xf5e2b8, signBack: 0x0d5a4d, glass: [-1.6, 1.6, 3.6],
      extra(m, k, { zf, iz }) {
        // clear plastic strip curtain in the door (门帘), steaming stock pot on a stove, menu light box
        const strips = new Quads(m);
        for (let i = 0; i < 7; i++) strips.add2(-1.35 + i * 0.45, 1.48, zf - 0.07, 0.36, 2.66);
        strips.flush(0xcfe6ee);
        m.box(0.8, 0.55, 0.8, C.dgrey, 2.6, 0.28, zf + 0.6);
        m.cyl(0.4, 0.38, 0.6, 0xc9cdd2, 2.6, 0.85, zf + 0.6, 0, 0, 0, 10);
        m.cyl(0.42, 0.42, 0.05, 0x9aa0a6, 2.6, 1.17, zf + 0.6, 0, 0, 0, 10);
        m.sphere(0.24, 0xf6f3ee, 2.6, 1.45, zf + 0.6, 1.3, 0.8, 1.3, 0, 0, 0, 6);
        m.sphere(0.18, 0xf6f3ee, 2.7, 1.78, zf + 0.5, 1.2, 0.8, 1.2, 0, 0, 0, 6);
        m.glow(0.6);
        m.box(2.0, 0.8, 0.06, 0xfff2cc, -3.0, 2.4, zf - 0.08);
        m.glow(0);
        for (let i = 0; i < 3; i++) m.box(1.6, 0.06, 0.02, 0x16806f, -3.0, 2.15 + i * 0.22, zf - 0.04);
        // tables inside
        for (const x of [-3.0, 3.0]) {
          m.box(1.2, 0.06, 0.8, 0xf4f2ec, x, 0.75, iz + 0.45);
          m.box(0.1, 0.72, 0.1, C.metal, x, 0.36, iz + 0.45);
        }
      },
    });
  },
});

def('shop_restaurant', {
  name: '饭店',
  cat: 'building',
  sfx: 'rumble',
  fill: 0.75,
  build(m) {
    shopHouse(m, {
      sign: 'bd_sign_rest', awning: 'bd_awn_red', wall: 0xf1dcc6, inside: 0xf6d7a6, signBack: 0x6a120e, glass: [-2.6, -0.8, 0.8, 2.6], laundry: false,
      extra(m, k, { W, zf, iz }) {
        // red lanterns under the awning edge
        for (const x of [-3.4, -1.15, 1.15, 3.4]) lantern(m, x, 2.8, zf + 1.1, 0.3);
        // live-seafood tank by the door, lucky kumquat trees in pots, round tables with red cloths inside
        m.box(1.6, 0.6, 0.7, 0x9aa0a6, -3.3, 0.3, zf + 0.5);
        m.glow(0.5);
        m.box(1.5, 0.8, 0.6, 0x6cc0dc, -3.3, 1.0, zf + 0.5);
        m.glow(0);
        m.box(1.6, 0.08, 0.7, 0x9aa0a6, -3.3, 1.44, zf + 0.5);
        for (let i = 0; i < 3; i++) m.ellipsoid(0.12, 0.06, 0.04, 0xf2a14a, -3.7 + i * 0.4, 0.9 + (i % 2) * 0.2, zf + 0.81, 0, 0, 0, 5);
        m.sym(s => {
          const x = s * 1.3;
          m.cyl(0.28, 0.22, 0.45, 0xa8281f, x, 0.23, zf + 0.45, 0, 0, 0, 8);
          m.sphere(0.45, 0x3f8f4a, x, 0.95, zf + 0.45, 1, 1.1, 1, 0, 0, 0, 7);
          for (let i = 0; i < 5; i++) m.sphere(0.07, 0xf2a14a, x + Math.cos(i * 1.3) * 0.38, 0.9 + (i % 3) * 0.15, zf + 0.45 + Math.sin(i * 1.3) * 0.38, 1, 1, 1, 0, 0, 0, 4);
        });
        for (const x of [-2.9, -1.7, 1.7, 2.9]) {
          m.cyl(0.36, 0.36, 0.2, 0xd8342c, x, 0.78, iz + 0.36, 0, 0, 0, 10);
          m.cyl(0.06, 0.16, 0.66, C.brown, x, 0.33, iz + 0.36, 0, 0, 0, 6);
        }
      },
    });
  },
});

// =============================================================================================
// Public buildings
// =============================================================================================

// ---- 写字楼: glass office tower on a stone podium, setback crown, helipad, spire -----------------
def('office_tower', {
  name: '写字楼',
  cat: 'building',
  sfx: 'rumble',
  fill: 0.85,
  build(m) {
    const k = winKit(m, 0.33);
    const glass = 0x5f9fb4, glass2 = 0x4d879c, silver = 0xd3dbe1, stone = 0xbcb4a6;
    const PH = 10, T1 = 100, T2 = 112, FH = 4, TZ = -2;
    const litW = new Quads(m), litC = new Quads(m), mull = new Quads(m);
    // podium with a glazed lobby, canopy, revolving door, steps, flagpoles, planters
    m.box(40.4, 0.4, 36.4, C.base, 0, 0.2, 0);
    m.box(40, PH, 36, stone, 0, PH / 2, 0);
    for (const y of [3.4, 6.8]) m.box(40.2, 0.3, 36.2, 0xd6cfc2, 0, y, 0);
    m.box(40.4, 0.6, 36.4, silver, 0, PH, 0);
    m.push(0, 0, 18);
    m.box(18, 8, 0.6, glass2, 0, 4.4, 0.3);
    for (let x = -8; x <= 8; x += 2.25) mull.add(x, 4.4, 0.62, 0.14, 8);
    mull.add(0, 4.1, 0.63, 18, 0.18);
    litW.add(-5, 2.3, 0.61, 6.5, 3.6);
    litW.add(5, 2.3, 0.61, 6.5, 3.6);
    m.box(22, 0.5, 4.2, silver, 0, 6.4, 2.1);
    m.glow(0.6);
    m.box(21, 0.08, 4.0, 0xfff4dc, 0, 6.12, 2.1);
    m.glow(0);
    m.cyl(1.5, 1.5, 3.0, 0x7fb8c8, 0, 1.9, 1.2, 0, 0, 0, 10);
    m.cyl(1.6, 1.6, 0.3, silver, 0, 3.55, 1.2, 0, 0, 0, 10);
    m.box(24, 0.2, 3.0, C.concrete, 0, 0.3, 1.5);
    m.box(20, 0.2, 1.6, C.concrete, 0, 0.5, 0.8);
    m.glow(0.8);
    m.decal(12, 2.6, 'bd_office', 0, 8.6, 0.02);
    m.glow(0);
    for (const x of [-3, 0, 3]) {
      m.cyl(0.07, 0.1, 12, C.metal, x, 6, 4.3, 0, 0, 0, 5);
      m.plane(1.8, 1.2, C.red, x + 0.9, 11.3, 4.3);
    }
    m.sym(s => {
      m.box(6, 0.8, 1.6, C.concrete, s * 15, 0.4, 1.0);
      for (let i = 0; i < 4; i++) m.sphere(0.8, i % 2 ? C.leaf : C.deepGreen, s * (12.8 + i * 1.5), 1.3, 1.0, 1, 0.8, 1, 0, 0, 0, 6);
      for (let x = 11; x <= 19; x += 2.6) k.win(s * x - s * 1.3, 4.9, 0, 2.2, 2.6, { mull: 1, frame: 0.1, lit: 0.5 });
    });
    m.pop();
    // podium roof garden in front of the tower
    for (let x = -16; x <= 16; x += 4) {
      m.box(3, 0.6, 1.4, C.concrete, x, PH + 0.6, 16);
      m.dome(0.9, C.leaf, x, PH + 0.9, 16, 1.4, 0.8, 0.7, 0, 0, 0, 6);
    }
    // tower: glass body, silver floor bands and mullion fins, ~1/3 of the bays lit
    const tier = (w, y0, y1, fins) => {
      m.box(w, y1 - y0, w, glass, 0, (y0 + y1) / 2, TZ);
      for (let y = y0 + FH; y < y1 - 0.5; y += FH) m.box(w + 0.3, 0.45, w + 0.3, silver, 0, y, TZ);
      const step = w / fins;
      for (let i = 0; i <= fins; i++) {
        const u = -w / 2 + i * step;
        m.box(0.35, y1 - y0, 0.7, silver, u, (y0 + y1) / 2, TZ + w / 2);
        m.box(0.35, y1 - y0, 0.7, silver, u, (y0 + y1) / 2, TZ - w / 2);
        m.box(0.7, y1 - y0, 0.35, silver, w / 2, (y0 + y1) / 2, TZ + u);
        m.box(0.7, y1 - y0, 0.35, silver, -w / 2, (y0 + y1) / 2, TZ + u);
      }
      for (const [face, ry] of [[0, 0], [1, Math.PI], [2, Math.PI / 2], [3, -Math.PI / 2]]) {
        const dx = face === 2 ? w / 2 : face === 3 ? -w / 2 : 0, dz = face === 0 ? w / 2 : face === 1 ? -w / 2 : 0;
        m.push(dx, 0, TZ + dz, 0, ry, 0);
        for (let y = y0; y < y1 - 1; y += FH) {
          for (let i = 0; i < fins; i++) {
            if (!m.rng.chance(0.33)) continue;
            (m.rng.chance(0.7) ? litW : litC).add(-w / 2 + (i + 0.5) * step, y + FH / 2 + 0.1, 0.04, step - 0.5, FH - 0.7);
          }
        }
        m.pop();
      }
    };
    tier(32, PH, T1, 8);
    tier(26, T1, T2, 6);
    // setback terrace parapet, rooftop plant, crown frame with glow strips, helipad, spire + beacon
    parapet(m, 32.4, 32.4, T1 + 0.2, 1.2, 0.3, silver, 0, TZ);
    m.box(4, 2, 3, C.grey, -12, T1 + 1, TZ - 12);
    m.box(4, 2, 3, C.grey, 12, T1 + 1, TZ - 12);
    m.box(26.4, 0.4, 26.4, silver, 0, T2 + 0.2, TZ);
    m.decal(10, 10, 'bd_heli', 0, T2 + 0.42, TZ + 3, -90 * D, 0, 0);
    m.sym(s => {
      for (const z of [-1, 1]) m.box(0.6, 4, 0.6, silver, s * 12.8, T2 + 2.2, TZ + z * 12.8);
    });
    for (const z of [-12.8, 12.8]) m.box(26.2, 0.6, 0.6, silver, 0, T2 + 4.0, TZ + z);
    m.sym(s => m.box(0.6, 0.6, 26.2, silver, s * 12.8, T2 + 4.0, TZ));
    m.glow(0.9);
    for (const z of [-13.12, 13.12]) m.box(26.2, 0.18, 0.05, 0xdff4ff, 0, T2 + 3.9, TZ + z);
    m.sym(s => m.box(0.05, 0.18, 26.2, 0xdff4ff, s * 13.12, T2 + 3.9, TZ));
    m.glow(0);
    m.cyl(0.12, 0.45, 7.5, silver, -9, T2 + 4.2, TZ - 9, 0, 0, 0, 6);
    m.glow(1);
    m.sphere(0.35, C.red, -9, T2 + 8.1, TZ - 9, 1, 1, 1, 0, 0, 0, 6);
    m.glow(0);
    litW.flush(0xfff0c8, 0.8);
    litC.flush(0xe6f4ff, 0.8);
    mull.flush(C.dgrey);
    k.flush();
  },
});

// ---- 商场: shopping mall with glass atrium, 幸福广场 sign, LED screen, shops along the front ---------
def('mall', {
  name: '商场',
  cat: 'building',
  sfx: 'rumble',
  fill: 0.85,
  build(m) {
    const k = winKit(m, 0.4);
    const W = 80, Dd = 53.6, Z0 = -1.2, zf = Z0 + Dd / 2, zb = Z0 - Dd / 2, RY = 22.6;
    const cream = 0xf1e4cc, stone = 0xc9c1b2, trim = 0xf8f4ea, terra = 0xc8765a;
    const strip = new Quads(m), mull = new Quads(m), lit = new Quads(m), paint = new Quads(m);
    m.box(W + 0.4, 0.3, Dd + 0.4, C.base, 0, 0.15, Z0);
    m.box(W, 6, Dd, stone, 0, 3.15, Z0);
    m.box(W, 16.3, Dd, cream, 0, 14.3, Z0);
    m.box(W + 0.6, 0.5, Dd + 0.6, trim, 0, 6.2, Z0);
    m.box(W + 0.3, 0.6, Dd + 0.3, terra, 0, 19.9, Z0);
    parapet(m, W + 0.8, Dd + 0.8, 21.9, 0.8, 0.5, terra, 0, Z0);
    parapet(m, W + 0.8, Dd + 0.8, 22.7, 0.7, 0.3, trim, 0, Z0);
    m.box(W, 0.2, Dd, 0x9c9a94, 0, RY - 0.1, Z0);
    // ---- front
    m.push(0, 0, zf);
    // glass atrium with mullion grid, lit entrance, canopy, steps
    m.box(22, 24.5, 2.4, 0x5f9fb4, 0, 12.4, 1.2);
    for (let x = -11; x <= 11.01; x += 2.75) mull.add(x, 12.4, 2.42, 0.18, 24.5);
    for (let y = 2; y < 24.5; y += 4) mull.add(0, y, 2.42, 22, 0.2);
    for (let x = -9.625; x < 11; x += 2.75) for (let y = 6.5; y < 23; y += 4) if (m.rng.chance(0.3)) lit.add(x, y + 2, 2.41, 2.5, 3.6);
    k.win(-2.1, 1.75, 2.4, 3.6, 2.9, { lit: 1, mull: 1, frame: 0.12 });
    k.win(2.1, 1.75, 2.4, 3.6, 2.9, { lit: 1, mull: 1, frame: 0.12 });
    m.box(16, 0.5, 2.0, trim, 0, 4.2, 3.4);
    m.glow(0.8);
    m.box(16, 0.1, 0.05, 0xfff1c8, 0, 4.0, 4.42);
    m.glow(0);
    m.box(18, 0.15, 2.0, C.concrete, 0, 0.35, 3.4);
    // the big sign on a frame above the atrium, lit at dusk
    m.box(26, 5.4, 0.8, 0x33363d, 0, 27.3, 1.2);
    m.glow(0.9);
    m.decal(25.4, 5.9, 'bd_mall', 0, 27.3, 1.63);
    m.glow(0);
    // LED screen on the right section, fins either side of it
    m.box(19, 10.2, 0.6, C.ink, 26, 14.2, 0.3);
    m.glow(0.9);
    m.decal(18, 9.6, 'bd_screen', 26, 14.2, 0.62);
    m.glow(0);
    for (const x of [14, 38]) m.box(0.8, 13.6, 0.8, trim, x, 13.3, 0.4);
    // window bands and vertical fins on the left section
    for (const y of [9.6, 13.6, 17.6]) strip.add(-25.5, y, 0.03, 27, 1.8);
    for (let x = -38; x <= -13; x += 5) m.box(0.5, 13.6, 0.5, trim, x, 13.3, 0.25);
    // shops along the ground floor: lit fronts, small signs above a continuous canopy
    const signs = ['bd_sign_tea', 'bd_sign_rest', 'bd_sign_fruit', 'bd_sign_super', 'bd_sign_pharm', 'bd_sign_baozi'];
    [-33.5, -24.5, -15.5, 15.5, 24.5, 33.5].forEach((x, i) => {
      k.win(x, 2.1, 0, 7.6, 3.4, { lit: 0.7, mull: 2, frame: 0.12 });
      m.glow(0.35);
      m.decal(6.8, 1.6, signs[i], x, 5.0, 0.03);
      m.glow(0);
    });
    m.sym(s => m.box(26, 0.3, 2.0, trim, s * 24.5, 4.05, 1.0));
    m.sym(s => { for (const x of [11.5, 38.5]) { m.box(2.2, 0.7, 1.2, C.concrete, s * x, 0.35, 1.6); m.dome(0.9, C.leaf, s * x, 0.7, 1.6, 1.1, 0.9, 0.6, 0, 0, 0, 6); } });
    m.pop();
    // ---- sides: window bands, a car-park entrance on the right, a side door on the left
    for (const s of [1, -1]) {
      m.push((s * W) / 2, 0, Z0, 0, (s * Math.PI) / 2, 0);
      for (const y of [9.6, 13.6, 17.6]) strip.add(0, y, 0.03, Dd - 10, 1.8);
      if (s > 0) { k.win(8, 2.3, 0, 7, 4.2, { dark: true, frame: 0.25, mull: 0 }); m.box(8, 0.4, 0.9, trim, 8, 4.8, 0.45); }
      else k.win(0, 2.2, 0, 6, 3.2, { lit: 0.8, mull: 2, frame: 0.12 });
      m.pop();
    }
    // ---- back: loading dock with shutter doors
    m.push(0, 0, zb, 0, Math.PI, 0);
    for (let x = -20; x <= 20; x += 10) k.louver.add(x, 2.2, 0.03, 5, 4.2);
    m.box(52, 1.2, 2, C.concrete, 0, 0.6, 1.0);
    for (const y of [9.6, 13.6, 17.6]) strip.add(0, y, 0.03, 60, 1.8);
    m.pop();
    // ---- roof: glass skylight pyramid, HVAC units with fans, rooftop car park lines
    m.box(21.6, 0.5, 21.6, trim, 0, RY + 0.2, Z0 + 4);
    m.cone(15.2, 7, 0x86bccb, 0, RY + 3.9, Z0 + 4, 0, Math.PI / 4, 0, 4);
    m.glow(0.4);
    m.cyl(0.6, 0.6, 0.6, 0xfff1c8, 0, RY + 7.6, Z0 + 4, 0, 0, 0, 6);
    m.glow(0);
    for (let i = 0; i < 6; i++) {
      const x = -30 + (i % 3) * 8, z = zb + 8 + Math.floor(i / 3) * 6;
      m.box(5, 2, 3, 0xd9dde2, x, RY + 1, z);
      m.cyl(0.9, 0.9, 0.2, C.dgrey, x - 1.2, RY + 2.1, z, 0, 0, 0, 8);
      m.cyl(0.9, 0.9, 0.2, C.dgrey, x + 1.2, RY + 2.1, z, 0, 0, 0, 8);
    }
    for (let i = 0; i < 10; i++) paint.add(15 + i * 2.6, RY + 0.02, zb + 9, 0.15, 5, true);
    for (let i = 0; i < 10; i++) paint.add(15 + i * 2.6, RY + 0.02, zb + 17, 0.15, 5, true);
    paint.add(26.7, RY + 0.02, zb + 13, 24, 0.15, true);
    strip.flush(0x4d879c);
    mull.flush(0xe9edf0);
    lit.flush(0xfff0c8, 0.8);
    paint.flush(0xf4f2ec);
    k.flush();
  },
});

// ---- 教学楼: 幸福小学 teaching block with open corridors, clock tower, slogan, running-track red ----
def('school', {
  name: '教学楼',
  cat: 'building',
  sfx: 'rumble',
  fill: 0.65,
  build(m) {
    const k = winKit(m, 0.33);
    const W = 60, Y0 = 0.45, FH = 3.6, NF = 5, TOP = Y0 + NF * FH, zf = 3.3, zb = -7.7, zc = 6.0;
    const white = 0xf4f1ea, track = 0xc4513d, grey = 0xb9b3a8;
    const red = new Quads(m), lines = new Quads(m);
    // plinth in running-track red with white lane lines, classroom block, corridor slabs and parapets
    m.box(W + 0.6, Y0, zc - zb + 0.8, track, 0, Y0 / 2, (zc + zb) / 2 + 0.2);
    for (const y of [0.12, 0.3]) lines.add(0, y, zc + 0.61, W + 0.4, 0.05);
    m.box(W, TOP - Y0, zf - zb, white, 0, (TOP + Y0) / 2, (zf + zb) / 2);
    m.box(W + 0.4, 0.5, zc - zb + 0.4, grey, 0, TOP + 0.05, (zc + zb) / 2);
    parapet(m, W + 0.4, zc - zb + 0.4, TOP + 0.3, 0.9, 0.25, white, 0, (zc + zb) / 2);
    for (let f = 1; f < NF; f++) {
      const y = Y0 + f * FH;
      m.box(W, 0.26, zc - zf, white, 0, y, (zc + zf) / 2);
      m.box(W, 1.05, 0.2, white, 0, y + 0.64, zc - 0.1);
      red.add(0, y + 0.95, zc + 0.01, W, 0.34);
      m.box(W + 0.1, 0.1, 0.36, grey, 0, y + 1.2, zc - 0.1);
    }
    m.glow(0.3);
    m.decal(15, 1.1, 'bd_slogan', 16.5, Y0 + 2 * FH + 0.84, zc + 0.02);
    m.glow(0);
    for (const x of [-29.7, -24.5, -18.5, -12.5, 12.5, 18.5, 24.5, 29.7]) m.box(0.45, TOP - Y0, 0.45, white, x, (TOP + Y0) / 2, zc - 0.2);
    // classrooms behind the corridor: two windows + a door each, per floor
    m.push(0, 0, zf);
    for (let f = 0; f < NF; f++) {
      const y = Y0 + f * FH;
      for (const cx of [-26.5, -20.3, -14.1, -7.9, 7.9, 14.1, 20.3, 26.5]) {
        k.win(cx - 1.6, y + 1.8, 0, 2.2, 1.7, { mull: 2, frame: 0.08 });
        k.win(cx + 1.0, y + 1.8, 0, 1.5, 1.7, { mull: 1, frame: 0.08 });
        k.dark.add(cx + 2.55, y + 1.1, 0.03, 0.9, 2.1);
      }
    }
    m.pop();
    // back and ends
    m.push(0, 0, zb, 0, Math.PI, 0);
    for (let f = 0; f < NF; f++) for (let x = -27; x <= 27; x += 4.5) if (Math.abs(x) > 3) k.win(x, Y0 + f * FH + 1.9, 0, 2.4, 1.8, { mull: 1, frame: 0.08 });
    m.pop();
    for (const s of [1, -1]) {
      m.push((s * W) / 2, 0, (zc + zb) / 2, 0, (s * Math.PI) / 2, 0);
      for (let f = 0; f < NF; f++) for (const x of [-3, 3]) k.win(x, Y0 + f * FH + 1.9, 0, 1.8, 1.6, { mull: 1, frame: 0.08 });
      red.add(0, (TOP + Y0) / 2, 0.02, 0.8, TOP - Y0);
      m.pop();
    }
    // central stair / entrance tower: track-red fins, glass stair windows, clock, 幸福小学 sign
    const tz = zc + 1.0, tH = TOP + 1.6;
    m.box(10, tH, tz - zb, white, 0, tH / 2, (tz + zb) / 2);
    m.sym(s => m.box(0.7, tH + 0.3, 0.7, track, s * 4.8, (tH + 0.3) / 2, tz - 0.2));
    m.box(10.4, 0.4, tz - zb + 0.4, grey, 0, tH, (tz + zb) / 2);
    m.push(0, 0, tz);
    for (let f = 1; f < NF; f++) k.win(0, Y0 + f * FH + 0.4, 0, 3.2, 2.2, { mull: 2, frame: 0.1 });
    m.box(7, 0.4, 2.6, white, 0, 3.4, 1.3);
    m.sym(s => m.box(0.35, 3.0, 0.35, track, s * 3.2, 1.7, 2.3));
    k.win(-0.9, Y0 + 1.3, 0, 1.6, 2.4, { lit: 0.8, mull: 1, frame: 0.12 });
    k.win(0.9, Y0 + 1.3, 0, 1.6, 2.4, { lit: 0.8, mull: 1, frame: 0.12 });
    m.box(6.4, 0.15, 2.2, C.concrete, 0, Y0 + 0.07, 1.1);
    m.decal(2.3, 2.3, 'bd_clock', 0, TOP - 1.9, 0.03);
    m.glow(0.3);
    m.decal(9.2, 2.0, 'bd_school', 0, TOP + 0.55, 0.03);
    m.glow(0);
    m.pop();
    // roof: water tank, photovoltaic panels, little weather station
    waterTank(m, -20, TOP + 0.55, -4, 0.9, 0xd9dde2);
    for (let i = 0; i < 6; i++) m.box(4, 0.1, 2, 0x31415e, 8 + (i % 3) * 5, TOP + 1.1, -5 + Math.floor(i / 3) * 3, 28 * D, 0, 0);
    m.box(0.1, 2, 0.1, C.metal, -26, TOP + 1.5, -5);
    m.box(0.8, 0.1, 0.1, C.metal, -26, TOP + 2.4, -5);
    red.flush(track);
    lines.flush(white);
    k.flush();
  },
});

// ---- 小区大门: 幸福里 compound gate — guardhouse, tiled beam roof, barrier, telescopic gate --------
def('compound_gate', {
  name: '小区大门',
  cat: 'building',
  sfx: 'rumble',
  fill: 0.3,
  build(m) {
    const k = winKit(m, 0.8);
    const white = 0xf1ece1, stone = 0x8f8a82, tile = 0x6f7780;
    const zig = new Quads(m);
    // guardhouse (left) — its left wall rises as the left pillar of the gate
    const gx = -4.9;
    m.box(3.6, 0.3, 3.9, stone, gx, 0.15, 0);
    m.box(3.4, 3.1, 3.6, white, gx, 1.85, 0);
    m.box(1.3, 5.0, 1.6, stone, -5.95, 2.5, 0);
    m.push(gx, 0, 0);
    roofLoft(m, { c0: rectPoly(2.2, 2.3), c1: rectPoly(0.9, 0.001), y0: 3.35, y1: 4.5, nu: 3, nt: 2, lift: 0.22, flare: 0.1, thick: 0.15, col: tile, under: 0x4a4e56, ridges: 0.07 });
    m.box(1.9, 0.2, 0.22, shade(tile, 0.8), 0, 4.55, 0);
    m.pop();
    m.push(gx + 0.7, 0, 1.8);
    k.win(0, 1.9, 0, 1.6, 1.2, { mull: 1, frame: 0.1 });
    m.decal(1.1, 0.45, 'bd_guard', 0, 2.95, 0.03);
    m.pop();
    m.push(gx + 1.7, 0, 0, 0, Math.PI / 2, 0);
    k.win(0, 1.9, 0, 2.2, 1.2, { lit: 1, mull: 1, frame: 0.1 });
    m.box(2.4, 0.08, 0.35, white, 0, 1.25, 0.15);
    m.pop();
    // right pillar
    m.box(1.5, 0.3, 1.8, stone, 5.95, 0.15, 0);
    m.box(1.3, 5.0, 1.6, stone, 5.95, 2.5, 0);
    // beam with a small tiled roof and the 幸福里 plaque, lanterns hanging below
    m.box(13.2, 1.7, 1.5, white, 0, 5.75, 0);
    m.box(13.4, 0.2, 1.7, stone, 0, 4.9, 0);
    m.decal(4.8, 1.58, 'bd_gate', 0, 5.8, 0.77);
    m.decal(4.8, 1.58, 'bd_gate', 0, 5.8, -0.77, 0, Math.PI, 0);
    roofLoft(m, { c0: rectPoly(6.85, 1.35), c1: rectPoly(5.8, 0.001), y0: 6.6, y1: 7.5, nu: 4, nt: 2, lift: 0.3, flare: 0.1, thick: 0.15, col: tile, under: 0x4a4e56, ridges: 0.07, tips: 0.2 });
    m.box(11.8, 0.26, 0.3, shade(tile, 0.8), 0, 7.55, 0);
    for (const x of [-2.6, 2.6]) lantern(m, x, 4.8, 0, 0.32);
    // boom barrier (red / white arm) and the "please register" sign
    m.box(0.4, 1.0, 0.4, 0xf2c14e, 4.7, 0.5, 1.2);
    m.box(0.5, 0.1, 0.5, C.dgrey, 4.7, 1.05, 1.2);
    for (let i = 0; i < 5; i++) m.box(1.5, 0.1, 0.1, i % 2 ? C.white : C.red, 3.75 - i * 1.5, 0.92, 1.2);
    m.box(0.06, 1.3, 0.06, C.metal, 5.5, 0.65, 2.1);
    m.decal(0.9, 0.45, 'bd_carsign', 5.5, 1.35, 2.14);
    // telescopic sliding gate (伸缩门) folded against the right pillar, with its lit drive head
    zig.add2(3.5, 0.85, -0.6, 3.4, 1.5);
    zig.flush(0xffffff, 0, 'bd_zigzag');
    m.box(3.4, 0.1, 0.12, 0xd9dde2, 3.5, 1.62, -0.6);
    m.box(0.5, 1.9, 0.5, 0xd9dde2, 1.6, 0.95, -0.6);
    m.glow(1);
    m.box(0.52, 0.12, 0.52, 0x3d8fe0, 1.6, 1.95, -0.6);
    m.glow(0);
    for (const x of [2.2, 3.5, 4.8]) m.cyl(0.1, 0.1, 0.12, C.ink, x, 0.08, -0.6, 90 * D, 0, 0, 6);
    k.flush();
  },
});

// =============================================================================================
// Traditional Chinese architecture
// =============================================================================================
const TR = { red: 0xb83a2e, col: 0xb52a22, glaze: 0xf0b83a, glazeR: 0xd49a2a, soffit: 0x2f6f6a, marble: 0xefece4, stone: 0xd9d4c8, beam: 0x2f7f86, bracket: 0x7a1f18 };

/** 鸱吻: curling ridge-end ornament, profile in the XY plane, curl pointing towards the ridge centre. */
function chiwen(m, x, y, z, s, h, col) {
  m.push(x, y, z, 0, 0, 0, [s * h, h, h]);
  m.extrude([[-0.5, 0], [0.4, 0], [0.45, 0.7], [0.3, 1.25], [0, 1.55], [-0.38, 1.45], [-0.15, 1.2], [0.05, 1.0], [-0.1, 0.72], [-0.5, 0.55]], 0.32, col);
  m.pop();
}

/** Marble balustrade along a straight run from (x0, z0) to (x1, z1) at deck height y. */
function balustrade(m, x0, z0, x1, z1, y, col, step = 1.8) {
  const len = Math.hypot(x1 - x0, z1 - z0), ry = Math.atan2(z1 - z0, x1 - x0), n = Math.max(1, Math.round(len / step));
  m.box(len, 0.5, 0.12, col, (x0 + x1) / 2, y + 0.3, (z0 + z1) / 2, 0, -ry, 0);
  m.box(len, 0.08, 0.2, col, (x0 + x1) / 2, y + 0.6, (z0 + z1) / 2, 0, -ry, 0);
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    m.box(0.2, 0.85, 0.2, col, lerp(x0, x1, t), y + 0.43, lerp(z0, z1, t));
  }
}

// ---- 寺庙大殿: red walls and columns, lattice doors, double-eave yellow glazed hip roof ------------
def('temple_hall', {
  name: '寺庙大殿',
  cat: 'landmark',
  sfx: 'gong',
  fill: 0.6,
  build(m) {
    const zc = -0.8, PY = 1.2, doors = new Quads(m), paint = new Quads(m), brackets = new Quads(m);
    // stone platform, front steps, marble balustrade
    m.box(20, PY, 12.4, TR.stone, 0, PY / 2, zc);
    m.box(20.2, 0.18, 12.6, 0xc9c3b6, 0, PY - 0.09, zc);
    for (let i = 0; i < 3; i++) m.box(5.2, PY - 0.3 - i * 0.3, 0.55, TR.stone, 0, (PY - 0.3 - i * 0.3) / 2, 5.4 + 0.27 + i * 0.54);
    m.sym(s => m.box(0.5, 0.55, 1.7, 0xc9c3b6, s * 2.85, 0.75, 6.1, -0.55, 0, 0));
    for (const s of [1, -1]) balustrade(m, s * 2.9, 5.3, s * 9.9, 5.3, PY, TR.marble, 1.75);
    for (const s of [1, -1]) balustrade(m, s * 9.9, 5.3, s * 9.9, -6.9, PY, TR.marble, 2.05);
    balustrade(m, -9.9, -6.9, 9.9, -6.9, PY, TR.marble, 2.2);
    // walls, columns, beams with caihua, bracket band
    m.box(15.2, 5.2, 7.7, TR.red, 0, PY + 2.6, -1.55);
    const colX = [-7.6, -4.8, -1.7, 1.7, 4.8, 7.6];
    for (const x of colX) {
      m.cyl(0.3, 0.32, 5.2, TR.col, x, PY + 2.6, 3.8, 0, 0, 0, 8);
      m.box(0.72, 0.22, 0.72, 0xc9c3b6, x, PY + 0.11, 3.8);
    }
    for (const x of [-7.6, 7.6]) for (const z of [-5.4, 2.3]) m.cyl(0.3, 0.32, 5.2, TR.col, x, PY + 2.6, z, 0, 0, 0, 8);
    m.box(16.0, 0.65, 0.5, TR.beam, 0, PY + 4.95, 3.8);
    m.box(0.5, 0.65, 9.2, TR.beam, -7.6, PY + 4.95, -0.8);
    m.box(0.5, 0.65, 9.2, TR.beam, 7.6, PY + 4.95, -0.8);
    m.box(15.7, 0.65, 0.5, TR.beam, 0, PY + 4.95, -5.4);
    for (let i = 0; i < 5; i++) {
      const a = colX[i], b = colX[i + 1];
      paint.add((a + b) / 2, PY + 4.95, 4.06, b - a - 0.45, 0.55);
    }
    m.box(16.4, 0.55, 9.9, TR.bracket, 0, PY + 5.55, -0.8);
    for (let x = -6.8; x <= 6.81; x += 2.72) {
      brackets.add(x, PY + 5.55, 4.16, 2.7, 0.52);
      m.push(0, 0, -5.75, 0, Math.PI, 0);
      brackets.add(x, PY + 5.55, 0, 2.7, 0.52);
      m.pop();
    }
    // lattice doors in the three middle bays, lattice windows in the end bays
    for (let i = 0; i < 12; i++) doors.add(-4.4 + i * 0.8, PY + 1.9, 2.32, 0.76, 3.6);
    for (const s of [1, -1]) for (let i = 0; i < 3; i++) doors.add(s * (5.45 + i * 0.8), PY + 2.6, 2.32, 0.76, 2.2);
    for (const x of [-3.25, 3.25]) lantern(m, x, PY + 4.6, 3.1, 0.38);
    // lower eave skirt, clerestory, upper hip roof, ridge with 鸱吻
    m.push(0, 0, zc);
    roofLoft(m, { c0: rectPoly(9.8, 6.2), c1: rectPoly(6.4, 3.5), y0: 7.05, y1: 8.55, nu: 6, nt: 2, lift: 0.8, flare: 0.45, thick: 0.35, col: TR.glaze, under: TR.soffit, edge: 0xd9a032, ridges: 0.1, tips: 0.4, ridgeCol: TR.glazeR });
    m.box(13.0, 1.9, 7.2, TR.red, 0, 9.1, 0);
    m.box(13.4, 0.5, 7.6, TR.bracket, 0, 10.2, 0);
    for (let x = -5.4; x <= 5.41; x += 2.7) {
      brackets.add(x, 10.2, 3.81, 2.68, 0.48);
      m.push(0, 0, -3.81, 0, Math.PI, 0);
      brackets.add(x, 10.2, 0, 2.68, 0.48);
      m.pop();
    }
    m.box(4.2, 1.45, 0.12, 0xc9962f, 0, 9.15, 3.66);
    m.decal(3.9, 1.25, 'bd_temple', 0, 9.15, 3.73);
    roofLoft(m, { c0: rectPoly(8.3, 5.0), c1: rectPoly(3.9, 0.001), y0: 10.45, y1: 14.3, nu: 6, nt: 4, lift: 1.0, flare: 0.55, thick: 0.35, col: TR.glaze, under: TR.soffit, edge: 0xd9a032, ridges: 0.13, tips: 0.5, ridgeCol: TR.glazeR });
    m.box(8.2, 0.55, 0.5, TR.glazeR, 0, 14.5, 0);
    m.sym(s => chiwen(m, s * 4.2, 14.6, 0, s, 0.95, TR.glazeR));
    m.sphere(0.3, 0xe8b84a, 0, 14.95, 0, 1, 1, 1, 0, 0, 0, 6);
    m.pop();
    doors.flush(0xffffff, 0, 'bd_lattice');
    paint.flush(0xffffff, 0, 'bd_caihua');
    brackets.flush(0xffffff, 0, 'bd_dougong');
  },
});

// ---- 宝塔: seven-tier octagonal pagoda with upturned eaves, wind bells and a golden spire -----------
def('pagoda', {
  name: '宝塔',
  cat: 'landmark',
  sfx: 'gong',
  fill: 0.35,
  build(m) {
    const wall = 0xc0412f, tile = 0x5f6d78, soffit = 0x2f6f6a, band = 0xf2ece0, gold = 0xe8b84a;
    const rot8 = Math.PI / 8, doors = new Quads(m), N = 7;
    m.cyl(7.3, 7.7, 1.3, 0xcfc9bb, 0, 0.65, 0, 0, rot8, 0, 8);
    m.cyl(7.5, 7.5, 0.2, 0xb9b3a6, 0, 1.4, 0, 0, rot8, 0, 8);
    m.box(3.2, 0.65, 1.2, 0xcfc9bb, 0, 0.33, 7.2);
    let y = 1.5;
    for (let i = 0; i < N; i++) {
      const r = 5.0 - i * 0.4, hw = 4.3 - i * 0.3, last = i === N - 1;
      m.cyl(r + 0.25, r + 0.3, 0.35, band, 0, y + 0.175, 0, 0, rot8, 0, 8);
      m.cyl(r, r, hw, wall, 0, y + 0.35 + hw / 2, 0, 0, rot8, 0, 8);
      const ap = r * Math.cos(Math.PI / 8);
      for (let f = 0; f < 4; f++) {
        const a = (f * Math.PI) / 2 + (i % 2 ? Math.PI / 4 : 0);
        m.push(Math.sin(a) * ap, 0, Math.cos(a) * ap, 0, a, 0);
        doors.add(0, y + 0.35 + hw * 0.45, 0.03, Math.min(1.7, r * 0.42), hw * 0.66);
        m.pop();
      }
      const ye = y + 0.35 + hw, rise = last ? 3.6 : 1.4 - i * 0.05;
      roofLoft(m, {
        c0: ngon(8, r + 1.8), c1: last ? ngon(8, 0.001) : ngon(8, r - 0.1), y0: ye, y1: ye + rise,
        nu: 3, nt: last ? 3 : 2, lift: 0.7, flare: 0.4, thick: 0.3, col: tile, under: soffit, tips: 0.45, bells: 0.14, ridges: last ? 0.1 : 0,
      });
      y = ye + rise;
    }
    // spire (塔刹): lotus base, stacked rings, gourd and pearl
    m.lathe([[0.9, -0.3], [1.0, 0.15], [0.45, 0.45], [0.42, 0.8], [0.7, 0.95], [0.4, 1.15], [0.62, 1.3], [0.36, 1.5], [0.55, 1.65], [0.32, 1.85], [0.48, 2.0], [0.28, 2.2], [0.2, 3.2], [0.55, 3.55], [0.5, 3.95], [0.2, 4.2], [0.36, 4.5], [0.3, 4.8], [0.08, 5.0], [0.05, 5.8], [0, 6.0]], gold, 0, y - 0.2, 0, 0, 0, 0, 8);
    doors.flush(0xffffff, 0, 'bd_pagoda_door');
  },
});

// ---- 亭子: hexagonal pavilion — red columns, benches with 美人靠 backs, sweeping upturned roof -------
def('pavilion', {
  name: '亭子',
  cat: 'landmark',
  sfx: 'gong',
  fill: 0.2,
  build(m) {
    const col = 0xb52a22, tile = 0x55606b, soffit = 0x9e2a22, stone = 0xcfc9bb;
    const rot6 = Math.PI / 6, paint = new Quads(m), fret = new Quads(m);
    m.cyl(2.75, 2.85, 0.45, stone, 0, 0.225, 0, 0, rot6, 0, 6);
    m.cyl(2.8, 2.8, 0.08, 0xb9b3a6, 0, 0.45, 0, 0, rot6, 0, 6);
    m.box(1.8, 0.22, 0.6, stone, 0, 0.11, 2.6);
    const P = ngon(6, 2.1), H = 2.9, yb = 0.49;
    for (const [x, z] of P) {
      m.cyl(0.13, 0.14, H, col, x, yb + H / 2, z, 0, 0, 0, 8);
      m.box(0.34, 0.14, 0.34, stone, x, yb + 0.07, z);
    }
    for (let i = 0; i < 6; i++) {
      const a = P[i], b = P[(i + 1) % 6], mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2;
      const ry = Math.atan2(mx, mz), len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      m.push(mx, 0, mz, 0, ry, 0);
      m.box(len + 0.1, 0.32, 0.2, TR.beam, 0, yb + H - 0.2, 0);
      paint.add(0, yb + H - 0.2, 0.105, len - 0.25, 0.28);
      fret.add2(0, yb + H - 0.55, 0, len - 0.3, 0.36);
      if (i !== 0) {
        m.box(len - 0.3, 0.08, 0.42, C.wood, 0, yb + 0.45, -0.05);
        m.box(len - 0.3, 0.4, 0.06, col, 0, yb + 0.22, 0.1);
        m.box(len - 0.3, 0.5, 0.06, col, 0, yb + 0.72, 0.2, 22 * D, 0, 0);
        m.box(len - 0.3, 0.06, 0.1, col, 0, yb + 0.97, 0.3);
      }
      m.pop();
    }
    roofLoft(m, { c0: ngon(6, 3.15), c1: ngon(6, 0.001), y0: yb + H + 0.2, y1: yb + H + 2.1, nu: 4, nt: 3, lift: 0.6, flare: 0.32, thick: 0.18, col: tile, under: soffit, ridges: 0.08, tips: 0.45 });
    m.lathe([[0.3, 0], [0.36, 0.15], [0.18, 0.3], [0.3, 0.52], [0.1, 0.74], [0, 0.9]], 0xe8b84a, 0, yb + H + 2.0, 0, 0, 0, 0, 8);
    paint.flush(0xffffff, 0, 'bd_caihua');
    fret.flush(0xffffff, 0, 'bd_lattice');
  },
});

// ---- 牌坊: three-bay, four-column memorial archway with three green-glazed roofs, plaque 幸福里 -------
def('arch_gate', {
  name: '牌坊',
  cat: 'landmark',
  sfx: 'gong',
  fill: 0.15,
  build(m) {
    const red = 0xb52a22, stone = 0xc9c3b6, tile = 0x3f8a6a, tileR = 0x2f6f55, soffit = 0x2f6f6a;
    const paint = new Quads(m), brackets = new Quads(m);
    for (const x of [-5.6, -1.9, 1.9, 5.6]) {
      const h = Math.abs(x) < 3 ? 7.5 : 5.95;
      m.box(0.95, 0.45, 0.95, stone, x, 0.225, 0);
      m.box(0.52, h, 0.52, red, x, h / 2, 0);
      for (const z of [-0.7, 0.7]) {
        m.box(0.46, 0.75, 0.62, stone, x, 0.8, z * 0.95);
        m.cyl(0.42, 0.42, 0.36, stone, x, 1.45, z, 0, 0, 90 * D, 10);
      }
    }
    // beams: central bay (two beams framing the plaque), side bays (two beams + red panel)
    const beamRow = (x0, x1, y, h) => {
      m.box(x1 - x0 + 0.3, h, 0.42, TR.beam, (x0 + x1) / 2, y, 0);
      for (const z of [1, -1]) {
        m.push((x0 + x1) / 2, y, z * 0.215, 0, z > 0 ? 0 : Math.PI, 0);
        paint.add(0, 0, 0.005, x1 - x0 - 0.35, h - 0.1);
        m.pop();
      }
    };
    beamRow(-1.9, 1.9, 4.75, 0.55);
    beamRow(-1.9, 1.9, 6.75, 0.6);
    m.box(3.1, 1.5, 0.22, 0xc9962f, 0, 5.75, 0);
    m.decal(2.85, 1.08, 'bd_arch', 0, 5.75, 0.115);
    m.decal(2.85, 1.08, 'bd_arch', 0, 5.75, -0.115, 0, Math.PI, 0);
    m.sym(s => {
      beamRow(s > 0 ? 1.9 : -5.6, s > 0 ? 5.6 : -1.9, 3.95, 0.5);
      beamRow(s > 0 ? 1.9 : -5.6, s > 0 ? 5.6 : -1.9, 5.3, 0.45);
      m.box(3.4, 0.8, 0.14, red, s * 3.75, 4.63, 0);
    });
    // bracket bands and roofs (central one higher), ridges with small 鸱吻
    const band = (x, y, w) => {
      m.box(w, 0.5, 0.9, TR.bracket, x, y, 0);
      for (const z of [1, -1]) {
        m.push(x, y, z * 0.455, 0, z > 0 ? 0 : Math.PI, 0);
        for (let i = 0; i < Math.round(w / 1.3); i++) brackets.add(-w / 2 + (i + 0.5) * (w / Math.round(w / 1.3)), 0, 0, w / Math.round(w / 1.3) - 0.02, 0.48);
        m.pop();
      }
    };
    band(0, 7.3, 4.6);
    m.push(0, 0, 0);
    roofLoft(m, { c0: rectPoly(2.95, 1.2), c1: rectPoly(1.95, 0.001), y0: 7.65, y1: 8.95, nu: 4, nt: 3, lift: 0.45, flare: 0.28, thick: 0.2, col: tile, under: soffit, edge: 0x4f9a7a, ridges: 0.07, tips: 0.32, ridgeCol: tileR });
    m.pop();
    m.box(3.9, 0.3, 0.32, tileR, 0, 9.1, 0);
    m.sym(s => chiwen(m, s * 1.95, 9.15, 0, s, 0.55, tileR));
    m.sym(s => {
      band(s * 3.75, 5.75, 3.9);
      m.push(s * 3.75, 0, 0);
      roofLoft(m, { c0: rectPoly(2.2, 1.05), c1: rectPoly(1.3, 0.001), y0: 6.05, y1: 7.05, nu: 4, nt: 3, lift: 0.4, flare: 0.25, thick: 0.18, col: tile, under: soffit, edge: 0x4f9a7a, ridges: 0.06, tips: 0.3, ridgeCol: tileR });
      m.box(2.8, 0.26, 0.28, tileR, 0, 7.18, 0);
      m.pop();
    });
    paint.flush(0xffffff, 0, 'bd_caihua');
    brackets.flush(0xffffff, 0, 'bd_dougong');
  },
});

// ---- 石拱桥: humped stone arch bridge with open main arch, two spandrel arches, carved balustrades ----
def('arch_bridge', {
  name: '石拱桥',
  cat: 'landmark',
  sfx: 'gong',
  fill: 0.45,
  build(m) {
    const stone = 0xaaa699, ring = 0x9a968a, rail = 0xc4c0b4, L = 7, W = 3.6, R = 3.45, cy = -0.25;
    const top = x => 0.5 + 3.9 * Math.pow(Math.max(0, 1 - (x / L) ** 2), 0.75);
    const x0 = Math.sqrt(R * R - cy * cy), t0 = Math.asin(-cy / R);
    // side profile: humped deck on top, the main arch cut out of the bottom (open underneath)
    const shape = new THREE.Shape();
    shape.moveTo(-L, 0);
    for (let i = 0; i <= 16; i++) { const x = -L + (2 * L * i) / 16; shape.lineTo(x, top(x)); }
    // (the outline closes itself back to (-L, 0); no duplicated points, or the cap triangulation breaks)
    shape.lineTo(L, 0);
    shape.lineTo(x0, 0);
    for (let i = 1; i < 14; i++) { const t = t0 + ((Math.PI - 2 * t0) * i) / 14; shape.lineTo(R * Math.cos(t), cy + R * Math.sin(t)); }
    shape.lineTo(-x0, 0);
    for (const sx of [-5.05, 5.05]) {
      const hole = new THREE.Path();
      hole.absarc(sx, 1.55, 0.6, 0, Math.PI * 2, true);
      shape.holes.push(hole);
    }
    const body = new THREE.ExtrudeGeometry(shape, { depth: W, bevelEnabled: false, curveSegments: 10 });
    body.translate(0, 0, -W / 2);
    m.geo(body, (x, y) => (y < 0.6 ? mix(0x7f8a72, stone, y / 0.6) : stone));
    // arch ring stones (拱券) standing slightly proud of both faces, and rings round the spandrel holes
    const ringShape = new THREE.Shape();
    for (let i = 0; i <= 14; i++) {
      const t = t0 + ((Math.PI - 2 * t0) * i) / 14, x = (R + 0.45) * Math.cos(t), y = cy + (R + 0.45) * Math.sin(t);
      if (i === 0) ringShape.moveTo(x, y); else ringShape.lineTo(x, y);
    }
    for (let i = 14; i >= 0; i--) { const t = t0 + ((Math.PI - 2 * t0) * i) / 14; ringShape.lineTo(R * Math.cos(t), cy + R * Math.sin(t)); }
    m.geo(new THREE.ExtrudeGeometry(ringShape, { depth: W + 0.12, bevelEnabled: false }).translate(0, 0, -(W + 0.12) / 2), ring);
    for (const sx of [-5.05, 5.05]) {
      const rs = new THREE.Shape();
      rs.absarc(sx, 1.55, 0.82, 0, Math.PI * 2, false);
      const h = new THREE.Path();
      h.absarc(sx, 1.55, 0.6, 0, Math.PI * 2, true);
      rs.holes.push(h);
      m.geo(new THREE.ExtrudeGeometry(rs, { depth: W + 0.1, bevelEnabled: false, curveSegments: 10 }).translate(0, 0, -(W + 0.1) / 2), ring);
    }
    // keystone lion-head block, name plaque on the crown parapet
    m.box(0.55, 0.7, W + 0.2, ring, 0, cy + R + 0.3, 0);
    // balustrades following the hump: posts with round caps, sloped panels between
    const posts = [-6.6, -5.0, -3.4, -1.7, 0, 1.7, 3.4, 5.0, 6.6];
    for (const z of [W / 2 - 0.12, -W / 2 + 0.12]) {
      for (const x of posts) {
        m.box(0.24, 1.05, 0.24, rail, x, top(x) + 0.45, z);
        m.sphere(0.15, rail, x, top(x) + 1.03, z, 1, 1.2, 1, 0, 0, 0, 5);
      }
      for (let i = 0; i < posts.length - 1; i++) {
        const a = posts[i], b = posts[i + 1], ya = top(a), yb = top(b);
        const len = Math.hypot(b - a, yb - ya), ang = Math.atan2(yb - ya, b - a);
        m.box(len - 0.2, 0.62, 0.14, rail, (a + b) / 2, (ya + yb) / 2 + 0.36, z, 0, 0, ang);
        m.box(len - 0.1, 0.08, 0.2, rail, (a + b) / 2, (ya + yb) / 2 + 0.72, z, 0, 0, ang);
      }
    }
    m.decal(1.3, 0.42, 'bd_bridge', 0, top(0) + 0.38, W / 2 - 0.04);
    m.decal(1.3, 0.42, 'bd_bridge', 0, top(0) + 0.38, -W / 2 + 0.04, 0, Math.PI, 0);
    // stepped paving strips on the steep parts of the deck
    for (const s of [1, -1]) {
      for (let i = 0; i < 7; i++) {
        const x = s * (2.2 + i * 0.62), a = Math.atan2(top(x + 0.01) - top(x - 0.01), 0.02);
        m.box(0.08, 0.06, W - 0.5, 0x8f8b80, x, top(x) + 0.02, 0, 0, 0, a);
      }
    }
  },
});

// =============================================================================================
// Big structures
// =============================================================================================

// ---- 明珠塔: original 200 m TV tower — three legs, two big pink spheres, small spheres, antenna -------
def('tv_tower', {
  name: '明珠塔',
  cat: 'landmark',
  sfx: 'gong',
  fill: 0.1,
  build(m) {
    const pink = 0xd8438f, pink2 = 0xe987b9, shaft = 0xe6e2ea, lav = 0xcfc6dc, glass = 0x5b7fa8;
    const glowQ = new Quads(m);
    // round podium hall with a glass band and a lit entrance
    m.cyl(23, 24, 5, 0xefece4, 0, 2.5, 0, 0, 0, 0, 20);
    m.cyl(23.2, 23.2, 2.2, glass, 0, 2.7, 0, 0, 0, 0, 20);
    m.cyl(21, 23, 1.2, lav, 0, 5.6, 0, 0, 0, 0, 20);
    m.box(8, 3.5, 2, glass, 0, 1.75, 23);
    m.box(10, 0.4, 3.5, lav, 0, 3.7, 24);
    // three raked legs from the ground to the lower sphere
    for (const a of [60, 180, 300].map(d => d * D)) {
      const foot = [Math.sin(a) * 21, 0, Math.cos(a) * 21], head = [Math.sin(a) * 5, 62, Math.cos(a) * 5];
      rod(m, foot, head, 2.6, shaft, 10, 2.0);
      m.cyl(3.4, 3.8, 3, lav, foot[0], 1.5, foot[2], 0, 0, 0, 10);
      m.glow(1);
      for (let i = 1; i < 6; i++) {
        const t = i / 6;
        m.sphere(0.5, 0xfff1c8, lerp(foot[0], head[0], t) * 1.13, lerp(0, 62, t), lerp(foot[2], head[2], t) * 1.13, 1, 1, 1, 0, 0, 0, 4);
      }
      m.glow(0);
    }
    // three vertical columns forming the shaft, tied by ring beams
    for (const a of [0, 120, 240].map(d => d * D)) m.cyl(2.3, 2.6, 160, shaft, Math.sin(a) * 3.2, 80, Math.cos(a) * 3.2, 0, 0, 0, 8);
    for (const y of [20, 40, 96, 156]) m.cyl(6.4, 6.4, 1.6, lav, 0, y, 0, 0, 0, 0, 12);
    // lower big sphere with glowing window band
    m.sphere(17, pink, 0, 72, 0, 1, 1, 1, 0, 0, 0, 20);
    m.cyl(17.3, 17.3, 2.6, glass, 0, 72, 0, 0, 0, 0, 20);
    m.glow(0.9);
    m.cyl(17.5, 17.5, 0.5, 0xfff1c8, 0, 73.6, 0, 0, 0, 0, 20);
    m.cyl(15.6, 15.6, 0.5, 0xfff1c8, 0, 79.5, 0, 0, 0, 0, 18);
    m.cyl(15.6, 15.6, 0.5, 0xfff1c8, 0, 64.5, 0, 0, 0, 0, 18);
    m.glow(0);
    // small spheres strung up the shaft
    for (const [y, r] of [[102, 6.2], [114, 6.8], [126, 6.2]]) {
      m.sphere(r, pink2, 0, y, 0, 1, 1, 1, 0, 0, 0, 12);
      m.glow(0.9);
      m.cyl(r + 0.08, r + 0.08, 0.4, 0xfff1c8, 0, y, 0, 0, 0, 0, 12);
      m.glow(0);
    }
    // upper big sphere
    m.sphere(11.5, pink, 0, 143, 0, 1, 1, 1, 0, 0, 0, 18);
    m.cyl(11.8, 11.8, 2.2, glass, 0, 143, 0, 0, 0, 0, 18);
    m.glow(0.9);
    m.cyl(12.0, 12.0, 0.45, 0xfff1c8, 0, 144.4, 0, 0, 0, 0, 18);
    m.glow(0);
    // neck, top pod, antenna with red / white bands and beacon
    m.cyl(2.4, 3.2, 10, shaft, 0, 159, 0, 0, 0, 0, 10);
    m.sphere(5, pink2, 0, 168, 0, 1, 1, 1, 0, 0, 0, 12);
    m.glow(0.9);
    m.cyl(5.08, 5.08, 0.5, 0xfff1c8, 0, 168, 0, 0, 0, 0, 12);
    m.glow(0);
    const segs = [[172, 180, 1.6, 1.25, shaft], [180, 186, 1.25, 0.95, C.red], [186, 191, 0.95, 0.7, C.white], [191, 195, 0.7, 0.5, C.red], [195, 199, 0.5, 0.3, C.white]];
    for (const [y0, y1, r0, r1, c] of segs) m.cyl(r1, r0, y1 - y0, c, 0, (y0 + y1) / 2, 0, 0, 0, 0, 8);
    m.glow(1);
    m.sphere(0.6, C.red, 0, 199.4, 0, 1, 1, 1, 0, 0, 0, 6);
    for (const y of [150.5, 176]) glowQ.add(0, y, 0, 0.1, 0.1);
    m.glow(0);
    glowQ.flush(0xfff1c8, 1);
  },
});

// ---- 摩天轮: static A-frame base + boarding station; the spinning ring is a separate object ---------
// Hub (axle centre) of the base is at (0, FERRIS_HUB, 0). Place ferris_ring with its model origin at
// base + (0, FERRIS_HUB - FERRIS_R, 0) so the ring's bounding-box centre lands on the hub.
const FERRIS_HUB = 31.5, FERRIS_R = 27.4;
def('ferris_base', {
  name: '摩天轮支架',
  cat: 'landmark',
  sfx: 'gong',
  fill: 0.08,
  build(m) {
    const steel = 0xe8eaee, trim = 0x9a6fc0, H = FERRIS_HUB;
    const k = winKit(m, 0.6);
    // two A-frames either side of the wheel plane, feet on concrete pads
    for (const s of [1, -1]) {
      const apex = [0, H, s * 2.3];
      for (const x of [-15, 15]) {
        const foot = [x, 0, s * 5.8];
        rod(m, foot, apex, 0.75, steel, 8, 0.55);
        m.box(2.4, 0.8, 2.4, C.concrete, x, 0.4, s * 5.8);
      }
      for (const y of [9, 19]) {
        const t = y / H, xl = 15 * (1 - t), z = s * lerp(5.8, 2.3, t);
        m.box(2 * xl, 0.45, 0.45, steel, 0, y, z);
      }
      beam(m, [-15 * (1 - 9 / H), 9, s * lerp(5.8, 2.3, 9 / H)], [15 * (1 - 19 / H), 19, s * lerp(5.8, 2.3, 19 / H)], 0.3, steel);
      beam(m, [15 * (1 - 9 / H), 9, s * lerp(5.8, 2.3, 9 / H)], [-15 * (1 - 19 / H), 19, s * lerp(5.8, 2.3, 19 / H)], 0.3, steel);
      m.box(1.8, 1.8, 0.9, trim, 0, H, s * 2.35);
      m.glow(1);
      m.sphere(0.35, C.red, 0, H + 1.1, s * 2.35, 1, 1, 1, 0, 0, 0, 5);
      m.glow(0);
    }
    m.cyl(0.9, 0.9, 5.4, C.metal, 0, H, 0, 90 * D, 0, 0, 10);
    // boarding station in front of the wheel: raised deck, stairs, canopy with sign, ticket booth
    const dy = 3.8;
    m.box(14, 0.3, 5.6, 0xd9d4c8, 0, dy - 0.15, 5.6);
    for (const x of [-6.5, 6.5]) for (const z of [3.2, 8.0]) m.box(0.4, dy - 0.3, 0.4, C.grey, x, (dy - 0.3) / 2, z);
    m.box(14, 0.9, 0.08, 0x9a6fc0, 0, dy + 0.45, 8.35);
    m.sym(s => m.box(0.08, 0.9, 5.4, 0x9a6fc0, s * 7, dy + 0.45, 5.6));
    for (let i = 0; i < 8; i++) m.box(1.6, 0.25, 0.42, C.concrete, 7.9 + i * 0.001, 0.125 + i * 0.47, 8.2 - i * 0.02, 0, 0, 0);
    for (let i = 0; i < 8; i++) m.box(1.6, 0.47 * (i + 1), 0.42, C.concrete, 7.9, (0.47 * (i + 1)) / 2, 8.2 - (7 - i) * 0.42 - 0.2);
    for (const x of [-6.8, 6.8]) for (const z of [3.2, 8.0]) m.box(0.25, 3.6, 0.25, C.metal, x, dy + 1.8, z);
    m.box(15, 0.35, 6.4, 0xf08fb0, 0, dy + 3.75, 5.6);
    m.box(15.2, 0.6, 0.2, 0x6a3fa0, 0, dy + 3.75, 8.8);
    m.glow(0.8);
    m.decal(4.2, 1.05, 'bd_ferris', 0, dy + 4.55, 8.9);
    m.box(15.2, 0.1, 0.1, 0xfff1c8, 0, dy + 3.4, 8.85);
    m.glow(0);
    m.box(4.2, 1.2, 0.3, 0x6a3fa0, 0, dy + 4.55, 8.75);
    m.box(2.4, 2.6, 2.0, 0xf6efe0, -4.5, 1.3, 10.6);
    m.box(2.8, 0.25, 2.4, 0x9a6fc0, -4.5, 2.72, 10.6);
    m.push(-4.5, 0, 11.6);
    k.win(0, 1.5, 0, 1.4, 0.9, { lit: 1, mull: 0, frame: 0.08 });
    m.pop();
    for (let i = 0; i < 4; i++) m.box(0.06, 0.9, 0.06, C.metal, -2.2 + i * 1.3, 0.45, 10.4);
    m.box(4.0, 0.06, 0.06, C.metal, -0.25, 0.9, 10.4);
    k.flush();
  },
});

def('ferris_ring', {
  name: '摩天轮转盘',
  cat: 'landmark',
  sfx: 'gong',
  fill: 0.08,
  mover: { kind: 'spin', axis: 'z', speed: 0.05 },
  build(m) {
    const R = 24.2, steel = 0xf4f2ec, pods = [0xe8554a, 0xf2a14a, 0xf2c14e, 0x8cc152, 0x2aa198, 0x5aa9e6, 0x2f63c9, 0x9a6fc0];
    const lights = new Quads(m);
    m.push(0, FERRIS_R, 0);
    // front and back rims, inner ring, hub
    for (const z of [-1.3, 1.3]) m.torus(R, 0.34, steel, 0, 0, z, 0, 0, 0, Math.PI * 2, 4, 40);
    m.torus(19.5, 0.24, steel, 0, 0, 0, 0, 0, 0, Math.PI * 2, 3, 32);
    m.cyl(2.4, 2.4, 3.8, 0xd9dde2, 0, 0, 0, 90 * D, 0, 0, 12);
    m.glow(0.9);
    m.disc(1.9, 0xf2c14e, 0, 0, 1.92, 90 * D, 0, 0, 12);
    m.disc(1.9, 0xf2c14e, 0, 0, -1.92, 90 * D, 0, 0, 12);
    m.glow(0);
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
      // spokes (front and back sets), cross tie, pod on the outside of the rim
      for (const z of [-1.3, 1.3]) beam(m, [c * 2.2, s * 2.2, z * 0.8], [c * R, s * R, z], 0.2, steel);
      const a2 = a + Math.PI / 16;
      beam(m, [Math.cos(a2) * 2.2, Math.sin(a2) * 2.2, 0], [Math.cos(a2) * 19.5, Math.sin(a2) * 19.5, 0], 0.14, steel);
      m.box(0.3, 0.3, 2.8, steel, c * R, s * R, 0);
      const pc = R + 1.6;
      m.ellipsoid(1.6, 1.6, 1.75, pods[i % pods.length], c * pc, s * pc, 0, 0, 0, a, 8);
      m.disc(1.05, 0x3f5f7a, c * pc, s * pc, 1.6, 90 * D, 0, 0, 8);
      m.disc(1.05, 0x3f5f7a, c * pc, s * pc, -1.6, 90 * D, 0, 0, 8);
      // rim lights between the pods
      for (const z of [1.66, -1.66]) {
        m.push(Math.cos(a2) * R, Math.sin(a2) * R, z, 0, z > 0 ? 0 : Math.PI, 0);
        lights.add(0, 0, 0, 0.5, 0.5);
        m.pop();
      }
    }
    m.pop();
    lights.flush(0xfff1c8, 1);
  },
});

// ---- 风力发电机: 80 m tower + nacelle (static) and the three-blade rotor (spins around Z) ----------
// The rotor hub sits at TURBINE_HUB in turbine_tower model space; turbine_rotor's hub is at (0, ROTOR_R, 0)
// of its own model, so place the rotor at tower + (0, TURBINE_HUB[1] - ROTOR_R, TURBINE_HUB[2]).
const TURBINE_HUB = [0, 83.1, 4.6], ROTOR_R = 35;
def('turbine_tower', {
  name: '风力发电机塔',
  cat: 'landmark',
  sfx: 'gong',
  fill: 0.06,
  build(m) {
    const white = 0xf2f2ee, grey = 0xd9dde2, green = 0x7fc47a, top = 80.8;
    m.cyl(5.0, 5.4, 0.8, C.concrete, 0, 0.4, 0, 0, 0, 0, 12);
    m.cyl(1.6, 2.6, top - 0.8, white, 0, (top + 0.8) / 2, 0, 0, 0, 0, 12);
    m.cyl(2.6, 2.6, 1.4, green, 0, 1.5, 0, 0, 0, 0, 12);
    m.cyl(2.56, 2.58, 0.9, 0xa8d8a0, 0, 2.65, 0, 0, 0, 0, 12);
    // door with little steel stair and landing at the base
    m.box(1.0, 2.1, 0.3, 0x6b7079, 0, 2.3, 2.5);
    m.box(1.8, 0.1, 1.2, C.metal, 0, 1.2, 3.1);
    for (let i = 0; i < 3; i++) m.box(1.0, 0.08, 0.3, C.metal, 0, 0.9 - i * 0.3, 3.85 + i * 0.3);
    m.sym(s => m.box(0.05, 1.0, 1.2, C.metal, s * 0.9, 1.7, 3.1));
    // yaw bearing, nacelle, rear cooler fins, anemometer mast, aviation light
    m.cyl(1.8, 1.7, 0.5, grey, 0, top + 0.25, 0, 0, 0, 0, 12);
    const ny = TURBINE_HUB[1];
    m.box(3.4, 3.6, 9.6, white, 0, ny, -1.4);
    m.box(3.0, 3.1, 1.2, white, 0, ny - 0.1, -6.8);
    m.box(3.42, 0.35, 9.0, green, 0, ny - 0.8, -1.6);
    m.cyl(1.25, 1.5, 1.2, grey, 0, ny, TURBINE_HUB[2] - 1.4, 90 * D, 0, 0, 12);
    m.box(0.12, 1.6, 0.12, C.metal, 0.9, ny + 2.6, -5.8);
    m.box(0.8, 0.08, 0.08, C.metal, 0.9, ny + 3.4, -5.8);
    m.cone(0.12, 0.3, C.metal, 1.25, ny + 3.5, -5.8, 0, 0, 0, 5);
    m.glow(1);
    m.sphere(0.25, C.red, -0.9, ny + 2.0, -6.2, 1, 1, 1, 0, 0, 0, 6);
    m.glow(0);
  },
});

def('turbine_rotor', {
  name: '风机叶片',
  cat: 'landmark',
  sfx: 'gong',
  fill: 0.03,
  mover: { kind: 'spin', axis: 'z', speed: 0.6 },
  build(m) {
    const R = ROTOR_R, white = 0xf2f2ee;
    m.push(0, R, 0);
    // hub and spinner nose pointing +Z
    m.cyl(1.75, 1.75, 2.2, white, 0, 0, -0.2, 90 * D, 0, 0, 12);
    m.cone(1.78, 2.6, white, 0, 0, 2.2, 90 * D, 0, 0, 12);
    const blade = [[-0.8, 2.4], [0.8, 2.4], [1.5, 6], [1.35, 10], [0.8, 22], [0.35, 34.6], [-0.2, 34.6], [-0.5, 22], [-0.95, 10], [-1.1, 6]];
    const tip = [[-0.31, 30.4], [0.53, 30.4], [0.37, 34.7], [-0.22, 34.7]];
    for (let i = 0; i < 3; i++) {
      m.push(0, 0, 0, 0, 0, (i * 120 * Math.PI) / 180);
      m.cyl(0.85, 0.95, 2.4, white, 0, 2.2, 0, 0, 0, 0, 10);
      m.push(0, 0, 0, 0, 12 * D, 0);
      m.extrude(blade, 0.4, white);
      m.extrude(tip, 0.46, C.red);
      m.pop();
      m.pop();
    }
    // zero-area markers at ±R (and behind the hub): make the bounding box symmetric about the hub so the
    // spin mover (which turns about the bbox centre) turns about the hub — three blades alone are lopsided
    const P = [];
    for (const [x, y, z] of [[-R, 0, 0], [R, 0, 0], [0, -R, 0], [0, R, 0], [0, 0, -3.5]]) P.push([x, y, z], [x, y, z], [x, y, z]);
    addTris(m, P, white);
    m.pop();
  },
});

// ---- 塔吊: 60 m yellow tower crane — lattice mast, cab, jib with trolley + hanging bricks, counterweight
def('tower_crane', {
  name: '塔吊',
  cat: 'building',
  sfx: 'crash',
  fill: 0.04,
  build(m) {
    const Y = 0xf2b632, Yd = 0xd99a1e, H = 50, S = 1.8, JL = 40, CL = 13;
    m.push(-13.5, 0, 0); // mast off-centre so the whole crane's bounding box is centred
    m.box(6, 1.0, 6, C.concrete, 0, 0.5, 0);
    for (const [x, z] of [[-1.9, -1.9], [1.9, -1.9], [-1.9, 1.9], [1.9, 1.9]]) m.box(1.5, 0.8, 1.5, 0xa9a49a, x, 1.4, z);
    // mast: four chords + zig-zag bracing on every face
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) m.box(0.22, H - 1, 0.22, Y, (sx * S) / 2, 1 + (H - 1) / 2, (sz * S) / 2);
    const seg = 2.45, n = Math.round((H - 1) / seg), h2 = S / 2;
    for (let i = 0; i < n; i++) {
      const y0 = 1 + i * seg, y1 = y0 + seg, f = i % 2 ? 1 : -1;
      beam(m, [f * h2, y0, h2], [-f * h2, y1, h2], 0.1, Y);
      beam(m, [f * h2, y0, -h2], [-f * h2, y1, -h2], 0.1, Y);
      beam(m, [h2, y0, f * h2], [h2, y1, -f * h2], 0.1, Y);
      beam(m, [-h2, y0, f * h2], [-h2, y1, -f * h2], 0.1, Y);
    }
    // slewing unit, cab (windows towards the jib), cat-head A-frame
    m.box(2.8, 1.2, 2.8, Yd, 0, H + 0.6, 0);
    m.box(1.8, 2.1, 1.9, 0xf4f2ec, 0.6, H + 0.4, 2.3);
    m.box(0.05, 1.1, 1.6, 0x5a8fb0, 1.53, H + 0.8, 2.3);
    m.box(1.4, 1.0, 0.05, 0x5a8fb0, 0.6, H + 0.8, 3.27);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) beam(m, [sx * 1.2, H + 1.2, sz * 1.2], [0, H + 10, 0], 0.22, Y);
    // jib: triangular lattice towards +X
    const jb = H + 1.3, jt = H + 3.0, js = 2.4, jn = Math.round(JL / js);
    for (const z of [-0.8, 0.8]) m.box(JL, 0.2, 0.2, Y, 1.4 + JL / 2, jb, z);
    m.box(JL, 0.2, 0.2, Y, 1.4 + JL / 2, jt, 0);
    for (let i = 0; i < jn; i++) {
      const x0 = 1.4 + i * js, x1 = x0 + js, f = i % 2;
      for (const z of [-0.8, 0.8]) beam(m, [f ? x1 : x0, jb, z], [f ? x0 : x1, jt, 0], 0.09, Y);
      m.box(0.09, 0.09, 1.6, Y, x0, jb, 0);
    }
    beam(m, [1.4 + JL, jb, -0.8], [1.4 + JL, jt, 0], 0.15, Y);
    beam(m, [1.4 + JL, jb, 0.8], [1.4 + JL, jt, 0], 0.15, Y);
    // counter-jib: walkway, railings, winch, concrete counterweights, company board
    m.box(CL, 0.25, 1.9, 0x8a8f96, -1.4 - CL / 2, jb, 0);
    for (const z of [-0.95, 0.95]) {
      m.box(CL, 0.22, 0.22, Y, -1.4 - CL / 2, jb, z);
      m.box(CL, 0.08, 0.08, Y, -1.4 - CL / 2, jb + 1.0, z);
      for (let x = -2; x >= -1.4 - CL; x -= 2.6) m.box(0.08, 1.0, 0.08, Y, x, jb + 0.5, z);
    }
    m.box(1.6, 1.0, 1.4, 0x3d5f8a, -5.5, jb + 0.6, 0);
    m.cyl(0.45, 0.45, 1.5, 0x9aa0a6, -5.5, jb + 0.6, 0, 90 * D, 0, 0, 8);
    for (let i = 0; i < 4; i++) m.box(0.62, 2.6, 1.9, 0xb9b3a6, -1.4 - CL + 0.4 + i * 0.66, jb - 0.4, 0);
    m.decal(4.2, 1.05, 'bd_crane', -8.8, jb + 0.62, 1.0);
    m.decal(4.2, 1.05, 'bd_crane', -8.8, jb + 0.62, -1.0, 0, Math.PI, 0);
    // pendant tie bars from the cat head
    beam(m, [0, H + 10, 0], [26, jt, 0], 0.08, 0x6b7079);
    for (const z of [-0.9, 0.9]) beam(m, [0, H + 10, 0], [-CL + 0.5, jb + 1.0, z], 0.08, 0x6b7079);
    // trolley, hoist ropes, hook block, pallet of bricks on slings
    const tx = 30, hy = 23;
    m.box(1.4, 0.5, 1.5, Yd, tx, jb - 0.35, 0);
    for (const dx of [-0.25, 0.25]) m.box(0.04, jb - 0.6 - hy, 0.04, C.ink, tx + dx, (jb - 0.6 + hy) / 2, 0);
    m.box(0.8, 1.0, 0.5, Y, tx, hy - 0.4, 0);
    m.torus(0.3, 0.08, 0x6b7079, tx, hy - 1.2, 0, 0, 0, 0, Math.PI * 1.4, 3, 8);
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) beam(m, [tx, hy - 1.3, 0], [tx + sx * 0.7, hy - 3.2, sz * 0.55], 0.03, C.ink);
    m.box(1.5, 0.15, 1.2, C.wood, tx, hy - 3.25, 0);
    m.jitter(0.06);
    m.box(1.4, 0.9, 1.1, 0xb8563e, tx, hy - 2.72, 0);
    m.jitter(0);
    // aviation lights
    m.glow(1);
    m.sphere(0.28, C.red, 0, H + 10.3, 0, 1, 1, 1, 0, 0, 0, 5);
    m.sphere(0.25, C.red, 1.4 + JL, jt + 0.3, 0, 1, 1, 1, 0, 0, 0, 5);
    m.glow(0);
    m.pop();
  },
});

// ---- 水塔: 30 m concrete water tower — tapered shaft, flared tank with gallery, 节约用水 slogan ----
def('water_tower', {
  name: '水塔',
  cat: 'building',
  sfx: 'rumble',
  fill: 0.3,
  build(m) {
    const conc = 0xd6d0c2, tank = 0xf1ece1;
    const rAt = y => lerp(3.2, 2.5, (y - 0.6) / 19.6);
    m.cyl(4.2, 4.4, 0.6, C.concrete, 0, 0.3, 0, 0, 0, 0, 12);
    m.lathe([[3.2, 0.6], [2.9, 8], [2.55, 17], [2.5, 20.2], [2.95, 20.6]], conc, 0, 0, 0, 0, 0, 0, 12);
    m.lathe([[2.95, 20.6], [6.0, 23.5], [6.05, 27.4], [6.45, 27.6], [6.3, 27.85], [3.4, 29.1], [0.9, 29.5], [0, 29.55]], tank, 0, 0, 0, 0, 0, 0, 16);
    m.cyl(0.5, 0.6, 0.45, C.grey, 0, 29.75, 0, 0, 0, 0, 8);
    m.cyl(6.1, 6.1, 0.35, C.red, 0, 23.85, 0, 0, 0, 0, 16);
    m.cyl(6.12, 6.12, 0.35, C.red, 0, 27.0, 0, 0, 0, 0, 16);
    m.geo(new THREE.CylinderGeometry(1, 1, 1, 10, 1, true, -0.62, 1.24), 0xffffff, 0, 25.45, 0, 0, 0, 0, 6.11, 1.55, 6.11, getUV('bd_water'));
    // gallery round the tank with a railing
    m.cyl(6.9, 6.9, 0.2, C.grey, 0, 23.4, 0, 0, 0, 0, 16);
    m.torus(6.82, 0.05, C.dgrey, 0, 24.45, 0, 90 * D, 0, 0, Math.PI * 2, 3, 24);
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      m.box(0.06, 1.0, 0.06, C.dgrey, Math.sin(a) * 6.82, 23.95, Math.cos(a) * 6.82);
    }
    // door, little canopy, slit windows, ladder up the back
    m.push(0, 0, rAt(1.5));
    m.box(1.3, 2.3, 0.2, 0x5f6b58, 0, 1.75, 0.05);
    m.box(1.9, 0.12, 0.9, C.concrete, 0, 3.05, 0.4);
    m.box(1.8, 0.3, 0.9, C.concrete, 0, 0.75, 0.5);
    m.pop();
    for (const y of [6, 10, 14, 18]) m.box(0.35, 1.1, 0.2, 0x3e4a52, 0, y, rAt(y) - 0.05);
    for (const s of [-1, 1]) beam(m, [s * 0.28, 0.6, -3.45], [s * 0.28, 20.6, -2.75], 0.07, C.dgrey);
    for (let y = 2; y < 20.5; y += 1.5) m.box(0.62, 0.05, 0.05, C.dgrey, 0, y, -3.45 + ((y - 0.6) / 20) * 0.7);
  },
});

// ---- 高压电塔: 45 m lattice transmission pylon, double circuit, insulator strings ------------------
def('power_pylon', {
  name: '高压电塔',
  cat: 'building',
  sfx: 'crash',
  fill: 0.05,
  build(m) {
    const g = 0x9aa4ad, t = 0.26, glassIns = 0x7fa89a;
    const half = y => (y <= 30 ? lerp(4.6, 1.3, y / 30) : lerp(1.3, 0.85, (y - 30) / 12));
    const L = [0.3, 6, 11.5, 16.5, 21, 25.5, 30, 34, 38, 42];
    for (const [x, z] of [[-4.6, -4.6], [4.6, -4.6], [-4.6, 4.6], [4.6, 4.6]]) m.box(1.4, 0.6, 1.4, C.concrete, x, 0.3, z);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      beam(m, [sx * 4.6, 0, sz * 4.6], [sx * 1.3, 30, sz * 1.3], t + 0.06, g);
      beam(m, [sx * 1.3, 30, sz * 1.3], [sx * 0.85, 42, sz * 0.85], t, g);
    }
    // horizontal rings and X-bracing on all four faces
    const face = (fn) => { for (const s of [1, -1]) { fn((u, y) => [u, y, s * half(y)]); fn((u, y) => [s * half(y), y, u]); } };
    for (let i = 0; i < L.length; i++) {
      const y = L[i], h = half(y);
      face(P => beam(m, P(-h, y), P(h, y), 0.14, g));
      if (i < L.length - 1) {
        const y1 = L[i + 1], h1 = half(y1);
        face(P => { beam(m, P(-h, y), P(h1, y1), 0.12, g); beam(m, P(h, y), P(-h1, y1), 0.12, g); });
      }
    }
    // three cross-arms each side, insulator strings hanging from the tips
    for (const [y, len] of [[30, 8.2], [36, 9.8], [42, 7.4]]) {
      for (const s of [1, -1]) {
        const tipP = [s * len, y, 0], h = half(y);
        beam(m, [s * h, y, -0.9], tipP, 0.16, g);
        beam(m, [s * h, y, 0.9], tipP, 0.16, g);
        beam(m, [s * half(y + 2.2), y + 2.2, 0], tipP, 0.14, g);
        beam(m, [s * (h + (len - h) * 0.45), y, 0], [s * half(y + 2.2), y + 2.2, 0], 0.1, g);
        m.cyl(0.2, 0.2, 2.6, glassIns, s * (len - 0.2), y - 1.4, 0, 0, 0, 0, 6);
        m.box(0.35, 0.3, 0.35, C.dgrey, s * (len - 0.2), y - 2.8, 0);
      }
    }
    // earth-wire peaks
    for (const s of [1, -1]) {
      beam(m, [s * 0.85, 42, -0.85], [s * 2.2, 45, 0], 0.14, g);
      beam(m, [s * 0.85, 42, 0.85], [s * 2.2, 45, 0], 0.14, g);
      beam(m, [0, 42, 0], [s * 2.2, 45, 0], 0.12, g);
    }
    m.decal(1.0, 0.7, 'bd_danger', 0, 3.2, half(3.2) + 0.12);
    m.box(1.1, 0.8, 0.05, C.white, 0, 3.2, half(3.2) + 0.08);
  },
});

// =============================================================================================
// Countryside & construction
// =============================================================================================

// ---- 农家小院: courtyard farmhouse — grey-tiled houses, gate with 春联 + 福, lanterns, corn & chilli --
def('farmhouse', {
  name: '农家小院',
  cat: 'building',
  sfx: 'rumble',
  fill: 0.5,
  build(m) {
    const wall = 0xeee8da, brick = 0x8e9296, yardWall = 0x9a9ea2, tile = 0x676e76, door = 0x9a2a20;
    const paper = new Quads(m), lattice = new Quads(m);
    const win = (x, y, z, w, h) => {
      m.box(w + 0.2, h + 0.2, 0.1, door, x, y, z + 0.05);
      paper.add(x, y, z + 0.11, w, h);
      lattice.add(x, y, z + 0.13, w, h);
    };
    m.push(0, 0, 0, 0, 0, 0, [0.9, 1, 0.9]); // modelled at 13.3 m, scaled to a 12 m plot
    // courtyard paving
    m.box(11.4, 0.06, 7.4, 0xb3aa9c, 0, 0.03, 2.2);
    // ---- main house (正房) along the back
    m.box(12.2, 0.3, 4.8, 0x8f8a82, 0, 0.15, -3.8);
    m.box(12, 3.6, 4.4, wall, 0, 2.1, -3.8);
    for (const x of [-5.8, 5.8]) m.box(0.5, 3.6, 4.5, brick, x, 2.1, -3.8);
    m.box(12.1, 0.6, 4.5, brick, 0, 0.6, -3.8);
    for (const s of [1, -1]) m.prism(4.4, 2.1, 0.4, wall, s * 5.85, 4.95, -3.8, 0, Math.PI / 2, 0);
    gableRoof(m, 0, 3.9, -3.8, 12.6, 4.4, 2.1, tile, { over: 0.55, curl: true });
    m.box(0.6, 1.4, 0.6, brick, 3.8, 5.6, -4.6);
    m.box(0.8, 0.12, 0.8, brick, 3.8, 6.35, -4.6);
    m.push(0, 0, -1.6);
    m.box(1.3, 2.25, 0.12, door, 0, 1.43, 0.02);
    m.box(0.03, 2.2, 0.02, 0x5a1a14, 0, 1.43, 0.09);
    springDoor(m, 0, 0.3, 0.08, 1.3, 2.25);
    m.box(1.8, 0.3, 0.6, 0x8f8a82, 0, 0.15, 0.3);
    win(-3.2, 2.0, 0, 1.7, 1.2);
    win(3.2, 2.0, 0, 1.7, 1.2);
    // strings of drying corn and chillies either side of the door
    for (const x of [-1.6, 1.6]) {
      m.box(0.03, 0.4, 0.03, C.ink, x, 3.25, 0.12);
      for (let i = 0; i < 4; i++) m.ellipsoid(0.13, 0.26, 0.13, i % 2 ? 0xf2c14e : 0xf2a93a, x + (i % 2 ? 0.07 : -0.07), 2.85 - i * 0.3, 0.2, 0, 0, 0, 5);
    }
    for (let i = 0; i < 5; i++) m.ellipsoid(0.06, 0.16, 0.06, C.red, 4.6 + (i % 2) * 0.05, 3.0 - i * 0.2, 0.15, 0, 0, 0.3, 5);
    m.pop();
    for (const x of [-1.2, 1.2]) lantern(m, x, 3.85, -1.25, 0.26);
    m.push(0, 0, -6, 0, Math.PI, 0);
    for (const x of [-3, 3]) win(x, 2.6, 0, 0.9, 0.7);
    m.pop();
    // ---- east wing (厢房), facing the courtyard
    m.box(3.8, 0.3, 4.8, 0x8f8a82, 4.2, 0.15, 0.7);
    m.box(3.6, 2.9, 4.6, wall, 4.2, 1.75, 0.7);
    m.box(3.7, 0.5, 4.7, brick, 4.2, 0.5, 0.7);
    m.push(4.2, 0, 0.7, 0, Math.PI / 2, 0);
    gableRoof(m, 0, 3.2, 0, 5.0, 3.6, 1.5, tile, { over: 0.45 });
    for (const s of [1, -1]) m.prism(3.6, 1.5, 0.3, wall, s * 2.35, 3.95, 0, 0, Math.PI / 2, 0);
    m.pop();
    m.push(2.4, 0, 0.7, 0, -Math.PI / 2, 0);
    m.box(1.0, 2.1, 0.1, 0x7a4a2c, 1.1, 1.35, 0.03);
    win(-0.9, 1.8, 0, 1.4, 1.0);
    m.pop();
    // ---- courtyard walls with tiled copings, and the gate house (门楼)
    const wallRun = (x, z, w, d) => {
      m.box(w, 2.2, d, yardWall, x, 1.1, z);
      m.prism(Math.max(w, d) === w ? d + 0.35 : w + 0.35, 0.32, Math.max(w, d), tile, x, 2.36, z, 0, w > d ? Math.PI / 2 : 0, 0);
    };
    wallRun(-3.6, 5.8, 4.8, 0.36);
    wallRun(3.6, 5.8, 4.8, 0.36);
    wallRun(-5.82, 2.1, 0.36, 7.4);
    wallRun(5.82, 4.4, 0.36, 2.8);
    for (const x of [-1.4, 1.4]) m.box(0.6, 3.0, 0.7, brick, x, 1.5, 5.8);
    m.box(3.4, 0.5, 0.7, brick, 0, 2.95, 5.8);
    gableRoof(m, 0, 3.2, 5.8, 3.6, 1.6, 0.75, tile, { over: 0.35, curl: true, cell: 1.2 });
    m.box(2.2, 2.45, 0.1, door, 0, 1.33, 5.95);
    m.box(0.03, 2.4, 0.02, 0x5a1a14, 0, 1.33, 6.01);
    for (const x of [-0.25, 0.25]) m.torus(0.07, 0.015, C.gold, x, 1.35, 6.02, 0, 0, 0, Math.PI * 2, 3, 8);
    m.decal(0.28, 1.45, 'bd_cl_r', 1.4, 1.5, 6.16);
    m.decal(0.28, 1.45, 'bd_cl_l', -1.4, 1.5, 6.16);
    m.decal(1.15, 0.3, 'bd_hp', 0, 2.95, 6.16);
    for (const x of [-0.55, 0.55]) m.decal(0.46, 0.46, 'bd_fu', x, 1.6, 6.02);
    m.box(2.6, 0.2, 0.7, 0x8f8a82, 0, 0.1, 6.35);
    for (const x of [-1.0, 1.0]) lantern(m, x, 3.1, 6.25, 0.25);
    // ---- yard life: water vat, firewood, millstone, vegetable patch, quilt airing on a line
    m.lathe([[0, 0.06], [0.42, 0.06], [0.55, 0.45], [0.52, 0.8], [0.46, 0.84], [0.44, 0.8]], 0x6a4a3a, -4.8, 0, 0.2, 0, 0, 0, 10);
    m.disc(0.46, 0x3d6e8a, -4.8, 0.72, 0.2, 0, 0, 0, 10);
    for (let i = 0; i < 6; i++) m.cyl(0.13, 0.13, 1.6, 0xa0703f, -5.3 + (i % 3) * 0.27, 0.19 + Math.floor(i / 3) * 0.24, -0.9, 90 * D, 0.2, 0, 5);
    m.cyl(0.55, 0.6, 0.3, 0x9aa0a6, -2.8, 0.51, 2.2, 0, 0, 0, 10);
    m.cyl(0.55, 0.55, 0.3, 0xa9aeb3, -2.8, 0.82, 2.2, 0, 0, 0, 10);
    m.cyl(0.35, 0.4, 0.36, 0x8f8a82, -2.8, 0.18, 2.2, 0, 0, 0, 8);
    m.box(0.06, 0.06, 0.7, C.wood, -2.8, 0.9, 2.75, -0.4, 0, 0);
    m.box(3.2, 0.2, 1.9, 0x7a5a3a, -3.7, 0.12, 4.2);
    for (let i = 0; i < 3; i++) for (let j = 0; j < 4; j++) m.dome(0.26, j % 2 ? C.leaf : 0x6fbf5a, -4.9 + j * 0.8, 0.2, 3.6 + i * 0.6, 1, 0.8, 1, 0, 0, 0, 5);
    for (const x of [-4.9, -1.2]) m.box(0.06, 2.0, 0.06, C.wood, x, 1.0, 1.2);
    m.box(3.8, 0.02, 0.02, C.ink, -3.05, 1.95, 1.2);
    m.decal(1.8, 1.25, 'bd_quilt', -3.4, 1.3, 1.2, 0, 0, 0, 0xffffff, true);
    m.pop();
    paper.flush(0xfff0cc, 0.5);
    lattice.flush(0xffffff, 0, 'bd_paperwin');
  },
});

/** Copy of a geometry with every triangle facing the other way (inside faces of film / domes). */
function flipped(g) {
  const src = g.index ? g.toNonIndexed() : g.clone();
  const p = src.attributes.position.array;
  for (let i = 0; i < p.length; i += 9) for (let k = 0; k < 3; k++) { const t = p[i + 3 + k]; p[i + 3 + k] = p[i + 6 + k]; p[i + 6 + k] = t; }
  src.deleteAttribute('normal');
  src.computeVertexNormals();
  return src;
}

// ---- 蔬菜大棚: 30 m plastic-film tunnel greenhouse, side film rolled up to show the crops ------------
def('greenhouse', {
  name: '蔬菜大棚',
  cat: 'building',
  sfx: 'rumble',
  fill: 0.7,
  build(m) {
    const R = 3.8, L = 30, film = 0xe3edf0, filmIn = 0xc9dadd, rib = 0x9aa4ad, open = 0.45;
    const tunnel = new THREE.CylinderGeometry(R, R, L, 16, 1, true, -Math.PI / 2, Math.PI - open);
    m.geo(tunnel, film, 0, 0, 0, -90 * D, 0, 0);
    m.geo(flipped(tunnel), filmIn, 0, 0, 0, -90 * D, 0, 0, 0.995, 1, 0.995);
    // hoops, ground rail, rolled-up vent film, pressing ropes
    for (let z = -L / 2 + 0.3; z <= L / 2; z += 3.3) m.torus(R + 0.04, 0.05, rib, 0, 0, z, 0, 0, 0, Math.PI, 3, 12);
    const ex = R * Math.cos(open), ey = R * Math.sin(open);
    m.cyl(0.13, 0.13, L, 0xf4f6f6, ex + 0.05, ey, 0, 90 * D, 0, 0, 6);
    m.box(0.12, 0.12, L, rib, R - 0.05, 0.06, 0);
    m.box(0.5, 0.35, L + 0.4, 0x8a6a4a, -R - 0.1, 0.17, 0);
    // end walls with a door at the front
    const endG = new THREE.CircleGeometry(R, 14, 0, Math.PI);
    for (const s of [1, -1]) {
      m.geo(endG, film, 0, 0, s * (L / 2), 0, s > 0 ? 0 : Math.PI, 0);
      m.geo(flipped(endG), filmIn, 0, 0, s * (L / 2 - 0.02), 0, s > 0 ? 0 : Math.PI, 0);
    }
    m.push(0, 0, L / 2);
    for (const x of [-0.7, 0.7]) m.box(0.12, 2.2, 0.12, C.wood, x, 1.1, 0.05);
    m.box(1.52, 0.12, 0.12, C.wood, 0, 2.2, 0.05);
    m.box(1.3, 2.05, 0.05, 0xd2e2e6, 0, 1.05, 0.08);
    m.box(0.1, 0.15, 0.06, C.dgrey, 0.45, 1.1, 0.12);
    m.box(2.2, 0.12, 1.0, 0x8a6a4a, 0, 0.06, 0.6);
    m.pop();
    // crop rows inside (visible through the vent), a few red tomatoes
    for (const x of [-2.4, -1.2, 0, 1.2, 2.4]) {
      m.box(0.7, 0.18, L - 1.2, 0x7a5a3a, x, 0.09, 0);
      m.box(0.5, 0.55, L - 1.6, x === 2.4 || x === 0 ? 0x4f9e4a : C.leaf, x, 0.45, 0);
    }
    for (let i = 0; i < 9; i++) m.sphere(0.1, C.red, 2.4 + (i % 2 ? 0.26 : -0.26), 0.55 + (i % 3) * 0.12, -12 + i * 3, 1, 1, 1, 0, 0, 0, 4);
  },
});

// ---- 在建楼: 40 m concrete frame under construction — scaffolding, green safety netting, hoist -----
def('building_site', {
  name: '在建楼',
  cat: 'building',
  sfx: 'rumble',
  fill: 0.35,
  build(m) {
    const conc = 0xc9c4b8, block = 0xb3aca0, pipe = 0x7a8088, board = 0xd9a441, FH = 3.2, NF = 12;
    const XS = [-12, -4, 4, 12], ZS = [-7, 0, 7], TOPY = NF * FH;
    const k = winKit(m, 0), net = new Quads(m);
    m.box(25.4, 0.4, 15.4, 0x9a968c, 0, 0.2, 0);
    for (const x of XS) for (const z of ZS) {
      m.box(0.6, TOPY, 0.6, conc, x, TOPY / 2, z);
      for (const d of [-0.15, 0.15]) m.box(0.05, 1.3, 0.05, 0x6b4a3a, x + d, TOPY + 0.6, z + d);
    }
    for (let f = 1; f < NF; f++) m.box(24.6, 0.3, 14.6, conc, 0, f * FH, 0);
    // block infill with window openings on the lower floors (back and ends)
    for (let f = 0; f < 5; f++) {
      const y = f * FH + FH / 2 + 0.15;
      m.box(24, FH - 0.3, 0.25, block, 0, y, -7);
      m.push(0, 0, -7.13, 0, Math.PI, 0);
      for (const x of [-8, -2.5, 2.5, 8]) k.win(x, y, 0, 1.8, 1.4, { dark: true, frame: 0, mull: 0 });
      m.pop();
      m.box(0.25, FH - 0.3, 14, block, -12, y, 0);
      m.push(-12.13, 0, 0, 0, -Math.PI / 2, 0);
      for (const x of [-3.5, 3.5]) k.win(x, y, 0, 1.6, 1.4, { dark: true, frame: 0, mull: 0 });
      m.pop();
    }
    // scaffolding on the front and right side, netting on the lower two thirds, safety banner
    const SZ = 8.1, SX = 12.9;
    for (let x = -12; x <= 12.01; x += 2) m.box(0.07, TOPY + 1, 0.07, pipe, x, (TOPY + 1) / 2, SZ);
    for (let z = -7; z <= 7.01; z += 2) m.box(0.07, TOPY + 1, 0.07, pipe, SX, (TOPY + 1) / 2, z);
    for (let y = 2; y <= TOPY + 0.5; y += 2) {
      m.box(25.9, 0.07, 0.07, pipe, 0.45, y, SZ);
      m.box(0.07, 0.07, 16.2, pipe, SX, y, 0.55);
    }
    for (let y = 2; y <= TOPY; y += 6.4) {
      m.box(24.4, 0.06, 0.9, board, 0, y + 0.04, SZ - 0.45);
      m.box(0.9, 0.06, 14.4, board, SX - 0.45, y + 0.04, 0);
    }
    beam(m, [-12, 19.5, SZ + 0.05], [0, TOPY, SZ + 0.05], 0.08, pipe);
    beam(m, [0, 19.5, SZ + 0.05], [12, TOPY, SZ + 0.05], 0.08, pipe);
    for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) net.add2(-9 + i * 6.05, 3.25 + j * 6.5, SZ + 0.1, 6.05, 6.5);
    net.add2(-9 + 6.05 * 3, 3.25 + 3 * 6.5, SZ + 0.1, 6.05, 6.5);
    m.push(SX + 0.1, 0, 0, 0, Math.PI / 2, 0);
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) net.add2(-5.1 + i * 5.1, 3.25 + j * 6.5, 0, 5.1, 6.5);
    m.pop();
    net.flush(0xffffff, 0, 'bd_net');
    m.decal(9, 1.95, 'bd_safety', -3, 15.5, SZ + 0.18);
    // construction hoist (施工电梯) on the left end: mast, ties, cage
    m.box(0.9, TOPY + 3, 0.9, 0x9aa0a6, -13.6, (TOPY + 3) / 2, 2.5);
    for (let y = 6; y < TOPY; y += 9.6) m.box(1.5, 0.15, 0.15, 0x9aa0a6, -12.9, y, 2.5);
    m.box(1.7, 2.6, 3.0, 0x5a7fa8, -14.9, 16.5, 2.5);
    m.box(1.72, 0.3, 3.02, 0xf2c14e, -14.9, 17.9, 2.5);
    // top: formwork panels, rebar bundle, concrete pump pipe
    m.box(11.6, 0.2, 14, 0xb07a4f, -6.2, TOPY + 0.1, 0);
    for (let i = 0; i < 3; i++) m.box(6, 0.08, 0.08, 0x6b4a3a, 5 + i * 0.001, TOPY + 0.35 + i * 0.09, -3 + i * 0.1);
    m.cyl(0.14, 0.14, TOPY + 1.5, 0x5b6068, 4.5, (TOPY + 1.5) / 2, -7.5, 0, 0, 0, 6);
    k.flush();
  },
});
