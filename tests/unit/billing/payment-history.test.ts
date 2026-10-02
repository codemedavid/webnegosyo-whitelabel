import {
  collectedInMonth,
  recentPayments,
  summarizePaymentsByTenant,
  type PaymentLedgerRow,
} from '@/lib/billing/payment-history'

/** 2026-09-29 14:00 in Manila. */
const NOW = '2026-09-29T06:00:00.000Z'

const payment = (overrides: Partial<PaymentLedgerRow> = {}): PaymentLedgerRow => ({
  tenant_id: 't1',
  amount_php: 649,
  period_start: '2026-09-05',
  period_end: '2026-10-04',
  paid_at: '2026-09-05T04:00:00+00:00',
  created_at: '2026-09-05T04:00:00+00:00',
  method: 'gcash',
  reference: 'ABC123',
  ...overrides,
})

describe('summarizePaymentsByTenant', () => {
  it('reports the latest payment and the lifetime total per tenant', () => {
    const summaries = summarizePaymentsByTenant([
      payment({
        paid_at: '2026-08-05T04:00:00Z',
        amount_php: 649,
        method: 'bank',
      }),
      payment({ paid_at: '2026-09-05T04:00:00Z', amount_php: '600' }),
    ])

    expect(summaries.get('t1')).toEqual({
      paymentCount: 2,
      totalPaidPhp: 1249,
      lastPaidAt: '2026-09-05T04:00:00.000Z',
      lastAmountPhp: 600,
      lastMethod: 'gcash',
      lastPeriodEnd: '2026-10-04',
    })
  })

  it('falls back to when the row was recorded if the payment date is missing', () => {
    const summaries = summarizePaymentsByTenant([payment({ paid_at: null })])

    expect(summaries.get('t1')?.lastPaidAt).toBe('2026-09-05T04:00:00.000Z')
  })

  it('has no entry for a tenant who never paid', () => {
    expect(summarizePaymentsByTenant([]).get('t1')).toBeUndefined()
  })
})

describe('collectedInMonth', () => {
  it('sums payments made in the current Manila month', () => {
    const collected = collectedInMonth(
      [
        payment({ paid_at: '2026-09-05T04:00:00Z' }),
        payment({ paid_at: '2026-08-31T16:30:00Z', amount_php: 500 }), // 1 Sep, 12:30am Manila
        payment({ paid_at: '2026-08-31T15:30:00Z', amount_php: 100 }), // 31 Aug, 11:30pm Manila
      ],
      NOW
    )

    expect(collected).toEqual({
      monthKey: '2026-09',
      amountPhp: 1149,
      count: 2,
    })
  })
})

describe('recentPayments', () => {
  it('lists the newest first, capped', () => {
    const recent = recentPayments(
      [
        payment({ tenant_id: 'old', paid_at: '2026-08-01T00:00:00Z' }),
        payment({ tenant_id: 'new', paid_at: '2026-09-20T00:00:00Z' }),
        payment({ tenant_id: 'mid', paid_at: '2026-09-01T00:00:00Z' }),
      ],
      2
    )

    expect(recent.map((row) => row.tenantId)).toEqual(['new', 'mid'])
    expect(recent[0]).toMatchObject({
      amountPhp: 649,
      method: 'gcash',
      periodEnd: '2026-10-04',
    })
  })
})
