import { NextRequest, NextResponse } from 'next/server'
import { getTenants } from '@/lib/queries/tenants-server'
import { parseTenantListQuery } from '@/lib/superadmin/tenant-search'
import {
  NO_STORE_HEADERS,
  requireSuperadminResponse,
} from '@/lib/superadmin/require-superadmin'

/**
 * GET /api/superadmin/tenants?q=&page=&status=&feature=&sort=
 *
 * The superadmin restaurant list. A GET route rather than a Server Action:
 * actions from one page run one at a time, so a slow metrics call used to
 * hold the next search behind it, and an action cannot be aborted when the
 * user keeps typing.
 */
export async function GET(request: NextRequest) {
  const denied = await requireSuperadminResponse()
  if (denied) return denied

  const parsed = parseTenantListQuery(request.nextUrl.searchParams)
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, data: null, error: parsed.error },
      { status: 400, headers: NO_STORE_HEADERS },
    )
  }

  const result = await getTenants(parsed.data)
  if (result.error) {
    return NextResponse.json(
      { success: false, data: null, error: result.error },
      { status: 502, headers: NO_STORE_HEADERS },
    )
  }

  return NextResponse.json(
    { success: true, data: { tenants: result.data, count: result.count }, error: null },
    { headers: NO_STORE_HEADERS },
  )
}
