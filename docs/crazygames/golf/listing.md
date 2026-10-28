# CrazyGames listing: Backyard Mini Golf (小区高尔夫)

Upload: `dist/crazygames-golf/index.html` (from `node build.mjs golf-crazygames`), the whole game in
one ASCII-only file, the same way as Roll It All's (see ../listing.md: the upload box takes a
folder, QA needs a game started in the preview). It loads the CrazyGames SDK v3 and says when a
hole is being played (gameplay start) and when the card between holes is up (gameplay stop); it
plays only on crazygames.com and its subdomains (and opened from disk or localhost), and sends no
statistics.

Covers: `cover-1920x1080.png`, `cover-800x1200.png`, `cover-800x800.png` (cover.js makes them).
Preview videos (18 s, no sound, real time, opening on the cover's shot): `preview-1920x1080.mp4`,
`preview-1080x1620.mp4` (preview.js makes them).

## Title

Backyard Mini Golf (the title the game gives itself in English)

## Description

A mini golf course squeezed in between the apartment blocks, where the neighbors all have opinions
about your ball. A goose guards the hole and chases your ball to peck it away. Electric fans blow it
sideways, bikes and scooters zip across the road, a cat swipes at anything that rolls past its paw,
and folded quilts bounce it back harder than any wall.

- 9 holes: after two warm-ups, fans, bikes, a goose, cats and bouncy quilts get in the way, each
  with a tag over it saying what it does
- Hold anywhere, pull back and let go: a dotted line shows where the ball will run, up to its first
  bounce
- Three stars on every hole: sink it, make par, and pick up every sweet on the green
- Your best score on each hole and for the whole round is kept
- Every model, texture and tune is generated in code

## Controls

Desktop: hold the left mouse button anywhere, drag back and let go to putt. The further you pull,
the harder the shot.

Mobile: touch anywhere, pull back and let go.

## Category and tags

Category: Sports (Golf). Tags (max 5, from their list): Golf, 3D, Physics, Ball, Mouse.

## Settings to pick in the portal

- Orientation on mobile: both (portrait and landscape work)
- Progress saving: "Yes, using LocalStorage (Automatic Progress Save)"
- Not made for kids under 13 (CrazyGames is PEGI 12)
