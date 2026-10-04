// @ts-check
import { sealText } from '../world/seal.js';

// What the narrated tour of Tháp Nghinh Phong says, stop by stop (the camera shots are in
// nghinh-phong.js). Kept apart so that tools/tour/voice.mjs can record the same words as MP3
// (public/tour/nghinh-phong-<id>.mp3), which the tour plays where they exist. Facts only from the
// official description (see CLAUDE.md); change them here, and in the SEO text, together.

/** The audio file for a stop, under the site's base. @param {string} id */
export const tourAudio = (id) => `tour/nghinh-phong-${id}.mp3`;

/** @returns {{ id: string, say: string }[]} */
export function tourWords() {
  // The sea sign's words come from the seal (not written out again here), in sentence case to be read aloud.
  const sign = sealText().toLowerCase().replace(/^./, (c) => c.toUpperCase()).replace(/(hoàng sa|trường sa|việt nam)/gi, (w) => w.replace(/(^| )./g, (c) => c.toUpperCase()));
  return [
    { id: 'welcome', say: 'Chào mừng bạn đến với Tháp Nghinh Phong, bên bờ biển Tuy Hòa. Nghinh Phong nghĩa là đón gió: công trình quay thẳng ra biển Đông.' },
    { id: 'design', say: 'Tháp do HUNI architectes thiết kế, năm 2021. Hai khối tháp, mỗi khối năm mươi cột đá lục giác xếp so le như tổ ong, lấy cảm hứng từ những cột đá ba dan ở Gành Đá Đĩa.' },
    { id: 'spires', say: 'Hai cột nhọn cao nhất là Lạc Long Quân, cao 35 mét, bên trái nhìn từ đất liền, và Âu Cơ, cao 30 mét, bên phải. Các cột quanh chúng thấp dần theo từng bậc.' },
    { id: 'slot', say: 'Giữa hai tháp là khe đón gió, rộng 2 mét, dài 15 mét, mở ra phía biển. Trên hai vách khe là phù điêu kể truyền thuyết con Rồng cháu Tiên.' },
    { id: 'square', say: 'Tháp đứng trên quảng trường hình bán nguyệt rộng 7 190 mét vuông, lát đá granite: mặt thẳng hướng về phố, mặt cong nhìn xuống bãi cát. Trước tháp, lá cờ đỏ sao vàng bay trong gió biển.' },
    { id: 'sea', say: `Ngoài khơi, trên mặt biển, là dòng chữ: ${sign}.` },
    { id: 'night', say: 'Khi trời tối, đèn trên đỉnh các cột đá sáng lên nhiều màu và hai đỉnh tháp mang đèn đỏ. Cảm ơn bạn đã ghé thăm, mời bạn tự do khám phá sa bàn.' },
  ];
}
