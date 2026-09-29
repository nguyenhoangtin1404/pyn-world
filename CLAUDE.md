# PYN World — ghi chú cho người sửa code

Thung lũng low-poly dựng hoàn toàn bằng code với Three.js. Xem README.md để biết mỗi file làm gì.

```bash
npm run dev      # http://localhost:5173  — thêm ?stats để xem draw call / ms mỗi frame
npm run build
```

## Quy tắc render (ĐỪNG phá)

Mọi thứ dựng hình dùng chung nằm ở `src/world/lowpoly.js` và `src/world/particles.js`. Logic của
từng vật (Sheep, Fish, Walker, Train…) vẫn là class riêng; **phần vẽ thì dùng chung**. Chọn đúng
công cụ theo loại vật:

| Loại vật | Dùng | Không dùng |
|---|---|---|
| Đứng yên (nhà, ga, cối xay, hàng rào…) | `StaticBatch`: `batch.at(x,y,z,ry)` rồi `batch.add(parts, mat)`, cuối cùng `group.add(batch.build())` | `new THREE.Mesh` cho từng khối |
| Nhiều bản **giống hệt nhau** có cử động (cừu, cá, cánh cửa nhà…) | `Instancer`: mỗi con chỉ giữ `Object3D` rỗng làm anchor, cả đàn 1 InstancedMesh cho mỗi bộ phận | SkinnedMesh (xem bên dưới) |
| Nhiều bản giống nhau đứng yên (cây, đá, hoa) | `InstancedMesh` như trong `scenery.js` | |
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
  ~3 ms/tia). Dùng `scenery.occludes(a, b)`: hộp cho nhà/ga, trụ cho cối xay/tán cây. Thêm công trình
  lớn thì thêm `solidBox(...)` cho nó.
- `ParticlePool` bỏ qua upload khi không còn hạt nào; đừng sửa `items` từ bên ngoài mà không qua
  `spawn()`.
- **Không thêm `PointLight`/`SpotLight` cho đèn trang trí.** Mỗi đèn được tính cho mọi pixel của
  mọi vật có chiếu sáng, kể cả ban ngày khi cường độ = 0. Đèn ga/phố/cửa nhà = bóng đèn `lampMat` +
  quầng sáng (`halos`) + vũng sáng dưới đất (`pools`) trong `scenery.js`. Chỉ còn đèn pha tàu là
  đèn thật.
- **Thứ chuyển động đều theo thời gian thì tính trong shader** (uniform `uTime`): sóng nước, dòng
  chảy, lá trôi (`water.js`), mưa, tuyết rơi (`weather.js`). CPU chỉ gán 1 số mỗi frame.

## Đo trước khi tối ưu

Bật `?stats` (chỉ ở dev). Khi đổi cách render: ghi số draw call và ms/frame ở cùng góc camera
**trước và sau**. Ít draw call hơn **không** tự động nhanh hơn — trên GPU mạnh mỗi draw call chỉ
~2 µs, còn SkinnedMesh / upload buffer mỗi frame có giá cố định. Trong DevTools có `window.__pyn`
(`{ W, camera, state }`) để đo bằng `W.post.renderer.info`.

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

## Chưa làm (việc tiếp theo nếu cần nhanh hơn)

- Thời gian tải (~3 s): `heightAt` quét cả đường ray (380 điểm) mỗi lần gọi; địa hình ~450 ms, lưới
  dẫn đường ~300 ms → tính sẵn bảng độ cao rồi tra.
- Bóng đổ: frustum đã co theo khoảng cách camera (`sky.js`, 50–170 đơn vị), mây không đổ bóng. Còn
  có thể tắt `castShadow` cho vật nhỏ ở xa.
