// Shared materials. Every catalog object uses ONE material: flat-shaded Lambert with vertex colours,
// the decal atlas, per-instance tint (only on parts modelled with m.tint()), and dusk glow.
import * as THREE from 'three';

export const U = {
  glow: { value: 0.25 }, // global emissive strength for m.glow() parts (rises at dusk)
  time: { value: 0 },
  hiStripe: { value: 1 }, // stripes per metre on things too big to take (a few across each of them)
};

const cache = new Map();

/**
 * The shared object material. { highlight: true } is the world's variant: an extra per-instance
 * attribute iHi marks things near the ball — gold edges on what it can take (brighter the more
 * they're worth), red with slowly crawling diagonal stripes on what is still too big (stripes read on
 * any colour, even on red things) — so it's plain from afar what to go for and what to steer round.
 */
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
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float iHi;\nvarying float vHi;\nvarying vec3 vHiP;')
        .replace('vGlow = aGlow;', 'vGlow = aGlow;\nvHi = iHi;') // (the colour chunk is already expanded above)
        // offset from the object's origin in world metres (its own turn and scale), for the stripes
        .replace('#include <project_vertex>', '#include <project_vertex>\n#ifdef USE_INSTANCING\nvHiP = mat3(instanceMatrix) * transformed;\n#else\nvHiP = transformed;\n#endif');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying float vHi;\nvarying vec3 vHiP;\nuniform float uHiStripe;')
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
              float k = -vHi * (0.85 + 0.15 * sin(uTime * 6.0));
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
  mat.customProgramCacheKey = () => (highlight ? 'wanwu-object-hi-v2' : 'wanwu-object-v1');
  cache.set(key, mat);
  return mat;
}
