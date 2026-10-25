// The numbers. The merge chain: each step up is two of the step below, and hits more than twice as
// hard (merging always pays). `every` is seconds between throws; `face` turns the model on the board.
export const TIERS = [
  { id: 'slipper', name: '拖鞋' },
  { id: 'kettle', name: '水壶' },
  { id: 'electric_fan', name: '电风扇' },
  { id: 'rice_cooker', name: '电饭锅' },
  { id: 'fire_extinguisher', name: '灭火器' },
  { id: 'goose', name: '大鹅' },
  { id: 'stone_lion', name: '石狮子' },
  { id: 'fire_truck', name: '消防车' },
].map((T, i) => ({ ...T, dmg: Math.round(4 * 2.5 ** i), every: 0.9 }));

// The trash monsters: model, shown size (m), health at wave strength 1, speed (m/s), coins when
// beaten, hearts lost when one gets through the fence
export const MONSTERS = {
  bag: { id: 'trash_bag', size: 1.1, hp: 12, speed: 1.1, coins: 4, harm: 1 },
  cone: { id: 'traffic_cone', size: 1.0, hp: 8, speed: 1.8, coins: 4, harm: 1 },
  can: { id: 'trash_can', size: 1.5, hp: 40, speed: 0.8, coins: 9, harm: 2 },
  boss: { id: 'trash_bins', size: 2.8, hp: 400, speed: 0.45, coins: 60, harm: 10 },
};

// Five waves: how many of each, a health multiplier, the gap between them (s), the boss at the end
export const WAVES = [
  { mix: [['bag', 8]], hp: 1, gap: 1.5 },
  { mix: [['bag', 10], ['cone', 4]], hp: 2.4, gap: 1.2 },
  { mix: [['bag', 10], ['cone', 6], ['can', 3]], hp: 4.5, gap: 1.0 },
  { mix: [['bag', 12], ['cone', 8], ['can', 5]], hp: 6, gap: 0.85 },
  { mix: [['bag', 14], ['cone', 10], ['can', 7]], hp: 8.5, gap: 0.75, boss: 'boss' },
];

export const HEARTS = 10, START_COINS = 24;
/** the price of the n-th slipper bought this round */
export const cost = n => 6 + n;
