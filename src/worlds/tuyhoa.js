// @ts-check
import { defineGeoWorld } from './define.js';

// Tuy Hòa (Phú Yên), from real map data: the ground is SRTM elevation, the coast is where it meets
// the sea, the Đà Rằng river runs out to the sea in the south, Núi Nhạn stands on its north bank
// and the North–South railway crosses the map with Tuy Hòa station on it. The data file is
// src/worlds/data/tuyhoa.json, made by tools/import/build.mjs from tools/import/tuyhoa.vectors.json
// and the map (Overture Maps, tools/import/overture.py): the railway, 1 000 streets, 31 000
// buildings, the river and the lakes are real; the places are set by hand and checked against the
// map's named places when the file is built (checkPlaces).
// Landmarks (src/landmarks/): Tháp Nghinh Phong on its square by the beach, Tháp Nhạn on the top
// of Núi Nhạn. The ground is coloured and planted by land cover (world/landcover.js): sand and a
// casuarina belt along the coast, rice fields on the low land, woods on the hills, the town where
// the houses stand close. The streets and the houses (features/streets.js, buildings.js) come
// before the trees, which keep off them. The sun crosses the sky as it does at 13° N.
export default defineGeoWorld({
  id: 'tuyhoa',
  name: 'TUY HÒA',
  tagline: 'PHÚ YÊN · TỪ BẢN ĐỒ THẬT',
  seed: 1302,
  size: 600, // 6 km across: 10 m per unit (the data file's frame), from Tháp Nghinh Phong in the north to the Đà Rằng in the south
  data: () => import('./data/tuyhoa.json'),
  rail: 'duong-sat-bac-nam',
  stops: [{ id: 'tuyhoa', place: 'ga-tuy-hoa', name: 'TUY HÒA', yard: true }],
  landmarks: [
    { model: 'nghinh-phong', place: 'nghinh-phong' }, // walkway to the sea: east (+x)
    { model: 'thap-nhan', place: 'thap-nhan', peak: 6, rotation: 0 }, // door east, on the summit
  ],
  features: [
    'station', 'landmarks', 'streets', 'buildings', 'trees', 'clouds', 'train',
    'strollers', // people on the pavements and round the Nghinh Phong square
    'citytraffic', // motorbikes, bicycles, cars and lorries on the main streets
    { id: 'birds', gulls: 2, egrets: 2 },
  ],
});
