// SRTM elevation tiles (1 arc-second, ~30 m; public domain, NASA/USGS) as served by the AWS
// Terrain Tiles "skadi" set: one .hgt.gz per 1° × 1° cell, big-endian Int16 metres, row 0 = north,
// -32768 = no data. Downloaded once into a cache directory.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { join } from 'node:path';

const URL = 'https://s3.amazonaws.com/elevation-tiles-prod/skadi';
const VOID = -32768;

/** Tile name for the cell whose south-west corner is (lat, lon): N13E109. */
export function tileName(lat, lon) {
  const la = Math.floor(lat), lo = Math.floor(lon);
  return `${la >= 0 ? 'N' : 'S'}${String(Math.abs(la)).padStart(2, '0')}${lo >= 0 ? 'E' : 'W'}${String(Math.abs(lo)).padStart(3, '0')}`;
}

/** The raw tile (cached in `dir`, downloaded if missing). */
export async function loadTile(name, dir) {
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `${name}.hgt`);
  if (!existsSync(file)) {
    const res = await fetch(`${URL}/${name.slice(0, 3)}/${name}.hgt.gz`);
    if (!res.ok) throw new Error(`Không tải được ô SRTM ${name}: HTTP ${res.status}`);
    writeFileSync(file, gunzipSync(Buffer.from(await res.arrayBuffer())));
  }
  return readFileSync(file);
}

/** A sampler over the tiles covering a box: elevation(lat, lon) in metres, bilinear, voids as 0. */
export async function elevation({ south, west, north, east }, dir) {
  const tiles = new Map();
  for (let la = Math.floor(south); la <= Math.floor(north); la++) {
    for (let lo = Math.floor(west); lo <= Math.floor(east); lo++) {
      const name = tileName(la, lo);
      const buf = await loadTile(name, dir);
      const n = Math.round(Math.sqrt(buf.length / 2));
      tiles.set(name, { buf, n, la, lo });
    }
  }
  const raw = (lat, lon) => {
    const t = tiles.get(tileName(lat, lon));
    const r = Math.min(t.n - 1, Math.max(0, Math.round((t.la + 1 - lat) * (t.n - 1))));
    const c = Math.min(t.n - 1, Math.max(0, Math.round((lon - t.lo) * (t.n - 1))));
    const v = t.buf.readInt16BE((r * t.n + c) * 2);
    return v === VOID ? 0 : v;
  };
  return raw;
}
