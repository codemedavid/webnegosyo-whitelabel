import { buildCompletedOrderSnapshot, toFormFieldsMeta } from '@/lib/checkout/completed-order'
import type { CartItem, CustomerFormField, PaymentMethod } from '@/types/database'

const FIELDS = [
  { id: 'f1', field_name: 'customer_name', field_label: 'Name', field_type: 'text', is_required: true },
  { id: 'f2', field_name: 'customer_phone', field_label: 'Phone', field_type: 'phone', is_required: false },
] as unknown as CustomerFormField[]

describe('toFormFieldsMeta', () => {
  it('keeps only the name and label of each field, in order', () => {
    expect(toFormFieldsMeta(FIELDS)).toEqual([
      { field_name: 'customer_name', field_label: 'Name' },
      { field_name: 'customer_phone', field_label: 'Phone' },
    ])
  })
})

describe('buildCompletedOrderSnapshot', () => {
  const items = [{ id: 'l1', subtotal: 100 }] as unknown as CartItem[]
  const discounts = [{ code: 'TEN', label: 'TEN', amount: 10 }]
  const customerData = { customer_name: 'Juan' }
  const method = { id: 'gcash', name: 'GCash', details: '0917' } as unknown as PaymentMethod

  const input = {
    items,
    total: 100,
    deliveryFee: 0,
    serviceChargeAmount: 5,
    discounts,
    customerData,
    orderTypeName: 'Pickup',
    scheduledForLabel: null,
    paymentMethod: method,
    messengerMessage: 'msg',
    messengerUrl: null,
    formFields: FIELDS,
  }

  it('records what the confirmation screen re-derives the total from', () => {
    expect(buildCompletedOrderSnapshot(input)).toEqual({
      items,
      total: 100,
      deliveryFee: 0,
      serviceChargeAmount: 5,
      discounts,
      customerData,
      orderTypeName: 'Pickup',
      scheduledForLabel: null,
      paymentMethodName: 'GCash',
      paymentMethodDetails: '0917',
      messengerMessage: 'msg',
      messengerUrl: '',
      formFields: [
        { field_name: 'customer_name', field_label: 'Name' },
        { field_name: 'customer_phone', field_label: 'Phone' },
      ],
    })
  })

  it('copies the lists and the customer data, so clearing the cart cannot reach it', () => {
    const snapshot = buildCompletedOrderSnapshot(input)

    expect(snapshot.items).not.toBe(items)
    expect(snapshot.discounts).not.toBe(discounts)
    expect(snapshot.customerData).not.toBe(customerData)
  })

  it('names no payment method when none was chosen', () => {
    const snapshot = buildCompletedOrderSnapshot({ ...input, paymentMethod: null })

    expect(snapshot.paymentMethodName).toBeNull()
    expect(snapshot.paymentMethodDetails).toBeNull()
  })
})
