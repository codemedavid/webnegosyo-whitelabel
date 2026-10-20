import { NextRequest, NextResponse } from 'next/server'
import { withRequestBearer } from '@/lib/supabase/bearer-session'
import { resolveApprovalsCaller } from '@/lib/approvals/access'
import { createApprovalSchema, firstIssue, listQuerySchema } from '@/lib/approvals/schemas'
import { createApproval, listApprovals } from '@/lib/approvals/service'
import { badRequest, buildApprovalsContext, readJson, respond, serverError } from '@/lib/approvals/route-kit'

/**
 * GET  /api/approvals?tenantId=…&status=pending|mine|recent
 *   Approvers (owner / approve_requests) see the requests their branch reach
 *   covers; everyone else sees their own.
 * POST /api/approvals
 *   File a refund / cancel-paid / discount / write-off. Within the caller's
 *   own limit it is done at once (route: 'direct'); otherwise it waits for an
 *   approver and they are notified. `idempotencyKey` makes a double tap one
 *   request. Platform-backend stores only for order kinds.
 */
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

export function GET(request: NextRequest): Promise<NextResponse> {
  return withRequestBearer(request, () => handleList(request))
}

export function POST(request: NextRequest): Promise<NextResponse> {
  return withRequestBearer(request, () => handleCreate(request))
}

async function handleList(request: NextRequest): Promise<NextResponse> {
  const parsed = listQuerySchema.safeParse({
    tenantId: request.nextUrl.searchParams.get('tenantId') ?? undefined,
    status: request.nextUrl.searchParams.get('status') ?? undefined,
  })
  if (!parsed.success) return badRequest(firstIssue(parsed.error))

  const caller = await resolveApprovalsCaller(request, parsed.data.tenantId)
  if (!caller.ok) return caller.response
  try {
    return respond(await listApprovals(buildApprovalsContext(caller.actor, caller.tenantId), parsed.data.status))
  } catch (error) {
    return serverError('list', error)
  }
}

async function handleCreate(request: NextRequest): Promise<NextResponse> {
  const parsed = createApprovalSchema.safeParse(await readJson(request))
  if (!parsed.success) return badRequest(firstIssue(parsed.error))

  const caller = await resolveApprovalsCaller(request, parsed.data.tenantId, 'write')
  if (!caller.ok) return caller.response
  try {
    return respond(await createApproval(buildApprovalsContext(caller.actor, caller.tenantId), parsed.data))
  } catch (error) {
    return serverError('create', error)
  }
}
