// Screenshots for the README (docs/media/*.png): `npx vite --port 5233` in another terminal, then
// `node tools/readme/shoot.mjs [name…]`. Each shot opens a world, sets the hour and the camera, and
// draws a few seconds of the world as it runs (people, cars, birds in the picture).
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const BASE = process.env.BASE ?? 'http://localhost:5233';
const OUT = new URL('../../docs/media/raw/', import.meta.url);
mkdirSync(OUT, { recursive: true });
const SIZE = { width: 1600, height: 900 };
const GPU = process.env.SOFTWARE ? ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] : ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'];

// at/to: camera position and target, as a function of the world (run in the page).
export const SHOTS = {
  tower: { world: 'nghinhphong', hour: 16.5, quiet: true, cam: `({ W }) => { const [x, z] = W.cfg.landmarks[0].p; return { at: [x - 30, 14, z + 34], to: [x + 3, 6, z] }; }` },
  towerNight: { world: 'nghinhphong', hour: 20.5, quiet: true, cam: `({ W }) => { const [x, z] = W.cfg.landmarks[0].p; return { at: [x - 30, 14, z + 34], to: [x + 3, 6, z] }; }` },
  // The same at night, the tower off to the right (the title goes on the left).
  hero: { world: 'nghinhphong', hour: 20.5, quiet: true, cam: `({ W }) => { const [x, z] = W.cfg.landmarks[0].p; return { at: [x - 38, 12, z + 22], to: [x - 6, 7, z - 11] }; }` },
  city: { world: 'nghinhphong', hour: 16.8, cam: `({ W }) => { const [x, z] = W.cfg.landmarks[0].p; return { at: [x - 85, 48, z + 85], to: [x + 10, 0, z - 5] }; }` },
  beach: { world: 'nghinhphong', hour: 10, cam: `({ W }) => { const [x, z] = W.cfg.landmarks[0].p; return { at: [x + 22, 7, z - 18], to: [x + 70, 0, z + 20] }; }` },
  boulevard: { world: 'nghinhphong', hour: 9.5, cam: `({ W }) => { const st = W.streets.filter((s) => s.name === 'Đường Độc Lập' && s.median).sort((a, b) => b.length - a.length)[0]; const i = Math.floor(st.points.length * 0.3); const a = st.points[i], b = st.points[i + 30]; const d = Math.hypot(b[0] - a[0], b[1] - a[1]); return { at: [a[0] - ((b[0] - a[0]) / d) * 12, 9, a[1] - ((b[1] - a[1]) / d) * 12], to: [b[0], 0, b[1]] }; }` },
  pyn: { world: 'pyn', hour: 15, cam: null },
  pynSunset: { world: 'pyn', hour: 18.2, cam: null, mode: 'train' },
  tuyhoa: { world: 'tuyhoa', hour: 16, cam: null },
};

const names = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(SHOTS);
const browser = await chromium.launch({ args: GPU });
for (const name of names) {
  const shot = SHOTS[name];
  const page = await browser.newPage({ viewport: SIZE });
  page.on('pageerror', (e) => console.error(name, e.message));
  await page.goto(`${BASE}/?world=${shot.world}&clock=fast`);
  await page.waitForFunction((id) => window.__pyn?.W?.cfg.id === id && document.getElementById('loading').classList.contains('done'), shot.world, { timeout: 300_000 });
  await page.addStyleTag({ content: '#hud-top, #panel, #toast, #credits, .toast { display: none !important }' });
  await page.evaluate(([hour, cam, mode, quiet]) => {
    const { W, rig, state } = window.__pyn;
    if (quiet) for (const f of W.followables.balloons) f.anchor().visible = false; // (none in front of the tower)
    state.clock = 'still';
    state.hour = hour;
    W.sky.setHour(hour, true);
    if (mode) rig.setMode(mode, { fly: false });
    else if (cam) {
      rig.setMode('overview', { fly: false });
      const c = new Function('ctx', `return (${cam})(ctx)`)({ W });
      rig.camera.position.set(...c.at);
      rig.controls.target.set(...c.to);
    }
  }, [shot.hour, shot.cam, shot.mode, shot.quiet]);
  await page.waitForTimeout(6000); // the world runs: people walk, the sky settles
  await page.screenshot({ path: fileURLToPath(new URL(`${name}.png`, OUT)) });
  console.log('shot', name);
  await page.close();
}
await browser.close();
