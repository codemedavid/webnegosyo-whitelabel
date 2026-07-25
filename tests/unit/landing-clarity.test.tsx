/**
 * Landing page clarity contract.
 *
 * User journeys under test:
 *  J1 — As a food business owner landing on the page, I want to know in one
 *       sentence what the product is, so I do not have to guess.
 *  J2 — As a visitor who is not ready to buy, I want a way to jump straight to
 *       what is included, so I can evaluate before paying.
 *  J3 — As a visitor using the nav, I want every nav link to land on a real
 *       section, so navigation never silently breaks.
 *  J4 — As a buyer, I want the full list of what I get and what it costs, so I
 *       can tell exactly what the one-time price covers.
 */
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CapabilitiesSection } from '@/components/landing/capabilities-section'
import { FAQSection, PricingSection } from '@/components/landing/pricing-faq'
import { HowItWorksSection } from '@/components/landing/how-it-works'
import { LandingHero } from '@/components/landing/landing-hero'
import {
  CAPABILITIES,
  CHECKOUT_URL,
  FAQ_ITEMS,
  NAV_LINKS,
  PRICE_LABEL,
  PRICING_FEATURES,
  PRODUCT_ONE_LINER,
  STEPS,
} from '@/components/landing/landing-theme'

/** Sections that own the anchor targets the nav links to. */
function renderAnchorSections() {
  return render(
    <>
      <CapabilitiesSection />
      <HowItWorksSection />
      <PricingSection />
      <FAQSection />
    </>
  )
}

describe('J1 — the hero says what the product is', () => {
  it('renders the plain-language product one-liner', () => {
    render(<LandingHero />)

    expect(screen.getByText(PRODUCT_ONE_LINER)).toBeInTheDocument()
  })

  it('describes the product as an ordering website, not just a menu', () => {
    expect(PRODUCT_ONE_LINER.toLowerCase()).toContain('ordering website')
  })
})

describe('J2 — the hero gives both a buy path and an evaluate path', () => {
  it('links the primary call to action to checkout', () => {
    render(<LandingHero />)

    const buyLink = screen.getByRole('link', { name: new RegExp(PRICE_LABEL) })

    expect(buyLink).toHaveAttribute('href', CHECKOUT_URL)
  })

  it('offers a secondary call to action that jumps to what is included', () => {
    render(<LandingHero />)

    const evaluateLink = screen.getByRole('link', { name: /ano ang kasama/i })

    expect(evaluateLink).toHaveAttribute('href', '#what-you-get')
  })
})

describe('J3 — every nav link lands on a real section', () => {
  it('renders a section element for each nav anchor', () => {
    const { container } = renderAnchorSections()

    const missing = NAV_LINKS.filter((link) => container.querySelector(link.href) === null).map(
      (link) => link.href
    )

    expect(missing).toEqual([])
  })

  it('offsets each anchor target so the fixed nav does not cover the heading', () => {
    const { container } = renderAnchorSections()

    const unoffset = NAV_LINKS.filter((link) => {
      const target = container.querySelector(link.href)
      return target === null || !target.className.includes('scroll-mt-')
    }).map((link) => link.href)

    expect(unoffset).toEqual([])
  })
})

describe('J4 — the offer is spelled out in full', () => {
  it('renders every capability with a title and a description', () => {
    render(<CapabilitiesSection />)

    CAPABILITIES.forEach((capability) => {
      expect(screen.getByText(capability.title)).toBeInTheDocument()
      expect(screen.getByText(capability.body)).toBeInTheDocument()
    })
  })

  it('renders every setup step', () => {
    render(<HowItWorksSection />)

    STEPS.forEach((step) => {
      expect(screen.getByText(step.title)).toBeInTheDocument()
    })
  })

  it('lists every pricing inclusion alongside the price', () => {
    const { container } = render(<PricingSection />)

    PRICING_FEATURES.forEach((feature) => {
      expect(screen.getByText(feature)).toBeInTheDocument()
    })
    expect(container.textContent).toContain(PRICE_LABEL)
  })

  it('answers what the buyer is actually purchasing in the FAQ', () => {
    render(<FAQSection />)

    const questions = FAQ_ITEMS.map((item) => item.q.toLowerCase())

    expect(questions.some((q) => q.includes('binibili'))).toBe(true)
  })
})

describe('content invariants', () => {
  it('has no blank capability copy', () => {
    CAPABILITIES.forEach((capability) => {
      expect(capability.title.trim().length).toBeGreaterThan(0)
      expect(capability.body.trim().length).toBeGreaterThan(0)
    })
  })

  it('has unique capability titles so no card reads as a duplicate', () => {
    const titles = CAPABILITIES.map((capability) => capability.title)

    expect(new Set(titles).size).toBe(titles.length)
  })

  it('uses in-page anchors for every nav link', () => {
    NAV_LINKS.forEach((link) => {
      expect(link.href.startsWith('#')).toBe(true)
    })
  })

  it('pairs every FAQ question with an answer', () => {
    FAQ_ITEMS.forEach((item) => {
      expect(item.q.trim().length).toBeGreaterThan(0)
      expect(item.a.trim().length).toBeGreaterThan(0)
    })
  })
})

describe('accessibility of the FAQ disclosure', () => {
  it('exposes collapsed state to assistive tech', () => {
    render(<FAQSection />)

    const firstQuestion = screen.getByRole('button', { name: new RegExp(FAQ_ITEMS[0].q, 'i') })

    expect(firstQuestion).toHaveAttribute('aria-expanded', 'false')
  })

  it('reveals the answer and updates state when opened', async () => {
    const user = userEvent.setup()
    render(<FAQSection />)

    const firstQuestion = screen.getByRole('button', { name: new RegExp(FAQ_ITEMS[0].q, 'i') })
    await user.click(firstQuestion)

    expect(firstQuestion).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText(FAQ_ITEMS[0].a)).toBeInTheDocument()
  })
})
