import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { withRequestBearer } from '@/lib/supabase/bearer-session'
import { resolveApprovalsCaller } from '@/lib/approvals/access'
import { decisionSchema, firstIssue } from '@/lib/approvals/schemas'
import { decideApproval } from '@/lib/approvals/service'
import { badRequest, buildApprovalsContext, readJson, respond, serverError } from '@/lib/approvals/route-kit'

/**
 * POST /api/approvals/:id/decision { tenantId, decision: approve|decline, reasonCode?, note?, amountOverride? }
 *
 * Approve runs the execution in the SAME database transaction (refund rows,
 * R-number, order change, voucher release) after a compare-and-set out of
 * `pending`, so a double tap, a second approver or a replay can never apply
 * it twice. The approver must differ from the requester unless they own the
 * store, reach the request's branch, and hold a limit that covers it.
 */
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

export function POST(request: NextRequest, context: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  return withRequestBearer(request, () => handle(request, context))
}

async function handle(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const { id } = await params
  const parsed = decisionSchema.safeParse(await readJson(request))
  if (!parsed.success) return badRequest(firstIssue(parsed.error))
  if (!z.string().uuid().safeParse(id).success) return badRequest('Invalid request.')

  const caller = await resolveApprovalsCaller(request, parsed.data.tenantId)
  if (!caller.ok) return caller.response
  try {
    return respond(await decideApproval(buildApprovalsContext(caller.actor, caller.tenantId), id, parsed.data))
  } catch (error) {
    return serverError('decision', error)
  }
}
