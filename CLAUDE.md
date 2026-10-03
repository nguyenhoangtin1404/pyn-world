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
  - `citytraffic` (`features/citytraffic.js`): xe máy (nhiều nhất), xe đạp, ô tô, bán tải, xe tải, xe buýt (`bus`, 10,6 m, mặc định 2) chạy
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
  - **Xe rẽ phải** (`turns`, mặc định 0,35; `world/vehicles/turns.js`): ở ngã tư giữa hai phố chính đều có xe, xe có thể rẽ phải sang làn của phố kia theo đường cong Bézier (`rightTurn`), vào làn khi không có xe sát đó (`turn()` trong `citytraffic`). Chỉ rẽ phải (chưa rẽ trái); Tuy Hòa không có ngã tư nào giữa hai tuyến nên không có xe rẽ — e2e đòi `road.turned > 0` ở NGHINH PHONG.
  - **Bến xe buýt** (`features/busstop.js`, đặt SAU `tourists` và `citytraffic`): xe buýt chạy trên phố gần quảng trường công trình nhất
    (`citytraffic` đặt chúng ở đó, không rẽ) và dừng ở một điểm trên phố đó — cách công trình khoảng `away` (100 m), cùng phía phố với quảng trường (không phải qua đường), thẳng, cách vạch sang đường
    và vạch dừng khác. Xe **tạt vào sát lề** khi vào bến (`Vehicle.shift`, mét mô hình sang bên phải, mượt theo quãng đường 45 → 15 đơn vị trước điểm dừng; đại lộ thì thành đổi làn, từ làn trong sang làn ngoài) và **về làn cũ** khi ra (8 → 40 sau điểm dừng); mũi xe quay theo độ dốc của `shift`. Khách đi và về qua cửa vào quảng trường (cạnh thẳng) rồi dọc vỉa hè, không cắt lan can. Điểm dừng là `StopPoint` thường (`world.cityRoutes[r].stops`); cửa xe ở bên phải (local −x, phía vỉa hè).
    Khách không sinh thêm: **cùng các nhóm `Party` của `tourists`** lên xe (ẩn đi, `phase: 'ride'`) rồi xuống ở lượt sau — xe đầu
    tiên chở sẵn `riders` nhóm. Nhóm trên quảng trường ở `phase: 'look'` thỉnh thoảng đi ra đứng chờ ở vỉa hè (`wait`, `then:
    'wait'`), xe tới thì xuống khách (so le 2,5 s) rồi nhóm đang chờ đi tới cửa và lên (`then: 'ride'`); xe đợi ≥ `dwell` s và tới khi
    ai sắp lên xong (tối đa 40 s). `Tourist.trip` = đang ở ngoài quảng trường vì chuyến xe (e2e không tính là "ra ngoài lan can");
    trên vỉa hè họ đứng ở độ cao `pavementAt` của phố. `world.busStop` đếm lượt dừng / lên / xuống — e2e đòi cả ba > 0 ở NGHINH PHONG. Bến có mái che (mái + 4 cột, không có tường kính — khách đi thẳng từ quảng trường tới chỗ chờ, tường sẽ bị xuyên qua) và cột biển báo xanh ngay trước cửa xe, vẽ vào `world.batch` theo mét × k.
  - **Biển và bãi biển** (`features/seacraft.js` #30, `features/beach.js` #31, cần `cfg.landcover`): `coastOf(world)` (`world/coast.js`,
    service, có test) chia sa bàn thành ô 3 đơn vị: biển = nước (đất vẽ < `WATER_Y`) **nối với** chỗ lớp phủ gọi là biển (vùng nước nông
    sát bờ lớp phủ còn gọi là bãi cát; ao trong đất liền không phải biển), số ô tới đất gần nhất, các điểm mép nước kèm hướng lên bờ.
    `seacraft`: **moto nước kéo dù bay** gần bờ (`parasails`, 2 — thay thuyền thúng): moto chạy vòng trong nước đủ sâu (đất < `WATER_Y`
    − 0,8), 3–12 ô ngoài bờ, trong 900 m quanh công trình; dù (vòm sọc, dây, 2 du khách ngồi chung đai, chân thả) bay sau `TOW` 40 m ×
    k và cao `LIFT` 24 m × k, lượn theo chậm khi moto rẽ; **người là `Person` như mọi người khác trong app** (người lái ngồi bằng `seat()` của
    `vehicle.js` như người đi xe máy, `JETSKI_SEAT`; hai du khách ngồi đai, tay nắm dây trên đầu, chân thả — không vẽ người bằng hộp riêng; 6 SkinnedMesh), dây kéo là một hộp dài 1 kéo giãn mỗi frame (`towRope`, `lookAt`); phím 0
    theo dù (`followables.balloons`); `world.seacraft.parasails` — e2e: dù luôn cao > 15 m, dây < 70 m. Thuyền đánh cá thân xanh có
    mắt thuyền + đèn câu mực neo xa hơn, vài chiếc đang chạy, tàu hàng ngoài khơi — mỗi loại một `Instancer`, nhấp nhô theo đúng sóng của mặt nước (`waveHeight` trong `water.js`,
    giữ khớp với shader), tránh tấm chữ niêm phong trên biển; thuyền chạy rẽ trước khi hết nước sâu phía trước. Bọt sóng: hai dải mỗi
    điểm mép nước (sát bờ + đợt sau, mờ hơn), trôi lên bãi rồi rút trong shader (`uTime`), mờ ở hai đầu cho liền nhau. `beach`: ô dù +
    khăn (tĩnh, `world.batch`), người ngồi dưới ô, trẻ con chạy quanh, người bơi (Walker `fixedY` dưới mặt nước, tay sải), người chạy bộ và
    đi dạo dọc cát ướt — chỉ trên cát chưa ai claim, trong `reach` (450 m) quanh công trình. Không ở `world.pedestrians` (không có phố
    trên cát). Ảnh chuẩn ẩn `world.seacraft.group` và `world.beach.group` (chúng chuyển động). E2E: thuyền không mắc cạn, có thuyền
    chạy, có bọt; đủ năm vai trên bãi, người bơi không lên bờ, không ai khác xuống nước hay lên phố. NGHINH PHONG: +18 người, draw call
    góc mặc định 278 → 321, +1 shader (bọt).
  - **Đời sống phố** (`features/streetlife.js` #32, cần `streets`, `buildings`, `citytraffic`; đặt SAU `busstop` — world có `busstop` mà đặt sau thì báo lỗi lúc dựng: không có trong `needs` vì phố không bến xe vẫn có đời sống phố): trong `reach`
    (600 m) quanh công trình. Mặt nhà nhìn ra phố (vỉa hè trong 2 đơn vị trước tường; `buildings` để lại `world.buildings`) có
    **biển hiệu + mái hiên sọc** ở tầng trệt (`shops`, 40); trước cửa: **xe máy dựng** (mũi vào nhà, không đủ chỗ thì dọc tường),
    **quán cóc** (bàn thấp, ghế nhựa, vài người ngồi — `sitters`, 8) hoặc không gì; vài mặt nhà khác cũng có xe máy; **xe đẩy bán
    hàng** có người bán đứng cạnh + dù (`carts`, 5); **ô tô đỗ sát lề** phố nhỏ (`MINOR`, không dải phân cách, không có tuyến xe),
    đoạn thẳng, xa ngã tư và vòng xoay (`cars`, 14). Tất cả tĩnh trong `world.batch` (người ngồi/người bán là `Person`). **Không chắn
    người đi bộ**: mỗi vật là vài vòng tròn trên mặt đất (`world.streetLife.props`), phải cách đường đi của người đi dạo
    (`pavementWalks` — cùng hàm `strollers` dùng, cả hai bên mọi phố, cả dây cung chỗ người đi cắt góc 0,3 trước mỗi điểm) và đường
    khách đi giữa quảng trường với bến xe buýt (`world.busStop.walks`) ≥ nửa người (0,3 m × k + 0,08); không trên lòng đường (trừ ô tô),
    cách làn xe chạy, vạch sang đường, pad công trình, nhà, cây. Tra nhanh bằng `SegIndex` (`world/segindex.js`, có test). E2E: đủ
    loại, và tua 300 s không ai (`world.pedestrians`) bước vào vòng tròn nào. NGHINH PHONG: 32 cửa hàng, ~35 xe máy, 15 quán, 5 xe đẩy;
    +13 người, draw call góc mặc định 321 → 347; ảnh chuẩn vòng xuyến có thêm mái hiên/xe đỗ.
  - **Âm thanh** (#33): `world.listen(vị trí camera)` → `soundLevels` (`world/soundscape.js`, thuần, có test) cho biết to nhỏ 0..1 của
    sóng biển (điểm bờ gần nhất, xa tới `SEA_REACH` 500 m bản đồ; độ cao camera chỉ tính `HEIGHT_COUNTS` 0,3 — sa bàn: nhìn từ trên cao
    vẫn nghe bãi biển đang thấy, nhỏ thôi), gió (mạnh hơn gần biển và trên cao), máy xe (mọi xe, `1/(1+(d/18 m)²)` theo tỉ lệ đồ vật, xe
    đứng chờ nhỏ hơn, cộng lại `1 − e^(−tổng)`), tiếng người (`world.people`, `pedestrians`, người trên bãi; 8 m) và còi (một xe đang chạy,
    gần thì dễ được chọn). `main.js` hỏi 5 lần/giây, `AudioEngine.update({ sound })` tổng hợp bằng Web Audio, không file: sóng = tiếng ầm
    lowpass dâng theo chu kỳ ~8 s + tiếng xô bờ (hiss), máy xe = rền 115 Hz + rít 650 Hz, còi = 1–2 tiếng bíp vuông hai nốt, tiếng người
    = từng âm tiết là nhiễu qua hai formant nguyên âm. **Bờ biển tính lúc dựng** (bước cuối, khi có `cfg.landcover`): tính lần đầu trong
    vòng lặp làm khung hình đầu ở Tuy Hòa dài đến mức mô phỏng nhảy một bước — e2e golden lệch 1 draw call, lúc có lúc không.
    E2E: trên quảng trường tháp nghe biển, người, gió; trên một chiếc xe nghe máy; PYN/MAPLE không có biển.
  - **Ban đêm** (`world/night.js`): ai còn ở ngoài theo giờ (`sky.hour` → `Curfew.hour` mỗi frame, `curfewOf(world)`): ban ngày tất cả,
    từ 22 h ít dần (`outShare`: 24 h còn ~20 %), sau nửa đêm ai cũng về (0 lúc 0:36), 1–5 h chỉ còn **2 người thức khuya** (2 người đi
    dạo đầu tiên, `rank(true)`), 5–6:30 h ra lại. Mỗi người/xe một `rank` rải đều 0..1 (tỉ lệ vàng, **không dùng rng** — golden mọi world
    không đổi), ra ngoài khi `rank < share(giờ + lead)`; `lead` = về sớm hơn bao nhiêu giờ (du khách và bãi biển 1, xe 1, quán/xe đẩy 0,5,
    người đi dạo 0,6 — đồng hồ chạy nhanh: 10 s một giờ, nên đường về chỉ vài bước, đi gấp `HURRY` × 2). Cách về: người đi dạo vào **cửa
    nhà gần nhất** (`homeFor`: cạnh móng nhà gần nhất `doorOf`, đường thẳng không qua lòng đường trong 8 đơn vị, không thì nhà trong 30
    đơn vị bất kể; không có thì đợi khuất camera, quá 25 s thì về luôn; ai xa nhà về trước); du khách ra cạnh thẳng quảng trường (thôi đợi
    xe buýt); bãi biển lên hết cát (người bơi lội vào bờ trước, người ngồi đứng dậy — `stepTo`); quán cóc/người bán vào cửa sau lưng;
    xe đi khi **khuất camera** (`curfew.seen`: frustum + < 260) hoặc tới **cuối phố**, lúc vắng thì ra khỏi luật giao thông (`active`),
    sáng ra lại chỗ khuất và có chỗ trên làn (`room`); moto nước/dù bay và người bơi chỉ ban ngày (`waterShare` 8–18 h). Sáng ra lại
    đúng cửa/chỗ cũ, ngồi lại ghế. **Đèn thuyền**: thuyền câu mực sáng đèn (bóng `fishingLamps` + quầng sáng trên mặt nước `squidGlow`,
    cộng màu), tàu hàng đèn hành trình (`shipLamps`), hiện khi `lights > 0,3`. E2E `night.spec.js`: chạy đồng hồ 21 → 8 h với camera mặc
    định — 23:30 ít người/xe hẳn, 1 h và 3 h đúng 1–2 người, không xe, 8 h về lại ≥ 90 % người, đủ xe, không xe nào ra đè lên xe khác.
  - **Nhịp ban ngày** (#39, `RHYTHM` + `busy(lô, giờ)` trong `world/night.js`): mỗi lô một đường gấp khúc theo giờ, nhân với
    phần ban đêm (`shareOf(lô, giờ, lead)`; `curfew.out(rank, lô, lead)`): `traffic` (xe: cao điểm 7–9:30 và 16:30–18:30, trưa
    11:45–13:30 còn 45 %, tối 70 %), `town` (người đi dạo, quán, xe đẩy: trưa 45 %), `beach` (trưa 25 % — cát nóng), `square` (du
    khách: trưa 40 %), `water` = `waterShare` × `beach`. Đi/về y như ban đêm (cửa nhà, ra cạnh quảng trường, lên bãi, xe khuất
    camera). Xe buýt chạy cả ngày (`rank` 0,001). **7:00–9:30 mọi lô đủ 100 %**: app mở lúc 9 h → golden và lượt tua 300 s
    không đổi. E2E `night.spec.js` (ngày 8 → 19 h): 8:30 13 xe / 49 người, 13 h 5 xe / 19 người (bãi 9 → 2, quảng trường 6 → 3),
    18 h đủ lại.
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
- **Màn hình tải theo world** (`app/loader.js`): `🚂`/`🏛` (có/không tàu, hoặc `cfg.icon`) + tên + `cfg.tagline` (mặc định
  "SA BÀN LOW-POLY"); gợi ý chỉ nói thứ world có (`hintsFor`: mỗi gợi ý `needs` một feature id). **Bảng điều khiển đóng sẵn**
  (`#panel.collapsed` trong `index.html`) — nút "Mở bảng điều khiển"; test nào bấm chip/ô trong bảng thì mở nó trước.
- **Đất phẳng, mịn, bờ biển mượt** (công thức dữ liệu): `smooth` (bán kính điểm lưới, `smoothLand`: đất liền = trung
  bình đất quanh nó, không kéo theo biển/mặt nước), `coast` (`smoothCoast`: dải có cả biển lẫn đất trong bán kính lấy
  trung bình → mép nước theo đường cong, không theo bậc thang lưới), `verticalScale` thấp hơn. Biển giờ là mọi điểm
  **< `WATER_BED`** (−4 m; bờ đã làm mịn có biển nông hơn `SEA_BED`); `seaDistanceAt` nội suy giữa 4 điểm lưới (mép bãi
  cát mượt). Công thức world có `cell` (ô lưới địa hình, mặc định 3; NGHINH PHONG 1,5). Và `groundSmooth` (0..1, mặc định 0 = mặt đất tam giác phẳng low-poly như PYN/MAPLE): pha màu và pháp tuyến của từng tam giác về phía các tam giác kề (`terrain.js`: màu mỗi đỉnh → trung bình các tam giác chung đỉnh, pháp tuyến → pháp tuyến mịn, vật liệu `flatShading: false`) cho khỏi lộ từng mảng tam giác trên bãi cát và bãi cỏ — NGHINH PHONG 0,75. Hình học không đổi (golden hình học không bắt, ảnh chuẩn trong ngưỡng).
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

Đo 2026-10-03 (ảnh bị mờ: khung hình chậm thì `createResolutionAdapter` hạ pixel ratio 1,5 → 1): từ #28 tới #42 NGHINH PHONG
thêm 37 người (SkinnedMesh 58 → 95) và đồ trên phố, draw call góc mặc định 293 → 377, tam giác 773k → 895k; một nửa draw call
là người — mỗi người 2 lần (ảnh + **bóng**), dù ở góc mặc định họ cách camera 182–511 đơn vị, cao 2–6 px, bóng không ai thấy.
**Bóng theo khoảng cách** (`World.figureShadows`, 15 frame một lần và ngay frame đầu): một SkinnedMesh chỉ đổ bóng khi cao ≥ ~12
px trên màn hình (`d < 160 × bán kính bao`) — người ở gần vẫn có bóng (ảnh chuẩn người đi xe đạp giữ nguyên), toa tàu to luôn có.
Draw call góc mặc định: NGHINH PHONG 362 → 271, PYN 273 → 240, MAPLE 307 → 267, Tuy Hòa 290 → 264 (golden chỉ đổi `drawCalls`);
thời gian vẽ (GPU phần mềm, trung vị, nhiễu ±10 %) #28 ~880 ms, #42 ~970, sau ~915.
Rồi **NGHINH PHONG một nửa người và xe** (công thức: người đi dạo 12, du khách 11, xe chạy 13 — còn 1 xe buýt —, bãi biển 9, quán 4,
xe đẩy 3, ô tô đỗ 7, xe máy đỗ `bikes: 0.5`, 1 dù bay; mặc định của feature giữ nguyên cho Tuy Hòa): SkinnedMesh 98 → 50, draw call
271 → 221 (362 lúc đầu), tam giác 818k → 753k. Ban đêm: xe đáng về nhà còn rẽ đi ở ngã tư nó vừa qua (`offStreet`: sáng ra lại
đúng chỗ đó, kể cả khi camera thấy) — với ít xe, một chiếc cứ chạy vòng trong khung hình tới 1 h.

## Chưa làm (việc tiếp theo nếu cần nhanh hơn)

- Thời gian tải: phần lớn còn lại là biên dịch shader (~0,5 s trên GPU phần mềm) và dựng người
  (`Person`/`skinFigure`, ~130 ms). `heightAt` giờ chủ yếu là noise (`fbm`).
- Bóng đổ: frustum đã co theo khoảng cách camera (`sky.js`, 50–170 đơn vị), mây không đổ bóng, người/toa ở xa không đổ
  bóng (`figureShadows`). Còn: xe (Instancer — cả đội một mesh, không tắt từng chiếc được), đồ tĩnh nhỏ trong `world.batch`.
