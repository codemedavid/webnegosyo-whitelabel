/**
 * SmartMenu landing redesign contract.
 *
 * The redesign applies the "design for the audience" methodology: the page must
 * look like it has actually met a restaurant. These journeys pin the parts of
 * the new identity that are behavior, not taste:
 *
 *  R1 — As a visitor, I want the page branded as SmartMenu (logo, tagline,
 *       WebNegosyo byline), so I know whose product this is.
 *  R2 — As a visitor, I want real restaurant photography on the page — the
 *       telltale sign of a soulless template is no images anywhere.
 *  R3 — As a visitor, I want the headline set in the split serif/sans voice of
 *       a printed menu, so the page feels like the industry it serves.
 *  R4 — As a visitor, I want the feature showcase to rotate on its own and let
 *       me pick a tab, so I see every feature without working for it — and it
 *       must hold still when I prefer reduced motion.
 */
import { act, render, renderHook, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { existsSync } from 'fs'
import { join } from 'path'
import { FeatureJourney } from '@/components/landing/feature-journey'
import { FinalCTASection } from '@/components/landing/final-cta'
import { LandingFooter, LandingNav } from '@/components/landing/landing-chrome'
import { LandingHero } from '@/components/landing/landing-hero'
import { useAutoRotate } from '@/components/landing/use-auto-rotate'
import {
  BRAND,
  JOURNEY_FEATURES,
  LANDING_PHOTOS,
  SMARTMENU,
} from '@/components/landing/landing-theme'

jest.mock('@/components/landing/motion', () => ({
  prefersReducedMotion: jest.fn(() => false),
}))

// eslint-disable-next-line @typescript-eslint/no-require-imports
const motion = require('@/components/landing/motion') as {
  prefersReducedMotion: jest.Mock
}

beforeEach(() => {
  motion.prefersReducedMotion.mockReturnValue(false)
})

describe('R1 — the page is branded as SmartMenu', () => {
  it('names the brand and ties it to WebNegosyo', () => {
    expect(BRAND.name).toBe('SmartMenu')
    expect(BRAND.byline.toLowerCase()).toContain('webnegosyo')
    expect(BRAND.tagline.toLowerCase()).toContain('growing restaurants')
  })

  it('shows the SmartMenu logo in the nav', () => {
    render(<LandingNav />)

    const logo = screen.getAllByRole('img').find((img) => /smartmenu/i.test(img.getAttribute('alt') ?? ''))

    expect(logo).toBeDefined()
    expect(logo?.getAttribute('src')).toContain('landing')
  })

  it('closes the page with the tagline and the WebNegosyo byline', () => {
    const { container } = render(<LandingFooter />)

    expect(container.textContent).toMatch(/growing restaurants/i)
    expect(container.textContent).toMatch(/webnegosyo/i)
  })

  it('draws its palette from the logo: red, amber, cream and ink are distinct hex colors', () => {
    const tokens = [SMARTMENU.red, SMARTMENU.amber, SMARTMENU.cream, SMARTMENU.ink]

    tokens.forEach((token) => {
      expect(token).toMatch(/^#[0-9A-Fa-f]{6}$/)
    })
    expect(new Set(tokens).size).toBe(tokens.length)
  })
})

describe('R2 — real photography is on the page, not just described', () => {
  it('registers every photo with a served path and ships the file', () => {
    const entries = Object.values(LANDING_PHOTOS)

    expect(entries.length).toBeGreaterThanOrEqual(6)
    entries.forEach((photo) => {
      expect(photo.src.startsWith('/landing/photos/')).toBe(true)
      expect(existsSync(join(process.cwd(), 'public', photo.src))).toBe(true)
    })
  })

  it('gives every registered photo descriptive alternative text', () => {
    Object.values(LANDING_PHOTOS).forEach((photo) => {
      expect(photo.alt.trim().length).toBeGreaterThan(0)
    })
  })

  it('opens the hero on a photograph', () => {
    const { container } = render(<LandingHero />)

    const photos = [...container.querySelectorAll('img')].filter((img) =>
      (img.getAttribute('src') ?? '').includes('/landing/photos/')
    )

    expect(photos.length).toBeGreaterThan(0)
  })

  it('closes the final call to action over a photograph', () => {
    const { container } = render(<FinalCTASection />)

    expect(
      [...container.querySelectorAll('img')].some((img) =>
        (img.getAttribute('src') ?? '').includes('/landing/photos/')
      )
    ).toBe(true)
  })
})

describe('R3 — the headline speaks in the printed-menu voice', () => {
  it('mixes a serif accent into the hero heading', () => {
    render(<LandingHero />)

    const heading = screen.getByRole('heading', { level: 1 })

    expect(heading.querySelector('.font-serif')).not.toBeNull()
  })
})

describe('R4 — the feature showcase rotates itself', () => {
  it('advances through every item and wraps around', () => {
    jest.useFakeTimers()
    try {
      const { result } = renderHook(() => useAutoRotate(3, 1000))

      expect(result.current.index).toBe(0)
      act(() => jest.advanceTimersByTime(1000))
      expect(result.current.index).toBe(1)
      act(() => jest.advanceTimersByTime(2000))
      expect(result.current.index).toBe(0)
    } finally {
      jest.useRealTimers()
    }
  })

  it('lets a manual selection take over and restarts the clock from there', () => {
    jest.useFakeTimers()
    try {
      const { result } = renderHook(() => useAutoRotate(3, 1000))

      act(() => result.current.select(2))
      expect(result.current.index).toBe(2)
      act(() => jest.advanceTimersByTime(999))
      expect(result.current.index).toBe(2)
      act(() => jest.advanceTimersByTime(1))
      expect(result.current.index).toBe(0)
    } finally {
      jest.useRealTimers()
    }
  })

  it('holds still for visitors who prefer reduced motion', () => {
    motion.prefersReducedMotion.mockReturnValue(true)
    jest.useFakeTimers()
    try {
      const { result } = renderHook(() => useAutoRotate(3, 1000))

      act(() => jest.advanceTimersByTime(5000))
      expect(result.current.index).toBe(0)
    } finally {
      jest.useRealTimers()
    }
  })

  it('exposes the showcase as tabs and honors a click', async () => {
    const user = userEvent.setup()
    render(<FeatureJourney />)

    const tabs = screen.getAllByRole('tab')

    expect(tabs).toHaveLength(JOURNEY_FEATURES.length)

    await user.click(tabs[1])

    expect(tabs[1]).toHaveAttribute('aria-selected', 'true')
  })
})
