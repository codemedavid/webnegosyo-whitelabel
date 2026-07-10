import {
  resolveAnalyticsContact,
  isIdentifiableCustomer,
  customerKey,
} from '../../convex-template/convex/customerIdentity'

/**
 * Phase 2 read-side hardening for the Growth "1 customer" bug.
 *
 * `getCustomerInsights` groups Convex orders by their stored `customerContact`.
 * Legacy orders (written before the Phase 1 write-path fix) often have a blank
 * or placeholder `customerContact` while the real phone lives in `customerData`
 * under a tenant-specific field name. Cross-channel orders also stored the phone
 * in different formats (raw `09...` vs web E.164 `+639...`).
 *
 * `resolveAnalyticsContact(contact, customerData)` must produce ONE canonical
 * grouping key per real person so historical + cross-channel orders join up,
 * and must return '' for genuinely anonymous orders so they never collapse into
 * a single phantom customer.
 */
describe('resolveAnalyticsContact', () => {
  it('returns the E.164 phone already stored on customerContact (web orders)', () => {
    expect(resolveAnalyticsContact('+639171234567', undefined)).toBe('+639171234567')
  })

  it('normalizes a legacy raw phone in customerContact to E.164 so it groups with web orders', () => {
    // Same person, checked out on mobile before the fix (raw local format).
    expect(resolveAnalyticsContact('09171234567', undefined)).toBe('+639171234567')
    expect(resolveAnalyticsContact('9171234567', undefined)).toBe('+639171234567')
  })

  it('resolves the phone from customerData when customerContact is blank (legacy bug)', () => {
    // Tenant form named the phone field "contact_number", so it landed in
    // customerData and customerContact was left empty.
    expect(
      resolveAnalyticsContact('', { contact_number: '0917 123 4567', customer_name: 'Ana' })
    ).toBe('+639171234567')
  })

  it('recovers a real phone even when customerContact is a placeholder', () => {
    // Order looks like a walk-in ("POS") but actually captured a phone.
    expect(
      resolveAnalyticsContact('POS', { mobile: '09171234567' })
    ).toBe('+639171234567')
  })

  it('keeps two different phone numbers as two distinct customers', () => {
    const a = resolveAnalyticsContact('+639171234567', undefined)
    const b = resolveAnalyticsContact('09181234567', undefined)
    expect(a).not.toBe(b)
    expect(b).toBe('+639181234567')
  })

  it('falls back to a lowercased email when no phone is present', () => {
    expect(resolveAnalyticsContact('Ana@Example.com', undefined)).toBe('ana@example.com')
    expect(
      resolveAnalyticsContact('', { customer_email: 'Bob@Example.COM' })
    ).toBe('bob@example.com')
  })

  it('prefers phone over email when both are present', () => {
    expect(
      resolveAnalyticsContact('', { email: 'x@y.com', phone: '09171234567' })
    ).toBe('+639171234567')
  })

  it('returns "" for genuinely anonymous orders so they are counted as walk-ins, not one phantom customer', () => {
    expect(resolveAnalyticsContact('', undefined)).toBe('')
    expect(resolveAnalyticsContact('POS', undefined)).toBe('')
    expect(resolveAnalyticsContact('walk-in', {})).toBe('')
    expect(resolveAnalyticsContact('', { customer_name: 'Guest' })).toBe('')
  })

  it('handles malformed customerData without throwing', () => {
    expect(resolveAnalyticsContact('', null)).toBe('')
    expect(resolveAnalyticsContact('', 'not-an-object')).toBe('')
    expect(resolveAnalyticsContact('', 42)).toBe('')
  })

  it('keeps a non-PH / non-phone identifiable contact stable as its own key', () => {
    // Not a PH phone and not an email, but still an identifiable string.
    const key = resolveAnalyticsContact('+14155551234', undefined)
    expect(key).toBe('+14155551234')
    expect(resolveAnalyticsContact('+14155551234', undefined)).toBe(key)
  })
})

// Sanity: existing helpers still behave (no regression from the additions).
describe('customerIdentity existing helpers', () => {
  it('customerKey lowercases and trims', () => {
    expect(customerKey('  +639171234567 ')).toBe('+639171234567')
  })

  it('isIdentifiableCustomer rejects placeholders and blanks', () => {
    expect(isIdentifiableCustomer('POS')).toBe(false)
    expect(isIdentifiableCustomer('')).toBe(false)
    expect(isIdentifiableCustomer(undefined)).toBe(false)
    expect(isIdentifiableCustomer('+639171234567')).toBe(true)
  })
})
