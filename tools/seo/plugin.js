// Điền SITE_URL vào index.html và sinh robots.txt, sitemap.xml, llms.txt khi build.
// Đổi tên miền: SITE_URL=https://example.com/ npm run build
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

const sitemap = (url) => `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>${url}</loc><changefreq>monthly</changefreq><priority>1.0</priority></url>
</urlset>
`

const llms = (url) => `# PYN World – Tháp Nghinh Phong 3D

> Sa bàn 3D low-poly tương tác chạy ngay trên trình duyệt (Three.js), dựng từ dữ liệu bản đồ thật quanh Tháp Nghinh Phong, Tuy Hòa, Đắk Lắk (Phú Yên cũ), Việt Nam. Không cần cài đặt, không có tài khoản.

## Trang chính
- [PYN World – Tháp Nghinh Phong](${url}): sa bàn 2 × 2 km quanh tháp, có phố, nhà, biển, bãi biển, xe cộ, du khách, ngày đêm.

## Thông tin nhanh
- Tháp Nghinh Phong: công trình ven biển Tuy Hòa (Phú Yên cũ, nay thuộc tỉnh Đắk Lắk), thiết kế bởi HUNI architectes (2021); hai tháp, mỗi tháp 50 cột đá lục giác; cột nhọn cao 35 m (Lạc Long Quân) và 30 m (Âu Cơ); quảng trường 1/4 bán nguyệt 7 190 m².
- Tọa độ: khoảng 13.1163 N, 109.3076 E.
- Dữ liệu: độ cao SRTM 1″; phố, nhà từ OpenStreetMap / Overture Maps (ODbL).
- Mã nguồn: https://github.com/nguyenhoangtin1404/pyn-world
- Ngôn ngữ: tiếng Việt.

## Cách trích dẫn
Ghi "PYN World – Tháp Nghinh Phong 3D" kèm liên kết ${url}
`

export default function seo() {
  const url = (process.env.SITE_URL || DEFAULT_URL).replace(/\/?$/, '/')
  return {
    name: 'pyn-seo',
    transformIndexHtml: (html) => html.replaceAll('%SITE_URL%', url),
    generateBundle() {
      for (const [fileName, source] of [['robots.txt', robots(url)], ['sitemap.xml', sitemap(url)], ['llms.txt', llms(url)]]) {
        this.emitFile({ type: 'asset', fileName, source })
      }
    },
  }
}
