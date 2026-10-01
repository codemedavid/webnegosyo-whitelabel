/**
 * Lalamove keys are `pk_prod_…`/`sk_prod_…` (production) or `pk_test_…`/
 * `sk_test_…` (sandbox). Anything else is refused by Lalamove's gateway with a
 * bare 502 that the SDK reports as "Unknown error" — which is what a browser
 * autofilling a saved password ("admin123") into the API-key field produced
 * for Lolila's Deli. These checks catch it at save time and before a request.
 */
import {
  checkLalamoveKeyPair,
  describeLalamoveCredentialProblem,
} from '@/lib/lalamove-keys'

describe('checkLalamoveKeyPair', () => {
  test('accepts a production pair and reports its environment', () => {
    // Arrange / Act
    const result = checkLalamoveKeyPair({ apiKey: 'pk_prod_abc', secretKey: 'sk_prod_def' })

    // Assert
    expect(result).toEqual({ ok: true, isSandbox: false })
  })

  test('accepts a sandbox pair and reports its environment', () => {
    // Arrange / Act
    const result = checkLalamoveKeyPair({ apiKey: 'pk_test_abc', secretKey: 'sk_test_def' })

    // Assert
    expect(result).toEqual({ ok: true, isSandbox: true })
  })

  test('refuses an autofilled password in the API key field without echoing it', () => {
    // Arrange / Act
    const result = checkLalamoveKeyPair({ apiKey: 'admin123', secretKey: 'sk_prod_def' })

    // Assert
    expect(result).toEqual({
      ok: false,
      error: expect.stringContaining('API key should start with pk_prod_'),
    })
    expect(JSON.stringify(result)).not.toContain('admin123')
  })

  test('refuses a secret key that is not a Lalamove secret', () => {
    // Arrange / Act
    const result = checkLalamoveKeyPair({ apiKey: 'pk_prod_abc', secretKey: 'hunter2' })

    // Assert
    expect(result).toEqual({
      ok: false,
      error: expect.stringContaining('secret key should start with sk_prod_'),
    })
  })

  test('refuses a pair mixed from production and sandbox', () => {
    // Arrange / Act
    const result = checkLalamoveKeyPair({ apiKey: 'pk_prod_abc', secretKey: 'sk_test_def' })

    // Assert
    expect(result).toEqual({
      ok: false,
      error: expect.stringMatching(/same Lalamove environment/),
    })
  })

  test('refuses a key with nothing after the prefix', () => {
    // Arrange / Act
    const result = checkLalamoveKeyPair({ apiKey: 'pk_prod_', secretKey: 'sk_prod_def' })

    // Assert
    expect(result).toMatchObject({ ok: false })
  })
})

describe('describeLalamoveCredentialProblem', () => {
  test('is silent for matching production keys on a production store', () => {
    // Arrange / Act
    const problem = describeLalamoveCredentialProblem({
      apiKey: 'pk_prod_abc',
      secretKey: 'sk_prod_def',
      isSandbox: false,
    })

    // Assert
    expect(problem).toBeNull()
  })

  test('names the API key as the thing to re-enter when it is malformed', () => {
    // Arrange / Act
    const problem = describeLalamoveCredentialProblem({
      apiKey: 'admin123',
      secretKey: 'sk_prod_def',
      isSandbox: false,
    })

    // Assert
    expect(problem).toMatch(/API key/)
    expect(problem).toMatch(/Settings/)
    expect(problem).not.toContain('admin123')
  })

  test('flags production keys on a store set to sandbox mode', () => {
    // Production keys sent to the sandbox host are refused as bad credentials.
    // Arrange / Act
    const problem = describeLalamoveCredentialProblem({
      apiKey: 'pk_prod_abc',
      secretKey: 'sk_prod_def',
      isSandbox: true,
    })

    // Assert
    expect(problem).toMatch(/production keys.*sandbox mode/i)
  })

  test('flags sandbox keys on a store set to production mode', () => {
    // Arrange / Act
    const problem = describeLalamoveCredentialProblem({
      apiKey: 'pk_test_abc',
      secretKey: 'sk_test_def',
      isSandbox: false,
    })

    // Assert
    expect(problem).toMatch(/sandbox keys.*production mode/i)
  })
})
