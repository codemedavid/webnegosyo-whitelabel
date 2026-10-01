/**
 * What a Lalamove key pair has to look like before we store it or sign with it.
 *
 * Lalamove issues `pk_prod_…`/`sk_prod_…` for production and `pk_test_…`/
 * `sk_test_…` for sandbox. A value of any other shape is refused by Lalamove's
 * gateway with a bare 502 and no error body, which the SDK reports as
 * "Unknown error" — so nothing tells the merchant the key is what to fix.
 * Both key inputs are password fields, and browsers fill saved login
 * passwords into them ("admin123" ended up as eight stores' API key).
 *
 * Error messages never echo the refused value: it may be someone's password.
 */

const API_KEY_PATTERN = /^pk_(prod|test)_\S+$/
const SECRET_KEY_PATTERN = /^sk_(prod|test)_\S+$/
const SANDBOX_KEY_ENVIRONMENT = 'test'

export type LalamoveKeyKind = 'api' | 'secret'

export type LalamoveKeyCheck =
  | { ok: true; isSandbox: boolean }
  | { ok: false; error: string }

const KEY_FORMAT_ERRORS: Record<LalamoveKeyKind, string> = {
  api: 'The Lalamove API key should start with pk_prod_ (or pk_test_ for sandbox). Copy it again from your Lalamove Partner portal.',
  secret: 'The Lalamove secret key should start with sk_prod_ (or sk_test_ for sandbox). Copy it again from your Lalamove Partner portal.',
}

const KEY_PATTERNS: Record<LalamoveKeyKind, RegExp> = {
  api: API_KEY_PATTERN,
  secret: SECRET_KEY_PATTERN,
}

/** One key on its own: its shape, and which Lalamove environment issued it. */
export function checkLalamoveKey(key: string, kind: LalamoveKeyKind): LalamoveKeyCheck {
  const match = KEY_PATTERNS[kind].exec(key.trim())
  if (!match) {
    return { ok: false, error: KEY_FORMAT_ERRORS[kind] }
  }
  return { ok: true, isSandbox: match[1] === SANDBOX_KEY_ENVIRONMENT }
}

/** Both keys together: each well-formed, and issued by the same environment. */
export function checkLalamoveKeyPair(keys: {
  apiKey: string
  secretKey: string
}): LalamoveKeyCheck {
  const api = checkLalamoveKey(keys.apiKey, 'api')
  if (!api.ok) return api
  const secret = checkLalamoveKey(keys.secretKey, 'secret')
  if (!secret.ok) return secret
  if (api.isSandbox !== secret.isSandbox) {
    return {
      ok: false,
      error: 'One key is a production key and the other a sandbox key. Use both keys from the same Lalamove environment.',
    }
  }
  return api
}

/** Says which way a key environment disagrees with the store's sandbox switch. */
export function describeLalamoveEnvironmentMismatch(
  keysAreSandbox: boolean,
  storeIsSandbox: boolean
): string | null {
  if (keysAreSandbox === storeIsSandbox) return null
  return keysAreSandbox
    ? 'These are sandbox keys (pk_test_/sk_test_) but the store is in production mode. Use production keys or turn sandbox mode on.'
    : 'These are production keys (pk_prod_/sk_prod_) but the store is in sandbox mode. Turn sandbox mode off or use sandbox keys.'
}

/**
 * Checked before every Lalamove request: stored keys that cannot work, phrased
 * so the error names what to fix instead of Lalamove's "Unknown error".
 */
export function describeLalamoveCredentialProblem(config: {
  apiKey: string
  secretKey: string
  isSandbox: boolean
}): string | null {
  const pair = checkLalamoveKeyPair(config)
  if (!pair.ok) {
    return `${pair.error} Re-enter it in Settings → Lalamove Delivery.`
  }
  return describeLalamoveEnvironmentMismatch(pair.isSandbox, config.isSandbox)
}
