// Keyboard, mouse drag, touch joystick and gamepad → raw controls; Driver turns them into
// { throttle, turn, turnImpulse, dash } for the ball.
export class Input {
  constructor(canvas) {
    this.keys = new Set();
    this.pressed = new Set(); // edge-triggered this frame
    this.enabled = true;
    this.turnImpulse = 0;
    this.joy = { id: null, x0: 0, y0: 0, x: 0, y: 0 };
    this.touchDash = false;
    this.gpDashPrev = false;
    this.gpStartPrev = false;
    this.onKey = null; // (code) => void for UI shortcuts

    window.addEventListener('keydown', e => {
      if (e.target && /INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) return;
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
      if (!e.repeat) {
        this.pressed.add(e.code);
        if (this.onKey) this.onKey(e.code, e);
      }
      this.keys.add(e.code);
    });
    window.addEventListener('keyup', e => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());

    // mouse: drag on the canvas to steer
    let dragging = false, lastX = 0;
    canvas.addEventListener('pointerdown', e => {
      if (e.pointerType === 'mouse') {
        dragging = true;
        lastX = e.clientX;
        canvas.setPointerCapture?.(e.pointerId);
      }
    });
    canvas.addEventListener('pointermove', e => {
      if (dragging && e.pointerType === 'mouse') {
        this.turnImpulse += (e.clientX - lastX) * 0.0045;
        lastX = e.clientX;
      }
    });
    const end = () => (dragging = false);
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);

    // touch: virtual joystick anywhere on the left 65% of the screen
    const zone = document.getElementById('touch-zone');
    const stick = document.getElementById('touch-stick');
    const knob = document.getElementById('touch-knob');
    if (zone) {
      zone.addEventListener('pointerdown', e => {
        if (this.joy.id !== null) return;
        this.joy.id = e.pointerId;
        this.joy.x0 = this.joy.x = e.clientX;
        this.joy.y0 = this.joy.y = e.clientY;
        zone.setPointerCapture?.(e.pointerId);
        if (stick) {
          stick.hidden = false;
          stick.style.left = e.clientX + 'px';
          stick.style.top = e.clientY + 'px';
        }
      });
      zone.addEventListener('pointermove', e => {
        if (e.pointerId !== this.joy.id) return;
        this.joy.x = e.clientX;
        this.joy.y = e.clientY;
        if (knob) {
          const dx = Math.max(-46, Math.min(46, this.joy.x - this.joy.x0));
          const dy = Math.max(-46, Math.min(46, this.joy.y - this.joy.y0));
          knob.style.transform = `translate(${dx}px, ${dy}px)`;
        }
      });
      const up = e => {
        if (e.pointerId !== this.joy.id) return;
        this.joy.id = null;
        if (stick) stick.hidden = true;
        if (knob) knob.style.transform = '';
      };
      zone.addEventListener('pointerup', up);
      zone.addEventListener('pointercancel', up);
    }
    const dashBtn = document.getElementById('touch-dash');
    if (dashBtn) dashBtn.addEventListener('pointerdown', e => { e.preventDefault(); this.touchDash = true; });
  }

  wasPressed(code) { return this.pressed.has(code); }

  /**
   * Raw controls this frame. Keyboard: W forward, S turn around, A/D steer. A stick (touch or pad)
   * gives a direction: { a: angle from straight ahead (+ = right), m: 0..1 }.
   */
  poll() {
    const k = this.keys;
    const fwd = k.has('KeyW') || k.has('ArrowUp');
    const back = k.has('KeyS') || k.has('ArrowDown');
    let keyTurn = 0;
    if (k.has('KeyA') || k.has('ArrowLeft')) keyTurn -= 1;
    if (k.has('KeyD') || k.has('ArrowRight')) keyTurn += 1;
    let dash = this.pressed.has('Space') || this.pressed.has('ShiftLeft') || this.pressed.has('ShiftRight') || this.touchDash;
    this.touchDash = false;

    let stick = null;
    if (this.joy.id !== null) {
      const sx = (this.joy.x - this.joy.x0) / 46, sy = -(this.joy.y - this.joy.y0) / 46;
      const m = Math.min(1, Math.hypot(sx, sy));
      if (m > 0.15) stick = { a: Math.atan2(sx, sy), m };
    }

    let padTurn = 0;
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const gp = pads && [...pads].find(p => p && p.connected);
    if (gp) {
      const ax = gp.axes[0] || 0, ay = gp.axes[1] || 0, rx = gp.axes[2] || 0;
      const m = Math.min(1, Math.hypot(ax, ay));
      if (m > 0.2 && !stick) stick = { a: Math.atan2(ax, -ay), m };
      if (Math.abs(rx) > 0.15) padTurn = rx;
      const d = !!(gp.buttons[0] && gp.buttons[0].pressed);
      if (d && !this.gpDashPrev) dash = true;
      this.gpDashPrev = d;
      const st = !!(gp.buttons[9] && gp.buttons[9].pressed);
      if (st && !this.gpStartPrev && this.onKey) this.onKey('Escape');
      this.gpStartPrev = st;
    }

    const impulse = this.turnImpulse;
    this.turnImpulse = 0;
    this.pressed.clear();
    if (!this.enabled) return { fwd: false, back: false, keyTurn: 0, padTurn: 0, stick: null, turnImpulse: 0, dash: false };
    return { fwd, back, keyTurn, padTurn, stick, turnImpulse: impulse, dash };
  }
}

const angDiff = (from, to) => {
  let d = (to - from) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
};

/**
 * Turns raw controls into { throttle 0..1, turn } for the ball, which never reverses: rolling towards
 * the camera means rolling blind, and a thumb drifting a little downwards shouldn't back the ball up.
 *
 * Stick (touch or pad): up rolls straight ahead (as seen by the camera behind the ball), tilting it
 * steers while still rolling forwards, and pulling it back swings the ball round in a U-turn, after
 * which it rolls on. Keyboard: W rolls, A/D steer, S does the U-turn.
 */
export class Driver {
  constructor() {
    this.uTarget = null; // U-turn: heading to reach
    this.uDone = false;
  }

  update(raw, heading) {
    const BACK = 1.75; // ~100°: further round than this means "turn around"
    let m = 0, a = 0, wantBack = false;
    if (raw.stick) {
      m = raw.stick.m;
      a = raw.stick.a;
      wantBack = Math.abs(a) > BACK;
    } else {
      m = raw.fwd || raw.back ? 1 : 0;
      wantBack = raw.back && !raw.fwd;
      a = raw.keyTurn < 0 ? -Math.PI : Math.PI;
    }
    if (!wantBack) {
      this.uTarget = null;
      this.uDone = false;
    } else if (this.uTarget === null) {
      // lock the heading to reach, turning the way the stick leans
      this.uTarget = heading + (a >= 0 ? 1 : -1) * (Math.PI - 0.02);
      this.uDone = false;
    }

    let throttle, turn;
    if (this.uTarget !== null && !this.uDone) {
      const d = angDiff(heading, this.uTarget);
      if (Math.abs(d) < 0.12) this.uDone = true;
      turn = Math.sign(d) * 1.5;
      throttle = 0.35 * m;
    } else if (this.uTarget !== null) {
      // round: roll on
      turn = raw.stick ? 0 : raw.keyTurn;
      throttle = m;
    } else if (raw.stick) {
      // a few degrees either side of straight up still means straight
      const k = Math.max(0, Math.abs(a) - 0.12) / 0.95;
      turn = Math.sign(a) * Math.min(1, k ** 1.25);
      throttle = m * (1 - 0.3 * Math.abs(turn));
    } else {
      turn = raw.keyTurn;
      throttle = raw.fwd ? 1 : 0;
    }
    if (raw.padTurn) turn = Math.max(-1.5, Math.min(1.5, turn + raw.padTurn));
    return { throttle, turn, turnImpulse: raw.turnImpulse, dash: raw.dash };
  }
}
