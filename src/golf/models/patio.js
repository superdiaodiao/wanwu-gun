// 后院 — scenery round the pool on the second course (a back garden at golden hour): the back of the
// house with its glowing windows, white picket fence sections, a sun lounger, a patio parasol and a
// kettle barbecue. Metres, base on y = 0, centred on x = z = 0, front faces +Z.
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
/** length, midpoint and rotation of the segment a → b */
function seg3(a, b) {
  const v = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  return [Math.hypot(v[0], v[1], v[2]), (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2, ...yTo(v)];
}
/** round rod from a to b */
function rod(m, a, b, r, col, seg = 6) {
  const [len, x, y, z, rx, ry, rz] = seg3(a, b);
  m.cyl(r, r, len, col, x, y, z, rx, ry, rz, seg);
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

// ================================================================================================
// 后院小楼 — the back of a two-storey clapboard house, seen from the garden (+Z)
// ================================================================================================
const H = {
  W: 10.6, ZF: 1.3, ZB: -2.3, // wall width (x), front and back wall faces (z)
  Y0: 0.35, YB: 2.95, YT: 5.4, // floor (top of the foundation), the band between storeys, top of the walls
  RISE: 1.3, OVER: 0.3, // roof: ridge height above the walls, overhang past the walls (x and along the slope)
};
H.ZC = (H.ZF + H.ZB) / 2;
H.YR = H.YT + H.RISE;

/** palette: siding, roof courses, shutters, window light, awning stripes */
const HOUSE = { siding: 0xadd0e8, roof: 0x5a6582, roof2: 0x46506a, shutter: 0x3e639a, lit: 0xffc867, awning: 0xff7a6b };

function house(m, P) {
    const siding = P.siding, line = shade(siding, 0.84), trim = 0xf7f5ef, roof = P.roof, roof2 = P.roof2;
    const shutter = P.shutter, shutterD = shade(shutter, 0.8), lit = P.lit, stone = 0xb9afa3;
    const wood = 0xc48a56, woodD = shade(wood, 0.78), brick = 0xb8634a;
    const { W, ZF, ZB, ZC, Y0, YB, YT, RISE, OVER, YR } = H, DEP = ZF - ZB, half = DEP / 2;

    // ---- walls, foundation, attic (gable ends) ----
    m.box(W + 0.12, Y0, DEP + 0.12, stone, 0, Y0 / 2, ZC);
    m.box(W, YT - Y0, DEP, siding, 0, (Y0 + YT) / 2, ZC);
    m.prism(DEP, RISE, W, siding, 0, YT + RISE / 2, ZC, 0, 90 * D, 0);
    // clapboard lines: front, both sides, and up the gable ends
    const rows = [];
    for (let y = Y0 + 0.22; y < YT - 0.05; y += 0.25) if (Math.abs(y - YB) > 0.14) rows.push(y);
    for (const y of rows) m.box(W, 0.035, 0.03, line, 0, y, ZF + 0.012);
    m.sym(s => {
      for (const y of rows) m.box(0.03, 0.035, DEP, line, s * (W / 2 + 0.012), y, ZC);
      for (let u = 0.22; u < RISE - 0.2; u += 0.25) m.box(0.03, 0.035, DEP * (1 - u / RISE) - 0.1, line, s * (W / 2 + 0.012), YT + u, ZC);
    });
    // white trim: corner boards and the band between the storeys
    for (const x of [-1, 1]) for (const z of [ZF, ZB]) m.box(0.18, YT - Y0 + 0.02, 0.18, trim, x * (W / 2 - 0.07), (Y0 + YT) / 2, z - Math.sign(z - ZC) * 0.07);
    m.box(W + 0.06, 0.16, DEP + 0.06, trim, 0, YB, ZC);

    // ---- roof: white boards under stepped slate courses; ridge cap, gutter and downspouts ----
    const ang = Math.atan2(RISE, half), L = Math.hypot(RISE, half) + OVER, WR = W + OVER * 2, t = 0.14;
    for (const s of [1, -1]) {
      m.push(0, YR, ZC, s * ang, 0, 0);
      m.box(WR, t, L + 0.04, trim, 0, t / 2, s * (L / 2 - 0.02));
      const n = Math.ceil(L / 0.32);
      for (let k = 0; k < n; k++) {
        const z0 = k * (L - 0.02) / n, z1 = Math.min(L - 0.02, z0 + (L - 0.02) / n + 0.05);
        m.box(WR - 0.12, 0.05, z1 - z0, k % 2 ? roof : roof2, 0, t + 0.02, s * (z0 + z1) / 2, s * 2.5 * D, 0, 0);
      }
      // two skylights on the garden side: warm glints on the big roof the camera looks down on
      if (s > 0) for (const x of [-1.7, 1.7]) {
        m.box(0.8, 0.12, 0.95, trim, x, t + 0.08, L * 0.42);
        m.glow(1).box(0.62, 0.06, 0.77, P.lit, x, t + 0.13, L * 0.42).glow(0);
      }
      m.pop();
    }
    m.box(WR + 0.02, 0.14, 0.36, roof2, 0, YR + t / Math.cos(ang) - 0.02, ZC);
    const zE = ZC + L * Math.cos(ang), yE = YR - L * Math.sin(ang);
    m.box(WR, 0.13, 0.14, trim, 0, yE - 0.06, zE + 0.02);
    m.sym(s => {
      m.box(0.1, 0.1, zE - ZF - 0.05, trim, s * (W / 2 - 0.3), yE - 0.08, (zE + ZF) / 2 + 0.03);
      m.box(0.1, yE - 0.3, 0.1, trim, s * (W / 2 - 0.3), (yE + 0.2) / 2, ZF + 0.08);
      m.box(0.14, 0.08, 0.26, trim, s * (W / 2 - 0.3), 0.12, ZF + 0.16);
    });
    // chimney astride the ridge, right side
    const cx = 3.3;
    const yc = YR + 0.55;
    m.box(0.76, yc - YT + 0.4, 0.62, brick, cx, (yc + YT - 0.4) / 2, ZC);
    for (const y of [yc - 0.38, yc - 0.18]) m.box(0.78, 0.04, 0.64, shade(brick, 0.82), cx, y, ZC);
    m.box(0.9, 0.12, 0.76, 0x6e6a66, cx, yc + 0.06, ZC);
    m.sym(s => m.cyl(0.08, 0.1, 0.18, 0xc77a4e, cx + s * 0.17, yc + 0.21, ZC, 0, 0, 0, 6));

    // ---- windows (wall face at local z = 0, facing local +Z) ----
    const win = (x, y, w, h, o = {}) => {
      m.box(w + 0.22, h + 0.22, 0.05, trim, x, y, 0.025);
      m.glow(1).box(w, h, 0.03, lit, x, y, 0.05).glow(0);
      m.box(0.055, h, 0.03, trim, x, y, 0.075);
      m.box(w, 0.055, 0.03, trim, x, y + (o.rail ?? 0), 0.075);
      m.box(w + 0.38, 0.07, 0.15, trim, x, y - h / 2 - 0.13, 0.075);
      m.box(w + 0.34, 0.1, 0.1, trim, x, y + h / 2 + 0.15, 0.05);
      if (o.shutters) {
        const sw = Math.min(0.46, w * 0.42);
        m.sym(s => {
          const sx = x + s * (w / 2 + 0.13 + sw / 2);
          m.box(sw, h + 0.12, 0.05, shutter, sx, y, 0.035);
          for (const k of [-1, 1]) m.box(sw - 0.1, 0.045, 0.02, shutterD, sx, y + k * h * 0.2, 0.065);
        });
      }
      if (o.flowers !== undefined) {
        const by = y - h / 2 - 0.34;
        m.box(w + 0.3, 0.24, 0.26, wood, x, by, 0.17);
        m.box(w + 0.36, 0.05, 0.3, woodD, x, by + 0.12, 0.17);
        m.ellipsoid(w * 0.52, 0.13, 0.13, 0x5cae4f, x, by + 0.17, 0.16, 0, 0, 0, 6);
        const bloom = [0xf47aa0, 0xffffff, 0xe8554a, 0xf6c945, 0xf47aa0];
        for (let i = 0; i < 5; i++) ball(m, 0.085, bloom[(i + (o.flowers | 0)) % 5], x + (i - 2) * w * 0.22, by + 0.26 + (i % 2) * 0.04, 0.2 + (i % 2) * 0.05);
      }
    };
    m.push(0, 0, ZF);
    // ground floor: sliding glass door between two windows
    win(-3.35, 1.85, 1.25, 1.3, { shutters: true, flowers: 0 });
    win(3.35, 1.85, 1.25, 1.3, { shutters: true, flowers: 2 });
    // upper floor: three windows
    win(-3.35, 4.3, 1.05, 1.25, { shutters: true, rail: 0.05 });
    win(0, 4.3, 1.05, 1.25, { shutters: true, rail: 0.05, flowers: 1 });
    win(3.35, 4.3, 1.05, 1.25, { shutters: true, rail: 0.05 });
    // sliding glass door
    const DW = 2.4, DH = 2.15, dy = Y0 + DH / 2;
    m.box(DW + 0.26, DH + 0.13, 0.05, trim, 0, Y0 + (DH + 0.13) / 2, 0.025);
    m.glow(1).box(DW, DH, 0.03, lit, 0, dy, 0.05).glow(0);
    m.box(DW, 0.1, 0.04, trim, 0, Y0 + DH - 0.05, 0.08);
    m.box(DW, 0.12, 0.04, trim, 0, Y0 + 0.06, 0.08);
    for (const x of [-DW / 2 + 0.05, -0.04, 0.04, DW / 2 - 0.05]) m.box(0.1, DH, 0.04, trim, x, dy, x > 0 && x < 0.1 ? 0.1 : 0.08);
    m.box(0.04, 0.24, 0.04, 0x55585e, 0.14, dy, 0.12);
    m.box(0.42, DH - 0.24, 0.02, 0xf4e6cf, -DW / 2 + 0.3, dy + 0.02, 0.072); // curtain drawn to the side
    m.box(DW + 0.4, 0.11, 0.1, trim, 0, Y0 + DH + 0.17, 0.05);
    // striped awning over the door, scalloped front edge
    const AW = 3.0, AN = 10, AP = 0.78, AD = 0.34, ay = YB - 0.12, aang = Math.atan2(AD, AP), alen = Math.hypot(AP, AD) + 0.03;
    m.push(0, ay, 0.02, aang, 0, 0);
    for (let i = 0; i < AN; i++) m.box(AW / AN, 0.03, alen, i % 2 ? trim : P.awning, -AW / 2 + (i + 0.5) * AW / AN, 0, alen / 2);
    m.pop();
    const fy = ay - AD - 0.02, fz = AP + 0.04, flaps = [[], []];
    for (let i = 0; i < AN; i++) {
      const x0 = -AW / 2 + i * AW / AN, x1 = x0 + AW / AN, xm = (x0 + x1) / 2, r = (x1 - x0) / 2;
      const ring = [[x0, fy], [x0, fy - 0.1]];
      for (let k = 1; k < 4; k++) ring.push([xm - Math.cos(Math.PI * k / 4) * r, fy - 0.1 - Math.sin(Math.PI * k / 4) * 0.08]);
      ring.push([x1, fy - 0.1], [x1, fy]);
      for (let k = 0; k < ring.length - 1; k++) flaps[i % 2].push([xm, fy, fz], [ring[k][0], ring[k][1], fz], [ring[k + 1][0], ring[k + 1][1], fz]);
    }
    tris(m, flaps[0], P.awning, true);
    tris(m, flaps[1], trim, true);
    m.sym(s => bar(m, [s * (AW / 2 - 0.08), ay - 0.5, 0.02], [s * (AW / 2 - 0.08), fy + 0.02, fz - 0.04], 0.04, trim));
    // porch lamp
    m.box(0.16, 0.26, 0.12, 0x34363c, 1.75, 2.15, 0.08);
    m.glow(1).box(0.12, 0.18, 0.13, 0xffd27a, 1.75, 2.13, 0.09).glow(0);
    m.pop();
    // side windows (one per floor) and round attic windows on the gable ends
    m.sym(s => {
      m.push(s * W / 2, 0, ZC, 0, s * 90 * D, 0);
      win(0, 4.3, 0.9, 1.1, {});
      win(0, 1.85, 0.9, 1.1, {});
      m.cyl(0.3, 0.3, 0.06, trim, 0, YT + 0.55, 0.03, 90 * D, 0, 0, 10);
      m.glow(1).cyl(0.21, 0.21, 0.04, lit, 0, YT + 0.55, 0.05, 90 * D, 0, 0, 10).glow(0);
      m.box(0.42, 0.04, 0.03, trim, 0, YT + 0.55, 0.08);
      m.pop();
    });

    // ---- wooden deck and step outside the glass door; mat, potted plant, two hydrangeas ----
    const DD = 0.9, DXW = 3.6;
    m.box(DXW, Y0 - 0.05, DD, woodD, 0, (Y0 - 0.05) / 2, ZF + DD / 2);
    m.jitter(0.06);
    for (let i = 0; i < 5; i++) m.box(DXW, 0.06, DD / 5 - 0.015, wood, 0, Y0 - 0.03, ZF + (i + 0.5) * DD / 5);
    m.box(2.2, 0.17, 0.32, wood, 0, 0.085, ZF + DD + 0.16);
    m.jitter(0);
    m.box(1.1, 0.02, 0.5, 0xff7a6b, 0, Y0 + 0.01, ZF + 0.33);
    m.cyl(0.2, 0.15, 0.36, 0xd0784a, -1.45, Y0 + 0.18, ZF + 0.42, 0, 0, 0, 8);
    ball(m, 0.32, 0x4f9f48, -1.45, Y0 + 0.58, ZF + 0.42, 1, 1.15, 1);
    m.sym(s => {
      const x = s * 2.6, z = ZF + 0.38, leaf = 0x4f9f48;
      for (const dx of [-0.42, 0, 0.42]) m.sphere(dx ? 0.36 : 0.44, dx ? shade(leaf, 0.92) : leaf, x + dx, dx ? 0.31 : 0.38, z + (dx ? -0.02 : 0.04), 1, 0.85, 0.9, 0, 0, 0, 6);
      const fl = s > 0 ? 0x8fa8f0 : 0xf3a0c4;
      for (let i = 0; i < 4; i++) ball(m, 0.17, i % 2 ? fl : shade(fl, 0.9), x + (i - 1.5) * 0.28, 0.66 - Math.abs(i - 1.5) * 0.08, z + 0.2 + (i % 2) * 0.1, 1, 0.9, 1);
    });
}

def('house_back', {
  name: '后院小楼',
  cat: 'building',
  sfx: 'wood',
  fill: 0.75,
  build(m) { house(m, HOUSE); },
});

// ================================================================================================
// 白栅栏 — one 2 m section of white picket fence; its post is at x = −1 only, so sections chain
// ================================================================================================
def('fence_picket', {
  name: '白栅栏',
  cat: 'street',
  sfx: 'wood',
  fill: 0.35,
  shape: 'box',
  build(m) {
    const white = 0xf6f4ee, rail = 0xe6e2d8;
    // post with a pyramid cap
    m.box(0.1, 0.96, 0.1, white, -1.0, 0.48, 0);
    m.box(0.13, 0.04, 0.13, white, -1.0, 0.96, 0);
    m.cone(0.088, 0.07, white, -1.0, 1.015, 0, 0, 45 * D, 0, 4);
    // two rails behind the pickets
    for (const y of [0.24, 0.7]) m.box(2.0, 0.08, 0.04, rail, 0, y, -0.01);
    // pickets with pointed tops
    m.jitter(0.025);
    for (let i = 0; i < 9; i++) {
      const x = -0.8 + i * 0.2;
      m.box(0.085, 0.83, 0.025, white, x, 0.05 + 0.415, 0.025);
      m.prism(0.085, 0.075, 0.025, white, x, 0.88 + 0.0375, 0.025);
    }
    m.jitter(0);
  },
});

// ================================================================================================
// 躺椅 — pool sun lounger, backrest raised at the −Z end, striped cushion, folded towel
// ================================================================================================
def('lounger', {
  name: '躺椅',
  cat: 'daily',
  sfx: 'soft',
  fill: 0.35,
  build(m) {
    const frame = 0xf4f4f0, frameD = 0xdcdcd6, teal = 0x2fb3b0, cream = 0xf8f4ea, coral = 0xff7a6b, tire = 0x5b5f66;
    const HW = 0.29, Y = 0.3, ZH = -0.38, ZT = 0.93; // half width of the frame, rail height, seat from ZH to ZT
    // frame: side rails, cross bars, legs (feet at the foot end, wheels at the head end)
    m.sym(s => {
      m.box(0.05, 0.07, ZT - ZH + 0.06, frame, s * HW, Y, (ZH + ZT) / 2);
      m.box(0.05, Y, 0.05, frame, s * HW, Y / 2, ZT - 0.04);
      m.box(0.07, 0.03, 0.09, frameD, s * HW, 0.015, ZT - 0.04);
      m.box(0.05, Y - 0.08, 0.05, frame, s * HW, Y / 2 + 0.04, ZH + 0.05);
      m.cyl(0.085, 0.085, 0.045, tire, s * (HW + 0.02), 0.085, ZH + 0.05, 0, 0, 90 * D, 10);
      m.cyl(0.04, 0.04, 0.05, frame, s * (HW + 0.025), 0.085, ZH + 0.05, 0, 0, 90 * D, 6);
    });
    m.box(HW * 2 + 0.05, 0.05, 0.05, frame, 0, Y, ZT);
    m.box(HW * 2 + 0.05, 0.05, 0.05, frame, 0, Y, ZH);
    m.box(HW * 2, 0.04, 0.04, frame, 0, Y - 0.16, ZT - 0.04);
    // striped seat cushion
    const n = 8, cl = (ZT - ZH) / n;
    for (let i = 0; i < n; i++) m.box(0.6, 0.08, cl, i % 2 ? cream : teal, 0, Y + 0.075, ZH + (i + 0.5) * cl);
    m.cyl(0.04, 0.04, 0.6, teal, 0, Y + 0.075, ZT, 0, 0, 90 * D, 8);
    // backrest raised about 42°, hinged at the head of the seat
    const BL = 0.7, th = 40 * D;
    m.push(0, Y + 0.035, ZH, th, 0, 0);
    m.sym(s => m.box(0.05, 0.05, BL, frame, s * HW, 0, -BL / 2));
    m.box(HW * 2 + 0.05, 0.05, 0.05, frame, 0, 0, -BL + 0.02);
    const nb = 4, bl = BL / nb;
    for (let i = 0; i < nb; i++) m.box(0.6, 0.08, bl, i % 2 ? teal : cream, 0, 0.04, -(i + 0.5) * bl);
    m.cyl(0.045, 0.045, 0.6, cream, 0, 0.05, -BL + 0.02, 0, 0, 90 * D, 8);
    m.pop();
    // prop under the backrest
    const yb = Y + 0.035 + Math.sin(th) * 0.45, zb = ZH - Math.cos(th) * 0.45;
    m.sym(s => bar(m, [s * (HW - 0.04), Y, ZH + 0.02], [s * (HW - 0.04), yb - 0.03, zb], 0.035, frameD));
    // folded towel at the foot end
    m.box(0.44, 0.035, 0.3, coral, 0.02, Y + 0.13, ZT - 0.27, 0, 0.12, 0);
    m.box(0.44, 0.035, 0.3, coral, 0.02, Y + 0.165, ZT - 0.27, 0, 0.08, 0);
    for (const dx of [-0.13, 0.13]) m.box(0.05, 0.072, 0.305, cream, 0.02 + dx, Y + 0.148, ZT - 0.27, 0, 0.1, 0);
  },
});

// ================================================================================================
// 遮阳伞 — patio parasol: eight coral and white panels, scalloped valance, wooden pole, round base
// ================================================================================================
def('parasol', {
  name: '遮阳伞',
  cat: 'daily',
  sfx: 'soft',
  fill: 0.25,
  build(m) {
    const coral = 0xff7a6b, white = 0xfaf6ee, pole = 0xc9965f, base = 0x6a6e76;
    const N = 8, R = 1.19, prof = [[0, 2.2], [0.46, 2.1], [0.85, 1.93], [R, 1.75]];
    const P = (i, j) => {
      const a = (i / N) * Math.PI * 2 + Math.PI / N, [r, y] = prof[j];
      return [Math.sin(a) * r, y, Math.cos(a) * r];
    };
    for (let i = 0; i < N; i++) {
      const col = i % 2 ? white : coral, pts = [];
      for (let j = 0; j < prof.length - 1; j++) {
        if (j === 0) pts.push(P(i, 0), P(i, 1), P(i + 1, 1));
        else pts.push(...quad(P(i, j), P(i, j + 1), P(i + 1, j + 1), P(i + 1, j)));
      }
      // upside: faces outward/up; underside slightly darker
      tris(m, pts, col);
      const under = [];
      for (let k = 0; k < pts.length; k += 3) under.push(pts[k], pts[k + 2], pts[k + 1]);
      tris(m, under, shade(col, 0.82));
      // scalloped valance hanging from the rim between the two rib tips: three scallops
      const a = P(i, prof.length - 1), b = P(i + 1, prof.length - 1), val = [], ns = 3, steps = 3;
      for (let k = 0; k < ns; k++) {
        for (let q = 0; q < steps; q++) {
          const u0 = (k + q / steps) / ns, u1 = (k + (q + 1) / steps) / ns;
          const d0 = 0.07 + 0.07 * Math.sin(Math.PI * q / steps), d1 = 0.07 + 0.07 * Math.sin(Math.PI * (q + 1) / steps);
          const L = (u, dy) => [a[0] + (b[0] - a[0]) * u, a[1] - dy, a[2] + (b[2] - a[2]) * u];
          val.push(...quad(L(u0, 0), L(u0, d0), L(u1, d1), L(u1, 0)));
        }
      }
      tris(m, val, col, true);
    }
    // finial, pole with the runner and struts, round weighted base
    m.cyl(0.035, 0.05, 0.07, white, 0, 2.225, 0, 0, 0, 0, 6);
    ball(m, 0.042, pole, 0, 2.27, 0);
    m.cyl(0.036, 0.036, 2.12, pole, 0, 1.12, 0, 0, 0, 0, 8);
    m.cyl(0.052, 0.052, 0.1, white, 0, 1.62, 0, 0, 0, 0, 8);
    for (let i = 0; i < N; i++) {
      const p = P(i, 2);
      rod(m, [0, 1.64, 0], [p[0] * 0.98, p[1] - 0.02, p[2] * 0.98], 0.011, white, 4);
    }
    m.box(0.03, 0.1, 0.03, 0x55585e, 0.045, 1.35, 0); // crank
    m.cyl(0.3, 0.32, 0.07, base, 0, 0.035, 0, 0, 0, 0, 12);
    m.dome(0.27, shade(base, 1.12), 0, 0.07, 0, 1, 0.35, 1, 0, 0, 0, 12);
    m.cyl(0.05, 0.06, 0.12, base, 0, 0.18, 0, 0, 0, 0, 8);
  },
});

// ================================================================================================
// 烧烤炉 — red kettle barbecue: bowl and domed lid, three legs (two on wheels), side shelf, spatula
// ================================================================================================
def('bbq_grill', {
  name: '烧烤炉',
  cat: 'daily',
  sfx: 'metal',
  fill: 0.35,
  build(m) {
    const red = 0xe0423a, redD = shade(red, 0.78), black = 0x2a2b30, steel = 0xb8bcc2, wood = 0xb07a4f, tire = 0x26272b;
    const YR = 0.64, RR = 0.3; // rim height and radius
    // bowl and lid
    m.lathe([[0, YR - 0.28], [0.13, YR - 0.265], [0.22, YR - 0.22], [0.275, YR - 0.13], [RR, YR - 0.03], [RR, YR]], red, 0, 0, 0, 0, 0, 0, 12);
    m.cyl(RR + 0.012, RR + 0.012, 0.04, redD, 0, YR, 0, 0, 0, 0, 12);
    m.lathe([[RR, YR + 0.02], [0.296, YR + 0.07], [0.265, YR + 0.15], [0.2, YR + 0.22], [0.11, YR + 0.265], [0, YR + 0.28]], red, 0, 0, 0, 0, 0, 0, 12);
    // lid handle, vent, thermometer; bowl handles each side
    m.sym(s => m.box(0.03, 0.08, 0.03, steel, s * 0.07, YR + 0.3, 0.06));
    m.box(0.2, 0.045, 0.05, black, 0, YR + 0.345, 0.06);
    m.cyl(0.05, 0.055, 0.025, steel, 0, YR + 0.285, -0.08, 0, 0, 0, 8);
    m.cyl(0.04, 0.04, 0.025, 0xf4f2ec, 0, YR + 0.2, 0.235, 52 * D, 0, 0, 10);
    m.box(0.006, 0.03, 0.006, red, 0.008, YR + 0.208, 0.25, 52 * D, 0, -0.6);
    m.sym(s => {
      m.box(0.05, 0.04, 0.03, steel, s * 0.315, YR - 0.05, 0);
      m.box(0.035, 0.035, 0.16, black, s * 0.345, YR - 0.05, 0);
    });
    // three legs: one at the front, two at the back on wheels with an axle
    const legs = [0, 135, -135].map(a => [Math.sin(a * D), Math.cos(a * D)]);
    for (const [sx, sz] of legs) rod(m, [sx * 0.19, YR - 0.2, sz * 0.19], [sx * 0.32, 0.07, sz * 0.32], 0.02, steel, 6);
    m.cyl(0.03, 0.03, 0.04, black, legs[0][0] * 0.32, 0.03, legs[0][1] * 0.32, 0, 0, 0, 6);
    const wz = legs[1][1] * 0.32, wx = legs[1][0] * 0.32;
    rod(m, [-wx - 0.02, 0.08, wz], [wx + 0.02, 0.08, wz], 0.012, steel, 5);
    m.sym(s => {
      m.cyl(0.08, 0.08, 0.04, tire, s * (wx + 0.03), 0.08, wz, 0, 0, 90 * D, 12);
      m.cyl(0.035, 0.035, 0.045, steel, s * (wx + 0.03), 0.08, wz, 0, 0, 90 * D, 6);
    });
    // ash pan under the bowl and a wire ring tying the legs together
    m.cyl(0.11, 0.08, 0.07, steel, 0, 0.3, 0, 0, 0, 0, 10);
    for (let k = 0; k < 3; k++) {
      const a = legs[k], b = legs[(k + 1) % 3], r = 0.272;
      rod(m, [a[0] * r, 0.3, a[1] * r], [b[0] * r, 0.3, b[1] * r], 0.008, steel, 4);
    }
    // side shelf on +X with a spatula on it
    m.box(0.34, 0.03, 0.28, wood, 0.47, YR - 0.03, 0);
    m.sym(s => bar(m, [0.21, YR - 0.18, s * 0.1], [0.58, YR - 0.05, s * 0.1], 0.02, steel));
    m.box(0.03, 0.012, 0.18, black, 0.46, YR - 0.007, 0.07, 0, 0.25, 0);
    m.box(0.08, 0.008, 0.1, steel, 0.49, YR - 0.009, -0.06, 0, 0.25, 0);
    m.box(0.012, 0.012, 0.05, steel, 0.475, YR - 0.009, -0.003, 0, 0.25, 0);
  },
});
