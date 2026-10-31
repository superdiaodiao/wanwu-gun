// 泳池 — things that float in or stand by the back garden's swimming pool (second course): a red and
// white swim ring, the pink flamingo float, a beach ball, the steel pool ladder and a foam noodle.
// Metres, base on y = 0, centred on x = z = 0, front faces +Z.
import * as THREE from 'three';
import { def } from '../../catalog/registry.js';
import { D, mix } from '../../core/modeler.js';

const TAU = Math.PI * 2;
const WHITE = 0xf7f4ee, INK = 0x26222a;

// ---- helpers ---------------------------------------------------------------------------------
const _up = new THREE.Vector3(0, 1, 0);
/** Euler XYZ turning local +Y towards (dx, dy, dz). */
function aim(dx, dy, dz) {
  const q = new THREE.Quaternion().setFromUnitVectors(_up, new THREE.Vector3(dx, dy, dz).normalize());
  const e = new THREE.Euler().setFromQuaternion(q, 'XYZ');
  return [e.x, e.y, e.z];
}
/** cylinder of radius r from point a to point b */
function rod(m, a, b, r, col, seg = 6) {
  const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
  const [rx, ry, rz] = aim(dx, dy, dz);
  m.cyl(r, r, Math.hypot(dx, dy, dz), col, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2, rx, ry, rz, seg);
}

/**
 * Tube through pts whose radius eases from r0 to r1 (necks, beaks). n rings along the curve,
 * seg sides; tip = true closes the far end with a short point. r0 may instead be a function of
 * t = 0..1 giving the radius (teardrops: wings, feathers).
 */
function taper(m, pts, r0, r1, col, seg = 8, n = 12, tip = false, k = 1) {
  const curve = new THREE.CatmullRomCurve3(pts.map(p => new THREE.Vector3(p[0], p[1], p[2])));
  const fr = curve.computeFrenetFrames(n, false);
  const P = [], N = [], I = [];
  const p = new THREE.Vector3(), nr = new THREE.Vector3();
  for (let i = 0; i <= n; i++) {
    const t = i / n, r = typeof r0 === 'function' ? r0(t) : r1 + (r0 - r1) * Math.pow(1 - t, k); // k > 1: flared base
    curve.getPointAt(t, p);
    for (let j = 0; j <= seg; j++) {
      const v = j / seg * TAU, s = Math.sin(v), c = -Math.cos(v);
      nr.set(c * fr.normals[i].x + s * fr.binormals[i].x, c * fr.normals[i].y + s * fr.binormals[i].y, c * fr.normals[i].z + s * fr.binormals[i].z).normalize();
      P.push(p.x + r * nr.x, p.y + r * nr.y, p.z + r * nr.z);
      N.push(nr.x, nr.y, nr.z);
    }
  }
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= seg; j++) {
      const a = (seg + 1) * (i - 1) + (j - 1), b = (seg + 1) * i + (j - 1), c = (seg + 1) * i + j, d = (seg + 1) * (i - 1) + j;
      I.push(a, b, d, b, c, d);
    }
  }
  if (tip) {
    const end = curve.getPointAt(1), tg = curve.getTangentAt(1);
    const k = P.length / 3;
    P.push(end.x + tg.x * r1, end.y + tg.y * r1, end.z + tg.z * r1);
    N.push(tg.x, tg.y, tg.z);
    const base = (seg + 1) * n;
    for (let j = 0; j < seg; j++) I.push(base + j, k, base + j + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  g.setIndex(I);
  m.geo(g, col);
}

/** teardrop radius profile for taper(): round at t = 0, pointed at t = 1 (p < 1 blunter), widest rmax */
function drop(rmax, p = 1) {
  let top = 0;
  for (let i = 1; i < 50; i++) top = Math.max(top, Math.sqrt(i / 50) * Math.pow(1 - i / 50, p));
  return u => Math.max(0.002, rmax * Math.sqrt(u) * Math.pow(1 - u, p) / top);
}

// ---- 游泳圈 ------------------------------------------------------------------------------------
def('pool_ring', {
  name: '游泳圈',
  cat: 'toy',
  sfx: 'soft',
  fill: 0.35,
  build(m) {
    const red = 0xe8463c, R = 0.324, t = 0.13; // panel edges sit off the axes: 0.9 m across them
    // the tube's cross-section has ten sides, flat on top and bottom
    const y = t * Math.cos(18 * D);
    for (let k = 0; k < 8; k++) {
      m.torus(R, t, k % 2 ? WHITE : red, 0, y, 0, 90 * D, 0, k * 45 * D + 22.5 * D, 45 * D, 10, 3);
    }
    // valve on top of a red panel, on the inner side
    const a = 45 * D, vr = R - 0.045;
    m.cyl(0.02, 0.024, 0.03, WHITE, Math.cos(a) * vr, 2 * y + 0.002, Math.sin(a) * vr, 0, 0, 0, 6);
    m.cyl(0.026, 0.026, 0.012, WHITE, Math.cos(a) * vr, 2 * y + 0.018, Math.sin(a) * vr, 0, 0, 0, 6);
  },
});

// ---- 火烈鸟泳圈 ----------------------------------------------------------------------------------
def('flamingo_float', {
  name: '火烈鸟泳圈',
  cat: 'toy',
  sfx: 'soft',
  fill: 0.3,
  build(m) {
    const pink = 0xfa80b6, deep = 0xec5c9e, beak = 0xfcdc6a;
    const R = 0.4, t = 0.15, y = t * Math.cos(18 * D);
    m.torus(R, t, pink, 0, y, 0, 90 * D, 0, 0, TAU, 10, 16);
    // neck: flaring out of the front of the ring, leaning back, the head poking forward at the top
    taper(m, [[0, 0.1, 0.39], [0, 0.34, 0.45], [0, 0.56, 0.42], [0, 0.72, 0.32], [0, 0.8, 0.27]], 0.15, 0.078, pink, 7, 10, false, 2.2);
    const hy = 0.815, hz = 0.3;
    m.ellipsoid(0.102, 0.096, 0.122, pink, 0, hy, hz, 0.15, 0, 0, 9);
    // beak: pale yellow, kinked down, black tip
    const k = [0, hy - 0.022, hz + 0.18];
    taper(m, [[0, hy - 0.005, hz + 0.07], [0, hy - 0.013, hz + 0.13], k], 0.05, 0.033, beak, 6, 3);
    taper(m, [k, [0, hy - 0.065, hz + 0.215], [0, hy - 0.108, hz + 0.222]], 0.033, 0.013, INK, 6, 3, true);
    m.sym(s => {
      m.ellipsoid(0.013, 0.027, 0.022, INK, s * 0.086, hy + 0.016, hz + 0.05, 0, s * 0.3, 0, 5);
      m.box(0.009, 0.01, 0.009, 0xffffff, s * 0.095, hy + 0.028, hz + 0.06, 0, s * 0.3, 0);
    });
    // puffy teardrop wings on the ring's outer shoulders, the pointed ends at the back lifted a little
    m.sym(s => {
      const el = 68 * D, c = Math.sin(el), sn = Math.cos(el), f = 0.72, rw = 0.085;
      const cx = R + Math.cos(el) * (t + rw * f * 0.8), cy = y + Math.sin(el) * (t + rw * f * 0.8);
      // (bent to follow the ring round: world x pulled in by z² / 2x, undone through the roll and squash)
      const pts = [0.2, 0.09, -0.03, -0.13, -0.21].map((z, i) => {
        const d = z * z / (2 * cx);
        return [-s * c * d, [0, 0, 0, 0.015, 0.05][i] - sn * d / f, z];
      });
      m.push(s * cx, cy, -0.03, 0, 0, -s * (90 * D - el), [1, f, 1]);
      taper(m, pts, drop(rw, 0.7), 0, deep, 6, 6);
      m.pop();
    });
    // tail: one plump feather curling up at the back
    m.push(0, 0.235, -0.37, 0, 0, 0, [0.85, 1, 1]);
    taper(m, [[0, 0, 0.06], [0, 0.08, -0.045], [0, 0.18, -0.11], [0, 0.3, -0.125]], drop(0.105, 0.65), 0, pink, 7, 6);
    m.pop();
  },
});

// ---- 沙滩球 ------------------------------------------------------------------------------------
const CAP = 0.2; // polar cap half-angle
let goreGeo = null, capGeo = null;
function ballGeos() {
  if (!goreGeo) {
    goreGeo = new THREE.SphereGeometry(1, 4, 9, 0, TAU / 6, CAP, Math.PI - CAP * 2).toNonIndexed();
    capGeo = new THREE.SphereGeometry(1, 12, 1, 0, TAU, 0, CAP).toNonIndexed();
  }
  return [goreGeo, capGeo];
}

def('beach_ball', {
  name: '沙滩球',
  cat: 'toy',
  sfx: 'soft',
  fill: 0.52,
  build(m) {
    const R = 0.25;
    const cols = [0xe9473f, WHITE, 0x3b82d9, 0xf6c63c, WHITE, 0x4fb35a];
    const [gore, cap] = ballGeos();
    for (let k = 0; k < 6; k++) m.geo(gore, cols[k], 0, R, 0, 0, k * 60 * D + 15 * D, 0, R, R, R);
    m.geo(cap, WHITE, 0, R, 0, 0, 0, 0, R, R, R);
    m.geo(cap, WHITE, 0, R, 0, Math.PI, 0, 0, R, R, R);
    // little white valve plug on the red gore, near the top
    const a = 45 * D, th = CAP + 0.2;
    const n = [-Math.cos(a) * Math.sin(th), Math.cos(th), Math.sin(a) * Math.sin(th)];
    const [rx, ry, rz] = aim(n[0], n[1], n[2]);
    const vr = R + 0.006;
    m.cyl(0.015, 0.018, 0.02, WHITE, n[0] * vr, R + n[1] * vr, n[2] * vr, rx, ry, rz, 6);
  },
});

// ---- 泳池扶梯 ----------------------------------------------------------------------------------
// fake chrome: a bright streak where the normal faces the sky / the light, darker round the back
const L = new THREE.Vector3(0.45, 0.75, 0.5).normalize();
const chrome = (x, y, z, nx, ny, nz) => {
  const s = nx * L.x + ny * L.y + nz * L.z;
  return s > 0.6 ? mix(0xd6dee6, 0xffffff, Math.min(1, (s - 0.6) / 0.3)) : mix(0x5a6570, 0xd6dee6, Math.max(0, (s + 0.3) / 0.9));
};

def('pool_ladder', {
  name: '泳池扶梯',
  cat: 'daily',
  sfx: 'metal',
  fill: 0.12,
  build(m) {
    // coping (deck level) at y = 0.9, the pool wall's face at z = 0, the water on the +z side
    const X = 0.24, r = 0.03, ZD = -0.26, ZW = 0.26, Y0 = 0.9, YA = 1.44, rise = 0.25;
    const tread = 0xe4e8ec, grip = 0x9aa4ad, rubber = 0x3a3d44;
    m.sym(s => {
      const x = s * X;
      // escutcheon flange on the deck and the leg up to the bend
      m.cyl(0.046, 0.05, 0.014, chrome, x, Y0 + 0.007, ZD, 0, 0, 0, 8);
      rod(m, [x, Y0, ZD], [x, YA, ZD], r, chrome);
      // goose-neck over the coping
      const arc = [];
      for (let i = 0; i <= 8; i++) {
        const a = Math.PI * i / 8;
        arc.push([x, YA + Math.sin(a) * rise, -Math.cos(a) * ZW]);
      }
      m.tube(arc, r, chrome, 6, false, 8);
      // down into the water, then a short bend back to a rubber bumper against the wall
      const YB = 0.16, BR = 0.035;
      rod(m, [x, YA, ZW], [x, YB, ZW], r, chrome);
      m.tube([[x, YB, ZW], [x, YB - 0.07, ZW - 0.025], [x, BR, ZW - 0.12], [x, BR, 0.075]], r, chrome, 6, false, 4);
      m.cyl(BR, BR, 0.07, rubber, x, BR, 0.035, 90 * D, 0, 0, 8);
    });
    // three treads hung between the water-side rails, anti-slip ridges on top
    for (const ty of [0.2, 0.45, 0.7]) {
      m.box(2 * X, 0.035, 0.15, tread, 0, ty - 0.0175, ZW - 0.055);
      for (const dz of [-0.035, 0.035]) m.box(2 * X - 0.06, 0.008, 0.022, grip, 0, ty + 0.002, ZW - 0.055 + dz);
    }
  },
});

// ---- 泳池浮条 ----------------------------------------------------------------------------------
def('pool_noodle', {
  name: '泳池浮条',
  cat: 'toy',
  sfx: 'soft',
  fill: 0.3,
  build(m) {
    const lime = 0xaee83c, cut = 0xe2f9a8, hole = 0x6f9e22, r = 0.07;
    // a gentle bow towards the front, lying on its side
    const half = 0.676, sag = 0.12, Rb = (half * half + sag * sag) / (2 * sag), A = Math.asin(half / Rb);
    const pts = [];
    for (let i = 0; i <= 6; i++) {
      const a = -A + (2 * A * i) / 6;
      pts.push([Rb * Math.sin(a), r, Rb * Math.cos(a) - Rb + sag / 2]);
    }
    m.tube(pts, r, lime, 10, false, 7);
    // cut foam ends with the hole down the middle
    m.sym(s => {
      const a = s * A, ex = Rb * Math.sin(a), ez = Rb * Math.cos(a) - Rb + sag / 2;
      // end disc faces along the tangent (cos a, 0, -sin a) * s
      const ry = a;
      m.disc(r, cut, ex, r, ez, 0, ry, 90 * D, 10);
      m.disc(r * 0.32, hole, ex + s * Math.cos(a) * 0.002, r, ez - s * Math.sin(a) * 0.002, 0, ry, 90 * D, 6);
    });
  },
});
