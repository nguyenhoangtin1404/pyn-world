// @ts-check
import { defineGeoWorld } from './define.js';

// Tuy Hòa (Phú Yên), from real map data: the ground is SRTM elevation, the coast is where it meets
// the sea, the Đà Rằng river runs out to the sea in the south, Núi Nhạn stands on its north bank
// and the North–South railway crosses the map with Tuy Hòa station on it. The data file is
// src/worlds/data/tuyhoa.json, made by tools/import/build.mjs from tools/import/tuyhoa.vectors.json
// (the river, railway and places there are traced by hand for now — approximate).
// Landmarks (src/landmarks/): Tháp Nghinh Phong on its square by the beach, Tháp Nhạn on the top
// of Núi Nhạn. The ground is coloured and planted by land cover (world/landcover.js): sand and a
// casuarina belt along the coast, rice fields on the low land, woods on the hills, the town kept
// clear for its streets and houses (next). The sun crosses the sky as it does at 13° N.
export default defineGeoWorld({
  id: 'tuyhoa',
  name: 'TUY HÒA',
  seed: 1302,
  size: 600, // 5.4 km across: 9 m per unit (the data file's frame)
  data: () => import('./data/tuyhoa.json'),
  rail: 'bac-nam',
  stops: [{ id: 'tuyhoa', place: 'ga-tuy-hoa', name: 'TUY HÒA', yard: true }],
  landmarks: [
    { model: 'nghinh-phong', place: 'nghinh-phong' }, // walkway to the sea: east (+x)
    { model: 'thap-nhan', place: 'thap-nhan', peak: 25, rotation: 0 }, // door east, on the summit
  ],
  landcover: { town: [{ at: [13.0945, 109.3130], radius: 1100 }] },
  features: ['station', 'landmarks', 'trees', 'clouds', 'train', 'birds'],
});
