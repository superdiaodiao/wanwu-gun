// The pool party (yard 2): a back garden at sundown, warm low sun and a peach sky. The block stands in
// a pool: its sides tiled, white rails with turquoise posts, a coping and a deck of boards round the
// water; loungers and parasols on the deck, a trampoline, a dog by its kennel, gnomes and flamingos
// on the lawn, string lights, a picket fence, the house behind; pool floats drifting round.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { WATER, LAWN, BLOCK_TOP, BLOCK_BOT, lam, rng, canvas, texture, soilMaterial, lane } from './kit.js';
import { U } from '../../core/materials.js';

const DECK = 3.2; // the boards round a pool

export default {
  sky: [[0, '#5a7fd6'], [0.42, '#d99ab8'], [0.75, '#ffbf8f'], [1, '#ffe0b0']], fog: 0xffd9b0, hemi: [0xffe2c8, 0xa59a74, 1.35],
  // the golden hour: the sun low (30 degrees up) and from the side, so the rails, parasols and the
  // ball cast long shadows (a touch paler than the duck pond's, as the pumpkin patch's); the turf stays
  // the duck pond's green
  sun: [0xffc088, 3.4, [-0.85, 0.5, 0.22]], shadow: 0.9,
  card: 'linear-gradient(#5a7fd6, #d99ab8 48%, #ffc48f)',
  // (a swim ring)
  icon: '<svg class="ic" viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="11" fill="none" stroke="#fff" stroke-width="7"/><circle cx="16" cy="16" r="11" fill="none" stroke="#ff5d5d" stroke-width="7" stroke-dasharray="8.64 8.64"/></svg>',
  // the block's sides tiled, white rails, a deck
  materials() {
    const tiles = poolTiles();
    return {
      side: soilMaterial(BLOCK_BOT, BLOCK_TOP, false, tiles), sideLifted: soilMaterial(BLOCK_BOT, BLOCK_TOP, true, tiles), bank: soilMaterial(WATER - 0.3, LAWN, false, tiles),
      ledge: lam(0xf2ede2), lawn: lam(0x7fc45a), rail: lam(0xfbf5ea), post: lam(0x35b3cc), cap: lam(0xffffff),
      deck: new THREE.MeshLambertMaterial({ map: deckBoards() }), coping: lam(0xf6f2ea), dark: lam(0x3a3f45),
      bulb: new THREE.MeshBasicMaterial({ color: 0xffd98a }),
    };
  },
  water: poolWater,
  surroundings(ctx) {
    const { ring, M, group } = ctx;
    const deck = new THREE.Mesh(new THREE.ShapeGeometry(ring(DECK, 2.6, -0.3, 1.9), 8).rotateX(-Math.PI / 2), M.deck);
    deck.position.y = LAWN + 0.02;
    deck.receiveShadow = true;
    const coping = new THREE.Mesh(new THREE.ExtrudeGeometry(ring(0.42, 2, 0.16, 1.45), { depth: 0.07, bevelEnabled: false, curveSegments: 8 }).rotateX(-Math.PI / 2), M.coping);
    coping.position.y = LAWN + 0.015;
    coping.receiveShadow = coping.castShadow = true;
    group.add(deck, coping);
    backGarden(ctx);
  },
  floaters: floats,
};

// ---- the pool's walls (and the block's sides in it): a white coping over a band of blue tiles at the
// waterline, then pale aqua mosaic, darker going down; it repeats left to right, one copy a metre ----
let tileTex;
function poolTiles() {
  if (tileTex) return tileTex;
  const w = 128, h = 256, c = canvas(w, h), g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, '#bff0f6'); grad.addColorStop(0.5, '#8fdbe8'); grad.addColorStop(1, '#4fb6cc');
  g.fillStyle = grad;
  g.fillRect(0, 0, w, h);
  const T = 16; // (a tile is an eighth of a metre)
  for (let y = 30; y < h; y += T) for (let x = 0; x < w; x += T) {
    g.fillStyle = `rgba(255, 255, 255, ${(0.08 + ((x * 7 + y * 13) % 5) * 0.03).toFixed(2)})`;
    g.fillRect(x + 1, y + 1, T - 2, T - 2);
  }
  g.fillStyle = 'rgba(40, 110, 140, 0.25)';
  for (let y = 30; y < h; y += T) g.fillRect(0, y, w, 1.5);
  for (let x = 0; x < w; x += T) g.fillRect(x, 30, 1.5, h - 30);
  // the waterline band of deep blue tiles
  g.fillStyle = '#2b7fc4';
  g.fillRect(0, 18, w, 14);
  g.fillStyle = 'rgba(255, 255, 255, 0.35)';
  for (let x = 0; x < w; x += 8) g.fillRect(x, 18, 1, 14);
  // the coping
  g.fillStyle = '#f6f2ea';
  g.fillRect(0, 0, w, 18);
  g.fillStyle = 'rgba(0, 0, 0, 0.08)';
  g.fillRect(0, 15, w, 3);
  return (tileTex = texture(c, true));
}

// ---- the deck round the pool: honey-coloured boards with dark gaps, two metres to a copy ----
let deckTex;
function deckBoards() {
  if (deckTex) return deckTex;
  const n = 256, c = canvas(n, n), g = c.getContext('2d'), R = rng(11);
  const B = n / 8; // (a board is a quarter metre wide)
  for (let i = 0; i < 8; i++) {
    // two boards end to end across each row, their joins staggered
    const cut = (0.2 + R() * 0.6) * n;
    for (const [x0, x1] of [[0, cut], [cut, n]]) {
      const k = 0.88 + R() * 0.2;
      g.fillStyle = `rgb(${Math.round(205 * k)}, ${Math.round(150 * k)}, ${Math.round(95 * k)})`;
      g.fillRect(x0, i * B, x1 - x0, B);
      for (let j = 0; j < 6; j++) {
        g.fillStyle = 'rgba(120, 70, 30, 0.12)';
        g.fillRect(x0, i * B + 3 + R() * (B - 6), x1 - x0, 1.2);
      }
      g.fillStyle = 'rgba(60, 35, 15, 0.55)';
      g.fillRect(x0, i * B, 2, B);
    }
    g.fillStyle = 'rgba(60, 35, 15, 0.6)';
    g.fillRect(0, i * B, n, 2.5);
  }
  const t = texture(c, true);
  t.repeat.set(0.5, 0.5);
  return (deckTex = t);
}

// ---- the water: a pool's turquoise with a net of bright light wavering on its floor ----
function poolWater() {
  const m = new THREE.MeshLambertMaterial({ color: 0x2cc3dc });
  m.onBeforeCompile = sh => {
    sh.uniforms.uTime = U.time;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;\nuniform float uTime;')
      .replace('#include <color_fragment>', `#include <color_fragment>
      {
        vec2 p = vWPos.xz * 1.5;
        float t = uTime * 0.7;
        vec2 q = p + vec2(sin(p.y * 1.3 + t), cos(p.x * 1.1 - t)) * 0.55;
        float a = abs(sin(q.x * 2.1 + t) + sin(q.y * 2.3 - t * 0.8));
        float b = abs(sin((q.x + q.y) * 1.7 - t * 1.1) + sin((q.x - q.y) * 1.9 + t * 0.7));
        float c = pow(max(0.0, 1.0 - min(a, b) * 0.9), 6.0);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.86, 1.0, 1.0), c * 0.32);
      }`);
  };
  m.customProgramCacheKey = () => 'golf-pool';
  return m;
}

// the back garden round the pool: loungers and parasols on the deck, a barbecue, a ladder down into
// the water; on the lawn a trampoline, a dog by its kennel, gnomes and plastic flamingos among the
// flowers; string lights on poles at the deck's corners, a white picket fence round it all, the house
// behind the far end, and trees over the fence
function backGarden(ctx) {
  const { model, group, placed, course, pond, R, free, M } = ctx;
  const tryModel = (id, k, size) => { try { return model(id, k, size); } catch { return null; } };
  const stand = (id, x, z, rot, { k = 1, size, y = LAWN + 0.02, low = false, far = false, r = 0 } = {}) => {
    const g = tryModel(id, size ? null : k, size);
    if (!g) return null;
    g.position.set(x, y, z);
    g.rotation.y = rot;
    group.add(g);
    placed.push([x, z, r]);
    if (far) course.deco.push({ g, far: true });
    else if (!low) course.deco.push({ g, box: new THREE.Box3().setFromObject(g) });
    return g;
  };
  const { x0, x1, z0, z1 } = pond, mx = (x0 + x1) / 2, D = DECK / 2 + 0.1, len = z1 - z0;
  // the deck: a lounger each side near each end, feet to the pool, a parasol between each pair
  for (const sx of [-1, 1]) {
    const x = sx < 0 ? x0 - D : x1 + D;
    for (const f of [0.22, 0.62]) stand('lounger', x, z0 + len * f, sx < 0 ? Math.PI / 2 : -Math.PI / 2, { low: true });
    stand('parasol', x - sx * 0.2, z0 + len * 0.42, R() * 6, { low: true });
  }
  stand('bbq_grill', x1 + D, z0 - D + 0.2, -Math.PI * 0.75, { r: 0.4 });
  stand('pool_ladder', x0 + 0.05, z0 + len * 0.82, Math.PI / 2, { y: LAWN + 0.085 - 0.9, low: true });
  // the lawn beyond the deck
  const L = DECK + 0.6;
  stand('trampoline', x0 - L - 2.3, z0 + len * 0.2, 0, { r: 1.3 });
  stand('doghouse', x1 + L + 1.8, z0 + len * 0.35, -Math.PI / 2, { r: 0.6 });
  stand('dog_shiba', x1 + L + 0.9, z0 + len * 0.35 + 1.1, -Math.PI * 0.6, { k: 1.3 });
  stand('garden_gnome', x0 - L - 0.6, z1 - 1.2, Math.PI * 0.25, { low: true });
  stand('garden_gnome', x1 + L + 0.5, z0 + len * 0.7, -Math.PI * 0.3, { low: true });
  stand('lawn_flamingo', x1 + L + 1.2, z0 + len * 0.62, 0.4, { low: true });
  stand('lawn_flamingo', x1 + L + 1.75, z0 + len * 0.66, -0.3, { low: true });
  for (let i = 0; i < 40 && placed.length < 30; i++) {
    const id = ['flower_patch', 'rose_pot', 'bush', 'sunflower', 'hedge'][Math.floor(R() * 5)];
    const sx = R() < 0.5 ? -1 : 1, x = sx < 0 ? x0 - L - 0.4 - R() * 5 : x1 + L + 0.4 + R() * 5, z = z0 - 4 + R() * (len + 6);
    if (!free(x, z, 1.5)) continue;
    stand(id, x, z, R() * 6, { size: id === 'hedge' ? 1.6 : id === 'bush' ? 1.1 : id === 'sunflower' ? 1.3 : 0.8, low: id !== 'sunflower' });
  }
  // the house, facing the pool across the lawn behind the far end
  stand('house_back', mx, z0 - DECK - 9, 0, { far: true });
  // the fence: picket sections end to end round the garden, but for where the house stands
  const fx0 = x0 - L - 7, fx1 = x1 + L + 7, fz0 = z0 - DECK - 11, fz1 = z1 + 14;
  const proto = tryModel('fence_picket');
  if (proto) {
    const mesh = proto.children[0], spots = [];
    const run = (ax, az, bx, bz) => {
      const n = Math.round(Math.hypot(bx - ax, bz - az) / 2);
      for (let i = 0; i < n; i++) spots.push([ax + ((bx - ax) * (i + 0.5)) / n, az + ((bz - az) * (i + 0.5)) / n, Math.atan2(-(bz - az), bx - ax)]);
    };
    run(fx0, fz0, mx - 7, fz0); run(mx + 7, fz0, fx1, fz0);
    run(fx1, fz0, fx1, fz1); run(fx0, fz1, fx0, fz0);
    const im = new THREE.InstancedMesh(mesh.geometry, mesh.material, spots.length);
    im.userData.keep = true; // (the catalog's shape: kept)
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(1, 1, 1), v = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    spots.forEach(([x, z, a], i) => im.setMatrixAt(i, m4.compose(v.set(x, LAWN, z).add(mesh.position), q.setFromAxisAngle(up, a), sc)));
    im.castShadow = im.receiveShadow = true;
    group.add(im);
    course.deco.push({ g: im, far: true });
  }
  // trees in the corners and over the fence
  for (const [x, z, id, size] of [[fx0 + 2, fz0 + 3, 'tree_plane', 5], [fx1 - 2.5, fz0 + 2.5, 'tree_camphor', 4.6], [fx0 - 3, z0 + len * 0.5, 'tree_plane', 5.5], [fx1 + 3, z0 + len * 0.4, 'tree_camphor', 5.2], [mx - 12, fz0 - 4, 'tree_plane', 6], [mx + 13, fz0 - 5, 'tree_camphor', 6]]) {
    stand(id, x, z, R() * 6, { size, far: z < z0 - DECK });
  }
  // string lights: a pole at each corner of the deck, a sagging line of bulbs down each long side
  // and across the far end
  const pts = [], H = 2.7, P = [[x0 - DECK + 0.3, z0 - DECK + 0.3], [x1 + DECK - 0.3, z0 - DECK + 0.3], [x1 + DECK - 0.3, z1 + DECK - 0.3], [x0 - DECK + 0.3, z1 + DECK - 0.3]];
  const poleGeo = new THREE.CylinderGeometry(0.05, 0.06, H, 8).translate(0, H / 2, 0);
  for (const [x, z] of P) { const pole = new THREE.Mesh(poleGeo, M.dark); pole.position.set(x, LAWN, z); pole.castShadow = true; group.add(pole); }
  const wires = [];
  for (const [a, b] of [[0, 1], [0, 3], [1, 2]]) {
    const [ax, az] = P[a], [bx, bz] = P[b], n = Math.max(4, Math.round(Math.hypot(bx - ax, bz - az) / 0.6)), line = [];
    for (let i = 0; i <= n; i++) {
      const u = i / n, y = LAWN + H - 0.05 - Math.sin(u * Math.PI) * 0.55;
      line.push(new THREE.Vector3(ax + (bx - ax) * u, y, az + (bz - az) * u));
      if (i && i < n) pts.push([ax + (bx - ax) * u, y - 0.09, az + (bz - az) * u]);
    }
    wires.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(line), n * 2, 0.012, 4));
  }
  group.add(new THREE.Mesh(mergeGeometries(wires), M.dark));
  for (const w of wires) w.dispose();
  const bulbs = new THREE.InstancedMesh(new THREE.SphereGeometry(0.065, 8, 6), M.bulb, pts.length);
  const m4 = new THREE.Matrix4();
  pts.forEach(([x, y, z], i) => bulbs.setMatrixAt(i, m4.makeTranslation(x, y, z)));
  group.add(bulbs);
}

// ---- the pool's floats drifting round along the lane ----
function floats(ctx) {
  const { model, group, R, course } = ctx, L = lane(ctx), loopLen = L.len;
  const list = [['flamingo_float', 1], ['pool_ring', 1], ['beach_ball', 1], ['rubber_duck', 5], ['pool_noodle', 1], ['rubber_duck', 4]]
    .map(([id, k], i) => { try { const g = model(id, k); group.add(g); return { g, i, at: (i / 6) * loopLen + R() * 0.8, spin: (R() - 0.5) * 0.6 }; } catch { return null; } })
    .filter(Boolean);
  course.movers.push(t => {
    for (const f of list) {
      const [x, z] = L.at(f.at + t * 0.12);
      f.g.position.set(x, WATER - 0.04 + Math.sin(t * 1.6 + f.i) * 0.02, z);
      f.g.rotation.set(Math.sin(t * 1.3 + f.i) * 0.05, f.i + t * f.spin, Math.cos(t * 1.1 + f.i) * 0.05);
    }
  });
}
