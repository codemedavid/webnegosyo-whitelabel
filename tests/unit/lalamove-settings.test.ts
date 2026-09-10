/**
 * A merchant edits its own Lalamove connection from the store settings page:
 * the account keys and the number the rider calls at pickup. Everything the
 * save has to decide before it touches a database lives in this module, so a
 * bad phone number is refused here — with the number named — rather than by
 * Lalamove at booking time, after a customer has already checked out.
 */
import { parseLalamoveSettings } from '@/lib/lalamove-settings'

const blank = { apiKey: '', secretKey: '', senderPhone: '' }

describe('parseLalamoveSettings', () => {
  test('saves both keys together', () => {
    // Arrange / Act
    const result = parseLalamoveSettings(
      { ...blank, apiKey: '  pk_live  ', secretKey: ' sk_live ' },
      { market: 'PH', hasExistingKeys: false }
    )

    // Assert
    expect(result).toEqual({
      ok: true,
      patch: {
        secrets: { lalamove_api_key: 'pk_live', lalamove_secret_key: 'sk_live' },
        tenant: { lalamove_sender_phone: null },
      },
    })
  })

  test('leaves the stored keys alone when both key fields are blank', () => {
    // A merchant fixing only the pickup phone must not wipe its credentials.
    // Arrange / Act
    const result = parseLalamoveSettings(
      { ...blank, senderPhone: '09171234567' },
      { market: 'PH', hasExistingKeys: true }
    )

    // Assert
    expect(result).toEqual({
      ok: true,
      patch: {
        secrets: null,
        tenant: { lalamove_sender_phone: '+639171234567' },
      },
    })
  })

  test('refuses a half-entered key pair', () => {
    // Arrange / Act
    const result = parseLalamoveSettings(
      { ...blank, apiKey: 'pk_live' },
      { market: 'PH', hasExistingKeys: true }
    )

    // Assert
    expect(result).toEqual({
      ok: false,
      error: 'Enter both the API key and the secret key.',
    })
  })

  test('requires keys the first time Lalamove is connected', () => {
    // Arrange / Act
    const result = parseLalamoveSettings(
      { ...blank, senderPhone: '09171234567' },
      { market: 'PH', hasExistingKeys: false }
    )

    // Assert
    expect(result).toEqual({
      ok: false,
      error: 'Add your Lalamove API key and secret key to connect your account.',
    })
  })

  test('stores the pickup phone in the E.164 form Lalamove accepts', () => {
    // Arrange / Act
    const result = parseLalamoveSettings(
      { ...blank, apiKey: 'pk', secretKey: 'sk', senderPhone: '0917 123 4567' },
      { market: 'PH', hasExistingKeys: false }
    )

    // Assert
    expect(result).toMatchObject({
      ok: true,
      patch: { tenant: { lalamove_sender_phone: '+639171234567' } },
    })
  })

  test('names the number it is refusing', () => {
    // Lalamove answers a bad number with "'' is not valid 'phone'", naming
    // nothing; the merchant needs to know which field to fix.
    // Arrange / Act
    const result = parseLalamoveSettings(
      { ...blank, senderPhone: '12' },
      { market: 'PH', hasExistingKeys: true }
    )

    // Assert
    expect(result).toEqual({
      ok: false,
      error: '"12" is not a valid mobile number. Enter your store number, e.g. 09171234567.',
    })
  })

  test('clearing the pickup phone falls back to the footer number', () => {
    // Storing null rather than '' is what lets resolveLalamoveSender reach
    // the footer phone; '' would be saved as an empty pickup contact.
    // Arrange / Act
    const result = parseLalamoveSettings(
      { ...blank, senderPhone: '   ' },
      { market: 'PH', hasExistingKeys: true }
    )

    // Assert
    expect(result).toMatchObject({
      ok: true,
      patch: { secrets: null, tenant: { lalamove_sender_phone: null } },
    })
  })

  test('keeps the country code a non-PH market typed', () => {
    // Arrange / Act
    const result = parseLalamoveSettings(
      { ...blank, senderPhone: '+65 8123 4567' },
      { market: 'SG', hasExistingKeys: true }
    )

    // Assert
    expect(result).toMatchObject({
      ok: true,
      patch: { tenant: { lalamove_sender_phone: '+6581234567' } },
    })
  })
})
