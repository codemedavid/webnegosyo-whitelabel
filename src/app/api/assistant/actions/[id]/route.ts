import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { checkRateLimit } from '@/lib/distributed-rate-limit'
import { hasPermission } from '@/lib/staff-permissions'
import { resolveAssistantAccess } from '@/lib/assistant/access'
import { BURST_LIMIT } from '@/lib/assistant/config'
import { ACTION_PERMISSION } from '@/lib/assistant/actions/kinds'
import { finishAction, loadAction, moveAction } from '@/lib/assistant/actions/store'
import { executeAction } from '@/lib/assistant/actions/execute'
import { withRequestBearer } from '@/lib/supabase/bearer-session'

/**
 * POST /api/assistant/actions/:id — the owner's Confirm / Cancel tap on a
 * proposal card. No model runs here: the STORED payload is executed through
 * the store's ordinary writers, after a compare-and-set out of `pending` so a
 * double tap, a second tab or a replay can never apply it twice.
 */
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const bodySchema = z.object({
  tenantId: z.string().uuid(),
  decision: z.enum(['confirm', 'cancel']),
})

const NO_STORE = { 'Cache-Control': 'private, no-store' }

function reply(status: number, body: Record<string, unknown>): NextResponse {
  return NextResponse.json(body, { status, headers: NO_STORE })
}

export function POST(request: NextRequest, context: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  // The merchant app authenticates with a bearer token; the writers below then
  // run as that user exactly as they do for a cookie session.
  return withRequestBearer(request, () => handleDecision(request, context))
}

async function handleDecision(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const { id } = await params
  const parsed = bodySchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success || !z.string().uuid().safeParse(id).success) return reply(400, { error: 'Invalid request.' })
  const { tenantId, decision } = parsed.data

  const access = await resolveAssistantAccess(tenantId)
  if (!access.ok) return reply(access.status, { error: access.error })
  const { caller, store } = access

  const burst = await checkRateLimit(`assistant-action:${caller.userId}`, { ...BURST_LIMIT, onRedisFailure: 'instance' })
  if (!burst.allowed) return reply(429, { error: 'One moment — try again shortly.' })

  const action = await loadAction(store.id, id)
  if (!action) return reply(404, { error: 'This proposal could not be found.' })
  if (action.createdBy !== caller.userId) return reply(403, { error: 'Only the person who asked for this can confirm it.' })
  if (!hasPermission(caller, ACTION_PERMISSION[action.kind])) return reply(403, { error: "You don't have permission for this change." })

  if (decision === 'cancel') {
    const moved = await moveAction(store.id, id, 'cancelled', caller.userId)
    return reply(moved ? 200 : 409, moved ? { status: 'cancelled' } : { status: action.status, error: 'This proposal was already handled.' })
  }

  if (!(await moveAction(store.id, id, 'executing', caller.userId))) {
    const isExpired = action.status === 'pending' && Date.parse(action.expiresAt) <= Date.now()
    return reply(409, {
      status: isExpired ? 'expired' : action.status,
      error: isExpired ? 'This proposal expired. Ask again for a fresh one.' : 'This proposal was already handled.',
    })
  }

  const outcome = await executeAction(action, store)
  await finishAction(store.id, id, outcome.ok ? { status: 'applied', resultRef: outcome.resultRef } : { status: 'failed', error: outcome.error })
  return outcome.ok
    ? reply(200, { status: 'applied', message: outcome.message, link: outcome.link ?? null })
    : reply(200, { status: 'failed', error: outcome.error })
}
