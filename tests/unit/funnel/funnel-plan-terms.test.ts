/**
 * The /funnel sells two plans through the same checkout_leads pipeline the
 * ₱3,899 one-time checkout uses: ₱1,499 monthly, or the six-month plan —
 * ₱5,499 paid in full (six months + one free = seven), or ₱999 a month for
 * six months. A lead's amount is computed server-side from its payment term,
 * so every plan term must resolve to what is due TODAY. The ₱2,000-down term
 * is no longer sold but stays valid for the leads that already hold it.
 */
import { describe, it, expect } from '@jest/globals'
import {
  CHECKOUT_BASE_PRICE,
  CHECKOUT_PAYMENT_TERMS,
  MONTHLY_SUBSCRIPTION_PRICE,
  SIX_MONTH_BONUS_MONTHS,
  SIX_MONTH_DOWNPAYMENT,
  SIX_MONTH_FULL_MONTHS,
  SIX_MONTH_INSTALLMENT_PRICE,
  SIX_MONTH_PLAN_MONTHS,
  SIX_MONTH_PLAN_PRICE,
  getCheckoutBalanceDue,
  getCheckoutPayableAmount,
  isCheckoutPaymentTerm,
  isFunnelPlanTerm,
} from '@/lib/checkout-leads/payment-terms'
import { getPaymentTermLabel } from '@/lib/checkout-leads/payment-term-labels'

describe('monthly plan', () => {
  it('charges the first month at ₱1,499, not the one-time setup price', () => {
    expect(MONTHLY_SUBSCRIPTION_PRICE).toBe(1499)
    expect(getCheckoutPayableAmount('monthly_subscription')).toBe(1499)
    expect(getCheckoutBalanceDue('monthly_subscription')).toBe(0)
  })
})

describe('six-month plan', () => {
  it('is ₱5,499 for six months', () => {
    expect(SIX_MONTH_PLAN_PRICE).toBe(5499)
  })

  it('charges the whole plan when paid in full, and adds one free month', () => {
    expect(isCheckoutPaymentTerm('six_month_full')).toBe(true)
    expect(getCheckoutPayableAmount('six_month_full')).toBe(5499)
    expect(getCheckoutBalanceDue('six_month_full')).toBe(0)
    expect(SIX_MONTH_BONUS_MONTHS).toBe(1)
    expect(SIX_MONTH_FULL_MONTHS).toBe(SIX_MONTH_PLAN_MONTHS + 1)
  })

  it('charges ₱999 today on the monthly installment and owes five more', () => {
    expect(isCheckoutPaymentTerm('six_month_installment')).toBe(true)
    expect(SIX_MONTH_INSTALLMENT_PRICE).toBe(999)
    expect(getCheckoutPayableAmount('six_month_installment')).toBe(999)
    expect(getCheckoutBalanceDue('six_month_installment')).toBe(999 * 5)
  })

  it('makes paying in full cheaper than the installments, and both cheaper than monthly', () => {
    const installmentTotal = SIX_MONTH_INSTALLMENT_PRICE * SIX_MONTH_PLAN_MONTHS
    expect(SIX_MONTH_PLAN_PRICE).toBeLessThan(installmentTotal)
    expect(installmentTotal).toBeLessThan(MONTHLY_SUBSCRIPTION_PRICE * SIX_MONTH_PLAN_MONTHS)
  })

  it('charges ₱2,000 today and leaves the rest as a balance', () => {
    expect(isCheckoutPaymentTerm('six_month_downpayment')).toBe(true)
    expect(SIX_MONTH_DOWNPAYMENT).toBe(2000)
    expect(getCheckoutPayableAmount('six_month_downpayment')).toBe(2000)
    expect(getCheckoutBalanceDue('six_month_downpayment')).toBe(3499)
    expect(getCheckoutPayableAmount('six_month_downpayment') + getCheckoutBalanceDue('six_month_downpayment')).toBe(
      SIX_MONTH_PLAN_PRICE
    )
  })

  it('costs less than six monthly payments', () => {
    expect(SIX_MONTH_PLAN_PRICE).toBeLessThan(MONTHLY_SUBSCRIPTION_PRICE * 6)
  })
})

describe('funnel plan terms', () => {
  it('are the monthly and every six-month term, never the one-time checkout', () => {
    expect(isFunnelPlanTerm('monthly_subscription')).toBe(true)
    expect(isFunnelPlanTerm('six_month_full')).toBe(true)
    expect(isFunnelPlanTerm('six_month_downpayment')).toBe(true)
    expect(isFunnelPlanTerm('six_month_installment')).toBe(true)
    expect(isFunnelPlanTerm('full_payment')).toBe(false)
    expect(isFunnelPlanTerm('downpayment_50')).toBe(false)
    expect(isFunnelPlanTerm(null)).toBe(false)
  })

  it('leaves the one-time terms unchanged', () => {
    expect(getCheckoutPayableAmount('full_payment')).toBe(CHECKOUT_BASE_PRICE)
    expect(getCheckoutPayableAmount('downpayment_50')).toBe(Math.round(CHECKOUT_BASE_PRICE / 2))
  })
})

describe('plan labels', () => {
  it('names each plan without quoting a price that older leads did not pay', () => {
    expect(getPaymentTermLabel('monthly_subscription')).toBe('Monthly plan')
    expect(getPaymentTermLabel('six_month_full')).toBe('6-month plan + 1 free month (paid in full)')
    expect(getPaymentTermLabel('six_month_installment')).toBe('6-month plan (₱999/month × 6)')
    expect(getPaymentTermLabel('six_month_downpayment')).toBe('6-month plan (₱2,000 down, ₱3,499 balance)')
  })
})

describe('database CHECK constraints', () => {
  // The newest migration that defines each constraint is the one the database runs.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const fs = require('fs') as typeof import('fs')
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const path = require('path') as typeof import('path')
  const dir = path.join(process.cwd(), 'supabase/migrations')

  function newestTermsFor(constraint: string): string[] {
    const files = fs.readdirSync(dir).filter((file) => file.endsWith('.sql')).sort()
    const sql = files
      .map((file) => fs.readFileSync(path.join(dir, file), 'utf8'))
      .filter((body) => body.includes(`ADD CONSTRAINT ${constraint}`))
      .pop()
    const check = sql?.split(`ADD CONSTRAINT ${constraint}`)[1]?.split(';')[0] ?? ''
    return [...check.matchAll(/'([a-z0-9_]+)'/g)].map((match) => match[1]).sort()
  }

  it.each(['checkout_leads_payment_term_check', 'onboarding_invites_payment_term_check'])(
    '%s accepts exactly the terms the code sells',
    (constraint) => {
      expect(newestTermsFor(constraint)).toEqual([...CHECKOUT_PAYMENT_TERMS].sort())
    }
  )
})
