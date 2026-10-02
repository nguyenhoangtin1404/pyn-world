import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Helpers for building detailed low-poly props cheaply: each part gets its colour baked into a
// vertex attribute, and a list of parts is merged into ONE mesh with a shared material.

// Materials and geometries cached at module level are shared by every world that is built, so
// World.dispose() must leave them alone: everything cached here goes through keep().
const sharedResources = new WeakSet();
export const keep = (resource) => (sharedResources.add(resource), resource);
export const isShared = (resource) => sharedResources.has(resource);

export const VERTEX_COLORED = keep(new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
// Unlit, for small lights that must show at night (plane navigation lights, traffic signals).
export const UNLIT = keep(new THREE.MeshBasicMaterial({ vertexColors: true }));

// Flat-shaded Lambert material, shared by everyone asking for the same look (flyweight). Never
// mutate a material from here — anything that animates (emissive at night, fading…) needs its own
// `new THREE.MeshLambertMaterial`.
const matCache = new Map();
export function lam(color, extra = {}) {
  const key = `${new THREE.Color(color).getHexString()}|${JSON.stringify(extra)}`;
  let m = matCache.get(key);
  if (!m) matCache.set(key, (m = keep(new THREE.MeshLambertMaterial({ color, flatShading: true, ...extra }))));
  return m;
}

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

// Triangular prism (a gable roof): w wide, h tall, d deep, base at y = 0.
export function prism(w, h, d, color, pos, opt) {
  const s = new THREE.Shape([new THREE.Vector2(-w / 2, 0), new THREE.Vector2(w / 2, 0), new THREE.Vector2(0, h)]);
  const geo = new THREE.ExtrudeGeometry(s, { depth: d, bevelEnabled: false }).translate(0, 0, -d / 2);
  return shape(geo, color, pos, opt);
}

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

// Skinned and instanced meshes compile a different shader program than plain ones. three.js sorts
// draws by material, not by program, so sharing one material between the kinds makes the GPU
// switch programs back and forth; each kind gets its own copy of the material instead.
// Weak: a world's own materials (and their variants) go away with the world.
const variants = new WeakMap();
function variant(mat, kind) {
  let kinds = variants.get(mat);
  if (!kinds) variants.set(mat, (kinds = {}));
  if (!kinds[kind]) {
    const v = mat.clone();
    v.onBeforeCompile = mat.onBeforeCompile; // clone() drops shader patches
    kinds[kind] = isShared(mat) ? keep(v) : v;
  }
  return kinds[kind];
}

// Turns a jointed figure — a tree of Bones, each holding rigid segment meshes made with `mat` — into
// ONE SkinnedMesh. Every vertex follows its own bone fully, so posing still works by rotating the
// bones, but the whole figure costs a single draw call. `owner` must contain the bone tree and be
// unposed (bones at rest) when this is called; meshes with other materials stay attached as-is.
// `key`: figures that are built identically (every sheep, every fish) share one skinned geometry.
const skinnedGeos = new Map();
export function skinFigure(owner, rootBone, mat, key = null) {
  owner.updateMatrixWorld(true);
  const toOwner = new THREE.Matrix4().copy(owner.matrixWorld).invert();
  const m4 = new THREE.Matrix4();
  const shared = key != null ? skinnedGeos.get(key) : null;
  const bones = [];
  const geos = [];
  rootBone.traverse((b) => {
    if (!b.isBone) return;
    const index = bones.push(b) - 1;
    for (const m of b.children.filter((c) => c.isMesh && c.material === mat)) {
      b.remove(m);
      if (shared) continue;
      const g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
      g.deleteAttribute('uv'); // flat-coloured: uvs unused, and every part must have the same attributes
      g.applyMatrix4(m4.multiplyMatrices(toOwner, m.matrixWorld));
      const n = g.attributes.position.count;
      const si = new Uint16Array(n * 4);
      const sw = new Float32Array(n * 4);
      for (let i = 0; i < n; i++) {
        si[i * 4] = index;
        sw[i * 4] = 1;
      }
      g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
      g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
      geos.push(g);
    }
  });
  const geo = shared || mergeGeometries(geos);
  if (key != null) skinnedGeos.set(key, keep(geo));
  const mesh = new THREE.SkinnedMesh(geo, variant(mat, 'skinned'));
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  owner.add(mesh);
  mesh.bind(new THREE.Skeleton(bones));
  return mesh;
}

// Draws every copy of one rigid part (all sheep heads, all fish tails…) with ONE InstancedMesh.
// Each copy follows an "anchor": an empty Object3D inside the entity's own hierarchy, so entity
// classes keep animating plain transforms while the drawing is shared. An anchor that is hidden
// (itself or a parent `.visible = false`) is drawn at scale 0. Optional per-copy colour.
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
const tint = new THREE.Color();
export class Instancer {
  constructor(geo, mat, capacity, { castShadow = true, receiveShadow = true } = {}) {
    this.anchors = [];
    this.frame = -1;
    const m = (this.mesh = new THREE.InstancedMesh(geo, variant(mat, 'instanced'), capacity));
    m.count = 0;
    m.frustumCulled = false; // copies are spread over the whole valley
    m.castShadow = castShadow;
    m.receiveShadow = receiveShadow;
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    // Copy the anchors' world matrices once per frame, after the scene updated them (the shadow
    // pass runs first, hence both hooks).
    m.onBeforeShadow = (renderer) => this.sync(renderer.info.render.frame);
    m.onBeforeRender = (renderer) => this.sync(renderer.info.render.frame);
  }

  add(anchor, color) {
    const i = this.anchors.push(anchor) - 1;
    this.mesh.count = this.anchors.length;
    if (color) this.mesh.setColorAt(i, tint.set(color));
    return i;
  }

  sync(frame) {
    if (frame === this.frame) return;
    this.frame = frame;
    this.anchors.forEach((a, i) => {
      let shown = true;
      for (let o = a; o && shown; o = o.parent) shown = o.visible;
      this.mesh.setMatrixAt(i, shown ? a.matrixWorld : ZERO);
    });
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

// Collects static parts from many objects (a whole village, a station…) and bakes them into one
// mesh per material. Parts come from the helpers above; `at(matrix)` places a group of parts, so an
// object can be built in its own local frame.
/**
 * A (non-indexed) geometry cut into one geometry per square cell of `size` units (by where each
 * triangle's centre is): the pieces can be culled one by one, by the camera and by the sun's shadow
 * frustum, where one mesh for the whole world is always drawn whole. Every attribute is carried over.
 * @param {THREE.BufferGeometry} geo @param {number} size
 * @returns {THREE.BufferGeometry[]}
 */
export function splitByCells(geo, size) {
  const src = geo.index ? geo.toNonIndexed() : geo;
  const pos = src.attributes.position;
  /** @type {Map<number, number[]>} */
  const cells = new Map();
  for (let t = 0; t < pos.count; t += 3) {
    const cx = (pos.getX(t) + pos.getX(t + 1) + pos.getX(t + 2)) / 3, cz = (pos.getZ(t) + pos.getZ(t + 1) + pos.getZ(t + 2)) / 3;
    const key = Math.floor(cx / size) * 100003 + Math.floor(cz / size);
    const list = cells.get(key);
    if (list) list.push(t);
    else cells.set(key, [t]);
  }
  if (cells.size <= 1) return [src];
  return [...cells.values()].map((tris) => {
    const out = new THREE.BufferGeometry();
    for (const [name, attr] of Object.entries(src.attributes)) {
      const { itemSize, array } = /** @type {THREE.BufferAttribute} */ (attr);
      const copy = new /** @type {any} */ (array.constructor)(tris.length * 3 * itemSize);
      tris.forEach((t, i) => copy.set(array.subarray(t * itemSize, (t + 3) * itemSize), i * 3 * itemSize));
      out.setAttribute(name, new THREE.BufferAttribute(copy, itemSize, attr.normalized));
    }
    return out;
  });
}

export class StaticBatch {
  constructor() {
    this.byMat = new Map();
    this.matrix = new THREE.Matrix4();
  }

  // Local frame for the parts added next: position, rotation about y, uniform scale.
  at(x = 0, y = 0, z = 0, ry = 0, s = 1) {
    this.matrix.compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), ry), new THREE.Vector3(s, s, s));
    return this;
  }

  add(parts, mat = VERTEX_COLORED) {
    let list = this.byMat.get(mat);
    if (!list) this.byMat.set(mat, (list = []));
    for (const p of [parts].flat()) if (p) list.push(p.applyMatrix4(this.matrix));
    return this;
  }

  /** `chunk`: cut each material's mesh into cells of this many units (see splitByCells), so what is off screen isn't drawn. */
  build({ castShadow = true, receiveShadow = true, chunk = 0 } = {}) {
    const g = new THREE.Group();
    for (const [mat, parts] of this.byMat) {
      if (!parts.length) continue;
      const merged = mergeGeometries(parts);
      for (const geo of chunk > 0 ? splitByCells(merged, chunk) : [merged]) {
        const m = new THREE.Mesh(geo, mat);
        m.castShadow = castShadow;
        m.receiveShadow = receiveShadow;
        g.add(m);
      }
    }
    this.byMat.clear();
    return g;
  }
}
