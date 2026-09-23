# 万物皆可滚 — catalog modelling guide

The game is a Katamari-style roller set in a Chinese neighbourhood (小区, street food lane, square
dance plaza, park, city, farmland, mountains). The player's ball rolls up everything it touches, from
a 2 cm melon seed to a 300 m mountain. Every object is a **procedural low-poly model written in
code** — there are no image or model files anywhere. All objects share one flat-shaded Lambert
material with vertex colours plus one runtime texture atlas for small pictures (text, faces, labels).

Read `src/catalog/examples.js` first: 包子, 橘猫, 小汽车 (tinted), 麻将·红中 (decal). Match that
look — chunky toy proportions, readable silhouettes, cute details, friendly colours.

## File ownership

You own exactly one file in `src/catalog/` (named in your task). Only edit that file. Do not edit
anything in `src/core/`, other catalog files, `build.mjs` or `tools/`. If you need a helper that the
modeler lacks, write it as a local function in your own file (you may import `three` directly).
Prefix every decal key you register with your file's prefix (given in your task).

## Registering an object

```js
import { def } from './registry.js';
import { D, shade, mix } from '../core/modeler.js';
import { decal, fitText, verticalText, FONTS } from '../core/atlas.js';

def('cat_tabby', {
  name: '狸花猫',          // Chinese display name, shown when the ball rolls it up
  cat: 'animal',           // food | daily | toy | animal | person | plant | vehicle | street | building | landmark | nature
  sfx: 'meow',             // pickup sound (see list below)
  mover: { kind: 'wander', speed: 0.6 },   // only for things that move (optional)
  tints: [0xd8342c, 0x2f63c9],             // only if the model uses m.tint() (optional)
  fill: 0.5,               // how solid the bounding box is, 0..1 (default 0.45; a box 1, a bicycle 0.15)
  build(m) { /* ... */ },
});
```

`sfx` values: `tiny` (seeds, coins, tiles), `soft` (cloth, bread, paper towels), `hard` (plastic,
wood toys), `metal`, `glass`, `paper`, `wood`, `squish` (dough, fruit), `meow`, `bark`, `cluck`,
`quack`, `coo`, `honk` (goose), `moo`, `scream_f` (women), `scream_m` (men), `scream_kid`, `horn`
(cars), `bell` (bicycles), `crash` (big vehicles, furniture), `rumble` (buildings, rocks), `gong`
(landmarks, mountains).

`mover.kind` values: `walk` (follows paths — pedestrians), `wander` (ambles around a home spot —
cats, dogs, chickens, kids), `drive` (vehicles on roads), `fly` (hops, flies off when the ball
comes — pigeons, sparrows), `swim` (ducks, koi on the pond), `dance` (square-dance aunties),
`taichi` (tai-chi uncles), `spin` (rotates around its bounding-box centre; add `axis: 'x'|'y'|'z'`
and `speed` in rad/s — used for wind turbine rotors and ferris-wheel rings). Moving things must face
**+Z** because that is the direction they travel.

## Conventions

* Units are **metres**. Build things at their real size (a coin is 0.025, a bus 12).
* **+Y up. The model stands on y = 0**, centred on x = z = 0. `build()` lifts anything below y = 0,
  and the gallery warns if that lift is large — fix it in the model.
* **Front faces +Z** (faces, headlights, shop fronts, the side you would photograph).
* Positions given to primitives are the **centre** of that primitive. Angles in radians (`30 * D`).
* Euler order is XYZ: the Z rotation is applied first, then Y, then X.
* Use `m.rng` (seeded, deterministic) for any randomness — never `Math.random()`.

## Modeler API (`src/core/modeler.js`)

| call | what |
|---|---|
| `m.box(w, h, d, col, x, y, z, rx, ry, rz)` | box |
| `m.rbox(w, h, d, radius, col, x, y, z, rx, ry, rz)` | rounded box (more tris — hero parts only) |
| `m.cyl(rTop, rBot, h, col, x, y, z, rx, ry, rz, seg=8)` | cylinder / truncated cone along local Y |
| `m.cone(r, h, col, x, y, z, rx, ry, rz, seg=8)` | cone, tip at +Y |
| `m.pipe(r, h, col, x, y, z, rx, ry, rz, seg=10)` | open tube wall, visible inside and out |
| `m.sphere(r, col, x, y, z, sx=1, sy=1, sz=1, rx, ry, rz, seg=8)` | sphere, optionally stretched |
| `m.ellipsoid(ax, ay, az, col, x, y, z, rx, ry, rz, seg=8)` | ellipsoid by radii |
| `m.dome(r, col, x, y, z, sx, sy, sz, rx, ry, rz, seg=8)` | upper half sphere (flat side at y) |
| `m.capsule(r, len, col, x, y, z, rx, ry, rz, seg=8)` | capsule along Y, total height len + 2r |
| `m.torus(R, t, col, x, y, z, rx, ry, rz, arc=2π, radSeg=6, tubSeg=14)` | ring in local XY plane |
| `m.lathe([[r, y], ...], col, x, y, z, rx, ry, rz, seg=10)` | profile revolved around Y (vases, cups, buns) |
| `m.extrude([[x, y], ...], depth, col, x, y, z, rx, ry, rz, bevel=0)` | 2D polygon in XY extruded along Z |
| `m.tube([[x, y, z], ...], r, col, seg=6)` | smooth tube through points (tails, handles, strings) |
| `m.prism(w, h, d, col, ...)` | triangular prism (gable roof), apex up, length along Z |
| `m.wedge(w, h, d, col, ...)` | ramp: tall side at −x, slope down to +x (windscreens) |
| `m.plane(w, h, col, ...)` | double-sided rectangle facing ±Z (leaves, flags, cloth) |
| `m.disc(r, col, ...)` | double-sided disc facing ±Y |
| `m.decal(w, h, key, x, y, z, rx, ry, rz, col=0xffffff, double=false)` | atlas picture on a quad facing +Z |
| `m.tbox(w, h, d, col, {px,nx,py,ny,pz,nz: key}, x, y, z, rx, ry, rz)` | box with decals on chosen faces |
| `m.geo(threeGeometry, col, x, y, z, rx, ry, rz, sx, sy, sz)` | any THREE geometry; `col` may be a function `(x,y,z,nx,ny,nz) => hex` for per-vertex colour (height gradients, snow caps) |
| `m.push(x, y, z, rx, ry, rz, s)` / `m.pop()` | transform stack (s = number or `[sx, sy, sz]`) |
| `m.sym(s => ...)` | runs with s = +1 and −1 — mirrored pairs (`s * x`) |
| `m.tint()` … `m.tint(0)` | parts in between take the per-instance colour from `tints` — model them **white** (0xffffff) or light |
| `m.glow(v)` … `m.glow(0)` | parts in between emit light at dusk (lanterns, lamps, lit windows, screens) |
| `m.jitter(0.08)` … `m.jitter(0)` | random brightness per part (bricks, leaves, rocks) |
| `m.rng.range(a, b)`, `.int`, `.pick`, `.chance` | deterministic randomness |
| `shade(hex, k)`, `mix(a, b, t)` | colour helpers (sRGB hex) |

Low segment counts are the style: spheres 6–10, cylinders 6–12. Flat shading makes facets visible
and that is intentional.

## Decals (`src/core/atlas.js`)

For text, faces, patterns, labels: register a small canvas drawing at module load, then place it.

```js
decal('st_bus_sign', 256, 48, (ctx, w, h) => {
  ctx.fillStyle = '#10151c'; ctx.fillRect(0, 0, w, h);
  fitText(ctx, '88路 幸福里', w / 2, h / 2, w - 12, h - 10, FONTS.sans, '#ffb020');
});
// in build(): m.decal(2.0, 0.38, 'st_bus_sign', 0, 2.9, 6.02);
```

* Pixels with alpha < 0.5 are cut out, so a decal can be a full opaque picture **or** just shapes
  (a character, stripes, eyes) floating over the surface behind it.
* Keep decals small: 32–128 px for small items, up to 512 × 128 for shop signs. Total atlas space
  is shared by everyone.
* Offset a decal 0.3–1 mm in front of its surface on small items, 1–3 cm on buildings, so it never
  z-fights. `decal` is single-sided and faces +Z; rotate it (e.g. `-90 * D` about X to face up,
  `Math.PI` about Y to face −Z).
* Fonts: `FONTS.brush` (calligraphy — shop signs, couplets), `FONTS.serif` (mahjong, chess),
  `FONTS.sans` (labels, plates), `FONTS.round` (playful). Helpers: `fitText(ctx, text, cx, cy, maxW,
  maxH, font, color)` and `verticalText(...)` for vertical signs and 春联.

## Style guide

* **Toy-like and readable.** Slightly exaggerate the defining feature (a cat's ears and round
  cheeks, a bus's big windscreen, a 包子's pleats). Something 3 px tall on screen should still be
  recognisable by silhouette and colour.
* **Faces make things alive.** People and animals get dot eyes (dark brown 0x2a1d17, not pure
  black), a small nose/beak, and pink blush on round cheeks. People are chibi: head ≈ 1/4–1/3 of
  height, big and round; short limbs.
* **Colour.** Friendly, saturated but not neon. Avoid pure 0x000000 / 0xffffff (use 0x26262c and
  0xf4f2ec). Suggested anchors: red 0xd8342c, vermilion 0xe8554a, gold 0xf2c14e, orange 0xf2a14a,
  cream 0xf6efe0, teal 0x2aa198, sky 0x5aa9e6, navy 0x2c3e66, leaf 0x5cae4f, deep green 0x3f8f4a,
  brown 0x8b5a3c, wood 0xb07a4f, stone grey 0x9aa0a6, concrete 0xc9c4b8.
* **Chinese everyday life is the joke and the charm.** Specific real-world details are what make
  it land: 红色塑料凳, 搪瓷缸 with a red rim, 老头衫, 烫发 aunties, 空调外机 on every building,
  太阳能热水器 on roofs, 春联 and 福 on doors, red lanterns, 共享单车 colours, 外卖 boxes. No real
  brand names or logos — invent friendly generic ones.
* Parts should touch or overlap slightly — nothing floating, no visible gaps at joints.

## Triangle budgets (keep well under them)

| kind | budget |
|---|---|
| tiny items < 5 cm (placed by the thousand) | ≤ 120 tris, ideal ≤ 60 |
| small items 5–30 cm | ≤ 400 |
| household items 30 cm–1 m | ≤ 800 |
| people and animals | ≤ 1500 |
| street furniture, stalls, vehicles | ≤ 1500 (bus, train ≤ 4000) |
| buildings | ≤ 5000 (high-rise ≤ 8000) |
| landmarks | ≤ 12000 |
| mountains, big nature | ≤ 3000 |

## Checking your work — required

Build a gallery of only your file and look at it. Repeat until every model looks right.

```bash
node build.mjs gallery --only=<yourfile>          # e.g. --only=small → dist/gallery-small.html
node tools/shot.mjs "dist/gallery-<yourfile>.html" .cache/<yourfile>.png --w=1600 --h=1000 --full
```

Then open the PNG with the Read tool. Useful query options (quote the argument):

* `"dist/gallery-small.html?filter=cat&cols=3"` — only ids/names containing "cat", bigger cells
* `?view=front` / `side` / `back` / `top` — check orientation (front must face +Z) and silhouettes
* `?atlas` — shows the packed decal atlas under the grid

`shot.mjs` prints console errors and exceptions after the path — fix all of them. Each cell label
shows real dimensions, triangle count, category, sound, and red warnings (base below ground,
off-centre, missing fields) — fix those too. A cell with a red background means `build()` threw.

Look for: floating or disconnected parts, parts facing the wrong way, wrong real-world size,
z-fighting decals, one-sided planes that vanish from behind (use `plane`), colours too dark or too
washed out, anything that would not be recognisable from far away.

## Report

When finished, reply with: the list of ids you implemented (id, Chinese name, real size), anything
you could not do, and any suggestion for the game integration (e.g. "stall_fruit should be placed
against a wall", "lantern_red is meant to hang at 2.5 m"). Keep the report compact.
