// @ts-check
import { defineGeoWorld } from './define.js';

// Tuy Hòa (Phú Yên), from real map data: the ground is SRTM elevation, the coast is where it meets
// the sea, the Đà Rằng river runs out to the sea in the south, Núi Nhạn stands on its north bank
// and the North–South railway crosses the map with Tuy Hòa station on it. The data file is
// src/worlds/data/tuyhoa.json, made by tools/import/build.mjs from tools/import/tuyhoa.vectors.json
// (the river, railway and places there are traced by hand for now — approximate).
// A first draft (phase 0): the ground, the water, the railway and its train. Tháp Nghinh Phong and
// the town come next.
export default defineGeoWorld({
  id: 'tuyhoa',
  name: 'TUY HÒA',
  seed: 1302,
  size: 600, // 5.4 km across: 9 m per unit (the data file's frame)
  data: () => import('./data/tuyhoa.json'),
  rail: 'bac-nam',
  stops: [{ id: 'tuyhoa', place: 'ga-tuy-hoa', name: 'TUY HÒA', yard: true }],
  features: ['station', 'trees', 'clouds', 'train', 'birds'],
});
