import { NextRequest, NextResponse } from 'next/server'
import { timingSafeEqual } from 'node:crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { runOrderStockSweep } from '@/lib/inventory/order-stock-sweep'

/**
 * Vercel cron, every 10 minutes: retry the stock write of web and customer-app
 * orders whose deduction failed. See `order-stock-sweep.ts` for what is (and is
 * deliberately not) swept. Vercel calls GET; POST exists for a manual run with
 * the same secret.
 */
export const maxDuration = 60

function isAuthorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  const received = Buffer.from(request.headers.get('authorization') ?? '')
  const expected = Buffer.from(`Bearer ${secret}`)
  return Boolean(secret) && received.length === expected.length && timingSafeEqual(received, expected)
}

async function handle(request: NextRequest): Promise<NextResponse> {
  if (!isAuthorized(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    // Timed client: every store shares this database, so a slow query must abort.
    const summary = await runOrderStockSweep(createAdminClient({ timeoutMs: 8000 }))
    return NextResponse.json({ success: true, ...summary })
  } catch (error) {
    console.error('[inventory] Order stock sweep failed', error)
    return NextResponse.json({ error: 'The stock sweep is unavailable.' }, { status: 503 })
  }
}

export const GET = handle
export const POST = handle
