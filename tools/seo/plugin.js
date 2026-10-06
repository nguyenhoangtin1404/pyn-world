// Điền SITE_URL vào index.html và sinh robots.txt, sitemap.xml, llms.txt khi build — và trang tiếng Anh
// en/index.html: index.html với phần head SEO tiếng Anh (en.js) và chữ tĩnh tiếng Anh (src/app/i18n.js).
// Đổi tên miền: SITE_URL=https://example.com/ npm run build
import { readFileSync } from 'node:fs'
import { localizeHtml } from '../../src/app/i18n.js'
import { EN_HEAD } from './en.js'
const DEFAULT_URL = 'https://thapnghinhphong.vn/'

const robots = (url) => `# Cho phép mọi bot, kể cả bot tìm kiếm và bot AI. Muốn chặn bot huấn luyện thì đổi Allow thành Disallow.
User-agent: *
Allow: /

User-agent: GPTBot
Allow: /
User-agent: OAI-SearchBot
Allow: /
User-agent: ChatGPT-User
Allow: /
User-agent: ClaudeBot
Allow: /
User-agent: Claude-SearchBot
Allow: /
User-agent: PerplexityBot
Allow: /
User-agent: Google-Extended
Allow: /
User-agent: Applebot-Extended
Allow: /

Sitemap: ${url}sitemap.xml
`

// Hai trang, mỗi trang nêu cả hai bản ngôn ngữ (hreflang).
const alternates = (url) => `<xhtml:link rel="alternate" hreflang="vi" href="${url}"/><xhtml:link rel="alternate" hreflang="en" href="${url}en/"/><xhtml:link rel="alternate" hreflang="x-default" href="${url}"/>`
const sitemap = (url) => `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
  <url><loc>${url}</loc>${alternates(url)}<changefreq>monthly</changefreq><priority>1.0</priority></url>
  <url><loc>${url}en/</loc>${alternates(url)}<changefreq>monthly</changefreq><priority>0.8</priority></url>
</urlset>
`

const llms = (url) => `# PYN World – Tháp Nghinh Phong 3D

> Sa bàn 3D low-poly tương tác chạy ngay trên trình duyệt (Three.js), dựng từ dữ liệu bản đồ thật quanh Tháp Nghinh Phong, Tuy Hòa, Đắk Lắk (Phú Yên cũ), Việt Nam. Không cần cài đặt, không có tài khoản.

## Trang chính
- [PYN World – Tháp Nghinh Phong](${url}): sa bàn 2 × 2 km quanh tháp, có phố, nhà, biển, bãi biển, xe cộ, du khách, ngày đêm.
- [PYN World – Nghinh Phong Tower (English)](${url}en/): bản tiếng Anh (giao diện, phần giới thiệu và phụ đề thuyết minh).

## Thông tin nhanh
- Tháp Nghinh Phong: công trình ven biển Tuy Hòa (Phú Yên cũ, nay thuộc tỉnh Đắk Lắk), thiết kế bởi HUNI architectes (hoàn thành 2021); hai tháp, mỗi tháp 50 cột đá lục giác; cột nhọn cao 35 m (Lạc Long Quân) và 30 m (Âu Cơ); quảng trường rộng hơn 7 000 m².
- Tọa độ: khoảng 13.1163 N, 109.3076 E.
- Dữ liệu: độ cao SRTM 1″; phố, nhà từ OpenStreetMap / Overture Maps (ODbL).
- Mã nguồn: https://github.com/nguyenhoangtin1404/pyn-world
- Ngôn ngữ: tiếng Việt (mặc định) và tiếng Anh (${url}en/).

## In English
- Nghinh Phong Tower: a seafront landmark in Tuy Hòa (formerly Phú Yên province, now part of Đắk Lắk), Viet Nam, designed by HUNI architectes (completed in 2021); two towers, each of 50 hexagonal stone columns; spires 35 m (Lạc Long Quân) and 30 m (Âu Cơ) high; a square of more than 7,000 m².
- PYN World rebuilds a 2 × 2 km area around it as an interactive low-poly 3D diorama in the browser: ${url}en/

## Cách trích dẫn
Ghi "PYN World – Tháp Nghinh Phong 3D" kèm liên kết ${url}
`

/** The English page from index.html (as built: SITE_URL filled in): its own head, English text, <html lang="en">. */
export const englishPage = (html, url) => {
  if (!/<!-- seo:start[\s\S]*?<!-- seo:end -->/.test(html)) throw new Error('index.html: không thấy <!-- seo:start --> … <!-- seo:end -->')
  return localizeHtml(html.replace(/<!-- seo:start[\s\S]*?<!-- seo:end -->/, EN_HEAD.replaceAll('%SITE_URL%', url)), 'en')
}

export default function seo() {
  const url = (process.env.SITE_URL || DEFAULT_URL).replace(/\/?$/, '/')
  return {
    name: 'pyn-seo',
    transformIndexHtml: (html) => html.replaceAll('%SITE_URL%', url),
    // (dev: /en/ is the English page too)
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!/^\/en\/(index\.html)?(\?|$)/.test(req.url ?? '')) return next()
        try {
          const html = await server.transformIndexHtml(req.url, readFileSync('index.html', 'utf8'))
          res.setHeader('Content-Type', 'text/html; charset=utf-8')
          res.end(englishPage(html, url))
        } catch (err) {
          next(err)
        }
      })
    },
    generateBundle: {
      order: 'post', // (after Vite has written index.html into the bundle)
      handler(options, bundle) {
        for (const [fileName, source] of [['robots.txt', robots(url)], ['sitemap.xml', sitemap(url)], ['llms.txt', llms(url)]]) {
          this.emitFile({ type: 'asset', fileName, source })
        }
        const index = bundle?.['index.html']
        if (index) this.emitFile({ type: 'asset', fileName: 'en/index.html', source: englishPage(String(index.source), url) })
      },
    },
  }
}
