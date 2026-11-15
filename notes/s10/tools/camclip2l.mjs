// camclip2.mjs (s9/int copy of s9/cam/tools/camclip.mjs, adds kind 'sink': a second shot from where a first one stopped 2.5-6 m from the cup, that sinks): clips of the camera following the ball, frame by frame (the page's own loop held, step(1/60)
// driven from here), with per-frame camera stats.
//   node camclip.mjs <golf.html> <outDir> <sizes 390x844,844x390> <holes 0,4,...> [cases long,near,ace,miss] [--noshots] [--calm]
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { open, fileUrl } from '/Users/bytedance/AI/wanwu-gun/.cache/golf-work/s9/cam/repo/tools/golf/cdp.mjs';

const [html, outDir, sizesA, holesA, casesA = 'long,near,ace,miss'] = process.argv.slice(2).filter(a => !a.startsWith('--'));
const NOSHOTS = process.argv.includes('--noshots'), CALM = process.argv.includes('--calm');
const sizes = sizesA.split(',').map(s => s.split('x').map(Number));
const holes = holesA.split(',').map(Number), cases = casesA.split(',');
fs.mkdirSync(outDir, { recursive: true });
const summary = [];
for (const [w, h] of sizes) {
  const b = await open({ w, h, touch: w < 900, lang: process.env.LANGX || 'en' });
  if (CALM) await b.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  await b.navigate(fileUrl(html, process.env.LANGX || 'en'));
  if (!(await b.waitFor('window.__ready === true', 60000))) throw new Error('not ready');
  await b.evaluate(`(() => {
    const g = __golf, G = g.G;
    G.paused = true; // (the page's own loop holds; frames are stepped from the test)
    window.__cc = {
      reset(i) { g.load(i); g.camDone(); G.paused = true; G.t = 0; document.getElementById('banner').hidden = true; document.getElementById('tags').classList.add('out'); },
      cands(kind) {
        const C = G.course, b = G.ball, cup = C.cup, out = [];
        for (let ai = 0; ai < 144; ai++) for (let pi = 1; pi <= 30; pi++) {
          const ang = ai * 2 * Math.PI / 144, p = pi / 30, s = g.simulate(C, b.x, b.z, ang, p, { every: 0.05 });
          let len = 0, close = 99; for (let k = 1; k < s.pts.length; k++) { len += Math.hypot(s.pts[k][0] - s.pts[k - 1][0], s.pts[k][1] - s.pts[k - 1][1]); }
          for (const q of s.pts) close = Math.min(close, Math.hypot(q[0] - cup.x, q[1] - cup.z));
          const end = Math.hypot(s.x - cup.x, s.z - cup.z);
          let score = null;
          if (kind === 'long' && !s.sunk) score = len;
          if (kind === 'near' && !s.sunk && end > 0.5 && end < 1.0 && len > 2.5) score = len;
          if (kind === 'ace' && s.sunk) score = len + p;
          if (kind === 'miss' && !s.sunk && end > 2 && len > 2 && len < 5 && close > 1.5) score = -Math.abs(len - 3.5);
          if (score != null) out.push({ ang, p, score });
        }
        if (kind === 'sink') {
          const firsts = [];
          for (let ai = 0; ai < 72; ai++) for (let pi = 1; pi <= 15; pi++) {
            const ang = ai * 2 * Math.PI / 72, p = pi / 15, s = g.simulate(C, b.x, b.z, ang, p, {});
            const end = Math.hypot(s.x - cup.x, s.z - cup.z);
            if (!s.sunk && end > 2.5 && end < 6) firsts.push({ sx: s.x, sz: s.z, end });
          }
          firsts.sort((a, b) => b.end - a.end);
          for (const f0 of firsts.slice(0, 40)) {
            for (let ai = 0; ai < 144; ai++) for (let pi = 1; pi <= 30; pi++) {
              const ang = ai * 2 * Math.PI / 144, p = pi / 30, s = g.simulate(C, f0.sx, f0.sz, ang, p, {});
              if (s.sunk) out.push({ ang, p, sx: f0.sx, sz: f0.sz, score: f0.end + p });
            }
            if (out.length > 30) break;
          }
        }
        out.sort((a, b) => b.score - a.score);
        // (spread out: no two from the same corner of the grid)
        const pick = [];
        for (const c of out) { if (pick.every(q => Math.abs(q.ang - c.ang) > 0.1 || (q.sx != null && q.sx !== c.sx) || Math.abs(q.p - c.p) > 0.1)) pick.push(c); if (pick.length >= 6) break; }
        return pick;
      },
      prev: null,
      frame(dt) {
        const c = g.engine.camera, cv = g.engine.renderer.domElement, W = cv.clientWidth, H = cv.clientHeight;
        g.step(dt, true);
        const C = G.course, bd = C.bounds, cup = C.cup, bl = G.ball;
        const V = (x, y, z) => { const v = new c.position.constructor(x, y, z).project(c); return [(v.x + 1) / 2 * W, (1 - v.y) / 2 * H]; };
        const fixed = [V((bd.x0 + bd.x1) / 2, 0, (bd.z0 + bd.z1) / 2), V(cup.x, 0, cup.z), V(C.tee.x, 0, C.tee.z)];
        const bar = document.getElementById('bar').getBoundingClientRect().bottom;
        const ballP = V(bl.x, 0.05, bl.z), cupP = fixed[1];
        const inS = p => p[0] >= 0 && p[0] <= W && p[1] >= bar && p[1] <= H;
        const P = c.position.constructor, cov = t => { let x0 = 1, x1 = -1, y0 = 1, y1 = -1; for (let j = 0; j < 8; j++) { const v = new P(t.x + (j & 1 ? t.hx : -t.hx), j & 2 ? t.y : t.y0, t.z + (j & 4 ? t.hz : -t.hz)).project(c); x0 = Math.min(x0, v.x); x1 = Math.max(x1, v.x); y0 = Math.min(y0, v.y); y1 = Math.max(y1, v.y); }
          return Math.max(0, Math.min(1, x1) - Math.max(-1, x0)) * Math.max(0, Math.min(1, y1) - Math.max(-1, y0)) / 4; };
        const tallCov = Math.max(0, ...G.props.filter(p => p.tall).map(p => cov(p.tall)));
        const r = { tallCov, t: G.t, state: G.state, pos: [c.position.x, c.position.y, c.position.z], q: [c.quaternion.x, c.quaternion.y, c.quaternion.z, c.quaternion.w],
          fixed, ball: ballP, cupP, ballIn: G.state === 'sink' || G.state === 'card' || inS(ballP), cupIn: inS(cupP), fit: g.cam.fit, k: g.cam.k, aiming: !!G.aim };
        return r;
      },
    };
  })()`);
  for (const hi of holes) for (const kind of cases) {
    await b.evaluate(`__cc.reset(${hi})`);
    const cands = await b.evaluate(`__cc.cands('${kind}')`);
    let done = null;
    for (const cd of cands.slice(0, 6)) {
      await b.evaluate(`__cc.reset(${hi})`);
      const dir = path.join(outDir, `${w}x${h}`, `h${String(hi + 1).padStart(2, '0')}-${kind}`);
      fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
      // a few frames of aiming first, the camera still
      if (cd.sx != null) await b.evaluate(`(() => { const G = __golf.G; Object.assign(G.ball, { x: ${cd.sx}, z: ${cd.sz}, vx: 0, vz: 0, lip: 0 }); G.from = { x: ${cd.sx}, z: ${cd.sz} }; G.strokes = 1; })()`);
      const rec = [];
      for (let f = 0; f < 12; f++) rec.push(await b.evaluate('__cc.frame(1/60)'));
      await b.evaluate(`__golf.shoot(${cd.ang}, ${cd.p})`);
      let f = 0, after = -1, minDc = 99, endState = null;
      for (; f < 60 * 16; f++) {
        const r = await b.evaluate('__cc.frame(1/60)');
        rec.push(r);
        if (!NOSHOTS && f % 2 === 0) {
          const s = await b.send('Page.captureScreenshot', { format: 'jpeg', quality: 72 });
          fs.writeFileSync(path.join(dir, `f${String(f / 2).padStart(4, '0')}.jpg`), Buffer.from(s.data, 'base64'));
        }
        const st = await b.evaluate(`(() => { const G = __golf.G, c = G.course.cup; return { s: G.state, d: Math.hypot(G.ball.x - c.x, G.ball.z - c.z), home: Math.abs(__golf.cam.x) + Math.abs(__golf.cam.z) + Math.abs(__golf.cam.k), strokes: G.strokes }; })()`);
        minDc = Math.min(minDc, st.d);
        if (after < 0 && (st.s === 'card' || st.s === 'aim')) { after = f; endState = st.s; }
        if (after >= 0 && endState === 'card' && f - after > 50) break;
        if (after >= 0 && endState === 'aim' && ((st.home < 1e-3 && f - after > 10) || f - after > 180)) break;
      }
      const sunk = endState === 'card' && rec.some(r => r.state === 'sink');
      const ok = kind === 'ace' || kind === 'sink' ? sunk : kind === 'near' ? !sunk && minDc < 1.2 : !sunk;
      if (!ok) { fs.rmSync(dir, { recursive: true, force: true }); continue; }
      done = { dir, rec, cd, minDc, sunk };
      break;
    }
    const tag = `${w}x${h} h${hi + 1} ${kind}`;
    if (!done) { summary.push({ tag, none: true }); console.log(tag, 'NO SHOT'); continue; }
    // stats
    const R = done.rec, W0 = w, H0 = h;
    let maxAt = '', maxJerkPx = 0, prevPx = 0, maxV = 0, maxStep = 0, maxAng = 0, maxPx = 0, maxAcc = 0, out = 0, cupOut = 0, fitCut = 0, movedAiming = 0, prevV = 0, maxK = 0, travel = 0, maxTall = 0;
    for (let i = 1; i < R.length; i++) {
      const a = R[i - 1], c = R[i];
      const d = Math.hypot(c.pos[0] - a.pos[0], c.pos[1] - a.pos[1], c.pos[2] - a.pos[2]);
      const dot = Math.abs(a.q.reduce((s, v, k) => s + v * c.q[k], 0));
      const ang = 2 * Math.acos(Math.min(1, dot)) * 180 / Math.PI;
      const vis = (p) => p[0] >= 0 && p[0] <= W0 && p[1] >= 0 && p[1] <= H0;
      const px = Math.max(0, ...c.fixed.map((p, k) => vis(p) && vis(a.fixed[k]) ? Math.hypot(p[0] - a.fixed[k][0], p[1] - a.fixed[k][1]) : 0));
      const v = d * 60;
      if (px > maxPx) maxAt = `f${i} ${c.state} pt${c.fixed.findIndex((p, k) => Math.hypot(p[0] - a.fixed[k][0], p[1] - a.fixed[k][1]) === px)}`;
      maxV = Math.max(maxV, v); maxStep = Math.max(maxStep, d); maxAng = Math.max(maxAng, ang * 60); maxPx = Math.max(maxPx, px);
      if (i > 1) maxAcc = Math.max(maxAcc, Math.abs(v - prevV) * 60);
      if (i > 1) maxJerkPx = Math.max(maxJerkPx, Math.abs(px - prevPx)); prevPx = px;
      prevV = v; travel += d;
      if (!c.ballIn) out++;
      if (!c.cupIn) cupOut++;
      if (c.fit < 0.999) fitCut++;
      if (c.aiming && d > 1e-6) movedAiming++;
      maxK = Math.max(maxK, c.k); maxTall = Math.max(maxTall, c.tallCov);
    }
    const sinkF = R.findIndex(r => r.state === 'sink'), cardF = R.findIndex(r => r.state === 'card');
    const s = { tag, frames: R.length, sunk: done.sunk, minDc: +done.minDc.toFixed(2), camTravel: +travel.toFixed(2), maxCamSpeed: +maxV.toFixed(2), maxCamStep: +maxStep.toFixed(3), maxAccel: +maxAcc.toFixed(1),
      maxAngSpeedDeg: +maxAng.toFixed(3), maxScreenPxPerFrame: +maxPx.toFixed(1), maxAt, maxPxPerFrameChange: +maxJerkPx.toFixed(2), maxZoomIn: +maxK.toFixed(2), tallCovHome: +R[0].tallCov.toFixed(3), maxTallCov: +maxTall.toFixed(3), ballOffFrames: out, cupOffFrames: cupOut, fitCutFrames: fitCut, movedWhileAiming: movedAiming,
      sinkToCardS: sinkF >= 0 && cardF >= 0 ? +((cardF - sinkF) / 60).toFixed(2) : null };
    summary.push(s);
    console.log(JSON.stringify(s));
    if (!NOSHOTS) {
      const base = path.join(outDir, `${w}x${h}-h${String(hi + 1).padStart(2, '0')}-${kind}`);
      execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', '30', '-i', path.join(done.dir, 'f%04d.jpg'), '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '26', base + '.mp4']);
      const n = fs.readdirSync(done.dir).length, every = Math.max(1, Math.ceil(n / 8));
      const sc = w < h ? 'scale=195:-2' : 'scale=320:-2';
      execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', path.join(done.dir, 'f%04d.jpg'), '-vf', `select='not(mod(n\\,${every}))',${sc},tile=8x1:padding=4:color=white`, '-frames:v', '1', base + '-strip.jpg']);
      fs.rmSync(done.dir, { recursive: true, force: true });
    }
  }
  console.log('logs:', b.logs.filter(l => !l.startsWith('[console.log]')).slice(0, 10));
  b.close();
}
fs.writeFileSync(path.join(outDir, 'summary.json'), JSON.stringify(summary, null, 1));
