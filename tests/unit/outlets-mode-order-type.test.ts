import { describe, it, expect } from '@jest/globals'
import { resolveOrderTypeIdForMode } from '@/lib/outlets/mode-order-type'
import type { OrderType } from '@/types/database'

/**
 * The branch chooser asks "dine in, pickup or delivery?" and checkout asks the
 * same question again through the tenant's own order types. Answering twice is
 * the bug this closes: the mode the customer picked selects the matching order
 * type, so checkout opens already knowing.
 *
 * The mapping is by `type`, never by name — a merchant is free to label their
 * dine-in order type "Eat In" or "Kain Dito", and matching on the label would
 * quietly stop working the moment they did.
 */

function makeOrderType(overrides: Partial<OrderType> & { id: string }): OrderType {
  return {
    tenant_id: 't1',
    name: overrides.id,
    type: 'pickup',
    is_enabled: true,
    order_index: 0,
    ...overrides,
  } as OrderType
}

const DINE_IN = makeOrderType({ id: 'ot-dine', type: 'dine_in', name: 'Eat In' })
const PICKUP = makeOrderType({ id: 'ot-pick', type: 'pickup' })
const DELIVERY = makeOrderType({ id: 'ot-del', type: 'delivery' })

describe('resolveOrderTypeIdForMode', () => {
  it('selects the dine-in order type for the dine-in mode', () => {
    // Arrange / Act
    const id = resolveOrderTypeIdForMode([DELIVERY, PICKUP, DINE_IN], 'dine_in')

    // Assert
    expect(id).toBe('ot-dine')
  })

  it('matches on type rather than on the merchant’s label', () => {
    const renamed = makeOrderType({ id: 'ot-x', type: 'dine_in', name: 'Kain Dito' })

    expect(resolveOrderTypeIdForMode([renamed], 'dine_in')).toBe('ot-x')
  })

  it('maps pickup and delivery modes to their own types', () => {
    expect(resolveOrderTypeIdForMode([DINE_IN, PICKUP, DELIVERY], 'pickup')).toBe('ot-pick')
    expect(resolveOrderTypeIdForMode([DINE_IN, PICKUP, DELIVERY], 'delivery')).toBe('ot-del')
  })

  it('ignores order types the merchant has switched off', () => {
    const disabled = makeOrderType({ id: 'ot-off', type: 'dine_in', is_enabled: false })

    expect(resolveOrderTypeIdForMode([disabled], 'dine_in')).toBeNull()
  })

  it('returns null rather than guessing when no type matches the mode', () => {
    // Checkout then asks the customer, exactly as it does today. Falling back to
    // "the first order type" would silently place a dine-in order for delivery.
    expect(resolveOrderTypeIdForMode([PICKUP, DELIVERY], 'dine_in')).toBeNull()
  })

  it('returns null for an empty list without throwing', () => {
    expect(resolveOrderTypeIdForMode([], 'pickup')).toBeNull()
  })

  it('prefers the merchant’s own ordering when two types share a mode', () => {
    const second = makeOrderType({ id: 'ot-2', type: 'dine_in', order_index: 2 })
    const first = makeOrderType({ id: 'ot-1', type: 'dine_in', order_index: 1 })

    expect(resolveOrderTypeIdForMode([second, first], 'dine_in')).toBe('ot-1')
  })
})
