# PYN World · Train Diorama

Thung lũng low-poly có đoàn tàu hơi nước chạy vòng, dựng hoàn toàn bằng code (procedural) với Three.js — không dùng file model 3D, không dùng file âm thanh.

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # xuất ra dist/ (site tĩnh, deploy lên Netlify/Vercel)
npm run check    # lint + kiểu + unit test + e2e (lần đầu: npx playwright install chromium)
```

## Cấu trúc

| File | Vai trò |
|---|---|
| `src/main.js` | App: renderer, camera, vòng lặp frame, dựng và đổi world |
| `src/app/` | Quanh App: `loader.js` (màn hình loading), `keys.js` (phím tắt), `perf.js` (tự hạ độ phân giải, bảng `?stats`) |
| `src/World.js` | Một thế giới hoàn chỉnh dựng từ 1 WorldConfig: scene riêng (cả trời, đèn, sương mù), lõi (ray, địa hình, hầm, cầu, trời, thời tiết) + các feature trong config; vòng lặp chung cho mọi system (`update` / `lateUpdate`), `dispose` |
| `src/features/` | Những gì đặt vào một world, bật/tắt bằng `cfg.features`: `station` (ga chính), `village` (làng), `halt` (trạm dừng + khu phố), `windmill`, `sheep`, `trees` (cây/hoa/đá), `clouds`, `train`, `fish`, `boats`, `balloons`, `villagers` (dân làng/dân phố đi lại, đi tàu), `birds`, `hikers` (đường mòn + người leo núi). Dịch vụ dùng chung: `lamps.js` (đèn ban đêm), `houses.js` (nhà rỗng, cửa tự mở, khói ống khói), `platform.js` (sân ga), `waterlife.js` (gợn nước) |
| `src/features/villagers/` | Phần của dân làng: `areas.js` (lưới dẫn đường + chỗ đến ở mỗi trạm), `riding.js` (lên/xuống tàu), `kids.js` (trẻ em đi theo bố mẹ) |
| `src/types.d.ts` | Hợp đồng giữa App, World và feature (`WorldConfig`, `StopConfig`, `System`, `Frame`, `Feature`…), dùng qua JSDoc; `tsc` kiểm tra các file có `// @ts-check` |
| `tests/unit/` | Unit test (Vitest, `npm test`): tiện ích, config world, kiểm tra `needs`, `Track.distanceTo`, `Site`, `NavGrid`, lịch chạy tàu, thuyền, chim |
| `tests/e2e/` | E2E (Playwright Test, `npm run e2e`): dựng mọi world trong Chromium không giao diện, so với `tests/e2e/golden/`, tua nhanh mô phỏng, đổi world, thử tổ hợp feature |
| `.github/workflows/` | CI/CD: `ci.yml` (lint, kiểu, unit, build, e2e, deploy GitHub Pages), `pr.yml` (tiêu đề PR + commit theo Conventional Commits), `labeler.yml` (gắn nhãn tự động) |
| `src/world/vehicles/` | Phương tiện dùng cho mọi world: `kinds.js` (xe đạp, xe máy, ô tô, xe bán tải, xe tải, máy bay), `fleet.js` (vẽ cả đội xe bằng Instancer), `vehicle.js` (chạy theo đường, bánh quay, xe 2 bánh nghiêng vào cua, người đạp xe, máy bay nghiêng cánh), `path.js` (đường khép kín theo độ dài), `traffic.js` (giữ khoảng cách, dừng cho người đi bộ, đèn đỏ, chắn tàu, nhường vòng xoay). Bật bằng feature `road` / `traffic` / `aircraft` — xem CLAUDE.md |
| `src/world/roads/` | Mạng đường: `network.js` (đường vòng + vòng xoay + nhánh ra vòng quay đầu + phố cắt ngang ở ngã tư → các tuyến xe chạy), `signals.js` (chu kỳ đèn giao thông, đèn ngã tư hai pha, chắn tàu theo tàu), `paint.js` (mặt đường, vạch kẻ bám địa hình, gộp vào batch), `props.js` (cột đèn, đèn đi bộ, cột chắn tàu, thanh chắn), `walkmap.js` (vỉa hè / lòng đường / vạch sang đường cho người đi bộ), `builder.js` (đồ nghề chung khi dựng một con đường), `parts/` (mỗi thành phần một file: đường vòng, vòng xoay, nhánh + chắn tàu, phố + ngã tư, vạch sang đường, vòng quay đầu, vỉa hè) |
| `src/world/site.js` | "Cái gì ở đâu" trong một world: vật cản khi đặt đồ, collider cho người đi vòng, khối chắn tầm nhìn camera, mặt đi được (sân ga, sàn nhà) |
| `src/world/walker.js` | Người đi theo waypoint (dáng đi theo quãng đường), dùng cho dân làng và người leo núi |
| `src/worlds/` | Các WorldConfig: `pyn.js` (thung lũng gốc), `maple.js` (MAPLE VALE: 3 trạm, không hầm, đường vòng có xe chạy, máy bay), `tuyhoa.js` (Tuy Hòa từ bản đồ thật: độ cao SRTM, bờ biển, sông Đà Rằng và hồ theo bản đồ, Núi Nhạn, ~900 đường phố và ~26 000 ngôi nhà thật, đường sắt Bắc–Nam với tàu con thoi); `index.js` liệt kê chúng; `data/` là dữ liệu bản đồ (`tuyhoa.json`). Mở thẳng một world bằng `?world=<id>` |
| `src/world/geo.js`, `geodata.js`, `rivers.js` | Bản đồ thật: đổi kinh độ/vĩ độ ↔ (x, z); định dạng file dữ liệu world (kiểm tra + chiếu vào sa bàn); sông (hàm `riverX` hay đường gấp khúc có bề rộng) |
| `src/landmarks/` | Công trình nổi tiếng cho world bản đồ thật: `nghinh-phong.js` (Tháp Nghinh Phong + quảng trường, LED ban đêm), `thap-nhan.js` (Tháp Nhạn); `index.js` đăng ký; feature `landmarks` dựng, phím V bay tới |
| `src/world/scale.js` | Tỉ lệ của world: tỉ lệ bản đồ + tỉ lệ đồ vật, kích thước chuẩn (`SIZES`), kiểm tra tỉ lệ (`audit`) |
| `src/world/landcover.js` | Lớp phủ đất (biển, bãi cát, phi lao ven biển, phố, rừng, ruộng, cỏ) từ độ cao + khoảng cách tới biển + mật độ nhà: màu đất và mật độ cây |
| `src/features/streets.js`, `buildings.js` | Phố và nhà thật của world bản đồ (`cfg.roads`, `cfg.buildings`): đường vẽ lên mặt đất (cầu + trụ khi qua sông, nâng lên khi qua ray), nhà là khối InstancedMesh theo hình chữ nhật của móng, mái ngói cho nhà thấp, cửa sổ sáng ban đêm |
| `src/features/citytraffic.js`, `strollers.js` | Xe cộ (xe máy, xe đạp, ô tô, xe tải) chạy trên phố chính thật, người đi bộ trên vỉa hè và quanh quảng trường — vẽ theo `world.scale` |
| `tools/import/` | Dựng file dữ liệu world: `build.mjs` (độ cao SRTM + sông/ray/địa danh từ file công thức, hoặc ray/phố/nhà/mặt nước từ bản trích OpenStreetMap), `srtm.mjs`, `osm.mjs`, `overture.py` (tải bản trích từ Overture Maps trên AWS khi không vào được OSM), công thức `tuyhoa.vectors.json` |
| `src/config.js` | Hằng số chung cho mọi world (độ cao đường ray, mặt nước, khổ ray) |
| `src/world/track.js` | Đường ray (CatmullRomCurve3) — vòng khép kín hoặc tuyến hai đầu (có ụ chắn cuối tuyến), sweep profile → ballast, ray, cầu, trụ cầu, tà vẹt (InstancedMesh) |
| `src/world/water.js` | Mặt nước: sóng, dòng chảy trên sông (vệt bọt trôi xuôi) và lá trôi — tất cả chạy trong shader |
| `src/world/terrain.js` | Heightmap từ noise, khoét sông, san phẳng dọc đường ray, nền làng và nền khu phố (`villageZone`), màu theo độ cao/độ dốc, nước, thành đất + bệ gỗ của diorama |
| `src/world/train.js` | Đầu máy + 3 toa trên đường ray: bánh xe/thanh truyền, cửa trượt, khói, tiếng xình xịch. Hình dáng ở `train/cars.js`; chạy, dừng từng ga, mở cửa, rời ga ở `train/schedule.js` (logic thuần, có unit test) |
| `src/world/interiors.js` | Nội thất toa khách (ghế nhung, bàn, cửa sổ, hành khách) và buồng lái (mặt nồi hơi, đồng hồ, lò than) — chỉ hiện khi camera ở bên trong |
| `src/world/people.js` | Con người low-poly: mặt, tóc, mũ, quần áo, khớp gối/khuỷu tay, đồ mang theo, ô khi mưa. Mỗi bộ phận gộp thành 1 mesh vertex-color |
| `src/world/tunnel.js` | Ngọn núi có đường hầm: mesh đồi riêng trùm lên đường ray, cửa hầm vòm đá, lòng hầm có đèn, thông trên đỉnh |
| `src/world/boats.js` | Hai con thuyền: `boats/steamer.js` (tàu hơi nước bánh guồng chạy dọc sông: khói, vệt sóng, thuyền trưởng) và `boats/rowboat.js` (thuyền câu: phao nhấp nháy → cá cắn → kéo cá lên → bỏ vào xô → quăng cần lại); `boats/parts.js` là phần dùng chung |
| `src/world/nav.js` | Lưới dẫn đường + A*: người đi vòng quanh nhà, cây, đá, cột; không leo mép sân ga (chỉ lên qua dốc) |
| `src/world/birds.js` | `birds/pigeons.js`: bồ câu trên sân ga (mổ, lắc đầu, giật mình bay đi khi có người/tàu tới, đậu lên mái); `birds/flocks.js`: các đàn chim bay trên trời với cánh gập ở khuỷu — tất cả vẽ bằng `Instancer` |
| `src/world/lowpoly.js` | Bộ dựng hình dùng chung: khối tô màu theo đỉnh, cache material (`lam`), `StaticBatch` gộp vật tĩnh, `Instancer` vẽ cả đàn vật giống nhau bằng 1 InstancedMesh/bộ phận, `skinFigure` biến nhân vật có khớp thành 1 SkinnedMesh. Quy tắc dùng: xem CLAUDE.md |
| `src/world/particles.js` | `ParticlePool` (1 InstancedMesh, opacity riêng từng hạt) và các lớp dùng lại nó: `Smoke` (tàu hỏa, tàu thủy), `Ripples` (gợn nước) |
| `src/world/sky.js` | Bầu trời shader, đồng hồ 24h pha trộn liên tục giữa 4 buổi (ngày đêm tự động), mặt trời + bóng đổ, sao |
| `src/world/weather.js` | Mưa (LineSegments), tuyết (Points), tuyết phủ mặt đất |
| `src/render/post.js` | Pixel art (render target độ phân giải thấp + NearestFilter) và viền mực (Laplacian của depth) |
| `src/cameras.js` | 5 chế độ camera, bay WASD, fly-to |
| `src/audio.js` | Âm thanh tổng hợp bằng Web Audio: tiếng xình xịch, ray, còi, mưa, chim |
| `src/hud.js` | Bảng điều khiển, nút chọn world (góc trên trái) |

## Dữ liệu bản đồ

World TUY HÒA dùng độ cao SRTM (NASA/USGS, public domain) và bản đồ từ
[Overture Maps](https://overturemaps.org) (đường sắt, đường phố, nhà, sông hồ) —
© OpenStreetMap contributors, cấp phép [ODbL](https://opendatacommons.org/licenses/odbl/); nhà có thêm
nguồn mở khác qua Overture. Nguồn ghi trong `sources` của `src/worlds/data/tuyhoa.json`.
