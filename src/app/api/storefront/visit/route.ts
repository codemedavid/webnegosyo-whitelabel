import { NextRequest, NextResponse } from 'next/server'
import { getCachedTenantBySlug } from '@/lib/cache'
import { checkRateLimit, type RateLimitOptions } from '@/lib/distributed-rate-limit'
import { getClientIP } from '@/lib/rate-limit'
import { createAdminClient } from '@/lib/supabase/admin'
import { isLikelyBot, parseVisitRequest } from '@/lib/storefront/visit-request'

/**
 * POST /api/storefront/visit  { slug }
 *
 * Counts one storefront open for the owner's Start here page. Public, so:
 * the browser sends it at most once per session; crawlers are ignored; each
 * IP may count a store only so often (generous, because Philippine carriers
 * put many phones behind one address); pre-launch and unknown stores are
 * ignored before any rate-limit key is written. Always answers 204 — a visitor
 * never waits on, or learns from, it.
 *
 * The count is ADVISORY: a determined script can still inflate it, so it is
 * shown to the owner as encouragement and must never tick a step or gate
 * anything on its own.
 */

const RATE_LIMIT: RateLimitOptions = { limit: 30, windowSec: 60 * 60, onRedisFailure: 'instance' }
const MAX_BODY_BYTES = 512
const noContent = (): NextResponse => new NextResponse(null, { status: 204 })

async function readBody(request: NextRequest): Promise<unknown> {
  try {
    const text = await request.text()
    return text.length > MAX_BODY_BYTES ? null : JSON.parse(text)
  } catch {
    return null
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const visit = parseVisitRequest(await readBody(request))
  if (!visit || isLikelyBot(request.headers.get('user-agent'))) return noContent()

  // Without an address every such caller would share one bucket and could
  // starve a store's real visits; those requests are simply not counted.
  const ip = getClientIP(request)
  if (!ip) return noContent()

  const tenant = await getCachedTenantBySlug(visit.slug)
  if (!tenant || tenant.is_prelaunch === true) return noContent()

  const rate = await checkRateLimit(`storefront-visit:${tenant.id}:${ip}`, RATE_LIMIT)
  if (!rate.allowed) return noContent()

  const { error } = await createAdminClient().rpc('record_storefront_visit', { p_tenant_id: tenant.id })
  if (error) console.error('[storefront-visit] could not record a visit', { tenantId: tenant.id, error: error.message })
  return noContent()
}
