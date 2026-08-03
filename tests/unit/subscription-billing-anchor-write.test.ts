/**
 * Setting the date a client's month turns over.
 *
 * The invariant under test is what this lever must NOT do. Setting an anchor is
 * an administrative correction — "they actually started on the 1st" — and it
 * must never move `paid_through` or `status`. Those are bought with money, and
 * a date field that could quietly grant a month of access would be the cheapest
 * way on this platform to give away service without a ledger row.
 *
 * Same shape as `subscription-lifecycle.test.ts`: pure logic over an in-memory
 * fake, no Supabase.
 */

import { setBillingAnchor } from '@/lib/billing/subscription-lifecycle'
import type { SubscriptionRow, SubscriptionStore } from '@/lib/billing/subscription-lifecycle'

const TENANT = 'tenant-1'

/** A client who is paid up and currently unanchored. */
const PAID_UP: Partial<SubscriptionRow> = {
  tenant_id: TENANT,
  status: 'active',
  paid_through: '2026-08-31',
  billing_anchor_date: null,
}

interface Fake {
  store: SubscriptionStore
  subscriptions: Map<string, Partial<SubscriptionRow>>
}

function fakeStore(existing?: Partial<SubscriptionRow>): Fake {
  const subscriptions = new Map<string, Partial<SubscriptionRow>>()
  if (existing) subscriptions.set(TENANT, existing)

  return {
    subscriptions,
    store: {
      async getSubscription(tenantId) {
        return (subscriptions.get(tenantId) as SubscriptionRow) ?? null
      },
      async upsertSubscription(tenantId, patch) {
        subscriptions.set(tenantId, { ...subscriptions.get(tenantId), ...patch })
      },
    },
  }
}

describe('setBillingAnchor', () => {
  it('records the date the client’s month turns over', async () => {
    // Arrange
    const { store, subscriptions } = fakeStore(PAID_UP)

    // Act
    await setBillingAnchor(store, { tenantId: TENANT, anchorDate: '2026-08-01' })

    // Assert
    expect(subscriptions.get(TENANT)?.billing_anchor_date).toBe('2026-08-01')
  })

  it('grants no access — paid_through is untouched', async () => {
    // The whole point. If this ever moves paid_through, a superadmin could
    // hand out months by typing dates, and nothing in the ledger would show it.
    const { store, subscriptions } = fakeStore(PAID_UP)

    await setBillingAnchor(store, { tenantId: TENANT, anchorDate: '2026-01-01' })

    expect(subscriptions.get(TENANT)?.paid_through).toBe('2026-08-31')
  })

  it('does not reopen a paused client', async () => {
    // Setting a start date on a client who was cut off must not let them back
    // in — that is what Resume is for, and it is a separate decision.
    const { store, subscriptions } = fakeStore({ ...PAID_UP, status: 'paused' })

    await setBillingAnchor(store, { tenantId: TENANT, anchorDate: '2026-08-01' })

    expect(subscriptions.get(TENANT)?.status).toBe('paused')
  })

  it('creates a row for a client who has never been billed', async () => {
    // The client most likely to need a start date set is the one who has just
    // joined and has no subscription row at all. Requiring a row to exist
    // first would make the lever unusable on exactly that client.
    const { store, subscriptions } = fakeStore()

    await setBillingAnchor(store, { tenantId: TENANT, anchorDate: '2026-08-01' })

    expect(subscriptions.get(TENANT)?.billing_anchor_date).toBe('2026-08-01')
  })

  it('clears the anchor when given null', async () => {
    // Returning a client to plain "a month from when you pay" billing has to be
    // possible, or a mistyped date is permanent.
    const { store, subscriptions } = fakeStore({
      ...PAID_UP,
      billing_anchor_date: '2026-08-01',
    })

    await setBillingAnchor(store, { tenantId: TENANT, anchorDate: null })

    expect(subscriptions.get(TENANT)?.billing_anchor_date).toBeNull()
  })

  describe('refusing bad input', () => {
    it('refuses an anchor with no tenant', async () => {
      const { store } = fakeStore()

      await expect(
        setBillingAnchor(store, { tenantId: '  ', anchorDate: '2026-08-01' })
      ).rejects.toThrow(/tenant/i)
    })

    it('refuses a date that is not a calendar date', async () => {
      // A junk anchor would be silently ignored by the period arithmetic, so
      // the merchant would keep drifting while the screen showed a start date.
      // Better to refuse the write than to display a lie.
      const { store } = fakeStore()

      await expect(
        setBillingAnchor(store, { tenantId: TENANT, anchorDate: '01/08/2026' })
      ).rejects.toThrow(/date/i)
    })

    it('refuses an impossible calendar date', async () => {
      const { store } = fakeStore()

      await expect(
        setBillingAnchor(store, { tenantId: TENANT, anchorDate: '2026-02-31' })
      ).rejects.toThrow(/date/i)
    })

    it('writes nothing when the date is refused', async () => {
      const { store, subscriptions } = fakeStore({
        ...PAID_UP,
        billing_anchor_date: '2026-08-01',
      })

      await expect(
        setBillingAnchor(store, { tenantId: TENANT, anchorDate: 'garbage' })
      ).rejects.toThrow()

      expect(subscriptions.get(TENANT)?.billing_anchor_date).toBe('2026-08-01')
    })
  })
})
