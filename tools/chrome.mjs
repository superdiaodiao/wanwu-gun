// Starts the headless Chrome that shot.mjs and record.mjs drive, and makes sure it never outlives
// the script: it is killed when the script ends however it ends (done, error, Ctrl-C, killed by a
// timeout), and since a script killed outright (SIGKILL) gets no say, every run also first clears
// up after earlier runs whose script is gone — their Chrome left rendering the game in the
// background would keep the CPU and the fans busy for days.
import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const OWNER = 'owner.pid'; // in each profile: the script it belongs to

function alive(pid) {
  try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; }
}

/** kill the Chrome of any earlier run whose script has gone, and delete its profile */
function sweep(cacheDir) {
  for (const name of fs.readdirSync(cacheDir)) {
    if (!name.startsWith('chrome-')) continue;
    const dir = path.join(cacheDir, name);
    let pid;
    try { pid = +fs.readFileSync(path.join(dir, OWNER), 'utf8'); } catch { continue; } // not one of ours
    if (alive(pid)) continue;
    try { execFileSync('pkill', ['-KILL', '-f', '--', `--user-data-dir=${dir}`], { stdio: 'ignore' }); } catch {}
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
  }
}

/** Chrome with these flags and a throwaway profile of its own; returns { chrome, profile, cleanup } */
export function launchChrome(flags, { extraDirs = [] } = {}) {
  const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  const cacheDir = path.resolve('.cache');
  fs.mkdirSync(cacheDir, { recursive: true });
  sweep(cacheDir);
  const profile = fs.mkdtempSync(path.join(cacheDir, 'chrome-'));
  fs.writeFileSync(path.join(profile, OWNER), String(process.pid));
  const chrome = spawn(CHROME, [`--user-data-dir=${profile}`, ...flags, 'about:blank'], { stdio: 'ignore' });
  const kill = () => { try { chrome.kill('SIGKILL'); } catch {} };
  const remove = () => { for (const d of [profile, ...extraDirs]) { try { fs.rmSync(d, { recursive: true, force: true }); } catch {} } };
  // however the script ends; a signal is turned into an ordinary exit so this still runs
  process.on('exit', () => { kill(); remove(); });
  for (const s of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(s, () => process.exit(130));
  return { chrome, profile, cleanup: () => { kill(); setTimeout(remove, 300); } };
}
