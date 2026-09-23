// Keyboard, mouse drag, touch joystick and gamepad → { throttle, turn, turnImpulse, dash }.
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

  poll() {
    const k = this.keys;
    let throttle = 0, turn = 0;
    if (k.has('KeyW') || k.has('ArrowUp')) throttle += 1;
    if (k.has('KeyS') || k.has('ArrowDown')) throttle -= 1;
    if (k.has('KeyA') || k.has('ArrowLeft')) turn -= 1;
    if (k.has('KeyD') || k.has('ArrowRight')) turn += 1;
    let dash = this.pressed.has('Space') || this.pressed.has('ShiftLeft') || this.pressed.has('ShiftRight') || this.touchDash;
    this.touchDash = false;

    if (this.joy.id !== null) {
      const dx = (this.joy.x - this.joy.x0) / 46, dy = (this.joy.y - this.joy.y0) / 46;
      const mag = Math.min(1, Math.hypot(dx, dy));
      if (mag > 0.12) {
        throttle = Math.max(-1, Math.min(1, -dy));
        turn = Math.max(-1, Math.min(1, dx)) * 0.9;
      }
    }

    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const gp = pads && [...pads].find(p => p && p.connected);
    if (gp) {
      const ax = gp.axes[0] || 0, ay = gp.axes[1] || 0, rx = gp.axes[2] || 0;
      if (Math.abs(ay) > 0.15) throttle = -ay;
      if (Math.abs(ax) > 0.15) turn = ax;
      if (Math.abs(rx) > 0.15) turn = Math.max(-1, Math.min(1, turn + rx));
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
    if (!this.enabled) return { throttle: 0, turn: 0, turnImpulse: 0, dash: false };
    return { throttle, turn, turnImpulse: impulse, dash };
  }
}
