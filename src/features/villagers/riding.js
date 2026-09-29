// @ts-check
import * as THREE from 'three';

// Getting on and off the train. People waiting on the platform board when the doors open and get off
// at the next stop (another area), where they then live. The train holds until nobody is still
// walking to or from a door.
//   const riding = createRiding({ train, villagers, areas, rng });
//   riding.update() once a frame, then for each villager: if (riding.step(w, dt, t)) continue;
export function createRiding({ train, villagers, areas, rng }) {
  const areaAt = (stopIndex) => areas.find((ar) => ar.index === stopIndex);
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

  return {
    // Call once a frame: when the train has just opened its doors at a stop, sends people to them.
    update() {
      if (train.stopped && train.doorOpen > 0.95 && handledStop !== train.stopId) {
        handledStop = train.stopId;
        onTrainArrived();
      }
    },
    step: trainStep,
  };
}
