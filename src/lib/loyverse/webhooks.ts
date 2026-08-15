/**
 * Loyverse webhook auto-registration.
 *
 * Continuous sync (menu edits, stock changes) rides on two Loyverse webhooks.
 * Requiring merchants to paste URLs into Back Office is how integrations stay
 * half-installed, so the first catalog sync registers them itself via
 * Loyverse's own `GET/POST /webhooks` API.
 *
 * Loyverse constraints encoded here:
 * - (type, url) must be unique; POST with an `id` updates in place;
 * - one event type per webhook;
 * - after 48h of failed deliveries a webhook flips to DISABLED and stays
 *   there — re-POSTing with its id re-enables it, which is why the planner
 *   treats DISABLED as "needs registering again".
 */

import { loyverseRequest, loyverseListAll } from '@/lib/loyverse/client'

export const LOYVERSE_WEBHOOK_EVENTS = ['items.update', 'inventory_levels.update'] as const

export interface LoyverseExistingWebhook {
  id: string
  type: string
  url: string
  status?: string
}

export interface WebhookRegistration {
  type: string
  url: string
  /** Present when re-enabling a DISABLED webhook rather than creating one. */
  existingId?: string
}

export function buildLoyverseWebhookUrl(appUrl: string, tenantId: string, secret: string): string {
  const url = new URL('/api/loyverse/webhook', appUrl)
  url.searchParams.set('tenant_id', tenantId)
  url.searchParams.set('secret', secret)
  return url.toString()
}

/** Pure: which registrations are missing or dead, given what Loyverse has. */
export function planWebhookRegistrations(
  existing: readonly LoyverseExistingWebhook[],
  url: string
): WebhookRegistration[] {
  const plan: WebhookRegistration[] = []
  for (const type of LOYVERSE_WEBHOOK_EVENTS) {
    const match = existing.find((webhook) => webhook.type === type && webhook.url === url)
    if (!match) {
      plan.push({ type, url })
    } else if (match.status === 'DISABLED') {
      plan.push({ type, url, existingId: match.id })
    }
  }
  return plan
}

export interface EnsureWebhooksResult {
  registered: number
  alreadyActive: number
  error?: string
}

/**
 * Idempotently registers the two sync webhooks for a tenant. Never throws —
 * a sync must not fail because webhook setup did (the catalog import already
 * succeeded); the caller surfaces the error in the sync report instead.
 */
export async function ensureLoyverseWebhooks(
  accessToken: string,
  tenantId: string,
  /** Absolute https origin of this deployment; derived from env when omitted. */
  appUrlOverride?: string
): Promise<EnsureWebhooksResult> {
  const secret = process.env.LOYVERSE_WEBHOOK_SECRET
  // Same derivation family as the Facebook OAuth redirect: explicit env first,
  // then the platform root domain the middleware already runs on.
  const rootDomain = process.env.PLATFORM_ROOT_DOMAIN
  const appUrl =
    appUrlOverride ||
    process.env.PLATFORM_APP_URL ||
    (rootDomain ? `https://www.${rootDomain}` : undefined)
  if (!secret) {
    return { registered: 0, alreadyActive: 0, error: 'LOYVERSE_WEBHOOK_SECRET is not set — continuous sync is off until webhooks are registered' }
  }
  if (!appUrl || !appUrl.startsWith('https://')) {
    return { registered: 0, alreadyActive: 0, error: 'No public https app URL configured — Loyverse only delivers webhooks to https' }
  }

  const url = buildLoyverseWebhookUrl(appUrl, tenantId, secret)
  try {
    const existing = await loyverseListAll<LoyverseExistingWebhook>(
      accessToken,
      '/webhooks',
      'webhooks'
    )
    const plan = planWebhookRegistrations(existing, url)
    for (const registration of plan) {
      await loyverseRequest(accessToken, {
        path: '/webhooks',
        method: 'POST',
        body: {
          ...(registration.existingId ? { id: registration.existingId } : {}),
          type: registration.type,
          url: registration.url,
          status: 'ENABLED',
        },
      })
    }
    return {
      registered: plan.length,
      alreadyActive: LOYVERSE_WEBHOOK_EVENTS.length - plan.length,
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Webhook registration failed'
    return { registered: 0, alreadyActive: 0, error: message }
  }
}
