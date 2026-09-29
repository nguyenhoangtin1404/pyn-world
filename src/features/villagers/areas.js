import { NavGrid } from '../../world/nav.js';

// One area per station (world.stations) that has somewhere to go: a nav grid around its homes and
// platform, and the places people stop at — homes (indoors) and spots on the platform, where they
// stand facing the track. Sets station.nav (the pigeons use it).
export function buildAreas(world) {
  const { track, site, size } = world;
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
    const nav = new NavGrid(b, site.walkHeight, site.colliders);
    // Snap every stop onto a walkable cell, and keep only stops reachable from the platform.
    let stops = rawStops.map((s) => ({ ...s, p: nav.nearestFree(s.p.x, s.p.z) })).filter((s) => s.p);
    const anchor = stops.find((s) => s.face != null) || stops[0];
    const main = nav.regionAt(anchor.p.x, anchor.p.z);
    stops = stops.filter((s) => nav.regionAt(s.p.x, s.p.z) === main);
    areas.push({ index, nav, stops, platformStops: stops.filter((s) => s.face != null), out: st.out, platformY: st.point(0.5, 0.5).y });
    st.nav = nav; // the pigeons on the platform use it
  });
  return areas;
}

// Where a person goes next within their area, and how they get there.
export function planner(rng) {
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
  return { pickStop, plan };
}
