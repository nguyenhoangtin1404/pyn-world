import * as THREE from 'three';
import { SEED } from '../config.js';
import { lerp, smoothstep, mulberry32 } from '../utils.js';

// `hour` is where each button jumps the clock to.
export const TIME_PRESETS = [
  { id: 'morning', label: 'Sáng', icon: '🌅', hour: 7 },
  { id: 'day', label: 'Trưa', icon: '☀', hour: 12 },
  { id: 'evening', label: 'Chiều', icon: '🌇', hour: 18.3 },
  { id: 'night', label: 'Đêm', icon: '🌙', hour: 23 },
];

// The continuous day: the presets act as colour keyframes and are blended in between.
const KEYFRAMES = [
  [0, 'night'],
  [5, 'night'],
  [7, 'morning'],
  [9.5, 'day'],
  [16, 'day'],
  [18.3, 'evening'],
  [20.2, 'night'],
  [24, 'night'],
];

// Which preset button best describes this hour (for highlighting the HUD).
export function presetAtHour(h) {
  if (h >= 5.5 && h < 9) return 'morning';
  if (h >= 9 && h < 17) return 'day';
  if (h >= 17 && h < 20) return 'evening';
  return 'night';
}

// Colours and brightness only; where the light comes from follows the sun/moon orbit below.
// At night `sun`/`sunI` describe the moonlight.
const PRESETS = {
  morning: { skyTop: '#86bde8', skyBottom: '#f7d9bb', fog: '#ecdccb', sun: '#ffd9a8', sunI: 2.2, hemiSky: '#d3e5f5', hemiGround: '#8a7a5a', hemiI: 1.0, lights: 0, stars: 0 },
  day: { skyTop: '#5ea8e6', skyBottom: '#cfe6f4', fog: '#cfe3ee', sun: '#fff4e0', sunI: 2.8, hemiSky: '#d8ecff', hemiGround: '#7d8a5a', hemiI: 1.15, lights: 0, stars: 0 },
  evening: { skyTop: '#4a5a9a', skyBottom: '#f2a36b', fog: '#e0a47e', sun: '#ff9a5a', sunI: 2.0, hemiSky: '#f0b58f', hemiGround: '#5a4a5a', hemiI: 0.75, lights: 0.7, stars: 0.15 },
  night: { skyTop: '#0b1233', skyBottom: '#27345f', fog: '#1f2a4d', sun: '#a9bcff', sunI: 0.45, hemiSky: '#3a4a80', hemiGround: '#1a1a2a', hemiI: 0.45, lights: 1, stars: 1 },
};

const COLOR_KEYS = ['skyTop', 'skyBottom', 'fog', 'sun', 'hemiSky', 'hemiGround'];
const SCALAR_KEYS = ['sunI', 'hemiI', 'lights', 'stars'];

function toParams(p) {
  const o = { sunI: p.sunI, hemiI: p.hemiI, lights: p.lights, stars: p.stars };
  for (const k of COLOR_KEYS) o[k] = new THREE.Color(p[k]);
  return o;
}

// ---- Orbits. The sun rises in the east (+x) at SUNRISE, culminates towards +z and sets in the west
// at SUNSET; the night half of the circle is stretched to fill the rest of the 24 h.
const SUNRISE = 6.2;
const SUNSET = 19.0;
const TILT = 0.6; // how far the arc leans away from straight overhead (radians)

function sunAngle(h) {
  if (h >= SUNRISE && h <= SUNSET) return (Math.PI * (h - SUNRISE)) / (SUNSET - SUNRISE);
  const night = 24 - SUNSET + SUNRISE;
  return Math.PI + (Math.PI * (((h - SUNSET + 24) % 24) / night));
}

function dirFromAngle(a, out) {
  return out.set(Math.cos(a), Math.sin(a) * Math.cos(TILT), Math.sin(a) * Math.sin(TILT)).normalize();
}

const vertexShader = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    gl_Position.z = gl_Position.w; // pin to the far plane
  }
`;

const fragmentShader = /* glsl */ `
  uniform vec3 top;
  uniform vec3 bottom;
  uniform vec3 sunDir;
  uniform vec3 sunColor;
  uniform float glow;
  uniform vec3 moonDir;
  uniform vec3 moonColor;
  uniform float moonGlow;
  varying vec3 vDir;
  void main() {
    vec3 d = normalize(vDir);
    vec3 col = mix(bottom, top, smoothstep(-0.02, 0.55, d.y));
    float s = max(dot(d, normalize(sunDir)), 0.0);
    col += sunColor * (pow(s, 600.0) * 4.0 + pow(s, 12.0) * 0.25) * glow;
    // Moon: a crisp disc with a soft halo.
    float m = dot(d, normalize(moonDir));
    col += moonColor * (smoothstep(0.9990, 0.9994, m) * 1.4 + pow(max(m, 0.0), 90.0) * 0.18) * moonGlow;
    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

export class Sky {
  constructor(scene) {
    this.scene = scene;
    this.presetId = 'day';
    this.cur = toParams(PRESETS.day);
    this.tgt = toParams(PRESETS.day);
    this.params = Object.fromEntries(Object.entries(PRESETS).map(([k, p]) => [k, toParams(p)]));
    this.lights = 0;
    this.grey = new THREE.Color();
    // The shown hour glides towards the clock, so jumping the time swings the sun smoothly.
    this.hour = 12;
    this.hourTarget = 12;
    this.sunDir = new THREE.Vector3();
    this.moonDir = new THREE.Vector3();
    this.lightDir = new THREE.Vector3();
    this.moonLit = 0; // 0..1, how much the directional light is moonlight right now

    this.hemi = new THREE.HemisphereLight('#ffffff', '#888888', 1);
    scene.add(this.hemi);

    // One directional light: the sun by day, the moon by night (it swaps while it is dark).
    const sun = (this.sun = new THREE.DirectionalLight('#ffffff', 2.5));
    sun.castShadow = true;
    const sc = sun.shadow.camera;
    sc.left = -170;
    sc.right = 170;
    sc.top = 170;
    sc.bottom = -170;
    sc.near = 10;
    sc.far = 900;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.08;
    scene.add(sun, sun.target);

    this.uniforms = {
      top: { value: new THREE.Color() },
      bottom: { value: new THREE.Color() },
      sunDir: { value: new THREE.Vector3() },
      sunColor: { value: new THREE.Color() },
      glow: { value: 1 },
      moonDir: { value: new THREE.Vector3() },
      moonColor: { value: new THREE.Color('#e8ecff') },
      moonGlow: { value: 0 },
    };
    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(1000, 32, 16),
      new THREE.ShaderMaterial({ uniforms: this.uniforms, vertexShader, fragmentShader, side: THREE.BackSide, depthWrite: false, fog: false }),
    );
    dome.frustumCulled = false;
    dome.renderOrder = -1;

    // Stars sit on a tilted pivot that turns once a day, like the real night sky.
    const rng = mulberry32(SEED + 99);
    const starPos = [];
    for (let i = 0; i < 1600; i++) {
      const v = new THREE.Vector3(rng() * 2 - 1, rng() * 2 - 1, rng() * 2 - 1).normalize().multiplyScalar(950);
      starPos.push(v.x, v.y, v.z);
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.Float32BufferAttribute(starPos, 3));
    this.starMat = new THREE.PointsMaterial({ color: '#ffffff', size: 1.8, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false });
    this.stars = new THREE.Points(starGeo, this.starMat);
    this.stars.frustumCulled = false;
    const starPivot = new THREE.Group();
    starPivot.rotation.z = TILT;
    starPivot.add(this.stars);

    this.skyGroup = new THREE.Group();
    this.skyGroup.add(dome, starPivot);
    scene.add(this.skyGroup);

    scene.fog = new THREE.Fog('#cfe3ee', 170, 760);
    this.setHour(12, true);
    this.update(10, { position: new THREE.Vector3() }, new THREE.Vector3(), { rain: 0, snow: 0 });
  }

  // Blend the colour keyframes for hour h (0..24) into the target look.
  setHour(h, instant = false) {
    h = ((h % 24) + 24) % 24;
    this.hourTarget = h;
    let i = 0;
    while (i < KEYFRAMES.length - 2 && h >= KEYFRAMES[i + 1][0]) i++;
    const [h0, a] = KEYFRAMES[i];
    const [h1, b] = KEYFRAMES[i + 1];
    const t0 = (h - h0) / (h1 - h0);
    const t = t0 * t0 * (3 - 2 * t0);
    const pa = this.params[a], pb = this.params[b];
    const tg = this.tgt;
    for (const k of COLOR_KEYS) tg[k].copy(pa[k]).lerp(pb[k], t);
    for (const k of SCALAR_KEYS) tg[k] = lerp(pa[k], pb[k], t);
    this.presetId = presetAtHour(h);
    if (instant) {
      this.hour = h;
      for (const k of COLOR_KEYS) this.cur[k].copy(tg[k]);
      for (const k of SCALAR_KEYS) this.cur[k] = tg[k];
    }
  }

  update(dt, camera, focus, weather) {
    const k = 1 - Math.exp(-dt * 2.2);
    const c = this.cur, t = this.tgt;
    for (const key of COLOR_KEYS) c[key].lerp(t[key], k);
    for (const key of SCALAR_KEYS) c[key] = lerp(c[key], t[key], k);

    // Glide the shown hour along the shorter way round the clock.
    const dh = ((this.hourTarget - this.hour + 36) % 24) - 12;
    this.hour = (this.hour + dh * k + 24) % 24;
    dirFromAngle(sunAngle(this.hour), this.sunDir);
    dirFromAngle(sunAngle(this.hour) + Math.PI + 0.35, this.moonDir); // rises a little after sunset

    // The light is the sun until it is well below the horizon, then the moon. Each fades to zero
    // at the swap, so the light never jumps.
    const sy = this.sunDir.y;
    const sunUp = smoothstep(-0.06, 0.12, sy);
    const moonUp = smoothstep(-0.06, -0.22, sy) * smoothstep(-0.05, 0.15, this.moonDir.y);
    const onMoon = sy < -0.06;
    this.lightDir.copy(onMoon ? this.moonDir : this.sunDir);
    this.moonLit = onMoon ? 1 : 0;

    const oc = Math.max(weather.rain, weather.snow * 0.85);
    const lum = c.skyBottom.r * 0.3 + c.skyBottom.g * 0.59 + c.skyBottom.b * 0.11;
    this.grey.setRGB(lum * 0.9, lum * 0.92, lum * 0.97);

    const u = this.uniforms;
    u.top.value.copy(c.skyTop).lerp(this.grey, oc * 0.75);
    u.bottom.value.copy(c.skyBottom).lerp(this.grey, oc * 0.75);
    u.sunDir.value.copy(this.sunDir);
    u.sunColor.value.copy(c.sun);
    u.glow.value = (1 - oc) * smoothstep(-0.1, 0.04, sy);
    u.moonDir.value.copy(this.moonDir);
    u.moonGlow.value = (1 - oc) * smoothstep(0.05, -0.15, sy) * smoothstep(-0.08, 0.05, this.moonDir.y);

    const fog = this.scene.fog;
    fog.color.copy(c.fog).lerp(this.grey, oc * 0.7);
    fog.near = lerp(170, 30, oc);
    fog.far = lerp(760, 330, oc);

    this.sun.color.copy(c.sun);
    this.sun.intensity = c.sunI * (onMoon ? moonUp : sunUp) * (1 - 0.6 * oc);
    this.hemi.color.copy(c.hemiSky);
    this.hemi.groundColor.copy(c.hemiGround);
    this.hemi.intensity = c.hemiI * (1 - 0.15 * oc);
    this.starMat.opacity = c.stars * (1 - oc);
    this.stars.rotation.y = (this.hour / 24) * Math.PI * 2;

    // Keep the shadow frustum centred on what the camera is looking at (snapped to reduce shimmer).
    const fx = Math.round(focus.x / 4) * 4;
    const fz = Math.round(focus.z / 4) * 4;
    this.sun.target.position.set(fx, 0, fz);
    this.sun.position.set(fx + this.lightDir.x * 400, Math.max(this.lightDir.y, 0.05) * 400, fz + this.lightDir.z * 400);
    this.skyGroup.position.copy(camera.position);
    this.lights = c.lights;
  }
}
