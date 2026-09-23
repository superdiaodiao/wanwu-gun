// Follow camera: sits behind the pusher, pulls back as the ball grows, shakes on impacts.
import * as THREE from 'three';

const _d = new THREE.Vector3();
const _probe = new THREE.Vector3();
const _from = new THREE.Vector3();
const _l = new THREE.Vector3();

export const ZOOMS = [1, 1.55, 0.72];

export class CameraRig {
  constructor(camera, world = null) {
    this.cam = camera;
    this.world = world;
    this._cands = [];
    this._ct = {};
    this.lift = 1;
    this.pos = new THREE.Vector3(0, 1, 3);
    this.look = new THREE.Vector3();
    this.shakeT = 0;
    this.shakeA = 0;
    this.zoomIdx = 0;
    this.zoom = 1;
    this.fovBoost = 0;
    this.override = null; // cinematic control: { pos, look, fov }
  }

  cycleZoom() {
    this.zoomIdx = (this.zoomIdx + 1) % ZOOMS.length;
    return this.zoomIdx;
  }

  shake(amount) {
    this.shakeA = Math.max(this.shakeA, amount);
    this.shakeT = 0.35;
  }

  desired(ball, outPos, outLook) {
    const S = ball.displayS;
    const z = this.zoom;
    const fx = Math.sin(ball.heading), fz = -Math.cos(ball.heading);
    const dist = (S * 2.15 + 0.2) * z;
    const height = (S * 1.3 + 0.1) * z;
    const cy = ball.centerY;
    outPos.set(ball.pos.x - fx * dist, cy + height, ball.pos.z - fz * dist);
    outLook.set(ball.pos.x + fx * S * 0.9, cy + S * 0.05, ball.pos.z + fz * S * 0.9);
  }

  snap(ball) {
    this.zoom = ZOOMS[this.zoomIdx];
    this.desired(ball, this.pos, this.look);
    this.apply(0, 0);
  }

  update(dt, ball, time) {
    if (this.override) {
      const o = this.override;
      const k = 1 - Math.exp(-dt * (o.speed || 2.5));
      this.pos.lerp(o.pos, k);
      this.look.lerp(o.look, k);
      this.apply(dt, time, o.fov);
      return;
    }
    this.zoom += (ZOOMS[this.zoomIdx] - this.zoom) * Math.min(1, dt * 3);
    this.desired(ball, _d, _l);
    // camera collision: walk from the ball out to the wanted spot and stop before anything tall
    // (a building wall behind the ball would otherwise swallow the camera)
    let pull = 1;
    if (this.world) {
      const S = ball.displayS;
      const r = S * 0.25 + 0.04;
      _from.set(ball.pos.x, ball.centerY + S * 0.2, ball.pos.z);
      let prev = 0.3;
      for (const t of [0.42, 0.55, 0.7, 0.85, 1]) {
        _probe.lerpVectors(_from, _d, t);
        const cands = this.world.grid.query(_probe.x, _probe.z, r, this._cands, S / 40);
        let hit = false;
        for (const o of cands) {
          if (o.state !== 0 || o.h < S * 0.6) continue;
          if (this.world.contact(o, _probe, r, this._ct)) { hit = true; break; }
        }
        if (hit) { pull = prev; break; }
        prev = t;
      }
    }
    this.lift += (pull - this.lift) * Math.min(1, dt * (pull < this.lift ? 8 : 1.5));
    if (this.lift < 0.999) {
      _from.set(ball.pos.x, ball.centerY + ball.displayS * 0.2, ball.pos.z);
      _d.lerpVectors(_from, _d, this.lift);
      _d.y += (1 - this.lift) * ball.displayS * 1.1;
    }
    const k = 1 - Math.exp(-dt * 4.5);
    const kl = 1 - Math.exp(-dt * 9);
    this.pos.lerp(_d, k);
    this.look.lerp(_l, kl);
    const minY = ball.displayS * 0.12 + 0.012;
    if (this.pos.y < minY) this.pos.y = minY;
    const sp = ball.speed() / Math.max(1e-4, ball.maxSpeed());
    this.fovBoost += ((ball.dashT > 0 ? 9 : 0) + Math.max(0, sp - 0.8) * 6 - this.fovBoost) * Math.min(1, dt * 4);
    // tall (portrait) screens get a wider vertical field so the sides aren't cut off
    const base = this.cam.aspect < 1 ? 55 + (1 - this.cam.aspect) * 30 : 55;
    this.apply(dt, time, base + this.fovBoost, ball.displayS);
  }

  apply(dt, time, fov = 55, scale = 1) {
    const c = this.cam;
    c.position.copy(this.pos);
    if (this.shakeT > 0) {
      this.shakeT -= dt;
      const a = this.shakeA * scale * Math.max(0, this.shakeT / 0.35);
      c.position.x += (Math.random() - 0.5) * a;
      c.position.y += (Math.random() - 0.5) * a;
      c.position.z += (Math.random() - 0.5) * a;
    }
    c.lookAt(this.look);
    if (Math.abs(c.fov - fov) > 0.01) {
      c.fov = fov;
      c.updateProjectionMatrix();
    }
  }
}
