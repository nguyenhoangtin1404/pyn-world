// The head of the translated pages (en/index.html, ko/…, zh/…, ru/…, made by plugin.js from index.html): the same
// facts as the Vietnamese one — only those CLAUDE.md lists as verified ("Nội dung thuyết minh") — translated.
// %SITE_URL% is filled in like index.html's. Change a fact here, in index.html's JSON-LD, the About text
// (src/app/i18n.js, src/app/lang/*.js) and llms.txt together.

/** The pages besides the Vietnamese one: path, hreflang, Open Graph locale. */
export const PAGES = {
  en: { hreflang: 'en', locale: 'en_US' },
  ko: { hreflang: 'ko', locale: 'ko_KR' },
  zh: { hreflang: 'zh-Hans', locale: 'zh_CN' },
  ru: { hreflang: 'ru', locale: 'ru_RU' },
}

const COPY = {
  en: {
    title: 'Nghinh Phong Tower, Tuy Hòa, in 3D – an interactive low-poly diorama | PYN World',
    description: 'Explore Nghinh Phong Tower (Tuy Hòa, Viet Nam – formerly Phú Yên, now Đắk Lắk province) as an interactive low-poly 3D diorama right in your browser: the sea, the beach, streets, visitors, day and night. Built from real map data.',
    ogTitle: 'Nghinh Phong Tower, Tuy Hòa, in 3D – PYN World',
    ogDescription: 'An interactive low-poly 3D diorama around Nghinh Phong Tower, Tuy Hòa, Viet Nam, built from real map data.',
    twDescription: 'An interactive low-poly 3D diorama around Nghinh Phong Tower, Tuy Hòa, Viet Nam.',
    appName: 'PYN World – Nghinh Phong Tower 3D',
    appDescription: 'An interactive low-poly 3D diorama around Nghinh Phong Tower, Tuy Hòa, Viet Nam, built from real map data.',
    towerName: 'Nghinh Phong Tower',
    locality: 'Tuy Hòa ward',
    towerDescription: 'A seafront landmark in Tuy Hòa designed by HUNI architectes and completed in 2021: two towers, each of 50 hexagonal stone columns, with spires 35 m (Lạc Long Quân) and 30 m (Âu Cơ) high, on a square of more than 7,000 m².',
    faq: [
      ['Where is Nghinh Phong Tower?', 'Nghinh Phong Tower is on the seafront of Tuy Hòa ward, Đắk Lắk province (formerly Tuy Hòa city, Phú Yên province), Viet Nam (about 13.1163 N, 109.3076 E).'],
      ['Who designed Nghinh Phong Tower?', 'It was designed by HUNI architectes (completed in 2021): two towers, each of 50 hexagonal stone columns, inspired by the basalt columns of Gành Đá Đĩa.'],
      ['Is PYN World free?', 'Yes. PYN World runs right in the browser, with nothing to install and no account.'],
    ],
  },
  ko: {
    title: '3D로 보는 뚜이호아 응인퐁 타워(Nghinh Phong) – 인터랙티브 로우폴리 디오라마 | PYN World',
    description: '베트남 뚜이호아(구 푸옌성, 현 닥락성)의 응인퐁 타워(Tháp Nghinh Phong)를 브라우저에서 바로 즐기는 인터랙티브 로우폴리 3D 디오라마로 탐험해 보세요: 바다, 해변, 거리, 방문객, 낮과 밤. 실제 지도 데이터로 만들었습니다.',
    ogTitle: '3D로 보는 뚜이호아 응인퐁 타워 – PYN World',
    ogDescription: '실제 지도 데이터로 만든, 베트남 뚜이호아 응인퐁 타워 일대의 인터랙티브 로우폴리 3D 디오라마.',
    twDescription: '베트남 뚜이호아 응인퐁 타워 일대의 인터랙티브 로우폴리 3D 디오라마.',
    appName: 'PYN World – 응인퐁 타워 3D',
    appDescription: '실제 지도 데이터로 만든, 베트남 뚜이호아 응인퐁 타워 일대의 인터랙티브 로우폴리 3D 디오라마.',
    towerName: '응인퐁 타워',
    locality: '뚜이호아 동',
    towerDescription: 'HUNI architectes가 설계해 2021년에 완공된 뚜이호아 해안의 명소: 각각 육각형 석주 50개로 이루어진 두 개의 탑, 첨탑 높이 35 m(Lạc Long Quân)와 30 m(Âu Cơ), 7,000 m²가 넘는 광장.',
    faq: [
      ['응인퐁 타워는 어디에 있나요?', '응인퐁 타워는 베트남 닥락성(구 푸옌성 뚜이호아시) 뚜이호아 동의 해안에 있습니다(약 북위 13.1163°, 동경 109.3076°).'],
      ['응인퐁 타워는 누가 설계했나요?', 'HUNI architectes가 설계했으며(2021년 완공), 각각 육각형 석주 50개로 이루어진 두 개의 탑으로 Gành Đá Đĩa의 현무암 기둥에서 영감을 얻었습니다.'],
      ['PYN World는 무료인가요?', '네. PYN World는 브라우저에서 바로 실행되며 설치도 계정도 필요 없습니다.'],
    ],
  },
  zh: {
    title: '3D 绥和迎风塔（Nghinh Phong）– 交互式低多边形沙盘 | PYN World',
    description: '在浏览器中直接探索越南绥和（原富安省，现多乐省）的迎风塔（Tháp Nghinh Phong）：交互式低多边形 3D 沙盘，有大海、海滩、街道、游客和昼夜交替。以真实地图数据构建。',
    ogTitle: '3D 绥和迎风塔 – PYN World',
    ogDescription: '以真实地图数据构建的越南绥和迎风塔一带的交互式低多边形 3D 沙盘。',
    twDescription: '越南绥和迎风塔一带的交互式低多边形 3D 沙盘。',
    appName: 'PYN World – 迎风塔 3D',
    appDescription: '以真实地图数据构建的越南绥和迎风塔一带的交互式低多边形 3D 沙盘。',
    towerName: '迎风塔',
    locality: '绥和坊',
    towerDescription: '位于绥和海滨的地标，由 HUNI architectes 设计，2021 年落成：两座塔，每座由 50 根六边形石柱组成，塔尖分别高 35 米（Lạc Long Quân）和 30 米（Âu Cơ），广场面积超过 7,000 平方米。',
    faq: [
      ['迎风塔在哪里？', '迎风塔位于越南多乐省绥和坊（原富安省绥和市）的海滨（约北纬 13.1163°，东经 109.3076°）。'],
      ['迎风塔是谁设计的？', '由 HUNI architectes 设计（2021 年落成）：两座塔，每座由 50 根六边形石柱组成，灵感来自 Gành Đá Đĩa 的玄武岩石柱。'],
      ['PYN World 免费吗？', '免费。PYN World 直接在浏览器中运行，无需安装，也无需账号。'],
    ],
  },
  ru: {
    title: 'Башня Нгиньфонг (Nghinh Phong) в Туихоа в 3D – интерактивная low-poly диорама | PYN World',
    description: 'Исследуйте башню Нгиньфонг (Tháp Nghinh Phong) в Туихоа, Вьетнам (бывш. провинция Футьен, ныне Даклак), прямо в браузере — как интерактивную low-poly 3D-диораму: море, пляж, улицы, посетители, день и ночь. Построена по реальным картографическим данным.',
    ogTitle: 'Башня Нгиньфонг в Туихоа в 3D – PYN World',
    ogDescription: 'Интерактивная low-poly 3D-диорама района башни Нгиньфонг в Туихоа, Вьетнам, по реальным картографическим данным.',
    twDescription: 'Интерактивная low-poly 3D-диорама района башни Нгиньфонг в Туихоа, Вьетнам.',
    appName: 'PYN World – Башня Нгиньфонг в 3D',
    appDescription: 'Интерактивная low-poly 3D-диорама района башни Нгиньфонг в Туихоа, Вьетнам, по реальным картографическим данным.',
    towerName: 'Башня Нгиньфонг',
    locality: 'район Туихоа',
    towerDescription: 'Достопримечательность на набережной Туихоа, спроектированная бюро HUNI architectes и завершённая в 2021 году: две башни, каждая из 50 шестигранных каменных колонн, со шпилями высотой 35 м (Lạc Long Quân) и 30 м (Âu Cơ), на площади более 7 000 м².',
    faq: [
      ['Где находится башня Нгиньфонг?', 'Башня Нгиньфонг стоит на набережной района Туихоа в провинции Даклак (бывш. город Туихоа, провинция Футьен), Вьетнам (около 13,1163° с. ш., 109,3076° в. д.).'],
      ['Кто спроектировал башню Нгиньфонг?', 'Её спроектировало бюро HUNI architectes (завершена в 2021 году): две башни, каждая из 50 шестигранных каменных колонн, вдохновлённые базальтовыми колоннами Gành Đá Đĩa.'],
      ['PYN World бесплатный?', 'Да. PYN World работает прямо в браузере, ничего устанавливать и регистрироваться не нужно.'],
    ],
  },
}

const attr = (s) => s.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;')

/** The SEO head (between <!-- seo:start --> and <!-- seo:end -->) of the page in `lang` (en, ko, zh, ru). */
export function seoHead(lang) {
  const c = COPY[lang]
  const { locale } = PAGES[lang]
  const faq = c.faq.map(([name, text]) => ({ '@type': 'Question', name, acceptedAnswer: { '@type': 'Answer', text } }))
  const ld = {
    '@context': 'https://schema.org',
    '@graph': [
      { '@type': 'WebSite', '@id': '%SITE_URL%#site', url: '%SITE_URL%', name: 'PYN World', inLanguage: ['vi', ...Object.values(PAGES).map((p) => p.hreflang)] },
      { '@type': 'WebApplication', '@id': `%SITE_URL%${lang}/#app`, name: c.appName, url: `%SITE_URL%${lang}/`,
        applicationCategory: 'EntertainmentApplication', operatingSystem: 'Web browser (WebGL)', inLanguage: PAGES[lang].hreflang,
        description: c.appDescription,
        offers: { '@type': 'Offer', price: '0', priceCurrency: 'VND' },
        about: { '@id': '%SITE_URL%#tower' } },
      { '@type': 'TouristAttraction', '@id': '%SITE_URL%#tower', name: c.towerName, alternateName: 'Tháp Nghinh Phong',
        address: { '@type': 'PostalAddress', addressLocality: c.locality, addressRegion: 'Đắk Lắk', addressCountry: 'VN' },
        description: c.towerDescription, url: '%SITE_URL%', image: '%SITE_URL%og.png',
        geo: { '@type': 'GeoCoordinates', latitude: 13.1163, longitude: 109.3076 } },
      { '@type': 'FAQPage', mainEntity: faq },
    ],
  }
  const alternates = [['vi', '%SITE_URL%'], ...Object.entries(PAGES).map(([l, p]) => [p.hreflang, `%SITE_URL%${l}/`]), ['x-default', '%SITE_URL%']]
  return `<!-- seo:start (${lang}) -->
    <title>${attr(c.title)}</title>
    <meta name="description" content="${attr(c.description)}" />
    <meta name="theme-color" content="#1b2a3a" />
    <link rel="canonical" href="%SITE_URL%${lang}/" />
${alternates.map(([h, href]) => `    <link rel="alternate" hreflang="${h}" href="${href}" />`).join('\n')}
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="PYN World" />
    <meta property="og:locale" content="${locale}" />
    <meta property="og:locale:alternate" content="vi_VN" />
    <meta property="og:title" content="${attr(c.ogTitle)}" />
    <meta property="og:description" content="${attr(c.ogDescription)}" />
    <meta property="og:url" content="%SITE_URL%${lang}/" />
    <meta property="og:image" content="%SITE_URL%og.png" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${attr(c.ogTitle)}" />
    <meta name="twitter:description" content="${attr(c.twDescription)}" />
    <meta name="twitter:image" content="%SITE_URL%og.png" />
    <script type="application/ld+json">
    ${JSON.stringify(ld, null, 2).replaceAll('\n', '\n    ')}
    </script>
    <!-- seo:end -->`
}
