import * as THREE from 'three';
import { lerp, smoothstep } from '../utils.js';

// `hour` is where each button jumps the clock to.
export const TIME_PRESETS = [
  { id: 'morning', label: 'Sáng', icon: '🌅', hour: 7 },
  { id: 'day', label: 'Trưa', icon: '☀', hour: 12 },
  { id: 'evening', label: 'Chiều', icon: '🌇', hour: 18.3 },
  { id: 'night', label: 'Đêm', icon: '🌙', hour: 23 },
];

// The continuous day: the presets act as keyframes and are blended in between.
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

/** The hour of the day in Vietnam (UTC+7, no daylight saving) at `date`, as a fraction: 9:30 → 9.5. The app's clock
 * runs on it by default (main.js, clock 'real'), whatever the viewer's own time zone. @param {Date} date */
export function vietnamHour(date) {
  return (((date.getTime() / 3_600_000 + 7) % 24) + 24) % 24;
}

// Which preset button best describes this hour (for highlighting the HUD).
export function presetAtHour(h) {
  if (h >= 5.5 && h < 9) return 'morning';
  if (h >= 9 && h < 17) return 'day';
  if (h >= 17 && h < 20) return 'evening';
  return 'night';
}

const PRESETS = {
  morning: { skyTop: '#86bde8', skyBottom: '#f7d9bb', fog: '#ecdccb', sun: '#ffd9a8', sunI: 2.2, sunDir: [-0.8, 0.35, 0.4], hemiSky: '#d3e5f5', hemiGround: '#8a7a5a', hemiI: 1.0, lights: 0, stars: 0 },
  day: { skyTop: '#5ea8e6', skyBottom: '#cfe6f4', fog: '#cfe3ee', sun: '#fff4e0', sunI: 2.8, sunDir: [0.4, 0.9, 0.3], hemiSky: '#d8ecff', hemiGround: '#7d8a5a', hemiI: 1.15, lights: 0, stars: 0 },
  evening: { skyTop: '#4a5a9a', skyBottom: '#f2a36b', fog: '#e0a47e', sun: '#ff9a5a', sunI: 2.0, sunDir: [0.9, 0.18, -0.3], hemiSky: '#f0b58f', hemiGround: '#5a4a5a', hemiI: 0.75, lights: 0.7, stars: 0.15 },
  night: { skyTop: '#0b1233', skyBottom: '#27345f', fog: '#1f2a4d', sun: '#a9bcff', sunI: 0.45, sunDir: [-0.3, 0.8, -0.5], hemiSky: '#3a4a80', hemiGround: '#1a1a2a', hemiI: 0.45, lights: 1, stars: 1 },
};

const COLOR_KEYS = ['skyTop', 'skyBottom', 'fog', 'sun', 'hemiSky', 'hemiGround'];

function toParams(p) {
  const o = { sunI: p.sunI, hemiI: p.hemiI, lights: p.lights, stars: p.stars, sunDir: new THREE.Vector3(...p.sunDir).normalize() };
  for (const k of COLOR_KEYS) o[k] = new THREE.Color(p[k]);
  return o;
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
  varying vec3 vDir;
  void main() {
    vec3 d = normalize(vDir);
    vec3 col = mix(bottom, top, smoothstep(-0.02, 0.55, d.y));
    float s = max(dot(d, normalize(sunDir)), 0.0);
    col += sunColor * (pow(s, 600.0) * 4.0 + pow(s, 12.0) * 0.25) * glow;
    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

/**
 * Where the sun is at `hour` (local solar time) on day `day` of the year, at latitude `lat`
 * (degrees): a unit vector in world axes (x east, y up, z south).
 * @param {number} hour @param {number} lat @param {number} [day]
 */
export function sunDirection(hour, lat, day = 80) {
  const RAD = Math.PI / 180;
  const decl = 23.44 * RAD * Math.sin(((2 * Math.PI) / 365) * (day - 81));
  const H = (hour - 12) * 15 * RAD, phi = lat * RAD;
  const east = -Math.cos(decl) * Math.sin(H);
  const north = Math.cos(phi) * Math.sin(decl) - Math.sin(phi) * Math.cos(decl) * Math.cos(H);
  const up = Math.sin(phi) * Math.sin(decl) + Math.cos(phi) * Math.cos(decl) * Math.cos(H);
  return new THREE.Vector3(east, up, -north).normalize();
}

export class Sky {
  // `latitude` (degrees, worlds from map data): the sun crosses the sky as it does there (on day
  // `day` of the year); without it, the sun follows the time-of-day presets.
  constructor(scene, { latitude = null, day = 80 } = {}) {
    this.scene = scene;
    this.hour = 12;
    this.latitude = latitude;
    this.day = day;
    this.presetId = 'day';
    this.cur = toParams(PRESETS.day);
    this.tgt = toParams(PRESETS.day);
    this.params = Object.fromEntries(Object.entries(PRESETS).map(([k, p]) => [k, toParams(p)]));
    this.lights = 0;
    this.grey = new THREE.Color();

    this.hemi = new THREE.HemisphereLight('#ffffff', '#888888', 1);
    scene.add(this.hemi);

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
    };
    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(1000, 32, 16),
      new THREE.ShaderMaterial({ uniforms: this.uniforms, vertexShader, fragmentShader, side: THREE.BackSide, depthWrite: false, fog: false }),
    );
    dome.frustumCulled = false;
    dome.renderOrder = -1;

    const starPos = [];
    for (let i = 0; i < 1600; i++) {
      const v = new THREE.Vector3(Math.random() * 2 - 1, Math.random() * 0.95 + 0.05, Math.random() * 2 - 1).normalize().multiplyScalar(950);
      starPos.push(v.x, v.y, v.z);
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.Float32BufferAttribute(starPos, 3));
    this.starMat = new THREE.PointsMaterial({ color: '#ffffff', size: 1.8, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false });
    const stars = new THREE.Points(starGeo, this.starMat);
    stars.frustumCulled = false;

    this.skyGroup = new THREE.Group();
    this.skyGroup.add(dome, stars);
    scene.add(this.skyGroup);

    scene.fog = new THREE.Fog('#cfe3ee', 170, 760);
    this.update(10, { position: new THREE.Vector3() }, new THREE.Vector3(), { rain: 0, snow: 0 });
  }

  setPreset(id, instant = false) {
    this.presetId = id;
    this.tgt = toParams(PRESETS[id]);
    if (instant) this.cur = toParams(PRESETS[id]);
  }

  // Blend the keyframes for hour h (0..24) into the target look.
  setHour(h, instant = false) {
    h = ((h % 24) + 24) % 24;
    this.hour = h; // (who's out: world/night.js)
    let i = 0;
    while (i < KEYFRAMES.length - 2 && h >= KEYFRAMES[i + 1][0]) i++;
    const [h0, a] = KEYFRAMES[i];
    const [h1, b] = KEYFRAMES[i + 1];
    const t0 = (h - h0) / (h1 - h0);
    const t = t0 * t0 * (3 - 2 * t0);
    const pa = this.params[a], pb = this.params[b];
    const tg = this.tgt;
    for (const k of COLOR_KEYS) tg[k].copy(pa[k]).lerp(pb[k], t);
    tg.sunI = lerp(pa.sunI, pb.sunI, t);
    tg.hemiI = lerp(pa.hemiI, pb.hemiI, t);
    tg.lights = lerp(pa.lights, pb.lights, t);
    tg.stars = lerp(pa.stars, pb.stars, t);
    tg.sunDir.copy(pa.sunDir).lerp(pb.sunDir, t).normalize();
    if (this.latitude !== null) {
      // The real sun while it is up; the presets' moonlight once it has set.
      const real = sunDirection(h, this.latitude, this.day);
      tg.sunDir.lerp(real, smoothstep(-0.03, 0.12, real.y)).normalize();
    }
    this.presetId = presetAtHour(h);
    if (instant) {
      for (const k of COLOR_KEYS) this.cur[k].copy(tg[k]);
      Object.assign(this.cur, { sunI: tg.sunI, hemiI: tg.hemiI, lights: tg.lights, stars: tg.stars });
      this.cur.sunDir.copy(tg.sunDir);
    }
  }

  update(dt, camera, focus, weather) {
    const k = 1 - Math.exp(-dt * 2.2);
    const c = this.cur, t = this.tgt;
    for (const key of COLOR_KEYS) c[key].lerp(t[key], k);
    c.sunI = lerp(c.sunI, t.sunI, k);
    c.hemiI = lerp(c.hemiI, t.hemiI, k);
    c.lights = lerp(c.lights, t.lights, k);
    c.stars = lerp(c.stars, t.stars, k);
    c.sunDir.lerp(t.sunDir, k).normalize();

    const oc = Math.max(weather.rain, weather.snow * 0.85);
    const lum = c.skyBottom.r * 0.3 + c.skyBottom.g * 0.59 + c.skyBottom.b * 0.11;
    this.grey.setRGB(lum * 0.9, lum * 0.92, lum * 0.97);

    const u = this.uniforms;
    u.top.value.copy(c.skyTop).lerp(this.grey, oc * 0.75);
    u.bottom.value.copy(c.skyBottom).lerp(this.grey, oc * 0.75);
    u.sunDir.value.copy(c.sunDir);
    u.sunColor.value.copy(c.sun);
    u.glow.value = 1 - oc;

    const fog = this.scene.fog;
    fog.color.copy(c.fog).lerp(this.grey, oc * 0.7);
    fog.near = lerp(170, 30, oc);
    fog.far = lerp(760, 330, oc);

    this.sun.color.copy(c.sun);
    this.sun.intensity = c.sunI * (1 - 0.6 * oc);
    this.hemi.color.copy(c.hemiSky);
    this.hemi.groundColor.copy(c.hemiGround);
    this.hemi.intensity = c.hemiI * (1 - 0.15 * oc);
    this.starMat.opacity = c.stars * (1 - oc);

    // Keep the shadow frustum centred on what the camera is looking at (snapped to reduce shimmer),
    // and only as big as the view needs: close up, a smaller area gives sharper shadows and fewer
    // objects to draw in the shadow pass. Resized in steps so it doesn't change every frame.
    // In the passenger and driver seats the focus is the camera itself, but the view goes far out of
    // the windows: keep a wide area there.
    const dist = camera.position.distanceTo(focus);
    const half = dist < 0.5 ? 140 : Math.min(170, Math.max(50, Math.ceil((dist * 1.1) / 20) * 20));
    const sc = this.sun.shadow.camera;
    if (sc.right !== half) {
      sc.left = sc.bottom = -half;
      sc.right = sc.top = half;
      sc.updateProjectionMatrix();
    }
    const snap = Math.max(1, Math.round(half / 40));
    const fx = Math.round(focus.x / snap) * snap;
    const fz = Math.round(focus.z / snap) * snap;
    this.sun.target.position.set(fx, 0, fz);
    this.sun.position.set(fx + c.sunDir.x * 400, c.sunDir.y * 400, fz + c.sunDir.z * 400);
    this.skyGroup.position.copy(camera.position);
    this.lights = c.lights;
  }
}
