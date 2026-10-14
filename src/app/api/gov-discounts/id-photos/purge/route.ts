import { NextRequest, NextResponse } from 'next/server'
import { timingSafeEqual } from 'node:crypto'

// Stay well under the edge kill; each batch is bounded by the admin client's budget.
export const maxDuration = 20

function isCron(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  const received = Buffer.from(request.headers.get('authorization') ?? '')
  const expected = Buffer.from(`Bearer ${secret}`)
  return received.length === expected.length && timingSafeEqual(received, expected)
}

/**
 * GET /api/gov-discounts/id-photos/purge — Vercel cron, daily.
 *
 * Deletes every Senior/PWD ID photo 90 days after it was taken: the object
 * through the Storage API, then its row. RLS already stops anyone viewing an
 * expired photo, so a missed run only delays the cleanup.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  if (!isCron(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { createAdminClient, ADMIN_QUERY_TIMEOUT_MS } = await import('@/lib/supabase/admin')
  const { createSupabaseIdPhotoStore } = await import('@/lib/gov-discount-ledger/id-photos/supabase-id-photo-store')
  const { purgeExpiredIdPhotos } = await import('@/lib/gov-discount-ledger/id-photos/purge-service')

  try {
    const store = createSupabaseIdPhotoStore(createAdminClient({ timeoutMs: ADMIN_QUERY_TIMEOUT_MS }))
    const outcome = await purgeExpiredIdPhotos(store, new Date())
    return NextResponse.json({ success: true, ...outcome })
  } catch (error) {
    console.error('[gov-discounts/id-photos/purge] failed', error instanceof Error ? error.message : error)
    return NextResponse.json({ error: 'ID photo purge failed.' }, { status: 503 })
  }
}
