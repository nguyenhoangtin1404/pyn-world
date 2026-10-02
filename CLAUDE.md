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
| `npm test` | Unit test Vitest (`tests/unit/`): tiện ích, config world, `needs`, `Track.distanceTo`, `Site`, `NavGrid`, lịch chạy tàu (`Schedule`), thuyền, chim, phương tiện (đường vòng, giao thông, xe nghiêng vào cua) | ~1 s |
| `npm run e2e` | Playwright Test (`tests/e2e/`): dựng mọi world trong Chromium không giao diện (GPU phần mềm — cùng kết quả mọi máy) | ~45 s |

E2E gồm:
1. **So với golden** (`tests/e2e/golden/<id>.json`): checksum mọi đỉnh, vị trí từng cây/đá/hoa, số
   collider, spot, trạm, số người, draw call, shader. Lệch 1 cái cây cũng báo, kèm diff.
2. **Tua nhanh 300 s**: người lên/xuống tàu, cửa mở, bật ô khi mưa, người leo núi đi, tàu dừng ≥ 2 lần.
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

**Commit và tiêu đề PR** theo Conventional Commits (`commitlint.config.js`): `feat(world): …`,
`fix(people): …`, `perf: …`, `refactor: …`, `test: …`, `docs: …`, `ci: …`, `chore: …`; thêm `!` nếu phá
tương thích (`refactor!: …`). Hook `.githooks/commit-msg` chặn message sai ngay khi commit; CI soát lại
từng commit và tiêu đề PR (PR được squash-merge theo tiêu đề).

**GitHub Actions** (`.github/workflows/`):
- `ci.yml` — mỗi PR và mỗi push lên `main`: Lint & types, Unit tests, Build (artifact `dist`), E2E
  (artifact `playwright-report` có trace khi đỏ). Sau khi tất cả xanh trên `main`: **deploy GitHub
  Pages** — tắt cho tới khi bật Settings → Pages → Source "GitHub Actions" và đặt biến repo
  `PAGES_ENABLED=true`.
- `pr.yml` — tiêu đề PR và mọi commit theo Conventional Commits.
- `labeler.yml` — nhãn tự động: khu vực theo file đổi (`.github/labeler.yml`), `type: …` theo tiêu đề,
  `size: XS…XL` theo số dòng đổi, `breaking change` khi có `!`. Chạy bằng `pull_request_target` nên
  gắn được nhãn cho PR từ fork; **không** checkout hay chạy code của PR trong workflow đó (đừng thêm).

**Kiểu dữ liệu**: hợp đồng giữa App, World và feature nằm trong `src/types.d.ts` (`WorldConfig`,
`StopConfig`, `System`, `Frame`, `Feature`, `Station`…); các file có `// @ts-check` được `tsc` kiểm tra
(lõi, config, feature). Bắt được: gõ sai trường của `f`/config, thiếu trường bắt buộc, sai kiểu. **Không**
bắt được: gõ sai tên hook trả về từ `build()` (`lateUpadte` sẽ lặng lẽ không chạy) — soát bằng mắt.
File mới trong `src/features/` hay `src/worlds/`: thêm `// @ts-check` ở dòng đầu.

## Nhiều world

`main.js` là App (renderer, camera, HUD, âm thanh, vòng lặp) và hiện **một** `World` (`src/World.js`)
tại một thời điểm; nút chọn world (góc trên trái, một nút mỗi world trong `WORLDS`), phím N hay
`?world=<id>` đổi world. Mỗi world dựng từ một **WorldConfig** trong
`src/worlds/` (seed, kích thước, vòng ray, sông, địa hình, **các điểm dừng**, hầm nếu có, **danh
sách feature**).

- **World = lõi + feature.** Lõi (ray, địa hình, hầm, cầu, trời, thời tiết) luôn có. Còn lại là feature
  trong `src/features/` (ga, làng, trạm + phố, cối xay, cừu, cây, mây, tàu, cá, thuyền, khinh khí cầu,
  dân làng, chim, người leo núi, đường, xe cộ, máy bay), bật/tắt và chỉnh bằng `cfg.features`: `'sheep'` hoặc
  `{ id: 'sheep', flocks: 5 }`. Feature mới: viết `{ label, needs?, build(world, { rng, ...options }) }`
  (kiểu `Feature`), thêm vào `features/index.js`. Feature dựng theo thứ tự trong config; feature sau dùng
  được thứ feature trước để lại (`world.stations`, `world.train`, `world.people`…). Khai báo phụ thuộc
  bằng `needs: ['train']` (hoặc `[['station', 'halt']]` = một trong hai) — `World` kiểm tra cả danh
  sách **trước khi dựng**. Thứ cần từ config (một điểm dừng, một zone) thì `world.need(...)` lúc dựng.
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
  lần đầu khi cần: `lamps(world)` (cửa sổ/đèn sáng ban đêm), `houses(world)` (nhà rỗng + cửa + khói),
  `waterLife(world, rng)` (chỗ nước sâu + gợn sóng).
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

## Thế giới từ bản đồ thật (giai đoạn 0–2)

World dựng từ dữ liệu thật (`src/worlds/tuyhoa.js`: Tuy Hòa, Phú Yên) dùng `defineGeoWorld()` thay cho
`defineWorld()`: công thức chỉ nêu file dữ liệu, đường ray nào, các điểm dừng (đặt theo **tên địa danh**
`place`, không theo `at`) và danh sách feature. App gọi `cfg.load()` trước khi dựng (nạp file bằng
dynamic import, kiểm tra, chiếu vào sa bàn) — sau đó world như mọi world khác.

- **File dữ liệu** `src/worlds/data/<id>.json`, định dạng version 1 trong `world/geodata.js`: toạ độ luôn là
  [vĩ độ, kinh độ] và mét (không phụ thuộc cỡ sa bàn); `frame` nói tâm, số mét mỗi đơn vị,
  `verticalScale` (phóng đại chiều cao); `heights` là lưới Int16 mét (base64, hàng 0 = bắc, biển < 0);
  `rivers` (đường gấp khúc + bề rộng mét), `rails`, `places`. `checkWorldData()` liệt kê **từng** lỗi.
- **Dựng file**: `node tools/import/build.mjs tools/import/<id>.vectors.json [--osm osm.json]` — độ cao
  SRTM 1″ (tự tải vào `.cache/dem`, không commit), biển = đất ≤ 0 m nối với mép biển (`sea: ['east']`)
  → bờ biển thật (đáy biển `SEA_BED` = −10 m). Ray, **phố, nhà, sông hồ dạng vùng** lấy từ bản trích
  OpenStreetMap (Overpass JSON `out geom`, `tools/import/osm.mjs`); thiếu thì dùng sông/ray vẽ tay trong
  công thức; địa danh của công thức thắng địa danh trùng id. **Môi trường này chặn OpenStreetMap**
  (overpass-api.de, geofabrik) nhưng vào được **Overture Maps** trên S3 (dữ liệu OSM đóng gói lại):
  `pip install pyarrow shapely` rồi `python3 tools/import/overture.py tools/import/tuyhoa.vectors.json >
  .cache/overture/tuyhoa.json` (chỉ đọc phần trong hộp, ~40 s) → `--osm .cache/overture/tuyhoa.json`.
  Bản trích ghi đúng dạng Overpass (thẻ OSM) nên OSM thật dùng y như vậy.
  **Địa danh đặt tay phải khớp bản đồ**: `build.mjs` so từng `places` của công thức với địa danh có tên
  trong bản trích (`checkPlaces`, theo tên hoặc một phần tên "Núi Nhạn – Tháp Nhạn") và cảnh báo nếu lệch
  > 200 m — Tháp Nghinh Phong từng bị đặt lệch 3 km (13.0917, 109.3262 thay vì 13.1163, 109.3076, nằm ngoài
  khung cũ); đối chiếu thêm với Google Maps khi thêm địa danh. Overture có danh sách địa danh nhưng phân
  loại lỏng (quán cà phê gắn "di tích") nên chỉ dùng để kiểm tra, không đưa vào file dữ liệu.
  **Gai độ cao** (một điểm SRTM cao hơn các điểm quanh > 12 m — nhiễu radar, nhà cao tầng) bị hạ về
  trung vị các điểm quanh (`despike`, xem NGHINH PHONG bên dưới); đỉnh núi thật luôn có điểm quanh gần bằng nên giữ nguyên. Ghi nguồn ODbL (`sources.map`,
  README).
- **Mặt nước dạng vùng** (sông Đà Rằng có cồn bãi, hồ): điểm lưới độ cao nằm trong vùng (trừ đảo) thành
  −4 m → nước tự hiện, `rivers` bỏ trống (sông vẽ tay rộng 1 km từng đè lên cả làng trên bãi bồi).
  `seaDistanceAt` chỉ tính tới **biển** (bãi cát/phi lao ven biển, không ven hồ). Địa hình không lấp chỗ
  nước này khi san hành lang đường ray (cầu tự có).
- **Phố + nhà** (định dạng: `roads` [{kind, name?, points}], `buildings` {count, data} — 7 số Int16 mỗi
  nhà: tâm dm đông/bắc của `frame.center`, dài, rộng dm, hướng 0,01°, số tầng, loại; `encodeBuildings` /
  `decodeBuildings`). Mỗi nhà là **hình chữ nhật nhỏ nhất bao móng** (`footprintRect`). Feature
  `streets` (`features/streets.js`): vẽ bằng `Paint` vào `world.batch` theo `meshHeightAt`, rộng bằng
  bề rộng thật hoặc số làn × `scale.fit(làn)` nếu rộng hơn, đường lớn đè đường nhỏ, vạch giữa đứt; qua nước thành cầu (mặt cầu ngang bờ,
  thành cầu, trụ), qua ray thì dốc lên đỉnh ray; tránh sân ga, pad công trình. Feature `buildings`
  (`features/buildings.js`): 5 InstancedMesh (khối nhà, mái ngói chóp cho nhà thấp < 220 m², gờ mái + bồn nước
  cho mái bằng); **chi tiết tường vẽ trong shader** của vật liệu khối nhà (`facadeMaterial`: kẻ sàn, cửa sổ có
  khung — vài cái có cửa chớp, vài cái để trống —, cửa ra vào có mái hiên + ban công ở một mặt; ~một nửa cửa sổ sáng
  ban đêm theo `uNight` do `lateUpdate` đặt; không thêm tam giác nào). Mỗi nhà một `aInfo` (số tầng vẽ, độ chênh
  nền, hạt giống, chiều cao gờ); các số này nội suy giữa đỉnh nên **làm tròn trước khi băm** (không thì cửa sổ nhấp nháy
  lấm tấm); cao = số tầng (bản đồ hoặc `likelyFloors`) ×
  `scale.fit(tầng)`; bỏ nhà trên phố, dưới nước, sát ray, trong sân ga/pad. Cả hai **claim** mặt đất
  (`site.claimRect`, lưới ô 0,5 → `spotOK` từ chối) để cây không mọc lên phố/nhà — nhiều nghìn vật,
  không dùng `obstacles` (quét tuyến tính). Thứ tự: `'station', 'landmarks', 'streets', 'buildings',
  'trees', …`. Lớp phủ `town` giờ tính từ **mật độ nhà** (`builtUp`, ô 5 đơn vị, > 5 % mặt đất có mái),
  vòng `landcover.town` vẫn dùng được.
- Đo (2026-09-30, Tuy Hòa, Chromium GPU phần mềm): 891 phố + 26 417 nhà; dựng phố 1 104 → 211 ms (tra điểm
  nhị phân, `Paint.tri` không cấp phát, màu parse 1 lần, `meshHeightAt` nhớ độ cao góc lưới — PYN/MAPLE
  giữ nguyên golden), nhà 70 ms; file dữ liệu 88 → 720 KB (330 KB gzip, chỉ tải khi mở Tuy Hòa); draw
  call góc mặc định 82 → 113.
- **Chiếu** (`world/geo.js`): phẳng quanh tâm, bắc = −z, đông = +x. Mặt đất: `WATER_Y + 0,6 +
  mét / metersPerUnit × verticalScale`; đáy biển (−10 m) dưới mặt nước → bờ biển tự hiện.
- **Sông** qua `world.rivers` (`world/rivers.js`): `distance(x, z)` (0–5 là lòng sông, 16 là lên bờ, như
  nhau cho sông 20 đơn vị hay cửa sông 1 km), `riverX` (chỉ world một sông) và GLSL cho nước. **Đừng đọc
  `cfg.riverX` trực tiếp** — PYN/MAPLE vẫn ra đúng từng số (`Math.abs(x − riverX(z))`). Thuyền (steamer
  chạy theo `riverX`) và người leo núi (cần vành núi) báo lỗi rõ ở world không có.
- **Đường ray hai đầu** (`cfg.trackClosed: false`): `Track.wrap` giữ trong [0, L], thêm frame cuối, ụ chắn
  ở hai đầu; tàu chạy con thoi (`Schedule.ends`, `dir`): tới cuối tuyến đứng 8 s (không mở cửa, không tính
  là một lần dừng) rồi lùi, đầu máy giữ nguyên vị trí trong đoàn (đẩy từ sau). Đường ray bản đồ bị cắt vừa
  trong sa bàn (`clipToSquare`).
- **Công trình nổi tiếng** (`src/landmarks/`, mỗi công trình một file, đăng ký trong `landmarks/index.js`):
  `{ name, radius, build(site) → { spot, view, system? } }` — thêm phần tĩnh vào `world.batch` tại
  `site` (x, y, z, xoay `ry`), tự đăng ký collider / solid (camera) / obstacle, trả system nếu có đèn đêm
  (vật liệu **riêng**, không dùng `lam()`). Công thức world ghi `landmarks: [{ model, place, rotation?,
  peak? }]` (`peak`: dời lên chỗ cao nhất trong bán kính đó — Tháp Nhạn trên đỉnh Núi Nhạn); `load()`
  tạo **pad** phẳng (`cfg.pads`, bán kính = `radius`) mà địa hình san theo, feature `landmarks` dựng
  (đặt trước `trees`). Phím **V** bay lần lượt tới từng công trình (`world.landmarks`). Có: Tháp Nghinh
  Phong (theo mô tả chính thức — HUNI architectes 2021: **hai tháp**, mỗi tháp **50 cột** đá **lục giác** (lăng trụ như cột bazan Gành Đá Đĩa, xếp so le kiểu tổ ong) từ thấp lên
  cao, cột nhọn **35 m** (Lạc Long Quân, bên trái nhìn từ đất liền) và **30 m** (Âu Cơ, bên phải); **khe đón gió 2 m ×
  15 m** hướng ra biển, phù điêu trên hai vách khe; **quảng trường 1/4 bán nguyệt 7 190 m²** (bán kính ~68 m) lát đá
  granite, mặt thẳng về phía phố, mặt cong có tường + lan can trên bãi cát; `columns()`: 6 hàng cột 2,5 m (ngang hai mặt phẳng), hàng lệch nửa cột, cách hàng 0,866; mỗi nửa là **hình nêm dài có mũi ở cả hai đầu**: hàng đầu (phía quảng trường) là **mũi** hẹp gồm vài cột thấp sát mặt lát nhô ra phía trước (`width` = 3, 5, 7, 8, 9, 10, 5, 3 cột, 8 hàng), mỗi hàng phía sau rộng hơn và cao hơn (một bậc/hàng) tới hàng cột nhọn (hàng thứ 7), và **sau lưng cột nhọn tháp không cắt phẳng** mà hạ bậc tiếp qua 2 hàng — mũi sau ngắn hơn (theo ảnh chụp từ trên cao); ra xa khe thì thấp dần; không cột nào cao quá 72 % cột nhọn; quảng trường theo tỉ lệ bản đồ, tháp ×1,5 bản đồ (≤ props); `rotation: 'street'` (`streetFrame` trong `worlds/define.js`: mặt thẳng của quảng trường **sát vỉa hè con đường gần nhất**, song song với nó — hướng là **đường thẳng khớp (trục chính của các điểm) qua đường phố trên đoạn dài bằng cạnh** (`along` = nửa cạnh), không phải tiếp tuyến tại một chỗ: điểm của phố thưa nên vài đỉnh liền kề lệch 2–3°, cạnh dài 27 đơn vị lệch 1 đơn vị ở một đầu; đo `claimAt` từ cạnh tới lòng đường: 1,0–2,0 → 0,1–0,6 — mặt cong quay ra xa đường; vị trí dời theo pháp tuyến cho cạnh thẳng nằm **đè lên 0,4 bề rộng vỉa hè ngoài cùng** (không chừa khe: từng chừa 0,5 đơn vị ≈ 2,5 m nên hở cỏ), và mặt lát là **mặt phẳng nghiêng** đi qua độ cao vỉa hè dọc cạnh thẳng (hồi quy 9 điểm, `max(ground, deck) + 0,05` như `streets.js`) — trước đây phẳng theo điểm đất cao nhất nên cao hơn vỉa hè tới 0,4 đơn vị, một bức tường chắn giữa hai bên; chân cột tháp thò xuống 0,3 dưới mặt lát cho khỏi hở chỗ dốc; `walkHeight` cho người đi dạo; công trình khai báo `back` = mét từ tâm tới cạnh thẳng; `'sea'` quay theo độ dốc khoảng cách tới biển); `walk`: người đi dạo đi vòng
  tháp trên mặt lát; ban đêm **đèn gắn trên đỉnh viên đá**, cứ một viên sáng thì viên bên cạnh tắt (bàn cờ `(i + j) % 2`), mỗi đèn một màu ánh sáng chỉ phủ lên mặt các viên cao hơn kề bên (tấm mỏng từ đỉnh đèn lên ≤ 3 m, không có chùm sáng lơ lửng); **cờ Việt Nam** trên cột trước tháp (giữa tháp và phố, thổi từ biển vào: lưới 18 × 10, sóng tính trong shader (`uTime`) nên geometry đứng yên, càng xa cột càng mạnh; texture canvas đỏ + sao vàng, `emissiveMap` tự sáng khi trời tối); **6 khinh khí cầu bay quanh tháp** (`balloons` `{ near: 'landmark', big: 2 }`: mỗi quả một vòng + độ cao riêng, cỡ theo `scale.props`, hai quả đầu to ×1,7); **dòng chữ "HOÀNG SA, TRƯỜNG SA LÀ CỦA VIỆT NAM"** trên mặt biển ngoài khơi tháp (một dòng duy nhất, canvas Arial đậm đỏ viền trắng, tấm phẳng nằm sát mặt nước, tìm chỗ nước sâu > 1 đơn vị dọc trục +x của công trình, đọc được khi đứng ở quảng trường nhìn ra biển); **dòng chữ được niêm phong** (`world/seal.js`, **đừng sửa/bỏ/đổi cách vẽ**): câu chữ không nằm dạng text trong mã (xáo trộn, chỉ giải mã trong `seal.js`), mỗi lần đọc đều so checksum, texture ghi lại điều thực sự đã vẽ, và `world.checkSeal()` (lúc dựng xong + mỗi ~45 frame, cộng một lần trong `lateUpdate` của tháp) kiểm tra tấm chữ còn trong scene, hiện, đúng cỡ, đúng texture — sai một cái là `tamper()`: hiện lỗi "Ứng dụng đã bị chỉnh sửa nên không thể tải" lên trang và ném exception; world có tháp mà không có tấm chữ cũng vậy. Chỉ làm khó chứ không chặn tuyệt đối (ai có bản JS cũng sửa được; chặn thật phải ở máy chủ). Test: `tests/unit/seal.test.js`, `tests/e2e/seal.spec.js`; không còn cột đèn trên quảng trường — và đỉnh hai cột nhọn đèn đỏ; hai cột nhọn vẽ cao ×1,4 (`SPIRE`) so với số đo để nổi hẳn trên khối bậc thang, `columns()` vẫn trả mét thật; **3–4 cột phụ kề bên mỗi cột nhọn cao dần theo từng bậc** (`near` = 1..4 cột cách cột nhọn dọc khe hoặc ra ngoài: 68 % chiều cao cột nhọn, mỗi bậc xa hơn thấp thêm 12 %, cũng được vẽ cao lên theo `SPIRE` giảm dần)), Tháp Nhạn (tháp Chăm
  gạch, cao hơn thật ×3–5 cho dễ nhìn trên sa bàn). **Bờ biển SRTM** tính cồn cát là đất: ở Nghinh Phong bờ nằm
  cách tháp 360 m trong khi ngoài đời quảng trường ở ngay bãi cát — `seaGrow` (mét, công thức dữ liệu, `growSea`)
  đẩy bờ vào 240 m, giữ hình dạng (tháp cách nước ~115 m).
- **Lớp phủ đất** (`world/landcover.js`, `cfg.landcover(x, z)`): biển / bãi cát (< 150 m từ biển) / dải
  phi lao ven biển (< 500 m) / phố (nơi nhà dày — `builtUp` — và/hoặc vòng `landcover.town` trong công thức, mép lượn theo nhiễu) / rừng
  (> 25 m) / ruộng (< 12 m) / cỏ. Địa hình tô màu theo nó (ruộng thành ô bàn cờ), `trees` trồng theo
  `TREE_COVER` (giữ bao nhiêu, bao nhiêu thông). World không có `landcover` (PYN/MAPLE) không đổi gì.
- **Mặt trời theo vĩ độ** (`sunDirection(giờ, vĩ độ, ngày)` trong `sky.js`, `cfg.latitude`, `cfg.sunDay`
  mặc định 80 = xuân phân): hướng nắng thật khi mặt trời còn trên chân trời, trăng theo preset ban đêm.
- **Xe, người, chim trên phố thật** (`streets` để lại `world.streets`: từng đoạn phố đã vẽ — điểm, bề rộng,
  số làn, mặt đường `heightAt`):
  - `citytraffic` (`features/citytraffic.js`): xe máy (nhiều nhất), xe đạp, ô tô, bán tải, xe tải chạy
    lên xuống các phố chính dài nhất (`routes`, mặc định 10): làn bên phải, quay đầu ở cuối phố. `Vehicle`
    nhận `k` — đường đi, tốc độ và luật giao thông (`updateTraffic`) chạy **trong đơn vị mô hình** như lịch
    tàu, chỉ chỗ vẽ nhân lại k. Phố có polyline quay lại cạnh chính nó (đại lộ hai chiều nối thành một
    đường lên rồi xuống) bị cắt (`untangle`) — không thì làn về chồng lên nhau. Xe dừng cho người đi bộ
    (`world.pedestrians`); ở ngã tư không đèn, hai xe cùng thấy nhau thì xe trước trong danh sách đi trước.
    **Đèn giao thông ở ngã tư thật** (`lights: true`): `findJunctions` tìm chỗ hai phố chính cắt nhau (góc
    đủ lớn, gộp trong 5 đơn vị), ít nhất một phố có xe chạy. Mỗi ngã tư một `crossroads()` hai pha, lệch pha
    ngẫu nhiên với ngã tư khác; mỗi làn qua ngã tư (`passes`) có điểm dừng + vạch dừng trắng lùi trước phố
    kia (nửa bề rộng + vỉa hè), cột đèn trên vỉa hè bên phải — dời ra tối đa 1 đơn vị cho khỏi lòng đường,
    cách đá ballast ray ≥ 1, không có chỗ thì bỏ cột (vạch dừng vẫn có). **Mọi pha đều phải `update`**, kể
    cả pha không có cột đèn nào — từng quên: pha đứng đỏ mãi, xe kẹt 263 s. Phố chính không có xe cũng có
    đèn cả hai chiều. Tuy Hòa: ~30 ngã tư, 67 vạch dừng, 94 cột đèn; xe đứng lâu nhất 16 s. `lights: 'all'` (NGHINH
    PHONG) có đèn cả chỗ phố nhỏ (`residential`, `living_street`, `road`) gặp phố có xe: 29 → 79 cột đèn, 38 → 79 vạch.
    **Xe cắt ngang ở góc tù vẫn phải thấy nhau**: `gapTo` (`vehicles/traffic.js`) chỉ bỏ qua xe gần như ngược chiều hẳn
    (`cos < −0,7`, làn bên kia của phố hai chiều); trước là mọi xe lệch > 100° (`cos < −0,2`) — xe tải quay đầu ở cuối
    phố (ngay ngã tư) cắt ngang xe máy ở góc 110° mà hai xe không thấy nhau.
    **Vạch sang đường** ở mỗi nhánh ngã tư có đèn: ngay chỗ vỉa hè của phố kia cắt qua (lùi nửa bề rộng phố
    kia + nửa vỉa hè, chia sin góc giữa hai phố — ngã tư chéo lùi xa hơn), sâu 3 m × props, sọc trắng cách
    1 m × props, vẽ trên mặt phố cao nhất chỗ đó; vạch dừng lùi sau nó 1 m × props. Vạch trùng vạch khác
    (phố cắt chéo, hai ngã tư sát nhau, `overlaps` — trừ hai đầu, vì vạch hai nhánh gặp nhau ở góc) thì bỏ. Mỗi vạch vào `world.crosswalks` `{ x, z, h, half, depth,
    signal }`; người đi dạo (`strollers`, `crosswalkAt`) tới mép thì chờ (`walker.waiting`) tới khi xe trên
    phố đó đỏ **đủ lâu để qua hết** (`signal.walk(bề rộng / tốc độ + 1)`). E2E: không ai bước lên vạch khi
    xe chưa đỏ, có người chờ, có người qua. Tuy Hòa: 100 vạch (vạch trùng vạch khác bị bỏ — một phố có thể là nhiều đoạn trong `world.streets`).
    **Vạch kẻ vẽ bằng `Paint`** (tam giác theo mặt đường, ô ≤ 0,5, độ cao = mặt phố **đang nằm trên cùng** ở mỗi góc —
    phố nào có lòng phủ điểm đó, `distanceToLine`), không phải hộp phẳng đặt theo độ cao tâm (từng chìm/nổi trên dốc).
    Vị trí đo **dọc theo chính phố** (`alongFrom`: từ chỗ phố đi gần ngã tư nhất, đi ± d theo polyline), không theo
    đường thẳng qua tâm; phố hết trước khi tới đó (phố cụt ở ngã ba) thì không có nhánh ấy — từng vẽ vạch giữa ngã tư.
    Làm hết vạch sang đường của một ngã tư trước, rồi vạch dừng (bỏ vạch dừng đè lên vạch sang đường hay lòng phố khác —
    xe vẫn dừng). **Đèn hình hộp, mặt kính vuông** (`new SignalProps(batch, k, { square: true })` — chỉ đèn ở phố thật; đèn MAPLE vẫn
    kính tròn, golden giữ nguyên). **Đèn đi bộ chung trụ với đèn xe** (`props.walkOnPole`: hộp riêng trước trụ, đỏ trên xanh
    dưới, dưới đầu đèn xe, quay sang bên kia đường,
    xanh khi `signal.walk(bề rộng / tốc độ + 1)`); một trụ mỗi làn (trụ cách trụ cùng hướng < 1,5 thì bỏ). Vạch giữa
    đứt của phố (`streets`) dừng **trước** phố cắt ngang (lưới đoạn phố, góc > 30°; đại lộ hai nửa vẫn giữ vạch), lùi
    nửa bề rộng phố kia + vỉa hè + 5 m × props (chỗ cho vạch sang đường 3 m + vạch dừng), đo vuông góc với phố kia —
    ngã ba chéo tự lùi xa hơn, như vạch sang đường.
  - `strollers` (`features/strollers.js`): người đi trên vỉa hè (một bên phố, tới cuối dừng rồi quay lại)
    và dạo quanh quảng trường công trình (pad ≥ 10), cỡ và nhịp bước × k, giương ô khi mưa. Họ **không**
    đi tàu nên ở `world.pedestrians` (không phải `world.people` — e2e đòi `world.people` lên/xuống tàu).
  - `birds` thêm `gulls` (đàn hải âu trên bãi biển), `egrets` (cò trắng bay thấp trên ruộng) — tâm đàn
    chọn theo lớp phủ đất (`Flock` nhận `center`).
  E2E tua 300 s với Tuy Hòa: không xe nào chồng nhau (hình chữ nhật × `v.k`), không xe nào kẹt, đèn phanh
  và đèn pha có bật.
- **Phố sạch sẽ**: `site.claimRect(…, kind)` nhớ **loại** đất (`CLAIM`: `TAKEN` 1 < `PAVEMENT` 2 <
  `CARRIAGEWAY` 3, ô giữ loại cao nhất; `site.claimAt`). `streets` claim lòng đường + vỉa hè (`PAVEMENT`
  = 1,5 m × props mỗi bên, vẽ màu xám nhạt ở lượt đầu, thấp hơn mọi lòng đường nên lòng phố cắt ngang
  che vỉa hè ở miệng phố). Nhà (`fitOffStreets`): thử 15 điểm trên móng, chạm vỉa hè/lòng đường thì cắt
  bớt phía giáp phố (còn 75 % / 55 % chiều dài hoặc rộng), không được thì bỏ. Người đi dạo
  (`pavementRoute`): đi giữa vỉa hè, điểm rơi vào lòng phố khác thì đẩy ra ≤ 0,8, không được thì là chỗ
  băng qua đường (giữ), trừ ở hai đầu — không bắt đầu/kết thúc giữa lòng đường. **San mặt đường**
  (`world/grade.js`, `createGrade`): độ cao dọc phố = trung bình mặt đất ±9 đơn vị (bỏ lồi lõm SRTM × 3),
  ngang phố bằng phẳng tới nửa bề rộng + 1,5 rồi thoải về mặt đất trong 2,5; địa hình lerp về đó (chỉ
  world có `cfg.roads`), không san chỗ nước (cầu).
- **Chỉ hiện NGHINH PHONG**: `SHOWN` (`worlds/index.js`) là các world app đưa ra (nút chọn, phím N, world mặc định);
  world khác vẫn dựng + test đủ (golden, e2e) và mở bằng `?world=<id>`. Test đổi world gọi `__pyn.switchWorld(id)` (chỉ
  bản dev) thay phím N.
- **Đất phẳng, mịn, bờ biển mượt** (công thức dữ liệu): `smooth` (bán kính điểm lưới, `smoothLand`: đất liền = trung
  bình đất quanh nó, không kéo theo biển/mặt nước), `coast` (`smoothCoast`: dải có cả biển lẫn đất trong bán kính lấy
  trung bình → mép nước theo đường cong, không theo bậc thang lưới), `verticalScale` thấp hơn. Biển giờ là mọi điểm
  **< `WATER_BED`** (−4 m; bờ đã làm mịn có biển nông hơn `SEA_BED`); `seaDistanceAt` nội suy giữa 4 điểm lưới (mép bãi
  cát mượt). Công thức world có `cell` (ô lưới địa hình, mặc định 3; NGHINH PHONG 1,5).
- **Xe không quay đầu trong ngã tư**: phố có xe mà kết thúc ở chỗ cắt phố khác thì bị cắt ngắn (`trimEnds` + `crossedAt`:
  cách phố kia nửa bề rộng + bề rộng phố mình + 1) — quay đầu giữa ngã tư làm xe cắt ngang xe khác quá gần để kịp phanh.
  Luật: chỉ bỏ qua xe **ngược chiều và lệch sang bên** (`gapTo`: `cos < −0,7` và cách trục làn mình > `LANE / 2`).
- **Rà cảnh NGHINH PHONG** (2026-09-30): đất trống thấp giữa phố thành cỏ, không phải ruộng lúa kẻ ô
  (`landcover: { fields: false }` trong công thức, `createLandCover({ fields })`); phố + vỉa hè dừng cách mép sa bàn
  nửa bề rộng + vỉa hè + 1 (đầu phố tròn từng chìa ra ngoài mép); HUD chỉ hiện điều khiển world dùng được
  (`hud.setWorld`: không tàu → ẩn máy quay 2/4/5 và thanh tốc độ tàu, không cầu → ẩn 3, không người/chim/xe → ẩn 6/7/8;
  phím vẫn chạy và báo "không có gì để theo"; CSS `[hidden]` thắng `display` của `.chip`).
- **NGHINH PHONG** (`src/worlds/nghinhphong.js`): 2 × 2 km quanh Tháp Nghinh Phong (tâm = tháp,
  `halfExtent` 1000), 400 đơn vị → 5 m/đơn vị, `props` 0,6; lưới 101 (20 m), `verticalScale` 1, `smooth` 3, `coast` 2; 96 phố, 870 nhà (Overture ở khu này
  thưa). **World đầu tiên không có đường ray**: công thức ghi `rail: null` (và `stops: []`) → `cfg.track` null,
  `world.track` là `noTrack(k)` (`world/track.js`: không ở đâu cả, `distanceTo` = ∞) — không dựng ray/cầu, không
  san hành lang; `checkFeatures` không đòi `train` mà cấm `train`/`station`/`halt`. Máy quay 2/4/5 (tàu) không
  làm gì (`setMode` trả false), âm thanh tàu im; `birds` không cần ga nữa (không ga thì không có bồ câu). E2E:
  `trainStops` chỉ đòi khi có tàu. **World không tàu vẫn thêm một `SpotLight` tắt giống đèn pha tàu**: thiếu nó
  thì cấu hình đèn khác, material dùng chung (`keep()`) biên dịch thêm bộ shader thứ hai và giữ luôn — e2e đổi
  world bắt được (MAPLE lần hai 37 → 48 shader).
  **Gai độ cao theo cụm**: lưới mịn hơn SRTM (30 m) lặp mỗi mẫu thành khối 2×2, và ở đây là một cụm mẫu cao
  (72/65/34/33 m, nhà cao tầng?) che nhau → núi giả cạnh tháp. `despike(h, n, reach)`: so với **vòng cách
  `reach` điểm** (`reach` = số điểm lưới mỗi mẫu SRTM, `build.mjs` tự tính) và với điểm cao **thứ nhì** của vòng
  (một mẫu gai bên cạnh không che được), lặp tới khi không đổi (≤ 4 lượt). Tuy Hòa dựng lại chỉ lệch 1 điểm (4 → 5
  m), đỉnh núi giữ nguyên — file dữ liệu Tuy Hòa không dựng lại.
  **Phố trùng**: một con đường có thể nằm hai lần trong `world.streets` (vẽ hai lần trên bản đồ, hay đại lộ hai
  nửa) → hai tuyến xe ngược chiều trên cùng làn (luật giao thông bỏ qua xe ngược chiều) → đâm nhau. `citytraffic`
  bỏ phố có > 30 % điểm nằm sát một phố đã chọn (`alongside`).
- **Nhà không mảnh như cây tăm** (`drawnHeight`): tầng theo tỉ lệ đồ vật (`scale.fit`) còn móng theo bản đồ → trên bản
  đồ nhỏ nhà cao gấp 3 so với thật (Tuy Hòa: nhà 4 × 4 m 4 tầng cao 4 đơn vị trên móng 0,35 — 11 000 / 31 000 nhà cao
  > 5 lần cạnh ngắn). Giờ cao ≤ 2,5 × cạnh ngắn, nhưng ≥ 0,6 tầng.
- Chưa làm: xe rẽ sang phố khác (mỗi xe một phố), nhà theo đúng hình móng
  (chữ L…), sa bàn chữ nhật.

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
  nhận `k` (`track.k`, `track.gauge`, `track.railTop` — dùng thay `GAUGE`/`RAIL_TOP` của `config.js`),
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

## Phương tiện (xe đạp, xe máy, ô tô, xe bán tải, xe tải, máy bay)

Thư viện dùng chung ở `src/world/vehicles/`, bật cho world nào cũng được bằng 3 feature:

```js
features: [
  'station',
  { id: 'road', stop: 'vale', inset: { a1: 22, b: 20 } }, // TRƯỚC 'village'/'halt' để nhà tránh đường
  'village',
  { id: 'traffic', vehicles: { car: 3, pickup: 1, truck: 1, motorbike: 2, bicycle: 2 } },
  'train',
  { id: 'aircraft', count: 2 },
]
```

- `road`: đường vòng (chữ nhật bo góc) trong `zone` của một điểm dừng, cách mép `margin` (mặc định 6),
  `inset: { a0, a1, b }` để lùi riêng phía ray / phía xa / hai đầu. **Đường không được cắt nước hay đè
  lên ray** (trừ chỗ chắn tàu) — feature báo lỗi kèm tọa độ (a, b) trong zone; chỉnh `inset` theo đó.
  Đường nằm trên mặt đất *như được vẽ* (`terrain.meshHeightAt`, nội suy đúng lưới tam giác), không phải
  `heightAt` (lệch tới 1,35 đơn vị trên dốc → cỏ trồi lên mặt đường). Thêm tùy chọn:
  - `roundabout: 'b1'` (hoặc `{ side, at, radius }`): vòng xoay trên cạnh đó của đường vòng; xe chạy
    ngược chiều kim đồng hồ nhìn từ trên (giữ bên phải), xe vào **nhường** xe đang chạy trong vòng xoay.
  - `branch: 46` (hoặc `{ length, lane, turn }`): đường hai chiều từ vòng xoay thẳng ra ngoài zone tới một
    vòng quay đầu. Chỗ nó cắt đường ray **tự thành chắn tàu**: mặt đường nâng ngang đỉnh ray, mỗi làn
    một cột có đèn đỏ nháy luân phiên + thanh chắn nửa đường; tàu còn < 9 s hoặc < 25 đơn vị (hoặc thân
    tàu còn trên đường) thì đèn nháy, 2,5 s sau thanh chắn hạ; xe chờ tới khi thanh chắn lên hẳn.
  - `lights: ['a0']` (hoặc `{ side, at }`): vạch sang đường + đèn giao thông hai bên (xanh 14 s / vàng 3 s
    / đỏ 9 s); đèn vàng chỉ dừng xe còn kịp phanh.
  - `junctions: ['a0']` (hoặc `{ side, at, in, out, cycle }`): **ngã tư có đèn** — một phố hai chiều cắt
    thẳng qua cạnh đó của đường vòng, `in` (18) vào trong zone và `out` (16) ra ngoài, mỗi đầu một vòng
    quay đầu. Đèn hai pha (`crossroads()` trong `signals.js`): đường vòng xanh thì phố đỏ và ngược lại,
    giữa hai pha đỏ cả hai hướng `clear` giây (mặc định xanh 12 / vàng 3 / clear 2). Xe trên phố chạy
    tuyến riêng (qua ngã tư cả hai chiều); vạch dừng lùi đủ xa để xe chờ không chắn làn kia.
  - **Vỉa hè** (rộng 1,6, cao hơn mặt đường một bó vỉa) dọc đường vòng, phố và quanh các vòng tròn; nhánh ra
    chắn tàu là đường quê, không có vỉa hè. Vẽ theo **bản đồ đi bộ** `WalkMap` (`world/roads/walkmap.js`,
    ô 0,5): vỉa hè / lòng đường / vạch sang đường; chỗ đường khác cắt qua thì không vẽ vỉa hè. Người đứng
    trên vỉa hè nhờ `site.addSurface`.
  - **Người đi bộ tuân theo đèn**: `NavGrid` (`world/nav.js`, nhận `{ site }`) chặn mọi ô chạm lòng đường,
    trừ ô nằm trọn trên vạch sang đường (ô đó nhớ chỉ số trong `site.crossings`). Dân làng sắp bước lên vạch
    thì hỏi `site.crossings[i].walk()`; chưa được thì đứng chờ ở mép (`w.waiting`, `features/villagers.js`).
    Đèn đi bộ (đỏ/xanh, `props.walkSignal`) ở hai đầu mỗi vạch; được đi khi xe đang đỏ và đỏ còn > 4 s
    (`SignalCycle.walk()`). Ngã tư có vạch trên cả 4 nhánh (vạch dừng lùi ra sau vạch sang đường).
  - Vạch kẻ: viền trắng hai mép, vạch giữa đứt (liền gần chắn tàu), vạch dừng, vạch nhường ở lối vào
    vòng xoay, vạch sang đường. Tất cả (cả mặt nhựa, đảo giữa vòng xoay) là tam giác tô màu theo đỉnh
    (`world/roads/paint.js`) gộp vào `world.batch` → không tốn draw call riêng; bóng đèn sáng và thanh
    chắn là 2 Instancer (`world/roads/props.js`), bật/tắt đèn bằng `anchor.visible`.
  - **Mỗi thành phần một file** trong `world/roads/parts/`: `ring.js` (đường vòng), `roundabout.js` (vòng xoay +
    nhường), `branch.js` (nhánh, tìm chỗ cắt ray, chắn tàu), `junction.js` (phố + ngã tư có đèn), `zebra.js`
    (vạch sang đường có đèn), `circles.js` (vòng quay đầu, đảo, vạch viền), `sidewalks.js` (vỉa hè). Chúng
    dùng chung một `RoadBuilder` (`world/roads/builder.js`: paint, props, `WalkMap`, độ cao từng lớp `b.h`,
    `check`, `stopLine`, `crosswalk`, `trafficLight`, và `finish()` trả system chạy đèn/thanh chắn).
    `features/road.js` chỉ đọc tùy chọn rồi gọi các phần **theo đúng thứ tự** — thứ tự vẽ và thứ tự lấy số
    ngẫu nhiên; đổi thứ tự là golden của MAPLE đổi. Thành phần mới: thêm một file trong `parts/`.
  - Bố cục (`world/roads/network.js`, thuần, có test) cho ra các **tuyến** (route): mỗi tuyến là một
    `LoopPath` một làn, kèm các điểm dừng `{ s, blocked(car, d, cars) }` (đèn đỏ, chắn tàu, nhường vòng
    xoay). Logic đèn/chắn tàu ở `world/roads/signals.js` (thuần, có test).
- `traffic`: xe chia đều cho các tuyến của đường (vòng quanh / ra nhánh qua chắn tàu rồi quay lại),
  giữ khoảng cách với **bất kỳ phần nào** của xe phía trước trên làn mình — kể cả xe tuyến khác đi chung
  đoạn đường (xe tải dài đang vòng xoay có đuôi chắn lối ra) — dừng khi có người đi bộ phía trước và ở
  các điểm dừng (`vehicles/traffic.js`, logic thuần có test). Camera phím **8** đi theo xe.
  Xe xuất phát rải đều trên đoạn đường chung của nhóm tuyến, tránh vạch dừng và ô ngã tư.
  E2E tua 300 s kiểm tra: không hai xe nào chồng lên nhau (hình chữ nhật thân xe), không xe nào đứng
  ≥ 60 s (kẹt), thanh chắn hạ, xe chờ ở chắn tàu và đèn đỏ, xe đi ra nhánh, xe trên phố qua ngã tư,
  và không bao giờ có xe đường vòng lẫn xe trên phố cùng ở giữa ngã tư; không ai đứng trên lòng đường
  (ngoài vạch sang đường), không ai bước lên vạch khi đèn bảo chờ, có người chờ rồi qua; đèn phanh và
  đèn pha (khi mưa) có bật.
- **Đèn xe** (`KINDS[kind].lamps: { head, tail }`): đèn pha + đèn hậu sáng khi trời tối (`f.lights > 0,3`)
  hoặc u ám (mưa/tuyết), đèn hậu sáng cả khi phanh (`vehicle.braking`: giảm tốc mạnh hoặc bị giữ đứng
  yên). Mỗi xe một vũng sáng trên đường phía trước lúc tối. Cả đội xe chỉ 2 InstancedMesh (mọi bóng đèn,
  mọi vũng sáng), vũng sáng ẩn cả mesh ban ngày. Không có đèn thật (xem quy tắc render).
- `aircraft`: máy bay bay vòng trên cao (110 m trở lên, trên khinh khí cầu), nghiêng cánh khi rẽ, đèn
  đầu cánh không phụ thuộc ánh sáng. Camera phím 7.
- **Thêm loại xe mới**: một mục trong `KINDS` (`vehicles/kinds.js`): `body()` (phần sơn dùng `PAINT` →
  mỗi xe một màu qua tint của Instancer), `wheels` + `wheelR` + `wheel()`, `rider` nếu có người lái,
  `speed`, `length`, `colors`; bay thì `flies: true` (+ `prop`, `lights`). Không cần sửa chỗ nào khác.
- Vẽ: mỗi loại xe 2 InstancedMesh (thân + bánh), máy bay 3, bất kể bao nhiêu chiếc; người lái là
  `Person` (SkinnedMesh) — chỉ xe 2 bánh có. Đo (2026-09-29, MAPLE): +34 draw call (tính cả bóng) cho
  9 xe + 2 máy bay, CPU mỗi bước mô phỏng 0,29–0,34 → 0,33–0,34 ms (trong vùng nhiễu). Thêm vòng
  xoay + chắn tàu + đèn: 304 → 306 draw call; `traffic.update` 0,10 ms, đèn/chắn tàu 0,004 ms mỗi bước.

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
  quầng sáng (`halos`) + vũng sáng dưới đất (`pools`) của `lamps(world)` (`features/lamps.js`). Chỉ còn đèn pha tàu là
  đèn thật.
- **Dáng đi của người tính theo quãng đường, không theo thời gian** (`Walker.step` trong `world/walker.js`:
  `gait += s·π / (STEP_LENGTH·scale)`, nửa chu kỳ = 1 bước). Đừng đổi lại thành `t × tốc độ` (tay
  chân vung loạn khi đổi tốc độ). Trong `Person.pose()` đầu gối chỉ gập khi chân đang **vung về
  trước**; đổi chiều là người đi moonwalk. Đo: chân trụ trượt 4,16 → 0,04 m mỗi mét đi.
- **Thứ chuyển động đều theo thời gian thì tính trong shader** (uniform `uTime`): sóng nước, dòng
  chảy, lá trôi (`water.js`), mưa, tuyết rơi (`weather.js`). CPU chỉ gán 1 số mỗi frame.

## Đo trước khi tối ưu

Bật `?stats` (chỉ ở dev). Khi đổi cách render: ghi số draw call và ms/frame ở cùng góc camera
**trước và sau**. Ít draw call hơn **không** tự động nhanh hơn — trên GPU mạnh mỗi draw call chỉ
~2 µs, còn SkinnedMesh / upload buffer mỗi frame có giá cố định. Trong DevTools có `window.__pyn`
(`{ W, renderer, post, rig, camera, state }`, `W` là world đang hiện) để đo bằng `__pyn.renderer.info`.

Mốc đã đo (2026-09-29, góc toàn cảnh, tính cả lượt vẽ bóng): bản gốc 1683 draw call, 323
material, 898 geometry → sau tối ưu 353 draw call, 84 material, 238 geometry (góc nhà ga
1261 → 319, góc làng 1155 → 214); thời gian frame
trên máy dev (GPU rời) gần như không đổi — lợi ích chủ yếu ở máy yếu/di động nơi draw call đắt.

Đo 2026-09-29 (Chromium, CPU): tầm nhìn camera theo người 3,4 ms/tia → 0,04 ms; phủ tuyết 3,1 ms
mỗi bước → 0,02 ms; shader biên dịch lúc tải 51 → 33 (hết biên dịch 2 lần), lần đầu mưa/tuyết
không còn biên dịch shader; `scenery.update` 0,071 → 0,04 ms/frame (khói ống khói ban ngày).

Đo 2026-09-29 (sau khi bỏ PointLight, chim instanced, nước/mưa/tuyết trong shader): draw call góc
toàn cảnh 385 → 268, góc làng 194 → 170, góc làng ban đêm 186 → 113; CPU sóng nước 0,27 → 0 ms,
tuyết rơi 0,15 → 0 ms. Pixel ratio tối đa 1,5 và tự hạ (bước 0,25, tới 1) khi FPS < 40 trong 2 s.

Thời gian tải (2026-09-29, trung vị 5 lần, dev server): 2,10 → 1,85 s; dựng địa hình 269 → 163 ms,
cây/nhà 168 → 114 ms, người + lưới dẫn đường 336 → 274 ms. `track.distanceTo` tra lưới ô 12 đơn vị
thay vì quét 380 điểm, và nhận `max` để dừng sớm (kết quả < max vẫn chính xác) — truyền `max` khi
chỉ cần so với một ngưỡng.

## Chưa làm (việc tiếp theo nếu cần nhanh hơn)

- Thời gian tải: phần lớn còn lại là biên dịch shader (~0,5 s trên GPU phần mềm) và dựng người
  (`Person`/`skinFigure`, ~130 ms). `heightAt` giờ chủ yếu là noise (`fbm`).
- Bóng đổ: frustum đã co theo khoảng cách camera (`sky.js`, 50–170 đơn vị), mây không đổ bóng. Còn
  có thể tắt `castShadow` cho vật nhỏ ở xa.
