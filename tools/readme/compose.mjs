// Pictures of the README (docs/media/*.jpg), laid out as HTML from the shots of shoot.mjs
// (docs/media/raw/) and photographed with Chromium: `node tools/readme/compose.mjs`.
import { chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const at = (p) => fileURLToPath(new URL(p, import.meta.url));
const img = (name) => `data:image/png;base64,${readFileSync(at(`../../docs/media/raw/${name}.png`)).toString('base64')}`;
const font = (f) => `data:font/woff2;base64,${readFileSync(at(`../../public/fonts/${f}`)).toString('base64')}`;

const BASE_CSS = `
@font-face { font-family: 'Fredoka'; src: url(${font('fredoka-latin.woff2')}) format('woff2'); font-weight: 300 700; unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD; }
@font-face { font-family: 'Fredoka'; src: url(${font('fredoka-latin-ext.woff2')}) format('woff2'); font-weight: 300 700; }
* { box-sizing: border-box; margin: 0; }
body { font-family: 'Fredoka', system-ui, sans-serif; background: #fbf4e2; color: #3f2a1f; }
.shot { background-size: cover; background-position: center; border-radius: 22px; position: relative; overflow: hidden;
  box-shadow: 0 18px 40px rgba(63, 42, 31, .22), 0 2px 0 rgba(255,255,255,.6) inset; }
.tag { position: absolute; left: 22px; bottom: 20px; background: rgba(251,244,226,.94); color: #3f2a1f; border-radius: 999px;
  padding: 8px 20px 9px; font-weight: 600; font-size: 26px; box-shadow: 0 6px 18px rgba(0,0,0,.18); }
.tag small { font-weight: 400; color: #6b5445; font-size: 19px; margin-left: 8px; }
`;

const PAGES = {
  hero: {
    size: [1600, 820],
    html: `<div style="position:absolute;inset:0;background:url(${img('hero')}) center 60%/cover"></div>
      <div style="position:absolute;inset:0;background:linear-gradient(90deg,rgba(14,16,40,.92) 0%,rgba(14,16,40,.72) 38%,rgba(14,16,40,0) 66%)"></div>
      <div style="position:absolute;left:84px;top:150px;width:760px;color:#fbf4e2">
        <div style="display:inline-block;padding:7px 18px;border-radius:999px;background:#c8453a;font-weight:600;font-size:22px;letter-spacing:.06em">THREE.JS · 100% PROCEDURAL</div>
        <h1 style="font-size:132px;line-height:1;font-weight:700;margin:26px 0 18px;letter-spacing:-.02em">PYN World</h1>
        <p style="font-size:36px;line-height:1.3;font-weight:400;opacity:.95">Tháp Nghinh Phong và những thế giới low-poly <b style="color:#ffc861;font-weight:600">sống động</b> — dựng hoàn toàn bằng code, chạy ngay trên trình duyệt.</p>
        <div style="display:flex;gap:12px;margin-top:38px;flex-wrap:wrap">
          ${['🏙️ Bản đồ thật', '🌗 Ngày · đêm', '🌧️ Mưa · tuyết', '🚂 Tàu · xe · người', '🎧 Âm thanh tổng hợp'].map((t) => `<span style="padding:9px 18px;border-radius:999px;background:rgba(251,244,226,.14);border:1.5px solid rgba(251,244,226,.35);font-size:23px">${t}</span>`).join('')}
        </div>
      </div>`,
  },
  worlds: {
    size: [1600, 1000],
    html: `<div style="padding:48px 56px">
      <div style="display:grid;grid-template-columns:1.45fr 1fr;grid-template-rows:1fr 1fr;gap:32px;height:904px">
        <div class="shot" style="background-image:url(${img('city')});grid-row:1 / span 2"><span class="tag">NGHINH PHONG <small>Tuy Hòa · bản đồ thật</small></span></div>
        <div class="shot" style="background-image:url(${img('tuyhoa')})"><span class="tag">TUY HÒA <small>26 000 ngôi nhà thật</small></span></div>
        <div class="shot" style="background-image:url(${img('pyn')})"><span class="tag">PYN <small>thung lũng tàu hơi nước</small></span></div>
      </div></div>`,
  },
  daynight: {
    size: [1600, 700],
    html: `<div style="position:absolute;inset:0;background:url(${img('tower')}) center 60%/cover"></div>
      <div style="position:absolute;inset:0;background:url(${img('towerNight')}) center 60%/cover;clip-path:polygon(54% 0,100% 0,100% 100%,46% 100%)"></div>
      <div style="position:absolute;inset:0;background:linear-gradient(105deg,transparent 0%) , linear-gradient(0deg,transparent,transparent)"></div>
      <span class="tag" style="left:36px;bottom:32px">☀️ 16:30</span>
      <span class="tag" style="left:auto;right:36px;bottom:32px">🌙 20:30 <small>đèn LED nhiều màu</small></span>`,
  },
  moments: {
    size: [1600, 560],
    html: `<div style="padding:40px 48px;display:grid;grid-template-columns:1.25fr 1fr 1fr;gap:28px;height:560px">
      <div class="shot" style="background-image:url(${img('boulevard')})"><span class="tag">Đại lộ Độc Lập</span></div>
      <div class="shot" style="background-image:url(${img('beach')});background-position:92% 50%"><span class="tag">Bãi biển</span></div>
      <div class="shot" style="background-image:url(${img('pynSunset')})"><span class="tag">Hoàng hôn trên tàu</span></div>
    </div>`,
  },
};

const browser = await chromium.launch();
for (const [name, { size, html }] of Object.entries(PAGES)) {
  const page = await browser.newPage({ viewport: { width: size[0], height: size[1] }, deviceScaleFactor: 1 });
  await page.setContent(`<!doctype html><meta charset="utf-8"><style>${BASE_CSS}</style><body style="position:relative;width:${size[0]}px;height:${size[1]}px;overflow:hidden">${html}</body>`);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: at(`../../docs/media/${name}.jpg`), type: 'jpeg', quality: 86 });
  console.log('composed', name);
  await page.close();
}
await browser.close();
