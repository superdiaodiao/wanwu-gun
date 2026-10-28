// 小区高尔夫 (working title) — mini golf through a 小区, built from 万物皆可滚's models: a golf ball,
// and each hole ends in a cup with a glowing rim. Hold and pull back anywhere, let go to putt (a dotted line shows where it will run, up to the first bounce).
// Every hole has its own nuisance: cones and mahjong tables in the way, fans blowing, shared bikes
// crossing, a goose guarding the hole, a cat swiping; until the first shot each says over it what it
// does to the ball. Stars: one for sinking it, one for par or better, one for every sweet on the
// green picked up on the way. The nine holes make a round: the best strokes for each hole and for
// a whole round are kept.
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
import { BALL_R, PHYS, stepBall, simulate, shotSpeed, windAt } from './physics.js';
import { buildCourse } from './course.js';
import { buildProps } from './props.js';
import { HOLES } from './holes.js';
import { golfBall, Trail } from './ball.js';

applyContent();

const $ = id => document.getElementById(id);
const nextFrame = () => new Promise(r => requestAnimationFrame(() => r()));
const GIVE_UP = 5; // strokes over par before the hole lets you off
const store = {
  get(k, d) { try { const v = localStorage.getItem('golf.' + k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('golf.' + k, JSON.stringify(v)); } catch {} },
};

let engine, material, fx;
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
  mesh.scale.setScalar(k);
  mesh.position.set(-s.center.x * k, -s.bbox.min.y * k, -s.center.z * k);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  const g = new THREE.Group();
  g.add(mesh);
  return g;
}

const G = {
  hole: 0, state: 'load', strokes: 0, got: 0, best: [], round: [], course: null, props: [], cols: [], sweets: [],
  ball: { x: 0, z: 0, vx: 0, vz: 0, lip: 0 }, still: 0, aim: null, hitT: 0, t: 0, sinkT: 0, live: true,
  pushed() { if (G.state === 'aim') { G.aim = null; showAim(false); G.state = 'roll'; G.still = 0; G.rollT = 0; } },
};

async function boot() {
  translateDom();
  if (EN) document.title = t('小区高尔夫');
  const fontsDone = loadFonts(12000);
  await Promise.race([fontsDone, new Promise(r => setTimeout(r, 600))]);
  await nextFrame();
  buildAtlas();
  material = objectMaterial(atlasTexture());
  engine = new Engine($('game'), matchMedia('(pointer: coarse)').matches ? 'medium' : 'high');
  const sc = engine.scene;
  sc.background = new THREE.Color(0xcfeaf5);
  sc.fog = new THREE.Fog(0xcfeaf5, 40, 90);
  engine.hemi.color.set(0xf4fbff);
  engine.hemi.groundColor.set(0xb9d6a8);
  engine.hemi.intensity = 1.6;
  engine.sun.intensity = 2.5;
  engine.sunDir.set(-0.35, 1, 0.5).normalize();
  fx = new FX(sc);
  makeBall(sc);
  makeAim(sc);
  engine.camera.fov = 40;
  addEventListener('resize', () => { aim(); hudBottom(); });
  const cv = $('game');
  cv.addEventListener('pointerdown', onDown);
  cv.addEventListener('contextmenu', e => e.preventDefault());
  addEventListener('pointermove', onMove);
  addEventListener('pointerup', onUp);
  addEventListener('pointercancel', () => { G.aim = null; showAim(false); });
  $('card-btn').addEventListener('click', () => { audio.ui('click'); next(); });
  G.best = store.get('best', []);
  G.round = store.get('round', []);
  load(Math.min(store.get('hole', 0), HOLES.length - 1));
  requestAnimationFrame(loop);
  await nextFrame();
  $('loading').classList.add('done');
  window.__ready = true;
}

async function wake() {
  try { await audio.init(); if (!G.music) { G.music = true; audio.music('title', { fade: 2 }); } } catch {}
}

// ---- the ball and the aiming guide -----------------------------------------------------------------
let ballG, ballSpin, trail, arrow, arrowMat, dots, ring;
function makeBall(sc) {
  ballG = new THREE.Group();
  ballSpin = golfBall(BALL_R);
  ballG.add(ballSpin);
  sc.add(ballG);
  trail = new Trail(sc, BALL_R * 0.8);
}
function makeAim(sc) {
  // an arrow flat on the green from the ball, longer and redder with power
  const shape = new THREE.Shape();
  shape.moveTo(-0.05, 0); shape.lineTo(0.05, 0); shape.lineTo(0.05, 0.75); shape.lineTo(0.14, 0.75);
  shape.lineTo(0, 1); shape.lineTo(-0.14, 0.75); shape.lineTo(-0.05, 0.75); shape.closePath();
  arrowMat = new THREE.MeshBasicMaterial({ color: 0xffd34d, transparent: true, opacity: 0.9, depthWrite: false });
  arrow = new THREE.Mesh(new THREE.ShapeGeometry(shape), arrowMat);
  arrow.rotation.x = -Math.PI / 2;
  const holder = new THREE.Group();
  holder.add(arrow);
  arrow.userData.holder = holder;
  sc.add(holder);
  // dots along where it will run
  dots = new THREE.InstancedMesh(new THREE.SphereGeometry(0.035, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffffff }), 40);
  dots.count = 0;
  sc.add(dots);
  ring = new THREE.Mesh(new THREE.RingGeometry(BALL_R * 1.6, BALL_R * 1.9, 32), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7, depthWrite: false }));
  ring.rotation.x = -Math.PI / 2;
  sc.add(ring);
  showAim(false);
}
function showAim(on) {
  arrow.userData.holder.visible = on;
  dots.visible = on;
  $('power').hidden = !on;
  if (on) $('hint').hidden = true;
}

// ---- a hole ----------------------------------------------------------------------------------------------
function load(i) {
  if (G.course) engine.scene.remove(G.course.group);
  G.hole = i;
  const hole = HOLES[i];
  const ctx = { model, spec, audio, fx };
  G.course = buildCourse(hole, i, { scene: engine.scene, model });
  G.props = buildProps(hole, G.course, ctx);
  G.cols = [...G.course.cols, ...G.props.flatMap(p => p.cols)];
  G.course.cols = G.cols; // what the ball meets: walls and everything on the green
  G.sweets = G.course.candies.map((p, k) => {
    const g = model(['candy', 'lollipop', 'coin_1yuan'][k % 3], 1, 0.5);
    g.position.set(p.x, 0.16, p.z);
    G.course.group.add(g);
    return { x: p.x, z: p.z, g, got: false, t: k };
  });
  Object.assign(G.ball, { x: G.course.tee.x, z: G.course.tee.z, vx: 0, vz: 0, lip: 0 });
  G.from = { x: G.ball.x, z: G.ball.z };
  G.green = new Set(G.course.tiles.map(q => q.c + ',' + q.r));
  ballG.visible = true;
  ballG.scale.setScalar(1);
  trail.reset();
  G.strokes = 0; G.got = 0; G.still = 0; G.aim = null; G.state = 'aim'; G.live = true;
  showAim(false);
  $('card').hidden = true;
  $('hint').hidden = i > 0 || store.get('shot', false);
  // a round starts at the first hole
  if (i === 0) { G.round = []; store.set('round', G.round); }
  hud();
  aim();
  banner(t(hole.name), t(hole.tip));
  // what each nuisance does (one of each kind: the one lowest on the screen, so furthest from the
  // bars at the top), and on the first hole what the sweets are for
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
  tagsTimer = setTimeout(() => { if (G.hole === hole && G.strokes === 0 && G.state !== 'card') box.classList.remove('out'); }, 2100);
}
/** where the bars at the top end */
function hudBottom() {
  tagTop = Math.max(...['hole', 'score', 'stars'].map(id => $(id).getBoundingClientRect().bottom)) + 6;
}
function placeTags() {
  if (!tags.length) return;
  const cv = engine.renderer.domElement, w = cv.clientWidth, h = cv.clientHeight, placed = [];
  for (const tg of tags) {
    tagV.set(...tg.at()).project(engine.camera);
    // kept on the screen and off the bars at the top: a thing near an edge has its tag pushed in,
    // one up by the bars has it below instead of above; and a tag that would cover another moves on
    const x = Math.max(6, Math.min(w - 2 * tg.half - 6, ((tagV.x + 1) / 2) * w - tg.half));
    const py = ((1 - tagV.y) / 2) * h, below = py - 8 - tg.h < tagTop;
    let y = below ? py + 8 : py - 8 - tg.h;
    for (let k = 0; k < 4; k++) {
      const o = placed.find(r => x < r.x + r.w && r.x < x + 2 * tg.half && y < r.y + r.h && r.y < y + tg.h);
      if (!o) break;
      y = below ? o.y + o.h + 4 : o.y - tg.h - 4;
    }
    y = Math.max(tagTop, Math.min(h - tg.h - 6, y));
    placed.push({ x, y, w: 2 * tg.half, h: tg.h });
    tg.el.classList.toggle('below', below);
    tg.el.style.transform = `translate(${x}px, ${y}px)`;
  }
}

function next() {
  if (G.hole + 1 < HOLES.length) load(G.hole + 1);
  else load(0);
}

function hud() {
  const hole = HOLES[G.hole];
  $('hole-num').textContent = t('第 {n} 洞', { n: G.hole + 1 });
  $('hole-name').textContent = t(hole.name);
  $('strokes-num').textContent = G.strokes;
  $('par').textContent = t('标准 {n}', { n: hole.par });
  $('sweets-num').textContent = `${G.got}/${G.sweets.length}`;
  $('stars-num').textContent = G.best.reduce((a, b) => a + (b || 0), 0);
}

function banner(title, sub) {
  const b = $('banner');
  b.hidden = true;
  $('banner-title').textContent = title;
  $('banner-sub').textContent = sub || '';
  void b.offsetWidth;
  b.hidden = false;
}

/** frame the whole hole from its near end, so the ball starts near the player and is hit away from
 *  them: as close as still shows every wall and the flag, clear of the bars at top and bottom */
function aim() {
  const c = engine.camera, b = G.course.bounds;
  const cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2;
  const dir = new THREE.Vector3(0, 0, 1); // (every hole is drawn with its tee at the near end, +z)
  const pts = [];
  for (const x of [b.x0, b.x1]) for (const z of [b.z0, b.z1]) pts.push(new THREE.Vector3(x, 0, z), new THREE.Vector3(x, 0.3, z));
  pts.push(new THREE.Vector3(G.course.cup.x, 1.3, G.course.cup.z));
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
  // the middle), but not so low that the far end comes out less than half the size of the near end
  // (a wide hole on a tall screen gains nothing from it, only flattens, so stays as seen from above)
  const metre = z => {
    const a = new THREE.Vector3(cx, 0, z).project(c), e = new THREE.Vector3(cx + 1, 0, z).project(c);
    return Math.abs(e.x - a.x);
  };
  let best = 0.62, most = 0;
  for (let a = 0.62; a <= 1.25; a += 0.03) {
    tilt = a;
    fit();
    const near = metre(b.z1);
    if (metre(b.z0) < near * 0.5) break;
    if (near > most * 1.02) { most = near; best = a; }
  }
  tilt = best;
  fit();
  // nudge the target so the course sits in the middle of the free band
  let minY = 1, maxY = -1;
  for (const p of pts) { const v = p.clone().project(c); minY = Math.min(minY, v.y); maxY = Math.max(maxY, v.y); }
  const shift = ((maxY + minY) / 2 - 0.02) * 0.5;
  target.addScaledVector(dir, -shift * (b.z1 - b.z0) * 0.5);
  fit();
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
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
function groundAt(x, y) {
  const r = engine.renderer.domElement.getBoundingClientRect();
  ndc.set(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(ndc, engine.camera);
  const p = new THREE.Vector3();
  return ray.ray.intersectPlane(ground, p) ? p : null;
}
function onDown(e) {
  wake();
  // one finger, the main mouse button; a second touch doesn't take the shot over
  if (G.state !== 'aim' || G.aim || !e.isPrimary || e.button !== 0) return;
  const p = groundAt(e.clientX, e.clientY);
  if (!p) return;
  G.aim = { id: e.pointerId, sx: e.clientX, sy: e.clientY, start: p, ang: 0, p: 0 };
  try { e.target.setPointerCapture(e.pointerId); } catch {}
}
function onMove(e) {
  const a = G.aim;
  if (!a || e.pointerId !== a.id) return;
  const p = groundAt(e.clientX, e.clientY);
  if (!p) return;
  const px = Math.hypot(e.clientX - a.sx, e.clientY - a.sy);
  a.p = Math.max(0, Math.min(1, (px - 10) / (0.3 * Math.min(innerWidth, innerHeight))));
  const dx = a.start.x - p.x, dz = a.start.z - p.z;
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
  holder.position.set(b.x, 0.02, b.z);
  holder.rotation.y = -a.ang; // the shape points along local +y, which the flat turn makes -z
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
    m.makeTranslation(x, 0.05, z);
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
  audio.pickup('hard', 0.5 + p * 0.4, 0.12);
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
  step(dt);
}

function onHit(c, s) {
  if (c.owner?.hit) c.owner.hit(s);
  if (G.hitT > 0 || s < 0.5) return;
  G.hitT = 0.07;
  if (c.lip) audio.pickup('hard', 0.3, 0.05);
  else if (!c.owner) audio.pickup('hard', Math.min(1, s / 7) * 0.7, 0.35);
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
      fx.pickup(b.x, 0.2, b.z, 0.05, 0.25);
      G.still = 0;
      if (G.state === 'roll') { if (G.strokes >= HOLES[G.hole].par + GIVE_UP) finish(false); else G.state = 'aim'; }
    }
    const sp = Math.hypot(b.vx, b.vz);
    if (G.state === 'aim' && sp > 0.3) G.pushed();
    if (G.state === 'roll') {
      // (in a fan's wind it isn't held still: it drifts on until it is pinned against a wall)
      const blown = G.course.winds.length && windAt(G.course, b.x, b.z) > PHYS.a0;
      if (sp < PHYS.rest) { G.still += dt; if (!blown) { b.vx *= 0.5; b.vz *= 0.5; } } else G.still = 0;
      G.rollT += dt;
      // (a safety net: nothing should keep a ball going this long, but if it does, it stops)
      if (G.still > 0.2 || G.rollT > 25) {
        b.vx = 0; b.vz = 0;
        if (G.strokes >= HOLES[G.hole].par + GIVE_UP) finish(false);
        else G.state = 'aim';
      }
    }
    // sweets on the way
    for (const s of G.sweets) if (!s.got && Math.hypot(s.x - b.x, s.z - b.z) < 0.4) {
      s.got = true;
      G.got++;
      audio.pickup(spec(['candy', 'lollipop', 'coin_1yuan'][s.t % 3]).sfx, 0.5, 0.1);
      audio.comboChime(Math.min(6, G.got + 1));
      fx.pickup(s.x, 0.3, s.z, 0.1, 0.4);
      hud();
    }
    // rolling: turn the ball about the axis across its path
    const d = sp * dt;
    if (d > 0) ballSpin.rotateOnWorldAxis(new THREE.Vector3(b.vz, 0, -b.vx).normalize(), d / BALL_R);
    ballG.position.set(b.x, BALL_R, b.z);
    trail.update(b.x, b.z, sp, dt);
  } else trail.reset();
  if (G.state === 'sink') {
    // into the cup: slide to the middle and drop
    G.sinkT += dt;
    const k = Math.min(1, G.sinkT / 0.3), cup = G.course.cup;
    ballG.position.set(b.x + (cup.x - b.x) * k, BALL_R - k * k * 0.35, b.z + (cup.z - b.z) * k);
    ballG.scale.setScalar(1 - k * 0.5);
    if (G.sinkT > 0.3) ballG.visible = false;
  }
  for (const s of G.sweets) {
    if (s.got) { s.g.position.y += dt * 3; s.g.scale.multiplyScalar(Math.max(0, 1 - dt * 6)); continue; }
    s.g.rotation.y += dt * 1.6;
    s.g.position.y = 0.16 + Math.sin(G.t * 3 + s.t) * 0.05;
  }
  // the hole's glow cycles through the five colours; the flag flutters
  const cf = G.course.cupFx;
  cf.rim.color.setHSL((G.t * 0.15) % 1, 0.9, 0.6);
  cf.flag.rotation.y = Math.sin(G.t * 2.3) * 0.25;
  ring.visible = G.state === 'aim';
  ring.position.set(b.x, 0.012, b.z);
  ring.material.opacity = 0.45 + Math.sin(G.t * 4) * 0.25;
  if (G.aim && G.state === 'aim') drawAim();
  fx.update(dt);
  if (!draw) return;
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

function sink() {
  G.state = 'sink';
  G.sinkT = 0;
  const cup = G.course.cup;
  audio.patch();
  for (let i = 0; i < (G.strokes === 1 ? 6 : 3); i++) setTimeout(() => fx.firework(cup.x + (Math.random() - 0.5) * 0.6, 0.5 + Math.random() * 0.6, cup.z + (Math.random() - 0.5) * 0.6, 1.1), i * 160);
  if (G.strokes === 1) audio.fireworks();
  setTimeout(() => finish(true), 900);
}

function finish(sunk) {
  if (G.state === 'card') return;
  G.state = 'card';
  G.live = false;
  const hole = HOLES[G.hole], all = G.sweets.length;
  const stars = !sunk ? 0 : 1 + (G.strokes <= hole.par ? 1 : 0) + (G.got >= all ? 1 : 0);
  G.best[G.hole] = Math.max(G.best[G.hole] || 0, stars);
  store.set('best', G.best);
  if (sunk && stars === 3) audio.milestone(5);
  $('card-title').textContent = !sunk ? t('这洞先放过你') : G.strokes === 1 ? t('一杆进洞！') : t('进洞！');
  $('card-stars').innerHTML = [0, 1, 2].map(i => `<i class="${i < stars ? 'on' : ''}">★</i>`).join('');
  $('card-sub').textContent = t('{n} 杆 · 标准杆 {par} · 糖 {got}/{all}', { n: G.strokes, par: hole.par, got: G.got, all });
  const lastHole = G.hole + 1 >= HOLES.length;
  $('card-btn').textContent = lastHole ? t('从第一洞再来') : t('下一洞');
  if (lastHole) $('card-sub').textContent += ' · ' + t('一共 {n} 颗星', { n: G.best.reduce((a, b) => a + (b || 0), 0) });
  // records: this hole's fewest strokes, and on the last hole the round's
  const lines = [];
  const holeBest = store.get('strokes', []), was = holeBest[G.hole];
  if (sunk) {
    if (was && G.strokes < was) lines.push(`<b>${t('新纪录！')}</b> ${t('最好 {n} 杆', { n: G.strokes })}`);
    else if (was) lines.push(t('最好 {n} 杆', { n: was }));
    if (!was || G.strokes < was) { holeBest[G.hole] = G.strokes; store.set('strokes', holeBest); }
  }
  G.round[G.hole] = G.strokes; // (a hole let off counts the strokes it took)
  store.set('round', G.round);
  // (coming back later goes on to the next hole, or after the last starts a new round)
  store.set('hole', lastHole ? 0 : G.hole + 1);
  if (lastHole && HOLES.every((h, k) => G.round[k] > 0)) {
    const total = G.round.reduce((a, b) => a + b, 0), par = HOLES.reduce((a, h) => a + h.par, 0);
    const bestRound = store.get('bestRound', 0);
    const line = t('这一轮 {n} 杆 · 标准杆 {par}', { n: total, par });
    if (bestRound && total < bestRound) lines.push(`<b>${t('新纪录！')}</b> ${line}`);
    else lines.push(line + (bestRound ? ' · ' + t('最好一轮 {n} 杆', { n: bestRound }) : ''));
    if (!bestRound || total < bestRound) store.set('bestRound', total);
  }
  $('card-best').innerHTML = lines.map(l => `<div>${l}</div>`).join('');
  $('card-best').hidden = !lines.length;
  hud();
  $('card').hidden = false;
}

window.__golf = {
  get G() { return G; }, get engine() { return engine; }, step, shoot, load, simulate, spec, HOLES,
};

boot();
