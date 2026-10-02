import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { box, ball, cyl, torus, keep } from '../lowpoly.js';

// What each kind of vehicle looks like and how it moves. Every vehicle faces local +z with y = 0 on
// the ground (or, for the plane, at its belly). `body()` is one geometry for everything rigid;
// parts painted PAINT take each vehicle's own colour (the Instancer tints them — other colours are
// darkened by the tint too, so glass and tyres stay dark). Wheels are separate so they can turn.
//
//   wheels: [x, y, z] centres (radius `wheelR`), rider: where a Person sits (bicycle, motorbike),
//   speed: [min, max] cruising speed (units/s), length (for keeping distance), colors: paint choices,
//   lamps: { head, tail } — where the head and tail lights are, lit by the fleet at night (and the
//   tail lights when braking).

export const PAINT = '#ffffff';
const GLASS = '#2d3a48';
const TYRE = '#1f1d1c';
const DARK = '#2b2522';
const CHROME = '#b9bec4';
const LAMP = '#fff4d6';
const TAIL = '#c8453a';
const ALONG = { rx: Math.PI / 2 }; // cylinder axis along the vehicle
const ACROSS = { rz: Math.PI / 2 }; // cylinder axis across it

// Front and rear lights, bumpers — the same on every road vehicle, sized to it.
function lightsAndBumpers(w, y, zFront, zBack) {
  return [
    box(w * 0.18, 0.12, 0.05, LAMP, [-w * 0.34, y, zFront + 0.02]),
    box(w * 0.18, 0.12, 0.05, LAMP, [w * 0.34, y, zFront + 0.02]),
    box(w * 0.14, 0.1, 0.05, TAIL, [-w * 0.36, y, zBack - 0.02]),
    box(w * 0.14, 0.1, 0.05, TAIL, [w * 0.36, y, zBack - 0.02]),
    box(w * 1.02, 0.16, 0.12, DARK, [0, y - 0.18, zFront]),
    box(w * 1.02, 0.16, 0.12, DARK, [0, y - 0.18, zBack]),
  ];
}

// Where lightsAndBumpers() puts the lamps, for lighting them up.
const lampsAt = (w, y, zFront, zBack) => ({
  head: [[-w * 0.34, y, zFront + 0.06], [w * 0.34, y, zFront + 0.06]],
  tail: [[-w * 0.36, y, zBack - 0.06], [w * 0.36, y, zBack - 0.06]],
});

// A glass band round a cabin: slightly wider and longer than the painted block so it shows on all
// four sides, and lower than it so the roof and the sills stay painted.
const windows = (w, h, d, [x, y, z]) => box(w + 0.04, h, d + 0.04, GLASS, [x, y, z]);

export const KINDS = {
  bicycle: {
    label: 'Xe đạp',
    wheelR: 0.34,
    wheels: [[0, 0.34, 0.52], [0, 0.34, -0.52]],
    rider: { seat: [0, 0.98, -0.18], lean: 0.4, pedal: true, bar: [0.95, 0.4] }, // (hips on the saddle, hands on the handlebar)
    speed: [3.5, 5],
    length: 1.8,
    colors: ['#c8453a', '#2f5d7c', '#e0a64a', '#6d8b3a', '#8e5aa8'],
    body: () => [
      cyl(0.022, 0.022, 0.62, PAINT, [0, 0.62, 0.05], { rx: Math.PI / 2 - 0.25 }, 5), // top tube
      cyl(0.022, 0.022, 0.72, PAINT, [0, 0.52, -0.02], { rx: 0.95 }, 5), // down tube
      cyl(0.022, 0.022, 0.6, PAINT, [0, 0.62, -0.2], { rx: -0.2 }, 5), // seat tube
      cyl(0.018, 0.018, 0.55, PAINT, [0, 0.46, -0.36], { rx: -1.05 }, 5), // chain stay
      cyl(0.02, 0.02, 0.6, CHROME, [0, 0.62, 0.48], { rx: -0.25 }, 5), // fork
      cyl(0.015, 0.015, 0.5, DARK, [0, 0.95, 0.4], ACROSS, 5), // handlebar
      box(0.1, 0.05, 0.22, DARK, [0, 0.95, -0.2]), // saddle
      cyl(0.07, 0.07, 0.04, CHROME, [0, 0.36, -0.08], ACROSS, 8), // chainring
      box(0.08, 0.07, 0.06, LAMP, [0, 0.86, 0.5]), // lamp on the handlebar
      box(0.08, 0.06, 0.03, TAIL, [0, 0.72, -0.56]), // rear light
    ],
    lamps: { head: [[0, 0.86, 0.54]], tail: [[0, 0.72, -0.58]] },
    // Rim in the wheel's plane (y, z), two spokes across it; the wheel turns about x.
    wheel: (r) => [torus(r, 0.03, TYRE, [0, 0, 0], { ry: Math.PI / 2 }), box(0.02, r * 1.9, 0.02, CHROME), box(0.02, 0.02, r * 1.9, CHROME)],
  },

  motorbike: {
    label: 'Xe máy',
    wheelR: 0.3,
    wheels: [[0, 0.3, 0.62], [0, 0.3, -0.6]],
    rider: { seat: [0, 0.82, -0.2], lean: 0.4, pedal: false, bar: [1.02, 0.46] },
    speed: [7, 10],
    length: 2.0,
    colors: ['#c8453a', '#2f5d7c', '#1f1d1c', '#e0a64a', '#f4f1ea'],
    body: () => [
      box(0.34, 0.28, 0.5, PAINT, [0, 0.72, 0.18]), // tank
      box(0.3, 0.1, 0.6, DARK, [0, 0.78, -0.25]), // seat
      box(0.3, 0.3, 0.5, DARK, [0, 0.45, -0.05]), // engine
      cyl(0.05, 0.05, 0.6, CHROME, [0.18, 0.35, -0.45], ALONG, 6), // exhaust
      cyl(0.03, 0.03, 0.6, CHROME, [0, 0.72, 0.5], { rx: -0.35 }, 5), // fork
      cyl(0.02, 0.02, 0.62, DARK, [0, 1.02, 0.46], ACROSS, 5), // handlebar
      box(0.16, 0.12, 0.06, LAMP, [0, 0.88, 0.62]), // headlight
      box(0.3, 0.06, 0.4, PAINT, [0, 0.62, 0.62]), // front mudguard
      box(0.3, 0.08, 0.4, PAINT, [0, 0.62, -0.6]), // rear mudguard
      box(0.12, 0.06, 0.04, TAIL, [0, 0.68, -0.82]),
    ],
    lamps: { head: [[0, 0.88, 0.66]], tail: [[0, 0.68, -0.85]] },
    wheel: (r) => [cyl(r, r, 0.12, TYRE, [0, 0, 0], ACROSS, 12), cyl(r * 0.55, r * 0.55, 0.14, CHROME, [0, 0, 0], ACROSS, 10)],
  },

  car: {
    label: 'Ô tô',
    wheelR: 0.34,
    wheels: [[-0.8, 0.34, 1.3], [0.8, 0.34, 1.3], [-0.8, 0.34, -1.3], [0.8, 0.34, -1.3]],
    speed: [8, 12],
    length: 4.2,
    colors: ['#c8453a', '#2f5d7c', '#f4f1ea', '#e0a64a', '#6d8b3a', '#3a3f4a', '#8fb8d8'],
    body: () => [
      box(1.7, 0.55, 4.0, PAINT, [0, 0.62, 0]), // lower body
      box(1.5, 0.52, 2.2, PAINT, [0, 1.15, -0.25]), // cabin
      windows(1.5, 0.34, 2.2, [0, 1.1, -0.25]),
      box(1.52, 0.06, 2.22, PAINT, [0, 1.42, -0.25]), // roof edge
      ...lightsAndBumpers(1.7, 0.72, 2.0, -2.0),
      box(0.05, 0.1, 0.18, DARK, [0.86, 0.95, 0.75]), // mirrors
      box(0.05, 0.1, 0.18, DARK, [-0.86, 0.95, 0.75]),
    ],
    lamps: lampsAt(1.7, 0.72, 2.0, -2.0),
    wheel: carWheel,
  },

  pickup: {
    label: 'Xe bán tải',
    wheelR: 0.4,
    wheels: [[-0.85, 0.4, 1.55], [0.85, 0.4, 1.55], [-0.85, 0.4, -1.45], [0.85, 0.4, -1.45]],
    speed: [8, 11],
    length: 5.0,
    colors: ['#c8453a', '#2f5d7c', '#f4f1ea', '#6d8b3a', '#a8744a'],
    body: () => [
      box(1.8, 0.6, 4.8, PAINT, [0, 0.8, 0]), // chassis and sides
      box(1.66, 0.62, 1.6, PAINT, [0, 1.41, 0.55]), // cab
      windows(1.66, 0.36, 1.6, [0, 1.38, 0.55]),
      box(1.7, 0.4, 0.08, PAINT, [0, 1.3, -2.36]), // tailgate
      box(0.08, 0.4, 2.2, PAINT, [0.86, 1.3, -1.2]), // bed walls
      box(0.08, 0.4, 2.2, PAINT, [-0.86, 1.3, -1.2]),
      box(1.62, 0.04, 2.2, DARK, [0, 1.11, -1.2]), // bed floor
      box(0.9, 0.25, 0.7, '#a8744a', [0.2, 1.25, -1.1]), // a crate in the back
      ...lightsAndBumpers(1.8, 0.9, 2.4, -2.4),
    ],
    lamps: lampsAt(1.8, 0.9, 2.4, -2.4),
    wheel: carWheel,
  },

  truck: {
    label: 'Xe tải',
    wheelR: 0.5,
    wheels: [[-0.95, 0.5, 2.5], [0.95, 0.5, 2.5], [-0.95, 0.5, -1.4], [0.95, 0.5, -1.4], [-0.95, 0.5, -2.6], [0.95, 0.5, -2.6]],
    speed: [6, 9],
    length: 7.4,
    colors: ['#c8453a', '#2f5d7c', '#e0a64a', '#f4f1ea', '#6d8b3a'],
    body: () => [
      box(2.0, 0.4, 7.2, DARK, [0, 0.75, 0]), // frame
      box(2.1, 1.6, 1.9, PAINT, [0, 1.75, 2.55]), // cab
      windows(2.1, 0.6, 1.9, [0, 2.1, 2.55]),
      box(2.1, 0.25, 0.1, CHROME, [0, 1.15, 3.52]), // grille
      box(2.3, 2.3, 4.9, '#e9e6df', [0, 2.2, -1.1]), // cargo box
      box(2.32, 0.2, 4.92, PAINT, [0, 3.25, -1.1]), // painted stripe along the top
      ...lightsAndBumpers(2.1, 1.1, 3.55, -3.6),
    ],
    lamps: lampsAt(2.1, 1.1, 3.55, -3.6),
    wheel: carWheel,
  },

  bus: {
    label: 'Xe buýt',
    wheelR: 0.5,
    wheels: [[-1.05, 0.5, 3.4], [1.05, 0.5, 3.4], [-1.05, 0.5, -3.2], [1.05, 0.5, -3.2]],
    speed: [6, 8],
    length: 10.6,
    colors: ['#2f8f5b', '#c8453a', '#2f5d7c', '#e0a64a'],
    body: () => [
      box(2.5, 2.3, 10.4, PAINT, [0, 1.75, 0]), // body
      box(2.52, 0.5, 10.42, '#f4f1ea', [0, 0.9, 0]), // pale skirt along the bottom
      windows(2.5, 0.8, 10.4, [0, 2.2, 0]), // side windows
      box(2.3, 1.0, 0.1, GLASS, [0, 2.2, 5.22]), // windscreen
      box(2.3, 0.3, 0.1, '#ffd25a', [0, 2.95, 5.22]), // destination board
      box(2.4, 0.18, 10.2, '#e9e6df', [0, 2.95, 0]), // roof panel
      box(0.9, 0.25, 1.4, '#e9e6df', [0, 3.13, -2.6]), // air-conditioner
      box(0.06, 1.7, 1.3, DARK, [1.27, 1.45, 3.0]), // doors
      box(0.06, 1.7, 1.3, DARK, [1.27, 1.45, -1.2]),
      ...lightsAndBumpers(2.5, 0.85, 5.2, -5.2),
      box(0.06, 0.28, 0.3, DARK, [1.4, 2.3, 4.7]), // mirrors
      box(0.06, 0.28, 0.3, DARK, [-1.4, 2.3, 4.7]),
    ],
    lamps: lampsAt(2.5, 0.85, 5.2, -5.2),
    wheel: carWheel,
  },

  plane: {
    label: 'Máy bay',
    wheelR: 0,
    wheels: [],
    speed: [22, 28],
    length: 8,
    colors: ['#f4f1ea', '#c8453a', '#2f5d7c', '#e0a64a'],
    flies: true,
    body: () => [
      cyl(0.55, 0.3, 6.2, PAINT, [0, 0, -0.4], ALONG, 10), // fuselage, tapering to the tail
      ball(0.56, PAINT, [0, 0, 2.7], { sz: 1.3 }), // nose
      box(0.9, 0.45, 1.4, GLASS, [0, 0.42, 1.2]), // cockpit
      box(9.0, 0.12, 1.4, PAINT, [0, 0.15, 0.6]), // wings
      box(9.02, 0.13, 0.25, '#c8453a', [0, 0.15, 0.05]), // trailing stripe
      box(3.2, 0.08, 0.9, PAINT, [0, 0.25, -3.2]), // tailplane
      box(0.1, 1.3, 1.0, PAINT, [0, 0.85, -3.3], { rx: -0.25 }), // fin
      box(0.12, 0.1, 0.9, '#c8453a', [0, 1.45, -3.45]),
      cyl(0.04, 0.04, 0.7, DARK, [0.7, -0.5, 0.9]), // landing gear
      cyl(0.04, 0.04, 0.7, DARK, [-0.7, -0.5, 0.9]),
      cyl(0.18, 0.18, 0.1, TYRE, [0.7, -0.85, 0.9], ACROSS, 8),
      cyl(0.18, 0.18, 0.1, TYRE, [-0.7, -0.85, 0.9], ACROSS, 8),
    ],
    // Spinning propeller at the nose, and navigation lights at the wing tips (drawn unlit, so
    // they show at night): red on the left, green on the right.
    propeller: [0, 0, 3.45],
    prop: () => [box(0.12, 2.2, 0.06, DARK), ball(0.14, CHROME, [0, 0, 0.05])],
    lights: () => [ball(0.14, '#ff3b30', [-4.55, 0.15, 0.6], {}, 0), ball(0.14, '#34c759', [4.55, 0.15, 0.6], {}, 0), ball(0.1, '#ffffff', [0, 1.55, -3.8], {}, 0)],
  },
};

function carWheel(r) {
  return [cyl(r, r, 0.26, TYRE, [0, 0, 0], ACROSS, 12), cyl(r * 0.55, r * 0.55, 0.28, CHROME, [0, 0, 0], ACROSS, 8), box(0.3, r * 0.9, 0.12, DARK)];
}

// Geometries are built once per kind and shared by every world (hence keep()).
const cache = new Map();
export function kindGeometry(id, part) {
  const key = `${id}|${part}`;
  if (!cache.has(key)) {
    const k = KINDS[id];
    const parts = part === 'body' ? k.body() : part === 'wheel' ? k.wheel(k.wheelR) : k[part]();
    cache.set(key, keep(mergeGeometries(parts)));
  }
  return cache.get(key);
}
