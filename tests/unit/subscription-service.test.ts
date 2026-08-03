/**
 * Recording a payment.
 *
 * The money has already moved by the time this runs — someone sent GCash and
 * the platform owner is writing it down. So the job here is arithmetic that
 * never short-changes the merchant, and a ledger row that survives long enough
 * to settle an argument about whether August was paid.
 */

import { MONTHLY_PRICE_PHP } from '@/lib/billing/plan'
import {
  markPaid,
  type SubscriptionStore,
  type PaymentRow,
  type SubscriptionRow,
} from '@/lib/billing/subscription-service'

/** 2026-08-10, mid-afternoon Manila. */
const NOW = '2026-08-10T07:00:00.000Z'

const TENANT = 'tenant-1'
const RECORDER = 'superadmin-1'

interface Fake {
  store: SubscriptionStore
  payments: PaymentRow[]
  subscriptions: Map<string, Partial<SubscriptionRow>>
}

function fakeStore(existing?: Partial<SubscriptionRow>): Fake {
  const payments: PaymentRow[] = []
  const subscriptions = new Map<string, Partial<SubscriptionRow>>()
  if (existing) subscriptions.set(TENANT, existing)

  return {
    payments,
    subscriptions,
    store: {
      async getSubscription(tenantId) {
        return (subscriptions.get(tenantId) as SubscriptionRow) ?? null
      },
      async upsertSubscription(tenantId, patch) {
        subscriptions.set(tenantId, { ...subscriptions.get(tenantId), ...patch })
      },
      async insertPayment(row) {
        payments.push(row)
      },
    },
  }
}

const input = {
  tenantId: TENANT,
  recordedBy: RECORDER,
  method: 'gcash',
  reference: 'REF-123',
}

describe('markPaid', () => {
  describe('advancing the paid-through date', () => {
    it('starts a lapsed merchant a fresh month from today', () => {
      // Arrange — paid through July, now the 10th of August.
      const { store } = fakeStore({ paid_through: '2026-07-31', status: 'past_due' })

      // Act
      const result = markPaid(store, input, NOW)

      // Assert — the merchant gets a full month from today, not a month from a
      // date that has already passed. Charging them for July over again would
      // mean paying ₱649 for eleven days.
      return result.then((r) => {
        expect(r.periodStart).toBe('2026-08-10')
        expect(r.periodEnd).toBe('2026-09-09')
      })
    })

    it('stacks onto the existing period when paying early', async () => {
      // Paid through the end of August, paying again on the 10th.
      const { store } = fakeStore({ paid_through: '2026-08-31', status: 'active' })

      const result = await markPaid(store, input, NOW)

      // The new period picks up the day after the old one ends. Resetting to
      // "a month from today" would silently burn the 21 days already paid for.
      expect(result.periodStart).toBe('2026-09-01')
      expect(result.periodEnd).toBe('2026-09-30')
    })

    it('starts today for a tenant with no subscription row yet', async () => {
      const { store } = fakeStore()

      const result = await markPaid(store, input, NOW)

      expect(result.periodStart).toBe('2026-08-10')
      expect(result.periodEnd).toBe('2026-09-09')
    })

    it('writes the new paid-through date onto the subscription', async () => {
      const { store, subscriptions } = fakeStore({ paid_through: '2026-07-31' })

      await markPaid(store, input, NOW)

      expect(subscriptions.get(TENANT)?.paid_through).toBe('2026-09-09')
    })

    it('reopens a past_due subscription by setting it active', async () => {
      const { store, subscriptions } = fakeStore({ paid_through: '2026-07-01', status: 'past_due' })

      await markPaid(store, input, NOW)

      expect(subscriptions.get(TENANT)?.status).toBe('active')
    })

    it('reopens a subscription that was paused for non-payment', async () => {
      // Paying is exactly how a merchant gets out of the paused state; leaving
      // the status alone would take their money and keep the door shut.
      const { store, subscriptions } = fakeStore({ paid_through: '2026-06-01', status: 'paused' })

      await markPaid(store, input, NOW)

      expect(subscriptions.get(TENANT)?.status).toBe('active')
    })

    it('honours a multi-month payment', async () => {
      const { store } = fakeStore({ paid_through: '2026-07-31' })

      const result = await markPaid(store, { ...input, periodMonths: 3 }, NOW)

      expect(result.periodEnd).toBe('2026-11-09')
    })
  })

  describe('honouring the billing anchor', () => {
    it('bills the month the merchant is living in rather than starting today', () => {
      // Anchored to the 1st, never billed, recorded on the 10th. Starting today
      // would charge a full month for 22 days AND move every future renewal to
      // the 10th — the drift this anchor exists to stop.
      const { store } = fakeStore({ billing_anchor_date: '2026-08-01' })

      return markPaid(store, input, NOW).then((result) => {
        expect(result.periodStart).toBe('2026-08-01')
        expect(result.periodEnd).toBe('2026-08-31')
      })
    })

    it('keeps the turnover date when a lapsed merchant pays late', async () => {
      // Paid through August, anchored to the 1st, recorded on 20 September.
      // They buy September; October still falls due on the 1st.
      const { store } = fakeStore({
        billing_anchor_date: '2026-01-01',
        paid_through: '2026-08-31',
        status: 'past_due',
      })

      const result = await markPaid(store, input, '2026-09-20T07:00:00.000Z')

      expect(result.periodStart).toBe('2026-09-01')
      expect(result.periodEnd).toBe('2026-09-30')
    })

    it('records the anchored period in the ledger, not merely on the subscription', async () => {
      // The ledger is what settles an argument about which month was paid, so
      // it has to carry the same dates the access does.
      const { store, payments, subscriptions } = fakeStore({
        billing_anchor_date: '2026-08-01',
      })

      await markPaid(store, input, NOW)

      expect(payments[0]).toMatchObject({
        period_start: '2026-08-01',
        period_end: '2026-08-31',
      })
      expect(subscriptions.get(TENANT)?.paid_through).toBe('2026-08-31')
    })

    it('still stacks an early payment onto days already bought', async () => {
      // The anchor must never reclaim days the merchant already owns.
      const { store } = fakeStore({
        billing_anchor_date: '2026-08-01',
        paid_through: '2026-08-31',
      })

      const result = await markPaid(store, input, NOW)

      expect(result.periodStart).toBe('2026-09-01')
      expect(result.periodEnd).toBe('2026-09-30')
    })

    it('ignores a corrupt anchor rather than refusing the payment', async () => {
      const { store } = fakeStore({ billing_anchor_date: '2026-02-31' })

      const result = await markPaid(store, input, NOW)

      expect(result.periodStart).toBe('2026-08-10')
    })
  })

  describe('month arithmetic', () => {
    it('clamps to the last day of a shorter month', async () => {
      // A month after 31 January is 28 February, not 3 March. Rolling over
      // would hand out free days every time a long month met a short one.
      const { store } = fakeStore({ paid_through: '2026-01-30' })

      const result = await markPaid(store, input, '2026-01-15T07:00:00.000Z')

      expect(result.periodEnd).toBe('2026-02-28')
    })

    it('lands on 29 February in a leap year', async () => {
      const { store } = fakeStore({ paid_through: '2028-01-30' })

      const result = await markPaid(store, input, '2028-01-15T07:00:00.000Z')

      expect(result.periodEnd).toBe('2028-02-29')
    })

    it('crosses a year boundary', async () => {
      const { store } = fakeStore({ paid_through: '2026-12-15' })

      const result = await markPaid(store, input, '2026-12-01T07:00:00.000Z')

      expect(result.periodEnd).toBe('2027-01-15')
    })
  })

  describe('the payment ledger', () => {
    it('records the payment against the period it bought', async () => {
      const { store, payments } = fakeStore({ paid_through: '2026-07-31' })

      await markPaid(store, input, NOW)

      expect(payments).toHaveLength(1)
      expect(payments[0]).toMatchObject({
        tenant_id: TENANT,
        amount_php: MONTHLY_PRICE_PHP,
        period_start: '2026-08-10',
        period_end: '2026-09-09',
        method: 'gcash',
        reference: 'REF-123',
        recorded_by: RECORDER,
      })
    })

    it('defaults the amount to the standard monthly price', async () => {
      const { store, payments } = fakeStore()

      await markPaid(store, input, NOW)

      expect(payments[0].amount_php).toBe(MONTHLY_PRICE_PHP)
    })

    it('records a discounted or partial amount when one is given', async () => {
      const { store, payments } = fakeStore()

      await markPaid(store, { ...input, amountPhp: 500 }, NOW)

      expect(payments[0].amount_php).toBe(500)
    })

    it('records a free month as zero rather than refusing it', async () => {
      // Comping a month is a normal thing to do for a client having a bad time.
      const { store, payments } = fakeStore()

      await markPaid(store, { ...input, amountPhp: 0 }, NOW)

      expect(payments[0].amount_php).toBe(0)
    })

    it('keeps blank method and reference as null rather than empty strings', async () => {
      const { store, payments } = fakeStore()

      await markPaid(store, { ...input, method: '  ', reference: '' }, NOW)

      expect(payments[0].method).toBeNull()
      expect(payments[0].reference).toBeNull()
    })
  })

  describe('refusing bad input', () => {
    it('refuses a payment with no tenant', async () => {
      const { store } = fakeStore()

      await expect(markPaid(store, { ...input, tenantId: '  ' }, NOW)).rejects.toThrow(/tenant/i)
    })

    it('refuses a negative amount', async () => {
      const { store } = fakeStore()

      await expect(markPaid(store, { ...input, amountPhp: -100 }, NOW)).rejects.toThrow(/amount/i)
    })

    it('refuses a period of zero months', async () => {
      const { store } = fakeStore()

      await expect(markPaid(store, { ...input, periodMonths: 0 }, NOW)).rejects.toThrow(/month/i)
    })

    it('does not write a payment row when the input is refused', async () => {
      // A rejected payment that still lands in the ledger would overstate
      // revenue and, worse, look like proof the merchant paid.
      const { store, payments } = fakeStore()

      await expect(markPaid(store, { ...input, amountPhp: -1 }, NOW)).rejects.toThrow()

      expect(payments).toHaveLength(0)
    })

    it('does not advance the subscription when the ledger write fails', async () => {
      // Extending access without a payment record is the one failure that loses
      // money silently: nobody would ever know to chase it.
      const { store, subscriptions } = fakeStore({ paid_through: '2026-07-31' })
      store.insertPayment = async () => {
        throw new Error('ledger unavailable')
      }

      await expect(markPaid(store, input, NOW)).rejects.toThrow(/ledger/)

      expect(subscriptions.get(TENANT)?.paid_through).toBe('2026-07-31')
    })
  })
})
