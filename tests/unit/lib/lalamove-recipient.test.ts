/**
 * Who the rider calls at the drop-off.
 *
 * A booking used to send whatever `customer_contact` held — and on a checkout
 * form with no phone field that is an empty string. Lalamove refuses it with
 * "'' is not valid 'phone'. Phone must be in E.164 format", and the merchant
 * is left with a quotation they can never book. The recipient number is
 * resolved here instead: the customer's phone wherever the form put it, and
 * failing that the store's own number, so the booking goes through and the
 * merchant is told who the rider will call.
 */
import { resolveLalamoveRecipient } from '@/lib/lalamove-recipient'

describe('resolveLalamoveRecipient', () => {
  test('uses the customer contact when it is a phone number', () => {
    const recipient = resolveLalamoveRecipient(
      { customer_contact: '09171234567', customer_data: null },
      'PH',
      '+639990000000',
    )

    expect(recipient).toEqual({ phone: '+639171234567', source: 'customer' })
  })

  test('recovers the phone from customer_data when the contact is blank', () => {
    const recipient = resolveLalamoveRecipient(
      { customer_contact: '', customer_data: { contact_number: '0917 123 4567' } },
      'PH',
      '+639990000000',
    )

    expect(recipient).toEqual({ phone: '+639171234567', source: 'customer' })
  })

  test('falls back to the store phone when the order carries no phone at all', () => {
    // The seacook test order: customer_contact '' and no phone field on the form.
    const recipient = resolveLalamoveRecipient(
      { customer_contact: '', customer_data: { delivery_address: 'Enverga Blvd' } },
      'PH',
      '+639939212700',
    )

    expect(recipient).toEqual({ phone: '+639939212700', source: 'store' })
  })

  test('skips an email contact rather than sending it as a phone', () => {
    const recipient = resolveLalamoveRecipient(
      { customer_contact: 'ana@example.com', customer_data: {} },
      'PH',
      '+639939212700',
    )

    expect(recipient).toEqual({ phone: '+639939212700', source: 'store' })
  })

  test('reports that nobody can be called when even the store has no phone', () => {
    const recipient = resolveLalamoveRecipient(
      { customer_contact: '', customer_data: {} },
      'PH',
      undefined,
    )

    expect(recipient).toEqual({ phone: undefined, source: 'none' })
  })

  test('matches the phone field however the merchant labelled it', () => {
    // seacook's live checkout form stores the number under "Phone" — the
    // lookup was lowercase-only and the rider would have been sent to the store.
    for (const key of ['Phone', 'Phone Number', 'Contact No.', 'MOBILE_NUMBER']) {
      const recipient = resolveLalamoveRecipient(
        { customer_contact: '', customer_data: { [key]: '+639171234519' } },
        'PH',
        '+639939212700',
      )
      expect(recipient).toEqual({ phone: '+639171234519', source: 'customer' })
    }
  })

  test('does not mistake a landline-looking address field for a phone', () => {
    const recipient = resolveLalamoveRecipient(
      { customer_contact: '', customer_data: { delivery_address: '0917 Rizal St, Lucena' } },
      'PH',
      '+639939212700',
    )
    expect(recipient).toEqual({ phone: '+639939212700', source: 'store' })
  })
})
