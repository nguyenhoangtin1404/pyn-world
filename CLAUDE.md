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
| Nhiều bản **giống hệt nhau** có cử động (cừu, cá…) | `Instancer`: mỗi con chỉ giữ `Object3D` rỗng làm anchor, cả đàn 1 InstancedMesh cho mỗi bộ phận | SkinnedMesh (xem bên dưới) |
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

## Hiệu ứng chạy trên GPU (`src/render/shaders.js`)

Thứ gì thay đổi mỗi frame trên nhiều đỉnh/hạt (sóng nước, dòng chảy, bọt, tuyết phủ, mưa, tuyết
rơi, cây lay trong gió, đèn cửa sổ theo giờ) được tính **trong shader**, CPU chỉ cập nhật uniform.
Đừng quay lại vòng lặp JS sửa `position`/`color` từng đỉnh mỗi frame.

- `GLOBALS` (`uTime`, `uWind`, `uWindDir`, `uHour`, `uSnow`) được `main.js` ghi **một lần mỗi
  frame**; mọi shader liên kết tới đúng các object này (không copy), nên ghi một chỗ là tới tất cả.
  Cần thêm biến toàn cục → thêm vào `GLOBALS` rồi ghi ở `frame()`.
- Chèn GLSL vào material có sẵn bằng `patchMaterial(mat, { uniforms, vertex: { head, after },
  fragment: { head, after } })` — `after` là `{ tênChunk: code }` chèn ngay sau
  `#include <tênChunk>`. **Không** tự viết `onBeforeCompile` trần: three.js cache shader theo
  `customProgramCacheKey`, hai bản vá khác nhau với cùng hàm bọc sẽ bị dùng chung một shader.
  `patchMaterial` bỏ qua bản vá đã áp (material dùng chung cho nhiều mesh — trước đây vá 2 lần làm
  GLSL khai báo trùng và tán cây **biến mất** không báo lỗi). Khi nghi shader hỏng: xem
  `renderer.properties.get(mat).currentProgram.diagnostics`.
- Có sẵn: `snowCover(mat)` (cần attribute `snowWeight`), `swaying(instancedMesh)` (cây lay gió,
  kèm depth material để bóng lay theo). Vật mới có lá/tuyết → dùng lại, đừng viết lại.
- Nước: độ sâu / tỉ lệ sông / bọt / hướng dòng chảy nướng sẵn thành attribute (`aWater`, `aFlow`)
  một lần khi dựng; bọt quanh trụ cầu thêm bằng `terrain.addFoam(points)`.
- Đèn cửa sổ: mỗi ô kính mang giờ ngủ/giờ dậy của nhà đó (attribute `aLight`, gắn bằng `pane()`
  trong `scenery.js`). Mọi part dùng `windowMat` phải có `aLight` (StaticBatch cần cùng attribute).

## Nhịp sống & tính tất định

Thế giới dựng từ `mulberry32(SEED)`: thêm một lần gọi `rng()` ở giữa sẽ **dịch chuyển toàn bộ**
nhà, cây, cừu phía sau. Dữ liệu mới không ảnh hưởng bố cục (giờ ngủ, giờ nấu ăn, sao…) dùng
generator riêng `mulberry32(SEED + n)` như `hoursRng`, `clockRng`.

Giờ trong ngày (`state.hour`) đi vào `scenery.update(dt, t, { hour, snow })` và
`life.update(dt, t, { rain, hour })`. Người ở trong nhà / trên tàu / cắm trại thì
`group.visible = false` — code nào duyệt người (chim, camera theo dõi…) phải bỏ qua người đang ẩn.

## Đo trước khi tối ưu

Bật `?stats` (chỉ ở dev). Khi đổi cách render: ghi số draw call và ms/frame ở cùng góc camera
**trước và sau**. Ít draw call hơn **không** tự động nhanh hơn — trên GPU mạnh mỗi draw call chỉ
~2 µs, còn SkinnedMesh / upload buffer mỗi frame có giá cố định. Trong DevTools có `window.__pyn`
(`{ W, camera, state }`) để đo bằng `W.post.renderer.info`.

Mốc đã đo (2026-09-29, góc toàn cảnh, tính cả lượt vẽ bóng): bản gốc 1683 draw call, 323
material, 898 geometry → sau tối ưu 353 draw call, 84 material, 238 geometry (góc nhà ga
1261 → 319, góc làng 1155 → 214); thời gian frame
trên máy dev (GPU rời) gần như không đổi — lợi ích chủ yếu ở máy yếu/di động nơi draw call đắt.

## Chưa làm (việc tiếp theo nếu cần nhanh hơn)

- Bóng đổ: shadow map 2048 phủ 340×340 đơn vị, lượt vẽ bóng chiếm ~0,8 ms → thu hẹp frustum theo
  khoảng cách camera, tắt `castShadow` cho vật nhỏ ở xa.
