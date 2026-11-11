/**
 * Credential check for /api/lalamove-convex. The URL itself is the credential,
 * and a merchant can read a URL registered under their own Lalamove account, so
 * it carries a PER-TENANT signature, HMAC(LALAMOVE_WEBHOOK_SECRET, tenant id),
 * never the platform secret: one store's URL is useless for any other.
 *
 * `secret=<platform secret>` stays accepted for URLs registered before this
 * existed, and each use is logged by the route so they can be found and
 * replaced. Same shape as `loyverse/secret-compare.ts`.
 */

import { createHmac } from 'node:crypto'
import { secretsEqual } from '@/lib/loyverse/secret-compare'

export function signLalamoveWebhook(platformSecret: string, tenantId: string): string {
  return createHmac('sha256', platformSecret).update(`lalamove-webhook:${tenantId}`).digest('hex')
}

export type LalamoveWebhookAuth = 'signed' | 'legacy' | null

interface WebhookCredentials {
  platformSecret: string | null | undefined
  tenantId: string | null
  signature: string | null
  legacySecret: string | null
}

export function checkLalamoveWebhookAuth(credentials: WebhookCredentials): LalamoveWebhookAuth {
  const { platformSecret, tenantId, signature, legacySecret } = credentials
  if (!platformSecret) return null
  if (signature && tenantId && secretsEqual(signature, signLalamoveWebhook(platformSecret, tenantId))) return 'signed'
  return secretsEqual(legacySecret, platformSecret) ? 'legacy' : null
}
