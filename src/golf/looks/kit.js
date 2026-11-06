// What the looks (looks/*.js) and course.js build with: the levels everything stands at, a seeded
// random, canvases made into textures, the earth on the block's sides, a water that ripples, things
// going round the pond along the lane, and a cloud of falling leaves or snow.
import * as THREE from 'three';
import { U } from '../../core/materials.js';

export const WALL_T = 0.22, WALL_TOP = 0.2, LEDGE = 0.16; // the rail; the strip of grass outside it
export const WATER = -0.72, LAWN = -0.24, MOAT = 2.6; // the pond's level, the park's, the pond's width
export const BLOCK_TOP = -0.03, BLOCK_BOT = WATER - 0.3; // the block under the green
export const O = WALL_T + LEDGE; // how far the block reaches out past the green's edge

export const lam = color => new THREE.MeshLambertMaterial({ color });

/** a tiny seeded random, so a hole's yard looks the same every time */
export function rng(seed) {
  let s = seed * 9301 + 49297;
  return () => ((s = (s * 9301 + 49297) % 233280) / 233280);
}

export function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}
export function texture(c, repeat) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/** the shape of a rounded rectangle, in the shape plane (x, -z), as a path */
export function roundRect(path, x0, z0, x1, z1, r) {
  const a = -z1, b = -z0; // (shape y runs up the screen of the map: -z)
  path.moveTo(x0 + r, a);
  path.lineTo(x1 - r, a);
  path.quadraticCurveTo(x1, a, x1, a + r);
  path.lineTo(x1, b - r);
  path.quadraticCurveTo(x1, b, x1 - r, b);
  path.lineTo(x0 + r, b);
  path.quadraticCurveTo(x0, b, x0, b - r);
  path.lineTo(x0, a + r);
  path.quadraticCurveTo(x0, a, x0 + r, a);
  return path;
}

// ---- the earth on the block's sides (and the pond's bank): a lip of grass over layered soil and
// pebbles, darker going down; it repeats left to right, one copy a metre. A look can have its own
// colours: soil({ top, mid, foot, lip, lipTop }) (a lip of snow, a darker loam), one texture for each ----
const SOIL = { top: '#b07a45', mid: '#94603a', foot: '#5e3c22', lip: '#3d9a34', lipTop: '#56b845' };
const soils = {};
export function soil(colors) {
  const C = { ...SOIL, ...colors }, key = JSON.stringify(C);
  if (soils[key]) return soils[key];
  const w = 128, h = 256, c = canvas(w, h), g = c.getContext('2d'), R = rng(5);
  const grad = g.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, C.top); grad.addColorStop(0.55, C.mid); grad.addColorStop(1, C.foot);
  g.fillStyle = grad;
  g.fillRect(0, 0, w, h);
  const wave = (x, y, a, f) => y + Math.sin((x / w) * Math.PI * 2 * f + y) * a; // (whole waves across: it repeats)
  const band = (y, th, col, f) => {
    g.fillStyle = col;
    g.beginPath();
    for (let x = 0; x <= w; x += 4) g.lineTo(x, wave(x, y, 3, f));
    for (let x = w; x >= 0; x -= 4) g.lineTo(x, wave(x, y + th, 3, f + 1));
    g.fill();
  };
  band(78, 9, 'rgba(70, 40, 18, 0.32)', 2);
  band(126, 16, 'rgba(205, 150, 95, 0.28)', 1);
  band(180, 8, 'rgba(60, 35, 15, 0.35)', 3);
  band(214, 12, 'rgba(180, 130, 80, 0.2)', 2);
  for (let i = 0; i < 46; i++) {
    const x = R() * w, y = 40 + R() * (h - 50), r = 1.5 + R() * 3.5, light = R() < 0.6;
    g.fillStyle = light ? 'rgba(220, 185, 140, 0.75)' : 'rgba(70, 42, 20, 0.6)';
    for (const dx of [-w, 0, w]) { g.beginPath(); g.ellipse(x + dx, y, r * 1.3, r, 0, 0, Math.PI * 2); g.fill(); }
  }
  // the grass lip, hanging over a little unevenly
  g.fillStyle = C.lip;
  g.beginPath();
  g.moveTo(0, 0);
  for (let x = 0; x <= w; x += 2) g.lineTo(x, 22 + Math.sin((x / w) * Math.PI * 6) * 3 + Math.sin((x / w) * Math.PI * 14) * 2);
  g.lineTo(w, 0);
  g.fill();
  g.fillStyle = C.lipTop;
  g.fillRect(0, 0, w, 7);
  return (soils[key] = texture(c, true));
}

/** the earth, its texture laid on in world metres (one copy a metre round the sides, so blocks side
 *  by side carry it on without a seam), the grass lip at `top` and the texture's foot at `bottom`;
 *  `lifted`: the top is where each vertex's soilTop says (a side under a raised green), the texture
 *  hung from it, its darkest foot stretched on down to the bottom */
export function soilMaterial(bottom, top, lifted = false, map = soil()) {
  const m = new THREE.MeshLambertMaterial({ map });
  const range = { value: new THREE.Vector2(bottom, top) };
  m.onBeforeCompile = sh => {
    sh.uniforms.uSoil = range;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>\nvarying vec2 vSoil;\nuniform vec2 uSoil;${lifted ? '\nattribute float soilTop;' : ''}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
      {
        vec4 wp = vec4(position, 1.0);
        #ifdef USE_INSTANCING
          wp = instanceMatrix * wp;
        #endif
        wp = modelMatrix * wp;
        vSoil = vec2(abs(normal.x) > abs(normal.z) ? wp.z : wp.x, ${lifted ? '1.0 - (soilTop - wp.y)' : '(wp.y - uSoil.x)'} / (uSoil.y - uSoil.x));
      }`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vSoil;')
      .replace('#include <map_fragment>', `diffuseColor *= texture2D(map, ${lifted ? 'vec2(vSoil.x, clamp(vSoil.y, 0.004, 0.996))' : 'vSoil'});`);
  };
  m.customProgramCacheKey = () => (lifted ? 'golf-soil-lifted' : 'golf-soil');
  return m;
}

/** the block's sides and the pond's bank in a soil of the look's own colours (see soil): for a
 *  look's materials() */
export function soilSides(colors) {
  const map = soil(colors);
  return { side: soilMaterial(BLOCK_BOT, BLOCK_TOP, false, map), sideLifted: soilMaterial(BLOCK_BOT, BLOCK_TOP, true, map), bank: soilMaterial(WATER - 0.3, LAWN, false, map) };
}

// ---- a pond's water: its colour with soft bright ripples drifting over it (glint: the ripples'
// colour, deep: the troughs'; speed: how fast they drift, 0 holds them still, as under ice) ----
const f1 = v => (Number.isInteger(v) ? v.toFixed(1) : String(v));
const vec3 = c => `vec3(${c.map(f1).join(', ')})`;
export function rippleWater({ color = 0x3aa6e2, glint = [0.7, 0.92, 1.0], deep = [0.15, 0.5, 0.8], speed = 1, glintK = 0.8, deepK = 0.25 } = {}) {
  const m = new THREE.MeshLambertMaterial({ color });
  const T = speed === 1 ? 'uTime' : `uTime * ${f1(speed)}`;
  m.onBeforeCompile = sh => {
    sh.uniforms.uTime = U.time;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;\nuniform float uTime;')
      .replace('#include <color_fragment>', `#include <color_fragment>
      {
        vec2 p = vWPos.xz * 2.2;
        float t = ${T};
        float a = sin(p.x + sin(p.y * 1.3 + t * 0.9) * 1.2 + t * 0.6) * sin(p.y * 1.15 + sin(p.x * 0.9 - t * 0.7) * 1.3 - t * 0.5);
        float b = sin(p.x * 1.9 - t * 0.8 + sin(p.y * 1.6 + t * 0.3)) * sin(p.y * 2.1 + t * 0.7 + sin(p.x * 1.3));
        float w = a * 0.65 + b * 0.35;
        diffuseColor.rgb = mix(diffuseColor.rgb, ${vec3(glint)}, pow(max(w, 0.0), 5.0) * ${f1(glintK)});
        diffuseColor.rgb = mix(diffuseColor.rgb, ${vec3(deep)}, smoothstep(-0.3, -0.8, w) * ${f1(deepK)});
      }`);
  };
  const key = `golf-ripple:${glint}:${deep}:${speed}:${glintK}:${deepK}`;
  m.customProgramCacheKey = () => key;
  return m;
}

// ---- things going round the pond along the lane (ctx.loop, the middle of the water between the
// block and the bank): at(s) is the point s metres round it, as [x, z] ----
export function lane(ctx) {
  const loop = ctx.loop, len = loop.reduce((a, p, i) => a + (i ? p.distanceTo(loop[i - 1]) : 0), 0);
  const at = s => {
    s = ((s % len) + len) % len;
    const f = (s / len) * (loop.length - 1), i = Math.floor(f), k = f - i, a = loop[i], b = loop[Math.min(i + 1, loop.length - 1)];
    return [a.x + (b.x - a.x) * k, a.y + (b.y - a.y) * k];
  };
  return { len, at };
}

/** a mother duck and her ducklings paddling round the pond in a line */
export function ducks(ctx, { ids = ['duck', 'duckling', 'duckling', 'duckling'], speed = 0.32, y = WATER - 0.025 } = {}) {
  const { model, group, R } = ctx, L = lane(ctx);
  const list = ids.map((id, i) => ({ g: model(id, i ? 1.7 : 1.5), back: i ? 0.35 + i * 0.42 : 0, i }));
  for (const d of list) group.add(d.g);
  const start = R() * L.len, dir = R() < 0.5 ? 1 : -1;
  ctx.course.movers.push(t => {
    for (const d of list) {
      const s = start + dir * (t * speed - d.back);
      const [px, pz] = L.at(s), [qx, qz] = L.at(s + dir * 0.1);
      d.g.position.set(px, y + Math.sin(t * 2.2 + d.i) * 0.012, pz);
      d.g.rotation.y = Math.atan2(qx - px, qz - pz);
    }
  });
}

// ---- a cloud of little things drifting over the yard: falling leaves, snow, mist, fireflies. One
// THREE.Points for the hole (a draw), its material shared by every hole of the look. cfg:
//   count     how many (a few hundred at most)
//   color     one colour, or a list to pick from for each
//   size      metres across (they get smaller with distance)
//   fall      metres a second down (0: they hang in the air, drifting: mist, fireflies)
//   sway      metres side to side as they go
//   opacity   0..1 (default 0.9); glow: true adds their light (fireflies)
//   shape     'dot' (soft and round: snow, mist, fireflies) or 'leaf'
//   low, high the band of air they fill (metres; default from the water up to 7)
//   spread    how far past the pond they reach (metres, default 6) ----
const sprites = {};
function sprite(shape) {
  if (sprites[shape]) return sprites[shape];
  const c = canvas(64, 64), g = c.getContext('2d');
  if (shape === 'leaf') {
    // a leaf: a pointed oval with a stem and a vein, white (the colour comes from the point)
    g.translate(32, 32); g.rotate(-0.6);
    g.fillStyle = '#fff';
    g.beginPath(); g.moveTo(0, -26); g.quadraticCurveTo(20, -6, 0, 24); g.quadraticCurveTo(-20, -6, 0, -26); g.fill();
    g.strokeStyle = 'rgba(0, 0, 0, 0.25)'; g.lineWidth = 2.5;
    g.beginPath(); g.moveTo(0, -20); g.lineTo(0, 29); g.stroke();
  } else {
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255, 255, 255, 1)'); gr.addColorStop(0.45, 'rgba(255, 255, 255, 0.85)'); gr.addColorStop(1, 'rgba(255, 255, 255, 0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, 64, 64);
  }
  return (sprites[shape] = texture(c));
}
const pointMats = {};
/** the particles' material for a look (key: its name), made once */
export function pointsMaterial(cfg, key) {
  const { color = 0xffffff, size = 0.12, opacity = 0.9, glow = false, shape = 'dot' } = cfg, list = Array.isArray(color);
  return pointMats[key] || (pointMats[key] = new THREE.PointsMaterial({
    size, map: sprite(shape), color: list ? 0xffffff : color, vertexColors: list, transparent: true, opacity, depthWrite: false,
    alphaTest: shape === 'leaf' ? 0.35 : 0, blending: glow ? THREE.AdditiveBlending : THREE.NormalBlending,
  }));
}
export function particles(ctx, cfg, key) {
  const { count = 160, color = 0xffffff, fall = 0.6, sway = 0.3, low = WATER, high = 7, spread = 6 } = cfg;
  const list = Array.isArray(color) ? color : null, mat = pointsMaterial(cfg, key);
  const R = rng(ctx.index * 13 + 3), p = ctx.pond;
  const x0 = p.x0 - spread, x1 = p.x1 + spread, z0 = p.z0 - spread, z1 = p.z1 + spread, H = high - low;
  const base = Array.from({ length: count }, () => ({ x: x0 + R() * (x1 - x0), z: z0 + R() * (z1 - z0), y: R() * H, ph: R() * 6.28, sp: 0.7 + R() * 0.6 }));
  const pos = new Float32Array(count * 3), geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  if (list) {
    const col = new Float32Array(count * 3), c = new THREE.Color();
    for (let i = 0; i < count; i++) c.set(list[Math.floor(R() * list.length)]).toArray(col, i * 3);
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  }
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  ctx.group.add(pts);
  ctx.course.movers.push(t => {
    for (let i = 0; i < count; i++) {
      const b = base[i], s = Math.sin(t * 0.9 * b.sp + b.ph);
      const y = fall ? high - ((b.y + t * fall * b.sp) % H) : low + b.y + Math.sin(t * 0.5 * b.sp + b.ph) * 0.3;
      pos[i * 3] = b.x + s * sway;
      pos[i * 3 + 1] = y;
      pos[i * 3 + 2] = b.z + Math.cos(t * 0.7 * b.sp + b.ph) * sway * 0.6;
    }
    geo.attributes.position.needsUpdate = true;
  });
  return pts;
}
