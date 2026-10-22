// Orders: where food is picked up and where it goes, the one order in hand, and the markers that
// show the way. Pick-up places are the town's food shops and street stalls; drop-offs are the
// doors of its homes, towers, the school and the office, each spot in front of the thing's face
// (+Z turned by its yaw). An order is: ride to the shop and stop there a moment, then ride to the
// door and stop there; it has a time to beat, set from the distance.
import * as THREE from 'three';
import { t } from '../i18n/index.js';

// what the town's things count as here
const FOOD = { shop_baozi: 1, shop_tea: 1, shop_noodle: 1, shop_restaurant: 1, shop_fruit: 1, baozi_stall: 1, bbq_stall: 1, pancake_cart: 1, fruit_stall: 1 };
const HOMES = { res_6f: '幸福里 {n} 号楼', res_18f: '阳光花园 {n} 栋', res_32f: '云顶公寓 {n} 栋', office_tower: '金融中心 {n} 座', school: '幸福小学门卫', office_glass_door: '幸福科技前台' };

export const STOP = { r: 5, speed: 3, hold: 0.6 }; // stop within r m, under speed m/s, for hold s
const EST_SPEED = 9; // m/s: the time to beat is the straight distance at this, plus some slack

export class Orders {
  constructor(scene, world) {
    this.pickups = [];
    this.drops = [];
    const counts = {};
    for (const o of world.objects) {
      const id = o.spec.id;
      if (FOOD[id]) this.pickups.push(this.place(o, o.spec.name, 2));
      else if (HOMES[id] && o.y < 1) {
        counts[id] = (counts[id] || 0) + 1;
        this.drops.push(this.place(o, t(HOMES[id], { n: counts[id] }), 3));
      }
    }
    // markers: a tall beam of light over the spot and a ring on the ground
    this.beam = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, 60, 20, 1, true), new THREE.MeshBasicMaterial({ color: 0xff8a2a, transparent: true, opacity: 0.28, depthWrite: false, side: THREE.DoubleSide, fog: false }));
    this.beam.position.y = 30;
    this.ring = new THREE.Mesh(new THREE.RingGeometry(STOP.r - 0.6, STOP.r, 40), new THREE.MeshBasicMaterial({ color: 0xff8a2a, transparent: true, opacity: 0.8, depthWrite: false, side: THREE.DoubleSide }));
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.position.y = 0.05;
    this.marker = new THREE.Group();
    this.marker.add(this.beam, this.ring);
    scene.add(this.marker);
    // the arrow floating ahead of the bike, pointing the way
    // (a flat chevron, lying almost level and tipped up a little towards the camera behind, so it
    // reads as a shape from the chase view; its tip is +Z)
    const sh = new THREE.Shape();
    sh.moveTo(0, 0.75); sh.lineTo(0.55, 0); sh.lineTo(0.22, 0); sh.lineTo(0.22, -0.55);
    sh.lineTo(-0.22, -0.55); sh.lineTo(-0.22, 0); sh.lineTo(-0.55, 0); sh.closePath();
    const ag = new THREE.ShapeGeometry(sh);
    ag.rotateX(-Math.PI / 2 + 0.35); // shape's +Y becomes +Z, tipped up at the back
    this.arrow = new THREE.Mesh(ag, new THREE.MeshBasicMaterial({ color: 0xffd23f, fog: false, side: THREE.DoubleSide, depthTest: false }));
    this.arrow.renderOrder = 10;
    scene.add(this.arrow);
    this.order = null;
  }

  /** the spot in front of a thing, off far enough to stand on */
  place(o, name, off) {
    const s = Math.sin(o.yaw), c = Math.cos(o.yaw), d = o.hd + off;
    return { x: o.centerX() + s * d, z: o.centerZ() + c * d, name };
  }

  /** a new order: a shop not too far from here, then a door a good ride from the shop */
  next(x, z) {
    const near = this.pickups.filter(p => { const d = Math.hypot(p.x - x, p.z - z); return d > 40 && d < 320; });
    const from = pick(near.length ? near : this.pickups);
    const far = this.drops.filter(p => { const d = Math.hypot(p.x - from.x, p.z - from.z); return d > 120 && d < 420; });
    const to = pick(far.length ? far : this.drops);
    const dist = Math.hypot(to.x - from.x, to.z - from.z);
    this.order = { from, to, dist, stage: 'pickup', limit: Math.round(dist / EST_SPEED + 25), left: 0, held: 0, food: 1, hitPerson: false, score0: 0 };
    this.show();
    return this.order;
  }

  get target() { return this.order ? (this.order.stage === 'pickup' ? this.order.from : this.order.to) : null; }

  show() {
    const g = this.target;
    this.marker.visible = !!g;
    if (!g) return;
    this.marker.position.set(g.x, 0, g.z);
    const col = this.order.stage === 'pickup' ? 0xff8a2a : 0x3ddc84;
    this.beam.material.color.setHex(col);
    this.ring.material.color.setHex(col);
  }

  /**
   * One step: the clock (once the food is in the box), stopping at the spot, the arrow. Returns
   * 'picked' | 'delivered' | null.
   */
  update(dt, bike, time) {
    const o = this.order;
    this.arrow.visible = !!o;
    if (!o) return null;
    const g = this.target;
    if (o.stage === 'deliver') o.left -= dt;
    // the arrow floats a little ahead of the bike, at eye height, and turns to the spot
    const f = bike.forward();
    this.arrow.position.set(bike.pos.x + f.x * 4, 2.75 + Math.sin(time * 4) * 0.06, bike.pos.z + f.z * 4);
    this.arrow.rotation.y = Math.atan2(g.x - bike.pos.x, g.z - bike.pos.z);
    this.ring.scale.setScalar(1 + Math.sin(time * 5) * 0.04);
    // stopped at the spot for a moment
    const d = Math.hypot(g.x - bike.pos.x, g.z - bike.pos.z);
    if (d < STOP.r && bike.speed < STOP.speed) o.held += dt;
    else o.held = 0;
    if (o.held < STOP.hold) return null;
    o.held = 0;
    if (o.stage === 'pickup') {
      o.stage = 'deliver';
      o.left = o.limit;
      this.show();
      return 'picked';
    }
    this.lastDone = o;
    this.order = null;
    this.show();
    return 'delivered';
  }

  /** how far to where the order goes next (m) */
  distance(bike) {
    const g = this.target;
    return g ? Math.hypot(g.x - bike.pos.x, g.z - bike.pos.z) : 0;
  }
}

const pick = list => list[Math.floor(Math.random() * list.length)];

/**
 * What a delivered order pays (yuan) and how many stars it gets: a base from the distance, more for
 * time to spare, half if late; scaled by how much of the food arrived whole; a tip from the near
 * misses on the way. Stars: five, less for late, for spilt food, and two less for hitting someone.
 */
export function settle(o, scoreOnWay) {
  const base = 8 + o.dist / 25;
  const onTime = o.left >= 0;
  let pay = onTime ? base * (1 + 0.6 * Math.min(1, o.left / o.limit)) : base * 0.5;
  pay *= 0.5 + 0.5 * o.food;
  const tip = Math.floor(scoreOnWay / 250);
  let stars = 5;
  if (!onTime) stars--;
  if (o.food < 0.7) stars--;
  if (o.food < 0.4) stars--;
  if (o.hitPerson) stars -= 2;
  stars = Math.max(1, stars);
  return { pay: Math.round(pay), tip, stars, onTime };
}
