/**
 * Menu card images are `fill` images on ImageKit. They used to be requested
 * as a single `unoptimized` URL sized for the LARGEST `sizes` branch (w-792
 * PNG), so a phone downloaded a tablet-sized PNG. A real srcset with ImageKit
 * width variants, `f-auto`, and a mobile-first default `src` fixes that.
 */
import { render, screen } from '@testing-library/react'
import { OptimizedImage } from '@/components/shared/optimized-image'

const IK_URL = 'https://ik.imagekit.io/acme/menu/burger.png'
const CARD_SIZES = '(max-width: 768px) 50vw, (max-width: 1200px) 33vw, 25vw'

function img(): HTMLImageElement {
  return screen.getByRole('img') as HTMLImageElement
}

function widthsIn(srcset: string): number[] {
  return Array.from(srcset.matchAll(/tr=w-(\d+)/g)).map((m) => Number(m[1]))
}

describe('OptimizedImage — responsive ImageKit fill images', () => {
  it('emits an ImageKit srcset with several width variants and keeps the given sizes', () => {
    render(<OptimizedImage src={IK_URL} alt="Burger" fill sizes={CARD_SIZES} />)

    const srcset = img().getAttribute('srcset') || ''
    const widths = widthsIn(srcset)
    expect(widths.length).toBeGreaterThanOrEqual(3)
    expect(Math.max(...widths)).toBeLessThanOrEqual(2000)
    expect(widths.some((w) => w <= 640)).toBe(true)
    expect(img().getAttribute('sizes')).toBe(CARD_SIZES)
  })

  it('requests automatic format negotiation so PNGs arrive as WebP/AVIF', () => {
    render(<OptimizedImage src={IK_URL} alt="Burger" fill sizes={CARD_SIZES} />)

    expect(img().getAttribute('srcset')).toContain('f-auto')
    expect(img().getAttribute('src')).toContain('f-auto')
  })

  it('uses a phone-sized variant as the default src, not the largest branch', () => {
    render(<OptimizedImage src={IK_URL} alt="Burger" fill sizes={CARD_SIZES} />)

    const [srcWidth] = widthsIn(img().getAttribute('src') || '')
    expect(srcWidth).toBeLessThanOrEqual(640)
  })

  it('forwards fetchPriority to the rendered img', () => {
    render(<OptimizedImage src={IK_URL} alt="Burger" fill sizes={CARD_SIZES} fetchPriority="high" loading="eager" />)

    expect(img().getAttribute('fetchpriority')).toBe('high')
    expect(img().getAttribute('loading')).toBe('eager')
  })
})
