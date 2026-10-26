/**
 * Proof that a caller uploaded the payment-proof screenshot it asks to delete.
 *
 * `/api/payment-proof/delete` is anonymous (customers swap a screenshot before
 * submitting), and an ImageKit file id is no secret: it is stored on the order
 * and shown to staff. With the id alone anyone could delete a fresh proof that
 * a submitted order still points at. So the upload route returns
 * `deleteToken` = HMAC(file id) and the delete route requires it — only the
 * browser or phone that uploaded the file holds it.
 *
 * An HMAC rather than "refuse files attached to an order": that lookup is not
 * indexable on the shared platform DB (`orders.payment_proof_public_id` has no
 * index) and cannot see Convex or tenant-Supabase orders, which carry the
 * proof inside customer data. Stateless over API_SECRET (as tracking tokens
 * and delivery-quote signatures are), with its own context.
 */
import crypto from 'crypto'

const TOKEN_CONTEXT = 'payment-proof-delete:v1'

function readSecret(): string | null {
  const secret = process.env.API_SECRET
  return secret && secret.length > 0 ? secret : null
}

function mac(fileId: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(`${TOKEN_CONTEXT}.${fileId}`).digest('base64url')
}

/** The token for `fileId`; null when API_SECRET is not configured. */
export function signProofDeleteToken(fileId: string, secret: string | null = readSecret()): string | null {
  if (!secret || typeof fileId !== 'string' || fileId === '') return null
  return mac(fileId, secret)
}

/** Constant-time check that `token` was minted for `fileId`. */
export function verifyProofDeleteToken(
  fileId: string,
  token: unknown,
  secret: string | null = readSecret(),
): boolean {
  if (!secret || typeof token !== 'string' || token === '' || typeof fileId !== 'string' || fileId === '') return false
  const expected = Buffer.from(mac(fileId, secret))
  const given = Buffer.from(token)
  return expected.length === given.length && crypto.timingSafeEqual(expected, given)
}
