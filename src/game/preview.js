// Small 3D views drawn into HUD slots (scissored onto the main canvas): the last thing rolled up,
// and 女娲's portrait in the dialog box.
import { variant } from '../core/materials.js';
import * as THREE from 'three';

const _c = new THREE.Color();

export class Preview {
  constructor(el, material, { spin = 0.9, dir = [0.6, 0.35, 1], fill = 1.0, backdrop = 0x2b2632 } = {}) {
    this.el = el;
    this.scene = new THREE.Scene();
    this.scene.add(new THREE.HemisphereLight(0xe8f0ff, 0x8a7c6c, 1.7));
    const key = new THREE.DirectionalLight(0xfff2dc, 2.4);
    key.position.set(0.5, 1, 0.9);
    this.scene.add(key);
    this.camera = new THREE.PerspectiveCamera(30, 1, 0.01, 1000);
    this.scene.add(this.camera);
    // round backdrop that fills the circular HUD slot
    this.backdrop = new THREE.Mesh(
      new THREE.CircleGeometry(1, 48),
      new THREE.MeshBasicMaterial({ color: backdrop, depthWrite: false, toneMapped: false })
    );
    this.backdrop.renderOrder = -1;
    this.camera.add(this.backdrop);
    this.material = material;
    this.mesh = null;
    this.spin = spin;
    this.dir = new THREE.Vector3(...dir).normalize();
    this.fill = fill;
    this.t = 0;
    this.spec = null;
    this.anim = null; // optional (mesh, t) => void
  }

  /** opts.focus: model-space point to centre on; opts.radius: how much around it to fit in view */
  show(spec, tint = null, opts = {}) {
    if (!spec || !spec.geometry) return;
    if (this.mesh) this.scene.remove(this.mesh);
    const m = new THREE.InstancedMesh(spec.geometry, tint != null ? variant(this.material, 'tint') : this.material, 1);
    m.setMatrixAt(0, new THREE.Matrix4());
    if (tint != null) {
      m.setColorAt(0, _c.setHex(tint));
    }
    m.frustumCulled = false;
    this.pivot = new THREE.Group();
    const c = spec.center;
    m.position.set(-c.x, -c.y, -c.z);
    this.pivot.add(m);
    this.mesh = this.pivot;
    this.scene.add(this.pivot);
    if (opts.focus) m.position.set(-opts.focus[0], -opts.focus[1], -opts.focus[2]);
    const r = opts.radius || spec.geometry.boundingSphere.radius;
    const dist = (r / Math.sin((this.camera.fov * Math.PI) / 360)) * 1.02 / this.fill;
    this.camera.position.copy(this.dir).multiplyScalar(dist);
    this.camera.near = dist / 100;
    this.camera.far = dist * 4;
    const bd = dist * 2.5;
    this.backdrop.position.set(0, 0, -bd);
    this.backdrop.scale.setScalar(bd * Math.tan((this.camera.fov * Math.PI) / 360) * 1.02);
    this.camera.lookAt(0, 0, 0);
    this.camera.updateProjectionMatrix();
    this.spec = spec;
    this.t = 0;
  }

  clear() {
    if (this.mesh) this.scene.remove(this.mesh);
    this.mesh = null;
    this.spec = null;
  }

  render(renderer, dt) {
    if (!this.mesh || !this.el || this.el.offsetParent === null) return;
    const r = this.el.getBoundingClientRect();
    if (r.width < 4 || r.height < 4) return;
    this.t += dt;
    if (this.anim) this.anim(this.pivot, this.t);
    else this.pivot.rotation.y = this.t * this.spin;
    const H = renderer.domElement.clientHeight;
    const y = H - r.bottom;
    this.camera.aspect = r.width / r.height;
    this.camera.updateProjectionMatrix();
    renderer.setViewport(r.left, y, r.width, r.height);
    renderer.setScissor(r.left, y, r.width, r.height);
    renderer.setScissorTest(true);
    renderer.clearDepth();
    renderer.render(this.scene, this.camera);
    renderer.setScissorTest(false);
  }
}
