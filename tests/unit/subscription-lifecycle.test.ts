/**
 * Cutting a merchant off, and letting them back in.
 *
 * The platform owner needs a lever that does not depend on dates: a client who
 * has stopped replying gets paused today, not in three days when their grace
 * runs out. `subscription-status.ts` already treats `paused` as terminal — this
 * is the only thing that can set it.
 *
 * The rule the tests below exist to protect is that pausing and resuming NEVER
 * touch `paid_through`. Money paid is money paid: a merchant paused mid-month
 * and resumed a week later must get their remaining days back, and a merchant
 * resumed months after lapsing must NOT get a free month for having been
 * paused. Only `markPaid` may move that date.
 */

import {
  pauseSubscription,
  resumeSubscription,
  type SubscriptionStore,
  type SubscriptionRow,
} from '@/lib/billing/subscription-lifecycle'
import { resolveSubscriptionAccess } from '@/lib/billing/subscription-status'

const NOW = '2026-08-10T07:00:00.000Z'

/** The in-memory stand-in for `tenant_subscriptions`, as in the service tests. */
function createStore(seed: SubscriptionRow | null = null) {
  const rows = new Map<string, SubscriptionRow>()
  if (seed) rows.set(seed.tenant_id, seed)

  const store: SubscriptionStore = {
    async getSubscription(tenantId) {
      return rows.get(tenantId) ?? null
    },
    async upsertSubscription(tenantId, patch) {
      const existing = rows.get(tenantId)
      rows.set(tenantId, {
        tenant_id: tenantId,
        status: 'trialing',
        monthly_price_php: 649,
        paid_through: null,
        grace_days: 3,
        ...existing,
        ...patch,
      })
    },
  }

  return { store, read: (tenantId: string) => rows.get(tenantId) ?? null }
}

const CURRENT: SubscriptionRow = {
  tenant_id: 't1',
  status: 'active',
  monthly_price_php: 649,
  paid_through: '2026-08-31',
  grace_days: 3,
}

describe('pauseSubscription', () => {
  it('sets the status that closes the merchant admin', async () => {
    // Arrange
    const { store, read } = createStore(CURRENT)

    // Act
    await pauseSubscription(store, { tenantId: 't1' }, NOW)

    // Assert
    expect(read('t1')?.status).toBe('paused')
  })

  it('blocks the tenant immediately, with days still left on their paid period', async () => {
    // The whole point of a manual pause: it must beat the dates.
    const { store, read } = createStore(CURRENT)

    await pauseSubscription(store, { tenantId: 't1' }, NOW)

    expect(resolveSubscriptionAccess(read('t1'), NOW)).toMatchObject({
      state: 'paused',
      isBlocked: true,
    })
  })

  it('keeps the paid-through date, so a resume gives back the days they bought', async () => {
    const { store, read } = createStore(CURRENT)

    await pauseSubscription(store, { tenantId: 't1' }, NOW)

    expect(read('t1')?.paid_through).toBe('2026-08-31')
  })

  it('pauses a tenant who has no subscription row yet', async () => {
    // A client who has never been billed is exactly the one likely to be cut
    // off. Requiring a row first would make the lever unusable on them.
    const { store, read } = createStore(null)

    await pauseSubscription(store, { tenantId: 'brand-new' }, NOW)

    expect(read('brand-new')).toMatchObject({ status: 'paused', paid_through: null })
  })

  it('is idempotent — pausing an already-paused tenant is not an error', async () => {
    const { store, read } = createStore({ ...CURRENT, status: 'paused' })

    await pauseSubscription(store, { tenantId: 't1' }, NOW)

    expect(read('t1')?.status).toBe('paused')
  })

  it('refuses a blank tenant id rather than writing an orphan row', async () => {
    const { store } = createStore(CURRENT)

    await expect(pauseSubscription(store, { tenantId: '  ' }, NOW)).rejects.toThrow(/tenant/i)
  })
})

describe('resumeSubscription', () => {
  it('restores the status so the admin opens again', async () => {
    const { store, read } = createStore({ ...CURRENT, status: 'paused' })

    await resumeSubscription(store, { tenantId: 't1' }, NOW)

    expect(read('t1')?.status).toBe('active')
  })

  it('gives back the unused days of a period they had already paid for', async () => {
    const { store, read } = createStore({ ...CURRENT, status: 'paused' })

    await resumeSubscription(store, { tenantId: 't1' }, NOW)

    expect(resolveSubscriptionAccess(read('t1'), NOW)).toMatchObject({
      state: 'active',
      isBlocked: false,
    })
  })

  it('does NOT hand a free month to a tenant resumed long after lapsing', async () => {
    // Resuming clears the manual block and nothing else. A tenant whose date
    // ran out in May is still overdue the moment they are un-paused; if this
    // wrote a fresh date, the pause lever would double as a giveaway.
    const { store, read } = createStore({
      ...CURRENT,
      status: 'paused',
      paid_through: '2026-05-01',
    })

    await resumeSubscription(store, { tenantId: 't1' }, NOW)

    expect(read('t1')?.paid_through).toBe('2026-05-01')
    expect(resolveSubscriptionAccess(read('t1'), NOW)).toMatchObject({
      state: 'paused',
      isBlocked: true,
    })
  })

  it('refuses a blank tenant id', async () => {
    const { store } = createStore(CURRENT)

    await expect(resumeSubscription(store, { tenantId: '' }, NOW)).rejects.toThrow(/tenant/i)
  })
})
