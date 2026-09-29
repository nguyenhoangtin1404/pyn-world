import * as THREE from 'three';
import { ImprovedNoise } from 'three/addons/math/ImprovedNoise.js';
import { WORLD_SIZE, TERRAIN_SEGMENTS, TRACK_Y, WATER_Y, RIVER_BED, BASE_Y } from '../config.js';
import { clamp, lerp, smoothstep, hash2 } from '../utils.js';

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
const SNOW = new THREE.Color('#f2f5fa');

// Snow cover drawn by the GPU: each vertex has a `snowWeight` (how flat it is) and the material
// blends its vertex colour towards white by snowWeight × uSnow. Changing the cover is then just a
// uniform — rewriting and re-uploading the colour buffer cost ~3 ms per step.
function patchSnow(shader) {
  shader.uniforms.uSnow = this.userData.snow;
  shader.uniforms.uSnowColor = { value: SNOW };
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\nattribute float snowWeight;\nuniform float uSnow;\nuniform vec3 uSnowColor;')
    .replace('#include <color_vertex>', '#include <color_vertex>\nvColor.rgb = mix(vColor.rgb, uSnowColor, snowWeight * uSnow);');
}
export function snowCovered(geo, weights, params) {
  geo.setAttribute('snowWeight', new THREE.BufferAttribute(weights, 1));
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, ...params });
  mat.userData.snow = { value: 0 };
  mat.onBeforeCompile = patchSnow; // same function for terrain and tunnel hill → one shader program
  return mat;
}

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

// Flat plateaus for the village (inward from the station) and the town (inward from the halt),
// level with the railway. `a` runs inward (away from the track), `b` along the track.
export function villageZone(station, { A0 = 30, A1 = 95, HALF_B = 66 } = {}) {
  const sg = Math.sign(station.side.dot(station.p)) || 1;
  const inward = station.side.clone().multiplyScalar(-sg).setY(0).normalize();
  const along = station.t.clone().setY(0).normalize();
  const local = (x, z) => {
    const dx = x - station.p.x, dz = z - station.p.z;
    return { a: dx * inward.x + dz * inward.z, b: dx * along.x + dz * along.z };
  };
  return {
    inward,
    along,
    A0,
    A1,
    HALF_B,
    local,
    // Distance outside the plateau's rectangle (≤ 0 inside).
    outside(x, z) {
      const { a, b } = local(x, z);
      return Math.max(A0 - a, a - A1, Math.abs(b) - HALF_B);
    },
  };
}

export function createTerrain(track, station, halt) {
  const village = villageZone(station);
  const town = villageZone(halt, { A0: 2, A1: 64, HALF_B: 34 });
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
    // Village plateau: dead flat inside, blending back into the hills over ~18 units.
    const plateau = (1 - smoothstep(0, 18, Math.min(village.outside(x, z), town.outside(x, z)))) * (1 - river);
    h = lerp(h, TRACK_Y - 0.4, plateau);
    // Station yard
    const pad = (1 - smoothstep(16, 34, Math.hypot(x - station.p.x, z - station.p.z))) * (1 - river);
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
  const groundMat = snowCovered(geo, snowWeight);
  const mesh = new THREE.Mesh(geo, groundMat);
  mesh.receiveShadow = true;

  // Water: one faceted sheet with small animated waves.
  const wgeo = new THREE.PlaneGeometry(WORLD_SIZE, WORLD_SIZE, 100, 100);
  wgeo.rotateX(-Math.PI / 2);
  const water = new THREE.Mesh(
    wgeo,
    new THREE.MeshPhongMaterial({
      color: '#4fa3cf',
      specular: '#d8f1ff',
      shininess: 70,
      transparent: true,
      opacity: 0.74,
      flatShading: true,
    }),
  );
  water.position.y = WATER_Y;
  water.receiveShadow = true;
  const wp = wgeo.attributes.position;

  const frame = new THREE.Group();
  frame.add(buildSkirt(heightAt), buildPlinth());

  return {
    mesh,
    water,
    frame,
    heightAt,
    village,
    town,
    setSnow(amount) {
      groundMat.userData.snow.value = amount;
    },
    update(time) {
      for (let i = 0; i < wp.count; i++) {
        const x = wp.getX(i), z = wp.getZ(i);
        wp.setY(i, Math.sin(x * 0.09 + time * 1.2) * 0.12 + Math.cos(z * 0.07 + time * 0.9) * 0.12);
      }
      wp.needsUpdate = true;
    },
  };
}
