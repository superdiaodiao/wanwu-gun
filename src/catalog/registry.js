// Catalog registry: every rollable object type is registered here with def(id, spec).
//
// spec fields
//   name     (required) Chinese display name shown when rolled up, e.g. '橘猫'
//   cat      (required) stats category: 'food' | 'daily' | 'toy' | 'animal' | 'person' | 'plant' |
//                       'vehicle' | 'street' | 'building' | 'landmark' | 'nature'
//   sfx      (required) pickup sound: 'tiny' | 'soft' | 'hard' | 'metal' | 'glass' | 'paper' | 'wood' |
//                       'squish' | 'meow' | 'bark' | 'cluck' | 'quack' | 'coo' | 'honk' | 'moo' |
//                       'scream_f' | 'scream_m' | 'scream_kid' | 'horn' | 'bell' | 'crash' | 'rumble' | 'gong'
//   build    (required) (m: Model) => void — model in metres, base on y=0, centred, front = +Z
//   tints    optional   array of sRGB hex colours; each instance picks one for parts built under m.tint()
//   mover    optional   { kind: 'walk' | 'wander' | 'drive' | 'fly' | 'swim' | 'dance' | 'taichi' | 'spin', speed }
//   fill     optional   fraction of the bounding box that is solid (default 0.45) — affects growth
//   shape    optional   'cyl' | 'box' collision override (default: auto from footprint)
export const CATALOG = new Map();

export function def(id, spec) {
  if (CATALOG.has(id)) console.warn('[catalog] duplicate id', id);
  spec.id = id;
  CATALOG.set(id, spec);
  return spec;
}
