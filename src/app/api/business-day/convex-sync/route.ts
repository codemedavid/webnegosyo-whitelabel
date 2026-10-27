import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getRequestCaller } from '@/lib/auth/request-caller'
import { syncTenantConvexConfig } from '@/lib/convex-config-sync'
import { checkRateLimit, type RateLimitOptions } from '@/lib/distributed-rate-limit'
import { canAccessStoreAdmin } from '@/lib/platform-staff/permissions'
import { hasPermission } from '@/lib/staff-permissions'
import { withRequestBearer } from '@/lib/supabase/bearer-session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const NO_STORE = { 'Cache-Control': 'no-store, max-age=0' }
const BURST: RateLimitOptions = { limit: 10, windowSec: 60, onRedisFailure: 'instance' }
const bodySchema = z.object({ tenantId: z.uuid() }).strict()

function reply(body: Record<string, unknown>, status: number): NextResponse {
  return NextResponse.json(body, { status, headers: NO_STORE })
}

/**
 * POST /api/business-day/convex-sync `{ tenantId }` → `{ status }`.
 *
 * The merchant app changes the business-day cutoff with a direct RPC
 * (`set_business_day_cutoff`), but a Convex store numbers its orders in its
 * own deployment, which only the web can write (deploy key). The app calls
 * this after a successful change; it re-pushes the STORED schedule
 * (`syncTenantConvexConfig` reads it from the database), so nothing the caller
 * sends reaches the deployment. Cookie (web) or Bearer (app). Same key as the
 * change itself: `settings`.
 */
export function POST(request: NextRequest): Promise<NextResponse> {
  return withRequestBearer(request, () => handle(request))
}

async function handle(request: NextRequest): Promise<NextResponse> {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return reply({ error: 'Send the store id.' }, 400)
  const { tenantId } = parsed.data

  const { user, appUser } = await getRequestCaller()
  if (!user) return reply({ error: 'Unauthorized' }, 401)
  if (!appUser || !canAccessStoreAdmin(appUser, tenantId, 'edit') || !hasPermission(appUser, 'settings')) {
    return reply({ error: "You can't change this store's business day." }, 403)
  }
  if (!(await checkRateLimit(`business-day-convex-sync:${user.id}`, BURST)).allowed) {
    return reply({ error: 'Too many requests. Try again in a minute.' }, 429)
  }

  const result = await syncTenantConvexConfig(tenantId)
  if (result.status === 'failed') {
    console.error('[business-day/convex-sync] push failed', { tenantId, error: result.error })
    return reply({ status: 'failed', error: "The store's app backend did not pick up the change yet." }, 502)
  }
  return reply({ status: result.status }, 200)
}
