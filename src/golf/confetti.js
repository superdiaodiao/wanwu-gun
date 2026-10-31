// Paper confetti over the whole screen, in CSS pixels: a burst thrown up from a point (the cup, as
// seen), or a cannon from a corner. Each piece tumbles as it falls (it turns, and its width swings
// with a spin about its own length, like paper), slows in the air, and fades out at the end.
const COLS = ['#ffd34d', '#ff6b6b', '#4fc3f7', '#7ed957', '#b388ff', '#ff9f43', '#ffffff'];
const GRAVITY = 1100, DRAG = 2.6; // px/s², 1/s (falls at most GRAVITY / DRAG px/s)

export class Confetti {
  constructor(canvas) {
    this.cv = canvas;
    this.g = canvas.getContext('2d');
    this.ps = [];
    this.drawn = false;
    this.cv.style.visibility = 'hidden'; // (no full-screen layer to put together while there is none)
    this.resize();
    addEventListener('resize', () => this.resize());
  }

  resize() {
    this.k = Math.min(2, devicePixelRatio || 1);
    this.cv.width = Math.round(innerWidth * this.k);
    this.cv.height = Math.round(innerHeight * this.k);
  }

  /** n pieces from (x, y), thrown at `angle` (radians, 0 = right, -π/2 = up) give or take spread/2 */
  burst(x, y, n, { angle = -Math.PI / 2, spread = 1.4, speed = innerHeight * 1.5 } = {}) {
    const size = Math.max(6, Math.min(13, Math.min(innerWidth, innerHeight) / 55));
    this.cv.style.visibility = '';
    for (let i = 0; i < n; i++) {
      const a = angle + (Math.random() - 0.5) * spread, v = speed * (0.35 + Math.random() * 0.75);
      this.ps.push({
        x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v,
        r: Math.random() * 6.3, vr: (Math.random() - 0.5) * 12, s: Math.random() * 6.3, vs: 5 + Math.random() * 9,
        w: size * (0.8 + Math.random() * 0.6), h: size * (0.45 + Math.random() * 0.3),
        c: COLS[(Math.random() * COLS.length) | 0], t: 0, life: 2.4 + Math.random() * 1.4,
      });
    }
  }

  update(dt) {
    if (!this.ps.length && !this.drawn) return;
    const g = this.g, k = this.k, drag = Math.exp(-DRAG * dt), H = innerHeight + 30;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, this.cv.width, this.cv.height);
    let n = 0;
    for (const p of this.ps) {
      p.t += dt;
      p.vy += GRAVITY * dt;
      p.vx *= drag; p.vy *= drag;
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.r += p.vr * dt; p.s += p.vs * dt;
      if (p.t > p.life || p.y > H) continue;
      this.ps[n++] = p;
      const c = Math.cos(p.r), sn = Math.sin(p.r), f = Math.cos(p.s);
      g.setTransform(c * f * k, sn * f * k, -sn * k, c * k, p.x * k, p.y * k);
      g.globalAlpha = Math.min(1, (p.life - p.t) * 2.5);
      g.fillStyle = p.c;
      g.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
    }
    this.ps.length = n;
    g.globalAlpha = 1;
    this.drawn = n > 0;
    if (!n) this.cv.style.visibility = 'hidden';
  }
}
