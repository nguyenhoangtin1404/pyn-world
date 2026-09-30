// @ts-check
import * as THREE from 'three';
import { WATER_Y } from '../config.js';
import { lam } from '../world/lowpoly.js';
import { Walker } from '../world/walker.js';

// Zig-zag trails from the valley floor up to the highest summits (trees on the way are cleared), a
// flag on top, and hikers walking up and down — waving at the top (spot "summit", key K). Comes
// after "trees". Options: trails (2), perTrail (3 hikers).
/** @type {import('../types').Feature} */
export default {
  label: 'Đang mở đường mòn',
  build(world, { rng, trails: trailCount = 2, perTrail = 3 }) {
    const { cfg, track, site, heightAt, size } = world;
    world.need('một vành núi quanh thung lũng (cfg.terrain.rim)', 'hikers', cfg.terrain?.rim);
    const group = new THREE.Group();
      // Hikers climbing to mountain summits along zig-zag trails
      const candidates = [];
      for (let i = 0; i < 400; i++) {
        const a = rng() * Math.PI * 2;
        const [rim0, rim1] = cfg.terrain.rim; // among the mountains round the valley
        const r = rim0 + 10 + rng() * (rim1 - rim0 - 20);
        const x = Math.cos(a) * r, z = Math.sin(a) * r;
        if (Math.abs(x) > size / 2 - 15 || Math.abs(z) > size / 2 - 15) continue;
        if (world.rivers.distance(x, z) < 30) continue;
        candidates.push({ x, z, h: heightAt(x, z) });
      }
      candidates.sort((a, b) => b.h - a.h);
      // Highest summits, kept far apart from each other.
      const peaks = [];
      for (const c of candidates) if (peaks.every((p) => Math.hypot(p.x - c.x, p.z - c.z) > 160)) peaks.push(c);
      const trails = [];
      const flags = [];
      const trailMat = lam('#b89a6a', { side: THREE.DoubleSide });
      for (const peak of peaks.slice(0, trailCount)) {
        // Walk from the summit toward the valley centre until we reach easy, dry ground.
        const dir = new THREE.Vector3(-peak.x, 0, -peak.z).normalize();
        const side = new THREE.Vector3(-dir.z, 0, dir.x);
        let len = 0;
        for (let d = 10; d < 200; d += 4) {
          const x = peak.x + dir.x * d, z = peak.z + dir.z * d;
          const h = heightAt(x, z);
          len = d;
          if (h < 8 && h > WATER_Y + 1 && track.distanceTo(x, z, 12) > 12) break;
        }
        const pts = [];
        const N = Math.ceil(len / 3);
        for (let i = 0; i <= N; i++) {
          const k = i / N; // 0 = summit
          const zig = Math.sin(k * Math.PI * 5) * 7 * Math.sin(k * Math.PI);
          const x = peak.x + dir.x * len * k + side.x * zig;
          const z = peak.z + dir.z * len * k + side.z * zig;
          pts.push(new THREE.Vector3(x, heightAt(x, z), z));
        }
        pts.reverse(); // 0 = trailhead
        trails.push(pts);
        site.clearAround(pts, 1.8); // no trees or boulders standing on the path

        // Dirt ribbon draped on the terrain
        const pos = [];
        for (let i = 0; i < pts.length - 1; i++) {
          const a = pts[i], b = pts[i + 1];
          const t = new THREE.Vector3().subVectors(b, a).setY(0).normalize();
          const s = new THREE.Vector3(-t.z, 0, t.x).multiplyScalar(0.7);
          const quad = [a.clone().add(s), a.clone().sub(s), b.clone().sub(s), b.clone().add(s)];
          quad.forEach((q) => (q.y = heightAt(q.x, q.z) + 0.12));
          pos.push(...quad[0].toArray(), ...quad[1].toArray(), ...quad[2].toArray(), ...quad[0].toArray(), ...quad[2].toArray(), ...quad[3].toArray());
        }
        const tg = new THREE.BufferGeometry();
        tg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
        tg.computeVertexNormals();
        const trail = new THREE.Mesh(tg, trailMat);
        trail.receiveShadow = true;
        group.add(trail);

        // Summit flag
        const top = pts[pts.length - 1];
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 4, 6), lam('#5a3b2a'));
        pole.position.set(top.x, top.y + 2, top.z);
        const flag = new THREE.Mesh(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, -1.1, 0), new THREE.Vector3(1.8, -0.55, 0)]), new THREE.MeshBasicMaterial({ color: '#c8453a', side: THREE.DoubleSide }));
        flag.position.set(top.x, top.y + 4, top.z);
        group.add(pole, flag);
        flags.push(flag);
      }

      const hikers = [];
      trails.forEach((pts) => {
        for (let i = 0; i < perTrail; i++) {
          const w = /** @type {Walker & { trail: THREE.Vector3[], idx: number, dir: number }} */ (new Walker(rng, heightAt, { kind: 'hiker', speed: 1.5 }));
          w.trail = pts;
          w.idx = Math.floor(rng() * (pts.length - 1));
          w.dir = rng() < 0.6 ? 1 : -1;
          w.place(pts[w.idx]);
          hikers.push(w);
          group.add(w.group);
        }
      });
      const update = ({ dt, t }) => {
        for (const flag of flags) flag.rotation.y = Math.sin(t * 1.3) * 0.5;
        if (dt === 0) return;
        for (const w of hikers) {
          if (w.pause > 0) {
            w.pause -= dt;
            w.idle(t);
            if (w.pause <= 0) w.waving = false;
            continue;
          }
          const target = w.trail[w.idx];
          if (w.step(target, dt, t, true)) {
            const next = w.idx + w.dir;
            if (next < 0 || next >= w.trail.length) {
              // Reached summit (wave!) or trailhead (rest), then turn around.
              w.dir *= -1;
              w.waving = next >= w.trail.length;
              w.pause = w.waving ? 5 + rng() * 4 : 4 + rng() * 6;
            } else w.idx = next;
          }
        }
      };

      if (trails.length) world.spots.summit = trails[0][trails[0].length - 1];

    world.followables.people.push(...hikers.map((h, i) => ({ label: `Người leo núi ${i + 1}`, anchor: () => h.group })));
    return { group, update };
  },
};
