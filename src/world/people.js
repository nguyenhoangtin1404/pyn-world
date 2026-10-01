import * as THREE from 'three';
import { box, ball, cyl, cone, segment, skinFigure, keep } from './lowpoly.js';

// Low-poly people with faces, hair, clothes and jointed limbs (hip → knee, shoulder → elbow).
// Every rigid body segment is merged into ONE vertex-coloured mesh, so a detailed person still costs
// only ~10 draw calls. The figure faces local +z; y = 0 is the soles of the feet.

const OUTDOOR = keep(new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
// Inside the train the car body shadows everything, so give people a warm fill glow.
const INDOOR = keep(new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, emissive: '#3a2e26' }));

const SKIN = ['#f5d0b0', '#e8b48f', '#c98f63', '#9a6440', '#6e4630'];
const HAIR = ['#2a1d17', '#4a3021', '#7a5236', '#c9a24a', '#a8452f', '#1f1b19'];
const GREY_HAIR = ['#b8b4ae', '#dcdad4'];
const SHIRTS = ['#c8453a', '#2f5d7c', '#e0a64a', '#6d8b3a', '#8e5aa8', '#f1e3c3', '#3f7d8c', '#d9774a', '#f4f1ea'];
const DRESSES = ['#c8453a', '#8e5aa8', '#e0a64a', '#3f7d8c', '#e58fa8', '#6d8b3a'];
const PANTS = ['#3a4a6b', '#4a3a2e', '#5a5a5a', '#2b3a4a', '#6b5a3a', '#8a7a5a'];
const SHOES = ['#2b2522', '#5a3b2a', '#3a302b', '#7a2a24'];
const UMBRELLAS = ['#c8453a', '#2f5d7c', '#f2c14e', '#6d8b3a', '#8e5aa8', '#e58fa8'];

const EYE = '#2a1d17';
const MOUTH = '#8a3b35';
const GOLD = '#d9a441';


/** Height of the model as built, before group.scale (hat and hair included). */
export const PERSON_HEIGHT = 2.2;

export class Person {
  /**
   * kind: 'villager' | 'hiker' | 'child' | 'passenger' | 'tourist' (a villager with a camera: photo())
   */
  constructor(rng, { kind = 'villager', indoor = false } = {}) {
    const pick = (a) => a[Math.floor(rng() * a.length)];
    const chance = (p) => rng() < p;
    const mat = indoor ? INDOOR : OUTDOOR;
    const hiker = kind === 'hiker';
    const child = kind === 'child';
    const elder = !hiker && !child && chance(0.2);

    const skin = pick(SKIN);
    const skinDark = new THREE.Color(skin).multiplyScalar(0.85).getStyle();
    const hair = elder ? pick(GREY_HAIR) : pick(HAIR);
    const dress = !hiker && chance(0.35);
    const top = dress ? pick(DRESSES) : hiker ? pick(['#e0603f', '#3f7d44', '#2f5d7c', '#f2b632']) : pick(SHIRTS);
    const topDark = new THREE.Color(top).multiplyScalar(0.8).getStyle();
    const pants = hiker ? pick(['#6b5a3a', '#4a3a2e', '#3a4a6b']) : pick(PANTS);
    const shoes = hiker ? '#5a3b2a' : pick(SHOES);
    const longSleeves = hiker || elder || chance(0.5);
    const shorts = !dress && !elder && (child || chance(0.15));

    this.group = new THREE.Group();
    this.root = new THREE.Bone(); // bobs while walking
    this.group.add(this.root);
    this.phase = rng() * 10;

    // ---- torso (pelvis → neck), incl. backpack / skirt
    const torso = [
      box(0.5, 0.1, 0.3, dress ? top : '#3a2a1f', [0, 0.97, 0]),
      !dress && box(0.08, 0.06, 0.02, GOLD, [0, 0.97, 0.155]),
      box(0.54, 0.6, 0.3, top, [0, 1.32, 0]),
      box(0.62, 0.14, 0.3, top, [0, 1.56, 0]),
      box(0.28, 0.05, 0.22, dress ? topDark : '#f4f1ea', [0, 1.645, 0.02]),
      cyl(0.075, 0.085, 0.12, skin, [0, 1.69, 0], {}, 6),
    ];
    if (!dress && !hiker) {
      torso.push(box(0.04, 0.04, 0.02, topDark, [0, 1.42, 0.155]), box(0.04, 0.04, 0.02, topDark, [0, 1.26, 0.155]));
    }
    if (dress) torso.push(cyl(0.27, 0.45, 0.55, top, [0, 0.78, 0], {}, 10), box(0.5, 0.04, 0.31, topDark, [0, 1.06, 0]));
    if (hiker) {
      const pack = pick(['#e0603f', '#f2b632', '#3f7d44', '#2f5d7c']);
      torso.push(
        box(0.48, 0.62, 0.28, pack, [0, 1.3, -0.29]),
        box(0.4, 0.2, 0.08, new THREE.Color(pack).multiplyScalar(0.8).getStyle(), [0, 1.12, -0.46]),
        cyl(0.12, 0.12, 0.56, '#6b4a33', [0, 1.66, -0.3], { rz: Math.PI / 2 }),
        cyl(0.06, 0.06, 0.2, '#8fb8d8', [0.28, 1.12, -0.28]),
      );
      for (const x of [-0.15, 0.15]) torso.push(box(0.07, 0.55, 0.02, '#3a302b', [x, 1.35, 0.155]));
      torso.push(box(0.36, 0.05, 0.02, '#3a302b', [0, 1.22, 0.16]));
    }
    this.root.add(segment(torso, mat));

    // ---- head (pivots at the neck)
    this.head = new THREE.Bone();
    this.head.position.y = 1.72;
    const head = [
      ball(0.24, skin, [0, 0.17, 0], { sy: 1.06, sz: 0.95 }),
      box(0.05, 0.07, 0.03, EYE, [-0.085, 0.2, 0.215]),
      box(0.05, 0.07, 0.03, EYE, [0.085, 0.2, 0.215]),
      box(0.085, 0.02, 0.02, hair, [-0.085, 0.265, 0.215]),
      box(0.085, 0.02, 0.02, hair, [0.085, 0.265, 0.215]),
      box(0.05, 0.08, 0.06, skinDark, [0, 0.15, 0.235]),
      box(0.09, 0.025, 0.02, MOUTH, [0, 0.075, 0.212]),
      ball(0.055, skinDark, [-0.235, 0.17, 0], {}, 0),
      ball(0.055, skinDark, [0.235, 0.17, 0], {}, 0),
    ];
    if (!child && !dress && chance(0.35)) head.push(box(0.16, 0.035, 0.03, hair, [0, 0.105, 0.22])); // moustache
    if (elder && !dress && chance(0.5)) head.push(box(0.26, 0.14, 0.08, hair, [0, 0.03, 0.18])); // beard

    const style = hiker ? 'short' : pick(dress ? ['long', 'bun', 'long', 'short'] : ['short', 'short', 'long', 'bun', 'bald']);
    if (style !== 'bald') {
      // Crown + a rounded back that hugs the skull (sits behind the face so it never pokes through).
      head.push(ball(0.255, hair, [0, 0.28, -0.02], { sy: 0.62, sz: 1.02 }), ball(0.25, hair, [0, 0.17, -0.075], { sy: 0.92, sz: 0.9 }));
    }
    if (style === 'long') head.push(ball(0.23, hair, [0, 0.0, -0.13], { sy: 1.25, sz: 0.55 }), box(0.07, 0.34, 0.18, hair, [-0.23, 0.1, -0.05]), box(0.07, 0.34, 0.18, hair, [0.23, 0.1, -0.05]));
    if (style === 'bun') head.push(ball(0.12, hair, [0, 0.38, -0.18]));

    const hat = hiker ? 'bucket' : style === 'bald' ? pick(['cap', 'straw', 'none']) : pick(['none', 'none', 'none', 'straw', 'cap', 'beanie']);
    if (hat === 'straw') head.push(cyl(0.43, 0.43, 0.03, '#e8d49a', [0, 0.36, 0], {}, 12), cyl(0.2, 0.24, 0.16, '#e8d49a', [0, 0.45, 0], {}, 10), cyl(0.245, 0.245, 0.04, '#c8453a', [0, 0.39, 0], {}, 10));
    if (hat === 'cap') {
      const c = pick(['#c8453a', '#2f5d7c', '#6d8b3a', '#3a302b']);
      head.push(ball(0.255, c, [0, 0.3, 0], { sy: 0.55 }), box(0.24, 0.03, 0.2, c, [0, 0.29, 0.24]));
    }
    if (hat === 'beanie') {
      const c = pick(['#c8453a', '#f2c14e', '#3f7d8c']);
      head.push(ball(0.26, c, [0, 0.31, -0.01], { sy: 0.65 }), ball(0.07, '#f4f1ea', [0, 0.49, -0.02], {}, 0));
    }
    if (hat === 'bucket') head.push(cyl(0.25, 0.3, 0.18, '#a8956a', [0, 0.4, 0], {}, 10), cyl(0.37, 0.37, 0.03, '#a8956a', [0, 0.32, 0], {}, 12));
    this.head.add(segment(head, mat));
    this.root.add(this.head);

    // ---- arms: shoulder → elbow → hand
    this.shoulders = [];
    this.elbows = [];
    const sleeve = top;
    this.carry = !hiker && !child && chance(0.3) ? pick(['basket', 'bag']) : null;
    for (const side of [-1, 1]) {
      const shoulder = new THREE.Bone();
      shoulder.position.set(side * 0.37, 1.53, 0);
      shoulder.add(segment([box(0.15, 0.34, 0.17, sleeve, [0, -0.16, 0])], mat));
      const elbow = new THREE.Bone();
      elbow.position.y = -0.33;
      const fore = [
        box(0.13, 0.28, 0.15, longSleeves ? sleeve : skin, [0, -0.14, 0]),
        longSleeves && box(0.145, 0.04, 0.165, topDark, [0, -0.27, 0]),
        ball(0.075, skin, [0, -0.33, 0.01], {}, 0),
      ];
      if (side === 1 && hiker) fore.push(cyl(0.022, 0.022, 1.3, '#9a9a9a', [0, -0.55, 0.06]), cyl(0.04, 0.04, 0.14, '#3a302b', [0, -0.3, 0.06]));
      if (side === -1 && this.carry === 'basket') {
        fore.push(box(0.34, 0.22, 0.26, '#b0803a', [0, -0.5, 0.06]), box(0.36, 0.04, 0.28, '#8a6038', [0, -0.39, 0.06]), ball(0.06, '#c8453a', [0.06, -0.37, 0.06], {}, 0), ball(0.06, '#f2c14e', [-0.07, -0.37, 0.1], {}, 0));
      }
      if (side === -1 && this.carry === 'bag') fore.push(box(0.1, 0.34, 0.3, pick(['#8a6038', '#5a3b2a', '#2f5d7c']), [0, -0.52, 0.02]));
      elbow.add(segment(fore, mat));
      shoulder.add(elbow);
      this.root.add(shoulder);
      this.shoulders.push(shoulder);
      this.elbows.push(elbow);
    }

    // ---- legs: hip → knee → foot
    this.hips = [];
    this.knees = [];
    const thighColor = dress ? skin : pants;
    const shinColor = dress || shorts ? skin : pants;
    for (const side of [-1, 1]) {
      const hip = new THREE.Bone();
      hip.position.set(side * 0.13, 0.92, 0);
      hip.add(segment([box(0.21, 0.46, 0.23, thighColor, [0, -0.23, 0]), shorts && box(0.23, 0.2, 0.25, pants, [0, -0.1, 0])], mat));
      const knee = new THREE.Bone();
      knee.position.y = -0.46;
      knee.add(
        segment(
          [
            box(0.19, 0.42, 0.21, shinColor, [0, -0.21, 0]),
            hiker ? box(0.25, 0.22, 0.35, shoes, [0, -0.36, 0.05]) : box(0.22, 0.12, 0.34, shoes, [0, -0.42, 0.05]),
            hiker && box(0.26, 0.04, 0.2, '#e0603f', [0, -0.26, 0]),
          ],
          mat,
        ),
      );
      hip.add(knee);
      this.root.add(hip);
      this.hips.push(hip);
      this.knees.push(knee);
    }

    // ---- umbrella (only shown in the rain)
    this.umbrella = new THREE.Bone();
    this.umbrella.position.set(0.3, 1.2, 0.3);
    const canopy = pick(UMBRELLAS);
    this.umbrella.add(
      segment(
        [
          cyl(0.02, 0.02, 1.35, '#3a302b', [0, 0.67, 0]),
          cone(0.8, 0.38, canopy, [0, 1.45, 0]),
          cone(0.8, 0.02, new THREE.Color(canopy).multiplyScalar(0.75).getStyle(), [0, 1.26, 0]),
          ball(0.04, GOLD, [0, 1.66, 0], {}, 0),
        ],
        mat,
      ),
    );
    this.root.add(this.umbrella);

    // ---- a tourist's camera, in front of the face while taking a photo (scaled to nothing otherwise)
    if (kind === 'tourist') {
      this.camera = new THREE.Bone();
      this.camera.position.set(0, 1.58, 0.5);
      this.camera.add(segment([box(0.3, 0.2, 0.12, '#2a2a2e', [0, 0, 0]), box(0.12, 0.05, 0.1, '#c9c9c9', [-0.08, 0.12, 0]), ball(0.075, '#3b4a66', [0, 0, 0.08], {}, 0)], mat));
      this.root.add(this.camera);
      this.camera.scale.setScalar(0);
    }

    // Bake every segment into one skinned mesh (one draw call per person); the bones stay posable.
    this.mesh = skinFigure(this.group, this.root, mat);
    // A bone can't be hidden, so the folded-away umbrella is scaled to nothing instead.
    this.umbrellaOn = false;
    this.umbrella.scale.setScalar(0);

    this.child = child;
    this.group.scale.setScalar(child ? 0.55 : 0.85);
  }

  setUmbrella(on) {
    if (this.carry || on === this.umbrellaOn) return;
    this.umbrellaOn = on;
    this.umbrella.scale.setScalar(on ? 1 : 0);
  }

  // Arms when holding the umbrella: right hand up in front of the chest.
  holdUmbrella() {
    this.shoulders[1].rotation.set(-0.95, 0, 0.15);
    this.elbows[1].rotation.set(-1.15, 0, 0);
  }

  // Walking and standing are blended by `stride` (0 = standing, 1 = full stride), which eases over a
  // few frames each way. Snapping straight from mid-step to standing flicked the legs through
  // 0.55 rad in one frame, which read as a blur of limbs.
  walk(p) {
    this.gaitP = p;
    this.photoing = false;
    this.stride = (this.stride ?? 0) + (1 - (this.stride ?? 0)) * 0.2;
    this.pose();
    this.head.rotation.y *= 0.9;
  }

  idle(t) {
    this.photoing = false;
    this.idleT = t;
    this.stride = (this.stride ?? 0) * 0.8;
    this.pose();
    this.head.rotation.y = Math.sin(t * 0.3 + this.phase) * 0.5;
  }

  pose() {
    const w = this.stride;
    const p = this.gaitP ?? 0;
    const s = Math.sin(p) * w;
    // Legs swing on a triangle wave: the planted foot then moves back at a constant speed, matching
    // the ground going by (with a sine it slid, fast mid-step and slow at the ends). Arms keep the sine.
    const tri = ((Math.asin(Math.sin(p)) * 2) / Math.PI) * w;
    const sway = (i) => Math.sin((this.idleT ?? 0) * 1.5 + this.phase + i) * 0.05 * (1 - w);
    // +x hip rotation swings a leg back. A knee bends only while its leg swings FORWARD (foot in the
    // air); the straight leg is the one pushing back on the ground. Leg 0 swings forward when cos p
    // < 0, leg 1 when cos p > 0 — getting these swapped makes people moonwalk.
    this.hips[0].rotation.x = tri * 0.55;
    this.hips[1].rotation.x = -tri * 0.55;
    this.knees[0].rotation.x = w * (0.1 + Math.max(0, -Math.cos(p)) * 0.8);
    this.knees[1].rotation.x = w * (0.1 + Math.max(0, Math.cos(p)) * 0.8);
    this.shoulders[0].rotation.set(sway(0) - s * 0.5, 0, 0);
    this.shoulders[1].rotation.set(sway(1) + s * 0.5, 0, 0);
    this.elbows.forEach((e) => (e.rotation.x = -0.15 - 0.2 * w));
    if (this.carry) {
      this.elbows[0].rotation.x = -0.6;
      this.shoulders[0].rotation.x = -0.15 * w;
    }
    if (this.photoing) {
      // Both hands up in front of the face holding the camera.
      this.shoulders[0].rotation.set(-1.35, 0, -0.2);
      this.shoulders[1].rotation.set(-1.35, 0, 0.2);
      this.elbows.forEach((e) => (e.rotation.x = -1.45));
    }
    if (this.camera) this.camera.scale.setScalar(this.photoing ? 1 : 0);
    if (this.umbrellaOn) this.holdUmbrella();
    this.root.position.y = Math.abs(Math.cos(p)) * 0.05 * w;
  }

  // Taking a photo (tourists): standing, the camera up.
  photo(t) {
    this.photoing = true;
    this.idleT = t;
    this.stride = (this.stride ?? 0) * 0.8;
    this.pose();
    this.head.rotation.y *= 0.8;
  }

  wave(t) {
    this.idle(t);
    this.shoulders[1].rotation.set(0, 0, 2.6 + Math.sin(t * 8) * 0.25);
    this.elbows[1].rotation.x = -0.2;
    this.head.rotation.y = 0;
  }

  // Seated pose; the caller puts the group on a seat (hips are 0.92 above the soles when standing).
  sit({ reading = false } = {}) {
    this.hips.forEach((h) => (h.rotation.x = -Math.PI / 2));
    this.knees.forEach((k) => (k.rotation.x = Math.PI / 2));
    this.shoulders.forEach((s) => s.rotation.set(-0.55, 0, 0));
    this.elbows.forEach((e) => (e.rotation.x = -0.9));
    if (reading) {
      this.shoulders.forEach((s, i) => s.rotation.set(-0.9, 0, i ? 0.25 : -0.25));
      this.elbows.forEach((e) => (e.rotation.x = -1.1));
      const paper = segment(
        [box(0.62, 0.42, 0.015, '#f4f1ea', [0, 0, 0]), box(0.5, 0.05, 0.02, '#5a5a5a', [0, 0.12, 0.005]), box(0.22, 0.14, 0.02, '#8a8a8a', [-0.14, -0.03, 0.005]), box(0.22, 0.02, 0.02, '#8a8a8a', [0.14, -0.02, 0.005]), box(0.22, 0.02, 0.02, '#8a8a8a', [0.14, -0.08, 0.005])],
        INDOOR,
      );
      paper.position.set(0, 1.42, 0.42);
      paper.rotation.x = -0.25;
      this.root.add(paper);
    }
  }
}
