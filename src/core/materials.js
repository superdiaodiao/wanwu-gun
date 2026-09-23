// Shared materials. Every catalog object uses ONE material: flat-shaded Lambert with vertex colours,
// the decal atlas, per-instance tint (only on parts modelled with m.tint()), and dusk glow.
import * as THREE from 'three';

export const U = {
  glow: { value: 0.25 }, // global emissive strength for m.glow() parts (rises at dusk)
  time: { value: 0 },
};

let objectMat = null;

export function objectMaterial(map) {
  if (objectMat) return objectMat;
  const mat = new THREE.MeshLambertMaterial({
    vertexColors: true,
    map,
    flatShading: true,
    alphaTest: 0.5,
  });
  mat.onBeforeCompile = sh => {
    sh.uniforms.uGlow = U.glow;
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
      .replace('#include <common>', '#include <common>\nuniform float uGlow;\nvarying float vGlow;')
      .replace(
        '#include <emissivemap_fragment>',
        '#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * vGlow * uGlow;'
      );
  };
  mat.customProgramCacheKey = () => 'wanwu-object-v1';
  objectMat = mat;
  return mat;
}
