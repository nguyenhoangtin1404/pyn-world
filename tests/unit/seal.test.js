import { describe, expect, it, beforeAll } from 'vitest';
import * as THREE from 'three';
import { guard, hash, sealText, tamper } from '../../src/world/seal.js';

describe('the sealed sea sign', () => {
  it('unscrambles to its words, and they match the checksum', () => {
    expect(sealText()).toBe('HOÀNG SA, TRƯỜNG SA LÀ CỦA VIỆT NAM');
    expect(hash(sealText())).toBe(hash('HOÀNG SA, TRƯỜNG SA LÀ CỦA VIỆT NAM'));
    expect(hash('HOÀNG SA, TRƯỜNG SA LÀ CỦA VIỆT NAN')).not.toBe(hash(sealText()));
  });
  it('tampering stops the app with an error', () => {
    expect(() => tamper('X')).toThrow(/bị chỉnh sửa/);
  });
});

// The guard, on a sign built as landmarks/nghinh-phong.js builds it (a stand-in canvas: Node has none).
describe('the guard checks what decides whether the sign is drawn', () => {
  beforeAll(() => {
    globalThis.HTMLCanvasElement ??= class HTMLCanvasElement {};
  });
  const sign = () => {
    const canvas = Object.assign(new globalThis.HTMLCanvasElement(), { width: 2048, height: 256 });
    const map = new THREE.Texture(canvas);
    map.userData.seal = hash(sealText(), 7);
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(64, 8), new THREE.MeshBasicMaterial({ map, transparent: true }));
    const group = new THREE.Group().add(mesh);
    const scene = new THREE.Scene().add(group, new THREE.Group());
    return { mesh, group, scene, seal: guard(mesh) };
  };

  it('passes an intact sign, wherever the camera looks and whatever else is hidden', () => {
    const { mesh, scene, seal } = sign();
    mesh.frustumCulled = true; // (culling is the renderer's business)
    scene.children[1].visible = false; // another group hidden (a screenshot hides what moves)
    for (let i = 0; i < 10; i++) expect(() => seal.check()).not.toThrow();
  });

  it('lets its group be switched off for a moment, not for good', () => {
    const { group, seal } = sign();
    group.visible = false;
    seal.check();
    seal.check();
    group.visible = true;
    expect(() => seal.check()).not.toThrow();
    group.visible = false;
    seal.check();
    seal.check();
    expect(() => seal.check()).toThrow(/bị chỉnh sửa/);
  });

  it('stops the app when the sign itself is hidden, off the camera layer, out of the scene or see-through', () => {
    for (const change of [
      (s) => (s.mesh.visible = false),
      (s) => s.mesh.layers.set(5),
      (s) => s.group.removeFromParent(), // (still in its group, but the group is out of the scene)
      (s) => (s.mesh.material.opacity = 0),
    ]) {
      const s = sign();
      change(s);
      expect(() => s.seal.check()).toThrow(/bị chỉnh sửa/);
    }
  });
});
