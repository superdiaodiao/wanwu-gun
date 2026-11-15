// cupvis.mjs <html> <idx,..> [sizes=390x844,844x390,1280x800]: from the hole's home camera, is the cup's rim
// (8 points round it, 0.3 m) hidden behind raised ground? A point is hidden when the line from the camera to
// it passes below the green somewhere (sampled every 2 cm, over green squares only). Prints hidden counts.
import { open, fileUrl } from '/Users/bytedance/AI/wanwu-gun/.cache/golf-work/s10/tA/repo/tools/golf/cdp.mjs';
const [html, list, sz = '390x844,844x390,1280x800'] = process.argv.slice(2);
for (const s of sz.split(',')) {
  const [w, h] = s.split('x').map(Number);
  const b = await open({ w, h, touch: Math.min(w, h) < 600 });
  try {
    await b.navigate(fileUrl(html));
    await b.waitFor('window.__ready === true', 60000);
    for (const idx of list.split(',').map(Number)) {
      const r = await b.evaluate(`(() => {
        const g = __golf; g.load(${idx}); g.camDone && g.camDone(); g.step && g.step(1/60);
        const C = g.G.course, c = g.engine.camera.position, Y = C.Y; let hid = 0, ballHid = 0;
        const test = (x, y, z) => { for (let t = 0.02; t < 0.995; t += 0.002) { const px = c.x + (x - c.x) * t, py = c.y + (y - c.y) * t, pz = c.z + (z - c.z) * t; if (C.onGreen(px, pz) && py < Y(px, pz) - 0.005) return true; } return false; };
        for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4, x = C.cup.x + Math.sin(a) * 0.3, z = C.cup.z + Math.cos(a) * 0.3; if (test(x, Y(x, z) + 0.01, z)) hid++; }
        const bl = g.G.ball; if (test(bl.x, Y(bl.x, bl.z) + 0.14, bl.z)) ballHid++;
        return { idx: ${idx}, cam: [+c.x.toFixed(2), +c.y.toFixed(2), +c.z.toFixed(2)], rimHidden: hid, ballHidden: ballHid };
      })()`);
      console.log(s, JSON.stringify(r));
    }
  } finally { b.close(); }
}
