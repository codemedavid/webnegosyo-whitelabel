import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { setDishAvailability } from '@/lib/inventory/dish-availability-service'
import { revalidateStorefrontMenu } from '@/lib/storefront/revalidate'
import { createAdminClient } from '@/lib/supabase/admin'
import { withRequestBearer } from '@/lib/supabase/bearer-session'

/**
 * POST /api/inventory/dish-availability
 *
 * The merchant app's stock-aware availability switch — the same decision the
 * web menu list makes (`dish-availability-service.ts`): turning on a dish its
 * counted stock can't make answers `needs_confirmation` with the empty
 * ingredients, until the owner re-sends with `sellAnyway: true` ("Sell anyway
 * until end of day").
 *
 * Runs as the caller (`Authorization: Bearer <access token>` or a cookie
 * session): the menu permission check and the RLS write are the ordinary ones.
 * The store comes from the dish itself; a `tenantId` in the body, if sent,
 * must agree.
 *
 *   200 { status: 'saved', isAvailable, snoozedUntil }
 *   200 { status: 'needs_confirmation', blockers: [{ ingredientId, name, onHand, unit }], sellAnywayUntil }
 *   400 / 403 / 404 / 500 { error }
 */
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const NO_STORE = { 'Cache-Control': 'private, no-store' }

const bodySchema = z.object({
  menuItemId: z.string().uuid(),
  isAvailable: z.boolean(),
  sellAnyway: z.boolean().optional(),
  tenantId: z.string().uuid().optional(),
})

export function POST(request: NextRequest): Promise<NextResponse> {
  return withRequestBearer(request, () => handle(request))
}

async function handle(request: NextRequest): Promise<NextResponse> {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request.' }, { status: 400, headers: NO_STORE })
  const { menuItemId, isAvailable, sellAnyway, tenantId: claimedTenant } = parsed.data

  const { data: dish, error: dishError } = await createAdminClient()
    .from('menu_items')
    .select('tenant_id, tenants(slug)')
    .eq('id', menuItemId)
    .maybeSingle()
  if (dishError) {
    console.error('[inventory] dish-availability: dish read failed', menuItemId, dishError.message)
    return NextResponse.json({ error: 'Could not update the dish. Please try again.' }, { status: 500, headers: NO_STORE })
  }
  const row = dish as { tenant_id: string; tenants: { slug: string } | null } | null
  if (!row || (claimedTenant && claimedTenant !== row.tenant_id)) {
    return NextResponse.json({ error: 'Dish not found.' }, { status: 404, headers: NO_STORE })
  }

  try {
    const result = await setDishAvailability({ tenantId: row.tenant_id, menuItemId, isAvailable, sellAnyway })
    if (result.status === 'saved' && row.tenants?.slug) revalidateStorefrontMenu(row.tenants.slug)
    return NextResponse.json(result, { headers: NO_STORE })
  } catch (error) {
    const message = error instanceof Error ? error.message : ''
    if (message.startsWith('Unauthorized')) {
      return NextResponse.json({ error: 'You do not have permission to change the menu.' }, { status: 403, headers: NO_STORE })
    }
    console.error('[inventory] dish-availability failed', menuItemId, error)
    return NextResponse.json({ error: 'Could not update the dish. Please try again.' }, { status: 500, headers: NO_STORE })
  }
}
