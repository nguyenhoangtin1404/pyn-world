import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { Instancer } from '../../src/world/lowpoly.js';

describe('Instancer', () => {
  it('writes what setMatrixAt would, and only sends the buffer again when something moved or hid', () => {
    const scene = new THREE.Scene();
    const inst = new Instancer(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial(), 4);
    const anchors = [0, 1, 2].map((i) => {
      const g = new THREE.Group(), a = new THREE.Object3D();
      g.position.set(i * 1.1, 0.3, -i / 3);
      g.rotation.y = i * 0.7;
      a.position.set(0.1, 0.2, 0.3);
      g.add(a);
      scene.add(g);
      inst.add(a);
      return a;
    });
    const want = new THREE.InstancedMesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial(), 4);
    const check = () => {
      anchors.forEach((a, i) => {
        let shown = true;
        for (let o = a; o && shown; o = o.parent) shown = o.visible;
        want.setMatrixAt(i, shown ? a.matrixWorld : new THREE.Matrix4().makeScale(0, 0, 0));
      });
      expect([...inst.mesh.instanceMatrix.array]).toEqual([...want.instanceMatrix.array]);
    };
    let frame = 0;
    scene.updateMatrixWorld();
    const v0 = inst.mesh.instanceMatrix.version;
    inst.sync(++frame);
    check();
    const v1 = inst.mesh.instanceMatrix.version;
    expect(v1).toBeGreaterThan(v0);
    // Nothing changed: no upload.
    scene.updateMatrixWorld();
    inst.sync(++frame);
    expect(inst.mesh.instanceMatrix.version).toBe(v1);
    // One moves: upload, the same numbers as setMatrixAt.
    anchors[1].parent.position.x += 0.123456789;
    scene.updateMatrixWorld();
    inst.sync(++frame);
    check();
    const v2 = inst.mesh.instanceMatrix.version;
    expect(v2).toBeGreaterThan(v1);
    // One hidden (by its parent): drawn at scale 0; shown again: back where it is.
    anchors[2].parent.visible = false;
    inst.sync(++frame);
    check();
    expect(inst.mesh.instanceMatrix.version).toBeGreaterThan(v2);
    anchors[2].parent.visible = true;
    inst.sync(++frame);
    check();
    // Synced once a frame (shadow pass and colour pass).
    const v3 = inst.mesh.instanceMatrix.version;
    anchors[0].parent.position.z += 1;
    scene.updateMatrixWorld();
    inst.sync(frame);
    expect(inst.mesh.instanceMatrix.version).toBe(v3);
  });
});
