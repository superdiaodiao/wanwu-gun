// cointable.mjs <coinbotDir> <cupOnlyTraceDir>: coin-first (coinbot, N=48) against the cup-only casual player on easy
// (TRACE gate dir, same N: strokes from it, coin pickups recomputed from its tracks with the hole's coins as in holes.js, radius 0.4)
import fs from 'node:fs';
const [B, A] = process.argv.slice(2);
const { HOLES } = await import(new URL('../../src/golf/holes.js', import.meta.url));
const segD = (px, pz, s, e) => { const dx = e[0] - s[0], dz = e[1] - s[1], L = dx * dx + dz * dz; let t = L ? ((px - s[0]) * dx + (pz - s[1]) * dz) / L : 0; t = Math.max(0, Math.min(1, t)); return Math.hypot(px - s[0] - t * dx, pz - s[1] - t * dz); };
console.log('hole name     par coins | cup-only: within 3star allCoins | coin-first: within 3star allCoins mean  p2 worst gaveUp | gap');
let bad = 0;
for (let i = 0; i < 36; i++) {
  if (!fs.existsSync(`${B}/h${i}.json`) || fs.statSync(`${B}/h${i}.json`).size < 10) continue;
  const a = JSON.parse(fs.readFileSync(`${A}/h${i}.json`, 'utf8')), b = JSON.parse(fs.readFileSync(`${B}/h${i}.json`, 'utf8')), h = HOLES[i], P = h.par;
  const W = Math.max(...h.map.map(s => s.length)), Hh = h.map.length;
  const cs = []; h.map.forEach((row, q) => [...row].forEach((ch, c) => { if (ch === 'o') cs.push([c, q]); }));
  cs.push(...(h.coins === 'tops' ? h.ground.filter(g => g.t === 'hill' && g.h > 0).map(g => g.at) : h.coins || []));
  const pts = cs.map(([c, q]) => [c - (W - 1) / 2, q - (Hh - 1) / 2]);
  const pl = a.cfg.easy_casual, n = pl.length;
  const ac = pl.map(p => pts.every(([px, pz]) => p.shots.some(s => s.track.some((_, k) => k && segD(px, pz, s.track[k - 1], s.track[k]) < 0.4))));
  const pc = v => (v / n * 100).toFixed(0).padStart(3);
  const cw = pl.filter(p => p.strokes <= P).length, c3 = pl.filter((p, j) => p.strokes <= P && (p.strokes < P || ac[j])).length;
  const o = b.easy_casual.out, bc = b.easy_casual.allCoins, m = o.length;
  const f3 = o.filter((s, j) => s <= P && (s < P || bc[j])).length / m * 100, fw = o.filter(s => s <= P).length / m * 100;
  const gap = c3 / n * 100 - f3; if (gap > 15 || b.easy_casual.gaveUp) bad++;
  console.log(String(i + 1).padStart(2), h.name.padEnd(5, '　'), P, JSON.stringify(cs).padEnd(18), '|', pc(cw), pc(c3), pc(ac.filter(Boolean).length), '|', fw.toFixed(0).padStart(3), f3.toFixed(0).padStart(3), (bc.filter(Boolean).length / m * 100).toFixed(0).padStart(3), b.easy_casual.mean.toFixed(2), String(b.easy_casual.p2).padStart(5), b.easy_casual.worst, b.easy_casual.gaveUp, '|', gap.toFixed(0).padStart(3), gap > 15 ? 'OVER 15' : '', b.easy_casual.gaveUp ? 'GAVE UP' : '');
}
console.log(bad ? `${bad} hole(s) over 15 points or with give-ups` : 'all within 15 points, no give-ups');
