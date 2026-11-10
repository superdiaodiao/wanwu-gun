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
  '借跷跷板拐弯': 'Bank off the seesaw to turn the corner',
  // (hole 12's tip: the windmill's door, or the path round it)
  '穿过风车，或从旁边绕': 'Through the windmill, or around it',
  // (hole 9's tip: its crossing has a pedestrian light)
  '绿灯亮了再打，再绕开大鹅': 'Wait for the green light, then dodge the goose',
  // (the page after the last yard, every one played through)
  '整个街区通关！': 'Neighborhood complete!',
  '整个街区：{n}/{all} 洞 · ★ {s}/{S}': 'Whole neighborhood: {n}/{all} holes · ★ {s}/{S}',
  '整个街区都打完了！': 'You played the whole neighborhood!',
  // (what the ground says over itself till the first shot: mud and ice, course.js SURF)
  '泥地会减速': 'Mud slows the ball',
  '冰面很滑': 'Ice is slippery',
  // (holes 16, 17 and 18's tips, reshaped in step 4)
  '洞在碗底再过去一点': 'The cup is just past the bottom of the bowl',
  '冲上坡顶，再拐弯进洞': 'Up over the top, then turn to the cup',
  '直直穿过大风车': 'Straight through the big windmill',
  // (the card's third star on a hole with coins; with none, or won by a birdie, it says Birdie)
  '金币全捡': 'All coins',
  // (the difficulty's page: what each one means, and what picking another does to a hole under way)
  '长瞄准线': 'Long aim line',
  '短瞄准线': 'Short aim line',
  '没有瞄准线': 'No aim line',
  '换了会重打这洞': 'This hole restarts',
  // (picking a hole: the tile to go on with, a hole let off, a yard's first hole played again)
  '▶ 接着打': '▶ Play',
  '跳过': 'Skipped',
  '新一轮 · {yard}': 'New round · {yard}',
  // (the card at a harder difficulty, a hole skipped or let off: one tap to the easy one)
  '太难？换成简单': 'Too hard? Switch to Easy',
  // (coming back: the yard by name; a hole played once more by the way: the card's button back)
  '欢迎回来 · {yard}': 'Welcome back · {yard}',
  '回到第 {n} 洞': 'Back to hole {n}',
  // (the pause menu: clearing the progress, asked first)
  '清空进度': 'Reset progress',
  '清空进度？': 'Reset progress?',
  '星星、奖牌和最好成绩都会清掉，从第 1 洞重新开始。': 'All stars, medals and best scores are erased. You start again at hole 1.',
  '取消': 'Cancel',
  '清空': 'Reset',
  '进度已清空': 'Progress reset',
  // (the big button after the last yard: another round of this yard, or every yard gold)
  '再打一轮': 'Play again',
  '从第 1 洞再打': 'Play from hole 1',
  // (American spelling and plainer words, over the shared table's: that file is the other game's too and stays as it is)
  '撞墙会弹回来，借墙拐弯': 'Bounce off the walls to get around the corner',
  '土包会把球拐开，绕过去或冲过去': 'Go around the bumps, or over',
  '猫爪圈里会被拍，轮胎会把球狠狠弹回来': 'Cats swat inside their rings. Tires bounce hard!',
  '猫爪圈里会被拍，看准空当再打': 'Cats swat inside their rings: time your shot',
  // (tips that only say what to do: the tag over the fan, the goose, the sprinkler, the mower says what it does)
  '往上风那边瞄': 'Aim into the wind',
  '用力打，冲过大鹅': 'Putt hard and get past the goose',
  '看准空当再打': 'Pick your moment',
  '等割草机开过去': 'Let the mowers pass',
  // (the tags over things, shorter; a dog or a pig only noses a ball that has stopped by it)
  '会撞开球': 'Bumps the ball',
  '转臂会扫开球': 'Sweeps the ball',
  '会吹偏球': 'Blows the ball',
  '会拱走停下的球': 'Noses a stopped ball',
};
