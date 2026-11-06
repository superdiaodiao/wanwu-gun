// reach.mjs: how much power a player gets in 小区高尔夫 (Backyard Mini Golf) who presses on the ball and pulls
// it straight down to the edge of the screen, with real input (scope step 3, D1).
//
//   node tools/golf/reach.mjs <golf.html> [--sizes=844x390,1920x1080,390x844] [--holes=0-35] [--lang=en]
//        [--touch=auto|on|off] [--margin=4] [--steps=8] [--putt=844x390|none] [--out=<file.txt>] [--json=<file>]
//
// For each size (one fresh page each, its storage empty; a phone, i.e. touch events, (pointer: coarse) and
// a mobile viewport, when a side is under 600 px, as shots.mjs does; --touch=on|off to force) and each hole
// index: __golf.load(i), then __golf.camDone() if the page has it, two frames, and the ball's centre on the
// screen (its ground point lifted by BALL_R, projected with the game's camera). Then a REAL drag over CDP
// (Input.dispatchTouchEvent on a phone, Input.dispatchMouseEvent with the left button on a computer):
// press on the ball, pull straight down to --margin px (4) above the bottom edge in --steps moves (8), one
// frame apart; the power the game would fire is read from G.aim.p (main.js onMove sets it on every move)
// just before letting go. The drag is then taken back to the press point (power 0) and released, so no
// shot is played (checked: strokes stays 0).
//
// Columns: hole (1-36; index = hole - 1), ball y (CSS px from the top), room (px from the ball's centre to
// the bottom edge), pull (px dragged), full (the pull past main.js's 10 px dead zone that gives full power:
// G.full if the page exposes it, else 0.3 * min(W, H), the fc46371 rule, marked *), p (what the game read),
// calc (clamp((pull - 10) / full): should equal p; a '!' marks a miss over 0.005 or a press that didn't
// start an aim, e.g. landed on a button). Then per size: the range of p and room, and how many holes reach
// p >= 0.98.
//
// --putt=<WxH> (default 844x390; 'none' to skip): on hole 1 at that size, the pull a putt that rolls 1 m
// needs (the scope's D1 acceptance: at least 25 px). The direction is the one a straight-down pull gives
// (read from a drag); the power by bisection with the game's own simulate() from the tee, run to a stop;
// pull = 10 + p * full. Then a real drag of that many px, released after 120 ms still (so the touch
// lift-off rule in onUp keeps the aim), and the distance the ball really rolled.
//
// --json: every row and the putt as JSON, for comparing runs. One Chrome at a time (tools/golf/cdp.mjs),
// reused for every size. Run from the repo root: cd <repo> && node tools/golf/reach.mjs <golf.html>.
// Base numbers (fc46371): .cache/golf-work/p5/reach-base.txt; how to run: .cache/golf-work/p5/README.md.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { open, fileUrl, sleep } from './cdp.mjs';

const args = process.argv.slice(2);
const opt = Object.fromEntries(args.filter(a => a.startsWith('--')).map(a => { const [k, v] = a.slice(2).split('='); return [k, v ?? true]; }));
const html = args.find(a => !a.startsWith('--'));
if (!html || !fs.existsSync(html)) { console.error('usage: node tools/golf/reach.mjs <golf.html> [--sizes=WxH,..] [--holes=0-35] [--lang=en] [--touch=auto|on|off] [--margin=4] [--steps=8] [--putt=844x390|none] [--out=f.txt] [--json=f.json]'); process.exit(2); }
const list = (v, d) => String(v ?? d).split(',').map(s => s.trim()).filter(Boolean);
function range(v, d) {
  const out = [];
  for (const part of list(v, d)) { const [a, b] = part.split('-').map(Number); for (let i = a; i <= (b ?? a); i++) out.push(i); }
  return [...new Set(out)].sort((x, y) => x - y);
}
const SIZES = list(opt.sizes, '844x390,667x375,740x360,568x320,821x462,1280x720,1920x1080,390x844,360x780').map(s => s.split('x').map(Number));
const HOLES = range(opt.holes, '0-35');
const LANG = opt.lang || 'en', MARGIN = +(opt.margin ?? 4), STEPS = +(opt.steps ?? 8);
const PUTT = opt.putt === 'none' ? null : String(opt.putt || '844x390').split('x').map(Number);
const BALL_R = 0.14; // physics.js BALL_R: the ball's centre above the ground under it
const touchOf = (w, h) => opt.touch === 'on' ? true : opt.touch === 'off' ? false : Math.min(w, h) < 600;

// the empty storage a first-time player has (before the page's own scripts)
const INIT = `try { localStorage.clear(); } catch (e) {}`;

const lines = [];
const say = s => { lines.push(s); console.log(s); };
const f1 = v => (v == null ? '-' : v.toFixed(1));
const f3 = v => (v == null ? '-' : v.toFixed(3));

// in the page: hole i loaded, its camera settled; where the ball is on the screen
const PLACE = i => `(async () => {
  const g = __golf, G = g.G;
  g.load(${i});
  if (typeof g.camDone === 'function') g.camDone();
  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  const cam = g.engine.camera, V = cam.position.constructor, cv = g.engine.renderer.domElement.getBoundingClientRect();
  cam.updateMatrixWorld();
  const b = G.ball, y = G.course.Y(b.x, b.z);
  const pr = (x, yy, z) => { const v = new V(x, yy, z).project(cam); return [cv.left + ((v.x + 1) / 2) * cv.width, cv.top + ((1 - v.y) / 2) * cv.height]; };
  const [x, by] = pr(b.x, y + ${BALL_R}, b.z);
  const el = document.elementFromPoint(Math.round(x), Math.round(by));
  return { hole: G.hole, state: G.state, strokes: G.strokes, x, y: by, W: innerWidth, H: innerHeight,
    full: typeof G.full === 'number' ? G.full : null, target: el ? (el.id || el.tagName) : null };
})()`;
const AIM = `(() => { const a = __golf.G.aim; return a ? { p: a.p, ang: a.ang } : null; })()`;

/** a real drag on the page: press at (x, y0), move to y1 in `steps` moves a frame apart, read the aim, then
 *  (release: true) let go there after `hold` ms still, or (default) go back to the press point and let go */
async function drag(b, touch, x, y0, y1, { steps = STEPS, release = false, hold = 120 } = {}) {
  const T = (type, y) => b.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1, radiusX: 1, radiusY: 1, force: 1 }] });
  const M = (type, y, buttons = 1) => b.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', buttons, clickCount: type === 'mouseMoved' ? 0 : 1, pointerType: 'mouse' });
  if (touch) await T('touchStart', y0);
  else { await b.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y: y0, button: 'none', buttons: 0 }); await M('mousePressed', y0); }
  await sleep(20);
  for (let k = 1; k <= steps; k++) {
    const y = y0 + ((y1 - y0) * k) / steps;
    if (touch) await T('touchMove', y); else await M('mouseMoved', y);
    await sleep(18);
  }
  await sleep(40);
  const aim = await b.evaluate(AIM);
  if (release) {
    await sleep(hold);
    if (touch) await T('touchEnd', y1); else await M('mouseReleased', y1, 0);
  } else {
    if (touch) { await T('touchMove', y0); await sleep(18); await T('touchEnd', y0); }
    else { await M('mouseMoved', y0); await sleep(18); await M('mouseReleased', y0, 0); }
  }
  await sleep(30);
  return aim;
}

const sha = crypto.createHash('sha256').update(fs.readFileSync(html)).digest('hex').slice(0, 16);
say(`reach.mjs  ${path.relative(process.cwd(), path.resolve(html))}  sha256 ${sha}…  lang ${LANG}  ${new Date().toISOString().slice(0, 16)}`);
say(`drag: press on the ball's centre, straight down to ${MARGIN} px above the bottom edge in ${STEPS} moves; p = G.aim.p just before release (then cancelled: no shot)`);
say(`full: G.full if the page has it, else 0.3*min(W,H) (fc46371's rule, marked *); calc = clamp((pull - 10) / full); '!' = p and calc differ or no aim`);

const rows = [], sums = [];
let b = null, putt = null;
try {
  for (const [w, h] of SIZES) {
    const touch = touchOf(w, h);
    if (!b) b = await open({ w, h, lang: LANG, touch, init: [INIT] });
    else await b.setViewport({ w, h, dpr: 1, touch });
    await b.navigate(fileUrl(html, LANG));
    if (!(await b.waitFor('window.__ready === true', 60000))) throw new Error(`page not ready at ${w}x${h}`);
    await sleep(800);
    say('');
    say(`${w}x${h} ${touch ? 'touch' : 'mouse'}`);
    say(`  hole  ball y   room   pull   full      p      calc`);
    const mine = [];
    for (const i of HOLES) {
      const at = await b.evaluate(PLACE(i));
      if (at.error) throw new Error(`hole ${i + 1} at ${w}x${h}: ${at.error}`);
      const x = Math.round(at.x), y0 = Math.round(at.y), y1 = at.H - MARGIN;
      const full = at.full ?? 0.3 * Math.min(at.W, at.H);
      const aim = at.state === 'aim' ? await drag(b, touch, x, y0, y1) : null;
      const after = await b.evaluate('({ strokes: __golf.G.strokes, state: __golf.G.state, aim: !!__golf.G.aim })');
      const pull = y1 - y0, calc = Math.max(0, Math.min(1, (pull - 10) / full));
      const row = { size: `${w}x${h}`, touch, hole: i + 1, x, ballY: at.y, room: at.H - at.y, pull, full, fullSrc: at.full == null ? 'rule' : 'G.full',
        p: aim ? aim.p : null, ang: aim ? aim.ang : null, calc, target: at.target, shot: after.strokes !== 0 || after.state !== 'aim' || after.aim };
      const bad = !aim || Math.abs(aim.p - calc) > 0.005 || row.shot;
      rows.push(row); mine.push(row);
      say(`  ${String(i + 1).padStart(4)}  ${f1(at.y).padStart(6)}  ${f1(row.room).padStart(5)}  ${String(pull).padStart(5)}  ${f1(full).padStart(5)}${at.full == null ? '*' : ' '}  ${f3(row.p).padStart(5)}  ${f3(calc).padStart(5)}${bad ? ` ! ${!aim ? `no aim (state ${at.state}, pressed on ${at.target})` : row.shot ? 'a shot was played' : 'p != calc'}` : ''}`);
    }
    const ps = mine.map(r => r.p).filter(v => v != null), rooms = mine.map(r => r.room), fulls = mine.map(r => r.full);
    const s = { size: `${w}x${h}`, touch, pMin: Math.min(...ps), pMax: Math.max(...ps), roomMin: Math.min(...rooms), roomMax: Math.max(...rooms),
      fullMin: Math.min(...fulls), fullMax: Math.max(...fulls), rule: 0.3 * Math.min(w, h), full98: ps.filter(v => v >= 0.98).length, n: mine.length, noAim: mine.length - ps.length };
    sums.push(s);
    say(`  -> p ${f3(s.pMin)}-${f3(s.pMax)}, room ${f1(s.roomMin)}-${f1(s.roomMax)} px, full ${f1(s.fullMin)}-${f1(s.fullMax)} (0.3*min ${f1(s.rule)}), p >= 0.98 on ${s.full98}/${s.n}${s.noAim ? `, NO AIM on ${s.noAim}` : ''}`);
  }

  if (PUTT) {
    const [w, h] = PUTT, touch = touchOf(w, h);
    if (!b) b = await open({ w, h, lang: LANG, touch, init: [INIT] });
    else await b.setViewport({ w, h, dpr: 1, touch });
    await b.navigate(fileUrl(html, LANG));
    if (!(await b.waitFor('window.__ready === true', 60000))) throw new Error('page not ready for the putt');
    await sleep(800);
    let at = await b.evaluate(PLACE(0));
    const x = Math.round(at.x), y0 = Math.round(at.y);
    // the direction a straight-down pull aims (any pull past the dead zone gives the same one)
    const probe = await drag(b, touch, x, y0, y0 + 40);
    const full = at.full ?? 0.3 * Math.min(at.W, at.H);
    const sim = await b.evaluate(`(() => {
      const g = __golf, G = g.G, C = G.course, x = C.tee.x, z = C.tee.z, ang = ${probe.ang};
      const run = p => { const r = g.simulate(C, x, z, ang, p, { every: 0.02 }); return Math.hypot(r.x - x, r.z - z); };
      let lo = 0, hi = 1;
      for (let k = 0; k < 40; k++) { const m = (lo + hi) / 2; if (run(m) < 1) lo = m; else hi = m; }
      return { p: hi, run: run(hi) };
    })()`);
    const pull = 10 + sim.p * full;
    // a real putt of that pull (rounded to the nearest px), released, and how far the ball went
    at = await b.evaluate(PLACE(0));
    const px = Math.round(pull);
    const real = await drag(b, touch, Math.round(at.x), Math.round(at.y), Math.round(at.y) + px, { release: true });
    await sleep(200);
    await b.waitFor(`__golf.G.state !== 'roll'`, 15000);
    const end = await b.evaluate(`(() => { const G = __golf.G, C = G.course; return { state: G.state, strokes: G.strokes, rolled: Math.hypot(G.ball.x - C.tee.x, G.ball.z - C.tee.z) }; })()`);
    putt = { size: `${w}x${h}`, touch, hole: 1, ang: probe.ang, p1m: sim.p, simRun: sim.run, full, fullSrc: at.full == null ? 'rule' : 'G.full', pull, dragPx: px, dragP: real?.p ?? null, ...end };
    say('');
    say(`1 m putt at ${w}x${h} (${touch ? 'touch' : 'mouse'}), hole 1 from the tee, straight-down pull (ang ${probe.ang.toFixed(3)}): p = ${sim.p.toFixed(4)} (simulate: ${sim.run.toFixed(3)} m)`);
    say(`  full ${f1(full)}${at.full == null ? '* (0.3*min(W,H); G.full not exposed)' : ' (G.full)'} -> pull needed = 10 + p*full = ${pull.toFixed(1)} px  (D1: >= 25 px)`);
    say(`  real drag of ${px} px: p ${f3(real?.p)}, shot played (strokes ${end.strokes}), ball rolled ${end.rolled.toFixed(2)} m`);
  }
} finally {
  if (b) b.close();
}
if (opt.out) { fs.mkdirSync(path.dirname(path.resolve(opt.out)), { recursive: true }); fs.writeFileSync(opt.out, lines.join('\n') + '\n'); }
if (opt.json) { fs.mkdirSync(path.dirname(path.resolve(opt.json)), { recursive: true }); fs.writeFileSync(opt.json, JSON.stringify({ html: path.resolve(html), sha, lang: LANG, margin: MARGIN, steps: STEPS, rows, sums, putt }, null, 1)); }
