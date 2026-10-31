// A hole's course, built from its character map, as a block of turf standing in a pond: the green
// on top (checkered like a mown lawn, painted onto one canvas with blades of grass and a shade along
// the rails), the road stretches, a chunky wooden rail along every edge of it (their inner faces
// the colliders), the block's sides of earth going down into the water, the tee mat, the hole — a
// cup with a glowing rim and a flag with the hole's number — and round the pond a park: reeds, lotus
// leaves, ducks paddling round, trees, benches, a few buildings far off. Everything in world metres,
// the map centred on the origin, the green's top at y = 0.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { CUP_R } from './physics.js';
import { U } from '../core/materials.js';

const WALL_T = 0.22, WALL_TOP = 0.2, LEDGE = 0.16; // the rail; the strip of grass outside it
const WATER = -0.72, LAWN = -0.24, MOAT = 2.6; // the pond's level, the park's, the pond's width
const PX = 64; // the green's texels per metre
const BLOCK_TOP = -0.03, BLOCK_BOT = WATER - 0.3;
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

/** the earth, its texture laid on in world metres (one copy a metre round the sides, so blocks side
 *  by side carry it on without a seam), the grass lip at `top` and the texture's foot at `bottom` */
function soilMaterial(bottom, top) {
  const m = new THREE.MeshLambertMaterial({ map: soil() });
  const range = { value: new THREE.Vector2(bottom, top) };
  m.onBeforeCompile = sh => {
    sh.uniforms.uSoil = range;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vSoil;\nuniform vec2 uSoil;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
      {
        vec4 wp = vec4(position, 1.0);
        #ifdef USE_INSTANCING
          wp = instanceMatrix * wp;
        #endif
        wp = modelMatrix * wp;
        vSoil = vec2(abs(normal.x) > abs(normal.z) ? wp.z : wp.x, (wp.y - uSoil.x) / (uSoil.y - uSoil.x));
      }`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vSoil;')
      .replace('#include <map_fragment>', 'diffuseColor *= texture2D(map, vSoil);');
  };
  m.customProgramCacheKey = () => 'golf-soil';
  return m;
}

// the materials, made once and shared by every hole (a hole made new ones, and freed them when it
// went, would have their shaders compiled again each time: a hitch at every new hole on a phone)
let MAT;
function mats() {
  if (MAT) return MAT;
  MAT = {
    turf: new THREE.MeshLambertMaterial(), // (its map is the hole's own canvas)
    side: soilMaterial(BLOCK_BOT, BLOCK_TOP), bank: soilMaterial(WATER - 0.3, LAWN),
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
function turf(W, H, tiles, cell, green, R) {
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

export function buildCourse(hole, index, { scene, model, aniso = 4 }) {
  const map = hole.map, H = map.length, W = Math.max(...map.map(r => r.length));
  const at = (c, r) => ({ x: c - (W - 1) / 2, z: r - (H - 1) / 2 });
  const cell = (c, r) => (r >= 0 && r < H && c >= 0 && c < W ? map[r][c] || ' ' : ' ');
  const green = ch => '.rTHo'.includes(ch);
  const group = new THREE.Group();
  scene.add(group);
  const course = { W, H, at, group, cols: [], winds: [], candies: [], tee: null, cup: null, tiles: [], deco: [], movers: [] };
  const R = rng(index + 7), M = mats();

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
  const pos = [], uv = [], nor = [], idx = [];
  for (const t of tiles) {
    const p = at(t.c, t.r), n = pos.length / 3;
    for (const [dx, dz] of [[-0.5, -0.5], [-0.5, 0.5], [0.5, 0.5], [0.5, -0.5]]) {
      const x = p.x + dx, z = p.z + dz;
      pos.push(x, 0, z);
      nor.push(0, 1, 0);
      uv.push((x + W / 2) / W, 1 - (z + H / 2) / H);
    }
    idx.push(n, n + 1, n + 2, n, n + 2, n + 3);
  }
  const topGeo = new THREE.BufferGeometry();
  topGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  topGeo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  topGeo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  topGeo.setIndex(idx);
  const turfTex = turf(W, H, tiles, cell, green, R);
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
    blocks.push({ x: p.x + (rr - l) / 2, z: p.z + (b - f) / 2, w: 1 + l + rr, d: 1 + f + b, sides: [L, Rt, F, B] });
  }
  // (a pad of the same for something standing beside the green, such as a fan: see props.js; the
  // pond's leaves and reeds where it stands are taken away)
  const wet = [];
  course.pad = (x, z, w, d) => {
    addBlocks([{ x, z, w, d }]);
    for (const k of wet) if (Math.abs(k.x - x) < w / 2 + k.r && Math.abs(k.z - z) < d / 2 + k.r) k.g.visible = false;
  };
  function addBlocks(list) {
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
    const block = new THREE.Mesh(geo, [M.ledge, M.side]);
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
  const post = (x, z) => {
    const key = `${x.toFixed(2)},${z.toFixed(2)}`;
    if (posts.has(key)) return;
    posts.add(key);
    postGeos.push(postGeo.clone().translate(x, RAIL_H / 2 - 0.02, z)); // (from the rail's foot to a little above its top)
    capGeos.push(capGeo.clone().translate(x, RAIL_H + 0.04, z));
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
      const geo = kind === 'h' ? new RoundedBoxGeometry(len, RAIL_H, WALL_T, 2, 0.05) : new RoundedBoxGeometry(WALL_T, RAIL_H, len, 2, 0.05);
      railGeos.push(geo.translate(mx, RAIL_H / 2 - 0.06, mz));
      // a post at each outer corner, and along a long run every few metres
      const along = (u, perp) => (kind === 'h' ? [u, mz + perp] : [mx + perp, u]);
      const u0 = (kind === 'h' ? mx : mz) - len / 2 + WALL_T / 2, u1 = u0 + len - WALL_T;
      if (e0) post(...along(u0, 0));
      if (e1) post(...along(u1, 0));
      const n = Math.floor((u1 - u0) / 3.2);
      for (let i = 1; i <= n; i++) post(...along(u0 + ((u1 - u0) * i) / (n + 1), 0));
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
  mat.position.set(course.tee.x, 0.012, course.tee.z);
  mat.receiveShadow = true;
  group.add(mat);
  const teeLine = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.05).rotateX(-Math.PI / 2), M.teeLine);
  teeLine.position.set(course.tee.x, 0.034, course.tee.z + 0.3);
  group.add(teeLine);

  // ---- the hole: a dark hollow in a white liner, a glowing rim and a flag with its number ----
  const cup = new THREE.Group();
  cup.position.set(course.cup.x, 0, course.cup.z);
  const hollow = new THREE.Mesh(new THREE.CircleGeometry(CUP_R, 28), M.hollow);
  hollow.rotation.x = -Math.PI / 2;
  hollow.position.y = 0.004;
  cup.add(hollow);
  const liner = new THREE.Mesh(new THREE.RingGeometry(CUP_R - 0.06, CUP_R - 0.02, 32), M.liner);
  liner.rotation.x = -Math.PI / 2;
  liner.position.y = 0.005;
  cup.add(liner);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(CUP_R, 0.026, 6, 32), M.rim);
  rim.rotation.x = Math.PI / 2;
  rim.position.y = 0.01;
  cup.add(rim);
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
  fg.fillText(String(index + 1), 58, 40);
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
  const water = new THREE.Mesh(new THREE.PlaneGeometry(200, 200).rotateX(-Math.PI / 2), waterMaterial());
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
  // foam along the bank
  const bankFoam = roundRect(new THREE.Shape(), pond.x0 - 0.1, pond.z0 - 0.1, pond.x1 + 0.1, pond.z1 + 0.1, 1.6);
  bankFoam.holes.push(roundRect(new THREE.Path(), pond.x0 + 0.1, pond.z0 + 0.1, pond.x1 - 0.1, pond.z1 - 0.1, 1.5));
  const bf = new THREE.Mesh(new THREE.ShapeGeometry(bankFoam, 8).rotateX(-Math.PI / 2), M.foam);
  bf.position.y = WATER + 0.006;
  group.add(bf);

  const onBlock = (x, z, m) => tiles.some(t => { const p = at(t.c, t.r); return Math.abs(p.x - x) < 0.5 + O + m && Math.abs(p.z - z) < 0.5 + O + m; });
  const placed = [];
  const free = (x, z, d) => !placed.some(p => Math.hypot(p[0] - x, p[1] - z) < d);
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

  // ---- ducks: a mother and her ducklings paddling round the block, along the lane ----
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

  course.update = t => { for (const m of course.movers) m(t); };
  // the shapes and pictures made for this hole alone go with it; what is kept (userData.keep: the
  // catalog's models and the coins) and the materials are shared with the next (materials are left
  // to be collected, not disposed: disposing frees their shaders, to be compiled again next hole)
  course.dispose = () => {
    group.removeFromParent();
    group.traverse(o => {
      if (!o.isMesh || o.userData.keep) return;
      o.geometry.dispose();
      if (o.isInstancedMesh) o.dispose();
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

// ---- the water: blue, with soft bright ripples drifting over it ----
let waterMat;
function waterMaterial() {
  if (waterMat) return waterMat;
  waterMat = new THREE.MeshLambertMaterial({ color: 0x3aa6e2 });
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
  return waterMat;
}
