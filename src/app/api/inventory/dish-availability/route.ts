import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getRequestCaller } from '@/lib/auth/request-caller'
import { checkRateLimit, type RateLimitOptions } from '@/lib/distributed-rate-limit'
import { setDishAvailability } from '@/lib/inventory/dish-availability-service'
import { canAccessStoreAdmin } from '@/lib/platform-staff/permissions'
import { hasPermission } from '@/lib/staff-permissions'
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
 *
 * Order matters (2026-11-04 review): the caller is authenticated, counted per
 * person, and checked for `menu` on the store (`tenantId` in the body, else
 * their own) BEFORE the one service-role read, and that read is confined to
 * that store. An unknown dish, another store's dish and a missing permission
 * all answer the SAME 403, so the route is no oracle for which dish ids exist.
 *
 *   200 { status: 'saved', isAvailable, snoozedUntil }
 *   200 { status: 'needs_confirmation', blockers: [{ ingredientId, name, onHand, unit }], sellAnywayUntil }
 *   400 / 401 / 403 / 429 / 500 { error }
 */
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const NO_STORE = { 'Cache-Control': 'private, no-store' }

/** A person flipping dishes by hand; far above any real menu session. */
const RATE_LIMIT: RateLimitOptions = { limit: 60, windowSec: 60, onRedisFailure: 'instance' }

const REFUSED = 'You do not have permission to change this dish.'

const bodySchema = z.object({
  menuItemId: z.string().uuid(),
  isAvailable: z.boolean(),
  sellAnyway: z.boolean().optional(),
  tenantId: z.string().uuid().optional(),
})

export function POST(request: NextRequest): Promise<NextResponse> {
  return withRequestBearer(request, () => handle(request))
}

function refused(): NextResponse {
  return NextResponse.json({ error: REFUSED }, { status: 403, headers: NO_STORE })
}

function failed(): NextResponse {
  return NextResponse.json({ error: 'Could not update the dish. Please try again.' }, { status: 500, headers: NO_STORE })
}

type Caller = NonNullable<Awaited<ReturnType<typeof getRequestCaller>>['appUser']>

function mayEditMenu(appUser: Caller, tenantId: string): boolean {
  return canAccessStoreAdmin(appUser, tenantId, 'edit') && hasPermission(appUser, 'menu')
}

/** Platform-level accounts only: for them store access does not depend on which store. */
function mayEditAnyStore(appUser: Caller): boolean {
  return appUser.role !== 'admin' && mayEditMenu(appUser, ANY_STORE)
}

const ANY_STORE = '00000000-0000-0000-0000-000000000000'

async function handle(request: NextRequest): Promise<NextResponse> {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request.' }, { status: 400, headers: NO_STORE })
  const { menuItemId, isAvailable, sellAnyway, tenantId: claimedTenant } = parsed.data

  const { user, appUser } = await getRequestCaller()
  if (!user) return NextResponse.json({ error: 'Sign in to change the menu.' }, { status: 401, headers: NO_STORE })

  const rate = await checkRateLimit(`dish-availability:${user.id}`, RATE_LIMIT)
  if (!rate.allowed) {
    return NextResponse.json(
      { error: 'Too many requests' },
      { status: 429, headers: { ...NO_STORE, 'Retry-After': String(rate.retryAfterSec) } },
    )
  }

  // The same test verifyTenantPermission(tenantId, 'menu') applies, made here
  // so nothing is read with the service role for a caller who would be refused.
  // A store account is confined to its store; a superadmin / platform staff
  // account (no store of its own, the app sends no tenantId) may reach any
  // store, so for it the dish names the store and is checked after the read.
  if (!appUser) return refused()
  const scope = claimedTenant ?? appUser.tenant_id ?? null
  if (scope ? !mayEditMenu(appUser, scope) : !mayEditAnyStore(appUser)) return refused()

  // The FK is named: tenants.hero_featured_product_id also links the two
  // tables, and a bare `tenants(slug)` embed is ambiguous (PGRST201).
  let query = createAdminClient()
    .from('menu_items')
    .select('tenant_id, tenants!menu_items_tenant_id_fkey(slug)')
    .eq('id', menuItemId)
  if (scope) query = query.eq('tenant_id', scope)
  const { data: dish, error: dishError } = await query.maybeSingle()
  if (dishError) {
    console.error('[inventory] dish-availability: dish read failed', menuItemId, dishError.message)
    return failed()
  }
  const row = dish as { tenant_id: string; tenants: { slug: string } | null } | null
  if (!row || !mayEditMenu(appUser, row.tenant_id)) return refused()

  try {
    const result = await setDishAvailability({ tenantId: row.tenant_id, menuItemId, isAvailable, sellAnyway })
    if (result.status === 'saved' && row.tenants?.slug) revalidateStorefrontMenu(row.tenants.slug)
    return NextResponse.json(result, { headers: NO_STORE })
  } catch (error) {
    const message = error instanceof Error ? error.message : ''
    if (message.startsWith('Unauthorized')) return refused()
    console.error('[inventory] dish-availability failed', menuItemId, error)
    return failed()
  }
}
