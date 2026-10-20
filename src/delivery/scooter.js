// The player's e-bike: an arcade ride. Throttle, brake (and a slow reverse), steering that tightens
// at low speed and widens at high, a little slide when turning hard at speed, and a boost that
// recharges. It collides with the town through the world's contact tests: small loose things (bins,
// boxes, stools, bags) get knocked flying, everything else (walls, cars, trees, people) stops it
// with a bounce. Heading h: forward is (sin h, cos h), so the model's +Z front turns with rotation.y.
import * as THREE from 'three';
import { CATALOG } from '../catalog/registry.js';
import { buildSpec } from '../core/assets.js';

export const RIDE = {
  top: 15, // m/s on the flat (54 km/h)
  boostTop: 21,
  accel: 8.5,
  brake: 18,
  reverseTop: 4,
  drag: 0.35, // per second, of the speed (rolling + air)
  coast: 2.2, // m/s² of slowing when nothing is pressed
  turn: 2.6, // rad/s at the speed where it turns best
  grip: 7, // how fast sideways sliding dies away (1/s)
  boostTime: 1.3,
  boostRecharge: 4, // s to refill from empty
  r: 0.55, // collision radius, centred a little above the ground
};

// what gets knocked flying rather than stopping the bike: small, loose, not alive, not a building
const SOLID_CATS = new Set(['building', 'landmark', 'nature', 'vehicle', 'person', 'animal']);
const knockable = o => o.state === 0 && !o.terrain && o.size < 1.1 && o.h < 1.4 && !SOLID_CATS.has(o.spec.cat) && !o.mover;

const _c = new THREE.Vector3();
const _p = new THREE.Vector3();
const _v = new THREE.Vector3();
const _axis = new THREE.Vector3();
const _hit = {};
const _cands = [];

export class Scooter {
  constructor(scene, world, material) {
    this.world = world;
    const spec = buildSpec(CATALOG.get('delivery_rider'));
    const mesh = new THREE.Mesh(spec.geometry, material);
    mesh.position.set(-spec.center.x, -spec.bbox.min.y, -spec.center.z);
    mesh.castShadow = true;
    mesh.layers.enable(2);
    this.body = new THREE.Group(); // leans into turns
    this.body.add(mesh);
    this.group = new THREE.Group();
    this.group.add(this.body);
    scene.add(this.group);
    this.len = spec.dims.d;
    this.pos = new THREE.Vector3();
    this.reset(0, 0, 0);
  }

  reset(x, z, heading) {
    this.pos.set(x, 0, z);
    this.heading = heading;
    this.v = 0; // along the heading
    this.side = 0; // sideways slide
    this.boost = 1; // 0..1 charge
    this.boostT = 0;
    this.lean = 0;
    this.bumpT = 0;
    this.sync();
  }

  get speed() { return Math.hypot(this.v, this.side); }
  forward(out = _v) { return out.set(Math.sin(this.heading), 0, Math.cos(this.heading)); }

  /**
   * ctl: { throttle 0..1, brake 0..1, steer -1..1 (+ = right), boost bool }. Pushes events:
   * { type: 'knock', o, speed } and { type: 'crash', o, impact 0..1 }.
   */
  update(dt, ctl, now, events) {
    const R = RIDE;
    // boost
    if (ctl.boost && this.boostT <= 0 && this.boost > 0.35) {
      this.boostT = R.boostTime * this.boost;
      this.boost = 0;
      events.push({ type: 'boost' });
    }
    const boosting = this.boostT > 0;
    if (boosting) this.boostT -= dt;
    else this.boost = Math.min(1, this.boost + dt / R.boostRecharge);
    const top = boosting ? R.boostTop : R.top;

    // throttle and brake along the heading
    let a = 0;
    if (ctl.throttle > 0) a += R.accel * ctl.throttle * (this.v < 0 ? 2 : 1);
    if (ctl.brake > 0) a -= (this.v > 0.5 ? R.brake : R.accel * 0.6) * ctl.brake;
    if (boosting) a += R.accel * 1.4;
    if (!ctl.throttle && !ctl.brake && !boosting) a -= Math.sign(this.v) * Math.min(Math.abs(this.v) / dt, R.coast);
    this.v += a * dt;
    this.v -= this.v * R.drag * dt * (Math.abs(this.v) / top);
    this.v = Math.max(-R.reverseTop, Math.min(top * 1.05, this.v));

    // steering: tight when slow (but not standing still), wider at full speed; reversed when backing
    const sp = Math.abs(this.v);
    const turnK = Math.min(1, sp / 3.5) * (1 - 0.45 * Math.min(1, sp / R.boostTop));
    // (forward is (sin h, cos h): turning right, towards -X when facing +Z, is h going down)
    const dh = -ctl.steer * R.turn * turnK * Math.sign(this.v || 1) * dt;
    this.heading += dh;
    // turning hard at speed throws some of the speed sideways (a little slide), which grip takes back
    this.side += -dh * this.v * 0.35;
    this.side -= this.side * Math.min(1, R.grip * dt);
    this.lean += ((-ctl.steer * Math.min(1, sp / 8)) * 0.42 - this.lean) * Math.min(1, dt * 8);

    // move (side is measured to the left: (cos h, -sin h))
    const f = this.forward(), sx = Math.cos(this.heading), sz = -Math.sin(this.heading);
    this.pos.x += (f.x * this.v + sx * this.side) * dt;
    this.pos.z += (f.z * this.v + sz * this.side) * dt;
    this.collide(now, events);
    this.bumpT -= dt;
    this.sync();
  }

  collide(now, events) {
    const R = RIDE, w = this.world;
    // two circles: front and back of the bike
    for (const k of [0.45, -0.45]) {
      const f = this.forward();
      _c.set(this.pos.x + f.x * this.len * k, R.r, this.pos.z + f.z * this.len * k);
      for (const o of w.grid.query(_c.x, _c.z, R.r + 2, _cands, 0.05)) {
        if (o.state !== 0) continue;
        const hit = w.contact(o, _c, R.r, _hit, true);
        if (!hit || hit.low) continue;
        if (knockable(o)) {
          this.knock(o, now);
          events.push({ type: 'knock', o, speed: this.speed });
          continue;
        }
        // solid: push out and lose the speed going into it
        this.pos.x += hit.nx * hit.depth;
        this.pos.z += hit.nz * hit.depth;
        _c.x += hit.nx * hit.depth;
        _c.z += hit.nz * hit.depth;
        const vx = f.x * this.v + Math.cos(this.heading) * this.side, vz = f.z * this.v - Math.sin(this.heading) * this.side;
        const into = -(vx * hit.nx + vz * hit.nz);
        if (into > 0) {
          // keep the part of the motion along the obstacle, bounce a little off it
          const nvx = vx + hit.nx * into * 1.25, nvz = vz + hit.nz * into * 1.25;
          this.v = nvx * f.x + nvz * f.z;
          this.side = nvx * Math.cos(this.heading) - nvz * Math.sin(this.heading);
          const impact = Math.min(1, into / RIDE.top);
          if (impact > 0.15 && this.bumpT <= 0) {
            this.bumpT = 0.4;
            this.boostT = 0;
            events.push({ type: 'crash', o, impact });
          }
        }
      }
    }
  }

  /** a small thing flies off ahead of the bike */
  knock(o, now) {
    const f = this.forward(), sp = Math.max(4, this.speed);
    const side = Math.random() < 0.5 ? -1 : 1;
    _p.set(o.centerX(), o.y + o.h * 0.5, o.centerZ());
    _v.set(f.x * sp * 0.9 + Math.cos(this.heading) * side * sp * 0.35, 2.5 + sp * 0.35, f.z * sp * 0.9 - Math.sin(this.heading) * side * sp * 0.35);
    _axis.set(Math.random() - 0.5, 0, Math.random() - 0.5);
    this.world.detach(o);
    this.world.throwObject(o, _p, _v, _axis, now);
    // (a bump in the road)
    this.v *= 0.94;
  }

  sync() {
    this.group.position.copy(this.pos);
    this.group.rotation.y = this.heading;
    this.body.rotation.z = this.lean;
  }
}
