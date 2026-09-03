import { mapSupabaseOrderToReceipt, buildAdminReceiptText } from '@/lib/receipt-web'

/**
 * The web admin's "Print receipt" renders the same block layouts the thermal
 * printer uses, from the admin's own order shape (OrderWithItems). The mapper
 * is where a field mismatch would silently blank a receipt line, so it is
 * pinned field by field.
 */

const order = {
  id: 'ord-abcdef1234567890',
  tenant_id: 't1',
  status: 'ready',
  customer_name: 'Maria',
  customer_contact: '09171234567',
  order_type: 'Pickup',
  total: 250,
  delivery_fee: 50,
  payment_method_name: 'GCash',
  created_at: '2026-07-26T04:30:00.000Z',
  customer_data: {
    discount: {
      total: 0,
      deliveryDiscount: 0,
      lines: [],
      allocationsByLine: {},
    },
  },
  order_items: [
    {
      id: 'oi1',
      menu_item_name: 'Latte',
      variation: 'Large',
      addons: ['Oat milk'],
      quantity: 2,
      price: 100,
      subtotal: 200,
      special_instructions: 'Less ice',
    },
  ],
} as never

describe('mapSupabaseOrderToReceipt', () => {
  it('maps every printed field into the engine shape', () => {
    const mapped = mapSupabaseOrderToReceipt(order)
    expect(mapped._id).toBe('ord-abcdef1234567890')
    expect(mapped._creationTime).toBe(Date.parse('2026-07-26T04:30:00.000Z'))
    expect(mapped.customerName).toBe('Maria')
    expect(mapped.customerContact).toBe('09171234567')
    expect(mapped.orderType).toBe('Pickup')
    expect(mapped.total).toBe(250)
    expect(mapped.deliveryFee).toBe(50)
    expect(mapped.paymentMethod).toBe('GCash')
    expect(mapped.items).toEqual([
      {
        menuItemName: 'Latte',
        quantity: 2,
        subtotal: 200,
        variation: 'Large',
        addons: [{ name: 'Oat milk', price: 0 }],
        specialInstructions: 'Less ice',
      },
    ])
    expect(mapped.customerData).toBe((order as { customer_data: unknown }).customer_data)
  })
})

describe('buildAdminReceiptText', () => {
  it('renders a printable Classic receipt from an admin order', () => {
    const text = buildAdminReceiptText(order, 'Kape Co', null)
    expect(text).toContain('KAPE CO')
    expect(text).toContain('Latte')
    expect(text).toContain('- Large')
    expect(text).toContain('+ Oat milk')
    expect(text).toContain('P250.00')
    expect(text).toContain('Payment: GCash')
  })

  it('honours a saved tenant layout the same way the app printer does', () => {
    const text = buildAdminReceiptText(order, 'Kape Co', {
      version: 1,
      blocks: [{ kind: 'businessName' }, { kind: 'itemsSummary' }],
    })
    expect(text).toContain('KAPE CO')
    expect(text).toContain('Items: 2')
    expect(text).not.toContain('Latte')
  })
})

describe('mapSupabaseOrderToReceipt — the service charge column', () => {
  /**
   * `orders.service_charge_amount` has been populated by web checkout since
   * the order-types migration, and the admin's order detail dialog already
   * reads it. The receipt mapper dropped it, so the browser's printed copy of
   * an order showed items that did not add up to its own total.
   */
  it('maps the stored charge onto the engine shape', () => {
    const mapped = mapSupabaseOrderToReceipt({
      ...(order as object),
      service_charge_amount: 24,
    } as never)

    expect(mapped.serviceCharge).toBe(24)
  })

  it('leaves it undefined when the column is NULL', () => {
    // An unserviced order must not print a P0.00 row.
    const mapped = mapSupabaseOrderToReceipt({
      ...(order as object),
      service_charge_amount: null,
    } as never)

    expect(mapped.serviceCharge).toBeUndefined()
  })

  it('prints the charge on the rendered receipt', () => {
    // The mapping is only worth having if it reaches paper.
    const text = buildAdminReceiptText(
      { ...(order as object), total: 274, service_charge_amount: 24 } as never,
      'Kape Co',
      null,
    )

    expect(text).toContain('Service Charge:')
  })
})
