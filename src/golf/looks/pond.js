// The duck pond (yard 1): a park at midday, deep blue overhead paling to the haze. Round the pond
// foam along the bank, lotus leaves and reeds, trees and benches on the lawn, ducks paddling round;
// and behind the far end, changing from hole to hole, one of the park's own little places: an ice-cream
// kiosk with tables, a gazebo, a boathouse with a rowing boat, a playground, a fountain among flower
// beds, rose arches and picnic tables; a line of park trees far behind. Everything else is the
// registry's defaults.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { WATER, LAWN, rng, ducks } from './kit.js';
import { WHITE as whiteUV } from '../../core/atlas.js';
import { variant } from '../../core/materials.js';

export default {
  sky: [[0, '#4fb0f2'], [0.55, '#9fd8fa'], [1, '#d4effc']], fog: 0xd4effc, hemi: [0xeaf6ff, 0x9cc48a, 1.35], sun: [0xfff1dc, 2.8, [-0.35, 1, 0.5]],
  card: 'linear-gradient(#4fb0f2, #9fd8fa 58%, #bfe9c9)',
  // (a rubber duck)
  icon: '<svg class="ic" viewBox="0 0 40 32" aria-hidden="true"><ellipse cx="17" cy="21" rx="14" ry="8.5" fill="#ffd23f"/><path d="M5 17c4 3 10 3 14 0" fill="none" stroke="#f0b400" stroke-width="2" stroke-linecap="round"/><circle cx="27" cy="11" r="6.5" fill="#ffd23f"/><path d="M32.5 10.5l6.5 1.8-6.5 1.8z" fill="#ff8a2a"/><circle cx="28.6" cy="9.4" r="1.3" fill="#2f3a33"/></svg>',
  surroundings(ctx) {
    foamBank(ctx);
    park(ctx);
  },
  floaters: ctx => ducks(ctx),
};

/** foam along the bank, where the water meets the lawn */
export function foamBank(ctx) {
  const bf = new THREE.Mesh(new THREE.ShapeGeometry(ctx.ring(0.1, 1.6, 0.1, 1.5), 8).rotateX(-Math.PI / 2), ctx.M.foam);
  bf.position.y = WATER + 0.006;
  ctx.group.add(bf);
}

function park(ctx) {
  const { pond, placed, R, onBlock, free, offLane, put, wet, inPond, group } = ctx;
  // in the water: lotus leaves (out of the ducks' way), more of them in a pond's wide parts (inside
  // an L or a U), and reeds and rocks along the bank
  for (let i = 0; i < 80 && placed.length < 8; i++) {
    const x = pond.x0 + 0.6 + R() * (pond.x1 - pond.x0 - 1.2), z = pond.z0 + 0.6 + R() * (pond.z1 - pond.z0 - 1.2), size = 0.9 + R() * 0.5;
    if (onBlock(x, z, 0.5) || !free(x, z, 1.4) || !offLane(x, z, size / 2 + 0.35)) continue;
    const g = put('lotus', x, z, WATER, size, true);
    if (g) wet.push({ g, x, z, r: size / 2 });
  }
  const rim0 = placed.length;
  for (let i = 0; i < 80 && placed.length - rim0 < 14; i++) {
    // a point on the bank: along one of the four sides, just inside the water or just on the lawn
    const sideK = Math.floor(R() * 4), u = R(), inWater = R() < 0.55;
    const d = inWater ? 0.35 : -0.45;
    let x, z;
    if (sideK < 2) { x = pond.x0 + 1.6 + u * (pond.x1 - pond.x0 - 3.2); z = sideK ? pond.z0 + d : pond.z1 - d; }
    else { z = pond.z0 + 1.6 + u * (pond.z1 - pond.z0 - 3.2); x = sideK === 2 ? pond.x0 + d : pond.x1 - d; }
    if (!free(x, z, 1.2) || onBlock(x, z, 0.6)) continue;
    if (inWater) { const g = put('reeds', x, z, WATER, 0.9 + R() * 0.5, true); if (g) wet.push({ g, x, z, r: 0.3 }); }
    else put(R() < 0.5 ? 'rock_small' : 'grass_tuft', x, z, LAWN, 0.4 + R() * 0.3, true);
  }
  // the park: trees well back from the water, low things nearer
  const kinds = [['tree_plane', 4.2], ['tree_camphor', 4], ['tree_peach', 3], ['bush', 1.1], ['bush', 0.9], ['flower_patch', 0.8], ['bench', 1.6], ['sunflower', 1.3], ['rose_pot', 0.7], ['potted_plant', 0.9]];
  const lawn0 = placed.length, kids0 = group.children.length;
  for (let i = 0; i < 160 && placed.length - lawn0 < 34; i++) {
    const [id, size] = kinds[Math.floor(R() * kinds.length)];
    const x = pond.x0 - 7 + R() * (pond.x1 - pond.x0 + 14), z = pond.z0 - 7 + R() * (pond.z1 - pond.z0 + 11);
    if (inPond(x, z, size > 2 ? 2 : 0.8) || !free(x, z, size > 2 ? 2.4 : 1.4)) continue;
    put(id, x, z, LAWN, size);
  }
  // (five draws of the random, as the street of shops that stood behind took: the ducks paddle where they did)
  for (let i = 0; i < 5; i++) R();
  backdrop(ctx, group.children.slice(kids0));
}

// ---- what stands behind the far end, hole by hole: [what, where across (the pond's middle 0, its left
// and right banks -1 and 1), turned (radians, + its front towards the right)]. All of it low and near: on a phone on
// its side the HUD's top bar comes down to the lawn a few metres behind the bank, and nothing there taller
// than about 2.4 m shows whole below it (a shop, a house, the street of shops that stood here, all had
// their roofs cut off). So the park's little places, none over 2.05 m, their fronts a metre or two behind
// the bank (BACK_Z); the park's trees behind and to the sides, cut by the bar as trees may be ----
const PARK = [
  ['kiosk', -0.5, 0.25], ['gazebo', 0.5, 0], ['boathouse', -0.55, 0.2], ['playground', 0.3, -0.1], ['fountain', -0.12, 0],
  ['kiosk', 0.55, -0.3], ['roses', -0.45, 0.15], ['gazebo', 0.4, 0], ['boathouse', 0.5, -0.25],
];
const BACK_Z = 1.6; // (metres behind the bank, to the middle of the place)
const SHORT = 0.72; // (a place's size behind a short hole: see backdrop)
const HALF = { kiosk: 2.7, gazebo: 1.5, boathouse: 1.4, playground: 3, fountain: 1.3, roses: 1.6 }; // (how far each reaches either side)
// (the kiosks', gazebos' and boathouses' colours, the first and the second time each comes)
const KIOSK = [{ wall: 0xbfe6d2, stripe: 0xe8554a, sign: 0x2f8f9e, scoop: 0xffb3c7 }, { wall: 0xf8d9e2, stripe: 0x3a8fd8, sign: 0xe8554a, scoop: 0xfff1c9 }];
const GAZEBO = [{ roof: 0x3f8f5a, trim: 0xf7f4ec }, { roof: 0xc9523f, trim: 0xf7f4ec }];
const BOATHOUSE = [{ wall: 0x9b6b45, roof: 0x3d6e52, boat: 0xf4f1ea, band: 0x2f6fc0 }, { wall: 0x7d8fa3, roof: 0x8a4a3a, boat: 0xe8554a, band: 0xf4f1ea }];

function backdrop(ctx, lawnThings) {
  const { pond, index, group, course } = ctx, S = rng(index * 37 + 3);
  const { x0, x1, z0 } = pond, mx = (x0 + x1) / 2, hw = (x1 - x0) / 2;
  const [what, across, turn] = PARK[((index % 9) + 9) % 9], second = PARK.slice(0, index % 9).some(p => p[0] === what) ? 1 : 0;
  const x = clearOfCup(ctx, mx + across * (hw - 1.5), across, HALF[what], hw), z = z0 - BACK_Z;
  // a clearing for it: the lawn's things standing there go (and the trees straight in front of it)
  const clear = (cx, cz, w, d) => {
    for (const g of lawnThings) {
      const p = g.position;
      if (Math.abs(p.x - cx) < w / 2 && p.z > cz - d / 2 && p.z < cz + d / 2) {
        group.remove(g);
        const j = course.deco.findIndex(o => o.g === g);
        if (j >= 0) course.deco.splice(j, 1);
      }
    }
  };
  const k = shapes();
  if (what === 'kiosk') {
    clear(x, z, 6.4, 5);
    kiosk(k, KIOSK[second]);
    for (const [tx, tz] of [[1.75, 0.55], [-1.65, 0.75]]) cafeTable(k, tx, tz, KIOSK[second].stripe);
  } else if (what === 'gazebo') {
    clear(x, z, 5, 5);
    gazebo(k, GAZEBO[second]);
  } else if (what === 'boathouse') {
    clear(x, z, 5, 5.4);
    boathouse(k, BOATHOUSE[second]);
  } else if (what === 'playground') {
    clear(x, z, 8, 5);
    swings(k, -1.5, 0, 0xe8554a, 0xf2c230);
    slide(k, 1.7, -0.2);
    sandpit(k, 0.3, 1.1);
  } else if (what === 'fountain') {
    clear(x, z, 7, 5);
    fountain(k);
  } else if (what === 'roses') {
    clear(x, z, 7, 5);
    for (const ax of [-0.9, 0.9]) roseArch(k, ax, 0);
    picnicTable(k, -3.1, 0.3, 0.2);
    picnicTable(k, 2.9, -0.2, -0.3);
  }
  // (a short hole's camera stands nearer, so less shows whole below the bar: behind one under 11 squares
  // long, the first hole, 1.6 m where its place stands on a phone on its side. Its place is built at
  // SHORT of its size, the kiosk 1.5 m: it reads as standing a little further back)
  const built = place(ctx, k.parts, x, z, turn, { r: 2.6, name: what });
  if (ctx.H < 11) built.scale.setScalar(SHORT);
  // the boathouse's jetty out over the water, and its rowing boat pulled up on the grass beside it (in the
  // water, at the foot of the bank, the course hid it)
  if (what === 'boathouse') {
    const c = BOATHOUSE[second], b = shapes(), side = across < 0 ? -1 : 1;
    rowboat(b, c.boat, c.band);
    place(ctx, b.parts, x + side * 2.1, z + 0.5, side * 0.5, { y: LAWN + 0.25, r: 1 });
    const j = shapes();
    jetty(j);
    place(ctx, j.parts, x - side * 0.15, z0 + 0.05, 0, { y: LAWN, r: 0 });
  }
  // round the fountain flower beds and a bench each side; by the gazebo and the roses, flower beds
  const spots = { fountain: [['flower_bed', -2.4, 0.6, 1.5], ['flower_bed', 2.4, 0.6, 1.5], ['bench', -2.5, -1.4, 1.6, 0.4], ['bench', 2.6, -1.3, 1.6, -0.4]], gazebo: [['flower_bed', -2.1, 0.9, 1.2], ['bush', 2, -0.4, 1.1]], roses: [['flower_bed', 0, 1.3, 1.1]] }[what] || [];
  for (const [id, dx, dz, size, rot = S() * 6] of spots) {
    const g = stand(ctx, id, x + dx, z + dz, rot, { size });
    if (g) course.deco.push({ g, far: true });
  }
  // behind: a few bushes, and further back a line of the park's tall trees with gaps in it (each a model of its
  // own: drawn instanced, they would need a shader the duck pond has no other use for, compiled as the game starts)
  const kinds = ['tree_plane', 'tree_camphor', 'tree_peach'];
  for (let i = 0, n = 0; i < 40 && n < 6; i++) {
    const bx = x0 - 5 + S() * (x1 - x0 + 10), bz = z0 - 4 - S() * 4;
    if (Math.abs(bx - x) < 3.5 || !ctx.free(bx, bz, 1.6)) continue;
    const g = stand(ctx, S() < 0.6 ? 'bush' : 'hedge', bx, bz, S() * 0.6 - 0.3, { size: 1.2 + S() * 0.8 });
    if (g) { course.deco.push({ g, far: true }); n++; }
  }
  for (let tx = x0 - 16 + S() * 3; tx < x1 + 16; tx += 3.2 + S() * 3.5) {
    if (S() < 0.22) { tx += 3; continue; } // (a gap)
    const id = kinds[Math.floor(S() * 3)], size = { tree_plane: 7, tree_camphor: 7.5, tree_peach: 4.5 }[id] * (0.85 + S() * 0.3);
    const g = stand(ctx, id, tx, z0 - 12 - S() * 9, S() * 6, { size, r: 1.5 });
    if (g) { g.children[0].castShadow = false; course.deco.push({ g, far: true }); }
  }
}

/** x moved, if need be, so that a thing `half` metres either side of it doesn't stand right behind the flag
 *  (towards the side `across` says, or if that would take it off the screen, the other) */
export function clearOfCup(ctx, x, across, half, hw) {
  const cx = ctx.course.cup.x, need = half + 1, mx = (ctx.pond.x0 + ctx.pond.x1) / 2;
  if (Math.abs(x - cx) >= need) return x;
  const s = Math.sign(across) || 1, a = cx + s * need;
  return Math.abs(a - mx) + half <= hw + 3.5 ? a : cx - s * need;
}

/** a catalog model stood on the lawn (not on the course's list of things to hide: the caller says) */
function stand(ctx, id, x, z, rot, { size, k = 1, y = LAWN, r = 0.6 } = {}) {
  let g;
  try { g = ctx.model(id, size ? null : k, size); } catch { return null; }
  g.position.set(x, y, z);
  g.rotation.y = rot;
  ctx.group.add(g);
  ctx.placed.push([x, z, r]);
  return g;
}

/** many of one catalog model as one draw, far behind: spots [[x, y, z, rot, metres across its largest side], ...]
 *  (instanced: a look whose yard draws the models instanced anyway, such as the pool's fence) */
export function many(ctx, id, spots, { shadow = false } = {}) {
  if (!spots.length) return null;
  let proto;
  try { proto = ctx.model(id, null, 1); } catch { return null; } // (a metre across: each one scaled to its size)
  const mesh = proto.children[0], off = new THREE.Matrix4().compose(mesh.position, mesh.quaternion, mesh.scale);
  // (the models' material as an object of its own for drawing instanced: see core/materials.js variant)
  const im = new THREE.InstancedMesh(mesh.geometry, variant(mesh.material, 'instanced'), spots.length);
  im.userData.keep = true; // (the catalog's shape: kept)
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), v = new THREE.Vector3(), sc = new THREE.Vector3();
  spots.forEach(([x, y, z, a, s], i) => im.setMatrixAt(i, m4.compose(v.set(x, y, z), q.setFromAxisAngle(up, a), sc.setScalar(s)).multiply(off)));
  im.castShadow = shadow;
  im.receiveShadow = true;
  ctx.group.add(im);
  ctx.course.deco.push({ g: im, far: true });
  for (const [x, , z] of spots) ctx.placed.push([x, z, 1.5]);
  return im;
}

// ---- little buildings and things made of painted boxes and such: each one mesh, one draw, in the material
// every catalog model is drawn with (vertex colours, flat shaded; its white texel; a window can glow as the
// models' do): no shader of their own. Local metres, standing on y = 0, facing +z (the pond) ----
const _c = new THREE.Color(), _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _up = new THREE.Vector3(0, 1, 0), _d = new THREE.Vector3();
function paint(g, col, glow = 0) {
  g = g.index ? g.toNonIndexed() : g;
  for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
  _c.set(col);
  const n = g.attributes.position.count, a = new Float32Array(n * 3), uv = new Float32Array(n * 2), [u, v] = whiteUV();
  for (let i = 0; i < n; i++) { _c.toArray(a, i * 3); uv[i * 2] = u; uv[i * 2 + 1] = v; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setAttribute('aGlow', new THREE.BufferAttribute(new Float32Array(n).fill(glow), 1));
  g.setAttribute('aTint', new THREE.BufferAttribute(new Float32Array(n), 1));
  g.clearGroups();
  return g;
}
/** a list of painted parts and the ways to add to it (each at its middle x, y, z, turned ry, rx, rz);
 *  k.glow(1) and the parts after it glow (a lit window), k.glow(0) stops */
export function shapes() {
  const parts = [];
  let glow = 0;
  const add = (g, col, x, y, z, ry = 0, rx = 0, rz = 0) => { g = paint(g, col, glow).rotateX(rx).rotateZ(rz).rotateY(ry).translate(x, y, z); parts.push(g); return g; };
  const k = {
    parts,
    glow: v => { glow = v; return k; },
    /** a geometry of its own, painted, as it is */
    geo: (g, col) => { g = paint(g, col, glow); parts.push(g); return g; },
    box: (w, h, d, col, x, y, z, ry, rx, rz) => add(new THREE.BoxGeometry(w, h, d), col, x, y, z, ry, rx, rz),
    cyl: (rt, rb, h, col, x, y, z, seg = 8, ry = 0) => add(new THREE.CylinderGeometry(rt, rb, h, seg), col, x, y, z, ry),
    cone: (r, h, col, x, y, z, seg = 8, ry = 0, rx = 0) => add(new THREE.ConeGeometry(r, h, seg), col, x, y, z, ry, rx),
    ball: (r, col, x, y, z, sx = 1, sy = 1, sz = 1) => add(new THREE.IcosahedronGeometry(r, 0).scale(sx, sy, sz), col, x, y, z),
    /** a round bar from a to b ([x, y, z]) */
    rod(a, b, r, col, seg = 5) {
      _d.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
      const g = paint(new THREE.CylinderGeometry(r, r, _d.length(), seg), col, glow);
      g.applyMatrix4(_m.compose(new THREE.Vector3((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2), _q.setFromUnitVectors(_up, _d.normalize()), new THREE.Vector3(1, 1, 1)));
      parts.push(g);
      return g;
    },
    /** a gable roof over a w x d box whose walls stop at y: the gable ends (in `wall`) facing +z and -z,
     *  `rise` to the ridge, two slabs of `roof` over them reaching `over` past the walls */
    gable(w, d, rise, wall, roof, x, y, z, over = 0.14, t = 0.07) {
      const sh = new THREE.Shape();
      sh.moveTo(-w / 2, 0); sh.lineTo(w / 2, 0); sh.lineTo(0, rise); sh.closePath();
      add(new THREE.ExtrudeGeometry(sh, { depth: d, bevelEnabled: false }).translate(0, 0, -d / 2), wall, x, y, z);
      const a = Math.atan2(rise, w / 2), L = Math.hypot(w / 2, rise) + over;
      for (const s of [-1, 1]) {
        const g = paint(new THREE.BoxGeometry(L, t, d + over * 2), roof, glow);
        g.translate(0, t / 2, 0).rotateZ(-s * a).translate(x + s * (L / 2) * Math.cos(a), y + rise - (L / 2) * Math.sin(a), z);
        parts.push(g);
      }
    },
  };
  return k;
}
/** the parts made one mesh and stood at (x, z) turned ry; behind the course, never hidden */
export function place(ctx, parts, x, z, ry = 0, { y = LAWN, r = 1.5, name, shadow = true } = {}) {
  const geo = mergeGeometries(parts);
  for (const p of parts) p.dispose();
  const m = new THREE.Mesh(geo, ctx.model('bush', 1).children[0].material); // (the catalog models' own)
  m.castShadow = shadow;
  m.receiveShadow = true;
  m.position.set(x, y, z);
  m.rotation.y = ry;
  if (name) m.name = name;
  ctx.group.add(m);
  ctx.course.deco.push({ g: m, far: true });
  if (r) ctx.placed.push([x, z, r]);
  return m;
}

const WHITE = 0xf7f4ec, DARK = 0x3b3631, STONE = 0xcfc8b8, TIMBER = 0x9b6b45;

/** a small hut: walls w x d, h high, a gable roof `rise` more; a door and a window or two in front */
export function hut(k, { w, d, h, rise, wall, roof, trim = WHITE, door = DARK, doorW = 0.62, doorX = 0, win = [], base = 0x8e8478, planks = 0 }) {
  k.box(w + 0.08, 0.1, d + 0.08, base, 0, 0.05, 0);
  k.box(w, h, d, wall, 0, 0.1 + h / 2, 0);
  k.gable(w, d, rise, wall, roof, 0, 0.1 + h, 0);
  const f = d / 2;
  // boards across it (thin darker lines), corner trims
  if (planks) for (let y = 0.1 + planks; y < 0.1 + h - 0.05; y += planks) k.box(w + 0.01, 0.015, d + 0.01, darken(wall, 0.82), 0, y, 0);
  for (const sx of [-1, 1]) k.box(0.07, h, 0.07, trim, sx * (w / 2 - 0.02), 0.1 + h / 2, f - 0.02);
  k.box(w + 0.02, 0.05, 0.05, trim, 0, 0.1 + h, f + 0.01);
  // the door, framed
  const dh = Math.min(h - 0.12, 1.05);
  k.box(doorW, dh, 0.03, door, doorX, 0.1 + dh / 2, f + 0.01);
  k.box(doorW + 0.1, 0.05, 0.04, trim, doorX, 0.1 + dh + 0.02, f + 0.02);
  for (const s of [-1, 1]) k.box(0.05, dh, 0.04, trim, doorX + s * (doorW / 2 + 0.025), 0.1 + dh / 2, f + 0.02);
  // windows: [x, y, w, h, glass, glow]: a pane (lit, if it glows) with a white frame and a cross
  for (const [x, y, ww, wh, glass = 0x4f6f86, glow = 0] of win) {
    k.glow(glow).box(ww, wh, 0.03, glass, x, y, f + 0.01);
    k.glow(0);
    k.box(ww + 0.08, 0.04, 0.04, trim, x, y + wh / 2, f + 0.02); k.box(ww + 0.12, 0.05, 0.08, trim, x, y - wh / 2, f + 0.03);
    k.box(0.04, wh, 0.04, trim, x, y, f + 0.025); k.box(ww, 0.03, 0.04, trim, x, y, f + 0.025);
    for (const s of [-1, 1]) k.box(0.04, wh, 0.04, trim, x + s * (ww / 2 + 0.02), y, f + 0.02);
  }
}
const darken = (col, f) => _c.set(col).multiplyScalar(f).getHex();

// ---- the park's places ----
/** an ice-cream kiosk: a little booth, its hatch under a striped awning, an ice cream on the board on top (2.05 m) */
function kiosk(k, { wall, stripe, sign, scoop }) {
  const W = 1.9, D = 1.25, H = 1.45, f = D / 2;
  k.box(W + 0.08, 0.12, D + 0.08, 0x9a9590, 0, 0.06, 0);
  k.box(W, H, D, wall, 0, 0.12 + H / 2, 0);
  k.box(W + 0.02, 0.06, D + 0.02, WHITE, 0, 0.58, 0);
  k.box(1.3, 0.56, 0.03, DARK, 0, 1.05, f + 0.01);
  k.box(1.5, 0.06, 0.32, WHITE, 0, 0.78, f + 0.15);
  for (const s of [-1, 1]) k.box(0.06, 0.56, 0.05, WHITE, s * 0.68, 1.05, f + 0.02);
  // the awning: strips slanting out over the hatch, a scalloped edge
  const n = 6, aw = (W + 0.1) / n, ad = 0.55, a = 0.5, y0 = 1.52, cz = f + (ad / 2) * Math.cos(a), cy = y0 - (ad / 2) * Math.sin(a);
  for (let i = 0; i < n; i++) {
    const x = -W / 2 - 0.05 + aw * (i + 0.5), col = i % 2 ? WHITE : stripe;
    k.box(aw, 0.025, ad, col, x, cy, cz, 0, a);
    k.box(aw * 0.8, 0.09, 0.02, col, x, y0 - ad * Math.sin(a) - 0.04, f + ad * Math.cos(a));
  }
  // the roof's edge and the board on it: an ice cream (a cone, a scoop) on a coloured ground
  k.box(W + 0.16, 0.08, D + 0.16, WHITE, 0, 0.12 + H + 0.04, 0);
  k.box(1.15, 0.36, 0.06, sign, 0, 0.12 + H + 0.08 + 0.18, f - 0.15);
  k.box(1.23, 0.04, 0.08, WHITE, 0, 0.12 + H + 0.08 + 0.36, f - 0.15);
  k.cone(0.075, 0.2, 0xe2b06a, -0.32, 0.12 + H + 0.22, f - 0.1, 6, 0, Math.PI);
  k.ball(0.085, scoop, -0.32, 0.12 + H + 0.35, f - 0.1);
  for (const [x, c] of [[0.05, 0xffffff], [0.3, 0xfff1c9], [0.5, scoop]]) k.box(0.13, 0.13, 0.02, c, x, 0.12 + H + 0.26, f - 0.11);
}
/** a round café table under a little parasol, two chairs (1.75 m) */
function cafeTable(k, x, z, col) {
  k.cyl(0.3, 0.3, 0.04, WHITE, x, 0.72, z, 10);
  k.cyl(0.025, 0.025, 1.62, 0x6b6f75, x, 0.81, z, 5);
  k.cyl(0.18, 0.2, 0.04, 0x6b6f75, x, 0.02, z, 8);
  k.cone(0.72, 0.26, col, x, 1.6, z, 8);
  k.ball(0.04, WHITE, x, 1.75, z);
  for (const s of [-1, 1]) {
    k.box(0.32, 0.04, 0.32, WHITE, x + s * 0.48, 0.44, z + 0.05);
    k.box(0.32, 0.36, 0.04, WHITE, x + s * 0.48, 0.64, z + 0.05 - 0.16);
    for (const [dx, dz] of [[-0.13, -0.13], [0.13, -0.13], [-0.13, 0.13], [0.13, 0.13]]) k.box(0.03, 0.43, 0.03, 0x6b6f75, x + s * 0.48 + dx, 0.215, z + 0.05 + dz);
  }
}
/** a white gazebo on a round platform, open at the front, a pointed roof (2.05 m) */
function gazebo(k, { roof, trim }) {
  const R = 1.1, T = Math.PI / 8;
  k.cyl(1.28, 1.33, 0.16, STONE, 0, 0.08, 0, 8, T);
  k.box(0.7, 0.08, 0.36, STONE, 0, 0.04, 1.42);
  for (let i = 0; i < 8; i++) {
    const a = (i + 0.5) * (Math.PI / 4);
    k.box(0.08, 1.12, 0.08, trim, Math.sin(a) * R, 0.16 + 0.56, Math.cos(a) * R);
    if (i === 0) continue; // (the way in, facing the pond, between the posts either side of +z)
    const b = i * (Math.PI / 4), len = 2 * R * Math.sin(Math.PI / 8), m = R * Math.cos(Math.PI / 8);
    k.box(len, 0.05, 0.04, trim, Math.sin(b) * m, 0.62, Math.cos(b) * m, b);
    k.box(len, 0.04, 0.03, trim, Math.sin(b) * m, 0.36, Math.cos(b) * m, b);
  }
  k.cyl(1.24, 1.24, 0.1, trim, 0, 1.33, 0, 8, T);
  k.cone(1.42, 0.55, roof, 0, 1.38 + 0.275, 0, 8, T);
  k.cyl(0.03, 0.03, 0.14, trim, 0, 1.97, 0, 5);
  k.ball(0.05, trim, 0, 2.03, 0);
  // a bench inside, round the back
  k.box(1.1, 0.05, 0.3, 0xb07a4f, 0, 0.45, -0.72);
}
/** a timber boathouse, its wide door to the water (1.95 m) */
function boathouse(k, { wall, roof }) {
  hut(k, { w: 2.3, d: 1.8, h: 1.12, rise: 0.62, wall, roof, door: 0x2e2a26, doorW: 1.1, win: [], planks: 0.16 });
  // a window in the side towards the middle, a life ring by the door
  k.box(0.03, 0.34, 0.42, 0x4f6f86, 1.165, 0.72, 0);
  k.box(0.04, 0.42, 0.5, WHITE, 1.16, 0.72, 0);
  k.geo(new THREE.TorusGeometry(0.14, 0.04, 4, 10), 0xe8554a).translate(0.88, 0.72, 0.93);
}
/** a short jetty from the bank out over the water: boards on posts */
function jetty(k) {
  k.box(0.8, 0.06, 1.3, TIMBER, 0, 0.04, -0.1);
  for (let z = -0.7; z < 0.55; z += 0.26) k.box(0.82, 0.008, 0.02, 0x6e4a2e, 0, 0.072, z);
  for (const sx of [-0.36, 0.36]) k.box(0.08, 0.6, 0.08, 0x6e4a2e, sx, -0.28, 0.5);
}
/** a rowing boat: a white hull with a coloured band, seats, oars shipped */
function rowboat(k, hull, band) {
  k.geo(new THREE.SphereGeometry(1, 10, 4, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2).scale(0.42, 0.26, 0.95), hull);
  k.box(0.02, 0.06, 1.2, band, 0.4, -0.04, 0); k.box(0.02, 0.06, 1.2, band, -0.4, -0.04, 0);
  k.geo(new THREE.CircleGeometry(1, 10).rotateX(-Math.PI / 2).scale(0.39, 1, 0.9), 0xb07a4f).translate(0, -0.03, 0);
  for (const z of [-0.3, 0.25]) k.box(0.74, 0.03, 0.14, 0xc9925a, 0, 0.0, z);
  for (const s of [-1, 1]) k.box(0.04, 0.03, 1.1, 0xc9925a, s * 0.16, 0.02, 0.05, s * 0.08);
}
/** a swing set: a frame of two A-shapes and a bar, two seats on ropes (1.8 m) */
export function swings(k, x, z, frame, seat) {
  const H = 1.75, W = 1.3;
  for (const s of [-1, 1]) for (const f of [-1, 1]) k.rod([x + s * W, 0, z + f * 0.5], [x + s * W, H, z], 0.04, frame);
  k.rod([x - W - 0.05, H, z], [x + W + 0.05, H, z], 0.045, frame);
  for (const sx of [-0.55, 0.55]) {
    k.box(0.42, 0.04, 0.18, seat, x + sx, 0.42, z);
    for (const r of [-0.18, 0.18]) k.box(0.015, H - 0.44, 0.015, 0x8a8f96, x + sx + r, (H + 0.44) / 2, z);
  }
}
/** a slide: a ladder up to a platform with rails, the chute down towards the pond (1.6 m) */
function slide(k, x, z) {
  const P = 0.95;
  for (const [dx, dz] of [[-0.3, -0.3], [0.3, -0.3], [-0.3, 0.3], [0.3, 0.3]]) k.box(0.07, P + 0.6, 0.07, 0x2f6fd0, x + dx, (P + 0.6) / 2, z + dz);
  k.box(0.66, 0.06, 0.66, 0xf2c230, x, P, z);
  for (const s of [-1, 1]) k.box(0.04, 0.04, 0.6, 0x2f6fd0, x + s * 0.3, P + 0.45, z);
  k.box(0.6, 0.04, 0.04, 0x2f6fd0, x, P + 0.45, z - 0.3);
  // the ladder behind
  for (let i = 1; i <= 4; i++) k.box(0.5, 0.04, 0.05, 0xf2c230, x, (P * i) / 5, z - 0.32 - 0.06 * (5 - i));
  // the chute: its bed and its sides, from the platform's front edge down
  const L = 1.55, a = Math.atan2(P - 0.08, L * 0.95), cz = z + 0.33 + (L / 2) * Math.cos(a), cy = 0.08 + (P - 0.08) / 2;
  k.box(0.46, 0.04, L, 0xe8554a, x, cy, cz, 0, a);
  for (const s of [-1, 1]) k.box(0.04, 0.14, L, 0xe8554a, x + s * 0.24, cy + 0.06, cz, 0, a);
}
/** a sandpit: a timber frame, sand, a red bucket */
function sandpit(k, x, z) {
  for (const [w, d, dx, dz] of [[1.5, 0.1, 0, -0.7], [1.5, 0.1, 0, 0.7], [0.1, 1.5, -0.7, 0], [0.1, 1.5, 0.7, 0]]) k.box(w, 0.16, d, TIMBER, x + dx, 0.08, z + dz);
  k.box(1.3, 0.08, 1.3, 0xead39b, x, 0.06, z);
  k.cyl(0.08, 0.06, 0.13, 0xe8554a, x + 0.3, 0.16, z - 0.2, 8);
  k.ball(0.12, 0xdcc283, x - 0.3, 0.1, z + 0.2, 1.3, 0.5, 1);
}
/** a stone fountain: a round basin, a pillar, a bowl and its jet (1.6 m) */
function fountain(k) {
  k.cyl(1.05, 1.12, 0.42, STONE, 0, 0.21, 0, 16);
  k.cyl(1.12, 1.12, 0.07, 0xe2dccd, 0, 0.44, 0, 16);
  k.cyl(0.98, 0.98, 0.02, 0x7fcbe6, 0, 0.4, 0, 16);
  k.cyl(0.13, 0.2, 0.78, STONE, 0, 0.78, 0, 8);
  k.cyl(0.42, 0.16, 0.16, 0xe2dccd, 0, 1.2, 0, 12);
  k.cyl(0.38, 0.38, 0.02, 0x9fdcf0, 0, 1.27, 0, 12);
  k.cone(0.05, 0.26, 0xeaf8ff, 0, 1.4, 0, 6);
  for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; k.ball(0.035, 0xdff4ff, Math.sin(a) * 0.3, 1.38 - (i % 2) * 0.06, Math.cos(a) * 0.3); }
}
/** an arch of climbing roses over a path (1.95 m) */
function roseArch(k, x, z) {
  const H = 1.35, R = 0.5;
  for (const s of [-1, 1]) k.box(0.06, H, 0.06, WHITE, x + s * R, H / 2, z);
  k.geo(new THREE.TorusGeometry(R, 0.03, 4, 10, Math.PI), WHITE).translate(x, H, z);
  for (let i = 0; i <= 8; i++) {
    const a = (i / 8) * Math.PI, px = x + Math.cos(a) * R, py = H + Math.sin(a) * R;
    k.ball(0.13, 0x4f9f48, px, py, z, 1, 1, 0.8);
    k.ball(0.06, i % 2 ? 0xe8506e : 0xff9db5, px + 0.05, py + 0.04, z + 0.09);
  }
  for (const s of [-1, 1]) for (let j = 0; j < 3; j++) { k.ball(0.12, 0x4f9f48, x + s * R, 0.3 + j * 0.42, z, 1, 1.2, 0.8); k.ball(0.055, 0xe8506e, x + s * R + 0.04, 0.38 + j * 0.42, z + 0.09); }
  k.box(1.0, 0.02, 1.0, 0xd9cdb4, x, 0.01, z);
}
/** a picnic table, benches joined to it */
function picnicTable(k, x, z, ry) {
  const c = Math.cos(ry), s = Math.sin(ry), at = (dx, dz) => [x + dx * c + dz * s, z - dx * s + dz * c];
  k.box(1.5, 0.05, 0.66, 0xb07a4f, x, 0.74, z, ry);
  for (const dz of [-0.55, 0.55]) { const [px, pz] = at(0, dz); k.box(1.5, 0.04, 0.24, 0xa06c42, px, 0.44, pz, ry); }
  for (const dx of [-0.55, 0.55]) { const [px, pz] = at(dx, 0); k.box(0.06, 0.06, 1.3, 0x7a5232, px, 0.42, pz, ry); for (const r of [-0.35, 0.35]) k.box(0.06, 0.78, 0.06, 0x7a5232, px, 0.37, pz, ry, r); }
}
