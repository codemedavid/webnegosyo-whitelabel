import { describe, it, expect } from '@jest/globals'
import { resolveCustomerIdentity, resolveOrderContact } from '@/lib/customer-identity'
import { resolveCheckoutLoyaltyPhone } from '@/lib/loyalty/checkout-phone'

/**
 * A merchant names their own checkout fields, so the phone a customer typed can
 * land in `customer_data` under any label — "Contact Number", "Phone number",
 * "Mobile Number", "phone_number". Identity resolution used to recognize four
 * hard-coded keys, so for those stores the order was stored with a blank
 * contact and the tracking page kept asking a customer who had already given
 * their number to "Add your number to this order".
 *
 * The declared field type is the authority; a key whose NAME reads like a
 * contact field is the fallback for stores that typed their phone field as
 * plain text or number.
 */
describe('tenant-named contact fields', () => {
  const namedPhoneFields: Array<[string, string]> = [
    ['Contact Number', '09171234567'],
    ['Contact number', '0917 123 4567'],
    ['Phone number', '09171234567'],
    ['Phone Number', '+639171234567'],
    ['Mobile Number', '09171234567'],
    ['phone_number', '09171234567'],
    ['Cellphone number', '09171234567'],
    ['Contact ', '09171234567'],
    ['customer_contact_number', '09171234567'],
  ]

  it.each(namedPhoneFields)('resolves the phone a tenant stored under %p', (fieldName, value) => {
    const id = resolveCustomerIdentity({
      name: 'Ana',
      contact: '',
      customerData: { customer_name: 'Ana', [fieldName]: value },
    })
    expect(id.phoneE164).toBe('+639171234567')
    expect(id.identityKey).toBe('phone:+639171234567')
  })

  it('stores that phone as the order contact at checkout', () => {
    expect(
      resolveOrderContact({
        name: 'Ana',
        customerData: { customer_name: 'Ana', 'Contact Number': '09171234567' },
      })
    ).toBe('+639171234567')
  })

  it('resolves a tenant-named email field', () => {
    const id = resolveCustomerIdentity({
      customerData: { 'Email Address': 'Ana@Example.COM' },
    })
    expect(id.email).toBe('ana@example.com')
    expect(id.identityKey).toBe('email:ana@example.com')
  })

  it('never reads a table number as a contact, even when a customer types a phone into it', () => {
    // Customers do type their number into "table_number". A table is not a
    // contact: treating it as one would promise a loyalty stamp on a field the
    // merchant never meant as a phone.
    const id = resolveCustomerIdentity({
      customerData: { customer_name: 'Ana', table_number: '09171234567' },
    })
    expect(id.phoneE164).toBeNull()
    expect(id.identityKey).toBeNull()
  })

  it('never mines a free-text field that merely mentions a number', () => {
    const id = resolveCustomerIdentity({
      customerData: { 'Special Instructions': 'pa text or call po (09171234567)' },
    })
    expect(id.identityKey).toBeNull()
  })

  it('keeps a genuinely anonymous order anonymous', () => {
    expect(resolveOrderContact({ name: 'Walk-in', customerData: { table_number: '4' } })).toBe('')
  })

  it('prefers the well-known key when a form carries both', () => {
    const id = resolveCustomerIdentity({
      customerData: { customer_phone: '09171234567', 'Contact Number': '09181234567' },
    })
    expect(id.phoneE164).toBe('+639171234567')
  })

  it('finds the checkout loyalty phone under a tenant-named, non-phone-typed field', () => {
    // lig-a's "Contact Number" is declared `number`, not `phone`.
    expect(
      resolveCheckoutLoyaltyPhone({
        formFields: [{ field_name: 'Contact Number', field_type: 'number' }],
        customerData: { 'Contact Number': '09171234567' },
      })
    ).toBe('+639171234567')
  })
})
