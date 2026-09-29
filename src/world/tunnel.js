import * as THREE from 'three';
import { TRACK_Y, WATER_Y } from '../config.js';
import { smoothstep, lerp, hash2, mulberry32 } from '../utils.js';
import { fbm } from './terrain.js';
import { sweep } from './track.js';

// A hill the railway runs straight through. It is its own mesh laid over the track (a heightfield
// can't overhang), with stone portals at both ends and a dark lined bore inside.
//
// Everything is built in track space: rows follow the track frames, columns are offsets to the side.

const TUNNEL_AT = 0.5; // fraction of the loop (the station is at 0)
const LENGTH = 64; // track units under the hill
const HALF_WIDTH = 30; // hill footprint either side of the track
const BORE = 3.3; // bore radius; the arch top is TRACK_Y + 3.6 + BORE
const SPRING = 3.6; // height of the arch's straight walls above TRACK_Y

const COL = {
  grassA: new THREE.Color('#8cbf55'),
  grassB: new THREE.Color('#6fae4f'),
  rock: new THREE.Color('#9d9384'),
};
const SNOW = new THREE.Color('#f2f5fa');

function archPath(r, y0, path = new THREE.Path()) {
  path.moveTo(-r, y0);
  path.lineTo(-r, TRACK_Y + SPRING);
  path.absarc(0, TRACK_Y + SPRING, r, Math.PI, 0, true);
  path.lineTo(r, y0);
  path.lineTo(-r, y0);
  return path;
}

export function createTunnel(track, heightAt) {
  const frames = track.frames;
  const M = frames.length;
  const iMid = Math.round(M * TUNNEL_AT);
  const half = Math.round(((LENGTH / 2) * M) / track.length);
  const i0 = iMid - half;
  const i1 = iMid + half;
  const W = HALF_WIDTH;
  const sA = frames[i0].s;
  const sB = frames[i1].s;
  const group = new THREE.Group();

  // Hill surface height at frame k, lateral offset lat.
  function hillHeight(k, lat) {
    const f = frames[k];
    const t = (k - i0) / (i1 - i0);
    const x = f.p.x + f.side.x * lat, z = f.p.z + f.side.z * lat;
    let crest = TRACK_Y + 9 + 20 * Math.pow(Math.sin(Math.PI * t), 0.7) + fbm(x, z, 3, 0.05, 5.5) * 6;
    crest = Math.max(crest, TRACK_Y + SPRING + BORE + 2.2); // always well above the bore
    const w = 1 - smoothstep(W * 0.3, W, Math.abs(lat));
    return lerp(heightAt(x, z) - 0.6, crest, w);
  }

  // ---- Hill mesh: rows = frames i0..i1, columns = lateral -W..W
  const STEP = 2;
  const cols = [];
  for (let lat = -W; lat <= W + 1e-6; lat += STEP) cols.push(lat);
  const grid = [];
  for (let k = i0; k <= i1; k++) {
    const f = frames[k];
    grid.push(cols.map((lat) => new THREE.Vector3(f.p.x + f.side.x * lat, hillHeight(k, lat), f.p.z + f.side.z * lat)));
  }
  const pos = [];
  for (let r = 0; r < grid.length - 1; r++) {
    for (let c = 0; c < cols.length - 1; c++) {
      const a = grid[r][c], b = grid[r][c + 1], d = grid[r + 1][c], e = grid[r + 1][c + 1];
      pos.push(...a.toArray(), ...d.toArray(), ...e.toArray(), ...a.toArray(), ...e.toArray(), ...b.toArray());
    }
  }
  const hillGeo = new THREE.BufferGeometry();
  hillGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  hillGeo.computeVertexNormals();
  const n = hillGeo.attributes.normal;
  const count = pos.length / 3;
  const base = new Float32Array(count * 3);
  const snowWeight = new Float32Array(count);
  const c = new THREE.Color();
  for (let v = 0; v < count; v += 3) {
    const cx = (pos[v * 3] + pos[v * 3 + 3] + pos[v * 3 + 6]) / 3;
    const cz = (pos[v * 3 + 2] + pos[v * 3 + 5] + pos[v * 3 + 8]) / 3;
    const ny = Math.abs(n.getY(v));
    c.copy(COL.grassA).lerp(COL.grassB, Math.min(1, Math.max(0, fbm(cx, cz, 2, 0.02, 4.4) * 1.6 + 0.5)));
    if (ny < 0.62) c.lerp(COL.rock, smoothstep(0.62, 0.45, ny)); // only the steepest faces are bare rock
    c.multiplyScalar(0.95 + hash2(cx, cz) * 0.1);
    for (let q = 0; q < 3; q++) {
      base.set([c.r, c.g, c.b], (v + q) * 3);
      snowWeight[v + q] = smoothstep(0.55, 0.85, ny);
    }
  }
  const colorAttr = new THREE.BufferAttribute(base.slice(), 3);
  hillGeo.setAttribute('color', colorAttr);
  const hill = new THREE.Mesh(hillGeo, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide }));
  hill.castShadow = true;
  hill.receiveShadow = true;
  group.add(hill);

  // ---- Portals: a rock face shaped like the hill's cross-section, with an arched opening and a
  // ring of dressed stone around it.
  const rockMat = new THREE.MeshLambertMaterial({ color: '#8f8578', flatShading: true });
  const stoneMat = new THREE.MeshLambertMaterial({ color: '#cfc5b3', flatShading: true });
  const bottom = TRACK_Y - 4;
  for (const [k, dir] of [[i0, -1], [i1, 1]]) {
    const f = frames[k];
    // Local basis: X across the track, Y up, Z out of the hill. dir = -1 at the entry end.
    const X = f.side.clone().multiplyScalar(-dir);
    const Z = f.t.clone().multiplyScalar(dir);
    const latOf = (x) => -dir * x;

    const face = new THREE.Shape();
    face.moveTo(-W, bottom);
    for (let x = -W; x <= W + 1e-6; x += STEP) face.lineTo(x, Math.max(bottom + 0.5, hillHeight(k, latOf(x))));
    face.lineTo(W, bottom);
    face.lineTo(-W, bottom);
    face.holes.push(archPath(BORE, TRACK_Y - 0.5));
    const faceMesh = new THREE.Mesh(new THREE.ExtrudeGeometry(face, { depth: 1.2, bevelEnabled: false }), rockMat);

    const ring = archPath(BORE + 0.9, TRACK_Y - 0.7, new THREE.Shape());
    ring.holes.push(archPath(BORE, TRACK_Y - 0.5));
    const ringMesh = new THREE.Mesh(new THREE.ExtrudeGeometry(ring, { depth: 1.7, bevelEnabled: false }), stoneMat);
    const key = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.2, 1.9), stoneMat);
    key.position.set(0, TRACK_Y + SPRING + BORE + 0.35, 0.95);

    const portal = new THREE.Group();
    portal.add(faceMesh, ringMesh, key);
    portal.matrixAutoUpdate = false;
    portal.matrix.makeBasis(X, new THREE.Vector3(0, 1, 0), Z).setPosition(f.p.x, 0, f.p.z);
    portal.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });
    group.add(portal);
  }

  // ---- Bore lining (dark stone, visible from inside) with little lamps along the wall
  const profile = [];
  // The floor sits a little above the flattened ground (TRACK_Y - 0.4) so the grass can't show through.
  const FLOOR = -0.25;
  profile.push([-BORE, FLOOR], [-BORE, SPRING]);
  for (let a = 1; a < 12; a++) {
    const ang = Math.PI - (a / 12) * Math.PI;
    profile.push([Math.cos(ang) * BORE, SPRING + Math.sin(ang) * BORE]);
  }
  profile.push([BORE, SPRING], [BORE, FLOOR]);
  const lining = new THREE.Mesh(
    sweep(frames, i0, i1 - i0 + 1, profile, TRACK_Y),
    new THREE.MeshLambertMaterial({ color: '#5a524a', flatShading: true, side: THREE.DoubleSide }),
  );
  lining.receiveShadow = true;
  group.add(lining);
  const lampMat = new THREE.MeshLambertMaterial({ color: '#fff1c8', emissive: '#ffcf70', emissiveIntensity: 1.2 });
  for (let k = i0 + 6; k < i1 - 3; k += 10) {
    const f = frames[k];
    for (const s of [-1, 1]) {
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.35, 0.25), lampMat);
      lamp.position.set(f.p.x + f.side.x * s * (BORE - 0.2), TRACK_Y + 3.0, f.p.z + f.side.z * s * (BORE - 0.2));
      group.add(lamp);
    }
  }

  // ---- A few pines on the hill
  const rng = mulberry32(99);
  const pineGeo = new THREE.ConeGeometry(1.5, 4.2, 7).translate(0, 3.1, 0);
  const trunkGeo = new THREE.CylinderGeometry(0.2, 0.3, 1.2, 5).translate(0, 0.6, 0);
  const spots = [];
  for (let tries = 0; spots.length < 40 && tries < 400; tries++) {
    const k = i0 + 3 + Math.floor(rng() * (i1 - i0 - 6));
    const lat = (rng() < 0.5 ? -1 : 1) * (6 + rng() * (W - 10));
    const f = frames[k];
    const x = f.p.x + f.side.x * lat, z = f.p.z + f.side.z * lat;
    const h = hillHeight(k, lat);
    if (h < WATER_Y + 1) continue;
    spots.push({ x, z, h, s: 0.7 + rng() * 0.6, r: rng() * 6 });
  }
  const pines = new THREE.InstancedMesh(pineGeo, new THREE.MeshLambertMaterial({ color: '#4f8f45', flatShading: true }), spots.length);
  const trunks = new THREE.InstancedMesh(trunkGeo, new THREE.MeshLambertMaterial({ color: '#7a5236', flatShading: true }), spots.length);
  const dummy = new THREE.Object3D();
  spots.forEach((sp, i) => {
    dummy.position.set(sp.x, sp.h - 0.2, sp.z);
    dummy.rotation.set(0, sp.r, 0);
    dummy.scale.setScalar(sp.s);
    dummy.updateMatrix();
    pines.setMatrixAt(i, dummy.matrix);
    trunks.setMatrixAt(i, dummy.matrix);
  });
  pines.castShadow = trunks.castShadow = true;
  group.add(pines, trunks);

  // Nearest hill row for a world point, or null outside the footprint.
  function locate(x, z, margin = 0) {
    let best = -1, bd = Infinity;
    for (let k = i0; k <= i1; k++) {
      const d = (frames[k].p.x - x) ** 2 + (frames[k].p.z - z) ** 2;
      if (d < bd) {
        bd = d;
        best = k;
      }
    }
    const f = frames[best];
    const lat = (x - f.p.x) * f.side.x + (z - f.p.z) * f.side.z;
    const along = (x - f.p.x) * f.t.x + (z - f.p.z) * f.t.z;
    if (Math.abs(lat) > W + margin) return null;
    if ((best === i0 && along < -margin) || (best === i1 && along > margin)) return null;
    return { k: best, lat };
  }

  return {
    group,
    sA,
    sB,
    contains: (s) => s > sA && s < sB,
    // Ground height on the hill (for keeping cameras out of it), or -Infinity off the hill.
    surfaceAt(x, z) {
      const p = locate(x, z);
      return p ? hillHeight(p.k, Math.max(-W, Math.min(W, p.lat))) : -Infinity;
    },
    // Is (x, z) on the hill (plus a margin)? Scenery avoids these spots.
    footprint: (x, z, margin = 4) => locate(x, z, margin) !== null,
    portals: [frames[i0].p.clone(), frames[i1].p.clone()],
    setSnow(amount) {
      const arr = colorAttr.array;
      for (let i = 0; i < count; i++) {
        const w = snowWeight[i] * amount;
        arr[i * 3] = base[i * 3] + (SNOW.r - base[i * 3]) * w;
        arr[i * 3 + 1] = base[i * 3 + 1] + (SNOW.g - base[i * 3 + 1]) * w;
        arr[i * 3 + 2] = base[i * 3 + 2] + (SNOW.b - base[i * 3 + 2]) * w;
      }
      colorAttr.needsUpdate = true;
    },
  };
}
