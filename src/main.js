// 万物皆可滚 · 女娲补天 — boot, game states, the main loop, the finale.
import * as THREE from 'three';
import './catalog/index.js';
import { CATALOG } from './catalog/registry.js';
import { buildAtlas, loadFonts, atlasTexture, repaintAtlas } from './core/atlas.js';
import { objectMaterial, U as MU } from './core/materials.js';
import { buildSpec, LOD_PART, LOD_COARSE, pumpCoarse, wantCoarse } from './core/assets.js';
import { Engine } from './game/engine.js';
import { Sky } from './game/sky.js';
import { Ground } from './game/ground.js';
import { World } from './game/world.js';
import { buildLayout } from './game/layout.js';
import { Movers } from './game/movers.js';
import { Ball, GROW, PICK_RATIO, STUCK, COMBO, buildCoreGeometry } from './game/ball.js';
import { Player } from './game/player.js';
import { CameraRig } from './game/camera.js';
import { Input, Driver, isTouch } from './game/input.js';
import { FX } from './game/fx.js';
import { Preview } from './game/preview.js';
import { HUD, fmt } from './game/hud.js';
import { Maps } from './game/minimap.js';
import { Dex } from './game/dex.js';
import { Wishes } from './game/wishes.js';
import { Dialog } from './game/dialog.js';
import * as story from './game/story.js';
import { MODES, LEVELS, levelById, Progress, dayKey, dayLabel, dayRandom } from './game/modes.js';
import { SKINS, skinById, skinOpen, skinNeed } from './game/skins.js';
import { Shards, SHARDS } from './game/shards.js';
import { Rivals } from './game/rivals.js';
import { shareCard } from './game/share.js';
import { audio } from './audio/audio.js';

const START_SIZE = 0.06;
const SITE = 'superdiaodiao.github.io/wanwu-gun';
const $ = id => document.getElementById(id);
const nextFrame = () => new Promise(r => requestAnimationFrame(() => r()));
const store = {
  get(k, d) { try { const v = localStorage.getItem('wanwu.' + k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('wanwu.' + k, JSON.stringify(v)); } catch {} },
};

const G = {
  state: 'loading', mode: 'timed', time: 0, t: 0, milestone: 0, events: [],
  finale: null, toastCd: 0, tickSec: -1, hurry: false, cullT: 0, patched: false, prelaunch: null,
  hinted: new Set(), hintCd: 0, idleT: 0, sizes: [], sizeT: 0, nudgeCd: 20, info: { calls: 0, tris: 0 }, drawn: 0, atlasStale: false,
  gainAcc: 0, gainT: 0, comboShown: 0, unlockLimit: 0, mapWhole: true, redHinted: false, soundT: 0,
  rules: MODES.timed, level: null, cd: 0, bumps: 0, catN: 0, curve: [], curveT: 0, splitAt: 60, result: null,
};
let engine, sky, ground, world, layout, movers, ball, player, rig, input, fx, hud, dialog, lastPreview, nuwaPreview, material, maps, dex, wishes;
let progress, shards, rivals;
let driver = new Driver();
let giant = null; // 女娲 towering in the sky during the intro and the finale
let ballCam = null; // results-screen portrait of the finished ball
let lastT = performance.now() / 1000;

function setLoading(text) { $('loading-text').textContent = text; }

function pickQuality() {
  const saved = store.get('quality', null);
  if (saved) return saved;
  const mobile = matchMedia('(pointer: coarse)').matches || Math.min(screen.width, screen.height) < 700;
  return mobile ? 'low' : 'high';
}

async function boot() {
  const probe = document.createElement('canvas').getContext('webgl2');
  if (!probe) {
    $('loading').hidden = true;
    $('title-screen').hidden = true;
    $('webgl-error').hidden = false;
    return;
  }
  const T = { t0: performance.now() };
  setLoading('女娲正在捏泥人……');
  // give the web fonts a brief head start; whatever is late gets repainted into the atlas later
  const fontsDone = loadFonts(12000);
  await Promise.race([fontsDone, new Promise(r => setTimeout(r, 600))]);
  T.fonts = performance.now();
  // late fonts get repainted into the atlas, but not mid-game: the re-upload would hitch
  fontsDone.then(() => (G.atlasStale = true));
  await nextFrame();
  buildAtlas();
  T.atlas = performance.now();
  material = objectMaterial(atlasTexture());
  engine = new Engine($('game'), pickQuality());
  engine.scene.fog = new THREE.FogExp2(0xdfe8ee, 0.001);
  sky = new Sky(engine.scene);
  ground = new Ground(engine.scene);
  world = new World(engine.scene);
  setLoading('正在盖幸福里小区……');
  await nextFrame();
  T.pre = performance.now();
  layout = buildLayout(world);
  shards = new Shards(store);
  shards.place(world);
  T.layout = performance.now();
  ground.build(layout.zones);
  T.ground = performance.now();
  setLoading('正在把瓜子撒满一地……');
  await nextFrame();
  world.finalize();
  T.finalize = performance.now();
  movers = new Movers(world, layout);
  ball = new Ball(engine.scene, world, material, START_SIZE);
  rivals = new Rivals(engine.scene, world, material);
  player = new Player(engine.scene, material);
  rig = new CameraRig(engine.camera, world);
  input = new Input($('game'));
  fx = new FX(engine.scene);
  hud = new HUD();
  maps = new Maps(world, layout);
  maps.attach($('minimap'));
  dex = new Dex({ world, renderer: engine.renderer, material, store, pickRatio: PICK_RATIO });
  wishes = new Wishes(store, id => {
    const i = dex.byId.get(id);
    return i === undefined ? null : dex.entries[i].where;
  });
  progress = new Progress(store);
  ball.setSkin(currentSkin());
  // (so nothing found is lost when the page goes away mid-game)
  addEventListener('pagehide', () => dex.save());
  document.addEventListener('visibilitychange', () => { if (document.hidden) dex.save(); });
  input.lookSurface($('minimap-btn'));
  dialog = new Dialog(audio);
  lastPreview = new Preview($('last-view'), material);
  nuwaPreview = new Preview($('dialog-portrait'), material, { dir: [0.18, 0.1, 1], fill: 1.08, backdrop: 0xf2e3c2 });
  const nuwa = CATALOG.get('nuwa');
  $('dialog-portrait').hidden = !nuwa;
  if (nuwa) {
    try {
      buildSpec(nuwa);
      // head-and-shoulders close-up (her face is around y ≈ 1.45 in model space)
      nuwaPreview.show(nuwa, null, { focus: [0, 1.32, 0.1], radius: 0.62 });
      nuwaPreview.anim = (p, t) => {
        p.rotation.y = Math.sin(t * 0.9) * 0.25;
        p.position.y = Math.sin(t * 2.2) * nuwa.dims.h * 0.02;
      };
    } catch (e) { console.warn('[main] nuwa model failed', e); }
  }
  makeGiant();
  makeBallCam();
  setupUI();
  resetGame('timed');
  enterTitle();
  // compile shaders before the first visible frame
  updateView(ball.displayS);
  engine.renderer.compile(engine.scene, engine.camera);
  T.compile = performance.now();
  // coarse stand-ins get made a few milliseconds a frame from here on, while the title screen is up
  for (const t of world.types.values()) wantCoarse(t.spec);
  const r = k => Math.round(T[k] - T.t0);
  if (world.missing.size) console.warn('[world] missing catalog ids:', [...world.missing].join(' '));
  window.__boot = T;
  console.info(`[boot] fonts ${r('fonts')} · layout ${Math.round(T.layout - T.pre)} · ground ${Math.round(T.ground - T.layout)} · finalize ${Math.round(T.finalize - T.ground)} · total ${r('compile')} ms · ${world.objects.length} objects · ${world.types.size} types`);
  requestAnimationFrame(loop);
  await nextFrame();
  $('loading').classList.add('done');
  setTimeout(() => ($('loading').hidden = true), 700);
  window.__ready = true;
}

// ---- giant 女娲 in the sky ---------------------------------------------------------------------

function makeGiant() {
  const spec = CATALOG.get('nuwa');
  if (!spec || !spec.geometry) return;
  const mat = material.clone();
  mat.fog = false;
  // a goddess glows in her own colours: she stands against the sun in the intro and against the
  // night sky in the finale, and would otherwise be a dark, muddy silhouette in both
  mat.onBeforeCompile = sh => {
    material.onBeforeCompile(sh);
    sh.fragmentShader = sh.fragmentShader.replace(
      '#include <emissivemap_fragment>',
      '#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * 0.55;'
    );
  };
  mat.customProgramCacheKey = () => 'wanwu-object-giant';
  const mesh = new THREE.Mesh(spec.geometry, mat);
  mesh.position.set(-spec.center.x, -spec.center.y, -spec.center.z);
  giant = new THREE.Group();
  giant.add(mesh);
  giant.visible = false;
  giant.userData = { h: spec.dims.h, vis: 0, target: 0, dir: new THREE.Vector3(0.45, 0.4, -0.8).normalize() };
  engine.scene.add(giant);
}

function updateGiant(dt, t) {
  if (!giant) return;
  const u = giant.userData;
  u.vis += (u.target - u.vis) * Math.min(1, dt * 1.6);
  giant.visible = u.vis > 0.01;
  if (!giant.visible) return;
  const cam = engine.camera.position;
  const dist = 460;
  giant.position.copy(cam).addScaledVector(u.dir, dist);
  giant.position.y += Math.sin(t * 0.9) * 8 - (1 - u.vis) * 260;
  giant.scale.setScalar(210 / u.h);
  giant.lookAt(cam.x, giant.position.y, cam.z);
  giant.rotateY(Math.sin(t * 0.6) * 0.12);
}

// ---- portrait of the finished ball (results screen) --------------------------------------------

function makeBallCam() {
  ballCam = new THREE.PerspectiveCamera(32, 1, 0.01, 100000);
  ballCam.layers.set(1);
  const hemi = new THREE.HemisphereLight(0xfff4e6, 0x6a5a7a, 1.6);
  const key = new THREE.DirectionalLight(0xffffff, 2.6);
  key.position.set(0.6, 1, 0.8);
  hemi.layers.set(1);
  key.layers.set(1);
  ballCam.add(hemi, key);
  const bd = new THREE.Mesh(new THREE.CircleGeometry(1, 48), new THREE.MeshBasicMaterial({ color: 0x2b2632, depthWrite: false, toneMapped: false, fog: false }));
  bd.layers.set(1);
  bd.renderOrder = -1;
  ballCam.userData.backdrop = bd;
  ballCam.add(bd);
  engine.scene.add(ballCam);
}

function renderBallPortrait(r, t) {
  const el = $('res-ball');
  if (!ballCam || !el || el.offsetParent === null) return;
  const rect = el.getBoundingClientRect();
  if (rect.width < 8) return;
  // stage the ball where it launched from, spinning slowly for its portrait
  ball.group.visible = true;
  ball.group.position.set(G.prelaunch.x, ball.centerY, G.prelaunch.z);
  ball.group.scale.set(1, 1, 1);
  ball.root.rotation.y += 0.004;
  const S = ball.displayS;
  const dist = S * 2.3;
  const c = ball.group.position;
  ballCam.position.set(c.x + Math.sin(t * 0.2) * dist * 0.35, c.y + S * 0.45, c.z + dist);
  ballCam.lookAt(c);
  ballCam.aspect = rect.width / rect.height;
  ballCam.near = dist * 0.05;
  ballCam.far = dist * 6;
  ballCam.updateProjectionMatrix();
  const bd = ballCam.userData.backdrop;
  bd.position.set(0, 0, -dist * 2.5);
  bd.scale.setScalar(dist * 2.5 * Math.tan((ballCam.fov * Math.PI) / 360) * 1.02);
  ballCam.updateMatrixWorld(true);
  const H = r.domElement.clientHeight;
  r.setViewport(rect.left, H - rect.bottom, rect.width, rect.height);
  r.setScissor(rect.left, H - rect.bottom, rect.width, rect.height);
  r.setScissorTest(true);
  r.clearDepth();
  const fog = engine.scene.fog;
  engine.scene.fog = null;
  r.render(engine.scene, ballCam);
  engine.scene.fog = fog;
  r.setScissorTest(false);
}

// ---- game setup ------------------------------------------------------------------------------

// ---- ways to play (modes.js): the rules of this game are the mode's, and a 关卡's own on top ----
function resetGame(mode, levelId = null) {
  G.mode = mode;
  G.level = mode === 'level' ? levelById(levelId) : null;
  G.rules = { ...MODES[mode], ...(G.level || {}) };
  G.time = 0;
  G.milestone = 0;
  G.tickSec = -1;
  G.hurry = false;
  G.patched = false;
  G.finale = null;
  G.hinted.clear();
  G.idleT = 0;
  G.nudgeCd = 20;
  world.resetAll();
  shards.hideFound(world);
  rivals.stop();
  ball.portraitOnly(false);
  // 吃货专场: only food can be rolled up (smaller other things are rolled over)
  ball.canPick = G.rules.only ? o => o.spec.cat === G.rules.only : null;
  movers = new Movers(world, layout);
  const s = layout.start;
  ball.reset(START_SIZE, s.x, s.z, s.heading);
  driver = new Driver();
  G.gainAcc = 0;
  G.comboShown = 0;
  G.unlockLimit = START_SIZE * PICK_RATIO;
  ap.target = null;
  ap.skip.clear();
  ap.escape = 0;
  ball.group.visible = true;
  player.visible = true;
  sky.u.uHole.value = 1;
  sky.u.uPatch.value = 0;
  $('hud-last').hidden = true;
  $('btn-patch').hidden = true;
  $('btn-patch').classList.remove('urge');
  G.rolledOut = false;
  G.rolledT = 3;
  food.said = false;
  food.target = null;
  G.sizes = [];
  G.sizeT = 0;
  wishNear.said.clear();
  wishNear.list.length = 0;
  G.cd = 0;
  G.bumps = 0;
  G.catN = 0;
  G.cats = new Set();
  G.dancers = G.level && G.level.goal && G.level.goal.dancers ? new Set(layout.groups.dance ? layout.groups.dance.dancers : []) : null;
  G.curve = [];
  G.curveT = 0;
  G.splitAt = 60;
  G.result = null;
  G.outro = 0;
  G.preyHinted = false;
  G.rivalsEaten = [];
  $('hud-count').classList.toggle('no-wish', !G.rules.wishes);
  syncLevelHud();
  dex.newGame();
  maps.reset();
  hud.update(ball.S, 0, G.rules.seconds, 0);
  lastPreview.clear();
}

/** the level's own count in the HUD pill: 猫 ×3, 撞 2/5, 大妈还剩 20 */
function syncLevelHud() {
  const el = $('hud-lvl'), L = G.level;
  el.hidden = !L;
  if (!L) return;
  let html = '';
  if (L.score === 'cats') html = `猫 <b>${G.catN}</b> 只`;
  else if (L.bumps) html = `撞了 <b>${G.bumps}</b>/${L.bumps}`;
  else if (G.dancers) html = `大妈还剩 <b>${G.dancers.size}</b>`;
  else if (L.goal && L.goal.size) html = `目标 <b>${fmt(L.goal.size)}</b>`;
  else if (L.only === 'food') html = '只吃<b>吃的</b>';
  if (html !== G.lvlShown) el.innerHTML = G.lvlShown = html;
}

function currentSkin() {
  const s = skinById(store.get('skin', 'wuse'));
  return skinOpen(s, totalStars(), shards.count) ? s : SKINS[0];
}
const totalStars = () => progress.total(wishes.stars);

function enterTitle() {
  G.state = 'title';
  if (giant) giant.userData.target = 0;
  hud.show(false);
  dialog.clear();
  $('title-screen').hidden = false;
  $('pause').hidden = true;
  $('results').hidden = true;
  showTouch(false);
  syncDexButton();
  syncTitleCounts();
  const best = store.get('best', null);
  const bl = $('best-line');
  if (best && best.size) {
    bl.hidden = false;
    bl.textContent = `最佳纪录：${fmt(best.size)} · ${best.rank || ''}` + (wishes.stars ? ` · 心愿 ★ ${wishes.stars}` : '');
  } else bl.hidden = true;
  titleShot(0);
  rig.pos.copy(rig.override.pos);
  rig.look.copy(rig.override.look);
}

function titleShot(t) {
  // slow sway inside the courtyard, looking north at the broken sky over the buildings
  const a = Math.sin(t * 0.06);
  rig.override = {
    pos: new THREE.Vector3(a * 5, 2.6, 16),
    look: new THREE.Vector3(a * 9, 30, -50),
    fov: 60,
    speed: 1.5,
  };
}

async function startGame(mode, levelId = null) {
  try { await audio.init(); } catch (e) { console.warn('[audio] init failed', e); }
  applyAudioPrefs();
  audio.ui('start');
  resetGame(mode, levelId);
  if (G.rules.wishes) wishes.start(mode, mode === 'daily' ? dayRandom() : null);
  else wishes.clear();
  syncWishHud();
  for (const id of ['title-screen', 'levels', 'skins', 'results']) $(id).hidden = true;
  if (G.rules.rivals) rivals.start(G.rules.rivals, START_SIZE);
  G.state = 'intro';
  audio.music('title', { fade: 1 });
  dialog.say(introLines(mode), { blocking: true, onDone: beginPlay });
  if (giant) {
    giant.userData.target = 1;
    giant.userData.dir.set(0.42, 0.5, -0.78).normalize();
  }
  // look at the broken sky while 女娲 talks
  rig.override = {
    pos: new THREE.Vector3(0, 1.6, 12),
    look: new THREE.Vector3(0, 42, -50),
    fov: 62,
    speed: 0.8,
  };
}

/** the long story the first time; after that, a line for the way of playing */
function introLines(mode) {
  const seen = store.get('introSeen', false);
  store.set('introSeen', true);
  if (mode === 'daily') return [story.INTRO_DAILY];
  if (mode === 'rivals') return [story.INTRO_RIVALS];
  if (mode === 'level') return [G.level.intro];
  const last = mode === 'timed' ? story.INTRO_TIMED : story.INTRO_FREE;
  return seen ? [last] : [...story.INTRO, last];
}

function beginPlay() {
  G.state = 'play';
  G.touchScreen = isTouch();
  resetTips();
  // (read them during the countdown: they go when 滚 comes up)
  if (G.rules.wishes) showWishes(G.rules.countdown ? 3 : 6);
  if (G.level) hud.toast(`<em>${G.level.name}</em> · ${G.level.text}`);
  // 3 · 2 · 1 · 滚！ (roll off right on 滚 for a flying start)
  G.cd = G.rules.countdown ? 3.2 : -1;
  G.cdShown = null;
  G.cdGo = null;
  if (giant) giant.userData.target = 0;
  rig.override = null;
  rig.zoomIdx = 0;
  hud.show(true);
  showTouch(true);
  audio.music('game', { fade: 2 });
  syncSoundButton();
  setTimeout(() => hud.fadeKeys(), 12000);
}

// ---- 女娲的心愿 (wishes.js): the stars after the count, the card, what happens when one comes true
function syncWishHud() {
  $('hud-wish').innerHTML = wishes.list.map(x => (x.done ? '<i class="on">★</i>' : '<i>☆</i>')).join('');
}

function showWishes(secs) {
  $('wish-list').innerHTML = wishes.list
    .map(x => {
      const hint = wishes.hint(x), p = wishes.progress(x);
      return `<li class="${x.done ? 'done' : ''}"><i>${x.done ? '★' : '☆'}</i><span>${x.w.text}${hint ? `<small>在${hint}</small>` : ''}</span><b>${p}</b></li>`;
    })
    .join('');
  $('wish-card').hidden = false;
  G.wishT = secs;
}

// (quietly: progress is a note after the stars for a moment; a wish come true is one toast and a
// lit star, nothing more covering the view)
function wishProgress(x) {
  $('hud-wish-note').textContent = `${x.w.short} ${x.p}/${wishes.need(x.w)}`;
  G.wishNoteT = 2.5;
}

function wishDone(x) {
  syncWishHud();
  $('hud-wish-note').textContent = '';
  hud.toast(`★ 心愿达成：${x.w.text}`);
  audio.comboChime(3);
}

function syncDexButton() {
  $('dex-num').textContent = `${dex.found}/${dex.total}`;
}

/** the counts on the title screen: today's challenge, the levels' stars, all stars, shards */
function syncTitleCounts() {
  const d = progress.daily, streak = progress.streak;
  $('daily-sub').textContent = `${dayLabel()} · 4 分钟` + (d ? ` · 今日最佳 ${fmt(d.size)}` : ' · 人人同一题') + (streak > 1 ? ` · 连续 ${streak} 天` : '');
  $('levels-sub').textContent = `★ ${progress.levelStars}/${LEVELS.length * 3}`;
  $('star-num').textContent = `★ ${totalStars()}`;
  $('shard-num').textContent = `${shards.count}/${shards.total}`;
}

// ---- panels: 关卡, 球皮 & 五色石碎片, 战绩图 -----------------------------------------------------
function openLevels() {
  $('levels-stars').textContent = `★ ${progress.levelStars}/${LEVELS.length * 3}`;
  $('level-list').innerHTML = LEVELS.map((L, i) => {
    const b = progress.levelBest(L.id), open = progress.levelOpen(i), n = b ? b.stars : 0;
    const best = !open ? '上一关拿到 ★ 才能玩' : b && b.score !== null ? `最佳 ${fmtScore(L, b.score)}` : b ? '还没过关' : '还没玩过';
    const need = `★ ${fmtScore(L, L.stars[0])} · ★★ ${fmtScore(L, L.stars[1])} · ★★★ ${fmtScore(L, L.stars[2])}`;
    return `<li><button data-i="${i}"${open ? '' : ' disabled'}><span class="ln">${i + 1}. ${L.name}</span><span class="ls">${'★'.repeat(n)}<i>${'★'.repeat(3 - n)}</i></span>` +
      `<span class="lt">${L.text}</span><span class="lb">${best} · ${need}</span></button></li>`;
  }).join('');
  $('levels').hidden = false;
}

const skinGeo = new Map();
function openSkins() {
  const stars = totalStars(), cur = currentSkin();
  $('skins-stars').textContent = `★ ${stars}`;
  const grid = $('skin-grid');
  grid.innerHTML = SKINS.map(k => {
    const open = skinOpen(k, stars, shards.count);
    const note = k === cur ? '使用中' : open ? '点一下换上' : k.shards ? `碎片 ${shards.count}/${k.shards}` : `★ ${stars}/${k.need} 解锁`;
    return `<button class="skin-card${k === cur ? ' on' : ''}${open ? '' : ' locked'}" data-id="${k.id}" title="${open ? '' : skinNeed(k)}"><canvas width="1" height="1"></canvas><b>${k.name}</b><small>${note}</small></button>`;
  }).join('');
  // their pictures, drawn the way the 图鉴 draws its things
  [...grid.children].forEach((b, i) => {
    const k = SKINS[i];
    if (!skinGeo.has(k.id)) {
      const g = buildCoreGeometry(k);
      g.computeBoundingSphere();
      skinGeo.set(k.id, g);
    }
    dex.draw({ spec: { geometry: skinGeo.get(k.id), center: { x: 0, y: 0, z: 0 } }, tint: null }, b.firstChild, 112, -0.5, true);
  });
  $('shards-count').textContent = `${shards.count}/${shards.total}`;
  $('shard-list').innerHTML = shards.hints().map(h => `<li class="${h.found ? 'found' : ''}">${h.found ? h.hint : '？？？'}</li>`).join('');
  $('skins').hidden = false;
}

/** 战绩图: the finished ball on a card, to save */
function openShare() {
  const r = G.result;
  if (!r) return;
  const c = shareCard({ ball: ballSnapshot(512), size: r.size, title: r.title, mode: r.mode, lines: r.lines, quote: r.quote, url: SITE });
  const url = c.toDataURL('image/png');
  $('share-img').src = url;
  $('share-dl').href = url;
  // (a page shown inside another one, like an Artifact, may not start downloads: long-press only)
  let framed = true;
  try { framed = window.self !== window.top; } catch {}
  $('share-dl').hidden = framed;
  $('share').hidden = false;
  audio.ui('open');
}

/** the finished ball, alone on a transparent square (for the 战绩图) */
function ballSnapshot(n) {
  const r = engine.renderer;
  const rt = new THREE.WebGLRenderTarget(n, n, { samples: 4 });
  rt.texture.colorSpace = THREE.SRGBColorSpace;
  const S = ball.displayS, dist = S * 2.3, c = ball.group.position;
  ballCam.position.set(c.x + dist * 0.3, c.y + S * 0.45, c.z + dist);
  ballCam.lookAt(c);
  ballCam.aspect = 1;
  ballCam.near = dist * 0.05;
  ballCam.far = dist * 6;
  ballCam.updateProjectionMatrix();
  const bd = ballCam.userData.backdrop;
  bd.visible = false;
  ballCam.updateMatrixWorld(true);
  const prev = r.getRenderTarget(), cc = r.getClearColor(new THREE.Color()).getHex(), ca = r.getClearAlpha();
  const fog = engine.scene.fog;
  engine.scene.fog = null;
  r.setRenderTarget(rt);
  r.setClearColor(0x000000, 0);
  r.clear();
  r.render(engine.scene, ballCam);
  const px = new Uint8Array(n * n * 4);
  r.readRenderTargetPixels(rt, 0, 0, n, n, px);
  r.setRenderTarget(prev);
  r.setClearColor(cc, ca);
  engine.scene.fog = fog;
  bd.visible = true;
  rt.dispose();
  const cv = document.createElement('canvas');
  cv.width = cv.height = n;
  const ctx = cv.getContext('2d');
  const img = ctx.createImageData(n, n), row = n * 4;
  for (let y = 0; y < n; y++) img.data.set(px.subarray((n - 1 - y) * row, (n - y) * row), y * row);
  ctx.putImageData(img, 0, 0);
  return cv;
}

function showTouch(on) {
  const touch = isTouch();
  $('touch-zone').hidden = !(on && touch);
  $('touch-dash').hidden = !(on && touch);
}

// ---- UI wiring -------------------------------------------------------------------------------

function applyAudioPrefs() {
  const music = store.get('music', true), sfx = store.get('sfx', true);
  audio.setVolume('music', music ? 0.6 : 0);
  audio.setVolume('sfx', sfx ? 0.9 : 0);
}

function setupUI() {
  $('btn-timed').addEventListener('click', () => startGame('timed'));
  $('btn-daily').addEventListener('click', () => startGame('daily'));
  $('btn-rivals').addEventListener('click', () => startGame('rivals'));
  $('btn-levels').addEventListener('click', openLevels);
  $('btn-skins').addEventListener('click', openSkins);
  $('btn-shards').addEventListener('click', openSkins);
  $('levels-close').addEventListener('click', () => ($('levels').hidden = true));
  $('skins-close').addEventListener('click', () => ($('skins').hidden = true));
  $('level-list').addEventListener('click', e => {
    const b = e.target.closest('button');
    if (b && !b.disabled) startGame('level', LEVELS[+b.dataset.i].id);
  });
  $('skin-grid').addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b || b.classList.contains('locked')) return;
    store.set('skin', b.dataset.id);
    ball.setSkin(skinById(b.dataset.id));
    audio.ui('click');
    openSkins();
  });
  $('btn-share').addEventListener('click', openShare);
  $('share-close').addEventListener('click', () => ($('share').hidden = true));
  $('btn-next').addEventListener('click', () => {
    const i = LEVELS.indexOf(G.level);
    if (i >= 0 && LEVELS[i + 1]) startGame('level', LEVELS[i + 1].id);
  });
  // 女娲 talking: poke her picture and she answers back
  $('dialog-portrait').addEventListener('pointerdown', e => {
    if (G.state !== 'play' || dialog.blocking) return;
    e.stopPropagation();
    dialog.interrupt(story.POKES[Math.floor(Math.random() * story.POKES.length)]);
    audio.babble('nuwa');
    const p = $('dialog-portrait');
    p.classList.remove('poked');
    void p.offsetWidth;
    p.classList.add('poked');
  });
  // the title letters: each one hops and plays a note when tapped
  document.querySelectorAll('.logo span').forEach((sp, i) => sp.addEventListener('pointerdown', async () => {
    try { await audio.init(); applyAudioPrefs(); } catch {}
    audio.pickup('glass', 0.12, 0.05, 1 + i * 2);
    sp.classList.remove('hop');
    void sp.offsetWidth;
    sp.classList.add('hop');
  }));
  $('btn-dex').addEventListener('click', () => dex.open(syncDexButton));
  $('hud-count').addEventListener('click', () => {
    if (G.state !== 'play' || !G.rules.wishes) return;
    if ($('wish-card').hidden) showWishes(5);
    else {
      $('wish-card').hidden = true;
      G.wishT = 0;
    }
  });
  $('res-dex-open').addEventListener('click', () => dex.open());
  $('btn-free').addEventListener('click', () => startGame('free'));
  const q = $('sel-quality');
  q.value = engine.quality;
  q.addEventListener('change', () => {
    engine.setQuality(q.value);
    store.set('quality', q.value);
  });
  // power saving (30 frames a second): on by default on phones, which warm up over a long game
  const save = $('chk-save');
  save.checked = store.get('powersave', isTouch() && Math.min(screen.width, screen.height) < 700);
  G.fpsCap = save.checked ? 30 : 60;
  save.addEventListener('change', () => {
    store.set('powersave', save.checked);
    G.fpsCap = save.checked ? 30 : 60;
  });
  const cm = $('chk-music'), cs = $('chk-sfx');
  cm.checked = store.get('music', true);
  cs.checked = store.get('sfx', true);
  cm.addEventListener('change', () => { store.set('music', cm.checked); applyAudioPrefs(); });
  cs.addEventListener('change', () => { store.set('sfx', cs.checked); applyAudioPrefs(); });
  $('btn-pause').addEventListener('click', () => togglePause());
  // a finger on the screen means a touch screen, whatever the browser said: joystick and dash button now
  addEventListener('touchstart', () => {
    G.touchScreen = true;
    if (G.state === 'play' && $('touch-dash').hidden) showTouch(true);
  }, { passive: true });
  $('btn-sound').addEventListener('click', async () => {
    // silent because it never got going (or was muted): switch it on; otherwise mute
    if (!audio.running || audio.muted) {
      try { await audio.init(); } catch {}
      audio.setMuted(false);
      await audio.resume();
    } else audio.setMuted(true);
    syncSoundButton();
  });
  $('minimap-btn').addEventListener('click', () => {
    if (!input.justSwiped() && G.state === 'play') togglePause(true);
  });
  const mapTab = whole => {
    G.mapWhole = whole;
    $('map-all').setAttribute('aria-pressed', String(whole));
    $('map-near').setAttribute('aria-pressed', String(!whole));
    drawPauseMap();
  };
  $('map-all').addEventListener('click', () => mapTab(true));
  $('map-near').addEventListener('click', () => mapTab(false));
  addEventListener('resize', () => {
    G.redraw = true;
    drawPauseMap();
  });
  $('btn-resume').addEventListener('click', () => togglePause(false));
  // show the controls again: the thumb hints on a touch screen, the keys line otherwise
  $('btn-help').addEventListener('click', () => {
    resetTips(true);
    if (!G.touchScreen) hud.showKeys();
    togglePause(false);
  });
  $('btn-restart').addEventListener('click', () => { $('pause').hidden = true; startGame(G.mode, G.level && G.level.id); });
  $('btn-home').addEventListener('click', () => { $('pause').hidden = true; audio.music(null); resetGame('timed'); enterTitle(); });
  $('btn-finish').addEventListener('click', () => { togglePause(false); startFinale(); });
  $('btn-patch').addEventListener('click', () => { if (G.state === 'play') startFinale(); });
  $('btn-again').addEventListener('click', () => { $('results').hidden = true; startGame(G.mode, G.level && G.level.id); });
  $('btn-keep').addEventListener('click', keepRolling);
  $('btn-copy').addEventListener('click', () => {
    const text = $('res-brag').textContent;
    const done = () => ($('btn-copy').textContent = '已复制');
    const fallback = () => {
      const r = document.createRange();
      r.selectNodeContents($('res-brag'));
      const sel = getSelection();
      sel.removeAllRanges();
      sel.addRange(r);
      $('btn-copy').textContent = '已选中，按 Ctrl/⌘+C';
    };
    try {
      navigator.clipboard.writeText(text).then(done, fallback);
    } catch {
      fallback();
    }
  });
  $('btn-title').addEventListener('click', () => { $('results').hidden = true; audio.music(null); resetGame('timed'); enterTitle(); });
  input.onKey = code => {
    if (G.state === 'intro' && (code === 'Space' || code === 'Enter')) dialog.advance();
    if (G.state === 'intro' && code === 'Escape') {
      dialog.clear();
      beginPlay();
      return;
    }
    if (code === 'Escape' || code === 'KeyP') {
      if (G.state === 'play' || G.state === 'pause') togglePause();
    }
    if (G.state === 'play' && code === 'KeyC') rig.cycleZoom();
    if (code === 'KeyM') { const on = audio.toggleMusic(); store.set('music', on); $('chk-music').checked = on; }
  };
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      if (G.state === 'play') togglePause(true);
      audio.suspend();
    } else if (G.state !== 'pause') audio.resume();
  });
  $('game').addEventListener('pointerdown', () => {
    if (G.state === 'intro') dialog.advance();
  });
  // any first gesture wakes the audio (title music)
  const wake = async () => {
    window.removeEventListener('pointerdown', wake);
    try { await audio.init(); applyAudioPrefs(); if (G.state === 'title') audio.music('title'); } catch {}
  };
  window.addEventListener('pointerdown', wake);
}

function syncSoundButton() {
  const off = !audio.running || audio.muted;
  const b = $('btn-sound');
  b.classList.toggle('off', off);
  b.setAttribute('aria-label', off ? '打开声音' : '静音');
}

function drawPauseMap() {
  if (G.state !== 'pause') return;
  maps.drawBig($('bigmap'), ball, G.mapWhole);
  $('lg-red').hidden = G.mapWhole;
}

function togglePause(force) {
  const on = force !== undefined ? force : G.state !== 'pause';
  if (on && G.state === 'play') {
    G.state = 'pause';
    G.redraw = true;
    $('pause').hidden = false;
    drawPauseMap();
    $('btn-finish').hidden = !G.rules.finale || (G.mode !== 'free' && ball.S < story.SKY_GOAL);
    audio.ui('pause');
    audio.suspend();
  } else if (!on && G.state === 'pause') {
    G.state = 'play';
    $('pause').hidden = true;
    audio.resume();
    lastT = performance.now() / 1000;
  }
}

// ---- main loop -------------------------------------------------------------------------------

// Frame pacing, to keep phones cool: paused, nothing moves, so the scene is drawn once and then left
// alone; the title and results screens (slow camera drift) and the power-saving mode (G.fpsCap = 30)
// run on every other screen refresh.
let oddFrame = false;
function loop() {
  requestAnimationFrame(loop);
  if (dex && dex.isOpen) {
    // the 图鉴 covers the screen: the game isn't drawn, just the 图鉴's pictures
    const now = performance.now() / 1000;
    dex.pump(Math.min(0.1, now - lastT));
    lastT = now;
    return;
  }
  if (G.state === 'pause' && !G.redraw) return;
  const slow = G.fpsCap === 30 || G.state === 'title' || G.state === 'results';
  if (slow && (oddFrame = !oddFrame)) return;
  G.redraw = false;
  const now = performance.now() / 1000;
  const raw = now - lastT;
  let dt = Math.min(0.05, Math.max(0, raw));
  lastT = now;
  if (G.state === 'pause') dt = 0;
  G.t += dt;
  if (G.atlasStale && G.state !== 'play' && G.state !== 'finale') {
    G.atlasStale = false;
    repaintAtlas();
  }
  step(dt);
  render(dt);
  adaptResolution(raw);
  // coarse stand-ins asked for since the last frame (assets.js), a couple of milliseconds' worth
  if (!pumpCoarse(G.state === 'play' || G.state === 'finale' ? 2 : 5) && window.__boot && !window.__boot.coarse) window.__boot.coarse = performance.now();
}

// ---- adaptive resolution: trade sharpness for frame rate on slow devices ------------------------
// Every 2 s of play: under ~45 fps (~22 in power-saving mode), render fewer pixels (down to 60 %);
// if that didn't help, the GPU wasn't the bottleneck (or the display is capped at 30 Hz), so undo it
// and stop trying. Back up again after a while at a solid 60 (30).
const perf = { acc: 0, n: 0, good: 0, prev: 0, lock: false, fps: 0, slow: 0 };
function adaptResolution(raw) {
  if (G.state !== 'play' || raw <= 0 || raw > 0.25) return;
  perf.acc += raw;
  perf.n++;
  if (perf.acc < 2) return;
  const avg = perf.acc / perf.n;
  perf.acc = perf.n = 0;
  perf.fps = 1 / avg;
  const k = engine.scale;
  if (perf.prev && avg > perf.prev * 0.92) {
    // the last step down bought nothing
    perf.prev = 0;
    perf.lock = true;
    engine.setScale(Math.min(1, k / 0.85));
    return;
  }
  perf.prev = 0;
  const cap = G.fpsCap === 30 ? 2 : 1; // screen refreshes per frame
  // still slow at the lowest resolution: once, say what else helps (as 穿越火线 does)
  if (k <= 0.61 && avg > cap / 40 && G.time > 20 && !G.fpsHinted && (engine.quality !== 'low' || G.fpsCap !== 30)) {
    if (++perf.slow >= 3) {
      G.fpsHinted = true;
      hud.toast('画面有点卡？回开始页把画质调低、勾上「省电」，会顺一些');
    }
  } else perf.slow = 0;
  if (avg > cap / 45 && !perf.lock && k > 0.61) {
    perf.prev = avg;
    perf.good = 0;
    engine.setScale(Math.max(0.6, k * 0.85));
  } else if (avg < cap / 57 && k < 1) {
    if (++perf.good >= 3) {
      perf.good = 0;
      engine.setScale(Math.min(1, k / 0.85));
    }
  } else perf.good = 0;
}

function hourFor() {
  if (G.debugHour !== undefined) return G.debugHour;
  if (G.state === 'finale' || G.state === 'results') return sky.hour;
  if (G.state === 'title' || G.state === 'intro') return 9.2;
  if (G.rules.seconds) return 9.2 + (Math.min(G.time, G.rules.seconds) / G.rules.seconds) * 9.4;
  const cyc = (G.time / 960) % 1; // 16 min day in free mode
  return 8 + cyc * 13;
}

// ---- twinkles over the best things the ball can take right now -------------------------------
// Small things blur into the ground; the few most worth having (big for their distance, in view)
// twinkle, so the player can see what to go for.
const glints = { t: 0, list: [], cands: [] };
function updateGlints(dt) {
  if (G.state !== 'play') {
    glints.list.length = 0;
    return;
  }
  const S = ball.S;
  glints.t -= dt;
  if (glints.t <= 0) {
    glints.t = 0.3;
    const limit = ball.pickLimit();
    const cam = engine.camera.position;
    const vx = Math.sin(rig.yaw), vz = -Math.cos(rig.yaw);
    const picks = [];
    for (const o of world.grid.query(ball.pos.x, ball.pos.z, Math.max(1.2, S * 12), glints.cands, S / 90)) {
      if (o.state !== 0 || o.size > limit || o.size < S * 0.15 || G.t < o.noPickUntil || (ball.canPick && !ball.canPick(o))) continue;
      if ((o.x - cam.x) * vx + (o.z - cam.z) * vz < 0) continue; // behind the camera
      o.glintV = o.size ** 1.5 / (Math.hypot(o.x - ball.pos.x, o.z - ball.pos.z) + S);
      picks.push(o);
    }
    picks.sort((a, b) => b.glintV - a.glintV);
    glints.list = picks.slice(0, 4);
  }
  for (const o of glints.list) {
    if (o.state !== 0 || Math.random() > dt * 4) continue;
    const j = () => (Math.random() - 0.5) * 1.2;
    fx.glint(o.centerX() + j() * o.hw, o.y + o.bob + o.h, o.centerZ() + j() * o.hd, o.size, S);
  }
  // a 五色石碎片 not found yet twinkles from a good way off, big enough to see
  for (const o of shards.objs) {
    if (!o || o.state !== 0 || Math.random() > dt * 6) continue;
    if (Math.hypot(o.x - ball.pos.x, o.z - ball.pos.z) > Math.max(14, S * 30)) continue;
    const j = () => (Math.random() - 0.5) * 1.4;
    fx.glint(o.centerX() + j() * o.hw, o.y + o.h * (0.5 + Math.random() * 0.6), o.centerZ() + j() * o.hd, Math.max(o.size, S * 0.25), S);
  }
}

// ---- where the thumbs go (touch screens) -------------------------------------------------------
// New players get shown, once: the left thumb (press and drag: a stick appears under it) right at
// the start, then the right one swiping across the screen, which turns the view (and the ball with
// it) while the left keeps rolling. That second one comes back when a player who never swiped keeps
// steering hard to the side (turning with the stick alone is clumsy). Using each control once
// puts its hint away for good; 操作说明 in the pause menu shows them again.
const tips = { stick: null, swipe: null, stickT: 0, held: 0, shown: 0, cd: 7, side: 0, t: 0 };
function resetTips(forget = false) {
  if (forget) {
    tips.stick = tips.swipe = false;
    store.set('stickLearned', false);
    store.set('swipeLearned', false);
    input.lookDist = 0;
  }
  Object.assign(tips, { stickT: 0, held: 0, shown: 0, cd: forget ? 3.5 : 7, side: 0, t: 0 });
}
function touchHints(dt, raw) {
  const sh = $('stick-hint'), sw = $('swipe-hint');
  if (tips.stick === null) {
    tips.stick = store.get('stickLearned', false);
    tips.swipe = store.get('swipeLearned', false);
  }
  if (!G.touchScreen) {
    if (!sh.hidden) sh.hidden = true;
    if (!sw.hidden) sw.hidden = true;
    return;
  }
  // left thumb: until the stick has been pushed for a moment
  if (!tips.stick) {
    if (raw.stick && raw.stick.m > 0.3) tips.held += dt;
    if (tips.held > 0.6) {
      tips.stick = true;
      store.set('stickLearned', true);
    }
    tips.stickT += dt;
  }
  const stickOn = !tips.stick && tips.stickT > 1;
  if (sh.hidden === stickOn) sh.hidden = !stickOn;
  // right thumb
  if (tips.swipe) {
    if (!sw.hidden) sw.hidden = true;
    return;
  }
  if (input.lookDist > 60) {
    tips.swipe = true;
    store.set('swipeLearned', true);
    if (!sw.hidden) {
      sw.hidden = true;
      hud.toast('就是这样！边滚边滑，镜头跟着转');
    }
    return;
  }
  const s = raw.stick;
  if (s && Math.abs(s.a) > 0.8 && Math.abs(s.a) < 2.28) tips.side += dt;
  else tips.side = Math.max(0, tips.side - dt * 0.5);
  if (!sw.hidden) {
    tips.t -= dt;
    if (tips.t <= 0) sw.hidden = true;
    return;
  }
  tips.cd -= dt;
  if (stickOn || tips.cd > 0 || tips.shown >= 3) return;
  // first time a few seconds in (once the stick is going), later when steering hard to the side
  if (tips.shown === 0 || tips.side > 1.2) {
    tips.shown++;
    tips.side = 0;
    tips.t = 6;
    tips.cd = 30;
    sw.hidden = false;
  }
}

// ---- where there's still something to roll up ------------------------------------------------
// Late in a game everything near the ball can be too big to take. When the ball has about stopped
// growing (or nothing at all was rolled up for a few seconds) and there's nothing worth taking right
// by it, a gold arrow next to it points the way to the nearest thing that is (the first time, 女娲
// says what it means), and the thing itself, once in view, reads 「能滚」. Rolling up bits too
// small to matter doesn't count as growing.
const food = { t: 0, target: null, cands: [], said: false };
const _fa = new THREE.Vector3();
function foodPointer(dt) {
  const el = $('food-arrow');
  food.t -= dt;
  if (food.t <= 0) {
    food.t = 0.5;
    food.target = null;
    const S = ball.S, limit = ball.pickLimit();
    // (G.sizes: the size once a second, the last 6 s)
    const stalled = G.sizes.length >= 7 && S < G.sizes[0] * 1.03;
    if ((G.idleT > 4 || stalled) && G.time > 15) {
      let best = null, bd = Infinity;
      for (const R of [S * 8, S * 25, S * 80, 6000]) {
        for (const o of world.grid.query(ball.pos.x, ball.pos.z, R, food.cands, limit * 0.1)) {
          if (o.state !== 0 || o.size > limit || o.size < limit * 0.12 || G.t < o.noPickUntil || (ball.canPick && !ball.canPick(o))) continue;
          const d = Math.hypot(o.x - ball.pos.x, o.z - ball.pos.z);
          if (d < bd) {
            bd = d;
            best = o;
          }
        }
        if (best) break;
      }
      if (best && bd > S * 1.2 + ball.r) food.target = best;
    }
  }
  const o = food.target, markEl = $('food-mark');
  let show = false, mark = false;
  if (o && o.state === 0) {
    // round the ball on screen, towards it (up is ahead, as on the stick), clear of the ball
    const cam = engine.camera, W = innerWidth, H = innerHeight, top = W < 640 ? 215 : 130;
    _fa.copy(ball.group.position).project(cam);
    const bx = ((_fa.x + 1) / 2) * W, by = ((1 - _fa.y) / 2) * H;
    _fa.set(ball.pos.x, ball.group.position.y + ball.displayS / 2, ball.pos.z).project(cam);
    const rr = Math.abs(by - ((1 - _fa.y) / 2) * H);
    const rel = Math.atan2(o.centerX() - ball.pos.x, -(o.centerZ() - ball.pos.z)) - rig.yaw;
    const ux = Math.sin(rel), uy = -Math.cos(rel), r = Math.min(rr + 64, H * 0.32);
    // (and clear of the minimap in the top right corner)
    const ax = Math.min(W - 60, Math.max(60, bx + ux * r));
    const ay = Math.min(H - 170, Math.max(top + (ax > W - 150 ? 100 : 40), by + uy * r));
    el.style.transform = `translate(${ax}px, ${ay}px)`;
    el.firstElementChild.nextElementSibling.style.transform = `rotate(${Math.atan2(uy, ux)}rad)`;
    el.classList.toggle('up', uy < -0.3);
    show = true;
    // and over the thing itself, once it's in view (then the arrow needs no words)
    _fa.set(o.centerX(), o.y + o.bob + o.h, o.centerZ()).project(cam);
    const mx = ((_fa.x + 1) / 2) * W, my = ((1 - _fa.y) / 2) * H;
    if (_fa.z < 1 && mx > 30 && mx < W - 30 && my > top && my < H - 20) {
      markEl.style.transform = `translate(${mx}px, ${my}px)`;
      mark = true;
    }
    el.classList.toggle('bare', mark);
    if (!food.said && !dialog.active) {
      food.said = true;
      dialog.say('附近都滚不动了？跟着金色箭头走，那边还有能滚的！');
    }
  }
  if (el.hidden === show) el.hidden = !show;
  if (markEl.hidden === mark) markEl.hidden = !mark;
}

// ---- things a wish wants, close by -------------------------------------------------------------
// So the wishes aren't forgotten: a little gold star over the nearest few things close by that
// count for one and can be rolled up now (the nearest one reads 「★ 心愿」), and a word under the
// HUD's stars when one shows up (once in a while for each wish).
const wishNear = { t: 0, list: [], wish: null, cands: [], found: [], said: new Map() };
// a 关卡's own targets get the stars too: the cats, the dancing aunties
const CAT_MARK = { label: '★ 猫' }, AUNTIE_MARK = { label: '★ 大妈' };
function levelWants(o) {
  if (!G.level) return null;
  if (G.level.score === 'cats' && o.spec.id.startsWith('cat_')) return CAT_MARK;
  if (G.dancers && G.dancers.has(o)) return AUNTIE_MARK;
  return null;
}
const _wm = new THREE.Vector3();
function wishMarks(dt) {
  if ((wishNear.t -= dt) <= 0) {
    wishNear.t = 0.3;
    const list = wishNear.list, found = wishNear.found;
    list.length = found.length = 0;
    if (wishes.list.some(x => !x.done) || G.level) {
      const S = ball.S, limit = ball.pickLimit(), R = Math.max(1.5, S * 12);
      for (const o of world.grid.query(ball.pos.x, ball.pos.z, R, wishNear.cands, S / 90)) {
        // (not what's too small to be drawn any more, see world.cullTiny)
        if (o.state !== 0 || o.size > limit || G.t < o.noPickUntil || o.spec.maxDim <= S / 220) continue;
        const x = levelWants(o) || wishes.wants(o);
        if (x) found.push({ o, x, d: Math.hypot(o.x - ball.pos.x, o.z - ball.pos.z) });
      }
      found.sort((a, b) => a.d - b.d);
      for (let i = 0; i < Math.min(3, found.length); i++) list.push(found[i].o);
      wishNear.wish = found.length ? found[0].x : null;
      const label = (wishNear.wish && wishNear.wish.label) || '★ 心愿';
      const first = $('wish-marks').firstChild.firstChild;
      if (first.textContent !== label) first.textContent = label;
    }
  }
  const marks = $('wish-marks').children, W = innerWidth, H = innerHeight;
  // (not up among the gauges along the top of the screen)
  const top = W < 640 ? 215 : 130;
  for (let i = 0; i < marks.length; i++) {
    const o = wishNear.list[i], el = marks[i];
    let show = false;
    if (o && o.state === 0) {
      _wm.set(o.centerX(), o.y + o.bob + o.h, o.centerZ()).project(engine.camera);
      const x = ((_wm.x + 1) / 2) * W, y = ((1 - _wm.y) / 2) * H;
      if (_wm.z < 1 && x > 20 && x < W - 20 && y > top && y < H - 20) {
        el.style.transform = `translate(${x}px, ${y}px)`;
        show = true;
      }
    }
    if (el.hidden === show) el.hidden = !show;
    // the first time in a while that one of this wish's things shows: say so under the stars
    if (show && i === 0 && wishNear.wish && wishNear.wish.w) {
      const x = wishNear.wish, last = wishNear.said.get(x.w.id);
      if (last === undefined || G.time - last > 25) {
        wishNear.said.set(x.w.id, G.time);
        $('hud-wish-note').textContent = `附近有${x.w.short}`;
        G.wishNoteT = 3;
      }
    }
  }
}

// ---- what the ball is about to run into ------------------------------------------------------
// Looks about 1.6 s ahead, both where the stick points and where the ball is actually rolling (it
// curves from one to the other). The first few things in the way that the ball can't take flash
// red, whatever their size (materials.js): small ones all over, and for the nearest big one (a
// wall, a tree, a house) the part the ball would hit. So a bump never comes out of nowhere, even
// where things stand close together.
const warn = { list: [], spot: null, a: 0, hits: [], hits2: [] };
function updateWarning(dt, inp) {
  const sp = ball.speed(), vmax = ball.maxSpeed();
  const pushing = inp.dir !== null && inp.m > 0.2;
  const v = Math.max(sp, pushing ? vmax * inp.m : 0) * (ball.dashT > 0 ? 1.85 : 1);
  const dist = Math.max(ball.S * 2.5, v * 1.6 + ball.r);
  const n1 = pushing ? ball.ahead(inp.dir, dist, warn.hits) : 0;
  const n2 = sp > vmax * 0.15 ? ball.ahead(Math.atan2(ball.vel.x, -ball.vel.z), dist, warn.hits2) : 0;
  const all = warn.hits.slice(0, n1);
  for (const h of warn.hits2.slice(0, n2)) if (!all.some(a => a.o === h.o)) all.push(h);
  all.sort((a, b) => a.dist - b.dist);
  edgeWarning(all[0], v);
  obstacleTag(all[0], v);
  warn.list.length = 0;
  let spot = null;
  for (const h of all.slice(0, 3)) {
    warn.list.push(h.o);
    if (!spot && Math.max(h.o.hw, h.o.hd) * 2 > ball.S * 2.5) spot = h;
  }
  if (spot) {
    warn.spot = spot.o;
    warn.a = Math.min(1, warn.a + dt / 0.15);
    MU.warnPos.value.set(spot.x, spot.y, spot.z);
  } else {
    warn.a = Math.max(0, warn.a - dt / 0.35);
    if (!warn.a) warn.spot = null;
  }
  MU.warn.value = warn.a;
  MU.warnR.value = ball.S * 1.3;
  MU.warnH.value = ball.S * 2.2;
}

// the nearest thing about to be hit is off screen (rolling sideways, the view still turning round):
// a red "!" at the screen edge that way
const _ew = new THREE.Vector3();
function edgeWarning(h, v) {
  const el = $('edge-warn');
  let show = false;
  if (h && h.dist < v * 1.1 + ball.r) {
    _ew.set(h.x, Math.max(h.y, ball.r), h.z).project(engine.camera);
    const behind = _ew.z > 1;
    let x = behind ? -_ew.x : _ew.x, y = behind ? -_ew.y : _ew.y;
    if (behind || Math.abs(x) > 0.92 || Math.abs(y) > 0.92) {
      const k = 1 / Math.max(Math.abs(x), Math.abs(y), 1e-6);
      x *= k;
      y *= k;
      const W = innerWidth, H = innerHeight, m = 34;
      el.style.transform = `translate(${m + ((x + 1) / 2) * (W - 2 * m)}px, ${m + ((1 - y) / 2) * (H - 2 * m)}px)`;
      show = true;
    }
  }
  if (el.hidden === show) el.hidden = !show;
}

// ...and on it, when it's about a second away, a tag saying so in words, with the size the ball has to
// reach: red stripes alone are easy to forget the meaning of
const _wt = new THREE.Vector3();
let tagFor = null;
function obstacleTag(h, v) {
  const el = $('warn-tag');
  let show = false;
  if (h && h.dist < v * 1.3 + ball.r) {
    const o = h.o, big = Math.max(o.hw, o.hd) * 2 > ball.S * 2.5;
    // over the thing itself, or over the part the ball would hit if it's a big one
    const top = Math.min(o.y + o.bob + o.h, h.y + ball.S * 1.3);
    if (big) _wt.set(h.x, top, h.z);
    else _wt.set(o.centerX(), top, o.centerZ());
    _wt.project(engine.camera);
    if (_wt.z < 1 && Math.abs(_wt.x) < 1 && Math.abs(_wt.y) < 1) {
      const W = innerWidth, H = innerHeight;
      // (kept below the gauges along the top of the screen)
      const x = Math.min(W - 70, Math.max(70, ((_wt.x + 1) / 2) * W));
      const y = Math.max(W < 640 ? 215 : 130, ((1 - _wt.y) / 2) * H - 10);
      el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -100%)`;
      if (tagFor !== o) {
        tagFor = o;
        $('warn-need').textContent = `要 ${fmt(o.size / PICK_RATIO)}`;
      }
      show = true;
    }
  }
  if (el.hidden === show) el.hidden = !show;
}

/** what to draw this frame, and where the sun's shadow frustum sits */
function updateView(S) {
  const focus = G.state === 'play' || G.state === 'pause' || G.state === 'finale' ? ball.group.position : rig.look;
  const shadowR = Math.max(3, S * 16);
  // screen pixels covered by 1 m at 1 m: things are drawn while they cover about two pixels, and
  // keep their full model while the smallest parts it has over the stand-in cover one or two
  const cam = engine.camera;
  const F = engine.height / (2 * Math.tan((cam.fov * Math.PI) / 360));
  const det = engine.q.detail;
  ball.lodK = ((LOD_PART * F) / 1.5) * det;
  ball.coarseK = G.noCoarse ? Infinity : ((LOD_COARSE * F) / 1.5) * det;
  ball.lodDist = cam.position.distanceTo(ball.group.position) - ball.displayS * 0.25;
  rivals.view(cam, ball.lodK, ball.coarseK);
  STUCK.max = engine.q.stuck;
  // beyond 2 fog lengths everything is >98 % fog: don't draw it
  // gold edges / red stripes on what the ball can and can't take yet (see world.js highlight)
  const hi = G.state === 'play' || G.state === 'pause' ? G.hi || (G.hi = {}) : null;
  if (hi) {
    Object.assign(hi, { limit: ball.pickLimit(), S: ball.S, x: ball.pos.x, z: ball.pos.z, t: G.t, red: 0, warn: warn.list, spot: warn.spot, only: G.rules.only || null });
    MU.hiStripe.value = 1 / (hi.limit * 0.45);
  }
  G.drawn = world.updateVisibility(cam, 2 / engine.scene.fog.density, (F / 2) * det, ball.lodK, ball.coarseK, focus, engine.q.shadows ? shadowR * 1.25 : 0, hi);
  engine.updateShadow(focus, shadowR);
}

const NO_INPUT = { dir: null, m: 0, quick: false, hold: false, turnImpulse: 0, dash: false };
function step(dt) {
  const raw = input.poll();
  // (while counting down the ball waits, but the view can still be turned)
  const counting = G.state === 'play' && G.cd > 0.2;
  const inp = G.state === 'play' ? driver.update(raw, rig.yaw, ball.heading, dt, ball.speed() > ball.maxSpeed() * 0.3) : { ...NO_INPUT };
  if (G.autopilot && G.state === 'play') Object.assign(inp, autopilot(dt));
  if (counting) Object.assign(inp, { dir: null, m: 0, dash: false });
  G.events.length = 0;

  if (G.state === 'play' && G.rules.countdown && G.cd > -0.5) countdown(dt, raw, inp);
  if (G.state === 'play') {
    if (!counting) G.time += dt;
    // mouse drags turn the view (and so where "up" on the stick / W goes)
    rig.yaw += inp.turnImpulse;
    rig.quick = inp.quick;
    rig.hold = !!inp.hold;
    touchHints(dt, raw);
    if ((G.sizeT -= dt) <= 0) {
      G.sizeT = 1;
      G.sizes.push(ball.S);
      if (G.sizes.length > 7) G.sizes.shift();
    }
    foodPointer(dt);
    wishMarks(dt);
    ball.update(dt, inp, G.t, G.events);
    updateWarning(dt, inp);
    if (rivals.active) rivalEvents(rivals.update(counting ? 0 : dt, G.t, ball));
    if (G.rules.seconds && !counting) {
      const left = G.rules.seconds - G.time;
      if (left <= Math.min(60, G.rules.seconds / 4) && !G.hurry) { G.hurry = true; audio.setHurry(true); dialog.interrupt(story.hurryLine(left)); }
      if (left <= 10) {
        const s = Math.ceil(left);
        if (s !== G.tickSec && s > 0) { G.tickSec = s; audio.tick(s); }
      }
      if (left <= 0) timeUp();
    }
    if (G.level && G.state === 'play') levelGoals();
    if (G.rules.ghost && !counting) ghostSplits(dt);
    // bounds: soft wall far out
    const d = Math.hypot(ball.pos.x, ball.pos.z);
    if (d > layout.bounds) {
      ball.pos.x *= layout.bounds / d;
      ball.pos.z *= layout.bounds / d;
    }
  } else if (G.state === 'outro') {
    // a 关卡 or 对手赛 is over: the ball rolls to a stop, then the results
    ball.update(dt, NO_INPUT, G.t, G.events);
    if ((G.outro -= dt) <= 0) showRoundResults();
  } else if (G.state === 'title' || G.state === 'intro' || G.state === 'results') {
    ball.updateVisual(dt, G.t);
  }
  if (G.state !== 'play') {
    edgeWarning(null, 0);
    obstacleTag(null, 0);
    if (!$('swipe-hint').hidden) $('swipe-hint').hidden = true;
    if (!$('stick-hint').hidden) $('stick-hint').hidden = true;
    if (!$('wish-card').hidden) $('wish-card').hidden = true;
    if (!$('food-arrow').hidden) $('food-arrow').hidden = true;
    if (!$('food-mark').hidden) $('food-mark').hidden = true;
    for (const el of $('wish-marks').children) if (!el.hidden) el.hidden = true;
    for (const el of $('rival-tags').children) if (!el.hidden) el.hidden = true;
    if (!$('countdown').hidden && G.state !== 'pause') $('countdown').hidden = true;
  }

  if (G.state !== 'pause') {
    movers.update(dt, G.t, ball, G.events);
    world.updateFlyers(dt);
  }
  handleEvents();
  if (G.state === 'play') {
    checkMilestones();
    if (G.rules.finale && ball.S >= story.SKY_GOAL && $('btn-patch').hidden) {
      // (timed: finishing before the clock runs out is the player's call)
      $('btn-patch').firstChild.textContent = G.mode === 'free' ? '去补天 ' : '提前补天 ';
      $('btn-patch').classList.toggle('timed', G.mode !== 'free');
      $('btn-patch').hidden = false;
    }
    if (G.mode === 'free' && ball.S >= story.SKY_GOAL) {
      // nearly nothing left out there: say so, once
      if (!G.rolledOut && (G.rolledT -= dt) <= 0) {
        G.rolledT = 3;
        let left = 0;
        for (const o of world.objects) if (o.state === 0) left++;
        if (left < world.objects.length * 0.03) {
          G.rolledOut = true;
          dialog.interrupt(story.ALL_ROLLED);
          $('btn-patch').classList.add('urge');
        }
      }
    }
    for (const x of wishes.check(ball.combo.n, ball.S)) wishDone(x);
    if (G.wishT > 0 && (G.wishT -= dt) <= 0) $('wish-card').hidden = true;
    if (G.wishNoteT > 0 && (G.wishNoteT -= dt) <= 0) $('hud-wish-note').textContent = '';
    // a nudge from 女娲 when nothing has been rolled up for a while
    G.idleT += dt;
    G.nudgeCd -= dt;
    if (G.idleT > 14 && G.nudgeCd <= 0 && !dialog.active) {
      G.nudgeCd = 35;
      dialog.say(story.NUDGES.find(n => ball.S < n[0])[1]);
    }
  }
  if (G.state === 'finale') updateFinale(dt);
  if (G.state === 'title') titleShot(G.t);
  dialog.update(dt);

  // world upkeep
  G.cullT -= dt;
  if (G.cullT <= 0) {
    G.cullT = 0.5;
    world.cullTiny(ball.S);
  }
  const S = ball.displayS;
  // (the rolling itself makes no sound: the music and the pops of things rolled up carry it)
  if (G.state === 'play') {
    const sp = ball.speed() / ball.maxSpeed();
    if (sp > 0.25) fx.dust(ball.pos.x, ball.pos.z, S, sp * dt * 6, ball.heading);
  }
  const g = layout.groups.dance;
  if (g && !movers.danceStopped && G.state !== 'title') {
    const dd = Math.hypot(ball.pos.x - g.x, ball.pos.z - g.z);
    const reach = 70 + S * 6;
    audio.squareDance(Math.max(0, 1 - dd / reach) ** 1.6);
  } else audio.squareDance(0);
  if (G.state === 'play') audio.setIntensity(Math.min(1, Math.log10(Math.max(1, S / START_SIZE)) / 3.5));

  player.update(dt, ball, G.t, false);
  // a phone held upright: thumbs cover the bottom of the screen, so while playing the picture sits
  // higher (the ball about half way down instead of 60 %, just below where toasts come up) and a
  // small ball is seen from a little closer
  const upright = G.touchScreen && engine.width < engine.height * 0.9;
  rig.shiftTarget = upright && (G.state === 'play' || G.state === 'pause') ? 0.11 : 0;
  rig.near = upright ? 0.7 : 1;
  rig.update(dt, ball, G.t);
  updateGiant(dt, G.t);
  updateGlints(dt);
  fx.update(dt);

  // light, sky, fog
  sky.setHour(hourFor());
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
  // thin haze that follows the ball's scale, capped so the edge of the world always melts into the sky
  // (while playing, never so thick that a huge ball, seen from far above, disappears into it)
  let fogLen = Math.min(S * 320 + 1100, 6000);
  if (G.state === 'play' || G.state === 'pause') fogLen = Math.max(fogLen, engine.camera.position.distanceTo(ball.group.position) * 2.5);
  engine.scene.fog.density = 1 / fogLen;
  updateView(S);

  if (G.state === 'play') {
    hud.update(ball.S, G.milestone, G.rules.seconds ? G.rules.seconds - G.time : null, ball.stats.count, ball.futureS);
    rivals.hud(dt, engine.camera, ball, innerWidth, innerHeight, innerWidth < 640 ? 215 : 130);
    // "+size" pop-ups, a few a second at most
    G.gainT -= dt;
    if (G.gainAcc > 0 && G.gainT <= 0) {
      hud.gain(G.gainAcc, ball.S);
      G.gainAcc = 0;
      G.gainT = 0.3;
    }
    // streak over?
    if (G.comboShown && G.t - ball.combo.t > COMBO.window) {
      hud.comboEnd(G.comboShown, ball.comboExtra);
      G.comboShown = 0;
    }
    const cam = engine.camera;
    maps.update(dt, ball, rig.yaw, 2 * Math.atan(Math.tan((cam.fov * Math.PI) / 360) * cam.aspect), rivals.active ? rivals.dots(ball) : null);
    // the first time something striped red comes up, say what the colours mean
    if (!G.redHinted && G.hi && G.hi.red > 0 && G.time > 3 && G.toastCd <= 0) {
      G.redHinted = true;
      G.toastCd = 3;
      hud.toast('<em>红纹</em>的还太大，先绕开 · <em>金边</em>的能滚起');
    }
    G.soundT -= dt;
    if (G.soundT <= 0) {
      G.soundT = 0.5;
      syncSoundButton();
    }
  }
  MU.time.value = G.t;
  G.toastCd -= dt;
  G.hintCd -= dt;
}

function handleEvents() {
  for (const e of G.events) {
    switch (e.type) {
      case 'pickup': {
        const o = e.o;
        G.idleT = 0;
        G.gainAcc += e.gain || 0;
        audio.pickup(o.spec.sfx, e.rel, o.size, e.combo);
        if (e.combo >= 3) {
          hud.combo(e.combo, e.mult);
          G.comboShown = e.combo;
          if (e.combo % 10 === 0) audio.comboChime(e.combo / 10);
        }
        fx.pickup(o.centerX(), o.y + o.h * 0.5, o.centerZ(), o.size, ball.S);
        const si = shards.take(o);
        if (si >= 0) shardFound(si, o);
        // the level's count
        if (G.level) {
          // (a cat knocked off and rolled up again counts once)
          if (G.level.score === 'cats' && o.spec.id.startsWith('cat_')) G.catN = G.cats.add(o).size;
          if (G.dancers) G.dancers.delete(o);
          syncLevelHud();
        }
        // first time ever for this kind of thing: into the 图鉴, and always shown as 新收集
        const fresh = dex.add(o.spec.id);
        for (const { x, justDone } of wishes.pickup(o)) {
          if (justDone) wishDone(x);
          else wishProgress(x);
        }
        if (e.rel > 0.04 || !lastPreview.spec || fresh) {
          hud.lastItem(o.spec.name, o.size, fresh);
          lastPreview.show(o.spec, o.tint);
        }
        if (e.rel > 0.2) hud.bump();
        if (o.tag === 'dance_speaker') {
          movers.stopDance();
          audio.squareDanceStop();
          dialog.interrupt(story.SPEAKER_LINE);
        } else if (e.first && story.QUIPS[o.spec.id] && G.toastCd <= 0) {
          hud.toast(story.QUIPS[o.spec.id]);
          G.toastCd = 1.4;
        }
        break;
      }
      case 'bump': {
        audio.bump(e.strength);
        rig.shake(0.035 * e.strength);
        fx.bump(ball.pos.x, ball.centerY, ball.pos.z, ball.S);
        // 小心轻放: every crash counts
        if (G.level && G.level.bumps && G.state === 'play' && !(G.cd > 0.2)) {
          G.bumps++;
          syncLevelHud();
          if (G.bumps < G.level.bumps) hud.toast(`撞了一下！还能撞 <em>${G.level.bumps - G.bumps}</em> 下`);
          break;
        }
        // teach the rule once per kind of thing: how big you need to be
        const o = e.o;
        if (o && G.hintCd <= 0 && !G.hinted.has(o.spec.id) && o.size < ball.S * 12 && o.spec.name) {
          G.hinted.add(o.spec.id);
          G.hintCd = 5;
          hud.toast(`<em>${o.spec.name}</em> 还滚不动（要 ${fmt(o.size / PICK_RATIO)}）`);
        }
        break;
      }
      case 'knock':
        audio.knock(e.count);
        if (G.toastCd <= 0) {
          hud.toast(ball.dashT > -0.3 ? `冲太猛撞上了，掉了 <em>${e.count}</em> 件` : `被撞掉了 <em>${e.count}</em> 件`);
          G.toastCd = 1;
        }
        break;
      case 'dash':
        audio.dash();
        speedLines();
        break;
      case 'scream': audio.voice(e.o.spec.sfx, 0.8); break;
      case 'honk': audio.voice('horn', 0.5); break;
    }
  }
}

/** rays round the edges of the screen for a moment (a dash) */
function speedLines() {
  const el = $('speed-lines');
  el.classList.remove('on');
  void el.offsetWidth;
  el.classList.add('on');
}

function checkMilestones() {
  let reached = -1;
  while (G.milestone < story.MILESTONES.length && ball.S >= story.MILESTONES[G.milestone][0]) {
    reached = G.milestone;
    G.milestone++;
  }
  if (reached >= 0) {
    const [size, goalLine] = story.MILESTONES[reached];
    const line = size === story.SKY_GOAL && G.mode === 'free' ? story.GOAL_FREE : goalLine;
    const names = newlyEdible();
    hud.stamp(fmt(size), names.length ? `现在能滚起：${names.join('、')}` : '');
    audio.milestone(Math.min(8, reached + 1));
    dialog.interrupt(line);
    hud.bump();
    // a burst of the five colours round the ball, and a little punch of the lens
    const S = ball.S;
    for (let i = 0; i < 2; i++) {
      const a = i * Math.PI + G.t;
      fx.firework(ball.pos.x + Math.cos(a) * S * 0.7, ball.centerY + S * (0.9 + 0.4 * i), ball.pos.z + Math.sin(a) * S * 0.7, S * 0.8);
    }
    rig.fovBoost += 10;
  }
}

/** the commonest kinds of thing that became small enough to roll up since the last goal */
function newlyEdible() {
  const limit = ball.pickLimit(), prev = G.unlockLimit;
  G.unlockLimit = limit;
  const seen = new Set(), out = [];
  const types = [...world.types.values()]
    .filter(t => !t.spec.hidden && t.spec.name && t.all.length >= 3 && t.spec.pickSize > prev && t.spec.pickSize <= limit)
    .sort((a, b) => b.all.length - a.all.length);
  for (const t of types) {
    if (seen.has(t.spec.name)) continue;
    seen.add(t.spec.name);
    out.push(t.spec.name);
    if (out.length === 3) break;
  }
  return out;
}

// ---- the start, the end, and what counts (modes.js) ---------------------------------------------

/** 3 · 2 · 1 · 滚！ — pushing off right as 滚 comes up (not before) gives a flying start */
function countdown(dt, raw, inp) {
  const el = $('countdown');
  const before = G.cd;
  G.cd -= dt;
  const label = G.cd > 0.2 ? String(Math.ceil(G.cd - 0.2)) : G.cd > -0.5 ? '滚！' : '';
  if (label !== G.cdShown) {
    G.cdShown = label;
    el.hidden = !label;
    if (label) {
      el.textContent = label;
      el.className = label === '滚！' ? 'go' : '';
      void el.offsetWidth;
      el.classList.add('tick');
      if (label === '滚！') audio.milestone(1);
      else audio.tick(+label);
    }
  }
  const pushing = raw.fwd || (raw.stick && raw.stick.m > 0.45);
  // held down from before 滚 came up: a false start (nothing lost, nothing gained)
  if (G.cdGo === null && pushing && G.cd > 0.35) G.cdGo = 'early';
  if (G.cdGo === null && pushing && G.cd <= 0.35 && G.cd > -0.3) {
    G.cdGo = 'perfect';
    ball.dashT = 0.9;
    ball.dashReady = G.t + 1.4;
    const f = ball.forward();
    const v = ball.maxSpeed() * 1.4;
    ball.vel.set(f.x * v, 0, f.z * v);
    audio.dash();
    speedLines();
    hud.toast('<em>完美起步！</em>', 'big');
  }
  if (G.cdGo === 'early' && before > 0.2 && G.cd <= 0.2) hud.toast('抢跑了～下次等「滚」字出来再推');
  if (!pushing && G.cdGo === 'early' && G.cd > 0.35) G.cdGo = null;
}

function timeUp() {
  if (G.rules.finale) startFinale();
  else endRound('time');
}

/** a 关卡 met its goal (or ran out of crashes) before the time was up */
function levelGoals() {
  const L = G.level;
  if (L.goal && L.goal.size && ball.S >= L.goal.size) endRound('goal');
  else if (G.dancers && G.dancers.size === 0) endRound('goal');
  else if (L.bumps && G.bumps >= L.bumps) endRound('bumps');
}

/** a 关卡 or 对手赛 ends: stop, a word, then the results */
function endRound(why) {
  if (G.state !== 'play') return;
  const L = G.level;
  let score = null, ok = true;
  if (L) {
    if (L.score === 'time') score = why === 'goal' ? G.time : null;
    else if (L.score === 'cats') score = G.catN;
    else score = ball.S;
    ok = score !== null && score > 0;
  }
  G.round = { why, score, ok, size: ball.S, standings: rivals.active ? rivals.standings(ball) : null };
  G.state = 'outro';
  G.outro = 2.2;
  input.enabled = false;
  showTouch(false);
  $('hud-time').hidden = true;
  audio.setHurry(false);
  dialog.clear();
  if (G.rules.rivals) {
    const place = G.round.standings.findIndex(e => e.me) + 1;
    hud.stamp(place === 1 ? '第一名' : `第 ${place} 名`, '');
    audio.milestone(place === 1 ? 6 : 2);
  } else if (why === 'bumps') {
    hud.stamp('撞满了', `撞了 ${G.bumps} 下，这局就到这儿`);
    audio.timeUp();
  } else if (why === 'time' && L.score === 'time') {
    hud.stamp('时间到', story.LEVEL_FAIL);
    audio.timeUp();
  } else {
    hud.stamp(why === 'goal' ? '过关' : '时间到', '');
    audio.milestone(why === 'goal' ? 5 : 2);
  }
}

// every full minute of a 限时补天 or 每日挑战: how it compares with the best game so far, then
function ghostSplits(dt) {
  if ((G.curveT -= dt) <= 0) {
    G.curveT = 5;
    G.curve.push(+ball.S.toPrecision(4));
  }
  if (G.time < G.splitAt) return;
  G.splitAt += 60;
  const best = ghostCurve();
  const then = best && best[Math.round(G.time / 5)];
  if (!then) return;
  const d = ball.S - then;
  hud.toast(`第 ${Math.round(G.time / 60)} 分钟 · 比最好那局${d >= 0 ? '<em>大</em>' : '小'} ${fmt(Math.abs(d))}`);
}
function ghostCurve() {
  if (G.mode === 'timed') return store.get('curve.timed', null);
  if (G.mode === 'daily') {
    const c = store.get('curve.daily', null);
    return c && c.day === dayKey() ? c.curve : null;
  }
  return null;
}

// 对手赛: what the rivals just did
function rivalEvents(evs) {
  for (const e of evs) {
    if (e.type === 'eaten') {
      ball.pending += e.gain;
      G.rivalsEaten.push(e.r.name);
      hud.toast(story.ATE_RIVAL(e.r.name), 'big');
      audio.milestone(4);
      const S = ball.S;
      fx.firework(ball.pos.x, ball.centerY + S, ball.pos.z, S);
      rig.fovBoost += 8;
    } else if (e.type === 'rivalAte') {
      hud.toast(story.RIVAL_ATE(e.by.name, e.r.name));
    } else if (e.type === 'bump') {
      audio.bump(0.6);
      rig.shake(0.03);
    }
  }
  // the first time one of them is small enough to take, say so
  if (!G.preyHinted && rivals.list.some(r => r.alive && r.ball.S <= ball.pickLimit())) {
    G.preyHinted = true;
    dialog.interrupt(story.RIVAL_FIRST);
  }
}

// 五色石碎片: one more found
function shardFound(i, o) {
  const n = shards.count;
  hud.toast(`<em>五色石碎片</em> ${n}/${shards.total}！`, 'big');
  audio.milestone(3);
  fx.firework(o.centerX(), o.y + o.h + ball.S * 0.6, o.centerZ(), Math.max(ball.S, o.size * 2));
  if (n === shards.total) dialog.interrupt(story.SHARD_ALL);
  else if (n === 1) dialog.interrupt(story.SHARD_FIRST);
  syncTitleCounts();
}

// ---- finale ------------------------------------------------------------------------------------

function startFinale() {
  if (G.state === 'finale') return;
  G.state = 'finale';
  input.enabled = false;
  showTouch(false);
  audio.timeUp();
  audio.setHurry(false);
  audio.music('finale', { fade: 2.5 });
  dialog.clear();
  dialog.say(story.TIME_UP, { hold: 2.4 });
  $('hud-time').hidden = true;
  $('hud-last').hidden = true;
  const H = sky.u.uHoleDir.value.clone();
  G.prelaunch = { x: ball.pos.x, z: ball.pos.z, heading: ball.heading, hour: sky.hour };
  G.finale = {
    t: 0,
    start: ball.group.position.clone(),
    S: ball.displayS,
    H,
    dest: ball.group.position.clone().addScaledVector(H, Math.max(2600, ball.S * 40)),
    launched: false,
    patched: false,
    // how much of the hole it fills: all of it from SKY_GOAL up
    fill: Math.min(1, Math.sqrt(ball.displayS / story.SKY_GOAL)),
    fw: 0,
    hour0: sky.hour,
  };
  const f = G.finale;
  const fx0 = Math.sin(ball.heading), fz0 = -Math.cos(ball.heading);
  rig.override = {
    pos: new THREE.Vector3(ball.pos.x - fx0 * f.S * 3.2, f.S * 1.8, ball.pos.z - fz0 * f.S * 3.2),
    look: ball.group.position.clone(),
    fov: 58,
    speed: 1.6,
  };
}

function updateFinale(dt) {
  const f = G.finale;
  f.t += dt;
  const S = f.S;
  if (f.t > 2.4 && !f.launched) {
    f.launched = true;
    if (giant) {
      giant.userData.dir.copy(f.H).applyAxisAngle(new THREE.Vector3(0, 1, 0), -0.55).normalize();
      giant.userData.dir.y = Math.max(0.25, giant.userData.dir.y * 0.7);
      giant.userData.dir.normalize();
      giant.userData.target = 1;
    }
    audio.launch();
    dialog.say(story.LAUNCH, { hold: 1.4 });
    // watch from below as it goes up
    const fx0 = Math.sin(ball.heading), fz0 = -Math.cos(ball.heading);
    rig.override = {
      pos: new THREE.Vector3(f.start.x - fx0 * S * 4.5, S * 0.6, f.start.z - fz0 * S * 4.5),
      look: f.start.clone(),
      fov: 66,
      speed: 3,
    };
  }
  if (f.launched) {
    const u = Math.min(1, (f.t - 2.4) / 3.6);
    const e = u * u * u;
    const p = ball.group.position;
    p.lerpVectors(f.start, f.dest, e);
    p.y += Math.sin(u * Math.PI) * S * 0.5;
    ball.root.rotateY(dt * (2 + u * 10));
    fx.trail(p.x, p.y, p.z, S * (1 + e * 8));
    rig.override.look.copy(p);
    if (u >= 1) ball.group.visible = false;
  }
  if (f.t > 6 && !f.patched) {
    f.patched = true;
    G.patched = true;
    audio.patch();
    flash();
    dialog.say(f.fill >= 1 ? story.PATCHED : story.PATCHED_PART, { hold: 2 });
  }
  if (f.patched) {
    const k = Math.min(1, (f.t - 6) / 4);
    sky.u.uPatch.value = k * f.fill;
    sky.hour = f.hour0 + (19.6 - f.hour0) * Math.min(1, (f.t - 6) / 5);
    f.fw -= dt;
    if (f.fw <= 0 && f.t < 16) {
      f.fw = 0.35 + Math.random() * 0.4;
      const cam = engine.camera.position;
      const dist = 900;
      const jitter = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.4 - 0.1, Math.random() - 0.5).multiplyScalar(0.9);
      const dir = f.H.clone().add(jitter).normalize();
      fx.firework(cam.x + dir.x * dist, cam.y + dir.y * dist, cam.z + dir.z * dist, 90 + Math.random() * 60);
      if (Math.random() < 0.6) audio.fireworks();
    }
  }
  if (f.t > 11 && G.state === 'finale') showResults();
}

function flash() {
  const el = document.createElement('div');
  el.style.cssText = 'position:fixed;inset:0;background:#fff8e6;pointer-events:none;transition:opacity 1.6s ease-out;opacity:1;z-index:5';
  document.body.appendChild(el);
  requestAnimationFrame(() => requestAnimationFrame(() => (el.style.opacity = '0')));
  setTimeout(() => el.remove(), 1800);
}

function showResults() {
  G.state = 'results';
  hud.show(false);
  const size = ball.S;
  const [, rank, quote] = story.ending(size);
  resultsCommon(size);
  $('res-eyebrow').textContent = G.mode === 'daily' ? `每日挑战 · ${dayLabel()}` : '补天石 · 最终尺寸';
  $('res-rank').textContent = `称号：${rank}`;
  $('res-quote').textContent = `女娲：${quote}`;
  const short = story.SKY_GOAL - size;
  $('res-goal').className = 'res-goal' + (short > 0 ? ' short' : '');
  $('res-goal').innerHTML = short > 0
    ? `补天要 <b>${story.SKY_GOAL} m</b>，还差 <b>${fmt(short)}</b>——窟窿还剩一块`
    : `<b>补天成功！</b>窟窿补上了`;
  // what the next title would have taken: something to beat next time
  const nextRank = story.ENDINGS.find(e => size < e[0]);
  const after = story.ENDINGS[story.ENDINGS.indexOf(nextRank) + 1];
  if (short <= 0 && after) $('res-goal').innerHTML += `<small>再大 <b>${fmt(nextRank[0] - size)}</b> 就是「${after[1]}」</small>`;
  $('res-goal').hidden = false;
  const got = wishes.finish();
  $('res-wish').innerHTML =
    `<div class="rw-head">女娲的心愿 <b>★ ${got}/${wishes.list.length}</b><small>累计 ★ ${wishes.stars}</small></div>` +
    wishes.list.map(x => `<div class="rw${x.done ? ' ok' : ''}"><i>${x.done ? '★' : '☆'}</i>${x.w.text}${x.done ? '' : `<small>${wishes.progress(x)}</small>`}</div>`).join('');
  const st = ball.stats;
  let brag = bragLine(size, rank, st);
  let modeLine = G.mode === 'free' ? '自由滚' : '限时补天 · 6 分钟';
  // records: the best game (and its size minute by minute, for next time's splits)
  if (G.mode === 'timed') {
    const best = store.get('best', null);
    if (!best || size > best.size) {
      store.set('best', { size, rank, at: Date.now() });
      store.set('curve.timed', G.curve);
      if (best) $('res-goal').innerHTML += `<small class="rec">新纪录！上次最好 ${fmt(best.size)}</small>`;
    } else $('res-goal').innerHTML += `<small>个人最佳 ${fmt(best.size)}</small>`;
  } else if (G.mode === 'daily') {
    const { best, streak, better } = progress.finishDaily(size, got);
    if (better) store.set('curve.daily', { day: dayKey(), curve: G.curve });
    $('res-goal').innerHTML += `<small>${better ? '今日新纪录！' : `今日最佳 ${fmt(best.size)}`} · 已连续挑战 <b>${streak}</b> 天</small>`;
    modeLine = `每日挑战 · ${dayLabel()}`;
    brag = `《万物皆可滚·女娲补天》每日挑战 ${dayLabel()}：${'★'.repeat(got)}${'☆'.repeat(3 - got)} 滚到 ${fmt(size)}，称号「${rank}」，已连续 ${streak} 天。今天的题人人都一样，来比比？ ${SITE}`;
  } else {
    const best = store.get('best', null);
    if (!best || size > best.size) store.set('best', { size, rank, at: Date.now() });
  }
  $('res-brag').textContent = brag;
  $('btn-keep').hidden = false;
  G.result = {
    size: fmt(size), title: `称号：${rank}`, mode: modeLine, quote: `女娲：${quote}`,
    lines: [`滚起 ${st.count} 件 · 最大的一件 ${st.biggest ? st.biggest.name : '—'}`, wishes.list.length ? `女娲的心愿 ${'★'.repeat(got)}${'☆'.repeat(wishes.list.length - got)}` : ''].filter(Boolean),
  };
  $('results').hidden = false;
  rig.override = {
    pos: engine.camera.position.clone(),
    look: engine.camera.position.clone().addScaledVector(G.finale.H, 100),
    fov: 62,
    speed: 0.6,
  };
}

/** the parts every results screen has: size, stats, what was rolled up, the 图鉴 */
function resultsCommon(size) {
  $('res-size').textContent = fmt(size);
  const st = ball.stats;
  const mins = Math.floor(G.time / 60), secs = Math.floor(G.time % 60);
  const big = st.biggest ? `${st.biggest.name}（${fmt(st.biggest.size)}）` : '—';
  $('res-stats').innerHTML =
    `<span>滚起<b>${st.count}</b>件</span><span>用时<b>${mins}:${String(secs).padStart(2, '0')}</b></span>` +
    `<span>最大的一件<b>${big}</b></span><span>最长连滚<b>×${st.bestCombo || 0}</b></span><span>掉落<b>${st.lost}</b>件</span>`;
  const top = Object.entries(st.byType).sort((a, b) => b[1] - a[1]).slice(0, 18);
  $('res-items').innerHTML = top.map(([id, n]) => `<span>${(CATALOG.get(id) || {}).name || id} <b>×${n}</b></span>`).join('');
  $('res-tip').hidden = !(G.touchScreen && G.fpsCap !== 30);
  dex.save();
  const fresh = [...dex.fresh].map(id => (CATALOG.get(id) || {}).name || id);
  $('res-dex-line').innerHTML = fresh.length
    ? `图鉴新收集 <b>${fresh.length}</b> 种 · 共 <b>${dex.found}</b>/${dex.total}`
    : `这局没有新收集 · 图鉴 <b>${dex.found}</b>/${dex.total}`;
  $('res-dex-new').textContent = fresh.length ? fresh.slice(0, 10).join('、') + (fresh.length > 10 ? ` 等 ${fresh.length} 种` : '') : '';
  $('res-level').hidden = true;
  $('res-rivals').hidden = true;
  $('res-wish').innerHTML = '';
  $('btn-next').hidden = true;
  $('btn-share').textContent = '生成战绩图';
  ball.portraitOnly(true);
  $('btn-copy').textContent = '复制战绩';
  syncTitleCounts();
}

const fmtTime = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
/** a 关卡's score as words: 0:52 / 23 只 / 45 cm */
function fmtScore(L, v) {
  if (v === null || v === undefined) return '—';
  return L.score === 'time' ? fmtTime(v) : L.score === 'cats' ? `${v} 只` : fmt(v);
}

/** the end of a 关卡 or a 对手赛 (no trip up to the sky) */
function showRoundResults() {
  G.state = 'results';
  hud.show(false);
  input.enabled = true;
  const R = G.round, size = R.size, st = ball.stats;
  G.prelaunch = { x: ball.pos.x, z: ball.pos.z, heading: ball.heading, hour: sky.hour };
  resultsCommon(size);
  $('res-goal').hidden = true;
  $('btn-keep').hidden = true;
  let brag, title, lines;
  if (G.level) {
    const L = G.level;
    const { stars, best, better } = progress.finishLevel(L, R.score);
    $('res-eyebrow').textContent = `关卡 ${LEVELS.indexOf(L) + 1} · ${L.name}`;
    $('res-rank').textContent = R.score === null ? '没过关' : stars ? story.LEVEL_DONE[stars - 1] : '差一点点';
    const scoreLine = L.score === 'time'
      ? (R.score === null ? `${fmtTime(L.seconds)} 内没滚到` : `用时 ${fmtTime(R.score)}`)
      : L.score === 'cats' ? `滚起了 ${R.score} 只猫` : `滚到了 ${fmt(R.score)}`;
    $('res-level').innerHTML =
      `<div class="stars">${'★'.repeat(stars)}<i>${'★'.repeat(3 - stars)}</i></div><p>${scoreLine}</p>` +
      `<small>${better && best.score !== null ? '新纪录！' : `最佳：${fmtScore(L, best.score)}`} · ★ ${fmtScore(L, L.stars[0])} · ★★ ${fmtScore(L, L.stars[1])} · ★★★ ${fmtScore(L, L.stars[2])}</small>`;
    $('res-level').hidden = false;
    $('res-quote').textContent = `女娲：${stars ? (stars === 3 ? '完美！本宫看着都过瘾。' : '好样的！再来一次，冲三颗星！') : story.LEVEL_FAIL}`;
    const i = LEVELS.indexOf(L);
    $('btn-next').hidden = !(i < LEVELS.length - 1 && progress.levelOpen(i + 1));
    title = `关卡「${L.name}」${'★'.repeat(stars)}${'☆'.repeat(3 - stars)}`;
    lines = [scoreLine, `滚起 ${st.count} 件`];
    brag = `我在《万物皆可滚·女娲补天》关卡「${L.name}」拿了 ${'★'.repeat(stars) || '0 颗星'}：${scoreLine}。${SITE}`;
  } else {
    const list = R.standings;
    const place = list.findIndex(e => e.me) + 1;
    const { stars } = progress.finishRivals(place);
    $('res-eyebrow').textContent = '对手赛 · 3 分钟';
    $('res-rank').textContent = place === 1 ? '第一名！' : `第 ${place} 名`;
    $('res-rivals').innerHTML = list.map((e, k) => `<li class="${e.me ? 'me' : ''}${e.alive ? '' : ' out'}"><i>${k + 1}</i><span>${e.name}</span><b>${e.alive ? fmt(e.S) : '被滚走了'}</b></li>`).join('');
    $('res-rivals').hidden = false;
    const ate = G.rivalsEaten;
    $('res-quote').textContent = `女娲：${place === 1 ? (ate.length ? `连「${ate[0]}」都被你滚进来了，这城里你最能滚！` : '第一！别家的五色石都不如你的。') : '别灰心，先抢地盘，再抢对手！'}`;
    title = place === 1 ? '对手赛 第一名' : `对手赛 第 ${place} 名`;
    lines = [`滚起 ${st.count} 件${ate.length ? ` · 滚走了对手 ${ate.join('、')}` : ''}`, `对手赛 ${'★'.repeat(stars)}${'☆'.repeat(3 - stars)}`];
    brag = `我在《万物皆可滚·女娲补天》对手赛拿了第 ${place} 名，滚到 ${fmt(size)}${ate.length ? `，还把「${ate.join('」「')}」整个滚了进来` : ''}！${SITE}`;
    rivals.stop();
  }
  $('res-brag').textContent = brag;
  G.result = { size: fmt(size), title, mode: $('res-eyebrow').textContent, quote: $('res-quote').textContent, lines };
  $('results').hidden = false;
  rig.override = {
    pos: engine.camera.position.clone(),
    look: ball.group.position.clone().add(new THREE.Vector3(0, ball.S * 8 + 40, 0)),
    fov: 62,
    speed: 0.6,
  };
}

function bragLine(size, rank, st) {
  const n = ids => ids.reduce((a, id) => a + (st.byType[id] || 0), 0);
  const parts = [];
  const aunties = n(['auntie', 'auntie_dance', 'auntie_veg']);
  const uncles = n(['uncle', 'uncle_taichi', 'uncle_chess', 'uncle_birdcage', 'fisherman']);
  const cats = Object.keys(st.byType).filter(k => k.startsWith('cat_')).reduce((a, k) => a + st.byType[k], 0);
  const cars = st.byCat.vehicle || 0;
  const blds = (st.byCat.building || 0) + (st.byCat.landmark || 0);
  if (aunties) parts.push(`${aunties} 位大妈`);
  if (uncles) parts.push(`${uncles} 位大爷`);
  if (cats) parts.push(`${cats} 只猫`);
  if (cars) parts.push(`${cars} 辆车`);
  if (blds) parts.push(`${blds} 栋楼`);
  const extra = parts.length ? `，其中有${parts.join('、')}` : '';
  return `我在《万物皆可滚·女娲补天》里把五色石滚到了 ${fmt(size)}，称号「${rank}」！一共滚起 ${st.count} 件东西${extra}。`;
}

function keepRolling() {
  $('results').hidden = true;
  ball.portraitOnly(false);
  const p = G.prelaunch;
  G.mode = 'free';
  G.rules = MODES.free;
  G.level = null;
  G.state = 'play';
  G.finale = null;
  input.enabled = true;
  ball.pos.x = p.x;
  ball.pos.z = p.z;
  ball.heading = p.heading;
  ball.vel.set(0, 0, 0);
  ball.group.visible = true;
  ball.updateVisual(0, G.t);
  sky.u.uHole.value = 0;
  sky.u.uPatch.value = 1;
  G.time = Math.max(G.time, 1);
  rig.override = null;
  rig.snap(ball);
  hud.show(true);
  showTouch(true);
  audio.music('game', { fade: 1.5 });
}

// ---- rendering ---------------------------------------------------------------------------------

function render(dt) {
  const r = engine.renderer;
  fx.setViewport(r.domElement.clientHeight, engine.camera.fov);
  r.setScissorTest(false);
  r.setViewport(0, 0, engine.width, engine.height);
  r.clear();
  r.render(engine.scene, engine.camera);
  G.info.calls = r.info.render.calls;
  G.info.tris = r.info.render.triangles;
  if (G.state === 'play' || G.state === 'pause') lastPreview.render(r, dt);
  if (dialog.active) nuwaPreview.render(r, dt);
  if (G.state === 'results' && G.prelaunch) renderBallPortrait(r, G.t);
}

// ---- test autopilot: steers to the nearest thing it can roll up ------------------------------

const ap = { target: null, retarget: 0, chase: 0, cands: [], skip: new Set(), probe: 3, px: 0, pz: 0, escape: 0, escH: 0 };
function autopilot(dt) {
  // hardly moved in 3 s (pressed against something too big): give up on that and back off elsewhere
  ap.probe -= dt;
  if (ap.probe <= 0) {
    ap.probe = 3;
    if (Math.hypot(ball.pos.x - ap.px, ball.pos.z - ap.pz) < ball.S * 1.2 && ap.escape <= 0) {
      ap.escape = 2.5;
      ap.escH = ball.heading + Math.PI * (0.6 + Math.random() * 0.8);
      if (ap.target) ap.skip.add(ap.target);
      ap.target = null;
      cp.target = null;
    }
    ap.px = ball.pos.x;
    ap.pz = ball.pos.z;
  }
  if (ap.escape > 0) {
    ap.escape -= dt;
    return { dir: ap.escH, m: 1, quick: false, turnImpulse: 0, dash: false };
  }
  if (G.autopilot === 'casual') return casualPilot(dt);
  ap.retarget -= dt;
  const S = ball.S, limit = ball.pickLimit();
  ap.chase += dt;
  if (ap.target && ap.target.state === 0 && ap.chase > 5) { ap.skip.add(ap.target); ap.target = null; }
  if (!ap.target || ap.target.state !== 0 || ap.retarget <= 0) {
    ap.retarget = 0.6;
    const prev = ap.target;
    ap.target = null;
    let best = Infinity;
    // (广场舞清场: once big enough, straight for the nearest dancer)
    if (G.dancers && G.dancers.size && S > 1.95) {
      let bd = Infinity;
      for (const o of G.dancers) {
        const d = Math.hypot(o.x - ball.pos.x, o.z - ball.pos.z);
        if (o.state === 0 && d < bd) { bd = d; ap.target = o; }
      }
    }
    for (const R of ap.target ? [] : [S * 6, S * 20, S * 60]) {
      world.grid.query(ball.pos.x, ball.pos.z, R, ap.cands, S / 90);
      for (const o of ap.cands) {
        if (o.state !== 0 || o.size > limit || o.y > S || ap.skip.has(o) || (ball.canPick && !ball.canPick(o))) continue;
        // value-for-distance, like a player eyeing the biggest thing they can take (in a 关卡, its
        // targets are worth a lot more)
        const d = Math.hypot(o.x - ball.pos.x, o.z - ball.pos.z);
        const aim = (G.dancers && G.dancers.has(o)) || (G.level && G.level.score === 'cats' && o.spec.id.startsWith('cat_')) ? 40 : 1;
        const score = (d + S * 1.5) / Math.pow(o.size / S, 1.5) / aim;
        if (score < best) { best = score; ap.target = o; }
      }
      if (ap.target) break;
    }
    if (ap.target !== prev) ap.chase = 0;
  }
  if (!ap.target) return { dir: ball.heading + Math.sin(G.t * 0.7) * 0.6, m: 1, quick: false, turnImpulse: 0, dash: false };
  const dx = ap.target.x - ball.pos.x, dz = ap.target.z - ball.pos.z;
  const want = Math.atan2(dx, -dz);
  let diff = (want - ball.heading) % (Math.PI * 2);
  if (diff > Math.PI) diff -= Math.PI * 2;
  if (diff < -Math.PI) diff += Math.PI * 2;
  return { dir: want, m: 1, quick: false, turnImpulse: 0, dash: Math.abs(diff) < 0.15 && Math.hypot(dx, dz) > S * 5 && Math.random() < 0.03 };
}

// a stand-in for a casual player, for pacing tests: goes for some roughly-in-front thing it can take
// (any, not the best), now and then just wanders, and only rethinks every so often
const cp = { t: 0, dir: 0, target: null, cands: [], look: 0 };
function casualPilot(dt) {
  const S = ball.S, limit = ball.pickLimit();
  cp.t -= dt;
  cp.look -= dt;
  if (cp.t <= 0 || (cp.target && cp.target.state !== 0)) {
    cp.t = 1.5 + Math.random() * 1.5;
    cp.target = null;
    if (Math.random() < 0.25) cp.dir = ball.heading + (Math.random() - 0.5) * 2.4;
    else {
      const picks = [];
      for (const o of world.grid.query(ball.pos.x, ball.pos.z, S * 8, cp.cands, S / 90)) {
        if (o.state !== 0 || o.size > limit || o.size < S * 0.05 || o.y > S) continue;
        const a = Math.atan2(o.x - ball.pos.x, -(o.z - ball.pos.z));
        let d = (a - ball.heading) % (Math.PI * 2);
        if (d > Math.PI) d -= Math.PI * 2;
        if (d < -Math.PI) d += Math.PI * 2;
        if (Math.abs(d) < 1.8) picks.push(o);
      }
      if (picks.length) cp.target = picks[(Math.random() * picks.length) | 0];
      else cp.dir = ball.heading + (Math.random() - 0.5) * 3;
    }
  }
  // a person reacts a few times a second, not every frame
  if (cp.target && cp.look <= 0) {
    cp.look = 0.25;
    cp.dir = Math.atan2(cp.target.x - ball.pos.x, -(cp.target.z - ball.pos.z));
  }
  return { dir: cp.dir, m: 1, quick: false, turnImpulse: 0, dash: false };
}

window.__wanwu = {
  G,
  get ball() { return ball; },
  get world() { return world; },
  get engine() { return engine; },
  get layout() { return layout; },
  get rig() { return rig; },
  get audio() { return audio; },
  get maps() { return maps; },
  get warn() { return warn; },
  get dex() { return dex; },
  get sky() { return sky; },
  get wishes() { return wishes; },
  get glints() { return glints.list.map(o => [o.spec.id, +o.size.toFixed(3), +Math.hypot(o.x - ball.pos.x, o.z - ball.pos.z).toFixed(2)]); },
  GROW,
  start: (mode, level) => startGame(mode || 'timed', level),
  get rivals() { return rivals; },
  get progress() { return progress; },
  get shards() { return shards; },
  openShare,
  step: dt => step(dt),
  skipIntro() { dialog.clear(); beginPlay(); },
  autopilot(on = true) { G.autopilot = on; },
  /** fast-forward the game with the autopilot, no rendering; returns [seconds, size] samples */
  sim(seconds, dt = 1 / 30, mode = true) {
    if (G.state !== 'play') { dialog.clear(); beginPlay(); }
    G.autopilot = mode;
    const out = [];
    for (let i = 0, n = Math.round(seconds / dt); i < n; i++) {
      G.t += dt;
      step(dt);
      if (i % Math.round(10 / dt) === 0) out.push([Math.round(G.time), +ball.S.toFixed(3), ball.stats.count]);
    }
    out.push([Math.round(G.time), +ball.S.toFixed(3), ball.stats.count]);
    return out;
  },
  teleport(x, z) { ball.pos.x = x; ball.pos.z = z; rig.snap(ball); },
  /** triangles of each type's full model, far-away stand-in and coarse stand-in (made now if need be) */
  /** coarse stand-ins still waiting to be made */
  coarseLeft: () => pumpCoarse(0),
  lods() {
    const out = {};
    for (const t of world.types.values()) {
      wantCoarse(t.spec);
      pumpCoarse(1e9);
      out[t.spec.id] = [t.spec.tris, t.spec.lod ? t.spec.lodTris : 0, t.spec.coarse ? t.spec.coarseTris : 0];
    }
    return out;
  },
  /** average ms for n synchronous frames (update + render + wait for the GPU) */
  bench(n = 60) {
    const r = engine.renderer, gl = r.getContext(), px = new Uint8Array(4);
    const t0 = performance.now();
    for (let i = 0; i < n; i++) {
      G.t += 1 / 60;
      step(1 / 60);
      render(1 / 60);
      gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
    }
    return +((performance.now() - t0) / n).toFixed(2);
  },
  /** what the last frame drew */
  perf() {
    return { calls: G.info.calls, tris: G.info.tris, instances: G.drawn, scale: engine.scale, fps: +perf.fps.toFixed(1), lock: perf.lock };
  },
  grow(S) { ball.S = S; ball.Sp = S ** GROW.P; ball.displayS = S; },
  finale: () => startFinale(),
  /** debug camera: look from (x,y,z) at (lx,ly,lz); call with no args to release */
  view(x, y, z, lx = 0, ly = 0, lz = 0, fov = 55) {
    if (x === undefined) { rig.override = null; return; }
    rig.override = { pos: new THREE.Vector3(x, y, z), look: new THREE.Vector3(lx, ly, lz), fov, speed: 1000 };
    rig.pos.set(x, y, z);
    rig.look.set(lx, ly, lz);
  },
  hour(h) { G.debugHour = h; },
};

boot().catch(e => {
  console.error(e);
  setLoading('出错了：' + (e && e.message ? e.message : e));
});
