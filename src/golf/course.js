// A hole's course, built from its character map, as a block of turf standing in a pond: the green
// on top (checkered like a mown lawn, painted onto one canvas with blades of grass and a shade along
// the rails), the road stretches, a chunky wooden rail along every edge of it (their inner faces
// the colliders), the block's sides of earth going down into the water, the tee mat, the hole — a
// cup with a glowing rim and a flag with the hole's number — and round the pond a park: reeds, lotus
// leaves, ducks paddling round, trees, benches, a few buildings far off. Everything in world metres,
// the map centred on the origin, the green's top at y = 0 where it is flat (a hole's `ground` raises
// it into ramps and mounds: the green, the rails, the block's earth sides follow, see ground.js).
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { CUP_R } from './physics.js';
import { ground } from './ground.js';
import { U } from '../core/materials.js';

const WALL_T = 0.22, WALL_TOP = 0.2, LEDGE = 0.16; // the rail; the strip of grass outside it
const WATER = -0.72, LAWN = -0.24, MOAT = 2.6; // the pond's level, the park's, the pond's width
const DECK = 3.2; // the boards round a pool
const PX = 64; // the green's texels per metre
const BLOCK_TOP = -0.03, BLOCK_BOT = WATER - 0.3;
const SUB = 6; // squares a metre a side of the green is cut into where it isn't flat
const lam = color => new THREE.MeshLambertMaterial({ color });

/** a tiny seeded random, so a hole's yard looks the same every time */
function rng(seed) {
  let s = seed * 9301 + 49297;
  return () => ((s = (s * 9301 + 49297) % 233280) / 233280);
}

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}
function texture(c, repeat) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

// ---- the earth on the block's sides (and the pond's bank): a lip of grass over layered soil and
// pebbles, darker going down; it repeats left to right, one copy a metre ----
let soilTex;
function soil() {
  if (soilTex) return soilTex;
  const w = 128, h = 256, c = canvas(w, h), g = c.getContext('2d'), R = rng(5);
  const grad = g.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, '#b07a45'); grad.addColorStop(0.55, '#94603a'); grad.addColorStop(1, '#5e3c22');
  g.fillStyle = grad;
  g.fillRect(0, 0, w, h);
  const wave = (x, y, a, f) => y + Math.sin((x / w) * Math.PI * 2 * f + y) * a; // (whole waves across: it repeats)
  const band = (y, th, col, f) => {
    g.fillStyle = col;
    g.beginPath();
    for (let x = 0; x <= w; x += 4) g.lineTo(x, wave(x, y, 3, f));
    for (let x = w; x >= 0; x -= 4) g.lineTo(x, wave(x, y + th, 3, f + 1));
    g.fill();
  };
  band(78, 9, 'rgba(70, 40, 18, 0.32)', 2);
  band(126, 16, 'rgba(205, 150, 95, 0.28)', 1);
  band(180, 8, 'rgba(60, 35, 15, 0.35)', 3);
  band(214, 12, 'rgba(180, 130, 80, 0.2)', 2);
  for (let i = 0; i < 46; i++) {
    const x = R() * w, y = 40 + R() * (h - 50), r = 1.5 + R() * 3.5, light = R() < 0.6;
    g.fillStyle = light ? 'rgba(220, 185, 140, 0.75)' : 'rgba(70, 42, 20, 0.6)';
    for (const dx of [-w, 0, w]) { g.beginPath(); g.ellipse(x + dx, y, r * 1.3, r, 0, 0, Math.PI * 2); g.fill(); }
  }
  // the grass lip, hanging over a little unevenly
  g.fillStyle = '#3d9a34';
  g.beginPath();
  g.moveTo(0, 0);
  for (let x = 0; x <= w; x += 2) g.lineTo(x, 22 + Math.sin((x / w) * Math.PI * 6) * 3 + Math.sin((x / w) * Math.PI * 14) * 2);
  g.lineTo(w, 0);
  g.fill();
  g.fillStyle = '#56b845';
  g.fillRect(0, 0, w, 7);
  return (soilTex = texture(c, true));
}

// ---- the pool's walls (and the block's sides in it): a white coping over a band of blue tiles at the
// waterline, then pale aqua mosaic, darker going down; it repeats left to right, one copy a metre ----
let tileTex;
function poolTiles() {
  if (tileTex) return tileTex;
  const w = 128, h = 256, c = canvas(w, h), g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, '#bff0f6'); grad.addColorStop(0.5, '#8fdbe8'); grad.addColorStop(1, '#4fb6cc');
  g.fillStyle = grad;
  g.fillRect(0, 0, w, h);
  const T = 16; // (a tile is an eighth of a metre)
  for (let y = 30; y < h; y += T) for (let x = 0; x < w; x += T) {
    g.fillStyle = `rgba(255, 255, 255, ${(0.08 + ((x * 7 + y * 13) % 5) * 0.03).toFixed(2)})`;
    g.fillRect(x + 1, y + 1, T - 2, T - 2);
  }
  g.fillStyle = 'rgba(40, 110, 140, 0.25)';
  for (let y = 30; y < h; y += T) g.fillRect(0, y, w, 1.5);
  for (let x = 0; x < w; x += T) g.fillRect(x, 30, 1.5, h - 30);
  // the waterline band of deep blue tiles
  g.fillStyle = '#2b7fc4';
  g.fillRect(0, 18, w, 14);
  g.fillStyle = 'rgba(255, 255, 255, 0.35)';
  for (let x = 0; x < w; x += 8) g.fillRect(x, 18, 1, 14);
  // the coping
  g.fillStyle = '#f6f2ea';
  g.fillRect(0, 0, w, 18);
  g.fillStyle = 'rgba(0, 0, 0, 0.08)';
  g.fillRect(0, 15, w, 3);
  return (tileTex = texture(c, true));
}

// ---- the deck round the pool: honey-coloured boards with dark gaps, two metres to a copy ----
let deckTex;
function deckBoards() {
  if (deckTex) return deckTex;
  const n = 256, c = canvas(n, n), g = c.getContext('2d'), R = rng(11);
  const B = n / 8; // (a board is a quarter metre wide)
  for (let i = 0; i < 8; i++) {
    // two boards end to end across each row, their joins staggered
    const cut = (0.2 + R() * 0.6) * n;
    for (const [x0, x1] of [[0, cut], [cut, n]]) {
      const k = 0.88 + R() * 0.2;
      g.fillStyle = `rgb(${Math.round(205 * k)}, ${Math.round(150 * k)}, ${Math.round(95 * k)})`;
      g.fillRect(x0, i * B, x1 - x0, B);
      for (let j = 0; j < 6; j++) {
        g.fillStyle = 'rgba(120, 70, 30, 0.12)';
        g.fillRect(x0, i * B + 3 + R() * (B - 6), x1 - x0, 1.2);
      }
      g.fillStyle = 'rgba(60, 35, 15, 0.55)';
      g.fillRect(x0, i * B, 2, B);
    }
    g.fillStyle = 'rgba(60, 35, 15, 0.6)';
    g.fillRect(0, i * B, n, 2.5);
  }
  const t = texture(c, true);
  t.repeat.set(0.5, 0.5);
  return (deckTex = t);
}

/** the earth, its texture laid on in world metres (one copy a metre round the sides, so blocks side
 *  by side carry it on without a seam), the grass lip at `top` and the texture's foot at `bottom`;
 *  `lifted`: the top is where each vertex's soilTop says (a side under a raised green), the texture
 *  hung from it, its darkest foot stretched on down to the bottom */
function soilMaterial(bottom, top, lifted = false, map = soil()) {
  const m = new THREE.MeshLambertMaterial({ map });
  const range = { value: new THREE.Vector2(bottom, top) };
  m.onBeforeCompile = sh => {
    sh.uniforms.uSoil = range;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>\nvarying vec2 vSoil;\nuniform vec2 uSoil;${lifted ? '\nattribute float soilTop;' : ''}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
      {
        vec4 wp = vec4(position, 1.0);
        #ifdef USE_INSTANCING
          wp = instanceMatrix * wp;
        #endif
        wp = modelMatrix * wp;
        vSoil = vec2(abs(normal.x) > abs(normal.z) ? wp.z : wp.x, ${lifted ? '1.0 - (soilTop - wp.y)' : '(wp.y - uSoil.x)'} / (uSoil.y - uSoil.x));
      }`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vSoil;')
      .replace('#include <map_fragment>', `diffuseColor *= texture2D(map, ${lifted ? 'vec2(vSoil.x, clamp(vSoil.y, 0.004, 0.996))' : 'vSoil'});`);
  };
  m.customProgramCacheKey = () => (lifted ? 'golf-soil-lifted' : 'golf-soil');
  return m;
}

// the materials, made once and shared by every hole (a hole made new ones, and freed them when it
// went, would have their shaders compiled again each time: a hitch at every new hole on a phone);
// the pool's yard has some of its own: the block's sides tiled, white rails, a deck
let MAT;
const LOOK = {};
function mats(look) {
  if (LOOK[look]) return LOOK[look];
  const base = baseMats();
  if (look !== 'pool') return (LOOK[look] = base);
  const tiles = poolTiles();
  return (LOOK[look] = {
    ...base,
    side: soilMaterial(BLOCK_BOT, BLOCK_TOP, false, tiles), sideLifted: soilMaterial(BLOCK_BOT, BLOCK_TOP, true, tiles), bank: soilMaterial(WATER - 0.3, LAWN, false, tiles),
    ledge: lam(0xf2ede2), lawn: lam(0x7fc45a), rail: lam(0xfbf5ea), post: lam(0x35b3cc), cap: lam(0xffffff),
    deck: new THREE.MeshLambertMaterial({ map: deckBoards() }), coping: lam(0xf6f2ea), dark: lam(0x3a3f45),
    bulb: new THREE.MeshBasicMaterial({ color: 0xffd98a }),
  });
}
function baseMats() {
  if (MAT) return MAT;
  MAT = {
    turf: new THREE.MeshLambertMaterial({ vertexColors: true }), // (its map is the hole's own canvas; its colours shade the slopes)
    side: soilMaterial(BLOCK_BOT, BLOCK_TOP), sideLifted: soilMaterial(BLOCK_BOT, BLOCK_TOP, true), bank: soilMaterial(WATER - 0.3, LAWN),
    ledge: lam(0x48a83b), lawn: lam(0x8fcb62),
    foam: new THREE.MeshBasicMaterial({ color: 0xcdeefc }),
    rail: lam(0xf0ae62), post: lam(0xc9783f), cap: lam(0xffd28a),
    tee: lam(0x2e8f43), teeLine: new THREE.MeshBasicMaterial({ color: 0xf6fbf2 }),
    hollow: new THREE.MeshBasicMaterial({ color: 0x1c1714 }), liner: new THREE.MeshBasicMaterial({ color: 0xf2f2ee }),
    rim: new THREE.MeshBasicMaterial({ color: 0xffd34d }), pole: lam(0xffffff), knob: lam(0xffd34d),
    flag: new THREE.MeshLambertMaterial({ side: THREE.DoubleSide }), // (its map: the hole's number)
  };
  return MAT;
}

// ---- the green: one canvas for the whole map ----
function turf(W, H, tiles, cell, green, R, gr, at) {
  const c = canvas(W * PX, H * PX), g = c.getContext('2d');
  const road = ch => ch === 'r';
  for (const t of tiles) {
    const x = t.c * PX, y = t.r * PX;
    g.fillStyle = road(t.ch) ? ((t.c + t.r) % 2 ? '#6d737d' : '#696f79') : (t.c + t.r) % 2 ? '#63c94d' : '#55bb41';
    g.fillRect(x, y, PX, PX);
    // blades of grass, or grit in the tarmac
    for (let i = 0; i < (road(t.ch) ? 50 : 80); i++) {
      const px = x + R() * PX, py = y + R() * PX, light = R() < 0.5;
      if (road(t.ch)) {
        g.fillStyle = light ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.12)';
        g.fillRect(px, py, 2, 2);
        continue;
      }
      g.strokeStyle = light ? 'rgba(235, 255, 170, 0.22)' : 'rgba(20, 80, 10, 0.2)';
      g.lineWidth = 1.4;
      g.beginPath();
      g.moveTo(px, py);
      g.lineTo(px + (R() - 0.5) * 3, py - 3 - R() * 4);
      g.stroke();
    }
  }
  // the road's white edge lines (where it meets the green) and a dashed line down its middle
  g.fillStyle = '#f4f1e8';
  for (const t of tiles) if (road(t.ch)) {
    const x = t.c * PX, y = t.r * PX;
    if (cell(t.c, t.r - 1) !== 'r' && green(cell(t.c, t.r - 1))) g.fillRect(x, y + 3, PX, 4);
    if (cell(t.c, t.r + 1) !== 'r' && green(cell(t.c, t.r + 1))) g.fillRect(x, y + PX - 7, PX, 4);
    if (cell(t.c, t.r - 1) !== 'r') {
      let n = 0;
      while (cell(t.c, t.r + n) === 'r') n++;
      const mid = y + (n / 2) * PX;
      g.fillRect(x + PX * 0.25, mid - 3, PX * 0.5, 6);
    }
  }
  // a soft shade along every rail
  const S = PX * 0.34;
  for (const t of tiles) {
    const x = t.c * PX, y = t.r * PX;
    const side = (dc, dr, x0, y0, x1, y1) => {
      if (green(cell(t.c + dc, t.r + dr))) return;
      const gr = g.createLinearGradient(x0, y0, x1, y1);
      gr.addColorStop(0, 'rgba(20, 60, 10, 0.4)');
      gr.addColorStop(1, 'rgba(20, 60, 10, 0)');
      g.fillStyle = gr;
      g.fillRect(Math.min(x0, x1), Math.min(y0, y1), dr ? PX : S, dr ? S : PX);
    };
    side(0, -1, x, y, x, y + S);
    side(0, 1, x, y + PX, x, y + PX - S);
    side(-1, 0, x, y, x + S, y);
    side(1, 0, x + PX, y, x + PX - S, y);
  }
  // where the ground slopes enough to roll the ball, faint chevrons pointing downhill (two on the
  // steep bits), staggered half a metre apart
  if (gr) {
    g.lineCap = g.lineJoin = 'round';
    for (const t of tiles) for (const [ox, oz] of [[-0.25, -0.25], [0.25, 0.25]]) {
      const p = at(t.c, t.r), x = p.x + ox, z = p.z + oz, [gx, gz] = gr.grad(x, z), k = Math.hypot(gx, gz);
      if (k < 0.08) continue;
      const dx = -gx / k, dz = -gz / k, cx = (x + W / 2) * PX, cy = (z + H / 2) * PX, a = PX * 0.13;
      g.strokeStyle = `rgba(255, 255, 255, ${Math.min(0.42, 0.14 + k * 0.9).toFixed(2)})`;
      g.lineWidth = PX * 0.07;
      for (const off of k > 0.2 ? [-0.6, 0.6] : [0]) {
        const mx = cx + dx * a * off * 1.3, my = cy + dz * a * off * 1.3;
        g.beginPath();
        g.moveTo(mx - dx * a - dz * a * 1.3, my - dz * a + dx * a * 1.3);
        g.lineTo(mx + dx * a * 0.6, my + dz * a * 0.6);
        g.lineTo(mx - dx * a + dz * a * 1.3, my - dz * a - dx * a * 1.3);
        g.stroke();
      }
    }
  }
  return texture(c);
}

/** the shape of a rounded rectangle, in the shape plane (x, -z), as a path */
function roundRect(path, x0, z0, x1, z1, r) {
  const a = -z1, b = -z0; // (shape y runs up the screen of the map: -z)
  path.moveTo(x0 + r, a);
  path.lineTo(x1 - r, a);
  path.quadraticCurveTo(x1, a, x1, a + r);
  path.lineTo(x1, b - r);
  path.quadraticCurveTo(x1, b, x1 - r, b);
  path.lineTo(x0 + r, b);
  path.quadraticCurveTo(x0, b, x0, b - r);
  path.lineTo(x0, a + r);
  path.quadraticCurveTo(x0, a, x0 + r, a);
  return path;
}

/** hole number `num` (as shown on its flag) of a yard that looks like `look` ('pond' or 'pool') */
export function buildCourse(hole, index, { scene, model, num = index + 1, look = 'pond', aniso = 4 }) {
  const map = hole.map, H = map.length, W = Math.max(...map.map(r => r.length));
  const at = (c, r) => ({ x: c - (W - 1) / 2, z: r - (H - 1) / 2 });
  const cell = (c, r) => (r >= 0 && r < H && c >= 0 && c < W ? map[r][c] || ' ' : ' ');
  const green = ch => '.rTHo'.includes(ch);
  const group = new THREE.Group();
  scene.add(group);
  const course = { W, H, at, group, cols: [], winds: [], candies: [], tee: null, cup: null, tiles: [], deco: [], movers: [] };
  const R = rng(index + 7), M = mats(look), pool = look === 'pool';
  // how high the green stands at (x, z): ramps and mounds, or flat
  const gr = ground(hole.ground, at), lift = gr && gr.h;
  const Y = lift ? (x, z) => lift(x, z) : () => 0;
  course.ground = gr;
  course.Y = Y;

  // ---- the green: a tile of it per square, painted from one canvas ----
  const tiles = [];
  for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) {
    const ch = cell(c, r);
    if (!green(ch)) continue;
    tiles.push({ c, r, ch });
    const p = at(c, r);
    if (ch === 'T') course.tee = p;
    if (ch === 'H') course.cup = p;
    if (ch === 'o') course.candies.push(p);
  }
  course.tiles = tiles;
  // (coins can also be put anywhere, such as on a mound's top: coins, a list of [c, r], or 'tops')
  const extra = hole.coins === 'tops' ? hole.ground.filter(g => g.t === 'hill' && g.h > 0).map(g => g.at) : hole.coins || [];
  for (const c of extra) course.candies.push(at(...c));
  // (a square each, or where the ground isn't flat cut finer to follow it, lit by its slope)
  // (and shaded: a slope facing the player lighter, one facing away darker, the high ground a little
  // lighter than the low, so the shape reads from where the hole is watched)
  const pos = [], uv = [], nor = [], col = [], idx = [], S = lift ? SUB : 1;
  const nv = new THREE.Vector3(), LX = -0.37, LZ = 0.93;
  for (const t of tiles) {
    const p = at(t.c, t.r), n = pos.length / 3;
    for (let j = 0; j <= S; j++) for (let i = 0; i <= S; i++) {
      const x = p.x - 0.5 + i / S, z = p.z - 0.5 + j / S, y = Y(x, z);
      pos.push(x, y, z);
      if (lift) {
        const g = gr.grad(x, z);
        nv.set(-g[0], 1, -g[1]).normalize();
        nor.push(nv.x, nv.y, nv.z);
        const k = Math.max(0.62, Math.min(1.35, (1 + 1.6 * (nv.x * LX + nv.z * LZ)) * (1 + 0.16 * y)));
        col.push(k, k, k);
      } else { nor.push(0, 1, 0); col.push(1, 1, 1); }
      uv.push((x + W / 2) / W, 1 - (z + H / 2) / H);
    }
    for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) {
      const a = n + j * (S + 1) + i, b = a + 1, c = a + S + 1, d = c + 1;
      idx.push(a, c, d, a, d, b);
    }
  }
  let hmax = 0;
  if (lift) for (let k = 0; k < pos.length; k += 3) hmax = Math.max(hmax, pos[k + 1]);
  course.hmax = hmax;
  const topGeo = new THREE.BufferGeometry();
  topGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  topGeo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  topGeo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  topGeo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  topGeo.setIndex(idx);
  const turfTex = turf(W, H, tiles, cell, green, R, gr, at);
  turfTex.anisotropy = aniso;
  M.turf.map = turfTex;
  const top = new THREE.Mesh(topGeo, M.turf);
  top.receiveShadow = true;
  group.add(top);

  // ---- the block under it: each square's earth reaches out under the rail and the grass strip
  // outside it, and down into the pond. Made as one shape of only the faces that show: the tops, and
  // the sides that face out (boxes side by side, their inner faces meeting, left a dark line at
  // every join) ----
  const O = WALL_T + LEDGE;
  const blocks = [];
  for (const t of tiles) {
    const p = at(t.c, t.r);
    const L = !green(cell(t.c - 1, t.r)), Rt = !green(cell(t.c + 1, t.r)), F = !green(cell(t.c, t.r - 1)), B = !green(cell(t.c, t.r + 1));
    const l = L ? O : 0, rr = Rt ? O : 0, f = F ? O : 0, b = B ? O : 0;
    blocks.push({ x: p.x + (rr - l) / 2, z: p.z + (b - f) / 2, w: 1 + l + rr, d: 1 + f + b, sides: [L, Rt, F, B], tile: p });
  }
  // (a pad of the same for something standing beside the green, such as a fan: see props.js; the
  // pond's leaves and reeds where it stands are taken away)
  const wet = [];
  course.pad = (x, z, w, d) => {
    addBlocks([{ x, z, w, d }]);
    for (const k of wet) if (Math.abs(k.x - x) < w / 2 + k.r && Math.abs(k.z - z) < d / 2 + k.r) k.g.visible = false;
  };
  function addBlocks(list) {
    if (lift && list.some(k => k.tile)) return addLifted(list);
    const pos = [], nor = [], tops = [], sides = [];
    const quad = (into, n, ...v) => {
      const i = pos.length / 3;
      for (const p of v) { pos.push(...p); nor.push(...n); }
      into.push(i, i + 1, i + 2, i, i + 2, i + 3);
    };
    const y0 = BLOCK_BOT, y1 = BLOCK_TOP;
    for (const k of list) {
      const x0 = k.x - k.w / 2, x1 = k.x + k.w / 2, z0 = k.z - k.d / 2, z1 = k.z + k.d / 2, [L, Rt, F, B] = k.sides || [1, 1, 1, 1];
      quad(tops, [0, 1, 0], [x0, y1, z0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0]);
      if (Rt) quad(sides, [1, 0, 0], [x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]);
      if (L) quad(sides, [-1, 0, 0], [x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]);
      if (B) quad(sides, [0, 0, 1], [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]);
      if (F) quad(sides, [0, 0, -1], [x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array((pos.length / 3) * 2), 2)); // (the earth's comes from where it is)
    geo.setIndex([...tops, ...sides]);
    geo.addGroup(0, tops.length, 0);
    geo.addGroup(tops.length, sides.length, 1);
    finishBlocks(list, new THREE.Mesh(geo, [M.ledge, M.side]));
  }
  // the block under a green that isn't flat: each square's top (where it shows, the grass strip
  // outside the rail) at the height of the green's edge beside it, and its sides up to that, cut as
  // finely as the green
  function addLifted(list) {
    const pos = [], nor = [], tops = [], sides = [], soilTop = [];
    const y0 = BLOCK_BOT, n3 = new THREE.Vector3();
    for (const k of list) {
      const t = k.tile, x0 = k.x - k.w / 2, x1 = k.x + k.w / 2, z0 = k.z - k.d / 2, z1 = k.z + k.d / 2, [L, Rt, F, B] = k.sides;
      // (outside the square the ground carries on level, at its edge's height)
      const cx = x => Math.max(t.x - 0.5, Math.min(t.x + 0.5, x)), cz = z => Math.max(t.z - 0.5, Math.min(t.z + 0.5, z));
      const top = (x, z) => Y(cx(x), cz(z)) + BLOCK_TOP;
      const nu = Math.ceil(k.w * SUB), nw = Math.ceil(k.d * SUB), base = pos.length / 3;
      for (let j = 0; j <= nw; j++) for (let i = 0; i <= nu; i++) {
        const x = x0 + (k.w * i) / nu, z = z0 + (k.d * j) / nw, g = gr.grad(cx(x), cz(z));
        n3.set(x === cx(x) ? -g[0] : 0, 1, z === cz(z) ? -g[1] : 0).normalize();
        pos.push(x, top(x, z), z); nor.push(n3.x, n3.y, n3.z); soilTop.push(top(x, z));
      }
      for (let j = 0; j < nw; j++) for (let i = 0; i < nu; i++) {
        const a = base + j * (nu + 1) + i, b = a + 1, c = a + nu + 1, d = c + 1;
        tops.push(a, c, d, a, d, b);
      }
      // a side from end A to end B (as the flat block's faces go round), in strips
      const side = (n, ax, az, bx, bz, len) => {
        const m = Math.ceil(len * SUB);
        for (let s = 0; s < m; s++) {
          const u0 = s / m, u1 = (s + 1) / m, i = pos.length / 3;
          const pA = [ax + (bx - ax) * u0, az + (bz - az) * u0], pB = [ax + (bx - ax) * u1, az + (bz - az) * u1];
          const tA = top(...pA), tB = top(...pB);
          for (const [x, y, z, st] of [[pA[0], y0, pA[1], tA], [pB[0], y0, pB[1], tB], [pB[0], tB, pB[1], tB], [pA[0], tA, pA[1], tA]]) {
            pos.push(x, y, z); nor.push(...n); soilTop.push(st);
          }
          sides.push(i, i + 1, i + 2, i, i + 2, i + 3);
        }
      };
      if (Rt) side([1, 0, 0], x1, z1, x1, z0, k.d);
      if (L) side([-1, 0, 0], x0, z0, x0, z1, k.d);
      if (B) side([0, 0, 1], x0, z1, x1, z1, k.w);
      if (F) side([0, 0, -1], x1, z0, x0, z0, k.w);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array((pos.length / 3) * 2), 2));
    geo.setAttribute('soilTop', new THREE.Float32BufferAttribute(soilTop, 1));
    geo.setIndex([...tops, ...sides]);
    geo.addGroup(0, tops.length, 0);
    geo.addGroup(tops.length, sides.length, 1);
    finishBlocks(list, new THREE.Mesh(geo, [M.ledge, M.sideLifted]));
  }
  function finishBlocks(list, block) {
    block.receiveShadow = true;
    block.castShadow = true;
    // a ring of foam where it meets the water
    const foam = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), M.foam, list.length);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), v = new THREE.Vector3();
    list.forEach((k, i) => foam.setMatrixAt(i, m4.compose(v.set(k.x, WATER + 0.006, k.z), q, s.set(k.w + 0.16, 1, k.d + 0.16))));
    group.add(block, foam);
  }
  addBlocks(blocks);

  // ---- rails: every edge between green and not-green, merged into straight runs ----
  const runs = new Map();
  const edge = (key, a, b) => { if (!runs.has(key)) runs.set(key, []); runs.get(key).push([a, b]); };
  for (const t of tiles) {
    const { c, r } = t;
    if (!green(cell(c, r - 1))) edge(`h:${r - 0.5}:-1`, c - 0.5, c + 0.5); // far side, rail outward -z
    if (!green(cell(c, r + 1))) edge(`h:${r + 0.5}:1`, c - 0.5, c + 0.5);
    if (!green(cell(c - 1, r))) edge(`v:${c - 0.5}:-1`, r - 0.5, r + 0.5);
    if (!green(cell(c + 1, r))) edge(`v:${c + 0.5}:1`, r - 0.5, r + 0.5);
  }
  const RAIL_H = WALL_TOP + 0.06, POST = WALL_T + 0.02;
  // (as plain shapes: a RoundedBoxGeometry's clone() would build a whole default one first)
  const plain = g => new THREE.BufferGeometry().copy(g);
  const postGeo = plain(new RoundedBoxGeometry(POST, RAIL_H + 0.08, POST, 2, 0.04)), capGeo = plain(new RoundedBoxGeometry(POST + 0.04, 0.05, POST + 0.04, 2, 0.02));
  // (all the rails, all the posts and all their caps each made one mesh: a draw apiece)
  const railGeos = [], postGeos = [], capGeos = [];
  const posts = new Set();
  const post = (x, z, y = 0) => {
    const key = `${x.toFixed(2)},${z.toFixed(2)}`;
    if (posts.has(key)) return;
    posts.add(key);
    postGeos.push(postGeo.clone().translate(x, RAIL_H / 2 - 0.02 + y, z)); // (from the rail's foot to a little above its top)
    capGeos.push(capGeo.clone().translate(x, RAIL_H + 0.04 + y, z));
  };
  // a rail up a slope: its rounded section (as the straight ones', WALL_T by RAIL_H) carried along the
  // run, its foot at yAt(u) at each point u along it
  const sweptRail = (kind, mx, mz, len, yAt) => {
    const r = 0.05, hw = WALL_T / 2, hh = RAIL_H / 2, sec = [];
    for (const [ax, ay, a0] of [[hw - r, hh - r, 0], [-hw + r, hh - r, 90], [-hw + r, -hh + r, 180], [hw - r, -hh + r, 270]]) {
      for (let k = 0; k <= 2; k++) { const a = ((a0 + k * 45) * Math.PI) / 180; sec.push([ax + Math.cos(a) * r, ay + Math.sin(a) * r, Math.cos(a), Math.sin(a)]); }
    }
    const n = Math.max(2, Math.ceil(len / 0.15)), m = sec.length, c0 = (kind === 'h' ? mx : mz) - len / 2;
    const P = [], N = [], I = [];
    // (along the run, across it, up) into the world's (x, y, z)
    const put = (u, w, y, nu, nw, ny) => {
      if (kind === 'h') { P.push(u, y, mz + w); N.push(nu, ny, nw); } else { P.push(mx + w, y, u); N.push(nw, ny, nu); }
    };
    for (let i = 0; i <= n; i++) {
      const u = c0 + (len * i) / n, yc = yAt(u) + hh - 0.06;
      for (const [w, y, nw, ny] of sec) put(u, w, yc + y, 0, nw, ny);
    }
    // the faces turned outwards: (a winding that comes out facing in is turned round)
    const v = i => new THREE.Vector3(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]);
    const tri = (a, b, c, out) => {
      const nrm = v(b).sub(v(a)).cross(v(c).sub(v(a)));
      if (nrm.dot(out) >= 0) I.push(a, b, c); else I.push(a, c, b);
    };
    const o = new THREE.Vector3();
    for (let i = 0; i < n; i++) for (let j = 0; j < m; j++) {
      const a = i * m + j, b = (i + 1) * m + j, c = (i + 1) * m + ((j + 1) % m), d = i * m + ((j + 1) % m);
      o.set(N[a * 3], N[a * 3 + 1], N[a * 3 + 2]);
      tri(a, b, c, o); tri(a, c, d, o);
    }
    // the ends, closed
    for (const [i, sgn] of [[0, -1], [n, 1]]) {
      const u = c0 + (len * i) / n, yc = yAt(u) + hh - 0.06, mid = P.length / 3, base = P.length / 3 + 1;
      put(u, 0, yc, sgn, 0, 0);
      for (const [w, y] of sec) put(u, w, yc + y, sgn, 0, 0);
      o.set(kind === 'h' ? sgn : 0, 0, kind === 'h' ? 0 : sgn);
      for (let j = 0; j < m; j++) tri(mid, base + j, base + ((j + 1) % m), o);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array((P.length / 3) * 2), 2));
    g.setIndex(I);
    return g.toNonIndexed(); // (as the straight ones are, to be merged with them)
  };
  for (const [key, list] of runs) {
    const [kind, line, out] = key.split(':');
    const L = +line, o = +out;
    list.sort((a, b) => a[0] - b[0]);
    const merged = [];
    for (const [a, b] of list) {
      const last = merged[merged.length - 1];
      if (last && Math.abs(last[1] - a) < 1e-6) last[1] = b;
      else merged.push([a, b]);
    }
    // which side of the line the green is on: the row (h) or column (v) just inside the rail
    const inner = o < 0 ? L + 0.5 : L - 0.5;
    const greenAt = k => (kind === 'h' ? green(cell(k, inner)) : green(cell(inner, k)));
    for (const [a, b] of merged) {
      // the collider is the rail's inner face, along the green's edge (in map units, so shift)
      const A = kind === 'h' ? at(a, L) : at(L, a), B = kind === 'h' ? at(b, L) : at(L, b);
      course.cols.push({ kind: 'seg', ax: A.x, az: A.z, bx: B.x, bz: B.z });
      // past an outer corner the rail runs on to meet the one round the corner; at an inner corner
      // (the green carries on beyond the end) it stops, or it would stick out into the green
      const e0 = greenAt(a - 0.5) ? 0 : WALL_T, e1 = greenAt(b + 0.5) ? 0 : WALL_T;
      const len = Math.hypot(B.x - A.x, B.z - A.z) + e0 + e1, slide = (e1 - e0) / 2;
      const mx = (A.x + B.x) / 2 + (kind === 'v' ? o * WALL_T / 2 : slide);
      const mz = (A.z + B.z) / 2 + (kind === 'h' ? o * WALL_T / 2 : slide);
      // (where the ground isn't flat the rail stands on the green's edge beside it all along)
      const yAt = u => (kind === 'h' ? Y(Math.max(A.x, Math.min(B.x, u)), A.z) : Y(A.x, Math.max(A.z, Math.min(B.z, u))));
      const c0 = (kind === 'h' ? mx : mz) - len / 2;
      let ylo = 0, yhi = 0;
      if (lift) {
        ylo = Infinity; yhi = -Infinity;
        for (let k = 0, n = Math.ceil(len / 0.1); k <= n; k++) { const y = yAt(c0 + (len * k) / n); ylo = Math.min(ylo, y); yhi = Math.max(yhi, y); }
      }
      if (yhi - ylo > 1e-3) railGeos.push(sweptRail(kind, mx, mz, len, yAt));
      else {
        const geo = kind === 'h' ? new RoundedBoxGeometry(len, RAIL_H, WALL_T, 2, 0.05) : new RoundedBoxGeometry(WALL_T, RAIL_H, len, 2, 0.05);
        railGeos.push(geo.translate(mx, RAIL_H / 2 - 0.06 + ylo, mz));
      }
      // a post at each outer corner, and along a long run every few metres
      const along = (u, perp) => (kind === 'h' ? [u, mz + perp] : [mx + perp, u]);
      const u0 = c0 + WALL_T / 2, u1 = u0 + len - WALL_T;
      if (e0) post(...along(u0, 0), yAt(u0));
      if (e1) post(...along(u1, 0), yAt(u1));
      const n = Math.floor((u1 - u0) / 3.2);
      for (let i = 1; i <= n; i++) { const u = u0 + ((u1 - u0) * i) / (n + 1); post(...along(u, 0), yAt(u)); }
    }
  }
  for (const [geos, mat] of [[railGeos, M.rail], [postGeos, M.post], [capGeos, M.cap]]) {
    const one = new THREE.Mesh(mergeGeometries(geos), mat);
    for (const g of geos) g.dispose();
    one.castShadow = true;
    one.receiveShadow = true;
    group.add(one);
  }
  postGeo.dispose();
  capGeo.dispose();

  // ---- the tee mat: rubber, with a white line ----
  const mat = new THREE.Mesh(new RoundedBoxGeometry(0.8, 0.04, 0.8, 1, 0.015), M.tee);
  mat.position.set(course.tee.x, 0.012 + Y(course.tee.x, course.tee.z), course.tee.z);
  mat.receiveShadow = true;
  group.add(mat);
  const teeLine = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.05).rotateX(-Math.PI / 2), M.teeLine);
  teeLine.position.set(course.tee.x, 0.034 + Y(course.tee.x, course.tee.z + 0.3), course.tee.z + 0.3);
  group.add(teeLine);

  // ---- the hole: a dark hollow in a white liner, a glowing rim and a flag with its number ----
  const cup = new THREE.Group();
  const cupY = Y(course.cup.x, course.cup.z);
  cup.position.set(course.cup.x, cupY, course.cup.z);
  // (lying on the green: where it isn't flat, bent to follow it)
  const drape = (geo, dy) => {
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) p.setY(i, p.getY(i) + dy + Y(course.cup.x + p.getX(i), course.cup.z + p.getZ(i)) - cupY);
    return geo;
  };
  cup.add(new THREE.Mesh(drape(new THREE.CircleGeometry(CUP_R, 28).rotateX(-Math.PI / 2), 0.004), M.hollow));
  cup.add(new THREE.Mesh(drape(new THREE.RingGeometry(CUP_R - 0.06, CUP_R - 0.02, 32).rotateX(-Math.PI / 2), 0.005), M.liner));
  cup.add(new THREE.Mesh(drape(new THREE.TorusGeometry(CUP_R, 0.026, 6, 32).rotateX(Math.PI / 2), 0.01), M.rim));
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 1.3, 8), M.pole);
  pole.position.set(0, 0.65, 0);
  pole.castShadow = true;
  cup.add(pole);
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 8), M.knob);
  knob.position.y = 1.31;
  cup.add(knob);
  const fc = canvas(128, 84), fg = fc.getContext('2d');
  fg.fillStyle = '#ff4b4b';
  fg.fillRect(0, 0, 128, 84);
  fg.fillStyle = '#e03a3a';
  fg.fillRect(0, 70, 128, 14);
  fg.fillStyle = '#ffffff';
  fg.font = '800 62px "Baloo 2", "Arial Rounded MT Bold", Arial, sans-serif';
  fg.textAlign = 'center';
  fg.textBaseline = 'middle';
  fg.fillText(String(num), 58, 40, 108);
  const flagGeo = new THREE.PlaneGeometry(0.52, 0.34, 6, 1).translate(0.26, -0.17, 0);
  const flagTex = texture(fc);
  M.flag.map = flagTex;
  const flag = new THREE.Mesh(flagGeo, M.flag);
  flag.position.set(0, 1.27, 0);
  flag.castShadow = true;
  cup.add(flag);
  group.add(cup);
  course.cupFx = { rim: M.rim, flag, pole };

  // ---- the pond round the block, and the park round the pond ----
  const X0 = -W / 2, X1 = W / 2, Z0 = -H / 2, Z1 = H / 2;
  const pond = { x0: X0 - O - MOAT, x1: X1 + O + MOAT, z0: Z0 - O - MOAT, z1: Z1 + O + MOAT };
  const inPond = (x, z, m = 0) => x > pond.x0 - m && x < pond.x1 + m && z > pond.z0 - m && z < pond.z1 + m;
  const water = new THREE.Mesh(new THREE.PlaneGeometry(200, 200).rotateX(-Math.PI / 2), waterMaterial(look));
  water.position.y = WATER;
  water.receiveShadow = true;
  group.add(water);
  const lawnShape = roundRect(new THREE.Shape(), -100, -100, 100, 100, 0);
  lawnShape.holes.push(roundRect(new THREE.Path(), pond.x0, pond.z0, pond.x1, pond.z1, 1.6));
  const lawnGeo = new THREE.ExtrudeGeometry(lawnShape, { depth: LAWN - WATER + 0.3, bevelEnabled: false, curveSegments: 8 }).rotateX(-Math.PI / 2);
  lawnGeo.translate(0, WATER - 0.3, 0);
  const lawn = new THREE.Mesh(lawnGeo, [M.lawn, M.bank]);
  lawn.receiveShadow = true;
  group.add(lawn);
  // foam along the bank (a pond's), or round a pool its coping and the deck
  const ring = (out, r0, inset, r1) => {
    const sh = roundRect(new THREE.Shape(), pond.x0 - out, pond.z0 - out, pond.x1 + out, pond.z1 + out, r0);
    sh.holes.push(roundRect(new THREE.Path(), pond.x0 + inset, pond.z0 + inset, pond.x1 - inset, pond.z1 - inset, r1));
    return sh;
  };
  if (!pool) {
    const bf = new THREE.Mesh(new THREE.ShapeGeometry(ring(0.1, 1.6, 0.1, 1.5), 8).rotateX(-Math.PI / 2), M.foam);
    bf.position.y = WATER + 0.006;
    group.add(bf);
  } else {
    const deck = new THREE.Mesh(new THREE.ShapeGeometry(ring(DECK, 2.6, -0.3, 1.9), 8).rotateX(-Math.PI / 2), M.deck);
    deck.position.y = LAWN + 0.02;
    deck.receiveShadow = true;
    const coping = new THREE.Mesh(new THREE.ExtrudeGeometry(ring(0.42, 2, 0.16, 1.45), { depth: 0.07, bevelEnabled: false, curveSegments: 8 }).rotateX(-Math.PI / 2), M.coping);
    coping.position.y = LAWN + 0.015;
    coping.receiveShadow = coping.castShadow = true;
    group.add(deck, coping);
  }

  const onBlock = (x, z, m) => tiles.some(t => { const p = at(t.c, t.r); return Math.abs(p.x - x) < 0.5 + O + m && Math.abs(p.z - z) < 0.5 + O + m; });
  const placed = [];
  const free = (x, z, d) => !placed.some(p => Math.hypot(p[0] - x, p[1] - z) < d + (p[2] || 0)); // (p[2]: a wide thing's own radius)
  const put = (id, x, z, y, size, low = false) => {
    let g;
    try { g = model(id, null, size); } catch { return null; }
    g.position.set(x, y, z);
    g.rotation.y = R() * Math.PI * 2;
    group.add(g);
    placed.push([x, z]);
    // (low things are left in sight wherever they are: see aim() in main.js)
    if (!low) course.deco.push({ g, box: new THREE.Box3().setFromObject(g) });
    return g;
  };
  // the ducks' way round the block, in the middle of the pond (see below)
  const lane = roundRect(new THREE.Path(), pond.x0 + MOAT * 0.45, pond.z0 + MOAT * 0.45, pond.x1 - MOAT * 0.45, pond.z1 - MOAT * 0.45, 1.2);
  const loop = lane.getSpacedPoints(240).map(p => new THREE.Vector2(p.x, -p.y));
  const offLane = (x, z, d) => loop.every(p => Math.hypot(p.x - x, p.y - z) > d);
  if (pool) backGarden();
  else park();
  function park() {
  // in the water: lotus leaves (out of the ducks' way), more of them in a pond's wide parts (inside
  // an L or a U), and reeds and rocks along the bank
  for (let i = 0; i < 80 && placed.length < 8; i++) {
    const x = pond.x0 + 0.6 + R() * (pond.x1 - pond.x0 - 1.2), z = pond.z0 + 0.6 + R() * (pond.z1 - pond.z0 - 1.2), size = 0.9 + R() * 0.5;
    if (onBlock(x, z, 0.5) || !free(x, z, 1.4) || !offLane(x, z, size / 2 + 0.35)) continue;
    const g = put('lotus', x, z, WATER, size, true);
    if (g) wet.push({ g, x, z, r: size / 2 });
  }
  const rim0 = placed.length;
  for (let i = 0; i < 80 && placed.length - rim0 < 14; i++) {
    // a point on the bank: along one of the four sides, just inside the water or just on the lawn
    const sideK = Math.floor(R() * 4), u = R(), inWater = R() < 0.55;
    const d = inWater ? 0.35 : -0.45;
    let x, z;
    if (sideK < 2) { x = pond.x0 + 1.6 + u * (pond.x1 - pond.x0 - 3.2); z = sideK ? pond.z0 + d : pond.z1 - d; }
    else { z = pond.z0 + 1.6 + u * (pond.z1 - pond.z0 - 3.2); x = sideK === 2 ? pond.x0 + d : pond.x1 - d; }
    if (!free(x, z, 1.2) || onBlock(x, z, 0.6)) continue;
    if (inWater) { const g = put('reeds', x, z, WATER, 0.9 + R() * 0.5, true); if (g) wet.push({ g, x, z, r: 0.3 }); }
    else put(R() < 0.5 ? 'rock_small' : 'grass_tuft', x, z, LAWN, 0.4 + R() * 0.3, true);
  }
  // the park: trees well back from the water, low things nearer
  const kinds = [['tree_plane', 4.2], ['tree_camphor', 4], ['tree_peach', 3], ['bush', 1.1], ['bush', 0.9], ['flower_patch', 0.8], ['bench', 1.6], ['sunflower', 1.3], ['rose_pot', 0.7], ['potted_plant', 0.9]];
  const lawn0 = placed.length;
  for (let i = 0; i < 160 && placed.length - lawn0 < 34; i++) {
    const [id, size] = kinds[Math.floor(R() * kinds.length)];
    const x = pond.x0 - 7 + R() * (pond.x1 - pond.x0 + 14), z = pond.z0 - 7 + R() * (pond.z1 - pond.z0 + 11);
    if (inPond(x, z, size > 2 ? 2 : 0.8) || !free(x, z, size > 2 ? 2.4 : 1.4)) continue;
    put(id, x, z, LAWN, size);
  }
  // a street of shops and towers behind the far end, side by side, their fronts well back from it
  // (a tower in the middle: a shop's sign there would be behind the score at the top of the screen)
  const street = ['shop_pharmacy', 'shop_super', 'office_tower', 'shop_super', 'office_tower'].map(id => {
    const g = model(id, 1), bx = new THREE.Box3().setFromObject(g);
    return { g, w: bx.max.x - bx.min.x, front: bx.max.z };
  });
  let x = -street.reduce((a, b) => a + b.w + 4, -4) / 2;
  for (const b of street) {
    b.g.position.set(x + b.w / 2, LAWN, pond.z0 - 14 - R() * 3 - b.front);
    x += b.w + 4;
    group.add(b.g);
    course.deco.push({ g: b.g, far: true });
  }
  }

  // the back garden round the pool: loungers and parasols on the deck, a barbecue, a ladder down into
  // the water; on the lawn a trampoline, a dog by its kennel, gnomes and plastic flamingos among the
  // flowers; string lights on poles at the deck's corners, a white picket fence round it all, the house
  // behind the far end, and trees over the fence
  function backGarden() {
    const tryModel = (id, k, size) => { try { return model(id, k, size); } catch { return null; } };
    const stand = (id, x, z, rot, { k = 1, size, y = LAWN + 0.02, low = false, far = false, r = 0 } = {}) => {
      const g = tryModel(id, size ? null : k, size);
      if (!g) return null;
      g.position.set(x, y, z);
      g.rotation.y = rot;
      group.add(g);
      placed.push([x, z, r]);
      if (far) course.deco.push({ g, far: true });
      else if (!low) course.deco.push({ g, box: new THREE.Box3().setFromObject(g) });
      return g;
    };
    const { x0, x1, z0, z1 } = pond, mx = (x0 + x1) / 2, D = DECK / 2 + 0.1, len = z1 - z0;
    // the deck: a lounger each side near each end, feet to the pool, a parasol between each pair
    for (const sx of [-1, 1]) {
      const x = sx < 0 ? x0 - D : x1 + D;
      for (const f of [0.22, 0.62]) stand('lounger', x, z0 + len * f, sx < 0 ? Math.PI / 2 : -Math.PI / 2, { low: true });
      stand('parasol', x - sx * 0.2, z0 + len * 0.42, R() * 6, { low: true });
    }
    stand('bbq_grill', x1 + D, z0 - D + 0.2, -Math.PI * 0.75, { r: 0.4 });
    stand('pool_ladder', x0 + 0.05, z0 + len * 0.82, Math.PI / 2, { y: LAWN + 0.085 - 0.9, low: true });
    // the lawn beyond the deck
    const L = DECK + 0.6;
    stand('trampoline', x0 - L - 2.3, z0 + len * 0.2, 0, { r: 1.3 });
    stand('doghouse', x1 + L + 1.8, z0 + len * 0.35, -Math.PI / 2, { r: 0.6 });
    stand('dog_shiba', x1 + L + 0.9, z0 + len * 0.35 + 1.1, -Math.PI * 0.6, { k: 1.3 });
    stand('garden_gnome', x0 - L - 0.6, z1 - 1.2, Math.PI * 0.25, { low: true });
    stand('garden_gnome', x1 + L + 0.5, z0 + len * 0.7, -Math.PI * 0.3, { low: true });
    stand('lawn_flamingo', x1 + L + 1.2, z0 + len * 0.62, 0.4, { low: true });
    stand('lawn_flamingo', x1 + L + 1.75, z0 + len * 0.66, -0.3, { low: true });
    for (let i = 0; i < 40 && placed.length < 30; i++) {
      const id = ['flower_patch', 'rose_pot', 'bush', 'sunflower', 'hedge'][Math.floor(R() * 5)];
      const sx = R() < 0.5 ? -1 : 1, x = sx < 0 ? x0 - L - 0.4 - R() * 5 : x1 + L + 0.4 + R() * 5, z = z0 - 4 + R() * (len + 6);
      if (!free(x, z, 1.5)) continue;
      stand(id, x, z, R() * 6, { size: id === 'hedge' ? 1.6 : id === 'bush' ? 1.1 : id === 'sunflower' ? 1.3 : 0.8, low: id !== 'sunflower' });
    }
    // the house, facing the pool across the lawn behind the far end
    stand('house_back', mx, z0 - DECK - 9, 0, { far: true });
    // the fence: picket sections end to end round the garden, but for where the house stands
    const fx0 = x0 - L - 7, fx1 = x1 + L + 7, fz0 = z0 - DECK - 11, fz1 = z1 + 14;
    const proto = tryModel('fence_picket');
    if (proto) {
      const mesh = proto.children[0], spots = [];
      const run = (ax, az, bx, bz) => {
        const n = Math.round(Math.hypot(bx - ax, bz - az) / 2);
        for (let i = 0; i < n; i++) spots.push([ax + ((bx - ax) * (i + 0.5)) / n, az + ((bz - az) * (i + 0.5)) / n, Math.atan2(-(bz - az), bx - ax)]);
      };
      run(fx0, fz0, mx - 7, fz0); run(mx + 7, fz0, fx1, fz0);
      run(fx1, fz0, fx1, fz1); run(fx0, fz1, fx0, fz0);
      const im = new THREE.InstancedMesh(mesh.geometry, mesh.material, spots.length);
      im.userData.keep = true; // (the catalog's shape: kept)
      const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(1, 1, 1), v = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
      spots.forEach(([x, z, a], i) => im.setMatrixAt(i, m4.compose(v.set(x, LAWN, z).add(mesh.position), q.setFromAxisAngle(up, a), sc)));
      im.castShadow = im.receiveShadow = true;
      group.add(im);
      course.deco.push({ g: im, far: true });
    }
    // trees in the corners and over the fence
    for (const [x, z, id, size] of [[fx0 + 2, fz0 + 3, 'tree_plane', 5], [fx1 - 2.5, fz0 + 2.5, 'tree_camphor', 4.6], [fx0 - 3, z0 + len * 0.5, 'tree_plane', 5.5], [fx1 + 3, z0 + len * 0.4, 'tree_camphor', 5.2], [mx - 12, fz0 - 4, 'tree_plane', 6], [mx + 13, fz0 - 5, 'tree_camphor', 6]]) {
      stand(id, x, z, R() * 6, { size, far: z < z0 - DECK });
    }
    // string lights: a pole at each corner of the deck, a sagging line of bulbs down each long side
    // and across the far end
    const pts = [], H = 2.7, P = [[x0 - DECK + 0.3, z0 - DECK + 0.3], [x1 + DECK - 0.3, z0 - DECK + 0.3], [x1 + DECK - 0.3, z1 + DECK - 0.3], [x0 - DECK + 0.3, z1 + DECK - 0.3]];
    const poleGeo = new THREE.CylinderGeometry(0.05, 0.06, H, 8).translate(0, H / 2, 0);
    for (const [x, z] of P) { const pole = new THREE.Mesh(poleGeo, M.dark); pole.position.set(x, LAWN, z); pole.castShadow = true; group.add(pole); }
    const wires = [];
    for (const [a, b] of [[0, 1], [0, 3], [1, 2]]) {
      const [ax, az] = P[a], [bx, bz] = P[b], n = Math.max(4, Math.round(Math.hypot(bx - ax, bz - az) / 0.6)), line = [];
      for (let i = 0; i <= n; i++) {
        const u = i / n, y = LAWN + H - 0.05 - Math.sin(u * Math.PI) * 0.55;
        line.push(new THREE.Vector3(ax + (bx - ax) * u, y, az + (bz - az) * u));
        if (i && i < n) pts.push([ax + (bx - ax) * u, y - 0.09, az + (bz - az) * u]);
      }
      wires.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(line), n * 2, 0.012, 4));
    }
    group.add(new THREE.Mesh(mergeGeometries(wires), M.dark));
    for (const w of wires) w.dispose();
    const bulbs = new THREE.InstancedMesh(new THREE.SphereGeometry(0.065, 8, 6), M.bulb, pts.length);
    const m4 = new THREE.Matrix4();
    pts.forEach(([x, y, z], i) => bulbs.setMatrixAt(i, m4.makeTranslation(x, y, z)));
    group.add(bulbs);
  }

  // ---- in the water: ducks paddling round the pond, or the pool's floats drifting round, along the lane ----
  if (pool) {
    const loopLen = loop.reduce((a, p, i) => a + (i ? p.distanceTo(loop[i - 1]) : 0), 0);
    const floats = [['flamingo_float', 1], ['pool_ring', 1], ['beach_ball', 1], ['rubber_duck', 5], ['pool_noodle', 1], ['rubber_duck', 4]]
      .map(([id, k], i) => { try { const g = model(id, k); group.add(g); return { g, i, at: (i / 6) * loopLen + R() * 0.8, spin: (R() - 0.5) * 0.6 }; } catch { return null; } })
      .filter(Boolean);
    const at2 = new THREE.Vector2();
    const along = s => {
      s = ((s % loopLen) + loopLen) % loopLen;
      const f = (s / loopLen) * (loop.length - 1), i = Math.floor(f), k = f - i, a = loop[i], b = loop[Math.min(i + 1, loop.length - 1)];
      return at2.set(a.x + (b.x - a.x) * k, a.y + (b.y - a.y) * k);
    };
    course.movers.push(t => {
      for (const f of floats) {
        const q = along(f.at + t * 0.12);
        f.g.position.set(q.x, WATER - 0.04 + Math.sin(t * 1.6 + f.i) * 0.02, q.y);
        f.g.rotation.set(Math.sin(t * 1.3 + f.i) * 0.05, f.i + t * f.spin, Math.cos(t * 1.1 + f.i) * 0.05);
      }
    });
  } else {
  const loopLen = loop.reduce((a, p, i) => a + (i ? p.distanceTo(loop[i - 1]) : 0), 0);
  const ducks = ['duck', 'duckling', 'duckling', 'duckling'].map((id, i) => ({ g: model(id, i ? 1.7 : 1.5), back: i ? 0.35 + i * 0.42 : 0, i }));
  for (const d of ducks) group.add(d.g);
  const start = R() * loopLen, dir = R() < 0.5 ? 1 : -1;
  const along = s => {
    s = ((s % loopLen) + loopLen) % loopLen;
    const f = (s / loopLen) * (loop.length - 1), i = Math.floor(f), k = f - i, a = loop[i], b = loop[Math.min(i + 1, loop.length - 1)];
    return [a.x + (b.x - a.x) * k, a.y + (b.y - a.y) * k];
  };
  course.movers.push(t => {
    for (const d of ducks) {
      const s = start + dir * (t * 0.32 - d.back);
      const [px, pz] = along(s), [qx, qz] = along(s + dir * 0.1);
      d.g.position.set(px, WATER - 0.025 + Math.sin(t * 2.2 + d.i) * 0.012, pz);
      d.g.rotation.y = Math.atan2(qx - px, qz - pz);
    }
  });
  }

  course.update = t => { for (const m of course.movers) m(t); };
  // the shapes and pictures made for this hole alone go with it; what is kept (userData.keep: the
  // catalog's models and the coins) and the materials are shared with the next (materials are left
  // to be collected, not disposed: disposing frees their shaders, to be compiled again next hole)
  course.dispose = () => {
    group.removeFromParent();
    group.traverse(o => {
      if (!o.isMesh) return;
      if (o.isInstancedMesh) o.dispose(); // (its own instances; not the shape, which may be kept)
      if (!o.userData.keep) o.geometry.dispose();
    });
    turfTex.dispose();
    flagTex.dispose();
  };
  course.water = WATER;
  course.lawn = LAWN;
  course.pond = pond;
  course.bounds = { x0: X0 - WALL_T, x1: X1 + WALL_T, z0: Z0 - WALL_T, z1: Z1 + WALL_T };
  return course;
}

// ---- the water: a pond's blue with soft bright ripples drifting over it, or a pool's turquoise with a
// net of bright light wavering on its floor ----
const waterMats = {};
function waterMaterial(look) {
  if (waterMats[look]) return waterMats[look];
  if (look === 'pool') return (waterMats[look] = poolWater());
  const waterMat = new THREE.MeshLambertMaterial({ color: 0x3aa6e2 });
  waterMat.onBeforeCompile = sh => {
    sh.uniforms.uTime = U.time;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;\nuniform float uTime;')
      .replace('#include <color_fragment>', `#include <color_fragment>
      {
        vec2 p = vWPos.xz * 2.2;
        float t = uTime;
        float a = sin(p.x + sin(p.y * 1.3 + t * 0.9) * 1.2 + t * 0.6) * sin(p.y * 1.15 + sin(p.x * 0.9 - t * 0.7) * 1.3 - t * 0.5);
        float b = sin(p.x * 1.9 - t * 0.8 + sin(p.y * 1.6 + t * 0.3)) * sin(p.y * 2.1 + t * 0.7 + sin(p.x * 1.3));
        float w = a * 0.65 + b * 0.35;
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.7, 0.92, 1.0), pow(max(w, 0.0), 5.0) * 0.8);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.15, 0.5, 0.8), smoothstep(-0.3, -0.8, w) * 0.25);
      }`);
  };
  return (waterMats.pond = waterMat);
}
function poolWater() {
  const m = new THREE.MeshLambertMaterial({ color: 0x2cc3dc });
  m.onBeforeCompile = sh => {
    sh.uniforms.uTime = U.time;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;\nuniform float uTime;')
      .replace('#include <color_fragment>', `#include <color_fragment>
      {
        vec2 p = vWPos.xz * 1.5;
        float t = uTime * 0.7;
        vec2 q = p + vec2(sin(p.y * 1.3 + t), cos(p.x * 1.1 - t)) * 0.55;
        float a = abs(sin(q.x * 2.1 + t) + sin(q.y * 2.3 - t * 0.8));
        float b = abs(sin((q.x + q.y) * 1.7 - t * 1.1) + sin((q.x - q.y) * 1.9 + t * 0.7));
        float c = pow(max(0.0, 1.0 - min(a, b) * 0.9), 6.0);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.86, 1.0, 1.0), c * 0.32);
      }`);
  };
  m.customProgramCacheKey = () => 'golf-pool';
  return m;
}
