/**
 * Landing page section coverage — the narrative sections that carry the offer.
 *
 * User journeys under test:
 *  J5 — As a visitor, I want the page to name the problems I actually have,
 *       so I recognise myself before being sold to.
 *  J6 — As a visitor, I want to see what each upsell feature looks like,
 *       so "automatic upsells" is concrete instead of abstract.
 *  J7 — As a visitor anywhere on the page, I want a persistent way to buy and
 *       a footer that reaches policy pages, so I am never stranded.
 *  J8 — As a skeptical buyer, I want proof (numbers, demo, testimonials),
 *       so the claims are backed by something.
 */
import { render, screen } from '@testing-library/react'
import { FeatureJourney } from '@/components/landing/feature-journey'
import { FeatureMock } from '@/components/landing/feature-mockups'
import { FinalCTASection } from '@/components/landing/final-cta'
import { FeatureMarquee, LandingFooter, LandingNav } from '@/components/landing/landing-chrome'
import { ProblemSection } from '@/components/landing/problem-section'
import { SocialProofSection, StatsBand } from '@/components/landing/social-proof'
import {
  CHECKOUT_URL,
  JOURNEY_FEATURES,
  MARQUEE_ITEMS,
  NAV_LINKS,
  PROBLEMS,
  STATS,
} from '@/components/landing/landing-theme'

describe('J5 — the page names the reader problem', () => {
  it('renders every problem with its explanation', () => {
    render(<ProblemSection />)

    PROBLEMS.forEach((problem) => {
      expect(screen.getByText(problem.title)).toBeInTheDocument()
      expect(screen.getByText(problem.body)).toBeInTheDocument()
    })
  })

  it('resolves the problems into the product promise', () => {
    render(<ProblemSection />)

    expect(screen.getByText(/ang smart menu ang sumasagot sa tatlo/i)).toBeInTheDocument()
  })
})

describe('J6 — upsell features are shown, not just described', () => {
  it('renders each feature with its label, headline and every selling point', () => {
    render(<FeatureJourney />)

    JOURNEY_FEATURES.forEach((feature) => {
      expect(screen.getByText(feature.eyebrow)).toBeInTheDocument()
      expect(screen.getByText(feature.title)).toBeInTheDocument()
      feature.points.forEach((point) => {
        expect(screen.getByText(point)).toBeInTheDocument()
      })
    })
  })

  it.each(JOURNEY_FEATURES.map((feature) => feature.mock))(
    'renders a UI preview for the "%s" feature',
    (variant) => {
      const { container } = render(<FeatureMock variant={variant} />)

      expect(container.firstChild).not.toBeNull()
      expect(container.textContent?.trim().length ?? 0).toBeGreaterThan(0)
    }
  )

  it('shows the price difference on the meal upgrade preview', () => {
    render(<FeatureMock variant="upgrade" />)

    expect(screen.getByText('Ala Carte')).toBeInTheDocument()
    expect(screen.getByText('Meal')).toBeInTheDocument()
  })

  it('shows the savings on the bundle preview', () => {
    render(<FeatureMock variant="bundle" />)

    expect(screen.getByText(/save ₱/i)).toBeInTheDocument()
  })

  it('hides decorative previews from assistive tech', () => {
    const { container } = render(<FeatureMock variant="pairing" />)

    expect(container.firstElementChild).toHaveAttribute('aria-hidden')
  })
})

describe('J7 — the visitor can always buy or reach policy pages', () => {
  it('renders every nav link in the header', () => {
    render(<LandingNav />)

    NAV_LINKS.forEach((link) => {
      expect(screen.getByRole('link', { name: link.label })).toHaveAttribute('href', link.href)
    })
  })

  it('keeps a checkout call to action in the header', () => {
    render(<LandingNav />)

    const checkoutLinks = screen
      .getAllByRole('link')
      .filter((link) => link.getAttribute('href') === CHECKOUT_URL)

    expect(checkoutLinks.length).toBeGreaterThan(0)
  })

  it('links the footer to the privacy and support pages', () => {
    render(<LandingFooter />)

    expect(screen.getByRole('link', { name: /privacy/i })).toHaveAttribute('href', '/privacy')
    expect(screen.getByRole('link', { name: /support/i })).toHaveAttribute('href', '/support')
  })

  it('sends the final call to action to checkout', () => {
    render(<FinalCTASection />)

    const buyLink = screen.getByRole('link', { name: /get smart menu/i })

    expect(buyLink).toHaveAttribute('href', CHECKOUT_URL)
  })

  it('scrolls the secondary final call to action to the FAQ', () => {
    render(<FinalCTASection />)

    expect(screen.getByRole('link', { name: /may tanong/i })).toHaveAttribute('href', '#faq')
  })

  it('renders the capability marquee', () => {
    render(<FeatureMarquee />)

    // Each item is duplicated so the marquee can loop seamlessly.
    expect(screen.getAllByText(MARQUEE_ITEMS[0]).length).toBeGreaterThanOrEqual(2)
  })
})

describe('J8 — proof is on the page', () => {
  it('renders every headline stat with its label', () => {
    render(<StatsBand />)

    STATS.forEach((stat) => {
      expect(screen.getByText(stat.value)).toBeInTheDocument()
      expect(screen.getByText(stat.label)).toBeInTheDocument()
    })
  })

  it('embeds the product demo video', () => {
    const { container } = render(<SocialProofSection />)

    const demo = container.querySelector('iframe')

    expect(demo).not.toBeNull()
    expect(demo?.getAttribute('title')).toMatch(/demo/i)
  })

  it('keeps the testimonial results disclaimer', () => {
    render(<SocialProofSection />)

    expect(screen.getByText(/may not be typical/i)).toBeInTheDocument()
  })

  it('gives every proof image alternative text', () => {
    const { container } = render(<SocialProofSection />)

    container.querySelectorAll('img').forEach((image) => {
      expect(image.getAttribute('alt')?.trim().length ?? 0).toBeGreaterThan(0)
    })
  })
})
