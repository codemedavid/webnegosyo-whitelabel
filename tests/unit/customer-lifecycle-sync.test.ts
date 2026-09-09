/**
 * Validating and applying an order lifecycle sync.
 *
 * This endpoint mutates PII-derived rows under service role, so the parse step
 * is a security boundary, not a convenience: a caller who could name any tenant
 * or hand over a customer id could rewrite another store's ledger.
 */
import { parseLifecycleSyncRequest } from '@/lib/customer-lifecycle-sync'
import { syncOrderLifecycle } from '@/lib/customer-lifecycle-sync'

const VALID = {
  tenantId: '11111111-1111-1111-1111-111111111111',
  backend: 'convex',
  externalOrderId: 'convex-1',
  status: 'delivered',
  paymentStatus: 'paid',
  source: 'online',
  outletId: null,
  updatedAt: '2026-09-01T03:00:00.000Z',
}

describe('parseLifecycleSyncRequest', () => {
  it('accepts a well-formed event', () => {
    const parsed = parseLifecycleSyncRequest(VALID)
    expect(parsed.ok).toBe(true)
  })

  it.each([
    ['a missing tenant', { ...VALID, tenantId: undefined }],
    ['a blank order id', { ...VALID, externalOrderId: '  ' }],
    ['an unknown backend', { ...VALID, backend: 'firebase' }],
    ['an event that changes neither status nor payment', { ...VALID, status: '', paymentStatus: '' }],
    ['a non-object body', null],
  ])('refuses %s', (_label, body) => {
    expect(parseLifecycleSyncRequest(body).ok).toBe(false)
  })

  it('defaults an unrecognised source to online rather than guessing pos', () => {
    const parsed = parseLifecycleSyncRequest({ ...VALID, source: 'kiosk' })
    expect(parsed.ok && parsed.value.source).toBe('online')
  })

  it('accepts a payment-only settlement, which carries no status', () => {
    const parsed = parseLifecycleSyncRequest({ ...VALID, status: '', paymentStatus: 'paid' })
    expect(parsed.ok && parsed.value.status).toBeNull()
  })

  it('refuses a client-supplied customer id, which identity must decide server-side', () => {
    const parsed = parseLifecycleSyncRequest({ ...VALID, customerId: 'customer-b' })
    expect(parsed.ok).toBe(false)
  })
})

describe('syncOrderLifecycle', () => {
  const event = { ...VALID, backend: 'convex' as const, source: 'online' as const, outletId: null }
  it('rechecks a concurrent newer cancellation instead of overwriting it with delivery', async () => {
    let current = { status: 'preparing', paymentStatus: 'pending', source: 'online' as const,
      outletId: null, updatedAt: '2026-09-01T02:00:00.000Z' }
    const result = await syncOrderLifecycle(event, {
      findLedgerOrder: async () => current,
      updateLedgerOrder: async () => {
        current = { ...current, status: 'cancelled', updatedAt: '2026-09-01T05:00:00.000Z' }
        return false
      },
    })
    expect(result).toBe('unchanged')
    expect(current.status).toBe('cancelled')
  })

  it('touches no ledger for a platform-backed order, whose truth is the orders table itself', async () => {
    const findLedgerOrder = jest.fn()
    const result = await syncOrderLifecycle(
      { ...event, backend: 'platform_supabase' },
      { findLedgerOrder, updateLedgerOrder: async () => {} },
    )
    expect(result).toBe('no_ledger')
    expect(findLedgerOrder).not.toHaveBeenCalled()
  })

  it('writes the decided columns for an order it has seen before', async () => {
    const updates: unknown[] = []
    const result = await syncOrderLifecycle(event, {
      findLedgerOrder: async () => ({
        status: 'preparing',
        paymentStatus: 'pending',
        source: 'online',
        outletId: null,
        updatedAt: '2026-09-01T02:00:00.000Z',
      }),
      updateLedgerOrder: async (_key, patch) => {
        updates.push(patch)
      },
    })

    expect(result).toBe('updated')
    expect(updates).toEqual([
      expect.objectContaining({ status: 'delivered', completed_at: '2026-09-01T03:00:00.000Z' }),
    ])
  })

  it('writes nothing when the event is a replay', async () => {
    const updates: unknown[] = []
    const result = await syncOrderLifecycle(event, {
      findLedgerOrder: async () => ({
        status: 'delivered',
        paymentStatus: 'paid',
        source: 'online',
        outletId: null,
        updatedAt: '2026-09-01T03:00:00.000Z',
      }),
      updateLedgerOrder: async (_key, patch) => {
        updates.push(patch)
      },
    })

    expect(result).toBe('unchanged')
    expect(updates).toEqual([])
  })

  it('reports a missing ledger row instead of inventing one', async () => {
    const result = await syncOrderLifecycle(event, {
      findLedgerOrder: async () => null,
      updateLedgerOrder: async () => {
        throw new Error('must not write')
      },
    })

    expect(result).toBe('not_found')
  })
})

describe('syncOrderLifecycle — payment-only settlement', () => {
  it('preserves POS source and settled payment when a status update omits them', async () => {
    const parsed = parseLifecycleSyncRequest({ ...VALID, source: undefined, paymentStatus: undefined,
      status: 'ready', updatedAt: '2026-09-02T04:00:00.000Z' })
    if (!parsed.ok) throw new Error(parsed.error)
    const updates: unknown[] = []
    await syncOrderLifecycle(parsed.value, {
      findLedgerOrder: async () => ({ status: 'confirmed', source: 'pos', paymentStatus: 'paid',
        outletId: null, updatedAt: '2026-09-01T04:00:00.000Z' }),
      updateLedgerOrder: async (_key, patch) => { updates.push(patch) },
    })
    expect(updates).toEqual([expect.objectContaining({ status: 'ready' })])
    expect(updates[0]).not.toHaveProperty('source')
    expect(updates[0]).not.toHaveProperty('payment_status')
    expect(updates[0]).not.toHaveProperty('completed_at')
  })
  it('keeps the recorded status when the event only settles payment', async () => {
    const updates: Array<Record<string, unknown>> = []

    const result = await syncOrderLifecycle(
      {
        ...VALID,
        backend: 'convex' as const,
        source: 'pos' as const,
        outletId: null,
        status: null,
        paymentStatus: 'paid',
        updatedAt: '2026-09-01T04:00:00.000Z',
      },
      {
        findLedgerOrder: async () => ({
          status: 'confirmed',
          paymentStatus: 'pending',
          source: 'pos',
          outletId: null,
          updatedAt: '2026-09-01T02:00:00.000Z',
        }),
        updateLedgerOrder: async (_key, patch) => {
          updates.push(patch as Record<string, unknown>)
        },
      },
    )

    expect(result).toBe('updated')
    // The settlement completes the visit; the status is left exactly as it was.
    expect(updates[0]).toMatchObject({
      payment_status: 'paid',
      completed_at: '2026-09-01T04:00:00.000Z',
    })
    expect(updates[0].status).toBeUndefined()
  })
})
