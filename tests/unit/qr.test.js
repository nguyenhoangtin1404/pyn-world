import { describe, it, expect } from 'vitest'
import jsQR from 'jsqr'
import { qrMatrix, qrSvg, linkable } from '../../src/app/qr.js'
import nghinhphong from '../../src/worlds/nghinhphong.js'

// Draw the QR code's modules as pixels (with its quiet zone) and read it back with a decoder: what a phone scans.
const scan = (text) => {
  const { size, dark } = qrMatrix(text)
  const cell = 4, margin = 4, n = (size + margin * 2) * cell
  const data = new Uint8ClampedArray(n * n * 4).fill(255)
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const r = Math.floor(y / cell) - margin, c = Math.floor(x / cell) - margin
    if (r >= 0 && c >= 0 && r < size && c < size && dark(r, c)) data.fill(0, (y * n + x) * 4, (y * n + x) * 4 + 3)
  }
  return jsQR(data, n, n)?.data
}

describe('qr', () => {
  it('a QR code reads back as the link it was made from', () => {
    expect(scan('https://nguyenhoangtin.com')).toBe('https://nguyenhoangtin.com')
    expect(scan('https://example.com/đường-dẫn?x=1')).toBe('https://example.com/đường-dẫn?x=1')
  })

  it('the SVG is a square with a quiet zone, the label escaped', () => {
    const { size } = qrMatrix('https://nguyenhoangtin.com')
    const svg = qrSvg('https://nguyenhoangtin.com', { label: 'Mã "QR" <a>' })
    expect(svg).toContain(`viewBox="0 0 ${size + 8} ${size + 8}"`)
    expect(svg).toContain('aria-label="Mã &quot;QR&quot; &lt;a&gt;"')
  })

  it('only web addresses are linkable', () => {
    expect(linkable('https://nguyenhoangtin.com')).toBe(true)
    expect(linkable('http://a.vn/x')).toBe(true)
    expect(linkable('javascript:alert(1)')).toBe(false)
    expect(linkable('nguyenhoangtin.com')).toBe(false)
    expect(linkable('')).toBe(false)
  })

  it("NGHINH PHONG's author points at their portfolio, and the code scans to it", () => {
    const host = nghinhphong.features.find((f) => typeof f === 'object' && f.id === 'host')
    expect(host.url).toBe('https://nguyenhoangtin.com')
    expect(scan(host.url)).toBe(host.url)
  })
})
