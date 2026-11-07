// The pool party (yard 2): a back garden at sundown, warm low sun and a peach sky. The block stands in
// a pool: its sides tiled, white rails with turquoise posts, a coping and a deck of boards round the
// water; loungers and parasols on the deck, a trampoline, a dog by its kennel, gnomes and flamingos
// on the lawn, string lights, a picket fence round it all; behind the deck, changing from hole to hole,
// a garden shed, a pool cabana, a playhouse, a pergola, swings, a football goal, towels on a line,
// vegetable beds, a paddling pool; the neighbours' trees over the fence. The green mown in stripes
// down the hole; pool floats drifting round.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { WATER, LAWN, BLOCK_TOP, BLOCK_BOT, lam, rng, canvas, texture, soilMaterial, lane } from './kit.js';
import { U } from '../../core/materials.js';
import { shapes, place, hut, swings, many, clearOfCup } from './pond.js';

const DECK = 3.2; // the boards round a pool

export default {
  sky: [[0, '#5a7fd6'], [0.42, '#d99ab8'], [0.75, '#ffbf8f'], [1, '#ffe0b0']], fog: 0xffd9b0, hemi: [0xffe2c8, 0xa59a74, 1.35],
  // the golden hour: the sun low (30 degrees up) and from the side, so the rails, parasols and the
  // ball cast long shadows (a touch paler than the duck pond's, as the pumpkin patch's)
  sun: [0xffc088, 3.4, [-0.85, 0.5, 0.22]], shadow: 0.9,
  // the duck pond's green, but mown in stripes running down the hole (course.js turf: 'cols'), not checked
  // (a touch closer together than its squares: the stripes quiet, the slopes' chevrons and shading over them)
  turf: { mow: 'cols', green: ['#62c74c', '#57bb43'] },
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
// flowers; string lights on poles at the deck's corners, a white picket fence round it all, trees over
// the fence; and behind the deck what this hole has there (backdrop)
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
  const flowers0 = group.children.length;
  for (let i = 0; i < 40 && placed.length < 30; i++) {
    const id = ['flower_patch', 'rose_pot', 'bush', 'sunflower', 'hedge'][Math.floor(R() * 5)];
    const sx = R() < 0.5 ? -1 : 1, x = sx < 0 ? x0 - L - 0.4 - R() * 5 : x1 + L + 0.4 + R() * 5, z = z0 - 4 + R() * (len + 6);
    if (!free(x, z, 1.5)) continue;
    stand(id, x, z, R() * 6, { size: id === 'hedge' ? 1.6 : id === 'bush' ? 1.1 : id === 'sunflower' ? 1.3 : 0.8, low: id !== 'sunflower' });
  }
  const flowers = group.children.slice(flowers0);
  // the fence: picket sections end to end round the garden
  const fx0 = x0 - L - 7, fx1 = x1 + L + 7, fz0 = z0 - DECK - 11, fz1 = z1 + 14;
  const proto = tryModel('fence_picket');
  if (proto) {
    const mesh = proto.children[0], spots = [];
    const run = (ax, az, bx, bz) => {
      const n = Math.round(Math.hypot(bx - ax, bz - az) / 2);
      for (let i = 0; i < n; i++) spots.push([ax + ((bx - ax) * (i + 0.5)) / n, az + ((bz - az) * (i + 0.5)) / n, Math.atan2(-(bz - az), bx - ax)]);
    };
    run(fx0, fz0, fx1, fz0);
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
  backdrop(ctx, fz0, flowers);
}

// ---- behind the deck, hole by hole (the yard's first hole first): two of the garden's things, each
// [what, where across (the pool's middle 0, its sides -1 and 1; 'L' or 'R': on the lawn beside the deck's far
// corner, turned to the pool), metres behind the pool's far edge to its middle]. All of them low: on a phone
// on its side the HUD's top bar comes down to the lawn just past the deck, and of anything standing there not
// two metres shows whole below it (the house that stood behind, 7.5 m to its chimney, only ever showed its
// walls), on hole 12 (the windmill's) not 1.65 m; beside the deck's far corners about 2.1 m. Then a few low
// plants towards the fence, and the neighbours' trees over it ----
const BACK = [
  [['shed', 0.4, 4], ['beds', -0.42, 3.9]],
  [['cabana', 'L', 1], ['towels', 0.4, 3.9]],
  [['playhouse', 0.42, 4], ['paddling', -0.4, 4]],
  [['pergola', 'R', 1.1], ['swings', -0.35, 4]],
  [['shed', -0.42, 4], ['goal', 0.4, 4.3]],
  [['cabana', 'R', 1], ['beds', -0.4, 3.9]],
  [['swings', 0.38, 4], ['towels', -0.4, 3.9]],
  [['playhouse', -0.42, 4], ['pergola', 'R', 1.1]],
  [['cabana', 'L', 1], ['goal', 0.72, 4.3]],
];
const HALF = { shed: 1, cabana: 1.1, playhouse: 0.8, pergola: 1.3, swings: 1.4, goal: 1, towels: 1.4, beds: 1.4, paddling: 1.2 };
// (the sheds', cabanas', playhouses' colours, the first and the second time each comes)
const SHED = [{ wall: 0x8fae8b, roof: 0x5a5560, door: 0x6f8f6b }, { wall: 0x8aa4bf, roof: 0x6a4a3a, door: 0x6c88a6 }];
const CABANA = [{ stripe: 0x2fb5c9 }, { stripe: 0xff7a6b }, { stripe: 0xf2b84a }];
const HOUSE = [{ wall: 0xf6c6d4, roof: 0xd9576e }, { wall: 0xf8e08e, roof: 0x4f8fd0 }];
const WHITE = 0xf7f4ec, TIMBER = 0xa8774a;

function backdrop(ctx, fz0, flowers) {
  const { pond, index, course, model, group } = ctx, S = rng(index * 41 + 9);
  const { x0, x1, z0 } = pond, mx = (x0 + x1) / 2, hw = (x1 - x0) / 2, i9 = ((index % 9) + 9) % 9;
  const seen = {};
  for (const [what, across, back] of BACK[i9]) {
    const n = BACK.slice(0, i9).flat().filter(b => b[0] === what).length + (seen[what] = (seen[what] || 0) + 1) - 1;
    const corner = typeof across === 'string', side = corner ? (across === 'L' ? -1 : 1) : across;
    const x = corner ? (side < 0 ? x0 - DECK - 1.3 : x1 + DECK + 1.3) : clearOfCup(ctx, mx + across * (hw - 1), across, HALF[what], hw);
    const z = z0 - back, turn = corner ? -side * 0.75 : -across * 0.35, k = shapes();
    // (the garden's flowers standing there make way)
    for (const g of flowers) {
      if (Math.abs(g.position.x - x) >= HALF[what] + 0.8 || Math.abs(g.position.z - z) >= 1.6) continue;
      group.remove(g);
      const j = course.deco.findIndex(o => o.g === g);
      if (j >= 0) course.deco.splice(j, 1);
    }
    if (what === 'shed') shed(k, SHED[n % 2]);
    else if (what === 'cabana') cabana(k, CABANA[n % 3]);
    else if (what === 'playhouse') playhouse(k, HOUSE[n % 2]);
    else if (what === 'pergola') pergola(k);
    else if (what === 'swings') swings(k, 0, 0, n % 2 ? 0x2f6fd0 : 0xe8554a, 0xf2c230);
    else if (what === 'goal') goal(k);
    else if (what === 'towels') towels(k, S);
    else if (what === 'beds') beds(k, S);
    else if (what === 'paddling') paddling(k);
    place(ctx, k.parts, x, z, turn, { r: 1.8, name: what });
    if (what === 'paddling' || what === 'goal') {
      // (a beach ball by it)
      let b;
      try { b = model('beach_ball', 1.6); } catch { b = null; }
      if (b) { b.position.set(x + 0.9 * Math.sign(-across || 1), LAWN, z + 0.7); group.add(b); course.deco.push({ g: b, far: true }); }
    }
  }
  // a tree in the garden, off to one side of the middle (cut by the top bar, as trees may be)
  for (let i = 0; i < 12; i++) {
    const x = mx + (S() < 0.5 ? -1 : 1) * (2 + S() * 4), z = z0 - 8.5 - S() * 2.5;
    if (!ctx.free(x, z, 2.2)) continue;
    let t;
    try { t = model(['tree_peach', 'tree_plane', 'tree_camphor'][index % 3], null, index % 3 ? 5 : 4.2); } catch { break; }
    t.position.set(x, LAWN, z);
    t.rotation.y = S() * 6;
    group.add(t);
    ctx.placed.push([x, z, 2]);
    course.deco.push({ g: t, far: true });
    break;
  }
  // towards the fence: a few low plants and a bench, here and there (none taller than the sunflowers)
  const low = [['bush', 1.1], ['flower_patch', 0.9], ['sunflower', 1.3], ['bush', 0.9], ['rose_pot', 0.6], ['bench', 1.6]];
  for (let i = 0, n = 0; i < 40 && n < 5; i++) {
    const x = x0 - 3 + S() * (x1 - x0 + 6), z = fz0 + 1 + S() * 5.5, [id, sz] = low[(n + index) % low.length];
    if (!ctx.free(x, z, 1.8)) continue;
    let g;
    try { g = model(id, null, sz); } catch { continue; }
    g.position.set(x, LAWN + 0.02, z);
    g.rotation.y = id === 'bench' ? S() * 0.6 - 0.3 : S() * 6;
    group.add(g);
    ctx.placed.push([x, z, 0.6]);
    course.deco.push({ g, far: true });
    n++;
  }
  // the neighbours' trees over the fence, with gaps (one draw a kind)
  const trees = { tree_plane: [], tree_camphor: [], tree_peach: [] }, kinds = Object.keys(trees);
  for (let tx = x0 - 14 + S() * 3; tx < x1 + 14; tx += 3.4 + S() * 3.5) {
    if (S() < 0.25) { tx += 3; continue; }
    const id = kinds[Math.floor(S() * 3)];
    trees[id].push([tx, LAWN, fz0 - 2.5 - S() * 7, S() * 6, { tree_plane: 7, tree_camphor: 7.5, tree_peach: 4.5 }[id] * (0.85 + S() * 0.3)]);
  }
  for (const id of kinds) many(ctx, id, trees[id]);
}

/** a garden shed: boarded walls, a double door, a window with a flower box (1.9 m) */
function shed(k, { wall, roof, door }) {
  hut(k, { w: 1.8, d: 1.4, h: 1.15, rise: 0.55, wall, roof, door, doorW: 0.78, doorX: -0.3, planks: 0.14, win: [[0.5, 0.78, 0.42, 0.36, 0xffd9a0, 1]] });
  k.box(0.02, 0.9, 0.035, 0x3b3631, -0.3, 0.55, 0.725);
  k.box(0.5, 0.1, 0.12, TIMBER, 0.5, 0.52, 0.77);
  for (let i = 0; i < 4; i++) k.ball(0.06, [0xff6b8b, 0xffffff, 0xf2c230, 0xff6b8b][i], 0.32 + i * 0.12, 0.6, 0.78);
}
/** a pool cabana: four white posts, a striped canopy, curtains tied back, a daybed with cushions (1.9 m) */
function cabana(k, { stripe }) {
  const W = 1.9, D = 1.6, H = 1.55;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.box(0.08, H, 0.08, WHITE, (sx * W) / 2, H / 2, (sz * D) / 2);
  k.box(W + 0.1, 0.08, D + 0.1, WHITE, 0, H, 0);
  // the canopy: a low roof of stripes from the middle out to both sides, a scalloped edge in front
  const n = 7, a = 0.3, L = W / 2 + 0.12, sw = (D + 0.2) / n;
  for (const s of [-1, 1]) for (let i = 0; i < n; i++) k.box(L, 0.03, sw, i % 2 ? WHITE : stripe, s * (L / 2) * Math.cos(a), H + 0.06 + 0.3 - (L / 2) * Math.sin(a), -D / 2 - 0.1 + sw * (i + 0.5), 0, 0, -s * a);
  for (let i = 0; i < 8; i++) k.box(W / 8 - 0.02, 0.12, 0.02, i % 2 ? WHITE : stripe, -W / 2 + (W / 8) * (i + 0.5), H - 0.06, D / 2 + 0.06);
  // curtains gathered at the front posts, a back curtain
  for (const sx of [-1, 1]) k.box(0.22, H - 0.2, 0.12, stripe, sx * (W / 2 - 0.1), H / 2 + 0.05, D / 2 - 0.08);
  k.box(W - 0.1, H - 0.15, 0.02, darken(stripe), 0, H / 2, -D / 2 + 0.02);
  // the daybed
  k.box(1.5, 0.3, 0.9, WHITE, 0, 0.15, -0.15);
  k.box(1.5, 0.08, 0.9, 0xf3efe6, 0, 0.34, -0.15);
  for (const [x, c] of [[-0.45, stripe], [0, 0xf2c230], [0.45, stripe]]) k.box(0.36, 0.3, 0.12, c, x, 0.5, -0.5);
}
const _c = new THREE.Color();
const darken = (col, f = 0.85) => _c.set(col).multiplyScalar(f).getHex();
/** a children's playhouse: pastel walls, white trim, a door, a window with shutters, a porch rail (1.55 m) */
function playhouse(k, { wall, roof }) {
  hut(k, { w: 1.4, d: 1.2, h: 0.95, rise: 0.48, wall, roof, door: 0x6fb6d8, doorW: 0.42, doorX: -0.3, win: [[0.33, 0.62, 0.36, 0.3, 0x5f7f96]] });
  for (const s of [-1, 1]) k.box(0.1, 0.32, 0.03, roof, 0.33 + s * 0.25, 0.62, 0.62);
  k.box(1.5, 0.06, 0.4, WHITE, 0, 0.13, 0.8);
  for (const x of [-0.7, -0.35, 0, 0.35, 0.7]) k.box(0.04, 0.32, 0.04, WHITE, x, 0.32, 0.98);
  k.box(1.44, 0.04, 0.04, WHITE, 0, 0.48, 0.98);
  k.ball(0.07, 0xff6b8b, -0.48, 0.18, 0.95);
}
/** a pergola: white posts and beams, slats over them grown with vines, a table and chairs under (2.1 m) */
function pergola(k) {
  const W = 2.2, D = 1.7, H = 1.85;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.box(0.1, H, 0.1, WHITE, (sx * W) / 2, H / 2, (sz * D) / 2);
  for (const sz of [-1, 1]) k.box(W + 0.4, 0.12, 0.07, WHITE, 0, H + 0.03, (sz * D) / 2);
  for (let i = 0; i < 7; i++) k.box(0.06, 0.07, D + 0.35, WHITE, -W / 2 + (W / 6) * i, H + 0.12, 0);
  for (let i = 0; i < 9; i++) k.ball(0.17, i % 3 ? 0x4f9f48 : 0x5fae55, -W / 2 + 0.1 + (i * (W - 0.2)) / 8, H + 0.16, (i % 2 ? 0.3 : -0.4) * D, 1.3, 0.6, 1.1);
  for (let i = 0; i < 4; i++) k.ball(0.06, 0xd96ba8, -0.8 + i * 0.5, H + 0.22, (i % 2 ? -0.1 : 0.4) * D);
  for (const sx of [-1, 1]) for (let j = 0; j < 3; j++) k.ball(0.11, 0x4f9f48, (sx * W) / 2, 0.4 + j * 0.5, D / 2, 1, 1.3, 1);
  k.cyl(0.42, 0.42, 0.04, WHITE, 0, 0.72, 0, 10);
  k.cyl(0.04, 0.04, 0.7, 0x6b6f75, 0, 0.36, 0, 5);
  for (const s of [-1, 1]) { k.box(0.34, 0.04, 0.34, TIMBER, s * 0.65, 0.44, 0); k.box(0.04, 0.38, 0.34, TIMBER, s * 0.82, 0.64, 0); }
}
/** a football goal: a white frame, a net of thin lines (1.05 m) */
function goal(k) {
  const W = 1.8, H = 1.0, D = 0.8;
  for (const s of [-1, 1]) { k.box(0.06, H, 0.06, WHITE, (s * W) / 2, H / 2, 0); k.rod([(s * W) / 2, H, 0], [(s * W) / 2, 0, -D], 0.025, WHITE); k.box(0.04, 0.04, D, WHITE, (s * W) / 2, 0.02, -D / 2); }
  k.box(W + 0.06, 0.06, 0.06, WHITE, 0, H, 0);
  k.box(W, 0.03, 0.03, WHITE, 0, 0.02, -D);
  for (let i = 1; i < 8; i++) k.rod([-W / 2 + (W * i) / 8, H, 0], [-W / 2 + (W * i) / 8, 0, -D], 0.008, 0xd9dde2, 3);
  for (let j = 1; j < 4; j++) k.box(W, 0.012, 0.012, 0xd9dde2, 0, H - (H * j) / 4, -(D * j) / 4);
}
/** a washing line between two posts, beach towels drying on it (1.55 m) */
function towels(k, S) {
  const W = 2.6, H = 1.55;
  for (const s of [-1, 1]) { k.box(0.06, H, 0.06, 0x8a8f96, (s * W) / 2, H / 2, 0); k.box(0.36, 0.05, 0.05, 0x8a8f96, (s * W) / 2, H - 0.05, 0); }
  k.box(W, 0.012, 0.012, 0xe9e9e3, 0, H - 0.08, 0);
  const cols = [[0xff7a6b, WHITE], [0x2fb5c9, 0xf2c230], [0xf2c230, 0xff6b8b], [0x5aa9e6, WHITE]];
  for (let i = 0; i < 4; i++) {
    const [a, b] = cols[(i + Math.floor(S() * 4)) % 4], x = -W / 2 + 0.4 + i * 0.6, h = 0.5 + S() * 0.15;
    for (let j = 0; j < 4; j++) k.box(0.48, h / 4, 0.015, j % 2 ? b : a, x, H - 0.08 - (h / 4) * (j + 0.5), 0);
  }
}
/** two raised vegetable beds: timber frames of earth, lettuces and a tomato plant on canes (0.9 m) */
function beds(k, S) {
  for (const [bx, bz] of [[-0.75, 0], [0.75, 0]]) {
    for (const [w, d, dx, dz] of [[1.2, 0.08, 0, -0.42], [1.2, 0.08, 0, 0.42], [0.08, 0.84, -0.6, 0], [0.08, 0.84, 0.6, 0]]) k.box(w, 0.3, d, TIMBER, bx + dx, 0.15, bz + dz);
    k.box(1.12, 0.06, 0.76, 0x5a3b22, bx, 0.26, bz);
    for (let i = 0; i < 6; i++) k.ball(0.11 + S() * 0.03, i % 2 ? 0x7cc34a : 0x5fae3f, bx - 0.4 + (i % 3) * 0.4, 0.34, bz + (i < 3 ? -0.18 : 0.18), 1, 0.7, 1);
  }
  for (const s of [-1, 1]) k.box(0.02, 0.85, 0.02, 0xc9a46a, s * 0.12 + 0.75, 0.6, 0);
  k.ball(0.16, 0x4f9f48, 0.75, 0.75, 0, 1, 1.4, 1);
  for (let i = 0; i < 4; i++) k.ball(0.045, 0xe8402a, 0.7 + (i % 2) * 0.12, 0.6 + i * 0.07, 0.1);
}
/** a children's paddling pool: a blue ring of water (0.3 m) */
function paddling(k) {
  k.cyl(0.85, 0.88, 0.26, 0x3a8fd8, 0, 0.13, 0, 16);
  k.cyl(0.87, 0.87, 0.06, 0xf7f4ec, 0, 0.27, 0, 16);
  k.cyl(0.8, 0.8, 0.02, 0x7fdcf0, 0, 0.22, 0, 16);
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
