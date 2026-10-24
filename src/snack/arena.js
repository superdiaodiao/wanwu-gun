// The snack game's map: a picnic on a lawn. A big gingham blanket in the middle strewn with food
// from seeds and sweets to buns and fruit; round it on the grass the picnickers' bigger things
// (melons, thermoses, stools, hampers' worth of takeaway), then at the edge the biggest bites (a
// food stall, a fruit cart, a barbecue). Balls start round the blanket's rim. Returns what the
// world, the ground and the movers need, like layout.js does for the town.
import { RNG } from '../core/rng.js';
import { poly } from '../game/ground.js';

export const ARENA = { blanket: 9, lawn: 34, bounds: 38 }; // half-sizes / radius (m)

// what lies where, weighted
const TINY = [['guazi', 8], ['peanut', 6], ['candy', 6], ['lollipop', 2], ['jiaozi', 3], ['dried_fish', 1], ['mahjong_zhong', 0.4]];
const SMALL = [['baozi', 5], ['orange', 4], ['apple', 4], ['tomato', 3], ['banana', 3], ['egg', 3], ['mooncake', 2], ['zongzi', 2], ['skewer', 2], ['milk_tea', 3], ['ice_pop', 2], ['tanghulu', 1.5], ['tea_cup', 1.5], ['chopsticks', 1.5], ['garlic', 1]];
const MID = [['watermelon_half', 3], ['takeout_bag', 3], ['steamer', 2], ['thermos', 2], ['kettle', 1.5], ['napa_cabbage', 2], ['radish', 1.5], ['scallion', 1.5], ['office_snack_box', 1.5], ['office_coffee', 2], ['rice_cooker', 1]];
const BIG = [['watermelon', 4], ['plastic_stool', 4], ['parcel_big', 2], ['umbrella', 2], ['suitcase', 1.5], ['electric_fan', 1], ['basketball', 1.5], ['football', 1.5], ['kick_scooter', 1]];
const HUGE = [['bbq_stall', 1], ['pancake_cart', 1], ['fruit_stall', 1], ['baozi_stall', 1], ['freezer', 1], ['vending_machine', 1]];

export function buildArena(world, seed = 20261025) {
  const rng = new RNG(seed);
  const zones = { grass: [poly.rect(-200, -200, 200, 200)], picnic: [poly.rect(-ARENA.blanket, -ARENA.blanket, ARENA.blanket, ARENA.blanket)] };
  const put = (id, x, z, o = {}) => world.add(id, x, z, { rng, yaw: rng.angle(), ...o });
  const weighted = list => rng.weighted(list);
  const inDisc = (r0, r1) => { const a = rng.angle(), r = Math.sqrt(rng.range(r0 * r0, r1 * r1)); return [Math.cos(a) * r, Math.sin(a) * r]; };
  const inSquare = h => [rng.range(-h, h), rng.range(-h, h)];
  const B = ARENA.blanket;
  // the blanket: thick with small things, thinning to the middle-sized ones
  for (let i = 0; i < 1500; i++) put(weighted(TINY), ...inSquare(B - 0.2));
  for (let i = 0; i < 320; i++) put(weighted(SMALL), ...inSquare(B - 0.3));
  for (let i = 0; i < 40; i++) put(weighted(MID), ...inSquare(B - 0.6));
  // thickest where the balls start, round the blanket's rim: something to eat at every turn
  for (let i = 0; i < 2200; i++) { const a = rng.angle(), r = rng.range(B - 4, B + 4); put(weighted(TINY), Math.cos(a) * r, Math.sin(a) * r); }
  // the lawn round it: crumbs that got carried off, then bigger things the further out
  for (let i = 0; i < 600; i++) put(weighted(TINY), ...inDisc(B, B + 6));
  for (let i = 0; i < 220; i++) put(weighted(SMALL), ...inDisc(B, B + 12));
  for (let i = 0; i < 90; i++) put(weighted(MID), ...inDisc(B + 2, ARENA.lawn - 6));
  for (let i = 0; i < 45; i++) put(weighted(BIG), ...inDisc(B + 6, ARENA.lawn - 3));
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + rng.range(-0.2, 0.2), r = ARENA.lawn - 1;
    put(HUGE[i % HUGE.length][0], Math.cos(a) * r, Math.sin(a) * r, { yaw: -a - Math.PI / 2 });
  }
  // a ring of trees just outside, to close the picnic in
  for (let i = 0; i < 26; i++) {
    const a = (i / 26) * Math.PI * 2 + rng.range(-0.06, 0.06), r = ARENA.bounds + 3 + rng.range(0, 4);
    put(rng.chance(0.5) ? 'tree_plane' : 'tree_camphor', Math.cos(a) * r, Math.sin(a) * r, { scale: rng.range(0.8, 1.1) });
  }
  // where balls start: round the blanket's rim (the player on the south side)
  const spawns = [];
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2, r = B + 1.5 + (i % 2) * 4;
    spawns.push([Math.cos(a) * r, Math.sin(a) * r]);
  }
  return {
    zones, paths: [], lanes: [], blocked: [], groups: {}, ponds: [], pond: null,
    bounds: ARENA.bounds,
    start: { x: 0, z: B - 1.5, heading: 0 },
    spawns,
  };
}
