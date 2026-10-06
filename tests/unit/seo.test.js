import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import seo, { englishPage } from '../../tools/seo/plugin.js'

// What the plugin writes at build: robots.txt, sitemap.xml, llms.txt and the English page (from a built index.html).
const build = (index = '<html lang="vi"><head><!-- seo:start --><title>x</title><!-- seo:end --></head></html>') => {
  const out = {}
  seo().generateBundle.handler.call({ emitFile: (f) => (out[f.fileName] = f.source) }, {}, { 'index.html': { source: index } })
  return out
}

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
    for (const text of [html, ...Object.values(build(html))]) expect(text).not.toMatch(/Quy Nhơn|Bình Định/)
    expect(html).toContain('Tuy Hòa')
  })

  it('plugin thay SITE_URL và sinh robots/sitemap/llms', () => {
    const p = seo()
    expect(p.transformIndexHtml('<a href="%SITE_URL%">')).not.toContain('%SITE_URL%')
    expect(Object.keys(build()).sort()).toEqual(['en/index.html', 'llms.txt', 'robots.txt', 'sitemap.xml'])
  })

  it('trang tiếng Anh: head riêng (canonical /en/, hreflang, JSON-LD cùng số liệu), chữ tiếng Anh', () => {
    const url = 'https://x.test/'
    const vi = html.replaceAll('%SITE_URL%', url)
    const en = englishPage(vi, url)
    expect(en).toContain('<html lang="en"')
    expect(en).toContain(`<link rel="canonical" href="${url}en/" />`)
    for (const page of [vi, en]) {
      for (const [lang, href] of [['vi', url], ['en', `${url}en/`], ['x-default', url]])
        expect(page).toContain(`<link rel="alternate" hreflang="${lang}" href="${href}" />`)
    }
    expect(en).not.toContain('Tháp Nghinh Phong Tuy Hòa 3D – Sa bàn') // (the Vietnamese title is gone)
    const ld = JSON.parse(en.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1])
    const tower = ld['@graph'].find((n) => n['@type'] === 'TouristAttraction')
    const viTower = JSON.parse(vi.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1])['@graph'].find((n) => n['@type'] === 'TouristAttraction')
    expect(tower['@id']).toBe(viTower['@id'])
    expect(tower.geo).toEqual(viTower.geo)
    for (const fact of ['HUNI architectes', '2021', '50 hexagonal stone columns', '35 m', '30 m', '7,000 m²']) expect(tower.description).toContain(fact)
    expect(ld['@graph'].map((n) => n['@type'])).toContain('FAQPage')
    // The About copy, for bots, in English.
    const about = en.match(/<dialog id="about"[\s\S]*?<\/dialog>/)[0]
    for (const s of ['Nghinh Phong Tower', 'HUNI architectes', 'OpenStreetMap', 'ODbL', 'Overture Maps', 'SRTM', 'AGPL-3.0', 'more than 7,000 m²']) expect(about).toContain(s)
    expect(about).not.toMatch(/Mã nguồn|Bản đồ ©/)
  })

  it('sitemap và llms.txt có trang tiếng Anh', () => {
    const out = build()
    expect(out['sitemap.xml']).toMatch(/<loc>https:\/\/[^<]+\/en\/<\/loc>/)
    expect(out['sitemap.xml']).toContain('hreflang="en"')
    expect(out['llms.txt']).toMatch(/\/en\/\)/)
    expect(out['llms.txt']).toContain('## In English')
    expect(out['llms.txt']).toContain('more than 7,000 m²')
  })
})
