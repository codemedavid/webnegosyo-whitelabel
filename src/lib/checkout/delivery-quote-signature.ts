/**
 * A Lalamove delivery fee the server can trust at order time.
 *
 * `createOrderAction` cannot recompute a Lalamove fee without re-quoting, so it
 * used to take the browser's number, range-checked only: a forged request could
 * bill ₱1 for a quotation Lalamove priced at ₱180, and the booking went through
 * at the merchant's cost.
 *
 * Now the quote action signs what Lalamove actually quoted — tenant, quotation
 * id and price — and the order action bills the SIGNED price. The browser only
 * carries the signature; it cannot mint one. Stateless (HMAC over API_SECRET,
 * the secret tracking tokens already use), so no store sits between the two
 * actions.
 */
import crypto from 'crypto'
import { MAX_DELIVERY_FEE } from './order-delivery-fee'

/** Domain separation: this key signs nothing else. */
const SIGNATURE_CONTEXT = 'lalamove-quote:v2'

/**
 * Never extend the provider's expiry. A quotation binds the price and route,
 * and must still be valid when the customer submits the order.
 */
export const DELIVERY_QUOTE_SIGNATURE_TTL_MS = 5 * 60 * 1000

interface DeliveryDestination {
  address: string
  lat: number
  lng: number
}

export interface SignedDeliveryQuote {
  tenantId: string
  quotationId: string
  fee: number
  destination: DeliveryDestination
  expiresAt: number
}

interface SignaturePayload extends Omit<SignedDeliveryQuote, 'expiresAt'> {
  /** Epoch ms after which the signature is refused. */
  exp: number
}

export type DeliveryQuoteVerification =
  | { ok: true; fee: number }
  | { ok: false; reason: 'missing' | 'malformed' | 'bad-signature' | 'mismatch' | 'expired' | 'unconfigured' }

function readSecret(): string | null {
  const secret = process.env.API_SECRET
  return secret && secret.length > 0 ? secret : null
}

function hmac(secret: string, body: string): string {
  return crypto.createHmac('sha256', secret).update(`${SIGNATURE_CONTEXT}.${body}`).digest('base64url')
}

/**
 * Signs a quotation's price. Returns null when API_SECRET is not configured —
 * the caller then sends no signature and the order is refused with a clear
 * message rather than billed an unverified fee.
 */
export function signDeliveryQuote(
  quote: SignedDeliveryQuote,
  now: number = Date.now(),
  secret: string | null = readSecret()
): string | null {
  if (!secret) return null
  const destination = parseDestination(quote.destination)
  if (!quote.tenantId?.trim() || !quote.quotationId?.trim() ||
      !Number.isFinite(quote.fee) || quote.fee < 0 || quote.fee > MAX_DELIVERY_FEE ||
      !Number.isFinite(quote.expiresAt) || quote.expiresAt <= now || !destination) return null
  const payload: SignaturePayload = {
    tenantId: quote.tenantId,
    quotationId: quote.quotationId,
    fee: quote.fee,
    destination,
    exp: Math.min(quote.expiresAt, now + DELIVERY_QUOTE_SIGNATURE_TTL_MS),
  }
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
  return `${body}.${hmac(secret, body)}`
}

function parseDestination(value: unknown): DeliveryDestination | null {
  if (!value || typeof value !== 'object') return null
  const { address, lat, lng } = value as Record<string, unknown>
  if (typeof address !== 'string' || !address.trim()) return null
  const coordinate = (n: unknown): number =>
    typeof n === 'number' ? n : typeof n === 'string' && n.trim() ? Number(n) : NaN
  const latitude = coordinate(lat)
  const longitude = coordinate(lng)
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 ||
      !Number.isFinite(longitude) || longitude < -180 || longitude > 180) return null
  return { address: address.trim(), lat: latitude, lng: longitude }
}

function parsePayload(body: string): SignaturePayload | null {
  try {
    const parsed: unknown = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'))
    if (typeof parsed !== 'object' || parsed === null) return null
    const { tenantId, quotationId, fee, exp, destination: rawDestination } = parsed as Record<string, unknown>
    if (typeof tenantId !== 'string' || !tenantId.trim() || typeof quotationId !== 'string' || !quotationId.trim()) return null
    if (typeof fee !== 'number' || !Number.isFinite(fee) || fee < 0 || fee > MAX_DELIVERY_FEE) return null
    if (typeof exp !== 'number' || !Number.isFinite(exp)) return null
    const destination = parseDestination(rawDestination)
    return destination ? { tenantId, quotationId, fee, exp, destination } : null
  } catch {
    return null
  }
}

function isSameSignature(expected: string, provided: string): boolean {
  const expectedBuf = Buffer.from(expected)
  const providedBuf = Buffer.from(provided)
  return expectedBuf.length === providedBuf.length && crypto.timingSafeEqual(expectedBuf, providedBuf)
}

/**
 * Verifies a signature for THIS tenant and THIS quotation and returns the price
 * Lalamove quoted. A signature for another store, another quotation, or past
 * its window is refused.
 */
export function verifyDeliveryQuote(
  signature: string | null | undefined,
  expected: { tenantId: string; quotationId: string | null | undefined; destination: unknown },
  now: number = Date.now(),
  secret: string | null = readSecret()
): DeliveryQuoteVerification {
  if (!secret) return { ok: false, reason: 'unconfigured' }
  if (!signature || !expected.quotationId) return { ok: false, reason: 'missing' }
  if (typeof signature !== 'string' || signature.length > 4096) return { ok: false, reason: 'malformed' }

  const [body, mac, ...rest] = signature.split('.')
  if (!body || !mac || rest.length > 0) return { ok: false, reason: 'malformed' }
  if (!isSameSignature(hmac(secret, body), mac)) return { ok: false, reason: 'bad-signature' }

  const payload = parsePayload(body)
  if (!payload) return { ok: false, reason: 'malformed' }
  const destination = parseDestination(expected.destination)
  if (payload.tenantId !== expected.tenantId || payload.quotationId !== expected.quotationId ||
      !destination || destination.address !== payload.destination.address ||
      destination.lat !== payload.destination.lat || destination.lng !== payload.destination.lng) {
    return { ok: false, reason: 'mismatch' }
  }
  if (payload.exp <= now) return { ok: false, reason: 'expired' }
  return { ok: true, fee: payload.fee }
}
