// @ts-check
import { defineGeoWorld } from './define.js';

// Tháp Nghinh Phong (Tuy Hòa, Phú Yên) and the town around it, 1 km each way: the tower on its
// square by the beach in the middle, the sea to the east, the streets and houses of the north of
// the town to the west. From real map data like TUY HÒA, but closer up — 5 m per unit (Tuy Hòa:
// 10), so the streets, the houses and the people on them are drawn bigger (world.scale.props 0.6).
// The railway runs west of it all: no train here (rail: null) — the first world without one.
// The data file is src/worlds/data/nghinhphong.json, made by tools/import/build.mjs from
// tools/import/nghinhphong.vectors.json and the map (Overture Maps, tools/import/overture.py).
export default defineGeoWorld({
  id: 'nghinhphong',
  name: 'NGHINH PHONG',
  seed: 1310,
  size: 400, // 2 km across: 5 m per unit (the data file's frame), Tháp Nghinh Phong in the middle
  data: () => import('./data/nghinhphong.json'),
  rail: null,
  cell: 1.5, // the ground in finer triangles: a smooth shore
  landcover: { fields: false }, // the town's open ground is grass, not rice paddies
  stops: [],
  landmarks: [{ model: 'nghinh-phong', place: 'nghinh-phong' }], // walkway to the sea: east (+x)
  features: [
    'landmarks', 'streets', 'buildings', 'trees', 'clouds',
    'strollers', // people on the pavements and round the square
    { id: 'citytraffic', min: 40, lights: 'all' }, // the main streets here are shorter; lights where the side streets meet them too
    { id: 'birds', gulls: 3, egrets: 1 },
  ],
});
