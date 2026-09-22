/**
 * The checkout fields a new order type starts with.
 *
 * Two things this pins:
 *
 *  - Dine-in now collects a phone number, and it is OPTIONAL. A seated customer
 *    is already in the room, so requiring one would block a walk-in who does not
 *    want to give it; but without the field at all, the kitchen has no way to
 *    call about a sold-out item and every loyalty surface that keys on a phone
 *    number stays empty for dine-in.
 *  - An order type created from the admin used to arrive with no fields at all,
 *    so checkout collected nothing and the merchant was given no hint of it.
 *
 * `supabase/migrations/20260922090000_dine_in_phone_field.sql` mirrors this for
 * the tenant-insert trigger, which cannot call TypeScript. Change both together.
 */

import { getDefaultFormFields } from '@/lib/order-types/default-form-fields'
import { ORDER_TYPE_KINDS } from '@/lib/order-types/order-type-kinds'
import { validateCheckoutFields } from '@/lib/checkout-field-validation'
import { normalizePhoneE164 } from '@/lib/phone'
import { resolveOrderContact } from '@/lib/customer-identity'

function findField(kind: Parameters<typeof getDefaultFormFields>[0], name: string) {
  return getDefaultFormFields(kind).find((field) => field.field_name === name)
}

describe('getDefaultFormFields — dine-in phone number', () => {
  it('collects a phone number', () => {
    expect(findField('dine_in', 'customer_phone')).toBeDefined()
  })

  it('never blocks a walk-in who will not give one', () => {
    expect(findField('dine_in', 'customer_phone')?.is_required).toBe(false)
  })

  it('stores it as a phone field so checkout renders the right keypad', () => {
    expect(findField('dine_in', 'customer_phone')?.field_type).toBe('phone')
  })

  it('keeps the name and table number the merchant already had', () => {
    const names = getDefaultFormFields('dine_in').map((field) => field.field_name)
    expect(names).toEqual(['customer_name', 'table_number', 'customer_phone'])
  })
})

describe('getDefaultFormFields — other kinds', () => {
  it('leaves delivery requiring a name, a number and an address', () => {
    expect(getDefaultFormFields('delivery')).toEqual([
      expect.objectContaining({ field_name: 'customer_name', is_required: true }),
      expect.objectContaining({ field_name: 'customer_phone', is_required: true }),
      expect.objectContaining({ field_name: 'delivery_address', is_required: true }),
    ])
  })

  it('gives an aggregator channel the counter set — someone still has to be called', () => {
    for (const kind of ['grab', 'foodpanda', 'other'] as const) {
      expect(getDefaultFormFields(kind).map((f) => f.field_name)).toEqual([
        'customer_name',
        'customer_phone',
      ])
    }
  })

  it('never leaves a kind with an empty checkout form', () => {
    for (const kind of ORDER_TYPE_KINDS) {
      expect(getDefaultFormFields(kind).length).toBeGreaterThan(0)
    }
  })

  it('numbers every field from zero so the form order is stable', () => {
    for (const kind of ORDER_TYPE_KINDS) {
      const indexes = getDefaultFormFields(kind).map((field) => field.order_index)
      expect(indexes).toEqual(indexes.map((_, position) => position))
    }
  })

  it('hands back a fresh copy each call, so a caller cannot mutate the defaults', () => {
    const first = getDefaultFormFields('dine_in')
    first[0].field_label = 'Mutated'
    expect(getDefaultFormFields('dine_in')[0].field_label).toBe('Full Name')
  })
})

/**
 * The seeded field is live on every existing dine-in order type, so "optional"
 * has to hold all the way down the checkout, not just in the admin: a walk-in
 * who leaves it blank must still be able to order, and the blank must not be
 * read as a contact.
 */
describe('a blank dine-in phone', () => {
  const seeded = getDefaultFormFields('dine_in').filter(
    (field) => field.field_name === 'customer_phone'
  )

  it('does not block checkout', () => {
    expect(validateCheckoutFields(seeded, { customer_phone: '' })).toEqual([])
    expect(validateCheckoutFields(seeded, {})).toEqual([])
  })

  it('is not stored as a phone number', () => {
    expect(normalizePhoneE164('')).toBeNull()
    expect(resolveOrderContact({ name: 'Ana', customerData: { customer_phone: '' } })).toBe('')
  })

  it('is still validated once the customer types something', () => {
    expect(validateCheckoutFields(seeded, { customer_phone: 'abc' }).length).toBeGreaterThan(0)
  })
})
