// Renderer, scene, camera and lights. The world spans 1 cm pebbles to 400 m mountains, so the
// renderer uses a logarithmic depth buffer and the sun's shadow frustum follows the ball's scale.
import * as THREE from 'three';

// detail: scales how far things are drawn and how long they keep their full model (see updateView)
// stuck: most items drawn on the ball at once
export const QUALITY = {
  high: { label: '高', pr: 2, shadow: 2048, shadows: true, detail: 1, stuck: 1400 },
  medium: { label: '中', pr: 1.35, shadow: 1536, shadows: true, detail: 0.85, stuck: 1100 },
  // (low: fewer things drawn rather than fewer pixels, which save next to nothing: see README)
  low: { label: '低', pr: 1, shadow: 0, shadows: false, detail: 0.6, stuck: 450, speck: 0.015 },
};

const _v = new THREE.Vector3();
const _right = new THREE.Vector3();
const _up = new THREE.Vector3();

export class Engine {
  // options (the defaults are this game's; a small, near world such as the mini golf's passes its own):
  //   logDepth     the logarithmic depth buffer (it writes each pixel's depth in the fragment shader, which
  //                switches off the GPU's early depth test and MSAA's per-sample depth: a fifth to a third
  //                more GPU time on a full screen, and jagged lines where two surfaces cross)
  //   near, far    the camera's range in metres (without logDepth, depth is only as fine as near is far out:
  //                at d metres about d x d / (near x 16.7 million) metres)
  //   pixelBudget  the most pixels drawn (0: no limit): the pixel ratio is lowered until width x height x
  //                ratio squared fits, and worked out again on every resize (see pixelRatio)
  constructor(canvas, quality = 'high', { logDepth = true, near = 0.002, far = 60000, pixelBudget = 0 } = {}) {
    this.pixelBudget = pixelBudget;
    const r = (this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      logarithmicDepthBuffer: logDepth,
      powerPreference: 'high-performance',
      stencil: true, // ground layers shade each pixel once (see ground.js)
      preserveDrawingBuffer: false,
    }));
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.NeutralToneMapping;
    r.toneMappingExposure = 1.0;
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFShadowMap;
    r.autoClear = false;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(55, 1, near, far);
    this.camera.position.set(0, 1, 2);

    this.hemi = new THREE.HemisphereLight(0xcfe6ff, 0xb59c7a, 1.2);
    this.sun = new THREE.DirectionalLight(0xfff1dc, 2.6);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.bias = -0.0005;
    // the world's shadow casters are separate meshes on layer 2 (see world.js)
    this.sun.shadow.camera.layers.enable(2);
    this.sunDir = new THREE.Vector3(0.45, 0.8, 0.35).normalize();
    this.scene.add(this.hemi, this.sun, this.sun.target);

    this.quality = null;
    this.scale = 1; // resolution scale on top of the quality's pixel ratio (adaptive, see main.js)
    this.setQuality(quality);
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  setQuality(name) {
    const q = QUALITY[name] || QUALITY.high;
    this.quality = name;
    this.q = q;
    this.renderer.setPixelRatio(this.pixelRatio());
    this.sun.castShadow = q.shadows;
    this.renderer.shadowMap.enabled = q.shadows;
    if (q.shadows && this.sun.shadow.mapSize.x !== q.shadow) {
      this.sun.shadow.mapSize.set(q.shadow, q.shadow);
      if (this.sun.shadow.map) {
        this.sun.shadow.map.dispose();
        this.sun.shadow.map = null;
      }
    }
    // materials must recompile when shadows toggle
    this.scene.traverse(o => {
      if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => (m.needsUpdate = true));
    });
    this.resize();
  }

  pixelRatio() {
    let pr = Math.min(window.devicePixelRatio || 1, this.q.pr);
    // (a 2560x1440 window at 200% would be 5120x2880 with 4x MSAA: capped to the budget before the adaptive
    // scale, so that scale still takes its share off whatever is drawn)
    if (this.pixelBudget) pr = Math.min(pr, Math.sqrt(this.pixelBudget / Math.max(1, window.innerWidth * window.innerHeight)));
    return pr * this.scale;
  }

  setScale(k) {
    this.scale = k;
    this.renderer.setPixelRatio(this.pixelRatio());
    this.resize();
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.width = w;
    this.height = h;
    if (this.pixelBudget) this.renderer.setDrawingBufferSize(w, h, this.pixelRatio());
    else this.renderer.setSize(w, h, false);
    this.camera.aspect = w / Math.max(1, h);
    this.camera.updateProjectionMatrix();
  }

  /** Keep the shadow frustum centred on `center`, covering ±extent metres, snapped to texels. */
  updateShadow(center, extent) {
    const s = this.sun;
    if (!s.castShadow) return;
    const dir = this.sunDir;
    // light-space basis for texel snapping (stops shadow edges shimmering as the ball moves)
    _right.set(0, 1, 0).cross(dir);
    if (_right.lengthSq() < 1e-6) _right.set(1, 0, 0);
    _right.normalize();
    _up.copy(dir).cross(_right).normalize();
    const texel = (2 * extent) / s.shadow.mapSize.x;
    const a = Math.round(center.dot(_right) / texel) * texel;
    const b = Math.round(center.dot(_up) / texel) * texel;
    const c = center.dot(dir);
    _v.copy(_right).multiplyScalar(a).addScaledVector(_up, b).addScaledVector(dir, c);
    s.target.position.copy(_v);
    s.position.copy(_v).addScaledVector(dir, extent * 3);
    const cam = s.shadow.camera;
    cam.left = -extent;
    cam.right = extent;
    cam.top = extent;
    cam.bottom = -extent;
    cam.near = extent * 0.05;
    cam.far = extent * 7;
    cam.updateProjectionMatrix();
    s.shadow.normalBias = extent * 0.0012;
    s.target.updateMatrixWorld();
  }
}
