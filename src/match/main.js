// 收集三连 (working title) — a calm 3D match game: a bowl heaped with snacks and toys (万物皆可滚's
// models), tap one to lift it into the tray at the bottom, three alike in the tray pop. Clear the
// bowl to finish the level; fill all seven places in the tray without a three and it's a retry.
// No clock. Things fall into the bowl at the start, and drop into the gaps left as they're taken.
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
import { Pile, BOWL, floorAt } from './pile.js';
import { LEVELS } from './levels.js';

applyContent();

const $ = id => document.getElementById(id);
const nextFrame = () => new Promise(r => requestAnimationFrame(() => r()));
const SLOTS = 7;
const ITEM = 1.2; // every thing is shown about this big (m), whatever its real size
const SLOT_X = i => -3.15 + i * 1.05, SLOT_Z = 5.35, SLOT_Y = 0.55;
const store = {
  get(k, d) { try { const v = localStorage.getItem('match.' + k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('match.' + k, JSON.stringify(v)); } catch {} },
};

let engine, material, fx, pile;
const G = { t: 0, level: 0, state: 'drop', slots: [], tweens: [], combo: 0, queue: [], dropT: 0 };

async function boot() {
  translateDom();
  if (EN) document.title = t('收集三连');
  const fontsDone = loadFonts(12000);
  await Promise.race([fontsDone, new Promise(r => setTimeout(r, 600))]);
  await nextFrame();
  buildAtlas();
  material = objectMaterial(atlasTexture());
  engine = new Engine($('game'), matchMedia('(pointer: coarse)').matches ? 'medium' : 'high');
  const sc = engine.scene;
  sc.background = new THREE.Color(0xffe9d6);
  engine.hemi.color.set(0xfff6ec);
  engine.hemi.groundColor.set(0xe8c9b4);
  engine.hemi.intensity = 1.9;
  engine.sun.color.set(0xffffff);
  engine.sun.intensity = 2.2;
  engine.sunDir.set(0.35, 1, 0.45).normalize();
  makeBowl(sc);
  makeTray(sc);
  fx = new FX(sc);
  pile = new Pile();
  engine.camera.fov = 44;
  aim();
  addEventListener('resize', aim);
  $('game').addEventListener('pointerdown', onTap);
  $('card-btn').addEventListener('click', () => { audio.ui('click'); startLevel(G.next); });
  startLevel(store.get('level', 0) % LEVELS.length);
  requestAnimationFrame(loop);
  await nextFrame();
  $('loading').classList.add('done');
  window.__ready = true;
}

/** the camera: high in front of the bowl, looking down on it, the tray along the bottom of the view;
 *  a narrow (phone) screen backs it off until the bowl and the tray fit across */
function aim() {
  const c = engine.camera, k = Math.max(1, 0.95 / c.aspect), tall = c.aspect < 1;
  // (and looks down more steeply on a tall screen: the bowl reads rounder and bigger)
  c.position.set(0, (tall ? 12.6 : 11.2) * k, (tall ? 5.2 : 7.6) * k);
  c.lookAt(0, 0, tall ? 2.0 : 1.2);
  c.updateProjectionMatrix();
}

function makeBowl(sc) {
  // a round bowl: the dish-shaped floor the pile rests on, turned on a lathe up into a wall; mint
  // inside (white buns and eggs show against it), a peach rim
  const R = BOWL.r, H = BOWL.wall, prof = [];
  for (let i = 0; i <= 12; i++) { const x = (R - 0.1) * i / 12; prof.push(new THREE.Vector2(x, floorAt(x) - 0.04)); }
  prof.push(new THREE.Vector2(R + 0.15, H * 0.7), new THREE.Vector2(R + 0.35, H), new THREE.Vector2(R + 0.6, H), new THREE.Vector2(R + 0.3, -0.1), new THREE.Vector2(0, -0.36));
  const g = new THREE.LatheGeometry(prof, 72);
  const bowl = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ color: 0xcdeee2, side: THREE.DoubleSide }));
  sc.add(bowl);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(R + 0.48, 0.12, 8, 64), new THREE.MeshLambertMaterial({ color: 0xff9f7f }));
  rim.rotation.x = Math.PI / 2;
  rim.position.y = H;
  sc.add(rim);
  const table = new THREE.Mesh(new THREE.CircleGeometry(40, 48), new THREE.MeshLambertMaterial({ color: 0xf6d2b8 }));
  table.rotation.x = -Math.PI / 2;
  table.position.y = -0.36;
  table.receiveShadow = true;
  sc.add(table);
}

function makeTray(sc) {
  // the tray: a long cream board with seven shallow places
  const board = new THREE.Mesh(new THREE.BoxGeometry(7.7, 0.3, 1.35), new THREE.MeshLambertMaterial({ color: 0xfffaf2 }));
  board.position.set(0, SLOT_Y - 0.45, SLOT_Z);
  sc.add(board);
  for (let i = 0; i < SLOTS; i++) {
    const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.05, 28), new THREE.MeshLambertMaterial({ color: 0xffe2cf }));
    cup.position.set(SLOT_X(i), SLOT_Y - 0.28, SLOT_Z);
    sc.add(cup);
  }
}

// ---- items ------------------------------------------------------------------------------------------
function makeItem(id) {
  const spec = buildSpec(CATALOG.get(id));
  const k = ITEM / spec.maxDim;
  const mesh = new THREE.Mesh(spec.geometry, material);
  mesh.scale.setScalar(k);
  mesh.position.set(-spec.center.x * k, -spec.center.y * k, -spec.center.z * k);
  mesh.castShadow = true;
  const g = new THREE.Group();
  g.add(mesh);
  engine.scene.add(g);
  const item = { id, spec, mesh: g, pos: g.position, r: 0.54 };
  g.userData.item = item;
  return item;
}

function startLevel(n) {
  // (everything from the last bowl: in it, in the tray, still popping or in the air)
  for (const c of engine.scene.children.filter(c => c.userData.item)) engine.scene.remove(c);
  pile.items.length = 0;
  G.slots.length = 0;
  G.tweens.length = 0;
  G.level = n;
  G.combo = 0;
  const L = LEVELS[n];
  const ids = [];
  for (const id of L.ids) for (let s = 0; s < L.sets * 3; s++) ids.push(id);
  ids.sort(() => Math.random() - 0.5);
  G.queue = ids;
  G.dropT = 0;
  G.state = 'drop';
  $('level-num').textContent = t('第 {n} 关', { n: n + 1 });
  $('level-name').textContent = t(L.name);
  $('card').hidden = true;
  store.set('level', n);
}

/** things fall into the bowl a few at a time, from just above it */
function dropping(dt) {
  if (!G.queue.length) return;
  G.dropT -= dt;
  if (G.dropT > 0) return;
  G.dropT = 0.05;
  for (let k = 0; k < 2 && G.queue.length; k++) {
    const o = makeItem(G.queue.pop());
    const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * (BOWL.r - 1.4);
    o.pos.set(Math.cos(a) * r, 5 + Math.random() * 3, Math.sin(a) * r);
    o.mesh.rotation.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
    pile.add(o);
    if (Math.random() < 0.3) audio.pickup(o.spec.sfx, 0.4, 0.2);
  }
}

// ---- taking things out -----------------------------------------------------------------------------
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
async function onTap(e) {
  try { await audio.init(); if (!G.music) { G.music = true; audio.music('title', { fade: 2 }); } } catch {}
  if (G.state !== 'play' && G.state !== 'drop') return;
  if (G.slots.length >= SLOTS) return;
  ndc.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  ray.setFromCamera(ndc, engine.camera);
  const hits = ray.intersectObjects(pile.items.map(o => o.mesh), true);
  if (!hits.length) return;
  let obj = hits[0].object;
  while (obj && !obj.userData.item) obj = obj.parent;
  const item = obj && obj.userData.item;
  if (!item) return;
  take(item);
}

function take(item) {
  pile.remove(item);
  // into the tray next to its own kind, or at the end
  let at = G.slots.length;
  for (let i = G.slots.length - 1; i >= 0; i--) if (G.slots[i].id === item.id) { at = i + 1; break; }
  G.slots.splice(at, 0, item);
  audio.pickup(item.spec.sfx, 0.6, 0.3);
  fx.pickup(item.pos.x, item.pos.y, item.pos.z, 0.5, 1);
  layoutTray(item);
  // three alike: they pop once the newest has landed
  const same = G.slots.filter(o => o.id === item.id);
  if (same.length >= 3) setTimeout(() => pop(same.slice(0, 3)), 330);
  else if (G.slots.length >= SLOTS) setTimeout(() => { if (G.slots.length >= SLOTS && G.state === 'play') lose(); }, 450);
}

/** every thing in the tray slides to its place (the one just taken flies there in an arc) */
function layoutTray(flyer) {
  G.slots.forEach((o, i) => {
    const to = new THREE.Vector3(SLOT_X(i), SLOT_Y, SLOT_Z);
    if (o === flyer) tween(o, to, 0.32, 2.4);
    else if (o.pos.distanceTo(to) > 0.01) tween(o, to, 0.18, 0);
  });
}

function tween(o, to, dur, arc) {
  G.tweens = G.tweens.filter(w => w.o !== o);
  G.tweens.push({ o, from: o.pos.clone(), to, t: 0, dur, arc, rot: o.mesh.rotation.clone() });
}

function pop(three) {
  if (three.some(o => !G.slots.includes(o))) return;
  G.combo++;
  for (const o of three) {
    G.slots.splice(G.slots.indexOf(o), 1);
    G.tweens = G.tweens.filter(w => w.o !== o);
    fx.firework(o.pos.x, o.pos.y + 0.3, o.pos.z, 0.9);
    G.tweens.push({ o, pop: true, t: 0, dur: 0.22 });
  }
  audio.comboChime(Math.min(8, G.combo));
  layoutTray(null);
  if (!pile.items.length && !G.slots.length && !G.queue.length) setTimeout(win, 600);
}

function win() {
  G.state = 'won';
  audio.milestone(6);
  for (let i = 0; i < 6; i++) setTimeout(() => fx.firework((Math.random() - 0.5) * 6, 2 + Math.random() * 2, (Math.random() - 0.5) * 4, 2), i * 150);
  G.next = (G.level + 1) % LEVELS.length;
  $('card-title').textContent = t('清空了！');
  $('card-sub').textContent = G.level + 1 < LEVELS.length ? t('下一关：{name}', { name: t(LEVELS[G.next].name) }) : t('三关都清空了，从头再来一遍？');
  $('card-btn').textContent = G.level + 1 < LEVELS.length ? t('下一关') : t('再来一遍');
  setTimeout(() => ($('card').hidden = false), 700);
}

function lose() {
  G.state = 'lost';
  audio.timeUp();
  G.next = G.level;
  $('card-title').textContent = t('放不下了');
  $('card-sub').textContent = t('收集槽满了，换个顺序再试试');
  $('card-btn').textContent = t('再试一次');
  $('card').hidden = false;
}

// ---- per frame ----------------------------------------------------------------------------------
let last = performance.now();
function loop() {
  requestAnimationFrame(loop);
  const now = performance.now();
  const dt = Math.min(0.033, (now - last) / 1000);
  last = now;
  step(dt);
}

function step(dt) {
  G.t += dt;
  dropping(dt);
  if (G.state === 'drop' && !G.queue.length) G.state = 'play';
  pile.step(dt);
  for (let i = G.tweens.length - 1; i >= 0; i--) {
    const w = G.tweens[i];
    w.t += dt;
    const k = Math.min(1, w.t / w.dur);
    if (w.pop) {
      // a little swell, then gone
      w.o.mesh.scale.setScalar(k < 0.4 ? 0.78 + k * 0.6 : Math.max(0, 1.02 * (1 - (k - 0.4) / 0.6)));
      if (k >= 1) { engine.scene.remove(w.o.mesh); G.tweens.splice(i, 1); }
      continue;
    }
    const e = 1 - (1 - k) * (1 - k);
    w.o.pos.lerpVectors(w.from, w.to, e);
    w.o.pos.y += Math.sin(Math.PI * k) * w.arc;
    // settle upright, a little tipped towards the camera, a bit smaller in the tray
    w.o.mesh.rotation.set(w.rot.x * (1 - e) - 0.55 * e, w.rot.y * (1 - e), w.rot.z * (1 - e));
    w.o.mesh.scale.setScalar(1 - 0.22 * e);
    if (k >= 1) G.tweens.splice(i, 1);
  }
  fx.update(dt);
  MU.time.value = G.t;
  $('left-num').textContent = pile.items.length + G.queue.length;
  const r = engine.renderer;
  fx.setViewport(r.domElement.clientHeight, engine.camera.fov);
  engine.updateShadow(new THREE.Vector3(0, 0, 1.5), 9);
  r.setViewport(0, 0, engine.width, engine.height);
  r.clear();
  r.render(engine.scene, engine.camera);
}

window.__match = { get G() { return G; }, get pile() { return pile; }, take, startLevel, step };

boot();
