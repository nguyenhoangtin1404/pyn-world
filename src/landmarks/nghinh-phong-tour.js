// @ts-check
import { sealText } from '../world/seal.js';

// What the narrated tour of Tháp Nghinh Phong says, stop by stop (the camera shots are in
// nghinh-phong.js). Kept apart so that tools/tour/voice.mjs can record the same words as MP3
// (public/tour/nghinh-phong-<id>.mp3), which the tour plays where they exist. Facts only from what several
// independent sources agree on (see CLAUDE.md, "Nội dung thuyết minh"); change them here, and in the SEO text, together.

/** The audio file for a stop, under the site's base. @param {string} id */
export const tourAudio = (id) => `tour/nghinh-phong-${id}.mp3`;

/**
 * The words in Vietnamese (recorded, and the default), or in English, Korean, Chinese or Russian for visitors from
 * abroad (subtitles and the browser's voice for that language; the same facts, translated — nothing added). The sea
 * sign itself stays in Vietnamese, and so do the names Hoàng Sa and Trường Sa.
 * @param {import('../app/i18n.js').Lang} [lang]
 * @returns {{ id: string, say: string }[]}
 */
export function tourWords(lang = 'vi') {
  // The sea sign's words come from the seal (not written out again here), in sentence case to be read aloud.
  const sign = sealText().toLowerCase().replace(/^./, (c) => c.toUpperCase()).replace(/(hoàng sa|trường sa|việt nam)/gi, (w) => w.replace(/(^| )./g, (c) => c.toUpperCase()));
  if (lang === 'ko') {
    return [
      { id: 'welcome', say: '뚜이호아 해안에 있는 응인퐁 타워에 오신 것을 환영합니다. 응인퐁은 “바람을 맞이한다”는 뜻입니다.' },
      { id: 'design', say: '이 타워는 HUNI architectes가 설계해 2021년에 완공되었습니다. 두 개의 탑은 각각 육각형 석주 쉰 개로 이루어져 있으며, Gành Đá Đĩa의 현무암 기둥과 Lạc Long Quân과 Âu Cơ의 전설에서 영감을 얻었습니다.' },
      { id: 'spires', say: '가장 높은 두 첨탑은 높이 35미터의 Lạc Long Quân과 높이 30미터의 Âu Cơ입니다. 각 탑은 낮은 곳에서 높은 곳으로 이어지는 쉰 개의 석주로 이루어져 있습니다.' },
      { id: 'slot', say: '두 탑 사이에는 너비 2미터, 길이 15미터의 바람길이 있습니다. 그 양쪽 벽에는 Lạc Hồng의 전설과 베트남 사람들이 나라를 세우고 지켜 온 역사를 새긴 부조가 있습니다.' },
      { id: 'square', say: '타워는 Nguyễn Hữu Thọ 대로의 시작 지점에 있는 7,000제곱미터가 넘는 응인퐁 광장 위에 서 있습니다.' },
      { id: 'sea', say: `바다 위, 물 위에는 이런 글귀가 있습니다: “${sign}” — Hoàng Sa와 Trường Sa는 베트남에 속합니다.` },
      { id: 'night', say: '해가 지면 타워는 여러 가지 색으로 빛납니다. 방문해 주셔서 감사합니다. 마음껏 디오라마를 둘러보세요.' },
    ];
  }
  if (lang === 'zh') {
    return [
      { id: 'welcome', say: '欢迎来到绥和海滨的迎风塔。“迎风”的意思就是迎接风。' },
      { id: 'design', say: '这座塔由 HUNI architectes 设计，2021 年落成。两座塔体，每座由五十根六边形石柱组成，灵感来自Gành Đá Đĩa的玄武岩石柱，以及Lạc Long Quân 与 Âu Cơ的传说。' },
      { id: 'spires', say: '最高的两座塔尖是 Lạc Long Quân，高 35 米，和 Âu Cơ，高 30 米。每座塔都由五十根石柱由低到高排列而成。' },
      { id: 'slot', say: '两座塔之间是迎风缝，宽 2 米，长 15 米。缝隙两侧的墙壁上有浮雕，讲述Lạc Hồng 的传说，以及越南人民建国和守国的历程。' },
      { id: 'square', say: '塔矗立在迎风广场上，广场面积超过 7,000 平方米，位于Nguyễn Hữu Thọ 大道的起点。' },
      { id: 'sea', say: `远处海面上有这样一行字：“${sign}” — Hoàng Sa 和 Trường Sa 属于越南。` },
      { id: 'night', say: '夜幕降临后，塔会亮起多彩的灯光。感谢您的参观，欢迎自由探索这个沙盘。' },
    ];
  }
  if (lang === 'ru') {
    return [
      { id: 'welcome', say: 'Добро пожаловать к башне Нгиньфонг на набережной Туихоа. «Нгиньфонг» означает «встречать ветер».' },
      { id: 'design', say: 'Башню спроектировало бюро HUNI architectes, и в 2021 году она была завершена. Два башенных блока, каждый из пятидесяти шестигранных каменных колонн, вдохновлены базальтовыми колоннами Gành Đá Đĩa и легендой о Lạc Long Quân и Âu Cơ.' },
      { id: 'spires', say: 'Два самых высоких шпиля — Lạc Long Quân высотой 35 метров и Âu Cơ высотой 30 метров. Каждая башня состоит из пятидесяти каменных колонн, поднимающихся от низких к высоким.' },
      { id: 'slot', say: 'Между двумя башнями находится щель для ветра шириной 2 метра и длиной 15 метров. На её стенах — барельефы с легендой о Lạc Hồng и с историей того, как вьетнамский народ создавал и защищал свою страну.' },
      { id: 'square', say: 'Башня стоит на площади Нгиньфонг площадью более 7 000 квадратных метров, в начале проспекта Nguyễn Hữu Thọ.' },
      { id: 'sea', say: `Далеко в море, на воде, написано: «${sign}» — Hoàng Sa и Trường Sa принадлежат Вьетнаму.` },
      { id: 'night', say: 'С наступлением темноты башня загорается разноцветными огнями. Спасибо за визит; исследуйте диораму свободно.' },
    ];
  }
  if (lang === 'en') {
    return [
      { id: 'welcome', say: 'Welcome to Nghinh Phong Tower, on the seafront of Tuy Hòa. Nghinh Phong means “welcoming the wind”.' },
      { id: 'design', say: 'The tower was designed by HUNI architectes and completed in 2021. Two tower blocks, each of fifty hexagonal stone columns, inspired by the basalt columns of Gành Đá Đĩa and by the legend of Lạc Long Quân and Âu Cơ.' },
      { id: 'spires', say: 'The two tallest spires are Lạc Long Quân, 35 metres high, and Âu Cơ, 30 metres high. Each tower is made of fifty stone columns rising from low to high.' },
      { id: 'slot', say: 'Between the two towers is the wind slot, 2 metres wide and 15 metres long. On its two walls are reliefs of the Lạc Hồng legend and of how the Vietnamese people built and defended their country.' },
      { id: 'square', say: 'The tower stands on Nghinh Phong Square, more than 7,000 square metres, at the head of Nguyễn Hữu Thọ Avenue.' },
      { id: 'sea', say: `Out at sea, on the water, are the words: “${sign}” — Hoàng Sa and Trường Sa belong to Viet Nam.` },
      { id: 'night', say: 'After dark, the tower lights up in many colours. Thank you for visiting; feel free to explore the diorama.' },
    ];
  }
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
