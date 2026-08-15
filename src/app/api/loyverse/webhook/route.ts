import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { importLoyverseCatalog } from '@/lib/loyverse/catalog-import'
import type { Tenant } from '@/types/database'

/**
 * POST /api/loyverse/webhook?tenant_id=...&secret=...
 *
 * Inbound Loyverse webhooks (registered per merchant in Back Office with this
 * URL). PAT-created webhooks carry no signature, so authentication follows the
 * lalamove-convex precedent: a platform shared secret plus the tenant id in
 * the query string, verified against the tenant's own Loyverse config.
 *
 * On items.update we re-import the whole catalog rather than trusting the
 * batched payload shape — the import is idempotent and a full pull is well
 * within Loyverse's per-merchant rate limit.
 *
 * Loyverse retries for 48h and then disables the webhook on persistent
 * non-2xx, so config errors return 200 with an ignored marker.
 */
export async function POST(request: NextRequest) {
  const secret = request.nextUrl.searchParams.get('secret')
  const tenantId = request.nextUrl.searchParams.get('tenant_id')

  const expected = process.env.LOYVERSE_WEBHOOK_SECRET
  if (!expected || secret !== expected) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!tenantId) {
    return NextResponse.json({ error: 'tenant_id is required' }, { status: 400 })
  }

  let eventType: string | undefined
  try {
    const body = (await request.json()) as { type?: string }
    eventType = body?.type
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { data: tenant, error } = await admin
    .from('tenants')
    .select('*')
    .eq('id', tenantId)
    .maybeSingle()
  if (error || !tenant) {
    // 200 so Loyverse does not retry a permanently wrong registration for 48h.
    return NextResponse.json({ ignored: true, reason: 'tenant not found' })
  }

  const tenantRow = tenant as unknown as Tenant
  if (!tenantRow.loyverse_enabled) {
    return NextResponse.json({ ignored: true, reason: 'loyverse disabled' })
  }

  if (eventType === 'items.update') {
    const report = await importLoyverseCatalog(tenantRow)
    return NextResponse.json({
      ok: report.success,
      itemsCreated: report.itemsCreated,
      itemsUpdated: report.itemsUpdated,
      warnings: report.warnings.length,
    })
  }

  // inventory_levels.update lands here in Phase 4.
  return NextResponse.json({ ignored: true, reason: `unhandled event ${eventType ?? 'unknown'}` })
}
