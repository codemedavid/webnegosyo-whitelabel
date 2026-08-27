/**
 * Loyverse sync orchestration, shared by the superadmin sync action and the
 * reconcile cron.
 *
 * Ordering is the point: webhooks are registered BEFORE the catalog import.
 * The import mirrors images and can outrun a function timeout on a large
 * catalog; when registration ran after it, a timeout meant the merchant's
 * Loyverse account ended up with zero webhooks and live sync silently never
 * started. Registration is cheap and idempotent, so it goes first.
 *
 * The registration outcome is also persisted onto the tenant row
 * (loyverse_webhooks_registered_at / loyverse_webhook_error) so a failure is
 * visible in the superadmin form instead of buried in a one-shot report.
 */

import type { Tenant } from '@/types/database'
import type { LoyverseSyncReport } from '@/lib/loyverse/catalog-import'
import type { EnsureWebhooksResult } from '@/lib/loyverse/webhooks'

export interface LoyverseSyncDeps {
  importCatalog: (tenant: Tenant) => Promise<LoyverseSyncReport>
  ensureWebhooks: (
    accessToken: string,
    tenantId: string,
    appUrlOverride?: string
  ) => Promise<EnsureWebhooksResult>
  recordWebhookStatus: (
    tenantId: string,
    update: Record<string, string | null>
  ) => Promise<void>
  nowIso?: () => string
}

/**
 * Pure: the tenants-row update for a registration outcome. On failure the
 * registered_at stamp is deliberately left out — webhooks registered by an
 * earlier run may still be delivering, and erasing the stamp would misreport
 * a working tenant as never-registered.
 */
export function buildWebhookStatusUpdate(
  result: EnsureWebhooksResult,
  nowIso: string
): Record<string, string | null> {
  if (result.error) {
    return { loyverse_webhook_error: result.error }
  }
  return { loyverse_webhooks_registered_at: nowIso, loyverse_webhook_error: null }
}

/**
 * Registers webhooks (never throws, failure becomes a report warning), then
 * imports the catalog. Returns the import report with the webhook outcome
 * attached.
 */
export async function runLoyverseSync(
  tenant: Tenant,
  appUrlOverride: string | undefined,
  deps: LoyverseSyncDeps
): Promise<LoyverseSyncReport> {
  const now = deps.nowIso ?? (() => new Date().toISOString())

  let webhooks: EnsureWebhooksResult | undefined
  if (tenant.loyverse_access_token) {
    webhooks = await deps.ensureWebhooks(tenant.loyverse_access_token, tenant.id, appUrlOverride)
    await deps.recordWebhookStatus(tenant.id, buildWebhookStatusUpdate(webhooks, now()))
  }

  const report = await deps.importCatalog(tenant)
  if (webhooks) {
    report.webhooks = webhooks
    if (webhooks.error) {
      report.warnings.push(`Webhooks: ${webhooks.error}`)
    }
  }
  return report
}
