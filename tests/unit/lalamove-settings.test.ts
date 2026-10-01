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
      { ...blank, apiKey: '  pk_prod_abc  ', secretKey: ' sk_prod_def ' },
      { market: 'PH', hasExistingKeys: false }
    )

    // Assert
    expect(result).toEqual({
      ok: true,
      patch: {
        secrets: { lalamove_api_key: 'pk_prod_abc', lalamove_secret_key: 'sk_prod_def' },
        tenant: { lalamove_sender_phone: null, lalamove_sandbox: false },
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
      { ...blank, apiKey: 'pk_prod_abc' },
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
      { ...blank, apiKey: 'pk_prod_abc', secretKey: 'sk_prod_def', senderPhone: '0917 123 4567' },
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

  test('refuses an autofilled password in the API key field', () => {
    // A browser filled the saved "admin123" into this password field; Lalamove
    // then failed every quote with a bare "Unknown error".
    // Arrange / Act
    const result = parseLalamoveSettings(
      { ...blank, apiKey: 'admin123', secretKey: 'sk_prod_def' },
      { market: 'PH', hasExistingKeys: true }
    )

    // Assert
    expect(result).toEqual({
      ok: false,
      error: expect.stringContaining('API key should start with pk_prod_'),
    })
  })

  test('switches the store to sandbox mode when sandbox keys are saved', () => {
    // The merchant cannot see the sandbox switch, and keys from one
    // environment are refused by the other — the keys decide.
    // Arrange / Act
    const result = parseLalamoveSettings(
      { ...blank, apiKey: 'pk_test_abc', secretKey: 'sk_test_def' },
      { market: 'PH', hasExistingKeys: false }
    )

    // Assert
    expect(result).toMatchObject({
      ok: true,
      patch: { tenant: { lalamove_sandbox: true } },
    })
  })

  test('leaves the sandbox switch alone when no new keys are entered', () => {
    // Arrange / Act
    const result = parseLalamoveSettings(
      { ...blank, senderPhone: '09171234567' },
      { market: 'PH', hasExistingKeys: true }
    )

    // Assert
    expect(result.ok && 'lalamove_sandbox' in result.patch.tenant).toBe(false)
  })
})
