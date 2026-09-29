import * as THREE from 'three';

// Uniforms shared by every patched material. Updated once per frame in main.js; because patched
// shaders link these objects (not copies), one write reaches them all.
export const GLOBALS = {
  uTime: { value: 0 }, // simulation seconds (stops while paused)
  uWind: { value: 1 }, // wind strength, ~1 calm … ~2.5 storm
  uWindDir: { value: new THREE.Vector2(1, 0.25).normalize() }, // blows towards +x, like the clouds
  uHour: { value: 12 }, // clock, 0..24
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
  const key = JSON.stringify([vertex, fragment]);
  // A material shared by several meshes may be handed in more than once: patch it only once, or
  // the GLSL would be declared twice and the shader would fail to compile (the mesh vanishes).
  const applied = (mat.userData.patches ||= new Set());
  if (applied.has(key)) return mat;
  applied.add(key);
  const prev = mat.onBeforeCompile;
  const prevKey = mat.customProgramCacheKey.bind(mat);
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

// Instanced foliage bends in the wind: the higher above the trunk, the further it leans (quadratic),
// with gusts that roll across the valley in the wind direction and a quicker flutter per tree.
// The offset is computed in world space and turned back into the instance's local space, so it is
// the same whatever the tree's random rotation/scale.
const SWAY = /* glsl */ `
#ifdef USE_INSTANCING
  mat4 swayM = modelMatrix * instanceMatrix;
  vec3 swayO = swayM[3].xyz;
  float swayH = max(position.y - 1.4, 0.0);
  float gust = sin(uTime * 1.1 - dot(swayO.xz, uWindDir) * 0.05) * 0.5 + 0.5;
  float flutter = sin(uTime * 3.7 + swayO.x * 0.3 + swayO.z * 0.2) * 0.25;
  vec3 swayOff = vec3(uWindDir.x, 0.0, uWindDir.y) * swayH * swayH * 0.012 * uWind * (0.35 + gust + flutter);
  transformed += inverse(mat3(swayM)) * swayOff;
#endif`;

function windSway(mat) {
  return patchMaterial(mat, {
    uniforms: { uTime: GLOBALS.uTime, uWind: GLOBALS.uWind, uWindDir: GLOBALS.uWindDir },
    vertex: { head: 'uniform float uTime;\nuniform float uWind;\nuniform vec2 uWindDir;', after: { begin_vertex: SWAY } },
  });
}

// Makes an InstancedMesh of trees sway — its shadow too (a matching depth material).
let swayDepth = null;
export function swaying(mesh) {
  windSway(mesh.material);
  mesh.customDepthMaterial = swayDepth ||= windSway(new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking }));
  return mesh;
}
