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

export default { plugins: [seo()], define: { __TOUR_VERSIONS__: JSON.stringify(tourVersions()) } }
