/**
 * Rebooking a Lalamove delivery after its booking died.
 *
 * A cancelled (or rejected, or driver-search-expired) booking left its
 * `lalamove_order_id` on the order forever, and every transport refuses to
 * quote or book while that id is set — so one accidental Cancel stranded the
 * order with no rider and no way to get one. The gate below is what lets a
 * dead booking be replaced while still refusing to touch a live or finished
 * one.
 */
import { describe, expect, test } from '@jest/globals'
import { isRebookableLalamoveStatus } from '@/lib/lalamove-status'
import { resolveRequoteGate, retireDeadBookingPatch } from '@/lib/lalamove-rebook'

describe('isRebookableLalamoveStatus', () => {
  test.each(['CANCELED', 'CANCELLED', 'REJECTED', 'EXPIRED', 'cancelled'])(
    '%s ended without a delivery, so the order can be booked again',
    (status) => {
      expect(isRebookableLalamoveStatus(status)).toBe(true)
    },
  )

  test.each(['COMPLETED', 'DELIVERED', 'ASSIGNING_DRIVER', 'ON_GOING', 'PICKED_UP', '', null, undefined])(
    '%s is not rebookable',
    (status) => {
      expect(isRebookableLalamoveStatus(status)).toBe(false)
    },
  )
})

describe('resolveRequoteGate', () => {
  test('an order that was never booked can be quoted, retiring nothing', () => {
    expect(resolveRequoteGate({ lalamoveOrderId: null, lalamoveStatus: null })).toEqual({
      ok: true,
      retiredOrderId: null,
    })
    expect(resolveRequoteGate({ lalamoveOrderId: '  ', lalamoveStatus: null })).toEqual({
      ok: true,
      retiredOrderId: null,
    })
  })

  test('a cancelled booking is retired so the order can be booked again', () => {
    expect(resolveRequoteGate({ lalamoveOrderId: 'lala-old', lalamoveStatus: 'CANCELLED' })).toEqual({
      ok: true,
      retiredOrderId: 'lala-old',
    })
  })

  test('refuses while a booking is live — a second rider would be dispatched', () => {
    const gate = resolveRequoteGate({ lalamoveOrderId: 'lala-1', lalamoveStatus: 'ON_GOING' })
    expect(gate.ok).toBe(false)
    expect(!gate.ok && gate.error).toMatch(/cancel it/i)
  })

  test('refuses a booking with no recorded status — it may still be live', () => {
    expect(resolveRequoteGate({ lalamoveOrderId: 'lala-1', lalamoveStatus: null }).ok).toBe(false)
  })

  test('refuses a completed delivery — the customer already has their order', () => {
    const gate = resolveRequoteGate({ lalamoveOrderId: 'lala-1', lalamoveStatus: 'COMPLETED' })
    expect(gate.ok).toBe(false)
    expect(!gate.ok && gate.error).toMatch(/completed/i)
  })
})

describe('retireDeadBookingPatch', () => {
  test('clears every trace of the dead booking and stores the new quotation', () => {
    // A stale driver name or tracking link left behind would show the
    // merchant a rider who is no longer coming.
    expect(retireDeadBookingPatch('quote-new')).toEqual({
      lalamove_quotation_id: 'quote-new',
      lalamove_order_id: null,
      lalamove_status: null,
      lalamove_tracking_url: null,
      lalamove_driver_id: null,
      lalamove_driver_name: null,
      lalamove_driver_phone: null,
    })
  })
})
