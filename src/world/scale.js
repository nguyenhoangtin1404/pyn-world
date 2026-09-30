// @ts-check
// How big things are drawn in a world, from one place: every feature asks `world.scale` instead of
// writing sizes in units, so a world can be drawn at any scale and everything in it still fits.
//
// Two scales (as model railways do — "selective compression"):
// - the map scale `map`: units per metre for where things are — the ground, rivers, the street plan,
//   the buildings' footprints. 1 for the hand-made worlds; 1 / metersPerUnit for a world from map
//   data (Tuy Hòa: 1/9)
// - the props scale `props`: how big the models are drawn — people, vehicles, trees, trains,
//   storeys, traffic lanes. The models were made at about a unit a metre (props = 1). On a map so
//   small that people at map scale would vanish (1/9: 19 cm tall on screen at the overview), props
//   are drawn `exaggerate` (3) times bigger than the map: props = min(1, exaggerate × map). A world
//   can set it outright: cfg.scale = { props, exaggerate }.
// Map things that props must fit — a street's lanes, a building's storeys — are the bigger of the
// two: scale.fit(metres).
//
// SIZES is what things are meant to measure, in metres (the diorama's own conventions: a carriage
// shorter than life, like on a model railway). Features note what they built (scale.note), and
// scale.audit() lists whatever is more than TOLERANCE off what the props scale says it should be —
// checked for every world in tests/e2e/scale.spec.js.

export const SIZES = {
  person: 1.7, // standing height
  storey: 3.2, // floor to floor
  lane: 3.0, // one traffic lane
  car: 4.4, // a car's length
  tree: 7, // an orchard-sized tree
  gauge: 1.435, // between the rails
  carriage: 9, // a railway carriage, compressed as on a model railway (real: ~20)
};
export const TOLERANCE = 1.5; // a size may be up to this many times too big or too small

/**
 * @typedef {keyof typeof SIZES} SizeKind
 * @typedef {{ kind: SizeKind, units: number, by: string, want: number, ratio: number }} ScaleIssue
 * @typedef {ReturnType<typeof createScale>} Scale
 */

/**
 * @param {{ metersPerUnit?: number, scale?: { props?: number, exaggerate?: number } }} cfg
 */
export function createScale({ metersPerUnit = 1, scale = {} }) {
  const map = 1 / metersPerUnit;
  const props = scale.props ?? Math.min(Math.max(1, map), (scale.exaggerate ?? 3) * map);
  /** @type {{ kind: SizeKind, units: number, by: string }[]} */
  const notes = [];
  return {
    map,
    props,
    /** Metres at the map scale, in units. @param {number} m */
    m: (m) => m * map,
    /** Metres at the props scale, in units. @param {number} m */
    prop: (m) => m * props,
    /** Metres of something on the map that props must fit (a lane, a storey), in units. @param {number} m */
    fit: (m) => m * Math.max(map, props),
    /** What a thing of this kind should measure here, in units. @param {SizeKind} kind */
    want: (kind) => SIZES[kind] * props,
    /**
     * A feature says how big it drew something (for the audit).
     * @param {SizeKind} kind @param {number} units @param {string} by who drew it
     */
    note(kind, units, by) {
      if (!notes.some((n) => n.kind === kind && n.by === by && Math.abs(n.units - units) < 1e-6)) notes.push({ kind, units, by });
    },
    notes,
    /** Everything drawn more than TOLERANCE times off its size here. @returns {ScaleIssue[]} */
    audit() {
      return notes
        .map((n) => ({ ...n, want: SIZES[n.kind] * props, ratio: n.units / (SIZES[n.kind] * props) }))
        .filter((n) => n.ratio > TOLERANCE || n.ratio < 1 / TOLERANCE);
    },
  };
}
