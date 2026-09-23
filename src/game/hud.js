// HUD: size gauge, next goal, timer, last item rolled up, toasts.
import { MILESTONES } from './story.js';

const RING = 2 * Math.PI * 52;

export function splitLength(x) {
  if (x < 0.01) return [(x * 1000).toFixed(1), 'mm'];
  if (x < 1) return [(x * 100).toFixed(x < 0.1 ? 1 : 0), 'cm'];
  if (x < 1000) return [x.toFixed(x < 10 ? 2 : x < 100 ? 1 : 0), 'm'];
  return [(x / 1000).toFixed(2), 'km'];
}
export const fmt = x => splitLength(x).join(' ');

export class HUD {
  constructor() {
    const $ = id => document.getElementById(id);
    this.root = $('hud');
    this.sizeBox = $('hud-size');
    this.sizeNum = $('size-num');
    this.sizeUnit = $('size-unit');
    this.ring = $('size-ring');
    this.goal = $('goal-text');
    this.timeBox = $('hud-time');
    this.timeText = $('time-text');
    this.last = $('hud-last');
    this.lastName = $('last-name');
    this.lastSize = $('last-size');
    this.count = $('count-num');
    this.keys = $('hud-keys');
    this.toasts = $('toast-stack');
    this.shown = { num: '', unit: '', goal: '', time: '', count: -1 };
    this.prevMilestone = 0;
  }

  show(on) {
    this.root.hidden = !on;
  }

  update(S, milestoneIdx, secondsLeft, count) {
    const [n, u] = splitLength(S);
    if (n !== this.shown.num) this.sizeNum.textContent = this.shown.num = n;
    if (u !== this.shown.unit) this.sizeUnit.textContent = this.shown.unit = u;
    const next = MILESTONES[milestoneIdx];
    const prev = milestoneIdx > 0 ? MILESTONES[milestoneIdx - 1][0] : 0.1;
    const goalText = next ? fmt(next[0]) : '∞';
    if (goalText !== this.shown.goal) this.goal.textContent = this.shown.goal = goalText;
    const t = next ? Math.max(0, Math.min(1, Math.log(S / prev) / Math.log(next[0] / prev))) : 1;
    this.ring.style.strokeDashoffset = String(RING * (1 - t));
    if (secondsLeft === null) {
      this.timeBox.hidden = true;
    } else {
      this.timeBox.hidden = false;
      const s = Math.max(0, Math.ceil(secondsLeft));
      const txt = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
      if (txt !== this.shown.time) this.timeText.textContent = this.shown.time = txt;
      this.timeBox.classList.toggle('hurry', secondsLeft <= 30);
    }
    if (count !== this.shown.count) this.count.textContent = this.shown.count = count;
  }

  bump() {
    this.sizeBox.classList.remove('bump');
    void this.sizeBox.offsetWidth;
    this.sizeBox.classList.add('bump');
  }

  lastItem(name, size) {
    this.last.hidden = false;
    this.lastName.textContent = name;
    this.lastSize.textContent = fmt(size);
    this.last.classList.remove('pop');
    void this.last.offsetWidth;
    this.last.classList.add('pop');
  }

  toast(html, big = false) {
    const el = document.createElement('div');
    el.className = 'toast' + (big ? ' big' : '');
    el.innerHTML = html;
    this.toasts.appendChild(el);
    while (this.toasts.children.length > 3) this.toasts.firstChild.remove();
    setTimeout(() => el.remove(), 3000);
  }

  fadeKeys() {
    this.keys.classList.add('fade');
  }
}
