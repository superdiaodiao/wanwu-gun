// Maps. The minimap is a round window on the town from above, turned so that up is where the camera
// looks (which is where the stick's "up" rolls), zooming out as the ball grows; the pause screen
// shows the whole map with the way rolled so far. Ground zones are drawn from the layout's polygons,
// objects live from the world: gold for what the ball can take now, red for what is up to twice too
// big (the same colours as in the 3D view), ink (or dark green, round, for trees and hills) for the rest.
//
// The minimap repaints its content a few times a second into a north-up layer a bit larger than the
// window; every frame only turns and slides that layer under the ball, so turning stays smooth.
import { ZONES } from './ground.js';

const COLORS = {
  base: '#6f9b52', grass: '#79a758', field: '#b4ab60', dirt: '#a48a66', sand: '#dccb9b', concrete: '#c4c0b7',
  plaza: '#d9cfbf', brick: '#ad6e5f', sidewalk: '#ccc4b6', road: '#595c63', track: '#b3604c', stone: '#9b9992',
  water: '#4f9db6',
};
const INK = 'rgba(40, 35, 48, 0.78)';
const GREEN = 'rgba(44, 78, 44, 0.8)'; // trees, hills, mountains
const RED = 'rgba(226, 62, 50, 0.9)';
const GOLD = '#f7c94f';
const PAPER = '#f6efe0';

/** place names for the big map: [name, x, z, shown from / up to this many metres each way] (north is −Z) */
export const PLACES = [
  ['幸福里小区', 0, -14, 0, 500], ['小吃街', 0, 47, 0, 160], ['幸福广场', 136, -14, 0, 500], ['人民公园', -165, -44, 0, 500],
  ['幸福小学', 0, -150, 0, 500], ['幸福里', 0, -95, 500, 1e9], ['城区', 390, 330, 250, 1e9], ['城区', -420, -330, 250, 1e9],
  ['高铁', 420, -760, 250, 1e9], ['农田', 640, 620, 250, 1e9], ['农田', -690, 470, 250, 1e9], ['群山', -860, -880, 250, 1e9],
];

// how much of the town the minimap shows (radius, m): about ten seconds of rolling each way
export const mapRadius = S => Math.min(1400, Math.max(15, S * 36));

export class Maps {
  constructor(world, layout) {
    this.world = world;
    this.zones = [];
    for (const kind of ZONES) {
      const col = COLORS[kind], list = layout.zones[kind];
      if (!col || !list) continue;
      const polys = [];
      for (const p of list) {
        if (p.length < 3) continue;
        const pts = new Float32Array(p.length * 2);
        let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
        p.forEach((q, i) => {
          pts[i * 2] = q[0];
          pts[i * 2 + 1] = q[1];
          x0 = Math.min(x0, q[0]); x1 = Math.max(x1, q[0]);
          z0 = Math.min(z0, q[1]); z1 = Math.max(z1, q[1]);
        });
        polys.push({ pts, x0, z0, x1, z1 });
      }
      this.zones.push({ col, polys });
    }
    // the high-speed railway runs on a viaduct: draw its tracks as lines
    this.rails = layout.lanes.filter(l => l.y > 1).map(l => l.pts);
    this.trail = [];
    this.trailT = 0;
    this.mini = null;
  }

  reset() {
    this.trail.length = 0;
    this.trailT = 0;
    if (this.mini) this.mini.R = 0;
  }

  // ---- painting -----------------------------------------------------------------------------

  /**
   * North-up map around (cx, cz), `half` metres each way, filling a px × px canvas context. Objects
   * are coloured against the ball's pick `limit`; ones smaller than `minPx` pixels are left out,
   * except that `dots` keeps a dot for each worthwhile thing it can take; `red` marks what is up to
   * twice too big.
   */
  paint(ctx, px, cx, cz, half, { limit = 0, minPx = 1.2, dots = true, red: showRed = true } = {}) {
    const k = px / (2 * half);
    ctx.setTransform(k, 0, 0, k, px / 2 - cx * k, px / 2 - cz * k);
    const x0 = cx - half, x1 = cx + half, z0 = cz - half, z1 = cz + half;
    ctx.fillStyle = COLORS.base;
    ctx.fillRect(x0, z0, 2 * half, 2 * half);
    for (const zone of this.zones) {
      ctx.beginPath();
      let any = false;
      for (const p of zone.polys) {
        if (p.x1 < x0 || p.x0 > x1 || p.z1 < z0 || p.z0 > z1) continue;
        const a = p.pts;
        ctx.moveTo(a[0], a[1]);
        for (let i = 2; i < a.length; i += 2) ctx.lineTo(a[i], a[i + 1]);
        ctx.closePath();
        any = true;
      }
      if (any) {
        ctx.fillStyle = zone.col;
        ctx.fill();
      }
    }
    ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(40, 35, 48, 0.85)';
    ctx.lineWidth = Math.max(1.5 / k, 5);
    for (const pts of this.rails) {
      ctx.beginPath();
      pts.forEach((q, i) => (i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1])));
      ctx.stroke();
    }
    // objects: one path per colour
    const minM = minPx / k, dot = 1.6 / k;
    const ink = new Path2D(), green = new Path2D(), red = new Path2D(), gld = new Path2D();
    let nGold = 0;
    for (const o of this.world.objects) {
      if (o.state !== 0 || o.y > 30) continue; // (clouds)
      const r = o.gridR;
      if (o.x + r < x0 || o.x - r > x1 || o.z + r < z0 || o.z - r > z1) continue;
      const rel = limit > 0 ? o.size / limit : 99;
      const big = Math.max(o.hw, o.hd) * 2;
      if (big >= minM) {
        const cat = o.spec.cat, round = o.cyl || cat === 'plant' || cat === 'nature';
        const path = rel <= 1 ? gld : showRed && rel <= 2 ? red : round ? green : ink;
        if (round) {
          const cr = Math.max(o.hw, o.hd) * 0.9, x = o.centerX(), z = o.centerZ();
          path.moveTo(x + cr, z);
          path.arc(x, z, cr, 0, Math.PI * 2);
        } else box(path, o);
      } else if (rel <= 1 && dots && rel >= 0.4 && nGold < 400) {
        // worth going for: at least a dot, however small
        gld.rect(o.x - dot, o.z - dot, dot * 2, dot * 2);
        nGold++;
      }
    }
    ctx.fillStyle = GREEN;
    ctx.fill(green);
    ctx.fillStyle = INK;
    ctx.fill(ink);
    ctx.fillStyle = RED;
    ctx.fill(red);
    ctx.fillStyle = GOLD;
    ctx.fill(gld);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  // ---- minimap --------------------------------------------------------------------------------

  attach(canvas) {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const layer = document.createElement('canvas');
    this.mini = { canvas, ctx, layer, lctx: layer.getContext('2d'), R: 0, cx: 0, cz: 0, half: 0, t: 0 };
  }

  /** every frame while playing: ball position, camera yaw, horizontal field of view (rad) */
  update(dt, ball, yaw, hfov) {
    this.record(dt, ball);
    const m = this.mini;
    if (!m) return;
    const cv = m.canvas;
    const css = cv.clientWidth;
    if (!css) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const px = Math.round(css * dpr);
    if (cv.width !== px || cv.height !== px) { cv.width = cv.height = px; m.t = 0; }
    const S = ball.S, want = mapRadius(S);
    m.R = m.R ? m.R + (want - m.R) * Math.min(1, dt * 2) : want;
    const R = m.R, bx = ball.pos.x, bz = ball.pos.z;
    // repaint the layer when the ball has drifted, the zoom moved on, or it has got stale
    m.t -= dt;
    const drift = Math.max(Math.abs(bx - m.cx), Math.abs(bz - m.cz));
    if (m.t <= 0 || drift > R * 0.35 || Math.abs(R / (m.half / 1.5) - 1) > 0.1) {
      m.t = 0.25 + Math.min(0.5, R / 1000);
      m.cx = bx;
      m.cz = bz;
      m.half = R * 1.5;
      const lp = Math.round(px * 1.5);
      if (m.layer.width !== lp) m.layer.width = m.layer.height = lp;
      this.paint(m.lctx, lp, bx, bz, m.half, { limit: ball.pickLimit() });
    }
    const c = m.ctx, h = px / 2, k = h / R;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, px, px);
    c.save();
    c.beginPath();
    c.arc(h, h, h, 0, Math.PI * 2);
    c.clip();
    c.translate(h, h);
    c.rotate(-yaw);
    c.translate((m.cx - bx) * k, (m.cz - bz) * k);
    const ls = m.half * 2 * k;
    c.drawImage(m.layer, -ls / 2, -ls / 2, ls, ls);
    c.restore();
    // what the camera sees: a soft wedge straight up
    const g = c.createRadialGradient(h, h, 0, h, h, h);
    g.addColorStop(0, 'rgba(255, 250, 235, 0.42)');
    g.addColorStop(1, 'rgba(255, 250, 235, 0)');
    c.fillStyle = g;
    c.beginPath();
    c.moveTo(h, h);
    c.arc(h, h, h, -Math.PI / 2 - hfov / 2, -Math.PI / 2 + hfov / 2);
    c.closePath();
    c.fill();
    // the ball, and which way it rolls
    const u = px / 110;
    // (a ball bigger than the map shows would cover it all: past a third of it, just a big dot)
    const br = Math.min(h * 0.3, Math.max(4 * u, (S / 2) * k));
    const a = ball.heading - yaw;
    c.save();
    c.translate(h, h);
    c.rotate(a);
    c.fillStyle = PAPER;
    c.strokeStyle = 'rgba(31, 27, 36, 0.9)';
    c.lineWidth = 1.5 * u;
    c.beginPath();
    c.moveTo(0, -br - 5 * u);
    c.lineTo(3.4 * u, -br - 0.5 * u);
    c.lineTo(-3.4 * u, -br - 0.5 * u);
    c.closePath();
    c.fill();
    c.stroke();
    c.restore();
    c.beginPath();
    c.arc(h, h, br, 0, Math.PI * 2);
    c.fillStyle = '#d8342c';
    c.fill();
    c.lineWidth = 1.6 * u;
    c.strokeStyle = PAPER;
    c.stroke();
    // north on the rim
    const na = -yaw, nr = h - 9 * u;
    const nx = h + Math.sin(na) * nr, ny = h - Math.cos(na) * nr;
    c.beginPath();
    c.arc(nx, ny, 7 * u, 0, Math.PI * 2);
    c.fillStyle = 'rgba(31, 27, 36, 0.85)';
    c.fill();
    c.fillStyle = PAPER;
    c.font = `700 ${Math.round(9 * u)}px "Noto Sans SC", "PingFang SC", sans-serif`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText('北', nx, ny + 0.5 * u);
  }

  // ---- the way rolled so far ----------------------------------------------------------------

  record(dt, ball) {
    this.trailT -= dt;
    if (this.trailT > 0) return;
    this.trailT = 0.5;
    const t = this.trail, x = ball.pos.x, z = ball.pos.z;
    const last = t[t.length - 1];
    if (last && Math.hypot(x - last[0], z - last[1]) < Math.max(0.3, ball.S * 0.5)) return;
    t.push([x, z]);
    if (t.length > 3000) {
      // keep every other point of the older half
      const keep = t.slice(0, 1500).filter((_, i) => i % 2 === 0);
      this.trail = keep.concat(t.slice(1500));
    }
  }

  // ---- the big map (pause screen) -------------------------------------------------------------

  /** whole: the whole town; otherwise the neighbourhood of the ball */
  drawBig(canvas, ball, whole) {
    const ctx = canvas.getContext('2d');
    const css = canvas.clientWidth;
    if (!ctx || !css) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const px = Math.round(css * dpr);
    if (canvas.width !== px || canvas.height !== px) canvas.width = canvas.height = px;
    const bx = ball.pos.x, bz = ball.pos.z;
    const half = whole ? 1260 : Math.max(40, mapRadius(ball.S) * 2.2);
    const cx = whole ? 0 : bx, cz = whole ? 0 : bz;
    this.paint(ctx, px, cx, cz, half, { limit: ball.pickLimit(), minPx: whole ? 0.9 : 1.2, dots: !whole, red: !whole });
    const k = px / (2 * half), u = px / 340;
    const X = x => px / 2 + (x - cx) * k, Z = z => px / 2 + (z - cz) * k;
    // the way rolled so far
    const t = this.trail;
    if (t.length > 1) {
      ctx.beginPath();
      ctx.moveTo(X(t[0][0]), Z(t[0][1]));
      for (let i = 1; i < t.length; i++) ctx.lineTo(X(t[i][0]), Z(t[i][1]));
      ctx.lineTo(X(bx), Z(bz));
      ctx.lineJoin = ctx.lineCap = 'round';
      ctx.strokeStyle = 'rgba(31, 27, 36, 0.55)';
      ctx.lineWidth = 4.5 * u;
      ctx.stroke();
      ctx.strokeStyle = GOLD;
      ctx.lineWidth = 2 * u;
      ctx.stroke();
    }
    // place names
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `${Math.round(13 * u)}px "ZCOOL KuaiLe", "PingFang SC", sans-serif`;
    for (const [name, x, z, from, to] of PLACES) {
      const sx = X(x), sy = Z(z);
      if (half < from || half > to || sx < -40 * u || sx > px + 40 * u || sy < 0 || sy > px) continue;
      ctx.lineWidth = 3.5 * u;
      ctx.strokeStyle = 'rgba(31, 27, 36, 0.8)';
      ctx.strokeText(name, sx, sy);
      ctx.fillStyle = PAPER;
      ctx.fillText(name, sx, sy);
    }
    // the ball: a red dot with a heading tick, ringed so it's easy to spot
    const sx = X(bx), sy = Z(bz);
    ctx.beginPath();
    ctx.arc(sx, sy, 13 * u, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(246, 239, 224, 0.9)';
    ctx.lineWidth = 2 * u;
    ctx.stroke();
    ctx.save();
    ctx.translate(sx, sy);
    ctx.rotate(ball.heading);
    ctx.beginPath();
    ctx.moveTo(0, -12 * u);
    ctx.lineTo(4.5 * u, -5 * u);
    ctx.lineTo(-4.5 * u, -5 * u);
    ctx.closePath();
    ctx.fillStyle = PAPER;
    ctx.fill();
    ctx.restore();
    ctx.beginPath();
    ctx.arc(sx, sy, 5.5 * u, 0, Math.PI * 2);
    ctx.fillStyle = '#d8342c';
    ctx.fill();
    ctx.lineWidth = 1.8 * u;
    ctx.strokeStyle = PAPER;
    ctx.stroke();
    // north arrow and scale
    ctx.fillStyle = 'rgba(31, 27, 36, 0.85)';
    ctx.beginPath();
    ctx.arc(px - 18 * u, 18 * u, 11 * u, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = PAPER;
    ctx.font = `700 ${Math.round(12 * u)}px "Noto Sans SC", "PingFang SC", sans-serif`;
    ctx.fillText('北', px - 18 * u, 18.5 * u);
    const [len, label] = niceScale(half * 0.4);
    const lx = 12 * u, ly = px - 14 * u, lw = len * k;
    ctx.fillStyle = 'rgba(31, 27, 36, 0.8)';
    ctx.fillRect(lx - 4 * u, ly - 15 * u, lw + 8 * u, 21 * u);
    ctx.fillStyle = PAPER;
    ctx.fillRect(lx, ly, lw, 2.5 * u);
    ctx.textAlign = 'left';
    ctx.font = `600 ${Math.round(10.5 * u)}px "Baloo 2", "PingFang SC", sans-serif`;
    ctx.fillText(label, lx, ly - 6 * u);
  }
}

// a rotated footprint rectangle into a path
function box(path, o) {
  const c = Math.cos(o.yaw), s = Math.sin(o.yaw);
  const cx = o.centerX(), cz = o.centerZ(), hw = o.hw, hd = o.hd;
  // local (lx, lz) → world (cx + lx·c + lz·s, cz − lx·s + lz·c)
  path.moveTo(cx - hw * c - hd * s, cz + hw * s - hd * c);
  path.lineTo(cx + hw * c - hd * s, cz - hw * s - hd * c);
  path.lineTo(cx + hw * c + hd * s, cz - hw * s + hd * c);
  path.lineTo(cx - hw * c + hd * s, cz + hw * s + hd * c);
  path.closePath();
}

// a round length near `x` metres for the scale bar
function niceScale(x) {
  const p = Math.pow(10, Math.floor(Math.log10(x)));
  const n = x / p >= 5 ? 5 : x / p >= 2 ? 2 : 1;
  const len = n * p;
  return [len, len >= 1000 ? `${len / 1000} km` : `${len} m`];
}
