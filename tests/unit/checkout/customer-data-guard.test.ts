import { describe, it, expect } from '@jest/globals'
import {
  MAX_CUSTOMER_DATA_JSON_LENGTH,
  MAX_CUSTOMER_DATA_STRING_LENGTH,
  SERVER_OWNED_CUSTOMER_DATA_KEYS,
  sanitizeCustomerData,
} from '@/lib/checkout/customer-data-guard'

/**
 * `customerData` is the browser's blob, but the server also writes into the
 * same envelope — presell claims, the voucher breakdown, the inventory
 * snapshot, payment proof on Convex. A key the server reads back later must
 * never be accepted from the browser: a forged `presell_claim_id` +
 * `presell_lines` on a cheap order, then cancelled, used to decrement
 * `sold_qty` for claims that never existed and inflate a date's allocation.
 */

describe('sanitizeCustomerData — server-owned keys', () => {
  it.each([...SERVER_OWNED_CUSTOMER_DATA_KEYS])('strips %s', (key) => {
    const result = sanitizeCustomerData({ customer_name: 'Ana', [key]: 'forged' })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data).toEqual({ customer_name: 'Ana' })
  })

  it('covers the presell, discount and inventory keys specifically', () => {
    expect(SERVER_OWNED_CUSTOMER_DATA_KEYS).toEqual(
      expect.arrayContaining([
        'presell_date',
        'presell_claim_id',
        'presell_lines',
        'discount',
        '_inventory_selections',
        'payment_proof_url',
      ])
    )
  })

  it('keeps everything the checkout form legitimately sends', () => {
    const submitted = {
      customer_name: 'Ana',
      customer_phone: '+639171234567',
      delivery_address: '1 Rizal St',
      delivery_lat: 14.5,
      delivery_lng: '121.0',
      messenger_psid: '123',
      scheduled_for: '2026-12-24T02:00:00.000Z',
      scheduled_for_label: 'Dec 24, 10:00 AM',
      sms_consent: true,
      sms_consent_at: null,
      table_number: '7',
    }

    const result = sanitizeCustomerData(submitted)

    expect(result).toEqual({ ok: true, data: submitted })
  })

  it('never mutates the submitted object', () => {
    const submitted = { customer_name: 'Ana', discount: { total: 999 } }
    sanitizeCustomerData(submitted)

    expect(submitted).toEqual({ customer_name: 'Ana', discount: { total: 999 } })
  })
})

describe('sanitizeCustomerData — size bounds', () => {
  it('passes undefined and null through as no data', () => {
    expect(sanitizeCustomerData(undefined)).toEqual({ ok: true, data: undefined })
    expect(sanitizeCustomerData(null)).toEqual({ ok: true, data: undefined })
  })

  it('truncates an over-long string rather than refusing the order', () => {
    const result = sanitizeCustomerData({ notes: 'x'.repeat(MAX_CUSTOMER_DATA_STRING_LENGTH + 500) })

    expect(result.ok).toBe(true)
    if (result.ok) expect((result.data?.notes as string).length).toBe(MAX_CUSTOMER_DATA_STRING_LENGTH)
  })

  it('refuses a blob over the JSON size cap', () => {
    const huge = Object.fromEntries(
      Array.from({ length: 60 }, (_, i) => [`f${i}`, 'y'.repeat(MAX_CUSTOMER_DATA_STRING_LENGTH)])
    )
    expect(JSON.stringify(huge).length).toBeGreaterThan(MAX_CUSTOMER_DATA_JSON_LENGTH)

    expect(sanitizeCustomerData(huge).ok).toBe(false)
  })

  it('refuses a non-object', () => {
    expect(sanitizeCustomerData('hello').ok).toBe(false)
    expect(sanitizeCustomerData([1, 2]).ok).toBe(false)
  })

  it('drops prototype-polluting keys', () => {
    const result = sanitizeCustomerData(JSON.parse('{"__proto__": {"admin": true}, "customer_name": "Ana"}'))

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(Object.keys(result.data ?? {})).toEqual(['customer_name'])
    expect(({} as Record<string, unknown>).admin).toBeUndefined()
  })
})
