/**
 * Deciding what a lifecycle event should write to the customer ledger.
 *
 * The defect this closes: `upsertCustomerFromOrder` runs ONLY at order create.
 * Nothing recomputed on a status change, a cancellation or a refund, so a
 * cancelled order still counted as a customer visit forever.
 *
 * Sync events arrive from three backends, over flaky merchant handsets, with
 * retries. So the contract is: replays are no-ops, late events never overwrite
 * newer state, and a reversal is recorded rather than deleted.
 */
import {
  decideLifecycleWrite,
  type OrderLifecycleState,
} from '@/lib/customer-order-lifecycle'

function state(overrides: Partial<OrderLifecycleState> = {}): OrderLifecycleState {
  return {
    status: 'delivered',
    paymentStatus: 'paid',
    source: 'online',
    outletId: null,
    updatedAt: '2026-09-01T03:00:00.000Z',
    ...overrides,
  }
}

describe('decideLifecycleWrite', () => {
  it('writes everything the first time an order is seen', () => {
    const write = decideLifecycleWrite(null, state())

    expect(write).toMatchObject({
      status: 'delivered',
      payment_status: 'paid',
      source: 'online',
      completed_at: '2026-09-01T03:00:00.000Z',
    })
  })

  it('is a no-op when the same event is replayed', () => {
    const current = state()
    expect(decideLifecycleWrite(current, { ...current })).toBeNull()
  })

  it('advances the event watermark without moving the original completed visit', () => {
    const current = state({ completedAt: '2026-09-01T01:00:00.000Z' })
    expect(decideLifecycleWrite(current, state({ updatedAt: '2026-09-01T06:00:00.000Z' })))
      .toEqual({ updated_at: '2026-09-01T06:00:00.000Z' })
  })

  it('ignores an event that is older than what is already recorded', () => {
    const current = state({ status: 'delivered', updatedAt: '2026-09-01T03:00:00.000Z' })
    const stale = state({ status: 'preparing', updatedAt: '2026-09-01T02:00:00.000Z' })

    expect(decideLifecycleWrite(current, stale)).toBeNull()
  })

  it('advances an open order and stamps completion when it is fulfilled', () => {
    const current = state({ status: 'preparing', paymentStatus: 'pending' })
    const write = decideLifecycleWrite(
      current,
      state({ status: 'delivered', paymentStatus: 'paid', updatedAt: '2026-09-01T04:00:00.000Z' }),
    )

    expect(write).toMatchObject({
      status: 'delivered',
      payment_status: 'paid',
      completed_at: '2026-09-01T04:00:00.000Z',
    })
  })

  it('does not stamp completion for an order that is merely ready', () => {
    const write = decideLifecycleWrite(null, state({ status: 'ready' }))

    expect(write).toMatchObject({ status: 'ready', completed_at: null })
  })

  it('clears completion when a fulfilled order is cancelled, so the visit reverses', () => {
    const current = state({ status: 'delivered' })
    const write = decideLifecycleWrite(
      current,
      state({ status: 'cancelled', updatedAt: '2026-09-01T05:00:00.000Z' }),
    )

    expect(write).toMatchObject({ status: 'cancelled', completed_at: null })
  })

  it('restores completion when a cancelled order is un-cancelled', () => {
    const current = state({ status: 'cancelled' })
    const write = decideLifecycleWrite(
      current,
      state({ status: 'delivered', updatedAt: '2026-09-01T06:00:00.000Z' }),
    )

    expect(write).toMatchObject({ status: 'delivered', completed_at: '2026-09-01T06:00:00.000Z' })
  })

  it('settles a POS sale on payment alone, without waiting for a delivery status', () => {
    const write = decideLifecycleWrite(
      state({ source: 'pos', status: 'confirmed', paymentStatus: 'pending' }),
      state({ source: 'pos', status: 'confirmed', paymentStatus: 'paid', updatedAt: '2026-09-01T04:00:00.000Z' }),
    )

    expect(write).toMatchObject({ payment_status: 'paid', completed_at: '2026-09-01T04:00:00.000Z' })
  })

  it('records a branch that was unknown when the order was captured', () => {
    const write = decideLifecycleWrite(
      state({ outletId: null }),
      state({ outletId: 'outlet-9', updatedAt: '2026-09-01T04:00:00.000Z' }),
    )

    expect(write).toMatchObject({ outlet_id: 'outlet-9' })
  })

  it('never blanks a known branch just because an event omitted it', () => {
    const write = decideLifecycleWrite(
      state({ outletId: 'outlet-9' }),
      state({ outletId: null, status: 'cancelled', updatedAt: '2026-09-01T04:00:00.000Z' }),
    )

    expect(write?.outlet_id).toBeUndefined()
  })
})
