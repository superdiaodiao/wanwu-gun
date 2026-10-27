// What stands on a hole and gets in the way — each with its own small rule:
//   obj    just there (a traffic cone, a mahjong table, a stone lion): the ball bounces off it
//   fan    an electric fan: a strip of wind in front of it pushes the ball along; it swings a bit
//   bike   a shared bike riding back and forth across the road: it shoves the ball it meets
//   goose  guards the ground around it: when the ball comes near it waddles over and pecks it away
//   cat    sits by the green; every few seconds it crouches, then swipes the ball in front of it
//   quilt  a folded quilt: the ball bounces off it harder than it came in, with a soft thump
// Each returns { cols, update(dt, ball, game) }: cols join the course's (moving ones are updated
// in place, with their speed so they shove), update moves and animates it.
import * as THREE from 'three';
import { BALL_R } from './physics.js';

const D = Math.PI / 180;
// round things get a round collider (and how much of their footprint it covers)
const ROUND = { traffic_cone: 0.9, plastic_stool: 0.9, rose_pot: 0.9, flower_bed: 1 };

export function buildProps(hole, course, ctx) {
  return hole.props.map(d => MAKERS[d.t](d, course, ctx));
}

/** a box (or round) collider the size of the model's footprint */
function footprint(ctx, id, k, x, z, rot, e, pad = 0.9) {
  const s = ctx.spec(id);
  if (ROUND[id]) return { kind: 'circle', x, z, r: (Math.min(s.dims.w, s.dims.d) * k) / 2 * ROUND[id], e };
  return { kind: 'box', x, z, hx: (s.dims.w * k) / 2 * pad, hz: (s.dims.d * k) / 2 * pad, rot, e };
}

const MAKERS = {
  obj(d, course, ctx) {
    const p = course.at(...d.at), rot = (d.rot || 0) * D, k = d.s || 1;
    const g = ctx.model(d.id, k);
    g.position.set(p.x, 0, p.z);
    g.rotation.y = rot;
    course.group.add(g);
    return { cols: [footprint(ctx, d.id, k, p.x, p.z, rot, 0.55)], update() {} };
  },

  fan(d, course, ctx) {
    const p = course.at(...d.at), [dx, dz] = d.dir, yaw = Math.atan2(dx, dz);
    const g = ctx.model('electric_fan', 1.6);
    g.position.set(p.x, -0.12, p.z);
    course.group.add(g);
    const wind = { x: p.x, z: p.z, dx, dz, len: d.len, w: d.w, a: d.a };
    course.winds.push(wind);
    // streaks of air drifting along the strip
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, depthWrite: false });
    const streaks = [];
    for (let i = 0; i < 14; i++) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.05), mat.clone());
      m.rotation.set(-Math.PI / 2, 0, Math.atan2(-dz, dx));
      course.group.add(m);
      streaks.push({ m, u: (i / 14) * d.len, side: ((i * 0.618) % 1 - 0.5) * d.w * 0.8 });
    }
    let t = Math.random() * 6;
    return {
      cols: [], wind,
      update(dt) {
        t += dt;
        g.rotation.y = yaw + Math.sin(t * 1.1) * 0.22; // an oscillating fan
        for (const s of streaks) {
          s.u = (s.u + dt * (3.2 - (s.u / d.len) * 1.5)) % d.len;
          const x = p.x + dx * s.u - dz * s.side, z = p.z + dz * s.u + dx * s.side;
          s.m.position.set(x, 0.05, z);
          s.m.material.opacity = 0.85 * Math.sin((s.u / d.len) * Math.PI);
        }
      },
    };
  },

  bike(d, course, ctx) {
    const A = course.at(...d.from), B = course.at(...d.to);
    const L = Math.hypot(B.x - A.x, B.z - A.z), ux = (B.x - A.x) / L, uz = (B.z - A.z) / L;
    const g = ctx.model(d.id, 1);
    course.group.add(g);
    const s = ctx.spec(d.id);
    const col = { kind: 'box', x: A.x, z: A.z, hx: s.dims.w / 2 * 0.85, hz: s.dims.d / 2 * 0.9, rot: 0, e: 0.45, vx: 0, vz: 0 };
    let u = (d.phase || 0) * 2 * L, bell = 0, lean = 0;
    const me = {
      cols: [col],
      hit(speed) { if (bell <= 0 && speed > 0.4) { ctx.audio.pickup('bell', 0.6, 1.2); bell = 1.2; } },
      update(dt) {
        bell -= dt;
        // ride to the end, a short stop, ride back
        const span = 2 * L + 2 * 0.6 * d.speed;
        u = (u + d.speed * dt) % span;
        const half = L + 0.6 * d.speed;
        const k = u < half ? Math.min(u, L) : Math.max(0, L - (u - half));
        const moving = u < half ? u < L : u - half < L;
        const dir = u < half ? 1 : -1;
        col.x = A.x + ux * k; col.z = A.z + uz * k;
        col.vx = moving ? ux * d.speed * dir : 0;
        col.vz = moving ? uz * d.speed * dir : 0;
        col.rot = Math.atan2(ux * dir, uz * dir);
        lean += ((moving ? 0 : 0.12) - lean) * Math.min(1, dt * 5);
        g.position.set(col.x, 0, col.z);
        g.rotation.set(0, col.rot, lean);
      },
    };
    col.owner = me;
    return me;
  },

  goose(d, course, ctx) {
    const home = course.at(...d.at);
    const g = ctx.model('goose', 1.15);
    g.rotation.order = 'YXZ'; // so the peck dips its head forward, whichever way it faces
    course.group.add(g);
    const col = { kind: 'circle', x: home.x, z: home.z, r: 0.24, e: 0.4, vx: 0, vz: 0 };
    let x = home.x, z = home.z, yaw = Math.PI, cd = 0, peck = 0, walk = 0, honkCd = 0, t = Math.random() * 5;
    const me = {
      cols: [col],
      hit(speed) { if (honkCd <= 0 && speed > 0.5) { ctx.audio.pickup('honk', 0.5, 0.8); honkCd = 1; } },
      update(dt, ball, game) {
        t += dt; cd -= dt; peck -= dt; honkCd -= dt;
        const near = Math.hypot(ball.x - home.x, ball.z - home.z) < d.aggro;
        const chase = cd <= 0 && near && game.live;
        const tx = chase ? ball.x : home.x, tz = chase ? ball.z : home.z;
        let vx = 0, vz = 0;
        const dx = tx - x, dz = tz - z, dist = Math.hypot(dx, dz);
        const sp = chase ? 1.55 : 0.8;
        if (dist > (chase ? 0.05 : 0.08)) {
          const step = Math.min(dist, sp * dt);
          vx = (dx / dist) * sp; vz = (dz / dist) * sp;
          x += (dx / dist) * step; z += (dz / dist) * step;
          // not out of its patch
          const hx = x - home.x, hz = z - home.z, hd = Math.hypot(hx, hz);
          if (hd > d.leash) { x = home.x + (hx / hd) * d.leash; z = home.z + (hz / hd) * d.leash; }
          yaw += angDiff(yaw, Math.atan2(dx, dz)) * Math.min(1, dt * 8);
          walk += dt * 14;
        } else if (!chase) {
          // home: look about now and then
          yaw += angDiff(yaw, Math.PI + Math.sin(t * 0.7) * 0.9) * Math.min(1, dt * 2);
        }
        // got it: a peck that sends the ball off, away from the goose
        const bx = ball.x - x, bz = ball.z - z, bd = Math.hypot(bx, bz);
        if (chase && bd < col.r + BALL_R + 0.14) {
          const ux = bd > 1e-4 ? bx / bd : 0, uz = bd > 1e-4 ? bz / bd : -1;
          ball.vx = ux * 3.4; ball.vz = uz * 3.4;
          cd = 1.8; peck = 0.3;
          ctx.audio.pickup('honk', 0.7, 0.8);
          honkCd = 1;
          ctx.fx.pickup(ball.x, 0.2, ball.z, 0.05, 0.25);
          game.pushed();
        }
        col.x = x; col.z = z; col.vx = vx; col.vz = vz;
        g.position.set(x, Math.abs(Math.sin(walk)) * 0.03, z);
        g.rotation.set(peck > 0 ? 0.45 : 0, yaw, vx || vz ? Math.sin(walk) * 0.12 : 0);
      },
    };
    col.owner = me;
    return me;
  },

  cat(d, course, ctx) {
    const p = course.at(...d.at), f = d.face * D, fx = Math.sin(f), fz = -Math.cos(f);
    const g = ctx.model(d.id || 'cat_orange', 1.7);
    g.position.set(p.x, 0, p.z);
    g.rotation.y = Math.atan2(fx, fz);
    course.group.add(g);
    // where the paw reaches, shown faintly on the green, brighter as the cat gets ready
    const reach = 0.72, zr = 0.55;
    const zone = new THREE.Mesh(new THREE.CircleGeometry(zr, 28), new THREE.MeshBasicMaterial({ color: 0xff8a3d, transparent: true, opacity: 0.12, depthWrite: false }));
    zone.rotation.x = -Math.PI / 2;
    zone.position.set(p.x + fx * reach, 0.006, p.z + fz * reach);
    course.group.add(zone);
    const col = { kind: 'circle', x: p.x, z: p.z, r: 0.24, e: 0.4 };
    const P = d.period || 2.4;
    let t = (d.phase || 0) * P, batted = false;
    return {
      cols: [col],
      update(dt, ball, game) {
        t += dt;
        const T = t % P;
        const crouch = T > P - 0.75 && T < P - 0.25, swipe = T >= P - 0.25;
        if (T < dt) batted = false;
        const ready = crouch ? (T - (P - 0.75)) / 0.5 : 0;
        zone.material.opacity = swipe ? 0.5 : 0.1 + ready * 0.3;
        const lunge = swipe ? Math.sin(((T - (P - 0.25)) / 0.25) * Math.PI) * 0.3 : -ready * 0.06;
        g.position.set(p.x + fx * lunge, 0, p.z + fz * lunge);
        g.scale.set(1, crouch ? 1 - ready * 0.14 : 1, 1);
        if (swipe && !batted && game.live) {
          const zx = p.x + fx * reach, zz = p.z + fz * reach;
          if (Math.hypot(ball.x - zx, ball.z - zz) < zr + BALL_R) {
            batted = true;
            // batted on, the way the cat faces, with a little of where it was going
            ball.vx = ball.vx * 0.3 + fx * 3.3; ball.vz = ball.vz * 0.3 + fz * 3.3;
            ctx.audio.pickup('meow', 0.6, 0.4);
            ctx.fx.pickup(ball.x, 0.2, ball.z, 0.05, 0.25);
            game.pushed();
          }
        }
      },
    };
  },

  quilt(d, course, ctx) {
    const p = course.at(...d.at), rot = (d.rot || 0) * D, k = d.s || 1;
    const g = ctx.model('quilt_stack', k);
    g.position.set(p.x, 0, p.z);
    g.rotation.y = rot;
    course.group.add(g);
    const col = footprint(ctx, 'quilt_stack', k, p.x, p.z, rot, 1.15, 0.95);
    let sq = 0;
    const me = {
      cols: [col],
      hit(speed) {
        if (speed < 0.3) return;
        sq = Math.min(1, 0.4 + speed / 6);
        ctx.audio.pickup('soft', 0.8, 0.8);
      },
      update(dt) {
        sq = Math.max(0, sq - dt * 3);
        const s = Math.sin(sq * Math.PI) * 0.2;
        g.scale.set(1 + s, 1 - s, 1 + s);
      },
    };
    col.owner = me;
    return me;
  },
};

function angDiff(a, b) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}
