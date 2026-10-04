// @ts-check
import qrcode from 'qrcode-generator';

// QR codes made in the page (qrcode-generator, MIT): nothing is sent to a QR service, so it works offline and
// no one learns who looked. Medium error correction (~15 %: a scuffed print or a logo dot still scans).

/** The QR code of `text`: its size in modules and which are dark. @param {string} text */
export function qrMatrix(text) {
  const qr = qrcode(0, 'M'); // (0: the smallest version that fits)
  // As UTF-8 bytes (the library's own 'Byte' mode takes one byte per character: a link with Vietnamese in it
  // would scan as something else), handed over one byte per character.
  qr.addData(String.fromCharCode(...new TextEncoder().encode(text)), 'Byte');
  qr.make();
  const size = qr.getModuleCount();
  return { size, dark: (/** @type {number} */ row, /** @type {number} */ col) => qr.isDark(row, col) };
}

/**
 * The QR code of `text` as an SVG: dark modules as one path on a white square with a quiet zone of `margin`
 * modules (4, as the standard asks), drawn crisp at any size (shape-rendering).
 * @param {string} text @param {{ margin?: number, label?: string }} [options]
 */
export function qrSvg(text, { margin = 4, label = text } = {}) {
  const { size, dark } = qrMatrix(text);
  const n = size + margin * 2;
  let d = '';
  for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) if (dark(r, c)) d += `M${c + margin} ${r + margin}h1v1h-1z`;
  const esc = label.replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch] ?? ch);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n} ${n}" role="img" aria-label="${esc}" shape-rendering="crispEdges"><rect width="${n}" height="${n}" fill="#fff"/><path d="${d}" fill="#111"/></svg>`;
}

/** Is `url` a web address a QR code and a link may point to (http or https, with a host)? @param {string} url */
export function linkable(url) {
  try {
    const u = new URL(url);
    return (u.protocol === 'https:' || u.protocol === 'http:') && !!u.hostname;
  } catch {
    return false;
  }
}
