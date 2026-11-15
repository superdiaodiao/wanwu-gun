export const meta = {
  name: 'golf-s10-terrain',
  description: 'Make the golf holes feel 3D: render package so height reads at a glance, plus two terrain packages reshaping holes with real elevation; build, review, fix, integrate, recheck',
  phases: [
    { title: 'Build' },
    { title: 'Review' },
    { title: 'Fix' },
    { title: 'Integrate' },
    { title: 'Recheck' },
  ],
}
const W = '/Users/bytedance/AI/wanwu-gun/.cache/golf-work'
const COMMON = `PROJECT: 小区高尔夫 / Backyard Mini Golf (three.js). Live at https://superdiaodiao.github.io/wanwu-gun/golf/ = dev/golf 063fd94; dev/golf is now b0d1042 (adds season prefixes to yard names, not live). Main repo /Users/bytedance/AI/wanwu-gun: never touch its checkout or branch; never push; never deploy.
OWNER FEEDBACK (verbatim): 「感觉我们都是平地，是否可以改成有坡度或者地形变换有明显一些的？让这游戏有质感，不然目前还是感觉有点低级」. Facts: 22 of 36 holes already have ground (src/golf/ground.js: ramp/hill/ridge, heights mostly 0.15-0.5 m) but from the fixed camera they read flat. Hole 28 (index 27, 溜冰场) was just made two-level (ramp 0.45 m up to a terrace with an earth wall face) and reads better. A downhill rework of hole 20 (index 19) was rejected because it still read flat and lost its pumpkin beds. Past survey of height support: ${W}/s9/height/survey.md (read it first). The owner is afraid of difficulty.
HARD RULES:
- src/audio, src/core, src/i18n byte-identical (Roll It All shares them); src/game/engine.js changes only as opt-in options.
- Easy must never get harder: any play-altering change needs tools/golf/gate.mjs N=96 (TRACE=1) and casual-on-Easy within-par must not drop on any changed hole, also on shifted seeds 1-4. Normal/Hard may shift a little but keep each yard's ladder (hole 1 of each yard easiest; owner fears difficulty). Holes keep their index (no reorder/insert/remove); each hole fits 12x15 cells; no windmill between the tee view and the cup. Aces <= 15% except warm-ups. Every hole keeps >= 1 reachable coin; coin-first bot (coinbot.mjs) three-star within 15 points of hole-only bot. Stuck scan (rollcheck.mjs): 0 off-green, 0 inside colliders.
- Simple UI; players are lazy and remember nothing; no new buttons. English only in src/golf/en.js or a yard file's en; CrazyGames build ASCII-only. Nothing China-specific, nothing Christmas. Never use models scarecrow, farmhouse, greenhouse, trash_bins, mailbox, rock_big, tree_pine, stone_lion, lantern_red, kite, haystack.
- Never run "npm run build", "node build.mjs game" or anything "crazygames" via build.mjs in the main repo; in your worktree "node tools/golf/build.mjs out.html [--cg]" is fine.
- Commits: in your worktree only, author = repo's configured identity (superdiaodiao), Chinese plain-words messages with numbers, ending "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>". Never commit .claude/.
- Headless Chrome: at most 2 of yours at once; close all at the end; check with pgrep -fl '\\.cache/chrome-'. Frame time must stay 60 fps (tools/golf/perf.mjs) on changed holes.
- Keep progress.md in your own folder under ${W}/s10/.
TOOLS: tools/golf/ (cdp.mjs, gate.mjs, bot.mjs, ladder.mjs, shots.mjs, perf.mjs, rollcheck.mjs, reach.mjs, coinbot.mjs, build.mjs). Gate usage: TRACE=1 node tools/golf/gate.mjs <html> <idx> 96 --out=dir --jobs=2 (idx 0-based). Screenshots: node tools/golf/shots.mjs capture <html> <out> --holes=.. --sizes=390x844,844x390,1280x800 --langs=zh --page. Camera clip tool: .cache/golf-work/s9/int/tools/camclip2l.mjs (see its header).`
const RESULT = { type: 'object', properties: { summary: { type: 'string' }, commits: { type: 'string' }, notDone: { type: 'string' } }, required: ['summary', 'commits', 'notDone'] }
const VERDICT = { type: 'object', properties: { summary: { type: 'string' }, verdict: { type: 'string', enum: ['pass', 'fix-needed'] }, findings: { type: 'array', items: { type: 'object', properties: { severity: { type: 'string', enum: ['blocking', 'should-fix', 'note'] }, problem: { type: 'string' }, evidence: { type: 'string' }, fix: { type: 'string' } }, required: ['severity', 'problem', 'evidence', 'fix'] } } }, required: ['summary', 'verdict', 'findings'] }

const TERRAIN = yards => `Design and build REAL elevation into holes of ${yards}, so that from the normal camera a first-time player sees at once that the ground goes up and down: raised tee decks dropping to the green, terraces of two or three levels joined by ramps with visible earth/stone/brick wall faces, banked curves, a bowl round the cup, a long valley or a hump to roll over. Height differences that read: typically 0.6-1.2 m between levels (vs today's 0.2-0.5), where the physics and camera can take it.
Steps:
1. Read ${W}/s9/height/survey.md, src/golf/ground.js, course.js (how the green, rails, block sides, wall faces and lips follow ground), physics.js (slopes, how steep a ramp a ball can climb on a normal putt), and how hole 28 (index 27) was done (git log -p for "溜冰场"). Write ${W}/s10/<your key>/plan.md: per hole of your yards, today's ground and your proposal (or "keep" and why), with the yard's difficulty ladder in mind.
2. Aim for at least 5 of every 9 holes in each of your yards to show clear height (new or enlarged), each hole different in kind (not the same ramp everywhere), fitting the yard's theme (dressing the wall faces in the look's materials). The first yard's (pond) first holes are for brand-new players: use height that HELPS there (a tee deck rolling down toward the cup, a gentle bowl round the cup), never a wall to climb. Keep each hole's name/tip idea unless the new shape needs a new tip (then short zh + en).
3. Generic engine additions (new ground shapes such as a flat terrace/plateau or a cliff face, wall-face dressing, camera tilt per hole) go in clearly separated, documented functions; another package is changing the rendering of slopes in parallel (shading, wall faces, camera) and a third may also add ground shapes, so keep your engine diff small and additive.
4. Per changed hole: gate N=96 TRACE vs dev/golf b0d1042 on Easy/Normal/Hard, shifted seeds 1-4 on Easy, rollcheck, coinbot, aces, perf, camera clip (ball and cup in frame; a raised part never hides the cup at 390x844 and 844x390), screenshots before/after at 390x844, 844x390, 1280x800 zh into ${W}/s10/<your key>/shots/. Unchanged holes must stay byte-identical in the gate. If a hole cannot pass, revert it and say why.
5. One commit per hole (or per small engine addition). Report a table: hole, before, after, Easy casual within-par before->after, Normal/Hard, aces.`

const PKGS = [
  { key: 'look', branch: 's10/look', build: `PACKAGE "look": make height READ at a glance, without changing play.
Worktree: git worktree add -b s10/look ${W}/s10/look/repo dev/golf.
Pure rendering/camera work in src/golf/course.js, looks/*.js, main.js camera framing: bots and physics untouched, so gate TRACE must stay byte-identical on all 36 holes (prove it on all 36, Easy, N=96 at least for a sample of 12 incl. every sloped hole, and TRACE equality).
Diagnose first with screenshots of every sloped hole at 390x844, 844x390, 1280x800 (list in holes.js/yards: grep "ground:"): why do 0.3-0.5 m slopes read flat? Then fix what makes the biggest difference, e.g.:
- shading by slope that is strong enough to see (lit faces vs shadowed faces, a soft ambient-occlusion darkening at the foot of a rise and where a slope meets a rail), terrain-aware mowing stripes that bend over hills;
- where the ground steps up (a ramp along a row/column, a terrace edge): a visible retaining wall face (earth/stone/timber/brick per look) on the side drops, the block's sides showing the step, a lit lip on the top edge and a cast shadow below it;
- shadows: make sure raised parts and rails cast shadows on lower ground (shadow map covers the hole);
- the downhill chevrons clearer but subtle; hills with a visible highlight/contour;
- camera: on holes whose ground matters, a slightly lower, more side-on tilt if that shows height better while keeping aiming as easy (ball, cup, aim line, HUD clearance as today; the per-hole camera work in main.js camHome/camPut). Check portrait and landscape.
Must keep 60 fps (perf.mjs) on low-end settings; no new textures over ~512px unless shared. Evidence: before/after contact sheets of every sloped hole at 390x844 and 844x390 zh into ${W}/s10/look/. Small separate commits.` },
  { key: 'tA', branch: 's10/tA', build: `PACKAGE "tA": terrain for yards 1-2 (春·鸭子池塘 holes 1-9 = idx 0-8, 夏·泳池派对 holes 10-18 = idx 9-17).
Worktree: git worktree add -b s10/tA ${W}/s10/tA/repo dev/golf.
` + TERRAIN('yard 1 (duck pond, idx 0-8, today almost all flat: its header says "everything flat" — that is what the owner now dislikes; keep it the gentlest yard) and yard 2 (pool party, idx 9-17)') },
  { key: 'tB', branch: 's10/tB', build: `PACKAGE "tB": terrain for yards 3-4 (秋·南瓜地 holes 19-27 = idx 18-26, 冬·雪地 holes 28-36 = idx 27-35).
Worktree: git worktree add -b s10/tB ${W}/s10/tB/repo dev/golf.
Hole 28 (idx 27) is already two-level: enlarge only if it clearly helps. Hole 20 (idx 19): its pumpkin beds must stay; a plain downhill was rejected for reading flat.
` + TERRAIN('yard 3 (pumpkin patch, idx 18-26) and yard 4 (snow day, idx 27-35)') },
]

const res = await pipeline(PKGS,
  p => agent(`${COMMON}\n\n${p.build}\nReturn a plain report with numbers and paths.`, { label: 'build:' + p.key, phase: 'Build', schema: RESULT }),
  (b, p) => agent(`${COMMON}\n\nIndependent reviewer for package ${p.key} on branch ${p.branch} (worktree ${W}/s10/${p.key}/repo). Do NOT edit source. Builder's report:\n${b ? b.summary + '\nNOT DONE: ' + b.notDone : '(missing)'}\n\nThe brief was:\n${p.build}\n\nRebuild HEAD yourself; re-run the key checks (gate TRACE invariance where promised, N=96 gate + seeds 1-4 on Easy for changed holes, rollcheck, coinbot, console 0, CG ASCII, src/audio|core|i18n no diff, perf), and LOOK at screenshots at 320x568, 390x844, 844x390, 1280x800 by eye. Judge as a lazy first-time player on a phone and as the owner who wants the game to feel less cheap: does the ground now visibly go up and down? Does it look good and solid (no z-fighting, floating rails, seams, gaps under walls, stretched textures, ball clipping into slopes)? Is anything harder on Easy, or confusing? Be skeptical.`, { label: 'review:' + p.key, phase: 'Review', schema: VERDICT }).then(v => ({ b, v })),
  (bv, p) => agent(`${COMMON}\n\nFix package ${p.key} on ${p.branch} (worktree ${W}/s10/${p.key}/repo). Builder: ${bv.b ? bv.b.summary : '-'}\n\nReviewer: ${bv.v ? bv.v.summary + '\n' + JSON.stringify(bv.v.findings, null, 1) : '-'}\n\nConfirm each blocking/should-fix finding, fix real ones (own commits), re-run the checks that cover them. Notes: fix if cheap. Report per finding.`, { label: 'fix:' + p.key, phase: 'Fix', schema: RESULT }).then(f => ({ ...bv, f }))
)

phase('Integrate')
const rep = res.map((r, i) => r ? `## ${PKGS[i].key}\nBUILD: ${r.b ? r.b.summary : '-'}\nREVIEW: ${r.v ? r.v.summary : '-'}\nFIX: ${r.f ? r.f.summary + '\nNOT DONE: ' + r.f.notDone : '-'}` : `## ${PKGS[i].key}: missing`).join('\n\n')
const integ = await agent(`${COMMON}\n\nReports:\n${rep}\n\nIntegrate: git worktree add -b s10/int ${W}/s10/int/repo dev/golf; cherry-pick s10/look, then s10/tA, then s10/tB commits linearly (only what passed; skip anything a fixer says should not ship). Resolve conflicts keeping all intents (engine additions from tA and tB may overlap: unify them into one clean version). Then verify the combined build: gate N=96 TRACE all 36 holes vs dev/golf b0d1042 (only reshaped holes may differ; Easy casual within-par never lower on any hole, seeds 1-4 on changed holes), the look package's rendering on the NEW terrain looks right (wall faces, shadows, camera), perf 60 fps on all holes, console 0, CG ASCII, src/audio|core|i18n no diff, rollcheck all changed holes. Build ${W}/s10/final-golf.html and final-cg.html (sha256). Make the owner set ${W}/s10/owner/: per yard one before/after contact sheet (before = dev/golf b0d1042, after = s10/int) at 390x844 zh with all 9 holes, a second set at 844x390, and a short mp4 (ffmpeg if available) of 3-4 of the most changed holes being played by a bot at 390x844; plus owner/README.md in plain Chinese: which holes changed and how, difficulty numbers before->after.`, { label: 'integrate', phase: 'Integrate', schema: RESULT })

phase('Recheck')
const recheck = await agent(`${COMMON}\n\nReports:\n${rep}\n\nINTEGRATOR: ${integ ? integ.summary + '\nNOT DONE: ' + integ.notDone : '-'}\n\nIndependent final recheck of s10/int HEAD (${W}/s10/int/repo). Do NOT edit source. Re-measure: gate invariance on unchanged holes, N=96 + seeds 1-4 on Easy for changed holes, Normal/Hard ladder per yard, stuck scan, coinbot, aces, perf, camera (ball and cup in frame, raised ground never hiding the cup), console 0, CG ASCII, shared code untouched; look at the owner contact sheets and at 320x568 shots by eye for visual defects. Say plainly if it is ready to show the owner and release, and list anything the owner should decide.`, { label: 'recheck', phase: 'Recheck', schema: VERDICT })
return { res, integ, recheck }