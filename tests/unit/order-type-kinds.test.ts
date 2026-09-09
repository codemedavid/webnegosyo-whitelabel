/**
 * The fulfilment kinds an order type can carry, and which of them a merchant
 * may still add.
 *
 * The core three (dine_in / pickup / delivery) are singletons per store — the
 * DB enforces that with a partial unique index. Aggregator kinds (grab,
 * foodpanda) and the free-label `other` repeat: a store can run "Shopee Food"
 * and "Lalamove Market" as two `other` rows. Everything that is not dine-in or
 * delivery behaves like pickup — no address, no delivery fee, no radius.
 */

import {
  ORDER_TYPE_KINDS,
  ORDER_TYPE_KIND_LABELS,
  SINGLETON_ORDER_TYPE_KINDS,
  availableOrderTypeKinds,
  isOrderTypeKind,
  isPickupLike,
} from '@/lib/order-types/order-type-kinds'

describe('ORDER_TYPE_KINDS', () => {
  it('lists the six kinds with the core three first', () => {
    expect(ORDER_TYPE_KINDS).toEqual([
      'dine_in',
      'pickup',
      'delivery',
      'grab',
      'foodpanda',
      'other',
    ])
  })

  it('treats only the core three as per-store singletons', () => {
    expect(SINGLETON_ORDER_TYPE_KINDS).toEqual(['dine_in', 'pickup', 'delivery'])
  })

  it('has a display label for every kind', () => {
    for (const kind of ORDER_TYPE_KINDS) {
      expect(typeof ORDER_TYPE_KIND_LABELS[kind]).toBe('string')
      expect(ORDER_TYPE_KIND_LABELS[kind].length).toBeGreaterThan(0)
    }
    expect(ORDER_TYPE_KIND_LABELS.dine_in).toBe('Dine In')
    expect(ORDER_TYPE_KIND_LABELS.foodpanda).toBe('foodpanda')
  })
})

describe('isOrderTypeKind', () => {
  it('accepts every known kind', () => {
    for (const kind of ORDER_TYPE_KINDS) {
      expect(isOrderTypeKind(kind)).toBe(true)
    }
  })

  it('rejects unknown strings and non-strings', () => {
    expect(isOrderTypeKind('takeaway')).toBe(false)
    expect(isOrderTypeKind('Dine In')).toBe(false)
    expect(isOrderTypeKind('')).toBe(false)
    expect(isOrderTypeKind(null)).toBe(false)
    expect(isOrderTypeKind(undefined)).toBe(false)
    expect(isOrderTypeKind(3)).toBe(false)
    expect(isOrderTypeKind({})).toBe(false)
  })
})

describe('isPickupLike', () => {
  it('is true for pickup and every aggregator / other kind', () => {
    expect(isPickupLike('pickup')).toBe(true)
    expect(isPickupLike('grab')).toBe(true)
    expect(isPickupLike('foodpanda')).toBe(true)
    expect(isPickupLike('other')).toBe(true)
  })

  it('is false for dine-in and delivery', () => {
    expect(isPickupLike('dine_in')).toBe(false)
    expect(isPickupLike('delivery')).toBe(false)
  })
})

describe('availableOrderTypeKinds', () => {
  it('offers every kind when nothing is used yet', () => {
    expect(availableOrderTypeKinds([])).toEqual([...ORDER_TYPE_KINDS])
  })

  it('drops a singleton once the store has one', () => {
    expect(availableOrderTypeKinds(['pickup'])).toEqual([
      'dine_in',
      'delivery',
      'grab',
      'foodpanda',
      'other',
    ])
  })

  it('keeps offering grab, foodpanda and other even when already used', () => {
    expect(availableOrderTypeKinds(['grab', 'foodpanda', 'other', 'other'])).toEqual([
      'dine_in',
      'pickup',
      'delivery',
      'grab',
      'foodpanda',
      'other',
    ])
  })

  it('leaves only the repeatable kinds once all singletons are taken', () => {
    expect(availableOrderTypeKinds(['dine_in', 'pickup', 'delivery'])).toEqual([
      'grab',
      'foodpanda',
      'other',
    ])
  })

  it('ignores unknown used values instead of throwing', () => {
    // Legacy rows or a renamed label must not hide the picker.
    expect(availableOrderTypeKinds(['takeaway', ''])).toEqual([...ORDER_TYPE_KINDS])
  })

  it('does not mutate the input', () => {
    const used = ['pickup']
    availableOrderTypeKinds(used)
    expect(used).toEqual(['pickup'])
  })
})
