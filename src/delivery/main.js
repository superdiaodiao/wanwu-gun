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

const $ = id => document.getElementById(id);
const nextFrame = () => new Promise(r => requestAnimationFrame(() => r()));
const HOUR = 17.6; // golden hour, so the town doesn't look like 万物皆可滚's morning
// where the ride starts: 幸福路 by the food street, heading east in the eastbound (south) half
// (traffic keeps to the right)
const START = { x: -10, z: 58.5, heading: Math.PI / 2 };

let engine, sky, ground, world, layout, movers, input, maps, bike, material;
const G = { t: 0, chaos: 0, shake: 0 };
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
    const k = Math.min(1, dt * 7);
    this.pos.lerp(p, k);
    this.look.lerp(l, Math.min(1, dt * 10));
    this.fov += (62 + Math.min(14, bike.speed * 0.6) + (bike.boostT > 0 ? 6 : 0) - this.fov) * Math.min(1, dt * 4);
    this.apply();
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
  for (const e of events) {
    if (e.type === 'knock') G.chaos++;
    else if (e.type === 'crash') G.shake = Math.max(G.shake, 0.25 * e.impact);
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

let shown = { sp: -1, chaos: -1 };
function hud(dt) {
  const sp = Math.round(bike.speed * 3.6);
  if (sp !== shown.sp) $('speed-num').textContent = shown.sp = sp;
  if (G.chaos !== shown.chaos) $('chaos-num').textContent = shown.chaos = G.chaos;
  $('boost-bar').style.width = `${Math.round((bike.boostT > 0 ? bike.boostT / RIDE.boostTime : bike.boost) * 100)}%`;
  // (the minimap's "ball": the bike, seen at street scale)
  // (the minimap turns with the ball game's heading, whose forward is (sin, -cos): π − ours)
  maps.update(dt, { pos: bike.pos, S: 1.2, pickLimit: () => 0 }, Math.PI - cam.yaw, 1.2);
}

// for testing: drive it from the console / automated runs
window.__delivery = { get G() { return G; }, get bike() { return bike; }, get world() { return world; }, get layout() { return layout; }, step, cam };

boot();
