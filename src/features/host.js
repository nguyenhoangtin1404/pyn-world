// @ts-check
import * as THREE from 'three';
import { Person, PERSON_HEIGHT } from '../world/people.js';
import { linkable } from '../app/qr.js';

// The author of the diorama, standing on the landmark's grounds (world.landmarks[0]) with an open laptop on
// one arm. Tapping them opens a chat bubble with a QR code of their portfolio and a link to it
// (src/app/host.js); this feature only puts them there and leaves world.host for the app. Nothing marks them
// from afar: from the default view they are a few pixels tall, there to be found.
// They stand just inside the path people take round the landmark (its `walk` loop: the tourists go round
// it, along its points, and never inside), at its front corner on the street side, looking up at the
// landmark; when the camera comes close (zoomed in on them, or flying up to them for the bubble) they turn
// round to it, look into the lens, grin and wave, and when it goes they turn back to the landmark.
// Options: url (the portfolio, required: http(s)), greeting (what the bubble says), corner (which point of
// the walk loop, as a fraction of the way round: 0.56, the street side towards the left spire).

const INSET = 1.5; // metres inside the walk loop
const WAVE_EVERY = 6, WAVE_FOR = 2.2; // seconds: a wave as they turn to the camera, then now and then
const NEAR = 14, FAR = 17; // the camera this many times their height away (or nearer) has come to see them; further, it has gone
const TURN = 3.5; // how quickly they turn (1/s, an easing rate)

/** @type {import('../types').Feature} */
export default {
  label: 'Đang mời tác giả ra quảng trường',
  needs: ['landmarks'],
  build(world, { rng, url, greeting = 'Xin chào! Quét mã để xem portfolio của mình 👋', corner = 0.56 }) {
    if (!url || !linkable(url)) throw new Error(`host: url phải là địa chỉ web http(s), không phải ${JSON.stringify(url)}`);
    const lm = world.landmarks.find((l) => l.walk?.length);
    world.need('công trình có đường đi quanh (landmark.walk)', 'host', lm);
    const k = world.scale.props, map = world.scale.map;
    const walk = /** @type {THREE.Vector3[]} */ (lm.walk);

    // Where they stand: a point of the walk loop, moved in towards the landmark; facing out, to the street.
    const w = walk[Math.round(corner * walk.length) % walk.length];
    const toIn = new THREE.Vector3(lm.spot.x - w.x, 0, lm.spot.z - w.z).normalize();
    const at = new THREE.Vector3(w.x + toIn.x * INSET * map, 0, w.z + toIn.z * INSET * map);
    at.y = lm.walkHeight ? lm.walkHeight(at.x, at.z) : world.heightAt(at.x, at.z);
    const facing = toIn.clone().negate();

    const person = new Person(rng, { kind: 'villager', carry: 'laptop', smile: true });
    person.group.scale.multiplyScalar(k);
    person.group.position.copy(at);
    const towerYaw = Math.atan2(toIn.x, toIn.z); // (the figure faces local +z)
    person.group.rotation.y = towerYaw;
    const tall = PERSON_HEIGHT * person.group.scale.y;
    world.scale.note('person', tall, 'host');

    const group = new THREE.Group().add(person.group);
    const head = new THREE.Vector3(at.x, at.y + tall * 0.8, at.z);
    const host = (world.host = { url, title: new URL(url).hostname.replace(/^www\./, ''), greeting, person, head, facing, group, facingCamera: /** @type {boolean} */ (false) });

    let near = false, waveAt = -Infinity;
    /** The angle from `a` to `b`, the short way round. */
    const turnBy = (/** @type {number} */ a, /** @type {number} */ b) => Math.atan2(Math.sin(b - a), Math.cos(b - a));
    return {
      group,
      // (After the camera has moved this frame: they turn to where it is now.)
      lateUpdate({ t = 0, raw = 0, camera }) {
        const cam = camera.position, d = cam.distanceTo(head);
        if (!near && d < NEAR * tall) {
          near = true;
          waveAt = -Infinity; // (a wave as soon as they face it)
        } else if (near && d > FAR * tall) near = false;

        // Turn: to the camera when it is near, else back to the landmark.
        const want = near ? Math.atan2(cam.x - at.x, cam.z - at.z) : towerYaw;
        const off = turnBy(person.group.rotation.y, want);
        person.group.rotation.y += off * Math.min(1, TURN * raw);
        const facingIt = near && Math.abs(off) < 0.35;

        if (facingIt && t - waveAt > WAVE_EVERY) waveAt = t;
        if (facingIt && t - waveAt < WAVE_FOR) person.wave(t);
        else person.idle(t);
        // Eyes on the camera (or up at the landmark): the head tips, the body does the turning.
        const lookUp = near ? Math.atan2(cam.y - head.y, Math.hypot(cam.x - head.x, cam.z - head.z)) : 0.35;
        person.head.rotation.y = 0;
        person.head.rotation.x = -Math.max(-0.5, Math.min(0.6, lookUp));
        person.smile(facingIt);
        host.facingCamera = facingIt;
      },
    };
  },
};
