import { NextRequest, NextResponse } from 'next/server'
import { requireBearerStoreCaller } from '@/lib/auth/bearer-caller'
import { revalidatePath } from 'next/cache'
import { readTenantSlugById } from '@/lib/tenant-revalidation'
import { generateCacheKey, invalidateCache } from '@/lib/redis-cache'

/**
 * POST /api/revalidate-menu
 *
 * The webnegosyo-app mobile admin writes menu_items/categories directly to
 * Supabase, bypassing this app's ISR revalidation. Mobile calls this route
 * after a successful write so the public menu reflects the change immediately
 * instead of waiting out the ISR TTL. Authenticated via the caller's own
 * Supabase access token — same trust level as `verifyTenantAdmin` in
 * `src/lib/admin-service.ts`.
 *
 * Only `tenantId` is trusted input, and only after the caller is authorized
 * for it. The purged slug is read from that tenant's row: a body `tenantSlug`
 * (still sent by older app builds) is ignored, because `[tenant]` would purge
 * every storefront.
 *
 * The admin's menu and category lists are also held in Redis (5 and 10 min),
 * and only the web's own writers drop those entries, so they are dropped here
 * too; otherwise an item edited on the phone shows its old state on the web
 * admin until the entry expires.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const body = await request.json().catch(() => null)
  const tenantId: unknown = body?.tenantId

  if (typeof tenantId !== 'string' || tenantId === '') {
    return NextResponse.json({ error: 'tenantId is required' }, { status: 400 })
  }

  const caller = await requireBearerStoreCaller(request, tenantId, 'view')
  if (!caller.ok) return caller.response
  const { supabase } = caller

  const tenantSlug = await readTenantSlugById(supabase, tenantId)
  if (!tenantSlug) {
    return NextResponse.json({ error: 'Tenant not found' }, { status: 404 })
  }

  revalidatePath(`/${tenantSlug}/menu`)
  revalidatePath(`/${tenantSlug}/menu/item/[itemId]`, 'page')
  await Promise.all([
    invalidateCache(generateCacheKey('menu-items', tenantId)),
    invalidateCache(generateCacheKey('categories', tenantId)),
  ])

  return NextResponse.json({ success: true })
}
