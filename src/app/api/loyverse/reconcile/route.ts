import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { listTenantSecrets, mergeTenantSecrets } from '@/lib/tenant-secrets'
import { importLoyverseCatalog } from '@/lib/loyverse/catalog-import'
import { ensureLoyverseWebhooks } from '@/lib/loyverse/webhooks'
import { runLoyverseSync } from '@/lib/loyverse/sync-orchestrator'
import { isAuthorizedReconcileRequest } from '@/lib/loyverse/reconcile-auth'
import type { Tenant } from '@/types/database'

// Sequential full-catalog pulls across tenants; well beyond a lambda default.
export const maxDuration = 300

/**
 * GET /api/loyverse/reconcile?secret=...
 *
 * Safety net behind the webhooks: Loyverse disables a webhook after 48 hours
 * of failed deliveries and never re-enables it, which would freeze a tenant's
 * menu and stock silently. A periodic run (Vercel cron, e.g. every 6h)
 * re-imports every Loyverse tenant's catalog AND re-registers any disabled
 * webhook, so the steady state self-heals.
 *
 * Sequential on purpose: rate limits are per merchant account, but the
 * fetches share this deployment's CPU, and there is no hurry.
 */
export async function GET(request: NextRequest) {
  const authorized = isAuthorizedReconcileRequest(
    request.nextUrl.searchParams.get('secret'),
    request.headers.get('authorization'),
    {
      webhookSecret: process.env.LOYVERSE_WEBHOOK_SECRET,
      cronSecret: process.env.CRON_SECRET,
    }
  )
  if (!authorized) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = createAdminClient()
  const { data: tenants, error } = await admin
    .from('tenants')
    .select('*')
    .eq('loyverse_enabled', true)
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const results: Array<{
    tenantId: string
    ok: boolean
    itemsCreated?: number
    itemsUpdated?: number
    warnings?: number
    error?: string
  }> = []

  const tenantRows = (tenants ?? []) as unknown as Tenant[]
  // Access tokens live in tenant_secrets; one read covers every tenant here.
  const secretsByTenant = await listTenantSecrets(
    admin,
    tenantRows.map((row) => row.id)
  )

  for (const tenantRow of tenantRows) {
    const row: Tenant = mergeTenantSecrets(tenantRow, secretsByTenant.get(tenantRow.id) ?? null)
    try {
      // Webhooks first: registration is cheap and idempotent, and must not be
      // hostage to a catalog import that can time out on large menus.
      const report = await runLoyverseSync(row, undefined, {
        importCatalog: importLoyverseCatalog,
        ensureWebhooks: ensureLoyverseWebhooks,
        recordWebhookStatus: async (id, update) => {
          await admin.from('tenants').update(update as never).eq('id', id)
        },
      })
      results.push({
        tenantId: row.id,
        ok: report.success,
        itemsCreated: report.itemsCreated,
        itemsUpdated: report.itemsUpdated,
        warnings: report.warnings.length,
        error: report.error,
      })
    } catch (err: unknown) {
      results.push({
        tenantId: row.id,
        ok: false,
        error: err instanceof Error ? err.message : 'reconcile crashed',
      })
    }
  }

  return NextResponse.json({ tenants: results.length, results })
}
