// Turns catalog specs into geometry + physical metrics used by the game (pickup size, collision shape).
import * as THREE from 'three';
import { Model } from './modeler.js';
import { hashString } from './rng.js';

export function buildSpec(spec) {
  if (spec.geometry) return spec;
  const m = new Model(hashString(spec.id));
  spec.build(m, spec);
  const g = m.build();
  const bb = g.boundingBox;
  const w = bb.max.x - bb.min.x;
  const h = bb.max.y - bb.min.y;
  const d = bb.max.z - bb.min.z;
  const dims = [w, h, d].sort((a, b) => b - a);
  spec.geometry = g;
  spec.dims = { w, h, d };
  spec.bbox = bb.clone();
  spec.center = new THREE.Vector3((bb.min.x + bb.max.x) / 2, h / 2, (bb.min.z + bb.max.z) / 2);
  // "how big it feels": mean of the three extents, so long thin things count less than their length
  spec.pickSize = ((dims[0] + dims[1] + dims[2]) / 3) * (spec.pickScale ?? 1);
  spec.maxDim = dims[0];
  spec.volume = w * h * d * (spec.fill ?? 0.45);
  spec.radius = g.boundingSphere.radius;
  const footprintAspect = Math.max(w, d) / Math.max(1e-6, Math.min(w, d));
  // round if the footprint is about as deep as wide and the base doesn't fill its corners; houses
  // and shops are always boxes (as cylinders the ball would sink into their corners)
  spec.shape = spec.shape || (spec.cat !== 'building' && footprintAspect < 1.5 && cornerShare(g, bb) < 0.15 ? 'cyl' : 'box');
  spec.tris = m.tris;
  if (!spec.hits && !spec.hit) spec.autoHits = sliceHits(spec, g);
  spec.draws = m.draws; // kept for the coarse stand-in, built later (see wantCoarse)
  buildLod(spec, g, m.draws);
  return spec;
}

/** share of the lower third's vertices out in the corners, beyond the ellipse inscribed in their outline */
function cornerShare(g, bb) {
  const p = g.attributes.position.array;
  const top = bb.min.y + (bb.max.y - bb.min.y) / 3;
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (let i = 0; i < p.length; i += 3) {
    if (p[i + 1] > top) continue;
    x0 = Math.min(x0, p[i]); x1 = Math.max(x1, p[i]);
    z0 = Math.min(z0, p[i + 2]); z1 = Math.max(z1, p[i + 2]);
  }
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, rx = Math.max(1e-6, (x1 - x0) / 2), rz = Math.max(1e-6, (z1 - z0) / 2);
  let n = 0, out = 0;
  for (let i = 0; i < p.length; i += 3) {
    if (p[i + 1] > top) continue;
    const u = (p[i] - cx) / rx, v = (p[i + 2] - cz) / rz;
    n++;
    if (u * u + v * v > 1.15) out++;
  }
  return n ? out / n : 0;
}

/**
 * Collision boxes that follow a model up its height, for things that overhang their base: lamp-posts
 * and their arms, cranes, billboards, pavilion roofs, a shop's awning, a house's balconies, a
 * scarecrow's arms… Without them the ball would stop against thin air under the overhang, with
 * nothing on screen to say why. The footprint of each horizontal slice (triangles clipped to it,
 * slices finer near the ground where a small ball touches), alike neighbours merged. Null when the
 * base fills the outline anyway: ordinary things keep their one box or cylinder.
 */
function sliceHits(spec, g) {
  const pos = g.attributes.position.array, index = g.index ? g.index.array : null;
  const bb = spec.bbox, H = spec.dims.h, y0 = bb.min.y;
  // small things are taken early on anyway; not worth the extra contact tests
  if (!(H > 0) || Math.max(spec.dims.w, spec.dims.d) < 0.8) return null;
  const cuts = [0, 1 / 12, 1 / 6, 1 / 3, 1 / 2, 2 / 3, 5 / 6, 1].map(f => y0 + f * H);
  const N = cuts.length - 1;
  const box = Array.from({ length: N }, () => [Infinity, -Infinity, Infinity, -Infinity]);
  const add = (k, x, z) => {
    const b = box[k];
    if (x < b[0]) b[0] = x;
    if (x > b[1]) b[1] = x;
    if (z < b[2]) b[2] = z;
    if (z > b[3]) b[3] = z;
  };
  const P = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  const n = (index ? index.length : pos.length / 3) / 3;
  for (let t = 0; t < n; t++) {
    let lo = Infinity, hi = -Infinity;
    for (let j = 0; j < 3; j++) {
      const o = (index ? index[t * 3 + j] : t * 3 + j) * 3;
      P[j][0] = pos[o];
      P[j][1] = pos[o + 1];
      P[j][2] = pos[o + 2];
      lo = Math.min(lo, P[j][1]);
      hi = Math.max(hi, P[j][1]);
    }
    for (let k = 0; k < N; k++) {
      const ya = cuts[k], yb = cuts[k + 1];
      if (hi < ya || lo > yb) continue;
      // the clipped outline's extremes are the corners inside the slice and where edges cross it
      for (let j = 0; j < 3; j++) {
        const a = P[j], b = P[(j + 1) % 3];
        if (a[1] >= ya && a[1] <= yb) add(k, a[0], a[2]);
        for (const y of [ya, yb]) {
          if ((a[1] - y) * (b[1] - y) < 0) {
            const s = (y - a[1]) / (b[1] - a[1]);
            add(k, a[0] + (b[0] - a[0]) * s, a[2] + (b[2] - a[2]) * s);
          }
        }
      }
    }
  }
  const b0 = box[0];
  if (b0[0] > b0[1]) return null;
  const setBack = Math.max(b0[0] - bb.min.x, bb.max.x - b0[1], b0[2] - bb.min.z, bb.max.z - b0[3]);
  if (setBack < 0.2 && (b0[1] - b0[0]) * (b0[3] - b0[2]) > 0.6 * spec.dims.w * spec.dims.d) return null;
  const tol = Math.min(0.2, 0.12 * Math.max(spec.dims.w, spec.dims.d));
  const out = [];
  for (let k = 0; k < N; k++) {
    const b = box[k];
    if (b[0] > b[1]) continue; // nothing at this height: a gap to roll through
    const last = out[out.length - 1];
    if (last && last.y1 === cuts[k] && b.every((v, i) => Math.abs(v - last.b[i]) < tol)) {
      last.b = [Math.min(last.b[0], b[0]), Math.max(last.b[1], b[1]), Math.min(last.b[2], b[2]), Math.max(last.b[3], b[3])];
      last.y1 = cuts[k + 1];
    } else out.push({ b: b.slice(), y0: cuts[k], y1: cuts[k + 1] });
  }
  const round = spec.shape === 'cyl';
  return out.map(({ b, y0: ya, y1: yb }) => {
    const hw = (b[1] - b[0]) / 2, hd = (b[3] - b[2]) / 2;
    return { ox: (b[0] + b[1]) / 2, oz: (b[2] + b[3]) / 2, hw, hd, y0: ya, h: yb - ya, cyl: round && Math.max(hw, hd) < 1.5 * Math.min(hw, hd) };
  });
}

// parts smaller than this fraction of the model's size are dropped from its far-away stand-in, and
// from its coarse one, for when it is down to a few pixels
export const LOD_PART = 0.02;
export const LOD_COARSE = 0.1;

/** A lighter stand-in used far away (see Model's lod option); kept only if it saves a good share. */
function buildLod(spec, g, replay) {
  spec.lod = null;
  if (spec.tris < 240) return;
  const lg = standIn(spec, g, { minPart: spec.maxDim * LOD_PART, replay }, spec.tris * 0.75);
  if (!lg) return;
  spec.lod = lg;
  spec.lodTris = lg.userData.tris;
}

function standIn(spec, g, lod, maxTris) {
  const m = new Model(hashString(spec.id), lod);
  try {
    spec.build(m, spec);
  } catch (e) {
    return null;
  }
  if (!m.tris || m.tris > maxTris) return null;
  const lg = m.build({ lift: false });
  // same placement as the full model even if its lowest part was dropped
  if (g.userData.liftedBy) lg.translate(0, g.userData.liftedBy, 0);
  lg.boundingSphere = g.boundingSphere.clone();
  lg.boundingBox = g.boundingBox.clone();
  lg.userData.tinted = g.userData.tinted;
  return lg;
}

// The coarse stand-in (a building's windows, balconies and signs gone, trees in a few facets):
// most things never get that small on screen, so it is made on first use, a few at a time
// (pumpCoarse, from the main loop). spec.coarse: undefined = not made yet, null = it wouldn't save
// much over the far-away one (keep using that), else the geometry.
const coarseQueue = [];
export function wantCoarse(spec) {
  if (spec.coarse !== undefined || spec.coarseQueued || !spec.geometry) return;
  spec.coarseQueued = true;
  coarseQueue.push(spec);
}
/** make queued coarse stand-ins for up to `ms` milliseconds; returns how many are left */
export function pumpCoarse(ms) {
  const t0 = performance.now();
  while (coarseQueue.length && performance.now() - t0 < ms) {
    const spec = coarseQueue.shift();
    const base = spec.lod ? spec.lodTris : spec.tris;
    spec.coarse = base < 60 ? null : standIn(spec, spec.geometry, { minPart: spec.maxDim * LOD_COARSE, replay: spec.draws, coarse: true }, base * 0.75);
    if (spec.coarse) spec.coarseTris = spec.coarse.userData.tris;
  }
  return coarseQueue.length;
}

/** Human readable length: 3.2 mm / 4.5 cm / 1.25 m / 1.3 km */
export function formatLength(x) {
  if (x < 0.01) return (x * 1000).toFixed(1) + ' mm';
  if (x < 1) return (x * 100).toFixed(x < 0.1 ? 1 : 0) + ' cm';
  if (x < 1000) return x.toFixed(x < 10 ? 2 : x < 100 ? 1 : 0) + ' m';
  return (x / 1000).toFixed(2) + ' km';
}
