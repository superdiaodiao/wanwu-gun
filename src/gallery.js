// Model gallery: renders every registered catalog model in a grid (one scissored viewport per cell).
//   gallery.html?filter=cat      only ids / names containing "cat"
//   gallery.html?cols=4          grid columns
//   gallery.html?spin            rotate models continuously
//   gallery.html?atlas           also show the decal atlas
//   gallery.html?view=top|front|side|back   camera direction (default 3/4 front)
import * as THREE from 'three';
import { CATALOG } from './catalog/registry.js';
import { buildAtlas, loadFonts, atlasCanvas } from './core/atlas.js';
import { objectMaterial } from './core/materials.js';
import { buildSpec, formatLength } from './core/assets.js';

const params = new URLSearchParams(location.search);
const filter = params.get('filter') || '';
const spin = params.has('spin');
const view = params.get('view') || '34';
if (params.get('cols')) document.documentElement.style.setProperty('--cols', params.get('cols'));

const VIEW_DIRS = {
  '34': new THREE.Vector3(0.62, 0.42, 0.9),
  front: new THREE.Vector3(0, 0.15, 1),
  back: new THREE.Vector3(0, 0.25, -1),
  side: new THREE.Vector3(1, 0.15, 0),
  top: new THREE.Vector3(0.001, 1, 0.12),
};

async function main() {
  await loadFonts(2000);
  const tex = buildAtlas();
  const mat = objectMaterial(tex);

  const grid = document.getElementById('grid');
  const specs = [...CATALOG.values()].filter(s => !filter || s.id.includes(filter) || (s.name || '').includes(filter));
  const cells = [];
  let totalTris = 0, errors = 0;

  for (const spec of specs) {
    const cell = document.createElement('div');
    cell.className = 'cell';
    const label = document.createElement('div');
    label.className = 'label';
    cell.appendChild(label);
    grid.appendChild(cell);
    try {
      buildSpec(spec);
      const { w, h, d } = spec.dims;
      totalTris += spec.tris;
      const warns = [];
      if (spec.geometry.userData.liftedBy && Math.abs(spec.geometry.userData.liftedBy) > 0.01 * Math.max(h, 0.01))
        warns.push(`base not at y=0 (lifted ${spec.geometry.userData.liftedBy.toFixed(3)})`);
      const cx = (spec.bbox.min.x + spec.bbox.max.x) / 2, cz = (spec.bbox.min.z + spec.bbox.max.z) / 2;
      if (Math.abs(cx) > 0.15 * w + 0.01 || Math.abs(cz) > 0.15 * d + 0.01) warns.push(`off-centre (${cx.toFixed(2)}, ${cz.toFixed(2)})`);
      for (const k of ['name', 'cat', 'sfx']) if (!spec[k]) warns.push(`missing ${k}`);
      label.innerHTML = `<b>${spec.name || '?'}</b> <span class="meta">${spec.id}</span><br>` +
        `<span class="meta">${formatLength(w)} × ${formatLength(h)} × ${formatLength(d)} · ${spec.tris} tris · ${spec.cat || '-'} · ${spec.sfx || '-'}` +
        `${spec.mover ? ' · ' + spec.mover.kind : ''}${spec.tints ? ' · tint×' + spec.tints.length : ''}</span>` +
        (warns.length ? `<br><span class="warn">${warns.join('; ')}</span>` : '');

      const scene = new THREE.Scene();
      scene.add(new THREE.HemisphereLight(0xdcecff, 0x8d7f6d, 1.5));
      const sun = new THREE.DirectionalLight(0xfff4e0, 2.4);
      sun.position.set(0.6, 1, 0.75);
      scene.add(sun);
      let mesh;
      if (spec.tints && spec.tints.length) {
        // show up to three tint variants side by side
        const n = Math.min(3, spec.tints.length);
        mesh = new THREE.InstancedMesh(spec.geometry, mat, n);
        const step = Math.max(w, d) * 1.15;
        for (let i = 0; i < n; i++) {
          mesh.setMatrixAt(i, new THREE.Matrix4().makeTranslation((i - (n - 1) / 2) * step, 0, 0));
          mesh.setColorAt(i, new THREE.Color(spec.tints[i]));
        }
        mesh.computeBoundingSphere();
      } else {
        mesh = new THREE.Mesh(spec.geometry, mat);
      }
      scene.add(mesh);
      const ground = new THREE.Mesh(
        new THREE.CircleGeometry(1, 40).rotateX(-Math.PI / 2),
        new THREE.MeshLambertMaterial({ color: 0xd9d3c4 })
      );
      const box = new THREE.Box3().setFromObject(mesh);
      const sphere = box.getBoundingSphere(new THREE.Sphere());
      ground.scale.setScalar(sphere.radius * 1.4);
      ground.position.set(sphere.center.x, -0.0005 * sphere.radius, sphere.center.z);
      scene.add(ground);
      const cam = new THREE.PerspectiveCamera(30, 1, sphere.radius * 0.01, sphere.radius * 20);
      const dir = VIEW_DIRS[view] || VIEW_DIRS['34'];
      const dist = sphere.radius / Math.sin((cam.fov * Math.PI) / 360) * 1.05;
      cam.position.copy(sphere.center).addScaledVector(dir.clone().normalize(), dist);
      cam.lookAt(sphere.center);
      cells.push({ cell, scene, cam, mesh, center: sphere.center });
    } catch (e) {
      errors++;
      cell.classList.add('err');
      label.textContent = `${spec.id}\n${e && e.stack ? e.stack.split('\n').slice(0, 4).join('\n') : e}`;
      console.error('[gallery] build failed', spec.id, e);
    }
  }

  document.getElementById('stats').textContent =
    `${specs.length} 个模型 · ${totalTris.toLocaleString()} tris · ${errors} 个错误 · 图集 ${atlasCanvas().width}px`;

  if (params.has('atlas')) {
    const img = document.createElement('img');
    img.src = atlasCanvas().toDataURL();
    document.getElementById('atlas').appendChild(img);
  }

  const canvas = document.getElementById('c');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.setScissorTest(true);
  renderer.setClearColor(0xf6f3ec, 1);

  const wrap = document.getElementById('wrap');
  function render(t = 0) {
    const W = wrap.clientWidth, H = grid.offsetHeight;
    if (canvas.width !== Math.floor(W * renderer.getPixelRatio()) || canvas.height !== Math.floor(H * renderer.getPixelRatio()))
      renderer.setSize(W, H);
    renderer.setScissor(0, 0, W, H);
    renderer.setViewport(0, 0, W, H);
    renderer.setClearColor(0xe8e4da, 1);
    renderer.clear();
    const wr = wrap.getBoundingClientRect();
    for (const c of cells) {
      const r = c.cell.getBoundingClientRect();
      const x = r.left - wr.left, y = r.top - wr.top;
      const bottom = H - (y + r.height);
      if (spin) c.mesh.rotation.y = t * 0.0006;
      c.cam.aspect = r.width / r.height;
      c.cam.updateProjectionMatrix();
      renderer.setViewport(x, bottom, r.width, r.height);
      renderer.setScissor(x, bottom, r.width, r.height);
      renderer.setClearColor(0xf6f3ec, 1);
      renderer.clear();
      renderer.render(c.scene, c.cam);
    }
  }
  if (spin) renderer.setAnimationLoop(render);
  else {
    render();
    window.addEventListener('resize', () => render());
  }
  window.__ready = true;
}

main().catch(e => {
  console.error('[gallery] fatal', e);
  document.body.insertAdjacentHTML('afterbegin', `<pre style="color:#b00">${e.stack || e}</pre>`);
  window.__ready = true;
});
