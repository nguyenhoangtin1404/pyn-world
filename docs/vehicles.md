# Phương tiện

Chi tiết chuyển từ CLAUDE.md.

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
