import { NextRequest, NextResponse } from 'next/server'
import { requireBearerStoreCaller } from '@/lib/auth/bearer-caller'
import { revalidatePath } from 'next/cache'
import { readTenantSlugById } from '@/lib/tenant-revalidation'

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

  return NextResponse.json({ success: true })
}
