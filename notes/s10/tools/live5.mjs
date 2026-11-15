import { open, sleep } from '/Users/bytedance/AI/wanwu-gun/tools/golf/cdp.mjs';
const OUT = '/Users/bytedance/AI/wanwu-gun/.cache/golf-work/deploy/live';
for (const [lang, tz, w, h] of [['zh', 'Asia/Shanghai', 390, 844], ['en', 'America/New_York', 844, 390]]) {
  const b = await open({ w, h, lang, touch: true });
  try {
    await b.send('Emulation.setTimezoneOverride', { timezoneId: tz });
    await b.navigate(`https://superdiaodiao.github.io/wanwu-gun/golf/?lang=${lang}&nostat=${Date.now()}`);
    await b.waitFor('window.__golf && window.__golf.G && window.__golf.G.state === "aim"', 90000);
    await sleep(2500);
    const info = await b.evaluate(`(() => ({ holes: __golf.HOLES.length, pars: __golf.HOLES.map(h => h.par).join(""), names: __golf.HOLES.slice(0,1).map(h => h.map.length), src: performance.getEntriesByType('resource').map(r => r.name).filter(n => n.includes('golf.')).slice(0, 4) }))()`);
    console.log(lang, tz, JSON.stringify(info));
    for (const i of [27]) {
      await b.evaluate(`__golf.load(${i})`); await sleep(3500);
      await b.screenshot(`${OUT}/live5-${lang}-${w}x${h}-h${String(i + 1).padStart(2, '0')}.png`);
    }
    console.log(lang, 'logs:', JSON.stringify(b.logs));
  } finally { await b.close(); }
}
