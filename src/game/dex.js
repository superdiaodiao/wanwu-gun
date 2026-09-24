// 图鉴: every kind of thing ever rolled up, kept from game to game, and a screen to leaf through
// them. Found ones show as little 3D pictures, the rest as dark silhouettes with where to look and
// how big the ball has to be. The pictures are drawn off screen with the game's own renderer, a few
// a frame, only once their square scrolls into view (the game itself isn't drawn meanwhile).
import * as THREE from 'three';
import { fmt } from './hud.js';
import { PLACES } from './minimap.js';

export const DEX_CATS = [
  ['food', '吃的'], ['daily', '日用'], ['toy', '玩具'], ['street', '街边'], ['person', '人'], ['animal', '动物'],
  ['plant', '花草树木'], ['vehicle', '车'], ['building', '房子'], ['landmark', '地标'], ['nature', '山水'],
];
const CAT_NAME = Object.fromEntries(DEX_CATS);
const THUMB = 112; // px, the little pictures (shown at 64 CSS px)
const BIG = 320; // the card's turning one
const BG_FOUND = 0x2e2836, BG_MISSING = 0x1c1921;
const VIEW = new THREE.Vector3(0.6, 0.35, 1).normalize();
const _c = new THREE.Color();
const $ = id => document.getElementById(id);

export class Dex {
  constructor({ world, renderer, material, store, pickRatio }) {
    this.world = world;
    this.renderer = renderer;
    this.material = material;
    this.store = store;
    this.counts = store.get('dex', {}) || {};
    this.fresh = new Set(); // found for the first time this game
    this.dirty = false;
    this.entries = entries(world, pickRatio);
    this.byId = new Map(this.entries.map((e, i) => [e.id, i]));
    this.isOpen = false;
    this.card = -1; // entry shown on the card
    this.queue = [];
    this.cells = null;
    this.onClose = null;
  }

  get total() { return this.entries.length; }
  get found() { return this.entries.reduce((n, e) => n + (this.counts[e.id] > 0 ? 1 : 0), 0); }
  has(id) { return this.counts[id] > 0; }

  /** a pickup: true the first time ever for this kind of thing */
  add(id) {
    if (!this.byId.has(id)) return false;
    const first = !(this.counts[id] > 0);
    this.counts[id] = (this.counts[id] || 0) + 1;
    this.dirty = true;
    if (first) {
      this.fresh.add(id);
      this.save();
    }
    return first;
  }

  newGame() { this.fresh.clear(); }

  save() {
    if (!this.dirty) return;
    this.dirty = false;
    this.store.set('dex', this.counts);
  }

  // ---- the screen --------------------------------------------------------------------------

  open(onClose = null) {
    this.onClose = onClose;
    if (!this.cells) this.build();
    this.refresh();
    $('dex').hidden = false;
    this.isOpen = true;
    $('dex-list').scrollTop = 0;
  }

  close() {
    this.hideCard();
    $('dex').hidden = true;
    this.isOpen = false;
    this.queue.length = 0;
    if (this.onClose) this.onClose();
  }

  build() {
    const list = $('dex-list');
    this.cells = [];
    for (const [cat, label] of DEX_CATS) {
      const items = this.entries.filter(e => e.cat === cat);
      if (!items.length) continue;
      const sec = document.createElement('section');
      sec.className = 'dex-sec';
      sec.innerHTML = `<h3>${label} <small data-cat="${cat}"></small></h3>`;
      const grid = document.createElement('div');
      grid.className = 'dex-grid';
      for (const e of items) {
        const i = this.byId.get(e.id);
        const cell = document.createElement('button');
        cell.className = 'dex-cell';
        cell.innerHTML = '<canvas width="1" height="1"></canvas><span></span><i class="new">新</i>';
        cell.addEventListener('click', () => this.showCard(i));
        grid.appendChild(cell);
        this.cells[i] = { el: cell, canvas: cell.firstChild, name: cell.children[1], drawn: null, visible: false };
      }
      sec.appendChild(grid);
      list.appendChild(sec);
    }
    // draw a square's picture once it scrolls into view
    this.io = new IntersectionObserver(
      obs => {
        for (const o of obs) {
          const i = +o.target.dataset.i;
          this.cells[i].visible = o.isIntersecting;
          if (o.isIntersecting) this.want(i);
        }
      },
      { root: list, rootMargin: '120px 0px' }
    );
    this.cells.forEach((c, i) => {
      c.el.dataset.i = i;
      this.io.observe(c.el);
    });
    $('dex-close').addEventListener('click', () => this.close());
    $('dex-card-close').addEventListener('click', () => this.hideCard());
    $('dex-prev').addEventListener('click', () => this.showCard((this.card + this.total - 1) % this.total));
    $('dex-next').addEventListener('click', () => this.showCard((this.card + 1) % this.total));
    $('dex-card').addEventListener('click', e => { if (e.target.id === 'dex-card') this.hideCard(); });
  }

  refresh() {
    $('dex-count').innerHTML = `<b>${this.found}</b> / ${this.total}`;
    for (const [cat] of DEX_CATS) {
      const tag = document.querySelector(`#dex-list small[data-cat="${cat}"]`);
      if (!tag) continue;
      const items = this.entries.filter(e => e.cat === cat);
      tag.textContent = `${items.filter(e => this.has(e.id)).length}/${items.length}`;
    }
    this.entries.forEach((e, i) => {
      const c = this.cells[i], found = this.has(e.id);
      c.el.classList.toggle('missing', !found);
      c.el.classList.toggle('fresh', this.fresh.has(e.id));
      c.name.textContent = found ? e.name : '？？？';
      c.el.setAttribute('aria-label', found ? e.name : '还没滚到过');
      if (c.visible) this.want(i);
    });
  }

  want(i) {
    const c = this.cells[i];
    if (c.drawn === this.has(this.entries[i].id)) return;
    if (!this.queue.includes(i)) this.queue.push(i);
  }

  showCard(i) {
    this.card = i;
    const e = this.entries[i], found = this.has(e.id);
    $('dex-name').textContent = found ? e.name : '？？？';
    const need = `球要 <b>${fmt(e.need)}</b> 以上才滚得起`;
    const where = `常见于 <b>${e.where}</b>`;
    $('dex-info').innerHTML = found
      ? `<span>${CAT_NAME[e.cat]} · 个头约 <b>${fmt(e.size)}</b></span><span>滚起过 <b>${this.counts[e.id]}</b> 次</span><span>${need}</span><span>${where}</span>`
      : `<span>还没滚到过</span><span>${where}</span><span>${need}</span>`;
    $('dex-card').hidden = false;
    this.cardT = 0;
  }

  hideCard() {
    this.card = -1;
    $('dex-card').hidden = true;
  }

  /** from the main loop while the screen is up: the card's turning picture, then waiting squares */
  pump(dt) {
    if (!this.isOpen) return;
    const t0 = performance.now();
    if (this.card >= 0) {
      this.cardT += dt;
      const e = this.entries[this.card];
      this.draw(e, $('dex-big'), BIG, this.cardT * 0.8 - 0.5, this.has(e.id));
    }
    while (this.queue.length && performance.now() - t0 < 10) {
      const i = this.queue.shift(), c = this.cells[i], e = this.entries[i];
      const found = this.has(e.id);
      this.draw(e, c.canvas, THUMB, -0.5, found);
      c.drawn = found;
    }
  }

  // ---- drawing one thing into a 2D canvas ---------------------------------------------------

  draw(e, canvas, size, angle, found) {
    const r = this.renderer;
    if (!this.scene) this.setupDrawing();
    const rt = size === BIG ? this.rtBig : this.rtThumb;
    const sp = e.spec, g = sp.geometry;
    const m = this.mesh;
    m.geometry = g;
    m.material = found ? this.material : this.dark;
    m.setColorAt(0, _c.setHex(found && e.tint != null ? e.tint : 0xffffff));
    m.instanceColor.needsUpdate = true;
    const c = sp.center;
    m.position.set(-c.x, -c.y, -c.z);
    this.pivot.rotation.y = angle;
    if (!g.boundingSphere) g.computeBoundingSphere();
    const dist = (g.boundingSphere.radius / Math.sin((this.cam.fov * Math.PI) / 360)) * 1.02;
    this.cam.position.copy(VIEW).multiplyScalar(dist);
    this.cam.near = dist / 100;
    this.cam.far = dist * 4;
    this.cam.lookAt(0, 0, 0);
    this.cam.updateProjectionMatrix();
    const prev = r.getRenderTarget(), cc = r.getClearColor(_c).getHex(), ca = r.getClearAlpha();
    r.setRenderTarget(rt);
    r.setClearColor(found ? BG_FOUND : BG_MISSING, 1);
    r.clear();
    r.render(this.scene, this.cam);
    r.readRenderTargetPixels(rt, 0, 0, size, size, this.px);
    r.setRenderTarget(prev);
    r.setClearColor(cc, ca);
    if (canvas.width !== size) {
      canvas.width = size;
      canvas.height = size;
    }
    const ctx = canvas.getContext('2d');
    const img = ctx.createImageData(size, size), row = size * 4;
    // (GL rows run bottom-up)
    for (let y = 0; y < size; y++) img.data.set(this.px.subarray((size - 1 - y) * row, (size - y) * row), y * row);
    ctx.putImageData(img, 0, 0);
  }

  setupDrawing() {
    this.scene = new THREE.Scene();
    // (no tone mapping off screen: a little less light than the HUD's preview for the same look)
    this.scene.add(new THREE.HemisphereLight(0xe8f0ff, 0x8a7c6c, 1.35));
    const key = new THREE.DirectionalLight(0xfff2dc, 1.9);
    key.position.set(0.5, 1, 0.9);
    this.scene.add(key);
    this.cam = new THREE.PerspectiveCamera(30, 1, 0.01, 1000);
    this.mesh = new THREE.InstancedMesh(this.entries[0].spec.geometry, this.material, 1);
    this.mesh.setMatrixAt(0, new THREE.Matrix4());
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(3).fill(1), 3);
    this.mesh.frustumCulled = false;
    this.pivot = new THREE.Group();
    this.pivot.add(this.mesh);
    this.scene.add(this.pivot);
    this.dark = new THREE.MeshBasicMaterial({ color: 0x4c4456 });
    const target = n => {
      const t = new THREE.WebGLRenderTarget(n, n, { samples: 4 });
      t.texture.colorSpace = THREE.SRGBColorSpace;
      return t;
    };
    this.rtThumb = target(THUMB);
    this.rtBig = target(BIG);
    this.px = new Uint8Array(BIG * BIG * 4);
  }
}

/**
 * One entry per kind of thing out in the world: sorted by kind, then smallest first; how big the
 * ball has to be for the smallest of them, and near which named place they mostly are.
 */
function entries(world, pickRatio) {
  const order = Object.fromEntries(DEX_CATS.map(([c], i) => [c, i]));
  const out = [];
  for (const t of world.types.values()) {
    const sp = t.spec;
    if (sp.hidden || !(sp.cat in order) || !t.dyn || !t.dyn.objs.length) continue;
    const objs = t.dyn.objs;
    let size = Infinity;
    const votes = new Map();
    for (const o of objs) {
      size = Math.min(size, o.size);
      const place = placeOf(o.x, o.z);
      votes.set(place, (votes.get(place) || 0) + 1);
    }
    const where = [...votes.entries()].sort((a, b) => b[1] - a[1])[0][0];
    out.push({ id: sp.id, name: sp.name || sp.id, cat: sp.cat, spec: sp, size, need: size / pickRatio, where, tint: sp.tints && sp.tints.length ? sp.tints[0] : null });
  }
  out.sort((a, b) => order[a.cat] - order[b.cat] || a.size - b.size);
  return out;
}

// how a map label reads after 常见于
const AS_WHERE = { 高铁: '高铁沿线', 群山: '城外山边', 幸福里: '幸福里小区' };

function placeOf(x, z) {
  if (Math.hypot(x, z) > 1100) return '城外山边';
  let best = null, bd = Infinity;
  for (const [name, px, pz] of PLACES) {
    const d = Math.hypot(x - px, z - pz);
    if (d < bd) {
      bd = d;
      best = name;
    }
  }
  return AS_WHERE[best] || best;
}
