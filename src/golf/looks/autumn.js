// The pumpkin patch (yard 3): a vegetable garden on a crisp autumn morning — a clear sky paling to a warm
// haze, a low sun from the right throwing long shadows, mist lying on the lawn. An olive lawn strewn
// with fallen leaves, timber rails, a darker loam under the turf, the pond edged with timber and leaves
// floating on it. Round it raised beds of pumpkins, a scarecrow, hay bales, crates of apples, a
// wheelbarrow, maples in red and gold, a split-rail fence; and behind the far end, changing from hole
// to hole, the hens' little red barn or a stack of hay and pumpkins under a maple. Where the green
// steps down from one bed to the next, a timber edge, a shade just below it and stronger chevrons; a
// patch walled in by the green is a raised bed of its own, and a wide stretch of pond inside the hole's
// corner holds raised beds standing in the water (on a hole that says corner: 'wallow', a mud wallow).
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { WATER, LAWN, lam, rng, soilSides, ducks, lane, canvas, texture } from './kit.js';
import { foamBank } from './pond.js';

const LEAVES = ['#e8762c', '#d9472b', '#f0b43c', '#c0622a', '#b8402a'];

export default {
  sky: [[0, '#5a97d8'], [0.45, '#a8c9e4'], [0.8, '#efdcc2'], [1, '#f5e6d0']], fog: [0xeee2d0, 36, 88], hemi: [0xfff0dc, 0x9c8a5c, 1.3], sun: [0xffd6a0, 3, [0.72, 0.7, 0.42]],
  shadow: 0.9,
  card: 'linear-gradient(#5a97d8, #efdcc2 55%, #e9a25a)',
  // (a pumpkin)
  icon: '<svg class="ic" viewBox="0 0 36 32" aria-hidden="true"><path d="M18 8c-3-4 1-7 3-6" fill="none" stroke="#5c7a2a" stroke-width="2.6" stroke-linecap="round"/><ellipse cx="11" cy="19" rx="8" ry="10" fill="#e8762c"/><ellipse cx="25" cy="19" rx="8" ry="10" fill="#e8762c"/><ellipse cx="18" cy="19" rx="7.5" ry="11" fill="#f39a3d"/><path d="M18 9v20" stroke="#d0661f" stroke-width="1.6"/></svg>',
  turf: {
    green: ['#8cc04c', '#7fb343'], blade: ['rgba(250, 240, 170, 0.22)', 'rgba(60, 70, 15, 0.22)'], shade: 'rgba(50, 55, 15, 0.42)',
    // (the steps read as steps from a low camera too: cream chevrons with a dark copy under them, a shade
    // just below each step's top)
    chevron: { rgb: '255, 250, 215', min: 0.78, shadow: 'rgba(60, 45, 15, 0.42)' },
    lip: { color: 'rgba(50, 40, 15, 0.45)', w: 0.22 },
  },
  materials: () => ({
    ...soilSides({ top: '#8a5a34', mid: '#6e4528', foot: '#432a17', lip: '#6f8f2e', lipTop: '#8aab3c' }),
    ledge: lam(0x7a9a36), lawn: lam(0x93a64c), rail: lam(0xa86b3c), post: lam(0x7a4a26), cap: lam(0xc98a4c), foam: new THREE.MeshBasicMaterial({ color: 0xece3c6 }),
    leaf: new THREE.MeshLambertMaterial({ map: leafTex(), transparent: true, alphaTest: 0.4, depthWrite: false, side: THREE.DoubleSide }),
    timber: lam(0x8a5530), loam: lam(0x4a3220),
    painted: new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }),
    mist: new THREE.MeshBasicMaterial({ map: mistTex(), transparent: true, opacity: 0.4, depthWrite: false }),
  }),
  water: { color: 0x4d8f8c, glint: [0.88, 0.86, 0.72], deep: [0.18, 0.34, 0.33] },
  surroundings(ctx) {
    foamBank(ctx);
    pondEdge(ctx);
    garden(ctx);
    backdrop(ctx);
    lawnLeaves(ctx);
    mist(ctx);
  },
  floaters(ctx) {
    ducks(ctx);
    floatingLeaves(ctx);
    floatingPumpkins(ctx);
  },
  dress(ctx) {
    stepEdges(ctx);
    beds(ctx);
    greenLeaves(ctx);
  },
  // (the leaves fall low and close round the course, clear of the camera)
  particles: { count: 80, color: LEAVES, size: 0.24, fall: 0.42, sway: 0.7, shape: 'leaf', opacity: 1, high: 3.5, spread: 2 },
};

// ---- helpers ----
const tryModel = (ctx, id, k, size, tint) => { try { return ctx.model(id, k, size, tint); } catch { return null; } };
/** a model stood on the lawn at (x, z) turned rot; big things join the course's decoration (left out
 *  where they would stand between the camera and the course), far ones never are */
function stand(ctx, id, x, z, rot, { k = 1, size, y = LAWN, low = false, far = false, r = 0.6, tint, shadow = true } = {}) {
  const g = tryModel(ctx, id, size ? null : k, size, tint);
  if (!g) return null;
  g.children[0].castShadow = shadow;
  g.position.set(x, y, z);
  g.rotation.y = rot;
  ctx.group.add(g);
  ctx.placed.push([x, z, r]);
  if (far) ctx.course.deco.push({ g, far: true });
  else if (!low) ctx.course.deco.push({ g, box: new THREE.Box3().setFromObject(g) });
  return g;
}
/** many of one catalog model as one draw: spots [[x, y, z, rot, scale], ...] */
function many(ctx, id, spots, { far = false, shadow = true } = {}) {
  const proto = tryModel(ctx, id, 1);
  if (!proto || !spots.length) return null;
  const mesh = proto.children[0], off = new THREE.Matrix4().compose(mesh.position, mesh.quaternion, mesh.scale);
  const im = new THREE.InstancedMesh(mesh.geometry, mesh.material, spots.length);
  im.userData.keep = true; // (the catalog's shape: kept)
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), v = new THREE.Vector3(), sc = new THREE.Vector3();
  spots.forEach(([x, y, z, a, s], i) => im.setMatrixAt(i, m4.compose(v.set(x, y, z), q.setFromAxisAngle(up, a), sc.setScalar(s)).multiply(off)));
  im.castShadow = shadow;
  im.receiveShadow = true;
  ctx.group.add(im);
  if (far) ctx.course.deco.push({ g: im, far: true });
  return im;
}
/** a box geometry painted one colour (for the painted, vertex-coloured material), placed */
function box(w, h, d, col, x, y, z, ry = 0, rx = 0, rz = 0) {
  const g = new THREE.BoxGeometry(w, h, d).toNonIndexed();
  g.rotateX(rx).rotateZ(rz).rotateY(ry).translate(x, y, z);
  return paint(g, col);
}
function paint(g, col) {
  g = g.index ? g.toNonIndexed() : g;
  g.deleteAttribute('uv');
  const c = new THREE.Color(col), n = g.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) c.toArray(a, i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g;
}
function merged(ctx, parts, mat = ctx.M.painted) {
  const geo = mergeGeometries(parts);
  for (const p of parts) p.dispose();
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = m.receiveShadow = true;
  return m;
}

// ---- the pond's edge: timber sleepers round it, a little proud of the lawn ----
function pondEdge(ctx) {
  const { ring, M, group } = ctx;
  const edge = new THREE.Mesh(new THREE.ExtrudeGeometry(ring(0.34, 1.95, 0.02, 1.55), { depth: 0.1, bevelEnabled: false, curveSegments: 8 }).rotateX(-Math.PI / 2), M.timber);
  edge.position.y = LAWN - 0.04;
  edge.receiveShadow = true;
  group.add(edge);
}

// ---- the garden round the pond: raised beds of pumpkins either side, a scarecrow, hay, crates, a
// wheelbarrow, maples, leaf piles and a split-rail fence round it all ----
function garden(ctx) {
  const { pond, R, M, group, index } = ctx;
  const { x0, x1, z0, z1 } = pond, len = z1 - z0, mx = (x0 + x1) / 2;
  const S = rng(index * 7 + 1); // (this hole's own arrangement)
  // the raised beds: timber frames of dark loam along each long side, pumpkins lying in them
  const frame = [], loam = [], vines = [];
  // (the small things, one draw for each kind, put up at the end)
  const inst = { pumpkin: [], pumpkin_small: [], pumpkin_white: [], hay_bale: [], leaf_pile: [], crate_apples: [] }, pumpkins = inst;
  const bed = (cx, cz, w, d) => {
    const h = 0.26, t = 0.09, y = LAWN;
    for (const sx of [-1, 1]) frame.push(box(t, h, d, 0x8a5530, cx + sx * (w / 2 - t / 2), y + h / 2, cz));
    for (const sz of [-1, 1]) frame.push(box(w - 2 * t, h, t, 0x7d4c2a, cx, y + h / 2, cz + sz * (d / 2 - t / 2)));
    loam.push(box(w - 2 * t, 0.04, d - 2 * t, 0x4a3220, cx, y + h - 0.06, cz));
    // pumpkins down its middle (along its length), some leaves of the vine between
    const long = Math.max(w, d), across = Math.min(w, d), n = Math.max(2, Math.floor(long / 1.05));
    for (let i = 0; i < n; i++) {
      const u = (i + 0.5) / n, a = -long / 2 + 0.3 + u * (long - 0.6), b = (S() - 0.5) * (across - 0.6), kind = S();
      const [x, z] = d >= w ? [cx + b, cz + a] : [cx + a, cz + b];
      // (the big ones are the small model drawn half as big again: two thirds the triangles)
      const id = kind < 0.82 ? 'pumpkin_small' : 'pumpkin_white', rot = S() * 6.28;
      pumpkins[id].push([x, y + h - 0.04, z, rot, (1 + S() * 0.5) * (kind < 0.6 ? 1.5 : 1)]);
      for (let j = 0; j < 3; j++) vines.push([x + (S() - 0.5) * 0.7, y + h - 0.035, z + (S() - 0.5) * 0.7, S() * 6.28, 0.35 + S() * 0.2]);
    }
    ctx.placed.push([cx, cz, Math.max(w, d) / 2]);
  };
  const BW = 1.3, gap = 1.25 + S() * 0.4;
  for (const sx of [-1, 1]) {
    const cx = sx < 0 ? x0 - gap - BW / 2 : x1 + gap + BW / 2;
    const d1 = 2.6 + S() * 1.2, d2 = 2.4 + S() * 1.2;
    bed(cx, z0 + len * 0.18 + d1 / 2 - 1, BW, d1);
    bed(cx, z0 + len * 0.62 + (S() - 0.5), BW, d2);
  }
  // and two across the back, behind the far end; or, behind the giant pumpkin's hole, the show: tiers
  // of hay bales lined with prize pumpkins
  const bz = z0 - gap - BW / 2 - 0.4, bl = 3.2 + S() * 0.8;
  if (ctx.hole.props?.some(p => p.id === 'pumpkin_giant')) {
    for (let t = 0; t < 2; t++) for (let i = 0; i < 5 - t * 2; i++) {
      const x = mx - 2.2 + t * 1.1 + i * 1.1, z = z0 - 2 - t * 0.55;
      inst.hay_bale.push([x, LAWN + t * 0.46, z, 0, 1]);
      if (S() < 0.85) {
        const kind = S(), id = kind < 0.5 ? 'pumpkin' : kind < 0.75 ? 'pumpkin_white' : 'pumpkin_small';
        inst[id].push([x + (S() - 0.5) * 0.3, LAWN + 0.46 + t * 0.46, z + (t ? -0.05 : 0.12), S() * 6.28, id === 'pumpkin_small' ? 1.5 : 1.1 + S() * 0.3]);
      }
    }
    ctx.placed.push([mx, z0 - 2.3, 4.5]);
  } else for (const sx of [-1, 1]) bed(mx + sx * (bl / 2 + 0.6 + S() * 0.6), bz, bl, BW);
  if (frame.length) { group.add(merged(ctx, frame)); group.add(merged(ctx, loam)); }
  // (the vine's leaves: flat green leaves on the loam)
  if (vines.length) {
    const im = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), M.leaf, vines.length), c = new THREE.Color();
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), v = new THREE.Vector3(), sc = new THREE.Vector3();
    vines.forEach(([x, y, z, a, s], i) => { im.setMatrixAt(i, m4.compose(v.set(x, y, z), q.setFromAxisAngle(up, a), sc.set(s, 1, s))); im.setColorAt(i, c.setHSL(0.24 + S() * 0.06, 0.5, 0.28 + S() * 0.1)); });
    group.add(im);
  }
  // the scarecrow in the left beds' far end, or the right's; hay, crates, a wheelbarrow, a watering can
  const L = 1.2 + gap + BW; // (from the pond's edge out past the beds)
  const side = index % 2 ? 1 : -1, ox = side < 0 ? x0 - L - 1.4 : x1 + L + 1.4;
  stand(ctx, 'scarecrow_west', side < 0 ? x0 - gap - BW / 2 : x1 + gap + BW / 2, z0 + len * 0.18 - 1.6, side * -0.5, { k: 1.25, r: 0.8 });
  // a stack of hay bales with pumpkins on top
  const hz = z0 + len * (0.35 + S() * 0.2), hx = -side < 0 ? x0 - L - 1.1 : x1 + L + 1.1, hr = S() * 0.6 - 0.3;
  const bales = [[0, 0, 0], [0, 0, 0.56], [0, 0.46, 0.28]].map(([dx, dy, dz]) => {
    const c = Math.cos(hr), s = Math.sin(hr);
    return [hx + dx * c + dz * s, LAWN + dy, hz - dx * s + dz * c, hr + Math.PI / 2, 1];
  });
  inst.hay_bale.push(...bales);
  ctx.placed.push([hx, hz, 1]);
  inst.pumpkin.push([hx + 0.12, LAWN + 0.92, hz + 0.1, 1, 1.1]);
  inst.pumpkin_small.push([hx - 0.1, LAWN + 0.92, hz + 0.45, 2, 1.2], [hx + 0.3, LAWN, hz - 0.75, 0.5, 1.3]);
  inst.crate_apples.push([ox, LAWN, z0 + len * 0.8, S() * 6, 1.3], [ox + 0.15, LAWN, z0 + len * 0.8 - 0.6, S() * 6, 1.3], [ox + 0.05, LAWN + 0.37 * 1.3, z0 + len * 0.8 - 0.3, S() * 6, 1.3]);
  stand(ctx, 'wheelbarrow', -side < 0 ? x0 - L - 0.6 : x1 + L + 0.6, z0 + len * 0.86, -side * 2.4, { k: 1.1, low: true });
  stand(ctx, 'watering_can', side < 0 ? x0 - gap + 0.2 : x1 + gap - 0.2, z0 + len * 0.45, S() * 6, { k: 1.6, low: true, shadow: false });
  // maples round the garden, leaf piles under some
  const fx0 = x0 - L - 6, fx1 = x1 + L + 6, fz0 = z0 - 9, fz1 = z1 + 12;
  const trees = [[fx0 + 1.5, fz0 + 3], [fx1 - 1.8, fz0 + 2.5], [fx0 - 2.5, z0 + len * 0.45], [fx1 + 2.5, z0 + len * 0.35]];
  trees.forEach(([x, z], i) => {
    const id = (i + index) % 3 ? 'tree_maple_autumn' : 'tree_maple_autumn2';
    stand(ctx, id, x + (S() - 0.5) * 2, z + (S() - 0.5) * 2, S() * 6, { size: 4.4 + S() * 1.4, r: 2 });
    if (S() < 0.7) inst.leaf_pile.push([x + 1.4 + S(), LAWN, z + 1.2, S() * 6, 1.2 + S() * 0.5]);
  });
  // a few more pumpkins and leaf piles about the lawn
  const extra = [];
  for (let i = 0; i < 40 && extra.length < 8; i++) {
    const x = fx0 + 1 + S() * (fx1 - fx0 - 2), z = fz0 + 1 + S() * (fz1 - fz0 - 4);
    if (ctx.inPond(x, z, 1.2) || !ctx.free(x, z, 1.2)) continue;
    extra.push([x, LAWN, z, S() * 6.28, 1 + S() * 0.6]);
    ctx.placed.push([x, z, 0.4]);
  }
  inst.pumpkin.push(...extra.slice(0, 5));
  for (const [x, , z] of extra.slice(5)) inst.leaf_pile.push([x, LAWN, z, S() * 6, 1.1]);
  // (shadows from the crates; the pumpkins lie low in the beds, the leaves flat, and a hay bale's shadow
  // falls behind it, away from the camera: not worth the shadow pass's triangles)
  for (const id in inst) many(ctx, id, inst[id], { shadow: id === 'crate_apples' });
  // the fence: split rails round the garden, open behind the far end (where the backdrop is)
  const spots = [];
  const run = (ax, az, bx, bz) => {
    const n = Math.max(1, Math.round(Math.hypot(bx - ax, bz - az) / 2.05));
    for (let i = 0; i < n; i++) spots.push([ax + ((bx - ax) * (i + 0.5)) / n, LAWN, az + ((bz - az) * (i + 0.5)) / n, Math.atan2(-(bz - az), bx - ax), 1]);
  };
  run(fx0, fz0, mx - 8, fz0); run(mx + 8, fz0, fx1, fz0);
  run(fx1, fz0, fx1, fz1); run(fx0, fz1, fx0, fz0);
  many(ctx, 'fence_split_rail', spots, { far: true });
  // crows on the fence
  many(ctx, 'bird_crow', [[fx0, LAWN + 1.0, fz0 + 5 + S() * 4, Math.PI / 2 + S() - 0.5, 1.4], [fx1, LAWN + 1.0, fz0 + 3 + S() * 5, -Math.PI / 2 + S() - 0.5, 1.4]], { shadow: false });
  void R;
}

// ---- what stands behind the far end, changing from hole to hole: the hens' house (a little red barn) or
// a stack of hay bales and pumpkins under a maple; for the last hole both. All of it low: on a wide screen
// the lawn behind the course runs up under the HUD's top bar, and of anything standing there not two
// metres shows below the bar (a house, a full-size barn and its silo, a shed, all had their roofs cut off) ----
const BACKS = ['stack', 'barn', 'stack', 'barn', 'stack', 'stack', 'barn', 'stack', 'both'];
const BACK_Z = 4.3, BARN_S = 0.22; // (how far behind the pond's far bank; the barn's size: 1.4 m to the ridge)
function backdrop(ctx) {
  const { pond, index } = ctx, { x0, x1, z0 } = pond, mx = (x0 + x1) / 2, z = z0 - BACK_Z;
  const kind = BACKS[(index - 18 + BACKS.length * 9) % BACKS.length], S = rng(index * 31 + 5), side = S() < 0.5 ? -1 : 1;
  const hay = [], pk = []; // (one draw of each)
  if (kind === 'barn' || kind === 'both') {
    const bx = mx + side * (kind === 'both' ? 3.2 : 1 + S() * 2);
    barn(ctx, bx, z, side, BARN_S);
    hay.push([bx - side * 1.7, LAWN, z + 0.2, 0.3, 1.1], [bx - side * 1.6, LAWN + 0.46, z + 0.25, 0.25, 1.1]);
  }
  if (kind === 'stack' || kind === 'both') {
    // (bales two high, pumpkins along the top and a few at their feet; a maple behind)
    const x = mx - side * (kind === 'both' ? 3.2 : 1 + S() * 2);
    for (let t = 0; t < 2; t++) for (let i = 0; i < 3 - t; i++) {
      const bx = x - 1.1 + t * 0.55 + i * 1.1;
      hay.push([bx, LAWN + t * 0.46, z - t * 0.1, 0, 1.1]);
      if (t || S() < 0.4) pk.push([bx + (S() - 0.5) * 0.3, LAWN + (t + 1) * 0.46, z - t * 0.1, S() * 6.28, (1.1 + S() * 0.3) * 1.5]);
    }
    for (let i = 0; i < 3; i++) pk.push([x - 1.4 + i * 1.2 + S() * 0.4, LAWN, z + 0.75 + S() * 0.3, S() * 6.28, (1 + S() * 0.4) * 1.5]);
    ctx.placed.push([x, z, 2]);
    // (the last hole has maples enough round its show of prize pumpkins)
    const tr = kind === 'stack' && stand(ctx, 'tree_maple_autumn', x - side * 2.6, z - 3.4, S() * 6, { size: 6.5, r: 3, far: true });
    if (tr) tr.name = 'tree';
  }
  many(ctx, 'hay_bale', hay, { far: true, shadow: false });
  many(ctx, 'pumpkin_small', pk, { shadow: false }); // (the small model drawn bigger: two thirds the triangles)
}

/** a red barn with a gambrel roof, white trim and doors, a hayloft, drawn `s` its full size (7.4 m wide);
 *  at full size a cupola on it and a silo beside it */
function barn(ctx, x, z, side, s = 1) {
  const W = 7.4, D = 6, H1 = 3.4, H2 = 5.1, H3 = 6.2; // (width, depth; the roof's knee, its break, its ridge)
  const RED = 0xb23a2c, WHITE = 0xf3eee4, ROOF = 0x5b4e4a, DARK = 0x3a2a24, parts = [];
  // the walls and gables: the gambrel outline drawn out to the barn's depth
  const sh = new THREE.Shape();
  sh.moveTo(-W / 2, 0); sh.lineTo(W / 2, 0); sh.lineTo(W / 2, H1); sh.lineTo(W * 0.33, H2); sh.lineTo(0, H3); sh.lineTo(-W * 0.33, H2); sh.lineTo(-W / 2, H1); sh.closePath();
  parts.push(paint(new THREE.ExtrudeGeometry(sh, { depth: D, bevelEnabled: false }).translate(0, 0, -D / 2), RED));
  // the roof: four slabs over the outline, a little proud of it
  const slab = (ax, ay, bx, by) => {
    const L = Math.hypot(bx - ax, by - ay), a = Math.atan2(by - ay, bx - ax);
    const g = new THREE.BoxGeometry(L + 0.12, 0.14, D + 0.5).toNonIndexed();
    g.translate(0, 0.07, 0).rotateZ(a).translate((ax + bx) / 2, (ay + by) / 2, 0);
    return paint(g, ROOF);
  };
  parts.push(slab(-W / 2 - 0.25, H1 - 0.2, -W * 0.33, H2), slab(-W * 0.33, H2, 0, H3), slab(0, H3, W * 0.33, H2), slab(W * 0.33, H2, W / 2 + 0.25, H1 - 0.2));
  // white trim: corner boards, the gable's edge, the big doors with their X braces, the hayloft door
  const f = D / 2 + 0.03;
  for (const sx of [-1, 1]) parts.push(box(0.18, H1, 0.18, WHITE, sx * (W / 2 - 0.05), H1 / 2, f - 0.06), box(0.18, H1, 0.18, WHITE, sx * (W / 2 - 0.05), H1 / 2, -f + 0.06));
  const dw = 2.6, dh = 2.7;
  parts.push(box(dw, dh, 0.06, RED, 0, dh / 2, f + 0.01));
  for (const [w, h, px, py] of [[dw + 0.2, 0.16, 0, dh], [0.16, dh, -dw / 2, dh / 2], [0.16, dh, dw / 2, dh / 2], [0.12, dh, 0, dh / 2]]) parts.push(box(w, h, 0.08, WHITE, px, py, f + 0.04));
  for (const sx of [-1, 1]) {
    const cx = sx * dw / 4, L = Math.hypot(dw / 2, dh), a = Math.atan2(dh, dw / 2);
    parts.push(box(L - 0.1, 0.11, 0.08, WHITE, cx, dh / 2, f + 0.05, 0, 0, a), box(L - 0.1, 0.11, 0.08, WHITE, cx, dh / 2, f + 0.05, 0, 0, -a));
  }
  parts.push(box(1.2, 1.1, 0.06, DARK, 0, H1 + 0.55, f + 0.01), box(1.45, 0.14, 0.08, WHITE, 0, H1 + 1.15, f + 0.04), box(1.45, 0.14, 0.08, WHITE, 0, H1 - 0.05, f + 0.04));
  for (const sx of [-1, 1]) parts.push(box(0.14, 1.3, 0.08, WHITE, sx * 0.67, H1 + 0.55, f + 0.04));
  // windows either side of the doors
  for (const sx of [-1, 1]) parts.push(box(0.8, 0.8, 0.06, DARK, sx * 2.6, 1.9, f + 0.01), box(0.95, 0.12, 0.08, WHITE, sx * 2.6, 2.33, f + 0.04), box(0.95, 0.12, 0.08, WHITE, sx * 2.6, 1.47, f + 0.04));
  // the cupola on the ridge (a full-size barn's)
  if (s === 1) {
    parts.push(box(0.9, 0.8, 0.9, WHITE, 0, H3 + 0.35, 0));
    parts.push(paint(new THREE.ConeGeometry(0.8, 0.6, 4).rotateY(Math.PI / 4).translate(0, H3 + 1.05, 0), ROOF));
  }
  // the silo beside it, its dome
  if (s === 1) {
    const sx = side * -(W / 2 + 2.1);
    parts.push(paint(new THREE.CylinderGeometry(1.45, 1.5, 8.2, 14).translate(sx, 4.1, -0.6), 0xa9b2b4));
    for (const y of [1.6, 3.4, 5.2, 7]) parts.push(paint(new THREE.CylinderGeometry(1.52, 1.52, 0.12, 14).translate(sx, y, -0.6), 0x7f8a8e));
    parts.push(paint(new THREE.SphereGeometry(1.5, 14, 6, 0, Math.PI * 2, 0, Math.PI / 2).translate(sx, 8.2, -0.6), 0x8e9aa0));
  }
  const m = merged(ctx, parts);
  m.position.set(x, LAWN, z);
  m.rotation.y = side * 0.12;
  m.scale.setScalar(s);
  m.name = 'barn';
  ctx.group.add(m);
  ctx.course.deco.push({ g: m, far: true });
  ctx.placed.push([x, z, 6 * s]);
}

// ---- fallen leaves: on the lawn round the pond, and a few on the green along its rails ----
function lawnLeaves(ctx) {
  const { pond, R, M, group, index } = ctx, S = rng(index * 3 + 11), n = 220, list = [];
  for (let i = 0; i < 600 && list.length < n; i++) {
    const x = pond.x0 - 9 + S() * (pond.x1 - pond.x0 + 18), z = pond.z0 - 10 + S() * (pond.z1 - pond.z0 + 16);
    if (ctx.inPond(x, z, 0.5)) continue;
    list.push([x, z]);
  }
  leafCarpet(group, M.leaf, list.map(([x, z]) => [x, LAWN + 0.012, z]), S, 0.3);
  void R;
}
function greenLeaves(ctx) {
  const { tiles, at, Y, M, group, course, index } = ctx, S = rng(index * 5 + 2), list = [];
  // (on squares along the rails, off the tee and the cup)
  const on = new Set(tiles.map(t => t.c + ',' + t.r));
  for (const t of tiles) {
    const edge = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dc, dr]) => !on.has((t.c + dc) + ',' + (t.r + dr)));
    if (!edge.length || S() > 0.28) continue;
    const p = at(t.c, t.r);
    if (Math.hypot(p.x - course.cup.x, p.z - course.cup.z) < 1.2 || Math.hypot(p.x - course.tee.x, p.z - course.tee.z) < 1) continue;
    const [dc, dr] = edge[0], x = p.x + dc * 0.36 + (S() - 0.5) * 0.5 * (dr ? 1 : 0), z = p.z + dr * 0.36 + (S() - 0.5) * 0.5 * (dc ? 1 : 0);
    list.push([x, Y(x, z) + 0.004, z]);
  }
  leafCarpet(group, M.leaf, list, S, 0.2);
}
function leafCarpet(group, mat, list, S, size) {
  if (!list.length) return;
  const im = new THREE.InstancedMesh(new THREE.PlaneGeometry(size, size).rotateX(-Math.PI / 2), mat, list.length), c = new THREE.Color();
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), v = new THREE.Vector3(), sc = new THREE.Vector3();
  list.forEach(([x, y, z], i) => {
    const s = 0.7 + S() * 0.6;
    im.setMatrixAt(i, m4.compose(v.set(x, y, z), q.setFromAxisAngle(up, S() * 6.28), sc.set(s, 1, s)));
    im.setColorAt(i, c.set(LEAVES[Math.floor(S() * LEAVES.length)]));
  });
  im.receiveShadow = true;
  group.add(im);
}

// ---- mist lying on the lawn: two thin layers of soft cloud drifting slowly, behind and beside ----
function mist(ctx) {
  const { pond, M, group, course } = ctx, { x0, x1, z0, z1 } = pond;
  const tex = M.mist.map, parts = [];
  // (a wide band behind the far end and down both sides, clear of the pond)
  const band = (ax, az, bx, bz, y) => parts.push(new THREE.PlaneGeometry(bx - ax, bz - az).rotateX(-Math.PI / 2).translate((ax + bx) / 2, y, (az + bz) / 2));
  const y = LAWN + 0.7, out = 4;
  band(x0 - 30, z0 - 40, x1 + 30, z0 - out, y);
  band(x0 - 30, z0 - out, x0 - out - 3, z1 + 8, y);
  band(x1 + out + 3, z0 - out, x1 + 30, z1 + 8, y);
  // (texture coordinates from the world, so the bands join up: a copy of the cloud every 12 m)
  for (const g of parts) {
    const p = g.attributes.position, uv = g.attributes.uv;
    for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / 12, p.getZ(i) / 12);
  }
  const geo = mergeGeometries(parts);
  for (const g of parts) g.dispose();
  const m = new THREE.Mesh(geo, M.mist);
  m.renderOrder = 2;
  group.add(m);
  course.movers.push(t => { tex.offset.set(t * 0.012, t * 0.004); });
}

// ---- textures ----
let leafT, mistT;
function leafTex() {
  if (leafT) return leafT;
  const c = canvas(64, 64), g = c.getContext('2d');
  g.translate(32, 32);
  g.fillStyle = '#fff';
  g.beginPath(); g.moveTo(0, -28); g.quadraticCurveTo(22, -6, 0, 26); g.quadraticCurveTo(-22, -6, 0, -28); g.fill();
  g.strokeStyle = 'rgba(0, 0, 0, 0.3)'; g.lineWidth = 2.5;
  g.beginPath(); g.moveTo(0, -22); g.lineTo(0, 30); g.stroke();
  return (leafT = texture(c));
}
/** soft cloud, repeating both ways */
function mistTex() {
  if (mistT) return mistT;
  const n = 256, c = canvas(n, n), g = c.getContext('2d'), R = rng(41);
  for (let i = 0; i < 46; i++) {
    const x = R() * n, y = R() * n, r = 20 + R() * 46, a = 0.1 + R() * 0.16;
    for (const dx of [-n, 0, n]) for (const dy of [-n, 0, n]) {
      const gr = g.createRadialGradient(x + dx, y + dy, 0, x + dx, y + dy, r);
      gr.addColorStop(0, `rgba(255, 250, 242, ${a})`); gr.addColorStop(1, 'rgba(255, 250, 242, 0)');
      g.fillStyle = gr;
      g.fillRect(x + dx - r, y + dy - r, 2 * r, 2 * r);
    }
  }
  return (mistT = texture(c, true));
}

// ---- a few little pumpkins bobbing in the pond, out of the ducks' way and off the beds standing in it ----
function floatingPumpkins(ctx) {
  const { pond, onBlock, offLane, course, index } = ctx, S = rng(index * 13 + 7), spots = [];
  // (round a wallow, the first one or two by its banks)
  const b = ctx.hole.corner === 'wallow' && patches(ctx).blocks[0], near = b ? { x0: b.x0 - 1.2, x1: b.x1, z0: b.z0, z1: b.z1 + 1.2 } : pond;
  for (let i = 0; i < 120 && spots.length < 3; i++) {
    const r = i < 40 ? near : pond, x = r.x0 + 0.8 + S() * (r.x1 - r.x0 - 1.6), z = r.z0 + 0.8 + S() * (r.z1 - r.z0 - 1.6);
    if (onBlock(x, z, 0.5) || inBlock(ctx, x, z, 0.4) || !offLane(x, z, 0.7) || spots.some(([a, , b]) => Math.hypot(a - x, b - z) < 1.5)) continue;
    spots.push([x, WATER - 0.07, z, S() * 6.28, 1.3 + S() * 0.3]);
  }
  const im = many(ctx, 'pumpkin_small', spots, { shadow: false });
  if (!im) return;
  // (each rocked a little about where it floats, bobbing)
  const base = spots.map((_, i) => { const m = new THREE.Matrix4(); im.getMatrixAt(i, m); return m; });
  const T = new THREE.Matrix4(), Rm = new THREE.Matrix4(), back = new THREE.Matrix4(), e = new THREE.Euler();
  course.movers.push(t => {
    spots.forEach(([x, y, z], i) => {
      e.set(Math.sin(t * 1.1 + i) * 0.08, 0, Math.cos(t * 0.9 + i) * 0.08);
      T.makeTranslation(x, y + Math.sin(t * 1.4 + i * 2) * 0.02, z).multiply(Rm.makeRotationFromEuler(e)).multiply(back.makeTranslation(-x, -y, -z)).multiply(base[i]);
      im.setMatrixAt(i, T);
    });
    im.instanceMatrix.needsUpdate = true;
  });
}

// ---- leaves floating on the pond, drifting slowly round it ----
function floatingLeaves(ctx) {
  const { R, group, M, course } = ctx, L = lane(ctx), n = 26;
  const im = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.34, 0.34).rotateX(-Math.PI / 2), M.leaf, n);
  const c = new THREE.Color(), list = [];
  for (let i = 0; i < n; i++) {
    list.push({ s: R() * L.len, off: (R() - 0.5) * 1.6, rot: R() * 6, spin: (R() - 0.5) * 0.3 });
    im.setColorAt(i, c.set(LEAVES[i % LEAVES.length]));
  }
  group.add(im);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), one = new THREE.Vector3(1, 1, 1), v = new THREE.Vector3();
  course.movers.push(t => {
    list.forEach((l, i) => {
      const [x, z] = L.at(l.s + t * 0.05), [x2, z2] = L.at(l.s + t * 0.05 + 0.2), dx = x2 - x, dz = z2 - z, d = Math.hypot(dx, dz) || 1;
      im.setMatrixAt(i, m4.compose(v.set(x - (dz / d) * l.off, WATER + 0.01, z + (dx / d) * l.off), q.setFromAxisAngle(up, l.rot + t * l.spin), one));
    });
    im.instanceMatrix.needsUpdate = true;
  });
}

// ---- where the green steps down from one bed to the next: a timber edge along the top of the step,
// across the green squares it crosses (whatever the hole's shape); ramps along the map's rows or columns.
// (The slope itself stays turf, with its chevrons: boards over it, seen from behind, read as a wall) ----
function stepEdges(ctx) {
  const { hole, at, Y, group, M, tiles } = ctx, edges = [];
  for (const d of hole.ground || []) {
    if (d.t !== 'ramp') continue;
    const alongR = d.from[0] === d.to[0], alongC = d.from[1] === d.to[1];
    if (!alongR && !alongC) continue;
    const k = alongR ? 1 : 0, e = d.h < 0 ? d.from[k] : d.to[k]; // (the step's top)
    for (const t of tiles) {
      const v = k ? t.r : t.c;
      if (e < v - 0.5 || e > v + 0.5) continue;
      const q = k ? at(t.c, e) : at(e, t.r), eg = new THREE.BoxGeometry(k ? 1 : 0.09, 0.035, k ? 0.09 : 1);
      eg.translate(q.x, Y(q.x, q.z) + 0.012, q.z);
      edges.push(eg);
    }
  }
  if (!edges.length) return;
  const m = new THREE.Mesh(mergeGeometries(edges), M.cap);
  for (const g of edges) g.dispose();
  m.receiveShadow = true;
  group.add(m);
}

// ---- what isn't green inside the hole's own rectangle. A patch walled in by the green (an island) is a
// raised bed: loam up to the green's level, pumpkins lying in it. A wide stretch of pond inside the
// rectangle (inside an L or a U: a block of 3 by 3 squares or more) holds raised beds standing in the
// water, timber-framed, pumpkins along them, or a mud wallow (corner: 'wallow', so that two L's in a row
// don't look alike); nothing the ball can meet (it can't get there) ----
/** the hole's squares that aren't green: the islands ([c, r] each), and up to two open blocks (the
 *  biggest rectangles of 3 x 3 squares or more of the rest: { c0, r0, w, h } and their rect in the
 *  world, x0 x1 z0 z1); worked out once a hole */
function patches(ctx) {
  if (ctx.patches) return ctx.patches;
  const { tiles, W, H, at } = ctx, on = new Set(tiles.map(t => t.c + ',' + t.r));
  // (the squares not green that can be reached from outside the map without crossing green)
  const out = new Set(), q = [];
  for (let c = -1; c <= W; c++) for (const r of [-1, H]) q.push([c, r]);
  for (let r = -1; r <= H; r++) for (const c of [-1, W]) q.push([c, r]);
  while (q.length) {
    const [c, r] = q.pop(), k = c + ',' + r;
    if (out.has(k) || on.has(k) || c < -1 || r < -1 || c > W || r > H) continue;
    out.add(k);
    q.push([c + 1, r], [c - 1, r], [c, r + 1], [c, r - 1]);
  }
  const islands = [], open = new Set(), blocks = [];
  for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) {
    if (on.has(c + ',' + r)) continue;
    if (out.has(c + ',' + r)) open.add(c + ',' + r); else islands.push([c, r]);
  }
  for (let n = 0; n < 2; n++) {
    let best = null;
    for (let r0 = 0; r0 < H; r0++) for (let c0 = 0; c0 < W; c0++) {
      let w = W;
      for (let r1 = r0; r1 < H; r1++) {
        let run = 0;
        while (run < w && open.has((c0 + run) + ',' + r1)) run++;
        w = run;
        if (w < 3) break;
        const h = r1 - r0 + 1;
        if (h >= 3 && (!best || w * h > best.w * best.h)) best = { c0, r0, w, h };
      }
    }
    if (!best) break;
    for (let r = best.r0; r < best.r0 + best.h; r++) for (let c = best.c0; c < best.c0 + best.w; c++) open.delete(c + ',' + r);
    const a = at(best.c0, best.r0), b = at(best.c0 + best.w - 1, best.r0 + best.h - 1);
    blocks.push({ ...best, x0: a.x - 0.5, x1: b.x + 0.5, z0: a.z - 0.5, z1: b.z + 0.5 });
  }
  return (ctx.patches = { islands, blocks });
}
// (on a hole that says corner: 'wallow', what stands in its open block is the wallow's mud, not beds)
const inBlock = (ctx, x, z, m = 0) => ctx.hole.corner === 'wallow'
  ? wallowLobes(ctx).some(l => ((x - l.x) / (l.rx + m)) ** 2 + ((z - l.z) / (l.rz + m)) ** 2 < 1)
  : patches(ctx).blocks.some(b => x > b.x0 - m && x < b.x1 + m && z > b.z0 - m && z < b.z1 + m);

function beds(ctx) {
  const { at, group, M, index } = ctx, { islands, blocks } = patches(ctx);
  if (!islands.length && !blocks.length) return;
  const S = rng(index * 17 + 3), parts = [], vines = [], pk = { pumpkin_small: [] };
  // the islands: loam to the green's level, a pumpkin on about a third of them (the small model, the big
  // ones drawn half as big again)
  for (const [c, r] of islands) {
    const p = at(c, r);
    parts.push(box(1.02, 0.7, 1.02, 0x4a3220, p.x, -0.4, p.z));
    if (S() < 0.32) { const big = S() >= 0.5; pk.pumpkin_small.push([p.x + (S() - 0.5) * 0.5, -0.05, p.z + (S() - 0.5) * 0.5, S() * 6.28, (1 + S() * 0.4) * (big ? 1.5 : 1)]); }
  }
  // the open blocks: beds about 1.6 m across and 2.6 long, half a metre of water between them and 0.7 m
  // clear of the green's block (its rails and ledge reach 0.38 m out); or the wallow
  const IN = 0.7, GAP = 0.5, top = -0.03, y0 = WATER - 0.06, T = 0.09;
  if (ctx.hole.corner === 'wallow') wallow(ctx, S, parts, vines, pk);
  else for (const b of blocks) {
    const w = b.x1 - b.x0 - 2 * IN, d = b.z1 - b.z0 - 2 * IN, long = d >= w;
    const nAcross = Math.max(1, Math.round(((long ? w : d) + GAP) / 2.1)), nAlong = Math.max(1, Math.round(((long ? d : w) + GAP) / 3.1));
    const [nx, nz] = long ? [nAcross, nAlong] : [nAlong, nAcross], bw = (w - (nx - 1) * GAP) / nx, bd = (d - (nz - 1) * GAP) / nz;
    for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
      const cx = b.x0 + IN + bw / 2 + i * (bw + GAP), cz = b.z0 + IN + bd / 2 + j * (bd + GAP), hh = top - y0;
      for (const sx of [-1, 1]) parts.push(box(T, hh, bd, 0x8a5530, cx + sx * (bw / 2 - T / 2), y0 + hh / 2, cz));
      for (const sz of [-1, 1]) parts.push(box(bw - 2 * T, hh, T, 0x7d4c2a, cx, y0 + hh / 2, cz + sz * (bd / 2 - T / 2)));
      parts.push(box(bw - 2 * T, 0.04, bd - 2 * T, 0x4a3220, cx, top - 0.06, cz));
      // (pumpkins down its middle, the vine's leaves between)
      const L = Math.max(bw, bd), A = Math.min(bw, bd), n = Math.max(2, Math.floor(L / 1.05));
      for (let k = 0; k < n; k++) {
        const u = -L / 2 + 0.3 + ((k + 0.5) / n) * (L - 0.6), v = (S() - 0.5) * (A - 0.6);
        const [x, z] = bd >= bw ? [cx + v, cz + u] : [cx + u, cz + v];
        pk.pumpkin_small.push([x, top - 0.04, z, S() * 6.28, 1.3 + S() * 0.4]); // (the small one: two thirds the triangles)
        for (let m = 0; m < 3; m++) vines.push([x + (S() - 0.5) * 0.7, top - 0.035, z + (S() - 0.5) * 0.7, S() * 6.28, 0.35 + S() * 0.2]);
      }
    }
  }
  if (parts.length) {
    const mesh = merged(ctx, parts);
    mesh.castShadow = false; // (low, and mostly over water)
    group.add(mesh);
  }
  for (const id in pk) many(ctx, id, pk[id], { shadow: false });
  if (vines.length) {
    // (the vine's leaves, green; a fallen leaf (a sixth entry: its colour) as the autumn has them)
    const im = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), M.leaf, vines.length), c = new THREE.Color();
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), v = new THREE.Vector3(), sc = new THREE.Vector3();
    vines.forEach(([x, y, z, a, s, col], i) => { im.setMatrixAt(i, m4.compose(v.set(x, y, z), q.setFromAxisAngle(up, a), sc.set(s, 1, s))); im.setColorAt(i, col ? c.set(col) : c.setHSL(0.24 + S() * 0.06, 0.5, 0.28 + S() * 0.1)); });
    group.add(im);
  }
}

// ---- the mud wallow (Muddy Path's corner, in place of raised beds): two low banks of wet mud in the
// pond, darker where the water laps them, puddles with the sky in them and darker blotches on top, a
// clump of bulrushes at an end; a leaf pile on each, small pumpkins sunk in the mud and fallen leaves on
// it and floating round it. All of it low, below the green, one draw of each kind, no shadows ----
/** the wallow's banks: ellipses { x, z, rx, rz } in the hole's first open block, clear of the green's
 *  block (its rails reach 0.38 m out) on the sides it meets, worked out once a hole */
function wallowLobes(ctx) {
  if (ctx.wallowLobes) return ctx.wallowLobes;
  const b = patches(ctx).blocks[0], lobes = [];
  if (b) {
    const w = b.x1 - b.x0, d = b.z1 - b.z0, mx = (b.x0 + b.x1) / 2 - 0.15;
    // (a long one toward the camera, a rounder one up by the far arm, a channel of water between)
    lobes.push({ x: mx, z: b.z0 + d * 0.66, rx: Math.max(0.6, w / 2 - 0.8), rz: Math.max(0.6, d * 0.27) });
    if (d > 4.5) lobes.push({ x: mx - 0.1, z: b.z0 + d * 0.23, rx: Math.max(0.5, w / 2 - 1.05), rz: Math.max(0.5, d * 0.12) });
  }
  return (ctx.wallowLobes = lobes);
}
function wallow(ctx, S, parts, leaves, pk) {
  const lobes = wallowLobes(ctx);
  if (!lobes.length) return;
  const piles = [], HI = WATER + 0.14, LO = WATER + 0.05;
  // (a bank's outline: the ellipse, wobbling)
  const outline = (l, k, p1, p2) => Array.from({ length: 26 }, (_, i) => {
    const a = (i / 26) * Math.PI * 2, r = k * (1 + 0.1 * Math.sin(3 * a + p1) + 0.06 * Math.sin(5 * a + p2));
    return new THREE.Vector2(l.x + l.rx * r * Math.cos(a), -(l.z + l.rz * r * Math.sin(a)));
  });
  const slab = (pts, y1, col) => {
    const g = new THREE.ExtrudeGeometry(new THREE.Shape(pts), { depth: y1 - (WATER - 0.12), bevelEnabled: false, curveSegments: 1 }).rotateX(-Math.PI / 2);
    g.translate(0, WATER - 0.12, 0);
    parts.push(paint(g, col));
  };
  const flat = (x, z, rx, rz, y, col, n = 12) => parts.push(paint(new THREE.CircleGeometry(1, n).rotateX(-Math.PI / 2).scale(rx, 1, rz).translate(x, y, z), col));
  for (const [i, l] of lobes.entries()) {
    const p1 = S() * 6.28, p2 = S() * 6.28;
    slab(outline(l, 1.12, p1, p2), LO, 0x3f2716); // (wet and dark where the water laps it)
    slab(outline(l, 1, p1, p2), HI, 0x6e4a2c);
    // puddles with the sky in them (on the side away from the leaf pile), darker blotches
    for (let k = 0; k < 2 + i; k++) {
      const a = (S() - 0.5) * 2.4, r = 0.3 + S() * 0.3;
      flat(l.x + Math.cos(a) * l.rx * r, l.z + Math.sin(a) * l.rz * r, 0.24 + S() * 0.16, 0.15 + S() * 0.1, HI + 0.004, 0xa6c4d0);
    }
    for (let k = 0; k < 4; k++) {
      const a = S() * 6.28, r = S() * 0.7;
      flat(l.x + Math.cos(a) * l.rx * r, l.z + Math.sin(a) * l.rz * r, 0.18 + S() * 0.2, 0.12 + S() * 0.14, HI + 0.002, 0x553820, 9);
    }
    // a leaf pile toward the bank's outer side, small pumpkins sunk in the mud
    piles.push([l.x - l.rx * 0.4, HI - 0.03, l.z + (S() - 0.5) * l.rz * 0.5, S() * 6.28, (1 + S() * 0.25) * Math.min(1, l.rx / 1.1)]);
    for (let k = 0; k < (i ? 1 : 2); k++) pk.pumpkin_small.push([l.x + l.rx * (0.3 + S() * 0.2), HI - 0.06, l.z + (k - 0.5) * l.rz * 0.7 + (S() - 0.5) * 0.3, S() * 6.28, 1.3 + S() * 0.4]);
    // fallen leaves on the mud
    for (let k = 0; k < 14; k++) {
      const a = S() * 6.28, r = Math.sqrt(S()) * 0.9;
      leaves.push([l.x + Math.cos(a) * l.rx * r, HI + 0.008, l.z + Math.sin(a) * l.rz * r, S() * 6.28, 0.32 + S() * 0.14, LEAVES[k % LEAVES.length]]);
    }
  }
  // bulrushes at the near bank's far end: stems, and their brown heads
  const l = lobes[0], bx = l.x + l.rx * 0.35, bz = l.z - l.rz * 0.72;
  for (let k = 0; k < 6; k++) {
    const x = bx + (S() - 0.5) * 0.5, z = bz + (S() - 0.5) * 0.4, h = 0.55 + S() * 0.35, lx = (S() - 0.5) * 0.12, lz = (S() - 0.5) * 0.12;
    parts.push(box(0.03, h, 0.03, 0x6f7d34, x, HI + h / 2, z, 0, lz, lx));
    parts.push(box(0.065, 0.16, 0.065, 0x5a3a1e, x - lx * h * 0.5, HI + h - 0.02, z + lz * h * 0.5, 0, lz, lx));
  }
  // leaves floating in the water round the banks
  const b = patches(ctx).blocks[0];
  for (let k = 0, n = 0; k < 60 && n < 12; k++) {
    const x = b.x0 + 0.3 + S() * (b.x1 - b.x0 - 0.9), z = b.z0 + 0.6 + S() * (b.z1 - b.z0 - 0.9);
    if (lobes.some(o => ((x - o.x) / (o.rx * 1.2 + 0.1)) ** 2 + ((z - o.z) / (o.rz * 1.2 + 0.1)) ** 2 < 1) || ctx.onBlock(x, z, 0.2)) continue;
    leaves.push([x, WATER + 0.012, z, S() * 6.28, 0.3 + S() * 0.12, LEAVES[(k + 2) % LEAVES.length]]);
    n++;
  }
  many(ctx, 'leaf_pile', piles, { shadow: false });
}
