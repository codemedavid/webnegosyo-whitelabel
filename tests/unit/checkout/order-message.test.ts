import { buildOrderMessage } from '@/lib/checkout/order-message'
import { generateMessengerMessage } from '@/lib/cart-utils'
import type { CartItem, CustomerFormField, OrderType, PaymentMethod } from '@/types/database'

const items = [
  { id: 'l1', menu_item: { id: 'm1', name: 'Adobo', price: 100 }, selected_addons: [], quantity: 2, subtotal: 200 },
] as unknown as CartItem[]
const formFields = [
  { id: 'f1', field_name: 'customer_name', field_label: 'Name' },
] as unknown as CustomerFormField[]

describe('buildOrderMessage', () => {
  it('writes the same message the positional generator does', () => {
    const message = buildOrderMessage({
      items,
      bundleItems: [],
      tenantName: 'Acme',
      orderType: { id: 'd', name: 'Delivery', type: 'delivery' } as unknown as OrderType,
      customerData: { customer_name: 'Juan' },
      paymentMethod: { id: 'g', name: 'GCash', details: '0917' } as unknown as PaymentMethod,
      formFields,
      serviceChargeAmount: 12,
      scheduledForLabel: 'Sat 10:00 AM',
      deliveryFee: 0,
      discounts: [{ label: 'TEN', amount: 10, code: 'TEN' }],
    })

    expect(message).toBe(generateMessengerMessage(
      items,
      'Acme',
      { name: 'Delivery', type: 'delivery' },
      { customer_name: 'Juan' },
      { name: 'GCash', details: '0917' },
      [{ field_name: 'customer_name', field_label: 'Name' }],
      12,
      'Sat 10:00 AM',
      { bundleItems: [], deliveryFee: 0, discounts: [{ label: 'TEN', amount: 10, code: 'TEN' }] },
    ))
    expect(message).toContain('Delivery')
    expect(message).toContain('GCash')
  })

  it('passes nothing for a missing order type, method, zero service charge or ASAP', () => {
    const message = buildOrderMessage({
      items,
      bundleItems: [],
      tenantName: 'Acme',
      orderType: undefined,
      customerData: {},
      paymentMethod: { id: 'c', name: 'Cash', details: null } as unknown as PaymentMethod,
      formFields: [],
      serviceChargeAmount: 0,
      scheduledForLabel: null,
      deliveryFee: null,
      discounts: [],
    })

    expect(message).toBe(generateMessengerMessage(
      items, 'Acme', null, {}, { name: 'Cash', details: undefined }, [], undefined, undefined,
      { bundleItems: [], deliveryFee: null, discounts: [] },
    ))
  })
})
