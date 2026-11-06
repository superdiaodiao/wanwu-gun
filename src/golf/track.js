// Anonymous play statistics for playtests of the golf page on the site, as 百度统计 events (the same
// site id and the same rules as the main game's, src/game/track.js): how far people get, how each hole
// goes, and above all how long they keep playing. Nothing about who is playing is sent. Only the site
// build at its own address reports (not this computer, not the CrazyGames build); ?notrack switches it
// off (for playing yourself), ?trackdebug logs every event to the console.
//
// Each event goes out as a made-up page, /wanwu-gun/golf/e/<action>/<label>, counted in 访问分析 →
// 受访页面 (the free plan of 百度统计 doesn't show the events themselves, category 'golf'). The events:
//   visit   new / same-day / day-N / day-7+ (days since the first visit on this device)
//   lang    zh / en
//   hole    h<n>: hole n begun, the first time since the page was opened (how far people get)
//   retry   h<n>: hole n begun again
//   done    h<n>/ace|under|par|over|skip|let-off, then /normal or /hard when not played easy (value:
//           strokes)
//   level   easy|normal|hard: the difficulty changed in the menu
//   tip     row: the very first card's row of the three difficulties shown; under|yard: the card offered a
//           harder difficulty, at the easy one (after a hole under par from hole 4 on, once a visit on the
//           first three visits; on the yard's page after a yard all but swept); open: that offer tapped
//           (it opens the difficulty's page)
//   lvchip  open: the difficulty at the top right tapped (its page)
//   lvpick  menu|map|chip|card: where a difficulty was picked (with level/<l> as before)
//   map     hud|menu|card: the map of the yards opened from the stars at the top, the pause menu, or the
//           yard's page
//   medal   <yard>/bronze|silver|gold: a yard's medal won (bronze: every hole played; silver 18 ★; gold 27 ★)
//   finale  every yard played through, the first time
//   yard    <n>: yard n's whole round played
//   time    1m 3m 5m 10m 15m 20m 30m: playing that long since the page was opened (counted while the
//           page is in front and something was pressed in the last minute)
//   leave   h<n>/<how long played by then>: the page put away (another tab, the phone locked)
//   fps     touch|desk/<frames a second over the first 20 s>
//   load    <where the game's file came from>/<how long it took>: cn-gcore, cn-testingcf, cn-fastly, cn-cdn,
//           cn-local (in mainland China, by the time zone), local, gcore, cdn (elsewhere); 0-3s … 30s+
//           (the page's loader says: tools/cdn-loader.mjs)

const BAIDU_ID = '051ce4949c1654e14647eaa86d5ce5df';
const CATEGORY = 'golf';
const HOME = { host: 'superdiaodiao.github.io', path: '/wanwu-gun/golf' };
const SITE = typeof __PLATFORM__ === 'undefined' || __PLATFORM__ === 'site';

const q = typeof location !== 'undefined' ? new URLSearchParams(location.search) : new URLSearchParams();
const debug = q.has('trackdebug');
const home = typeof location !== 'undefined' && location.protocol === 'https:' && location.hostname === HOME.host && location.pathname.startsWith(HOME.path);
const on = SITE && !!BAIDU_ID && home && !q.has('notrack');

/** one event; label ('a/b', plain ASCII) and value are optional */
export function track(action, label, value) {
  const page = `/wanwu-gun/golf/e/${action}` + (label === undefined ? '' : `/${label}`);
  if (debug) console.info('[track]', page, value ?? '');
  if (!on) return;
  const e = ['_trackEvent', CATEGORY, action, label === undefined ? '' : String(label)];
  if (value !== undefined) e.push(Math.round(value));
  window._hmt.push(e);
  window._hmt.push(['_trackPageview', page]);
}

const MARKS = [1, 3, 5, 10, 15, 20, 30];
let played = 0, lastInput = 0;
const seen = new Set();

/** how long, as a coarse bucket (so the labels stay few) */
function span(s) {
  const m = s / 60;
  return s < 30 ? '0-30s' : m < 1 ? '30s-1m' : m < 3 ? '1-3m' : m < 5 ? '3-5m' : m < 10 ? '5-10m' : m < 15 ? '10-15m' : m < 20 ? '15-20m' : '20m+';
}

/**
 * at boot: load 百度统计, say whether this device has been here before and in which language, and
 * start counting the time played. hole() gives the hole on screen (0-based), for `leave`.
 */
export function trackBoot(store, en, hole) {
  // (the test spelled out here, not as SITE, so that the CrazyGames build leaves 百度统计 out altogether)
  if ((typeof __PLATFORM__ === 'undefined' || __PLATFORM__ === 'site') && on) {
    window._hmt = window._hmt || [];
    const s = document.createElement('script');
    s.async = true;
    s.src = `https://hm.baidu.com/hm.js?${BAIDU_ID}`;
    document.head.appendChild(s);
  }
  const today = new Date().toISOString().slice(0, 10), first = store.get('firstDay', null);
  if (!first) { store.set('firstDay', today); track('visit', 'new'); }
  else {
    const days = Math.round((Date.parse(today) - Date.parse(first)) / 86400000);
    track('visit', days <= 0 ? 'same-day' : days >= 7 ? 'day-7+' : `day-${days}`);
  }
  track('lang', en ? 'en' : 'zh');
  const ld = window.__golfLoad;
  if (ld) track('load', `${ld.from}/${ld.ms < 3000 ? '0-3s' : ld.ms < 7000 ? '3-7s' : ld.ms < 15000 ? '7-15s' : ld.ms < 30000 ? '15-30s' : '30s+'}`);
  // the time played: a second at a time, while the page is in front and someone is there
  lastInput = performance.now();
  const touched = () => { lastInput = performance.now(); };
  addEventListener('pointerdown', touched, true);
  addEventListener('keydown', touched, true);
  setInterval(() => {
    if (document.hidden || performance.now() - lastInput > 60000) return;
    played++;
    for (const m of MARKS) if (played === m * 60) track('time', m + 'm');
  }, 1000);
  document.addEventListener('visibilitychange', () => { if (document.hidden) track('leave', `h${hole() + 1}/${span(played)}`); });
  // frames a second over the first 20 s shown
  const touch = matchMedia('(pointer: coarse)').matches;
  let frames = 0, t = 0, prev = 0;
  const count = now => {
    if (prev && !document.hidden) { const dt = (now - prev) / 1000; if (dt < 0.25) { t += dt; frames++; } }
    prev = now;
    if (t < 20) requestAnimationFrame(count);
    else { const f = frames / t; track('fps', `${touch ? 'touch' : 'desk'}/${f < 20 ? 'under-20' : f < 30 ? '20-30' : f < 45 ? '30-45' : '45+'}`); }
  };
  requestAnimationFrame(count);
}

/** a hole begun (i 0-based); again: the one on screen begun over */
export function trackHole(i, again) {
  if (again) track('retry', `h${i + 1}`);
  else if (!seen.has(i)) { seen.add(i); track('hole', `h${i + 1}`); }
}

/** a hole over: sunk (in strokes, d over par), let off, or skipped; at a difficulty */
export function trackDone(i, sunk, skipped, strokes, d, level) {
  const how = skipped ? 'skip' : !sunk ? 'let-off' : strokes === 1 ? 'ace' : d < 0 ? 'under' : d === 0 ? 'par' : 'over';
  track('done', `h${i + 1}/${how}` + (level === 'easy' ? '' : `/${level}`), strokes);
}
