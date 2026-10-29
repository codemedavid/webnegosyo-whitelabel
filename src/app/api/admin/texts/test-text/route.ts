/**
 * GET /api/admin/texts/test-text?tenantId=…&id=… — how one owner test text is
 * doing (queued → claimed → sent / failed / expired). Polled every few seconds
 * by the phone card; a route, not a Server Action, so it never holds up Save.
 *
 * Cookie session → `requireTextsAccess` (customers, store-wide). Never cached.
 */

import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { createLogger } from '@/lib/logger'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireTextsAccess } from '@/lib/texts/gate'
import { readTestText } from '@/lib/texts/server/test-text'

export const dynamic = 'force-dynamic'

const log = createLogger('[Texts]', 'DEBUG_SMS_AUTOMATIONS')
const QUERY_TIMEOUT_MS = 8_000
const NO_STORE = { 'Cache-Control': 'no-store' }
const querySchema = z.object({ tenantId: z.uuid(), id: z.uuid() })

function json(body: unknown, status: number): NextResponse {
  return NextResponse.json(body, { status, headers: NO_STORE })
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const parsed = querySchema.safeParse({
    tenantId: request.nextUrl.searchParams.get('tenantId'),
    id: request.nextUrl.searchParams.get('id'),
  })
  if (!parsed.success) return json({ error: 'That request is not valid.' }, 400)
  const tenantId = parsed.data.tenantId.toLowerCase()

  try {
    await requireTextsAccess(tenantId, 'view')
  } catch {
    return json({ error: 'You can’t open texts for this store.' }, 403)
  }

  try {
    const state = await readTestText(createAdminClient({ timeoutMs: QUERY_TIMEOUT_MS }), tenantId, parsed.data.id.toLowerCase())
    if (!state) return json({ error: 'That test text was not found.' }, 404)
    return json({ state, now: new Date().toISOString() }, 200)
  } catch (error) {
    log.error('test text read failed', { tenantId, error: error instanceof Error ? error.message : String(error) })
    return json({ error: 'Couldn’t check the test text just now.' }, 500)
  }
}
