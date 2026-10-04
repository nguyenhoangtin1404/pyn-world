// @ts-check
import { sealText } from '../world/seal.js';

// What the narrated tour of Tháp Nghinh Phong says, stop by stop (the camera shots are in
// nghinh-phong.js). Kept apart so that tools/tour/voice.mjs can record the same words as MP3
// (public/tour/nghinh-phong-<id>.mp3), which the tour plays where they exist. Facts only from what several
// independent sources agree on (see CLAUDE.md, "Nội dung thuyết minh"); change them here, and in the SEO text, together.

/** The audio file for a stop, under the site's base. @param {string} id */
export const tourAudio = (id) => `tour/nghinh-phong-${id}.mp3`;

/** @returns {{ id: string, say: string }[]} */
export function tourWords() {
  // The sea sign's words come from the seal (not written out again here), in sentence case to be read aloud.
  const sign = sealText().toLowerCase().replace(/^./, (c) => c.toUpperCase()).replace(/(hoàng sa|trường sa|việt nam)/gi, (w) => w.replace(/(^| )./g, (c) => c.toUpperCase()));
  return [
    { id: 'welcome', say: 'Chào mừng bạn đến với Tháp Nghinh Phong, bên bờ biển Tuy Hòa. Nghinh Phong nghĩa là đón gió.' },
    { id: 'design', say: 'Tháp do HUNI architectes thiết kế, hoàn thành năm 2021. Hai khối tháp, mỗi khối năm mươi cột đá lục giác, lấy cảm hứng từ những cột đá ba dan ở Gành Đá Đĩa và truyền thuyết Lạc Long Quân, Âu Cơ.' },
    { id: 'spires', say: 'Hai tháp cao nhất là Lạc Long Quân, cao 35 mét, và Âu Cơ, cao 30 mét. Mỗi tháp gồm năm mươi cột đá xếp từ thấp lên cao.' },
    { id: 'slot', say: 'Giữa hai tháp là khe đón gió, rộng 2 mét, dài 15 mét. Trên hai vách khe là phù điêu về truyền thuyết Lạc Hồng và quá trình dựng nước, giữ nước của người Việt.' },
    { id: 'square', say: 'Tháp đứng trên quảng trường Nghinh Phong, rộng hơn 7 000 mét vuông, ở đầu đại lộ Nguyễn Hữu Thọ.' },
    { id: 'sea', say: `Ngoài khơi, trên mặt biển, là dòng chữ: ${sign}.` },
    { id: 'night', say: 'Khi trời tối, tháp sáng đèn nhiều màu. Cảm ơn bạn đã ghé thăm, mời bạn tự do khám phá sa bàn.' },
  ];
}
