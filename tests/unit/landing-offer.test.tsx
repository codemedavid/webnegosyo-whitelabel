/**
 * Landing offer contract — the ₱3,499 setup + ₱649/month pricing and the
 * "4 Mores" promise band.
 *
 *  O1 — As a buyer, I want the real price structure (one-time setup + monthly)
 *       stated plainly wherever price appears, so nothing feels hidden.
 *  O2 — As a buyer, no copy may still claim the retired "no monthly fee"
 *       offer anywhere in the page's content constants.
 *  O3 — As a visitor, I want the four ways SmartMenu helps (the 4 Mores)
 *       presented between the problems and the capability wall, so the
 *       page answers its own diagnosis before listing features.
 *  O4 — As a visitor, I want the expanded toolset (SMS marketing, POS,
 *       inventory, analytics + AI) in the what-you-get wall.
 */
import { render, screen } from '@testing-library/react'
import { LandingPage } from '@/components/landing/landing-page'
import { FourMoresSection } from '@/components/landing/four-mores'
import { PricingSection } from '@/components/landing/pricing-faq'
import {
  CAPABILITIES,
  EXCLUSIONS,
  FAQ_ITEMS,
  FOUR_MORES,
  HERO_TRUST_POINTS,
  MONTHLY_PRICE_LABEL,
  PRICE_LABEL,
  PRICING_FEATURES,
  STATS,
} from '@/components/landing/landing-theme'

describe('O1 — the price structure is the new setup + monthly offer', () => {
  it('prices setup at ₱3,499 and the subscription at ₱649', () => {
    expect(PRICE_LABEL).toBe('₱3,499')
    expect(MONTHLY_PRICE_LABEL).toBe('₱649')
  })

  it('shows both figures on the pricing card', () => {
    const { container } = render(<PricingSection />)

    expect(container.textContent).toContain(PRICE_LABEL)
    expect(container.textContent).toContain(MONTHLY_PRICE_LABEL)
    expect(container.textContent?.toLowerCase()).toMatch(/buwan|month/)
  })
})

describe('O2 — no copy still claims the retired no-monthly-fee offer', () => {
  it('keeps the stale claim out of every content constant', () => {
    const corpus = JSON.stringify({
      HERO_TRUST_POINTS,
      STATS,
      EXCLUSIONS,
      PRICING_FEATURES,
      FAQ_ITEMS,
    }).toLowerCase()

    expect(corpus).not.toContain('walang monthly')
    expect(corpus).not.toContain('no monthly')
    expect(corpus).not.toContain('monthly fees, forever')
    expect(corpus).not.toContain('₱3,899')
  })

  it('answers the monthly-fee FAQ with the actual subscription price', () => {
    const monthlyFaq = FAQ_ITEMS.find((item) => item.q.toLowerCase().includes('monthly'))

    expect(monthlyFaq).toBeDefined()
    expect(monthlyFaq?.a).toContain(MONTHLY_PRICE_LABEL)
  })
})

describe('O3 — the 4 Mores answer the problems before the feature wall', () => {
  it('names all four Mores', () => {
    expect(FOUR_MORES).toHaveLength(4)
    const titles = FOUR_MORES.map((more) => more.title)

    expect(titles).toEqual([
      'More Better Ordering Experience',
      'More Bigger Orders',
      'More Customer Retention',
      'More Confident Decision Making',
    ])
    FOUR_MORES.forEach((more) => {
      expect(more.body.trim().length).toBeGreaterThan(0)
    })
  })

  it('renders every More with its explanation', () => {
    render(<FourMoresSection />)

    // The serif "More" accent splits the heading across elements, so match
    // the heading's full accessible text instead of a single text node.
    const headings = screen
      .getAllByRole('heading', { level: 3 })
      .map((heading) => heading.textContent?.replace(/\s+/g, ' ').trim())

    FOUR_MORES.forEach((more) => {
      expect(headings).toContain(more.title)
      expect(screen.getByText(more.body)).toBeInTheDocument()
    })
  })

  it('sits between the problem section and the capability wall', () => {
    const { container } = render(<LandingPage />)

    const sections = [...container.querySelectorAll('section')]
    const positionOf = (id: string) => {
      const element = container.querySelector(`#${id}`)
      if (element === null) throw new Error(`missing section: #${id}`)
      return sections.indexOf(element as HTMLElement)
    }

    expect(positionOf('problem')).toBeLessThan(positionOf('mores'))
    expect(positionOf('mores')).toBeLessThan(positionOf('what-you-get'))
  })
})

describe('O4 — the expanded toolset is in the capability wall', () => {
  it.each(['sms', 'pos', 'inventory', 'analytics'])(
    'lists a capability covering "%s"',
    (topic) => {
      const corpus = CAPABILITIES.map((c) => `${c.title} ${c.body}`.toLowerCase())

      expect(corpus.some((text) => text.includes(topic))).toBe(true)
    }
  )
})
