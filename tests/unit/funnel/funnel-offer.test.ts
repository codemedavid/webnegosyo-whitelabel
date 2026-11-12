/**
 * /funnel offer contract.
 *
 *  F1 — Every price on the page is the price the order form charges.
 *  F2 — The six-month plan is the better deal, and the page says by how much:
 *       pay in full = 6 + 1 free month; or ₱999 a month for six months.
 *  F3 — Every call to action leads to the on-page plans and order form.
 *  F4 — No copy still quotes a retired price (₱649, ₱3,899, the ₱2,000 down).
 *  F5 — The copy is Taglish and names every tool the owner listed.
 *  F6 — The countdown runs to one fixed date and then stops; it never restarts.
 *  F7 — Both guarantees are on the page: live in 48 hours, first order in 30 days.
 */
import { describe, it, expect } from '@jest/globals'
import {
  MONTHLY_SUBSCRIPTION_PRICE,
  SIX_MONTH_FULL_MONTHS,
  SIX_MONTH_INSTALLMENT_PRICE,
  SIX_MONTH_PLAN_PRICE,
} from '@/lib/checkout-leads/payment-terms'
import {
  BONUSES,
  BONUS_MONTH_VALUE,
  FEATURE_GROUPS,
  FULL_PLAN_MONTHS,
  FULL_PLAN_PER_MONTH,
  FULL_PLAN_SAVINGS,
  FUNNEL_CTA_HREF,
  FUNNEL_ORDER_ANCHOR,
  INSTALLMENT_BALANCE,
  INSTALLMENT_PRICE,
  INSTALLMENT_SAVINGS,
  INSTALLMENT_TOTAL,
  MONTHLY_PRICE,
  SETUP_FEE_WAIVED,
  SIX_MONTH_DEAL_ENDS_MS,
  SIX_MONTH_PRICE,
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
    expect(INSTALLMENT_PRICE).toBe(SIX_MONTH_INSTALLMENT_PRICE)
    expect(FULL_PLAN_MONTHS).toBe(SIX_MONTH_FULL_MONTHS)
  })

  it('files the term the visitor picked', () => {
    expect(termForPlan('six_month', 'full')).toBe('six_month_full')
    expect(termForPlan('six_month', 'installment')).toBe('six_month_installment')
    expect(termForPlan('monthly', 'full')).toBe('monthly_subscription')
    expect(termForPlan('monthly', 'installment')).toBe('monthly_subscription')
    expect(dueTodayFor('six_month_installment')).toBe(999)
  })
})

describe('F2 — six months is the better deal', () => {
  it('paid in full: 7 months for ₱5,499, saving ₱4,994 against 7 monthly payments, about ₱786 a month', () => {
    expect(FULL_PLAN_MONTHS).toBe(7)
    expect(FULL_PLAN_SAVINGS).toBe(1499 * 7 - 5499)
    expect(FULL_PLAN_SAVINGS).toBe(4994)
    expect(FULL_PLAN_PER_MONTH).toBe(786)
    expect(BONUS_MONTH_VALUE).toBe(MONTHLY_PRICE)
  })

  it('installments: ₱999 a month, ₱5,994 in all, ₱3,000 less than six monthly payments', () => {
    expect(INSTALLMENT_TOTAL).toBe(5994)
    expect(INSTALLMENT_BALANCE).toBe(4995)
    expect(INSTALLMENT_SAVINGS).toBe(3000)
  })

  it('keeps the free setup and the free month to the six-month plan', () => {
    const setup = BONUSES.find((bonus) => bonus.value === SETUP_FEE_WAIVED)
    expect(setup?.isSixMonthOnly).toBe(true)
    const freeMonth = BONUSES.find((bonus) => bonus.value === BONUS_MONTH_VALUE)
    expect(freeMonth?.isSixMonthOnly).toBe(true)
  })

  it('shows both ways to pay, the savings and the per-month prices', () => {
    for (const amount of ['₱5,499', '₱999', '₱786', '₱4,994', '₱1,499', '₱4,995']) {
      expect(corpus).toContain(amount)
    }
    expect(corpus).toMatch(/6 \+ 1|\+1 month/i)
  })
})

describe('F3 — every CTA leads to the order section', () => {
  it('points the shared CTA at the order section anchor', () => {
    expect(FUNNEL_CTA_HREF).toBe(`#${FUNNEL_ORDER_ANCHOR}`)
  })
})

describe('F4 — no retired pricing in the copy', () => {
  it('never quotes ₱649, ₱3,899, the ₱2,000 downpayment or the old ₱917 a month', () => {
    expect(corpus).not.toMatch(/649/)
    expect(corpus).not.toMatch(/3,?899/)
    expect(corpus).not.toMatch(/₱2,000/)
    expect(corpus).not.toMatch(/₱917/)
    expect(corpus.toLowerCase()).not.toContain('downpayment')
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
  it('runs to the end of 18 Nov 2026, Manila time', () => {
    expect(new Date(SIX_MONTH_DEAL_ENDS_MS).toISOString()).toBe('2026-11-18T15:59:59.000Z')
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

describe('F7 — guarantees', () => {
  it('promises live in 48 hours and a first online order within 30 days', () => {
    const titles = copy.GUARANTEES.map((guarantee) => guarantee.title)
    expect(titles).toHaveLength(2)
    expect(titles.join(' ')).toMatch(/48 hours/i)
    expect(titles.join(' ')).toMatch(/30 days/i)
  })
})
