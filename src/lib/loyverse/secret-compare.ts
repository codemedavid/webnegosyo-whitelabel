/**
 * Credential checks for the Loyverse webhook and reconcile endpoints.
 *
 * Webhooks created with a personal access token carry no Loyverse signature,
 * so the URL itself is the credential — and every merchant can read the URL
 * registered in their own account (Back Office, or `GET /webhooks` with their
 * token). The URL therefore carries a PER-TENANT signature,
 * HMAC(LOYVERSE_WEBHOOK_SECRET, tenant id), never the platform secret: one
 * merchant learning their URL learns nothing that works for another tenant.
 */

import { createHmac, timingSafeEqual } from 'node:crypto'

/** Constant-time string equality; an empty side never matches. */
export function secretsEqual(received: string | null | undefined, expected: string | null | undefined): boolean {
  if (!received || !expected) return false
  const a = Buffer.from(received)
  const b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}

export function signLoyverseWebhook(platformSecret: string, tenantId: string): string {
  return createHmac('sha256', platformSecret).update(`loyverse-webhook:${tenantId}`).digest('hex')
}

export function isValidLoyverseWebhookSignature(
  platformSecret: string | null | undefined,
  tenantId: string | null | undefined,
  signature: string | null | undefined
): boolean {
  if (!platformSecret || !tenantId) return false
  return secretsEqual(signature, signLoyverseWebhook(platformSecret, tenantId))
}
