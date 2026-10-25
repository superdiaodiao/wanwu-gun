// 万物合成大作战 (working title) — merge defense built from 万物皆可滚's models. A board of twelve
// places on the left; buy a slipper with coins, drag two alike together and they become the next
// thing up (slipper → kettle → fan → rice cooker → … → fire truck). Everything on the board throws
// little copies of itself at the trash monsters walking in from the right; one that reaches the
// fence costs a heart. Survive five waves (a big boss at the end of the last).
import * as THREE from 'three';
import '../catalog/index.js';
import { CATALOG } from '../catalog/registry.js';
import { buildAtlas, loadFonts, atlasTexture } from '../core/atlas.js';
import { objectMaterial, U as MU } from '../core/materials.js';
import { buildSpec } from '../core/assets.js';
import { Engine } from '../game/engine.js';
import { FX } from '../game/fx.js';
import { audio } from '../audio/audio.js';
import { t, translateDom, EN } from '../i18n/index.js';
import { applyContent } from '../i18n/apply.js';
import { TIERS, MONSTERS, WAVES, HEARTS, START_COINS, cost } from './rules.js';

applyContent();

const $ = id => document.getElementById(id);
const nextFrame = () => new Promise(r => requestAnimationFrame(() => r()));
const COLS = 3, ROWS = 4, CELL = 1.5;
const cellPos = (c, r) => new THREE.Vector3(-8 + c * CELL, 0, (r - (ROWS - 1) / 2) * CELL);
const FENCE = -3.7, SPAWN = 7.8, LANE = 2.6;
const store = {
  get(k, d) { try { const v = localStorage.getItem('merge.' + k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('merge.' + k, JSON.stringify(v)); } catch {} },
};

let engine, material, fx;
const specs = new Map();
const spec = id => { if (!specs.has(id)) specs.set(id, buildSpec(CATALOG.get(id))); return specs.get(id); };
const G = {
  t: 0, state: 'idle', wave: 0, hearts: HEARTS, coins: START_COINS, bought: 0, best: 0,
  cells: [], monsters: [], shots: [], pops: [], queue: [], spawnT: 0, breakT: 0, drag: null, shake: 0, merges: 0, hitSfxT: 0,
};

async function boot() {
  translateDom();
  if (EN) document.title = t('万物合成大作战');
  const fontsDone = loadFonts(12000);
  await Promise.race([fontsDone, new Promise(r => setTimeout(r, 600))]);
  await nextFrame();
  buildAtlas();
  material = objectMaterial(atlasTexture());
  engine = new Engine($('game'), matchMedia('(pointer: coarse)').matches ? 'medium' : 'high');
  const sc = engine.scene;
  sc.background = new THREE.Color(0xcfe9d8);
  engine.hemi.color.set(0xf4fbff);
  engine.hemi.groundColor.set(0xb9d6a8);
  engine.hemi.intensity = 1.7;
  engine.sun.intensity = 2.4;
  engine.sunDir.set(-0.3, 1, 0.55).normalize();
  makeYard(sc);
  fx = new FX(sc);
  engine.camera.fov = 40;
  aim();
  addEventListener('resize', aim);
  const cv = $('game');
  cv.addEventListener('pointerdown', onDown);
  addEventListener('pointermove', onMove);
  addEventListener('pointerup', onUp);
  addEventListener('pointercancel', onUp);
  $('buy').addEventListener('pointerdown', e => { e.stopPropagation(); wake(); buy(); });
  $('card-btn').addEventListener('click', () => { audio.ui('click'); start(); });
  G.best = store.get('best', 0);
  start();
  requestAnimationFrame(loop);
  await nextFrame();
  $('loading').classList.add('done');
  window.__ready = true;
}

/** sound and music wait for the first touch */
async function wake() {
  try { await audio.init(); if (!G.music) { G.music = true; audio.music('game', { fade: 2 }); } } catch {}
}

/** landscape: from the front, the board on the left and the monsters coming from the right;
 *  portrait (phones): from behind the board, the monsters coming down from the top */
function aim() {
  const c = engine.camera;
  if (c.aspect >= 1) {
    const k = Math.max(1, 1.6 / c.aspect);
    c.up.set(0, 1, 0);
    c.position.set(-1.8, 8.6 * k, 12.2 * k);
    c.lookAt(-1.8, 0, 0.4);
  } else {
    const k = Math.max(1, 0.56 / c.aspect);
    c.up.set(1, 0, 0);
    c.position.set(-2.4 - 13.5 * k, 19 * k, 0);
    c.lookAt(-1.2, 0, 0);
  }
  c.updateProjectionMatrix();
}

function makeYard(sc) {
  const lam = color => new THREE.MeshLambertMaterial({ color });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), lam(0xbfe3a6));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  sc.add(ground);
  // the road the monsters come down, a pale path
  const road = new THREE.Mesh(new THREE.PlaneGeometry(SPAWN - FENCE + 6, LANE * 2 + 1), lam(0xf3e2c4));
  road.rotation.x = -Math.PI / 2;
  road.position.set((SPAWN + FENCE) / 2 + 3, 0.01, 0);
  road.receiveShadow = true;
  sc.add(road);
  // the board: a mat with twelve places
  const mat = new THREE.Mesh(new THREE.BoxGeometry(COLS * CELL + 0.4, 0.16, ROWS * CELL + 0.4), lam(0x8ccf9e));
  mat.position.set(-8 + CELL, 0.08, 0);
  mat.receiveShadow = true;
  sc.add(mat);
  G.tiles = [];
  for (let c = 0; c < COLS; c++) for (let r = 0; r < ROWS; r++) {
    const tile = new THREE.Mesh(new THREE.BoxGeometry(CELL - 0.16, 0.06, CELL - 0.16), lam(0xd9f2df));
    tile.position.copy(cellPos(c, r)).setY(0.19);
    tile.receiveShadow = true;
    sc.add(tile);
    G.tiles.push(tile);
  }
  // the fence the monsters must not get past: posts and a rail
  const fence = new THREE.Group();
  for (let z = -LANE - 0.3; z <= LANE + 0.31; z += 0.6) {
    const p = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.8, 0.16), lam(0xfff6e8));
    p.position.set(FENCE - 0.3, 0.4, z);
    p.castShadow = true;
    fence.add(p);
  }
  const rail = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, LANE * 2 + 0.8), lam(0xff8a7a));
  rail.position.set(FENCE - 0.3, 0.62, 0);
  fence.add(rail);
  sc.add(fence);
  G.fence = fence;
  // a yard around it: hedges and flowers along the road, trees behind
  const deco = (id, size, x, z, ry = Math.random() * 6) => { const g = model(id, size); g.position.set(x, 0, z); g.rotation.y = ry; sc.add(g); };
  for (let x = FENCE + 0.6; x < SPAWN + 4; x += 1.4 + Math.random()) {
    deco(Math.random() < 0.6 ? 'bush' : 'flower_patch', 0.9 + Math.random() * 0.4, x, -LANE - 1.1 - Math.random() * 0.3);
    deco(Math.random() < 0.5 ? 'flower_patch' : 'grass_tuft', 0.7 + Math.random() * 0.3, x + 0.6, LANE + 1.2 + Math.random() * 0.4);
  }
  for (let x = -12; x < SPAWN + 6; x += 2.6 + Math.random() * 1.5) deco(['tree_plane', 'tree_camphor', 'tree_peach'][(Math.random() * 3) | 0], 3.5 + Math.random() * 1.5, x, -8 - Math.random() * 2.5);
  deco('sunflower', 1.4, -10.4, 2.6, 0); deco('potted_plant', 1, -10.3, -2.2, 0);
}

// ---- models -------------------------------------------------------------------------------------------
/** a catalog thing shown about `size` big, standing on y = 0 of its group */
function model(id, size) {
  const s = spec(id), k = size / s.maxDim;
  const mesh = new THREE.Mesh(s.geometry, material);
  mesh.scale.setScalar(k);
  mesh.position.set(-s.center.x * k, -s.bbox.min.y * k, -s.center.z * k);
  mesh.castShadow = true;
  const g = new THREE.Group();
  g.add(mesh);
  return g;
}

const tierSize = t => 1.05 + t * 0.08;
function makeUnit(tier, c, r) {
  const g = model(TIERS[tier].id, tierSize(tier));
  g.position.copy(cellPos(c, r)).setY(0.22);
  g.rotation.y = TIERS[tier].face || 0;
  engine.scene.add(g);
  const u = { tier, c, r, g, cd: 0.3 + Math.random() * 0.5, squash: 0 };
  g.userData.unit = u;
  return u;
}

const eyeWhite = new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0x444444 });
const eyeBlack = new THREE.MeshBasicMaterial({ color: 0x1b1714 });
const eyeGeo = new THREE.SphereGeometry(1, 12, 8);
/** a trash monster: the model with a pair of googly eyes looking down the road */
function makeMonster(type, hpK) {
  const M = MONSTERS[type];
  const g = model(M.id, M.size);
  const s = spec(M.id), k = M.size / s.maxDim, h = s.dims.h * k, w = s.dims.w * k, d = s.dims.d * k;
  const er = M.size * 0.11;
  for (const side of [-1, 1]) {
    const e = new THREE.Mesh(eyeGeo, eyeWhite);
    e.scale.setScalar(er);
    e.position.set(-w * 0.42, h * 0.72, side * Math.min(d * 0.22, er * 1.4));
    const p = new THREE.Mesh(eyeGeo, eyeBlack);
    p.scale.setScalar(0.55);
    p.position.set(-0.6, 0.05, 0);
    e.add(p);
    g.add(e);
  }
  // a health bar over its head, turned to the camera every frame
  const bar = new THREE.Group();
  const bg = new THREE.Mesh(new THREE.PlaneGeometry(1, 0.13), new THREE.MeshBasicMaterial({ color: 0x33302c, transparent: true, opacity: 0.55, depthWrite: false }));
  const fill = new THREE.Mesh(new THREE.PlaneGeometry(1, 0.13), new THREE.MeshBasicMaterial({ color: 0xff5d5d, depthWrite: false }));
  fill.position.z = 0.001;
  bar.add(bg, fill);
  bar.scale.x = Math.max(0.7, M.size * 0.6);
  bar.position.y = h + 0.35;
  bar.visible = false;
  g.add(bar);
  const z = (Math.random() * 2 - 1) * (LANE - M.size * 0.3);
  g.position.set(SPAWN, 0, z);
  engine.scene.add(g);
  const hp = Math.round(M.hp * hpK);
  return { type, M, g, hp, max: hp, x: SPAWN, z, h, bar, fill, walk: Math.random() * 6, flash: 0, r: Math.max(w, d) * 0.5 + 0.2 };
}

// ---- a round ----------------------------------------------------------------------------------------
function start() {
  for (const c of [...engine.scene.children]) if (c.userData.unit || c.userData.temp) engine.scene.remove(c);
  for (const m of G.monsters) engine.scene.remove(m.g);
  for (const s of G.shots) engine.scene.remove(s.g);
  Object.assign(G, { state: 'break', wave: 0, hearts: HEARTS, coins: START_COINS, bought: 0, monsters: [], shots: [], pops: [], queue: [], drag: null, breakT: 1.2, merges: 0 });
  G.cells = Array.from({ length: COLS }, () => Array(ROWS).fill(null));
  // two slippers to start with, side by side: the first merge is right there
  G.cells[1][1] = makeUnit(0, 1, 1);
  G.cells[1][2] = makeUnit(0, 1, 2);
  $('card').hidden = true;
  $('hint').classList.remove('gone');
  hud();
}

function nextWave() {
  G.wave++;
  const W = WAVES[G.wave - 1];
  G.queue = [];
  for (const [type, n] of W.mix) for (let i = 0; i < n; i++) G.queue.push(type);
  G.queue.sort(() => Math.random() - 0.5);
  if (W.boss) G.queue.push(W.boss);
  G.spawnT = 0.6;
  G.state = 'wave';
  banner(G.wave === WAVES.length ? t('最后一波！') : t('第 {n} 波', { n: G.wave }));
  audio.milestone(Math.min(6, G.wave));
  hud();
}

function banner(text) {
  const b = $('banner');
  b.hidden = true;
  b.textContent = text;
  void b.offsetWidth;
  b.hidden = false;
}

function buy() {
  if (G.state === 'won' || G.state === 'lost') return;
  const c = cost(G.bought);
  const free = [];
  for (let x = 0; x < COLS; x++) for (let y = 0; y < ROWS; y++) if (!G.cells[x][y]) free.push([x, y]);
  if (G.coins < c || !free.length) { audio.ui('back'); return; }
  G.coins -= c;
  G.bought++;
  // into the free place nearest the fence, front of the board first
  free.sort((a, b) => b[0] - a[0] || Math.abs(a[1] - 1.5) - Math.abs(b[1] - 1.5));
  const [x, y] = free[0];
  const u = makeUnit(0, x, y);
  G.cells[x][y] = u;
  u.g.position.y = 2.2;
  u.drop = 0;
  audio.ui('click');
  hud();
}

function merge(a, b) {
  // a was dropped on b: b goes up a tier, a is gone
  engine.scene.remove(a.g);
  G.cells[a.c][a.r] = null;
  engine.scene.remove(b.g);
  const u = makeUnit(b.tier + 1, b.c, b.r);
  G.cells[b.c][b.r] = u;
  u.squash = 1;
  G.merges++;
  const p = u.g.position;
  fx.firework(p.x, 0.9, p.z, 0.8 + u.tier * 0.12);
  audio.comboChime(Math.min(8, u.tier + 1));
  audio.pickup(spec(TIERS[u.tier].id).sfx, 0.7, 0.4);
  if (u.tier >= 3 && !G.seen?.[u.tier]) { (G.seen ||= {})[u.tier] = 1; banner(t('合成了 {name}！', { name: t(TIERS[u.tier].name) })); }
  $('hint').classList.add('gone');
  hud();
}

function hud() {
  $('wave-label').textContent = t('波次');
  $('wave-num').textContent = `${Math.max(1, G.wave)}/${WAVES.length}`;
  $('hearts-num').textContent = G.hearts;
  $('coins-num').textContent = G.coins;
  $('buy-cost').textContent = cost(G.bought);
  $('buy-name').textContent = t(TIERS[0].name);
  let full = true;
  for (const col of G.cells) for (const u of col) if (!u) full = false;
  $('buy').classList.toggle('off', full || G.coins < cost(G.bought));
}

function end(won) {
  G.state = won ? 'won' : 'lost';
  G.drag = null;
  const top = Math.max(-1, ...G.cells.flat().filter(Boolean).map(u => u.tier));
  if (won) {
    audio.fireworks();
    for (let i = 0; i < 8; i++) setTimeout(() => fx.firework(-2 + Math.random() * 10, 2 + Math.random() * 2, (Math.random() - 0.5) * 5, 2), i * 140);
  } else audio.timeUp();
  G.best = Math.max(G.best, won ? WAVES.length + 1 : G.wave);
  store.set('best', G.best);
  $('card-title').textContent = won ? t('守住了！') : t('垃圾怪冲进来了');
  $('card-sub').textContent = won
    ? t('最厉害的是：{name}', { name: t(TIERS[top].name) })
    : t('撑到了第 {n} 波，多合成几次再来', { n: G.wave });
  $('card-btn').textContent = t('再来一局');
  setTimeout(() => { $('card').hidden = false; }, won ? 900 : 500);
}

// ---- dragging -------------------------------------------------------------------------------------------
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.25), hitP = new THREE.Vector3();
function pointAt(e) {
  const r = engine.renderer.domElement.getBoundingClientRect();
  ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(ndc, engine.camera);
  return ray.ray.intersectPlane(plane, hitP) ? hitP : null;
}
function cellAt(p) {
  if (!p) return null;
  const c = Math.round((p.x + 8) / CELL), r = Math.round(p.z / CELL + (ROWS - 1) / 2);
  return c >= 0 && c < COLS && r >= 0 && r < ROWS ? [c, r] : null;
}
function onDown(e) {
  wake();
  if (G.state === 'won' || G.state === 'lost') return;
  const p = pointAt(e);
  // the thing itself first (a tall one stands over the place behind it), else the place under the finger
  const hits = ray.intersectObjects(G.cells.flat().filter(Boolean).map(u => u.g), true);
  let u = null;
  if (hits.length) { let o = hits[0].object; while (o && !o.userData.unit) o = o.parent; u = o && o.userData.unit; }
  if (!u) { const c = cellAt(p); u = c && G.cells[c[0]][c[1]]; }
  if (!u) return;
  G.drag = { u, id: e.pointerId };
  audio.ui('click');
  onMove(e);
}
function onMove(e) {
  const d = G.drag;
  if (!d || e.pointerId !== d.id) return;
  const p = pointAt(e);
  if (p) d.u.g.position.set(p.x, 0.9, p.z);
  const c = cellAt(p);
  G.tiles.forEach((tile, i) => tile.material.color.setHex(c && i === c[0] * ROWS + c[1] ? 0xfff3b0 : 0xd9f2df));
}
function onUp(e) {
  const d = G.drag;
  if (!d || e.pointerId !== d.id) return;
  G.drag = null;
  G.tiles.forEach(tile => tile.material.color.setHex(0xd9f2df));
  const u = d.u, c = cellAt(pointAt(e));
  const home = () => u.g.position.copy(cellPos(u.c, u.r)).setY(0.22);
  if (!c || (c[0] === u.c && c[1] === u.r)) return home();
  const o = G.cells[c[0]][c[1]];
  if (!o) {
    G.cells[u.c][u.r] = null;
    u.c = c[0]; u.r = c[1];
    G.cells[u.c][u.r] = u;
    home();
  } else if (o.tier === u.tier && u.tier < TIERS.length - 1) {
    merge(u, o);
  } else {
    // swap the two
    G.cells[u.c][u.r] = o; G.cells[o.c][o.r] = u;
    [u.c, o.c] = [o.c, u.c]; [u.r, o.r] = [o.r, u.r];
    home();
    o.g.position.copy(cellPos(o.c, o.r)).setY(0.22);
  }
  audio.ui('click');
}

// ---- fighting ---------------------------------------------------------------------------------------------
function fire(u, dt) {
  u.cd -= dt;
  if (u.cd > 0 || G.drag?.u === u) return;
  // at whatever is closest to the fence
  let target = null;
  for (const m of G.monsters) if (m.hp > 0 && m.x < SPAWN - 0.5 && (!target || m.x < target.x)) target = m;
  if (!target) return;
  const T = TIERS[u.tier];
  u.cd = T.every;
  u.squash = 0.6;
  const g = model(T.id, tierSize(u.tier) * 0.38);
  g.userData.temp = true;
  g.position.copy(u.g.position).setY(0.8 + u.tier * 0.05);
  engine.scene.add(g);
  G.shots.push({ g, target, dmg: T.dmg, v: new THREE.Vector3(), spin: (Math.random() - 0.5) * 20, life: 2.5 });
}

const tmp = new THREE.Vector3();
function shots(dt) {
  for (let i = G.shots.length - 1; i >= 0; i--) {
    const s = G.shots[i], m = s.target;
    s.life -= dt;
    if (m.hp > 0) {
      tmp.set(m.x, m.h * 0.5, m.z).sub(s.g.position);
      const d = tmp.length();
      if (d < m.r) { hit(m, s.dmg, s.g.position); engine.scene.remove(s.g); G.shots.splice(i, 1); continue; }
      s.v.copy(tmp.multiplyScalar(18 / d));
    }
    s.g.position.addScaledVector(s.v, dt);
    s.g.rotation.z += s.spin * dt;
    s.g.rotation.x += s.spin * 0.6 * dt;
    if (s.life <= 0 || (m.hp <= 0 && s.g.position.y < 0)) { engine.scene.remove(s.g); G.shots.splice(i, 1); }
    else if (m.hp <= 0) s.v.y -= 30 * dt;
  }
}

function hit(m, dmg, at) {
  m.hp -= dmg;
  m.flash = 1;
  m.bar.visible = true;
  m.fill.scale.x = Math.max(0, m.hp / m.max);
  m.fill.position.x = -(1 - m.fill.scale.x) / 2;
  fx.pickup(at.x, at.y, at.z, 0.05, 0.22);
  if (G.hitSfxT <= 0) { audio.bump(Math.min(1, 0.25 + dmg / 300)); G.hitSfxT = 0.06; }
  if (m.hp <= 0) {
    G.coins += m.M.coins;
    fx.firework(m.x, m.h * 0.6, m.z, 0.5 + m.M.size * 0.3);
    audio.pickup(spec(m.M.id).sfx, 0.5, m.M.size);
    G.pops.push({ g: m.g, t: 0 });
    G.monsters.splice(G.monsters.indexOf(m), 1);
    hud();
  }
}

function monsters(dt) {
  if (G.state === 'wave' && G.queue.length) {
    G.spawnT -= dt;
    if (G.spawnT <= 0) {
      const W = WAVES[G.wave - 1], type = G.queue.shift();
      G.monsters.push(makeMonster(type, W.hp));
      G.spawnT = type === W.boss ? 0 : W.gap * (0.6 + Math.random() * 0.8);
    }
  }
  const cam = engine.camera;
  for (let i = G.monsters.length - 1; i >= 0; i--) {
    const m = G.monsters[i];
    m.x -= m.M.speed * dt;
    m.walk += dt * (4 + m.M.speed * 3);
    m.g.position.set(m.x, Math.abs(Math.sin(m.walk)) * 0.12 * m.M.size, m.z);
    m.g.rotation.x = Math.sin(m.walk) * 0.08;
    m.flash = Math.max(0, m.flash - dt * 6);
    m.g.scale.setScalar(1 + m.flash * 0.12);
    m.bar.quaternion.copy(m.g.quaternion).invert().multiply(cam.quaternion);
    if (m.x < FENCE + m.r * 0.5) {
      // through the fence: hearts gone, it vanishes in a puff
      G.hearts = Math.max(0, G.hearts - m.M.harm);
      G.shake = 0.35;
      audio.knock(2);
      fx.firework(m.x, 0.6, m.z, 0.7);
      engine.scene.remove(m.g);
      G.monsters.splice(i, 1);
      const h = $('hearts');
      h.classList.remove('hurt'); void h.offsetWidth; h.classList.add('hurt');
      hud();
      if (G.hearts <= 0) end(false);
    }
  }
  if (G.state === 'wave' && !G.queue.length && !G.monsters.length) {
    if (G.wave >= WAVES.length) end(true);
    else { G.state = 'break'; G.breakT = 2.5; }
  }
}

// ---- per frame ----------------------------------------------------------------------------------------------
let last = performance.now();
function loop() {
  requestAnimationFrame(loop);
  const now = performance.now();
  const dt = Math.min(0.033, (now - last) / 1000);
  last = now;
  step(dt);
}

function step(dt, draw = true) {
  G.t += dt;
  G.hitSfxT -= dt;
  if (G.state === 'break') { G.breakT -= dt; if (G.breakT <= 0) nextWave(); }
  const live = G.state === 'wave' || G.state === 'break';
  if (live) monsters(dt);
  for (const col of G.cells) for (const u of col) {
    if (!u) continue;
    if (live) fire(u, dt);
    // drop in from above when bought; a squash when it throws or is made
    if (u.drop !== undefined) {
      u.drop += dt;
      u.g.position.y = Math.max(0.22, 2.2 - u.drop * u.drop * 30);
      if (u.g.position.y <= 0.22) { delete u.drop; u.squash = 1; }
    }
    u.squash = Math.max(0, u.squash - dt * 4);
    const s = Math.sin(u.squash * Math.PI) * 0.18;
    u.g.scale.set(1 + s, 1 - s, 1 + s);
  }
  shots(dt);
  for (let i = G.pops.length - 1; i >= 0; i--) {
    const p = G.pops[i];
    p.t += dt;
    p.g.scale.setScalar(Math.max(0, 1 + p.t * 2 - p.t * p.t * 30));
    if (p.t > 0.3) { engine.scene.remove(p.g); G.pops.splice(i, 1); }
  }
  fx.update(dt);
  if (!draw) return;
  MU.time.value = G.t;
  const cam = engine.camera;
  G.shake = Math.max(0, G.shake - dt);
  const sx = (Math.random() - 0.5) * G.shake * 0.5, sy = (Math.random() - 0.5) * G.shake * 0.5;
  cam.position.x += sx; cam.position.y += sy;
  const r = engine.renderer;
  fx.setViewport(r.domElement.clientHeight, cam.fov);
  engine.updateShadow(new THREE.Vector3(1, 0, 0), 13);
  r.setViewport(0, 0, engine.width, engine.height);
  r.clear();
  r.render(engine.scene, cam);
  cam.position.x -= sx; cam.position.y -= sy;
}

window.__merge = { get G() { return G; }, get engine() { return engine; }, step, buy, merge, start, end };

boot();
