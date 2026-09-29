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
| `npm test` | Unit test Vitest (`tests/unit/`): tiện ích, config world, `needs`, `Track.distanceTo`, `Site`, `NavGrid`, lịch chạy tàu (`Schedule`), thuyền, chim | ~1 s |
| `npm run e2e` | Playwright Test (`tests/e2e/`): dựng mọi world trong Chromium không giao diện (GPU phần mềm — cùng kết quả mọi máy) | ~45 s |

E2E gồm:
1. **So với golden** (`tests/e2e/golden/<id>.json`): checksum mọi đỉnh, vị trí từng cây/đá/hoa, số
   collider, spot, trạm, số người, draw call, shader. Lệch 1 cái cây cũng báo, kèm diff.
2. **Tua nhanh 300 s**: người lên/xuống tàu, cửa mở, bật ô khi mưa, người leo núi đi, tàu dừng ≥ 2 lần.
3. **Đổi world 2 vòng**: số geometry/texture/shader trên GPU phải như lần đầu (không rò).
4. **Tổ hợp feature**: world tối giản dựng được; thiếu thứ gì thì lỗi phải nói rõ.

Cố ý đổi một world (thêm feature, sửa config…): `npm run e2e -- --update-snapshots` ghi lại golden,
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
  dân làng, chim, người leo núi), bật/tắt và chỉnh bằng `cfg.features`: `'sheep'` hoặc
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
