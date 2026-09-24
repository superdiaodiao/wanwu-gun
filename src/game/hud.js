// HUD: size gauge (with what is still to be absorbed), next goal, timer, last item rolled up, the
// pickup streak, "+size" pop-ups, goal stamps, toasts.
import { MILESTONES, SKY_GOAL } from './story.js';

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
    this.ringNext = $('size-ring-next');
    this.gains = $('hud-gains');
    this.comboBox = $('hud-combo');
    this.comboN = $('combo-n');
    this.comboBonus = $('combo-bonus');
    this.stampBox = $('stamp');
    this.stampSize = $('stamp-size');
    this.stampSub = $('stamp-sub');
    this.goal = $('goal-text');
    this.goalLbl = $('goal-lbl');
    this.timeBox = $('hud-time');
    this.timeText = $('time-text');
    this.last = $('hud-last');
    this.lastName = $('last-name');
    this.lastLabel = this.last.querySelector('.label');
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

  update(S, milestoneIdx, secondsLeft, count, futureS = S) {
    const [n, u] = splitLength(S);
    if (n !== this.shown.num) this.sizeNum.textContent = this.shown.num = n;
    if (u !== this.shown.unit) this.sizeUnit.textContent = this.shown.unit = u;
    const next = MILESTONES[milestoneIdx];
    const prev = milestoneIdx > 0 ? MILESTONES[milestoneIdx - 1][0] : 0.1;
    const goalText = next ? (next[0] === SKY_GOAL ? `${SKY_GOAL} m` : fmt(next[0])) : '∞';
    if (goalText !== this.shown.goal) {
      this.goal.textContent = this.shown.goal = goalText;
      // the size that patches the sky says so
      this.goalLbl.textContent = next && next[0] === SKY_GOAL ? '补天' : '目标';
    }
    const frac = x => (next ? Math.max(0, Math.min(1, Math.log(x / prev) / Math.log(next[0] / prev))) : 1);
    // (in half-pixel steps, written only when they move: every repaint of the gauge redraws its shadow)
    const bar = Math.round(RING * (1 - frac(S)) * 2) / 2;
    if (bar !== this.shown.bar) this.ring.style.strokeDashoffset = String((this.shown.bar = bar));
    // lighter arc ahead of it: what has been rolled up but not grown into yet
    const ahead = Math.round(RING * (1 - frac(Math.max(S, futureS))) * 2) / 2;
    if (ahead !== this.shown.ahead) this.ringNext.style.strokeDashoffset = String((this.shown.ahead = ahead));
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

  /** fresh: the first of its kind ever (a new 图鉴 entry) */
  lastItem(name, size, fresh = false) {
    this.last.classList.toggle('fresh', fresh);
    this.lastLabel.textContent = fresh ? '新收集！' : '刚滚起';
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

  /** "+1.2 cm" floating off the gauge */
  gain(dS, S) {
    if (!(dS > 0)) return;
    const el = document.createElement('div');
    el.className = 'gain' + (dS > S * 0.04 ? ' big' : '');
    el.textContent = '+' + fmt(dS);
    this.gains.appendChild(el);
    while (this.gains.children.length > 4) this.gains.firstChild.remove();
    setTimeout(() => el.remove(), 1150);
  }

  /** the pickup streak: shown from 3 on, hotter colours as it grows */
  combo(n, mult) {
    if (n < 3) return;
    const box = this.comboBox;
    box.hidden = false;
    box.classList.remove('out', 'tick', 'done');
    box.classList.toggle('hot', n >= 10);
    box.classList.toggle('fire', n >= 20 && n < 30);
    box.classList.toggle('five', n >= 30);
    this.comboN.textContent = n;
    const pct = Math.round((mult - 1) * 100);
    this.comboBonus.textContent = pct > 0 ? `长大 +${pct}%` : '';
    void box.offsetWidth;
    box.classList.add('tick');
    clearTimeout(this._comboHide);
  }

  /** streak over: a long one shows what it was worth for a moment, then the counter fades */
  comboEnd(n, extra) {
    const box = this.comboBox;
    clearTimeout(this._comboHide);
    const fade = () => {
      box.classList.add('out');
      this._comboHide = setTimeout(() => (box.hidden = true), 400);
    };
    if (n >= 8 && extra > 0) {
      this.comboBonus.textContent = `多长了 ${fmt(extra)}`;
      box.classList.add('done');
      this._comboHide = setTimeout(fade, 1400);
    } else fade();
  }

  /** a size goal reached: big stamp, and what can be rolled up now */
  stamp(sizeText, sub) {
    const box = this.stampBox;
    this.stampSize.innerHTML = `<em>${sizeText}</em>！`;
    this.stampSub.textContent = sub || '';
    box.hidden = true;
    void box.offsetWidth;
    box.hidden = false;
    clearTimeout(this._stampHide);
    this._stampHide = setTimeout(() => (box.hidden = true), 2700);
  }

  fadeKeys() {
    this.keys.classList.add('fade');
  }

  showKeys(secs = 10) {
    this.keys.classList.remove('fade');
    clearTimeout(this.keysT);
    this.keysT = setTimeout(() => this.fadeKeys(), secs * 1000);
  }
}
