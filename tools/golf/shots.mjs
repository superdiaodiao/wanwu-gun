// Per-hole regression pictures of 小区高尔夫 (Backyard Mini Golf), and their comparison: did a change move
// anything it shouldn't have?
//
//   node tools/golf/shots.mjs capture <golf.html> <outdir> [--holes=0-35] [--levels=normal,hard]
//        [--sizes=1280x800,390x844,844x390] [--langs=en,zh] [--visit] [--page] [--frames=20] [--jobs=2]
//        [--fonts=none|cache] [--touch=auto|on|off] [--gpu=off]
//   node tools/golf/shots.mjs compare <dirA> <dirB> [--holes=..] [--common] [--diff=<dir>] [--tol=0] [--strict] [--quiet]
//   node tools/golf/shots.mjs console <golf.html> <outdir> [--holes=0-35] [--levels=easy,normal,hard]
//        [--langs=en] [--sizes=1280x800] [--jobs=2]
//
// capture: for each language x difficulty x size (a "set", the folder <lang>-<level>-<W>x<H>[-visit]), one
// headless page (difficulty picked before the page starts, in its localStorage, which starts empty), and
// for each hole i in it:
//   h<ii>.png   the WebGL canvas of hole i's first moments, frozen: the page's own animation loop is
//               stopped (1.5 s after __ready), Math.random is seeded (per hole), then in one go
//               load(i), the clock G.t set to 0, step(1/60) x frames (20: a third of a second for the cars,
//               geese and fans to start; drawn on the last) and the canvas read. The same build gives
//               byte-identical files (but for the GPU's rare odd pixel: see compare).
//   h<ii>.json  the page round it: HUD texts, classes and boxes, the tags (texts, classes, where placed),
//               the banner, the card and menu if up, the hint, the camera, the ball, the canvas size.
//   h<ii>.page.png (--page) the whole page as a player sees it, with CSS animations and transitions off
//               and the tags shown (so the banner, tags and bars all at once: the most crowded moment).
//   _console.txt everything the page logged (should be empty), _meta.json what was captured how.
// --visit: before each hole, a hole of another yard ((i + 13) % 36) is played for 0.7 s (one shot at the
//   cup), its saved data put back, then hole i captured as above, into <set>-visit. Compared with the plain
//   set it shows whatever one hole leaves behind for the next.
// Phones: sizes with a side under 600 px are run as a touch device ((pointer: coarse), so the game's
//   'medium' quality), --touch=on|off to force. Device pixel ratio 1. Web fonts: --fonts=none (default) gives
//   the page an empty Google Fonts stylesheet, so its system fallback fonts, the same every run and offline;
//   --fonts=cache uses the real fonts (cached in .cache/golf-work/fonts, fetched from Google the first time):
//   the same every run only once the cache has every face the run needs, so make one throwaway run first
//   (the Chinese signs are drawn with whatever has arrived within the game's 600 ms wait at boot).
//   --gpu=off: SwiftShader instead of the Mac's GPU, about 5x slower (and its WebGL warns 'GPU stall due to
//   ReadPixels' in _console.txt: that is this tool reading the canvas).
// The page's own logic is untouched: what the kit does to it is only Math.random seeded, its animation
// frames held back once frozen, its storage emptied, and the clock G.t reset at each hole.
//
// compare: every h*.png / h*.json under A against the one at the same place under B (files starting
//   with _ are skipped), and the files only one side has (--common: those left out, e.g. a few sets or holes
//   captured against the full baseline). PNGs: identical bytes, or the number of pixels
//   that differ (any channel > --tol), the biggest difference and the box round them (--diff=<dir>: a picture
//   of each, the differing pixels magenta). A picture off in at most 16 pixels by at most 2 levels is listed
//   as noise and not counted (the GPU, very rarely: 2 of 1512 pictures in a test; --strict counts it). JSON:
//   each differing field, A -> B. Exit 0 if all the same, 1 if not.
//   Two sets can be compared directly too: compare <out>/en-normal-1280x800 <out>/en-normal-1280x800-visit.
//
// console: each hole played for real, the page's own loop running (not frozen): load(i), half a second,
//   one shot at the cup (half power), until the ball stops (or 10 s); everything logged, per hole, into
//   <outdir>/<set>.log, and a summary. Should be 0 lines.
//
// Chrome via tools/golf/cdp.mjs (tools/chrome.mjs): at most --jobs at once (default 2), each reused for its
// sets. Run from the repo root.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { open, fileUrl, sleep } from './cdp.mjs';
import { diffPng } from './png.mjs';

const [cmd, ...rest] = process.argv.slice(2);
const opt = Object.fromEntries(rest.filter(a => a.startsWith('--')).map(a => { const [k, v] = a.slice(2).split('='); return [k, v ?? true]; }));
const pos = rest.filter(a => !a.startsWith('--'));
const list = (v, d) => String(v ?? d).split(',').map(s => s.trim()).filter(Boolean);
function range(v, d = '0-35') {
  const out = [];
  for (const part of list(v, d)) { const [a, b] = part.split('-').map(Number); for (let i = a; i <= (b ?? a); i++) out.push(i); }
  return [...new Set(out)].sort((x, y) => x - y);
}
const pad = i => String(i).padStart(2, '0');
const USAGE = 'usage: node tools/golf/shots.mjs capture <golf.html> <outdir> [opts] | compare <dirA> <dirB> [opts] | console <golf.html> <outdir> [opts]  (see the header)';

// ---- in the page ------------------------------------------------------------------------------------
// before the page's own scripts: Math.random seeded (window.__kit.seed(n)), the page's animation frames
// held back while window.__kit.frozen, the storage empty but for the difficulty asked for (#kit-level=..).
// three.js draws on Math.random for every object's uuid, so how many numbers a hole's critters get to see
// first would hang on how many objects were made before them (and the previous hole leaves different
// things cached): once __kit.calibrate(f) has seen which lines of the page call it while f makes a three.js
// object, calls from those lines get numbers of their own, and the seeded ones go only to the game.
const INIT = `(() => {
  const mk = st => () => { st.s = (st.s + 0x6D2B79F5) | 0; let t = Math.imul(st.s ^ (st.s >>> 15), 1 | st.s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const main = { s: 1 }, aside = { s: 7 }, next = mk(main), other = mk(aside), skip = new Set();
  let calibrating = false;
  const caller = () => { const L = Error.stackTraceLimit; Error.stackTraceLimit = 3; const st = new Error().stack; Error.stackTraceLimit = L; return st.split('\\n')[3] || ''; };
  Math.random = function random() {
    if (calibrating) skip.add(caller());
    else if (skip.size && skip.has(caller())) return other();
    return next();
  };
  const raf = window.requestAnimationFrame.bind(window);
  const kit = window.__kit = { frozen: false, held: 0, raf, seed(n) { main.s = n | 0; aside.s = (n | 0) ^ 0x5bd1e995; },
    calibrate(f) { calibrating = true; try { f(); } finally { calibrating = false; } return [...skip].map(l => l.trim().replace(/\\(.*(:\\d+:\\d+)\\)$/, '$1')); } };
  window.requestAnimationFrame = cb => raf(t => { if (kit.frozen) kit.held++; else cb(t); });
  try {
    localStorage.clear();
    const m = /kit-level=(\\w+)/.exec(location.hash);
    if (m) localStorage.setItem('golf.level', JSON.stringify(m[1]));
  } catch (e) {}
})();`;

// the page's state round the canvas (run in the page; positions from offsetLeft/Top, which CSS animations
// don't move, so the same each time)
const DOM = `(() => {
  const g = __golf, G = g.G, $ = id => document.getElementById(id);
  const r4 = v => Math.round(v * 1e4) / 1e4;
  const box = el => { if (!el || el.hidden || getComputedStyle(el).display === 'none') return null; let x = 0, y = 0, e = el; while (e) { x += e.offsetLeft; y += e.offsetTop; e = e.offsetParent; } return [x, y, el.offsetWidth, el.offsetHeight]; };
  const txt = id => { const el = $(id); return el ? el.textContent : null; };
  const cls = id => { const el = $(id); return el ? el.className : null; };
  const cam = g.engine.camera, cv = g.engine.renderer.domElement;
  const card = $('card'), menu = $('menu'), banner = $('banner');
  return {
    hole: G.hole, yard: G.yard, level: G.level, state: G.state, strokes: G.strokes, par: g.HOLES[G.hole].par,
    ball: [r4(G.ball.x), r4(G.ball.z)], coins: G.sweets.length, props: G.props.length,
    camera: { pos: cam.position.toArray().map(r4), quat: cam.quaternion.toArray().map(r4), fov: r4(cam.fov) },
    canvas: [cv.width, cv.height], view: [innerWidth, innerHeight],
    hud: {
      holeNum: txt('hole-num'), holeName: txt('hole-name'), dots: $('hole-dots').innerHTML,
      score: $('score').textContent, stars: $('stars').textContent, chip: $('lv-chip').textContent,
      cls: { hole: cls('hole'), score: cls('score'), stars: cls('stars'), chip: cls('lv-chip') },
      box: Object.fromEntries(['hole', 'score', 'stars', 'lv-chip', 'menu-btn', 'mute', 'hint', 'power', 'skip'].map(id => [id, box($(id))])),
      hint: $('hint').hidden ? null : $('hint').textContent,
    },
    tags: { out: $('tags').classList.contains('out'), list: [...document.querySelectorAll('#tags .tag')].map(el => ({ text: el.textContent, cls: el.className, at: el.style.transform, to: el.style.getPropertyValue('--to') || null, w: el.offsetWidth, h: el.offsetHeight })) },
    banner: banner.hidden ? null : { cls: banner.className, kick: txt('banner-kick'), title: txt('banner-title'), sub: txt('banner-sub'), marginTop: banner.style.marginTop, box: box(banner) },
    card: card.hidden ? null : { cls: card.className, text: card.innerText.replace(/\\s+/g, ' ').trim() },
    menu: menu.hidden ? null : [...menu.querySelectorAll('.panel')].filter(p => !p.hidden).map(p => p.id),
  };
})()`;

// one hole, frozen: seeded, loaded, its clock from 0, stepped, drawn, the canvas read (all in one go, so
// nothing else in the page runs in between)
const SHOOT = (seed, i, frames, dt) => `(() => {
  const g = __golf, G = g.G;
  __kit.seed(${seed});
  g.load(${i});
  G.t = 0;
  for (let k = 0; k < ${frames - 1}; k++) g.step(${dt}, false);
  g.step(${dt}, true);
  return g.engine.renderer.domElement.toDataURL('image/png');
})()`;

// a hole of another yard played for 0.7 s, the saved data then put back as it was, and the ball's roll
// (the turn of its seam, which carries on from hole to hole by design: whatever turned while the visit
// played and sits where the ball is)
const VISIT = (seed, v) => `(() => {
  const g = __golf, G = g.G, saved = { ...localStorage };
  __kit.seed(${seed});
  g.load(${v});
  const turn = [];
  g.engine.scene.traverse(o => turn.push([o, o.quaternion.clone()]));
  for (let k = 0; k < 6; k++) g.step(1 / 60);
  const b = G.ball, c = G.course.cup;
  g.shoot(Math.atan2(c.x - b.x, -(c.z - b.z)), 0.5);
  for (let k = 0; k < 42; k++) g.step(1 / 60);
  const after = { state: G.state, strokes: G.strokes, unrolled: 0 };
  const p = new g.engine.camera.position.constructor();
  for (const [o, q] of turn) if (!o.quaternion.equals(q) && Math.hypot(o.getWorldPosition(p).x - b.x, p.z - b.z) < 0.05) { o.quaternion.copy(q); after.unrolled++; }
  localStorage.clear();
  for (const [k, v] of Object.entries(saved)) localStorage.setItem(k, v);
  return after;
})()`;

const STILL = `(() => {
  const st = document.createElement('style');
  st.id = 'kit-still';
  st.textContent = '*, *::before, *::after { animation: none !important; transition: none !important; }';
  document.head.appendChild(st);
  const tags = document.getElementById('tags'), out = tags.classList.contains('out');
  tags.classList.remove('out');
  window.__kitUndo = () => { st.remove(); if (out) tags.classList.add('out'); };
  return new Promise(r => __kit.raf(() => __kit.raf(() => r(true))));
})()`;

// ---- capture ---------------------------------------------------------------------------------------
function sets() {
  const langs = list(opt.langs, 'en,zh'), levels = list(opt.levels, 'normal,hard'), sizes = list(opt.sizes, '1280x800,390x844,844x390');
  const out = [];
  for (const lang of langs) for (const level of levels) for (const size of sizes) {
    const [w, h] = size.split('x').map(Number);
    const touch = opt.touch === 'on' ? true : opt.touch === 'off' ? false : Math.min(w, h) < 600;
    out.push({ lang, level, w, h, touch, name: `${lang}-${level}-${w}x${h}${opt.visit ? '-visit' : ''}` });
  }
  return out;
}

// (each worker its own fixed share, k, k + jobs, …: the same sets one after another in the same Chrome
// every run, so even the GPU's history is the same)
async function workers(jobs, n, fn) {
  const J = Math.min(jobs, n);
  await Promise.all(Array.from({ length: J }, async (_, k) => { for (let i = k; i < n; i += J) await fn(i, k); }));
}

const sha = f => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');

async function boot(b, html, set) {
  await b.setViewport({ w: set.w, h: set.h, dpr: 1, touch: set.touch });
  b.logs.length = 0;
  await b.navigate(fileUrl(html, set.lang) + `#kit-level=${set.level}`);
  if (!(await b.waitFor('window.__ready === true && window.__golf && __golf.G.state === "aim"', 60000))) throw new Error(`${set.name}: the page never got ready`);
  // (a fresh page, at the difficulty and in the language asked for)
  const got = await b.evaluate(`[!!window.__kit && !__kit.frozen, __golf.G.level, document.documentElement.lang.slice(0, 2)]`);
  if (JSON.stringify(got) !== JSON.stringify([true, set.level, set.lang])) throw new Error(`${set.name}: not the page asked for (fresh, level, lang: ${JSON.stringify(got)})`);
  // (real web fonts: the ones asked for so far all in)
  if (opt.fonts && opt.fonts !== 'none') await b.evaluate('document.fonts.ready.then(() => true)');
  await sleep(1500);
}

async function capture() {
  const [html, outdir] = pos;
  if (!html || !outdir) throw new Error(USAGE);
  const holes = range(opt.holes), frames = +(opt.frames || 20), dt = 1 / 60, jobs = +(opt.jobs || 2), fonts = opt.fonts || 'none';
  const all = sets();
  const t0 = Date.now();
  const browsers = [];
  try {
    await workers(jobs, all.length, async (k, wk) => {
      const set = all[k];
      const b = browsers[wk] ||= await open({ w: set.w, h: set.h, lang: set.lang, touch: set.touch, fonts, gpu: opt.gpu !== 'off', init: [INIT] });
      const dir = path.join(outdir, set.name);
      fs.mkdirSync(dir, { recursive: true });
      const ts = Date.now();
      await boot(b, html, set);
      if ((await b.evaluate('__kit.frozen = true')) !== true) throw new Error('could not freeze');
      await sleep(100);
      const uuid = await b.evaluate('__kit.calibrate(() => new (__golf.engine.scene.constructor)())');
      if (!Array.isArray(uuid) || !uuid.length) throw new Error(`${set.name}: could not find three.js's uuid calls (${JSON.stringify(uuid)})`);
      const visits = {};
      for (const i of holes) {
        if (opt.visit) {
          const v = (i + 13) % 36;
          const r = await b.evaluate(VISIT(9000 + i, v));
          if (r?.error) throw new Error(`${set.name} visit ${v} before h${pad(i)}: ${r.error}`);
          visits[i] = { hole: v, ...r };
        }
        const url = await b.evaluate(SHOOT(1000 + i, i, frames, dt));
        if (typeof url !== 'string') throw new Error(`${set.name} h${pad(i)}: ${url?.error || 'no picture'}`);
        fs.writeFileSync(path.join(dir, `h${pad(i)}.png`), Buffer.from(url.split(',')[1], 'base64'));
        // (two frames later: the page's ResizeObserver and layout have caught up; nothing has been drawn.
        // With real web fonts, after the hole's new words have had theirs too)
        if (opt.fonts && opt.fonts !== 'none') await b.evaluate('document.fonts.ready.then(() => true)');
        await b.evaluate('new Promise(r => __kit.raf(() => __kit.raf(() => r(true))))');
        const dom = await b.evaluate(DOM);
        if (dom?.error) throw new Error(`${set.name} h${pad(i)} dom: ${dom.error}`);
        fs.writeFileSync(path.join(dir, `h${pad(i)}.json`), JSON.stringify(dom, null, 1) + '\n');
        if (opt.page) {
          await b.evaluate(STILL);
          await b.screenshot(path.join(dir, `h${pad(i)}.page.png`));
          await b.evaluate('__kitUndo()');
        }
      }
      fs.writeFileSync(path.join(dir, '_console.txt'), b.logs.join('\n') + (b.logs.length ? '\n' : ''));
      fs.writeFileSync(path.join(dir, '_meta.json'), JSON.stringify({
        html: path.resolve(html), sha256: sha(html), set, holes, frames, dt, fonts, page: !!opt.page, visit: !!opt.visit, uuid, visits: opt.visit ? visits : undefined,
        chrome: b.version, when: new Date().toISOString(), seconds: Math.round((Date.now() - ts) / 100) / 10,
      }, null, 1) + '\n');
      console.log(`${set.name}: ${holes.length} holes in ${((Date.now() - ts) / 1000).toFixed(1)} s, ${b.logs.length} console lines`);
    });
  } finally {
    for (const b of browsers) b?.close();
  }
  console.log(`done: ${all.length} sets x ${holes.length} holes -> ${path.resolve(outdir)} in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
}

// ---- compare ---------------------------------------------------------------------------------------
function walk(dir, base = dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith('_') || e.name.startsWith('.')) continue;
    const f = path.join(dir, e.name);
    if (e.isDirectory()) walk(f, base, out);
    else if (/^h\d+(\.page)?\.png$|^h\d+\.json$/.test(e.name)) out.push(path.relative(base, f));
  }
  return out;
}
function jsonDiff(a, b, at = '', out = []) {
  if (JSON.stringify(a) === JSON.stringify(b)) return out;
  if (a && b && typeof a === 'object' && typeof b === 'object' && Array.isArray(a) === Array.isArray(b)) {
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) jsonDiff(a[k], b[k], Array.isArray(a) ? `${at}[${k}]` : at ? `${at}.${k}` : k, out);
  } else out.push(`${at}: ${JSON.stringify(a)} -> ${JSON.stringify(b)}`);
  return out;
}

const NOISE = { px: 16, delta: 2 };
function compare() {
  const [A, B] = pos;
  if (!A || !B) throw new Error(USAGE);
  const holes = opt.holes ? new Set(range(opt.holes)) : null, tol = +(opt.tol || 0), diffDir = opt.diff ? path.resolve(opt.diff) : null;
  const keep = f => !holes || holes.has(+/h(\d+)/.exec(path.basename(f))[1]);
  const fa = walk(A).filter(keep), fb = walk(B).filter(keep), sb = new Set(fb), sa = new Set(fa);
  let same = 0, png = 0, json = 0, noise = 0;
  const lines = [];
  for (const f of fa.filter(f => sb.has(f)).sort()) {
    const a = fs.readFileSync(path.join(A, f)), b = fs.readFileSync(path.join(B, f));
    if (f.endsWith('.png')) {
      let out = null;
      if (diffDir) { out = path.join(diffDir, f.replace(/[\\/]/g, '__')); fs.mkdirSync(diffDir, { recursive: true }); }
      const d = diffPng(a, b, { tol, out });
      if (d.same) { same++; continue; }
      // (the GPU now and then rounds a pixel or two the other way: a handful of pixels off by 1 or 2 is
      // listed as noise, and doesn't count, unless --strict)
      if (!opt.strict && d.px > 0 && d.px <= NOISE.px && d.maxDelta <= NOISE.delta) { noise++; lines.push(`${f}  noise: ${d.px} px off by <= ${d.maxDelta}`); continue; }
      png++;
      lines.push(d.px < 0 ? `${f}  size ${d.size[0]} -> ${d.size[1]}`
        : `${f}  ${d.px} px differ (${(100 * d.px / d.total).toFixed(2)}%), max delta ${d.maxDelta}, box x ${d.box[0]}-${d.box[2]} y ${d.box[1]}-${d.box[3]}` + (out ? `  ${out}` : ''));
    } else {
      const d = jsonDiff(JSON.parse(a), JSON.parse(b));
      if (!d.length) { same++; continue; }
      json++;
      lines.push(`${f}  ${d.length} field${d.length > 1 ? 's' : ''} differ`);
      if (!opt.quiet) for (const l of d.slice(0, 40)) lines.push(`    ${l.length > 300 ? l.slice(0, 300) + '…' : l}`);
      if (!opt.quiet && d.length > 40) lines.push(`    … and ${d.length - 40} more`);
    }
  }
  const onlyA = fa.filter(f => !sb.has(f)), onlyB = fb.filter(f => !sa.has(f));
  // (--common: a partial capture against a full one, the rest not missed)
  if (!opt.common) for (const f of onlyA) lines.push(`only in A: ${f}`);
  if (!opt.common) for (const f of onlyB) lines.push(`only in B: ${f}`);
  console.log(`compare ${path.resolve(A)}\n     vs ${path.resolve(B)}`);
  for (const l of lines) console.log('  ' + l);
  const n = fa.filter(f => sb.has(f)).length;
  console.log(`${n} pairs: ${same} identical, ${png} pictures differ, ${json} page states differ` + (noise ? `, ${noise} pictures within noise` : '') + `; ${onlyA.length} only in A, ${onlyB.length} only in B`);
  process.exitCode = png + json + (opt.common ? 0 : onlyA.length + onlyB.length) ? 1 : 0;
}

// ---- console ---------------------------------------------------------------------------------------
const PLAY = i => `(async () => {
  const g = __golf, G = g.G;
  g.load(${i});
  await new Promise(r => setTimeout(r, 500));
  const b = G.ball, c = G.course.cup;
  g.shoot(Math.atan2(c.x - b.x, -(c.z - b.z)), 0.5);
  const t0 = performance.now();
  while (G.state === 'roll' && performance.now() - t0 < 10000) await new Promise(r => setTimeout(r, 100));
  await new Promise(r => setTimeout(r, 300));
  return { state: G.state, strokes: G.strokes, ms: Math.round(performance.now() - t0) };
})()`;

async function consoleRun() {
  const [html, outdir] = pos;
  if (!html || !outdir) throw new Error(USAGE);
  const holes = range(opt.holes), jobs = +(opt.jobs || 2), fonts = opt.fonts || 'none';
  const all = [];
  for (const lang of list(opt.langs, 'en')) for (const level of list(opt.levels, 'easy,normal,hard')) for (const size of list(opt.sizes, '1280x800')) {
    const [w, h] = size.split('x').map(Number);
    all.push({ lang, level, w, h, touch: opt.touch === 'on' || (opt.touch !== 'off' && Math.min(w, h) < 600), name: `${lang}-${level}-${w}x${h}` });
  }
  fs.mkdirSync(outdir, { recursive: true });
  const summary = [];
  const browsers = [];
  try {
    await workers(jobs, all.length, async (k, wk) => {
      const set = all[k];
      const b = browsers[wk] ||= await open({ w: set.w, h: set.h, lang: set.lang, touch: set.touch, fonts, gpu: opt.gpu !== 'off', init: [INIT] });
      await boot(b, html, set);
      const lines = b.logs.splice(0).map(l => `boot: ${l}`);
      const played = [];
      for (const i of holes) {
        const r = await b.evaluate(PLAY(i), { timeout: 30000 });
        played.push(`h${pad(i)} ${r?.error ? 'ERROR ' + r.error : `${r.state} ${r.strokes} ${r.ms}ms`}`);
        for (const l of b.logs.splice(0)) lines.push(`h${pad(i)}: ${l}`);
        if (r?.error) lines.push(`h${pad(i)}: [kit] ${r.error}`);
      }
      fs.writeFileSync(path.join(outdir, `${set.name}.log`), lines.join('\n') + (lines.length ? '\n' : ''));
      fs.writeFileSync(path.join(outdir, `_${set.name}.played.txt`), played.join('\n') + '\n');
      summary[k] = `${set.name}: ${holes.length} holes, ${lines.length} console lines`;
      console.log(summary[k]);
    });
  } finally {
    for (const b of browsers) b?.close();
  }
  fs.writeFileSync(path.join(outdir, '_summary.txt'), `${path.resolve(html)} sha256 ${sha(html)}\n${summary.join('\n')}\n`);
}

try {
  if (cmd === 'capture') await capture();
  else if (cmd === 'compare') compare();
  else if (cmd === 'console') await consoleRun();
  else { console.error(USAGE); process.exitCode = 2; }
} catch (e) {
  console.error(e.message || e);
  process.exitCode = 2;
}
