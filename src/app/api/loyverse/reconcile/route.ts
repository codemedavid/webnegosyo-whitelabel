import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { importLoyverseCatalog } from '@/lib/loyverse/catalog-import'
import { ensureLoyverseWebhooks } from '@/lib/loyverse/webhooks'
import { runLoyverseSync } from '@/lib/loyverse/sync-orchestrator'
import { isAuthorizedReconcileRequest } from '@/lib/loyverse/reconcile-auth'
import { listLoyverseTenants, type LoyverseTenant } from '@/lib/loyverse/tenant'
import { forEachWithConcurrency } from '@/lib/loyverse/concurrency'

export const maxDuration = 300

/**
 * Tenants are independent (Loyverse rate limits are per merchant account), so
 * a few run side by side; more would contend for this function's CPU and the
 * database pool.
 */
const TENANT_CONCURRENCY = 3
/**
 * Stop STARTING tenants once this much of maxDuration is gone, so in-flight
 * imports finish instead of being killed mid-write. Whoever is left over is
 * the stalest next time (tenants are listed stalest-first).
 */
const START_BUDGET_MS = 200_000

interface ReconcileResult {
  tenantId: string
  ok: boolean
  itemsCreated?: number
  itemsUpdated?: number
  warnings?: number
  error?: string
}

/**
 * GET /api/loyverse/reconcile — `Authorization: Bearer $CRON_SECRET`
 *
 * Safety net behind the webhooks: Loyverse disables a webhook after 48 hours
 * of failed deliveries and never re-enables it, which would freeze a tenant's
 * menu and stock silently. The 6-hourly Vercel cron re-imports every Loyverse
 * tenant's catalog AND re-registers any disabled webhook, so the steady state
 * self-heals.
 */
export async function GET(request: NextRequest) {
  if (!isAuthorizedReconcileRequest(request.headers.get('authorization'), process.env.CRON_SECRET)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const startedAt = Date.now()
  const admin = createAdminClient()
  let tenants: LoyverseTenant[]
  try {
    tenants = await listLoyverseTenants(admin)
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to list tenants'
    console.error('[Loyverse] reconcile could not list tenants:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }

  const results: ReconcileResult[] = []
  const reconcileTenant = async (tenant: LoyverseTenant): Promise<void> => {
    try {
      // Webhooks first: registration is cheap and idempotent, and must not be
      // hostage to a catalog import that can time out on large menus.
      const report = await runLoyverseSync(tenant, undefined, {
        importCatalog: importLoyverseCatalog,
        ensureWebhooks: ensureLoyverseWebhooks,
        recordWebhookStatus: async (id, update) => {
          await admin.from('tenants').update(update as never).eq('id', id)
        },
      })
      results.push({
        tenantId: tenant.id,
        ok: report.success,
        itemsCreated: report.itemsCreated,
        itemsUpdated: report.itemsUpdated,
        warnings: report.warnings.length,
        error: report.error,
      })
    } catch (error: unknown) {
      results.push({
        tenantId: tenant.id,
        ok: false,
        error: error instanceof Error ? error.message : 'reconcile crashed',
      })
    }
  }

  const started = await forEachWithConcurrency(
    tenants,
    TENANT_CONCURRENCY,
    reconcileTenant,
    () => Date.now() - startedAt < START_BUDGET_MS
  )

  return NextResponse.json({
    tenants: tenants.length,
    reconciled: results.length,
    deferred: tenants.length - started,
    results,
  })
}
