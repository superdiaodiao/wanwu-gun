// steady.mjs <html> <idx,..> [cpu=4]: per hole at 844x390 (phone), CPU slowed: load, 1.5 s, then rAF gaps for 3 s
// (idle aiming scene with its movers) and for a 3 s shot towards the cup: p50 / p95 / max ms
import { open, fileUrl } from '/Users/bytedance/AI/wanwu-gun/.cache/golf-work/s10/tA/repo/tools/golf/cdp.mjs';
const [html, list, cpu = '4'] = process.argv.slice(2);
const b = await open({ w: 844, h: 390, touch: true });
try {
  await b.navigate(fileUrl(html));
  await b.waitFor('window.__ready === true', 60000);
  await b.send('Emulation.setCPUThrottlingRate', { rate: +cpu });
  for (const idx of list.split(',').map(Number)) {
    const r = await b.evaluate(`(async () => {
      const g = __golf; g.load(${idx}); g.camDone && g.camDone();
      const wait = ms => new Promise(r => setTimeout(r, ms));
      const rec = ms => new Promise(res => { const t = []; let last = 0; const t0 = performance.now(); const f = now => { if (last) t.push(now - last); last = now; if (now - t0 < ms) requestAnimationFrame(f); else res(t); }; requestAnimationFrame(f); });
      const st = a => { const s = [...a].sort((x, y) => x - y); return [s[Math.floor(s.length * 0.5)], s[Math.floor(s.length * 0.95)], s[s.length - 1]].map(v => +v.toFixed(1)); };
      await wait(1500); const idle = await rec(3000);
      const C = g.G.course, B = g.G.ball, a = Math.atan2(C.cup.x - B.x, -(C.cup.z - B.z));
      g.shoot(a, 0.6); const play = await rec(3000);
      return { idx: ${idx}, idle: st(idle), play: st(play) };
    })()`, { timeout: 120000 });
    console.log(JSON.stringify(r));
  }
} finally { b.close(); }
