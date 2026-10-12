// 工位开局 (office_people): see docs/CATALOG_GUIDE.md
// Office colleagues of 幸福科技 and the boss. Built on creatures.js person(); face/hair helpers
// below are local copies of the (unexported) ones in creatures.js.
import * as THREE from 'three';
import { def } from './registry.js';
import { D, shade } from '../core/modeler.js';
import { decal, fitText, FONTS } from '../core/atlas.js';
import { person, V, paint, centreXZ, SKIN, EYE, WHITE, INK } from './creatures.js';

const TAU = Math.PI * 2;
const RED = 0xd8342c, NAVY = 0x2c3e66, STEEL = 0xb8bcc2;
const HAIR = 0x2e2624, HAIR_BROWN = 0x4a3328;

// ---- local geometry helpers (copied from creatures.js) ------------------------------------------
const UP = V(0, 1, 0);
const v3 = a => (a && a.isVector3 ? a.clone() : V(a[0], a[1], a[2]));
function eulerY(d) {
  const q = new THREE.Quaternion().setFromUnitVectors(UP, v3(d).normalize());
  const e = new THREE.Euler().setFromQuaternion(q, 'XYZ');
  return [e.x, e.y, e.z];
}
function eulerZ(n, roll = 0) {
  const z = v3(n).normalize();
  const x = V().crossVectors(UP, z);
  if (x.lengthSq() < 1e-8) x.set(1, 0, 0); else x.normalize();
  const y = V().crossVectors(z, x);
  const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
  if (roll) q.multiply(new THREE.Quaternion().setFromAxisAngle(V(0, 0, 1), roll));
  const e = new THREE.Euler().setFromQuaternion(q, 'XYZ');
  return [e.x, e.y, e.z];
}
const here = (m, p) => v3(p).applyMatrix4(m.matrix);
const toLocal = (m, p) => v3(p).applyMatrix4(m.matrix.clone().invert());
function rod(m, A, B, rA, col, seg = 6, rB = rA) {
  A = v3(A); B = v3(B);
  const d = V().subVectors(B, A);
  const [rx, ry, rz] = eulerY(d);
  m.cyl(rB, rA, d.length(), col, (A.x + B.x) / 2, (A.y + B.y) / 2, (A.z + B.z) / 2, rx, ry, rz, seg);
}
const _tris = new Map();
function sphereTris(seg) {
  let t = _tris.get(seg);
  if (!t) {
    const g = new THREE.SphereGeometry(1, seg, Math.max(3, Math.round(seg * 0.75))).toNonIndexed();
    const p = g.attributes.position;
    t = [];
    for (let i = 0; i < p.count; i += 3) t.push([V().fromBufferAttribute(p, i), V().fromBufferAttribute(p, i + 1), V().fromBufferAttribute(p, i + 2)]);
    _tris.set(seg, t);
  }
  return t;
}
function facet(hd, u, v) {
  const { r, sx = 1, sy = 1, sz = 1, seg = 10 } = hd;
  const dir = V(Math.cos(v) * Math.sin(u) / sx, Math.sin(v) / sy, Math.cos(v) * Math.cos(u) / sz).normalize();
  const ray = new THREE.Ray(V(), dir), hit = V();
  for (const [a, b, c] of sphereTris(seg)) {
    if (ray.intersectTriangle(a, b, c, false, hit)) {
      const n = V().subVectors(b, a).cross(V().subVectors(c, a));
      n.set(n.x / sx, n.y / sy, n.z / sz).normalize();
      if (n.dot(dir) < 0) n.negate();
      return { p: V(hit.x * sx * r, hit.y * sy * r, hit.z * sz * r), n };
    }
  }
  return { p: V(dir.x * sx * r, dir.y * sy * r, dir.z * sz * r), n: dir };
}
function stick(m, hd, u, v, key, w, h, roll = 0) {
  const { p, n } = facet(hd, u, v);
  const o = Math.max(0.0008, hd.r * 0.012);
  const [rx, ry, rz] = eulerZ(n, roll);
  m.decal(w, h, key, p.x + n.x * o, p.y + n.y * o, p.z + n.z * o, rx, ry, rz);
}
function onFacet(m, hd, u, v, fn, lift = 0) {
  const { p, n } = facet(hd, u, v);
  const [rx, ry, rz] = eulerZ(n);
  m.push(p.x + n.x * lift, p.y + n.y * lift, p.z + n.z * lift, rx, ry, rz);
  fn();
  m.pop();
}
const surf = (hd, u, v, k = 1) => V(Math.cos(v) * Math.sin(u) * hd.r * k * hd.sx, Math.sin(v) * hd.r * k * hd.sy, Math.cos(v) * Math.cos(u) * hd.r * k * hd.sz);
function hairCap(m, hd, col, t, vf, vb, seg = 10) {
  const R = hd.r;
  const ab = Math.PI - vb, ac = (vf + ab) / 2, th = (ab - vf) / 2;
  const d = (t * t + 2 * R * t) / (2 * R * (1 - Math.cos(th)) + 2 * t);
  const ax = V(0, Math.sin(ac), Math.cos(ac));
  m.push(0, 0, 0, 0, 0, 0, [hd.sx, hd.sy, hd.sz]);
  const [rx, ry, rz] = eulerY(ax);
  m.sphere(R + t - d, col, ax.x * d, ax.y * d, ax.z * d, 1, 1, 1, rx, ry, rz, seg);
  m.pop();
}
const lump = (m, r, col, x, y, z, rx, ry, sx = 1, sy = 1, sz = 1) => m.geo(new THREE.IcosahedronGeometry(1, 0), col, x, y, z, rx, ry, 0, r * sx, r * sy, r * sz);

/** Run fn(hd) in the head frame of a person drawn with the same o (call from o.extra). */
function inHead(m, P, o, fn) {
  m.push(0, P.neck, 0, o.nod || 0, o.headTurn || 0, o.headTilt || 0);
  m.push(0, P.headR * 0.85, 0);
  fn({ r: P.headR, sx: 1.05, sy: 0.97, sz: 1, seg: 10 });
  m.pop();
  m.pop();
}

/** Point on the shirt front at height y (hip frame), lifted by k metres. */
const front = (P, y, k = 0.004) => V(0, y, P.front(y) + k);

// ---- decals ----------------------------------------------------------------------------------------
function rr(c, x, y, w, h, r) { c.beginPath(); c.roundRect ? c.roundRect(x, y, w, h, r) : c.rect(x, y, w, h); }
decal('op_badge', 40, 56, (c, w, h) => { // staff card: photo, name bar, company line
  c.fillStyle = '#f6f4ee'; rr(c, 1, 1, w - 2, h - 2, 5); c.fill();
  c.fillStyle = '#2aa198'; c.fillRect(1, 1, w - 2, 12);
  fitText(c, '幸福科技', w / 2, 7.5, w - 6, 9, FONTS.sans, '#ffffff');
  c.fillStyle = '#9fc8e8'; c.fillRect(11, 16, 18, 20);
  c.fillStyle = '#f6d0aa'; c.beginPath(); c.arc(20, 25, 5.5, 0, TAU); c.fill();
  c.fillStyle = '#2e2624'; c.fillRect(14, 18, 12, 4);
  c.fillStyle = '#5a5f6a'; c.fillRect(8, 40, w - 16, 4); c.fillRect(11, 47, w - 22, 3);
});
decal('op_logo', 64, 64, (c, w, h) => { // 幸福科技 smiley logo
  c.fillStyle = '#f4f2ec'; c.beginPath(); c.arc(w / 2, h / 2, w / 2 - 6, 0, TAU); c.fill();
  c.strokeStyle = '#2aa198'; c.lineWidth = 5; c.lineCap = 'round';
  c.beginPath(); c.arc(w / 2, h / 2 + 2, 14, 0.25, Math.PI - 0.25); c.stroke();
  c.fillStyle = '#2aa198';
  for (const x of [-9, 9]) { c.beginPath(); c.arc(w / 2 + x, h / 2 - 7, 4, 0, TAU); c.fill(); }
});
decal('op_screen', 64, 40, (c, w, h) => { // laptop / tablet UI: chart + slides
  c.fillStyle = '#dff1ff'; c.fillRect(0, 0, w, h);
  c.fillStyle = '#2c3e66'; c.fillRect(0, 0, w, 7);
  c.fillStyle = '#f2a14a'; c.fillRect(6, 24, 6, 11); c.fillStyle = '#2aa198'; c.fillRect(15, 17, 6, 18); c.fillStyle = '#e8554a'; c.fillRect(24, 12, 6, 23);
  c.fillStyle = '#9ab0c8'; for (const y of [13, 20, 27]) c.fillRect(36, y, 22, 3);
});
decal('op_cup', 64, 24, (c, w, h) => { // coffee cup sleeve
  c.fillStyle = '#b07a4f'; c.fillRect(0, 0, w, h);
  fitText(c, '福 COFFEE', w / 2, h / 2, w - 8, h - 8, FONTS.sans, '#f6efe0');
});
decal('op_eyebag', 32, 14, (c, w, h) => { // tired dark crescents
  c.strokeStyle = 'rgba(122,92,128,0.95)'; c.lineWidth = 4; c.lineCap = 'round';
  c.beginPath(); c.ellipse(w / 2, 2, w / 2 - 5, h - 6, 0, 0.25, Math.PI - 0.25); c.stroke();
  c.strokeStyle = 'rgba(150,120,150,0.9)'; c.lineWidth = 2.5;
  c.beginPath(); c.ellipse(w / 2, 0, w / 2 - 8, h - 3, 0, 0.5, Math.PI - 0.5); c.stroke();
});
decal('op_brow_boss', 36, 14, (c, w, h) => { // thick, confident, slightly raised
  c.fillStyle = '#2a1d17';
  c.beginPath(); c.moveTo(3, h - 3); c.quadraticCurveTo(w * 0.45, 0, w - 2, 4); c.lineTo(w - 3, 9); c.quadraticCurveTo(w * 0.45, 6, 4, h - 1); c.closePath(); c.fill();
});
decal('op_paper', 40, 52, (c, w, h) => { // printed report page
  c.fillStyle = '#f8f7f2'; c.fillRect(0, 0, w, h);
  c.fillStyle = '#2c3e66'; c.fillRect(5, 5, w - 18, 5);
  c.fillStyle = '#a8adb6'; for (let y = 15; y < h - 6; y += 6) c.fillRect(5, y, w - 10 - ((y * 7) % 11), 2);
  c.fillStyle = '#e8554a'; c.fillRect(w - 13, h - 13, 8, 8);
});

// ---- shared props ------------------------------------------------------------------------------------
/** Lanyard from the collar down to a badge card on the shirt front (hip frame). */
function lanyard(m, P, col, yBadge = 0.68) {
  const T = P.T, H = P.H, yb = yBadge * T;
  const b = front(P, yb, 0.012);
  m.sym(s => {
    const a = front(P, 0.97 * T, 0.004); a.x = s * 0.04 * H * 0.6;
    const ym = (0.97 * T + yb) / 2 + 0.02;
    const mid = front(P, ym, 0.008); mid.x = s * 0.02 * H * 0.6;
    rod(m, a, mid, 0.004, col, 3);
    rod(m, mid, b.clone().add(V(0, 0.035, -0.004)), 0.004, col, 3);
  });
  m.box(0.016, 0.012, 0.008, STEEL, b.x, b.y + 0.035, b.z); // clip
  m.box(0.056, 0.078, 0.004, 0xf4f2ec, b.x, b.y, b.z);
  m.decal(0.052, 0.072, 'op_badge', b.x, b.y, b.z + 0.0025);
}

/** Small turned-down shirt collar points either side of the neck (hip frame). */
function collar(m, P, col) {
  const y = 0.99 * P.T, z = P.front(y);
  m.sym(s => m.box(0.05, 0.035, 0.012, col, s * 0.028, y, z + 0.004, -0.35, s * 0.25, s * 0.55));
}

// ---- 抱电脑的同事 ----------------------------------------------------------------------------------------
def('office_worker_laptop', {
  name: '抱电脑的同事', cat: 'person', sfx: 'scream_m', mover: { kind: 'wander', speed: 0.6 }, fill: 0.4,
  tints: [0x8a93a3, 0x4a6fb0, 0x3fae7f, 0xe8554a, 0xf2c14e, 0x2c3e66],
  build(m) {
    let lap = null;
    const o = {
      h: 1.75, hair: 'side', hairCol: HAIR, topTint: true, sleeve: 'long', hem: 0.05,
      bottom: 0x3a4a6a, shoeType: 'sneaker', shoe: 0xf2f0ea, sole: 0xd9d6ce, brows: 'cr_brow', nod: 0.12,
      armL: { to: [0.085, 0.13, 0.17], hint: [0.6, -1, 0] },
      armR: { to: [0.085, 0.13, 0.17], hint: [0.6, -1, 0], hold: (m, H) => { lap = V(0, H.y + 0.035, H.z - 0.01); } },
      extra(m, P) {
        // hood behind the neck + drawstrings
        paint(m, true, () => m.ellipsoid(0.17, 0.09, 0.1, 0xffffff, 0, 1.0 * P.T, -0.13, -0.4, 0, 0, 7));
        m.sym(s => m.box(0.008, 0.1, 0.008, 0xf4f2ec, s * 0.04, 0.86 * P.T, P.front(0.86 * P.T) + 0.006));
        lanyard(m, P, 0x2aa198, 0.74);
        // open laptop on the forearms: keyboard up, hinge away from the body, lid back facing +Z
        const c = lap, W = 0.32, Dp = 0.22, lidA = 12 * D;
        m.box(W, 0.016, Dp, 0x9aa0a6, c.x, c.y, c.z);
        m.box(W * 0.86, 0.003, Dp * 0.45, 0x3a3d44, c.x, c.y + 0.009, c.z - 0.02); // keys
        const hz = c.z + Dp / 2, hy = c.y + 0.008, lh = 0.21;
        const lc = V(c.x, hy + Math.cos(lidA) * lh / 2, hz + Math.sin(lidA) * lh / 2);
        m.box(W, lh, 0.012, 0xc9cdd2, lc.x, lc.y, lc.z, -lidA, 0, 0);
        const n = V(0, Math.sin(lidA), Math.cos(lidA));
        m.decal(0.08, 0.08, 'op_logo', lc.x + n.x * 0.007, lc.y + n.y * 0.007, lc.z + n.z * 0.007, -lidA, 0, 0);
        m.glow(1);
        m.decal(W * 0.88, lh * 0.82, 'op_screen', lc.x - n.x * 0.007, lc.y - n.y * 0.007, lc.z - n.z * 0.007, -lidA, Math.PI, 0);
        m.glow(0);
      },
    };
    person(m, o);
    centreXZ(m);
  },
});

// ---- 端咖啡的同事 ----------------------------------------------------------------------------------------
function ponytail(m, hd, col, tie) {
  const R = hd.r;
  hairCap(m, hd, col, 0.13 * R, 42 * D, -24 * D, 8);
  onFacet(m, hd, 0.25, 52 * D, () => m.ellipsoid(R * 0.6, R * 0.2, R * 0.12, col, 0, 0, 0, 0, 0, -0.35, 6), R * 0.02); // side-swept fringe
  const p = surf(hd, 180 * D, 25 * D, 1.1);
  m.sphere(R * 0.11, tie, p.x, p.y, p.z, 1, 1, 1, 0, 0, 0, 5);
  m.ellipsoid(R * 0.2, R * 0.48, R * 0.18, col, p.x, p.y - R * 0.36, p.z - R * 0.16, -0.35, 0, 0, 6);
  m.sphere(R * 0.12, col, p.x, p.y - R * 0.78, p.z - R * 0.26, 1, 1.4, 1, 0, 0, 0, 5); // curled tip
  m.sym(s => m.ellipsoid(R * 0.13, R * 0.42, R * 0.16, col, s * R * 0.92, -R * 0.12, R * 0.3, 0.1, 0, s * 0.12, 6)); // face-framing locks
}

def('office_worker_coffee', {
  name: '端咖啡的同事', cat: 'person', sfx: 'scream_f', mover: { kind: 'wander', speed: 0.5 }, fill: 0.4,
  tints: [0xe8b4a0, 0xf2e3c2, 0x9fb8d8, 0xb7d3a8, 0xd8a0c0, 0xf2c14e],
  build(m) {
    let cup = null;
    const o = {
      h: 1.62, hair: 'none', topTint: true, sleeve: 'long', hem: 0.12, waistK: 0.88, hipK: 1.04,
      bottom: 0x4a4f5c, flare: 1.2, shoe: 0x8b5a3c, eyes: 'dot', mouth: 'smile', brows: 'cr_brow',
      armR: { to: [0.1, 0.24, 0.17], hint: [0.6, -1, -0.2], hold: (m, H) => { cup = here(m, H); } },
      armL: { to: [0.16, 0.06, 0.04], hint: [0.3, -0.3, -0.6] },
      extra(m, P) {
        inHead(m, P, o, hd => ponytail(m, hd, HAIR_BROWN, 0xe8554a));
        // cardigan opening: cream blouse strip down the front + buttons
        for (let i = 0; i < 4; i++) {
          const y = (0.25 + i * 0.2) * P.T, z = P.front(y);
          m.box(0.05, 0.2 * P.T + 0.01, 0.008, 0xf6efe0, 0, y, z + 0.001, 0, 0, 0);
          m.sphere(0.008, 0xf4f2ec, 0.033, y, z + 0.005, 1, 1, 0.5, 0, 0, 0, 4);
        }
        collar(m, P, 0xf6efe0);
        lanyard(m, P, 0xd8342c, 0.62);
      },
    };
    person(m, o);
    // paper cup: white with brown sleeve and lid
    const c = cup.clone().add(V(-0.005, 0.03, 0.035));
    m.lathe([[0.001, -0.06], [0.03, -0.06], [0.042, 0.055], [0.001, 0.055]], 0xf4f2ec, c.x, c.y, c.z, 0, 0, 0, 8);
    m.cyl(0.04, 0.035, 0.045, 0xb07a4f, c.x, c.y - 0.005, c.z, 0, 0, 0, 8);
    m.decal(0.045, 0.02, 'op_cup', c.x, c.y - 0.005, c.z + 0.04, -0.06, 0, 0);
    m.cyl(0.04, 0.045, 0.015, 0xf4f2ec, c.x, c.y + 0.062, c.z, 0, 0, 0, 8);
    m.cyl(0.025, 0.035, 0.012, 0xe8e2d4, c.x, c.y + 0.075, c.z, 0, 0, 0, 8);
    centreXZ(m);
  },
});

// ---- 加班的同事 -------------------------------------------------------------------------------------------
def('office_worker_tired', {
  name: '加班的同事', cat: 'person', sfx: 'scream_m', mover: { kind: 'wander', speed: 0.4 }, fill: 0.4,
  tints: [0xa9c4e0, 0xd8d4c8, 0xb6c8a8, 0xc8b8d8],
  build(m) {
    let phone = null;
    const o = {
      h: 1.73, hair: 'none', topTint: true, sleeve: 'long', hem: 0.08, lean: 0.12, nod: 0.3, headTilt: 0.1,
      bottom: 0x4a4c56, shoe: 0x3a3230, eyes: 'dot', mouth: 'flat', blush: false,
      skin: 0xeccaa8,
      armR: { to: [0.08, 0.22, 0.17], hint: [0.5, -1, -0.1], hold: (m, H) => { phone = here(m, H); } },
      armL: { to: [0.17, 0.1, 0.02], hint: [0.3, -0.2, -0.8], hold: (m, H) => {
        // stack of paper pinched against the hip
        for (let i = 0; i < 3; i++) m.box(0.022, 0.25, 0.18, i % 2 ? 0xf8f7f2 : 0xeceae2, H.x + 0.018 + i * 0.006, H.y - 0.03, H.z, 0, 0, 0.04 * i);
        m.decal(0.15, 0.2, 'op_paper', H.x + 0.035, H.y - 0.03, H.z, 0, 90 * D, 0);
      } },
      extra(m, P) {
        inHead(m, P, o, hd => {
          const R = hd.r, c = 0x332a28;
          hairCap(m, hd, c, 0.13 * R, 46 * D, -12 * D, 8);
          // bed-head tufts sticking out every way
          m.jitter(0.08);
          for (const [u, v, k] of [[-30, 60, 0.2], [20, 70, 0.22], [60, 45, 0.18], [-70, 40, 0.17], [150, 50, 0.2], [-140, 55, 0.2], [90, 70, 0.16], [0, 88, 0.2]]) {
            const p = surf(hd, u * D, v * D, 1.08);
            lump(m, k * R * 0.7, c, p.x, p.y, p.z, m.rng.range(0, 3), m.rng.range(0, 3), 0.7, 1.5, 0.7);
          }
          m.jitter(0);
          m.sym(s => stick(m, hd, s * 0.36, -0.25, 'op_eyebag', R * 0.36, R * 0.16));
          stick(m, hd, 0.12, -0.62, 'op_eyebag', R * 0.12, R * 0.05); // stubble hint
        });
        // U-shaped neck pillow, open at the front
        const y = 1.06 * P.T;
        m.torus(0.1, 0.052, 0xf2a14a, 0, y, -0.01, 90 * D, 0, 120 * D, 300 * D, 6, 12);
        m.sym(s => m.sphere(0.052, 0xf2a14a, s * 0.085, y, 0.06, 1, 1, 1, 0, 0, 0, 6));
        lanyard(m, P, 0x2c3e66, 0.66);
      },
    };
    person(m, o);
    // phone held low, screen up
    const a = -2.1, c = phone.clone().add(V(0, 0.05, 0.04)), n = V(0, -Math.sin(a), Math.cos(a));
    m.box(0.075, 0.15, 0.014, INK, c.x, c.y, c.z, a, 0, 0);
    m.glow(1);
    m.decal(0.063, 0.13, 'op_screen', c.x + n.x * 0.009, c.y + n.y * 0.009, c.z + n.z * 0.009, a, 0, 90 * D);
    m.glow(0);
    centreXZ(m);
  },
});

// ---- 戴耳机的同事 -----------------------------------------------------------------------------------------
function bob(m, hd, col) {
  const R = hd.r;
  hairCap(m, hd, col, 0.15 * R, 44 * D, -40 * D, 8);
  onFacet(m, hd, 0, 50 * D, () => m.ellipsoid(R * 0.72, R * 0.2, R * 0.12, col, 0, 0, 0, 0, 0, 0, 6), R * 0.02); // straight bangs
  m.sym(s => m.ellipsoid(R * 0.24, R * 0.55, R * 0.62, col, s * R * 0.88, -R * 0.22, -R * 0.12, 0, 0, s * 0.12, 6));
  m.ellipsoid(R * 0.8, R * 0.45, R * 0.3, col, 0, -R * 0.3, -R * 0.78, 0, 0, 0, 6);
}

def('office_worker_headset', {
  name: '戴耳机的同事', cat: 'person', sfx: 'scream_f', mover: { kind: 'wander', speed: 0.5 }, fill: 0.4,
  tints: [0xf2c14e, 0x2aa198, 0xe8554a, 0xf6efe0, 0x8a7fc8],
  build(m) {
    let tab = null;
    const o = {
      h: 1.64, hair: 'none', topTint: true, sleeve: 'long', hem: 0.1, waistK: 0.9, nod: 0.18,
      bottom: 0x2c3040, flare: 1.35, shoeType: 'sneaker', shoe: 0xf4f2ec, sole: 0xd9d6ce, mouth: 'smile', eyes: 'happy',
      armL: { to: [0.07, 0.2, 0.17], hint: [0.6, -1, 0] },
      armR: { to: [0.07, 0.2, 0.17], hint: [0.6, -1, 0], hold: (m, H) => { tab = here(m, H); } },
      extra(m, P) {
        inHead(m, P, o, hd => {
          const R = hd.r, hc = 0x3a3d44, pad = 0xf08fb0;
          bob(m, hd, 0x2a2024);
          // over-ear headphones: band over the crown, big cups over the ears
          m.push(0, 0, -R * 0.05, 0, 0, 0, [hd.sx, hd.sy, 1]);
          m.torus(R * 1.2, R * 0.07, hc, 0, -R * 0.08, 0, 0, 0, 0, Math.PI, 4, 9);
          m.pop();
          m.sym(s => {
            m.cyl(R * 0.36, R * 0.36, R * 0.22, pad, s * R * 1.2, -R * 0.12, -R * 0.03, 0, 0, 90 * D, 8);
            m.cyl(R * 0.3, R * 0.33, R * 0.14, hc, s * R * 1.36, -R * 0.12, -R * 0.03, 0, 0, 90 * D, 8);
          });
        });
        lanyard(m, P, 0x5aa9e6, 0.6);
      },
    };
    person(m, o);
    // tablet in both hands, screen tilted up towards her
    const a = -2.0, c = V(0, tab.y + 0.05, tab.z + 0.08);
    m.box(0.25, 0.18, 0.012, 0xd6d8dc, c.x, c.y, c.z, a, 0, 0);
    const n = V(0, -Math.sin(a), Math.cos(a));
    m.glow(1);
    m.decal(0.22, 0.15, 'op_screen', c.x + n.x * 0.0075, c.y + n.y * 0.0075, c.z + n.z * 0.0075, a, 0, 0);
    m.glow(0);
    centreXZ(m);
  },
});

// ---- 老板 -------------------------------------------------------------------------------------------------
def('office_boss', {
  name: '老板', cat: 'person', sfx: 'scream_m', mover: { kind: 'wander', speed: 0.45 },
  build(m) {
    let cupHand = null;
    const o = {
      h: 1.79, girth: 1.22, hipK: 1.02, waistK: 1.08, chestK: 1.04, depth: 0.88,
      hair: 'none', glasses: 0x3a3230, brows: 'op_brow_boss', browRoll: -0.12, mouth: 'smile',
      top: WHITE, sleeve: 'long', hem: 0.02, bottom: 0x2a2d38, belt: 0x3a2a22, shoe: 0x2a2220,
      armL: { to: [0.05, 0.1, -0.16], hint: [1, 0, 0.1] },
      armR: { to: [0.04, 0.12, -0.17], hint: [1, 0, 0.1], hold: (m, H) => { cupHand = here(m, H); } },
      extra(m, P) {
        const T = P.T;
        inHead(m, P, o, hd => { // receding hairline, neat side part combed over
          const R = hd.r, c = 0x34302e;
          hairCap(m, hd, c, 0.07 * R, 66 * D, -14 * D, 8);
          onFacet(m, hd, -0.45, 58 * D, () => m.ellipsoid(R * 0.5, R * 0.16, R * 0.1, c, 0, 0, 0, 0, 0, 0.45, 6), R * 0.015);
        });
        collar(m, P, 0xfbfaf6);
        // red tie: knot + blade following the round shirt front
        const k = front(P, 0.97 * T, 0.012);
        m.box(0.036, 0.032, 0.022, RED, k.x, k.y, k.z, -0.15, 0, 0);
        const ys = [0.95, 0.8, 0.62, 0.44].map(t => t * T);
        for (let i = 0; i < ys.length - 1; i++) {
          const a = front(P, ys[i], 0.01), b = front(P, ys[i + 1], 0.01);
          const mid = a.clone().lerp(b, 0.5), d = V().subVectors(a, b);
          const w = 0.03 + i * 0.008;
          m.box(w, d.length() + 0.004, 0.007, i === 1 ? shade(RED, 0.9) : RED, mid.x, mid.y, mid.z, Math.atan2(d.z, d.y), 0, 0);
        }
        const tip = front(P, 0.44 * T, 0.008);
        m.box(0.035, 0.035, 0.007, RED, tip.x, tip.y, tip.z, 0, 0, 45 * D);
        m.sphere(0.006, 0xf2c14e, 0, 0.66 * T, P.front(0.66 * T) + 0.018, 1, 0.6, 0.5, 0, 0, 0, 4); // gold tie pin
        // pocket pen + buttons
        m.box(0.008, 0.05, 0.006, NAVY, 0.075, 0.8 * T, P.front(0.8 * T) + 0.004);
      },
    };
    person(m, o);
    // stainless 保温杯 in the hand behind the back
    const c = cupHand.clone().add(V(0.01, 0.0, -0.035));
    m.cyl(0.035, 0.035, 0.2, STEEL, c.x, c.y - 0.02, c.z, 0, 0, 0, 8);
    m.cyl(0.037, 0.037, 0.05, 0x8b2a26, c.x, c.y + 0.1, c.z, 0, 0, 0, 8);
    m.cyl(0.037, 0.037, 0.012, 0xf2c14e, c.x, c.y + 0.07, c.z, 0, 0, 0, 8);
    centreXZ(m);
  },
});
