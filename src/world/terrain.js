import * as THREE from 'three';
import { ImprovedNoise } from 'three/addons/math/ImprovedNoise.js';
import { WORLD_SIZE, TERRAIN_SEGMENTS, TRACK_Y, WATER_Y, RIVER_BED, BASE_Y } from '../config.js';
import { clamp, lerp, smoothstep, hash2 } from '../utils.js';
import { GLOBALS, patchMaterial, snowCover } from '../render/shaders.js';

const perlin = new ImprovedNoise();

export function fbm(x, z, octaves = 4, freq = 0.006, seed = 1.7) {
  let sum = 0, amp = 1, norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += perlin.noise(x * freq, z * freq, seed + i * 17.3) * amp;
    norm += amp;
    amp *= 0.5;
    freq *= 2;
  }
  return sum / norm;
}

// The river winds north–south through the valley and crosses the loop twice.
export const riverX = (z) => -25 + 42 * Math.sin(z * 0.011 + 0.9) + 10 * Math.sin(z * 0.034 + 2.0);

const COL = {
  bed: new THREE.Color('#c7b58a'),
  sand: new THREE.Color('#e4d2a2'),
  grassA: new THREE.Color('#a3cf6a'),
  grassB: new THREE.Color('#6fae4f'),
  grassHigh: new THREE.Color('#86a35c'),
  rock: new THREE.Color('#a1978a'),
  snow: new THREE.Color('#f3f4f1'),
};

function pickColor(x, y, z, ny, out) {
  if (y < WATER_Y - 0.3) return out.copy(COL.bed);
  if (y < WATER_Y + 0.7) return out.copy(COL.sand);
  const n = clamp(fbm(x, z, 2, 0.02, 4.4) * 1.6 + 0.5, 0, 1);
  out.copy(COL.grassA).lerp(COL.grassB, n);
  out.lerp(COL.grassHigh, smoothstep(14, 34, y));
  if (ny < 0.78) out.lerp(COL.rock, smoothstep(0.78, 0.6, ny));
  if (y > 44) out.lerp(COL.snow, smoothstep(44, 56, y) * smoothstep(0.6, 0.8, ny));
  return out;
}

const SKIRT = {
  grass: new THREE.Color('#5f9a44'),
  water: new THREE.Color('#3f8fbd'),
  soil: new THREE.Color('#9a7550'),
  soilDark: new THREE.Color('#77563a'),
  rock: new THREE.Color('#8f8578'),
};

// Cut-away walls around the four edges (grass → soil strata → rock), like a model-railway diorama.
function buildSkirt(heightAt) {
  const half = WORLD_SIZE / 2;
  const n = TERRAIN_SEGMENTS;
  const pos = [];
  const col = [];
  const quad = (xa, za, ya0, ya1, xb, zb, yb0, yb1, c) => {
    pos.push(xa, ya0, za, xb, yb0, zb, xb, yb1, zb, xa, ya0, za, xb, yb1, zb, xa, ya1, za);
    for (let i = 0; i < 6; i++) col.push(c.r, c.g, c.b);
  };
  const column = (x, z) => {
    const h = heightAt(x, z);
    const wet = h < WATER_Y;
    const top = wet ? WATER_Y : h;
    const y1 = wet ? h : h - 0.8;
    return { wet, ys: [top, y1, lerp(y1, BASE_Y, 0.4), lerp(y1, BASE_Y, 0.75), BASE_Y] };
  };
  const edges = [
    (t) => [-half + t * WORLD_SIZE, half],
    (t) => [half, half - t * WORLD_SIZE],
    (t) => [half - t * WORLD_SIZE, -half],
    (t) => [-half, -half + t * WORLD_SIZE],
  ];
  for (const edge of edges) {
    let [xa, za] = edge(0);
    let a = column(xa, za);
    for (let i = 1; i <= n; i++) {
      const [xb, zb] = edge(i / n);
      const b = column(xb, zb);
      const bands = [a.wet || b.wet ? SKIRT.water : SKIRT.grass, SKIRT.soil, SKIRT.soilDark, SKIRT.rock];
      for (let k = 0; k < 4; k++) quad(xa, za, a.ys[k + 1], a.ys[k], xb, zb, b.ys[k + 1], b.ys[k], bands[k]);
      xa = xb;
      za = zb;
      a = b;
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide }));
  mesh.receiveShadow = true;
  return mesh;
}

function nameplateTexture(text) {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#c9a24a';
  g.fillRect(0, 0, 512, 128);
  g.strokeStyle = '#7a5a1e';
  g.lineWidth = 8;
  g.strokeRect(8, 8, 496, 112);
  g.fillStyle = '#3f2a1f';
  g.font = '600 60px Fredoka, system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, 256, 68);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Wooden plinth the diorama sits on, with a brass nameplate on the front.
function buildPlinth() {
  const g = new THREE.Group();
  const W = WORLD_SIZE;
  const wood = new THREE.MeshLambertMaterial({ color: '#5a3b2a' });
  const trim = new THREE.MeshLambertMaterial({ color: '#3f2a1f' });
  const body = new THREE.Mesh(new THREE.BoxGeometry(W + 4, 8, W + 4), wood);
  body.position.y = BASE_Y - 4 + 0.01;
  const lip = new THREE.Mesh(new THREE.BoxGeometry(W + 6, 1.2, W + 6), trim);
  lip.position.y = BASE_Y - 0.6 + 0.02;
  const foot = new THREE.Mesh(new THREE.BoxGeometry(W + 10, 2, W + 10), trim);
  foot.position.y = BASE_Y - 9;
  const plate = new THREE.Mesh(new THREE.PlaneGeometry(40, 10), new THREE.MeshLambertMaterial({ map: nameplateTexture('PYN WORLD') }));
  plate.position.set(0, BASE_Y - 4.5, W / 2 + 2.05);
  g.add(body, lip, foot, plate);
  g.traverse((o) => o.isMesh && (o.receiveShadow = true));
  return g;
}

export function createTerrain(track, station) {
  function heightAt(x, z) {
    const r = Math.hypot(x, z);
    let h = 2 + fbm(x, z) * 22;
    // Mountains around the rim of the valley
    h += smoothstep(165, 280, r) * (38 + fbm(x, z, 4, 0.012, 9.1) * 50);
    // River channel
    const river = 1 - smoothstep(5, 16, Math.abs(x - riverX(z)));
    h = lerp(h, RIVER_BED, river);
    // Flatten a corridor for the railway (but let the river cut through → bridges)
    const flat = (1 - smoothstep(5, 22, track.distanceTo(x, z))) * (1 - river);
    h = lerp(h, TRACK_Y - 0.4, flat);
    // Station yard
    const pad = (1 - smoothstep(16, 34, Math.hypot(x - station.x, z - station.z))) * (1 - river);
    return lerp(h, TRACK_Y - 0.4, pad);
  }

  const grid = new THREE.PlaneGeometry(WORLD_SIZE, WORLD_SIZE, TERRAIN_SEGMENTS, TERRAIN_SEGMENTS);
  grid.rotateX(-Math.PI / 2);
  const gp = grid.attributes.position;
  for (let i = 0; i < gp.count; i++) gp.setY(i, heightAt(gp.getX(i), gp.getZ(i)));

  // Non-indexed so every triangle gets its own flat colour (low-poly look).
  const geo = grid.toNonIndexed();
  geo.computeVertexNormals();
  const p = geo.attributes.position;
  const nrm = geo.attributes.normal;
  const count = p.count;
  const base = new Float32Array(count * 3);
  const snowWeight = new Float32Array(count);
  const c = new THREE.Color();
  for (let t = 0; t < count; t += 3) {
    const cx = (p.getX(t) + p.getX(t + 1) + p.getX(t + 2)) / 3;
    const cy = (p.getY(t) + p.getY(t + 1) + p.getY(t + 2)) / 3;
    const cz = (p.getZ(t) + p.getZ(t + 1) + p.getZ(t + 2)) / 3;
    const ny = nrm.getY(t);
    pickColor(cx, cy, cz, ny, c);
    c.multiplyScalar(0.95 + hash2(cx, cz) * 0.1);
    const sw = cy > WATER_Y + 0.3 ? smoothstep(0.55, 0.85, ny) : 0;
    for (let k = 0; k < 3; k++) {
      base[(t + k) * 3] = c.r;
      base[(t + k) * 3 + 1] = c.g;
      base[(t + k) * 3 + 2] = c.b;
      snowWeight[t + k] = sw;
    }
  }
  geo.setAttribute('color', new THREE.BufferAttribute(base, 3));
  geo.setAttribute('snowWeight', new THREE.BufferAttribute(snowWeight, 1));

  // Snow settles on the GPU (GLOBALS.uSnow), so the ground never has to be recoloured on the CPU.
  const mesh = new THREE.Mesh(geo, snowCover(new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true })));
  mesh.receiveShadow = true;

  const water = buildWater(heightAt);

  const frame = new THREE.Group();
  frame.add(buildSkirt(heightAt), buildPlinth());

  return {
    mesh,
    water,
    frame,
    heightAt,
    // White water around bridge piers and other things standing in the river: [[x, z], …].
    addFoam(points, radius = 4) {
      const pos = water.geometry.attributes.position;
      const foam = water.geometry.attributes.aWater;
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i), z = pos.getZ(i);
        for (const [px, pz] of points) {
          const f = 1 - smoothstep(radius * 0.4, radius, Math.hypot(x - px, z - pz));
          foam.setZ(i, Math.max(foam.getZ(i), f));
        }
      }
      foam.needsUpdate = true;
    },
  };
}

// Water: one faceted sheet. Everything that moves is done in its shader — the CPU never touches it.
// Per vertex (baked once): depth below the surface, how much it is river (vs lake), shore foam, and
// the river's downstream direction.
const WATER_SEGMENTS = 150;
function buildWater(heightAt) {
  const geo = new THREE.PlaneGeometry(WORLD_SIZE, WORLD_SIZE, WATER_SEGMENTS, WATER_SEGMENTS);
  geo.rotateX(-Math.PI / 2);
  const p = geo.attributes.position;
  const info = new Float32Array(p.count * 3); // depth, river, foam
  const flow = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i);
    const depth = WATER_Y - heightAt(x, z);
    info[i * 3] = depth;
    info[i * 3 + 1] = 1 - smoothstep(6, 16, Math.abs(x - riverX(z)));
    info[i * 3 + 2] = 1 - smoothstep(0.15, 1.3, depth);
    // Downstream is +z; the channel's heading follows riverX'(z).
    const dxdz = 42 * 0.011 * Math.cos(z * 0.011 + 0.9) + 10 * 0.034 * Math.cos(z * 0.034 + 2.0);
    const n = Math.hypot(dxdz, 1);
    flow[i * 2] = dxdz / n;
    flow[i * 2 + 1] = 1 / n;
  }
  geo.setAttribute('aWater', new THREE.BufferAttribute(info, 3));
  geo.setAttribute('aFlow', new THREE.BufferAttribute(flow, 2));

  const mat = new THREE.MeshPhongMaterial({ color: '#4fa3cf', specular: '#d8f1ff', shininess: 70, transparent: true, opacity: 0.74, flatShading: true });
  patchMaterial(mat, {
    uniforms: { uTime: GLOBALS.uTime, uShallow: { value: new THREE.Color('#8fd3dc') } },
    vertex: {
      head: 'uniform float uTime;\nattribute vec3 aWater;\nattribute vec2 aFlow;\nvarying vec3 vWater;\nvarying vec2 vFlowUV;',
      after: {
        begin_vertex: /* glsl */ `
          vec2 wp = (modelMatrix * vec4(transformed, 1.0)).xz;
          float along = dot(wp, aFlow);
          float across = dot(wp, vec2(-aFlow.y, aFlow.x));
          // Standing swell everywhere, plus waves running downstream on the river.
          transformed.y += sin(wp.x * 0.09 + uTime * 1.2) * 0.12 + cos(wp.y * 0.07 + uTime * 0.9) * 0.12;
          transformed.y += sin(along * 0.55 - uTime * 2.6) * 0.07 * aWater.y;
          vWater = aWater;
          vFlowUV = vec2(along, across);`,
      },
    },
    fragment: {
      head: 'uniform float uTime;\nuniform vec3 uShallow;\nvarying vec3 vWater;\nvarying vec2 vFlowUV;',
      after: {
        color_fragment: /* glsl */ `
          float shallow = 1.0 - smoothstep(0.3, 3.5, vWater.x);
          diffuseColor.rgb = mix(diffuseColor.rgb, uShallow, shallow * 0.55);
          // Foam: breathing bands at the shore and piers, and streaks drifting downstream.
          float shore = vWater.z * (0.7 + 0.3 * sin(uTime * 2.0 + vFlowUV.x * 0.4));
          // Streaks: short dashes scattered over a grid that slides downstream with the current.
          vec2 q = vec2(vFlowUV.x * 0.1 - uTime * 0.35, vFlowUV.y * 0.3);
          vec2 cell = floor(q), fq = fract(q);
          float pick = fract(sin(dot(cell, vec2(12.9898, 78.233))) * 43758.5453);
          float dash = smoothstep(0.14, 0.05, abs(fq.y - 0.5)) * smoothstep(0.1, 0.3, fq.x) * smoothstep(0.75, 0.5, fq.x);
          float streak = step(0.6, pick) * dash;
          float foam = clamp(shore + streak * vWater.y * 0.6, 0.0, 1.0);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.0), foam);
          diffuseColor.a = mix(diffuseColor.a, 0.95, foam);`,
      },
    },
  });
  const water = new THREE.Mesh(geo, mat);
  water.position.y = WATER_Y;
  water.receiveShadow = true;
  water.frustumCulled = false; // waves move it beyond its bounding box a little
  return water;
}
