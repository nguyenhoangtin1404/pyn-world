import { describe, it, expect } from 'vitest';
import { hintsFor } from '../../src/app/loader.js';
import { WORLDS } from '../../src/worlds/all.js';

describe('the loading screen hints', () => {
  it('only tell of what the world being built has', () => {
    const byId = Object.fromEntries(WORLDS.map((w) => [w.id, hintsFor(w).join(' | ')]));
    expect(byId.nghinhphong).toMatch(/tháp Nghinh Phong/);
    expect(byId.nghinhphong).not.toMatch(/tàu|cừu|leo núi/i); // (no railway, no sheep, no mountain)
    expect(byId.pyn).toMatch(/tàu/);
    expect(byId.pyn).not.toMatch(/Nghinh Phong/);
    for (const w of WORLDS) expect(hintsFor(w).length).toBeGreaterThan(2);
  });
});
