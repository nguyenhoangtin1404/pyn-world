import { test as base, expect } from '@playwright/test';

// `page` that remembers every error the app throws or logs; each test ends by checking there were
// none. (Fonts come from Google: a failed download in an offline run is not the app's error.)
export const test = base.extend({
  page: async ({ page }, use) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && errors.push(m.text()));
    page.errors = errors;
    await use(page);
  },
});
export { expect };

// Wait until the world `id` is on screen (after loading or switching).
export const waitForWorld = (page, id) =>
  page.waitForFunction((id) => window.__pyn?.W?.cfg.id === id && document.getElementById('loading').classList.contains('done'), id, { timeout: 180_000 });

// Open the app on a world and wait until it is on screen.
export async function openWorld(page, id) {
  await page.goto(`/?world=${id}`);
  await waitForWorld(page, id);
}

// Runs in the page: what the world on screen is made of.
export function fingerprint() {
  const { W } = window.__pyn;
  const geos = new Set();
  const instanced = [];
  let meshes = 0;
  W.scene.traverse((o) => {
    if (o.isMesh) {
      meshes++;
      geos.add(o.geometry);
    }
    if (o.isInstancedMesh && o.frustumCulled) instanced.push(o); // placed once (trees…), not animated
  });
  const sum = (a) => {
    let s = 0;
    for (let i = 0; i < a.length; i++) s += a[i] * ((i % 13) + 1);
    return s;
  };
  const hash = (list) => {
    let h = 0;
    for (const c of list.sort().join('|')) h = (Math.imul(h, 31) + c.charCodeAt(0)) | 0;
    return (h >>> 0).toString(16);
  };
  const r = window.__pyn.renderer;
  const spots = {};
  // Spots that stay put (the steamer moves; the rowboat only bobs on its spot).
  for (const k of ['courting', 'bridgeSheep', 'summit', 'fisherman']) if (W.spots[k]) spots[k] = [W.spots[k].x, W.spots[k].z].map((v) => +v.toFixed(2));
  return {
    meshes,
    geometry: hash([...geos].filter((g) => g.attributes.position).map((g) => `${g.attributes.position.count}:${sum(g.attributes.position.array).toFixed(2)}`)),
    instances: hash(instanced.map((m) => `${m.count}:${sum(m.instanceMatrix.array).toFixed(2)}`)),
    colliders: W.site.colliders.length,
    stations: W.stations.map((s) => s.id),
    people: W.people.length,
    followables: [W.followables.people.length, W.followables.birds.length],
    spots,
    drawCalls: r.info.render.calls,
    programs: r.info.programs.length,
  };
}

// Runs in the page: 300 s of simulated time in 0.1 s steps (rain from half-way), without drawing.
export function simulate() {
  const { W, camera, rig, state } = window.__pyn;
  state.paused = true; // the page's own loop stops advancing the world
  const houses = W.services.get('houses');
  const hikers = W.followables.people.filter((p) => p.label.startsWith('Người leo')).map((p) => p.anchor());
  const start = hikers.map((h) => h.position.clone());
  const vehicleStart = W.vehicles.map((v) => v.group.position.clone());
  const cars = W.vehicles.filter((v) => !v.spec.flies);
  const gates = W.roads.flatMap((r) => r.gates), signals = W.roads.flatMap((r) => r.signals);
  const still = cars.map(() => 0), onBranch = new Set();
  // Do two vehicles' footprints (rectangles: length × a car's or a bike's width) overlap? Separating
  // axis test on their four edge directions. (In here: only this function is sent to the page.)
  function overlap(a, b) {
    const box = (v) => {
      const h = v.group.rotation.y, w = v.length < 2.5 ? 0.35 : 0.95, k = v.k ?? 1; // (drawn k times its size)
      return { x: v.group.position.x, z: v.group.position.z, f: [Math.sin(h), Math.cos(h)], l: [Math.cos(h), -Math.sin(h)], hl: (v.length / 2) * k, hw: w * k };
    };
    const A = box(a), B = box(b);
    const dx = B.x - A.x, dz = B.z - A.z;
    for (const [ax, az] of [A.f, A.l, B.f, B.l]) {
      const reach = (o) => o.hl * Math.abs(o.f[0] * ax + o.f[1] * az) + o.hw * Math.abs(o.l[0] * ax + o.l[1] * az);
      if (Math.abs(dx * ax + dz * az) > reach(A) + reach(B)) return false;
    }
    return true;
  }
  const junctions = W.roads.flatMap((r) => r.junctions ?? []);
  const groupOf = (c) => W.roads.flatMap((r) => r.routes).find((rt) => rt.path === c.path)?.group;
  const crossedJunction = new Set();
  const road = {
    gates: gates.length, signals: signals.length, junctions: junctions.length,
    branches: W.roads.reduce((n, r) => n + r.routes.filter((rt) => rt.id === 'branch').length, 0),
    gateClosings: 0, carsAtGate: 0, carsAtRed: 0, carsOnBranch: 0, overlaps: 0, longestStop: 0, boxConflicts: 0, junctionCrossings: 0,
  };
  const wasDown = gates.map(() => false);
  // People on foot by the roads: off the carriageway except at crosswalks, onto those only on green.
  const walkers = W.people.filter((w) => w.area);
  const onCrossing = walkers.map(() => -1);
  const feet = { walkers: walkers.length, onCarriageway: 0, redCrossings: 0, crossings: 0, waits: 0 };
  const lights = { brakeLights: 0, headlightsInRain: 0 };
  // People on foot at a town's lit crossroads (features/strollers.js): onto a crosswalk only while
  // the street it crosses has red.
  const zebraAt = (x, z) => W.crosswalks.findIndex((c) => {
    const dx = x - c.x, dz = z - c.z;
    return Math.abs(dx * Math.sin(c.h) + dz * Math.cos(c.h)) < c.depth / 2 + 0.5 && Math.abs(dx * Math.cos(c.h) - dz * Math.sin(c.h)) < c.half;
  });
  const onZebra = W.pedestrians.map((w) => zebraAt(w.pos.x, w.pos.z));
  const zebra = { crosswalks: W.crosswalks.length, crossings: 0, notOnRed: 0, waits: 0 };
  // Tourists (features/tourists.js): they photograph, speak in bubbles, and stand about more than they walk.
  const tourists = W.pedestrians.filter((w) => w.person.camera);
  const lm = W.landmarks.find((l) => l.walk && l.plaza);
  const within = (poly, x, z) => {
    let in_ = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const a = poly[i], b = poly[j];
      if (a.z > z !== b.z > z && x < ((b.x - a.x) * (z - a.z)) / (b.z - a.z) + a.x) in_ = !in_;
    }
    return in_;
  };
  const nearEdge = (poly, x, z) => poly.some((a, i) => {
    const b = poly[(i + 1) % poly.length], dx = b.x - a.x, dz = b.z - a.z, t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz || 1)));
    return Math.hypot(a.x + dx * t - x, a.z + dz * t - z) < 0.3;
  });
  const tour = { count: tourists.length, outside: 0, intoTower: 0, xs: new Set(), photoing: 0, bubbles: 0, standing: 0, samples: 0, fastest: 0, speaking: new Set() };
  const lastPos = tourists.map((w) => w.pos.clone());
  const s = { people: W.people.length, houses: !!houses, boarding: 0, alighting: 0, doorOpenMax: 0, umbrellas: 0, hikers: hikers.length, hikersMoved: 0, trainStops: 0 };
  let pulled = 0; // the furthest a bus has moved over to the kerb
  // On the sea and the beach (features/seacraft.js, beach.js): boats never aground, swimmers never on dry land, nobody else in the water or on a street.
  const g = W.terrain.meshHeightAt;
  const sea = W.seacraft && { boats: W.seacraft.boats.length, aground: 0, sailed: 0, foam: !!W.seacraft.foam, parasails: W.seacraft.parasails.length, lowestFlight: Infinity, longestRope: 0 };
  const seaStart = W.seacraft ? W.seacraft.boats.map((b) => [b.x, b.z]) : [];
  const beach = W.beach && { people: W.beach.people.length, shades: W.beach.shades, roles: {}, swimmersAshore: 0, inTheWater: 0, onStreets: 0, still: [] };
  const beachLast = W.beach ? W.beach.people.map((p) => p.person.group.position.clone()) : [];
  const beachWent = beachLast.map(() => 0); // how far each has gone, all told
  if (beach) for (const p of W.beach.people) beach.roles[p.role] = (beach.roles[p.role] ?? 0) + 1;
  // Along the streets (features/streetlife.js): nobody on foot walks into a parked bike, a café table, a cart or a car.
  const life = W.streetLife;
  const street = life && { shops: life.shops, bikes: life.bikes, cars: life.cars, cafes: life.cafes, carts: life.carts, walkedInto: [] };
  const propCells = new Map();
  if (life) for (const p of life.props) for (const dx of [-1, 0, 1]) for (const dz of [-1, 0, 1]) {
    const key = `${Math.floor(p.x / 2) + dx}:${Math.floor(p.z / 2) + dz}`;
    propCells.set(key, [...(propCells.get(key) ?? []), p]);
  }
  for (let i = 0; i < 3000; i++) {
    if (i === 1500) W.weather.set('rain');
    W.update({ dt: 0.1, raw: 0.1, speed: 1, camera });
    W.lateUpdate({ raw: 0.1, camera, focus: rig.focus });
    gates.forEach((g, k) => {
      if (g.arm === 1 && !wasDown[k]) road.gateClosings++;
      wasDown[k] = g.arm === 1;
    });
    cars.forEach((c, k) => {
      still[k] = c.v < 0.05 ? still[k] + 0.1 : 0;
      road.longestStop = Math.max(road.longestStop, still[k]);
      // Out past the roundabout: routes after the first leave the ring there, after `shared` units.
      for (const r of W.roads) if (r.routes.some((rt) => rt.id === 'branch' && rt.path === c.path) && c.s > r.shared + 15 && c.s < c.path.length - 15) onBranch.add(c);
      for (let j = 0; j < k; j++) if (overlap(c, cars[j])) road.overlaps++;
      if (c.v < 0.05 && c.limit === 0) {
        if (gates.some((g) => g.active)) road.carsAtGate++;
        else if (signals.some((sg) => sg.state === 'red')) road.carsAtRed++;
      }
    });
    // Crossroads: never someone from the ring and someone from the street in the middle at once.
    for (const j of junctions) {
      const inside = cars.filter((c) => Math.hypot(c.group.position.x - j.p[0], c.group.position.z - j.p[1]) < 3.2);
      if (new Set(inside.map(groupOf)).size > 1) road.boxConflicts++;
      for (const c of inside) if (groupOf(c) !== 'ring') crossedJunction.add(c);
    }
    if (W.site.crossings.length) {
      walkers.forEach((w, k) => {
        if (!w.group.visible || w.mode) return;
        const { x, z } = w.pos;
        const c = w.area.nav.crossingAt(x, z); // the crosswalk as the walkers see it (whole nav cells)
        if (W.site.crossingAt(x, z) < 0 && W.site.roadAt(x, z) === 2) feet.onCarriageway++;
        if (c >= 0 && onCrossing[k] < 0) {
          feet.crossings++;
          if (!W.site.crossings[c].walk()) feet.redCrossings++;
        }
        onCrossing[k] = c;
        if (w.waiting) feet.waits++;
      });
    }
    if (W.crosswalks.length) {
      W.pedestrians.forEach((w, k) => {
        const c = zebraAt(w.pos.x, w.pos.z);
        if (c >= 0 && c !== onZebra[k]) {
          zebra.crossings++;
          if (W.crosswalks[c].signal.state !== 'red') zebra.notOnRed++;
        }
        onZebra[k] = c;
        if (w.waiting) zebra.waits++;
      });
    }
    for (const v of W.vehicles) if (v.kind === 'bus') pulled = Math.max(pulled, v.shift);
    if (sea && i % 10 === 0) for (const b of W.seacraft.boats) if (g(b.x, b.z) > -2.3) sea.aground++; // (WATER_Y − 0.3)
    if (sea) for (const { ski, at } of W.seacraft.parasails) {
      sea.lowestFlight = Math.min(sea.lowestFlight, (at.y + 2) / W.scale.props); // metres (props) over the water (WATER_Y −2)
      sea.longestRope = Math.max(sea.longestRope, Math.hypot(at.x - ski.x, at.y - ski.anchor.position.y, at.z - ski.z) / W.scale.props);
    }
    if (beach && i % 10 === 0) {
      for (const p of W.beach.people) {
        const { x, z } = p.person.group.position, h = g(x, z);
        const k = W.beach.people.indexOf(p);
        beachWent[k] += p.person.group.position.distanceTo(beachLast[k]);
        beachLast[k].copy(p.person.group.position);
        if (p.role === 'swimmer') {
          if (h > -2.3) beach.swimmersAshore++;
        } else {
          if (h < -2.4) beach.inTheWater++;
          if (W.site.claimAt(x, z) > 0) beach.onStreets++;
        }
      }
    }
    if (street) {
      for (const w of W.pedestrians) {
        if (!w.group.visible) continue;
        const { x, z } = w.pos;
        for (const p of propCells.get(`${Math.floor(x / 2)}:${Math.floor(z / 2)}`) ?? []) {
          if (Math.hypot(x - p.x, z - p.z) < p.r && street.walkedInto.length < 5) street.walkedInto.push(`${p.kind} at ${p.x.toFixed(1)}, ${p.z.toFixed(1)} (${Math.hypot(x - p.x, z - p.z).toFixed(2)} < ${p.r.toFixed(2)}) at ${i / 10} s`);
        }
      }
    }
    tourists.forEach((w, k) => {
      const moved = w.pos.distanceTo(lastPos[k]);
      lastPos[k].copy(w.pos);
      tour.samples++;
      if (moved < 0.002) tour.standing++;
      if (lm) {
        const { x, z } = w.pos;
        if (!w.trip && !within(lm.plaza, x, z) && !nearEdge(lm.plaza, x, z)) tour.outside++; // off the paving: through the railing, in the air
        if (within(lm.walk, x, z) && !nearEdge(lm.walk, x, z)) tour.intoTower++;
        if (i % 100 === 0) tour.xs.add(`${k}:${Math.round(x / 2)}:${Math.round(z / 2)}`); // (where each one has been, in cells of 2)
      }
      tour.fastest = Math.max(tour.fastest, moved / 0.1 / (w.group.scale.x / 0.85)); // m/s as drawn at scale k
      if (w.person.camera.scale.x > 0) tour.photoing++;
      if (w.sprite.visible) tour.speaking.add(k), tour.bubbles++;
    });
    for (const c of cars) {
      if (!c.lamps) continue;
      if (i < 1500 && c.lamps.tail[0].visible) lights.brakeLights++;
      if (i > 1600 && c.lamps.head[0].visible) lights.headlightsInRain++;
    }
    for (const w of W.people) {
      if (w.mode === 'boarding') s.boarding++;
      if (w.mode === 'alighting') s.alighting++;
    }
    if (houses && i % 10 === 0) {
      // Door leaves hang on hinge groups: rotation 0 / π when shut.
      for (const hinge of houses.group.children) {
        if (!hinge.isGroup) continue;
        for (const leaf of hinge.children) s.doorOpenMax = Math.max(s.doorOpenMax, Math.min(Math.abs(leaf.rotation.y), Math.abs(Math.PI - leaf.rotation.y)));
      }
    }
  }
  s.train = !!W.train;
  s.trainStops = W.train?.stopId ?? 0;
  s.umbrellas = W.people.filter((w) => w.person.umbrella.scale.x > 0).length;
  s.hikersMoved = hikers.filter((h, i) => h.position.distanceTo(start[i]) > 1).length;
  s.vehicles = W.vehicles.length;
  s.vehiclesMoved = W.vehicles.filter((v, i) => v.group.position.distanceTo(vehicleStart[i]) > 5).length;
  road.turned = W.vehicles.filter((v) => v.turns > 0).length; // cars that turned into another street
  road.carsOnBranch = onBranch.size;
  road.junctionCrossings = crossedJunction.size;
  road.longestStop = Math.round(road.longestStop);
  if (cars.length) s.road = { ...road, ...lights };
  if (tourists.length) s.tourists = { ...tour, xs: tour.xs.size, speaking: tour.speaking.size };
  if (W.site.crossings.length) s.feet = feet;
  if (W.crosswalks.length) s.zebra = zebra;
  if (W.busStop) s.busStop = { ...W.busStop, walks: W.busStop.walks.length, pulled: +pulled.toFixed(2) };
  if (street) s.street = street;
  if (sea) {
    sea.lowestFlight = +sea.lowestFlight.toFixed(1);
    sea.longestRope = +sea.longestRope.toFixed(1);
    sea.sailed = W.seacraft.boats.filter((b, k) => Math.hypot(b.x - seaStart[k][0], b.z - seaStart[k][1]) > 10).length;
    s.sea = sea;
  }
  if (beach) {
    // Everyone but the ones sitting under the sunshades gets about (whether or not they end up back where they began).
    beach.still = W.beach.people.flatMap((p, k) => (p.role !== 'sitter' && beachWent[k] < 3 ? [`${p.role} ${beachWent[k].toFixed(1)}`] : []));
    s.beach = beach;
  }
  W.weather.set('clear');
  return s;
}
