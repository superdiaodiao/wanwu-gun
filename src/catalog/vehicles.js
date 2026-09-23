// 交通工具 — bikes, cars, buses, trucks, a swan boat, the bullet train and its viaduct.
// Conventions: front faces +Z, wheels rest on y = 0, lamps use m.glow(), body paint uses m.tint()
// (tinted parts are modelled white). Decal keys use the prefix ve_.
import * as THREE from 'three';
import { def } from './registry.js';
import { D, shade } from '../core/modeler.js';
import { decal, fitText, FONTS } from '../core/atlas.js';

// ---- shared palette ----------------------------------------------------------------------------
const TIRE = 0x2a2a2e, HUB = 0xc9cdd2, GLASS = 0x2c4057, TRIM = 0x3a3a40, DARK = 0x2f3136;
const LAMP = 0xfff3cc, TAIL = 0xe0282e, AMBER = 0xf2a13a, CHROME = 0xd8dce0;
const PAINT = 0xffffff; // parts under m.tint() take the instance colour

// ---- helpers -----------------------------------------------------------------------------------
const _Y = new THREE.Vector3(0, 1, 0);
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _d = new THREE.Vector3();

/** Euler angles that turn local +Y towards b - a, plus the distance. */
function aim(a, b) {
  _d.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const len = _d.length();
  _q.setFromUnitVectors(_Y, _d.normalize());
  _e.setFromQuaternion(_q, 'XYZ');
  return [_e.x, _e.y, _e.z, len];
}
/** Cylinder rod from point a to point b. */
function rod(m, a, b, r, col, seg = 6) {
  const [rx, ry, rz, len] = aim(a, b);
  m.cyl(r, r, len, col, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2, rx, ry, rz, seg);
}
/** Box beam from point a to point b (w, d = cross-section). */
function beam(m, a, b, w, d, col) {
  const [rx, ry, rz, len] = aim(a, b);
  m.box(w, len, d, col, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2, rx, ry, rz);
}
/** Road wheel, axle along X, touching y = 0. */
function wheel(m, x, z, r, w, rim = HUB, cap = true) {
  m.cyl(r, r, w, TIRE, x, r, z, 0, 0, 90 * D, 12);
  m.cyl(r * 0.6, r * 0.6, w + 0.02, rim, x, r, z, 0, 0, 90 * D, 8);
  if (cap) m.cyl(r * 0.22, r * 0.22, w + 0.04, shade(rim, 0.72), x, r, z, 0, 0, 90 * D, 6);
}
/** Number plate decal. */
function plateDecal(key, text, bg, fg, w = 128, h = 40) {
  decal(key, w, h, (ctx, W, H) => {
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = fg;
    ctx.lineWidth = 3;
    ctx.strokeRect(3, 3, W - 6, H - 6);
    fitText(ctx, text, W / 2, H / 2, W - 14, H - 12, FONTS.sans, fg);
  });
}
/** Place a decal on the +X (s = 1) or -X (s = -1) side of a vehicle, reading front-to-back correctly. */
function sideDecal(m, s, w, h, key, x, y, z) {
  m.decal(w, h, key, s * x, y, z, 0, s * 90 * D, 0);
}
/**
 * Skin closed rings of points ([x, y, z], counter-clockwise seen from +Z, rings ordered by increasing z)
 * into quads. colorAt(i, j) colours the quad between points i..i+1 of rings j..j+1. Optional flat caps.
 */
function loft(m, rings, colorAt, capStart = null, capEnd = null) {
  const groups = new Map();
  const put = (col, a, b, c) => {
    let arr = groups.get(col);
    if (!arr) groups.set(col, (arr = []));
    arr.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
  };
  for (let j = 0; j < rings.length - 1; j++) {
    const A = rings[j], B = rings[j + 1], n = A.length;
    for (let i = 0; i < n; i++) {
      const k = (i + 1) % n, col = colorAt(i, j);
      put(col, A[i], A[k], B[i]);
      put(col, A[k], B[k], B[i]);
    }
  }
  const cap = (R, col, facingBack) => {
    const tris = THREE.ShapeUtils.triangulateShape(R.map(p => new THREE.Vector2(p[0], p[1])), []);
    for (const [a, b, c] of tris) {
      const area = (R[b][0] - R[a][0]) * (R[c][1] - R[a][1]) - (R[c][0] - R[a][0]) * (R[b][1] - R[a][1]);
      if (area > 0 !== facingBack) put(col, R[a], R[b], R[c]);
      else put(col, R[a], R[c], R[b]);
    }
  };
  if (capStart != null) cap(rings[0], capStart, true);
  if (capEnd != null) cap(rings[rings.length - 1], capEnd, false);
  for (const [col, arr] of groups) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3));
    g.computeVertexNormals();
    m.geo(g, col);
  }
}
/** Smooth tube through points with a radius per point (necks, trunks). Open ends. */
function taperTube(m, pts, radii, col, seg = 8, steps = 2) {
  const curve = new THREE.CatmullRomCurve3(pts.map(p => new THREE.Vector3(p[0], p[1], p[2])));
  const N = (pts.length - 1) * steps;
  const P = curve.getPoints(N);
  const t = new THREE.Vector3(), n = new THREE.Vector3(), b = new THREE.Vector3();
  const rings = P.map((p, i) => {
    t.subVectors(P[Math.min(i + 1, N)], P[Math.max(i - 1, 0)]).normalize();
    n.set(1, 0, 0);
    if (Math.abs(n.dot(t)) > 0.9) n.set(0, 1, 0);
    n.addScaledVector(t, -n.dot(t)).normalize();
    b.crossVectors(t, n);
    const u = (i / N) * (radii.length - 1), i0 = Math.min(Math.floor(u), radii.length - 2);
    const r = radii[i0] + (radii[i0 + 1] - radii[i0]) * (u - i0);
    const ring = [];
    for (let k = 0; k < seg; k++) {
      const a = (k / seg) * Math.PI * 2, c = Math.cos(a) * r, s = Math.sin(a) * r;
      ring.push([p.x + n.x * c + b.x * s, p.y + n.y * c + b.y * s, p.z + n.z * c + b.z * s]);
    }
    return ring;
  });
  loft(m, rings, () => col);
}
/** Tiny deterministic generator for decal drawings (m.rng is not available at module load). */
function lcg(seed) {
  let a = seed >>> 0;
  return () => ((a = (Math.imul(a, 1664525) + 1013904223) >>> 0) / 4294967296);
}

plateDecal('ve_plate_blue', '滚A·5G520', '#1f4fb6', '#f4f7ff');
plateDecal('ve_plate_taxi', '滚B·T0888', '#1f4fb6', '#f4f7ff');
plateDecal('ve_plate_van', '滚C·66B88', '#1f4fb6', '#f4f7ff');
plateDecal('ve_plate_yellow', '滚A·88088', '#f2c14e', '#1d1d20');
plateDecal('ve_plate_eb', '滚A 02588', '#f2f1e8', '#23703a', 80, 40);

decal('ve_qr', 40, 40, (ctx, w, h) => {
  const ink = '#1d1d22', paper = '#f7f7f2';
  ctx.fillStyle = paper;
  ctx.fillRect(0, 0, w, h);
  const n = 11, s = 3, o = Math.floor((w - n * s) / 2);
  const rnd = lcg(11);
  ctx.fillStyle = ink;
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (rnd() < 0.48) ctx.fillRect(o + x * s, o + y * s, s, s);
  for (const [fx, fy] of [[0, 0], [n - 3, 0], [0, n - 3]]) {
    const X = o + fx * s, Y = o + fy * s;
    ctx.fillStyle = ink; ctx.fillRect(X - 1, Y - 1, 11, 11);
    ctx.fillStyle = paper; ctx.fillRect(X + 1, Y + 1, 7, 7);
    ctx.fillStyle = ink; ctx.fillRect(X + 3, Y + 3, 3, 3);
  }
});

// ---- 共享单车 -----------------------------------------------------------------------------------
def('shared_bike', {
  name: '共享单车',
  cat: 'vehicle',
  sfx: 'bell',
  fill: 0.12,
  tints: [0xf2c83a, 0xf28a2e, 0x3d8fdc, 0x49b35c],
  build(m) {
    const R = 0.3, T = 0.034, zF = 0.55, zR = -0.55, yA = R;
    const black = 0x2e2c30, grey = 0x3a3d44, silver = 0xc3c7cc;
    // tyres, hubs and tinted five-spoke wheels
    for (const z of [zF, zR]) {
      m.torus(R - T, T, TIRE, 0, yA, z, 0, 90 * D, 0, Math.PI * 2, 4, 16);
      m.cyl(0.045, 0.045, 0.11, silver, 0, yA, z, 0, 0, 90 * D, 8);
      m.tint();
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2 + 0.3;
        m.box(0.022, 0.21, 0.04, PAINT, 0, yA + Math.cos(a) * 0.145, z + Math.sin(a) * 0.145, a, 0, 0);
      }
      m.tint(0);
    }
    // step-through frame, stays, fork, mudguards (tinted)
    m.tint();
    m.tube([[0, 0.76, 0.43], [0, 0.5, 0.27], [0, 0.34, 0.07], [0, 0.3, -0.08], [0, 0.45, -0.18], [0, 0.8, -0.27]], 0.032, PAINT, 6, false, 10);
    rod(m, [0, 0.56, 0.475], [0, 0.88, 0.405], 0.038, PAINT, 6);
    m.sym(s => {
      beam(m, [s * 0.02, 0.3, -0.08], [s * 0.06, yA, zR], 0.026, 0.026, PAINT);
      beam(m, [s * 0.02, 0.75, -0.255], [s * 0.06, yA, zR], 0.026, 0.026, PAINT);
      beam(m, [s * 0.02, 0.6, 0.465], [s * 0.055, yA, zF], 0.032, 0.032, PAINT);
    });
    m.torus(R + 0.02, 0.02, PAINT, 0, yA, zF, 0, 90 * D, 60 * D, 90 * D, 4, 6);
    m.torus(R + 0.02, 0.02, PAINT, 0, yA, zR, 0, 90 * D, 25 * D, 95 * D, 4, 6);
    m.tint(0);
    // saddle, post, stem, handlebar, bell
    rod(m, [0, 0.78, -0.268], [0, 0.93, -0.31], 0.018, silver);
    m.ellipsoid(0.085, 0.045, 0.15, black, 0, 0.955, -0.3, 0.1, 0, 0, 6);
    beam(m, [0, 0.86, 0.41], [0, 1.0, 0.37], 0.034, 0.034, silver);
    rod(m, [-0.29, 1.0, 0.36], [0.29, 1.0, 0.36], 0.015, grey);
    m.sym(s => {
      m.box(0.1, 0.04, 0.04, black, s * 0.26, 1.0, 0.36);
      m.box(0.1, 0.012, 0.025, grey, s * 0.19, 1.0, 0.395, 0, s * 0.3, 0);
    });
    m.sphere(0.024, silver, 0.14, 1.024, 0.36, 1, 0.6, 1, 0, 0, 0, 6);
    // front basket (dark plastic, tinted front panel with a QR sticker) + lamp
    const bx = 0.36, bh = 0.22, bd = 0.26, by = 0.87, bz = 0.61;
    m.box(bx, 0.015, bd, grey, 0, by - bh / 2, bz);
    m.box(bx, bh, 0.015, grey, 0, by, bz - bd / 2);
    m.sym(s => m.box(0.015, bh, bd, grey, s * bx / 2, by, bz));
    m.tint();
    m.box(bx + 0.01, bh + 0.01, 0.016, PAINT, 0, by, bz + bd / 2);
    m.tint(0);
    m.decal(0.12, 0.12, 've_qr', 0, by, bz + bd / 2 + 0.009);
    beam(m, [0, 0.96, bz - bd / 2], [0, 0.99, 0.38], 0.024, 0.024, grey);
    m.sym(s => beam(m, [s * 0.1, by - bh / 2, bz], [s * 0.055, yA, zF], 0.016, 0.016, grey));
    m.glow(1);
    m.box(0.07, 0.04, 0.03, LAMP, 0, by - bh / 2 - 0.02, bz + bd / 2 - 0.01);
    m.glow(0);
    // chain case, cranks, pedals, kickstand
    m.box(0.03, 0.1, 0.46, 0xb8bcc2, -0.06, 0.3, -0.31);
    m.cyl(0.1, 0.1, 0.036, 0xb8bcc2, -0.06, 0.3, -0.08, 0, 0, 90 * D, 8);
    m.sym(s => {
      beam(m, [s * 0.09, 0.3, -0.08], [s * 0.1, 0.3 - s * 0.15, -0.08 + s * 0.05], 0.02, 0.025, grey);
      m.box(0.09, 0.02, 0.05, black, s * 0.14, 0.3 - s * 0.15, -0.08 + s * 0.05);
    });
    beam(m, [0.05, 0.28, -0.14], [0.2, 0.02, -0.3], 0.02, 0.02, grey);
    // rear rack with the smart lock box, QR plate and reflector
    m.box(0.12, 0.02, 0.26, grey, 0, 0.67, -0.6);
    m.sym(s => beam(m, [s * 0.05, 0.66, -0.7], [s * 0.06, yA, zR], 0.016, 0.016, grey));
    m.box(0.11, 0.08, 0.14, 0xf2f1ea, 0, 0.72, -0.6);
    m.box(0.09, 0.02, 0.12, 0xdcdad2, 0, 0.77, -0.6);
    m.decal(0.07, 0.07, 've_qr', 0, 0.72, -0.671, 0, Math.PI, 0);
    m.glow(0.6);
    m.box(0.06, 0.035, 0.015, TAIL, 0, 0.52, -0.805);
    m.glow(0);
  },
});

// ---- 电动车 (with a 挡风被 windshield quilt) -----------------------------------------------------
decal('ve_quilt', 64, 64, (ctx, w, h) => {
  ctx.fillStyle = '#2c3e66';
  ctx.fillRect(0, 0, w, h);
  ctx.globalAlpha = 0.6;
  ctx.fillStyle = '#c0392b';
  for (let i = 0; i < 4; i++) {
    ctx.fillRect(i * 16 + 3, 0, 6, h);
    ctx.fillRect(0, i * 16 + 3, w, 6);
  }
  ctx.globalAlpha = 0.75;
  ctx.fillStyle = '#e8c35a';
  for (let i = 0; i < 4; i++) {
    ctx.fillRect(i * 16 + 12, 0, 2, h);
    ctx.fillRect(0, i * 16 + 12, w, 2);
  }
  ctx.globalAlpha = 1;
});

def('ebike', {
  name: '电动车',
  cat: 'vehicle',
  sfx: 'horn',
  fill: 0.25,
  tints: [0xd8342c, 0xf4f2ec, 0x5aa9e6, 0xf08fb0, 0x3a3a40, 0x7fcfb0, 0xb8bcc2],
  build(m) {
    const r = 0.24, zF = 0.57, zR = -0.56;
    const seat = 0x2e2a2c, grey = 0x4a4d55, quilt = 0x2c3e66, silver = 0xc3c7cc;
    // wheels: front with a disc brake, rear with the hub motor
    m.cyl(r, r, 0.1, TIRE, 0, r, zF, 0, 0, 90 * D, 12);
    m.cyl(0.13, 0.13, 0.11, silver, 0, r, zF, 0, 0, 90 * D, 8);
    m.cyl(r, r, 0.11, TIRE, 0, r, zR, 0, 0, 90 * D, 12);
    m.cyl(0.16, 0.16, 0.12, grey, 0, r, zR, 0, 0, 90 * D, 10);
    m.cyl(0.07, 0.07, 0.13, silver, 0, r, zR, 0, 0, 90 * D, 8);
    m.sym(s => rod(m, [s * 0.065, 0.62, 0.42], [s * 0.065, r, zF], 0.024, silver));
    m.torus(0.27, 0.035, grey, 0, r, zR, 0, 90 * D, 20 * D, 60 * D, 4, 6);
    // body shells (tinted)
    m.tint();
    m.rbox(0.36, 0.36, 0.72, 0.1, PAINT, 0, 0.52, -0.42);
    m.box(0.3, 0.12, 0.58, PAINT, 0, 0.23, 0.07);
    m.box(0.42, 0.58, 0.07, PAINT, 0, 0.62, 0.3, -12 * D, 0, 0);
    m.rbox(0.34, 0.2, 0.24, 0.06, PAINT, 0, 0.98, 0.36);
    m.torus(0.29, 0.04, PAINT, 0, r, zF, 0, 90 * D, 75 * D, 80 * D, 4, 8);
    m.box(0.3, 0.1, 0.14, PAINT, 0, 0.74, -0.74);
    m.tint(0);
    // floorboard, seat, dash
    m.box(0.34, 0.05, 0.5, grey, 0, 0.31, 0.03);
    m.rbox(0.32, 0.1, 0.6, 0.045, seat, 0, 0.745, -0.36);
    m.box(0.16, 0.04, 0.1, 0x2a2d33, 0, 1.09, 0.32, -0.3, 0, 0);
    // lamps
    m.glow(1);
    m.ellipsoid(0.085, 0.06, 0.04, LAMP, 0, 0.98, 0.475, 0, 0, 0, 6);
    m.box(0.2, 0.05, 0.03, TAIL, 0, 0.62, -0.785);
    m.sym(s => m.box(0.05, 0.04, 0.03, AMBER, s * 0.12, 0.72, -0.8));
    m.glow(0);
    // number plate under the tail
    m.box(0.18, 0.1, 0.02, grey, 0, 0.44, -0.78);
    m.decal(0.16, 0.08, 've_plate_eb', 0, 0.44, -0.791, 0, Math.PI, 0);
    // handlebar + mirrors
    rod(m, [-0.34, 1.04, 0.27], [0.34, 1.04, 0.27], 0.016, grey);
    m.sym(s => {
      rod(m, [s * 0.2, 1.05, 0.28], [s * 0.27, 1.22, 0.3], 0.01, grey);
      m.ellipsoid(0.06, 0.045, 0.016, grey, s * 0.28, 1.25, 0.3, 0, 0, 0, 6);
      m.box(0.08, 0.05, 0.01, 0xa9c4d8, s * 0.28, 1.25, 0.288);
    });
    // 挡风被: quilted plaid cover hanging from the handlebar, side flaps and hand muffs
    m.push(0, 0.73, 0.4, -10 * D, 0, 0);
    m.box(0.64, 0.54, 0.06, quilt, 0, 0, 0);
    m.decal(0.6, 0.5, 've_quilt', 0, 0, 0.031);
    m.pop();
    m.sym(s => {
      m.push(s * 0.34, 0.7, 0.26, 0, -s * 14 * D, 0);
      m.box(0.05, 0.5, 0.32, quilt, 0, 0, 0);
      m.decal(0.3, 0.46, 've_quilt', s * 0.026, 0, 0, 0, s * 90 * D, 0);
      m.pop();
      m.ellipsoid(0.1, 0.085, 0.15, quilt, s * 0.3, 1.04, 0.27, 0, 0, 0, 6);
    });
  },
});

// ---- 快递三轮车 ---------------------------------------------------------------------------------
decal('ve_express', 128, 64, (ctx, w, h) => {
  const ink = '#f7f5ee';
  ctx.fillStyle = ink;
  ctx.fillRect(6, 13, 38, 38);
  ctx.clearRect(22, 13, 6, 38); // tape lines let the box colour show through
  ctx.clearRect(6, 22, 38, 5);
  fitText(ctx, '快递', 88, 33, 74, 46, FONTS.sans, ink);
});
decal('ve_parcel_label', 32, 24, (ctx, w, h) => {
  ctx.fillStyle = '#f7f5ee';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#d8342c';
  ctx.fillRect(2, 2, 11, 5);
  ctx.fillStyle = '#26262c';
  ctx.fillRect(15, 3, 14, 2);
  ctx.fillRect(2, 9, 27, 2);
  const rnd = lcg(5);
  for (let x = 3; x < 29; x += 2) if (rnd() < 0.7) ctx.fillRect(x, 14, 1 + (rnd() < 0.4 ? 1 : 0), 8);
});

def('tricycle', {
  name: '快递三轮车',
  cat: 'vehicle',
  sfx: 'horn',
  fill: 0.4,
  mover: { kind: 'drive', speed: 3 },
  build(m) {
    const blue = 0x3a7bd5, deep = 0x2d5fa8, grey = 0x4a4d55, seat = 0x2e2a2c, card = 0xc8955a, tape = 0xe8cf9a;
    // wheels: one in front, two under the cargo box
    const rf = 0.23, zF = 0.92;
    m.cyl(rf, rf, 0.1, TIRE, 0, rf, zF, 0, 0, 90 * D, 12);
    m.cyl(0.12, 0.12, 0.11, HUB, 0, rf, zF, 0, 0, 90 * D, 8);
    m.sym(s => wheel(m, s * 0.47, -0.72, 0.25, 0.12));
    rod(m, [-0.44, 0.25, -0.72], [0.44, 0.25, -0.72], 0.045, DARK, 6);
    m.box(0.26, 0.2, 0.22, DARK, 0, 0.27, -0.72);
    m.sym(s => rod(m, [s * 0.06, 0.66, 0.83], [s * 0.06, rf, zF], 0.022, HUB));
    // chassis rails under the box, floorboard, front body
    m.sym(s => m.box(0.08, 0.1, 1.36, DARK, s * 0.3, 0.5, -0.52));
    m.box(0.5, 0.06, 0.44, grey, 0, 0.33, 0.5);
    m.box(0.42, 0.12, 0.62, blue, 0, 0.24, 0.46);
    m.box(0.46, 0.6, 0.07, blue, 0, 0.66, 0.74, -12 * D, 0, 0);
    m.rbox(0.36, 0.2, 0.26, 0.06, blue, 0, 1.0, 0.8);
    m.torus(0.28, 0.035, blue, 0, rf, zF, 0, 90 * D, 70 * D, 85 * D, 4, 8);
    // seat on the battery box, backrest against the cargo box
    m.box(0.42, 0.42, 0.34, blue, 0, 0.53, 0.35);
    m.box(0.44, 0.1, 0.36, seat, 0, 0.79, 0.35);
    m.box(0.44, 0.3, 0.06, seat, 0, 1.0, 0.2, 8 * D, 0, 0);
    // handlebar, mirrors, headlight
    rod(m, [-0.34, 1.06, 0.72], [0.34, 1.06, 0.72], 0.016, grey);
    m.sym(s => {
      m.box(0.1, 0.04, 0.04, seat, s * 0.3, 1.06, 0.72);
      rod(m, [s * 0.2, 1.07, 0.73], [s * 0.27, 1.24, 0.75], 0.01, grey);
      m.ellipsoid(0.06, 0.045, 0.016, grey, s * 0.28, 1.27, 0.75, 0, 0, 0, 6);
    });
    m.box(0.16, 0.04, 0.1, 0x2a2d33, 0, 1.11, 0.76, -0.3, 0, 0);
    m.glow(1);
    m.ellipsoid(0.09, 0.065, 0.04, LAMP, 0, 1.0, 0.935, 0, 0, 0, 6);
    m.glow(0);
    // cargo box (open top)
    const bw = 1.1, bz0 = -1.2, bz1 = 0.16, by0 = 0.55, by1 = 1.32;
    const bl = bz1 - bz0, bzc = (bz0 + bz1) / 2, bh = by1 - by0, byc = (by0 + by1) / 2;
    m.box(bw, 0.06, bl, deep, 0, by0 + 0.03, bzc);
    m.sym(s => m.box(0.04, bh, bl, blue, s * (bw / 2 - 0.02), byc, bzc));
    m.box(bw, bh, 0.04, blue, 0, byc, bz1 - 0.02);
    m.box(bw, bh, 0.04, blue, 0, byc, bz0 + 0.02);
    m.sym(s => m.box(0.07, 0.04, bl + 0.02, deep, s * (bw / 2 - 0.02), by1 + 0.01, bzc));
    m.box(bw + 0.02, 0.04, 0.07, deep, 0, by1 + 0.01, bz1 - 0.02);
    m.box(bw + 0.02, 0.04, 0.07, deep, 0, by1 + 0.01, bz0 + 0.02);
    m.box(bw + 0.02, 0.05, bl + 0.02, deep, 0, by0 + 0.2, bzc);
    m.sym(s => sideDecal(m, s, 0.76, 0.38, 've_express', bw / 2 + 0.003, 0.98, -0.52));
    m.decal(0.56, 0.28, 've_express', 0, 1.08, bz0 - 0.003, 0, Math.PI, 0);
    m.decal(0.3, 0.094, 've_plate_yellow', 0, 0.72, bz0 - 0.003, 0, Math.PI, 0);
    m.glow(1);
    m.sym(s => m.box(0.12, 0.08, 0.03, TAIL, s * 0.43, 0.72, bz0 - 0.012));
    m.glow(0);
    // the heap of parcels
    m.box(bw - 0.08, 0.1, bl - 0.08, shade(card, 0.7), 0, 1.2, bzc);
    for (let ix = 0; ix < 3; ix++) {
      for (let iz = 0; iz < 4; iz++) {
        const w = m.rng.range(0.24, 0.3), d = m.rng.range(0.24, 0.31), h = m.rng.range(0.2, 0.42);
        const x = -0.32 + ix * 0.32 + m.rng.range(-0.02, 0.02), z = bz0 + 0.2 + iz * 0.32 + m.rng.range(-0.02, 0.02);
        const ry = m.rng.range(-0.15, 0.15), top = 1.25 + h;
        if (m.rng.chance(0.18)) {
          m.ellipsoid(w * 0.55, h * 0.4, d * 0.6, m.rng.pick([0xe6e4dc, 0x9aa0a6, 0xf2c14e]), x, 1.25 + h * 0.35, z, 0, ry, 0, 6);
          continue;
        }
        m.jitter(0.12);
        m.box(w, h, d, card, x, 1.25 + h / 2, z, 0, ry, 0);
        m.jitter(0);
        m.box(0.06, 0.008, d + 0.006, tape, x, top + 0.002, z, 0, ry, 0);
        if (m.rng.chance(0.6)) m.decal(0.1, 0.075, 've_parcel_label', x + 0.06 * Math.cos(ry), top + 0.008, z - 0.06 * Math.sin(ry), -90 * D, 0, ry);
      }
    }
  },
});

// ---- 出租车 (two-tone yellow over green) -------------------------------------------------------
decal('ve_taxi_sign', 96, 40, (ctx, w, h) => {
  ctx.fillStyle = '#f7f3e6';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#d8342c';
  ctx.fillRect(0, h - 5, w, 5);
  fitText(ctx, '出租', w / 2, h / 2 - 2, w - 16, h - 12, FONTS.sans, '#d8342c');
});
decal('ve_taxi_door', 128, 32, (ctx, w, h) => {
  fitText(ctx, '幸福出租', w / 2, h / 2, w - 8, h - 6, FONTS.sans, '#f7f3e6');
});

def('taxi', {
  name: '出租车',
  cat: 'vehicle',
  sfx: 'horn',
  fill: 0.55,
  mover: { kind: 'drive', speed: 9 },
  build(m) {
    const yellow = 0xf2c230, green = 0x2f8f5b, L = 4.5, W = 1.8;
    // two-tone body: green lower half, yellow waist, hood, boot and cabin
    m.rbox(W, 0.4, L, 0.12, green, 0, 0.47, 0);
    m.rbox(W - 0.02, 0.26, L - 0.08, 0.1, yellow, 0, 0.77, 0);
    m.rbox(1.56, 0.5, 2.2, 0.13, yellow, 0, 1.14, -0.22);
    m.sym(s => m.box(0.12, 0.08, 0.2, yellow, s * 0.86, 0.97, 0.78));
    // glass
    m.wedge(0.62, 0.46, 1.42, GLASS, 0, 1.12, 1.19, 0, -90 * D, 0);
    m.wedge(0.5, 0.42, 1.42, GLASS, 0, 1.1, -1.57, 0, 90 * D, 0);
    m.box(1.57, 0.28, 1.95, GLASS, 0, 1.17, -0.22);
    m.box(1.59, 0.3, 0.09, yellow, 0, 1.17, -0.18);
    // roof light 出租
    m.box(0.36, 0.05, 0.16, TRIM, 0, 1.41, -0.25);
    m.glow(0.8);
    m.extrude([[-0.3, 0], [0.3, 0], [0.25, 0.2], [-0.25, 0.2]], 0.24, 0xf7f3e6, 0, 1.43, -0.25);
    m.decal(0.42, 0.16, 've_taxi_sign', 0, 1.525, -0.128);
    m.decal(0.42, 0.16, 've_taxi_sign', 0, 1.525, -0.372, 0, Math.PI, 0);
    m.glow(0);
    // bumpers, grille, lamps, plates
    m.box(W * 0.97, 0.2, 0.14, TRIM, 0, 0.36, L / 2 - 0.02);
    m.box(W * 0.97, 0.2, 0.14, TRIM, 0, 0.36, -L / 2 + 0.02);
    m.box(0.72, 0.12, 0.04, TRIM, 0, 0.6, L / 2 + 0.005);
    m.glow(1);
    m.sym(s => m.box(0.36, 0.12, 0.05, LAMP, s * 0.6, 0.68, L / 2 - 0.02));
    m.sym(s => m.box(0.34, 0.1, 0.05, TAIL, s * 0.6, 0.73, -L / 2 + 0.02));
    m.glow(0);
    m.decal(0.44, 0.14, 've_plate_taxi', 0, 0.38, L / 2 + 0.056);
    m.decal(0.44, 0.14, 've_plate_taxi', 0, 0.38, -L / 2 - 0.056, 0, Math.PI, 0);
    // door seams, handles, side lettering
    m.sym(s => {
      for (const z of [0.9, -0.18, -1.22]) m.box(0.012, 0.54, 0.02, 0x2a2a30, s * 0.902, 0.62, z);
      for (const z of [0.5, -0.56]) m.box(0.02, 0.03, 0.14, 0xe9e4d6, s * 0.9, 0.8, z);
      sideDecal(m, s, 0.66, 0.16, 've_taxi_door', 0.904, 0.47, 0.36);
    });
    for (const z of [1.4, -1.4]) m.sym(s => wheel(m, s * 0.79, z, 0.32, 0.23));
  },
});

// ---- SUV --------------------------------------------------------------------------------------
def('suv', {
  name: 'SUV',
  cat: 'vehicle',
  sfx: 'horn',
  fill: 0.6,
  tints: [0xf4f2ec, 0x26262c, 0xb8bcc2, 0xd8342c, 0x2c3e66, 0x3a8f5c, 0x9a7b5a],
  mover: { kind: 'drive', speed: 9 },
  build(m) {
    const clad = 0x34363c, zc = 0.11;
    // dark cladding, tinted body and tall cabin
    m.rbox(1.9, 0.34, 4.54, 0.1, clad, 0, 0.52, zc);
    m.tint();
    m.rbox(1.88, 0.5, 4.5, 0.14, PAINT, 0, 0.9, zc);
    m.rbox(1.74, 0.56, 3.1, 0.12, PAINT, 0, 1.4, -0.52);
    m.sym(s => m.box(0.12, 0.1, 0.22, PAINT, s * 0.9, 1.2, 0.9));
    m.box(1.77, 0.36, 0.1, PAINT, 0, 1.44, -0.2);
    m.box(1.77, 0.36, 0.12, PAINT, 0, 1.44, -1.32);
    m.tint(0);
    // wheel-arch flares
    for (const z of [1.48, -1.48]) m.sym(s => m.torus(0.44, 0.07, clad, s * 0.88, 0.37, z, 0, 90 * D, 0, Math.PI, 3, 6));
    // glass
    m.wedge(0.55, 0.5, 1.56, GLASS, 0, 1.38, 1.3, 0, -90 * D, 0);
    m.box(1.75, 0.34, 2.8, GLASS, 0, 1.44, -0.5);
    m.box(1.46, 0.36, 0.03, GLASS, 0, 1.44, -2.085);
    // roof rails
    m.sym(s => {
      m.box(0.05, 0.05, 2.7, clad, s * 0.72, 1.73, -0.52);
      for (const z of [0.7, -1.74]) m.box(0.06, 0.06, 0.1, clad, s * 0.72, 1.7, z);
    });
    // front: grille, chrome bar, skid plate, lamps
    m.box(1.0, 0.24, 0.04, 0x26262c, 0, 0.92, 2.37);
    m.box(0.92, 0.03, 0.02, CHROME, 0, 0.92, 2.395);
    m.box(1.0, 0.08, 0.1, CHROME, 0, 0.42, 2.34);
    m.glow(1);
    m.sym(s => m.box(0.36, 0.12, 0.05, LAMP, s * 0.66, 0.98, 2.35));
    m.sym(s => m.box(0.12, 0.06, 0.04, LAMP, s * 0.7, 0.58, 2.38));
    m.sym(s => m.box(0.3, 0.14, 0.05, TAIL, s * 0.72, 1.0, -2.13));
    m.glow(0);
    // spare wheel on the tailgate
    m.cyl(0.34, 0.34, 0.2, TIRE, 0, 0.98, -2.24, 90 * D, 0, 0, 12);
    m.tint();
    m.cyl(0.29, 0.29, 0.22, PAINT, 0, 0.98, -2.24, 90 * D, 0, 0, 12);
    m.tint(0);
    m.decal(0.44, 0.14, 've_plate_blue', 0, 0.54, 2.386);
    m.decal(0.44, 0.14, 've_plate_blue', 0, 0.54, -2.166, 0, Math.PI, 0);
    // door seams and handles
    m.sym(s => {
      for (const z of [1.0, -0.2, -1.32]) m.box(0.012, 0.5, 0.02, 0x2a2a30, s * 0.942, 0.88, z);
      for (const z of [0.62, -0.58]) m.box(0.02, 0.03, 0.14, 0x2a2a30, s * 0.945, 1.04, z);
    });
    for (const z of [1.48, -1.48]) m.sym(s => wheel(m, s * 0.83, z, 0.37, 0.26));
  },
});

// ---- 面包车 -------------------------------------------------------------------------------------
def('minivan', {
  name: '面包车',
  cat: 'vehicle',
  sfx: 'horn',
  fill: 0.65,
  tints: [0xf4f2ec, 0xb8bcc2, 0x5aa9e6, 0xd8342c, 0x3a8f5c, 0xe8b93a],
  mover: { kind: 'drive', speed: 8 },
  build(m) {
    const W = 1.62;
    m.tint();
    m.rbox(W, 1.5, 3.8, 0.12, PAINT, 0, 1.07, -0.17);
    m.rbox(1.6, 0.6, 0.5, 0.1, PAINT, 0, 0.62, 1.8);
    m.sym(s => m.wedge(0.34, 0.86, 0.08, PAINT, s * 0.77, 1.36, 1.87, 0, -90 * D, 0));
    for (const z of [0.78, -0.55, -1.52]) m.box(W + 0.02, 0.52, 0.1, PAINT, 0, 1.46, z);
    m.tint(0);
    // glass: raked windscreen, side windows, rear window
    m.wedge(0.34, 0.86, 1.46, GLASS, 0, 1.36, 1.87, 0, -90 * D, 0);
    m.box(W + 0.01, 0.5, 3.42, GLASS, 0, 1.46, -0.19);
    m.box(1.3, 0.48, 0.03, GLASS, 0, 1.45, -2.075);
    // front: bumper, grille, lamps
    m.box(W, 0.18, 0.14, TRIM, 0, 0.42, 2.03);
    m.box(0.7, 0.12, 0.04, TRIM, 0, 0.72, 2.06);
    m.decal(0.44, 0.14, 've_plate_van', 0, 0.42, 2.106);
    m.glow(1);
    m.sym(s => m.box(0.3, 0.16, 0.05, LAMP, s * 0.55, 0.78, 2.05));
    m.sym(s => m.box(0.12, 0.3, 0.04, TAIL, s * 0.72, 1.0, -2.08));
    m.glow(0);
    // rear: bumper, plate
    m.box(W, 0.16, 0.12, TRIM, 0, 0.42, -2.06);
    m.decal(0.44, 0.14, 've_plate_van', 0, 0.64, -2.078, 0, Math.PI, 0);
    // sliding-door track (right side = -X), seams, handles, mirrors
    m.box(0.02, 0.03, 1.5, 0x2a2a30, -0.815, 1.18, -1.2);
    m.sym(s => {
      for (const z of [1.55, 0.72, -0.5]) m.box(0.012, 0.86, 0.02, 0x2a2a30, s * 0.812, 0.76, z);
      m.box(0.02, 0.03, 0.14, 0x2a2a30, s * 0.815, 1.0, 0.9);
      rod(m, [s * 0.8, 1.2, 1.62], [s * 0.92, 1.26, 1.66], 0.015, TRIM);
      m.box(0.06, 0.16, 0.12, TRIM, s * 0.94, 1.28, 1.66);
    });
    m.box(0.02, 0.03, 0.14, 0x2a2a30, -0.815, 1.0, -0.35);
    // roof rack
    m.sym(s => {
      m.box(0.04, 0.04, 3.1, CHROME, s * 0.64, 1.9, -0.25);
      for (const z of [1.2, -0.25, -1.7]) m.box(0.05, 0.08, 0.05, TRIM, s * 0.64, 1.85, z);
    });
    for (const z of [0.9, -0.25, -1.4]) m.box(1.28, 0.03, 0.04, CHROME, 0, 1.9, z);
    for (const z of [1.3, -1.35]) m.sym(s => wheel(m, s * 0.7, z, 0.28, 0.19));
  },
});

// ---- 公交车 -------------------------------------------------------------------------------------
function ledGrid(ctx, w, h) {
  ctx.fillStyle = 'rgba(20,23,28,0.5)';
  for (let x = 0; x < w; x += 3) ctx.fillRect(x, 0, 1, h);
  for (let y = 0; y < h; y += 3) ctx.fillRect(0, y, w, 1);
}
decal('ve_bus_led', 256, 40, (ctx, w, h) => {
  ctx.fillStyle = '#14171c';
  ctx.fillRect(0, 0, w, h);
  fitText(ctx, '88路 幸福里', w / 2, h / 2, w - 16, h - 8, FONTS.sans, '#ffb020');
  ledGrid(ctx, w, h);
});
decal('ve_bus_num', 64, 40, (ctx, w, h) => {
  ctx.fillStyle = '#14171c';
  ctx.fillRect(0, 0, w, h);
  fitText(ctx, '88', w / 2, h / 2, w - 12, h - 6, FONTS.sans, '#ffb020');
  ledGrid(ctx, w, h);
});

def('bus', {
  name: '公交车',
  cat: 'vehicle',
  sfx: 'crash',
  fill: 0.6,
  mover: { kind: 'drive', speed: 7 },
  build(m) {
    const green = 0x3f9a4f, white = 0xf2f1ea, glass = 0x34506a, grey = 0xdfe2e4, dark = 0x2f3136, led = 0x14171c;
    const L = 11.8, W = 2.5, hz = L / 2, zF = 3.45, zR = -2.55;
    // white upper body, green lower body with wheel arches and wells
    m.rbox(W, 1.95, L, 0.16, white, 0, 2.1, 0);
    for (const [a, b] of [[hz, zF + 0.67], [zF - 0.67, zR + 0.67], [zR - 0.67, -hz]]) m.box(W, 0.9, a - b, green, 0, 0.75, (a + b) / 2);
    for (const z of [zF, zR]) {
      m.box(W, 0.2, 1.36, green, 0, 1.12, z);
      m.box(W - 0.3, 0.76, 1.32, dark, 0, 0.66, z);
    }
    m.box(W + 0.02, 0.2, L - 0.1, green, 0, 1.26, 0);
    // big side windows with white pillars, thin green stripe above
    m.sym(s => {
      m.glow(0.5);
      m.box(0.02, 1.15, 11.2, glass, s * 1.257, 1.98, 0);
      m.glow(0);
      m.box(0.02, 0.07, 11.4, green, s * 1.257, 2.6, 0);
      const pillars = s > 0 ? [-4.5, -3.1, -1.7, -0.3, 1.1, 2.5, 3.9, 5.0] : [-4.5, -3.1, -1.7, -0.36, 0.86, 2.1, 3.3, 4.2, 5.42];
      for (const z of pillars) m.box(0.03, 1.17, 0.14, white, s * 1.262, 1.98, z);
    });
    // doors on the kerb side (-X): glass leaves in a dark frame
    for (const z of [4.8, 0.25]) {
      m.box(0.028, 2.32, 1.2, dark, -1.259, 1.44, z);
      m.box(0.03, 2.22, 1.1, 0x2a3f55, -1.263, 1.43, z);
      m.box(0.034, 2.22, 0.03, 0xc9cdd2, -1.264, 1.43, z);
    }
    // side LED route sign
    m.box(0.03, 0.26, 1.5, led, -1.258, 2.83, 3.0);
    m.glow(1);
    sideDecal(m, -1, 1.44, 0.22, 've_bus_led', 1.275, 2.83, 3.0);
    m.glow(0);
    // front: big windscreen, LED sign, lamps, bumper, plate, wipers
    m.box(2.3, 1.58, 0.04, glass, 0, 1.86, hz + 0.01);
    m.box(0.05, 1.58, 0.05, dark, 0, 1.86, hz + 0.02);
    m.box(2.2, 0.3, 0.04, led, 0, 2.84, hz + 0.01);
    m.glow(1);
    m.decal(2.1, 0.27, 've_bus_led', 0, 2.84, hz + 0.032);
    m.sym(s => m.box(0.3, 0.14, 0.05, LAMP, s * 0.95, 0.62, hz + 0.01));
    m.sym(s => m.box(0.14, 0.1, 0.05, AMBER, s * 0.95, 0.8, hz + 0.01));
    m.glow(0);
    m.box(W - 0.04, 0.26, 0.12, dark, 0, 0.42, hz + 0.02);
    m.decal(0.44, 0.14, 've_plate_yellow', 0, 0.44, hz + 0.083);
    m.sym(s => m.box(0.9, 0.03, 0.03, dark, s * 0.5, 1.14, hz + 0.045, 0, 0, s * 0.12));
    // rabbit-ear mirrors
    m.sym(s => {
      m.tube([[s * 1.1, 3.0, hz - 0.1], [s * 1.33, 3.0, hz + 0.02], [s * 1.4, 2.78, hz + 0.08]], 0.03, dark, 5);
      m.box(0.09, 0.36, 0.2, dark, s * 1.4, 2.55, hz + 0.08);
    });
    // rear: window, route number, tail lamps, engine louvres, bumper, plate
    m.box(1.9, 0.6, 0.04, glass, 0, 2.25, -hz - 0.01);
    m.box(0.62, 0.28, 0.04, led, 0, 2.8, -hz - 0.01);
    m.glow(1);
    m.decal(0.56, 0.24, 've_bus_num', 0, 2.8, -hz - 0.032, 0, Math.PI, 0);
    m.sym(s => m.box(0.16, 0.5, 0.05, TAIL, s * 1.05, 1.0, -hz - 0.01));
    m.glow(0);
    for (let i = 0; i < 5; i++) m.box(1.4, 0.05, 0.03, dark, 0, 0.62 + i * 0.1, -hz - 0.01);
    m.box(W - 0.04, 0.24, 0.12, dark, 0, 0.42, -hz - 0.02);
    m.decal(0.44, 0.14, 've_plate_yellow', 0, 0.44, -hz - 0.083, 0, Math.PI, 0);
    // roof: air-conditioning pod and hatches
    m.rbox(1.8, 0.26, 3.2, 0.08, grey, 0, 3.2, 0.8);
    m.box(0.7, 0.06, 0.7, grey, 0, 3.1, -3.0);
    m.box(0.7, 0.06, 0.7, grey, 0, 3.1, 4.2);
    m.sym(s => wheel(m, s * 1.07, zF, 0.5, 0.3));
    m.sym(s => wheel(m, s * 1.0, zR, 0.5, 0.44));
  },
});

// ---- 卡车 ---------------------------------------------------------------------------------------
decal('ve_truck_side', 256, 64, (ctx, w, h) => {
  ctx.fillStyle = '#2f63c9';
  ctx.fillRect(8, h - 12, w - 16, 5);
  fitText(ctx, '幸福物流', w / 2, h / 2 - 6, w - 40, h - 26, FONTS.sans, '#2f63c9');
});
decal('ve_reflect', 128, 16, (ctx, w, h) => {
  for (let x = 0; x < w; x += 16) {
    ctx.fillStyle = (x / 16) % 2 ? '#f4f2ec' : '#d8342c';
    ctx.fillRect(x, 0, 16, h);
  }
});

def('truck', {
  name: '卡车',
  cat: 'vehicle',
  sfx: 'crash',
  fill: 0.6,
  mover: { kind: 'drive', speed: 7 },
  build(m) {
    const blue = 0x2f63c9, boxc = 0xe6e8ea, rib = 0xc3c8ce, dark = 0x2f3136, steel = 0x8a8f96, W = 2.5;
    m.sym(s => m.box(0.2, 0.3, 8.4, dark, s * 0.5, 0.95, -0.2));
    // blue cab-over cab with roof deflector
    m.rbox(2.4, 2.1, 2.05, 0.14, blue, 0, 1.95, 3.375);
    m.wedge(1.5, 0.52, 2.2, blue, 0, 3.24, 3.2, 0, -90 * D, 0);
    m.box(2.2, 0.85, 0.04, GLASS, 0, 2.38, 4.405);
    m.box(2.3, 0.07, 0.28, shade(blue, 0.85), 0, 2.88, 4.48, -10 * D, 0, 0);
    m.box(1.8, 0.46, 0.04, 0x26262c, 0, 1.45, 4.41);
    for (let i = 0; i < 3; i++) m.box(1.7, 0.04, 0.03, CHROME, 0, 1.3 + i * 0.15, 4.43);
    m.box(2.44, 0.4, 0.2, steel, 0, 0.75, 4.4);
    m.decal(0.44, 0.14, 've_plate_yellow', 0, 0.72, 4.503);
    m.glow(1);
    m.sym(s => m.box(0.34, 0.16, 0.04, LAMP, s * 0.85, 0.8, 4.5));
    m.sym(s => m.box(0.14, 0.08, 0.04, AMBER, s * 1.1, 1.0, 4.42));
    m.glow(0);
    m.box(2.42, 0.75, 0.95, GLASS, 0, 2.4, 3.85);
    m.sym(s => {
      m.box(0.012, 1.45, 0.02, 0x1f3f8a, s * 1.205, 1.75, 3.33);
      m.box(0.3, 0.06, 0.5, dark, s * 1.1, 0.62, 3.9);
      beam(m, [s * 1.18, 2.75, 4.15], [s * 1.36, 2.65, 4.3], 0.05, 0.05, dark);
      m.box(0.08, 0.5, 0.25, dark, s * 1.39, 2.4, 4.3);
    });
    // cargo box with ribs, corner posts, rails and lettering
    const bz0 = -4.5, bz1 = 2.2, bl = bz1 - bz0, bzc = (bz0 + bz1) / 2;
    m.box(W, 2.4, bl, boxc, 0, 2.35, bzc);
    m.sym(s => {
      for (const z of [bz0 + 0.04, bz1 - 0.04]) m.box(0.1, 2.44, 0.1, rib, s * 1.22, 2.35, z);
      m.box(0.06, 0.1, bl, rib, s * 1.24, 3.52, bzc);
      m.box(0.08, 0.16, bl, steel, s * 1.24, 1.2, bzc);
      for (let i = 1; i < 8; i++) m.box(0.03, 2.3, 0.08, rib, s * 1.26, 2.35, bz0 + (i * bl) / 8);
      sideDecal(m, s, 3.2, 0.8, 've_truck_side', 1.278, 2.45, bzc);
    });
    // rear doors, lock bars, reflective tape, lamps, plate, under-run bar
    m.box(0.03, 2.3, 0.02, rib, 0, 2.35, bz0 - 0.01);
    for (const x of [-0.6, 0.6]) m.box(0.04, 2.3, 0.04, CHROME, x, 2.35, bz0 - 0.03);
    m.decal(2.4, 0.14, 've_reflect', 0, 1.33, bz0 - 0.053, 0, Math.PI, 0);
    m.box(2.36, 0.2, 0.1, dark, 0, 0.92, bz0 + 0.1);
    m.glow(1);
    m.sym(s => {
      m.box(0.3, 0.12, 0.05, TAIL, s * 0.8, 0.92, bz0 + 0.04);
      m.box(0.12, 0.12, 0.05, AMBER, s * 1.08, 0.92, bz0 + 0.04);
    });
    m.glow(0);
    m.box(2.3, 0.16, 0.1, dark, 0, 0.55, bz0 + 0.15);
    m.decal(0.44, 0.14, 've_plate_yellow', 0, 0.92, bz0 + 0.048, 0, Math.PI, 0);
    // wheels, mudguards, side guards, fuel tank
    m.sym(s => wheel(m, s * 1.02, 3.35, 0.5, 0.3, HUB, false));
    for (const z of [-2.35, -3.55]) m.sym(s => wheel(m, s * 0.98, z, 0.5, 0.46, HUB, false));
    m.sym(s => {
      m.box(0.56, 0.05, 2.5, dark, s * 0.98, 1.08, -2.95);
      m.box(0.5, 0.45, 0.03, dark, s * 0.98, 0.5, -4.2);
      for (const y of [0.5, 0.78]) m.box(0.04, 0.06, 4.5, CHROME, s * 1.2, y, 0.5);
    });
    m.cyl(0.3, 0.3, 1.1, CHROME, 0.85, 0.75, 1.4, 90 * D, 0, 0, 8);
    m.box(0.6, 0.45, 0.6, dark, -0.85, 0.75, 1.4);
  },
});

// ---- 洒水车 -------------------------------------------------------------------------------------
decal('ve_sprinkler', 160, 40, (ctx, w, h) => {
  fitText(ctx, '洒水车', w / 2, h / 2, w - 10, h - 6, FONTS.sans, '#f7f5ee');
});

def('sprinkler_truck', {
  name: '洒水车',
  cat: 'vehicle',
  sfx: 'crash',
  fill: 0.5,
  mover: { kind: 'drive', speed: 5 },
  build(m) {
    const green = 0x3f9a4f, cab = 0xf0efe8, dark = 0x2f3136, steel = 0x8a8f96;
    m.sym(s => m.box(0.2, 0.3, 7.6, dark, s * 0.5, 0.95, -0.1));
    // white cab with a green band and an amber beacon bar
    m.rbox(2.35, 2.0, 1.9, 0.14, cab, 0, 1.9, 3.0);
    m.box(2.37, 0.2, 1.92, green, 0, 1.35, 3.0);
    m.box(2.15, 0.8, 0.04, GLASS, 0, 2.3, 3.955);
    m.box(2.37, 0.7, 0.9, GLASS, 0, 2.35, 3.4);
    m.box(1.7, 0.28, 0.04, 0x26262c, 0, 1.08, 3.96);
    m.box(2.35, 0.35, 0.18, steel, 0, 0.72, 3.93);
    m.decal(0.44, 0.14, 've_plate_yellow', 0, 0.72, 4.023);
    m.glow(1);
    m.sym(s => m.box(0.32, 0.15, 0.04, LAMP, s * 0.82, 1.05, 3.96));
    m.box(1.3, 0.12, 0.3, AMBER, 0, 2.96, 3.0);
    m.glow(0);
    m.sym(s => {
      rod(m, [s * 1.15, 2.6, 3.7], [s * 1.33, 2.55, 3.85], 0.03, dark);
      m.box(0.08, 0.45, 0.22, dark, s * 1.36, 2.35, 3.85);
    });
    // pump box between cab and tank, subframe
    m.box(1.8, 0.9, 0.35, steel, 0, 1.55, 1.9);
    m.box(1.1, 0.2, 5.6, dark, 0, 1.12, -1.0);
    // elliptical green water tank with darker hoops (rotated so its flanks are flat for the lettering)
    const tz0 = -3.75, tz1 = 1.75, tl = tz1 - tz0, tc = (tz0 + tz1) / 2, ty = 2.0;
    m.push(0, ty, 0, 0, 0, 0, [1.2, 0.85, 1]);
    m.cyl(1, 1, tl, green, 0, 0, tc, 90 * D, 15 * D, 0, 12);
    m.dome(1, green, 0, 0, tz0, 1, 0.3, 1, -90 * D, 15 * D, 0, 12);
    m.dome(1, green, 0, 0, tz1, 1, 0.3, 1, 90 * D, 15 * D, 0, 12);
    for (const z of [-2.6, -0.95, 0.7]) m.cyl(1.03, 1.03, 0.1, shade(green, 0.8), 0, 0, z, 90 * D, 15 * D, 0, 12);
    m.pop();
    m.sym(s => sideDecal(m, s, 1.8, 0.36, 've_sprinkler', 1.172, ty, -1.78));
    // manhole, water cannon, rear ladder
    m.cyl(0.3, 0.3, 0.12, steel, 0, 2.88, 0.6, 0, 0, 0, 10);
    m.cyl(0.14, 0.18, 0.25, steel, 0, 2.94, -3.2, 0, 0, 0, 8);
    rod(m, [0, 3.0, -3.2], [0, 3.28, -3.72], 0.05, steel);
    for (const x of [-0.8, -0.45]) m.box(0.04, 1.5, 0.04, steel, x, 1.95, -4.02);
    for (let i = 0; i < 5; i++) m.box(0.35, 0.03, 0.03, steel, -0.625, 1.35 + i * 0.3, -4.02);
    // rear spray bar with nozzles, lamps, plate
    rod(m, [-1.0, 0.62, -3.95], [1.0, 0.62, -3.95], 0.05, CHROME);
    for (const x of [-0.8, 0, 0.8]) m.cone(0.06, 0.14, CHROME, x, 0.56, -4.02, -120 * D, 0, 0, 6);
    m.box(2.2, 0.18, 0.1, dark, 0, 0.9, -3.9);
    m.decal(2.0, 0.1, 've_reflect', 0, 0.9, -3.951, 0, Math.PI, 0);
    m.glow(1);
    m.sym(s => m.box(0.24, 0.14, 0.05, TAIL, s * 0.95, 1.07, -3.9));
    m.glow(0);
    m.decal(0.44, 0.14, 've_plate_yellow', 0, 1.07, -3.953, 0, Math.PI, 0);
    // wheels + mudguards
    m.sym(s => wheel(m, s * 1.0, 2.9, 0.48, 0.3, HUB, false));
    m.sym(s => wheel(m, s * 0.98, -2.0, 0.48, 0.46, HUB, false));
    m.sym(s => m.box(0.56, 0.05, 1.3, dark, s * 0.98, 1.04, -2.0));
  },
});

// ---- 消防车 -------------------------------------------------------------------------------------
decal('ve_fire_door', 96, 48, (ctx, w, h) => {
  fitText(ctx, '消防', w / 2, h / 2, w - 8, h - 6, FONTS.sans, '#f7f5ee');
});
decal('ve_fire_119', 96, 40, (ctx, w, h) => {
  fitText(ctx, '119', w / 2, h / 2, w - 8, h - 6, FONTS.sans, '#f7f5ee');
});
decal('ve_shutter', 64, 64, (ctx, w, h) => {
  ctx.fillStyle = '#c9ced4';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#a4aab2';
  for (let y = 3; y < h - 6; y += 5) ctx.fillRect(0, y, w, 2);
  ctx.fillStyle = '#5b6069';
  ctx.fillRect(w / 2 - 12, h - 7, 24, 4);
  ctx.strokeStyle = '#8a9098';
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, w - 2, h - 2);
});

def('fire_truck', {
  name: '消防车',
  cat: 'vehicle',
  sfx: 'crash',
  fill: 0.55,
  mover: { kind: 'drive', speed: 8 },
  build(m) {
    const red = 0xd8342c, white = 0xf4f2ec, dark = 0x2f3136, alu = 0xd3d7dc;
    m.sym(s => m.box(0.2, 0.3, 8.6, dark, s * 0.5, 0.95, -0.1));
    // crew cab
    m.rbox(2.45, 2.05, 2.3, 0.14, red, 0, 1.95, 3.3);
    m.box(2.2, 0.8, 0.04, GLASS, 0, 2.45, 4.455);
    m.box(2.47, 0.62, 2.0, GLASS, 0, 2.45, 3.3);
    m.box(2.49, 0.66, 0.1, red, 0, 2.45, 3.3);
    m.box(2.47, 0.12, 2.32, white, 0, 1.25, 3.3);
    m.box(1.6, 0.4, 0.04, 0x26262c, 0, 1.55, 4.46);
    for (let i = 0; i < 3; i++) m.box(1.5, 0.04, 0.03, CHROME, 0, 1.43 + i * 0.12, 4.48);
    m.decal(0.42, 0.14, 've_fire_119', 0, 1.9, 4.451);
    m.box(2.45, 0.35, 0.2, alu, 0, 0.72, 4.45);
    m.decal(0.44, 0.14, 've_plate_yellow', 0, 0.72, 4.553);
    m.glow(1);
    m.sym(s => m.box(0.3, 0.14, 0.04, LAMP, s * 0.85, 1.05, 4.46));
    m.box(0.7, 0.14, 0.3, 0xe8303a, -0.36, 3.05, 3.9);
    m.box(0.7, 0.14, 0.3, 0x3a6ee8, 0.36, 3.05, 3.9);
    m.glow(0);
    m.sym(s => {
      sideDecal(m, s, 0.62, 0.3, 've_fire_door', 1.227, 1.72, 3.85);
      rod(m, [s * 1.2, 2.65, 4.2], [s * 1.36, 2.6, 4.35], 0.03, dark);
      m.box(0.08, 0.45, 0.22, dark, s * 1.39, 2.4, 4.35);
    });
    // equipment body with roller shutters, white stripe, alu roof walkway
    m.box(2.45, 1.9, 6.6, red, 0, 1.9, -1.15);
    m.box(2.47, 0.12, 6.6, white, 0, 1.25, -1.15);
    m.sym(s => {
      for (const z of [1.05, -0.95, -2.95]) sideDecal(m, s, 1.8, 1.3, 've_shutter', 1.227, 2.08, z);
    });
    m.box(2.3, 0.08, 6.4, alu, 0, 2.89, -1.2);
    // turntable + ladder resting over the cab
    m.cyl(0.75, 0.8, 0.25, dark, 0, 3.05, -3.3, 0, 0, 0, 12);
    m.box(1.1, 0.35, 1.3, red, 0, 3.35, -3.3);
    m.box(1.2, 0.5, 0.12, dark, 0, 3.22, 3.7);
    m.sym(s => m.box(0.1, 0.18, 8.1, alu, s * 0.45, 3.56, 0.15));
    m.sym(s => m.box(0.08, 0.14, 6.6, alu, s * 0.36, 3.72, 0.6));
    for (let z = -3.7; z <= 4.05; z += 0.35) m.box(0.82, 0.05, 0.05, alu, 0, 3.56, z);
    // rear panel, lamps, reflective tape, plate
    m.box(2.3, 1.5, 0.04, alu, 0, 1.95, -4.46);
    m.decal(2.2, 0.12, 've_reflect', 0, 1.1, -4.482, 0, Math.PI, 0);
    m.glow(1);
    m.sym(s => m.box(0.24, 0.3, 0.05, TAIL, s * 1.0, 1.4, -4.47));
    m.glow(0);
    m.decal(0.44, 0.14, 've_plate_yellow', 0, 0.75, -4.453, 0, Math.PI, 0);
    m.box(2.2, 0.16, 0.1, dark, 0, 0.55, -4.3);
    m.sym(s => wheel(m, s * 1.03, 3.35, 0.5, 0.3, HUB, false));
    for (const z of [-1.95, -3.25]) m.sym(s => wheel(m, s * 0.99, z, 0.5, 0.46, HUB, false));
  },
});

// ---- 挖掘机 -------------------------------------------------------------------------------------
decal('ve_hazard', 128, 32, (ctx, w, h) => {
  ctx.fillStyle = '#f2b62e';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#26262c';
  for (let x = -h; x < w + h; x += 24) {
    ctx.beginPath();
    ctx.moveTo(x, h);
    ctx.lineTo(x + 12, h);
    ctx.lineTo(x + 12 + h, 0);
    ctx.lineTo(x + h, 0);
    ctx.closePath();
    ctx.fill();
  }
});
decal('ve_exc_brand', 160, 36, (ctx, w, h) => {
  fitText(ctx, '滚滚重工', w / 2, h / 2, w - 8, h - 6, FONTS.sans, '#26262c');
});

def('excavator', {
  name: '挖掘机',
  cat: 'vehicle',
  sfx: 'crash',
  fill: 0.3,
  build(m) {
    const yel = 0xf6bf2e, dark = 0x34363c, grey = 0x6b6f76, steel = 0x4a4d55, rodc = 0xd8dce0;
    m.push(0, 0, -1.6); // modelled with the machine centre at z = 0; shift so the whole bbox is centred
    // crawler tracks with idlers, rollers and grousers
    const track = [[-2.15, 0.15], [-1.9, 0], [1.9, 0], [2.15, 0.15], [2.1, 0.62], [1.85, 0.85], [-1.85, 0.85], [-2.1, 0.62]];
    m.sym(s => {
      m.extrude(track, 0.6, dark, s * 1.1, 0, 0, 0, -90 * D, 0);
      for (const z of [-1.75, 1.75]) m.cyl(0.3, 0.3, 0.64, grey, s * 1.1, 0.45, z, 0, 0, 90 * D, 8);
      for (let i = 0; i < 5; i++) m.cyl(0.13, 0.13, 0.64, grey, s * 1.1, 0.2, -1.2 + i * 0.6, 0, 0, 90 * D, 6);
      for (let i = 0; i < 11; i++) m.box(0.62, 0.05, 0.12, 0x2a2b30, s * 1.1, 0.87, -1.6 + i * 0.32);
    });
    m.box(1.6, 0.5, 2.8, dark, 0, 0.55, 0);
    m.cyl(1.0, 1.0, 0.22, steel, 0, 0.99, 0, 0, 0, 0, 12);
    // upper house: deck, counterweight with hazard stripes, engine hood, exhaust, toolbox
    m.box(2.7, 0.25, 3.6, yel, 0, 1.22, -0.35);
    m.rbox(2.7, 1.0, 0.9, 0.25, yel, 0, 1.8, -2.0);
    m.decal(2.1, 0.28, 've_hazard', 0, 1.8, -2.452, 0, Math.PI, 0);
    m.box(1.5, 0.75, 1.3, yel, -0.55, 1.72, -0.95);
    m.box(1.3, 0.05, 0.9, 0x2a2b30, -0.55, 2.1, -0.95);
    m.cyl(0.06, 0.06, 0.5, dark, -0.95, 2.3, -0.6, 0, 0, 0, 6);
    m.box(1.0, 0.7, 1.3, yel, -0.85, 1.7, 0.75);
    // cab on the left front, lots of glass, beacon and work light
    m.box(1.05, 1.7, 1.6, yel, 0.825, 2.195, 0.6);
    m.box(1.12, 0.08, 1.72, yel, 0.825, 3.08, 0.62);
    m.box(0.9, 1.15, 0.03, GLASS, 0.825, 2.35, 1.41);
    m.box(0.03, 1.05, 1.35, GLASS, 1.36, 2.4, 0.6);
    m.box(0.03, 0.9, 1.2, GLASS, 0.29, 2.45, 0.55);
    m.glow(1);
    m.cyl(0.07, 0.07, 0.12, AMBER, 0.55, 3.18, 0.1, 0, 0, 0, 6);
    m.box(0.16, 0.1, 0.08, LAMP, 1.15, 3.0, 1.44);
    m.glow(0);
    // boom, stick and bucket (profiles in the z-y plane, extruded across x)
    const boom = [[0.945, 1.317], [1.333, 1.395], [2.705, 3.354], [4.255, 3.816], [4.434, 4.105], [4.145, 4.284], [2.295, 3.946], [0.867, 1.705]];
    m.extrude(boom, 0.5, yel, -0.05, 0, 0, 0, -90 * D, 0);
    m.sym(s => m.decal(1.3, 0.28, 've_exc_brand', -0.05 + s * 0.252, 2.6, 1.8, 0, s * 90 * D, -s * 56.3 * D));
    m.extrude([[4.211, 4.513], [3.789, 4.387], [4.787, 1.202], [5.113, 1.298]], 0.4, yel, -0.05, 0, 0, 0, -90 * D, 0);
    m.extrude([[4.78, 1.36], [5.18, 1.42], [5.5, 1.15], [5.62, 0.72], [5.5, 0.32], [5.2, 0.12], [4.72, 0.08], [4.64, 0.3], [4.95, 0.45], [4.85, 0.95]], 1.0, 0xe0a526, -0.05, 0, 0, 0, -90 * D, 0);
    for (let i = 0; i < 5; i++) m.box(0.1, 0.07, 0.2, dark, -0.45 + i * 0.2, 0.1, 4.64, 0.2, 0, 0);
    // hydraulic cylinders: dark barrels, chrome rods
    m.sym(s => {
      const x = -0.05 + s * 0.33;
      rod(m, [x, 1.4, 1.35], [x, 2.31, 1.98], 0.1, steel, 8);
      rod(m, [x, 2.24, 1.93], [x, 2.92, 2.4], 0.055, rodc, 6);
    });
    rod(m, [-0.05, 3.55, 2.0], [-0.05, 4.09, 3.11], 0.1, steel, 8);
    rod(m, [-0.05, 4.045, 3.02], [-0.05, 4.45, 3.85], 0.055, rodc, 6);
    rod(m, [-0.05, 4.045, 3.807], [-0.05, 2.605, 4.235], 0.085, steel, 8);
    rod(m, [-0.05, 2.725, 4.199], [-0.05, 1.645, 4.52], 0.05, rodc, 6);
    m.sym(s => beam(m, [-0.05 + s * 0.22, 1.645, 4.52], [-0.05 + s * 0.22, 1.32, 4.95], 0.06, 0.12, dark));
    m.pop();
  },
});

// ---- 天鹅船 -------------------------------------------------------------------------------------
decal('ve_boat_no', 48, 48, (ctx, w, h) => {
  ctx.fillStyle = '#f7f5ee';
  ctx.beginPath();
  ctx.arc(w / 2, h / 2, w / 2 - 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#4a90c8';
  ctx.lineWidth = 4;
  ctx.stroke();
  fitText(ctx, '08', w / 2, h / 2 + 1, w - 18, h - 20, FONTS.round, '#2f63c9');
});

def('boat_swan', {
  name: '天鹅船',
  cat: 'vehicle',
  sfx: 'crash',
  fill: 0.35,
  mover: { kind: 'swim', speed: 1 },
  build(m) {
    const white = 0xf6f4ee, feather = 0xe1e8ef, beak = 0xf08a3a, dark = 0x2a1d17, rim = 0x4a90c8, seat = 0x5aa9e6;
    // hull (lathe stretched along z) with a blue rubber fender ring
    m.push(0, 0, -0.04, 0, 0, 0, [1, 1, 1.48]);
    m.lathe([[0, 0], [0.42, 0], [0.6, 0.06], [0.7, 0.2], [0.73, 0.34], [0.7, 0.46], [0.62, 0.5], [0, 0.5]], white, 0, 0, 0, 0, 0, 0, 14);
    m.torus(0.715, 0.05, rim, 0, 0.4, 0, 90 * D, 0, 0, Math.PI * 2, 4, 16);
    m.pop();
    // cockpit: floor mat, bench with backrest, little steering wheel
    m.box(0.8, 0.02, 0.62, 0x9fd0ef, 0, 0.51, 0.12);
    m.box(0.9, 0.2, 0.42, white, 0, 0.6, -0.32);
    m.box(0.96, 0.08, 0.44, seat, 0, 0.73, -0.32);
    m.box(0.96, 0.42, 0.08, seat, 0, 0.95, -0.55, -8 * D, 0, 0);
    rod(m, [0, 0.5, 0.42], [0, 0.82, 0.3], 0.025, 0x3a3d44);
    m.torus(0.1, 0.018, 0x3a3d44, 0, 0.84, 0.29, -60 * D, 0, 0, Math.PI * 2, 4, 10);
    // raised wings with a feather layer and the boat number
    const wing = [[0.55, 0], [0.3, 0.2], [-0.1, 0.42], [-0.55, 0.6], [-0.95, 0.66], [-1.02, 0.5], [-0.86, 0.46], [-1.02, 0.34], [-0.86, 0.28], [-0.98, 0.14], [-0.8, 0.06], [-0.85, 0]];
    m.sym(s => {
      m.push(s * 0.6, 0.45, 0, 0, 0, -s * 12 * D);
      m.extrude(wing, 0.08, white, 0, 0, 0, 0, -90 * D, 0);
      m.extrude(wing.map(([z, y]) => [z * 0.8 - 0.12, y * 0.75 + 0.04]), 0.04, feather, s * 0.05, 0, 0, 0, -90 * D, 0);
      m.decal(0.22, 0.22, 've_boat_no', s * 0.072, 0.25, -0.3, 0, s * 90 * D, 0);
      m.pop();
    });
    // tail
    m.cone(0.18, 0.45, white, 0, 0.66, -1.04, -58 * D, 0, 0, 8);
    // S-curved neck, head, orange beak with the black knob, eyes and blush
    taperTube(m, [[0, 0.4, 0.74], [0, 0.78, 0.95], [0, 1.12, 0.93], [0, 1.42, 0.81], [0, 1.64, 0.77], [0, 1.76, 0.85]], [0.28, 0.22, 0.17, 0.145, 0.135, 0.125], white, 8);
    m.sphere(0.17, white, 0, 1.79, 0.92, 1, 0.92, 1.22, 0, 0, 0, 10);
    m.cone(0.07, 0.21, beak, 0, 1.75, 1.18, 100 * D, 0, 0, 8);
    m.sphere(0.045, dark, 0, 1.79, 1.12, 1, 1, 1, 0, 0, 0, 6);
    m.sym(s => {
      m.sphere(0.028, dark, s * 0.148, 1.82, 1.0, 1, 1.2, 0.7, 0, 0, 0, 6);
      m.sphere(0.034, 0xf6b3b9, s * 0.152, 1.735, 0.97, 0.6, 0.7, 0.9, 0, 0, 0, 6);
    });
  },
});

// ---- 高铁 (one object: 8 cars, ≈ 200 m) -----------------------------------------------------------
decal('ve_train_win', 256, 20, (ctx, w, h) => {
  ctx.fillStyle = '#26303c';
  const n = 8, pitch = w / n;
  for (let i = 0; i < n; i++) ctx.fillRect(i * pitch + 5, 2, pitch - 10, h - 4);
});
decal('ve_train_door', 24, 56, (ctx, w, h) => {
  ctx.strokeStyle = '#8a9098';
  ctx.lineWidth = 2;
  ctx.strokeRect(2, 2, w - 4, h - 4);
  ctx.fillStyle = '#26303c';
  ctx.fillRect(7, 8, w - 14, 15);
});

const TR_WHITE = 0xf4f2ec, TR_BLUE = 0x2c62c9, TR_UNDER = 0x3a3d44, TR_GLASS = 0x1f2a38, TR_CAP = 0xe2e0da;
// half cross-section (x >= 0) from the underfloor centre up the side to the roof centre
const TR_HALF = [[0, 0.95], [1.3, 0.95], [1.47, 0.62], [1.62, 0.7], [1.69, 1.05], [1.7, 1.3], [1.7, 1.74], [1.7, 3.15], [1.58, 3.62], [1.25, 3.93], [0.65, 4.07], [0, 4.1]];
// nose profile: [t along the nose, roof height, skirt height, width scale]
const TR_NOSE = [[0, 4.1, 0.62, 1], [0.08, 4.07, 0.62, 1], [0.18, 3.92, 0.62, 0.99], [0.3, 3.58, 0.63, 0.97], [0.42, 3.15, 0.65, 0.93],
  [0.54, 2.76, 0.68, 0.87], [0.66, 2.4, 0.72, 0.78], [0.77, 2.08, 0.78, 0.67], [0.86, 1.82, 0.86, 0.53], [0.93, 1.62, 0.95, 0.38],
  [0.975, 1.47, 1.04, 0.25], [1, 1.34, 1.12, 0.12]];

function trainRing(z, sw = 1, yb = 0.62, yt = 4.1) {
  const k = (yt - yb) / (4.1 - 0.62);
  const H = TR_HALF.map(([x, y]) => [x * sw, yb + (y - 0.62) * k, z]);
  const R = H.slice();
  for (let i = H.length - 2; i >= 1; i--) R.push([-H[i][0], H[i][1], z]);
  return R;
}
function trainColor(i, cab) {
  const k = i <= 10 ? i : 21 - i;
  if (k <= 2) return TR_UNDER;
  if (k === 5) return TR_BLUE;
  if (cab && k >= 7) return TR_GLASS;
  return TR_WHITE;
}
function noseAt(t) {
  for (let i = 1; i < TR_NOSE.length; i++) {
    if (t <= TR_NOSE[i][0]) {
      const a = TR_NOSE[i - 1], b = TR_NOSE[i], u = (t - a[0]) / (b[0] - a[0]);
      return [a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u, a[3] + (b[3] - a[3]) * u];
    }
  }
  return TR_NOSE[TR_NOSE.length - 1].slice(1);
}
/** Streamlined nose from z0 (joins the car body) to the tip at z0 + len, with a wrap-around cab window. */
function trainNose(m, z0, len, lampCol) {
  const rings = TR_NOSE.map(([t, yt, yb, sw]) => trainRing(z0 + t * len, sw, yb, yt));
  loft(m, rings, (i, j) => trainColor(i, j === 2 || j === 3), null, TR_WHITE);
  const [yt, yb, sw] = noseAt(0.83);
  const y = yb + (1.95 - 0.62) * (yt - yb) / 3.48, x = 1.7 * sw, z = z0 + 0.83 * len;
  m.sym(s => m.ellipsoid(0.1, 0.15, 0.78, TR_GLASS, s * (x - 0.05), y, z, 0, -s * 13 * D, 0, 6));
  m.glow(1);
  m.sym(s => m.ellipsoid(0.08, 0.09, 0.46, lampCol, s * (x - 0.02), y, z + 0.08, 0, -s * 13 * D, 0, 6));
  m.glow(0);
}
function trainBogie(m, z) {
  m.box(2.3, 0.4, 3.4, 0x2f3136, 0, 0.64, z);
  for (const dz of [-1.25, 1.25]) m.sym(s => m.cyl(0.46, 0.46, 0.14, 0x55585e, s * 0.745, 0.46, z + dz, 0, 0, 90 * D, 8));
}
function pantograph(m, z) {
  const arm = 0xa9aeb5;
  m.box(1.6, 0.14, 3.0, 0x6b6f76, 0, 4.14, z);
  for (const dz of [-0.6, 0.6]) m.sym(s => m.cyl(0.06, 0.06, 0.26, 0x8a4b36, s * 0.5, 4.33, z + dz, 0, 0, 0, 6));
  m.box(1.2, 0.06, 1.4, 0x3a3d44, 0, 4.47, z);
  beam(m, [0, 4.5, z + 0.5], [0, 4.95, z - 0.5], 0.08, 0.08, arm);
  beam(m, [0, 4.95, z - 0.5], [0, 5.25, z + 0.25], 0.06, 0.06, arm);
  m.box(1.5, 0.05, 0.2, arm, 0, 5.28, z + 0.25);
}
/** Windows (strips of 8) and doors on both sides of a straight car section. */
function trainSides(m, winFrom, winTo, strips, doors) {
  const len = (winTo - winFrom) / strips;
  m.sym(s => {
    for (let i = 0; i < strips; i++) sideDecal(m, s, len, 0.62, 've_train_win', 1.712, 2.45, winFrom + (i + 0.5) * len);
    for (const z of doors) sideDecal(m, s, 0.9, 2.0, 've_train_door', 1.712, 2.1, z);
  });
}

def('bullet_train', {
  name: '高铁',
  cat: 'vehicle',
  sfx: 'horn',
  fill: 0.65,
  mover: { kind: 'drive', speed: 40 },
  build(m) {
    const CAR = 25, N = 8, half = (CAR * N) / 2, gap = 0.25, NOSE = 12;
    for (let c = 0; c < N; c++) {
      const za = -half + c * CAR + gap, zb = -half + (c + 1) * CAR - gap, zc = (za + zb) / 2;
      if (c === N - 1) {
        loft(m, [trainRing(za), trainRing(half - NOSE)], i => trainColor(i, false), TR_CAP, null);
        trainNose(m, half - NOSE, NOSE, LAMP);
        trainSides(m, za + 2.2, half - NOSE - 0.3, 1, [za + 1.3]);
        trainBogie(m, half - 8.5);
        trainBogie(m, half - 22);
      } else if (c === 0) {
        loft(m, [trainRing(-half + NOSE), trainRing(zb)], i => trainColor(i, false), null, TR_CAP);
        m.push(0, 0, 0, 0, 0, 0, [1, 1, -1]);
        trainNose(m, half - NOSE, NOSE, TAIL);
        m.pop();
        trainSides(m, -half + NOSE + 0.3, zb - 2.2, 1, [zb - 1.3]);
        trainBogie(m, -half + 8.5);
        trainBogie(m, -half + 22);
      } else {
        loft(m, [trainRing(za), trainRing(zb)], i => trainColor(i, false), TR_CAP, TR_CAP);
        trainSides(m, za + 2.2, zb - 2.2, 2, [za + 1.3, zb - 1.3]);
        trainBogie(m, zc - 8.75);
        trainBogie(m, zc + 8.75);
      }
      if (c === 2 || c === 5) pantograph(m, zc + (c === 2 ? 6 : -6));
      if (c < N - 1) m.box(2.9, 3.0, 0.7, TR_UNDER, 0, 2.4, zb + gap);
    }
  },
});

// ---- 高铁桥墩段 (tiles along Z: deck spans exactly z = -16 … +16) ---------------------------------
decal('ve_pier_no', 64, 32, (ctx, w, h) => {
  ctx.fillStyle = '#f2f1ea';
  ctx.fillRect(0, 0, w, h);
  fitText(ctx, '128#', w / 2, h / 2, w - 8, h - 6, FONTS.sans, '#26262c');
});
decal('ve_slab', 32, 64, (ctx, w, h) => {
  ctx.fillStyle = '#5b6069';
  for (let y = 2; y < h - 2; y += 6.4) {
    ctx.fillRect(4, y, 5, 3);
    ctx.fillRect(w - 9, y, 5, 3);
  }
});

def('viaduct', {
  name: '高铁桥墩段',
  cat: 'vehicle',
  sfx: 'rumble',
  fill: 0.2,
  build(m) {
    const con = 0xcdc8bc, conDark = 0xa9a498, pier = 0xc2bdb1, steel = 0x9aa0a6, rail = 0x8a8f96;
    const L = 32, top = 12;
    // footing, round-ended pier shaft (darker at the base), flared cap, bearings
    m.box(6.6, 0.4, 3.2, 0xb3aea2, 0, 0.2, 0);
    const outline = [];
    for (let i = 0; i <= 6; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 6; outline.push([1.4 + 1.1 * Math.cos(a), 1.1 * Math.sin(a)]); }
    for (let i = 0; i <= 6; i++) { const a = Math.PI / 2 + (i * Math.PI) / 6; outline.push([-1.4 + 1.1 * Math.cos(a), 1.1 * Math.sin(a)]); }
    m.extrude(outline, 7.6, (x, y) => (y < 4 ? 0xaaa598 : pier), 0, 4.2, 0, -90 * D, 0, 0);
    m.extrude([[-2.5, 0], [2.5, 0], [3.2, 0.55], [3.2, 0.75], [-3.2, 0.75], [-3.2, 0.55]], 2.6, pier, 0, 8.0, 0);
    for (const x of [-1.8, 1.8]) for (const z of [-0.7, 0.7]) m.box(0.6, 0.2, 0.5, 0x5b6069, x, 8.85, z);
    m.decal(1.2, 0.6, 've_pier_no', 0, 3.2, 1.113);
    m.cyl(0.08, 0.08, 8.3, 0x7d828a, -1.0, 4.55, 1.18, 0, 0, 0, 6);
    // box-girder deck (darker underneath), parapets, cable-trough walls
    m.extrude([[-6, 12], [-6, 11.72], [-3.4, 11.35], [-2.75, 8.95], [2.75, 8.95], [3.4, 11.35], [6, 11.72], [6, 12]], L, (x, y) => (y < 10 ? conDark : con), 0, 0, 0);
    m.sym(s => {
      m.box(0.22, 0.9, L, con, s * 5.89, top + 0.45, 0);
      m.box(0.15, 0.35, L, con, s * 4.35, top + 0.175, 0);
    });
    // two ballastless tracks: base, precast slabs with fastener marks, rails
    for (const xt of [-2.5, 2.5]) {
      m.box(3.2, 0.25, L, 0xbfbaae, xt, top + 0.125, 0);
      for (let i = 0; i < 5; i++) {
        const zc = -L / 2 + 3.2 + i * 6.4;
        m.box(2.5, 0.2, 6.2, 0xd6d1c6, xt, top + 0.35, zc);
        m.decal(2.4, 6.1, 've_slab', xt, top + 0.451, zc, -90 * D, 0, 0);
      }
      m.sym(s => m.box(0.07, 0.17, L, rail, xt + s * 0.7175, top + 0.535, 0));
    }
    // catenary: masts over the pier, cantilevers, messenger + contact wires with droppers
    m.sym(s => {
      m.box(0.6, 0.1, 0.6, steel, s * 5.5, top + 0.05, 0);
      m.box(0.3, 8.0, 0.3, steel, s * 5.5, top + 4.0, 0);
      rod(m, [s * 5.4, 19.3, 0], [s * 1.9, 19.3, 0], 0.05, steel);
      rod(m, [s * 5.4, 19.95, 0], [s * 2.6, 19.35, 0], 0.04, steel);
      m.cyl(0.07, 0.07, 0.3, 0x8a4b36, s * 5.2, 19.3, 0, 0, 0, 90 * D, 6);
      const xt = s * 2.5;
      m.box(0.05, 0.05, L, 0x6b6f76, xt, 19.3, 0);
      m.box(0.05, 0.05, L, 0x8a6a4a, xt, 17.95, 0);
      for (const z of [-12, -4, 0, 4, 12]) m.box(0.025, 1.35, 0.025, 0x6b6f76, xt, 18.625, z);
    });
  },
});
