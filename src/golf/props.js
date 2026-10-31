// What stands on a hole and gets in the way — each with its own small rule:
//   obj    just there (a traffic cone, a seesaw, a fire hydrant): the ball bounces off it
//   fan    an electric fan: a strip of wind in front of it pushes the ball along; it swings a bit
//   bike   a bike or a car going back and forth across the road: it shoves the ball it meets
//   goose  guards the ground around it: when the ball comes near it waddles over and pecks it away
//   cat    sits by the green; every few seconds it crouches, then swipes the ball in front of it
//   tires  a wall of tyres painted red and white: the ball bounces off it harder than it came in,
//          with a boing
//   windmill  the ball goes through the tunnel under it; its sails sweep down past the door and
//          knock back a ball that comes when one is in the way
//   spinner   a lawn sprinkler: its arm sweeps round and shoves the ball it meets
// Each returns { cols, update(dt, ball, game) }: cols join the course's (moving ones are updated
// in place, with their speed so they shove), update moves and animates it. The ones that do
// something to the ball also say what, in a few words, and where over them: tag { text, at() }.
import * as THREE from 'three';
import { BALL_R } from './physics.js';

const D = Math.PI / 180;
const GOOSE = 1.3, CAT = 1.7, DOG = 1.4; // (bigger than life, to be seen from where the hole is watched)
// round things get a round collider (and how much of their footprint it covers)
const ROUND = { traffic_cone: 0.9, fire_hydrant: 0.8, rose_pot: 0.9, potted_plant: 0.8, flower_bed: 1, rubber_duck: 0.85 };

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
    g.position.set(p.x, course.Y(p.x, p.z), p.z);
    g.rotation.y = rot;
    course.group.add(g);
    return { cols: [footprint(ctx, d.id, k, p.x, p.z, rot, 0.55)], update() {} };
  },

  fan(d, course, ctx) {
    const p = course.at(...d.at), [dx, dz] = d.dir, yaw = Math.atan2(dx, dz);
    const g = ctx.model('electric_fan', 1.6);
    g.position.set(p.x, -0.03, p.z);
    course.group.add(g);
    course.pad(p.x, p.z, 1.2, 1.2); // (it stands beside the green, over the pond: on a block of its own)
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
      cols: [], wind, tag: tag(ctx, '会吹偏球', 'electric_fan', 1.6, () => [p.x, -0.03, p.z]),
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
    let u = (d.phase || 0) * 2 * L, bell = 0, lean = 0, yaw = null;
    // (a robot mower turns round on the spot at each end, and chimes; a bike rings, a car hoots)
    const bike = d.id.includes('bike'), mower = d.id === 'mower';
    const ring = bike || mower ? 'bell' : 'horn';
    const me = {
      cols: [col], tag: tag(ctx, '会撞开球', d.id, k, () => [col.x, course.Y(col.x, col.z), col.z]),
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
        const head = Math.atan2(ux * dir, uz * dir);
        yaw = yaw === null || !mower ? head : yaw + angDiff(yaw, head) * Math.min(1, dt * 6);
        col.rot = yaw;
        lean += ((moving || !bike ? 0 : 0.12) - lean) * Math.min(1, dt * 5); // (a bike leans on its stand)
        g.position.set(col.x, course.Y(col.x, col.z), col.z);
        g.rotation.set(0, col.rot, lean);
      },
    };
    col.owner = me;
    return me;
  },

  // stands beside the green on a block of its own and keeps an eye on the ball, turning after it;
  // a ball rolling close makes it hop and honk, or bark (no more than once a stroke)
  watch(d, course, ctx) {
    const p = course.at(...d.at), k = d.s || (d.id === 'goose' ? GOOSE : DOG), call = d.id.startsWith('dog') ? 'bark' : 'honk';
    course.pad(p.x, p.z, 1.1, 1.1);
    const g = ctx.model(d.id, k);
    course.group.add(g);
    let yaw = 0, hop = 0, heard = -1;
    return {
      cols: [],
      update(dt, ball, game) {
        yaw += angDiff(yaw, Math.atan2(ball.x - p.x, ball.z - p.z)) * Math.min(1, dt * 3);
        hop = Math.max(0, hop - dt * 2.5);
        if (game.state === 'roll' && heard !== game.strokes && Math.hypot(ball.x - p.x, ball.z - p.z) < 1.6) {
          heard = game.strokes;
          hop = 1;
          ctx.audio.voice(call);
        }
        g.position.set(p.x, -0.03 + Math.sin(hop * Math.PI) * 0.25, p.z);
        g.rotation.y = yaw;
      },
    };
  },

  // (or a dog, which barks: d.id)
  goose(d, course, ctx) {
    const home = course.at(...d.at), id = d.id || 'goose', call = id.startsWith('dog') ? 'bark' : 'honk';
    const g = ctx.model(id, id === 'goose' ? GOOSE : DOG);
    g.rotation.order = 'YXZ'; // so the peck dips its head forward, whichever way it faces
    course.group.add(g);
    const col = { kind: 'circle', x: home.x, z: home.z, r: 0.24, e: 0.4, vx: 0, vz: 0 };
    let x = home.x, z = home.z, yaw = Math.PI, cd = 0, peck = 0, walk = 0, honkCd = 0, t = Math.random() * 5, rest = 0, nosed = -1;
    const me = {
      cols: [col], tag: tag(ctx, id === 'goose' ? '会追着啄球' : '会追着拱球', id, id === 'goose' ? GOOSE : DOG, () => [x, course.Y(x, z), z]),
      hit(speed) { if (honkCd <= 0 && speed > 0.5) { ctx.audio.voice(call); honkCd = 1; } },
      update(dt, ball, game) {
        t += dt; cd -= dt; peck -= dt; honkCd -= dt;
        // (a dog goes only for a ball that has lain still a while, and noses it on once a stroke: on a
        // slope a ball it nudges away can roll back to it, and it mustn't keep the player from ever
        // taking the shot; the goose is as it was)
        rest = game.state !== 'aim' ? 0 : game.aim ? rest : rest + dt; // (not while being aimed: it waits for the shot)
        const near = Math.hypot(ball.x - home.x, ball.z - home.z) < d.aggro;
        const chase = cd <= 0 && near && game.live && (id === 'goose' || (rest > 2.5 && nosed !== game.strokes));
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
          cd = 2.3; peck = 0.3; nosed = game.strokes;
          ctx.audio.voice(call);
          honkCd = 1;
          ctx.fx.pickup(ball.x, 0.2 + course.Y(ball.x, ball.z), ball.z, 0.05, 0.25);
          game.pushed();
        }
        col.x = x; col.z = z; col.vx = vx; col.vz = vz;
        g.position.set(x, course.Y(x, z) + Math.abs(Math.sin(walk)) * 0.03, z);
        g.rotation.set(peck > 0 ? 0.45 : 0, yaw, vx || vz ? Math.sin(walk) * 0.12 : 0);
      },
    };
    col.owner = me;
    return me;
  },

  cat(d, course, ctx) {
    const p = course.at(...d.at), f = d.face * D, fx = Math.sin(f), fz = -Math.cos(f);
    const g = ctx.model(d.id || 'cat_orange', CAT), y0 = course.Y(p.x, p.z);
    g.position.set(p.x, y0, p.z);
    g.rotation.y = Math.atan2(fx, fz);
    course.group.add(g);
    // where the paw reaches, shown on the green with an edge round it, brighter as the cat gets ready
    const reach = 0.72, zr = 0.55;
    const zone = new THREE.Mesh(new THREE.CircleGeometry(zr, 28), new THREE.MeshBasicMaterial({ color: 0xff8a3d, transparent: true, opacity: 0.25, depthWrite: false }));
    zone.rotation.x = -Math.PI / 2;
    zone.position.set(p.x + fx * reach, 0.006 + course.Y(p.x + fx * reach, p.z + fz * reach), p.z + fz * reach);
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
      cols: [col], tag: tag(ctx, '会拍球', d.id || 'cat_orange', CAT, () => [p.x, y0, p.z]),
      update(dt, ball, game) {
        t += dt;
        const T = t % P;
        const crouch = T > P - 0.75 && T < P - 0.25, swipe = T >= P - 0.25;
        if (T < dt) batted = false;
        const ready = crouch ? (T - (P - 0.75)) / 0.5 : 0;
        zone.material.opacity = swipe ? 0.6 : 0.25 + ready * 0.3;
        rim.material.opacity = swipe || crouch ? 1 : 0.7;
        const lunge = swipe ? Math.sin(((T - (P - 0.25)) / 0.25) * Math.PI) * 0.3 : -ready * 0.06;
        g.position.set(p.x + fx * lunge, y0, p.z + fz * lunge);
        g.scale.set(1, crouch ? 1 - ready * 0.14 : 1, 1);
        if (swipe && !batted && game.live && game.strokes !== swiped) {
          const zx = p.x + fx * reach, zz = p.z + fz * reach;
          if (Math.hypot(ball.x - zx, ball.z - zz) < zr + BALL_R) {
            batted = true;
            swiped = game.strokes;
            // batted on, the way the cat faces, with a little of where it was going
            ball.vx = ball.vx * 0.3 + fx * 3.3; ball.vz = ball.vz * 0.3 + fz * 3.3;
            ctx.audio.voice('meow');
            ctx.fx.pickup(ball.x, 0.2 + course.Y(ball.x, ball.z), ball.z, 0.05, 0.25);
            game.pushed();
          }
        }
      },
    };
  },

  tires(d, course, ctx) {
    if (d.corner) return cornerTires(d, course, ctx);
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
    const y0 = course.Y(p.x, p.z);
    g.position.set(p.x, y0, p.z);
    g.rotation.y = rot;
    course.group.add(g);
    let sq = 0;
    const top = 4 * t + 0.25 + y0;
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

  // the windmill straddles the green: the ball gets through by the tunnel along its middle, its sails
  // turning in front of the tunnel's door; while one sweeps down past the door it knocks the ball
  // back (and a little sideways, the way it is going). Its walls either side are solid.
  windmill(d, course, ctx) {
    const p = course.at(...d.at), y0 = course.Y(p.x, p.z), w = d.speed || 0.8, k = d.s || 1;
    const house = place(ctx, 'windmill', k, p.x, y0, p.z);
    course.group.add(house);
    // the sails turn about the axle out of the tower's front, 1.6 m up and 0.78 m out (as made: k times
    // that); the house is 2.4 m across, its tunnel 0.9 m, 1.4 m deep
    const HUB = 1.6 * k, OUT = 0.78 * k, REACH = 1.45 * k, SAIL = 0.32 * k;
    const rotor = ctx.model('windmill_rotor', k);
    rotor.children[0].position.set(0, -ctx.spec('windmill_rotor').center.y * k, 0); // (the hub on the group's origin)
    rotor.position.set(p.x, y0 + HUB, p.z + OUT);
    course.group.add(rotor);
    // (its walls reach out to `fill` metres either side of its middle where the green is wider than the
    // house: a trough of flowers stands in each gap, so that the ball gets past only by the tunnel)
    const out = Math.max(1.2 * k, d.fill || 0), whx = (out - 0.45 * k) / 2;
    const wall = sx => ({ kind: 'box', x: p.x + sx * (0.45 * k + whx), z: p.z, hx: whx, hz: 0.7 * k, rot: 0, e: 0.5 });
    if (out > 1.2 * k + 0.01) for (const sx of [-1, 1]) course.group.add(trough(out - 1.2 * k, 1.4 * k, p.x + sx * (1.2 * k + out) / 2, y0, p.z));
    // the sail in the way: where the lowest one crosses the ball's height, its canvas off to one side
    // of its spar (the trailing side), thin, in front of the door; off while none is low enough
    const sail = { kind: 'box', x: p.x, z: p.z + OUT, hx: SAIL / 2 + 0.04, hz: 0.05 * k, rot: 0, e: 0.45, vx: 0, vz: 0, off: true };
    let a = (d.phase || 0) * (Math.PI / 2), knock = 0;
    const me = {
      cols: [wall(-1), wall(1), sail], tag: { text: '等叶片转开', at: () => [p.x, y0 + 0.95 * k, p.z + OUT] },
      // (its roof's peak, see aim(); and the box it fills, behind which the ball is seen through it)
      tall: { x: p.x, y0, y: y0 + ctx.spec('windmill').dims.h * k, z: p.z, hx: 1.2 * k, hz: 0.7 * k + 0.1 },
      hit(speed) { if (knock <= 0 && speed > 0.4) { ctx.audio.wall(Math.min(1, speed / 6)); knock = 0.3; } },
      update(dt) {
        knock -= dt;
        a = (a + w * dt) % (Math.PI * 2);
        rotor.rotation.z = a;
        // the blade nearest straight down, as an angle from it (the blades are 90° apart)
        let f = ((a % (Math.PI / 2)) + Math.PI / 2) % (Math.PI / 2);
        if (f > Math.PI / 4) f -= Math.PI / 2;
        const drop = HUB - 0.14; // (from the hub down to the ball's middle)
        // (low enough to hit: the tip, or past the bottom the canvas's trailing corner, which hangs lower)
        const low = HUB - REACH * Math.cos(f) - Math.max(0, SAIL * Math.sin(f)) < 2 * BALL_R;
        sail.off = !low;
        if (low) {
          // turning +z (anticlockwise as the player sees it) the blade at the bottom moves to +x, its
          // canvas trailing on the -x side
          const cross = Math.tan(f) * drop, side = -(SAIL / 2) / Math.cos(f);
          sail.x = p.x + cross + side;
          sail.hx = (SAIL / 2 + 0.04) / Math.cos(f);
          sail.vx = (w * drop) / (Math.cos(f) * Math.cos(f));
          // (but never closer than a ball's width to the house's ends: it would shove a ball resting
          // in front of the house through the rail there)
          const lim = 1.2 * k - 2 * BALL_R - 0.02, x0 = Math.max(sail.x - sail.hx, p.x - lim), x1 = Math.min(sail.x + sail.hx, p.x + lim);
          if (x1 <= x0) sail.off = true;
          else { sail.x = (x0 + x1) / 2; sail.hx = (x1 - x0) / 2; }
        }
      },
    };
    sail.owner = me;
    return me;
  },

  // a lawn sprinkler: an arm `len` metres end to end turns on a post, `speed` radians a second, and
  // shoves the ball out of its way; water sprays from its tips
  spinner(d, course, ctx) {
    const p = course.at(...d.at), y0 = course.Y(p.x, p.z), len = d.len || 2, w = d.speed || 1.2;
    course.group.add(place(ctx, 'sprinkler_base', 1, p.x, y0, p.z));
    const k = len / 2; // (the arm is 2 m long as made)
    const arm = place(ctx, 'sprinkler_arm', k, 0, 0, 0), spin = new THREE.Group();
    spin.position.set(p.x, y0 + 0.095, p.z); // (its collar sat on the base's hub, the bar at the ball's middle)
    spin.add(arm);
    course.group.add(spin);
    const col = { kind: 'box', x: p.x, z: p.z, hx: len / 2, hz: 0.07, rot: 0, e: 0.55, w };
    const post = { kind: 'circle', x: p.x, z: p.z, r: 0.18, e: 0.5 };
    // drops thrown up and out from both tips as they go round, falling back on the green
    const N = 56, drops = new THREE.InstancedMesh(new THREE.SphereGeometry(0.035, 6, 4), new THREE.MeshBasicMaterial({ color: 0xc8f0ff, transparent: true, opacity: 0.85, depthWrite: false }), N);
    drops.frustumCulled = false;
    course.group.add(drops);
    const ps = Array.from({ length: N }, () => ({ t: 9, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0 }));
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), one = new THREE.Vector3(1, 1, 1), v = new THREE.Vector3();
    let a = (d.phase || 0) * Math.PI, next = 0, swish = 0;
    const me = {
      cols: [col, post], tag: { text: '转臂会扫开球', at: () => [p.x, y0 + 0.5, p.z] },
      hit(speed) { if (swish <= 0 && speed > 0.3) { ctx.audio.voice('splash', 0.6); swish = 0.5; } },
      update(dt) {
        swish -= dt;
        a += w * dt;
        col.rot = a;
        spin.rotation.y = a;
        // (a positive turn takes the arm's +x end towards -z)
        const cx = Math.cos(a), cz = -Math.sin(a);
        for (next -= dt; next < 0; next += 0.022) {
          let d0 = null;
          for (const o of ps) if (o.t > 0.7) { d0 = o; break; }
          if (!d0) break;
          const s = Math.random() < 0.5 ? 1 : -1, r = len / 2;
          // (out of each nozzle the way it points: outwards, up, and ahead of the arm)
          d0.t = 0; d0.x = p.x + cx * r * s; d0.y = y0 + 0.2; d0.z = p.z + cz * r * s;
          d0.vx = cx * s * 1.1 + cz * s * 0.9 + (Math.random() - 0.5) * 0.4;
          d0.vy = 1.6 + Math.random() * 0.8;
          d0.vz = cz * s * 1.1 - cx * s * 0.9 + (Math.random() - 0.5) * 0.4;
        }
        for (let i = 0; i < N; i++) {
          const o = ps[i];
          o.t += dt;
          if (o.t > 0.7) { drops.setMatrixAt(i, m4.makeScale(0, 0, 0)); continue; }
          o.vy -= 9 * dt;
          o.x += o.vx * dt; o.y += o.vy * dt; o.z += o.vz * dt;
          drops.setMatrixAt(i, m4.compose(v.set(o.x, o.y, o.z), q, one));
        }
        drops.instanceMatrix.needsUpdate = true;
      },
    };
    col.owner = me;
    return me;
  },
};

/** a wooden trough w by d metres full of flowers, standing at (x, y, z) */
const TROUGH = { wood: new THREE.MeshLambertMaterial({ color: 0xa8743f }), soil: new THREE.MeshLambertMaterial({ color: 0x5a3b22 }),
  bloom: [0xff5f7e, 0xffd23f, 0xffffff, 0xff8a3d, 0xc77dff].map(c => new THREE.MeshLambertMaterial({ color: c })), leaf: new THREE.MeshLambertMaterial({ color: 0x3f9a3a }) };
function trough(w, d, x, y, z) {
  const g = new THREE.Group(), h = 0.3;
  const box = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), TROUGH.wood);
  box.position.y = h / 2;
  const soil = new THREE.Mesh(new THREE.BoxGeometry(w - 0.06, 0.02, d - 0.06), TROUGH.soil);
  soil.position.y = h - 0.02;
  g.add(box, soil);
  const ball = new THREE.SphereGeometry(1, 7, 5), n = Math.max(2, Math.round(d / 0.16));
  for (let i = 0; i < n; i++) {
    const leaf = new THREE.Mesh(ball, TROUGH.leaf), fz = -d / 2 + 0.08 + ((d - 0.16) * i) / (n - 1);
    leaf.scale.set(w * 0.42, 0.07, 0.1);
    leaf.position.set(0, h + 0.03, fz);
    const f = new THREE.Mesh(ball, TROUGH.bloom[i % TROUGH.bloom.length]);
    f.scale.setScalar(Math.min(0.06, w * 0.25));
    f.position.set(((i % 3) - 1) * w * 0.15, h + 0.08, fz);
    g.add(leaf, f);
  }
  g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  g.position.set(x, y, z);
  return g;
}

/** a model with its own origin (the middle of its footprint as made, on the ground) at (x, y, z),
 *  however lopsided its box is (model() centres the box) */
function place(ctx, id, k, x, y, z) {
  const s = ctx.spec(id), g = ctx.model(id, k);
  g.position.set(x + s.center.x * k, y + s.bbox.min.y * k, z + s.center.z * k);
  return g;
}

/** tyres piled into a corner of the green, their front a bank across it at 45° from rail to rail
 *  (`leg` metres along each rail from the corner): the ball bounces round the corner off it and
 *  can't get in behind, where a block of tyres standing across the corner left a pocket at each end */
function cornerTires(d, course, ctx) {
  const p = course.at(...d.corner), leg = d.leg || 2;
  // the rails run from the corner towards the middle of the course
  const b = course.bounds, sx = Math.sign((b.x0 + b.x1) / 2 - p.x), sz = Math.sign((b.z0 + b.z1) / 2 - p.z);
  const h = leg / Math.SQRT2; // the corner's distance from the bank
  const mx = (sx * Math.SQRT1_2), mz = (sz * Math.SQRT1_2); // out of the corner, square to the bank
  const tx = -mz, tz = mx; // along the bank
  const R = 0.2, t = R * 0.36;
  // rows along the bank, the front one flush with it, each further one fitted into the hexagonal
  // gaps of the one before and as long as the narrowing corner leaves room for (the end ones lean
  // on the rails a little)
  const spots = [];
  let n0 = 0;
  for (let row = 0, dep = R; dep < h - R * 0.5; row++, dep += R * 1.75) {
    const a = h - dep, n = Math.max(1, Math.floor((a - R * 0.7) / R) + 1);
    if (!row) n0 = n;
    // (each row has one tyre fewer or more than the one before, so it sits half a tyre over)
    const m = Math.max(1, n % 2 === (n0 + row) % 2 ? n : n - 1);
    for (let i = 0; i < m; i++) {
      const lat = (i - (m - 1) / 2) * 2 * R;
      spots.push({ x: p.x + mx * a + tx * lat, z: p.z + mz * a + tz * lat, c: (row + i) % 2 });
    }
  }
  const geo = new THREE.TorusGeometry(R - t, t, 8, 20).rotateX(Math.PI / 2);
  const paint = [0xe8453c, 0xf6f2ea].map(c => new THREE.MeshLambertMaterial({ color: c }));
  // (the pile squashes about the middle of its front when hit)
  const fx0 = p.x + mx * h, fz0 = p.z + mz * h;
  const g = new THREE.Group();
  g.position.set(fx0, 0, fz0);
  const m4 = new THREE.Matrix4();
  for (const c of [0, 1]) {
    const mine = spots.filter(s => s.c === c);
    const im = new THREE.InstancedMesh(geo, paint[c], mine.length * 2);
    mine.forEach((s, i) => {
      for (let lv = 0; lv < 2; lv++) im.setMatrixAt(i * 2 + lv, m4.makeTranslation(s.x - fx0, t + lv * 2 * t * 0.95, s.z - fz0));
    });
    im.castShadow = true;
    im.receiveShadow = true;
    g.add(im);
  }
  course.group.add(g);
  // the bank: from rail to rail, on into them a little so there is no gap at either end
  const e = h + 0.3;
  const col = { kind: 'seg', ax: fx0 + tx * e, az: fz0 + tz * e, bx: fx0 - tx * e, bz: fz0 - tz * e, e: 1.15 };
  let sq = 0;
  const me = {
    cols: [col], tag: { text: '超级弹', at: () => [p.x + mx * h * 0.6, 4 * t + 0.25, p.z + mz * h * 0.6] },
    hit(speed) {
      if (speed < 0.3) return;
      sq = Math.min(1, 0.4 + speed / 6);
      ctx.audio.bump(Math.min(1, 0.35 + speed / 8));
    },
    update(dt) {
      sq = Math.max(0, sq - dt * 3);
      const s = Math.sin(sq * Math.PI) * 0.2;
      g.scale.set(1 + s * 0.25, 1 - s, 1 + s * 0.25);
    },
  };
  col.owner = me;
  return me;
}

function angDiff(a, b) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}
