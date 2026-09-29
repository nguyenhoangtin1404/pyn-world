import * as THREE from 'three';
import { NavGrid } from '../world/nav.js';
import { Walker, turnToward } from '../world/walker.js';

// People living around each stop (world.stations): they walk between their homes and the platform,
// routed around obstacles on a nav grid per stop, and ride the train to the other stop, where they
// then go about their day. Children tag along beside a grown-up. Comes after "train".
// Options: perStop (grown-ups at each stop; the last number counts for the stops after it: [12, 10]),
// kids (children, same way: [4, 3]).
export default {
  label: 'Đang đón dân làng',
  needs: ['train'],
  build(world, { rng, perStop = [12, 10], kids: kidsPerStop = [4, 3] }) {
    const { track, site, train, size } = world;
    const isIndoors = (x, z) => world.services.get('houses')?.isIndoors(x, z) ?? false;
    const group = new THREE.Group();
      // People walking between houses and a platform, routed around obstacles. There are two areas —
      // the village by the station and the town by the halt — each with its own nav grid; people who
      // ride the train get off at the other stop and go about their day there.
      const walkHeight = site.walkHeight;
      const faceTrack = (p) => {
        // Stand facing the track while waiting for the train.
        let best = null, bd = Infinity;
        for (const f of track.frames) {
          const d = (f.p.x - p.x) ** 2 + (f.p.z - p.z) ** 2;
          if (d < bd) {
            bd = d;
            best = f;
          }
        }
        return Math.atan2(best.p.x - p.x, best.p.z - p.z);
      };
      const areas = [];
      world.stations.forEach((st, index) => {
        const rawStops = [...st.homes.map((p) => ({ p, face: null, indoor: true })), ...st.platformSpots.map((p) => ({ p, face: faceTrack(p) }))];
        if (rawStops.length < 2) return;
        const b = { minX: Infinity, minZ: Infinity, maxX: -Infinity, maxZ: -Infinity };
        for (const { p } of rawStops) {
          b.minX = Math.min(b.minX, p.x - 30);
          b.maxX = Math.max(b.maxX, p.x + 30);
          b.minZ = Math.min(b.minZ, p.z - 30);
          b.maxZ = Math.max(b.maxZ, p.z + 30);
        }
        const lim = size / 2 - 2;
        b.minX = Math.max(b.minX, -lim);
        b.minZ = Math.max(b.minZ, -lim);
        b.maxX = Math.min(b.maxX, lim);
        b.maxZ = Math.min(b.maxZ, lim);
        const nav = new NavGrid(b, walkHeight, site.colliders);
        // Snap every stop onto a walkable cell, and keep only stops reachable from the platform.
        let stops = rawStops.map((s) => ({ ...s, p: nav.nearestFree(s.p.x, s.p.z) })).filter((s) => s.p);
        const anchor = stops.find((s) => s.face != null) || stops[0];
        const main = nav.regionAt(anchor.p.x, anchor.p.z);
        stops = stops.filter((s) => nav.regionAt(s.p.x, s.p.z) === main);
        areas.push({ index, nav, stops, platformStops: stops.filter((s) => s.face != null), out: st.out, platformY: st.point(0.5, 0.5).y });
        st.nav = nav; // the pigeons on the platform use it
      });
      const areaAt = (stopIndex) => areas.find((ar) => ar.index === stopIndex);

      // Half of all trips go to the platform, the rest to a random house.
      const pickStop = (area, not) => {
        const { stops, platformStops } = area;
        let s;
        do s = platformStops.length && rng() < 0.5 ? platformStops[Math.floor(rng() * platformStops.length)] : stops[Math.floor(rng() * stops.length)];
        while (s === not && stops.length > 1);
        return s;
      };
      const plan = (w) => {
        const nav = w.area.nav;
        for (let tries = 0; tries < 4; tries++) {
          const stop = pickStop(w.area, w.stop);
          // Don't all stand on the exact same spot: pick a free place a little around the stop.
          // Indoors the spread stays small, so the goal doesn't end up outside behind a wall.
          const a = rng() * Math.PI * 2, r = stop.indoor ? rng() * 0.8 : 0.6 + rng() * 1.6;
          let goal = nav.nearestFree(stop.p.x + Math.cos(a) * r, stop.p.z + Math.sin(a) * r, stop.indoor ? 1 : 2);
          if (!goal || nav.regionAt(goal.x, goal.z) !== nav.regionAt(stop.p.x, stop.p.z)) goal = stop.p;
          const path = nav.findPath(w.pos, goal);
          if (path && path.length) {
            w.stop = stop;
            w.path = path;
            w.pi = 0;
            return;
          }
        }
        w.path = null;
        w.pause = 3;
      };

      const villagers = [];
      const kids = [];
      areas.forEach((area, ai) => {
        const n = perStop[Math.min(ai, perStop.length - 1)];
        const first = villagers.length;
        for (let i = 0; i < n; i++) {
          const w = new Walker(rng, walkHeight);
          w.area = area;
          w.stop = pickStop(area, null);
          w.place(w.stop.p);
          w.pause = rng() * 4;
          w.plan = plan;
          villagers.push(w);
          group.add(w.group);
        }
        // Children tag along beside a grown-up.
        for (let i = 0; i < Math.min(kidsPerStop[Math.min(ai, kidsPerStop.length - 1)], n); i++) {
          const parent = villagers[first + i * 3];
          const k = new Walker(rng, walkHeight, { kind: 'child', speed: 1.4 }); // pace set by follow()
          k.parent = parent;
          k.side = rng() < 0.5 ? -1 : 1;
          k.spot = new THREE.Vector3();
          k.place(area.nav.nearestFree(parent.pos.x + 1, parent.pos.z) || parent.pos);
          kids.push(k);
          group.add(k.group);
        }
      });
      // Doors open for them (houses.js), pigeons flee from them (birds).
      world.people.push(...villagers, ...kids);

      // ---- Getting on and off the train
      // People waiting on the platform board when the doors open and get off at the next stop (the
      // other area). The train holds until nobody is still walking to or from a door.
      const doorPos = new THREE.Vector3();
      const doors = (out) => {
        const list = [];
        for (let car = 1; car <= 3; car++) {
          for (const end of [-1, 1]) list.push({ car, end, p: train.doorPoint(car, end, out, new THREE.Vector3()) });
        }
        return list;
      };
      // The guard waits for anyone stepping through a door or nearly there; stragglers miss the train.
      const busy = (w) =>
        w.mode === 'boarding' || w.mode === 'waitAlight' || w.mode === 'alighting' || (w.mode === 'toTrain' && w.pos.distanceTo(w.door.p) < 8);
      train.canDepart = () => !villagers.some(busy);
      let handledStop = 0;

      function onTrainArrived() {
        const here = areaAt(train.stopIndex);
        if (!here) return;
        const ds = doors(here.out);
        // Riders get off first, one after another, and now live around this stop.
        let delay = 0.3;
        for (const w of villagers) {
          if (w.mode !== 'riding' || w.boardedStop >= train.stopId) continue;
          w.mode = 'waitAlight';
          w.alightDelay = delay;
          w.door = ds[Math.floor(rng() * ds.length)];
          w.area = here;
          delay += 0.9;
        }
        // Then some of the people waiting on the platform get on.
        let aboard = villagers.filter((w) => w.mode === 'riding' || w.mode === 'waitAlight').length;
        for (const w of villagers) {
          // Anyone waiting on — or heading for — this platform may hop on.
          if (w.mode || w.area !== here || w.stop?.face == null || aboard >= 6 || rng() > 0.85) continue;
          let best = null;
          for (const d of ds) if (!best || d.p.distanceToSquared(w.pos) < best.p.distanceToSquared(w.pos)) best = d;
          if (best.p.distanceTo(w.pos) > 25) continue; // too far away to make it
          const approach = best.p.clone().addScaledVector(here.out, 2.1);
          const goal = here.nav.nearestFree(approach.x, approach.z, 2);
          const path = goal && here.nav.findPath(w.pos, goal);
          if (!path) continue;
          w.mode = 'toTrain';
          w.door = best;
          w.path = path.length ? path : [goal]; // already standing at the door
          w.pi = 0;
          w.pause = 0;
          aboard++;
        }
      }

      // Returns true when the villager is busy with the train this frame.
      function trainStep(w, dt, t) {
        switch (w.mode) {
          case 'riding':
            return true;
          case 'waitAlight': {
            w.alightDelay -= dt;
            if (w.alightDelay > 0) return true;
            // Step out of the door onto the platform.
            const { out, platformY, nav } = w.area;
            train.doorPoint(w.door.car, w.door.end, out, doorPos);
            w.pos.set(doorPos.x, platformY, doorPos.z);
            w.fixedY = platformY - 0.05;
            w.heading = Math.atan2(out.x, out.z);
            w.exit = nav.nearestFree(doorPos.x + out.x * 2.2, doorPos.z + out.z * 2.2, 2) || w.pos.clone().addScaledVector(out, 2.2);
            w.group.visible = true;
            w.mode = 'alighting';
            return true;
          }
          case 'alighting':
            if (w.step(w.exit, dt, t)) {
              w.mode = null;
              w.fixedY = null;
              w.path = null;
              w.pause = 0.5;
              w.stop = null; // next plan() heads somewhere in the new area
            }
            return true;
          case 'toTrain':
            if (!train.stopped || train.state === 'closing') {
              w.mode = null; // missed it
              w.plan(w);
              return true;
            }
            if (w.step(w.path[w.pi], dt, t) && ++w.pi >= w.path.length) {
              w.mode = 'boarding';
              w.fixedY = w.area.platformY - 0.05;
            }
            return true;
          case 'boarding':
            if (w.step(w.door.p, dt, t) || !train.stopped) {
              w.group.visible = false;
              w.mode = 'riding';
              w.fixedY = null;
              w.car = train.cars[w.door.car].obj;
              w.boardedStop = train.stopId;
            }
            return true;
        }
        return false;
      }

      const update = ({ dt, t, rain }) => {
        if (dt === 0 || !areas.length) return;
        const rainy = rain > 0.3;
        if (train && train.stopped && train.doorOpen > 0.95 && handledStop !== train.stopId) {
          handledStop = train.stopId;
          onTrainArrived();
        }
        for (const w of villagers) {
          w.person.setUmbrella(rainy && !isIndoors(w.pos.x, w.pos.z));
          if (trainStep(w, dt, t)) continue;
          if (w.pause > 0) {
            w.pause -= dt;
            if (w.stop?.face != null) w.heading = turnToward(w.heading, w.stop.face, Math.min(1, dt * 3));
            w.sync();
            w.idle(t);
            if (w.pause <= 0) w.plan(w);
            continue;
          }
          if (!w.path) {
            w.plan(w);
            continue;
          }
          if (w.step(w.path[w.pi], dt, t)) {
            w.pi++;
            if (w.pi >= w.path.length) {
              w.path = null;
              w.pause = w.stop.face != null ? 6 + rng() * 10 : 4 + rng() * 8; // a while on the platform or at home
            }
          }
        }
        // Should child k be walking towards `target`? Starts once it has fallen `start` behind and
        // stops only when within `stop` — the gap between the two keeps it from flipping between the
        // walking and standing poses every frame (which looked like a blur of limbs). It keeps pace with
        // the parent, hurrying only when left well behind.
        const follow = (k, target, start, stop) => {
          const gap = Math.hypot(k.pos.x - target.x, k.pos.z - target.z);
          k.moving = k.moving ? gap > stop : gap > start;
          k.speed = k.parent.speed * (gap > 3 ? 1.5 : 1.05);
          return k.moving;
        };
        for (const k of kids) {
          const p = k.parent;
          const nav = p.area.nav;
          k.person.setUmbrella(rainy && !isIndoors(k.pos.x, k.pos.z));
          // On the train with the parent: hidden while riding, stepping through the door right behind them.
          if (p.mode === 'riding' || p.mode === 'waitAlight') {
            k.group.visible = false;
            continue;
          }
          if (!k.group.visible) {
            k.pos.copy(p.pos).addScaledVector(p.area.out, 0.6);
            k.path = null;
            k.group.visible = true;
          }
          if (p.mode === 'boarding' || p.mode === 'alighting') {
            k.fixedY = p.fixedY;
            if (follow(k, p.pos, 1.1, 0.8)) k.step(p.pos, dt, t);
            else {
              k.sync();
              k.idle(t);
            }
            continue;
          }
          k.fixedY = null;
          // Beside the parent if there is room, otherwise just behind them.
          const sx = Math.cos(p.heading) * 1.1 * k.side, sz = -Math.sin(p.heading) * 1.1 * k.side;
          k.spot.set(p.pos.x + sx, k.pos.y, p.pos.z + sz);
          if (!nav.isFree(k.spot.x, k.spot.z) || !nav.clearLine(p.pos, k.spot)) {
            k.spot.set(p.pos.x - Math.sin(p.heading) * 1.2, k.pos.y, p.pos.z - Math.cos(p.heading) * 1.2);
          }
          let target = k.spot;
          if (!nav.clearLine(k.pos, k.spot)) {
            // Can't cut straight across: follow a proper path to the parent (re-planned every second).
            k.replan = (k.replan ?? 0) - dt;
            if (!k.path || k.replan <= 0) {
              k.path = nav.findPath(k.pos, p.pos, 8000);
              k.pi = 0;
              k.replan = 1;
            }
            if (k.path && k.pi < k.path.length) {
              target = k.path[k.pi];
              if (Math.hypot(target.x - k.pos.x, target.z - k.pos.z) < 0.3) k.pi++;
            } else target = null;
          } else k.path = null;
          if (target && follow(k, target, 0.9, 0.25)) k.step(target, dt, t);
          else {
            k.heading = turnToward(k.heading, p.heading, Math.min(1, dt * 4));
            k.sync();
            k.idle(t);
          }
        }
      };

    // Who the follow cameras can ride along with. Someone on the train is followed via their carriage.
    world.followables.people.push(
      ...villagers.map((w, i) => ({ label: `Dân làng ${i + 1}`, anchor: () => (w.group.visible ? w.group : w.car || w.group) })),
      ...kids.map((k, i) => ({ label: `Em bé ${i + 1}`, anchor: () => (k.group.visible ? k.group : k.parent.car || k.group) })),
    );
    return { group, update };
  },
};
