// npm run check — builds every world in a headless browser and checks that
//   1. each world is exactly as recorded in scripts/golden/<id>.json: every vertex (checksum),
//      every tree/rock/flower instance, colliders, fly-to spots, draw calls, shader programs;
//   2. 300 s of simulation work: people board, ride and leave the train, doors open, umbrellas go
//      up in the rain, hikers climb;
//   3. switching worlds frees the old one (GPU geometry/texture/program counts come back the same);
//   4. worlds with only a few features build, and missing features are reported clearly.
// A change that is *meant* to change a world: `npm run check -- --update` rewrites its golden file
// (commit it with the change). Needs Chromium once: `npx playwright install chromium`.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { chromium } from 'playwright';
import { WORLDS } from '../src/worlds/index.js';

const UPDATE = process.argv.includes('--update');
const root = fileURLToPath(new URL('..', import.meta.url));
const goldenDir = new URL('./golden/', import.meta.url);
const failures = [];
const ok = (cond, what) => {
  console.log(`  ${cond ? '✓' : '✗'} ${what}`);
  if (!cond) failures.push(what);
};

const server = await createServer({ root, logLevel: 'error', server: { port: 5199 } });
await server.listen();
const base = server.resolvedUrls.local[0];
// Software GL: same pixels (and draw calls) on every machine, GPU or not.
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });

async function open(query) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push(e.message));
  // (Fonts come from Google: a failed download in an offline run is not the app's error.)
  page.on('console', (m) => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && page.errors.push(m.text()));
  await page.goto(`${base}${query}`);
  return page;
}
const ready = (page, id) =>
  page.waitForFunction((id) => window.__pyn?.W?.cfg.id === id && document.getElementById('loading').classList.contains('done'), id, { timeout: 180000 });

// ---- 1 + 2: each world as recorded, and alive
async function checkWorld(id) {
  console.log(`\n${id}`);
  const page = await open(`?world=${id}`);
  await ready(page, id);
  const print = await page.evaluate(fingerprint);
  const file = new URL(`${id}.json`, goldenDir);
  if (UPDATE) {
    await mkdir(goldenDir, { recursive: true });
    await writeFile(file, `${JSON.stringify(print, null, 2)}\n`);
    console.log(`  • golden/${id}.json written`);
  } else {
    let golden = null;
    try {
      golden = JSON.parse(await readFile(file, 'utf8'));
    } catch {
      ok(false, `${id}: no golden file — run \`npm run check -- --update\` and commit it`);
    }
    if (golden) {
      for (const key of Object.keys(golden)) {
        const same = JSON.stringify(print[key]) === JSON.stringify(golden[key]);
        ok(same, `${id}: ${key}${same ? '' : ` — was ${JSON.stringify(golden[key])}, now ${JSON.stringify(print[key])}`}`);
      }
    }
  }
  const life = await page.evaluate(simulate);
  const people = life.people > 0;
  ok(!people || life.boarding > 0, `${id}: people board the train (${life.boarding} boarding steps)`);
  ok(!people || life.alighting > 0, `${id}: people get off at the next stop (${life.alighting})`);
  ok(!people || !life.houses || life.doorOpenMax > 1.4, `${id}: house doors swing open (${life.doorOpenMax.toFixed(2)} rad)`);
  ok(!people || life.umbrellas > 0, `${id}: umbrellas in the rain (${life.umbrellas})`);
  ok(life.hikers === 0 || life.hikersMoved > 0, `${id}: hikers climb (${life.hikersMoved}/${life.hikers} moved)`);
  ok(life.trainStops >= 2, `${id}: the train keeps calling at stops (${life.trainStops})`);
  ok(page.errors.length === 0, `${id}: no errors${page.errors.length ? `: ${page.errors.join(' | ')}` : ''}`);
  await page.close();
}

// Runs in the page: what the world on screen is made of.
function fingerprint() {
  const { W } = window.__pyn;
  const geos = new Set();
  const instanced = [];
  let meshes = 0;
  W.scene.traverse((o) => {
    if (o.isMesh) {
      meshes++;
      geos.add(o.geometry);
    }
    if (o.isInstancedMesh && o.frustumCulled) instanced.push(o); // placed once (trees…), not animated
  });
  const sum = (a) => {
    let s = 0;
    for (let i = 0; i < a.length; i++) s += a[i] * ((i % 13) + 1);
    return s;
  };
  const hash = (list) => {
    let h = 0;
    for (const c of list.sort().join('|')) h = (Math.imul(h, 31) + c.charCodeAt(0)) | 0;
    return (h >>> 0).toString(16);
  };
  const r = window.__pyn.renderer;
  const spots = {};
  for (const k of ['courting', 'bridgeSheep', 'summit']) if (W.spots[k]) spots[k] = [W.spots[k].x, W.spots[k].z].map((v) => +v.toFixed(2));
  return {
    meshes,
    geometry: hash([...geos].map((g) => `${g.attributes.position.count}:${sum(g.attributes.position.array).toFixed(2)}`)),
    instances: hash(instanced.map((m) => `${m.count}:${sum(m.instanceMatrix.array).toFixed(2)}`)),
    colliders: W.site.colliders.length,
    stations: W.stations.map((s) => s.id),
    people: W.people.length,
    followables: [W.followables.people.length, W.followables.birds.length],
    spots,
    drawCalls: r.info.render.calls,
    programs: r.info.programs.length,
  };
}

// Runs in the page: 300 s of simulated time in 0.1 s steps (rain from half-way), without drawing.
function simulate() {
  const { W, camera, rig, state } = window.__pyn;
  state.paused = true; // the page's own loop stops advancing the world
  const houses = W.services.get('houses');
  const hikers = W.followables.people.filter((p) => p.label.startsWith('Người leo')).map((p) => p.anchor());
  const start = hikers.map((h) => h.position.clone());
  const s = { people: W.people.length, houses: !!houses, boarding: 0, alighting: 0, doorOpenMax: 0, umbrellas: 0, hikers: hikers.length, hikersMoved: 0, trainStops: 0 };
  for (let i = 0; i < 3000; i++) {
    if (i === 1500) W.weather.set('rain');
    W.update({ dt: 0.1, raw: 0.1, speed: 1, camera });
    W.lateUpdate({ raw: 0.1, camera, focus: rig.focus });
    for (const w of W.people) {
      if (w.mode === 'boarding') s.boarding++;
      if (w.mode === 'alighting') s.alighting++;
    }
    if (houses && i % 10 === 0) {
      // Door leaves hang on hinge groups: rotation 0 / π when shut.
      for (const hinge of houses.group.children) {
        if (!hinge.isGroup) continue;
        for (const leaf of hinge.children) s.doorOpenMax = Math.max(s.doorOpenMax, Math.min(Math.abs(leaf.rotation.y), Math.abs(Math.PI - leaf.rotation.y)));
      }
    }
  }
  s.trainStops = W.train.stopId;
  s.umbrellas = W.people.filter((w) => w.person.umbrella.scale.x > 0).length;
  s.hikersMoved = hikers.filter((h, i) => h.position.distanceTo(start[i]) > 1).length;
  W.weather.set('clear');
  return s;
}

// ---- 3: switching frees the old world
async function checkSwitching() {
  console.log('\nswitching worlds');
  const page = await open(`?world=${WORLDS[0].id}`);
  await ready(page, WORLDS[0].id);
  const seen = {};
  for (let round = 0; round < 2; round++) {
    for (let i = 1; i <= WORLDS.length; i++) {
      const id = WORLDS[i % WORLDS.length].id;
      if (WORLDS.length > 1) {
        await page.keyboard.press('KeyN');
        await ready(page, id);
      }
      await page.waitForTimeout(500);
      const mem = await page.evaluate(() => {
        const { memory, programs } = window.__pyn.renderer.info;
        return `${memory.geometries} geometries, ${memory.textures} textures, ${programs.length} programs`;
      });
      if (round === 0) seen[id] = mem;
      else ok(mem === seen[id], `${id} again: ${mem}${mem === seen[id] ? '' : ` (first time: ${seen[id]})`}`);
    }
  }
  ok(page.errors.length === 0, `no errors${page.errors.length ? `: ${page.errors.join(' | ')}` : ''}`);
  await page.close();
}

// ---- 4: small worlds, and clear errors for missing pieces
async function checkMinimal() {
  console.log('\nfeature combinations');
  const page = await open(`?world=${WORLDS[0].id}`);
  await ready(page, WORLDS[0].id);
  const cases = {
    'train only': { features: ['train'], expect: 'ok' },
    'station + train': { features: ['station', 'train'], expect: 'ok' },
    'no houses': { features: ['station', 'halt', 'train', 'villagers', 'birds'], expect: 'ok' },
    'life without scenery': { features: ['station', 'train', 'fish', 'boats', 'balloons', 'hikers'], expect: 'ok' },
    'no train': { features: ['station'], expect: /"train"/ },
    'unknown feature': { features: ['station', 'dragons', 'train'], expect: /"dragons"/ },
    'villagers before the train': { features: ['station', 'villagers', 'train'], expect: /"villagers".*"train"/ },
    'birds without a station': { features: ['halt', 'train', 'birds'], expect: /"birds".*"station"/ },
    'village without a stop': { features: ['village', 'station', 'train'], expect: /"village".*"station"/ },
    'three stops': { features: ['station', 'village', 'halt', 'halt', 'train', 'villagers'], stops: 3, expect: 'ok' },
  };
  const results = await page.evaluate(async (cases) => {
    const { World } = await import('/src/World.js');
    const { WORLDS } = await import('/src/worlds/index.js');
    const { camera, rig } = window.__pyn;
    const out = {};
    for (const [name, { features, stops }] of Object.entries(cases)) {
      try {
        const cfg = { ...WORLDS[0], features };
        if (stops === 3) cfg.stops = [...cfg.stops, { id: 'extra', at: 0.75, name: 'EXTRA' }];
        const w = new World(cfg);
        for (const [, step] of w.steps()) step();
        for (let i = 0; i < 50; i++) {
          w.update({ dt: 0.1, raw: 0.1, speed: 1, camera });
          w.lateUpdate({ raw: 0.1, camera, focus: rig.focus });
        }
        w.dispose();
        out[name] = 'ok';
      } catch (e) {
        out[name] = e.message;
      }
    }
    return out;
  }, Object.fromEntries(Object.entries(cases).map(([k, v]) => [k, { features: v.features, stops: v.stops }])));
  for (const [name, { expect }] of Object.entries(cases)) {
    const got = results[name];
    ok(expect === 'ok' ? got === 'ok' : got !== 'ok' && expect.test(got), `${name}: ${got}`);
  }
  await page.close();
}

try {
  for (const w of WORLDS) await checkWorld(w.id);
  await checkSwitching();
  await checkMinimal();
} finally {
  await browser.close();
  await server.close();
}
if (failures.length) {
  console.log(`\n✗ ${failures.length} check(s) failed`);
  process.exit(1);
}
console.log(`\n✓ all checks passed${UPDATE ? ' (golden files updated)' : ''}`);
