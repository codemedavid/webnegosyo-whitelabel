import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'
import { importLoyverseCatalog } from '@/lib/loyverse/catalog-import'
import { isValidLoyverseWebhookSignature } from '@/lib/loyverse/secret-compare'
import { loadLoyverseTenant } from '@/lib/loyverse/tenant'

/**
 * POST /api/loyverse/webhook?tenant_id=...&sig=...
 *
 * Inbound Loyverse webhooks, auto-registered per tenant by the sync (see
 * webhooks.ts). PAT-created webhooks carry no Loyverse signature, so the URL
 * is the credential: `sig` = HMAC(LOYVERSE_WEBHOOK_SECRET, tenant_id). It used
 * to carry the platform secret itself, which every merchant could read in
 * their own Back Office and replay against any other tenant.
 *
 * On items.update we re-import the whole catalog rather than trusting the
 * batched payload shape — the import is idempotent, and unchanged dishes are
 * skipped, so a re-import costs reads rather than writes.
 *
 * Loyverse retries for 48h and then disables the webhook on persistent
 * non-2xx, so config errors return 200 with an ignored marker.
 */
// items.update re-imports the whole catalog; give it the reconcile route's
// budget rather than the lambda default.
export const maxDuration = 300

const inventoryLevelSchema = z.object({
  variant_id: z.string().min(1),
  store_id: z.string().min(1),
  in_stock: z.number().nullable().optional(),
})

const webhookBodySchema = z.object({
  type: z.string().optional(),
  inventory_levels: z.array(z.unknown()).optional(),
})

export async function POST(request: NextRequest) {
  const tenantId = request.nextUrl.searchParams.get('tenant_id')
  const signature = request.nextUrl.searchParams.get('sig')
  if (!isValidLoyverseWebhookSignature(process.env.LOYVERSE_WEBHOOK_SECRET, tenantId, signature)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const verifiedTenantId = tenantId as string

  const parsed = webhookBodySchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  const { type: eventType, inventory_levels: inventoryLevels } = parsed.data

  const admin = createAdminClient()
  const tenant = await loadLoyverseTenant(admin, verifiedTenantId).catch(() => null)
  if (!tenant) {
    // 200 so Loyverse does not retry a permanently wrong registration for 48h.
    return NextResponse.json({ ignored: true, reason: 'tenant not found' })
  }
  if (!tenant.loyverse_enabled) {
    return NextResponse.json({ ignored: true, reason: 'loyverse disabled' })
  }

  if (eventType === 'items.update') {
    const report = await importLoyverseCatalog(tenant)
    return NextResponse.json({
      ok: report.success,
      itemsCreated: report.itemsCreated,
      itemsUpdated: report.itemsUpdated,
      warnings: report.warnings.length,
    })
  }

  if (eventType === 'inventory_levels.update' && inventoryLevels) {
    if (!tenant.loyverse_store_id) {
      return NextResponse.json({ ignored: true, reason: 'no store mapped' })
    }
    const levels = inventoryLevels.flatMap((level) => {
      const result = inventoryLevelSchema.safeParse(level)
      return result.success ? [result.data] : []
    })
    const { applyLoyverseInventoryLevels } = await import('@/lib/loyverse/inventory-sync')
    const outcome = await applyLoyverseInventoryLevels(verifiedTenantId, tenant.loyverse_store_id, levels)
    // The menu is ISR (revalidate = 300), so without this a dish stays
    // orderable for up to five minutes after Loyverse says it is dry.
    if ((outcome.disabled > 0 || outcome.restored > 0) && tenant.slug) {
      const { revalidatePath } = await import('next/cache')
      revalidatePath(`/${tenant.slug}/menu`)
      revalidatePath(`/${tenant.slug}/admin/menu`)
    }
    return NextResponse.json({ ok: true, ...outcome })
  }

  return NextResponse.json({ ignored: true, reason: `unhandled event ${eventType ?? 'unknown'}` })
}
