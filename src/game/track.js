// Anonymous play statistics for playtests, as 百度统计 (tongji.baidu.com) events: which way of
// playing people start, whether they sit through 女娲's story, how long a game lasts and how it ends,
// whether they go straight into a second one, and whether they come back on another day. Nothing
// about who is playing is sent; 百度统计 counts visitors itself.
//
// BAIDU_ID is the site's id from 百度统计 (the part after hm.js? in the code it gives you). Left
// empty, nothing is loaded or sent. Only pages served over http(s) from somewhere other than this
// computer report, and ?notrack switches it off (for playing yourself). ?trackdebug logs every
// event to the console.
//
// Each event goes out twice: as an event (事件分析, category 'wanwu', which the free plan of 百度统计
// doesn't show: it needs 分析云) and as a made-up page, /wanwu-gun/e/<action>/<label>, counted in
// 访问分析 → 受访页面 like any other page (so the page views there are inflated; visitors aren't).
// The events:
//   visit     new / same-day / day-N / day-7+ (days since the first visit on this device)
//   start     the way of playing (quick, timed, daily, rivals, free, level-<id>)
//   game_n    1, 2, 3, 4+: the how-manieth game since the page was opened
//   intro     heard / skip-k-of-n (skipped with k of the n lines read)
//   end       mode/how long (value: seconds played)
//   size      mode/how big the ball ended up
//   quit      home|restart/mode/how long (left a game from the pause menu)
//   leave     state/mode/how long (switched away in the middle of a game)
//   fps       touch|desk/frames per second (at the end of a game)
//   click     a button on the title or results screen

const BAIDU_ID = '051ce4949c1654e14647eaa86d5ce5df';
const CATEGORY = 'wanwu';

const q = typeof location !== 'undefined' ? new URLSearchParams(location.search) : new URLSearchParams();
const debug = q.has('trackdebug');
const local = typeof location === 'undefined' || !/^https?:$/.test(location.protocol) || /^(localhost|127\.|\[::1\]|0\.0\.0\.0)/.test(location.hostname);
const on = !!BAIDU_ID && !local && !q.has('notrack');
let games = 0;

function load() {
  window._hmt = window._hmt || [];
  const s = document.createElement('script');
  s.async = true;
  s.src = `https://hm.baidu.com/hm.js?${BAIDU_ID}`;
  document.head.appendChild(s);
}

/** one event; label ('a/b/c', plain ASCII) and value are optional */
export function track(action, label, value) {
  const page = `/wanwu-gun/e/${action}` + (label === undefined ? '' : `/${label}`);
  if (debug) console.info('[track]', page, value ?? '');
  if (!on) return;
  const e = ['_trackEvent', CATEGORY, action, label === undefined ? '' : String(label)];
  if (value !== undefined) e.push(Math.round(value));
  window._hmt.push(e);
  window._hmt.push(['_trackPageview', page]);
}

/** at boot: load 百度统计 and say whether this device has been here before */
export function trackVisit(store, today) {
  if (on) load();
  const first = store.get('firstDay', null);
  if (!first) {
    store.set('firstDay', today);
    track('visit', 'new');
    return;
  }
  const days = Math.round((Date.parse(today) - Date.parse(first)) / 86400000);
  track('visit', days <= 0 ? 'same-day' : days >= 7 ? 'day-7+' : `day-${days}`);
}

/** a game begins */
export function trackStart(mode) {
  games++;
  track('start', mode);
  track('game_n', games >= 4 ? '4+' : String(games));
}

/** seconds as a coarse bucket, so the labels stay few (a 3-minute game that ran out is 2-3m) */
export function span(t) {
  const s = Math.floor(t);
  return s < 30 ? '0-30s' : s < 60 ? '30s-1m' : s < 120 ? '1-2m' : s <= 180 ? '2-3m' : s <= 360 ? '3-6m' : '6m+';
}

/** metres as a coarse bucket */
export function sizeBucket(m) {
  return m < 0.5 ? 'under-50cm' : m < 1 ? '50cm-1m' : m < 5 ? '1-5m' : m < 20 ? '5-20m' : m < 50 ? '20-50m' : m < 200 ? '50-200m' : '200m+';
}

export function fpsBucket(fps) {
  return fps < 20 ? 'under-20' : fps < 30 ? '20-30' : fps < 45 ? '30-45' : '45+';
}
