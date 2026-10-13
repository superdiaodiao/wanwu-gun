// Languages: 中文, the game as written, and English. The Chinese text stays where it is in the code;
// English comes from tables in en/: ui.js maps each piece of UI text (the Chinese string itself is
// the key) to its English, content.js and blurbs.js hold the names, wishes, levels and 女娲's lines
// by id (applied over the Chinese ones at boot: apply.js). Signs, banners and shop fronts painted in
// the 3D town stay Chinese: it is a Chinese town.
//
// Which language: ?lang=en|zh, else the one picked before (the 中/EN switch on the title screen),
// else the browser's (Chinese for zh-*, English for anything else).
import { UI } from './en/ui.js';
import { PLACES } from './en/content.js';

const KEY = 'wanwu.lang';

function detect() {
  if (typeof location === 'undefined') return 'zh';
  const q = new URLSearchParams(location.search).get('lang');
  if (q === 'en' || q === 'zh') return q;
  try {
    const s = JSON.parse(localStorage.getItem(KEY));
    if (s === 'en' || s === 'zh') return s;
  } catch {}
  const nav = (typeof navigator !== 'undefined' && (navigator.languages?.[0] || navigator.language)) || '';
  return /^zh/i.test(nav) ? 'zh' : 'en';
}

export const LANG = detect();
export const EN = LANG === 'en';

/** switch language: kept for next time, and the page starts again in it */
export function setLang(lang) {
  try { localStorage.setItem(KEY, JSON.stringify(lang)); } catch {}
  const u = new URL(location.href);
  u.searchParams.delete('lang');
  location.replace(u.href);
}

/**
 * A piece of UI text: the Chinese as written, or its English. {name} in it is filled from vars
 * (the same names in both languages), e.g. t('滚起 {n} 件', { n: 12 }).
 */
export function t(zh, vars) {
  let s = EN && Object.prototype.hasOwnProperty.call(UI, zh) ? UI[zh] : zh;
  if (EN && s === zh && /[一-鿿]/.test(zh) && typeof console !== 'undefined') missing(zh);
  if (vars) s = s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m));
  return s;
}

/** a place name (minimap.js PLACES, or the 图鉴's "found in" wording), shown in the language */
export function placeName(zh) {
  return EN ? PLACES[zh] || zh : zh;
}

const seen = new Set();
function missing(zh) {
  if (seen.has(zh)) return;
  seen.add(zh);
  console.warn('[i18n] no English for', JSON.stringify(zh));
}

/**
 * The page as written in index.html, in English: an element marked data-i18n has its whole inner
 * HTML looked up (for sentences with <b> or <kbd> inside); everything else, text node by text node,
 * plus aria-label, title and placeholder.
 */
export function translateDom(root = document.body) {
  document.documentElement.lang = EN ? 'en' : 'zh-CN';
  if (!EN) return;
  for (const el of root.querySelectorAll('[data-i18n]')) el.innerHTML = t(el.innerHTML.trim());
  const walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: n => (n.parentElement && !n.parentElement.closest('[data-i18n], script, style') && /[一-鿿]/.test(n.nodeValue) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT),
  });
  const nodes = [];
  while (walk.nextNode()) nodes.push(walk.currentNode);
  for (const n of nodes) {
    const raw = n.nodeValue, key = raw.trim();
    n.nodeValue = raw.replace(key, t(key));
  }
  for (const attr of ['aria-label', 'title', 'placeholder']) {
    for (const el of root.querySelectorAll(`[${attr}]`)) {
      const v = el.getAttribute(attr);
      if (/[一-鿿]/.test(v)) el.setAttribute(attr, t(v));
    }
  }
}
