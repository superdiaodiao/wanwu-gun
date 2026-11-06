// A small driver for a headless Chrome over the DevTools protocol, for the golf tests (shots.mjs, gate.mjs
// and one-off scripts). Chrome is started by tools/chrome.mjs launchChrome, so it never outlives the
// script and its profile (in <repo>/.cache/chrome-*) is cleaned up however the script ends.
//
//   import { open, fileUrl } from '<repo>/tools/golf/cdp.mjs';
//   const b = await open({ w: 390, h: 844, dpr: 1, lang: 'zh', touch: true });
//   await b.navigate('.cache/golf-work/base/golf.html');     // a path: file://<abs>?notrack&lang=zh
//   await b.navigate('file:///…/golf.html?lang=en');          // a URL: as it is. Always a fresh page, at
//                                                             //  its load event (the same page with only its
//                                                             //  #hash changed goes by way of about:blank)
//   await b.waitFor('window.__ready === true', 30000);        // true, or false on timeout
//   await b.evaluate('__golf.G.hole');                        // the value (promises awaited), or { error }
//   await b.evaluate('slowThing()', { timeout: 120000 });     // default timeout 60 s, then { error: 'timeout …' }
//   await b.send('Input.dispatchTouchEvent', { … });          // raw CDP: its result; throws on a protocol error
//   await b.screenshot('x.png');                              // the page; or clip { x, y, width, height }
//   b.logs                                                    // ['[console.error] …', '[exception] …', '[log.warning] …']
//   b.close();
//
// open(options):
//   w, h        viewport in CSS px (default 1280 x 800)
//   dpr         device pixel ratio (default 1)
//   lang        'en' | 'zh' (default 'en'): the ?lang= of a path given to navigate, and Chrome's --lang
//   touch       a phone: touch events, (pointer: coarse), mobile viewport (default false)
//   gpu         true (default): the Mac's GPU; false: SwiftShader (software, slower)
//   fonts       the Google web fonts: 'none' (default: an empty stylesheet, so system fonts at once, the
//               same every run and offline), 'cache' (the real fonts from .cache/golf-work/fonts, fetched
//               once), 'net' (untouched: from the network, whenever they arrive)
//   init        scripts run in every new document before the page's own (Page.addScriptToEvaluateOnNewDocument)
//   extraFlags  more Chrome flags
// Also on the returned object: setViewport({ w, h, dpr, touch }) to change size/phone-ness in place,
// addInit(source), listeners (functions called with every CDP event message), sleep(ms), shot (= screenshot),
// version (Chrome's), chrome (the child process), profile (its profile dir).
//
// logs: every console call ([console.log] too, so a page that should be silent can be checked for 0
// lines), uncaught exceptions and unhandled rejections ([exception]), and Chrome's own messages about the
// page ([log.<level>]: WebGL errors, failed loads, CSP, …). Clear it with b.logs.length = 0.
//
// Run scripts with the repo as the working directory if you can; if not, Chrome's profile still lands in
// <repo>/.cache (launchChrome resolves '.cache' from the working directory, so open() switches to the repo
// for that moment). Keep to 2 Chromes per agent at once.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { launchChrome } from '../chrome.mjs';

export const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const sleep = ms => new Promise(r => setTimeout(r, ms));

/** the page at html (a path) as the tests load it: file://<abs>?notrack&lang=<lang> (notrack: no stats) */
export function fileUrl(html, lang = 'en') {
  return `${pathToFileURL(path.resolve(html)).href}?notrack&lang=${lang}`;
}

const text = a => a.value !== undefined ? (typeof a.value === 'string' ? a.value : JSON.stringify(a.value)) : a.description ?? a.type;

// ---- the web fonts (Google Fonts: Baloo 2, and the Chinese faces for zh) ----
// 'none': the stylesheet is answered with an empty one, so the page uses its fallback (system) fonts at
// once, the same every time and with no network; 'cache': the real fonts, from FONT_CACHE (fetched from
// Google once, the .cn mirror's addresses mapped to .com); 'net': left alone.
export const FONT_CACHE = path.join(REPO, '.cache/golf-work/fonts');
const FONT_HOSTS = [{ urlPattern: '*://fonts.googleapis.*/*' }, { urlPattern: '*://fonts.gstatic.*/*' }];
async function serveFonts(send, listeners, mode, logs) {
  await send('Fetch.enable', { patterns: FONT_HOSTS });
  listeners.push(async m => {
    if (m.method !== 'Fetch.requestPaused') return;
    const { requestId, request } = m.params;
    const css = /fonts\.googleapis\./.test(request.url);
    try {
      if (mode === 'none') {
        if (css) await send('Fetch.fulfillRequest', { requestId, responseCode: 200, responseHeaders: [{ name: 'Content-Type', value: 'text/css' }], body: '' });
        else await send('Fetch.failRequest', { requestId, errorReason: 'BlockedByClient' });
        return;
      }
      const url = request.url.replace('fonts.googleapis.cn', 'fonts.googleapis.com').replace('fonts.gstatic.cn', 'fonts.gstatic.com');
      const key = crypto.createHash('sha1').update(url).digest('hex');
      const bin = path.join(FONT_CACHE, key + '.bin'), meta = path.join(FONT_CACHE, key + '.json');
      if (!fs.existsSync(bin)) {
        const r = await fetch(url, { headers: { 'User-Agent': request.headers['User-Agent'] || 'Mozilla/5.0 Chrome/156' } });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        let body = Buffer.from(await r.arrayBuffer());
        if (css) body = Buffer.from(body.toString('utf8').replaceAll('fonts.gstatic.cn', 'fonts.gstatic.com'));
        fs.mkdirSync(FONT_CACHE, { recursive: true });
        fs.writeFileSync(bin + '.tmp' + process.pid, body); fs.renameSync(bin + '.tmp' + process.pid, bin);
        fs.writeFileSync(meta, JSON.stringify({ url, type: r.headers.get('content-type') }));
      }
      const type = JSON.parse(fs.readFileSync(meta, 'utf8')).type || (css ? 'text/css' : 'font/woff2');
      await send('Fetch.fulfillRequest', { requestId, responseCode: 200, body: fs.readFileSync(bin).toString('base64'),
        responseHeaders: [{ name: 'Content-Type', value: type }, { name: 'Access-Control-Allow-Origin', value: '*' }] });
    } catch (e) {
      logs.push(`[cdp] font ${request.url.slice(0, 120)}: ${e.message}`);
      send('Fetch.failRequest', { requestId, errorReason: 'Failed' }).catch(() => {});
    }
  });
}

export async function open({ w = 1280, h = 800, dpr = 1, lang = 'en', touch = false, gpu = true, fonts = 'none', init = [], extraFlags = [] } = {}) {
  const flags = [
    '--headless=new', '--remote-debugging-port=0', '--no-first-run', '--no-default-browser-check', '--hide-scrollbars',
    '--mute-audio', '--allow-file-access-from-files', '--ignore-gpu-blocklist', `--window-size=${w},${h}`,
    `--lang=${lang === 'zh' ? 'zh-CN' : 'en-US'}`,
    '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows',
    ...(gpu ? [] : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader']),
    ...extraFlags,
  ];
  // (launchChrome puts the profile in <cwd>/.cache: it should be the repo's)
  const cwd = process.cwd();
  let launched;
  try { process.chdir(REPO); launched = launchChrome(flags); } finally { process.chdir(cwd); }
  const { chrome, profile, cleanup } = launched;

  // the port Chrome picked, then the page's websocket
  const portFile = path.join(profile, 'DevToolsActivePort');
  let port = 0;
  for (let i = 0; i < 300 && !port; i++) {
    try { port = +fs.readFileSync(portFile, 'utf8').split('\n')[0]; } catch {}
    if (!port) await sleep(50);
    if (chrome.exitCode != null) break;
  }
  if (!port) { cleanup(); throw new Error('cdp: Chrome did not start (no DevToolsActivePort)'); }
  let target, version = '';
  for (let i = 0; i < 100 && !target; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      target = list.find(t => t.type === 'page');
      version = (await (await fetch(`http://127.0.0.1:${port}/json/version`)).json()).Browser;
    } catch {}
    if (!target) await sleep(100);
  }
  if (!target) { cleanup(); throw new Error('cdp: no page target'); }
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('cdp: websocket failed')); });

  let seq = 0, closed = false;
  const pending = new Map(), listeners = [], logs = [];
  ws.onmessage = ev => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.rej(new Error(`cdp ${p.method}: ${m.error.message}`)) : p.res(m.result); }
    else if (m.method) for (const l of [...listeners]) { try { l(m); } catch (e) { console.error('cdp listener', e); } }
  };
  ws.onclose = () => { closed = true; for (const p of pending.values()) p.rej(new Error(`cdp ${p.method}: connection closed`)); pending.clear(); };
  const send = (method, params = {}) => new Promise((res, rej) => {
    if (closed) return rej(new Error(`cdp ${method}: connection closed`));
    const id = ++seq;
    pending.set(id, { res, rej, method });
    ws.send(JSON.stringify({ id, method, params }));
  });

  listeners.push(m => {
    if (m.method === 'Runtime.exceptionThrown') {
      const d = m.params.exceptionDetails;
      logs.push('[exception] ' + (d.exception?.description || d.text) + (d.url ? ` (${path.basename(d.url.split('?')[0])}:${d.lineNumber + 1})` : ''));
    } else if (m.method === 'Runtime.consoleAPICalled') {
      logs.push(`[console.${m.params.type}] ` + m.params.args.map(text).join(' '));
    } else if (m.method === 'Log.entryAdded') {
      const e = m.params.entry;
      logs.push(`[log.${e.level}] ${e.source}: ${e.text}` + (e.url ? ` (${e.url.split('?')[0].slice(-60)})` : ''));
    }
  });
  await send('Runtime.enable');
  await send('Page.enable');
  await send('Log.enable');
  if (fonts !== 'net') await serveFonts(send, listeners, fonts, logs);

  let view = null;
  async function setViewport({ w: W = view?.w ?? w, h: H = view?.h ?? h, dpr: D = view?.dpr ?? dpr, touch: T = view?.touch ?? touch } = {}) {
    await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: D, mobile: !!T });
    await send('Emulation.setTouchEmulationEnabled', T ? { enabled: true, maxTouchPoints: 5 } : { enabled: false });
    await send('Emulation.setEmitTouchEventsForMouse', { enabled: false });
    view = { w: W, h: H, dpr: D, touch: !!T };
  }
  await setViewport({ w, h, dpr, touch });
  const addInit = source => send('Page.addScriptToEvaluateOnNewDocument', { source });
  for (const s of [].concat(init)) await addInit(s);

  async function evaluate(expression, { timeout = 60000 } = {}) {
    let timer;
    const call = send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true, userGesture: true })
      .then(r => r.exceptionDetails ? { error: r.exceptionDetails.exception?.description || r.exceptionDetails.text } : r.result.value)
      .catch(e => ({ error: e.message }));
    const out = await Promise.race([call, new Promise(r => { timer = setTimeout(() => r({ error: `timeout after ${timeout} ms` }), timeout); })]);
    clearTimeout(timer);
    return out;
  }

  const b = {
    send, evaluate, logs, listeners, sleep, setViewport, addInit, version, chrome, profile,
    get view() { return { ...view }; },
    /** go to url (or an html path, as fileUrl(path, lang)); resolves at its load event (or after 60 s) */
    async navigate(url) {
      if (!/^[a-z]+:/i.test(url)) url = fileUrl(url, lang);
      const go = async to => {
        let done, timer;
        const loaded = new Promise(r => { done = m => { if (m.method === 'Page.loadEventFired') r(true); }; listeners.push(done); });
        try {
          const r = await send('Page.navigate', { url: to });
          if (r.errorText) throw new Error(`cdp navigate ${to}: ${r.errorText}`);
          if (!r.loaderId) return false; // (the same page with only its #hash changed: no new page, no load)
          await Promise.race([loaded, new Promise(res => { timer = setTimeout(res, 60000); })]);
          return true;
        } finally { clearTimeout(timer); listeners.splice(listeners.indexOf(done), 1); }
      };
      // (always a fresh page: by way of a blank one, if it would only have scrolled to the #hash)
      if (!(await go(url))) { await go('about:blank'); await go(url); }
      return url;
    },
    /** poll expr every 100 ms until it is truthy (true) or ms have passed (false) */
    async waitFor(expr, ms = 30000) {
      const end = Date.now() + ms;
      do {
        const v = await evaluate(`(() => { try { return !!(${expr}); } catch (e) { return false; } })()`, { timeout: Math.max(1000, end - Date.now()) });
        if (v === true) return true;
        await sleep(100);
      } while (Date.now() < end);
      return false;
    },
    /** a PNG of the page (clip in CSS px: { x, y, width, height }) to file; returns file */
    async screenshot(file, clip) {
      const r = await send('Page.captureScreenshot', clip ? { format: 'png', clip: { scale: 1, ...clip } } : { format: 'png' });
      fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
      fs.writeFileSync(file, Buffer.from(r.data, 'base64'));
      return file;
    },
    close() { if (!closed) { try { ws.close(); } catch {} } closed = true; cleanup(); },
  };
  b.shot = b.screenshot;
  return b;
}
