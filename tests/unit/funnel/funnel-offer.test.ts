/**
 * /funnel offer contract (Hormozi stack + Brunson sales page → order form).
 *
 *  F1 — The price on the page is the price the order form charges.
 *  F2 — The value stack adds up and the waived setup is the real ₱3,499 fee.
 *  F3 — Every call to action leads to the on-page order form.
 *  F4 — No copy still quotes the retired ₱649/₱3,899 offer as a charge.
 *  F5 — The copy is Taglish: English concepts, Tagalog transitions.
 *  F6 — The page sells growth; commission never leads.
 */
import { describe, it, expect } from '@jest/globals'
import { MONTHLY_SUBSCRIPTION_PRICE } from '@/lib/checkout-leads/payment-terms'
import {
  FUNNEL_CTA_HREF,
  FUNNEL_ORDER_ANCHOR,
  FUNNEL_PRICE,
  SETUP_FEE_WAIVED,
  VALUE_STACK,
  stackTotalValue,
} from '@/components/funnel/funnel-offer'
import * as copy from '@/components/funnel/funnel-copy'

describe('F1 — page price matches the order form', () => {
  it('sells the plan at the monthly subscription price', () => {
    expect(FUNNEL_PRICE).toBe(MONTHLY_SUBSCRIPTION_PRICE)
  })
})

describe('F2 — the value stack', () => {
  it('totals every item', () => {
    const sum = VALUE_STACK.reduce((total, item) => total + item.value, 0)
    expect(stackTotalValue()).toBe(sum)
  })

  it('is worth many times the monthly price', () => {
    expect(stackTotalValue()).toBeGreaterThan(FUNNEL_PRICE * 10)
  })

  it('waives the real ₱3,499 setup fee as a bonus', () => {
    expect(SETUP_FEE_WAIVED).toBe(3499)
    expect(VALUE_STACK.some((item) => item.isBonus && item.value === SETUP_FEE_WAIVED)).toBe(true)
  })
})

describe('F3 — every CTA leads to the order form', () => {
  it('points the shared CTA at the order section anchor', () => {
    expect(FUNNEL_CTA_HREF).toBe(`#${FUNNEL_ORDER_ANCHOR}`)
  })
})

describe('F4 — no retired pricing in the copy', () => {
  it('never quotes ₱649 or ₱3,899', () => {
    const corpus = JSON.stringify(copy)
    expect(corpus).not.toMatch(/649/)
    expect(corpus).not.toMatch(/3,?899/)
  })
})

const corpus = JSON.stringify({ copy, VALUE_STACK })

describe('F5 — the page speaks Taglish', () => {
  it('carries Tagalog connectors through the copy', () => {
    const connectors = ['kasi', 'pero', 'lang', "'yung", 'kami', 'tapos', 'diba']
    const used = connectors.filter((word) => corpus.toLowerCase().includes(word))
    expect(used.length).toBeGreaterThanOrEqual(5)
  })

  it('keeps the core concepts in English', () => {
    for (const concept of ['repeat', 'bigger orders', 'automatic upsells', 'regulars', 'done-for-you setup']) {
      expect(corpus.toLowerCase()).toContain(concept)
    }
  })
})

describe('F6 — growth leads, commission supports', () => {
  it('keeps commission out of the hook, the leaks and the big idea', () => {
    const lead = JSON.stringify([
      copy.HERO.title,
      copy.HERO.callout,
      copy.PROBLEM.title,
      copy.PROBLEM.leaks.map((leak) => leak.title),
      copy.BIG_DOMINO,
      copy.STACK.anchorTitle,
      copy.STACK.anchorBody,
      copy.CLOSE.stay,
      copy.CLOSE.switch,
    ])
    expect(lead).not.toMatch(/commission/i)
  })

  it('every price token was filled in', () => {
    expect(corpus).not.toMatch(/\{(PRICE|SETUP|DAILY|TOTAL)\}/)
  })
})
