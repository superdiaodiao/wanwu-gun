// Snow day (yard 4): a bright winter afternoon after fresh snow, white and ice-blue, snow falling. The
// green stays green (the ball must stand out on it), but a cool, frosted green: frost creeps in from
// every rail. The lawn round the pond is deep snow, the pond frozen hard and scratched by skates; the
// tops of the rails and posts are snow. Round it a back garden in winter: a white picket fence half
// buried in drifts, snowy firs, lamps, a bench with skates left on it by the ice, a snowman or two, a
// sled, now and then a snowed-in shed; and behind, hole by hole, the neighbours' firs, the woods or the
// sledding hill.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { LAWN, WATER, lam, rng, canvas, texture, soilSides } from './kit.js';
import { foamBank } from './pond.js';

export default {
  sky: [[0, '#6aa9e6'], [0.5, '#bcd9f2'], [1, '#eef4f9']], fog: [0xeef4f9, 42, 95], hemi: [0xf2f8ff, 0xb9cadb, 1.4], sun: [0xfff3e2, 2.6, [-0.55, 0.75, 0.42]],
  shadow: 0.8,
  // (the map card: a deeper winter blue at the top, so its white title reads)
  card: 'linear-gradient(#4f8fd8, #88b5e3 60%, #c9def0)',
  // (a faint dark ring round the ball: a white ball on pale ice and snow needs an edge to be seen by)
  ballRim: 0.35,
  // (a snowman with a blue scarf)
  icon: '<svg class="ic" viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="22" r="8.5" fill="#fff" stroke="#c9d9e6" stroke-width="1.2"/><circle cx="16" cy="10.5" r="6" fill="#fff" stroke="#c9d9e6" stroke-width="1.2"/><path d="M10.5 15.2h11" stroke="#3d8fd6" stroke-width="2.6" stroke-linecap="round"/><circle cx="14" cy="9.5" r="1" fill="#2f3a33"/><circle cx="18" cy="9.5" r="1" fill="#2f3a33"/><path d="M16 11.2l3.5 1-3.5.8z" fill="#ff8a2a"/></svg>',
  // a cool, frosty green (blue-green, less yellow than the summer lawns), blades tipped with frost; the ice
  // in play a clear rink blue, well apart from the pale frozen pond round it (and from the white ball)
  turf: {
    green: ['#5aaf7f', '#4fa474'], blade: ['rgba(226, 246, 255, 0.22)', 'rgba(8, 58, 46, 0.2)'], shade: 'rgba(20, 70, 70, 0.3)',
    ice: { base: '#7dbde8', sheen: 'rgba(255, 255, 255, 0.35)', scratch: 'rgba(255, 255, 255, 0.6)', rim: 'rgba(255, 255, 255, 0.95)' },
  },
  materials: () => ({
    ...soilSides({ top: '#9a7a5c', mid: '#7d6048', foot: '#4e3a2a', lip: '#e9f1f7', lipTop: '#ffffff' }),
    ledge: lam(0xf1f6fa), lawn: new THREE.MeshLambertMaterial({ map: snowTex() }), rail: lam(0xb07a4a), post: lam(0x8a5a34), cap: lam(0xffffff),
    foam: new THREE.MeshBasicMaterial({ color: 0xf6fbff }),
    snow: lam(0xfbfdff), stone: lam(0x9aa6b2),
  }),
  // (the pond frozen: pale ice, scratched by skates)
  water: () => new THREE.MeshLambertMaterial({ map: iceTex() }),
  surroundings(ctx) {
    foamBank(ctx);
    garden(ctx);
  },
  floaters: onTheIce,
  dress(ctx) {
    snowOnRails(ctx);
    frost(ctx);
    mounds(ctx);
  },
  // (falling from no higher than 3.6 m and only 2 m past the pond, so no flake drifts up to the camera: on the
  // shortest hole it stands 4.4 m up, 3 m past the pond)
  particles: { count: 240, color: 0xffffff, size: 0.11, fall: 0.5, sway: 0.35, opacity: 0.95, high: 3.6, spread: 2 },
};

// ---- the snow on the lawn: white with soft blue hollows where it drifted, and sparkles; eight metres a copy ----
let snowT;
function snowTex() {
  if (snowT) return snowT;
  const n = 256, c = canvas(n, n), g = c.getContext('2d'), R = rng(41);
  g.fillStyle = '#f1f6fa';
  g.fillRect(0, 0, n, n);
  const wrap = (f) => { for (const dx of [-n, 0, n]) for (const dy of [-n, 0, n]) f(dx, dy); };
  for (let i = 0; i < 26; i++) {
    const x = R() * n, y = R() * n, rx = 18 + R() * 40, ry = 6 + R() * 14, a = (R() - 0.5) * 0.5, blue = R() < 0.6;
    g.fillStyle = blue ? 'rgba(160, 190, 222, 0.13)' : 'rgba(255, 255, 255, 0.5)';
    wrap((dx, dy) => { g.beginPath(); g.ellipse(x + dx, y + dy, rx, ry, a, 0, Math.PI * 2); g.fill(); });
  }
  for (let i = 0; i < 260; i++) {
    const x = R() * n, y = R() * n, s = R() < 0.2 ? 1.6 : 1;
    g.fillStyle = R() < 0.75 ? 'rgba(255, 255, 255, 0.95)' : 'rgba(150, 185, 220, 0.45)';
    g.fillRect(x, y, s, s);
  }
  const t = texture(c, true);
  t.repeat.set(1 / 8, 1 / 8);
  return (snowT = t);
}

// ---- the frozen pond: pale blue ice, broad bright sheens, skate tracks curving over it, a few cracks;
// six metres a copy ----
let iceT;
function iceTex() {
  if (iceT) return iceT;
  const n = 512, c = canvas(n, n), g = c.getContext('2d'), R = rng(23);
  const wrap = (f) => { for (const dx of [-n, 0, n]) for (const dy of [-n, 0, n]) f(dx, dy); };
  g.fillStyle = '#c3e1f1';
  g.fillRect(0, 0, n, n);
  // darker clear patches, where the ice is black and deep
  for (let i = 0; i < 9; i++) {
    const x = R() * n, y = R() * n, r = 40 + R() * 70;
    wrap((dx, dy) => {
      const gr = g.createRadialGradient(x + dx, y + dy, 0, x + dx, y + dy, r);
      gr.addColorStop(0, 'rgba(110, 165, 205, 0.28)'); gr.addColorStop(1, 'rgba(110, 165, 205, 0)');
      g.fillStyle = gr; g.fillRect(x + dx - r, y + dy - r, 2 * r, 2 * r);
    });
  }
  // a dusting of snow blown over it
  for (let i = 0; i < 14; i++) {
    const x = R() * n, y = R() * n, rx = 30 + R() * 60, ry = 8 + R() * 16, a = 0.5 + (R() - 0.5) * 0.4;
    g.fillStyle = 'rgba(255, 255, 255, 0.28)';
    wrap((dx, dy) => { g.beginPath(); g.ellipse(x + dx, y + dy, rx, ry, a, 0, Math.PI * 2); g.fill(); });
  }
  // skate tracks: long thin curves in pairs
  g.lineCap = 'round';
  for (let i = 0; i < 22; i++) {
    const x = R() * n, y = R() * n, a = R() * Math.PI * 2, l = 90 + R() * 160, bend = (R() - 0.5) * 120;
    const ex = x + Math.cos(a) * l, ey = y + Math.sin(a) * l, mx = (x + ex) / 2 - Math.sin(a) * bend, my = (y + ey) / 2 + Math.cos(a) * bend;
    g.strokeStyle = `rgba(255, 255, 255, ${(0.35 + R() * 0.35).toFixed(2)})`;
    g.lineWidth = 1 + R() * 1.2;
    wrap((dx, dy) => { g.beginPath(); g.moveTo(x + dx, y + dy); g.quadraticCurveTo(mx + dx, my + dy, ex + dx, ey + dy); g.stroke(); });
  }
  // cracks: short zigzags, white edged
  for (let i = 0; i < 6; i++) {
    let x = R() * n, y = R() * n, a = R() * Math.PI * 2;
    const pts = [[x, y]];
    for (let k = 0; k < 6; k++) { a += (R() - 0.5) * 1.4; x += Math.cos(a) * (10 + R() * 18); y += Math.sin(a) * (10 + R() * 18); pts.push([x, y]); }
    for (const [col, w] of [['rgba(255, 255, 255, 0.7)', 2.2], ['rgba(90, 140, 180, 0.45)', 0.9]]) {
      g.strokeStyle = col; g.lineWidth = w;
      wrap((dx, dy) => { g.beginPath(); pts.forEach(([px, py], k) => g[k ? 'lineTo' : 'moveTo'](px + dx, py + dy)); g.stroke(); });
    }
  }
  // the sheen: broad soft diagonal bands of light
  for (let k = -n; k < n; k += 128) {
    const gr = g.createLinearGradient(k, 0, k + 64, 0);
    gr.addColorStop(0, 'rgba(255, 255, 255, 0)'); gr.addColorStop(0.5, 'rgba(255, 255, 255, 0.16)'); gr.addColorStop(1, 'rgba(255, 255, 255, 0)');
    g.save(); g.transform(1, 0, 1, 1, 0, 0); g.fillStyle = gr; g.fillRect(k - 64, 0, 192, n); g.restore();
  }
  const t = texture(c, true);
  t.repeat.set(200 / 6, 200 / 6);
  t.anisotropy = 4;
  return (iceT = t);
}

// ---- the back garden round the frozen pond ----
// what stands behind the far end, hole by hole (the yard's first hole first): a clump of the neighbours' firs;
// a clump off to one side, a row of firs the other; the woods; the sledding hill; two clumps before the woods.
// (No houses: the camera's horizon is above the top of the screen, so a house there only ever showed its walls,
// its roof under the top bar or off the screen, in landscape and portrait alike.)
const BACK = ['clump', 'left', 'woods', 'hill', 'right', 'street', 'woods', 'left', 'clump'];
// And a garden shed in the snow, 1.6 m to the snow on its ridge: on the last three, this far right (or left) of
// the pond's middle, away from the path, the snowmen and the cup, low and near like Pumpkin Patch's little barn:
// SHED_Z metres behind the pond's far bank (the barn's rule, nearer, as it is taller). (There, under the top bar,
// at least 1.75 m shows on these three holes on every phone tried, landscape and portrait, 667 x 375 to 932 x 430
// and 360 x 740 to 414 x 896; on the others as little as 1.2 m in landscape, or in portrait the far bank is under
// the bar itself.) And on every other one of the first six, [side, metres out from the bank, how far down the
// pond]: side-on beyond its left (-1) or right bank near the far end, turned to the ice and a little to the tee,
// on the side away from the bench. (Only there does it show whole on every landscape screen, 667 x 375 to
// 1280 x 800, under the top bar and inside the sides; on a portrait one the pond's sides are off the screen, the
// bench's and the shed's alike.)
const SHEDS = [[-1, 2.2, 0.12], null, [-1, 2.6, 0.12], null, [-1, 2.4, 0.16], null, 6.6, 2.5, 6], SHED_Z = 1.5, SHED_K = 0.65;

function garden(ctx) {
  const { model, group, placed, course, pond, R, free, inPond, index, M } = ctx;
  const tryModel = (id, k, size) => { try { return model(id, k, size); } catch { return null; } };
  const stand = (id, x, z, rot, { k = 1, size, y = LAWN, low = false, far = false, r = 0 } = {}) => {
    const g = tryModel(id, size ? null : k, size);
    if (!g) return null;
    g.position.set(x, y, z);
    g.rotation.y = rot;
    group.add(g);
    placed.push([x, z, r]);
    if (far) course.deco.push({ g, far: true });
    else if (!low) course.deco.push({ g, box: new THREE.Box3().setFromObject(g) });
    return g;
  };
  const { x0, x1, z0, z1 } = pond, mx = (x0 + x1) / 2, len = z1 - z0;
  const back = BACK[((index % 9) + 9) % 9];
  // the fence round the garden, a gap behind for what stands there
  const fx0 = x0 - 9, fx1 = x1 + 9, fz0 = z0 - 7, fz1 = z1 + 13;
  fence(ctx, [[fx0, fz0, mx - 6, fz0], [mx + 6, fz0, fx1, fz0], [fx1, fz0, fx1, fz1], [fx0, fz1, fx0, fz0]]);
  // behind the fence (the firs all one draw: put up below)
  const firs = [];
  const fir = (x, z, size) => { firs.push([x, LAWN, z, R() * 6, size]); placed.push([x, z, 0]); };
  const clump = (x, z) => { for (let i = -1; i <= 1; i++) fir(x + i * 2.4 + R() * 0.6, z - 1.5 - R() * 2, 4.4 + R() * 1.6); };
  const hz = z0 - 10;
  if (back === 'clump') clump(mx - 3.5, hz);
  else if (back === 'left') { clump(mx - 7, hz); for (let i = 0; i < 4; i++) fir(mx + 3 + i * 2.6, hz - 1 - R() * 3, 4.6 + R() * 1.6); }
  else if (back === 'right') { clump(mx + 7, hz); for (let i = 0; i < 4; i++) fir(mx - 3 - i * 2.6, hz - 1 - R() * 3, 4.6 + R() * 1.6); }
  else if (back === 'street') { clump(mx - 5.5, hz); clump(mx + 5.5, hz - 2); }
  if (back === 'woods' || back === 'street') {
    // a wall of firs, big ones behind, ragged
    for (let i = 0; i < 16; i++) fir(mx - 20 + i * 2.7 + R(), hz - 3 - R() * 5 - (back === 'street' ? 4 : 0), 5 + R() * 2.5);
  }
  if (back === 'hill') {
    // the sledding hill: a long white rise behind, firs along its top
    const hill = new THREE.Mesh(new THREE.SphereGeometry(1, 40, 10, 0, Math.PI * 2, 0, Math.PI / 2).scale(15, 4.2, 7), M.lawn);
    hill.position.set(mx + 2, LAWN - 0.3, hz - 4);
    hill.receiveShadow = true;
    group.add(hill);
    for (let i = 0; i < 11; i++) fir(mx - 18 + i * 3.6 + R() * 1.5, hz - 12 - R() * 3, 5.5 + R() * 2);
    stand('sled', mx - 4, hz + 1.6, 2.8, { k: 1.4, far: true });
  }
  // (no shadows: they all stand well outside the sun's shadow box, where they never cast one anyway)
  many(ctx, 'tree_fir_snow', firs, { size: true, far: true, shadow: false });
  // a path dug through the snow from the back of the garden down to the ice: stepping stones, a lamp
  // either side of it now and then, and a snowman (or a family of them) beside it
  const px = { clump: mx - 3.5, left: mx - 7, right: mx + 7, street: mx - 5.5 }[back] ?? mx + 1.5;
  path(ctx, px, fz0 + 0.5, z0 - 0.7);
  for (const [dz, sx] of [[1.5, -1], [4.2, 1]]) stand('lamp_snow', px + sx * 1.1, z0 - dz, 0, { size: 2.6, r: 0.3 });
  // (on the finale the other side of the path: the one side stands right behind the snow fort's tower)
  const sd = (index % 2 ? 1 : -1) * (index % 9 === 8 ? -1 : 1), sm = px + sd * 2.2;
  stand('snowman', sm, z0 - 3, 0.3 + R(), { k: 1.6, r: 0.5 });
  if (index % 3 !== 1) stand('snowman_small', sm + sd * 0.9, z0 - 2.4, R() * 2 - 1, { k: 1.6, low: true, r: 0.3 });
  sparrows(ctx, px - sd * 1.6, z0 - 2.2);
  // the shed: behind the far bank turned a little towards the pond, or beside it side-on (see SHEDS)
  const shed = SHEDS[((index % 9) + 9) % 9];
  if (shed != null) {
    const [x, z, rot] = Array.isArray(shed)
      ? [shed[0] < 0 ? x0 - shed[1] : x1 + shed[1], z0 + len * shed[2], shed[0] * (0.6 - Math.PI / 2)]
      : [mx + shed, z0 - SHED_Z, shed > 0 ? -0.2 : 0.2];
    const sh = stand('shed_snow', x, z, rot, { k: SHED_K, far: true, r: 1.3 });
    if (sh) sh.name = 'shed';
  }
  // firs in the garden's corners and down its sides
  for (const [x, z, size] of [[fx0 + 2, fz0 + 2.5, 5], [fx1 - 2.2, fz0 + 2.2, 4.6], [fx0 - 2.5, z0 + len * 0.45, 5.6], [fx1 + 2.6, z0 + len * 0.35, 5.4], [fx0 + 2.5, fz1 - 3, 4.8], [fx1 - 2.5, fz1 - 4, 4.4]]) {
    const t = stand('tree_fir_snow', x, z, R() * 6, { size, far: z < z0 - 2, r: 1.2 });
    if (t) t.name = 'tree';
  }
  // by the ice: a bench with skates on it, at one side of the pond (this hole's side), and a lamp
  const side = index % 2 ? 1 : -1, bx = side < 0 ? x0 - 1.3 : x1 + 1.3, bz = z0 + len * (0.3 + R() * 0.25);
  if (stand('bench', bx, bz, side < 0 ? Math.PI / 2 : -Math.PI / 2, { size: 1.7, r: 0.6 })) {
    stand('ice_skates', bx + side * 0.1, bz + 0.5, R() * 6, { k: 1.2, y: LAWN + 0.42, low: true });
    // (and now and then the orange cat, curled up at the bench's other end, watching the ice)
    if (index % 3 === 0) stand('cat_orange', bx + side * 0.05, bz - 0.45, side < 0 ? Math.PI / 2 : -Math.PI / 2, { k: 1.3, y: LAWN + 0.42, low: true });
  }
  stand('lamp_snow', bx, bz - 1.6, 0, { size: 2.6, r: 0.3 });
  stand('lamp_snow', -side < 0 ? x0 - 1.2 : x1 + 1.2, z0 + len * 0.7, 0, { size: 2.6, r: 0.3 });
  // a snowman (or two) built on the lawn, a sled left by a drift, a shovel stuck in one
  const toys = [['snowman', 1.5], ['snowman_small', 1.6], ['snow_mound', 1], ['snow_mound', 1.3], ['snow_shovel', 1.1], ['sled', 1.2], ['tree_fir_snow_small', 2.2], ['tree_fir_snow_small', 2.6], ['snow_mound', 0.8]];
  // (which come first, hole by hole: a different few nearest the pond each time)
  for (let j = 0; j < toys.length; j++) {
    const [id, size] = toys[(j + index * 4) % toys.length], big = id.startsWith('tree');
    for (let i = 0; i < 40; i++) {
      const x = x0 - 7 + R() * (x1 - x0 + 14), z = z0 - 5 + R() * (len + 10);
      if (inPond(x, z, big ? 1.6 : 0.7) || !free(x, z, big ? 2.2 : 1.4) || x < fx0 + 0.8 || x > fx1 - 0.8 || z > fz1 - 1) continue;
      if (id === 'snow_mound') { heap(ctx).push([x, LAWN, z, R() * 6, size]); placed.push([x, z, 0.3]); } // (see mounds)
      else stand(id, x, z, R() * 6, { k: size, size: big ? size : undefined, low: !big && id !== 'snowman', r: big ? 0.8 : 0.3 });
      break;
    }
  }
}

/** the frozen pond inside the hole's own rectangle, where the green is shaped (an L, a U): a few small drifts
 *  of snow blown onto the ice, and on the widest stretch of it something left out on the ice (skates and a
 *  shovel stuck in a drift, or a little snowman). Nothing here touches the ball: no colliders, all of it clear
 *  of the green's block. Not all low: the shovel stands 1.2 m, the snowman 0.95. The drifts are few and
 *  small (0.24 m high, lower than the snowbanks in play), so the empty ice doesn't read as more of those. */
function onTheIce(ctx) {
  const { W, H, at, cell, tiles, onBlock, group, model, index } = ctx, R = rng(index * 31 + 5), Y = WATER;
  const green = ch => '.rTHomi'.includes(ch);
  const empty = new Set();
  for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) if (!green(cell(c, r))) empty.add(c + ',' + r);
  if (!empty.size || !tiles.length) return;
  const put = (id, x, z, rot, k) => {
    let g;
    try { g = model(id, k); } catch { return null; }
    g.position.set(x, Y, z);
    g.rotation.y = rot;
    group.add(g);
    return g;
  };
  // the widest stretch: the biggest patch of empty squares joined side to side
  let best = [];
  const seen = new Set();
  for (const k0 of empty) {
    if (seen.has(k0)) continue;
    const part = [], q = [k0];
    seen.add(k0);
    while (q.length) {
      const k = q.pop(), [c, r] = k.split(',').map(Number);
      part.push([c, r]);
      for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const n = c + dc + ',' + (r + dr); if (empty.has(n) && !seen.has(n)) { seen.add(n); q.push(n); } }
    }
    if (part.length > best.length) best = part;
  }
  // (its square furthest from the green, if it is clear of it by a good half metre)
  let mid = null, far = 0;
  for (const [c, r] of best) {
    const p = at(c, r);
    let d = 0;
    while (d < 3 && !onBlock(p.x, p.z, d + 0.05)) d += 0.1;
    if (d > far) { far = d; mid = p; }
  }
  const taken = [];
  const drift = (x, z, k) => heap(ctx).push([x, Y, z, R() * 6, k]); // (see mounds)
  if (mid && far >= 0.6) {
    if (index % 2) {
      put('snowman_small', mid.x, mid.z, 0.4 + R(), 1.3);
      drift(mid.x + 0.55, mid.z + 0.25, 0.6);
    } else {
      drift(mid.x, mid.z, 0.6);
      put('snow_shovel', mid.x + 0.15, mid.z - 0.05, 0.5, 1.1);
      put('ice_skates', mid.x - 0.6, mid.z + 0.35, R() * 6, 1.2);
    }
    taken.push([mid.x, mid.z]);
  }
  // little drifts on about one in eight of the rest, clear of the green's block and of each other
  for (const k of empty) {
    if (R() > 0.12) continue;
    const [c, r] = k.split(',').map(Number), p = at(c, r), x = p.x + (R() - 0.5) * 0.4, z = p.z + (R() - 0.5) * 0.4;
    if (onBlock(x, z, 0.35) || taken.some(([tx, tz]) => Math.hypot(tx - x, tz - z) < 1.6)) continue;
    drift(x, z, 0.4 + R() * 0.2);
    taken.push([x, z]);
  }
}

// ---- the drifts of snow on the lawn and on the ice (snow_mound): all of a hole's in one draw, casting no
// shadow (they are low); gathered by garden and onTheIce, put up by dress ----
const heaps = new WeakMap();
const heap = ctx => heaps.get(ctx) || heaps.set(ctx, []).get(ctx);
function mounds(ctx) {
  many(ctx, 'snow_mound', heap(ctx), { shadow: false });
  heaps.delete(ctx);
}

/** many of one catalog model as one draw: spots [[x, y, z, rot, k], ...] (k: the model's size × k, or with
 *  `size`, k metres across its largest side, as model(id, null, k) has it) */
function many(ctx, id, spots, { size = false, far = false, shadow = true } = {}) {
  if (!spots.length) return null;
  let proto;
  try { proto = ctx.model(id, size ? null : 1, size ? 1 : undefined); } catch { return null; }
  const mesh = proto.children[0], off = new THREE.Matrix4().compose(mesh.position, mesh.quaternion, mesh.scale);
  const im = new THREE.InstancedMesh(mesh.geometry, mesh.material, spots.length);
  im.userData.keep = true; // (the catalog's shape: kept)
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), v = new THREE.Vector3(), sc = new THREE.Vector3();
  spots.forEach(([x, y, z, a, k], i) => im.setMatrixAt(i, m4.compose(v.set(x, y, z), q.setFromAxisAngle(up, a), sc.setScalar(k)).multiply(off)));
  im.castShadow = shadow;
  im.receiveShadow = true;
  ctx.group.add(im);
  if (far) ctx.course.deco.push({ g: im, far: true });
  return im;
}

/** three sparrows on the snow round (x, z), hopping about now and then and pecking between hops */
function sparrows(ctx, x, z) {
  const { model, group, course, R } = ctx, list = [];
  for (let i = 0; i < 3; i++) {
    let g;
    try { g = model('sparrow', 2.6); } catch { return; }
    g.rotation.order = 'YXZ'; // (so the peck dips its head, whichever way it faces)
    group.add(g);
    list.push({ g, x: x + (i - 1) * 0.55, z: z + (R() - 0.5) * 0.6, t0: R() * 4, period: 1.4 + R() * 1.6, k: 1 + i * 2.3 });
  }
  // (where a bird is after its n-th hop: wandering a little round its own spot)
  const spot = (b, n) => [b.x + Math.sin(n * 2.1 + b.k) * 0.35, b.z + Math.cos(n * 1.3 + b.k * 0.7) * 0.3];
  course.movers.push(t => {
    for (const b of list) {
      const f = (t + b.t0) / b.period, n = Math.floor(f), u = f - n, hop = u > 0.82 ? (u - 0.82) / 0.18 : 0;
      const [ax, az] = spot(b, n), [cx, cz] = spot(b, n + 1);
      b.g.position.set(ax + (cx - ax) * hop, LAWN + Math.sin(hop * Math.PI) * 0.07, az + (cz - az) * hop);
      b.g.rotation.set(hop ? 0 : Math.max(0, Math.sin(u * 40)) * 0.5, Math.atan2(cx - ax, cz - az), 0);
    }
  });
}

/** stepping stones along a path cleared through the snow, from (x, za) to (x, zb), a little crooked */
function path(ctx, x, za, zb) {
  const { group, R, M, placed } = ctx, n = Math.max(2, Math.round(Math.abs(zb - za) / 0.62)), geos = [];
  for (let i = 0; i <= n; i++) {
    const z = za + ((zb - za) * i) / n, w = 0.5 + R() * 0.16;
    geos.push(new THREE.CylinderGeometry(w / 2, w / 2 + 0.02, 0.05, 7).scale(1, 1, 0.75 + R() * 0.2).rotateY(R() * 3).translate(x + Math.sin(i * 0.9) * 0.12 + (R() - 0.5) * 0.1, LAWN + 0.01, z));
    placed.push([x, z, 0.3]);
  }
  const m = new THREE.Mesh(mergeGeometries(geos.map(g => g.toNonIndexed())), M.stone);
  for (const g of geos) g.dispose();
  m.receiveShadow = true;
  group.add(m);
}

/** a white picket fence along these runs ([x0, z0, x1, z1] each), drifts of snow along its foot */
function fence(ctx, runs) {
  const { model, group, course, R, M } = ctx;
  let proto;
  try { proto = model('fence_picket'); } catch { return; }
  const mesh = proto.children[0], spots = [], drifts = [];
  for (const [ax, az, bx, bz] of runs) {
    const n = Math.round(Math.hypot(bx - ax, bz - az) / 2);
    for (let i = 0; i < n; i++) {
      const u = (i + 0.5) / n;
      spots.push([ax + (bx - ax) * u, az + (bz - az) * u, Math.atan2(-(bz - az), bx - ax)]);
    }
    // (a drift every metre or so, long along the fence, low)
    const m = Math.round(Math.hypot(bx - ax, bz - az) / 1.3);
    for (let i = 0; i < m; i++) {
      const u = (i + 0.5) / m, a = Math.atan2(-(bz - az), bx - ax), l = 0.9 + R() * 0.8;
      drifts.push(new THREE.SphereGeometry(1, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2).scale(l, 0.18 + R() * 0.12, 0.42).rotateY(a).translate(ax + (bx - ax) * u, LAWN, az + (bz - az) * u));
    }
  }
  const im = new THREE.InstancedMesh(mesh.geometry, mesh.material, spots.length);
  im.userData.keep = true; // (the catalog's shape: kept)
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(1, 1, 1), v = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  spots.forEach(([x, z, a], i) => im.setMatrixAt(i, m4.compose(v.set(x, LAWN, z).add(mesh.position), q.setFromAxisAngle(up, a), sc)));
  im.castShadow = im.receiveShadow = true;
  group.add(im);
  course.deco.push({ g: im, far: true });
  if (drifts.length) {
    const d = new THREE.Mesh(mergeGeometries(drifts.map(g => g.toNonIndexed())), M.snow);
    for (const g of drifts) g.dispose();
    d.receiveShadow = true;
    group.add(d);
  }
}

/** a ridge of snow along the top of every rail, and a cap of it on every post */
function snowOnRails(ctx) {
  const { rails, posts, group, M } = ctx, geos = [];
  for (const r of rails) {
    const n = r.sloped ? Math.max(2, Math.ceil(r.len / 0.5)) : 1, step = r.len / n;
    for (let i = 0; i < n; i++) {
      const u = (r.kind === 'h' ? r.x : r.z) - r.len / 2 + step * (i + 0.5), y = (r.sloped ? r.yAt(u) : r.y) + r.top + 0.02;
      // (5 mm past the rail's end each way, not 10: at an outer corner the post's outer face is 10 mm past it, and
      // the ridge's flat end lay exactly in that face, flickering through it as a grey oval)
      const g = new THREE.CylinderGeometry(r.w * 0.42, r.w * 0.5, step + 0.01, 7, 1).rotateZ(Math.PI / 2).scale(1, 0.45, 1);
      if (r.kind === 'v') g.rotateY(Math.PI / 2);
      g.translate(r.kind === 'h' ? u : r.x, y, r.kind === 'h' ? r.z : u);
      geos.push(g);
    }
  }
  for (const [x, y, z] of posts) geos.push(new THREE.SphereGeometry(0.15, 8, 5).scale(1, 0.5, 1).translate(x, y + 0.31, z));
  if (!geos.length) return;
  const one = new THREE.Mesh(mergeGeometries(geos.map(g => g.toNonIndexed())), M.snow);
  for (const g of geos) g.dispose();
  one.castShadow = one.receiveShadow = true;
  group.add(one);
}

/** frost on the green: a white rime creeping in from every rail, thickest in the corners, with crystals
 *  (painted over the hole's own turf canvas) */
function frost(ctx) {
  const map = ctx.M.turf && ctx.M.turf.map, c = map && map.image;
  if (!c || !c.getContext) return;
  const g = c.getContext('2d'), PX = c.width / ctx.W, R = rng(ctx.index * 7 + 3), W = PX * 0.28;
  const green = (cc, rr) => '.rTHomi'.includes(ctx.cell(cc, rr));
  const rime = (x0, y0, x1, y1) => {
    const gr = g.createLinearGradient(x0, y0, x1, y1);
    gr.addColorStop(0, 'rgba(238, 247, 255, 0.72)'); gr.addColorStop(0.45, 'rgba(238, 247, 255, 0.22)'); gr.addColorStop(1, 'rgba(238, 247, 255, 0)');
    return gr;
  };
  for (const t of ctx.tiles) {
    const x = t.c * PX, y = t.r * PX;
    for (const [dc, dr] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
      if (green(t.c + dc, t.r + dr)) continue;
      if (dr) { const e = dr < 0 ? y : y + PX; g.fillStyle = rime(0, e, 0, e - dr * W); g.fillRect(x, dr < 0 ? y : y + PX - W, PX, W); }
      else { const e = dc < 0 ? x : x + PX; g.fillStyle = rime(e, 0, e - dc * W, 0); g.fillRect(dc < 0 ? x : x + PX - W, y, W, PX); }
      // crystals: little white specks and stars, thick by the rail and thinning out
      for (let i = 0; i < 16; i++) {
        const along = R() * PX, out = Math.pow(R(), 2.2) * W * 1.25;
        const px = dr ? x + along : dc < 0 ? x + out : x + PX - out, py = dc ? y + along : dr < 0 ? y + out : y + PX - out;
        g.fillStyle = `rgba(250, 253, 255, ${(0.55 + R() * 0.4).toFixed(2)})`;
        const s = 1 + R() * 1.6;
        g.fillRect(px - s / 2, py - s / 2, s, s);
        if (R() < 0.18) { g.fillRect(px - 2.5, py - 0.4, 5, 0.8); g.fillRect(px - 0.4, py - 2.5, 0.8, 5); }
      }
    }
  }
  map.needsUpdate = true;
}
