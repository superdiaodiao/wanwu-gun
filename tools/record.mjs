#!/usr/bin/env node
// Record a gameplay video frame by frame in headless Chrome (for store pages that want a preview
// clip): the game is stepped exactly 1/fps per frame, so the clip plays in real time however slowly
// it renders, then ffmpeg encodes the frames (H.264, no sound).
//
//   node tools/record.mjs <file|url> <out.mp4> [--w=1920] [--h=1080] [--seconds=18] [--fps=30]
//                         [--setup="js expression run once before recording (may return a promise)"]
//                         [--gl=swiftshader|gpu]
import { spawn, execFileSync } from 'node:child_process';
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
  console.error('usage: node tools/record.mjs <file|url> <out.mp4> [--w=1920] [--h=1080] [--seconds=18] [--fps=30] [--setup=js]');
  process.exit(2);
}
let url = pos[0];
if (!/^(https?|file|data):/.test(url)) {
  const [f, q] = url.split('?');
  url = 'file://' + path.resolve(f) + (q ? '?' + q : '');
}
const out = path.resolve(pos[1]);
const W = +(opt.w || 1920), H = +(opt.h || 1080), FPS = +(opt.fps || 30), N = Math.round(+(opt.seconds || 18) * FPS);
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const cacheDir = path.resolve('.cache');
fs.mkdirSync(cacheDir, { recursive: true });
const profile = fs.mkdtempSync(path.join(cacheDir, 'chrome-'));
const frames = fs.mkdtempSync(path.join(cacheDir, 'frames-'));
const port = 9300 + Math.floor(Math.random() * 600);
const flags = [
  '--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`,
  '--no-first-run', '--no-default-browser-check', '--hide-scrollbars', '--mute-audio',
  '--ignore-gpu-blocklist', `--window-size=${W},${H}`, '--allow-file-access-from-files',
];
if ((opt.gl || 'swiftshader') === 'swiftshader') flags.push('--use-angle=swiftshader', '--enable-unsafe-swiftshader');
const chrome = spawn(CHROME, [...flags, 'about:blank'], { stdio: 'ignore' });
const cleanup = () => {
  try { chrome.kill('SIGKILL'); } catch {}
  setTimeout(() => {
    for (const d of [profile, frames]) { try { fs.rmSync(d, { recursive: true, force: true }); } catch {} }
  }, 300);
};
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
const evaluate = async expression => {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r.result.value;
};

await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
const loaded = new Promise(r => listeners.push(m => { if (m.method === 'Page.loadEventFired') r(); }));
await send('Page.navigate', { url });
await loaded;
while (!(await evaluate('window.__ready === true'))) await sleep(200);
if (opt.setup) console.log('[record] setup:', JSON.stringify(await evaluate(opt.setup)));

const t0 = Date.now();
for (let i = 0; i < N; i++) {
  await evaluate(`window.__wanwu.frame(${1 / FPS})`);
  const shot = await send('Page.captureScreenshot', { format: 'jpeg', quality: 92 });
  fs.writeFileSync(path.join(frames, `${String(i).padStart(5, '0')}.jpg`), Buffer.from(shot.data, 'base64'));
  if (i % FPS === 0) process.stdout.write(`\r[record] ${i}/${N} frames, ${((Date.now() - t0) / 1000).toFixed(0)} s`);
}
console.log(`\r[record] ${N} frames in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
ws.close();
try { chrome.kill('SIGKILL'); } catch {}
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(FPS), '-i', path.join(frames, '%05d.jpg'),
  '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '20', '-preset', 'slow', '-movflags', '+faststart', '-an', out]);
console.log(`[record] saved ${out} (${(fs.statSync(out).size / 1048576).toFixed(1)} MB)`);
cleanup();
setTimeout(() => process.exit(0), 400);
