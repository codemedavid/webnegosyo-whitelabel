import { buildSubscriptionRoster } from '@/lib/billing/subscription-roster'
import {
  buildCollectionsInsights,
  summarizeCollections,
  type TenantActivitySnapshot,
} from '@/lib/billing/collections-insight'
import type { TenantPaymentSummary } from '@/lib/billing/payment-history'

/** 2026-09-29 in Manila. */
const NOW = '2026-09-29T06:00:00.000Z'

const PAID = {
  tenantId: 'paid',
  name: 'Paid Place',
  slug: 'paid',
  paidThrough: '2026-10-20',
}
const LAPSED = {
  tenantId: 'lapsed',
  name: 'Lapsed Lane',
  slug: 'lapsed',
  paidThrough: '2026-08-30',
}
const UNBILLED = {
  tenantId: 'unbilled',
  name: 'Unbilled Bar',
  slug: 'unbilled',
}
const CANCELLED = {
  tenantId: 'gone',
  name: 'Gone Grill',
  slug: 'gone',
  status: 'cancelled',
  paidThrough: '2026-08-30',
}

const trading = (orders30d: number): TenantActivitySnapshot => ({
  source: 'ok',
  orders30d,
  lastOrderAt: orders30d > 0 ? '2026-09-28T03:00:00.000Z' : null,
})

const paidOnce: TenantPaymentSummary = {
  paymentCount: 1,
  totalPaidPhp: 649,
  lastPaidAt: '2026-09-20T00:00:00.000Z',
  lastAmountPhp: 649,
  lastMethod: 'gcash',
  lastPeriodEnd: '2026-10-20',
}

function build(activity: Record<string, TenantActivitySnapshot> | null) {
  const roster = buildSubscriptionRoster([PAID, LAPSED, UNBILLED, CANCELLED], NOW)
  const insights = buildCollectionsInsights(
    roster,
    new Map([['paid', paidOnce]]),
    activity ? new Map(Object.entries(activity)) : null
  )
  return { roster, insights }
}

describe('buildCollectionsInsights', () => {
  it('flags a lapsed store that is still taking orders as trading unpaid', () => {
    const { insights } = build({ lapsed: trading(40) })

    expect(insights.lapsed).toMatchObject({
      isTrading: true,
      isTradingUnpaid: true,
      isDormant: false,
    })
  })

  it('flags a never-billed store that is taking orders as trading unpaid', () => {
    const { insights } = build({ unbilled: trading(3) })

    expect(insights.unbilled.isTradingUnpaid).toBe(true)
  })

  it('does not flag a paid store however busy it is', () => {
    const { insights } = build({ paid: trading(500) })

    expect(insights.paid.isTradingUnpaid).toBe(false)
  })

  it('does not chase a cancelled store for payment', () => {
    const { insights } = build({ gone: trading(10) })

    expect(insights.gone.isTradingUnpaid).toBe(false)
  })

  it('marks a store with no orders in 30 days as dormant', () => {
    const { insights } = build({ lapsed: trading(0) })

    expect(insights.lapsed).toMatchObject({
      isDormant: true,
      isTrading: false,
      isTradingUnpaid: false,
    })
  })

  it('claims neither trading nor dormant when the backend could not be read', () => {
    const { insights } = build({
      lapsed: { source: 'unreachable', orders30d: 0, lastOrderAt: null },
    })

    expect(insights.lapsed).toMatchObject({
      isDormant: false,
      isTrading: false,
    })
  })

  it('claims neither when activity was not loaded at all', () => {
    const { insights } = build(null)

    expect(insights.lapsed).toMatchObject({
      activity: null,
      isDormant: false,
      isTrading: false,
    })
  })

  it('knows who has never paid from the ledger, not the paid-through date', () => {
    const { insights } = build(null)

    expect(insights.paid.hasNeverPaid).toBe(false)
    // A backfilled paid-through date is not a payment.
    expect(insights.lapsed.hasNeverPaid).toBe(true)
  })
})

describe('summarizeCollections', () => {
  it('counts and prices the stores worth a call today', () => {
    const { roster, insights } = build({
      paid: trading(80),
      lapsed: trading(40),
      unbilled: trading(3),
      gone: trading(0),
    })

    expect(summarizeCollections(roster, insights)).toEqual({
      tradingUnpaid: 2,
      tradingUnpaidPhp: 1298,
      neverPaid: 3,
      dormant: 1,
      isActivityKnown: true,
    })
  })

  it('says when activity is unknown, so the screen can hide the activity filters', () => {
    const { roster, insights } = build(null)

    expect(summarizeCollections(roster, insights).isActivityKnown).toBe(false)
  })
})
