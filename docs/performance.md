# Hiệu năng: số đo và việc còn lại

Chi tiết chuyển từ CLAUDE.md. Luật: đo trước và sau, cùng góc camera.

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
