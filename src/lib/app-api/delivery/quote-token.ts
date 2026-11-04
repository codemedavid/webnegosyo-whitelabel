/**
 * The customer app's `quoteToken`: one opaque string carrying a Lalamove
 * quotation id and the signature `createSignedLalamoveQuote` put on its price.
 *
 * The token adds NO trust of its own. The signature (delivery-quote-signature.ts)
 * already binds tenant, quotation id, fee, destination and expiry under
 * API_SECRET, so a token only has to hand both halves back to the order route:
 *
 *   const parts = decodeAppQuoteToken(delivery.quoteToken)
 *   verifyDeliveryQuote(parts?.signature, {
 *     tenantId,                              // from the build, never the body
 *     quotationId: parts?.quotationId,
 *     destination: { address, lat, lng },   // the order's own delivery fields
 *   })
 *
 * A forged quotation id fails the signature's quotation check, a re-signed body
 * fails the HMAC, another store's token fails the tenant check and a moved pin
 * or edited address fails the destination check.
 */

const TOKEN_PREFIX = 'aq1.'
/** The signature itself is capped at 4096 by verifyDeliveryQuote; this leaves room for the wrapper. */
const MAX_TOKEN_LENGTH = 8192
const MAX_SIGNATURE_LENGTH = 4096
const MAX_QUOTATION_ID_LENGTH = 200

export interface AppQuoteTokenParts {
  quotationId: string
  signature: string
}

interface TokenBody {
  q: string
  s: string
}

const isUsable = (value: unknown, max: number): value is string =>
  typeof value === 'string' && value.trim() !== '' && value.length <= max

/** Null when either half is missing or oversized: the app is then given no token. */
export function encodeAppQuoteToken(parts: AppQuoteTokenParts): string | null {
  if (!isUsable(parts.quotationId, MAX_QUOTATION_ID_LENGTH) || !isUsable(parts.signature, MAX_SIGNATURE_LENGTH)) return null
  const body: TokenBody = { q: parts.quotationId, s: parts.signature }
  return `${TOKEN_PREFIX}${Buffer.from(JSON.stringify(body), 'utf8').toString('base64url')}`
}

/**
 * The two halves, or null for anything that is not a token this server minted
 * the shape of. Never a verdict: the caller must still `verifyDeliveryQuote`.
 */
export function decodeAppQuoteToken(token: unknown): AppQuoteTokenParts | null {
  if (typeof token !== 'string' || token.length > MAX_TOKEN_LENGTH || !token.startsWith(TOKEN_PREFIX)) return null
  const encoded = token.slice(TOKEN_PREFIX.length)
  if (!/^[A-Za-z0-9_-]+$/.test(encoded)) return null
  try {
    const parsed: unknown = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'))
    if (typeof parsed !== 'object' || parsed === null) return null
    const { q, s } = parsed as Record<string, unknown>
    if (!isUsable(q, MAX_QUOTATION_ID_LENGTH) || !isUsable(s, MAX_SIGNATURE_LENGTH)) return null
    return { quotationId: q, signature: s }
  } catch {
    return null
  }
}
