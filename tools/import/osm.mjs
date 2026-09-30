// OpenStreetMap → the vectors of a world data file. Input: an Overpass API answer in JSON with
// geometry (`[out:json]; … ; out geom;`) or anything with the same `elements` shape. Keeps:
// - rivers: ways tagged waterway=river (width from the `width` tag, metres, else `defaultWidth`)
// - rails: ways tagged railway=rail, joined end to end into as few lines as possible
// - places: nodes with a name and tourism / historic / railway=station / natural=peak
// Rivers and coasts that are areas (natural=water, coastline) come from the elevation data instead.

const latlon = (g) => [+g.lat.toFixed(6), +g.lon.toFixed(6)];
const slug = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/** Join polylines that share end points into longer ones. */
export function joinLines(lines) {
  const out = lines.map((l) => [...l]);
  const same = (a, b) => a[0] === b[0] && a[1] === b[1];
  for (let merged = true; merged; ) {
    merged = false;
    for (let i = 0; i < out.length && !merged; i++) {
      for (let j = 0; j < out.length && !merged; j++) {
        if (i === j) continue;
        const a = out[i], b = out[j];
        let joined = null;
        if (same(a.at(-1), b[0])) joined = [...a, ...b.slice(1)];
        else if (same(a.at(-1), b.at(-1))) joined = [...a, ...[...b].reverse().slice(1)];
        else if (same(a[0], b.at(-1))) joined = [...b, ...a.slice(1)];
        else if (same(a[0], b[0])) joined = [...[...b].reverse(), ...a.slice(1)];
        if (joined) {
          out[i] = joined;
          out.splice(j, 1);
          merged = true;
        }
      }
    }
  }
  return out;
}

export function osmToVectors(osm, { defaultWidth = 60 } = {}) {
  const ways = (osm.elements ?? []).filter((e) => e.type === 'way' && Array.isArray(e.geometry));
  const rivers = ways
    .filter((w) => w.tags?.waterway === 'river')
    .map((w) => ({ id: `river-${w.id}`, name: w.tags.name ?? `river ${w.id}`, width: parseFloat(w.tags.width) || defaultWidth, points: w.geometry.map(latlon) }));
  const rails = joinLines(ways.filter((w) => w.tags?.railway === 'rail').map((w) => w.geometry.map(latlon)))
    .sort((a, b) => b.length - a.length)
    .map((points, i) => ({ id: `rail-${i + 1}`, name: `rail ${i + 1}`, points }));
  const places = (osm.elements ?? [])
    .filter((e) => e.type === 'node' && e.tags?.name && (e.tags.tourism || e.tags.historic || e.tags.railway === 'station' || e.tags.natural === 'peak'))
    .map((n) => ({
      id: slug(n.tags.name),
      name: n.tags.name,
      kind: n.tags.railway === 'station' ? 'station' : n.tags.natural === 'peak' ? 'peak' : 'landmark',
      at: latlon(n),
    }));
  return { rivers, rails, places };
}
