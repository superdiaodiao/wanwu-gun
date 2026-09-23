// 万物皆可滚 · 女娲补天 — boot, game states, the main loop, the finale.
import * as THREE from 'three';
import './catalog/index.js';
import { CATALOG } from './catalog/registry.js';
import { buildAtlas, loadFonts, atlasTexture, repaintAtlas } from './core/atlas.js';
import { objectMaterial, U as MU } from './core/materials.js';
import { buildSpec } from './core/assets.js';
import { Engine } from './game/engine.js';
import { Sky } from './game/sky.js';
import { Ground } from './game/ground.js';
import { World } from './game/world.js';
import { buildLayout } from './game/layout.js';
import { Movers } from './game/movers.js';
import { Ball, GROW, PICK_RATIO } from './game/ball.js';
import { Player } from './game/player.js';
import { CameraRig } from './game/camera.js';
import { Input } from './game/input.js';
import { FX } from './game/fx.js';
import { Preview } from './game/preview.js';
import { HUD, fmt } from './game/hud.js';
import { Dialog } from './game/dialog.js';
import * as story from './game/story.js';
import { audio } from './audio/audio.js';

const GAME_SECONDS = 480;
const START_SIZE = 0.06;
const $ = id => document.getElementById(id);
const nextFrame = () => new Promise(r => requestAnimationFrame(() => r()));
const store = {
  get(k, d) { try { const v = localStorage.getItem('wanwu.' + k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('wanwu.' + k, JSON.stringify(v)); } catch {} },
};

const G = {
  state: 'loading', mode: 'timed', time: 0, t: 0, milestone: 0, events: [],
  finale: null, toastCd: 0, tickSec: -1, hurry: false, cullT: 0, patched: false, prelaunch: null,
  hinted: new Set(), hintCd: 0, idleT: 0, nudgeCd: 20,
};
let engine, sky, ground, world, layout, movers, ball, player, rig, input, fx, hud, dialog, lastPreview, nuwaPreview, material;
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
  fontsDone.then(() => repaintAtlas());
  await nextFrame();
  buildAtlas();
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
  T.layout = performance.now();
  ground.build(layout.zones);
  T.ground = performance.now();
  setLoading('正在把瓜子撒满一地……');
  await nextFrame();
  world.finalize();
  T.finalize = performance.now();
  movers = new Movers(world, layout);
  ball = new Ball(engine.scene, world, material, START_SIZE);
  player = new Player(engine.scene, material);
  rig = new CameraRig(engine.camera, world);
  input = new Input($('game'));
  fx = new FX(engine.scene);
  hud = new HUD();
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
  engine.renderer.compile(engine.scene, engine.camera);
  T.compile = performance.now();
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
  // a goddess glows a little: keeps her readable against the night sky of the finale
  mat.emissive = new THREE.Color(0x5a4a3e);
  mat.onBeforeCompile = material.onBeforeCompile;
  mat.customProgramCacheKey = () => 'wanwu-object-nofog';
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

function resetGame(mode) {
  G.mode = mode;
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
  ball.portraitOnly(false);
  movers = new Movers(world, layout);
  const s = layout.start;
  ball.reset(START_SIZE, s.x, s.z, s.heading);
  ball.group.visible = true;
  player.visible = true;
  sky.u.uHole.value = 1;
  sky.u.uPatch.value = 0;
  $('hud-last').hidden = true;
  hud.update(ball.S, 0, mode === 'timed' ? GAME_SECONDS : null, 0);
  lastPreview.clear();
}

function enterTitle() {
  G.state = 'title';
  if (giant) giant.userData.target = 0;
  hud.show(false);
  dialog.clear();
  $('title-screen').hidden = false;
  $('pause').hidden = true;
  $('results').hidden = true;
  showTouch(false);
  const best = store.get('best', null);
  const bl = $('best-line');
  if (best && best.size) {
    bl.hidden = false;
    bl.textContent = `最佳纪录：${fmt(best.size)} · ${best.rank || ''}`;
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

async function startGame(mode) {
  try { await audio.init(); } catch (e) { console.warn('[audio] init failed', e); }
  applyAudioPrefs();
  audio.ui('start');
  resetGame(mode);
  $('title-screen').hidden = true;
  G.state = 'intro';
  audio.music('title', { fade: 1 });
  const lines = [...story.INTRO, mode === 'timed' ? story.INTRO_TIMED : story.INTRO_FREE];
  dialog.say(lines, { blocking: true, onDone: beginPlay });
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

function beginPlay() {
  G.state = 'play';
  if (giant) giant.userData.target = 0;
  rig.override = null;
  rig.zoomIdx = 0;
  hud.show(true);
  showTouch(true);
  audio.music('game', { fade: 2 });
  setTimeout(() => hud.fadeKeys(), 12000);
}

function showTouch(on) {
  const touch = matchMedia('(pointer: coarse)').matches;
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
  $('btn-free').addEventListener('click', () => startGame('free'));
  const q = $('sel-quality');
  q.value = engine.quality;
  q.addEventListener('change', () => {
    engine.setQuality(q.value);
    store.set('quality', q.value);
  });
  const cm = $('chk-music'), cs = $('chk-sfx');
  cm.checked = store.get('music', true);
  cs.checked = store.get('sfx', true);
  cm.addEventListener('change', () => { store.set('music', cm.checked); applyAudioPrefs(); });
  cs.addEventListener('change', () => { store.set('sfx', cs.checked); applyAudioPrefs(); });
  $('btn-pause').addEventListener('click', () => togglePause());
  $('btn-resume').addEventListener('click', () => togglePause(false));
  $('btn-restart').addEventListener('click', () => { $('pause').hidden = true; startGame(G.mode); });
  $('btn-home').addEventListener('click', () => { $('pause').hidden = true; audio.music(null); resetGame('timed'); enterTitle(); });
  $('btn-finish').addEventListener('click', () => { togglePause(false); startFinale(); });
  $('btn-again').addEventListener('click', () => { $('results').hidden = true; startGame(G.mode === 'free' ? 'free' : 'timed'); });
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

function togglePause(force) {
  const on = force !== undefined ? force : G.state !== 'pause';
  if (on && G.state === 'play') {
    G.state = 'pause';
    $('pause').hidden = false;
    $('btn-finish').hidden = G.mode !== 'free';
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

function loop() {
  requestAnimationFrame(loop);
  const now = performance.now() / 1000;
  let dt = Math.min(0.05, Math.max(0, now - lastT));
  lastT = now;
  if (G.state === 'pause') dt = 0;
  G.t += dt;
  step(dt);
  render(dt);
}

function hourFor() {
  if (G.debugHour !== undefined) return G.debugHour;
  if (G.state === 'finale' || G.state === 'results') return sky.hour;
  if (G.state === 'title' || G.state === 'intro') return 9.2;
  if (G.mode === 'timed') return 9.2 + (G.time / GAME_SECONDS) * 9.4;
  const cyc = (G.time / 960) % 1; // 16 min day in free mode
  return 8 + cyc * 13;
}

function step(dt) {
  const inp = G.state === 'play' ? input.poll() : (input.poll(), { throttle: 0, turn: 0, turnImpulse: 0, dash: false });
  if (G.autopilot && G.state === 'play') Object.assign(inp, autopilot(dt));
  G.events.length = 0;

  if (G.state === 'play') {
    G.time += dt;
    ball.heading += inp.turnImpulse;
    ball.update(dt, inp, G.t, G.events);
    if (G.mode === 'timed') {
      const left = GAME_SECONDS - G.time;
      if (left <= 60 && !G.hurry) { G.hurry = true; audio.setHurry(true); dialog.interrupt(story.HURRY); }
      if (left <= 10) {
        const s = Math.ceil(left);
        if (s !== G.tickSec && s > 0) { G.tickSec = s; audio.tick(s); }
      }
      if (left <= 0) startFinale();
    }
    // bounds: soft wall far out
    const d = Math.hypot(ball.pos.x, ball.pos.z);
    if (d > layout.bounds) {
      ball.pos.x *= layout.bounds / d;
      ball.pos.z *= layout.bounds / d;
    }
  } else if (G.state === 'title' || G.state === 'intro' || G.state === 'results') {
    ball.updateVisual(dt, G.t);
  }

  if (G.state !== 'pause') {
    movers.update(dt, G.t, ball, G.events);
    world.updateFlyers(dt);
  }
  handleEvents();
  if (G.state === 'play') {
    checkMilestones();
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
  if (G.state === 'play') {
    const sp = ball.speed() / ball.maxSpeed();
    if (sp > 0.25) fx.dust(ball.pos.x, ball.pos.z, S, sp * dt * 6, ball.heading);
    audio.roll(Math.min(1, sp), S);
  } else audio.roll(0, S);
  const g = layout.groups.dance;
  if (g && !movers.danceStopped && G.state !== 'title') {
    const dd = Math.hypot(ball.pos.x - g.x, ball.pos.z - g.z);
    const reach = 70 + S * 6;
    audio.squareDance(Math.max(0, 1 - dd / reach) ** 1.6);
  } else audio.squareDance(0);
  if (G.state === 'play') audio.setIntensity(Math.min(1, Math.log10(Math.max(1, S / START_SIZE)) / 3.5));

  player.update(dt, ball, G.t, false);
  rig.update(dt, ball, G.t);
  updateGiant(dt, G.t);
  fx.update(dt);
  world.flush();

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
  engine.scene.fog.density = 1 / Math.min(S * 320 + 1100, 6000);
  // beyond ~2.6 fog lengths everything is >99.8 % fog: don't draw it
  world.cullFar(engine.camera.position, 2.6 / engine.scene.fog.density);
  const focus = G.state === 'play' || G.state === 'pause' || G.state === 'finale' ? ball.group.position : rig.look;
  engine.updateShadow(focus, Math.max(3, S * 16));

  if (G.state === 'play') hud.update(ball.S, G.milestone, G.mode === 'timed' ? GAME_SECONDS - G.time : null, ball.stats.count);
  G.toastCd -= dt;
  G.hintCd -= dt;
}

function handleEvents() {
  for (const e of G.events) {
    switch (e.type) {
      case 'pickup': {
        const o = e.o;
        G.idleT = 0;
        audio.pickup(o.spec.sfx, e.rel, o.size);
        fx.pickup(o.centerX(), o.y + o.h * 0.5, o.centerZ(), o.size, ball.S);
        if (e.rel > 0.04 || !lastPreview.spec) {
          hud.lastItem(o.spec.name, o.size);
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
        rig.shake(0.08 * e.strength);
        fx.bump(ball.pos.x, ball.centerY, ball.pos.z, ball.S);
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
        if (G.toastCd <= 0) { hud.toast(`哎呀，掉了 <em>${e.count}</em> 件！`); G.toastCd = 1; }
        break;
      case 'dash': audio.dash(); break;
      case 'scream': audio.voice(e.o.spec.sfx, 0.8); break;
      case 'honk': audio.voice('horn', 0.5); break;
    }
  }
}

function checkMilestones() {
  let reached = -1;
  while (G.milestone < story.MILESTONES.length && ball.S >= story.MILESTONES[G.milestone][0]) {
    reached = G.milestone;
    G.milestone++;
  }
  if (reached >= 0) {
    const [size, line] = story.MILESTONES[reached];
    hud.toast(`<em>${fmt(size)}</em> 达成！`, true);
    audio.milestone(Math.min(8, reached + 1));
    dialog.interrupt(line);
    hud.bump();
  }
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
    dialog.say(story.PATCHED, { hold: 2 });
  }
  if (f.patched) {
    const k = Math.min(1, (f.t - 6) / 4);
    sky.u.uPatch.value = k;
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
  $('res-size').textContent = fmt(size);
  $('res-rank').textContent = `称号：${rank}`;
  $('res-quote').textContent = `女娲：${quote}`;
  const st = ball.stats;
  const mins = Math.floor(G.time / 60), secs = Math.floor(G.time % 60);
  const big = st.biggest ? `${st.biggest.name}（${fmt(st.biggest.size)}）` : '—';
  $('res-stats').innerHTML =
    `<span>滚起<b>${st.count}</b>件</span><span>用时<b>${mins}:${String(secs).padStart(2, '0')}</b></span>` +
    `<span>最大的一件<b>${big}</b></span><span>掉落<b>${st.lost}</b>件</span>`;
  const top = Object.entries(st.byType).sort((a, b) => b[1] - a[1]).slice(0, 18);
  $('res-items').innerHTML = top.map(([id, n]) => `<span>${(CATALOG.get(id) || {}).name || id} <b>×${n}</b></span>`).join('');
  $('res-brag').textContent = bragLine(size, rank, st);
  ball.portraitOnly(true);
  $('btn-copy').textContent = '复制战绩';
  $('results').hidden = false;
  const best = store.get('best', null);
  if (!best || size > best.size) store.set('best', { size, rank, at: Date.now() });
  rig.override = {
    pos: engine.camera.position.clone(),
    look: engine.camera.position.clone().addScaledVector(G.finale.H, 100),
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
  if (G.state === 'play' || G.state === 'pause') lastPreview.render(r, dt);
  if (dialog.active) nuwaPreview.render(r, dt);
  if (G.state === 'results' && G.prelaunch) renderBallPortrait(r, G.t);
}

// ---- test autopilot: steers to the nearest thing it can roll up ------------------------------

const ap = { target: null, retarget: 0, chase: 0, cands: [], skip: new Set() };
function autopilot(dt) {
  ap.retarget -= dt;
  const S = ball.S, limit = ball.pickLimit();
  ap.chase += dt;
  if (ap.target && ap.target.state === 0 && ap.chase > 5) { ap.skip.add(ap.target); ap.target = null; }
  if (!ap.target || ap.target.state !== 0 || ap.retarget <= 0) {
    ap.retarget = 0.6;
    const prev = ap.target;
    ap.target = null;
    let best = Infinity;
    for (const R of [S * 6, S * 20, S * 60]) {
      world.grid.query(ball.pos.x, ball.pos.z, R, ap.cands, S / 90);
      for (const o of ap.cands) {
        if (o.state !== 0 || o.size > limit || o.y > S || ap.skip.has(o)) continue;
        // value-for-distance, like a player eyeing the biggest thing they can take
        const d = Math.hypot(o.x - ball.pos.x, o.z - ball.pos.z);
        const score = (d + S * 1.5) / Math.pow(o.size / S, 1.5);
        if (score < best) { best = score; ap.target = o; }
      }
      if (ap.target) break;
    }
    if (ap.target !== prev) ap.chase = 0;
  }
  if (!ap.target) return { throttle: 1, turn: Math.sin(G.t * 0.7), turnImpulse: 0, dash: false };
  const dx = ap.target.x - ball.pos.x, dz = ap.target.z - ball.pos.z;
  const want = Math.atan2(dx, -dz);
  let diff = (want - ball.heading) % (Math.PI * 2);
  if (diff > Math.PI) diff -= Math.PI * 2;
  if (diff < -Math.PI) diff += Math.PI * 2;
  const ad = Math.abs(diff);
  // like a person would: stop and turn when the target is off to the side
  const throttle = ad < 0.25 ? 1 : ad < 0.6 ? 0.35 : 0;
  return { throttle, turn: Math.max(-1, Math.min(1, diff * 3)), turnImpulse: 0, dash: ad < 0.15 && Math.hypot(dx, dz) > S * 5 && Math.random() < 0.03 };
}

window.__wanwu = {
  G,
  get ball() { return ball; },
  get world() { return world; },
  get engine() { return engine; },
  get layout() { return layout; },
  GROW,
  start: mode => startGame(mode || 'timed'),
  skipIntro() { dialog.clear(); beginPlay(); },
  autopilot(on = true) { G.autopilot = on; },
  /** fast-forward the game with the autopilot, no rendering; returns [seconds, size] samples */
  sim(seconds, dt = 1 / 30) {
    if (G.state !== 'play') { dialog.clear(); beginPlay(); }
    G.autopilot = true;
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
