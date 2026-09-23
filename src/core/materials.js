// Shared materials. Every catalog object uses ONE material: flat-shaded Lambert with vertex colours,
// the decal atlas, per-instance tint (only on parts modelled with m.tint()), and dusk glow.
import * as THREE from 'three';

export const U = {
  glow: { value: 0.25 }, // global emissive strength for m.glow() parts (rises at dusk)
  time: { value: 0 },
};

const cache = new Map();

/**
 * The shared object material. { highlight: true } is the world's variant: an extra per-instance
 * attribute iHi lights up edges — gold for things the ball can take (brighter the more they're
 * worth), red for things that are still just too big — so it's plain what to go for and what to avoid.
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
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float iHi;\nvarying float vHi;')
        .replace('vGlow = aGlow;', 'vGlow = aGlow;\nvHi = iHi;'); // (the colour chunk is already expanded above)
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying float vHi;')
        .replace(
          'vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + totalEmissiveRadiance;',
          `vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + totalEmissiveRadiance;
          if (vHi != 0.0) {
            // brightest on faces seen edge-on, so shapes get a glowing outline
            float rim = 1.0 - abs(dot(normal, normalize(vViewPosition)));
            rim *= rim;
            float k = abs(vHi) * (0.88 + 0.12 * sin(uTime * 5.0));
            outgoingLight += vHi > 0.0 ? vec3(1.0, 0.76, 0.22) * k * (0.45 * rim + 0.1) : vec3(1.0, 0.16, 0.12) * k * (0.45 * rim + 0.06);
          }`
        );
    }
  };
  mat.customProgramCacheKey = () => (highlight ? 'wanwu-object-hi-v1' : 'wanwu-object-v1');
  cache.set(key, mat);
  return mat;
}
