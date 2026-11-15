// A hole's course, built from its character map, as a block of turf standing in a pond: the green
// on top (checkered like a mown lawn, painted onto one canvas with blades of grass and a shade along
// the rails; mud and ice painted over it where the map has them), the road stretches, a chunky
// wooden rail along every edge of it (their inner faces the colliders), the block's sides of earth
// going down into the water, the tee mat, the hole — a cup with a glowing rim and a flag with the
// hole's number — and round the pond the yard's look (looks/): a park, a back garden. Everything in
// world metres, the map centred on the origin, the green's top at y = 0 where it is flat (a hole's
// `ground` raises it into ramps and mounds: the green, the rails, the block's earth sides follow, see
// ground.js).
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { CUP_R } from './physics.js';
import { ground } from './ground.js';
import { WALL_T, WALL_TOP, LEDGE, WATER, LAWN, MOAT, BLOCK_TOP, BLOCK_BOT, lam, rng, canvas, texture, roundRect, soilMaterial, rippleWater, particles } from './looks/kit.js';
import { lookOf } from './looks/index.js';
import { HOLES, YARDS, PER } from './holes.js';
import { buildProps, propsCtx } from './props.js';
import { CATALOG } from '../catalog/registry.js';

const PX = 64; // the green's texels per metre
const SUB = 6; // squares a metre a side of the green is cut into where it isn't flat
const LOOK_H = 1.6, DEEP = 0.45; // how many times higher the ground is drawn than it is to the ball, and how
// deep it goes at most (see buildCourse)
// the squares that are green to the ball but roll differently (physics.js PHYS.surf), and what each
// says over it till the first shot
export const SURF = { m: '泥地会减速', i: '冰面很滑' };
const isSurf = ch => ch === 'm' || ch === 'i';

// the materials, made once and shared by every hole (a hole made new ones, and freed them when it
// went, would have their shaders compiled again each time: a hitch at every new hole on a phone);
// a look can have some of its own (looks/: the pool's yard has the block's sides tiled, white rails,
// a deck), made the first time it is needed and kept
let MAT;
const LOOK = {};
function mats(L) {
  if (LOOK[L.name]) return LOOK[L.name];
  const base = baseMats();
  return (LOOK[L.name] = L.materials ? { ...base, ...L.materials(base) } : base);
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

// ---- the water: the look's own, made once for each look ----
const waterMats = {};
function waterMaterial(L) {
  return waterMats[L.name] || (waterMats[L.name] = typeof L.water === 'function' ? L.water() : rippleWater(L.water));
}

/** has the shaders compiled now that the first hole of the yard that looks like `name` draws (its look's
 *  materials, its water and particles, the things on it), so that hole doesn't stop to do it: while the
 *  card after the last hole of the yard before is up, or a yard's holes are open on the map, and in an
 *  idle moment on the yard before's last two holes (or from the start, if it is open already: main.js
 *  warm). The hole is built out of sight, cheaply (its green unpainted, and a model not made yet standing
 *  in as one that is: a model's shape is all that differs, they share one material, or a tint of it,
 *  which compiles the same) and a little at a time, a frame between: the block, then the yard round it
 *  and the things on it;
 *  then it is compiled against the scene's lights, the GPU at it in the background where it can
 *  (compileAsync), and it goes. Shaders that only the yard's later holes use are compiled as they come */
export async function warmLook(name, renderer, scene, camera) {
  const y = YARDS.findIndex(Y => Y.look === name), i = y * PER, made = propsCtx();
  if (y < 0 || !HOLES[i] || !made) return;
  const stand = [...CATALOG.values()].find(d => d.geometry)?.id, real = id => (stand && !CATALOG.get(id)?.geometry ? stand : id);
  const model = (id, ...a) => made.model(real(id), ...a);
  const breathe = () => new Promise(r => requestAnimationFrame(() => setTimeout(r)));
  let c = null;
  try {
    c = buildCourse(HOLES[i], i, { scene: new THREE.Scene(), model, look: name, warm: true });
    await breathe();
    c.yard();
    buildProps(HOLES[i], c, { ...made, model, spec: id => made.spec(real(id)), warm: true });
    await breathe();
    await renderer.compileAsync(c.group.parent, camera, scene);
  } catch (e) { console.warn('[golf] warming up', name, e); }
  if (c) c.dispose();
}

// ---- the green: one canvas for the whole map, in the look's colours (P: its turf; steps: the hole's
// ground list, for the shade under the top of a step, P.lip) ----
function turf(W, H, tiles, cell, green, R, gr, at, P, seed, steps) {
  const c = canvas(W * PX, H * PX), g = c.getContext('2d');
  const road = ch => ch === 'r';
  for (const t of tiles) {
    // (P.mow: 'checker', or 'rows' across the hole, or 'cols': stripes down it, as a lawn mown up and down)
    const x = t.c * PX, y = t.r * PX, odd = (P.mow === 'rows' ? t.r : P.mow === 'cols' ? t.c : t.c + t.r) % 2;
    g.fillStyle = road(t.ch) ? ((t.c + t.r) % 2 ? P.road[0] : P.road[1]) : odd ? P.green[0] : P.green[1];
    g.fillRect(x, y, PX, PX);
    // blades of grass, or grit in the tarmac
    for (let i = 0; i < (road(t.ch) ? 50 : 80); i++) {
      const px = x + R() * PX, py = y + R() * PX, light = R() < 0.5;
      if (road(t.ch)) {
        g.fillStyle = light ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.12)';
        g.fillRect(px, py, 2, 2);
        continue;
      }
      g.strokeStyle = light ? P.blade[0] : P.blade[1];
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
  if (tiles.some(t => isSurf(t.ch))) surfaces(g, tiles, cell, P, rng(seed));
  // a soft shade along every rail
  const S = PX * 0.34;
  for (const t of tiles) {
    const x = t.c * PX, y = t.r * PX;
    const side = (dc, dr, x0, y0, x1, y1) => {
      if (green(cell(t.c + dc, t.r + dr))) return;
      const gr = g.createLinearGradient(x0, y0, x1, y1);
      gr.addColorStop(0, P.shade);
      gr.addColorStop(1, 'rgba(20, 60, 10, 0)');
      g.fillStyle = gr;
      g.fillRect(Math.min(x0, x1), Math.min(y0, y1), dr ? PX : S, dr ? S : PX);
    };
    side(0, -1, x, y, x, y + S);
    side(0, 1, x, y + PX, x, y + PX - S);
    side(-1, 0, x, y, x + S, y);
    side(1, 0, x + PX, y, x + PX - S, y);
  }
  if (P.lip && steps) lips(g, tiles, steps, P.lip);
  // where the ground slopes enough to roll the ball, faint chevrons pointing downhill (two on the
  // steep bits), staggered half a metre apart (in the look's colour and strength, P.chevron, if it has
  // them: { rgb: 'r, g, b', min, shadow })
  if (gr) {
    g.lineCap = g.lineJoin = 'round';
    const CH = typeof P.chevron === 'number' ? { min: P.chevron } : P.chevron;
    for (const t of tiles) for (const [ox, oz] of [[-0.25, -0.25], [0.25, 0.25]]) {
      const p = at(t.c, t.r), x = p.x + ox, z = p.z + oz, [gx, gz] = gr.grad(x, z), k = Math.hypot(gx, gz);
      if (k < 0.08) continue;
      const dx = -gx / k, dz = -gz / k, cx = (x + W / 2) * PX, cy = (z + H / 2) * PX, a = PX * 0.13;
      const chevron = (mx, my) => {
        g.beginPath();
        g.moveTo(mx - dx * a - dz * a * 1.3, my - dz * a + dx * a * 1.3);
        g.lineTo(mx + dx * a * 0.6, my + dz * a * 0.6);
        g.lineTo(mx - dx * a + dz * a * 1.3, my - dz * a - dx * a * 1.3);
        g.stroke();
      };
      g.lineWidth = PX * 0.07;
      if (!CH) g.strokeStyle = `rgba(255, 255, 255, ${Math.min(0.42, 0.14 + k * 0.9).toFixed(2)})`;
      for (const off of k > 0.2 ? [-0.6, 0.6] : [0]) {
        const mx = cx + dx * a * off * 1.3, my = cy + dz * a * off * 1.3;
        if (CH) {
          // (a dark copy a pixel or two down and to the right first, so a pale one reads on pale turf)
          if (CH.shadow) { g.strokeStyle = CH.shadow; chevron(mx + 1.5, my + 1.5); }
          const min = CH.min || 0;
          g.strokeStyle = `rgba(${CH.rgb || '255, 255, 255'}, ${Math.min(Math.max(0.42, min), Math.max(min, 0.14 + k * 0.9)).toFixed(2)})`;
        }
        chevron(mx, my);
      }
    }
  }
  return texture(c);
}

/** a look's shade just below the top of each step (P.lip: a colour, or { color, w } with w its width in
 *  metres, 0.12 unless said): fading from the colour at the step's top edge to nothing, downhill, over
 *  the green squares it crosses. A step: a ramp along a row or a column of the map (as looks/autumn.js
 *  edges with timber), its top where it starts going down */
function lips(g, tiles, steps, lip) {
  const color = typeof lip === 'string' ? lip : lip.color, w = (typeof lip === 'string' ? 0 : lip.w) || 0.12;
  for (const d of steps) {
    if (d.t !== 'ramp') continue;
    const alongR = d.from[0] === d.to[0], alongC = d.from[1] === d.to[1];
    if (alongR === alongC) continue;
    const k = alongR ? 1 : 0, top = d.h < 0 ? d.from[k] : d.to[k], low = d.h < 0 ? d.to[k] : d.from[k];
    const e = (top + 0.5) * PX, s = Math.sign(low - top) * w * PX; // (the edge on the canvas, and the band's reach downhill)
    const gr = k ? g.createLinearGradient(0, e, 0, e + s) : g.createLinearGradient(e, 0, e + s, 0);
    gr.addColorStop(0, color);
    gr.addColorStop(1, 'rgba(0, 0, 0, 0)');
    g.fillStyle = gr;
    const a = Math.min(e, e + s), b = Math.max(e, e + s);
    for (const t of tiles) {
      // (the part of the band on this square)
      const lo = (k ? t.r : t.c) * PX, x0 = Math.max(a, lo), x1 = Math.min(b, lo + PX);
      if (x1 <= x0) continue;
      if (k) g.fillRect(t.c * PX, x0, PX, x1 - x0);
      else g.fillRect(x0, t.r * PX, x1 - x0, PX);
    }
  }
}

/** mud and ice, over the grass of their squares: one patch of each, its edge ragged where it meets the
 *  plain green (and straight where it meets more of itself, or a rail). Mud wet brown with ruts along
 *  the hole, blotches, pebbles and a puddle's sheen; ice pale blue-white with a sheen across it, scratches
 *  and a rim of snow */
function surfaces(g, tiles, cell, P, R) {
  // (the edge's raggedness, from where it is, so neighbouring squares meet)
  const jag = (px, py) => 5 + 3 * Math.sin(px * 0.21 + py * 0.17) + 2 * Math.sin(px * 0.53 - py * 0.41);
  const plain = ch => '.rTHo'.includes(ch);
  for (const ch of ['m', 'i']) {
    const mine = tiles.filter(t => t.ch === ch);
    if (!mine.length) continue;
    const C = ch === 'm' ? P.mud : P.ice;
    // the patch's outline, square by square (they overlap where they meet: filled as one)
    const path = new Path2D(), edges = [];
    for (const t of mine) {
      const x = t.c * PX, y = t.r * PX, edge = (dc, dr) => plain(cell(t.c + dc, t.r + dr));
      const N = edge(0, -1), Sd = edge(0, 1), Wd = edge(-1, 0), E = edge(1, 0), pts = [];
      for (let k = 0; k < 8; k++) { const px = x + (k * PX) / 8; pts.push([px + (Wd && !k ? jag(px, y) : 0), y + (N ? jag(px, y) : 0)]); }
      for (let k = 0; k < 8; k++) { const py = y + (k * PX) / 8; pts.push([x + PX - (E ? jag(x + PX, py) : 0), py + (N && !k ? jag(x + PX, py) : 0)]); }
      for (let k = 0; k < 8; k++) { const px = x + PX - (k * PX) / 8; pts.push([px - (E && !k ? jag(px, y + PX) : 0), y + PX - (Sd ? jag(px, y + PX) : 0)]); }
      for (let k = 0; k < 8; k++) { const py = y + PX - (k * PX) / 8; pts.push([x + (Wd ? jag(x, py) : 0), py - (Sd && !k ? jag(x, py) : 0)]); }
      path.moveTo(...pts[0]);
      for (const p of pts.slice(1)) path.lineTo(...p);
      path.closePath();
      // (the sides that are an edge, to be drawn along)
      if (N) edges.push(pts.slice(0, 9)); if (E) edges.push(pts.slice(8, 17)); if (Sd) edges.push(pts.slice(16, 25)); if (Wd) edges.push([...pts.slice(24), pts[0]]);
    }
    g.save();
    g.clip(path);
    const cs = mine.map(t => t.c), rs = mine.map(t => t.r);
    const X0 = Math.min(...cs) * PX, X1 = (Math.max(...cs) + 1) * PX, Y0 = Math.min(...rs) * PX, Y1 = (Math.max(...rs) + 1) * PX;
    g.fillStyle = C.base;
    g.fillRect(X0, Y0, X1 - X0, Y1 - Y0);
    if (ch === 'm') {
      // blotches of darker and lighter mud
      for (const t of mine) for (let i = 0; i < 7; i++) {
        g.fillStyle = R() < 0.6 ? C.dark : 'rgba(160, 115, 70, 0.5)';
        g.globalAlpha = 0.35 + R() * 0.3;
        g.beginPath(); g.ellipse(t.c * PX + R() * PX, t.r * PX + R() * PX, 5 + R() * 9, 3 + R() * 6, R() * 3, 0, Math.PI * 2); g.fill();
      }
      g.globalAlpha = 1;
      // two ruts down each column, wavering, with a lighter ridge beside each
      for (const c of new Set(cs)) for (const f of [0.3, 0.7]) {
        const col = mine.filter(t => t.c === c).map(t => t.r), y0 = Math.min(...col) * PX, y1 = (Math.max(...col) + 1) * PX;
        const xAt = py => c * PX + PX * f + Math.sin(py * 0.045 + c * 1.7 + f * 5) * 3;
        for (const [dx, col2, w] of [[2.5, 'rgba(170, 125, 80, 0.45)', 2], [0, C.rut, 5]]) {
          g.strokeStyle = col2; g.lineWidth = w; g.beginPath();
          for (let py = y0; py <= y1; py += 4) g[py === y0 ? 'moveTo' : 'lineTo'](xAt(py) + dx, py);
          g.stroke();
        }
      }
      // pebbles, and here and there a puddle with the sky in it
      for (const t of mine) {
        for (let i = 0; i < 6; i++) { g.fillStyle = R() < 0.5 ? 'rgba(210, 180, 140, 0.8)' : 'rgba(45, 28, 14, 0.6)'; g.beginPath(); g.arc(t.c * PX + R() * PX, t.r * PX + R() * PX, 1 + R() * 1.6, 0, Math.PI * 2); g.fill(); }
        if (R() < 0.45) {
          const px = t.c * PX + 14 + R() * (PX - 28), py = t.r * PX + 12 + R() * (PX - 24), rx = 9 + R() * 8, ry = 5 + R() * 4;
          g.fillStyle = C.sheen; g.beginPath(); g.ellipse(px, py, rx, ry, 0, 0, Math.PI * 2); g.fill();
          g.strokeStyle = 'rgba(255, 255, 255, 0.7)'; g.lineWidth = 1.5; g.beginPath(); g.ellipse(px - 1, py - 1, rx * 0.6, ry * 0.45, 0, Math.PI * 1.1, Math.PI * 1.7); g.stroke();
        }
      }
    } else {
      // a sheen across the whole patch in broad diagonal bands, then scratches from skates and sleds
      g.strokeStyle = C.sheen;
      for (let k = X0 - (Y1 - Y0); k < X1 + 40; k += 46) {
        g.globalAlpha = 0.25 + 0.2 * Math.sin(k * 0.13);
        g.lineWidth = 10 + 8 * Math.sin(k * 0.07) ** 2;
        g.beginPath(); g.moveTo(k, Y1); g.lineTo(k + (Y1 - Y0), Y0); g.stroke();
      }
      g.globalAlpha = 1;
      g.strokeStyle = C.scratch;
      for (const t of mine) for (let i = 0; i < 3; i++) {
        const px = t.c * PX + R() * PX, py = t.r * PX + R() * PX, a = R() * Math.PI, l = 12 + R() * 22;
        g.lineWidth = 0.8 + R() * 0.8;
        g.beginPath(); g.moveTo(px, py); g.quadraticCurveTo(px + Math.cos(a) * l * 0.5 + 4, py + Math.sin(a) * l * 0.5 - 4, px + Math.cos(a) * l, py + Math.sin(a) * l); g.stroke();
      }
    }
    g.restore();
    // the edge: wet and dark round the mud, with grass leaning over it; a rim of snow round the ice
    g.lineJoin = g.lineCap = 'round';
    for (const e of edges) {
      g.strokeStyle = ch === 'm' ? 'rgba(45, 28, 12, 0.5)' : C.rim;
      g.lineWidth = ch === 'm' ? 3 : 4;
      g.beginPath(); g.moveTo(...e[0]); for (const p of e.slice(1)) g.lineTo(...p); g.stroke();
      if (ch !== 'm') continue;
      g.strokeStyle = P.green[1]; g.lineWidth = 1.6;
      for (let i = 0; i < e.length - 1; i++) for (let j = 0; j < 2; j++) {
        const [ax, ay] = e[i], [bx, by] = e[i + 1], u = R(), px = ax + (bx - ax) * u, py = ay + (by - ay) * u;
        g.beginPath(); g.moveTo(px, py); g.lineTo(px + (R() - 0.5) * 6, py + (R() - 0.5) * 6); g.stroke();
      }
    }
  }
}

/** hole number `num` (as shown on its flag) of a yard that looks like `look` (a look's name: looks/) */
export function buildCourse(hole, index, { scene, model, num = index + 1, look = 'pond', aniso = 4, warm = false }) {
  const map = hole.map, H = map.length, W = Math.max(...map.map(r => r.length));
  const at = (c, r) => ({ x: c - (W - 1) / 2, z: r - (H - 1) / 2 });
  const cell = (c, r) => (r >= 0 && r < H && c >= 0 && c < W ? map[r][c] || ' ' : ' ');
  const green = ch => '.rTHomi'.includes(ch);
  const group = new THREE.Group();
  scene.add(group);
  const course = { W, H, at, group, cols: [], winds: [], candies: [], tee: null, cup: null, tiles: [], deco: [], movers: [], tags: [], rails: [], posts: [], surfAt: null };
  // (warm: built out of sight only to have its shaders compiled, see warmLook: its green unpainted and the
  // yard round it made by course.yard(), a moment later; its turf and flag twins of the shared materials,
  // which show the hole on screen)
  const L = lookOf(look), R = rng(index + 7), M0 = mats(L), twin = m => Object.assign(m.clone(), { onBeforeCompile: m.onBeforeCompile, customProgramCacheKey: m.customProgramCacheKey });
  const M = warm ? { ...M0, turf: twin(M0.turf), flag: twin(M0.flag) } : M0;
  // how high the green stands at (x, z): ramps and mounds, or flat. What is drawn stands LOOK_H times
  // as high as the ball feels it (course.ground: physics.js, the bots and the aiming guide's path all go
  // by that, unchanged): a 0.3 m mound seen from above hardly shows, at half as high again it does.
  // Everything drawn on the green goes by course.Y and course.slope (the ball, the cup, the rails, what
  // stands on it), so it all sits on the ground as drawn
  // (a hole that goes down, into a bowl or down a slope, more than DEEP deep as drawn, is drawn raised
  // by as much as it would go deeper than that: its low end no lower than it is to the ball, nearer the
  // water than DEEP never)
  const gr = ground(hole.ground, at);
  let deep = 0;
  if (gr) for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) {
    if (!green(cell(c, r))) continue;
    const p = at(c, r);
    for (let j = 0; j <= 4; j++) for (let i = 0; i <= 4; i++) deep = Math.min(deep, gr.h(p.x - 0.5 + i / 4, p.z - 0.5 + j / 4));
  }
  const up = Math.max(0, -LOOK_H * deep - Math.max(-deep, DEEP)), lift = gr && ((x, z) => LOOK_H * gr.h(x, z) + up);
  const Y = lift ? (x, z) => lift(x, z) : () => 0;
  const G2 = [0, 0];
  course.ground = gr;
  course.Y = Y;
  course.slope = gr ? (x, z) => { const g = gr.grad(x, z); G2[0] = LOOK_H * g[0]; G2[1] = LOOK_H * g[1]; return G2; } : null;

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
  course.onGreen = (x, z) => green(cell(Math.round(x + (W - 1) / 2), Math.round(z + (H - 1) / 2)));
  // (coins can also be put anywhere, such as on a mound's top: coins, a list of [c, r], or 'tops')
  const extra = hole.coins === 'tops' ? hole.ground.filter(g => g.t === 'hill' && g.h > 0).map(g => g.at) : hole.coins || [];
  for (const c of extra) course.candies.push(at(...c));
  // (mud and ice: what the ball rolls on at (x, z), for physics.js, and a tag over each kind's middle)
  const surf = tiles.filter(t => isSurf(t.ch));
  if (surf.length) {
    const kind = new Array(W * H).fill(null);
    for (const t of surf) kind[t.r * W + t.c] = t.ch;
    course.surfAt = (x, z) => {
      const c = Math.round(x + (W - 1) / 2), r = Math.round(z + (H - 1) / 2);
      return c >= 0 && c < W && r >= 0 && r < H ? kind[r * W + c] : null;
    };
    for (const ch of hole.surfTags === false ? [] : Object.keys(SURF)) { // (surfTags: false, on a hole after the one that shows it)
      const mine = surf.filter(t => t.ch === ch);
      if (!mine.length) continue;
      const mc = mine.reduce((a, t) => a + t.c, 0) / mine.length, mr = mine.reduce((a, t) => a + t.r, 0) / mine.length;
      const t = (hole.surfTagAt && mine.find(m => m.c === hole.surfTagAt[0] && m.r === hole.surfTagAt[1])) || // (surfTagAt: [c, r], when the middle is where the ball is aimed)
        mine.reduce((a, b) => (Math.hypot(b.c - mc, b.r - mr) < Math.hypot(a.c - mc, a.r - mr) ? b : a)), p = at(t.c, t.r);
      course.tags.push({ text: SURF[ch], at: () => [p.x, Y(p.x, p.z) + 0.3, p.z] });
    }
  }
  // (a square each, or where the ground isn't flat cut finer to follow it, lit by its slope)
  // (and shaded: a slope facing the player lighter, one facing away darker, the high ground a little
  // lighter than the low, so the shape reads from where the hole is watched)
  // (and where the ground bends: darker in the hollow at the foot of a rise and down in a bowl, as
  // grass in a fold is, lighter along the brow of a step and over a mound's top, where it catches the
  // light: from how far the ground round a point, RING metres off, sits above or below it on average.
  // These are what make a slope read as one from above, where its tilt alone hardly shows)
  const pos = [], uv = [], nor = [], col = [], idx = [], S = lift ? SUB : 1;
  const nv = new THREE.Vector3(), LX = -0.37, LZ = 0.93, RING = 0.42, DIRS = 10;
  const fold = (x, z, y) => {
    let s = 0;
    for (let a = 0; a < DIRS; a++) { const t = (a / DIRS) * Math.PI * 2; s += lift(x + Math.cos(t) * RING, z + Math.sin(t) * RING); }
    return (s / DIRS - y) / RING; // (> 0 in a hollow, < 0 on a brow)
  };
  for (const t of tiles) {
    const p = at(t.c, t.r), n = pos.length / 3;
    for (let j = 0; j <= S; j++) for (let i = 0; i <= S; i++) {
      const x = p.x - 0.5 + i / S, z = p.z - 0.5 + j / S, y = Y(x, z);
      pos.push(x, y, z);
      if (lift) {
        const g = course.slope(x, z);
        nv.set(-g[0], 1, -g[1]).normalize();
        nor.push(nv.x, nv.y, nv.z);
        const f = fold(x, z, y), bend = f > 0 ? Math.max(0.66, 1 - 3.2 * f) : Math.min(1.22, 1 - 2.2 * f);
        const k = Math.max(0.55, Math.min(1.45, (1 + 2.1 * (nv.x * LX + nv.z * LZ)) * (1 + 0.42 * (y - up)) * bend));
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
  const turfTex = warm ? texture(canvas(1, 1)) : turf(W, H, tiles, cell, green, R, gr, at, L.turf, index + 101, hole.ground);
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
        const x = x0 + (k.w * i) / nu, z = z0 + (k.d * j) / nw, g = course.slope(cx(x), cz(z));
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
    course.posts.push([x, y, z]); // (for a look's dressing: snow on the posts)
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
      // (for a look's dressing: its middle, length, foot (y at the lowest, yAt along a slope) and how far up its top is)
      course.rails.push({ kind, x: mx, z: mz, len, y: ylo, sloped: yhi - ylo > 1e-3, yAt, out: o, top: RAIL_H - 0.06, w: WALL_T });
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

  // ---- the pond round the block, and the yard round the pond (the look's) ----
  const X0 = -W / 2, X1 = W / 2, Z0 = -H / 2, Z1 = H / 2;
  const pond = { x0: X0 - O - MOAT, x1: X1 + O + MOAT, z0: Z0 - O - MOAT, z1: Z1 + O + MOAT };
  const inPond = (x, z, m = 0) => x > pond.x0 - m && x < pond.x1 + m && z > pond.z0 - m && z < pond.z1 + m;
  const water = new THREE.Mesh(new THREE.PlaneGeometry(200, 200).rotateX(-Math.PI / 2), waterMaterial(L));
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
  // (a band round the pond, `out` metres out past its edge to `inset` in from it, its corners rounded: the
  // foam along a bank, a pool's coping and deck)
  const ring = (out, r0, inset, r1) => {
    const sh = roundRect(new THREE.Shape(), pond.x0 - out, pond.z0 - out, pond.x1 + out, pond.z1 + out, r0);
    sh.holes.push(roundRect(new THREE.Path(), pond.x0 + inset, pond.z0 + inset, pond.x1 - inset, pond.z1 - inset, r1));
    return sh;
  };
  // placing things round the pond clear of the block and of each other, each turned at random
  const onBlock = (x, z, m) => tiles.some(t => { const p = at(t.c, t.r); return Math.abs(p.x - x) < 0.5 + O + m && Math.abs(p.z - z) < 0.5 + O + m; });
  const placed = [];
  const free = (x, z, d) => !placed.some(p => Math.hypot(p[0] - x, p[1] - z) < d + (p[2] || 0)); // (p[2]: a wide thing's own radius)
  const put = (id, x, z, y, size, low = false, tint) => {
    let g;
    try { g = model(id, null, size, tint); } catch { return null; }
    g.position.set(x, y, z);
    g.rotation.y = R() * Math.PI * 2;
    group.add(g);
    placed.push([x, z]);
    // (low things are left in sight wherever they are: see aim() in main.js)
    if (!low) course.deco.push({ g, box: new THREE.Box3().setFromObject(g) });
    return g;
  };
  // the way round the block in the middle of the pond, that ducks and floats go along
  const lane = roundRect(new THREE.Path(), pond.x0 + MOAT * 0.45, pond.z0 + MOAT * 0.45, pond.x1 - MOAT * 0.45, pond.z1 - MOAT * 0.45, 1.2);
  const loop = lane.getSpacedPoints(240).map(p => new THREE.Vector2(p.x, -p.y));
  const offLane = (x, z, d) => loop.every(p => Math.hypot(p.x - x, p.y - z) > d);
  // what a look's surroundings, floaters and dressing are given (see looks/index.js)
  const ctx = {
    course, group, model, R, M, look: L, hole, index, W, H, at, cell, tiles, Y, ground: gr,
    pond, inPond, ring, onBlock, placed, free, put, wet, loop, offLane, rails: course.rails, posts: course.posts,
  };
  const yard = () => {
    if (L.surroundings) L.surroundings(ctx);
    if (L.floaters) L.floaters(ctx);
    if (L.dress) L.dress(ctx);
    if (L.particles) particles(ctx, L.particles, L.name);
  };
  if (warm) course.yard = yard;
  else yard();

  course.update = t => { for (const m of course.movers) m(t); };
  // the shapes and pictures made for this hole alone go with it; what is kept (userData.keep: the
  // catalog's models and the coins) and the materials are shared with the next (materials are left
  // to be collected, not disposed: disposing frees their shaders, to be compiled again next hole)
  course.dispose = () => {
    group.removeFromParent();
    group.traverse(o => {
      if (!o.isMesh && !o.isPoints) return;
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
