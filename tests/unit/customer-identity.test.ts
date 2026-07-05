/**
 * Customer identity rule for analytics (convex-template).
 *
 * Bug this locks down: anonymous POS walk-in orders all share a placeholder
 * contact ("POS", "walk-in", blank…), so getCustomerInsights collapsed them
 * into one fake "customer" and counted it alongside real customers —
 * inflating totalCustomers and skewing spend-per-customer.
 */
import {
  isIdentifiableCustomer,
  customerKey,
} from '../../convex-template/convex/customerIdentity'

describe('isIdentifiableCustomer', () => {
  it('accepts a real phone contact', () => {
    expect(isIdentifiableCustomer('09171234567')).toBe(true)
  })

  it('accepts an email or messenger-style contact', () => {
    expect(isIdentifiableCustomer('ana@example.com')).toBe(true)
    expect(isIdentifiableCustomer('m.me/ana.reyes')).toBe(true)
  })

  it('rejects blank or whitespace contacts', () => {
    expect(isIdentifiableCustomer('')).toBe(false)
    expect(isIdentifiableCustomer('   ')).toBe(false)
    expect(isIdentifiableCustomer(undefined)).toBe(false)
  })

  it('rejects POS/walk-in placeholder contacts regardless of case', () => {
    expect(isIdentifiableCustomer('POS')).toBe(false)
    expect(isIdentifiableCustomer('pos')).toBe(false)
    expect(isIdentifiableCustomer('Walk-in')).toBe(false)
    expect(isIdentifiableCustomer('walkin')).toBe(false)
  })

  it('rejects generic not-applicable placeholders', () => {
    expect(isIdentifiableCustomer('N/A')).toBe(false)
    expect(isIdentifiableCustomer('na')).toBe(false)
    expect(isIdentifiableCustomer('none')).toBe(false)
    expect(isIdentifiableCustomer('unknown')).toBe(false)
    expect(isIdentifiableCustomer('-')).toBe(false)
  })
})

describe('customerKey', () => {
  it('normalizes case and whitespace so the same person groups together', () => {
    expect(customerKey(' 0917-123-4567 ')).toBe('0917-123-4567')
    expect(customerKey('Ana@Example.com')).toBe('ana@example.com')
  })
})
