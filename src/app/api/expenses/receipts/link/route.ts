import { NextRequest, NextResponse } from 'next/server'
import { checkRateLimit, type RateLimitOptions } from '@/lib/distributed-rate-limit'
import { withRequestBearer } from '@/lib/supabase/bearer-session'
import { RECEIPT_BUCKET, RECEIPT_LINK_TTL_SECONDS } from '@/lib/expenses/receipts/rules'
import { NO_STORE_HEADERS, isStoreMember, jsonError, resolveExpenseRouteCaller } from '@/lib/expenses/route-caller'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const BURST: RateLimitOptions = { limit: 120, windowSec: 60, onRedisFailure: 'instance' }
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * GET /api/expenses/receipts/link?id=<receipt id> → `{ url, expiresAt }`.
 *
 * A five-minute link to one receipt. The receipt row is read with the
 * CALLER's session (cookie or Bearer), and its SELECT policy follows the
 * expense's — so whoever can see the expense can open its receipts, and nobody
 * else. Only then does the service role sign the private object.
 */
export function GET(request: NextRequest): Promise<NextResponse> {
  return withRequestBearer(request, () => handleLink(request))
}

async function handleLink(request: NextRequest): Promise<NextResponse> {
  const id = request.nextUrl.searchParams.get('id') ?? ''
  if (!UUID_RE.test(id)) return jsonError('That receipt could not be found.', 400)

  const caller = await resolveExpenseRouteCaller()
  if (!caller) return jsonError('Unauthorized', 401)

  if (!(await checkRateLimit(`expense-receipt-link:${caller.user.id}`, BURST)).allowed) {
    return jsonError('Too many requests. Try again in a minute.', 429)
  }

  try {
    const { data, error } = await caller.db
      .from('expense_receipts')
      .select('id, tenant_id, object_path')
      .eq('id', id)
      .maybeSingle()
    if (error) throw new Error(error.message)
    const receipt = data as { tenant_id: string; object_path: string } | null
    // Not visible and not a member read the same: nothing about another store leaks.
    if (!receipt || !isStoreMember(caller, receipt.tenant_id, 'view')) {
      return jsonError("That receipt isn't available.", 404)
    }

    const { createAdminClient, ADMIN_QUERY_TIMEOUT_MS } = await import('@/lib/supabase/admin')
    const admin = createAdminClient({ timeoutMs: ADMIN_QUERY_TIMEOUT_MS })
    const signed = await admin.storage.from(RECEIPT_BUCKET).createSignedUrl(receipt.object_path, RECEIPT_LINK_TTL_SECONDS)
    if (signed.error || !signed.data?.signedUrl) throw new Error(signed.error?.message ?? 'no signed url')

    const expiresAt = new Date(Date.now() + RECEIPT_LINK_TTL_SECONDS * 1000).toISOString()
    return NextResponse.json({ url: signed.data.signedUrl, expiresAt }, { headers: NO_STORE_HEADERS })
  } catch (failure) {
    console.error('[expenses/receipts/link] failed', { error: failure instanceof Error ? failure.message : String(failure) })
    return jsonError('Could not open the receipt. Try again.', 500)
  }
}
