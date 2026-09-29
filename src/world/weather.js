import * as THREE from 'three';
import { clamp } from '../utils.js';
import { patchMaterial } from '../render/shaders.js';

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

// Rain and snow are animated entirely in their vertex shaders: the buffers hold each particle's
// start position once, and falling/swaying is a function of uFall (the weather's own clock).
// The volume is centred on the camera.
export class Weather {
  constructor(scene) {
    this.kind = 'clear';
    this.rain = 0;
    this.snow = 0;
    this.snowCover = 0;
    this.uFall = { value: 0 };
    const H = HEIGHT.toFixed(1);

    // Rain: a short streak per drop (two vertices, aEnd 0 = bottom, 1 = top).
    const RN = 6000;
    const rpos = new Float32Array(RN * 6);
    const rend = new Float32Array(RN * 2);
    for (let i = 0; i < RN; i++) {
      const x = (Math.random() - 0.5) * BOX, y = Math.random() * HEIGHT, z = (Math.random() - 0.5) * BOX;
      rpos.set([x, y, z, x, y, z], i * 6);
      rend[i * 2 + 1] = 1;
    }
    const rgeo = new THREE.BufferGeometry();
    rgeo.setAttribute('position', new THREE.BufferAttribute(rpos, 3));
    rgeo.setAttribute('aEnd', new THREE.BufferAttribute(rend, 1));
    const rmat = patchMaterial(new THREE.LineBasicMaterial({ color: '#b9cde0', transparent: true, opacity: 0 }), {
      uniforms: { uFall: this.uFall },
      vertex: {
        head: 'uniform float uFall;\nattribute float aEnd;',
        after: { begin_vertex: `transformed.y = mod(position.y - uFall * 55.0, ${H}) - ${H} * 0.5 + aEnd * 1.4;\ntransformed.x -= aEnd * 0.15;` },
      },
    });
    this.rainMesh = new THREE.LineSegments(rgeo, rmat);
    this.rainMesh.frustumCulled = false;
    this.rainMesh.visible = false;
    scene.add(this.rainMesh);

    // Snow: slow flakes swaying on their own phase.
    const SN = 5000;
    const spos = new Float32Array(SN * 3);
    const sphase = new Float32Array(SN);
    for (let i = 0; i < SN; i++) {
      spos.set([(Math.random() - 0.5) * BOX, Math.random() * HEIGHT, (Math.random() - 0.5) * BOX], i * 3);
      sphase[i] = Math.random() * Math.PI * 2;
    }
    const sgeo = new THREE.BufferGeometry();
    sgeo.setAttribute('position', new THREE.BufferAttribute(spos, 3));
    sgeo.setAttribute('aPhase', new THREE.BufferAttribute(sphase, 1));
    const smat = patchMaterial(new THREE.PointsMaterial({ color: '#ffffff', map: dotTexture(), size: 0.7, transparent: true, opacity: 0, depthWrite: false }), {
      uniforms: { uFall: this.uFall },
      vertex: {
        head: 'uniform float uFall;\nattribute float aPhase;',
        after: {
          begin_vertex: `transformed.y = mod(position.y - uFall * 3.5, ${H}) - ${H} * 0.5;\ntransformed.x -= cos(uFall * 0.9 + aPhase) * 0.67;\ntransformed.z += sin(uFall * 0.7 + aPhase) * 0.57;`,
        },
      },
    });
    this.snowMesh = new THREE.Points(sgeo, smat);
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
    this.uFall.value += dt;
    const k = 1 - Math.exp(-rawDt * 0.9);
    this.rain += ((this.kind === 'rain' ? 1 : 0) - this.rain) * k;
    this.snow += ((this.kind === 'snow' ? 1 : 0) - this.snow) * k;
    this.snowCover = clamp(this.snowCover + (this.kind === 'snow' ? dt * 0.04 : -dt * 0.07), 0, 1);

    this.rainMesh.visible = this.rain > 0.01;
    this.rainMesh.position.copy(camera.position);
    this.rainMesh.material.opacity = 0.55 * this.rain;

    this.snowMesh.visible = this.snow > 0.01;
    this.snowMesh.position.copy(camera.position);
    this.snowMesh.material.opacity = 0.95 * this.snow;
  }
}
