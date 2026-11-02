// The loader at the end of a published page whose game is a file of its own (wanwu.<hash>.js next to the
// page, golf/golf.<hash>.js): build.mjs writes it into the page.
//
// github.io is slow from mainland China (often 20 KB/s or less), so there (going by the time zone) the
// file comes from jsDelivr, which serves files straight out of this GitHub repo, at the commit that added
// the file (a branch name there is cached for up to 12 hours; a commit is there at once and for good).
// cdn.jsdelivr.net itself is reset on China Mobile, so its other names come first, the ones that got
// through from China in tests (2026-11), and the copy next to the page last. Everywhere else the copy next
// to the page comes first.
//
// One download at a time, never two alongside, so a slow line isn't shared between copies. A place is given
// up (its download stopped) when it fails, or has sent nothing for 6 s (15 s once it has been sending, 30 s
// if it is the last place left); one that is sending but would take over 30 s more is put to the back of
// the queue, once, while there are others to try. Time the page spent in the background or asleep isn't
// counted. The bytes are checked against the file's hash before they run; the loading text shows how far
// it has got, and if nothing works it says so and a tap tries again. Browsers without fetch() streams
// (very old ones) get <script> tags in the same order, checked by the browser (integrity): the next is
// asked for when one fails, or as well after 30 s.
//
// The file sets window[boot] as it starts and refuses to start twice; window[report] says where it came
// from and how long it took ({ from: 'cn-gcore', ms }), for the statistics.
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';

const REPO = 'superdiaodiao/wanwu-gun';
const HOSTS = ['gcore', 'testingcf', 'fastly', 'cdn']; // (jsDelivr's names, in the order tried from China)

/** the game's code as published: refusing to start a second time */
export const wrap = (js, boot) => `if (!window.${boot}) {\nwindow.${boot} = 1;\n${js}\n}\n`;

/**
 * The commit on origin/main that added `path` (the file's path in the repo) with exactly these bytes, for
 * jsDelivr: `asked` if given (a full commit id, checked), else found. '' when it isn't there (yet).
 */
export function cdnRev(path, code, asked = '') {
  if (asked === 'none') return '';
  const git = a => execFileSync('git', a, { encoding: 'buffer', maxBuffer: 1 << 28, stdio: ['ignore', 'pipe', 'ignore'] });
  let rev = asked;
  if (rev && !/^[0-9a-f]{40}$/.test(rev)) throw new Error(`--cdn: a full 40-character commit id, not ${rev} (a branch or short id is cached for hours there)`);
  if (!rev) {
    try { rev = git(['log', 'origin/main', '--format=%H', '--diff-filter=A', '-1', '--', path]).toString().trim(); } catch (e) { rev = ''; }
    if (!rev) return '';
  } else {
    try { git(['merge-base', '--is-ancestor', rev, 'origin/main']); } catch (e) { throw new Error(`--cdn: ${rev} isn't on origin/main, so jsDelivr can't serve it (push it, or git fetch)`); }
  }
  let blob;
  try { blob = git(['show', `${rev}:${path}`]); } catch (e) { throw new Error(`--cdn: ${path} isn't in commit ${rev}`); }
  if (!blob.equals(Buffer.from(code))) throw new Error(`${path} in commit ${rev} isn't the file just built`);
  return rev;
}

/**
 * The <script> for the page. file: its name next to the page; path: in the repo; code: its bytes; rev:
 * from cdnRev ('' = only the copy next to the page); text: the loading text's selector.
 */
export function cdnLoader({ file, path, code, rev, boot, report, text }) {
  const sri = crypto.createHash('sha384').update(code).digest('base64');
  const cdn = rev ? HOSTS.map(h => [h, `https://${h}.jsdelivr.net/gh/${REPO}@${rev}/${path}`]) : [];
  return `<script>(function () {
  // (written by tools/cdn-loader.mjs, which says how it works)
  var FILE = ${JSON.stringify(file)}, SIZE = ${Buffer.byteLength(code)}, SRI = '${sri}', BOOT = '${boot}', REPORT = '${report}', TEXT = ${JSON.stringify(text)};
  var CDN = ${JSON.stringify(cdn)}, STALL = 6000;
  var cn = false, en = false;
  try { cn = /^(Asia\\/(Shanghai|Chongqing|Harbin|Urumqi|Kashgar)|PRC)$/.test(Intl.DateTimeFormat().resolvedOptions().timeZone); } catch (e) {}
  try {
    var q = new URLSearchParams(location.search).get('lang'), st = JSON.parse(localStorage.getItem('wanwu.lang'));
    en = q === 'en' || q === 'zh' ? q === 'en' : st === 'en' || st === 'zh' ? st === 'en' : !/^zh/i.test(navigator.language || '');
  } catch (e) {}
  var here = ['local', FILE];
  var order = cn ? CDN.concat([here]) : [here].concat(CDN.filter(function (c) { return c[0] === 'gcore' || c[0] === 'cdn'; }));
  var streams = !!(window.fetch && window.AbortController && window.ReadableStream && window.Blob && window.URL && URL.createObjectURL && window.crypto && crypto.subtle);
  var t0 = Date.now(), i = 0, ctl = null, cur = null, began = 0, last = 0, got = 0, tick = t0, moved = false, base = null, dog = 0;
  function el() { return document.querySelector(TEXT); }
  function show(p) {
    var e = el();
    if (!e) return;
    if (base === null) base = e.textContent;
    e.textContent = base + ' ' + Math.min(99, Math.floor(p * 100)) + '%';
  }
  function from(c) { window[REPORT] = { from: (cn ? 'cn-' : '') + c[0], ms: Date.now() - t0 }; }
  function fail() {
    clearInterval(dog);
    var e = el();
    if (e) e.textContent = en ? 'The game didn\\'t load. Tap to try again' : '没加载出来，点一下再试';
    document.addEventListener('pointerdown', function () { if (!window[BOOT]) location.reload(); });
  }
  function next() {
    if (window[BOOT]) return;
    if (i >= order.length) return fail();
    var c = order[i++];
    if (streams) get(c); else tag(c);
  }
  function hash(buf) {
    return crypto.subtle.digest('SHA-384', buf).then(function (h) {
      var a = new Uint8Array(h), s = '';
      for (var k = 0; k < a.length; k++) s += String.fromCharCode(a[k]);
      return btoa(s);
    });
  }
  // one place: the bytes as they come (the watch below stops it if they don't), checked, then run
  function get(c) {
    var me = ctl = new AbortController(), parts = [], n = 0;
    cur = c; got = 0; began = last = Date.now();
    fetch(c[1], { signal: me.signal, credentials: 'omit' }).then(function (r) {
      if (!r.ok || !r.body) throw new Error(r.status);
      var rd = r.body.getReader();
      function pump() {
        return rd.read().then(function (x) {
          if (x.done) return;
          parts.push(x.value); n += x.value.length;
          if (me === ctl) { got = n; last = Date.now(); show(n / SIZE); }
          return pump();
        });
      }
      return pump();
    }).then(function () {
      var buf = new Uint8Array(n), o = 0;
      for (var k = 0; k < parts.length; k++) { buf.set(parts[k], o); o += parts[k].length; }
      return hash(buf).then(function (h) {
        if (h !== SRI) throw new Error('integrity');
        if (me !== ctl) return;
        ctl = null;
        clearInterval(dog);
        from(c);
        var s = document.createElement('script');
        s.src = URL.createObjectURL(new Blob([buf], { type: 'text/javascript;charset=utf-8' }));
        document.body.appendChild(s);
      });
    }).catch(function () { if (me === ctl) { ctl = null; next(); } });
  }
  function tag(c) {
    var s = document.createElement('script'), at = i;
    s.src = c[1];
    s.integrity = 'sha384-' + SRI;
    s.crossOrigin = 'anonymous';
    s.onload = function () { if (window[BOOT] && !window[REPORT]) from(c); };
    s.onerror = function () { if (i === at) next(); };
    document.body.appendChild(s);
    if (i < order.length) setTimeout(function () { if (i === at) next(); }, 30000);
  }
  if (streams) dog = setInterval(function () {
    var now = Date.now(), asleep = now - tick - 500;
    if (asleep > 1500) { last += asleep; began += asleep; } // (the page wasn't running: that time doesn't count)
    if (document.hidden) last = now;
    tick = now;
    if (!ctl) return;
    var more = i < order.length;
    if (now - last > (!more ? 30000 : got ? 15000 : STALL)) return ctl.abort();
    if (more && !moved && got && now - began > 8000 && (SIZE - got) * (now - began) > 30000 * got) { moved = true; order.push(cur); ctl.abort(); }
  }, 500);
  next();
})();</script>`;
}
