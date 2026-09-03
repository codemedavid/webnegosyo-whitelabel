/**
 * Web admin twin of the merchant app's guest fallback. A checkout that left the
 * name field empty stores `customer_name = NULL`; the admin cards used to hide
 * the whole Customer row, so an order with no name had no identity at all.
 */
import { displayCustomerName, GUEST_CUSTOMER_NAME } from '@/lib/order-display-name'

describe('displayCustomerName', () => {
  it('returns the trimmed captured name', () => {
    expect(displayCustomerName(' Juan Dela Cruz ')).toBe('Juan Dela Cruz')
  })

  it('falls back to Guest when the name is missing or blank', () => {
    expect(displayCustomerName(null)).toBe('Guest')
    expect(displayCustomerName(undefined)).toBe('Guest')
    expect(displayCustomerName('')).toBe('Guest')
    expect(displayCustomerName('  ')).toBe('Guest')
    expect(GUEST_CUSTOMER_NAME).toBe('Guest')
  })
})
