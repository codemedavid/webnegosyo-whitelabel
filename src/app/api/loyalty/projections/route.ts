import { NextRequest, NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  authenticateMerchant,
  hasExactKeys,
  isUuid,
  readBody,
  respond,
} from '@/lib/loyalty/merchant-http'
import { hasPermission } from '@/lib/staff-permissions'

export async function GET(request: NextRequest) {
  const tenantId = request.nextUrl.searchParams.get('tenantId')
  if (!isUuid(tenantId)) return respond({ error: 'Invalid tenant.' }, 400)
  try {
    const auth = await authenticateMerchant(request, tenantId.toLowerCase())
    if (!auth.ok) return auth.response
    if (!hasPermission(auth.member, 'loyalty_manage'))
      return respond({ error: 'Forbidden' }, 403)
    const admin: SupabaseClient = createAdminClient()
    const { data, error } = await admin
      .from('loyalty_pos_projection_jobs')
      .select('id,settlement_id,status,attempts,created_at')
      .eq('tenant_id', tenantId.toLowerCase())
      .in('status', ['pending', 'claimed', 'failed'])
      .order('created_at')
      .limit(50)
    if (error) throw error
    return respond({ jobs: data ?? [] }, 200)
  } catch {
    return respond({ error: 'Sale sync status is unavailable.' }, 503)
  }
}

export async function POST(request: NextRequest) {
  const body = await readBody(request)
  if (body instanceof NextResponse) return body
  if (!hasExactKeys(body, { tenantId: isUuid, jobId: isUuid }))
    return respond({ error: 'Invalid sync request.' }, 400)
  try {
    const tenantId = (body.tenantId as string).toLowerCase()
    const auth = await authenticateMerchant(request, tenantId)
    if (!auth.ok) return auth.response
    if (!hasPermission(auth.member, 'loyalty_manage'))
      return respond({ error: 'Forbidden' }, 403)
    const admin: SupabaseClient = createAdminClient()
    const { data, error } = await admin.rpc('retry_loyalty_pos_projection', {
      p_tenant_id: tenantId,
      p_actor: auth.userId,
      p_job_id: (body.jobId as string).toLowerCase(),
    })
    if (error) throw error
    return respond({ scheduled: data === true }, 200)
  } catch {
    return respond(
      { error: 'Could not schedule sale sync. Please retry.' },
      503,
    )
  }
}
