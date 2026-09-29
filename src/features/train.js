// @ts-check
import { Train } from '../world/train.js';

// The train (required: the cameras ride it). It calls at every stop in world.stations, in order, so
// it comes after the features that add stops.
/** @type {import('../types').Feature} */
export default {
  label: 'Đang lắp đầu máy',
  build(world) {
    const train = (world.train = new Train(world.track));
    train.tunnel = world.tunnel;
    // Without stops it just stops by the first frame of the track now and then.
    if (world.stations.length) train.setStops(world.stations.map((st) => ({ s: st.frame.s + 14, out: st.out })));
    return {
      group: train.group,
      update: ({ dt, speed }) => train.update(dt, speed),
      lateUpdate: ({ lights }) => train.setLights(lights),
    };
  },
};
