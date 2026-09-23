// 女娲's dialog box: typewriter text with gibberish voice blips. Lines are either blocking (the intro:
// wait for a click) or passing remarks that dismiss themselves while the game keeps running.
export class Dialog {
  constructor(audio) {
    this.audio = audio;
    this.box = document.getElementById('dialog');
    this.text = document.getElementById('dialog-text');
    this.next = document.getElementById('dialog-next');
    this.queue = [];
    this.cur = null;
    this.box.addEventListener('pointerdown', e => {
      e.stopPropagation();
      this.advance();
    });
  }

  /** lines: string | string[]; opts: { blocking, onDone, hold } */
  say(lines, opts = {}) {
    const arr = Array.isArray(lines) ? lines : [lines];
    arr.forEach((line, i) => this.queue.push({ line, blocking: !!opts.blocking, hold: opts.hold, onDone: i === arr.length - 1 ? opts.onDone : null }));
    if (!this.cur) this.nextLine();
  }

  /** replace any passing remark with this one right away */
  interrupt(line, opts = {}) {
    if (this.cur && this.cur.blocking) return this.say(line, opts);
    this.queue = this.queue.filter(q => q.blocking);
    this.cur = null;
    this.say(line, opts);
  }

  get active() { return !!this.cur; }
  get blocking() { return !!(this.cur && this.cur.blocking); }

  nextLine() {
    const done = this.cur && this.cur.onDone;
    this.cur = this.queue.shift() || null;
    if (done) done();
    if (!this.cur) {
      this.box.hidden = true;
      return;
    }
    this.box.hidden = false;
    // passing remarks sit in a compact box in the corner so they don't cover the ball
    this.box.classList.toggle('passing', !this.cur.blocking);
    this.cur.chars = [...this.cur.line];
    this.cur.shown = 0;
    this.cur.t = 0;
    this.cur.wait = 0;
    this.text.textContent = '';
    const touch = matchMedia('(pointer: coarse)').matches;
    this.next.textContent = this.cur.blocking ? (touch ? '点击继续 ▸' : '点击继续 ▸ · Esc 跳过') : '';
  }

  advance() {
    const c = this.cur;
    if (!c) return;
    if (c.shown < c.chars.length) {
      c.shown = c.chars.length;
      this.text.textContent = c.line;
      return;
    }
    this.nextLine();
  }

  update(dt) {
    const c = this.cur;
    if (!c) return;
    if (c.shown < c.chars.length) {
      c.t += dt * 26;
      while (c.t >= 1 && c.shown < c.chars.length) {
        c.t -= 1;
        const ch = c.chars[c.shown++];
        if (c.shown % 2 === 1 && !/[，。！？、…—\s（）]/.test(ch)) this.audio.babble('nuwa');
      }
      this.text.textContent = c.chars.slice(0, c.shown).join('');
      return;
    }
    if (!c.blocking) {
      c.wait += dt;
      if (c.wait > (c.hold ?? 1.6 + c.chars.length * 0.07)) this.nextLine();
    }
  }

  clear() {
    this.queue = [];
    this.cur = null;
    this.box.hidden = true;
  }
}
