// @ts-check
import './style.css';
import { showFallback, webglAvailable } from './app/fallback.js';

// The page's entry (index.html): the app (main.js — three.js and everything) is fetched only when the
// browser can draw it; without WebGL the visitor gets a photo of the tower and a few words about it
// (app/fallback.js) instead of a loading screen that never ends.
if (webglAvailable()) {
  import('./main.js').catch((err) => {
    // (a chunk that failed to download: say so rather than load for ever)
    const phase = document.getElementById('load-phase');
    if (phase) phase.textContent = `Lỗi: ${err.message}`;
    console.error(err);
  });
} else showFallback('nogl');
