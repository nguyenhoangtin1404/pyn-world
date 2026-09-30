import * as THREE from 'three';
import { ImprovedNoise } from 'three/addons/math/ImprovedNoise.js';
import { TRACK_Y, WATER_Y, RIVER_BED, BASE_Y } from '../config.js';
import { clamp, lerp, smoothstep, hash2 } from '../utils.js';
import { createWater } from './water.js';

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

// Ground colours by land cover (worlds from map data: cfg.landcover), laid over the grass.
const COVER = {
  beach: [new THREE.Color('#e6d4a0'), 1],
  coastal: [new THREE.Color('#b9c77a'), 0.55],
  field: [new THREE.Color('#a9d24e'), 0.7],
  town: [new THREE.Color('#c2c09a'), 0.35],
  forest: [new THREE.Color('#4f8a3c'), 0.55],
};
const PADDY = new THREE.Color('#c9d65a');

function pickColor(x, y, z, ny, out, cover = null) {
  if (y < WATER_Y - 0.3) return out.copy(COL.bed);
  if (y < WATER_Y + 0.7) return out.copy(COL.sand);
  const n = clamp(fbm(x, z, 2, 0.02, 4.4) * 1.6 + 0.5, 0, 1);
  out.copy(COL.grassA).lerp(COL.grassB, n);
  if (cover) {
    const kind = cover(x, z);
    const c = COVER[kind];
    if (c) out.lerp(c[0], c[1]);
    // Rice paddies: a patchwork of greens, field by field.
    if (kind === 'field' && (Math.floor(x / 9) + Math.floor(z / 6)) % 2) out.lerp(PADDY, 0.5);
  }
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
function buildSkirt(heightAt, size, n) {
  const half = size / 2;
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
    (t) => [-half + t * size, half],
    (t) => [half, half - t * size],
    (t) => [half - t * size, -half],
    (t) => [-half, -half + t * size],
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
function buildPlinth(size, name) {
  const g = new THREE.Group();
  const W = size;
  const wood = new THREE.MeshLambertMaterial({ color: '#5a3b2a' });
  const trim = new THREE.MeshLambertMaterial({ color: '#3f2a1f' });
  const body = new THREE.Mesh(new THREE.BoxGeometry(W + 4, 8, W + 4), wood);
  body.position.y = BASE_Y - 4 + 0.01;
  const lip = new THREE.Mesh(new THREE.BoxGeometry(W + 6, 1.2, W + 6), trim);
  lip.position.y = BASE_Y - 0.6 + 0.02;
  const foot = new THREE.Mesh(new THREE.BoxGeometry(W + 10, 2, W + 10), trim);
  foot.position.y = BASE_Y - 9;
  const plate = new THREE.Mesh(new THREE.PlaneGeometry(40, 10), new THREE.MeshLambertMaterial({ map: nameplateTexture(name) }));
  plate.position.set(0, BASE_Y - 4.5, W / 2 + 2.05);
  g.add(body, lip, foot, plate);
  g.traverse((o) => o.isMesh && (o.receiveShadow = true));
  return g;
}

// Flat plateau for the houses by a stop (a village, a town), inward from the track and level with
// the railway. `a` runs inward (away from the track), `b` along the track.
export function villageZone(station, { A0 = 30, A1 = 95, HALF_B = 66 } = {}) {
  const sg = Math.sign(station.side.dot(station.p)) || 1;
  const inward = station.side.clone().multiplyScalar(-sg).setY(0).normalize();
  const along = station.t.clone().setY(0).normalize();
  const local = (x, z) => {
    const dx = x - station.p.x, dz = z - station.p.z;
    return { a: dx * inward.x + dz * inward.z, b: dx * along.x + dz * along.z };
  };
  return {
    origin: station.p, // the stop: a = b = 0
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

// `stops`: the world's stops with their track frames (World.stops). Each stop with a `zone` gets a
// flat plateau for its houses (terrain.zones[stop id]); each with a `yard` a flat yard around it.
// `rivers`: world/rivers.js. The lie of the land is noise and a ring of mountains (cfg.terrain),
// or for a world from map data the real ground (cfg.heights, see world/geodata.js); either way the
// rivers, the railway corridor, the villages and the yards are shaped into it the same way.
export function createTerrain(cfg, track, stops, rivers) {
  const { size } = cfg;
  const { hills, rim: [rim0, rim1], mountains: [mBase, mNoise], offset: [ox, oz] } = cfg.terrain ?? { hills: 0, rim: [Infinity, Infinity], mountains: [0, 0], offset: [0, 0] };
  const ground = cfg.heights ?? null;
  const pads = cfg.pads ?? []; // flat ground under landmarks: { x, z, r, h }
  const cover = cfg.landcover ?? null;
  // One grid cell every ~3 units, whatever the size of the world.
  const segments = Math.round(size / 3);
  const zones = {};
  for (const st of stops) if (st.zone) zones[st.id] = villageZone(st.frame, st.zone);
  const plateaus = Object.values(zones);
  const yards = stops.filter((st) => st.yard).map((st) => st.frame.p);
  function heightAt(x, z) {
    let h;
    if (ground) h = ground(x, z);
    else {
      const r = Math.hypot(x, z);
      h = 2 + fbm(x + ox, z + oz) * hills;
      // Mountains around the rim of the valley
      if (r > rim0) h += smoothstep(rim0, rim1, r) * (mBase + fbm(x + ox, z + oz, 4, 0.012, 9.1) * mNoise); // (weight 0 further in)
    }
    // River channel
    const river = 1 - smoothstep(5, 16, rivers.distance(x, z));
    h = lerp(h, RIVER_BED, river);
    // Flatten a corridor for the railway (but let the river cut through → bridges)
    const flat = (1 - smoothstep(5, 22, track.distanceTo(x, z, 22))) * (1 - river);
    h = lerp(h, TRACK_Y - 0.4, flat);
    // Village plateaus: dead flat inside, blending back into the hills over ~18 units.
    let outside = Infinity;
    for (const zone of plateaus) outside = Math.min(outside, zone.outside(x, z));
    const plateau = (1 - smoothstep(0, 18, outside)) * (1 - river);
    h = lerp(h, TRACK_Y - 0.4, plateau);
    // Station yards
    for (const p of yards) {
      const pad = (1 - smoothstep(16, 34, Math.hypot(x - p.x, z - p.z))) * (1 - river);
      h = lerp(h, TRACK_Y - 0.4, pad);
    }
    // Landmarks stand on level ground: their pad at the height of its middle, blending out over 10.
    for (const p of pads) {
      const w = 1 - smoothstep(p.r, p.r + 10, Math.hypot(x - p.x, z - p.z));
      if (w > 0) h = lerp(h, p.h, w);
    }
    return h;
  }

  // The ground as drawn: heightAt() at the grid's corners, flat triangles in between (split along
  // the same diagonal as PlaneGeometry). Things laid ON the ground — a road — follow this, not
  // heightAt(), or the triangles poke through them wherever the ground isn't flat.
  const cell = size / segments;
  function meshHeightAt(x, z) {
    const gx = (x + size / 2) / cell, gz = (z + size / 2) / cell;
    const ix = Math.min(segments - 1, Math.max(0, Math.floor(gx))), iz = Math.min(segments - 1, Math.max(0, Math.floor(gz)));
    const u = gx - ix, v = gz - iz;
    const x0 = ix * cell - size / 2, z0 = iz * cell - size / 2;
    const h01 = heightAt(x0, z0 + cell), h10 = heightAt(x0 + cell, z0);
    if (u + v <= 1) {
      const h00 = heightAt(x0, z0);
      return h00 + u * (h10 - h00) + v * (h01 - h00);
    }
    const h11 = heightAt(x0 + cell, z0 + cell);
    return h11 + (1 - u) * (h01 - h11) + (1 - v) * (h10 - h11);
  }

  const grid = new THREE.PlaneGeometry(size, size, segments, segments);
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
    pickColor(cx, cy, cz, ny, c, cover);
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

  // Water: one faceted sheet, animated in its shader (see water.js).
  const water = createWater({ size, riverGLSL: rivers.glsl });

  const frame = new THREE.Group();
  frame.add(buildSkirt(heightAt, size, segments), buildPlinth(size, cfg.name));

  return {
    mesh,
    water: water.group,
    frame,
    heightAt,
    meshHeightAt,
    zones, // stop id → villageZone(), for the stops with houses
    setSnow(amount) {
      groundMat.userData.snow.value = amount;
    },
    update(time) {
      water.update(time);
    },
  };
}
