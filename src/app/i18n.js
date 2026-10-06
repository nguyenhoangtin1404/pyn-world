// @ts-check

// The app in Vietnamese (the default) or English, for visitors from abroad. Every string a visitor sees is here,
// under a key, in both languages:
//  - static text in index.html: the element has `data-i18n="key"` (its text), `data-i18n-html="key"` (its HTML:
//    links, <kbd>) or `data-i18n-attr="aria-label:key;title:key2"`; the Vietnamese text in index.html must be the
//    same as `vi[key]` (tests/unit/i18n.test.js checks it). applyStatic() fills them at run time, localizeHtml()
//    at build time (the English page en/index.html, tools/seo/plugin.js);
//  - text made in JS: t('key', { name }) — `{name}` in the string is filled in;
//  - text that comes from the worlds' own data (build-step labels of the loading screen, the names of what the
//    camera follows, landmark names, taglines): tr(vietnamese) looks the Vietnamese up in PHRASES (English only).
// A key missing in English falls back to Vietnamese (and the unit test fails: every key has both).
// Language: ?lang=en|vi, else the page (/en/ is English), else the visitor's choice remembered by the EN/VI button
// (localStorage), else Vietnamese. Not the browser's language: most visitors read Vietnamese whatever it says.

/** @typedef {'vi' | 'en'} Lang */

/** @type {Record<Lang, Record<string, string>>} */
export const STRINGS = {
  vi: {
    // index.html
    'noscript.title': 'PYN World – Tháp Nghinh Phong 3D',
    'noscript.text': 'Sa bàn 3D low-poly tương tác quanh Tháp Nghinh Phong, Tuy Hòa, Đắk Lắk (Phú Yên cũ), dựng từ dữ liệu bản đồ thật. Cần bật JavaScript và WebGL để xem.',
    'help.title': 'Phím tắt',
    'help.hide': 'ẩn',
    'keys.overview': 'Toàn cảnh',
    'keys.train': 'Theo tàu · Cầu · Hành khách · Lái tàu',
    'keys.person': 'Đi theo một người (bấm lại để đổi người)',
    'keys.bird': 'Đi theo một con chim / khinh khí cầu / máy bay (bấm lại để đổi)',
    'keys.vehicle': 'Đi theo một chiếc xe (bấm lại để đổi)',
    'keys.tourist': 'Đi theo một du khách ở tháp (bấm lại để đổi người)',
    'keys.balloon': 'Đi theo một quả khinh khí cầu (bấm lại để đổi)',
    'keys.bridge': 'Chuyển sang cây cầu kế tiếp',
    'keys.look': 'Nhìn quanh (Hành khách, Lái tàu)',
    'keys.orbit': 'Xoay camera (Toàn cảnh)',
    'keys.pan': 'Di chuyển ngang (Toàn cảnh)',
    'keys.zoom': 'Zoom về phía con trỏ',
    'keys.fly': 'Bay trong Toàn cảnh / xuống, lên',
    'keys.fast': 'Bay nhanh hơn',
    'keys.courting': 'Bay tới đôi cừu đang yêu',
    'keys.bridgeSheep': 'Bay tới chú cừu bên cầu',
    'keys.summit': 'Bay lên đỉnh núi có người leo',
    'keys.fisherman': 'Bay tới thuyền câu cá',
    'keys.steamer': 'Bay tới tàu hơi nước trên sông',
    'keys.landmark': 'Bay tới tháp / công trình nổi tiếng kế tiếp',
    'keys.tour': 'Thuyết minh giới thiệu tháp (bấm lại hoặc <kbd>Esc</kbd> để dừng)',
    'keys.pixel': 'Đổi mức pixel art',
    'keys.outline': 'Bật/tắt viền mực',
    'keys.time': 'Nhảy tới buổi kế tiếp / trước đó (rồi ngày trôi nhanh)',
    'keys.clock': 'Giờ thật ⇄ ngày trôi nhanh (1 ngày = 4 phút)',
    'keys.pause': 'Tạm dừng',
    'keys.timeScale': 'Tốc độ thời gian 0× / 1×',
    'keys.mute': 'Tắt / bật tiếng',
    'keys.hud': 'Ẩn / hiện giao diện',
    'keys.worlds': 'Sang thế giới kế tiếp (hoặc bấm tên thế giới ở góc trên)',
    'kbd.drag': 'Kéo',
    'kbd.right': 'Chuột phải',
    'kbd.wheel': 'Lăn',
    'panel.open': 'Mở bảng điều khiển',
    'panel.advanced': 'Nâng cao',
    'panel.speed': '🚂 Tốc độ tàu',
    'panel.speedTitle': 'Chuột phải để đặt lại',
    'panel.timeScale': '⏱ Thời gian',
    'panel.timeScaleTitle': 'X · 0× / 1× · Chuột phải để đặt lại',
    'panel.pixelTitle': 'Phím P',
    'panel.help': '⌨ Phím tắt',
    'aria.worlds': 'Chọn thế giới (phím N)',
    'aria.cameras': 'Góc máy quay',
    'aria.time': 'Giờ trong ngày',
    'aria.weather': 'Thời tiết',
    'aria.mute': 'Tắt tiếng',
    'aria.volume': 'Âm lượng',
    'aria.follow': 'Máy quay đi theo',
    'aria.pixel': 'Độ phân giải pixel art',
    credits: '<a href="https://github.com/nguyenhoangtin1404/pyn-world" target="_blank" rel="noopener">Mã nguồn (AGPL-3.0)</a> · Bản đồ © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> (ODbL) · Độ cao SRTM',
    'about.title': 'Tháp Nghinh Phong Tuy Hòa 3D',
    'about.close': 'Đóng giới thiệu',
    'about.intro': 'Tháp Nghinh Phong ở ven biển Tuy Hòa (Phú Yên cũ, nay thuộc tỉnh Đắk Lắk), do HUNI architectes thiết kế (hoàn thành 2021): hai tháp, mỗi tháp 50 cột đá lục giác, cột nhọn cao 35 m và 30 m, quảng trường rộng hơn 7 000 m². PYN World dựng lại khu vực này thành sa bàn low-poly tương tác 2 × 2 km, với phố, nhà, bãi biển, du khách và chu kỳ ngày đêm.',
    'about.how': 'Kéo để xoay, lăn chuột hoặc chụm hai ngón để phóng to; bấm 🎙 Thuyết minh để camera đưa đi một vòng quanh tháp.',
    'about.credits': '<a href="https://github.com/nguyenhoangtin1404/pyn-world" target="_blank" rel="noopener">Mã nguồn (AGPL-3.0)</a> · Bản đồ © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> (ODbL), dữ liệu qua <a href="https://overturemaps.org/" target="_blank" rel="noopener">Overture Maps</a> · Độ cao SRTM',
    'host.label': 'Lời chào của tác giả',
    'host.close': 'Đóng',
    'host.link': 'Mở portfolio ↗',
    'tour.label': 'Thuyết minh',
    'tour.prev': 'Đoạn trước',
    'tour.next': 'Đoạn sau',
    'tour.stop': '✕ Dừng',
    'tour.stopLabel': 'Dừng thuyết minh (Esc)',
    'load.tagline': 'SA BÀN LOW-POLY',
    'load.start': 'Đang khởi động',
    'load.progress': 'Tiến độ tải',

    // the control panel (hud.js)
    'panel.close': 'Thu gọn',
    'hud.worldTitle': '{name} (phím N: thế giới kế tiếp)',
    'hud.keyed': '{what} (phím {key})',
    'hud.overview': '🗺 Toàn cảnh',
    'hud.tower': '🏛 Tháp',
    'hud.towerTitle': 'Bay tới tháp',
    'hud.tour': '🎙 Thuyết minh',
    'hud.tourTitle': 'Thuyết minh',
    'hud.about': 'ℹ Giới thiệu',
    'hud.realTime': '🕒 Giờ thật',
    'hud.realTimeTitle': 'Giờ Việt Nam lúc này, trôi như thật (phím C)',
    'hud.fast': '⟳ Tua nhanh',
    'hud.fastTitle': 'Ngày trôi nhanh: 1 ngày = 4 phút (phím C)',
    'hud.outline': '✎ Viền mực',
    'hud.shadows': '◐ Bóng đổ',
    'hud.paused': 'Dừng',
    'hud.lang': '🌐 EN',
    'hud.langTitle': 'English version',
    'cam.overview': 'Toàn cảnh',
    'cam.train': 'Theo tàu',
    'cam.bridge': 'Cây cầu',
    'cam.passenger': 'Hành khách',
    'cam.driver': 'Lái tàu',
    'cam.person': 'Theo người',
    'cam.bird': 'Theo chim',
    'cam.vehicle': 'Theo xe',
    'cam.tourist': 'Du khách',
    'cam.balloon': 'Khinh khí cầu',
    'time.morning': 'Sáng',
    'time.day': 'Trưa',
    'time.evening': 'Chiều',
    'time.night': 'Đêm',
    'weather.clear': '☀ Nắng',
    'weather.rain': '☂ Mưa',
    'weather.snow': '❄ Tuyết',
    'pixel.1': 'Tắt',
    'pixel.2': 'Mịn',
    'pixel.3': 'Vừa',
    'pixel.4': 'Thô',
    'pixel.6': 'Rất thô',

    // toasts (keys.js, main.js)
    'toast.following': 'Đang theo: {label}',
    'toast.camera': 'Camera: {label}',
    'toast.noSpot': 'Thế giới này không có chỗ đó',
    'toast.bridge': 'Cầu số {n}',
    'toast.pixel': 'Pixel art: {label}',
    'toast.outlineOn': 'Viền mực: bật',
    'toast.outlineOff': 'Viền mực: tắt',
    'toast.fast': '⟳ Ngày trôi nhanh (1 ngày = 4 phút)',
    'toast.real': '🕒 Giờ thật (giờ Việt Nam)',
    'toast.paused': 'Tạm dừng',
    'toast.resumed': 'Tiếp tục',
    'toast.timeScale': 'Thời gian {n}×',
    'toast.muted': 'Tắt tiếng',
    'toast.unmuted': 'Bật tiếng',
    'toast.courting': 'Bay tới đôi cừu đang yêu 💕',
    'toast.bridgeSheep': 'Bay tới chú cừu ngắm sông',
    'toast.summit': 'Bay lên đỉnh núi ⛰',
    'toast.fisherman': 'Bay tới ông câu cá 🎣',
    'toast.steamer': 'Bay tới tàu hơi nước ⛴',
    'toast.nothingToFollow': 'Thế giới này không có gì để theo',
    'toast.noLandmark': 'Thế giới này không có công trình nổi tiếng',
    'toast.flyTo': 'Bay tới {name} 🏛',
    'toast.noTour': 'Thế giới này không có thuyết minh',
    'toast.tourStopped': 'Đã dừng thuyết minh',
    'toast.world': 'Thế giới: {name}',
    'toast.lang': 'Tiếng Việt',
    'canvas.label': 'Sa bàn 3D low-poly',
    'canvas.world': 'Sa bàn 3D low-poly {name}{around}: phố, nhà, cây, người và xe chuyển động, ngày đêm. Kéo để xoay, lăn chuột để phóng to; nút Giới thiệu kể về nơi này.',
    'canvas.around': ' quanh {sights}',

    // the loading screen (loader.js, main.js, boot.js)
    'load.map': 'Đang tải bản đồ',
    'load.shaders': 'Đang chuẩn bị shader',
    'load.error': 'Lỗi: {message}',
    'hint.drag': 'Kéo chuột để xoay quanh, lăn chuột để zoom, chuột phải để di chuyển ngang.',
    'hint.clock': 'Ngày đêm tự trôi; bấm C để dừng/chạy đồng hồ, T để nhảy giờ.',
    'hint.panel': 'Bảng điều khiển ở dưới màn hình: bấm "Mở bảng điều khiển" để đổi giờ, thời tiết, âm lượng.',
    'hint.landmark': 'Bấm V để bay tới tháp Nghinh Phong.',
    'hint.tour': 'Bấm I để nghe thuyết minh giới thiệu tháp Nghinh Phong.',
    'hint.tourists': 'Bấm 9 để đi theo một du khách trên quảng trường tháp.',
    'hint.balloons': 'Bấm 0 để theo một quả khinh khí cầu.',
    'hint.traffic': 'Bấm 8 để đi theo một chiếc xe trên phố.',
    'hint.strollers': 'Bấm 6 để đi theo một người đi dạo.',
    'hint.beach': 'Phố đông vào giờ cao điểm, vắng buổi trưa; chiều tối bãi biển và quảng trường lại đông.',
    'hint.seacraft': 'Sau nửa đêm mọi người về nhà, ngoài biển thuyền câu mực sáng đèn.',
    'hint.train': 'Bấm 2 để theo tàu, 4 ngồi cùng hành khách, 5 lái tàu.',
    'hint.stations': 'Tàu dừng ở từng ga để khách lên xuống.',
    'hint.sheep': 'Bấm F để tìm đôi cừu đang yêu nhau.',
    'hint.hikers': 'Bấm K để bay lên đỉnh núi, nơi dân leo núi vẫy tay chào.',

    // the narrated tour (tour.js)
    'tour.muted': '🔇 Đang tắt tiếng — bấm M để nghe thuyết minh.',
    'tour.tap': '🔈 Chạm vào màn hình hoặc bấm một phím để nghe thuyết minh.',
    'tour.noVoice': '🔇 Máy này chưa có giọng đọc tiếng Việt nên chỉ hiện phụ đề.',

    // the author's card (host.js)
    'host.qr': 'Mã QR tới {title}',

    // no WebGL (fallback.js)
    'fallback.noglTitle': 'Trình duyệt này chưa hiển thị được 3D',
    'fallback.noglText': 'Sa bàn cần WebGL. Hãy bật tăng tốc phần cứng (hardware acceleration) trong cài đặt trình duyệt, cập nhật trình duyệt hoặc thử trên máy khác.',
    'fallback.lostTitle': 'Đồ họa 3D vừa bị tạm dừng',
    'fallback.lostText': 'Trình duyệt đã thu hồi bộ nhớ đồ họa của trang (máy thiếu bộ nhớ hoặc trình điều khiển GPU khởi động lại). Tải lại trang để xem tiếp.',
    'fallback.photo': 'Tháp Nghinh Phong bên bờ biển Tuy Hòa',
    'fallback.retry': '↻ Thử lại',
  },
  en: {
    'noscript.title': 'PYN World – Nghinh Phong Tower 3D',
    'noscript.text': 'An interactive low-poly 3D diorama around Nghinh Phong Tower, Tuy Hòa, Đắk Lắk (formerly Phú Yên), Viet Nam, built from real map data. JavaScript and WebGL are needed to see it.',
    'help.title': 'Keyboard shortcuts',
    'help.hide': 'hide',
    'keys.overview': 'Overview',
    'keys.train': 'Follow the train · Bridge · Passenger · Driver',
    'keys.person': 'Follow a person (press again for another)',
    'keys.bird': 'Follow a bird / hot-air balloon / plane (press again for another)',
    'keys.vehicle': 'Follow a vehicle (press again for another)',
    'keys.tourist': 'Follow a visitor at the tower (press again for another)',
    'keys.balloon': 'Follow a hot-air balloon (press again for another)',
    'keys.bridge': 'Go to the next bridge',
    'keys.look': 'Look around (Passenger, Driver)',
    'keys.orbit': 'Turn the camera (Overview)',
    'keys.pan': 'Move sideways (Overview)',
    'keys.zoom': 'Zoom towards the pointer',
    'keys.fly': 'Fly in Overview / down, up',
    'keys.fast': 'Fly faster',
    'keys.courting': 'Fly to the sheep in love',
    'keys.bridgeSheep': 'Fly to the sheep by the bridge',
    'keys.summit': 'Fly up to the summit with the hikers',
    'keys.fisherman': 'Fly to the fishing boat',
    'keys.steamer': 'Fly to the river steamer',
    'keys.landmark': 'Fly to the next tower / landmark',
    'keys.tour': 'Narrated tour of the tower (press again or <kbd>Esc</kbd> to stop)',
    'keys.pixel': 'Change the pixel-art level',
    'keys.outline': 'Ink outlines on / off',
    'keys.time': 'Jump to the next / previous time of day (then the day runs fast)',
    'keys.clock': 'Real time ⇄ fast day (1 day = 4 minutes)',
    'keys.pause': 'Pause',
    'keys.timeScale': 'Time speed 0× / 1×',
    'keys.mute': 'Sound off / on',
    'keys.hud': 'Hide / show the interface',
    'keys.worlds': 'Next world (or tap a world’s name at the top)',
    'kbd.drag': 'Drag',
    'kbd.right': 'Right-click',
    'kbd.wheel': 'Wheel',
    'panel.open': 'Open the control panel',
    'panel.advanced': 'Advanced',
    'panel.speed': '🚂 Train speed',
    'panel.speedTitle': 'Right-click to reset',
    'panel.timeScale': '⏱ Time',
    'panel.timeScaleTitle': 'X · 0× / 1× · Right-click to reset',
    'panel.pixelTitle': 'Key P',
    'panel.help': '⌨ Shortcuts',
    'aria.worlds': 'Choose a world (key N)',
    'aria.cameras': 'Camera views',
    'aria.time': 'Time of day',
    'aria.weather': 'Weather',
    'aria.mute': 'Mute',
    'aria.volume': 'Volume',
    'aria.follow': 'Follow cameras',
    'aria.pixel': 'Pixel-art resolution',
    credits: '<a href="https://github.com/nguyenhoangtin1404/pyn-world" target="_blank" rel="noopener">Source code (AGPL-3.0)</a> · Map © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> (ODbL) · SRTM elevation',
    'about.title': 'Nghinh Phong Tower, Tuy Hòa, in 3D',
    'about.close': 'Close the introduction',
    'about.intro': 'Nghinh Phong Tower stands on the seafront of Tuy Hòa (formerly Phú Yên province, now part of Đắk Lắk), Viet Nam. Designed by HUNI architectes and completed in 2021, it is made of two towers, each of 50 hexagonal stone columns, with spires 35 m and 30 m high, on a square of more than 7,000 m². PYN World rebuilds the area as an interactive 2 × 2 km low-poly diorama, with streets, houses, the beach, visitors and a day–night cycle.',
    'about.how': 'Drag to turn, scroll or pinch to zoom; tap 🎙 Tour for a camera tour round the tower.',
    'about.credits': '<a href="https://github.com/nguyenhoangtin1404/pyn-world" target="_blank" rel="noopener">Source code (AGPL-3.0)</a> · Map © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> (ODbL), data via <a href="https://overturemaps.org/" target="_blank" rel="noopener">Overture Maps</a> · SRTM elevation',
    'host.label': 'A greeting from the author',
    'host.close': 'Close',
    'host.link': 'Open portfolio ↗',
    'tour.label': 'Narrated tour',
    'tour.prev': 'Previous',
    'tour.next': 'Next',
    'tour.stop': '✕ Stop',
    'tour.stopLabel': 'Stop the tour (Esc)',
    'load.tagline': 'LOW-POLY DIORAMA',
    'load.start': 'Starting',
    'load.progress': 'Loading progress',

    'panel.close': 'Collapse',
    'hud.worldTitle': '{name} (key N: next world)',
    'hud.keyed': '{what} (key {key})',
    'hud.overview': '🗺 Overview',
    'hud.tower': '🏛 Tower',
    'hud.towerTitle': 'Fly to the tower',
    'hud.tour': '🎙 Tour',
    'hud.tourTitle': 'Narrated tour',
    'hud.about': 'ℹ About',
    'hud.realTime': '🕒 Real time',
    'hud.realTimeTitle': 'The time in Viet Nam now, running as it does (key C)',
    'hud.fast': '⟳ Fast day',
    'hud.fastTitle': 'The day runs fast: 1 day = 4 minutes (key C)',
    'hud.outline': '✎ Ink outlines',
    'hud.shadows': '◐ Shadows',
    'hud.paused': 'Paused',
    'hud.lang': '🌐 VI',
    'hud.langTitle': 'Tiếng Việt',
    'cam.overview': 'Overview',
    'cam.train': 'Train',
    'cam.bridge': 'Bridge',
    'cam.passenger': 'Passenger',
    'cam.driver': 'Driver',
    'cam.person': 'Person',
    'cam.bird': 'Bird',
    'cam.vehicle': 'Vehicle',
    'cam.tourist': 'Visitor',
    'cam.balloon': 'Balloon',
    'time.morning': 'Morning',
    'time.day': 'Noon',
    'time.evening': 'Evening',
    'time.night': 'Night',
    'weather.clear': '☀ Sunny',
    'weather.rain': '☂ Rain',
    'weather.snow': '❄ Snow',
    'pixel.1': 'Off',
    'pixel.2': 'Fine',
    'pixel.3': 'Medium',
    'pixel.4': 'Coarse',
    'pixel.6': 'Very coarse',

    'toast.following': 'Following: {label}',
    'toast.camera': 'Camera: {label}',
    'toast.noSpot': 'This world has no such place',
    'toast.bridge': 'Bridge {n}',
    'toast.pixel': 'Pixel art: {label}',
    'toast.outlineOn': 'Ink outlines: on',
    'toast.outlineOff': 'Ink outlines: off',
    'toast.fast': '⟳ Fast day (1 day = 4 minutes)',
    'toast.real': '🕒 Real time (Viet Nam)',
    'toast.paused': 'Paused',
    'toast.resumed': 'Resumed',
    'toast.timeScale': 'Time {n}×',
    'toast.muted': 'Sound off',
    'toast.unmuted': 'Sound on',
    'toast.courting': 'Flying to the sheep in love 💕',
    'toast.bridgeSheep': 'Flying to the sheep watching the river',
    'toast.summit': 'Flying up to the summit ⛰',
    'toast.fisherman': 'Flying to the angler 🎣',
    'toast.steamer': 'Flying to the steamer ⛴',
    'toast.nothingToFollow': 'Nothing to follow in this world',
    'toast.noLandmark': 'This world has no landmark',
    'toast.flyTo': 'Flying to {name} 🏛',
    'toast.noTour': 'This world has no narrated tour',
    'toast.tourStopped': 'Tour stopped',
    'toast.world': 'World: {name}',
    'toast.lang': 'English',
    'canvas.label': 'Low-poly 3D diorama',
    'canvas.world': 'Low-poly 3D diorama {name}{around}: streets, houses, trees, moving people and vehicles, day and night. Drag to turn, scroll to zoom; the About button tells about the place.',
    'canvas.around': ' around {sights}',

    'load.map': 'Loading the map',
    'load.shaders': 'Preparing shaders',
    'load.error': 'Error: {message}',
    'hint.drag': 'Drag to look around, scroll to zoom, right-click to move sideways.',
    'hint.clock': 'Day and night go by on their own; press C to switch the clock between real time and a fast day, T to jump in time.',
    'hint.panel': 'The control panel is at the bottom of the screen: tap "Open the control panel" to change the time, the weather, the volume.',
    'hint.landmark': 'Press V to fly to Nghinh Phong Tower.',
    'hint.tour': 'Press I for a narrated tour of Nghinh Phong Tower.',
    'hint.tourists': 'Press 9 to follow a visitor on the tower’s square.',
    'hint.balloons': 'Press 0 to follow a hot-air balloon.',
    'hint.traffic': 'Press 8 to follow a vehicle in the streets.',
    'hint.strollers': 'Press 6 to follow someone out for a walk.',
    'hint.beach': 'The streets are busy at rush hour and quiet at noon; in the late afternoon the beach and the square fill up again.',
    'hint.seacraft': 'After midnight everyone goes home, and out at sea the squid boats light their lamps.',
    'hint.train': 'Press 2 to follow the train, 4 to ride with the passengers, 5 to drive it.',
    'hint.stations': 'The train stops at every station for passengers to get on and off.',
    'hint.sheep': 'Press F to find the two sheep in love.',
    'hint.hikers': 'Press K to fly up to the summit, where the hikers wave hello.',

    'tour.muted': '🔇 The sound is off — press M to hear the tour.',
    'tour.tap': '🔈 Tap the screen or press a key to hear the tour.',
    'tour.noVoice': '🔇 This device has no English voice, so the tour shows subtitles only.',

    'host.qr': 'QR code to {title}',

    'fallback.noglTitle': 'This browser cannot show 3D yet',
    'fallback.noglText': 'The diorama needs WebGL. Turn on hardware acceleration in the browser’s settings, update the browser or try another device.',
    'fallback.lostTitle': '3D graphics were paused',
    'fallback.lostText': 'The browser took back the page’s graphics memory (the device ran low on memory or the GPU driver restarted). Reload the page to carry on.',
    'fallback.photo': 'Nghinh Phong Tower on the seafront of Tuy Hòa',
    'fallback.retry': '↻ Try again',
  },
};

// Vietnamese text from the worlds' own data → English: the loading screen's build steps (World.js core steps
// and each feature's `label`), the names of what the cameras follow (with a number after them), landmark names,
// taglines, the author's default greeting. Not keyed by feature id: World.steps() hands out labels only.
/** @type {Record<string, string>} */
export const PHRASES = {
  // build steps
  'Đang trải đường ray': 'Laying the track',
  'Đang nặn địa hình': 'Shaping the land',
  'Đang đào đường hầm': 'Digging the tunnel',
  'Đang dựng cầu và tà vẹt': 'Building bridges and sleepers',
  'Đang pha màu bầu trời': 'Mixing the sky’s colours',
  'Đang hoàn thiện': 'Finishing',
  'Đang cất cánh máy bay': 'Taking off the planes',
  'Đang bơm khinh khí cầu': 'Inflating the balloons',
  'Đang ra bãi biển': 'Heading to the beach',
  'Đang gọi chim': 'Calling the birds',
  'Đang hạ thủy thuyền': 'Launching the boats',
  'Đang xây nhà': 'Building houses',
  'Đang dựng bến xe buýt': 'Setting up the bus stop',
  'Đang cho xe ra phố': 'Sending cars into the streets',
  'Đang thổi mây': 'Blowing the clouds',
  'Đang thả cá': 'Releasing the fish',
  'Đang dựng trạm và khu phố': 'Building the halt and its town',
  'Đang mở đường mòn': 'Clearing the trails',
  'Đang mời tác giả ra quảng trường': 'Inviting the author to the square',
  'Đang dựng công trình': 'Raising the landmarks',
  'Đang làm đường': 'Building the road',
  'Đang thả thuyền ra biển': 'Sending boats out to sea',
  'Đang thả cừu': 'Letting the sheep out',
  'Đang xây nhà ga': 'Building the station',
  'Đang cho phố thêm đời sống': 'Bringing the streets to life',
  'Đang trải đường phố': 'Laying the streets',
  'Đang cho người đi dạo': 'Sending people out for a walk',
  'Đang đón khách du lịch': 'Welcoming the visitors',
  'Đang cho xe chạy': 'Starting the traffic',
  'Đang lắp đầu máy': 'Coupling the locomotive',
  'Đang trồng cây': 'Planting trees',
  'Đang dựng làng': 'Building the village',
  'Đang đón dân làng': 'Welcoming the villagers',
  'Đang dựng cối xay gió': 'Raising the windmill',
  // landmarks, taglines, greetings
  'Tháp Nghinh Phong': 'Nghinh Phong Tower',
  'Tháp Nhạn': 'Nhạn Tower',
  'PHƯỜNG TUY HÒA': 'TUY HÒA WARD',
  'SA BÀN ĐƯỜNG SẮT': 'RAILWAY DIORAMA',
  'TỪ BẢN ĐỒ THẬT': 'FROM A REAL MAP',
  'Xin chào! Quét mã để xem portfolio của mình 👋': 'Hello! Scan the code to see my portfolio 👋',
  // what the cameras follow (followed by a number, or a landmark's name and a number)
  'Người đi dạo': 'Walker',
  'Bãi biển': 'Beach-goer',
  'Quán cóc': 'Street café',
  'Gánh hàng rong': 'Street vendor',
  'Dù bay': 'Parasail',
  'Khinh khí cầu': 'Hot-air balloon',
  'Máy bay': 'Plane',
  'Người leo núi': 'Hiker',
  'Dân làng': 'Villager',
  'Em bé': 'Child',
  'Bồ câu': 'Pigeon',
  'Xe đạp': 'Bicycle',
  'Xe máy': 'Motorbike',
  'Ô tô': 'Car',
  'Xe bán tải': 'Pickup',
  'Xe tải': 'Truck',
  'Xe buýt': 'Bus',
  'Chim sáo (đàn chữ V)': 'Mynas (V formation)',
  'Chim nhạn (đàn chữ V)': 'Swallows (V formation)',
  'Hải âu': 'Gulls',
  'Hải âu trên biển': 'Gulls over the sea',
  'Cò trắng trên đồng': 'Egrets over the fields',
};

/** @type {Lang} */
let current = 'vi';
/** @type {Set<(lang: Lang) => void>} */
const listeners = new Set();

/** The language on screen. */
export const lang = () => current;

/**
 * The string for `key` in the current language (Vietnamese if English has none), `{name}` filled from `vars`.
 * @param {string} key @param {Record<string, string | number>} [vars] @param {Lang} [l]
 */
export function t(key, vars, l = current) {
  const s = STRINGS[l][key] ?? STRINGS.vi[key] ?? key;
  return vars ? s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : s;
}

/**
 * Vietnamese text from a world's data, in the current language: a phrase in PHRASES, or one followed by a number
 * ("Xe máy 3"), or "Du khách <landmark> 2"; anything else as it is.
 * @param {string} vi @param {Lang} [l]
 */
export function tr(vi, l = current) {
  if (l === 'vi' || !vi) return vi;
  if (PHRASES[vi]) return PHRASES[vi];
  const n = /^(.*\S) (\d+)$/.exec(vi); // "<what> <n>", or "<who> <landmark> <n>"
  if (n && PHRASES[n[1]]) return `${PHRASES[n[1]]} ${n[2]}`;
  const at = n && /^(Du khách|Khách thăm) (.+)$/.exec(n[1]);
  if (at) return `Visitor at ${tr(at[2], l)} ${n[2]}`;
  return vi;
}

/**
 * The language to show: ?lang=, else the page (/en/), else the remembered choice, else Vietnamese.
 * @param {{ search?: string, pathname?: string, stored?: string | null }} where
 * @returns {Lang}
 */
export function pickLang({ search = '', pathname = '/', stored = null }) {
  const asked = new URLSearchParams(search).get('lang');
  if (asked === 'en' || asked === 'vi') return asked;
  if (/\/en(\/|\/index\.html)?$/.test(pathname)) return 'en';
  if (stored === 'en' || stored === 'vi') return stored;
  return 'vi';
}

const KEY = 'pyn.lang';
const stored = () => {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null; // (storage blocked: a private window, a sandbox)
  }
};

/** Fill the static text of the page (index.html's data-i18n*) in the current language. @param {ParentNode} [root] */
export function applyStatic(root = document) {
  for (const el of root.querySelectorAll('[data-i18n]')) el.textContent = t(/** @type {HTMLElement} */ (el).dataset.i18n ?? '');
  for (const el of root.querySelectorAll('[data-i18n-html]')) el.innerHTML = t(/** @type {HTMLElement} */ (el).dataset.i18nHtml ?? '');
  for (const el of root.querySelectorAll('[data-i18n-attr]')) {
    for (const pair of (/** @type {HTMLElement} */ (el).dataset.i18nAttr ?? '').split(';')) {
      const [attr, key] = pair.split(':');
      el.setAttribute(attr, t(key));
    }
  }
}

/** At start (boot.js): pick the language, set <html lang> and the page's static text. */
export function initLang() {
  current = pickLang({ search: location.search, pathname: location.pathname, stored: stored() });
  document.documentElement.lang = current;
  if (current !== 'vi') applyStatic();
  return current;
}

/** Call `fn(lang)` whenever the language changes. @param {(lang: Lang) => void} fn */
export function onLangChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/**
 * Switch the language on screen (the EN/VI button) and remember it. The address follows: /en/ for English,
 * the site's root for Vietnamese (no ?lang=, so that a reload keeps the choice).
 * @param {Lang} l @param {string} [base] the site's base URL
 */
export function setLang(l, base = '/') {
  if (l === current) return;
  current = l;
  try {
    localStorage.setItem(KEY, l);
  } catch {
    /* not remembered: fine */
  }
  document.documentElement.lang = l;
  applyStatic();
  try {
    const params = new URLSearchParams(location.search);
    params.delete('lang');
    const q = params.toString();
    history.replaceState(history.state, '', `${base}${l === 'en' ? 'en/' : ''}${q ? `?${q}` : ''}${location.hash}`);
  } catch {
    /* (a page served from elsewhere: keep its address) */
  }
  for (const fn of listeners) fn(l);
}

const escape = (/** @type {string} */ s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escapeAttr = (/** @type {string} */ s) => escape(s).replace(/"/g, '&quot;');

/**
 * index.html in another language, at build time (the English page for search engines and for visitors from
 * abroad): every data-i18n / data-i18n-html element's content and every data-i18n-attr attribute, and <html lang>.
 * (Text only: the head — title, description, JSON-LD — is the SEO plugin's.)
 * @param {string} html @param {Lang} l
 */
export function localizeHtml(html, l) {
  return html
    .replace(/<html lang="[^"]*"/, `<html lang="${l}"`)
    .replace(/<(\w+)([^>]*?\sdata-i18n(-html)?="([^"]+)"[^>]*)>([\s\S]*?)<\/\1>/g, (all, tag, attrs, isHtml, key) =>
      `<${tag}${attrs}>${isHtml ? t(key, undefined, l) : escape(t(key, undefined, l))}</${tag}>`)
    .replace(/<[^>]*\sdata-i18n-attr="([^"]+)"[^>]*>/g, (open, spec) => {
      for (const pair of spec.split(';')) {
        const [attr, key] = pair.split(':');
        open = open.replace(new RegExp(`(\\s${attr}=")[^"]*"`), (m, pre) => `${pre}${escapeAttr(t(key, undefined, l))}"`);
      }
      return open;
    });
}
