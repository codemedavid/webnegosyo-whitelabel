import { NextRequest } from 'next/server'
import { timingSafeEqual } from 'node:crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { processLoyaltyEarningRecovery } from '@/lib/loyalty/earning-recovery-worker'
import { respond } from '@/lib/loyalty/merchant-http'

export const maxDuration = 20

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET
  const received = Buffer.from(request.headers.get('authorization') ?? '')
  const expected = Buffer.from(`Bearer ${secret}`)
  if (!secret || received.length !== expected.length || !timingSafeEqual(received, expected)) return respond({ error: 'Unauthorized' }, 401)
  try {
    return respond({ success: true, ...await processLoyaltyEarningRecovery(createAdminClient({ timeoutMs: 3000 })) }, 200)
  } catch {
    return respond({ error: 'Loyalty earning recovery is unavailable.' }, 503)
  }
}
