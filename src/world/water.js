import * as THREE from 'three';
import { WATER_Y } from '../config.js';
import { shape } from './lowpoly.js';

// The water sheet and what floats on the river. Everything moves in the vertex/fragment shaders
// from one `uTime` uniform: the CPU only sets that number each frame (moving ~10k vertices on the
// CPU and re-uploading them used to cost ~0.27 ms a frame).

// The world's riverX() (cfg.riverGLSL, same curve as cfg.riverX), and the same small waves
// everywhere on the water.
const glsl = (riverGLSL) => /* glsl */ `
  uniform float uTime;
  ${riverGLSL}
  float waves(vec2 p, float inRiver) {
    return sin(p.x * 0.09 + uTime * 1.2) * 0.12 + cos(p.y * 0.07 + uTime * 0.9) * 0.12
      + inRiver * sin(p.y * 0.35 - uTime * 2.4) * 0.07; // ripples running downstream
  }
  float inRiver(vec2 p) { return 1.0 - smoothstep(6.0, 14.0, abs(p.x - riverX(p.y))); }
`;
/**
 * How far the water sheet is lifted above WATER_Y at (x, z) at time t, away from any river: the same
 * small waves the shader makes (waves() above, inRiver 0) — for what floats on the sea to ride them.
 * @param {number} x @param {number} z @param {number} t
 */
export function waveHeight(x, z, t) {
  return Math.sin(x * 0.09 + t * 1.2) * 0.12 + Math.cos(z * 0.07 + t * 0.9) * 0.12;
}

// Value noise for the foam (fragment shader only).
const NOISE = /* glsl */ `
  float hash21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float vnoise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), f.x), mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), f.x), f.y);
  }
`;
const FLOW = 1.6; // river current, units per second towards +z

export function createWater({ size, riverGLSL }) {
  const GLSL = glsl(riverGLSL);
  const uTime = { value: 0 };
  const group = new THREE.Group();

  // ---- The sheet: small waves everywhere, plus a current in the river: pale streaks of foam
  // drifting downstream.
  const geo = new THREE.PlaneGeometry(size, size, 100, 100).rotateX(-Math.PI / 2);
  const mat = new THREE.MeshPhongMaterial({ color: '#4fa3cf', specular: '#d8f1ff', shininess: 70, transparent: true, opacity: 0.74, flatShading: true });
  mat.onBeforeCompile = (s) => {
    s.uniforms.uTime = uTime;
    s.vertexShader = s.vertexShader
      .replace('#include <common>', `#include <common>\n${GLSL}\nvarying vec2 vWater;`)
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWater = position.xz;\ntransformed.y += waves(position.xz, inRiver(position.xz));');
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', `#include <common>\n${GLSL}\n${NOISE}\nvarying vec2 vWater;`)
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        {
          float r = inRiver(vWater);
          // Irregular streaks of foam, long along the current and thin across it, carried downstream.
          vec2 q = vec2((vWater.x - riverX(vWater.y)) * 0.6, (vWater.y - uTime * ${FLOW.toFixed(2)}) * 0.07);
          float n = vnoise(q) * 0.65 + vnoise(q * vec2(2.7, 2.1) + 7.3) * 0.35;
          float foam = smoothstep(0.64, 0.8, n) * r;
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.9, 0.96, 1.0), foam * 0.55);
          diffuseColor.a = mix(diffuseColor.a, 0.9, foam * 0.5);
        }`,
      );
  };
  const sheet = new THREE.Mesh(geo, mat);
  sheet.position.y = WATER_Y;
  sheet.receiveShadow = true;
  group.add(sheet);

  // ---- Leaves floating down the river, bobbing and turning slowly. One InstancedMesh; each
  // leaf's place comes from its seed and the time, so nothing is updated per leaf on the CPU.
  const N = 60;
  const leafGeo = shape(new THREE.CircleGeometry(0.32, 5).rotateX(-Math.PI / 2).scale(0.7, 1, 1.3), '#ffffff');
  const seeds = new Float32Array(N * 3);
  const colors = ['#d9a441', '#c8683a', '#8fb34a', '#e0c35a', '#a8573a'];
  const leafMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide });
  leafMat.onBeforeCompile = (s) => {
    s.uniforms.uTime = uTime;
    s.vertexShader = s.vertexShader
      .replace('#include <common>', `#include <common>\n${GLSL}\nattribute vec3 aSeed;`)
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        {
          float span = ${size.toFixed(1)};
          float z = mod(aSeed.x * span + uTime * ${FLOW.toFixed(2)} * (0.8 + aSeed.y * 0.4), span) - span * 0.5;
          float x = riverX(z) + (aSeed.z - 0.5) * 9.0 + sin(uTime * 0.3 + aSeed.x * 40.0) * 1.2;
          float a = uTime * (aSeed.y - 0.5) * 0.8 + aSeed.z * 6.28;
          transformed.xz = mat2(cos(a), -sin(a), sin(a), cos(a)) * transformed.xz;
          transformed += vec3(x, ${(WATER_Y + 0.06).toFixed(2)} + waves(vec2(x, z), 1.0), z);
        }`,
      );
  };
  const leaves = new THREE.InstancedMesh(leafGeo, leafMat, N);
  const c = new THREE.Color();
  for (let i = 0; i < N; i++) {
    seeds.set([Math.random(), Math.random(), Math.random()], i * 3);
    leaves.setColorAt(i, c.set(colors[i % colors.length]));
  }
  leafGeo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 3));
  leaves.frustumCulled = false; // placed in the shader, spread along the whole river
  group.add(leaves);

  return {
    group,
    update(time) {
      uTime.value = time;
    },
  };
}
