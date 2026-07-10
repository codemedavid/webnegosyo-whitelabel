import { render } from '@testing-library/react'
import { HeroRenderer } from '@/components/customer/hero-renderer'
import type { HeroDesign } from '@/types/hero-designer'

/**
 * Regression: a persisted `hero_design` object can be a legacy/partial shape
 * that lacks a `canvas` (or a `canvas.desktop`). Such a design reaches
 * HeroRenderer straight from storefront-hero.tsx without migration, and used
 * to crash CanvasView at `design.canvas[breakpoint]` / `design.canvas.desktop`.
 *
 * The renderer must degrade gracefully instead of throwing.
 */
describe('HeroRenderer canvas resilience', () => {
  it('does not throw when the design has no canvas at all', () => {
    // Arrange: legacy/corrupt design missing `canvas`.
    const design = {
      version: 3,
      backgroundColor: '#ffffff',
      elements: [],
    } as unknown as HeroDesign

    // Act + Assert
    expect(() => render(<HeroRenderer design={design} />)).not.toThrow()
  })

  it('does not throw when canvas is missing the desktop breakpoint', () => {
    const design = {
      version: 3,
      canvas: { mobile: { width: 390, height: 500 } },
      backgroundColor: '#ffffff',
      elements: [],
    } as unknown as HeroDesign

    expect(() => render(<HeroRenderer design={design} />)).not.toThrow()
  })

  it('renders normally for a well-formed design', () => {
    const design: HeroDesign = {
      version: 3,
      canvas: {
        desktop: { width: 1440, height: 600 },
        tablet: { width: 768, height: 500 },
        mobile: { width: 390, height: 500 },
      },
      backgroundColor: '#ffffff',
      layoutMode: 'boxed',
      elements: [],
    }

    expect(() => render(<HeroRenderer design={design} />)).not.toThrow()
  })
})
