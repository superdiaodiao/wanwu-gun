// coinbot.mjs: bot.mjs with one more kind of player, the one who goes for the coins first (s7 review, 11-10; made
// from bot.mjs by .cache/golf-work/s7/review/holes/mk-coinbot.mjs, so it plays exactly as bot.mjs does but for this):
// a config with "coinFirst": true plays, while a coin is left, the shot that picks up the most of the coins left
// (within 0.33 m of its run), of those the one with the most neighbours that do too, then the one ending nearest
// the cup; if no shot reaches a coin, the one ending nearest a coin; and for the cup once it has them all.
//   HTML=<golf.html> TRACE=1 node tools/golf/coinbot.mjs <idx> 48 \
//     '[{"key":"easy_casual","level":"easy","guide":7,"capture":3,"person":"casual","seed":101,"coinFirst":true}]' > dir/h<idx>.json
// cointable.mjs <that dir> <a TRACE gate dir of the same N> prints it against the player who goes for the cup.
// The rule for a coin (s7 A1): it lies where a good shot rolls, so the coin-first player's three-star share is within
// 15 points of the cup-only player's on every hole, and never gives up.
// bot.mjs: the gate's bot (recovered 11-06 from the session transcripts: it is the scratchpad's
// yards/tools/diff.mjs of 11-06 10:10, byte for byte in what it plays, plus the fairness tracer's options).
//
// A person who aims by the dotted guide plays one hole N times under each config, in a headless page of
// a built golf.html. Per shot the person: finds the best shot from where the ball lies (a search over 180
// directions x 36 speeds with the game's own simulate(): the drop with the most dropping neighbours, else
// the finish nearest the cup, measured round the walls ("geo") unless GEO=0), then executes it with a
// hand's error: ~A0 deg and V0 of the speed off where the guide shows the way, PENA deg / PENV worse the
// less of the way it shows (the guide's length is the level's), plus a phone's pixels (R 117 px, PX px).
// People: careful { A0 1.5, PENA 4, V0 0.05, PENV 0.10, PX 1.5 }, casual { A0 3, V0 0.10, PX 2.5 },
// perfect (no error). Configs: { key, level, guide m, capture m/s, person, seed, mod: 'still'|'flat', naive }.
// Each config's plays come from its own seeded random stream (11 + idx*7 + seed); the page is shared, so
// a config's results also depend on how many plays ran before it in the same page: compare like with like
// (same N and the same config list).
// Per config it reports: within (% of plays at par or better), p2 (% at par+2 or worse), ace, under,
// mean/over/sd strokes, stars3 (% of plays with 3 stars by main.js finish(): sunk, at par or better, and
// a birdie or every coin on a hole that has coins), gaveUp, worst, hist (strokes - par), shot reasons
// (planDrop, missHand: the hand missed a planned drop, missWorld: a moving thing did, lip, knocked, layup),
// out[] (strokes per play), allCoins[]. Plus the hole as built and, per capture, the tee's ace grid share.
//
// usage: HTML=<golf.html> node tools/golf/bot.mjs <hole index, 0-based> [N=48] [configs json] > out.json
//   env GEO=0         straight-line scoring of misses (the old diff.euclid.mjs) instead of round the walls
//   env PATCH=<file>  the file holds a function expression `H => { ... }`, applied to a copy of the hole's
//                     data (HOLES[idx]) in the page before anything plays: try a map or prop change without
//                     a rebuild (par, name and everything else come from the patched hole)
//   env TIE=human     among equally robust drops pick as a person would: the fewest bounces, then the
//                     direction nearest the cup's bearing, then the middle of that direction's robust
//                     speeds (default: the old rule, the first best cell in direction-then-speed order,
//                     i.e. the softest robust speed; it reproduces every recorded gate number)
//   env EASYPHYS=<js object>  PHYS overrides while a config at the easy level plays, e.g. '{pullR:0.9}'
//   env TRACE=1       also record every shot (from, plan, hand error, end, track) as res.cfg[key][play]
//                     = { strokes, over, shots[] } and res.cup (the fairness tracer's format)
// The gate (gate.mjs) runs this per hole; run it by hand for other configs, e.g. one hole, casual only:
//   HTML=$PWD/.cache/golf-work/base/golf.html node tools/golf/bot.mjs 0 96 \
//     '[{"key":"easy_casual","level":"easy","guide":7,"capture":3,"person":"casual","seed":101}]'
// Run node with cwd = the repo so the Chrome profile lands in .cache/ (tools/chrome.mjs cleans it up).
// It is self-contained on purpose (its own few lines of CDP, not cdp.mjs) so its numbers don't move
// when the screenshot helper changes.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { launchChrome } from '../chrome.mjs';

const sleep = ms => new Promise(r => setTimeout(r, ms));
// the page: headless Chrome at 641x361 (as the old cdp.mjs opened it), driven over CDP
async function open({ w, h }) {
  const flags = [
    '--headless=new', '--remote-debugging-port=0',
    '--no-first-run', '--no-default-browser-check', '--hide-scrollbars', '--mute-audio',
    '--ignore-gpu-blocklist', `--window-size=${w},${h}`,
    '--autoplay-policy=no-user-gesture-required', '--lang=en-US',
  ];
  const { profile, cleanup } = launchChrome(flags);
  let port;
  for (let i = 0; i < 300 && !port; i++) {
    try { port = +fs.readFileSync(path.join(profile, 'DevToolsActivePort'), 'utf8').split('\n')[0]; } catch {}
    if (!port) await sleep(100);
  }
  let targets;
  for (let i = 0; port && i < 150; i++) {
    try { const r = await fetch(`http://127.0.0.1:${port}/json/list`); if (r.ok) { targets = await r.json(); if (targets.some(t => t.type === 'page')) break; } } catch {}
    await sleep(100);
  }
  const page = targets && targets.find(t => t.type === 'page');
  if (!page) { cleanup(); throw new Error('chrome did not start'); }
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let seq = 0;
  const pending = new Map(), listeners = [];
  ws.onmessage = ev => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const { res, rej } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? rej(new Error(msg.error.message)) : res(msg.result);
    } else if (msg.method) listeners.forEach(l => l(msg));
  };
  const send = (method, params = {}) => new Promise((res, rej) => {
    const i = ++seq;
    pending.set(i, { res, rej });
    ws.send(JSON.stringify({ id: i, method, params }));
  });
  await send('Runtime.enable');
  await send('Log.enable');
  await send('Page.enable');
  await send('Network.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false });
  const evaluate = async (expression, { timeout = 600000 } = {}) => {
    const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true, timeout });
    if (r.exceptionDetails) return { error: (r.exceptionDetails.exception && r.exceptionDetails.exception.description) || r.exceptionDetails.text };
    return r.result.value !== undefined ? r.result.value : r.result.description;
  };
  const navigate = async url => {
    const loaded = new Promise(r => { const l = m => { if (m.method === 'Page.loadEventFired') { listeners.splice(listeners.indexOf(l), 1); r(); } }; listeners.push(l); });
    await send('Page.navigate', { url });
    await Promise.race([loaded, sleep(30000)]);
  };
  const waitFor = async (expr, ms = 60000) => {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) {
      if ((await evaluate(`!!(${expr})`)) === true) return true;
      await sleep(150);
    }
    return false;
  };
  const close = () => { try { ws.close(); } catch {} cleanup(); };
  return { evaluate, navigate, waitFor, close };
}

if (!process.env.HTML || !(process.argv[2] >= 0)) {
  console.error('usage: HTML=<golf.html> node tools/golf/bot.mjs <hole index, 0-based> [N=48] [configs json]   (env GEO=0, PATCH=<file>, TIE=human, EASYPHYS=<obj>, TRACE=1)');
  process.exit(2);
}
const HTML = path.resolve(process.env.HTML);
const PATCH = process.env.PATCH ? fs.readFileSync(process.env.PATCH, 'utf8') : '';
const EASYPHYS = process.env.EASYPHYS || '';
const TRACE = process.env.TRACE === '1';
const hi = +process.argv[2], N = +(process.argv[3] || 48);
const LEVELS = { easy: { guide: 7, capture: 3 }, normal: { guide: 1.5, capture: 2.2 }, hard: { guide: 0, capture: 1.6 } };
const CFG = JSON.parse(process.argv[4] || JSON.stringify(Object.entries(LEVELS).map(([k, v]) => ({ key: k, ...v }))));
const PERSON = { careful: { A0: 1.5, PENA: 4, V0: 0.05, PENV: 0.10, PX: 1.5 }, casual: { A0: 3, PENA: 4, V0: 0.10, PENV: 0.10, PX: 2.5 }, perfect: { A0: 0, PENA: 0, V0: 0, PENV: 0, PX: 0 } };
for (const c of CFG) c.person = PERSON[c.person || 'careful'];
const TIMEOUT = 3600000 * Math.max(1, Math.ceil(N * CFG.length / 768)); // (1 h per 768 plays)
const b = await open({ w: 641, h: 361 });
try {
  await b.navigate(pathToFileURL(HTML).href + '?notrack&lang=en');
  if (!(await b.waitFor('window.__ready', 60000))) throw new Error('not ready');
  const r = await b.evaluate(`(async () => {
    const g = __golf, G = g.G, P = g.PHYS, R = 117, CFG = ${JSON.stringify(CFG)}, N = ${N}, hi = ${hi};
    ${PATCH ? `{ const f = (${PATCH}); const H = JSON.parse(JSON.stringify(g.HOLES[hi])); f(H); g.HOLES[hi] = H; }` : '// (no PATCH)'}
    const TR = ${TRACE}, f2 = v => Math.round(v * 100) / 100; // (TRACE=1: every shot recorded)
    const ORIG = JSON.parse(JSON.stringify(g.HOLES[hi]));
    const vmin = P.vmin, curve = P.curve, vmax = P.vmax;
    const pullOf = v => Math.pow(Math.max(0, (v - vmin) / (vmax - vmin)), 1 / curve);
    const speed = q => vmin + (vmax - vmin) * q ** curve;
    P.vmin = 0; P.curve = 1; // (searching and shooting in speed: p = v / vmax)
    const VS = []; for (let v = 0.35; v <= 9.0001; v *= 1.1) VS.push(v); VS.push(9);
    const sim = (x, z, a, v, o = { every: 100 }, C = G.course) => g.simulate(C, x, z, a, v / vmax, o);
    const MOVING = new Set(['fan', 'bike', 'goose', 'cat', 'spinner', 'walker', 'gate', 'door']);
    const apply = mod => {
      const H = JSON.parse(JSON.stringify(ORIG));
      if (mod && mod.includes('still')) {
        H.props = H.props.filter(p => !MOVING.has(p.t)).map(p => p.t === 'windmill' ? { ...p, speed: 1e-9, phase: 0.5 } : p);
      }
      if (mod && mod.includes('flat') && H.ground) {
        if (H.coins === 'tops') H.coins = H.ground.filter(q => q.t === 'hill' && q.h > 0).map(q => q.at);
        delete H.ground;
      }
      g.HOLES[hi] = H;
    };
    const segD = (ax, az, bx, bz, px, pz) => { const dx = bx - ax, dz = bz - az, L = dx * dx + dz * dz; const t = L ? Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / L)) : 0; return Math.hypot(ax + dx * t - px, az + dz * t - pz); };
    const pathLen = pts => { let s = 0; for (let i = 1; i < pts.length; i++) s += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); return s; };
    // how far (x, z) is from the cup along the green: straight when the cup is in plain sight (so plain
    // holes score as before), else round the walls (a grid walk over the course's squares from the cup)
    const GEO = new WeakMap();
    const geoOf = C => {
      let F = GEO.get(C); if (F) return F;
      const W = C.W, H = C.H, cup = C.cup, on = new Set(C.tiles.map(t => t.c + ',' + t.r));
      const isOn = (c, r) => on.has(c + ',' + r);
      const cx = c => c - (W - 1) / 2, cz = r => r - (H - 1) / 2;
      const cellOf = (x, z) => [Math.round(x + (W - 1) / 2), Math.round(z + (H - 1) / 2)];
      const D = new Map(); const [c0, r0] = cellOf(cup.x, cup.z);
      const q = [[Math.hypot(cx(c0) - cup.x, cz(r0) - cup.z), c0, r0]];
      while (q.length) {
        let bi = 0; for (let i = 1; i < q.length; i++) if (q[i][0] < q[bi][0]) bi = i;
        const [d, c, r] = q.splice(bi, 1)[0], k = c + ',' + r;
        if (D.has(k)) continue; D.set(k, d);
        for (let dc = -1; dc <= 1; dc++) for (let dr = -1; dr <= 1; dr++) {
          if (!dc && !dr) continue; const nc = c + dc, nr = r + dr;
          if (!isOn(nc, nr) || D.has(nc + ',' + nr)) continue;
          if (dc && dr && !(isOn(c + dc, r) && isOn(c, r + dr))) continue;
          q.push([d + Math.hypot(dc, dr), nc, nr]);
        }
      }
      const sight = (x, z) => { const L = Math.hypot(cup.x - x, cup.z - z), n = Math.ceil(L / 0.2);
        for (let i = 1; i < n; i++) { const t = i / n, [c, r] = cellOf(x + (cup.x - x) * t, z + (cup.z - z) * t); if (!isOn(c, r)) return false; } return true; };
      F = (x, z) => {
        if (sight(x, z)) return Math.hypot(x - cup.x, z - cup.z);
        const [c, r] = cellOf(x, z); let best = Infinity;
        for (let dc = -1; dc <= 1; dc++) for (let dr = -1; dr <= 1; dr++) { const d = D.get((c + dc) + ',' + (r + dr)); if (d != null) best = Math.min(best, d + Math.hypot(x - cx(c + dc), z - cz(r + dr))); }
        return best === Infinity ? Math.hypot(x - cup.x, z - cup.z) + 99 : best;
      };
      GEO.set(C, F); return F;
    };
    // the best shot from (x, z): the drop with the most dropping neighbours, else the nearest finish
    const search = (x, z, cup, C = G.course) => {
      const dist = ${process.env.GEO === '0' ? 'null' : 'geoOf(G.course)'};
      let best = null, sinks = 0; const grid = [], hitsG = [];
      for (let ai = 0; ai < 180; ai++) for (let vi = 0; vi < VS.length; vi++) {
        const s = sim(x, z, ai * 2 * Math.PI / 180, VS[vi], undefined, C);
        const d = s.sunk ? -1 : dist ? dist(s.x, s.z) : Math.hypot(s.x - cup.x, s.z - cup.z);
        grid[ai * VS.length + vi] = s.sunk; hitsG[ai * VS.length + vi] = s.hits; if (s.sunk) sinks++;
        if (!best || d < best.d) best = { a: ai * 2 * Math.PI / 180, v: VS[vi], d };
      }
      if (best.d < 0) {
        let top = -1; const cand = [];
        for (let ai = 0; ai < 180; ai++) for (let vi = 0; vi < VS.length; vi++) {
          if (!grid[ai * VS.length + vi]) continue;
          let n = 0;
          for (let da = -3; da <= 3; da++) for (let dv = -1; dv <= 1; dv++) { const vj = vi + dv; if (vj >= 0 && vj < VS.length && grid[((ai + da + 180) % 180) * VS.length + vj]) n++; }
          if (n > top) { top = n; best = { a: ai * 2 * Math.PI / 180, v: VS[vi], d: -1, nb: n }; cand.length = 0; }
          if (n === top) cand.push([ai, vi]);
        }
        // TIE=human: among the equally robust cells, as a person would: the fewest bounces, then the
        // direction nearest the cup's bearing, then the middle of that direction's robust speeds
        if (${JSON.stringify(process.env.TIE || '')} === 'human' && cand.length > 1) {
          const bear = Math.atan2(cup.x - x, -(cup.z - z));
          const off = ai => { let d = ai * 2 * Math.PI / 180 - bear; d = Math.atan2(Math.sin(d), Math.cos(d)); return Math.abs(d); };
          cand.sort((p, q) => hitsG[p[0] * VS.length + p[1]] - hitsG[q[0] * VS.length + q[1]] || off(p[0]) - off(q[0]));
          const a0 = cand[0][0], h0 = hitsG[a0 * VS.length + cand[0][1]];
          const vs = cand.filter(c => c[0] === a0 && hitsG[c[0] * VS.length + c[1]] === h0).map(c => c[1]);
          best = { a: a0 * 2 * Math.PI / 180, v: VS[vs[Math.floor((vs.length - 1) / 2)]], d: -1, nb: top };
        }
      }
      best.share = sinks / grid.length;
      return best;
    };
    const searchCoin = (x, z, cup) => {
      const dist = geoOf(G.course), left = G.sweets.filter(s => !s.got), NV = VS.length, M = 180 * NV;
      const pk = new Int8Array(M), snk = new Uint8Array(M), dd = new Float32Array(M), dc = new Float32Array(M);
      let maxP = 0;
      for (let ai = 0; ai < 180; ai++) for (let vi = 0; vi < NV; vi++) {
        const s = sim(x, z, ai * 2 * Math.PI / 180, VS[vi], { every: 0.15 });
        let n = 0, near = Infinity;
        for (const c of left) { let m = Infinity; for (const [px, pz] of s.pts) { const d = Math.hypot(px - c.x, pz - c.z); if (d < m) m = d; } if (m < 0.33) n++; near = Math.min(near, Math.hypot(s.x - c.x, s.z - c.z)); }
        const i = ai * NV + vi; pk[i] = n; snk[i] = s.sunk ? 1 : 0; dd[i] = s.sunk ? (n === left.length ? -1 : 50) : dist(s.x, s.z); dc[i] = near;
        if (n > maxP && !(s.sunk && n < left.length)) maxP = n;
      }
      let best = null, top = -1;
      if (maxP > 0) {
        for (let ai = 0; ai < 180; ai++) for (let vi = 0; vi < NV; vi++) {
          const i = ai * NV + vi; if (pk[i] < maxP || (snk[i] && pk[i] < left.length)) continue;
          let n = 0;
          for (let da = -3; da <= 3; da++) for (let dv = -1; dv <= 1; dv++) { const vj = vi + dv; if (vj >= 0 && vj < NV && pk[((ai + da + 180) % 180) * NV + vj] >= maxP) n++; }
          if (n > top || (n === top && dd[i] < best.dEnd)) { top = n; best = { a: ai * 2 * Math.PI / 180, v: VS[vi], d: dd[i] < 0 ? -1 : dd[i], nb: n, dEnd: dd[i] }; }
        }
      } else {
        for (let ai = 0; ai < 180; ai++) for (let vi = 0; vi < NV; vi++) { const i = ai * NV + vi; if (snk[i]) continue; if (!best || dc[i] < best.dEnd) best = { a: ai * 2 * Math.PI / 180, v: VS[vi], d: dd[i], dEnd: dc[i] }; }
      }
      best.share = 0; return best;
    };
    const res = { hole: hi + 1, name: ORIG.name, par: ORIG.par };
    // the hole as built: size, green, tee to cup, what's on it
    apply('');
    P.capture = 3;
    g.load(hi);
    {
      const C = G.course, t0 = { x: G.ball.x, z: G.ball.z }, cup = C.cup;
      res.W = C.W; res.H = C.H; res.green = C.tiles.length; res.tee2cup = +Math.hypot(cup.x - t0.x, cup.z - t0.z).toFixed(2);
      res.props = ORIG.props.map(p => p.t + (p.id ? ':' + p.id : '')); res.ground = (ORIG.ground || []).map(q => q.t + (q.h != null ? '(' + q.h + ')' : ''));
      res.coins = G.sweets.length;
      if (TR) { res.cup = { x: f2(cup.x), z: f2(cup.z) }; res.cfg = {}; }
      // from the tee, per capture: the share of the (direction, speed) grid that aces; the robust ace's run
      res.tee = {};
      for (const cap of [...new Set(CFG.map(c => c.capture))]) {
        P.capture = cap; g.load(hi);
        const best = search(G.ball.x, G.ball.z, cup);
        const path = sim(G.ball.x, G.ball.z, best.a, best.v, { every: 0.1 });
        const direct = Math.atan2(cup.x - t0.x, -(cup.z - t0.z));
        const straight = VS.some(v => sim(t0.x, t0.z, direct, v).sunk);
        res.tee[cap] = { aceGrid: +(best.share * 100).toFixed(2), aceable: best.d < 0, route: +pathLen(path.pts).toFixed(2), bounces: path.hits, straight, v: +best.v.toFixed(2) };
      }
    }
    for (const cfg of CFG) {
      apply(cfg.mod || '');
      if (cfg.level && g.setLevel) g.setLevel(cfg.level); // (the level's pace for moving things, if the build has it)
      P.capture = cfg.capture;
      ${EASYPHYS ? `{ const E = ${EASYPHYS}; if (!P.__keep) P.__keep = { ...P }; for (const k of Object.keys(E)) P[k] = cfg.level === 'easy' ? E[k] : P.__keep[k]; }` : '// (no EASYPHYS)'}
      const pp = cfg.person;
      let seed = 11 + hi * 7 + (cfg.seed || 0); const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
      const gauss = () => Math.sqrt(-2 * Math.log(rnd() + 1e-9)) * Math.cos(2 * Math.PI * rnd());
      const out = [], gave = [], coinsAll = [];
      const sh = { n: 0, planDrop: 0, drop: 0, missHand: 0, missWorld: 0, lip: 0, knocked: 0, layup: 0, firstPlanDrop: 0 };
      const plays = [];
      for (let k = 0; k < N; k++) {
        g.load(hi);
        for (let w = 0, n = Math.floor(rnd() * 240); w < n; w++) g.step(1 / 60, false);
        let guard = 0, sunkAny = false; const shots = [];
        while (G.state !== 'card' && guard++ < 14) {
          let w = 0; while (G.state !== 'aim' && G.state !== 'card' && w++ < 3000) g.step(1 / 60, false);
          if (G.state === 'card') break;
          const bl = G.ball, cup = G.course.cup, x0 = bl.x, z0 = bl.z;
          const best = cfg.coinFirst && G.got < G.sweets.length ? searchCoin(x0, z0, cup) : search(x0, z0, cup, cfg.naive ? { ...G.course, ground: null, winds: [] } : G.course);
          // how much of the way the guide shows: up to its length, and no further than its second bounce
          const path = sim(x0, z0, best.a, best.v, { every: 0.1, stopAfterHits: 1 });
          const full = sim(x0, z0, best.a, best.v, { every: 0.1 });
          const toBounce = pathLen(path.pts), whole = pathLen(full.pts);
          const seenA = cfg.guide ? Math.min(1, cfg.guide / Math.max(0.01, toBounce)) : 0, seenV = cfg.guide ? Math.min(1, cfg.guide / Math.max(0.01, whole)) : 0;
          const sa = pp.A0 + pp.PENA * (1 - seenA), sv = pp.V0 + pp.PENV * (1 - seenV);
          const L0 = 10 + Math.max(0.045, pullOf(best.v * (1 + gauss() * sv))) * R;
          const L = L0 + gauss() * pp.PX;
          const q = Math.max(0.041, Math.min(1, (L - 10) / R));
          const ang = best.a + gauss() * sa * Math.PI / 180 + Math.atan2(gauss() * pp.PX, L);
          const v = speed(q);
          const st = sim(x0, z0, ang, v);
          const planDrop = best.d < 0;
          if (G.strokes === 0 && planDrop) sh.firstPlanDrop++;
          g.shoot(ang, v / vmax);
          let n = 0, sunk = false, minD = Infinity, px = bl.x, pz = bl.z, tn = 0; const track = TR ? [[f2(x0), f2(z0)]] : null;
          while ((G.state === 'roll' || G.state === 'sink') && n++ < 60 * 40) {
            g.step(1 / 60, false);
            if (G.state === 'sink') sunk = true;
            if (!sunk) minD = Math.min(minD, segD(px, pz, bl.x, bl.z, cup.x, cup.z));
            px = bl.x; pz = bl.z;
            if (TR && ++tn % 6 === 0) track.push([f2(bl.x), f2(bl.z)]);
          }
          if (G.state === 'card' && !sunk && G.strokes < ORIG.par + 5) sunk = true; // (dropped within the last frame)
          sh.n++;
          if (planDrop) sh.planDrop++; else sh.layup++;
          if (sunk) { sh.drop++; sunkAny = true; }
          if (planDrop && !sunk) { if (st.sunk) sh.missWorld++; else sh.missHand++; }
          if (!sunk && minD < 0.3) sh.lip++;
          if (!sunk && !st.sunk && Math.hypot(st.x - bl.x, st.z - bl.z) > 1) sh.knocked++;
          if (TR) shots.push({ from: [f2(x0), f2(z0)], plan: { a: f2(best.a * 180 / Math.PI), v: f2(best.v), d: f2(best.d), nb: best.nb, share: f2(best.share * 100), hits: full.hits, run: f2(whole), end: [f2(full.x), f2(full.z)] },
            sa: f2(sa), sv: f2(sv), exec: { a: f2(ang * 180 / Math.PI), v: f2(v), da: f2((ang - best.a) * 180 / Math.PI), dv: f2(v / best.v - 1) },
            stillSunk: st.sunk, stillEnd: [f2(st.x), f2(st.z)], stillHits: st.hits, end: [f2(bl.x), f2(bl.z)], sunk, minD: f2(minD), track });
        }
        let w = 0; while (G.state === 'sink' && w++ < 200) g.step(1 / 60, false);
        // (all coins: as main.js finish() counts it, false on a hole with no coins)
        out.push(G.strokes); gave.push(!sunkAny); coinsAll.push(G.sweets.length > 0 && G.got >= G.sweets.length);
        if (TR) plays.push({ strokes: G.strokes, over: G.strokes - ORIG.par, shots });
      }
      const par = ORIG.par, M = out.length;
      const mean = out.reduce((a, c) => a + c, 0) / M;
      const sd = Math.sqrt(out.reduce((a, c) => a + (c - mean) ** 2, 0) / M);
      const hist = {}; for (const s of out) hist[s - par] = (hist[s - par] || 0) + 1;
      // 3 stars as the game gives them (main.js finish()): sunk, at par or better, and a birdie or every
      // coin on a hole that has coins
      const stars3 = out.filter((s, i) => !gave[i] && s <= par && (s < par || coinsAll[i])).length;
      res[cfg.key] = {
        within: +(out.filter(s => s <= par).length / M * 100).toFixed(1), mean: +mean.toFixed(2), over: +(mean - par).toFixed(2), sd: +sd.toFixed(2),
        p2: +(out.filter(s => s >= par + 2).length / M * 100).toFixed(1), ace: +(out.filter(s => s === 1).length / M * 100).toFixed(1),
        under: +(out.filter(s => s < par).length / M * 100).toFixed(1), stars3: +(stars3 / M * 100).toFixed(1), gaveUp: gave.filter(Boolean).length, worst: Math.max(...out), hist,
        shots: sh, out, allCoins: coinsAll.map(Number),
      };
      if (TR) res.cfg[cfg.key] = plays;
    }
    g.HOLES[hi] = ORIG;
    if (g.setLevel) g.setLevel('easy');
    return JSON.stringify(res);
  })()`, { timeout: TIMEOUT });
  if (typeof r === 'object' && r.error) throw new Error(r.error);
  console.log(r);
} finally { b.close(); }
