// 南瓜地 — the third course, a back-garden vegetable patch on a crisp autumn morning: pumpkins (that
// wobble when hit), the giant prize pumpkin the ball rolls through (its lid a model of its own, so it
// can pop off), a wheelbarrow that trundles across the green, a square hay bale, a scarecrow in a
// flannel shirt, autumn maples, leaf piles, a crate of apples, a split-rail fence, raised-bed
// timbers, a watering can and a crow. Metres, base on y = 0, centred on x = z = 0, front faces +Z.
//
// Gameplay layout (the course code relies on these numbers):
//   pumpkin_giant      the windmill's footprint and tunnel exactly (see windmill.js): solid over x -1.2…+1.2,
//                      z -0.7…+0.7 down to y = 0, except a tunnel through along z at x -0.45…+0.45, 0.6 m
//                      clear (straight jambs to 0.6, a low arch above), no floor. Nothing in front of z 0.7
//                      or behind z -0.7 below 0.6 m. The door (+Z) and the one behind (-Z) are the same.
//   pumpkin_giant_lid  the stalk and the cap on top (pumpkin_giant's spec.pop): its lowest point goes
//                      PUMPKIN_GIANT.lidY up from the pumpkin's base, on its middle line (x = z = 0 as
//                      made, which place() in props.js keeps).
import * as THREE from 'three';
import { def } from '../../catalog/registry.js';
import { D, shade, mix } from '../../core/modeler.js';

// ---- local helpers -----------------------------------------------------------------------------
const UP = new THREE.Vector3(0, 1, 0);
const _d = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _L = new THREE.Matrix4();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const ICO = new THREE.IcosahedronGeometry(1, 0);
const ICO1 = new THREE.IcosahedronGeometry(1, 1);

/** Euler XYZ that turns local +Y towards direction dir [x, y, z]. */
function yTo(dir) {
  _d.set(dir[0], dir[1], dir[2]).normalize();
  _q.setFromUnitVectors(UP, _d);
  _e.setFromQuaternion(_q, 'XYZ');
  return [_e.x, _e.y, _e.z];
}
/** length, midpoint and rotation of the segment a → b */
function seg3(a, b) {
  const v = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  return [Math.hypot(v[0], v[1], v[2]), (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2, ...yTo(v)];
}
/** round rod from a to b (radius r at b, rb at a) */
function rod(m, a, b, r, col, seg = 6, rb = r) {
  const [len, x, y, z, rx, ry, rz] = seg3(a, b);
  m.cyl(r, rb, len, col, x, y, z, rx, ry, rz, seg);
}
/** square bar from a to b */
function bar(m, a, b, w, col, d = w) {
  const [len, x, y, z, rx, ry, rz] = seg3(a, b);
  m.box(w, len, d, col, x, y, z, rx, ry, rz);
}
/** cheap 20-triangle ball */
function ball(m, r, col, x, y, z, sx = 1, sy = 1, sz = 1) {
  m.geo(ICO, col, x, y, z, 0, 0, 0, r * sx, r * sy, r * sz);
}
/** loose triangles [[x,y,z] × 3, …] as one part; both = also the reverse side */
function tris(m, pts, col, both = false) {
  const all = both ? pts.concat(pts.map((p, i) => pts[i - (i % 3) + (2 - (i % 3))])) : pts;
  const pos = new Float32Array(all.length * 3);
  all.forEach((p, i) => pos.set(p, i * 3));
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.computeVertexNormals();
  m.geo(g, col);
}
/** quad a b c d (counter-clockwise seen from its front) as two triangles */
const quad = (a, b, c, d) => [a, b, c, a, c, d];
/** one colour per triangle, from fn(x, y, z, nx, ny, nz) at its first corner */
function perFace(fn) {
  let i = 0, c = 0;
  return (x, y, z, nx, ny, nz) => { if (i++ % 3 === 0) c = fn(x, y, z, nx, ny, nz); return c; };
}
/** leafy facets: a palette colour per triangle (mostly `base`), a little lighter on top */
function foliage(m, base, others = [], share = 0.18, amt = 0.07) {
  return perFace((x, y, z, nx, ny) => {
    const c = others.length && m.rng.r() < share ? m.rng.pick(others) : base;
    return shade(c, (1 + (m.rng.r() * 2 - 1) * amt) * (0.92 + 0.12 * ny));
  });
}
/** half an ellipse from (-a, y0) over the top to (+a, y0) */
function arch(a, b, y0, n = 10) {
  const pts = [];
  for (let k = 0; k <= n; k++) {
    const t = Math.PI - (k / n) * Math.PI;
    pts.push([a * Math.cos(t), y0 + b * Math.sin(t)]);
  }
  return pts;
}
/** the model-space → local-space matrix of a part about to be added under m's stack with this TRS
 *  (so a colour function can tell where on the unit shape a vertex is) */
function toLocal(m, x, y, z, rx, ry, rz, sx, sy, sz) {
  _L.compose(_p.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz)), _s.set(sx, sy, sz));
  return m.matrix.clone().multiply(_L).invert();
}

// ---- autumn palette ----------------------------------------------------------------------------
const ORANGE = 0xf08a24, ORANGE_DK = 0xe2701c, CREAM_PK = 0xf1e7cf, FLESH = 0xf7c46a, STALK = 0x6e6a30,
  STALK_TIP = 0xa38a58, VINE = 0x6f8a2c, LEAF = 0x7f9436, LEAF_DRY = 0xb4a040, CREAM = 0xf5ead2, WOOD = 0x9c6b3e,
  IRON = 0x45474d, RED_L = 0xcf3d2a, ORANGE_L = 0xe8782a, AMBER_L = 0xf0a332, YELLOW_L = 0xf2c843,
  BROWN_L = 0x9a5a2a, STRAW = 0xe6bf58, DENIM = 0x3f63a0, BLACK_F = 0x23252c;

// ================================================================================================
// pumpkins
// ================================================================================================
// A pumpkin is a silhouette ([radius, height] as fractions of its widest and its height, bottom to
// top) turned round y, pinched in at `ribs` creases: a lobe faces +z, a crease every 360°/ribs.
const PUMPKIN_PROF = [[0, 0.05], [0.42, 0], [0.76, 0.06], [0.94, 0.2], [1, 0.4], [0.97, 0.6], [0.85, 0.79], [0.6, 0.93], [0.3, 1], [0.14, 0.95], [0, 0.9]];
const HEIRLOOM_PROF = [[0, 0.06], [0.5, 0], [0.84, 0.07], [0.98, 0.25], [1, 0.45], [0.94, 0.68], [0.76, 0.88], [0.45, 1], [0.2, 0.98], [0, 0.9]];
const PUMPKIN_LOW = [[0, 0.06], [0.62, 0], [0.95, 0.2], [1, 0.45], [0.87, 0.76], [0.45, 0.98], [0, 0.9]]; // (fewer rings: little ones)
const PROF_ID = new Map([[PUMPKIN_PROF, 'p'], [HEIRLOOM_PROF, 'h'], [PUMPKIN_LOW, 'l']]);
const lobeAt = (ribs, th) => Math.abs(Math.cos((ribs * th) / 2)); // 1 mid-lobe, 0 at a crease

/** the ribbed shape as triangles in its own space: radius rx/rz at its widest, height h from y0 */
function ribbed(prof, ribs, per, depth, rx = 1, h = 1, rz = 1, y0 = 0) {
  const g = new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), ribs * per, Math.PI / ribs).toNonIndexed();
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i), f = 1 - depth * (1 - Math.pow(lobeAt(ribs, Math.atan2(x, z)), 0.6));
    p.setXYZ(i, x * f * rx, y0 + p.getY(i) * h, z * f * rz);
  }
  g.computeVertexNormals();
  return g;
}
const RIBBED = new Map();
function ribbedUnit(prof, ribs, per, depth) {
  const key = `${PROF_ID.get(prof)}:${ribs}:${per}:${depth}`;
  if (!RIBBED.has(key)) RIBBED.set(key, ribbed(prof, ribs, per, depth));
  return RIBBED.get(key);
}
/** pumpkin skin: darker down the creases and underneath, lighter towards the top */
const skin = (col, crease = 0.24) => (lobe, yn) => shade(col, (1 - crease + crease * Math.pow(lobe, 0.5)) * (0.84 + 0.22 * yn));

/** a pumpkin body: radius R, height H, standing at (x, y, z), turned ry; o = { ribs, per, depth, prof, tone } */
function pumpkinBody(m, R, H, col, x, y, z, ry = 0, o = {}) {
  const ribs = o.ribs || 10, depth = o.depth ?? 0.12, prof = o.prof || PUMPKIN_PROF;
  const per = m.minPart ? (m.coarse ? 1 : 2) : (o.per || 3);
  const inv = toLocal(m, x, y, z, 0, ry, 0, R, H, R), v = new THREE.Vector3(), tone = o.tone || skin(col);
  m.geo(ribbedUnit(prof, ribs, per, depth), (px, py, pz) => {
    v.set(px, py, pz).applyMatrix4(inv);
    return tone(lobeAt(ribs, Math.atan2(v.x, v.z)), v.y);
  }, x, y, z, 0, ry, 0, R, H, R);
}

/** a tube along a smooth curve through pts, its radius running from r0 to r1, `sides` facets round,
 *  closed at the far end with a cap of colour `cap` */
function taper(m, pts, r0, r1, col, sides = 5, cap = col) {
  const curve = new THREE.CatmullRomCurve3(pts.map(p => new THREE.Vector3(p[0], p[1], p[2])));
  const N = m.minPart ? 2 : (pts.length - 1) * 2, fr = curve.computeFrenetFrames(N, false), rings = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N, c = curve.getPointAt(t), r = r0 + (r1 - r0) * t, n = fr.normals[i], b = fr.binormals[i], ring = [];
    for (let j = 0; j < sides; j++) {
      const a = (j / sides) * Math.PI * 2, ca = Math.cos(a) * r, sa = Math.sin(a) * r;
      ring.push([c.x + ca * n.x + sa * b.x, c.y + ca * n.y + sa * b.y, c.z + ca * n.z + sa * b.z]);
    }
    rings.push(ring);
  }
  const side = [], end = [], o = curve.getPointAt(1), top = rings[N];
  for (let i = 0; i < N; i++) for (let j = 0; j < sides; j++) side.push(...quad(rings[i][j], rings[i][(j + 1) % sides], rings[i + 1][(j + 1) % sides], rings[i + 1][j]));
  for (let j = 0; j < sides; j++) end.push([o.x, o.y, o.z], top[j], top[(j + 1) % sides]);
  tris(m, side, col);
  tris(m, end, cap);
}

/** a stalk: a flared foot, a five-sided stem tapering and bending over `lean` towards yaw `dir`, a
 *  corky end */
function stalk(m, x, y, z, r, h, dir = 0, lean = 0.35, col = STALK, tip = STALK_TIP) {
  m.push(x, y, z, 0, dir, 0);
  m.cyl(r * 0.95, r * 1.7, h * 0.28, col, 0, h * 0.1, 0, 0, 0, 0, 6);
  taper(m, [[0, h * 0.1, 0], [0, h * 0.45, lean * h * 0.12], [0, h * 0.75, lean * h * 0.45], [0, h * 0.92, lean * h]], r, r * 0.72, col, 5, tip);
  m.pop();
}

/** a curling tendril: `turns` loops round a centre, rising `rise`, shrinking inwards */
function tendril(m, x, y, z, r, turns, rise, thick, col = VINE, a0 = 0) {
  const pts = [], n = Math.max(6, Math.round(turns * 7));
  for (let i = 0; i <= n; i++) {
    const t = i / n, a = a0 + t * turns * Math.PI * 2, rr = r * (1 - 0.55 * t);
    pts.push([x + Math.cos(a) * rr, y + t * rise, z + Math.sin(a) * rr]);
  }
  m.tube(pts, thick, col, 4, false, n * 2);
}

/** a broad squash leaf: rounded, five shallow lobes, its stem end at the origin pointing -y (local XY) */
const SQUASH_LEAF = [[0, 0], [0.3, 0.06], [0.5, 0.3], [0.42, 0.5], [0.52, 0.7], [0.3, 0.93], [0.1, 0.86], [0, 1], [-0.1, 0.86], [-0.3, 0.93], [-0.52, 0.7], [-0.42, 0.5], [-0.5, 0.3], [-0.3, 0.06]];
function squashLeaf(m, s, col, x, y, z, tilt, yaw) {
  m.push(x, y, z, 0, yaw, 0).push(0, 0, 0, tilt, 0, 0, s); // (laid back by `tilt`, then turned to `yaw`)
  m.extrude(SQUASH_LEAF, 0.02, (px, py, pz, nx, ny, nz) => (Math.abs(ny) > 0.5 ? col : shade(col, 0.8)), 0, 0, 0);
  m.pop().pop();
}

/** a whole pumpkin, R across the middle, standing at (x, y, z) */
function pumpkin(m, R, H, col, x, y, z, o = {}) {
  pumpkinBody(m, R, H, col, x, y, z, o.ry || 0, o);
  stalk(m, x, y + H * 0.88, z, R * (o.stalkR || 0.11), H * (o.stalkH || 0.32), o.stalkDir ?? 0.6, o.lean ?? 0.35, o.stalkCol || STALK);
}

// 南瓜 — the pumpkin on the green: wobbles when the ball hits it (round collider)
def('pumpkin', {
  name: '南瓜',
  cat: 'food',
  sfx: 'hard',
  fill: 0.6,
  build(m) {
    const R = 0.275, H = 0.34;
    pumpkinBody(m, R, H, ORANGE, 0, 0, 0, 0, { ribs: 10, per: 4, depth: 0.12 });
    stalk(m, 0, H * 0.88, 0, 0.03, 0.11, 0.8, 0.4);
    // a curl of vine and a small leaf, lying on the top
    tendril(m, -0.085, H * 0.9, 0.03, 0.045, 1.6, 0.05, 0.0065, VINE, 0.4);
    squashLeaf(m, 0.13, LEAF, 0.02, H * 0.93, -0.03, -80 * D, 145 * D);
  },
});

// 小南瓜 — a little one, deeper orange
def('pumpkin_small', {
  name: '小南瓜',
  cat: 'food',
  sfx: 'hard',
  fill: 0.6,
  build(m) {
    const R = 0.175, H = 0.22;
    pumpkinBody(m, R, H, ORANGE_DK, 0, 0, 0, 0, { ribs: 8, per: 3, depth: 0.12 });
    stalk(m, 0, H * 0.88, 0, 0.022, 0.085, -0.9, 0.5);
    tendril(m, 0.06, H * 0.9, 0.0, 0.03, 1.3, 0.035, 0.005, VINE, 2.2);
  },
});

// 白南瓜 — a pale cream heirloom: flatter, more ribs, a fat grey-green stalk
def('pumpkin_white', {
  name: '白南瓜',
  cat: 'food',
  sfx: 'hard',
  fill: 0.6,
  build(m) {
    const R = 0.25, H = 0.27;
    const tone = (lobe, yn) => mix(shade(CREAM_PK, 0.82 + 0.2 * yn), 0xb9bf9a, (1 - Math.pow(lobe, 0.4)) * 0.55);
    pumpkinBody(m, R, H, CREAM_PK, 0, 0, 0, 0, { ribs: 12, per: 3, depth: 0.1, prof: HEIRLOOM_PROF, tone });
    stalk(m, 0, H * 0.86, 0, 0.035, 0.1, 2.4, 0.3, 0x8b9268, 0xb3a77e);
  },
});

// ================================================================================================
// 大南瓜 — the giant prize pumpkin the ball rolls through (the windmill's footprint), on a pallet
// ================================================================================================
const GP = { RX: 1.17, RZ: 0.7, H: 1.72, Y0: 0.14, ribs: 14, depth: 0.075, TW: 0.45, TH: 0.6, RISE: 0.14 };
// (the bottom stands near-upright, the way a prize pumpkin slumps; the top is cut flat under the lid)
const GP_BODY = [[0, 0.004], [0.72, 0], [0.9, 0.02], [0.975, 0.09], [1, 0.25], [1, 0.45], [0.965, 0.62], [0.86, 0.77], [0.7, 0.88], [0.5, 0.95], [0.43, 0.94], [0, 0.932]];
const GP_LID = [[0, 0.938], [0.43, 0.938], [0.515, 0.948], [0.3, 0.99], [0.17, 1], [0.1, 0.975], [0, 0.965]];
export const PUMPKIN_GIANT = { halfW: 1.2, halfD: 0.7, tunnelHalfW: GP.TW, tunnelH: GP.TH, lidY: GP.Y0 + GP_LID[0][1] * GP.H };

/** keep the part of polygon `poly` where s * (v[axis] - c) >= 0 */
function clipPoly(poly, axis, s, c) {
  const out = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length], da = s * (a[axis] - c), db = s * (b[axis] - c);
    if (da >= 0) out.push(a);
    if ((da >= 0) !== (db >= 0)) { const t = da / (da - db); out.push(a.map((v, k) => v + (b[k] - v) * t)); }
  }
  return out;
}
/** cut the tunnel out of a shell: drop what lies in |x| < hw below y = top, splitting the triangles
 *  that cross its edges so the hole's rim is straight (the door frame covers it) */
function cutTunnel(g, hw, top) {
  const p = g.attributes.position.array, out = [];
  const fan = poly => { for (let i = 1; i + 1 < poly.length; i++) out.push(...poly[0], ...poly[i], ...poly[i + 1]); };
  for (let t = 0; t < p.length; t += 9) {
    const tri = [[p[t], p[t + 1], p[t + 2]], [p[t + 3], p[t + 4], p[t + 5]], [p[t + 6], p[t + 7], p[t + 8]]];
    const xs = tri.map(v => v[0]), ys = tri.map(v => v[1]);
    if (Math.max(...xs) <= -hw || Math.min(...xs) >= hw || Math.min(...ys) >= top) { fan(tri); continue; }
    if (Math.max(...xs.map(Math.abs)) < hw && Math.max(...ys) < top) continue;
    fan(clipPoly(tri, 0, -1, -hw));
    fan(clipPoly(tri, 0, 1, hw));
    fan(clipPoly(clipPoly(clipPoly(tri, 0, 1, -hw), 0, -1, hw), 1, 1, top));
  }
  const c = new THREE.BufferGeometry();
  c.setAttribute('position', new THREE.Float32BufferAttribute(out, 3));
  c.computeVertexNormals();
  return c;
}
/** the giant's skin colour at a model-space point: creases, a little darker low down; the cut top
 *  (under the lid) and the lid's underside are the pale flesh */
function giantSkin(x, y, z, nx, ny) {
  const u = x / GP.RX, w = z / GP.RZ, yn = (y - GP.Y0) / GP.H, lobe = lobeAt(GP.ribs, Math.atan2(u, w));
  if (yn > 0.928 && Math.hypot(u, w) < 0.47) return ny < 0 || yn < 0.937 ? FLESH : shade(FLESH, 0.9);
  return shade(ORANGE, (0.8 + 0.2 * Math.pow(lobe, 0.5)) * (0.82 + 0.24 * Math.min(1, yn * 1.3)));
}
/** a model-space x on the giant's skin at height y, front side: how far out (z) the skin is there */
function giantFront(x, y) {
  const yn = (y - GP.Y0) / GP.H;
  let r = 1;
  for (let i = 1; i < GP_BODY.length; i++) {
    const [r0, y0] = GP_BODY[i - 1], [r1, y1] = GP_BODY[i];
    if (yn <= y1) { r = r0 + (r1 - r0) * Math.max(0, (yn - y0) / (y1 - y0)); break; }
  }
  const k = x / (GP.RX * r);
  return k >= 1 ? 0 : GP.RZ * r * Math.sqrt(1 - k * k) * (1 - GP.depth * 0.3);
}

def('pumpkin_giant', {
  name: '大南瓜',
  cat: 'building',
  sfx: 'hard',
  fill: 0.7,
  // its lid comes off: props.js popPart() hangs this model on it as the child named 'pop', its base
  // at `at` in the pumpkin's own frame
  pop: { id: 'pumpkin_giant_lid', at: [0, PUMPKIN_GIANT.lidY, 0] },
  build(m) {
    const { RX, RZ, H, Y0, ribs, depth, TW, TH, RISE } = GP, per = m.minPart ? 2 : 3;
    // the skin, with the tunnel cut through its lower middle (up to the top of the door's arch)
    m.geo(cutTunnel(ribbed(GP_BODY, ribs, per, depth, RX, H, RZ, Y0), TW, TH + RISE), giantSkin);
    // the tunnel: dark plank-lined walls and an arched ceiling, right through
    const lining = [[-TW - 0.05, 0], [-TW - 0.05, TH], ...arch(TW + 0.05, RISE + 0.06, TH).slice(1, -1), [TW + 0.05, TH], [TW + 0.05, 0],
      [TW, 0], ...arch(TW, RISE, TH).reverse(), [-TW, 0]];
    m.extrude(lining, 1.2, (x, y, z, nx, ny) => (ny < -0.3 ? 0x2a1d17 : 0x3d2a20), 0, 0, 0);
    for (let i = -2; i <= 2; i++) m.sym(s => m.box(0.012, TH - 0.04, 0.03, 0x4c3426, s * (TW + 0.003), TH / 2, i * 0.24)); // (3 mm proud)
    // the pallet it sits on, either side of the tunnel: slats on blocks, a dark inside
    m.sym(s => {
      const x0 = TW + 0.02, x1 = 1.2, cx = s * (x0 + x1) / 2, w = x1 - x0;
      m.box(w - 0.06, Y0 - 0.03, 1.34, 0x3a2a1f, cx, (Y0 - 0.03) / 2, 0);
      for (const z of [-0.62, 0, 0.62]) m.box(w, 0.07, 0.14, shade(WOOD, 0.9), cx, 0.06, z);
      m.jitter(0.08);
      for (let i = 0; i < 5; i++) m.box(0.12, 0.028, 1.4, 0xb38552, s * (x0 + 0.06 + (i * (w - 0.12)) / 4), Y0 - 0.014, 0);
      for (const z of [-0.64, 0.64]) m.box(w, 0.022, 0.12, 0xa67946, cx, 0.011, z);
      m.jitter(0);
    });
    // both ends alike: an arched cream door frame, the double door folded back against the skin,
    // a round window above
    for (const ry of [0, Math.PI]) {
      m.push(0, 0, 0, 0, ry, 0);
      const outer = arch(TW + 0.15, RISE + 0.16, TH, 12), inner = arch(TW, RISE, TH, 12).reverse();
      m.extrude([[-TW - 0.15, 0], ...outer, [TW + 0.15, 0], [TW, 0], ...inner, [-TW, 0]], 0.38, (x, y, z, nx, ny, nz) => shade(CREAM, nz > 0.5 ? 1 : 0.86), 0, 0, 0.51);
      m.sym(s => {
        // a leaf of the door, open flat against the pumpkin beside the frame
        const hx = s * (TW + 0.16), fx = s * (TW + 0.6), y = 0.32;
        const hz = giantFront(hx, y) + 0.035, fz = giantFront(fx, y) + 0.045, a = Math.atan2(fz - hz, Math.abs(fx - hx));
        m.push(hx, 0.01, hz, 0, -s * a, 0);
        // (planks: the door's own outline, its arched top falling towards the hinge)
        const top = k => TH + RISE * Math.sqrt(Math.max(0, 1 - ((0.44 - k) / 0.44) ** 2)) - 0.02;
        for (let i = 0; i < 4; i++) {
          const k0 = i * 0.11, k1 = k0 + 0.105, ht = top(k1);
          m.box(0.105, ht, 0.035, i % 2 ? 0x3c7e72 : 0x41867a, s * (k0 + k1) / 2, ht / 2, 0);
        }
        for (const yy of [0.14, 0.48]) {
          m.box(0.44, 0.06, 0.02, 0x33695f, s * 0.22, yy, 0.025);
          m.box(0.14, 0.02, 0.012, IRON, s * 0.07, yy, 0.04);
        }
        m.pop();
      });
      // round window: cream frame, warm lit glass, cross bars
      const wy = 1.12, wz = giantFront(0, wy) - 0.025;
      m.push(0, wy, wz, -8 * D, 0, 0);
      m.cyl(0.16, 0.16, 0.06, CREAM, 0, 0, 0.0, 90 * D, 0, 0, 12);
      m.glow(0.6);
      m.cyl(0.115, 0.115, 0.03, 0xffc96e, 0, 0, 0.022, 90 * D, 0, 0, 12);
      m.glow(0);
      m.box(0.23, 0.022, 0.016, CREAM, 0, 0, 0.04);
      m.box(0.022, 0.23, 0.016, CREAM, 0, 0, 0.04);
      m.pop();
      m.pop();
    }
    // a blue first-prize rosette pinned to the front left
    const px = -0.74, py = 0.98, pz = giantFront(px, py), yaw = Math.atan2(px / (RX * RX), pz / (RZ * RZ));
    m.push(px, py, pz + 0.01, 0, yaw, 0);
    for (const s of [-1, 1]) m.box(0.07, 0.22, 0.012, 0x2a62c4, s * 0.04, -0.13, 0.004, 0, 0, s * 0.12);
    m.cyl(0.12, 0.12, 0.02, 0x2f6fd0, 0, 0, 0.012, 90 * D, 0, 0, 12);
    m.cyl(0.085, 0.085, 0.02, 0x4a8ae6, 0, 0, 0.022, 90 * D, 0, 0, 10);
    m.cyl(0.05, 0.05, 0.02, 0xf2c230, 0, 0, 0.032, 90 * D, 0, 0, 8);
    m.pop();
  },
});

def('pumpkin_giant_lid', {
  name: '大南瓜盖',
  cat: 'food',
  sfx: 'hard',
  fill: 0.5,
  build(m) {
    const { RX, RZ, H, Y0, ribs, depth } = GP, per = m.minPart ? 2 : 3;
    m.push(0, -PUMPKIN_GIANT.lidY, 0); // (made where it sits on the pumpkin, then brought down to y = 0)
    m.geo(ribbed(GP_LID, ribs, per, depth, RX, H, RZ, Y0), giantSkin);
    // a fat stalk curving over backwards, a curling tendril and a big leaf over the cap
    const top = Y0 + 0.965 * H;
    stalk(m, 0, top - 0.01, 0, 0.085, 0.42, -2.2, 0.6, 0x5f6a2c, 0x9a8456);
    tendril(m, 0.22, top + 0.0, 0.06, 0.13, 1.7, 0.12, 0.016, VINE, 1.2);
    squashLeaf(m, 0.5, LEAF, -0.08, top + 0.03, 0.03, -82 * D, -125 * D);
    m.pop();
  },
});

// ================================================================================================
// 手推车 — a garden wheelbarrow: red steel tray with pumpkins and leaves in it, one wheel at the
// front (+Z), two handles and legs at the back. It trundles across the green (box collider).
// ================================================================================================
def('wheelbarrow', {
  name: '手推车',
  cat: 'vehicle',
  sfx: 'metal',
  fill: 0.45,
  build(m) {
    const red = 0xc8392d, redHi = 0xdc4a38, steel = 0x4a4d53, tyre = 0x2b2c30, hub = 0xe9e2cf, grip = 0x232326;
    // the tray: a tub whose nose slopes forward over the wheel
    const T = [[-0.3, 0.58, -0.3], [0.3, 0.58, -0.3], [0.31, 0.58, 0.4], [-0.31, 0.58, 0.4]];
    const B = [[-0.17, 0.34, -0.2], [0.17, 0.34, -0.2], [0.17, 0.34, 0.1], [-0.17, 0.34, 0.1]];
    tris(m, [
      ...quad(B[3], B[2], B[1], B[0]), // bottom (seen from below)
      ...quad(B[0], B[1], T[1], T[0]), // back
      ...quad(B[2], B[3], T[3], T[2]), // front
      ...quad(B[1], B[2], T[2], T[1]), // right
      ...quad(B[3], B[0], T[0], T[3]), // left
    ], red, true);
    // rolled rim
    for (let i = 0; i < 4; i++) rod(m, T[i], T[(i + 1) % 4], 0.02, redHi, 6);
    // handles: from the wheel's axle, under the tray, out to the grips
    const axle = [0, 0.17, 0.52];
    m.sym(s => {
      const a = [s * 0.09, 0.17, 0.52], g = [s * 0.29, 0.52, -0.6];
      rod(m, a, g, 0.019, steel, 6);
      rod(m, g, [s * 0.3, 0.535, -0.7], 0.027, grip, 6);
      // a leg from under the handle down to the ground, with a little foot
      const at = [s * 0.235, 0.41, -0.24];
      rod(m, at, [s * 0.25, 0.015, -0.28], 0.016, steel, 5);
      m.box(0.05, 0.02, 0.09, steel, s * 0.25, 0.01, -0.28);
      // stay from the tray's front corner down to the axle
      rod(m, [s * 0.15, 0.36, 0.14], a, 0.013, steel, 5);
    });
    rod(m, [-0.235, 0.41, -0.24], [0.235, 0.41, -0.24], 0.013, steel, 5);
    // wheel: fat tyre, cream hub, axle
    m.cyl(0.17, 0.17, 0.085, tyre, axle[0], axle[1], axle[2], 0, 0, 90 * D, 12);
    m.cyl(0.085, 0.085, 0.092, hub, axle[0], axle[1], axle[2], 0, 0, 90 * D, 8);
    m.cyl(0.02, 0.02, 0.2, steel, axle[0], axle[1], axle[2], 0, 0, 90 * D, 6);
    // the load: a bed of fallen leaves, three little pumpkins on it, more leaves on top
    m.dome(1, foliage(m, ORANGE_L, [RED_L, BROWN_L, AMBER_L], 0.5), 0, 0.5, 0.05, 0.27, 0.1, 0.33, 0, 0, 0, 8);
    pumpkin(m, 0.12, 0.15, ORANGE, -0.12, 0.5, -0.14, { ribs: 8, per: 2, prof: PUMPKIN_LOW, stalkDir: 2.2 });
    pumpkin(m, 0.11, 0.13, ORANGE_DK, 0.13, 0.5, -0.04, { ribs: 8, per: 2, prof: PUMPKIN_LOW, stalkDir: -0.6 });
    pumpkin(m, 0.1, 0.12, CREAM_PK, -0.03, 0.52, 0.2, {
      ribs: 8, per: 2, prof: PUMPKIN_LOW, stalkCol: 0x8b9268,
      tone: (lobe, yn) => mix(shade(CREAM_PK, 0.82 + 0.2 * yn), 0xb9bf9a, (1 - Math.pow(lobe, 0.4)) * 0.5),
    });
    const lv = [[0.16, 0.6, 0.22, 0.4], [-0.2, 0.6, 0.1, 1.8], [0.05, 0.62, -0.26, 3.1], [0.22, 0.6, -0.22, 4.2], [-0.24, 0.6, -0.26, 5.6], [0.12, 0.64, 0.12, 2.5]];
    lv.forEach(([x, y, z, a], i) => m.plane(0.1, 0.1, [RED_L, AMBER_L, ORANGE_L, BROWN_L][i % 4], x, y, z, -80 * D, 0.3, a));
  },
});

// ================================================================================================
// 干草捆 — a square hay bale: golden flakes pressed together, two bands of twine
// ================================================================================================
def('hay_bale', {
  name: '干草捆',
  cat: 'nature',
  sfx: 'soft',
  fill: 0.9,
  shape: 'box',
  build(m) {
    const W = 1.0, H = 0.45, Dp = 0.5, n = 7, fw = W / n;
    const tones = [STRAW, 0xdcb24c, 0xefcb66, 0xd8aa46];
    m.box(W - 0.04, H - 0.04, Dp - 0.04, 0xb88c34, 0, (H - 0.04) / 2, 0);
    // pressed flakes, each a little uneven, a straw-streaked face per facet
    for (let i = 0; i < n; i++) {
      const h = H - m.rng.range(0, 0.022), d = Dp - m.rng.range(0, 0.022), t = tones[i % 4];
      m.rbox(fw - 0.004, h, d, 0.03, perFace((x, y, z, nx, ny) => shade(t, (0.95 + m.rng.r() * 0.1) * (0.9 + 0.12 * ny))),
        -W / 2 + fw * (i + 0.5), h / 2, m.rng.range(-0.006, 0.006), 0, 0, m.rng.range(-0.015, 0.015));
    }
    // twine: over the top and down the front and back
    const tw = 0xc4452c;
    m.sym(s => {
      const x = s * 0.26;
      m.box(0.024, 0.01, Dp + 0.014, tw, x, H + 0.003, 0);
      for (const z of [-1, 1]) m.box(0.024, H, 0.01, tw, x, H / 2, z * (Dp / 2 + 0.005));
    });
    // stray straws lying along the top and poking from the ends
    for (let i = 0; i < 14; i++) {
      const end = i < 4, s = m.rng.sign();
      const x = end ? s * (W / 2 - 0.01) : m.rng.range(-0.42, 0.42), z = end ? m.rng.range(-0.18, 0.18) : m.rng.range(-0.22, 0.22);
      const y = end ? m.rng.range(0.1, H - 0.08) : H - 0.004;
      m.box(0.008, 0.008, 0.1, 0xf3d77a, x, y, z, end ? 0 : m.rng.range(-0.15, 0.05), end ? 90 * D + m.rng.range(-0.5, 0.5) : m.rng.range(-1.2, 1.2), 0);
    }
  },
});

// ================================================================================================
// 稻草人 — a Western garden scarecrow: a post and crossbar, a red flannel shirt, denim overalls,
// straw at the cuffs, a burlap-sack head with button eyes and a stitched smile, a floppy straw sun
// hat, and a crow on one arm
// ================================================================================================
const GRID = new Map();
/** a box in flannel check: base colour crossed by dark stripes every third cell, darker where they cross */
function plaid(m, w, h, d, cols, x, y, z, rx = 0, ry = 0, rz = 0, cell = 0.08) {
  const a = Math.max(1, Math.round(w / cell)), b = Math.max(1, Math.round(h / cell)), c = Math.max(1, Math.round(d / cell));
  const key = `${a}:${b}:${c}`;
  if (!GRID.has(key)) GRID.set(key, new THREE.BoxGeometry(1, 1, 1, a, b, c).toNonIndexed());
  const g = GRID.get(key), p = g.attributes.position, n = g.attributes.normal, list = [];
  for (let t = 0; t < p.count; t += 3) {
    const cx = (p.getX(t) + p.getX(t + 1) + p.getX(t + 2)) / 3 + 0.5, cy = (p.getY(t) + p.getY(t + 1) + p.getY(t + 2)) / 3 + 0.5;
    const cz = (p.getZ(t) + p.getZ(t + 1) + p.getZ(t + 2)) / 3 + 0.5;
    const ax = Math.abs(n.getX(t)), ay = Math.abs(n.getY(t));
    const [u, v] = ax > 0.5 ? [Math.floor(cz * c), Math.floor(cy * b)] : ay > 0.5 ? [Math.floor(cx * a), Math.floor(cz * c)] : [Math.floor(cx * a), Math.floor(cy * b)];
    const su = u % 3 === 1, sv = v % 3 === 1;
    list.push(su && sv ? cols[2] : su || sv ? cols[1] : cols[0]);
  }
  let i = 0;
  m.geo(g, () => list[(i++ / 3) | 0], x, y, z, rx, ry, rz, w, h, d);
}
/** a bunch of straw sticking out of (x, y, z) along direction yaw/pitch, `n` stalks fanning out */
function strawTuft(m, x, y, z, dir, n, len, spread = 0.5) {
  for (let i = 0; i < n; i++) {
    const d = [dir[0] + m.rng.range(-spread, spread), dir[1] + m.rng.range(-spread, spread), dir[2] + m.rng.range(-spread, spread)];
    const l = len * m.rng.range(0.7, 1.1), k = Math.hypot(d[0], d[1], d[2]);
    const e = [x + (d[0] / k) * l, y + (d[1] / k) * l, z + (d[2] / k) * l];
    const [, cx, cy, cz, rx, ry, rz] = seg3([x, y, z], e);
    m.cone(0.012, l, i % 2 ? STRAW : 0xf0d27a, cx, cy, cz, rx, ry, rz, 3);
  }
}

def('scarecrow_west', {
  name: '稻草人',
  cat: 'person',
  sfx: 'soft',
  fill: 0.3,
  build(m) {
    const post = 0x7a5a3a, red = 0xc8352e, stripe = 0x7e2834, navy = 0x2b3762, denimDk = 0x34548c, burlap = 0xcfae76;
    const flannel = [red, stripe, navy];
    // the post and crossbar
    m.box(0.07, 1.62, 0.07, post, 0, 0.81, -0.02);
    m.box(1.2, 0.055, 0.055, post, 0, 1.345, -0.03);
    // shirt: body and sleeves out along the crossbar, drooping a little at the ends
    plaid(m, 0.4, 0.44, 0.21, flannel, 0, 1.19, 0);
    m.sym(s => plaid(m, 0.4, 0.13, 0.14, flannel, s * 0.39, 1.33, -0.005, 0, 0, s * -5 * D));
    m.sym(s => m.box(0.03, 0.15, 0.16, navy, s * 0.585, 1.312, -0.005, 0, 0, s * -5 * D)); // cuffs
    m.sym(s => strawTuft(m, s * 0.6, 1.31, 0, [s, -0.25, 0], 6, 0.11, 0.5));
    // overalls: bib, straps, buttons, a patch pocket; hips and two dangling legs with turn-ups
    m.box(0.3, 0.24, 0.02, DENIM, 0, 1.08, 0.112);
    m.box(0.14, 0.1, 0.012, denimDk, 0, 1.1, 0.126);
    m.sym(s => {
      m.box(0.05, 0.22, 0.02, DENIM, s * 0.11, 1.3, 0.112);
      m.box(0.05, 0.02, 0.2, DENIM, s * 0.11, 1.412, 0.0);
      m.cyl(0.016, 0.016, 0.012, 0xe2b43a, s * 0.11, 1.2, 0.126, 90 * D, 0, 0, 6);
    });
    m.box(0.41, 0.16, 0.22, DENIM, 0, 0.92, 0);
    m.sym(s => {
      const top = [s * 0.1, 0.9, 0], bot = [s * 0.13, 0.4, 0.03];
      rod(m, top, bot, 0.07, DENIM, 6, 0.08);
      m.cyl(0.078, 0.078, 0.05, 0x5a7cb8, bot[0], bot[1] + 0.02, bot[2], 0, 0, 0, 6);
      strawTuft(m, bot[0], bot[1] + 0.01, bot[2], [0, -1, 0], 5, 0.1, 0.35);
    });
    m.box(0.09, 0.09, 0.012, 0xd9a441, -0.115, 0.62, 0.095, -3 * D, 0, 8 * D); // knee patch
    // straw collar and the sack's twine tie
    strawTuft(m, 0, 1.43, 0.06, [0, 0.2, 1], 5, 0.09, 0.8);
    m.cyl(0.07, 0.085, 0.06, burlap, 0, 1.44, 0, 0, 0, 0, 7);
    m.torus(0.072, 0.012, 0x8a6a3c, 0, 1.455, 0, 90 * D, 0, 0, Math.PI * 2, 4, 10);
    // burlap-sack head
    const hy = 1.6, R = 0.155;
    m.sphere(R, perFace((x, y, z, nx, ny) => shade(burlap, (0.94 + m.rng.r() * 0.1) * (0.92 + 0.1 * ny))), 0, hy, 0, 1, 1.06, 0.95, 0, 0, 0, 9);
    // face on the front of the sack: brown button eyes, a stitched nose and smile, rosy cheeks
    const onSack = (x, y, out = 0.004) => [x, y, Math.sqrt(Math.max(0, 1 - (x / R) ** 2 - ((y - hy) / (R * 1.06)) ** 2)) * R * 0.95 + out];
    m.sym(s => {
      const [ex, ey, ez] = onSack(s * 0.058, hy + 0.035, 0.002);
      m.cyl(0.03, 0.03, 0.014, 0x3b2618, ex, ey, ez, 90 * D, s * 22 * D, 0, 8);
      m.cyl(0.022, 0.022, 0.016, 0x22160f, ex, ey, ez + 0.002, 90 * D, s * 22 * D, 0, 8);
      ball(m, 0.006, 0xd8c6a6, ex + s * 0.004 - 0.008, ey + 0.008, ez + 0.012);
      const [cx, cy, cz] = onSack(s * 0.09, hy - 0.035, 0);
      m.cyl(0.024, 0.024, 0.01, 0xe58a62, cx, cy, cz, 90 * D, s * 35 * D, 0, 7);
    });
    const [nx, ny, nz] = onSack(0, hy - 0.002, 0);
    m.cone(0.02, 0.03, 0x9a7444, nx, ny, nz + 0.008, 90 * D, 0, 0, 3);
    const smile = [];
    for (let i = 0; i <= 6; i++) { const t = (i / 6 - 0.5) * 2; smile.push(onSack(t * 0.075, hy - 0.06 + t * t * 0.03, 0.003)); }
    m.tube(smile, 0.0065, 0x2a1c14, 4, false, 12);
    for (let i = 0; i < 5; i++) {
      const p = smile[i + 1];
      m.box(0.006, 0.03, 0.006, 0x2a1c14, p[0], p[1], p[2] + 0.002, 0, 0, ((i - 2) * 9) * D);
    }
    // floppy straw sun hat, tipped back a little so the face shows; a red band
    m.push(0, hy + 0.12, -0.02, -10 * D, 0, 6 * D);
    const hat = perFace((x, y, z, nx, ny) => shade(0xe2c072, (0.92 + m.rng.r() * 0.12) * (0.9 + 0.12 * ny)));
    m.lathe([[0.11, -0.004], [0.195, -0.014], [0.275, -0.045], [0.335, -0.098], [0.34, -0.085], [0.28, -0.03], [0.2, 0.0], [0.11, 0.012]], hat, 0, 0, 0, 0, 0, 0, 12);
    m.cyl(0.11, 0.135, 0.12, hat, 0, 0.065, 0, 0, 0, 0, 9);
    m.dome(0.11, hat, 0, 0.122, 0, 1, 0.45, 1, 0, 0, 0, 9);
    m.cyl(0.137, 0.137, 0.035, 0xb8352e, 0, 0.026, 0, 0, 0, 0, 9);
    m.pop();
    // a crow perched on the left arm
    m.push(-0.44, 1.395, 0.0, 0, 25 * D, 0, 0.72);
    crow(m, true);
    m.pop();
  },
});

// ================================================================================================
// 乌鸦 — a crow standing beside the green, head up, watching: blue-black, a stout grey beak, bright eyes
// ================================================================================================
function crow(m, lite = false) {
  const blk = BLACK_F, sheen = 0x3a4256, wing = 0x1b1d23, beak = 0x55575f, leg = 0x3b3c42;
  const body = (x, y, z, nx, ny) => (ny > 0.45 ? mix(blk, sheen, Math.min(1, (ny - 0.45) * 2.2)) : blk);
  // legs and toes
  m.sym(s => {
    rod(m, [s * 0.032, 0.0, 0.0], [s * 0.03, 0.1, -0.01], 0.008, leg, 4);
    if (lite) return;
    for (const a of [-0.45, 0.45]) m.box(0.009, 0.008, 0.05, leg, s * 0.032 + Math.sin(a) * 0.022, 0.004, 0.02, 0, a, 0);
    m.box(0.009, 0.008, 0.075, leg, s * 0.032, 0.004, 0.004);
  });
  // body leaning back from a full breast, tail down behind
  m.ellipsoid(0.075, 0.08, 0.135, body, 0, 0.155, -0.03, -0.42, 0, 0, 8);
  m.ellipsoid(0.065, 0.075, 0.07, body, 0, 0.205, 0.05, -0.6, 0, 0, 7);
  for (const k of [-1, 0, 1]) m.box(0.035, 0.012, 0.13, wing, k * 0.022, 0.1, -0.19, -0.5, k * 0.18, 0);
  // folded wings, their tips crossing over the tail
  m.sym(s => {
    m.ellipsoid(0.026, 0.065, 0.14, wing, s * 0.064, 0.165, -0.05, -0.4, 0, s * 0.1, lite ? 5 : 6);
    m.box(0.02, 0.012, 0.1, wing, s * 0.03, 0.115, -0.17, -0.45, -s * 0.15, 0);
  });
  // head held up, a thick beak pointing a little down
  const hy = 0.275, hz = 0.095;
  m.sphere(0.056, body, 0, hy, hz, 0.95, 1, 1.12, 0, 0, 0, lite ? 6 : 8);
  m.cone(0.024, 0.08, beak, 0, hy - 0.012, hz + 0.088, 98 * D, 0, 0, 6);
  if (!lite) m.box(0.014, 0.01, 0.05, 0x6a6c74, 0, hy + 0.006, hz + 0.075, 8 * D, 0, 0); // ridge along the top
  // big pale eyes with dark pupils, so it reads as watching from across the green
  m.sym(s => {
    ball(m, 0.017, 0xf4f1e8, s * 0.04, hy + 0.012, hz + 0.03, 0.6, 1, 1);
    ball(m, 0.011, 0x111114, s * 0.047, hy + 0.013, hz + 0.036, 0.6, 1, 1);
    if (!lite) ball(m, 0.004, 0xffffff, s * 0.05, hy + 0.019, hz + 0.042);
  });
}

def('bird_crow', {
  name: '乌鸦',
  cat: 'animal',
  sfx: 'coo',
  fill: 0.4,
  build(m) {
    m.push(0, 0, 0.005, 0, 0, 0, 0.85);
    crow(m);
    m.pop();
  },
});

// ================================================================================================
// 枫树 — autumn maples for the backdrop: a dark trunk, a clumpy crown, leaves fallen round the foot
// ================================================================================================
/** a tapered limb from a to b */
function limb(m, a, b, ra, rb, col, seg = 6) {
  rod(m, a, b, rb, col, seg, ra);
}
/** leaves on the ground: a ragged patch of fallen leaves, and loose ones further out */
function fallenLeaves(m, R, cols, loose) {
  const n = 12, pts = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2, r = R * m.rng.range(0.7, 1.05);
    pts.push([Math.cos(a) * r, Math.sin(a) * r]);
  }
  const t = [];
  for (let i = 0; i < n; i++) {
    const p = pts[i], q = pts[(i + 1) % n];
    t.push([0, 0.004, 0], [q[0], 0.004, q[1]], [p[0], 0.004, p[1]]);
  }
  tris(m, t, perFace(() => shade(m.rng.pick(cols), 0.9 + m.rng.r() * 0.15)));
  for (let i = 0; i < loose; i++) {
    const a = m.rng.angle(), r = R * m.rng.range(0.9, 1.5);
    m.plane(0.16, 0.16, m.rng.pick(cols), Math.cos(a) * r, 0.01, Math.sin(a) * r, -90 * D, m.rng.range(-0.3, 0.3), m.rng.angle());
  }
}
/** the crown: clumps [x, y, z, r] of faceted leaves, each mostly one colour from `cols` */
function crown(m, clumps, cols, mixIn) {
  for (const [x, y, z, r] of clumps) {
    const base = m.rng.weighted(cols);
    m.geo(ICO1, foliage(m, base, mixIn, 0.14), x, y, z, m.rng.angle(), m.rng.angle(), m.rng.angle(), r, r * 0.86, r);
  }
}

def('tree_maple_autumn', {
  name: '红枫',
  cat: 'plant',
  sfx: 'wood',
  fill: 0.3,
  build(m) {
    const bark = 0x43352d;
    fallenLeaves(m, 1.15, [RED_L, ORANGE_L, AMBER_L, BROWN_L], 12);
    m.cyl(0.17, 0.27, 0.3, bark, 0, 0.15, 0, 0, 0, 0, 7);
    limb(m, [0, 0.2, 0], [0.05, 1.75, 0.02], 0.17, 0.13, bark, 7);
    const fork = [0.05, 1.7, 0.02];
    for (const e of [[-0.75, 2.75, 0.3], [0.8, 2.7, -0.25], [0.15, 3.0, 0.75], [-0.1, 3.1, -0.7], [0.1, 3.5, 0.05]]) limb(m, fork, e, 0.11, 0.045, bark, 5);
    crown(m, [
      [0, 3.65, 0, 0.95],
      [1.05, 3.05, 0.2, 0.78], [-1.0, 3.1, -0.15, 0.8], [0.3, 3.0, 1.0, 0.8], [-0.4, 3.05, 0.95, 0.72], [0.35, 3.1, -1.0, 0.78], [-0.55, 3.25, -0.85, 0.7],
      [0.7, 2.45, 0.55, 0.62], [-0.75, 2.45, 0.45, 0.6], [0.1, 2.35, -0.7, 0.6], [0.0, 2.55, 0.0, 0.8],
    ], [[RED_L, 3], [ORANGE_L, 4], [AMBER_L, 2], [0xb8302a, 1]], [YELLOW_L, RED_L, ORANGE_L]);
  },
});

def('tree_maple_autumn2', {
  name: '黄枫',
  cat: 'plant',
  sfx: 'wood',
  fill: 0.3,
  build(m) {
    const bark = 0x564840, Y = [0xf2b82c, 0xf6c83a, 0xe89c24];
    fallenLeaves(m, 0.95, [...Y, AMBER_L], 10);
    m.cyl(0.15, 0.24, 0.28, bark, 0, 0.14, 0, 0, 0, 0, 7);
    limb(m, [0, 0.2, 0], [-0.04, 2.0, 0.03], 0.15, 0.11, bark, 7);
    const fork = [-0.04, 1.95, 0.03];
    for (const e of [[-0.5, 3.2, 0.2], [0.5, 3.3, -0.2], [0.05, 3.6, 0.5], [0.0, 4.2, -0.1]]) limb(m, fork, e, 0.09, 0.04, bark, 5);
    crown(m, [
      [0, 4.4, 0, 0.68],
      [0.35, 3.85, 0.25, 0.74], [-0.4, 3.9, -0.1, 0.74], [0.05, 3.8, -0.45, 0.7],
      [0.66, 3.2, 0.1, 0.8], [-0.66, 3.25, 0.2, 0.78], [0.15, 3.15, 0.7, 0.78], [-0.2, 3.2, -0.68, 0.76], [0.0, 3.3, 0.0, 0.9],
      [0.48, 2.55, 0.38, 0.66], [-0.48, 2.55, -0.33, 0.66], [-0.25, 2.5, 0.48, 0.62], [0.33, 2.5, -0.48, 0.62],
    ], [[Y[0], 5], [Y[1], 4], [Y[2], 3], [ORANGE_L, 1], [0xc9b23a, 1]], [ORANGE_L, 0xf7d65a, 0xd8a52a]);
  },
});

// ================================================================================================
// 落叶堆 — a low mound of raked-up leaves (sits on a hill of the green)
// ================================================================================================
def('leaf_pile', {
  name: '落叶堆',
  cat: 'nature',
  sfx: 'paper',
  fill: 0.6,
  build(m) {
    const cols = [[ORANGE_L, 4], [RED_L, 3], [BROWN_L, 3], [AMBER_L, 2], [YELLOW_L, 1]];
    const leafy = () => perFace((x, y, z, nx, ny) => shade(m.rng.weighted(cols), (0.9 + m.rng.r() * 0.16) * (0.9 + 0.12 * ny)));
    m.dome(1, leafy(), 0, 0, 0, 0.56, 0.2, 0.5, 0, 0, 0, 12);
    for (const [x, z, r, h] of [[0.28, 0.12, 0.26, 0.22], [-0.25, -0.1, 0.28, 0.2], [0.05, -0.25, 0.22, 0.16], [-0.12, 0.22, 0.22, 0.17]]) {
      m.dome(r, leafy(), x, 0.0, z, 1, h / r, 1, 0, m.rng.angle(), 0, 9);
    }
    // single leaves lying on the heap and scattered round its foot
    const height = (x, z) => 0.2 * Math.sqrt(Math.max(0, 1 - (x / 0.56) ** 2 - (z / 0.5) ** 2));
    for (let i = 0; i < 34; i++) {
      const a = m.rng.angle(), r = i < 24 ? m.rng.range(0, 0.5) : m.rng.range(0.55, 0.68), x = Math.cos(a) * r, z = Math.sin(a) * r * 0.9;
      const y = Math.max(height(x, z), i < 24 ? 0.06 : 0) + (i < 24 ? 0.012 : 0.02), tilt = i < 24 ? 0.4 : 0.2;
      m.plane(0.085, 0.085, m.rng.weighted(cols), x, y, z, -90 * D + m.rng.range(-tilt, tilt), m.rng.range(-tilt, tilt), m.rng.angle());
    }
  },
});

// ================================================================================================
// 苹果箱 — a slatted wooden crate heaped with red apples
// ================================================================================================
def('crate_apples', {
  name: '苹果箱',
  cat: 'food',
  sfx: 'wood',
  fill: 0.7,
  shape: 'box',
  build(m) {
    const W = 0.5, H = 0.25, Dp = 0.35, wood = 0xc69c64, end = 0xa77c48;
    m.box(W - 0.03, H - 0.02, Dp - 0.03, 0x4a3426, 0, (H - 0.02) / 2, 0);
    m.jitter(0.06);
    for (const z of [-1, 1]) for (const y of [0.04, 0.125, 0.21]) m.box(W, 0.066, 0.016, wood, 0, y, z * (Dp / 2 - 0.008));
    m.sym(s => {
      m.box(0.018, 0.09, Dp, end, s * (W / 2 - 0.009), 0.045, 0);
      m.box(0.018, 0.08, Dp, end, s * (W / 2 - 0.009), H - 0.04, 0);
    });
    m.jitter(0);
    m.sym(s => m.box(0.006, 0.022, 0.12, 0x2e2018, s * (W / 2 + 0.001), H - 0.04, 0));
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) m.box(0.03, H, 0.03, end, sx * (W / 2 - 0.02), H / 2, sz * (Dp / 2 - 0.02));
    // apples: a layer level with the rim, a few more heaped on top
    const reds = [0xd23a2c, 0xc02c28, 0xe04a30, 0xb8282a, 0xd8442e];
    const R = 0.046;
    for (let i = 0; i < 5; i++) {
      for (let j = 0; j < 3; j++) {
        const x = -0.19 + i * 0.095 + m.rng.range(-0.01, 0.01), z = -0.1 + j * 0.1 + m.rng.range(-0.01, 0.01);
        ball(m, R, m.rng.pick(reds), x, H - 0.015 + m.rng.range(-0.008, 0.008), z, 1, 0.92, 1);
      }
    }
    for (const [x, z] of [[-0.14, -0.04], [-0.05, 0.05], [0.05, -0.05], [0.14, 0.04], [0.0, 0.0]]) {
      ball(m, R, m.rng.pick(reds), x, H + 0.055, z, 1, 0.92, 1);
    }
    for (const [x, y, z] of [[-0.14, H + 0.1, -0.04], [0.05, H + 0.1, -0.05], [0.0, H + 0.1, 0.0], [-0.1, H + 0.03, 0.1], [0.19, H + 0.03, -0.1]]) {
      rod(m, [x, y - 0.005, z], [x + 0.008, y + 0.018, z], 0.004, 0x5a3a22, 3);
    }
    m.plane(0.05, 0.028, 0x5e8a2c, 0.022, H + 0.112, -0.005, -60 * D, 0, 0.5);
  },
});

// ================================================================================================
// 木栅栏 — one 2 m section of split-rail fence: a rough post at x = −1 only (so sections chain), three
// split rails running through it to where the next post stands
// ================================================================================================
def('fence_split_rail', {
  name: '木栅栏',
  cat: 'street',
  sfx: 'wood',
  fill: 0.25,
  shape: 'box',
  build(m) {
    const post = 0x76644f, rails = [0x9a8670, 0x8c7a64, 0xa59078];
    const weathered = col => perFace((x, y, z, nx, ny) => shade(col, (0.9 + m.rng.r() * 0.14) * (ny > 0.5 ? 1.12 : 1)));
    m.cyl(0.08, 0.09, 0.96, weathered(post), -1.0, 0.48, 0, 0, 0.4, 0, 5);
    m.cone(0.08, 0.08, weathered(post), -1.0, 1.0, 0, 0, 0.4, 0, 5);
    // each rail split from a log: a rough three- or four-sided bar, its end through the post
    [0.27, 0.56, 0.84].forEach((y, i) => {
      const r = 0.062 + m.rng.range(-0.008, 0.008), sides = i === 1 ? 4 : 3;
      m.cyl(r, r * 1.1, 2.08, weathered(rails[i]), -0.04, y + m.rng.range(-0.02, 0.02), m.rng.range(-0.01, 0.01),
        m.rng.angle(), m.rng.range(-0.015, 0.015), 90 * D + m.rng.range(-0.015, 0.015), sides);
    });
  },
});

// ================================================================================================
// 木围边 — a raised-bed timber edge: two stacked boards, 2 m long, held by two stakes behind (−Z)
// ================================================================================================
def('timber_edge', {
  name: '木围边',
  cat: 'street',
  sfx: 'wood',
  fill: 0.6,
  shape: 'box',
  build(m) {
    const wood = 0xa2723f, grain = (k) => (x, y, z, nx, ny) => shade(wood, k * (ny > 0.5 ? 1.12 : Math.abs(nx) > 0.5 ? 1.18 : 1));
    m.box(2.0, 0.088, 0.08, grain(1.0), 0, 0.044, 0.02);
    m.box(2.0, 0.088, 0.08, grain(0.93), 0, 0.136, 0.02, 0, 0, 0.002);
    m.sym(s => {
      m.box(0.05, 0.18, 0.04, shade(wood, 0.82), s * 0.72, 0.09, -0.04);
      for (const y of [0.05, 0.14]) m.box(0.014, 0.014, 0.006, 0x3a3a3c, s * 0.72, y, 0.062);
    });
  },
});

// ================================================================================================
// 洒水壶 — a galvanised watering can (side view faces +Z, the spout points +X)
// ================================================================================================
def('watering_can', {
  name: '洒水壶',
  cat: 'daily',
  sfx: 'metal',
  fill: 0.4,
  build(m) {
    const zinc = 0xaab3ba, seam = 0x8b949b, dark = 0x3a3f44;
    m.push(-0.048, 0, 0, 0, 0, 0, 0.82);
    const bx = -0.06;
    m.cyl(0.1, 0.105, 0.22, (x, y, z, nx, ny) => shade(zinc, ny > 0.5 ? 1.1 : 1), bx, 0.112, 0, 0, 0, 0, 12);
    for (const y of [0.012, 0.215]) m.cyl(0.107, 0.107, 0.014, seam, bx, y, 0, 0, 0, 0, 12);
    // the filler on top, half of it covered
    m.cyl(0.056, 0.056, 0.03, zinc, bx - 0.03, 0.232, 0, 0, 0, 0, 10);
    m.cyl(0.044, 0.044, 0.006, dark, bx - 0.03, 0.247, 0, 0, 0, 0, 10);
    // handles: one arching over the top, one down the back
    m.tube([[bx - 0.095, 0.2, 0], [bx - 0.08, 0.3, 0], [bx, 0.335, 0], [bx + 0.075, 0.3, 0], [bx + 0.09, 0.215, 0]], 0.011, seam, 5, false, 14);
    m.tube([[bx - 0.098, 0.05, 0], [bx - 0.15, 0.1, 0], [bx - 0.1, 0.185, 0]], 0.011, seam, 5, false, 10);
    // the long spout and its rose
    const a = [bx + 0.08, 0.05, 0], b = [0.27, 0.27, 0];
    rod(m, a, b, 0.014, zinc, 6, 0.024);
    rod(m, [bx + 0.09, 0.19, 0], [0.12, 0.13, 0], 0.006, seam, 4);
    const [, , , , rx, ry, rz] = seg3(a, b), dir = [b[0] - a[0], b[1] - a[1], 0], k = Math.hypot(dir[0], dir[1]);
    m.cyl(0.042, 0.018, 0.05, zinc, b[0] + (dir[0] / k) * 0.02, b[1] + (dir[1] / k) * 0.02, 0, rx, ry, rz, 10);
    m.cyl(0.04, 0.04, 0.006, seam, b[0] + (dir[0] / k) * 0.046, b[1] + (dir[1] / k) * 0.046, 0, rx, ry, rz, 10);
    m.pop();
  },
});
