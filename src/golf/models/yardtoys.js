// Garden toys and gadgets for the back-garden course: the robot mower that drives across the green,
// the twin-arm lawn sprinkler (fixed base + rotating arm), a doghouse, a garden gnome, a plastic lawn
// flamingo and a trampoline. Metres, base on y = 0, centred on x = z = 0, front faces +Z.
import * as THREE from 'three';
import { def } from '../../catalog/registry.js';
import { D, shade } from '../../core/modeler.js';

// ---- local helpers -----------------------------------------------------------------------------
const UP = new THREE.Vector3(0, 1, 0);
const _d = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const ICO = new THREE.IcosahedronGeometry(1, 0);

/** Euler XYZ that turns local +Y towards direction dir [x, y, z]. */
function yTo(dir) {
  _d.set(dir[0], dir[1], dir[2]).normalize();
  _q.setFromUnitVectors(UP, _d);
  _e.setFromQuaternion(_q, 'XYZ');
  return [_e.x, _e.y, _e.z];
}
/** round rod from a to b */
function rod(m, a, b, r, col, seg = 6, rb = r) {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const [rx, ry, rz] = yTo([b[0] - a[0], b[1] - a[1], b[2] - a[2]]);
  m.cyl(rb, r, len, col, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2, rx, ry, rz, seg);
}
/** cheap 20-triangle ball */
function ball(m, r, col, x, y, z, sx = 1, sy = 1, sz = 1) {
  m.geo(ICO, col, x, y, z, 0, 0, 0, r * sx, r * sy, r * sz);
}
/** squircle outline [[x, y], ...] (half-sizes a, b); taper > 0 widens the +y end */
function squircle(a, b, n = 20, p = 3, taper = 0) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const t = (i / n) * Math.PI * 2, c = Math.cos(t), s = Math.sin(t);
    const x = a * Math.sign(c) * Math.abs(c) ** (2 / p), y = b * Math.sign(s) * Math.abs(s) ** (2 / p);
    pts.push([x * (1 + taper * y / b), y]);
  }
  return pts;
}
/** extrude a top-view outline [[x, z], ...] into a slab between y0 and y1 (outline grows by bevel) */
function slab(m, outline, y0, y1, col, bevel = 0) {
  m.extrude(outline, y1 - y0, col, 0, (y0 + y1) / 2, 0, 90 * D, 0, 0, bevel);
}

// ================================================================================================
// 割草机器人 — robot lawn mower, drives back and forth across the green
// ================================================================================================
def('mower', {
  name: '割草机器人',
  cat: 'vehicle',
  sfx: 'metal',
  fill: 0.55,
  build(m) {
    const shell = 0xff8a2a, shellHi = 0xffa04a, chassis = 0x3a3d44, dark = 0x24262b, tire = 0x2a2b30;
    const eye = 0x86ecff, red = 0xe8423a;
    // dark chassis skirt
    slab(m, squircle(0.225, 0.362, 18, 3, 0.06), 0.05, 0.14, chassis);
    // rounded orange shell, a touch wider at the front
    slab(m, squircle(0.222, 0.335, 18, 3.2, 0.08), 0.12, 0.235, shell, 0.035);
    // domed top
    m.ellipsoid(0.2, 0.07, 0.28, shellHi, 0, 0.232, -0.03, 0, 0, 0, 9);
    // stop dial + red button
    m.cyl(0.062, 0.066, 0.03, dark, 0, 0.29, -0.08, 0, 0, 0, 10);
    m.cyl(0.044, 0.046, 0.03, red, 0, 0.305, -0.08, 0, 0, 0, 10);
    // side accent stripes, rear carry handle (seated on the shell's back edge)
    m.sym(s => m.box(0.012, 0.022, 0.46, dark, s * 0.255, 0.19, 0.02));
    m.box(0.17, 0.03, 0.036, dark, 0, 0.238, -0.326);
    // face: a dark visor on the front edge, tipped back so it reads from above, with two glowing eyes
    m.push(0, 0.222, 0.322, -42 * D, 0, 0);
    m.box(0.29, 0.11, 0.05, dark, 0, 0, 0);
    m.glow(1);
    m.push(0, 0.002, 0.026, 0, 0, 0, [1, 1.12, 1]);
    m.sym(s => m.cyl(0.039, 0.039, 0.008, eye, s * 0.074, 0, 0, 90 * D, 0, 0, 10));
    m.pop();
    m.glow(0);
    m.sym(s => ball(m, 0.01, 0xffffff, s * 0.074 - 0.014, 0.019, 0.031));
    m.pop();
    // little smile on the orange nose between the visor and the bumper
    m.torus(0.05, 0.0075, dark, 0, 0.2, 0.369, 0, 0, -140 * D, 100 * D, 3, 6);
    // wrap-around front bumper
    const bump = [];
    for (let i = 0; i <= 8; i++) { const t = (-60 + (120 * i) / 8) * D; bump.push([Math.sin(t) * 0.25, 0.25 + Math.cos(t) * 0.183]); }
    for (let i = 8; i >= 0; i--) { const t = (-60 + (120 * i) / 8) * D; bump.push([Math.sin(t) * 0.2, 0.24 + Math.cos(t) * 0.14]); }
    slab(m, bump, 0.075, 0.13, dark);
    // big rear drive wheels with chunky lugs (outer faces at x = ±0.31)
    const R = 0.11, LUG = 0.014, W = 0.074, wx = 0.31 - 0.04, wz = -0.19, wy = R + LUG;
    m.sym(s => {
      m.cyl(R, R, W, tire, s * wx, wy, wz, 0, 0, 90 * D, 12);
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        m.push(s * wx, wy, wz, a, 0, 0).box(W, LUG * 2, 0.04, tire, 0, R, 0).pop();
      }
      m.cyl(0.062, 0.062, 0.078, shell, s * wx, wy, wz, 0, 0, 90 * D, 8);
      m.cyl(0.024, 0.024, 0.08, dark, s * wx, wy, wz, 0, 0, 90 * D, 6);
    });
    // small front casters
    m.sym(s => {
      m.cyl(0.055, 0.055, 0.04, tire, s * 0.18, 0.055, 0.25, 0, 0, 90 * D, 8);
      m.cyl(0.026, 0.026, 0.044, 0x9aa0a8, s * 0.18, 0.055, 0.25, 0, 0, 90 * D, 6);
    });
  },
});

// ================================================================================================
// 洒水器 — twin-arm rotating lawn sprinkler: fixed base + the arm that spins on it
// ================================================================================================
const BRASS = 0xe2ae4a, BRASS_DK = 0xb98a2e;

def('sprinkler_base', {
  name: '洒水器底座',
  cat: 'daily',
  sfx: 'metal',
  fill: 0.5,
  build(m) {
    const green = 0x2f9a5a, greenDk = 0x24804a;
    // moulded green sled
    m.lathe([[0, 0], [0.17, 0], [0.18, 0.012], [0.177, 0.03], [0.155, 0.046], [0.1, 0.06], [0.06, 0.064], [0, 0.064]], green, 0, 0, 0, 0, 0, 0, 12);
    // ribs
    for (let i = 0; i < 6; i++) {
      m.push(0, 0, 0, 0, (i / 6) * Math.PI * 2 + Math.PI / 6, 0);
      m.box(0.016, 0.016, 0.07, greenDk, 0, 0.058, 0.118, 14 * D, 0, 0); // ends where the rim steepens
      m.pop();
    }
    // brass hub, collar and spindle
    m.cyl(0.058, 0.066, 0.035, BRASS, 0, 0.078, 0, 0, 0, 0, 10);
    m.cyl(0.034, 0.04, 0.03, BRASS_DK, 0, 0.108, 0, 0, 0, 0, 8);
    m.cyl(0.016, 0.016, 0.03, 0xc9cdd2, 0, 0.125, 0, 0, 0, 0, 6);
    // hose inlet at the back
    rod(m, [0, 0.07, -0.05], [0, 0.04, -0.17], 0.018, BRASS, 6);
    m.cyl(0.026, 0.026, 0.03, BRASS_DK, 0, 0.038, -0.165, 80 * D, 0, 0, 6);
  },
});

def('sprinkler_arm', {
  name: '洒水器转臂',
  cat: 'daily',
  sfx: 'metal',
  fill: 0.15,
  build(m) {
    const yel = 0xf7c51e, blk = 0x26262a, red = 0xe8423a;
    const Y = 0.05, r = 0.035;
    // central collar with a red cap
    m.cyl(0.085, 0.09, 0.1, BRASS, 0, 0.05, 0, 0, 0, 0, 12);
    m.cyl(0.092, 0.092, 0.02, BRASS_DK, 0, 0.012, 0, 0, 0, 0, 12);
    m.dome(0.05, red, 0, 0.1, 0, 1, 0.7, 1, 0, 0, 0, 10);
    // the bar: one yellow rod with black tape bands
    m.cyl(r, r, 1.86, yel, 0, Y, 0, 0, 0, 90 * D, 8);
    for (const x of [0.24, 0.48, 0.72]) m.sym(s => m.cyl(r * 1.08, r * 1.08, 0.08, blk, s * x, Y, 0, 0, 0, 90 * D, 8));
    // nozzle heads: brass knuckles at the tips (outer faces at x = ±1), each nozzle angled up and
    // pointing the opposite way round the spin (+x tip sprays towards -z, -x tip towards +z)
    m.sym(s => {
      m.cyl(0.046, 0.046, 0.075, BRASS, s * 0.9625, Y, 0, 0, 0, 90 * D, 8);
      const dir = [0, Math.sin(45 * D), -s * Math.cos(45 * D)], k = s * 0.955;
      const at = d => [k, Y + dir[1] * d, dir[2] * d];
      rod(m, at(0), at(0.1), 0.03, BRASS, 8, 0.024);
      rod(m, at(0.1), at(0.12), 0.026, BRASS_DK, 8);
    });
  },
});

// ================================================================================================
// 狗屋 — doghouse: tan plank walls, red gable roof, arched door, a bone sign and a food bowl
// ================================================================================================
def('doghouse', {
  name: '狗屋',
  cat: 'building',
  sfx: 'wood',
  fill: 0.6,
  build(m) {
    const tan = 0xdca46a, post = 0xb87a46, base = 0x8a5a3a, roof = 0xd9473a, roofDk = 0xb23a30;
    const door = 0x3a2824, cream = 0xf6ecd4;
    const W = 0.82, Dp = 0.84, zc = -0.03, y0 = 0.05, Hw = 0.52, Hg = 0.3;
    m.box(0.92, 0.05, 1.04, base, 0, 0.025, 0.02);
    // plank walls (alternate planks inset a hair so the seams read)
    m.jitter(0.06);
    for (let i = 0; i < 5; i++) {
      const k = i % 2 ? 0.012 : 0;
      m.box(W - k, Hw / 5, Dp - k, tan, 0, y0 + Hw / 10 + (i * Hw) / 5, zc);
    }
    m.jitter(0);
    m.prism(W - 0.006, Hg, Dp - 0.006, tan, 0, y0 + Hw + Hg / 2, zc);
    // corner posts
    m.sym(s => { for (const dz of [-1, 1]) m.box(0.06, Hw, 0.06, post, s * (W / 2), y0 + Hw / 2, zc + dz * (Dp / 2)); });
    // gable roof: two slabs of stepped shingle rows + ridge cap
    const apexY = y0 + Hw + Hg, a = Math.atan2(Hg, W / 2), T = 0.05, L = Math.hypot(Hg, W / 2) + 0.06;
    const ca = Math.cos(a), sa = Math.sin(a), RD = Dp + 0.18;
    m.sym(s => {
      const rows = 3;
      for (let i = 0; i < rows; i++) {
        const s0 = -0.03 + (i * L) / rows, s1 = (i + 1) * L / rows + 0.02, mid = (s0 + s1) / 2;
        const lift = T / 2 + i * 0.004;
        m.box(s1 - s0, T, RD, i % 2 ? roof : shade(roof, 1.06), s * (mid * ca + lift * sa), apexY - mid * sa + lift * ca, zc, 0, 0, -s * a);
      }
    });
    m.box(0.09, 0.05, RD + 0.02, roofDk, 0, apexY + 0.055, zc, 0, 0, 0);
    // arched door with a cream trim
    const arch = (w, h) => {
      const pts = [[-w, 0], [w, 0]];
      for (let i = 0; i <= 8; i++) { const t = (i / 8) * Math.PI; pts.push([Math.cos(t) * w, h + Math.sin(t) * w]); }
      return pts;
    };
    const zf = zc + Dp / 2;
    m.extrude(arch(0.2, 0.25), 0.02, cream, 0, y0, zf + 0.005);
    m.extrude(arch(0.165, 0.25), 0.02, door, 0, y0, zf + 0.012);
    // bone sign on the gable
    m.box(0.15, 0.034, 0.02, cream, 0, apexY - 0.15, zf + 0.008);
    m.sym(s => { for (const dy of [-1, 1]) m.sphere(0.022, cream, s * 0.075, apexY - 0.15 + dy * 0.016, zf + 0.008, 1, 1, 0.6, 0, 0, 0, 8); });
    // blue food bowl full of kibble on the porch
    m.lathe([[0, 0], [0.065, 0], [0.085, 0.05], [0.075, 0.052], [0.06, 0.02], [0, 0.02]], 0x2f6fd0, 0.27, 0.05, zf + 0.085, 0, 0, 0, 12);
    m.dome(0.064, 0x9a5a2e, 0.27, 0.06, zf + 0.085, 1, 0.45, 1, 0, 0, 0, 8);
  },
});

// ================================================================================================
// 花园小矮人 — garden gnome with a shovel
// ================================================================================================
def('garden_gnome', {
  name: '花园小矮人',
  cat: 'toy',
  sfx: 'hard',
  fill: 0.45,
  build(m) {
    const hat = 0xdc3a32, beard = 0xf7f4ee, skin = 0xf6c9a4, nose = 0xf2867a, tunic = 0x2f6fd0;
    const belt = 0x6b4426, buckle = 0xf2c230, boot = 0x5a3a22, wood = 0xb07a4f, steel = 0xa8adb3;
    m.push(0, 0, 0, 0, 0, 0, 0.965); // modelled a touch tall; 55 cm overall
    // boots
    m.sym(s => ball(m, 0.044, boot, s * 0.045, 0.03, 0.032, 1, 0.7, 1.35));
    // round tunic (open underneath: it sits on the boots and the camera never sees below)
    m.lathe([[0.09, 0.05], [0.1, 0.08], [0.096, 0.15], [0.082, 0.22], [0.055, 0.265], [0, 0.28]], tunic, 0, 0, 0, 0, 0, 0, 10);
    // belt + buckle
    m.cyl(0.0985, 0.1, 0.026, belt, 0, 0.13, 0, 0, 0, 0, 10);
    m.box(0.042, 0.034, 0.012, buckle, 0, 0.13, 0.099);
    m.box(0.02, 0.016, 0.014, belt, 0, 0.13, 0.099);
    // head, ears, eyes peeking out under the hat
    const hy = 0.32;
    m.sphere(0.068, skin, 0, hy, 0.005, 1, 1, 1, 0, 0, 0, 8);
    ball(m, 0.068, beard, 0, hy - 0.004, -0.024, 1.06, 0.78, 0.82); // white hair round the back under the hat
    m.sym(s => ball(m, 0.02, skin, s * 0.066, hy - 0.002, 0, 0.6, 1, 0.9));
    m.sym(s => ball(m, 0.01, 0x2a1d17, s * 0.033, hy + 0.017, 0.06, 1, 1.25, 0.7));
    // big pointed beard down the chest + moustache
    m.extrude([[-0.074, 0.0], [-0.05, 0.022], [0.05, 0.022], [0.074, 0.0], [0.07, -0.05], [0.05, -0.1], [0, -0.16], [-0.05, -0.1], [-0.07, -0.05]],
      0.05, beard, 0, hy - 0.022, 0.05, -16 * D, 0, 0, 0.012);
    m.sym(s => ball(m, 0.03, beard, s * 0.024, hy - 0.02, 0.074, 1, 0.55, 0.6));
    // big rosy nose
    m.sphere(0.026, nose, 0, hy + 0.006, 0.08, 1, 1, 1, 0, 0, 0, 7);
    // tall red hat with a slight bend
    m.cyl(0.07, 0.074, 0.028, hat, 0, hy + 0.042, 0, 0, 0, 0, 9);
    m.push(0, hy + 0.052, 0, -6 * D, 0, 0);
    m.cyl(0.044, 0.07, 0.1, hat, 0, 0.05, 0, 0, 0, 0, 9);
    m.push(0, 0.1, 0, -14 * D, 0, 0);
    m.cone(0.044, 0.1, hat, 0, 0.05, 0, 0, 0, 0, 9);
    m.pop().pop();
    // arms: the right hand grips the shovel, the left rests on the belly
    rod(m, [0.072, 0.245, 0.0], [0.105, 0.18, 0.05], 0.027, tunic, 6, 0.022);
    ball(m, 0.024, skin, 0.112, 0.172, 0.062);
    rod(m, [-0.072, 0.245, 0.0], [-0.075, 0.175, 0.07], 0.027, tunic, 6, 0.022);
    ball(m, 0.024, skin, -0.064, 0.165, 0.09);
    // shovel
    const sx = 0.12, sz = 0.07;
    rod(m, [sx, 0.06, sz + 0.01], [sx, 0.3, sz - 0.01], 0.008, wood, 6);
    m.box(0.045, 0.012, 0.012, wood, sx, 0.3, sz - 0.01);
    m.box(0.012, 0.03, 0.012, steel, sx, 0.065, sz + 0.01);
    m.extrude([[-0.025, 0.035], [0.025, 0.035], [0.022, 0.0], [0, -0.02], [-0.022, 0.0]], 0.008, steel, sx, 0.02, sz + 0.012, 0, 0, 0);
    m.pop();
  },
});

// ================================================================================================
// 草坪火烈鸟 — the kitsch pink plastic lawn flamingo (side profile faces +Z, head on +X)
// ================================================================================================
def('lawn_flamingo', {
  name: '草坪火烈鸟',
  cat: 'toy',
  sfx: 'hard',
  fill: 0.2,
  build(m) {
    const pink = 0xff6fa8, wing = 0xf2508e, beakBase = 0xf8e6da, black = 0x232326, leg = 0x34363c;
    m.push(0.042, 0, 0); // centre the tail-to-beak extent (and the stakes) on x = 0
    // two metal stake legs
    rod(m, [-0.06, 0, 0.012], [-0.06, 0.56, 0.012], 0.0095, leg, 5);
    rod(m, [-0.02, 0, -0.012], [-0.02, 0.56, -0.012], 0.0095, leg, 5);
    // body (tail end up) and tail
    m.ellipsoid(0.19, 0.105, 0.095, pink, -0.04, 0.615, 0, 0, 0, -10 * D, 10);
    m.cone(0.06, 0.12, wing, -0.24, 0.66, 0, 0, 0, 72 * D, 6);
    // wings
    m.sym(s => {
      m.ellipsoid(0.14, 0.065, 0.025, wing, -0.07, 0.63, s * 0.075, 0, 0, -14 * D, 6);
      m.cone(0.035, 0.08, wing, -0.21, 0.665, s * 0.07, 0, 0, 76 * D, 5);
    });
    // S-curved neck up to the head
    m.tube([[0.1, 0.63, 0], [0.16, 0.7, 0], [0.13, 0.78, 0], [0.07, 0.84, 0], [0.08, 0.89, 0], [0.12, 0.905, 0]], 0.024, pink, 6, false, 14);
    const hx = 0.125, hy = 0.905;
    m.sphere(0.042, pink, hx, hy, 0, 1.15, 1, 1, 0, 0, 0, 8);
    // eyes
    m.sym(s => {
      ball(m, 0.012, 0xffffff, hx + 0.012, hy + 0.01, s * 0.036, 1, 1, 0.5);
      ball(m, 0.0075, black, hx + 0.015, hy + 0.011, s * 0.041, 1, 1, 0.5);
    });
    // bent beak: pale base, black tip pointing down
    const b0 = [hx + 0.035, hy - 0.005, 0], b1 = [hx + 0.075, hy - 0.03, 0], b2 = [hx + 0.088, hy - 0.07, 0];
    rod(m, b0, b1, 0.017, beakBase, 6, 0.013);
    rod(m, b1, b2, 0.013, black, 6, 0.003);
    ball(m, 0.0135, beakBase, b1[0], b1[1], b1[2]);
    m.pop();
  },
});

// ================================================================================================
// 蹦床 — garden trampoline: black mat, padded blue rim, U-shaped steel legs
// ================================================================================================
def('trampoline', {
  name: '蹦床',
  cat: 'toy',
  sfx: 'soft',
  fill: 0.35,
  build(m) {
    const pad = 0x2f86e8, mat = 0x25272d, matEdge = 0x40434c, steel = 0xb8bcc2, white = 0xf4f6fa;
    const RO = 1.2, RI = 0.95, top = 0.75, fy = 0.665; // legs end inside the pad's sloping underside
    // padded rim over the springs: a closed ring profile, lathed, with a skirt hanging over the frame
    m.lathe([[RI + 0.01, 0.69], [RO - 0.03, 0.625], [RO, 0.635], [RO + 0.001, 0.71], [RO - 0.035, top - 0.002], [RI + 0.05, top - 0.006],
      [RI, 0.725], [RI + 0.01, 0.69]], pad, 0, 0, 0, 0, 0, 0, 24);
    // white piping round the top edge
    m.torus(RO - 0.018, 0.012, white, 0, 0.731, 0, 90 * D, 0, 0, Math.PI * 2, 3, 24);
    // mat: a lighter stitched band round a black centre
    m.disc(RI + 0.005, matEdge, 0, 0.705, 0, 0, 0, 0, 24);
    m.disc(RI - 0.07, mat, 0, 0.708, 0, 0, 0, 0, 24);
    // the steel V-rings where the springs hook into the mat
    for (let i = 0; i < 20; i++) {
      const a = ((i + 0.5) / 20) * Math.PI * 2, r = RI - 0.035;
      m.plane(0.035, 0.05, steel, Math.sin(a) * r, 0.711, Math.cos(a) * r, -90 * D, 0, -a);
    }
    // four U-shaped steel legs
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2 + Math.PI / 4, da = 0.22, R = 1.1;
      const p = t => [Math.cos(a + t) * R, Math.sin(a + t) * R];
      const [x0, z0] = p(-da), [x1, z1] = p(da);
      rod(m, [x0, 0.028, z0], [x0, fy, z0], 0.028, steel, 6);
      rod(m, [x1, 0.028, z1], [x1, fy, z1], 0.028, steel, 6);
      rod(m, [x0, 0.028, z0], [x1, 0.028, z1], 0.028, steel, 6);
    }
  },
});
