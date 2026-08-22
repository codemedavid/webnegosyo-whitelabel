import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { importLoyverseCatalog } from '@/lib/loyverse/catalog-import'
import { ensureLoyverseWebhooks } from '@/lib/loyverse/webhooks'
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

  for (const row of (tenants ?? []) as unknown as Tenant[]) {
    try {
      const report = await importLoyverseCatalog(row)
      if (report.success && row.loyverse_access_token) {
        await ensureLoyverseWebhooks(row.loyverse_access_token, row.id)
      }
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
