import { describe, it, expect } from '@jest/globals'
import {
  normalizePhoneField,
  normalizeEmailField,
  normalizeTextField,
  normalizeCustomerFieldValue,
  normalizeCustomerData,
} from '@/lib/customer-field-normalization'
import type { CustomerFormField } from '@/types/database'

/**
 * The checkout write path must store every customer field in a canonical shape so
 * the customer database stays clean: PH phones as E.164, emails lowercased/trimmed,
 * names/addresses whitespace-collapsed. Normalization is driven by each field's
 * declared `field_type`, so the tenant can name the field anything.
 */

type Field = Pick<CustomerFormField, 'field_name' | 'field_type'>

describe('normalizePhoneField', () => {
  it('normalizes a local PH mobile number to E.164', () => {
    expect(normalizePhoneField('0917 123 4567')).toBe('+639171234567')
  })

  it('normalizes an already-E.164 number to itself (idempotent)', () => {
    expect(normalizePhoneField('+639171234567')).toBe('+639171234567')
  })

  it('normalizes a +63-with-spaces number', () => {
    expect(normalizePhoneField('+63 917 123 4567')).toBe('+639171234567')
  })

  it('preserves an unrecognizable number as a trimmed value rather than blanking it', () => {
    // A merchant must never LOSE a number the customer typed; if it cannot be
    // confidently made E.164, keep a cleaned copy so the order is still contactable.
    expect(normalizePhoneField('  123  ')).toBe('123')
  })

  it('returns empty string for blank input', () => {
    expect(normalizePhoneField('   ')).toBe('')
  })
})

describe('normalizeEmailField', () => {
  it('lowercases and trims an email', () => {
    expect(normalizeEmailField('  Ana.Cruz@GMAIL.com  ')).toBe('ana.cruz@gmail.com')
  })

  it('returns empty string for blank input', () => {
    expect(normalizeEmailField('  ')).toBe('')
  })
})

describe('normalizeTextField', () => {
  it('trims and collapses internal whitespace runs', () => {
    expect(normalizeTextField('  Juan    dela   Cruz ')).toBe('Juan dela Cruz')
  })

  it('collapses newlines and tabs in a multi-line address', () => {
    expect(normalizeTextField('123 Main St\n\tBrgy 5,   Manila')).toBe('123 Main St Brgy 5, Manila')
  })
})

describe('normalizeCustomerFieldValue', () => {
  it('routes phone type through phone normalization', () => {
    expect(normalizeCustomerFieldValue('09171234567', 'phone')).toBe('+639171234567')
  })

  it('routes email type through email normalization', () => {
    expect(normalizeCustomerFieldValue('  X@Y.COM ', 'email')).toBe('x@y.com')
  })

  it('routes text/textarea/select through whitespace collapse', () => {
    expect(normalizeCustomerFieldValue('  a   b ', 'text')).toBe('a b')
    expect(normalizeCustomerFieldValue('  a   b ', 'textarea')).toBe('a b')
    expect(normalizeCustomerFieldValue('  a   b ', 'select')).toBe('a b')
  })
})

describe('normalizeCustomerData', () => {
  const fields: Field[] = [
    { field_name: 'customer_name', field_type: 'text' },
    { field_name: 'customer_phone', field_type: 'phone' },
    { field_name: 'customer_email', field_type: 'email' },
    { field_name: 'delivery_address', field_type: 'textarea' },
  ]

  it('normalizes each field according to its declared type', () => {
    const raw = {
      customer_name: '  Ana   Cruz ',
      customer_phone: '0917 123 4567',
      customer_email: '  Ana@Example.COM ',
      delivery_address: '123  Main\nSt',
    }

    expect(normalizeCustomerData(raw, fields)).toEqual({
      customer_name: 'Ana Cruz',
      customer_phone: '+639171234567',
      customer_email: 'ana@example.com',
      delivery_address: '123 Main St',
    })
  })

  it('does not mutate the input object (immutability)', () => {
    const raw = { customer_phone: '0917 123 4567' }
    const copy = { ...raw }
    normalizeCustomerData(raw, [{ field_name: 'customer_phone', field_type: 'phone' }])
    expect(raw).toEqual(copy)
  })

  it('leaves keys that are not declared form fields untouched (lat/lng/scheduled_for)', () => {
    const raw = {
      customer_phone: '0917 123 4567',
      delivery_lat: '14.5995000',
      delivery_lng: '120.9842000',
      scheduled_for: '2026-07-25T10:00:00.000Z',
    }

    expect(normalizeCustomerData(raw, [{ field_name: 'customer_phone', field_type: 'phone' }])).toEqual({
      customer_phone: '+639171234567',
      delivery_lat: '14.5995000',
      delivery_lng: '120.9842000',
      scheduled_for: '2026-07-25T10:00:00.000Z',
    })
  })

  it('skips fields absent from the data map without inventing empty keys', () => {
    const raw = { customer_phone: '09171234567' }
    const result = normalizeCustomerData(raw, fields)
    expect(result).toEqual({ customer_phone: '+639171234567' })
    expect('customer_email' in result).toBe(false)
  })
})
