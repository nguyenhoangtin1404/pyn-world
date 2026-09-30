// @ts-check
// From the real world to the diorama and back: latitude/longitude (degrees) ↔ world (x, z) units.
// A local equirectangular projection round a centre point — at the few kilometres a diorama covers,
// indistinguishable from the real thing. North is -z (away from the default camera), east is +x.
// Heights in metres become units the same way, times `verticalScale` (low hills flatten out on a
// small diorama; exaggerating them keeps the lie of the land visible).

const EARTH = 6371008.8; // mean radius, metres
const RAD = Math.PI / 180;

/**
 * @typedef {{ center: [number, number], metersPerUnit: number, verticalScale?: number }} GeoFrame
 * @typedef {ReturnType<typeof createProjection>} Projection
 */

/**
 * @param {GeoFrame} frame centre [lat, lon] in degrees; how many metres one world unit is
 */
export function createProjection({ center: [lat0, lon0], metersPerUnit, verticalScale = 1 }) {
  if (!(metersPerUnit > 0)) throw new Error(`metersPerUnit phải > 0 (đang là ${metersPerUnit})`);
  const mPerLat = EARTH * RAD; // metres per degree of latitude
  const mPerLon = EARTH * RAD * Math.cos(lat0 * RAD); // … of longitude, at the centre
  return {
    center: /** @type {[number, number]} */ ([lat0, lon0]),
    metersPerUnit,
    verticalScale,
    /**
     * World (x, z) of a point.
     * @param {number} lat @param {number} lon
     * @returns {[number, number]}
     */
    toWorld(lat, lon) {
      return [((lon - lon0) * mPerLon) / metersPerUnit, ((lat0 - lat) * mPerLat) / metersPerUnit];
    },
    /**
     * [lat, lon] of a world point.
     * @param {number} x @param {number} z
     * @returns {[number, number]}
     */
    toLatLon(x, z) {
      return [lat0 - (z * metersPerUnit) / mPerLat, lon0 + (x * metersPerUnit) / mPerLon];
    },
    /** A height in metres, in world units (exaggerated). @param {number} m */
    height(m) {
      return (m / metersPerUnit) * verticalScale;
    },
    /** A length on the ground in metres, in world units. @param {number} m */
    length(m) {
      return m / metersPerUnit;
    },
  };
}
