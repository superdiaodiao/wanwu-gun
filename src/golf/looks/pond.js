// The duck pond (yard 1): a park at midday, deep blue overhead paling to the haze. Round the pond
// foam along the bank, lotus leaves and reeds, trees and benches on the lawn, a street of shops and
// towers far behind the far end; ducks paddling round. Everything else is the registry's defaults.
import * as THREE from 'three';
import { WATER, LAWN, ducks } from './kit.js';

export default {
  sky: [[0, '#4fb0f2'], [0.55, '#9fd8fa'], [1, '#d4effc']], fog: 0xd4effc, hemi: [0xeaf6ff, 0x9cc48a, 1.35], sun: [0xfff1dc, 2.8, [-0.35, 1, 0.5]],
  card: 'linear-gradient(#4fb0f2, #9fd8fa 58%, #bfe9c9)',
  // (a rubber duck)
  icon: '<svg class="ic" viewBox="0 0 40 32" aria-hidden="true"><ellipse cx="17" cy="21" rx="14" ry="8.5" fill="#ffd23f"/><path d="M5 17c4 3 10 3 14 0" fill="none" stroke="#f0b400" stroke-width="2" stroke-linecap="round"/><circle cx="27" cy="11" r="6.5" fill="#ffd23f"/><path d="M32.5 10.5l6.5 1.8-6.5 1.8z" fill="#ff8a2a"/><circle cx="28.6" cy="9.4" r="1.3" fill="#2f3a33"/></svg>',
  surroundings(ctx) {
    foamBank(ctx);
    park(ctx);
  },
  floaters: ctx => ducks(ctx),
};

/** foam along the bank, where the water meets the lawn */
export function foamBank(ctx) {
  const bf = new THREE.Mesh(new THREE.ShapeGeometry(ctx.ring(0.1, 1.6, 0.1, 1.5), 8).rotateX(-Math.PI / 2), ctx.M.foam);
  bf.position.y = WATER + 0.006;
  ctx.group.add(bf);
}

function park(ctx) {
  const { pond, placed, R, onBlock, free, offLane, put, wet, inPond, model, group, course } = ctx;
  // in the water: lotus leaves (out of the ducks' way), more of them in a pond's wide parts (inside
  // an L or a U), and reeds and rocks along the bank
  for (let i = 0; i < 80 && placed.length < 8; i++) {
    const x = pond.x0 + 0.6 + R() * (pond.x1 - pond.x0 - 1.2), z = pond.z0 + 0.6 + R() * (pond.z1 - pond.z0 - 1.2), size = 0.9 + R() * 0.5;
    if (onBlock(x, z, 0.5) || !free(x, z, 1.4) || !offLane(x, z, size / 2 + 0.35)) continue;
    const g = put('lotus', x, z, WATER, size, true);
    if (g) wet.push({ g, x, z, r: size / 2 });
  }
  const rim0 = placed.length;
  for (let i = 0; i < 80 && placed.length - rim0 < 14; i++) {
    // a point on the bank: along one of the four sides, just inside the water or just on the lawn
    const sideK = Math.floor(R() * 4), u = R(), inWater = R() < 0.55;
    const d = inWater ? 0.35 : -0.45;
    let x, z;
    if (sideK < 2) { x = pond.x0 + 1.6 + u * (pond.x1 - pond.x0 - 3.2); z = sideK ? pond.z0 + d : pond.z1 - d; }
    else { z = pond.z0 + 1.6 + u * (pond.z1 - pond.z0 - 3.2); x = sideK === 2 ? pond.x0 + d : pond.x1 - d; }
    if (!free(x, z, 1.2) || onBlock(x, z, 0.6)) continue;
    if (inWater) { const g = put('reeds', x, z, WATER, 0.9 + R() * 0.5, true); if (g) wet.push({ g, x, z, r: 0.3 }); }
    else put(R() < 0.5 ? 'rock_small' : 'grass_tuft', x, z, LAWN, 0.4 + R() * 0.3, true);
  }
  // the park: trees well back from the water, low things nearer
  const kinds = [['tree_plane', 4.2], ['tree_camphor', 4], ['tree_peach', 3], ['bush', 1.1], ['bush', 0.9], ['flower_patch', 0.8], ['bench', 1.6], ['sunflower', 1.3], ['rose_pot', 0.7], ['potted_plant', 0.9]];
  const lawn0 = placed.length;
  for (let i = 0; i < 160 && placed.length - lawn0 < 34; i++) {
    const [id, size] = kinds[Math.floor(R() * kinds.length)];
    const x = pond.x0 - 7 + R() * (pond.x1 - pond.x0 + 14), z = pond.z0 - 7 + R() * (pond.z1 - pond.z0 + 11);
    if (inPond(x, z, size > 2 ? 2 : 0.8) || !free(x, z, size > 2 ? 2.4 : 1.4)) continue;
    put(id, x, z, LAWN, size);
  }
  // a street of shops and towers behind the far end, side by side, their fronts well back from it
  // (a tower in the middle: a shop's sign there would be behind the score at the top of the screen)
  const street = ['shop_pharmacy', 'shop_super', 'office_tower', 'shop_super', 'office_tower'].map(id => {
    const g = model(id, 1), bx = new THREE.Box3().setFromObject(g);
    return { g, w: bx.max.x - bx.min.x, front: bx.max.z };
  });
  let x = -street.reduce((a, b) => a + b.w + 4, -4) / 2;
  for (const b of street) {
    b.g.position.set(x + b.w / 2, LAWN, pond.z0 - 14 - R() * 3 - b.front);
    x += b.w + 4;
    group.add(b.g);
    course.deco.push({ g: b.g, far: true });
  }
}

