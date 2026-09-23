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
  return spec;
}

/** Human readable length: 3.2 mm / 4.5 cm / 1.25 m / 1.3 km */
export function formatLength(x) {
  if (x < 0.01) return (x * 1000).toFixed(1) + ' mm';
  if (x < 1) return (x * 100).toFixed(x < 0.1 ? 1 : 0) + ' cm';
  if (x < 1000) return x.toFixed(x < 10 ? 2 : x < 100 ? 1 : 0) + ' m';
  return (x / 1000).toFixed(2) + ' km';
}
