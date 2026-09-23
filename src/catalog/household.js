// 家居 · 院子 — household and courtyard things of a Chinese 小区 / 老街.
// Real sizes in metres, base on y = 0, front faces +Z. Decal keys use the prefix hh_.
import * as THREE from 'three';
import { def } from './registry.js';
import { D, shade, mix } from '../core/modeler.js';
import { decal, fitText, verticalText, FONTS, getUV } from '../core/atlas.js';

const INK = 0x2a1d17, BLK = 0x26262c, WHT = 0xf4f2ec;
const RED = 0xd8342c, GOLD = 0xf2c14e, CREAM = 0xf6efe0;

// ---- local helpers ---------------------------------------------------------------------------
const _up = new THREE.Vector3(0, 1, 0);
/** Euler XYZ turning local +Y towards (dx, dy, dz). */
function aim(dx, dy, dz) {
  const q = new THREE.Quaternion().setFromUnitVectors(_up, new THREE.Vector3(dx, dy, dz).normalize());
  const e = new THREE.Euler().setFromQuaternion(q, 'XYZ');
  return [e.x, e.y, e.z];
}
/** Euler XYZ turning local +Y along dir, with local +Z as close as possible to `up`. */
function orient(dir, up = [0, 1, 0]) {
  const y = new THREE.Vector3(...dir).normalize();
  const u = new THREE.Vector3(...up);
  const z = u.sub(y.clone().multiplyScalar(u.dot(y))).normalize();
  const x = new THREE.Vector3().crossVectors(y, z);
  const e = new THREE.Euler().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z), 'XYZ');
  return [e.x, e.y, e.z];
}
/** Cylinder rod from point a to point b. */
function rod(m, r, col, a, b, seg = 6) {
  const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
  const [rx, ry, rz] = aim(dx, dy, dz);
  m.cyl(r, r, Math.hypot(dx, dy, dz), col, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2, rx, ry, rz, seg);
}
/** BufferGeometry from a flat triangle position list; both = also add the reversed winding. */
function geoFrom(pos, both = false) {
  const p = pos.slice();
  if (both) for (let i = 0; i < pos.length; i += 9) p.push(...pos.slice(i, i + 3), ...pos.slice(i + 6, i + 9), ...pos.slice(i + 3, i + 6));
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
  g.computeVertexNormals();
  return g;
}
const posOf = g => Array.from((g.index ? g.toNonIndexed() : g).attributes.position.array);
/** Same surface, visible from both sides (thin leaves, cloth, canopies). */
const twoSided = g => geoFrom(posOf(g), true);
/** Reversed winding: only the far inner side renders — reads as clear glass around the contents. */
function inward(g) {
  const P = posOf(g), out = [];
  for (let i = 0; i < P.length; i += 9) out.push(...P.slice(i, i + 3), ...P.slice(i + 6, i + 9), ...P.slice(i + 3, i + 6));
  return geoFrom(out);
}
const latheGeo = (profile, seg, phi0 = 0, phiLen = Math.PI * 2) =>
  new THREE.LatheGeometry(profile.map(p => new THREE.Vector2(Math.max(0, p[0]), p[1])), seg, phi0, phiLen);
const _memo = new Map();
const memo = (k, f) => { if (!_memo.has(k)) _memo.set(k, f()); return _memo.get(k); };

/** Folded kite-shaped leaf: stalk at the origin, unit length along +Y, unit width, fold towards +Z. */
const leafGeo = () => memo('leaf', () => {
  const b = [0, 0, 0], l = [-0.5, 0.4, 0], t = [0, 1, 0], r = [0.5, 0.4, 0], c = [0, 0.45, 0.14];
  return geoFrom([...b, ...r, ...c, ...r, ...t, ...c, ...t, ...l, ...c, ...l, ...b, ...c], true);
});
/** Heart-shaped leaf (pothos), notch at the origin, pointing +Y. */
const heartGeo = () => memo('heart', () => {
  const o = [[0, 0.1], [0.32, 0], [0.52, 0.28], [0.44, 0.62], [0, 1], [-0.44, 0.62], [-0.52, 0.28], [-0.32, 0]];
  const pos = [];
  for (let i = 0; i < o.length; i++) {
    const a = o[i], b = o[(i + 1) % o.length];
    pos.push(0, 0.42, 0.12, a[0], a[1], 0, b[0], b[1], 0);
  }
  return geoFrom(pos, true);
});
/** Place a leaf of length len / width wid at (x,y,z) pointing along dir, its face towards `up`. */
function leaf(m, len, wid, col, x, y, z, dir, up = [0, 1, 0], heart = false) {
  const [rx, ry, rz] = orient(dir, up);
  m.geo(heart ? heartGeo() : leafGeo(), col, x, y, z, rx, ry, rz, wid, len, wid);
}
/** Curved label: a band of a cylinder (radius r, height h, centred on +Z, spanning `arc` radians)
 *  showing decal `key` wrapped around it. seg should match the body's facets. */
function wrapDecal(m, key, r, h, arc, seg, x, y, z, ry = 0) {
  const g = memo(`wrap:${arc.toFixed(3)}:${seg}`, () => new THREE.CylinderGeometry(1, 1, 1, seg, 1, true, -arc / 2, arc));
  m.geo(g, 0xffffff, x, y, z, 0, ry, 0, r, h, r, getUV(key));
}

/** Like wrapDecal but on a cone band (radius rBot at the bottom, rTop at the top). */
function wrapCone(m, key, rTop, rBot, h, arc, seg, x, y, z, ry = 0) {
  const g = memo(`cone:${rTop}:${rBot}:${arc.toFixed(3)}:${seg}`, () => new THREE.CylinderGeometry(rTop, rBot, 1, seg, 1, true, -arc / 2, arc));
  m.geo(g, 0xffffff, x, y, z, 0, ry, 0, 1, h, 1, getUV(key));
}

/** Unit sphere in lunes: colour bands cols[] with relative widths[], repeated reps times around;
 *  lune edges zigzag by zig radians; th0..th1 limits the polar range (π/2..π = bottom half). */
function stripedBall(m, cols, widths, reps, nLat, zig, x, y, z, sx, sy, sz, th0 = 0, th1 = Math.PI) {
  const tot = widths.reduce((a, b) => a + b, 0), per = (Math.PI * 2) / reps, phis = [];
  for (let k = 0; k < reps; k++) { let acc = 0; for (const w of widths) { phis.push((k + acc / tot) * per); acc += w; } }
  const n = phis.length, th = i => th0 + (i / nLat) * (th1 - th0);
  const P = (i, j) => {
    const t = th(i), s = Math.sin(t);
    const ph = phis[j % n] + (j >= n ? Math.PI * 2 : 0) + (s < 1e-6 ? 0 : zig * ((i + j) & 1 ? 1 : -1));
    return [s * Math.sin(ph), Math.cos(t), s * Math.cos(ph)];
  };
  const buckets = cols.map(() => []);
  for (let j = 0; j < n; j++) {
    const out = buckets[j % cols.length];
    for (let i = 0; i < nLat; i++) {
      const a = P(i, j), b = P(i + 1, j), c = P(i + 1, j + 1), d = P(i, j + 1);
      if (Math.sin(th(i)) > 1e-6) out.push(...a, ...b, ...d);
      if (Math.sin(th(i + 1)) > 1e-6) out.push(...d, ...b, ...c);
    }
  }
  buckets.forEach((pos, k) => { if (pos.length) m.geo(geoFrom(pos), cols[k], x, y, z, 0, 0, 0, sx, sy, sz); });
}

// =============================================================================================
// 蔬果 produce
// =============================================================================================
const MELON = [0x2c6630, 0x8cc460];

def('watermelon', {
  name: '西瓜', cat: 'food', sfx: 'squish', fill: 0.52,
  build(m) {
    const R = 0.15, sy = 0.93, top = 2 * R * sy;
    stripedBall(m, MELON, [0.55, 0.45], 9, 8, 0.07, 0, R * sy, 0, R, R * sy, R * 1.04);
    m.cyl(0.005, 0.008, 0.03, 0x7c7f3a, 0, top + 0.01, 0, 0.2, 0, 0.15, 6); // stalk
    m.tube([[0.004, top + 0.02, 0], [0.02, top + 0.032, 0.006], [0.032, top + 0.022, -0.006], [0.024, top + 0.012, -0.014]], 0.0022, 0x6f8f3a, 4, false, 10);
  },
});

def('watermelon_half', {
  name: '半个西瓜', cat: 'food', sfx: 'squish', fill: 0.5,
  build(m) {
    const R = 0.15, H = 0.135; // cut face at y = H
    stripedBall(m, MELON, [0.55, 0.45], 9, 4, 0.07, 0, H, 0, R, H, R, Math.PI / 2, Math.PI);
    m.cyl(R * 1.01, R * 1.01, 0.008, 0x3f7f35, 0, H - 0.002, 0, 0, 0, 0, 18); // green rind lip
    m.cyl(R * 0.97, R * 0.97, 0.004, 0xeaf1c8, 0, H + 0.004, 0, 0, 0, 0, 18); // white rind
    m.cyl(R * 0.86, R * 0.86, 0.006, 0xe8483c, 0, H + 0.005, 0, 0, 0, 0, 18); // red flesh
    for (let i = 0; i < 16; i++) { // seeds in two loose rings
      const a = (i / 16) * Math.PI * 2 + (i % 2) * 0.1, r = i % 2 ? 0.078 : 0.048;
      m.sphere(0.0065, INK, Math.sin(a) * r, H + 0.0086, Math.cos(a) * r, 0.6, 0.35, 1, 0, a, 0, 4);
    }
  },
});

def('napa_cabbage', {
  name: '大白菜', cat: 'food', sfx: 'squish', fill: 0.45,
  build(m) {
    const L = 0.4;
    // white stalk end -> pale heart -> leafy green tips, by position along the head (model x)
    const col = outer => x => {
      const t = (x + L / 2) / L, mid = outer ? 0xe2edbb : 0xeef1cf;
      return t < 0.5 ? mix(0xf7f5ea, mid, t / 0.5) : mix(mid, outer ? 0x86c451 : 0xd4e58e, Math.min(1, (t - 0.5) / 0.42));
    };
    const core = latheGeo([[0, 0], [0.045, 0.004], [0.07, 0.03], [0.08, 0.12], [0.084, 0.24], [0.078, 0.32], [0.058, 0.375], [0.03, 0.398], [0, 0.402]], 9);
    const leaves = [];
    for (let k = 0; k < 5; k++) {
      const s = 1 + k * 0.035, len = 0.35 + (k % 2) * 0.04;
      const g = latheGeo([[0.05 * s, 0], [0.083 * s, 0.04], [0.093 * s, 0.14], [0.096 * s, len * 0.72], [0.094 * s, len * 0.88], [0.08 * s, len]], 6, k * 1.3, 2.5);
      const p = g.attributes.position; // ruffled leaf tips
      for (let i = 0; i < p.count; i++) if (p.getY(i) > len * 0.87) {
        const f = 1 + 0.09 * Math.sin(Math.atan2(p.getX(i), p.getZ(i)) * 11);
        p.setXYZ(i, p.getX(i) * f, p.getY(i) + (f - 1) * 0.1, p.getZ(i) * f);
      }
      leaves.push(twoSided(g));
    }
    // lying on its side: lathe axis -> +X; rest the lowest vertex exactly on the ground
    let lift = 0;
    for (const g of [core, ...leaves]) { const p = g.attributes.position.array; for (let i = 0; i < p.length; i += 3) lift = Math.max(lift, p[i]); }
    m.push(-L / 2, lift, 0, 0, 0, -90 * D);
    m.geo(core, col(false));
    for (const g of leaves) m.geo(g, col(true));
    m.pop();
  },
});

def('scallion', {
  name: '大葱', cat: 'food', sfx: 'soft', fill: 0.3,
  build(m) {
    const r = 0.017, y = r * 1.1;
    m.cyl(r * 1.1, r, 0.29, 0xf3f2e6, -0.125, y, 0, 0, 0, 90 * D, 8); // white shaft, root end at -X
    m.cyl(r * 0.98, r * 0.98, 0.05, 0xcfe3a0, 0.04, y, 0, 0, 0, 90 * D, 8); // pale green neck
    m.cyl(r * 0.9, r * 0.9, 0.012, 0xe6dcc0, -0.272, y, 0, 0, 0, 90 * D, 8); // basal plate
    for (const [len, dz, dy] of [[0.21, 0.04, 0.01], [0.23, -0.035, 0.006], [0.18, 0.004, 0.022]]) {
      const a = [0.06, y + dy * 0.3, dz * 0.1], b = [0.06 + len, 0.005, dz];
      const [rx, ry, rz] = aim(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
      m.cone(0.013, Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]), 0x4f9e3c, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2 + 0.004, (a[2] + b[2]) / 2, rx, ry, rz, 6);
    }
    for (let i = 0; i < 6; i++) { // root hairs
      const a = (i / 5 - 0.5) * 1.6;
      rod(m, 0.0016, 0xe0d2b0, [-0.275, y, 0], [-0.3, y - 0.012 + Math.abs(a) * 0.004, Math.sin(a) * 0.03], 3);
    }
  },
});

def('radish', {
  name: '白萝卜', cat: 'food', sfx: 'squish', fill: 0.3,
  build(m) {
    const R = 0.032;
    const prof = [[0, 0], [0.004, 0.012], [0.012, 0.04], [0.022, 0.08], [0.029, 0.125], [R, 0.165], [0.03, 0.19], [0.02, 0.2], [0, 0.203]];
    m.push(-0.15, R, 0, 0, 0, -90 * D); // lying: root tip at -X, green shoulder at +X
    m.lathe(prof, x => mix(0xf4f2ea, 0xb9d98a, Math.max(0, Math.min(1, (x + 0.01) / 0.05))), 0, 0, 0, 0, 0, 0, 8);
    m.pop();
    const greens = [0x4f9e3c, 0x5cae4f, 0x46903a];
    [[1, 0.3, 0], [1, 0.22, 0.45], [1, 0.22, -0.45], [1, 0.4, 0.2], [1, 0.4, -0.22], [0.8, 0.18, 0.8], [0.8, 0.18, -0.8]].forEach((d, i) =>
      leaf(m, 0.12 - (i > 4 ? 0.03 : 0), 0.045, greens[i % 3], 0.045, R + 0.004, d[2] * 0.01, d));
  },
});

def('briquette', {
  name: '蜂窝煤', cat: 'daily', sfx: 'hard', fill: 0.7,
  build(m) {
    const R = 0.075, H = 0.085;
    m.jitter(0.05);
    m.cyl(R, R * 1.01, H, 0x3a393b, 0, H / 2, 0, 0, 0, 0, 12);
    m.jitter(0);
    m.disc(R * 0.99, 0x57555a, 0, H + 0.0006, 0, 0, 0, 0, 12); // top face
    const holes = [[0, 0]];
    for (let i = 0; i < 5; i++) holes.push([Math.sin(i * 72 * D) * 0.03, Math.cos(i * 72 * D) * 0.03]);
    for (let i = 0; i < 10; i++) holes.push([Math.sin((i * 36 + 18) * D) * 0.056, Math.cos((i * 36 + 18) * D) * 0.056]);
    for (const [x, z] of holes) m.disc(0.0078, 0x121113, x, H + 0.0012, z, 0, 0, 0, 6);
  },
});

// =============================================================================================
// 日用 everyday things
// =============================================================================================
def('plastic_stool', {
  name: '红塑料凳', cat: 'daily', sfx: 'hard', fill: 0.25,
  tints: [0xd8342c, 0x2f63c9, 0x3a9a5c, 0xf2a14a],
  build(m) {
    const H = 0.45, T = 0.145, B = 0.175, TH = 0.03; // seat half-width, foot half-width, seat thickness
    const seat = memo('stoolSeat', () => {
      const s = new THREE.Shape(), r = 0.035, h = T;
      s.moveTo(-h + r, -h);
      s.lineTo(h - r, -h); s.quadraticCurveTo(h, -h, h, -h + r);
      s.lineTo(h, h - r); s.quadraticCurveTo(h, h, h - r, h);
      s.lineTo(-h + r, h); s.quadraticCurveTo(-h, h, -h, h - r);
      s.lineTo(-h, -h + r); s.quadraticCurveTo(-h, -h, -h + r, -h);
      const slot = new THREE.Path(); // the classic carry slot
      slot.absarc(-0.03, 0, 0.013, Math.PI / 2, Math.PI * 1.5, false);
      slot.absarc(0.03, 0, 0.013, -Math.PI / 2, Math.PI / 2, false);
      s.holes.push(slot);
      const g = new THREE.ExtrudeGeometry(s, { depth: TH, bevelEnabled: false, curveSegments: 3 });
      g.translate(0, 0, -TH / 2);
      return g;
    });
    const top = H - TH;
    const panel = memo('stoolPanel', () => { // trapezoid side skirt with the arch between two legs
      const p = [[-B, 0], [-B + 0.055, 0], [-0.1, 0.12], [-0.072, 0.2], [-0.035, 0.243], [0, 0.255], [0.035, 0.243], [0.072, 0.2], [0.1, 0.12], [B - 0.055, 0], [B, 0], [T, top + 0.004], [-T, top + 0.004]];
      const g = new THREE.ExtrudeGeometry(new THREE.Shape(p.map(q => new THREE.Vector2(q[0], q[1]))), { depth: 0.012, bevelEnabled: false });
      g.translate(0, 0, -0.006);
      return g;
    });
    const tilt = Math.atan2(B - T, top);
    m.tint();
    m.geo(seat, 0xffffff, 0, H - TH / 2, 0, 90 * D, 0, 0);
    for (let k = 0; k < 4; k++) {
      m.push(0, 0, 0, 0, k * 90 * D, 0);
      m.geo(panel, 0xf0f0f0, 0, 0, B - 0.006, -tilt, 0, 0);
      m.pop();
    }
    m.tint(0);
  },
});

decal('hh_thermos', 192, 100, (ctx, w, h) => {
  const leafy = (x, y, len, ang) => {
    ctx.save(); ctx.translate(x, y); ctx.rotate(ang); ctx.fillStyle = '#3f8f4a';
    ctx.beginPath(); ctx.ellipse(len / 2, 0, len / 2, len / 5, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
  };
  const flower = (x, y, r, petal, heart) => {
    ctx.fillStyle = petal;
    for (let i = 0; i < 5; i++) {
      const a = i * 72 * D - Math.PI / 2;
      ctx.beginPath(); ctx.arc(x + Math.cos(a) * r * 0.55, y + Math.sin(a) * r * 0.55, r * 0.55, 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = heart; ctx.beginPath(); ctx.arc(x, y, r * 0.38, 0, Math.PI * 2); ctx.fill();
  };
  ctx.fillStyle = '#f2c14e';
  ctx.fillRect(0, 3, w, 4); ctx.fillRect(0, h - 7, w, 4);
  for (let k = 0; k < 4; k++) {
    const x = (k + 0.5) * w / 4, y = k % 2 ? h * 0.4 : h * 0.6, s = k % 2 ? 1 : -1;
    leafy(x - 3, y + 5, 22, 2.3); leafy(x + 3, y + 4, 20, 0.7); leafy(x + 2, y - 6 * s, 16, -1.2 * s);
    flower(x, y, 14, '#fff4e4', '#e8554a');
    flower(x + 15, y - 20 * s, 7, '#f7b8c8', '#f2c14e');
  }
});

def('thermos', {
  name: '暖水瓶', cat: 'daily', sfx: 'glass', fill: 0.55,
  tints: [0xd8342c, 0x3a8f5c, 0x2f63c9, 0xf2a14a],
  build(m) {
    const R = 0.062, tin = 0xc3c8ce;
    m.cyl(R * 1.04, R * 1.08, 0.022, tin, 0, 0.011, 0, 0, 0, 0, 8); // foot ring
    m.tint();
    m.cyl(R, R, 0.28, 0xffffff, 0, 0.162, 0, 0, 0, 0, 8); // tin shell
    m.lathe([[R, 0], [R * 0.96, 0.02], [R * 0.72, 0.045], [0.034, 0.056], [0, 0.056]], 0xffffff, 0, 0.3, 0, 0, 0, 0, 8);
    m.tint(0);
    wrapDecal(m, 'hh_thermos', R + 0.0008, 0.2, Math.PI * 2, 8, 0, 0.17, 0);
    for (const y of [0.052, 0.292]) m.cyl(R * 1.03, R * 1.03, 0.012, tin, 0, y, 0, 0, 0, 0, 8); // handle bands
    m.cyl(0.035, 0.037, 0.018, tin, 0, 0.363, 0, 0, 0, 0, 10); // neck ring
    m.cyl(0.027, 0.022, 0.036, 0xc49a62, 0, 0.385, 0, 0, 0, 0, 8); // cork stopper
    m.cyl(0.028, 0.028, 0.004, 0xd9b27c, 0, 0.402, 0, 0, 0, 0, 8);
    m.tube([[R, 0.29, 0], [R + 0.032, 0.284, 0], [R + 0.042, 0.22, 0], [R + 0.032, 0.12, 0], [R, 0.055, 0]], 0.006, tin, 5, false, 12);
  },
});

// ---- 快递 parcels ------------------------------------------------------------------------------
decal('hh_label', 96, 72, (ctx, w, h) => {
  ctx.fillStyle = '#f8f7f1'; ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#e8554a'; ctx.fillRect(0, 0, w, 15);
  fitText(ctx, '滚滚快递', w / 2, 8, w - 10, 12, FONTS.sans, '#fff');
  ctx.fillStyle = '#26262c';
  const bars = [2, 1, 3, 1, 1, 2, 1, 3, 2, 1, 1, 2, 3, 1, 2, 1, 1, 3, 1, 2, 2, 1, 3, 1, 1, 2];
  let x = 8;
  for (let i = 0; i < bars.length && x < w - 8; i++) { if (i % 2 === 0) ctx.fillRect(x, 19, bars[i], 17); x += bars[i] + 1; }
  fitText(ctx, '收:王阿姨 幸福里3-2-501', w / 2, 46, w - 8, 10, FONTS.sans, '#26262c');
  fitText(ctx, '易碎 轻放 ☺', w / 2, 61, w - 8, 10, FONTS.sans, '#c8202a');
});
decal('hh_tape', 256, 20, (ctx, w, h) => {
  ctx.fillStyle = '#f2c14e'; ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 4; i++) fitText(ctx, '滚滚快递', (i + 0.5) * w / 4, h / 2, w / 4 - 12, h - 6, FONTS.sans, '#c8202a');
});
decal('hh_box_print', 96, 64, (ctx, w, h) => {
  ctx.fillStyle = '#4a3322'; ctx.strokeStyle = '#4a3322'; ctx.lineWidth = 4;
  for (const x of [14, 32]) { // this way up
    ctx.beginPath(); ctx.moveTo(x, 8); ctx.lineTo(x - 9, 22); ctx.lineTo(x + 9, 22); ctx.fill();
    ctx.fillRect(x - 2, 20, 4, 18);
  }
  ctx.fillRect(4, 42, 40, 4);
  // fragile glass
  ctx.beginPath(); ctx.moveTo(56, 8); ctx.lineTo(80, 8); ctx.lineTo(76, 28); ctx.quadraticCurveTo(68, 36, 60, 28); ctx.closePath(); ctx.stroke();
  ctx.fillRect(66, 32, 4, 12); ctx.fillRect(59, 44, 18, 4);
  fitText(ctx, '易碎', 68, 57, 34, 13, FONTS.sans, '#c8202a');
});

function parcel(m, W, H, L, kraft, big) {
  m.box(W, H, L, kraft, 0, H / 2, 0);
  const tw = big ? 0.06 : 0.045, drop = big ? 0.1 : 0.05, tape = 0xf2c14e;
  m.tbox(W + 0.004, 0.002, tw, tape, { py: 'hh_tape' }, 0, H + 0.001, 0);
  m.sym(s => m.box(0.002, drop, tw, tape, s * (W / 2 + 0.001), H - drop / 2 + 0.001, 0));
  m.box(W * 0.999, 0.0015, 0.003, shade(kraft, 0.7), 0, H + 0.0004, tw / 2 + 0.03); // flap edge lines
  const lw = big ? 0.16 : 0.09;
  m.decal(lw, lw * 0.75, 'hh_label', big ? 0.1 : 0.05, H + 0.0012, big ? 0.11 : 0.0555, -90 * D, 0, 0);
  if (big) {
    m.decal(0.15, 0.1, 'hh_box_print', -0.12, H * 0.62, L / 2 + 0.001);
    m.decal(0.15, 0.1, 'hh_box_print', 0.12, H * 0.62, -L / 2 - 0.001, 0, Math.PI, 0);
  }
}
def('parcel_big', {
  name: '快递箱', cat: 'daily', sfx: 'paper', fill: 1,
  build(m) { parcel(m, 0.5, 0.36, 0.4, 0xc8955a, true); },
});
def('parcel_small', {
  name: '快递小盒', cat: 'daily', sfx: 'paper', fill: 1,
  build(m) { parcel(m, 0.25, 0.12, 0.18, 0xd8ab70, false); },
});

// ---- 红灯笼 (hangs at 2.5–4 m; origin = bottom of the tassel) ---------------------------------
decal('hh_fu', 96, 96, (ctx, w, h) => {
  ctx.font = `bold ${Math.round(h * 0.82)}px ${FONTS.brush}`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.lineWidth = 7; ctx.strokeStyle = '#7d1712'; ctx.strokeText('福', w / 2, h * 0.53);
  ctx.fillStyle = '#f7cc4a'; ctx.fillText('福', w / 2, h * 0.53);
});

def('lantern_red', {
  name: '红灯笼', cat: 'daily', sfx: 'paper', fill: 0.4,
  build(m) {
    const y0 = 0.14, gold = 0xf2b83e;
    // gold tassel, red knot, cord
    m.cyl(0.011, 0.03, 0.08, gold, 0, 0.04, 0, 0, 0, 0, 8);
    m.cyl(0.013, 0.013, 0.012, 0xe0a030, 0, 0.082, 0, 0, 0, 0, 8);
    m.cyl(0.003, 0.003, 0.06, 0xb82420, 0, 0.11, 0, 0, 0, 0, 4);
    m.box(0.032, 0.032, 0.01, 0xc8202a, 0, 0.108, 0, 0, 0, 45 * D);
    // body: eight paper facets, glowing at dusk
    m.glow(1);
    m.lathe([[0.075, 0], [0.12, 0.015], [0.155, 0.05], [0.17, 0.08], [0.17, 0.18], [0.155, 0.21], [0.12, 0.245], [0.075, 0.26]], 0xe23a2c, 0, y0, 0, 0, -22.5 * D, 0, 8);
    m.glow(0);
    const ap = 0.17 * Math.cos(22.5 * D) + 0.001;
    m.decal(0.1, 0.1, 'hh_fu', 0, y0 + 0.13, ap);
    m.decal(0.1, 0.1, 'hh_fu', 0, y0 + 0.13, -ap, 0, Math.PI, 0);
    // gold caps, hanging loop
    m.cyl(0.078, 0.085, 0.024, gold, 0, y0 + 0.004, 0, 0, 0, 0, 8);
    m.cyl(0.085, 0.078, 0.024, gold, 0, y0 + 0.256, 0, 0, 0, 0, 8);
    m.cyl(0.012, 0.018, 0.014, gold, 0, y0 + 0.274, 0, 0, 0, 0, 6);
    m.torus(0.016, 0.0035, 0xb82420, 0, y0 + 0.296, 0, 0, 0, 0, Math.PI * 2, 4, 10);
  },
});

// ---- 球 balls ---------------------------------------------------------------------------------
/** Puffed truncated icosahedron on the unit sphere: { pent, hex, minY }. */
const footballGeo = () => memo('football', () => {
  const t = (1 + Math.sqrt(5)) / 2;
  const V = [[-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0], [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t], [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1]]
    .map(v => new THREE.Vector3(...v));
  const nb = (a, b) => Math.abs(a.distanceTo(b) - 2) < 1e-6;
  const third = (a, b) => a.clone().lerp(b, 1 / 3);
  const fan = (out, pts) => {
    const c = pts.reduce((s, p) => s.add(p), new THREE.Vector3()).normalize();
    const u = pts[0].clone().addScaledVector(c, -pts[0].dot(c)).normalize(), w = new THREE.Vector3().crossVectors(c, u);
    pts.sort((p, q) => Math.atan2(p.dot(w), p.dot(u)) - Math.atan2(q.dot(w), q.dot(u)));
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i].clone().normalize(), b = pts[(i + 1) % pts.length].clone().normalize();
      out.push(...c.toArray(), ...a.toArray(), ...b.toArray());
    }
  };
  const pent = [], hex = [];
  for (let i = 0; i < 12; i++) fan(pent, V.filter(v => nb(V[i], v)).map(v => third(V[i], v)));
  for (let i = 0; i < 12; i++) for (let j = i + 1; j < 12; j++) for (let k = j + 1; k < 12; k++) {
    const [a, b, c] = [V[i], V[j], V[k]];
    if (nb(a, b) && nb(b, c) && nb(a, c)) fan(hex, [third(a, b), third(b, a), third(b, c), third(c, b), third(c, a), third(a, c)]);
  }
  let minY = 0;
  for (let i = 1; i < pent.length; i += 3) minY = Math.min(minY, pent[i]);
  for (let i = 1; i < hex.length; i += 3) minY = Math.min(minY, hex[i]);
  return { pent: geoFrom(pent), hex: geoFrom(hex), minY };
});

def('football', {
  name: '足球', cat: 'toy', sfx: 'hard', fill: 0.52,
  build(m) {
    const R = 0.11, g = footballGeo(), y = -g.minY * R;
    m.geo(g.hex, WHT, 0, y, 0, 0.3, 0.2, 0, R, R, R);
    m.geo(g.pent, BLK, 0, y, 0, 0.3, 0.2, 0, R, R, R);
  },
});

def('basketball', {
  name: '篮球', cat: 'toy', sfx: 'hard', fill: 0.52,
  build(m) {
    const R = 0.12, t = 0.0032, seam = 0x2b211c, y = R + t * 0.8;
    m.sphere(R, 0xe36f2a, 0, y, 0, 1, 1, 1, 0, 0, 0, 10);
    m.torus(R * 0.995, t, seam, 0, y, 0, 90 * D, 0, 0, Math.PI * 2, 3, 16);
    m.torus(R * 0.995, t, seam, 0, y, 0, 0, 90 * D, 0, Math.PI * 2, 3, 16);
    m.sym(s => m.torus(R * 0.8, t, seam, s * R * 0.6, y, 0, 0, 90 * D, 0, Math.PI * 2, 3, 12));
  },
});

// ---- 搪瓷脸盆 enamel washbasin ------------------------------------------------------------------
decal('hh_basin_band', 256, 24, (ctx, w, h) => {
  for (let i = 0; i < 3; i++) {
    const x = (i + 0.5) * w / 3;
    ctx.fillStyle = '#3f8f4a';
    for (const [dx, a] of [[-16, 0.3], [16, -0.3], [-28, -0.2], [28, 0.2]]) { ctx.save(); ctx.translate(x + dx, 12); ctx.rotate(a); ctx.beginPath(); ctx.ellipse(0, 0, 10, 4, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore(); }
    ctx.fillStyle = '#e8454a'; ctx.beginPath(); ctx.arc(x, 12, 10, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#f7a6b4'; ctx.beginPath(); ctx.arc(x, 12, 5, 0, Math.PI * 2); ctx.fill();
    for (const s of [-1, 1]) { ctx.fillStyle = '#f07a8a'; ctx.beginPath(); ctx.arc(x + s * 40, 12, 5, 0, Math.PI * 2); ctx.fill(); }
  }
});
decal('hh_basin', 128, 128, (ctx, w, h) => {
  const leafy = (x, y, len, ang) => {
    ctx.save(); ctx.translate(x, y); ctx.rotate(ang); ctx.fillStyle = '#3f8f4a';
    ctx.beginPath(); ctx.ellipse(len / 2, 0, len / 2, len / 4.5, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
  };
  leafy(64, 84, 34, 0.35); leafy(64, 84, 34, 2.8); leafy(62, 90, 28, 1.7); leafy(66, 80, 26, -0.9); leafy(60, 80, 26, -2.3);
  const ring = (r, n, col, x = 64, y = 84) => {
    ctx.fillStyle = col;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      ctx.beginPath(); ctx.arc(x + Math.cos(a) * r * 0.62, y + Math.sin(a) * r * 0.62, r * 0.5, 0, Math.PI * 2); ctx.fill();
    }
  };
  ring(30, 8, '#f07a8a'); ring(21, 7, '#e0404a'); ring(12, 5, '#c8202a');
  ctx.fillStyle = '#f2c14e'; ctx.beginPath(); ctx.arc(64, 84, 5, 0, Math.PI * 2); ctx.fill();
  fitText(ctx, '囍', 64, 30, 60, 46, FONTS.serif, '#d8342c');
});

def('washbasin', {
  name: '搪瓷脸盆', cat: 'daily', sfx: 'metal', fill: 0.3,
  build(m) {
    const enamel = 0xf3f1ea, rim = 0x2c3e66;
    m.lathe([[0, 0], [0.14, 0], [0.145, 0.008], [0.192, 0.09], [0.198, 0.1], [0.19, 0.102], [0.184, 0.095], [0.138, 0.014], [0, 0.014]], enamel, 0, 0, 0, 0, 0, 0, 16);
    m.torus(0.196, 0.006, rim, 0, 0.1, 0, 90 * D, 0, 0, Math.PI * 2, 4, 20);
    m.decal(0.27, 0.27, 'hh_basin', 0, 0.0146, 0, -90 * D, 0, 0);
    for (const ry of [0, Math.PI]) wrapCone(m, 'hh_basin_band', 0.1846, 0.1566, 0.05, Math.PI, 8, 0, 0.05, 0, ry);
    // a couple of chipped-enamel spots
    m.sphere(0.009, 0x1d2233, 0.13, 0.066, 0.103, 1, 0.8, 0.3, 0, 0.9, 0, 4);
    m.sphere(0.006, 0x1d2233, -0.17, 0.085, -0.07, 1, 0.8, 0.3, 0, -1.2, 0, 4);
  },
});

// ---- 外卖袋 takeout bag -------------------------------------------------------------------------
decal('hh_takeout', 64, 64, (ctx, w, h) => {
  ctx.fillStyle = '#f2a14a'; ctx.beginPath(); ctx.arc(32, 32, 30, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#fff8ec';
  ctx.beginPath(); ctx.arc(32, 26, 15, 0, Math.PI); ctx.fill(); // bowl
  ctx.fillRect(24, 40, 16, 3);
  ctx.strokeStyle = '#fff8ec'; ctx.lineWidth = 2.5;
  for (const x of [26, 32, 38]) { ctx.beginPath(); ctx.moveTo(x, 20); ctx.quadraticCurveTo(x + 4, 15, x, 10); ctx.stroke(); }
  fitText(ctx, '外卖', 32, 51, 34, 13, FONTS.round, '#fff8ec');
});
decal('hh_receipt', 40, 56, (ctx, w, h) => {
  ctx.fillStyle = '#fbfaf5'; ctx.fillRect(0, 0, w, h);
  fitText(ctx, '#38', w / 2, 10, w - 6, 14, FONTS.sans, '#26262c');
  ctx.fillStyle = '#8a8580';
  for (let i = 0; i < 5; i++) ctx.fillRect(5, 22 + i * 6, i % 2 ? 22 : 30, 2);
  fitText(ctx, '备注:多放辣', w / 2, 50, w - 4, 8, FONTS.sans, '#c8202a');
});

def('takeout_bag', {
  name: '外卖袋', cat: 'food', sfx: 'soft', fill: 0.6,
  build(m) {
    const W = 0.27, H = 0.16, L = 0.17, t = 0.004, bag = 0xf1ede2;
    m.box(W, t, L, bag, 0, t / 2, 0);
    m.sym(s => {
      m.box(W, H, t, bag, 0, H / 2, s * (L / 2 - t / 2));
      m.box(t, H, L, bag, s * (W / 2 - t / 2), H / 2, 0);
    });
    // stacked meal boxes: black base, rice + braised pork + greens on top
    m.box(0.15, 0.055, 0.13, 0x2d2d33, -0.05, 0.032, 0);
    m.box(0.15, 0.075, 0.13, 0x2d2d33, -0.05, 0.097, 0);
    m.box(0.152, 0.006, 0.132, 0xdfe8ea, -0.05, 0.136, 0); // lid rim
    m.box(0.13, 0.012, 0.11, 0xf6f3ea, -0.05, 0.14, 0); // rice
    for (const [x, z] of [[-0.09, 0.02], [-0.07, -0.025], [-0.045, 0.012]]) m.box(0.022, 0.018, 0.022, 0x9c3b1e, x, 0.149, z, 0, x * 20, 0);
    m.ellipsoid(0.03, 0.01, 0.035, 0x5cae4f, -0.005, 0.148, 0, 0, 0, 0, 6);
    // milk tea with a straw
    m.cyl(0.043, 0.036, 0.19, y => y < 0.035 ? 0x4a2f22 : 0xd9b48a, 0.082, 0.1, 0, 0, 0, 0, 10);
    m.cyl(0.044, 0.044, 0.004, 0xf6efe0, 0.082, 0.196, 0, 0, 0, 0, 10);
    m.cyl(0.005, 0.005, 0.1, 0xf08fb0, 0.09, 0.24, 0.006, 0.12, 0, -0.12, 6);
    // handles pulled up and knotted
    m.sym(s => {
      const dx = -s * 0.135, dy = 0.1, len = Math.hypot(dx, dy);
      const [rx, ry, rz] = orient([dx, dy, 0], [-dy, dx, 0]);
      m.plane(0.07, len, bag, s * W / 4, H + dy / 2, 0, rx, ry, rz);
      m.ellipsoid(0.012, 0.028, 0.006, bag, s * 0.02, 0.285, 0, 0, 0, -s * 0.6, 5);
    });
    m.sphere(0.017, shade(bag, 0.96), 0, 0.262, 0, 1.2, 0.9, 1, 0, 0, 0, 6);
    m.decal(0.08, 0.08, 'hh_takeout', -0.05, 0.085, L / 2 + 0.001);
    m.decal(0.04, 0.056, 'hh_receipt', 0.07, 0.09, L / 2 + 0.0012, 0, 0, 0.08);
  },
});

// ---- 电热水壶 electric kettle ------------------------------------------------------------------
def('kettle', {
  name: '电热水壶', cat: 'daily', sfx: 'metal', fill: 0.5,
  build(m) {
    const dark = 0x34353b, body = 0xf1efe9;
    m.cyl(0.085, 0.088, 0.02, dark, 0, 0.01, 0, 0, 0, 0, 12); // power base
    m.lathe([[0.074, 0], [0.076, 0.03], [0.072, 0.1], [0.064, 0.18], [0.06, 0.2], [0, 0.2]], body, 0, 0.02, 0, 0, 0, 0, 12);
    m.cyl(0.056, 0.06, 0.014, dark, 0, 0.226, 0, 0, 0, 0, 12); // lid
    m.box(0.032, 0.012, 0.02, dark, -0.034, 0.236, 0); // lid button
    m.cyl(0.01, 0.026, 0.042, body, 0.07, 0.205, 0, 0, 0, -60 * D, 6); // spout
    m.tube([[-0.056, 0.21, 0], [-0.1, 0.205, 0], [-0.116, 0.15, 0], [-0.11, 0.08, 0], [-0.07, 0.045, 0]], 0.012, dark, 5, false, 10);
    m.glow(0.6);
    m.box(0.016, 0.1, 0.006, 0x8fd0f0, 0, 0.12, 0.071, -4 * D, 0, 0); // water window
    m.box(0.012, 0.01, 0.012, 0x5ab4ff, -0.104, 0.07, 0.0); // power switch lamp
    m.glow(0);
  },
});

// ---- 电饭煲 retro rice cooker (flower print, lamp panel, front = +Z) ------------------------------
decal('hh_cooker', 64, 40, (ctx, w, h) => {
  ctx.fillStyle = '#3a3b42'; ctx.fillRect(0, 0, w, h);
  fitText(ctx, '煮饭', 18, 30, 26, 12, FONTS.sans, '#f4f2ec');
  fitText(ctx, '保温', 46, 30, 26, 12, FONTS.sans, '#f4f2ec');
});

def('rice_cooker', {
  name: '电饭煲', cat: 'daily', sfx: 'hard', fill: 0.65,
  build(m) {
    const shell = 0xf3f0e8, dark = 0x3a3a40, R = 0.15;
    m.cyl(R * 0.9, R * 0.86, 0.016, 0xb8bcc2, 0, 0.008, 0, 0, 0, 0, 16); // foot ring
    m.lathe([[0, 0], [0.13, 0], [0.145, 0.012], [R, 0.04], [R, 0.15], [0.146, 0.172], [0.143, 0.176], [0, 0.176]], shell, 0, 0.014, 0, 0, 0, 0, 16);
    wrapDecal(m, 'hh_thermos', R + 0.0008, 0.1, Math.PI, 8, 0, 0.11, 0);
    m.cyl(0.146, 0.146, 0.01, 0xd9d4c8, 0, 0.192, 0, 0, 0, 0, 16); // lid seam
    m.lathe([[0.146, 0], [0.142, 0.022], [0.12, 0.05], [0.06, 0.066], [0, 0.068]], shell, 0, 0.196, 0, 0, 0, 0, 16);
    m.cyl(0.02, 0.026, 0.014, dark, 0, 0.268, 0, 0, 0, 0, 8); // lid knob
    m.sphere(0.018, dark, 0, 0.278, 0, 1, 0.6, 1, 0, 0, 0, 6);
    m.sym(s => m.box(0.03, 0.022, 0.08, dark, s * (R + 0.01), 0.165, 0)); // side handles
    m.box(0.09, 0.055, 0.02, dark, 0, 0.06, R - 0.004); // control panel
    m.decal(0.086, 0.052, 'hh_cooker', 0, 0.06, R + 0.0065);
    m.box(0.022, 0.028, 0.02, 0xd8342c, 0, 0.045, R + 0.012); // switch lever
    m.glow(1);
    m.box(0.014, 0.01, 0.006, 0xff4a3a, -0.026, 0.075, R + 0.008);
    m.box(0.014, 0.01, 0.006, 0xffb52e, 0.026, 0.075, R + 0.008);
    m.glow(0);
  },
});

// ---- 腌菜坛子 glazed pickle jar (water-seal rim + upturned bowl lid) --------------------------------
decal('hh_jar_tag', 64, 64, (ctx, w, h) => {
  ctx.save(); ctx.translate(w / 2, h / 2); ctx.rotate(Math.PI / 4);
  ctx.fillStyle = '#d8342c'; ctx.fillRect(-21, -21, 42, 42);
  ctx.restore();
  fitText(ctx, '酸菜', w / 2, h / 2, w * 0.56, h * 0.3, FONTS.brush, '#2a1d17');
});

def('pickle_jar', {
  name: '腌菜坛子', cat: 'daily', sfx: 'glass', fill: 0.55,
  build(m) {
    const glaze = 0x6e3b1f, clay = 0xc49a6c;
    const col = (x, y) => (y < 0.055 ? clay : y > 0.36 ? 0x7c4424 : glaze);
    m.lathe([[0, 0], [0.1, 0], [0.108, 0.02], [0.145, 0.09], [0.178, 0.19], [0.185, 0.25], [0.172, 0.32], [0.13, 0.38], [0.095, 0.405],
      [0.13, 0.41], [0.142, 0.43], [0.138, 0.452], [0.126, 0.452], [0.12, 0.428], [0.088, 0.428], [0.082, 0.47], [0.07, 0.47], [0, 0.47]],
      col, 0, 0, 0, 0, -15 * D, 0, 12);
    m.lathe([[0.137, 0.44], [0.121, 0.44]], 0x7fb6c9, 0, 0, 0, 0, -15 * D, 0, 12); // water in the seal moat
    m.lathe([[0.112, 0.428], [0.117, 0.44], [0.106, 0.49], [0.076, 0.52], [0.04, 0.53], [0.034, 0.532], [0.03, 0.55], [0, 0.55]],
      0x7c4424, 0, 0, 0, 0, -15 * D, 0, 12);
    m.decal(0.07, 0.07, 'hh_jar_tag', 0, 0.22, 0.1765, 6.3 * D, 0, 0);
  },
});

// ---- 鸟笼 bamboo bird cage with a canary --------------------------------------------------------
def('bird_cage', {
  name: '鸟笼', cat: 'daily', sfx: 'wood', fill: 0.15,
  build(m) {
    const bamboo = 0xc99a58, dark = 0x7a4f2c, R = 0.14, yb = 0.035, yt = 0.33, n = 10;
    m.cyl(R + 0.012, R + 0.016, yb, dark, 0, yb / 2, 0, 0, 0, 0, 12); // base tray
    m.torus(R, 0.005, bamboo, 0, yt, 0, 90 * D, 0, 0, Math.PI * 2, 3, 12);
    m.torus(R, 0.004, bamboo, 0, 0.13, 0, 90 * D, 0, 0, Math.PI * 2, 3, 12);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2, x = Math.sin(a) * R, z = Math.cos(a) * R;
      rod(m, 0.003, bamboo, [x, yb, z], [x, yt, z], 3);
      rod(m, 0.003, bamboo, [x, yt, z], [x * 0.14, 0.405, z * 0.14], 3);
    }
    m.cyl(0.022, 0.03, 0.02, dark, 0, 0.408, 0, 0, 0, 0, 8); // top knob
    m.torus(0.017, 0.0035, 0x9aa0a6, 0, 0.436, 0, 0, 0, -0.5, Math.PI * 1.7, 3, 8); // hook
    rod(m, 0.004, dark, [-R, 0.15, 0], [R, 0.15, 0], 4); // perch
    m.cyl(0.015, 0.012, 0.02, 0xeef2f6, R - 0.017, 0.1, -0.03, 0, 0, 0, 6); // porcelain seed cup
    m.cyl(0.012, 0.012, 0.004, 0x3b6fc4, R - 0.017, 0.1105, -0.03, 0, 0, 0, 6);
    // canary on the perch, facing +Z
    const yel = 0xf5c542, wing = 0xd9a02c;
    m.ellipsoid(0.026, 0.025, 0.036, yel, 0, 0.178, -0.004, 0.25, 0, 0, 6);
    m.sphere(0.02, yel, 0, 0.207, 0.02, 1, 1, 1, 0, 0, 0, 6);
    m.cone(0.007, 0.014, 0xf2883a, 0, 0.203, 0.044, 90 * D, 0, 0, 4);
    m.sym(s => {
      m.box(0.005, 0.006, 0.004, INK, s * 0.012, 0.212, 0.036);
      m.ellipsoid(0.008, 0.017, 0.027, wing, s * 0.024, 0.178, -0.01, 0.3, 0, 0, 4);
    });
    m.box(0.022, 0.004, 0.04, wing, 0, 0.162, -0.048, -0.5, 0, 0); // tail
  },
});

// ---- 气球 balloon on a string (string reaches the ground) --------------------------------------
def('balloon', {
  name: '气球', cat: 'toy', sfx: 'soft', fill: 0.1,
  tints: [0xe8554a, 0xf2c14e, 0x5aa9e6, 0xf08fb0, 0x5cae4f, 0xa77be0],
  build(m) {
    const yb = 1.25;
    m.tint();
    m.lathe([[0, 0], [0.03, 0.02], [0.09, 0.08], [0.13, 0.16], [0.14, 0.22], [0.128, 0.28], [0.09, 0.33], [0.04, 0.348], [0, 0.35]], 0xffffff, 0, yb, 0, 0, 0, 0, 10);
    m.cone(0.014, 0.022, 0xe8e8e8, 0, yb - 0.006, 0, Math.PI, 0, 0, 6); // knot
    m.tint(0);
    m.ellipsoid(0.02, 0.045, 0.008, 0xfdfbf6, -0.064, yb + 0.25, 0.11, 0.2, -30 * D, 0.3, 6); // shine
    m.tube([[0, yb - 0.015, 0], [0.03, 0.95, 0.012], [-0.02, 0.55, -0.01], [0.025, 0.18, 0.01], [0.06, 0.015, 0.02], [0.1, 0.003, 0.0]], 0.0017, 0xf4f2ec, 3, false, 24);
  },
});

// =============================================================================================
// 盆栽 potted plants
// =============================================================================================
const GREENS = [0x3f8f4a, 0x5cae4f, 0x4f9e3c, 0x6fb84a];
/** Pot with a soil top: outer wall profile [[r, y], ...] up to the rim; soil sits `sink` below it. */
function pot(m, prof, col, soil, seg = 10) {
  const [rr, ry] = prof[prof.length - 1], sy = ry - 0.012;
  const p = [[0, 0], ...prof, [rr - 0.012, ry], [rr - 0.018, sy], [0, sy]];
  m.lathe(p, (x, y, z) => (y > sy - 0.001 && Math.hypot(x, z) < rr - 0.013 ? soil : col), 0, 0, 0, 0, 0, 0, seg);
  return sy;
}

def('potted_plant', {
  name: '发财树', cat: 'plant', sfx: 'wood', fill: 0.2,
  build(m) {
    const trunk = 0x9a7a4e;
    const sy = pot(m, [[0.13, 0], [0.14, 0.02], [0.17, 0.26], [0.182, 0.285], [0.182, 0.3]], 0xf1ede4, 0x5a3e2b, 8);
    m.cyl(0.1685, 0.1648, 0.03, 0xd9a93e, 0, 0.215, 0, 0, 0, 0, 8); // gold band
    m.cyl(0.03, 0.05, 0.06, trunk, 0, sy + 0.03, 0, 0, 0, 0, 6); // swollen base
    // three braided stems
    const tops = [];
    for (let k = 0; k < 3; k++) {
      const pts = [];
      for (let i = 0; i <= 5; i++) {
        const t = i / 5, a = k * 2.094 + t * Math.PI * 3, r = 0.024 * (1 - 0.35 * t);
        pts.push([Math.cos(a) * r, sy + 0.02 + t * 0.52, Math.sin(a) * r]);
      }
      const a = k * 2.094 + 0.8;
      pts.push([Math.cos(a) * 0.07, sy + 0.64, Math.sin(a) * 0.07]);
      tops.push(pts[pts.length - 1]);
      m.tube(pts, 0.014, trunk, 4, false, 8);
    }
    // red ribbon bow (开业大吉 gift style)
    m.cyl(0.037, 0.037, 0.03, 0xd8342c, 0, sy + 0.2, 0, 0, 0, 0, 6);
    m.sym(s => m.ellipsoid(0.035, 0.022, 0.01, 0xd8342c, s * 0.035, sy + 0.215, 0.04, 0, 0, s * 0.35, 4));
    // leaf clusters: five big leaflets fanned out at the end of each petiole
    const C = [[0.02, 1.14, 0.02, 0.4], [0.24, 1.05, 0.1, 0.1], [-0.22, 1.07, 0.12, 0.12], [0.08, 1.05, -0.24, 0.1], [-0.17, 0.98, -0.16, -0.05], [0.21, 0.95, -0.1, -0.08]];
    C.forEach(([x, y, z, tilt], i) => {
      rod(m, 0.005, 0x6f8f3a, tops[i % 3], [x, y, z], 3);
      for (let j = 0; j < 5; j++) {
        const a = i * 0.7 + (j / 5) * Math.PI * 2;
        leaf(m, 0.23, 0.085, GREENS[(i + j) % 4], x, y, z, [Math.cos(a), tilt - 0.12, Math.sin(a)]);
      }
    });
  },
});

def('pothos', {
  name: '绿萝', cat: 'plant', sfx: 'soft', fill: 0.35,
  build(m) {
    const sy = pot(m, [[0.07, 0], [0.075, 0.01], [0.09, 0.12], [0.098, 0.125], [0.098, 0.14]], 0xc8693a, 0x4a3526);
    const G = [0x3f8f4a, 0x5cae4f, 0x7cbf4a, 0xa6c94e];
    for (let i = 0; i < 10; i++) { // bushy mound of heart leaves
      const a = i * 2.4, r = 0.015 + (i % 3) * 0.025, up = 0.3 + (i % 4) * 0.25;
      leaf(m, 0.095, 0.085, G[i % 4], Math.cos(a) * r, sy + 0.01 + (i % 3) * 0.03, Math.sin(a) * r, [Math.cos(a), up, Math.sin(a)], [0, 1, 0], true);
    }
    for (let v = 0; v < 4; v++) { // vines trailing over the rim and along the ground
      const a = (v + 0.5) * Math.PI / 2, c = Math.cos(a), s = Math.sin(a), side = v % 2 ? 1 : -1;
      const P = (r, y, off) => [c * r - s * off * side, y, s * r + c * off * side];
      const far = v % 2 ? 0.22 : 0.19;
      const pts = [P(0.05, sy + 0.02, 0), P(0.1, sy + 0.015, 0), P(0.115, 0.08, 0.01), P(0.13, 0.012, 0.02), P(far, 0.005, 0.04)];
      m.tube(pts, 0.003, 0x4f8a32, 3, false, 10);
      [[pts[2], 0.02], [pts[3], 0.004], [pts[4], 0.004]].forEach(([p, lift], j) =>
        leaf(m, 0.075, 0.07, G[(v + j) % 4], p[0], p[1] + lift, p[2], [c, j ? 0.15 : -0.4, s], [0, 1, 0], true));
    }
  },
});

def('rose_pot', {
  name: '月季花盆', cat: 'plant', sfx: 'soft', fill: 0.3,
  build(m) {
    const sy = pot(m, [[0.08, 0], [0.085, 0.015], [0.105, 0.17], [0.116, 0.18], [0.116, 0.2]], 0x9c5a3c, 0x4a3526, 8);
    const stems = [[0.03, 0.47, 0.01], [-0.06, 0.4, 0.05], [0.07, 0.38, -0.05], [-0.03, 0.34, -0.07], [0.05, 0.3, 0.08]];
    const blooms = [0xd8342c, 0xef6f94, 0xe8453c, 0xf08fb0];
    stems.forEach(([x, y, z], i) => {
      rod(m, 0.004, 0x4f7a32, [x * 0.3, sy, z * 0.3], [x, y, z], 4);
      for (const t of [0.4, 0.65]) { // leaves along the stem
        const px = x * 0.3 + (x - x * 0.3) * t, py = sy + (y - sy) * t, pz = z * 0.3 + (z - z * 0.3) * t, a = i * 1.9 + t * 5;
        leaf(m, 0.06, 0.04, i % 2 ? 0x356f33 : 0x3f7f3a, px, py, pz, [Math.cos(a), 0.3, Math.sin(a)]);
      }
      if (i < 4) {
        m.lathe([[0, 0], [0.012, 0.004], [0.028, 0.016], [0.036, 0.03], [0.034, 0.04], [0.022, 0.044], [0.012, 0.038], [0, 0.042]], blooms[i], x, y - 0.006, z, 0.2 * (i % 2 ? 1 : -1), i, 0, 6);
      } else {
        m.sphere(0.014, 0xd8342c, x, y + 0.01, z, 0.8, 1.3, 0.8, 0, 0, 0, 4); // bud
      }
    });
  },
});

// =============================================================================================
// 更多日用 more everyday things
// =============================================================================================
decal('hh_sticker', 48, 48, (ctx, w, h) => {
  ctx.fillStyle = '#f7f4ec'; ctx.beginPath(); ctx.arc(24, 24, 23, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#26262c';
  for (const s of [-1, 1]) {
    ctx.beginPath(); ctx.arc(24 + s * 12, 13, 6, 0, Math.PI * 2); ctx.fill(); // ears
    ctx.beginPath(); ctx.ellipse(24 + s * 7, 24, 4.5, 6, s * 0.5, 0, Math.PI * 2); ctx.fill(); // eye patches
  }
  ctx.beginPath(); ctx.ellipse(24, 32, 3.5, 2.5, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#fff'; for (const s of [-1, 1]) { ctx.beginPath(); ctx.arc(24 + s * 7, 23, 1.6, 0, Math.PI * 2); ctx.fill(); }
  ctx.fillStyle = '#f29aa6'; for (const s of [-1, 1]) { ctx.beginPath(); ctx.arc(24 + s * 13, 31, 3, 0, Math.PI * 2); ctx.fill(); }
});

def('suitcase', {
  name: '行李箱', cat: 'daily', sfx: 'hard', fill: 0.8,
  tints: [0x2f63c9, 0xd8342c, 0xf2c14e, 0x9aa0a6, 0xf08fb0, 0x2aa198],
  build(m) {
    const W = 0.42, H = 0.52, T = 0.26, y0 = 0.065, r = 0.045, dark = 0x2e3036, yc = y0 + H / 2;
    m.tint();
    m.rbox(W, H, T, r, 0xffffff, 0, yc, 0);
    m.sym(s => m.sym(t => m.box(0.028, H * 0.78, 0.01, 0xe4e4e4, s * 0.105, yc, t * (T / 2 + 0.003))));
    m.tint(0);
    // zipper seam around the middle (straight runs only)
    m.sym(s => {
      m.box(0.006, H - 2 * r, 0.012, dark, s * (W / 2 + 0.002), yc, 0);
      m.box(W - 2 * r, 0.006, 0.012, dark, 0, yc + s * (H / 2 + 0.002), 0);
    });
    // telescopic handle (retracted) + side grip
    m.sym(s => m.box(0.018, 0.035, 0.02, dark, s * 0.1, y0 + H + 0.016, -0.07));
    m.box(0.24, 0.022, 0.03, dark, 0, y0 + H + 0.04, -0.07);
    m.box(0.02, 0.022, 0.12, dark, W / 2 + 0.012, yc + 0.08, 0);
    // spinner wheels
    m.sym(s => m.sym(t => {
      m.box(0.05, 0.03, 0.05, dark, s * (W / 2 - 0.045), y0 - 0.008, t * (T / 2 - 0.045));
      m.cyl(0.03, 0.03, 0.026, 0x1b1b1d, s * (W / 2 - 0.045), 0.03, t * (T / 2 - 0.045), 0, 0, 90 * D, 8);
    }));
    m.decal(0.08, 0.08, 'hh_sticker', 0, yc - 0.1, T / 2 + 0.0015, 0, 0, 0.2);
  },
});

decal('hh_weave', 64, 64, (ctx, w, h) => {
  ctx.save(); ctx.beginPath(); ctx.arc(32, 32, 31, 0, Math.PI * 2); ctx.clip();
  ctx.strokeStyle = '#9c7040'; ctx.lineWidth = 2;
  for (const a of [0, Math.PI / 3, (2 * Math.PI) / 3]) {
    ctx.save(); ctx.translate(32, 32); ctx.rotate(a);
    for (let i = -32; i <= 32; i += 8) { ctx.beginPath(); ctx.moveTo(-40, i); ctx.lineTo(40, i); ctx.stroke(); }
    ctx.restore();
  }
  ctx.restore();
  ctx.strokeStyle = '#8a5f34'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(32, 32, 29, 0, Math.PI * 2); ctx.stroke();
});

def('steamer', {
  name: '蒸笼', cat: 'daily', sfx: 'wood', fill: 0.7,
  build(m) {
    const R = 0.2, th = 0.075, top = 3 * th, fy = top - th + 0.02, bam = 0xdcbc82, band = 0xa77a45, cloth = 0xf1e8d2;
    // three stacked tiers (bands at the joints), the top tier open with a cloth-lined floor
    const prof = [[0, 0], [R, 0]];
    for (const y of [th, 2 * th]) prof.push([R, y - 0.013], [R + 0.004, y - 0.01], [R + 0.004, y + 0.01], [R, y + 0.013]);
    prof.push([R, top - 0.013], [R + 0.004, top - 0.01], [R + 0.004, top], [R - 0.01, top], [R - 0.01, fy], [0, fy]);
    m.lathe(prof, (x, y, z) => {
      const r = Math.hypot(x, z);
      return r > R + 0.001 ? band : y < fy + 0.001 && r < R - 0.011 ? cloth : bam;
    }, 0, 0, 0, 0, 0, 0, 12);
    // 包子 peeking out where the lid is pushed aside
    for (const [x, z] of [[0.11, 0.05], [0.1, -0.07], [0.02, 0.1]]) {
      m.dome(0.045, 0xf7f1e3, x, fy, z, 1, 0.8, 1, 0, 0, 0, 8);
      m.sphere(0.009, 0xeadcc0, x, fy + 0.035, z, 1, 0.7, 1, 0, 0, 0, 4);
    }
    // woven lid, slid half open
    m.push(-0.1, top + 0.001, 0, 0, 0, 2 * D);
    m.lathe([[0, 0.004], [R - 0.002, 0.004], [R + 0.006, 0], [R + 0.006, 0.035], [R - 0.01, 0.045], [0.1, 0.056], [0, 0.06]], (x, y) => (y < 0.036 && y > 0.001 ? band : bam), 0, 0, 0, 0, 0, 0, 12);
    m.decal(0.18, 0.18, 'hh_weave', 0, 0.0612, 0, -90 * D, 0, 0);
    m.pop();
  },
});

// ---- 沙燕风筝 swallow kite (lying flat, head towards +Z) ----------------------------------------
const KITE_R = [[0, 0.44], [0.05, 0.43], [0.08, 0.39], [0.07, 0.34], [0.11, 0.33], [0.25, 0.36], [0.38, 0.34], [0.5, 0.27], [0.45, 0.2], [0.3, 0.15],
  [0.17, 0.08], [0.1, 0.03], [0.1, -0.05], [0.16, -0.25], [0.21, -0.44], [0.13, -0.42], [0.06, -0.2], [0, -0.14]];
const KITE = [...KITE_R, ...KITE_R.slice(1, -1).reverse().map(([u, v]) => [-u, v])];
decal('hh_kite', 256, 230, (ctx, w, h) => {
  const P = (u, v) => [(u + 0.5) * w, ((0.45 - v) / 0.9) * h];
  const path = pts => { ctx.beginPath(); pts.forEach(([u, v], i) => (i ? ctx.lineTo(...P(u, v)) : ctx.moveTo(...P(u, v)))); ctx.closePath(); };
  path(KITE); ctx.fillStyle = '#f6efe0'; ctx.fill();
  ctx.save(); path(KITE); ctx.clip();
  for (const s of [-1, 1]) {
    // black upper wing with red, blue and green scallops
    ctx.fillStyle = '#26262c';
    path([[0.08 * s, 0.35], [0.25 * s, 0.37], [0.38 * s, 0.35], [0.52 * s, 0.28], [0.36 * s, 0.25], [0.2 * s, 0.24], [0.1 * s, 0.2]]); ctx.fill();
    [[0.2, 0.3, '#e8554a'], [0.31, 0.305, '#3b7fd4'], [0.41, 0.285, '#3fae6a']].forEach(([u, v, c]) => {
      ctx.fillStyle = c; ctx.beginPath(); ctx.arc(...P(u * s, v), 9, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#f2c14e'; ctx.beginPath(); ctx.arc(...P(u * s, v), 3.5, 0, Math.PI * 2); ctx.fill();
    });
    ctx.fillStyle = '#e8554a'; path([[0.12 * s, 0.19], [0.28 * s, 0.215], [0.3 * s, 0.19], [0.16 * s, 0.13]]); ctx.fill();
    // tail stripes
    ctx.fillStyle = '#26262c'; path([[0.1 * s, -0.05], [0.16 * s, -0.25], [0.21 * s, -0.44], [0.13 * s, -0.42], [0.06 * s, -0.2], [0.03 * s, -0.1]]); ctx.fill();
    ctx.fillStyle = '#3b7fd4'; ctx.beginPath(); ctx.arc(...P(0.12 * s, -0.2), 6, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#e8554a'; ctx.beginPath(); ctx.arc(...P(0.16 * s, -0.36), 6, 0, Math.PI * 2); ctx.fill();
  }
  // chest: red peach with a gold coin
  ctx.fillStyle = '#e8554a'; ctx.beginPath(); ctx.ellipse(...P(0, 0.13), 22, 26, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#f2c14e'; ctx.beginPath(); ctx.arc(...P(0, 0.12), 10, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#e8554a'; ctx.fillRect(P(0, 0.12)[0] - 3, P(0, 0.12)[1] - 3, 6, 6);
  // head: black cap, white face, big eyes, red cheeks
  ctx.fillStyle = '#26262c'; ctx.beginPath(); ctx.ellipse(...P(0, 0.445), 22, 9, 0, 0, Math.PI * 2); ctx.fill();
  for (const s of [-1, 1]) {
    const [ex, ey] = P(0.04 * s, 0.375);
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(ex, ey, 7, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#26262c'; ctx.beginPath(); ctx.arc(ex, ey, 4.5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(ex - 1.5, ey - 1.5, 2, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#f29aa6'; ctx.beginPath(); ctx.arc(...P(0.065 * s, 0.35), 4, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
  path(KITE); ctx.strokeStyle = '#26262c'; ctx.lineWidth = 2; ctx.stroke();
});

def('kite', {
  name: '沙燕风筝', cat: 'toy', sfx: 'paper', fill: 0.35,
  build(m) {
    const bam = 0xc99a58;
    // bamboo spars underneath (what touches the ground); image-local (u, v) maps to world (-u, v)
    rod(m, 0.004, bam, [-0.46, 0.004, 0.3], [0.46, 0.004, 0.3], 4);
    rod(m, 0.004, bam, [0, 0.004, -0.12], [0, 0.004, 0.42], 4);
    m.extrude(KITE, 0.004, 0xf6efe0, 0, 0.012, 0, -90 * D, 0, Math.PI);
    m.decal(1.0, 0.9, 'hh_kite', 0, 0.0145, 0, -90 * D, 0, Math.PI);
  },
});

// ---- 灭火器 fire extinguisher ------------------------------------------------------------------
decal('hh_fire', 108, 128, (ctx, w, h) => {
  ctx.fillStyle = '#f7f3ea'; ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#d8342c'; ctx.fillRect(0, 0, w, 30);
  fitText(ctx, '干粉灭火器', w / 2, 16, w - 10, 20, FONTS.sans, '#fff');
  fitText(ctx, 'MFZ/ABC4', w / 2, 43, w - 30, 13, FONTS.sans, '#26262c');
  ctx.strokeStyle = '#d8342c'; ctx.lineWidth = 3;
  for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(20 + i * 34, 76, 13, 0, Math.PI * 2); ctx.stroke(); }
  ctx.fillStyle = '#d8342c';
  fitText(ctx, '拔', 20, 76, 18, 16, FONTS.sans, '#d8342c'); fitText(ctx, '握', 54, 76, 18, 16, FONTS.sans, '#d8342c'); fitText(ctx, '压', 88, 76, 18, 16, FONTS.sans, '#d8342c');
  for (let i = 0; i < 3; i++) ctx.fillRect(10, 100 + i * 8, i === 2 ? 60 : 88, 3);
});

def('fire_extinguisher', {
  name: '灭火器', cat: 'daily', sfx: 'metal', fill: 0.5,
  build(m) {
    const red = 0xd02a22, dark = 0x2a2a2e, R = 0.08;
    m.cyl(R + 0.004, R + 0.006, 0.03, dark, 0, 0.015, 0, 0, 0, 0, 12); // foot
    m.cyl(R, R, 0.42, red, 0, 0.24, 0, 0, 0, 0, 12);
    m.lathe([[R, 0], [0.072, 0.03], [0.05, 0.05], [0.02, 0.058], [0, 0.058]], red, 0, 0.45, 0, 0, 0, 0, 12);
    wrapDecal(m, 'hh_fire', R + 0.0008, 0.2, (120 * Math.PI) / 180, 4, 0, 0.27, 0);
    m.cyl(0.018, 0.022, 0.03, 0xc9cdd2, 0, 0.52, 0, 0, 0, 0, 8); // neck
    m.box(0.05, 0.04, 0.036, 0x9aa0a6, 0, 0.55, 0); // valve
    m.box(0.11, 0.008, 0.026, dark, -0.05, 0.545, 0, 0, 0, -0.08); // carry handle
    m.box(0.11, 0.008, 0.026, dark, -0.05, 0.582, 0, 0, 0, 0.12); // squeeze lever
    m.torus(0.011, 0.0022, 0xf2c14e, 0.004, 0.565, 0.022, 0, 0, 0, Math.PI * 2, 3, 8); // safety pin
    m.cyl(0.013, 0.013, 0.008, 0xf4f2ec, 0.02, 0.568, 0.02, 90 * D, 0, 0, 8); // gauge
    m.box(0.004, 0.009, 0.002, 0x3a9a5c, 0.02, 0.57, 0.0245);
    m.tube([[0.024, 0.55, 0], [0.07, 0.535, 0.02], [0.095, 0.46, 0.035], [0.092, 0.3, 0.04], [0.09, 0.23, 0.04]], 0.007, dark, 5, false, 10);
    m.cone(0.012, 0.04, dark, 0.09, 0.205, 0.04, Math.PI, 0, 0, 6); // nozzle
  },
});

// ---- 金鱼缸 goldfish bowl (inner-facing glass reads as clear) -----------------------------------
function goldfish(m, x, y, z, yaw) {
  m.push(x, y, z, 0, yaw, 0);
  m.ellipsoid(0.011, 0.013, 0.022, 0xf2742e, 0, 0, 0, 0, 0, 0, 6);
  leaf(m, 0.026, 0.034, 0xf7a35c, 0, 0.002, -0.017, [0, 0.25, -1], [1, 0, 0]); // tail fan
  m.sym(s => m.box(0.004, 0.004, 0.003, INK, s * 0.008, 0.004, 0.016));
  m.pop();
}
def('goldfish_bowl', {
  name: '金鱼缸', cat: 'daily', sfx: 'glass', fill: 0.5,
  build(m) {
    const R = 0.15, yc = Math.cos(0.45) * R, wl = 0.2;
    const glass = memo('bowlGlass', () => inward(new THREE.SphereGeometry(1, 12, 7, 0, Math.PI * 2, 0.55, Math.PI - 1.0)));
    const tw = Math.acos((wl - yc) / (R * 0.97));
    const water = memo('bowlWater', () => inward(new THREE.SphereGeometry(1, 10, 5, 0, Math.PI * 2, tw, Math.PI - 0.47 - tw)));
    m.geo(glass, 0xd6eef4, 0, yc, 0, 0, 0, 0, R, R, R);
    m.geo(water, 0x9dd3e6, 0, yc, 0, 0, 0, 0, R * 0.97, R * 0.97, R * 0.97);
    const rw = Math.sqrt((R * 0.97) ** 2 - (wl - yc) ** 2);
    m.lathe([[rw, wl], [rw - 0.018, wl]], 0xc8ebf4, 0, 0, 0, 0, 0, 0, 12); // water line
    const ro = Math.sin(0.55) * R;
    m.torus(ro + 0.003, 0.006, 0xb6dce6, 0, yc + Math.cos(0.55) * R, 0, 90 * D, 0, 0, Math.PI * 2, 3, 12); // lip
    m.disc(Math.sin(0.45) * R * 0.98, 0xeadfc6, 0, 0.002, 0, 0, 0, 0, 12); // sand
    [0xe8554a, 0xf2c14e, 0x5aa9e6, 0xf4f2ec, 0x5cae4f].forEach((c, i) => {
      const a = i * 1.3 + 0.4, r = 0.02 + (i % 3) * 0.018;
      m.sphere(0.009, c, Math.cos(a) * r, 0.006, Math.sin(a) * r, 1, 0.6, 1, 0, a, 0, 4);
    });
    for (const [x, z, t] of [[-0.03, -0.03, 0.1], [-0.015, -0.04, -0.25], [0.0, -0.05, 0.3]]) leaf(m, 0.1, 0.028, 0x3f9a4a, x, 0.004, z, [t, 1, 0.1]);
    goldfish(m, 0.04, 0.1, 0.03, 60 * D);
    goldfish(m, -0.05, 0.145, 0.0, -110 * D);
    m.plane(0.012, 0.08, 0xfbfdfd, -0.068, 0.172, 0.129, -16 * D, -27.6 * D, 0); // glass shine
    m.plane(0.01, 0.035, 0xfbfdfd, -0.045, 0.2, 0.123, -25 * D, -20 * D, 0);
  },
});

// ---- 儿童滑板车 kick scooter (front +Z) ----------------------------------------------------------
def('kick_scooter', {
  name: '儿童滑板车', cat: 'toy', sfx: 'hard', fill: 0.12,
  tints: [0xf08fb0, 0x2f63c9, 0x5cae4f, 0xe8554a],
  build(m) {
    const dark = 0x2e3036, grey = 0xb8bcc2, wheel = 0x9fe3f0;
    m.glow(0.7); // light-up wheels
    m.sym(s => m.cyl(0.05, 0.05, 0.03, wheel, s * 0.085, 0.05, 0.22, 0, 0, 90 * D, 10));
    m.cyl(0.042, 0.042, 0.028, wheel, 0, 0.042, -0.24, 0, 0, 90 * D, 10);
    m.glow(0);
    m.sym(s => m.cyl(0.022, 0.022, 0.034, grey, s * 0.085, 0.05, 0.22, 0, 0, 90 * D, 6));
    m.cyl(0.02, 0.02, 0.032, grey, 0, 0.042, -0.24, 0, 0, 90 * D, 6);
    m.tint();
    m.box(0.13, 0.03, 0.44, 0xffffff, 0, 0.065, -0.02); // deck
    m.box(0.2, 0.04, 0.07, 0xffffff, 0, 0.08, 0.22); // front axle bridge
    m.box(0.05, 0.012, 0.1, 0xffffff, 0, 0.092, -0.235, 0.18, 0, 0); // rear brake fender
    rod(m, 0.016, 0xffffff, [0, 0.09, 0.22], [0, 0.66, 0.17], 8); // steering column
    m.sym(s => m.cyl(0.017, 0.017, 0.08, 0xffffff, s * 0.12, 0.67, 0.17, 0, 0, 90 * D, 6)); // grips
    m.tint(0);
    m.box(0.11, 0.004, 0.36, dark, 0, 0.082, -0.03); // grip tape
    rod(m, 0.011, grey, [-0.08, 0.67, 0.17], [0.08, 0.67, 0.17], 6); // T-bar
  },
});

// ---- 垃圾袋 black trash bag tied at the top -------------------------------------------------------
def('trash_bag', {
  name: '垃圾袋', cat: 'daily', sfx: 'soft', fill: 0.6,
  build(m) {
    const col = 0x2b2b31;
    const g = memo('trashBag', () => {
      const s = new THREE.SphereGeometry(1, 10, 8), p = s.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
        const k = 1 + Math.sin(x * 7.1 + z * 3.3) * Math.cos(y * 5.7 - x * 2.1) * 0.08 + Math.sin(z * 9.3 + y * 4.1) * 0.05;
        const pinch = y > 0.4 ? 1 - (y - 0.4) * 0.9 : 1;
        p.setXYZ(i, x * k * pinch, Math.max(-0.82, y * k), z * k * pinch);
      }
      return s.toNonIndexed();
    });
    m.geo(g, (x, y, z, nx, ny) => mix(col, 0x4a4a55, Math.max(0, ny) * 0.8), 0, 0.164, 0, 0, 0.4, 0, 0.23, 0.2, 0.21);
    m.cyl(0.018, 0.05, 0.07, col, 0, 0.39, 0, 0, 0, 0, 6); // gathered neck
    m.sphere(0.028, 0x333339, 0, 0.435, 0, 1, 0.8, 1, 0, 0, 0, 6); // knot
    m.sym(s => m.ellipsoid(0.03, 0.045, 0.008, 0x333339, s * 0.03, 0.47, 0, 0, 0.3, -s * 0.6, 5)); // tied ends
  },
});

// ---- 大扫把 bamboo street broom (lying, head towards +X) ------------------------------------------
def('broom', {
  name: '大扫把', cat: 'daily', sfx: 'wood', fill: 0.2,
  build(m) {
    const pole = 0xb8914c, straw = 0xc7a45c, r = 0.017;
    rod(m, r, pole, [-0.65, r, 0], [0.08, 0.034, 0], 6);
    for (const x of [-0.48, -0.25]) m.cyl(r * 1.18, r * 1.18, 0.014, shade(pole, 0.82), x, r + (x + 0.65) * 0.023, 0, 0, 0, 90 * D + 0.023, 6);
    m.jitter(0.1);
    for (let k = -3; k <= 3; k++) { // twig bundles fanning out
      const a = k * 0.13, L = 0.56 - Math.abs(k) * 0.02;
      const b = [0.02, 0.038, k * 0.012], t = [0.02 + Math.cos(a) * L, 0.0145, Math.sin(a) * L];
      const [rx, ry, rz] = aim(t[0] - b[0], t[1] - b[1], t[2] - b[2]);
      m.cyl(0.014, 0.03, Math.hypot(t[0] - b[0], t[1] - b[1], t[2] - b[2]), straw, (b[0] + t[0]) / 2, (b[1] + t[1]) / 2, (b[2] + t[2]) / 2, rx, ry, rz, 5);
    }
    for (let i = 0; i < 8; i++) { // loose twigs
      const a = (i - 3.5) * 0.11 + 0.03, L = 0.53 + (i % 3) * 0.035;
      rod(m, 0.003, shade(straw, 0.78), [0.06, 0.03, (i - 3.5) * 0.008], [0.06 + Math.cos(a) * L, 0.003, Math.sin(a) * L], 3);
    }
    m.jitter(0);
    m.box(0.022, 0.062, 0.14, 0xd8342c, 0.07, 0.036, 0); // red binding
    m.box(0.022, 0.05, 0.18, 0xd8342c, 0.16, 0.03, 0);
  },
});

// ---- 煤气罐 LPG cylinder ------------------------------------------------------------------------
decal('hh_lpg', 32, 128, (ctx, w, h) => verticalText(ctx, '液化石油气', w / 2, h / 2, w - 4, h - 6, FONTS.sans, '#d8342c'));

def('gas_tank', {
  name: '煤气罐', cat: 'daily', sfx: 'metal', fill: 0.6,
  build(m) {
    const steel = 0xb4bcc6, R = 0.155;
    m.pipe(0.12, 0.07, shade(steel, 0.9), 0, 0.035, 0, 0, 0, 0, 12); // foot ring
    m.lathe([[0, 0.05], [0.1, 0.055], [0.14, 0.08], [R, 0.12], [R, 0.42], [0.14, 0.46], [0.1, 0.485], [0.04, 0.495], [0, 0.495]], steel, 0, 0, 0, 0, -15 * D, 0, 12);
    m.decal(0.05, 0.2, 'hh_lpg', 0, 0.28, R * Math.cos(15 * D) + 0.001);
    m.pipe(0.085, 0.1, steel, 0, 0.53, 0, 0, 15 * D, 0, 12); // guard collar
    m.torus(0.085, 0.005, steel, 0, 0.58, 0, 90 * D, 0, 0, Math.PI * 2, 3, 12);
    m.sym(s => m.box(0.04, 0.024, 0.004, 0x3a3f45, 0, 0.55, s * 0.0835)); // hand holes
    m.cyl(0.02, 0.025, 0.05, 0xc9a04a, 0, 0.515, 0, 0, 0, 0, 6); // brass valve
    m.cyl(0.013, 0.013, 0.04, 0xc9a04a, 0.02, 0.53, 0, 0, 0, 90 * D, 6);
    m.cyl(0.022, 0.022, 0.012, 0xd8342c, 0, 0.545, 0, 0, 0, 0, 8); // handwheel
  },
});

// ---- 蜂窝煤炉 honeycomb-briquette stove with an aluminium kettle ---------------------------------
def('coal_stove', {
  name: '蜂窝煤炉', cat: 'daily', sfx: 'metal', fill: 0.45,
  build(m) {
    const paint = 0x3f8a7a, iron = 0x3a3a3e, alu = 0xc5cad0, R = 0.15;
    m.cyl(R + 0.006, R + 0.008, 0.03, iron, 0, 0.015, 0, 0, 0, 0, 12);
    m.cyl(R, R, 0.36, paint, 0, 0.2, 0, 0, 15 * D, 0, 12);
    const ap = R * Math.cos(15 * D);
    m.box(0.07, 0.06, 0.01, iron, 0, 0.1, ap + 0.002); // air door
    m.cyl(0.006, 0.006, 0.012, 0xc9cdd2, 0.02, 0.1, ap + 0.01, 90 * D, 0, 0, 6);
    m.sym(s => m.torus(0.03, 0.005, iron, s * R, 0.3, 0, 0, 0, -s * 90 * D, Math.PI, 3, 8)); // side handles
    m.box(0.34, 0.02, 0.34, iron, 0, 0.39, 0); // cast-iron top plate
    m.glow(1);
    m.disc(0.07, 0xf06a2a, 0, 0.4006, 0, 0, 0, 0, 10); // glowing coal
    m.glow(0);
    for (let i = 0; i < 3; i++) { const a = (i / 3) * Math.PI * 2 + 0.5; m.box(0.03, 0.016, 0.02, iron, Math.cos(a) * 0.085, 0.408, Math.sin(a) * 0.085, 0, -a, 0); }
    // kettle
    const yk = 0.416;
    m.lathe([[0, 0], [0.095, 0], [0.105, 0.02], [0.105, 0.06], [0.085, 0.1], [0.05, 0.12], [0.045, 0.125], [0, 0.125]], alu, 0, yk, 0, 0, 0, 0, 12);
    m.cyl(0.012, 0.016, 0.018, 0x2a2a2e, 0, yk + 0.134, 0, 0, 0, 0, 6);
    m.tube([[0.08, yk + 0.04, 0], [0.12, yk + 0.07, 0], [0.14, yk + 0.11, 0], [0.155, yk + 0.14, 0]], 0.009, alu, 5, false, 8);
    m.torus(0.075, 0.004, 0x8a8f96, 0, yk + 0.12, 0, 0, 90 * D, 0, Math.PI, 3, 12); // bail handle
    m.cyl(0.011, 0.011, 0.06, 0x2a2a2e, 0, yk + 0.195, 0, 90 * D, 0, 0, 6);
  },
});

// ---- 雨伞 open umbrella left on the ground ---------------------------------------------------------
def('umbrella', {
  name: '雨伞', cat: 'daily', sfx: 'soft', fill: 0.2,
  tints: [0xd8342c, 0x2f63c9, 0xf2c14e, 0x2aa198, 0xf08fb0, 0x26262c],
  build(m) {
    const hr = 0.55, Rr = 0.5, th = Math.atan2(hr, Rr), dark = 0x2e3036;
    // pose: tilted so the rim and the crook both rest on the ground; recentred on its footprint
    const Y = (y, z) => y * Math.cos(th) - z * Math.sin(th), Z = (y, z) => y * Math.sin(th) + z * Math.cos(th);
    const low = Math.min(Y(hr, Rr), Y(-0.012, 0.0), Y(0.0, 0.0) - 0.012);
    m.push(0, -low, -(Z(hr, Rr) + Z(0, 0)) / 2, th, 0, 0);
    m.tint();
    m.lathe([[0, hr + 0.24], [0.2, hr + 0.19], [0.38, hr + 0.1], [0.49, hr + 0.005], [Rr, hr], [0.49, hr + 0.012], [0.38, hr + 0.115], [0.2, hr + 0.205], [0, hr + 0.26]],
      (x, y, z, nx, ny) => (ny < 0 ? 0xd4d4d4 : 0xffffff), 0, 0, 0, 0, 0, 0, 8);
    m.tint(0);
    m.cyl(0.007, 0.007, hr + 0.2, dark, 0, (hr + 0.2) / 2 + 0.06, 0, 0, 0, 0, 6); // shaft
    m.cyl(0.012, 0.012, 0.05, dark, 0, hr - 0.08, 0, 0, 0, 0, 6); // runner
    m.cone(0.008, 0.05, dark, 0, hr + 0.285, 0, 0, 0, 0, 5); // ferrule
    for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; m.box(0.012, 0.012, 0.012, dark, Math.sin(a) * Rr, hr, Math.cos(a) * Rr); }
    m.tube([[0, 0.1, 0], [0, 0.03, 0], [0.012, -0.002, 0], [0.045, -0.004, 0], [0.066, 0.02, 0], [0.068, 0.045, 0]], 0.012, 0x8b5a3c, 5, false, 10);
    m.pop();
  },
});

// ---- 二胡 erhu with its bow ----------------------------------------------------------------------
decal('hh_skin', 48, 48, (ctx, w, h) => {
  ctx.save(); ctx.beginPath(); ctx.arc(24, 24, 23, 0, Math.PI * 2); ctx.clip();
  ctx.fillStyle = '#e2d3ae'; ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#5c4630';
  for (let y = 0; y < 6; y++) for (let x = 0; x < 6; x++) { ctx.beginPath(); ctx.ellipse(4 + x * 8 + (y % 2) * 4, 4 + y * 8, 3, 2.2, 0, 0, Math.PI * 2); ctx.fill(); }
  ctx.restore();
});

def('erhu', {
  name: '二胡', cat: 'daily', sfx: 'wood', fill: 0.12,
  build(m) {
    const wood = 0x5a2a1c, light = 0xc99a58, str = 0xe8e2d0;
    m.box(0.06, 0.02, 0.07, 0x3e1d12, 0, 0.01, -0.02); // base plate
    m.cyl(0.045, 0.045, 0.13, wood, 0, 0.065, -0.025, 90 * D, 0, 0, 6); // hexagonal sound box
    m.cyl(0.042, 0.042, 0.003, 0xd9c9a3, 0, 0.065, 0.041, 90 * D, 0, 0, 6); // python skin
    m.decal(0.072, 0.072, 'hh_skin', 0, 0.065, 0.0428);
    m.cyl(0.03, 0.03, 0.003, 0x2a1510, 0, 0.065, -0.091, 90 * D, 0, 0, 6); // carved back window
    rod(m, 0.011, wood, [0, 0.03, 0], [0, 0.78, 0], 6); // neck
    m.tube([[0, 0.77, 0], [0, 0.8, -0.005], [0, 0.815, -0.03], [0, 0.8, -0.05], [0, 0.785, -0.045]], 0.011, wood, 4, false, 6);
    for (const y of [0.64, 0.7]) { // tuning pegs
      rod(m, 0.007, wood, [-0.01, y, 0], [0.08, y, 0], 5);
      m.sphere(0.012, wood, 0.085, y, 0, 1.2, 1, 1, 0, 0, 0, 4);
    }
    m.box(0.014, 0.012, 0.008, light, 0, 0.1, 0.047); // bridge
    m.sym(s => rod(m, 0.0009, str, [s * 0.003, 0.7, 0.014], [s * 0.003, 0.106, 0.05], 3)); // strings
    m.cyl(0.016, 0.016, 0.008, 0xd8342c, 0, 0.54, 0.008, 0, 0, 0, 6); // qianjin cord
    // bow threaded through the strings
    rod(m, 0.005, light, [-0.34, 0.16, 0.03], [0.38, 0.13, 0.03], 5);
    m.box(0.66, 0.006, 0.003, 0xf1ead6, 0.02, 0.132, 0.03, 0, 0, -0.042);
    m.box(0.03, 0.03, 0.012, 0x2a1510, 0.35, 0.12, 0.03);
  },
});

// ---- 老式电视 CRT television with rabbit-ear antenna and a lace cover ----------------------------
decal('hh_tv_screen', 128, 96, (ctx, w, h) => {
  ['#f4f2ec', '#f2d94e', '#5fd0e0', '#5cc45a', '#d864c8', '#e8454a', '#3b5fd4'].forEach((c, i) => { ctx.fillStyle = c; ctx.fillRect((i * w) / 7, 0, w / 7 + 1, h * 0.68); });
  for (let i = 0; i < 6; i++) { const g = 40 + i * 40; ctx.fillStyle = `rgb(${g},${g},${g})`; ctx.fillRect((i * w) / 6, h * 0.68, w / 6 + 1, h * 0.16); }
  ctx.fillStyle = '#26262c'; ctx.fillRect(0, h * 0.84, w, h * 0.16);
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(w / 2, h * 0.42, h * 0.34, 0, Math.PI * 2); ctx.stroke();
  fitText(ctx, '幸福电视台', w / 2, h * 0.92, w * 0.7, h * 0.13, FONTS.sans, '#f2c14e');
});
decal('hh_tv_panel', 32, 112, (ctx, w, h) => {
  ctx.fillStyle = '#3a3a40'; ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#c9cdd2';
  for (let i = 0; i < 12; i++) ctx.fillRect(6, 62 + i * 4, w - 12, 2); // speaker slots
  ctx.fillStyle = '#f2c14e'; ctx.fillRect(6, 106, 6, 3); // power lamp
  fitText(ctx, '1 2 3 4', w / 2, 8, w - 4, 8, FONTS.sans, '#e8e8e8');
});
decal('hh_lace', 128, 24, (ctx, w, h) => {
  ctx.fillStyle = '#f7f5ef'; ctx.fillRect(0, 0, w, 12);
  for (let i = 0; i < 8; i++) { ctx.beginPath(); ctx.arc(i * 16 + 8, 12, 8, 0, Math.PI); ctx.fill(); }
  ctx.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 16; i++) { ctx.beginPath(); ctx.arc(i * 8 + 4, 6, 2, 0, Math.PI * 2); ctx.fill(); }
  for (let i = 0; i < 8; i++) { ctx.beginPath(); ctx.arc(i * 16 + 8, 14, 3, 0, Math.PI * 2); ctx.fill(); }
  ctx.globalCompositeOperation = 'source-over';
});

def('tv_old', {
  name: '老式电视', cat: 'daily', sfx: 'crash', fill: 0.8,
  build(m) {
    const wood = 0x8b5a3c, W = 0.5, H = 0.4, T = 0.32, yc = H / 2 + 0.012, fz = T / 2, chrome = 0xc9cdd2;
    m.box(W * 0.9, 0.012, T * 0.9, 0x3a2418, 0, 0.006, 0); // plinth
    m.box(W, H, T, wood, 0, yc, 0);
    m.box(0.36, 0.3, 0.14, shade(wood, 0.8), 0, yc - 0.02, -fz - 0.07); // tube housing
    m.box(W - 0.02, H - 0.03, 0.01, 0xb8bcc2, 0, yc - 0.005, fz + 0.005); // silver front
    m.box(0.35, 0.28, 0.01, 0x2d3238, -0.06, yc - 0.01, fz + 0.01); // screen bezel
    m.glow(0.9);
    m.decal(0.31, 0.24, 'hh_tv_screen', -0.06, yc - 0.01, fz + 0.0155);
    m.glow(0);
    m.decal(0.075, 0.3, 'hh_tv_panel', 0.183, yc - 0.015, fz + 0.0104);
    for (const y of [yc + 0.08, yc + 0.02]) { // channel + volume knobs
      m.cyl(0.021, 0.023, 0.022, 0x2a2a2e, 0.183, y, fz + 0.02, 90 * D, 0, 0, 8);
      m.box(0.004, 0.016, 0.004, 0xf4f2ec, 0.183, y + 0.004, fz + 0.032);
    }
    // crocheted lace cover and the rabbit ears
    m.box(0.3, 0.004, 0.26, 0xf7f5ef, 0.02, H + 0.014, 0.02);
    m.decal(0.3, 0.056, 'hh_lace', 0.02, H + 0.012 - 0.028, fz + 0.0112);
    m.dome(0.035, 0x2a2a2e, 0, H + 0.016, -0.05, 1, 0.7, 1, 0, 0, 0, 6);
    m.sym(s => {
      rod(m, 0.003, chrome, [s * 0.01, H + 0.03, -0.05], [s * 0.2, H + 0.36, -0.1], 4);
      m.sphere(0.007, chrome, s * 0.2, H + 0.36, -0.1, 1, 1, 1, 0, 0, 0, 4);
    });
  },
});

// ---- 电风扇 standing fan --------------------------------------------------------------------------
decal('hh_grille', 128, 128, (ctx, w, h) => {
  ctx.strokeStyle = '#e9ecef'; ctx.lineWidth = 2.4;
  for (const r of [20, 34, 48, 61]) { ctx.beginPath(); ctx.arc(64, 64, r, 0, Math.PI * 2); ctx.stroke(); }
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    ctx.beginPath(); ctx.moveTo(64 + Math.cos(a) * 14, 64 + Math.sin(a) * 14); ctx.lineTo(64 + Math.cos(a) * 62, 64 + Math.sin(a) * 62); ctx.stroke();
  }
});
decal('hh_fan_badge', 32, 32, (ctx, w, h) => {
  ctx.fillStyle = '#2f63c9'; ctx.beginPath(); ctx.arc(16, 16, 15, 0, Math.PI * 2); ctx.fill();
  fitText(ctx, '风', 16, 16, 22, 22, FONTS.round, '#f4f2ec');
});

def('electric_fan', {
  name: '电风扇', cat: 'daily', sfx: 'hard', fill: 0.15,
  build(m) {
    const body = 0xf1eee6, chrome = 0xc9cdd2, blade = 0x8ecdf0, yc = 0.995, R = 0.2;
    m.cyl(0.17, 0.19, 0.035, body, 0, 0.0175, 0, 0, 0, 0, 12); // round base
    [0xf4f2ec, 0xf4f2ec, 0xf4f2ec, 0xe8554a].forEach((c, i) => m.box(0.026, 0.014, 0.03, c, -0.045 + i * 0.03, 0.04, 0.12, -0.25, 0, 0)); // piano keys
    m.cyl(0.021, 0.024, 0.55, body, 0, 0.31, 0, 0, 0, 0, 6);
    m.cyl(0.012, 0.012, 0.33, chrome, 0, 0.74, 0, 0, 0, 0, 6);
    m.cyl(0.026, 0.026, 0.03, body, 0, 0.59, 0, 0, 0, 0, 6); // height lock collar
    m.box(0.03, 0.07, 0.04, body, 0, 0.92, -0.08); // tilt joint
    m.ellipsoid(0.07, 0.07, 0.085, body, 0, yc, -0.085, 0, 0, 0, 6); // motor
    m.cyl(0.012, 0.012, 0.08, chrome, 0, yc, -0.02, 90 * D, 0, 0, 6); // shaft
    for (let i = 0; i < 3; i++) { // blades
      const a = (i / 3) * Math.PI * 2;
      m.push(0, yc, 0.018, 0, 0, a);
      m.ellipsoid(0.058, 0.09, 0.005, blade, 0, 0.1, 0, 0, 25 * D, 0, 6);
      m.pop();
    }
    m.cyl(0.03, 0.036, 0.03, body, 0, yc, 0.03, 90 * D, 0, 0, 8); // spinner
    m.torus(R, 0.007, body, 0, yc, 0.018, 0, 0, 0, Math.PI * 2, 3, 16); // guard rim
    m.torus(R * 0.93, 0.005, body, 0, yc, -0.022, 0, 0, 0, Math.PI * 2, 3, 12);
    m.decal(R * 2, R * 2, 'hh_grille', 0, yc, 0.05, 0, 0, 0, 0xffffff, true);
    m.decal(R * 1.86, R * 1.86, 'hh_grille', 0, yc, -0.024, 0, 0, 0, 0xffffff, true);
    m.cyl(0.028, 0.028, 0.008, 0x2f63c9, 0, yc, 0.054, 90 * D, 0, 0, 8); // centre badge
    m.decal(0.05, 0.05, 'hh_fan_badge', 0, yc, 0.0585);
  },
});

// ---- 叠好的被子 folded floral quilts (东北大花被) -------------------------------------------------
function floral(ctx, w, h, ground, petal, heart, n, big) {
  ctx.fillStyle = ground; ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < n; i++) {
    const x = ((i + 0.5) * w) / n + (i % 2 ? 4 : -4), y = h * (i % 2 ? 0.34 : 0.66), r = big * (i % 3 === 1 ? 0.8 : 1);
    ctx.fillStyle = '#3f9a4a';
    for (const a of [0.6, 2.5, 4.2]) { ctx.beginPath(); ctx.ellipse(x + Math.cos(a) * r * 1.1, y + Math.sin(a) * r * 1.1, r * 0.75, r * 0.35, a, 0, Math.PI * 2); ctx.fill(); }
    ctx.fillStyle = petal;
    for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2; ctx.beginPath(); ctx.arc(x + Math.cos(a) * r * 0.55, y + Math.sin(a) * r * 0.55, r * 0.5, 0, Math.PI * 2); ctx.fill(); }
    ctx.fillStyle = heart; ctx.beginPath(); ctx.arc(x, y, r * 0.42, 0, Math.PI * 2); ctx.fill();
  }
}
decal('hh_quilt_r', 128, 32, (ctx, w, h) => floral(ctx, w, h, '#d8342c', '#f7a6c0', '#f2c14e', 5, 9));
decal('hh_quilt_g', 128, 32, (ctx, w, h) => floral(ctx, w, h, '#3a8f5c', '#f06a8a', '#fff1c8', 5, 9));
decal('hh_quilt_p', 128, 32, (ctx, w, h) => floral(ctx, w, h, '#f29bb0', '#fdf6ee', '#e8554a', 6, 7));
decal('hh_quilt_top', 128, 88, (ctx, w, h) => {
  floral(ctx, w, h / 2, '#d8342c', '#f7a6c0', '#f2c14e', 4, 13);
  ctx.save(); ctx.translate(18, h / 2); floral(ctx, w, h / 2, '#d8342c', '#f7a6c0', '#f2c14e', 4, 13); ctx.restore();
  ctx.fillStyle = '#d8342c'; ctx.fillRect(0, h / 2, 18, h / 2);
});

def('quilt_stack', {
  name: '叠好的被子', cat: 'daily', sfx: 'soft', fill: 0.9,
  build(m) {
    const q = [[0x3a8f5c, 'hh_quilt_g', 0.125, 0.0, 0.0], [0xf29bb0, 'hh_quilt_p', 0.115, 0.012, 0.05], [0xd8342c, 'hh_quilt_r', 0.12, -0.01, -0.04]];
    let y = 0;
    q.forEach(([col, key, h, dx, yaw], i) => {
      const f = { pz: key, nz: key, px: key, nx: key };
      if (i === q.length - 1) f.py = 'hh_quilt_top';
      m.tbox(0.6 - i * 0.02, h, 0.42 - i * 0.015, col, f, dx, y + h / 2, 0, 0, yaw, 0);
      y += h;
    });
  },
});
