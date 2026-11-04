/**
 * /funnel offer contract.
 *
 *  F1 — Every price on the page is the price the order form charges.
 *  F2 — The six-month plan is the better deal, and the page says by how much.
 *  F3 — Every call to action leads to the on-page plans and order form.
 *  F4 — No copy still quotes a retired price (₱999, ₱649, ₱3,899).
 *  F5 — The copy is Taglish and names every tool the owner listed.
 *  F6 — The countdown runs to one fixed date and then stops; it never restarts.
 */
import { describe, it, expect } from '@jest/globals'
import {
  MONTHLY_SUBSCRIPTION_PRICE,
  SIX_MONTH_DOWNPAYMENT,
  SIX_MONTH_PLAN_PRICE,
} from '@/lib/checkout-leads/payment-terms'
import {
  BONUSES,
  FEATURE_GROUPS,
  FUNNEL_CTA_HREF,
  FUNNEL_ORDER_ANCHOR,
  MONTHLY_PRICE,
  SETUP_FEE_WAIVED,
  SIX_MONTH_BALANCE,
  SIX_MONTH_DEAL_ENDS_MS,
  SIX_MONTH_DOWN,
  SIX_MONTH_PER_MONTH,
  SIX_MONTH_PRICE,
  SIX_MONTH_SAVINGS,
  countdownParts,
  dueTodayFor,
  termForPlan,
} from '@/components/funnel/funnel-offer'
import * as copy from '@/components/funnel/funnel-copy'

const corpus = JSON.stringify({ copy, FEATURE_GROUPS, BONUSES })

describe('F1 — page prices match the order form', () => {
  it('quotes the plan prices the checkout terms charge', () => {
    expect(MONTHLY_PRICE).toBe(MONTHLY_SUBSCRIPTION_PRICE)
    expect(SIX_MONTH_PRICE).toBe(SIX_MONTH_PLAN_PRICE)
    expect(SIX_MONTH_DOWN).toBe(SIX_MONTH_DOWNPAYMENT)
  })

  it('files the term the visitor picked', () => {
    expect(termForPlan('six_month', 'full')).toBe('six_month_full')
    expect(termForPlan('six_month', 'downpayment')).toBe('six_month_downpayment')
    expect(termForPlan('monthly', 'full')).toBe('monthly_subscription')
    expect(termForPlan('monthly', 'downpayment')).toBe('monthly_subscription')
    expect(dueTodayFor('six_month_downpayment')).toBe(2000)
  })
})

describe('F2 — six months is the better deal', () => {
  it('saves ₱3,495 against six monthly payments, about ₱917 a month', () => {
    expect(SIX_MONTH_SAVINGS).toBe(3495)
    expect(SIX_MONTH_PER_MONTH).toBe(917)
    expect(SIX_MONTH_BALANCE).toBe(3499)
  })

  it('keeps the free setup bonus to the six-month plan', () => {
    const setup = BONUSES.find((bonus) => bonus.value === SETUP_FEE_WAIVED)
    expect(setup?.isSixMonthOnly).toBe(true)
  })

  it('shows the savings, the per-month price and the downpayment', () => {
    expect(corpus).toContain('₱3,495')
    expect(corpus).toContain('₱917')
    expect(corpus).toContain('₱2,000')
    expect(corpus).toContain('₱5,499')
    expect(corpus).toContain('₱1,499')
  })
})

describe('F3 — every CTA leads to the order section', () => {
  it('points the shared CTA at the order section anchor', () => {
    expect(FUNNEL_CTA_HREF).toBe(`#${FUNNEL_ORDER_ANCHOR}`)
  })
})

describe('F4 — no retired pricing in the copy', () => {
  it('never quotes ₱999, ₱649 or ₱3,899', () => {
    expect(corpus).not.toMatch(/₱999\b/)
    expect(corpus).not.toMatch(/649/)
    expect(corpus).not.toMatch(/3,?899/)
  })
})

describe('F5 — Taglish, and every tool the owner listed', () => {
  it('carries Tagalog connectors through the copy', () => {
    const connectors = ['kasi', 'pero', 'lang', 'kami', 'tapos', 'para', 'mo']
    const used = connectors.filter((word) => corpus.toLowerCase().includes(word))
    expect(used.length).toBeGreaterThanOrEqual(5)
  })

  it('names every tool', () => {
    const names = [
      'SmartMenu Ordering',
      'Dine-in',
      'pick-up',
      'delivery',
      'Lalamove',
      'POS',
      'Inventory',
      'Expense Tracker',
      'Loyalty Programs',
      'Customer Growth',
      'SMS Marketing',
      'Unlimited Products',
      'Unlimited Payment Methods',
      'Sales Revenue Analytics',
      'Upsells & Bundles',
      'SmartMenu University',
    ]
    for (const name of names) expect(corpus).toContain(name)
  })
})

describe('F6 — the countdown', () => {
  it('runs to the end of 11 Nov 2026, Manila time', () => {
    expect(new Date(SIX_MONTH_DEAL_ENDS_MS).toISOString()).toBe('2026-11-11T15:59:59.000Z')
  })

  it('splits what is left into days, hours, minutes and seconds', () => {
    const now = SIX_MONTH_DEAL_ENDS_MS - ((2 * 24 + 3) * 3600 + 4 * 60 + 5) * 1000
    expect(countdownParts(SIX_MONTH_DEAL_ENDS_MS, now)).toEqual({ days: 2, hours: 3, minutes: 4, seconds: 5 })
  })

  it('stops once the deadline passes instead of restarting', () => {
    expect(countdownParts(SIX_MONTH_DEAL_ENDS_MS, SIX_MONTH_DEAL_ENDS_MS)).toBeNull()
    expect(countdownParts(SIX_MONTH_DEAL_ENDS_MS, SIX_MONTH_DEAL_ENDS_MS + 1)).toBeNull()
    expect(countdownParts(Number.NaN, 0)).toBeNull()
  })
})
