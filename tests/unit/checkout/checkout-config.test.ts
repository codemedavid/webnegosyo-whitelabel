import {
  carryOverCustomerData,
  formFieldsForOrderType,
  groupFormFieldsByOrderType,
  groupPaymentMethodsByOrderType,
  paymentMethodsForOrderType,
  reconcilePaymentSelection,
  type PaymentMethodWithLinks,
} from '@/lib/checkout/checkout-config'
import type { CustomerFormField, PaymentMethod } from '@/types/database'

const field = (id: string, orderTypeId: string, fieldName: string): CustomerFormField =>
  ({ id, order_type_id: orderTypeId, field_name: fieldName, field_label: fieldName }) as unknown as CustomerFormField

const method = (id: string, orderTypeIds: string[]): PaymentMethodWithLinks =>
  ({
    id,
    name: id,
    payment_method_order_types: orderTypeIds.map((order_type_id) => ({ order_type_id })),
  }) as unknown as PaymentMethodWithLinks

describe('groupFormFieldsByOrderType', () => {
  it('groups fields under their order type and keeps the merchant order', () => {
    // Arrange
    const fields = [field('f1', 'pickup', 'name'), field('f2', 'delivery', 'name'), field('f3', 'pickup', 'phone')]

    // Act
    const groups = groupFormFieldsByOrderType(fields)

    // Assert
    expect(groups.pickup.map((f) => f.id)).toEqual(['f1', 'f3'])
    expect(groups.delivery.map((f) => f.id)).toEqual(['f2'])
  })
})

describe('groupPaymentMethodsByOrderType', () => {
  it('lists a method under every order type it is linked to, in input order', () => {
    const groups = groupPaymentMethodsByOrderType([
      method('cash', ['pickup', 'delivery']),
      method('gcash', ['delivery']),
    ])

    expect(groups.pickup.map((m) => m.id)).toEqual(['cash'])
    expect(groups.delivery.map((m) => m.id)).toEqual(['cash', 'gcash'])
  })

  it('drops the embedded link rows from the page payload', () => {
    const groups = groupPaymentMethodsByOrderType([method('cash', ['pickup'])])

    expect(groups.pickup[0]).not.toHaveProperty('payment_method_order_types')
  })

  it('ignores a method with no links and duplicate or null link rows', () => {
    const duplicated = {
      id: 'card',
      payment_method_order_types: [{ order_type_id: 'pickup' }, { order_type_id: 'pickup' }, { order_type_id: null }],
    } as unknown as PaymentMethodWithLinks

    const groups = groupPaymentMethodsByOrderType([method('unlinked', []), duplicated])

    expect(groups).toEqual({ pickup: [{ id: 'card' }] })
  })
})

describe('per-order-type lookups', () => {
  const config = {
    formFieldsByOrderType: { pickup: [field('f1', 'pickup', 'name')] },
    paymentMethodsByOrderType: { pickup: [{ id: 'cash' } as PaymentMethod] },
  }

  it('returns the order type’s own lists', () => {
    expect(formFieldsForOrderType(config, 'pickup')).toHaveLength(1)
    expect(paymentMethodsForOrderType(config, 'pickup')).toHaveLength(1)
  })

  it('returns the SAME empty array for a missing or unknown order type, so effects keyed on it stay quiet', () => {
    expect(formFieldsForOrderType(config, null)).toBe(formFieldsForOrderType(config, 'another-store'))
    expect(paymentMethodsForOrderType(config, null)).toBe(paymentMethodsForOrderType(config, 'another-store'))
  })
})

describe('carryOverCustomerData', () => {
  it('keeps what the customer typed into fields the new form shares, and blanks the rest', () => {
    const deliveryForm = [field('f1', 'delivery', 'customer_name'), field('f2', 'delivery', 'delivery_address')]

    const next = carryOverCustomerData(deliveryForm, { customer_name: 'Ana', table_number: '4' })

    expect(next).toEqual({ customer_name: 'Ana', delivery_address: '' })
  })
})

describe('reconcilePaymentSelection', () => {
  const cash = { id: 'cash' } as PaymentMethod
  const gcash = { id: 'gcash' } as PaymentMethod

  it('keeps a choice the list still offers', () => {
    expect(reconcilePaymentSelection([cash, gcash], 'gcash')).toBe('gcash')
  })

  it('drops a choice the new order type does not offer', () => {
    expect(reconcilePaymentSelection([cash, { id: 'card' } as PaymentMethod], 'gcash')).toBeNull()
  })

  it('preselects a sole method', () => {
    expect(reconcilePaymentSelection([cash], null)).toBe('cash')
    expect(reconcilePaymentSelection([cash], 'gcash')).toBe('cash')
  })

  it('selects nothing from an empty list', () => {
    expect(reconcilePaymentSelection([], 'cash')).toBeNull()
  })
})
