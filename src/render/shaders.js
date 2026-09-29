import * as THREE from 'three';

// Uniforms shared by every patched material. Updated once per frame in main.js; because patched
// shaders link these objects (not copies), one write reaches them all.
export const GLOBALS = {
  uTime: { value: 0 }, // simulation seconds (stops while paused)
  uWind: { value: 1 }, // wind strength, ~1 calm … ~2.5 storm
  uWindDir: { value: new THREE.Vector2(1, 0.25).normalize() }, // blows towards +x, like the clouds
  uSnow: { value: 0 }, // 0..1, how much snow lies on the ground
  uSnowColor: { value: new THREE.Color('#f2f5fa') },
};

// Adds GLSL to a built-in three.js material without rewriting its shader.
//   head:  declarations placed after `#include <common>` (attributes, varyings, uniforms)
//   after: { chunkName: code } inserted right after `#include <chunkName>`
// Patch stages: vertex and fragment. `uniforms` maps names to {value} objects (use GLOBALS ones).
//
// three.js caches compiled programs by `customProgramCacheKey()`, which by default is the text of
// onBeforeCompile — identical for every material patched here. The key must include the patch code,
// or two different patches would silently share one shader.
export function patchMaterial(mat, { uniforms = {}, vertex = {}, fragment = {} }) {
  const inject = (src, { head = '', after = {} }) => {
    src = src.replace('#include <common>', `#include <common>\n${head}`);
    for (const [chunk, code] of Object.entries(after)) {
      const tag = `#include <${chunk}>`;
      if (!src.includes(tag)) throw new Error(`patchMaterial: no ${tag} in ${mat.type}`);
      src = src.replace(tag, `${tag}\n${code}`);
    }
    return src;
  };
  const prev = mat.onBeforeCompile;
  const prevKey = mat.customProgramCacheKey.bind(mat);
  const key = JSON.stringify([vertex, fragment]);
  mat.onBeforeCompile = (shader, renderer) => {
    prev.call(mat, shader, renderer);
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = inject(shader.vertexShader, vertex);
    shader.fragmentShader = inject(shader.fragmentShader, fragment);
  };
  mat.customProgramCacheKey = () => prevKey() + key;
  return mat;
}

// Ground that whitens with GLOBALS.uSnow. The geometry carries a `snowWeight` vertex attribute
// (1 on flat, upward faces; 0 on cliffs and under water) saying where snow can settle.
export function snowCover(mat) {
  return patchMaterial(mat, {
    uniforms: { uSnow: GLOBALS.uSnow, uSnowColor: GLOBALS.uSnowColor },
    vertex: { head: 'attribute float snowWeight;\nvarying float vSnow;', after: { begin_vertex: 'vSnow = snowWeight;' } },
    fragment: {
      head: 'uniform float uSnow;\nuniform vec3 uSnowColor;\nvarying float vSnow;',
      after: { color_fragment: 'diffuseColor.rgb = mix(diffuseColor.rgb, uSnowColor, vSnow * uSnow);' },
    },
  });
}
