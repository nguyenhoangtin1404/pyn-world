// The loading screen: shown at start and while switching worlds — the world's name, the build
// step being done, a progress bar, and a hint that changes every few seconds — in the language on screen
// (app/i18n.js: the build steps' Vietnamese labels are looked up in its PHRASES).
import { t, tr } from './i18n.js';

// Hints for what the world being built has (`needs`: a feature id in its config; none: any world).
const HINTS = [
  { key: 'hint.drag' },
  { key: 'hint.clock' },
  { key: 'hint.panel' },
  { key: 'hint.landmark', needs: 'landmarks' },
  { key: 'hint.tour', needs: 'landmarks' },
  { key: 'hint.tourists', needs: 'tourists' },
  { key: 'hint.balloons', needs: 'balloons' },
  { key: 'hint.traffic', needs: 'citytraffic' },
  { key: 'hint.strollers', needs: 'strollers' },
  { key: 'hint.beach', needs: 'beach' },
  { key: 'hint.seacraft', needs: 'seacraft' },
  { key: 'hint.train', needs: 'train' },
  { key: 'hint.stations', needs: 'train' },
  { key: 'hint.sheep', needs: 'sheep' },
  { key: 'hint.hikers', needs: 'hikers' },
];

/** The hints for a world: those for what it has. @param {{ features: (string | { id: string })[] }} cfg */
export function hintsFor(cfg) {
  const ids = new Set(cfg.features.map((f) => (typeof f === 'string' ? f : f.id)));
  return HINTS.filter((h) => !h.needs || ids.has(h.needs)).map((h) => t(h.key));
}

export function createLoader() {
  const el = document.getElementById('loading');
  const logo = el.querySelector('.load-logo');
  const sub = el.querySelector('.load-sub');
  const phase = document.getElementById('load-phase');
  const percent = document.getElementById('load-percent');
  const fill = el.querySelector('.load-fill');
  const bar = el.querySelector('[role="progressbar"]');
  const hint = document.getElementById('load-hint');
  let hintTimer = 0, hideTimer = 0;
  const progress = (pct) => {
    fill.style.width = `${pct}%`;
    percent.textContent = `${pct}%`;
    bar.setAttribute('aria-valuenow', String(pct));
  };
  return {
    /** @param {{ name: string, tagline?: string, icon?: string, track?: unknown, rail?: unknown, features: (string | { id: string })[] }} cfg */
    show(cfg) {
      clearTimeout(hideTimer);
      const train = cfg.features.some((f) => (typeof f === 'string' ? f : f.id) === 'train');
      logo.textContent = `${cfg.icon ?? (train ? '🚂' : '🏛')} ${cfg.name}`;
      sub.textContent = cfg.tagline ? tr(cfg.tagline) : t('load.tagline');
      const hints = hintsFor(cfg);
      progress(0);
      el.hidden = false;
      el.classList.remove('done');
      el.setAttribute('aria-busy', 'true');
      let h = 0;
      hint.textContent = hints[0];
      clearInterval(hintTimer);
      hintTimer = setInterval(() => (hint.textContent = hints[++h % hints.length]), 2600);
    },
    phase: (text) => (phase.textContent = tr(text)), // (a build step's label, in Vietnamese)
    progress,
    error(err) {
      clearInterval(hintTimer);
      phase.textContent = t('load.error', { message: err.message });
      console.error(err);
    },
    hide() {
      clearInterval(hintTimer);
      el.classList.add('done');
      el.setAttribute('aria-busy', 'false');
      hideTimer = setTimeout(() => (el.hidden = true), 700);
    },
  };
}
