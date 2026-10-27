// The golf ball: glossy white with dimples (a bump map, drawn in rows over the sphere's
// latitude–longitude wrap, each dimple widened towards the poles so it comes out round), a red
// line round its middle so you can see it roll, and a thin dark edge so it stands out against the
// pale green from far off. And a faint streak it leaves behind when it's quick.
import * as THREE from 'three';

const STEP = 1 / 60;

function maps() {
  const W = 512, H = 256;
  const color = document.createElement('canvas'), bump = document.createElement('canvas');
  color.width = bump.width = W;
  color.height = bump.height = H;
  const c = color.getContext('2d'), b = bump.getContext('2d');
  c.fillStyle = '#f8f7f2';
  c.fillRect(0, 0, W, H);
  c.fillStyle = '#ff4f45';
  c.fillRect(0, H / 2 - 7, W, 14);
  b.fillStyle = '#fff';
  b.fillRect(0, 0, W, H);
  // about 330 dimples: rows down the ball, as many round each row as fit
  const ROWS = 16, step = Math.PI / ROWS, r = step * 0.42;
  for (let i = 0; i < ROWS; i++) {
    const lat = Math.PI / 2 - (i + 0.5) * step, cl = Math.cos(lat);
    const n = Math.max(1, Math.round((2 * Math.PI * cl) / step));
    const y = (i + 0.5) * (H / ROWS), ry = (r / Math.PI) * H, rx = Math.min(W / 4, ((r / (2 * Math.PI)) * W) / cl);
    for (let j = 0; j < n; j++) {
      const x = ((j + (i % 2) * 0.5) / n) * W;
      for (const dx of [-W, 0, W]) {
        if (x + dx + rx < 0 || x + dx - rx > W) continue;
        b.save();
        b.translate(x + dx, y);
        b.scale(rx / ry, 1);
        const g = b.createRadialGradient(0, 0, 0, 0, 0, ry);
        g.addColorStop(0, '#7a7a7a');
        g.addColorStop(0.75, '#c8c8c8');
        g.addColorStop(1, '#ffffff');
        b.fillStyle = g;
        b.beginPath();
        b.arc(0, 0, ry, 0, Math.PI * 2);
        b.fill();
        b.restore();
      }
    }
  }
  const map = new THREE.CanvasTexture(color);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 4;
  return { map, bumpMap: new THREE.CanvasTexture(bump) };
}

/** a golf ball of radius r, centred on its origin */
export function golfBall(r) {
  const geo = new THREE.SphereGeometry(r, 36, 24);
  const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ ...maps(), bumpScale: 2.5, roughness: 0.32, metalness: 0 }));
  m.castShadow = true;
  // the edge: the inside of a slightly bigger ball, so only its rim shows round the white one
  const edge = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0x2f5a2c, side: THREE.BackSide }));
  edge.scale.setScalar(1.12);
  m.add(edge);
  return m;
}

/** the streak: a ribbon flat on the green along where the ball has just been, narrowing and
 *  fading towards its tail, and only there at all while the ball is going quickly */
export class Trail {
  constructor(scene, width, n = 16) {
    this.n = n;
    this.w = width;
    this.pts = [];
    this.acc = 0;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 2 * 3), 3));
    geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 2 * 4), 4));
    const idx = [];
    for (let i = 0; i < n - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    geo.setIndex(idx);
    this.mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide }));
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 1;
    scene.add(this.mesh);
  }

  reset() { this.pts.length = 0; this.acc = 0; this.mesh.visible = false; }

  /** the ball is at (x, z), going at speed, dt after the last call */
  update(x, z, speed, dt) {
    const pts = this.pts;
    if (!pts.length) pts.push([x, z]);
    // the first point follows the ball; behind it one is left every 1/60 s of play, so the streak
    // is as long at any frame rate (a long frame's points are spread along the way it went)
    const [px, pz] = pts[0];
    this.acc += dt;
    const due = Math.floor(this.acc / STEP);
    this.acc -= due * STEP;
    for (let j = Math.max(1, due - this.n + 1); j <= due; j++) {
      const f = dt > 0 ? 1 - (this.acc + (due - j) * STEP) / dt : 1;
      pts.splice(1, 0, [px + (x - px) * f, pz + (z - pz) * f]);
    }
    pts[0] = [x, z];
    if (pts.length > this.n) pts.length = this.n;
    const k = Math.min(1, Math.max(0, (speed - 1.2) / 3));
    this.mesh.visible = k > 0 && pts.length > 1;
    if (!this.mesh.visible) return;
    const pos = this.mesh.geometry.attributes.position, col = this.mesh.geometry.attributes.color;
    const last = pts.length - 1;
    for (let i = 0; i < this.n; i++) {
      // (past the points there are so far, the rest of the ribbon folds up on the last one, unseen)
      const j = Math.min(i, last), p = pts[j], q = pts[Math.min(j + 1, last)], o = pts[Math.max(0, j - 1)];
      // across the path here
      let dx = o[0] - q[0], dz = o[1] - q[1];
      const d = Math.hypot(dx, dz) || 1;
      dx /= d; dz /= d;
      const f = 1 - i / (this.n - 1), w = this.w * f;
      pos.setXYZ(i * 2, p[0] - dz * w, 0.025, p[1] + dx * w);
      pos.setXYZ(i * 2 + 1, p[0] + dz * w, 0.025, p[1] - dx * w);
      const a = i < pts.length ? 0.75 * k * f : 0;
      col.setXYZW(i * 2, 1, 1, 1, a);
      col.setXYZW(i * 2 + 1, 1, 1, 1, a);
    }
    pos.needsUpdate = true;
    col.needsUpdate = true;
  }
}
