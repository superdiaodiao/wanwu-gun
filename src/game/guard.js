// Where the game may run. A copy of it on someone else's site (233乐园 took one in October 2026)
// doesn't start: it says where the real one is instead, and tells 百度统计 which site it is on
// (track.js trackCopy). The site build runs at home and the CrazyGames build on CrazyGames; both
// also run opened from disk and on this machine. Other builds (a mini-program port) aren't checked.
//
// main.js asks more than once, in different ways (at boot, when a game starts, at the patch), so a
// copy with one check taken out still stops.
import { t } from '../i18n/index.js';

const PLATFORM = typeof __PLATFORM__ !== 'undefined' ? __PLATFORM__ : 'site';
// the address players are sent to (also on a copy of the CrazyGames build: it is no portal)
export const HOME_URL = 'https://superdiaodiao.github.io/wanwu-gun/';

const LOCAL = h => h === 'localhost' || h === '127.0.0.1' || h === '[::1]' || h === '::1' || /\.(localhost|test)$/.test(h);
// the hosts each build belongs on, written backwards so the built file has no plain list of them
const OWN = {
  site: [['oi.buhtig.oaidoaidrepus', true]],
  crazygames: [['moc.semagyzarc', false]], // crazygames.com and its subdomains (games., *.game-files.)
};
const rev = s => s.split('').reverse().join('');

/** the host this copy runs on when that's somewhere it shouldn't be, else null */
export function strayHost() {
  if (typeof location === 'undefined') return null;
  const hosts = OWN[PLATFORM];
  if (!hosts) return null;
  if (location.protocol === 'file:') return null;
  const h = location.hostname.toLowerCase();
  if (LOCAL(h)) return null;
  for (const [r, exact] of hosts) {
    const own = rev(r);
    if (h === own || (!exact && h.endsWith('.' + own))) return null;
  }
  return h || '?';
}

/** the game stops and says where the real one is */
export function stopCopy() {
  if (document.getElementById('stray')) return;
  for (const el of document.querySelectorAll('body > *')) el.style.display = 'none';
  const box = document.createElement('div');
  box.id = 'stray';
  box.style.cssText = 'position:fixed;inset:0;display:flex;align-items:center;justify-content:center;padding:24px;' +
    'background:#1f1b24;color:#f6efe0;font:16px/1.6 "Noto Sans SC","PingFang SC",sans-serif;text-align:center;z-index:99999';
  box.innerHTML =
    `<div style="max-width:420px"><div style="font-size:22px;font-weight:700;margin-bottom:12px">${t('这是一份未经授权的拷贝')}</div>` +
    `<p style="margin:0 0 18px;opacity:.85">${t('《万物皆可滚·女娲补天》的作者没有在这里发布过这个游戏。正版免费，一直在更新：')}</p>` +
    `<a href="${HOME_URL}" target="_blank" rel="noopener" style="display:inline-block;padding:12px 26px;border-radius:999px;background:#e8302a;color:#fff;font-weight:700;text-decoration:none">${t('去玩正版')}</a>` +
    `<p style="margin:14px 0 0;font-size:13px;opacity:.6">${HOME_URL.replace(/^https:\/\//, '').replace(/\/$/, '')}</p></div>`;
  document.body.appendChild(box);
}
