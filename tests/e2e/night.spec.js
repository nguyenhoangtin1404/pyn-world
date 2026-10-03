import { test, expect, openWorld } from './helpers.js';

// A night in NGHINH PHONG (world/night.js), with the clock running as in the app (an hour every 10 s) and the
// camera where it starts: from 22:00 fewer people and less traffic, after midnight everyone goes home, from
// 1:00 only the two night owls are out and no vehicle; by 8:00 they are all back. After dark the fishing boats'
// squid lamps and the coasters' lights are on.
test('night: the town goes home, two night owls stay out, everyone back in the morning', async ({ page }) => {
  await openWorld(page, 'nghinhphong');
  const r = await page.evaluate(() => {
    const { W, camera, rig, state } = window.__pyn;
    state.paused = true; // (the clock is run here)
    const shown = (o) => {
      for (; o; o = o.parent) if (!o.visible) return false;
      return true;
    };
    // Everyone on the map is a figure (a SkinnedMesh): on foot, on a bike, in a parasail.
    const count = () => {
      let people = 0;
      W.scene.traverse((o) => {
        if (o.isSkinnedMesh && shown(o)) people++;
      });
      return { people, vehicles: W.vehicles.filter((v) => !v.spec.flies && !v.away).length };
    };
    const marks = { 21: count() };
    let h = 21, lamps = null, overlaps = 0;
    for (let i = 0; i < 1100; i++) {
      h = (h + 0.01) % 24;
      W.sky.setHour(h);
      W.update({ dt: 0.1, raw: 0.1, speed: 1, camera });
      W.lateUpdate({ raw: 0.1, camera, focus: rig.focus });
      for (const m of [23.5, 1, 3, 8]) if (Math.abs(h - m) < 0.005) marks[m] = count();
      if (Math.abs(h - 22) < 0.005) lamps = W.seacraft.group.children.filter((o) => o.isInstancedMesh && o.visible).length;
      // Back in the morning: nobody comes back on top of someone else on their street.
      if (h > 5 && h < 8) {
        const on = W.vehicles.filter((v) => !v.spec.flies && !v.away);
        for (let a = 0; a < on.length; a++) for (let b = 0; b < a; b++) if (on[a].group.position.distanceTo(on[b].group.position) < 0.3 * W.scale.props) overlaps++;
      }
    }
    return { marks, lamps, dayLamps: (W.sky.setHour(12), W.lateUpdate({ raw: 0.1, camera, focus: rig.focus }), W.seacraft.group.children.filter((o) => o.isInstancedMesh && o.visible).length), overlaps };
  });
  const why = (what) => `${what} — ${JSON.stringify(r)}`;
  const { marks } = r;
  expect(marks[23.5].people, why('fewer people out late in the evening')).toBeLessThan(marks[21].people * 0.6);
  expect(marks[23.5].vehicles, why('…and less traffic')).toBeLessThan(marks[21].vehicles * 0.5);
  expect(marks[1].people, why('at 1:00 only the night owls are out')).toBeLessThanOrEqual(2);
  expect(marks[1].people, why('…but they are')).toBeGreaterThan(0);
  expect(marks[1].vehicles, why('…and no traffic')).toBe(0);
  expect(marks[3], why('…all night')).toEqual(marks[1]);
  expect(marks[8].people, why('everyone back by morning')).toBeGreaterThan(marks[21].people * 0.9);
  expect(marks[8].vehicles, why('…the traffic too')).toBe(marks[21].vehicles);
  expect(r.overlaps, why('no vehicle comes back on top of another')).toBe(0);
  expect(r.lamps, why('the boats light up after dark')).toBeGreaterThan(r.dayLamps);
  expect(page.errors).toEqual([]);
});
