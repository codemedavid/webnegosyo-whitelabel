import { NextRequest } from 'next/server'
import { timingSafeEqual } from 'node:crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { respond } from '@/lib/loyalty/merchant-http'
import { runAutomationTick } from '@/lib/sms-automations/server/tick'

/** Vercel cron, every 5 minutes: queue texts for guests who just started to qualify. */
export const maxDuration = 60

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET
  const received = Buffer.from(request.headers.get('authorization') ?? '')
  const expected = Buffer.from(`Bearer ${secret}`)
  if (!secret || received.length !== expected.length || !timingSafeEqual(received, expected)) return respond({ error: 'Unauthorized' }, 401)
  try {
    return respond({ success: true, ...await runAutomationTick({ client: createAdminClient({ timeoutMs: 8000 }) }) }, 200)
  } catch {
    return respond({ error: 'SMS automations are unavailable.' }, 503)
  }
}
