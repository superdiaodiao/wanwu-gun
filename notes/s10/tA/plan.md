# s10/tA plan: real height for 春·鸭子池塘 (idx 0-8) and 夏·泳池派对 (idx 9-17)

## What reads from the fixed camera (learned from t1 screenshots, shots/t1-y1.png, t1-y2.png)
- The camera looks up the hole from +z. An earth/tile wall shows only where it faces the camera: the
  near (+z) face of any part of the green with water in front of it, and the side face of a leg that
  faces the middle of the screen (a left-hand leg's right side, a right-hand leg's left side).
- So height reads when (a) an upper level is farther than water in front of it (terrace, as hole 28),
  or (b) a raised LEG sits on one side of an L/Z/C: its inner side wall shows its full height down the
  whole leg. (b) works downhill too: a raised tee leg dropping into the next leg reads at once and the
  slope helps the ball. A straight centred hole only shows a taller near face and the slope's shading.
- No new ground type is needed: all of this is ramps (planes) + hills, with the rows the ramp crosses
  holding only one leg. One engine fix: corner tyre piles stood at y 0 always (buried on raised
  ground) -> props.js cornerTires now stands at the green's height at its front (0 on flat: unchanged).

## Per hole (today -> proposal)
Pond (gentlest; first holes downhill only, never a wall to climb):
- 1 热身 (flat) -> tee deck 0.5 m rolling down toward the cup, bowl round the cup.
- 2 跷跷板 (flat L) -> the tee leg a raised walk 0.7 m above the bar, dropping into the seesaw corner;
  the leg's right wall shows down its whole length. Downhill into the bank.
- 3 电风扇 keep (two fans on a Z: wind + slopes too much to read; and must stay simple)
- 4 过马路 keep (cars on the road need flat ground; a ball stopped on a slope beside it rolls onto it)
- 5 大鹅 (flat) -> tee lane raised, dropping to the goose's lawn ("hit hard, rush past": downhill helps)
- 6 猫和轮胎 (flat C) -> the right-hand column a long ramp, the cup's top band a terrace 0.7 m up:
  its front wall faces the camera across the water (or the reverse, descending, whichever is easier)
- 7 弹弹轮胎 (flat) -> tee leg and the tyre corner high (0.7), the wide lawn tilting down to the cup at
  the right rail: a wedge of wall along the lawn's front, the leg's tall right wall
- 8 两只猫 keep (straight, cats: a slope near the cats only adds swipes)
- 9 早高峰 keep (road)
Pool:
- 10 上坡 ramp 0.5 -> 0.9 terrace
- 11 小土包 mounds 0.3 -> 0.55
- 12 风车 keep (windmill)
- 13 斜坡 ridge 0.36 -> bigger bank (if Easy holds)
- 14 洒水器 (flat S) -> descending stairs: tee leg 0.9, middle band 0.45, cup leg 0
- 15 割草机 keep (hardest hole for weak players already)
- 16 大碗 keep (bowl 0.5 deep, the breather)
- 17 过山车 hump 0.2 + ramp 0.25 -> hump 0.3 + ramp 0.7 to the top
- 18 大风车 ramp 0.25 -> 0.7 terrace up to the windmill
Every changed hole is gated (N=96 TRACE, seeds 1-4, coinbot, stuck scan, perf, camera); one that loses
Easy casual within-par is reshaped or reverted.

## Outcome (what was built, after gating; numbers in commit/table.txt)
Pond: 1 热身 tee deck 0.6 + long gentle fall + bowl; 2 跷跷板 raised walk 0.7 dropping into the seesaw corner + bowl;
3 电风扇 band + cup bed a step up 0.42 (ramp up the tee bed; coin moved onto the ramp); 6 猫和轮胎 descending C
(tee band terrace 0.7, column a 5 m slope down, bowl); 7 弹弹轮胎 left half 0.65 up, the lawn tilting down to the cup.
Kept flat: 4 过马路, 9 早高峰 (roads), 5 大鹅 (downhill lane: aces 31-54% with a bowl, casual -2 without), 8 两只猫 (aces).
Pool: 11 小土包 mounds 0.55 (coin moved); 14 洒水器 three-step stair down 0.9/0.45/0; 15 割草机 tee leg 0.6 above the
cup leg, top falling across. Reverted (could not keep Easy casual from dropping on some seed, or aces > 15%):
10 上坡 (0.62-0.9: the climb needs near full power, casual 100 -> 97.9-99; with a fall to the cup aces 22-38%),
12 风车 (tilt 0.4: casual -1 on 2 seeds, aces 20%), 13 斜坡 (raised tee leg / bigger bank: casual -1..-6 on 1-2 seeds),
16 大碗 (deeper bowl: -1 on 2 seeds), 17 过山车 (climb 0.45-0.7: casual -1..-5 on every seed), 18 大风车 (0.45-0.7 climb
to the windmill: casual 81-88 vs 96; descending lane 94 vs 96). Pool ends with 3 holes of new height, not 5.
