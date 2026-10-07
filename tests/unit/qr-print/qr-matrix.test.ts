import { describe, it, expect } from '@jest/globals'
import { buildQrMatrix, logoHoleSize } from '@/lib/qr-print/qr-matrix'

describe('buildQrMatrix', () => {
  it('builds a square grid with the three finder patterns dark at their corners', () => {
    const matrix = buildQrMatrix('https://cafe.webnegosyo.com/menu?table=12', { hasLogo: true })
    expect(matrix).not.toBeNull()
    const { size, dark } = matrix!
    expect(dark).toHaveLength(size)
    expect(dark.every((row) => row.length === size)).toBe(true)
    expect(dark[0][0]).toBe(true)
    expect(dark[0][size - 1]).toBe(true)
    expect(dark[size - 1][0]).toBe(true)
  })

  it('uses a larger code with a logo, because the logo needs the highest error correction', () => {
    const url = 'https://cafe.webnegosyo.com/menu?table=12&outlet=north'
    const withLogo = buildQrMatrix(url, { hasLogo: true })!
    const plain = buildQrMatrix(url, { hasLogo: false })!
    expect(withLogo.size).toBeGreaterThan(plain.size)
    expect(withLogo.errorCorrection).toBe('H')
    expect(plain.errorCorrection).toBe('M')
  })

  it('returns null when the text cannot fit any QR version', () => {
    expect(buildQrMatrix('x'.repeat(5000), { hasLogo: true })).toBeNull()
  })
})

describe('logoHoleSize', () => {
  it('is odd so the hole sits exactly on the centre module', () => {
    for (const size of [21, 25, 29, 33, 41, 57]) {
      expect(logoHoleSize(size) % 2).toBe(1)
    }
  })

  it('never covers more than 8% of the code, well inside what level H recovers', () => {
    for (const size of [21, 25, 29, 33, 41, 57, 77]) {
      const hole = logoHoleSize(size)
      expect((hole * hole) / (size * size)).toBeLessThanOrEqual(0.08)
    }
  })
})
