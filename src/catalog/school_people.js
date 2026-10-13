// 教室开局 (school_people): see docs/CATALOG_GUIDE.md
// Classmates in 校服 tracksuits, the homeroom teacher and the dean. Built on creatures.js person();
// face/hair helpers below are local copies of the (unexported) ones in creatures.js.
import * as THREE from 'three';
import { def } from './registry.js';
import { D, shade } from '../core/modeler.js';
import { decal, fitText, FONTS } from '../core/atlas.js';
import { person, V, paint, centreXZ, SKIN, EYE, WHITE, INK } from './creatures.js';

const TAU = Math.PI * 2;
const RED = 0xd8342c, STEEL = 0xb8bcc2;
const HAIR = 0x2e2624, HAIR_BROWN = 0x4a3328;
const STUDENT_TINTS = [0x2f63c9, 0xd8342c, 0x2c3e66, 0x3a8f5c, 0x7a5cc0];

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
/** Decal flat on a head facet; k scales the lift so a later decal can sit over the default one. */
function stick(m, hd, u, v, key, w, h, roll = 0, k = 1) {
  const { p, n } = facet(hd, u, v);
  const o = Math.max(0.0008, hd.r * 0.012) * k;
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
const front = (P, y, k = 0.004) => V(0, y, P.front(y) + k);
const EU = 0.36, EV = -0.1, EW = 0.17; // adult eye placement in person()

// ---- decals ----------------------------------------------------------------------------------------
function ell(c, x, y, rx, ry, col) { c.fillStyle = col; c.beginPath(); c.ellipse(x, y, rx, ry, 0, 0, TAU); c.fill(); }
decal('sp_yawn', 24, 30, (c, w, h) => { // big tall yawn
  ell(c, w / 2, h / 2, w / 2 - 1.5, h / 2 - 1.5, '#7a2a28');
  ell(c, w / 2, h * 0.72, w * 0.3, h * 0.17, '#ee8286');
  c.fillStyle = '#fbf6ee'; c.fillRect(w * 0.3, 2.5, w * 0.4, 3);
});
decal('sp_crease', 36, 24, (c, w, h) => { // red sleeve-print on the cheek from napping on the desk
  ell(c, w / 2, h / 2, w / 2 - 1, h / 2 - 1, 'rgba(236,120,120,0.95)');
  c.strokeStyle = '#c84a50'; c.lineWidth = 2.2; c.lineCap = 'round';
  for (const y of [7, 12, 17]) { c.beginPath(); c.moveTo(6, y + 2); c.quadraticCurveTo(w / 2, y - 2, w - 6, y + 1); c.stroke(); }
});
decal('sp_eye_side', 30, 28, (c, w, h) => { // half-lidded, pupil darting to one side
  c.save(); c.beginPath(); c.ellipse(w / 2, h / 2, w / 2 - 2, h / 2 - 2, 0, 0, TAU); c.clip();
  c.fillStyle = '#fffaf2'; c.fillRect(0, h * 0.36, w, h);
  ell(c, w * 0.27, h * 0.62, w * 0.22, h * 0.3, '#2a1d17');
  ell(c, w * 0.33, h * 0.52, 2.2, 2.2, '#fffaf2');
  c.restore();
  c.strokeStyle = '#2a1d17'; c.lineWidth = 4; c.lineCap = 'round';
  c.beginPath(); c.moveTo(2, h * 0.38); c.lineTo(w - 2, h * 0.34); c.stroke();
});
decal('sp_sweat', 14, 20, (c, w, h) => {
  c.fillStyle = '#9fd4f2';
  c.beginPath(); c.moveTo(w / 2, 1); c.quadraticCurveTo(w - 1, h * 0.65, w / 2, h - 1); c.quadraticCurveTo(1, h * 0.65, w / 2, 1); c.fill();
  ell(c, w * 0.4, h * 0.62, 2, 3, '#e6f6ff');
});
decal('sp_brow_firm', 32, 12, (c, w, h) => { // straight, firm
  c.strokeStyle = '#2a1d17'; c.lineWidth = 5; c.lineCap = 'round';
  c.beginPath(); c.moveTo(4, h - 5); c.quadraticCurveTo(w / 2, 2, w - 4, 4); c.stroke();
});
decal('sp_brow_dean', 36, 14, (c, w, h) => { // thick, knitted
  c.strokeStyle = '#1e1714'; c.lineWidth = 8; c.lineCap = 'round';
  c.beginPath(); c.moveTo(5, h / 2 + 1); c.lineTo(w - 5, h / 2 - 1); c.stroke();
});
decal('sp_frown', 32, 12, (c, w, h) => { // stern downturned line
  c.strokeStyle = '#7a3430'; c.lineWidth = 4; c.lineCap = 'round';
  c.beginPath(); c.moveTo(4, h - 3); c.quadraticCurveTo(w / 2, 1, w - 4, h - 3); c.stroke();
});
decal('sp_page', 64, 40, (c, w, h) => { // open exercise book: neat lined pages
  c.fillStyle = '#fbfaf3'; c.fillRect(0, 0, w, h);
  c.fillStyle = '#c9d6e6'; for (let y = 6; y < h; y += 5) c.fillRect(2, y, w - 4, 1);
  c.fillStyle = '#3a4a7a';
  for (let y = 4; y < h - 4; y += 5) { c.fillRect(5, y, 22 - (y * 3) % 7, 2); c.fillRect(37, y, 22 - (y * 5) % 9, 2); }
  c.fillStyle = '#d8342c'; c.font = 'bold 10px sans-serif'; c.fillText('✓', 22, 12);
  c.fillStyle = '#b8c0cc'; c.fillRect(w / 2 - 0.5, 0, 1, h);
});
decal('sp_page_blank', 64, 40, (c, w, h) => { // his own: half blank, scribbled
  c.fillStyle = '#fbfaf3'; c.fillRect(0, 0, w, h);
  c.fillStyle = '#c9d6e6'; for (let y = 6; y < h; y += 5) c.fillRect(2, y, w - 4, 1);
  c.strokeStyle = '#3a4a7a'; c.lineWidth = 1.5;
  for (let y = 5; y < 22; y += 5) { c.beginPath(); c.moveTo(5, y); for (let x = 5; x < 26; x += 3) c.lineTo(x, y + ((x * 7) % 3) - 1); c.stroke(); }
  c.fillStyle = '#b8c0cc'; c.fillRect(w / 2 - 0.5, 0, 1, h);
});
decal('sp_cover', 40, 52, (c, w, h) => { // exercise-book cover label
  c.fillStyle = '#f4f2ec'; c.fillRect(5, 8, w - 10, 22);
  fitText(c, '作业本', w / 2, 19, w - 14, 16, FONTS.sans, '#2c3e66');
  c.fillStyle = '#9aa0a6'; c.fillRect(8, 36, w - 16, 2); c.fillRect(8, 43, w - 16, 2);
});
decal('sp_megaphone', 32, 32, (c, w, h) => { // speaker grille
  ell(c, w / 2, h / 2, w / 2 - 1, h / 2 - 1, '#3a3d44');
  c.strokeStyle = '#5a5f6a'; c.lineWidth = 2;
  for (const r of [5, 9, 13]) { c.beginPath(); c.arc(w / 2, h / 2, r, 0, TAU); c.stroke(); }
});

// ---- 校服 tracksuit ----------------------------------------------------------------------------------
/** White stripe running down the outside of a sleeve (arm hold callback); H = person height. */
function sleeveStripe(m, H, Hc, fdir, s, E, S) {
  const W = Hc.clone().addScaledVector(fdir, -0.042 * H * 0.9);
  for (const [A, B] of [[S, E], [E, W]]) {
    const d = V().subVectors(B, A).normalize();
    let out = V(s, 0.15, 0).addScaledVector(d, -(s * d.x + 0.15 * d.y));
    if (out.lengthSq() < 1e-4) out = V(0, 1, 0);
    out.setLength(0.035 * H * 0.98);
    rod(m, A.clone().add(out), B.clone().add(out), 0.008, WHITE, 3);
  }
}

/**
 * Chibi arms are short: lengthen the forearm by `ext` past the hand person() drew. The old hand is
 * hidden in a puffy cuff; the new one is skin, or a fist inside the sleeve (paw). Returns the new hand.
 */
function reach(m, H, Hc, fdir, ext, paw = false) {
  const hr = 0.042 * H, ar = 0.035 * H;
  const W = Hc.clone().addScaledVector(fdir, -hr * 0.8), N = Hc.clone().addScaledVector(fdir, ext);
  paint(m, true, () => {
    rod(m, W, Hc.clone().addScaledVector(fdir, hr * 1.05), hr * 1.08, 0xffffff, 5);
    rod(m, Hc, N.clone().addScaledVector(fdir, paw ? 0 : -hr * 0.7), ar * 1.05, 0xffffff, 5);
    if (paw) m.sphere(hr * 1.05, 0xffffff, N.x, N.y, N.z, 1, 1, 1.1, 0, 0, 0, 6);
  });
  if (!paw) m.sphere(hr, SKIN, N.x, N.y, N.z, 1, 1.15, 0.7, 0, 0, 0, 5);
  return N;
}

/** Tracksuit student: tinted jacket and trousers with white chest band, collar, zip and stripes. */
function student(m, o) {
  const H = o.h;
  const wrap = sp => Object.assign({}, sp, {
    hold(m, Hc, fdir, s, E, S) {
      if (sp.ext) Hc = reach(m, H, Hc, fdir, sp.ext * H, sp.paw);
      sleeveStripe(m, H, Hc, fdir, s, E, S);
      if (sp.hold) sp.hold(m, Hc, fdir, s, E, S);
    },
  });
  const res = person(m, Object.assign({
    topTint: true, bottomTint: true, sleeve: 'long', hem: 0.06, flare: 1.05, depth: 0.82,
    shoeType: 'sneaker', shoe: 0xf4f2ec, sole: 0xd2cfc6,
  }, o, {
    armL: wrap(o.armL || {}), armR: wrap(o.armR || {}),
    extra(m, P, L) {
      const T = P.T, k = 1 / L.depth;
      // white chest band (lathe ring following the jacket)
      m.push(0, 0, 0, 0, 0, 0, [1, 1, L.depth]);
      const ys = [0.6, 0.66, 0.74].map(t => t * T);
      m.lathe(ys.map(y => [P.front(y) * k * 1.025 + 0.002, y]), WHITE, 0, 0, 0, 0, 0, 0, 8);
      m.pop();
      // stand-up collar with white trim + zip with a pull tab
      m.cyl(P.torsoR * 0.5, P.torsoR * 0.62, 0.045 * P.H, WHITE, 0, 1.02 * T, 0, 0, 0, 0, 8);
      for (const [a, b] of [[0.12, 0.6], [0.74, 0.98]]) {
        const ya = a * T, yb = b * T;
        rod(m, V(0, ya, P.front(ya) + 0.003), V(0, yb, P.front(yb) + 0.003), 0.005, shade(WHITE, 0.9), 3);
      }
      m.box(0.014, 0.028, 0.006, STEEL, 0, 0.9 * T, P.front(0.9 * T) + 0.008);
      if (o.extra) o.extra(m, P, L);
    },
  }));
  // trouser side stripes
  const { P, hipY } = res;
  m.sym(s => rod(m, V(s * (P.legX + P.legR * 0.97), hipY, 0), V(s * (P.legX + P.legR * 1.02), P.ankle + 0.01, 0), 0.007, WHITE, 3));
  return res;
}

// ---- 打哈欠的同学 ------------------------------------------------------------------------------------
def('school_student_sleepy', {
  name: '打哈欠的同学', cat: 'person', sfx: 'scream_m', mover: { kind: 'wander', speed: 0.4 }, fill: 0.4,
  tints: STUDENT_TINTS,
  build(m) {
    const o = {
      h: 1.62, hair: 'none', eyes: 'shut', mouth: 'o', blush: false, nod: 0.15, headTilt: 0.2, lean: 0.04,
      armR: { to: [0.08, 0.5, 0.2], hint: [0.8, -0.8, 0.1], ext: 0.065, paw: true },
      armL: { to: [0.16, 0.04, 0.03], hint: [0.3, -0.2, -0.8] },
      extra(m, P) {
        inHead(m, P, o, hd => {
          const R = hd.r;
          hairCap(m, hd, HAIR, 0.13 * R, 44 * D, -12 * D, 8);
          // bed-head: tufts every way + one antenna
          m.jitter(0.08);
          for (const [u, v, k] of [[-25, 62, 0.2], [25, 72, 0.22], [70, 45, 0.18], [-75, 42, 0.17], [160, 50, 0.22]]) {
            const p = surf(hd, u * D, v * D, 1.08);
            lump(m, k * R * 0.7, HAIR, p.x, p.y, p.z, m.rng.range(0, 3), m.rng.range(0, 3), 0.7, 1.5, 0.7);
          }
          m.jitter(0);
          const t = surf(hd, 10 * D, 85 * D, 1.1);
          m.tube([[t.x, t.y, t.z], [t.x + R * 0.1, t.y + R * 0.3, t.z], [t.x + R * 0.3, t.y + R * 0.38, t.z + R * 0.05]], R * 0.04, HAIR, 4);
          stick(m, hd, 0.07, EV - 0.4, 'sp_yawn', R * 0.32, R * 0.42, 0, 2.2);
          stick(m, hd, 0.62, EV - 0.24, 'sp_crease', R * 0.36, R * 0.24, 0.2);
          onFacet(m, hd, 0.52, EV - 0.12, () => m.sphere(R * 0.055, 0x9fd4f2, 0, 0, 0, 0.8, 1.2, 0.6, 0, 0, 0, 5), R * 0.02); // sleepy tear
        });
      },
    };
    student(m, o);
    centreXZ(m);
  },
});

// ---- 举手的同学 --------------------------------------------------------------------------------------
function ponytail(m, hd, col, tie) {
  const R = hd.r;
  hairCap(m, hd, col, 0.13 * R, 42 * D, -24 * D, 8);
  onFacet(m, hd, 0, 52 * D, () => m.ellipsoid(R * 0.66, R * 0.19, R * 0.11, col, 0, 0, 0, 0, 0, 0, 6), R * 0.02); // bangs
  const p = surf(hd, 180 * D, 40 * D, 1.1);
  m.sphere(R * 0.12, tie, p.x, p.y, p.z, 1, 1, 1, 0, 0, 0, 5);
  m.ellipsoid(R * 0.2, R * 0.55, R * 0.18, col, p.x, p.y - R * 0.4, p.z - R * 0.2, -0.45, 0, 0, 6);
  m.sphere(R * 0.13, col, p.x, p.y - R * 0.88, p.z - R * 0.3, 1, 1.4, 1, 0, 0, 0, 5);
  m.sym(s => m.ellipsoid(R * 0.12, R * 0.36, R * 0.14, col, s * R * 0.94, -R * 0.08, R * 0.3, 0.1, 0, s * 0.12, 5));
}

def('school_student_hand', {
  name: '举手的同学', cat: 'person', sfx: 'scream_f', mover: { kind: 'wander', speed: 0.5 }, fill: 0.35,
  tints: STUDENT_TINTS,
  build(m) {
    const o = {
      h: 1.56, hair: 'none', eyes: 'happy', mouth: 'open', waistK: 0.9, headTilt: 0.14, lean: -0.03,
      armL: { to: [0.12, 0.9, 0.03], hint: [1, 0, -0.2], ext: 0.24 },
      armR: { to: [0.11, 0.18, 0.12], hint: [0.5, -1, -0.2], hold(m, H) {
        // notebook clutched against the chest
        m.box(0.032, 0.21, 0.15, 0x5aa9e6, H.x + 0.02, H.y + 0.04, H.z - 0.02, 0, 0.35, 0);
        m.box(0.024, 0.2, 0.14, 0xf8f7f2, H.x + 0.03, H.y + 0.04, H.z - 0.016, 0, 0.35, 0);
      } },
      extra(m, P) {
        inHead(m, P, o, hd => ponytail(m, hd, HAIR_BROWN, 0xf08fb0));
      },
    };
    student(m, o);
    centreXZ(m);
  },
});

// ---- 抄作业的同学 ------------------------------------------------------------------------------------
function openBook(m, c, cover, page, tilt) {
  m.push(c.x, c.y, c.z, tilt, 0, 0);
  m.sym(s => m.box(0.15, 0.006, 0.21, cover, s * 0.074, 0, 0, 0, 0, s * 0.1));
  m.sym(s => m.box(0.142, 0.01, 0.2, 0xf8f7f2, s * 0.071, 0.007, 0, 0, 0, s * 0.1));
  m.decal(0.28, 0.19, page, 0, 0.0215, 0, -90 * D, 0, 0);
  m.pop();
}

def('school_student_copying', {
  name: '抄作业的同学', cat: 'person', sfx: 'scream_m', mover: { kind: 'wander', speed: 0.5 }, fill: 0.4,
  tints: STUDENT_TINTS,
  build(m) {
    const hands = {};
    const o = {
      h: 1.6, hair: 'short', hairCol: HAIR, eyeW: 0.001, mouth: 'flat', blush: false, brows: 'cr_brow',
      lean: 0.15, nod: 0.06, headTurn: 0.2,
      armL: { to: [0.1, 0.16, 0.2], hint: [0.6, -1, -0.2], hold: (m, H) => { hands.L = here(m, H); } },
      armR: { to: [0.1, 0.16, 0.2], hint: [0.6, -1, -0.2], hold: (m, H) => { hands.R = here(m, H); } },
      extra(m, P) {
        inHead(m, P, o, hd => {
          const R = hd.r;
          m.sym(s => stick(m, hd, s * EU, EV, 'sp_eye_side', R * EW * 2.0, R * EW * 1.85));
          stick(m, hd, 0.85, 0.32, 'sp_sweat', R * 0.18, R * 0.26, -0.3);
        });
      },
    };
    student(m, o);
    // two open exercise books: the borrowed neat one (left), his own (right)
    openBook(m, hands.L.clone().add(V(0.05, 0.06, 0.05)), 0x3a8f5c, 'sp_page', 0.2);
    openBook(m, hands.R.clone().add(V(-0.05, 0.035, 0.07)), 0xf2a14a, 'sp_page_blank', 0.2);
    centreXZ(m);
  },
});

// ---- 班主任 ----------------------------------------------------------------------------------------
const CARDIGAN = 0xc2456c;
def('school_teacher', {
  name: '班主任', cat: 'person', sfx: 'scream_f', mover: { kind: 'wander', speed: 0.45 }, fill: 0.4,
  build(m) {
    const hands = {};
    const o = {
      h: 1.62, hair: 'none', glasses: 0x5a2a2a, brows: 'sp_brow_firm', browRoll: -0.15, mouth: 'flat',
      top: CARDIGAN, sleeve: 'long', hem: 0.02, waistK: 0.9, hipK: 1.05,
      bottom: 0x3c3f4c, flare: 1.15, shoe: 0x3a2a26,
      armL: { to: [0.07, 0.14, 0.17], hint: [0.6, -1, 0], cuff: 0xf6efe0, hold: (m, H) => { hands.L = here(m, H); } },
      armR: { to: [0.07, 0.14, 0.17], hint: [0.6, -1, 0], cuff: 0xf6efe0, hold: (m, H) => { hands.R = here(m, H); } },
      extra(m, P) {
        const T = P.T;
        inHead(m, P, o, hd => { // practical chin-length bob with a side-swept fringe
          const R = hd.r, c = 0x2a2220;
          hairCap(m, hd, c, 0.15 * R, 42 * D, -40 * D, 10);
          onFacet(m, hd, -0.2, 50 * D, () => m.ellipsoid(R * 0.66, R * 0.2, R * 0.12, c, 0, 0, 0, 0, 0, 0.25, 6), R * 0.02);
          m.sym(s => m.ellipsoid(R * 0.24, R * 0.5, R * 0.6, c, s * R * 0.9, -R * 0.2, -R * 0.12, 0, 0, s * 0.1, 5));
          m.ellipsoid(R * 0.82, R * 0.42, R * 0.3, c, 0, -R * 0.28, -R * 0.78, 0, 0, 0, 5);
        });
        // cream blouse collar over the cardigan
        const yc = 0.99 * T, zc = P.front(yc);
        m.sym(s => m.box(0.05, 0.035, 0.012, 0xfbf8f0, s * 0.03, yc, zc + 0.006, -0.35, s * 0.25, s * 0.55));
        for (let i = 0; i < 3; i++) { const y = (0.18 + i * 0.16) * T; m.sphere(0.009, 0xf2d8a0, 0.015, y, P.front(y) + 0.004, 1, 1, 0.5, 0, 0, 0, 4); }
      },
    };
    person(m, o);
    // pile of exercise books carried flat on the forearms
    const c = V(0, (hands.L.y + hands.R.y) / 2 + 0.03, (hands.L.z + hands.R.z) / 2 - 0.05);
    const cols = [0x5aa9e6, 0x5cae4f, 0xf2c14e, 0x5aa9e6, 0xe8554a, 0x5cae4f, 0x5aa9e6];
    for (let i = 0; i < cols.length; i++) {
      m.box(0.21, 0.013, 0.28, cols[i], c.x + ((i * 5) % 3 - 1) * 0.006, c.y + i * 0.014, c.z + ((i * 7) % 3 - 1) * 0.006, 0, ((i * 3) % 5 - 2) * 0.03, 0);
    }
    m.decal(0.15, 0.19, 'sp_cover', c.x, c.y + cols.length * 0.014 - 0.0075 + 0.0012, c.z, -90 * D, ((6 * 3) % 5 - 2) * 0.03, 0);
    // red pen clipped between fingers
    const h = hands.R;
    rod(m, V(h.x - 0.02, h.y - 0.02, h.z + 0.04), V(h.x - 0.06, h.y + 0.11, h.z + 0.05), 0.007, RED, 5);
    m.cone(0.007, 0.018, 0xf4f2ec, h.x - 0.067, h.y + 0.125, h.z + 0.052, 0, 0, 0.3, 5);
    centreXZ(m);
  },
});

// ---- 教导主任 --------------------------------------------------------------------------------------
def('school_dean', {
  name: '教导主任', cat: 'person', sfx: 'scream_m', mover: { kind: 'wander', speed: 0.45 },
  build(m) {
    let meg = null;
    const POLO = 0x4a78b8;
    const o = {
      h: 1.72, girth: 1.25, waistK: 1.1, hipK: 1.04, chestK: 1.06, depth: 0.88,
      hair: 'none', brows: 'sp_brow_dean', browRoll: -0.3, mouth: 'flat', blush: false,
      top: POLO, sleeve: 'short', hem: 0.02, bottom: 0x2e3038, belt: 0x2a2220, shoe: 0x221e1e,
      armL: { to: [0.19, 0.07, -0.04], hint: [1, 0.9, -0.5] }, // hand on hip
      armR: { to: [0.13, 0.16, 0.14], hint: [0.6, -1, -0.2], hold: (m, H) => { meg = here(m, H); } },
      extra(m, P) {
        const T = P.T, yc = 0.99 * T, zc = P.front(yc);
        // polo collar + placket
        m.sym(s => m.box(0.06, 0.04, 0.012, shade(POLO, 1.15), s * 0.035, yc, zc + 0.006, -0.35, s * 0.3, s * 0.6));
        m.box(0.03, 0.12, 0.008, shade(POLO, 0.88), 0, 0.92 * T, P.front(0.92 * T) + 0.003, -0.15, 0, 0);
        for (const t of [0.95, 0.89]) m.sphere(0.006, WHITE, 0, t * T, P.front(t * T) + 0.008, 1, 1, 0.5, 0, 0, 0, 4);
        inHead(m, P, o, hd => { // buzz cut + downturned mouth
          const R = hd.r;
          hairCap(m, hd, 0x2a2422, 0.12 * R, 44 * D, -14 * D, 12);
          stick(m, hd, 0, EV - 0.34, 'sp_frown', R * 0.26, R * 0.12, 0, 2.5);
        });
        // whistle on a red lanyard
        const w = front(P, 0.7 * T, 0.02);
        m.sym(s => {
          const a = front(P, 0.98 * T, 0.006); a.x = s * 0.05;
          rod(m, a, w.clone().add(V(s * 0.006, 0.02, -0.01)), 0.004, RED, 3);
        });
        m.cyl(0.022, 0.022, 0.04, STEEL, w.x, w.y, w.z, 0, 0, 90 * D, 8);
        m.box(0.045, 0.016, 0.018, STEEL, w.x - 0.032, w.y + 0.012, w.z, 0, 0, 0);
        m.sphere(0.008, INK, w.x + 0.021, w.y, w.z, 0.5, 1, 1, 0, 0, 0, 4);
      },
    };
    person(m, o);
    // handheld megaphone pointing forward
    const c = meg.clone().add(V(0, 0.07, 0.05));
    m.box(0.03, 0.08, 0.035, INK, c.x, c.y - 0.06, c.z - 0.02, 0.2, 0, 0); // grip
    m.cyl(0.045, 0.05, 0.12, WHITE, c.x, c.y, c.z, 90 * D, 0, 0, 8);
    m.cyl(0.11, 0.045, 0.16, WHITE, c.x, c.y, c.z + 0.14, 90 * D, 0, 0, 9);
    m.torus(0.11, 0.012, RED, c.x, c.y, c.z + 0.22, 0, 0, 0, TAU, 4, 12);
    m.decal(0.09, 0.09, 'sp_megaphone', c.x, c.y, c.z + 0.222, 0, 0, 0);
    m.cyl(0.045, 0.045, 0.012, RED, c.x, c.y, c.z - 0.06, 90 * D, 0, 0, 8);
    centreXZ(m);
  },
});
