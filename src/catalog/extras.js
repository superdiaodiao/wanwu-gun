// Objects the game logic depends on directly: the square-dance loudspeaker (rolling it up silences
// the plaza) and the compound wall.
import { def } from './registry.js';
import { D } from '../core/modeler.js';
import { decal, fitText, FONTS } from '../core/atlas.js';

decal('ex_speaker_grille', 64, 64, (ctx, w, h) => {
  ctx.fillStyle = '#1d1d22';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#34343c';
  for (let y = 4; y < h; y += 6) for (let x = 4 + ((y / 6) % 2) * 3; x < w; x += 6) {
    ctx.beginPath();
    ctx.arc(x, y, 1.8, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.strokeStyle = '#55555f';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(w / 2, h / 2, w * 0.36, 0, Math.PI * 2);
  ctx.stroke();
});
decal('ex_speaker_label', 96, 24, (ctx, w, h) => {
  ctx.fillStyle = '#d8342c';
  ctx.fillRect(0, 0, w, h);
  fitText(ctx, '广场舞专用', w / 2, h / 2, w - 8, h - 6, FONTS.sans, '#fff4d8');
});

def('speaker', {
  name: '广场舞音箱',
  cat: 'daily',
  sfx: 'crash',
  fill: 0.85,
  build(m) {
    const body = 0x2a2a31, trim = 0x55555f, led = 0xff4fa3;
    m.rbox(0.5, 0.78, 0.36, 0.04, body, 0, 0.47, 0);
    m.decal(0.4, 0.4, 'ex_speaker_grille', 0, 0.55, 0.182);
    m.decal(0.3, 0.075, 'ex_speaker_label', 0, 0.2, 0.182);
    m.glow(1);
    m.box(0.44, 0.02, 0.02, led, 0, 0.86, 0.17);
    m.box(0.44, 0.02, 0.02, 0x36e0ff, 0, 0.12, 0.17);
    m.glow(0);
    // trolley handle and wheels
    m.sym(s => m.box(0.025, 0.4, 0.025, trim, s * 0.18, 1.04, -0.12));
    m.box(0.4, 0.03, 0.03, trim, 0, 1.24, -0.12);
    m.sym(s => m.cyl(0.05, 0.05, 0.04, 0x1a1a1e, s * 0.2, 0.05, -0.13, 0, 0, 90 * D, 10));
    m.box(0.06, 0.04, 0.3, trim, 0, 0.9, 0.02);
  },
});

decal('ex_wall_slogan', 256, 48, (ctx, w, h) => {
  ctx.fillStyle = 'rgba(0,0,0,0)';
  ctx.clearRect(0, 0, w, h);
  fitText(ctx, '文明小区 · 幸福你我', w / 2, h / 2, w - 10, h - 8, FONTS.brush, '#b8261f');
});

def('wall_seg', {
  name: '围墙',
  cat: 'building',
  sfx: 'rumble',
  fill: 0.9,
  build(m) {
    const L = 4, H = 2.2, T = 0.3;
    m.box(L, H, T, 0xe9e1d2, 0, H / 2, 0);
    m.box(L, 0.35, T + 0.04, 0x9a4a3c, 0, 0.175, 0);
    // grey tile coping
    m.box(L + 0.02, 0.1, T + 0.24, 0x55606a, 0, H + 0.05, 0);
    m.prism(T + 0.3, 0.14, L + 0.02, 0x4a545e, 0, H + 0.17, 0, 0, 90 * D, 0);
    m.sym(s => m.box(0.34, H + 0.08, T + 0.08, 0xd9d0bf, s * (L / 2 - 0.17), (H + 0.08) / 2, 0));
  },
});

def('wall_slogan', {
  name: '标语墙',
  cat: 'building',
  sfx: 'rumble',
  fill: 0.9,
  build(m) {
    const L = 4, H = 2.2, T = 0.3;
    m.box(L, H, T, 0xe9e1d2, 0, H / 2, 0);
    m.box(L, 0.35, T + 0.04, 0x9a4a3c, 0, 0.175, 0);
    m.box(L + 0.02, 0.1, T + 0.24, 0x55606a, 0, H + 0.05, 0);
    m.prism(T + 0.3, 0.14, L + 0.02, 0x4a545e, 0, H + 0.17, 0, 0, 90 * D, 0);
    m.decal(3.4, 0.64, 'ex_wall_slogan', 0, 1.3, T / 2 + 0.01);
    m.decal(3.4, 0.64, 'ex_wall_slogan', 0, 1.3, -T / 2 - 0.01, 0, Math.PI, 0);
  },
});

// 五色石碎片: ten of them hidden round the map (game/shards.js), a little cluster of crystals in the
// five colours of the stone, ~10 cm tall (scaled per place). Not in the 图鉴: they have a count of
// their own.
def('wuse_shard', {
  name: '五色石碎片',
  cat: 'nature',
  sfx: 'glass',
  hidden: true,
  fill: 0.5,
  build(m) {
    const COL = [0x3fd0c0, 0xe8453c, 0xf6c945, 0xf8f4ea, 0x7b5cd6];
    const crystal = (h, r, col, x, z, tx, tz) => {
      m.push(x, 0, z, tx, 0, tz);
      m.cone(r, h * 0.72, col, 0, h * 0.64, 0, 0, 0, 0, 5);
      m.cone(r, h * 0.28, col, 0, h * 0.14, 0, 180 * D, 0, 0, 5);
      m.pop();
    };
    crystal(0.1, 0.022, COL[0], 0, 0, 0, 0);
    crystal(0.07, 0.016, COL[1], 0.018, 0.008, 0, -26 * D);
    crystal(0.065, 0.015, COL[2], -0.016, 0.01, 0, 24 * D);
    crystal(0.055, 0.013, COL[4], 0.004, -0.018, -24 * D, 0);
    crystal(0.05, 0.012, COL[3], -0.004, 0.02, 22 * D, 0);
    m.cyl(0.03, 0.034, 0.008, 0x8a7a66, 0, 0.004, 0, 0, 0, 0, 7);
  },
});
