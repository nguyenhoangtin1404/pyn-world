// @ts-check
import { WATER_Y } from '../../config.js';
import { smoothstep } from '../../utils.js';
import { Paint } from './paint.js';
import { ARM_OPEN, SignalProps } from './props.js';
import { trainNear } from './signals.js';
import { CROSSWALK, WalkMap } from './walkmap.js';

// What every piece of a road network (world/roads/parts/) is built with: the paint that lays asphalt
// and markings, the street furniture, the walk map for the people, the heights each layer sits at,
// the check that nothing lands on water or the railway, and the stop lines and signals the traffic
// obeys. features/road.js makes one per road, lays the pieces with it, then asks it for the system
// that works the lights and the barriers.

const RAIL_CLEAR = 6; // road edge to the middle of the track: clear of the ballast and the trains
export const SIDE = 1.6; // sidewalk width
export const COLORS = {
  asphalt: '#5a5c61',
  line: '#eeeeea',
  centre: '#f2e6c0',
  grass: '#6f9a4a',
  curb: '#f1f1ec',
  red: '#c8322b',
  pavement: '#bcb8af',
  kerb: '#9d988f',
  ballast: '#77736b',
};

/**
 * @typedef {{ pointAt(s: number): [number, number], headingAt(s: number): number }} Line
 * @typedef {(x: number, z: number) => number} HeightFn
 * @typedef {import('../vehicles/traffic.js').StopPoint} StopPoint
 * @typedef {{ id: string, path: import('../vehicles/path.js').LoopPath, group: string, start: number, stops: StopPoint[] }} Route
 * @typedef {{ s: number, p: [number, number], at: number, gate: import('./signals.js').CrossingGate,
 *   posts: ReturnType<SignalProps['crossingPost']>[] }} LevelCrossing
 */

export class RoadBuilder {
  /**
   * @param {import('../../World.js').World} world
   * @param {object} o
   * @param {string} o.id
   * @param {string} o.stopId the stop whose zone the road is in (for error messages)
   * @param {any} o.zone terrain.zones[stopId]
   * @param {number} o.width of the ring road
   * @param {ReturnType<import('./network.js').layoutRoads>} o.net
   * @param {{ from: [number, number], to: [number, number], turn: { outer: number } }[]} o.streets
   * @param {LevelCrossing[]} o.crossings where the branch runs over the railway
   */
  constructor(world, { id, stopId, zone, width, net, streets, crossings }) {
    const { terrain, track, site, batch } = world;
    this.world = world;
    this.site = site;
    this.id = id;
    this.half = width / 2;
    this.crossings = crossings;
    this.paint = new Paint();
    this.props = new SignalProps(batch);
    /** @type {Route[]} */
    this.routes = [];
    /** @type {{ walk(): boolean, heads: ReturnType<SignalProps['walkSignal']>[] }[]} */
    this.crosswalks = [];
    /** @type {{ signal: import('./signals.js').SignalCycle, heads: import('./props.js').LightHead[] }[]} */
    this.signals = [];

    // The ground under the roads, raised over the rails at a level crossing (flush with the rail
    // tops, sloping down to the ground either side) so wheels roll straight across.
    const deck = (/** @type {number} */ x, /** @type {number} */ z) => {
      let h = -Infinity;
      for (const { p } of crossings) {
        if (Math.abs(x - p[0]) > 14 || Math.abs(z - p[1]) > 14) continue;
        h = Math.max(h, track.railTop - 0.09 - Math.max(0, track.distanceTo(x, z, 12) - 2.8 * track.k) * 0.22);
      }
      return h;
    };
    /** The ground as drawn (see terrain.meshHeightAt). @type {HeightFn} */
    this.ground = terrain.meshHeightAt;
    /** @param {number} dy @returns {HeightFn} */
    this.lift = (dy) => (x, z) => Math.max(this.ground(x, z), deck(x, z)) + dy;
    // Pieces overlap where they join: each a little higher than the one it covers, marks above that.
    const lift = this.lift;
    this.h = {
      ring: lift(0.06),
      ringMark: lift(0.09),
      branch: lift(0.08),
      branchMark: lift(0.11),
      circle: lift(0.1),
      circleMark: lift(0.13),
      island: lift(0.34),
      sidewalk: lift(0.22),
    };

    // Everything on water or the railway (but for the level crossings) is a mistake in the config.
    /** @param {number} x @param {number} z */
    this.check = (x, z) => {
      const wet = terrain.heightAt(x, z) < WATER_Y + 0.4;
      const onRails = !wet && track.distanceTo(x, z, RAIL_CLEAR) < RAIL_CLEAR && !crossings.some(({ p }) => Math.hypot(x - p[0], z - p[1]) < 12);
      if (!wet && !onRails) return;
      const { a, b } = zone.local(x, z);
      const what = wet ? 'cắt qua nước' : 'đè lên đường ray';
      throw new Error(`Đường "${id}" ${what} ở a = ${a.toFixed(0)}, b = ${b.toFixed(0)} (zone của "${stopId}"): cho nó nhỏ lại bằng margin / inset`);
    };

    // Where people may walk: carriageways and sidewalks are marked as each piece is laid,
    // crosswalks with the lights.
    const half = this.half;
    const bounds = { minX: Infinity, minZ: Infinity, maxX: -Infinity, maxZ: -Infinity };
    const grow = (/** @type {[number, number]} */ [x, z], /** @type {number} */ r) => {
      bounds.minX = Math.min(bounds.minX, x - r);
      bounds.maxX = Math.max(bounds.maxX, x + r);
      bounds.minZ = Math.min(bounds.minZ, z - r);
      bounds.maxZ = Math.max(bounds.maxZ, z + r);
    };
    for (const p of net.ring.points) grow(p, half + SIDE + 1);
    if (net.circle) grow(net.circle.c, net.circle.outer + SIDE + 1);
    if (net.branch && net.turnaround) {
      grow(net.branch.from, 8);
      grow(net.turnaround.c, net.turnaround.outer + 1);
    }
    for (const st of streets) for (const T of [st.from, st.to]) grow(T, st.turn.outer + SIDE + 1);
    this.walk = new WalkMap(bounds);
    site.walkMaps.push(this.walk);
  }

  /**
   * A crosswalk across a road from s0 to s1 along `line` (a lane of `hl` either side of it):
   * zebra stripes, and a pedestrian light at each end facing across. People may start across when
   * `may()` says so (see features/villagers.js).
   * @param {Line} line @param {number} s0 @param {number} s1 @param {number} hl @param {() => boolean} may
   */
  crosswalk(line, s0, s1, hl, may) {
    const { site, paint, props, ground } = this;
    const cid = site.crossings.push({ walk: may }) - 1;
    this.walk.strip(line, s0 - 0.6, s1 + 0.6, -hl, hl, CROSSWALK, cid); // a little wider than the stripes, so whole nav cells fit
    for (let off = -hl + 0.55; off < hl - 0.4; off += 1) paint.strip(line, s0, s1, off, off + 0.5, this.lift(0.14), COLORS.line);
    const sm = (s0 + s1) / 2, [x, z] = line.pointAt(sm), h = line.headingAt(sm);
    const lx = Math.cos(h), lz = -Math.sin(h), k = hl + 0.9;
    const heads = [1, -1].map((side) => {
      const px = x + lx * k * side, pz = z + lz * k * side;
      site.colliders.push({ x: px, z: pz, r: 0.2 });
      return props.walkSignal(px, ground(px, pz), pz, Math.atan2(lx * side, lz * side));
    });
    this.crosswalks.push({ walk: may, heads });
  }

  /**
   * A stop line at p (a lane `hl` either side of it), on every route through it; returns the
   * heading there, or null if no route goes through. Set `routes` first.
   * @param {[number, number]} p
   * @param {number} hl
   * @param {StopPoint['blocked']} blocked
   * @param {(path: import('../vehicles/path.js').LoopPath, s: number) => void} [draw] markings, drawn once
   */
  stopLine(p, hl, blocked, draw) {
    let heading = null;
    for (const r of this.routes) {
      const { s, d } = r.path.nearest(p[0], p[1]);
      if (d > 1) continue;
      r.stops.push({ s, blocked });
      if (heading === null) {
        heading = r.path.headingAt(s);
        (draw ?? ((path, s) => this.paint.strip(path, s - 0.45, s, -hl + 0.1, hl - 0.1, this.lift(0.14), COLORS.line)))(r.path, s);
      }
    }
    return heading;
  }

  /**
   * A traffic light (and a collider round its pole) at p for traffic coming along heading h.
   * @param {[number, number]} p @param {number} h
   */
  trafficLight([x, z], h) {
    this.site.colliders.push({ x, z, r: 0.3 });
    return this.props.trafficLight(x, this.ground(x, z), z, h);
  }

  /**
   * Everything painted, into the world's static batch; the lamps and arms; and the system that
   * works the pedestrian lights, the traffic lights and the level-crossing barriers every frame.
   * @returns {import('../../types').System}
   */
  finish() {
    const { world, crosswalks, signals, crossings } = this;
    world.batch.at(0, 0, 0, 0).add(this.paint.geometry() ?? []);
    const group = this.props.build();
    const trainLength = () => (world.train ? world.train.length : 0);
    return {
      group,
      update({ dt }) {
        for (const { walk: may, heads } of crosswalks) {
          const ok = may();
          for (const head of heads) {
            head.walk.visible = ok;
            head.stop.visible = !ok;
          }
        }
        for (const { signal, heads } of signals) {
          signal.update(dt);
          const st = signal.state;
          for (const head of heads) for (const c of /** @type {const} */ (['red', 'yellow', 'green'])) head[c].visible = st === c;
        }
        for (const xing of crossings) {
          xing.gate.update(dt, !!world.train && trainNear(world.train, trainLength(), xing.at, world.track.length));
          const lit = xing.gate.lamp;
          const raise = ARM_OPEN * (1 - smoothstep(0, 1, xing.gate.arm));
          for (const post of xing.posts) {
            post.lamps.forEach((l, i) => (l.visible = lit === i));
            post.pivot.rotation.z = raise;
          }
        }
      },
    };
  }
}

/**
 * The parts of [from, to] outside the holes.
 * @param {number} from @param {number} to @param {number[][]} holes
 * @returns {number[][]}
 */
export function spans(from, to, holes) {
  let out = [[from, to]];
  for (const [h0, h1] of holes) out = out.flatMap(([a, b]) => (h1 <= a || h0 >= b ? [[a, b]] : [[a, h0], [h1, b]].filter(([x, y]) => y - x > 0.5)));
  return out;
}
