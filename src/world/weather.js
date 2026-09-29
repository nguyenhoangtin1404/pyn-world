import * as THREE from 'three';
import { clamp } from '../utils.js';

const BOX = 160; // horizontal size of the precipitation volume around the camera
const HEIGHT = 80;

function dotTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.5, 'rgba(255,255,255,0.8)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 32, 32);
  return new THREE.CanvasTexture(c);
}

export const WEATHER_OPTIONS = [
  { id: 'clear', label: '☀ Nắng' },
  { id: 'rain', label: '☂ Mưa' },
  { id: 'snow', label: '❄ Tuyết' },
];

export class Weather {
  constructor(scene) {
    this.kind = 'clear';
    this.rain = 0;
    this.snow = 0;
    this.snowCover = 0;
    this.time = 0;

    const RN = 6000;
    this.rainRel = new Float32Array(RN * 3);
    for (let i = 0; i < RN; i++) {
      this.rainRel[i * 3] = (Math.random() - 0.5) * BOX;
      this.rainRel[i * 3 + 1] = (Math.random() - 0.5) * HEIGHT;
      this.rainRel[i * 3 + 2] = (Math.random() - 0.5) * BOX;
    }
    const rgeo = new THREE.BufferGeometry();
    rgeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(RN * 6), 3));
    this.rainMesh = new THREE.LineSegments(rgeo, new THREE.LineBasicMaterial({ color: '#b9cde0', transparent: true, opacity: 0 }));
    this.rainMesh.frustumCulled = false;
    this.rainMesh.visible = false;
    scene.add(this.rainMesh);

    const SN = 5000;
    const spos = new Float32Array(SN * 3);
    this.snowPhase = new Float32Array(SN);
    for (let i = 0; i < SN; i++) {
      spos[i * 3] = (Math.random() - 0.5) * BOX;
      spos[i * 3 + 1] = (Math.random() - 0.5) * HEIGHT;
      spos[i * 3 + 2] = (Math.random() - 0.5) * BOX;
      this.snowPhase[i] = Math.random() * Math.PI * 2;
    }
    const sgeo = new THREE.BufferGeometry();
    sgeo.setAttribute('position', new THREE.BufferAttribute(spos, 3));
    this.snowMesh = new THREE.Points(
      sgeo,
      new THREE.PointsMaterial({ color: '#ffffff', map: dotTexture(), size: 0.7, transparent: true, opacity: 0, depthWrite: false }),
    );
    this.snowMesh.frustumCulled = false;
    this.snowMesh.visible = false;
    scene.add(this.snowMesh);
  }

  set(kind) {
    this.kind = kind;
  }

  get overcast() {
    return Math.max(this.rain, this.snow * 0.85);
  }

  update(dt, rawDt, camera) {
    this.time += dt;
    const k = 1 - Math.exp(-rawDt * 0.9);
    this.rain += ((this.kind === 'rain' ? 1 : 0) - this.rain) * k;
    this.snow += ((this.kind === 'snow' ? 1 : 0) - this.snow) * k;
    this.snowCover = clamp(this.snowCover + (this.kind === 'snow' ? dt * 0.04 : -dt * 0.07), 0, 1);

    // Rain: short streaks falling fast, box follows the camera.
    this.rainMesh.visible = this.rain > 0.01;
    if (this.rainMesh.visible) {
      this.rainMesh.position.copy(camera.position);
      this.rainMesh.material.opacity = 0.55 * this.rain;
      const rel = this.rainRel;
      const arr = this.rainMesh.geometry.attributes.position.array;
      for (let i = 0; i < rel.length / 3; i++) {
        let y = rel[i * 3 + 1] - 55 * dt;
        if (y < -HEIGHT / 2) y += HEIGHT;
        rel[i * 3 + 1] = y;
        const x = rel[i * 3], z = rel[i * 3 + 2];
        arr[i * 6] = x;
        arr[i * 6 + 1] = y;
        arr[i * 6 + 2] = z;
        arr[i * 6 + 3] = x - 0.15;
        arr[i * 6 + 4] = y + 1.4;
        arr[i * 6 + 5] = z;
      }
      this.rainMesh.geometry.attributes.position.needsUpdate = true;
    }

    // Snow: slow, swaying flakes.
    this.snowMesh.visible = this.snow > 0.01;
    if (this.snowMesh.visible) {
      this.snowMesh.position.copy(camera.position);
      this.snowMesh.material.opacity = 0.95 * this.snow;
      const arr = this.snowMesh.geometry.attributes.position.array;
      for (let i = 0; i < this.snowPhase.length; i++) {
        const ph = this.snowPhase[i];
        let y = arr[i * 3 + 1] - 3.5 * dt;
        if (y < -HEIGHT / 2) y += HEIGHT;
        arr[i * 3 + 1] = y;
        arr[i * 3] += Math.sin(this.time * 0.9 + ph) * 0.6 * dt;
        arr[i * 3 + 2] += Math.cos(this.time * 0.7 + ph) * 0.4 * dt;
      }
      this.snowMesh.geometry.attributes.position.needsUpdate = true;
    }
  }
}
