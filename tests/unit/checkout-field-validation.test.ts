import { describe, it, expect } from '@jest/globals'
import {
  validateCheckoutFields,
  type ValidatableField,
} from '@/lib/checkout-field-validation'

function field(overrides: Partial<ValidatableField> = {}): ValidatableField {
  return {
    field_name: 'customer_phone',
    field_label: 'Phone Number',
    field_type: 'phone',
    is_required: true,
    ...overrides,
  }
}

describe('validateCheckoutFields — required fields', () => {
  it('reports a required field left blank', () => {
    const errors = validateCheckoutFields([field({ field_type: 'text', field_label: 'Full Name' })], {})

    expect(errors).toEqual([
      { fieldName: 'customer_phone', message: 'Full Name is required' },
    ])
  })

  it('treats a whitespace-only value as blank', () => {
    const errors = validateCheckoutFields([field({ field_type: 'text' })], {
      customer_phone: '   ',
    })

    expect(errors).toHaveLength(1)
  })

  it('accepts an optional field left blank without checking its format', () => {
    const errors = validateCheckoutFields([field({ is_required: false })], { customer_phone: '' })

    expect(errors).toEqual([])
  })
})

describe('validateCheckoutFields — phone format', () => {
  // The regression that lost real customers: a phone number the storefront
  // accepted but the identity layer could not normalize, so the order was saved
  // and the customer silently never appeared in the Customers list.
  it('rejects a number that cannot be normalized to a PH mobile', () => {
    const errors = validateCheckoutFields([field()], { customer_phone: '0987654322' })

    expect(errors).toEqual([
      {
        fieldName: 'customer_phone',
        message: 'Phone Number doesn’t look like a valid mobile number (example: 09171234567)',
      },
    ])
  })

  it.each([
    ['09171234567', 'local trunk-prefixed'],
    ['+639171234567', 'already E.164'],
    ['639171234567', 'country code, no plus'],
    ['0917 123 4567', 'spaced'],
    ['0917-123-4567', 'dashed'],
    ['  09171234567  ', 'padded'],
  ])('accepts %s (%s)', (value) => {
    expect(validateCheckoutFields([field()], { customer_phone: value })).toEqual([])
  })

  it('rejects a junk placeholder number', () => {
    const errors = validateCheckoutFields([field()], { customer_phone: '000000' })

    expect(errors).toHaveLength(1)
  })

  it('validates an optional phone that WAS filled in', () => {
    const errors = validateCheckoutFields([field({ is_required: false })], {
      customer_phone: '123',
    })

    expect(errors).toHaveLength(1)
  })
})

describe('validateCheckoutFields — email format', () => {
  it('rejects a malformed email', () => {
    const errors = validateCheckoutFields(
      [field({ field_name: 'email_address', field_label: 'Email Address', field_type: 'email' })],
      { email_address: 'ana@' }
    )

    expect(errors).toEqual([
      {
        fieldName: 'email_address',
        message: 'Email Address doesn’t look like a valid email address',
      },
    ])
  })

  it('accepts a valid email', () => {
    const errors = validateCheckoutFields(
      [field({ field_name: 'email_address', field_type: 'email' })],
      { email_address: 'ana@example.com' }
    )

    expect(errors).toEqual([])
  })
})

describe('validateCheckoutFields — other field types', () => {
  it('does not format-check free text or addresses', () => {
    const errors = validateCheckoutFields(
      [
        field({ field_name: 'table_number', field_label: 'Table Number', field_type: 'text' }),
        field({ field_name: 'delivery_address', field_label: 'Address', field_type: 'textarea' }),
      ],
      { table_number: '1', delivery_address: 'anything at all' }
    )

    expect(errors).toEqual([])
  })

  it('reports every problem at once rather than stopping at the first', () => {
    const errors = validateCheckoutFields(
      [
        field({ field_name: 'customer_name', field_label: 'Full Name', field_type: 'text' }),
        field(),
      ],
      { customer_phone: '123' }
    )

    expect(errors.map((e) => e.fieldName)).toEqual(['customer_name', 'customer_phone'])
  })
})
