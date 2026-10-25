// 零食大乱斗 (Snack Brawl, working title) — a separate game: a dozen balls on a picnic blanket, eat
// what's smaller (food and other balls), run from what's bigger, two and a half minutes a round.
// The rolling (ball.js), the chase camera (camera.js), the controls (input.js: push where you want
// to go) and the rivals (rivals.js, brawl mode) are 万物皆可滚's; the map is its own (arena.js).
import * as THREE from 'three';
import '../catalog/index.js';
import { buildAtlas, loadFonts, atlasTexture, repaintAtlas } from '../core/atlas.js';
import { objectMaterial, U as MU } from '../core/materials.js';
import { LOD_PART, LOD_COARSE, pumpCoarse, wantCoarse } from '../core/assets.js';
import { Engine } from '../game/engine.js';
import { Sky } from '../game/sky.js';
import { Ground } from '../game/ground.js';
import { World } from '../game/world.js';
import { Movers } from '../game/movers.js';
import { Ball, STUCK } from '../game/ball.js';
import { CameraRig } from '../game/camera.js';
import { Input, isTouch } from '../game/input.js';
import { Rivals } from '../game/rivals.js';
import { skinById } from '../game/skins.js';
import { fmt } from '../game/hud.js';
import { t, translateDom, EN } from '../i18n/index.js';
import { applyContent } from '../i18n/apply.js';
import { buildArena } from './arena.js';

applyContent();

const $ = id => document.getElementById(id);
const nextFrame = () => new Promise(r => requestAnimationFrame(() => r()));
const START_SIZE = 0.06;
const ROUND = 150; // s
const RIVALS = 11;
const HOUR = 11; // late morning: a bright picnic
const SOFT_CAP = 6; // m: past this, balls grow ever slower (the picnic is ~75 m across)

let engine, sky, ground, world, layout, movers, input, ball, rivals, rig, material;
const G = { t: 0, time: 0, state: 'play', eaten: 0, eatenBy: null, events: [], safeUntil: 0 };

async function boot() {
  translateDom();
  if (EN) document.title = t('零食大乱斗');
  const fontsDone = loadFonts(12000);
  await Promise.race([fontsDone, new Promise(r => setTimeout(r, 600))]);
  let atlasStale = false;
  fontsDone.then(() => (atlasStale = true));
  await nextFrame();
  buildAtlas();
  material = objectMaterial(atlasTexture());
  const mobile = matchMedia('(pointer: coarse)').matches || Math.min(screen.width, screen.height) < 700;
  engine = new Engine($('game'), mobile ? 'low' : 'high');
  engine.scene.fog = new THREE.FogExp2(0xdfe8ee, 0.004);
  sky = new Sky(engine.scene);
  ground = new Ground(engine.scene);
  world = new World(engine.scene);
  await nextFrame();
  layout = buildArena(world);
  ground.build(layout.zones);
  await nextFrame();
  world.finalize();
  if (world.missing.size) console.warn('[snack] missing catalog ids:', [...world.missing].join(' '));
  movers = new Movers(world, layout);
  ball = new Ball(engine.scene, world, material, START_SIZE);
  // (for now a watermelon; its own dumpling faces come later)
  ball.setSkin(skinById('xigua'));
  rivals = new Rivals(engine.scene, world, material);
  rig = new CameraRig(engine.camera, world);
  input = new Input($('game'));
  // the mouse: the ball rolls towards the pointer (a click dashes)
  addEventListener('pointermove', e => { if (e.pointerType === 'mouse') { mouse.x = e.clientX; mouse.y = e.clientY; mouse.t = performance.now(); } });
  addEventListener('pointerdown', e => { if (e.pointerType === 'mouse' && e.button === 0) mouse.click = true; });
  if (isTouch()) for (const id of ['touch-zone', 'touch-dash']) $(id).hidden = false;
  $('btn-again').addEventListener('click', startRound);
  STUCK.max = engine.q.stuck;
  startRound();
  view();
  engine.renderer.compile(engine.scene, engine.camera);
  for (const ty of world.types.values()) wantCoarse(ty.spec);
  G.atlasCheck = () => { if (atlasStale) { atlasStale = false; repaintAtlas(); } };
  requestAnimationFrame(loop);
  await nextFrame();
  $('loading').classList.add('done');
  window.__ready = true;
}

// ---- a round --------------------------------------------------------------------------------------
function startRound() {
  world.resetAll();
  const s = layout.start;
  ball.reset(START_SIZE, s.x, s.z, s.heading);
  ball.group.visible = true;
  // (a small map: the field starts close to the player's size, and they hunt from nearer, or the
  // player would spend the round running from someone)
  rivals.start(RIVALS, START_SIZE, { brawl: true, spawns: layout.spawns, farMax: 14, sizes: [1, 1, 1, 1.2, 1.4, 1.6, 2, 2, 2.5, 3, 4], huntK: 5, band: 1.3, calm: G.t + 15, respawnMax: 0.8, softCap: SOFT_CAP });
  // (the player grows a little faster than the field: an edge for a human against a dozen)
  ball.rateBoost = 1.3;
  follow(1e3);
  G.state = 'play';
  G.time = 0;
  G.eaten = 0;
  G.eatenBy = null;
  // (the first seconds nothing can eat the player: time to find their feet and some food)
  G.safeUntil = G.t + 12;
  ball.safeUntil = G.safeUntil;
  $('results').hidden = true;
  popup(t('吃掉比你小的，躲开比你大的！'), 'good');
}

function endRound(why) {
  if (G.state !== 'play') return;
  G.state = 'over';
  const list = rivals.standings(ball, why === 'eaten' ? G.t : 0);
  const place = why === 'eaten' ? 1 + list.filter(e => !e.me && e.alive && e.S > ball.S).length : list.findIndex(e => e.me) + 1;
  const survived = why !== 'eaten';
  const coins = Math.max(0, 13 - place) * 8 + G.eaten * 25 + Math.max(0, Math.round(Math.log2(ball.S / START_SIZE) * 5)) + (survived ? 30 : 0);
  let total = coins;
  try { total = (+localStorage.getItem('snack.coins') || 0) + coins; localStorage.setItem('snack.coins', String(total)); } catch {}
  $('res-why').textContent = survived ? t('时间到！') : t('被「{name}」吃掉了', { name: G.eatenBy });
  $('res-place').textContent = place === 1 ? t('第一名！') : t('第 {n} 名', { n: place });
  $('res-lines').innerHTML = [
    t('长到 <b>{s}</b>', { s: fmt(ball.S) }),
    t('吃掉 <b>{n}</b> 颗团子', { n: G.eaten }),
    t('共有金币 <b>{n}</b>', { n: total }),
  ].map(l => `<li>${l}</li>`).join('');
  $('res-coins').textContent = coins;
  setTimeout(() => ($('results').hidden = false), 900);
}

function rivalEvents(evs) {
  for (const e of evs) {
    if (e.type === 'eaten') {
      ball.pending += e.gain;
      G.eaten++;
      popup(t('吃掉了「{name}」！', { name: e.r.name }), 'good');
    } else if (e.type === 'playerEaten') {
      G.eatenBy = e.by.name;
      ball.group.visible = false;
      rig.shake(0.08);
      endRound('eaten');
      return;
    } else if (e.type === 'bump') rig.shake(0.03);
  }
}

function popup(text, kind = '') {
  const el = document.createElement('div');
  el.className = `pop ${kind}`;
  el.textContent = text;
  $('popups').appendChild(el);
  setTimeout(() => el.remove(), 1400);
  while ($('popups').children.length > 3) $('popups').firstChild.remove();
}

// ---- controls: no steering ------------------------------------------------------------------------
// The view never turns (north is always up the screen), and every control gives the direction to
// roll in screen terms: W A S D (or the arrows) up/left/down/right and the diagonals between; the
// mouse, the way from the ball to the pointer; the touch stick, the way it's pushed. Space, a click
// or the touch button dashes.
const mouse = { x: 0, y: 0, t: -1e9, click: false };
const _sp = new THREE.Vector3();
function controls(raw) {
  const out = { dir: null, m: 0, quick: false, hold: false, turnImpulse: 0, dash: raw.dash || mouse.click };
  mouse.click = false;
  const vx = (raw.keyTurn || 0), vz = (raw.fwd ? 1 : 0) - (raw.back ? 1 : 0);
  if (vx || vz) {
    // (screen up is north, −Z: heading 0; right is +X: heading π/2)
    out.dir = Math.atan2(vx, vz);
    out.m = 1;
  } else if (raw.stick && raw.stick.m > 0.1) {
    out.dir = raw.stick.a;
    out.m = Math.min(1, raw.stick.m * 1.3);
  } else if (performance.now() - mouse.t < 4000) {
    _sp.set(ball.pos.x, ball.centerY, ball.pos.z).project(engine.camera);
    const bx = ((_sp.x + 1) / 2) * innerWidth, by = ((1 - _sp.y) / 2) * innerHeight;
    const dx = mouse.x - bx, dy = mouse.y - by, d = Math.hypot(dx, dy);
    if (d > 24) {
      out.dir = Math.atan2(dx, -dy);
      out.m = Math.min(1, d / 160);
    }
  }
  return out;
}

// ---- the view: from the south, high up, looking down on the ball, further off as it grows (so
// what's coming can be seen in time); it never turns ------------------------------------------------
const _cp = new THREE.Vector3(), _cl = new THREE.Vector3();
function follow(speed = 6) {
  const S = ball.displayS;
  _cl.set(ball.pos.x, ball.centerY, ball.pos.z - S * 0.6);
  _cp.set(ball.pos.x, ball.centerY + S * 7 + 0.35, ball.pos.z + S * 4.6 + 0.25);
  rig.override = { pos: _cp.clone(), look: _cl.clone(), fov: 52, speed };
  if (speed > 100) { rig.pos.copy(_cp); rig.look.copy(_cl); }
}

// ---- per frame ----------------------------------------------------------------------------------
const NO_INPUT = { dir: null, m: 0, quick: false, hold: false, turnImpulse: 0, dash: false };
let last = performance.now();
function loop() {
  requestAnimationFrame(loop);
  const now = performance.now();
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  step(dt);
  render();
  pumpCoarse(2);
}

function step(dt) {
  G.t += dt;
  const raw = input.poll();
  const playing = G.state === 'play';
  const inp = playing ? controls(raw) : { ...NO_INPUT };
  if (G.autopilot && playing) Object.assign(inp, G.autopilot(ball, rivals, world));
  G.events.length = 0;
  if (playing) {
    G.time += dt;
    // (the edge over the field, less and less past the size the picnic is made for)
    ball.rateBoost = 1.3 * Math.min(1, SOFT_CAP / ball.S);
    ball.update(dt, inp, G.t, G.events);
    rivalEvents(rivals.update(dt, G.t, ball));
    if (G.time >= ROUND) endRound('time');
  } else ball.updateVisual(dt, G.t);
  // nobody leaves the picnic
  keepIn(ball);
  for (const r of rivals.list) if (r.alive) keepIn(r.ball);
  movers.update(dt, G.t, ball, G.events);
  world.updateFlyers(dt);
  if ((G.cullT = (G.cullT || 0) - dt) <= 0) { G.cullT = 0.5; world.cullTiny(ball.S); }
  follow();
  rig.update(dt, ball, G.t);

  sky.setHour(HOUR);
  sky.update(engine.camera, G.t);
  ground.update(G.t);
  engine.sunDir.copy(sky.u.uSunDir.value);
  engine.sun.color.copy(sky.sunColor);
  engine.sun.intensity = sky.sunI;
  engine.hemi.color.copy(sky.hemiSky);
  engine.hemi.groundColor.copy(sky.hemiGround);
  engine.hemi.intensity = sky.hemiI;
  MU.glow.value = sky.glow;
  engine.scene.fog.color.copy(sky.fogColor);
  engine.scene.fog.density = 1 / Math.max(160, ball.S * 120 + 120);
  view();
  MU.time.value = G.t;
  hud(dt);
}

function keepIn(b) {
  const R = layout.bounds - b.S * 0.5, d = Math.hypot(b.pos.x, b.pos.z);
  if (d > R) {
    b.pos.x *= R / d;
    b.pos.z *= R / d;
  }
}

/** what to draw: like 万物皆可滚's updateView, around the player's ball */
function view() {
  const c = engine.camera;
  const F = engine.height / (2 * Math.tan((c.fov * Math.PI) / 360));
  const det = engine.q.detail;
  ball.lodK = ((LOD_PART * F) / 1.5) * det;
  ball.coarseK = ((LOD_COARSE * F) / 1.5) * det;
  ball.lodDist = c.position.distanceTo(ball.group.position) - ball.displayS * 0.25;
  rivals.view(c, ball.lodK, ball.coarseK);
  const shadowR = Math.max(3, ball.S * 16);
  world.updateVisibility(c, 2 / engine.scene.fog.density, (F / 2) * det, ball.lodK, ball.coarseK, ball.group.position, engine.q.shadows ? shadowR * 1.25 : 0, null);
  engine.updateShadow(ball.group.position, shadowR);
}

function render() {
  if (G.atlasCheck && G.state !== 'play') G.atlasCheck();
  const r = engine.renderer;
  r.setScissorTest(false);
  r.setViewport(0, 0, engine.width, engine.height);
  r.clear();
  r.render(engine.scene, engine.camera);
}

const shown = { size: '', time: -1 };
function hud(dt) {
  const s = fmt(ball.S), m = s.match(/^([\d.]+)\s*(\S+)$/);
  if (s !== shown.size) {
    shown.size = s;
    $('size-num').textContent = m ? m[1] : s;
    $('size-unit').textContent = m ? m[2] : '';
  }
  const left = Math.max(0, Math.ceil(ROUND - G.time));
  if (left !== shown.time) {
    shown.time = left;
    $('time-num').textContent = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
    $('timer').classList.toggle('hurry', left <= 20);
  }
  rivals.hud(dt, engine.camera, ball, innerWidth, innerHeight, 70);
}

// for testing from the console / automated runs
window.__snack = { get G() { return G; }, get ball() { return ball; }, get rivals() { return rivals; }, get world() { return world; }, step, startRound };

boot();
