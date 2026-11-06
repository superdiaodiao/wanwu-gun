// Prove the golf work left Roll It All (万物皆可滚, the other game in this repo, which shares src/audio,
// src/core, src/i18n, …) byte for byte as it was: build it from a scratch copy of the working tree and
// compare its files' sha256 with those recorded before.
//
//   node tools/golf/rollcheck.mjs                 compare with .cache/golf-work/base/rollitall.sha
//   node tools/golf/rollcheck.mjs --sha=<file>    compare with another record
//   node tools/golf/rollcheck.mjs --write [--sha=<file>]   record (the 'before')
//   [--tree=<dir>]  check another copy of the repo (e.g. a git worktree) instead of this one (the default)
//   [--keep]  leave the scratch copy (.cache/golf-work/rollcheck-<pid>/) instead of removing it
//
// The copy: rsync -a --exclude .git --exclude dist --exclude .claude --exclude .cache <tree>/ <copy>/, then
// `node build.mjs game` and `node build.mjs crazygames` in it (never in the repo itself: the game's build
// writes its pages to dist/ and npm run build copies them to the repo root). Recorded: every file under
// the copy's dist/, except dist/crazygames.zip, whose bytes hold the time it was made; for it, the sha256 of
// the index.html inside, as "dist/crazygames.zip:index.html". (dist/site/index.html, outside the repo's git,
// never finds its .js on origin/main, so it is the page without jsDelivr: the same every time, though not
// the one a release from the repo makes.) Exit 0 if everything matches, 1 if not.
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const args = process.argv.slice(2);
const write = args.includes('--write'), keep = args.includes('--keep');
const shaFile = path.resolve((args.find(a => a.startsWith('--sha=')) || '').slice(6) || path.join(REPO, '.cache/golf-work/base/rollitall.sha'));
const tree = path.resolve((args.find(a => a.startsWith('--tree=')) || '').slice(7) || REPO);
if (!fs.existsSync(path.join(tree, 'build.mjs'))) { console.error(`no build.mjs in ${tree}`); process.exit(2); }
const copy = path.join(REPO, `.cache/golf-work/rollcheck-${process.pid}`);
const sha = buf => crypto.createHash('sha256').update(buf).digest('hex');

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const f = path.join(dir, e.name);
    if (e.isDirectory()) walk(f, out); else out.push(f);
  }
  return out;
}

if (!keep) process.on('exit', () => { try { fs.rmSync(copy, { recursive: true, force: true }); } catch {} });
for (const s of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(s, () => process.exit(130));

if (tree !== REPO) console.log(`tree: ${tree}`);
execFileSync('rsync', ['-a', '--exclude', '.git', '--exclude', 'dist', '--exclude', '.claude', '--exclude', '.cache', tree + '/', copy + '/']);
for (const target of ['game', 'crazygames']) execFileSync(process.execPath, ['build.mjs', target], { cwd: copy, stdio: ['ignore', 'ignore', 'inherit'] });

const lines = [];
for (const f of walk(path.join(copy, 'dist')).map(f => path.relative(copy, f)).sort()) {
  if (f === 'dist/crazygames.zip') lines.push(`${sha(execFileSync('unzip', ['-p', path.join(copy, f), 'index.html'], { maxBuffer: 1 << 28 }))}  ${f}:index.html`);
  else lines.push(`${sha(fs.readFileSync(path.join(copy, f)))}  ${f}`);
}

if (write) {
  fs.mkdirSync(path.dirname(shaFile), { recursive: true });
  fs.writeFileSync(shaFile, lines.join('\n') + '\n');
  console.log(`recorded ${lines.length} files of Roll It All to ${shaFile}`);
  for (const l of lines) console.log('  ' + l);
} else {
  const want = new Map(fs.readFileSync(shaFile, 'utf8').trim().split('\n').map(l => { const [h, ...f] = l.split('  '); return [f.join('  '), h]; }));
  const got = new Map(lines.map(l => { const [h, ...f] = l.split('  '); return [f.join('  '), h]; }));
  let bad = 0;
  for (const [f, h] of want) {
    const g = got.get(f);
    if (g === h) console.log(`  same     ${f}`);
    else { bad++; console.log(g ? `  CHANGED  ${f}  ${h.slice(0, 12)} -> ${g.slice(0, 12)}` : `  MISSING  ${f}`); }
  }
  for (const f of got.keys()) if (!want.has(f)) { bad++; console.log(`  NEW      ${f}`); }
  console.log(bad ? `Roll It All: ${bad} file(s) differ from ${shaFile}` : `Roll It All: byte-identical to ${shaFile} (${want.size} files)`);
  process.exitCode = bad ? 1 : 0;
}
if (keep) console.log(`(copy kept at ${copy})`);
