// 小区高尔夫 (working title) — mini golf through a 小区, built from 万物皆可滚's models: a golf ball,
// and each hole ends in a cup with a glowing rim. Hold and pull back anywhere, let go to putt (a dotted line shows where it will run, up to the first bounce).
// Every hole has its own nuisance: rubber ducks and a seesaw in the way, fans blowing, cars crossing, a
// goose guarding the hole, a cat swiping, tyres; until the first shot each says over it what it
// does to the ball. Stars: one for sinking it, one for par or better, one for every coin on the
// green picked up on the way. The holes are in yards of nine (the duck pond, then the pool party at
// sundown, with slopes and things that turn), each yard a round: the best strokes for each hole and
// for a whole round are kept, and a hole opens once the one before it is done (a yard's first hole
// is always open). The menu (top left, or
// Esc) pauses: start the hole again, sound and music, or pick a hole from the grid. On CrazyGames
// (node build.mjs golf-crazygames) their SDK hears when a hole is being played (game/portal.js).
import * as THREE from 'three';
import '../catalog/index.js';
import './models/index.js';
import { CATALOG } from '../catalog/registry.js';
import { buildAtlas, loadFonts, atlasTexture, withoutHanzi } from '../core/atlas.js';
import { objectMaterial, U as MU } from '../core/materials.js';
import { buildSpec } from '../core/assets.js';
import { Engine } from '../game/engine.js';
import { FX } from '../game/fx.js';
import { audio } from '../audio/audio.js';
import { t, translateDom, EN } from '../i18n/index.js';
import { applyContent } from '../i18n/apply.js';
import { BALL_R, CUP_R, PHYS, stepBall, simulate, shotSpeed, windAt, slopeAt } from './physics.js';
import { buildCourse } from './course.js';
import { buildProps } from './props.js';
import { HOLES, YARDS, PER } from './holes.js';
import { golfBall, Trail } from './ball.js';
import { Confetti } from './confetti.js';
import { portalInit, portalLoaded, portalPlaying, portalOnMute } from '../game/portal.js';
import { strayHost } from '../game/guard.js';

// counted things in English: '{n} stroke{s}'
const pl = (zh, n, vars) => t(zh, { n, s: n === 1 ? '' : 's', ...vars });

applyContent();

const $ = id => document.getElementById(id);
const PLATFORM = typeof __PLATFORM__ !== 'undefined' ? __PLATFORM__ : 'site';
const nextFrame = () => new Promise(r => requestAnimationFrame(() => r()));
const GIVE_UP = 5; // strokes over par before the hole lets you off
const SKIP = 3; // strokes over par before it offers to let you off
const store = {
  get(k, d) { try { const v = localStorage.getItem('golf.' + k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('golf.' + k, JSON.stringify(v)); } catch {} },
};

let engine, material, fx, confetti;
const specs = new Map();
const spec = id => {
  if (!specs.has(id)) { const def = CATALOG.get(id); if (!def) throw new Error('no model ' + id); specs.set(id, buildSpec(def)); }
  return specs.get(id);
};
/** a catalog model standing on y = 0 of its group, centred on its footprint; real size × k, or
 *  `size` metres across its largest side */
function model(id, k = 1, size) {
  const s = spec(id);
  if (size) k = size / s.maxDim;
  const mesh = new THREE.Mesh(s.geometry, material);
  mesh.userData.keep = true; // (its geometry and material are shared: see course.dispose)
  mesh.scale.setScalar(k);
  mesh.position.set(-s.center.x * k, -s.bbox.min.y * k, -s.center.z * k);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  const g = new THREE.Group();
  g.add(mesh);
  return g;
}

const G = {
  hole: 0, state: 'load', strokes: 0, got: 0, best: [], rounds: [], paused: false, course: null, props: [], cols: [], sweets: [],
  ball: { x: 0, z: 0, vx: 0, vz: 0, lip: 0 }, still: 0, aim: null, hitT: 0, t: 0, sinkT: 0, live: true,
  pushed() { if (G.state === 'aim') { G.aim = null; showAim(false); G.state = 'roll'; G.still = 0; G.rollT = 0; } },
};

async function boot() {
  translateDom();
  if (EN) document.title = t('小区高尔夫');
  else $('logo').innerHTML = '<div class="l2">小区高尔夫</div>';
  // the CrazyGames build plays on CrazyGames only (and opened from disk or this machine): a copy
  // put up anywhere else says so instead
  if (PLATFORM === 'crazygames' && strayHost()) {
    $('loading').firstElementChild.textContent = t('这个游戏只在 CrazyGames 上玩');
    return;
  }
  portalInit();
  audio.setMuted(store.get('muted', false));
  // (the signs' Chinese wants the web fonts, waited for briefly; in English nothing painted needs
  // one, and only the numbers' Baloo 2 is fetched)
  const fontsDone = loadFonts(12000, EN);
  if (!EN) await Promise.race([fontsDone, new Promise(r => setTimeout(r, 600))]);
  await nextFrame();
  if (EN) withoutHanzi(); // (no Chinese on the signs for players who can't read it)
  buildAtlas();
  material = objectMaterial(atlasTexture());
  engine = new Engine($('game'), matchMedia('(pointer: coarse)').matches ? 'medium' : 'high');
  const sc = engine.scene;
  sc.fog = new THREE.Fog(0xd4effc, 45, 95); // (each yard colours it and the sky and the light: lookOf)
  fx = new FX(sc);
  confetti = new Confetti($('confetti'));
  makeBall(sc);
  makeAim(sc);
  engine.camera.fov = 40;
  addEventListener('resize', () => { aim(); fitHud(); hudBottom(); placeLogo(); dropBanner(); G.redraw = true; });
  // (the bars grow when the numbers' font arrives: what is placed under them moves down with them)
  if (window.ResizeObserver) {
    const ro = new ResizeObserver(() => { fitHud(); hudBottom(); placeLogo(); dropBanner(); });
    for (const id of ['hole', 'score', 'stars']) ro.observe($(id));
  }
  const cv = $('game');
  cv.addEventListener('pointerdown', onDown);
  cv.addEventListener('contextmenu', e => e.preventDefault());
  addEventListener('pointermove', onMove);
  addEventListener('pointerup', onUp);
  addEventListener('pointercancel', () => { G.aim = null; showAim(false); });
  // (once each: a second tap, or Enter on a focused button as well as the key below, does nothing)
  $('card-btn').addEventListener('click', () => { if (G.state !== 'card' || G.paused) return; audio.tap(); next(); });
  $('card-retry').addEventListener('click', () => { if (G.state !== 'card' || G.paused) return; audio.tap(); load(G.hole); });
  $('card-holes').addEventListener('click', () => { if (G.state !== 'card' || G.paused) return; audio.tap(); menu('holes'); });
  $('skip').addEventListener('click', () => { if (!canSkip()) return; audio.tap(); finish(false, true); });
  makeMenu();
  // (Enter and Space press a button that has the focus themselves; Cmd/Ctrl+R is the browser's)
  addEventListener('keydown', e => {
    if (e.repeat || e.metaKey || e.ctrlKey || e.altKey || G.state === 'load') return;
    // Esc (or P) opens the menu and backs out of it
    if (e.key === 'Escape' || e.key === 'p' || e.key === 'P') {
      if (!G.paused) menu('main');
      else if (!$('menu-holes').hidden && menuFrom === 'main') menu('main');
      else unpause();
      return;
    }
    if (G.paused || G.state !== 'card') return;
    // (a button keeps Enter for itself if it is on the card or was reached with Tab; one only clicked,
    // like the speaker, doesn't)
    const el = document.activeElement, onButton = el?.tagName === 'BUTTON' && ($('card').contains(el) || tabbed(el));
    if ((e.key === 'Enter' || e.key === ' ') && !onButton) { e.preventDefault(); $('card-btn').click(); }
    else if (e.key === 'r' || e.key === 'R') $('card-retry').click();
  });
  const mute = $('mute');
  const showMute = () => {
    mute.classList.toggle('off', audio.muted);
    mute.setAttribute('aria-label', t(audio.muted ? '打开声音' : '关掉声音'));
    $('m-sound').classList.toggle('off', audio.muted);
    $('m-music').classList.toggle('off', !audio.musicOn);
  };
  // muted by the button (kept) or by CrazyGames' own setting, which wins; the music can be turned
  // off on its own in the menu
  let portalMute = false;
  const applyMute = () => { audio.setMuted(portalMute || store.get('muted', false)); showMute(); };
  // (stores the opposite of what is heard: under CrazyGames' mute a tap never leaves it muted later)
  const toggleSound = () => { store.set('muted', !audio.muted); applyMute(); wake(); };
  mute.addEventListener('click', toggleSound);
  $('m-sound').addEventListener('click', () => { toggleSound(); audio.tap(); });
  $('m-music').addEventListener('click', () => { store.set('music', audio.toggleMusic()); showMute(); audio.tap(); wake(); });
  if (!store.get('music', true) && audio.musicOn) audio.toggleMusic();
  portalOnMute(m => { portalMute = m; applyMute(); });
  showMute();
  // (a hidden tab goes quiet; CrazyGames sees it is hidden for itself, so gameplay isn't stopped)
  document.addEventListener('visibilitychange', () => { if (document.hidden) audio.suspend(); else audio.resume(); });
  G.best = store.get('best', []);
  G.rounds = store.get('rounds', null);
  if (!G.rounds) {
    // (kept from before there were yards: the first yard's round, and how far it had been played, as
    // holes played with no stars yet so that they stay open)
    G.rounds = [store.get('round', [])];
    const was = Math.min(PER, Math.max(store.get('reached', 0), store.get('hole', 0)));
    for (let i = 0; i < was; i++) if (G.best[i] == null) G.best[i] = 0;
    store.set('best', G.best);
    // (one who had played the whole of it, back at its first hole, comes back to the new yard)
    if (!store.get('hole', 0) && HOLES.slice(0, PER).every((h, i) => G.best[i] != null)) store.set('hole', PER);
  }
  for (let y = 0; y < YARDS.length; y++) G.rounds[y] = G.rounds[y] || [];
  store.set('rounds', G.rounds);
  // (back at a yard's first hole, its round starts again, as it does going there any other way)
  const at = Math.min(store.get('hole', 0), HOLES.length - 1);
  load(at, at % PER === 0);
  portalLoaded(); // (before the first frame, which says the hole is being played)
  requestAnimationFrame(loop);
  await nextFrame();
  $('loading').classList.add('done');
  window.__ready = true;
}

const tabbed = el => { try { return el.matches(':focus-visible'); } catch { return false; } };

/** tell the portal whether a hole is being played (not while the card between holes is up) */
function playing() {
  portalPlaying(G.state !== 'card' && G.state !== 'load' && !G.paused);
}

/** the sky behind, top to horizon as seen on the screen */
function sky(stops) {
  const c = document.createElement('canvas');
  c.width = 2; c.height = 256;
  const g = c.getContext('2d'), gr = g.createLinearGradient(0, 0, 0, 256);
  for (const [at, col] of stops) gr.addColorStop(at, col);
  g.fillStyle = gr;
  g.fillRect(0, 0, 2, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
// each yard's light: the duck pond at midday (deep blue overhead, paling to the haze), the pool party
// at sundown (warm, low sun, a peach sky)
const LOOKS = {
  pond: { sky: [[0, '#4fb0f2'], [0.55, '#9fd8fa'], [1, '#d4effc']], fog: 0xd4effc, hemi: [0xeaf6ff, 0x9cc48a, 1.35], sun: [0xfff1dc, 2.8, [-0.35, 1, 0.5]] },
  pool: { sky: [[0, '#5a7fd6'], [0.42, '#d99ab8'], [0.75, '#ffbf8f'], [1, '#ffe0b0']], fog: 0xffd9b0, hemi: [0xffe2c8, 0xa59a74, 1.5], sun: [0xffc98f, 3.3, [-0.75, 0.9, 0.4]] },
};
const skies = {};
function lookOf(name) {
  const L = LOOKS[name], e = engine, sc = e.scene;
  sc.background = skies[name] || (skies[name] = sky(L.sky));
  sc.fog.color.set(L.fog);
  e.hemi.color.set(L.hemi[0]);
  e.hemi.groundColor.set(L.hemi[1]);
  e.hemi.intensity = L.hemi[2];
  e.sun.color.set(L.sun[0]);
  e.sun.intensity = L.sun[1];
  e.sunDir.set(...L.sun[2]).normalize();
}

async function wake() {
  try { await audio.init(); if (!G.music) { G.music = true; audio.music('golf', { fade: 2 }); } } catch {}
}

// ---- the ball and the aiming guide -----------------------------------------------------------------
let ballG, ballSpin, ghost, trail, arrow, arrowMat, dots, ring;
function makeBall(sc) {
  ballG = new THREE.Group();
  ballSpin = golfBall(BALL_R);
  // (drawn with the see-through things, so that on a slope it can be drawn after the aiming arrow)
  for (const m of [ballSpin.material, ballSpin.children[0].material]) m.transparent = true;
  // and its ghost: a pale ball drawn only where something stands in front of it (a windmill, its
  // tunnel), so it is never lost from sight; shown only on holes with something tall on them
  ghost = new THREE.Mesh(ballSpin.geometry, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6, depthWrite: false, depthFunc: THREE.GreaterDepth }));
  ghost.renderOrder = 20;
  ghost.visible = false;
  ballSpin.add(ghost);
  ballG.add(ballSpin);
  sc.add(ballG);
  trail = new Trail(sc, BALL_R * 0.8);
}
function makeAim(sc) {
  // an arrow flat on the green from the ball, longer and redder with power
  const shape = new THREE.Shape();
  shape.moveTo(-0.05, 0); shape.lineTo(0.05, 0); shape.lineTo(0.05, 0.75); shape.lineTo(0.14, 0.75);
  shape.lineTo(0, 1); shape.lineTo(-0.14, 0.75); shape.lineTo(-0.05, 0.75); shape.closePath();
  // (drawn over everything: on a slope it would dip into the green)
  arrowMat = new THREE.MeshBasicMaterial({ color: 0xffd34d, transparent: true, opacity: 0.9, depthWrite: false, depthTest: false });
  arrow = new THREE.Mesh(new THREE.ShapeGeometry(shape), arrowMat);
  arrow.rotation.x = -Math.PI / 2;
  arrow.renderOrder = 3;
  const holder = new THREE.Group();
  holder.add(arrow);
  arrow.userData.holder = holder;
  sc.add(holder);
  // dots along where it will run
  dots = new THREE.InstancedMesh(new THREE.SphereGeometry(0.035, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffffff }), 40);
  dots.count = 0;
  sc.add(dots);
  ring = new THREE.Mesh(new THREE.RingGeometry(BALL_R * 1.6, BALL_R * 1.9, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7, depthWrite: false }));
  sc.add(ring);
  showAim(false);
}
function showAim(on) {
  arrow.userData.holder.visible = on;
  dots.visible = on;
  $('power').hidden = !on;
  if (on) $('hint').hidden = true;
}

/** the green's height at (x, z), and which way is up from it there (into `out`) */
const ground = (x, z) => G.course.Y(x, z);
const UP = new THREE.Vector3(0, 1, 0);
function upAt(x, z, out) {
  const gr = G.course.ground;
  if (!gr) return out.copy(UP);
  const g = gr.grad(x, z);
  return out.set(-g[0], 1, -g[1]).normalize();
}

// ---- a coin to pick up: gold, standing on its edge and turning, over a glow on the green ----------
let coinParts;
function coin() {
  if (!coinParts) {
    const star = new THREE.Shape();
    for (let i = 0; i < 10; i++) {
      const r = i % 2 ? 0.055 : 0.13, a = (i / 10) * Math.PI * 2 + Math.PI / 2;
      star[i ? 'lineTo' : 'moveTo'](Math.cos(a) * r, Math.sin(a) * r);
    }
    const glow = document.createElement('canvas');
    glow.width = glow.height = 64;
    const gg = glow.getContext('2d'), gr = gg.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255, 230, 120, 0.9)'); gr.addColorStop(1, 'rgba(255, 230, 120, 0)');
    gg.fillStyle = gr;
    gg.fillRect(0, 0, 64, 64);
    coinParts = {
      disc: new THREE.CylinderGeometry(0.2, 0.2, 0.06, 28).rotateX(Math.PI / 2),
      rim: new THREE.TorusGeometry(0.2, 0.02, 6, 28),
      star: new THREE.ShapeGeometry(star),
      gold: new THREE.MeshLambertMaterial({ color: 0xffc22e, emissive: 0x6a4200 }),
      edge: new THREE.MeshLambertMaterial({ color: 0xffdf6e, emissive: 0x6a4a00 }),
      face: new THREE.MeshBasicMaterial({ color: 0xfff1a8 }),
      glowGeo: new THREE.PlaneGeometry(0.8, 0.8).rotateX(-Math.PI / 2),
      glow: new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(glow), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }),
    };
  }
  const P = coinParts, g = new THREE.Group(), spin = new THREE.Group();
  const disc = new THREE.Mesh(P.disc, P.gold);
  disc.castShadow = true;
  spin.add(disc, new THREE.Mesh(P.rim, P.edge));
  for (const s of [1, -1]) {
    const st = new THREE.Mesh(P.star, P.face);
    st.position.z = s * 0.032;
    st.rotation.y = s > 0 ? 0 : Math.PI;
    spin.add(st);
  }
  spin.position.y = 0.3;
  g.add(spin, new THREE.Mesh(P.glowGeo, P.glow));
  g.children[1].position.y = 0.012;
  g.traverse(o => { o.userData.keep = true; }); // (all its parts are shared by every coin)
  g.userData.spin = spin;
  return g;
}

// ---- a hole ----------------------------------------------------------------------------------------------
/** play hole i (`fresh`: a new round of its yard starts with it, as at a yard's first hole). A round
 *  is over once its last hole has been played: whatever is played next in that yard starts the next
 *  one, unless it is that hole again (a retry, which doesn't touch the round) */
function load(i, fresh = false) {
  const retry = !!G.course && i === G.hole;
  if (G.course) G.course.dispose();
  for (const k of cardTimers.splice(0)) clearTimeout(k);
  G.hole = i;
  const hole = HOLES[i], y = yardOf(i);
  const ctx = { model, spec, audio, fx };
  if (G.yard !== y) { G.yard = y; lookOf(YARDS[y].look); }
  G.course = buildCourse(hole, i, { scene: engine.scene, model, num: (i % PER) + 1, look: YARDS[y].look, aniso: Math.min(8, engine.renderer.capabilities.getMaxAnisotropy()) });
  G.props = buildProps(hole, G.course, ctx);
  G.cols = [...G.course.cols, ...G.props.flatMap(p => p.cols)];
  G.course.cols = G.cols; // what the ball meets: walls and everything on the green
  G.sweets = G.course.candies.map((p, k) => {
    const g = coin();
    g.position.set(p.x, ground(p.x, p.z), p.z);
    // (its glow lying along a slope, lifted a little clear of a curve in it)
    if (G.course.ground) { g.children[1].quaternion.setFromUnitVectors(UP, upAt(p.x, p.z, tmpV)); g.children[1].position.y = 0.03; }
    G.course.group.add(g);
    return { x: p.x, z: p.z, g, got: false, t: k };
  });
  Object.assign(G.ball, { x: G.course.tee.x, z: G.course.tee.z, vx: 0, vz: 0, lip: 0 });
  G.from = { x: G.ball.x, z: G.ball.z };
  G.green = new Set(G.course.tiles.map(q => q.c + ',' + q.r));
  ballG.visible = true;
  ballG.scale.setScalar(1);
  trail.reset();
  trail.lift = G.course.ground ? ground : null;
  // (on a slope the aiming arrow is drawn over the green, which it would dip into, and the ball after it;
  // on the flat, as it always was)
  const sloped = !!G.course.ground;
  arrowMat.depthTest = !sloped;
  ballSpin.renderOrder = sloped ? 5 : 0;
  ballSpin.children[0].renderOrder = sloped ? 4 : 0;
  ghost.visible = G.props.some(p => p.tall);
  G.strokes = 0; G.got = 0; G.still = 0; G.aim = null; G.state = 'aim'; G.live = true;
  showAim(false);
  $('card').hidden = true;
  $('hint').hidden = i > 0 || store.get('shot', false);
  if (fresh || (!retry && G.rounds[y][PER - 1] != null)) { G.rounds[y] = []; store.set('rounds', G.rounds); }
  if (G.paused) unpause();
  hud();
  aim();
  // (the game's name over the first hole played; a yard's name over its first hole)
  banner(t(hole.name), t(hole.tip), !G.titled, i % PER ? '' : t(YARDS[y].name));
  G.titled = true;
  // what each nuisance does (one of each kind: the one lowest on the screen, so furthest from the
  // bars at the top), and on the first hole what the coins are for
  const pick = new Map();
  for (const p of G.props) if (p.tag) {
    tagV.set(...p.tag.at()).project(engine.camera);
    const y = (Math.abs(tagV.x) <= 1 ? 0 : 10) + tagV.y, had = pick.get(p.tag.text);
    if (!had || y < had.y) pick.set(p.tag.text, { tag: p.tag, y });
  }
  const list = [...pick.values()].map(v => v.tag);
  if (i === 0 && G.sweets.length) { const s = G.sweets[0]; list.push({ text: '全捡到 +1 ★', at: () => [s.x, 0.6, s.z] }); }
  showTags(list);
  store.set('hole', i);
}

// ---- the tags: a word over each thing that does something to the ball, till the first shot -------
let tags = [], tagsTimer = 0, tagTop = 0;
const tagV = new THREE.Vector3();
function showTags(list) {
  const box = $('tags');
  box.innerHTML = '';
  box.classList.add('out');
  tags = list.map(tg => {
    const el = document.createElement('div');
    el.className = 'tag';
    el.textContent = t(tg.text);
    box.appendChild(el);
    return { at: tg.at, el, half: el.offsetWidth / 2, h: el.offsetHeight };
  });
  hudBottom();
  // (they come in once the hole's name, which they would sit under, has gone)
  clearTimeout(tagsTimer);
  const hole = G.hole;
  const wait = $('banner').classList.contains('logo') ? 3200 : 2100; // (the banner with the name stays longer)
  tagsTimer = setTimeout(() => { if (G.hole === hole && G.strokes === 0 && G.state !== 'card') box.classList.remove('out'); }, wait);
}
/** where the bars at the top end */
function hudBottom() {
  tagTop = Math.max(...['hole', 'score', 'stars'].map(id => $(id).getBoundingClientRect().bottom)) + 6;
}
function placeTags() {
  if (!tags.length) return;
  const cv = engine.renderer.domElement, w = cv.clientWidth, h = cv.clientHeight, placed = [];
  // the cup and the ball stay in sight: a tag that would cover them moves off as off another tag
  for (const [x, z, rad] of [[G.course.cup.x, G.course.cup.z, 0.3], [G.ball.x, G.ball.z, 0.2], ...G.sweets.filter(s => !s.got).map(s => [s.x, s.z, 0.25])]) {
    tagV.set(x, ground(x, z), z).project(engine.camera);
    const cx = ((tagV.x + 1) / 2) * w, cy = ((1 - tagV.y) / 2) * h;
    tagV.set(x + rad, 0, z).project(engine.camera);
    const R = Math.max(10, Math.abs(((tagV.x + 1) / 2) * w - cx));
    placed.push({ x: cx - R, y: cy - R, w: 2 * R, h: 2 * R });
  }
  for (const tg of tags) {
    tagV.set(...tg.at()).project(engine.camera);
    // kept on the screen and off the bars at the top: a thing near an edge has its tag pushed in,
    // one up by the bars has it below instead of above; and a tag that would cover another moves on
    const x = Math.max(6, Math.min(w - 2 * tg.half - 6, ((tagV.x + 1) / 2) * w - tg.half));
    const py = ((1 - tagV.y) / 2) * h;
    let below = py - 8 - tg.h < tagTop, y = below ? py + 8 : py - 8 - tg.h;
    for (let k = 0; k < 4; k++) {
      const o = placed.find(r => x < r.x + r.w && r.x < x + 2 * tg.half && y < r.y + r.h && r.y < y + tg.h);
      if (!o) break;
      y = below ? o.y + o.h + 4 : o.y - tg.h - 4;
      // (no room above it, up by the bars: below it instead)
      if (!below && y < tagTop) { below = true; y = o.y + o.h + 4; }
    }
    y = Math.max(tagTop, Math.min(h - tg.h - 6, y));
    placed.push({ x, y, w: 2 * tg.half, h: tg.h });
    tg.el.classList.toggle('below', below);
    tg.el.style.transform = `translate(${x}px, ${y}px)`;
  }
}

// ---- the menu: paused, or picking a hole ---------------------------------------------------------------
let menuFrom = 'main'; // (the page it was opened at: Back from the holes goes there, or closes it)
const LOCK = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8.5 11V8a3.5 3.5 0 0 1 7 0v3"/></svg>';
function makeMenu() {
  $('menu-btn').addEventListener('click', () => { if (G.state === 'load' || G.paused) return; wake(); audio.tap(); menu('main'); });
  $('m-resume').addEventListener('click', () => { audio.tap(); unpause(); });
  $('m-restart').addEventListener('click', () => { audio.tap(); load(G.hole); });
  $('m-holes').addEventListener('click', () => { audio.tap(); menu('holes'); });
  const back = () => { if (!$('menu-holes').hidden && menuFrom === 'main') menu('main'); else unpause(); };
  $('h-back').addEventListener('click', () => { audio.tap(); back(); });
  $('menu').addEventListener('click', e => { if (e.target === $('menu')) back(); }); // (around the panel)
  $('hole-grid').addEventListener('click', e => {
    const tile = e.target.closest('.tile');
    if (!tile) return;
    const i = +tile.dataset.i;
    if (!opened(i)) { tile.classList.remove('no'); void tile.offsetWidth; tile.classList.add('no'); audio.wall(0.3); return; }
    audio.tap();
    load(i, i % PER === 0);
  });
  // (the yards' tabs over the grid)
  $('yard-tabs').addEventListener('click', e => {
    const tab = e.target.closest('button');
    if (!tab || +tab.dataset.y === shownYard) return;
    audio.tap();
    shownYard = +tab.dataset.y;
    holesPage();
    $('yard-tabs').querySelector('.on').focus({ preventScroll: true }); // (the tabs are made anew: the focus stays on the one chosen)
  });
}
let shownYard = 0;
/** the holes page: a tab for each yard, the yard's holes, and its round so far */
function holesPage() {
  const y = shownYard;
  $('yard-tabs').innerHTML = YARDS.map((yd, k) => `<button class="${k === y ? 'on' : ''}" data-y="${k}" aria-pressed="${k === y}">`
    + `<span>${t(yd.name)}</span><small><i>★</i>${starsIn(k)}/${PER * 3}</small></button>`).join('');
  $('hole-grid').innerHTML = holeGrid(y);
  $('h-stars').textContent = `${starsAll()}/${HOLES.length * 3}`;
  $('h-round').innerHTML = G.rounds[y].some(s => s != null) ? `<div class="lbl">${t('这一轮')}</div>${scorecard(y)}` : '';
}
/** pause and show the menu's main page or the holes */
function menu(page) {
  if (!G.paused) {
    G.paused = true;
    menuFrom = page;
    G.aim = null;
    showAim(false);
    $('menu').hidden = false;
    $('hud').inert = $('card').inert = true; // (Tab stays in the menu)
  }
  $('menu-main').hidden = page !== 'main';
  $('menu-holes').hidden = page !== 'holes';
  if (page === 'holes') { shownYard = G.yard; holesPage(); }
  // (for the keys: Enter presses the first button)
  (page === 'main' ? $('m-resume') : $('hole-grid').querySelector('.cur') || $('h-back')).focus({ preventScroll: true });
}
function unpause() {
  G.paused = false;
  $('menu').hidden = true;
  $('hud').inert = $('card').inert = false;
  document.activeElement?.blur?.();
}

const yardOf = i => Math.floor(i / PER);
/** a hole can be played: the first of its yard, or the one before it has been played */
const opened = i => i % PER === 0 || G.best[i - 1] != null;

/** a yard's holes, each with its stars and its fewest strokes; those not reached yet locked */
function holeGrid(y) {
  const fewest = store.get('strokes', []);
  return HOLES.slice(y * PER, y * PER + PER).map((h, k) => {
    const i = y * PER + k, cls = 'tile' + (i === G.hole ? ' cur' : '');
    if (!opened(i)) return `<button class="${cls} locked" data-i="${i}" aria-label="${t('第 {n} 洞', { n: k + 1 })} · ${t('还没打到这洞')}"><b>${k + 1}</b>${LOCK}</button>`;
    const st = G.best[i] || 0;
    return `<button class="${cls}" data-i="${i}"><b>${k + 1}</b><span class="nm">${t(h.name)}</span>`
      + `<span class="ss">${[0, 1, 2].map(k => `<i${k < st ? ' class="on"' : ''}>★</i>`).join('')}</span>`
      + `<span class="bs">${fewest[i] ? t('最好 {n} 杆', { n: fewest[i] }) : t('标准 {n}', { n: h.par })}</span></button>`;
  }).join('');
}

/** a yard's round so far: its strokes, hole by hole, under each hole's par */
function scorecard(y) {
  const holes = HOLES.slice(y * PER, y * PER + PER), round = G.rounds[y];
  const par = holes.reduce((a, h) => a + h.par, 0), played = round.filter(s => s != null);
  const row = (cls, head, cells, sum) => `<tr class="${cls}"><th>${head}</th>${cells.join('')}<th class="sum">${sum}</th></tr>`;
  return '<table class="sc">'
    + row('num', t('洞'), holes.map((h, i) => `<td>${i + 1}</td>`), t('合计'))
    + row('par', t('标准杆'), holes.map(h => `<td>${h.par}</td>`), par)
    + row('you', t('你'), holes.map((h, i) => {
      const s = round[i], d = s - h.par;
      return s == null ? '<td></td>' : `<td><span${d < 0 ? ' class="under"' : d > 0 ? ' class="over"' : ''}>${s}</span></td>`;
    }), played.length ? played.reduce((a, b) => a + b, 0) : '')
    + '</table>';
}

/** a hole that has taken par + 3 offers to be let off (counting the strokes it took) */
const canSkip = () => G.state === 'aim' && !G.paused && G.strokes >= HOLES[G.hole].par + SKIP;

/** on to the next hole; after a yard's last, the next yard's first (after the last yard's, the first's) */
function next() {
  if ((G.hole + 1) % PER) load(G.hole + 1);
  else load((G.hole + 1) % HOLES.length, true);
}

function hud() {
  const hole = HOLES[G.hole];
  $('hole-num').textContent = t('{n}/{all} 洞', { n: (G.hole % PER) + 1, all: PER });
  $('hole-name').textContent = t(hole.name);
  $('strokes-num').textContent = G.strokes;
  $('par').textContent = t('标准 {n}', { n: hole.par });
  $('sweets-num').textContent = `${G.got}/${G.sweets.length}`;
  $('stars-num').textContent = `${starsAll()}/${HOLES.length * 3}`;
  fitHud();
}
/** where the hole's name would run into the strokes in the middle (a middling width), it is left
 *  out: the number stays (measured with the name in, so the bars end up the same size each time) */
function fitHud() {
  const hole = $('hole'), score = $('score');
  hole.classList.remove('tight');
  const h = hole.getBoundingClientRect(), s = score.getBoundingClientRect();
  if (s.top < h.bottom && h.right + 8 > s.left) hole.classList.add('tight');
}
const starsAll = () => G.best.reduce((a, b) => a + (b || 0), 0);
const starsIn = y => G.best.slice(y * PER, y * PER + PER).reduce((a, b) => a + (b || 0), 0);

/** the banner with the game's name hangs just under the bars at the top */
function placeLogo() {
  const b = $('banner');
  if (!b.classList.contains('logo')) return;
  hudBottom();
  b.style.setProperty('--below-hud', tagTop + 8 + 'px');
}

function banner(title, sub, logo, kick = '') {
  const b = $('banner');
  b.hidden = true;
  b.classList.toggle('logo', !!logo);
  placeLogo();
  $('banner-kick').textContent = kick;
  $('banner-title').textContent = title;
  $('banner-sub').textContent = sub || '';
  void b.offsetWidth;
  b.hidden = false;
  dropBanner();
}
/** on a short screen the banner in the middle would run up into the bars at the top (it drifts up to
 *  62% of its height above its centre as it fades): it comes down below them, again whenever they grow */
function dropBanner() {
  const b = $('banner');
  b.style.marginTop = '0px';
  if (b.hidden || b.classList.contains('logo')) return;
  hudBottom();
  const top = b.offsetTop - b.offsetHeight * 0.62;
  if (top < tagTop + 4) b.style.marginTop = `${tagTop + 4 - top}px`;
}

/** frame the whole hole from its near end, so the ball starts near the player and is hit away from
 *  them: as close as still shows every wall and the flag, clear of the bars at top and bottom */
function aim() {
  const c = engine.camera, b = G.course.bounds;
  const cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2;
  const dir = new THREE.Vector3(0, 0, 1); // (every hole is drawn with its tee at the near end, +z)
  const pts = [], C = G.course;
  for (const x of [b.x0, b.x1]) for (const z of [b.z0, b.z1]) pts.push(new THREE.Vector3(x, 0, z), new THREE.Vector3(x, 0.3, z));
  pts.push(new THREE.Vector3(C.cup.x, 1.3 + ground(C.cup.x, C.cup.z), C.cup.z));
  // (where the ground rises, the rails' tops along the edges too)
  if (C.ground) for (const t of C.tiles) {
    const p = C.at(t.c, t.r);
    for (const [dx, dz] of [[-0.5, -0.5], [0.5, -0.5], [-0.5, 0.5], [0.5, 0.5]]) {
      const x = p.x + dx, z = p.z + dz, y = ground(x, z);
      if (y > 0.02) pts.push(new THREE.Vector3(x, y + 0.3, z));
    }
  }
  const target = new THREE.Vector3(cx, 0, cz);
  let tilt = 0.62; // from straight down
  const fits = d => {
    c.position.copy(target).addScaledVector(dir, Math.sin(tilt) * d);
    c.position.y = Math.cos(tilt) * d;
    c.lookAt(target);
    c.updateMatrixWorld();
    let minY = 1, maxY = -1;
    for (const p of pts) {
      const v = p.clone().project(c);
      if (Math.abs(v.x) > 0.92) return false;
      minY = Math.min(minY, v.y); maxY = Math.max(maxY, v.y);
    }
    // and centre it up and down between the bars, with room under the near end to pull back in
    return maxY < 0.8 && minY > -0.76;
  };
  const fit = () => {
    let lo = 3, hi = 80;
    for (let i = 0; i < 24; i++) { const m = (lo + hi) / 2; if (fits(m)) hi = m; else lo = m; }
    fits(hi);
    return hi;
  };
  c.updateProjectionMatrix();
  // how steeply to look down: lower, more from behind the ball, when that shows the near end of the
  // hole clearly bigger (a long hole on a wide screen, which from above would be a thin strip down
  // the middle), but not so low that the far end comes out less than 0.4 the size of the near end
  // (a wide hole on a tall screen gains nothing from it, only flattens, so stays as seen from above)
  const metre = z => {
    const a = new THREE.Vector3(cx, 0, z).project(c), e = new THREE.Vector3(cx + 1, 0, z).project(c);
    return Math.abs(e.x - a.x);
  };
  // (something tall in front of the cup, a windmill, keeps it from looking any lower than still shows
  // the near side of the cup over its top)
  const talls = G.props.filter(p => p.tall && p.tall.z > C.cup.z).map(p => p.tall);
  const rim = new THREE.Vector3(C.cup.x, ground(C.cup.x, C.cup.z), C.cup.z + CUP_R);
  const hidden = () => talls.some(t => hides(t, rim));
  let best = 0.62, most = 0;
  for (let a = 0.62; a <= (HOLES[G.hole].tilt || 1.25); a += 0.03) {
    tilt = a;
    fit();
    if (talls.length && a > 0.62 && hidden()) break;
    const near = metre(b.z1);
    if (metre(b.z0) < near * 0.4) break;
    if (near > most * 1.02) { most = near; best = a; }
  }
  tilt = best;
  fit();
  // any room left over up and down (a wide hole on a tall screen) goes over the far end, where it is
  // sky and park: the course is moved down the screen as far as it goes without coming out smaller
  const lowest = () => Math.min(...pts.map(p => p.clone().project(c).y));
  if (lowest() > -0.72) {
    const base = target.clone();
    let lo = 0, hi = b.z1 - b.z0;
    for (let i = 0; i < 18; i++) {
      const m = (lo + hi) / 2;
      target.copy(base).addScaledVector(dir, -m);
      fit();
      if (lowest() > -0.72) lo = m; else hi = m;
    }
    target.copy(base).addScaledVector(dir, -lo);
    fit();
  }
  // yard things standing in front of the course (between it and the camera) are left out: any
  // whose box, seen from here, reaches into the course (or the fans standing just outside it)
  for (const w of G.course.winds) pts.push(new THREE.Vector3(w.x, -0.1, w.z), new THREE.Vector3(w.x, 1.8, w.z));
  let x0 = 1, x1 = -1, y0 = 1, y1 = -1;
  for (const p of pts) { const v = p.clone().project(c); x0 = Math.min(x0, v.x); x1 = Math.max(x1, v.x); y0 = Math.min(y0, v.y); y1 = Math.max(y1, v.y); }
  const v = new THREE.Vector3(), mid = new THREE.Vector3(cx, 0, cz), far = c.position.distanceTo(mid);
  for (const d of G.course.deco) {
    if (d.far) continue;
    const bx = d.box, centre = bx.getCenter(new THREE.Vector3());
    // (and anything between the near end and the camera, which seen from low looms large)
    let over = bx.min.z > b.z1 + 0.3;
    if (!over && c.position.distanceTo(centre.setY(0)) < far) {
      for (let i = 0; i < 8 && !over; i++) {
        v.set(i & 1 ? bx.max.x : bx.min.x, i & 2 ? bx.max.y : bx.min.y, i & 4 ? bx.max.z : bx.min.z).project(c);
        if (v.x > x0 && v.x < x1 && v.y > y0 && v.y < y1) over = true;
      }
    }
    d.g.visible = !over;
  }
}

// ---- aiming: hold anywhere, pull back, let go -----------------------------------------------------------
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), level = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
function groundAt(x, y, h = 0) {
  const r = engine.renderer.domElement.getBoundingClientRect();
  level.constant = -h;
  ndc.set(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(ndc, engine.camera);
  const p = new THREE.Vector3();
  return ray.ray.intersectPlane(level, p) ? p : null;
}
function onDown(e) {
  wake();
  // one finger, the main mouse button; a second touch doesn't take the shot over
  if (G.state !== 'aim' || G.aim || !e.isPrimary || e.button !== 0) return;
  G.aim = { id: e.pointerId, sx: e.clientX, sy: e.clientY, ang: 0, p: 0 };
  try { e.target.setPointerCapture(e.pointerId); } catch {}
}
const ballV = new THREE.Vector3(), tmpV = new THREE.Vector3(), tmpQ = new THREE.Quaternion();
function onMove(e) {
  const a = G.aim;
  if (!a || e.pointerId !== a.id) return;
  // the pull is taken as if it started at the ball, wherever the press was: pulling straight down
  // the screen shoots straight up it (from the ground under the press, the camera's perspective
  // would bend a pull near the side of the screen by up to a quarter turn)
  const r = engine.renderer.domElement.getBoundingClientRect(), b = G.ball, by = ground(b.x, b.z);
  ballV.set(b.x, by, b.z).project(engine.camera);
  const p = groundAt(r.left + ((ballV.x + 1) / 2) * r.width + e.clientX - a.sx, r.top + ((1 - ballV.y) / 2) * r.height + e.clientY - a.sy, by);
  if (!p) return;
  const px = Math.hypot(e.clientX - a.sx, e.clientY - a.sy);
  a.p = Math.max(0, Math.min(1, (px - 10) / (0.3 * Math.min(innerWidth, innerHeight))));
  const dx = b.x - p.x, dz = b.z - p.z;
  if (Math.hypot(dx, dz) > 1e-3) a.ang = Math.atan2(dx, -dz);
  showAim(a.p > 0);
  drawAim();
}
function onUp(e) {
  const a = G.aim;
  if (!a || e.pointerId !== a.id) return;
  G.aim = null;
  showAim(false);
  if (a.p > 0.04 && G.state === 'aim') shoot(a.ang, a.p);
}
function drawAim() {
  const a = G.aim, b = G.ball;
  const holder = arrow.userData.holder;
  holder.position.set(b.x, 0.02 + ground(b.x, b.z), b.z);
  // (the shape points along local +y, which the flat turn makes -z; on a slope it lies along it)
  holder.quaternion.setFromUnitVectors(UP, upAt(b.x, b.z, tmpV)).multiply(tmpQ.setFromAxisAngle(UP, -a.ang));
  const L = 0.35 + a.p * 1.2;
  arrow.scale.set(1, L, 1);
  arrowMat.color.setHSL(0.14 - a.p * 0.14, 1, 0.55);
  $('power-fill').style.width = Math.round(a.p * 100) + '%';
  // the run, until just past its first bounce
  const sim = simulate(G.course, b.x, b.z, a.ang, a.p, { every: 0.28, stopAfterHits: 1, maxLen: 7 });
  const m = new THREE.Matrix4();
  const n = Math.min(40, sim.pts.length - 1);
  for (let i = 0; i < n; i++) {
    const [x, z] = sim.pts[i + 1];
    m.makeTranslation(x, 0.05 + ground(x, z), z);
    dots.setMatrixAt(i, m);
  }
  dots.count = n;
  dots.instanceMatrix.needsUpdate = true;
}

function shoot(ang, p) {
  const v = shotSpeed(p);
  G.from = { x: G.ball.x, z: G.ball.z };
  G.ball.vx = Math.sin(ang) * v;
  G.ball.vz = -Math.cos(ang) * v;
  G.strokes++;
  G.state = 'roll';
  G.still = 0;
  G.rollT = 0;
  audio.putt(p);
  if (!store.get('shot', false)) { store.set('shot', true); }
  $('hint').hidden = true;
  $('tags').classList.add('out');
  hud();
}

// ---- per frame -------------------------------------------------------------------------------------------
let last = performance.now();
function loop() {
  requestAnimationFrame(loop);
  const now = performance.now();
  const dt = Math.min(0.033, (now - last) / 1000);
  last = now;
  // (held still under the menu: drawn again only if the window changes)
  if (!G.paused) step(dt);
  else if (G.redraw) { G.redraw = false; render(); }
  confetti.update(dt);
  playing();
  const skip = canSkip() && $('power').hidden; // (not over the power bar while pulling back)
  if (skip === $('skip').hidden) $('skip').hidden = !skip;
}

function onHit(c, s) {
  if (c.owner?.hit) c.owner.hit(s);
  if (G.hitT > 0 || s < 0.5) return;
  G.hitT = 0.07;
  if (c.lip) audio.rim();
  else if (!c.owner) audio.wall(Math.min(1, s / 7));
}

function step(dt, draw = true) {
  G.t += dt;
  G.hitT -= dt;
  const b = G.ball;
  for (const p of G.props) p.update(dt, b, G);
  if (G.state === 'aim' || G.state === 'roll') {
    const r = stepBall(b, G.course, dt, onHit);
    if (r === 'sunk') sink();
    // (a safety net: nothing should knock the ball off the course, but if anything does, it goes
    // back to where it was hit from)
    const C = G.course;
    if (G.state !== 'sink' && !G.green.has(Math.round(b.x + (C.W - 1) / 2) + ',' + Math.round(b.z + (C.H - 1) / 2))) {
      Object.assign(b, { x: G.from.x, z: G.from.z, vx: 0, vz: 0 });
      fx.pickup(b.x, 0.2 + ground(b.x, b.z), b.z, 0.05, 0.25);
      G.still = 0;
      if (G.state === 'roll') { if (G.strokes >= HOLES[G.hole].par + GIVE_UP) finish(false); else G.state = 'aim'; }
    }
    const sp = Math.hypot(b.vx, b.vz);
    if (G.state === 'aim' && sp > 0.3) G.pushed();
    if (G.state === 'roll') {
      // (in a fan's wind or on a steep slope it isn't held still: it drifts on until it is pinned
      // against a wall, or rolls back down)
      const steep = slopeAt(G.course, b.x, b.z) > PHYS.hold;
      const blown = (G.course.winds.length && windAt(G.course, b.x, b.z) > PHYS.a0) || steep;
      if (sp < PHYS.rest) { G.still += dt; if (!blown) { b.vx *= 0.5; b.vz *= 0.5; } } else G.still = 0;
      G.rollT += dt;
      // (one only turning round on a slope too steep to rest on, slow for a moment, isn't handed back;
      // one held there, against a rail, is after a while. A safety net: nothing should keep a ball
      // going this long, but if it does, it stops)
      if ((G.still > 0.2 && !steep) || G.still > 1.5 || G.rollT > 25) {
        b.vx = 0; b.vz = 0;
        if (G.strokes >= HOLES[G.hole].par + GIVE_UP) finish(false);
        else G.state = 'aim';
      }
    }
    // coins on the way
    for (const s of G.sweets) if (!s.got && Math.hypot(s.x - b.x, s.z - b.z) < 0.4) {
      s.got = true;
      G.got++;
      audio.sweet(G.got);
      fx.pickup(s.x, 0.3 + ground(s.x, s.z), s.z, 0.1, 0.4);
      hud();
    }
    // rolling: turn the ball about the axis across its path
    const d = sp * dt;
    if (d > 0) ballSpin.rotateOnWorldAxis(new THREE.Vector3(b.vz, 0, -b.vx).normalize(), d / BALL_R);
    ballG.position.set(b.x, BALL_R + ground(b.x, b.z), b.z);
    trail.update(b.x, b.z, sp, dt);
  } else trail.reset();
  if (G.state === 'sink') {
    // into the cup: slide to the middle and drop
    G.sinkT += dt;
    const k = Math.min(1, G.sinkT / 0.3), cup = G.course.cup;
    ballG.position.set(b.x + (cup.x - b.x) * k, BALL_R - k * k * 0.35 + ground(cup.x, cup.z), b.z + (cup.z - b.z) * k);
    ballG.scale.setScalar(1 - k * 0.5);
    if (G.sinkT > 0.3) ballG.visible = false;
    if (G.sinkT > 0.9) finish(true);
  }
  for (const s of G.sweets) {
    const spin = s.g.userData.spin;
    if (s.got) { spin.position.y += dt * 3; spin.rotation.y += dt * 14; s.g.scale.multiplyScalar(Math.max(0, 1 - dt * 5)); continue; }
    spin.rotation.y += dt * 2.4;
    spin.position.y = 0.3 + Math.sin(G.t * 3 + s.t) * 0.05;
  }
  G.course.update(G.t, b);
  // the hole's glow cycles through the five colours; the flag flutters
  const cf = G.course.cupFx;
  cf.rim.color.setHSL((G.t * 0.15) % 1, 0.9, 0.6);
  cf.flag.rotation.y = Math.sin(G.t * 2.3) * 0.25;
  ring.visible = G.state === 'aim';
  ring.position.set(b.x, 0.012 + ground(b.x, b.z), b.z);
  ring.quaternion.setFromUnitVectors(UP, upAt(b.x, b.z, tmpV));
  ring.material.opacity = 0.45 + Math.sin(G.t * 4) * 0.25;
  if (G.aim && G.state === 'aim') drawAim();
  fx.update(dt);
  if (draw) render();
}

/** whether something tall t (a windmill) hides the point p from the camera: p is behind its front, and
 *  on the screen within the box round it */
const box2 = new THREE.Box2(), corner = new THREE.Vector3(), flat = new THREE.Vector2();
function hides(t, p) {
  if (p.z > t.z + t.hz) return false;
  box2.makeEmpty();
  for (let i = 0; i < 8; i++) {
    corner.set(t.x + (i & 1 ? t.hx : -t.hx), i & 2 ? t.y : t.y0, t.z + (i & 4 ? t.hz : -t.hz)).project(engine.camera);
    box2.expandByPoint(flat.set(corner.x, corner.y));
  }
  corner.copy(p).project(engine.camera);
  return box2.containsPoint(flat.set(corner.x, corner.y));
}

function render() {
  MU.time.value = G.t;
  const r = engine.renderer, cam = engine.camera;
  fx.setViewport(r.domElement.clientHeight, cam.fov);
  placeTags();
  const bd = G.course.bounds;
  engine.updateShadow(new THREE.Vector3((bd.x0 + bd.x1) / 2, 0, (bd.z0 + bd.z1) / 2), Math.max(bd.x1 - bd.x0, bd.z1 - bd.z0) * 0.75 + 2);
  r.setViewport(0, 0, engine.width, engine.height);
  r.clear();
  r.render(engine.scene, cam);
}

/** where a point in the world is on the screen, in CSS pixels */
function onScreen(x, y, z) {
  tagV.set(x, y, z).project(engine.camera);
  const r = engine.renderer.domElement.getBoundingClientRect();
  return [r.left + ((tagV.x + 1) / 2) * r.width, r.top + ((1 - tagV.y) / 2) * r.height];
}

function sink() {
  G.state = 'sink';
  G.sinkT = 0;
  const cup = G.course.cup;
  audio.cup();
  // confetti thrown up out of the cup: the better the score, the more
  const cy = ground(cup.x, cup.z), d = G.strokes - HOLES[G.hole].par, [sx, sy] = onScreen(cup.x, 0.3 + cy, cup.z);
  confetti.burst(sx, sy, G.strokes === 1 ? 200 : d < 0 ? 140 : d === 0 ? 90 : 35, { spread: 1.5, speed: innerHeight * (G.strokes === 1 ? 1.7 : 1.3) });
  for (let i = 0; i < (G.strokes === 1 ? 6 : 3); i++) cardTimers.push(setTimeout(() => fx.firework(cup.x + (Math.random() - 0.5) * 0.6, 0.5 + cy + Math.random() * 0.6, cup.z + (Math.random() - 0.5) * 0.6, 1.1), i * 160));
  if (G.strokes === 1) audio.fireworks();
}

// the card's sounds and the cup's fireworks still to come (cleared if another hole is started first)
const cardTimers = [];

/** the card between holes: the result in a big word (HOLE IN ONE!, BIRDIE!, PAR, BOGEY…), the
 *  three stars popping in one by one — one for sinking it, one for par or better, one for every coin
 *  or for beating par (so a hole in one always has all three) — what would earn the next, the
 *  records, and Retry / Next */
function finish(sunk, skipped = false) {
  if (G.state === 'card') return;
  G.state = 'card';
  G.live = false;
  // (a hole skipped counts the most it can, as one the game lets off: skipping never beats sinking it)
  if (skipped) G.strokes = Math.max(G.strokes, HOLES[G.hole].par + GIVE_UP);
  const hole = HOLES[G.hole], all = G.sweets.length, s = G.strokes, d = s - hole.par;
  const on = [sunk, sunk && d <= 0, sunk && (d < 0 || G.got >= all)];
  const stars = on.filter(Boolean).length;
  G.best[G.hole] = Math.max(G.best[G.hole] || 0, stars);
  store.set('best', G.best);
  const [word, kind] = !sunk ? ['这洞先放过你', 'none'] : s === 1 ? ['一杆进洞！', 'ace'] : d <= -3 ? ['信天翁！', 'ace']
    : d === -2 ? ['老鹰球！', 'ace'] : d === -1 ? ['小鸟球！', 'under'] : d === 0 ? ['标准杆！', ''] : d === 1 ? ['多了一杆', 'over']
      : d === 2 ? ['多了两杆', 'over'] : ['进洞了', 'over'];
  $('card-title').textContent = t(word);
  $('card-title').className = 'title ' + kind;
  // the stars come in one after another, each with a note higher than the last; all three, a fanfare
  // and confetti from both corners
  const at = i => 0.3 + i * 0.32;
  $('card-stars').innerHTML = ['进洞', '标准杆内', '金币全捡或小鸟球'].map((c, i) =>
    `<span class="st${on[i] ? ' on' : ''}" style="--d:${at(i)}s"><i>★</i>${on[i] ? '<b>★</b>' : ''}<small>${t(c)}</small></span>`).join('');
  let n = 0;
  on.forEach((o, i) => { if (o) { const k = ++n; cardTimers.push(setTimeout(() => audio.sweet(k), at(i) * 1000 + 120)); } });
  if (stars === 3) cardTimers.push(setTimeout(() => {
    audio.fanfare();
    confetti.burst(0, innerHeight, 90, { angle: -1.2, spread: 0.45, speed: innerHeight * 3.4 });
    confetti.burst(innerWidth, innerHeight, 90, { angle: -Math.PI + 1.2, spread: 0.45, speed: innerHeight * 3.4 });
  }, at(2) * 1000 + 380));
  // what the next star would take, if there is one to have: then Retry is the button to press
  const tip = skipped ? t('跳过的洞记 {n} 杆', { n: s }) : !sunk ? '' : !on[1] ? t('下一颗星：{par} 杆内进洞', { par: hole.par }) : !on[2] ? t('再拿一颗星：捡齐金币，或 {n} 杆内进洞', { n: hole.par - 1 }) : '';
  $('card-tip').textContent = tip;
  $('card-tip').hidden = !tip;
  $('card').classList.toggle('again', !!tip);
  $('card-sub').textContent = pl('{n} 杆 · 标准杆 {par} · 金币 {got}/{all}', G.strokes, { par: hole.par, got: G.got, all });
  const y = yardOf(G.hole), k = G.hole % PER, lastHole = k === PER - 1, then = YARDS[y + 1];
  // (after a yard's last hole: on to the next yard, or from the last back to the first, by name)
  $('card-btn').textContent = !lastHole ? t('下一洞') : t('去{yard}', { yard: t((then || YARDS[0]).name) });
  // (the yard's tally kept on one line: no break inside it)
  if (lastHole) $('card-sub').textContent += ' · ' + t('{yard} ★ {n}/{all}', { yard: t(YARDS[y].name), n: starsIn(y), all: PER * 3 }).replace(/ /g, '\u00a0');
  // records: this hole's fewest strokes, and on the last hole the round's
  const lines = [];
  const holeBest = store.get('strokes', []), was = holeBest[G.hole];
  if (sunk) {
    if (was && G.strokes < was) lines.push(`<b>${t('新纪录！')}</b> ${t('最好 {n} 杆', { n: G.strokes })}`);
    else if (was) lines.push(t('最好 {n} 杆', { n: was }));
    if (!was || G.strokes < was) { holeBest[G.hole] = G.strokes; store.set('strokes', holeBest); }
  }
  // the round counts each hole's first go (a hole let off counts the strokes it took): a retry wins
  // stars and the hole's best, but doesn't remake the round's total, nor say it again
  const round = G.rounds[y], first = round[k] == null;
  if (first) round[k] = G.strokes;
  store.set('rounds', G.rounds);
  // (coming back later goes on to the next hole, or after a yard's last to the next yard)
  store.set('hole', (G.hole + 1) % HOLES.length);
  const roundDone = lastHole && first && HOLES.slice(y * PER, y * PER + PER).every((h, j) => round[j] > 0);
  $('card-round').innerHTML = roundDone ? scorecard(y) : '';
  if (roundDone) {
    const total = round.reduce((a, b) => a + b, 0), par = HOLES.slice(y * PER, y * PER + PER).reduce((a, h) => a + h.par, 0);
    // (each yard's best round; the first yard's kept from before there were yards)
    const bests = store.get('bestRounds', null) || [store.get('bestRound', 0)], bestRound = bests[y] || 0;
    const line = pl('这一轮 {n} 杆 · 标准杆 {par}', total, { par });
    if (bestRound && total < bestRound) lines.push(`<b>${t('新纪录！')}</b> ${line}`);
    else lines.push(line + (bestRound ? ' · ' + t('最好一轮 {n} 杆', { n: bestRound }) : ''));
    if (!bestRound || total < bestRound) { bests[y] = total; store.set('bestRounds', bests); }
  }
  $('card-best').innerHTML = lines.map(l => `<div>${l}</div>`).join('');
  $('card-best').hidden = !lines.length;
  hud();
  $('card').hidden = false;
}

window.__golf = {
  get G() { return G; }, get engine() { return engine; }, step, shoot, load, simulate, spec, HOLES, audio,
};

boot();
