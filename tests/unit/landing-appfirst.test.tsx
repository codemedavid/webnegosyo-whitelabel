/**
 * App-first, two-deliverable copy contract.
 *
 * User journeys under test:
 *  A1 — As a buyer, I want the offer framed as the two things I actually get
 *       (the SmartMenu ordering website and the merchant App), so the bundle
 *       of tools reads as a product, not a feature dump.
 *  A2 — As the business, we no longer push Messenger as a feature — orders
 *       live in the app now. Messenger must not appear anywhere the page is
 *       selling (capabilities, pricing inclusions, capability ribbon).
 *  A3 — As a visitor, the "what am I buying" FAQ must name both deliverables.
 */
import { render, screen } from '@testing-library/react'
import { CapabilitiesSection } from '@/components/landing/capabilities-section'
import {
  CAPABILITIES,
  DELIVERABLES,
  FAQ_ITEMS,
  PRICING_FEATURES,
  SPONSOR_STRIP,
} from '@/components/landing/landing-theme'

describe('A1 — the offer is two deliverables: the SmartMenu and the App', () => {
  it('defines exactly two deliverables', () => {
    expect(DELIVERABLES).toHaveLength(2)
  })

  it('names the SmartMenu ordering website first and the app second', () => {
    expect(DELIVERABLES[0].title.toLowerCase()).toContain('smartmenu')
    expect(DELIVERABLES[1].title.toLowerCase()).toContain('app')
  })

  it('gives every capability a home in one of the two deliverables', () => {
    const grouped = DELIVERABLES.flatMap((deliverable) => deliverable.capabilities)

    expect(grouped).toHaveLength(CAPABILITIES.length)
    CAPABILITIES.forEach((capability) => {
      expect(grouped).toContainEqual(capability)
    })
  })

  it('renders both deliverable headings with their capabilities', () => {
    render(<CapabilitiesSection />)

    DELIVERABLES.forEach((deliverable) => {
      expect(screen.getByText(deliverable.title)).toBeInTheDocument()
      deliverable.capabilities.forEach((capability) => {
        expect(screen.getByText(capability.title)).toBeInTheDocument()
      })
    })
  })
})

describe('A2 — Messenger is no longer sold as a feature', () => {
  it('keeps Messenger out of the capability cards', () => {
    CAPABILITIES.forEach((capability) => {
      expect(`${capability.title} ${capability.body}`).not.toMatch(/messenger/i)
    })
  })

  it('keeps Messenger out of the pricing inclusions', () => {
    PRICING_FEATURES.forEach((feature) => {
      expect(feature).not.toMatch(/messenger/i)
    })
  })

  it('keeps Messenger out of the capability ribbon', () => {
    SPONSOR_STRIP.forEach((entry) => {
      expect(entry).not.toMatch(/messenger/i)
    })
  })

  it('sells the app as where orders land instead', () => {
    const corpus = CAPABILITIES.map((capability) => `${capability.title} ${capability.body}`)
      .join(' ')
      .toLowerCase()

    expect(corpus).toContain('app')
    expect(corpus).toContain('notification')
  })
})

describe('A3 — the FAQ names both deliverables', () => {
  it('answers "ano ba talaga ang binibili ko" with the SmartMenu and the app', () => {
    const purchaseFaq = FAQ_ITEMS.find((item) => item.q.toLowerCase().includes('binibili'))

    expect(purchaseFaq).toBeDefined()
    expect(purchaseFaq?.a.toLowerCase()).toContain('smartmenu')
    expect(purchaseFaq?.a.toLowerCase()).toContain('app')
  })
})
