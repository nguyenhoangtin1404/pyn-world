import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { STRINGS, PHRASES, t, tr, pickLang, localizeHtml } from '../../src/app/i18n.js';
import { FEATURE_IDS, featureById, loadFeatures } from '../../src/features/index.js';
import { KINDS } from '../../src/world/vehicles/kinds.js';
import { LANDMARKS } from '../../src/landmarks/index.js';
import { WORLDS } from '../../src/worlds/all.js';
import { tourWords } from '../../src/landmarks/nghinh-phong-tour.js';

const html = readFileSync('index.html', 'utf8');
const squash = (s) => s.replace(/\s+/g, ' ').trim();
// Every data-i18n / data-i18n-html element of index.html: [key, its (Vietnamese) content]; every data-i18n-attr: [key, value].
const staticText = [...html.matchAll(/<(\w+)[^>]*?\sdata-i18n(?:-html)?="([^"]+)"[^>]*>([\s\S]*?)<\/\1>/g)].map((m) => [m[2], squash(m[3])]);
const staticAttrs = [...html.matchAll(/<[^>]*\sdata-i18n-attr="([^"]+)"[^>]*>/g)].flatMap((m) =>
  m[1].split(';').map((pair) => {
    const [attr, key] = pair.split(':');
    return [key, new RegExp(`\\s${attr}="([^"]*)"`).exec(m[0])?.[1]];
  }));

describe('i18n', () => {
  it('every Vietnamese string has an English one, and English has nothing Vietnamese lacks', () => {
    const vi = Object.keys(STRINGS.vi), en = Object.keys(STRINGS.en);
    expect(vi.filter((k) => !en.includes(k))).toEqual([]);
    expect(en.filter((k) => !vi.includes(k))).toEqual([]);
    for (const k of en) expect(STRINGS.en[k].trim(), k).not.toBe('');
  });

  it('index.html says what the Vietnamese strings say (one source of truth)', () => {
    expect(staticText.length).toBeGreaterThan(40);
    for (const [key, text] of [...staticText, ...staticAttrs]) {
      expect(STRINGS.vi[key], key).toBeDefined();
      expect(squash(STRINGS.vi[key]), key).toBe(text);
    }
  });

  it('looks up, fills in, falls back to Vietnamese', () => {
    expect(t('toast.world', { name: 'NGHINH PHONG' }, 'vi')).toBe('Thế giới: NGHINH PHONG');
    expect(t('toast.world', { name: 'NGHINH PHONG' }, 'en')).toBe('World: NGHINH PHONG');
    STRINGS.vi['test.only-vi'] = 'chỉ có tiếng Việt';
    try {
      expect(t('test.only-vi', undefined, 'en')).toBe('chỉ có tiếng Việt');
    } finally {
      delete STRINGS.vi['test.only-vi'];
    }
    expect(t('no.such.key', undefined, 'en')).toBe('no.such.key');
  });

  it('picks the language: ?lang=, then /en/, then the remembered choice, else Vietnamese (not the browser’s)', () => {
    expect(pickLang({})).toBe('vi');
    expect(pickLang({ search: '?lang=en' })).toBe('en');
    expect(pickLang({ search: '?world=pyn&lang=vi', pathname: '/en/' })).toBe('vi');
    expect(pickLang({ pathname: '/en/' })).toBe('en');
    expect(pickLang({ pathname: '/en/index.html', stored: 'vi' })).toBe('en');
    expect(pickLang({ pathname: '/', stored: 'en' })).toBe('en');
    expect(pickLang({ pathname: '/', stored: 'fr' })).toBe('vi');
    expect(pickLang({ pathname: '/garden/' })).toBe('vi');
  });

  it('the worlds’ own words have English: build steps, what the cameras follow, landmarks, taglines', async () => {
    await loadFeatures(FEATURE_IDS); // (the railway valleys' features are loaded on demand)
    const core = [...readFileSync('src/World.js', 'utf8').matchAll(/step\('([^']+)'/g)].map((m) => m[1]);
    expect(core.length).toBeGreaterThan(3);
    const phrases = [...core, ...FEATURE_IDS.map((id) => featureById(id).label), ...Object.values(LANDMARKS).map((l) => l.name), ...WORLDS.flatMap((w) => (w.tagline ? [w.tagline] : []))];
    for (const p of phrases) expect(PHRASES[p], p).toBeDefined();
    for (const k of Object.values(KINDS)) expect(tr(`${k.label} 3`, 'en'), k.label).not.toBe(`${k.label} 3`);
    expect(tr('Du khách Tháp Nghinh Phong 3', 'en')).toBe('Visitor at Nghinh Phong Tower 3');
    expect(tr('Người đi dạo 12', 'en')).toBe('Walker 12');
    expect(tr('Người đi dạo 12', 'vi')).toBe('Người đi dạo 12');
    expect(tr('MAPLE VALE', 'en')).toBe('MAPLE VALE');
  });

  it('the English page: every marked text and attribute in English, <html lang="en">', () => {
    const en = localizeHtml(html, 'en');
    expect(en).toContain('<html lang="en"');
    expect(en).toContain('>Open the control panel<');
    expect(en).toContain('aria-label="Camera views"');
    expect(en).toContain('Narrated tour of the tower (press again or <kbd>Esc</kbd> to stop)');
    expect(en).not.toContain('Mở bảng điều khiển');
    const tight = (s) => squash(s).replace(/> /g, '>').replace(/ </g, '<');
    expect(tight(localizeHtml(html, 'vi'))).toBe(tight(html)); // (Vietnamese: the page as it is)
  });

  it('the English tour says the same stops, translated (only the verified facts)', () => {
    const vi = tourWords(), en = tourWords('en');
    expect(en.map((w) => w.id)).toEqual(vi.map((w) => w.id));
    const all = en.map((w) => w.say).join(' ');
    for (const fact of ['HUNI architectes', '2021', 'fifty hexagonal stone columns', '35 metres', '30 metres', '2 metres wide and 15 metres long', 'more than 7,000 square metres', 'many colours'])
      expect(all).toContain(fact);
    expect(all).not.toMatch(/7,190|granite|semi-circ|red light|flag/i); // (not verified: CLAUDE.md)
    expect(en.find((w) => w.id === 'sea').say).toMatch(/belong to Viet Nam/);
  });
});
