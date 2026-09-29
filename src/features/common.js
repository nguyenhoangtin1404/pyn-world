// @ts-check
import * as THREE from 'three';

// Small helpers shared by the features.

export function shadowed(obj) {
  obj.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  return obj;
}

// Station name board.
export function labelTexture(text) {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#fbf4e2';
  g.fillRect(0, 0, 512, 128);
  g.strokeStyle = '#5a3b2a';
  g.lineWidth = 10;
  g.strokeRect(5, 5, 502, 118);
  g.fillStyle = '#5a3b2a';
  g.font = '600 64px Fredoka, system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, 256, 68);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
