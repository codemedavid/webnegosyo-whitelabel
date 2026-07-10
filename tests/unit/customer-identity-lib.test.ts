import { describe, it, expect } from '@jest/globals'
import {
  resolveCustomerIdentity,
  resolveOrderContact,
  isIdentifiableContact,
  computeCustomerAggregate,
  type CustomerOrderInput,
} from '@/lib/customer-identity'

/**
 * The identity layer must recognize the same person across orders and derive a
 * profile from order history. These are the pure building blocks shared by both
 * the going-forward upsert and the idempotent backfill (Supabase side). The
 * convex-template keeps a parity-tested mirror.
 */
describe('resolveCustomerIdentity', () => {
  it('keys on the normalized phone from customer_data.customer_phone', () => {
    const id = resolveCustomerIdentity({
      name: 'Ana',
      contact: '0917 123 4567',
      customerData: { customer_phone: '09171234567', customer_name: 'Ana' },
    })
    expect(id.phoneE164).toBe('+639171234567')
    expect(id.identityKey).toBe('phone:+639171234567')
    expect(id.name).toBe('Ana')
  })

  it('falls back to the contact field when customer_data has no phone', () => {
    const id = resolveCustomerIdentity({ name: 'Bea', contact: '+63 917 123 4567' })
    expect(id.phoneE164).toBe('+639171234567')
    expect(id.identityKey).toBe('phone:+639171234567')
  })

  it('falls back to email when there is no usable phone', () => {
    const id = resolveCustomerIdentity({
      name: 'Carlo',
      customerData: { customer_email: 'Carlo@Example.COM ' },
    })
    expect(id.phoneE164).toBeNull()
    expect(id.email).toBe('carlo@example.com')
    expect(id.identityKey).toBe('email:carlo@example.com')
  })

  it('returns a null identity for anonymous walk-in / POS contacts', () => {
    expect(resolveCustomerIdentity({ contact: 'POS' }).identityKey).toBeNull()
    expect(resolveCustomerIdentity({ contact: 'walk-in' }).identityKey).toBeNull()
    expect(resolveCustomerIdentity({ name: 'Guest' }).identityKey).toBeNull()
  })
})

describe('resolveOrderContact', () => {
  it('stores the normalized E.164 phone from the standard field', () => {
    expect(resolveOrderContact({ customerData: { customer_phone: '0917 123 4567' } })).toBe(
      '+639171234567'
    )
  })

  it('resolves the phone even when the form field is named differently', () => {
    // This is the exact bug: tenant forms often name their phone field `phone`,
    // `mobile`, or `contact_number` instead of `customer_phone`, so the old
    // `customerData.customer_phone` read dropped the identity and every order
    // collapsed into one fake customer.
    expect(resolveOrderContact({ customerData: { contact_number: '09171234567' } })).toBe(
      '+639171234567'
    )
    expect(resolveOrderContact({ customerData: { mobile: '09171234567' } })).toBe(
      '+639171234567'
    )
  })

  it('two customers with different phones resolve to different contacts', () => {
    const a = resolveOrderContact({ customerData: { phone: '09171234567' } })
    const b = resolveOrderContact({ customerData: { phone: '09980001122' } })
    expect(a).not.toBe(b)
  })

  it('falls back to email when there is no phone', () => {
    expect(resolveOrderContact({ customerData: { customer_email: 'Ana@Example.com' } })).toBe(
      'ana@example.com'
    )
  })

  it('returns empty string for anonymous / walk-in orders (counted as walk-ins)', () => {
    expect(resolveOrderContact({ name: 'Guest' })).toBe('')
    expect(resolveOrderContact({ contact: 'POS' })).toBe('')
    expect(resolveOrderContact({ customerData: {} })).toBe('')
  })
})

describe('isIdentifiableContact', () => {
  it('accepts real phone/email contacts', () => {
    expect(isIdentifiableContact('09171234567')).toBe(true)
    expect(isIdentifiableContact('ana@example.com')).toBe(true)
  })

  it('rejects placeholders and blanks (case-insensitive)', () => {
    expect(isIdentifiableContact('POS')).toBe(false)
    expect(isIdentifiableContact('Walk-In')).toBe(false)
    expect(isIdentifiableContact('')).toBe(false)
    expect(isIdentifiableContact(undefined)).toBe(false)
  })
})

describe('computeCustomerAggregate', () => {
  const orders: CustomerOrderInput[] = [
    {
      total: 200,
      createdAt: '2026-01-10T08:00:00.000Z',
      channel: 'pickup',
      items: [{ name: 'Latte', quantity: 2 }],
      smsConsent: false,
    },
    {
      total: 100,
      createdAt: '2026-03-05T08:00:00.000Z',
      channel: 'delivery',
      items: [{ name: 'Latte', quantity: 1 }, { name: 'Muffin', quantity: 1 }],
      smsConsent: true,
    },
    {
      total: 300,
      createdAt: '2026-02-01T08:00:00.000Z',
      channel: 'pickup',
      items: [{ name: 'Muffin', quantity: 3 }],
    },
  ]

  it('recognizes a repeat customer and sums their spend', () => {
    const agg = computeCustomerAggregate(orders)
    expect(agg.orderCount).toBe(3)
    expect(agg.totalSpent).toBe(600)
    expect(agg.averageOrderValue).toBe(200)
  })

  it('derives first and last order timestamps regardless of input order', () => {
    const agg = computeCustomerAggregate(orders)
    expect(agg.firstOrderAt).toBe('2026-01-10T08:00:00.000Z')
    expect(agg.lastOrderAt).toBe('2026-03-05T08:00:00.000Z')
  })

  it('collects the distinct channels used, in first-seen order', () => {
    const agg = computeCustomerAggregate(orders)
    expect(agg.channelsUsed).toEqual(['pickup', 'delivery'])
  })

  it('ranks top ordered items by total quantity', () => {
    const agg = computeCustomerAggregate(orders)
    expect(agg.topItems).toEqual([
      { name: 'Muffin', quantity: 4 },
      { name: 'Latte', quantity: 3 },
    ])
  })

  it('rolls up SMS consent to true with the earliest consenting order time', () => {
    const agg = computeCustomerAggregate(orders)
    expect(agg.smsConsent).toBe(true)
    expect(agg.smsConsentAt).toBe('2026-03-05T08:00:00.000Z')
  })

  it('reports no consent when no order carried consent', () => {
    const agg = computeCustomerAggregate([
      { total: 50, createdAt: '2026-01-01T00:00:00.000Z', channel: 'dine_in' },
    ])
    expect(agg.smsConsent).toBe(false)
    expect(agg.smsConsentAt).toBeNull()
  })

  it('accepts epoch-millisecond timestamps (Convex _creationTime)', () => {
    const agg = computeCustomerAggregate([
      { total: 10, createdAt: Date.parse('2026-01-01T00:00:00.000Z'), channel: 'pickup' },
    ])
    expect(agg.firstOrderAt).toBe('2026-01-01T00:00:00.000Z')
    expect(agg.lastOrderAt).toBe('2026-01-01T00:00:00.000Z')
  })
})
