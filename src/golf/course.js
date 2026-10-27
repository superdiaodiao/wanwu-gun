// A hole's course, built from its character map: the green (checkered like a mown lawn), the
// road stretches, a low wall along every edge of it (and the wall faces as colliders), the tee
// mat, the hole — a glowing crack in the ground with a flag — and a yard around: trees, hedges,
// a few buildings far off. Everything in world metres, the map centred on the origin.
import * as THREE from 'three';
import { CUP_R } from './physics.js';

const WALL_T = 0.16, WALL_H = 0.3, SLAB = 0.12;
const lam = color => new THREE.MeshLambertMaterial({ color });

/** a tiny seeded random, so a hole's yard looks the same every time */
function rng(seed) {
  let s = seed * 9301 + 49297;
  return () => ((s = (s * 9301 + 49297) % 233280) / 233280);
}

export function buildCourse(hole, index, { scene, model }) {
  const map = hole.map, H = map.length, W = Math.max(...map.map(r => r.length));
  const at = (c, r) => ({ x: c - (W - 1) / 2, z: r - (H - 1) / 2 });
  const cell = (c, r) => (r >= 0 && r < H && c >= 0 && c < W ? map[r][c] || ' ' : ' ');
  const green = ch => '.rTHo'.includes(ch);
  const group = new THREE.Group();
  scene.add(group);
  const course = { W, H, at, group, cols: [], winds: [], candies: [], tee: null, cup: null, tiles: [], deco: [] };

  // ---- the green, one slab per square ----
  const tiles = [];
  for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) {
    const ch = cell(c, r);
    if (!green(ch)) continue;
    tiles.push({ c, r, ch });
    const p = at(c, r);
    if (ch === 'T') course.tee = p;
    if (ch === 'H') course.cup = p;
    if (ch === 'o') course.candies.push(p);
  }
  course.tiles = tiles;
  const slab = new THREE.InstancedMesh(new THREE.BoxGeometry(1, SLAB, 1), lam(0xffffff), tiles.length);
  const m4 = new THREE.Matrix4(), col = new THREE.Color();
  tiles.forEach((t, i) => {
    const p = at(t.c, t.r);
    m4.makeTranslation(p.x, -SLAB / 2, p.z);
    slab.setMatrixAt(i, m4);
    const road = t.ch === 'r';
    col.setHex(road ? ((t.c + t.r) % 2 ? 0x8d939c : 0x878d96) : (t.c + t.r) % 2 ? 0x93d672 : 0x86ca66);
    slab.setColorAt(i, col);
  });
  slab.receiveShadow = true;
  group.add(slab);
  // a dashed line down the middle of each road row
  const dash = new THREE.MeshBasicMaterial({ color: 0xf4f1e8 });
  for (const t of tiles) if (t.ch === 'r' && cell(t.c, t.r - 1) === 'r' && cell(t.c, t.r + 1) === 'r') {
    const p = at(t.c, t.r);
    const d = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.08), dash);
    d.rotation.x = -Math.PI / 2;
    d.position.set(p.x, 0.003, p.z);
    group.add(d);
  }

  // ---- walls: every edge between green and not-green, merged into straight runs ----
  const runs = new Map();
  const edge = (key, a, b) => { if (!runs.has(key)) runs.set(key, []); runs.get(key).push([a, b]); };
  for (const t of tiles) {
    const { c, r } = t;
    if (!green(cell(c, r - 1))) edge(`h:${r - 0.5}:-1`, c - 0.5, c + 0.5); // far side, wall outward -z
    if (!green(cell(c, r + 1))) edge(`h:${r + 0.5}:1`, c - 0.5, c + 0.5);
    if (!green(cell(c - 1, r))) edge(`v:${c - 0.5}:-1`, r - 0.5, r + 0.5);
    if (!green(cell(c + 1, r))) edge(`v:${c + 0.5}:1`, r - 0.5, r + 0.5);
  }
  const wallMat = lam(0xfbf0dc), capMat = lam(0xff9b7d);
  for (const [key, list] of runs) {
    const [kind, line, out] = key.split(':');
    const L = +line, o = +out;
    list.sort((a, b) => a[0] - b[0]);
    const merged = [];
    for (const [a, b] of list) {
      const last = merged[merged.length - 1];
      if (last && Math.abs(last[1] - a) < 1e-6) last[1] = b;
      else merged.push([a, b]);
    }
    for (const [a, b] of merged) {
      // the collider is the wall's inner face, along the green's edge (in map units, so shift)
      const A = kind === 'h' ? at(a, L) : at(L, a), B = kind === 'h' ? at(b, L) : at(L, b);
      course.cols.push({ kind: 'seg', ax: A.x, az: A.z, bx: B.x, bz: B.z });
      const len = Math.hypot(B.x - A.x, B.z - A.z) + WALL_T * 2;
      const mx = (A.x + B.x) / 2 + (kind === 'v' ? o * WALL_T / 2 : 0);
      const mz = (A.z + B.z) / 2 + (kind === 'h' ? o * WALL_T / 2 : 0);
      const geo = kind === 'h' ? new THREE.BoxGeometry(len, WALL_H, WALL_T) : new THREE.BoxGeometry(WALL_T, WALL_H, len);
      const w = new THREE.Mesh(geo, wallMat);
      w.position.set(mx, WALL_H / 2 - SLAB, mz);
      w.castShadow = true;
      w.receiveShadow = true;
      group.add(w);
      const capGeo = kind === 'h' ? new THREE.BoxGeometry(len, 0.04, WALL_T + 0.02) : new THREE.BoxGeometry(WALL_T + 0.02, 0.04, len);
      const cap = new THREE.Mesh(capGeo, capMat);
      cap.position.set(mx, WALL_H - SLAB + 0.02, mz);
      group.add(cap);
    }
  }

  // ---- the tee mat ----
  const mat = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.02, 0.7), lam(0x4f9a4a));
  mat.position.set(course.tee.x, 0.01, course.tee.z);
  mat.receiveShadow = true;
  group.add(mat);

  // ---- the hole: a dark hollow, a glowing rim, cracks running off it, and a flag ----
  const cup = new THREE.Group();
  cup.position.set(course.cup.x, 0, course.cup.z);
  const hollow = new THREE.Mesh(new THREE.CircleGeometry(CUP_R, 28), new THREE.MeshBasicMaterial({ color: 0x1c1714 }));
  hollow.rotation.x = -Math.PI / 2;
  hollow.position.y = 0.004;
  cup.add(hollow);
  const rimMat = new THREE.MeshBasicMaterial({ color: 0xffd34d });
  const rim = new THREE.Mesh(new THREE.TorusGeometry(CUP_R, 0.022, 6, 32), rimMat);
  rim.rotation.x = Math.PI / 2;
  rim.position.y = 0.01;
  cup.add(rim);
  // light leaking out of the crack: thin golden lines running off the rim
  const crackMat = new THREE.MeshBasicMaterial({ color: 0xffd76a, transparent: true, opacity: 0.85, depthWrite: false });
  const R = rng(index + 7);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + R() * 0.8;
    let x = Math.cos(a) * CUP_R, z = Math.sin(a) * CUP_R, dir = a;
    for (let k = 0; k < 2; k++) {
      const l = 0.07 + R() * 0.08;
      dir += (R() - 0.5) * 0.8;
      const nx = x + Math.cos(dir) * l, nz = z + Math.sin(dir) * l;
      const s = new THREE.Mesh(new THREE.PlaneGeometry(l, 0.018 - k * 0.006), crackMat);
      s.rotation.set(-Math.PI / 2, 0, -dir);
      s.position.set((x + nx) / 2, 0.004, (z + nz) / 2);
      cup.add(s);
      x = nx; z = nz;
    }
  }
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 1.25, 8), lam(0xffffff));
  pole.position.set(0, 0.62, 0);
  pole.castShadow = true;
  cup.add(pole);
  const flagGeo = new THREE.BufferGeometry();
  flagGeo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0.5, -0.12, 0, 0, -0.26, 0], 3));
  flagGeo.computeVertexNormals();
  const flag = new THREE.Mesh(flagGeo, new THREE.MeshLambertMaterial({ color: 0xff4b4b, side: THREE.DoubleSide }));
  flag.position.set(0, 1.24, 0);
  flag.castShadow = true;
  cup.add(flag);
  group.add(cup);
  course.cupFx = { rim: rimMat, flag, pole };

  // ---- the yard around ----
  const near = (x, z, d) => tiles.some(t => { const p = at(t.c, t.r); return Math.abs(p.x - x) < d + 0.5 && Math.abs(p.z - z) < d + 0.5; });
  const X0 = -W / 2, X1 = W / 2, Z0 = -H / 2, Z1 = H / 2;
  const kinds = [['tree_plane', 4.2], ['tree_camphor', 4], ['tree_ginkgo', 3.6], ['bush', 1.1], ['bush', 0.9], ['flower_patch', 0.8], ['bench', 1.6], ['street_lamp', 3.6], ['rose_pot', 0.7], ['potted_plant', 0.9]];
  const placed = [];
  for (let i = 0; i < 70 && placed.length < 34; i++) {
    const [id, size] = kinds[Math.floor(R() * kinds.length)];
    const x = X0 - 6 + R() * (X1 - X0 + 12), z = Z0 - 7 + R() * (Z1 - Z0 + 10);
    const clear = size > 2 ? 2.2 : 1.1;
    // tall things only outside the course's box; low ones may also fill the gaps inside it
    const inside = x > X0 - clear && x < X1 + clear && z > Z0 - clear && z < Z1 + clear;
    if ((inside && size > 1.2) || near(x, z, clear) || placed.some(p => Math.hypot(p[0] - x, p[1] - z) < 1.6)) continue;
    let g;
    try { g = model(id, null, size); } catch { continue; }
    g.position.set(x, -SLAB, z);
    g.rotation.y = R() * Math.PI * 2;
    group.add(g);
    placed.push([x, z]);
    course.deco.push({ g, h: new THREE.Box3().setFromObject(g).max.y + SLAB });
  }
  for (let i = 0; i < 5; i++) {
    const g = model(['res_6f', 'res_18f', 'res_6f', 'shop_tea', 'res_32f'][i], 1);
    g.position.set(X0 - 14 + i * (X1 - X0 + 28) / 4, -SLAB, Z0 - 16 - R() * 4);
    group.add(g);
    course.deco.push({ g, h: 30, far: true });
  }
  const ground = new THREE.Mesh(new THREE.CircleGeometry(90, 48), lam(0xb8e09c));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -SLAB;
  ground.receiveShadow = true;
  group.add(ground);

  course.bounds = { x0: X0 - WALL_T, x1: X1 + WALL_T, z0: Z0 - WALL_T, z1: Z1 + WALL_T };
  return course;
}
