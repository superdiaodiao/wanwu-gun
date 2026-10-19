# CrazyGames listing

Submitted for Basic Launch on 2026-10-13 (developer portal: Roll It All, HTML5).

Upload: `dist/crazygames/index.html` (from `node build.mjs crazygames`), dragged into the portal by
hand. The portal re-serializes the HTML, so the build keeps every non-ASCII character escaped (see
build.mjs).

From a script (2026-10-19 update, build 43b7d57f): the upload box is a `webkitdirectory` input, so a
file set on it plainly fails with 400 "Missing required fields" from check-presigned-url-upload.
Give it a folder path: wrap the file in a new `File`, define `webkitRelativePath` (and `path`) as
`crazygames/index.html`, put it in the input's `files` through a `DataTransfer` and fire `change`.
After Save → Go to QA, start a game in the preview so Gameplay Start is detected, then press
Continue there and keep the preview tab open until the QA checklist page has loaded (closing it
first loses the results). Answers used: Yes on every check, N/A on Terms & Conditions (the
CrazyGames build loads no analytics). A Basic Launch update was approved automatically.
Covers: `cover-1920x1080.png` (16:9), `cover-800x1200.png` (2:3), `cover-800x800.png` (1:1).
Preview videos (required, ≤20 s, no sound, real time): `node tools/record.mjs` at 1920×1080 and
1080×1620, 18 s each, starting on the cover's shot on the square with the autopilot rolling.

## Title

Roll It All (must match the title in the game)

## Description

The sky has a hole in it, and the goddess Nüwa needs a stone big enough to patch it. Push a tiny
Five-Color Stone through a bustling Chinese town and roll up everything smaller than you:
sunflower seeds and mahjong tiles first, then cats, bikes, square-dancing aunties, buses, whole
apartment blocks, and finally the mountains and clouds. The bigger you get, the bigger the things
you can roll up.

- Quick 3-minute rolls, a daily challenge that's the same for everyone, 5 levels with their own
  rules, a race against three rival stones, and a free-roll mode
- 238 things to collect, each with a cheeky line from Nüwa
- Wishes to grant, skins to unlock and ten stone shards hidden around town
- Every model, texture and tune is generated in code

## Controls

Desktop: W / ↑ roll forward · A D / ← → steer · S / ↓ turn around · Space dash · C camera ·
drag the mouse to look around · P pause

Mobile: the ball rolls by itself; drag one thumb to steer, pull down to turn back, hold still to
stop. Tap Dash to dash.

## Category and tags

Category: Arcade. Tags (max 5, from their list): Grow, Collect, Ball, Physics, Relaxing.

## Settings to pick in the portal

- Orientation on mobile: both (portrait and landscape work)
- Progress saving: "Yes, using LocalStorage (Automatic Progress Save)"
- Not made for kids under 13 (CrazyGames is PEGI 12)
