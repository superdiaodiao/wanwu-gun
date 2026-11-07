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
//   tunnel    the same tunnel without the sails, under any model built to the windmill's footprint
//          (models/windmill.js: x ±1.2 s, z ±0.7 s, the tunnel x ±0.45 s and 0.6 s clear): a giant
//          pumpkin's door, a snow fort's gate
//   spinner   a lawn sprinkler: its arm sweeps round and shoves the ball it meets
// Each returns { cols, update(dt, ball, game) }: cols join the course's (moving ones are updated
// in place, with their speed so they shove), update moves and animates it. The ones that do
// something to the ball also say what, in a few words, and where over them: tag { text, at() }.
//
// Options any of them may have, besides their own (see holes.js):
//   tag    what it says over it till the first shot, in place of its own (a Chinese key: the yard
//          file's `en` has its English); on an obj, a tunnel or a watcher, which say nothing of
//          themselves, it gives them a tag
//   tint   (obj, watch, bike, goose, tunnel) its colours multiplied by this one, 0xrrggbb: crows from
//          pigeons
//   call   (bike, watch, goose, obj) the sound it makes: 'cluck' 'oink' 'coo' 'bark' 'honk' 'quack' 'meow'
//          'moo' 'bell' 'horn' (audio/sfx.js CALL_KEYS), or a crow's 'caw', a rubber duck's 'squeak';
//          left out, the animal's own (by a whole part of its id: dog_husky barks, bird_crow caws), a
//          bike's bell, a car's horn; an obj's (a rubber duck's) in place of its thud
//   bike   walk: true — an animal walking to and fro (hens crossing): it waddles and bobs, turns
//          round at each end, and stops there for `pause` seconds (0.2; a vehicle 0.6);
//          aside: true — it flicks a ball lying (or creeping) in its way off to the side it is on,
//          rather than shoving it along in front of it (on a walker unless aside: false; a car, a
//          bike or a mower only if said: the wheelbarrow, the sled, the snowplough)
//   goose  mode: 'chase' (it chases the ball and pecks it away: the goose's own) or 'nudge' (it goes
//          only for a ball lying still 2.5 s, once a stroke, never while it is being aimed: a dog's,
//          a pig's); s: its size (the goose 1.3 times life, others 1.4); face: which way it looks
//          at home, in degrees of its turn: 180 (the default) up the map, away from the tee, 0 down
//          towards the tee, 90 to the right (not a cat's face, where 0 is up the map)
//   obj    e: how bouncy it is (0.55; a snowbank 0.3); wobble: true — it rocks when hit, with a soft
//          thud (or its call); near: metres — a ball going by that close (rolling, not crawling) rocks
//          it too, away from the ball, with a little hop, once a stroke, and it calls (it hops when
//          hit too); long: its length to look at, times its own (the seesaw's: its ends on the rails it
//          lies across, not out over the water; what the ball meets is still the whole length, which
//          only reaches on past the rails); a part of it that comes off (its
//          model's spec.pop: a snowman's hat; or pop: '<id>', a model of its own standing on top of
//          it; or a child of its group named 'pop') is knocked off by a hard hit and lands nearby.
//          What the ball meets is the same either way
//   watch  near: how close the ball comes before it hops and calls (1.6 m); given, it calls only on
//          the first stroke (and hops on later ones); cheer: true — it hops twice when the ball drops
//          in, and calls unless it just did
// The difficulty's pace (ctx.pace: 1, or 0.75 at the easy one) slows the moving things: the speed of
// bikes, walkers, windmills and sprinklers times it; at the easy one a bike or a car also stops three
// times as long at each end, a cat waits 1.3 times as long between swipes, and a goose or a dog notices
// the ball 0.8 as far off.
import * as THREE from 'three';
import { BALL_R, contact } from './physics.js';
import { crow, squeak } from './sound/calls.js';

const D = Math.PI / 180;
const GOOSE = 1.3, CAT = 1.7, DOG = 1.4; // (bigger than life, to be seen from where the hole is watched)
// round things get a round collider (and how much of their footprint it covers)
const ROUND = { traffic_cone: 0.9, fire_hydrant: 0.8, rose_pot: 0.9, potted_plant: 0.8, flower_bed: 1, rubber_duck: 0.85, pumpkin: 0.95, pumpkin_small: 0.95, pumpkin_white: 0.95, snowman: 1.05, snowman_small: 1.05 };

let made = null; // (what the last hole's were made with: course.js warmLook makes another's the same way)
export const propsCtx = () => made;
// (ctx.warm: made only to have their shaders compiled, out of sight, and any model may be a stand-in)
export function buildProps(hole, course, ctx) {
  if (!ctx.warm) made = ctx;
  return (hole.props || []).map(d => {
    if (!MAKERS[d.t]) { console.warn('[golf] no such thing on a hole:', d.t); return { cols: [], update() {} }; }
    const me = MAKERS[d.t](d, course, ctx);
    if (d.tag && me.tag) me.tag = { ...me.tag, text: d.tag };
    if (d.tag === false) delete me.tag; // (tag: false — nothing said over it: a thing a hole before brought in)
    return me;
  });
}

/** at the easy difficulty (a pace under 1) */
const easy = ctx => (ctx.pace ?? 1) < 1;
// what an animal says, by a whole part of its model's name (dog_husky, bird_crow; a goose honks, as
// anything not listed does)
const CALLS = [['dog', 'bark'], ['goose', 'honk'], ['pig', 'oink'], ['chicken', 'cluck'], ['hen', 'cluck'], ['pigeon', 'coo'], ['crow', 'caw'], ['duck', 'quack'], ['cat', 'meow'], ['cow', 'moo']];
const callOf = (id, d) => d.call || (CALLS.find(([k]) => id.split('_').includes(k)) || [0, 'honk'])[1];
/** an animal's call, a bike's bell, a car's horn (audio.voice); a crow's caw is the one the pumpkin
 *  patch's ambience has far off (sound/calls.js), here near, and not again while one is going; a
 *  rubber duck's squeak (sound/calls.js) the same way, panned to where it is (pan) */
let cawing = 0, squeaking = 0;
const FAN_TURN = 0.4, FAN_SWING = 0.2; // (radians: a fan's turn towards the camera, and its swing either way:
// never side on, never straight at the tee)
const HOP = 0.15; // (how high a thing rocked by the ball going by hops: a rubber duck, 0.6 m tall)
const SQUEAK = 0.077; // (the squeak's loudness: its loudest 50 ms about 2 dB under a full-power putt's)
function say(ctx, call, pan = 0) {
  if (call === 'squeak') {
    const a = ctx.audio, ac = a.ctx;
    if (!a.running || a.muted || ac.currentTime < squeaking) return;
    squeaking = ac.currentTime + 0.2; // (two ducks rocked at once: one squeak)
    try { squeak(ac, a.m.sfx, ac.currentTime + 0.01, Math.random, { vel: SQUEAK, pan }); } catch {}
    return;
  }
  if (call !== 'caw') { ctx.audio.voice(call); return; }
  const a = ctx.audio, ac = a.ctx;
  if (!a.running || a.muted || ac.currentTime < cawing) return;
  cawing = ac.currentTime + 1.6;
  try { crow(ac, a.m.sfx, ac.currentTime + 0.01, Math.random, { vel: 0.6, pan: (Math.random() - 0.5) * 0.6 }); } catch {}
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
    const g = ctx.model(d.id, k, undefined, d.tint);
    g.position.set(p.x, course.Y(p.x, p.z), p.z);
    g.rotation.y = rot;
    if (d.long) g.scale.x = d.long; // (only to look at: what the ball meets is the full length)
    course.group.add(g);
    const col = footprint(ctx, d.id, k, p.x, p.z, rot, d.e ?? 0.55);
    const me = { cols: [col], update() {}, model: g };
    if (d.tag) me.tag = tag(ctx, d.tag, d.id, k, () => [p.x, course.Y(p.x, p.z), p.z]);
    const cap = popPart(ctx, d, k, g);
    if (d.wobble || d.near || cap) Object.assign(me, knocked(d, course, ctx, p, g, cap));
    if (me.hit) col.owner = me;
    return me;
  },

  fan(d, course, ctx) {
    const p = course.at(...d.at), [dx, dz] = d.dir;
    // (one blowing across the hole is turned part of the way round to face the near end, where the
    // camera is: seen side on, its head is a thin disc on a pole, and it reads as a post. The wind
    // still blows straight across)
    const yaw = Math.atan2(dx, dz) - (Math.abs(dx) > Math.abs(dz) ? Math.sign(dx) * FAN_TURN : 0);
    const g = ctx.model('electric_fan', 1.6);
    g.position.set(p.x, -0.03, p.z);
    course.group.add(g);
    course.pad(p.x, p.z, 1.2, 1.2); // (it stands beside the green, over the pond: on a block of its own)
    const wind = { x: p.x, z: p.z, dx, dz, len: d.len, w: d.w, a: d.a };
    course.winds.push(wind);
    // streaks of air drifting along the strip
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, depthWrite: false });
    const streaks = [];
    const n = Math.round(d.len * d.w * 1.4); // (about 1.4 a square metre of the strip)
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.08), mat.clone());
      m.rotation.set(-Math.PI / 2, 0, Math.atan2(-dz, dx));
      course.group.add(m);
      streaks.push({ m, u: (i / n) * d.len, side: ((i * 0.618) % 1 - 0.5) * d.w * 0.8 });
    }
    let t = Math.random() * 6;
    return {
      cols: [], wind, tag: tag(ctx, '会吹偏球', 'electric_fan', 1.6, () => [p.x, -0.03, p.z]),
      update(dt) {
        t += dt;
        g.rotation.y = yaw + Math.sin(t * 1.1) * FAN_SWING; // an oscillating fan
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
    const s = ctx.spec(d.id), k = d.len ? d.len / s.maxDim : d.s || 1;
    const g = ctx.model(d.id, k, undefined, d.tint);
    course.group.add(g);
    const col = { kind: 'box', x: A.x, z: A.z, hx: s.dims.w * k / 2 * 0.85, hz: s.dims.d * k / 2 * 0.9, rot: 0, e: 0.45, vx: 0, vz: 0 };
    // (one that reaches over the rail at the end of its way could push the ball out through it: said, for
    // whoever is making the hole)
    if (!ctx.warm) for (const [P, sg] of [[A, -1], [B, 1]]) {
      const r = col.hz + 2 * BALL_R;
      if (course.onGreen && !course.onGreen(P.x + ux * sg * r, P.z + uz * sg * r)) console.warn(`[golf] ${d.id} reaches over the rail at the end of its way (keep its ends ${r.toFixed(2)} m inside the green)`);
    }
    let u = (d.phase || 0) * 2 * L, bell = 0, lean = 0, yaw = null, step = 0;
    // (a robot mower turns round on the spot at each end, and chimes; a bike rings, a car hoots; an
    // animal walking to and fro turns round too, waddling as it goes, and calls)
    const bike = d.id.includes('bike'), mower = d.id === 'mower', walk = !!d.walk, aside = d.aside ?? walk;
    // (call: false, one that makes no call of its own (a sled, a wheelbarrow): it knocks, like a rail)
    const ring = d.call === false ? null : d.call || (bike || mower ? 'bell' : walk ? callOf(d.id, d) : 'horn');
    // (at the easy difficulty slower, and stopping longer at each end: a shot that isn't timed meets a car
    // about as often however fast it goes, so the gaps between them are made longer too)
    const sp = d.speed * (ctx.pace ?? 1), PAUSE = (d.pause ?? (walk ? 0.2 : 0.6)) * (easy(ctx) ? 3 : 1);
    const me = {
      cols: [col], tag: tag(ctx, '会撞开球', d.id, k, () => [col.x, course.Y(col.x, col.z), col.z]),
      hit(speed) {
        if (bell > 0 || speed <= 0.4) return;
        if (ring) { say(ctx, ring); bell = 1.2; } else { ctx.audio.wall(Math.min(1, speed / 7)); bell = 2.5; } // (one knock a meeting, not the shove's and the flick's a second on: shorter than any mover's next pass)
      },
      update(dt, ball, game) {
        bell -= dt;
        // ride to the end, a short stop, ride back
        const span = 2 * L + 2 * PAUSE * sp;
        u = (u + sp * dt) % span;
        const half = L + PAUSE * sp;
        const k = u < half ? Math.min(u, L) : Math.max(0, L - (u - half));
        const moving = u < half ? u < L : u - half < L;
        const dir = u < half ? 1 : -1;
        col.x = A.x + ux * k; col.z = A.z + uz * k;
        col.vx = moving ? ux * sp * dir : 0;
        col.vz = moving ? uz * sp * dir : 0;
        const head = Math.atan2(ux * dir, uz * dir);
        yaw = yaw === null || !(mower || walk) ? head : yaw + angDiff(yaw, head) * Math.min(1, dt * 6);
        col.rot = yaw;
        // (aside: a ball lying, or creeping, just ahead of it is flicked off its way to the side it is on,
        // keeping a little of the mover's speed: it isn't carried along for seconds while the player waits.
        // Slow against the mover, not the ground: one riding along at the mover's speed is flicked again)
        if (aside && moving && ball && (game.state === 'aim' || game.state === 'roll') && Math.hypot(ball.vx - col.vx, ball.vz - col.vz) < 0.6 && contact(col, ball.x, ball.z, BALL_R + 0.03)) {
          const fx = ux * dir, fz = uz * dir, rx = ball.x - col.x, rz = ball.z - col.z;
          if (rx * fx + rz * fz > 0) {
            const side = Math.sign(rx * -fz + rz * fx) || 1;
            ball.vx = -fz * side * 0.8 + fx * sp; ball.vz = fx * side * 0.8 + fz * sp;
            me.hit(1);
            game.pushed();
          }
        }
        lean += ((moving || !bike ? 0 : 0.12) - lean) * Math.min(1, dt * 5); // (a bike leans on its stand)
        if (walk) {
          // (a waddle: rocking side to side and bobbing at each step, still when it stops)
          if (moving) step += dt * 11;
          const w = moving ? Math.sin(step) : 0;
          g.position.set(col.x, course.Y(col.x, col.z) + Math.abs(w) * 0.035, col.z);
          g.rotation.set(0, col.rot, w * 0.14);
          return;
        }
        g.position.set(col.x, course.Y(col.x, col.z), col.z);
        g.rotation.set(0, col.rot, lean);
      },
    };
    col.owner = me;
    return me;
  },

  // stands beside the green on a block of its own and keeps an eye on the ball, turning after it;
  // a ball rolling close makes it hop and honk, or bark (no more than once a stroke; given near, it
  // honks on the first stroke only); cheer: two hops and a honk when the ball drops in
  watch(d, course, ctx) {
    const p = course.at(...d.at), k = d.s || (d.id === 'goose' ? GOOSE : DOG), call = callOf(d.id, d);
    course.pad(p.x, p.z, 1.1, 1.1);
    const g = ctx.model(d.id, k, undefined, d.tint);
    course.group.add(g);
    const reach = d.near ?? 1.6;
    let yaw = 0, hop = 0, heard = -1, hops = 0, cheered = false, quiet = 9;
    return {
      cols: [], tag: d.tag ? tag(ctx, d.tag, d.id, k, () => [p.x, -0.03, p.z]) : undefined,
      update(dt, ball, game) {
        yaw += angDiff(yaw, Math.atan2(ball.x - p.x, ball.z - p.z)) * Math.min(1, dt * 3);
        hop = Math.max(0, hop - dt * 2.5);
        if (game.state === 'roll' && heard !== game.strokes && Math.hypot(ball.x - p.x, ball.z - p.z) < reach) {
          heard = game.strokes;
          hop = 1;
          if (d.near == null || game.strokes === 1) { say(ctx, call); quiet = 0; }
        }
        if (d.cheer) {
          // (in it goes: two hops, and a honk unless it has only just honked. A hop still in the air
          // lands first, and the two follow: it doesn't drop to the ground in a frame)
          quiet += dt;
          if (game.state === 'sink' && !cheered) {
            cheered = true;
            if (hop > 0) hops = 2; else { hop = 1; hops = 1; }
            if (quiet >= 1) { say(ctx, call); quiet = 0; }
          } else if (hop === 0 && hops > 0) { hops--; hop = 1; }
        }
        g.position.set(p.x, -0.03 + Math.sin(hop * Math.PI) * 0.25, p.z);
        g.rotation.y = yaw;
      },
    };
  },

  // (or a dog, which barks, a pig, which oinks: d.id; and how it goes for the ball: d.mode)
  goose(d, course, ctx) {
    const home = course.at(...d.at), id = d.id || 'goose', call = callOf(id, d), K = d.s || (id === 'goose' ? GOOSE : DOG);
    const mode = d.mode || (id === 'goose' ? 'chase' : 'nudge'), aggro = d.aggro * (easy(ctx) ? 0.8 : 1);
    const g = ctx.model(id, K, undefined, d.tint);
    g.rotation.order = 'YXZ'; // so the peck dips its head forward, whichever way it faces
    course.group.add(g);
    const col = { kind: 'circle', x: home.x, z: home.z, r: 0.24, e: 0.4, vx: 0, vz: 0 };
    // (where it looks at home: up the map unless face says, in degrees)
    const face = d.face == null ? Math.PI : d.face * D;
    let x = home.x, z = home.z, yaw = face, cd = 0, peck = 0, walk = 0, honkCd = 0, t = Math.random() * 5, rest = 0, nosed = -1;
    const me = {
      cols: [col], tag: tag(ctx, mode === 'chase' ? '会追着啄球' : '会追着拱球', id, K, () => [x, course.Y(x, z), z]),
      hit(speed) { if (honkCd <= 0 && speed > 0.5) { say(ctx, call); honkCd = 1; } },
      update(dt, ball, game) {
        t += dt; cd -= dt; peck -= dt; honkCd -= dt;
        // (one that nudges, a dog, goes only for a ball that has lain still a while, and noses it on once a
        // stroke: on a slope a ball it nudges away can roll back to it, and it mustn't keep the player
        // from ever taking the shot; one that chases, the goose, is as it was)
        rest = game.state !== 'aim' ? 0 : game.aim ? rest : rest + dt; // (not while being aimed: it waits for the shot)
        const near = Math.hypot(ball.x - home.x, ball.z - home.z) < aggro;
        const chase = cd <= 0 && near && game.live && (mode === 'chase' || (rest > 2.5 && nosed !== game.strokes));
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
          yaw += angDiff(yaw, face + Math.sin(t * 0.7) * 0.9) * Math.min(1, dt * 2);
        }
        // got it: a peck that sends the ball off, away from the goose
        const bx = ball.x - x, bz = ball.z - z, bd = Math.hypot(bx, bz);
        if (chase && bd < col.r + BALL_R + 0.14) {
          const ux = bd > 1e-4 ? bx / bd : 0, uz = bd > 1e-4 ? bz / bd : -1;
          // (soft enough, and a long enough rest after, that a ball bouncing back off a wall
          // isn't pecked again before the player can take a shot)
          ball.vx = ux * 2.8; ball.vz = uz * 2.8;
          cd = 2.3; peck = 0.3; nosed = game.strokes;
          say(ctx, call);
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
    const P = (d.period || 2.4) * (easy(ctx) ? 1.3 : 1);
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
    const p = course.at(...d.at), y0 = course.Y(p.x, p.z), w = (d.speed || 0.8) * (ctx.pace ?? 1), k = d.s || 1;
    const house = place(ctx, 'windmill', k, p.x, y0, p.z);
    course.group.add(house);
    // the sails turn about the axle out of the tower's front, 1.6 m up and 0.78 m out (as made: k times
    // that); the house is 2.4 m across, its tunnel 0.9 m, 1.4 m deep
    const HUB = 1.6 * k, OUT = 0.78 * k, REACH = 1.45 * k, SAIL = 0.32 * k;
    const rotor = ctx.model('windmill_rotor', k);
    rotor.children[0].position.set(0, -ctx.spec('windmill_rotor').center.y * k, 0); // (the hub on the group's origin)
    rotor.position.set(p.x, y0 + HUB, p.z + OUT);
    course.group.add(rotor);
    const [wallL, wallR] = tunnelWalls(d, course, p, y0, k);
    // the sail in the way: where the lowest one crosses the ball's height, its canvas off to one side
    // of its spar (the trailing side), thin, in front of the door; off while none is low enough
    const sail = { kind: 'box', x: p.x, z: p.z + OUT, hx: SAIL / 2 + 0.04, hz: 0.05 * k, rot: 0, e: 0.45, vx: 0, vz: 0, off: true };
    let a = (d.phase || 0) * (Math.PI / 2), knock = 0;
    const me = {
      cols: [wallL, wallR, sail], tag: { text: '等叶片转开', at: () => [p.x, y0 + 0.95 * k, p.z + OUT] },
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

  // the windmill's tunnel with no sails, under any model built to its footprint (id: 'windmill' itself
  // till there are others)
  tunnel(d, course, ctx) {
    const p = course.at(...d.at), y0 = course.Y(p.x, p.z), k = d.s || 1, id = d.id || 'windmill';
    const house = place(ctx, id, k, p.x, y0, p.z, d.tint);
    course.group.add(house);
    const cols = tunnelWalls(d, course, p, y0, k), top = y0 + ctx.spec(id).dims.h * k;
    // (its loose part, a giant pumpkin's lid, see popPart: thrown up when the ball drops into the cup)
    const cap = popPart(ctx, d, k, house, id), lid = cap ? knocked({}, course, ctx, p, house, cap) : null;
    return {
      cols, tag: d.tag ? { text: d.tag, at: () => [p.x, top + 0.25, p.z] } : undefined,
      // (as the windmill's: see aim(), and the ghost of the ball seen through it)
      tall: { x: p.x, y0, y: top, z: p.z, hx: 1.2 * k, hz: 0.7 * k + 0.1 },
      update(dt, ball, game) {
        if (!lid) return;
        if (game.state === 'sink') lid.launch(0, 0.4, 3.2);
        lid.update(dt, ball);
      },
    };
  },

  // a lawn sprinkler: an arm `len` metres end to end turns on a post, `speed` radians a second, and
  // shoves the ball out of its way; water sprays from its tips
  spinner(d, course, ctx) {
    const p = course.at(...d.at), y0 = course.Y(p.x, p.z), len = d.len || 2, w = (d.speed || 1.2) * (ctx.pace ?? 1);
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
function place(ctx, id, k, x, y, z, tint) {
  const s = ctx.spec(id), g = ctx.model(id, k, undefined, tint);
  g.position.set(x + s.center.x * k, y + s.bbox.min.y * k, z + s.center.z * k);
  return g;
}

/** the walls either side of a tunnel through something built to the windmill's footprint at p: they
 *  reach out to `fill` metres either side of its middle where the green is wider than the house, a
 *  trough of flowers standing in each gap, so that the ball gets past only by the tunnel */
function tunnelWalls(d, course, p, y0, k) {
  const out = Math.max(1.2 * k, d.fill || 0), whx = (out - 0.45 * k) / 2;
  const wall = sx => ({ kind: 'box', x: p.x + sx * (0.45 * k + whx), z: p.z, hx: whx, hz: 0.7 * k, rot: 0, e: 0.5 });
  if (out > 1.2 * k + 0.01) for (const sx of [-1, 1]) course.group.add(trough(out - 1.2 * k, 1.4 * k, p.x + sx * (1.2 * k + out) / 2, y0, p.z));
  return [wall(-1), wall(1)];
}

/** the part of a model that a hard knock sends flying (a snowman's hat, a giant pumpkin's lid), put in
 *  its place in the model's group g and named 'pop'; null if it has none. It is: a child of the group
 *  named 'pop' already; or the one the model's spec says (spec.pop = { id, at }: at, [x, y, z], where
 *  the part's own origin, the middle of its base, sits in the model's own frame); or the model d.pop,
 *  set on top of the whole, in the middle (where spec.pop says, if it names the same part). Every part
 *  is modelled at its own origin */
function popPart(ctx, d, k, g, id = d.id) {
  const own = g.getObjectByName('pop');
  if (own) return own;
  const s = ctx.spec(id);
  const P = d.pop ? { id: d.pop, at: s.pop?.id === d.pop ? s.pop.at : [s.center.x, s.bbox.max.y, s.center.z] } : s.pop;
  if (!P) return null;
  const [ax, ay, az] = Array.isArray(P.at) ? P.at : [P.at.x, P.at.y, P.at.z];
  let cap;
  try { cap = place(ctx, P.id, k, (ax - s.center.x) * k, (ay - s.bbox.min.y) * k, (az - s.center.z) * k, d.tint); } catch (e) { console.warn(`[golf] ${id}: no part ${P.id} to pop off`, e); return null; }
  cap.name = 'pop';
  g.add(cap);
  return cap;
}

/** something that reacts to the ball: rocks (wobble) away from where it was hit and settles, with a
 *  soft thud; and its loose part (cap) knocked off by a hard hit (or thrown by launch()), up and away to
 *  land beside it */
function knocked(d, course, ctx, p, g, cap) {
  const up = new THREE.Vector3(0, 1, 0), yaw = new THREE.Quaternion().setFromAxisAngle(up, g.rotation.y), tilt = new THREE.Quaternion(), axis = new THREE.Vector3();
  let ball = null, t = 9, amp = 0, dx = 0, dz = 1, thud = 0, fly = null, passed = -1, jump = 0, lift = HOP, stroke = 0;
  const y0 = g.position.y;
  const pan = Math.max(-0.6, Math.min(0.6, p.x * 0.3)); // (a call heard from where it stands)
  const launch = (ux, uz, vy) => {
    if (!cap || fly) return;
    const w = new THREE.Vector3(), q = new THREE.Quaternion();
    cap.getWorldPosition(w);
    cap.getWorldQuaternion(q);
    cap.removeFromParent();
    cap.position.copy(w);
    cap.quaternion.copy(q);
    course.group.add(cap);
    const side = (Math.random() - 0.5) * 0.8;
    fly = { vx: ux * 1.3 - uz * side, vz: uz * 1.3 + ux * side, vy, spin: 6 + Math.random() * 4, ax: Math.random() - 0.5, az: Math.random() - 0.5, done: false };
    ctx.audio.bump(0.5);
  };
  return {
    launch,
    hit(speed) {
      if (speed < 0.3 || !ball) return;
      const bx = p.x - ball.x, bz = p.z - ball.z, bd = Math.hypot(bx, bz) || 1;
      if (d.wobble) {
        // (one still hopping isn't started again: it would drop back to the ground in a frame and hop a
        // second time; one that hopped as the ball came by this stroke doesn't hop again, nor rock
        // again till it has all but settled. A hit hops it as hard as it was hit)
        const hopped = d.near && passed === stroke;
        if (jump <= 0 && !(hopped && t < 0.6)) {
          dx = bx / bd; dz = bz / bd; t = 0;
          amp = Math.min(0.32, 0.06 + speed * 0.05);
          if (d.near && !hopped) { jump = 1; lift = HOP * Math.min(1, speed / 1.5); }
        }
        if (thud <= 0 && d.call) { say(ctx, d.call, pan); thud = 0.5; } // (a rubber duck squeaks instead)
        else if (thud <= 0) { ctx.audio.wall(Math.min(0.45, 0.12 + speed / 14)); thud = 0.25; }
      } else if (thud <= 0 && speed > 0.5) { ctx.audio.wall(Math.min(1, speed / 7)); thud = 0.07; }
      // (a hard knock: the loose part flies off, the way the ball was going, to land a step away)
      if (speed > 2.2) launch(bx / bd, bz / bd, 2.4 + speed * 0.12);
    },
    update(dt, b, game) {
      ball = b;
      if (game) stroke = game.strokes;
      thud -= dt;
      // (near: the ball rolling by rocks it away from itself, once a stroke, and it calls)
      if (d.near && game && game.state === 'roll' && passed !== game.strokes && Math.hypot(b.vx, b.vz) > 0.6 && Math.hypot(b.x - p.x, b.z - p.z) < d.near) {
        passed = game.strokes;
        const bx = p.x - b.x, bz = p.z - b.z, bd = Math.hypot(bx, bz) || 1;
        // (rocked well over and hopping: a rubber duck seen small on a phone on its side still shows it;
        // not started again in the air, from a hit just before)
        if (jump <= 0) { dx = bx / bd; dz = bz / bd; t = 0; amp = 0.38; jump = 1; lift = HOP; }
        if (d.call && thud <= 0) { say(ctx, d.call, pan); thud = 0.5; }
      }
      if ((d.wobble || d.near) && t < 3) {
        t += dt;
        const a = amp * Math.exp(-3.2 * t) * Math.sin(t * 10);
        tilt.setFromAxisAngle(axis.set(dz, 0, -dx), a);
        g.quaternion.copy(tilt).multiply(yaw);
      }
      if (jump > 0) {
        jump = Math.max(0, jump - dt * 3.2);
        g.position.y = y0 + Math.sin(jump * Math.PI) * lift;
      }
      if (fly && !fly.done) {
        fly.vy -= 9 * dt;
        cap.position.x += fly.vx * dt; cap.position.y += fly.vy * dt; cap.position.z += fly.vz * dt;
        cap.rotateOnWorldAxis(axis.set(fly.ax, 0.3, fly.az).normalize(), fly.spin * dt);
        // (down on the green where it is over it, else on the water)
        const x = cap.position.x, z = cap.position.z, bb = course.bounds;
        const floor = x > bb.x0 - 0.3 && x < bb.x1 + 0.3 && z > bb.z0 - 0.3 && z < bb.z1 + 0.3 ? course.Y(x, z) : course.water;
        if (fly.vy < 0 && cap.position.y <= floor) { cap.position.y = floor; fly.done = true; }
      }
    },
  };
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

// ---- Rush Hour's set piece (Duck Pond's last hole): the zebra crossing ---------------------------------
//   { t: 'crossing', at: [c, r], w, d, zone, ahead, hold, light: [c, r], goslings: n, trail: [dx, dz] }
// White bars painted over the road where the ball crosses it, at `at` (the road's middle), w metres along
// the road (2.4) and d across it (2): bars along the road, one after another across it, as at a real
// zebra crossing. Its pedestrian light stands at `light`, off the green on a block of its own, its face
// to the tee: the green man shows while a ball putted over the crossing now would get past the cars, by
// where each car is, which way it is going and how fast (a car about to come by in the time a putt takes
// to get there, `ahead` [0.3, 1.4] s on, within `zone` metres of the bars' middle (0.7) shows the red man), so
// waiting for it helps; it turns green only when that holds for a putt hit any time in the next `hold`
// seconds (0.7), about the time a person takes to see it and putt, so it never shows green for a blink.
// And `goslings` goslings waddle after the hole's goose in a line, wherever it goes, settling back into a
// line behind it (the way `trail` says from it, [-1, 1]: behind and to the left as seen from the tee) once
// it is home; they hop and peep as the ball rolls by. Only to look at:
// nothing here touches the ball. The road runs across the hole (along x), as every road does.
const ZEBRA = new THREE.MeshLambertMaterial({ color: 0xf4f1e8, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 });
const SIGNAL = { pole: new THREE.MeshLambertMaterial({ color: 0x8e959d }), head: new THREE.MeshLambertMaterial({ color: 0x2f3338 }), button: new THREE.MeshLambertMaterial({ color: 0xffc928 }) };
let FACES = null; // (the light's two faces, each lit and dark: made once, and kept)
function signalFaces() {
  if (FACES) return FACES;
  const face = (walk, col) => {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    g.fillStyle = '#121416';
    g.fillRect(0, 0, 64, 64);
    g.fillStyle = g.strokeStyle = col;
    g.lineCap = 'round';
    g.lineWidth = 7;
    g.beginPath(); g.arc(walk ? 34 : 32, 12, 6.5, 0, Math.PI * 2); g.fill();
    const line = (...p) => { g.beginPath(); g.moveTo(p[0], p[1]); for (let i = 2; i < p.length; i += 2) g.lineTo(p[i], p[i + 1]); g.stroke(); };
    if (walk) { line(33, 23, 30, 39); line(30, 39, 22, 55); line(30, 39, 39, 47, 41, 57); line(32, 26, 23, 33); line(32, 26, 41, 31); }
    else { g.lineWidth = 9; line(32, 23, 32, 39); g.lineWidth = 6; line(29, 40, 29, 57); line(35, 40, 35, 57); line(26, 25, 25, 41); line(38, 25, 39, 41); }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return [new THREE.MeshBasicMaterial({ map: t }), new THREE.MeshBasicMaterial({ map: t, color: 0x262626 })];
  };
  return (FACES = { stop: face(false, '#ff4434'), walk: face(true, '#46e88a') });
}
MAKERS.crossing = function crossing(d, course, ctx) {
  const p = course.at(...d.at), w = d.w || 2.4, depth = d.d || 2, zone = d.zone ?? 0.7, [t0, t1] = d.ahead || [0.3, 1.4], hold = d.hold ?? 0.7;
  // the bars: 0.22 m across, five over the 2 m of a road two lanes wide (the middle one over the dashed line)
  const n = Math.max(2, Math.round(depth / 0.42)), gap = (depth - 0.32) / (n - 1);
  for (let i = 0; i < n; i++) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, 0.22).rotateX(-Math.PI / 2), ZEBRA);
    m.position.set(p.x, 0.004, p.z - (depth - 0.32) / 2 + i * gap);
    m.receiveShadow = true;
    course.group.add(m);
  }
  // the light: a post, a push button, a head with the red man over the green man
  const L = course.at(...d.light), F = signalFaces();
  course.pad(L.x, L.z, 0.7, 0.7);
  const sig = new THREE.Group();
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, 1.5, 10), SIGNAL.pole);
  post.position.y = 0.75;
  const button = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.15, 0.07), SIGNAL.button);
  button.position.set(0, 0.95, 0.06);
  // (its head tipped back a little, its faces up towards the camera: seen from above, on a phone held
  // upright, a head facing level shows only its top)
  const top = new THREE.Group(), head = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.56, 0.18), SIGNAL.head);
  top.position.y = 1.72;
  top.rotation.x = -0.55;
  const stop = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.22), F.stop[0]), walk = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.22), F.walk[1]);
  stop.position.set(0, 0.13, 0.092);
  walk.position.set(0, -0.13, 0.092);
  top.add(head, stop, walk);
  for (const o of [post, button, head]) { o.castShadow = true; o.receiveShadow = true; }
  sig.add(post, button, top);
  sig.position.set(L.x, -0.03, L.z);
  sig.scale.setScalar(1.25); // (a third over life size, as the animals are: read from the far end of the hole)
  course.group.add(sig);
  // the goslings
  const kids = Array.from({ length: d.goslings || 0 }, (_, i) => {
    const g = ctx.model('duckling', 2.9);
    g.visible = false; // (till the first frame finds the goose and puts it in its place)
    course.group.add(g);
    return { g, x: 0, z: 0, yaw: 0, step: i * 1.7, hop: 0, heard: -1 };
  });
  const [tx, tz] = d.trail || [-1, 1], tl = Math.hypot(tx, tz);
  let goose, cars, green = false, path = [], homeFor = 0, peeped = 0;
  const PAUSE = 0.6 * (easy(ctx) ? 3 : 1), lo = course.bounds.x0 + 0.22 + 1.1, hi = course.bounds.x1 - 0.22 - 1.1;
  // where a car will be s seconds on: on to the end of its way, its stop there, and back (its ends where it
  // has been seen to stop, till then the road's, a car's length in from the rails)
  const ahead = (k, s) => {
    let x = k.c.x, dir = k.dir, wait = k.moving ? 0 : Math.max(0, PAUSE - k.still);
    const v = k.v || 2, a = k.loEnd ?? lo, b = k.hiEnd ?? hi;
    if (!k.moving) dir = x < (a + b) / 2 ? 1 : -1;
    while (s > 1e-6) {
      if (wait > 0) { const u = Math.min(wait, s); wait -= u; s -= u; continue; }
      const end = dir > 0 ? b : a, u = Math.min(s, Math.abs(end - x) / v);
      x += dir * v * u; s -= u;
      if (s > 1e-6) { dir = -dir; wait = PAUSE; }
    }
    return x;
  };
  return {
    cols: [],
    get green() { return green; }, // (the light, for the tests)
    update(dt, ball, game) {
      if (!game) return;
      if (!cars) {
        // (the cars are the things on the hole that move and are boxes: the bikes and cars going to and fro)
        cars = [];
        for (const q of game.props) for (const c of q.cols) if (c.kind === 'box' && 'vx' in c && !('off' in c)) cars.push({ c, v: 0, dir: 1, still: 0, moving: false, loEnd: null, hiEnd: null });
        goose = game.props.find(q => q.cols.length === 1 && q.cols[0].kind === 'circle' && 'vx' in q.cols[0] && q.hit);
        goose = goose && goose.cols[0];
        if (goose) for (let i = 0; i < 30; i++) path.push([goose.x + (tx / tl) * i * 0.1, goose.z + (tz / tl) * i * 0.1]);
        kids.forEach((k, i) => { const [x, z] = slot(i); k.x = x; k.z = z; k.yaw = Math.atan2(goose ? goose.x - x : 0, goose ? goose.z - z : -1); k.g.visible = !!goose; });
      }
      // the light: green while a putt hit now would get by (`now`), but turned green only when one hit at any
      // moment in the next `hold` seconds would too (`soon`): a person sees the green man, then aims and lets
      // go, so it never shows for a blink, and the shot that waited for it gets over
      let now = true, soon = true;
      for (const k of cars) {
        const sp = Math.abs(k.c.vx), was = k.moving;
        k.moving = sp > 0.01;
        if (k.moving) { k.v = sp; k.dir = Math.sign(k.c.vx); k.still = 0; }
        else { if (was) k[k.dir > 0 ? 'hiEnd' : 'loEnd'] = k.c.x; k.still += dt; }
        const ext = Math.abs(k.c.hz * Math.sin(k.c.rot || 0)) + Math.abs(k.c.hx * Math.cos(k.c.rot || 0)) + BALL_R + zone;
        for (let s = t0; s <= t1 + hold + 1e-6 && now; s += 0.05) if (Math.abs(ahead(k, s) - p.x) < ext) { soon = false; if (s <= t1 + 1e-6) now = false; else break; }
      }
      const go = green ? now : soon; // (red at once)
      if (go !== green) { green = go; stop.material = F.stop[go ? 1 : 0]; walk.material = F.walk[go ? 0 : 1]; }
      // the goslings: along the goose's way, or back in a line behind it once it is home
      if (!goose) return;
      const last = path[0];
      if (Math.hypot(goose.x - last[0], goose.z - last[1]) > 0.1) { path.unshift([goose.x, goose.z]); if (path.length > 40) path.pop(); }
      homeFor = Math.hypot(goose.vx, goose.vz) > 0.01 ? 0 : homeFor + dt;
      kids.forEach((k, i) => {
        const [gx, gz] = homeFor > 1.2 ? slot(i) : along(0.45 + i * 0.36);
        const dx = gx - k.x, dz = gz - k.z, dd = Math.hypot(dx, dz);
        const moving = dd > 0.04;
        if (moving) {
          const st = Math.min(dd, 1.9 * dt);
          k.x += (dx / dd) * st; k.z += (dz / dd) * st;
          k.yaw += angDiff(k.yaw, Math.atan2(dx, dz)) * Math.min(1, dt * 9);
          k.step += dt * 16;
        } else k.yaw += angDiff(k.yaw, Math.atan2(goose.x - k.x, goose.z - k.z)) * Math.min(1, dt * 3);
        // (a ball rolling by: a hop, and a peep, once a stroke each)
        if (game.state === 'roll' && k.heard !== game.strokes && Math.hypot(ball.vx, ball.vz) > 0.6 && Math.hypot(ball.x - k.x, ball.z - k.z) < 0.5) {
          k.heard = game.strokes; k.hop = 1;
          const a = ctx.audio, ac = a.ctx;
          if (a.running && !a.muted && ac.currentTime > peeped) { peeped = ac.currentTime + 0.25; try { squeak(ac, a.m.sfx, ac.currentTime + 0.01, Math.random, { vel: SQUEAK * 0.6, pitch: 1.9, pan: Math.max(-0.6, Math.min(0.6, k.x * 0.3)) }); } catch {} }
        }
        k.hop = Math.max(0, k.hop - dt * 3.5);
        const wob = moving ? Math.sin(k.step) : 0;
        k.g.position.set(k.x, course.Y(k.x, k.z) + Math.abs(wob) * 0.02 + Math.sin(k.hop * Math.PI) * 0.12, k.z);
        k.g.rotation.set(0, k.yaw, wob * 0.16);
      });
    },
  };
  // (gosling i's place in the line behind the goose at home; and the point `s` metres back along its way)
  function slot(i) { const k = 0.42 + i * 0.32; return [goose ? goose.x + (tx / tl) * k : p.x, goose ? goose.z + (tz / tl) * k : p.z]; }
  function along(s) {
    let x = goose.x, z = goose.z;
    for (const [px, pz] of path) {
      const l = Math.hypot(px - x, pz - z);
      if (l >= s) return [x + ((px - x) / l) * s, z + ((pz - z) / l) * s];
      s -= l; x = px; z = pz;
    }
    return [x, z];
  }
};
