// @ts-check
import { Train } from '../world/train.js';

// The train (required: the cameras ride it). It calls at every stop in world.stations, in order, so
// it comes after the features that add stops.
/** @type {import('../types').Feature} */
export default {
  label: 'Đang lắp đầu máy',
  build(world) {
    const k = world.track.k; // drawn at the railway's size (world.scale.props), like the track
    const train = (world.train = new Train(world.track, { k }));
    train.tunnel = world.tunnel;
    world.scale.note('carriage', (train.cars[1].offset - train.cars[0].offset) * k, 'train');
    // Without stops it just stops by the first frame of the track now and then. The engine halts a
    // little past the middle of the platform, so the carriages line up along it.
    if (world.stations.length) train.setStops(world.stations.map((st) => ({ s: st.frame.s + 14 * k, out: st.out })));
    return {
      group: train.group,
      update: ({ dt, speed }) => train.update(dt, speed),
      lateUpdate: ({ lights }) => train.setLights(lights),
    };
  },
};
