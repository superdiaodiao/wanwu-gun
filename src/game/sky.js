// Sky dome with the time-of-day cycle, drifting clouds, stars, and the story's centrepiece:
// the hole 女娲 knocked into the sky (a burning, cracked rift into a swirling cosmos) which
// gets patched with five-coloured light in the finale.
import * as THREE from 'three';

const VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  // pin it to the far plane: drawn last, the depth test leaves only the pixels nothing else covered
  gl_Position.z = gl_Position.w;
}`;

const FRAG = /* glsl */ `
uniform vec3 uZenith;
uniform vec3 uHorizon;
uniform vec3 uGround;
uniform vec3 uSunColor;
uniform vec3 uSunDir;
uniform vec3 uHoleDir;
uniform float uTime;
uniform float uHole;
uniform float uPatch;
uniform float uStars;
uniform float uCloud;
varying vec3 vDir;

float h12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float vn(vec2 p) {
  vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(h12(i), h12(i + vec2(1.0, 0.0)), u.x), mix(h12(i + vec2(0.0, 1.0)), h12(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { s += a * vn(p); p = p * 2.03 + vec2(1.7, 9.2); a *= 0.5; } return s; }

vec3 five(float t) {
  vec3 c[5];
  c[0] = vec3(0.12, 0.62, 0.58); c[1] = vec3(0.86, 0.18, 0.14); c[2] = vec3(0.98, 0.76, 0.26);
  c[3] = vec3(0.98, 0.96, 0.92); c[4] = vec3(0.36, 0.22, 0.58);
  float x = fract(t) * 5.0; int i = int(floor(x)); float f = smoothstep(0.0, 1.0, fract(x));
  vec3 a = c[0], b = c[1];
  if (i == 1) { a = c[1]; b = c[2]; } else if (i == 2) { a = c[2]; b = c[3]; } else if (i == 3) { a = c[3]; b = c[4]; } else if (i == 4) { a = c[4]; b = c[0]; }
  return mix(a, b, f);
}

void main() {
  vec3 d = normalize(vDir);
  float h = d.y;
  float hp = max(h, 0.0);
  vec3 col = mix(uHorizon, uZenith, pow(hp, 0.5));
  col = mix(col, uGround, smoothstep(0.0, -0.1, h));

  // sun disc + glow
  float sd = max(dot(d, uSunDir), 0.0);
  col += uSunColor * (smoothstep(0.9993, 0.9997, sd) * 5.0 + pow(sd, 64.0) * 0.4 + pow(sd, 6.0) * 0.12);

  // stars at night
  if (uStars > 0.001) {
    vec2 sc = vec2(atan(d.z, d.x) * 140.0, asin(clamp(h, -1.0, 1.0)) * 140.0);
    vec2 cid = floor(sc);
    float st = step(0.9965, h12(cid)) * smoothstep(0.02, 0.25, h) * smoothstep(0.3, 0.05, length(fract(sc) - 0.5));
    col += vec3(0.9, 0.93, 1.0) * st * uStars * (0.55 + 0.45 * sin(uTime * 2.0 + h12(cid + 7.0) * 40.0));
  }

  // clouds on a virtual plane
  if (h > 0.0) {
    vec2 uv = d.xz / (h + 0.16) + vec2(uTime * 0.006, uTime * 0.0025);
    float c = fbm(uv * 1.5);
    float cov = smoothstep(0.64 - uCloud * 0.22, 0.92, c) * smoothstep(0.02, 0.2, h);
    float lit = 0.78 + 0.4 * pow(sd, 3.0);
    vec3 cc = mix(uHorizon, vec3(1.0), 0.5) * lit;
    col = mix(col, cc, cov * 0.88);
  }

  // ---- the hole in the sky ----
  vec3 H = uHoleDir;
  float rr = acos(clamp(dot(d, H), -1.0, 1.0));
  vec3 bx = normalize(cross(H, vec3(0.0, 1.0, 0.0)));
  vec3 by = cross(bx, H);
  float ang = atan(dot(d, by), dot(d, bx));
  vec2 ring = vec2(cos(ang), sin(ang));
  float jag = 0.07 * vn(ring * 2.2 + 3.0) + 0.05 * vn(ring * 6.0 + 11.0) + 0.025 * vn(ring * 17.0 + 5.0);
  float edge = (0.2 + jag) * uHole;
  float live = 1.0 - uPatch;
  if (rr < edge * 2.6 + 0.05) {
    float inside = 1.0 - smoothstep(edge - 0.005, edge + 0.005, rr);
    vec2 q = ring * rr * 9.0;
    float tt = uTime * 0.05;
    float sw = fbm(q + vec2(sin(tt), cos(tt)) * 0.9 + fbm(q * 1.4 - tt));
    vec3 cosmos = mix(vec3(0.02, 0.01, 0.07), vec3(0.45, 0.12, 0.58), sw);
    cosmos = mix(cosmos, vec3(0.1, 0.38, 0.72), smoothstep(0.55, 0.82, sw) * 0.6);
    vec2 sq = q * 16.0;
    vec2 sid = floor(sq);
    float star = step(0.975, h12(sid)) * smoothstep(0.22, 0.02, length(fract(sq) - 0.5));
    cosmos += vec3(1.0, 0.95, 0.85) * star * (0.6 + 0.4 * sin(uTime * 4.0 + h12(sid + 3.0) * 30.0));
    float rim = exp(-abs(rr - edge) * 60.0) * uHole;
    float crack = 0.0;
    if (rr > edge) {
      // jagged cracks: angle wobble from two noise octaves along the radius, thinner further out
      float a2 = ang * 6.0 + (vn(ring * 4.0 + rr * 36.0) - 0.5) * 1.3 + (vn(ring * 9.0 + rr * 110.0) - 0.5) * 0.5;
      float w = mix(60.0, 260.0, smoothstep(edge, edge * 2.4, rr));
      crack = pow(1.0 - abs(sin(a2)), w) * (1.0 - smoothstep(edge, edge * (1.8 + 0.8 * vn(ring * 2.0 + 17.0)), rr)) * uHole;
    }
    col = mix(col, cosmos, inside * live);
    col += vec3(1.0, 0.52, 0.22) * (rim * 1.7 + crack * 0.8) * live;

    if (uPatch > 0.0) {
      float cellv = h12(floor(q * 2.5));
      vec3 fc = five(cellv + uTime * 0.08);
      float mosaic = (1.0 - smoothstep(edge - 0.02, edge + 0.02, rr)) * uPatch * (1.0 - smoothstep(0.55, 1.0, uPatch));
      col = mix(col, fc * 1.35, mosaic);
      float rd = rr - (edge + 0.07);
      vec3 rb = 0.5 + 0.5 * cos(6.2831 * (rd * 5.0 + vec3(0.0, 0.33, 0.67)));
      col += rb * exp(-rd * rd * 700.0) * smoothstep(0.25, 0.8, uPatch) * 0.55;
    }
  }

  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

// hour, zenith, horizon, sun colour, sun intensity, hemi sky, hemi ground, hemi intensity, stars, glow
const KEYS = [
  [6.0, 0x3d5d92, 0xf2b98a, 0xffb27a, 1.3, 0xb8c8e8, 0x8a7a68, 0.85, 0.15, 0.9],
  [8.0, 0x5e98d6, 0xf0dcc6, 0xffe2bc, 2.3, 0xcfe0f8, 0xa89276, 1.1, 0, 0.35],
  [11.0, 0x4a8fdc, 0xd4eaf8, 0xfff8ec, 2.9, 0xd4e8ff, 0xb09a7c, 1.25, 0, 0.2],
  [14.0, 0x4789d6, 0xd6ebf8, 0xffffff, 3.0, 0xd4e8ff, 0xb09a7c, 1.25, 0, 0.2],
  [16.5, 0x507fc0, 0xf0dcc2, 0xffe0b0, 2.5, 0xd8dcee, 0xb09274, 1.15, 0, 0.35],
  [17.8, 0x3e5c9a, 0xffb27c, 0xffb070, 1.9, 0xc8c0d8, 0xa08070, 1.0, 0, 0.8],
  [18.6, 0x28396e, 0xff8f62, 0xff8050, 1.1, 0xa8a0c8, 0x806a68, 0.85, 0.15, 1.3],
  [19.4, 0x141d3c, 0x6c4a7a, 0xff6a44, 0.35, 0x6a7098, 0x4a4250, 0.6, 0.6, 1.9],
  [21.0, 0x070c1e, 0x1d2848, 0xff6a44, 0.05, 0x3a4468, 0x2a2a38, 0.45, 1.0, 2.1],
];

const _a = new THREE.Color(), _b = new THREE.Color();
function lerpHex(out, h1, h2, t) {
  _a.setHex(h1);
  _b.setHex(h2);
  return out.copy(_a).lerp(_b, t);
}

export class Sky {
  constructor(scene) {
    this.u = {
      uZenith: { value: new THREE.Color() },
      uHorizon: { value: new THREE.Color() },
      uGround: { value: new THREE.Color(0x9a8f80) },
      uSunColor: { value: new THREE.Color() },
      uSunDir: { value: new THREE.Vector3(0, 1, 0) },
      uHoleDir: { value: new THREE.Vector3(0, Math.sin(0.72), -Math.cos(0.72)).normalize() },
      uTime: { value: 0 },
      uHole: { value: 1 },
      uPatch: { value: 0 },
      uStars: { value: 0 },
      uCloud: { value: 0.55 },
    };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.u,
      vertexShader: VERT,
      fragmentShader: FRAG,
      side: THREE.BackSide,
      depthWrite: false,
      depthTest: true,
      fog: false,
    });
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24), mat);
    this.mesh.renderOrder = 1000; // after every opaque thing, before the transparent effects
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
    this.hour = 9;
    this.fogColor = new THREE.Color();
    this.hemiSky = new THREE.Color();
    this.hemiGround = new THREE.Color();
    this.sunColor = new THREE.Color();
    this.sunI = 2.5;
    this.hemiI = 1.2;
    this.glow = 0.2;
  }

  /** Set the clock (hours, 6..21) and derive every colour. */
  setHour(hour) {
    this.hour = hour;
    let i = 0;
    while (i < KEYS.length - 2 && hour > KEYS[i + 1][0]) i++;
    const k1 = KEYS[i], k2 = KEYS[i + 1];
    const t = THREE.MathUtils.clamp((hour - k1[0]) / (k2[0] - k1[0]), 0, 1);
    const u = this.u;
    lerpHex(u.uZenith.value, k1[1], k2[1], t);
    lerpHex(u.uHorizon.value, k1[2], k2[2], t);
    lerpHex(this.sunColor, k1[3], k2[3], t);
    u.uSunColor.value.copy(this.sunColor);
    this.sunI = k1[4] + (k2[4] - k1[4]) * t;
    lerpHex(this.hemiSky, k1[5], k2[5], t);
    lerpHex(this.hemiGround, k1[6], k2[6], t);
    this.hemiI = k1[7] + (k2[7] - k1[7]) * t;
    u.uStars.value = k1[8] + (k2[8] - k1[8]) * t;
    this.glow = k1[9] + (k2[9] - k1[9]) * t;
    // fog, the sky's horizon and the sky below the horizon share one colour, so the far edge of the
    // ground melts into the sky instead of showing a seam
    this.fogColor.copy(u.uHorizon.value);
    u.uGround.value.copy(this.fogColor);
    // sun path: east (+X) at 6h, south (+Z) at noon, west (−X) at 18h
    const phi = ((hour - 6) / 12) * Math.PI;
    const el = Math.max(0.05, Math.sin(Math.min(Math.max(phi, 0), Math.PI)) * 1.08);
    u.uSunDir.value.set(Math.cos(phi) * Math.cos(el), Math.sin(el), Math.sin(phi) * Math.cos(el) * 0.85 + 0.25).normalize();
  }

  update(camera, time) {
    this.mesh.position.copy(camera.position);
    // any radius works (the vertex shader pins depth to the far plane); a huge one would lose
    // float precision in the clip test and drop triangles
    this.mesh.scale.setScalar(1200);
    this.u.uTime.value = time;
  }
}
