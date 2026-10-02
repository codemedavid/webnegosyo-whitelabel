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
import { signLoyverseWebhook } from '@/lib/loyverse/secret-compare'

export const LOYVERSE_WEBHOOK_EVENTS = ['items.update', 'inventory_levels.update'] as const
export const LOYVERSE_WEBHOOK_PATH = '/api/loyverse/webhook'

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

export interface WebhookPlan {
  register: WebhookRegistration[]
  /** Ids of our own endpoint's registrations under a superseded URL. */
  remove: string[]
}

/** The URL carries a per-tenant signature, never the platform secret (see secret-compare.ts). */
export function buildLoyverseWebhookUrl(appUrl: string, tenantId: string, platformSecret: string): string {
  const url = new URL(LOYVERSE_WEBHOOK_PATH, appUrl)
  url.searchParams.set('tenant_id', tenantId)
  url.searchParams.set('sig', signLoyverseWebhook(platformSecret, tenantId))
  return url.toString()
}

function isOurEndpoint(candidate: string, current: URL): boolean {
  try {
    const parsed = new URL(candidate)
    return parsed.origin === current.origin && parsed.pathname === current.pathname
  } catch {
    return false
  }
}

/**
 * Pure: which registrations are missing or dead, and which of OUR endpoint's
 * registrations are stale (an older URL shape, e.g. the legacy `?secret=`
 * one) and must go, so every event is delivered exactly once. Webhooks on
 * any other origin belong to someone else and are never touched.
 */
export function planWebhookRegistrations(
  existing: readonly LoyverseExistingWebhook[],
  url: string
): WebhookPlan {
  const current = new URL(url)
  const register: WebhookRegistration[] = []
  for (const type of LOYVERSE_WEBHOOK_EVENTS) {
    const match = existing.find((webhook) => webhook.type === type && webhook.url === url)
    if (!match) {
      register.push({ type, url })
    } else if (match.status === 'DISABLED') {
      register.push({ type, url, existingId: match.id })
    }
  }
  const remove = existing
    .filter((webhook) => webhook.url !== url && isOurEndpoint(webhook.url, current))
    .map((webhook) => webhook.id)
  return { register, remove }
}

export interface EnsureWebhooksResult {
  registered: number
  alreadyActive: number
  removed?: number
  error?: string
}

/**
 * The public origin Loyverse delivers to. Configuration wins over the
 * request's Host: a sync run from a preview or alias deployment used to
 * register webhooks at THAT host, which then double-delivered every event
 * (or died with the preview and got the webhook disabled).
 */
export function resolveWebhookAppUrl(fallbackAppUrl?: string): string | undefined {
  const rootDomain = process.env.PLATFORM_ROOT_DOMAIN
  return (
    process.env.PLATFORM_APP_URL ||
    (rootDomain ? `https://www.${rootDomain}` : undefined) ||
    fallbackAppUrl
  )
}

/**
 * Idempotently registers the two sync webhooks for a tenant. Never throws —
 * a sync must not fail because webhook setup did (the catalog import already
 * succeeded); the caller surfaces the error in the sync report instead.
 */
export async function ensureLoyverseWebhooks(
  accessToken: string,
  tenantId: string,
  /** Used only when no app URL is configured (see resolveWebhookAppUrl). */
  fallbackAppUrl?: string
): Promise<EnsureWebhooksResult> {
  const secret = process.env.LOYVERSE_WEBHOOK_SECRET
  const appUrl = resolveWebhookAppUrl(fallbackAppUrl)
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
    // Register before removing, so a failure never leaves the tenant with none.
    for (const registration of plan.register) {
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
    for (const webhookId of plan.remove) {
      await loyverseRequest(accessToken, {
        path: `/webhooks/${encodeURIComponent(webhookId)}`,
        method: 'DELETE',
      })
    }
    return {
      registered: plan.register.length,
      alreadyActive: LOYVERSE_WEBHOOK_EVENTS.length - plan.register.length,
      removed: plan.remove.length,
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Webhook registration failed'
    return { registered: 0, alreadyActive: 0, error: message }
  }
}
