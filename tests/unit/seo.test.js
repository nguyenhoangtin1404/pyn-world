import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import seo from '../../tools/seo/plugin.js'

describe('seo', () => {
  const html = readFileSync('index.html', 'utf8')

  it('index.html có đủ thẻ meta và JSON-LD hợp lệ', () => {
    for (const s of ['name="description"', 'rel="canonical"', 'property="og:image"', 'twitter:card'])
      expect(html).toContain(s)
    const ld = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)
    expect(ld).toBeTruthy()
    const data = JSON.parse(ld[1].replaceAll('%SITE_URL%', 'https://x.test/'))
    expect(data['@graph'].map((n) => n['@type'])).toContain('TouristAttraction')
    expect(data['@graph'].map((n) => n['@type'])).toContain('FAQPage')
    const tower = data['@graph'].find((n) => n['@type'] === 'TouristAttraction')
    expect(tower.image).toBe('https://x.test/og.png')
    expect(tower.url).toBe('https://x.test/')
  })

  it('phần giới thiệu là hộp thoại người xem mở được, có ghi nguồn dữ liệu', () => {
    const about = html.match(/<dialog id="about"[\s\S]*?<\/dialog>/)
    expect(about).toBeTruthy()
    for (const s of ['Tháp Nghinh Phong', 'HUNI architectes', 'OpenStreetMap', 'ODbL', 'Overture Maps', 'SRTM', 'AGPL-3.0'])
      expect(about[0]).toContain(s)
    expect(html).not.toMatch(/fonts\.googleapis\.com/) // (the font is served from the site)
  })

  it('manifest.webmanifest hợp lệ', () => {
    expect(html).toContain('rel="manifest"')
    const m = JSON.parse(readFileSync('public/manifest.webmanifest', 'utf8'))
    expect(m).toMatchObject({ lang: 'vi', display: 'standalone' })
    expect(m.icons.some((i) => i.sizes === '512x512')).toBe(true)
    for (const i of m.icons) expect(() => readFileSync(`public${i.src}`)).not.toThrow()
  })

  it('tháp ở Tuy Hòa, không phải Quy Nhơn', () => {
    const llms = []
    seo().generateBundle.call({ emitFile: (f) => llms.push(f.source) })
    for (const text of [html, ...llms]) expect(text).not.toMatch(/Quy Nhơn|Bình Định/)
    expect(html).toContain('Tuy Hòa')
  })

  it('plugin thay SITE_URL và sinh robots/sitemap/llms', () => {
    const p = seo()
    expect(p.transformIndexHtml('<a href="%SITE_URL%">')).not.toContain('%SITE_URL%')
    const emitted = []
    p.generateBundle.call({ emitFile: (f) => emitted.push(f.fileName) })
    expect(emitted.sort()).toEqual(['llms.txt', 'robots.txt', 'sitemap.xml'])
  })
})
