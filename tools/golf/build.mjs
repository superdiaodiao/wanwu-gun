// Build the golf page from the real tree and keep a copy of it, so that several agents can build at once
// without one copying another's half-written dist/ file.
//
//   node tools/golf/build.mjs <out.html> [--cg] [--tree=<dir>]
//
// Runs `node build.mjs golf` (--cg: `node build.mjs golf-crazygames`) in the repo (--tree: in another copy
// of it, e.g. a scratch copy with a change to try) while holding a lock, then copies dist/golf.html (--cg:
// dist/crazygames-golf/index.html) to <out.html>, written to a temporary name and renamed into place.
// The lock is the directory .cache/golf-work/.buildlock (mkdir is atomic): the one who made it builds,
// everyone else waits; a lock older than 3 minutes is taken to be left over from a build that died, and
// removed. Prints the copy's sha256 and what it was built from (commit, and any files changed from it).
// Never use this for the Roll It All game (`node build.mjs game` must not run in the repo).
import { execFileSync, spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const LOCK = path.join(REPO, '.cache/golf-work/.buildlock');
const STALE = 3 * 60 * 1000;

const args = process.argv.slice(2);
const out = args.find(a => !a.startsWith('--'));
const cg = args.includes('--cg');
const tree = path.resolve((args.find(a => a.startsWith('--tree=')) || '').slice(7) || REPO);
if (!out) { console.error('usage: node tools/golf/build.mjs <out.html> [--cg] [--tree=<dir>]'); process.exit(2); }
if (!fs.existsSync(path.join(tree, 'build.mjs'))) { console.error(`no build.mjs in ${tree}`); process.exit(2); }

const sleep = ms => new Promise(r => setTimeout(r, ms));
let held = false;
function release() { if (held) { held = false; try { fs.rmSync(LOCK, { recursive: true, force: true }); } catch {} } }
process.on('exit', release);
for (const s of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(s, () => process.exit(130));

async function acquire() {
  fs.mkdirSync(path.dirname(LOCK), { recursive: true });
  const t0 = Date.now();
  let said = false;
  for (;;) {
    try {
      fs.mkdirSync(LOCK);
      held = true;
      fs.writeFileSync(path.join(LOCK, 'owner'), `${process.pid} ${new Date().toISOString()} ${cg ? 'golf-crazygames' : 'golf'} ${tree}\n`);
      return;
    } catch (e) {
      if (e.code !== 'EEXIST') throw e;
    }
    let age = 0, who = '';
    try { age = Date.now() - fs.statSync(LOCK).mtimeMs; who = fs.readFileSync(path.join(LOCK, 'owner'), 'utf8').trim(); } catch {}
    if (age > STALE) { console.error(`[golf-build] removing a stale lock (${Math.round(age / 1000)} s old: ${who || '?'})`); try { fs.rmSync(LOCK, { recursive: true, force: true }); } catch {} continue; }
    if (!said) { console.error(`[golf-build] waiting for the build lock (${who || 'being taken'})`); said = true; }
    if (Date.now() - t0 > STALE + 30000) throw new Error('waited too long for the build lock');
    await sleep(300 + Math.random() * 400);
  }
}

await acquire();
let sha;
try {
  const target = cg ? 'golf-crazygames' : 'golf';
  const r = spawnSync(process.execPath, ['build.mjs', target], { cwd: tree, encoding: 'utf8' });
  process.stderr.write(r.stdout + r.stderr);
  if (r.status !== 0) throw new Error(`node build.mjs ${target} failed (exit ${r.status})`);
  const from = path.join(tree, cg ? 'dist/crazygames-golf/index.html' : 'dist/golf.html');
  const dest = path.resolve(out);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const tmp = `${dest}.tmp-${process.pid}`;
  fs.copyFileSync(from, tmp);
  fs.renameSync(tmp, dest);
  sha = crypto.createHash('sha256').update(fs.readFileSync(dest)).digest('hex');
} finally {
  release();
}

// what it was built from
let what = path.relative(REPO, tree) ? `tree ${tree}` : 'repo';
try {
  const head = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: REPO, encoding: 'utf8' }).trim();
  if (tree === REPO) {
    const dirty = execFileSync('git', ['status', '--porcelain', '--', 'src', 'build.mjs', 'tools/cdn-loader.mjs'], { cwd: REPO, encoding: 'utf8' }).split('\n').filter(l => l.trim());
    what += ` at ${head}` + (dirty.length ? ` + ${dirty.length} changed: ${dirty.map(l => l.slice(3)).join(', ')}` : ' (clean)');
  }
} catch {}
console.log(`[golf-build] ${path.resolve(out)}  sha256 ${sha}  (${cg ? 'golf-crazygames' : 'golf'}, ${what})`);
