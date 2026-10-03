import { test, expect, openWorld } from './helpers.js';

// Pictures of a few fixed views of NGHINH PHONG, compared with the ones in tests/e2e/golden/*.png:
// what the numbers of the golden files can't see — a median missing along a boulevard, a roundabout
// drawn as a disc, a rider off his bike, stripes across the tower's square. Software GL draws the
// same pixels on every machine. Nothing that moves is in the picture (QUIET): where it would be
// depends on how long the page ran before it was paused.
//
// A deliberate change of what a view shows: `npm run e2e -- visual --update-snapshots`, and look at
// the new pictures (git diff shows them) before committing.

const MATCH = { maxDiffPixelRatio: 0.002, threshold: 0.2 };

// In the page. The people, the cars (but `keep`), the birds and the balloons hidden, the world as it is.
const QUIET = (keepKind) => {
  const { W, state } = window.__pyn;
  state.paused = true;
  state.autoDay = false;
  state.hour = 12;
  W.sky.setHour(12);
  for (const w of [...W.people, ...W.pedestrians]) w.group.visible = false;
  const keep = keepKind && W.vehicles.find((c) => c.kind === keepKind);
  for (const v of W.vehicles) if (v !== keep) v.group.visible = false;
  for (const list of [W.followables.birds, W.followables.balloons]) for (const f of list) f.anchor().visible = false;
  for (const g of [W.seacraft?.group, W.beach?.group]) if (g) g.visible = false; // (boats, foam, beach people: they move)
  W.scene.traverse((o) => { if (o.isSprite) o.visible = false; });
  return keep;
};

// In the page: draw the frame now, by hand. Software GL runs the page's own loop only a few times a
// second, so waiting for it makes the picture depend on how many frames came. (Twice: the fleet puts
// the bikes where they are one frame late, after a move.)
const SETTLE = () => {
  const { W, rig, camera, post } = window.__pyn;
  rig.controls.update();
  camera.updateMatrixWorld();
  for (let i = 0; i < 60; i++) W.lateUpdate({ raw: 0.05, camera, focus: rig.focus }); // (the sky eases towards its state: let it arrive)
  post.render(W.scene, camera);
  post.render(W.scene, camera);
};
const SHOWN = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
// No panels over the picture (not a fade: a slow page would catch it half way).
const HIDE_HUD = '#hud-top, #panel, #toast { display: none !important }';

const SHOTS = {
  // The tower from the street side of its square.
  tower: ({ W }) => {
    const [x, z] = W.cfg.landmarks[0].p;
    return { at: [x - 22, 9, z + 24], to: [x + 4, 4, z] };
  },
  // A roundabout from above, its four arms and the median running up to it.
  roundabout: () => ({ at: [-52.4, 46, 49], to: [-52.4, 0, 34.6] }),
  // A boulevard (Đường Độc Lập) down its length: median, lamps, lanes, a crossing ahead.
  boulevard: ({ W }) => {
    const st = W.streets.filter((s) => s.name === 'Đường Độc Lập' && s.median).sort((a, b) => b.length - a.length)[0];
    const at = st.points[Math.floor(st.points.length * 0.3)], to = st.points[Math.floor(st.points.length * 0.3) + 30];
    const d = Math.hypot(to[0] - at[0], to[1] - at[1]);
    return { at: [at[0] - ((to[0] - at[0]) / d) * 10, 7, at[1] - ((to[1] - at[1]) / d) * 10], to: [to[0], 0, to[1]] };
  },
};

for (const name of Object.keys(SHOTS)) {
  test(`view: ${name}`, async ({ page }) => {
    await openWorld(page, 'nghinhphong');
    await page.addStyleTag({ content: HIDE_HUD });
    await page.evaluate(([quiet, src]) => {
      const { W, rig } = window.__pyn;
      new Function(`(${quiet})()`)();
      rig.setMode('overview', { fly: false });
      const shot = new Function('ctx', `return (${src})(ctx)`)({ W });
      rig.camera.position.set(...shot.at);
      rig.controls.target.set(...shot.to);
    }, [QUIET.toString(), SHOTS[name].toString()]);
    await page.evaluate(SETTLE);
    await page.evaluate(SHOWN);
    expect(await page.screenshot()).toMatchSnapshot(`${name}.png`, MATCH);
    expect(page.errors).toEqual([]);
  });
}

// A cyclist beside the camera: on the saddle, both hands on the handlebar.
test('view: cyclist', async ({ page }) => {
  await openWorld(page, 'nghinhphong');
  await page.addStyleTag({ content: HIDE_HUD });
  await page.evaluate((quiet) => {
    const { W, rig, camera } = window.__pyn;
    const v = new Function(`return (${quiet})('bicycle')`)();
    rig.setMode('overview', { fly: false });
    // On its own street (not half way round a turn), somewhere along it, standing — and with nothing left of
    // how it got there: the page ran for a while before it was paused, as many frames as it had time for, and
    // the lean, the wheels' turn and the pedals (the rider's legs) are what those frames left them at.
    if (v.turn) [v.turn, v.path, v.stops] = [null, W.cityRoutes[v.route].path, W.cityRoutes[v.route].stops];
    v.s = v.path.length * 0.2;
    v.v = 0;
    v.roll = 0;
    v.crank = 0;
    for (const w of v.wheels) w.rotation.x = 0;
    W.update({ dt: 0.001, raw: 0.001, speed: 1, camera });
    const p = v.group.position, h = v.group.rotation.y;
    // (clear of the rig's limits: near the ground and close in, it would be pushed, frame by frame)
    rig.camera.position.set(p.x + Math.cos(h) * 3.2, p.y + 1.4, p.z - Math.sin(h) * 3.2);
    rig.controls.target.set(p.x, p.y + 0.8, p.z);
  }, QUIET.toString());
  await page.evaluate(SETTLE);
  await page.evaluate(SHOWN);
  // (Just the bike and the rider: a hand off the bar is a few hundred pixels of a whole picture.)
  expect(await page.screenshot({ clip: { x: 480, y: 240, width: 320, height: 320 } })).toMatchSnapshot('cyclist.png', MATCH);
  expect(page.errors).toEqual([]);
});
