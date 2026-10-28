// What stands on a hole and gets in the way — each with its own small rule:
//   obj    just there (a traffic cone, a seesaw, a fire hydrant): the ball bounces off it
//   fan    an electric fan: a strip of wind in front of it pushes the ball along; it swings a bit
//   bike   a bike or a car going back and forth across the road: it shoves the ball it meets
//   goose  guards the ground around it: when the ball comes near it waddles over and pecks it away
//   cat    sits by the green; every few seconds it crouches, then swipes the ball in front of it
//   tires  a wall of tyres painted red and white: the ball bounces off it harder than it came in,
//          with a boing
// Each returns { cols, update(dt, ball, game) }: cols join the course's (moving ones are updated
// in place, with their speed so they shove), update moves and animates it. The ones that do
// something to the ball also say what, in a few words, and where over them: tag { text, at() }.
import * as THREE from 'three';
import { BALL_R } from './physics.js';

const D = Math.PI / 180;
// round things get a round collider (and how much of their footprint it covers)
const ROUND = { traffic_cone: 0.9, fire_hydrant: 0.8, rose_pot: 0.9, potted_plant: 0.8, flower_bed: 1 };

export function buildProps(hole, course, ctx) {
  return hole.props.map(d => MAKERS[d.t](d, course, ctx));
}

/** what a thing does to the ball, said over it: at() is where (above the model's top) */
function tag(ctx, text, id, k, at) {
  const h = ctx.spec(id).dims.h * k + 0.25;
  return { text, at: () => { const [x, y, z] = at(); return [x, y + h, z]; } };
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
      cols: [], wind, tag: tag(ctx, '会吹偏球', 'electric_fan', 1.6, () => [p.x, -0.12, p.z]),
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
    // (a car comes down to len metres long, the size of a bike: a toy car, a taxi like a toy one)
    const s = ctx.spec(d.id), k = d.len ? d.len / s.maxDim : 1;
    const g = ctx.model(d.id, k);
    course.group.add(g);
    const col = { kind: 'box', x: A.x, z: A.z, hx: s.dims.w * k / 2 * 0.85, hz: s.dims.d * k / 2 * 0.9, rot: 0, e: 0.45, vx: 0, vz: 0 };
    let u = (d.phase || 0) * 2 * L, bell = 0, lean = 0;
    const ring = d.id === 'shared_bike' ? 'bell' : 'horn';
    const me = {
      cols: [col], tag: tag(ctx, '会撞开球', d.id, k, () => [col.x, 0, col.z]),
      hit(speed) { if (bell <= 0 && speed > 0.4) { ctx.audio.voice(ring); bell = 1.2; } },
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
        lean += ((moving || ring === 'horn' ? 0 : 0.12) - lean) * Math.min(1, dt * 5); // (a bike leans on its stand)
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
      cols: [col], tag: tag(ctx, '会追着啄球', 'goose', 1.15, () => [x, 0, z]),
      hit(speed) { if (honkCd <= 0 && speed > 0.5) { ctx.audio.voice('honk'); honkCd = 1; } },
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
          // (soft enough, and a long enough rest after, that a ball bouncing back off a wall
          // isn't pecked again before the player can take a shot)
          ball.vx = ux * 2.8; ball.vz = uz * 2.8;
          cd = 2.3; peck = 0.3;
          ctx.audio.voice('honk');
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
    // where the paw reaches, shown on the green with an edge round it, brighter as the cat gets ready
    const reach = 0.72, zr = 0.55;
    const zone = new THREE.Mesh(new THREE.CircleGeometry(zr, 28), new THREE.MeshBasicMaterial({ color: 0xff8a3d, transparent: true, opacity: 0.25, depthWrite: false }));
    zone.rotation.x = -Math.PI / 2;
    zone.position.set(p.x + fx * reach, 0.006, p.z + fz * reach);
    const rim = new THREE.Mesh(new THREE.RingGeometry(zr - 0.05, zr, 40), new THREE.MeshBasicMaterial({ color: 0xff6a1a, transparent: true, opacity: 0.7, depthWrite: false }));
    rim.position.z = 0.001; // (the zone is turned flat, so its z is up)
    zone.add(rim);
    course.group.add(zone);
    const col = { kind: 'circle', x: p.x, z: p.z, r: 0.24, e: 0.4 };
    const P = d.period || 2.4;
    // (one swipe a stroke: a ball batted against a wall can roll back into reach, and a cat that
    // swiped again every time it did could keep the player from ever getting a shot off)
    let t = (d.phase || 0) * P, batted = false, swiped = -1;
    return {
      cols: [col], tag: tag(ctx, '会拍球', d.id || 'cat_orange', 1.7, () => [p.x, 0, p.z]),
      update(dt, ball, game) {
        t += dt;
        const T = t % P;
        const crouch = T > P - 0.75 && T < P - 0.25, swipe = T >= P - 0.25;
        if (T < dt) batted = false;
        const ready = crouch ? (T - (P - 0.75)) / 0.5 : 0;
        zone.material.opacity = swipe ? 0.6 : 0.25 + ready * 0.3;
        rim.material.opacity = swipe || crouch ? 1 : 0.7;
        const lunge = swipe ? Math.sin(((T - (P - 0.25)) / 0.25) * Math.PI) * 0.3 : -ready * 0.06;
        g.position.set(p.x + fx * lunge, 0, p.z + fz * lunge);
        g.scale.set(1, crouch ? 1 - ready * 0.14 : 1, 1);
        if (swipe && !batted && game.live && game.strokes !== swiped) {
          const zx = p.x + fx * reach, zz = p.z + fz * reach;
          if (Math.hypot(ball.x - zx, ball.z - zz) < zr + BALL_R) {
            batted = true;
            swiped = game.strokes;
            // batted on, the way the cat faces, with a little of where it was going
            ball.vx = ball.vx * 0.3 + fx * 3.3; ball.vz = ball.vz * 0.3 + fz * 3.3;
            ctx.audio.voice('meow');
            ctx.fx.pickup(ball.x, 0.2, ball.z, 0.05, 0.25);
            game.pushed();
          }
        }
      },
    };
  },

  tires(d, course, ctx) {
    const p = course.at(...d.at), rot = (d.rot || 0) * D, k = d.s || 1;
    // a block of tyres two high, red and white in turn, filling the box the ball bounces off (the
    // size of the folded quilts that stood here first, so the holes play the same)
    const col = footprint(ctx, 'quilt_stack', k, p.x, p.z, rot, 1.15, 0.95);
    // (tyres no wider than 0.22 m across the short side and as many as fill the long one, so a cell is
    // near square; each one is stretched a little to its cell, and the block covers the box edge to edge)
    const h0 = Math.min(col.hx, col.hz), r0 = h0 / Math.ceil(h0 / 0.22);
    const nx = Math.max(1, Math.round(col.hx / r0)), nz = Math.max(1, Math.round(col.hz / r0));
    const sx = col.hx / nx, sz = col.hz / nz, R = Math.min(sx, sz), t = R * 0.36;
    const geo = new THREE.TorusGeometry(R - t, t, 8, 20);
    const paint = [new THREE.MeshLambertMaterial({ color: 0xe8453c }), new THREE.MeshLambertMaterial({ color: 0xf6f2ea })];
    const g = new THREE.Group();
    for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) for (let h = 0; h < 2; h++) {
      const m = new THREE.Mesh(geo, paint[(i + j) % 2]);
      m.rotation.x = Math.PI / 2;
      m.scale.set(sx / R, sz / R, 1); // (lying flat, the torus's own y is the world's z)
      m.position.set(-col.hx + sx + i * 2 * sx, t + h * 2 * t * 0.95, -col.hz + sz + j * 2 * sz);
      m.castShadow = true;
      m.receiveShadow = true;
      g.add(m);
    }
    g.position.set(p.x, 0, p.z);
    g.rotation.y = rot;
    course.group.add(g);
    let sq = 0;
    const top = 4 * t + 0.25;
    const me = {
      cols: [col], tag: { text: '超级弹', at: () => [p.x, top, p.z] },
      hit(speed) {
        if (speed < 0.3) return;
        sq = Math.min(1, 0.4 + speed / 6);
        ctx.audio.bump(Math.min(1, 0.35 + speed / 8)); // a thump and a spring's boing
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
