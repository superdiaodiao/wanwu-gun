// ladder.mjs: the per-yard difficulty ladder from gate result dirs (gate.mjs --out=dir: h<idx>.json).
// Recovered 11-06 from the session transcripts (the scratchpad's yards/verify2/gate/ladder.mjs, with its 02:58 fix), unchanged.
// Later dirs override earlier ones per hole. Extension files (e.g. N=192, casual + careful easy only, from
// bot.mjs) can be swapped in for those two configs:
//   node tools/golf/ladder.mjs <dir> [<dir2> ...] [--ext=<extdir>] [--holes]
// e.g. node tools/golf/ladder.mjs .cache/golf-work/base/gate/g48 .cache/golf-work/base/gate/g96 --holes
// Per yard: casual-easy within par min / avg (p2 max), the careful player's within par easy / normal / hard
// (the ladder: lower = harder), 3 stars on easy, SOP = mean strokes over par (casual/easy/normal/hard),
// FAIL holes (hole numbers, 1-based) and HIGH ACE holes. --holes adds a row per hole.
// 3 stars use the game rule (main.js finish()): sunk, at par or better, and a birdie or all coins on a
// hole that has coins. With allCoins[] in the json it is exact; without, it prints bounds [birdie, gate].
import fs from 'node:fs';
const args = process.argv.slice(2), dirs = args.filter(a => !a.startsWith('--'));
const opt = Object.fromEntries(args.filter(a => a.startsWith('--')).map(a => a.slice(2).split('=')));
const R = {};
for (const d of dirs) for (const f of fs.readdirSync(d)) { const m = f.match(/^h(\d+)\.json$/); if (m && fs.statSync(d + '/' + f).size > 10) { const r = JSON.parse(fs.readFileSync(d + '/' + f, 'utf8')); if (r.easy_casual) R[+m[1]] = r; } }
if (opt.ext) for (const f of fs.readdirSync(opt.ext)) {
  const m = f.match(/^h(\d+)\.json$/); if (!m || fs.statSync(opt.ext + '/' + f).size < 10) continue;
  const e = JSON.parse(fs.readFileSync(opt.ext + '/' + f, 'utf8')), r = R[+m[1]]; if (!r || !e.easy_casual) continue;
  r.ext = true; for (const k of ['easy_casual', 'easy']) if (e[k]) r[k] = e[k];
}
const avg = a => a.reduce((s, x) => s + x, 0) / a.length;
const pct = (a, f) => a.filter(f).length / a.length * 100;
const st = (r, k) => {
  const c = r[k], o = c.out, P = r.par, n = o.length;
  const within = pct(o, s => s <= P), p2 = pct(o, s => s >= P + 2), ace = pct(o, s => s === 1), under = pct(o, s => s < P);
  const over = avg(o) - P;
  let s3, s3lo, s3hi;
  if (c.allCoins) s3 = s3lo = s3hi = o.filter((s, i) => s <= P && (s < P || c.allCoins[i])).length / n * 100;
  else { s3lo = under; s3hi = c.stars3; s3 = null; }
  return { n, within, p2, ace, under, over, s3, s3lo, s3hi, gave: c.gaveUp, worst: c.worst };
};
const names = ['Duck Pond', 'Pool Party', 'Pumpkin Patch', 'Snow Day'];
const breather = h => h === 15 || (h >= 18 && h % 9 === 5);
const f1 = x => x == null ? '  -  ' : x.toFixed(1).padStart(5);
const out = [];
for (let y = 0; y < 4; y++) {
  const idx = Array.from({ length: 9 }, (_, k) => y * 9 + k).filter(i => R[i]);
  if (!idx.length) continue;
  const H = idx.map(i => ({ i, r: R[i], c: st(R[i], 'easy_casual'), e: st(R[i], 'easy'), n: st(R[i], 'normal'), h: st(R[i], 'hard') }));
  if ('holes' in opt) {
    console.log(`\n== ${names[y]} (${idx.length}/9 holes)`);
    console.log('idx hole name      par coins N(c/e/n/h)     | casual w   p2  ace gave worst | careful w e/n/h        | 3* easy car/cas | aces car | SOP c/e/n/h');
    for (const { i, r, c, e, n, h } of H) {
      const floor = i % 9 < 2 ? 95 : 85, tag = [c.within < floor ? 'FAIL-w' : c.within - floor < 3 ? 'near-w' : '', c.p2 > 8 ? 'FAIL-p2' : c.p2 >= 5 ? 'near-p2' : '', c.gave ? 'FAIL-gave' : ''].filter(Boolean).join(',');
      const hiAce = !breather(i) && Math.max(c.ace, e.ace) > 15 ? ' HIGH ACE' : breather(i) ? ' (breather)' : '';
      console.log(`${String(i).padStart(3)} ${String(i + 1).padStart(4)} ${(r.name + '　　　　').slice(0, 4)} ${String(r.par).padStart(4)} ${String(r.coins).padStart(4)}  ${[c, e, n, h].map(x => x.n).join('/').padEnd(15)} | ${f1(c.within)} ${f1(c.p2)} ${f1(c.ace)} ${String(c.gave).padStart(3)} ${String(c.worst).padStart(4)} | ${f1(e.within)} ${f1(n.within)} ${f1(h.within)} | ${e.s3 != null ? f1(e.s3) + ' ' + f1(c.s3) : `[${e.s3lo.toFixed(0)}-${e.s3hi.toFixed(0)}] [${c.s3lo.toFixed(0)}-${c.s3hi.toFixed(0)}]`} | ${f1(e.ace)} | ${[c, e, n, h].map(x => (x.over >= 0 ? '+' : '') + x.over.toFixed(2)).join(' ')} ${tag}${hiAce}${r.ext ? ' ext' : ''}`);
    }
  }
  const cw = H.map(x => x.c.within);
  const row = { y, holes: idx.length, par: H.reduce((s, x) => s + x.r.par, 0), casMin: Math.min(...cw), casAvg: avg(cw), casP2max: Math.max(...H.map(x => x.c.p2)), e: avg(H.map(x => x.e.within)), n: avg(H.map(x => x.n.within)), h: avg(H.map(x => x.h.within)),
    s3e: H.every(x => x.e.s3 != null) ? avg(H.map(x => x.e.s3)) : null, s3c: H.every(x => x.c.s3 != null) ? avg(H.map(x => x.c.s3)) : null,
    sop: ['c', 'e', 'n', 'h'].map(k => avg(H.map(x => x[k].over))), hiAce: H.filter(x => !breather(x.i) && Math.max(x.c.ace, x.e.ace) > 15).map(x => `${x.i + 1} ${x.r.name} ${x.c.ace.toFixed(0)}/${x.e.ace.toFixed(0)}`),
    fails: H.filter(x => x.c.within < (x.i % 9 < 2 ? 95 : 85) || x.c.p2 > 8 || x.c.gave).map(x => x.i + 1) };
  out.push(row);
}
console.log('\n== ladder per yard (careful bot unless casual; 3* = game rule) ==');
console.log('yard          par | casual-easy min / avg (p2 max) | careful within e / n / h  | 3* easy careful / casual | SOP c/e/n/h                 | FAIL holes | HIGH ACE (hole casual/careful %)');
for (const r of out) console.log(`${names[r.y].padEnd(13)} ${String(r.par).padStart(3)} | ${r.casMin.toFixed(1)} / ${r.casAvg.toFixed(1)} (${r.casP2max.toFixed(1)})${' '.repeat(10)} | ${r.e.toFixed(1)} / ${r.n.toFixed(1)} / ${r.h.toFixed(1)}  | ${r.s3e == null ? '  -  ' : r.s3e.toFixed(1)} / ${r.s3c == null ? '  -  ' : r.s3c.toFixed(1)}${' '.repeat(12)} | ${r.sop.map(v => (v >= 0 ? '+' : '') + v.toFixed(2)).join(' ')} | ${r.fails.join(',') || '-'} | ${r.hiAce.join('; ') || '-'}`);
const rise = k => out.map(r => r[k].toFixed(1)).join(' -> ');
console.log(`\ncareful normal within by yard: ${rise('n')}   hard: ${rise('h')}   (lower = harder)`);
console.log(`SOP normal by yard: ${out.map(r => r.sop[2].toFixed(2)).join(' -> ')}   hard: ${out.map(r => r.sop[3].toFixed(2)).join(' -> ')}   (higher = harder)`);
