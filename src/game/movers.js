// Everything that moves on its own: pedestrians, wandering cats, traffic, pigeons that take off when
// the ball comes near, ducks on the pond, the square dance and the tai-chi group, spinning rotors.
// Creatures small enough to be rolled up run away screaming.

const TAU = Math.PI * 2;
const BPM = 128;

function prepPath(p) {
  const pts = p.loop ? [...p.pts, p.pts[0]] : p.pts;
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  p._pts = pts;
  p._cum = cum;
  p.len = cum[cum.length - 1];
}

function pointAt(p, s, out) {
  const cum = p._cum, pts = p._pts;
  if (p.loop) s = ((s % p.len) + p.len) % p.len;
  else s = Math.max(0, Math.min(p.len, s));
  let i = 1;
  while (i < cum.length - 1 && cum[i] < s) i++;
  const a = pts[i - 1], b = pts[i];
  const seg = cum[i] - cum[i - 1] || 1;
  const t = (s - cum[i - 1]) / seg;
  out.x = a[0] + (b[0] - a[0]) * t;
  out.z = a[1] + (b[1] - a[1]) * t;
  out.dx = (b[0] - a[0]) / seg;
  out.dz = (b[1] - a[1]) / seg;
  return out;
}

function project(p, x, z) {
  let best = 1e18, bestS = 0;
  const pts = p._pts, cum = p._cum;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    const vx = b[0] - a[0], vz = b[1] - a[1];
    const L2 = vx * vx + vz * vz || 1;
    const t = Math.max(0, Math.min(1, ((x - a[0]) * vx + (z - a[1]) * vz) / L2));
    const px = a[0] + vx * t, pz = a[1] + vz * t;
    const d = (px - x) ** 2 + (pz - z) ** 2;
    if (d < best) {
      best = d;
      bestS = cum[i - 1] + Math.sqrt(L2) * t;
    }
  }
  return { s: bestS, d: Math.sqrt(best) };
}

const angDiff = (a, b) => {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
};

const FLEES = new Set(['walk', 'wander', 'fly', 'swim', 'dance', 'taichi']);

export class Movers {
  constructor(world, layout) {
    this.world = world;
    this.L = layout;
    layout.paths.forEach(prepPath);
    layout.lanes.forEach(prepPath);
    this.frame = 0;
    this.screamCd = 0;
    this.danceStopped = false;
    this._pt = { x: 0, z: 0, dx: 0, dz: 1 };
    for (const o of world.movers) this.init(o);
  }

  nearest(list, x, z) {
    let bi = -1, bd = Infinity, bs = 0;
    list.forEach((p, i) => {
      const r = project(p, x, z);
      if (r.d < bd) {
        bd = r.d;
        bi = i;
        bs = r.s;
      }
    });
    return { i: bi, s: bs, d: bd };
  }

  init(o) {
    const m = o.mover;
    m.speed = m.speed || 1;
    m.acc = 0;
    m.phase = m.phase ?? Math.random() * TAU;
    const L = this.L;
    switch (m.kind) {
      case 'walk': {
        if (m.path === undefined) {
          const n = this.nearest(L.paths, o.x, o.z);
          if (n.i < 0 || n.d > 40) { m.kind = 'wander'; return this.init(o); }
          m.path = n.i;
          m.s = n.s;
        } else if (m.s === undefined) m.s = project(L.paths[m.path], o.x, o.z).s;
        m.dir = Math.random() < 0.5 ? 1 : -1;
        m.speed *= 0.85 + Math.random() * 0.3;
        break;
      }
      case 'drive': {
        if (m.lane === undefined) {
          const n = this.nearest(L.lanes.filter(l => !l.y), o.x, o.z);
          const lanes = L.lanes.filter(l => !l.y);
          if (n.i < 0) { m.kind = 'static'; return; }
          m.lane = L.lanes.indexOf(lanes[n.i]);
          m.s = n.s;
        } else if (m.s === undefined) m.s = project(L.lanes[m.lane], o.x, o.z).s;
        m.dir = 1;
        m.cur = m.speed;
        m.vx = 0;
        m.vz = 0;
        break;
      }
      case 'swim': {
        if (m.pond === undefined) {
          let bi = 0, bd = Infinity;
          (L.ponds || []).forEach((p, i) => {
            const d = Math.hypot(p.cx - o.x, p.cz - o.z);
            if (d < bd) { bd = d; bi = i; }
          });
          m.pond = bi;
        }
        m.target = null;
        break;
      }
      case 'fly':
        m.home = m.home || [o.x, o.z];
        m.state = 'ground';
        m.t = 0;
        m.radius = m.radius || 6;
        break;
      case 'dance':
      case 'taichi':
        m.slot = m.slot || [o.x, o.z];
        m.baseYaw = o.yaw;
        break;
      case 'spin':
        o.spin = m.phase || 0;
        break;
      default:
        m.home = m.home || [o.x, o.z];
        m.radius = m.radius || Math.max(3, Math.min(14, o.size * 12));
        m.wait = Math.random() * 3;
    }
  }

  /** the square-dance speaker got rolled up */
  stopDance() {
    if (this.danceStopped) return;
    this.danceStopped = true;
    const g = this.L.groups.dance;
    if (!g) return;
    for (const o of g.dancers) {
      if (!o || !o.mover) continue;
      o.mover.kind = 'wander';
      o.mover.home = [o.x, o.z];
      o.mover.radius = 6;
      o.mover.wait = 1 + Math.random() * 2;
      o.mover.confused = 2.5;
    }
  }

  update(dt, t, ball, events) {
    this.frame++;
    this.screamCd -= dt;
    const w = this.world;
    const bx = ball.pos.x, bz = ball.pos.z, S = ball.S;
    const limit = ball.pickLimit();
    const near = Math.max(60, S * 40);
    const pt = this._pt;
    const beat = (t * BPM) / 60;
    for (let i = 0; i < w.movers.length; i++) {
      const o = w.movers[i];
      if (o.state !== 0) continue;
      const m = o.mover;
      const dxb = o.x - bx, dzb = o.z - bz;
      const db = Math.hypot(dxb, dzb);
      // far movers tick less often, and ones too far away to be drawn at all hardly ever
      m.acc += dt;
      const every = db > o.type.dd + 30 ? 12 : db > near && m.kind !== 'spin' && m.kind !== 'drive' ? 4 : 1;
      if (every > 1 && (this.frame + i) % every !== 0) continue;
      const step = Math.min(0.25, m.acc);
      m.acc = 0;

      // run from a ball big enough to eat you
      if (FLEES.has(m.kind) && o.size <= limit && db < Math.max(2.2, S * 2.8) && m.kind !== 'fly') {
        if (!m.fleeing && this.screamCd <= 0) {
          events.push({ type: 'scream', o });
          this.screamCd = 0.6;
        }
        m.fleeing = 1.5;
        if (m.kind === 'walk' || m.kind === 'dance' || m.kind === 'taichi' || m.kind === 'swim') {
          m.kind = m.kind === 'swim' ? 'swim' : 'wander';
          m.home = [o.x, o.z];
          m.radius = m.radius || 8;
        }
      }

      switch (m.kind) {
        case 'walk': this.walk(o, m, step, pt, ball); break;
        case 'drive': this.drive(o, m, step, pt, ball, events); break;
        case 'wander': this.wander(o, m, step, t, dxb, dzb, db); break;
        case 'fly': this.fly(o, m, step, t, db, S); break;
        case 'swim': this.swim(o, m, step, t, dxb, dzb, db); break;
        case 'dance': this.dance(o, m, beat); break;
        case 'taichi': this.taichi(o, m, t); break;
        case 'spin': o.spin += (m.speed || 0.3) * step; break;
        default: break;
      }
      w.writeMatrix(o);
      w.grid.move(o);
    }
  }

  walk(o, m, dt, pt, ball) {
    const p = this.L.paths[m.path];
    if (!m.waiting) m.s += m.dir * m.speed * dt;
    if (!p.loop && (m.s <= 0 || m.s >= p.len)) {
      m.dir *= -1;
      m.s = Math.max(0, Math.min(p.len, m.s));
    }
    pointAt(p, m.s, pt);
    // people give the ball room: a few steps before it they move over to pass it by (on whichever
    // side is less of a detour), back onto the path after; one too big to step round, they wait for
    const fx = pt.dx * m.dir, fz = pt.dz * m.dir, sx = -fz, sz = fx;
    const rx = ball.pos.x - pt.x, rz = ball.pos.z - pt.z;
    const ahead = rx * fx + rz * fz, lat = rx * sx + rz * sz;
    const room = o.hw + ball.r + Math.max(0.6, ball.S * 0.8);
    let want = 0;
    m.waiting = false;
    if (ahead > -room && ahead < room + 5 && Math.abs(lat) < room) {
      const a = lat - room, b = lat + room;
      want = Math.abs(a) < Math.abs(b) ? a : b;
      if (Math.abs(want) > 2.5) {
        want = m.side || 0;
        m.waiting = ahead > 0 && ahead < room + 1.5;
      }
    }
    const side = m.side || 0;
    m.side = side + Math.max(-1.3 * dt, Math.min(1.3 * dt, want - side));
    o.x = pt.x + sx * m.side;
    o.z = pt.z + sz * m.side;
    const yaw = Math.atan2(fx, fz);
    o.yaw += angDiff(o.yaw, yaw) * Math.min(1, dt * 6);
    this.gait(o, m, dt, m.waiting ? 0 : m.speed);
  }

  gait(o, m, dt, speed) {
    m.phase += dt * (4 + speed * 5);
    const amp = Math.min(1, speed);
    o.bob = Math.abs(Math.sin(m.phase)) * o.h * 0.025 * amp;
    o.roll = Math.sin(m.phase) * 0.07 * amp;
  }

  wander(o, m, dt, t, dxb, dzb, db) {
    let speed = m.speed;
    let tx, tz;
    if (m.fleeing > 0) {
      m.fleeing -= dt;
      // panic, but a snail is still a snail
      speed = Math.min(m.speed * 2.4 + 0.6, m.speed * 2 + o.size * 5);
      const inv = 1 / (db || 1);
      tx = o.x + dxb * inv * 5;
      tz = o.z + dzb * inv * 5;
      m.home = [o.x, o.z];
    } else {
      if (m.confused > 0) {
        m.confused -= dt;
        o.yaw += dt * 3 * Math.sin(t * 2 + m.phase);
        o.bob = 0;
        o.roll = 0;
        return;
      }
      if (!m.target || m.wait > 0) {
        m.wait = (m.wait || 0) - dt;
        o.bob *= 0.8;
        o.roll *= 0.8;
        if (m.wait <= 0) {
          const a = Math.random() * TAU, r = Math.sqrt(Math.random()) * m.radius;
          m.target = [m.home[0] + Math.cos(a) * r, m.home[1] + Math.sin(a) * r];
          m.wait = 0;
        }
        return;
      }
      [tx, tz] = m.target;
    }
    const dx = tx - o.x, dz = tz - o.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.2 && !(m.fleeing > 0)) {
      m.target = null;
      m.wait = 0.8 + Math.random() * 3.5;
      return;
    }
    const v = Math.min(d, speed * dt);
    o.x += (dx / d) * v;
    o.z += (dz / d) * v;
    const yaw = Math.atan2(dx, dz);
    o.yaw += angDiff(o.yaw, yaw) * Math.min(1, dt * 7);
    this.gait(o, m, dt, speed);
  }

  drive(o, m, dt, pt, ball, events) {
    const lane = this.L.lanes[m.lane];
    // brake for a ball in the way that is too big to push through
    pointAt(lane, m.s, pt);
    const dirx = pt.dx * m.dir, dirz = pt.dz * m.dir;
    const bxr = ball.pos.x - o.x, bzr = ball.pos.z - o.z;
    const ahead = bxr * dirx + bzr * dirz;
    const side = Math.abs(bxr * dirz - bzr * dirx);
    const len = o.hd * 2;
    let target = m.speed;
    if (ahead > 0 && ahead < len * 2.5 + ball.r && side < o.hw + ball.r + 0.5 && ball.S > o.size * 0.35) {
      target = 0;
      if (!m.honked) {
        m.honked = true;
        events.push({ type: 'honk', o });
      }
    } else m.honked = false;
    m.cur += (target - m.cur) * Math.min(1, dt * (target < m.cur ? 4 : 1.2));
    m.s += m.dir * m.cur * dt;
    if (!lane.loop && (m.s <= 0 || m.s >= lane.len)) {
      m.dir *= -1;
      m.s = Math.max(0, Math.min(lane.len, m.s));
    }
    pointAt(lane, m.s, pt);
    const nx = pt.x, nz = pt.z;
    m.vx = (nx - o.x) / Math.max(dt, 1e-4);
    m.vz = (nz - o.z) / Math.max(dt, 1e-4);
    o.x = nx;
    o.z = nz;
    o.y = lane.y || o.baseY || 0;
    const yaw = Math.atan2(pt.dx * m.dir, pt.dz * m.dir);
    o.yaw += angDiff(o.yaw, yaw) * Math.min(1, dt * 5);
  }

  fly(o, m, dt, t, db, S) {
    const small = o.h < 0.2;
    if (m.state === 'ground') {
      // hop and peck
      m.t -= dt;
      o.pitch = Math.max(0, Math.sin(t * 6 + m.phase)) * 0.5;
      if (small) o.bob = 0.05 + Math.abs(Math.sin(t * 9 + m.phase)) * 0.05; // butterflies flutter low
      if (m.t <= 0) {
        m.t = 0.6 + Math.random() * 1.8;
        const a = Math.random() * TAU;
        o.yaw = a;
        const hop = small ? 0.8 : 0.25;
        o.x += Math.sin(a) * hop;
        o.z += Math.cos(a) * hop;
      }
      if (db < Math.max(1.6, S * 3.5) || (small && Math.random() < dt * 0.15)) {
        const a = Math.random() * TAU;
        const r = (small ? 3 : 8) + Math.random() * (small ? 6 : 16) + S * 2;
        m.from = [o.x, o.z];
        m.to = [m.home[0] + Math.cos(a) * r, m.home[1] + Math.sin(a) * r];
        m.state = 'flight';
        m.t = 0;
        m.dur = small ? 2.5 : 1.6 + Math.random();
        m.peak = (small ? 1.5 : 3.5) + Math.random() * 3 + S;
        o.yaw = Math.atan2(m.to[0] - o.x, m.to[1] - o.z);
      }
    } else {
      m.t += dt / m.dur;
      const k = Math.min(1, m.t);
      o.x = m.from[0] + (m.to[0] - m.from[0]) * k;
      o.z = m.from[1] + (m.to[1] - m.from[1]) * k;
      o.bob = Math.sin(k * Math.PI) * m.peak;
      o.pitch = -0.2;
      o.roll = Math.sin(t * 30) * 0.15;
      if (k >= 1) {
        m.state = 'ground';
        o.bob = 0;
        o.roll = 0;
        m.t = 0.5;
      }
    }
  }

  swim(o, m, dt, t, dxb, dzb, db) {
    const p = (this.L.ponds || [])[m.pond];
    if (!p) return;
    const inside = (x, z, k) => ((x - p.cx) / (p.rx * k)) ** 2 + ((z - p.cz) / (p.rz * k)) ** 2 < 1;
    let speed = m.speed;
    if (m.fleeing > 0) {
      m.fleeing -= dt;
      speed *= 2.5;
      m.target = [o.x + (dxb / (db || 1)) * 6, o.z + (dzb / (db || 1)) * 6];
    }
    if (!m.target || Math.hypot(m.target[0] - o.x, m.target[1] - o.z) < 0.4) {
      for (let k = 0; k < 8; k++) {
        const x = p.cx + (Math.random() * 2 - 1) * p.rx, z = p.cz + (Math.random() * 2 - 1) * p.rz;
        if (inside(x, z, 0.85)) { m.target = [x, z]; break; }
      }
      if (!m.target) m.target = [p.cx, p.cz];
    }
    const dx = m.target[0] - o.x, dz = m.target[1] - o.z;
    const d = Math.hypot(dx, dz) || 1;
    const nx = o.x + (dx / d) * speed * dt, nz = o.z + (dz / d) * speed * dt;
    if (inside(nx, nz, 0.92)) {
      o.x = nx;
      o.z = nz;
    } else m.target = null;
    o.yaw += angDiff(o.yaw, Math.atan2(dx, dz)) * Math.min(1, dt * 2);
    o.bob = Math.sin(t * 2 + m.phase) * 0.015 * (o.h + 0.2);
    o.roll = Math.sin(t * 1.7 + m.phase) * 0.05;
  }

  dance(o, m, beat) {
    // eight-count routine: step side to side, spin on 5–6, bounce on every beat
    const bar = beat % 8;
    const step = Math.sin(beat * Math.PI) * 0.35;
    o.x = m.slot[0] + (bar < 4 ? step : -step);
    o.z = m.slot[1];
    o.bob = Math.abs(Math.sin(beat * Math.PI)) * 0.09;
    const spin = bar >= 4 && bar < 6 ? ((bar - 4) / 2) * Math.PI * 2 : 0;
    o.yaw = m.baseYaw + spin + Math.sin(beat * Math.PI * 0.5) * 0.25;
    o.roll = Math.sin(beat * Math.PI) * 0.12;
  }

  taichi(o, m, t) {
    const ph = t * 0.35;
    o.x = m.slot[0] + Math.sin(ph) * 0.3;
    o.z = m.slot[1];
    o.yaw = m.baseYaw + Math.sin(ph * 0.5) * 1.1;
    o.bob = -Math.abs(Math.sin(ph)) * 0.12;
    o.roll = Math.sin(ph * 2) * 0.05;
  }
}
