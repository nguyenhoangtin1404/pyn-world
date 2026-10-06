// The English page's head (en/index.html, made by plugin.js from index.html): the same facts as the Vietnamese
// one — only those CLAUDE.md lists as verified ("Nội dung thuyết minh") — translated. %SITE_URL% is filled in
// like index.html's. Change a fact here, in index.html's JSON-LD, the About text (src/app/i18n.js) and llms.txt
// together.
export const EN_HEAD = `<!-- seo:start (English) -->
    <title>Nghinh Phong Tower, Tuy Hòa, in 3D – an interactive low-poly diorama | PYN World</title>
    <meta name="description" content="Explore Nghinh Phong Tower (Tuy Hòa, Viet Nam – formerly Phú Yên, now Đắk Lắk province) as an interactive low-poly 3D diorama right in your browser: the sea, the beach, streets, visitors, day and night. Built from real map data." />
    <meta name="theme-color" content="#1b2a3a" />
    <link rel="canonical" href="%SITE_URL%en/" />
    <link rel="alternate" hreflang="vi" href="%SITE_URL%" />
    <link rel="alternate" hreflang="en" href="%SITE_URL%en/" />
    <link rel="alternate" hreflang="x-default" href="%SITE_URL%" />
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="PYN World" />
    <meta property="og:locale" content="en_US" />
    <meta property="og:locale:alternate" content="vi_VN" />
    <meta property="og:title" content="Nghinh Phong Tower, Tuy Hòa, in 3D – PYN World" />
    <meta property="og:description" content="An interactive low-poly 3D diorama around Nghinh Phong Tower, Tuy Hòa, Viet Nam, built from real map data." />
    <meta property="og:url" content="%SITE_URL%en/" />
    <meta property="og:image" content="%SITE_URL%og.png" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="Nghinh Phong Tower, Tuy Hòa, in 3D – PYN World" />
    <meta name="twitter:description" content="An interactive low-poly 3D diorama around Nghinh Phong Tower, Tuy Hòa, Viet Nam." />
    <meta name="twitter:image" content="%SITE_URL%og.png" />
    <script type="application/ld+json">
    {
      "@context": "https://schema.org",
      "@graph": [
        { "@type": "WebSite", "@id": "%SITE_URL%#site", "url": "%SITE_URL%", "name": "PYN World", "inLanguage": ["vi", "en"] },
        { "@type": "WebApplication", "@id": "%SITE_URL%en/#app", "name": "PYN World – Nghinh Phong Tower 3D", "url": "%SITE_URL%en/",
          "applicationCategory": "EntertainmentApplication", "operatingSystem": "Web browser (WebGL)", "inLanguage": "en",
          "description": "An interactive low-poly 3D diorama around Nghinh Phong Tower, Tuy Hòa, Viet Nam, built from real map data.",
          "offers": { "@type": "Offer", "price": "0", "priceCurrency": "VND" },
          "about": { "@id": "%SITE_URL%#tower" } },
        { "@type": "TouristAttraction", "@id": "%SITE_URL%#tower", "name": "Nghinh Phong Tower",
          "alternateName": "Tháp Nghinh Phong",
          "address": { "@type": "PostalAddress", "addressLocality": "Tuy Hòa ward", "addressRegion": "Đắk Lắk", "addressCountry": "VN" },
          "description": "A seafront landmark in Tuy Hòa designed by HUNI architectes and completed in 2021: two towers, each of 50 hexagonal stone columns, with spires 35 m (Lạc Long Quân) and 30 m (Âu Cơ) high, on a square of more than 7,000 m².",
          "url": "%SITE_URL%", "image": "%SITE_URL%og.png",
          "geo": { "@type": "GeoCoordinates", "latitude": 13.1163, "longitude": 109.3076 } },
        { "@type": "FAQPage", "mainEntity": [
          { "@type": "Question", "name": "Where is Nghinh Phong Tower?", "acceptedAnswer": { "@type": "Answer", "text": "Nghinh Phong Tower is on the seafront of Tuy Hòa ward, Đắk Lắk province (formerly Tuy Hòa city, Phú Yên province), Viet Nam (about 13.1163 N, 109.3076 E)." } },
          { "@type": "Question", "name": "Who designed Nghinh Phong Tower?", "acceptedAnswer": { "@type": "Answer", "text": "It was designed by HUNI architectes (completed in 2021): two towers, each of 50 hexagonal stone columns, inspired by the basalt columns of Gành Đá Đĩa." } },
          { "@type": "Question", "name": "Is PYN World free?", "acceptedAnswer": { "@type": "Answer", "text": "Yes. PYN World runs right in the browser, with nothing to install and no account." } }
        ] }
      ]
    }
    </script>
    <!-- seo:end -->`
