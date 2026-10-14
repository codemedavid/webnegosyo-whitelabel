/**
 * GET /api/admin/texts/live?tenantId=… — the Texts page's poll (30s; 10s
 * while something is sending). A route, not a Server Action: Next runs a
 * client's actions one at a time, so a poll through an action would hold up
 * the owner's Save.
 *
 * Cookie session → `requireTextsAccess` (customers, store-wide). Never cached.
 */

import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { createLogger } from '@/lib/logger'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireTextsAccess } from '@/lib/texts/gate'
import { readTextsLive } from '@/lib/texts/server/live'

export const dynamic = 'force-dynamic'

const log = createLogger('[Texts]', 'DEBUG_SMS_AUTOMATIONS')
const LIVE_QUERY_TIMEOUT_MS = 8_000
const NO_STORE = { 'Cache-Control': 'no-store' }
const tenantIdSchema = z.uuid()

function json(body: unknown, status: number): NextResponse {
  return NextResponse.json(body, { status, headers: NO_STORE })
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const parsed = tenantIdSchema.safeParse(request.nextUrl.searchParams.get('tenantId'))
  if (!parsed.success) return json({ error: 'That request is not valid.' }, 400)
  const tenantId = parsed.data.toLowerCase()

  try {
    await requireTextsAccess(tenantId, 'view')
  } catch {
    return json({ error: 'You can’t open texts for this store.' }, 403)
  }

  try {
    const live = await readTextsLive(createAdminClient({ timeoutMs: LIVE_QUERY_TIMEOUT_MS }), tenantId, new Date())
    return json(live, 200)
  } catch (error) {
    log.error('live read failed', { tenantId, error: error instanceof Error ? error.message : String(error) })
    return json({ error: 'Couldn’t check your texts just now. Try again.' }, 500)
  }
}
