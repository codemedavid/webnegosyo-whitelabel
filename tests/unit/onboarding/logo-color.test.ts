/**
 * @jest-environment node
 */
import { describe, it, expect } from '@jest/globals'

jest.mock('server-only', () => ({}))

/** Build an RGBA pixel buffer from [r, g, b, a, count] runs. */
function pixels(runs: Array<[number, number, number, number, number]>): Uint8Array {
  const out: number[] = []
  for (const [r, g, b, a, count] of runs) {
    for (let i = 0; i < count; i++) out.push(r, g, b, a)
  }
  return Uint8Array.from(out)
}

async function load() {
  return import('@/lib/onboarding/logo-color')
}

describe('pickBrandColor', () => {
  it('returns the dominant saturated color as #rrggbb', async () => {
    const { pickBrandColor } = await load()
    const result = pickBrandColor(pixels([[220, 40, 40, 255, 300], [30, 90, 200, 255, 50]]), 4)
    expect(result).toMatch(/^#[0-9a-f]{6}$/)
    const r = parseInt(result!.slice(1, 3), 16)
    const b = parseInt(result!.slice(5, 7), 16)
    expect(r).toBeGreaterThan(b)
  })

  it('ignores white backgrounds and black outlines that outnumber the brand color', async () => {
    const { pickBrandColor } = await load()
    const result = pickBrandColor(
      pixels([[255, 255, 255, 255, 2000], [5, 5, 5, 255, 800], [20, 140, 70, 255, 120]]),
      4,
    )
    expect(result).not.toBeNull()
    const g = parseInt(result!.slice(3, 5), 16)
    const r = parseInt(result!.slice(1, 3), 16)
    expect(g).toBeGreaterThan(r)
  })

  it('drops transparent pixels', async () => {
    const { pickBrandColor } = await load()
    const result = pickBrandColor(pixels([[220, 40, 40, 0, 5000], [30, 90, 200, 255, 60]]), 4)
    expect(result).not.toBeNull()
    const b = parseInt(result!.slice(5, 7), 16)
    const r = parseInt(result!.slice(1, 3), 16)
    expect(b).toBeGreaterThan(r)
  })

  it("returns a black-and-white logo's dark ink so the store keeps its monochrome brand", async () => {
    const { pickBrandColor } = await load()
    const result = pickBrandColor(pixels([[255, 255, 255, 255, 3000], [24, 24, 24, 255, 600], [140, 140, 140, 255, 40]]), 4)
    expect(result).toBe('#181818')
  })

  it('returns null for a pale greyscale logo with no dark ink', async () => {
    const { pickBrandColor } = await load()
    expect(pickBrandColor(pixels([[255, 255, 255, 255, 3000], [180, 180, 180, 255, 600]]), 4)).toBeNull()
  })

  it('prefers a real brand color over black ink, even when the ink covers more of the logo', async () => {
    const { pickBrandColor } = await load()
    const result = pickBrandColor(pixels([[255, 255, 255, 255, 2000], [10, 10, 10, 255, 900], [30, 90, 200, 255, 100]]), 4)
    const b = parseInt(result!.slice(5, 7), 16)
    expect(b).toBeGreaterThan(150)
  })

  it('returns null when only a sliver of the logo is colored', async () => {
    const { pickBrandColor } = await load()
    expect(pickBrandColor(pixels([[255, 255, 255, 255, 4000], [220, 40, 40, 255, 3]]), 4)).toBeNull()
  })

  it('reads 3-channel (RGB) pixels', async () => {
    const { pickBrandColor } = await load()
    const rgb = Uint8Array.from(Array.from({ length: 200 }, () => [240, 160, 20]).flat())
    expect(pickBrandColor(rgb, 3)).toMatch(/^#[0-9a-f]{6}$/)
  })

  it('returns null for empty input', async () => {
    const { pickBrandColor } = await load()
    expect(pickBrandColor(new Uint8Array(0), 4)).toBeNull()
  })
})

describe('extractBrandColorFromImage', () => {
  it('reads the brand color out of a real PNG', async () => {
    const sharp = (await import('sharp')).default
    const width = 40
    const height = 40
    const raw = Buffer.alloc(width * height * 4)
    for (let i = 0; i < width * height; i++) {
      const isMark = i % width >= 10 && i % width < 30
      raw.set(isMark ? [200, 30, 60, 255] : [255, 255, 255, 255], i * 4)
    }
    const png = await sharp(raw, { raw: { width, height, channels: 4 } }).png().toBuffer()

    const { extractBrandColorFromImage } = await load()
    const color = await extractBrandColorFromImage(png)
    expect(color).not.toBeNull()
    expect(parseInt(color!.slice(1, 3), 16)).toBeGreaterThan(150)
  })

  it('returns null for bytes that are not an image', async () => {
    const { extractBrandColorFromImage } = await load()
    await expect(extractBrandColorFromImage(Buffer.from('not an image'))).resolves.toBeNull()
  })
})
