// 自然 · nature: trees, plants, rocks, farm straw, hills, mountains and clouds.
// Stylised low-poly with a 山水 (Chinese landscape painting) feel: clustered faceted canopies with
// jittered colours, soft mineral greens, recognisable species silhouettes. Mountains are hexagonal
// lattice surfaces of revolution pushed by seeded noise and painted per face by height and slope.
import * as THREE from 'three';
import { def } from './registry.js';
import { D, shade, mix, lodSwap } from '../core/modeler.js';
import { decal, fitText, FONTS } from '../core/atlas.js';

// ---- noise (seeded 3D value noise) ----------------------------------------------------------------
function hash3(x, y, z, s) {
  let h = Math.imul(x, 0x27d4eb2d) ^ Math.imul(y, 0x165667b1) ^ Math.imul(z, 0x1b873593) ^ Math.imul(s + 0x9e37, 0x2c1b3c6d);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
const fade = t => t * t * (3 - 2 * t);
function noise3(x, y, z, s = 0) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const u = fade(x - xi), v = fade(y - yi), w = fade(z - zi);
  const c = (a, b, d) => hash3(xi + a, yi + b, zi + d, s);
  const a0 = c(0, 0, 0) + (c(1, 0, 0) - c(0, 0, 0)) * u, a1 = c(0, 1, 0) + (c(1, 1, 0) - c(0, 1, 0)) * u;
  const b0 = c(0, 0, 1) + (c(1, 0, 1) - c(0, 0, 1)) * u, b1 = c(0, 1, 1) + (c(1, 1, 1) - c(0, 1, 1)) * u;
  const p = a0 + (a1 - a0) * v, q = b0 + (b1 - b0) * v;
  return p + (q - p) * w;
}
/** fractal noise, ~0..1 around 0.5 */
function fbm(x, y, z, s = 0, oct = 3) {
  let a = 0.5, f = 1, sum = 0, n = 0;
  for (let i = 0; i < oct; i++) { sum += a * noise3(x * f, y * f, z * f, s + i * 17); n += a; a *= 0.5; f *= 2.03; }
  return sum / n;
}
/** ridged noise 0..1: sharp crests (mountain ridges) */
function ridged(x, y, z, s = 0, oct = 3) {
  let a = 0.5, f = 1, sum = 0, n = 0;
  for (let i = 0; i < oct; i++) {
    const v = 1 - Math.abs(noise3(x * f, y * f, z * f, s + i * 31) * 2 - 1);
    sum += a * v * v; n += a; a *= 0.5; f *= 2.1;
  }
  return sum / n;
}
const clamp01 = x => (x < 0 ? 0 : x > 1 ? 1 : x);
const sstep = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };

// ---- colour helpers ---------------------------------------------------------------------------------
/** per-face colour: fn is evaluated once per triangle (at its first vertex) so facets stay crisp */
function perFace(fn) {
  let i = 0, c = 0;
  return (x, y, z, nx, ny, nz) => { if (i++ % 3 === 0) c = fn(x, y, z, nx, ny, nz); return c; };
}
/** like perFace, but one colour per quad (two consecutive triangles) — for subdivided boxes */
function perQuad(fn) {
  let i = 0, c = 0;
  return (x, y, z, nx, ny, nz) => { if (i++ % 6 === 0) c = fn(x, y, z, nx, ny, nz); return c; };
}
/** colours precomputed per triangle */
function faceList(list) { let i = 0; return () => list[(i++ / 3) | 0]; }
/** leafy / stony facets: one tone per part, small per-face variation, a little lighter on top */
function speck(m, base, amt = 0.06, top = 0.1, part = 0.08) {
  const k = 1 + (m.rng.r() * 2 - 1) * part;
  return perFace((x, y, z, nx, ny) => shade(base, k * (1 + (m.rng.r() * 2 - 1) * amt) * (1 - top * 0.4 + top * ny)));
}

// ---- geometry helpers --------------------------------------------------------------------------------
const ICO = [0, 1, 2].map(d => new THREE.IcosahedronGeometry(1, d));
const DOD = new THREE.DodecahedronGeometry(1, 0);
// cushion: flat-bottomed, domed-top foliage pad (pine tiers, lily clumps)
const cushion = src => {
  const g = src.clone();
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const y = p.getY(i); p.setY(i, y > 0 ? y * 0.5 : y * 0.2); }
  g.computeVertexNormals();
  return g;
};
const PAD = cushion(ICO[1]);
// far-away stand-ins use the next coarser sphere
lodSwap(ICO[2], ICO[1]);
lodSwap(ICO[1], ICO[0]);
lodSwap(PAD, cushion(ICO[0]));
// double-sided leaf / petal with a folded midrib; base at the origin, tip at +Y, face ±Z
const LEAF = (() => {
  const L = [0, 0, 0], R = [0.5, 0.36, -0.14], T = [0, 1, 0], Q = [-0.5, 0.36, -0.14];
  const tri = [L, R, T, L, T, Q, L, T, R, L, Q, T];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(tri.flat(), 3));
  g.computeVertexNormals();
  return g;
})();
// broad leaf (sunflower, lotus bud sheath): 6 fan triangles per side
const BROAD = (() => {
  const ring = [[0.36, 0.16], [0.5, 0.45], [0.34, 0.78], [0, 1], [-0.34, 0.78], [-0.5, 0.45], [-0.36, 0.16]];
  const v = [];
  for (let i = 0; i < ring.length - 1; i++) {
    const a = [ring[i][0], ring[i][1], -Math.abs(ring[i][0]) * 0.22], b = [ring[i + 1][0], ring[i + 1][1], -Math.abs(ring[i + 1][0]) * 0.22];
    v.push([0, 0, 0], a, b, [0, 0, 0], b, a);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(v.flat(), 3));
  g.computeVertexNormals();
  return g;
})();
// grass blade bending towards +Z, double-sided (6 tris)
const BLADE = (() => {
  const bl = [-0.5, 0, 0], br = [0.5, 0, 0], ml = [-0.32, 0.55, 0.14], mr = [0.32, 0.55, 0.14], t = [0, 1, 0.42];
  const f = [bl, br, mr, bl, mr, ml, ml, mr, t];
  const b = [bl, mr, br, bl, ml, mr, ml, t, mr];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([...f, ...b].flat(), 3));
  g.computeVertexNormals();
  return g;
})();

const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _e = new THREE.Euler();
const _up = new THREE.Vector3(0, 1, 0), _dv = new THREE.Vector3();
/** Euler (XYZ) turning local +Y towards (dx, dy, dz), then rolled about that axis */
function orient(dx, dy, dz, roll = 0) {
  _dv.set(dx, dy, dz).normalize();
  _q.setFromUnitVectors(_up, _dv);
  if (roll) _q.multiply(_q2.setFromAxisAngle(_up, roll));
  _e.setFromQuaternion(_q, 'XYZ');
  return [_e.x, _e.y, _e.z];
}

/** foliage / stone blob: rotated at random (only about Y when stretched) */
function blob(m, r, col, x, y, z, sx = 1, sy = 1, sz = 1, g = ICO[1]) {
  const round = sx === sy && sy === sz;
  const rx = round ? m.rng.angle() : 0, ry = m.rng.angle(), rz = round ? m.rng.angle() : 0;
  m.geo(g, col, x, y, z, rx, ry, rz, r * sx, r * sy, r * sz);
}

/** straight tapered rod from a to b (cylinder aligned to the segment) */
function limb(m, a, b, rA, rB, col, seg = 6) {
  const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
  const [rx, ry, rz] = orient(dx, dy, dz);
  m.cyl(rB, rA, Math.hypot(dx, dy, dz), col, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2, rx, ry, rz, seg);
}

/** leaf/petal from base point (x, y, z) pointing along dir, length L, width W */
function leaf(m, g, col, x, y, z, dir, L, W, roll = 0) {
  const [rx, ry, rz] = orient(dir[0], dir[1], dir[2], roll);
  m.geo(g, col, x, y, z, rx, ry, rz, W, L, W);
}

/** emit triangles T (index triples into points P) with one colour per face from paint(cx,cy,cz,nx,ny,nz,i) */
function meshOut(m, P, T, paint) {
  const pos = new Float32Array(T.length * 9), nor = new Float32Array(T.length * 9), cols = new Array(T.length);
  for (let i = 0; i < T.length; i++) {
    const a = P[T[i][0]], b = P[T[i][1]], c = P[T[i][2]];
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz) || 1;
    nx /= l; ny /= l; nz /= l;
    pos.set(a, i * 9); pos.set(b, i * 9 + 3); pos.set(c, i * 9 + 6);
    for (let k = 0; k < 3; k++) { nor[i * 9 + k * 3] = nx; nor[i * 9 + k * 3 + 1] = ny; nor[i * 9 + k * 3 + 2] = nz; }
    cols[i] = paint((a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3, (a[2] + b[2] + c[2]) / 3, nx, ny, nz, i);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  m.geo(g, faceList(cols));
}

/** points + triangles of a (non-indexed) three geometry, each vertex mapped through f([x,y,z]) → [x,y,z] */
function mapped(g, f) {
  const p = g.attributes.position, P = [], T = [];
  for (let i = 0; i < p.count; i++) P.push(f([p.getX(i), p.getY(i), p.getZ(i)]));
  for (let i = 0; i + 2 < p.count; i += 3) T.push([i, i + 1, i + 2]);
  return { P, T };
}

/** lumpy stone/cloud part: geometry g scaled by (sx,sy,sz), pushed by a noise field, placed at (x,y,z) */
function lump(g, amp, freq, seed, x, y, z, sx, sy, sz, ry = 0, floor = -Infinity) {
  const c = Math.cos(ry), s = Math.sin(ry);
  return mapped(g, ([px, py, pz]) => {
    const k = 1 + amp * (fbm(px * freq + seed, py * freq, pz * freq, seed, 3) - 0.5) * 2;
    const lx = px * sx * k, ly = py * sy * k, lz = pz * sz * k;
    return [x + lx * c + lz * s, Math.max(floor, y + ly), z - lx * s + lz * c];
  });
}

/**
 * Tapered tube along a smooth curve through pts, radius r(t) (or [r0, r1]), seg sides, N rings.
 * Closed with end caps; col may be a per-vertex function.
 */
function taper(m, pts, r, col, seg = 6, N = 0, caps = true, warp = null) {
  const curve = new THREE.CatmullRomCurve3(pts.map(p => new THREE.Vector3(p[0], p[1], p[2])));
  N = N || Math.max(2, (pts.length - 1) * 2);
  const fr = curve.computeFrenetFrames(N, false);
  const R = typeof r === 'function' ? r : t => r[0] + (r[1] - r[0]) * t;
  const P = [], T = [], C = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N, c = curve.getPointAt(t), rr = R(t), n = fr.normals[i], b = fr.binormals[i];
    C.push([c.x, c.y, c.z]);
    for (let j = 0; j < seg; j++) {
      const a = (j / seg) * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
      P.push([c.x + rr * (ca * n.x + sa * b.x), c.y + rr * (ca * n.y + sa * b.y), c.z + rr * (ca * n.z + sa * b.z)]);
    }
  }
  const out = (a, b, c, h) => { // orient so the face normal points along h
    const A = P[a], B = P[b], Cc = P[c];
    const ux = B[0] - A[0], uy = B[1] - A[1], uz = B[2] - A[2], vx = Cc[0] - A[0], vy = Cc[1] - A[1], vz = Cc[2] - A[2];
    const d = (uy * vz - uz * vy) * h[0] + (uz * vx - ux * vz) * h[1] + (ux * vy - uy * vx) * h[2];
    T.push(d >= 0 ? [a, b, c] : [a, c, b]);
  };
  for (let i = 0; i < N; i++) for (let j = 0; j < seg; j++) {
    const a = i * seg + j, b = i * seg + (j + 1) % seg, c = a + seg, d = b + seg;
    const h = [P[a][0] - C[i][0], P[a][1] - C[i][1], P[a][2] - C[i][2]];
    out(a, b, d, h); out(a, d, c, h);
  }
  if (caps) {
    const c0 = P.length; P.push(C[0]);
    const c1 = P.length; P.push(C[N]);
    const h0 = [C[0][0] - C[1][0], C[0][1] - C[1][1], C[0][2] - C[1][2]];
    const h1 = [C[N][0] - C[N - 1][0], C[N][1] - C[N - 1][1], C[N][2] - C[N - 1][2]];
    for (let j = 0; j < seg; j++) {
      out(c0, j, (j + 1) % seg, h0);
      out(c1, N * seg + j, N * seg + (j + 1) % seg, h1);
    }
  }
  const W = warp ? P.map(warp) : P;
  const pos = [];
  for (const t of T) pos.push(...W[t[0]], ...W[t[1]], ...W[t[2]]);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  m.geo(g, col);
}

/**
 * Surface of revolution on a hexagonal lattice: K rings → 6·K² near-equal triangles (+ 6K bottom cap).
 * prof: [[rho, y], ...] from the summit (rho 0) down to the rim (y 0), resampled by arc length.
 * disp(p, n, u, th) → displacement along the outward normal n (u: 0 summit … 1 rim, th: azimuth).
 * Returns { P, T } with every point at y ≥ 0 and the rim on y = 0.
 */
function hexRevolve(K, prof, disp, place = null) {
  const L = [0];
  for (let i = 1; i < prof.length; i++) L.push(L[i - 1] + Math.hypot(prof[i][0] - prof[i - 1][0], prof[i][1] - prof[i - 1][1]));
  const total = L[L.length - 1];
  const sample = s => {
    s = Math.max(0, Math.min(total, s));
    let j = 0;
    while (j < prof.length - 2 && L[j + 1] < s) j++;
    const t = (s - L[j]) / (L[j + 1] - L[j] || 1);
    return [prof[j][0] + (prof[j + 1][0] - prof[j][0]) * t, prof[j][1] + (prof[j + 1][1] - prof[j][1]) * t];
  };
  const eps = total / (K * 3);
  const P = [], plan = [], index = new Map();
  const add = (q, r, u, th) => {
    const s = u * total, [rho, y] = sample(s);
    let nr = 0, ny = 1;
    if (u > 0) {
      const a = sample(s - eps), b = sample(s + eps);
      const tx = b[0] - a[0], ty = b[1] - a[1], l = Math.hypot(tx, ty) || 1;
      nr = -ty / l; ny = tx / l;
    }
    const ct = Math.cos(th), st = Math.sin(th);
    const p = [rho * ct, y, rho * st], n = [nr * ct, ny, nr * st];
    let v;
    if (place) v = place(p, n, u, th);
    else { const d = disp(p, n, u, th); v = [p[0] + n[0] * d, Math.max(0, p[1] + n[1] * d), p[2] + n[2] * d]; }
    if (u >= 1) v[1] = 0;
    index.set(q * 4096 + r, P.length);
    P.push(v);
    plan.push([u * ct, u * st]);
  };
  const C = [[1, 0], [0, 1], [-1, 1], [-1, 0], [0, -1], [1, -1]];
  add(0, 0, 0, 0);
  for (let k = 1; k <= K; k++)
    for (let s = 0; s < 6; s++)
      for (let i = 0; i < k; i++) {
        const a = C[s], b = C[(s + 1) % 6];
        add(a[0] * k + (b[0] - a[0]) * i, a[1] * k + (b[1] - a[1]) * i, k / K, (s + i / k) * Math.PI / 3);
      }
  const T = [];
  const get = (q, r) => index.get(q * 4096 + r);
  const tri = (a, b, c) => {
    if (a === undefined || b === undefined || c === undefined) return;
    const A = plan[a], B = plan[b], Cc = plan[c];
    const cr = (B[1] - A[1]) * (Cc[0] - A[0]) - (B[0] - A[0]) * (Cc[1] - A[1]);
    T.push(cr > 0 ? [a, b, c] : [a, c, b]);
  };
  for (let q = -K; q <= K; q++)
    for (let r = -K; r <= K; r++) {
      tri(get(q, r), get(q + 1, r), get(q, r + 1));
      tri(get(q + 1, r), get(q + 1, r + 1), get(q, r + 1));
    }
  // bottom cap: fan from the centre of the rim, facing down
  const rim0 = 1 + 3 * K * (K - 1), n = 6 * K;
  const cx = P.slice(rim0).reduce((s, p) => s + p[0], 0) / n, cz = P.slice(rim0).reduce((s, p) => s + p[2], 0) / n;
  const c = P.length;
  P.push([cx, 0, cz]);
  for (let i = 0; i < n; i++) T.push([c, rim0 + i, rim0 + (i + 1) % n]);
  return { P, T };
}

/** scale points in place so the bounding box is W wide (x) and H tall, centred on x = z = 0 */
function fitTo(P, W, H) {
  let x0 = Infinity, x1 = -Infinity, y1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const p of P) { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]); z0 = Math.min(z0, p[2]); z1 = Math.max(z1, p[2]); }
  const k = W / (x1 - x0), ky = H / y1, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  for (const p of P) { p[0] = (p[0] - cx) * k; p[1] *= ky; p[2] = (p[2] - cz) * k; }
  return { k, ky, cx, cz };
}

/**
 * Height-field mountain y = hf(x, z) on the hexagonal lattice (6K² faces + cap). Rings are spaced by the
 * arc length of the mean radial profile, so steep flanks get as many facets as gentle tops.
 */
function hexField(K, R, hf, wob = 0.12) {
  const prof = [];
  for (let i = 0; i <= 48; i++) {
    const rho = (i / 48) * R;
    let s = 0;
    for (let j = 0; j < 32; j++) { const a = (j / 32) * Math.PI * 2; s += Math.max(0, hf(Math.cos(a) * rho, Math.sin(a) * rho)); }
    prof.push([rho, i === 48 ? 0 : s / 32]);
  }
  // irregular footprint: the plan is stretched by a smooth function of the azimuth; heights fade out at the rim
  return hexRevolve(K, prof, null, (p, n, u, th) => {
    const f = 1 + wob * (fbm(Math.cos(th) * 1.3 + 5, Math.sin(th) * 1.3, 0, 83, 2) - 0.5) * 2, x = p[0] * f, z = p[2] * f;
    return [x, Math.max(0, hf(x, z)) * (1 - sstep(0.8, 1, u)), z];
  });
}
/** stretch a disc's plan by a smooth function of the azimuth (irregular footprints) */
function wobble(P, amp, seed) {
  for (const p of P) {
    const a = Math.atan2(p[2], p[0]), f = 1 + amp * (fbm(Math.cos(a) * 1.3 + seed, Math.sin(a) * 1.3, 0, 83, 2) - 0.5) * 2;
    p[0] *= f; p[2] *= f;
  }
}
/** smooth maximum (rounded saddles between peaks) */
const smax = (a, b, k) => { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.max(a, b) + h * h * k * 0.25; };
const spow = (x, p) => Math.sign(x) * Math.pow(Math.abs(x), p);

// ---- decals ------------------------------------------------------------------------------------------
decal('na_rock_shou', 96, 96, (ctx, w, h) => {
  fitText(ctx, '寿', w / 2, h / 2, w * 0.92, h * 0.92, FONTS.brush, '#c3241c');
});
decal('na_scarecrow_face', 64, 64, (ctx, w, h) => {
  ctx.fillStyle = '#ee9a92';
  for (const x of [13, 51]) { ctx.beginPath(); ctx.ellipse(x, 38, 7, 4.5, 0, 0, Math.PI * 2); ctx.fill(); }
  ctx.fillStyle = '#2a1d17';
  for (const x of [21, 43]) { ctx.beginPath(); ctx.arc(x, 26, 5.5, 0, Math.PI * 2); ctx.fill(); }
  ctx.fillStyle = '#f4efe2';
  for (const x of [19.5, 41.5]) { ctx.beginPath(); ctx.arc(x, 24.5, 1.6, 0, Math.PI * 2); ctx.fill(); }
  ctx.strokeStyle = '#5a2e1c'; ctx.lineWidth = 3; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.arc(32, 33, 13, 0.18 * Math.PI, 0.82 * Math.PI); ctx.stroke();
  ctx.lineWidth = 2;
  for (let i = 0; i < 5; i++) {
    const a = (0.26 + i * 0.12) * Math.PI, cx = 32 + Math.cos(a) * 13, cy = 33 + Math.sin(a) * 13;
    ctx.beginPath(); ctx.moveTo(cx - Math.cos(a) * 4, cy - Math.sin(a) * 4); ctx.lineTo(cx + Math.cos(a) * 4, cy + Math.sin(a) * 4); ctx.stroke();
  }
});
decal('na_patch', 32, 32, (ctx, w, h) => {
  ctx.fillStyle = '#f4f2ec'; ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = 'rgba(40,30,20,0.22)';
  for (const p of [7, 19]) { ctx.fillRect(p, 0, 5, h); ctx.fillRect(0, p, w, 5); }
  ctx.strokeStyle = '#3a2a20'; ctx.lineWidth = 2; ctx.setLineDash([3, 3]);
  ctx.strokeRect(3, 3, w - 6, h - 6);
  ctx.setLineDash([]);
});
decal('na_sunflower_seeds', 64, 64, (ctx, w, h) => {
  ctx.fillStyle = '#4a2c18';
  ctx.beginPath(); ctx.arc(32, 32, 31, 0, Math.PI * 2); ctx.fill();
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 1; i < 150; i++) {
    const r = 2.5 * Math.sqrt(i), a = i * golden;
    if (r > 29) break;
    ctx.fillStyle = r < 9 ? '#8a6a2a' : i % 2 ? '#6b4424' : '#3a2212';
    ctx.beginPath(); ctx.arc(32 + Math.cos(a) * r, 32 + Math.sin(a) * r, 1.4, 0, Math.PI * 2); ctx.fill();
  }
});

/** leaf at azimuth a: base at radius r0 / height y0, tilted `tilt` from vertical, blade facing out */
function leafAt(m, g, col, a, r0, y0, tilt, L, W, roll = Math.PI / 2) {
  m.push(0, 0, 0, 0, -a, 0);
  leaf(m, g, col, r0, y0, 0, [Math.sin(tilt), Math.cos(tilt), 0], L, W, roll);
  m.pop();
}

/**
 * closed surface of revolution, prof [[r, y], ...] from bottom to top (r = 0 rows close the ends),
 * each point mapped through f([x, y, z], angle) → [x, y, z]. Returns { P, T } with outward faces.
 */
function revolve(prof, seg, f = p => p, twist = 0) {
  const P = [], T = [], rows = [];
  prof.forEach(([r, y], i) => {
    if (r < 1e-6) { rows.push([P.length]); P.push(f([0, y, 0], 0)); return; }
    const row = [];
    for (let j = 0; j < seg; j++) {
      const a = (j / seg) * Math.PI * 2 + i * twist;
      row.push(P.length);
      P.push(f([Math.cos(a) * r, y, Math.sin(a) * r], a));
    }
    rows.push(row);
  });
  const push = (a, b, c, h) => {
    const A = P[a], B = P[b], C = P[c];
    const ux = B[0] - A[0], uy = B[1] - A[1], uz = B[2] - A[2], vx = C[0] - A[0], vy = C[1] - A[1], vz = C[2] - A[2];
    const d = (uy * vz - uz * vy) * h[0] + (uz * vx - ux * vz) * h[1] + (ux * vy - uy * vx) * h[2];
    T.push(d >= 0 ? [a, b, c] : [a, c, b]);
  };
  for (let i = 0; i < rows.length - 1; i++) {
    const A = rows[i], B = rows[i + 1];
    if (A.length === 1 && B.length === 1) continue;
    if (A.length === 1) { for (let j = 0; j < seg; j++) push(A[0], B[j], B[(j + 1) % seg], [0, -1, 0]); continue; }
    if (B.length === 1) { for (let j = 0; j < seg; j++) push(B[0], A[j], A[(j + 1) % seg], [0, 1, 0]); continue; }
    for (let j = 0; j < seg; j++) {
      const a = A[j], b = A[(j + 1) % seg], c = B[j], d = B[(j + 1) % seg];
      const h = [P[a][0] + P[d][0], 0, P[a][2] + P[d][2]];
      push(a, b, d, h); push(a, d, c, h);
    }
  }
  return { P, T };
}

/** bamboo culm from a to b: each internode flares into a raised node with a pale powdery band below */
function culm(m, a, b, r, col, nodes, seg = 5) {
  const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2], len = Math.hypot(dx, dy, dz);
  const ts = [0];
  for (const n of nodes) ts.push(n - 0.022, n);
  ts.push(1);
  const P = [], T = [], cols = [];
  ts.forEach(t => {
    const node = nodes.includes(t);
    const rr = r * (1 - 0.45 * t) * (node ? 1.2 : 1);
    for (let j = 0; j < seg; j++) { const an = (j / seg) * Math.PI * 2; P.push([Math.cos(an) * rr, t * len, Math.sin(an) * rr]); }
  });
  const band = shade(col, 1.32), ridge = shade(col, 0.82);
  for (let i = 0; i < ts.length - 1; i++) {
    const c = nodes.includes(ts[i + 1]) && ts[i + 1] - ts[i] < 0.03 ? band : nodes.includes(ts[i]) && i > 0 ? ridge : col;
    for (let j = 0; j < seg; j++) {
      const p = i * seg + j, q = i * seg + (j + 1) % seg;
      T.push([p, q + seg, q], [p, p + seg, q + seg]);
      cols.push(c, c);
    }
  }
  m.push(a[0], a[1], a[2], ...orient(dx, dy, dz));
  meshOut(m, P, T, (x, y, z, nx, ny, nz, i) => cols[i]);
  m.pop();
}

// =================================================================================================
// trees
// =================================================================================================

// ---- 梧桐树 plane tree: mottled trunk forking into a broad umbrella canopy, hanging seed balls -----
def('tree_plane', {
  name: '梧桐树',
  cat: 'plant',
  sfx: 'wood',
  fill: 0.3,
  build(m) {
    // camouflage bark: cream, grey-green and olive-brown flakes
    const BARK = [0xebe3c9, 0xa9aa84, 0x857c5e, 0xc9ba8e];
    const bark = () => perFace((x, y, z) => {
      const n = noise3(x * 5 + 3, y * 2.6, z * 5, 5);
      return shade(BARK[n < 0.34 ? 0 : n < 0.55 ? 1 : n < 0.7 ? 2 : 3], 0.96 + m.rng.r() * 0.08);
    });
    taper(m, [[0, 0, 0], [0.06, 1.6, 0.02], [0.12, 3.35, 0.05]], t => 0.33 - 0.08 * t + 0.14 * Math.pow(1 - t, 6), bark(), 8, 9);
    const fork = [0.12, 3.2, 0.05];
    const limbs = [
      [[-1.5, 5.4, 0.8], [-2.6, 6.9, 1.3]],
      [[1.6, 5.3, -0.6], [2.8, 6.8, -1.2]],
      [[0.5, 5.6, 1.6], [0.9, 7.2, 2.6]],
      [[-0.4, 5.8, -1.5], [-0.8, 7.4, -2.5]],
      [[0.25, 6.2, 0.1], [0.1, 8.0, 0]],
    ];
    for (const [a, b] of limbs) taper(m, [fork, a, b], [0.2, 0.08], bark(), 5, 4);
    // broad umbrella canopy
    const greens = [0x7cb04c, 0x8dbd58, 0x6fa446, 0x9cc563];
    blob(m, 2.3, speck(m, greens[0]), 0, 8.35, 0, 1.3, 0.72, 1.3);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + m.rng.range(-0.2, 0.2), d = m.rng.range(2.9, 3.3);
      blob(m, m.rng.range(1.6, 1.85), speck(m, m.rng.pick(greens)), Math.cos(a) * d, m.rng.range(7.0, 7.5), Math.sin(a) * d, 1, 0.78, 1);
    }
    for (let i = 0; i < 2; i++) {
      const a = i * Math.PI + 0.6;
      blob(m, 1.7, speck(m, greens[2]), Math.cos(a) * 1.2, 6.8, Math.sin(a) * 1.2, 1, 0.75, 1);
    }
    // 悬铃: little seed balls dangling under the canopy
    for (let i = 0; i < 5; i++) {
      const a = i * 1.3 + 0.4, d = m.rng.range(2.0, 3.0), x = Math.cos(a) * d, z = Math.sin(a) * d, y = m.rng.range(5.2, 5.5);
      m.cyl(0.012, 0.012, 1.0, 0x6b5a3a, x, y + 0.5, z, 0, 0, 0, 3);
      m.geo(ICO[0], 0x7a5a36, x, y, z, 0.3, i, 0, 0.13, 0.13, 0.13);
    }
  },
});

// ---- 柳树 weeping willow: gnarled leaning trunk, soft crown, a curtain of drooping strands ----------
def('tree_willow', {
  name: '柳树',
  cat: 'plant',
  sfx: 'wood',
  fill: 0.3,
  build(m) {
    const bark = 0x5f4b3b;
    taper(m, [[0, 0, 0], [0.2, 1.2, 0.05], [0.05, 2.3, -0.05], [0.3, 3.2, 0.05]], t => 0.33 - 0.12 * t + 0.12 * Math.pow(1 - t, 6), speck(m, bark, 0.08, 0), 7, 6);
    const top = [0.3, 3.1, 0.05];
    for (const e of [[-1.3, 6.2, 0.6], [1.6, 6.0, -0.4], [0.5, 6.6, 1.3], [-0.2, 6.4, -1.4]])
      taper(m, [top, [(top[0] + e[0]) / 2 + e[0] * 0.15, (top[1] + e[1]) / 2 + 0.3, (top[2] + e[2]) / 2 + e[2] * 0.15], e], [0.16, 0.06], speck(m, bark, 0.08, 0), 5, 3);
    const lg = [0xa3cf69, 0x8fc25a, 0xb3d77a, 0x84b955];
    blob(m, 2.0, speck(m, lg[0]), 0.2, 6.9, 0, 1.25, 0.55, 1.25);
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2 + 0.3;
      blob(m, 1.3, speck(m, m.rng.pick(lg)), 0.2 + Math.cos(a) * 1.9, 6.55, Math.sin(a) * 1.9, 1, 0.6, 1);
    }
    // drooping strands: long thin cones hanging from the crown's underside
    m.jitter(0.1);
    for (let i = 0; i < 64; i++) {
      const a = (i / 64) * Math.PI * 2 + m.rng.range(-0.05, 0.05);
      const d = 1.0 + Math.sqrt(m.rng.r()) * 1.9;
      const x = 0.2 + Math.cos(a) * d, z = Math.sin(a) * d;
      const y0 = 6.25 - 0.12 * d + m.rng.range(-0.15, 0.15);
      const len = 2.6 + (d - 1.0) * 0.6 + m.rng.range(0, 1.4);
      const tilt = m.rng.range(0.03, 0.12), dir = [Math.cos(a) * tilt, -1, Math.sin(a) * tilt], l = Math.hypot(...dir);
      const [rx, ry, rz] = orient(...dir);
      m.cone(m.rng.range(0.12, 0.17), len, m.rng.pick(lg), x + dir[0] / l * len / 2, y0 + dir[1] / l * len / 2, z + dir[2] / l * len / 2, rx, ry, rz, 4);
    }
    m.jitter(0);
  },
});

// ---- 松树 黄山松: twisting trunk, flat cloud-like tiers of needles, one long welcoming arm ------------
def('tree_pine', {
  name: '松树',
  cat: 'plant',
  sfx: 'wood',
  fill: 0.25,
  build(m) {
    const bark = () => perFace((x, y, z) => shade(fbm(x * 3, y * 3, z * 3, 9, 2) > 0.52 ? 0x7c4a35 : 0x94603f, 0.95 + m.rng.r() * 0.1));
    taper(m, [[0, 0, 0], [0.4, 1.8, 0.1], [0.15, 3.6, -0.1], [-0.3, 5.4, 0], [-0.1, 7.2, 0.1], [0.15, 8.3, 0]], t => 0.3 - 0.22 * t + 0.1 * Math.pow(1 - t, 8), bark(), 7, 10);
    const needles = [0x2f6b4c, 0x376f52, 0x2b6147, 0x3d7a57];
    const pad = (r, x, y, z) => {
      const base = m.rng.pick(needles), k = 1 + m.rng.range(-0.06, 0.06);
      m.geo(PAD, perFace((px, py, pz, nx, ny) => shade(ny > 0.45 ? mix(base, 0x6aa36d, 0.35) : base, k * (0.95 + m.rng.r() * 0.1))),
        x, y, z, 0, m.rng.angle(), 0, r * m.rng.range(1.0, 1.2), r, r * m.rng.range(0.85, 1.0));
    };
    const branches = [
      { pts: [[0.3, 3.0, 0.02], [1.8, 3.5, 0.5], [3.4, 3.7, 1.0], [4.4, 3.9, 1.3]], r: 0.12, pads: [[1.2, 3.35, 4.0, 1.05], [0.9, 4.45, 4.15, 1.35], [0.8, 2.2, 3.9, 0.65]] },
      { pts: [[0.15, 4.2, -0.1], [-1.4, 4.6, -0.4], [-2.8, 4.9, -0.8]], r: 0.1, pads: [[1.25, -2.6, 5.1, -0.75], [0.85, -1.4, 5.0, -0.4]] },
      { pts: [[-0.2, 5.6, 0], [0.8, 5.9, -1.0], [1.9, 6.1, -1.8]], r: 0.09, pads: [[1.15, 1.8, 6.3, -1.65], [0.8, 0.9, 6.25, -0.95]] },
      { pts: [[-0.25, 6.1, 0.05], [-1.3, 6.5, 1.0], [-2.2, 6.7, 1.6]], r: 0.08, pads: [[1.05, -2.0, 6.9, 1.5]] },
      { pts: [[-0.05, 7.1, 0.1], [0.9, 7.4, 0.8], [1.6, 7.6, 1.1]], r: 0.07, pads: [[0.95, 1.5, 7.8, 1.0]] },
    ];
    for (const b of branches) {
      taper(m, b.pts, [b.r, b.r * 0.45], bark(), 5, 3);
      for (const p of b.pads) pad(...p);
    }
    pad(1.3, 0.15, 8.35, 0);
    pad(0.85, -0.65, 8.15, -0.45);
    pad(0.8, 0.8, 8.2, 0.35);
  },
});

// ---- 银杏 ginkgo: straight trunk, golden crown opening upward like a ginkgo leaf fan ----------------
def('tree_ginkgo', {
  name: '银杏',
  cat: 'plant',
  sfx: 'wood',
  fill: 0.3,
  build(m) {
    const bark = 0x7d6a58;
    taper(m, [[0, 0, 0], [0.05, 3, 0], [0, 6, 0.05], [0.02, 9.0, 0]], t => 0.26 - 0.19 * t + 0.1 * Math.pow(1 - t, 8), speck(m, bark, 0.07, 0), 7, 6);
    for (let i = 0; i < 5; i++) {
      const a = i * 1.26 + 0.3, y = 3.0 + i * 0.6, len = 2.3 + i * 0.3;
      limb(m, [0, y, 0], [Math.cos(a) * len * 0.8, y + len * 0.75, Math.sin(a) * len * 0.8], 0.09, 0.04, bark, 5);
    }
    // the fan: narrow at the bottom, spreading wide and flat-topped
    const golds = [0xf6c21a, 0xf8d23e, 0xf0b31c, 0xfbdc5c, 0xf4c72e];
    const rows = [[4.9, 0.6, 2, 0.95, DOD], [6.0, 1.35, 3, 1.2, ICO[1]], [7.2, 2.2, 4, 1.35, ICO[1]], [8.4, 2.85, 5, 1.3, ICO[1]]];
    rows.forEach(([y, d, n, r, g], j) => {
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + j * 0.75;
        blob(m, r * m.rng.range(0.92, 1.08), speck(m, m.rng.pick(golds), 0.05, 0.14), Math.cos(a) * d, y + m.rng.range(-0.15, 0.15), Math.sin(a) * d, 1, j === 3 ? 0.8 : 1, 1, g);
      }
    });
    blob(m, 1.9, speck(m, golds[0], 0.05, 0.14), 0, 7.3, 0);
    blob(m, 1.6, speck(m, golds[3], 0.05, 0.14), 0, 8.9, 0, 1.3, 0.6, 1.3);
    // a carpet of fallen golden leaves: two ragged, paper-thin patches
    [[0, 0, 3.0, 0.015, golds[1]], [0.7, -0.4, 1.7, 0.03, golds[3]]].forEach(([x, z, r, y, c], k) => {
      const pts = [];
      for (let i = 0; i < 14; i++) {
        const a = (i / 14) * Math.PI * 2, rr = r * (0.72 + 0.4 * noise3(Math.cos(a) * 2 + k * 5, Math.sin(a) * 2, 0, 71));
        pts.push([Math.cos(a) * rr, Math.sin(a) * rr]);
      }
      m.extrude(pts, 0.02, speck(m, c, 0.08, 0), x, y, z, -90 * D, 0, 0);
    });
  },
});

// ---- 桃花树 peach tree in bloom: dark vase-shaped branches carrying pink blossom clusters -------------
def('tree_peach', {
  name: '桃花树',
  cat: 'plant',
  sfx: 'wood',
  fill: 0.35,
  build(m) {
    const bark = 0x563a31;
    taper(m, [[0, 0, 0], [0.12, 0.7, 0.05], [0.05, 1.3, 0]], t => 0.15 - 0.04 * t + 0.07 * Math.pow(1 - t, 6), speck(m, bark, 0.08, 0), 6, 3);
    const fork = [0.05, 1.2, 0];
    const arms = [
      [[0.9, 2.3, 0.35], [1.7, 3.2, 0.7], [2.05, 3.8, 0.85]],
      [[-0.8, 2.35, 0.45], [-1.6, 3.3, 0.8], [-1.95, 3.85, 0.95]],
      [[0.3, 2.45, -0.9], [0.5, 3.3, -1.6], [0.62, 3.9, -1.95]],
      [[-0.6, 2.5, -0.55], [-1.0, 3.4, -1.1], [-1.15, 4.0, -1.3]],
      [[0.1, 2.7, 0.3], [0.15, 3.5, 0.55], [0.1, 4.15, 0.6]],
    ];
    const pinks = [0xf590b3, 0xf7a9c5, 0xee7ba4, 0xfac0d4, 0xf49ab9];
    for (const a of arms) {
      taper(m, [fork, ...a], [0.1, 0.03], speck(m, bark, 0.08, 0), 5, 4);
      // side twig
      const s = a[1], e = [s[0] * 1.35 - s[2] * 0.3, s[1] + 0.55, s[2] * 1.35 + s[0] * 0.3];
      limb(m, s, e, 0.035, 0.015, bark, 4);
      // blossom clusters strung along the arm, fullest at the tip
      const P = [[a[1], 0.42], [e, 0.36], [[(a[1][0] + a[2][0]) / 2, (a[1][1] + a[2][1]) / 2 + 0.1, (a[1][2] + a[2][2]) / 2], 0.46], [a[2], 0.58]];
      P.forEach(([p, r]) => blob(m, r * m.rng.range(0.9, 1.1), speck(m, m.rng.pick(pinks), 0.06, 0.12),
        p[0] + m.rng.range(-0.12, 0.12), p[1] + 0.08, p[2] + m.rng.range(-0.12, 0.12), 1, 1, 1, DOD));
    }
    for (let i = 0; i < 4; i++) {
      const a = i * 1.57 + 0.9, d = m.rng.range(1.0, 1.4);
      blob(m, m.rng.range(0.38, 0.46), speck(m, m.rng.pick(pinks), 0.06, 0.12), Math.cos(a) * d, m.rng.range(3.0, 3.5), Math.sin(a) * d, 1, 1, 1, DOD);
    }
    for (let i = 0; i < 3; i++) {   // a few fresh leaves
      const a = i * 2.1 + 0.4;
      blob(m, 0.2, speck(m, 0x8cc063), Math.cos(a) * 1.7, 3.3 + (i % 2) * 0.4, Math.sin(a) * 1.4, 1, 0.7, 1, DOD);
    }
    for (let i = 0; i < 9; i++) {   // fallen petals
      const a = m.rng.angle(), d = m.rng.range(0.6, 2.0);
      m.disc(m.rng.range(0.05, 0.08), m.rng.pick(pinks), Math.cos(a) * d, 0.012, Math.sin(a) * d, 0, 0, 0, 5);
    }
  },
});

// ---- 香樟 camphor: thick fissured trunk under a huge, dense, round evergreen dome -------------------
def('tree_camphor', {
  name: '香樟',
  cat: 'plant',
  sfx: 'wood',
  fill: 0.35,
  build(m) {
    const bark = () => perFace((x, y, z) => shade(fbm(x * 9, y * 0.9, z * 9, 4, 2) > 0.53 ? 0x5a4a3e : 0x76645a, 0.95 + m.rng.r() * 0.1));
    taper(m, [[0, 0, 0], [0.1, 1.7, 0], [0.05, 3.3, 0.05]], t => 0.44 - 0.1 * t + 0.2 * Math.pow(1 - t, 8), bark(), 8, 4);
    const fork = [0.05, 3.1, 0.05];
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 + 0.4;
      taper(m, [fork, [Math.cos(a) * 1.4, 4.8, Math.sin(a) * 1.4], [Math.cos(a) * 2.6, 6.2, Math.sin(a) * 2.6]], [0.2, 0.08], bark(), 5, 2);
    }
    const greens = [0x3f8a48, 0x347c40, 0x4a9650, 0x2f7240];
    blob(m, 3.3, speck(m, greens[0]), 0, 8.4, 0, 1.3, 0.95, 1.3);
    blob(m, 1.9, speck(m, 0x5ea552), 0.3, 10.2, -0.2, 1.1, 0.9, 1.1);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + m.rng.range(-0.15, 0.15), d = m.rng.range(4.2, 4.7);
      blob(m, m.rng.range(2.0, 2.35), speck(m, m.rng.pick(greens)), Math.cos(a) * d, m.rng.range(7.2, 8.0), Math.sin(a) * d, 1, 0.9, 1);
    }
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + 0.8;
      blob(m, 1.8, speck(m, i % 2 ? 0x6fb055 : greens[2]), Math.cos(a) * 2.6, 9.8, Math.sin(a) * 2.6, 1, 0.9, 1, DOD);
    }
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + 0.2;
      blob(m, 1.9, speck(m, greens[3]), Math.cos(a) * 2.2, 6.3, Math.sin(a) * 2.2, 1, 0.85, 1, DOD);
    }
  },
});

// ---- 竹子丛 bamboo clump: jointed culms leaning out of a root mound, leaf sprays up top -------------
def('bamboo', {
  name: '竹子丛',
  cat: 'plant',
  sfx: 'wood',
  fill: 0.2,
  build(m) {
    m.dome(0.75, 0x7d6446, 0, 0, 0, 1.15, 0.28, 1.0, 0, 0, 0, 8);
    const culmCols = [0x6aa84f, 0x5c9e48, 0x77b456, 0x62a04a];
    const leafCols = [0x5a9e45, 0x6cad50, 0x4f8f3e, 0x74b457];
    for (let c = 0; c < 9; c++) {
      const a = c * 2.4 + m.rng.range(-0.3, 0.3), d = c === 0 ? 0.05 : m.rng.range(0.18, 0.6);
      const bx = Math.cos(a) * d, bz = Math.sin(a) * d;
      const lean = m.rng.range(0.02, 0.12) + d * 0.14, H = m.rng.range(5.6, 6.95), r = m.rng.range(0.045, 0.065);
      const dir = [Math.cos(a) * lean, 1, Math.sin(a) * lean], dl = Math.hypot(...dir);
      dir[0] /= dl; dir[1] /= dl; dir[2] /= dl;
      const top = [bx + dir[0] * H, dir[1] * H, bz + dir[2] * H];
      const n0 = m.rng.range(0.14, 0.2);
      culm(m, [bx, 0, bz], top, r, m.rng.pick(culmCols), [n0, n0 + 0.19, n0 + 0.37, n0 + 0.54, n0 + 0.7].filter(t => t < 0.96));
      for (let s = 0; s < 3; s++) {
        const t = 0.58 + s * 0.15, px = bx + dir[0] * H * t, py = dir[1] * H * t, pz = bz + dir[2] * H * t;
        const sa = a + (s % 2 ? 1.6 : -1.6) + m.rng.range(-0.5, 0.5);
        for (let k = 0; k < 3; k++) {
          const la = sa + (k - 1) * 0.55;
          leaf(m, LEAF, m.rng.pick(leafCols), px, py, pz, [Math.cos(la), m.rng.range(-0.55, -0.1), Math.sin(la)], m.rng.range(0.4, 0.52), 0.085, m.rng.angle());
        }
      }
      for (let k = 0; k < 3; k++) {
        const la = k * 2.1 + a;
        leaf(m, LEAF, m.rng.pick(leafCols), top[0], top[1] - 0.05, top[2], [Math.cos(la) * 0.6, 0.4, Math.sin(la) * 0.6], 0.45, 0.085, m.rng.angle());
      }
    }
  },
});

// ---- 小树苗 newly planted street sapling: straw-rope wrapped trunk, three support sticks, a drip bag ---
def('sapling', {
  name: '小树苗',
  cat: 'plant',
  sfx: 'wood',
  fill: 0.15,
  build(m) {
    m.cyl(0.46, 0.5, 0.06, 0x5d4632, 0, 0.03, 0, 0, 0, 0, 10);              // tree-pit soil
    taper(m, [[0, 0, 0], [0.02, 1.4, 0], [0, 2.45, 0.02]], [0.048, 0.026], speck(m, 0x86674a, 0.06, 0), 6, 3);
    // 草绳绕干: straw rope wound round the lower trunk
    m.geo(new THREE.CylinderGeometry(0.068, 0.074, 1.2, 8, 7), perFace((x, y, z) =>
      (Math.floor(y * 9 + Math.atan2(z, x) / Math.PI + 40) % 2 ? 0xc9a45c : 0xa9853f)), 0, 0.64, 0);
    // three wooden support sticks tied to the trunk
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + Math.PI / 2;
      limb(m, [Math.cos(a) * 0.95, 0.02, Math.sin(a) * 0.95], [Math.cos(a) * 0.07, 1.8, Math.sin(a) * 0.07], 0.028, 0.024, i ? 0xa77d4e : 0xb88c5a, 5);
    }
    m.cyl(0.08, 0.08, 0.07, 0x3b332c, 0, 1.72, 0, 0, 0, 0, 8);               // tie
    // 打吊针: a nutrient drip bag hung on the trunk
    m.box(0.08, 0.13, 0.03, 0xdde7a0, 0, 1.5, 0.062);
    m.box(0.014, 0.03, 0.014, 0xe8e4da, 0, 1.58, 0.062);
    limb(m, [0, 1.435, 0.062], [0, 1.32, 0.035], 0.004, 0.004, 0xd8e8e0, 3);
    // young crown
    limb(m, [0, 2.1, 0], [0.35, 2.55, 0.1], 0.02, 0.01, 0x86674a, 4);
    limb(m, [0, 2.2, 0], [-0.3, 2.6, -0.15], 0.02, 0.01, 0x86674a, 4);
    const lg = [0x8cc868, 0x7dbd5c, 0x9fd174];
    blob(m, 0.42, speck(m, lg[0]), 0, 2.58, 0, 1, 1, 1, DOD);
    blob(m, 0.34, speck(m, lg[1]), 0.36, 2.45, 0.12, 1, 1, 1, DOD);
    blob(m, 0.32, speck(m, lg[2]), -0.33, 2.5, -0.14, 1, 1, 1, DOD);
    blob(m, 0.3, speck(m, lg[1]), 0.05, 2.42, -0.34, 1, 1, 1, DOD);
    blob(m, 0.3, speck(m, lg[0]), -0.08, 2.72, 0.22, 1, 1, 1, DOD);
  },
});

// =================================================================================================
// plants
// =================================================================================================

// ---- 灌木丛 bush: round clump, bronze-red new growth on top (红叶石楠, planted everywhere) -----------
def('bush', {
  name: '灌木丛',
  cat: 'plant',
  sfx: 'soft',
  fill: 0.6,
  build(m) {
    const g = [0x4f9a4a, 0x5cae4f, 0x3f8f4a, 0x6db85a];
    blob(m, 0.62, speck(m, g[0]), 0, 0.56, 0, 1.25, 0.9, 1.1);
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 + 0.3, r = m.rng.range(0.36, 0.43);
      blob(m, r, speck(m, m.rng.pick(g)), Math.cos(a) * 0.62, r, Math.sin(a) * 0.52);
    }
    blob(m, 0.36, speck(m, g[3]), 0.18, 0.84, 0.1);
    blob(m, 0.33, speck(m, g[1]), -0.22, 0.82, -0.08);
    for (let i = 0; i < 3; i++) {
      const a = i * 2.1;
      blob(m, 0.17, speck(m, i ? 0xc8563c : 0xd9704a), Math.cos(a) * 0.3, 1.0, Math.sin(a) * 0.25, 1, 1, 1, DOD);
    }
  },
});

// ---- 绿篱 clipped box hedge, 3 m long (along x) -----------------------------------------------------
def('hedge', {
  name: '绿篱',
  cat: 'plant',
  sfx: 'soft',
  fill: 0.8,
  build(m) {
    const W = 3, H = 1, Dp = 0.8;
    const g = new THREE.BoxGeometry(W, H, Dp, 10, 3, 3).toNonIndexed();
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const top = y > 0.49 * H;
      if (top && Math.abs(z) > 0.39 * Dp) { z *= 0.9; y -= 0.05; }     // rounded, clipped top edges
      if (top && Math.abs(x) > 0.49 * W) { x *= 0.985; y -= 0.04; }
      const k = (fbm(x * 3 + 5, y * 3, z * 3, 3, 2) - 0.5) * 0.09;
      p.setXYZ(i, x + k, y + H / 2 + (y > -0.45 * H ? k * 0.5 : 0), z + k);
    }
    g.computeVertexNormals();
    m.geo(g, perQuad((x, y, z, nx, ny) => {
      const n = noise3(x * 3.5, y * 3.5, z * 3.5, 21);
      if (ny > 0.7) return shade(mix(0x6db35a, 0x86c56a, n), 0.97 + m.rng.r() * 0.06);   // fresh clipped top
      if (ny < -0.7) return 0x3a5a32;
      const c = mix(0x3f8f45, 0x58a655, n);
      return shade(c, (0.96 + m.rng.r() * 0.06) * (0.74 + 0.26 * clamp01(y / 0.75)));
    }));
  },
});

// ---- 花丛 municipal flower bed patch: 一串红 salvia, 万寿菊 marigolds, 矮牵牛 petunias -----------------
def('flower_patch', {
  name: '花丛',
  cat: 'plant',
  sfx: 'soft',
  fill: 0.4,
  build(m) {
    const RX = 0.5, RZ = 0.4, MH = 0.15;
    const mound = (x, z) => MH + MH * Math.sqrt(Math.max(0, 1 - (x / RX) ** 2 - (z / RZ) ** 2));
    m.geo(ICO[1], speck(m, 0x4f9a4a, 0.08), 0, MH, 0, 0, 0, 0, RX, MH, RZ);
    for (let i = 0; i < 4; i++) {
      const a = i * 1.57 + 0.4;
      blob(m, 0.2, speck(m, i % 2 ? 0x5cae4f : 0x468f45), Math.cos(a) * 0.32, 0.14, Math.sin(a) * 0.26, 1, 0.6, 1, DOD);
    }
    for (let i = 0; i < 10; i++) {       // leaves spilling over the edge
      const a = (i / 10) * Math.PI * 2 + 0.2;
      leafAt(m, LEAF, m.rng.pick([0x4f9a4a, 0x5cae4f, 0x3f8f45]), a, 0.36, 0.1, 1.25, 0.2, 0.1);
    }
    for (let i = 0; i < 6; i++) {        // salvia spikes
      const a = i * 1.05 + 0.2, d = m.rng.range(0.1, 0.34), x = Math.cos(a) * d * 1.1, z = Math.sin(a) * d * 0.85, h = m.rng.range(0.26, 0.32);
      m.cyl(0.006, 0.008, h, 0x3f7f3a, x, h / 2, z, 0, 0, 0, 3);
      const red = m.rng.pick([0xd8342c, 0xe0413a]);
      m.cone(0.026, 0.08, red, x, h + 0.03, z, 0, 0.6, 0, 5);
      m.cone(0.018, 0.11, shade(red, 1.08), x, h + 0.105, z, 0, 0, 0, 5);
    }
    for (let i = 0; i < 9; i++) {        // marigold pompoms
      const a = i * 0.7 + 1.1, d = m.rng.range(0.16, 0.44), x = Math.cos(a) * d * 1.05, z = Math.sin(a) * d * 0.8;
      m.geo(ICO[0], m.rng.pick([0xf2a14a, 0xf2c14e, 0xf08c3a]), x, mound(x, z) + 0.025, z, m.rng.angle(), m.rng.angle(), 0, 0.058, 0.05, 0.058);
    }
    for (let i = 0; i < 9; i++) {        // petunia trumpets
      const a = i * 0.7 + 0.65, d = m.rng.range(0.22, 0.46), x = Math.cos(a) * d * 1.05, z = Math.sin(a) * d * 0.8;
      m.cone(0.062, 0.05, m.rng.pick([0xb05fc8, 0xe07ab8, 0xf4f2ec, 0x9a62d0]), x, mound(x, z) + 0.03, z, Math.PI + m.rng.range(-0.3, 0.3), 0, m.rng.range(-0.3, 0.3), 5);
    }
  },
});

// ---- 向日葵 sunflower: head faces +Z and nods a little ---------------------------------------------
def('sunflower', {
  name: '向日葵',
  cat: 'plant',
  sfx: 'soft',
  fill: 0.15,
  build(m) {
    taper(m, [[0, 0, 0], [0.03, 0.6, 0], [0, 1.2, 0.03], [0, 1.5, 0.08], [0, 1.57, 0.11]], [0.028, 0.018], 0x5d9a40, 5, 6);
    const lv = [0x5c9a3f, 0x6aa84a, 0x4f8d37];
    [[0.3, 0.2], [0.55, 2.4], [0.8, 4.3], [1.05, 1.2], [1.25, 3.4]].forEach(([y, a], i) =>
      leafAt(m, BROAD, lv[i % 3], a, 0.015, y, 1.2 + i * 0.04, 0.34 - i * 0.03, 0.27 - i * 0.02));
    m.push(0, 1.56, 0.17, 16 * D, 0, 0);
    m.cyl(0.13, 0.05, 0.07, 0x6a9a3f, 0, 0, -0.04, 90 * D, 0, 0, 10);        // green back of the head
    m.cyl(0.125, 0.13, 0.03, 0x4a2c18, 0, 0, 0.005, 90 * D, 0, 0, 14);      // seed disc
    m.decal(0.25, 0.25, 'na_sunflower_seeds', 0, 0, 0.0215);
    for (let ring = 0; ring < 2; ring++) {
      const n = 14, L = ring ? 0.13 : 0.15, col = ring ? 0xf7c21e : 0xf2a216;
      for (let i = 0; i < n; i++) {
        const a = ((i + ring * 0.5) / n) * Math.PI * 2;
        leaf(m, LEAF, col, Math.cos(a) * 0.115, Math.sin(a) * 0.115, ring ? 0.01 : -0.004, [Math.cos(a), Math.sin(a), ring ? 0.18 : 0.05], L, 0.075);
      }
    }
    m.pop();
  },
});

// ---- 荷叶荷花 lotus: floating pads, a raised leaf, one pink bloom and a bud (sits on the water, y = 0) -
def('lotus', {
  name: '荷叶荷花',
  cat: 'plant',
  sfx: 'soft',
  fill: 0.2,
  build(m) {
    const pad = (r, x, z, rot, col) => {
      const pts = [], notch = 0.5;
      for (let i = 0; i <= 12; i++) { const a = notch / 2 + (i / 12) * (Math.PI * 2 - notch); pts.push([Math.cos(a) * r, Math.sin(a) * r]); }
      pts.push([r * 0.08, 0]);
      m.extrude(pts, 0.012, speck(m, col, 0.05, 0.05), x, 0.006, z, -90 * D, 0, rot);
    };
    pad(0.27, -0.26, 0.18, 0.3, 0x4f9a4a);
    pad(0.21, 0.26, 0.26, 2.2, 0x5cae4f);
    pad(0.24, 0.24, -0.22, 4.0, 0x55a34c);
    pad(0.18, -0.22, -0.3, 5.3, 0x469245);
    pad(0.15, 0.02, 0.43, 1.2, 0x5fae52);
    // raised lotus leaf on its stalk
    limb(m, [-0.34, 0, -0.05], [-0.36, 0.215, -0.06], 0.008, 0.007, 0x5f8f3f, 4);
    m.cone(0.2, 0.06, speck(m, 0x5aa654, 0.05, 0.1), -0.36, 0.23, -0.06, Math.PI, 0, 0.12, 10);
    // the bloom
    limb(m, [0.06, 0, -0.04], [0.07, 0.21, -0.05], 0.009, 0.008, 0x6a9a45, 4);
    m.push(0.07, 0.2, -0.05);
    m.cyl(0.028, 0.018, 0.03, 0xd9d05a, 0, 0.03, 0, 0, 0, 0, 8);            // seed pod 莲蓬
    const petals = (tilt, n, L, W, off) => {
      for (let i = 0; i < n; i++) {
        const a = ((i + off) / n) * Math.PI * 2;
        leafAt(m, LEAF, (x, y) => mix(0xfbe6ee, 0xe8609a, clamp01((y - 0.21) / (L * Math.cos(tilt) + 0.001)) ** 1.6), a, 0.02, 0.01, tilt, L, W);
      }
    };
    petals(1.0, 8, 0.12, 0.07, 0);
    petals(0.45, 6, 0.1, 0.06, 0.5);
    m.pop();
    // a closed bud
    limb(m, [-0.1, 0, 0.2], [-0.11, 0.2, 0.21], 0.007, 0.006, 0x6a9a45, 4);
    m.sphere(0.032, (x, y) => mix(0xf6d0dc, 0xe0588e, clamp01((y - 0.19) / 0.08)), -0.11, 0.225, 0.21, 1, 1.5, 1, 0, 0, 0, 7);
    m.cone(0.02, 0.035, 0xe0588e, -0.11, 0.275, 0.21, 0, 0, 0, 6);
  },
});

// ---- 芦苇 reeds: slender stalks with long leaves and nodding feathery plumes -----------------------
def('reeds', {
  name: '芦苇',
  cat: 'plant',
  sfx: 'soft',
  fill: 0.2,
  build(m) {
    m.dome(0.28, 0x6f7a44, 0, 0, 0, 1, 0.35, 1, 0, 0, 0, 7);
    const plumes = [0xdccfb0, 0xcdb996, 0xbfa58e, 0xd6c3a2];
    for (let i = 0; i < 12; i++) {
      const a = i * 2.4 + m.rng.range(-0.3, 0.3), d = m.rng.range(0, 0.24), bx = Math.cos(a) * d, bz = Math.sin(a) * d;
      const lean = m.rng.range(0.05, 0.22), H = m.rng.range(1.35, 1.6), la = a + m.rng.range(-0.6, 0.6);
      const tip = [bx + Math.cos(la) * lean * H, H, bz + Math.sin(la) * lean * H];
      const mid = [bx + Math.cos(la) * lean * H * 0.4, H * 0.5, bz + Math.sin(la) * lean * H * 0.4];
      taper(m, [[bx, 0, bz], mid, tip], [0.013, 0.006], (x, y) => mix(0x8a9a52, 0xc2b27a, clamp01(y / H)), 3, 3, false);
      for (let k = 0; k < 2; k++) {
        const t = 0.2 + k * 0.25, ang = la + (k ? 2.2 : -1.9) + m.rng.range(-0.4, 0.4);
        leaf(m, LEAF, m.rng.pick([0x8fa557, 0x9cae62, 0x7f9a4c]), bx + (mid[0] - bx) * t * 2, H * t, bz + (mid[2] - bz) * t * 2,
          [Math.cos(ang), m.rng.range(0.5, 1.1), Math.sin(ang)], m.rng.range(0.45, 0.62), 0.045, m.rng.angle());
      }
      const nod = [Math.cos(la) * 0.55, 1, Math.sin(la) * 0.55], nl = Math.hypot(...nod), pl = m.rng.range(0.16, 0.21);
      const [rx, ry, rz] = orient(...nod);
      m.geo(ICO[0], m.rng.pick(plumes), tip[0] + nod[0] / nl * pl, tip[1] + nod[1] / nl * pl, tip[2] + nod[2] / nl * pl, rx, ry, rz, 0.045, pl, 0.045);
    }
  },
});

// ---- 草丛 grass tuft (placed by the thousand: 66 tris) ---------------------------------------------
def('grass_tuft', {
  name: '草丛',
  cat: 'plant',
  sfx: 'soft',
  fill: 0.3,
  build(m) {
    const cols = [0x6fb24f, 0x5ca545, 0x86c05a, 0x4f9a3f];
    for (let i = 0; i < 11; i++) {
      const a = (i / 11) * Math.PI * 2 + m.rng.range(-0.25, 0.25), d = m.rng.range(0.01, 0.045);
      const h = i < 3 ? m.rng.range(0.26, 0.3) : m.rng.range(0.15, 0.25), w = m.rng.range(0.028, 0.042), c = m.rng.pick(cols);
      m.geo(BLADE, (x, y) => mix(shade(c, 0.62), c, clamp01(y / 0.18)), Math.cos(a) * d, 0, Math.sin(a) * d, 0, Math.PI / 2 - a, 0, w, h, h * m.rng.range(0.6, 1.1));
    }
  },
});

// ---- 小蘑菇 mushroom: chubby cream stem, glossy red cap with white spots, and a baby one ------------
def('mushroom', {
  name: '小蘑菇',
  cat: 'plant',
  sfx: 'soft',
  fill: 0.5,
  build(m) {
    const cream = 0xf6efe0, red = 0xd8342c, spot = 0xf7f3ea, gill = 0xefe0c4;
    const shroom = (x, z, s, tilt, spots, capSeg, stemSeg) => {
      m.push(x, 0, z, 0, 0, 0, s);
      m.lathe([[0, 0], [0.021, 0.001], [0.018, 0.028], [0.017, 0.056]], cream, 0, 0, 0, 0, 0, 0, stemSeg);
      m.push(0, 0.05, 0, tilt * 0.4, 0, tilt);
      m.lathe([[0, -0.002], [0.05, 0], [0.057, 0.009], [0.051, 0.029], [0.033, 0.045], [0, 0.05]],
        perFace((px, py, pz, nx, ny) => (ny < -0.2 ? gill : shade(red, 0.95 + m.rng.r() * 0.1))), 0, 0, 0, 0, 0, 0, capSeg);
      for (const [a, e] of spots) {
        const ce = Math.cos(e), se = Math.sin(e);
        const px = 0.056 * ce * Math.cos(a), py = 0.009 + 0.041 * se, pz = 0.056 * ce * Math.sin(a);
        const [rx, ry, rz] = orient(ce * Math.cos(a) / 0.056, se / 0.041, ce * Math.sin(a) / 0.056);
        m.geo(ICO[0], spot, px, py, pz, rx, ry, rz, 0.011, 0.0045, 0.011);
      }
      m.pop();
      m.pop();
    };
    shroom(0.012, 0, 1, 0.08, [[0, 1.5], [0.3, 0.55], [2.2, 0.45], [4.1, 0.6]], 9, 8);
    shroom(-0.052, 0.035, 0.5, -0.18, [[1.0, 0.8]], 8, 6);
  },
});

// =================================================================================================
// rocks and farm straw
// =================================================================================================
const STONE = [0x9aa0a6, 0x8f9499, 0xa6a9a6, 0x9d978c];
/** stone facets: grey with warm variation, mossy on top faces; f = noise frequency for moss patches */
function stonePaint(m, f, moss = 0.3, pal = STONE) {
  return (cx, cy, cz, nx, ny) => {
    if (ny > 0.72 && fbm(cx * f, cy * f, cz * f, 11, 2) > 1 - moss) return shade(0x7d9a52, 0.92 + m.rng.r() * 0.16);
    return shade(m.rng.pick(pal), (0.9 + m.rng.r() * 0.12) * (0.9 + 0.1 * ny));
  };
}
/** drop a lump onto y = 0, shaving `flat` off the bottom so it sits firmly */
function settle(g, flat) {
  const minY = Math.min(...g.P.map(p => p[1])), cut = minY + flat;
  g.P.forEach(p => { p[1] = Math.max(p[1], cut) - cut; });
  return g;
}

// ---- 石头 small rock with a pebble ------------------------------------------------------------------
def('rock_small', {
  name: '石头',
  cat: 'nature',
  sfx: 'rumble',
  fill: 0.65,
  build(m) {
    const a = settle(lump(ICO[1], 0.32, 1.3, 3, 0, 0, 0, 0.21, 0.17, 0.18, 0.4), 0.04);
    const b = settle(lump(ICO[0], 0.25, 1.5, 8, 0.25, 0, 0.12, 0.07, 0.055, 0.065, 1.2), 0.015);
    meshOut(m, a.P, a.T, stonePaint(m, 6));
    meshOut(m, b.P, b.T, stonePaint(m, 6));
  },
});

// ---- 大石头 big landscape rock with a red-painted 寿 on its smooth-cut front ------------------------
def('rock_big', {
  name: '大石头',
  cat: 'nature',
  sfx: 'rumble',
  fill: 0.65,
  build(m) {
    const a = settle(lump(ICO[2], 0.3, 1.1, 21, 0, 0, 0, 1.3, 1.2, 1.05, 0.2), 0.25);
    const maxZ = Math.max(...a.P.map(p => p[2])), zc = maxZ - 0.32;
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const p of a.P) if (p[2] > zc) { p[2] = zc; x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); }
    const warm = [0xaaa498, 0x9c968b, 0xb3ada1, 0xa19a8e];
    const rock = stonePaint(m, 1.4, 0.35, warm);
    meshOut(m, a.P, a.T, (cx, cy, cz, nx, ny, nz, i) => (nz > 0.995 ? shade(0xb9b3a6, 0.97 + m.rng.r() * 0.05) : rock(cx, cy, cz, nx, ny, nz, i)));
    const s = Math.min(x1 - x0, y1 - y0) * 0.62;
    m.decal(s, s, 'na_rock_shou', (x0 + x1) / 2, (y0 + y1) / 2, zc + 0.02);
    const b = settle(lump(ICO[1], 0.3, 1.4, 5, -1.25, 0, 0.7, 0.45, 0.33, 0.4, 0.7), 0.06);
    const c = settle(lump(ICO[1], 0.3, 1.4, 9, 1.2, 0, 0.8, 0.33, 0.24, 0.3, 2.0), 0.05);
    meshOut(m, b.P, b.T, stonePaint(m, 3, 0.35, warm));
    meshOut(m, c.P, c.T, stonePaint(m, 3, 0.35, warm));
  },
});

// ---- 太湖石假山 Taihu-stone rockery: tall, pale, twisting, full of holes (瘦 皱 漏 透) ------------------
def('rockery', {
  name: '太湖石假山',
  cat: 'nature',
  sfx: 'rumble',
  fill: 0.4,
  build(m) {
    const TAIHU = [0xc6cbc6, 0xb9beb9, 0xadb3ae, 0xc0c4bc];
    const paint = (cx, cy, cz, nx, ny) => {
      if (fbm(cx * 1.7 + 7, cy * 1.7, cz * 1.7, 13, 2) > 0.63) return shade(0x6c7470, 0.9 + m.rng.r() * 0.15);   // eroded pits
      return shade(m.rng.pick(TAIHU), (0.92 + m.rng.r() * 0.08) * (0.8 + 0.2 * ny));
    };
    // wrinkles (皱): every stone surface is pushed around by a smooth noise field
    const warp = (s, k) => ([x, y, z]) => [
      x + (noise3(x * 1.5 + s, y * 1.5, z * 1.5, s) - 0.5) * 2 * k,
      y + (noise3(x * 1.5, y * 1.5 + s, z * 1.5, s + 1) - 0.5) * 2 * k,
      z + (noise3(x * 1.5, y * 1.5, z * 1.5 + s, s + 2) - 0.5) * 2 * k];
    // a low bed of stones
    [[0, 0.45, 0, 1.75, 0.6, 1.2, 0.3], [-1.35, 0.35, 0.5, 0.8, 0.45, 0.7, 1.1], [1.4, 0.33, -0.3, 0.9, 0.42, 0.8, 2.0]].forEach(([x, y, z, sx, sy, sz, ry], i) => {
      const g = lump(ICO[1], 0.34, 0.9, i + 1, x, y, z, sx, sy, sz, ry, 0);
      meshOut(m, g.P, g.T, paint);
    });
    // two twisting limbs that part and rejoin, leaving see-through holes (漏, 透)
    taper(m, [[0.3, 0.5, 0], [0.8, 1.5, 0.1], [0.35, 2.5, 0], [-0.55, 3.3, 0.1], [-0.4, 4.25, 0], [0.35, 4.85, 0.05], [0.15, 5.35, 0]],
      t => 0.6 - 0.2 * t + 0.08 * Math.sin(t * 9), perFace(paint), 7, 14, true, warp(3, 0.14));
    taper(m, [[-0.75, 0.5, 0.1], [-0.95, 1.6, 0.2], [-0.6, 2.55, 0.2], [0.25, 3.0, 0.15], [0.9, 3.75, 0.1], [0.6, 4.55, 0.05]],
      t => 0.44 - 0.1 * t, perFace(paint), 7, 10, true, warp(5, 0.12));
    taper(m, [[0.2, 5.15, 0], [-0.55, 5.5, 0.1], [-1.15, 5.2, 0.15]], [0.36, 0.2], perFace(paint), 6, 5, true, warp(7, 0.08));
    const crown = lump(ICO[1], 0.3, 0.9, 9, 0.2, 5.5, 0, 0.8, 0.4, 0.62, 0.5);
    meshOut(m, crown.P, crown.T, paint);
    // one more small hole through the crown's side
    const g = new THREE.TorusGeometry(0.34, 0.15, 5, 10).toNonIndexed();
    g.attributes.position.array.set(g.attributes.position.array.map((v, i) => v + (noise3(i * 0.37, 0, 0, 5) - 0.5) * 0.08));
    g.computeVertexNormals();
    m.geo(g, perFace(paint), 0.95, 5.25, 0.05, 0.2, -0.3, 0.6);
    // a little pine clinging to a ledge, grass at the foot
    taper(m, [[0.55, 3.45, 0.2], [0.95, 3.7, 0.45], [1.35, 3.8, 0.55]], [0.07, 0.03], speck(m, 0x7c4a35, 0.06, 0), 5, 3);
    const needles = perFace((x, y, z, nx, ny) => (ny > 0.45 ? 0x4f8f5f : 0x2f6b4c));
    m.geo(PAD, needles, 1.35, 3.9, 0.55, 0, 0.4, 0, 0.55, 0.5, 0.45);
    m.geo(PAD, needles, 0.95, 3.82, 0.5, 0, 1.4, 0, 0.38, 0.35, 0.32);
    for (const [gx, gz] of [[0.9, 1.05], [-0.5, 1.15], [1.8, 0.3]]) {
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2, h = m.rng.range(0.25, 0.4);
        m.geo(BLADE, m.rng.pick([0x6fb24f, 0x5ca545, 0x86c05a]), gx + Math.cos(a) * 0.04, 0, gz + Math.sin(a) * 0.04, 0, Math.PI / 2 - a, 0, 0.05, h, h * 0.8);
      }
    }
  },
});

// ---- 草垛 haystack: stacked straw wall under an overhanging, weathered thatch cap, pole and knot on top --
def('haystack', {
  name: '草垛',
  cat: 'plant',
  sfx: 'soft',
  fill: 0.7,
  build(m) {
    const seg = 16;
    const prof = [[0, 0], [1.1, 0], [1.19, 0.3], [1.22, 0.85], [1.2, 1.42], [1.37, 1.56], [1.31, 1.68], [1.08, 1.9], [0.76, 2.2], [0.42, 2.53], [0.16, 2.8], [0, 2.87]];
    const g = revolve(prof, seg, ([x, y, z], a) => {
      const k = y > 0 && y < 2.87 ? 1 + (noise3(Math.cos(a) * 2, y * 1.5, Math.sin(a) * 2, 4) - 0.5) * 0.08 : 1;
      return [x * k, y, z * k];
    });
    const wall = [0xe0b855, 0xd4a846, 0xe8c466], cap = [0xc4a262, 0xb59456, 0xcfb070];
    meshOut(m, g.P, g.T, (cx, cy, cz, nx, ny) => {
      if (ny < -0.9) return 0x9a7a3a;
      const col = Math.floor(((Math.atan2(cz, cx) + Math.PI) / (Math.PI * 2)) * seg + 0.5);
      const n = noise3(Math.atan2(cz, cx) * 3, cy * 1.2, 0, 9);
      if (cy > 1.5) return shade(cap[Math.min(2, Math.floor(n * 3))], (0.93 + m.rng.r() * 0.08) * (ny < 0 ? 0.8 : 1));
      return shade(wall[Math.min(2, Math.floor(n * 3))], (col % 2 ? 0.94 : 1.02) * (0.96 + m.rng.r() * 0.06) * (cy < 0.25 ? 0.88 : 1));
    });
    m.torus(1.235, 0.04, 0xa8843e, 0, 0.95, 0, 90 * D, 0, 0, Math.PI * 2, 3, 18);   // straw rope belt
    limb(m, [0.02, 2.5, 0], [0.06, 3.0, 0.02], 0.05, 0.035, 0x8b6a45, 5);           // centre pole
    m.cone(0.2, 0.3, 0xc9a45a, 0.04, 2.9, 0.01, 0, 0, 0.05, 6);                     // top knot
    const straw = [...wall, ...cap];
    for (let i = 0; i < 9; i++) {   // stray straws poking out and lying around
      const a = m.rng.angle(), y = m.rng.range(0.35, 1.35);
      leaf(m, LEAF, m.rng.pick(straw), Math.cos(a) * 1.2, y, Math.sin(a) * 1.2, [Math.cos(a), m.rng.range(-0.4, 0.3), Math.sin(a)], 0.35, 0.03, m.rng.angle());
    }
    for (let i = 0; i < 7; i++) {
      const a = m.rng.angle(), d = m.rng.range(1.25, 1.6);
      m.box(0.45, 0.015, 0.03, m.rng.pick(straw), Math.cos(a) * d, 0.008, Math.sin(a) * d, 0, m.rng.angle(), 0);
    }
  },
});

// ---- 稻草人 scarecrow: 斗笠 straw hat, stitched sack face, patched farmer-blue jacket -----------------
def('scarecrow', {
  name: '稻草人',
  cat: 'plant',
  sfx: 'soft',
  fill: 0.2,
  build(m) {
    const wood = 0x8b6a45, straw = 0xe2c060, cloth = 0x3b5b8c, sack = 0xdcc48f;
    m.cyl(0.035, 0.04, 1.58, wood, 0, 0.79, 0, 0, 0, 0, 6);                   // post
    m.cyl(0.03, 0.03, 1.36, wood, 0, 1.22, 0, 0, 0, 90 * D, 6);               // crossbar
    m.cyl(0.2, 0.27, 0.2, perFace(() => shade(straw, 0.85 + m.rng.r() * 0.2)), 0, 0.58, 0, 0, 0, 0, 10);   // straw skirt
    m.rbox(0.48, 0.6, 0.26, 0.06, cloth, 0, 0.96, 0);                        // jacket
    m.sym(s => {
      m.cyl(0.088, 0.076, 0.44, cloth, s * 0.43, 1.22, 0, 0, 0, -s * 90 * D, 7);   // sleeve, wider at the cuff
      m.cone(0.07, 0.16, straw, s * 0.72, 1.22, 0, 0, 0, -s * 90 * D, 6);          // straw hands
      m.box(0.03, 0.03, 0.015, 0xe8d9b0, s * 0.0, 1.1 - (s + 1) * 0.1, 0.135);      // buttons
    });
    m.decal(0.11, 0.11, 'na_patch', -0.12, 1.04, 0.1315, 0, 0, 0.12, 0xd8594c);
    m.decal(0.1, 0.1, 'na_patch', 0.13, 0.82, 0.1315, 0, 0, -0.2, 0xe8b84a);
    m.decal(0.08, 0.08, 'na_patch', 0.44, 1.22, 0.092, 0, 0, 0.3, 0x8fbf6a);
    m.plane(0.07, 0.32, 0xd8342c, -0.7, 1.06, 0.03, 0, 0.3, 0.12);            // red rag tied to a wrist
    // head
    m.cyl(0.07, 0.1, 0.08, straw, 0, 1.32, 0, 0, 0, 0, 8);                    // straw collar
    m.sphere(0.165, sack, 0, 1.49, 0, 1, 1.05, 0.95, 0, 0, 0, 9);
    m.torus(0.078, 0.016, 0x7a5a36, 0, 1.355, 0, 90 * D, 0, 0, Math.PI * 2, 4, 10);   // neck tie
    m.decal(0.23, 0.23, 'na_scarecrow_face', 0, 1.48, 0.1595);
    m.cone(0.34, 0.16, perFace(() => shade(0xd9b66a, 0.9 + m.rng.r() * 0.15)), 0, 1.68, 0, 0, 0, 0.08, 12);   // 斗笠
    m.sphere(0.028, 0x9a6a3a, 0.006, 1.77, 0, 1, 1, 1, 0, 0, 0, 6);
  },
});

// ---- 稻穗捆 rice sheaf: tied bundle of golden straw with drooping ears of grain ---------------------
def('rice_bundle', {
  name: '稻穗捆',
  cat: 'plant',
  sfx: 'soft',
  fill: 0.45,
  build(m) {
    const prof = [[0, 0], [0.15, 0], [0.125, 0.12], [0.09, 0.28], [0.075, 0.36], [0.088, 0.44], [0.125, 0.55], [0.15, 0.62], [0.09, 0.645], [0, 0.65]];
    const g = revolve(prof, 11);
    const straws = [0xd9b35a, 0xc9a04a, 0xe3c46e, 0xd0aa52];
    meshOut(m, g.P, g.T, (cx, cy, cz, nx, ny) => (ny < -0.9 ? 0xa88a4a : shade(straws[Math.floor(noise3(Math.atan2(cz, cx) * 3, cy * 2, 0, 5) * 4) % 4], 0.94 + m.rng.r() * 0.1)));
    m.cyl(0.082, 0.082, 0.05, 0xa07a34, 0, 0.36, 0, 0, 0, 0, 11);              // straw tie
    const ears = [0xe6bd52, 0xdcae44, 0xeac867];
    const ear = pts => taper(m, pts, t => 0.017 * (1 - t * 0.6), speck(m, m.rng.pick(ears), 0.1, 0), 3, 4, false);
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2 + m.rng.range(-0.15, 0.15), c = Math.cos(a), s = Math.sin(a);
      const up = m.rng.range(0.1, 0.15), out = m.rng.range(0.22, 0.28);
      ear([[c * 0.09, 0.63, s * 0.09], [c * 0.16, 0.63 + up, s * 0.16], [c * out, 0.62 + up * 0.7, s * out], [c * (out + 0.04), 0.5, s * (out + 0.04)]]);
    }
    for (let i = 0; i < 4; i++) {
      const a = i * 1.57 + 0.4, c = Math.cos(a), s = Math.sin(a);
      ear([[c * 0.02, 0.64, s * 0.02], [c * 0.05, 0.775, s * 0.05], [c * 0.14, 0.76, s * 0.14], [c * 0.18, 0.64, s * 0.18]]);
    }
  },
});

// =================================================================================================
// hills, mountains, clouds
// =================================================================================================

/** up to n random faces of (P, T) accepted by ok(cx, cy, cz, ny) → [[cx, cy, cz, ny], ...] */
function pickFaces(m, P, T, n, ok, tries = 5000) {
  const out = [];
  for (let i = 0; i < tries && out.length < n; i++) {
    const t = T[m.rng.int(0, T.length - 1)], a = P[t[0]], b = P[t[1]], c = P[t[2]];
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx, l = Math.hypot(nx, ny, nz) || 1;
    const cx = (a[0] + b[0] + c[0]) / 3, cy = (a[1] + b[1] + c[1]) / 3, cz = (a[2] + b[2] + c[2]) / 3;
    if (ok(cx, cy, cz, ny / l)) out.push([cx, cy, cz, ny / l]);
  }
  return out;
}

/** height of the surface (P, T) above the point (x, z): barycentric on the covering triangle */
function groundAt(P, T, x, z) {
  for (const [a, b, c] of T) {
    const A = P[a], B = P[b], C = P[c];
    if (A[1] + B[1] + C[1] <= 0) continue;
    const d = (B[2] - C[2]) * (A[0] - C[0]) + (C[0] - B[0]) * (A[2] - C[2]);
    if (Math.abs(d) < 1e-9) continue;
    const l1 = ((B[2] - C[2]) * (x - C[0]) + (C[0] - B[0]) * (z - C[2])) / d;
    const l2 = ((C[2] - A[2]) * (x - C[0]) + (A[0] - C[0]) * (z - C[2])) / d;
    if (l1 >= 0 && l2 >= 0 && l1 + l2 <= 1) return l1 * A[1] + l2 * B[1] + (1 - l1 - l2) * C[1];
  }
  return 0;
}

/** small hexagonal pavilion (六角亭): stone base, red columns, dark tiled roof, gold finial */
function pavilion(m, x, y, z, s, ry = 0) {
  m.push(x, y, z, 0, ry, 0, s);
  m.cyl(2.6, 2.8, 0.7, 0xb9b2a2, 0, 0.25, 0, 0, 0, 0, 6);
  for (let i = 0; i < 6; i++) {
    const a = Math.PI / 6 + (i / 6) * Math.PI * 2;
    m.box(0.36, 2.7, 0.36, 0xc8342c, Math.cos(a) * 2.05, 1.95, Math.sin(a) * 2.05, 0, -a, 0);
  }
  m.cyl(3.3, 3.55, 0.35, 0x3d4f55, 0, 3.42, 0, 0, 0, 0, 6);
  m.cone(3.15, 2.2, 0x4a6066, 0, 4.7, 0, 0, 0, 0, 6);
  m.cone(0.36, 1.1, 0xe8b84a, 0, 6.2, 0, 0, 0, 0, 5);
  m.pop();
}

// ---- 小山坡 gentle grassy hill with a footpath, wildflowers, a few trees and rocks -------------------
def('hill_small', {
  name: '小山坡',
  cat: 'nature',
  sfx: 'gong',
  fill: 0.4,
  build(m) {
    const R = 40, H = 13, prof = [];
    for (let i = 0; i <= 20; i++) { const x = i / 20; prof.push([x * R, H * (1 - x * x) ** 2]); }
    const g = hexRevolve(16, prof, (p, n, u) => {
      const b = 3.2 * Math.exp(-((p[0] + 12) ** 2 + (p[2] - 9) ** 2) / 150);
      return (b + (fbm(p[0] / 13 + 4, p[1] / 13, p[2] / 13, 31, 3) - 0.5) * 3.2) * (1 - u * u);
    });
    wobble(g.P, 0.1, 7);
    fitTo(g.P, 80, Math.max(...g.P.map(p => p[1])));
    const path = [];
    for (let i = 0; i <= 40; i++) { const t = i / 40, r = R * (0.97 - 0.85 * t), a = 0.9 + t * 4.4; path.push([Math.cos(a) * r, Math.sin(a) * r]); }
    const pathDist = (x, z) => {
      let best = 1e9;
      for (let i = 0; i < path.length - 1; i++) {
        const [ax, az] = path[i], [bx, bz] = path[i + 1], dx = bx - ax, dz = bz - az;
        const t = clamp01(((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz));
        best = Math.min(best, Math.hypot(x - ax - dx * t, z - az - dz * t));
      }
      return best;
    };
    const grass = [0x7cbf5a, 0x86c662, 0x72b552, 0x8ecb68];
    meshOut(m, g.P, g.T, (cx, cy, cz, nx, ny) => {
      if (ny < -0.5) return 0x5e4a36;
      if (pathDist(cx, cz) < 1.25) return shade(0xcdb88c, 0.95 + m.rng.r() * 0.08);
      const c = mix(m.rng.pick(grass), 0xa6d479, clamp01(cy / H) * 0.4);
      if (m.rng.r() < 0.025) return mix(c, m.rng.pick([0xf2df6a, 0xf4f2ec, 0xf2a6c0]), 0.6);
      return shade(c, (0.93 + m.rng.r() * 0.1) * (0.9 + 0.1 * ny));
    });
    const spots = [[-14, 11], [-8, 18], [10, -4], [19, 8], [-3, -19], [4, 14], [-25, 4], [16, -15], [-17, -13]].filter(([x, z]) => pathDist(x, z) > 3.2);
    spots.slice(0, 7).forEach(([x, z], i) => {
      const y = groundAt(g.P, g.T, x, z) - 0.25, s = m.rng.range(0.85, 1.1);
      if (i % 3 === 2) {   // conifer
        m.cyl(0.16 * s, 0.22 * s, 2 * s, 0x6a4a36, x, y + s, z, 0, 0, 0, 5);
        for (let k = 0; k < 3; k++) m.cone((2.0 - k * 0.5) * s, (2.8 - k * 0.3) * s, speck(m, 0x2f6b4c, 0.05, 0.1), x, y + (2.6 + k * 1.5) * s, z, 0, k, 0, 7);
      } else {
        m.cyl(0.2 * s, 0.28 * s, 3.4 * s, 0x7a5a40, x, y + 1.7 * s, z, 0, 0, 0, 5);
        blob(m, 1.9 * s, speck(m, m.rng.pick([0x4f9a4a, 0x5cae4f, 0x3f8f4a])), x, y + 4.4 * s, z, 1, 0.95, 1);
        blob(m, 1.25 * s, speck(m, 0x6db85a), x + 0.9 * s, y + 5.5 * s, z - 0.4 * s, 1, 1, 1, DOD);
      }
    });
    for (const [x, z, r] of [[7, 20, 1.3], [-20, -3, 1.0], [23, -6, 0.9]]) {
      const y = groundAt(g.P, g.T, x, z);
      const k = lump(ICO[0], 0.25, 1.2, x, x, y + r * 0.3, z, r * 1.3, r * 0.8, r, x);
      meshOut(m, k.P, k.T, stonePaint(m, 1));
    }
  },
});

// ---- 青山 green mountain: a family of rounded peaks (山), forest dots (苔点), 青绿 blue-green summits ----
def('mountain_green', {
  name: '青山',
  cat: 'nature',
  sfx: 'gong',
  fill: 0.4,
  build(m) {
    const R = 150;
    const peaks = [[-5, -15, 205, 118], [-80, 20, 150, 74], [72, 8, 135, 70], [22, 72, 88, 58], [32, -82, 112, 62]];
    const hf = (x, z) => {
      let h = -1e9;
      for (const [px, pz, ph, pr] of peaks) h = smax(h, ph * spow(1 - ((x - px) ** 2 + (z - pz) ** 2) / (pr * pr), 1.6), 22);
      const d = Math.hypot(x + 5, z + 15), a = Math.atan2(z + 15, x + 5);
      h += (ridged(Math.cos(a) * 3 + 3, Math.sin(a) * 3, d / 55, 41) - 0.45) * 18 * sstep(8, 50, d);
      return h + (fbm(x / 22, 0, z / 22, 43, 3) - 0.5) * 12;
    };
    const g = hexField(18, R, hf);
    const fit = fitTo(g.P, 300, 220);
    meshOut(m, g.P, g.T, (cx, cy, cz, nx, ny) => {
      if (ny < -0.9) return 0x5b4a38;
      const h = cy / 220;
      let c = h < 0.25 ? mix(0x8ab85f, 0x5a9e58, h / 0.25) : h < 0.6 ? mix(0x5a9e58, 0x3d8c62, (h - 0.25) / 0.35) : mix(0x3d8c62, 0x4f9c92, (h - 0.6) / 0.4);
      if (fbm(cx / 28, cy / 28, cz / 28, 47, 2) > 0.56) c = shade(c, 0.87);          // darker forest patches
      if (ny < 0.5) c = mix(c, 0x8e9784, clamp01((0.5 - ny) / 0.3) * 0.55);          // grey-green cliffs
      return shade(c, 0.96 + m.rng.r() * 0.07);
    });
    for (const [x, y, z] of pickFaces(m, g.P, g.T, 46, (x, y, z, ny) => ny > 0.62 && y > 8 && y < 205)) {
      m.cone(m.rng.range(3, 4.2), m.rng.range(9, 13), speck(m, m.rng.pick([0x2f6b45, 0x3a7a4e, 0x346f48]), 0.05, 0.1), x, y + 4, z, 0, m.rng.angle(), 0, 5);
    }
    // a red pavilion on the top of the left peak
    const hx = (peaks[1][0] - fit.cx) * fit.k, hz = (peaks[1][1] - fit.cz) * fit.k;
    let top = null;
    for (const p of g.P) if (Math.hypot(p[0] - hx, p[2] - hz) < 30 && (!top || p[1] > top[1])) top = p;
    if (top) pavilion(m, top[0], top[1] - 1.5, top[2], 1.5, 0.3);
  },
});

// ---- 石山 rocky mountain: sharp three-ridged summits, radiating gullies, forest foot, snow cap --------
def('mountain_rocky', {
  name: '石山',
  cat: 'nature',
  sfx: 'gong',
  fill: 0.35,
  build(m) {
    const R = 200;
    const peaks = [[-8, 4, 315, 180, 0.3], [92, -52, 232, 88, 1.1], [-104, 34, 200, 82, 2.3], [34, 98, 138, 66, 4.0], [70, 70, 110, 60, 5.0]];
    const hf = (x, z) => {
      let h = -1e9;
      for (const [px, pz, ph, pr, rot] of peaks) {
        const d = Math.hypot(x - px, z - pz), a = Math.atan2(z - pz, x - px);
        h = smax(h, ph * spow(1 - (d / pr) * (1 + 0.16 * Math.cos(3 * (a - rot))), 1.25), 16);
      }
      const d = Math.hypot(x, z), a = Math.atan2(z, x);
      h += (ridged(Math.cos(a) * 2.6 + 9, Math.sin(a) * 2.6, d / 70, 51, 4) - 0.42) * 38 * sstep(6, 40, d);
      return h + (fbm(x / 18, 0, z / 18, 53, 2) - 0.5) * 10;
    };
    const g = hexField(20, R, hf);
    fitTo(g.P, 400, 320);
    meshOut(m, g.P, g.T, (cx, cy, cz, nx, ny) => {
      if (ny < -0.9) return 0x55504a;
      const h = cy / 320, v = fbm(cx / 50, 0, cz / 50, 57, 2), snowLine = 0.5 + (v - 0.5) * 0.22;
      if (h > snowLine && ny > 0.36) return shade(ny > 0.7 ? 0xf3f5f7 : 0xdfe7ef, 0.98 + m.rng.r() * 0.03);
      const rock = mix(0x8b9096, 0x9a9288, noise3(cx / 40, cy / 25, cz / 40, 59));
      if (h > snowLine) return shade(mix(rock, 0x5f646a, 0.4), 0.95 + m.rng.r() * 0.06);
      if (h < 0.26 + (v - 0.5) * 0.2 && ny > 0.5) return shade(mix(0x4f7f4f, 0x5e8f55, v), 0.94 + m.rng.r() * 0.08);
      if (h < 0.05) return shade(0x7d9a5a, 0.96 + m.rng.r() * 0.06);
      return shade(rock, (0.95 + m.rng.r() * 0.07) * (0.86 + 0.14 * ny));
    });
    for (const [x, y, z] of pickFaces(m, g.P, g.T, 22, (x, y, z, ny) => ny > 0.6 && y > 3 && y < 70)) {
      m.cone(m.rng.range(3.5, 5), m.rng.range(11, 15), speck(m, m.rng.pick([0x2d5e40, 0x35684a]), 0.05, 0.1), x, y + 4.5, z, 0, m.rng.angle(), 0, 5);
    }
  },
});

// ---- 桂林山 karst peaks: three tall, sheer, green-capped limestone towers on a shared green foot -----
def('mountain_karst', {
  name: '桂林山',
  cat: 'nature',
  sfx: 'gong',
  fill: 0.3,
  build(m) {
    const shape = [[0, 1], [0.3, 0.988], [0.52, 0.95], [0.7, 0.88], [0.82, 0.78], [0.9, 0.65], [0.96, 0.5], [1.02, 0.36], [1.1, 0.22], [1.24, 0.11], [1.44, 0.035], [1.6, 0]];
    const towers = [[-8, -6, 24, 150, 13, 0.06, 0.03], [33, 14, 19, 110, 11, 0.1, -0.02], [-36, 20, 16, 82, 10, -0.08, 0.05]];
    const P = [], T = [];
    const add = g => { const o = P.length; P.push(...g.P); g.T.forEach(t => T.push([t[0] + o, t[1] + o, t[2] + o])); };
    towers.forEach(([tx, tz, r, H, K, lx, lz], ti) => {
      const g = hexRevolve(K, shape.map(([a, b]) => [a * r, b * H]), (p, n, u, th) =>
        (fbm(Math.cos(th) * 3 + ti * 7, Math.sin(th) * 3, (p[1] / H) * 1.6, 61 + ti, 3) - 0.5) * 2 * 0.18 * r * sstep(1.0, 0.9, u));
      g.P.forEach(p => { p[0] += tx + lx * p[1]; p[2] += tz + lz * p[1]; });
      add(g);
    });
    const mound = hexRevolve(6, [[0, 9], [20, 8], [40, 5], [58, 0]], (p, n, u) => (fbm(p[0] / 12, 0, p[2] / 12, 67, 2) - 0.5) * 4 * (1 - u));
    wobble(mound.P, 0.14, 3);
    const moundFrom = T.length;
    add(mound);
    fitTo(P, 120, 150);
    meshOut(m, P, T, (cx, cy, cz, nx, ny, nz, i) => {
      if (ny < -0.9) return 0x4f5a4a;
      // the Li river winding past the front of the peaks (桂林山水)
      if (i >= moundFrom && cy < 3.4 && cz + 0.25 * cx > 8 + (noise3(cx / 14, 0, 0, 75) - 0.5) * 14) return shade(0x74b6c6, 0.97 + m.rng.r() * 0.06);
      const h = cy / 150, n = fbm(cx / 13, cy / 13, cz / 13, 69, 2);
      let c;
      if (ny > 0.06 + (n - 0.5) * 1.5) {
        c = mix(mix(0x4f9058, 0x3f7d4c, noise3(cx / 9, cy / 9, cz / 9, 71)), 0x2f6b48, h > 0.55 ? 0.3 : 0);
      } else {
        const s = noise3(cx / 5, cy / 30, cz / 5, 73);
        c = s > 0.64 ? 0x707b77 : s < 0.3 ? 0xb0a78f : mix(0x98a19d, 0xa7ada4, s);
      }
      return shade(mix(c, 0x8fb0b8, h * 0.2), 0.95 + m.rng.r() * 0.07);
    });
  },
});

// ---- 云朵 cloud: merged puffs with a flat, slightly shaded bottom (the game lifts it into the sky) ----
def('cloud', {
  name: '云朵',
  cat: 'nature',
  sfx: 'soft',
  fill: 0.5,
  build(m) {
    const puffs = [[0, 9, 0, 13, 2], [-14, 7, 2, 10, 2], [15, 6.5, -1, 10.5, 2], [-24, 4.5, 0, 6.5, 1], [25, 4.2, 1, 6, 1], [-5, 16, -2, 8.5, 1],
      [6, 15, 3, 7.5, 1], [-3, 6, 9, 8, 1], [4, 6, -9, 8, 1], [-13, 5, -7, 6.5, 1], [13, 5, 8, 6.5, 1]];
    puffs.forEach(([x, y, z, r, d], i) => {
      const g = lump(ICO[d], 0.1, 1.1, i * 3 + 1, x, y, z, r, r * 0.88, r, 0, 0);
      meshOut(m, g.P, g.T, (cx, cy, cz, nx, ny) => (ny < -0.8 ? 0xd4dce8 : shade(mix(0xe2e9f1, 0xfbfbf9, clamp01((ny + 0.3) / 1.1)), 0.99 + m.rng.r() * 0.02)));
    });
  },
});
