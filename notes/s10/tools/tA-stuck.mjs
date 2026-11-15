// stuck.mjs <html> <idx,idx..>: the stuck scan. For each green square's middle (and the tee) as a start,
// 120 directions x 5 speeds (p 0.25..1) played out with the game's simulate() (moving things held where
// they are at load), each to a stop: counts finishes off the green (course.onGreen false) and finishes
// with the ball inside a collider (overlap deeper than 2 cm). Prints one JSON line per hole.
import { open, fileUrl } from '/Users/bytedance/AI/wanwu-gun/.cache/golf-work/s10/tA/repo/tools/golf/cdp.mjs';
const [html, list] = process.argv.slice(2);
const b = await open({ w: 844, h: 390 });
try {
  await b.navigate(fileUrl(html));
  await b.waitFor('window.__ready === true', 60000);
  for (const idx of list.split(',').map(Number)) {
    const r = await b.evaluate(`(() => {
      const g = __golf; g.load(${idx}); const C = g.G.course, R = 0.14;
      const inside = (c, x, z) => {
        if (c.off) return 0;
        if (c.kind === 'circle') return R + c.r - Math.hypot(x - c.x, z - c.z);
        if (c.kind === 'seg') { const dx = c.bx - c.ax, dz = c.bz - c.az; const t = Math.max(0, Math.min(1, ((x - c.ax) * dx + (z - c.az) * dz) / (dx * dx + dz * dz))); return R - Math.hypot(x - c.ax - dx * t, z - c.az - dz * t); }
        const cs = Math.cos(c.rot || 0), sn = Math.sin(c.rot || 0), lx = (x - c.x) * cs - (z - c.z) * sn, lz = (x - c.x) * sn + (z - c.z) * cs;
        const qx = Math.max(-c.hx, Math.min(c.hx, lx)), qz = Math.max(-c.hz, Math.min(c.hz, lz));
        if (Math.abs(lx) <= c.hx && Math.abs(lz) <= c.hz) return R + Math.min(c.hx - Math.abs(lx), c.hz - Math.abs(lz));
        return R - Math.hypot(lx - qx, lz - qz);
      };
      const starts = [C.tee, ...C.tiles.map(t => C.at(t.c, t.r))];
      let shots = 0, off = 0, inCol = 0, sunk = 0; const cases = [];
      for (const s of starts) {
        if (C.cols.some(c => inside(c, s.x, s.z) > 0)) continue; // (a start inside something isn't a place a ball can lie)
        for (let i = 0; i < 120; i++) for (const p of [0.25, 0.45, 0.65, 0.85, 1]) {
          const a = (i / 120) * Math.PI * 2, res = g.simulate(C, s.x, s.z, a, p, { maxT: 20, every: 99 });
          shots++;
          if (res.sunk) { sunk++; continue; }
          const o = !C.onGreen(res.x, res.z), ic = C.cols.some(c => inside(c, res.x, res.z) > 0.02);
          if (o) off++; if (ic) inCol++;
          if ((o || ic) && cases.length < 8) cases.push({ from: [+s.x.toFixed(2), +s.z.toFixed(2)], a: +a.toFixed(2), p, end: [+res.x.toFixed(2), +res.z.toFixed(2)], o, ic });
        }
      }
      return { idx: ${idx}, name: g.HOLES[${idx}].name, starts: starts.length, shots, off, inCol, sunk, cases };
    })()`, { timeout: 600000 });
    console.log(JSON.stringify(r));
  }
} finally { b.close(); }
