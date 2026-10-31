// 风车屋 · 风车叶片 — the classic mini-golf windmill the ball rolls through, and its turning sails.
// Metres, +Y up, base on y = 0, centred on x = z = 0, front (+Z) carries the rotor.
//
// Gameplay layout (the course code relies on these numbers):
//   windmill        footprint x -1.2…+1.2, z -0.7…+0.7. A tunnel runs through along z, x -0.45…+0.45,
//                   0.6 m clear (straight jambs to 0.6, a low arch above), no floor. Either side is solid
//                   down to y = 0. The axle stub's centre line is x 0, y 1.6; the rotor's hub sits on it
//                   at z 0.78. Nothing else in front of z 0.7 (the blades sweep z 0.735…0.825 down to y 0.15).
//   windmill_rotor  built round the hub centre: four blades in the x-y plane, tips 1.45 m out, turning
//                   about z (blades within z ±0.045, brass cap / back boss to ±0.118); the bounding box is
//                   symmetric about the hub, z too, so its centre IS the hub.
//                   Sails trail for a positive (counter-clockwise from the front) turn about +z.
import * as THREE from 'three';
import { def } from '../../catalog/registry.js';
import { D, shade } from '../../core/modeler.js';

export const WINDMILL = { halfW: 1.2, halfD: 0.7, tunnelHalfW: 0.45, tunnelH: 0.6, axle: [0, 1.6, 0.78], rotorR: 1.45 };

// ---- local helpers -----------------------------------------------------------------------------
const UP = new THREE.Vector3(0, 1, 0);
const _d = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const ICO = new THREE.IcosahedronGeometry(1, 0);

/** round rod from a to b */
function rod(m, a, b, r, col, seg = 6) {
  _d.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const len = _d.length();
  _q.setFromUnitVectors(UP, _d.normalize());
  _e.setFromQuaternion(_q, 'XYZ');
  m.cyl(r, r, len, col, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2, _e.x, _e.y, _e.z, seg);
}
/** cheap 20-triangle blob (flowers, finial) */
function ball(m, r, col, x, y, z, sx = 1, sy = 1, sz = 1) {
  m.geo(ICO, col, x, y, z, 0, 0, 0, r * sx, r * sy, r * sz);
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
const RED = 0xd4493d, WHITE = 0xf8f3e7, TEAL = 0x2f7c84, ROOF = 0x2c636c, STONE = 0xb1a897, DECK = 0xc8925e,
  HOLE_WALL = 0x3b3033, HOLE_TOP = 0x241d1f, GLASS = 0xffd27e, GOLD = 0xedbd45, IRON = 0x54575e, OAK = 0x7c5235,
  LEAF = 0x4f9e4a, PINK = 0xf47ba6, YELLOW = 0xf7d24c, CORAL = 0xff7a5c, SACK = 0xe2cc9c;
const hash3 = (x, y, z) => { const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453; return s - Math.floor(s); };
const speckle = (hex, amt = 0.12) => (x, y, z) => shade(hex, 1 - amt / 2 + amt * hash3(x, y, z));

// ---- the base storey ---------------------------------------------------------------------------
const TW = 0.45, TH = 0.6, RISE = 0.14; // tunnel half-width, clear height, arch rise above it
const BW = 1.15, BD = 0.65, BH = 0.9;   // wall half-width, half-depth, height (plinth and trim reach 1.2 / 0.7)

/** window centred at (x, y) on the face at local z = 0 (face normal +z): white frame, lit glass, cross bars */
function windowAt(m, x, y, w, h) {
  m.box(w + 0.07, h + 0.07, 0.03, WHITE, x, y, 0.015);
  m.glow(0.55);
  m.box(w, h, 0.012, GLASS, x, y, 0.034);
  m.glow(0);
  m.box(0.024, h, 0.014, WHITE, x, y, 0.043);
  m.box(w, 0.024, 0.014, WHITE, x, y, 0.043);
}
/** window box of flowers centred at (x, y), standing out to local z = 0.05 */
function flowerBox(m, x, y, w) {
  m.box(w, 0.08, 0.05, TEAL, x, y, 0.025);
  m.box(w - 0.03, 0.035, 0.035, LEAF, x, y + 0.05, 0.022);
  const cols = [PINK, YELLOW, CORAL];
  for (let i = 0; i < 3; i++) ball(m, 0.038, cols[i], x + (i - 1) * (w - 0.1) / 2, y + 0.078 + (i % 2) * 0.012, 0.016);
}

function base(m) {
  // walls with the tunnel notched out; the tunnel's sides and arched ceiling are dark
  const prof = [[-BW, 0], [-TW, 0], ...arch(TW, RISE, TH), [TW, 0], [BW, 0], [BW, BH], [-BW, BH]];
  // (the red boards darken a little towards the ground, so the storey doesn't read as one flat slab)
  const wallCol = (x, y, z, nx, ny, nz) =>
    (Math.abs(nz) < 0.5 && Math.abs(x) < TW + 0.02 && y < TH + RISE + 0.05) ? (ny < -0.2 ? HOLE_TOP : HOLE_WALL)
      : shade(RED, 0.84 + 0.16 * Math.min(1, y / BH));
  m.extrude(prof, BD * 2, wallCol);
  // stone plinth either side (the ball's bumper) and white corner boards
  m.sym(s => m.box(1.2 - TW - 0.003, 0.16, 1.38, speckle(STONE), s * (1.2 + TW + 0.003) / 2, 0.08, 0));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) m.box(0.12, BH - 0.16, 0.12, WHITE, sx * (BW - 0.045), 0.16 + (BH - 0.16) / 2, sz * (BD - 0.045));
  // front and back: arched door frame, two windows with flower boxes
  for (const ry of [0, Math.PI]) {
    m.push(0, 0, 0, 0, ry, 0).push(0, 0, BD);
    const outer = arch(TW + 0.12, RISE + 0.11, TH), inner = arch(TW, RISE, TH).reverse();
    m.extrude([[-TW - 0.12, 0], ...outer, [TW + 0.12, 0], [TW, 0], ...inner, [-TW, 0]], 0.045, WHITE, 0, 0, 0.0225);
    // a teal keystone at the crown of the arch, a hair proud of the frame
    m.extrude([[-0.05, TH + RISE - 0.02], [0.05, TH + RISE - 0.02], [0.07, TH + RISE + 0.14], [-0.07, TH + RISE + 0.14]], 0.05, TEAL, 0, 0, 0.025);
    m.sym(s => {
      windowAt(m, s * 0.86, 0.53, 0.22, 0.24);
      flowerBox(m, s * 0.86, 0.315, 0.32);
    });
    m.pop().pop();
  }
  // the two ends: a shuttered window each
  m.sym(s => {
    m.push(s * BW, 0, 0, 0, s * 90 * D, 0);
    windowAt(m, 0, 0.53, 0.24, 0.26);
    m.sym(t => m.box(0.12, 0.33, 0.02, TEAL, t * 0.22, 0.53, 0.01));
    m.box(0.4, 0.035, 0.05, WHITE, 0, 0.36, 0.025);
    m.pop();
  });
  // the stage on top: planked deck with a white fascia, and a railing round its edge
  const y0 = BH + 0.074, px = 1.16, pz = 0.665;
  m.box(2.4, y0 - BH - 0.0015, 1.4, (x, y, z, nx, ny) => (ny > 0.5 ? shade(DECK, 0.62) : WHITE), 0, (BH + y0 - 0.0015) / 2, 0);
  const NP = 10, pitch = 1.36 / NP;
  m.jitter(0.07);
  for (let i = 0; i < NP; i++) m.plane(2.36, pitch - 0.012, DECK, 0, y0, -0.68 + (i + 0.5) * pitch, -90 * D, 0, 0);
  m.jitter(0);
  for (const x of [-px, -px / 2, px / 2, px]) for (const z of [-pz, pz]) m.box(0.035, 0.24, 0.035, WHITE, x, y0 + 0.12, z);
  m.sym(s => m.box(0.035, 0.24, 0.035, WHITE, s * px, y0 + 0.12, 0));
  for (const [y, t] of [[y0 + 0.225, 0.035], [y0 + 0.11, 0.025]]) {
    m.sym(s => m.box(px * 2 + t, t, t, WHITE, 0, y, s * pz));
    m.sym(s => m.box(t, t, pz * 2, WHITE, s * px, y, 0));
  }
  // the miller's flour sacks on one side of the stage, a pot of geraniums on the other
  // (plump bags pinched at the neck with a string tie and a frilled top)
  const SACK_PROF = [[0, 0], [0.085, 0.004], [0.106, 0.05], [0.1, 0.12], [0.07, 0.178], [0.034, 0.204], [0.04, 0.222], [0.06, 0.246], [0, 0.25]];
  for (const [x, z, a, k] of [[0.95, 0.13, 0.3, 1.12], [0.93, 0.42, -0.5, 0.94]]) {
    const tie = (px, py) => { const t = (py - y0) / k; return t > 0.19 && t < 0.226 ? shade(SACK, 0.62) : SACK; };
    m.push(x, y0, z, 0, a, -0.1, [k, k, k * 0.82]);
    m.lathe(SACK_PROF, tie, 0, 0, 0, 0, 0, 0, 7);
    m.pop();
  }
  m.cyl(0.075, 0.055, 0.12, 0xc8693a, -0.97, y0 + 0.06, 0.42, 0, 0, 0, 7);
  ball(m, 0.085, LEAF, -0.97, y0 + 0.16, 0.42, 1, 0.75, 1);
  for (let i = 0; i < 3; i++) { const a = i * 2.1; ball(m, 0.032, CORAL, -0.97 + Math.cos(a) * 0.045, y0 + 0.215, 0.42 + Math.sin(a) * 0.045); }
}

// ---- the tower ---------------------------------------------------------------------------------
// an eight-sided tapered tower (squashed front to back), boarded in overlapping rings
const TY0 = BH + 0.07, TY1 = 2.08, TX0 = 0.72, TX1 = 0.52, K = 0.5 / 0.72, FL = 0.016, C8 = Math.cos(Math.PI / 8);
const apo = y => TX0 + (TX1 - TX0) * (y - TY0) / (TY1 - TY0);

/** local frame on a tower face at height y (side 0 front, 1 +x, 2 back, 3 -x): origin on the boards, +z out */
function onFace(m, side, y, fn) {
  const ang = side * Math.PI / 2, kk = side % 2 ? 1 : K;
  const d = (apo(y) + FL * C8 * 0.5) * kk;
  const lean = Math.atan(((TX0 - TX1) * kk) / (TY1 - TY0));
  m.push(Math.sin(ang) * d, y, Math.cos(ang) * d, 0, ang, 0).push(0, 0, 0, -lean, 0, 0);
  fn();
  m.pop().pop();
}

function tower(m) {
  const N = 6, h = (TY1 - TY0) / N;
  m.push(0, 0, 0, 0, 0, 0, [1, 1, K]);
  // (open lathe rings: their ends are hidden by the deck, the next ring up and the white band)
  for (let i = 0; i < N; i++) {
    const yb = TY0 + i * h, yt = yb + h;
    m.lathe([[apo(yb) / C8 + FL, yb], [apo(yt) / C8, yt]], i % 2 ? shade(RED, 0.95) : RED, 0, 0, 0, 0, Math.PI / 8, 0, 8);
  }
  // white skirting at the foot, white ring under the cap
  m.cyl(apo(TY0) / C8 + FL + 0.025, apo(TY0) / C8 + FL + 0.025, 0.05, WHITE, 0, TY0 + 0.025, 0, 0, Math.PI / 8, 0, 8);
  m.cyl(apo(TY1) / C8 + 0.05, apo(TY1) / C8 + 0.05, 0.07, WHITE, 0, TY1 + 0.035, 0, 0, Math.PI / 8, 0, 8);
  // the cap: a flared, rounded roof in shingled rings
  const RB = TY1 + 0.07;
  const rings = [[0.67, 0.585, 0.12], [0.6, 0.47, 0.14], [0.485, 0.32, 0.13], [0.335, 0.16, 0.11], [0.175, 0.0, 0.08]];
  let y = RB;
  rings.forEach(([a0, a1, hh], i) => {
    const col = i % 2 ? shade(ROOF, 1.1) : ROOF;
    // (the eave keeps its underside; the rings above it only show their sloping tops)
    if (i === 0) m.cyl(a1 / C8, a0 / C8, hh, col, 0, y + hh / 2, 0, 0, Math.PI / 8, 0, 8);
    else m.lathe([[a0 / C8, y], [a1 / C8, y + hh]], col, 0, 0, 0, 0, Math.PI / 8, 0, 8);
    y += hh;
  });
  m.pop();
  // white corner beads down the eight edges
  for (let j = 0; j < 8; j++) {
    const a = Math.PI / 8 + j * Math.PI / 4, rb = TX0 / C8 + FL, rt = TX1 / C8 + FL * 0.5;
    rod(m, [rb * Math.sin(a), TY0, K * rb * Math.cos(a)], [rt * Math.sin(a), TY1, K * rt * Math.cos(a)], 0.025, WHITE, 4);
  }
  // finial and a little pennant
  const top = y;
  ball(m, 0.045, GOLD, 0, top + 0.02, 0);
  m.cyl(0.012, 0.012, 0.14, IRON, 0, top + 0.06, 0, 0, 0, 0, 5);
  m.extrude([[0, 0], [0.16, -0.035], [0, -0.07]], 0.012, RED, 0.012, top + 0.125, 0);

  // front: bearing block and the axle stub (centre line x 0, y 1.6; the hub sits at z 0.78), porthole above
  onFace(m, 0, 1.6, () => {
    m.box(0.27, 0.27, 0.08, OAK, 0, 0, 0.03);
    m.sym(s => m.sym(t => m.box(0.03, 0.03, 0.02, IRON, s * 0.095, t * 0.095, 0.075)));
  });
  m.cyl(0.055, 0.055, 0.4, IRON, 0, 1.6, 0.64, 90 * D, 0, 0, 8);
  onFace(m, 0, 1.94, () => {
    m.cyl(0.1, 0.1, 0.03, WHITE, 0, 0, 0.012, 90 * D, Math.PI / 8, 0, 8);
    m.glow(0.55);
    m.cyl(0.072, 0.072, 0.03, GLASS, 0, 0, 0.022, 90 * D, Math.PI / 8, 0, 8);
    m.glow(0);
  });
  // sides: a shuttered window each
  for (const side of [1, 3]) onFace(m, side, 1.5, () => {
    windowAt(m, 0, 0, 0.2, 0.26);
    m.sym(t => m.box(0.1, 0.32, 0.02, TEAL, t * 0.19, 0, 0.01));
  });
  // back: a door onto the stage with a lamp, a window above
  onFace(m, 2, TY0 + 0.31, () => {
    m.box(0.42, 0.62, 0.03, WHITE, 0, 0, 0.012);
    m.box(0.34, 0.56, 0.03, TEAL, 0, -0.03, 0.022);
    m.box(0.3, 0.02, 0.01, shade(TEAL, 0.8), 0, 0.05, 0.04);
    ball(m, 0.022, GOLD, 0.11, -0.05, 0.045);
    m.glow(1);
    ball(m, 0.036, GLASS, 0, 0.37, 0.05, 1, 1.3, 1);
    m.glow(0);
    m.box(0.06, 0.025, 0.06, IRON, 0, 0.42, 0.04);
  });
  onFace(m, 2, 1.86, () => windowAt(m, 0, 0, 0.2, 0.22));
}

def('windmill', {
  name: '风车屋',
  cat: 'building',
  sfx: 'wood',
  fill: 0.55,
  build(m) {
    base(m);
    tower(m);
  },
});

// ---- the sails ---------------------------------------------------------------------------------
def('windmill_rotor', {
  name: '风车叶片',
  cat: 'building',
  sfx: 'wood',
  fill: 0.15,
  build(m) {
    // dark oak spars, white-painted lattice over cream canvas (so each sail reads as one pale blade
    // against the red tower from across the green), red-tipped
    const SPAR = 0x73462b, LATH = 0xfbf6ea, SAIL = 0xf6e7c3, HUB = 0x5e4536;
    const R = 1.45, S0 = 0.37, S1 = 1.39, SW = 0.32; // tip, sail from / to, sail width
    for (let i = 0; i < 4; i++) {
      m.push(0, 0, 0, 0, 0, i * 90 * D); // blade along local +y, sail on its +x side
      // spar: square-ish, tapering from the hub (10 cm across) to the tip at exactly R, 8.5 cm deep at most
      m.push(0, 0, 0, 0, 0, 0, [1, 1, 0.85]);
      m.cyl(0.037 / Math.SQRT1_2, 0.05 / Math.SQRT1_2, R, SPAR, 0, R / 2, 0, 0, 45 * D, 0, 4);
      m.box(0.086, 0.07, 0.096, RED, 0, R - 0.035, 0); // painted tip
      m.pop();
      // canvas behind the lattice
      m.box(SW - 0.04, S1 - S0 - 0.02, 0.012, SAIL, 0.03 + SW / 2, (S0 + S1) / 2, -0.01);
      // lattice: outer bar, end bars and cross bars poking through the spar
      m.box(0.034, S1 - S0 + 0.026, 0.036, LATH, 0.03 + SW - 0.017, (S0 + S1) / 2, 0.004);
      for (let k = 0; k < 8; k++) {
        const y = S0 + (k / 7) * (S1 - S0), end = k === 0 || k === 7;
        m.box(SW + 0.09, end ? 0.034 : 0.024, end ? 0.032 : 0.026, k === 7 ? RED : LATH, 0.03 + SW / 2 - 0.045, y, 0.012);
      }
      m.pop();
    }
    // hub with a brass cap in front and a boss behind (same depth, so the bbox centre is the hub)
    m.cyl(0.16, 0.16, 0.12, HUB, 0, 0, 0, 90 * D, 0, 0, 10);
    for (const s of [1, -1]) {
      m.cyl(0.105, 0.105, 0.02, OAK, 0, 0, s * 0.07, 90 * D, 0, 0, 10);
      m.dome(0.085, GOLD, 0, 0, s * 0.08, 1, 0.45, 1, s * 90 * D, 0, 0, 10);
    }
    for (let k = 0; k < 4; k++) {
      const a = (k + 0.5) * Math.PI / 2;
      m.box(0.028, 0.028, 0.02, GOLD, Math.cos(a) * 0.128, Math.sin(a) * 0.128, 0.065, 0, 0, a);
    }
  },
});
