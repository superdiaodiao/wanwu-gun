// The map: 幸福里小区 (start), 幸福路小吃街, 幸福广场 with the square dance, 人民公园 with the pond,
// 幸福小学, the city beyond, farmland with a high-speed railway, and a ring of mountains.
// North is −Z, east is +X. Everything is seeded, so the town is the same every game.
import { RNG } from '../core/rng.js';
import { poly } from './ground.js';

const PI = Math.PI;
const HALF = PI / 2;

export function buildLayout(world, seed = 20260923) {
  const rng = new RNG(seed);
  const zones = {};
  const Z = (kind, pts) => (zones[kind] || (zones[kind] = [])).push(pts);
  const ZS = (kind, list) => list.forEach(p => Z(kind, p));
  const blocked = [];
  const block = (x0, z0, x1, z1) => blocked.push([Math.min(x0, x1), Math.min(z0, z1), Math.max(x0, x1), Math.max(z0, z1)]);
  const isFree = (x, z, m = 0) => {
    for (const b of blocked) if (x > b[0] - m && x < b[2] + m && z > b[1] - m && z < b[3] + m) return false;
    return true;
  };
  const paths = [];
  const lanes = [];
  const L = {
    zones, paths, lanes, blocked,
    start: { x: 0, z: 4, heading: 0 },
    groups: { dance: null, taichi: null },
    pond: null,
    ponds: [],
    bounds: 2400,
  };

  const put = (id, x, z, o = {}) => world.add(id, x, z, { rng, ...o });
  const specOf = id => (world.type(id) ? world.type(id).spec : null);
  function blockObj(o, m = 0.4) {
    if (!o) return;
    const c = Math.abs(Math.cos(o.yaw)), s = Math.abs(Math.sin(o.yaw));
    const ex = o.hw * c + o.hd * s, ez = o.hw * s + o.hd * c;
    const cx = o.centerX(), cz = o.centerZ();
    block(cx - ex - m, cz - ez - m, cx + ex + m, cz + ez + m);
  }
  const solid = (id, x, z, o = {}, m = 0.4) => {
    const obj = put(id, x, z, o);
    blockObj(obj, m);
    return obj;
  };
  const path = (pts, loop = false) => paths.push({ pts, loop }) - 1;
  const lane = (pts, loop = true, y = 0) => lanes.push({ pts, loop, y }) - 1;

  function scatter(list, n, sample, opts = {}) {
    let placed = 0, tries = 0;
    const m = opts.margin ?? 0.2;
    while (placed < n && tries < n * 25) {
      tries++;
      const p = sample();
      if (!p) continue;
      const [x, z] = p;
      if (opts.inside && !opts.inside(x, z)) continue;
      if (!isFree(x, z, m)) continue;
      const id = typeof list === 'string' ? list : rng.weighted(list);
      const o = put(id, x, z, { yaw: rng.angle(), ...(opts.o || {}) });
      if (o && opts.solid) blockObj(o, opts.solidMargin ?? 0.2);
      placed++;
    }
    return placed;
  }
  const inRect = (x0, z0, x1, z1) => () => [rng.range(x0, x1), rng.range(z0, z1)];
  const inDisc = (cx, cz, r0, r1) => () => {
    const a = rng.angle(), r = Math.sqrt(rng.range(r0 * r0, r1 * r1));
    return [cx + Math.cos(a) * r, cz + Math.sin(a) * r];
  };
  const around = (cx, cz, s) => () => [cx + rng.gauss() * s, cz + rng.gauss() * s];

  // ---- item mixes -------------------------------------------------------------------------
  const TINY = [
    ['guazi', 10], ['guazi_shell', 7], ['peanut', 5], ['coin_1yuan', 3], ['coin_5jiao', 3], ['candy', 4],
    ['button', 2], ['bottle_cap', 3], ['battery', 1.5], ['eraser', 1.5], ['pebble', 4], ['marble', 2],
    ['key', 1], ['chalk', 1.5], ['dice', 1], ['mahjong_zhong', 1], ['jiaozi', 1], ['dried_fish', 0.6],
  ];
  const SMALL = [
    ['baozi', 4], ['mooncake', 2], ['orange', 4], ['apple', 3], ['egg', 2], ['tomato', 2], ['banana', 2],
    ['garlic', 2], ['soda_can', 4], ['milk_tea', 3], ['tea_cup', 2], ['enamel_mug', 2], ['slipper', 3],
    ['chopsticks', 2], ['phone', 1.5], ['remote', 1.5], ['book', 2], ['red_envelope', 2], ['rubber_duck', 1.5],
    ['tissue', 2], ['ice_pop', 1.5], ['lollipop', 1.5], ['shuttlecock', 2], ['spinning_top', 1.5], ['pinwheel', 1],
    ['toy_car', 2], ['tanghulu', 1], ['skewer', 1], ['zongzi', 1], ['folding_fan', 1], ['palm_fan', 1],
    ['cactus', 1], ['mahjong_fa', 0.5], ['mahjong_wan', 0.5], ['mahjong_tong', 0.5],
  ];
  const HOUSE = [
    ['watermelon', 2], ['plastic_stool', 4], ['thermos', 2], ['kettle', 1.5], ['washbasin', 1.5], ['parcel_big', 2],
    ['parcel_small', 3], ['takeout_bag', 2], ['football', 1.5], ['basketball', 1.5], ['suitcase', 1], ['umbrella', 1],
    ['trash_bag', 1.5], ['gas_tank', 1], ['bird_cage', 1], ['goldfish_bowl', 0.6], ['kick_scooter', 1],
    ['napa_cabbage', 2], ['radish', 1], ['scallion', 1], ['briquette', 2], ['rice_cooker', 1], ['tv_old', 0.6],
    ['electric_fan', 0.6], ['erhu', 0.4], ['watermelon_half', 1], ['steamer', 1], ['pothos', 1], ['rose_pot', 1],
  ];
  const GRASS_TINY = [['clover', 5], ['ladybug', 2], ['snail', 1.5], ['mushroom', 2], ['pebble', 2], ['grass_tuft', 1]];
  const PEOPLE_WALK = [['auntie', 5], ['uncle', 4], ['young_phone', 3], ['jogger', 1.5], ['auntie_veg', 2], ['grandma_stroller', 1], ['uncle_birdcage', 1]];
  const CATS = [['cat_orange', 3], ['cat_tabby', 2], ['cat_black', 1], ['cat_cow', 1.5], ['cat_white', 1]];

  // ---- roads ------------------------------------------------------------------------------
  function roadX(z, x0, x1, w = 12, sw = 4, opts = {}) {
    Z('road', poly.rect(x0, z - w / 2, x1, z + w / 2));
    if (sw > 0) {
      Z('sidewalk', poly.rect(x0, z - w / 2 - sw, x1, z - w / 2));
      Z('sidewalk', poly.rect(x0, z + w / 2, x1, z + w / 2 + sw));
      if (opts.tactile) {
        Z('tactile', poly.rect(x0, z - w / 2 - sw * 0.55 - 0.3, x1, z - w / 2 - sw * 0.55 + 0.3));
        Z('tactile', poly.rect(x0, z + w / 2 + sw * 0.55 - 0.3, x1, z + w / 2 + sw * 0.55 + 0.3));
      }
    }
    Z('marking_y', poly.rect(x0, z - 0.24, x1, z - 0.1));
    Z('marking_y', poly.rect(x0, z + 0.1, x1, z + 0.24));
    Z('marking', poly.rect(x0, z - w / 2 + 0.3, x1, z - w / 2 + 0.45));
    Z('marking', poly.rect(x0, z + w / 2 - 0.45, x1, z + w / 2 - 0.3));
    if (w >= 12) for (let x = x0 + 3; x < x1 - 6; x += 10) {
      Z('marking', poly.rect(x, z - w / 4 - 0.08, x + 4.5, z - w / 4 + 0.08));
      Z('marking', poly.rect(x, z + w / 4 - 0.08, x + 4.5, z + w / 4 + 0.08));
    }
    if (opts.lanes !== false) {
      const o = w * 0.27;
      lane([[x0 + 5, z + o], [x1 - 5, z + o], [x1 - 5, z - o], [x0 + 5, z - o]]);
    }
    if (sw > 0 && opts.walk !== false) {
      path([[x0 + 2, z - w / 2 - sw / 2], [x1 - 2, z - w / 2 - sw / 2]]);
      path([[x0 + 2, z + w / 2 + sw / 2], [x1 - 2, z + w / 2 + sw / 2]]);
    }
  }
  function roadZ(x, z0, z1, w = 12, sw = 4, opts = {}) {
    Z('road', poly.rect(x - w / 2, z0, x + w / 2, z1));
    if (sw > 0) {
      Z('sidewalk', poly.rect(x - w / 2 - sw, z0, x - w / 2, z1));
      Z('sidewalk', poly.rect(x + w / 2, z0, x + w / 2 + sw, z1));
    }
    Z('marking_y', poly.rect(x - 0.24, z0, x - 0.1, z1));
    Z('marking_y', poly.rect(x + 0.1, z0, x + 0.24, z1));
    Z('marking', poly.rect(x - w / 2 + 0.3, z0, x - w / 2 + 0.45, z1));
    Z('marking', poly.rect(x + w / 2 - 0.45, z0, x + w / 2 - 0.3, z1));
    if (w >= 12) for (let z = z0 + 3; z < z1 - 6; z += 10) {
      Z('marking', poly.rect(x - w / 4 - 0.08, z, x - w / 4 + 0.08, z + 4.5));
      Z('marking', poly.rect(x + w / 4 - 0.08, z, x + w / 4 + 0.08, z + 4.5));
    }
    if (opts.lanes !== false) {
      const o = w * 0.27;
      lane([[x - o, z0 + 5], [x - o, z1 - 5], [x + o, z1 - 5], [x + o, z0 + 5]]);
    }
    if (sw > 0 && opts.walk !== false) {
      path([[x - w / 2 - sw / 2, z0 + 2], [x - w / 2 - sw / 2, z1 - 2]]);
      path([[x + w / 2 + sw / 2, z0 + 2], [x + w / 2 + sw / 2, z1 - 2]]);
    }
  }
  function zebraX(xc, z, w) {
    for (let i = 0; i < Math.floor(w / 1.0) - 1; i++) Z('marking', poly.rect(xc - 2.2, z - w / 2 + 0.7 + i, xc + 2.2, z - w / 2 + 1.2 + i));
  }
  function zebraZ(x, zc, w) {
    for (let i = 0; i < Math.floor(w / 1.0) - 1; i++) Z('marking', poly.rect(x - w / 2 + 0.7 + i, zc - 2.2, x - w / 2 + 1.2 + i, zc + 2.2));
  }

  // =========================================================================================
  // 1. 幸福里小区 — the courtyard where the game starts
  // =========================================================================================
  const CX0 = -69, CX1 = 69, CZ0 = -64, CZ1 = 38.5;
  Z('concrete', poly.rect(CX0, CZ0, CX1, CZ1));
  // lawns
  const lawns = [[-52, -40, -15, -19], [15, -40, 52, -19], [-52, -6, -15, 16], [15, -6, 52, 16]];
  lawns.forEach(r => Z('grass', poly.rect(...r)));
  Z('sand', poly.rect(-49, -38, -36, -27));
  // brick paths: north–south spine and east–west cross path
  Z('brick', poly.rect(-2.6, CZ0 + 6, 2.6, CZ1));
  Z('brick', poly.rect(CX0 + 4, -15.2, CX1 - 4, -9.8));
  Z('brick', poly.rect(-12, -6, 12, 14)); // little square around the start
  // buildings
  for (const x of [-24, 24]) solid('res_6f', x, -52, { yaw: 0 }, 0.6);
  for (const x of [-27, 27]) solid('res_6f', x, 28, { yaw: PI }, 0.6);
  // (no building on the west side: a ball too big for the gaps between the others, but not yet
  // big enough to eat them, can always leave that way through the perimeter wall)
  solid('res_6f', 61, -12, { yaw: -HALF }, 0.6);
  // perimeter wall with the gate gap on the south side
  const wallRun = (x0, z0, x1, z1) => {
    const len = Math.hypot(x1 - x0, z1 - z0);
    const n = Math.round(len / 4);
    const yaw = Math.atan2(x1 - x0, z1 - z0) - HALF;
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n;
      const x = x0 + (x1 - x0) * t, z = z0 + (z1 - z0) * t;
      put(i % 7 === 3 ? 'wall_slogan' : 'wall_seg', x, z, { yaw });
    }
    block(Math.min(x0, x1) - 0.4, Math.min(z0, z1) - 0.4, Math.max(x0, x1) + 0.4, Math.max(z0, z1) + 0.4);
  };
  wallRun(CX0, CZ0, CX1, CZ0);
  // (the west side stays open: a ball that has eaten the courtyard bare can always wander out)
  wallRun(CX1, CZ0, CX1, CZ1);
  wallRun(CX0, CZ1, -8, CZ1);
  wallRun(8, CZ1, CX1, CZ1);
  solid('compound_gate', 0, CZ1 + 0.5, { yaw: 0 }, 0.2);
  solid('guard_booth', 10.5, CZ1 - 3, { yaw: -HALF });
  put('barrier_gate', -3.5, CZ1 - 1.2, { yaw: 0 });
  put('security_guard', 8, CZ1 - 5, { moverState: { radius: 3 } });
  for (const x of [-6.5, 6.5]) put('lantern_red', x, CZ1 + 0.6, { y: 3.4 });

  // start square: mahjong, chess, and the seeds everyone spat on the ground
  solid('mahjong_table', -6.5, 1, { yaw: 0.3 }, 0.2);
  scatter([['mahjong_zhong', 3], ['mahjong_fa', 3], ['mahjong_wan', 3], ['mahjong_tong', 3], ['dice', 1]], 26, around(-6.5, 1, 1.6), { margin: 0 });
  put('auntie', -4.2, -1.5, { yaw: -2.2, moverState: { radius: 2.5 } });
  put('auntie', -9, 3.2, { yaw: 1.9, moverState: { radius: 2.5 } });
  solid('stone_table', 7.5, -2, { yaw: 0 }, 0.1);
  put('uncle_chess', 7.5, -0.4, { yaw: PI });
  put('uncle_chess', 7.5, -3.6, { yaw: 0 });
  put('uncle_birdcage', 10.2, -1, { yaw: -2.5, moverState: { radius: 2 } });
  scatter([['chess_red', 3], ['chess_black', 3], ['chess_horse', 2]], 16, around(7.5, -2, 1.5), { margin: 0 });
  put('bird_cage', 5.2, -4.4, { yaw: 0.4 });
  put('thermos', 9.8, -4.3, { yaw: 1 });
  put('tea_cup', 6.2, 0.4, {});
  put('palm_fan', 9.3, 0.8, { yaw: 2 });
  // the start carpet of tiny things, plus a few spilled heaps
  scatter(TINY, 1100, inDisc(0, 4, 0.3, 4.5), { margin: 0 });
  scatter(TINY, 720, inDisc(0, 4, 0.35, 7.5), { margin: 0 });
  scatter(TINY, 600, inRect(-14, -9, 14, 16), { margin: 0 });
  scatter(TINY, 900, inRect(CX0 + 3, CZ0 + 8, CX1 - 3, CZ1 - 4), { margin: 0.1 });
  scatter([['guazi', 3], ['guazi_shell', 4]], 70, around(-4.2, 2.6, 0.45), { margin: 0 });
  scatter([['peanut', 1]], 26, around(2.6, 6.2, 0.35), { margin: 0 });
  scatter([['coin_1yuan', 2], ['coin_5jiao', 2], ['key', 0.3], ['red_envelope', 0.4]], 30, around(1.8, 1.2, 0.4), { margin: 0 });
  scatter([['candy', 1]], 30, around(-1.5, 8, 0.5), { margin: 0 });
  scatter([['marble', 1], ['bottle_cap', 1], ['button', 1]], 36, around(3.5, 9.5, 0.6), { margin: 0 });
  scatter(SMALL, 130, inDisc(0, 3, 1.5, 13), { margin: 0.1 });
  scatter(SMALL, 260, inRect(CX0 + 4, CZ0 + 8, CX1 - 4, CZ1 - 4), { margin: 0.2 });
  scatter(HOUSE, 90, inRect(CX0 + 4, CZ0 + 8, CX1 - 4, CZ1 - 4), { margin: 0.3 });
  lawns.forEach(r => scatter(GRASS_TINY, 45, inRect(...r), { margin: 0 }));
  lawns.forEach(r => scatter([['flower_patch', 3], ['bush', 2], ['grass_tuft', 2]], 8, inRect(...r), { margin: 0.5 }));
  // courtyard trees and flower beds
  for (const [x, z] of [[-30, -24], [30, -24], [-30, 4], [30, 4], [-45, -8], [45, -8], [-20, -36], [20, -36]]) solid('tree_plane', x, z, { yaw: rng.angle(), scale: rng.range(0.8, 1) }, 0.3);
  for (const [x, z] of [[-40, 10], [40, 10], [-22, 12], [22, 12]]) solid('sapling', x, z, { yaw: rng.angle() }, 0.2);
  solid('flower_bed', -18, -2, {}, 0.1);
  solid('flower_bed', 18, -2, {}, 0.1);
  for (let x = -50; x <= -18; x += 3.2) put('hedge', x, -19.5, { yaw: 0 });
  for (let x = 18; x <= 50; x += 3.2) put('hedge', x, -19.5, { yaw: 0 });
  // playground
  solid('slide', -44, -33, { yaw: 0.4 });
  solid('seesaw', -38.5, -30, { yaw: HALF });
  put('kid', -41, -30, { moverState: { radius: 6 } });
  put('kid', -45, -28, { moverState: { radius: 6 } });
  put('kid_balloon', -37, -35, { moverState: { radius: 6 } });
  put('kick_scooter', -35, -27, { yaw: 1 });
  put('football', -30, -31, {});
  // fitness corner
  solid('fitness_walker', 36, -34, { yaw: 0 });
  solid('fitness_walker', 41, -34, { yaw: 0 });
  solid('fitness_twister', 46, -30, { yaw: 0 });
  solid('fitness_twister', 32, -29, { yaw: 0 });
  put('auntie', 38, -31, { moverState: { radius: 4 } });
  put('uncle', 44, -27, { moverState: { radius: 4 } });
  // express corner by the west building
  solid('express_locker', -53, 12, { yaw: HALF });
  scatter([['parcel_big', 2], ['parcel_small', 3], ['takeout_bag', 1]], 16, inRect(-51, 6, -46, 18), { margin: 0 });
  put('tricycle', -47, 20, { yaw: PI, mover: false });
  // bikes along the south buildings' backs
  for (let i = 0; i < 9; i++) put('shared_bike', -44 + i * 1.1, 19.2, { yaw: HALF + rng.range(-0.1, 0.1) });
  for (let i = 0; i < 6; i++) put('ebike', 14 + i * 1.3, 19.2, { yaw: -HALF + rng.range(-0.1, 0.1) });
  solid('charging_pile', 22.5, 18.6, { yaw: PI });
  // drying laundry
  solid('clothes_rack', -30, -44, { yaw: 0 });
  solid('clothes_rack', -22, -44, { yaw: 0 });
  put('quilt_stack', -26, -42.5, { yaw: 0.2 });
  put('washbasin', -27.5, -42, {});
  put('broom', -19, -42, { yaw: 1.2 });
  // life at the doors of the north row
  for (const bx of [-24, 24]) for (const dx of [-13, 0, 13]) {
    const x = bx + dx, z = -44.8;
    put('lantern_red', x - 1.6, z + 0.6, { y: 2.7 });
    put('lantern_red', x + 1.6, z + 0.6, { y: 2.7 });
    scatter([['napa_cabbage', 5], ['briquette', 3], ['pickle_jar', 1], ['rose_pot', 1], ['potted_plant', 0.6], ['pothos', 1], ['fire_extinguisher', 0.6], ['coal_stove', 0.3], ['gas_tank', 0.4]], 7, inRect(x - 4, z + 0.5, x + 4, z + 2.4), { margin: 0 });
  }
  // cats and a dog
  scatter(CATS, 10, inRect(CX0 + 6, CZ0 + 8, CX1 - 6, CZ1 - 6), { margin: 0.4 });
  put('cat_sleeping', -14.5, -12, { yaw: 1 });
  put('cat_sleeping', 3.5, 16.5, { yaw: 2.2 });
  scatter([['dried_fish', 1]], 8, around(-14, -12, 1.2), { margin: 0 });
  put('dog_teddy', 16, 8, { moverState: { radius: 8 } });
  put('dog_shiba', -20, 8, { moverState: { radius: 10 } });
  // rubbish point
  solid('trash_bins', 18, 33, { yaw: PI });
  put('trash_bag', 15.5, 31.5, {});
  put('trash_bag', 20.8, 31.2, {});
  put('tv_old', 23, 31.8, { yaw: 2.4 });
  // the strip between the north row and the wall: bikes parked along the wall and odds and ends,
  // so a ball of a metre or two that wanders in there finds something to eat
  for (let x = CX0 + 6; x <= CX1 - 6; x += 2.4) {
    if (Math.abs(x) < 12 || rng.r() < 0.4) continue; // leave the gate clear
    put(rng.pick(['shared_bike', 'ebike', 'shared_bike', 'kick_scooter']), x + rng.range(-0.4, 0.4), CZ1 - 1.4, { yaw: HALF + rng.range(-0.15, 0.15) });
  }
  scatter(HOUSE, 40, inRect(CX0 + 4, 35, CX1 - 4, CZ1 - 2.6), { margin: 0.3 });
  scatter(SMALL, 50, inRect(CX0 + 4, 35, CX1 - 4, CZ1 - 2.6), { margin: 0.1 });
  scatter(CATS, 4, inRect(CX0 + 6, 35, CX1 - 6, CZ1 - 3), { margin: 0.4 });
  // courtyard walkers along the paths
  const cyLoop = path([[-40, -12.5], [40, -12.5], [40, -13], [-40, -13]], true);
  // (bending round the start square: nobody walks straight at a ball that has just started)
  const cySpine = path([[0, -40], [0, -7.5], [3.4, -4.5], [3.4, 11], [0, 15], [0, 34]]);
  for (let i = 0; i < 5; i++) put(rng.weighted(PEOPLE_WALK), rng.range(-38, 38), -12.5, { moverState: { path: cyLoop } });
  for (let i = 0; i < 3; i++) put(rng.weighted(PEOPLE_WALK), 0, rng.range(-38, 30), { moverState: { path: cySpine } });
  scatter([['sparrow', 1]], 10, inRect(-40, -30, 40, 10), { margin: 0.2 });
  scatter([['butterfly', 1]], 8, inRect(-50, -40, 50, 16), { margin: 0.2 });

  // =========================================================================================
  // 2. The ring road around the compound and 幸福路 food street
  // =========================================================================================
  const RX = 82, RZN = -78, RZS = 55;
  roadX(RZS, -330, 330, 14, 9, { tactile: true });
  roadX(RZN, -330, 330, 12, 4);
  roadZ(-RX, RZN - 6, RZS + 7, 12, 4);
  roadZ(RX, RZN - 6, RZS + 7, 12, 4);
  zebraX(0, RZS, 14);
  zebraX(-RX - 14, RZS, 14);
  zebraX(RX + 14, RZS, 14);
  zebraZ(-RX, RZN + 14, 12);
  zebraZ(RX, RZN + 14, 12);
  for (const [x, z, yaw] of [[-RX + 7, RZS - 8, 0], [RX - 7, RZS - 8, 0], [7, RZS - 8, 0], [-7, RZS + 8, PI]]) put('traffic_light', x, z, { yaw });

  // stalls on the wide north sidewalk (z 39.5 – 48)
  const SW = RZS - 7 - 4.5;
  const stallRow = [
    ['pancake_cart', -18], ['baozi_stall', -26], ['fruit_stall', -36], ['tanghulu_pole', -44], ['bbq_stall', -52],
    ['freezer', -58], ['newsstand', 20], ['vending_machine', 26], ['fruit_stall', 36], ['pancake_cart', 46],
    ['bbq_stall', 58], ['tanghulu_pole', 64], ['vending_machine', -64],
  ];
  // stalls face the street; their keepers stand behind them
  for (const [id, x] of stallRow) solid(id, x, SW, { yaw: 0 }, 0.3);
  put('chef', -26, SW - 1.4, { yaw: 0 });
  put('speaker', -14, SW - 1.2, { yaw: 0, tag: 'street_speaker', mover: false });
  for (let i = 0; i < 12; i++) put('plastic_stool', -54 + rng.range(-4, 4), SW - 2.5 + rng.range(-1.5, 1.5), { yaw: rng.angle() });
  // shelters open towards the road
  put('bus_stop', 100, RZS - 9, { yaw: 0 });
  put('bus_stop', -100, RZS + 9, { yaw: PI });
  for (let x = -320; x <= 320; x += 20) {
    if (Math.abs(x) < 10) continue;
    // lamp arms run along the lamp's ±X: turn them to reach over the road
    put('street_lamp', x, RZS - 7.6, { yaw: HALF });
    put('street_lamp', x + 10, RZS + 7.6, { yaw: -HALF });
  }
  for (let x = -315; x <= 315; x += 15) {
    if (Math.abs(x) < 12) continue;
    if (isFree(x, RZS - 9.5, 1)) solid('tree_plane', x, RZS - 9.8, { yaw: rng.angle(), scale: rng.range(0.85, 1.1) }, 0.1);
  }
  for (let x = -300; x <= 300; x += 7) put('lantern_red', x, RZS - 7.4, { y: 4.2 });
  for (let i = 0; i < 26; i++) put('shared_bike', rng.pick([-1, 1]) * rng.range(70, 300), RZS + 9.5 + rng.range(-0.6, 0.6), { yaw: HALF + rng.range(-0.15, 0.15) });
  for (let i = 0; i < 10; i++) put('ebike', rng.pick([-1, 1]) * rng.range(12, 60), RZS - 10.6, { yaw: -HALF + rng.range(-0.2, 0.2) });
  for (const x of [-72, 72, -150, 150]) put('fire_hydrant', x, RZS - 7.2, {});
  put('mailbox', 14, RZS - 8, { yaw: PI });
  for (const x of [-90, -30, 30, 90, 160, -160]) put('trash_can', x, RZS - 7.4, { yaw: PI });
  for (const x of [-120, 120, -200, 200]) put('bench', x, RZS - 10.5, { yaw: PI });
  // shops along the south side, on a paved strip
  Z('concrete', poly.rect(-166, RZS + 11, 166, RZS + 29));
  const SHOPS = ['shop_baozi', 'shop_fruit', 'shop_tea', 'shop_barber', 'shop_super', 'shop_pharmacy', 'shop_hardware', 'shop_noodle', 'shop_restaurant'];
  let si = 0;
  for (let x = -154; x <= 154; x += 11) solid(SHOPS[si++ % SHOPS.length], x, RZS + 17, { yaw: PI }, 0.2);
  // food street crowd
  scatter(SMALL, 90, inRect(-80, RZS - 12, 80, RZS - 7.6), { margin: 0.1 });
  scatter(TINY, 160, inRect(-80, RZS - 12, 80, RZS - 7.6), { margin: 0.05 });
  scatter(HOUSE, 25, inRect(-80, RZS - 12, 80, RZS - 7.6), { margin: 0.2 });
  scatter([['pigeon', 1]], 12, inRect(-40, RZS - 12, 40, RZS - 8), { margin: 0.2 });
  scatter(CATS, 5, inRect(-140, RZS - 12, 140, RZS - 8), { margin: 0.4 });
  scatter([['dog_shiba', 1], ['dog_husky', 1], ['dog_teddy', 1]], 4, inRect(-140, RZS - 12, 140, RZS - 8), { margin: 0.4 });
  for (let i = 0; i < 22; i++) {
    const side = rng.chance(0.55);
    const zz = side ? RZS - 11.5 : RZS + 11.5;
    put(rng.weighted(PEOPLE_WALK), rng.range(-300, 300), zz, {});
  }
  // traffic
  const CARS = [['car_sedan', 6], ['taxi', 3], ['suv', 3], ['minivan', 2]];
  for (let i = 0; i < 16; i++) put(rng.weighted(CARS), rng.range(-300, 300), RZS + rng.pick([-3.8, 3.8]), {});
  for (let i = 0; i < 5; i++) put('delivery_rider', rng.range(-250, 250), RZS + rng.pick([-5, 5]), {});
  put('bus', -150, RZS + 3.8, {});
  put('bus', 170, RZS - 3.8, {});
  put('sprinkler_truck', 40, RZS + 3.8, {});
  put('tricycle', -60, RZS - 5, {});
  for (let i = 0; i < 10; i++) put(rng.weighted(CARS), rng.range(-300, 300), RZN + rng.pick([-3.2, 3.2]), {});
  for (let i = 0; i < 5; i++) put(rng.weighted(CARS), rng.pick([-RX, RX]) + rng.pick([-3.2, 3.2]), rng.range(RZN, RZS), {});
  // parked cars on the south curb
  for (let x = -290; x < 290; x += rng.range(6, 16)) if (Math.abs(x) > 20) put(rng.weighted(CARS), x, RZS + 6.1, { yaw: HALF, mover: false });

  // =========================================================================================
  // 3. 幸福广场 — the plaza with the square dance
  // =========================================================================================
  const PX0 = 94, PX1 = 178, PZ0 = -72, PZ1 = 45;
  Z('plaza', poly.rect(PX0, PZ0, PX1, PZ1));
  Z('grass', poly.rect(PX0 + 4, PZ0 + 4, PX0 + 20, PZ0 + 30));
  Z('grass', poly.rect(PX1 - 20, PZ0 + 4, PX1 - 4, PZ0 + 30));
  solid('arch_gate', PX0 + 2, -12, { yaw: -HALF }, 0.2);
  put('stone_lion', PX0 + 3, -21, { yaw: -HALF });
  put('stone_lion', PX0 + 3, -3, { yaw: -HALF });
  const DCX = 138, DCZ = -18;
  const speaker = put('speaker', DCX, DCZ - 7, { yaw: 0, tag: 'dance_speaker', mover: false });
  const dancers = [];
  for (let r = 0; r < 4; r++) for (let c = 0; c < 6; c++) {
    const x = DCX + (c - 2.5) * 2.3, z = DCZ + r * 2.3;
    dancers.push(put('auntie_dance', x, z, { yaw: PI, moverState: { slot: [x, z], group: 'dance' } }));
  }
  L.groups.dance = { speaker, dancers, x: DCX, z: DCZ };
  // kids with balloons, pigeons, vendors
  scatter([['pigeon', 1]], 36, around(162, 16, 7), { margin: 0.1 });
  for (let i = 0; i < 4; i++) put('kid_balloon', 150 + rng.range(-15, 15), 10 + rng.range(-10, 10), { moverState: { radius: 10 } });
  for (let i = 0; i < 6; i++) put('kid', 150 + rng.range(-20, 20), 5 + rng.range(-15, 15), { moverState: { radius: 12 } });
  for (let i = 0; i < 9; i++) put('balloon', 118 + rng.range(-1.2, 1.2), 26 + rng.range(-1.2, 1.2), { y: rng.range(0.2, 1.4) });
  solid('tanghulu_pole', 115, 26, {}, 0.2);
  solid('pancake_cart', 124, 30, { yaw: PI }, 0.2);
  solid('freezer', 130, 30, { yaw: PI }, 0.2);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * PI * 2;
    solid('lamp_palace', 141 + Math.cos(a) * 38, -14 + Math.sin(a) * 44, {}, 0.1);
  }
  for (let i = 0; i < 10; i++) put('bench', PX0 + 6 + i * 9, PZ1 - 3, { yaw: PI });
  for (let x = PX0 + 6; x < PX1; x += 10) {
    solid('tree_ginkgo', x, PZ0 + 2.5, { yaw: rng.angle() }, 0.2);
    solid('tree_ginkgo', x, PZ1 - 1, { yaw: rng.angle() }, 0.2);
  }
  solid('flower_bed', 110, -45, {}, 0.1);
  solid('flower_bed', 170, -45, {}, 0.1);
  solid('flower_bed', 110, 20, {}, 0.1);
  scatter(PEOPLE_WALK, 12, inRect(PX0 + 6, PZ0 + 6, PX1 - 6, PZ1 - 6), { margin: 0.5, o: { moverState: { radius: 18 }, mover: { kind: 'wander', speed: 0.8 } } });
  scatter(SMALL, 60, inRect(PX0 + 4, PZ0 + 4, PX1 - 4, PZ1 - 4), { margin: 0.1 });
  scatter(TINY, 120, inRect(PX0 + 4, PZ0 + 4, PX1 - 4, PZ1 - 4), { margin: 0.05 });
  scatter([['kite', 2], ['football', 1], ['shuttlecock', 1], ['spinning_top', 1], ['umbrella', 0.6]], 12, inRect(PX0 + 6, PZ0 + 6, PX1 - 6, PZ1 - 6), { margin: 0.2 });
  // the mall closes the plaza to the east
  solid('mall', 211, -14, { yaw: -HALF }, 1);
  put('billboard', 196, 40, { yaw: -2.6 });

  // =========================================================================================
  // 4. 人民公园 — pond, willows, tai-chi, a temple and a pagoda
  // =========================================================================================
  const KX0 = -236, KX1 = -94, KZ0 = -120, KZ1 = 45;
  Z('grass', poly.rect(KX0, KZ0, KX1, KZ1));
  const pond = { cx: -160, cz: -38, rx: 40, rz: 26 };
  L.pond = pond;
  L.ponds.push(pond);
  ZS('stone', poly.ellipseRing(pond.cx, pond.cz, pond.rx, pond.rz, pond.rx + 2.2, pond.rz + 2.2, 72));
  Z('water', poly.ellipse(pond.cx, pond.cz, pond.rx, pond.rz, 72));
  Z('water', poly.rect(-122, -42, -100, -34));
  solid('arch_bridge', -110, -38, { yaw: HALF }, 0.1); // spans across the stream (which runs along X)
  solid('pavilion', -160, -68, { yaw: 0 }, 0.3);
  // park paths
  ZS('brick', poly.strip([[-100, 30], [-120, 10], [-150, -2], [-190, -4], [-205, -30], [-195, -64], [-160, -72], [-125, -62], [-112, -42], [-100, -20], [-100, 30]], 3));
  // tai-chi square
  Z('plaza', poly.ellipse(-140, 22, 16, 13, 40));
  const taichi = [];
  for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) {
    const x = -140 + (c - 1.5) * 2.8, z = 18 + r * 2.8;
    taichi.push(put('uncle_taichi', x, z, { yaw: 0, moverState: { slot: [x, z], group: 'taichi' } }));
  }
  L.groups.taichi = { members: taichi };
  // willows and peach blossoms around the pond
  for (let i = 0; i < 20; i++) {
    const a = (i / 20) * PI * 2 + 0.1;
    const x = pond.cx + Math.cos(a) * (pond.rx + 6), z = pond.cz + Math.sin(a) * (pond.rz + 6);
    if (isFree(x, z, 2)) solid(i % 3 === 0 ? 'tree_peach' : 'tree_willow', x, z, { yaw: rng.angle() }, 0.2);
  }
  for (let i = 0; i < 14; i++) put('lotus', pond.cx + rng.range(-pond.rx, pond.rx) * 0.7, pond.cz + rng.range(-pond.rz, pond.rz) * 0.7, { yaw: rng.angle() });
  scatter([['reeds', 1]], 14, () => {
    const a = rng.angle();
    return [pond.cx + Math.cos(a) * (pond.rx - 1.5), pond.cz + Math.sin(a) * (pond.rz - 1.5)];
  }, { margin: 0.2 });
  const inPond = (x, z, k = 0.85) => ((x - pond.cx) / (pond.rx * k)) ** 2 + ((z - pond.cz) / (pond.rz * k)) ** 2 < 1;
  const pondSample = () => [pond.cx + rng.range(-pond.rx, pond.rx), pond.cz + rng.range(-pond.rz, pond.rz)];
  const swimState = { pond: 0 };
  scatter([['duck', 1]], 8, pondSample, { inside: (x, z) => inPond(x, z), o: { moverState: swimState } });
  scatter([['duckling', 1]], 7, pondSample, { inside: (x, z) => inPond(x, z), o: { moverState: swimState } });
  scatter([['koi', 1]], 10, pondSample, { inside: (x, z) => inPond(x, z), o: { moverState: swimState } });
  scatter([['boat_swan', 1]], 3, pondSample, { inside: (x, z) => inPond(x, z, 0.7), o: { moverState: swimState, y: -0.2 } });
  for (let i = 0; i < 3; i++) {
    const a = PI * 0.15 + i * 0.5;
    const x = pond.cx + Math.cos(a) * (pond.rx + 3.2), z = pond.cz + Math.sin(a) * (pond.rz + 3.2);
    put('fisherman', x, z, { yaw: Math.atan2(pond.cx - x, pond.cz - z) });
  }
  scatter([['goose', 1]], 5, inRect(-200, -12, -120, 10), { margin: 0.4, o: { moverState: { radius: 10 } } });
  solid('rockery', -205, -62, { yaw: 0.6 }, 0.3);
  solid('rockery', -118, -80, { yaw: 2.1, scale: 0.8 }, 0.3);
  for (let i = 0; i < 6; i++) solid('bamboo', -225 + rng.range(-4, 4), -100 + i * 9, { yaw: rng.angle() }, 0.2);
  for (let i = 0; i < 8; i++) put('bench', -190 + i * 12, 6, { yaw: PI });
  for (let i = 0; i < 8; i++) solid('lamp_palace', -200 + i * 14, -6, {}, 0.1);
  scatter([['tree_camphor', 2], ['tree_pine', 2], ['tree_peach', 1], ['bush', 2]], 40, inRect(KX0 + 4, KZ0 + 4, KX1 - 4, KZ1 - 4), {
    margin: 3,
    inside: (x, z) => !inPond(x, z, 1.25) && Math.hypot(x + 140, z - 22) > 18,
    solid: true,
  });
  scatter([['rock_small', 2], ['flower_patch', 3], ['mushroom', 2], ['grass_tuft', 3], ['snail', 1], ['clover', 2]], 110, inRect(KX0 + 2, KZ0 + 2, KX1 - 2, KZ1 - 2), {
    margin: 0.3,
    inside: (x, z) => !inPond(x, z, 1.1),
  });
  scatter(PEOPLE_WALK, 18, inRect(KX0 + 10, KZ0 + 10, KX1 - 10, KZ1 - 10), { margin: 1, inside: (x, z) => !inPond(x, z, 1.2), o: { mover: { kind: 'wander', speed: 0.7 }, moverState: { radius: 20 } } });
  // picnics, kites and whatever people leave on the grass: something for a ball of a metre or two
  scatter([...HOUSE, ['football', 3], ['kite', 1.5], ['umbrella', 2], ['takeout_bag', 3], ['watermelon', 2]], 70, inRect(KX0 + 4, KZ0 + 4, KX1 - 4, KZ1 - 4), {
    margin: 0.4,
    inside: (x, z) => !inPond(x, z, 1.15),
  });
  scatter(SMALL, 90, inRect(KX0 + 4, KZ0 + 4, KX1 - 4, KZ1 - 4), { margin: 0.1, inside: (x, z) => !inPond(x, z, 1.1) });
  scatter(CATS, 5, inRect(KX0 + 8, KZ0 + 8, KX1 - 8, KZ1 - 8), { margin: 0.4, inside: (x, z) => !inPond(x, z, 1.2) });
  scatter([['butterfly', 1]], 12, inRect(KX0, KZ0, KX1, KZ1), { margin: 0.2, inside: (x, z) => !inPond(x, z, 1.1) });
  // temple and pagoda on the north side of the park
  Z('stone', poly.rect(-230, -200, -150, -130));
  solid('temple_hall', -190, -170, { yaw: 0 }, 1);
  solid('pagoda', -165, -150, { yaw: 0 }, 1);
  solid('stone_lion', -198, -155, { yaw: 0 });
  solid('stone_lion', -182, -155, { yaw: 0 });
  for (let i = 0; i < 6; i++) put('lantern_red', -196 + i * 3.2, -160, { y: 5.5 });

  // =========================================================================================
  // 5. 幸福小学 — school with a running track, north of the compound
  // =========================================================================================
  Z('concrete', poly.rect(-70, -205, 70, -86));
  ZS('track', poly.ellipseRing(0, -130, 44, 24, 52, 32, 72));
  Z('grass', poly.ellipse(0, -130, 44, 24, 60));
  solid('school', 0, -182, { yaw: 0 }, 1);
  for (let x = -60; x <= 60; x += 6) put('sapling', x, -90, { yaw: rng.angle() });
  put('football', 3, -131, {});
  put('football', -12, -126, {});
  scatter([['kid', 1]], 16, inRect(-40, -150, 40, -110), { margin: 0.6, o: { moverState: { radius: 18 } } });
  scatter([['basketball', 1], ['shuttlecock', 1], ['book', 1], ['chalk', 2], ['eraser', 2], ['pinwheel', 0.5]], 40, inRect(-66, -165, 66, -92), { margin: 0.1 });
  scatter([['tree_plane', 1]], 10, inRect(-68, -202, 68, -165), { margin: 4, solid: true });

  // =========================================================================================
  // 6. The city: blocks of towers, offices, parks and building sites
  // =========================================================================================
  const CORE = [-310, -270, 250, 150];
  const PITCH = 140;
  const gx = [], gz = [];
  for (let x = -590; x <= 670; x += PITCH) gx.push(x);
  for (let z = -550; z <= 570; z += PITCH) gz.push(z);
  // grid roads, split where they would cross the hand-built core
  for (const x of gx) {
    if (x > CORE[0] && x < CORE[2]) {
      roadZ(x, -560, CORE[1] + 7, 14, 4, { walk: false });
      roadZ(x, CORE[3] - 7, 580, 14, 4, { walk: false });
    } else roadZ(x, -560, 580, 14, 4, { walk: Math.abs(x) < 400 });
  }
  for (const z of gz) {
    if (z > CORE[1] && z < CORE[3]) {
      roadX(z, -600, CORE[0] + 7, 14, 4, { walk: false });
      roadX(z, CORE[2] - 7, 680, 14, 4, { walk: false });
    } else roadX(z, -600, 680, 14, 4, { walk: Math.abs(z) < 400 });
  }
  // cars for the city grid
  for (let i = 0; i < 38; i++) {
    let x, z;
    if (rng.chance(0.5)) { x = rng.range(-590, 670); z = rng.pick(gz) + rng.pick([-3.8, 3.8]); }
    else { x = rng.pick(gx) + rng.pick([-3.8, 3.8]); z = rng.range(-550, 570); }
    if (x > CORE[0] && x < CORE[2] && z > CORE[1] && z < CORE[3]) continue;
    put(rng.weighted([...CARS, ['bus', 1], ['truck', 1]]), x, z, {});
  }
  // the special landmarks
  solid('tv_tower', 460, -420, { yaw: 0.3 }, 2);
  {
    const base = solid('ferris_base', 470, 340, { yaw: -0.5 }, 1);
    const ringSpec = specOf('ferris_ring');
    const baseSpec = specOf('ferris_base');
    if (base && ringSpec && baseSpec) {
      const hubY = baseSpec.hubY ?? baseSpec.dims.h * 0.55;
      const ring = put('ferris_ring', 470, 340, { yaw: -0.5, y: hubY - ringSpec.center.y });
      if (ring) base.links = [ring];
    }
  }
  const programs = [['towers', 5], ['towers32', 2], ['office', 2], ['oldtown', 3], ['park', 2], ['site', 1.2], ['market', 1.5]];
  for (let i = 0; i < gx.length - 1; i++) for (let j = 0; j < gz.length - 1; j++) {
    const x0 = gx[i] + 11, x1 = gx[i + 1] - 11, z0 = gz[j] + 11, z1 = gz[j + 1] - 11;
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    if (x1 > CORE[0] && x0 < CORE[2] && z1 > CORE[1] && z0 < CORE[3]) continue;
    if (Math.hypot(cx, cz) > 720) continue;
    const kind = rng.weighted(programs);
    cityBlock(kind, x0, z0, x1, z1);
  }
  function cityBlock(kind, x0, z0, x1, z1) {
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    const w = x1 - x0, d = z1 - z0;
    if (kind === 'park') {
      Z('grass', poly.rect(x0, z0, x1, z1));
      if (rng.chance(0.6) && isFree(cx, cz, w * 0.3)) {
        const p = { cx, cz, rx: w * 0.22, rz: d * 0.18 };
        Z('water', poly.ellipse(p.cx, p.cz, p.rx, p.rz, 40));
        ZS('stone', poly.ellipseRing(p.cx, p.cz, p.rx, p.rz, p.rx + 1.5, p.rz + 1.5, 40));
        L.ponds.push(p);
        block(p.cx - p.rx, p.cz - p.rz, p.cx + p.rx, p.cz + p.rz);
        for (let i = 0; i < 4; i++) put('duck', p.cx + rng.range(-p.rx, p.rx) * 0.5, p.cz + rng.range(-p.rz, p.rz) * 0.5, { moverState: { pond: L.ponds.length - 1 } });
        solid('pavilion', p.cx + p.rx + 8, p.cz, { yaw: -HALF });
      }
      scatter([['tree_camphor', 2], ['tree_pine', 1], ['tree_ginkgo', 1], ['tree_willow', 1], ['bamboo', 0.5], ['bush', 2], ['rock_big', 0.4]], 22, inRect(x0 + 4, z0 + 4, x1 - 4, z1 - 4), { margin: 3, solid: true });
      scatter([['flower_patch', 2], ['grass_tuft', 2], ['rock_small', 1]], 25, inRect(x0 + 2, z0 + 2, x1 - 2, z1 - 2), { margin: 0.4 });
      scatter(PEOPLE_WALK, 4, inRect(x0 + 5, z0 + 5, x1 - 5, z1 - 5), { margin: 1, o: { mover: { kind: 'wander', speed: 0.7 }, moverState: { radius: 25 } } });
      scatter([['dog_shiba', 1], ['dog_husky', 1], ['pigeon', 2]], 5, inRect(x0 + 5, z0 + 5, x1 - 5, z1 - 5), { margin: 1 });
      return;
    }
    if (kind === 'site') {
      Z('dirt', poly.rect(x0, z0, x1, z1));
      solid('building_site', cx - w * 0.2, cz, { yaw: rng.pick([0, HALF]) }, 1);
      solid('tower_crane', cx + w * 0.22, cz - d * 0.2, { yaw: rng.angle() }, 1);
      put('excavator', cx + w * 0.15, cz + d * 0.25, { yaw: rng.angle() });
      put('truck', cx - w * 0.3, cz + d * 0.35, { yaw: rng.angle(), mover: false });
      scatter([['traffic_cone', 3], ['rock_small', 2], ['parcel_big', 1], ['gas_tank', 0.5], ['briquette', 1]], 30, inRect(x0 + 3, z0 + 3, x1 - 3, z1 - 3), { margin: 0.5 });
      return;
    }
    Z('concrete', poly.rect(x0, z0, x1, z1));
    if (kind === 'market') {
      for (let r = 0; r < 3; r++) for (let c = 0; c < 9; c++) {
        const x = x0 + 10 + c * ((w - 20) / 8), z = z0 + 18 + r * ((d - 36) / 2);
        if (isFree(x, z, 6)) solid(SHOPS[(r * 9 + c) % SHOPS.length], x, z, { yaw: r === 1 ? 0 : PI }, 0.3);
      }
      scatter([['fruit_stall', 1], ['bbq_stall', 1], ['pancake_cart', 1], ['tanghulu_pole', 1], ['freezer', 1]], 8, inRect(x0 + 4, z0 + 4, x1 - 4, z1 - 4), { margin: 1, solid: true });
      scatter(PEOPLE_WALK, 8, inRect(x0 + 4, z0 + 4, x1 - 4, z1 - 4), { margin: 0.5, o: { mover: { kind: 'wander', speed: 0.8 }, moverState: { radius: 30 } } });
      scatter(SMALL, 40, inRect(x0 + 2, z0 + 2, x1 - 2, z1 - 2), { margin: 0.1 });
      scatter(HOUSE, 20, inRect(x0 + 2, z0 + 2, x1 - 2, z1 - 2), { margin: 0.2 });
      return;
    }
    if (kind === 'office') {
      if (isFree(cx - w * 0.2, cz - d * 0.15, 25)) solid('office_tower', cx - w * 0.2, cz - d * 0.15, { yaw: rng.pick([0, HALF, PI, -HALF]) }, 1);
      if (!isFree(cx + w * 0.2, cz + d * 0.2, 30)) { /* landmark nearby */ }
      else if (rng.chance(0.6)) solid('office_tower', cx + w * 0.24, cz + d * 0.2, { yaw: rng.pick([0, PI]), scale: rng.range(0.7, 0.9) }, 1);
      else solid('mall', cx + w * 0.1, cz + d * 0.25, { yaw: PI, scale: 0.8 }, 1);
      scatter([['tree_ginkgo', 1], ['flower_bed', 1], ['bench', 1], ['street_lamp', 1]], 14, inRect(x0 + 3, z0 + 3, x1 - 3, z1 - 3), { margin: 2, solid: true });
      scatter([['car_sedan', 2], ['suv', 1]], 10, inRect(x0 + 3, z0 + 3, x1 - 3, z1 - 3), { margin: 1.5, o: { mover: false }, solid: true });
      scatter([['young_phone', 2], ['jogger', 1]], 6, inRect(x0 + 3, z0 + 3, x1 - 3, z1 - 3), { margin: 1, o: { mover: { kind: 'wander', speed: 0.8 }, moverState: { radius: 30 } } });
      return;
    }
    if (kind === 'oldtown') {
      // low houses and shop-houses in a grid
      for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) {
        const x = x0 + 16 + c * ((w - 32) / 3), z = z0 + 16 + r * ((d - 32) / 3);
        if (rng.chance(0.75) && isFree(x, z, 8)) solid(rng.chance(0.5) ? 'farmhouse' : rng.pick(SHOPS), x, z, { yaw: rng.pick([0, PI]) }, 0.5);
      }
      scatter([['tree_plane', 1], ['tree_camphor', 1]], 8, inRect(x0 + 3, z0 + 3, x1 - 3, z1 - 3), { margin: 3, solid: true });
      scatter([['chicken', 2], ['cat_orange', 1], ['cat_tabby', 1], ['dog_shiba', 0.5]], 10, inRect(x0 + 3, z0 + 3, x1 - 3, z1 - 3), { margin: 0.8 });
      scatter(PEOPLE_WALK, 6, inRect(x0 + 3, z0 + 3, x1 - 3, z1 - 3), { margin: 0.8, o: { mover: { kind: 'wander', speed: 0.7 }, moverState: { radius: 20 } } });
      scatter(HOUSE, 30, inRect(x0 + 2, z0 + 2, x1 - 2, z1 - 2), { margin: 0.3 });
      scatter([['shared_bike', 1], ['ebike', 1], ['tricycle', 0.5], ['minivan', 0.5]], 10, inRect(x0 + 2, z0 + 2, x1 - 2, z1 - 2), { margin: 1, o: { mover: false } });
      return;
    }
    // residential towers with lawns and paths between them
    Z('grass', poly.rect(x0 + 6, z0 + 6, cx - 3, cz - 3));
    Z('grass', poly.rect(cx + 3, z0 + 6, x1 - 6, cz - 3));
    Z('grass', poly.rect(x0 + 6, cz + 3, cx - 3, z1 - 6));
    Z('grass', poly.rect(cx + 3, cz + 3, x1 - 6, z1 - 6));
    const id = kind === 'towers32' ? 'res_32f' : 'res_18f';
    const cols = 2, rows = 2;
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const x = x0 + w * (0.27 + c * 0.46), z = z0 + d * (0.3 + r * 0.42);
      if (isFree(x, z, 22)) solid(rng.chance(0.25) ? 'res_6f' : id, x, z, { yaw: 0 }, 1);
    }
    scatter([['tree_plane', 1], ['tree_camphor', 1], ['sapling', 1], ['flower_bed', 0.4]], 14, inRect(x0 + 3, z0 + 3, x1 - 3, z1 - 3), { margin: 2.5, solid: true });
    scatter([['car_sedan', 3], ['suv', 1], ['minivan', 1]], 8, inRect(x0 + 3, z0 + 3, x1 - 3, z1 - 3), { margin: 1.5, o: { mover: false }, solid: true });
    scatter(PEOPLE_WALK, 5, inRect(x0 + 3, z0 + 3, x1 - 3, z1 - 3), { margin: 1, o: { mover: { kind: 'wander', speed: 0.7 }, moverState: { radius: 25 } } });
    scatter(CATS, 3, inRect(x0 + 3, z0 + 3, x1 - 3, z1 - 3), { margin: 0.6 });
    scatter(HOUSE, 16, inRect(x0 + 2, z0 + 2, x1 - 2, z1 - 2), { margin: 0.3 });
    scatter(SMALL, 20, inRect(x0 + 2, z0 + 2, x1 - 2, z1 - 2), { margin: 0.1 });
  }

  // fill the gaps between the core areas and the city ring with tower blocks
  const fills = [
    [-302, -262, -244, 45], [-146, -262, -76, -96], [-70, -262, 76, -212], [80, -262, 242, -90],
    [-302, 84, 242, 142], [180, 32, 242, 48],
  ];
  for (const [x0, z0, x1, z1] of fills) {
    Z('concrete', poly.rect(x0, z0, x1, z1));
    if ((x1 - x0) > 40 && (z1 - z0) > 40) Z('grass', poly.rect(x0 + 8, z0 + 8, x1 - 8, z1 - 8));
    const n = Math.max(1, Math.floor(((x1 - x0) * (z1 - z0)) / 2600));
    scatter([['res_18f', 3], ['res_6f', 3], ['office_tower', 1], ['res_32f', 0.6]], n, inRect(x0 + 16, z0 + 16, x1 - 16, z1 - 16), { margin: 6, solid: true, o: { yaw: 0 } });
    scatter([['tree_plane', 1], ['tree_camphor', 1]], Math.ceil(n * 2), inRect(x0 + 3, z0 + 3, x1 - 3, z1 - 3), { margin: 2, solid: true });
    scatter([['car_sedan', 2], ['suv', 1]], n, inRect(x0 + 3, z0 + 3, x1 - 3, z1 - 3), { margin: 1.5, o: { mover: false }, solid: true });
  }

  // =========================================================================================
  // 7. Countryside: fields, farmhouses, the high-speed railway, wind farms
  // =========================================================================================
  const FIELD_R0 = 760, FIELD_R1 = 1080;
  for (let a = 0; a < 48; a++) {
    const a0 = (a / 48) * PI * 2, a1 = ((a + 1) / 48) * PI * 2;
    const r0 = FIELD_R0 - 40, r1 = FIELD_R1;
    Z('field', [[Math.cos(a0) * r0, Math.sin(a0) * r0], [Math.cos(a1) * r0, Math.sin(a1) * r0], [Math.cos(a1) * r1, Math.sin(a1) * r1], [Math.cos(a0) * r1, Math.sin(a0) * r1]]);
  }
  const ring = (r0, r1) => () => {
    const a = rng.angle(), r = rng.range(r0, r1);
    return [Math.cos(a) * r, Math.sin(a) * r];
  };
  for (let i = 0; i < 26; i++) {
    const [x, z] = ring(FIELD_R0, FIELD_R1 - 60)();
    if (!isFree(x, z, 20)) continue;
    const fh = solid('farmhouse', x, z, { yaw: rng.pick([0, PI, HALF, -HALF]) }, 1);
    if (!fh) continue;
    scatter([['chicken', 3], ['haystack', 1], ['dog_shiba', 0.4], ['pig', 1], ['rice_bundle', 2], ['scarecrow', 0.5], ['napa_cabbage', 1], ['radish', 1], ['tricycle', 0.4]], 10, around(x, z, 14), { margin: 0.8 });
    if (rng.chance(0.5)) put('buffalo', x + rng.range(-25, 25), z + rng.range(-25, 25), { moverState: { radius: 15 } });
  }
  scatter([['greenhouse', 1]], 14, ring(FIELD_R0 + 20, FIELD_R1 - 40), { margin: 10, solid: true, o: { yaw: rng.angle() } });
  scatter([['haystack', 2], ['scarecrow', 1], ['rice_bundle', 3], ['sunflower', 3], ['tree_camphor', 1], ['tree_pine', 0.6], ['rock_big', 0.5]], 220, ring(FIELD_R0, FIELD_R1), { margin: 1.5 });
  scatter([['sunflower', 1]], 120, around(-640, 620, 30), { margin: 0.3 });
  // power line
  for (let i = -6; i <= 6; i++) solid('power_pylon', i * 190, 880, { yaw: 0 }, 2);
  // high-speed railway on a viaduct along z = -760
  const VZ = -800;
  const viaductSpec = specOf('viaduct');
  if (viaductSpec) {
    const segLen = viaductSpec.dims.d;
    for (let x = -1400; x <= 1400; x += segLen) put('viaduct', x, VZ, { yaw: HALF });
    const railY = viaductSpec.railY ?? viaductSpec.dims.h * 0.6;
    const off = viaductSpec.trackOffset ?? 0;
    const tl = lane([[-1380, VZ + off], [1380, VZ + off]], false, railY);
    put('bullet_train', -600, VZ + off, { y: railY, moverState: { lane: tl, s: 800 } });
  }
  // wind turbines on the far hills
  const towerSpec = specOf('turbine_tower'), rotorSpec = specOf('turbine_rotor');
  for (let i = 0; i < 9; i++) {
    const a = -0.35 + i * 0.1;
    const x = Math.cos(a) * 1250, z = Math.sin(a) * 1250;
    const tw = solid('turbine_tower', x, z, { yaw: -a - HALF }, 2);
    if (tw && towerSpec && rotorSpec) {
      const hubY = towerSpec.hubY ?? towerSpec.dims.h * 0.97;
      const hubZ = towerSpec.hubZ ?? towerSpec.dims.d * 0.35;
      const yaw = -a - HALF;
      const rx = x + Math.sin(yaw) * hubZ, rz = z + Math.cos(yaw) * hubZ;
      const rot = put('turbine_rotor', rx, rz, { yaw, y: hubY - rotorSpec.center.y, moverState: { phase: i * 0.7 } });
      if (rot) tw.links = [rot];
    }
  }

  // =========================================================================================
  // 8. Mountains and clouds
  // =========================================================================================
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * PI * 2 + rng.range(-0.08, 0.08);
    const r = rng.range(1150, 1230);
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (!isFree(x, z, 40)) continue;
    solid('hill_small', x, z, { yaw: rng.angle(), scale: rng.range(0.8, 1.3) }, 5);
  }
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * PI * 2 + rng.range(-0.05, 0.05);
    const r = rng.range(1380, 1560);
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    const southwest = Math.cos(a - 2.4) > 0.55;
    const id = southwest ? 'mountain_karst' : rng.chance(0.4) ? 'mountain_rocky' : 'mountain_green';
    // karst peaks have a river painted on their +Z foot: turn it towards town
    const yaw = southwest ? Math.atan2(-x, -z) + rng.range(-0.3, 0.3) : rng.angle();
    solid(id, x, z, { yaw, scale: southwest ? rng.range(0.8, 1.3) : rng.range(0.55, 0.85) }, 10);
  }
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * PI * 2 + 0.2;
    const r = 1850;
    // (sized so a ball that has come this far can start on them before long, not a wall to bump along)
    solid(rng.chance(0.5) ? 'mountain_rocky' : 'mountain_green', Math.cos(a) * r, Math.sin(a) * r, { yaw: rng.angle(), scale: rng.range(0.95, 1.35) }, 10);
  }
  // a far range that frames the world (only a truly enormous ball ever reaches it)
  for (let i = 0; i < 26; i++) {
    const a = (i / 26) * PI * 2 + rng.range(-0.06, 0.06);
    const r = rng.range(2700, 3400);
    const id = rng.weighted([['mountain_rocky', 3], ['mountain_green', 2], ['mountain_karst', 1]]);
    put(id, Math.cos(a) * r, Math.sin(a) * r, { yaw: rng.angle(), scale: rng.range(2.2, 3.4) });
  }

  // 山水 clouds drift at half mountain height; a few higher ones over town
  for (let i = 0; i < 26; i++) {
    const [x, z] = ring(1150, 1750)();
    put('cloud', x, z, { y: rng.range(100, 170), yaw: rng.angle(), scale: rng.range(0.9, 1.8) });
  }
  for (let i = 0; i < 10; i++) {
    const [x, z] = ring(250, 1000)();
    put('cloud', x, z, { y: rng.range(260, 380), yaw: rng.angle(), scale: rng.range(0.8, 1.4) });
  }

  return L;
}
