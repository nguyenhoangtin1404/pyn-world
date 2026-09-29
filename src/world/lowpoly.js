import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Helpers for building detailed low-poly props cheaply: each part gets its colour baked into a
// vertex attribute, and a list of parts is merged into ONE mesh with a shared material.

export const VERTEX_COLORED = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });

const col = new THREE.Color();

// Part description → geometry with a baked colour.
export function shape(geo, color, [x, y, z] = [0, 0, 0], { rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1 } = {}) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  if (g.attributes.uv) g.deleteAttribute('uv');
  if (!g.attributes.normal) g.computeVertexNormals();
  g.scale(sx, sy, sz);
  if (rx) g.rotateX(rx);
  if (ry) g.rotateY(ry);
  if (rz) g.rotateZ(rz);
  g.translate(x, y, z);
  col.set(color);
  const c = new Float32Array(g.attributes.position.count * 3);
  for (let i = 0; i < c.length; i += 3) {
    c[i] = col.r;
    c[i + 1] = col.g;
    c[i + 2] = col.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  return g;
}

export const box = (w, h, d, color, pos, opt) => shape(new THREE.BoxGeometry(w, h, d), color, pos, opt);
export const ball = (r, color, pos, opt, detail = 1) => shape(new THREE.IcosahedronGeometry(r, detail), color, pos, opt);
export const cyl = (rt, rb, h, color, pos, opt, seg = 8) => shape(new THREE.CylinderGeometry(rt, rb, h, seg), color, pos, opt);
export const cone = (r, h, color, pos, opt, seg = 8) => shape(new THREE.ConeGeometry(r, h, seg), color, pos, opt);
export const torus = (r, tube, color, pos, opt) => shape(new THREE.TorusGeometry(r, tube, 6, 14), color, pos, opt);

// A flat outline (in the XZ plane, +z forward) extruded upward from y0 to y1. With `hole`, the same
// outline shrunk by that factor is cut out — handy for open hulls.
export function slab(points, y0, y1, color, scale = 1, hole = 0) {
  const s = new THREE.Shape(points.map(([x, z]) => new THREE.Vector2(x * scale, -z * scale)));
  if (hole) s.holes.push(new THREE.Path(points.map(([x, z]) => new THREE.Vector2(x * hole, -z * hole))));
  const geo = new THREE.ExtrudeGeometry(s, { depth: y1 - y0, bevelEnabled: false });
  geo.rotateX(-Math.PI / 2); // shape y → -z, extrusion → +y
  geo.translate(0, y0, 0);
  return shape(geo, color);
}

export function segment(parts, mat = VERTEX_COLORED) {
  const m = new THREE.Mesh(mergeGeometries(parts.filter(Boolean)), mat);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}
