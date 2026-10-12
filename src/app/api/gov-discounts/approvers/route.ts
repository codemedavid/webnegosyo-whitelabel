import { NextRequest, NextResponse } from 'next/server'
import { requireBearerStoreCaller } from '@/lib/auth/bearer-caller'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * GET /api/gov-discounts/approvers?tenantId=…&outletId=…
 *
 * Who may approve a Senior/PWD discount at this branch, for the register's
 * picker: names and whether each has set a PIN. Nothing else about them.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const tenantId = request.nextUrl.searchParams.get('tenantId') ?? ''
  const outletParam = request.nextUrl.searchParams.get('outletId')
  if (!UUID_RE.test(tenantId)) return NextResponse.json({ error: 'A valid tenantId is required.' }, { status: 400 })
  const outletId = outletParam && UUID_RE.test(outletParam) ? outletParam : null

  const caller = await requireBearerStoreCaller(request, tenantId, 'view')
  if (!caller.ok) return caller.response

  const { createAdminClient, ADMIN_QUERY_TIMEOUT_MS } = await import('@/lib/supabase/admin')
  const { createSupabaseApprovalStore } = await import('@/lib/gov-discount-ledger/supabase-approval-store')
  const { listApprovers } = await import('@/lib/gov-discount-ledger/approval-service')

  try {
    const store = createSupabaseApprovalStore(createAdminClient({ timeoutMs: ADMIN_QUERY_TIMEOUT_MS }))
    const approvers = await listApprovers(store, tenantId, outletId)
    return NextResponse.json({ success: true, approvers })
  } catch (error) {
    console.error('[gov-discounts/approvers] failed', error instanceof Error ? error.message : error)
    return NextResponse.json({ error: 'Could not load managers.' }, { status: 500 })
  }
}
