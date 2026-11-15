# Height in 小区高尔夫: what the format and physics support today (dev/golf 0d5b8ba)

## Hole format
- `ground: [...]` on a hole (holes.js header, src/golf/ground.js). Three shapes, summed:
  - `ramp {from:[c,r], to:[c,r], h}`: rises by h from `from` to `to`; flat before and after, the ends rounded
    (E = 0.3 of its length each end). It is a plane across the WHOLE map: everything past its top is high,
    everything before its foot low. There is no ramp of limited width.
  - `hill {at, r, h}`: a cosine mound (h < 0 a bowl, used as a dip round a cup: r 1.2-1.6, h -0.06..-0.18).
  - `ridge {from, to, w, h}`: a long hump.
- Heights in use: 0.15-0.5 m (pool 上坡 +0.5 over 3 m; snow 滑雪坡 -0.5 over 4 m; pumpkin steps 0.2-0.4 over 1-1.4 m).
- The ground is continuous: no cliffs, no drops, no holes in it. Two levels side by side in one row are not
  possible; two levels are always split by a ramp line across the map.

## Physics (src/golf/physics.js)
- 2D ball on the ground plane; the slope only adds a pull `grav (7) * gradient` downhill; a nearly stopped ball
  stays put where the pull is < hold (1.0 m/s^2; mud 3x, ice 0.6x).
- Colliders are 2D (seg/circle/box). Rails run along every green/not-green edge, so a ball can never leave the
  green: there is no "falling off a ledge" and nothing to model it with. A "drop" can only be a steep ramp.
- simulate() (the aim guide) includes slopes, so on Easy the 7 m guide shows the ball rolling back off a ramp.

## Looks of raised ground (src/golf/course.js, looks/)
- The green mesh follows Y(x, z) (cut finer where not flat), shaded by slope (facing the player lighter) and
  a little lighter higher up; faint downhill chevrons where the gradient > 0.08 (autumn: cream with a shadow).
- The block under the green follows the edge height (`addLifted`), so where green meets not-green on high
  ground the earth side shows. Rails, posts and the snow on them (winter) follow the ground.
- Steps: only autumn dresses them (stepEdges: a timber board along the top of a row/column ramp; turf.lip: a
  shade band below the top). Pond, pool and winter have no step dressing; their slopes read by shading and
  chevrons only.
- Not-green squares inside the hole's rectangle: water at pond level (autumn: raised beds in it, winter:
  frozen pond with snowmen). Next to a raised level they show that level's earth wall.
- Props (obj, bank, bikes, animals, tags) sit at course.Y of their spot.

## Camera (src/golf/main.js aim())
- Fixed view from the tee end (+z). It frames the four corners at y 0 and 0.3, the flag at cup height + 1.3,
  and every raised tile corner at y + 0.3, so raised parts are kept on screen.
- What reads at a glance: a level that is HIGHER and FARTHER than the tee shows its earth wall to the camera
  (clear). A level that is lower and farther hides its step (only chevrons tell): tried on hole 20, the drop
  hardly reads at 844x390. Full-width steps on a plain L (old hole 20) read as a line only.

## What it takes for a clear two-level hole with today's code (no engine change needed)
- One ramp across the map, and the green narrowed to a lane in the ramp's rows (the rest of those rows
  not-green): the ramp becomes the only way up, and the upper level's earth wall shows either side of the
  lane. Upper level at the far end (uphill from the tee), so its wall faces the camera.
- Golf-only, no new ground type, no new collider kind, no main.js change.
