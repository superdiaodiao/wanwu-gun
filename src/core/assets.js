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
  spec.shape = spec.shape || (footprintAspect < 1.5 ? 'cyl' : 'box');
  spec.tris = m.tris;
  buildLod(spec, g, m.draws);
  return spec;
}

// parts smaller than this fraction of the model's size are dropped from its far-away stand-in
export const LOD_PART = 0.02;

/** A lighter stand-in used far away (see Model's lod option); kept only if it saves a good share. */
function buildLod(spec, g, replay) {
  spec.lod = null;
  if (spec.tris < 240) return;
  const m = new Model(hashString(spec.id), { minPart: spec.maxDim * LOD_PART, replay });
  try {
    spec.build(m, spec);
  } catch (e) {
    return;
  }
  if (!m.tris || m.tris > spec.tris * 0.75) return;
  const lg = m.build({ lift: false });
  // same placement as the full model even if its lowest part was dropped
  if (g.userData.liftedBy) lg.translate(0, g.userData.liftedBy, 0);
  lg.boundingSphere = g.boundingSphere.clone();
  lg.boundingBox = g.boundingBox.clone();
  lg.userData.tinted = g.userData.tinted;
  spec.lod = lg;
  spec.lodTris = m.tris;
}

/** Human readable length: 3.2 mm / 4.5 cm / 1.25 m / 1.3 km */
export function formatLength(x) {
  if (x < 0.01) return (x * 1000).toFixed(1) + ' mm';
  if (x < 1) return (x * 100).toFixed(x < 0.1 ? 1 : 0) + ' cm';
  if (x < 1000) return x.toFixed(x < 10 ? 2 : x < 100 ? 1 : 0) + ' m';
  return (x / 1000).toFixed(2) + ' km';
}
