// The shape of the ground on a hole that isn't flat: how high the green stands at each point, from the
// hole's `ground` list. Everything is given in map units, (column, row) like the rest of a hole, and
// heights in metres; the shapes add up:
//   { t: 'ramp', from: [c, r], to: [c, r], h }   rises by h going from `from` to `to`: flat before and
//                                                 after, an even slope between with its ends rounded
//   { t: 'hill', at: [c, r], r, h }               a round mound r metres from its top to its foot (a
//                                                 hollow, a bowl round a cup, with h below zero)
//   { t: 'ridge', from: [c, r], to: [c, r], w, h }  a long hump w metres across, along the line
// Returns { h(x, z), grad(x, z) } in world metres (grad: the rise per metre along x and z, written
// into a shared pair), or null for a flat hole.
const E = 0.3; // (the share of a ramp at each end that curves into the flat)
const G2 = [0, 0];

export function ground(list, at) {
  if (!list || !list.length) return null;
  const parts = list.map(d => {
    if (d.t === 'ramp') {
      const a = at(...d.from), b = at(...d.to), dx = b.x - a.x, dz = b.z - a.z, L2 = dx * dx + dz * dz;
      return { kind: 0, ax: a.x, az: a.z, dx, dz, L2, h: d.h };
    }
    if (d.t === 'hill') { const p = at(...d.at); return { kind: 1, x: p.x, z: p.z, r: d.r, h: d.h }; }
    if (d.t === 'ridge') {
      const a = at(...d.from), b = at(...d.to), dx = b.x - a.x, dz = b.z - a.z;
      return { kind: 2, ax: a.x, az: a.z, dx, dz, L2: dx * dx + dz * dz, r: d.w / 2, h: d.h };
    }
    throw new Error('ground: ' + d.t);
  });
  // a ramp's profile over u (0 at its foot, 1 at its top) and its slope
  const k = 1 / (2 * E * (1 - E));
  const rise = u => (u <= 0 ? 0 : u >= 1 ? 1 : u < E ? u * u * k : u > 1 - E ? 1 - (1 - u) * (1 - u) * k : (u - E / 2) / (1 - E));
  const riseD = u => (u <= 0 || u >= 1 ? 0 : u < E ? 2 * u * k : u > 1 - E ? 2 * (1 - u) * k : 1 / (1 - E));
  // a mound's profile over its distance from the top, d < r (a cosine: round on top, easing out at the foot)
  const bump = (d, r) => 0.5 + 0.5 * Math.cos((Math.PI * d) / r);
  const bumpD = (d, r) => (-0.5 * Math.PI * Math.sin((Math.PI * d) / r)) / r;
  return {
    h(x, z) {
      let y = 0;
      for (const p of parts) {
        if (p.kind === 0) y += p.h * rise(((x - p.ax) * p.dx + (z - p.az) * p.dz) / p.L2);
        else {
          offset(p, x, z);
          const d = Math.hypot(OX, OZ);
          if (d < p.r) y += p.h * bump(d, p.r);
        }
      }
      return y;
    },
    grad(x, z) {
      let gx = 0, gz = 0;
      for (const p of parts) {
        if (p.kind === 0) {
          const s = (p.h * riseD(((x - p.ax) * p.dx + (z - p.az) * p.dz) / p.L2)) / p.L2;
          gx += s * p.dx; gz += s * p.dz;
        } else {
          offset(p, x, z);
          const d = Math.hypot(OX, OZ);
          if (d < p.r && d > 1e-6) { const s = (p.h * bumpD(d, p.r)) / d; gx += s * OX; gz += s * OZ; }
        }
      }
      G2[0] = gx; G2[1] = gz;
      return G2;
    },
  };
}

/** from the nearest point of a mound's top (its middle, or along a ridge's line) to (x, z), into
 *  OX, OZ (it runs many times a frame while aiming: no new arrays) */
let OX = 0, OZ = 0;
function offset(p, x, z) {
  if (p.kind === 1) { OX = x - p.x; OZ = z - p.z; return; }
  const t = Math.max(0, Math.min(1, ((x - p.ax) * p.dx + (z - p.az) * p.dz) / p.L2));
  OX = x - (p.ax + p.dx * t); OZ = z - (p.az + p.dz * t);
}
