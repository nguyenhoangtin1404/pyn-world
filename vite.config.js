import { createHash } from 'node:crypto'
import { readdirSync, readFileSync } from 'node:fs'
import seo from './tools/seo/plugin.js'

// A short hash of each narration recording (public/tour/*.mp3), appended to its URL by src/app/tour.js
// (`?v=…`): the files keep their names when they are recorded again, so without it a browser or CDN
// that has the old one goes on playing it.
const tourVersions = () => {
  const out = {}
  try {
    for (const f of readdirSync('public/tour').filter((n) => n.endsWith('.mp3')).sort()) {
      out[`tour/${f}`] = createHash('sha1').update(readFileSync(`public/tour/${f}`)).digest('hex').slice(0, 10)
    }
  } catch { /* no recordings: nothing to version */ }
  return out
}

// The page's entry is src/boot.js, which imports the app (src/main.js) only once it knows the browser has WebGL:
// tell the browser about that chunk up front, so that it downloads alongside the entry instead of after it.
const preloadApp = () => {
  let base = '/'
  return {
    name: 'pyn-preload-app',
    configResolved: (config) => { base = config.base },
    transformIndexHtml: {
      order: 'post',
      handler(html, ctx) {
        const app = Object.values(ctx.bundle ?? {}).find((c) => c.type === 'chunk' && c.facadeModuleId?.endsWith('/src/main.js'))
        return app ? [{ tag: 'link', attrs: { rel: 'modulepreload', crossorigin: true, href: `${base}${app.fileName}` }, injectTo: 'head' }] : html
      },
    },
  }
}

export default { plugins: [seo(), preloadApp()], define: { __TOUR_VERSIONS__: JSON.stringify(tourVersions()) } }
