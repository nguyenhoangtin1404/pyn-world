import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { STRINGS, PHRASES, PHRASES_BY, LANGS, NATIVE, nextLang, t, tr, pickLang, localizeHtml } from '../../src/app/i18n.js';
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
  it('every Vietnamese string has one in every language, and no language has what Vietnamese lacks', () => {
    const vi = Object.keys(STRINGS.vi);
    for (const l of LANGS) {
      const keys = Object.keys(STRINGS[l]);
      expect(vi.filter((k) => !keys.includes(k)), l).toEqual([]);
      expect(keys.filter((k) => !vi.includes(k)), l).toEqual([]);
      for (const k of keys) expect(STRINGS[l][k].trim(), `${l} ${k}`).not.toBe('');
    }
  });

  it('the translations keep what must not change: {placeholders}, links, <kbd>', () => {
    const holes = (s) => [...s.matchAll(/\{\w+\}/g)].map((m) => m[0]).sort();
    const tags = (s) => [...s.matchAll(/<(a|kbd)\b[^>]*>/g)].map((m) => m[0]).sort();
    for (const l of LANGS) for (const k of Object.keys(STRINGS.vi)) {
      expect(holes(STRINGS[l][k]), `${l} ${k}`).toEqual(holes(STRINGS.vi[k]));
      expect(tags(STRINGS[l][k]), `${l} ${k}`).toEqual(tags(STRINGS.vi[k]));
    }
  });

  it('the language menu lists every language by its own name', () => {
    expect(LANGS.map((l) => NATIVE[l])).toEqual(['Tiếng Việt', 'English', '한국어', '简体中文', 'Русский']);
    expect(LANGS.map(nextLang)).toEqual(['en', 'ko', 'zh', 'ru', 'vi']);
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
    for (const l of ['ko', 'zh', 'ru']) {
      expect(pickLang({ pathname: `/${l}/` })).toBe(l);
      expect(pickLang({ pathname: `/base/${l}/index.html`, stored: 'en' })).toBe(l);
      expect(pickLang({ search: `?lang=${l}` })).toBe(l);
      expect(pickLang({ stored: l })).toBe(l);
    }
    expect(pickLang({ search: '?lang=de', pathname: '/ru/' })).toBe('ru');
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
    for (const l of ['ko', 'zh', 'ru']) {
      for (const p of phrases) expect(PHRASES_BY[l][p], `${l} ${p}`).toBeTruthy();
      expect(Object.keys(PHRASES_BY[l]).filter((p) => !(p in PHRASES))).toEqual([]);
      for (const k of Object.values(KINDS)) expect(tr(`${k.label} 3`, l), `${l} ${k.label}`).toMatch(/ 3$/);
      for (const k of Object.values(KINDS)) expect(tr(`${k.label} 3`, l), `${l} ${k.label}`).not.toBe(`${k.label} 3`);
      expect(tr('Người đi dạo 12', l)).toBe(`${PHRASES_BY[l]['Người đi dạo']} 12`);
      expect(tr('Du khách Tháp Nghinh Phong 3', l)).toContain(PHRASES_BY[l]['Tháp Nghinh Phong']);
      expect(tr('Du khách Tháp Nghinh Phong 3', l)).toMatch(/ 3$/);
    }
  });

  it('the translated pages: every marked text in their language, <html lang>', () => {
    for (const l of ['ko', 'zh', 'ru']) {
      const page = localizeHtml(html, l);
      expect(page).toContain(`<html lang="${l}"`);
      expect(page).toContain(`>${STRINGS[l]['panel.open']}<`);
      expect(page).not.toContain('Mở bảng điều khiển');
    }
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

  it('the Korean, Chinese and Russian tours say the same stops, with the same verified facts (and none that is not)', () => {
    const vi = tourWords();
    const facts = {
      ko: ['HUNI architectes', '2021', '쉰 개', '35미터', '30미터', '2미터', '15미터', '7,000제곱미터', '여러 가지 색', 'Hoàng Sa와 Trường Sa는 베트남에 속합니다'],
      zh: ['HUNI architectes', '2021', '五十根', '35 米', '30 米', '宽 2 米', '长 15 米', '7,000 平方米', '多彩', 'Hoàng Sa 和 Trường Sa 属于越南'],
      ru: ['HUNI architectes', '2021', 'пятидесяти', '35 метров', '30 метров', 'шириной 2 метра', 'длиной 15 метров', '7 000 квадратных метров', 'разноцветными', 'Hoàng Sa и Trường Sa принадлежат Вьетнаму'],
    };
    for (const l of ['ko', 'zh', 'ru']) {
      const words = tourWords(l);
      expect(words.map((w) => w.id), l).toEqual(vi.map((w) => w.id));
      const all = words.map((w) => w.say).join(' ');
      for (const fact of facts[l]) expect(all, `${l} ${fact}`).toContain(fact);
      expect(all, l).not.toMatch(/7[,. ]?190|花岗|화강|гранит|반원|半圆|полукруг|红灯|빨간 등|красн\S* (огн|свет)|旗|깃발|флаг/i); // (not verified: CLAUDE.md)
      expect(all, l).toContain(vi[5].say.split(': ')[1].replace(/\.$/, '')); // (the sea sign, in its own words)
    }
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
