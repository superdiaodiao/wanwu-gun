// 雪地 — the fourth course, a bright winter afternoon in the neighbourhood after fresh snow: snowmen
// whose hats pop off, soft snowbanks, snowy firs, a sled with a toy penguin riding it, a little
// snowplough, the finale's snow fort, and the scenery round the frozen pond (a snowed-in garden shed,
// an iron street lamp, a shovel left in the snow, a pair of skates, drifts). White, ice-blue, warm wood
// and bright accents; nothing festive. Metres, base on y = 0, centred on x = z = 0, front faces +Z.
//
// Gameplay layout (the course code relies on these numbers):
//   snowman, snowman_small  the hat is a model of its own (spec.pop.id), so a hard hit can knock it
//                   off: spec.pop.at is where its base (its own y = 0, centred) sits in the snowman's
//                   model space. In the snowman's group from model(id, k), put it at
//                   ((at.x - s.center.x)·k, at.y·k, (at.z - s.center.z)·k) with place(), name it 'pop'.
//   snow_fort       the windmill's footprint exactly: x -1.2…+1.2, z -0.7…+0.7, solid down to y = 0
//                   either side of a tunnel along z at x -0.45…+0.45, 0.6 m clear (straight jambs to
//                   0.6, a low arch to 0.74), no floor; nothing outside the footprint.
//   sled, snowplough  drive towards +Z (the bike maker's yaw).
import * as THREE from 'three';
import { def } from '../../catalog/registry.js';
import { D, shade, mix } from '../../core/modeler.js';

// ---- local helpers -----------------------------------------------------------------------------
const UP = new THREE.Vector3(0, 1, 0);
const _d = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _mx = new THREE.Matrix4();
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3();
const ICO = new THREE.IcosahedronGeometry(1, 0);
const clamp01 = x => (x < 0 ? 0 : x > 1 ? 1 : x);

/** Euler XYZ that turns local +Y towards direction dir [x, y, z]. */
function yTo(dir) {
  _d.set(dir[0], dir[1], dir[2]).normalize();
  _q.setFromUnitVectors(UP, _d);
  _e.setFromQuaternion(_q, 'XYZ');
  return [_e.x, _e.y, _e.z];
}
/** round rod from a (radius rb) to b (radius r) */
function rod(m, a, b, r, col, seg = 6, rb = r) {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const [rx, ry, rz] = yTo([b[0] - a[0], b[1] - a[1], b[2] - a[2]]);
  m.cyl(r, rb, len, col, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2, rx, ry, rz, seg);
}
/** cheap 20-triangle ball */
function ball(m, r, col, x, y, z, sx = 1, sy = 1, sz = 1) {
  m.geo(ICO, col, x, y, z, 0, 0, 0, r * sx, r * sy, r * sz);
}
/** push a frame at p whose local x, y, z axes point along xa, ya, za (at right angles) */
function frame(m, p, xa, ya, za) {
  _mx.makeBasis(_a.set(...xa).normalize(), _b.set(...ya).normalize(), _c.set(...za).normalize());
  _e.setFromRotationMatrix(_mx, 'XYZ');
  return m.push(p[0], p[1], p[2], _e.x, _e.y, _e.z);
}
/** loose triangles [[x,y,z] × 3, …] as one part, each turned to face away from the point `inside` */
function tris(m, pts, col, inside) {
  const pos = new Float32Array(pts.length * 3);
  for (let i = 0; i + 2 < pts.length; i += 3) {
    const a = pts[i];
    let b = pts[i + 1], c = pts[i + 2];
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const ox = (a[0] + b[0] + c[0]) / 3 - inside[0], oy = (a[1] + b[1] + c[1]) / 3 - inside[1], oz = (a[2] + b[2] + c[2]) / 3 - inside[2];
    if (nx * ox + ny * oy + nz * oz < 0) [b, c] = [c, b];
    pos.set(a, i * 3); pos.set(b, i * 3 + 3); pos.set(c, i * 3 + 6);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.computeVertexNormals();
  m.geo(g, col);
}
/** per-face colour: fn is evaluated once per triangle (at its first vertex) so facets stay crisp */
function perFace(fn) {
  let i = 0, c = 0;
  return (x, y, z, nx, ny, nz) => { if (i++ % 3 === 0) c = fn(x, y, z, nx, ny, nz); return c; };
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

// ---- palette -----------------------------------------------------------------------------------
const SNOW = 0xf7fafd, SNOW_SH = 0xc6d6ea, ICE = 0xbfe6fa, COAL = 0x2b2a30, CARROT = 0xf5841f, TWIG = 0x6e4a30,
  BLUE = 0x2f74d6, BLUE_LT = 0x6eaef2, YELLOW = 0xf7c51e, ORANGE = 0xff8a2a, WOOD = 0xc8925e, WOOD_DK = 0x8f5f3a,
  STEEL = 0x9aa3ad, DARK = 0x2c2f36, IRON = 0x24262c, LIT = 0xffc867, WHITE = 0xf7f4ee;
/** fresh snow: white where it faces the sky, a cool blue where it turns away from it */
const snow = (top = SNOW, side = SNOW_SH) => (x, y, z, nx, ny) => mix(side, top, clamp01(0.42 + 0.62 * ny));

// a soft lump of snow: a flat-bottomed icosphere, its top gently dented (smooth, unlike a rock)
const LUMP = (() => {
  const g = new THREE.IcosahedronGeometry(1, 1);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const k = 1 + 0.07 * Math.sin(x * 4.1 + z * 2.3 + 1) * Math.cos(z * 3.7 - x * 1.9);
    p.setXYZ(i, x * k, y > 0 ? y * k : y * 0.04, z * k);
  }
  g.computeVertexNormals();
  return g;
})();
/** a lump of snow rx × ry × rz with its flat base on y */
function lump(m, rx, ry, rz, col, x, y, z, ryaw = 0) {
  m.geo(LUMP, col, x, y + ry * 0.04, z, 0, ryaw, 0, rx, ry, rz);
}

// ================================================================================================
// 雪人 — snowmen: three snowballs, coal eyes and buttons, a carrot nose, stick arms and a knitted
// scarf; the hat is a model of its own (it pops off when the snowman is hit hard)
// ================================================================================================

/** where each ball of a snowman sits: radii r1 r2 r3, the bottom one squashed by sq; each ball sinks
 *  into the one below it a little */
function stack(r1, r2, r3, sq = 0.92) {
  const y1 = r1 * sq, top1 = 2 * r1 * sq;
  const y2 = top1 - r2 * 0.2 + r2 * 0.96, top2 = y2 + r2 * 0.96;
  const y3 = top2 - r3 * 0.16 + r3;
  return { r1, r2, r3, sq, y1, y2, y3, neck: top2 - r2 * 0.08 };
}
const BIG = stack(0.26, 0.18, 0.135);
const SMALL = stack(0.17, 0.122, 0.106);
const TOPHAT = { brim: 0.15, crown: 0.094, h: 0.15 }; // the top hat rests where the head is 0.088 across
const BEANIE = { cuff: 0.3 }; // the beanie's cuff sits 0.3 of the head's radius above its middle
BIG.hat = [0, BIG.y3 + Math.sqrt(BIG.r3 ** 2 - 0.088 ** 2) - 0.004, 0];
SMALL.hat = [0, SMALL.y3 + BEANIE.cuff * SMALL.r3, 0];

/** a striped knitted ring round the neck: n pieces of torus in turn of the colours */
function scarfRing(m, y, R, t, cols, n = 10, squash = 0.8) {
  m.push(0, y, 0, 0, 0, 0, [1, squash, 1]);
  for (let i = 0; i < n; i++) {
    m.push(0, 0, 0, 0, (i / n) * Math.PI * 2, 0);
    m.torus(R, t, cols[i % cols.length], 0, 0, 0, 90 * D, 0, 0, (Math.PI * 2) / n + 0.01, 5, 2);
    m.pop();
  }
  m.pop();
}
/** a scarf's tail hanging down over a ball (centre c, radius r) from polar angle th0 to th1 (from
 *  straight up) at azimuth az (from +z towards +x): striped blocks w wide, with a fringe */
function scarfTail(m, c, r, th0, th1, az, w, cols, n = 4, fringe = YELLOW) {
  const sa = Math.sin(az), ca = Math.cos(az);
  const at = th => [c[0] + r * Math.sin(th) * sa, c[1] + r * Math.cos(th), c[2] + r * Math.sin(th) * ca];
  const len = (r * (th1 - th0)) / n;
  for (let i = 0; i <= n; i++) {
    const th = th0 + ((i + 0.5) / n) * (th1 - th0);
    const nrm = [Math.sin(th) * sa, Math.cos(th), Math.sin(th) * ca];
    const down = [Math.cos(th) * sa, -Math.sin(th), Math.cos(th) * ca]; // along the surface, downhill
    const side = [ca, 0, -sa];
    if (i === n) {
      // the fringe: little tassels below the last block
      frame(m, at(th1 + len * 0.3 / r), side, [-down[0], -down[1], -down[2]], nrm);
      for (let k = 0; k < 4; k++) m.box(w / 6, len * 0.5, 0.012, fringe, (k - 1.5) * (w / 4), 0, 0);
      m.pop();
      break;
    }
    frame(m, at(th), side, [-down[0], -down[1], -down[2]], nrm);
    m.box(w, len + 0.004, 0.024, cols[i % cols.length], 0, 0, 0);
    m.pop();
  }
}
/** coal eyes, a carrot nose and a coal smile on a head at (0, y, 0) of radius r */
function face(m, y, r, k = 1) {
  const on = (x, dy) => Math.sqrt(Math.max(0, r * r - x * x - dy * dy));
  m.sym(s => ball(m, 0.021 * k, COAL, s * 0.046 * k, y + 0.034 * k, on(0.046 * k, 0.034 * k) - 0.004, 1, 1.2, 0.7));
  // carrot: a ridged orange cone pointing out of the face, drooping a touch
  const nz = on(0, 0);
  m.cone(0.029 * k, 0.15 * k, CARROT, 0, y + 0.002, nz + 0.065 * k, 82 * D, 0, 0, 7);
  m.cyl(0.03 * k, 0.03 * k, 0.012 * k, shade(CARROT, 0.82), 0, y + 0.004, nz - 0.004, 82 * D, 0, 0, 7);
  // smile: five coal dots, the middle one lowest
  for (let i = -2; i <= 2; i++) {
    const a = i * 22 * D, x = Math.sin(a) * 0.055 * k, dy = -0.032 * k - 0.026 * k * Math.cos(a);
    ball(m, 0.012 * k, COAL, x, y + dy, on(x, dy) - 0.002);
  }
}
/** a stick arm from the shoulder at a to the hand at b, with two twig fingers */
function stickArm(m, a, b, r) {
  rod(m, a, b, r * 0.7, TWIG, 5, r);
  const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const L = Math.hypot(d[0], d[1], d[2]);
  for (const [up, out] of [[0.55, 0.28], [-0.25, 0.3]]) {
    const e = [b[0] + d[0] / L * out * L * 0.3, b[1] + up * L * 0.18 + d[1] / L * 0.04, b[2] + d[2] / L * out * L * 0.3];
    rod(m, b, e, r * 0.45, TWIG, 4, r * 0.65);
  }
  // a little twig off the middle of the arm
  const mid = [a[0] + d[0] * 0.55, a[1] + d[1] * 0.55, a[2] + d[2] * 0.55];
  rod(m, mid, [mid[0] + d[0] * 0.12, mid[1] + L * 0.16, mid[2] + d[2] * 0.12 + 0.02], r * 0.4, TWIG, 4, r * 0.6);
}
/** the three snowballs, a settled ring of snow at the foot, buttons */
function snowBody(m, P, buttons = 3) {
  const { r1, r2, r3, sq, y1, y2, y3 } = P;
  m.dome(r1 * 1.18, snow(0xeef4fa), 0, 0, 0, 1, 0.24, 1, 0, 0, 0, 12);
  m.sphere(r1, snow(), 0, y1, 0, 1, sq, 1, 0, 0, 0, 12);
  m.sphere(r2, snow(), 0, y2, 0, 1, 0.96, 1, 0, 0.4, 0, 11);
  m.sphere(r3, snow(), 0, y3, 0, 1, 1, 1, 0, 0.2, 0, 11);
  for (let i = 0; i < buttons; i++) {
    const t = 0.42 - i * (0.66 / Math.max(1, buttons - 1)), y = y2 + t * r2 * 0.96;
    ball(m, r2 * 0.115, COAL, 0, y, Math.sqrt(r2 * r2 - (t * r2) ** 2) - 0.004, 1, 1, 0.75);
  }
}

def('snowman', {
  name: '雪人',
  cat: 'toy',
  sfx: 'soft',
  fill: 0.5,
  pop: { id: 'snowman_hat', at: BIG.hat },
  build(m) {
    const P = BIG;
    snowBody(m, P, 3);
    face(m, P.y3, P.r3);
    // knitted scarf, blue and yellow stripes, one tail hanging down the front
    scarfRing(m, P.neck, 0.112, 0.046, [BLUE, YELLOW], 12);
    scarfTail(m, [0, P.y2, 0], P.r2 + 0.018, 28 * D, 92 * D, 24 * D, 0.075, [YELLOW, BLUE], 4, YELLOW);
    // stick arms, one raised a little more than the other
    stickArm(m, [0.15, P.y2 + 0.04, 0], [0.46, P.y2 + 0.2, 0.06], 0.019);
    stickArm(m, [-0.15, P.y2 + 0.03, 0], [-0.45, P.y2 + 0.13, 0.04], 0.019);
  },
});

def('snowman_hat', {
  name: '雪人的礼帽',
  cat: 'daily',
  sfx: 'soft',
  fill: 0.6,
  build(m) {
    // a black top hat with a blue band, flaring a touch at the crown
    const { brim, crown, h } = TOPHAT, BLACK = 0x2a2a33;
    m.cyl(brim, brim, 0.018, BLACK, 0, 0.009, 0, 0, 0, 0, 14);
    m.cyl(crown * 1.07, crown, h, BLACK, 0, 0.015 + h / 2, 0, 0, 0, 0, 12);
    m.cyl(crown * 1.012, crown * 1.012, 0.034, BLUE, 0, 0.034, 0, 0, 0, 0, 12);
  },
});

def('snowman_small', {
  name: '小雪人',
  cat: 'toy',
  sfx: 'soft',
  fill: 0.5,
  pop: { id: 'snowman_small_hat', at: SMALL.hat },
  build(m) {
    const P = SMALL;
    snowBody(m, P, 2);
    face(m, P.y3, P.r3, 0.8);
    // a short yellow scarf with blue stripes
    scarfRing(m, P.neck, 0.078, 0.034, [YELLOW, BLUE], 10);
    scarfTail(m, [0, P.y2, 0], P.r2 + 0.014, 30 * D, 88 * D, -28 * D, 0.058, [BLUE, YELLOW], 3, BLUE);
    // waving: one arm up high, the other down by its side
    stickArm(m, [0.1, P.y2 + 0.03, 0], [0.3, P.y2 + 0.26, 0.04], 0.015);
    stickArm(m, [-0.1, P.y2 + 0.0, 0], [-0.3, P.y2 - 0.06, 0.05], 0.015);
  },
});

def('snowman_small_hat', {
  name: '雪人的毛线帽',
  cat: 'daily',
  sfx: 'soft',
  fill: 0.6,
  build(m) {
    // a blue bobble beanie: a ribbed light-blue cuff (its 16 facets alternate light and dark), a
    // knitted crown rising a little to a point, a fat yellow bobble
    const r3 = SMALL.r3, ring = r3 * Math.sqrt(1 - BEANIE.cuff ** 2);
    const cuffR = ring + 0.012, top = r3 * (1 - BEANIE.cuff) + 0.03;
    let f = 0;
    m.cyl(cuffR, cuffR * 1.02, 0.04, (x, y, z, nx, ny) => (Math.abs(ny) > 0.5 ? BLUE_LT : (f++ % 6 < 3 ? BLUE_LT : shade(BLUE_LT, 0.84))), 0, 0.02, 0, 0, 0, 0, 16);
    m.lathe([[ring + 0.004, 0.03], [ring, 0.06], [ring * 0.86, 0.09], [ring * 0.55, top - 0.008], [0, top]], BLUE, 0, 0, 0, 0, 0, 0, 12);
    m.sphere(0.036, YELLOW, 0, top + 0.026, 0, 1, 0.92, 1, 0, 0, 0, 7);
  },
});

// ================================================================================================
// 雪堆 — snowbanks: long, low, soft and lumpy; the ball sinks into one and loses most of its speed
// ================================================================================================
/**
 * A long soft drift along x, like a pillow: len long, w wide, h high, its ends rounded, its back
 * rising and falling in gentle humps (`bumps` of them). One smooth sheet: nu slices along x, nv
 * round each.
 */
function drift(m, len, w, h, bumps, seed, nu = 18, nv = 9) {
  const P = [], I = [];
  for (let i = 0; i <= nu; i++) {
    const t = i / nu, x = -len / 2 + len * t, e = Math.abs(2 * t - 1);
    const wide = Math.pow(1 - e ** 3, 1 / 3) * (1 + 0.05 * Math.sin(t * 9 + seed * 2)); // flat sides, round ends
    const high = Math.pow(1 - e ** 2.4, 1 / 2.4) * (1 + 0.1 * Math.cos(t * Math.PI * 2 * bumps + seed));
    for (let j = 0; j <= nv; j++) {
      const th = (j / nv) * Math.PI; // from the +z foot, over the top, to the -z foot
      const lean = 0.03 * Math.sin(t * 5 + seed) * Math.sin(th); // the crest wanders a little
      P.push(x, h * high * Math.pow(Math.sin(th), 0.7), (w / 2) * wide * Math.cos(th) + lean * w);
    }
  }
  for (let i = 0; i < nu; i++) {
    for (let j = 0; j < nv; j++) {
      const a = i * (nv + 1) + j, b = a + nv + 1;
      I.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setIndex(I);
  g.computeVertexNormals();
  m.geo(g, snow());
}
function snowbank(m, len, seed) {
  drift(m, len, 0.6, 0.35 / 1.1, len > 1.5 ? 2 : 1, seed, len > 1.5 ? 20 : 12, 9);
}

def('snowbank', {
  name: '雪堆',
  cat: 'nature',
  sfx: 'soft',
  fill: 0.6,
  build(m) { snowbank(m, 2.0, 0.4); },
});

def('snowbank_short', {
  name: '小雪堆',
  cat: 'nature',
  sfx: 'soft',
  fill: 0.6,
  build(m) { snowbank(m, 1.0, 1.7); },
});

// ================================================================================================
// 雪中冷杉 — snowy firs: a dark tiered cone, snow lying on every tier (no decorations)
// ================================================================================================
const FIR = 0x1f5b3e, FIR_LT = 0x2d7451, FIR_DK = 0x163f2c, BARK = 0x6a4630;

/** one tier: a cone of branches with ragged, drooping tips (n rim points, tips and notches in turn),
 *  its dark underside, and the snow on its top: the same cone shrunk towards its apex, just above it */
function firTier(m, y0, r, h, n, rot, snowK) {
  const apex = [0, y0 + h, 0], rim = [];
  for (let i = 0; i < n; i++) {
    const a = rot + (i / n) * Math.PI * 2, tip = i % 2 === 0;
    const rr = r * (tip ? 1 : 0.8);
    rim.push([Math.cos(a) * rr, y0 - (tip ? 0.1 * r : 0), Math.sin(a) * rr]);
  }
  const top = [], under = [], cap = [];
  const low = [0, y0 + h * 0.18, 0];
  for (let i = 0; i < n; i++) {
    const a = rim[i], b = rim[(i + 1) % n];
    top.push(apex, a, b);
    under.push(low, a, b);
  }
  const green = perFace((x, y, z, nx, ny) => shade(mix(FIR, FIR_LT, 0.5 * (Math.sin(x * 9 + z * 7) * 0.5 + 0.5)), 0.95 + 0.1 * ny));
  tris(m, top, green, [0, y0 - h, 0]);
  tris(m, under, FIR_DK, [0, y0 + h * 2, 0]);
  // the snow: rim points pulled in towards the apex (further on the branch tips), lifted a little
  const lift = 0.035 + r * 0.02;
  const sp = rim.map((p, i) => {
    const k = snowK * (i % 2 === 0 ? 1 : 0.86);
    return [apex[0] + (p[0] - apex[0]) * k, apex[1] + (p[1] - apex[1]) * k + lift, apex[2] + (p[2] - apex[2]) * k];
  });
  for (let i = 0; i < n; i++) cap.push([apex[0], apex[1] + lift, apex[2]], sp[i], sp[(i + 1) % n]);
  tris(m, cap, snow(), [0, y0 - h, 0]);
  // and a thin edge under the snow's rim, so it reads as a layer from the side
  const edge = [];
  for (let i = 0; i < n; i++) {
    const a = sp[i], b = sp[(i + 1) % n];
    edge.push(a, b, [b[0], b[1] - 0.05, b[2]], a, [b[0], b[1] - 0.05, b[2]], [a[0], a[1] - 0.05, a[2]]);
  }
  tris(m, edge, SNOW_SH, [0, apex[1], 0]);
}

function fir(m, H, tiers) {
  const k = H / 3.5;
  m.cyl(0.11 * k, 0.15 * k, 0.6 * k, BARK, 0, 0.3 * k, 0, 0, 0, 0, 7);
  lump(m, 0.42 * k, 0.12 * k, 0.4 * k, snow(), 0, 0, 0, 0.5);
  tiers.forEach(([y0, r, h], i) => firTier(m, y0 * k, r * k, h * k, r > 0.6 ? 18 : 14, i * 0.7, 0.62 + 0.04 * i));
  // a tuft of snow on the very top
  ball(m, 0.07 * k, SNOW, 0, H - 0.02 * k, 0, 1, 0.8, 1);
}

def('tree_fir_snow', {
  name: '雪中冷杉',
  cat: 'plant',
  sfx: 'wood',
  fill: 0.3,
  build(m) {
    fir(m, 3.5, [[0.5, 1.2, 1.15], [1.12, 1.0, 1.0], [1.72, 0.8, 0.9], [2.3, 0.58, 0.8], [2.84, 0.36, 0.66]]);
  },
});

def('tree_fir_snow_small', {
  name: '小冷杉',
  cat: 'plant',
  sfx: 'wood',
  fill: 0.3,
  build(m) {
    // fewer, rounder tiers than the big one (scaled to 2 m)
    fir(m, 2.0, [[0.62, 1.3, 1.3], [1.45, 1.0, 1.1], [2.2, 0.7, 0.95], [2.86, 0.4, 0.64]]);
  },
});

// ================================================================================================
// 雪橇 — a wooden runner sled with a blue seat; a toy penguin in a hat and scarf rides it, holding
// the pull rope like reins (it coasts towards +Z)
// ================================================================================================
def('sled', {
  name: '雪橇',
  cat: 'toy',
  sfx: 'wood',
  fill: 0.35,
  build(m) {
    const RED = 0xd9483b, ROPE = 0xf3d27c, PENG = 0x272c3a, BELLY = 0xf8f6f0, BEAK = 0xffa21e;
    // red steel runners curling up and back over at the front
    m.sym(s => {
      const x = s * 0.2;
      m.tube([[x, 0.07, -0.6], [x, 0.025, -0.52], [x, 0.02, -0.25], [x, 0.02, 0.2], [x, 0.04, 0.4], [x, 0.11, 0.53], [x, 0.21, 0.565], [x, 0.275, 0.5], [x, 0.24, 0.43]],
        0.019, RED, 4, false, 15);
      // the knees from the runners up to the deck
      for (const z of [-0.42, -0.05, 0.3]) m.box(0.022, 0.12, 0.045, RED, x, 0.09, z);
    });
    // the deck: four slats on two cross pieces, and the steering bar across the front
    m.sym(s => m.box(0.5, 0.03, 0.06, WOOD_DK, 0, 0.135, s * 0.4 - 0.05));
    m.jitter(0.06);
    for (let i = 0; i < 4; i++) m.box(0.088, 0.024, 0.98, WOOD, -0.153 + i * 0.102, 0.162, -0.04);
    m.jitter(0);
    m.box(0.56, 0.035, 0.07, WOOD_DK, 0, 0.19, 0.4);
    m.sym(s => m.cyl(0.026, 0.026, 0.05, WOOD_DK, s * 0.285, 0.19, 0.4, 0, 0, 90 * D, 6));
    // the seat cushion
    m.rbox(0.38, 0.06, 0.42, 0.025, BLUE, 0, 0.202, -0.24);
    m.box(0.39, 0.012, 0.43, BLUE_LT, 0, 0.186, -0.24);

    // the rider: a toy penguin bundled up in a beanie and a scarf
    m.push(0, 0.232, -0.22, 0, 0, 0, 1.15);
    m.ellipsoid(0.105, 0.125, 0.095, PENG, 0, 0.11, 0, 0, 0, 0, 8);
    m.ellipsoid(0.078, 0.098, 0.05, BELLY, 0, 0.1, 0.052, 0, 0, 0, 7);
    m.sphere(0.078, PENG, 0, 0.27, 0.005, 1, 1, 1, 0, 0, 0, 8);
    m.ellipsoid(0.056, 0.046, 0.03, BELLY, 0, 0.262, 0.058, 0, 0, 0, 6);
    m.sym(s => ball(m, 0.012, COAL, s * 0.024, 0.278, 0.083, 1, 1.2, 0.6));
    m.cone(0.019, 0.045, BEAK, 0, 0.255, 0.1, 90 * D, 0, 0, 6);
    // feet out in front on the deck, flippers forward on the rope
    m.sym(s => ball(m, 0.032, BEAK, s * 0.046, -0.006, 0.1, 0.9, 0.35, 1.5));
    m.sym(s => m.push(s * 0.098, 0.12, 0.05, 50 * D, 0, s * 18 * D).geo(ICO, PENG, 0, 0, 0, 0, 0, 0, 0.026, 0.08, 0.03).pop());
    // scarf with a tail blowing back, and the beanie
    scarfRing(m, 0.2, 0.072, 0.024, [YELLOW, ORANGE], 6, 0.85);
    m.box(0.04, 0.012, 0.11, YELLOW, 0.05, 0.2, -0.1, 0.25, 0.3, 0);
    m.cyl(0.074, 0.074, 0.03, BLUE_LT, 0, 0.312, 0, 0, 0, 0, 10);
    m.dome(0.072, BLUE, 0, 0.322, 0, 1, 0.82, 1, 0, 0, 0, 8);
    ball(m, 0.028, YELLOW, 0, 0.388, 0);
    m.pop();
    // the pull rope: from the ends of the steering bar to the penguin's flippers
    m.sym(s => m.tube([[s * 0.29, 0.2, 0.42], [s * 0.24, 0.24, 0.25], [s * 0.18, 0.33, 0.06], [s * 0.125, 0.37, -0.15]], 0.011, ROPE, 3, false, 8));
  },
});

// ================================================================================================
// 小铲雪车 — a little yellow snowplough: a big angled orange blade, a cab, chunky tyres and a flashing
// light on the roof (it drives towards +Z)
// ================================================================================================
def('snowplough', {
  name: '小铲雪车',
  cat: 'vehicle',
  sfx: 'metal',
  fill: 0.5,
  build(m) {
    const Y = 0xf7c21e, Y_DK = 0xd9a514, TYRE = 0x2a2b30, GLASS = 0x9fd6f2, AMBER = 0xffa51e;
    m.push(0, 0, -0.06);
    // chunky tyres with a yellow hub
    const R = 0.17, W = 0.14;
    for (const z of [0.3, -0.42]) {
      m.sym(s => {
        m.cyl(R, R, W, TYRE, s * 0.335, R, z, 0, 0, 90 * D, 10);
        m.cyl(0.085, 0.085, W + 0.02, Y_DK, s * 0.335, R, z, 0, 0, 90 * D, 8);
        m.cyl(0.03, 0.03, W + 0.04, DARK, s * 0.335, R, z, 0, 0, 90 * D, 5);
      });
    }
    // chassis, lower body, mudguards
    m.box(0.5, 0.12, 1.22, DARK, 0, 0.2, -0.06);
    m.rbox(0.56, 0.24, 1.18, 0.05, Y, 0, 0.36, -0.06);
    for (const z of [0.3, -0.42]) m.sym(s => m.box(0.17, 0.035, 0.42, DARK, s * 0.335, 0.39, z));
    // the bonnet, its grille and two round headlights
    m.rbox(0.48, 0.2, 0.42, 0.06, Y, 0, 0.56, 0.31);
    m.box(0.3, 0.12, 0.02, DARK, 0, 0.42, 0.525);
    for (let i = 0; i < 2; i++) m.box(0.26, 0.015, 0.012, STEEL, 0, 0.4 + i * 0.04, 0.537);
    m.glow(1);
    m.sym(s => m.cyl(0.042, 0.042, 0.03, 0xfff3c0, s * 0.2, 0.5, 0.52, 90 * D, 0, 0, 10));
    m.glow(0);
    m.sym(s => m.cyl(0.052, 0.052, 0.02, DARK, s * 0.2, 0.5, 0.508, 90 * D, 0, 0, 8));
    // the cab: windows all round, a white roof with snow on it, the flashing light
    const cz = -0.24, cy = 0.74;
    m.rbox(0.58, 0.52, 0.56, 0.06, Y, 0, cy, cz);
    m.box(0.46, 0.24, 0.02, GLASS, 0, cy + 0.07, cz + 0.28);
    m.box(0.46, 0.2, 0.02, GLASS, 0, cy + 0.07, cz - 0.28);
    m.sym(s => m.box(0.02, 0.22, 0.4, GLASS, s * 0.29, cy + 0.07, cz));
    m.sym(s => m.box(0.024, 0.24, 0.024, Y, s * 0.29, cy + 0.07, cz + 0.04));
    m.box(0.64, 0.05, 0.62, WHITE, 0, cy + 0.285, cz);
    m.rbox(0.56, 0.06, 0.54, 0.028, snow(), 0, cy + 0.33, cz - 0.01);
    m.cyl(0.06, 0.07, 0.04, DARK, 0, cy + 0.37, cz + 0.02, 0, 0, 0, 8);
    m.glow(1);
    m.cyl(0.05, 0.055, 0.07, AMBER, 0, cy + 0.42, cz + 0.02, 0, 0, 0, 8);
    m.dome(0.05, AMBER, 0, cy + 0.455, cz + 0.02, 1, 0.8, 1, 0, 0, 0, 8);
    m.glow(0);
    // exhaust pipe up the side of the cab, a mirror, rear lights
    m.cyl(0.026, 0.026, 0.52, STEEL, 0.22, 0.83, 0.08, 0, 0, 0, 6);
    m.cyl(0.03, 0.03, 0.04, DARK, 0.22, 1.09, 0.08, 0, 0, 0, 6);
    m.box(0.07, 0.1, 0.02, DARK, -0.33, cy + 0.12, cz + 0.27);
    m.sym(s => m.box(0.08, 0.05, 0.02, 0xe8423a, s * 0.21, 0.37, -0.655));
    // the blade: a curved orange plate on two push arms, angled to throw the snow to one side
    m.sym(s => rod(m, [s * 0.18, 0.2, 0.45], [s * 0.18, 0.2, 0.68], 0.03, DARK, 6));
    rod(m, [0, 0.42, 0.48], [0, 0.32, 0.68], 0.025, STEEL, 6);
    m.push(0, 0, 0.74, 0, -14 * D, 0);
    const prof = [];
    for (let i = 0; i <= 6; i++) { const t = i / 6; prof.push([0.06 * Math.cos(t * Math.PI * 0.95) + 0.02 * t, 0.035 + t * 0.38]); }
    for (let i = 6; i >= 0; i--) { const t = i / 6; prof.push([0.06 * Math.cos(t * Math.PI * 0.95) + 0.02 * t - 0.04, 0.035 + t * 0.38]); }
    m.extrude(prof, 1.02, ORANGE, 0, 0, 0, 0, -90 * D, 0);
    m.box(1.02, 0.035, 0.05, STEEL, 0, 0.022, 0.055);
    m.sym(s => m.box(0.03, 0.42, 0.12, DARK, s * 0.525, 0.235, 0.0));
    m.box(1.02, 0.03, 0.05, shade(ORANGE, 0.7), 0, 0.415, 0.055);
    m.pop();
    m.pop();
  },
});

// ================================================================================================
// 雪堡 — the finale's snow fort: walls of stacked snow blocks with crenellations, two little round
// towers with pennants, an arched tunnel straight through (the windmill's footprint), snowballs
// stacked ready on the rampart
// ================================================================================================
export const SNOW_FORT = { halfW: 1.2, halfD: 0.7, tunnelHalfW: 0.45, tunnelH: 0.6 };
const FT = { BW: 1.2, BD: 0.7, TW: 0.45, TH: 0.6, RISE: 0.14, BH: 0.9, SKIN: 0.04 };
const BLOCK = 0xf1f6fb, BLOCK_SH = 0xd3e1ef, TUNNEL = 0x6f8fb8, TUNNEL_TOP = 0x587aa6;

/** outer edge of the ring of arch stones over the tunnel: its height at u (or -1 beyond it) */
const RING = { a: FT.TW + 0.12, b: FT.RISE + 0.1 };
const ringTop = u => (Math.abs(u) >= RING.a ? -1 : FT.TH + RING.b * Math.sqrt(1 - (u / RING.a) ** 2));

/** one block on a face (face plane z = 0, facing +z): u0..u1 along, v0..v1 up, t thick; over the
 *  tunnel (arched = true) its bottom follows the ring of arch stones */
function block(m, u0, u1, v0, v1, t, k, arched = false) {
  const g = 0.012; // the seam
  const a = u0 + g / 2, b = u1 - g / 2, lo = v0 + g / 2, hi = v1 - g / 2;
  const col = shade(BLOCK, k);
  const cut = arched ? Math.max(ringTop(a), ringTop(b), ringTop(Math.min(Math.max(0, a), b))) : -1;
  if (cut <= lo) { m.box(b - a, hi - lo, t, perFace((x, y, z, nx, ny) => (ny > 0.5 ? SNOW : col)), (a + b) / 2, (lo + hi) / 2, t / 2); return; }
  const pts = [[b, hi], [a, hi]];
  const n = 4;
  for (let i = 0; i <= n; i++) {
    const u = a + ((b - a) * i) / n;
    pts.push([u, Math.min(hi - 0.02, Math.max(lo, ringTop(u) + g / 2))]);
  }
  m.extrude(pts, t, col, 0, 0, t / 2);
}
/** one face of blocks; courses are [v0, v1, joints along u] */
function blockFace(m, courses, t, seed) {
  courses.forEach(([v0, v1, joints], ci) => {
    for (let j = 0; j + 1 < joints.length; j++) {
      const u0 = joints[j], u1 = joints[j + 1];
      if (u1 - u0 < 0.02) continue;
      const k = 0.97 + 0.05 * Math.sin(seed + ci * 3.1 + j * 1.7);
      block(m, u0, u1, v0, v1, t + 0.008 * Math.sin(seed * 2 + ci + j * 2.3), k);
    }
  });
}
const mirror = half => [...half.slice().reverse().map(u => -u), ...half];

def('snow_fort', {
  name: '雪堡',
  cat: 'building',
  sfx: 'soft',
  fill: 0.6,
  build(m) {
    const { BW, BD, TW, TH, RISE, BH, SKIN } = FT;
    // the packed-snow core, the tunnel notched out of it (its walls and ceiling in blue shadow); set
    // in far enough that the blocks (and the proud arch stones) end inside x ±1.2, z ±0.7
    const cw = BW - SKIN - 0.01, cd = BD - SKIN - 0.02;
    const prof = [[-cw, 0], [-TW, 0], ...arch(TW, RISE, TH, 10), [TW, 0], [cw, 0], [cw, BH], [-cw, BH]];
    const coreCol = (x, y, z, nx, ny, nz) =>
      (Math.abs(nz) < 0.5 && Math.abs(x) < TW + 0.02 && y < TH + RISE + 0.03) ? (ny < -0.2 ? TUNNEL_TOP : TUNNEL) : BLOCK_SH;
    m.extrude(prof, cd * 2, coreCol);
    // front and back: courses of blocks, the ring of arch stones, icicles in the arch
    // (joints along u, mirrored; the lower courses' middle span is the tunnel's mouth, left open)
    const pier = mirror([TW, 0.83, BW]), pier2 = mirror([TW, 0.64, 1.02, BW]);
    const courses = [
      [0, 0.22, pier],
      [0.22, 0.43, pier2],
      [0.43, 0.645, pier],
      [0.645, BH, mirror([0.3, 0.76, BW])],
    ];
    for (const ry of [0, Math.PI]) {
      m.push(0, 0, 0, 0, ry, 0).push(0, 0, cd);
      courses.forEach(([v0, v1, joints], ci) => {
        for (let j = 0; j + 1 < joints.length; j++) {
          const u0 = joints[j], u1 = joints[j + 1];
          if (v1 <= 0.65 && u0 >= -TW - 0.001 && u1 <= TW + 0.001) continue; // the tunnel's mouth
          const k = 0.97 + 0.05 * Math.sin(ry * 3 + ci * 3.1 + j * 1.7);
          block(m, u0, u1, v0, v1, SKIN + 0.006 * Math.sin(ry + ci + j * 2.3), k, v0 >= TH);
        }
      });
      // arch stones: five wedges between the tunnel's arch and the ring's outer edge, a little proud
      const N = 5;
      for (let i = 0; i < N; i++) {
        const t0 = Math.PI - (i / N) * Math.PI, t1 = Math.PI - ((i + 1) / N) * Math.PI, pts = [];
        for (let k = 0; k <= 2; k++) { const t = t0 + ((t1 - t0) * k) / 2; pts.push([RING.a * Math.cos(t), TH + RING.b * Math.sin(t)]); }
        for (let k = 2; k >= 0; k--) { const t = t0 + ((t1 - t0) * k) / 2; pts.push([TW * Math.cos(t), TH + RISE * Math.sin(t)]); }
        m.extrude(pts, SKIN + 0.02, i % 2 ? BLOCK : shade(BLOCK, 0.96), 0, 0, (SKIN + 0.02) / 2);
      }
      for (const [u, l] of [[-0.24, 0.06], [-0.05, 0.085], [0.17, 0.07]]) {
        const y = TH + RISE * Math.sqrt(1 - (u / TW) ** 2);
        m.cone(0.016, l, ICE, u, y - l / 2 + 0.01, 0.022, 180 * D, 0, 0, 5);
      }
      m.pop().pop();
    }
    // the two ends: courses of blocks
    for (const s of [1, -1]) {
      m.push(s * cw, 0, 0, 0, s * 90 * D, 0);
      blockFace(m, [
        [0, 0.22, [-cd, -0.2, 0.25, cd]],
        [0.22, 0.43, [-cd, -0.42, 0.02, 0.45, cd]],
        [0.43, 0.645, [-cd, -0.2, 0.25, cd]],
        [0.645, BH, [-cd, -0.42, 0.02, 0.45, cd]],
      ], SKIN, s * 5);
      m.pop();
    }
    // the rampart: a snow-covered deck, a low wall round its edge with merlons on it
    // (the walk a cooler white than the blocks, so the merlons and towers stand out on it from above)
    m.box(BW * 2, 0.05, BD * 2, snow(0xe3ecf6), 0, BH + 0.025, 0);
    const PY = BH + 0.05, TX = 0.86, TZ = 0.36, TR = 0.3;
    const wall = (x0, x1, z0, z1) => m.box(x1 - x0, 0.1, z1 - z0, snow(BLOCK), (x0 + x1) / 2, PY + 0.05, (z0 + z1) / 2);
    wall(-BW, BW, -BD, -BD + 0.15);
    wall(-TX + TR - 0.02, TX - TR + 0.02, BD - 0.15, BD);
    m.sym(s => wall(s > 0 ? BW - 0.15 : -BW, s > 0 ? BW : -BW + 0.15, -BD + 0.15, TZ - 0.1));
    const merlon = (x, z, ry) => m.box(0.24, 0.2, 0.15, snow(BLOCK), x, PY + 0.2, z, 0, ry, 0);
    for (const x of [-1.08, -0.65, -0.22, 0.22, 0.65, 1.08]) merlon(x, -BD + 0.075, 0);
    for (const x of [-0.36, 0, 0.36]) merlon(x, BD - 0.075, 0);
    m.sym(s => merlon(s * (BW - 0.075), -0.2, 90 * D));
    // two round towers at the front corners, flanking the gate: courses turned half a block each
    // way, a corbelled crown with merlons, an arrow slit, a pennant
    m.sym(s => {
      const x = s * TX;
      for (let i = 0; i < 3; i++) m.cyl(TR, TR, 0.22, i % 2 ? BLOCK : shade(BLOCK, 0.97), x, PY + 0.11 + i * 0.22, TZ, 0, (i % 2) * 20 * D, 0, 9);
      const cy = PY + 0.66;
      m.cyl(TR + 0.028, TR, 0.07, perFace((px, py, pz, nx, ny) => (ny > 0.5 ? SNOW : shade(BLOCK, 0.95))), x, cy + 0.035, TZ, 0, 0, 0, 10);
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + (s > 0 ? 0.4 : -0.4);
        m.box(0.15, 0.14, 0.1, snow(BLOCK), x + Math.sin(a) * (TR - 0.03), cy + 0.13, TZ + Math.cos(a) * (TR - 0.03), 0, a, 0);
      }
      m.box(0.05, 0.2, 0.03, TUNNEL, x - s * 0.06, PY + 0.4, TZ + TR - 0.004, 0, -s * 12 * D, 0);
      // the pennant: a pole and a plain, two-tone streamer (yellow on one, blue on the other)
      const px = x - s * 0.08, top = cy + 0.58;
      m.cyl(0.014, 0.014, 0.6, WOOD_DK, px, cy + 0.3, TZ - 0.06, 0, 0, 0, 5);
      ball(m, 0.022, YELLOW, px, top + 0.02, TZ - 0.06);
      m.push(px, top - 0.02, TZ - 0.06, 0, s > 0 ? 0.25 : Math.PI - 0.25, 0);
      m.extrude([[0, 0], [0.16, -0.035], [0.3, -0.07], [0, -0.14]], 0.012, s > 0 ? YELLOW : BLUE, 0, 0, 0);
      m.extrude([[0, -0.1], [0.08, -0.115], [0, -0.14]], 0.016, s > 0 ? ORANGE : BLUE_LT, 0, 0, 0);
      m.pop();
    });
    // snowballs stacked on the rampart, three and two and one
    const sb = 0.072, sx = -0.32, sz = -0.12;
    const at = [[-1, 0], [0, 0], [1, 0], [-0.5, 1], [0.5, 1], [0, 2]];
    for (const [i, j] of at) m.sphere(sb, snow(), sx + i * sb * 2.02, PY + sb + j * sb * 1.65, sz + (j === 1 ? -0.02 : 0), 1, 1, 1, 0, i, 0, 8);
  },
});

// ================================================================================================
// 雪中小棚 — a garden shed snowed in, for the back of the garden: butter-yellow board and batten,
// white trim, a blue plank door, a warm lit window, snow thick on the roof with icicles along the
// eaves, a stack of firewood by the side under its own cap of snow. 2.5 m to the top of the snow on
// the ridge (the yard stands it at 0.65, low enough to show whole under the top bar: looks/winter.js)
// ================================================================================================
def('shed_snow', {
  name: '雪中小棚',
  cat: 'building',
  sfx: 'wood',
  fill: 0.7,
  build(m) {
    const SIDING = 0xf2d28a, BATTEN = shade(SIDING, 0.86), TRIM = 0xf8f6f0, DOOR = BLUE, ROOF = 0x56627e;
    const W = 2.2, Dp = 1.8, Y0 = 0.08, Hw = 1.62, RISE = 0.56, zf = Dp / 2;
    // timber skids, the walls and the gables
    m.sym(s => m.box(0.12, Y0, Dp + 0.1, WOOD_DK, s * 0.9, Y0 / 2, 0));
    m.box(W, Hw, Dp, SIDING, 0, Y0 + Hw / 2, 0);
    m.prism(W, RISE, Dp, SIDING, 0, Y0 + Hw + RISE / 2, 0);
    // battens on the front and the back, up into the gable
    for (const z of [zf, -zf]) {
      for (let i = 0; i < 12; i++) {
        const x = -W / 2 + 0.1 + i * 0.182, top = Y0 + Hw + RISE * (1 - Math.abs(x) / (W / 2)) - 0.04;
        m.box(0.035, top - Y0, 0.02, BATTEN, x, (Y0 + top) / 2, z + Math.sign(z) * 0.01);
      }
    }
    // corner boards and the bargeboards up the gables
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) m.box(0.08, Hw, 0.08, TRIM, sx * (W / 2), Y0 + Hw / 2, sz * zf);
    const a = Math.atan2(RISE, W / 2), L = Math.hypot(RISE, W / 2) + 0.16, RD = Dp + 0.26, apex = Y0 + Hw + RISE + 0.02;
    for (const z of [zf + 0.06, -zf - 0.06]) m.sym(s => m.box(L - 0.02, 0.1, 0.035, TRIM, s * (W / 4), Y0 + Hw + RISE / 2 + 0.02, z, 0, 0, -s * a));
    // the roof: boards under a thick blanket of snow, its rounded lip over each eave, and icicles
    m.sym(s => {
      m.push(0, apex, 0, 0, 0, -s * a);
      m.box(L, 0.05, RD, ROOF, (s * L) / 2, 0.025, 0);
      m.box(L - 0.04, 0.13, RD - 0.04, snow(), (s * (L - 0.04)) / 2, 0.11, 0);
      m.cyl(0.075, 0.075, RD - 0.04, snow(), s * (L - 0.05), 0.1, 0, 90 * D, 0, 0, 7);
      m.pop();
      const xe = s * (L * Math.cos(a) + 0.02), ye = apex - L * Math.sin(a) + 0.02;
      for (let i = 0; i < 7; i++) {
        const l = 0.1 + 0.12 * (0.5 + 0.5 * Math.sin(i * 2.3 + s));
        m.cone(0.028, l, ICE, xe - s * 0.04, ye - l / 2, -RD / 2 + 0.2 + i * ((RD - 0.4) / 6), 180 * D, 0, 0, 4);
      }
    });
    m.cyl(0.09, 0.09, RD - 0.02, SNOW, 0, apex + 0.13, 0, 90 * D, 0, 0, 7);
    // the door (left of centre): blue planks, a white Z brace, black strap hinges and a latch
    const dx = -0.42, dw = 0.78, dh = 1.45;
    m.box(dw + 0.12, dh + 0.08, 0.03, TRIM, dx, Y0 + (dh + 0.08) / 2, zf + 0.012);
    m.jitter(0.05);
    for (let i = 0; i < 5; i++) m.box(dw / 5 - 0.008, dh, 0.03, DOOR, dx - dw / 2 + (i + 0.5) * (dw / 5), Y0 + dh / 2, zf + 0.03);
    m.jitter(0);
    for (const y of [0.25, dh - 0.22]) m.box(dw - 0.06, 0.09, 0.02, TRIM, dx, Y0 + y, zf + 0.055);
    const bl = Math.hypot(dw - 0.18, dh - 0.57), ba = Math.atan2(dh - 0.57, dw - 0.18);
    m.box(bl, 0.08, 0.02, TRIM, dx, Y0 + (dh + 0.03) / 2, zf + 0.055, 0, 0, ba);
    for (const y of [0.25, dh - 0.22]) m.box(0.34, 0.035, 0.012, IRON, dx - dw / 2 + 0.17, Y0 + y, zf + 0.07);
    m.box(0.04, 0.12, 0.03, IRON, dx + dw / 2 - 0.08, Y0 + 0.8, zf + 0.07);
    // the window (right), lit warm from inside, snow on its sill
    const wx = 0.56, wy = Y0 + 1.12, ww = 0.56, wh = 0.48;
    m.box(ww + 0.1, wh + 0.1, 0.03, TRIM, wx, wy, zf + 0.012);
    m.glow(1).box(ww, wh, 0.02, LIT, wx, wy, zf + 0.022).glow(0);
    m.box(0.03, wh, 0.02, TRIM, wx, wy, zf + 0.036);
    m.box(ww, 0.03, 0.02, TRIM, wx, wy, zf + 0.036);
    m.box(ww + 0.16, 0.035, 0.08, TRIM, wx, wy - wh / 2 - 0.06, zf + 0.04);
    m.box(ww + 0.12, 0.05, 0.09, SNOW, wx, wy - wh / 2 - 0.02, zf + 0.045);
    // snow drifted against the foot of the walls
    lump(m, 0.35, 0.14, 0.25, snow(), -1.0, 0, zf + 0.1, 0.3);
    lump(m, 0.45, 0.16, 0.28, snow(), 0.62, 0, zf + 0.12, -0.2);
    lump(m, 0.9, 0.14, 0.3, snow(), 0, 0, -zf - 0.1, 0);
    // the firewood stacked by the right-hand wall, its cut ends to the front, snow on top
    const logs = (x, y, z) => m.cyl(0.07, 0.07, 0.62, (px, py, pz, nx, ny, nz) => (Math.abs(nz) > 0.5 ? 0xe2b47c : 0x7a5236), x, y, z, 90 * D, 0, 0, 7);
    for (let row = 0; row < 3; row++) for (let i = 0; i < 4 - row; i++) logs(W / 2 + 0.13 + row * 0.07 + i * 0.14, 0.07 + row * 0.12, zf - 0.38);
    lump(m, 0.28, 0.08, 0.34, snow(), W / 2 + 0.4, 0.36, zf - 0.38, 0.1);
  },
});

// ================================================================================================
// 雪中路灯 — a black iron street lamp with a lantern head, snow on its cap and on the ladder bar
// ================================================================================================
def('lamp_snow', {
  name: '雪中路灯',
  cat: 'street',
  sfx: 'metal',
  fill: 0.12,
  build(m) {
    // fluted base, slim post with collars, the ladder bar near the top
    m.lathe([[0, 0], [0.19, 0], [0.19, 0.07], [0.15, 0.11], [0.13, 0.36], [0.09, 0.43], [0.065, 0.46], [0, 0.46]], IRON, 0, 0, 0, 0, Math.PI / 8, 0, 8);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      m.box(0.025, 0.2, 0.02, shade(IRON, 1.5), Math.sin(a) * 0.14, 0.24, Math.cos(a) * 0.14, 0, a, 0);
    }
    m.cyl(0.04, 0.05, 2.0, IRON, 0, 1.45, 0, 0, 0, 0, 8);
    for (const y of [0.95, 2.4]) m.cyl(0.065, 0.065, 0.05, IRON, 0, y, 0, 0, 0, 0, 8);
    m.box(0.56, 0.035, 0.035, IRON, 0, 2.2, 0);
    m.sym(s => ball(m, 0.03, IRON, s * 0.29, 2.2, 0));
    m.box(0.5, 0.03, 0.05, SNOW, 0, 2.232, 0);
    // the lantern: a tapering four-sided glass box, warm-lit, under a pointed cap of snow
    m.cyl(0.05, 0.09, 0.12, IRON, 0, 2.5, 0, 0, Math.PI / 4, 0, 4);
    m.push(0, 2.56, 0, 0, Math.PI / 4, 0);
    m.glow(1);
    m.cyl(0.17, 0.12, 0.34, LIT, 0, 0.17, 0, 0, 0, 0, 4);
    m.glow(0);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      rod(m, [Math.sin(a) * 0.12, 0, Math.cos(a) * 0.12], [Math.sin(a) * 0.17, 0.34, Math.cos(a) * 0.17], 0.012, IRON, 4);
    }
    m.cyl(0.2, 0.2, 0.035, IRON, 0, 0.355, 0, 0, 0, 0, 4);
    m.cone(0.2, 0.2, IRON, 0, 0.47, 0, 0, 0, 0, 4);
    m.pop();
    m.cone(0.2, 0.15, snow(), 0, 2.98, 0, 0, Math.PI / 8, 0, 8);
    m.cyl(0.21, 0.19, 0.04, SNOW, 0, 2.91, 0, 0, Math.PI / 8, 0, 8);
    ball(m, 0.035, IRON, 0, 3.07, 0);
    // a heap of snow round the foot
    lump(m, 0.3, 0.1, 0.28, snow(), 0, 0, 0, 0.3);
  },
});

// ================================================================================================
// 雪铲 — a snow shovel stuck upright in a lump of snow
// ================================================================================================
def('snow_shovel', {
  name: '雪铲',
  cat: 'daily',
  sfx: 'hard',
  fill: 0.25,
  build(m) {
    m.push(0, 0, 0, 0, 0, 0, 0.88); // (modelled a touch big; 1.1 m to the top of the grip)
    m.dome(0.32, snow(), 0, 0, 0, 1, 0.7, 0.88, 0, 0.4, 0, 12);
    m.dome(0.16, snow(), 0.2, 0, 0.15, 1, 0.6, 0.9, 0, 0, 0, 8);
    m.push(0, 0.1, 0.02, -8 * D, 0.3, 4 * D);
    // the blade: a wide blue scoop with a steel wear strip, its bottom buried in the snow
    m.extrude([[-0.2, 0], [0.2, 0], [0.19, 0.3], [0.15, 0.36], [-0.15, 0.36], [-0.19, 0.3]], 0.03, BLUE, 0, 0, 0, -6 * D, 0, 0);
    m.box(0.4, 0.035, 0.034, STEEL, 0, 0.02, 0);
    m.sym(s => m.box(0.03, 0.3, 0.05, shade(BLUE, 0.8), s * 0.1, 0.18, 0.012, -6 * D, 0, 0));
    m.box(0.12, 0.08, 0.06, shade(BLUE, 0.8), 0, 0.38, 0.0);
    // the shaft and its black D-grip
    m.cyl(0.02, 0.022, 0.62, WOOD, 0, 0.72, 0, 0, 0, 0, 6);
    m.push(0, 1.08, 0);
    m.torus(0.075, 0.016, IRON, 0, 0, 0, 0, 0, 0, Math.PI * 2, 4, 10);
    m.box(0.13, 0.03, 0.03, IRON, 0, 0.06, 0);
    m.pop();
    m.pop();
    m.pop();
  },
});

// ================================================================================================
// 溜冰鞋 — a pair of white figure skates tied together by their laces, one standing, one lying down
// ================================================================================================
/** one figure skate, toe towards +x (its profile faces ±z): a white boot with blue laces on a
 *  sole and heel, the silver blade below on two posts, curling up into a toe pick at the front */
function skate(m) {
  const BOOT = 0xf7f3ec, SOLE = 0x7a5238, LACE = 0x3f86e0, BLADE = 0xc9d0d8;
  // the blade, its curled toe, the two posts up to the sole
  m.box(0.27, 0.022, 0.009, BLADE, 0.0, 0.011, 0);
  m.torus(0.03, 0.006, BLADE, 0.135, 0.036, 0, 0, 0, -90 * D, Math.PI * 0.9, 3, 6);
  for (const x of [0.085, -0.085]) m.box(0.028, 0.05, 0.012, BLADE, x, 0.045, 0);
  // sole and heel
  m.box(0.25, 0.018, 0.08, SOLE, 0.01, 0.075, 0);
  m.box(0.07, 0.03, 0.074, SOLE, -0.085, 0.06, 0);
  // the boot: a long rounded foot, the tall ankle leaning forward a little, a padded collar
  m.ellipsoid(0.125, 0.05, 0.043, BOOT, 0.015, 0.1, 0, 0, 0, 0, 9);
  m.push(-0.055, 0.09, 0, 0, 0, -8 * D);
  m.cyl(0.05, 0.054, 0.18, BOOT, 0, 0.09, 0, 0, 0, 0, 9);
  m.cyl(0.056, 0.054, 0.026, (x, y, z, nx, ny) => (ny > 0.5 ? 0x6e655d : shade(BOOT, 0.88)), 0, 0.186, 0, 0, 0, 0, 9); // (dark inside)
  // the tongue and the laces criss-crossing up the front
  m.box(0.02, 0.15, 0.05, shade(BOOT, 0.94), 0.045, 0.09, 0);
  for (let i = 0; i < 4; i++) m.box(0.012, 0.01, 0.058, LACE, 0.056, 0.035 + i * 0.038, 0, 0, i % 2 ? 0.35 : -0.35, 0);
  m.pop();
}

def('ice_skates', {
  name: '溜冰鞋',
  cat: 'daily',
  sfx: 'hard',
  fill: 0.3,
  build(m) {
    // a pair standing side by side on the snow, one a little ahead and askew, their laces knotted
    // together in a loop between the collars (toes towards +x, so the profiles face the front)
    m.push(-0.02, 0, 0.055, 0, 0.06, 0);
    skate(m);
    m.pop();
    m.push(0.03, 0, -0.055, 0, -0.12, 0);
    skate(m);
    m.pop();
    m.tube([[-0.07, 0.29, 0.055], [-0.05, 0.36, 0.03], [-0.03, 0.37, -0.02], [-0.02, 0.3, -0.06]], 0.007, 0x3f86e0, 4, false, 10);
    m.tube([[-0.07, 0.29, 0.055], [-0.11, 0.26, 0.08], [-0.13, 0.2, 0.07]], 0.007, 0x3f86e0, 4, false, 6);
  },
});

// ================================================================================================
// 雪丘 — a smooth drift of snow, for the backdrop and hills
// ================================================================================================
def('snow_mound', {
  name: '雪丘',
  cat: 'nature',
  sfx: 'soft',
  fill: 0.5,
  build(m) {
    m.dome(0.75, snow(), 0, 0, 0, 1, 0.53, 0.82, 0, 0.3, 0, 16);
    m.dome(0.42, snow(), 0.4, 0, 0.22, 1, 0.55, 1, 0, 0, 0, 12);
    m.dome(0.3, snow(), -0.42, 0, -0.18, 1, 0.5, 1, 0, 0, 0, 10);
  },
});
