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

- Sóng nước (`terrain.update`), phủ tuyết (`terrain.setSnow`, ~4 ms/lần), mưa/tuyết rơi
  (`weather.js`) đang tính trên CPU mỗi frame → chuyển sang vertex shader với uniform `uTime`.
- Bóng đổ: shadow map 2048 phủ 340×340 đơn vị, lượt vẽ bóng chiếm ~0,8 ms → thu hẹp frustum theo
  khoảng cách camera, tắt `castShadow` cho vật nhỏ ở xa.
