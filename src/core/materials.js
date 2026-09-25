// Shared materials. Every catalog object uses ONE material: flat-shaded Lambert with vertex colours,
// the decal atlas, per-instance tint (only on parts modelled with m.tint()), and dusk glow.
import * as THREE from 'three';

export const U = {
  glow: { value: 0.25 }, // global emissive strength for m.glow() parts (rises at dusk)
  time: { value: 0 },
  hiStripe: { value: 1 }, // stripes per metre on things too big to take (a few across each of them)
  // what the ball is about to run into: where it would hit, how wide and how high to mark the part
  // around that (a band from the ground up, so it shows above the ball), and a 0..1 fade (main.js)
  warnPos: { value: new THREE.Vector3() },
  warnR: { value: 1 },
  warnH: { value: 1 },
  warn: { value: 0 },
};

const cache = new Map();

/**
 * The shared object material. { highlight: true } is the world's variant: an extra per-instance
 * attribute iHi marks things near the ball — gold edges on what it can take (brighter the more
 * they're worth), red with slowly crawling diagonal stripes on what is still too big (stripes read on
 * any colour, even on red things) — so it's plain from afar what to go for and what to steer round.
 * Whatever the ball is about to run into flashes too, however big it is: all over (iHi = −4), or for
 * a big thing only the part it would hit (iHi in [−3, −2]).
 */
/**
 * The same material again as an object of its own (one per tag). three.js keeps one shader program
 * per material at a time: meshes of one material drawn instanced with per-instance colours, instanced
 * without, or not instanced at all make it look its program up again at every switch between them,
 * which with hundreds of draws a frame was an eighth of the frame on a phone. Each variant keeps
 * its own (the programs themselves are shared: same shader source).
 */
const variants = new WeakMap();
export function variant(mat, tag) {
  let v = variants.get(mat);
  if (!v) variants.set(mat, (v = {}));
  if (!v[tag]) {
    const m = mat.clone();
    m.onBeforeCompile = mat.onBeforeCompile;
    m.customProgramCacheKey = mat.customProgramCacheKey;
    v[tag] = m;
  }
  return v[tag];
}

export function objectMaterial(map, { highlight = false } = {}) {
  const key = highlight ? 'hi' : 'base';
  if (cache.has(key)) return cache.get(key);
  const mat = new THREE.MeshLambertMaterial({
    vertexColors: true,
    map,
    flatShading: true,
    alphaTest: 0.5,
  });
  mat.onBeforeCompile = sh => {
    sh.uniforms.uGlow = U.glow;
    sh.uniforms.uTime = U.time;
    let cv = THREE.ShaderChunk.color_vertex;
    const target = 'vColor.rgb *= instanceColor.rgb;';
    if (cv.includes(target)) {
      cv = cv.replace(target, 'vColor.rgb *= mix(vec3(1.0), instanceColor.rgb, aTint);');
    } else {
      console.warn('[materials] color_vertex chunk changed; instance tint masks disabled');
    }
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aGlow;\nattribute float aTint;\nvarying float vGlow;')
      .replace('#include <color_vertex>', cv + '\nvGlow = aGlow;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uGlow;\nuniform float uTime;\nvarying float vGlow;')
      .replace(
        '#include <emissivemap_fragment>',
        '#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * vGlow * uGlow;'
      );
    if (highlight) {
      sh.uniforms.uHiStripe = U.hiStripe;
      sh.uniforms.uWarnPos = U.warnPos;
      sh.uniforms.uWarnR = U.warnR;
      sh.uniforms.uWarnH = U.warnH;
      sh.uniforms.uWarn = U.warn;
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float iHi;\nvarying float vHi;\nvarying vec3 vHiP;\nvarying vec3 vHiW;')
        .replace('vGlow = aGlow;', 'vGlow = aGlow;\nvHi = iHi;') // (the colour chunk is already expanded above)
        // offset from the object's origin in world metres (its own turn and scale) for the stripes,
        // and the world position for the spot about to be hit
        .replace('#include <project_vertex>', `#include <project_vertex>
#ifdef USE_INSTANCING
vHiP = mat3(instanceMatrix) * transformed;
vHiW = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;
#else
vHiP = transformed;
vHiW = (modelMatrix * vec4(transformed, 1.0)).xyz;
#endif`);
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying float vHi;\nvarying vec3 vHiP;\nvarying vec3 vHiW;\nuniform float uHiStripe;\nuniform vec3 uWarnPos;\nuniform float uWarnR;\nuniform float uWarnH;\nuniform float uWarn;')
        .replace(
          'vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + totalEmissiveRadiance;',
          `vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + totalEmissiveRadiance;
          if (vHi != 0.0) {
            // brightest on faces seen edge-on, so shapes get a glowing outline
            float rim = 1.0 - abs(dot(normal, normalize(vViewPosition)));
            rim *= rim;
            if (vHi > 0.0) {
              float k = vHi * (0.88 + 0.12 * sin(uTime * 5.0));
              outgoingLight += vec3(1.0, 0.76, 0.22) * k * (0.45 * rim + 0.1);
            } else {
              float k = -vHi;
              float flash = 0.75 + 0.25 * sin(uTime * 11.0);
              if (k > 3.5) k = flash; // about to run into this
              else if (k > 1.5) {
                // about to run into this big thing: flash a band of it from the ground up around where
                // the ball would hit (not just that point, which the ball itself hides from the camera)
                float spot = (1.0 - smoothstep(uWarnR * 0.5, uWarnR, distance(vHiW.xz, uWarnPos.xz)))
                  * (1.0 - smoothstep(uWarnH, uWarnH * 1.6, vHiW.y - uWarnPos.y));
                k = max(k - 2.0, spot * uWarn * flash);
              }
              k *= 0.85 + 0.15 * sin(uTime * 6.0);
              float sc = (vHiP.x + vHiP.z + vHiP.y * 0.9) * uHiStripe - uTime * 0.5;
              float aw = fwidth(sc);
              float band = 1.0 - smoothstep(0.25 - aw, 0.25 + aw, abs(fract(sc) - 0.5));
              band = mix(band, 0.5, clamp(aw * 2.0 - 0.5, 0.0, 1.0)); // sub-pixel stripes: their average
              float lum = dot(outgoingLight, vec3(0.2126, 0.7152, 0.0722));
              vec3 red = vec3(0.9, 0.07, 0.05) * (0.3 + 1.2 * lum);
              outgoingLight = mix(outgoingLight, red, k * (0.25 + 0.5 * band));
              outgoingLight += vec3(1.0, 0.16, 0.12) * k * 0.35 * rim;
            }
          }`
        );
    }
  };
  mat.customProgramCacheKey = () => (highlight ? 'wanwu-object-hi-v3' : 'wanwu-object-v1');
  cache.set(key, mat);
  return mat;
}
