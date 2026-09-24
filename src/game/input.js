// Keyboard, mouse drag, touch joystick (plus a second finger swiping the view) and gamepad → raw
// controls; Driver turns them into { dir, m, quick, turnImpulse, dash } for the ball and the camera.

// A touch screen? `(pointer: coarse)` alone comes out false in some embedded and in-app browsers on
// phones (the page then hid its joystick and dash button), so go by touch support too, and by any
// touch actually seen.
let touchSeen = false;
if (typeof window !== 'undefined') window.addEventListener('touchstart', () => (touchSeen = true), { capture: true, passive: true, once: true });
export function isTouch() {
  return touchSeen || matchMedia('(pointer: coarse)').matches || matchMedia('(any-pointer: coarse)').matches || navigator.maxTouchPoints > 0;
}

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

    // touch: a finger anywhere but the joystick swipes the view round (the right thumb, while the
    // left one steers)
    this.look = { id: null, x: 0, x0: 0, y0: 0, moved: false, dragEnd: 0 };
    this.lookDist = 0; // how far (px) thumbs have swiped the view round, all told
    this.lookStart = e => {
      if (e.pointerType === 'mouse' || this.look.id !== null) return false;
      const L = this.look;
      L.id = e.pointerId;
      L.x = L.x0 = e.clientX;
      L.y0 = e.clientY;
      L.moved = false;
      return true;
    };
    window.addEventListener('pointermove', e => {
      const L = this.look;
      if (e.pointerId !== L.id) return;
      // a comfortable thumb swipe (about half the screen's width) turns the view by ~90°
      this.turnImpulse += (e.clientX - L.x) * (3.2 / Math.max(320, Math.min(innerWidth, innerHeight)));
      this.lookDist += Math.abs(e.clientX - L.x);
      L.x = e.clientX;
      if (!L.moved && Math.hypot(e.clientX - L.x0, e.clientY - L.y0) > 10) L.moved = true;
    });
    const lookEnd = e => {
      const L = this.look;
      if (e.pointerId !== L.id) return;
      L.id = null;
      if (L.moved) L.dragEnd = performance.now();
    };
    window.addEventListener('pointerup', lookEnd);
    window.addEventListener('pointercancel', lookEnd);
    canvas.addEventListener('pointerdown', e => this.lookStart(e));

    // touch: virtual joystick anywhere on the left 65% of the screen
    const zone = document.getElementById('touch-zone');
    const stick = document.getElementById('touch-stick');
    const knob = document.getElementById('touch-knob');
    if (zone) {
      zone.addEventListener('pointerdown', e => {
        // a second finger down there while the stick is held looks around instead
        if (this.joy.id !== null) { this.lookStart(e); return; }
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

  /** let a swipe that starts on this element look around too (e.g. the minimap) */
  lookSurface(el) {
    el.addEventListener('pointerdown', e => this.lookStart(e));
  }

  /** a swipe just ended: the click it may produce isn't a tap */
  justSwiped() { return performance.now() - this.look.dragEnd < 350; }

  /**
   * Raw controls this frame: WASD / arrows, and a stick (touch or pad) as a direction on screen,
   * { a: angle from straight up (+ = right), m: 0..1 }. Mouse drags, touch swipes and the pad's
   * right stick turn the view (turnImpulse, padTurn).
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
 * Turns raw controls into { dir, m, quick, hold, turnImpulse, dash } for the ball: `dir` is the world
 * heading to roll towards (null when nothing is pressed), m how hard (0..1), turnImpulse how far the
 * player turned the view this frame (mouse, a thumb swiping, the pad's right stick, A / D).
 *
 * The stick points on screen — up is away from the camera — and a push to the side sends the ball
 * that way at once, gently near straight up and fully at 90° (so a thumb wobbling round "up" rolls
 * straight on); the camera then swings round behind it at its own pace (camera.js), so a thumb held
 * to one side curves. Back near straight up (`hold`) while rolling, the ball keeps going the way it
 * goes now while the view catches up behind it, instead of swinging back to where the view looks;
 * from a standstill, straight up is where the view looks (look round, then go).
 *
 * Keys steer like a car: W rolls on, A / D turn the view and the ball together (slowly for a tap,
 * faster when held), S turns round.
 *
 * Pointing back towards the camera is a turn-around: the ball heads the way the stick points, fixed
 * in the world while it stays back there (the view swinging round would otherwise drag the
 * direction with it), and `quick` tells the camera to swing round fast.
 */
const HOLD = 14 * (Math.PI / 180); // stick within this of straight up: keep the course
const KEY_TURN = [1.2, 2.2]; // rad/s: a tap, held (after ~0.35 s)
/** stick angle → heading offset: a fraction of it near straight up, all of it at 90° and beyond */
function ease(a) {
  const q = Math.PI / 2, x = Math.abs(a);
  return x >= q ? a : Math.sign(a) * q * Math.pow(x / q, 1.7);
}

export class Driver {
  constructor() {
    this.lock = null; // world heading held during a turn-around
    this.keyHeld = 0; // how long A / D have been held
  }

  update(raw, camYaw, heading, dt, rolling = true) {
    let a = null, m = 0, keyTurn = 0;
    if (raw.stick) {
      a = raw.stick.a;
      m = raw.stick.m;
    } else {
      keyTurn = raw.keyTurn;
      if (raw.back) a = Math.PI;
      else if (raw.fwd || keyTurn) a = 0;
      if (a !== null) m = 1;
    }
    this.keyHeld = keyTurn ? this.keyHeld + dt : 0;
    const keyRate = KEY_TURN[0] + (KEY_TURN[1] - KEY_TURN[0]) * Math.min(1, this.keyHeld / 0.35);
    const turn = raw.turnImpulse + (raw.padTurn || 0) * 2.4 * dt + keyTurn * keyRate * dt;
    const out = { dir: null, m: 0, quick: false, hold: false, turnImpulse: turn, dash: raw.dash };
    if (a === null) {
      this.lock = null;
      return out;
    }
    // into the back zone past ~130°, out of it only below ~115° (no flicker at the edge)
    if (Math.abs(a) > (this.lock === null ? 2.28 : 2.0)) {
      if (this.lock === null) this.lock = camYaw + a;
      out.dir = this.lock;
      out.quick = true;
    } else if (Math.abs(a) < HOLD) {
      // (the course turns along with the view when the player turns that)
      this.lock = null;
      out.dir = rolling ? heading + turn : camYaw + turn + ease(a);
      out.hold = true;
    } else {
      this.lock = null;
      out.dir = camYaw + turn + ease(a);
    }
    out.m = m;
    return out;
  }
}
