// Ground: flat zone layers (grass, asphalt, tiled sidewalks, plaza stone, bricks, water, fields…)
// painted procedurally in world space so they read at 1 cm and at 1 km. Layers are drawn without
// depth (no z-fighting between coplanar zones), topmost first, each marking the stencil so the ones
// below skip those pixels: every ground pixel runs one zone shader. A depth-only plane then lets
// the ground hide anything below y = 0 (items stuck to the bottom of the ball).
import * as THREE from 'three';

export const ZONES = [
  'grass', 'field', 'dirt', 'sand', 'concrete', 'plaza', 'brick', 'sidewalk', 'tactile',
  'road', 'track', 'stone', 'water', 'marking', 'marking_y',
];

const COMMON = /* glsl */ `
uniform float uTime;
varying vec3 vWPos;
vec3 lin(vec3 c) { return pow(c, vec3(2.2)); }
float h12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float vn(vec2 p) {
  vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(h12(i), h12(i + vec2(1.0, 0.0)), u.x), mix(h12(i + vec2(0.0, 1.0)), h12(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm3(vec2 p) { return vn(p) * 0.5 + vn(p * 2.03 + 3.1) * 0.25 + vn(p * 4.07 + 7.7) * 0.125; }
// 1 on grid lines of width w with spacing s; fades to average coverage when lines get sub-pixel
float gridAA(vec2 p, vec2 s, float w) {
  vec2 fw = fwidth(p);
  vec2 g = abs(fract(p / s + 0.5) - 0.5) * s;
  vec2 l = 1.0 - smoothstep(vec2(w * 0.5) - fw, vec2(w * 0.5) + fw, g);
  float line = max(l.x, l.y);
  float fade = smoothstep(0.15, 0.6, max(fw.x / s.x, fw.y / s.y));
  return mix(line, min(1.0, 2.0 * w / min(s.x, s.y)), fade);
}
// detail visibility for features of size s (1 when crisp, 0 when sub-pixel)
float vis(vec2 fw, float s) { return 1.0 - smoothstep(0.25 * s, 1.0 * s, max(fw.x, fw.y)); }
`;

const KIND_CODE = {
  grass: `
    float n1 = fbm3(p * 0.02);
    float n2 = vn(p * 0.35);
    float n3 = vn(p * 3.1);
    float n4 = h12(floor(p * 55.0));
    vec3 col = mix(lin(vec3(0.47, 0.69, 0.33)), lin(vec3(0.60, 0.74, 0.36)), smoothstep(0.3, 0.72, n1));
    col = mix(col, lin(vec3(0.37, 0.59, 0.28)), smoothstep(0.55, 0.9, n2) * 0.45);
    col *= 0.93 + 0.14 * mix(0.5, n3, vis(fw, 0.3));
    col *= 0.9 + 0.2 * mix(0.5, n4, vis(fw, 0.018));
    // a few tiny wildflowers (round, sparse)
    vec2 fc = p * 6.0;
    float flower = step(0.993, h12(floor(fc))) * smoothstep(0.32, 0.18, length(fract(fc) - 0.5)) * vis(fw, 0.1);
    col = mix(col, mix(lin(vec3(0.98, 0.93, 0.62)), lin(vec3(0.95, 0.72, 0.82)), step(0.5, h12(floor(fc) + 3.0))), flower * 0.7);
    return col;`,
  field: `
    vec2 cell = floor(p / 36.0);
    float k = h12(cell);
    float dir = step(0.5, h12(cell + 5.0));
    float coord = mix(p.x, p.y, dir);
    float rows = abs(fract(coord / 1.1) - 0.5);
    vec3 crop = k < 0.35 ? lin(vec3(0.52, 0.72, 0.30)) : (k < 0.7 ? lin(vec3(0.86, 0.74, 0.34)) : lin(vec3(0.40, 0.62, 0.32)));
    vec3 soil = lin(vec3(0.52, 0.40, 0.29));
    float row = smoothstep(0.12, 0.26, rows);
    row = mix(row, 0.7, 1.0 - vis(fw, 0.9));
    vec3 col = mix(soil, crop, row);
    col *= 0.9 + 0.18 * fbm3(p * 0.08);
    float path = gridAA(p, vec2(36.0), 1.4);
    col = mix(col, lin(vec3(0.62, 0.52, 0.38)), path);
    return col;`,
  dirt: `
    vec3 col = lin(vec3(0.66, 0.55, 0.40)) * (0.85 + 0.25 * fbm3(p * 0.5));
    col *= 0.92 + 0.16 * mix(0.5, h12(floor(p * 40.0)), vis(fw, 0.025));
    return col;`,
  sand: `
    vec3 col = lin(vec3(0.92, 0.84, 0.64)) * (0.9 + 0.12 * fbm3(p * 0.9));
    col *= 0.94 + 0.12 * mix(0.5, h12(floor(p * 120.0)), vis(fw, 0.008));
    return col;`,
  concrete: `
    vec3 col = lin(vec3(0.78, 0.77, 0.74)) * (0.92 + 0.12 * fbm3(p * 0.25));
    col *= 0.95 + 0.1 * mix(0.5, h12(floor(p * 70.0)), vis(fw, 0.014));
    col = mix(col, lin(vec3(0.58, 0.57, 0.55)), gridAA(p, vec2(3.0), 0.015));
    col = mix(col, col * 0.86, smoothstep(0.7, 0.8, vn(p * 0.12)) * 0.6);
    return col;`,
  plaza: `
    vec2 id = floor(p / 1.2);
    float r = h12(id);
    vec3 col = mix(lin(vec3(0.87, 0.83, 0.76)), lin(vec3(0.80, 0.76, 0.70)), r);
    col = mix(col, lin(vec3(0.62, 0.58, 0.53)), gridAA(p, vec2(1.2), 0.02));
    float band = gridAA(p + 0.6, vec2(9.6), 0.6);
    col = mix(col, lin(vec3(0.74, 0.46, 0.36)), band * 0.85);
    col *= 0.95 + 0.08 * fbm3(p * 0.4);
    return col;`,
  brick: `
    vec2 q = p / vec2(0.24, 0.12);
    q.x += 0.5 * mod(floor(q.y), 2.0);
    float r = h12(floor(q));
    vec3 col = mix(lin(vec3(0.66, 0.42, 0.35)), lin(vec3(0.56, 0.34, 0.29)), r);
    vec2 f = abs(fract(q) - 0.5);
    vec2 fwq = fwidth(q);
    float lineX = smoothstep(0.46 - fwq.x * 1.5, 0.46 + fwq.x * 1.5, f.x);
    float lineY = smoothstep(0.42 - fwq.y * 1.5, 0.42 + fwq.y * 1.5, f.y);
    float m = max(lineX, lineY) * vis(fw, 0.06);
    col = mix(col, lin(vec3(0.76, 0.73, 0.68)), m * 0.85 + (1.0 - vis(fw, 0.06)) * 0.12);
    return col;`,
  sidewalk: `
    vec2 id = floor(p / 0.5);
    float r = h12(id);
    vec3 col = mix(lin(vec3(0.80, 0.76, 0.70)), lin(vec3(0.71, 0.67, 0.62)), r);
    col = mix(col, lin(vec3(0.53, 0.50, 0.46)), gridAA(p, vec2(0.5), 0.012));
    col *= 0.94 + 0.1 * vn(p * 1.7);
    return col;`,
  tactile: `
    vec3 col = lin(vec3(0.93, 0.74, 0.20));
    vec2 c = fract(p / 0.05) - 0.5;
    float dotm = 1.0 - smoothstep(0.2, 0.3, length(c));
    col = mix(col, lin(vec3(1.0, 0.86, 0.38)), dotm * vis(fw, 0.05) * 0.8);
    col = mix(col, lin(vec3(0.66, 0.52, 0.16)), gridAA(p, vec2(0.3), 0.008));
    return col;`,
  road: `
    float n = fbm3(p * 0.12);
    vec3 col = lin(vec3(0.34, 0.35, 0.37)) * (0.88 + 0.16 * n);
    col *= 0.9 + 0.2 * mix(0.5, h12(floor(p * 80.0)), vis(fw, 0.012));
    col = mix(col, lin(vec3(0.28, 0.29, 0.31)), smoothstep(0.74, 0.76, vn(p * 0.07)) * 0.55);
    return col;`,
  track: `
    vec3 col = lin(vec3(0.76, 0.34, 0.26)) * (0.92 + 0.1 * fbm3(p * 0.6));
    col *= 0.94 + 0.1 * mix(0.5, h12(floor(p * 90.0)), vis(fw, 0.011));
    return col;`,
  stone: `
    vec2 q = p / 0.6;
    vec2 id = floor(q + 0.5 * vec2(mod(floor(q.y), 2.0), 0.0));
    vec3 col = mix(lin(vec3(0.62, 0.62, 0.60)), lin(vec3(0.52, 0.53, 0.52)), h12(id));
    col = mix(col, lin(vec3(0.38, 0.38, 0.37)), gridAA(p, vec2(0.6), 0.03));
    return col;`,
  water: `
    float t = uTime;
    float n = fbm3(p * 0.35 + vec2(t * 0.04, t * 0.025));
    float n2 = vn(p * 2.4 - vec2(t * 0.25, t * 0.12));
    vec3 col = mix(lin(vec3(0.20, 0.50, 0.60)), lin(vec3(0.38, 0.68, 0.74)), n);
    col += lin(vec3(1.0)) * smoothstep(0.78, 0.92, n2) * 0.3 * vis(fw, 0.4);
    return col;`,
  marking: `
    return lin(vec3(0.95, 0.94, 0.9)) * (0.88 + 0.12 * vn(p * 6.0));`,
  marking_y: `
    return lin(vec3(0.96, 0.78, 0.26)) * (0.88 + 0.12 * vn(p * 6.0));`,
};

const shared = { uTime: { value: 0 } };

function zoneMaterial(kind) {
  const mat = new THREE.MeshLambertMaterial({ color: 0xffffff });
  mat.depthTest = false;
  mat.depthWrite = false;
  mat.stencilWrite = true;
  mat.stencilRef = 1;
  mat.stencilFunc = THREE.NotEqualStencilFunc;
  mat.stencilZPass = THREE.ReplaceStencilOp;
  mat.onBeforeCompile = sh => {
    sh.uniforms.uTime = shared.uTime;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\n${COMMON}\nvec3 zoneColor(vec2 p, vec2 fw) {\n${KIND_CODE[kind]}\n}`)
      .replace('vec4 diffuseColor = vec4( diffuse, opacity );', 'vec4 diffuseColor = vec4( zoneColor(vWPos.xz, fwidth(vWPos.xz)), opacity );')
      // no depth test or write, so no need for the log-depth write, which would also turn off the
      // early stencil test that skips covered layers
      .replace('#include <logdepthbuf_fragment>', '');
  };
  mat.customProgramCacheKey = () => 'zone-' + kind;
  return mat;
}

/** polygon helpers for the layout */
export const poly = {
  rect(x0, z0, x1, z1) {
    return [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];
  },
  /** rectangle centred at (cx, cz) with half sizes and rotation */
  orect(cx, cz, hw, hd, rot = 0) {
    const c = Math.cos(rot), s = Math.sin(rot);
    return [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]].map(([x, z]) => [cx + x * c + z * s, cz - x * s + z * c]);
  },
  ellipse(cx, cz, rx, rz, seg = 48) {
    const pts = [];
    for (let i = 0; i < seg; i++) {
      const a = (i / seg) * Math.PI * 2;
      pts.push([cx + Math.cos(a) * rx, cz + Math.sin(a) * rz]);
    }
    return pts;
  },
  /** thick polyline (e.g. a lane marking or a path) as quads */
  strip(points, width) {
    const out = [];
    for (let i = 0; i < points.length - 1; i++) {
      const [x0, z0] = points[i], [x1, z1] = points[i + 1];
      const dx = x1 - x0, dz = z1 - z0, L = Math.hypot(dx, dz) || 1;
      const nx = (-dz / L) * width / 2, nz = (dx / L) * width / 2;
      out.push([[x0 + nx, z0 + nz], [x1 + nx, z1 + nz], [x1 - nx, z1 - nz], [x0 - nx, z0 - nz]]);
    }
    return out;
  },
  /** ring between two ellipses, as quads */
  ellipseRing(cx, cz, rx0, rz0, rx1, rz1, seg = 64) {
    const out = [];
    for (let i = 0; i < seg; i++) {
      const a0 = (i / seg) * Math.PI * 2, a1 = ((i + 1) / seg) * Math.PI * 2;
      out.push([
        [cx + Math.cos(a0) * rx0, cz + Math.sin(a0) * rz0],
        [cx + Math.cos(a1) * rx0, cz + Math.sin(a1) * rz0],
        [cx + Math.cos(a1) * rx1, cz + Math.sin(a1) * rz1],
        [cx + Math.cos(a0) * rx1, cz + Math.sin(a0) * rz1],
      ]);
    }
    return out;
  },
};

export class Ground {
  constructor(scene) {
    this.scene = scene;
    this.meshes = [];
    this.u = shared;
  }

  /** zones: { kind: [polygon, ...] } where polygon = [[x, z], ...] */
  build(zones, baseRadius = 20000) {
    const base = new THREE.CircleGeometry(baseRadius, 96).rotateX(-Math.PI / 2);
    // drawn last of the ground: it only fills what no zone covers
    this.addMesh('grass', base, -43);
    ZONES.forEach((kind, i) => {
      const polys = zones[kind];
      if (!polys || !polys.length) return;
      const pos = [];
      for (const pts of polys) {
        if (pts.length < 3) continue;
        const contour = pts.map(p => new THREE.Vector2(p[0], p[1]));
        let faces;
        try {
          faces = THREE.ShapeUtils.triangulateShape(contour, []);
        } catch (e) {
          continue;
        }
        for (const f of faces) {
          const a = pts[f[0]], b = pts[f[1]], c = pts[f[2]];
          // make every triangle face up (+Y)
          const ny = (b[1] - a[1]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[1] - a[1]);
          const tri = ny >= 0 ? [a, b, c] : [a, c, b];
          for (const q of tri) pos.push(q[0], 0, q[1]);
        }
      }
      if (!pos.length) return;
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      const nor = new Float32Array(pos.length);
      for (let j = 1; j < nor.length; j += 3) nor[j] = 1;
      g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
      this.addMesh(kind, g, -44 - i); // later zones sit on top, so they draw first
    });
    // depth-only plane so the ground occludes what is below it
    const depth = new THREE.Mesh(
      new THREE.CircleGeometry(baseRadius, 96).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ colorWrite: false })
    );
    depth.renderOrder = -30;
    depth.frustumCulled = false;
    this.scene.add(depth);
    this.meshes.push(depth);
  }

  addMesh(kind, geometry, order) {
    const mesh = new THREE.Mesh(geometry, zoneMaterial(kind));
    mesh.renderOrder = order;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    this.scene.add(mesh);
    this.meshes.push(mesh);
    return mesh;
  }

  update(time) {
    shared.uTime.value = time;
  }
}
