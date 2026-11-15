// 小区高尔夫 (working title) — mini golf through a 小区, built from 万物皆可滚's models: a golf ball,
// and each hole ends in a cup with a glowing rim. Hold and pull back anywhere, let go to putt (a dotted line shows where it will run, up to the first bounce).
// Every hole has its own nuisance: rubber ducks and a seesaw in the way, fans blowing, cars crossing, a
// goose guarding the hole, a cat swiping, tyres; until the first shot each says over it what it
// does to the ball. Stars: one for sinking it, one for par or better, one for every coin on the
// green picked up on the way. The holes are in yards of nine (the duck pond, then the pool party at
// sundown, with slopes and things that turn, then the pumpkin patch's mud and the snow day's ice: holes.js;
// how each looks: looks/), each yard a round: the best strokes for each hole and
// for a whole round are kept, and a hole opens once the one before it is done; a yard opens once the
// one before it has been played through (its last hole's card goes on to the yard's page: its medal,
// bronze for playing it through, silver and gold for stars, and what opens next). The bar at the top,
// always live (over the card and the menus too), shows the yard (its picture, name and holes as dots;
// tap: pick a hole, in this yard or another) and the difficulty (tap: pick another). The menu (top left, or
// Esc) pauses: start the hole again, pick a hole, sound and music, and clear the progress (asked first).
// Coming back goes on where it was left (G.saved), welcomed to the yard by name; a hole already played,
// picked to play once more, doesn't move that, and its card goes back there. On CrazyGames
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
import { audio, DEFAULT_VOLUME } from '../audio/audio.js';
import { t, translateDom, EN } from '../i18n/index.js';
import { BALL_R, CUP_R, PHYS, stepBall, simulate, shotSpeed, windAt, slopeAt, holdAt } from './physics.js';
import { buildCourse, warmLook } from './course.js';
import { lookOf as lookDef } from './looks/index.js';
import { buildProps } from './props.js';
import { HOLES, YARDS, PER } from './holes.js';
import { golfBall, Trail } from './ball.js';
import { Confetti } from './confetti.js';
import { portalInit, portalLoaded, portalPlaying, portalOnMute } from '../game/portal.js';
import { strayHost } from '../game/guard.js';
import { track, trackBoot, trackHole, trackDone } from './track.js';
import { sound } from './sound/index.js'; // (the yard's ambience, the ball rolling, the yard's music layer: sound/)

// counted things in English: '{n} stroke{s}'
const pl = (zh, n, vars) => t(zh, { n, s: n === 1 ? '' : 's', ...vars });

const $ = id => document.getElementById(id);
const PLATFORM = typeof __PLATFORM__ !== 'undefined' ? __PLATFORM__ : 'site';
const nextFrame = () => new Promise(r => requestAnimationFrame(() => r()));
const GIVE_UP = 5; // strokes over par before the hole lets you off
const SKIP = 3; // strokes over par before it offers to let you off
// (kept in mind as well, written first and read first: where the page may store nothing, in another
// site's frame with storage blocked, the progress still lasts the visit. As text, so that what is read
// is a copy, as from the storage; another tab's changes drop what is kept here: boot)
const mem = new Map();
const store = {
  get(k, d) {
    let v = mem.get(k);
    if (v === undefined) { try { v = localStorage.getItem('golf.' + k); } catch { v = null; } }
    try { return v === null ? d : JSON.parse(v); } catch { return d; }
  },
  set(k, v) { const s = JSON.stringify(v); mem.set(k, s); try { localStorage.setItem('golf.' + k, s); } catch {} },
  forget(k) { mem.delete(k); },
};

/** the pause menu's 音效 (the effects; music is its own switch). The cup's and the fanfares' sounds dip
 *  the music under them (src/audio), so with the effects off they are not played at all: the music
 *  would dip under nothing */
const effectsOn = () => store.get('sfx', true);

/** where coming back goes on from (kept in mind as well, for where nothing can be stored) */
function save(i) { G.saved = i; store.set('hole', i); }
/** what clearing the progress leaves: the sound, the music, the effects, the difficulty, and two things the stats go by */
const KEEP = ['muted', 'music', 'sfx', 'level', 'firstDay', 'finale'];

let engine, material, fx, confetti;
const specs = new Map();
const spec = id => {
  if (!specs.has(id)) { const def = CATALOG.get(id); if (!def) throw new Error('no model ' + id); specs.set(id, buildSpec(def)); }
  return specs.get(id);
};
/** a catalog model standing on y = 0 of its group, centred on its footprint; real size × k, or
 *  `size` metres across its largest side; `tint`: its colours multiplied by this one (0xrrggbb: crows
 *  from pigeons) */
function model(id, k = 1, size, tint) {
  const s = spec(id);
  if (size) k = size / s.maxDim;
  const mesh = new THREE.Mesh(s.geometry, tint == null ? material : tinted(tint));
  mesh.userData.keep = true; // (its geometry and material are shared: see course.dispose)
  mesh.scale.setScalar(k);
  mesh.position.set(-s.center.x * k, -s.bbox.min.y * k, -s.center.z * k);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  const g = new THREE.Group();
  g.add(mesh);
  return g;
}

// (the models' material in a tint: one for each, made once and kept, as every material is)
const tints = new Map();
function tinted(c) {
  if (!tints.has(c)) {
    const m = material.clone();
    // (neither is copied by clone(): the same shader under the same key, so the same program)
    m.onBeforeCompile = material.onBeforeCompile;
    m.customProgramCacheKey = material.customProgramCacheKey;
    m.color.set(c);
    tints.set(c, m);
  }
  return tints.get(c);
}

const G = {
  hole: 0, level: 'easy', state: 'load', strokes: 0, got: 0, best: [], rounds: [], paused: false, course: null, props: [], cols: [], sweets: [],
  ball: { x: 0, z: 0, vx: 0, vz: 0, lip: 0 }, still: 0, aim: null, pending: null, hitT: 0, t: 0, sinkT: 0, live: true,
  // (holes played again for a yard's next medal, from its page: { y, had }, the medal it had then; the
  // card's big button goes on to the next hole short of three stars, then back to the page: chase)
  chase: null,
  // (a press still held when the goose or a cat pushes the ball is kept as one made while it rolls: once it
  // stops, the aim starts again from where the pointer is then, so it never shoots by itself)
  pushed() { if (G.state === 'aim') { if (G.aim) G.pending = { ...G.aim, sx: G.aim.x, sy: G.aim.y }; G.aim = null; showAim(false); G.state = 'roll'; G.still = 0; G.rollT = 0; } },
};

// the difficulty: how far along a shot's run the dotted guide shows it (no further than its first
// bounce; at the hardest, not at all: the arrow alone), how slowly a ball must reach the cup to drop
// (faster, it runs over the lip), and the pace of the moving things (at the easy one cars, mowers,
// walkers, windmills and sprinklers go at 3/4 speed and cars stop longer at each end, cats wait longer
// and the goose and the dog notice the ball nearer: props.js; the harder ones are as fast as the easy one
// was, for moving things add luck, not skill). Each has its own stars, records and rounds; a hole opened at one is open at all of them.
const LEVELS = {
  easy: { name: '简单', guide: 7, capture: 3, pace: 0.75, lip: CUP_R + BALL_R },
  normal: { name: '普通', guide: 1.5, capture: 2.2, pace: 1 },
  hard: { name: '困难', guide: 0, capture: 1.6, pace: 1 },
};
const LEVEL_TIPS = 3; // (on how many visits a hole under par at the easy one says there are harder: see finish)
let levelTold = false; // (and whether it has on this one)
let rowShown = false; // (the first card's row of difficulties, once even where nothing can be stored)
let easierTold = false; // ("too hard?" on a card at the harder ones: once a visit)
let hintDue = true; // (how to putt, said under the hole till the first stroke: to one who has never played one, or been away a week, or cleared the progress)
/** a record's key at the difficulty being played (the easy one's as it always was) */
const rec = (k, l = G.level) => (l === 'easy' ? k : `${k}.${l}`);
/** play at this difficulty from now on: its records, its guide and its cup */
function useLevel(l) {
  G.level = LEVELS[l] ? l : 'easy';
  store.set('level', G.level);
  PHYS.capture = LEVELS[G.level].capture;
  G.best = store.get(rec('best'), []);
  G.rounds = store.get(rec('rounds'), []);
  for (let y = 0; y < YARDS.length; y++) G.rounds[y] = G.rounds[y] || [];
  recount();
}
/** the difficulty shown: lit on its own page and on the first card's row, and named at the top right
 *  whichever it is; its page says so when picking another would start the hole under way again */
function showLevel() {
  for (const b of document.querySelectorAll('#l-opts button, #card .levels button')) { const on = b.dataset.l === G.level; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); }
  $('lv-name').textContent = t(LEVELS[G.level].name);
  for (const l in LEVELS) $('lv-chip').classList.toggle(l, l === G.level);
  $('l-warn').hidden = !(G.strokes > 0 && G.state !== 'card');
}
/** play at difficulty l from now on, picked `where` (chip, card) */
function pickLevel(l, where) {
  if (!LEVELS[l] || l === G.level) return;
  audio.tap();
  store.set('levelPicked', true); // (and so no more saying there are harder ones: see finish)
  // (the ball already in: the hole counts at the difficulty it was played at)
  if (G.state === 'sink') finish(true);
  // (the yard's round so far goes on at the new difficulty, picked on a card or in the middle of a hole:
  // a round begun at one can still be played through, to the yard's page)
  // (and, from a hole played again by the way, the round of the yard to go back to)
  const ys = [...new Set([yardOf(G.hole), ...(G.detour ? [yardOf(resumeAt())] : [])])], carry = ys.map(y => G.rounds[y].slice()), pace = LEVELS[G.level].pace;
  useLevel(l);
  ys.forEach((y, k) => { G.rounds[y] = carry[k]; });
  store.set(rec('rounds'), G.rounds);
  track('level', G.level);
  track('lvpick', where);
  showLevel();
  // (a hole is played at one difficulty: one under way starts again, and one not begun yet is built again
  // if the moving things go at another pace, the menu staying up. And the new difficulty's round
  // goes by load()'s rule: a yard's first hole, or any after its last, starts a new one)
  if (G.state !== 'card') {
    const y = yardOf(G.hole);
    if (!G.detour && (G.hole % PER === 0 || G.rounds[y][PER - 1] != null)) { G.rounds[y] = []; store.set(rec('rounds'), G.rounds); }
    if (G.strokes > 0) load(G.hole, false, true);
    else if (LEVELS[G.level].pace !== pace) load(G.hole, false, true, true);
  } else {
    // (picked from the card or the yard's page: it no longer offers one)
    for (const h of $('card').querySelectorAll('.harder')) h.parentElement.remove();
    $('card-best').hidden = !$('card-best').childElementCount;
  }
  hud();
}

// ---- how far along: each hole's most stars at any difficulty (so changing it never takes any away) ----
/** worked out again whenever a hole is done or the difficulty changes */
function recount() {
  const per = Object.keys(LEVELS).map(l => (l === G.level ? G.best : store.get(rec('best', l), [])));
  G.any = HOLES.map((h, i) => per.reduce((m, b) => (b[i] == null ? m : Math.max(m ?? 0, b[i])), null));
}
const yardOf = i => Math.floor(i / PER);
const inYard = (y, f) => HOLES.slice(y * PER, y * PER + PER).map((h, k) => f(y * PER + k, h));
/** hole i has been played (at any difficulty; let off or skipped too) */
const played = i => G.any[i] != null;
const playedCount = () => G.any.filter(s => s != null).length;
/** all of a yard's holes played */
const yardDone = y => inYard(y, played).every(Boolean);
/** a yard can be played: the first, or the one before it has been played through (or it has been
 *  played in already, from before there were the gates) */
const yardOpen = y => y === 0 || yardDone(y - 1) || inYard(y, played).some(Boolean);
/** a hole can be played: its yard is open, and it is the first of it or the one before it has been played */
const opened = i => yardOpen(yardOf(i)) && (i % PER === 0 || played(i - 1));
const starsAll = () => G.any.reduce((a, b) => a + (b || 0), 0);
const starsIn = y => inYard(y, i => G.any[i] || 0).reduce((a, b) => a + b, 0);
const parOf = y => inYard(y, (i, h) => h.par).reduce((a, b) => a + b, 0);
/** a yard's medal: none till it has been played through, then bronze; silver with two stars a hole,
 *  gold with all of them */
const MEDALS = ['', '铜牌', '银牌', '金牌'], MEDAL_IDS = ['', 'bronze', 'silver', 'gold'];
const medalOf = y => (!yardDone(y) ? 0 : starsIn(y) >= PER * 3 ? 3 : starsIn(y) >= PER * 2 ? 2 : 1);
// (the big one on a yard's page looks like a prize: lit from the top left, a darker rim and an inner ring
// in its metal; golf.css puts a tinted disc behind it and sweeps a shine across it once it has dropped)
const METAL = { 1: ['#f9cfa4', '#e2975a', '#a95d24', '#8d4c1c'], 2: ['#ffffff', '#dfe6ea', '#a9b7c1', '#7d8e99'], 3: ['#fff4b8', '#ffd24a', '#e09c0c', '#b47a04'] };
const prize = m => { const [a, b, c, rim] = METAL[m]; return `<defs><radialGradient id="mdg${m}" cx="0.36" cy="0.3" r="0.85"><stop offset="0" stop-color="${a}"/><stop offset="0.5" stop-color="${b}"/><stop offset="1" stop-color="${c}"/></radialGradient></defs>`
  + `<circle cx="16" cy="26" r="11.5" style="fill:url(#mdg${m});stroke:${rim};stroke-width:1.5;stroke-dasharray:none"/><circle cx="16" cy="26" r="8.9" style="fill:none;stroke:${rim};stroke-opacity:0.4;stroke-width:0.7;stroke-dasharray:none"/>`; };
const medal = (m, cls = '') => `<span class="medal m${m}${cls}"${m ? ` title="${t(MEDALS[m])}"` : ''}><svg viewBox="0 0 32 40" aria-hidden="true"><path class="rb" d="M8 1h7l3.5 13h-7zM24 1h-7l-3.5 13h7z"/>${m && cls.includes('big') ? prize(m) : '<circle cx="16" cy="26" r="11.5"/>'}<path class="st" d="M16 19l2.1 4.3 4.7.7-3.4 3.3.8 4.7-4.2-2.2-4.2 2.2.8-4.7-3.4-3.3 4.7-.7z"/></svg></span>`;
/** a yard's holes as dots: hollow till played, then grey (let off), pale, green, gold by the stars got;
 *  `cur` ringed, `now` (the one just played) popping in */
const dotsOf = (y, cur = -1, now = -1) => '<span class="dots">' + inYard(y, i =>
  `<i class="s${played(i) ? G.any[i] : 'n'}${i === cur ? ' cur' : ''}${i === now ? ' now' : ''}"></i>`).join('') + '</span>';
/** each yard's best round at the difficulty played (the first yard's kept from before there were yards) */
const bestRounds = () => store.get(rec('bestRounds'), null) || (G.level === 'easy' ? [store.get('bestRound', 0)] : []);
/** what is left to do in yard y: holes to play it through (and what that opens), then stars to the next medal */
function goal(y) {
  const left = inYard(y, played).filter(p => !p).length, nx = YARDS[y + 1], name = t(YARDS[y].name);
  if (left) return nx && !yardOpen(y + 1) ? pl('还剩 {n} 洞，打完开放{yard}', left, { yard: t(nx.name) }) : pl('还剩 {n} 洞打完{yard}', left, { yard: name });
  const s = starsIn(y), m = medalOf(y);
  return m === 3 ? t('{yard}满星，金牌！', { yard: name }) : pl(m === 2 ? '再拿 {n} 颗星换金牌' : '再拿 {n} 颗星换银牌', (m === 2 ? PER * 3 : PER * 2) - s);
}

/** a yard's holes played and short of three stars, in order */
const shortOf = y => inYard(y, i => i).filter(i => played(i) && (G.any[i] || 0) < 3);
/** from a yard's page (or the card after one of them): play hole i again for the yard's next medal, as
 *  a hole played again by the way (where coming back goes on from stays), its card going on from there */
function chase(i, c) {
  track('chase', String(i + 1));
  dip(() => { load(i, false, false, false, true); G.chase = c; });
}

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
  // (a plain depth buffer, its near and far planes around what any hole puts in sight: nothing comes nearer
  // than 1.4 m nor further than 220 m; and the canvas no bigger than 3.7 M pixels, a 1920x1080 screen at 200%)
  engine = new Engine($('game'), matchMedia('(pointer: coarse)').matches ? 'medium' : 'high', { logDepth: false, near: 1, far: 400, pixelBudget: 3.7e6 });
  const sc = engine.scene;
  sc.fog = new THREE.Fog(0xd4effc, 45, 95); // (each yard colours it and the sky and the light: lookOf)
  fx = new FX(sc);
  confetti = new Confetti($('confetti'));
  makeBall(sc);
  makeAim(sc);
  engine.camera.fov = 40;
  addEventListener('resize', () => { aim(); fitHud(); placeBanner(); G.redraw = true; });
  // (the bars grow when the numbers' font arrives: what is placed under them moves down with them)
  if (window.ResizeObserver) {
    const ro = new ResizeObserver(() => { fitHud(); placeBanner(); });
    for (const id of ['yard', 'score', 'lv-chip']) ro.observe($(id));
  }
  // (the banner once it has faded: gone, so that a press later has nothing to fade)
  $('banner').addEventListener('animationend', e => { if (e.target === $('banner')) $('banner').hidden = true; });
  const cv = $('game');
  cv.addEventListener('pointerdown', onDown);
  cv.addEventListener('contextmenu', e => e.preventDefault());
  addEventListener('pointermove', onMove);
  addEventListener('pointerup', onUp);
  addEventListener('pointercancel', e => { if (G.pending?.id === e.pointerId) G.pending = null; G.aim = null; showAim(false); });
  // (once each: a second tap, or Enter on a focused button as well as the key below, does nothing)
  $('card-btn').addEventListener('click', () => { if (G.state !== 'card' || G.paused) return; audio.tap(); cardNext(); });
  $('card-retry').addEventListener('click', () => { if (G.state !== 'card' || G.paused || G.yardShown) return; audio.tap(); load(G.hole); });
  // on the card: "too easy?" opens the difficulties; the first card has them in a row of its own
  $('card-best').addEventListener('click', e => {
    if (G.state !== 'card' || G.paused) return;
    const b = e.target.closest('.levels button');
    // (picked with a pointer, the pill lets the focus go: Enter and Space go on to the next hole again)
    if (b) { pickLevel(b.dataset.l, 'card'); if (e.detail) b.blur(); return; }
    // ("too hard?": the easy one, at once)
    if (e.target.closest('.easier')) { track('easier', 'pick'); pickLevel('easy', 'card'); return; }
    if (!e.target.closest('.harder')) return;
    audio.tap(); track('tip', 'open'); menu('level');
  });
  $('card-yard').addEventListener('click', e => {
    if (G.state !== 'card' || G.paused) return;
    const go = e.target.closest('button.goal');
    if (go) { audio.tap(); const y = yardOf(+go.dataset.i); return chase(+go.dataset.i, { y, had: medalOf(y) }); }
    if (!e.target.closest('.harder')) return;
    audio.tap(); track('tip', 'open'); menu('level');
  });
  $('skip').addEventListener('click', () => { if (!canSkip()) return; audio.tap(); finish(false, true); });
  makeMenu();
  // (Enter and Space press a button that has the focus themselves; Cmd/Ctrl+R is the browser's)
  addEventListener('keydown', e => {
    if (e.repeat || e.metaKey || e.ctrlKey || e.altKey || G.state === 'load') return;
    // Esc (or P) opens the menu and backs out of it
    if (e.key === 'Escape' || e.key === 'p' || e.key === 'P') {
      if (!G.paused) menu('main');
      else if (asking()) menu('main'); // (clearing the progress, not yet said yes to: back to the menu)
      else unpause();
      return;
    }
    if (e.key === 'm' || e.key === 'M') return toggleSound();
    if (G.paused) return;
    // (R: the hole again, while aiming too once a stroke has been played)
    if ((e.key === 'r' || e.key === 'R') && G.state === 'aim' && G.strokes > 0 && !dipping) return load(G.hole);
    if (G.state !== 'card') return;
    // (a button keeps Enter for itself if it is on the card or was reached with Tab; one only clicked,
    // like the speaker, doesn't)
    const el = document.activeElement, onButton = el?.tagName === 'BUTTON' && ($('card').contains(el) || tabbed(el));
    if ((e.key === 'Enter' || e.key === ' ') && !onButton) { e.preventDefault(); $('card-btn').click(); }
    else if ((e.key === 'r' || e.key === 'R') && !G.yardShown) $('card-retry').click();
  });
  const mute = $('mute');
  const fxOn = effectsOn;
  const showMute = () => {
    mute.classList.toggle('off', audio.muted);
    mute.setAttribute('aria-label', t(audio.muted ? '打开声音' : '关掉声音'));
    $('m-sound').classList.toggle('off', !fxOn());
    $('m-music').classList.toggle('off', !audio.musicOn);
    // (greyed while everything is off: the speaker's mute, or CrazyGames')
    for (const id of ['m-sound', 'm-music']) $(id).classList.toggle('dim', audio.muted);
  };
  // muted by the button (kept) or by CrazyGames' own setting, which wins: everything. In the menu the
  // effects (the ball, the yard's ambience, every sound but the music) and the music go off on their own
  let portalMute = false;
  const applyMute = () => {
    audio.setMuted(portalMute || store.get('muted', false));
    audio.setVolume('sfx', fxOn() ? DEFAULT_VOLUME.sfx : 0);
    sound.fx(fxOn());
    showMute();
  };
  // (stores the opposite of what is heard: under CrazyGames' mute a tap never leaves it muted later)
  const toggleSound = () => { store.set('muted', !audio.muted); applyMute(); wake(); };
  mute.addEventListener('click', toggleSound);
  // (under the speaker's mute a tap on either of the menu's turns the sound back on, with that one on)
  const unmute = () => { if (!audio.muted || portalMute) return false; store.set('muted', false); return true; };
  $('m-sound').addEventListener('click', () => { store.set('sfx', unmute() || !fxOn()); applyMute(); audio.tap(); wake(); });
  $('m-music').addEventListener('click', () => { if (!unmute() || !audio.musicOn) store.set('music', audio.toggleMusic()); applyMute(); audio.tap(); wake(); });
  if (!store.get('music', true) && audio.musicOn) audio.toggleMusic();
  portalOnMute(m => { portalMute = m; applyMute(); });
  applyMute();
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
  useLevel(store.get('level', 'easy'));
  showLevel();
  // (a difficulty picked before there was the levelPicked to say so: see finish)
  // (records with something in them: clearing the progress leaves empty ones, which say nothing)
  if (G.level !== 'easy' || ['normal', 'hard'].some(l => ['best', 'rounds', 'strokes'].some(k => [store.get(rec(k, l), null)].flat(2).some(v => v != null)))) store.set('levelPicked', true);
  trackBoot(store, EN, () => G.hole);
  // (how far along on coming in, for what this visit has added; and back after a while, a welcome)
  G.visit = { holes: playedCount(), stars: starsAll() };
  const last = store.get('lastVisit', 0);
  hintDue = !store.get('shot', false) || (last > 0 && Date.now() - last > 7 * 86400000);
  // (a hole that isn't open, from before the yards had gates, gives way to the first one still to play)
  G.saved = store.get('hole', 0);
  let at = resumeAt();
  // (one who had played every yard there was, back at the first hole after the last, comes back to the
  // first yard added since, and is told it is open: a yard after the first two, which came out together)
  if (at === 0 && played(0)) {
    const nx = HOLES.findIndex((h, i) => opened(i) && !played(i));
    if (nx >= 2 * PER && nx % PER === 0) { at = nx; G.welcome = t('{yard}开放了！', { yard: t(YARDS[yardOf(nx)].name) }); }
  }
  // (anyone who has played a hole is welcomed back, to the yard by name, every time)
  if (G.visit.holes && !G.welcome) G.welcome = t('欢迎回来 · {yard}', { yard: t(YARDS[yardOf(at)].name) });
  // (back at a yard's first hole its round stays as it is, a first go at that hole kept; one left over
  // with more in it starts again)
  load(at, at % PER === 0 && stale(yardOf(at)));
  // (cleared in another tab: this one starts over too, so that it can't write the old stars back)
  addEventListener('storage', e => {
    // (what another tab wrote is read from the storage from now on, not what this one kept in mind)
    if (e.key === null) mem.clear();
    else if (e.key.startsWith('golf.')) store.forget(e.key.slice(5));
    if (e.key === 'golf.resetAt' && e.newValue) resetHere();
  });
  portalLoaded(); // (before the first frame, which says the hole is being played)
  requestAnimationFrame(loop);
  await nextFrame();
  $('loading').classList.add('done');
  window.__ready = true;
  // (the next yard's shaders when nothing else is going on, if it is open already; if not, they wait
  // for this yard's last two holes: load)
  idle(() => { const y = G.yard; if (YARDS[y + 1] && yardOpen(y + 1)) warm(YARDS[y + 1].look, 0); });
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
// each yard's light, from its look (looks/: the duck pond at midday, deep blue overhead paling to the
// haze; the pool party at sundown, warm, low sun, a peach sky; ...)
const skies = {};
function lookOf(name) {
  const L = lookDef(name), e = engine, sc = e.scene;
  sc.background = skies[L.name] || (skies[L.name] = sky(L.sky));
  const [fog, near = 45, far = 95] = Array.isArray(L.fog) ? L.fog : [L.fog];
  sc.fog.color.set(fog);
  sc.fog.near = near;
  sc.fog.far = far;
  e.sun.shadow.intensity = L.shadow;
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
let ballG, ballSpin, ghost, ballRim, trail, arrow, arrowMat, dots, ring, ringBack;
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
  // and on a look that asks for it (its ballRim: how dark), a faint dark ring round it, facing the
  // camera and a couple of pixels wide however far off: a pale ball on pale ice still stands out
  ballRim = new THREE.Mesh(new THREE.CircleGeometry(1, 28), new THREE.MeshBasicMaterial({ color: 0x2f3a33, transparent: true, depthWrite: false }));
  ballRim.visible = false;
  ballG.add(ballRim);
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
  // dots along where it will run: round white marks with a dark edge, the same size on the screen
  // however far off the green is (on a phone a dot a few centimetres across would be a speck)
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  g.beginPath(); g.arc(32, 32, 27, 0, Math.PI * 2);
  g.fillStyle = '#fff'; g.fill();
  g.lineWidth = 7; g.strokeStyle = 'rgba(28, 56, 36, 0.6)'; g.stroke();
  const dotTex = new THREE.CanvasTexture(c);
  dotTex.colorSpace = THREE.SRGBColorSpace;
  const dg = new THREE.BufferGeometry();
  dg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(40 * 3), 3));
  dots = new THREE.Points(dg, new THREE.PointsMaterial({ size: 10, sizeAttenuation: false, map: dotTex, transparent: true, depthWrite: false }));
  dots.frustumCulled = false;
  dots.renderOrder = 4; // (over the arrow, which runs along the first of them)
  dg.setDrawRange(0, 0);
  sc.add(dots);
  ring = new THREE.Mesh(new THREE.RingGeometry(BALL_R * 1.6, BALL_R * 1.9, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7, depthWrite: false }));
  sc.add(ring);
  // and, as the ball's ghost (makeBall), a fainter copy of it drawn only where something stands in front
  // (a windmill): the ball is never lost behind it, nor where it is waiting to be hit. Only while the ball is
  // behind one (not through the tee's mat, which hides the ring there on every hole: step); drawn before the
  // ball, so not over it
  ringBack = new THREE.Mesh(ring.geometry, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.4, depthWrite: false, depthFunc: THREE.GreaterDepth }));
  ringBack.renderOrder = -1;
  ringBack.visible = false;
  ring.add(ringBack);
  showAim(false);
}
function showAim(on) {
  arrow.userData.holder.visible = on;
  dots.visible = on;
  $('power').hidden = !on;
  if (on) $('hint').hidden = true;
  $('tags').classList.toggle('dim', on); // (the tags fade while pulling back, off the guide's dots)
}

/** the green's height at (x, z), and which way is up from it there (into `out`) */
const ground = (x, z) => G.course.Y(x, z);
const UP = new THREE.Vector3(0, 1, 0);
function upAt(x, z, out) {
  const sl = G.course.slope; // (the ground as drawn, LOOK_H times as steep as the ball feels it: course.js)
  if (!sl) return out.copy(UP);
  const g = sl(x, z);
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
/** play hole i (`fresh`: a new round of its yard starts with it, as at a yard's first hole; `detour`: a
 *  hole already played, picked to play once more: it leaves alone the yard's round and the hole that
 *  coming back goes on from, G.saved, and its card's big button goes back there). A round
 *  is over once its last hole has been played: whatever is played next in that yard starts the next
 *  one, unless it is that hole again (a retry, which doesn't touch the round). `quiet`: not the
 *  player's own retry (the difficulty changed), so not counted as one; `stay`: the menu it was changed
 *  in stays up, and the hole's name isn't said again */
function load(i, fresh = false, quiet = false, stay = false, detour = false) {
  const retry = !!G.course && i === G.hole;
  if (!retry || detour) G.detour = detour; // (a retry of a hole played again by the way is still one)
  if (!retry) G.chase = null; // (set again by chase, after: a retry keeps it)
  if (!quiet) trackHole(i, retry);
  if (G.course) G.course.dispose();
  for (const k of cardTimers.splice(0)) clearTimeout(k);
  G.hole = i;
  const hole = HOLES[i], y = yardOf(i);
  const ctx = { model, spec, audio, fx, pace: LEVELS[G.level].pace };
  if (G.yard !== y) { G.yard = y; lookOf(YARDS[y].look); }
  sound.yard(YARDS[y].look); // (sound/: the yard's ambience and music layer, crossfaded when the look changes)
  sound.hush(); // (and a yard's fireworks still to come, or still sounding, stop)
  G.course = buildCourse(hole, i, { scene: engine.scene, model, look: YARDS[y].look, aniso: Math.min(8, engine.renderer.capabilities.getMaxAnisotropy()) });
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
  ring.userData.x = NaN; // (its room to the rails, worked out again)
  // (on a slope the aiming arrow is drawn over the green, which it would dip into, and the ball after it;
  // on the flat, as it always was)
  const sloped = !!G.course.ground;
  arrowMat.depthTest = !sloped;
  ballSpin.renderOrder = sloped ? 5 : 0;
  ballSpin.children[0].renderOrder = sloped ? 4 : 0;
  ghost.visible = G.props.some(p => p.tall);
  const rimA = lookDef(YARDS[y].look).ballRim;
  ballRim.visible = rimA > 0;
  ballRim.material.opacity = rimA || 0;
  ballRim.scale.setScalar(BALL_R * 1.3); // (and sized to the screen as it goes: step)
  G.strokes = 0; G.got = 0; G.still = 0; G.aim = null; G.pending = null; G.state = 'aim'; G.live = true;
  cam.sunk = false; cam.g = 0;
  showAim(false);
  $('card').hidden = true;
  $('card').classList.remove('yd-page');
  G.yardShown = false;
  if (!retry) G.yardPage = null; // (the yard's page still to come, after a retry of its last hole)
  $('hint').hidden = !hintDue || G.paused; // (not through a menu left up: unpause shows it again)
  if (fresh || (!retry && !G.detour && G.rounds[y][PER - 1] != null)) { G.rounds[y] = []; store.set(rec('rounds'), G.rounds); }
  if (G.paused && !stay) unpause();
  hud();
  aim();
  // (the game's name over the first hole played, and a welcome back to the yard; a yard's name over its first hole)
  if (!stay) banner(t(hole.name), t(hole.tip), !G.titled, G.welcome || (i % PER ? '' : yardTitle(y)));
  G.welcome = '';
  G.titled = true;
  // what each nuisance does (one of each kind: the one lowest on the screen, so furthest from the
  // bars at the top), and on the first hole what the coins are for. (body: what a thing stands on, its
  // colliders; flat: a tag of the ground, mud or ice or a coin, not of a thing standing on it)
  const pick = new Map();
  for (const p of [...G.props, ...G.course.tags.map(tag => ({ tag, flat: true }))]) if (p.tag) {
    tagV.set(...p.tag.at()).project(engine.camera);
    const y = (Math.abs(tagV.x) <= 1 ? 0 : 10) + tagV.y, had = pick.get(p.tag.text);
    if (!had || y < had.y) pick.set(p.tag.text, { tag: { text: p.tag.text, at: p.tag.at, body: p.cols, flat: p.flat }, y });
  }
  const list = [...pick.values()].map(v => v.tag);
  // (the coins' one under the coin nearest the tee, the last in the map: above it are the other coin, the
  // cup and the flag, and past them it would read as the flag's. Put at the coin's foot, so just below it)
  if (i === 0 && G.sweets.length) { const s = G.sweets[G.sweets.length - 1]; list.push({ text: '全捡到 +1 ★', at: () => [s.x, 0, s.z], flat: true, under: true }); }
  showTags(list);
  if (stay) G.redraw = true; // (under the menu: drawn once, the hole built again behind it and its tags placed)
  if (!G.detour) save(i); // (a hole played again by the way doesn't move where coming back goes on from)
  // (on a yard's last two holes, the next yard's shaders, when there is a moment: warm)
  if (i % PER >= PER - 2 && YARDS[y + 1] && !warmed.has(YARDS[y + 1].look)) idle(() => warm(YARDS[y + 1].look, 0));
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
    return { at: tg.at, el, half: el.offsetWidth / 2, h: el.offsetHeight, flat: !!tg.flat, under: !!tg.under, body: tg.body };
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
  tagTop = $('bar').getBoundingClientRect().bottom + 6;
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
  // and the flag: its pole from the cup up to the knob, the flag out to the right of it
  const C = G.course, fy = ground(C.cup.x, C.cup.z);
  let fx0 = Infinity, fy0 = Infinity, fx1 = -Infinity, fy1 = -Infinity;
  for (const [dx, dy] of [[0, 0], [0, 1.36], [0.52, 1.31], [0.52, 0.93]]) {
    tagV.set(C.cup.x + dx, fy + dy, C.cup.z).project(engine.camera);
    const sx = ((tagV.x + 1) / 2) * w, sy = ((1 - tagV.y) / 2) * h;
    fx0 = Math.min(fx0, sx); fx1 = Math.max(fx1, sx); fy0 = Math.min(fy0, sy); fy1 = Math.max(fy1, sy);
  }
  const coins = placed.slice(2), cup = placed[0], bare = { x: fx0, y: fy0, w: fx1 - fx0, h: fy1 - fy0 }, flag = { x: fx0 - 3, y: fy0 - 3, w: bare.w + 6, h: bare.h + 6 };
  placed.push(flag);
  const pin = { x0: Math.min(cup.x, flag.x), x1: Math.max(cup.x + cup.w, flag.x + flag.w) }; // (the cup and its flag, side to side)
  for (const tg of tags) {
    tagV.set(...tg.at()).project(engine.camera);
    // kept on the screen and off the bars at the top: a thing near an edge has its tag pushed in, one
    // up by the bars has it below instead of above (below the whole of the thing, not on it); and a tag
    // that would cover another, the cup, the ball or a coin moves on up past what is in the way. One
    // that would then cover the flag stays by its thing instead. If only coins are in its way, it slides
    // aside just clear of them, or else stays on them (a coin under a tag for a moment is no matter: tags
    // go at the first shot). If only the cup, the flag and coins are, it slides aside just clear of the
    // cup and flag. Either way it is still over the thing, its point at it. Else it goes just below the
    // thing if that is free, and only then up past the flag. One of the ground (mud, ice, the coin),
    // first to just below its spot if that is free: on the ground it names
    const px = ((tagV.x + 1) / 2) * w, py = ((1 - tagV.y) / 2) * h, W = 2 * tg.half;
    let x = Math.max(6, Math.min(w - W - 6, px - tg.half)), to = null, under = py + 8;
    for (const c of tg.body || []) {
      // (a sprinkler's turning arm: the whole round it sweeps, not where it is now, or the tag would bob with it)
      const r = c.w ? Math.max(c.hx, c.hz) : c.r;
      const ends = c.kind === 'seg' ? [[c.ax, c.az], [c.bx, c.bz]] : c.w || c.kind === 'circle' ? [[c.x - r, c.z], [c.x + r, c.z], [c.x, c.z - r], [c.x, c.z + r]]
        : [[1, 1], [1, -1], [-1, 1], [-1, -1]].map(([sx, sz]) => { const cs = Math.cos(c.rot || 0), sn = Math.sin(c.rot || 0), lx = sx * c.hx, lz = sz * c.hz; return [c.x + lx * cs + lz * sn, c.z - lx * sn + lz * cs]; });
      for (const [ex, ez] of ends) { tagV.set(ex, ground(ex, ez), ez).project(engine.camera); under = Math.max(under, ((1 - tagV.y) / 2) * h + 8); }
    }
    const on = (r, y, x0 = x) => x0 < r.x + r.w && r.x < x0 + W && y < r.y + r.h && r.y < y + tg.h;
    const fit = y => Math.max(tagTop, Math.min(h - tg.h - 6, y));
    const stack = (y, below, n, boxes) => {
      for (let k = 0; k < n; k++) {
        const o = boxes.find(r => on(r, y));
        if (!o) break;
        y = below ? o.y + o.h + 4 : o.y - tg.h - 4;
        // (no room above it, up by the bars: below it instead)
        if (!below && y < tagTop) { below = true; y = Math.max(under, o.y + o.h + 4); }
      }
      return [y, below];
    };
    let below = tg.under || py - 8 - tg.h < tagTop, y = below ? under : py - 8 - tg.h;
    if (tg.flat) {
      if (!below && placed.some(r => on(r, y)) && under <= h - tg.h - 6 && !placed.some(r => on(r, under))) { below = true; y = under; }
      [y, below] = stack(y, below, 8, placed);
    } else {
      // (where it always went, the flag left out: there, unless that is over the flag itself)
      const was = stack(y, below, 4, placed.filter(r => r !== flag));
      if (!on(bare, fit(was[0]))) [y, below] = was;
      else {
        // (aside: just clear of x0 to x1 at the same height, its point still 10 px in, over nothing but what ok() lets it)
        const first = below ? [] : placed.filter(r => on(r, y)), pinned = r => r === cup || r === flag, coin = r => coins.includes(r);
        const beside = (x0, x1, ok) => [x1 + 4, x0 - W - 4].filter(a => a >= 6 && a <= w - W - 6 && px >= a + 10 && px <= a + W - 10 && !placed.some(r => !ok(r) && on(r, y, a)));
        const coinsOnly = first.length > 0 && first.every(coin);
        const aside = coinsOnly ? beside(Math.min(...first.map(r => r.x)), Math.max(...first.map(r => r.x + r.w)), () => false)
          : first.some(pinned) && first.every(r => pinned(r) || coin(r)) ? beside(pin.x0, pin.x1, coin) : [];
        if (aside.length) { x = aside.sort((a, b) => Math.abs(a - x) - Math.abs(b - x))[0]; to = Math.max(14, Math.min(W - 14, px - x)); }
        else if (coinsOnly) {} // (where it first was, over the coins for a moment)
        else if (under <= h - tg.h - 6 && !placed.some(r => on(r, under))) { y = under; below = true; }
        else [y, below] = stack(y, below, 8, placed);
      }
    }
    y = fit(y);
    // (the coins' one, with no room between its coin and the ball on a short screen, landscape under about
    // 340 px: left out, rather than put below the ball, pointing at it, behind the hint)
    const gone = tg.under && y > placed[1].y;
    if (tg.el.hidden !== gone) tg.el.hidden = gone;
    if (gone) continue;
    placed.push({ x, y, w: W, h: tg.h });
    tg.el.classList.toggle('below', below);
    tg.el.style.transform = `translate(${x}px, ${y}px)`;
    if (to == null) tg.el.style.removeProperty('--to');
    else tg.el.style.setProperty('--to', `${Math.round(to)}px`);
  }
}

// ---- the menu: paused, picking a hole, or the difficulty ---------------------------------------------------
let menuPage = ''; // (the page up: main, pick or level)
const LOCK = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8.5 11V8a3.5 3.5 0 0 1 7 0v3"/></svg>';
const LOCK_S = LOCK.replace('<svg', '<svg class="lk"');
/** a button of the bar pressed: its page comes up, or goes if it is the one up (true: it came up) */
function toggle(page) {
  if (G.state === 'load' || dipping) return false;
  wake();
  audio.tap();
  if (G.paused && menuPage === page) { unpause(); return false; }
  menu(page);
  return true;
}
function makeMenu() {
  // the bar at the top: pause, the yard (pick a hole), the difficulty (its page)
  $('menu-btn').addEventListener('click', () => toggle('main'));
  $('yard').addEventListener('click', () => { if (toggle('pick')) track('map', G.state === 'card' ? 'card-hud' : 'pill'); });
  $('lv-chip').addEventListener('click', () => { if (toggle('level')) track('lvchip', 'open'); });
  $('m-resume').addEventListener('click', () => { audio.tap(); unpause(); });
  $('m-restart').addEventListener('click', () => { audio.tap(); load(G.hole); });
  $('m-holes').addEventListener('click', () => { audio.tap(); track('map', 'menu'); menu('pick'); });
  // (the difficulty's page, from the top right or the card: picked, it closes; the one already played, too)
  $('l-opts').addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.l === G.level) audio.tap();
    else pickLevel(b.dataset.l, G.state === 'card' ? 'card' : 'chip');
    if (G.paused) unpause();
  });
  for (const id of ['pick-x', 'l-x']) $(id).addEventListener('click', () => { audio.tap(); unpause(); });
  // (around the panel: closes it; asked whether to clear the progress, back to the menu)
  $('menu').addEventListener('click', e => { if (e.target !== $('menu')) return; if (asking()) menu('main'); else unpause(); });
  // clearing the progress: the small grey words at the foot of the menu ask first, in the menu's own
  // panel, No lit and under the keys; only Yes clears
  $('m-reset').addEventListener('click', () => {
    audio.tap();
    track('reset', 'ask');
    $('menu-main').classList.add('ask');
    $('m-no').focus({ preventScroll: true });
  });
  $('m-no').addEventListener('click', () => { audio.tap(); menu('main'); });
  $('m-yes').addEventListener('click', () => { if (!asking()) return; audio.tap(); resetProgress(); });
  // (a yard's tab: its holes; one not open yet shakes, and the line says what opens it)
  $('pick-tabs').addEventListener('click', e => {
    const c = e.target.closest('.tab');
    if (!c) return;
    const y = +c.dataset.y;
    pickPage(y);
    if (!yardOpen(y)) { $('pick-tabs').children[y].classList.add('no'); audio.wall(0.3); return; }
    audio.tap();
    warm(YARDS[y].look, 300); // (its shaders, while a hole is being picked)
  });
  $('hole-grid').addEventListener('click', e => {
    const tile = e.target.closest('.tile');
    if (!tile) return;
    const i = +tile.dataset.i;
    if (!opened(i)) { tile.classList.remove('no'); void tile.offsetWidth; tile.classList.add('no'); audio.wall(0.3); return; }
    audio.tap();
    // (the hole being played: on with it as it stands, its strokes kept)
    if (i === G.hole && G.state !== 'card') return unpause();
    unpause(); // (first: nothing in the menu can be pressed while the hole fades)
    // (a yard's first hole starts a new round of it, said over the hole if it has been played before;
    // unless it is the hole to go on with, its round hardly begun. Any other hole already played is
    // played once more by the way: where coming back goes on from stays put, and its card goes back there)
    const fresh = i % PER === 0 && (i !== G.saved || stale(yardOf(i)));
    const detour = i % PER !== 0 && i !== G.saved && i !== G.hole && played(i);
    if (fresh && played(i)) G.welcome = t('新一轮 · {yard}', { yard: t(YARDS[yardOf(i)].name) });
    if (detour) track('detour', 'go');
    dip(() => load(i, fresh, false, false, detour));
  });
}
/** a yard's name with its season before it ("春·鸭子池塘"): in the bar, and over the yard's first hole */
const yardTitle = y => t('{season}·{yard}', { season: t(YARDS[y].season), yard: t(YARDS[y].name) });
/** picking a hole, one page: the yards as tabs (yard y's lit: its sky, picture and name, its medal once
 *  won, a lock till it opens), a line on how that yard stands (its stars and what is left to do, or what
 *  opens it), and its holes */
function pickPage(y) {
  $('pick-tabs').innerHTML = YARDS.map((yd, k) => {
    const L = lookDef(yd.look), open = yardOpen(k), m = medalOf(k);
    return `<button class="tab${k === y ? ' on' : ''}${open ? '' : ' locked'}" role="tab" aria-selected="${k === y}" data-y="${k}">`
      + `<span class="sky" style="background: ${L.card}">${L.icon}<b>${t(yd.name)}</b></span><i class="ssn">${t(yd.season)}</i>${!open ? LOCK_S : m ? medal(m) : ''}</button>`;
  }).join('');
  const m = medalOf(y);
  $('pick-line').innerHTML = yardOpen(y)
    ? `${m ? medal(m) : ''}<span class="ys"><i>★</i>${starsIn(y)}/${PER * 3}</span><span>${goal(y)}</span>`
    : `${LOCK_S}<span>${t('打完{yard}开放', { yard: t(YARDS[y - 1].name) })}</span>`;
  $('hole-grid').innerHTML = holeGrid(y);
}
const PAGES = ['main', 'pick', 'level'];
/** pause and show one of the menu's pages (picking a hole: yard y's tab, the one played unless said).
 *  The bar stays live over it: what opened a page closes it, and lights up while it is up */
function menu(page, y = G.yard) {
  if (!G.paused) {
    G.paused = true;
    G.aim = null;
    G.pending = null;
    showAim(false);
    $('menu').hidden = false;
    $('hint').hidden = true; // (how to putt: not through the menu, nor the question whether to clear)
    $('hud').inert = $('card').inert = true; // (Tab stays in the menu and the bar)
  }
  menuPage = page;
  for (const p of PAGES) $('menu-' + p).hidden = page !== p;
  $('menu').className = page === 'main' ? '' : page === 'level' ? 'hang lv' : 'hang';
  for (const [id, p] of [['yard', 'pick'], ['lv-chip', 'level']]) { $(id).classList.toggle('open', page === p); $(id).setAttribute('aria-expanded', page === p); }
  // (over a card or a yard's page there is no hole under way to start again: the card has its own button)
  if (page === 'main') {
    $('m-restart').hidden = G.state === 'card';
    $('menu-main').classList.remove('ask');
    $('m-reset').hidden = !playedCount(); // (nothing to clear yet)
  }
  if (page === 'pick') pickPage(y);
  if (page === 'level') showLevel();
  // (for the keys: Enter presses the first button; picking a hole, the one to go on with)
  const first = { main: () => $('m-resume'), pick: () => $('hole-grid').querySelector('.nx') || $('pick-tabs').querySelector('.on'), level: () => $('l-opts').querySelector('.on') };
  first[page]().focus({ preventScroll: true });
}
/** the menu is asking whether to clear the progress */
const asking = () => G.paused && menuPage === 'main' && $('menu-main').classList.contains('ask');
function unpause() {
  G.paused = false;
  menuPage = '';
  $('menu').hidden = true;
  $('hud').inert = $('card').inert = false;
  if (hintDue && G.state === 'aim') $('hint').hidden = false;
  for (const id of ['yard', 'lv-chip']) { $(id).classList.remove('open'); $(id).setAttribute('aria-expanded', false); }
  document.activeElement?.blur?.();
}

// ---- clearing the progress ---------------------------------------------------------------------------
/** every star, medal, record and round gone, at every difficulty, and back to the first hole as if new:
 *  the game's own keys only, all but KEEP (never the other game's, nor the language), then empty ones
 *  written in their place (a save from before the yards, found without its rounds, would be read as the
 *  first yard played through: boot), and the time, which tells the other tabs (boot's listener) */
function resetProgress() {
  for (const k of [...mem.keys()]) if (!KEEP.includes(k)) mem.delete(k);
  try {
    for (const k of Object.keys(localStorage)) if (k.startsWith('golf.') && !KEEP.includes(k.slice(5))) localStorage.removeItem(k);
  } catch {}
  for (const l in LEVELS) { store.set(rec('rounds', l), YARDS.map(() => [])); store.set(rec('best', l), []); }
  store.set('hole', 0);
  store.set('resetAt', Date.now());
  track('reset', 'done');
  resetHere();
}
/** and here, with no reload: what is kept in mind cleared as what is stored was, then the first hole
 *  under the game's name, as on a first visit (the hint how to putt and the first card's difficulties too) */
function resetHere() {
  // (in a tab told by another one, in the middle of a fade: once it is over)
  if (dipping) return setTimeout(resetHere, 150);
  useLevel(G.level);
  G.saved = 0;
  G.visit = { holes: 0, stars: 0 };
  G.yardPage = null;
  G.yardShown = false;
  G.detour = false;
  G.titled = false;
  rowShown = levelTold = easierTold = false;
  hintDue = true;
  swept.clear();
  G.welcome = t('进度已清空');
  if (G.paused) unpause();
  dip(() => load(0, true));
}

/** a yard's first hole not played yet (-1: all of it has been) */
const firstNew = y => inYard(y, i => i).find(i => !played(i)) ?? -1;
/** a yard's holes, each with its stars and its fewest strokes at any difficulty (as the stars are
 *  counted, so changing the difficulty hides nothing; "skipped" for one let off); those not reached yet
 *  locked; and the one to go on with ringed: in the yard being played the hole on screen; once its card
 *  is up, and in another yard, the hole that coming back goes on from if it is in that yard, else the
 *  yard's first not played yet */
function holeGrid(y) {
  const fewest = Object.keys(LEVELS).map(l => store.get(rec('strokes', l), []));
  const go = y === G.yard && G.state !== 'card' ? G.hole : yardOf(resumeAt()) === y ? resumeAt() : firstNew(y);
  return HOLES.slice(y * PER, y * PER + PER).map((h, k) => {
    const i = y * PER + k, n = t('第 {n} 洞', { n: i + 1 });
    if (!opened(i)) return `<button class="tile locked" data-i="${i}" aria-label="${n} · ${t('还没打到这洞')}"><b>${i + 1}</b>${LOCK}</button>`;
    const st = G.any[i] || 0, best = Math.min(...fewest.map(f => f[i] || Infinity));
    return `<button class="tile${i === go ? ' nx' : ''}" data-i="${i}" aria-label="${n}"><b>${i + 1}</b>`
      + `<span class="ss">${[0, 1, 2].map(k => `<i${k < st ? ' class="on"' : ''}>★</i>`).join('')}</span>`
      + (i === go ? `<span class="bs">${t('▶ 接着打')}</span>` : best < Infinity ? `<span class="bs">${t('最好 {n} 杆', { n: best })}</span>`
        : played(i) ? `<span class="bs skip">${t('跳过')}</span>` : `<span class="bs">${t('标准 {n}', { n: h.par })}</span>`) + '</button>';
  }).join('');
}

/** a yard's round so far: its strokes, hole by hole, under each hole's par */
function scorecard(y) {
  const holes = HOLES.slice(y * PER, y * PER + PER), round = G.rounds[y];
  const par = holes.reduce((a, h) => a + h.par, 0), played = round.filter(s => s != null);
  const row = (cls, head, cells, sum) => `<tr class="${cls}"><th>${head}</th>${cells.join('')}<th class="sum">${sum}</th></tr>`;
  return '<table class="sc">'
    + row('num', t('洞'), holes.map((h, i) => `<td${G.any[y * PER + i] != null && G.any[y * PER + i] < 3 ? ' class="short"' : ''}>${y * PER + i + 1}</td>`), t('合计'))
    + row('par', t('标准杆'), holes.map(h => `<td>${h.par}</td>`), par)
    + row('you', t('你'), holes.map((h, i) => {
      const s = round[i], d = s - h.par;
      return s == null ? '<td></td>' : `<td><span${d < 0 ? ' class="under"' : d > 0 ? ' class="over"' : ''}>${s}</span></td>`;
    }), played.length ? played.reduce((a, b) => a + b, 0) : '')
    + '</table>';
}

/** a hole that has taken par + 3 offers to be let off (counting the strokes it took) */
const canSkip = () => G.state === 'aim' && !G.paused && G.strokes >= HOLES[G.hole].par + SKIP;

/** into yard y, never throwing away a round under way: on with it at its first hole not played yet, its
 *  round as it stands; one with every hole played, at the first hole its round hasn't got yet; one not
 *  begun, or with its round played through, from its first hole, a new round */
function goYard(y) {
  const i = yardStart(y);
  load(i, i % PER === 0);
}
/** the hole that going into yard y lands on (its first hole: a new round) */
function yardStart(y) {
  const i = firstNew(y);
  if (i >= 0) return i;
  let k = 0;
  while (k < PER && G.rounds[y][k] != null) k++;
  return y * PER + (k < PER ? k : 0);
}
/** a yard's round left over with more in it than a first go at its first hole */
const stale = y => G.rounds[y].some((s, k) => k > 0 && s != null);
/** the hole that coming back goes on from; one that isn't open gives way to the first still to play */
const resumeAt = () => {
  const at = Math.min(Math.max(0, G.saved | 0), HOLES.length - 1);
  return opened(at) ? at : Math.max(0, HOLES.findIndex((h, i) => opened(i) && !played(i)));
};
/** after a yard's last hole: what the big button says, where it goes, and the hole that is (`at`: where
 *  coming back goes on from too, so that leaving on that card or page and coming back lands where the
 *  button would have). The next yard; after the last one (or from the whole neighbourhood's page,
 *  `fin`), a yard not played through yet, then the first one short of gold for another round of it,
 *  then the first hole of all */
function onward(fin = false) {
  const y = yardOf(G.hole), to = k => t('去{yard}', { yard: t(YARDS[k].name) }) + ' ›';
  const into = (k, text = to(k)) => ({ text, go: () => goYard(k), at: yardStart(k) });
  if (!fin && y + 1 < YARDS.length && yardOpen(y + 1)) return into(y + 1);
  const todo = YARDS.findIndex((yd, k) => yardOpen(k) && !yardDone(k));
  if (todo >= 0) return into(todo);
  const w = YARDS.findIndex((yd, k) => medalOf(k) < 3);
  if (w < 0) return { text: t('从第 1 洞再打') + ' ›', go: () => load(0, true), at: 0 };
  return into(w, w === y ? t('再打一轮') + ' ›' : to(w));
}
/** the card's main button: the yard's page after its last hole, from there (or from the last hole's
 *  card when there is no page) on to another yard; after a hole played again by the way, back to the
 *  hole it was left for; else the next hole */
function cardNext() {
  if (G.yardPage) return showYard();
  // (after a hole played again for a medal: the next one still short of three stars)
  if (G.chase?.next != null) return chase(G.chase.next, G.chase);
  // (after a hole played again by the way: back to where it was, its round as it stands)
  if (G.detour) { track('detour', 'back'); return dip(() => { const n = resumeAt(); load(n, n % PER === 0 && stale(yardOf(n))); }); }
  const i = G.hole + 1;
  dip(G.yardShown || i % PER === 0 ? onward(G.yardShown === 'fin').go : () => load(i));
}

// ---- from one hole to another, by the card or the holes: a short fade, and the camera moving in ------
/** the card fades as a haze the yard's colour comes up (0.15 s); under it the confetti still falling is
 *  cleared and go() (a load) builds the next hole; two frames later, that hole drawn under the haze, it
 *  clears (0.26 s) as the camera moves in. Nothing can be pressed meanwhile (the state 'load', and the
 *  pointer: onDown). Only on the way on from the card and from the holes: the game opening, a retry and
 *  __golf.load() stay as they were, at once */
let dipping = false;
function dip(go) {
  if (dipping) return;
  dipping = true;
  G.state = 'load';
  const d = $('dip'), haze = () => { d.style.background = '#' + engine.scene.fog.color.getHexString(); };
  haze();
  // (there only for the fade: a layer over the whole screen, even an empty one, changes how the bars at
  // the top are drawn. Put in clear first, so that it fades in)
  d.hidden = false;
  void d.offsetWidth;
  $('card').classList.add('leaving');
  d.classList.add('on');
  // (the next hole is built once the haze is all the way up: its fade's end, 0.15 s from the next frame,
  // or 0.4 s at most)
  new Promise(r => { const k = setTimeout(r, 400); d.addEventListener('transitionend', () => { clearTimeout(k); r(); }, { once: true }); }).then(async () => {
    confetti.ps.length = 0;
    go();
    camIn(G.hole);
    $('card').classList.remove('leaving');
    await nextFrame();
    await nextFrame();
    haze(); // (the next yard's, after a yard's last hole)
    d.classList.remove('on');
    dipping = false;
    setTimeout(() => { if (!d.classList.contains('on')) d.hidden = true; }, 300); // (once it has cleared: golf.css)
  });
}
/** the camera after a fade: from a little further back and higher, eased in to where aim() put it over
 *  0.6 s; or into a yard after the first, the first time this visit, a sweep down from high over it, 1.5 s.
 *  A press puts it in place at once (onDown), and so does a new size of the screen (aim) */
let camMove = null;
const swept = new Set();
function camIn(i) {
  const c = engine.camera, b = G.course.bounds, y = yardOf(i);
  const mid = new THREE.Vector3((b.x0 + b.x1) / 2, 0, (b.z0 + b.z1) / 2), dist = c.position.distanceTo(mid);
  const end = { p: c.position.clone(), q: c.quaternion.clone() }, from = c.position.clone();
  const sweep = i % PER === 0 && y >= 1 && y <= 3 && !swept.has(y);
  if (sweep) {
    swept.add(y);
    from.set(mid.x + 0.75 * dist, 1.15 * dist, mid.z + 0.35 * dist);
    c.position.copy(from);
    c.lookAt(mid.x, 0, mid.z - 0.15 * dist);
  } else {
    from.addScaledVector(c.getWorldDirection(tmpV), -0.1 * dist);
    from.y += 0.03 * dist;
  }
  camMove = { from, q: c.quaternion.clone(), end, t: 0, T: sweep ? 1.5 : 0.6, sweep };
  camStep(0);
}
function camStep(dt) {
  const m = camMove, c = engine.camera;
  m.t += dt;
  const u = Math.min(1, m.t / m.T), k = m.sweep ? u * u * (3 - 2 * u) : 1 - (1 - u) ** 3; // (in and out; out)
  if (u >= 1) return camDone();
  c.position.lerpVectors(m.from, m.end.p, k);
  c.quaternion.slerpQuaternions(m.q, m.end.q, k);
  c.updateMatrixWorld();
}
/** the camera where aim() put it, now */
function camDone() {
  if (!camMove) return;
  const c = engine.camera;
  c.position.copy(camMove.end.p);
  c.quaternion.copy(camMove.end.q);
  c.updateMatrixWorld();
  camMove = null;
}

// ---- the camera along with the ball: after a shot it drifts after the ball and comes a little closer
// (the further the ball has gone, the more: a short putt hardly moves it), comes in on the cup when the
// ball is slow near it and as it drops, and eases back to aim()'s view once the ball stops, quicker than it
// follows (and at once on its way back if a finger is already down for the next shot).
// It is only ever slid along the ground and moved in along its own line of sight, never turned, so the
// course never swings round; and the ball and the cup are always kept clear of the
// sides, the bottom and the bars at the top (cutting how far it goes). A finger down to aim before it is
// back hurries it the rest of the way. None of it for a player who asks for less motion: the fixed view,
// as before ----------------------------------------------------------------------------------------------
const calm = matchMedia('(prefers-reduced-motion: reduce)');
/** aim()'s view (where it looks: t), and how far the camera is from it now: slid by (x, z), and in along
 *  its line of sight by k of the way, with how fast each is changing */
const home = { p: new THREE.Vector3(), q: new THREE.Quaternion(), t: new THREE.Vector3(), ok: false, cupHid: false, kMax: 0.8 };
const cam = { x: 0, z: 0, k: 0, vx: 0, vz: 0, vk: 0, g: 0, sunk: false, fit: 1 };
function camHome() {
  const c = engine.camera;
  home.p.copy(c.position); home.q.copy(c.quaternion); home.ok = true;
  home.cupHid = G.props.some(p => p.tall && hides(p.tall, tmpV.set(G.course.cup.x, ground(G.course.cup.x, G.course.cup.z), G.course.cup.z)));
  Object.assign(cam, { x: 0, z: 0, k: 0, vx: 0, vz: 0, vk: 0, fit: 1 });
  // how far in it may come at most: no further than keeps a windmill near the cup to 0.15 of the screen
  // (or what it has from here, if more) with the camera over at the cup, as when the ball drops. From a
  // camera low behind the hole (a phone on its side) coming in on the cup would otherwise put the blades
  // over a quarter of the screen
  home.kMax = 0.8;
  const talls = G.props.filter(p => p.tall).map(p => p.tall);
  if (talls.length) {
    const cover = () => Math.max(...talls.map(t => {
      box2.makeEmpty();
      for (let i = 0; i < 8; i++) {
        corner.set(t.x + (i & 1 ? t.hx : -t.hx), i & 2 ? t.y : t.y0, t.z + (i & 4 ? t.hz : -t.hz)).project(c);
        box2.expandByPoint(flat.set(corner.x, corner.y));
      }
      return Math.max(0, Math.min(1, box2.max.x) - Math.max(-1, box2.min.x)) * Math.max(0, Math.min(1, box2.max.y) - Math.max(-1, box2.min.y)) / 4;
    }));
    const most = Math.max(0.15, cover()), cup = G.course.cup, sx = 0.9 * (cup.x - home.t.x), sz = 0.9 * (cup.z - home.t.z);
    camPut(sx, sz, 0.8);
    if (cover() > most) {
      let lo = 0, hi = 0.8;
      for (let i = 0; i < 9; i++) { const m = (lo + hi) / 2; camPut(sx, sz, m); if (cover() > most) hi = m; else lo = m; }
      home.kMax = lo;
    }
    camPut(0, 0, 0);
  }
}
function camPut(x, z, k) {
  const c = engine.camera;
  c.position.set(home.p.x + x + (home.t.x - home.p.x) * k, home.p.y + (home.t.y - home.p.y) * k, home.p.z + z + (home.t.z - home.p.z) * k);
  c.quaternion.copy(home.q);
  c.updateMatrixWorld();
}
/** whether, from the camera as it is, the points are on the screen clear of its edges (26 px at the sides,
 *  40 at the bottom) and below the bars at the top (14 px), and the cup not behind a windmill */
const camPts = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
function camClear(n) {
  const w = innerWidth, h = innerHeight;
  for (let i = 0; i < n; i++) {
    tmpV.copy(camPts[i]).project(engine.camera);
    const x = ((tmpV.x + 1) / 2) * w, y = ((1 - tmpV.y) / 2) * h;
    if (tmpV.z > 1 || x < 26 || x > w - 26 || y < tagTop + 14 || y > h - 40) return false;
  }
  return home.cupHid || !G.props.some(p => p.tall && hides(p.tall, camPts[0]));
}
/** how much of the way from aim()'s view to (x, z, k) still has the points clear (1: all of it) */
function camRoom(x, z, k, n) {
  camPut(x, z, k);
  if (camClear(n)) return 1;
  let lo = 0, hi = 1;
  for (let i = 0; i < 9; i++) { const m = (lo + hi) / 2; camPut(x * m, z * m, k * m); if (camClear(n)) lo = m; else hi = m; }
  return lo;
}
const smooth = u => (u = Math.max(0, Math.min(1, u))) * u * (3 - 2 * u);
function camFollow(dt) {
  if (!home.ok || camMove || calm.matches || !G.course) return;
  // a press for the next shot while it is still on its way back (a quick tapper, just after the ball
  // stopped): the rest of the way back twice as quickly (nine tenths of it in under half a second), so the
  // aim is from aim()'s own view and not from wherever the camera had got to (once back, it stays put)
  const press = !!G.aim;
  const b = G.ball, cup = G.course.cup, st = G.state, by = ground(b.x, b.z), cy = ground(cup.x, cup.z);
  camPts[0].set(cup.x, cy, cup.z); camPts[1].set(cup.x, cy + 0.6, cup.z); camPts[2].set(b.x, by + BALL_R, b.z);
  // what it goes for: a point to slide towards (a of the way from aim()'s), k of the way in, and how
  // quickly (w: the spring's rate, about 4/w seconds to get there)
  let fx = home.t.x, fz = home.t.z, a = 0, k = 0, w = 5.5, n = 3;
  const travel = Math.hypot(b.x - G.from.x, b.z - G.from.z);
  if (st === 'roll' && !G.pending) {
    const sp = Math.hypot(b.vx, b.vz), lead = Math.min(0.8, 0.15 * sp) / Math.max(sp, 1e-6);
    const g = smooth((travel - 0.5) / 2.5);
    cam.g = Math.max(cam.g, g);
    fx = b.x + b.vx * lead; fz = b.z + b.vz * lead; a = 0.5 * cam.g; k = 0.2 * cam.g; w = 3.2;
    // slow, near the cup: in on the two of them (less after a short putt)
    const dc = Math.hypot(b.x - cup.x, b.z - cup.z), near = smooth((2.6 - dc) / 1.8) * smooth((3.2 - sp) / 2) * (0.35 + 0.65 * smooth((travel - 0.3) / 1.2));
    if (near > 0) {
      fx += ((b.x + cup.x) / 2 - fx) * near; fz += ((b.z + cup.z) / 2 - fz) * near;
      a += (0.85 - a) * near; k += (0.65 - k) * near; w = 3.2 + 1.3 * near;
    }
  } else if (st === 'sink' || (st === 'card' && cam.sunk)) {
    fx = cup.x; fz = cup.z; a = 0.9; k = 0.6 + 0.2 * cam.g; w = 6; n = 2;
  } else cam.g = 0;
  k = Math.min(k, home.kMax);
  // (back where aim() put it and staying there: left alone)
  if (!a && Math.abs(cam.x) + Math.abs(cam.z) + Math.abs(cam.k) + Math.abs(cam.vx) + Math.abs(cam.vz) + Math.abs(cam.vk) < 1e-4) {
    if (cam.x || cam.z || cam.k) { Object.assign(cam, { x: 0, z: 0, k: 0, vx: 0, vz: 0, vk: 0, fit: 1 }); camPut(0, 0, 0); }
    return;
  }
  // as far towards it as keeps the ball and the cup in sight
  const tx = a * (fx - home.t.x), tz = a * (fz - home.t.z), m = camRoom(tx, tz, k, n);
  // a spring to there, no faster than 2.5 m/s across and 0.25 of the way in a second (on the way back
  // to aim()'s view, half as fast again: the player is waiting for it)
  // (and it gathers speed and slows down gently: no more than 4 times that a second, each second)
  const spring = (x, v, to, lim) => { const dv = Math.max(-4 * lim * dt, Math.min(4 * lim * dt, (w * w * (to - x) - 2 * w * v) * dt)); v = Math.max(-lim, Math.min(lim, v + dv)); return [x + v * dt, v]; };
  if (press) w = 12;
  const q = a ? 1 : press ? 3 : 1.5;
  [cam.x, cam.vx] = spring(cam.x, cam.vx, tx * m, 2.5 * q);
  [cam.z, cam.vz] = spring(cam.z, cam.vz, tz * m, 2.5 * q);
  [cam.k, cam.vk] = spring(cam.k, cam.vk, k * m, (a > 0.6 ? 0.6 : 0.25) * q);
  // (and where it has got to, held back as far as it takes if the ball has run on past what that keeps clear)
  cam.fit = camRoom(cam.x, cam.z, cam.k, n);
  camPut(cam.x * cam.fit, cam.z * cam.fit, cam.k * cam.fit);
}

let hudYard = -1;
function hud() {
  const hole = HOLES[G.hole];
  // (where you are: the yard's picture on its sky and its name, and its holes as dots, this one ringed)
  if (hudYard !== G.yard) {
    const L = lookDef(YARDS[G.yard].look);
    hudYard = G.yard;
    $('yard-ic').innerHTML = L.icon;
    $('yard-ic').style.background = L.card;
    $('yard-name').textContent = yardTitle(G.yard);
  }
  $('yard-dots').innerHTML = dotsOf(G.yard, G.hole);
  $('strokes-num').textContent = G.strokes;
  $('par').textContent = t('标准 {n}', { n: hole.par });
  $('sweets-num').textContent = `${G.got}/${G.sweets.length}`;
  $('score').classList.toggle('nocoin', !G.sweets.length); // (a hole with none: no count of them)
  fitHud();
}
/** the bar at the top made to fit (measured afresh each time, so it ends up the same): one row on a wide
 *  screen; on a phone held upright two, pause and the yard over the strokes and the difficulty. What
 *  doesn't fit in a row gives way in this order: the yard's dots get smaller, the strokes and the
 *  difficulty sit closer, the words by the strokes
 *  and coins go (the numbers stay), the yard's dots go, the difficulty's name goes last (its dot and
 *  arrow stay: a dot alone says little, so the name outlasts the yard's dots, which only count).
 *  Never the yard's picture or name. And where the bar ends is told to the card and the menus, which
 *  sit under it (--hud-b) */
function fitHud() {
  const bar = $('bar'), wide = innerWidth > 560;
  bar.className = '';
  $('yard').style.flex = 'none'; // (measured at its full width, its name not cut short)
  const rows = wide ? [['menu-btn', 'yard', 'score', 'lv-chip']] : [['menu-btn', 'yard'], ['score', 'lv-chip']];
  const over = ids => ids.reduce((a, id) => a + $(id).getBoundingClientRect().width, 8 * (ids.length - 1)) > bar.getBoundingClientRect().width;
  for (const [cls, k] of [['dots-small', 0], ['snug', 1], ['score-bare', 1], ['no-dots', 0], ['chip-bare', 1]]) if (over(rows[wide ? 0 : k])) bar.classList.add(cls);
  $('yard').style.flex = '';
  document.documentElement.style.setProperty('--hud-b', Math.round(bar.getBoundingClientRect().bottom) + 'px');
}

/** the banner (a hole's name, and over the first hole played the game's) hangs just under the bar at
 *  the top, wherever that ends */
function placeBanner() {
  hudBottom();
  $('banner').style.setProperty('--below-hud', tagTop + 8 + 'px');
}
/** the first press on the green: the banner, if it is still up, fades at once, out of the way of the
 *  hole, and what the things on it do is said straight away */
function hush() {
  const b = $('banner');
  if (b.hidden || b.classList.contains('out')) return;
  b.classList.add('out');
  if (G.state === 'aim' && G.strokes === 0) { clearTimeout(tagsTimer); $('tags').classList.remove('out'); }
}

function banner(title, sub, logo, kick = '') {
  const b = $('banner');
  b.hidden = true;
  b.classList.remove('out');
  b.classList.toggle('logo', !!logo);
  placeBanner();
  $('banner-kick').textContent = kick;
  $('banner-title').textContent = title;
  $('banner-sub').textContent = sub || '';
  void b.offsetWidth;
  b.hidden = false;
}

const SLOPED = 0.9; // (how high at most a hole whose ground isn't flat is looked at from: see aim)
/** frame the whole hole from its near end, so the ball starts near the player and is hit away from
 *  them: as close as still shows every wall and the flag, clear of the bars at top and bottom */
function aim() {
  camMove = null; // (a camera move after a fade ends here: the camera is put in place)
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
  // (a hole whose ground isn't flat is looked at from no higher than SLOPED, if the far end still comes out
  // at least 0.55 the size of the near end there: from straight above, as a tall screen otherwise has it,
  // slopes and mounds hardly show)
  const lowest0 = Math.min(SLOPED, HOLES[G.hole].tilt || 1.25);
  if (C.ground && best < lowest0) {
    tilt = lowest0;
    fit();
    if (metre(b.z0) >= metre(b.z1) * 0.55 && !(talls.length && hidden())) best = lowest0;
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
  // how far a pull goes for full power: 0.3 of the screen's shorter side, or less where the tee sits
  // nearer the bottom than that (a phone on its side, a wide screen), so a press on the ball pulled down
  // reaches it a finger short of the edge (18 px: the 10 px a pull starts at, and 8). From the tee, so the
  // same all through the hole; worked out again with the screen's size
  const m = Math.min(innerWidth, innerHeight), ty = onScreen(C.tee.x, ground(C.tee.x, C.tee.z), C.tee.z)[1];
  G.full = Math.max(0.15 * m, Math.min(0.3 * m, innerHeight - ty - 18));
  home.t.copy(target);
  camHome();
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
  if (dipping) return;
  hush();
  camDone(); // (a press while the camera is still moving in puts it in place, and aims as usual)
  // one finger, the main mouse button. A second touch takes over only an aim not yet pulled past the 10 px
  // it starts at (a thumb resting on the glass, holding the phone); a pull under way is never taken over
  const touch = e.pointerType === 'touch';
  if (e.button !== 0 || (!touch && !e.isPrimary)) return;
  const held = G.aim || (G.pending?.id !== e.pointerId && G.pending); // (the same pointer again: its letting go was missed)
  if (held && (!touch || !held.touch || held.far > 10)) return;
  G.aim = G.pending = null;
  // (pressed while the ball is still rolling, in its last slow half second: kept, and the aim starts from
  // where the pointer is once it has stopped, if it is still held then: aimFromPending)
  if (G.state === 'roll' && !G.paused) G.pending = { id: e.pointerId, sx: e.clientX, sy: e.clientY, x: e.clientX, y: e.clientY, far: 0, touch };
  else if (G.state === 'aim') G.aim = { id: e.pointerId, sx: e.clientX, sy: e.clientY, x: e.clientX, y: e.clientY, far: 0, ang: 0, p: 0, was: [], touch };
  else return;
  try { e.target.setPointerCapture(e.pointerId); } catch {}
}
/** the ball has stopped: a press made while it rolled, still held, starts the aim, from where it is now
 *  (the pull counts from there, so it takes a pull after this to shoot) */
function aimFromPending() {
  const q = G.pending;
  G.pending = null;
  if (q && !G.aim && G.state === 'aim') G.aim = { id: q.id, sx: q.x, sy: q.y, x: q.x, y: q.y, far: q.far, ang: 0, p: 0, was: [], touch: q.touch };
}
const ballV = new THREE.Vector3(), tmpV = new THREE.Vector3(), tmpQ = new THREE.Quaternion();
function onMove(e) {
  const q = G.pending;
  if (q && e.pointerId === q.id) { q.x = e.clientX; q.y = e.clientY; q.far = Math.max(q.far, Math.hypot(q.x - q.sx, q.y - q.sy)); return; }
  const a = G.aim;
  if (!a || e.pointerId !== a.id) return;
  a.x = e.clientX; a.y = e.clientY;
  a.far = Math.max(a.far, Math.hypot(e.clientX - a.sx, e.clientY - a.sy)); // (how far it has gone: onDown)
  // the pull is taken as if it started at the ball, wherever the press was: pulling straight down
  // the screen shoots straight up it (from the ground under the press, the camera's perspective
  // would bend a pull near the side of the screen by up to a quarter turn)
  const r = engine.renderer.domElement.getBoundingClientRect(), b = G.ball, by = ground(b.x, b.z);
  ballV.set(b.x, by, b.z).project(engine.camera);
  const p = groundAt(r.left + ((ballV.x + 1) / 2) * r.width + e.clientX - a.sx, r.top + ((1 - ballV.y) / 2) * r.height + e.clientY - a.sy, by);
  if (!p) return;
  const px = Math.hypot(e.clientX - a.sx, e.clientY - a.sy);
  a.p = power(a, e, px);
  const dx = b.x - p.x, dz = b.z - p.z;
  if (Math.hypot(dx, dz) > 1e-3) a.ang = Math.atan2(dx, -dz);
  // (the aim a moment ago, for the finger lifting off: see onUp)
  const was = a.was;
  while (was.length > 1 && e.timeStamp - was[1].t > 300) was.shift();
  was.push({ t: e.timeStamp, x: e.clientX, y: e.clientY, ang: a.ang, p: a.p });
  showAim(a.p > 0);
  drawAim();
}
/** the power of a pull px long: past the 10 px it starts at, in step with it up to full at G.full more
 *  (G.full: aim). A finger pulling towards an edge of the screen nearer than that (a ball by the side
 *  of a phone held upright, pulled sideways towards it) gets the top of it sooner, so that full power
 *  is still a finger short of the edge (8 px, as G.full has it at the bottom from the tee): the pull
 *  steepens more and more as it nears the edge, a short one (up to about 20 px) is as strong as ever.
 *  A mouse goes on past the edge, and keeps G.full */
function power(a, e, px) {
  const q = Math.max(0, px - 10), F = G.full;
  let p = q / F;
  if (e.pointerType !== 'mouse' && px >= 1) {
    const ux = (e.clientX - a.sx) / px, uy = (e.clientY - a.sy) / px;
    const room = Math.min(ux > 1e-3 ? (innerWidth - a.sx) / ux : ux < -1e-3 ? -a.sx / ux : Infinity,
      uy > 1e-3 ? (innerHeight - a.sy) / uy : uy < -1e-3 ? -a.sy / uy : Infinity);
    // (R: where full power comes this way; no shorter than 0.1 of the screen's shorter side, for a ball
    // 64 px from the side of a 360 px phone)
    const R = Math.max(0.1 * Math.min(innerWidth, innerHeight), room - 18);
    if (R < F) p += (1 - R / F) * (q / R) ** 3;
  }
  return Math.max(0, Math.min(1, p));
}
function onUp(e) {
  if (G.pending?.id === e.pointerId) G.pending = null;
  const a = G.aim;
  if (!a || e.pointerId !== a.id) return;
  G.aim = null;
  showAim(false);
  // a finger lifting off the glass rolls the touch point a few pixels, and on a short pull that turns the
  // shot: if the last moment's moving came to no more than that, the shot goes as aimed just before it
  // (a mouse button lets go where it is; and this never decides whether there is a shot at all)
  const was = a.was, end = was[was.length - 1];
  let { ang, p } = a;
  if (a.touch && p > 0.04 && e.timeStamp - end.t < 70)
    for (let i = was.length - 2; i >= 0; i--) {
      if (e.timeStamp - was[i].t < 70) continue;
      if (was[i].p > 0.04 && Math.hypot(end.x - was[i].x, end.y - was[i].y) < 6) ({ ang, p } = was[i]);
      break;
    }
  if (p > 0.04 && G.state === 'aim') shoot(ang, p);
}
function drawAim() {
  const a = G.aim, b = G.ball;
  const holder = arrow.userData.holder;
  holder.position.set(b.x, 0.02 + ground(b.x, b.z), b.z);
  // (the shape points along local +y, which the flat turn makes -z; on a slope it lies along it)
  holder.quaternion.setFromUnitVectors(UP, upAt(b.x, b.z, tmpV)).multiply(tmpQ.setFromAxisAngle(UP, -a.ang));
  // (where the green is small on the screen, a phone's, the arrow is made wider to stay as easy to see
  // as on a computer's, and a little longer: though not on over the cup, as if the ball would get there)
  const ppm = pxPerM(), len = 0.35 + a.p * 1.2, room = Math.hypot(G.course.cup.x - b.x, G.course.cup.z - b.z) - 0.25;
  dots.material.size = Math.min(14, Math.max(10, Math.min(innerWidth, innerHeight) / 38));
  arrow.scale.set(Math.max(1, 100 / ppm), Math.max(len, Math.min(len * Math.max(1, 55 / ppm), room)), 1);
  arrowMat.color.setHSL(0.14 - a.p * 0.14, 1, 0.55);
  $('power-fill').style.width = Math.round(a.p * 100) + '%';
  // the run, until just past its first bounce: a dot every 18 px or so, measured on the screen (a run up
  // it, seen from low, comes out much shorter than one across it), and one where it ends
  const guide = LEVELS[G.level].guide;
  const sim = guide ? simulate(G.course, b.x, b.z, a.ang, a.p, { every: 0.05, stopAfterHits: 1, maxLen: guide }) : null;
  const pts = sim ? sim.pts.slice(1) : [];
  if (sim && !sim.sunk) pts.push([sim.x, sim.z]);
  const pos = dots.geometry.attributes.position, cam = engine.camera, size = dots.material.size, gap = Math.max(18, size + 6);
  const w = engine.renderer.domElement.clientWidth / 2, h = engine.renderer.domElement.clientHeight / 2, tanF = Math.tan((cam.fov * Math.PI) / 360);
  tmpV.set(b.x, ground(b.x, b.z), b.z).project(cam);
  let n = 0, lx = tmpV.x * w, ly = tmpV.y * h;
  for (let i = 0; i < pts.length && n < 40; i++) {
    const [x, z] = pts[i], y = 0.05 + ground(x, z);
    tmpV.set(x, y, z).project(cam);
    const sx = tmpV.x * w, sy = tmpV.y * h, far = Math.hypot(sx - lx, sy - ly);
    let k = n;
    // (the end closer: the last dot moved onto it, if it would cover the one before)
    if (far < gap) {
      if (i < pts.length - 1) continue;
      if (far < size) { if (!n) break; k = n - 1; }
    }
    // (moved toward the camera along its line of sight: the same place on the screen, but in front of the
    // green under its lower half, which is nearer than its middle; by twice what that takes, which is
    // more the lower the camera looks across the green)
    const c = cam.position, low = Math.hypot(c.x - x, c.z - z) / Math.max(0.1, c.y - y);
    tmpV.set(x, y, z).lerp(c, Math.min(0.08, ((size + 2) * tanF * low) / h));
    pos.setXYZ(k, tmpV.x, tmpV.y, tmpV.z);
    if (k === n) n++;
    lx = sx; ly = sy;
  }
  pos.needsUpdate = true;
  dots.geometry.setDrawRange(0, n);
}

/** how far the green runs from (x, z) to its edge (the rails' inner face), the least of 12 ways, up to 1 m */
function roomAt(x, z) {
  const C = G.course;
  let d = 1;
  for (let k = 0; k < 12; k++) {
    const dx = Math.cos((k * Math.PI) / 6), dz = Math.sin((k * Math.PI) / 6);
    for (let t = 0.05; t < d; t += 0.05)
      if (!G.green.has(Math.round(x + dx * t + (C.W - 1) / 2) + ',' + Math.round(z + dz * t + (C.H - 1) / 2))) { d = t; break; }
  }
  return d;
}

/** how many pixels of the screen a metre of the green at the ball comes to */
function pxPerM() {
  const b = G.ball, c = engine.camera;
  const d = Math.hypot(c.position.x - b.x, c.position.y - ground(b.x, b.z), c.position.z - b.z);
  return engine.renderer.domElement.clientHeight / (2 * d * Math.tan((c.fov * Math.PI) / 360));
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
  audio.putt((v - PHYS.vmin) / (PHYS.vmax - PHYS.vmin));
  if (!store.get('shot', false)) { store.set('shot', true); }
  hintDue = false;
  $('hint').hidden = true;
  $('tags').classList.add('out');
  hud();
}

// ---- per frame -------------------------------------------------------------------------------------------
let last = performance.now();
// ---- a way down when the frames are slow: the frame gaps watched while aiming or rolling (not for 2 s
// after a hole loads, nor 0.5 s after a change); when their median over 1.5 s is above 24 ms the
// drawing's resolution steps down, to 0.75 then 0.6; a step that doesn't make the frames 15% quicker
// is put back, and then it stops trying for the visit (so a display at 30 a second ends at full scale).
// A step is only taken while aiming with no pointer down, where a change can't be felt ------------------
const STEPS = [1, 0.75, 0.6], SLOW = 24, WATCH = 1500;
const res = { k: 0, done: false, course: null, from: 0, gaps: [], took: 0, before: 0, trial: false, want: -1, log: [] };
function watchFrames(now, gap) {
  if (res.course !== G.course) { res.course = G.course; res.from = now + 2000; res.gaps = []; res.took = 0; }
  if (res.done && res.want < 0) return;
  // (a step waiting for its moment)
  if (res.want >= 0) {
    if (G.state !== 'aim' || G.aim || G.pending || G.paused || camMove) return;
    res.log.push({ t: Math.round(now), from: STEPS[res.k], to: STEPS[res.want], ms: res.before });
    res.k = res.want; res.want = -1;
    engine.setScale(STEPS[res.k]);
    res.from = now + 500; res.gaps = []; res.took = 0;
    return;
  }
  if (now < res.from || G.paused || document.hidden || (G.state !== 'aim' && G.state !== 'roll') || gap > 250) return;
  res.gaps.push(gap); res.took += gap;
  if (res.took < WATCH) return;
  const g = res.gaps.sort((a, b) => a - b), med = g[g.length >> 1];
  res.gaps = []; res.took = 0;
  if (res.trial) {
    res.trial = false;
    // (not 15% quicker for it: back to the step before, and no more tries)
    if (med > res.before / 1.15) { res.want = res.k - 1; res.done = true; res.before = med; return; }
  }
  if (med > SLOW && res.k < STEPS.length - 1) { res.want = res.k + 1; res.before = med; res.trial = true; }
}
function loop() {
  requestAnimationFrame(loop);
  const now = performance.now();
  watchFrames(now, now - last);
  // (a slow computer, under 30 frames a second, doesn't slow the game down: a longer frame, up to 0.1 s,
  // is played as that many steps of no more than 0.033 s, drawn once at the end; at 30 a second and
  // over, one step as ever)
  const gap = Math.min(0.1, (now - last) / 1000), n = gap > 0.034 ? Math.ceil(gap / 0.033) : 1;
  const dt = n > 1 ? gap / n : Math.min(0.033, gap);
  last = now;
  // (held still under the menu: drawn again only if the window changes)
  if (!G.paused) for (let k = 1; k <= n; k++) step(dt, k === n);
  else if (G.redraw) { G.redraw = false; render(); }
  sound.frame(G); // (sound/: the ball rolling, the ambience's and the music layer's next sounds)
  for (let k = 0; k < n; k++) confetti.update(dt);
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
  if (camMove) camStep(dt);
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
      if (G.state === 'roll') { if (G.strokes >= HOLES[G.hole].par + GIVE_UP) finish(false); else { G.state = 'aim'; aimFromPending(); } }
    }
    const sp = Math.hypot(b.vx, b.vz);
    if (G.state === 'aim' && sp > 0.3) G.pushed();
    if (G.state === 'roll') {
      // (in a fan's wind or on a steep slope it isn't held still: it drifts on until it is pinned
      // against a wall, or rolls back down)
      const steep = slopeAt(G.course, b.x, b.z) > holdAt(G.course, b.x, b.z);
      const blown = (G.course.winds.length && windAt(G.course, b.x, b.z) > PHYS.a0) || steep;
      if (sp < PHYS.rest) { G.still += dt; if (!blown) { b.vx *= 0.5; b.vz *= 0.5; } } else G.still = 0;
      G.rollT += dt;
      // (one only turning round on a slope too steep to rest on, slow for a moment, isn't handed back;
      // one held there, against a rail, is after a while. A safety net: nothing should keep a ball
      // going this long, but if it does, it stops)
      if ((G.still > 0.2 && !steep) || G.still > 1.5 || G.rollT > 25) {
        b.vx = 0; b.vz = 0;
        // (at the easy one a ball come to rest hanging over the hole, its centre within 0.44 m of the
        // cup's, drops: no 10 cm tap-in)
        const lip = LEVELS[G.level].lip, cup = G.course.cup;
        if (lip && Math.hypot(b.x - cup.x, b.z - cup.z) < lip) sink();
        else if (G.strokes >= HOLES[G.hole].par + GIVE_UP) finish(false);
        else { G.state = 'aim'; aimFromPending(); }
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
    if (ballRim.visible) { ballRim.quaternion.copy(engine.camera.quaternion); ballRim.scale.setScalar(BALL_R * Math.max(1.3, 1 + 1.8 / (BALL_R * pxPerM()))); }
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
  let lift = 0;
  if (ring.visible) {
    // (bigger where the green is small on the screen, but not out past the rails. And on a curve in the
    // green, a hollow or the foot of a slope, lifted by the most the green rises round its edge above
    // the slope at the ball: laid flat there, it would sink into it)
    const r = ring.userData;
    if (r.x !== b.x || r.z !== b.z) Object.assign(r, { x: b.x, z: b.z, room: roomAt(b.x, b.z) });
    const s = Math.max(1, Math.min(80 / pxPerM(), (r.room + 0.2) / (BALL_R * 1.9)));
    ring.scale.setScalar(s);
    if (G.course.ground) {
      const [gx, gz] = G.course.slope(b.x, b.z), y0 = ground(b.x, b.z), R = BALL_R * 1.9 * s;
      for (let k = 0; k < 12; k++) {
        const dx = Math.cos((k * Math.PI) / 6) * R, dz = Math.sin((k * Math.PI) / 6) * R;
        lift = Math.max(lift, ground(b.x + dx, b.z + dz) - y0 - gx * dx - gz * dz);
      }
    }
  }
  ring.position.set(b.x, 0.012 + lift + ground(b.x, b.z), b.z);
  ring.quaternion.setFromUnitVectors(UP, upAt(b.x, b.z, tmpV));
  ring.material.opacity = 0.45 + Math.sin(G.t * 4) * 0.25;
  ringBack.material.opacity = ring.material.opacity * 0.6;
  ringBack.visible = ghost.visible && ring.visible && G.props.some(p => p.tall && hides(p.tall, tmpV.set(b.x, ground(b.x, b.z), b.z)));
  camFollow(dt);
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

/** the sky laid on the screen from its top down to the horizon (the camera's eye level), its last colour,
 *  the haze's, held below that: it meets the hazed ground with no edge. Where the horizon is over the top
 *  of the screen (looking down on a hole), only the haze shows. Every frame: the camera moves in, the
 *  screen changes size */
const horizon = new THREE.Vector3();
function skyBand() {
  const bg = engine.scene.background, c = engine.camera;
  if (!bg?.isTexture) return;
  c.getWorldDirection(horizon).setY(0);
  let f = 0; // (how much of the screen, from the top, is above the horizon)
  if (horizon.lengthSq() > 1e-8) {
    horizon.normalize().multiplyScalar(1000).add(c.position).setY(c.position.y);
    f = Math.min(1, (1 - horizon.project(c).y) / 2);
  }
  if (f > 0.001) { bg.repeat.y = 1 / f; bg.offset.y = 1 - 1 / f; } else { bg.repeat.y = 1; bg.offset.y = -1; }
}

function render() {
  MU.time.value = G.t;
  const r = engine.renderer, cam = engine.camera;
  skyBand();
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
  cam.sunk = true;
  const cup = G.course.cup;
  if (effectsOn()) audio.cup();
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
 *  or for beating par (so a hole in one always has all three; named for the coins where the hole has
 *  any, unless it was the birdie that earned it) — what would earn the next, the
 *  records, and Retry / Next */
function finish(sunk, skipped = false) {
  if (G.state === 'card') return;
  G.state = 'card';
  G.pending = null;
  G.live = false;
  $('card').classList.remove('yd-page');
  G.yardShown = false;
  const y = yardOf(G.hole), k = G.hole % PER, lastHole = k === PER - 1;
  // (before this hole: for a medal won, a yard played through, the next one opened, the whole lot done)
  const had = medalOf(y), wasDone = yardDone(y), nxWas = y + 1 < YARDS.length && yardOpen(y + 1), allWas = YARDS.every((yd, j) => yardDone(j));
  // (a hole skipped counts the most it can, as one the game lets off: skipping never beats sinking it)
  if (skipped) G.strokes = Math.max(G.strokes, HOLES[G.hole].par + GIVE_UP);
  const hole = HOLES[G.hole], all = G.sweets.length, s = G.strokes, d = s - hole.par;
  trackDone(G.hole, sunk, skipped, s, d, G.level);
  // (a hole with no coins on it: the third star is for a birdie)
  const on = [sunk, sunk && d <= 0, sunk && (d < 0 || (all > 0 && G.got >= all))];
  const stars = on.filter(Boolean).length;
  G.best[G.hole] = Math.max(G.best[G.hole] || 0, stars);
  store.set(rec('best'), G.best);
  recount();
  store.set('lastVisit', Date.now());
  const fin = !allWas && YARDS.every((yd, j) => yardDone(j)), opens = y + 1 < YARDS.length && !nxWas && yardOpen(y + 1);
  // (kept as how many holes there were: one who did it when there were fewer is counted again)
  if (fin && store.get('finale', 0) !== HOLES.length) { store.set('finale', HOLES.length); track('finale'); }
  const [word, kind] = !sunk ? ['这洞先放过你', 'none'] : s === 1 ? ['一杆进洞！', 'ace'] : d <= -3 ? ['信天翁！', 'ace']
    : d === -2 ? ['老鹰球！', 'ace'] : d === -1 ? ['小鸟球！', 'under'] : d === 0 ? ['标准杆！', ''] : d === 1 ? ['多了一杆', 'over']
      : d === 2 ? ['多了两杆', 'over'] : ['进洞了', 'over'];
  $('card-title').textContent = t(word);
  $('card-title').className = 'title ' + kind;
  if (!sunk) sound.letOff(); // (given up or skipped: two soft notes 0.3 s on, not a buzzer)
  // the stars come in one after another, each with a note higher than the last; all three, a fanfare
  // and confetti from both corners
  const at = i => 0.3 + i * 0.32;
  $('card-stars').innerHTML = ['进洞', '标准杆内', all && !(sunk && d < 0 && G.got < all) ? '金币全捡' : '小鸟球'].map((c, i) =>
    `<span class="st${on[i] ? ' on' : ''}" style="--d:${at(i)}s"><i>★</i>${on[i] ? '<b>★</b>' : ''}<small>${t(c)}</small></span>`).join('');
  let n = 0;
  on.forEach((o, i) => { if (o) { const k = ++n; cardTimers.push(setTimeout(() => audio.sweet(k), at(i) * 1000 + 120)); } });
  if (stars === 3) cardTimers.push(setTimeout(() => {
    if (effectsOn()) audio.fanfare();
    confetti.burst(0, innerHeight, 90, { angle: -1.2, spread: 0.45, speed: innerHeight * 3.4 });
    confetti.burst(innerWidth, innerHeight, 90, { angle: -Math.PI + 1.2, spread: 0.45, speed: innerHeight * 3.4 });
  }, at(2) * 1000 + 380));
  // what the next star would take, if there is one to have (not on the very first card, which has the
  // difficulties to show; and never a hole in one: on a par 2 only the coins, if it has any). Retry is
  // the button to press when it was the par star that was missed
  const firstCard = !rowShown && !store.get('lvIntro', false);
  const tip = skipped ? t('跳过的洞记 {n} 杆', { n: s }) : !sunk || firstCard ? '' : !on[1] ? t('下一颗星：{par} 杆内进洞', { par: hole.par })
    : on[2] ? '' : hole.par - 1 < 2 ? (all ? t('再拿一颗星：捡齐金币') : '')
      : all ? t('再拿一颗星：捡齐金币，或 {n} 杆内进洞', { n: hole.par - 1 }) : t('下一颗星：{par} 杆内进洞', { par: hole.par - 1 });
  $('card-tip').textContent = tip;
  $('card-tip').hidden = !tip;
  $('card').classList.toggle('again', !!tip && !on[1]);
  $('card-sub').textContent = all ? pl('{n} 杆 · 标准杆 {par} · 金币 {got}/{all}', G.strokes, { par: hole.par, got: G.got, all }) : pl('{n} 杆 · 标准杆 {par}', G.strokes, { par: hole.par });
  // records: this hole's fewest strokes (the round's go on the yard's page)
  const lines = [];
  const holeBest = store.get(rec('strokes'), []), was = holeBest[G.hole];
  if (sunk) {
    if (was && G.strokes < was) lines.push(`<b>${t('新纪录！')}</b> ${t('最好 {n} 杆', { n: G.strokes })}`);
    else if (was) lines.push(t('最好 {n} 杆', { n: was }));
    if (!was || G.strokes < was) { holeBest[G.hole] = G.strokes; store.set(rec('strokes'), holeBest); }
  }
  // the round counts each hole's first go (a hole let off counts the strokes it took): a retry wins
  // stars and the hole's best, but doesn't remake the round's total, nor say it again
  // (nor does a hole played again by the way, picked from the holes: it isn't part of the round)
  const round = G.rounds[y], first = !G.detour && round[k] == null;
  if (first) round[k] = G.strokes;
  store.set(rec('rounds'), G.rounds);
  const roundDone = lastHole && first && inYard(y, (i, h) => round[i - y * PER] > 0).every(Boolean);
  let roundLine = '';
  if (roundDone) {
    track('yard', String(y + 1));
    const total = round.reduce((a, b) => a + b, 0), par = parOf(y);
    const bests = bestRounds(), bestRound = bests[y] || 0;
    const line = pl('这一轮 {n} 杆 · 标准杆 {par}', total, { par });
    roundLine = bestRound && total < bestRound ? `<b>${t('新纪录！')}</b> ${line}` : line + (bestRound ? ' · ' + t('最好一轮 {n} 杆', { n: bestRound }) : '');
    if (!bestRound || total < bestRound) { bests[y] = total; store.set(rec('bestRounds'), bests); }
  }
  // how far along the yard is: its holes as dots (this one popping in), and what is left to do
  $('card-prog').innerHTML = dotsOf(y, -1, G.hole) + `<span>${goal(y)}</span>`;
  const m = medalOf(y);
  if (m > had) track('medal', `${y + 1}/${MEDAL_IDS[m]}`);
  // after a yard's last hole, with the round played through or the yard just played through: the yard's
  // page next (its medal, the round, what opens); a medal won on any other hole is said here
  const kept = lastHole && G.yardPage?.y === y ? G.yardPage : null;
  G.yardPage = lastHole && (roundDone || !wasDone) && yardDone(y) ? { y, roundLine, card: roundDone ? scorecard(y) : '', had, opens, fin } : kept;
  // (coming back later goes on to the next hole, or after a yard's last one to where the big button
  // goes, on this card or on the yard's page after it: a round under way in the yard it goes to stays as
  // it is; after a hole played again by the way, to where it was before)
  if (!G.detour) save(lastHole ? onward(!!G.yardPage && (fin || (!YARDS[y + 1] && YARDS.every((yd, j) => yardDone(j))))).at : G.hole + 1);
  if (m > had && !G.yardPage) lines.push(`${medal(m, ' small')}<b>${t('新奖牌！')}</b> ${t('{yard}{medal}', { yard: t(YARDS[y].name), medal: t(MEDALS[m]) })}`);
  // (after a hole played again by the way the big button names the hole it goes back to, unless that is the next one)
  $('card-btn').textContent = G.yardPage ? t('看成绩') + ' ›' : G.detour && !(G.saved === G.hole + 1 && !lastHole) ? t('回到第 {n} 洞', { n: resumeAt() + 1 }) + ' ›'
    : !lastHole ? t('下一洞') : onward().text;
  // (a hole played again from a yard's page for its next medal: on to the next one still short of three
  // stars and not yet tried in this go, or once the medal is won, or every one has been tried once, back
  // to the page, whose big button goes on: never round and round the same holes)
  if (G.chase && G.detour && G.chase.y === y) {
    const tried = G.chase.tried ||= [];
    if (!tried.includes(G.hole)) tried.push(G.hole);
    const s = shortOf(y).filter(i => !tried.includes(i)), nx = medalOf(y) > G.chase.had ? undefined : s.find(i => i > G.hole) ?? s[0];
    G.chase.next = nx;
    if (nx == null) G.yardPage = { y, roundLine: '', card: scorecard(y), had: G.chase.had, opens: false, fin: false };
    $('card-btn').textContent = nx == null ? t('看成绩') + ' ›' : t('重打第 {n} 洞', { n: nx + 1 }) + ' ›';
  }
  // the difficulty: on the very first card, the three in a row (the one played lit); afterwards at the
  // easy one, there are harder ones (a tap opens them): said after a hole under par (from hole 4 on)
  // once a visit for the first few visits, until a difficulty is picked
  const told = store.get('levelTips', 0);
  if (firstCard) {
    rowShown = true;
    store.set('lvIntro', true);
    // (on a 320 px screen the English row is wider than the card: its name goes over the three)
    lines.push(`<span class="lvrow" style="flex-wrap: wrap; justify-content: center"><span>${t('难度')}</span><span class="levels" role="group" aria-label="${t('难度')}">`
      + Object.keys(LEVELS).map(l => `<button type="button" data-l="${l}">${t(LEVELS[l].name)}</button>`).join('') + '</span></span>');
    track('tip', 'row');
  } else if (G.level === 'easy' && sunk && d < 0 && G.hole >= 3 && !levelTold && told < LEVEL_TIPS && !store.get('levelPicked', false)
    && !(G.yardPage && starsIn(y) >= PER * 3 - 4)) { // (the yard's page, next, says it for a yard all but swept)
    lines.push(`<button class="harder" type="button">${t('嫌简单？换个难度')}</button>`);
    levelTold = true;
    store.set('levelTips', told + 1);
    track('tip', 'under');
  } else if (G.level !== 'easy' && !sunk && !easierTold) {
    // (at a harder one, a hole skipped or let off: the easy one is a tap away, said once a visit)
    lines.push(`<button class="harder easier" type="button">${t('太难？换成简单')}</button>`);
    easierTold = true;
    track('easier', 'show');
  }
  $('card-best').innerHTML = lines.map(l => `<div>${l}</div>`).join('');
  $('card-best').hidden = !lines.length;
  showLevel();
  hud();
  $('card').hidden = false;
  // (after a yard's last hole, the next yard's look has its shaders compiled while the card is up, so
  // its first hole doesn't stop to)
  if (lastHole && YARDS[y + 1]) warm(YARDS[y + 1].look);
}
// (and so is a yard's when its tab is opened to pick a hole, and the next yard's when there is a moment
// to spare: from the start if it is open, else on this yard's last two holes. Not the yard being played
// by then: its hole on screen has its shaders already)
const warmed = new Set();
function warm(look, wait = 700) {
  setTimeout(() => {
    if (warmed.has(look) || YARDS[G.yard].look === look) return;
    warmed.add(look);
    warmLook(look, engine.renderer, engine.scene, engine.camera);
  }, wait);
}
const idle = f => (window.requestIdleCallback ? requestIdleCallback(f, { timeout: 4000 }) : setTimeout(f, 2000));

/** a yard's page, after its last hole: its name, the medal (dropping in, and said if it is new), its
 *  stars and the round with its scorecard, then this visit's and the whole neighbourhood's count, what
 *  the next medal takes, what has opened; one big button on to the next yard (onward). After the last yard with
 *  every one played through, the whole neighbourhood's page: done, every yard's medal in a row, and
 *  how many holes and stars in all */
function showYard() {
  const p = G.yardPage, y = p.y, name = t(YARDS[y].name), m = medalOf(y), nx = YARDS[y + 1], all = YARDS.every((yd, k) => yardDone(k));
  const fin = p.fin || (!nx && all);
  G.yardPage = null;
  G.yardShown = fin ? 'fin' : true;
  for (const k of cardTimers.splice(0)) clearTimeout(k);
  $('card').classList.add('yd-page');
  $('card-title').textContent = fin ? t('整个街区通关！') : t('{yard}通关！', { yard: name });
  $('card-title').className = 'title under' + (fin ? ' long' : '');
  // (what has opened first, right under the round, in sight above the buttons on a short screen)
  const lines = nx && p.opens ? [`<span class="unlock">${t('{yard}开放了！', { yard: t(nx.name) })}</span>`] : [];
  const holes = playedCount() - G.visit.holes, stars = starsAll() - G.visit.stars;
  // (the whole neighbourhood done: its count in all, and no count of this visit's; nor on a first visit,
  // where this visit's is the whole neighbourhood's)
  if (fin) lines.push(`<span class="fin">${t('已打 {n}/{all} 洞', { n: playedCount(), all: HOLES.length })} · ★ ${starsAll()}/${HOLES.length * 3}</span>`);
  else {
    if (G.visit.holes > 0) {
      if (holes > 0) lines.push(`<span class="visit">${pl('这次：+{n} 洞 · +{k} ★', holes, { k: stars })}</span>`); // (pl's {s} is the plural)
      else if (stars > 0) lines.push(`<span class="visit">${t('这次：+{s} ★', { s: stars })}</span>`);
    }
    // (left out on a short screen, so the goal under it stays in sight over the button: golf.css)
    lines.push(`<span class="whole">${t('整个街区：{n}/{all} 洞 · ★ {s}/{S}', { n: playedCount(), all: HOLES.length, s: starsAll(), S: HOLES.length * 3 })}</span>`);
  }
  // (short of gold: what the next medal takes, as a button to the first hole short of three stars; the
  // scorecard marks each with a hollow star)
  const short = shortOf(y);
  if (m < 3 && short.length) lines.push(`<button class="goal" type="button" data-i="${short[0]}">${t('{goal}：重打第 {n} 洞', { goal: goal(y), n: short[0] + 1, medal: t(m === 2 ? '金牌' : '银牌').toLowerCase() })} ›</button>`);
  else if (m < 3) lines.push(`<span class="goal">${goal(y)}</span>`);
  // (a yard all but swept at the easy difficulty: there are harder ones)
  if (G.level === 'easy' && starsIn(y) >= PER * 3 - 4) { lines.push(`<button class="harder" type="button">${t('嫌简单？换个难度')}</button>`); track('tip', 'yard'); }
  const won = m > p.had ? `<small>${t('新奖牌！')}</small>` : '';
  $('card-yard').innerHTML = (fin
    ? `<div class="ym"><span class="row">${YARDS.map((yd, k) => `<span style="--k: ${k}">${medal(medalOf(k))}</span>`).join('')}</span><b>${t('{yard}{medal}', { yard: name, medal: t(MEDALS[m]) })}${won}</b></div>`
    : `<div class="ym one">${medal(m, ' big')}<b>${t(MEDALS[m])}${won}</b></div>`)
    + `<div class="sum"><i>★</i> ${starsIn(y)}/${PER * 3}${p.roundLine ? ' · ' + p.roundLine : ''}</div>`
    + p.card
    + `<div class="lines">${lines.map(l => `<div>${l}</div>`).join('')}</div>`;
  $('card-btn').textContent = onward(fin).text;
  $('card').classList.remove('again');
  // (a fanfare and confetti for it, a new medal or not; fireworks after the fanfare for a new medal, more
  // for the whole neighbourhood done: sound/)
  if (effectsOn()) sound.medal(m > p.had, fin);
  confetti.burst(0, innerHeight, 70, { angle: -1.2, spread: 0.45, speed: innerHeight * 3.2 });
  confetti.burst(innerWidth, innerHeight, 70, { angle: -Math.PI + 1.2, spread: 0.45, speed: innerHeight * 3.2 });
  $('card').querySelector('.inner').scrollTop = 0;
}

window.__golf = {
  get G() { return G; }, get engine() { return engine; }, step, shoot, load, simulate, spec, HOLES, YARDS, audio, PHYS,
  sound, // (sound/: sound.stats() for the tests)
  setLevel: l => useLevel(l), // (for the bots: a difficulty's records, cup and pace, without the menu)
  res, // (the resolution's steps down: res.k, res.log; for the tests)
  cam, // (the camera along with the ball: for the tests)
  camDone, // (the camera's move after a fade, done at once: for the tests, after a hole changed by the card or the holes)
};

boot();
