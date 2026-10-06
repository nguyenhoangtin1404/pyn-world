import * as THREE from 'three';
import { clamp, mulberry32 } from '../utils.js';

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

    // Rain and snow fall in their vertex shaders: each drop keeps its start position and the
    // shader moves it by `uTime` (wrapping inside the box), so the CPU writes nothing per drop.
    this.uTime = { value: 0 };
    const fall = (mat, body) => {
      mat.onBeforeCompile = (sh) => {
        sh.uniforms.uTime = this.uTime;
        sh.vertexShader = sh.vertexShader
          .replace('#include <common>', '#include <common>\nuniform float uTime;\nattribute float aK;')
          .replace('#include <begin_vertex>', `#include <begin_vertex>\n${body}`);
      };
      return mat;
    };
    const wrapY = (speed) => `transformed.y = mod(transformed.y + ${(HEIGHT / 2).toFixed(1)} - uTime * ${speed.toFixed(1)}, ${HEIGHT.toFixed(1)}) - ${(HEIGHT / 2).toFixed(1)};`;

    // Where each drop and flake starts: the same every load (a fixed seed, not the world's streams).
    const random = mulberry32(0x5eed);

    // Rain: short streaks. Both ends of a streak share the start point; aK = 0 bottom, 1 top.
    const RN = 6000;
    const rpos = new Float32Array(RN * 6);
    const rk = new Float32Array(RN * 2);
    for (let i = 0; i < RN; i++) {
      const x = (random() - 0.5) * BOX, y = (random() - 0.5) * HEIGHT, z = (random() - 0.5) * BOX;
      rpos.set([x, y, z, x, y, z], i * 6);
      rk[i * 2 + 1] = 1;
    }
    const rgeo = new THREE.BufferGeometry();
    rgeo.setAttribute('position', new THREE.BufferAttribute(rpos, 3));
    rgeo.setAttribute('aK', new THREE.BufferAttribute(rk, 1));
    const rainMat = fall(new THREE.LineBasicMaterial({ color: '#b9cde0', transparent: true, opacity: 0 }), `${wrapY(55)}\ntransformed += vec3(-0.15, 1.4, 0.0) * aK;`);
    this.rainMesh = new THREE.LineSegments(rgeo, rainMat);
    this.rainMesh.frustumCulled = false;
    this.rainMesh.visible = false;
    scene.add(this.rainMesh);

    // Snow: slow, swaying flakes (aK = the flake's own phase).
    const SN = 5000;
    const spos = new Float32Array(SN * 3);
    const sk = new Float32Array(SN);
    for (let i = 0; i < SN; i++) {
      spos[i * 3] = (random() - 0.5) * BOX;
      spos[i * 3 + 1] = (random() - 0.5) * HEIGHT;
      spos[i * 3 + 2] = (random() - 0.5) * BOX;
      sk[i] = random() * Math.PI * 2;
    }
    const sgeo = new THREE.BufferGeometry();
    sgeo.setAttribute('position', new THREE.BufferAttribute(spos, 3));
    sgeo.setAttribute('aK', new THREE.BufferAttribute(sk, 1));
    this.snowMesh = new THREE.Points(
      sgeo,
      fall(
        new THREE.PointsMaterial({ color: '#ffffff', map: dotTexture(), size: 0.7, transparent: true, opacity: 0, depthWrite: false }),
        `${wrapY(3.5)}\ntransformed.x -= cos(uTime * 0.9 + aK) * 0.67;\ntransformed.z += sin(uTime * 0.7 + aK) * 0.57;`,
      ),
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

    this.uTime.value = this.time;
    // The precipitation box follows the camera; the drops move in the shader.
    this.rainMesh.visible = this.rain > 0.01;
    if (this.rainMesh.visible) {
      this.rainMesh.position.copy(camera.position);
      this.rainMesh.material.opacity = 0.55 * this.rain;
    }
    this.snowMesh.visible = this.snow > 0.01;
    if (this.snowMesh.visible) {
      this.snowMesh.position.copy(camera.position);
      this.snowMesh.material.opacity = 0.95 * this.snow;
    }
  }
}
