import { buildQrOrderPayload, type QrOrderPayloadInput } from '@/lib/checkout/qr-handoff-payload'
import type { CartItem, OrderType, PaymentMethod } from '@/types/database'

const plainItem = {
  id: 'line-1',
  menu_item: { id: 'adobo', name: 'Adobo', price: 150 },
  selected_addons: [],
  quantity: 2,
  subtotal: 300,
} as unknown as CartItem

const configuredItem = {
  id: 'line-2',
  menu_item: { id: 'silog', name: 'Tapsilog', price: 120 },
  selected_variation: { id: 'opt-large', name: 'Large', price_modifier: 30 },
  selected_addons: [],
  quantity: 1,
  subtotal: 150,
} as unknown as CartItem

const BASE: QrOrderPayloadInput = {
  cid: 'cid-1',
  createdAt: 1_700_000_000_000,
  tenantId: 'tenant-1',
  tenantSlug: 'acme',
  orderTypeId: 'pickup-id',
  orderType: { id: 'pickup-id', type: 'pickup', name: 'Pick up' } as unknown as OrderType,
  customerData: { customer_name: 'Juan', customer_phone: '+639171234567' },
  items: [plainItem],
  bundleItems: [],
  total: 300,
  paymentMethod: null,
  scheduledForISO: null,
  scheduledForLabel: null,
  paymentProof: { url: '', publicId: '', reference: '' },
}

describe('buildQrOrderPayload', () => {
  it('describes an ASAP order with no payment method', () => {
    expect(buildQrOrderPayload(BASE)).toEqual({
      v: 1,
      cid: 'cid-1',
      t: 1_700_000_000_000,
      tenantId: 'tenant-1',
      tenantSlug: 'acme',
      orderTypeId: 'pickup-id',
      orderType: 'pickup',
      customerName: 'Juan',
      customerContact: '+639171234567',
      customerData: { customer_name: 'Juan', customer_phone: '+639171234567' },
      items: [
        { menuItemId: 'adobo', menuItemName: 'Adobo', quantity: 2, price: 150, basePrice: 150, subtotal: 300, optionIds: [], addonIds: [] },
      ],
      total: 300,
    })
  })

  it('names the payment method, the schedule and the proof the customer gave', () => {
    const payload = buildQrOrderPayload({
      ...BASE,
      paymentMethod: { id: 'gcash', name: 'GCash' } as unknown as PaymentMethod,
      scheduledForISO: '2026-10-10T02:00:00.000Z',
      scheduledForLabel: 'Sat 10:00 AM',
      paymentProof: { url: '', publicId: '', reference: 'REF-1' },
    })

    expect(payload).toEqual(expect.objectContaining({
      paymentMethodId: 'gcash',
      paymentMethod: 'GCash',
      scheduledFor: '2026-10-10T02:00:00.000Z',
      scheduledForLabel: 'Sat 10:00 AM',
    }))
    expect(payload.customerData).toEqual(expect.objectContaining({
      scheduled_for: '2026-10-10T02:00:00.000Z',
      scheduled_for_label: 'Sat 10:00 AM',
      payment_proof_reference: 'REF-1',
    }))
  })

  it('omits a blank schedule label from the top level but keeps it in customer data', () => {
    const payload = buildQrOrderPayload({ ...BASE, scheduledForISO: '2026-10-10T02:00:00.000Z' })

    expect(payload).not.toHaveProperty('scheduledForLabel')
    expect(payload.customerData).toEqual(expect.objectContaining({ scheduled_for_label: '' }))
  })

  it('snapshots the selected option ids so the scanner can spend inventory', () => {
    const payload = buildQrOrderPayload({ ...BASE, items: [configuredItem] })

    expect(payload.customerData).toHaveProperty('_inventory_selections')
  })

  it('falls back to the order type name, then to blank', () => {
    expect(buildQrOrderPayload({ ...BASE, orderType: { id: 'x', name: 'Counter' } as unknown as OrderType }).orderType).toBe('Counter')
    expect(buildQrOrderPayload({ ...BASE, orderType: undefined }).orderType).toBe('')
  })
})
