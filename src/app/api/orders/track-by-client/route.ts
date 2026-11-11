import { NextRequest, NextResponse } from 'next/server'
import { createConvexServerClient } from '@/lib/convex/server'
import { checkRateLimit, type RateLimitOptions } from '@/lib/distributed-rate-limit'
import { getClientIP } from '@/lib/rate-limit'
import { createAdminClient } from '@/lib/supabase/admin'
import { getTenantSecrets } from '@/lib/tenant-secrets'

// QR-handoff order tracking.
//
// The customer's thank-you page polls this endpoint with the order's
// clientOrderId (cid) — an unguessable random UUID that acts as a capability
// token — and the tenant slug. We resolve the tenant's Convex deployment and
// call getOrderByClientIdInternal over the deploy key (the client falls back to
// the public name on a deployment older than v40). If the tenant has no Convex
// configured, or the vendor has not yet scanned/accepted the QR, we return
// { found: false }. No auth is required (cid is the capability), so the answer
// is the status alone: the page reads nothing else, and a guessed or leaked cid
// must not hand over the customer's name, contact or items.

// The page polls every 5s, so one open tab is 12 calls a minute. Generous on
// purpose: a dine-in floor shares one Wi-Fi IP. This guards disclosure, so a
// Redis outage degrades to the per-instance limiter rather than to no limit.
const RATE_LIMIT: RateLimitOptions = { limit: 240, windowSec: 60, onRedisFailure: 'instance' }

/** Longer than any id the checkout mints; anything past it is not a lookup. */
const MAX_CLIENT_ORDER_ID_LENGTH = 128

interface OrderStatusRow {
  status?: unknown
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const cid = searchParams.get('cid')
  const tenantSlug = searchParams.get('tenant')

  if (!cid || !tenantSlug || cid.length > MAX_CLIENT_ORDER_ID_LENGTH) {
    return NextResponse.json(
      { error: 'Missing required query params: cid and tenant' },
      { status: 400 }
    )
  }

  // A request with no readable address still counts: they all share one bucket.
  const ip = getClientIP(request) ?? 'unknown'
  const rate = await checkRateLimit(`track-by-client:${ip}`, RATE_LIMIT)
  if (!rate.allowed) {
    return NextResponse.json(
      { error: 'Too many requests' },
      { status: 429, headers: { 'Retry-After': String(rate.retryAfterSec) } }
    )
  }

  try {
    const supabase = createAdminClient()

    const { data: tenantConfig, error } = await supabase
      .from('tenants')
      .select('id, convex_deployment_url')
      .eq('slug', tenantSlug)
      .maybeSingle()

    if (error || !tenantConfig) {
      return NextResponse.json({ found: false })
    }

    const config = tenantConfig as { id: string; convex_deployment_url: string | null }
    const deployKey = (await getTenantSecrets(supabase, config.id))?.convex_deploy_key

    // Tenant has no Convex backend — order can never be tracked here.
    if (!config.convex_deployment_url || !deployKey) {
      return NextResponse.json({ found: false })
    }

    const convex = createConvexServerClient(config.convex_deployment_url, deployKey)

    const order = await convex.query<OrderStatusRow | null>('orders:getOrderByClientIdInternal', {
      clientOrderId: cid,
    })

    if (!order || typeof order.status !== 'string') {
      return NextResponse.json({ found: false })
    }

    return NextResponse.json({ found: true, status: order.status })
  } catch (err) {
    console.error(
      '[track-by-client] Error:',
      err instanceof Error ? err.message : err
    )
    // Treat tracking failures as "not found yet" so the client keeps polling
    // rather than surfacing an error to the customer.
    return NextResponse.json({ found: false })
  }
}
