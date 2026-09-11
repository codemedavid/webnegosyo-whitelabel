import { resolveCheckoutLoyaltyPhone } from '@/lib/loyalty/checkout-phone'

const phoneField = { field_name: 'contact_number', field_type: 'phone' as const }
const nameField = { field_name: 'customer_name', field_type: 'text' as const }

it('reads the declared phone field whatever the merchant named it', () => {
  expect(
    resolveCheckoutLoyaltyPhone({
      formFields: [nameField, phoneField],
      customerData: { customer_name: 'Ana', contact_number: '0917 123 4567' },
    }),
  ).toBe('+639171234567')
})

it('falls back to the well-known keys when no phone field is declared', () => {
  expect(
    resolveCheckoutLoyaltyPhone({
      formFields: [nameField],
      customerData: { customer_phone: '09171234567' },
    }),
  ).toBe('+639171234567')
})

it('stays silent while the number is still being typed', () => {
  expect(
    resolveCheckoutLoyaltyPhone({ formFields: [phoneField], customerData: { contact_number: '0917 12' } }),
  ).toBeNull()
})

it('stays silent when nothing has been entered at all', () => {
  expect(resolveCheckoutLoyaltyPhone({ formFields: [phoneField], customerData: {} })).toBeNull()
})

it('ignores an email field that happens to hold text', () => {
  expect(
    resolveCheckoutLoyaltyPhone({
      formFields: [{ field_name: 'email', field_type: 'email' }],
      customerData: { email: 'ana@example.com' },
    }),
  ).toBeNull()
})
