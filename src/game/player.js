// The pusher: a little clay kid (小泥人) made by 女娲, walking behind the ball with arms out.
// Uses creatures.buildClayKid when the catalog provides it, else a simple stand-in.
import * as THREE from 'three';
import { Model } from '../core/modeler.js';
import * as creatures from '../catalog/creatures.js';

function standInKid(ModelClass) {
  const clay = 0xd08a5c, dark = 0x3a2a22, red = 0xd8342c;
  const body = new ModelClass(11);
  body.capsule(0.14, 0.12, clay, 0, 0.2, 0);
  body.box(0.26, 0.2, 0.05, red, 0, 0.2, 0.12);
  const head = new ModelClass(12);
  head.sphere(0.2, clay, 0, 0.18, 0, 1, 0.95, 1, 0, 0, 0, 10);
  head.sym(s => head.sphere(0.07, dark, s * 0.12, 0.34, -0.02, 1, 1, 1, 0, 0, 0, 6));
  head.sym(s => head.sphere(0.022, dark, s * 0.07, 0.2, 0.18, 1, 1.2, 0.6, 0, 0, 0, 6));
  head.sym(s => head.sphere(0.03, 0xf29aa6, s * 0.12, 0.13, 0.15, 1.2, 0.8, 0.5, 0, 0, 0, 6));
  const arm = () => {
    const a = new ModelClass(13);
    a.capsule(0.05, 0.14, clay, 0, -0.11, 0);
    return a.build({ lift: false });
  };
  const leg = () => {
    const l = new ModelClass(14);
    l.capsule(0.06, 0.12, clay, 0, -0.1, 0);
    l.sphere(0.07, dark, 0, -0.2, 0.03, 1, 0.6, 1.3, 0, 0, 0, 6);
    return l.build({ lift: false });
  };
  return {
    parts: { body: body.build({ lift: false }), head: head.build({ lift: false }), armL: arm(), armR: arm(), legL: leg(), legR: leg() },
    joints: { neck: [0, 0.38, 0], shoulderL: [0.17, 0.33, 0], shoulderR: [-0.17, 0.33, 0], hipL: [0.08, 0.02, 0], hipR: [-0.08, 0.02, 0] },
  };
}

export class Player {
  constructor(scene, material) {
    let kid;
    try {
      kid = typeof creatures.buildClayKid === 'function' ? creatures.buildClayKid(Model) : standInKid(Model);
    } catch (e) {
      console.warn('[player] buildClayKid failed, using stand-in', e);
      kid = standInKid(Model);
    }
    const P = kid.parts, J = kid.joints;
    const mk = g => {
      const m = new THREE.Mesh(g, material);
      m.castShadow = true;
      return m;
    };
    this.group = new THREE.Group();
    this.hips = new THREE.Group();
    this.body = mk(P.body);
    this.head = mk(P.head);
    this.armL = mk(P.armL);
    this.armR = mk(P.armR);
    this.legL = mk(P.legL);
    this.legR = mk(P.legR);
    this.hips.add(this.body);
    this.body.add(this.head, this.armL, this.armR);
    this.hips.add(this.legL, this.legR);
    this.head.position.fromArray(J.neck);
    this.armL.position.fromArray(J.shoulderL);
    this.armR.position.fromArray(J.shoulderR);
    this.legL.position.fromArray(J.hipL);
    this.legR.position.fromArray(J.hipR);
    this.group.add(this.hips);
    scene.add(this.group);
    // measure: hip height = leg length, total height
    const box = new THREE.Box3().setFromObject(this.group);
    // pelvis height that puts the soles on y = 0 (the catalog kid reports it as `stand`)
    this.hipH = kid.stand ?? -Math.min(P.legL.boundingBox ? P.legL.boundingBox.min.y : -0.3, -0.05);
    this.height = Math.max(0.3, box.max.y - box.min.y);
    this.phase = 0;
    this.visible = true;
  }

  update(dt, ball, time, pushing) {
    const H = ball.displayS * 0.62;
    const s = H / this.height;
    const fx = Math.sin(ball.heading), fz = -Math.cos(ball.heading);
    const back = ball.displayS * 0.47 + H * 0.2;
    const g = this.group;
    g.position.set(ball.pos.x - fx * back, 0, ball.pos.z - fz * back);
    g.rotation.y = Math.PI - ball.heading;
    g.scale.setScalar(s);
    const sp = ball.speed() / Math.max(1e-4, ball.maxSpeed());
    this.phase += dt * (3 + sp * 9) * (sp > 0.05 ? 1 : 0.35);
    const swing = Math.sin(this.phase) * (0.15 + 0.55 * Math.min(1, sp));
    this.legL.rotation.x = swing;
    this.legR.rotation.x = -swing;
    // arms reach forward onto the ball
    const reach = -1.25 - (pushing ? 0.2 : 0);
    this.armL.rotation.x = reach + Math.sin(this.phase + 1.4) * 0.08 * sp;
    this.armR.rotation.x = reach - Math.sin(this.phase + 1.4) * 0.08 * sp;
    this.armL.rotation.z = 0.25;
    this.armR.rotation.z = -0.25;
    this.body.rotation.x = 0.18 + 0.2 * Math.min(1, sp);
    const bob = Math.abs(Math.sin(this.phase)) * 0.04 * (0.3 + sp);
    const idleHop = sp < 0.05 ? Math.max(0, Math.sin(time * 5)) * 0.03 : 0;
    this.hips.position.y = this.hipH + bob + idleHop;
    this.head.rotation.z = Math.sin(time * 2.1) * 0.06;
    g.visible = this.visible;
  }
}
