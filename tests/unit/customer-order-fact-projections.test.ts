/**
 * Projecting each order backend into the one storage-neutral fact shape.
 *
 * The Customer Hub's numbers are only as true as these two functions: every
 * repeat-rate, cadence and favourite-item figure is computed from whatever they
 * emit. Three defects they exist to prevent, each pinned below:
 *
 *   1. A visit counted on the day it was PLACED rather than the day it was
 *      FULFILLED, which silently shifts orders between reporting windows.
 *   2. A menu item id dropped on the way in, collapsing a renamed item into two
 *      separate "favourites" (Convex always carries an id; Postgres nulls it
 *      when the menu item is deleted, so both shapes must survive).
 *   3. A Postgres `numeric` arriving as a STRING over PostgREST and turning
 *      every total into NaN.
 */
import {
  isQualifiedOrderFact,
  ledgerRowToFact,
  platformOrderToFact,
  rankCustomerItems,
  type ExternalLedgerFactRow,
  type PlatformOrderFactRow,
  type PlatformOrderItemFactRow,
} from '@/lib/customer-order-facts'

function ledgerRow(overrides: Partial<ExternalLedgerFactRow> = {}): ExternalLedgerFactRow {
  return {
    backend: 'convex',
    external_order_id: 'convex-order-1',
    customer_id: 'customer-a',
    source: 'online',
    status: 'delivered',
    payment_status: 'paid',
    outlet_id: null,
    total: 250,
    ordered_at: '2026-09-01T02:00:00.000Z',
    completed_at: '2026-09-01T03:00:00.000Z',
    updated_at: '2026-09-01T03:00:00.000Z',
    items: [{ name: 'Latte', quantity: 2 }],
    ...overrides,
  }
}

function platformOrder(overrides: Partial<PlatformOrderFactRow> = {}): PlatformOrderFactRow {
  return {
    id: 'order-1',
    customer_id: 'customer-a',
    customer_contact: '+639171234567',
    status: 'delivered',
    payment_status: 'paid',
    outlet_id: null,
    total: 250,
    created_at: '2026-09-01T02:00:00.000Z',
    updated_at: '2026-09-01T03:00:00.000Z',
    source: null,
    ...overrides,
  }
}

describe('ledgerRowToFact', () => {
  it('carries lifecycle state through so an unfulfilled or cancelled row cannot qualify', () => {
    expect(isQualifiedOrderFact(ledgerRowToFact(ledgerRow()))).toBe(true)
    expect(isQualifiedOrderFact(ledgerRowToFact(ledgerRow({ status: 'preparing', completed_at: null })))).toBe(false)
    expect(isQualifiedOrderFact(ledgerRowToFact(ledgerRow({ status: 'cancelled' })))).toBe(false)
    expect(
      isQualifiedOrderFact(ledgerRowToFact(ledgerRow({ source: 'pos', status: 'confirmed', payment_status: 'pending' }))),
    ).toBe(false)
  })

  it('coerces a PostgREST numeric string rather than producing NaN', () => {
    const fact = ledgerRowToFact(ledgerRow({ total: '250.50' as unknown as number }))
    expect(fact.netTotal).toBe(250.5)
  })

  it('keeps the menu item id when the ledger recorded one', () => {
    const fact = ledgerRowToFact(
      ledgerRow({ items: [{ name: 'Latte', quantity: 2, menuItemId: 'menu-1' }] }),
    )
    expect(fact.items[0].menuItemId).toBe('menu-1')
  })

  it('falls back to ordered_at when the row never recorded a completion time', () => {
    const fact = ledgerRowToFact(ledgerRow({ completed_at: null }))
    expect(fact.completedAt).toBeNull()
    expect(fact.orderedAt).toBe('2026-09-01T02:00:00.000Z')
  })
})

describe('platformOrderToFact', () => {
  const items: PlatformOrderItemFactRow[] = [
    { menu_item_id: 'menu-1', menu_item_name: 'Latte', quantity: 2, price: '120.00' },
    { menu_item_id: null, menu_item_name: 'Deleted Item', quantity: 1, price: 90 },
  ]

  it('reads identity from customer_id and normalizes the contact to E.164', () => {
    const fact = platformOrderToFact(platformOrder({ customer_contact: '09171234567' }), items)
    expect(fact.customerId).toBe('customer-a')
    expect(fact.phoneE164).toBe('+639171234567')
  })

  it('leaves an anonymous walk-in unidentified instead of inventing a phone', () => {
    const fact = platformOrderToFact(platformOrder({ customer_id: null, customer_contact: 'walk-in' }), [])
    expect(fact.customerId).toBeNull()
    expect(fact.phoneE164).toBeNull()
  })

  it('treats a POS order as POS so it qualifies on payment, not on delivery', () => {
    const posOrder = platformOrder({ source: 'pos', status: 'confirmed', payment_status: 'paid' })
    const fact = platformOrderToFact(posOrder, [])
    expect(fact.source).toBe('pos')
    expect(isQualifiedOrderFact(fact)).toBe(true)
    expect(fact.completedAt).toBe(posOrder.updated_at)
  })

  it('preserves a nullable menu_item_id so a deleted item still ranks by name', () => {
    const fact = platformOrderToFact(platformOrder(), items)
    expect(fact.items).toEqual([
      { menuItemId: 'menu-1', name: 'Latte', quantity: 2, unitPrice: 120, baseUnitPrice: 120 },
      { menuItemId: null, name: 'Deleted Item', quantity: 1, unitPrice: 90, baseUnitPrice: 90 },
    ])

    const ranked = rankCustomerItems([fact])
    expect(ranked.map((item) => item.key)).toEqual(['id:menu-1', 'name:deleted item'])
  })

  it('dates the visit by completion, not by placement, once the order is delivered', () => {
    const fact = platformOrderToFact(platformOrder(), [])
    expect(fact.completedAt).toBe('2026-09-01T03:00:00.000Z')
  })

  it('leaves completedAt null while the order is still open', () => {
    const fact = platformOrderToFact(platformOrder({ status: 'preparing' }), [])
    expect(fact.completedAt).toBeNull()
    expect(isQualifiedOrderFact(fact)).toBe(false)
  })
})
