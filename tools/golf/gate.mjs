// gate.mjs: the difficulty gate for new or reshaped holes of Backyard Mini Golf (recovered 11-06 from the
// session transcripts; it prints exactly what the scratchpad's yards/tools/gate.mjs printed).
//
// WHAT IT DOES. For each hole it runs bot.mjs (bots that aim like people, in a headless page of the built
// golf.html) with four configs, N plays each, in this order in one page:
//   easy_casual  casual player on easy   (guide 7 m, capture 3 m/s, seed 101)
//   easy         careful player on easy  (guide 7, capture 3)
//   normal       careful player on normal (guide 1.5, capture 2.2)
//   hard         careful player on hard  (guide 0, capture 1.6)
// and checks the limits from the plan (casual player on easy):
//   >= 85% of plays within par (>= 95% on a yard's holes 1-2, index % 9 < 2), <= 8% at par+2 or worse,
//   no give-ups (a play that never sinks). Any miss = FAIL.
// It also reports, not as a fail: the careful player's ladder easy/normal/hard (within par, mean
// strokes), 3 stars on easy, the perfect player's ace share of the (direction, speed) grid from the tee,
// and the share of plays that are holes in one on easy (casual / careful), flagged 'HIGH ACE' above 15%
// on a hole that isn't a breather (a yard's hole 6, index % 9 == 5 from index 18 on, and Pool Party's
// Bowl, index 15; --breathers=23,32 to name others).
//
// USAGE (cwd = the repo, so Chrome's profile lands in .cache/ and is cleaned up):
//   node tools/golf/build.mjs .cache/golf-work/x/golf.html           # build the tree to test
//   node tools/golf/gate.mjs <golf.html> <hole indexes, 0-based: 18,19 or 18-26 or 0-8,27>
//        [N=48] [--out=dir] [--jobs=4] [--breathers=..] [--timeout=min]
//   node tools/golf/gate.mjs --from=<dir> [hole indexes]   # print again from a run's --out dir (all its holes)
// Indexes: 0-8 Duck Pond, 9-17 Pool Party, 18-26 Pumpkin Patch, 27-35 Snow Day. One Chrome per job
// (keep --jobs <= 2 when others share the machine). About 1.5-2 min per hole at N=48 and 3-5 min at
// N=96 (two jobs at once on this Mac). N=48 is a quick look; gate at N=96 before you ship a hole. The
// baselines of fc46371 (0-17 at N=48 and N=96, 18-35 at N=96) are in .cache/golf-work/base/gate/.
// Compare like with like: the same N (a config's plays depend on how many plays ran before it in the
// page). The results are deterministic: the same build and N give the same text, byte for byte.
// --out=dir keeps each hole's full bot result as dir/h<idx>.json (every play's strokes, coins, shot
// reasons); ladder.mjs <dir>... summarises such dirs per yard. A hole that ERRORs (Chrome failed, the
// page died, killed after --timeout, default 30 min per hole at N <= 96, scaled with N) is retried twice
// and is not a fail: re-run it.
// Env passes through to bot.mjs: GEO=0 (straight-line scoring, the old diff.euclid), TIE=human,
// PATCH=<file> (applied to every hole you list: use it with one hole), EASYPHYS=<obj>.
// Hole 1 (idx 0) fails under the default tie rule, as at fc46371 (the bot takes the softest of equally safe
// speeds); judge it with TIE=human (97.9% at N=192).
//
// READING THE OUTPUT, per hole:
//   #26 (hole 27) 大南瓜 par 4 12x15  PASS                 <- index, hole number, name, par, size; PASS or FAIL: why
//      within par  casual-easy 93.8% (p2 1%, mean 2.78)  easy 97.9%  normal 83.3%  hard 79.2%   mean strokes easy/normal/hard 2.6/3.3/3.61
//                  ^ the gated number   ^ % at par+2 or worse   ^ the careful player's ladder (lower = harder)
//      3 stars easy 87.5%  tee ace grid 0%  worst casual 6  hist casual {"0":15,"1":5,"2":1,"-1":26,"-2":49}
//                  ^ careful, game rule   ^ perfect player's ace share from the tee   ^ strokes - par: plays
//      aces on easy casual 0% careful 0%                    <- holes in one; 'HIGH ACE' / '(breather)'
// Last line: ALL PASS | n hole(s) FAIL | no FAIL; n hole(s) ERROR, re-run them; then the HIGH ACE count.
// Exit code 0 even on FAIL (read the text).
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const D = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(D, '../..');
const pos = process.argv.slice(2).filter(a => !a.startsWith('--'));
const opt = Object.fromEntries(process.argv.slice(2).filter(a => a.startsWith('--')).map(a => a.slice(2).split('=')));
const FROM = opt.from ? path.resolve(opt.from) : null;
if (FROM) pos.unshift(null);
if (FROM ? !fs.existsSync(FROM) : pos.length < 2) { console.error('usage: node tools/golf/gate.mjs <golf.html> <idx|a-b,..> [N=48] [--out=dir] [--jobs=4] [--breathers=..] [--timeout=min]\n       node tools/golf/gate.mjs --from=<dir> [idx|a-b,..]'); process.exit(2); }
const html = FROM ? null : path.resolve(pos[0]);
if (html && !fs.existsSync(html)) { console.error(`no such page: ${html}`); process.exit(2); }
const list = s => s.split(',').flatMap(t => { const [a, b] = t.split('-').map(Number); return b == null ? [a] : Array.from({ length: b - a + 1 }, (_, i) => a + i); });
const holes = pos[1] ? list(pos[1]) : FROM ? fs.readdirSync(FROM).map(f => (f.match(/^h(\d+)\.json$/) || [])[1]).filter(Boolean).map(Number).sort((a, b) => a - b) : [];
const N = +(pos[2] || 48), J = +(opt.jobs || 4);
const MIN = +(opt.timeout || 30 * Math.max(1, N / 96));
const outDir = opt.out ? path.resolve(opt.out) : null;
if (outDir) fs.mkdirSync(outDir, { recursive: true });
const CFG = [
  { key: 'easy_casual', level: 'easy', guide: 7, capture: 3, person: 'casual', seed: 101 },
  { key: 'easy', level: 'easy', guide: 7, capture: 3 },
  { key: 'normal', level: 'normal', guide: 1.5, capture: 2.2 },
  { key: 'hard', level: 'hard', guide: 0, capture: 1.6 },
];
const run = h => new Promise(done => {
  const p = spawn(process.execPath, [D + '/bot.mjs', String(h), String(N), JSON.stringify(CFG)], { cwd: REPO, env: { ...process.env, HTML: html } });
  let out = '', err = '';
  const kill = setTimeout(() => { try { p.kill('SIGTERM'); } catch {} }, MIN * 60000);
  p.stdout.on('data', d => out += d); p.stderr.on('data', d => err += d);
  p.on('exit', (code, sig) => { clearTimeout(kill); done(code === 0 && out.trim().startsWith('{') ? JSON.parse(out.trim()) : { hole: h + 1, error: (err || out).slice(-800) || `exit ${code} ${sig || ''} (killed after ${MIN} min?)` }); });
});
// (a run that dies before it starts, e.g. 'chrome did not start' when the machine is loaded, is run again, twice)
const runR = async h => { let r; for (let k = 0; k < 3; k++) { r = await run(h); if (!('error' in r) || !/chrome did not start|killed|timed out|exit null|no output/i.test(r.error)) break; } return r; };
const BR = opt.breathers ? new Set(opt.breathers.split(',').map(Number)) : null;
const breather = h => (BR ? BR.has(h) : h === 15 || (h >= 18 && h % 9 === 5)), ACE_MAX = 15;
const res = [];
let i = 0;
if (FROM) for (const h of holes) { let r; try { r = JSON.parse(fs.readFileSync(`${FROM}/h${h}.json`, 'utf8')); } catch (e) { r = { hole: h + 1, error: `no result in ${FROM}: ${e.message}` }; } r.idx = h; res.push(r); }
else await Promise.all(Array.from({ length: Math.min(J, holes.length) }, async () => { while (i < holes.length) { const h = holes[i++]; const r = await runR(h); r.idx = h; res.push(r); if (outDir) fs.writeFileSync(`${outDir}/h${h}.json`, JSON.stringify(r)); } }));
res.sort((a, b) => a.idx - b.idx);
let fails = 0, aceHigh = 0, errs = 0;
for (const r of res) {
  if ('error' in r || !r.easy_casual) { errs++; console.log(`#${r.idx} ERROR (not a fail: re-run it) ${r.error || '(no output: killed or timed out?)'}`); continue; }
  const c = r.easy_casual, first = r.idx % 9 < 2, need = first ? 95 : 85;
  const bad = [];
  if (c.within < need) bad.push(`casual-easy within ${c.within}% < ${need}%`);
  if (c.p2 > 8) bad.push(`casual-easy par+2 ${c.p2}% > 8%`);
  if (c.gaveUp > 0) bad.push(`casual-easy gave up ${c.gaveUp}x`);
  const ace = r.tee?.[3]?.aceGrid;
  if (bad.length) fails++;
  console.log(`#${r.idx} (hole ${r.hole}) ${r.name} par ${r.par} ${r.W}x${r.H}  ${bad.length ? 'FAIL: ' + bad.join('; ') : 'PASS'}`);
  console.log(`   within par  casual-easy ${c.within}% (p2 ${c.p2}%, mean ${c.mean})  easy ${r.easy.within}%  normal ${r.normal.within}%  hard ${r.hard.within}%   mean strokes easy/normal/hard ${r.easy.mean}/${r.normal.mean}/${r.hard.mean}`);
  console.log(`   3 stars easy ${r.easy.stars3}%  tee ace grid ${ace}%${ace > 0.5 ? ' (high: only ok on a breather)' : ''}  worst casual ${c.worst}  hist casual ${JSON.stringify(c.hist)}`);
  const hi = !breather(r.idx) && Math.max(c.ace, r.easy.ace) > ACE_MAX;
  if (hi) aceHigh++;
  console.log(`   aces on easy casual ${c.ace}% careful ${r.easy.ace}%${breather(r.idx) ? ' (breather)' : hi ? `  HIGH ACE: > ${ACE_MAX}% on a hole that isn't a breather` : ''}`);
}
console.log((fails ? `${fails} hole(s) FAIL` : errs ? 'no FAIL' : 'ALL PASS') + (errs ? `; ${errs} hole(s) ERROR, re-run them` : '') + (aceHigh ? `; ${aceHigh} hole(s) HIGH ACE on easy (> ${ACE_MAX}%, not a breather)` : ''));
