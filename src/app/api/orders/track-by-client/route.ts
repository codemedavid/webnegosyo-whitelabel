import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createConvexServerClient } from '@/lib/convex/server'
import { getTenantSecrets } from '@/lib/tenant-secrets'

// QR-handoff order tracking.
//
// The customer's thank-you page polls this endpoint with the order's
// clientOrderId (cid) — an unguessable random UUID that acts as a capability
// token — and the tenant slug. We resolve the tenant's Convex deployment and
// call the public getOrderByClientId query. If the tenant has no Convex
// configured, or the vendor has not yet scanned/accepted the QR, we return
// { found: false }. No auth is required (cid is the capability).

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const cid = searchParams.get('cid')
  const tenantSlug = searchParams.get('tenant')

  if (!cid || !tenantSlug) {
    return NextResponse.json(
      { error: 'Missing required query params: cid and tenant' },
      { status: 400 }
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

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const order = await convex.query<any>('orders:getOrderByClientId', {
      clientOrderId: cid,
    })

    if (!order) {
      return NextResponse.json({ found: false })
    }

    return NextResponse.json({
      found: true,
      status: order.status as string,
      order,
    })
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
