#!/usr/bin/env node
// Headless Chrome screenshot + console capture over the DevTools protocol (no dependencies).
//
//   node tools/shot.mjs <file|url> <out.png> [--w=1600] [--h=1000] [--wait=1200] [--full]
//                       [--ready="window.__ready===true"] [--eval="js expression"] [--gl=swiftshader|gpu]
//
// Prints the saved path, then every console message / exception from the page.
// Waits for the page's readiness expression (default window.__ready === true) before capturing.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const argv = process.argv.slice(2);
const pos = argv.filter(a => !a.startsWith('--'));
const opt = {};
for (const a of argv.filter(a => a.startsWith('--'))) {
  const i = a.indexOf('=');
  if (i < 0) opt[a.slice(2)] = true;
  else opt[a.slice(2, i)] = a.slice(i + 1);
}
if (pos.length < 2) {
  console.error('usage: node tools/shot.mjs <file|url> <out.png> [--w=1600] [--h=1000] [--wait=1200] [--full] [--eval=js]');
  process.exit(2);
}
let url = pos[0];
if (!/^(https?|file|data):/.test(url)) {
  const [f, q] = url.split('?');
  url = 'file://' + path.resolve(f) + (q ? '?' + q : '');
}
const out = path.resolve(pos[1]);
const W = +(opt.w || 1600), H = +(opt.h || 1000), WAIT = +(opt.wait || 1200), TIMEOUT = +(opt.timeout || 90000);
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const cacheDir = path.resolve('.cache');
fs.mkdirSync(cacheDir, { recursive: true });
const profile = fs.mkdtempSync(path.join(cacheDir, 'chrome-'));
const port = 9300 + Math.floor(Math.random() * 600);
const flags = [
  '--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`,
  '--no-first-run', '--no-default-browser-check', '--hide-scrollbars', '--mute-audio',
  '--ignore-gpu-blocklist', `--window-size=${W},${H}`, '--allow-file-access-from-files',
  '--autoplay-policy=no-user-gesture-required',
];
if ((opt.gl || 'swiftshader') === 'swiftshader') flags.push('--use-angle=swiftshader', '--enable-unsafe-swiftshader');
const chrome = spawn(CHROME, [...flags, 'about:blank'], { stdio: 'ignore' });
const cleanup = () => {
  try { chrome.kill('SIGKILL'); } catch {}
  setTimeout(() => { try { fs.rmSync(profile, { recursive: true, force: true }); } catch {} }, 300);
};
const timer = setTimeout(() => { console.error('[shot] timeout'); cleanup(); process.exit(3); }, TIMEOUT);
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function getJSON(p) {
  for (let i = 0; i < 150; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}${p}`);
      if (r.ok) return await r.json();
    } catch {}
    await sleep(100);
  }
  throw new Error('chrome did not start');
}

const targets = await getJSON('/json/list');
const page = targets.find(t => t.type === 'page');
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let seq = 0;
const pending = new Map();
const listeners = [];
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

const logs = [];
listeners.push(m => {
  if (m.method === 'Runtime.consoleAPICalled') {
    const args = m.params.args.map(a => a.value !== undefined ? (typeof a.value === 'string' ? a.value : JSON.stringify(a.value)) : (a.description || a.type)).join(' ');
    logs.push(`[console.${m.params.type}] ${args}`);
  }
  if (m.method === 'Runtime.exceptionThrown') {
    const d = m.params.exceptionDetails;
    logs.push(`[exception] ${(d.exception && d.exception.description) || d.text} @${d.url || ''}:${d.lineNumber}:${d.columnNumber}`);
  }
  if (m.method === 'Log.entryAdded') {
    const e = m.params.entry;
    if (e.level === 'error' || e.level === 'warning') logs.push(`[log.${e.level}] ${e.text} ${e.url || ''}`);
  }
});

await send('Runtime.enable');
await send('Log.enable');
await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
const loaded = new Promise(r => listeners.push(m => { if (m.method === 'Page.loadEventFired') r(); }));
await send('Page.navigate', { url });
await loaded;

const readyExpr = opt.ready || 'window.__ready === true';
const t0 = Date.now();
let ready = false;
while (Date.now() - t0 < TIMEOUT - 8000) {
  const r = await send('Runtime.evaluate', { expression: `!!(${readyExpr})`, returnByValue: true });
  if (r.result.value) { ready = true; break; }
  await sleep(200);
}
if (!ready) logs.push('[shot] readiness expression never became true: ' + readyExpr);
if (opt.eval) {
  const r = await send('Runtime.evaluate', { expression: opt.eval, returnByValue: true, awaitPromise: true });
  logs.push(`[eval] ${JSON.stringify(r.result.value !== undefined ? r.result.value : r.result.description)}`);
}
await sleep(WAIT);
if (opt.full) {
  const r = await send('Runtime.evaluate', { expression: 'JSON.stringify([document.documentElement.scrollWidth, document.documentElement.scrollHeight])', returnByValue: true });
  const [, sh] = JSON.parse(r.result.value);
  await send('Emulation.setDeviceMetricsOverride', { width: W, height: Math.min(sh, 16000), deviceScaleFactor: 1, mobile: false });
  await send('Runtime.evaluate', { expression: 'window.dispatchEvent(new Event("resize"))' });
  await sleep(Math.max(1000, WAIT));
}
const shot = await send('Page.captureScreenshot', { format: 'png' });
fs.writeFileSync(out, Buffer.from(shot.data, 'base64'));
console.log(`[shot] saved ${out}`);
for (const l of logs) console.log(l);
clearTimeout(timer);
ws.close();
cleanup();
setTimeout(() => process.exit(0), 400);
