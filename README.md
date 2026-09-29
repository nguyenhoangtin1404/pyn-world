# PYN World · Train Diorama

Thung lũng low-poly có đoàn tàu hơi nước chạy vòng, dựng hoàn toàn bằng code (procedural) với Three.js — không dùng file model 3D, không dùng file âm thanh.

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # xuất ra dist/ (site tĩnh, deploy lên Netlify/Vercel)
```

## Cấu trúc

| File | Vai trò |
|---|---|
| `src/main.js` | Renderer, loading screen, vòng lặp frame, phím tắt |
| `src/world/track.js` | Đường ray (CatmullRomCurve3), sweep profile → ballast, ray, cầu, trụ cầu, tà vẹt (InstancedMesh) |
| `src/world/terrain.js` | Heightmap từ noise, khoét sông, san phẳng dọc đường ray, màu theo độ cao/độ dốc, tuyết phủ (GPU), nước có sóng, dòng chảy, bọt ven bờ và quanh trụ cầu (GPU), thành đất + bệ gỗ của diorama |
| `src/world/train.js` | Đầu máy + 3 toa, chạy theo curve, dừng ga, bánh xe/thanh truyền, khói |
| `src/world/scenery.js` | Ga, làng, cối xay gió, cừu, cây/hoa/đá (instanced), thuyền, mây |
| `src/world/interiors.js` | Nội thất toa khách (ghế nhung, bàn, cửa sổ, hành khách) và buồng lái (mặt nồi hơi, đồng hồ, lò than) — chỉ hiện khi camera ở bên trong |
| `src/world/people.js` | Con người low-poly: mặt, tóc, mũ, quần áo, khớp gối/khuỷu tay, đồ mang theo, ô khi mưa. Mỗi bộ phận gộp thành 1 mesh vertex-color |
| `src/world/tunnel.js` | Ngọn núi có đường hầm: mesh đồi riêng trùm lên đường ray, cửa hầm vòm đá, lòng hầm có đèn, thông trên đỉnh |
| `src/world/boats.js` | Tàu hơi nước bánh guồng (khói, vệt sóng, thuyền trưởng) và thuyền câu có người thả cần: phao nhấp nháy → cá cắn → kéo cá lên → bỏ vào xô → quăng cần lại |
| `src/world/nav.js` | Lưới dẫn đường + A*: người đi vòng quanh nhà, cây, đá, cột; không leo mép sân ga (chỉ lên qua dốc) |
| `src/world/birds.js` | Bồ câu trên sân ga (mổ, lắc đầu, giật mình bay đi khi có người/tàu tới, đậu lên mái) và các đàn chim bay trên trời |
| `src/world/lowpoly.js` | Bộ dựng hình dùng chung: khối tô màu theo đỉnh, cache material (`lam`), `StaticBatch` gộp vật tĩnh, `Instancer` vẽ cả đàn vật giống nhau bằng 1 InstancedMesh/bộ phận, `skinFigure` biến nhân vật có khớp thành 1 SkinnedMesh. Quy tắc dùng: xem CLAUDE.md |
| `src/world/particles.js` | `ParticlePool` (1 InstancedMesh, opacity riêng từng hạt) và các lớp dùng lại nó: `Smoke` (tàu hỏa, tàu thủy), `Ripples` (gợn nước) |
| `src/world/life.js` | Khinh khí cầu, cá bơi + gợn sóng (cả khi mưa), dân làng đi lại (tối về nhà ngủ, sáng ra ngoài), người leo núi theo đường mòn lên đỉnh (xuống núi trước khi trời tối) |
| `src/world/sky.js` | Bầu trời shader, đồng hồ 24h pha trộn màu giữa 4 buổi, mặt trời mọc đông lặn tây theo quỹ đạo, mặt trăng + ánh trăng, sao xoay theo giờ |
| `src/world/weather.js` | Mưa (LineSegments), tuyết (Points) — cả hai rơi trong vertex shader; độ dày lớp tuyết phủ |
| `src/render/shaders.js` | Uniform dùng chung (`GLOBALS`: giờ, gió, tuyết…), `patchMaterial` chèn GLSL vào material có sẵn, `snowCover`, `swaying` (cây lay gió) |
| `src/render/post.js` | Pixel art (render target độ phân giải thấp + NearestFilter) và viền mực (Laplacian của depth) |
| `src/cameras.js` | 5 chế độ camera, bay WASD, fly-to |
| `src/audio.js` | Âm thanh tổng hợp bằng Web Audio: tiếng xình xịch, ray, còi, mưa, chim |
| `src/hud.js` | Bảng điều khiển |
