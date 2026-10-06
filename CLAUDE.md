# PYN World — ghi chú cho người sửa code

Thung lũng low-poly dựng hoàn toàn bằng code với Three.js. Xem README.md để biết mỗi file làm gì.

```bash
npm run dev      # http://localhost:5173  — thêm ?stats để xem draw call / ms mỗi frame
npm run build
npm run check    # lint + kiểu + unit test + e2e — chạy trước khi push (CI chạy y như vậy)
```

## Kiểm tra và CI

Lần đầu trên máy mới: `npm install` (cài luôn hook commit-msg) và `npx playwright install chromium`.

| Lệnh | Làm gì | Thời gian |
|---|---|---|
| `npm run lint` | ESLint (`eslint.config.js`): bắt lỗi, không soát định dạng | vài giây |
| `npm run typecheck` | `tsc` trên các file `// @ts-check` | vài giây |
| `npm test` | Unit test Vitest (`tests/unit/`): logic thuần (giao thông, đèn, lịch tàu, nav, đêm, bờ biển, niêm phong, QR, SEO…), `meshHeightAt`, dáng đi, `checkWorldData`; cache module trên đĩa (`fsModuleCache`) | vài giây |
| `npm run e2e` | Playwright Test (`tests/e2e/`): dựng mọi world trong Chromium không giao diện (GPU phần mềm — cùng kết quả mọi máy); project `mobile` (Pixel 7, cảm ứng) chỉ chạy `mobile.spec.js`; `a11y.spec.js` chạy axe (lỗi serious/critical là đỏ). Hai bản checkout chạy cùng lúc: `E2E_PORT=5211 npm run e2e` | ~8–20 phút |

E2E gồm:
1. **So với golden** (`tests/e2e/golden/<id>.json`): checksum mọi đỉnh, vị trí từng cây/đá/hoa, số
   collider, spot, trạm, số người, draw call, shader. `geometry`/`instances` là `{ total, by: { <phần>: "số:hash" } }` — hash
   theo từng phần lõi/feature (`userData.builtBy`, `World.steps`) nên khi đỏ biết feature nào lệch.
2. **Tua nhanh 300 s** (trang tạm dừng ngay khi tải, `openWorld(…, { paused: true })` — luôn xuất phát như nhau): người lên/xuống tàu, cửa mở, bật ô khi mưa, người leo núi đi, tàu dừng ≥ 2 lần.
3. **Đổi world 2 vòng**: số geometry/texture/shader trên GPU phải như lần đầu (không rò).
4. **Tổ hợp feature**: world tối giản dựng được; thiếu thứ gì thì lỗi phải nói rõ.
5. **Ảnh** (`tests/e2e/visual.spec.js`, ảnh chuẩn `tests/e2e/golden/*.png`): bốn góc cố định của NGHINH PHONG — tháp, vòng
   xuyến, đại lộ, người đi xe đạp — chụp rồi so từng điểm ảnh (sai quá 0,2 %). Bắt cái golden không thấy: thiếu dải phân
   cách, vòng xuyến thành cái đĩa, tay không cầm ghi đông, sọc kẻ trên quảng trường. Ảnh **không có thứ chuyển động** (người,
   xe, chim, khinh khí cầu ẩn đi — vị trí của chúng tùy trang chạy bao lâu trước khi tạm dừng) và tự vẽ khung hình bằng tay
   (`SETTLE`: GPU phần mềm chỉ chạy vòng lặp vài lần mỗi giây; bầu trời tiến dần tới trạng thái của nó nên vẽ 60 lần
   `lateUpdate` trước). Đổi có chủ ý thứ nhìn thấy: `npm run e2e -- visual --update-snapshots`, **mở ảnh mới ra xem** rồi mới commit.

Cố ý đổi một world (thêm feature, sửa config…): `npm run e2e -- --update-snapshots` ghi lại golden (và ảnh),
xem diff của `tests/e2e/golden/*.json` có đúng ý không rồi commit cùng thay đổi (PR sẽ có nhãn
`world output changed`). **Không** cập nhật golden để cho qua một lần chạy đỏ mà mình không hiểu vì
sao — nhất là golden của PYN. Không có retry: test đỏ là lỗi thật, không phải "flaky".

**Commit và tiêu đề PR** viết **bằng tiếng Anh** (luật `header-english`/`body-english` chặn từ tiếng Việt viết thường; tên riêng viết hoa như Tuy Hòa được giữ dấu) và theo Conventional Commits (`commitlint.config.js`): `feat(world): …`,
`fix(people): …`, `perf: …`, `refactor: …`, `test: …`, `docs: …`, `ci: …`, `chore: …`; thêm `!` nếu phá
tương thích (`refactor!: …`). Hook `.githooks/commit-msg` chặn message sai ngay khi commit; CI soát lại
từng commit và tiêu đề PR (PR được squash-merge theo tiêu đề).

**GitHub Actions** (`.github/workflows/`):
- `ci.yml` — mỗi PR và mỗi push lên `main`: Lint & types, Unit tests, Build (artifact `dist`), E2E chia 3 shard
  (`e2e-shard`, báo cáo blob) + job **E2E (Playwright)** gộp báo cáo thành `playwright-report` (có trace khi đỏ) và đỏ nếu
  shard nào đỏ. Sau khi tất cả xanh trên `main`: **deploy GitHub Pages đúng artifact `dist` đã build** (không build lại) — tắt
  cho tới khi bật Settings → Pages → Source "GitHub Actions" và đặt biến repo `PAGES_ENABLED=true`.
- Mọi action **ghim theo SHA** (tag trong chú thích); `.github/dependabot.yml` nâng hằng tuần — `three` và `@playwright/test`
  chỉ nhận bản patch (bản minor đổi golden/ảnh: nâng tay, tạo lại golden, xem diff).
- `pr.yml` — tiêu đề PR và mọi commit theo Conventional Commits.
- `labeler.yml` — nhãn tự động: khu vực theo file đổi (`.github/labeler.yml`), `type: …` theo tiêu đề,
  `size: XS…XL` theo số dòng đổi, `breaking change` khi có `!`. Chạy bằng `pull_request_target` nên
  gắn được nhãn cho PR từ fork; **không** checkout hay chạy code của PR trong workflow đó (đừng thêm).

**Kiểu dữ liệu**: hợp đồng giữa App, World và feature nằm trong `src/types.d.ts` (`WorldConfig`,
`StopConfig`, `System`, `Frame`, `Feature`, `Station`, `WorldOutputs`…); các file có `// @ts-check` được `tsc` kiểm tra
(lõi, config, feature). Bắt được: gõ sai trường của `f`/config, thiếu trường bắt buộc, sai kiểu. **Không**
bắt được: gõ sai tên hook trả về từ `build()` (`lateUpadte` sẽ lặng lẽ không chạy) — soát bằng mắt.
File mới trong `src/features/` hay `src/worlds/`: thêm `// @ts-check` ở dòng đầu.

## SEO (trang chủ = NGHINH PHONG)

`index.html` có title/description/canonical/Open Graph/Twitter + JSON-LD (WebSite, WebApplication, TouristAttraction, FAQPage) và hộp thoại **ℹ Giới thiệu** (`<dialog id="about">`, khối `.seo-copy` bên trong: lời giới thiệu `.about-intro` + ghi nguồn AGPL/ODbL/Overture/SRTM; nút `#about-btn` trong bảng chính, `hud.js`) — người xem mở được, bot đọc được trong HTML vì cảnh 3D là canvas. Màn hình không có WebGL dùng lại `.about-intro`. `public/manifest.webmanifest` (icon `icon-192/512.png` vẽ từ `favicon.svg`); font Fredoka tự phục vụ (`public/fonts/`, `@font-face` trong `style.css`, `font-display: swap`) — không gọi Google Fonts. `public/og.png` (1200×630) là ảnh chụp tháp. `tools/seo/plugin.js` (dùng trong `vite.config.js`) thay `%SITE_URL%` và sinh `robots.txt` (cho phép cả bot AI), `sitemap.xml`, `llms.txt` lúc build; đổi tên miền: `SITE_URL=https://… npm run build` (mặc định `https://thapnghinhphong.vn/`; `public/CNAME` + deploy Pages ở gốc `/`). Sửa số liệu về tháp thì sửa cả JSON-LD, `.seo-copy` và `llms.txt`. Test: `tests/unit/seo.test.js`.

## Nhiều world

`main.js` là App (renderer, camera, HUD, âm thanh, vòng lặp) và hiện **một** `World` (`src/World.js`)
tại một thời điểm; nút chọn world (góc trên trái, một nút mỗi world trong `WORLDS`), phím N hay
`?world=<id>` đổi world. Mỗi world dựng từ một **WorldConfig** trong
`src/worlds/` (seed, kích thước, vòng ray, sông, địa hình, **các điểm dừng**, hầm nếu có, **danh
sách feature**).

- **World = lõi + feature.** Lõi (ray, địa hình, hầm, cầu, trời, thời tiết) luôn có. Còn lại là feature
  trong `src/features/` (ga, làng, trạm + phố, cối xay, cừu, cây, mây, tàu, cá, thuyền, khinh khí cầu,
  dân làng, chim, người leo núi, đường, xe cộ, máy bay), bật/tắt và chỉnh bằng `cfg.features`: `'sheep'` hoặc
  `{ id: 'sheep', flocks: 5 }`. Feature mới: viết `{ label, needs?, after?, build(world, { rng, ...options }) }`
  (kiểu `Feature`), thêm vào `features/index.js` — import tĩnh nếu world được hiện (`SHOWN`) dùng nó, không thì
  một dòng `LAZY` (`() => import(...)`: nạp cùng world dùng nó). Feature dựng theo thứ tự trong config; feature sau dùng
  được thứ feature trước để lại (`world.stations`, `world.train`, `world.people`…; kiểu của chúng: `WorldOutputs`
  trong `types.d.ts`). Khai báo phụ thuộc
  bằng `needs: ['train']` (hoặc `[['station', 'halt']]` = một trong hai); `after: ['busstop']` = nếu world có
  feature đó thì nó phải đứng trước (không bắt buộc có) — `World` kiểm tra cả danh
  sách **trước khi dựng**. Thứ cần từ config (một điểm dừng, một zone) thì `world.need(...)` lúc dựng.
- **Nạp từng phần (code splitting)**: `worlds/index.js` chỉ import tĩnh world trong `SHOWN`; world ẩn nạp bằng
  `loadWorld(id)` (`import()`, chunk riêng), cả bốn một lúc cho test/tools: `worlds/all.js` (`WORLDS`). Feature chỉ
  world ẩn dùng (ray, ga, làng, cừu, đường + xe làng, máy bay…) nạp bằng `loadFeatures()` — **`await world.load()`
  trước `world.steps()`** (main.js, `features.spec.js`; unit test nạp hết bằng `loadFeatures(FEATURE_IDS)`).
  `vite.config.js` (`preloadApp`) thêm `<link rel="modulepreload">` cho chunk app + các chunk nó import + dữ liệu bản đồ
  NGHINH PHONG (`PRELOAD`), tải song song với entry. Đo (2026-10-06, `vite build`): main 953 KB / 285 KB gzip → JS lúc đầu
  886 KB / 263 KB gzip (main 609 / 183 + chunk dùng chung nó import, phần lớn `lowpoly` + three: 277 / 80); feature + config
  của world ẩn ~72 KB, chỉ tải khi mở chúng.
- **Điểm dừng**: `cfg.stops: [{ id, at, name, zone?, yard? }]`, bao nhiêu cũng được. Địa hình san phẳng
  khu nhà cho điểm có `zone`, sân ga cho điểm có `yard`. Dựng gì ở đó là việc của feature: `station` /
  `halt` nhận `{ stop: id }` (mặc định: điểm dừng đầu tiên chưa dựng), `halt` chỉ có khu phố khi điểm
  dừng có `zone`, `village` mặc định thuộc ga vừa dựng trước nó. Tàu dừng theo thứ tự `world.stations`.
  Hầm: bỏ `cfg.tunnel` là không có hầm.
- **Mọi thứ chuyển động là một system**: `{ group?, update?(f), lateUpdate?(f), finish?(), dispose?() }`.
  `update` chạy trước khi camera đi theo, `lateUpdate` sau camera + bầu trời (có `f.lights`,
  `f.overcast`, `f.snow`). `f` là 1 object dùng lại mỗi frame (`World.frame`) — đừng giữ tham chiếu
  sang frame sau. Không thêm lời gọi riêng vào vòng lặp trong `main.js`.
- **Dùng chung trong 1 world thì đăng ký, đừng truyền tay**: `world.site` (vật cản `obstacles`,
  `colliders` cho người, `solids` cho tầm nhìn camera, `surfaces` để đi lên — `site.spotOK`,
  `site.walkHeight`, `site.occludes`), `world.batch` (khối tĩnh, gộp ở bước cuối), và các service tạo
  lần đầu khi cần (`world.service`, ở `src/services/` — không phải feature): `lamps(world)` (cửa sổ/đèn sáng ban đêm),
  `houses(world)` (nhà rỗng + cửa + khói), `waterLife(world, rng)` (chỗ nước sâu + gợn sóng); `curfewOf`
  (`world/night.js`), `coastOf` (`world/coast.js`). Service có `tick(world, f)` được gọi mỗi frame trước các system
  (Curfew: giờ, camera thấy gì) — lõi không gọi tên service nào. Người camera nghe thấy ngoài `people`/`pedestrians`:
  feature đăng ký `world.voices.push((out) => …)` (bãi biển). Lõi còn biết đúng một feature: `checkSeal()` với tháp
  `nghinh-phong` (niêm phong, cố ý để cứng).
- **Ngẫu nhiên theo feature**: mỗi feature một luồng `rng` riêng (seed world + id), thêm/bớt feature
  không xáo trộn feature khác. `stream: n` cho các feature dùng chung một luồng — PYN dùng 2 luồng như
  bản gốc (0 cho phong cảnh, 7 cho sự sống) để giữ nguyên từng cái cây; **đổi thứ tự hay thêm feature
  vào giữa các feature cùng `stream` sẽ làm PYN khác đi**.
- **Thứ khác nhau giữa các world thì đọc từ `cfg`/`world`, không import hằng số hay hàm cố định.** Sông là
  `cfg.riverX` (JS) và `cfg.riverGLSL` (shader nước), cả hai sinh từ `cfg.river` trong `defineWorld()`.
  `config.js` chỉ còn hằng số chung cho mọi world (`TRACK_Y`, `WATER_Y`, `GAUGE`…).
- **Mỗi world một `THREE.Scene`.** Không đặt 2 world cạnh nhau trong 1 scene bằng cách dịch group:
  `Instancer`/`ParticlePool` vẽ theo tọa độ thế giới (xem bên dưới).
- **Cache cấp module dùng chung giữa các world phải qua `keep()`** (`lowpoly.js`): `World.dispose()`
  giải phóng mọi geometry/material/texture trong scene trừ thứ đã `keep()`. Thêm cache mới (Map ở cấp
  module) mà quên `keep()` thì đổi world sẽ dispose mất đồ của world sau (vẫn chạy, nhưng upload/biên
  dịch lại).
- `CameraRig` tạo 1 lần (nó nghe sự kiện bàn phím/chuột), gắn vào world bằng `rig.attach(world.view)`.
- Đã đo (2026-09-29): PYN sau khi tách (cả WorldConfig lẫn feature) giữ nguyên từng đỉnh (checksum
  geometry), vị trí từng cây/đá/hoa (checksum instance), 1684 collider, 273 draw call mỗi frame (con số
  546 ghi trước đây là đếm gộp 2 frame), 36 shader; đổi
  PYN ↔ MAPLE nhiều vòng, số geometry/texture/shader trên GPU không tăng, heap JS gần như phẳng
  (~0,2 MB mỗi lần đổi).

## Thế giới từ bản đồ thật, NGHINH PHONG, vỏ app — tóm tắt

Chi tiết (định dạng dữ liệu, công cụ import, phố/nhà/xe/người, công trình, bãi biển, đời sống phố, âm thanh, ban đêm,
đồng hồ, bảng điều khiển, vỏ app, tác giả, các số đo) ở **`docs/real-worlds.md`** — đọc phần liên quan trước khi sửa.
Luật phải nhớ:
- World từ bản đồ dùng `defineGeoWorld()`; dữ liệu `src/worlds/data/<id>.json` (`world/geodata.js`, `checkWorldData()`),
  dựng bằng `tools/import/build.mjs`. Môi trường này chặn OpenStreetMap → dùng Overture (`tools/import/overture.py`).
  Địa danh đặt tay phải khớp bản đồ (`checkPlaces`, cảnh báo > 200 m) — đối chiếu thêm Google Maps.
- Sông qua `world.rivers`, **đừng đọc `cfg.riverX` trực tiếp**. Kích thước đồ vật hỏi `world.scale` (mục Tỉ lệ).
- **Dòng chữ trên biển được niêm phong** (`world/seal.js`): **đừng sửa/bỏ/đổi cách vẽ**; `world.checkSeal()` gọi `tamper()`
  khi tấm chữ bị bỏ, ẩn, đổi cỡ hay texture. World có tháp mà không có tấm chữ cũng bị chặn. Test `seal.test.js`, `seal.spec.js`.
- Giao thông: **mọi pha đèn đều phải `update`** (kể cả pha không có cột đèn); `gapTo` chỉ bỏ qua xe ngược chiều *và* lệch
  sang bên; xe không quay đầu giữa ngã tư (`trimEnds`). Kết quả `updateTraffic` phải giữ nguyên từng số (có test so với bản cũ).
- Ban đêm / nhịp ngày (`world/night.js`): `rank` theo tỉ lệ vàng, **không dùng rng** (golden mọi world không đổi);
  7:00–9:30 mọi lô đủ 100 % (app/test mở lúc 9 h).
- **Test luôn mở bằng `?clock=fast`** (`openWorld`); app mặc định giờ Việt Nam thật. Lượt tua 300 s bắt đầu từ world
  vừa dựng (trang tạm dừng ngay khi tải).
- `SHOWN` (`worlds/index.js`) chỉ có NGHINH PHONG; world khác nạp lười (`loadWorld`) và mở bằng `?world=<id>`.
- Vỏ app: `src/boot.js` thử WebGL rồi mới nạp `main.js`; **mức chất lượng quyết định trước `precompile()`** (máy bàn = như cũ).
- Người (`Person`): bone thu về 0 (ẩn bộ phận) chỉ **sau** `skinFigure`.

## Nội dung thuyết minh (Tháp Nghinh Phong)

Lời thuyết minh, JSON-LD, `.seo-copy` và `llms.txt` chỉ nói điều **nhiều nguồn độc lập cùng nêu** (cổng thông tin Sở VHTTDL Phú Yên, báo, Tạp chí Kiến Trúc): HUNI architectes thiết kế, **hoàn thành 30/11/2021** (ý tưởng 2019–2020, đừng viết "thiết kế năm 2021"), hai tháp mỗi tháp 50 cột đá lục giác, Lạc Long Quân 35 m và Âu Cơ 30 m, khe đón gió 2 m × 15 m, phù điêu trên hai vách, quảng trường **hơn 7 000 m²**, đèn nhiều màu ban đêm. **Chưa kiểm chứng nên không đưa vào lời** (dù mô hình 3D vẽ vậy): 7 190 m² chính xác, hình bán nguyệt, đá granite, tháp nào bên trái/phải, đèn đỏ trên đỉnh, cột xếp so le, cờ trước tháp. Đổi lời thì tạo lại bản thu (`node tools/tour/voice-vbee.mjs`); URL mỗi bản thu có đuôi `?v=<hash nội dung>` (`vite.config.js` `define __TOUR_VERSIONS__`, `src/app/tour.js`) nên bản thu mới không bị cache cũ giữ lại — test chặn mp3 dùng `'**/tour/*.mp3*'`.

## Tỉ lệ (`world.scale`, `world/scale.js`)

Kích thước vẽ ra hỏi `world.scale`, **đừng viết số đơn vị cứng** cho thứ có kích thước ngoài đời. Hai tỉ lệ
(như sa bàn mô hình): `scale.map` — đơn vị mỗi mét cho **vị trí** (địa hình, sông, bố cục phố, móng nhà;
1 cho PYN/MAPLE, 1/10 cho Tuy Hòa) — và `scale.props` — cỡ **đồ vật** (người, xe, cây, tàu, tầng nhà, làn
xe; mô hình dựng sẵn ≈ 1 đơn vị/mét). Bản đồ nhỏ quá thì đồ vật to hơn bản đồ `exaggerate` (3) lần:
`props = min(1, 3 × map)` (Tuy Hòa 0,3); world đặt thẳng được `cfg.scale = { props, exaggerate }`.
- `scale.m(mét)` theo bản đồ, `scale.prop(mét)` theo đồ vật, `scale.fit(mét)` cho thứ trên bản đồ mà đồ vật
  phải vừa (làn đường, tầng nhà) = lớn hơn trong hai tỉ lệ; `scale.want(loại)` = `SIZES[loại] × props`.
- **Kiểm tra tỉ lệ**: feature ghi cỡ đã vẽ `scale.note('storey' | 'lane' | 'person' | 'car' | 'tree' |
  'gauge' | 'carriage', đơn vị, tên)`; `scale.audit()` liệt kê thứ lệch quá `TOLERANCE` (1,5 lần) so với
  `SIZES` (mét, quy ước của sa bàn — toa tàu 9 m như mô hình). `tests/e2e/scale.spec.js` chạy cho mọi world;
  `PENDING` liệt kê thứ biết là lệch — **chỉ được bớt, không thêm** để cho qua. Loại vật mới: thêm vào `SIZES`
  và `note` ở feature vẽ nó.
- Đã theo `world.scale`: cây/hoa/đá (`trees`), nhà + phố từ bản đồ, **đường ray + tàu + ga**: `Track`
  nhận `k` (`track.k`, `track.gauge`, `track.railTop` — dùng thay `GAUGE` của `config.js`; `RAIL_TOP` đã bỏ),
  `buildTrackMeshes` nhân mọi mặt cắt với `k` (tà vẹt cách `k`), `Train({ k })` thu nhỏ từng toa và chạy
  lịch (`Schedule`) **trong đơn vị của mô hình** (quãng đường thế giới / k) → tốc độ, quãng phanh, chỗ dừng
  co theo, bánh xe/tiếng xình xịch vẫn đúng; bên ngoài đọc `train.s`, `train.v`, `train.length` (đơn vị thế
  giới). Sân ga (`buildPlatform`: dài/rộng/cao × k, tính bằng frame ≈ 1 đơn vị), nhà ga, mái che trạm, bồ
  câu (`Pigeon` `size`), khói tàu (`Smoke` `size`), sân ga san phẳng/dọn trống, chắn tàu, camera phím 2 — đều
  × k; xe trên phố thật (`Vehicle({ k })`) và người đi dạo (`strollers`) cũng vậy. **Chưa**: dân làng
  (`villagers`), đường `road` + `traffic`, nhà làng (`houses`), phố của trạm `halt` — hiện chỉ PYN/MAPLE dùng
  (k = 1). Chuyển tiếp: nhân kích thước/tốc độ/khoảng cách
  với `scale.props` (viết `số * k` để k = 1 ra đúng từng bit như cũ — golden PYN/MAPLE giữ nguyên), `note`
  cỡ đã vẽ, kiểm tra bằng `scale.spec.js`.

## Phương tiện

Thư viện `src/world/vehicles/`, feature `road`, `traffic`, `aircraft`, `citytraffic` — chi tiết ở **`docs/vehicles.md`**.
Luật: thêm loại xe = một mục trong `KINDS` (`vehicles/kinds.js`); đường không được cắt nước hay đè ray (trừ chắn tàu);
`features/road.js` gọi các phần **theo đúng thứ tự** (đổi thứ tự là đổi golden MAPLE); mỗi loại xe 2 InstancedMesh,
không thêm đèn thật.

## Quy tắc render (ĐỪNG phá)

Mọi thứ dựng hình dùng chung nằm ở `src/world/lowpoly.js` và `src/world/particles.js`. Logic của
từng vật (Sheep, Fish, Walker, Train…) vẫn là class riêng; **phần vẽ thì dùng chung**. Chọn đúng
công cụ theo loại vật:

| Loại vật | Dùng | Không dùng |
|---|---|---|
| Đứng yên (nhà, ga, cối xay, hàng rào…) | `StaticBatch`: `batch.at(x,y,z,ry)` rồi `batch.add(parts, mat)`, cuối cùng `group.add(batch.build())` | `new THREE.Mesh` cho từng khối |
| Nhiều bản **giống hệt nhau** có cử động (cừu, cá, cánh cửa nhà…) | `Instancer`: mỗi con chỉ giữ `Object3D` rỗng làm anchor, cả đàn 1 InstancedMesh cho mỗi bộ phận | SkinnedMesh (xem bên dưới) |
| Nhiều bản giống nhau đứng yên (cây, đá, hoa) | `InstancedMesh` như trong `features/trees.js` | |
| Nhân vật có khớp, **mỗi con một khác**, ≥ ~8 bộ phận (người, toa tàu) | `skinFigure()`: khớp là `THREE.Bone`, cả con thành 1 SkinnedMesh | Để từng bộ phận là mesh riêng |
| Hạt sống ngắn (khói, gợn nước, bụi, lá rơi…) | `ParticlePool` / `Smoke` / `Ripples` | Mỗi hạt 1 mesh + 1 material |
| Bộ phận gộp sẵn của 1 vật động (1 cái cần câu…) | `segment(parts)` | |

Các khối cơ bản `box/ball/cyl/cone/prism/slab` tô màu theo đỉnh → mọi thứ dùng chung
`VERTEX_COLORED`, không cần material theo màu.

### Những lỗi dễ mắc

- **`lam(color)` trả về material DÙNG CHUNG (cache).** Không bao giờ sửa nó sau khi tạo
  (`emissiveIntensity`, `color`, `opacity`…) — sẽ đổi màu cả thế giới. Vật nào đổi độ sáng theo
  ngày/đêm, thời tiết, hay từng con (cửa sổ, đèn, khinh khí cầu, mây) thì tạo riêng bằng
  `new THREE.MeshLambertMaterial(...)` và ghi chú lý do.
- **SkinnedMesh có chi phí cố định lớn** (mỗi frame upload texture xương ~ bằng hơn chục draw
  call thường). Chỉ đáng dùng khi thay được nhiều mesh (người 11 bộ phận, toa tàu 9–13). Con vật
  nhỏ, giống nhau → `Instancer`. Đã đo: 79 SkinnedMesh (khi cừu/cá cũng skin) tốn ~2,5 ms mỗi
  frame, ~30 µs mỗi cái so với ~2 µs một draw call thường.
- `skinFigure(owner, rootBone, mat)`: gọi khi các khớp **đang ở tư thế nghỉ** và `owner` chưa bị
  scale/đặt vị trí (đặt `group.scale` SAU khi gọi). Chỉ mesh có đúng `mat` được gộp; mesh khác
  material (đèn, cửa kính, tờ báo…) vẫn gắn vào bone như bình thường.
- Khớp của người là `THREE.Bone` — không ẩn được bằng `.visible`. Muốn ẩn một bộ phận (cái ô) thì
  `bone.scale.setScalar(0)`; ẩn cả người thì ẩn `person.group`.
- `Instancer` và `ParticlePool` đặt `frustumCulled = false` và vẽ theo tọa độ thế giới: mesh của
  chúng phải nằm trong group có transform đơn vị (không di chuyển/scale group chứa nó). Anchor phải
  nằm trong scene (để `matrixWorld` được cập nhật).
- `StaticBatch.build()` gộp theo material: mọi part trong cùng material phải có cùng attribute
  (dùng các helper của `lowpoly.js` là đảm bảo).
- `variant()` trong `lowpoly.js` tách material cho mesh skinned/instanced (khác shader program).
  Nếu thêm `onBeforeCompile` cho material, `variant()` đã chép sang — đừng dùng `mat.clone()` trần.
- **Shader được biên dịch trước lúc loading** (`precompile()` trong `main.js`: bật tạm mọi vật đang
  ẩn → `compileAsync` → vẽ 1 frame). Đừng đổi cấu hình renderer (loại shadow map, tone mapping…)
  sau đó: khóa shader đổi → biên dịch lại toàn bộ lúc chơi. `PCFSoftShadowMap` đã bị three r186 bỏ
  và tự đổi thành `PCFShadowMap` ở frame đầu — từng làm mọi shader biên dịch 2 lần; dùng thẳng
  `PCFShadowMap`.
- **Kiểm tra tầm nhìn camera không raycast vào mesh gộp** (~28 nghìn tam giác + từng cây instanced,
  ~3 ms/tia). Dùng `site.occludes(a, b)` (`world/site.js`): hộp cho nhà/ga, trụ cho cối xay/tán cây.
  Thêm công trình lớn thì thêm `site.solidBox(...)` cho nó.
- `ParticlePool` bỏ qua upload khi không còn hạt nào; đừng sửa `items` từ bên ngoài mà không qua
  `spawn()`.
- **Không thêm `PointLight`/`SpotLight` cho đèn trang trí.** Mỗi đèn được tính cho mọi pixel của
  mọi vật có chiếu sáng, kể cả ban ngày khi cường độ = 0. Đèn ga/phố/cửa nhà = bóng đèn `lampMat` +
  quầng sáng (`halos`) + vũng sáng dưới đất (`pools`) của `lamps(world)` (`services/lamps.js`). Chỉ còn đèn pha tàu là
  đèn thật.
- **Dáng đi của người tính theo quãng đường, không theo thời gian** (`Walker.step` trong `world/walker.js`:
  `gait += s·π / (STEP_LENGTH·scale)`, nửa chu kỳ = 1 bước). Đừng đổi lại thành `t × tốc độ` (tay
  chân vung loạn khi đổi tốc độ). Trong `Person.pose()` đầu gối chỉ gập khi chân đang **vung về
  trước**; đổi chiều là người đi moonwalk. Đo: chân trụ trượt 4,16 → 0,04 m mỗi mét đi.
- **Thứ chuyển động đều theo thời gian thì tính trong shader** (uniform `uTime`): sóng nước, dòng
  chảy, lá trôi (`water.js`), mưa, tuyết rơi (`weather.js`). CPU chỉ gán 1 số mỗi frame.

## Đo trước khi tối ưu

Bật `?stats` (chỉ ở dev). Khi đổi cách render: ghi số draw call và ms/frame ở cùng góc camera **trước và sau**. Ít draw
call hơn **không** tự động nhanh hơn. `window.__pyn` (dev) có `{ W, renderer, post, rig, camera, state }`. Các mốc đã đo
và việc còn lại: **`docs/performance.md`**.

## Tài liệu chi tiết

- `docs/real-worlds.md` — thế giới từ bản đồ thật, NGHINH PHONG, vỏ app, các feature phố/biển/đêm.
- `docs/vehicles.md` — đường, giao thông, đèn, chắn tàu, máy bay.
- `docs/performance.md` — số đo hiệu năng theo thời gian, việc còn lại.
