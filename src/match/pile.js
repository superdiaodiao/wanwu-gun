// The pile in the bowl: every item is a ball of radius r for the physics (a toy-like approximation
// that is plenty for a heap of round-ish things), falling under gravity, pushing its neighbours
// apart, held in by the bowl's floor and wall. The mesh on top keeps whatever tilt it landed with,
// and turns a little as it tumbles. Items that have come to rest sleep until something near them
// moves (when one is picked out, the ones resting on it wake and drop into the gap).
import * as THREE from 'three';

export const BOWL = { r: 3.9, floor: 0, wall: 1.7, dish: 0.9 };
/** the bowl's floor rises towards the wall (a dish), so whatever is in it slides to the middle and heaps */
export const floorAt = d => BOWL.floor + BOWL.dish * Math.min(1, d / BOWL.r) ** 2;
const G = 22, ITER = 4, DAMP = 0.985, REST = 0.6;

export class Pile {
  constructor() {
    this.items = [];
  }

  add(item) {
    item.v = new THREE.Vector3();
    item.spin = new THREE.Vector3((Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6);
    item.sleep = 0;
    this.items.push(item);
  }

  remove(item) {
    const i = this.items.indexOf(item);
    if (i >= 0) this.items.splice(i, 1);
    // wake whatever was touching it, and everything stacked above it
    for (const o of this.items) {
      const h = Math.hypot(o.pos.x - item.pos.x, o.pos.z - item.pos.z);
      if (o.pos.distanceTo(item.pos) < (o.r + item.r) * 1.6 || (h < o.r + item.r && o.pos.y > item.pos.y)) o.sleep = 0;
    }
  }

  step(dt) {
    const L = this.items;
    for (const o of L) {
      if (o.sleep > REST) continue;
      o.v.y -= G * dt;
      o.v.multiplyScalar(DAMP);
      o.pos.addScaledVector(o.v, dt);
      o.mesh.rotation.x += o.spin.x * dt;
      o.mesh.rotation.y += o.spin.y * dt;
      o.mesh.rotation.z += o.spin.z * dt;
      o.spin.multiplyScalar(0.94);
    }
    for (let it = 0; it < ITER; it++) {
      for (let i = 0; i < L.length; i++) {
        const a = L[i];
        // the bowl: a flat floor and a round wall
        const d = Math.hypot(a.pos.x, a.pos.z), lim = BOWL.r - a.r, fl = floorAt(d);
        if (a.pos.y < fl + a.r) {
          a.pos.y = fl + a.r;
          if (a.v.y < 0) a.v.y *= -0.15;
          // down the slope a little, towards the middle
          if (d > 0.01 && a.sleep <= REST) { const s = 2 * BOWL.dish * d / (BOWL.r * BOWL.r) * 9 * (1 / 60); a.v.x -= a.pos.x / d * s; a.v.z -= a.pos.z / d * s; }
          a.v.x *= 0.9;
          a.v.z *= 0.9;
        }
        if (d > lim) {
          const k = lim / d;
          a.pos.x *= k;
          a.pos.z *= k;
          const nx = a.pos.x / lim, nz = a.pos.z / lim, vn = a.v.x * nx + a.v.z * nz;
          if (vn > 0) { a.v.x -= nx * vn * 1.3; a.v.z -= nz * vn * 1.3; }
        }
        for (let j = i + 1; j < L.length; j++) {
          const b = L[j];
          if (a.sleep > REST && b.sleep > REST) continue;
          const dx = b.pos.x - a.pos.x, dy = b.pos.y - a.pos.y, dz = b.pos.z - a.pos.z;
          const rr = a.r + b.r, d2 = dx * dx + dy * dy + dz * dz;
          if (d2 >= rr * rr || d2 < 1e-8) continue;
          const dd = Math.sqrt(d2), push = (rr - dd) / dd * 0.5;
          // (a real shove wakes a sleeper: whatever rested on something that left drops in turn)
          if (rr - dd > 0.02) { if (a.sleep > REST) a.sleep = 0; if (b.sleep > REST) b.sleep = 0; }
          // (a resting one barely moves for a falling one: piles hold their shape)
          const wa = a.sleep > REST ? 0.15 : 1, wb = b.sleep > REST ? 0.15 : 1, w = wa + wb;
          a.pos.x -= dx * push * (2 * wa / w); a.pos.y -= dy * push * (2 * wa / w); a.pos.z -= dz * push * (2 * wa / w);
          b.pos.x += dx * push * (2 * wb / w); b.pos.y += dy * push * (2 * wb / w); b.pos.z += dz * push * (2 * wb / w);
          // lose the speed going into each other
          const nx = dx / dd, ny = dy / dd, nz = dz / dd;
          const rel = (b.v.x - a.v.x) * nx + (b.v.y - a.v.y) * ny + (b.v.z - a.v.z) * nz;
          if (rel < 0) {
            const k = rel * 0.5;
            a.v.x += nx * k; a.v.y += ny * k; a.v.z += nz * k;
            b.v.x -= nx * k; b.v.y -= ny * k; b.v.z -= nz * k;
          }
        }
      }
    }
    for (const o of L) {
      if (o.v.lengthSq() < 0.05) o.sleep += dt;
      else o.sleep = 0;
      if (o.sleep > REST) o.v.set(0, 0, 0);
      o.mesh.position.copy(o.pos);
    }
  }

  get settled() { return this.items.every(o => o.sleep > REST); }
}
