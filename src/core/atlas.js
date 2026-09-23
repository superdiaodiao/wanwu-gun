// Runtime texture atlas. Catalog files register small canvas drawings ("decals") at import time;
// buildAtlas() packs them into one CanvasTexture that every object material shares.
//
//   decal('sm_mahjong_zhong', 64, 84, (ctx, w, h) => { ...draw into 0..w, 0..h... });
//   // later, inside a model:  m.decal(0.026, 0.034, 'sm_mahjong_zhong', 0, 0.02, 0.011);
//
// Pixels with alpha < 0.5 are cut out (the object material uses alphaTest), so a decal may be a
// full opaque picture or just a shape (text, eyes, stripes) floating over the surface behind it.
import * as THREE from 'three';

const regs = new Map();
const rects = new Map();
let texture = null;
let size = 0;

export const PAD = 6;

/** Register a decal. w/h are pixel sizes of its region in the atlas. */
export function decal(key, w, h, draw) {
  if (regs.has(key)) console.warn('[atlas] duplicate decal key', key);
  regs.set(key, { w: Math.ceil(w), h: Math.ceil(h), draw });
}

export function hasDecal(key) { return regs.has(key); }

/** Font stacks usable by decal drawings. Web fonts are awaited before the atlas is built. */
export const FONTS = {
  brush: '"Ma Shan Zheng", "STKaiti", "KaiTi", "Kaiti SC", "BiauKai", "Songti SC", "SimSun", serif',
  round: '"ZCOOL KuaiLe", "Yuanti SC", "YouYuan", "PingFang SC", "Microsoft YaHei", sans-serif',
  sans: '"Noto Sans SC", "PingFang SC", "Microsoft YaHei", "Heiti SC", "Noto Sans CJK SC", sans-serif',
  serif: '"Noto Serif SC", "Songti SC", "STSong", "SimSun", "Noto Serif CJK SC", serif',
};

/** Draw centered text fitted into a box. */
export function fitText(ctx, text, cx, cy, maxW, maxH, font = FONTS.sans, color = '#000', weight = 'bold') {
  let px = maxH;
  ctx.font = `${weight} ${px}px ${font}`;
  const w = ctx.measureText(text).width;
  if (w > maxW) px = Math.max(6, Math.floor(px * maxW / w));
  ctx.font = `${weight} ${px}px ${font}`;
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, cx, cy + px * 0.04);
}

/** Vertical text (one character per line), centered in a box. */
export function verticalText(ctx, text, cx, cy, maxW, maxH, font = FONTS.brush, color = '#000', weight = 'bold') {
  const chars = [...text];
  const px = Math.min(maxW, maxH / chars.length);
  ctx.font = `${weight} ${px}px ${font}`;
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const top = cy - (chars.length * px) / 2 + px / 2;
  chars.forEach((c, i) => ctx.fillText(c, cx, top + i * px));
}

function pack(list, S) {
  // shelf packing, tallest first
  let x = 0, y = 0, shelfH = 0;
  const out = new Map();
  // reserve a white square for untextured (vertex coloured) geometry
  out.set('__white', { x: 0, y: 0, w: 16, h: 16 });
  x = 16 + PAD * 2;
  shelfH = 16;
  for (const [key, r] of list) {
    const w = r.w + PAD * 2, h = r.h + PAD * 2;
    if (w > S) return null;
    if (x + w > S) { x = 0; y += shelfH; shelfH = 0; }
    if (y + h > S) return null;
    out.set(key, { x: x + PAD, y: y + PAD, w: r.w, h: r.h });
    x += w;
    shelfH = Math.max(shelfH, h);
  }
  return out;
}

/** Pack and paint every registered decal. Returns the shared CanvasTexture. Idempotent. */
export function buildAtlas() {
  if (texture) return texture;
  const list = [...regs.entries()].sort((a, b) => b[1].h - a[1].h);
  let packed = null;
  for (const S of [1024, 2048, 4096, 8192]) {
    packed = pack(list, S);
    if (packed) { size = S; break; }
  }
  if (!packed) throw new Error('[atlas] decals do not fit into 8192²');

  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  for (const [key, r] of packed) rects.set(key, r);
  paint(canvas);

  texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}

/** Redraw every decal in place (e.g. once web fonts have arrived). UVs are unchanged. */
export function repaintAtlas() {
  if (!texture) return;
  paint(texture.image);
  texture.needsUpdate = true;
}

function paint(canvas) {
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, 16, 16);
  for (const [key, r] of rects) {
    if (key === '__white') continue;
    const reg = regs.get(key);
    ctx.save();
    ctx.beginPath();
    ctx.rect(r.x, r.y, r.w, r.h);
    ctx.clip();
    ctx.translate(r.x, r.y);
    try {
      reg.draw(ctx, r.w, r.h);
    } catch (e) {
      console.error('[atlas] decal draw failed', key, e);
      ctx.fillStyle = '#f0f';
      ctx.fillRect(0, 0, r.w, r.h);
    }
    ctx.restore();
    // bleed edge pixels into the padding so mipmaps don't pull in neighbours
    ctx.drawImage(canvas, r.x, r.y, 1, r.h, r.x - PAD, r.y, PAD, r.h);
    ctx.drawImage(canvas, r.x + r.w - 1, r.y, 1, r.h, r.x + r.w, r.y, PAD, r.h);
    ctx.drawImage(canvas, r.x - PAD, r.y, r.w + PAD * 2, 1, r.x - PAD, r.y - PAD, r.w + PAD * 2, PAD);
    ctx.drawImage(canvas, r.x - PAD, r.y + r.h - 1, r.w + PAD * 2, 1, r.x - PAD, r.y + r.h, r.w + PAD * 2, PAD);
  }
}

export function atlasTexture() { return texture; }
export function atlasCanvas() { return texture ? texture.image : null; }

/** UV rectangle [u0, v0, u1, v1] for a registered decal (v0 = bottom). */
export function getUV(key) {
  const r = rects.get(key);
  if (!r) {
    if (!texture) throw new Error('[atlas] getUV before buildAtlas: ' + key);
    console.warn('[atlas] unknown decal', key);
    return WHITE();
  }
  // tiny inset avoids sampling the padding at the exact edge
  const e = 0.5;
  return [(r.x + e) / size, 1 - (r.y + r.h - e) / size, (r.x + r.w - e) / size, 1 - (r.y + e) / size];
}

/** UV of the white texel used by plain vertex-coloured faces. */
export function WHITE() {
  return [8 / size, 1 - 8 / size, 8 / size, 1 - 8 / size];
}

// in mainland China (going by the time zone) fonts.googleapis.com is unreachable, but Google's own
// mirror there, fonts.googleapis.cn (fonts from fonts.gstatic.cn), works
const IN_CN = (() => {
  try {
    return /^(Asia\/(Shanghai|Chongqing|Harbin|Urumqi|Kashgar)|PRC)$/.test(Intl.DateTimeFormat().resolvedOptions().timeZone);
  } catch (e) {
    return false;
  }
})();
const FONT_CSS = `https://fonts.googleapis.${IN_CN ? 'cn' : 'com'}/css2?family=Baloo+2:wght@600;800&family=Ma+Shan+Zheng&family=Noto+Sans+SC:wght@400;700&family=Noto+Serif+SC:wght@700&family=ZCOOL+KuaiLe&display=swap`;

/**
 * Attach the Google Fonts stylesheet from script instead of a <link> in <head>: a head stylesheet is
 * render-blocking, so on networks where Google is unreachable (mainland China without a VPN) the page
 * would sit blank until the request times out. Injected here, nothing waits for it; system fonts are
 * used until (and unless) the web fonts arrive. Resolves true once loaded, false on failure.
 */
let fontCss = null;
export function injectFontCss() {
  if (fontCss) return fontCss;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = FONT_CSS;
  fontCss = new Promise(res => {
    link.onload = () => res(true);
    link.onerror = () => res(false);
  });
  document.head.appendChild(link);
  return fontCss;
}

/** Wait for the web fonts (if any are reachable) so decal text renders with them. */
export async function loadFonts(timeoutMs = 2500) {
  if (!document.fonts || !document.fonts.load) return;
  const timeout = new Promise(r => setTimeout(() => r(false), timeoutMs));
  // the @font-face rules only exist once the stylesheet has arrived
  if (!(await Promise.race([injectFontCss(), timeout]))) return;
  const probes = [
    '40px "Ma Shan Zheng"',
    '40px "ZCOOL KuaiLe"',
    'bold 40px "Noto Sans SC"',
    'bold 40px "Noto Serif SC"',
  ];
  // the glyphs actually used by decals: loading with a sample string pulls the right unicode-range slices
  // every CJK glyph in the sources (collected at build time) so the right font slices load
  const sample = typeof __GLYPHS__ !== 'undefined' && __GLYPHS__ ? __GLYPHS__ : '包子铺水果超市理发奶茶饭店药店五金福中发万条筒';
  const all = Promise.all(probes.map(p => document.fonts.load(p, sample).catch(() => null)));
  await Promise.race([all, new Promise(r => setTimeout(r, timeoutMs))]);
}
