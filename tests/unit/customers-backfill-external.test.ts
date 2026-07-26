import { describe, it, expect } from '@jest/globals'
import {
  mapConvexOrderToExternalInput,
  groupConvexItemsByOrder,
  type ConvexOrderRow,
  type ConvexOrderItemRow,
} from '@/lib/customers-backfill-external'

function order(overrides: Partial<ConvexOrderRow> = {}): ConvexOrderRow {
  return {
    _id: 'k17abc',
    _creationTime: Date.parse('2026-03-01T10:00:00.000Z'),
    customerName: 'Ana Cruz',
    customerContact: '+639171234567',
    customerData: null,
    total: 450,
    orderType: 'Pickup',
    status: 'delivered',
    ...overrides,
  }
}

describe('groupConvexItemsByOrder', () => {
  it('buckets line items under their order id', () => {
    const items: ConvexOrderItemRow[] = [
      { orderId: 'k1', menuItemName: 'Latte', quantity: 2 },
      { orderId: 'k2', menuItemName: 'Croissant', quantity: 1 },
      { orderId: 'k1', menuItemName: 'Croissant', quantity: 3 },
    ]

    const grouped = groupConvexItemsByOrder(items)

    expect(grouped.get('k1')).toEqual([
      { name: 'Latte', quantity: 2 },
      { name: 'Croissant', quantity: 3 },
    ])
    expect(grouped.get('k2')).toEqual([{ name: 'Croissant', quantity: 1 }])
  })

  it('drops items with no menu item name', () => {
    const grouped = groupConvexItemsByOrder([
      { orderId: 'k1', menuItemName: '', quantity: 2 },
      { orderId: 'k1', menuItemName: 'Latte', quantity: 1 },
    ])

    expect(grouped.get('k1')).toEqual([{ name: 'Latte', quantity: 1 }])
  })
})

describe('mapConvexOrderToExternalInput', () => {
  it('maps a Convex order onto the external capture input', () => {
    const input = mapConvexOrderToExternalInput(order(), [{ name: 'Latte', quantity: 2 }])

    expect(input).toEqual({
      backend: 'convex',
      externalOrderId: 'k17abc',
      name: 'Ana Cruz',
      contact: '+639171234567',
      customerData: null,
      total: 450,
      createdAt: Date.parse('2026-03-01T10:00:00.000Z'),
      channel: 'Pickup',
      items: [{ name: 'Latte', quantity: 2 }],
    })
  })

  it('carries customerData through so a legacy blank contact can still be resolved', () => {
    const input = mapConvexOrderToExternalInput(
      order({ customerContact: '', customerData: { customer_phone: '09171234567' } }),
      []
    )

    expect(input.contact).toBe('')
    expect(input.customerData).toEqual({ customer_phone: '09171234567' })
  })

  it('defaults a missing order type to no channel', () => {
    const input = mapConvexOrderToExternalInput(order({ orderType: undefined }), [])

    expect(input.channel).toBeNull()
  })
})
