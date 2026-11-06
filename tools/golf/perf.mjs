// perf.mjs: what moving on to the next hole costs in frames, in 小区高尔夫 (Backyard Mini Golf), on a slow
// phone stand-in: a headless page at a phone size with its CPU slowed down (scope step 3, D2 and section 4.7).
//
//   node tools/golf/perf.mjs <golf.html> [--size=844x390] [--cpu=6] [--runs=3] [--paths=next,yard]
//        [--wait=2500] [--record=5000] [--lang=en] [--touch=auto|on|off] [--seed=1] [--out=<file.txt>] [--json=<file>]
//        [--mockdip]
//
// Each run of each path is a fresh Chrome (tools/golf/cdp.mjs; one at a time), so nothing is cached from the
// one before (shader programs, textures): a first-time player's page. Math.random is seeded (--seed, a
// mulberry32 stream set before the page's own scripts), the web fonts are 'none' (system fonts at once), the
// storage starts as below, then:
//   next  hole 1 -> 2. Empty storage; the page boots at hole 1. Played to the card, the card left up --wait
//         ms (2.5 s: its stars, fanfare and confetti come and go), then a real tap (a mouse click on a computer
//         size) on the card's main button #card-btn (main.js: cardNext() -> next() -> load(1)).
//   yard  hole 9 -> the yard page -> hole 10. Storage of a player who has played holes 1-8 (golf.best 2 stars
//         each, golf.rounds 3 strokes each, golf.hole 8, lvIntro and shot set); the page boots at hole 9.
//         Played to the card, --wait ms, a tap on #card-btn ('看成绩': showYard()), --wait ms on the yard page,
//         then the tap measured, on the same #card-btn ('去泳池派对': cardNext() -> load(9, true)).
// Playing a hole: the game's own simulate() searched from the ball (144 directions x 40 powers) for the
// drop with the most dropping neighbours (else the finish nearest the cup), then __golf.shoot(ang, p), and
// again from where it stops until the card is up (at most 8 strokes). The search runs at full CPU speed
// (Emulation.setCPUThrottlingRate 1 for it, --cpu again before the shot), everything else at --cpu.
//
// Measured, from the moment the tap lets go (its pointerup's timeStamp, in the page): every
// requestAnimationFrame callback for --record ms (5 s; it starts 300 ms before the tap), with G.hole,
// G.state and, if the page has an element #dip, its computed opacity. A frame is the gap from one rAF
// timestamp to the next. Reported per run:
//   longest  the longest frame from the tap to +3 s, where it starts (+ms from the tap), and #dip's opacity
//            at its start and its end ('-' with no #dip)
//   hole@    the first frame whose rAF sees the new G.hole; drawn: the end of that frame (the new hole is on
//            the screen at all)
//   dip1     the first frame with #dip's opacity >= 0.99; clear: the first frame after that with opacity
//            < 0.05 (no #dip: clear = drawn)
//   aim>50   frames over 50 ms starting in the first 3 s of aiming (from clear to clear + 3 s; the record
//            is long enough at 5 s for a clear up to 2 s), and the frame times there (median/p95/max)
//   play     the frames while the ball rolled or dropped on the hole played to the card: median/p95/max
//   click    when the page's click handler ran (+ms from the tap's release)
// and every frame over 50 ms in the transition window (the tap to clear + 0.5 s) as ms@+start[opacity].
// Then per path the range and mean over the runs.
//
// --mockdip: a self-test of the #dip columns on a page that has no #dip (fc46371): the scope's D2 fade imitated
// from outside the page's code (see MOCKDIP below). Not a measurement of D2 itself.
// --json: every run's numbers and frame list, for comparing. Run with no other Chrome working hard (the
// scope's section 4.7) and from the repo root: cd <repo> && node tools/golf/perf.mjs <golf.html>.
// Base numbers (fc46371): .cache/golf-work/p5/perf-base.txt; how to run: .cache/golf-work/p5/README.md.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { open, fileUrl, sleep } from './cdp.mjs';

const args = process.argv.slice(2);
const opt = Object.fromEntries(args.filter(a => a.startsWith('--')).map(a => { const [k, v] = a.slice(2).split('='); return [k, v ?? true]; }));
const html = args.find(a => !a.startsWith('--'));
if (!html || !fs.existsSync(html)) { console.error('usage: node tools/golf/perf.mjs <golf.html> [--size=844x390] [--cpu=6] [--runs=3] [--paths=next,yard] [--wait=2500] [--record=5000] [--lang=en] [--touch=auto|on|off] [--seed=1] [--out=f.txt] [--json=f.json]'); process.exit(2); }
const [W, H] = String(opt.size || '844x390').split('x').map(Number);
const CPU = +(opt.cpu ?? 6), RUNS = +(opt.runs ?? 3), WAIT = +(opt.wait ?? 2500), RECORD = +(opt.record ?? 5000), SEED = +(opt.seed ?? 1);
const LANG = opt.lang || 'en';
const PATHS = String(opt.paths || 'next,yard').split(',').filter(Boolean);
const TOUCH = opt.touch === 'on' ? true : opt.touch === 'off' ? false : Math.min(W, H) < 600;

// before the page's own scripts: Math.random seeded, the storage the path starts from
const INIT = (storage) => `(() => {
  let s = ${SEED} | 0;
  Math.random = function random() { s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  try { localStorage.clear(); for (const [k, v] of Object.entries(${JSON.stringify(storage)})) localStorage.setItem('golf.' + k, JSON.stringify(v)); } catch (e) {}
})();`;
// --mockdip (a self-test of the #dip measurements on a page without D2): the scope's D2 fade imitated from
// outside, on #card-btn's next-hole and next-yard taps (not the one that opens the yard page): #dip in the
// yard's fog colour rises over 0.15 s, the tap goes through to the page 160 ms later (its load() under
// cover), and two frames after that the haze falls away over 0.26 s
const MOCKDIP = `addEventListener('DOMContentLoaded', () => {
  const st = document.createElement('style');
  st.textContent = '#dip{position:fixed;inset:0;pointer-events:none;opacity:0;transition:opacity .26s ease-out}#dip.on{opacity:1;transition:opacity .15s ease-in}';
  document.head.appendChild(st);
  const dip = document.createElement('div'), btn = document.getElementById('card-btn'), fog = () => '#' + __golf.engine.scene.fog.color.getHexString();
  dip.id = 'dip';
  document.getElementById('confetti').after(dip);
  let pass = false, dipping = false;
  btn.addEventListener('click', e => {
    if (pass) return;
    const G = __golf.G;
    if (dipping) { e.stopImmediatePropagation(); return; }
    if (G.state !== 'card' || G.paused || G.yardPage) return;
    e.stopImmediatePropagation();
    dipping = true;
    dip.style.background = fog();
    dip.classList.add('on');
    setTimeout(() => {
      pass = true; btn.click(); pass = false;
      requestAnimationFrame(() => requestAnimationFrame(() => { dip.style.background = fog(); dip.classList.remove('on'); dipping = false; }));
    }, 160);
  }, true);
});`;
const STORAGE = {
  next: {},
  yard: { best: [2, 2, 2, 2, 2, 2, 2, 2], rounds: [[3, 3, 3, 3, 3, 3, 3, 3]], hole: 8, lvIntro: true, shot: true },
};

// in the page: the best shot from where the ball lies (the drop with the most dropping neighbours in the
// grid; ties: nearest the cup's bearing, then the middle power), else the finish nearest the cup
const PLAN = `(() => {
  const g = __golf, G = g.G, C = G.course, b = G.ball, cup = C.cup, NA = 144, NP = 40;
  const bear = Math.atan2(cup.x - b.x, -(cup.z - b.z)), grid = [];
  let near = null;
  for (let i = 0; i < NA; i++) {
    grid.push([]);
    for (let j = 0; j < NP; j++) {
      const ang = (i / NA) * 2 * Math.PI, p = 0.05 + (0.95 * j) / (NP - 1), r = g.simulate(C, b.x, b.z, ang, p);
      grid[i].push(r.sunk);
      const d = r.sunk ? 0 : Math.hypot(r.x - cup.x, r.z - cup.z);
      if (!near || d < near.d) near = { ang, p, d };
    }
  }
  let best = null;
  for (let i = 0; i < NA; i++) for (let j = 0; j < NP; j++) if (grid[i][j]) {
    let nb = 0;
    for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) if ((di || dj) && grid[(i + di + NA) % NA][j + dj]) nb++;
    const ang = (i / NA) * 2 * Math.PI, off = Math.abs(Math.atan2(Math.sin(ang - bear), Math.cos(ang - bear)));
    const c = { ang, p: 0.05 + (0.95 * j) / (NP - 1), nb, off, sunk: true };
    if (!best || nb > best.nb || (nb === best.nb && off < best.off - 1e-9)) best = c;
  }
  return best || { ...near, sunk: false };
})()`;

// in the page: the frame recorder (every rAF callback until stop), and the tap's events
const REC = `(() => {
  const P = window.__perf = { f: [], ev: {}, stop: performance.now() + 1e9 };
  const card = document.getElementById('card');
  for (const t of ['pointerdown', 'pointerup', 'touchend', 'click']) addEventListener(t, e => { if (!P.ev[t]) P.ev[t] = { ts: e.timeStamp, now: performance.now() }; }, true);
  const tick = ts => {
    const G = __golf.G, d = document.getElementById('dip');
    P.f.push([ts, performance.now(), G.hole, G.state, d ? +getComputedStyle(d).opacity : null, card.hidden]);
    if (performance.now() < P.stop) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  return true;
})()`;

const say = (() => { const lines = []; const f = s => { lines.push(s); console.log(s); }; f.lines = lines; return f; })();
const r1 = v => (v == null || !isFinite(v) ? '-' : v.toFixed(1));
const sgn = v => (v == null || !isFinite(v) ? '-' : (v >= 0 ? '+' : '') + Math.round(v));
const op = v => (v == null ? '-' : v.toFixed(2));
const q = (a, k) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(k * s.length))]; };

async function setCpu(b, rate) { await b.send('Emulation.setCPUThrottlingRate', { rate }); }

/** a real tap (or a click, on a computer size) at the middle of the element with this id */
async function tap(b, id) {
  const r = await b.evaluate(`(() => { const r = document.getElementById('${id}').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width }; })()`);
  if (!r || r.error || !r.w) throw new Error(`no #${id} to tap: ${JSON.stringify(r)}`);
  const x = Math.round(r.x), y = Math.round(r.y);
  if (TOUCH) {
    await b.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1, radiusX: 1, radiusY: 1, force: 1 }] });
    await sleep(60);
    await b.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  } else {
    await b.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'none', buttons: 0 });
    await b.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', buttons: 1, clickCount: 1 });
    await sleep(60);
    await b.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', buttons: 0, clickCount: 1 });
  }
}

/** play the hole on the screen until its card is up; the frames while it played */
async function playToCard(b) {
  await b.evaluate(REC);
  let strokes = 0;
  const shots = [];
  while (strokes < 8) {
    if (!(await b.waitFor(`__golf.G.state === 'aim' || __golf.G.state === 'card'`, 30000))) throw new Error('the ball never stopped');
    if ((await b.evaluate('__golf.G.state')) === 'card') break;
    await setCpu(b, 1);
    const plan = await b.evaluate(PLAN, { timeout: 120000 });
    await setCpu(b, CPU);
    if (!plan || plan.error) throw new Error('plan: ' + JSON.stringify(plan));
    shots.push({ ang: +plan.ang.toFixed(4), p: +plan.p.toFixed(4), sunk: plan.sunk, nb: plan.nb ?? null });
    await b.evaluate(`__golf.shoot(${plan.ang}, ${plan.p})`);
    strokes++;
    await b.waitFor(`__golf.G.state !== 'roll' && __golf.G.state !== 'sink'`, 30000);
  }
  if (!(await b.waitFor(`__golf.G.state === 'card' && !document.getElementById('card').hidden`, 10000))) throw new Error('no card after 8 strokes');
  const f = await b.evaluate(`(() => { const P = window.__perf; P.stop = 0; return P.f; })()`);
  // (the frames that start with the ball rolling or dropping: not those between strokes, where the search
  // for the next shot holds the page up)
  const d = [];
  for (let k = 0; k < f.length - 1; k++) if (f[k][3] === 'roll' || f[k][3] === 'sink') d.push(f[k + 1][0] - f[k][0]);
  return { strokes: await b.evaluate('__golf.G.strokes'), shots, play: { n: d.length, p50: q(d, 0.5), p95: q(d, 0.95), max: d.length ? Math.max(...d) : null } };
}

function analyse(rec, from) {
  const ev = rec.ev, t0 = ev.pointerup?.ts ?? ev.touchend?.ts ?? ev.click?.ts;
  if (t0 == null) return { error: 'the tap never reached the page' };
  const f = rec.f.map(([ts, now, hole, state, o, cardHidden]) => ({ t: ts - t0, now: now - t0, hole, state, o, cardHidden }));
  const dur = f.slice(0, -1).map((x, k) => ({ start: x.t, d: f[k + 1].t - x.t, o0: x.o, o1: f[k + 1].o }));
  const hasDip = f.some(x => x.o != null);
  const kHole = f.findIndex(x => x.hole !== from);
  const holeAt = kHole >= 0 ? f[kHole].t : null, drawn = kHole >= 0 && f[kHole + 1] ? f[kHole + 1].t : null;
  let dip1 = null, clear = null;
  if (hasDip) {
    const k1 = f.findIndex(x => x.t >= 0 && x.o >= 0.99);
    if (k1 >= 0) { dip1 = f[k1].t; const k2 = f.findIndex((x, k) => k > k1 && x.o < 0.05); if (k2 >= 0) clear = f[k2].t; }
  } else clear = drawn;
  const win = dur.filter(x => x.start + x.d > 0 && x.start < 3000);
  const longest = win.reduce((m, x) => (!m || x.d > m.d ? x : m), null);
  const aimEnd = clear != null ? clear + 3000 : null;
  const aim = clear == null ? [] : dur.filter(x => x.start >= clear && x.start < aimEnd);
  const covered = clear != null && f.length ? Math.min(3000, f[f.length - 1].t - clear) : 0;
  const slow = dur.filter(x => x.d > 50 && x.start + x.d > 0 && x.start < (clear ?? 3000) + 500);
  return {
    t0, click: ev.click ? ev.click.now - t0 : null, newHole: kHole >= 0 ? f[kHole].hole : null,
    longest: longest && { d: longest.d, at: longest.start, o0: longest.o0, o1: longest.o1 },
    holeAt, drawn, hasDip, dip1, clear,
    aim: { n: aim.length, covered, over50: aim.filter(x => x.d > 50).map(x => ({ d: x.d, at: x.start })), p50: q(aim.map(x => x.d), 0.5), p95: q(aim.map(x => x.d), 0.95), max: aim.length ? Math.max(...aim.map(x => x.d)) : null },
    slow: slow.map(x => ({ d: x.d, at: x.start, o0: x.o0 })),
    frames: f.map(x => [Math.round(x.t * 10) / 10, x.hole, x.state, x.o == null ? null : Math.round(x.o * 1000) / 1000]),
  };
}

async function run(pathName, k) {
  const b = await open({ w: W, h: H, lang: LANG, touch: TOUCH, init: [INIT(STORAGE[pathName]), ...(opt.mockdip ? [MOCKDIP] : [])] });
  try {
    await b.navigate(fileUrl(html, LANG));
    if (!(await b.waitFor('window.__ready === true', 60000))) throw new Error('page not ready');
    await sleep(1500);
    const start = await b.evaluate('__golf.G.hole');
    if (start !== (pathName === 'yard' ? 8 : 0)) throw new Error(`booted at hole index ${start}`);
    await setCpu(b, CPU);
    const played = await playToCard(b);
    await sleep(WAIT);
    if (pathName === 'yard') {
      const label = await b.evaluate(`document.getElementById('card-btn').textContent`);
      await tap(b, 'card-btn');
      if (!(await b.waitFor(`document.getElementById('card').classList.contains('yd-page')`, 10000))) throw new Error(`no yard page after '${label}'`);
      await sleep(WAIT);
    }
    const from = await b.evaluate('__golf.G.hole'), label = await b.evaluate(`document.getElementById('card-btn').textContent`);
    await b.evaluate(REC);
    await sleep(300);
    await tap(b, 'card-btn');
    await sleep(RECORD);
    const rec = await b.evaluate(`(() => { const P = window.__perf; P.stop = 0; return { f: P.f, ev: P.ev }; })()`);
    await setCpu(b, 1);
    const errs = b.logs.filter(l => /\[(exception|console\.error|log\.error)\]/.test(l));
    return { path: pathName, run: k, label, from, ...played, ...analyse(rec, from), errors: errs };
  } finally {
    b.close();
  }
}

const sha = crypto.createHash('sha256').update(fs.readFileSync(html)).digest('hex').slice(0, 16);
say(`perf.mjs  ${path.relative(process.cwd(), path.resolve(html))}  sha256 ${sha}…  ${W}x${H} ${TOUCH ? 'touch' : 'mouse'}  CPU ${CPU}x  runs ${RUNS}  card wait ${WAIT} ms  seed ${SEED}  lang ${LANG}${opt.mockdip ? '  MOCKDIP (D2 imitated: a self-test)' : ''}  ${new Date().toISOString().slice(0, 16)}`);
say(`next = hole 1's card -> #card-btn -> hole 2;  yard = hole 9's card -> #card-btn -> yard page -> #card-btn -> hole 10`);
say(`ms from the tap's release; a frame = the gap between two rAF timestamps; dip '-' = no #dip in the page`);
say('');
say(`path  run  shots  click  longest @start  dip(start/end)  hole@  drawn  dip1   clear  aim>50  aim p50/p95/max    play p50/p95/max`);
const results = [];
for (const p of PATHS) for (let k = 1; k <= RUNS; k++) {
  let r;
  try { r = await run(p, k); } catch (e) { r = { path: p, run: k, error: e.message }; }
  results.push(r);
  if (r.error) { say(`${p.padEnd(5)} ${String(k).padStart(3)}  ERROR ${r.error}`); continue; }
  const L = r.longest || {};
  say(`${p.padEnd(5)} ${String(k).padStart(3)}  ${String(r.strokes).padStart(5)}  ${sgn(r.click).padStart(5)}  ${r1(L.d).padStart(7)} ${sgn(L.at).padStart(6)}  ${(op(L.o0) + '/' + op(L.o1)).padStart(14)}  ${sgn(r.holeAt).padStart(5)}  ${sgn(r.drawn).padStart(5)}  ${sgn(r.dip1).padStart(5)}  ${sgn(r.clear).padStart(5)}  ${String(r.aim.over50.length).padStart(6)}  ${(r1(r.aim.p50) + '/' + r1(r.aim.p95) + '/' + r1(r.aim.max)).padStart(16)}${r.aim.covered < 2999 ? ` (${Math.round(r.aim.covered)} ms)` : ''}  ${(r1(r.play.p50) + '/' + r1(r.play.p95) + '/' + r1(r.play.max)).padStart(16)}`);
}
say('');
say('frames over 50 ms from the tap to clear + 0.5 s (ms@start[dip opacity at its start]), and anything else to note:');
for (const r of results) if (!r.error) {
  const extra = [];
  if (r.newHole !== r.from + 1) extra.push(`NEW HOLE index ${r.newHole} (expected ${r.from + 1})`);
  if (r.aim.over50.length) extra.push(`aim>50: ${r.aim.over50.map(x => `${Math.round(x.d)}@${sgn(x.at)}`).join(' ')}`);
  if (r.errors.length) extra.push(`page errors: ${r.errors.slice(0, 3).join(' | ')}`);
  say(`  ${r.path} ${r.run} ('${r.label}', hole ${r.from + 1} -> ${r.newHole + 1}, shots ${r.shots.map(s => `${s.p}${s.sunk ? '' : '?'}`).join(',')}): ${r.slow.map(x => `${Math.round(x.d)}@${sgn(x.at)}[${op(x.o0)}]`).join(' ') || 'none'}${extra.length ? '; ' + extra.join('; ') : ''}`);
}
say('');
say('per path over the runs: min-max (mean)');
const mm = a => { const v = a.filter(x => x != null && isFinite(x)); return v.length ? `${r1(Math.min(...v))}-${r1(Math.max(...v))} (${r1(v.reduce((s, x) => s + x, 0) / v.length)})` : '-'; };
for (const p of PATHS) {
  const rs = results.filter(r => r.path === p && !r.error);
  if (!rs.length) { say(`  ${p}: no runs`); continue; }
  say(`  ${p}: longest ${mm(rs.map(r => r.longest?.d))} ms at ${mm(rs.map(r => r.longest?.at))}; drawn ${mm(rs.map(r => r.drawn))}; clear ${mm(rs.map(r => r.clear))}; dip1 ${mm(rs.map(r => r.dip1))}; aim>50 ${rs.map(r => r.aim.over50.length).join('/')}, aim max ${mm(rs.map(r => r.aim.max))}; play p50 ${mm(rs.map(r => r.play.p50))} p95 ${mm(rs.map(r => r.play.p95))}`);
}
if (opt.out) { fs.mkdirSync(path.dirname(path.resolve(opt.out)), { recursive: true }); fs.writeFileSync(opt.out, say.lines.join('\n') + '\n'); }
if (opt.json) { fs.mkdirSync(path.dirname(path.resolve(opt.json)), { recursive: true }); fs.writeFileSync(opt.json, JSON.stringify({ html: path.resolve(html), sha, size: [W, H], touch: TOUCH, cpu: CPU, wait: WAIT, record: RECORD, seed: SEED, results }, null, 1)); }
