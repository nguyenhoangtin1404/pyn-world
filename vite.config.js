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
// tell the browser about that chunk up front, so that it downloads alongside the entry instead of after it. The
// same for the map data of the world the app opens on (src/worlds/index.js SHOWN[0]), which the app imports
// only once it runs.
const PRELOAD = ['/src/main.js', '/src/worlds/data/nghinhphong.json']
const preloadApp = () => {
  let base = '/'
  return {
    name: 'pyn-preload-app',
    configResolved: (config) => { base = config.base },
    transformIndexHtml: {
      order: 'post',
      handler(html, ctx) {
        const chunks = Object.values(ctx.bundle ?? {}).filter((c) => c.type === 'chunk')
        const files = new Set()
        // Each one with the chunks it imports (code it shares with the worlds loaded later is in chunks of its own).
        const add = (c) => {
          if (!c || c.isEntry || files.has(c.fileName)) return // (the entry is the page's own script)
          files.add(c.fileName)
          for (const f of c.imports) add(chunks.find((d) => d.fileName === f))
        }
        for (const p of PRELOAD) add(chunks.find((c) => c.facadeModuleId?.endsWith(p)))
        return [...files].map((f) => ({ tag: 'link', attrs: { rel: 'modulepreload', crossorigin: true, href: `${base}${f}` }, injectTo: 'head' }))
      },
    },
  }
}

export default { plugins: [seo(), preloadApp()], define: { __TOUR_VERSIONS__: JSON.stringify(tourVersions()) } }
