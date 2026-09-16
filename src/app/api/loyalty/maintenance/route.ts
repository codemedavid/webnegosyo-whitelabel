import { NextRequest } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { timingSafeEqual } from 'node:crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { projectLoyaltyReceipts } from '@/lib/loyalty/projection-worker'
import { reconcileLoyaltyRefunds } from '@/lib/loyalty/refund-reconciliation'
import { respond } from '@/lib/loyalty/merchant-http'
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET
  const received = Buffer.from(request.headers.get('authorization') ?? '')
  const expected = Buffer.from(`Bearer ${secret}`)
  if (
    !secret ||
    received.length !== expected.length ||
    !timingSafeEqual(received, expected)
  )
    return respond({ error: 'Unauthorized' }, 401)
  try {
    const admin: SupabaseClient = createAdminClient()
    const { data, error } = await admin.rpc('cleanup_loyalty_data')
    if (error) throw error
    // Existing paid receipts must keep syncing even when new redemption is off.
    const projections = await projectLoyaltyReceipts(admin, 3)
    const refunds = await reconcileLoyaltyRefunds(admin, 5)
    return respond({ success: true, ...data, projections, refunds }, 200)
  } catch {
    return respond({ error: 'Loyalty maintenance failed.' }, 503)
  }
}
