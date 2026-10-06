/// <reference types="vite/client" />
// import.meta.env (Vite), and constants that vite.config.js (`define`) puts into the build.
declare const __TOUR_VERSIONS__: Record<string, string>;

interface Window {
  /** Dev builds only (main.js): the world on screen and the app's parts, for DevTools and the e2e tests. */
  __pyn?: any;
}
