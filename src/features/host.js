// @ts-check
import * as THREE from 'three';
import { Person, PERSON_HEIGHT } from '../world/people.js';
import { linkable } from '../app/qr.js';

// The author of the diorama, standing on the landmark's grounds (world.landmarks[0]) and waving now and
// then, with a little "👋" bubble over their head that keeps the same size on screen however far the camera
// is (a marker: from the default view the person is a few pixels tall). Tapping either opens a chat bubble
// with a QR code of their portfolio and a link to it (src/app/host.js); this feature only puts them there
// and leaves world.host for the app.
// They stand just inside the path people take round the landmark (its `walk` loop: the tourists go round
// it, along its points, and never inside), at its front corner on the street side, facing the street.
// Options: url (the portfolio, required: http(s)), greeting (what the bubble says), corner (which point of
// the walk loop, as a fraction of the way round: 0.56, the street side towards the left spire).

const MARKER = 0.05; // the marker's height, as a share of the screen's (sizeAttenuation off)
const INSET = 1.5; // metres inside the walk loop
const WAVE_EVERY = 7, WAVE_FOR = 2.2; // seconds

/** The "👋" marker: a small round speech bubble, drawn once. */
function markerTexture() {
  const c = document.createElement('canvas');
  c.width = 96;
  c.height = 112;
  const g = c.getContext('2d');
  if (!g) throw new Error('host: no 2D canvas');
  g.fillStyle = 'rgba(255,255,255,0.96)';
  g.strokeStyle = 'rgba(40,40,60,0.6)';
  g.lineWidth = 4;
  g.beginPath();
  g.arc(48, 46, 42, 0, Math.PI * 2);
  g.moveTo(38, 84);
  g.lineTo(48, 108);
  g.lineTo(58, 84);
  g.fill();
  g.stroke();
  g.font = '48px "Segoe UI Emoji", "Noto Color Emoji", "Apple Color Emoji", sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('👋', 48, 50);
  const map = new THREE.CanvasTexture(c);
  map.colorSpace = THREE.SRGBColorSpace;
  return map;
}

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

    const person = new Person(rng, { kind: 'villager' });
    person.group.scale.multiplyScalar(k);
    person.group.position.copy(at);
    person.group.rotation.y = Math.atan2(facing.x, facing.z); // (the figure faces local +z)
    const tall = PERSON_HEIGHT * person.group.scale.y;
    world.scale.note('person', tall, 'host');

    const mat = new THREE.SpriteMaterial({ map: markerTexture(), transparent: true, depthWrite: false, sizeAttenuation: false });
    const marker = new THREE.Sprite(mat);
    marker.center.set(0.5, 0); // (the bubble's tail at the point: it sits on the head)
    marker.scale.set(MARKER * (96 / 112), MARKER, 1);
    marker.position.set(at.x, at.y + tall * 1.05, at.z);
    marker.renderOrder = 3;

    const group = new THREE.Group().add(person.group, marker);
    const head = new THREE.Vector3(at.x, at.y + tall * 0.8, at.z);
    world.host = { url, title: new URL(url).hostname.replace(/^www\./, ''), greeting, person, marker, head, facing, group };

    const t0 = rng() * WAVE_EVERY;
    return {
      group,
      dispose() {
        mat.map?.dispose();
        mat.dispose();
      },
      update({ t }) {
        const phase = (t + t0) % WAVE_EVERY;
        if (phase < WAVE_FOR) person.wave(t);
        else person.idle(t);
        // The marker bobs a little, so it reads as something to tap.
        marker.position.y = at.y + tall * 1.05 + Math.abs(Math.sin(t * 2.2)) * tall * 0.08;
      },
    };
  },
};
