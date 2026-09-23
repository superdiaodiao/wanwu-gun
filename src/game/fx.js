// Particles: five-coloured sparkles on pickups, twinkles over things worth taking, dust behind the
// ball, stars on impacts, fireworks.
import * as THREE from 'three';

const VERT = /* glsl */ `
uniform float uScale;
attribute float aSize;
attribute vec4 aColor;
varying vec4 vColor;
#include <common>
#include <logdepthbuf_pars_vertex>
void main() {
  vColor = aColor;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = clamp(aSize * uScale / max(0.0001, -mv.z), 0.0, 256.0);
  gl_Position = projectionMatrix * mv;
  #include <logdepthbuf_vertex>
}`;

const FRAG = /* glsl */ `
varying vec4 vColor;
uniform float uSoft;
#include <common>
#include <logdepthbuf_pars_fragment>
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float d = length(c);
  float a = (uSoft > 0.5 ? smoothstep(0.5, 0.0, d) : smoothstep(0.5, 0.2, d) + 0.6 * smoothstep(0.08, 0.0, abs(c.x) * abs(c.y) * 8.0) * smoothstep(0.5, 0.1, d)) * vColor.a;
  if (a < 0.01) discard;
  #include <logdepthbuf_fragment>
  gl_FragColor = vec4(vColor.rgb, a);
  #include <colorspace_fragment>
}`;

export const FIVE = [0x2aa198, 0xd8342c, 0xf2c14e, 0xf4efe2, 0x8a6ad0];
const _c = new THREE.Color();

class System {
  constructor(scene, max, additive, soft) {
    this.max = max;
    this.pos = new Float32Array(max * 3);
    this.vel = new Float32Array(max * 3);
    this.col = new Float32Array(max * 4);
    this.size = new Float32Array(max);
    this.life = new Float32Array(max);
    this.maxLife = new Float32Array(max);
    this.grav = new Float32Array(max);
    this.drag = new Float32Array(max);
    this.alpha = new Float32Array(max);
    this.n = 0;
    const g = new THREE.BufferGeometry();
    this.aPos = new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage);
    this.aCol = new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage);
    this.aSize = new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', this.aPos);
    g.setAttribute('aColor', this.aCol);
    g.setAttribute('aSize', this.aSize);
    this.u = { uScale: { value: 500 }, uSoft: { value: soft ? 1 : 0 } };
    const m = new THREE.ShaderMaterial({
      uniforms: this.u,
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(g, m);
    this.points.frustumCulled = false;
    this.points.renderOrder = additive ? 20 : 10;
    scene.add(this.points);
  }

  emit(x, y, z, vx, vy, vz, color, size, life, grav = 0, drag = 0.5, alpha = 1) {
    let i;
    if (this.n < this.max) i = this.n++;
    else {
      // overwrite the oldest-looking slot
      i = (Math.random() * this.max) | 0;
    }
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx; this.vel[i * 3 + 1] = vy; this.vel[i * 3 + 2] = vz;
    _c.setHex(color);
    this.col[i * 4] = _c.r; this.col[i * 4 + 1] = _c.g; this.col[i * 4 + 2] = _c.b; this.col[i * 4 + 3] = alpha;
    this.alpha[i] = alpha;
    this.size[i] = size;
    this.life[i] = life;
    this.maxLife[i] = life;
    this.grav[i] = grav;
    this.drag[i] = drag;
  }

  update(dt) {
    let n = this.n;
    for (let i = 0; i < n; i++) {
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        // swap-remove with the last live particle
        n--;
        if (i !== n) {
          for (let k = 0; k < 3; k++) {
            this.pos[i * 3 + k] = this.pos[n * 3 + k];
            this.vel[i * 3 + k] = this.vel[n * 3 + k];
          }
          for (let k = 0; k < 4; k++) this.col[i * 4 + k] = this.col[n * 4 + k];
          this.size[i] = this.size[n];
          this.life[i] = this.life[n];
          this.maxLife[i] = this.maxLife[n];
          this.grav[i] = this.grav[n];
          this.drag[i] = this.drag[n];
          this.alpha[i] = this.alpha[n];
          i--;
        }
        continue;
      }
      const k = Math.exp(-this.drag[i] * dt);
      this.vel[i * 3] *= k;
      this.vel[i * 3 + 1] = this.vel[i * 3 + 1] * k - this.grav[i] * dt;
      this.vel[i * 3 + 2] *= k;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      const t = this.life[i] / this.maxLife[i];
      this.col[i * 4 + 3] = this.alpha[i] * Math.min(1, t * 2.5);
    }
    this.n = n;
    this.points.geometry.setDrawRange(0, n);
    this.aPos.needsUpdate = true;
    this.aCol.needsUpdate = true;
    this.aSize.needsUpdate = true;
  }
}

export class FX {
  constructor(scene) {
    this.sparks = new System(scene, 3000, true, false);
    this.puffs = new System(scene, 1500, false, true);
    this.dustT = 0;
  }

  setViewport(height, fov) {
    const s = height / (2 * Math.tan((fov * Math.PI) / 360));
    this.sparks.u.uScale.value = s;
    this.puffs.u.uScale.value = s;
  }

  pickup(x, y, z, size, S) {
    const n = 6 + Math.min(10, Math.floor(size / S * 30));
    const sp = Math.sqrt(S) * 1.4;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, e = Math.random() * 1.2;
      this.sparks.emit(x, y, z, Math.cos(a) * sp * (0.5 + Math.random()), sp * (0.6 + e), Math.sin(a) * sp * (0.5 + Math.random()),
        FIVE[(Math.random() * 5) | 0], S * (0.05 + Math.random() * 0.05), 0.5 + Math.random() * 0.4, S * 2.5, 2.5);
    }
  }

  dust(x, z, S, speed01, heading) {
    this.dustT -= speed01;
    if (this.dustT > 0) return;
    this.dustT = 0.35;
    const back = S * 0.35;
    const fx = Math.sin(heading), fz = -Math.cos(heading);
    this.puffs.emit(
      x - fx * back + (Math.random() - 0.5) * S * 0.5, S * 0.05, z - fz * back + (Math.random() - 0.5) * S * 0.5,
      (Math.random() - 0.5) * S * 0.4, S * 0.25, (Math.random() - 0.5) * S * 0.4,
      0xd9cfbc, S * (0.18 + Math.random() * 0.12), 0.7 + Math.random() * 0.4, 0, 1.5, 0.45);
  }

  /** a twinkle just above something worth rolling up (top = its top; see main.js updateGlints) */
  glint(x, top, z, size, S) {
    const s = S * 0.12 + Math.min(size, S) * 0.3;
    this.sparks.emit(x, top + s * (0.4 + Math.random() * 0.5), z, 0, s * 0.8, 0, Math.random() < 0.5 ? 0xfff6c8 : 0xffd566, s, 0.5 + Math.random() * 0.25, 0, 2, 1);
  }

  bump(x, y, z, S) {
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      this.sparks.emit(x, y, z, Math.cos(a) * S * 1.5, S * (0.6 + Math.random()), Math.sin(a) * S * 1.5, 0xfff1b0, S * 0.08, 0.45, S * 3, 3);
    }
  }

  firework(x, y, z, scale) {
    const col = FIVE[(Math.random() * 5) | 0];
    const col2 = FIVE[(Math.random() * 5) | 0];
    const n = 90;
    for (let i = 0; i < n; i++) {
      const u = Math.random() * 2 - 1, a = Math.random() * Math.PI * 2;
      const r = Math.sqrt(1 - u * u);
      const sp = scale * (0.9 + Math.random() * 0.2);
      this.sparks.emit(x, y, z, r * Math.cos(a) * sp, u * sp, r * Math.sin(a) * sp, i % 3 ? col : col2, scale * 0.06, 1.6 + Math.random() * 0.8, scale * 0.25, 0.9);
    }
  }

  trail(x, y, z, S) {
    for (let i = 0; i < 3; i++) {
      this.sparks.emit(x + (Math.random() - 0.5) * S, y + (Math.random() - 0.5) * S, z + (Math.random() - 0.5) * S,
        (Math.random() - 0.5) * S, -S * 0.5, (Math.random() - 0.5) * S, FIVE[(Math.random() * 5) | 0], S * 0.12, 1.2, 0, 0.6);
    }
  }

  update(dt) {
    this.sparks.update(dt);
    this.puffs.update(dt);
  }
}
