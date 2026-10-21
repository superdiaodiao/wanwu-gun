// 外卖狂飙 (working title) — boot and main loop of the delivery game. It shares the town, the models,
// the ground and sky and the traffic with 万物皆可滚 (src/main.js), but none of that game's logic:
// the player rides an e-bike (scooter.js) with a chase camera behind it, at the end of the afternoon.
import * as THREE from 'three';
import '../catalog/index.js';
import { buildAtlas, loadFonts, atlasTexture, repaintAtlas } from '../core/atlas.js';
import { objectMaterial, U as MU } from '../core/materials.js';
import { LOD_PART, LOD_COARSE, pumpCoarse, wantCoarse } from '../core/assets.js';
import { Engine } from '../game/engine.js';
import { Sky } from '../game/sky.js';
import { Ground } from '../game/ground.js';
import { World } from '../game/world.js';
import { buildLayout } from '../game/layout.js';
import { Movers } from '../game/movers.js';
import { Input, isTouch } from '../game/input.js';
import { Maps } from '../game/minimap.js';
import { Scooter, RIDE } from './scooter.js';
import { t } from '../i18n/index.js';

const $ = id => document.getElementById(id);
const nextFrame = () => new Promise(r => requestAnimationFrame(() => r()));
const HOUR = 17.6; // golden hour, so the town doesn't look like 万物皆可滚's morning
// where the ride starts: 幸福路 by the food street, heading east in the eastbound (south) half
// (traffic keeps to the right)
const START = { x: -10, z: 58.5, heading: Math.PI / 2 };

let engine, sky, ground, world, layout, movers, input, maps, bike, material;
const G = { t: 0, score: 0, shake: 0 };
// the movers' idea of "the ball": the bike, as big as a car's notice (cars brake and honk for it,
// people step aside) but too small to make anything flee
const near = { pos: new THREE.Vector3(), S: 1.4, r: 0.7, pickLimit: () => 0 };

async function boot() {
  const fontsDone = loadFonts(12000);
  await Promise.race([fontsDone, new Promise(r => setTimeout(r, 600))]);
  let atlasStale = false;
  fontsDone.then(() => (atlasStale = true));
  await nextFrame();
  buildAtlas();
  material = objectMaterial(atlasTexture());
  const mobile = matchMedia('(pointer: coarse)').matches || Math.min(screen.width, screen.height) < 700;
  engine = new Engine($('game'), mobile ? 'low' : 'high');
  engine.scene.fog = new THREE.FogExp2(0xdfe8ee, 0.002);
  sky = new Sky(engine.scene);
  ground = new Ground(engine.scene);
  world = new World(engine.scene);
  await nextFrame();
  layout = buildLayout(world);
  addTraffic();
  ground.build(layout.zones);
  await nextFrame();
  world.finalize();
  movers = new Movers(world, layout);
  bike = new Scooter(engine.scene, world, material);
  bike.reset(START.x, START.z, START.heading);
  input = new Input($('game'));
  if (isTouch()) for (const id of ['touch-zone', 'touch-dash']) $(id).hidden = false;
  maps = new Maps(world, layout);
  maps.attach($('minimap'));
  cam.snap();
  view();
  engine.renderer.compile(engine.scene, engine.camera);
  for (const t of world.types.values()) wantCoarse(t.spec);
  G.atlasCheck = () => { if (atlasStale) { atlasStale = false; repaintAtlas(); } };
  requestAnimationFrame(loop);
  await nextFrame();
  $('loading').classList.add('done');
  window.__ready = true;
}

// ---- traffic ------------------------------------------------------------------------------------
// The town was built for a rolling ball, with a few cars for colour. Riding needs traffic to weave
// through, so the roads of the middle of town get more: a car every DRIVE_GAP m or so along each
// lane (the movers put each on its lane and drive it), mostly cars, some taxis, vans and buses.
const DRIVE_GAP = 22, TRAFFIC = [['car_sedan', 6], ['taxi', 4], ['suv', 3], ['minivan', 2], ['bus', 1], ['truck', 0.6], ['delivery_rider', 1.2]];
function addTraffic() {
  const total = TRAFFIC.reduce((a, [, w]) => a + w, 0);
  const pick = () => {
    let r = Math.random() * total;
    for (const [id, w] of TRAFFIC) if ((r -= w) < 0) return id;
    return TRAFFIC[0][0];
  };
  for (const lane of layout.lanes) {
    if (lane.y > 0.5) continue; // (the railway)
    const pts = lane.pts;
    for (let i = 0; i < pts.length; i++) {
      const [x0, z0] = pts[i], [x1, z1] = pts[(i + 1) % pts.length];
      if (!lane.loop && i === pts.length - 1) break;
      const len = Math.hypot(x1 - x0, z1 - z0);
      for (let d = Math.random() * DRIVE_GAP; d < len; d += DRIVE_GAP * (0.7 + Math.random() * 0.6)) {
        const x = x0 + ((x1 - x0) * d) / len, z = z0 + ((z1 - z0) * d) / len;
        if (Math.abs(x) > 340 || Math.abs(z) > 320) continue;
        if (Math.hypot(x - START.x, z - START.z) < 18) continue;
        world.add(pick(), x, z, { yaw: Math.atan2(x1 - x0, z1 - z0) });
      }
    }
  }
}

// ---- controls -------------------------------------------------------------------------------------
// keyboard: W/S throttle and brake, A/D steer; touch: the stick pushed up is throttle, down brake,
// sideways steers (screen-up is straight ahead: the camera is always behind the bike)
function controls() {
  const raw = input.poll();
  let throttle = raw.fwd ? 1 : 0, brake = raw.back ? 1 : 0, steer = raw.keyTurn || raw.padTurn || 0;
  if (raw.stick && raw.stick.m > 0.12) {
    const up = Math.cos(raw.stick.a) * raw.stick.m, across = Math.sin(raw.stick.a) * raw.stick.m;
    throttle = Math.max(throttle, up > 0.15 ? Math.min(1, up * 1.4) : 0);
    brake = Math.max(brake, up < -0.35 ? Math.min(1, -up * 1.4) : 0);
    steer = Math.max(-1, Math.min(1, across * 1.6));
  }
  return { throttle, brake, steer, boost: raw.dash };
}

// ---- chase camera -----------------------------------------------------------------------------------
// behind and above the bike, swinging round after it with a little lag, pulling back and widening
// with speed; it looks a few metres ahead of the bike
const _cc = new THREE.Vector3(), _ch = {}, _ccands = [];
const cam = {
  pos: new THREE.Vector3(),
  look: new THREE.Vector3(),
  yaw: 0,
  fov: 62,
  target(out, look) {
    const sp = bike.speed;
    const back = 4.6 + sp * 0.07, up = 2.2 + sp * 0.03;
    out.set(bike.pos.x - Math.sin(this.yaw) * back, up, bike.pos.z - Math.cos(this.yaw) * back);
    look.set(bike.pos.x + Math.sin(this.yaw) * 4, 1.1, bike.pos.z + Math.cos(this.yaw) * 4);
  },
  snap() {
    this.yaw = bike.heading;
    this.target(this.pos, this.look);
    this.apply();
  },
  update(dt) {
    let d = bike.heading - this.yaw;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    this.yaw += d * Math.min(1, dt * 4.5);
    const p = new THREE.Vector3(), l = new THREE.Vector3();
    this.target(p, l);
    this.clear(p);
    const k = Math.min(1, dt * 7);
    this.pos.lerp(p, k);
    this.look.lerp(l, Math.min(1, dt * 10));
    this.fov += (62 + Math.min(14, bike.speed * 0.6) + (bike.boostT > 0 ? 6 : 0) - this.fov) * Math.min(1, dt * 4);
    this.apply();
  },
  /** pull the camera in towards the rider when a wall, tree or car stands between them */
  clear(p) {
    const hx = bike.pos.x, hy = 1.4, hz = bike.pos.z;
    for (let k = 0.3; k <= 1.001; k += 0.1) {
      _cc.set(hx + (p.x - hx) * k, hy + (p.y - hy) * k, hz + (p.z - hz) * k);
      for (const o of world.grid.query(_cc.x, _cc.z, 1, _ccands, 0.5)) {
        if (o.state !== 0 || o.h < 1.4) continue;
        if (!world.contact(o, _cc, 0.35, _ch, true) || _ch.low) continue;
        const s = Math.max(0.25, k - 0.12);
        p.set(hx + (p.x - hx) * s, hy + (p.y - hy) * s, hz + (p.z - hz) * s);
        return;
      }
    }
  },
  apply() {
    const c = engine.camera;
    c.position.copy(this.pos);
    if (G.shake > 0) c.position.add(new THREE.Vector3((Math.random() - 0.5) * G.shake, (Math.random() - 0.5) * G.shake, 0));
    c.lookAt(this.look);
    c.fov = this.fov;
    c.updateProjectionMatrix();
  },
};

// ---- 擦肩而过: the reason to ride fast in traffic -------------------------------------------------
// Passing a moving car within a hand's breadth (closer than NEAR m between the bike and its body) at
// speed, without touching it, scores and chains: every pass within COMBO_T s of the last adds one
// to the chain and is worth more, and tops the boost up. Parked cars don't count (too easy), and
// touching one is a crash, which ends the chain. Nothing is scored for hitting anything.
const NEAR = 1.3, COMBO_T = 4, NEAR_SPEED = 8, NEAR_REL = 5;
const nm = { combo: 0, left: 0, best: 0, seen: new Map() };
const _nc = new THREE.Vector3(), _nh = {}, _ncands = [];
function nearMisses(dt) {
  if (nm.combo && (nm.left -= dt) <= 0) nm.combo = 0;
  if (bike.speed < NEAR_SPEED) return;
  const f = bike.forward(), vx = f.x * bike.v, vz = f.z * bike.v;
  _nc.set(bike.pos.x, RIDE.r, bike.pos.z);
  for (const o of world.grid.query(_nc.x, _nc.z, 8, _ncands, 0.5)) {
    const m = o.mover;
    if (o.state !== 0 || !m || m.kind !== 'drive' || o.spec.cat !== 'vehicle') continue;
    if (G.t - (nm.seen.get(o) ?? -9) < 2.5) continue;
    if (world.contact(o, _nc, RIDE.r, _nh, true)) continue; // touching: a crash, not a miss
    if (!world.contact(o, _nc, RIDE.r + NEAR, _nh, true)) continue;
    if (Math.hypot(vx - (m.vx || 0), vz - (m.vz || 0)) < NEAR_REL) continue;
    nm.seen.set(o, G.t);
    nm.combo++;
    nm.best = Math.max(nm.best, nm.combo);
    nm.left = COMBO_T;
    const pts = 50 * nm.combo;
    G.score += pts;
    bike.boost = Math.min(1, bike.boost + 0.2);
    popup(`${t('擦肩而过')}${nm.combo > 1 ? ` ×${nm.combo}` : ''}<small>+${pts}</small>`);
  }
}

/** ran into something solid hard enough to count: the chain breaks; a person is the worst of it */
function crashed(e) {
  G.shake = Math.max(G.shake, 0.25 * e.impact);
  const cat = e.o.spec.cat;
  if (cat === 'person' || cat === 'animal') {
    bike.v *= 0.2;
    bike.side = 0;
    G.shake = 0.45;
    popup(t('小心行人！'), true);
  } else if (cat === 'vehicle') popup(t('撞车了！'), true);
  else if (e.impact > 0.4) popup(t('撞上了！'), true);
  nm.combo = 0;
}

function popup(html, bad = false) {
  const el = document.createElement('div');
  el.className = bad ? 'pop bad' : 'pop';
  el.innerHTML = html;
  $('popups').appendChild(el);
  setTimeout(() => el.remove(), 1200);
  while ($('popups').children.length > 3) $('popups').firstChild.remove();
}

// ---- per frame ----------------------------------------------------------------------------------
let last = performance.now();
const events = [];
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
  events.length = 0;
  bike.update(dt, controls(), G.t, events);
  const b = layout.bounds, d = Math.hypot(bike.pos.x, bike.pos.z);
  if (d > b) bike.pos.multiplyScalar(b / d);
  near.pos.copy(bike.pos);
  movers.update(dt, G.t, near, events);
  world.updateFlyers(dt);
  nearMisses(dt);
  for (const e of events) {
    if (e.type === 'crash') crashed(e);
  }
  G.shake = Math.max(0, G.shake - dt * 1.5);
  cam.update(dt);

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
  engine.scene.fog.density = 1 / 900;
  view();
  MU.time.value = G.t;
  hud(dt);
}

/** what to draw: everything within the fog, detail by size on screen, shadows round the bike */
function view() {
  const c = engine.camera;
  const F = engine.height / (2 * Math.tan((c.fov * Math.PI) / 360));
  const det = engine.q.detail;
  world.updateVisibility(c, 2 / engine.scene.fog.density, (F / 2) * det, ((LOD_PART * F) / 1.5) * det, ((LOD_COARSE * F) / 1.5) * det, bike.pos, engine.q.shadows ? 30 : 0, null);
  engine.updateShadow(bike.pos, 24);
}

function render() {
  if (G.atlasCheck && bike.speed < 0.5) G.atlasCheck();
  const r = engine.renderer;
  r.setScissorTest(false);
  r.setViewport(0, 0, engine.width, engine.height);
  r.clear();
  r.render(engine.scene, engine.camera);
}

let shown = { sp: -1, score: -1, combo: -1 };
function hud(dt) {
  const sp = Math.round(bike.speed * 3.6);
  if (sp !== shown.sp) $('speed-num').textContent = shown.sp = sp;
  if (G.score !== shown.score) $('score-num').textContent = shown.score = G.score;
  if (nm.combo !== shown.combo) {
    shown.combo = nm.combo;
    $('combo').hidden = nm.combo < 2;
    $('combo-num').textContent = `×${nm.combo}`;
  }
  if (nm.combo >= 2) $('combo-bar').style.width = `${Math.round((nm.left / COMBO_T) * 100)}%`;
  $('boost-bar').style.width = `${Math.round((bike.boostT > 0 ? bike.boostT / RIDE.boostTime : bike.boost) * 100)}%`;
  // (the minimap's "ball": the bike, seen at street scale)
  // (the minimap turns with the ball game's heading, whose forward is (sin, -cos): π − ours)
  maps.update(dt, { pos: bike.pos, S: 1.2, pickLimit: () => 0 }, Math.PI - cam.yaw, 1.2);
}

// for testing: drive it from the console / automated runs
window.__delivery = { get G() { return G; }, get bike() { return bike; }, get world() { return world; }, get layout() { return layout; }, step, cam };

boot();
