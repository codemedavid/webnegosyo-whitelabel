import { NextRequest, NextResponse } from 'next/server'
import { getTenantMetrics } from '@/lib/queries/tenant-metrics-server'
import { parseTenantMetricsIds } from '@/lib/superadmin/tenant-search'
import {
  NO_STORE_HEADERS,
  requireSuperadminResponse,
} from '@/lib/superadmin/require-superadmin'

/**
 * GET /api/superadmin/tenants/metrics?ids=<uuid>,<uuid>
 *
 * Order metrics for the rows on screen. Separate from the list because it
 * fans out to each Convex-backed tenant's deployment, which can take
 * seconds; the list renders first and the numbers fill in.
 */
export async function GET(request: NextRequest) {
  const denied = await requireSuperadminResponse()
  if (denied) return denied

  const parsed = parseTenantMetricsIds(request.nextUrl.searchParams.get('ids'))
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, data: null, error: parsed.error },
      { status: 400, headers: NO_STORE_HEADERS },
    )
  }

  try {
    const metrics = await getTenantMetrics(parsed.data)
    return NextResponse.json(
      { success: true, data: metrics, error: null },
      { headers: NO_STORE_HEADERS },
    )
  } catch (error) {
    console.error('[superadmin/tenants/metrics] failed:', error)
    return NextResponse.json(
      { success: false, data: null, error: 'Could not load order metrics' },
      { status: 502, headers: NO_STORE_HEADERS },
    )
  }
}
