// The golf game's own English: words only it says that the shared table (src/i18n/en/ui.js, which the
// other game bundles whole, so it stays as that game has it) doesn't have. Merged into that table at
// start (holes.js), as each yard's own words are. The Chinese is the key.
export const EN = {
  // (the card on a hole with no coins: its third star, and the line under the stars)
  '小鸟球': 'Birdie',
  '{n} 杆 · 标准杆 {par}': '{n} stroke{s} · par {par}',
  // (the card's tip on a par 2 with coins left: never a hole in one)
  '再拿一颗星：捡齐金币': 'Next ★: grab every coin',
  // (hole 2's tip)
  '借跷跷板拐弯': 'Bank off the seesaw round the corner',
  // (the page after the last yard, every one played through)
  '整个街区通关！': 'Neighbourhood complete!',
  // (what the ground says over itself till the first shot: mud and ice, course.js SURF)
  '泥地会减速': 'Mud slows the ball',
  '冰面很滑': 'Ice is slippery',
};
