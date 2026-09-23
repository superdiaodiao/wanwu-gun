// 万物皆可滚 · creatures — the neighbourhood's people and animals, 女娲 and the player's 小泥人.
//
// People share one chibi builder, person(m, opts): big round head (≈ 1/3 of the height), decal
// faces placed flat on the head's facets, short IK-posed limbs, swappable hair / hats / outfits and
// hand-held props. Animals share small builders per family (cats, dogs, birds). Everything faces +Z.
import * as THREE from 'three';
import { def } from './registry.js';
import { D, shade } from '../core/modeler.js';
import { decal, fitText, FONTS, getUV } from '../core/atlas.js';

// ---- palette ------------------------------------------------------------------------------------
const EYE = 0x2a1d17;
const SKIN = 0xf6d0aa, SKIN_OLD = 0xf0c49c, SKIN_TAN = 0xe0a878;
const HAIR_BLACK = 0x2e2624, HAIR_GREY = 0xb9b4ac, HAIR_WHITE = 0xe9e5dc;
const WHITE = 0xf4f2ec, INK = 0x26262c;
const RED = 0xd8342c, GOLD = 0xf2c14e, ORANGE = 0xf2a14a, TEAL = 0x2aa198;
const NAVY = 0x2c3e66, LEAF = 0x5cae4f, PINK = 0xf29aa6;

// ---- small math helpers -----------------------------------------------------------------------------
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const v3 = a => (a && a.isVector3 ? a.clone() : V(a[0], a[1], a[2]));
const UP = V(0, 1, 0);
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);

/** Euler XYZ angles turning local +Y into direction d. */
function eulerY(d) {
  const q = new THREE.Quaternion().setFromUnitVectors(UP, v3(d).normalize());
  const e = new THREE.Euler().setFromQuaternion(q, 'XYZ');
  return [e.x, e.y, e.z];
}

/** Euler XYZ angles for a frame whose +Z is n and +Y is as close to world up as possible (then rolled). */
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

/** Euler XYZ angles for a frame whose +Y is yDir and +X leans towards xHint. */
function basisY(yDir, xHint) {
  const y = v3(yDir).normalize();
  const z = V().crossVectors(v3(xHint), y).normalize();
  const x = V().crossVectors(y, z);
  const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
  const e = new THREE.Euler().setFromQuaternion(q, 'XYZ');
  return [e.x, e.y, e.z];
}

/** Current-frame point → model space. */
function here(m, p) { return v3(p).applyMatrix4(m.matrix); }
/** Model-space point → current frame. */
function toLocal(m, p) { return v3(p).applyMatrix4(m.matrix.clone().invert()); }

/** Cylinder from A (radius rA) to B (radius rB). */
function rod(m, A, B, rA, col, seg = 6, rB = rA) {
  A = v3(A); B = v3(B);
  const d = V().subVectors(B, A);
  const [rx, ry, rz] = eulerY(d);
  m.cyl(rB, rA, d.length(), col, (A.x + B.x) / 2, (A.y + B.y) / 2, (A.z + B.z) / 2, rx, ry, rz, seg);
}

/** Capsule from A to B (its round ends overlap the joints). */
function bone(m, A, B, r, col, seg = 6) {
  A = v3(A); B = v3(B);
  const d = V().subVectors(B, A);
  const [rx, ry, rz] = eulerY(d);
  m.capsule(r, Math.max(d.length(), 1e-4), col, (A.x + B.x) / 2, (A.y + B.y) / 2, (A.z + B.z) / 2, rx, ry, rz, seg);
}

/** Two-bone IK: joint position E for a limb from S towards G with lengths a, b, bending towards hint. */
function ik(S, G, a, b, hint) {
  const d = V().subVectors(G, S);
  let L = d.length();
  const Lmax = (a + b) * 0.999, Lmin = Math.abs(a - b) + 0.05 * (a + b);
  if (L > Lmax) { d.multiplyScalar(Lmax / L); L = Lmax; } else if (L < Lmin) { d.multiplyScalar(Lmin / Math.max(L, 1e-6)); L = Lmin; }
  const dir = d.clone().divideScalar(L);
  const x = (a * a - b * b + L * L) / (2 * L);
  const h = Math.sqrt(Math.max(0, a * a - x * x));
  const perp = hint.clone().addScaledVector(dir, -hint.dot(dir));
  if (perp.lengthSq() < 1e-8) perp.set(0, 0, 1).addScaledVector(dir, -dir.z);
  perp.normalize();
  return { E: S.clone().addScaledVector(dir, x).addScaledVector(perp, h), G: S.clone().add(d) };
}

function paint(m, on, fn) { if (on) m.tint(); fn(); if (on) m.tint(0); }

/** Radius of a lathe profile [[r, y], ...] at height y (linear). */
function profR(prof, y) {
  for (let i = 1; i < prof.length; i++) {
    const [r0, y0] = prof[i - 1], [r1, y1] = prof[i];
    if (y <= y1 && y1 > y0) return r0 + (r1 - r0) * clamp((y - y0) / (y1 - y0), 0, 1);
  }
  return prof[prof.length - 1][0];
}

// low-poly lumps (curls, fluff, rocks)
let _ico = null, _oct = null;
const ico = () => (_ico || (_ico = new THREE.IcosahedronGeometry(1, 0)));
const octa = () => (_oct || (_oct = new THREE.OctahedronGeometry(1, 0)));
function lump(m, r, col, x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
  m.geo(ico(), col, x, y, z, rx, ry, rz, r * sx, r * sy, r * sz);
}

/** Lathe with an atlas picture wrapped once around it (v follows real height). */
function texLathe(m, prof, key, seg = 8, col = 0xffffff, phiStart = 0, phiLen = Math.PI * 2) {
  const g = new THREE.LatheGeometry(prof.map(p => new THREE.Vector2(Math.max(0, p[0]), p[1])), seg, phiStart, phiLen);
  const pos = g.attributes.position, uv = g.attributes.uv;
  let y0 = Infinity, y1 = -Infinity;
  for (let i = 0; i < pos.count; i++) { y0 = Math.min(y0, pos.getY(i)); y1 = Math.max(y1, pos.getY(i)); }
  for (let i = 0; i < pos.count; i++) uv.setY(i, (pos.getY(i) - y0) / Math.max(1e-6, y1 - y0));
  m.geo(g, col, 0, 0, 0, 0, 0, 0, 1, 1, 1, getUV(key));
}

/** Part of a sphere surface with a picture mapped over it (aprons, 肚兜, printed patches). */
function texPatch(m, key, r, x, y, z, sx, sy, sz, phiC, phiLen, th0, thLen, seg = 8, rx = 0, ry = 0, rz = 0) {
  const g = new THREE.SphereGeometry(r, seg, Math.max(3, Math.round(seg * 0.75)), phiC - phiLen / 2, phiLen, th0, thLen);
  m.geo(g, 0xffffff, x, y, z, rx, ry, rz, sx, sy, sz, getUV(key));
}

/** Partial cylinder shell with a picture on it (arm bands, labels on round things). */
function texCyl(m, key, r, h, thetaC, thetaLen, x, y, z, rx = 0, ry = 0, rz = 0, seg = 6) {
  const g = new THREE.CylinderGeometry(r, r, h, seg, 1, true, thetaC - thetaLen / 2, thetaLen);
  m.geo(g, 0xffffff, x, y, z, rx, ry, rz, 1, 1, 1, getUV(key));
}

// ---- faceted sphere surface (so decals sit flat on the real low-poly facets) ------------------------
const _sphTris = new Map();
function sphereTris(seg) {
  let t = _sphTris.get(seg);
  if (!t) {
    const g = new THREE.SphereGeometry(1, seg, Math.max(3, Math.round(seg * 0.75))).toNonIndexed();
    const p = g.attributes.position;
    t = [];
    for (let i = 0; i < p.count; i += 3) t.push([V().fromBufferAttribute(p, i), V().fromBufferAttribute(p, i + 1), V().fromBufferAttribute(p, i + 2)]);
    _sphTris.set(seg, t);
  }
  return t;
}

/**
 * Surface point + facet normal of a sphere drawn with m.sphere(r, col, x, y, z, sx, sy, sz, 0, 0, 0, seg),
 * in direction yaw u (0 = +Z, + towards +X) and pitch v (+ up). hd = { r, sx, sy, sz, seg, x, y, z }.
 */
function facet(hd, u, v) {
  const { r, sx = 1, sy = 1, sz = 1, seg = 10 } = hd;
  const dir = V(Math.cos(v) * Math.sin(u) / sx, Math.sin(v) / sy, Math.cos(v) * Math.cos(u) / sz).normalize();
  const ray = new THREE.Ray(V(), dir), hit = V();
  for (const [a, b, c] of sphereTris(seg)) {
    if (ray.intersectTriangle(a, b, c, false, hit)) {
      const n = V().subVectors(b, a).cross(V().subVectors(c, a));
      n.set(n.x / sx, n.y / sy, n.z / sz).normalize();
      if (n.dot(dir) < 0) n.negate();
      return { p: V(hit.x * sx * r + (hd.x || 0), hit.y * sy * r + (hd.y || 0), hit.z * sz * r + (hd.z || 0)), n };
    }
  }
  return { p: V(dir.x * sx * r + (hd.x || 0), dir.y * sy * r + (hd.y || 0), dir.z * sz * r + (hd.z || 0)), n: dir };
}

/** Decal lying flat on the facet at (u, v). */
function stick(m, hd, u, v, key, w, h, roll = 0, off = null, col = 0xffffff) {
  const { p, n } = facet(hd, u, v);
  const o = off == null ? Math.max(0.0008, hd.r * Math.min(hd.sx || 1, hd.sy || 1, hd.sz || 1) * 0.012) : off;
  const [rx, ry, rz] = eulerZ(n, roll);
  m.decal(w, h, key, p.x + n.x * o, p.y + n.y * o, p.z + n.z * o, rx, ry, rz, col);
}

/** Run fn in a frame sitting on the facet at (u, v), +Z = outward normal. */
function onFacet(m, hd, u, v, fn, lift = 0) {
  const { p, n } = facet(hd, u, v);
  const [rx, ry, rz] = eulerZ(n);
  m.push(p.x + n.x * lift, p.y + n.y * lift, p.z + n.z * lift, rx, ry, rz);
  fn();
  m.pop();
}

/** Point on the (ideal) ellipsoid surface at (u, v), pushed out by k × r. */
function surf(hd, u, v, k = 1) {
  const r = hd.r * k;
  return V(Math.cos(v) * Math.sin(u) * r * (hd.sx || 1) + (hd.x || 0), Math.sin(v) * r * (hd.sy || 1) + (hd.y || 0), Math.cos(v) * Math.cos(u) * r * (hd.sz || 1) + (hd.z || 0));
}

// ---- swept tubes (tails, necks, horns, ribbons, the snake tail) ---------------------------------------
function frames(curve, n, up) {
  const T = [], N = [], B = [];
  for (let i = 0; i <= n; i++) T.push(curve.getTangentAt(i / n, V()));
  const u = up ? v3(up) : V(0, 1, 0);
  let n0 = u.clone().addScaledVector(T[0], -u.dot(T[0]));
  if (n0.lengthSq() < 1e-6) n0 = V(1, 0, 0).addScaledVector(T[0], -T[0].x);
  n0.normalize();
  N.push(n0); B.push(V().crossVectors(T[0], n0));
  for (let i = 1; i <= n; i++) {
    const q = new THREE.Quaternion().setFromUnitVectors(T[i - 1], T[i]);
    const ni = N[i - 1].clone().applyQuaternion(q);
    N.push(ni); B.push(V().crossVectors(T[i], ni));
  }
  return { T, N, B };
}

/**
 * Tube swept along a smooth path. o.r(t) → radius or [rN, rB] (elliptic section: rN along the
 * frame normal, which starts as o.up); o.col is a colour or (t, outward, i, j) → colour per quad.
 */
function sweep(m, pts, o) {
  const n = o.n || 12, sides = o.sides || 6;
  const curve = new THREE.CatmullRomCurve3(pts.map(v3), false, 'centripetal');
  const { T, N, B } = frames(curve, n, o.up);
  const rings = [], cents = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, c = curve.getPointAt(t), r = o.r(t);
    const ra = Array.isArray(r) ? r[0] : r, rb = Array.isArray(r) ? r[1] : r;
    const ring = [];
    for (let j = 0; j < sides; j++) {
      const a = ((j + (o.phase ?? 0.5)) / sides) * Math.PI * 2;
      ring.push(c.clone().addScaledVector(N[i], Math.cos(a) * ra).addScaledVector(B[i], Math.sin(a) * rb));
    }
    rings.push(ring); cents.push(c);
  }
  const groups = new Map();
  const colOf = (t, out, i, j) => (typeof o.col === 'function' ? o.col(t, out, i, j) : o.col);
  const tri = (col, a, b, c, out) => {
    const nrm = V().subVectors(b, a).cross(V().subVectors(c, a));
    if (nrm.dot(out) < 0) { const s = b; b = c; c = s; }
    let arr = groups.get(col);
    if (!arr) groups.set(col, (arr = []));
    arr.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
  };
  for (let i = 0; i < n; i++) {
    const mc = cents[i].clone().add(cents[i + 1]).multiplyScalar(0.5);
    for (let j = 0; j < sides; j++) {
      const j2 = (j + 1) % sides;
      const p00 = rings[i][j], p01 = rings[i][j2], p10 = rings[i + 1][j], p11 = rings[i + 1][j2];
      const out = V().add(p00).add(p01).add(p10).add(p11).multiplyScalar(0.25).sub(mc).normalize();
      const col = colOf((i + 0.5) / n, out, i, j);
      tri(col, p00, p01, p11, out);
      tri(col, p00, p11, p10, out);
    }
  }
  if (o.caps !== false) {
    for (const [i, sg] of [[0, -1], [n, 1]]) {
      const out = T[i].clone().multiplyScalar(sg), col = colOf(i / n, out, i, -1);
      for (let j = 0; j < sides; j++) tri(col, cents[i], rings[i][j], rings[i][(j + 1) % sides], out);
    }
  }
  for (const [col, arr] of groups) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3));
    g.computeVertexNormals();
    m.geo(g, col);
  }
  return curve;
}

/** Shift everything so the bounding box is centred on x = z = 0 (models with big props). */
function centreXZ(m) {
  const P = m.P;
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (let i = 0; i < P.length; i += 3) {
    if (P[i] < x0) x0 = P[i]; if (P[i] > x1) x1 = P[i];
    if (P[i + 2] < z0) z0 = P[i + 2]; if (P[i + 2] > z1) z1 = P[i + 2];
  }
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  for (let i = 0; i < P.length; i += 3) { P[i] -= cx; P[i + 2] -= cz; }
}

// ---- decals ---------------------------------------------------------------------------------------
const TAU = Math.PI * 2;
function ell(c, x, y, rx, ry, col) { c.fillStyle = col; c.beginPath(); c.ellipse(x, y, rx, ry, 0, 0, TAU); c.fill(); }

decal('cr_eye', 24, 30, (c, w, h) => {
  ell(c, w / 2, h / 2, w / 2 - 1.5, h / 2 - 1.5, '#2a1d17');
  ell(c, w * 0.64, h * 0.32, w * 0.17, w * 0.17, '#fffaf2');
});
decal('cr_eye_happy', 30, 18, (c, w, h) => { // ∩ closed smiling eyes
  c.strokeStyle = '#2a1d17'; c.lineWidth = 5; c.lineCap = 'round';
  c.beginPath(); c.ellipse(w / 2, h - 3, w / 2 - 5, h - 8, 0, Math.PI, 0); c.stroke();
});
decal('cr_eye_shut', 30, 16, (c, w, h) => { // ∪ sleeping eyes
  c.strokeStyle = '#2a1d17'; c.lineWidth = 4.5; c.lineCap = 'round';
  c.beginPath(); c.ellipse(w / 2, 4, w / 2 - 5, h - 8, 0, 0.1, Math.PI - 0.1); c.stroke();
});
decal('cr_mouth', 32, 16, (c, w, h) => { // small smile
  c.strokeStyle = '#8a3530'; c.lineWidth = 4; c.lineCap = 'round';
  c.beginPath(); c.ellipse(w / 2, 3, w / 2 - 5, h - 7, 0, 0.2, Math.PI - 0.2); c.stroke();
});
decal('cr_mouth_open', 32, 22, (c, w, h) => { // D-shaped laughing mouth with tongue
  c.fillStyle = '#8c2f2b';
  c.beginPath(); c.moveTo(3, 3); c.lineTo(w - 3, 3); c.ellipse(w / 2, 3, w / 2 - 3, h - 5, 0, 0, Math.PI); c.closePath(); c.fill();
  c.save(); c.clip();
  ell(c, w / 2, h - 1, w * 0.26, h * 0.36, '#ee8286');
  c.restore();
});
decal('cr_mouth_o', 20, 22, (c, w, h) => {
  ell(c, w / 2, h / 2, w / 2 - 2, h / 2 - 2, '#8c2f2b');
  ell(c, w / 2, h * 0.68, w * 0.24, h * 0.18, '#ee8286');
});
decal('cr_mouth_flat', 28, 10, (c, w, h) => {
  c.strokeStyle = '#8a3530'; c.lineWidth = 4; c.lineCap = 'round';
  c.beginPath(); c.moveTo(5, h / 2); c.quadraticCurveTo(w / 2, h / 2 + 2, w - 5, h / 2 - 1); c.stroke();
});
decal('cr_blush', 32, 18, (c, w, h) => ell(c, w / 2, h / 2, w / 2 - 1, h / 2 - 1, '#f59ea5'));
decal('cr_brow', 32, 12, (c, w, h) => {
  c.strokeStyle = '#3a2a22'; c.lineWidth = 5; c.lineCap = 'round';
  c.beginPath(); c.moveTo(4, h - 4); c.quadraticCurveTo(w / 2, 1, w - 4, h - 5); c.stroke();
});
decal('cr_brow_w', 32, 12, (c, w, h) => { // white eyebrows for grandpas
  c.strokeStyle = '#f2efe8'; c.lineWidth = 6; c.lineCap = 'round';
  c.beginPath(); c.moveTo(4, h - 4); c.quadraticCurveTo(w / 2, 1, w - 4, h - 5); c.stroke();
});

// floral print for aunties' blouses: flowers on transparent ground, tiles horizontally
decal('cr_floral', 128, 64, (c, w, h) => {
  const flower = (x, y, r, petal, mid) => {
    c.fillStyle = petal;
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * TAU - Math.PI / 2;
      c.beginPath(); c.arc(x + Math.cos(a) * r * 0.55, y + Math.sin(a) * r * 0.55, r * 0.5, 0, TAU); c.fill();
    }
    ell(c, x, y, r * 0.32, r * 0.32, mid);
  };
  const leaf = (x, y, a) => { c.save(); c.translate(x, y); c.rotate(a); ell(c, 0, 0, 5.5, 2.6, '#2f7d45'); c.restore(); };
  const P = ['#fff4ee', '#c8284a', '#f6e05a', '#fff4ee', '#e8554a', '#f6e05a', '#c8284a', '#fff4ee'];
  const M = ['#f2c14e', '#f6d77a', '#d8342c', '#e8554a', '#fff4ee', '#c8284a', '#fff4ee', '#5aa9e6'];
  const spots = [];
  for (let row = 0; row < 4; row++) for (let col = 0; col < 8; col++) {
    const x = col * 16 + (row % 2) * 8 + 4, y = row * 16 + 8 + ((col * 7) % 5) - 2;
    spots.push([x, y, 5.5 + ((row + col * 3) % 3), P[(row * 3 + col) % 8], M[(row + col * 5) % 8]]);
  }
  for (const dx of [-w, 0, w]) {
    for (const [x, y, r] of spots) { leaf(x + dx + r, y + r * 0.5, 0.6); leaf(x + dx - r * 0.9, y + r * 0.6, -0.7); }
    for (const [x, y, r, p, mid] of spots) flower(x + dx, y, r, p, mid);
  }
});
// tartan for the shopping trolley bag
decal('cr_plaid', 64, 64, (c, w, h) => {
  c.fillStyle = '#c8323a'; c.fillRect(0, 0, w, h);
  c.fillStyle = 'rgba(28,36,86,0.6)';
  for (let i = 0; i < 4; i++) { c.fillRect(i * 16 + 3, 0, 7, h); c.fillRect(0, i * 16 + 3, w, 7); }
  c.fillStyle = 'rgba(255,250,235,0.55)';
  for (let i = 0; i < 4; i++) { c.fillRect(i * 16 + 12, 0, 2, h); c.fillRect(0, i * 16 + 12, w, 2); }
});
// security guard arm band
decal('cr_armband', 64, 26, (c, w, h) => {
  c.fillStyle = '#d8342c'; c.fillRect(0, 0, w, h);
  fitText(c, '保安', w / 2, h / 2, w - 12, h - 6, FONTS.sans, '#f8d648');
});
// generic food-delivery box badge: a steaming bowl in a white circle (no brand)
decal('cr_bowl', 64, 64, (c, w, h) => {
  ell(c, w / 2, h / 2, w / 2 - 2, h / 2 - 2, '#fbf6ea');
  c.fillStyle = '#e8554a';
  c.beginPath(); c.moveTo(12, 34); c.lineTo(52, 34); c.ellipse(32, 34, 20, 15, 0, 0, Math.PI); c.closePath(); c.fill();
  c.strokeStyle = '#e8554a'; c.lineWidth = 3.5; c.lineCap = 'round';
  for (const x of [24, 32, 40]) { c.beginPath(); c.moveTo(x, 28); c.quadraticCurveTo(x - 4, 22, x, 17); c.quadraticCurveTo(x + 4, 12, x, 8); c.stroke(); }
});
// glowing phone screen
decal('cr_screen', 24, 44, (c, w, h) => {
  const g = c.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#bfe8ff'); g.addColorStop(1, '#7fc4f4');
  c.fillStyle = g; c.fillRect(0, 0, w, h);
  c.fillStyle = '#ffffff'; c.fillRect(3, 5, w - 6, 8);
  c.fillStyle = '#ffd36a'; c.fillRect(3, 16, 8, 8);
  c.fillStyle = '#ff8fa3'; c.fillRect(13, 16, 8, 8);
  c.fillStyle = '#ffffff'; c.fillRect(3, 27, w - 6, 3); c.fillRect(3, 33, w - 9, 3);
});
// 象棋 piece
decal('cr_chess', 32, 32, (c, w, h) => {
  ell(c, w / 2, h / 2, w / 2 - 1, h / 2 - 1, '#f3e2bd');
  c.strokeStyle = '#c8202a'; c.lineWidth = 2; c.beginPath(); c.arc(w / 2, h / 2, w / 2 - 4, 0, TAU); c.stroke();
  fitText(c, '炮', w / 2, h / 2, w - 11, h - 11, FONTS.serif, '#c8202a');
});

// animal eyes: coloured irises with slit or round pupils
function eyeDecal(key, iris, pupil) {
  decal(key, 24, 28, (c, w, h) => {
    ell(c, w / 2, h / 2, w / 2 - 1, h / 2 - 1, '#3a2a20');
    ell(c, w / 2, h / 2, w / 2 - 3, h / 2 - 3, iris);
    if (pupil === 'slit') ell(c, w / 2, h / 2, w * 0.12, h / 2 - 5, '#1c1410');
    else if (pupil === 'derp') ell(c, w * 0.36, h * 0.3, w * 0.2, w * 0.2, '#1c1410');
    else ell(c, w / 2, h / 2, w * 0.22, w * 0.22, '#1c1410');
    ell(c, w * 0.66, h * 0.3, w * 0.12, w * 0.12, '#ffffff');
  });
}
eyeDecal('cr_eye_green', '#b8c640', 'slit');
eyeDecal('cr_eye_yellow', '#f4cc3a', 'slit');
eyeDecal('cr_eye_amber', '#eca63a', 'slit');
eyeDecal('cr_eye_blue', '#6ab8f2', 'slit');
eyeDecal('cr_eye_husky', '#8fd2f6', 'round');
eyeDecal('cr_eye_derp', '#8fd2f6', 'derp');
eyeDecal('cr_eye_orange', '#f08a30', 'round');
decal('cr_dot', 16, 16, (c, w, h) => ell(c, w / 2, h / 2, w / 2 - 1, h / 2 - 1, '#ffffff'));
decal('cr_cat_mouth', 32, 14, (c, w, h) => { // ω
  c.strokeStyle = '#6a3a30'; c.lineWidth = 3.5; c.lineCap = 'round';
  c.beginPath(); c.arc(w / 2 - 6, 3, 6, 0.2, Math.PI - 0.2); c.stroke();
  c.beginPath(); c.arc(w / 2 + 6, 3, 6, 0.2, Math.PI - 0.2); c.stroke();
});
decal('cr_brow_angry', 32, 12, (c, w, h) => {
  c.fillStyle = '#2a1d17';
  c.beginPath(); c.moveTo(2, 2); c.lineTo(w - 2, h - 5); c.lineTo(w - 4, h - 1); c.lineTo(3, 7); c.closePath(); c.fill();
});
decal('cr_stripes', 32, 24, (c, w, h) => { // tabby cheek marks
  c.strokeStyle = '#3e332c'; c.lineWidth = 3.5; c.lineCap = 'round';
  for (const y of [6, 13, 20]) { c.beginPath(); c.moveTo(3, y); c.quadraticCurveTo(w / 2, y - 3, w - 3, y + 1); c.stroke(); }
});
decal('cr_tabby_m', 32, 24, (c, w, h) => { // the "M" on a tabby's forehead
  c.strokeStyle = '#3e332c'; c.lineWidth = 4; c.lineCap = 'round'; c.lineJoin = 'round';
  c.beginPath(); c.moveTo(3, h - 3); c.lineTo(9, 4); c.lineTo(w / 2, h - 8); c.lineTo(w - 9, 4); c.lineTo(w - 3, h - 3); c.stroke();
});
// butterfly wings (right side, seen from above): forewing towards the bottom edge (= front)
decal('cr_wing', 64, 64, (c, w, h) => {
  const fore = () => { c.beginPath(); c.moveTo(1, 34); c.bezierCurveTo(6, 60, 40, 66, 62, 56); c.bezierCurveTo(64, 44, 52, 34, 30, 32); c.closePath(); };
  const hind = () => { c.beginPath(); c.moveTo(1, 32); c.bezierCurveTo(24, 34, 52, 30, 52, 14); c.bezierCurveTo(50, 0, 20, 2, 1, 26); c.closePath(); };
  for (const f of [hind, fore]) {
    f(); c.fillStyle = '#ffffff'; c.fill();
    c.save(); f(); c.clip();
    c.strokeStyle = '#26262c'; c.lineWidth = 8; f(); c.stroke();
    c.lineWidth = 1.6; c.beginPath();
    for (const [x, y] of [[40, 60], [56, 50], [58, 40], [30, 6], [46, 12], [48, 24]]) { c.moveTo(2, 32); c.lineTo(x, y); }
    c.stroke();
    c.restore();
  }
  c.fillStyle = '#fff6d8';
  for (const [x, y] of [[56, 55], [60, 47], [47, 59], [38, 61], [46, 6], [51, 13]]) { c.beginPath(); c.arc(x, y, 1.9, 0, TAU); c.fill(); }
  ell(c, 32, 18, 5, 5, '#26262c'); ell(c, 32, 18, 2.5, 2.5, '#f6d24a');
});

// 女娲: big sparkly eyes, 花钿 forehead mark
decal('cr_nw_eye', 40, 52, (c, w, h) => {
  c.save();
  c.beginPath(); c.ellipse(w / 2, h / 2 + 2, w / 2 - 2, h / 2 - 4, 0, 0, TAU); c.clip();
  const g = c.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#2a1810'); g.addColorStop(0.55, '#5a3018'); g.addColorStop(1, '#c8782c');
  c.fillStyle = g; c.fillRect(0, 0, w, h);
  ell(c, w / 2, h * 0.52, w * 0.2, h * 0.2, '#1a0f0a');
  ell(c, w * 0.64, h * 0.3, w * 0.17, w * 0.17, '#ffffff');
  ell(c, w * 0.33, h * 0.72, w * 0.08, w * 0.08, '#fff2d0');
  c.restore();
  c.strokeStyle = '#1a0f0a'; c.lineWidth = 4; c.lineCap = 'round';
  c.beginPath(); c.ellipse(w / 2, h / 2 + 2, w / 2 - 3, h / 2 - 5, 0, Math.PI * 1.08, Math.PI * 1.92); c.stroke();
});
decal('cr_nw_mark', 20, 28, (c, w, h) => {
  c.fillStyle = '#d8342c';
  c.beginPath(); c.moveTo(w / 2, 2); c.quadraticCurveTo(w - 2, h * 0.6, w / 2, h - 2); c.quadraticCurveTo(2, h * 0.6, w / 2, 2); c.fill();
  ell(c, w / 2, h * 0.64, 3.5, 3.5, '#f6d05a');
});
// 小泥人: round rosy cheeks, red dot, and the 肚兜 with a five-colour trim and a gold 福
decal('cr_ck_cheek', 32, 32, (c, w, h) => { ell(c, w / 2, h / 2, w / 2 - 1, h / 2 - 1, '#ef6a6a'); ell(c, w * 0.4, h * 0.38, w * 0.12, w * 0.1, '#f79a90'); });
decal('cr_ck_dudou', 128, 128, (c, w, h) => {
  const P = [[38, 6], [90, 6], [124, 58], [64, 124], [4, 58]], cx = 64, cy = 62;
  const poly = (k, col) => {
    c.fillStyle = col; c.beginPath();
    P.forEach(([x, y], i) => { const X = cx + (x - cx) * k, Y = cy + (y - cy) * k; if (i) c.lineTo(X, Y); else c.moveTo(X, Y); });
    c.closePath(); c.fill();
  };
  poly(1, '#26262c'); poly(0.93, '#2aa198'); poly(0.85, '#f2c14e'); poly(0.77, '#f4f2ec'); poly(0.71, '#d8342c');
  ell(c, cx, 60, 23, 23, '#f2c14e'); ell(c, cx, 60, 20, 20, '#d8342c');
  fitText(c, '福', cx, 61, 34, 34, FONTS.brush, '#f2c14e');
});

// ---- people ----------------------------------------------------------------------------------------
// proportions in units of the total height H
const ADULT = { headR: 0.176, headY: 0.797, shoulderY: 0.6, hipY: 0.272, torsoR: 0.13, legR: 0.048, legX: 0.058, armR: 0.035, upper: 0.104, fore: 0.098, handR: 0.042, shoulderX: 0.13 };
const KID = { headR: 0.212, headY: 0.766, shoulderY: 0.522, hipY: 0.232, torsoR: 0.13, legR: 0.056, legX: 0.064, armR: 0.041, upper: 0.094, fore: 0.088, handR: 0.048, shoulderX: 0.14 };

const LOOK = {
  skin: SKIN, top: 0xe8e4da, topTint: false, topTex: null, sleeve: 'short', hem: 0.18,
  bottom: 0x3b3d4a, bottomTint: false, shorts: false, flare: 1.1,
  shoe: 0x3a3230, shoeType: 'shoe', sole: 0xf2efe6, sock: 0xf2f0ea,
  hair: 'short', hairCol: HAIR_BLACK, hat: null, hatCol: RED,
  eyes: 'dot', mouth: 'smile', brows: null, blush: true, glasses: false, beard: false, ears: true,
  hipK: 1, waistK: 0.95, chestK: 1, depth: 0.8, belly: 0,
};

function dims(o) {
  const H = o.h || 1.6, k = o.kid ? KID : ADULT, P = { H, kid: !!o.kid };
  for (const key in k) P[key] = k[key] * H;
  P.torsoR *= o.girth || 1;
  P.T = P.shoulderY - P.hipY;
  P.ankle = 0.04 * H;
  P.thigh = P.shin = (P.hipY - P.ankle) / 2;
  P.neck = P.headY - P.hipY - P.headR * 0.85;
  return P;
}

/**
 * Chibi person. Feet on y = 0, facing +Z. Returns { P, hands } (hands in the upper-body frame).
 * o: h, kid, look fields (see LOOK), sit (seat height), lean, nod, turn, armL/armR, legL/legR, extra.
 *    arm spec: { to: [out, up, fwd] in H units from the hip joint (x mirrored), at: model-space
 *    point, hint: elbow direction, hold(m, handPos, forearmDir, side) }.
 *    leg spec: { at: [out, y, z] ankle target (x mirrored) }.
 */
function person(m, o = {}) {
  const P = dims(o);
  const L = Object.assign({}, LOOK, o);
  const hipY = o.sit != null ? o.sit + P.legR * 0.8 : P.hipY * (o.crouch || 1);
  const hipZ = o.hipZ || 0;
  m.sym(s => drawLeg(m, P, L, s, hipY, hipZ, (s > 0 ? o.legL : o.legR) || o.legs || {}));
  m.push(0, hipY, hipZ, o.lean || 0, o.turn || 0, 0);
  drawTorso(m, P, L);
  const hands = {};
  m.sym(s => { hands[s > 0 ? 'L' : 'R'] = drawArm(m, P, L, s, (s > 0 ? o.armL : o.armR) || {}); });
  m.push(0, P.neck, 0, o.nod || 0, o.headTurn || 0, o.headTilt || 0);
  m.push(0, P.headR * 0.85, 0);
  drawHead(m, P, L);
  m.pop();
  m.pop();
  if (o.extra) o.extra(m, P, L);
  m.pop();
  return { P, hands, hipY };
}

function drawLeg(m, P, L, s, hipY, hipZ, sp) {
  const H = P.H, Hp = V(s * P.legX, hipY, hipZ);
  const A = sp.at ? V(s * sp.at[0], sp.at[1], sp.at[2]) : V(s * P.legX, P.ankle, hipZ);
  const a = P.thigh, b = P.shin;
  const botCol = L.bottomTint ? 0xffffff : L.bottom;
  let A2;
  if (Hp.distanceTo(A) >= (a + b) * 0.985) {
    A2 = Hp.clone().add(V().subVectors(A, Hp).setLength(a + b));
    const top = Hp.clone().add(V(0, 0.03 * H, 0));
    if (L.shorts) {
      const Kn = Hp.clone().lerp(A2, 0.42);
      paint(m, L.bottomTint, () => rod(m, top, Kn, P.legR * 1.18, botCol, 7, P.legR * 1.3));
      rod(m, Kn, A2, P.legR * 0.78, L.skin, 6, P.legR * 0.7);
    } else {
      paint(m, L.bottomTint, () => rod(m, top, A2, P.legR, botCol, 7, P.legR * L.flare));
    }
  } else {
    const r = ik(Hp, A, a, b, V(s * 0.25, 0.2, 1));
    A2 = r.G;
    paint(m, L.bottomTint, () => bone(m, Hp, r.E, P.legR * (L.shorts ? 1.15 : 1), botCol, 6));
    if (L.shorts) bone(m, r.E, A2, P.legR * 0.76, L.skin, 6);
    else paint(m, L.bottomTint, () => bone(m, r.E, A2, P.legR * 1.02, botCol, 6));
  }
  drawShoe(m, P, L, A2, sp.yaw || 0);
}

function drawShoe(m, P, L, A, yaw) {
  const H = P.H, w = 0.046 * H, h = 0.03 * H, l = 0.078 * H;
  const x = A.x, y = A.y - 0.012 * H, z = A.z + 0.024 * H;
  switch (L.shoeType) {
    case 'sneaker':
      m.sphere(1, L.shoe, x, y + 0.004 * H, z, w * 0.95, h * 0.95, l * 0.95, 0, yaw, 0, 6);
      m.sphere(1, L.sole, x, y - 0.012 * H, z, w * 1.02, h * 0.5, l * 1.02, 0, yaw, 0, 6);
      break;
    case 'sandal': // sandals over socks, obviously
      m.sphere(1, L.sock, x, y + 0.004 * H, z, w * 0.85, h * 0.85, l * 0.92, 0, yaw, 0, 6);
      m.box(w * 2.1, 0.012 * H, l * 2.05, L.shoe, x, 0.006 * H, z, 0, yaw, 0);
      m.box(w * 1.95, 0.016 * H, 0.018 * H, L.shoe, x, y + 0.012 * H, z + 0.03 * H, 0, yaw, 0);
      m.box(w * 1.9, 0.016 * H, 0.016 * H, L.shoe, x, y + 0.01 * H, z - 0.025 * H, 0, yaw, 0);
      break;
    default:
      m.sphere(1, L.shoe, x, y, z, w, h, l, 0, yaw, 0, 6);
  }
}

function drawTorso(m, P, L) {
  const H = P.H, T = P.T, r = P.torsoR, hk = L.hipK, wk = L.waistK, ck = L.chestK, bl = L.belly;
  const pants = [[0.001, -0.1 * T], [0.62 * r * hk, -0.085 * T], [0.95 * r * hk, 0], [r * hk, 0.14 * T], [r * wk, 0.42 * T], [0.001, 0.47 * T]];
  const topCol = L.topTint ? 0xffffff : L.top, botCol = L.bottomTint ? 0xffffff : L.bottom;
  m.push(0, 0, 0, 0, 0, 0, [1, 1, L.depth]);
  paint(m, L.bottomTint, () => m.lathe(pants, botCol, 0, 0, 0, 0, 0, 0, 8));
  let under = pants;
  if (L.vest) { // 老头衫 rolled up over the round belly
    const belly = [[0.001, 0.3 * T], [r * wk * 1.02, 0.3 * T], [r * (wk + bl), 0.5 * T], [r * (ck + bl * 0.6), 0.66 * T], [0.001, 0.72 * T]];
    m.lathe(belly, L.skin, 0, 0, 0, 0, 0, 0, 8);
    under = belly;
  }
  const hem = L.hem * T;
  const rh = profR(under, hem) * 1.07 + 0.003 * H;
  const top = [[0.001, hem - 0.02 * T], [rh, hem], [Math.max(rh * 0.97, r * wk * 1.03), Math.max(hem + 0.05 * T, 0.42 * T)], [r * ck, 0.7 * T], [r * 0.92 * ck, 0.86 * T], [r * 0.55, 1.0 * T], [r * 0.3, 1.08 * T], [0.001, 1.1 * T]];
  if (top[2][1] >= top[3][1]) top.splice(2, 1);
  paint(m, L.topTint, () => m.lathe(top, topCol, 0, 0, 0, 0, 0, 0, 8));
  if (L.topTex) texLathe(m, top.slice(1, top.length - 2).map(([rr, y]) => [rr * 1.02 + 0.001, y]), L.topTex, 8);
  if (L.vest) paint(m, L.topTint, () => m.torus(rh * 0.97, 0.013 * H, topCol, 0, hem + 0.003 * H, 0, 90 * D, 0, 0, TAU, 4, 10));
  if (L.belt) m.torus(r * wk * 1.02, 0.012 * H, L.belt, 0, 0.36 * T, 0, 90 * D, 0, 0, TAU, 4, 10);
  m.pop();
  if (L.vest) m.sphere(0.012 * H, shade(L.skin, 0.75), 0, 0.46 * T, r * (wk + bl) * L.depth * 0.98, 1, 1, 0.4, 0, 0, 0, 5); // belly button
  P.top = top; P.pants = pants; P.under = under;
  P.front = y => profR(top, y) * L.depth; // z of the shirt front at height y (hip frame)
}

function drawArm(m, P, L, s, sp) {
  const H = P.H;
  const S = V(s * P.shoulderX, P.T * 0.87, 0);
  let G;
  if (sp.at) G = toLocal(m, sp.at);
  else { const t = sp.to || [0.175, 0.07, 0.035]; G = V(s * t[0] * H, t[1] * H, t[2] * H); }
  const hint = sp.hint ? V(s * sp.hint[0], sp.hint[1], sp.hint[2]) : V(s * 0.45, -0.1, -0.9);
  const a = P.upper, b = P.fore + P.handR * 0.55;
  const { E, G: Hc } = ik(S, G, a, b, hint);
  const fdir = V().subVectors(Hc, E).normalize();
  const W = Hc.clone().addScaledVector(fdir, -P.handR * 0.75);
  const sl = L.sleeve, topCol = L.topTint ? 0xffffff : L.top;
  const r = P.armR;
  if (sl === 'long' || sl === 'wide') paint(m, L.topTint, () => bone(m, S, E, r * 1.05, topCol, 5));
  else {
    bone(m, S, E, r * 0.9, L.skin, 5);
    if (sl === 'short') paint(m, L.topTint, () => rod(m, S.clone().lerp(E, -0.25), S.clone().lerp(E, 0.55), r * 1.35, topCol, 6, r * 1.28));
  }
  if (sl === 'long') paint(m, L.topTint, () => bone(m, E, W, r, topCol, 5));
  else if (sl === 'wide') {
    paint(m, L.topTint, () => rod(m, E.clone().addScaledVector(fdir, -0.02 * H), W.clone().addScaledVector(fdir, 0.012 * H), r * 1.05, topCol, 6, r * 1.65));
    bone(m, E.clone().lerp(W, 0.6), W, r * 0.75, L.skin, 4);
  } else bone(m, E, W, r * 0.85, L.skin, 5);
  if (sp.cuff) rod(m, W.clone().addScaledVector(fdir, -0.012 * H), W.clone().addScaledVector(fdir, 0.004 * H), r * 1.12, sp.cuff, 6);
  m.sphere(P.handR, L.skin, Hc.x, Hc.y, Hc.z, 1, 1, 1, 0, 0, 0, 5);
  if (sp.hold) sp.hold(m, Hc, fdir, s, E, S);
  if (sp.band) sp.band(m, S, E, s, r * 1.05);
  return Hc;
}

function drawHead(m, P, L) {
  const R = P.headR;
  const hd = { r: R, sx: 1.05, sy: 0.97, sz: 1, seg: 10 };
  m.sphere(R, L.skin, 0, 0, 0, hd.sx, hd.sy, hd.sz, 0, 0, 0, hd.seg);
  if (L.ears) m.sym(s => m.sphere(R * 0.18, L.skin, s * R * 1.02, -R * 0.12, -R * 0.02, 0.5, 0.95, 0.75, 0, 0, 0, 4));
  // face
  const kid = P.kid;
  const eu = L.eyeU ?? (kid ? 0.4 : 0.36), ev = L.eyeV ?? (kid ? -0.14 : -0.1);
  const ew = R * (L.eyeW ?? (kid ? 0.19 : 0.17));
  m.sym(s => {
    if (L.eyes === 'happy') stick(m, hd, s * eu, ev + 0.02, 'cr_eye_happy', ew * 1.7, ew * 1.0);
    else if (L.eyes === 'shut') stick(m, hd, s * eu, ev, 'cr_eye_shut', ew * 1.6, ew * 0.85);
    else stick(m, hd, s * eu, ev, 'cr_eye', ew, ew * 1.25);
    if (L.blush) stick(m, hd, s * (eu + 0.26), ev - 0.2, 'cr_blush', R * 0.27, R * 0.15);
    if (L.brows) stick(m, hd, s * eu, ev + 0.24, L.brows, ew * 1.5, ew * 0.55, -s * (L.browRoll || 0));
  });
  const mk = { smile: 'cr_mouth', open: 'cr_mouth_open', o: 'cr_mouth_o', flat: 'cr_mouth_flat' }[L.mouth] || 'cr_mouth';
  const mw = L.mouth === 'o' ? 0.13 : L.mouth === 'open' ? 0.24 : 0.22;
  stick(m, hd, 0, ev - 0.34, mk, R * mw, R * mw * (L.mouth === 'o' ? 1.1 : L.mouth === 'open' ? 0.7 : 0.5));
  onFacet(m, hd, 0, ev - 0.15, () => m.sphere(R * 0.06, shade(L.skin, 0.93), 0, 0, 0, 1.1, 0.8, 0.9, 0, 0, 0, 4));
  if (L.glasses) glasses(m, hd, eu, ev, ew, L.glasses);
  if (L.beard) {
    const c = L.beard;
    onFacet(m, hd, 0, ev - 0.62, () => m.cone(R * 0.11, R * 0.34, c, 0, -R * 0.1, 0.0, 180 * D + 0.5, 0, 0, 5));
    m.sym(s => onFacet(m, hd, s * 0.12, ev - 0.25, () => m.ellipsoid(R * 0.13, R * 0.04, R * 0.04, c, 0, 0, 0, 0, 0, s * -0.35, 5)));
  }
  hair(m, hd, L);
  hat(m, hd, L);
}

function glasses(m, hd, eu, ev, ew, col) {
  const R = hd.r;
  const pts = [];
  m.sym(s => {
    const { p, n } = facet(hd, s * eu, ev);
    const c = p.clone().addScaledVector(n, R * 0.05);
    pts.push(c);
    const [rx, ry, rz] = eulerZ(n);
    m.torus(ew * 1.05, R * 0.02, col, c.x, c.y, c.z, rx, ry, rz, TAU, 3, 10);
    // arm to the ear
    rod(m, c.clone().add(V(s * ew * 1.0, 0, 0)), V(s * R * 1.0, ev * R, -R * 0.1), R * 0.018, col, 3);
  });
  rod(m, pts[0].clone().add(V(-ew, 0, 0)), pts[1].clone().add(V(ew, 0, 0)), R * 0.018, col, 3);
}

/** Hair shell whose hairline passes through elevation vf at the front and vb at the back. */
function hairCap(m, hd, col, t, vf, vb, seg = 10, sideTilt = 0) {
  const R = hd.r;
  const af = vf, ab = Math.PI - vb, ac = (af + ab) / 2, th = (ab - af) / 2;
  const d = (t * t + 2 * R * t) / (2 * R * (1 - Math.cos(th)) + 2 * t);
  const Rh = R + t - d;
  const ax = V(Math.sin(sideTilt) * Math.sin(ac), Math.sin(ac) * Math.cos(sideTilt), Math.cos(ac));
  m.push(hd.x || 0, hd.y || 0, hd.z || 0, 0, 0, 0, [hd.sx, hd.sy, hd.sz]);
  const [rx, ry, rz] = eulerY(ax);
  m.sphere(Rh, col, ax.x * d, ax.y * d, ax.z * d, 1, 1, 1, rx, ry, rz, seg);
  m.pop();
}

/**
 * Hair as a partial sphere shell hugging the head: a clean hairline (front at elevation vf, back at vb),
 * shell scale k (must clear the head's facets), bulge = extra [x, y, z] scale for volume.
 */
function hairShell(m, hd, col, vf, vb, k = 1.06, seg = 12, rings = 6, bulge = [1, 1, 1]) {
  const af = vf, ab = Math.PI - vb, ac = (af + ab) / 2, th = (ab - af) / 2;
  const g = new THREE.SphereGeometry(1, seg, rings, 0, TAU, 0, th);
  const R = hd.r * k;
  m.push(hd.x || 0, hd.y || 0, hd.z || 0, 0, 0, 0, [hd.sx * R * bulge[0], hd.sy * R * bulge[1], hd.sz * R * bulge[2]]);
  const [rx, ry, rz] = eulerY(V(0, Math.sin(ac), Math.cos(ac)));
  m.geo(g, col, 0, 0, 0, rx, ry, rz);
  m.pop();
}

const PERM = [
  [-28, 42, 0.23], [8, 47, 0.24], [42, 38, 0.22], [-66, 30, 0.21], [72, 24, 0.2],
  [-30, 74, 0.26], [35, 72, 0.26], [-105, 48, 0.25], [108, 50, 0.25],
  [-150, 58, 0.26], [150, 58, 0.26], [-128, 16, 0.23], [130, 18, 0.23], [180, 28, 0.25],
];

function hair(m, hd, L) {
  const R = hd.r, c = L.hairCol;
  switch (L.hair) {
    case 'perm': { // 烫发: a crown of chunky curls
      hairCap(m, hd, c, 0.16 * R, 34 * D, -28 * D, 8);
      m.jitter(0.1);
      for (const [u, v, k] of PERM) {
        if (L.hat === 'visor' && Math.abs(u) < 80 && v < 60) continue;
        const p = surf(hd, u * D, v * D, 1.07);
        lump(m, k * R, c, p.x, p.y, p.z, m.rng.range(0, 3), m.rng.range(0, 3), 0);
      }
      m.jitter(0);
      break;
    }
    case 'bald': { // 地中海: a fringe of grey around the back, a proud shiny top
      m.push(0, R * 0.02, -R * 0.06, 0, 0, 0, [hd.sx, hd.sy * 2.0, hd.sz]);
      m.torus(R * 0.93, R * 0.15, c, 0, 0, 0, -90 * D, 0, 2 * D, 176 * D, 5, 10);
      m.pop();
      for (const k of [-1, 0, 1]) { // three brave strands combed over the top
        const a = surf(hd, -70 * D, 40 * D + k * 0.12, 1.01), b = surf(hd, 0, 80 * D + k * 0.1, 1.03), e = surf(hd, 70 * D, 42 * D + k * 0.12, 1.01);
        sweep(m, [a, b, e], { n: 6, sides: 3, r: () => R * 0.025, col: c, caps: false });
      }
      break;
    }
    case 'short': {
      if (L.hat && L.hat !== 'headband') { hairShell(m, hd, c, 24 * D, -18 * D, 1.045, 10, 5); break; } // under a hat
      hairCap(m, hd, c, 0.13 * R, 44 * D, -12 * D, 8);
      onFacet(m, hd, 0.22, 50 * D, () => m.ellipsoid(R * 0.55, R * 0.2, R * 0.12, c, 0, 0, 0, 0, 0, -0.35, 6), R * 0.02);
      break;
    }
    case 'side': { // side-parted with a swoop
      hairCap(m, hd, c, 0.15 * R, 40 * D, -14 * D, 8);
      onFacet(m, hd, -0.3, 46 * D, () => m.ellipsoid(R * 0.62, R * 0.22, R * 0.14, c, 0, 0, 0, 0, 0, 0.3, 6), R * 0.03);
      break;
    }
    case 'crop': { // very short grey crop (older men)
      hairCap(m, hd, c, 0.08 * R, 50 * D, -8 * D, 8);
      break;
    }
    case 'bun': { // grandma: combed back into a bun
      hairCap(m, hd, c, 0.1 * R, 50 * D, -20 * D, 8);
      const p = surf(hd, 180 * D, 30 * D, 1.12);
      m.sphere(R * 0.32, c, p.x, p.y, p.z, 1, 0.9, 0.8, 0, 0, 0, 7);
      rod(m, p.clone().add(V(-R * 0.42, R * 0.1, -R * 0.05)), p.clone().add(V(R * 0.42, -R * 0.02, -R * 0.08)), R * 0.03, RED, 4);
      break;
    }
    case 'kid': {
      if (L.hat) { hairShell(m, hd, c, 20 * D, -20 * D, 1.045, 10, 5); break; } // just peeking out under the cap
      hairCap(m, hd, c, 0.13 * R, 42 * D, -15 * D, 8);
      onFacet(m, hd, 0, 52 * D, () => m.ellipsoid(R * 0.6, R * 0.18, R * 0.1, c, 0, 0, 0, 0, 0, 0, 6), R * 0.02);
      break;
    }
    case 'pigtails': {
      hairCap(m, hd, c, 0.13 * R, 40 * D, -30 * D, 8);
      onFacet(m, hd, 0, 50 * D, () => m.ellipsoid(R * 0.68, R * 0.2, R * 0.1, c, 0, 0, 0, 0, 0, 0, 6), R * 0.02);
      m.sym(s => {
        const p = surf(hd, s * 100 * D, 25 * D, 1.05);
        m.sphere(R * 0.12, L.hairTie || RED, p.x, p.y, p.z, 1, 1, 1, 0, 0, 0, 5);
        m.ellipsoid(R * 0.17, R * 0.3, R * 0.17, c, p.x + s * R * 0.14, p.y - R * 0.22, p.z - R * 0.04, 0, 0, s * 0.35, 6);
      });
      break;
    }
    default: break;
  }
}

function hat(m, hd, L) {
  const R = hd.r, c = L.hatCol;
  if (!L.hat) return;
  m.push(0, 0, 0, 0, 0, 0, [hd.sx, hd.sy, hd.sz]);
  switch (L.hat) {
    case 'cap': { // baseball cap
      m.dome(R * 1.07, c, 0, R * 0.16, -R * 0.04, 1, 0.92, 1, -0.2, 0, 0, 10);
      m.ellipsoid(R * 0.62, R * 0.06, R * 0.62, L.brimCol || c, 0, R * 0.4, R * 1.02, 0.05, 0, 0, 6);
      break;
    }
    case 'guard': { // peaked uniform cap
      m.cyl(R * 1.02, R * 1.02, R * 0.3, c, 0, R * 0.42, 0, 0, 0, 0, 10);
      m.cyl(R * 1.2, R * 1.04, R * 0.18, c, 0, R * 0.64, -R * 0.03, -0.06, 0, 0, 10);
      m.ellipsoid(R * 0.62, R * 0.05, R * 0.44, INK, 0, R * 0.3, R * 0.88, 0.22, 0, 0, 8);
      m.cyl(R * 1.03, R * 1.03, R * 0.06, GOLD, 0, R * 0.33, 0, 0, 0, 0, 10);
      m.sphere(R * 0.12, GOLD, 0, R * 0.47, R * 1.02, 1, 1.1, 0.45, 0, 0, 0, 6);
      break;
    }
    case 'chef': { // tall toque
      m.cyl(R * 0.98, R * 0.98, R * 0.36, WHITE, 0, R * 0.52, 0, 0, 0, 0, 10);
      m.cyl(R * 1.12, R * 0.97, R * 0.62, WHITE, 0, R * 0.96, 0, 0, 0, 0, 10);
      m.sphere(R * 1.18, WHITE, 0, R * 1.32, 0, 1, 0.5, 1, 0, 0, 0, 10);
      break;
    }
    case 'straw': { // wide straw hat
      m.cyl(R * 1.8, R * 1.85, R * 0.06, 0xe4c47c, 0, R * 0.5, 0, 0, 0, 0, 12);
      m.cyl(R * 0.72, R * 0.95, R * 0.5, 0xdcb86e, 0, R * 0.78, 0, 0, 0, 0, 8);
      m.cyl(R * 0.97, R * 0.99, R * 0.13, RED, 0, R * 0.6, 0, 0, 0, 0, 8);
      break;
    }
    case 'helmet': { // e-bike helmet
      m.pop();
      hairCap(m, hd, c, 0.2 * R, 30 * D, -12 * D, 8);
      m.push(0, 0, 0, 0, 0, 0, [hd.sx, hd.sy, hd.sz]);
      m.ellipsoid(R * 0.7, R * 0.07, R * 0.42, shade(c, 0.8), 0, R * 0.47, R * 0.86, 0.3, 0, 0, 6);
      m.box(R * 0.16, R * 0.12, R * 1.1, shade(c, 0.85), 0, R * 1.2, -R * 0.1, -0.25, 0, 0);
      m.sym(s => rod(m, V(s * R * 0.98, -R * 0.05, R * 0.02), V(s * R * 0.55, -R * 0.78, R * 0.35), R * 0.025, INK, 3));
      break;
    }
    case 'visor': { // 大妈 sun visor
      m.torus(R * 1.0, R * 0.05, c, 0, R * 0.36, 0, 90 * D + 0.1, 0, 0, TAU, 3, 10);
      const pts = [];
      for (let i = 0; i <= 10; i++) { const a = (i / 10) * Math.PI; pts.push([Math.cos(a) * R * 1.02, Math.sin(a) * R * 0.85]); }
      m.extrude(pts, R * 0.03, c, 0, R * 0.34, R * 0.72, 90 * D + 0.35, 0, 0);
      break;
    }
    case 'headband': {
      m.torus(R * 0.99, R * 0.07, c, 0, R * 0.36, -R * 0.02, 90 * D + 0.15, 0, 0, TAU, 4, 12);
      break;
    }
    case 'flatcap': { // 鸭舌帽
      m.ellipsoid(R * 1.08, R * 0.46, R * 1.12, c, 0, R * 0.56, R * 0.03, -0.12, 0, 0, 8);
      m.ellipsoid(R * 0.55, R * 0.05, R * 0.4, shade(c, 0.85), 0, R * 0.4, R * 0.92, 0.12, 0, 0, 6);
      break;
    }
    default: break;
  }
  m.pop();
}

// ---- props held by people ---------------------------------------------------------------------------
function folding(m, cx, cy, cz, ang, r, spread, cols, rim) { // folding fan, pleated, facing +Z
  const n = cols.length * 3;
  for (let i = 0; i < n; i++) {
    const a0 = ang - spread / 2 + (i / n) * spread, a1 = a0 + spread / n;
    m.extrude([[0, 0], [Math.cos(a0) * r, Math.sin(a0) * r], [Math.cos(a1) * r, Math.sin(a1) * r]], 0.008, cols[i % cols.length], cx, cy, cz + (i % 2) * 0.003);
  }
  if (rim) m.torus(r, 0.008, rim, cx, cy, cz + 0.003, 0, 0, ang - spread / 2, spread, 3, 10);
}

function palmFan(m, x, y, z, rx, ry, rz, k = 1) { // 蒲扇
  m.push(x, y, z, rx, ry, rz, k);
  const pts = [];
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * TAU;
    pts.push([Math.cos(a) * 0.13 * (1 - 0.1 * Math.sin(a)), 0.15 + Math.sin(a) * 0.14]);
  }
  m.extrude(pts, 0.008, 0xd8b068, 0, 0, 0);
  m.torus(0.13, 0.006, 0x9c6d3a, 0, 0.15, 0, 0, 0, 0, TAU, 3, 12);
  for (let i = -3; i <= 3; i++) m.box(0.004, 0.2, 0.011, 0xb88a4e, Math.sin(i * 0.28) * 0.1, 0.13 + Math.cos(i * 0.28) * 0.1 - 0.1, 0, 0, 0, -i * 0.28);
  m.cyl(0.011, 0.012, 0.1, 0x9c6d3a, 0, -0.03, 0, 0, 0, 0, 5);
  m.pop();
}

function redBag(m, H, s) { // 红色塑料袋 swinging from the hand
  m.torus(0.035, 0.006, 0xe23a36, H.x, H.y - 0.015, H.z, 0, 90 * D, 0, Math.PI, 3, 6);
  m.sphere(0.12, 0xe23a36, H.x, H.y - 0.16, H.z, 1, 0.95, 0.7, 0, 0, 0.1 * s, 7);
  lump(m, 0.05, LEAF, H.x - 0.03, H.y - 0.06, H.z + 0.02, 0.3, 0.5, 0);
  lump(m, 0.045, 0xf2a14a, H.x + 0.04, H.y - 0.05, H.z - 0.01, 0.8, 0.2, 0);
}

// =====================================================================================================
// People
// =====================================================================================================
def('auntie', {
  name: '大妈', cat: 'person', sfx: 'scream_f', mover: { kind: 'walk', speed: 0.9 },
  tints: [0xe8554a, 0xf08fb0, 0x4a9fe0, 0xf2a14a, 0x9b6ad0, 0x2fae8f],
  build(m) {
    person(m, {
      h: 1.6, hair: 'perm', hairCol: 0x33241f, topTint: true, topTex: 'cr_floral', sleeve: 'short', hem: 0.05,
      hipK: 1.14, waistK: 1.05, chestK: 1.06, bottom: 0x33354a, shoe: 0x3b2c28,
      armL: { to: [0.175, 0.07, 0.05] },
      armR: { to: [0.17, 0.09, 0.07], hold: (m, H, d, s) => redBag(m, H, s) },
    });
  },
});

def('auntie_dance', {
  name: '广场舞大妈', cat: 'person', sfx: 'scream_f', mover: { kind: 'dance' },
  tints: [0xf07ab0, 0x2aa198, 0x8e5ad6, 0x4aa3e6, 0xf2c14e],
  build(m) {
    person(m, {
      h: 1.6, hair: 'perm', hairCol: 0x6a2830, topTint: true, bottomTint: true, sleeve: 'long', hem: 0.12, flare: 1.35,
      hipK: 1.12, waistK: 1.02, chestK: 1.05, shoe: 0xd8342c, eyes: 'happy', mouth: 'open', belt: GOLD,
      armR: { to: [0.23, 0.63, 0.1], hint: [0.9, -0.2, -0.3], cuff: GOLD, hold: (m, H, d) => folding(m, H.x, H.y, H.z + 0.02, Math.atan2(d.y, d.x), 0.26, 150 * D, [0xd8342c, 0xee4b3e], GOLD) },
      armL: { to: [0.36, 0.36, 0.1], hint: [0, -1, 0], cuff: GOLD },
      extra(m, P) { // red silk flower on the chest
        const z = P.front(0.72 * P.T);
        m.sphere(0.035, RED, 0.08, 0.72 * P.T, z * 0.95, 1, 1, 0.5, 0, 0, 0, 6);
        m.sphere(0.014, GOLD, 0.08, 0.72 * P.T, z * 0.95 + 0.015, 1, 1, 0.5, 0, 0, 0, 5);
      },
    });
  },
});

function trolley(m, handle) { // 买菜小拖车 pulled behind: handle at `handle`, wheels on the ground
  const L = 0.78, wr = 0.085;
  const hy = handle.y - wr;
  const tilt = Math.acos(clamp(hy / L, 0.2, 1));
  const axleZ = handle.z - Math.sin(tilt) * L;
  m.push(handle.x, wr, axleZ, tilt, 0, 0);
  // wheels
  m.sym(s => m.cyl(wr, wr, 0.04, INK, s * 0.17, 0, 0, 0, 0, 90 * D, 10));
  // frame
  m.sym(s => rod(m, V(s * 0.14, 0, -0.02), V(s * 0.14, L, -0.02), 0.011, 0x8a8f96, 4));
  rod(m, V(-0.15, L, -0.02), V(0.15, L, -0.02), 0.018, INK, 5);
  m.box(0.3, 0.02, 0.18, 0x8a8f96, 0, 0.04, 0.08);
  // tartan bag
  m.tbox(0.28, 0.46, 0.2, 0xc8323a, { px: 'cr_plaid', nx: 'cr_plaid', pz: 'cr_plaid', nz: 'cr_plaid' }, 0, 0.29, 0.09);
  m.box(0.28, 0.02, 0.2, INK, 0, 0.525, 0.09);
  // 大葱 and a cabbage peeking out
  for (const [x, z, a, b] of [[-0.06, 0.06, -0.2, 0.12], [0.02, 0.11, 0.05, -0.1], [0.08, 0.05, 0.25, 0.05]]) {
    const base = V(x, 0.42, z), top = V(x + Math.sin(a) * 0.36, 0.42 + Math.cos(a) * 0.36, z + b * 0.3);
    rod(m, base, base.clone().lerp(top, 0.45), 0.018, 0xf2f0e2, 4, 0.017);
    rod(m, base.clone().lerp(top, 0.43), top, 0.017, 0x4f9e3e, 4, 0.008);
    m.cone(0.012, 0.16, 0x5cae4f, top.x + 0.03, top.y + 0.02, top.z, 0, 0, -0.6 - a, 4);
  }
  lump(m, 0.075, 0xa6d57a, -0.04, 0.55, 0.14, 0.3, 0.2, 0, 1, 0.85, 1);
  m.pop();
}

def('auntie_veg', {
  name: '买菜大妈', cat: 'person', sfx: 'scream_f', mover: { kind: 'walk', speed: 0.8 }, fill: 0.3,
  build(m) {
    let grip = null;
    person(m, {
      h: 1.6, hair: 'perm', hairCol: 0x3a2622, hat: 'visor', hatCol: 0x7a4ab0, top: 0xc35c8e, sleeve: 'long', hem: 0.06,
      hipK: 1.14, waistK: 1.06, chestK: 1.06, bottom: 0x2e3244, shoe: 0x3b2c28,
      armL: { to: [0.25, 0.12, -0.15], hint: [0.6, -0.4, 0.3], hold: (m, H) => { grip = here(m, H); } },
      armR: { to: [0.175, 0.08, 0.06] },
    });
    trolley(m, grip);
    centreXZ(m);
  },
});

def('uncle', {
  name: '大爷', cat: 'person', sfx: 'scream_m', mover: { kind: 'walk', speed: 0.8 },
  build(m) {
    person(m, {
      h: 1.74, skin: SKIN_OLD, hair: 'bald', hairCol: HAIR_GREY, top: 0xf4f2ea, sleeve: 'none', vest: true, hem: 0.66, belly: 0.3,
      waistK: 1.02, chestK: 1.02, bottom: 0x2b2b30, shoeType: 'sandal', shoe: 0x7a4a2c, sock: 0xe8e6e0, brows: 'cr_brow_w',
      armR: { to: [0.19, 0.42, 0.14], hint: [0.3, -1, -0.2], hold: (m, H, d, s) => palmFan(m, H.x + 0.01, H.y + 0.02, H.z + 0.02, 0.1, 0.3, 0.35, 1.1) },
      armL: { to: [0.175, 0.06, 0.04] },
    });
  },
});

def('uncle_taichi', {
  name: '太极大爷', cat: 'person', sfx: 'scream_m', mover: { kind: 'taichi' },
  build(m) {
    person(m, {
      h: 1.74, skin: SKIN_OLD, hair: 'crop', hairCol: HAIR_WHITE, beard: HAIR_WHITE, brows: 'cr_brow_w', eyes: 'happy',
      top: 0xf7f5ef, bottom: 0xf1eee6, sleeve: 'wide', hem: 0.1, flare: 1.35, crouch: 0.95, shoeType: 'sneaker', shoe: 0x2a2a2e, sole: 0xf0eee8,
      legs: { at: [0.11, 0.07, 0] },
      armL: { to: [0.1, 0.22, 0.26], hint: [0.8, -0.6, -0.2] },
      armR: { to: [0.26, 0.2, 0.12], hint: [0.6, -0.8, -0.2] },
      extra(m, P) { // frog buttons down the front
        for (let i = 0; i < 4; i++) {
          const y = (0.35 + i * 0.13) * P.T;
          m.box(0.05, 0.012, 0.012, 0x9a8f7e, 0, y, P.front(y) + 0.005);
        }
      },
    });
  },
});

function redStool(m, x, z, h = 0.3) { // 红色塑料凳
  const c = 0xd8342c;
  m.box(0.3, 0.035, 0.3, c, x, h - 0.018, z);
  m.box(0.26, 0.05, 0.26, shade(c, 0.9), x, h - 0.06, z);
  m.sym(s => m.sym(t => rod(m, V(x + s * 0.11, h - 0.05, z + t * 0.11), V(x + s * 0.14, 0, z + t * 0.14), 0.017, c, 4, 0.02)));
}

def('uncle_chess', {
  name: '下棋大爷', cat: 'person', sfx: 'scream_m', fill: 0.4,
  build(m) {
    redStool(m, 0, -0.02, 0.3);
    person(m, {
      h: 1.7, skin: SKIN_OLD, sit: 0.3, lean: 0.3, nod: 0.05, hair: 'crop', hairCol: HAIR_GREY, glasses: 0x3a302a, brows: 'cr_brow_w',
      top: 0x9cc7e0, sleeve: 'short', hem: 0.2, bottom: 0x6b6e76, shoe: 0x2a2624, mouth: 'open',
      legs: { at: [0.12, 0.068, 0.3] },
      armR: { to: [0.19, 0.5, 0.2], hint: [0.8, -0.6, 0], hold: (m, H) => { // about to slam down a 炮
        m.cyl(0.036, 0.036, 0.024, 0xe8c890, H.x, H.y + 0.05, H.z + 0.03, 1.3, 0, 0, 10);
        m.decal(0.06, 0.06, 'cr_chess', H.x, H.y + 0.05 + Math.cos(1.3) * 0.0125, H.z + 0.03 + Math.sin(1.3) * 0.0125, 1.3 - 90 * D, 0, 0);
      } },
      armL: { to: [0.13, 0.03, 0.22], hint: [0.3, -1, 0] },
    });
    centreXZ(m);
  },
});

function birdcage(m, top) { // 鸟笼 hanging below `top`
  const x = top.x, y = top.y, z = top.z;
  const r = 0.14, hb = 0.3, y0 = y - 0.05 - hb - r * 0.9;
  rod(m, V(x, y + 0.01, z), V(x, y0 + hb + r * 0.85, z), 0.006, 0x6b4a2c, 4); // hook
  m.cyl(r + 0.01, r + 0.01, 0.04, 0x8b5a3c, x, y0 + 0.02, z, 0, 0, 0, 10);
  m.cyl(r + 0.012, r + 0.012, 0.018, 0xa87a4a, x, y0 + hb, z, 0, 0, 0, 10);
  for (let i = 0; i < 8; i++) {
    const a = ((i + 0.5) / 8) * TAU;
    rod(m, V(x + Math.cos(a) * r, y0 + 0.03, z + Math.sin(a) * r), V(x + Math.cos(a) * r, y0 + hb, z + Math.sin(a) * r), 0.004, 0xc9a26a, 3);
  }
  for (const a of [0, 90 * D]) m.torus(r, 0.005, 0xc9a26a, x, y0 + hb, z, 0, a, 0, Math.PI, 3, 7);
  m.sphere(0.02, 0x8b5a3c, x, y0 + hb + r + 0.005, z, 1, 1, 1, 0, 0, 0, 4);
  // a little yellow bird on its perch
  rod(m, V(x - r, y0 + 0.12, z), V(x + r, y0 + 0.12, z), 0.005, 0x8b5a3c, 3);
  m.sphere(0.045, 0xf6d24a, x, y0 + 0.16, z, 1, 0.9, 1.25, 0, 0, 0, 5);
  m.sphere(0.034, 0xf6d24a, x, y0 + 0.215, z + 0.03, 1, 1, 1, 0, 0, 0, 5);
  m.cone(0.012, 0.025, ORANGE, x, y0 + 0.21, z + 0.068, 90 * D, 0, 0, 4);
  m.sym(s => m.box(0.008, 0.012, 0.004, EYE, x + s * 0.02, y0 + 0.225, z + 0.058));
  m.box(0.02, 0.012, 0.06, 0x7ab04a, x, y0 + 0.15, z - 0.07, 0.4, 0, 0);
}

def('uncle_birdcage', {
  name: '遛鸟大爷', cat: 'person', sfx: 'scream_m', mover: { kind: 'walk', speed: 0.7 }, fill: 0.35,
  build(m) {
    let top = null;
    person(m, {
      h: 1.7, skin: SKIN_OLD, hair: 'crop', hairCol: HAIR_GREY, hat: 'flatcap', hatCol: 0x6f6456, brows: 'cr_brow_w',
      top: 0x3d4a6b, sleeve: 'long', hem: 0.1, bottom: 0x55565c, shoe: 0x26262a,
      armR: { to: [0.16, 0.34, 0.24], hint: [0.3, -1, -0.2], hold: (m, H) => { top = here(m, H.clone().add(V(0, -0.03, 0.02))); } },
      armL: { to: [0.16, 0.12, -0.08], hint: [0.3, -0.3, 0.5] },
      extra(m, P) {
        for (let i = 0; i < 4; i++) {
          const y = (0.24 + i * 0.18) * P.T;
          m.box(0.05, 0.011, 0.012, 0xe9dcc0, 0, y, P.front(y) + 0.004);
        }
      },
    });
    birdcage(m, top);
    centreXZ(m);
  },
});

function foldStool(m, x, z, h) { // folding camp stool
  const c = 0x4a78b0, f = 0x9aa0a6;
  m.box(0.3, 0.02, 0.24, c, x, h, z);
  m.sym(s => {
    rod(m, V(x + s * 0.13, h, z - 0.11), V(x + s * 0.13, 0, z + 0.12), 0.01, f, 4);
    rod(m, V(x + s * 0.13, h, z + 0.11), V(x + s * 0.13, 0, z - 0.12), 0.01, f, 4);
  });
}

function bucket(m, x, z) {
  m.lathe([[0.001, 0], [0.1, 0], [0.12, 0.2], [0.115, 0.2], [0.001, 0.02]], 0x3f7fc0, x, 0, z, 0, 0, 0, 10);
  m.cyl(0.11, 0.11, 0.01, 0x7fb8e6, x, 0.17, z, 0, 0, 0, 10);
  m.torus(0.12, 0.004, 0x9aa0a6, x, 0.2, z, 0, 0, 0, Math.PI, 3, 8);
  lump(m, 0.04, 0x9aa0a6, x + 0.02, 0.18, z, 0, 0.5, 0, 0.5, 0.4, 1.4); // a fish!
}

def('fisherman', {
  name: '钓鱼大爷', cat: 'person', sfx: 'scream_m', fill: 0.12,
  build(m) {
    foldStool(m, 0, 0, 0.33);
    bucket(m, 0.42, 0.15);
    let hand = null, fwd = null;
    person(m, {
      h: 1.7, skin: SKIN_TAN, sit: 0.33, lean: 0.12, hair: 'crop', hairCol: HAIR_GREY, hat: 'straw', ears: false,
      top: 0xf2efe6, sleeve: 'long', hem: 0.12, bottom: 0x3e4250, shoe: 0x4a4038,
      legs: { at: [0.13, 0.068, 0.32] },
      armR: { to: [0.06, 0.25, 0.24], hint: [0.4, -1, 0], hold: (m, H) => { hand = here(m, H); } },
      armL: { to: [0.08, 0.2, 0.18], hint: [0.4, -1, 0], hold: (m, H) => { fwd = here(m, H); } },
      extra(m, P) { // khaki fishing vest with pockets
        m.push(0, 0, 0, 0, 0, 0, [1, 1, 0.8]);
        m.lathe(P.top.slice(1, 5).map(([r, y]) => [r * 1.08, y]), 0xb8a068, 0, 0, 0, 0, 0, 0, 8);
        m.pop();
        m.sym(s => m.box(0.08, 0.07, 0.02, 0x9c8752, s * 0.08, 0.34 * P.T, P.front(0.34 * P.T) * 1.08 + 0.01));
      },
    });
    // 3 m rod from the hands, out over the water, line and float
    const dir = V(0, Math.sin(32 * D), Math.cos(32 * D));
    const butt = hand.clone().addScaledVector(dir, -0.25), tip = hand.clone().addScaledVector(dir, 2.75);
    rod(m, butt, hand.clone().addScaledVector(dir, 0.2), 0.016, 0x3a302a, 5, 0.014);
    rod(m, hand.clone().addScaledVector(dir, 0.2), tip, 0.012, 0x6b4a2c, 4, 0.004);
    m.cyl(0.03, 0.03, 0.03, 0x9aa0a6, hand.x - 0.03, hand.y - 0.05, hand.z + 0.02, 0, 0, 90 * D, 8); // reel
    rod(m, tip, V(tip.x, 0.07, tip.z + 0.12), 0.003, 0xf4f2ec, 3);
    m.sphere(0.03, RED, tip.x, 0.03, tip.z + 0.12, 1, 1.2, 1, 0, 0, 0, 6);
    m.sphere(0.028, WHITE, tip.x, 0.07, tip.z + 0.12, 1, 0.8, 1, 0, 0, 0, 6);
    centreXZ(m);
  },
});

function backpack(m, P, col) {
  const T = P.T, z = -P.torsoR * 0.8 - 0.07 * P.H;
  m.rbox(0.2 * P.H, 0.26 * P.H, 0.12 * P.H, 0.03 * P.H, col, 0, 0.6 * T, z);
  m.box(0.14 * P.H, 0.1 * P.H, 0.05 * P.H, shade(col, 0.85), 0, 0.45 * T, z - 0.07 * P.H);
  m.sym(s => m.box(0.03 * P.H, 0.3 * P.H, 0.02 * P.H, shade(col, 0.8), s * 0.07 * P.H, 0.62 * T, P.front(0.62 * T) + 0.005, 0.1, 0, 0));
}

def('kid', {
  name: '小孩', cat: 'person', sfx: 'scream_kid', mover: { kind: 'wander', speed: 1.4 },
  tints: [0xf2c14e, 0x5aa9e6, 0xe8554a, 0x5cae4f, 0xf08fb0],
  build(m) {
    person(m, {
      h: 1.1, kid: true, hair: 'kid', hat: 'cap', hatCol: RED, brimCol: 0xf4f2ec, topTint: true, sleeve: 'short', hem: 0.12,
      bottom: 0x2f4d8a, shorts: true, shoeType: 'sneaker', shoe: 0xe8554a, mouth: 'open',
      armL: { to: [0.2, 0.08, 0.06] }, armR: { to: [0.2, 0.08, 0.06] },
      extra: (m, P) => backpack(m, P, 0x2f78c8),
    });
  },
});

def('kid_balloon', {
  name: '拿气球的小孩', cat: 'person', sfx: 'scream_kid', mover: { kind: 'wander', speed: 1.2 }, fill: 0.12,
  tints: [0xe8554a, 0xf2c14e, 0x5aa9e6, 0xf08fb0, 0x5cae4f],
  build(m) {
    let hand = null;
    person(m, {
      h: 1.1, kid: true, hair: 'pigtails', hairTie: 0xf08fb0, top: 0xfbe07a, sleeve: 'short', hem: 0.1,
      bottom: 0xd84a6a, shorts: true, shoeType: 'sneaker', shoe: 0xf08fb0, mouth: 'open', eyes: 'happy',
      armR: { to: [0.2, 0.52, 0.08], hint: [0.9, -0.3, -0.2], hold: (m, H) => { hand = here(m, H); } },
      armL: { to: [0.2, 0.08, 0.06] },
    });
    const bc = V(hand.x - 0.15, 2.0, hand.z - 0.05);
    m.tube([[hand.x, hand.y + 0.03, hand.z], [hand.x - 0.08, (hand.y + bc.y) / 2, hand.z + 0.03], [bc.x, bc.y - 0.22, bc.z]], 0.004, 0xf4f2ec, 3, false, 8);
    m.tint();
    m.sphere(0.2, 0xffffff, bc.x, bc.y, bc.z, 1, 1.12, 1, 0, 0, 0, 8);
    m.cone(0.03, 0.04, 0xffffff, bc.x, bc.y - 0.23, bc.z, 0, 0, 0, 5);
    m.tint(0);
    m.sphere(0.04, 0xfff8f0, bc.x - 0.07, bc.y + 0.09, bc.z + 0.14, 1, 1.4, 0.6, 0, 0, 0, 5); // shine
    centreXZ(m);
  },
});

def('young_phone', {
  name: '低头族', cat: 'person', sfx: 'scream_m', mover: { kind: 'walk', speed: 0.7 },
  tints: [0x8a93a3, 0x4a6fb0, 0xe8554a, 0x3fae7f, 0xf2c14e],
  build(m) {
    person(m, {
      h: 1.77, hair: 'short', hairCol: 0x2a2226, topTint: true, sleeve: 'long', hem: 0.05, nod: 0.45, lean: 0.05,
      bottom: 0x3a5a8c, shoeType: 'sneaker', shoe: 0xf2f0ea, sole: 0xd9d6ce, eyes: 'dot', mouth: 'o',
      armL: { to: [0.06, 0.26, 0.2], hint: [0.3, -1, 0] },
      armR: { to: [0.06, 0.26, 0.2], hint: [0.3, -1, 0], hold: (m, H) => {
        // phone between both hands, screen tilted up towards the face: normal (0, 0.8, -0.6)
        const a = -2.21, n = V(0, 0.8, -0.6), c = V(0, H.y + 0.045, H.z + 0.015);
        m.box(0.08, 0.15, 0.016, INK, c.x, c.y, c.z, a, 0, 0);
        m.glow(1);
        m.decal(0.068, 0.13, 'cr_screen', c.x + n.x * 0.0095, c.y + n.y * 0.0095, c.z + n.z * 0.0095, a, 0, 0);
        m.glow(0);
      } },
      extra(m, P) { // hood behind the neck + drawstrings + earbuds
        paint(m, true, () => m.ellipsoid(0.17, 0.09, 0.1, 0xffffff, 0, 1.0 * P.T, -0.13, -0.4, 0, 0, 7));
        m.sym(s => m.box(0.008, 0.12, 0.008, 0xf4f2ec, s * 0.045, 0.82 * P.T, P.front(0.82 * P.T) + 0.006));
      },
    });
    centreXZ(m);
  },
});

function ebike(m, grips, seatY) { // 电动车 with an insulated delivery box, ~1.8 m long, facing +Z
  const wr = 0.24, tire = 0x1f1f22, body = 0x3a3f48, trim = 0xc9cdd2, shell = 0xe0b12a;
  for (const z of [-0.6, 0.62]) {
    m.cyl(wr, wr, 0.09, tire, 0, wr, z, 0, 0, 90 * D, 10);
    m.cyl(wr * 0.55, wr * 0.55, 0.1, trim, 0, wr, z, 0, 0, 90 * D, 6);
  }
  m.box(0.3, 0.06, 0.6, body, 0, 0.3, 0.05); // floorboard
  m.cyl(0.17, 0.2, 0.58, body, 0, 0.48, -0.42, 90 * D, 0, 0, 8); // rear body under the seat
  m.box(0.32, 0.09, 0.56, INK, 0, seatY - 0.045, -0.36); // seat
  m.box(0.36, 0.58, 0.09, shell, 0, 0.62, 0.42, -0.26, 0, 0); // leg shield
  m.box(0.14, 0.05, 0.36, shell, 0, 0.5, 0.62, 0.15, 0, 0); // front mudguard
  rod(m, V(0, wr, 0.62), V(0, 0.96, 0.46), 0.025, trim, 5); // fork
  m.box(0.24, 0.14, 0.14, body, 0, 0.97, 0.46);
  m.glow(1);
  m.sphere(0.055, 0xfff3c4, 0, 0.97, 0.53, 1, 0.9, 0.5, 0, 0, 0, 6);
  m.glow(0);
  rod(m, V(grips[0].x - 0.02, grips[0].y, grips[0].z), V(grips[1].x + 0.02, grips[1].y, grips[1].z), 0.016, INK, 5);
  m.sym(s => rod(m, V(s * 0.2, grips[0].y, grips[0].z), V(s * 0.24, grips[0].y + 0.14, grips[0].z - 0.02), 0.006, trim, 3));
  m.sym(s => m.box(0.07, 0.045, 0.012, trim, s * 0.25, grips[0].y + 0.16, grips[0].z - 0.02, 0, 0, s * 0.2)); // mirrors
  // rear rack + insulated delivery box
  m.box(0.34, 0.03, 0.4, trim, 0, 0.68, -0.78);
  m.box(0.46, 0.4, 0.44, GOLD, 0, 0.9, -0.78);
  m.box(0.48, 0.05, 0.46, shade(GOLD, 0.88), 0, 1.115, -0.78);
  m.box(0.47, 0.05, 0.45, 0xf4f2ec, 0, 0.8, -0.78);
  m.decal(0.2, 0.2, 'cr_bowl', 0, 0.95, -0.558);
  m.decal(0.2, 0.2, 'cr_bowl', 0, 0.95, -1.002, 0, Math.PI, 0);
  m.sym(s => m.decal(0.2, 0.2, 'cr_bowl', s * 0.232, 0.95, -0.78, 0, s * 90 * D, 0));
  m.box(0.1, 0.05, 0.03, 0xe0282e, 0, 0.52, -0.72); // tail lamp
}

def('delivery_rider', {
  name: '外卖小哥', cat: 'person', sfx: 'scream_m', mover: { kind: 'drive', speed: 7 }, fill: 0.35,
  build(m) {
    const seatY = 0.66, grips = [V(0.28, 0.96, 0.4), V(-0.28, 0.96, 0.4)];
    ebike(m, grips, seatY);
    person(m, {
      h: 1.66, sit: seatY, hipZ: -0.3, lean: 0.3, hair: 'none', hat: 'helmet', hatCol: GOLD, ears: false,
      top: 0xf6c832, sleeve: 'long', hem: 0.08, bottom: 0x33384a, shoe: 0x2a2a2e,
      legs: { at: [0.13, 0.4, 0.04] },
      armL: { at: grips[0].clone().add(V(-0.03, 0.02, 0)), hint: [0.5, -1, 0] },
      armR: { at: grips[1].clone().add(V(0.03, 0.02, 0)), hint: [0.5, -1, 0] },
      extra(m, P) { // reflective stripe
        m.push(0, 0, 0, 0, 0, 0, [1, 1, 0.8]);
        m.cyl(profR(P.top, 0.55 * P.T) * 1.03, profR(P.top, 0.52 * P.T) * 1.03, 0.04, 0xe8eef0, 0, 0.535 * P.T, 0, 0, 0, 0, 8);
        m.pop();
      },
    });
  },
});

def('security_guard', {
  name: '保安', cat: 'person', sfx: 'scream_m', mover: { kind: 'wander', speed: 0.5 },
  build(m) {
    person(m, {
      h: 1.72, hair: 'short', hat: 'guard', hatCol: NAVY, top: 0x2f4270, sleeve: 'long', hem: 0.2, bottom: 0x283a60,
      shoe: 0x1f1f22, belt: 0x1f1f22, brows: 'cr_brow', mouth: 'flat',
      armL: { to: [0.17, 0.07, 0.02], band: (m, S, E, s, r) => {
        const c = S.clone().lerp(E, 0.5), d = V().subVectors(E, S);
        const [rx, ry, rz] = basisY(d, V(s, 0, 0));
        m.cyl(r * 1.12, r * 1.12, 0.07, RED, c.x, c.y, c.z, rx, ry, rz, 8);
        texCyl(m, 'cr_armband', r * 1.16, 0.07, 90 * D, 170 * D, c.x, c.y, c.z, rx, ry, rz, 6);
      } },
      armR: { to: [0.17, 0.07, 0.02] },
      extra(m, P) {
        m.sym(s => m.box(0.08, 0.015, 0.05, GOLD, s * 0.12, 0.99 * P.T, 0, 0, 0, -s * 0.25)); // epaulettes
        m.box(0.03, 0.07, 0.02, INK, -0.13, 0.33 * P.T, 0.1); // walkie-talkie
        m.cyl(0.004, 0.004, 0.05, INK, -0.13, 0.33 * P.T + 0.06, 0.1, 0, 0, 0, 3);
        m.sphere(0.018, GOLD, 0.07, 0.78 * P.T, P.front(0.78 * P.T) + 0.003, 1, 1, 0.4, 0, 0, 0, 6); // badge
      },
    });
  },
});

function steamer(m, c) { // 蒸笼 stack with a puff of steam
  const x = c.x, y = c.y, z = c.z, r = 0.16;
  for (let i = 0; i < 2; i++) m.cyl(r, r, 0.08, i ? 0xd6b27a : 0xc9a266, x, y + i * 0.085, z, 0, 0, 0, 8);
  m.cyl(r + 0.006, r + 0.006, 0.02, 0xa87c46, x, y + 0.043, z, 0, 0, 0, 8);
  m.cone(r + 0.01, 0.075, 0xd6b27a, x, y + 0.165, z, 0, 0, 0, 8);
  m.sphere(0.025, 0xa87c46, x, y + 0.21, z, 1, 0.7, 1, 0, 0, 0, 5);
  lump(m, 0.05, 0xf8f6f0, x - 0.06, y + 0.27, z);
  lump(m, 0.038, 0xf8f6f0, x - 0.09, y + 0.34, z + 0.02);
  lump(m, 0.042, 0xf8f6f0, x + 0.05, y + 0.3, z - 0.02);
}

def('chef', {
  name: '包子铺师傅', cat: 'person', sfx: 'scream_m', fill: 0.45,
  build(m) {
    person(m, {
      h: 1.7, hair: 'short', hat: 'chef', top: 0x8fb8d8, sleeve: 'short', hem: 0.15, girth: 1.1, belly: 0.12,
      bottom: 0x3a3a42, shoe: 0x26262a, eyes: 'happy', mouth: 'open',
      armL: { to: [0.13, 0.3, 0.24], hint: [0.6, -1, 0] },
      armR: { to: [0.13, 0.3, 0.24], hint: [0.6, -1, 0] },
      extra(m, P) {
        // white apron wrapped over the front, chest to knees
        const T = P.T, prof = [];
        for (const y of [-0.42, -0.2, 0.0, 0.3, 0.55, 0.7]) prof.push([Math.max(P.torsoR * (1.1 - y * 0.12), profR(P.top, y * T) * 1.06) + 0.004, y * T]);
        const g = new THREE.LatheGeometry(prof.map(p => new THREE.Vector2(p[0], p[1])), 6, -75 * D, 150 * D);
        m.geo(g, WHITE, 0, 0, 0, 0, 0, 0, 1, 1, 0.8);
        m.sym(s => rod(m, V(s * 0.1, 0.7 * T, P.front(0.7 * T) + 0.002), V(s * 0.07, 1.02 * T, 0.03), 0.012, WHITE, 3)); // neck strap
        m.box(0.09, 0.22, 0.03, 0xf4f2ec, 0.15, 0.93 * T, 0.0, 0, 0, -0.3); // towel over the shoulder
        steamer(m, V(0, 0.64 * T, 0.33));
      },
    });
  },
});

function stroller(m, handleL, handleR) { // baby stroller pushed in front
  const hy = (handleL.y + handleR.y) / 2, hz = (handleL.z + handleR.z) / 2;
  const frame = 0x9aa0a6, body = 0x5aa9e6, hood = 0x3f7fc0;
  rod(m, handleL.clone().add(V(0.04, 0, 0)), handleR.clone().add(V(-0.04, 0, 0)), 0.018, INK, 5);
  const z0 = hz + 0.2, z1 = hz + 0.72, yb = 0.5;
  m.sym(s => {
    rod(m, V(s * 0.19, hy, hz), V(s * 0.2, yb, z0 + 0.05), 0.012, frame, 4);
    rod(m, V(s * 0.2, yb, z0 + 0.05), V(s * 0.2, 0.09, z0 - 0.02), 0.012, frame, 4);
    rod(m, V(s * 0.2, yb, z1 - 0.05), V(s * 0.2, 0.09, z1 + 0.05), 0.012, frame, 4);
    for (const z of [z0 - 0.02, z1 + 0.05]) m.cyl(0.08, 0.08, 0.035, INK, s * 0.21, 0.08, z, 0, 0, 90 * D, 8);
  });
  // bassinet + blanket + canopy
  m.push(0, yb + 0.1, (z0 + z1) / 2, 0, 0, 0, [1, 0.62, 1]);
  m.capsule(0.19, 0.26, body, 0, 0, 0, 90 * D, 0, 0, 6);
  m.pop();
  m.box(0.34, 0.02, 0.36, 0xf6e6f0, 0, yb + 0.21, (z0 + z1) / 2 + 0.1);
  m.push(0, yb + 0.2, z0 + 0.12, 0, 0, 0);
  m.dome(0.2, hood, 0, 0, 0, 0.98, 1.15, 0.9, -80 * D, 0, 0, 8);
  m.pop();
  // the baby peeking out
  const bh = { r: 0.075, sx: 1, sy: 1, sz: 1, seg: 8, x: 0, y: yb + 0.26, z: z0 + 0.25 };
  m.sphere(bh.r, SKIN, bh.x, bh.y, bh.z, 1, 1, 1, 0, 0, 0, 8);
  m.dome(0.08, 0xf29ab8, bh.x, bh.y + 0.005, bh.z - 0.012, 1, 1, 1, -0.55, 0, 0, 8);
  m.sym(s => { stick(m, bh, s * 0.38, -0.05, 'cr_eye', 0.018, 0.022); stick(m, bh, s * 0.7, -0.3, 'cr_blush', 0.026, 0.015); });
  stick(m, bh, 0, -0.4, 'cr_mouth_o', 0.014, 0.015);
}

def('grandma_stroller', {
  name: '推婴儿车的奶奶', cat: 'person', sfx: 'scream_f', mover: { kind: 'walk', speed: 0.6 }, fill: 0.3,
  build(m) {
    const h = [];
    person(m, {
      h: 1.55, skin: SKIN_OLD, hair: 'bun', hairCol: 0xd6d2cb, top: 0x9a3a4e, sleeve: 'long', hem: 0.05, lean: 0.12,
      hipK: 1.1, waistK: 1.04, bottom: 0x2e2e36, shoe: 0x2a2426, eyes: 'happy', brows: 'cr_brow_w',
      armL: { to: [0.12, 0.25, 0.26], hint: [0.5, -1, 0], hold: (m, H) => { h[0] = here(m, H); } },
      armR: { to: [0.12, 0.25, 0.26], hint: [0.5, -1, 0], hold: (m, H) => { h[1] = here(m, H); } },
      extra(m, P) {
        for (let i = 0; i < 4; i++) { const y = (0.22 + i * 0.16) * P.T; m.box(0.022, 0.022, 0.01, 0xf2e2c0, 0, y, P.front(y) + 0.002); }
      },
    });
    stroller(m, h[0], h[1]);
    centreXZ(m);
  },
});

def('jogger', {
  name: '晨跑的人', cat: 'person', sfx: 'scream_m', mover: { kind: 'walk', speed: 2.4 },
  tints: [0xe8554a, 0x2f63c9, 0x2aa198, 0x8e5ad6, 0x3a3f4a],
  build(m) {
    const stripe = (m, H, d, s, E, S) => rod(m, S.clone().add(V(s * 0.045, 0.02, 0)), E.clone().add(V(s * 0.05, 0, 0)), 0.008, WHITE, 3);
    person(m, {
      h: 1.72, hair: 'short', hat: 'headband', hatCol: WHITE, topTint: true, bottomTint: true, sleeve: 'long', hem: 0.12, lean: 0.1,
      shoeType: 'sneaker', shoe: 0xf2f0ea, sole: 0xe8554a, mouth: 'open',
      armL: { to: [0.15, 0.2, 0.14], hint: [0.3, -0.6, -0.8], hold: stripe },
      armR: { to: [0.15, 0.17, -0.02], hint: [0.3, -0.6, -0.8], hold: stripe },
      extra(m, P) { // zip and towel
        m.box(0.01, 0.5 * P.T, 0.01, WHITE, 0, 0.62 * P.T, P.front(0.62 * P.T) + 0.004);
        m.torus(0.1, 0.022, WHITE, 0, 1.02 * P.T, 0.0, 90 * D + 0.2, 0, 0, TAU, 4, 10);
      },
    });
    // side stripes on the trousers
    m.sym(s => rod(m, V(s * 0.12, 0.5, 0.0), V(s * 0.13, 0.1, 0.0), 0.007, WHITE, 3));
  },
});

// =====================================================================================================
// Animals
// =====================================================================================================

// ---- cats (same proportions as the example 橘猫) -------------------------------------------------------
function cat(m, o) {
  const fur = o.fur, light = o.light ?? 0xfbe8c8, pink = o.pink ?? PINK;
  const head = { r: 0.095, sx: 1.08, sy: 0.92, sz: 0.95, seg: 10, x: 0, y: 0.255, z: 0.15 };
  const mz = { r: 1, sx: 0.048, sy: 0.032, sz: 0.03, seg: 6, x: 0, y: 0.222, z: 0.228 };
  m.ellipsoid(0.13, 0.115, 0.19, fur, 0, 0.145, -0.03, 0, 0, 0, 10);
  m.ellipsoid(0.098, 0.08, 0.13, o.belly ?? light, 0, 0.11, 0.01, 0, 0, 0, 6);
  m.sphere(head.r, o.headCol ?? fur, head.x, head.y, head.z, head.sx, head.sy, head.sz, 0, 0, 0, 10);
  m.sphere(1, o.muzzle ?? light, mz.x, mz.y, mz.z, mz.sx, mz.sy, mz.sz, 0, 0, 0, 6);
  m.sym(s => {
    m.cone(0.036, 0.062, (s > 0 ? o.earL : o.earR) ?? fur, s * 0.056, 0.33, 0.14, -0.1, 0, -s * 0.38, 4);
    m.cone(0.02, 0.036, o.earIn ?? pink, s * 0.054, 0.326, 0.152, -0.1, 0, -s * 0.38, 4);
    stick(m, head, s * 0.37, 0.04, (s > 0 ? o.eyeL : o.eyeR) || o.eye || 'cr_eye_green', 0.029, 0.034);
    stick(m, head, s * 0.7, -0.3, 'cr_blush', 0.03, 0.017);
    m.box(0.06, 0.0025, 0.0025, o.whisker ?? 0xfff7ea, s * 0.075, 0.226, 0.235, 0, s * 0.25, s * 0.12);
    m.box(0.055, 0.0025, 0.0025, o.whisker ?? 0xfff7ea, s * 0.072, 0.216, 0.232, 0, s * 0.3, -s * 0.05);
  });
  m.sphere(0.009, o.nose ?? pink, 0, 0.234, 0.258, 1.2, 0.8, 0.8, 0, 0, 0, 4);
  stick(m, mz, 0, -0.35, 'cr_cat_mouth', 0.026, 0.011, 0, 0.0008);
  const legs = o.legs || [];
  m.sym(s => {
    const i = s > 0 ? 0 : 1;
    m.capsule(0.036, 0.04, legs[i] ?? fur, s * 0.075, 0.057, 0.09, 0, 0, 0, 5);
    m.capsule(0.04, 0.04, legs[i + 2] ?? fur, s * 0.08, 0.061, -0.13, 0, 0, 0, 5);
    m.sphere(0.036, o.paw ?? light, s * 0.075, 0.022, 0.108, 1, 0.6, 1.15, 0, 0, 0, 5);
    m.sphere(0.04, o.paw ?? light, s * 0.08, 0.022, -0.115, 1, 0.6, 1.1, 0, 0, 0, 5);
  });
  const tailPts = o.tail || [[0, 0.15, -0.2], [0, 0.18, -0.28], [0.03, 0.27, -0.31], [0.055, 0.33, -0.26]];
  const tr = o.tailR ?? 0.023, tc = o.tailCol ?? fur;
  sweep(m, tailPts, { n: 10, sides: 5, r: t => tr * (1 - 0.25 * t), col: tc });
  const tip = tailPts[tailPts.length - 1];
  m.sphere(tr * 0.75, typeof tc === 'function' ? tc(1) : tc, tip[0], tip[1], tip[2], 1, 1, 1, 0, 0, 0, 5);
  if (o.extra) o.extra(m, head, mz);
}

def('cat_tabby', {
  name: '狸花猫', cat: 'animal', sfx: 'meow', fill: 0.5, mover: { kind: 'wander', speed: 0.6 },
  build(m) {
    const fur = 0xa08d76, dark = 0x4a3f36;
    cat(m, {
      fur, light: 0xeee3cf, eye: 'cr_eye_green', nose: 0xc98a86,
      tail: [[0, 0.15, -0.2], [0, 0.2, -0.29], [0, 0.3, -0.31], [0.02, 0.37, -0.27], [0.05, 0.37, -0.22]],
      tailCol: t => (Math.floor(t * 7) % 2 ? dark : fur),
      extra(m, head) {
        for (let i = 0; i < 4; i++) m.ellipsoid(0.128, 0.034, 0.017, dark, 0, 0.19, -0.16 + i * 0.06, 0, 0, 0, 6);
        m.ellipsoid(0.07, 0.03, 0.016, dark, 0, 0.21, 0.06, 0.4, 0, 0, 6);
        stick(m, head, 0, 0.5, 'cr_tabby_m', 0.05, 0.036);
        m.sym(s => stick(m, head, s * 0.95, -0.02, 'cr_stripes', 0.045, 0.034, s * 0.2));
      },
    });
  },
});

def('cat_black', {
  name: '黑猫', cat: 'animal', sfx: 'meow', fill: 0.5, mover: { kind: 'wander', speed: 0.6 },
  build(m) {
    const fur = 0x2f2c33;
    cat(m, {
      fur, light: 0x3b3740, belly: 0x36323b, muzzle: 0x403b45, earIn: 0x6e4c5c, nose: 0x6a4a56, whisker: 0xcfcad6, paw: 0x3b3740,
      eye: 'cr_eye_yellow',
      tail: [[0, 0.16, -0.2], [0, 0.26, -0.26], [0, 0.4, -0.27], [0.01, 0.49, -0.24], [0.04, 0.5, -0.19]],
      extra(m) { // red collar with a little gold bell
        m.torus(0.066, 0.011, RED, 0, 0.2, 0.115, 90 * D - 0.75, 0, 0, TAU, 4, 12);
        m.sphere(0.017, GOLD, 0, 0.16, 0.16, 1, 1, 1, 0, 0, 0, 6);
      },
    });
  },
});

def('cat_cow', {
  name: '奶牛猫', cat: 'animal', sfx: 'meow', fill: 0.5, mover: { kind: 'wander', speed: 0.6 },
  build(m) {
    const w = 0xf4f2ec, k = 0x2a2a2e;
    cat(m, {
      fur: w, light: 0xffffff, belly: 0xfbfaf6, muzzle: 0xffffff, paw: 0xfbfaf6, earL: k, eye: 'cr_eye_amber', whisker: 0xd8d4cc,
      legs: [k, w, w, w], tailCol: k,
      tail: [[0, 0.15, -0.2], [0, 0.17, -0.3], [-0.02, 0.24, -0.35], [-0.05, 0.31, -0.33]],
      extra(m, head, mz) {
        m.ellipsoid(0.134, 0.085, 0.13, k, 0, 0.185, -0.08, 0, 0, 0, 8); // saddle
        onFacet(m, head, 0.5, 0.35, () => m.ellipsoid(0.058, 0.055, 0.03, k, 0, 0, 0, 0, 0, 0.3, 6), -0.012);
        onFacet(m, head, -0.35, 0.75, () => m.ellipsoid(0.04, 0.03, 0.022, k, 0, 0, 0, 0, 0, 0, 5), -0.008);
        onFacet(m, mz, 0.3, -0.1, () => m.ellipsoid(0.014, 0.008, 0.004, k, 0, 0, 0, 0, 0, 0, 4)); // the moustache spot
      },
    });
  },
});

def('cat_white', {
  name: '白猫', cat: 'animal', sfx: 'meow', fill: 0.5, mover: { kind: 'wander', speed: 0.6 },
  build(m) {
    const w = 0xf6f4ee;
    cat(m, {
      fur: w, light: 0xffffff, belly: 0xffffff, muzzle: 0xffffff, paw: 0xffffff, earIn: 0xf5aebb, nose: 0xf29aa9, whisker: 0xe0dcd4,
      eyeL: 'cr_eye_blue', eyeR: 'cr_eye_amber', tailR: 0.032,
      tail: [[0, 0.14, -0.2], [0, 0.1, -0.3], [0.02, 0.13, -0.38], [0.05, 0.2, -0.4]],
      extra(m) {
        m.ellipsoid(0.1, 0.07, 0.06, 0xffffff, 0, 0.19, 0.12, -0.3, 0, 0, 8); // fluffy ruff
        m.sym(s => m.cone(0.018, 0.03, 0xf08fb0, 0.085 + s * 0.017, 0.36, 0.15, 0, 0, s * 90 * D, 4)); // pink bow
        m.sphere(0.009, 0xf08fb0, 0.085, 0.36, 0.15, 1, 1, 1, 0, 0, 0, 4);
      },
    });
  },
});

def('cat_sleeping', {
  name: '睡觉的橘猫', cat: 'animal', sfx: 'meow', fill: 0.6,
  build(m) {
    const fur = 0xf2a14a, light = 0xfbe8c8, stripe = 0xd4782a, pink = PINK;
    // curled loaf
    m.ellipsoid(0.15, 0.1, 0.19, fur, 0, 0.1, -0.03, 0, 0.25, 0, 10);
    for (let i = 0; i < 3; i++) m.ellipsoid(0.14, 0.03, 0.016, stripe, -0.03 + i * 0.025, 0.155, -0.12 + i * 0.07, 0, 0.25, 0, 6);
    // tail wrapped round the front
    sweep(m, [[-0.1, 0.06, -0.17], [-0.17, 0.045, -0.02], [-0.12, 0.035, 0.13], [0.0, 0.03, 0.2], [0.12, 0.03, 0.17]],
      { n: 12, sides: 5, r: t => 0.028 * (1 - 0.3 * t), col: t => (t > 0.85 ? stripe : fur) });
    m.sphere(0.0195, stripe, 0.12, 0.03, 0.17, 1, 1, 1, 0, 0, 0, 5);
    // front paws tucked under the chin
    m.sym(s => m.sphere(0.034, light, 0.05 + s * 0.04, 0.035, 0.14, 1, 0.6, 1.2, 0, 0.3, 0, 5));
    // head resting on the paws, tilted
    m.push(0.05, 0.12, 0.13, 0.15, -0.35, 0.3);
    const head = { r: 0.085, sx: 1.1, sy: 0.9, sz: 0.95, seg: 10, x: 0, y: 0, z: 0 };
    m.sphere(head.r, fur, 0, 0, 0, head.sx, head.sy, head.sz, 0, 0, 0, 10);
    m.ellipsoid(0.042, 0.028, 0.026, light, 0, -0.028, 0.07, 0, 0, 0, 6);
    m.box(0.012, 0.028, 0.01, stripe, 0, 0.066, 0.045, -0.6, 0, 0);
    m.sym(s => {
      m.cone(0.032, 0.052, fur, s * 0.05, 0.066, -0.008, -0.2, 0, -s * 0.42, 4);
      m.cone(0.018, 0.03, pink, s * 0.048, 0.063, 0.003, -0.2, 0, -s * 0.42, 4);
      stick(m, head, s * 0.38, 0.02, 'cr_eye_shut', 0.032, 0.016);
      stick(m, head, s * 0.72, -0.3, 'cr_blush', 0.028, 0.016);
    });
    m.sphere(0.008, pink, 0, -0.012, 0.095, 1.2, 0.8, 0.8, 0, 0, 0, 4);
    m.sphere(0.024, 0xbfe6fa, 0.022, -0.02, 0.105, 1, 1, 1, 0, 0, 0, 6); // 鼻涕泡
    m.pop();
  },
});

// ---- dogs ----------------------------------------------------------------------------------------------
/** Chibi dog, ~0.7 m nose-to-tail at k = 1. */
function dog(m, o) {
  const k = o.k || 1, fur = o.fur, cream = o.cream;
  m.push(0, 0, 0, 0, 0, 0, k);
  const head = { r: 0.13, sx: 1.06, sy: 0.95, sz: 0.95, seg: 10, x: 0, y: 0.53, z: 0.2 };
  const mz = { r: 1, sx: 0.072, sy: 0.056, sz: 0.078, seg: 8, x: 0, y: 0.485, z: 0.31 };
  // body
  m.ellipsoid(0.13, 0.125, 0.23, fur, 0, 0.3, -0.04, 0, 0, 0, 10);
  m.ellipsoid(0.1, 0.07, 0.18, o.belly ?? cream, 0, 0.215, -0.02, 0, 0, 0, 6);
  m.ellipsoid(0.115, 0.13, 0.1, fur, 0, 0.35, 0.13, 0, 0, 0, 8);
  m.ellipsoid(0.085, 0.1, 0.06, o.chest ?? cream, 0, 0.32, 0.19, -0.2, 0, 0, 6);
  // legs
  m.sym(s => {
    for (const [z, x] of [[0.13, 0.07], [-0.17, 0.075]]) {
      m.capsule(0.043, 0.17, fur, s * x, 0.16, z, 0, 0, 0, 5);
      m.capsule(0.044, 0.05, o.sock ?? cream, s * x, 0.075, z, 0, 0, 0, 5);
      m.sphere(0.047, o.sock ?? cream, s * x, 0.028, z + 0.018, 1, 0.6, 1.2, 0, 0, 0, 5);
    }
  });
  // head
  m.sphere(head.r, o.headCol ?? fur, head.x, head.y, head.z, head.sx, head.sy, head.sz, 0, 0, 0, 10);
  if (o.mask) o.mask(m, head);
  m.sphere(1, o.muzzle ?? cream, mz.x, mz.y, mz.z, mz.sx, mz.sy, mz.sz, 0, 0, 0, 8);
  m.sym(s => m.ellipsoid(0.05, 0.045, 0.04, o.cheek ?? cream, s * 0.075, 0.475, 0.265, 0, 0, 0, 6));
  m.ellipsoid(0.024, 0.017, 0.015, INK, 0, 0.515, 0.385, 0, 0, 0, 5);
  stick(m, mz, 0, -0.45, o.mouth || 'cr_mouth_open', 0.06, 0.04, 0, 0.001);
  m.sym(s => {
    stick(m, head, s * 0.36, 0.1, (s > 0 ? o.eyeL : o.eyeR) || 'cr_eye', 0.036, 0.044);
    if (o.brow) stick(m, head, s * 0.33, 0.34, 'cr_dot', 0.026, 0.02, 0, null, o.brow);
    stick(m, head, s * 0.66, -0.12, 'cr_blush', 0.04, 0.022);
    // pointy ears
    m.push(s * 0.078, 0.645, 0.16, -0.15, 0, -s * 0.28);
    m.cone(0.052, 0.1, o.ear ?? fur, 0, 0, 0, 0, 0, 0, 4);
    m.cone(0.032, 0.066, o.earIn ?? cream, 0, -0.008, 0.017, 0, 0, 0, 4);
    m.pop();
  });
  // curly tail over the back
  const tc = V(0, 0.5, -0.22);
  sweep(m, o.tail || [[0, 0.37, -0.25], [0, 0.46, -0.31], [0, 0.57, -0.27], [0, 0.58, -0.18], [0, 0.51, -0.15]], {
    n: 12, sides: 6, r: t => 0.048 * (1 - 0.35 * t),
    col: (t, out, i) => (out.dot(tc.clone().sub(V(0, 0.37 + t * 0.2, -0.25))) > 0 ? (o.tailIn ?? cream) : (o.tailOut ?? fur)),
  });
  if (o.extra) o.extra(m, head, mz);
  m.pop();
}

def('dog_shiba', {
  name: '柴犬', cat: 'animal', sfx: 'bark', fill: 0.45, mover: { kind: 'wander', speed: 1.0 },
  build(m) {
    dog(m, { fur: 0xdc8a3c, cream: 0xf8ead2, brow: 0xf8ead2, mouth: 'cr_mouth_open' });
  },
});

def('dog_husky', {
  name: '哈士奇', cat: 'animal', sfx: 'bark', fill: 0.45, mover: { kind: 'wander', speed: 1.2 },
  build(m) {
    const grey = 0x6f7884, white = 0xf2f1ee;
    dog(m, {
      k: 1.25, fur: grey, cream: white, sock: white, belly: white, chest: white, earIn: 0xf0c8cc, tailOut: grey, tailIn: white,
      eyeL: 'cr_eye_husky', eyeR: 'cr_eye_derp', brow: white, mouth: 'cr_mouth_open',
      mask(m, head) { // grey cap with the white face mask
        hairCap(m, head, grey, 0.012, 38 * D, -40 * D, 8);
        stick(m, head, 0, 0.42, 'cr_dot', 0.05, 0.1, 0, null, white);
      },
      extra(m, head, mz) { // tongue lolling out of the side of the grin
        m.ellipsoid(0.026, 0.045, 0.012, 0xf07e8a, 0.035, 0.425, 0.35, 0.3, 0.3, 0.35, 5);
      },
    });
  },
});

def('dog_teddy', {
  name: '泰迪', cat: 'animal', sfx: 'bark', fill: 0.5, mover: { kind: 'wander', speed: 1.1 },
  build(m) {
    const c1 = 0x9a5c34, c2 = 0xb06e42;
    m.ellipsoid(0.085, 0.075, 0.11, c1, 0, 0.15, -0.02, 0, 0, 0, 8);
    m.jitter(0.08);
    for (const [x, y, z, r] of [[0, 0.21, -0.03, 0.05], [0.06, 0.17, 0.04, 0.045], [-0.06, 0.17, 0.04, 0.045], [0.06, 0.16, -0.08, 0.045],
      [-0.06, 0.16, -0.08, 0.045], [0, 0.2, -0.1, 0.045], [0, 0.19, 0.07, 0.048]]) lump(m, r, c2, x, y, z, x * 20, z * 20, 0);
    m.sym(s => {
      for (const z of [0.06, -0.08]) { lump(m, 0.035, c2, s * 0.05, 0.035, z + 0.005, 0.2, s, 0); lump(m, 0.033, c1, s * 0.05, 0.085, z, 0.7, s, 0); }
    });
    lump(m, 0.035, c2, 0, 0.22, -0.13, 0.3, 0.3, 0); // pom tail
    const head = { r: 0.085, sx: 1, sy: 0.95, sz: 0.95, seg: 10, x: 0, y: 0.27, z: 0.09 };
    m.sphere(head.r, c1, head.x, head.y, head.z, head.sx, head.sy, head.sz, 0, 0, 0, 10);
    for (const [u, v, r] of [[0, 70, 0.042], [-40, 55, 0.036], [40, 55, 0.036], [0, 40, 0.034], [-70, 30, 0.034], [70, 30, 0.034], [180, 50, 0.04]]) {
      const p = surf(head, u * D, v * D, 1.0);
      lump(m, r, c2, p.x, p.y, p.z, u, v, 0);
    }
    m.sym(s => { // floppy fluffy ears
      lump(m, 0.036, c2, s * 0.085, 0.25, 0.07, 0.4, s, 0);
      lump(m, 0.032, c1, s * 0.09, 0.2, 0.065, 1.1, s, 0);
    });
    m.jitter(0);
    const mz = { r: 1, sx: 0.04, sy: 0.032, sz: 0.036, seg: 8, x: 0, y: 0.245, z: 0.165 };
    m.sphere(1, 0xc58a5c, mz.x, mz.y, mz.z, mz.sx, mz.sy, mz.sz, 0, 0, 0, 8);
    m.ellipsoid(0.015, 0.011, 0.01, INK, 0, 0.258, 0.198, 0, 0, 0, 5);
    stick(m, mz, 0, -0.5, 'cr_mouth_open', 0.03, 0.02, 0, 0.0008);
    m.sym(s => { stick(m, head, s * 0.34, 0.05, 'cr_eye', 0.022, 0.026); stick(m, head, s * 0.66, -0.25, 'cr_blush', 0.024, 0.014); });
  },
});

// ---- birds ---------------------------------------------------------------------------------------------
function beakCone(m, r, len, col, x, y, z, pitch = 0) { m.cone(r, len, col, x, y, z + len / 2, 90 * D + pitch, 0, 0, 5); }

function birdLegs(m, x, z, hip, len, col, toe) {
  m.sym(s => {
    m.cyl(len * 0.07, len * 0.07, len, col, s * x, hip - len / 2, z, 0, 0, 0, 4);
    for (const a of [-0.5, 0, 0.5]) m.box(len * 0.07, len * 0.05, toe, col, s * x + Math.sin(a) * toe * 0.45, len * 0.025, z + Math.cos(a) * toe * 0.45, 0, a, 0);
  });
}

def('pigeon', {
  name: '鸽子', cat: 'animal', sfx: 'coo', fill: 0.45, mover: { kind: 'fly' },
  build(m) {
    m.push(0, 0, 0, 0, 0, 0, 0.8);
    const grey = 0x9aa3ad, dark = 0x59616d, wing = 0xb3bac2;
    m.ellipsoid(0.075, 0.075, 0.13, grey, 0, 0.12, -0.02, -0.25, 0, 0, 8);
    m.ellipsoid(0.066, 0.07, 0.065, 0x6f9c86, 0, 0.165, 0.06, -0.3, 0, 0, 8); // iridescent neck
    m.ellipsoid(0.058, 0.04, 0.05, 0x8d6a9e, 0, 0.14, 0.085, -0.3, 0, 0, 6);
    const head = { r: 0.042, sx: 1, sy: 1, sz: 1.1, seg: 8, x: 0, y: 0.225, z: 0.09 };
    m.sphere(head.r, 0x7d8591, head.x, head.y, head.z, 1, 1, 1.1, 0, 0, 0, 8);
    beakCone(m, 0.011, 0.03, 0x3a3838, 0, 0.218, 0.134, 0.2);
    m.sphere(0.008, 0xf2f0ea, 0, 0.226, 0.135, 1.2, 0.8, 1, 0, 0, 0, 4);
    m.sym(s => stick(m, head, s * 0.95, 0.12, 'cr_eye_orange', 0.02, 0.022, 0, 0.0008));
    m.sym(s => {
      m.ellipsoid(0.03, 0.055, 0.11, wing, s * 0.063, 0.135, -0.04, -0.2, 0, s * 0.12, 8);
      for (const z of [-0.035, -0.075]) m.box(0.008, 0.03, 0.02, dark, s * 0.091, 0.135 - (z + 0.035) * 0.3, z, -0.2, 0, s * 0.12);
    });
    m.box(0.07, 0.018, 0.1, dark, 0, 0.1, -0.16, -0.35, 0, 0); // tail
    m.box(0.072, 0.02, 0.025, 0x3a3f48, 0, 0.083, -0.205, -0.35, 0, 0);
    birdLegs(m, 0.025, 0.02, 0.06, 0.06, 0xe06a6a, 0.028);
    m.pop();
  },
});

def('sparrow', {
  name: '麻雀', cat: 'animal', sfx: 'coo', fill: 0.5, mover: { kind: 'fly' },
  build(m) {
    m.push(0, 0, 0, 0, 0, 0, 0.86);
    const brown = 0xa3724a, streak = 0x4a3222, pale = 0xece2d0;
    m.ellipsoid(0.034, 0.034, 0.048, brown, 0, 0.045, -0.005, -0.2, 0, 0, 8);
    m.ellipsoid(0.028, 0.026, 0.036, pale, 0, 0.037, 0.008, -0.2, 0, 0, 6);
    const head = { r: 0.024, sx: 1, sy: 0.95, sz: 1, seg: 8, x: 0, y: 0.078, z: 0.025 };
    m.sphere(head.r, pale, head.x, head.y, head.z, 1, 0.95, 1, 0, 0, 0, 8);
    hairCap(m, head, 0x8a4a2a, 0.003, 35 * D, -35 * D, 8); // chestnut crown
    m.sym(s => onFacet(m, head, s * 1.15, -0.2, () => m.ellipsoid(0.0035, 0.0035, 0.001, INK, 0, 0, 0, 0, 0, 0, 4)));
    onFacet(m, head, 0, -0.95, () => m.ellipsoid(0.008, 0.007, 0.002, INK, 0, 0, 0, 0, 0, 0, 4)); // black bib
    beakCone(m, 0.006, 0.013, 0x3a3230, 0, 0.074, 0.046, 0.15);
    m.sym(s => stick(m, head, s * 0.62, 0.12, 'cr_eye', 0.008, 0.009, 0, 0.0004));
    m.sym(s => {
      m.ellipsoid(0.014, 0.024, 0.042, brown, s * 0.027, 0.05, -0.012, -0.2, 0, s * 0.15, 6);
      m.box(0.004, 0.008, 0.03, streak, s * 0.041, 0.052, -0.012, -0.2, 0, s * 0.15);
    });
    m.box(0.022, 0.006, 0.04, streak, 0, 0.042, -0.058, -0.45, 0, 0);
    birdLegs(m, 0.01, 0.005, 0.017, 0.017, 0xc9a07a, 0.012);
    m.pop();
  },
});

def('chicken', {
  name: '母鸡', cat: 'animal', sfx: 'cluck', fill: 0.5, mover: { kind: 'wander', speed: 0.5 },
  build(m) {
    const body = 0xc97c3e, dark = 0x7a4424, red = 0xe0322c, yellow = 0xf2b640;
    m.ellipsoid(0.11, 0.11, 0.15, body, 0, 0.19, -0.02, -0.15, 0, 0, 10);
    m.ellipsoid(0.08, 0.08, 0.07, 0xd88c4a, 0, 0.2, 0.1, 0, 0, 0, 8);
    m.sym(s => m.ellipsoid(0.03, 0.075, 0.11, 0xb86a30, s * 0.1, 0.2, -0.03, -0.1, 0, s * 0.1, 8)); // wings
    for (const [a, l] of [[-0.9, 0.11], [-0.55, 0.12], [-0.2, 0.1]]) m.ellipsoid(0.02, l, 0.035, dark, 0, 0.26, -0.15, a, 0, 0, 6); // tail
    const head = { r: 0.058, sx: 1, sy: 1, sz: 1.05, seg: 8, x: 0, y: 0.31, z: 0.11 };
    m.sphere(head.r, 0xd88c4a, head.x, head.y, head.z, 1, 1, 1.05, 0, 0, 0, 8);
    for (const [z, y, r] of [[0.08, 0.375, 0.02], [0.105, 0.382, 0.022], [0.13, 0.372, 0.018]]) m.sphere(r, red, 0, y, z, 0.6, 1, 1, 0, 0, 0, 5);
    beakCone(m, 0.014, 0.035, yellow, 0, 0.305, 0.165, 0.1);
    m.ellipsoid(0.012, 0.022, 0.01, red, 0, 0.268, 0.158, 0, 0, 0, 5); // wattle
    m.sym(s => { stick(m, head, s * 0.8, 0.12, 'cr_eye', 0.018, 0.021, 0, 0.0008); stick(m, head, s * 1.05, -0.2, 'cr_blush', 0.02, 0.012, 0, 0.0008); });
    birdLegs(m, 0.035, 0.0, 0.1, 0.1, yellow, 0.045);
  },
});

def('goose', {
  name: '大鹅', cat: 'animal', sfx: 'honk', fill: 0.4, mover: { kind: 'wander', speed: 0.7 },
  build(m) {
    const w = 0xf4f2ec, shadeW = 0xdcd8ce, orange = 0xf2932e;
    m.ellipsoid(0.17, 0.16, 0.28, w, 0, 0.3, -0.06, -0.12, 0, 0, 10);
    m.cone(0.09, 0.14, w, 0, 0.35, -0.36, -1.9, 0, 0, 6); // pointy tail
    // wings half spread: ready to charge
    m.sym(s => m.ellipsoid(0.035, 0.13, 0.26, shadeW, s * 0.19, 0.36, -0.08, -0.35, s * 0.25, s * 0.75, 8));
    // thick neck up, head craned forward, looking down at you
    sweep(m, [[0, 0.36, 0.14], [0, 0.48, 0.21], [0, 0.6, 0.2], [0, 0.69, 0.24], [0, 0.72, 0.3]], { n: 10, sides: 6, r: t => 0.064 - 0.02 * t, col: w });
    const head = { r: 0.064, sx: 0.95, sy: 1, sz: 1.15, seg: 8, x: 0, y: 0.73, z: 0.32 };
    m.sphere(head.r, w, head.x, head.y, head.z, head.sx, head.sy, head.sz, 0, 0, 0, 8);
    m.sphere(0.027, orange, 0, 0.76, 0.385, 1, 1, 1, 0, 0, 0, 6); // knob
    m.cone(0.028, 0.1, orange, 0, 0.73, 0.43, 90 * D + 0.1, 0, 0, 6); // upper bill
    m.cone(0.02, 0.075, 0xe07a24, 0, 0.705, 0.415, 90 * D + 0.5, 0, 0, 5); // lower bill: HONK
    m.ellipsoid(0.012, 0.004, 0.03, 0xe0485a, 0, 0.714, 0.41, 0.3, 0, 0, 4);
    m.sym(s => {
      stick(m, head, s * 0.72, 0.12, 'cr_eye', 0.024, 0.028, 0, 0.001);
      stick(m, head, s * 0.66, 0.42, 'cr_brow_angry', 0.042, 0.017, s * 0.35, 0.0012);
    });
    birdLegs(m, 0.07, 0.0, 0.17, 0.17, orange, 0.07);
    m.sym(s => { m.push(s * 0.07, 0.006, 0.05, 0, 0, 0, [1, 0.12, 1]); m.cone(0.055, 0.1, orange, 0, 0, 0, 90 * D, 0, 0, 3); m.pop(); }); // webbed feet
  },
});

function floatingDuck(m, o) { // body sits on the waterline (y = 0), faces +Z
  const k = o.k || 1;
  m.push(0, 0, 0, 0, 0, 0, k);
  m.ellipsoid(0.12, 0.085, 0.18, o.body, 0, 0.085, -0.02, 0, 0, 0, 10);
  if (o.breast) m.ellipsoid(0.1, 0.08, 0.08, o.breast, 0, 0.1, 0.1, 0, 0, 0, 8);
  if (o.back) m.ellipsoid(0.09, 0.05, 0.14, o.back, 0, 0.14, -0.05, 0, 0, 0, 8);
  m.sym(s => m.ellipsoid(0.03, 0.06, 0.13, o.wing, s * 0.1, 0.12, -0.05, -0.15, 0, s * 0.15, 8));
  if (o.speculum) m.sym(s => m.box(0.004, 0.022, 0.05, o.speculum, s * 0.128, 0.115, -0.07, -0.15, 0, s * 0.15));
  m.cone(0.05, 0.1, o.tail ?? o.body, 0, 0.13, -0.21, -1.8, 0, 0, 6);
  if (o.curl) m.torus(0.018, 0.005, o.curl, 0, 0.19, -0.2, 0, 90 * D, 0, 1.5 * Math.PI, 3, 8);
  const head = { r: 0.06, sx: 1, sy: 1, sz: 1.08, seg: 8, x: 0, y: 0.24, z: 0.11 };
  m.cyl(0.04, 0.05, 0.1, o.neck ?? o.head, 0, 0.18, 0.1, 0.25, 0, 0, 7);
  if (o.ring) m.torus(0.045, 0.008, o.ring, 0, 0.18, 0.1, 90 * D + 0.25, 0, 0, TAU, 3, 10);
  m.sphere(head.r, o.head, head.x, head.y, head.z, 1, 1, 1.08, 0, 0, 0, 8);
  if (o.tuft) lump(m, 0.02, o.head, 0, 0.3, 0.1, 0.5, 0.5, 0);
  m.ellipsoid(0.03, 0.012, 0.05, o.bill, 0, 0.228, 0.19, 0.12, 0, 0, 6);
  m.sym(s => { stick(m, head, s * 0.62, 0.15, 'cr_eye', 0.018, 0.022, 0, 0.0008); stick(m, head, s * 0.85, -0.15, 'cr_blush', 0.022, 0.012, 0, 0.0008); });
  m.pop();
}

def('duck', {
  name: '鸭子', cat: 'animal', sfx: 'quack', fill: 0.5, mover: { kind: 'swim', speed: 0.4 },
  build(m) {
    floatingDuck(m, { k: 0.82, body: 0xc9c5bc, breast: 0x8e4a36, back: 0x7d6e5e, wing: 0x9a8c7c, speculum: 0x3a5ad0, tail: 0x3a3a3e, curl: 0x2a2a2e,
      head: 0x2f7a4a, neck: 0x2f7a4a, ring: 0xf4f2ec, bill: 0xf0c83a });
  },
});

def('duckling', {
  name: '小鸭子', cat: 'animal', sfx: 'quack', fill: 0.55, mover: { kind: 'swim', speed: 0.4 },
  build(m) {
    floatingDuck(m, { k: 0.31, body: 0xf8d85a, wing: 0xf2c84a, head: 0xf8d85a, bill: 0xf2932e, tuft: true });
  },
});

def('koi', {
  name: '锦鲤', cat: 'animal', sfx: 'squish', fill: 0.5, mover: { kind: 'swim', speed: 0.5 },
  build(m) {
    const white = 0xf6f2ea, red = 0xe8552e, black = 0x2a2a2e, fin = 0xf8dcc0;
    const path = [[0.03, 0.07, -0.24], [0.0, 0.07, -0.12], [-0.02, 0.07, 0.02], [0.0, 0.07, 0.16], [0.01, 0.07, 0.22]];
    const curve = sweep(m, path, {
      n: 14, sides: 8,
      r: t => { const b = t < 0.7 ? 0.018 + 0.06 * Math.sin((t / 0.7) * Math.PI / 2) : 0.078 - 0.05 * Math.pow((t - 0.7) / 0.3, 2); return [b * 0.8, b * 0.62]; },
      col: (t, out) => {
        if (out.y < -0.35) return white;
        if ((t > 0.2 && t < 0.42) || (t > 0.55 && t < 0.74) || t > 0.86) return red;
        if (t > 0.46 && t < 0.52 && out.x > 0.3) return black;
        return white;
      },
    });
    const head = curve.getPointAt(0.92), tail = curve.getPointAt(0.0);
    // eyes, mouth, barbels
    m.sym(s => m.sphere(0.009, EYE, head.x + s * 0.034, head.y + 0.012, head.z - 0.005, 0.6, 1, 1, 0, 0, 0, 5));
    m.torus(0.012, 0.004, 0xf0a0a0, head.x, head.y - 0.004, head.z + 0.052, 0, 0, 0, TAU, 3, 8);
    m.sym(s => m.box(0.03, 0.002, 0.002, fin, head.x + s * 0.02, head.y - 0.012, head.z + 0.045, 0, s * 0.6, 0));
    // fins
    m.sym(s => m.ellipsoid(0.045, 0.004, 0.025, fin, s * 0.07, 0.03, 0.08, 0, s * -0.6, s * -0.25, 6));
    m.sym(s => m.ellipsoid(0.03, 0.004, 0.018, fin, s * 0.045, 0.025, -0.07, 0, s * -0.5, s * -0.3, 5));
    m.extrude([[0, 0], [0.03, 0.035], [0.12, 0.028], [0.15, 0]], 0.004, red, 0.0, 0.108, 0.05, 0, 90 * D, 0); // dorsal
    m.extrude([[0, 0], [-0.08, 0.075], [-0.05, 0.005], [-0.08, -0.07]], 0.005, fin, tail.x, tail.y, tail.z + 0.012, 0, 90 * D, 0); // tail fin
    m.extrude([[-0.03, 0.045], [-0.055, 0.035], [-0.04, 0.012]], 0.006, red, tail.x, tail.y, tail.z + 0.012, 0, 90 * D, 0);
  },
});

def('buffalo', {
  name: '水牛', cat: 'animal', sfx: 'moo', fill: 0.5, mover: { kind: 'wander', speed: 0.3 },
  build(m) {
    const hide = 0x5a5e66, dark = 0x464a52, horn = 0x5e554c, muzzle = 0x9c8e8a, hoof = 0x2c2c30;
    m.ellipsoid(0.5, 0.46, 0.92, hide, 0, 1.0, -0.12, 0, 0, 0, 10);
    m.ellipsoid(0.45, 0.42, 0.42, hide, 0, 1.12, 0.45, 0, 0, 0, 8);
    m.ellipsoid(0.36, 0.2, 0.7, dark, 0, 0.7, -0.05, 0, 0, 0, 8);
    // legs
    m.sym(s => {
      for (const z of [0.5, -0.72]) {
        m.cyl(0.1, 0.075, 0.7, dark, s * 0.28, 0.43, z, 0, 0, 0, 7);
        m.cyl(0.085, 0.09, 0.1, hoof, s * 0.28, 0.05, z + 0.01, 0, 0, 0, 7);
      }
    });
    // head hanging forward, pale muzzle
    const head = { r: 1, sx: 0.23, sy: 0.27, sz: 0.34, seg: 8, x: 0, y: 1.02, z: 0.98 };
    m.push(head.x, head.y, head.z, 0.55, 0, 0);
    const h0 = { ...head, x: 0, y: 0, z: 0 };
    m.sphere(1, hide, 0, 0, 0, h0.sx, h0.sy, h0.sz, 0, 0, 0, 8);
    m.ellipsoid(0.19, 0.15, 0.15, muzzle, 0, -0.06, 0.28, 0, 0, 0, 8);
    m.sym(s => {
      m.sphere(0.03, 0x3a3236, s * 0.07, -0.02, 0.425, 1, 0.7, 0.5, 0, 0, 0, 4);
      stick(m, h0, s * 0.62, 0.15, 'cr_eye', 0.07, 0.08);
      stick(m, h0, s * 0.8, -0.12, 'cr_blush', 0.08, 0.045);
      m.ellipsoid(0.14, 0.04, 0.07, hide, s * 0.26, 0.12, -0.08, 0, 0, s * 0.3, 6); // ears
    });
    stick(m, { r: 1, sx: 0.19, sy: 0.15, sz: 0.15, seg: 8, x: 0, y: -0.06, z: 0.28 }, 0, -0.35, 'cr_mouth', 0.12, 0.05);
    // great crescent horns sweeping back
    m.sym(s => sweep(m, [[s * 0.1, 0.2, -0.05], [s * 0.38, 0.28, -0.08], [s * 0.62, 0.3, -0.25], [s * 0.66, 0.36, -0.5], [s * 0.52, 0.42, -0.66]], {
      n: 12, sides: 6, r: t => 0.085 * (1 - 0.85 * t), col: (t, out, i) => (i % 3 === 1 ? 0x746a60 : horn), up: [0, 0, 1],
    }));
    m.pop();
    // throat chevrons
    m.box(0.3, 0.05, 0.05, 0xb8b2aa, 0, 0.93, 0.83, 0.7, 0, 0);
    // tail with a tuft
    sweep(m, [[0, 1.22, -1.0], [0, 1.1, -1.08], [0.02, 0.8, -1.1], [0.03, 0.55, -1.08]], { n: 8, sides: 4, r: () => 0.025, col: dark });
    m.ellipsoid(0.05, 0.1, 0.05, 0x2c2c30, 0.03, 0.5, -1.08, 0, 0, 0, 5);
    // a little egret hitching a ride
    const e = V(0.05, 1.46, -0.35);
    m.ellipsoid(0.06, 0.055, 0.1, WHITE, e.x, e.y + 0.05, e.z, -0.2, 0, 0, 6);
    sweep(m, [[e.x, e.y + 0.08, e.z + 0.06], [e.x, e.y + 0.16, e.z + 0.08], [e.x, e.y + 0.2, e.z + 0.12]], { n: 5, sides: 4, r: () => 0.015, col: WHITE });
    m.sphere(0.026, WHITE, e.x, e.y + 0.21, e.z + 0.13, 1, 1, 1.2, 0, 0, 0, 6);
    beakCone(m, 0.008, 0.06, GOLD, e.x, e.y + 0.205, e.z + 0.15);
    m.sym(s => m.box(0.004, 0.006, 0.006, EYE, e.x + s * 0.022, e.y + 0.215, e.z + 0.14));
    m.sym(s => m.cyl(0.004, 0.004, 0.05, INK, e.x + s * 0.02, e.y + 0.0, e.z, 0, 0, 0, 3));
  },
});

def('pig', {
  name: '小猪', cat: 'animal', sfx: 'moo', fill: 0.55, mover: { kind: 'wander', speed: 0.5 },
  build(m) {
    const pink = 0xf4a8b4, deep = 0xe48898, hoof = 0xb87080;
    m.ellipsoid(0.26, 0.24, 0.38, pink, 0, 0.36, -0.04, 0, 0, 0, 10);
    m.sym(s => {
      for (const z of [0.16, -0.24]) {
        m.cyl(0.058, 0.052, 0.17, pink, s * 0.14, 0.14, z, 0, 0, 0, 7);
        m.cyl(0.054, 0.058, 0.05, hoof, s * 0.14, 0.025, z, 0, 0, 0, 7);
      }
    });
    const head = { r: 0.19, sx: 1.05, sy: 0.95, sz: 0.9, seg: 10, x: 0, y: 0.46, z: 0.3 };
    m.sphere(head.r, pink, head.x, head.y, head.z, head.sx, head.sy, head.sz, 0, 0, 0, 10);
    m.cyl(0.08, 0.085, 0.07, deep, 0, 0.42, 0.48, 90 * D, 0, 0, 10); // snout
    m.cyl(0.075, 0.075, 0.004, 0xf2b8c2, 0, 0.42, 0.517, 90 * D, 0, 0, 10);
    m.sym(s => m.ellipsoid(0.014, 0.022, 0.004, 0x9a5462, s * 0.028, 0.42, 0.52, 0, 0, 0, 5));
    m.sym(s => {
      stick(m, head, s * 0.4, 0.12, 'cr_eye', 0.04, 0.05);
      stick(m, head, s * 0.7, -0.15, 'cr_blush', 0.06, 0.034);
      m.push(s * 0.12, 0.6, 0.33, 1.15, 0, -s * 0.45); // floppy ears
      m.push(0, 0, 0, 0, 0, 0, [1, 1, 0.35]);
      m.cone(0.075, 0.13, 0xf6b4c0, 0, 0.04, 0, 0, 0, 0, 4);
      m.pop();
      m.pop();
    });
    stick(m, head, 0, -0.52, 'cr_mouth', 0.07, 0.035);
    m.sphere(1, 0xa8784e, 0.2, 0.4, -0.14, 0.08, 0.06, 0.02, 0, 1.2, 0, 6); // mud splat
    // corkscrew tail
    const pts = [];
    for (let i = 0; i <= 8; i++) { const a = i * 0.8; pts.push([Math.cos(a) * 0.03, 0.44 + Math.sin(a) * 0.03 + i * 0.006, -0.43 - i * 0.008]); }
    sweep(m, pts, { n: 16, sides: 4, r: () => 0.011, col: deep });
  },
});

def('butterfly', {
  name: '蝴蝶', cat: 'animal', sfx: 'soft', fill: 0.15, mover: { kind: 'fly' },
  tints: [0xf2c14e, 0x5aa9e6, 0xf2a14a, 0xf4f2ec, 0xf08fb0],
  build(m) {
    const body = 0x2e2a30, y = 0.0035;
    m.capsule(0.0035, 0.024, body, 0, y, 0, 90 * D, 0, 0, 5);
    m.sphere(0.0045, body, 0, y + 0.001, 0.017, 1, 1, 1, 0, 0, 0, 5);
    m.sym(s => {
      rod(m, V(s * 0.002, y + 0.003, 0.019), V(s * 0.012, y + 0.014, 0.034), 0.0006, body, 3);
      m.sphere(0.0013, body, s * 0.012, y + 0.014, 0.034, 1, 1, 1, 0, 0, 0, 4);
      m.push(0, y + 0.002, 0.002, 0, 0, s * 0.55, [s, 1, 1]);
      m.tint();
      m.decal(0.047, 0.047, 'cr_wing', 0.0235, 0, 0, -90 * D, 0, 0, 0xffffff, true);
      m.tint(0);
      m.pop();
    });
  },
});

// =====================================================================================================
// 女娲 — hero model (hidden: dialog portraits, enormous in the sky). ~2 m, front +Z.
// =====================================================================================================
const FIVE = [0xd8342c, 0xf2c14e, 0x2aa198, 0xf4f2ec, 0x26262c]; // 五色: red, gold, teal, white, ink

/** 五色石: a faceted gem whose faces take the five colours, glowing. */
function fiveStone(m, r, x, y, z, sy = 1.15) {
  const pos = ico().attributes.position;
  m.glow(1);
  for (let f = 0; f < pos.count / 3; f++) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(Array.from(pos.array.slice(f * 9, f * 9 + 9)), 3));
    g.computeVertexNormals();
    m.geo(g, FIVE[(f * 3 + (f >> 2)) % 5], x, y, z, 0.35, 0.5, 0.2, r, r * sy, r);
  }
  m.glow(0);
}

def('nuwa', {
  name: '女娲', cat: 'person', sfx: 'gong', hidden: true, fill: 0.3,
  build(m) {
    const skin = 0xf9dcc0, hairC = 0x2a2433, cloth = 0xfbf4e6, skirt = 0xe0503f, ribbon = 0xf49ab0;
    const scale = 0x2aa198, band = 0x1d7a70, belly = 0xf3e6bb;

    // ---- coiled snake tail: from the waist, down behind her and one and a half turns on the ground ----
    const R0 = 0.15;
    const tailR = t => R0 * (t < 0.1 ? 1 : 1 - 0.9 * Math.pow((t - 0.1) / 0.9, 1.3));
    const ctrl = [[0, 0.95, 0.0], [0, 0.66, -0.03], [0.05, 0.4, -0.12], [0.2, null, -0.3], [0.46, null, -0.16], [0.54, null, 0.14],
      [0.36, null, 0.44], [0.03, null, 0.55], [-0.3, null, 0.47], [-0.52, null, 0.18], [-0.5, null, -0.18], [-0.28, null, -0.44],
      [0.02, null, -0.53], [0.3, null, -0.47], [0.52, 0.1, -0.33], [0.66, 0.24, -0.2], [0.7, 0.4, -0.1], [0.64, 0.5, -0.02]];
    let pts = ctrl.map(p => [p[0], p[1] ?? 0.12, p[2]]);
    for (let it = 0; it < 3; it++) { // rest the coils on the ground: centre height = local radius
      const L = [0];
      for (let i = 1; i < pts.length; i++) L.push(L[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1], pts[i][2] - pts[i - 1][2]));
      pts = pts.map((p, i) => [p[0], ctrl[i][1] ?? tailR(L[i] / L[L.length - 1]) + 0.004, p[2]]);
    }
    const tailCurve = sweep(m, pts, {
      n: 64, sides: 10, r: tailR,
      col: (t, out, i) => {
        const down = t < 0.08 ? V(0, 0, 1) : V(0, -1, 0);
        if (out.dot(down) > 0.45) return i % 2 ? belly : 0xe6d6a6; // belly plates
        if (out.y > 0.82 && i % 4 === 0) return GOLD; // gold scales along the spine
        return i % 3 === 1 ? band : scale;
      },
    });
    const tip = tailCurve.getPointAt(1), tdir = tailCurve.getTangentAt(1);
    const [trx, try_, trz] = eulerY(tdir);
    m.cone(tailR(1) * 1.05, 0.06, band, tip.x + tdir.x * 0.03, tip.y + tdir.y * 0.03, tip.z + tdir.z * 0.03, trx, try_, trz, 6);

    // ---- skirt, torso, sash ----
    const skirtG = new THREE.LatheGeometry([[0.29, 0.44], [0.25, 0.56], [0.2, 0.7], [0.165, 0.84], [0.15, 0.94]].map(p => new THREE.Vector2(p[0], p[1])), 14);
    m.geo(skirtG, skirt); // open hem: the tail flows out from under it
    m.geo(new THREE.LatheGeometry([[0.296, 0.44], [0.305, 0.46]].map(p => new THREE.Vector2(p[0], p[1])), 14), GOLD);
    m.lathe([[0.232, 0.66], [0.19, 0.78], [0.16, 0.9], [0.155, 0.95]], cloth, 0, 0, 0, 0, 0, 0, 14); // over-skirt
    m.torus(0.232, 0.012, GOLD, 0, 0.665, 0, 90 * D, 0, 0, TAU, 3, 16);
    m.push(0, 0, 0, 0, 0, 0, [1, 1, 0.82]);
    m.lathe([[0.001, 0.88], [0.135, 0.88], [0.145, 0.97], [0.155, 1.08], [0.14, 1.17], [0.09, 1.235], [0.045, 1.28], [0.001, 1.29]], cloth, 0, 0, 0, 0, 0, 0, 10);
    m.cyl(0.152, 0.148, 0.075, GOLD, 0, 0.93, 0, 0, 0, 0, 10);
    m.pop();
    // crossed collar (交领), red with the right lapel over the left
    m.sym(s => {
      const a = V(s * 0.085, 1.245, 0.07), b = V(-s * 0.03, 1.0, 0.128);
      const [rx, ry, rz] = basisY(V().subVectors(b, a), V(1, 0, 0));
      m.box(0.045, a.distanceTo(b), 0.012, s > 0 ? RED : 0xc82c26, (a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2 + (s > 0 ? 0.004 : 0), rx, ry, rz);
    });
    // sash bow and streamers
    m.sym(s => m.ellipsoid(0.055, 0.035, 0.02, RED, s * 0.05, 0.93, 0.135, 0, 0, s * 0.35, 6));
    m.sphere(0.022, GOLD, 0, 0.93, 0.14, 1, 1, 0.8, 0, 0, 0, 6);
    m.sym(s => m.box(0.03, 0.2, 0.01, RED, s * 0.03, 0.8, 0.17 + 0.02, -0.12, 0, s * 0.12));

    // ---- arms holding the 五色石 in front of the chest ----
    const stone = V(0, 1.17, 0.33);
    m.sym(s => {
      const S = V(s * 0.17, 1.19, -0.01), G = V(s * 0.095, 1.09, 0.29);
      const { E } = ik(S, G, 0.15, 0.16, V(s, -1, -0.3));
      const fd = V().subVectors(G, E).normalize();
      bone(m, S, E, 0.047, cloth, 6);
      rod(m, E.clone().addScaledVector(fd, -0.02), G.clone().addScaledVector(fd, -0.05), 0.05, cloth, 8, 0.085); // wide sleeve
      m.torus(0.083, 0.012, RED, ...G.clone().addScaledVector(fd, -0.055).toArray(), ...eulerZ(fd), TAU, 3, 12);
      const hang = E.clone().lerp(G, 0.5).add(V(0, -0.08, -0.02));
      m.ellipsoid(0.04, 0.09, 0.07, cloth, hang.x, hang.y, hang.z, 0.1, 0, s * 0.1, 7); // drooping sleeve
      m.sphere(0.048, skin, G.x, G.y, G.z, 0.9, 1.1, 1, 0, 0, s * 0.3, 6);
    });
    fiveStone(m, 0.12, stone.x, stone.y, stone.z);
    m.glow(0.8);
    for (let i = 0; i < 7; i++) { // sparkles (sides and below: keep the face clear)
      const a = -Math.PI / 2 + (i - 3) * 0.5 + (i > 3 ? 0.9 : i < 3 ? -0.9 : 0), rr = 0.19 + (i % 3) * 0.035;
      m.geo(octa(), [GOLD, WHITE, 0xfff0a0][i % 3], stone.x + Math.cos(a) * rr, stone.y + 0.03 + Math.sin(a) * rr * 0.9, stone.z + 0.03, 0, 0, 0, 0.013, 0.03, 0.013);
    }
    m.glow(0);

    // ---- 披帛 ribbons floating round her arms ----
    const rib = { n: 30, sides: 4, r: t => [0.01, 0.048 * (1 - 0.4 * t)], col: (t, out, i) => (i % 8 === 4 ? 0xf8c4d0 : ribbon), up: [0, 0, 1] };
    sweep(m, [[0, 1.27, -0.14], [0.15, 1.25, -0.13], [0.27, 1.14, -0.06], [0.31, 1.0, 0.07], [0.42, 0.93, 0.12], [0.55, 0.98, 0.02],
      [0.62, 1.12, -0.1], [0.7, 1.26, -0.14], [0.84, 1.3, -0.08], [0.95, 1.22, -0.02]], rib);
    sweep(m, [[0, 1.27, -0.14], [-0.15, 1.25, -0.13], [-0.27, 1.14, -0.06], [-0.32, 1.0, 0.06], [-0.42, 0.9, 0.12], [-0.54, 0.84, 0.04],
      [-0.62, 0.72, -0.08], [-0.66, 0.58, 0.0], [-0.74, 0.48, -0.06], [-0.84, 0.44, 0.02]], rib);

    // ---- head ----
    const hd = { r: 0.27, sx: 1.06, sy: 0.98, sz: 1, seg: 12, x: 0, y: 1.515, z: 0.02 };
    m.cyl(0.05, 0.055, 0.08, skin, 0, 1.28, 0.0, 0, 0, 0, 6);
    m.sphere(hd.r, skin, hd.x, hd.y, hd.z, hd.sx, hd.sy, hd.sz, 0, 0, 0, hd.seg);
    m.sym(s => {
      stick(m, hd, s * 0.37, -0.1, 'cr_nw_eye', 0.078, 0.1);
      stick(m, hd, s * 0.64, -0.36, 'cr_blush', 0.085, 0.045);
      stick(m, hd, s * 0.37, 0.19, 'cr_brow', 0.07, 0.022, -s * 0.12);
    });
    stick(m, hd, 0, -0.47, 'cr_mouth_open', 0.07, 0.046);
    stick(m, hd, 0, 0.33, 'cr_nw_mark', 0.028, 0.04);
    // hair: centre-parted fringe, side locks, long hair down the back, two high buns with gold
    hairShell(m, hd, hairC, 44 * D, -38 * D, 1.07, 14, 7, [1.02, 1.06, 1.08]);
    m.sym(s => onFacet(m, hd, s * 0.32, 0.72, () => m.ellipsoid(0.15, 0.06, 0.035, hairC, 0, 0, 0, 0, 0, s * 0.35, 7), 0.004));
    m.sym(s => sweep(m, [[s * 0.25, 1.6, 0.06], [s * 0.3, 1.46, 0.08], [s * 0.3, 1.33, 0.08], [s * 0.26, 1.22, 0.1]], { n: 8, sides: 5, r: t => 0.04 * (1 - 0.5 * t), col: hairC }));
    m.ellipsoid(0.25, 0.4, 0.11, hairC, 0, 1.28, -0.2, 0.2, 0, 0, 10);
    m.sym(s => {
      const b = V(s * 0.155, 1.82, -0.04);
      m.sphere(0.105, hairC, b.x, b.y, b.z, 1, 1.05, 1, 0, 0, 0, 8);
      m.torus(0.085, 0.016, GOLD, b.x - s * 0.01, b.y - 0.06, b.z, 90 * D, 0, s * 0.3, TAU, 3, 12);
      rod(m, V(b.x - s * 0.1, b.y + 0.02, b.z + 0.02), V(b.x + s * 0.15, b.y + 0.1, b.z - 0.02), 0.009, GOLD, 4); // hairpin
      m.sphere(0.02, RED, b.x + s * 0.155, b.y + 0.1, b.z - 0.02, 1, 1, 1, 0, 0, 0, 5);
      rod(m, V(b.x + s * 0.155, b.y + 0.09, b.z - 0.02), V(b.x + s * 0.17, b.y - 0.02, b.z), 0.003, GOLD, 3); // 步摇
      m.sphere(0.014, TEAL, b.x + s * 0.17, b.y - 0.035, b.z, 1, 1.3, 1, 0, 0, 0, 5);
    });
    // gold flower crown between the buns
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * TAU;
      m.sphere(0.022, GOLD, Math.cos(a) * 0.028, 1.8 + Math.sin(a) * 0.028, 0.14, 1, 1, 0.6, 0, 0, 0, 5);
    }
    m.sphere(0.018, RED, 0, 1.8, 0.155, 1, 1, 0.7, 0, 0, 0, 5);
  },
});

// =====================================================================================================
// 小泥人 — the player: a chubby 惠山泥人 阿福-style clay child, built from jointed parts.
// Each part's origin is its joint pivot (see buildClayKid). The hidden def assembles them.
// =====================================================================================================
const CLAY = 0xd08a5c, CLAY_DARK = 0xa8643e, CLAY_HAIR = 0x2b2220, CLAY_SHORTS = 0x2aa198;
const CK_STAND = 0.26; // pelvis (body origin) height when standing
const CK_JOINTS = { neck: [0, 0.345, 0], shoulderL: [0.14, 0.22, 0], shoulderR: [-0.14, 0.22, 0], hipL: [0.075, -0.01, 0], hipR: [-0.075, -0.01, 0] };

function clayBody(m) { // origin: pelvis centre; torso extends +Y
  const b = { r: 0.165, sx: 1.05, sy: 1.12, sz: 0.95, seg: 12, x: 0, y: 0.12, z: 0 };
  m.sphere(b.r, CLAY, b.x, b.y, b.z, b.sx, b.sy, b.sz, 0, 0, 0, b.seg);
  m.cyl(0.058, 0.07, 0.09, CLAY, 0, 0.32, 0, 0, 0, 0, 8); // neck
  m.push(0, 0, 0, 0, 0, 0, [1, 1, 0.92]);
  m.lathe([[0.001, -0.075], [0.1, -0.075], [0.168, -0.03], [0.176, 0.025], [0.001, 0.03]], CLAY_SHORTS, 0, 0, 0, 0, 0, 0, 12);
  m.torus(0.172, 0.012, GOLD, 0, 0.028, 0, 90 * D, 0, 0, TAU, 3, 14); // waistband
  m.pop();
  // 肚兜: red apron with five-colour trim and a gold 福, wrapped on the belly
  texPatch(m, 'cr_ck_dudou', b.r * 1.035, b.x, b.y, b.z, b.sx, b.sy, b.sz, Math.PI / 2, 1.95, 0.22, 1.9, 12);
  m.torus(0.064, 0.008, RED, 0, 0.3, 0.004, 90 * D - 0.25, 0, 0, TAU, 3, 12); // neck string
}

function clayHead(m) { // origin: neck point; head extends +Y
  const hd = { r: 0.19, sx: 1.08, sy: 0.97, sz: 1, seg: 12, x: 0, y: 0.19, z: 0.012 };
  m.sphere(hd.r, CLAY, hd.x, hd.y, hd.z, hd.sx, hd.sy, hd.sz, 0, 0, 0, hd.seg);
  m.sym(s => m.sphere(0.036, CLAY, s * 0.2, 0.16, 0.0, 0.55, 1, 0.8, 0, 0, 0, 5)); // ears
  // painted hair, a little peach-shaped tuft and two buns (总角) tied with red
  hairShell(m, hd, CLAY_HAIR, 48 * D, -6 * D, 1.035, 14, 6);
  m.sym(s => {
    const p = surf(hd, s * 48 * D, 56 * D, 1.05);
    m.sphere(0.066, CLAY_HAIR, p.x, p.y, p.z, 1, 1, 1, 0, 0, 0, 8);
    m.torus(0.054, 0.014, RED, p.x - s * 0.02, p.y - 0.035, p.z, 90 * D - 0.2, 0, s * 0.5, TAU, 3, 10);
  });
  // happy face: shiny eyes, big rosy cheeks, open grin, red lucky dot
  m.sym(s => {
    stick(m, hd, s * 0.36, -0.08, 'cr_eye', 0.04, 0.05);
    stick(m, hd, s * 0.36, 0.2, 'cr_brow', 0.045, 0.016, -s * 0.15);
    stick(m, hd, s * 0.64, -0.33, 'cr_ck_cheek', 0.075, 0.075);
  });
  stick(m, hd, 0, -0.44, 'cr_mouth_open', 0.07, 0.046);
  stick(m, hd, 0, 0.3, 'cr_dot', 0.02, 0.02, 0, null, RED);
  onFacet(m, hd, 0, -0.25, () => m.sphere(0.013, shade(CLAY, 0.92), 0, 0, 0, 1.1, 0.8, 0.9, 0, 0, 0, 4));
}

function clayArm(m) { // origin: shoulder; arm hangs along -Y
  m.sphere(0.05, CLAY, 0, 0, 0, 1, 1, 1, 0, 0, 0, 6);
  m.capsule(0.045, 0.14, CLAY, 0, -0.1, 0, 0, 0, 0, 6);
  m.torus(0.043, 0.01, GOLD, 0, -0.175, 0, 90 * D, 0, 0, TAU, 3, 8); // bracelet
  m.sphere(0.054, CLAY, 0, -0.218, 0.006, 1, 1.05, 0.95, 0, 0, 0, 6);
}

function clayLeg(m) { // origin: hip; leg extends -Y to the sole at y = -0.25
  m.sphere(0.058, CLAY_SHORTS, 0, 0, 0, 1, 1, 1, 0, 0, 0, 6);
  m.cyl(0.064, 0.06, 0.07, CLAY_SHORTS, 0, -0.035, 0, 0, 0, 0, 8);
  m.capsule(0.05, 0.1, CLAY, 0, -0.13, 0, 0, 0, 0, 6);
  m.sphere(0.058, CLAY_DARK, 0, -0.218, 0.028, 1, 0.55, 1.4, 0, 0, 0, 6); // clay shoe
}

/**
 * Player figure as separate jointed parts: { parts: { body, head, armL, armR, legL, legR }, joints, stand }.
 * Each part is built with its own new Model(seed) and .build({ lift: false }), so its origin is the joint
 * pivot. joints are relative to the body origin (pelvis centre); L = the character's left = +X.
 * stand = pelvis height above the ground when standing (legs reach exactly to y = 0). Call after buildAtlas().
 */
export function buildClayKid(Model) {
  const part = (seed, fn) => { const m = new Model(seed); fn(m); return m.build({ lift: false }); };
  return {
    parts: {
      body: part(101, clayBody),
      head: part(102, clayHead),
      armL: part(103, clayArm),
      armR: part(104, m => { m.push(0, 0, 0, 0, 0, 0, [-1, 1, 1]); clayArm(m); m.pop(); }),
      legL: part(105, clayLeg),
      legR: part(106, m => { m.push(0, 0, 0, 0, 0, 0, [-1, 1, 1]); clayLeg(m); m.pop(); }),
    },
    joints: { neck: [...CK_JOINTS.neck], shoulderL: [...CK_JOINTS.shoulderL], shoulderR: [...CK_JOINTS.shoulderR], hipL: [...CK_JOINTS.hipL], hipR: [...CK_JOINTS.hipR] },
    stand: CK_STAND,
  };
}

def('clay_kid', {
  name: '小泥人', cat: 'person', sfx: 'scream_kid', hidden: true, fill: 0.45,
  build(m) { // the same parts assembled into a standing figure
    const J = CK_JOINTS;
    m.push(0, CK_STAND, 0);
    clayBody(m);
    m.push(...J.neck); clayHead(m); m.pop();
    m.push(...J.shoulderL, 0, 0, 0.12); clayArm(m); m.pop();
    m.push(...J.shoulderR, 0, 0, -0.12, [-1, 1, 1]); clayArm(m); m.pop();
    m.push(...J.hipL); clayLeg(m); m.pop();
    m.push(...J.hipR, 0, 0, 0, [-1, 1, 1]); clayLeg(m); m.pop();
    m.pop();
  },
});
