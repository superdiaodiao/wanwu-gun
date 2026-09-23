// Reference models. They set the style every catalog file follows:
// chunky toy proportions, flat-shaded low-poly parts, saturated-but-soft colours, small cute details
// (eyes, blush, stitches, labels) that make an object readable from far away.
import { def } from './registry.js';
import { D } from '../core/modeler.js';
import { decal, fitText, FONTS } from '../core/atlas.js';

// ---- 包子 ------------------------------------------------------------------------------------
def('baozi', {
  name: '包子',
  cat: 'food',
  sfx: 'squish',
  fill: 0.6,
  build(m) {
    const dough = 0xf7f1e3, fold = 0xeadcc0;
    m.lathe([[0, 0], [0.036, 0.001], [0.041, 0.01], [0.039, 0.022], [0.031, 0.034], [0.018, 0.043], [0.006, 0.047], [0, 0.048]], dough, 0, 0, 0, 0, 0, 0, 12);
    // pleats twisting up to the knot
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      m.ellipsoid(0.011, 0.0035, 0.0028, fold, Math.cos(a) * 0.016, 0.043, Math.sin(a) * 0.016, 0, -a, -0.45, 6);
    }
    m.sphere(0.0065, fold, 0, 0.049, 0, 1, 0.75, 1, 0, 0, 0, 6);
  },
});

// ---- 橘猫 ------------------------------------------------------------------------------------
def('cat_orange', {
  name: '橘猫',
  cat: 'animal',
  sfx: 'meow',
  fill: 0.5,
  mover: { kind: 'wander', speed: 0.6 },
  build(m) {
    const fur = 0xf2a14a, light = 0xfbe8c8, stripe = 0xd4782a, pink = 0xf29aa6, dark = 0x2a1d17;
    // chubby body + cream belly
    m.ellipsoid(0.13, 0.115, 0.19, fur, 0, 0.145, -0.03, 0, 0, 0, 10);
    m.ellipsoid(0.098, 0.08, 0.13, light, 0, 0.11, 0.01, 0, 0, 0, 8);
    // back stripes
    for (let i = 0; i < 3; i++) m.ellipsoid(0.126, 0.032, 0.016, stripe, 0, 0.19, -0.14 + i * 0.065, 0, 0, 0, 8);
    // head
    m.sphere(0.095, fur, 0, 0.255, 0.15, 1.08, 0.92, 0.95, 0, 0, 0, 10);
    m.ellipsoid(0.048, 0.032, 0.03, light, 0, 0.222, 0.228, 0, 0, 0, 8);
    m.box(0.012, 0.03, 0.01, stripe, 0, 0.325, 0.2, -0.5, 0, 0); // forehead mark
    m.sym(s => {
      m.cone(0.036, 0.062, fur, s * 0.056, 0.33, 0.14, -0.1, 0, -s * 0.38, 4);
      m.cone(0.02, 0.036, pink, s * 0.054, 0.326, 0.152, -0.1, 0, -s * 0.38, 4);
      m.sphere(0.0125, dark, s * 0.038, 0.262, 0.236, 1, 1.25, 0.6, 0, 0, 0, 6); // eyes
      m.sphere(0.012, 0xf6b3b9, s * 0.064, 0.228, 0.215, 1.2, 0.8, 0.5, 0, 0, 0, 6); // blush
      // whiskers
      m.box(0.06, 0.0025, 0.0025, 0xfff7ea, s * 0.075, 0.226, 0.235, 0, s * 0.25, s * 0.12);
    });
    m.sphere(0.009, pink, 0, 0.232, 0.259, 1.2, 0.8, 0.8, 0, 0, 0, 6); // nose
    // stubby legs and paws
    m.sym(s => {
      m.capsule(0.036, 0.04, fur, s * 0.075, 0.057, 0.09, 0, 0, 0, 6);
      m.capsule(0.04, 0.04, fur, s * 0.08, 0.061, -0.13, 0, 0, 0, 6);
      m.sphere(0.036, light, s * 0.075, 0.022, 0.108, 1, 0.6, 1.15, 0, 0, 0, 6);
      m.sphere(0.04, light, s * 0.08, 0.022, -0.115, 1, 0.6, 1.1, 0, 0, 0, 6);
    });
    // tail curling up
    m.tube([[0, 0.15, -0.2], [0, 0.18, -0.28], [0.03, 0.27, -0.31], [0.055, 0.33, -0.26]], 0.022, fur, 6);
    m.sphere(0.024, stripe, 0.057, 0.335, -0.255, 1, 1, 1, 0, 0, 0, 6);
  },
});

// ---- 小汽车 (tinted body) ---------------------------------------------------------------------
decal('ex_plate', 128, 40, (ctx, w, h) => {
  ctx.fillStyle = '#1f4fb6';
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = '#e8eefc';
  ctx.lineWidth = 3;
  ctx.strokeRect(3, 3, w - 6, h - 6);
  fitText(ctx, '滚A·66666', w / 2, h / 2, w - 14, h - 12, FONTS.sans, '#f4f7ff');
});

def('car_sedan', {
  name: '小汽车',
  cat: 'vehicle',
  sfx: 'horn',
  fill: 0.55,
  tints: [0xd8342c, 0xf2f2ee, 0x2f63c9, 0x26262c, 0xb8bcc2, 0xe8b93a, 0x3a8f5c, 0xf08fb0],
  mover: { kind: 'drive', speed: 8 },
  build(m) {
    const glass = 0x2c4057, tire = 0x1b1b1d, hub = 0xc9cdd2, trim = 0x3a3a40, lamp = 0xfff3cc, tail = 0xe0282e;
    const W = 1.8, L = 4.5;
    // body + cabin shell take the instance colour
    m.tint();
    m.rbox(W, 0.62, L, 0.14, 0xffffff, 0, 0.56, 0);
    m.rbox(W * 0.86, 0.5, 2.05, 0.12, 0xffffff, 0, 1.1, -0.25);
    m.box(0.12, 0.08, 0.2, 0xffffff, 0.84, 0.95, 0.72); // mirrors
    m.box(0.12, 0.08, 0.2, 0xffffff, -0.84, 0.95, 0.72);
    m.tint(0);
    // glass: windscreen / rear screen wedges + side windows
    m.wedge(0.62, 0.46, W * 0.8, glass, 0, 1.08, 1.02, 0, -90 * D, 0);
    m.wedge(0.5, 0.42, W * 0.8, glass, 0, 1.07, -1.5, 0, 90 * D, 0);
    m.box(W * 0.87, 0.3, 1.7, glass, 0, 1.13, -0.28);
    // bumpers, grille, lamps
    m.box(W * 0.96, 0.18, 0.12, trim, 0, 0.36, L / 2 - 0.02);
    m.box(W * 0.96, 0.18, 0.12, trim, 0, 0.36, -L / 2 + 0.02);
    m.box(0.7, 0.14, 0.04, trim, 0, 0.62, L / 2 + 0.005);
    m.glow(1);
    m.sym(s => m.box(0.34, 0.12, 0.05, lamp, s * 0.6, 0.7, L / 2 - 0.005));
    m.sym(s => m.box(0.34, 0.1, 0.05, tail, s * 0.6, 0.72, -L / 2 + 0.005));
    m.glow(0);
    m.decal(0.44, 0.14, 'ex_plate', 0, 0.42, L / 2 + 0.045);
    m.decal(0.44, 0.14, 'ex_plate', 0, 0.42, -L / 2 - 0.045, 0, Math.PI, 0);
    // wheels
    for (const z of [1.45, -1.45]) {
      m.sym(s => {
        m.cyl(0.34, 0.34, 0.26, tire, s * 0.8, 0.34, z, 0, 0, 90 * D, 12);
        m.cyl(0.19, 0.19, 0.28, hub, s * 0.8, 0.34, z, 0, 0, 90 * D, 8);
      });
    }
  },
});

// ---- 麻将 · 红中 (decal on a small box) -------------------------------------------------------
decal('ex_mj_zhong', 52, 70, (ctx, w, h) => {
  ctx.fillStyle = '#f6f1e2';
  ctx.fillRect(0, 0, w, h);
  fitText(ctx, '中', w / 2, h / 2, w * 0.82, h * 0.74, FONTS.serif, '#c8202a');
});

def('mahjong_zhong', {
  name: '麻将·红中',
  cat: 'toy',
  sfx: 'tiny',
  fill: 1,
  build(m) {
    const W = 0.026, T = 0.018, L = 0.035; // lying face-up
    m.box(W, T * 0.58, L, 0xf4efe0, 0, T * 0.71, 0);
    m.box(W, T * 0.42, L, 0x2f8a5b, 0, T * 0.21, 0);
    m.decal(W * 0.9, L * 0.9, 'ex_mj_zhong', 0, T + 0.0003, 0, -90 * D, 0, 0);
  },
});
