// The ball: a small 五色石 rolling on the flat green. Rolling slows it by a constant drag plus one
// that grows with speed (a hard shot runs out quickly at first, a soft putt creeps on), it bounces
// off the course's walls and the things on it, fans blow it along, and near the hole a gentle pull
// curls a ball that is nearly there into it. A ball over the hole drops in unless it is too fast,
// in which case it rattles over the lip and carries on, a little turned and slowed.
//
// Colliders, in world metres on the ground plane:
//   { kind: 'seg', ax, az, bx, bz }                  a wall face
//   { kind: 'circle', x, z, r }                      a post, an animal
//   { kind: 'box', x, z, hx, hz, rot }               anything boxy, turned by rot about y
// each may carry e (bounciness, default the walls'), vx / vz (it is moving: it shoves the ball).
export const BALL_R = 0.16, CUP_R = 0.25;
export const PHYS = {
  a0: 1.1, // constant rolling drag, m/s²
  k: 0.45, // drag per m/s of speed, 1/s
  vmin: 0.7, vmax: 11, // shot speed at the least and the most power
  rest: 0.08, // below this the ball has stopped
  wallE: 0.72, // how much speed a wall gives back
  capture: 3.0, // the hole takes a ball slower than this
  pull: 2.4, pullR: 0.5, // the hole's pull (m/s²) and its reach (m)
};

const CT = { nx: 0, nz: 0, depth: 0 };
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

/** where the ball (at px, pz, radius r) overlaps the collider: the push-out normal and depth */
export function contact(c, px, pz, r, out = CT) {
  if (c.kind === 'circle') {
    const dx = px - c.x, dz = pz - c.z, d = Math.hypot(dx, dz), rr = r + c.r;
    if (d >= rr) return null;
    if (d < 1e-6) { out.nx = 1; out.nz = 0; out.depth = rr; return out; }
    out.nx = dx / d; out.nz = dz / d; out.depth = rr - d;
    return out;
  }
  if (c.kind === 'seg') {
    const dx = c.bx - c.ax, dz = c.bz - c.az;
    const t = clamp(((px - c.ax) * dx + (pz - c.az) * dz) / (dx * dx + dz * dz), 0, 1);
    const ex = px - (c.ax + dx * t), ez = pz - (c.az + dz * t), d = Math.hypot(ex, ez);
    if (d >= r || d < 1e-6) return null;
    out.nx = ex / d; out.nz = ez / d; out.depth = r - d;
    return out;
  }
  // box: into its own frame (three.js turns +x towards -z for a positive rot about y)
  const cs = Math.cos(c.rot || 0), sn = Math.sin(c.rot || 0);
  const dx = px - c.x, dz = pz - c.z;
  const lx = dx * cs - dz * sn, lz = dx * sn + dz * cs;
  let nx, nz, depth;
  if (Math.abs(lx) <= c.hx && Math.abs(lz) <= c.hz) {
    // the centre is inside: out through the nearest face
    const fx = c.hx - Math.abs(lx), fz = c.hz - Math.abs(lz);
    if (fx < fz) { nx = Math.sign(lx) || 1; nz = 0; depth = fx + r; }
    else { nx = 0; nz = Math.sign(lz) || 1; depth = fz + r; }
  } else {
    const qx = clamp(lx, -c.hx, c.hx), qz = clamp(lz, -c.hz, c.hz);
    const ex = lx - qx, ez = lz - qz, d = Math.hypot(ex, ez);
    if (d >= r) return null;
    nx = ex / d; nz = ez / d; depth = r - d;
  }
  out.nx = nx * cs + nz * sn;
  out.nz = -nx * sn + nz * cs;
  out.depth = depth;
  return out;
}

/** a wind zone (a fan): from (x, z) along the unit (dx, dz) for len metres, w wide, pushing at a;
 *  how hard it pushes at (x, z) */
function gust(w, x, z) {
  const rx = x - w.x, rz = z - w.z;
  const along = rx * w.dx + rz * w.dz, side = -rx * w.dz + rz * w.dx;
  if (along < 0 || along > w.len || Math.abs(side) > w.w / 2) return 0;
  return w.a * (1 - (along / w.len) * 0.5) * (1 - Math.abs(side) / w.w);
}
function blow(b, w, h) {
  const f = gust(w, b.x, b.z);
  b.vx += w.dx * f * h;
  b.vz += w.dz * f * h;
}
/** the strongest wind at (x, z) */
export const windAt = (course, x, z) => Math.max(0, ...course.winds.map(w => gust(w, x, z)));

/**
 * Moves the ball b ({x, z, vx, vz, lip}) on for dt. Returns 'sunk' when it drops into the hole.
 * onHit(collider, speedInto) for each bounce worth hearing.
 */
export function stepBall(b, course, dt, onHit) {
  const cols = course.cols, winds = course.winds, cup = course.cup;
  const sp = Math.hypot(b.vx, b.vz);
  // small enough steps that the ball never jumps a wall
  const n = Math.min(24, Math.max(1, Math.ceil((sp * dt) / (BALL_R * 0.45))));
  const h = dt / n;
  for (let i = 0; i < n; i++) {
    for (const w of winds) blow(b, w, h);
    let s = Math.hypot(b.vx, b.vz);
    if (s > 0) {
      const ns = Math.max(0, s - (PHYS.a0 + PHYS.k * s) * h);
      b.vx *= ns / s; b.vz *= ns / s;
      s = ns;
    }
    // the hole: a pull towards it when close and not too quick, and in it goes if slow enough
    const cx = cup.x - b.x, cz = cup.z - b.z, cd = Math.hypot(cx, cz);
    // (only a rolling ball: one at rest beside the hole stays where it stopped)
    if (cd < PHYS.pullR && s > PHYS.rest && s < PHYS.capture && cd > 1e-4) {
      const p = PHYS.pull * (1 - cd / PHYS.pullR);
      b.vx += (cx / cd) * p * h; b.vz += (cz / cd) * p * h;
    }
    b.x += b.vx * h;
    b.z += b.vz * h;
    b.lip = Math.max(0, (b.lip || 0) - h);
    if (cd < CUP_R) {
      if (s < PHYS.capture) return 'sunk';
      if (!b.lip) {
        // too fast: over the lip, turned a little towards the side it came in on, and slowed
        const side = Math.sign(cx * b.vz - cz * b.vx) || 1;
        const a = 0.35 * side, c = Math.cos(a), sn = Math.sin(a);
        const vx = b.vx * c - b.vz * sn, vz = b.vx * sn + b.vz * c;
        b.vx = vx * 0.72; b.vz = vz * 0.72;
        b.lip = 0.25;
        if (onHit) onHit({ lip: true }, s);
      }
    }
    for (const c of cols) {
      if (!contact(c, b.x, b.z, BALL_R)) continue;
      b.x += CT.nx * CT.depth;
      b.z += CT.nz * CT.depth;
      const rvx = b.vx - (c.vx || 0), rvz = b.vz - (c.vz || 0);
      const vn = rvx * CT.nx + rvz * CT.nz;
      if (vn < 0) {
        const e = c.e ?? PHYS.wallE;
        b.vx -= (1 + e) * vn * CT.nx;
        b.vz -= (1 + e) * vn * CT.nz;
        // a little grip along the face
        const tx = -CT.nz, tz = CT.nx, vt = rvx * tx + rvz * tz;
        b.vx -= vt * 0.06 * tx;
        b.vz -= vt * 0.06 * tz;
        if (onHit) onHit(c, -vn);
      }
    }
  }
  return null;
}

/** the speed a shot of power p (0..1) sends the ball off at */
export const shotSpeed = p => PHYS.vmin + (PHYS.vmax - PHYS.vmin) * p;

/**
 * Plays a shot out on the course as it stands (moving things where they are now, held still):
 * the path as points every `every` metres, and whether it drops. For the aiming guide and tests.
 */
export function simulate(course, x, z, ang, p, { maxT = 12, every = 0.3, stopAfterHits = Infinity, maxLen = Infinity } = {}) {
  const v = shotSpeed(p);
  const b = { x, z, vx: Math.sin(ang) * v, vz: -Math.cos(ang) * v, lip: 0 };
  const pts = [[x, z]];
  let hits = 0, run = 0, since = 0, lx = x, lz = z, sunk = false;
  const dt = 1 / 60;
  for (let t = 0; t < maxT; t += dt) {
    const r = stepBall(b, course, dt, (c, s) => { if (s > 0.3 && !c.lip) hits++; });
    if (r === 'sunk') { sunk = true; pts.push([course.cup.x, course.cup.z]); break; }
    const d = Math.hypot(b.x - lx, b.z - lz);
    run += d; since += d; lx = b.x; lz = b.z;
    if (since >= every) { pts.push([b.x, b.z]); since = 0; }
    if (hits > stopAfterHits || run > maxLen) break;
    if (Math.hypot(b.vx, b.vz) < PHYS.rest) break;
  }
  return { pts, sunk, x: b.x, z: b.z, hits };
}
